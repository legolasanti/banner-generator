"use strict";

/* =========================================================================
 * assets.js — images, videos and fonts for Native Premium pages.
 *
 * Every file is stored once under its SHA-256 (uploads/native/<sha>.<ext>),
 * so the id is also a guarantee of the content and two projects using the
 * same photo share one file. The type is decided from the bytes, never from
 * the name or the declared MIME type.
 *
 * Images get responsive WebP variants next to the original
 * (<sha>-<width>.webp at 480/960/1440/2400 px, never wider than the source),
 * which the renderer turns into srcset — the reader's phone downloads a
 * 960 px file instead of the photographer's 8192 px original. The EXIF
 * orientation is baked in, and metadata (GPS position, camera serial) is
 * dropped from the variants.
 *
 * SVG is refused: the files are served from the tool's own origin and an SVG
 * can carry script. HEIC (iPhone) is refused with a clear message, because
 * sharp's prebuilt binaries cannot decode it.
 * ========================================================================= */

const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const { exists, UserError } = require("./fsutil");

const VARIANT_WIDTHS = [480, 960, 1440, 2400];
const WEBP_QUALITY = 80;
const MAX_PIXELS = 120e6; // an 8192×8192 photo is 67 MP; this leaves room, refuses bombs
const NAME_RE = /^[a-f0-9]{64}(-\d{2,4})?\.(webp|jpg|png|gif|avif|mp4|webm|mov|woff2|woff|ttf|otf)$/;

/** What a file really is, from its first bytes. */
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  const ascii = (a, b) => buf.slice(a, b).toString("latin1");
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: "image", ext: "jpg" };
  if (buf[0] === 0x89 && ascii(1, 4) === "PNG") return { kind: "image", ext: "png" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { kind: "image", ext: "webp" };
  if (ascii(0, 3) === "GIF") return { kind: "image", ext: "gif" };
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    const brands = ascii(8, Math.min(buf.length, 40));
    if (/avif|avis/.test(brands)) return { kind: "image", ext: "avif" };
    if (/heic|heix|hevc|heif|mif1/.test(brand)) return { kind: "heic", ext: "heic" };
    if (brand === "qt  ") return { kind: "video", ext: "mov" };
    return { kind: "video", ext: "mp4" };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: "video", ext: "webm" };
  if (ascii(0, 4) === "wOF2") return { kind: "font", ext: "woff2" };
  if (ascii(0, 4) === "wOFF") return { kind: "font", ext: "woff" };
  if (ascii(0, 4) === "OTTO") return { kind: "font", ext: "otf" };
  if (buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00) return { kind: "font", ext: "ttf" };
  if (ascii(0, 4) === "true") return { kind: "font", ext: "ttf" };
  if (/^\s*<(\?xml|svg)/i.test(ascii(0, 64))) return { kind: "svg", ext: "svg" };
  return null;
}

