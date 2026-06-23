"use strict";

/* =========================================================================
 * Banner Generator — Express + Puppeteer backend
 *
 * Generates ad banners in 3 fixed sizes (ReadPeak 308×380, Desktop 580×500,
 * Mobile 320×400) from one uploaded photo + a few text fields, and returns a
 * ZIP of the three PNGs. Keeps the last 30 packages in history/ and stores
 * editable settings in settings.json. No database — flat files only.
 * ========================================================================= */

const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { pathToFileURL } = require("url");

const express = require("express");
const multer = require("multer");
const archiver = require("archiver");
const puppeteer = require("puppeteer");

// --------------------------------------------------------------------------
// Paths & constants
// --------------------------------------------------------------------------
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const ASSETS_DIR = path.join(PUBLIC_DIR, "assets");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const UPLOADS_DIR = path.join(ROOT, "uploads");
const HISTORY_DIR = path.join(ROOT, "history");
// Kept OUTSIDE HISTORY_DIR so the static /history mount cannot serve the index.
const HISTORY_JSON = path.join(ROOT, "history.json");
const SETTINGS_JSON = path.join(ROOT, "settings.json");
const LOGO_PATH = path.join(ASSETS_DIR, "hjelpelinjen-logo.png");

const PORT = process.env.PORT || 4050;
const MAX_HISTORY = 30;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

// The three banner formats. `key` is used in the API/UI, `file` is the
// Puppeteer template, width/height are the exact output pixel dimensions.
const SPECS = [
  { key: "readpeak", file: "readpeak.html", width: 308, height: 380, label: "readpeak-308x380" },
  { key: "desktop", file: "desktop.html", width: 580, height: 500, label: "desktop-580x500" },
  { key: "mobile", file: "mobile.html", width: 320, height: 400, label: "mobile-320x400" },
];

const DEFAULT_SETTINGS = {
  gamePresets: [
    { id: "vikinglotto", label: "Vikinglotto", vinnersjanse: "Vinnersjanse 1.premie 1:61 mill. per rekke" },
    { id: "eurojackpot", label: "Eurojackpot", vinnersjanse: "Vinnersjanse 1.premie 1:140 mill. per rekke" },
    { id: "lotto", label: "Lotto", vinnersjanse: "Vinnersjanse 1.premie 1:5,4 mill. per rekke" },
    { id: "sport", label: "Sport (ingen vinnersjanse)", vinnersjanse: "" },
  ],
  staticBadges: {
    annonseText: "Annonse",
    ageBadgeText: "18+ | Hjelpelinjen.no",
  },
  export: {
    jpegQuality: 92,
    includeTimestampInFilename: false,
  },
};

