"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createProjectStore } = require("../lib/native/projects");
const D = require("../public/native/doc.js");

function store() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "np-store-"));
  return { s: createProjectStore({ dataDir: dir }), dir };
}

test("create assigns server fields and update refuses a stale revision", async () => {
  const { s } = store();
  const rec = await s.create(D.createProject({ name: "A" }), "kari");
  assert.equal(rec.rev, 1);
  assert.equal(rec.owner, "kari");
  assert.equal(rec.status, "draft");
  const next = await s.update(rec.id, Object.assign({}, rec, { name: "B", owner: "hacker", status: "published" }), { baseRev: 1 });
  assert.equal(next.rev, 2);
  assert.equal(next.name, "B");
  assert.equal(next.owner, "kari", "owner is server-owned");
  assert.equal(next.status, "draft", "status is server-owned");
  await assert.rejects(s.update(rec.id, rec, { baseRev: 1 }), (err) => err.status === 409 && err.rev === 2);
});

test("ids that are not ids never reach the file system", async () => {
  const { s } = store();
  await assert.rejects(s.findById("../../etc"), (err) => err.status === 404);
  await assert.rejects(s.findById("a/b"), (err) => err.status === 404);
});

test("versions: automatic snapshot on the first save, named snapshots, restore keeps a backup", async () => {
  const { s } = store();
  const rec = await s.create(D.createProject({ name: "Før" }));
  await s.update(rec.id, Object.assign({}, rec, { name: "Etter" }), { baseRev: 1 });
  let versions = await s.listVersions(rec.id);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].kind, "auto");
  await s.snapshot(rec.id, "Til kunden", "kari", "manual");
  versions = await s.listVersions(rec.id);
  const auto = versions.find((v) => v.kind === "auto");
  const restored = await s.restore(rec.id, auto.file, "kari");
  assert.equal(restored.name, "Før");
  versions = await s.listVersions(rec.id);
  assert.ok(versions.some((v) => v.kind === "restore"));
});

test("a review round freezes a version; its link resolves only with the right token", async () => {
  const { s } = store();
  const rec = await s.create(D.createProject({ name: "Runde" }));
  const r1 = await s.startReview(rec.id, "kari");
  assert.equal(r1.status, "review");
  assert.equal(r1.review.round, 1);
  assert.match(r1.review.token, /^[A-Za-z0-9_-]{24}$/);
  await s.update(rec.id, Object.assign({}, r1, { name: "Endret etterpå" }), { baseRev: r1.rev });
  const found = await s.findByReviewToken(r1.review.token);
  assert.equal(found.project.name, "Runde", "the link shows the frozen round, not later edits");
  await assert.rejects(s.findByReviewToken("x".repeat(24)), (err) => err.status === 404);
  await assert.rejects(s.findByReviewToken("../"), (err) => err.status === 404);
  const r2 = await s.revokeReview(rec.id);
  assert.notEqual(r2.review.token, r1.review.token);
  await assert.rejects(s.findByReviewToken(r1.review.token));
});

test("comments and approval: wrong round is refused, approval sets the status", async () => {
  const { s } = store();
  const rec = await s.create(D.createProject({ name: "K" }));
  const r = await s.startReview(rec.id);
  const c = await s.addComment(rec.id, { text: "  Lysere bilde  ", author: "Kari", from: "client", round: 1, anchor: { section: "s_abcdefgh", x: 2, y: -1 } });
  assert.equal(c.text, "Lysere bilde");
  assert.equal(c.anchor.x, 1);
  assert.equal(c.anchor.y, 0);
  await assert.rejects(s.addComment(rec.id, { text: "   " }), /tom/);
  await s.resolveComment(rec.id, c.id, true);
  const list = await s.listComments(rec.id);
  assert.equal(list.comments[0].resolved, true);
  await assert.rejects(s.approve(rec.id, { name: "Kari", round: 99 }), (err) => err.status === 409);
  await assert.rejects(s.approve(rec.id, { name: "K", round: r.review.round }), /navnet/);
  await s.approve(rec.id, { name: "Kari Kunde", round: r.review.round });
  assert.equal((await s.findById(rec.id)).status, "approved");
});

test("delete moves a project to the trash instead of erasing it", async () => {
  const { s, dir } = store();
  const rec = await s.create(D.createProject({ name: "Slett meg" }));
  await s.remove(rec.id);
  await assert.rejects(s.findById(rec.id));
  const trash = fs.readdirSync(path.join(dir, "trash"));
  assert.equal(trash.length, 1);
  assert.ok(trash[0].startsWith(rec.id));
});

test("the AI log sums the cost of every call", async () => {
  const { s } = store();
  const rec = await s.create(D.createProject({}));
  await s.appendAiLog(rec.id, { step: "analyze", cost: 0.012 });
  await s.appendAiLog(rec.id, { step: "write", cost: 0.004 });
  const u = await s.aiUsage(rec.id);
  assert.equal(u.calls, 2);
  assert.ok(Math.abs(u.cost - 0.016) < 1e-9);
});

test("status and review bookkeeping never change the revision the editor saves against", async () => {
  const { s } = store();
  const rec = await s.create(D.createProject({ name: "Rev" }));
  await s.startReview(rec.id);
  await s.setStatus(rec.id, "published");
  await s.revokeReview(rec.id);
  const cur = await s.findById(rec.id);
  assert.equal(cur.rev, 1);
  const saved = await s.update(rec.id, cur, { baseRev: 1 });
  assert.equal(saved.rev, 2);
  assert.equal(saved.status, "published", "a live page stays published while it is edited");
});

test("an approval of an old round does not mark an edited project approved", async () => {
  const { s } = store();
  const rec = await s.create(D.createProject({ name: "Gammel runde" }));
  const r = await s.startReview(rec.id);
  await s.update(rec.id, Object.assign({}, r, { name: "Endret" }), { baseRev: r.rev });
  assert.equal((await s.findById(rec.id)).status, "draft");
  await s.approve(rec.id, { name: "Kari Kunde", round: 1 });
  assert.equal((await s.findById(rec.id)).status, "draft");
  assert.equal((await s.listComments(rec.id)).approvals.length, 1, "the approval itself is kept");
});
