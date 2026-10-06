"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const S = require("../public/native/schema.js");
const D = require("../public/native/doc.js");

const IMG = "a".repeat(64) + ".jpg";
const VID = "b".repeat(64) + ".mp4";

test("sanitizeRich keeps the allowed formatting and drops script, handlers and bad links", () => {
  const out = D.sanitizeRich(
    '<p onclick="x()">Hei <b>du</b> <a href="javascript:alert(1)">farlig</a> <a href="https://ford.no" target="_blank">ok</a></p><script>alert(1)</script><img src=x onerror=alert(1)><style>p{}</style>'
  );
  assert.equal(out, '<p>Hei <strong>du</strong> farlig <a href="https://ford.no">ok</a></p>');
});

test("sanitizeRich turns loose text and stray list items into blocks", () => {
  assert.equal(D.sanitizeRich("Bare tekst"), "<p>Bare tekst</p>");
  assert.equal(D.sanitizeRich("<li>a</li><li>b</li>"), "<ul><li>a</li><li>b</li></ul>");
  assert.equal(D.sanitizeRich("<h1>Stor</h1>"), "<h2>Stor</h2>");
  assert.equal(D.sanitizeRich("<ul><li><p>i punkt</p></li></ul>"), "<ul><li>i punkt</li></ul>");
});

test("sanitizeRich escapes text that looks like markup", () => {
  assert.equal(D.sanitizeRich("<p>&lt;script&gt; 1 < 2</p>"), "<p>&lt;script&gt; 1 &lt; 2</p>");
});

test("safeUrl accepts web, mail, phone and anchors only", () => {
  assert.equal(D.safeUrl("https://www.ford.no/a?b=1"), "https://www.ford.no/a?b=1");
  assert.equal(D.safeUrl("www.jula.no"), "https://www.jula.no");
  assert.equal(D.safeUrl("mailto:kari@x.no"), "mailto:kari@x.no");
  assert.equal(D.safeUrl("#fakta"), "#fakta");
  assert.equal(D.safeUrl("javascript:alert(1)"), "");
  assert.equal(D.safeUrl("data:text/html,<b>"), "");
  assert.equal(D.safeUrl('https://x.no/"onmouseover=1'), "");
});

test("normalizeProject drops unknown keys, unknown sections and assets the project does not have", () => {
  const p = D.normalizeProject({
    evil: "<script>",
    assets: { [IMG]: { w: 100, h: 50 }, "../../etc/passwd": {} },
    pages: [
      {
        sections: [
          { type: "hero", props: { title: "T", image: IMG, video: VID, extra: 1 } },
          { type: "nope", props: {} },
        ],
      },
    ],
  });
  assert.equal(p.evil, undefined);
  assert.deepEqual(Object.keys(p.assets), [IMG]);
  assert.equal(p.pages[0].sections.length, 1);
  const hero = p.pages[0].sections[0];
  assert.equal(hero.props.image, IMG);
  assert.equal(hero.props.video, "", "video not in the project → dropped");
  assert.equal(hero.props.extra, undefined);
  assert.equal(hero.props.layout, "overlay", "missing fields get their default");
});

test("normalizeProject clamps numbers, checks colours and keeps responsive style overrides", () => {
  const p = D.normalizeProject({
    theme: { colors: { primary: "#ABCDEF", accent: "red" }, radius: 999 },
    pages: [{ sections: [{ type: "hero", props: { overlay: 500 }, style: { pad: "xl" }, rs: { mobile: { style: { pad: "s", bg: "dark" } } } }] }],
  });
  assert.equal(p.theme.colors.primary, "#abcdef");
  assert.equal(p.theme.colors.accent, S.DEFAULT_THEME.colors.accent);
  assert.equal(p.theme.radius, 40);
  const s = p.pages[0].sections[0];
  assert.equal(s.props.overlay, 90);
  assert.deepEqual(s.rs.mobile.style, { pad: "s" }, "only responsive style fields survive");
  assert.equal(D.styleFor(s, "mobile").pad, "s");
  assert.equal(D.styleFor(s, "desktop").pad, "xl");
});

test("page slugs become unique folder names", () => {
  const p = D.normalizeProject({ pages: [{ label: "For menn" }, { label: "For menn" }, { label: "Kvinner og menn" }] });
  assert.deepEqual(p.pages.map((pg) => pg.slug), ["for-menn", "for-menn-2", "kvinner-og-menn"]);
  assert.equal(D.slugify("Ærlig økonomi på Ås"), "aerlig-okonomi-pa-as");
});

test("lists get item ids, are capped, and cloneSection gives everything fresh ids", () => {
  const s = D.createSection("factBox", { props: { items: Array.from({ length: 40 }, (_, i) => ({ text: "p" + i })) } });
  assert.equal(s.props.items.length, 16);
  assert.ok(s.props.items.every((it) => /^i_/.test(it.id)));
  const copy = D.cloneSection(s);
  assert.notEqual(copy.id, s.id);
  assert.notEqual(copy.props.items[0].id, s.props.items[0].id);
  assert.equal(copy.props.items[0].text, "p0");
});

test("usedAssets finds images in fields, lists, backgrounds, the theme and video posters", () => {
  const poster = "c".repeat(64) + ".jpg";
  const bg = "d".repeat(64) + ".webp";
  const p = D.normalizeProject({
    assets: { [IMG]: {}, [VID]: { poster }, [poster]: {}, [bg]: {}, ["e".repeat(64) + ".jpg"]: {} },
    pages: [
      {
        sections: [
          { type: "video", props: { video: VID } },
          { type: "gallery", props: { items: [{ image: IMG }] } },
          { type: "richText", style: { bg: "image", bgImage: bg } },
        ],
      },
    ],
  });
  assert.deepEqual(D.usedAssets(p).sort(), [IMG, VID, poster, bg].sort());
});

test("the AI state is kept as plain JSON and dropped when too big", () => {
  const p = D.normalizeProject({ ai: { brief: "b", analysis: { facts: [] }, fn: () => 1 } });
  assert.deepEqual(p.ai, { brief: "b", analysis: { facts: [] } });
  const huge = D.normalizeProject({ ai: { analysis: { x: "y".repeat(500000) } } });
  assert.equal(huge.ai, null);
});

test("every block type has defaults that survive normalisation", () => {
  S.ORDER.forEach((type) => {
    const s = D.createSection(type);
    assert.equal(s.type, type);
    S.fieldsOf(type).forEach((f) => assert.ok(f.key in s.props, type + "." + f.key));
  });
});
