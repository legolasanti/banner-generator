"use strict";

/* =========================================================================
 * live/index.js — NT Live on the server: reading the match sheet, building
 * the Campaign Manager 360 packages (one per format) with their backup
 * images, writing the run to history and streaming it back.
 *
 * History layout (history/<id>/):
 *   <name>-desktop-580x500.png       backup image per format (first slide at
 *   …                                export time) — also the thumbnail
 *   html/<name>-desktop-580x500.zip  the creative per format
 *   fallback.jpg                     the campaign photo, when one was uploaded
 *   project.json                     everything needed to reopen the run
 * ========================================================================= */

const fsp = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");
const archiver = require("archiver");

const LiveData = require("../../public/assets/live-data.js");
const LiveTemplates = require("../../public/assets/live-templates.js");
const links = require("../bulk/links");
const pkg = require("./package");

const MAX_SHEET_BYTES = 4 * 1024 * 1024;
const MAX_MEDIA_SOURCE_BYTES = 20 * 1024 * 1024;
const MEDIA_BOX = { width: 580, height: 300 }; // the largest photo area of the four formats
const FALLBACK_BUDGET = 70 * 1024;
const MAX_FALLBACK_DATAURL = 12 * 1024 * 1024;

const DESIGN_DEFAULTS = {
  kicker: "Oddsen",
  ctaText: "Spill nå",
  timeMode: "clock",
  clockSep: ":",
  liveLabel: "Pågår nå",
  startsLabel: "Starter",
  slideMs: 5000,
  transition: "fade",
  lookAheadDays: 1,
  finishedAfterMin: 120,
  maxSlides: 6,
  accent: "#1a6b1a",
  textScale: 1,
  defaultMedia: "gradient",
  teamsInAnimation: true,
  fallbackHeadline: "Dagens kamper på Oddsen",
  fallbackText: "Nye kamper hver dag",
  exitMode: "row",
  liveRefresh: true,
  bundleDays: 3,
  mediaKb: 45,
  template: "klassisk",
  motion: "standard",
  listTitle: "Dagens kamper",
  customHtml: "",
  customCss: "",
  customMode: "slides",
  customZone: "strip",
};

const safeError = (message) => Object.assign(new Error(message), { safe: true });

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  return isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function str(value, max) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max || 200);
}

/** Only the design fields the runtime knows, each within its range. */
function normalizeDesign(input) {
  const d = input || {};
  const pick = (key, allowed) => (allowed.includes(d[key]) ? d[key] : DESIGN_DEFAULTS[key]);
  return {
    kicker: str(d.kicker == null ? DESIGN_DEFAULTS.kicker : d.kicker, 60),
    ctaText: str(d.ctaText == null ? DESIGN_DEFAULTS.ctaText : d.ctaText, 40),
    timeMode: pick("timeMode", ["clock", "countdown", "both"]),
    clockSep: pick("clockSep", [":", "."]),
    liveLabel: str(d.liveLabel || DESIGN_DEFAULTS.liveLabel, 40),
    startsLabel: str(d.startsLabel || DESIGN_DEFAULTS.startsLabel, 40),
    slideMs: clampInt(d.slideMs, 2000, 20000, DESIGN_DEFAULTS.slideMs),
    transition: pick("transition", ["fade", "slide", "zoom", "none"]),
    lookAheadDays: clampInt(d.lookAheadDays, 0, 14, DESIGN_DEFAULTS.lookAheadDays),
    finishedAfterMin: clampInt(d.finishedAfterMin, 0, 600, DESIGN_DEFAULTS.finishedAfterMin),
    maxSlides: clampInt(d.maxSlides, 1, 12, DESIGN_DEFAULTS.maxSlides),
    accent: /^#[0-9a-fA-F]{6}$/.test(String(d.accent || "")) ? d.accent : DESIGN_DEFAULTS.accent,
    textScale: Math.max(0.6, Math.min(1.6, Number(d.textScale) || 1)),
    defaultMedia: pick("defaultMedia", ["bilde", "gradient", "lys", "striper", "puls", "konfetti"]),
    teamsInAnimation: d.teamsInAnimation !== false,
    fallbackHeadline: str(d.fallbackHeadline || DESIGN_DEFAULTS.fallbackHeadline, 90),
    fallbackText: str(d.fallbackText == null ? DESIGN_DEFAULTS.fallbackText : d.fallbackText, 90),
    exitMode: pick("exitMode", ["row", "clicktag"]),
    liveRefresh: d.liveRefresh !== false,
    bundleDays: clampInt(d.bundleDays, 0, 30, DESIGN_DEFAULTS.bundleDays),
    mediaKb: clampInt(d.mediaKb, 15, 300, DESIGN_DEFAULTS.mediaKb),
    template: pick("template", LiveTemplates.ids()),
    motion: pick("motion", ["av", "rolig", "standard", "livlig"]),
    listTitle: str(d.listTitle || DESIGN_DEFAULTS.listTitle, 60),
    // The user's own code is stored as typed (minus what may never run);
    // it is scoped and checked again by LiveTemplates.resolve() at export.
    customHtml: LiveTemplates.sanitizeHtml(typeof d.customHtml === "string" ? d.customHtml : ""),
    customCss: typeof d.customCss === "string" ? d.customCss.slice(0, LiveTemplates.MAX_CSS) : "",
    customMode: pick("customMode", ["slides", "list"]),
    customZone: pick("customZone", ["strip", "media"]),
  };
}

