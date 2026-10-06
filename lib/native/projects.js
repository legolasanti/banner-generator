"use strict";

/* =========================================================================
 * projects.js — where Native Premium projects live.
 *
 *   data/native/projects/<id>/project.json      the current state
 *   data/native/projects/<id>/versions/*.json   snapshots (named, automatic,
 *                                               review rounds, before restore)
 *   data/native/projects/<id>/comments.json     review comments + approvals
 *   data/native/trash/<id>-<time>/              deleted projects (recoverable)
 *
 * Flat files keep the app dependency-free and match the rest of ABC design;
 * everything goes through this one module (findAll / findById / create /
 * update / remove), so swapping in a database later touches nothing else.
 *
 * Concurrency: every write to a project runs under that project's lock, and
 * saves carry the revision the editor started from — a save based on an older
 * revision is refused with 409 instead of silently overwriting a colleague.
 *
 * The server owns some fields the browser may not set: id, owner, createdAt,
 * rev, status, the review round and its link token.
 * ========================================================================= */

const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const Doc = require("../../public/native/doc.js");
const { readJson, writeJsonAtomic, createLocks, exists, NotFoundError, UserError } = require("./fsutil");

const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
const VERSION_FILE_RE = /^(\d{13})-r(\d+)\.json$/;
const AUTO_SNAPSHOT_MS = 10 * 60 * 1000;
const MAX_VERSIONS = 80;
const MAX_COMMENTS = 1000;

function nowIso() {
  return new Date().toISOString();
}

function reviewToken() {
  return crypto.randomBytes(18).toString("base64url");
}

