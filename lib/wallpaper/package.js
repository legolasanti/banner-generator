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
 *
 * A cover-fitted photo ships only the part its frame shows: the visible
 * rectangle (object-fit cover + object-position + zoom about that point +
 * flips) is cut out — and flipped — before resizing, and the element is
 * then drawn as a plain fill (plainArtboard). A landscape photo in a tall
 * side strip no longer carries the two thirds nobody sees. Element rotation
 * turns the whole frame, so it does not change which pixels show. Cases
 * that cannot be expressed as one rectangle (contain/fill, a flip that
 * reveals empty space) keep the old path: scaled whole, drawn by CSS.
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
 * The part of the (upright) source a cover-fitted image element shows, in
 * source pixels, exactly as the browser draws it: object-fit cover,
 * object-position posX/posY, then scale(zoom) and the flips with the
 * transform origin at that same position.
 *
 * @returns {{x:number, y:number, w:number, h:number, flipX:boolean, flipY:boolean, scale:number}|null}
 *   null when the frame is not one rectangle of the source (contain/fill,
 *   or a flip that shows empty space). `scale` is CSS px per source px.
 */
function visibleRect(el, iw, ih) {
  if (el.fit !== "cover" || !(iw > 0 && ih > 0) || !(el.w > 0 && el.h > 0)) return null;
  const W = el.w;
  const H = el.h;
  const z = el.zoom || 1;
  const posX = Number.isFinite(el.posX) ? el.posX : 50;
  const posY = Number.isFinite(el.posY) ? el.posY : 50;
  const s = Math.max(W / iw, H / ih);
  const ox = (W - iw * s) * (posX / 100);
  const oy = (H - ih * s) * (posY / 100);
  // The frame [0, size] seen through scale(±z) about the origin p, in the
  // image box: q = p + (v − p) / (±z).
  const span = (p, size, flip) => (flip ? [p - (size - p) / z, p + p / z] : [p - p / z, p + (size - p) / z]);
  const [bx0, bx1] = span(W * (posX / 100), W, !!el.flipX);
  const [by0, by1] = span(H * (posY / 100), H, !!el.flipY);
  const r = { x: (bx0 - ox) / s, y: (by0 - oy) / s, w: (bx1 - bx0) / s, h: (by1 - by0) / s, flipX: !!el.flipX, flipY: !!el.flipY, scale: s * z };
  const EPS = 0.5;
  if (r.x < -EPS || r.y < -EPS || r.x + r.w > iw + EPS || r.y + r.h > ih + EPS) return null;
  return r;
}

/** The source's size after EXIF orientation (what sharp().rotate() gives). */
function uprightSize(meta) {
  const swap = meta.orientation >= 5 && meta.orientation <= 8;
  return swap ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
}

/**
 * Cut the visible rectangle out of the upright source at `k` output px per
 * source px (never more than 1: no enlargement), flipped as shown.
 */
async function cutVisible(sharp, source, size, rect, k) {
  let base = sharp(source).rotate();
  let scale = 1;
  if (k < 1) {
    scale = k;
    const rw = Math.max(1, Math.round(size.width * k));
    const rh = Math.max(1, Math.round(size.height * k));
    base = sharp(await base.resize({ width: rw, height: rh, fit: "fill" }).toBuffer());
    size = { width: rw, height: rh };
  } else {
    base = sharp(await base.toBuffer());
  }
  const left = Math.min(size.width - 1, Math.max(0, Math.round(rect.x * scale)));
  const top = Math.min(size.height - 1, Math.max(0, Math.round(rect.y * scale)));
  const width = Math.max(1, Math.min(size.width - left, Math.round(rect.w * scale)));
  const height = Math.max(1, Math.min(size.height - top, Math.round(rect.h * scale)));
  let pipe = base.extract({ left, top, width, height });
  if (rect.flipX) pipe = pipe.flop();
  if (rect.flipY) pipe = pipe.flip();
  return pipe.toBuffer();
}

/**
 * The artboard as the package draws it: every image that was cut to its
 * frame becomes a plain fill (no position, zoom or flip left to apply).
 */
function plainArtboard(artboard, prepared) {
  const cut = new Set();
  prepared.forEach((item) => {
    if (item.cut) item.elIds.forEach((id) => cut.add(id));
  });
  if (!cut.size) return artboard;
  return Object.assign({}, artboard, {
    elements: artboard.elements.map((el) =>
      cut.has(el.id) ? Object.assign({}, el, { fit: "fill", posX: 50, posY: 50, zoom: 1, flipX: false, flipY: false }) : el
    ),
  });
}

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
    const source = await fsp.readFile(file).catch(() => null);
    if (!source) {
      throw Object.assign(new Error("Et bilde i designet finnes ikke lenger på serveren. Last det opp på nytt."), {
        safe: true,
      });
    }
    const meta = await sharp(source).metadata();
    const upright = uprightSize(meta);
    const rect = visibleRect(el, upright.width, upright.height);
    const zoom = el.zoom || 1;
    const fit = el.fit === "contain" ? "inside" : el.fit === "fill" ? "fill" : "outside";
    const key = rect
      ? [el.asset, "cut", rect.x, rect.y, rect.w, rect.h, rect.flipX, rect.flipY, el.w, el.h].map((v) => (typeof v === "number" ? v.toFixed(2) : v)).join("|")
      : el.asset + "|" + fit + "|" + Math.round(el.w * zoom) + "x" + Math.round(el.h * zoom);
    if (byKey.has(key)) {
      byKey.get(key).elIds.push(el.id);
      continue;
    }
    let alpha = false;
    if (meta.hasAlpha) {
      const stats = await sharp(source).stats();
      alpha = !stats.isOpaque;
    }
    let pipe;
    let sizeAt;
    if (rect) {
      // Output px per source px at the sharpest density, capped at 1.
      const k = Math.min(1, rect.scale * DENSITIES[0]);
      pipe = sharp(await cutVisible(sharp, source, upright, rect, k));
      sizeAt = null; // set from the cut's own size below
    } else {
      sizeAt = (density) => ({
        width: Math.max(1, Math.ceil(el.w * zoom * density)),
        height: Math.max(1, Math.ceil(el.h * zoom * density)),
        fit,
        withoutEnlargement: true,
      });
      pipe = sharp(source).rotate().resize(sizeAt(DENSITIES[0]));
    }
    pipe = alpha ? pipe.ensureAlpha() : pipe.flatten({ background: "#ffffff" }).removeAlpha();
    const base = await pipe.raw().toBuffer({ resolveWithObject: true });
    if (rect) {
      // A lower density scales the cut down evenly (never up).
      const bw = base.info.width;
      const bh = base.info.height;
      sizeAt = (density) => {
        const f = Math.min(1, (el.w * density) / bw);
        return { width: Math.max(1, Math.round(bw * f)), height: Math.max(1, Math.round(bh * f)), fit: "fill" };
      };
    }
    n += 1;
    const item = {
      name: "img/bilde-" + n + (alpha ? ".png" : ".jpg"),
      alpha,
      cut: !!rect,
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

module.exports = { prepareImages, namesFor, plainArtboard, visibleRect, buildCreative, fitImages, trackerMarkup, DENSITIES };
