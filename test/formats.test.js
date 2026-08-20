"use strict";

/* Tests for the product/format registry.

   formats.js and banner.css describe the same banners from two sides: the
   registry says how big the photo area is, the stylesheet draws it. The HTML5
   export sizes the shipped photo from the registry, so if the two drift apart a
   creative goes out with a photo at the wrong resolution — and nothing fails
   loudly enough to notice. These tests are that alarm. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const formats = require("../public/assets/formats.js");

const CSS = fs.readFileSync(path.join(__dirname, "..", "public", "assets", "banner.css"), "utf8");
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

/** Every declared banner, flattened across products. */
function allSpecs() {
  return formats.ORDER.flatMap((id) =>
    formats.getProduct(id).specs.map((spec) => ({ product: id, spec }))
  );
}

/**
 * The photo height banner.css actually renders for a format. The house formats
 * carry it in a custom property, the others in a plain rule.
 */
function cssMediaHeight(type) {
  const houseVar = new RegExp("\\.bn--" + type + "\\s*\\{[^}]*--house-media-h:\\s*([\\d.]+)px", "m");
  const plain = new RegExp("\\.bn--" + type + "\\s+\\.bn__media\\s*\\{[^}]*height:\\s*([\\d.]+)px", "m");
  const match = CSS.match(houseVar) || CSS.match(plain);
  return match ? Number(match[1]) : null;
}

test("registry and banner.css agree on every photo area", async (t) => {
  for (const { product, spec } of allSpecs()) {
    await t.test(product + "/" + spec.key + " (" + spec.width + "x" + spec.height + ")", () => {
      const height = cssMediaHeight(spec.type);
      assert.notEqual(height, null, "banner.css declares no photo height for .bn--" + spec.type);
      assert.equal(
        height,
        spec.media.height,
        "formats.js says " + spec.media.height + "px, banner.css draws " + height + "px"
      );
      // The photo never gets scaled up to fill its box, so it must not be
      // narrower than the banner it sits in — except the 980x300 toppbanner,
      // where the headline deliberately takes the rest of the row.
      assert.ok(spec.media.width <= spec.width, "photo wider than the banner");
    });
  }
});

test("every format declares an exact pixel size in banner.css", () => {
  for (const { spec } of allSpecs()) {
    const rule = new RegExp("\\.bn--" + spec.type + "\\s*\\{[^}]*width:\\s*" + spec.width + "px[^}]*height:\\s*" + spec.height + "px");
    assert.match(CSS, rule, ".bn--" + spec.type + " must be " + spec.width + "x" + spec.height + "px");
  }
});

test("every format points at a template that exists", () => {
  for (const { spec } of allSpecs()) {
    assert.ok(
      fs.existsSync(path.join(TEMPLATES_DIR, spec.file)),
      spec.key + " points at missing template " + spec.file
    );
  }
});

test("download sets only name formats the product actually has", () => {
  for (const id of formats.ORDER) {
    const product = formats.getProduct(id);
    const keys = product.specs.map((s) => s.key);
    assert.ok(product.sets.length > 0, id + " has no download sets");
    for (const set of product.sets) {
      assert.ok(set.keys.length > 0, id + "/" + set.id + " is empty");
      for (const key of set.keys) {
        assert.ok(keys.includes(key), id + "/" + set.id + " names unknown format " + key);
      }
    }
    // The default has to be one of them, or the UI opens on nothing.
    assert.ok(
      product.sets.some((s) => s.id === product.defaultSet),
      id + " defaults to a set it does not declare"
    );
    // Keys must be unique inside a product — they name the files on disk.
    assert.equal(new Set(keys).size, keys.length, id + " has duplicate format keys");
  }
});

test("specsFor narrows to the named set and falls back safely", () => {
  const nt = formats.specsFor("norsktipping", "core").map((s) => s.key);
  assert.deepEqual(nt, ["readpeak", "desktop", "mobile"]);

  assert.equal(formats.specsFor("readpeak", "newsgrid").length, 1);
  assert.equal(formats.specsFor("houseads").length, 4);

  // An unknown product is Norsk Tipping — that is what entries written before
  // the three-product split are.
  assert.equal(formats.getProduct(undefined).id, "norsktipping");
  assert.equal(formats.getProduct("nope").id, "norsktipping");
  // An unknown set falls back to the product's first, never to nothing.
  assert.ok(formats.specsFor("houseads", "does-not-exist").length > 0);
});

test("only Norsk Tipping carries the regulated furniture", () => {
  assert.equal(formats.getProduct("norsktipping").ageBadge, true);
  assert.equal(formats.getProduct("norsktipping").vinnersjanse, true);
  for (const id of ["readpeak", "houseads"]) {
    assert.equal(formats.getProduct(id).ageBadge, false, id + " must not show the 18+ mark");
    assert.equal(formats.getProduct(id).vinnersjanse, false, id + " must not show a Vinnersjanse");
  }
  // Only Norsk Tipping has a default advertiser name to fall back on.
  assert.equal(formats.getProduct("norsktipping").brandLabelDefault, "NORSK TIPPING");
  assert.equal(formats.getProduct("readpeak").brandLabelDefault, "");
});

test("each product ships the font family its banners are set in", () => {
  const fontsDir = path.join(__dirname, "..", "public", "assets", "fonts");
  const available = fs.readdirSync(fontsDir).filter((n) => n.endsWith(".woff2"));
  for (const id of formats.ORDER) {
    const prefix = formats.getProduct(id).fontPrefix;
    assert.ok(prefix, id + " declares no fontPrefix");
    assert.ok(
      available.some((name) => name.startsWith(prefix)),
      id + " needs " + prefix + "*.woff2, which is not bundled"
    );
  }
});
