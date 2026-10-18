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
 *
 * Review links are looked up in a token → project index kept in memory
 * (built from the files on first use, updated on every round and revoke),
 * so an anonymous visitor never makes the server read every project.
 *
 * Comments are internal unless shared: the advertiser's link shows their own
 * comments, the replies in those threads and what the team marks "Synlig for
 * annonsøren". Team notes and AI warnings stay with the team.
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
// Every export and every publish writes a snapshot; only the newest few of
// each are worth keeping (the live page is always the newest publish).
const KEEP_BY_KIND = { export: 10, publish: 10 };
// Snapshots of these kinds only render the page; the AI state (sources,
// analysis, chat — up to a few hundred KB) stays out of them.
const LEAN_KINDS = ["export", "publish"];
const MAX_COMMENTS = 1000;

function nowIso() {
  return new Date().toISOString();
}

function reviewToken() {
  return crypto.randomBytes(18).toString("base64url");
}

/** The kind of a stored version, read from the start of the file (the key comes before the project). */
async function versionKind(file) {
  let fd;
  try {
    fd = await fsp.open(file, "r");
    const buf = Buffer.alloc(1024);
    const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
    const m = /\n "kind": "(\w+)"/.exec(buf.toString("utf8", 0, bytesRead));
    if (m) return m[1];
  } catch (err) {
    if (err.code === "ENOENT") return "";
    throw err;
  } finally {
    if (fd) await fd.close();
  }
  const v = await readJson(file, null);
  return v ? v.kind : "";
}

/**
 * The comments the advertiser's review link may show: their own, comments
 * the team shared, and replies inside a visible thread that are themselves
 * from the client or shared. Comments stored before sharing existed carry no
 * flag: a team reply in a client's thread was visible then and stays so.
 */
