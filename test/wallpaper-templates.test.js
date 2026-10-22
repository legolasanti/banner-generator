// The Wallpaper template library: every template is a valid document, uses
// only catalogue fonts and kit photos, keeps its message where the page
// leaves it visible, and the kit is stored like uploads.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const Doc = require("../public/wallpaper/doc.js");
const Spec = require("../public/wallpaper/spec.js");
const Fonts = require("../public/wallpaper/fonts.js");
const icons = require("../public/wallpaper/icons.json");
const demo = require("../lib/wallpaper/demo");

// templates.js is a browser script: give it the globals it expects.
global.window = { WallpaperDoc: Doc, WallpaperSpec: Spec, WPE: { util: { icons: () => icons } } };
require("../public/wallpaper/editor/templates.js");
const WPE = global.window.WPE;

const BG = Spec.get("background");
const SAFE = BG.safe;
const real = WPE.templates.filter((t) => t.id !== "blank");
const built = real.map((t) => ({ t, raw: t.make(), doc: Doc.normalizeDoc(t.make()) }));

const inside = (outer, e) => e.x >= outer.x - 0.5 && e.y >= outer.y - 0.5 && e.x + e.w <= outer.x + outer.width + 0.5 && e.y + e.h <= outer.y + outer.height + 0.5;
const overlaps = (r, e) => e.x < r.x + r.width && e.x + e.w > r.x && e.y < r.y + r.height && e.y + e.h > r.y;
const hasText = (e) => e.type === "text" || (e.type === "shape" && e.text);

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

test("there is a real library: a dozen and more templates, unique ids, a category each", () => {
  assert.ok(real.length >= 12, "templates: " + real.length);
  assert.equal(new Set(WPE.templates.map((t) => t.id)).size, WPE.templates.length);
  for (const t of real) {
    assert.ok(t.name && t.desc && t.category, t.id);
  }
  assert.ok(WPE.templates.some((t) => t.id === "blank"), "an empty start is still offered");
});

test("every template survives normalisation unchanged in substance", () => {
  for (const { t, raw, doc } of built) {
    for (const key of Spec.ORDER) {
      assert.equal(doc.artboards[key].elements.length, raw.artboards[key].elements.length, t.id + "/" + key);
      assert.ok(doc.artboards[key].elements.length <= 400);
      assert.ok(doc.artboards[key].bg, t.id + "/" + key + " has a background colour");
    }
  }
});

test("every layer has a Norwegian name, so the user knows what to replace", () => {
  for (const { t, doc } of built) {
    for (const key of Spec.ORDER) {
      for (const e of doc.artboards[key].elements) assert.ok(e.name && e.name.trim(), t.id + "/" + key + " " + e.type);
    }
  }
});

test("all fonts come from the catalogue (nothing silently falls back)", () => {
  for (const { t, raw } of built) {
    for (const key of Spec.ORDER) {
      for (const e of raw.artboards[key].elements) {
        if (hasText(e)) assert.ok(Fonts.has(e.style.font), t.id + ": " + e.style.font);
      }
    }
  }
});

