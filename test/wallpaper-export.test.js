"use strict";

/* The Wallpaper export: options, fonts and the HTML5 package budget. No
   browser and no network — Puppeteer rendering is covered by the smoke test,
   and the font source is fed from its own disk cache here. */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const Fonts = require("../public/wallpaper/fonts.js");
const gf = require("../lib/google-fonts");
const { normalizeOptions } = require("../lib/wallpaper");
const pkg = require("../lib/wallpaper/package");
const deliver = require("../lib/wallpaper/deliver");
const html5 = require("../lib/html5");
const imageTools = require("../lib/image");

const sharp = imageTools.getSharp();

test("export options", async (t) => {
  await t.test("defaults to both artboards, 100 KB each, auto quality", () => {
    const o = normalizeOptions({});
    assert.deepEqual(o.artboards, ["background", "topbanner"]);
    assert.deepEqual(o.limits, { background: 100, topbanner: 100 });
    assert.equal(o.quality, "auto");
    assert.equal(o.outputType, "image");
  });
  await t.test("HTML5 needs a click URL", () => {
    assert.throws(() => normalizeOptions({ outputType: "html" }), /klikk-lenke/);
  });
  await t.test("rejects non-http(s) URLs", () => {
    assert.throws(() => normalizeOptions({ clickUrl: "javascript:alert(1)" }), /gyldig/);
    assert.throws(() => normalizeOptions({ clickUrl: "https://x.no", trackerUrl: "data:x" }), /Visningsteller/);
  });
  await t.test("clamps limits and keeps 0 as 'no limit'", () => {
    const o = normalizeOptions({ limits: { background: 0, topbanner: 999999 } });
    assert.equal(o.limits.background, 0);
    assert.equal(o.limits.topbanner, 5000);
  });
  await t.test("HTML5 is always 1×", () => {
    assert.equal(normalizeOptions({ outputType: "html", clickUrl: "https://x.no", scale: 2 }).scale, 1);
  });
});

test("google fonts", async (t) => {
  await t.test("only takes font files from fonts.gstatic.com", () => {
    const good = "@font-face{font-family:'X';src:url(https://fonts.gstatic.com/l/font?kit=abc) format('woff2');}";
    assert.deepEqual(gf.parseFontUrl(good), { url: "https://fonts.gstatic.com/l/font?kit=abc", format: "woff2" });
    const evil = "@font-face{src:url(https://evil.example/x.woff2) format('woff2');}";
    assert.equal(gf.parseFontUrl(evil), null);
    assert.equal(gf.parseFontUrl("@font-face{src:url(http://fonts.gstatic.com/x) format('woff2');}"), null);
  });

  await t.test("serves a cached face without touching the network", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-fonts-"));
    const face = { family: "Anton", weight: 400, italic: false, text: " AB" };
    const key = crypto.createHash("sha1").update(Fonts.subsetUrl("Anton", 400, false, " AB")).digest("hex");
    fs.writeFileSync(path.join(dir, key + ".woff2"), Buffer.from("fake-woff2"));
    const src = gf.createFontSource({ cacheDir: dir });
    const got = await src.getFace(face);
    assert.equal(got.buffer.toString(), "fake-woff2");
    assert.equal(got.format, "woff2");
  });

  await t.test("refuses families outside the catalogue", async () => {
    const src = gf.createFontSource({});
    await assert.rejects(src.getFace({ family: "Evil", weight: 400, text: "x" }), /Ukjent skrift/);
  });

  await t.test("@font-face rules quote the family and point at the package path", () => {
    const css = gf.fontFaceCss([{ family: "Playfair Display", weight: 700, italic: true, format: "woff2" }], (f) => "fonts/" + gf.faceFileName(f));
    assert.match(css, /font-family:"Playfair Display"/);
    assert.match(css, /font-style:italic/);
    assert.match(css, /url\("fonts\/playfair-display-700i\.woff2"\) format\("woff2"\)/);
  });
});

