"use strict";

/* =========================================================================
 * routes.js — the Native Premium API used by the editor.
 *
 *   GET    /api/native/projects                     list
 *   POST   /api/native/projects                     new {name, advertiser, brandKit?, template?}
 *   GET    /api/native/projects/:id                 one project
 *   PUT    /api/native/projects/:id                 save {project, baseRev}
 *   DELETE /api/native/projects/:id                 to the trash
 *   POST   /api/native/projects/:id/duplicate
 *   POST   /api/native/projects/:id/status          {status}
 *   GET    /api/native/projects/:id/versions        list snapshots
 *   POST   /api/native/projects/:id/versions        {label} named snapshot
 *   GET    /api/native/projects/:id/versions/:file  one snapshot
 *   POST   /api/native/projects/:id/versions/:file/restore
 *   POST   /api/native/projects/:id/review          freeze a review round → link
 *   POST   /api/native/projects/:id/review/revoke   new link token
 *   GET    /api/native/projects/:id/comments
 *   POST   /api/native/projects/:id/comments        {text, anchor, round, parent}
 *   POST   /api/native/projects/:id/comments/:cid   {resolved}
 *   GET    /api/native/projects/:id/preview[/:page] the current state as a page
 *   POST   /api/native/projects/:id/export          ZIP download
 *   POST   /api/native/projects/:id/publish         host it at /n/<slug>/
 *   DELETE /api/native/projects/:id/publish
 *   POST   /api/native/assets/{image,video,font,url}
 *   GET|POST /api/native/brandkits, DELETE /api/native/brandkits/:id
 *   GET|POST /api/native/library,   DELETE /api/native/library/:id
 *   GET|POST /api/native/settings
 *
 * Errors: a message meant for the user carries err.safe (and maybe a
 * status); anything else is logged and answered with a generic message.
 * ========================================================================= */

const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const multer = require("multer");

const Doc = require("../../public/native/doc.js");
const Templates = require("../../public/native/templates.js");
const { readJson, writeJsonAtomic, createLocks, UserError, NotFoundError } = require("./fsutil");

const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_VIDEO_BYTES = 600 * 1024 * 1024;
const MAX_FONT_BYTES = 6 * 1024 * 1024;

function fail(res, err, fallback, tag) {
  if (!(err && err.safe)) console.error("[native:" + tag + "] " + (err && err.stack ? err.stack : err));
  if (res.headersSent) return res.destroy();
  const status = err && err.safe ? err.status || 400 : 500;
  const body = { error: err && err.safe ? err.message : fallback };
  if (err && err.rev !== undefined) body.rev = err.rev;
  res.status(status).json(body);
}

/** Wrap an async handler so every error lands in fail(). */
const handle = (tag, fallback, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    fail(res, err, fallback, tag);
  }
};

function userOf(req) {
  return (req.user && req.user.name) || "";
}

