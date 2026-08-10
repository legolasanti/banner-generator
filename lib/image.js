"use strict";

/* =========================================================================
 * image.js — turning a raw Puppeteer screenshot into the file we ship.
 *
 * Two jobs, both about the same complaint: "the banners look worse than
 * Canva, and every file has to stay under 200 KB".
 *
 *   1. Downscale a SUPERSAMPLED screenshot to the exact banner size with a
 *      Lanczos-3 kernel. Chrome rasterises a big source photo into a small
 *      box with a cheap filter, which is where the softness/aliasing comes
 *      from; rendering 2× larger and resampling properly fixes it, which is
 *      what design tools do internally.
 *   2. Encode down to a byte budget without falling off a quality cliff:
 *      lossless PNG → 256-colour PNG → mozjpeg with 4:4:4 chroma (never
 *      4:2:0 — this artwork is small black text and a saturated multicolour
 *      mark on white, exactly what chroma subsampling smears).
 *
 * sharp is an OPTIONAL dependency: if it is missing (a colleague's npm
 * install fell over on the native binary) every function here degrades to a
 * documented no-op and server.js falls back to Chrome's own encoders, so the
 * tool still works — just without the budget guarantee.
 * ========================================================================= */

let sharp = null;
let sharpError = null;
try {
  sharp = require("sharp");
} catch (err) {
  sharpError = (err && err.message) || String(err);
}

const JPEG_FLOOR = 55; // below this, text edges start to visibly break up
const JPEG_LAST_RESORT = 40; // only when the alternative is missing the budget
const JPEG_CEIL = 95; // above this, file size explodes for no visible gain
const SEARCH_STEPS = 6; // binary search over [floor, ceil] → ±0.6 quality points
const PHOTO_QUALITY = 86; // starting quality for the photo inside an HTML5 package
// Retina first, then step the photo's pixel size down when the budget is tight.
const PHOTO_SCALES = [2, 1.5, 1.25, 1];

const isAvailable = () => sharp !== null;

/** Why sharp is unavailable, for logging/UI. Empty string when it is fine. */
const unavailableReason = () => (sharp ? "" : sharpError || "sharp er ikke installert");

function jpegOptions(quality) {
  return {
    quality,
    mozjpeg: true,
    // 4:4:4 keeps full colour resolution. The default 4:2:0 halves it and is
    // what makes small coloured text and the Norsk Tipping mark look muddy.
    chromaSubsampling: "4:4:4",
    trellisQuantisation: true,
    overshootDeringing: true,
    optimiseScans: true,
  };
}

/**
 * Resize a supersampled screenshot down to the exact output size.
 * Returns the input untouched when it is already the right size or sharp is
 * unavailable, so callers never have to branch.
 *
 * @param {Buffer} buffer PNG screenshot
 * @param {number} width  exact target width in px
 * @param {number} height exact target height in px
 * @returns {Promise<Buffer>}
 */
