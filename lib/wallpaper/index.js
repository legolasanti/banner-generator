"use strict";

/* =========================================================================
 * wallpaper/index.js — the Wallpaper export service.
 *
 *   estimate(doc, options) → what each file WILL weigh with these settings,
 *                            plus the encoded image itself so the designer
 *                            can judge the compression at 100 %.
 *   exportAll(doc, options) → the finished files: one image per artboard
 *                            (always — they double as CM360 backup images)
 *                            and, for HTML5, one creative ZIP per artboard.
 *
 * Rendering is the slow part (~1 s per artboard), so the exact-size PNG of an
 * artboard is cached by content: dragging the quality slider or changing the
 * KB limit only re-encodes, it never re-renders.
 * ========================================================================= */

const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const Doc = require("../../public/wallpaper/doc.js");
const Spec = require("../../public/wallpaper/spec.js");
const Render = require("../../public/wallpaper/render.js");
const { createFontSource } = require("../google-fonts");
const { renderArtboard } = require("./renderer");
const pkg = require("./package");

const FORMATS = ["jpg", "png", "auto"];
const SCALES = [1, 1.5, 2];
const RENDER_CACHE_MAX = 8;

class WallpaperError extends Error {
  constructor(message) {
    super(message);
    this.safe = true;
  }
}

