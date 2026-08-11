"use strict";

/* Tests for the byte-budget encoder. These are the rules the 200 KB ad-server
   limit rests on, and every one of them is a promise the UI makes out loud. */

const test = require("node:test");
const assert = require("node:assert/strict");

const imageTools = require("../lib/image");

let sharp = null;
try {
  sharp = require("sharp");
} catch {
  /* the suite skips itself below */
}

const KB = 1024;

/** A flat-colour banner: trivially compressible, always fits any budget. */
function simplePng(width, height) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 240, g: 245, b: 238 } },
  })
    .png()
    .toBuffer();
}

/**
 * Pure high-frequency noise: the worst case any compressor can be handed.
 * Uses mulberry32 rather than an arithmetic pattern — anything periodic
 * compresses beautifully and would quietly make these tests prove nothing.
 */
function noisyPng(width, height) {
  let seed = 0x9e3779b9;
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    raw[i] = ((t ^ (t >>> 14)) >>> 0) % 256;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/**
 * Photograph-like: too much entropy for PNG to compress, smooth enough for
 * JPEG to handle well. This is the shape of a real uploaded photo, and the
 * case the PNG→JPEG fallback exists for.
 */
async function photoLikePng(width, height) {
  const noise = await noisyPng(width, height);
  return sharp(noise).blur(2.5).png({ compressionLevel: 9 }).toBuffer();
}

test("image encoding", { skip: sharp ? false : "sharp is not installed" }, async (t) => {
  await t.test("keeps a simple banner lossless when it fits the budget", async () => {
    const png = await simplePng(580, 500);
    const out = await imageTools.encodeToBudget(png, { format: "png", maxBytes: 200 * KB });
    assert.equal(out.ext, "png");
    assert.equal(out.note, "");
    assert.ok(out.bytes <= 200 * KB);
  });

  await t.test("falls back to JPEG when PNG cannot fit, and says so", async () => {
    const png = await photoLikePng(580, 500);
    const out = await imageTools.encodeToBudget(png, { format: "png", maxBytes: 60 * KB });
    assert.equal(out.ext, "jpg", "a PNG that misses the budget must be written as JPEG");
    assert.ok(out.bytes <= 60 * KB, `expected <= 60 KB, got ${(out.bytes / KB).toFixed(1)} KB`);
    assert.match(out.note, /JPEG/, "the format switch has to be reported to the user");
  });

  await t.test("honours an explicit JPEG request", async () => {
    const png = await simplePng(320, 400);
    const out = await imageTools.encodeToBudget(png, { format: "jpeg", maxBytes: 200 * KB });
    assert.equal(out.ext, "jpg");
    assert.equal(out.mime, "image/jpeg");
  });

  await t.test("stays lossless when no budget is set", async () => {
    const png = await noisyPng(190, 190);
    const out = await imageTools.encodeToBudget(png, { format: "png", maxBytes: 0 });
    assert.equal(out.ext, "png");
    assert.equal(out.note, "");
  });

  await t.test("auto keeps PNG for flat artwork", async () => {
    const png = await simplePng(580, 500);
    const out = await imageTools.encodeToBudget(png, { format: "auto", maxBytes: 200 * KB });
    assert.equal(out.ext, "png", "a flat banner compresses smaller AND sharper as PNG");
  });

  await t.test("auto picks JPEG for a photo, where PNG costs far more", async () => {
    const png = await photoLikePng(580, 500);
    const lossless = await imageTools.encodeToBudget(png, { format: "png", maxBytes: 0 });
    const auto = await imageTools.encodeToBudget(png, { format: "auto", maxBytes: 200 * KB });
    assert.equal(auto.ext, "jpg", "auto must not be a synonym for png");
    assert.ok(auto.bytes < lossless.bytes, "auto should be the smaller of the two");
  });

  await t.test("reports the miss rather than shipping something unreadable", async () => {
    const png = await noisyPng(580, 500);
    // Unreachable by design: no encoder puts 580×500 of pure noise into 3 KB.
    const out = await imageTools.encodeToBudget(png, { format: "auto", maxBytes: 3 * KB });
    assert.match(out.note, /klarte ikke/);
  });

  await t.test("downscales a supersampled render to the exact banner size", async () => {
    const png = await simplePng(1160, 1000);
    const out = await imageTools.downscale(png, 580, 500);
    const meta = await sharp(out).metadata();
    assert.equal(meta.width, 580);
    assert.equal(meta.height, 500);
  });

  await t.test("leaves an already-correct render untouched", async () => {
    const png = await simplePng(190, 190);
    const out = await imageTools.downscale(png, 190, 190);
    assert.equal(out, png, "no re-encode when the size already matches");
  });
});

test("photo asset naming", async (t) => {
  // Only the three types Campaign Manager 360 accepts for a display asset may
  // be recognised. A WEBP or AVIF called image.jpg would get the whole creative
  // rejected on upload.
  const cases = [
    ["jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])],
    ["png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])],
    ["gif", Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(8)])],
    ["", Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")])],
    ["", Buffer.concat([Buffer.alloc(4), Buffer.from("ftypavif"), Buffer.alloc(4)])],
    ["", Buffer.from("not an image at all")],
  ];
  for (const [expected, buffer] of cases) {
    await t.test(`recognises ${expected || "nothing"} in ${buffer.slice(0, 4).toString("latin1").replace(/[^\x20-\x7e]/g, ".")}`, () => {
      assert.equal(imageTools.sniffExtension(buffer), expected);
    });
  }

  await t.test("names the packaged photo image.jpg while sharp re-encodes it", { skip: sharp ? false : "no sharp" }, () => {
    const asset = imageTools.photoAsset(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]));
    assert.deepEqual(asset, { name: "image.jpg", ok: true });
  });
});

test("HTML5 photo preparation", { skip: sharp ? false : "sharp is not installed" }, async (t) => {
  await t.test("keeps the aspect ratio so object-fit: cover crops identically", async () => {
    const photo = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#336699" } })
      .jpeg()
      .toBuffer();
    const out = await imageTools.preparePhoto(photo, { width: 580, height: 355 }, { maxBytes: 160 * KB });
    const meta = await sharp(out.buffer).metadata();
    assert.equal(meta.width / meta.height, 2, "the source 2:1 ratio must survive the resize");
  });

  await t.test("covers the image area at retina size", async () => {
    const photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#336699" } })
      .jpeg()
      .toBuffer();
    const out = await imageTools.preparePhoto(photo, { width: 580, height: 355 }, { maxBytes: 160 * KB });
    const meta = await sharp(out.buffer).metadata();
    assert.ok(meta.width >= 1160, `expected >= 1160 px wide for 2×, got ${meta.width}`);
  });

  await t.test("gives up pixels before quality to hold a tight budget", async () => {
    const photo = await noisyPng(2000, 1400);
    const out = await imageTools.preparePhoto(photo, { width: 580, height: 355 }, { maxBytes: 100 * KB });
    assert.ok(out.bytes <= 100 * KB, `expected <= 100 KB, got ${(out.bytes / KB).toFixed(1)} KB`);
    const meta = await sharp(out.buffer).metadata();
    assert.ok(meta.width < 1160, "the photo should have been stepped down from 2× to make the budget");
  });

  await t.test("never enlarges a small source photo", async () => {
    const photo = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#336699" } })
      .jpeg()
      .toBuffer();
    const out = await imageTools.preparePhoto(photo, { width: 580, height: 355 }, { maxBytes: 160 * KB });
    const meta = await sharp(out.buffer).metadata();
    assert.equal(meta.width, 300);
  });
});
