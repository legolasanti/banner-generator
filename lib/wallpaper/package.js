"use strict";

/* =========================================================================
 * wallpaper/package.js — build a Wallpaper artboard as an HTML5 creative
 * that fits its KB budget.
 *
 * What goes in the ZIP:
 *   index.html          markup from render.js + its CSS; text stays LIVE text
 *   fonts/*.woff2       each face used, subset to the glyphs actually drawn
 *   img/*.jpg|png       each placed image, resized to the size it is shown at
 *
 * The budget is for the whole ZIP. Markup, CSS and fonts are fixed costs, so
 * the images get what is left, and they are squeezed together: one shared
 * quality, searched from the top down, at the sharpest pixel density that
 * still fits (2× for retina first, then 1.5×, 1.25×, 1×). Dropping density
 * before quality matters — a crisp 1.25× photo beats a smeared 2× one.
 *
 * An image keeps its transparency (palette PNG) only if it actually has
 * transparent pixels; every opaque image becomes a mozjpeg JPEG.
 * ========================================================================= */

const fsp = require("fs/promises");
const path = require("path");

const { faceFileName, fontFaceCss } = require("../google-fonts");

const DENSITIES = [2, 1.5, 1.25, 1];
const Q_TOP = 88;
const Q_FLOOR = 50;
const Q_LAST_RESORT = 38;
const SEARCH_STEPS = 6;
// Local file header + central directory entry, per file, roughly.
const ZIP_ENTRY_OVERHEAD = 120;

/**
 * Work out, once per artboard, which images ship and in what format, and
 * decode each into raw pixels at the largest size that could ship — so the
 * quality search that follows never re-decodes a 10 MB upload.
 */
async function prepareImages(sharp, artboard, assetDir) {
  const prepared = [];
  const byKey = new Map();
  let n = 0;
  for (const el of artboard.elements) {
    if (el.hidden || el.type !== "image") continue;
    const file = path.join(assetDir, el.asset);
    const zoom = el.zoom || 1;
    const fit = el.fit === "contain" ? "inside" : el.fit === "fill" ? "fill" : "outside";
    const key = el.asset + "|" + fit + "|" + Math.round(el.w * zoom) + "x" + Math.round(el.h * zoom);
    if (byKey.has(key)) {
      byKey.get(key).elIds.push(el.id);
      continue;
    }
    const source = await fsp.readFile(file).catch(() => null);
    if (!source) {
      throw Object.assign(new Error("Et bilde i designet finnes ikke lenger på serveren. Last det opp på nytt."), {
        safe: true,
      });
    }
    const meta = await sharp(source).metadata();
    let alpha = false;
    if (meta.hasAlpha) {
      const stats = await sharp(source).stats();
      alpha = !stats.isOpaque;
    }
    const sizeAt = (density) => ({
      width: Math.max(1, Math.ceil(el.w * zoom * density)),
      height: Math.max(1, Math.ceil(el.h * zoom * density)),
      fit,
      withoutEnlargement: true,
    });
    let pipe = sharp(source).rotate().resize(sizeAt(DENSITIES[0]));
    pipe = alpha ? pipe.ensureAlpha() : pipe.flatten({ background: "#ffffff" }).removeAlpha();
    const base = await pipe.raw().toBuffer({ resolveWithObject: true });
    n += 1;
    const item = {
      name: "img/bilde-" + n + (alpha ? ".png" : ".jpg"),
      alpha,
      elIds: [el.id],
      raw: { data: base.data, width: base.info.width, height: base.info.height, channels: base.info.channels },
      sizeAt,
    };
    byKey.set(key, item);
    prepared.push(item);
  }
  return prepared;
}

/** element id → package file name, for the markup rewrite. */
function namesFor(prepared) {
  const names = {};
  prepared.forEach((item) => item.elIds.forEach((id) => (names[id] = item.name)));
  return names;
}

function encodeOne(sharp, imageTools, item, density, quality) {
  const r = item.raw;
  let pipe = sharp(r.data, { raw: { width: r.width, height: r.height, channels: r.channels } });
  if (density !== DENSITIES[0]) pipe = pipe.resize(item.sizeAt(density));
  if (item.alpha) {
    return pipe.png({ palette: true, quality, effort: 10, compressionLevel: 9 }).toBuffer();
  }
  return pipe.jpeg(imageTools.jpegOptions(quality)).toBuffer();
}

async function encodeAll(sharp, imageTools, prepared, density, quality) {
  const out = [];
  for (const item of prepared) {
    out.push({ name: item.name, buffer: await encodeOne(sharp, imageTools, item, density, quality) });
  }
  return out;
}

const sumBytes = (files) => files.reduce((s, f) => s + f.buffer.length + ZIP_ENTRY_OVERHEAD, 0);