function clamp(v, min, max, fallback) {
  const n = Number(v);
  return isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function validUrl(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (!value) return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return /^https?:$/.test(url.protocol) ? url.href : null;
}

/**
 * Everything the client may ask for, clamped to what the service supports.
 * Throws a WallpaperError with a user-facing message on a bad URL.
 */
function normalizeOptions(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const artboards = Array.isArray(o.artboards) ? Spec.ORDER.filter((k) => o.artboards.includes(k)) : [];
  const limits = {};
  Spec.ORDER.forEach((key) => {
    const v = o.limits && o.limits[key];
    limits[key] = v === 0 || v === "0" ? 0 : Math.round(clamp(v, 10, 5000, Spec.DEFAULT_LIMIT_KB));
  });
  const quality = o.quality === "auto" || o.quality == null ? "auto" : Math.round(clamp(o.quality, 30, 100, 85));
  const outputType = o.outputType === "html" ? "html" : "image";

  const clickUrl = validUrl(o.clickUrl);
  if (clickUrl === null) throw new WallpaperError("Klikk-lenken må være en gyldig adresse som starter med https://");
  if (outputType === "html" && !clickUrl) throw new WallpaperError("HTML5-pakken trenger en klikk-lenke (landingsside)");
  const trackerUrl = validUrl(o.trackerUrl);
  if (trackerUrl === null) throw new WallpaperError("Visningsteller-lenken må starte med https://");

  return {
    outputType,
    artboards: artboards.length ? artboards : Spec.ORDER.slice(),
    format: FORMATS.includes(o.format) ? o.format : "auto",
    quality,
    scale: outputType === "html" ? 1 : SCALES.includes(Number(o.scale)) ? Number(o.scale) : 1,
    limits,
    clickUrl,
    trackerUrl,
  };
}

function hash(value) {
  return crypto.createHash("sha1").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

/**
 * @param {Object} deps
 * @param {() => Promise<import("puppeteer").Browser>} deps.getBrowser
 * @param {(task: Function) => Promise} deps.enqueue  the server's render queue
 * @param {Object} deps.imageTools  lib/image.js
 * @param {Object} deps.html5       lib/html5.js
 * @param {string} deps.assetDir
 * @param {string} deps.fontCacheDir
 * @param {Function} [deps.superSample] () => boolean, read per call
 */
function createWallpaperService(deps) {
  const fonts = deps.fontSource || createFontSource({ cacheDir: deps.fontCacheDir });
  const renderCache = new Map();

  async function assertAssets(doc) {
    for (const id of Doc.usedAssets(doc)) {
      const ok = await fsp
        .access(path.join(deps.assetDir, id))
        .then(() => true)
        .catch(() => false);
      if (!ok) throw new WallpaperError("Et bilde i designet finnes ikke lenger på serveren. Last det opp på nytt.");
    }
  }

  async function facesFor(artboard) {
    const used = Doc.usedFaces(artboard);
    const out = [];
    for (const face of used) {
      const got = await fonts.getFace(face);
      out.push(Object.assign({}, got, { text: face.text }));
    }
    return out;
  }

  /** Exact-size PNG of an artboard (cached), plus markup when names are given. */
  async function render(key, artboard, faces, scale, names) {
    const superSample = deps.superSample ? deps.superSample() : true;
    // Names are part of the key: the same artboard with different package
    // names is different markup.
    const cacheKey = hash({ key, artboard, scale, superSample, names: names || null });
    if (renderCache.has(cacheKey)) return renderCache.get(cacheKey);
    const result = await deps.enqueue(async () =>
      renderArtboard(await deps.getBrowser(), {
        size: Spec.get(key),
        artboard,
        faces,
        assetDir: deps.assetDir,
        scale,
        superSample,
        names,
        imageTools: deps.imageTools,
      })
    );
    if (renderCache.size >= RENDER_CACHE_MAX) renderCache.delete(renderCache.keys().next().value);
    const entry = { png: result.png, markup: result.markup };
    renderCache.set(cacheKey, entry);
    return entry;
  }

  async function encodeImage(png, opts, limitKb) {
    const maxBytes = limitKb > 0 ? limitKb * 1024 : 0;
    let image;
    if (opts.quality === "auto") {
      image = await deps.imageTools.encodeToBudget(png, {
        format: opts.format === "jpg" ? "jpeg" : opts.format,
        maxBytes,
        jpegQuality: 95,
      });
    } else {
      image = await deps.imageTools.encodeExact(png, {
        format: opts.format === "png" ? "png" : "jpg",
        quality: opts.quality,
      });
      if (maxBytes && image.bytes > maxBytes) {
        image = Object.assign({}, image, {
          note: "over grensen på " + limitKb + " KB – senk kvaliteten eller velg Auto",
        });
      }
    }
    return image;
  }

  async function htmlCreative(key, artboard, faces, opts, title) {
    const sharp = deps.imageTools.getSharp();
    if (!sharp) throw new WallpaperError("HTML5-eksport krever bildebiblioteket «sharp». Kjør «npm install» på nytt.");
    const spec = Spec.get(key);
    const prepared = await pkg.prepareImages(sharp, artboard, deps.assetDir);
    const { markup } = await render(key, artboard, faces, 1, pkg.namesFor(prepared));
    return pkg.buildCreative({
      sharp,
      imageTools: deps.imageTools,
      html5: deps.html5,
      spec: { width: spec.width, height: spec.height, label: spec.label },
      markup,
      faces,
      prepared,
      baseCss: Render.BASE_CSS,
      hoverCss: Render.HOVER_CSS,
      clickUrl: opts.clickUrl,
      trackerUrl: opts.trackerUrl,
      title,
      maxBytes: opts.limits[key] > 0 ? opts.limits[key] * 1024 : 0,
    });
  }

  function prepare(rawDoc, rawOptions) {
    const doc = Doc.normalizeDoc(rawDoc);
    const opts = normalizeOptions(rawOptions);
    return { doc, opts };
  }

  /**
   * @returns {Promise<{outputType, results: Array<Object>}>}
   */
  async function estimate(rawDoc, rawOptions) {
    const { doc, opts } = prepare(rawDoc, rawOptions);
    await assertAssets(doc);
    const results = [];
    for (const key of opts.artboards) {
      const artboard = doc.artboards[key];
      const faces = await facesFor(artboard);
      const spec = Spec.get(key);
      const limitBytes = opts.limits[key] > 0 ? opts.limits[key] * 1024 : 0;
      if (opts.outputType === "html") {
        const c = await htmlCreative(key, artboard, faces, opts, doc.name);
        results.push({
          key, name: spec.name, bytes: c.bytes, limitBytes, note: c.note,
          breakdown: c.breakdown, files: c.files, density: c.density, quality: c.quality,
        });
      } else {
        const { png } = await render(key, artboard, faces, opts.scale, null);
        const img = await encodeImage(png, opts, opts.limits[key]);
        results.push({
          key, name: spec.name, bytes: img.bytes, limitBytes, note: img.note, ext: img.ext,
          width: Math.round(spec.width * opts.scale), height: Math.round(spec.height * opts.scale),
          preview: "data:" + img.mime + ";base64," + img.buffer.toString("base64"),
        });
      }
    }
    return { outputType: opts.outputType, results };
  }

  /**
   * @returns {Promise<{doc, opts, items: Array<{key, spec, image, html}>}>}
   */
  async function exportAll(rawDoc, rawOptions) {
    const { doc, opts } = prepare(rawDoc, rawOptions);
    await assertAssets(doc);
    const items = [];
    for (const key of opts.artboards) {
      const artboard = doc.artboards[key];
      const faces = await facesFor(artboard);
      const spec = Spec.get(key);
      // The image doubles as the CM360 backup image, which must match the
      // creative's size — so HTML5 runs always get their image at 1×.
      const { png } = await render(key, artboard, faces, opts.scale, null);
      const image = await encodeImage(png, opts, opts.limits[key]);
      const html = opts.outputType === "html" ? await htmlCreative(key, artboard, faces, opts, doc.name) : null;
      items.push({ key, spec, image, html });
    }
    return { doc, opts, items };
  }

  return { estimate, exportAll, normalizeOptions };
}

module.exports = { createWallpaperService, normalizeOptions, WallpaperError };
