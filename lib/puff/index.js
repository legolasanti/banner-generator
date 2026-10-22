"use strict";

/* =========================================================================
 * puff/index.js — Artikkelpuff 980×600 on the server: uploads, the export
 * (backup image + Campaign Manager 360 package), history and download.
 *
 * History layout (history/<id>/):
 *   <name>-puff-980x600.png|jpg   the backup image, also the thumbnail
 *   html/<name>-puff-980x600.zip  the creative (HTML5 exports only)
 *   project.json                  the document, to reopen it in the builder
 * ========================================================================= */

const fsp = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");
const express = require("express");
const multer = require("multer");

const PuffAd = require("../../public/assets/puff.js");
const media = require("./media");
const pkg = require("./package");

const TEMPLATE = "puff.html";
const PHOTO_QUALITY = 84;
const POSTER_QUALITY = 78;
const RETINA = 2;
const MAX_POSTER_WIDTH = 1600;

const safeError = (message) => Object.assign(new Error(message), { safe: true });

/** Pixels for one story's photo in the package: 2× its box, never upscaled. */
function packageSize(rect, box) {
  const factor = Math.min(RETINA, rect.width / box.w, rect.height / box.h);
  const k = Math.max(1, factor);
  return { width: Math.round(box.w * k), height: Math.round(box.h * k) };
}

/**
 * @param {Object} deps
 * @param {string} deps.historyDir
 * @param {string} deps.uploadsDir
 * @param {string} deps.publicDir
 * @param {string} deps.templatesDir
 * @param {Object} deps.imageTools     lib/image.js
 * @param {Object} deps.html5          lib/html5.js (ZIP names)
 * @param {Function} deps.getBrowser
 * @param {Function} deps.enqueue
 * @param {Function} deps.loadSettings
 * @param {Function} deps.budgetFor    (settings, spec) → bytes
 * @param {Function} deps.normalizeClickUrl
 * @param {Function} deps.sanitizeFilename
 * @param {Function} deps.fileStamp
 * @param {Function} deps.saveEntry    (entry) → Promise
 */