function registerNativeRoutes(app, deps) {
  const { projects, assets, brandKits, library, settings, pages, safeFetch, dataDir } = deps;
  const publishedFile = path.join(dataDir, "published.json");
  const publishLock = createLocks();

  // ---- projects -----------------------------------------------------------
  app.get("/api/native/projects", handle("list", "Kunne ikke hente prosjektene", async (req, res) => {
    res.json({ projects: await projects.findAll() });
  }));

  app.post("/api/native/projects", handle("create", "Kunne ikke opprette prosjektet", async (req, res) => {
    const body = req.body || {};
    let base = { name: body.name, advertiser: body.advertiser || {} };
    if (body.brandKit) {
      const kit = await brandKits.findById(String(body.brandKit));
      base = Object.assign(base, {
        brandKit: kit.id,
        theme: kit.theme,
        assets: kit.assets,
        advertiser: Object.assign({}, kit.advertiser, body.advertiser && body.advertiser.name ? { name: body.advertiser.name } : {}),
      });
    }
    const tpl = body.template ? Templates.find(String(body.template)) : null;
    const libItem = !tpl && body.template ? await library.findById(String(body.template)).catch(() => null) : null;
    const sections = tpl ? tpl.sections : libItem ? libItem.sections.map(Doc.cloneSection) : undefined;
    if (libItem) base.assets = Object.assign({}, base.assets, libItem.assets);
    const s = await settings.get();
    const project = Doc.createProject(Object.assign({}, base, sections ? { sections } : {}));
    project.tracking.utm.source = s.utmSource;
    project.tracking.utm.medium = s.utmMedium;
    const rec = await projects.create(project, userOf(req));
    res.status(201).json({ project: rec });
  }));

  app.get("/api/native/projects/:id", handle("get", "Kunne ikke åpne prosjektet", async (req, res) => {
    res.json({ project: await projects.findById(req.params.id) });
  }));

  app.put("/api/native/projects/:id", handle("save", "Kunne ikke lagre", async (req, res) => {
    const body = req.body || {};
    if (!body.project || typeof body.project !== "object") throw new UserError("Mangler prosjektet");
    const rec = await projects.update(req.params.id, body.project, { baseRev: body.baseRev, user: userOf(req) });
    res.json({ rev: rec.rev, updatedAt: rec.updatedAt, status: rec.status });
  }));

  app.delete("/api/native/projects/:id", handle("delete", "Kunne ikke slette", async (req, res) => {
    await unpublish(req.params.id).catch(() => {});
    await projects.remove(req.params.id);
    res.json({ ok: true });
  }));

  app.post("/api/native/projects/:id/duplicate", handle("duplicate", "Kunne ikke kopiere", async (req, res) => {
    res.status(201).json({ project: await projects.duplicate(req.params.id, userOf(req)) });
  }));

  app.post("/api/native/projects/:id/status", handle("status", "Kunne ikke endre status", async (req, res) => {
    const rec = await projects.setStatus(req.params.id, String((req.body || {}).status));
    res.json({ status: rec.status, rev: rec.rev });
  }));

  // ---- versions -----------------------------------------------------------------
  app.get("/api/native/projects/:id/versions", handle("versions", "Kunne ikke hente versjonene", async (req, res) => {
    res.json({ versions: await projects.listVersions(req.params.id) });
  }));

  app.post("/api/native/projects/:id/versions", handle("snapshot", "Kunne ikke lagre versjonen", async (req, res) => {
    const label = Doc.cleanText((req.body || {}).label, 80, false).trim() || "Lagret versjon";
    res.status(201).json(await projects.snapshot(req.params.id, label, userOf(req), "manual"));
  }));

  app.get("/api/native/projects/:id/versions/:file", handle("version", "Kunne ikke hente versjonen", async (req, res) => {
    await projects.findById(req.params.id);
    res.json(await projects.readVersion(req.params.id, req.params.file));
  }));

  app.post("/api/native/projects/:id/versions/:file/restore", handle("restore", "Kunne ikke gjenopprette", async (req, res) => {
    res.json({ project: await projects.restore(req.params.id, req.params.file, userOf(req)) });
  }));

  // ---- review -------------------------------------------------------------------------
  const reviewUrl = (req, token) => {
    return "/p/" + token + "/";
  };

  app.post("/api/native/projects/:id/review", handle("review", "Kunne ikke sende til gjennomgang", async (req, res) => {
    const rec = await projects.startReview(req.params.id, userOf(req));
    res.json({ review: rec.review, url: reviewUrl(req, rec.review.token), rev: rec.rev, status: rec.status });
  }));

  app.post("/api/native/projects/:id/review/revoke", handle("revoke", "Kunne ikke trekke tilbake lenken", async (req, res) => {
    const rec = await projects.revokeReview(req.params.id);
    res.json({ review: rec.review, url: rec.review ? reviewUrl(req, rec.review.token) : "", rev: rec.rev });
  }));

  app.get("/api/native/projects/:id/comments", handle("comments", "Kunne ikke hente kommentarene", async (req, res) => {
    res.json(await projects.listComments(req.params.id));
  }));

  app.post("/api/native/projects/:id/comments", handle("comment", "Kunne ikke lagre kommentaren", async (req, res) => {
    const b = req.body || {};
    const c = await projects.addComment(req.params.id, {
      text: b.text,
      anchor: b.anchor,
      round: b.round,
      parent: b.parent,
      author: userOf(req) || b.author || "Teamet",
      from: "team",
    });
    res.status(201).json({ comment: c });
  }));

  app.post("/api/native/projects/:id/comments/:cid", handle("resolve", "Kunne ikke oppdatere kommentaren", async (req, res) => {
    res.json({ comment: await projects.resolveComment(req.params.id, req.params.cid, !!(req.body || {}).resolved) });
  }));

  // ---- preview of the current state (internal) ------------------------------------
  async function sendPreview(req, res) {
    const rec = await projects.findById(req.params.id);
    const page = rec.pages.find((p) => p.slug === req.params.page) || rec.pages[0];
    const s = await settings.get();
    const base = "/api/native/projects/" + encodeURIComponent(rec.id) + "/preview/";
    const html = await pages.renderHosted(rec, s, page, {
      mode: "preview",
      pageHref: (pg) => base + pg.slug,
    });
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.set("Cache-Control", "no-store");
    res.type("html").send(html);
  }
  app.get("/api/native/projects/:id/preview", handle("preview", "Kunne ikke vise siden", sendPreview));
  app.get("/api/native/projects/:id/preview/:page", handle("preview", "Kunne ikke vise siden", sendPreview));

  // ---- export ----------------------------------------------------------------------
  app.post("/api/native/projects/:id/export", handle("export", "Eksporten feilet", async (req, res) => {
    const rec = await projects.findById(req.params.id);
    const s = await settings.get();
    const name = Doc.slugify(rec.meta.slug || rec.name, "native") + ".zip";
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="' + name + '"');
    res.setHeader("Cache-Control", "no-store");
    await projects.snapshot(rec.id, "Eksportert", userOf(req), "export").catch(() => {});
    await pages.exportZip(rec, s, res);
  }));

  // ---- publish (hosted by ABC design) ----------------------------------------------
  async function readPublished() {
    const data = await readJson(publishedFile, {});
    return data && typeof data === "object" ? data : {};
  }

  async function unpublish(id) {
    return publishLock("published", async () => {
      const map = await readPublished();
      const next = {};
      Object.keys(map).forEach((slug) => {
        if (map[slug].id !== id) next[slug] = map[slug];
      });
      await writeJsonAtomic(publishedFile, next);
    });
  }

  app.post("/api/native/projects/:id/publish", handle("publish", "Kunne ikke publisere", async (req, res) => {
    const rec = await projects.findById(req.params.id);
    const snap = await projects.snapshot(rec.id, "Publisert", userOf(req), "publish");
    const slug = await publishLock("published", async () => {
      const map = await readPublished();
      let s = Doc.slugify(rec.meta.slug || rec.name, "annonse");
      const base = s;
      let n = 2;
      while (map[s] && map[s].id !== rec.id) s = base + "-" + n++;
      Object.keys(map).forEach((k) => {
        if (map[k].id === rec.id && k !== s) delete map[k];
      });
      map[s] = { id: rec.id, version: snap.file, at: new Date().toISOString(), by: userOf(req) };
      await writeJsonAtomic(publishedFile, map);
      return s;
    });
    await projects.setStatus(rec.id, "published");
    const st = await settings.get();
    res.json({ slug, path: "/n/" + slug + "/", url: (st.publicBaseUrl || "") + "/n/" + slug + "/" });
  }));

  app.delete("/api/native/projects/:id/publish", handle("unpublish", "Kunne ikke avpublisere", async (req, res) => {
    await projects.findById(req.params.id);
    await unpublish(req.params.id);
    await projects.setStatus(req.params.id, "approved");
    res.json({ ok: true });
  }));

  app.get("/api/native/published", handle("published", "Kunne ikke hente listen", async (req, res) => {
    res.json({ published: await readPublished() });
  }));

  // ---- assets ------------------------------------------------------------------------
  const memUpload = (max, field) =>
    multer({ storage: multer.memoryStorage(), limits: { fileSize: max, files: 1 } }).single(field || "file");
  const diskUpload = multer({
    storage: multer.diskStorage({ destination: os.tmpdir() }),
    limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
  }).single("file");

  const runUpload = (mw, req, res, limitText) =>
    new Promise((resolve, reject) => {
      mw(req, res, (err) => {
        if (!err) return resolve();
        const msg = err.code === "LIMIT_FILE_SIZE" ? "Filen er for stor (maks " + limitText + ")" : "Opplasting feilet";
        reject(new UserError(msg));
      });
    });

  app.post("/api/native/assets/image", handle("image", "Kunne ikke lagre bildet", async (req, res) => {
    await runUpload(memUpload(MAX_IMAGE_BYTES), req, res, "40 MB");
    if (!req.file) throw new UserError("Mangler bildefil");
    res.json({ asset: await assets.storeImage(req.file.buffer, { name: req.file.originalname }) });
  }));

  app.post("/api/native/assets/video", handle("video", "Kunne ikke lagre videoen", async (req, res) => {
    await runUpload(diskUpload, req, res, "600 MB");
    if (!req.file) throw new UserError("Mangler videofil");
    try {
      const b = req.body || {};
      res.json({ asset: await assets.storeVideoFile(req.file.path, { name: req.file.originalname, w: b.w, h: b.h, duration: b.duration }) });
    } finally {
      await fsp.rm(req.file.path, { force: true }).catch(() => {});
    }
  }));

  app.post("/api/native/assets/font", handle("font", "Kunne ikke lagre skriften", async (req, res) => {
    await runUpload(memUpload(MAX_FONT_BYTES), req, res, "6 MB");
    if (!req.file) throw new UserError("Mangler skriftfil");
    const b = req.body || {};
    res.json({ asset: await assets.storeFont(req.file.buffer, { name: req.file.originalname, family: b.family, weight: b.weight, style: b.style }) });
  }));

  app.post("/api/native/assets/url", handle("url", "Kunne ikke hente bildet", async (req, res) => {
    const url = String((req.body || {}).url || "").trim();
    if (!/^https?:\/\//i.test(url)) throw new UserError("Lenken må starte med https://");
    const got = await safeFetch.fetchImage(url, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 20000, headers: { "User-Agent": "Mozilla/5.0 ABCdesign" } });
    res.json({ asset: await assets.storeImage(got.buffer, { name: path.basename(new URL(got.finalUrl).pathname).slice(0, 80), source: "url" }) });
  }));

  // ---- brand kits -----------------------------------------------------------------
  app.get("/api/native/brandkits", handle("kits", "Kunne ikke hente merkevarene", async (req, res) => {
    res.json({ brandKits: await brandKits.findAll() });
  }));
  app.post("/api/native/brandkits", handle("kit", "Kunne ikke lagre merkevaren", async (req, res) => {
    res.json({ brandKit: await brandKits.upsert(req.body || {}) });
  }));
  app.delete("/api/native/brandkits/:id", handle("kitdel", "Kunne ikke slette merkevaren", async (req, res) => {
    await brandKits.remove(req.params.id);
    res.json({ ok: true });
  }));

  // ---- library ------------------------------------------------------------------------
  app.get("/api/native/library", handle("lib", "Kunne ikke hente biblioteket", async (req, res) => {
    res.json({ templates: Templates.TEMPLATES, items: await library.findAll() });
  }));
  app.post("/api/native/library", handle("libsave", "Kunne ikke lagre i biblioteket", async (req, res) => {
    res.json({ item: await library.upsert(req.body || {}, { by: userOf(req) }) });
  }));
  app.delete("/api/native/library/:id", handle("libdel", "Kunne ikke slette", async (req, res) => {
    await library.remove(req.params.id);
    res.json({ ok: true });
  }));

  // ---- settings -------------------------------------------------------------------------
  app.get("/api/native/settings", handle("settings", "Kunne ikke hente innstillingene", async (req, res) => {
    res.json({ settings: await settings.get(), ai: { configured: !!process.env.OPENROUTER_API_KEY } });
  }));
  app.post("/api/native/settings", handle("settingsSave", "Kunne ikke lagre innstillingene", async (req, res) => {
    if (req.user && req.user.role !== "admin") throw new UserError("Bare administratorer kan endre innstillingene", 403);
    res.json({ settings: await settings.save(req.body || {}) });
  }));

  return { readPublished };
}

module.exports = { registerNativeRoutes, fail, handle };
