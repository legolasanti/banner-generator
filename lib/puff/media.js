"use strict";

/* =========================================================================
 * puff/media.js — the uploads behind an Artikkelpuff: photos, videos, the
 * poster frames the browser cuts from each video, and advertiser logos.
 *
 * Stored content-addressed as uploads/puff/<sha256>.<ext>, so uploading the
 * same file twice is one file, a document refers to a file by that name, and
 * the name can never be steered anywhere else on disk. The type is decided
 * from the bytes, never from the filename or the browser's MIME guess.
 * ========================================================================= */

const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
const LOGO_MAX_HEIGHT = 224; // 4× the tallest logo the layout allows
const ID_RE = /^[a-f0-9]{64}\.(jpg|png|webp|avif|gif|mp4|webm)$/;
const URL_PREFIX = "/puff-assets/";

const IMAGE_EXTS = ["jpg", "png", "webp", "avif", "gif"];
const VIDEO_EXTS = ["mp4", "webm"];
const MIME = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
};

const safeError = (message) => Object.assign(new Error(message), { safe: true });

/**
 * What the bytes are. QuickTime (.mov) is refused on purpose: Chrome often
 * plays it, Firefox and Safari-in-an-iframe often do not, and an ad that is
 * blank in a third of browsers is worse than an upload error.
 *
 * @param {Buffer} buf
 * @returns {string|null} extension, or "mov" for QuickTime, or null
 */
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.slice(0, 4).toString("latin1") === "GIF8") return "gif";
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  if (buf.slice(4, 8).toString("latin1") === "ftyp") {
    const brand = buf.slice(8, 12).toString("latin1");
    if (brand === "avif" || brand === "avis") return "avif";
    if (brand === "qt  ") return "mov";
    return "mp4";
  }
  return null;
}

function isId(value) {
  return typeof value === "string" && ID_RE.test(value);
}

function extOf(id) {
  return id.slice(id.lastIndexOf(".") + 1);
}

function kindOf(id) {
  const ext = extOf(id);
  return VIDEO_EXTS.includes(ext) ? "video" : IMAGE_EXTS.includes(ext) ? "image" : null;
}

/** "/puff-assets/<id>" (what the browser keeps) → "<id>", or null. */
function idFromUrl(url) {
  if (typeof url !== "string" || !url.startsWith(URL_PREFIX)) return null;
  const id = url.slice(URL_PREFIX.length);
  return isId(id) ? id : null;
}

function createMediaStore({ dir, getSharp }) {
  const abs = (id) => path.join(dir, id);

  async function exists(id) {
    if (!isId(id)) return false;
    return fsp.access(abs(id)).then(() => true, () => false);
  }

  async function write(buffer, ext) {
    const id = crypto.createHash("sha256").update(buffer).digest("hex") + "." + ext;
    await fsp.mkdir(dir, { recursive: true });
    if (!(await exists(id))) {
      const tmp = abs(id) + "." + process.pid + ".tmp";
      await fsp.writeFile(tmp, buffer);
      await fsp.rename(tmp, abs(id));
    }
    return id;
  }

  /** Width and height as displayed, i.e. after the EXIF orientation. */
  async function imageSize(buffer) {
    const sharp = getSharp();
    if (!sharp) return { w: 0, h: 0 };
    const meta = await sharp(buffer).metadata();
    const turned = meta.orientation >= 5;
    return { w: turned ? meta.height : meta.width, h: turned ? meta.width : meta.height };
  }

  /**
   * Store one upload.
   *
   * @param {Buffer} buffer
   * @param {"media"|"logo"} role  a logo is trimmed to its visible edges and
   *        stored as PNG, so every logo lines up with the content edge the
   *        same way whatever margin the advertiser's file came with
   * @returns {Promise<{id:string, url:string, kind:string, w:number, h:number, bytes:number}>}
   */
  async function save(buffer, role) {
    const ext = sniff(buffer);
    if (ext === "mov") throw safeError("QuickTime (.mov) støttes ikke i annonser – eksporter videoen som MP4 (H.264).");
    if (!ext) throw safeError("Ukjent filtype. Bruk JPG, PNG, WEBP, AVIF eller GIF for bilder og MP4 eller WEBM for video.");
    const kind = VIDEO_EXTS.includes(ext) ? "video" : "image";

    if (role === "logo") {
      if (kind !== "image") throw safeError("Logoen må være et bilde (PNG, JPG eller WEBP).");
      const sharp = getSharp();
      if (!sharp) throw safeError("Logo-opplasting krever bildebiblioteket sharp (kjør npm install).");
      const png = await sharp(buffer)
        .rotate()
        .trim({ threshold: 12 })
        .resize({ height: LOGO_MAX_HEIGHT, withoutEnlargement: true })
        .png({ compressionLevel: 9, palette: true, quality: 95 })
        .toBuffer()
        .catch(() => {
          throw safeError("Kunne ikke lese logoen. Prøv en PNG med gjennomsiktig bakgrunn.");
        });
      const id = await write(png, "png");
      const size = await imageSize(png);
      return { id, url: URL_PREFIX + id, kind: "image", w: size.w, h: size.h, bytes: png.length };
    }

    if (kind === "image" && buffer.length > MAX_IMAGE_BYTES) throw safeError("Bildet er for stort (maks 15 MB).");
    if (kind === "video" && buffer.length > MAX_VIDEO_BYTES) throw safeError("Videoen er for stor (maks 60 MB).");
    let size = { w: 0, h: 0 };
    if (kind === "image") {
      size = await imageSize(buffer).catch(() => {
        throw safeError("Bildet kunne ikke leses – filen kan være skadet.");
      });
    }
    const id = await write(buffer, ext);
    return { id, url: URL_PREFIX + id, kind, w: size.w, h: size.h, bytes: buffer.length };
  }

  return { dir, abs, exists, save, imageSize };
}

module.exports = {
  createMediaStore,
  sniff,
  isId,
  idFromUrl,
  kindOf,
  extOf,
  MIME,
  URL_PREFIX,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
};