function createPuff(deps) {
  const { historyDir, publicDir, templatesDir, imageTools, getBrowser, enqueue } = deps;
  const store = media.createMediaStore({ dir: path.join(deps.uploadsDir, "puff"), getSharp: imageTools.getSharp });
  const assetsDir = path.join(publicDir, "assets");
  const SPEC = { key: "puff", width: PuffAd.WIDTH, height: PuffAd.HEIGHT, label: PuffAd.LABEL };

  // ---- validation ------------------------------------------------------------
  /**
   * The document as the export may use it: every source a stored upload of
   * the right kind, every link a valid http(s) URL. Throws a safe, Norwegian
   * message on the first problem.
   */
  async function checkDoc(input) {
    const doc = PuffAd.normalizeDoc(input);
    const ids = { slots: [], posters: [], logo: null };
    for (let i = 0; i < doc.slots.length; i++) {
      const slot = doc.slots[i];
      const name = PuffAd.SLOTS[i].name;
      if (slot.kind === "empty") throw safeError(name + " mangler bilde eller video.");
      const id = media.idFromUrl(slot.src);
      if (!id || media.kindOf(id) !== slot.kind || !(await store.exists(id))) {
        throw safeError(name + ": filen finnes ikke lenger på serveren – last den opp på nytt.");
      }
      if (!(slot.w > 0 && slot.h > 0)) throw safeError(name + ": mangler mål for " + (slot.kind === "video" ? "videoen" : "bildet") + ".");
      let poster = null;
      if (slot.kind === "video") {
        poster = media.idFromUrl(slot.poster);
        if (!poster || media.kindOf(poster) !== "image" || !(await store.exists(poster))) {
          throw safeError(name + ": stillbildet fra videoen mangler – velg videoen på nytt.");
        }
      }
      if (!slot.headline) throw safeError(name + " mangler overskrift.");
      ids.slots.push(id);
      ids.posters.push(poster);
    }
    if (doc.logo.src) {
      const logo = media.idFromUrl(doc.logo.src);
      if (!logo || !(await store.exists(logo))) throw safeError("Logoen finnes ikke lenger på serveren – last den opp på nytt.");
      ids.logo = logo;
    }

    const links = [];
    for (let i = 0; i < doc.slots.length; i++) {
      const raw = doc.slots[i].link;
      if (!raw && i > 0) {
        links.push("");
        continue;
      }
      const res = deps.normalizeClickUrl(raw);
      if (!res.ok) throw safeError(PuffAd.SLOTS[i].name + ": " + res.error.charAt(0).toLowerCase() + res.error.slice(1));
      links.push(res.url);
    }
    return { doc, ids, links };
  }

  // ---- rendering ----------------------------------------------------------------
  /** The document with every source as a file:// URL the template can load. */
  function forTemplate(doc, ids) {
    const fileUrl = (id) => (id ? pathToFileURL(store.abs(id)).href : "");
    return {
      ...doc,
      logo: { ...doc.logo, src: fileUrl(ids.logo) },
      slots: doc.slots.map((slot, i) => ({
        ...slot,
        src: fileUrl(ids.slots[i]),
        poster: fileUrl(ids.posters[i]),
      })),
    };
  }

  /**
   * Screenshot the backup image and, from the same page, the package markup.
   * @returns {Promise<{shot:Buffer, markup:string|null, fit:Array}>}
   */
  async function renderPage(doc, names, superSample) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: SPEC.width, height: SPEC.height, deviceScaleFactor: superSample ? 2 : 1 });
      await page.evaluateOnNewDocument((d) => {
        window.__DATA__ = d;
      }, { doc });
      await page.goto(pathToFileURL(path.join(templatesDir, TEMPLATE)).href, { waitUntil: "load", timeout: 20000 });
      await page.waitForFunction("window.__BANNER_READY__ === true", { timeout: 15000 });
      const { error, fit } = await page.evaluate(() => ({ error: window.__BANNER_ERROR__, fit: window.__FIT__ || [] }));
      if (error) throw new Error("Artikkelpuff render error: " + error);
      await new Promise((r) => setTimeout(r, 150));
      const shot = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: SPEC.width, height: SPEC.height },
        captureBeyondViewport: false,
      });
      const markup = names ? await page.evaluate((n) => window.__packageMarkup(n), names) : null;
      return { shot, markup, fit };
    } finally {
      await page.close().catch(() => {});
    }
  }

  // ---- package files ----------------------------------------------------------------
  async function photoFile(id, slot, box, name) {
    const sharp = imageTools.getSharp();
    const source = await fsp.readFile(store.abs(id));
    if (!sharp) return { name: name + "." + (media.extOf(id) === "png" ? "png" : "jpg"), buffer: source };
    const rect = PuffAd.visibleRect(slot.w, slot.h, box.w, box.h, slot.crop);
    const size = packageSize(rect, box);
    const buffer = await sharp(source)
      .rotate()
      .extract(rect)
      .resize(size.width, size.height, { fit: "fill" })
      .flatten({ background: "#ffffff" })
      .jpeg(imageTools.jpegOptions(PHOTO_QUALITY))
      .toBuffer();
    return { name: name + ".jpg", buffer };
  }

  async function posterFile(id, slot, box, name) {
    const sharp = imageTools.getSharp();
    const source = await fsp.readFile(store.abs(id));
    if (!sharp) return { name: name + "." + (media.extOf(id) === "png" ? "png" : "jpg"), buffer: source };
    const place = PuffAd.placement(slot.w, slot.h, box.w, box.h, slot.crop);
    const width = Math.min(MAX_POSTER_WIDTH, Math.round(place.width * 1.5));
    const buffer = await sharp(source)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg(imageTools.jpegOptions(POSTER_QUALITY))
      .toBuffer();
    return { name: name + ".jpg", buffer };
  }

  async function packageFiles(doc, ids) {
    const files = [];
    const names = { image: [], video: [], poster: [], logo: "" };
    for (let i = 0; i < doc.slots.length; i++) {
      const slot = doc.slots[i];
      const box = PuffAd.SLOTS[i].box;
      const n = i + 1;
      if (slot.kind === "image") {
        const file = await photoFile(ids.slots[i], slot, box, "image-" + n);
        files.push(file);
        names.image[i] = file.name;
      } else {
        const video = { name: "video-" + n + "." + media.extOf(ids.slots[i]), buffer: await fsp.readFile(store.abs(ids.slots[i])) };
        const poster = await posterFile(ids.posters[i], slot, box, "poster-" + n);
        files.push(video, poster);
        names.video[i] = video.name;
        names.poster[i] = poster.name;
      }
    }
    if (ids.logo) {
      files.push({ name: "logo.png", buffer: await fsp.readFile(store.abs(ids.logo)) });
      names.logo = "logo.png";
    }
    return { files, names };
  }

  async function loadFonts() {
    return Promise.all(
      pkg.FONT_FILES.map(async (name) => ({ name, buffer: await fsp.readFile(path.join(assetsDir, "fonts", name)) }))
    );
  }

  // ---- export -----------------------------------------------------------------------
  /**
   * @param {Object} body { doc, filename, outputType: "image"|"html", format: "png"|"jpeg"|"auto" }
   * @returns {Promise<{entry:Object, warnings:string[]}>}
   */
  async function exportPuff(body) {
    const b = body || {};
    const { doc, ids, links } = await checkDoc(b.doc);
    const asHtml = b.outputType === "html";
    const settings = await deps.loadSettings();
    const format = ["png", "jpeg", "auto"].includes(b.format) ? b.format : settings.export.format;
    const now = new Date();
    const baseName = deps.sanitizeFilename(b.filename || doc.slots[0].headline || "artikkelpuff") || "artikkelpuff";
    const fileBase = settings.export.includeTimestampInFilename ? baseName + "-" + deps.fileStamp(now) : baseName;
    const id = `${now.getTime()}-${baseName}-${Math.random().toString(36).slice(2, 8)}`;
    const folderAbs = path.join(historyDir, id);

    const built = asHtml ? await packageFiles(doc, ids) : null;
    const superSample = !!settings.export.superSample && imageTools.isAvailable();
    const rendered = await enqueue(() => renderPage(forTemplate(doc, ids), built && built.names, superSample));

    const limit = deps.budgetFor(settings, SPEC);
    const resampled = await imageTools.downscale(rendered.shot, SPEC.width, SPEC.height);
    const image = await imageTools.encodeToBudget(resampled, {
      format,
      maxBytes: limit,
      jpegQuality: settings.export.jpegQuality,
    });

    await fsp.mkdir(folderAbs, { recursive: true });
    const backupName = `${fileBase}-${SPEC.label}.${image.ext}`;
    await fsp.writeFile(path.join(folderAbs, backupName), image.buffer);

    const warnings = [];
    rendered.fit.forEach((f, i) => {
      if (!f.fits) warnings.push(PuffAd.SLOTS[i].name + ": overskriften er for lang og blir kuttet etter to linjer.");
    });
    const report = {
      key: SPEC.key,
      label: SPEC.label,
      file: backupName,
      width: SPEC.width,
      height: SPEC.height,
      bytes: image.bytes,
      limitBytes: limit,
      note: image.note,
      fit: rendered.fit,
    };

    let htmlFiles = null;
    if (asHtml) {
      const zip = await pkg.buildZip({
        markup: rendered.markup,
        css: await fsp.readFile(path.join(assetsDir, "puff.css"), "utf8"),
        fonts: await loadFonts(),
        files: built.files,
        links,
        title: doc.slots[0].headline.replace(/\n/g, " ").slice(0, 120),
      });
      const zipName = deps.html5.creativeZipName(fileBase, SPEC.label);
      await fsp.mkdir(path.join(folderAbs, "html"), { recursive: true });
      await fsp.writeFile(path.join(folderAbs, "html", zipName), zip);
      htmlFiles = { puff: "html/" + zipName };
      report.htmlFile = zipName;
      report.htmlBytes = zip.length;
      if (zip.length > pkg.MAX_ZIP_BYTES) {
        report.htmlNote = "over 9,5 MB – Campaign Manager 360 avviser så store pakker. Bruk kortere eller mer komprimerte videoer.";
        warnings.push("HTML5-pakken er " + (zip.length / 1048576).toFixed(1).replace(".", ",") + " MB – over grensen på 9,5 MB.");
      }
    }

    await fsp.writeFile(
      path.join(folderAbs, "project.json"),
      JSON.stringify({ v: 1, doc, filename: baseName, outputType: asHtml ? "html" : "image", format }),
      "utf8"
    );

    const entry = {
      id,
      kind: "puff",
      product: "houseads",
      filename: baseName,
      fileBase,
      timestamp: now.toISOString(),
      headline: doc.slots.map((s) => s.headline.replace(/\n/g, " ")).join(" · "),
      outputType: asHtml ? "html" : "image",
      clickUrl: links[0],
      folderPath: "history/" + id + "/",
      thumbnailPath: "history/" + id + "/" + backupName,
      files: { puff: backupName },
      htmlFiles,
      project: "project.json",
      report: [report],
    };
    await deps.saveEntry(entry);
    return { entry, warnings };
  }

  // ---- download ---------------------------------------------------------------------
  async function sendDownload(res, entry, type) {
    const folderAbs = path.join(historyDir, entry.id);
    const rel = type === "html" ? entry.htmlFiles && entry.htmlFiles.puff : entry.files && entry.files.puff;
    if (!rel) return res.status(404).json({ error: type === "html" ? "Denne oppføringen har ingen HTML5-pakke" : "Filene finnes ikke lenger" });
    const abs = path.join(folderAbs, rel);
    const ok = await fsp.access(abs).then(() => true, () => false);
    if (!ok) return res.status(404).json({ error: "Filene finnes ikke lenger" });
    return res.download(abs, path.basename(rel));
  }

  // ---- routes -------------------------------------------------------------------------
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: media.MAX_VIDEO_BYTES, files: 1 },
  }).single("file");

  function register(app) {
    const fail = (res, err, fallbackMsg, tag) => {
      if (!(err && err.safe)) console.error("[puff:" + tag + "] " + (err && err.stack ? err.stack : err));
      if (res.headersSent) return res.destroy();
      res.status(err && err.safe ? 400 : 500).json({ error: err && err.safe ? err.message : fallbackMsg });
    };

    app.post("/api/puff/media", (req, res) => {
      upload(req, res, async (err) => {
        if (err) {
          const msg = err.code === "LIMIT_FILE_SIZE" ? "Filen er for stor (maks 60 MB for video, 15 MB for bilder)" : "Opplastingen feilet";
          return res.status(400).json({ error: msg });
        }
        if (!req.file) return res.status(400).json({ error: "Ingen fil mottatt" });
        try {
          res.json(await store.save(req.file.buffer, req.query.role === "logo" ? "logo" : "media"));
        } catch (e) {
          fail(res, e, "Kunne ikke lagre filen", "media");
        }
      });
    });

    app.post("/api/puff/export", express.json({ limit: "1mb" }), async (req, res) => {
      try {
        const { entry, warnings } = await exportPuff(req.body);
        res.json({ id: entry.id, report: entry.report[0], outputType: entry.outputType, warnings });
      } catch (err) {
        fail(res, err, "Eksporten feilet", "export");
      }
    });

    // Content-hashed names never change, but uploads are user scratch, so
    // they are not cached forever. nosniff: the type was checked on the way in.
    app.use(
      media.URL_PREFIX.replace(/\/$/, ""),
      express.static(store.dir, {
        index: false,
        dotfiles: "deny",
        maxAge: "7d",
        fallthrough: false,
        setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
      })
    );
  }

  return { register, exportPuff, sendDownload, checkDoc, store };
}

module.exports = { createPuff, packageSize };
