"use strict";

/* =========================================================================
 * wallpaper/demo.js — the photos the Wallpaper templates are dressed in.
 *
 * The templates (public/wallpaper/editor/templates.js) refer to their photos
 * by asset id, exactly like a photo the designer uploaded: content-addressed,
 * <sha256>.<ext>, served from /wp-assets/. At startup the kit in demo/ is
 * copied into the wallpaper asset folder under those ids, so a template's
 * photos preview, export and package like any upload — and a designer who
 * swaps one for their own photo changes nothing else.
 *
 * The photos are from Unsplash (Unsplash License: free for commercial use,
 * no attribution required). Credits are kept in demo/credits.json anyway.
 * ========================================================================= */

const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const DIR = path.join(__dirname, "demo");

/** The kit: credits plus the asset id and pixel size of each photo. */
async function catalogue() {
  const credits = JSON.parse(await fsp.readFile(path.join(DIR, "credits.json"), "utf8"));
  const out = [];
  for (const entry of credits) {
    const buffer = await fsp.readFile(path.join(DIR, entry.file));
    const ext = path.extname(entry.file).slice(1).toLowerCase().replace("jpeg", "jpg");
    out.push(Object.assign({}, entry, { id: crypto.createHash("sha256").update(buffer).digest("hex") + "." + ext, buffer }));
  }
  return out;
}

/** Copies every kit photo into `assetDir` under its asset id (skips existing). */
async function seed(assetDir) {
  await fsp.mkdir(assetDir, { recursive: true });
  const list = await catalogue();
  for (const photo of list) {
    const target = path.join(assetDir, photo.id);
    const exists = await fsp
      .access(target)
      .then(() => true)
      .catch(() => false);
    if (!exists) await fsp.writeFile(target, photo.buffer);
  }
  return list.length;
}

module.exports = { seed, catalogue, DEMO_DIR: DIR };