// --------------------------------------------------------------------------
// Small utilities
// --------------------------------------------------------------------------
function ensureDirsSync() {
  for (const dir of [PUBLIC_DIR, ASSETS_DIR, TEMPLATES_DIR, UPLOADS_DIR, HISTORY_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeFilename(name) {
  let s = String(name == null ? "" : name).trim().toLowerCase();
  s = s.replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a");
  // strip remaining accents/diacritics
  s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/\s+/g, "-");
  s = s.replace(/[^a-z0-9-]/g, "");
  s = s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  s = s.slice(0, 60).replace(/^-+|-+$/g, "");
  return s || "banner";
}

function clampNumber(value, min, max, fallback) {
  let n = Number(value);
  if (!isFinite(n)) n = fallback;
  return Math.max(min, Math.min(max, n));
}

function fileStamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}`
  );
}

async function pathExists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

// Atomic JSON write: write a temp file in the same directory then rename over
// the target (rename is atomic on one filesystem). Prevents a crash mid-write
// from leaving a truncated, unreadable file.
async function writeJsonAtomic(target, data) {
  const tmp = target + "." + process.pid + "." + Date.now() + ".tmp";
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  try {
    await fsp.rename(tmp, target);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

// Single shared promise chain that serializes every read-modify-write of
// history.json, so concurrent generate/delete requests can never clobber each
// other's update (lost-update race).
let _historyLock = Promise.resolve();
function withHistoryLock(task) {
  const run = _historyLock.then(task, task);
  _historyLock = run.then(
    () => {},
    () => {}
  );
  return run;
}

// --------------------------------------------------------------------------
// Settings persistence
// --------------------------------------------------------------------------
function slugify(s) {
  return (
    sanitizeFilename(s).replace(/-/g, "") ||
    "preset" + Math.random().toString(36).slice(2, 7)
  );
}

function normalizeSettings(raw) {
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.gamePresets)) {
      const seen = new Set();
      out.gamePresets = raw.gamePresets
        .filter((g) => g && typeof g === "object")
        .map((g) => {
          let id = String(g.id || slugify(g.label || "")).trim() || slugify(g.label || "");
          while (seen.has(id)) id = id + "-" + Math.random().toString(36).slice(2, 5);
          seen.add(id);
          return {
            id,
            label: String(g.label || "").trim() || "Uten navn",
            vinnersjanse: String(g.vinnersjanse || ""),
          };
        });
      if (out.gamePresets.length === 0) {
        out.gamePresets = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.gamePresets));
      }
    }
    if (raw.staticBadges && typeof raw.staticBadges === "object") {
      out.staticBadges.annonseText =
        String(raw.staticBadges.annonseText || DEFAULT_SETTINGS.staticBadges.annonseText).slice(0, 40);
      out.staticBadges.ageBadgeText =
        String(raw.staticBadges.ageBadgeText || DEFAULT_SETTINGS.staticBadges.ageBadgeText).slice(0, 60);
    }
    if (raw.export && typeof raw.export === "object") {
      out.export.jpegQuality = Math.round(clampNumber(raw.export.jpegQuality, 70, 100, 92));
      out.export.includeTimestampInFilename = !!raw.export.includeTimestampInFilename;
    }
  }
  return out;
}

async function loadSettings() {
  try {
    const txt = await fsp.readFile(SETTINGS_JSON, "utf8");
    return normalizeSettings(JSON.parse(txt));
  } catch {
    const def = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    await saveSettings(def).catch(() => {});
    return def;
  }
}

async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  await writeJsonAtomic(SETTINGS_JSON, normalized);
  return normalized;
}

// --------------------------------------------------------------------------
// History persistence
// --------------------------------------------------------------------------
async function loadHistory() {
  try {
    const txt = await fsp.readFile(HISTORY_JSON, "utf8");
    const arr = JSON.parse(txt);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeHistory(arr) {
  await writeJsonAtomic(HISTORY_JSON, arr);
}

async function trimHistory(arr) {
  if (arr.length <= MAX_HISTORY) return arr;
  const keep = arr.slice(0, MAX_HISTORY);
  const drop = arr.slice(MAX_HISTORY);
  for (const entry of drop) {
    const dir = path.join(HISTORY_DIR, entry.id);
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  return keep;
}

// --------------------------------------------------------------------------
// Puppeteer: single shared browser + serialized generation queue
// --------------------------------------------------------------------------
const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--hide-scrollbars",
  "--font-render-hinting=none",
  "--force-color-profile=srgb",
];

// Build an ordered list of launch strategies. The bundled Chromium that ships
// with a pinned Puppeteer can lag new OS releases (e.g. it fails to launch on
// very recent macOS), so we prefer an explicit binary / the installed Chrome
// first, and keep bundled Chromium as a fallback (ideal on Linux servers).
function launchCandidates() {
  const base = { headless: "new", args: LAUNCH_ARGS };
  const list = [];
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath) {
    list.push({ desc: "env PUPPETEER_EXECUTABLE_PATH", opts: { ...base, executablePath: envPath } });
    return list;
  }
  if (process.platform === "darwin") {
    const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    if (fs.existsSync(macChrome)) {
      list.push({ desc: "system Google Chrome (macOS)", opts: { ...base, executablePath: macChrome } });
    }
  }
  list.push({ desc: "bundled Chromium", opts: { ...base } });
  list.push({ desc: "installed Chrome (channel)", opts: { ...base, channel: "chrome" } });
  return list;
}

let _browser = null;
let _launching = null;

async function launchFirstWorking() {
  const candidates = launchCandidates();
  let lastErr;
  for (const c of candidates) {
    try {
      const b = await puppeteer.launch(c.opts);
      console.log("[puppeteer] launched via " + c.desc);
      return b;
    } catch (err) {
      lastErr = err;
      console.warn("[puppeteer] " + c.desc + " failed: " + (err.message || err).split("\n")[0]);
    }
  }
  throw lastErr || new Error("Ingen Chrome/Chromium kunne startes");
}

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  if (!_launching) {
    _launching = launchFirstWorking()
      .then((b) => {
        _browser = b;
        b.on("disconnected", () => {
          console.warn("[puppeteer] browser disconnected — will relaunch on next use");
          _browser = null;
        });
        console.log("[puppeteer] browser ready (pid " + (b.process() ? b.process().pid : "?") + ")");
        return b;
      })
      .finally(() => {
        _launching = null;
      });
  }
  return _launching;
}

async function renderBannerPng(spec, data, browser) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: spec.width, height: spec.height, deviceScaleFactor: 1 });
    // Inject data BEFORE any script in the template runs.
    await page.evaluateOnNewDocument((d) => {
      window.__DATA__ = d;
    }, data);
    const fileUrl = pathToFileURL(path.join(TEMPLATES_DIR, spec.file)).href;
    await page.goto(fileUrl, { waitUntil: "load", timeout: 20000 });
    await page.waitForFunction("window.__BANNER_READY__ === true", { timeout: 12000 });
    const renderError = await page.evaluate(() => window.__BANNER_ERROR__ || null);
    if (renderError) throw new Error("Template (" + spec.key + ") render error: " + renderError);
    // settle paint
    await new Promise((r) => setTimeout(r, 250));
    const buffer = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: spec.width, height: spec.height },
      captureBeyondViewport: false,
    });
    return buffer;
  } finally {
    await page.close().catch(() => {});
  }
}

async function generateAllBuffers(data) {
  // One retry for the whole batch if the browser died mid-render.
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const browser = await getBrowser();
      const out = {};
      for (const spec of SPECS) {
        out[spec.key] = await renderBannerPng(spec, data, browser);
      }
      return out;
    } catch (err) {
      lastErr = err;
      console.warn("[generate] attempt " + (attempt + 1) + " failed: " + err.message);
      if (_browser) {
        await _browser.close().catch(() => {});
        _browser = null;
      }
    }
  }
  throw lastErr;
}

// Simple FIFO queue so only one generation runs at a time (avoids Puppeteer
// contention). Each task is chained onto the previous regardless of outcome.
let _queue = Promise.resolve();
function enqueue(task) {
  const run = _queue.then(task, task);
  _queue = run.then(
    () => {},
    () => {}
  );
  return run;
}

// --------------------------------------------------------------------------
// Express app
// --------------------------------------------------------------------------
const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "1mb" }));

// Static: app frontend + history (read-only, for thumbnails / re-download)
app.use(express.static(PUBLIC_DIR));
app.use("/history", express.static(HISTORY_DIR));

// Multer (in-memory; we convert straight to base64 — no temp files to leak)
const ACCEPTED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter(req, file, cb) {
    const ok = ACCEPTED_IMAGE_MIMES.includes(file.mimetype);
    cb(ok ? null : new Error("Kun JPG, PNG, WEBP, AVIF eller GIF er tillatt"), ok);
  },
}).single("image");

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("Logo må være PNG, JPG eller WEBP"), ok);
  },
}).single("logo");

function withMulter(mw) {
  return (req, res, next) =>
    mw(req, res, (err) => {
      if (err) {
        const msg =
          err.code === "LIMIT_FILE_SIZE" ? "Filen er for stor (maks 10 MB)" : err.message || "Opplasting feilet";
        return res.status(400).json({ error: msg });
      }
      next();
    });
}

// --------------------------------------------------------------------------
// Routes
// --------------------------------------------------------------------------
app.get("/api/health", async (req, res) => {
  res.json({ ok: true, browser: !!(_browser && _browser.isConnected()), queueedAt: Date.now() });
});

// ---- Generate -------------------------------------------------------------
app.post("/api/generate", withMulter(uploadImage), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Mangler bilde. Last opp en JPG, PNG eller WEBP." });
    }

    const settings = await loadSettings();
    const b = req.body || {};

    const headline = String(b.headline || "").slice(0, 200);
    const subtitle = String(b.subtitle || "").slice(0, 80);
    const brandLabel = String(b.brandLabel || "NORSK TIPPING").slice(0, 60);
    const vinnersjanse = String(b.vinnersjanse || "").slice(0, 120);
    const imagePositionX = clampNumber(b.imagePositionX, 0, 100, 50);
    const imagePositionY = clampNumber(b.imagePositionY, 0, 100, 50);
    const imageZoom = clampNumber(b.imageZoom, 0, 30, 0);
    const headlineScale = clampNumber(b.headlineScale, 0.5, 2, 1);
    const subtitleScale = clampNumber(b.subtitleScale, 0.5, 2, 1);
    const lesMerStyle = b.lesMerStyle === "text" ? "text" : "button";
    const accentColor = /^#[0-9a-fA-F]{3,8}$/.test(String(b.accentColor || "")) ? String(b.accentColor) : "#000000";
    const baseName = sanitizeFilename(b.filename);

    const includeTs = settings.export.includeTimestampInFilename;
    const now = new Date();
    const fileBase = includeTs ? `${baseName}-${fileStamp(now)}` : baseName;

    const logoUrl = (await pathExists(LOGO_PATH)) ? pathToFileURL(LOGO_PATH).href : "";
    const imageDataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

    const data = {
      imageDataUrl,
      imagePositionX,
      imagePositionY,
      imageZoom,
      headlineScale,
      subtitleScale,
      headline,
      subtitle,
      brandLabel,
      vinnersjanse,
      lesMerStyle,
      accentColor,
      logoUrl,
      annonseText: settings.staticBadges.annonseText,
      ageBadgeText: settings.staticBadges.ageBadgeText,
    };

    // Serialize the heavy Puppeteer work.
    const buffers = await enqueue(() => generateAllBuffers(data));

    // Persist to history/<id>/ — id carries a short random suffix so two
    // generations in the same millisecond with the same filename can't collide.
    const timestamp = now.getTime();
    const id = `${timestamp}-${baseName}-${Math.random().toString(36).slice(2, 8)}`;
    const folderRel = `history/${id}`;
    const folderAbs = path.join(HISTORY_DIR, id);
    await fsp.mkdir(folderAbs, { recursive: true });

    const files = {};
    for (const spec of SPECS) {
      const fname = `${fileBase}-${spec.label}.png`;
      await fsp.writeFile(path.join(folderAbs, fname), buffers[spec.key]);
      files[spec.key] = fname;
    }

    const entry = {
      id,
      filename: baseName,
      fileBase,
      timestamp: now.toISOString(),
      headline,
      subtitle,
      vinnersjanse,
      folderPath: folderRel + "/",
      thumbnailPath: `${folderRel}/${files.desktop}`,
      files,
    };

    // Atomic, serialized history update (no lost-update race with other requests).
    await withHistoryLock(async () => {
      let history = await loadHistory();
      history.unshift(entry);
      history = await trimHistory(history);
      await writeHistory(history);
    });

    // Stream ZIP of the three freshly-rendered PNGs.
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.zip"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("warning", (e) => console.warn("[archiver] " + e.message));
    archive.on("error", (e) => {
      console.error("[archiver] " + e.message);
      if (!res.headersSent) res.status(500).json({ error: "Kunne ikke lage ZIP" });
      else res.destroy();
    });
    archive.pipe(res);
    for (const spec of SPECS) {
      archive.append(buffers[spec.key], { name: files[spec.key] });
    }
    await archive.finalize();
  } catch (err) {
    console.error("[generate] " + (err && err.stack ? err.stack : err));
    if (!res.headersSent) {
      res.status(500).json({ error: "Generering feilet: " + (err && err.message ? err.message : "ukjent feil") });
    } else {
      res.destroy();
    }
  }
});

// ---- History --------------------------------------------------------------
app.get("/api/history", async (req, res) => {
  res.json(await loadHistory());
});

app.get("/api/history/:id/download", async (req, res) => {
  const history = await loadHistory();
  const entry = history.find((e) => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Fant ikke historikk-oppføring" });

  const folderAbs = path.join(HISTORY_DIR, entry.id);
  if (!(await pathExists(folderAbs))) {
    return res.status(404).json({ error: "Filene finnes ikke lenger" });
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${entry.fileBase || entry.filename}.zip"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (e) => {
    console.error("[archiver:history] " + e.message);
    if (!res.headersSent) res.status(500).json({ error: "Kunne ikke lage ZIP" });
    else res.destroy();
  });
  archive.pipe(res);
  const files = entry.files || {};
  for (const spec of SPECS) {
    const fname = files[spec.key];
    if (fname && (await pathExists(path.join(folderAbs, fname)))) {
      archive.file(path.join(folderAbs, fname), { name: fname });
    }
  }
  await archive.finalize();
});

app.delete("/api/history/:id", async (req, res) => {
  const result = await withHistoryLock(async () => {
    const history = await loadHistory();
    const idx = history.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return { ok: false };
    const [entry] = history.splice(idx, 1);
    // entry.id is our own stored id (not raw user input) → safe path join.
    await fsp.rm(path.join(HISTORY_DIR, entry.id), { recursive: true, force: true }).catch(() => {});
    await writeHistory(history);
    return { ok: true };
  });
  if (!result.ok) return res.status(404).json({ error: "Fant ikke oppføring" });
  res.json({ ok: true });
});

// ---- Settings -------------------------------------------------------------
app.get("/api/settings", async (req, res) => {
  res.json(await loadSettings());
});

app.post("/api/settings", async (req, res) => {
  try {
    const saved = await saveSettings(req.body || {});
    res.json(saved);
  } catch (err) {
    console.error("[settings] " + err.message);
    res.status(400).json({ error: "Kunne ikke lagre innstillinger" });
  }
});

app.post("/api/settings/logo", withMulter(uploadLogo), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Mangler logo-fil" });
    await fsp.mkdir(ASSETS_DIR, { recursive: true });
    await fsp.writeFile(LOGO_PATH, req.file.buffer);
    res.json({ ok: true, logoUrl: "/assets/hjelpelinjen-logo.png?v=" + Date.now() });
  } catch (err) {
    console.error("[logo] " + err.message);
    res.status(500).json({ error: "Kunne ikke lagre logo" });
  }
});

// ---- Fetch image from URL (proxy) ----------------------------------------
// Lets a user paste a Norsk Tipping image link (often AVIF) instead of
// downloading + converting. Server-side fetch avoids browser CORS, and a basic
// SSRF guard blocks private/loopback targets.
function isPrivateHost(host) {
  const h = (host || "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) return true;
  if (["0.0.0.0", "127.0.0.1", "::1", "[::1]"].includes(h)) return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // link-local / cloud metadata
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true; // ULA / link-local IPv6
  return false;
}

function sniffImageMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.slice(0, 3).toString("ascii") === "GIF") return "image/gif";
  // ISO-BMFF: 'ftyp' at offset 4, brand contains 'avif'/'avis'/'heic'
  if (buf.slice(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.slice(8, 20).toString("ascii");
    if (brand.includes("avif") || brand.includes("avis")) return "image/avif";
    if (brand.includes("heic") || brand.includes("heif") || brand.includes("mif1")) return "image/heic";
  }
  return null;
}

app.post("/api/fetch-image", async (req, res) => {
  try {
    const url = String((req.body && req.body.url) || "").trim();
    if (!url) return res.status(400).json({ error: "Mangler lenke (URL)" });
    let u;
    try {
      u = new URL(url);
    } catch {
      return res.status(400).json({ error: "Ugyldig URL" });
    }
    if (!/^https?:$/.test(u.protocol)) return res.status(400).json({ error: "Bare http(s)-lenker er tillatt" });
    if (isPrivateHost(u.hostname)) return res.status(400).json({ error: "Lenken peker til en privat/lokal adresse" });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let r;
    try {
      r = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          // Browser-like UA: some image CDNs reject non-browser agents.
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!r.ok) return res.status(400).json({ error: "Kunne ikke hente bildet (HTTP " + r.status + ")" });

    const declared = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0) return res.status(400).json({ error: "Lenken returnerte et tomt svar" });
    if (buf.length > MAX_UPLOAD_BYTES) return res.status(400).json({ error: "Bildet er for stort (maks 10 MB)" });

    let mime = ACCEPTED_IMAGE_MIMES.includes(declared) ? declared : null;
    if (!mime) mime = sniffImageMime(buf); // some CDNs send octet-stream
    if (!mime || !["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"].includes(mime)) {
      return res.status(400).json({ error: "Lenken er ikke et støttet bilde (JPG/PNG/WEBP/AVIF/GIF)" });
    }

    let name = "bilde";
    try {
      const last = decodeURIComponent(u.pathname.split("/").pop() || "");
      if (last) name = last.replace(/\.[a-z0-9]+$/i, "") || "bilde";
    } catch {}

    res.json({
      dataUrl: `data:${mime};base64,${buf.toString("base64")}`,
      mimetype: mime,
      size: buf.length,
      name,
    });
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    console.warn("[fetch-image] " + (err && err.message ? err.message : err));
    res.status(400).json({ error: aborted ? "Tidsavbrudd – lenken svarte ikke" : "Kunne ikke hente bildet fra lenken" });
  }
});

// SPA-ish fallback to index for unknown non-API GETs
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  if (req.method !== "GET") return next();
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// JSON error fallback
app.use((err, req, res, next) => {
  console.error("[error] " + (err && err.stack ? err.stack : err));
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Serverfeil" });
});

// --------------------------------------------------------------------------
// Startup
// --------------------------------------------------------------------------
async function start() {
  ensureDirsSync();
  await loadSettings(); // creates settings.json if missing
  if (!(await pathExists(HISTORY_JSON))) await writeHistory([]);

  const server = app.listen(PORT, () => {
    console.log(`\n  Banner Generator kjører på  http://localhost:${PORT}\n`);
  });

  // Warm up the browser in the background so the first generation is fast.
  getBrowser().catch((e) => console.warn("[puppeteer] warm-up failed (vil prøve igjen ved bruk): " + e.message));

  const shutdown = async (sig) => {
    console.log(`\n[${sig}] avslutter…`);
    server.close();
    if (_browser) await _browser.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((e) => {
  console.error("Oppstart feilet:", e);
  process.exit(1);
});
