"use strict";

/* =========================================================================
 * images.js — the photos of a bulk run: fetched once, stored once, prepared
 * for both the browser and the renderer.
 *
 * Every photo is kept as two files under uploads/bulk/, named by the SHA-256
 * of the original bytes (so the same photo in ten rows is one file):
 *
 *   <hash>.jpg|png   the render master — EXIF-rotated, at most 2400px on the
 *                    long edge. That is more than any format needs even at 2×
 *                    with supersampling and full zoom (980×500 → ~2000px), and
 *                    it keeps fifty rows from pushing fifty 10 MB originals
 *                    through Chrome six times each.
 *   <hash>.preview.jpg   ~900px, for the bulk page's thumbnails.
 *
 * plus <hash>.json with the size and the suggested focus point.
 *
 * The focus point is where the detail and colour are (see attentionFocus).
 * It is used directly as the CSS object-position:
 * a point at x % of the photo then sits at x % of every frame, so whatever
 * the format's shape, the subject is inside it — which a centred crop does not
 * promise for a person standing at the edge of a wide photo.
 * ========================================================================= */

const path = require("path");
const fsp = require("fs/promises");
const crypto = require("crypto");

const MASTER_EDGE = 2400;
const PREVIEW_EDGE = 900;
const MAX_FETCH_BYTES = 25 * 1024 * 1024;
const ID_RE = /^[a-f0-9]{40}$/;
// Bumped when what is derived from a photo changes (the focus maths), so a
// cached .json from an older build is recomputed rather than trusted.
const META_VERSION = 5;
// Highest vertical focus for a portrait-shaped photo (see attentionFocus).
const PORTRAIT_FOCUS_Y = 30;
// Bulk uploads are scratch: kept long enough to come back to a half-finished
// sheet next week, then cleared at startup.
const KEEP_DAYS = 21;
// One check covers a whole sheet (300 rows), with room for duplicates.
const MAX_CHECK_IDS = 600;

const EXT_BY_MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif" };

class BulkImageError extends Error {
  constructor(message) {
    super(message);
    this.name = "BulkImageError";
    this.safe = true;
  }
}

/**
 * @param {Object} deps
 * @param {string} deps.dir                 storage directory
 * @param {Object} deps.imageTools          lib/image.js
 * @param {Object} deps.safeFetch           lib/safe-fetch.js
 * @param {Function} deps.sniffImageMime    bytes → mime | null
 * @param {Object} deps.links               lib/bulk/links.js
 */
