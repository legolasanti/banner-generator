"use strict";

/* The NT Live package keeps the Campaign Manager 360 contract of the static
   HTML5 export (see html5.test.js) and adds its own: the runtime scripts and
   the baked data ride inside index.html, and nothing in the ZIP refers to a
   file that is not in the ZIP. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const pkg = require("../lib/live/package");
const live = require("../lib/live");

const SPEC = { key: "desktop", type: "desktop", width: 580, height: 500, label: "desktop-580x500" };
const ASSETS = path.join(__dirname, "../public/assets");
const read = (name) => fs.readFileSync(path.join(ASSETS, name), "utf8");

function baseParams(overrides) {
  return Object.assign(
    {
      spec: SPEC,
      bannerCss: read("banner.css"),
      liveCss: read("live.css"),
      scripts: [read("banner.js"), read("live-data.js"), read("live.js")],
      config: {
        rows: [{ id: "r0", date: "2026-10-20", time: "21:00", home: "Real Madrid", away: "Liverpool", title: "Real Madrid – Liverpool", link: "https://nt.no/x", image: "https://img.example/a.jpg" }],
        design: live.normalizeDesign({}),
        badges: { annonseText: "Annonse", ageBadgeText: "18+ | Hjelpelinjen.no" },
        assets: { media: { "https://img.example/a.jpg": "media/1.jpg" }, fallback: "fallback.jpg" },
        source: { liveUrls: ["https://docs.google.com/spreadsheets/d/abc/gviz/tq?tqx=out:csv"] },
      },
      clickUrl: "https://www.norsk-tipping.no/sport/oddsen",
      title: "Oddsen",
    },
    overrides || {}
  );
}

/** Names of the entries in a ZIP buffer (central directory walk, no deps). */
function zipEntries(buf) {
  const names = [];
  let i = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(i + 10);
  let p = buf.readUInt32LE(i + 16);
  for (let n = 0; n < count; n++) {
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.slice(p + 46, p + 46 + nameLen).toString("utf8"));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/** The inflated contents of one entry (sizes from the central directory —
    archiver streams, so the local headers carry zeros). */
function zipRead(buf, wanted) {
  let i = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(i + 10);
  let p = buf.readUInt32LE(i + 16);
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    if (name === wanted) {
      const lNameLen = buf.readUInt16LE(offset + 26);
      const lExtraLen = buf.readUInt16LE(offset + 28);
      const start = offset + 30 + lNameLen + lExtraLen;
      const data = buf.slice(start, start + csize);
      return method === 8 ? zlib.inflateRawSync(data) : data;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

test("index.html carries the CM360 contract", async (t) => {
  const html = pkg.buildIndexHtml(baseParams());

  await t.test("ad.size, a top-level var clickTag and the documented exit", () => {
    assert.ok(html.includes('<meta name="ad.size" content="width=580,height=500">'));
    assert.match(html, /<script type="text\/javascript">\s*\n\s*var clickTag = "https:\/\/www\.norsk-tipping\.no\/sport\/oddsen";/);
    assert.ok(html.includes('href="javascript:window.open(window.clickTag)"'));
    assert.ok(!html.includes('type="module"'));
  });

  await t.test("the three runtime scripts and the data are inline, and cannot break out of their <script>", () => {
    assert.ok(html.includes("root.LiveData = api"), "live-data.js");
    assert.ok(html.includes("global.LiveAd = {"), "live.js");
    assert.ok(html.includes("global.renderBanner = renderBanner"), "banner.js");
    const evil = pkg.buildIndexHtml(baseParams({ config: { rows: [{ title: "</script><img src=x onerror=alert(1)>" }], design: {} } }));
    assert.ok(!/<\/script><img/.test(evil));
    assert.ok(evil.includes("\\u003c/script>"));
  });

  await t.test("mounts the runtime for its own format with the exit wired", () => {
    assert.ok(html.includes('window.LiveAd.mount(root, "desktop", config, { exit: exit })'));
    assert.ok(html.includes('class="bn bn--live bn--desktop"'));
  });

  await t.test("uses no storage APIs CM360 rejects", () => {
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(html));
  });
});

test("the ZIP", async (t) => {
  const fonts = fs.readdirSync(path.join(ASSETS, "fonts")).filter((n) => n.startsWith("arimo-")).map((name) => ({ name, buffer: fs.readFileSync(path.join(ASSETS, "fonts", name)) }));
  const zip = await pkg.buildZip(baseParams({ fonts, files: [{ name: "media/1.jpg", buffer: Buffer.alloc(10) }, { name: "fallback.jpg", buffer: Buffer.alloc(10) }] }));
  const names = zipEntries(zip);

  await t.test("index.html sits at the root next to fonts/ and media/", () => {
    assert.ok(names.includes("index.html"));
    assert.ok(names.includes("fonts/arimo-latin-700-normal.woff2"));
    assert.ok(names.includes("media/1.jpg"));
    assert.ok(names.includes("fallback.jpg"));
  });

  await t.test("every relative reference in index.html points at a file in the ZIP", () => {
    const html = zipRead(zip, "index.html").toString("utf8");
    // CSS url(...) references (fonts) — Noto Serif must have been pruned.
    const urls = [...html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]).filter((u) => !/^(data:|https?:)/.test(u));
    assert.ok(urls.length >= 2);
    for (const u of urls) assert.ok(names.includes(u), "missing " + u);
    assert.ok(!html.includes("noto-serif"), "the Houseads face does not ship in an NT package");
    // Data references: the media map and the fallback.
    const cfg = JSON.parse(/var config = (\{.*?\});\n/s.exec(html)[1]);
    for (const file of Object.values(cfg.assets.media)) assert.ok(names.includes(file), "missing " + file);
    assert.ok(names.includes(cfg.assets.fallback));
  });

  await t.test("stays small: scripts, styles and data under 80 KB before the fonts", () => {
    const html = zipRead(zip, "index.html");
    assert.ok(html.length < 80 * 1024, "index.html is " + html.length + " bytes");
  });
});

test("server-side normalisation", async (t) => {
  await t.test("design values are clamped to what the runtime accepts", () => {
    const d = live.normalizeDesign({ slideMs: 100, transition: "spin", accent: "red", lookAheadDays: 99, exitMode: "nope", kicker: "  Oddsen  " });
    assert.equal(d.slideMs, 2000);
    assert.equal(d.transition, "fade");
    assert.equal(d.accent, "#1a6b1a");
    assert.equal(d.lookAheadDays, 14);
    assert.equal(d.exitMode, "row");
    assert.equal(d.kicker, "Oddsen");
    assert.equal(live.normalizeDesign({ ctaText: "" }).ctaText, "", "an emptied button text stays empty");
  });

  await t.test("rows from the browser are rebuilt, never trusted", () => {
    const rows = live.sanitizeRows([
      { date: "2026-10-20", time: "21:00", home: "A", away: "B", link: "javascript:alert(1)", image: "https://x/a.jpg", extra: "dropped" },
      { date: "bad", title: "C – D" },
      null,
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, "A – B");
    assert.equal(rows[0].link, "");
    assert.equal(rows[0].extra, undefined);
  });

  await t.test("live URLs: gviz first, then the export link; published sheets; nothing for http", () => {
    const urls = live.liveUrlsFor("https://docs.google.com/spreadsheets/d/1XWJLkAwch5GXAt_7zOFDcg8Wm8Xv29_8PWuuW15qmAE/edit#gid=42");
    assert.equal(urls[0], "https://docs.google.com/spreadsheets/d/1XWJLkAwch5GXAt_7zOFDcg8Wm8Xv29_8PWuuW15qmAE/gviz/tq?tqx=out:csv&gid=42");
    assert.match(urls[1], /export\?format=csv&gid=42$/);
    assert.deepEqual(live.liveUrlsFor("http://example.com/a.csv"), []);
    assert.deepEqual(live.liveUrlsFor("https://example.com/a.csv"), ["https://example.com/a.csv"]);
    assert.match(live.liveUrlsFor("https://docs.google.com/spreadsheets/d/e/2PACX-abc/pubhtml")[0], /\/pub\?output=csv$/);
  });
});
