"use strict";

/* The Wallpaper document model. normalizeDoc() is the one gate every design
   passes through — project files, autosave, and every request the server
   gets — so these tests are mostly about what it refuses to let through. */

const test = require("node:test");
const assert = require("node:assert/strict");

const Doc = require("../public/wallpaper/doc.js");
const Fonts = require("../public/wallpaper/fonts.js");
const Spec = require("../public/wallpaper/spec.js");
const Render = require("../public/wallpaper/render.js");

const ASSET = "a".repeat(64) + ".png";

function docWith(elements, board) {
  const raw = { artboards: { background: { elements: [] }, topbanner: { elements: [] } } };
  raw.artboards[board || "background"].elements = elements;
  return Doc.normalizeDoc(raw);
}

test("spec matches the sold placement", () => {
  const bg = Spec.get("background");
  const tb = Spec.get("topbanner");
  assert.deepEqual([bg.width, bg.height], [1920, 850]);
  assert.deepEqual([tb.width, tb.height], [1000, 300]);
  // Safe area 1280×700, centred horizontally, from the top.
  assert.deepEqual(bg.safe, { x: 320, y: 0, width: 1280, height: 700 });
  // The page's content column is the 1000px in the middle.
  assert.equal(bg.site.content.x, 460);
  assert.equal(bg.site.content.width, 1000);
  assert.equal(Spec.DEFAULT_LIMIT_KB, 100);
});

test("font catalogue", async (t) => {
  await t.test("offers at least 50 families", () => {
    assert.ok(Fonts.FAMILIES.length >= 50, "only " + Fonts.FAMILIES.length);
  });
  await t.test("snaps to a weight the family really has", () => {
    // Bebas Neue only ships 400 — asking for 800 must not produce a request
    // Google answers with HTTP 400.
    assert.equal(Fonts.nearestWeight("Bebas Neue", 800), 400);
    assert.equal(Fonts.nearestWeight("Inter", 650), 700); // tie → heavier
  });
  await t.test("italic never changes the weight", () => {
    assert.equal(Fonts.nearestWeight("Playfair Display", 700, true), 700);
  });
  await t.test("subset URL carries the text and the exact face", () => {
    const url = Fonts.subsetUrl("Playfair Display", 700, true, "Hei ÆØÅ");
    assert.match(url, /^https:\/\/fonts\.googleapis\.com\/css2\?family=Playfair\+Display:ital,wght@1,700&text=/);
    assert.ok(url.includes(encodeURIComponent("Hei ÆØÅ")));
  });
  await t.test("synthetic italic when the family has none at that weight", () => {
    assert.match(Fonts.subsetUrl("Anton", 400, true, "x"), /ital,wght@0,400/);
  });
});

test("normalizeDoc", async (t) => {
  await t.test("fills an empty or hostile document with a valid one", () => {
    for (const raw of [null, 42, "x", [], { artboards: "nope" }]) {
      const d = Doc.normalizeDoc(raw);
      assert.equal(d.version, Doc.VERSION);
      assert.deepEqual(d.artboards.background.elements, []);
      assert.deepEqual(d.artboards.topbanner.bg, { type: "solid", color: "#ffffff" });
    }
  });

  await t.test("drops unknown element types and images without an asset", () => {
    const d = docWith([{ type: "script" }, { type: "image", asset: "../../etc/passwd" }, { type: "text" }]);
    assert.deepEqual(d.artboards.background.elements.map((e) => e.type), ["text"]);
  });

  await t.test("accepts only content-hash asset ids", () => {
    const ok = docWith([{ type: "image", asset: ASSET }]);
    assert.equal(ok.artboards.background.elements[0].asset, ASSET);
    const bad = docWith([{ type: "image", asset: "a".repeat(64) + ".svg" }]);
    assert.equal(bad.artboards.background.elements.length, 0);
  });

  await t.test("rejects colours that are not plain hex", () => {
    const d = docWith([{ type: "shape", fill: { type: "solid", color: "red;background:url(x)" } }]);
    assert.equal(d.artboards.background.elements[0].fill.color, "#000000");
  });

  await t.test("replaces an unknown font with the default and snaps the weight", () => {
    const d = docWith([{ type: "text", style: { font: "Comic Sans'; }", weight: 950 } }]);
    const s = d.artboards.background.elements[0].style;
    assert.equal(s.font, Doc.TEXT_STYLE.font);
    assert.ok(Fonts.find(s.font).w.includes(s.weight));
  });

  await t.test("clamps numbers", () => {
    const e = docWith([{ type: "shape", x: 1e9, w: -5, opacity: 7, blur: 900, rot: 9999 }]).artboards.background.elements[0];
    assert.equal(e.x, 6000);
    assert.equal(e.w, 1);
    assert.equal(e.opacity, 1);
    assert.equal(e.blur, 100);
    assert.equal(e.rot, 360);
  });

  await t.test("reduces icon geometry to safe SVG attributes", () => {
    const d = docWith([{
      type: "icon",
      nodes: [
        ["path", { d: "M1 2L3 4", onload: "alert(1)" }],
        ["script", { src: "x" }],
        ["circle", { cx: "12", cy: "12", r: "3", fill: "url(javascript:alert(1))" }],
        ["foreignObject", {}],
      ],
    }]);
    const nodes = d.artboards.background.elements[0].nodes;
    assert.deepEqual(nodes, [["path", { d: "M1 2L3 4" }], ["circle", { cx: "12", cy: "12", r: "3" }]]);
  });

  await t.test("keeps element ids unique within an artboard", () => {
    const d = docWith([{ type: "text", id: "dup" }, { type: "text", id: "dup" }]);
    const ids = d.artboards.background.elements.map((e) => e.id);
    assert.equal(new Set(ids).size, 2);
  });

  await t.test("caps the element count", () => {
    const many = Array.from({ length: Doc.MAX_ELEMENTS + 50 }, () => ({ type: "shape" }));
    assert.equal(docWith(many).artboards.background.elements.length, Doc.MAX_ELEMENTS);
  });

  await t.test("never mutates its input", () => {
    const raw = { name: "x", artboards: { background: { elements: [{ type: "text", x: 1e9 }] } } };
    const copy = JSON.parse(JSON.stringify(raw));
    Doc.normalizeDoc(raw);
    assert.deepEqual(raw, copy);
  });

  await t.test("is idempotent", () => {
    const once = docWith([{ type: "text", text: "Hei", style: { font: "Lato", weight: 700 } }, { type: "shape", kind: "star" }]);
    assert.deepEqual(Doc.normalizeDoc(once), once);
  });
});

