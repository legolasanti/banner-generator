"use strict";

/* =========================================================================
 * google-fonts.js — fetch the exact font faces a Wallpaper design uses,
 * subset to the characters it actually draws.
 *
 * Google Fonts' css2 API takes a `text=` parameter and then serves a font
 * containing only those glyphs. A headline set in Playfair Display 700 comes
 * back as ~4 KB instead of ~45 KB, which is the difference between a live-text
 * HTML5 creative fitting a 100 KB budget and not fitting it at all.
 *
 * The same faces are used for the PNG/JPEG render (injected as data: URLs into
 * the Puppeteer page), so both outputs use byte-identical fonts.
 *
 * Only two hosts are ever contacted — fonts.googleapis.com for the CSS and
 * fonts.gstatic.com for the file — and the family/weight always comes from
 * the curated catalogue (public/wallpaper/fonts.js), never from free text.
 * Results are cached in memory and on disk, so re-exporting a design works
 * offline once it has been exported (or estimated) once.
 * ========================================================================= */

const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const Fonts = require("../public/wallpaper/fonts.js");

// css2 picks the font FORMAT from the User-Agent: an unknown agent gets TTF,
// a modern Chrome gets woff2 — the smaller one, and the one every browser an
// ad runs in understands.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CSS_HOST = "fonts.googleapis.com";
const FONT_HOST = "fonts.gstatic.com";
const MAX_CSS_BYTES = 64 * 1024;
const MAX_FONT_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 12000;

class FontError extends Error {
  constructor(message) {
    super(message);
    this.safe = true; // shown to the user as-is
  }
}

/** First woff2 (or any) url() in a css2 response, host-checked. */
function parseFontUrl(css) {
  const blocks = String(css).match(/@font-face\s*\{[^}]*\}/g) || [];
  for (const block of blocks) {
    const m = /src:\s*url\(\s*['"]?([^'")\s]+)['"]?\s*\)\s*format\(\s*['"]?([a-z0-9-]+)['"]?\s*\)/i.exec(block);
    if (!m) continue;
    let url;
    try {
      url = new URL(m[1]);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.hostname !== FONT_HOST) continue;
    return { url: url.href, format: m[2].toLowerCase() };
  }
  return null;
}

async function fetchCapped(url, maxBytes, expectHost) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== expectHost) {
    throw new FontError("Ugyldig skriftadresse");
  }
  const res = await fetch(parsed.href, {
    headers: { "User-Agent": UA, Accept: "text/css,*/*;q=0.1" },
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new FontError("Google Fonts svarte " + res.status);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new FontError("Skriftfilen er uventet stor");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new FontError("Skriftfilen er uventet stor");
  return buf;
}

/**
 * @param {{cacheDir?: string, fetchImpl?: Function}} [opts]
 */
function createFontSource(opts) {
  const o = opts || {};
  const memory = new Map(); // url → Promise<{buffer, format}>
  const MAX_MEMORY = 200;

  async function fromDisk(key) {
    if (!o.cacheDir) return null;
    try {
      const buffer = await fsp.readFile(path.join(o.cacheDir, key + ".woff2"));
      return { buffer, format: "woff2" };
    } catch {
      return null;
    }
  }

  async function toDisk(key, buffer) {
    if (!o.cacheDir) return;
    await fsp.mkdir(o.cacheDir, { recursive: true });
    await fsp.writeFile(path.join(o.cacheDir, key + ".woff2"), buffer).catch(() => {});
  }

  async function load(cssUrl) {
    const key = crypto.createHash("sha1").update(cssUrl).digest("hex");
    const cached = await fromDisk(key);
    if (cached) return cached;
    const css = (await fetchCapped(cssUrl, MAX_CSS_BYTES, CSS_HOST)).toString("utf8");
    const found = parseFontUrl(css);
    if (!found) throw new FontError("Fant ingen skriftfil i svaret fra Google Fonts");
    const buffer = await fetchCapped(found.url, MAX_FONT_BYTES, FONT_HOST);
    if (found.format === "woff2") await toDisk(key, buffer);
    return { buffer, format: found.format };
  }

  /**
   * One face, subset to `text`. The weight is snapped to one the family really
   * has, so the request can never 400 on a weight that does not exist.
   *
   * @param {{family:string, weight:number, italic:boolean, text:string}} face
   * @returns {Promise<{family, weight, italic, buffer: Buffer, format: string}>}
   */
  async function getFace(face) {
    if (!Fonts.has(face.family)) throw new FontError("Ukjent skrift: " + String(face.family).slice(0, 40));
    const weight = Fonts.nearestWeight(face.family, face.weight, face.italic);
    const italic = !!face.italic && Fonts.hasItalic(face.family, weight);
    const cssUrl = Fonts.subsetUrl(face.family, weight, italic, face.text);
    if (!memory.has(cssUrl)) {
      if (memory.size >= MAX_MEMORY) memory.delete(memory.keys().next().value);
      const pending = load(cssUrl);
      memory.set(cssUrl, pending);
      // A failed fetch must not poison the cache for the next attempt.
      pending.catch(() => memory.delete(cssUrl));
    }
    let result;
    try {
      result = await memory.get(cssUrl);
    } catch (err) {
      if (err && err.safe) throw err;
      throw new FontError(
        "Kunne ikke hente skriften «" + face.family + "» fra Google Fonts. Sjekk nettilkoblingen og prøv igjen."
      );
    }
    return { family: face.family, weight, italic, buffer: result.buffer, format: result.format };
  }

  return { getFace };
}

/** File name for a face inside an HTML5 package. */
function faceFileName(face) {
  const slug = face.family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug + "-" + face.weight + (face.italic ? "i" : "") + "." + (face.format || "woff2");
}

/**
 * @font-face rules for a set of faces. `srcFor(face)` returns the URL each rule
 * points at: a data: URL for the Puppeteer render, a package path for HTML5.
 */
function fontFaceCss(faces, srcFor) {
  return faces
    .map((face) => {
      const fmt = face.format === "woff2" ? "woff2" : face.format === "woff" ? "woff" : "truetype";
      return (
        "@font-face{font-family:" + JSON.stringify(face.family) +
        ";font-style:" + (face.italic ? "italic" : "normal") +
        ";font-weight:" + face.weight +
        ";font-display:block;src:url(" + JSON.stringify(srcFor(face)) + ") format(" + JSON.stringify(fmt) + ");}"
      );
    })
    .join("\n");
}

module.exports = { createFontSource, parseFontUrl, faceFileName, fontFaceCss, FontError };