function createBulkImages(deps) {
  const { dir, imageTools, safeFetch, sniffImageMime, links } = deps;

  const metaPath = (id) => path.join(dir, id + ".json");

  async function readMeta(id) {
    try {
      return JSON.parse(await fsp.readFile(metaPath(id), "utf8"));
    } catch {
      return null;
    }
  }

  // The startup clean-up counts from the meta file's mtime, so every use of a
  // photo — fetched again, rendered, a session restored — moves it forward.
  async function touch(id) {
    const now = new Date();
    await fsp.utimes(metaPath(id), now, now).catch(() => {});
  }

  async function filesExist(meta) {
    const names = [meta.master, meta.preview].filter(Boolean).map((n) => path.join(dir, path.basename(n)));
    if (!names.length) return false;
    try {
      await Promise.all(names.map((abs) => fsp.access(abs)));
      return true;
    } catch {
      return false;
    }
  }

  /** Public shape handed to the browser. */
  function describe(meta) {
    return {
      id: meta.id,
      previewUrl: "/bulk-assets/" + meta.preview,
      width: meta.width,
      height: meta.height,
      bytes: meta.bytes,
      focus: meta.focus,
      name: meta.name || "",
    };
  }

  /**
   * Store an image (from a fetch or an upload) and return its description.
   * The bytes are checked, never the declared type.
   */
  async function ingest(buffer, name) {
    if (!buffer || !buffer.length) throw new BulkImageError("Bildet er tomt");
    const mime = sniffImageMime(buffer);
    if (!EXT_BY_MIME[mime]) throw new BulkImageError("Filen er ikke et støttet bilde (JPG, PNG, WEBP, AVIF eller GIF)");

    const id = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 40);
    const existing = await readMeta(id);
    if (existing && existing.v === META_VERSION && (await filesExist(existing))) {
      await touch(id);
      return describe({ ...existing, name: name || existing.name });
    }

    await fsp.mkdir(dir, { recursive: true });
    const sharp = imageTools.getSharp();
    let meta;
    if (sharp) {
      meta = await prepareWithSharp(sharp, buffer, id);
    } else {
      // No sharp: the original is both master and preview, centred.
      const ext = EXT_BY_MIME[mime];
      const master = id + "." + ext;
      await fsp.writeFile(path.join(dir, master), buffer);
      meta = { id, master, preview: master, width: 0, height: 0, focus: { x: 50, y: 50 } };
    }
    meta.bytes = buffer.length;
    meta.name = name || "";
    meta.v = META_VERSION;
    await fsp.writeFile(metaPath(id), JSON.stringify(meta));
    return describe(meta);
  }

  async function prepareWithSharp(sharp, buffer, id) {
    let info;
    try {
      info = await sharp(buffer, { failOn: "none" }).metadata();
    } catch {
      throw new BulkImageError("Bildet kunne ikke leses – filen kan være skadet");
    }
    const hasAlpha = !!info.hasAlpha;
    const rotated = sharp(buffer, { failOn: "none" }).rotate();

    // Master: the banners sit on white, so transparency is kept only as PNG.
    const masterExt = hasAlpha ? "png" : "jpg";
    const masterPipe = rotated
      .clone()
      .resize({ width: MASTER_EDGE, height: MASTER_EDGE, fit: "inside", withoutEnlargement: true });
    const masterBuf = hasAlpha
      ? await masterPipe.png({ compressionLevel: 8 }).toBuffer({ resolveWithObject: true })
      : await masterPipe.jpeg(imageTools.jpegOptions(92)).toBuffer({ resolveWithObject: true });
    const master = id + "." + masterExt;
    await fsp.writeFile(path.join(dir, master), masterBuf.data);

    const preview = id + ".preview.jpg";
    const previewBuf = await sharp(masterBuf.data)
      .resize({ width: PREVIEW_EDGE, height: PREVIEW_EDGE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    await fsp.writeFile(path.join(dir, preview), previewBuf);

    const width = masterBuf.info.width;
    const height = masterBuf.info.height;
    const focus = await attentionFocus(sharp, previewBuf).catch(() => ({ x: 50, y: 50 }));
    return { id, master, preview, width, height, focus };
  }

  /**
   * Where the subject is, as percentages of the photo.
   *
   * Not sharp's "attention" point: that is the single most salient spot, and
   * on a product shot it lands on the edge of the product (a sofa's armrest,
   * an umbrella tip) — centring the crop there cuts the product in half.
   * Instead: on a 96px copy, weight every pixel by how much is going on there
   * (edge strength plus colour saturation, above the photo's own average) and
   * take the weighted centre, leaning a little toward the top. That follows
   * the middle of the subject. It is
   * then pulled 30 % back toward the centre and kept within 15–85 %, because
   * a centred crop is the safe default and this should only nudge it.
   */
  async function attentionFocus(sharp, buffer) {
    const { data, info } = await sharp(buffer)
      .resize({ width: 96, height: 96, fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const W = info.width;
    const H = info.height;
    if (W < 3 || H < 3) return { x: 50, y: 50 };
    const lum = new Float32Array(W * H);
    const sat = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = data[i * 3];
      const g = data[i * 3 + 1];
      const b = data[i * 3 + 2];
      lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      sat[i] = max ? (max - min) / max : 0;
    }
    const interest = new Float32Array(W * H);
    let total = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const gx = lum[i + 1] - lum[i - 1];
        const gy = lum[i + W] - lum[i - W];
        interest[i] = Math.sqrt(gx * gx + gy * gy) / 255 + sat[i] * 0.5;
        total += interest[i];
      }
    }
    const mean = total / ((W - 2) * (H - 2));
    let sum = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        // Mild preference for the upper part: a face, a product's top, a
        // skyline — what a crop must not lose is rarely at the very bottom.
        const w = Math.max(0, interest[y * W + x] - mean) * (1.25 - (0.5 * y) / H);
        sum += w;
        sx += w * x;
        sy += w * y;
      }
    }
    if (!sum) return { x: 50, y: 50 };
    const soften = (v) => Math.max(15, Math.min(85, Math.round(50 + (v - 50) * 0.7)));
    const x = soften(((sx / sum + 0.5) / W) * 100);
    let y = soften(((sy / sum + 0.5) / H) * 100);
    // A tall photo is usually a person, head in the upper third, and it is the
    // shape that loses most in the wide formats (a 980×300 shows under a third
    // of its height). Detail says "the jacket"; the reader looks for the face.
    if (H > W * 1.15) y = Math.min(y, PORTRAIT_FOCUS_Y);
    return { x, y };
  }

  /** Fetch a pasted link (through the SSRF guard) and store it. */
  async function fromUrl(rawUrl) {
    const original = String(rawUrl || "").trim();
    if (!original) throw new BulkImageError("Mangler bildelenke");
    if (!/^https?:\/\//i.test(original)) throw new BulkImageError("Bildelenken må starte med http:// eller https://");
    const url = links.directImageUrl(original);
    const service = links.serviceOf(original);
    let fetched;
    try {
      fetched = await safeFetch.fetchImage(url, {
        maxBytes: MAX_FETCH_BYTES,
        timeoutMs: 20000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
        },
      });
    } catch (err) {
      if (err && err.safe) throw new BulkImageError(explainFetchError(err.message, service));
      throw new BulkImageError("Kunne ikke hente bildet fra lenken");
    }
    const mime = sniffImageMime(fetched.buffer);
    if (!EXT_BY_MIME[mime]) {
      const isHtml = /text\/html/i.test(fetched.contentType) || /^\s*</.test(fetched.buffer.slice(0, 64).toString("utf8"));
      if (isHtml && service === "drive") {
        throw new BulkImageError("Google Drive viser en side, ikke bildet. Del filen som «Alle med lenken» (Leser).");
      }
      if (isHtml && service === "dropbox") {
        throw new BulkImageError("Dropbox viser en side, ikke bildet. Sjekk at lenken er delt offentlig.");
      }
      if (isHtml) throw new BulkImageError("Lenken går til en nettside, ikke til selve bildet. Høyreklikk bildet → «Kopier bildeadresse».");
      throw new BulkImageError("Lenken er ikke et støttet bilde (JPG, PNG, WEBP, AVIF eller GIF)");
    }
    let name = "";
    try {
      name = decodeURIComponent(new URL(fetched.finalUrl).pathname.split("/").pop() || "");
    } catch {}
    return ingest(fetched.buffer, name);
  }

  /** The absolute path of a stored image's render master, or null. */
  async function masterPath(id) {
    if (!ID_RE.test(String(id || ""))) return null;
    const meta = await readMeta(id);
    if (!meta || !meta.master) return null;
    const abs = path.join(dir, path.basename(meta.master));
    try {
      await fsp.access(abs);
    } catch {
      return null;
    }
    await touch(id);
    return abs;
  }

  /**
   * Which of these photos are gone (cleared after KEEP_DAYS, or the folder
   * was emptied). A restored session asks before it calls a row ready; the
   * ones still there count as used again.
   *
   * @param {string[]} ids
   * @returns {Promise<string[]>} the missing ids
   */
  async function missing(ids) {
    const list = Array.from(new Set((Array.isArray(ids) ? ids : []).map(String))).slice(0, MAX_CHECK_IDS);
    const out = [];
    for (const id of list) {
      const meta = ID_RE.test(id) ? await readMeta(id) : null;
      if (meta && (await filesExist(meta))) await touch(id);
      else out.push(id);
    }
    return out;
  }

  /** Delete scratch images not used for KEEP_DAYS. Best effort, at startup. */
  async function cleanUp() {
    const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
    const names = await fsp.readdir(dir).catch(() => []);
    for (const name of names.filter((n) => n.endsWith(".json"))) {
      const abs = path.join(dir, name);
      const stat = await fsp.stat(abs).catch(() => null);
      if (!stat || stat.mtimeMs > cutoff) continue;
      const id = name.slice(0, -5);
      for (const other of names.filter((n) => n.startsWith(id + "."))) {
        await fsp.rm(path.join(dir, other), { force: true }).catch(() => {});
      }
    }
  }

  return { ingest, fromUrl, masterPath, missing, cleanUp, isId: (id) => ID_RE.test(String(id || "")) };
}

/** safe-fetch speaks of "bildet"; make it useful for the service involved. */
function explainFetchError(message, service) {
  if (/HTTP 40[13]/.test(message) && service === "drive") {
    return "Google Drive nekter tilgang. Del filen som «Alle med lenken» (Leser).";
  }
  if (/HTTP 404/.test(message)) return "Bildet finnes ikke på lenken (HTTP 404)";
  if (/HTTP 40[13]/.test(message)) return "Nettstedet nekter tilgang til bildet (" + message.replace(/.*\(/, "").replace(")", "") + ")";
  return message;
}

module.exports = { createBulkImages, BulkImageError, ID_RE, MASTER_EDGE, KEEP_DAYS };