function createProjectStore(opts) {
  const root = path.join(opts.dataDir, "projects");
  const trash = path.join(opts.dataDir, "trash");
  const withLock = createLocks();

  const dirOf = (id) => {
    if (!ID_RE.test(String(id))) throw new NotFoundError("Fant ikke prosjektet");
    return path.join(root, id);
  };
  const fileOf = (id) => path.join(dirOf(id), "project.json");
  const versionsDir = (id) => path.join(dirOf(id), "versions");
  const commentsFile = (id) => path.join(dirOf(id), "comments.json");

  /** The stored record: the normalised project plus server-owned bookkeeping. */
  function toRecord(content, server) {
    return Object.assign({}, content, {
      id: server.id,
      owner: server.owner || "",
      createdAt: server.createdAt,
      updatedAt: server.updatedAt,
      rev: server.rev,
      status: server.status,
      review: server.review || null,
      lastSnapshotAt: server.lastSnapshotAt || "",
    });
  }

  async function read(id) {
    const rec = await readJson(fileOf(id), null);
    if (!rec) throw new NotFoundError("Fant ikke prosjektet");
    return rec;
  }

  function summary(rec) {
    const first = rec.pages && rec.pages[0];
    const hero = first && first.sections.find((s) => s.type === "hero");
    const thumb = (hero && hero.props.image) || rec.meta.ogImage || "";
    return {
      id: rec.id,
      name: rec.name,
      advertiser: rec.advertiser.name,
      status: rec.status,
      owner: rec.owner,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
      pages: rec.pages.length,
      sections: rec.pages.reduce((n, p) => n + p.sections.length, 0),
      thumb: thumb && rec.assets[thumb] ? thumb : "",
      round: rec.review ? rec.review.round : 0,
    };
  }

  async function findAll() {
    let names = [];
    try {
      names = await fsp.readdir(root);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    const out = [];
    for (const name of names.filter((n) => ID_RE.test(n))) {
      const rec = await readJson(path.join(root, name, "project.json"), null);
      if (rec) out.push(summary(rec));
    }
    return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async function findById(id) {
    return read(id);
  }

  async function writeVersion(id, rec, meta) {
    const dir = versionsDir(id);
    await fsp.mkdir(dir, { recursive: true });
    const file = Date.now() + "-r" + rec.rev + ".json";
    await writeJsonAtomic(path.join(dir, file), {
      at: nowIso(),
      rev: rec.rev,
      label: Doc.cleanText(meta.label || "", 80, false),
      kind: meta.kind || "manual",
      by: Doc.cleanText(meta.by || "", 80, false),
      project: rec,
    });
    // Keep the newest automatic snapshots; named, review and published
    // snapshots are never pruned.
    const all = (await fsp.readdir(dir)).filter((f) => VERSION_FILE_RE.test(f)).sort();
    if (all.length > MAX_VERSIONS) {
      const autos = [];
      for (const f of all) {
        const v = await readJson(path.join(dir, f), null);
        if (v && v.kind === "auto") autos.push(f);
      }
      const drop = autos.slice(0, all.length - MAX_VERSIONS);
      await Promise.all(drop.map((f) => fsp.rm(path.join(dir, f), { force: true })));
    }
    return file;
  }

  async function create(raw, user) {
    const content = Doc.normalizeProject(Object.assign({}, raw, { id: undefined }));
    let id = content.id;
    while (await exists(dirOf(id))) id = Doc.newId("np", 14);
    const now = nowIso();
    const rec = toRecord(content, {
      id,
      owner: user || "",
      createdAt: now,
      updatedAt: now,
      rev: 1,
      status: "draft",
      review: null,
    });
    await withLock(id, () => writeJsonAtomic(fileOf(id), rec));
    return rec;
  }

  /**
   * Save the editor's state. `baseRev` is the revision the editor last saw;
   * if someone saved in between, the save is refused (409) with the newer
   * revision so the editor can tell the user.
   */
  async function update(id, raw, opts) {
    const o = opts || {};
    return withLock(id, async () => {
      const cur = await read(id);
      if (o.baseRev !== undefined && Number(o.baseRev) !== cur.rev) {
        const err = new UserError("Prosjektet er endret av noen andre siden du åpnet det. Last inn på nytt for å se endringene.", 409);
        err.rev = cur.rev;
        err.updatedAt = cur.updatedAt;
        throw err;
      }
      const content = Doc.normalizeProject(Object.assign({}, raw, { id }));
      const now = nowIso();
      const next = toRecord(content, {
        id,
        owner: cur.owner,
        createdAt: cur.createdAt,
        updatedAt: now,
        rev: cur.rev + 1,
        status: cur.status === "approved" || cur.status === "published" ? "draft" : cur.status,
        review: cur.review,
        lastSnapshotAt: cur.lastSnapshotAt,
      });
      // An approved project that changes is no longer approved.
      if (cur.status === "review") next.status = "review";
      const last = Date.parse(cur.lastSnapshotAt || 0) || 0;
      if (Date.now() - last > AUTO_SNAPSHOT_MS) {
        await writeVersion(id, cur, { kind: "auto", label: "Automatisk", by: o.user });
        next.lastSnapshotAt = now;
      }
      await writeJsonAtomic(fileOf(id), next);
      return next;
    });
  }

  async function setStatus(id, status) {
    if (!Doc.STATUSES.includes(status)) throw new UserError("Ukjent status");
    return withLock(id, async () => {
      const cur = await read(id);
      const next = Object.assign({}, cur, { status, updatedAt: nowIso(), rev: cur.rev + 1 });
      await writeJsonAtomic(fileOf(id), next);
      return next;
    });
  }

  async function remove(id) {
    return withLock(id, async () => {
      const dir = dirOf(id);
      if (!(await exists(dir))) throw new NotFoundError("Fant ikke prosjektet");
      await fsp.mkdir(trash, { recursive: true });
      await fsp.rename(dir, path.join(trash, id + "-" + Date.now()));
    });
  }

  async function duplicate(id, user) {
    const cur = await read(id);
    const copy = Object.assign({}, cur, { name: cur.name + " (kopi)" });
    return create(copy, user);
  }

  // ---- versions -----------------------------------------------------------
  async function listVersions(id) {
    await read(id);
    let files = [];
    try {
      files = (await fsp.readdir(versionsDir(id))).filter((f) => VERSION_FILE_RE.test(f));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    const out = [];
    for (const f of files.sort().reverse()) {
      const v = await readJson(path.join(versionsDir(id), f), null);
      if (v) out.push({ file: f, at: v.at, rev: v.rev, label: v.label, kind: v.kind, by: v.by });
    }
    return out;
  }

  async function readVersion(id, file) {
    if (!VERSION_FILE_RE.test(String(file))) throw new NotFoundError("Fant ikke versjonen");
    const v = await readJson(path.join(versionsDir(id), file), null);
    if (!v) throw new NotFoundError("Fant ikke versjonen");
    return v;
  }

  async function snapshot(id, label, user, kind) {
    return withLock(id, async () => {
      const cur = await read(id);
      const file = await writeVersion(id, cur, { kind: kind || "manual", label, by: user });
      return { file };
    });
  }

  async function restore(id, file, user) {
    const v = await readVersion(id, file);
    return withLock(id, async () => {
      const cur = await read(id);
      await writeVersion(id, cur, { kind: "restore", label: "Før gjenoppretting", by: user });
      const content = Doc.normalizeProject(Object.assign({}, v.project, { id }));
      const next = toRecord(content, {
        id,
        owner: cur.owner,
        createdAt: cur.createdAt,
        updatedAt: nowIso(),
        rev: cur.rev + 1,
        status: "draft",
        review: cur.review,
        lastSnapshotAt: nowIso(),
      });
      await writeJsonAtomic(fileOf(id), next);
      return next;
    });
  }

  // ---- review rounds ------------------------------------------------------
  /**
   * Freeze the current state as a review round: a snapshot the advertiser's
   * link shows until the next round, so later edits never surprise them.
   */
  async function startReview(id, user) {
    return withLock(id, async () => {
      const cur = await read(id);
      const round = (cur.review ? cur.review.round : 0) + 1;
      const file = await writeVersion(id, cur, { kind: "review", label: "Gjennomgang " + round, by: user });
      const next = Object.assign({}, cur, {
        status: "review",
        updatedAt: nowIso(),
        rev: cur.rev + 1,
        review: {
          token: (cur.review && cur.review.token) || reviewToken(),
          round,
          version: file,
          sentAt: nowIso(),
          sentBy: Doc.cleanText(user || "", 80, false),
        },
      });
      await writeJsonAtomic(fileOf(id), next);
      return next;
    });
  }

  /** Revoke the review link (a new round gets a new token). */
  async function revokeReview(id) {
    return withLock(id, async () => {
      const cur = await read(id);
      if (!cur.review) return cur;
      const next = Object.assign({}, cur, { review: Object.assign({}, cur.review, { token: reviewToken() }), rev: cur.rev + 1 });
      await writeJsonAtomic(fileOf(id), next);
      return next;
    });
  }

  /** The project and frozen round a review link points at. */
  async function findByReviewToken(token) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,40}$/.test(token)) throw new NotFoundError("Lenken er ikke gyldig");
    let names = [];
    try {
      names = await fsp.readdir(root);
    } catch {
      names = [];
    }
    for (const name of names.filter((n) => ID_RE.test(n))) {
      const rec = await readJson(path.join(root, name, "project.json"), null);
      if (!rec || !rec.review) continue;
      const a = Buffer.from(rec.review.token);
      const b = Buffer.from(token);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        const v = await readVersion(rec.id, rec.review.version).catch(() => null);
        return { record: rec, project: v ? v.project : rec };
      }
    }
    throw new NotFoundError("Lenken er ikke gyldig eller er trukket tilbake");
  }

  // ---- comments + approvals --------------------------------------------------
  async function readComments(id) {
    const data = await readJson(commentsFile(id), null);
    return data && Array.isArray(data.comments) ? data : { comments: [], approvals: [] };
  }

  async function listComments(id) {
    await read(id);
    return readComments(id);
  }

  function cleanAnchor(a) {
    const src = a && typeof a === "object" ? a : {};
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
    };
    return {
      section: typeof src.section === "string" && ID_RE.test(src.section) ? src.section : "",
      page: typeof src.page === "string" && ID_RE.test(src.page) ? src.page : "",
      x: num(src.x),
      y: num(src.y),
      excerpt: Doc.cleanText(src.excerpt, 160, false),
      device: ["desktop", "tablet", "mobile"].includes(src.device) ? src.device : "desktop",
    };
  }

  async function addComment(id, input) {
    const text = Doc.cleanText(input.text, 2000, true).trim();
    if (!text) throw new UserError("Kommentaren er tom");
    const author = Doc.cleanText(input.author, 80, false).trim() || "Anonym";
    return withLock(id + ":comments", async () => {
      await read(id);
      const data = await readComments(id);
      if (data.comments.length >= MAX_COMMENTS) throw new UserError("Prosjektet har nådd grensen for kommentarer");
      const comment = {
        id: Doc.newId("c"),
        round: Math.max(0, Math.floor(Number(input.round) || 0)),
        author,
        from: input.from === "client" ? "client" : "team",
        text,
        anchor: cleanAnchor(input.anchor),
        parent: typeof input.parent === "string" && ID_RE.test(input.parent) ? input.parent : "",
        at: nowIso(),
        resolved: false,
      };
      const next = { comments: data.comments.concat(comment), approvals: data.approvals || [] };
      await writeJsonAtomic(commentsFile(id), next);
      return comment;
    });
  }

  async function resolveComment(id, commentId, resolved) {
    return withLock(id + ":comments", async () => {
      const data = await readComments(id);
      let found = false;
      const comments = data.comments.map((c) => {
        if (c.id !== commentId) return c;
        found = true;
        return Object.assign({}, c, { resolved: !!resolved });
      });
      if (!found) throw new NotFoundError("Fant ikke kommentaren");
      await writeJsonAtomic(commentsFile(id), { comments, approvals: data.approvals || [] });
      return comments.find((c) => c.id === commentId);
    });
  }

  async function approve(id, input) {
    const name = Doc.cleanText(input.name, 80, false).trim();
    if (name.length < 2) throw new UserError("Skriv navnet ditt for å godkjenne");
    const rec = await read(id);
    if (!rec.review || Number(input.round) !== rec.review.round) {
      throw new UserError("Det finnes en nyere versjon. Last inn siden på nytt.", 409);
    }
    const approval = { name, at: nowIso(), round: rec.review.round, version: rec.review.version };
    await withLock(id + ":comments", async () => {
      const data = await readComments(id);
      await writeJsonAtomic(commentsFile(id), { comments: data.comments, approvals: (data.approvals || []).concat(approval) });
    });
    await withLock(id, async () => {
      const cur = await read(id);
      if (cur.review && cur.review.round === approval.round) {
        await writeJsonAtomic(fileOf(id), Object.assign({}, cur, { status: "approved", rev: cur.rev + 1, updatedAt: nowIso() }));
      }
    });
    return approval;
  }

  // ---- AI log ------------------------------------------------------------------
  // One JSON line per model call: step, model, prompt version, tokens, cost.
  // Never the prompt itself (it can hold confidential material twice over).
  async function appendAiLog(id, entry) {
    await read(id);
    const line = JSON.stringify(Object.assign({ at: nowIso() }, entry)) + "\n";
    await fsp.appendFile(path.join(dirOf(id), "ai-log.jsonl"), line, "utf8");
  }

  async function aiUsage(id) {
    await read(id);
    let raw = "";
    try {
      raw = await fsp.readFile(path.join(dirOf(id), "ai-log.jsonl"), "utf8");
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    const entries = raw.split("\n").filter(Boolean).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
    const cost = entries.reduce((n, e) => n + (Number(e.cost) || 0), 0);
    return { calls: entries.length, cost, entries: entries.slice(-50) };
  }

  return {
    appendAiLog,
    aiUsage,
    findAll,
    findById,
    create,
    update,
    remove,
    duplicate,
    setStatus,
    listVersions,
    readVersion,
    snapshot,
    restore,
    startReview,
    revokeReview,
    findByReviewToken,
    listComments,
    addComment,
    resolveComment,
    approve,
    summary,
  };
}

module.exports = { createProjectStore, ID_RE };