test("impression tracker markup is escaped", () => {
  const m = pkg.trackerMarkup('https://t.example/p?a=1&b="><script>');
  assert.ok(!m.includes("<script>"));
  assert.ok(m.includes("&amp;b=&quot;&gt;&lt;script&gt;"));
  assert.equal(pkg.trackerMarkup(""), "");
});

test("HTML5 package fits its budget", { skip: !sharp && "sharp is not installed" }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-assets-"));
  // A noisy photo-like image: compresses badly, so the budget actually bites.
  const w = 1200;
  const h = 900;
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919 + ((i / 3) | 0) * 104729) % 251;
  const png = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  const id = crypto.createHash("sha256").update(png).digest("hex") + ".png";
  fs.writeFileSync(path.join(dir, id), png);

  const artboard = {
    bg: { type: "solid", color: "#ffffff" },
    elements: [
      { id: "img1", type: "image", asset: id, x: 0, y: 0, w: 600, h: 450, zoom: 1, fit: "cover", hidden: false },
      { id: "img2", type: "image", asset: id, x: 700, y: 0, w: 600, h: 450, zoom: 1, fit: "cover", hidden: false },
    ],
  };
  const prepared = await pkg.prepareImages(sharp, artboard, dir);

  await t.test("the same image at the same size ships once", () => {
    assert.equal(prepared.length, 1);
    assert.deepEqual(pkg.namesFor(prepared), { img1: "img/bilde-1.jpg", img2: "img/bilde-1.jpg" });
  });

  const build = (maxBytes) =>
    pkg.buildCreative({
      sharp, imageTools, html5,
      spec: { width: 1920, height: 850, label: "bakgrunn-1920x850" },
      markup: '<div class="wp-ab"><img class="wp-img" src="img/bilde-1.jpg"></div>',
      faces: [{ family: "Anton", weight: 400, italic: false, format: "woff2", buffer: Buffer.alloc(3000, 1) }],
      prepared,
      baseCss: ".wp-ab{position:relative}",
      hoverCss: "",
      clickUrl: "https://example.com/",
      trackerUrl: "",
      title: "Test",
      maxBytes,
    });

  await t.test("stays under 100 KB and reports its parts", async () => {
    const c = await build(100 * 1024);
    assert.ok(c.bytes <= 100 * 1024, "zip is " + c.bytes);
    assert.equal(c.bytes, c.zip.length);
    assert.ok(c.breakdown.images > 0 && c.breakdown.fonts === 3000);
    assert.deepEqual(c.files.map((f) => f.name).sort(), ["fonts/anton-400.woff2", "img/bilde-1.jpg", "index.html"]);
  });

  await t.test("a looser budget buys a sharper image", async () => {
    const tight = await build(60 * 1024);
    const loose = await build(400 * 1024);
    assert.ok(loose.breakdown.images > tight.breakdown.images);
    assert.ok(loose.density >= tight.density);
  });

  await t.test("says so when the budget is impossible", async () => {
    const c = await build(4 * 1024);
    assert.ok(c.bytes > 4 * 1024);
    assert.match(c.note, /KB/);
  });

  await t.test("index.html carries the CM360 contract and the fonts", async () => {
    const c = await build(100 * 1024);
    const unzipped = c.zip.toString("latin1");
    assert.ok(unzipped.includes("index.html"));
    const index = html5.buildIndexHtml({ width: 1920, height: 850 }, "<div></div>", "", "https://example.com/", "T");
    assert.ok(index.includes('<meta name="ad.size" content="width=1920,height=850">'));
  });
});

test("read-me names the files and the click URL", () => {
  const text = deliver.readMe({
    name: "Kampanje",
    rows: [{ file: "k-bakgrunn-1920x850.zip", width: 1920, height: 850, bytes: 90 * 1024 }],
    clickUrl: "https://example.com/",
    html: true,
  });
  assert.match(text, /k-bakgrunn-1920x850\.zip/);
  assert.match(text, /https:\/\/example\.com\//);
  assert.match(text, /1280×700/);
});
