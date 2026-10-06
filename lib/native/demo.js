"use strict";

/* =========================================================================
 * demo.js — the demo photo kit the built-in templates are dressed in.
 *
 * Templates refer to photos as "demo:<name>" (see templates.js). When a
 * project is created from a template with demo photos switched on, each
 * photo used is stored like any upload (content-addressed, WebP variants),
 * so the result is an ordinary project the user can keep or re-photograph.
 *
 * The photos are from Unsplash (Unsplash License: free for commercial use,
 * no attribution required). Credits are kept in demo/credits.json anyway.
 * ========================================================================= */

const fsp = require("fs/promises");
const path = require("path");

const DIR = path.join(__dirname, "demo");
let credits = null;

async function catalogue() {
  if (!credits) credits = JSON.parse(await fsp.readFile(path.join(DIR, "credits.json"), "utf8"));
  return credits;
}

/** Store the named demo photos; returns { name → asset (with id) }. */
async function importDemo(assets, names) {
  const list = await catalogue();
  const out = {};
  for (const name of names) {
    const entry = list.find((x) => x.name === name);
    if (!entry) continue;
    const buffer = await fsp.readFile(path.join(DIR, entry.file));
    const asset = await assets.storeImage(buffer, { name: "Demo – " + entry.name + ".jpg", source: "settings" });
    out[name] = Object.assign({}, asset, { alt: entry.alt });
  }
  return out;
}

module.exports = { importDemo, catalogue, DEMO_DIR: DIR };
