"use strict";

/* The Native Premium HTTP API end to end: a real Express app on a random
   port, real files in a temp dir, real sharp for the image variants. No
   network: the theme uses system fonts, so nothing is fetched from Google. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");

const { createNative } = require("../lib/native");
const safeFetch = require("../lib/safe-fetch");
const imageTools = require("../lib/image");
const { _readZip } = require("../lib/bulk/xlsx");

let base;
let server;
let root;

test.before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "np-api-"));
  const app = express();
  const native = createNative({
    dataDir: path.join(root, "data"),
    uploadsDir: path.join(root, "uploads"),
    fontCacheDir: path.join(root, "fonts"),
    getSharp: imageTools.getSharp,
    safeFetch,
  });
  native.register(app);
  app.use(express.json());
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});

test.after(() => server && server.close());

async function json(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, res };
}

async function pngBuffer(w, h) {
  const sharp = imageTools.getSharp();
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer();
}

async function upload(url, buf, name, type) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type }), name);
  const res = await fetch(base + url, { method: "POST", body: fd });
  return { status: res.status, data: await res.json() };
}

test("a project goes from template to saved, conflicts are refused", async () => {
  const c = await json("POST", "/api/native/projects", { name: "API-test", advertiser: { name: "Jula" }, template: "kampanje" });
  assert.equal(c.status, 201);
  const p = c.data.project;
  assert.equal(p.pages[0].sections[0].type, "hero");
  assert.equal(p.tracking.utm.source, "abcnyheter");
  const saved = await json("PUT", "/api/native/projects/" + p.id, { project: Object.assign({}, p, { name: "Nytt navn" }), baseRev: p.rev });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.rev, 2);
  const stale = await json("PUT", "/api/native/projects/" + p.id, { project: p, baseRev: 1 });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.rev, 2);
  const list = await json("GET", "/api/native/projects");
  assert.ok(list.data.projects.some((x) => x.id === p.id && x.name === "Nytt navn"));
});

test("images are stored once with WebP variants; SVG and junk are refused", async () => {
  const r = await upload("/api/native/assets/image", await pngBuffer(1200, 800), "rod.png", "image/png");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.asset.widths, [480, 960, 1200]);
  const v = await fetch(base + "/np-assets/" + r.data.asset.id.slice(0, 64) + "-480.webp");
  assert.equal(v.status, 200);
  assert.equal(v.headers.get("x-content-type-options"), "nosniff");
  const svg = await upload("/api/native/assets/image", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "x.svg", "image/svg+xml");
  assert.equal(svg.status, 400);
  assert.match(svg.data.error, /SVG/);
  const junk = await upload("/api/native/assets/video", Buffer.from("definitely not a video file at all"), "x.mp4", "video/mp4");
  assert.equal(junk.status, 400);
  assert.equal((await fetch(base + "/np-assets/..%2Fdata%2Fnative%2Fsettings.json")).status, 404);
});

test("export: a self-contained ZIP with relative paths", async () => {
  const img = (await upload("/api/native/assets/image", await pngBuffer(1600, 900), "hero.png", "image/png")).data.asset;
  const c = await json("POST", "/api/native/projects", { name: "Eksport", advertiser: { name: "Ford" } });
  const p = c.data.project;
  p.assets = { [img.id]: img };
  p.theme.fonts = { heading: { family: "x", source: "system", weight: 700 }, body: { family: "x", source: "system", weight: 400 } };
  p.pages[0].sections[0].props.image = img.id;
  p.pages.push({ label: "For kvinner", sections: [{ type: "richText" }] });
  await json("PUT", "/api/native/projects/" + p.id, { project: p, baseRev: p.rev });
  const res = await fetch(base + "/api/native/projects/" + p.id + "/export", { method: "POST" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-disposition"), /eksport\.zip/);
  const zip = _readZip(Buffer.from(await res.arrayBuffer()));
  ["index.html", "for-kvinner/index.html", "assets/np.js", "LES-MEG.txt", "assets/img/" + img.id.slice(0, 64) + "-960.webp"].forEach((n) => assert.ok(zip.has(n), n));
  const html = zip.text("index.html");
  assert.match(html, /src="assets\/img\//);
  assert.match(html, /href="for-kvinner\/index\.html"/);
  assert.match(zip.text("for-kvinner/index.html"), /src="\.\.\/assets\/np\.js"/);
  assert.match(html, /Annonsørinnhold fra <strong>Ford<\/strong>/);
  assert.match(zip.text("LES-MEG.txt"), /Endelig adresse|Adressen siden skal ligge på/);
});

test("review link: frozen page, client comment and approval without login", async () => {
  const p = (await json("POST", "/api/native/projects", { name: "Kunde", advertiser: { name: "Ford" } })).data.project;
  const r = await json("POST", "/api/native/projects/" + p.id + "/review");
  assert.equal(r.status, 200);
  const page = await fetch(base + r.data.url);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow");
  const html = await page.text();
  assert.match(html, /window\.NP_REVIEW=/);
  assert.match(html, /\/native\/review\/review\.js/);
  const token = r.data.review.token;
  const c = await json("POST", "/api/review/" + token + "/comments", { author: "Kari", text: "Bytt bildet", anchor: { section: p.pages[0].sections[0].id, x: 0.5, y: 0.5 } });
  assert.equal(c.status, 201);
  assert.equal(c.data.comment.from, "client");
  const wrong = await json("POST", "/api/review/" + token + "/approve", { name: "Kari", round: 7 });
  assert.equal(wrong.status, 409);
  const ok = await json("POST", "/api/review/" + token + "/approve", { name: "Kari Kunde", round: 1 });
  assert.equal(ok.status, 200);
  const data = await json("GET", "/api/review/" + token);
  assert.equal(data.data.approvals[0].name, "Kari Kunde");
  assert.equal((await fetch(base + "/p/" + "x".repeat(24) + "/")).status, 404);
});

test("publish: hosted under /n/<slug>/ in a CSP sandbox; unpublish removes it", async () => {
  const p = (await json("POST", "/api/native/projects", { name: "Publiser meg", advertiser: { name: "Ford" } })).data.project;
  const pub = await json("POST", "/api/native/projects/" + p.id + "/publish");
  assert.equal(pub.data.path, "/n/publiser-meg/");
  const page = await fetch(base + "/n/publiser-meg/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /^sandbox allow-scripts/);
  assert.equal((await fetch(base + "/n/publiser-meg")).status, 200, "the bare path redirects to the slash one");
  await json("DELETE", "/api/native/projects/" + p.id + "/publish");
  assert.equal((await fetch(base + "/n/publiser-meg/")).status, 404);
});

test("settings: the disclosure label must keep {annonsør}", async () => {
  const saved = await json("POST", "/api/native/settings", { disclosureLabel: "Sponset", footerText: "Fot" });
  assert.equal(saved.data.settings.disclosureLabel, "Annonsørinnhold fra {annonsør}");
  assert.equal(saved.data.settings.footerText, "Fot");
  const custom = await json("POST", "/api/native/settings", { disclosureLabel: "Annonse · {annonsør}" });
  assert.equal(custom.data.settings.disclosureLabel, "Annonse · {annonsør}");
});

test("sources: a Google Docs link that is not a doc is refused before any fetch", async () => {
  const r = await json("POST", "/api/native/sources/gdoc", { url: "https://example.com/doc" });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Google Docs/);
  const d = await json("POST", "/api/native/sources/drive", { url: "https://example.com/folders/abc" });
  assert.equal(d.status, 400);
});