test("usedFaces lists each face with the glyphs it draws", () => {
  const d = docWith([
    { type: "text", text: "Tilbud nå", style: { font: "Anton", weight: 400, uppercase: true } },
    { type: "shape", text: "Kjøp", style: { font: "Anton", weight: 400 } },
    { type: "text", text: "skjult", hidden: true, style: { font: "Lato", weight: 400 } },
    { type: "text", text: "   ", style: { font: "Lato", weight: 700 } },
  ]);
  const faces = Doc.usedFaces(d.artboards.background);
  assert.equal(faces.length, 1, "hidden and blank text need no font");
  assert.equal(faces[0].family, "Anton");
  // Uppercase is applied: the subset must contain the capitals actually drawn.
  for (const ch of "TILBUDNÅKjøp") assert.ok(faces[0].text.includes(ch), "missing " + ch);
  assert.ok(!faces[0].text.includes("å"), "lowercase å is never drawn");
});

test("usedFaces keeps emoji whole", () => {
  const d = docWith([{ type: "text", text: "Tilbud 😀😁", style: { font: "Inter", weight: 700 } }]);
  const [face] = Doc.usedFaces(d.artboards.background);
  assert.ok(face.text.includes("😀") && face.text.includes("😁"));
  // Must be encodable — a lone surrogate throws URIError here.
  assert.doesNotThrow(() => Fonts.subsetUrl(face.family, face.weight, face.italic, face.text));
});

test("italic and upright text in a family without italics share one subset", () => {
  assert.equal(Fonts.hasItalic("Outfit", 700), false);
  const d = docWith([
    { type: "text", text: "abc", style: { font: "Outfit", weight: 700, italic: true } },
    { type: "text", text: "xyz", style: { font: "Outfit", weight: 700, italic: false } },
  ]);
  const faces = Doc.usedFaces(d.artboards.background);
  assert.equal(faces.length, 1);
  assert.equal(faces[0].italic, false);
  for (const ch of "abcxyz") assert.ok(faces[0].text.includes(ch));
});

test("prototype names are not fonts, icon tags or ids", () => {
  assert.equal(Fonts.has("constructor"), false);
  assert.equal(Fonts.find("__proto__"), null);
  const d = docWith([
    { type: "text", id: "constructor", style: { font: "constructor" } },
    { type: "icon", nodes: [["constructor", {}], ["toString", {}], ["path", { d: "M0 0" }]] },
  ]);
  const [text, icon] = d.artboards.background.elements;
  assert.notEqual(text.id, "constructor");
  assert.equal(text.style.font, Doc.TEXT_STYLE.font);
  assert.deepEqual(icon.nodes, [["path", { d: "M0 0" }]]);
});

test("renderer helpers", async (t) => {
  await t.test("fill CSS", () => {
    assert.equal(Render.fillCss(null), "transparent");
    assert.equal(Render.fillCss({ type: "solid", color: "#ff0000" }), "#ff0000");
    assert.equal(
      Render.fillCss({ type: "gradient", kind: "linear", angle: 90, stops: [{ color: "#000", pos: 0 }, { color: "#fff", pos: 100 }] }),
      "linear-gradient(90deg, #000 0%, #fff 100%)"
    );
  });
  await t.test("moving an element is not a content change", () => {
    const e = Doc.createElement("text", { text: "a" });
    assert.equal(Render.contentKey(e), Render.contentKey({ ...e, x: 500, y: 20, rot: 45 }));
    assert.notEqual(Render.contentKey(e), Render.contentKey({ ...e, text: "b" }));
  });
  await t.test("resizing an SVG shape is a content change, a rectangle is not", () => {
    const star = Doc.createElement("shape", { kind: "star" });
    const rect = Doc.createElement("shape", { kind: "rect" });
    assert.notEqual(Render.contentKey(star), Render.contentKey({ ...star, w: star.w + 10 }));
    assert.equal(Render.contentKey(rect), Render.contentKey({ ...rect, w: rect.w + 10 }));
  });
});

test("new shape kinds and the opaque flag survive normalisation", () => {
  for (const kind of ["octagon", "parallelogram", "trapezoid", "cross", "ribbon", "tag", "shield", "semicircle", "ring", "heart"]) {
    const d = docWith([{ type: "shape", kind }]);
    assert.equal(d.artboards.background.elements[0].kind, kind);
  }
  const img = docWith([{ type: "image", asset: ASSET, opaque: true }]).artboards.background.elements[0];
  assert.equal(img.opaque, true);
  assert.equal(docWith([{ type: "image", asset: ASSET, opaque: "yes" }]).artboards.background.elements[0].opaque, false);
});