/**
 * Rows arrive from the browser already normalised by /api/live/sheet, but
 * they are still client input: rebuild each one from its fields.
 */
function sanitizeRows(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, LiveData.MAX_ROWS)
    .map((r, i) => {
      const raw = r || {};
      const out = LiveData.normalizeRow(
        {
          date: raw.date,
          time: raw.time,
          home: raw.home,
          away: raw.away,
          match: raw.title,
          headline: raw.home && raw.away ? "" : raw.title,
          league: raw.league,
          link: raw.link,
          image: raw.image,
          video: raw.video,
          animation: raw.animation,
          cta: raw.cta,
          text: raw.text,
          odds: raw.odds,
        },
        i
      ).row;
      return out.date && out.title ? out : null;
    })
    .filter(Boolean);
}

/**
 * The URLs the creative may fetch the sheet from at serve time, in order.
 * Both Google forms answer with CORS headers for a sheet shared as "anyone
 * with the link"; a plain https CSV link is passed through as it is.
 */
function liveUrlsFor(raw) {
  const value = String(raw || "").trim();
  if (!/^https:\/\//i.test(value)) return [];
  let url;
  try {
    url = new URL(value);
  } catch {
    return [];
  }
  if (url.hostname !== "docs.google.com") return [value];
  const gid = (url.searchParams.get("gid") || (/gid=(\d+)/.exec(url.hash || "") || [])[1] || "").replace(/\D/g, "");
  const pub = /^\/spreadsheets\/d\/e\/([\w-]+)\//.exec(url.pathname);
  if (pub) {
    const out = links.googleSheetCsvUrl(value);
    return out ? [out] : [];
  }
  const doc = /^\/spreadsheets(?:\/u\/\d+)?\/d\/([\w-]{20,})/.exec(url.pathname);
  if (!doc) return [];
  const gviz = "https://docs.google.com/spreadsheets/d/" + doc[1] + "/gviz/tq?tqx=out:csv" + (gid ? "&gid=" + gid : "");
  const exp = links.googleSheetCsvUrl(value);
  return exp ? [gviz, exp] : [gviz];
}

function dataUrlToBuffer(dataUrl) {
  const m = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  return Buffer.from(m[2].replace(/\s+/g, ""), "base64");
}

/**
 * @param {Object} deps
 * @param {string} deps.historyDir
 * @param {string} deps.publicDir
 * @param {Object} deps.formats        public/assets/formats.js
 * @param {Object} deps.imageTools     lib/image.js
 * @param {Object} deps.safeFetch
 * @param {Function} deps.renderSpec   server.js renderSpec(spec, data, browser, opts)
 * @param {Function} deps.getBrowser
 * @param {Function} deps.enqueue
 * @param {Function} deps.loadSettings
 * @param {Function} deps.budgetFor    (settings, spec) → bytes
 * @param {Function} deps.findAgeIcon  → {abs, ext} | null
 * @param {Function} deps.normalizeClickUrl
 * @param {Function} deps.sanitizeFilename
 * @param {Function} deps.fileStamp
 * @param {Function} deps.saveEntry    (entry) → Promise
 */
function createLive(deps) {
  const {
    historyDir, publicDir, formats, imageTools, safeFetch, renderSpec, getBrowser, enqueue,
    loadSettings, budgetFor, findAgeIcon, normalizeClickUrl, sanitizeFilename, fileStamp, saveEntry,
  } = deps;

  const ASSETS = path.join(publicDir, "assets");
  const PRODUCT = formats.getProduct("norsktipping");

  async function readRuntime() {
    const read = (name) => fsp.readFile(path.join(ASSETS, name), "utf8");
    const [bannerCss, liveCss, bannerJs, dataJs, liveJs, fontNames] = await Promise.all([
      read("banner.css"), read("live.css"), read("banner.js"), read("live-data.js"), read("live.js"),
      fsp.readdir(path.join(ASSETS, "fonts")).catch(() => []),
    ]);
    const fonts = await Promise.all(
      fontNames
        .filter((n) => n.startsWith(PRODUCT.fontPrefix) && n.endsWith(".woff2"))
        .map(async (name) => ({ name, buffer: await fsp.readFile(path.join(ASSETS, "fonts", name)) }))
    );
    return { bannerCss, liveCss, scripts: [bannerJs, dataJs, liveJs], fonts };
  }

  // ---- the sheet -----------------------------------------------------------
  async function readSheet(body) {
    const b = body || {};
    if (typeof b.text === "string" && b.text.trim()) {
      if (b.text.length > MAX_SHEET_BYTES) throw safeError("Teksten er for lang");
      return { source: { kind: "paste", liveUrls: [] }, ...LiveData.readTable(LiveData.parseCsv(b.text)) };
    }
    const raw = String(b.url || "").trim();
    if (!raw) throw safeError("Lim inn lenken til regnearket, eller cellene fra det");
    const csvUrl = links.googleSheetCsvUrl(raw);
    if (links.looksLikeGoogleSheet(raw) && !csvUrl) throw safeError("Lenken ser ut som Google Sheets, men mangler regnearkets ID");
    const target = csvUrl || raw;
    if (!/^https?:\/\//i.test(target)) throw safeError("Lenken må starte med https://");
    let fetched;
    try {
      fetched = await safeFetch.fetchImage(target, {
        maxBytes: MAX_SHEET_BYTES,
        timeoutMs: 15000,
        headers: { "User-Agent": "Mozilla/5.0 ABCdesign", Accept: "text/csv,text/plain,*/*;q=0.5" },
      });
    } catch (err) {
      if (err && err.safe && /HTTP 40[134]/.test(err.message) && csvUrl) {
        throw safeError("Fikk ikke tilgang til regnearket. Del det som «Alle med lenken» (Leser) – det må annonsen også ha for å oppdatere seg.");
      }
      if (err && err.safe) throw safeError(err.message.replace(/bildet/gi, "regnearket"));
      throw err;
    }
    const text = fetched.buffer.toString("utf8");
    if (/text\/html/i.test(fetched.contentType) || /^\s*<(!doctype|html)/i.test(text.slice(0, 200))) {
      throw safeError(csvUrl ? "Regnearket er ikke delt. Velg Del → «Alle med lenken» (Leser) i Google Sheets." : "Lenken går til en nettside, ikke til et regneark.");
    }
    const table = LiveData.readTable(LiveData.parseCsv(text));
    return { source: { kind: csvUrl ? "google" : "url", url: raw, liveUrls: liveUrlsFor(raw) }, ...table };
  }

  // ---- media ---------------------------------------------------------------
  /**
   * Fetch and shrink the photos of the matches within `bundleDays`, one file
   * per distinct URL. Failures are reported, never fatal: the row falls back
   * to loading its URL at serve time.
   */
  async function bundleMedia(rows, design, now) {
    const today = LiveData.osloParts(now).ymd;
    const wanted = [];
    const seen = new Set();
    for (const row of rows) {
      if (!row.image || seen.has(row.image)) continue;
      const offset = LiveData.dayDiff(today, row.date);
      if (offset < 0 || offset > design.bundleDays) continue;
      seen.add(row.image);
      wanted.push(row);
    }
    const files = [];
    const map = {};
    const warnings = [];
    let n = 0;
    for (const row of wanted) {
      try {
        const fetched = await safeFetch.fetchImage(links.directImageUrl(row.image), {
          maxBytes: MAX_MEDIA_SOURCE_BYTES,
          timeoutMs: 20000,
          headers: { "User-Agent": "Mozilla/5.0 ABCdesign", Accept: "image/*,*/*;q=0.5" },
        });
        if (!imageTools.sniffExtension(fetched.buffer)) throw safeError("lenken ga ikke et bilde");
        const photo = await imageTools.preparePhoto(fetched.buffer, MEDIA_BOX, { maxBytes: design.mediaKb * 1024 });
        n++;
        const name = "media/" + n + "." + photo.ext;
        files.push({ name, buffer: photo.buffer, source: row.image });
        map[row.image] = name;
      } catch (err) {
        warnings.push({ row: row.sheetRow || 0, message: "Bildet til «" + row.title + "» ble ikke pakket inn (" + (err && err.message ? err.message : "ukjent feil") + "); det hentes fra lenken når annonsen vises." });
      }
    }
    return { files, map, warnings };
  }

  async function prepareFallback(dataUrl) {
    if (!dataUrl) return null;
    if (String(dataUrl).length > MAX_FALLBACK_DATAURL) throw safeError("Reservebildet er for stort (maks ~9 MB)");
    const buffer = dataUrlToBuffer(dataUrl);
    if (!buffer || !imageTools.sniffExtension(buffer)) throw safeError("Reservebildet er ikke et gyldig bilde");
    const photo = await imageTools.preparePhoto(buffer, MEDIA_BOX, { maxBytes: FALLBACK_BUDGET });
    return { name: "fallback." + photo.ext, buffer: photo.buffer, mime: photo.mime };
  }

  const toDataUrl = (file) => "data:" + (file.mime || (file.name.endsWith(".png") ? "image/png" : "image/jpeg")) + ";base64," + file.buffer.toString("base64");

  // ---- export ----------------------------------------------------------------
  /**
   * Build every selected format, write the run to history and return the entry.
   * @param {Object} body  { name, filename, clickUrl, keys, design, rows, source, fallbackImage, badges }
   */
  async function exportAll(body) {
    const b = body || {};
    const click = normalizeClickUrl(b.clickUrl);
    if (!click.ok) throw safeError(click.error);
    const design = normalizeDesign(b.design);
    design.clickUrl = click.url;
    const rows = sanitizeRows(b.rows);
    if (!rows.length) throw safeError("Ingen gyldige kamper – hent regnearket først");
    const keys = Array.isArray(b.keys) && b.keys.length ? b.keys : PRODUCT.specs.map((s) => s.key);
    const specs = PRODUCT.specs.filter((s) => keys.includes(s.key));
    if (!specs.length) throw safeError("Velg minst ett format");

    const settings = await loadSettings();
    const now = new Date();
    const badges = {
      annonseText: settings.staticBadges.annonseText,
      ageBadgeText: settings.staticBadges.ageBadgeText,
      vinnersjanse: str((b.badges || {}).vinnersjanse, 120),
      showVinnerOnNewsgrid: !!(b.badges || {}).showVinnerOnNewsgrid,
    };
    const ageIcon = await findAgeIcon();
    const runtime = await readRuntime();
    const media = await bundleMedia(rows, design, now);
    const fallback = await prepareFallback(b.fallbackImage);
    const liveUrls = design.liveRefresh ? liveUrlsFor(b.source && b.source.url) : [];
    const warnings = media.warnings.slice();
    if (design.liveRefresh && !liveUrls.length) {
      warnings.push({ row: 0, message: "Live-oppdatering krever en delt Google Sheets-lenke; pakken bruker bare kampene som ble hentet nå." });
    }

    const baseName = sanitizeFilename(b.filename || b.name || "nt-live");
    const fileBase = settings.export.includeTimestampInFilename ? baseName + "-" + fileStamp(now) : baseName;
    const id = `${now.getTime()}-${baseName}-${Math.random().toString(36).slice(2, 8)}`;
    const folderAbs = path.join(historyDir, id);
    await fsp.mkdir(path.join(folderAbs, "html"), { recursive: true });

    const extras = [];
    if (ageIcon) extras.push({ name: "age-icon." + ageIcon.ext, buffer: await fsp.readFile(ageIcon.abs) });
    const packageConfig = {
      rows,
      design: { ...design, customHtml: undefined, customCss: undefined },
      template: LiveTemplates.resolve(design),
      badges: { ...badges, ageIconUrl: ageIcon ? "age-icon." + ageIcon.ext : "" },
      assets: { media: media.map, fallback: fallback ? fallback.name : "" },
      source: { liveUrls },
      generatedAt: now.toISOString(),
    };
    // The backup render runs from a file:// page, so everything the first
    // slide might show has to be reachable without the ZIP: media as data
    // URLs, the custom mark by its absolute path.
    const previewMedia = {};
    for (const file of media.files) previewMedia[file.source] = toDataUrl(file);
    const previewConfig = {
      ...packageConfig,
      badges: { ...badges, ageIconUrl: ageIcon ? pathToFileURL(ageIcon.abs).href : "" },
      assets: { media: previewMedia, fallback: fallback ? toDataUrl(fallback) : "" },
      source: { liveUrls: [] },
    };

    const title = str(b.name || baseName, 120);
    const files = {};
    const htmlFiles = {};
    const report = [];
    const liveSpecs = specs.map((spec) => ({ ...spec, file: "live.html" }));

    const backups = await enqueue(async () => {
      const browser = await getBrowser();
      const out = {};
      for (const spec of liveSpecs) {
        out[spec.key] = await renderSpec(spec, { config: previewConfig, now: now.toISOString() }, browser, {
          scale: 1,
          format: "png",
          superSample: !!settings.export.superSample,
          maxBytes: budgetFor(settings, spec),
          jpegQuality: settings.export.jpegQuality,
        });
      }
      return out;
    });

    for (const spec of specs) {
      const backup = backups[spec.key];
      const backupName = `${fileBase}-${spec.label}.${backup.image.ext}`;
      await fsp.writeFile(path.join(folderAbs, backupName), backup.image.buffer);
      files[spec.key] = backupName;

      const zip = await pkg.buildZip({
        spec,
        bannerCss: runtime.bannerCss,
        liveCss: runtime.liveCss,
        scripts: runtime.scripts,
        fonts: runtime.fonts,
        files: [...media.files.map((f) => ({ name: f.name, buffer: f.buffer })), ...(fallback ? [fallback] : []), ...extras],
        config: packageConfig,
        clickUrl: click.url,
        title,
      });
      const zipName = deps.html5.creativeZipName(fileBase, spec.label);
      await fsp.writeFile(path.join(folderAbs, "html", zipName), zip);
      htmlFiles[spec.key] = "html/" + zipName;
      const limit = budgetFor(settings, spec);
      report.push({
        key: spec.key,
        label: spec.label,
        file: backupName,
        width: spec.width,
        height: spec.height,
        bytes: backup.image.bytes,
        limitBytes: limit,
        note: backup.image.note,
        htmlFile: zipName,
        htmlBytes: zip.length,
        htmlNote: limit && zip.length > limit ? "over " + Math.round(limit / 1024) + " KB – færre innpakkede bilder (Dager med bilder i pakken) eller lavere KB per bilde gjør pakken mindre" : "",
      });
    }

    if (fallback) await fsp.writeFile(path.join(folderAbs, fallback.name), fallback.buffer);
    const project = {
      v: 1,
      name: title,
      filename: baseName,
      clickUrl: click.url,
      keys: specs.map((s) => s.key),
      design,
      badges,
      rows,
      source: { url: (b.source && b.source.url) || "", liveUrls },
      fallbackImage: fallback ? fallback.name : "",
    };
    await fsp.writeFile(path.join(folderAbs, "project.json"), JSON.stringify(project), "utf8");

    const picked = LiveData.select(rows, now, design);
    const entry = {
      id,
      kind: "live",
      product: "norsktipping",
      filename: baseName,
      fileBase,
      timestamp: now.toISOString(),
      headline: title,
      outputType: "html",
      clickUrl: click.url,
      folderPath: "history/" + id + "/",
      thumbnailPath: "history/" + id + "/" + files[specs[0].key],
      files,
      htmlFiles,
      project: "project.json",
      live: { rows: rows.length, today: picked.scope === "today" ? picked.slides.length : 0, bundled: media.files.length, liveRefresh: liveUrls.length > 0 },
      report,
    };
    await saveEntry(entry);
    return { entry, warnings };
  }

  // ---- download ----------------------------------------------------------------
  async function exists(p) {
    return fsp.access(p).then(() => true, () => false);
  }

  async function sendDownload(res, entry, type) {
    const folderAbs = path.join(historyDir, entry.id);
    const wantHtml = type === "html";
    const map = wantHtml ? entry.htmlFiles || {} : entry.files || {};
    const keys = PRODUCT.specs.map((s) => s.key).filter((k) => map[k]);
    const present = [];
    for (const key of keys) if (await exists(path.join(folderAbs, map[key]))) present.push(key);
    if (!present.length) return res.status(404).json({ error: wantHtml ? "Denne oppføringen har ingen HTML5-pakker" : "Filene finnes ikke lenger" });
    if (present.length === 1) {
      const rel = map[present[0]];
      return res.download(path.join(folderAbs, rel), path.basename(rel));
    }
    const base = entry.fileBase || entry.filename || "nt-live";
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${base}${wantHtml ? "-html" : ""}.zip"`);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("warning", (e) => console.warn("[archiver:live] " + e.message));
    archive.on("error", (e) => {
      console.error("[archiver:live] " + e.message);
      if (!res.headersSent) res.status(500).json({ error: "Kunne ikke lage ZIP" });
      else res.destroy();
    });
    archive.pipe(res);
    const entries = [];
    for (const key of present) {
      const rel = map[key];
      archive.file(path.join(folderAbs, rel), { name: path.basename(rel), store: true });
      const row = (entry.report || []).find((r) => r.key === key) || {};
      entries.push({ zipName: path.basename(rel), width: row.width, height: row.height, bytes: (wantHtml ? row.htmlBytes : row.bytes) || 0 });
      const backup = entry.files && entry.files[key];
      if (wantHtml && backup && (await exists(path.join(folderAbs, backup)))) {
        archive.file(path.join(folderAbs, backup), { name: "reservebilder/" + backup, store: true });
      }
    }
    if (wantHtml) {
      let project = {};
      try {
        project = JSON.parse(await fsp.readFile(path.join(folderAbs, "project.json"), "utf8"));
      } catch {
        /* an older entry without a project file still downloads */
      }
      const design = normalizeDesign(project.design);
      archive.append(
        pkg.readMe({
          entries,
          design,
          clickUrl: entry.clickUrl || "",
          fileBase: base,
          generatedAt: new Date(entry.timestamp).toLocaleString("nb-NO", { timeZone: "Europe/Oslo" }),
          liveRefresh: !!(project.source && project.source.liveUrls && project.source.liveUrls.length),
          templateName: design.template === LiveTemplates.CUSTOM_ID ? "Egen kode" : (LiveTemplates.byId(design.template) || {}).name,
        }),
        { name: "LES-MEG.txt" }
      );
    }
    await archive.finalize();
  }

  // ---- routes --------------------------------------------------------------------
  function register(app) {
    const fail = (res, err, fallbackMsg, tag) => {
      if (!(err && err.safe)) console.error("[live:" + tag + "] " + (err && err.stack ? err.stack : err));
      if (res.headersSent) return res.destroy();
      res.status(err && err.safe ? 400 : 500).json({ error: err && err.safe ? err.message : fallbackMsg });
    };

    app.post("/api/live/sheet", async (req, res) => {
      try {
        res.json(await readSheet(req.body));
      } catch (err) {
        fail(res, err, "Kunne ikke lese regnearket", "sheet");
      }
    });

    app.post("/api/live/export", async (req, res) => {
      try {
        const { entry, warnings } = await exportAll(req.body);
        res.json({ id: entry.id, report: entry.report, live: entry.live, warnings });
      } catch (err) {
        fail(res, err, "Eksporten feilet", "export");
      }
    });

    app.get("/api/live/template.csv", (req, res) => {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="nt-live-mal.csv"');
      res.send("﻿" + LiveData.templateCsv());
    });
  }

  return { readSheet, exportAll, sendDownload, register, normalizeDesign, sanitizeRows, liveUrlsFor, DESIGN_DEFAULTS };
}

module.exports = { createLive, normalizeDesign, sanitizeRows, liveUrlsFor, DESIGN_DEFAULTS };
