"use strict";

/* The HTML5 package cuts each cover-fitted photo to what its frame shows.
   Checked three ways: the visible-rectangle maths, the weight (a wide photo
   in a tall side strip ships a fraction of the pixels) and the look — the
   original element drawn by render.js in Chrome against the cut image drawn
   as a plain fill, pixel by pixel. */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const pkg = require("../lib/wallpaper/package");
const Doc = require("../public/wallpaper/doc.js");
const imageTools = require("../lib/image");

const sharp = imageTools.getSharp();
const RENDER_JS = path.join(__dirname, "..", "public", "wallpaper", "render.js");

const image = (o) =>
  Object.assign({ id: "a", type: "image", asset: "x.jpg", x: 0, y: 0, w: 140, h: 700, fit: "cover", posX: 50, posY: 50, zoom: 1, flipX: false, flipY: false, hidden: false }, o);

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test("visible rectangle of a cover-fitted image", async (t) => {
  await t.test("a wide photo in a tall strip shows a centred vertical slice", () => {
    const r = pkg.visibleRect(image(), 1800, 1200);
    // cover scale = 700/1200; the strip shows 140 css px = 240 source px.
    assert.ok(close(r.w, 240) && close(r.h, 1200));
    assert.ok(close(r.x, (1800 - 240) / 2) && close(r.y, 0));
    assert.ok(close(r.scale, 700 / 1200));
  });

  await t.test("object-position moves the slice to the edges", () => {
    assert.ok(close(pkg.visibleRect(image({ posX: 0 }), 1800, 1200).x, 0));
    assert.ok(close(pkg.visibleRect(image({ posX: 100 }), 1800, 1200).x, 1800 - 240));
  });

  await t.test("zoom narrows the slice about the object-position point", () => {
    const r = pkg.visibleRect(image({ zoom: 2, posX: 50, posY: 25 }), 1800, 1200);
    assert.ok(close(r.w, 120) && close(r.h, 600));
    // origin at 25 % of the height stays put: 25 % of the window lies above it.
    assert.ok(close(r.y, 300 - 600 * 0.25));
    assert.ok(close(r.scale, (700 / 1200) * 2));
  });

  await t.test("a centred flip shows the same slice, mirrored", () => {
    const plain = pkg.visibleRect(image({ zoom: 1.5 }), 1800, 1200);
    const flipped = pkg.visibleRect(image({ zoom: 1.5, flipX: true }), 1800, 1200);
    assert.ok(close(plain.x, flipped.x) && close(plain.w, flipped.w));
    assert.equal(flipped.flipX, true);
  });

  await t.test("not one rectangle → the old path", () => {
    assert.equal(pkg.visibleRect(image({ fit: "contain" }), 1800, 1200), null);
    assert.equal(pkg.visibleRect(image({ fit: "fill" }), 1800, 1200), null);
    // Off-centre flip of a photo with no slack shows empty space beside it.
    assert.equal(pkg.visibleRect(image({ w: 1000, h: 300, posX: 20, flipX: true }), 1000, 300), null);
  });

  await t.test("a missing position counts as centred", () => {
    const r = pkg.visibleRect(image({ posX: undefined, posY: undefined }), 1800, 1200);
    assert.ok(close(r.x, (1800 - 240) / 2));
  });
});

// A photo-like source: smooth light, colour and fine detail everywhere, so a
// misplaced crop or a lost flip shows up as a big difference.
async function makePhoto(dir, w, h) {
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      raw[i] = (x * 255) / w;
      raw[i + 1] = (y * 255) / h;
      raw[i + 2] = 128 + 100 * Math.sin(x / 23) * Math.cos(y / 31);
    }
  }
  const jpg = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
  fs.writeFileSync(path.join(dir, "photo.jpg"), jpg);
  return jpg;
}

test("HTML5 package ships only the visible part", { skip: !sharp && "sharp is not installed" }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-crop-"));
  const photo = await makePhoto(dir, 1800, 1200);
  const strip = image({ asset: "photo.jpg", posX: 30 });

  await t.test("the side strip ships a cut at 2× its frame, drawn as a plain fill", async () => {
    const prepared = await pkg.prepareImages(sharp, { elements: [strip] }, dir);
    assert.equal(prepared.length, 1);
    const item = prepared[0];
    assert.equal(item.cut, true);
    // 140×700 at 2× = 280×1400, but the source only has 1200 px of height:
    // never enlarged, so the cut keeps its own 240×1200 source pixels.
    assert.deepEqual([item.raw.width, item.raw.height], [240, 1200]);
    const plain = pkg.plainArtboard({ elements: [strip] }, prepared).elements[0];
    assert.deepEqual([plain.fit, plain.zoom, plain.flipX, plain.posX], ["fill", 1, false, 50]);
  });

  await t.test("much lighter than the whole photo scaled to cover", async () => {
    const prepared = await pkg.prepareImages(sharp, { elements: [strip] }, dir);
    const cut = await sharp(prepared[0].raw.data, { raw: prepared[0].raw }).jpeg(imageTools.jpegOptions(80)).toBuffer();
    // The old path: the whole photo resized to cover 2× the frame.
    const whole = await sharp(photo).resize({ width: 280, height: 1400, fit: "outside", withoutEnlargement: true }).jpeg(imageTools.jpegOptions(80)).toBuffer();
    t.diagnostic(`cut ${cut.length} B vs whole photo ${whole.length} B`);
    assert.ok(cut.length < whole.length * 0.4, `cut ${cut.length} B vs whole ${whole.length} B`);
  });

  await t.test("contain keeps the old path", async () => {
    const prepared = await pkg.prepareImages(sharp, { elements: [image({ asset: "photo.jpg", fit: "contain" })] }, dir);
    assert.equal(prepared[0].cut, false);
  });
});

