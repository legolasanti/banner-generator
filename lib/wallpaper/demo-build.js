"use strict";

/* =========================================================================
 * wallpaper/demo-build.js — cuts the Wallpaper templates' photos.
 *
 *   node lib/wallpaper/demo-build.js
 *
 * Run after changing a template's photo, frame or focus point. It asks the
 * templates which photos they place where (frame size and focus point),
 * cuts each one from the original in lib/native/demo to exactly that frame
 * — the part `object-fit: cover` would show — at 2× for retina (never
 * enlarged), and writes:
 *   lib/wallpaper/demo/<photo>-<w>x<h>-<x>-<y>.jpg   the cuts
 *   lib/wallpaper/demo/credits.json                  their credits
 *   the PHOTOS list in public/wallpaper/editor/templates.js
 * Cuts no template uses any more are deleted.
 *
 * Why: the HTML5 package resizes a photo to its frame but does not crop it,
 * so a landscape photo in a tall side frame shipped almost three times the
 * pixels anyone sees, and a 100 KB background could not fit.
 * ========================================================================= */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const SOURCE_DIR = path.join(ROOT, "lib", "native", "demo");
const OUT_DIR = path.join(__dirname, "demo");
const TEMPLATES = path.join(ROOT, "public", "wallpaper", "editor", "templates.js");
const DENSITY = 2;
const QUALITY = 84;

/** Every photo placement the templates make. */
function recipes() {
  const Doc = require(path.join(ROOT, "public", "wallpaper", "doc.js"));
  const Spec = require(path.join(ROOT, "public", "wallpaper", "spec.js"));
  const icons = require(path.join(ROOT, "public", "wallpaper", "icons.json"));
  global.window = { WallpaperDoc: Doc, WallpaperSpec: Spec, WPE: { util: { icons: () => icons }, cropRecipes: [] } };
  delete require.cache[require.resolve(TEMPLATES)];
  require(TEMPLATES);
  const WPE = global.window.WPE;
  WPE.templates.forEach((t) => t.make());
  const byKey = new Map();
  WPE.cropRecipes.forEach((r) => byKey.set(r.key, r));
  return [...byKey.values()];
}

/** The source rectangle `object-fit: cover` + object-position shows. */
function coverRect(srcW, srcH, w, h, posX, posY) {
  const scale = Math.max(w / srcW, h / srcH);
  const cw = Math.min(srcW, Math.round(w / scale));
  const ch = Math.min(srcH, Math.round(h / scale));
  return {
    left: Math.round(((srcW - cw) * posX) / 100),
    top: Math.round(((srcH - ch) * posY) / 100),
    width: cw,
    height: ch,
  };
}

async function main() {
  const sharp = require("sharp");
  const sources = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, "credits.json"), "utf8"));
  const list = recipes();
  const credits = [];
  const manifest = [];
  const keep = new Set(["credits.json"]);

  for (const r of list) {
    const src = sources.find((s) => s.name === r.name);
    if (!src) throw new Error("No source photo «" + r.name + "» in lib/native/demo");
    const file = path.join(SOURCE_DIR, src.file);
    const meta = await sharp(file).metadata();
    const rect = coverRect(meta.width, meta.height, r.w, r.h, r.posX, r.posY);
    // 2× the frame, never larger than the cut itself; same shape as the frame.
    const outW = Math.min(r.w * DENSITY, rect.width);
    const outH = Math.round((outW * r.h) / r.w);
    const buffer = await sharp(file).rotate().extract(rect).resize(outW, outH).jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
    const base = `${r.name}-${r.w}x${r.h}-${r.posX}-${r.posY}`;
    fs.writeFileSync(path.join(OUT_DIR, base + ".jpg"), buffer);
    keep.add(base + ".jpg");
    const id = crypto.createHash("sha256").update(buffer).digest("hex") + ".jpg";
    credits.push({
      name: base,
      key: r.key,
      file: base + ".jpg",
      alt: src.alt,
      author: src.author,
      source: src.source,
      license: src.license,
      cut: { from: src.file, x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    });
    manifest.push(`    ${JSON.stringify(r.key)}: [${JSON.stringify(id)}, ${outW}, ${outH}],`);
  }

  credits.sort((a, b) => a.key.localeCompare(b.key));
  manifest.sort();
  fs.writeFileSync(path.join(OUT_DIR, "credits.json"), JSON.stringify(credits, null, 1) + "\n");
  for (const f of fs.readdirSync(OUT_DIR)) if (!keep.has(f)) fs.unlinkSync(path.join(OUT_DIR, f));

  const src = fs.readFileSync(TEMPLATES, "utf8");
  const begin = src.indexOf("// PHOTOS:BEGIN");
  const end = src.indexOf("    // PHOTOS:END");
  if (begin < 0 || end < 0) throw new Error("PHOTOS markers missing in templates.js");
  const lineEnd = src.indexOf("\n", begin) + 1;
  fs.writeFileSync(TEMPLATES, src.slice(0, lineEnd) + manifest.join("\n") + "\n" + src.slice(end));
  console.log(`${credits.length} cuts written to lib/wallpaper/demo`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { coverRect, recipes };