function createAssetStore(opts) {
  const dir = opts.dir;
  const sharpOf = opts.getSharp || (() => null);

  async function ensureDir() {
    await fsp.mkdir(dir, { recursive: true });
  }

  const fileFor = (name) => {
    if (!NAME_RE.test(String(name))) throw new UserError("Ugyldig filnavn");
    return path.join(dir, name);
  };

  function rejectKind(found, wanted) {
    if (!found) throw new UserError("Filtypen støttes ikke");
    if (found.kind === "heic") {
      throw new UserError("HEIC-bilder (iPhone) støttes ikke. Eksporter bildet som JPG først, eller velg «Mest kompatibel» i kamerainnstillingene.");
    }
    if (found.kind === "svg") throw new UserError("SVG støttes ikke av sikkerhetshensyn. Bruk PNG eller WEBP.");
    if (wanted && found.kind !== wanted) {
      const names = { image: "et bilde", video: "en video", font: "en skriftfil" };
      throw new UserError("Filen er ikke " + (names[wanted] || "riktig type"));
    }
  }

  async function writeOnce(name, buffer) {
    const abs = fileFor(name);
    if (!(await exists(abs))) {
      const tmp = abs + "." + process.pid + "." + Date.now() + ".tmp";
      await fsp.writeFile(tmp, buffer);
      await fsp.rename(tmp, abs);
    }
    return abs;
  }

  /** Store an image and its WebP variants. Returns the asset metadata. */
  async function storeImage(buffer, meta) {
    const found = sniff(buffer);
    rejectKind(found, "image");
    await ensureDir();
    const sha = crypto.createHash("sha256").update(buffer).digest("hex");
    const id = sha + "." + found.ext;
    await writeOnce(id, buffer);
    const sharp = sharpOf();
    let w = 0;
    let h = 0;
    let opaque = found.ext === "jpg";
    let widths = [];
    if (sharp) {
      let info;
      try {
        info = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata();
      } catch (err) {
        throw new UserError("Bildet kunne ikke leses. Er filen skadet?");
      }
      const swap = info.orientation >= 5;
      w = (swap ? info.height : info.width) || 0;
      h = (swap ? info.width : info.height) || 0;
      if (!opaque) opaque = !info.hasAlpha;
      // Animated GIFs keep only the original; a still WebP would freeze them.
      if (found.ext !== "gif" || (info.pages || 1) === 1) {
        // The standard steps below the photo's own width, plus the photo at
        // full size (capped at the largest step).
        const largest = VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1];
        widths = VARIANT_WIDTHS.filter((vw) => vw < w);
        if (w > 0) widths.push(Math.min(w, largest));
        widths = Array.from(new Set(widths)).sort((a, b) => a - b);
        for (const vw of widths) {
          const vname = sha + "-" + vw + ".webp";
          if (await exists(path.join(dir, vname))) continue;
          const out = await sharp(buffer, { limitInputPixels: MAX_PIXELS })
            .rotate()
            .resize({ width: vw, withoutEnlargement: true })
            .webp({ quality: WEBP_QUALITY, effort: 4 })
            .toBuffer();
          await writeOnce(vname, out);
        }
      }
    }
    return {
      id,
      kind: "image",
      name: String((meta && meta.name) || "").slice(0, 120),
      w,
      h,
      bytes: buffer.length,
      widths,
      opaque,
      source: (meta && meta.source) || "upload",
    };
  }

  /**
   * Store a video from a temp file (uploads are streamed to disk, never held
   * in memory). Width/height/duration come from the browser, which measured
   * them with a <video> element; they only steer the layout.
   */
  async function storeVideoFile(tmpPath, meta) {
    const fd = await fsp.open(tmpPath, "r");
    const head = Buffer.alloc(64);
    await fd.read(head, 0, 64, 0);
    await fd.close();
    const found = sniff(head);
    rejectKind(found, "video");
    await ensureDir();
    const hash = crypto.createHash("sha256");
    await new Promise((resolve, reject) => {
      fs.createReadStream(tmpPath).on("data", (c) => hash.update(c)).on("end", resolve).on("error", reject);
    });
    const id = hash.digest("hex") + "." + found.ext;
    const abs = fileFor(id);
    const stat = await fsp.stat(tmpPath);
    if (await exists(abs)) await fsp.rm(tmpPath, { force: true });
    else await fsp.rename(tmpPath, abs).catch(async () => {
      await fsp.copyFile(tmpPath, abs);
      await fsp.rm(tmpPath, { force: true });
    });
    const num = (v, max) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
    };
    return {
      id,
      kind: "video",
      name: String((meta && meta.name) || "").slice(0, 120),
      w: Math.round(num(meta && meta.w, 8000)),
      h: Math.round(num(meta && meta.h, 8000)),
      duration: num(meta && meta.duration, 36000),
      bytes: stat.size,
      source: (meta && meta.source) || "upload",
    };
  }

  async function storeVideoBuffer(buffer, meta) {
    await ensureDir();
    const tmp = path.join(dir, "upload-" + process.pid + "-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex") + ".tmp");
    await fsp.writeFile(tmp, buffer);
    try {
      return await storeVideoFile(tmp, meta);
    } finally {
      await fsp.rm(tmp, { force: true }).catch(() => {});
    }
  }

  async function storeFont(buffer, meta) {
    const found = sniff(buffer);
    rejectKind(found, "font");
    await ensureDir();
    const id = crypto.createHash("sha256").update(buffer).digest("hex") + "." + found.ext;
    await writeOnce(id, buffer);
    const family = String((meta && meta.family) || "").replace(/["'<>;{}\\]/g, "").trim().slice(0, 80);
    if (!family) throw new UserError("Skriv inn navnet på skriften");
    const weight = Math.round(Math.max(100, Math.min(900, Number(meta && meta.weight) || 400)) / 100) * 100;
    return {
      id,
      kind: "font",
      name: String((meta && meta.name) || "").slice(0, 120),
      family,
      weight,
      style: meta && meta.style === "italic" ? "italic" : "normal",
      bytes: buffer.length,
      source: "upload",
    };
  }

  /** Any file by name (original or variant), or null. */
  async function read(name) {
    try {
      return await fsp.readFile(fileFor(name));
    } catch (err) {
      if (err.code === "ENOENT" || err.safe) return null;
      throw err;
    }
  }

  function variantName(id, width) {
    const sha = String(id).slice(0, 64);
    return width ? sha + "-" + width + ".webp" : id;
  }

  /** A small JPEG of an image for the AI to look at (long edge ≤ px). */
  async function preview(id, px) {
    const sharp = sharpOf();
    const buf = await read(id);
    if (!buf) return null;
    if (!sharp) return { buffer: buf, mime: "image/" + (id.endsWith("jpg") ? "jpeg" : id.split(".").pop()) };
    const out = await sharp(buf, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: px, height: px, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 78 })
      .toBuffer();
    return { buffer: out, mime: "image/jpeg" };
  }

  /** A JPEG for og:image (1200 px wide) — social networks do not all read WebP. */
  async function shareImage(id) {
    const sharp = sharpOf();
    const buf = await read(id);
    if (!buf || !sharp) return buf;
    return sharp(buf, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: 1200, height: 630, fit: "cover", position: "attention" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  }

  return {
    dir,
    sniff,
    storeImage,
    storeVideoFile,
    storeVideoBuffer,
    storeFont,
    writeOnce,
    read,
    fileFor,
    variantName,
    preview,
    shareImage,
    NAME_RE,
  };
}

module.exports = { createAssetStore, sniff, VARIANT_WIDTHS, NAME_RE };
