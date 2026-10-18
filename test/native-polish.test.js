"use strict";

/* Review fixes on the server side of Native Premium: what the advertiser's
   link may show, the review link index, snapshots, status rules, streamed
   export and Drive import, font subsetting, timeouts. Real files in temp
   dirs, a real Express app on a random port, no network. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const express = require("express");

const { createNative } = require("../lib/native");
const { createProjectStore, sharedComments } = require("../lib/native/projects");
const { createAssetStore } = require("../lib/native/assets");
const { registerSourceRoutes } = require("../lib/native/sources/routes");
const openrouter = require("../lib/native/ai/openrouter");
const safeFetch = require("../lib/safe-fetch");
const imageTools = require("../lib/image");
const { _readZip } = require("../lib/bulk/xlsx");
const D = require("../public/native/doc.js");
const R = require("../public/native/render.js");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// A file that sniffs as MP4 ("ftyp" at byte 4), padded to `size` bytes.
function fakeMp4(size) {
  const buf = Buffer.alloc(size, 7);
  buf.writeUInt32BE(24, 0);
  buf.write("ftypisom", 4, "latin1");
  return buf;
}

// ---- one app for the route tests ------------------------------------------------
let base;
let server;
let root;

test.before(async () => {
  root = tmp("np-polish-");
  const app = express();
  createNative({
    dataDir: path.join(root, "data"),
    uploadsDir: path.join(root, "uploads"),
    fontCacheDir: path.join(root, "fonts"),
    getSharp: imageTools.getSharp,
    safeFetch,
  }).register(app);
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
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// ---- 1. comments: internal unless shared ---------------------------------------------
test("sharedComments: the client sees their own, shared ones and replies in visible threads", () => {
  const all = [
    { id: "c1", from: "client", parent: "", shared: true },
    { id: "c2", from: "team", parent: "", shared: false }, // internal note
    { id: "c3", from: "team", parent: "", shared: true, author: "Kari" },
    { id: "c4", from: "team", parent: "", author: "AI-assistent", shared: false },
    { id: "c5", from: "team", parent: "c1", shared: true }, // answer to the client
    { id: "c6", from: "team", parent: "c1", shared: false }, // internal remark in their thread
    { id: "c7", from: "team", parent: "c2", shared: true }, // inside an internal thread
    { id: "c8", from: "team", parent: "" }, // stored before sharing existed: internal
    { id: "c9", from: "team", parent: "c1" }, // old team reply to the client: stays visible
  ];
  assert.deepEqual(sharedComments(all).map((c) => c.id), ["c1", "c3", "c5", "c9"]);
});

test("review link: internal notes and AI warnings never reach the advertiser", async () => {
  const p = (await json("POST", "/api/native/projects", { name: "Synlighet", advertiser: { name: "Ford" } })).data.project;
  const sec = p.pages[0].sections[0].id;
  const r = await json("POST", "/api/native/projects/" + p.id + "/review");
  const token = r.data.review.token;
  const note = await json("POST", "/api/native/projects/" + p.id + "/comments", { text: "Prisen må bekreftes internt", round: 1 });
  assert.equal(note.data.comment.shared, false, "a team comment is internal by default");
  const ai = await json("POST", "/api/native/projects/" + p.id + "/comments", { text: "Pris må bekreftes av Ford", author: "AI-assistent", round: 1, shared: true, anchor: { section: sec } });
  assert.equal(ai.data.comment.shared, false, "AI warnings are always internal");
  const shared = await json("POST", "/api/native/projects/" + p.id + "/comments", { text: "Vi har byttet bildet", round: 1, shared: true });
  const mine = await json("POST", "/api/review/" + token + "/comments", { author: "Kari", text: "Lysere bilde", anchor: { section: sec } });
  await json("POST", "/api/native/projects/" + p.id + "/comments", { text: "Fikset", parent: mine.data.comment.id, round: 1, shared: true });

  const seen = await json("GET", "/api/review/" + token);
  const texts = seen.data.comments.map((c) => c.text).sort();
  assert.deepEqual(texts, ["Fikset", "Lysere bilde", "Vi har byttet bildet"]);

  // The team can share a note afterwards, and take it back.
  await json("POST", "/api/native/projects/" + p.id + "/comments/" + note.data.comment.id, { shared: true });
  assert.ok((await json("GET", "/api/review/" + token)).data.comments.some((c) => c.id === note.data.comment.id));
  const back = await json("POST", "/api/native/projects/" + p.id + "/comments/" + note.data.comment.id, { shared: false });
  assert.equal(back.data.comment.shared, false);
  assert.equal(back.data.comment.resolved, false, "changing visibility leaves «løst» alone");
  // A client's own comment cannot be hidden from them.
  const c = await json("POST", "/api/native/projects/" + p.id + "/comments/" + mine.data.comment.id, { shared: false });
  assert.equal(c.data.comment.shared, true);
  // The team still sees everything.
  assert.equal((await json("GET", "/api/native/projects/" + p.id + "/comments")).data.comments.length, 5);
  assert.ok(shared.data.comment.shared);
});

// ---- 20. status by hand ----------------------------------------------------------------
test("status: only «back to draft» can be set by hand", async () => {
  const p = (await json("POST", "/api/native/projects", { name: "Status" })).data.project;
  for (const status of ["approved", "published", "review"]) {
    const r = await json("POST", "/api/native/projects/" + p.id + "/status", { status });
    assert.equal(r.status, 403, status);
  }
  assert.equal((await json("GET", "/api/native/projects/" + p.id)).data.project.status, "draft");
  assert.equal((await json("POST", "/api/native/projects/" + p.id + "/status", { status: "draft" })).status, 200);
});

test("unpublishing goes back to the status the page had, or draft if it was edited", async () => {
  const status = async (id) => (await json("GET", "/api/native/projects/" + id)).data.project.status;
  // Never approved: back to draft (it used to become «approved»).
  const a = (await json("POST", "/api/native/projects", { name: "Avpubliser utkast" })).data.project;
  await json("POST", "/api/native/projects/" + a.id + "/publish");
  assert.equal(await status(a.id), "published");
  const ra = await json("DELETE", "/api/native/projects/" + a.id + "/publish");
  assert.equal(ra.data.status, "draft");
  assert.equal(await status(a.id), "draft");

  // Approved, published (twice), unpublished: approved again.
  const b = (await json("POST", "/api/native/projects", { name: "Avpubliser godkjent" })).data.project;
  const r = await json("POST", "/api/native/projects/" + b.id + "/review");
  await json("POST", "/api/review/" + r.data.review.token + "/approve", { name: "Kari Kunde", round: 1 });
  assert.equal(await status(b.id), "approved");
  await json("POST", "/api/native/projects/" + b.id + "/publish");
  await json("POST", "/api/native/projects/" + b.id + "/publish");
  assert.equal((await json("DELETE", "/api/native/projects/" + b.id + "/publish")).data.status, "approved");

  // Approved, published, then edited: what the advertiser approved is gone, so draft.
  await json("POST", "/api/native/projects/" + b.id + "/publish");
  const cur = (await json("GET", "/api/native/projects/" + b.id)).data.project;
  await json("PUT", "/api/native/projects/" + b.id, { project: Object.assign({}, cur, { name: "Endret etter publisering" }), baseRev: cur.rev });
  assert.equal(await status(b.id), "published");
  assert.equal((await json("DELETE", "/api/native/projects/" + b.id + "/publish")).data.status, "draft");
});

// ---- 3. "Lagre min versjon som kopi" ----------------------------------------------------
test("a conflicted editor state can be saved as a new project", async () => {
  const p = (await json("POST", "/api/native/projects", { name: "Original", advertiser: { name: "Ford" } })).data.project;
  const mine = Object.assign({}, p, { name: "Original", rev: 99, status: "published", owner: "hacker" });
  mine.pages = [Object.assign({}, p.pages[0], { sections: p.pages[0].sections.slice(0, 2) })];
  const r = await json("POST", "/api/native/projects", { copyOf: mine });
  assert.equal(r.status, 201);
  const copy = r.data.project;
  assert.notEqual(copy.id, p.id);
  assert.equal(copy.name, "Original (min versjon)");
  assert.equal(copy.pages[0].sections.length, 2);
  assert.equal(copy.status, "draft");
  assert.equal(copy.rev, 1);
  assert.equal(copy.review, null);
});

// ---- 11. review link index -------------------------------------------------------------
test("review links resolve from an index that survives a restart and follows revoke and delete", async () => {
  const dir = tmp("np-index-");
  const a = createProjectStore({ dataDir: dir });
  const rec = await a.create(D.createProject({ name: "Indeks" }));
  const other = await a.create(D.createProject({ name: "Annen" }));
  const r = await a.startReview(rec.id);
  await a.startReview(other.id);
  assert.equal((await a.findByReviewToken(r.review.token)).record.id, rec.id);

  // A fresh store on the same files (the server restarted) finds it too.
  const b = createProjectStore({ dataDir: dir });
  assert.equal((await b.findByReviewToken(r.review.token)).record.id, rec.id);

  const revoked = await b.revokeReview(rec.id);
  await assert.rejects(b.findByReviewToken(r.review.token), (err) => err.status === 404);
  assert.equal((await b.findByReviewToken(revoked.review.token)).record.id, rec.id);
  await b.remove(rec.id);
  await assert.rejects(b.findByReviewToken(revoked.review.token), (err) => err.status === 404);

  // The index never answers for a link the file no longer has.
  const o = await b.findById(other.id);
  fs.writeFileSync(path.join(dir, "projects", other.id, "project.json"), JSON.stringify(Object.assign({}, o, { review: Object.assign({}, o.review, { token: "y".repeat(24) }) })));
  await assert.rejects(b.findByReviewToken(o.review.token), (err) => err.status === 404);
});

// ---- 15. restore -------------------------------------------------------------------------
test("restoring a version keeps a live page published and keeps the AI conversation", async () => {
  const s = createProjectStore({ dataDir: tmp("np-restore-") });
  const rec = await s.create(D.createProject({ name: "Før" }));
  const { file } = await s.snapshot(rec.id, "Første", "kari", "manual");
  const withAi = await s.update(rec.id, Object.assign({}, rec, { name: "Etter", ai: { chat: [{ role: "user", text: "kortere ingress" }] } }), { baseRev: 1 });
  assert.equal(withAi.ai.chat.length, 1);
  await s.setStatus(rec.id, "published");
  const restored = await s.restore(rec.id, file, "kari");
  assert.equal(restored.name, "Før");
  assert.equal(restored.status, "published");
  assert.equal(restored.ai.chat.length, 1, "undoing page edits does not undo the chat");
  await s.setStatus(rec.id, "approved");
  assert.equal((await s.restore(rec.id, file, "kari")).status, "draft");
});

// ---- 16. export / publish snapshots ---------------------------------------------------------
test("export and publish snapshots leave the AI state out and are pruned to the newest ten", async () => {
  const dir = tmp("np-snaps-");
  const s = createProjectStore({ dataDir: dir });
  const rec = await s.create(D.createProject({ name: "Snap" }));
  await s.update(rec.id, Object.assign({}, rec, { ai: { chat: [{ role: "user", text: "x".repeat(2000) }] } }), { baseRev: 1 });
  await s.snapshot(rec.id, "Navngitt", "kari", "manual");
  for (let i = 0; i < 13; i++) {
    await s.snapshot(rec.id, "Eksportert", "kari", "export");
    await s.snapshot(rec.id, "Publisert", "kari", "publish");
    await new Promise((r) => setTimeout(r, 2)); // distinct file names
  }
  const versions = await s.listVersions(rec.id);
  const count = (k) => versions.filter((v) => v.kind === k).length;
  assert.equal(count("export"), 10);
  assert.equal(count("publish"), 10);
  assert.equal(count("manual"), 1, "named versions are never pruned");
  const pub = await s.readVersion(rec.id, versions.find((v) => v.kind === "publish").file);
  assert.equal(pub.project.ai, undefined, "no AI state in a publish snapshot");
  assert.ok(pub.project.pages.length, "the page itself is all there");
  const named = await s.readVersion(rec.id, versions.find((v) => v.kind === "manual").file);
  assert.equal(named.project.ai.chat.length, 1, "a named version keeps everything");
});

// ---- 12. content-addressed writes ------------------------------------------------------------
test("writing the same asset name many times at once never fails", async () => {
  const a = createAssetStore({ dir: tmp("np-assets-") });
  const name = "a".repeat(64) + ".woff2";
  const buf = Buffer.from("wOF2 font bytes");
  await Promise.all(Array.from({ length: 12 }, () => a.writeOnce(name, buf)));
  assert.deepEqual(fs.readdirSync(a.dir), [name], "no temp files left behind");
  assert.equal((await a.read(name)).toString(), "wOF2 font bytes");
});

// ---- 13. font subset text ----------------------------------------------------------------------
test("pageText covers the disclosure, the advertiser's name and the footer", () => {
  const p = D.normalizeProject({ name: "x", advertiser: { name: "Citroën" }, pages: [{ sections: [{ type: "richText", props: { html: "<p>abc</p>" } }] }] });
  const chars = R.pageText(p, { disclosureLabel: "Annonsørinnhold fra {annonsør}", footerText: "Spørsmål? Ring Åse på 22 00 00 00 – ¶", studioName: "ABC BrandStudio" });
  ["ë", "Ë", "ø", "Å", "¶", "?", "B"].forEach((c) => assert.ok(chars.includes(c), c));
});

// ---- 14. duplicate anchors -------------------------------------------------------------------------
test("cloneSection clears the anchor and chapter name unless a whole page is copied", () => {
  const s = D.normalizeSection({ type: "richText", style: { anchor: "lading", chapter: "Lading" } });
  const dup = D.cloneSection(s);
  assert.equal(dup.style.anchor, "");
  assert.equal(dup.style.chapter, "");
  assert.equal(s.style.anchor, "lading", "the original is untouched");
  const kept = D.cloneSection(s, { keepNav: true });
  assert.equal(kept.style.anchor, "lading");
  assert.equal(kept.style.chapter, "Lading");
  // Array.map passes an index as the second argument: that is not keepNav.
  assert.equal([s].map(D.cloneSection)[0].style.anchor, "");
});

// ---- 10. AI timeout covers the body ---------------------------------------------------------------
test("the OpenRouter client gives up on an answer whose body stalls", async () => {
  const stall = http.createServer((req, res) => {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ data: [] }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write('{"choices":'); // …and never finishes
  });
  await new Promise((r) => stall.listen(0, r));
  process.env.OPENROUTER_BASE_URL = "http://127.0.0.1:" + stall.address().port + "/api/v1";
  process.env.OPENROUTER_API_KEY = "sk-test";
  openrouter.resetModelCache();
  try {
    const t0 = Date.now();
    await assert.rejects(openrouter.chat({ model: "a/b", messages: [], timeoutMs: 300 }), (err) => err.status === 504);
    assert.ok(Date.now() - t0 < 5000);
  } finally {
    delete process.env.OPENROUTER_BASE_URL;
    delete process.env.OPENROUTER_API_KEY;
    stall.closeAllConnections();
    stall.close();
  }
});

// ---- 9. Drive videos go to disk ----------------------------------------------------------------------
test("safe-fetch streams a body to a file with the size cap, and cleans up on refusal", async () => {
  const body = fakeMp4(300000);
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "video/mp4" });
    res.end(body);
  });
  await new Promise((r) => srv.listen(0, r));
  const dir = tmp("np-dl-");
  const url = "http://127.0.0.1:" + srv.address().port + "/v.mp4";
  try {
    const file = path.join(dir, "ok.tmp");
    const got = await safeFetch._requestOnce(url, { maxBytes: 1e6, timeoutMs: 5000, file });
    assert.equal(got.bytes, body.length);
    assert.ok(fs.readFileSync(file).equals(body));
    await assert.rejects(safeFetch._requestOnce(url, { maxBytes: 1000, timeoutMs: 5000, file: path.join(dir, "big.tmp") }), /for stor/);
    // The public entry point refuses local addresses, and leaves no file.
    const refused = path.join(dir, "refused.tmp");
    await assert.rejects(safeFetch.fetchToFile(url, { maxBytes: 1e6, timeoutMs: 5000, file: refused }), /privat eller lokal/);
    assert.equal(fs.existsSync(refused), false);
  } finally {
    srv.close();
  }
});

test("a stalled download says it timed out, and leaves no temp file", async () => {
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "video/mp4" });
    res.write(fakeMp4(1000)); // … then nothing more
  });
  await new Promise((r) => srv.listen(0, r));
  const dir = tmp("np-stall-");
  const url = "http://127.0.0.1:" + srv.address().port + "/v.mp4";
  try {
    const file = path.join(dir, "stall.tmp");
    await assert.rejects(safeFetch._requestOnce(url, { maxBytes: 1e6, timeoutMs: 200, file }), /Tidsavbrudd/);
    await assert.rejects(safeFetch._requestOnce(url, { maxBytes: 1e6, timeoutMs: 200 }), /Tidsavbrudd/);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(fs.existsSync(file), false, "the partial file is removed");
  } finally {
    srv.closeAllConnections();
    srv.close();
  }
});

test("Drive import stores a video from a temp file, never from a buffer", async () => {
  const dir = tmp("np-drive-");
  const assets = createAssetStore({ dir: path.join(dir, "uploads") });
  const video = fakeMp4(200000);
  let buffered = 0;
  const drive = {
    download: async () => {
      buffered++;
      return Buffer.alloc(0);
    },
    downloadToFile: async (id, max, file) => {
      fs.writeFileSync(file, video);
      return { file, bytes: video.length, contentType: "video/mp4" };
    },
  };
  const app = express();
  app.use(express.json());
  registerSourceRoutes(app, { assets, drive, safeFetch });
  const srv = app.listen(0);
  await new Promise((r) => srv.once("listening", r));
  try {
    const res = await fetch("http://127.0.0.1:" + srv.address().port + "/api/native/sources/drive/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: [{ id: "abcdefghijkl", name: "film.mp4", kind: "video", w: 1920, h: 1080 }] }),
    });
    const data = await res.json();
    assert.equal(data.assets.length, 1, JSON.stringify(data.errors));
    assert.equal(data.assets[0].kind, "video");
    assert.equal(data.assets[0].bytes, video.length);
    assert.equal(buffered, 0);
    assert.deepEqual(fs.readdirSync(assets.dir).filter((n) => n.endsWith(".tmp")), [], "the temp file is gone");
  } finally {
    srv.close();
  }
});

// ---- 8. export streams videos -------------------------------------------------------------------------
test("export puts a video in the ZIP straight from disk", async () => {
  const video = fakeMp4(400000);
  const fd = new FormData();
  fd.append("file", new Blob([video], { type: "video/mp4" }), "film.mp4");
  const up = await (await fetch(base + "/api/native/assets/video", { method: "POST", body: fd })).json();
  const p = (await json("POST", "/api/native/projects", { name: "Video-eksport", advertiser: { name: "Ford" } })).data.project;
  p.assets = { [up.asset.id]: up.asset };
  p.theme.fonts = { heading: { family: "x", source: "system", weight: 700 }, body: { family: "x", source: "system", weight: 400 } };
  p.pages[0].sections = [{ type: "video", props: { video: up.asset.id, title: "Film" } }];
  await json("PUT", "/api/native/projects/" + p.id, { project: p, baseRev: p.rev });
  const res = await fetch(base + "/api/native/projects/" + p.id + "/export", { method: "POST" });
  assert.equal(res.status, 200);
  const zip = _readZip(Buffer.from(await res.arrayBuffer()));
  const name = "assets/video/" + up.asset.id;
  assert.ok(zip.has(name), name);
  assert.equal(zip.text(name), video.toString("utf8"));
});

test("export: a video whose file is gone is reported, not listed", async () => {
  const video = fakeMp4(5000);
  video.write("gone", 100, "latin1"); // a different file than the other test's
  const fd = new FormData();
  fd.append("file", new Blob([video], { type: "video/mp4" }), "borte.mp4");
  const up = await (await fetch(base + "/api/native/assets/video", { method: "POST", body: fd })).json();
  const p = (await json("POST", "/api/native/projects", { name: "Borte", advertiser: { name: "Ford" } })).data.project;
  p.assets = { [up.asset.id]: up.asset };
  p.theme.fonts = { heading: { family: "x", source: "system", weight: 700 }, body: { family: "x", source: "system", weight: 400 } };
  p.pages[0].sections = [{ type: "video", props: { video: up.asset.id } }];
  await json("PUT", "/api/native/projects/" + p.id, { project: p, baseRev: p.rev });
  fs.rmSync(path.join(root, "uploads", "native", up.asset.id));
  const res = await fetch(base + "/api/native/projects/" + p.id + "/export", { method: "POST" });
  assert.equal(res.status, 200);
  const zip = _readZip(Buffer.from(await res.arrayBuffer()));
  assert.equal(zip.has("assets/video/" + up.asset.id), false);
  assert.match(zip.text("LES-MEG.txt"), /Fant ikke filen for borte\.mp4/);
});

// ---- 11. rate limit (last: it spends this app's budget) ----------------------------------------------------
test("anonymous review reads are rate-limited", async () => {
  let last = 0;
  for (let i = 0; i < 305; i++) {
    last = (await fetch(base + "/api/review/" + "z".repeat(24))).status;
    if (last === 429) break;
  }
  assert.equal(last, 429);
  // The review page itself answers a person with a page, not JSON.
  const page = await fetch(base + "/p/" + "z".repeat(24) + "/");
  assert.equal(page.status, 429);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(await page.text(), /For mange forespørsler/);
});

test("the limiter lets a retrying client back in, and forgets the least recently seen first", () => {
  const { createLimiter } = require("../lib/native/public-routes");
  const realNow = Date.now;
  let now = 1e12;
  Date.now = () => now;
  try {
    const limited = createLimiter(3);
    const a = { ip: "a" };
    assert.deepEqual([1, 2, 3, 4].map(() => limited(a)), [false, false, false, true]);
    for (let i = 0; i < 50; i++) { now += 1000; limited(a); } // hammering while refused …
    now += 10 * 60 * 1000 - 40000; // … the first three are now out of the window
    assert.equal(limited(a), false, "refused requests were not counted");

    const one = createLimiter(1);
    one({ ip: "old" });
    one({ ip: "kept" });
    for (let i = 0; i < 4998; i++) one({ ip: "x" + i });
    one({ ip: "kept" }); // seen again: now the most recent
    one({ ip: "new" }); // 5001 addresses: the least recently seen goes
    assert.equal(one({ ip: "old" }), false, "«old» was forgotten, so it starts afresh");
    assert.equal(one({ ip: "kept" }), true, "«kept» is still remembered (and over its limit)");
  } finally {
    Date.now = realNow;
  }
});

// ---- project card thumbnail ------------------------------------------------------------------
test("the project card falls back to the hero video's poster, then the first picture on the page", async () => {
  const s = createProjectStore({ dataDir: tmp("np-thumb-") });
  const poster = "c".repeat(64) + ".jpg";
  const bg = "d".repeat(64) + ".jpg";
  const later = "e".repeat(64) + ".jpg";
  const video = "f".repeat(64) + ".mp4";
  const assets = {
    [poster]: { name: "poster" },
    [bg]: { name: "bakgrunn" },
    [later]: { name: "senere" },
    [video]: { name: "film", poster },
  };
  const withPoster = await s.create(D.normalizeProject({ name: "Video", assets, pages: [{ sections: [{ type: "hero", props: { image: "", video } }, { type: "image", props: { image: later } }] }] }));
  const noPoster = await s.create(D.normalizeProject({
    name: "Bakgrunn",
    assets: Object.assign({}, assets, { [video]: { name: "film" } }),
    pages: [{ sections: [{ type: "hero", props: { image: "", video } }, { type: "richText", style: { bg: "image", bgImage: bg } }, { type: "image", props: { image: later } }] }],
  }));
  const empty = await s.create(D.normalizeProject({ name: "Tom", pages: [{ sections: [{ type: "richText" }] }] }));
  const list = await s.findAll();
  const thumb = (id) => list.find((p) => p.id === id).thumb;
  assert.equal(thumb(withPoster.id), poster);
  assert.equal(thumb(noPoster.id), bg, "a section background counts, in page order");
  assert.equal(thumb(empty.id), "");
});