async function downscale(buffer, width, height) {
  if (!sharp) return buffer;
  const meta = await sharp(buffer).metadata();
  if (meta.width === width && meta.height === height) return buffer;
  return sharp(buffer)
    .resize({ width, height, fit: "fill", kernel: "lanczos3" })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

/**
 * Encode a banner to the smallest file that still looks right, staying inside
 * `maxBytes` when one is set.
 *
 * Order of preference: keep it lossless if it fits, then a quantised PNG, then
 * mozjpeg at the highest quality that fits. `format` is a PREFERENCE, not a
 * guarantee — the byte budget wins, because a 1.2 MB PNG that the ad server
 * rejects is worth less than a 190 KB JPEG that runs. Any such switch is
 * reported back in `note` so the UI can say so out loud.
 *
 * @param {Buffer} png raw PNG at the exact output size
 * @param {{format?: "png"|"jpeg"|"auto", maxBytes?: number, jpegQuality?: number}} opts
 * @returns {Promise<{buffer: Buffer, ext: string, mime: string, bytes: number, note: string}>}
 */
async function encodeToBudget(png, opts) {
  const options = opts || {};
  const format = options.format === "jpeg" ? "jpeg" : options.format === "png" ? "png" : "auto";
  const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : 0;
  const askedQuality = Math.max(JPEG_FLOOR, Math.min(100, Number(options.jpegQuality) || 92));

  const asPng = (buffer) => ({ buffer, ext: "png", mime: "image/png", bytes: buffer.length, note: "" });
  const asJpeg = (buffer) => ({ buffer, ext: "jpg", mime: "image/jpeg", bytes: buffer.length, note: "" });

  // ---- No sharp: hand back whatever Chrome produced, and be honest about it.
  //      The extension follows the BUFFER, not the request, so a fallback file
  //      can never end up as a PNG wearing a .jpg name.
  if (!sharp) {
    const isJpegBuffer = png.length > 2 && png[0] === 0xff && png[1] === 0xd8;
    const out = isJpegBuffer ? asJpeg(png) : asPng(png);
    if (maxBytes && out.bytes > maxBytes) {
      out.note = "over " + Math.round(maxBytes / 1024) + " KB (sharp mangler – kan ikke komprimere)";
    }
    return out;
  }

  const source = () => sharp(png).flatten({ background: "#ffffff" });
  const fits = (buf) => !maxBytes || buf.length <= maxBytes;

  // ---- 1. Lossless PNG. Best possible quality; often fits for the small
  //         formats and for artwork-like photos.
  if (format !== "jpeg") {
    const lossless = await source().png({ compressionLevel: 9, effort: 10 }).toBuffer();
    if (fits(lossless)) return asPng(lossless);

    // ---- 2. 256-colour PNG. Still sharp on text; only a photo-heavy banner
    //         shows the banding, and it frequently lands well under budget.
    const quantised = await source()
      .png({ palette: true, colours: 256, dither: 1, effort: 10, compressionLevel: 9 })
      .toBuffer();
    if (fits(quantised)) {
      const out = asPng(quantised);
      out.note = "PNG redusert til 256 farger for å holde " + Math.round(maxBytes / 1024) + " KB";
      return out;
    }
  }

  // ---- 3. mozjpeg, highest quality that fits. Binary search rather than a
  //         fixed quality so a simple banner keeps its detail and a busy photo
  //         still lands under the limit.
  const limitKb = Math.round(maxBytes / 1024);
  const ceiling = format === "jpeg" ? askedQuality : Math.min(JPEG_CEIL, askedQuality);
  const encodeJpeg = (q) => source().jpeg(jpegOptions(q)).toBuffer();
  const switchNote = "lagret som JPEG – PNG kom ikke under " + limitKb + " KB";

  const best = await encodeJpeg(ceiling);
  if (fits(best)) {
    const out = asJpeg(best);
    if (format === "png") out.note = switchNote;
    return out;
  }

  // Highest quality that fits. The search is allowed below JPEG_FLOOR only
  // because the alternative is handing over a file the ad server will reject —
  // and when it goes there, it says so, because that is where text edges start
  // to break up.
  let lo = JPEG_LAST_RESORT;
  let hi = ceiling;
  let fitting = null;
  let fittingQuality = 0;
  for (let i = 0; i < SEARCH_STEPS && lo <= hi; i++) {
    const mid = Math.round((lo + hi) / 2);
    const candidate = await encodeJpeg(mid);
    if (fits(candidate)) {
      fitting = candidate;
      fittingQuality = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (fitting) {
    const out = asJpeg(fitting);
    if (fittingQuality < JPEG_FLOOR) {
      out.note = "sterkt komprimert (JPEG " + fittingQuality + ") for å holde " + limitKb + " KB";
    } else if (format === "png") {
      out.note = switchNote;
    }
    return out;
  }

  // Budget unreachable even at the lowest quality we are willing to ship — hand
  // over the smallest readable file rather than something illegible, and say
  // plainly that the limit was missed so nobody uploads it by accident.
  const floor = await encodeJpeg(JPEG_LAST_RESORT);
  const out = asJpeg(floor);
  out.note = "klarte ikke å komme under " + limitKb + " KB";
  return out;
}

/**
 * Prepare the photo that ships inside an HTML5 package.
 *
 * The creative keeps the same CSS (object-fit: cover + object-position + zoom
 * transform), and cover-cropping depends only on the ASPECT RATIO — so a
 * proportionally resized photo renders pixel-identically to the original while
 * being a fraction of the weight.
 *
 * Sized for retina (2× the format's image area) and then, only if the budget
 * demands it, walked down: first quality, then pixel size. Dropping resolution
 * before dropping quality further matters — a crisp 1.25× photo reads better
 * than a smeared 2× one, and the browser is scaling it down anyway.
 *
 * @param {Buffer} buffer original uploaded photo (any format sharp reads)
 * @param {{width:number,height:number}} box the banner's image area in CSS px
 * @param {{zoom?:number, maxBytes?:number}} opts
 * @returns {Promise<{buffer: Buffer, ext: string, mime: string, bytes: number, note: string}>}
 */
async function preparePhoto(buffer, box, opts) {
  const options = opts || {};
  const zoom = Math.max(0, Math.min(30, Number(options.zoom) || 0));
  const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : 0;

  if (!sharp) {
    return {
      buffer,
      ext: "jpg",
      mime: "image/jpeg",
      bytes: buffer.length,
      note: "originalbildet er lagt inn uendret (sharp mangler)",
    };
  }

  // Zoom magnifies the photo inside the same frame, so it needs proportionally
  // more pixels to stay sharp.
  const zoomFactor = 1 + zoom / 100;
  const encodeAt = (factor, quality) =>
    sharp(buffer)
      .rotate() // honour EXIF orientation before the metadata is dropped
      .resize({
        width: Math.round(box.width * factor * zoomFactor),
        height: Math.round(box.height * factor * zoomFactor),
        fit: "outside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg(jpegOptions(quality))
      .toBuffer();

  const done = (buf, note) => ({ buffer: buf, ext: "jpg", mime: "image/jpeg", bytes: buf.length, note });

  const best = await encodeAt(PHOTO_SCALES[0], PHOTO_QUALITY);
  if (!maxBytes || best.length <= maxBytes) return done(best, "");

  let smallest = best;
  for (const factor of PHOTO_SCALES) {
    let lo = JPEG_FLOOR;
    let hi = PHOTO_QUALITY;
    let fitting = null;
    for (let i = 0; i < SEARCH_STEPS && lo <= hi; i++) {
      const mid = Math.round((lo + hi) / 2);
      const candidate = await encodeAt(factor, mid);
      if (candidate.length <= maxBytes) {
        fitting = candidate;
        lo = mid + 1;
      } else {
        hi = mid - 1;
        if (candidate.length < smallest.length) smallest = candidate;
      }
    }
    if (fitting) return done(fitting, "");
  }

  // Only reachable for artificial, noise-like images; a real photograph fits
  // long before this.
  return done(smallest, "bildet kunne ikke komprimeres helt ned til grensen");
}

module.exports = { isAvailable, unavailableReason, downscale, encodeToBudget, preparePhoto };