function sharedComments(comments) {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const own = (c) => {
    if (c.from === "client") return true;
    if (typeof c.shared === "boolean") return c.shared;
    const parent = c.parent && byId.get(c.parent);
    return !!(parent && parent.from === "client");
  };
  return comments.filter((c) => {
    if (!own(c)) return false;
    if (!c.parent) return true;
    const parent = byId.get(c.parent);
    return !!(parent && !parent.parent && own(parent));
  });
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

  /**
   * The picture on the project's card: the hero image, the share image, the
   * hero video's poster, else the first picture anywhere on the pages
   * (fields, list items, section backgrounds).
   */
  function thumbOf(rec) {
    const assets = rec.assets || {};
    const isImage = (id) => !!id && !!assets[id] && assets[id].kind === "image";
    const first = rec.pages && rec.pages[0];
    const hero = first && first.sections.find((s) => s.type === "hero");
    const posterOf = (id) => (id && assets[id] && assets[id].kind === "video" ? assets[id].poster : "");
    const candidates = [
      hero && hero.props.image,
      rec.meta && rec.meta.ogImage,
      hero && posterOf(hero.props.video),
      hero && posterOf(hero.props.videoMobile),
    ];
    const direct = candidates.find(isImage);
    if (direct) return direct;
    // usedAssets lists the pages' assets in page order (a video's poster right after it).
    const used = Doc.usedAssets({ pages: rec.pages || [], assets, theme: {}, advertiser: {}, meta: {} });
    return used.find(isImage) || "";
  }

  function summary(rec) {
    const thumb = thumbOf(rec);
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
      thumb,
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
    const kind = meta.kind || "manual";
    // Two snapshots can land in the same millisecond (an automatic one and a
    // named one): the second must not overwrite the first. Writes to one
    // project's versions run under its lock, so the check cannot race.
    let at = Date.now();
    while (await exists(path.join(dir, at + "-r" + rec.rev + ".json"))) at++;
    const file = at + "-r" + rec.rev + ".json";
    await writeJsonAtomic(path.join(dir, file), {
      at: nowIso(),
      rev: rec.rev,
      label: Doc.cleanText(meta.label || "", 80, false),
      kind,
      by: Doc.cleanText(meta.by || "", 80, false),
      project: LEAN_KINDS.includes(kind) ? Object.assign({}, rec, { ai: undefined }) : rec,
    });
    await pruneVersions(dir, kind);
    return file;
  }

  /**
   * Keep the newest export / publish snapshots, and at most MAX_VERSIONS in
   * all by dropping the oldest automatic ones. Named and review snapshots are
   * never pruned.
   */
  async function pruneVersions(dir, kind) {
    let all = (await fsp.readdir(dir)).filter((f) => VERSION_FILE_RE.test(f)).sort();
    const keep = KEEP_BY_KIND[kind];
    if (keep) {
      const same = [];
      for (const f of all) if ((await versionKind(path.join(dir, f))) === kind) same.push(f);
      const drop = same.slice(0, Math.max(0, same.length - keep));
      await Promise.all(drop.map((f) => fsp.rm(path.join(dir, f), { force: true })));
      all = all.filter((f) => !drop.includes(f));
    }
    if (all.length > MAX_VERSIONS) {
      const autos = [];
      for (const f of all) if ((await versionKind(path.join(dir, f))) === "auto") autos.push(f);
      const drop = autos.slice(0, all.length - MAX_VERSIONS);
      await Promise.all(drop.map((f) => fsp.rm(path.join(dir, f), { force: true })));
    }
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
        // An edit after sending for review or after approval means the
        // working copy is no longer what the advertiser saw. A published page
        // stays live (and "published") until it is published again.
        status: cur.status === "published" ? "published" : "draft",
        review: cur.review,
        lastSnapshotAt: cur.lastSnapshotAt,
      });
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
      // Status is bookkeeping, not content: the revision (which guards
      // against overwriting a colleague) stays as it is.
      const next = Object.assign({}, cur, { status, updatedAt: nowIso() });
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
      await indexSet(id, "");
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
      // The AI conversation is bookkeeping, not page content: it stays as it is.
      const content = Doc.normalizeProject(Object.assign({}, v.project, { id, ai: cur.ai }));
      const next = toRecord(content, {
        id,
        owner: cur.owner,
        createdAt: cur.createdAt,
        updatedAt: nowIso(),
        rev: cur.rev + 1,
        // Same rule as a save: a live page stays published until it is
        // published again; anything else is a draft again.
        status: cur.status === "published" ? "published" : "draft",
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
        review: {
          token: (cur.review && cur.review.token) || reviewToken(),
          round,
          version: file,
          sentAt: nowIso(),
          sentBy: Doc.cleanText(user || "", 80, false),
        },
      });
      await writeJsonAtomic(fileOf(id), next);
      await indexSet(id, next.review.token);
      return next;
    });
  }

  /** Revoke the review link (a new round gets a new token). */
  async function revokeReview(id) {
    return withLock(id, async () => {
      const cur = await read(id);
      if (!cur.review) return cur;
      const next = Object.assign({}, cur, { review: Object.assign({}, cur.review, { token: reviewToken() }) });
      await writeJsonAtomic(fileOf(id), next);
      await indexSet(id, next.review.token);
      return next;
    });
  }

  // ---- review link index ------------------------------------------------------
  let tokenIndex = null; // Promise<Map<token, project id>>

  async function buildIndex() {
    const map = new Map();
    let names = [];
    try {
      names = await fsp.readdir(root);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    for (const name of names.filter((n) => ID_RE.test(n))) {
      const rec = await readJson(path.join(root, name, "project.json"), null);
      if (rec && rec.review && rec.review.token) map.set(rec.review.token, rec.id);
    }
    return map;
  }

  function index() {
    if (!tokenIndex) {
      tokenIndex = buildIndex();
      tokenIndex.catch(() => {
        tokenIndex = null;
      });
    }
    return tokenIndex;
  }

  /** Point the project's link at `token` ("" = no link). */
  async function indexSet(id, token) {
    const map = await index();
    for (const [t, pid] of map) if (pid === id) map.delete(t);
    if (token) map.set(token, id);
  }

  /** The project and frozen round a review link points at. */
  async function findByReviewToken(token) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,40}$/.test(token)) throw new NotFoundError("Lenken er ikke gyldig");
    const id = (await index()).get(token);
    const rec = id ? await readJson(fileOf(id), null) : null;
    // The file is the truth; the index only says where to look.
    const a = Buffer.from((rec && rec.review && rec.review.token) || "");
    const b = Buffer.from(token);
    if (!rec || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new NotFoundError("Lenken er ikke gyldig eller er trukket tilbake");
    }
    const v = await readVersion(rec.id, rec.review.version).catch(() => null);
    return { record: rec, project: v ? v.project : rec };
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
        // Shown on the advertiser's review link? Theirs always; the team's
        // only when asked for.
        shared: input.from === "client" || input.shared === true,
      };
      const next = { comments: data.comments.concat(comment), approvals: data.approvals || [] };
      await writeJsonAtomic(commentsFile(id), next);
      return comment;
    });
  }

  /** Change a comment's `resolved` and/or `shared` flag. */
  async function updateComment(id, commentId, patch) {
    const change = {};
    if (patch && typeof patch.resolved === "boolean") change.resolved = patch.resolved;
    if (patch && typeof patch.shared === "boolean") change.shared = patch.shared;
    return withLock(id + ":comments", async () => {
      const data = await readComments(id);
      let found = false;
      const comments = data.comments.map((c) => {
        if (c.id !== commentId) return c;
        found = true;
        // A client's own comment is always visible to them.
        return Object.assign({}, c, change, c.from === "client" ? { shared: true } : {});
      });
      if (!found) throw new NotFoundError("Fant ikke kommentaren");
      await writeJsonAtomic(commentsFile(id), { comments, approvals: data.approvals || [] });
      return comments.find((c) => c.id === commentId);
    });
  }

  async function resolveComment(id, commentId, resolved) {
    return updateComment(id, commentId, { resolved: !!resolved });
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
      // Only a project still waiting for this round becomes "approved": if the
      // team has edited since, the approval is recorded but the working copy
      // is not what was approved.
      if (cur.status === "review" && cur.review && cur.review.round === approval.round) {
        await writeJsonAtomic(fileOf(id), Object.assign({}, cur, { status: "approved", updatedAt: nowIso() }));
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

  // Build the review link index right away, not on a visitor's first request.
  index().catch((err) => console.error("[native] review link index: " + err.message));

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
    updateComment,
    resolveComment,
    approve,
    summary,
  };
}

module.exports = { createProjectStore, sharedComments, ID_RE };