// ---- the look, in Chrome ----------------------------------------------------------
let puppeteer;
try {
  puppeteer = require("puppeteer");
} catch (_) {
  puppeteer = null;
}

async function launch() {
  if (!puppeteer) return null;
  const candidates = [];
  if (process.env.PUPPETEER_EXECUTABLE_PATH) candidates.push({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH });
  const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (process.platform === "darwin" && fs.existsSync(mac)) candidates.push({ executablePath: mac });
  candidates.push({});
  for (const c of candidates) {
    try {
      return await puppeteer.launch(Object.assign({ headless: "new", args: ["--no-sandbox"] }, c));
    } catch (_) {
      /* try the next one */
    }
  }
  return null;
}

/** Draw one artboard with render.js and return its raw RGB pixels. */
async function draw(browser, artboard, size, srcFor) {
  const page = await browser.newPage();
  await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 1 });
  await page.setContent("<!doctype html><html><head><style>html,body{margin:0}</style></head><body><div id=ab></div></body></html>");
  await page.addScriptTag({ path: RENDER_JS });
  await page.evaluate((ab, size, srcs) => {
    const R = window.WallpaperRender;
    const style = document.createElement("style");
    style.textContent = R.BASE_CSS;
    document.head.appendChild(style);
    R.renderArtboard(document.getElementById("ab"), ab, size, { assetUrl: (id, el) => srcs[el.id] });
    return Promise.all([...document.images].map((im) => im.decode()));
  }, artboard, size, srcFor);
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: size.width, height: size.height } });
  await page.close();
  return sharp(png).removeAlpha().raw().toBuffer();
}

function meanDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

test("the cut image looks the same as the original", { skip: !sharp && "sharp is not installed" }, async (t) => {
  const browser = await launch();
  if (!browser) return t.skip("no browser");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-crop-look-"));
  const photo = await makePhoto(dir, 1800, 1200);
  const dataUrl = "data:image/jpeg;base64," + photo.toString("base64");
  // Saved designs name assets by content hash; normalising checks that.
  const asset = crypto.createHash("sha256").update(photo).digest("hex") + ".jpg";
  fs.writeFileSync(path.join(dir, asset), photo);

  // As saved designs carry them: normalised, with every field render.js reads.
  const norm = (o) => Doc.normalizeElement(image(Object.assign({ asset }, o)));
  const cases = [
    ["side strip, off-centre", norm({ w: 140, h: 600, posX: 30 })],
    ["zoomed and moved", norm({ w: 300, h: 400, zoom: 1.8, posX: 70, posY: 20 })],
    ["mirrored", norm({ w: 260, h: 520, zoom: 1.3, flipX: true, posY: 60 })],
  ];
  try {
    for (const [name, el] of cases) {
      await t.test(name, async (st) => {
        const size = { width: el.w, height: el.h };
        const ab = { bg: { type: "solid", color: "#ffffff" }, elements: [el] };
        const prepared = await pkg.prepareImages(sharp, ab, dir);
        assert.equal(prepared[0].cut, true);
        const r = prepared[0].raw;
        const cutPng = await sharp(r.data, { raw: r }).png().toBuffer();
        const cutUrl = "data:image/png;base64," + cutPng.toString("base64");

        const original = await draw(browser, ab, size, { [el.id]: dataUrl });
        const shipped = await draw(browser, pkg.plainArtboard(ab, prepared), size, { [el.id]: cutUrl });
        const diff = meanDiff(original, shipped);
        st.diagnostic(`mean difference ${diff.toFixed(2)} / 255`);
        assert.ok(diff < 3, `${name}: mean difference ${diff.toFixed(2)} / 255`);

        // The check has teeth: the same cut a few pixels off is clearly different.
        const nudged = await draw(browser, Object.assign({}, ab, { elements: [Object.assign({}, el, { posX: Math.min(100, el.posX + 15) })] }), size, { [el.id]: dataUrl });
        assert.ok(meanDiff(original, nudged) > diff * 3, "a moved crop must stand out");
      });
    }
  } finally {
    await browser.close();
  }
});