/**
 * The images at the best density/quality that keeps the ZIP under budget.
 * `room` is what is left for images after the fixed files.
 *
 * @returns {Promise<{files: Array, density: number, quality: number, fits: boolean}>}
 */
async function fitImages(sharp, imageTools, prepared, room) {
  if (!prepared.length) return { files: [], density: 1, quality: Q_TOP, fits: room >= 0 };
  if (!(room > 0) && room !== Infinity) {
    const files = await encodeAll(sharp, imageTools, prepared, 1, Q_LAST_RESORT);
    return { files, density: 1, quality: Q_LAST_RESORT, fits: false };
  }
  for (const density of DENSITIES) {
    const top = await encodeAll(sharp, imageTools, prepared, density, Q_TOP);
    if (sumBytes(top) <= room) return { files: top, density, quality: Q_TOP, fits: true };
    let lo = Q_FLOOR;
    let hi = Q_TOP - 1;
    let best = null;
    for (let i = 0; i < SEARCH_STEPS && lo <= hi; i++) {
      const q = Math.round((lo + hi) / 2);
      const files = await encodeAll(sharp, imageTools, prepared, density, q);
      if (sumBytes(files) <= room) {
        best = { files, density, quality: q, fits: true };
        lo = q + 1;
      } else {
        hi = q - 1;
      }
    }
    if (best) return best;
  }
  const files = await encodeAll(sharp, imageTools, prepared, 1, Q_LAST_RESORT);
  return { files, density: 1, quality: Q_LAST_RESORT, fits: sumBytes(files) <= room };
}

function trackerMarkup(trackerUrl) {
  if (!trackerUrl) return "";
  const safe = String(trackerUrl)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return (
    '<img src="' + safe + '" width="1" height="1" alt="" ' +
    'style="position:absolute;left:-10px;top:-10px;width:1px;height:1px;border:0">'
  );
}

/**
 * Build one artboard's HTML5 ZIP within `maxBytes` (0 = no limit).
 *
 * @returns {Promise<{zip: Buffer, bytes: number, note: string,
 *   breakdown: {html:number, fonts:number, images:number}, files: Array<{name,bytes}>,
 *   density: number, quality: number}>}
 */
async function buildCreative(p) {
  const { sharp, imageTools, html5, spec, markup, faces, prepared, clickUrl, trackerUrl, title } = p;
  const maxBytes = p.maxBytes > 0 ? p.maxBytes : 0;

  const fonts = faces.map((face) => ({ name: "fonts/" + faceFileName(face), buffer: face.buffer }));
  const css = [
    p.baseCss,
    p.hoverCss,
    fontFaceCss(faces, (face) => "fonts/" + faceFileName(face)),
  ].join("\n");
  const indexHtml = html5.buildIndexHtml(spec, markup + trackerMarkup(trackerUrl), css, clickUrl, title);
  const fixed = [{ name: "index.html", buffer: Buffer.from(indexHtml, "utf8") }].concat(fonts);

  const fixedZip = await html5.zipToBuffer(fixed);
  const room = maxBytes ? maxBytes - fixedZip.length - 64 : Infinity;
  let fitted = await fitImages(sharp, imageTools, prepared, room);
  let zip = await html5.zipToBuffer(fixed.concat(fitted.files));

  // The estimate above is per-entry; the real ZIP can land a hair over. One
  // corrective pass with the overshoot taken off the image room.
  if (maxBytes && zip.length > maxBytes && prepared.length && fitted.fits) {
    fitted = await fitImages(sharp, imageTools, prepared, room - (zip.length - maxBytes) - 512);
    zip = await html5.zipToBuffer(fixed.concat(fitted.files));
  }

  const fontBytes = fonts.reduce((s, f) => s + f.buffer.length, 0);
  const imageBytes = fitted.files.reduce((s, f) => s + f.buffer.length, 0);
  let note = "";
  if (maxBytes && zip.length > maxBytes) {
    note =
      prepared.length && fixedZip.length < maxBytes
        ? "kom ikke under " + Math.round(maxBytes / 1024) + " KB selv med sterkest komprimering – bruk færre/mindre bilder"
        : "tekst, skrifter og markup alene veier " + Math.round(fixedZip.length / 1024) + " KB – bruk færre skrifter/snitt";
  } else if (prepared.length && fitted.density < 2) {
    note = "bildene er lagt inn i " + String(fitted.density).replace(".", ",") + "× oppløsning for å holde grensen";
  }

  return {
    zip,
    bytes: zip.length,
    note,
    density: fitted.density,
    quality: fitted.quality,
    breakdown: { html: Buffer.byteLength(indexHtml), fonts: fontBytes, images: imageBytes },
    files: fixed.concat(fitted.files).map((f) => ({ name: f.name, bytes: f.buffer.length })),
  };
}

module.exports = { prepareImages, namesFor, buildCreative, fitImages, trackerMarkup, DENSITIES };