test("the photo list matches the kit on disk, and every kit photo is used and credited", async () => {
  const kit = await demo.catalogue();
  const byName = Object.fromEntries(kit.map((p) => [p.name, p]));
  const photos = WPE.TEMPLATE_PHOTOS;
  assert.deepEqual(Object.keys(photos).sort(), Object.keys(byName).sort());
  for (const [name, [id, w, h]] of Object.entries(photos)) {
    assert.equal(id, byName[name].id, name + " id is the file's sha256");
    assert.ok(w > 0 && h > 0, name);
  }
  for (const p of kit) {
    for (const k of ["name", "file", "alt", "author", "source", "license"]) assert.ok(p[k], p.name + " " + k);
    assert.match(p.source, /^https:\/\/unsplash\.com\/photos\//);
    assert.ok(p.buffer.length <= 480 * 1024, p.name + " is " + p.buffer.length + " bytes");
  }
  const used = new Set();
  for (const { doc } of built) for (const id of Doc.usedAssets(doc)) used.add(id);
  for (const p of kit) assert.ok(used.has(p.id), p.name + " is not used by any template");
  const ids = new Set(kit.map((p) => p.id));
  for (const id of used) assert.ok(ids.has(id), "unknown asset " + id);
});

test("the photos are big enough not to blur where they are placed", () => {
  for (const { t, doc } of built) {
    for (const key of Spec.ORDER) {
      for (const e of doc.artboards[key].elements) {
        if (e.type !== "image") continue;
        const scale = Math.max(e.w / e.natW, e.h / e.natH) * e.zoom;
        assert.ok(scale <= 1.25, `${t.id}/${key} ${e.name} is enlarged ${Math.round(scale * 100)} %`);
      }
    }
  }
});

test("the message sits in the side strips that every screen shows, never under the page", () => {
  const site = [BG.site.topbanner, BG.site.content];
  for (const { t, doc } of built) {
    const texts = doc.artboards.background.elements.filter(hasText);
    assert.ok(texts.length >= 10, t.id + " has copy on both sides");
    for (const e of texts) {
      assert.ok(inside(SAFE, e), `${t.id} ${e.name} is outside the 1280×700 safe area`);
      assert.ok(!site.some((r) => overlaps(r, e)), `${t.id} ${e.name} is under the page`);
    }
    for (const side of BG.sideZones) {
      const names = texts.filter((e) => overlaps(side, e)).map((e) => e.name);
      for (const must of ["Overskrift", "Knapp"]) assert.ok(names.includes(must), `${t.id}: no ${must} in the strip at x ${side.x}`);
    }
  }
});

test("the top banner carries headline and button inside its 1000×300", () => {
  const box = { x: 0, y: 0, width: 1000, height: 300 };
  for (const { t, doc } of built) {
    const els = doc.artboards.topbanner.elements;
    for (const e of els.filter(hasText)) assert.ok(inside(box, e), `${t.id} ${e.name}`);
    assert.ok(els.some((e) => e.name === "Overskrift"), t.id);
    assert.ok(els.some((e) => e.name === "Knapp"), t.id);
  }
});

test("buttons are readable: label against every colour of the button fill is at least 4.5:1", () => {
  for (const { t, doc } of built) {
    for (const key of Spec.ORDER) {
      for (const e of doc.artboards[key].elements) {
        if (e.name !== "Knapp" || !e.fill) continue;
        const colors = e.fill.type === "solid" ? [e.fill.color] : e.fill.stops.map((s) => s.color);
        for (const c of colors) {
          const ratio = contrast(e.style.color.slice(0, 7), c.slice(0, 7));
          assert.ok(ratio >= 4.5, `${t.id}/${key} button ${ratio.toFixed(2)}:1 on ${c}`);
        }
      }
    }
  }
});

test("copy on a solid colour field reads well (WCAG AA, 3:1 for large text)", () => {
  for (const { t, doc } of built) {
    const band = doc.artboards.background.elements.find((e) => e.name.startsWith("Merkefelt"));
    const fields = [["topbanner", doc.artboards.topbanner.bg]];
    if (band) fields.push(["background", band.fill]);
    for (const [key, fill] of fields) {
      if (!fill || fill.type !== "solid") continue;
      for (const e of doc.artboards[key].elements) {
        if (e.type !== "text" || e.style.gradient) continue;
        if (key === "topbanner" && e.x > 420) continue; // over the photo
        const need = e.style.size >= 24 || (e.style.size >= 18.5 && e.style.weight >= 700) ? 3 : 4.5;
        const ratio = contrast(e.style.color.slice(0, 7), fill.color.slice(0, 7));
        assert.ok(ratio >= need, `${t.id}/${key} ${e.name} ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test("the kit is stored under its asset ids, once", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-demo-"));
  const n = await demo.seed(dir);
  const files = fs.readdirSync(dir);
  assert.equal(files.length, n);
  for (const id of Object.values(WPE.TEMPLATE_PHOTOS).map((p) => p[0])) assert.ok(files.includes(id), id);
  const before = fs.statSync(path.join(dir, files[0])).mtimeMs;
  await demo.seed(dir);
  assert.equal(fs.statSync(path.join(dir, files[0])).mtimeMs, before, "an existing photo is not rewritten");
});
