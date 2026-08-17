"use strict";

/* =========================================================================
 * Banner Generator — Express + Puppeteer backend
 *
 * Generates ad banners in 4 fixed sizes (ReadPeak 308×380, Desktop 580×500,
 * Mobile 320×400, Nyhetsgrid 190×190) from one uploaded photo + a few text
 * fields. Every generation renders and saves all four; the caller then picks
 * which combination to download (the original 3, the 190×190 alone, or all
 * 4 zipped together) without re-rendering. Keeps the last 30 packages in
 * history/ and stores editable settings in settings.json. No database —
 * flat files only.
 *
 * Two output kinds come off the same render:
 *   • "image" — PNG/JPEG, supersampled then resampled down and squeezed to a
 *     per-file byte budget (see lib/image.js).
 *   • "html"  — a Campaign Manager 360 HTML5 creative ZIP per format, with the
 *     headline kept as live text (see lib/html5.js).
 * ========================================================================= */

const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { pathToFileURL } = require("url");

const express = require("express");
const multer = require("multer");
const archiver = require("archiver");
const puppeteer = require("puppeteer");

const imageTools = require("./lib/image");
const html5 = require("./lib/html5");
const safeFetch = require("./lib/safe-fetch");

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
const FONTS_DIR = path.join(ASSETS_DIR, "fonts");
const BANNER_CSS = path.join(ASSETS_DIR, "banner.css");
// Optional replacement for the Norsk Tipping mark in the 18+ badge. When none
// of these exist, banner.js draws its built-in inline SVG. Only types Campaign
// Manager 360 accepts inside a creative ZIP — a WEBP mark would be copied into
// every HTML5 package and get the whole creative rejected.
const AGE_ICON_EXTS = ["svg", "png", "jpg"];
const ageIconPath = (ext) => path.join(ASSETS_DIR, "age-icon." + ext);

const PORT = process.env.PORT || 4050;
const MAX_HISTORY = 30;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
// Headroom below the per-file budget for the HTML5 photo, so index.html and
// the two fonts (~25 KB) still fit inside the same limit as the image export.
const HTML_PHOTO_RESERVE_BYTES = 40 * 1024;

// The three original banner formats. `key` is used in the API/UI, `file` is
// the Puppeteer template, width/height are the exact output pixel dimensions,
// and `media` is the photo area inside the banner — it must stay in sync with
// the .bn__media heights in public/assets/banner.css, because the HTML5 export
// sizes the shipped photo from it.
const CORE_SPECS = [
  { key: "readpeak", file: "readpeak.html", width: 308, height: 380, label: "readpeak-308x380", media: { width: 308, height: 160 } },
  { key: "desktop", file: "desktop.html", width: 580, height: 500, label: "desktop-580x500", media: { width: 580, height: 355 } },
  { key: "mobile", file: "mobile.html", width: 320, height: 400, label: "mobile-320x400", media: { width: 320, height: 275 } },
];
// Fourth format: the 190×190 front-page news-grid placement. Kept out of
// CORE_SPECS so it can be downloaded on its own or bundled with the core
// three, per how the placement is actually traded (see /api/generate).
const NEWSGRID_SPEC = { key: "newsgrid", file: "newsgrid.html", width: 190, height: 190, label: "newsgrid-190x190", media: { width: 190, height: 107 } };
const SPECS = CORE_SPECS.concat(NEWSGRID_SPEC);

function specsForSet(set) {
  if (set === "newsgrid") return [NEWSGRID_SPEC];
  if (set === "core") return CORE_SPECS;
  return SPECS; // "all" / anything else
}

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
    // Preferred download format. The byte budget below can still override it:
    // a banner that will not fit as PNG is written as JPEG rather than shipped
    // over the limit. "auto" simply says "whatever is smallest that fits".
    format: "png", // "png" | "jpeg" | "auto"
    // Per-file ceiling in KB. 200 is the ad-server limit these banners are
    // traded under; 0 turns the budget off entirely.
    maxFileSizeKb: 200,
    // Render at ~2× and resample down with Lanczos-3 instead of rasterising
    // straight at final size. Costs a little time, removes the softness in the
    // photo. Requires sharp; ignored when it is unavailable.
    superSample: true,
  },
};

// Landing pages for the HTML5 export. Kept deliberately strict: the value ends
// up inside a <script> in a file we hand to an ad server.
function normalizeClickUrl(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (!value) return { ok: false, error: "Mangler klikk-lenke (landingsside-URL)" };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "Klikk-lenken er ikke en gyldig URL" };
  }
  if (!/^https?:$/.test(url.protocol)) {
    return { ok: false, error: "Klikk-lenken må starte med http:// eller https://" };
  }
  return { ok: true, url: url.href };
}

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

// The 18+ badge draws its Norsk Tipping mark as an inline SVG (see banner.js),
// so nothing has to exist on disk. This only finds a replacement someone
// uploaded under Innstillinger, which both previews and renders then use.
async function findAgeIcon() {
  for (const ext of AGE_ICON_EXTS) {
    const abs = ageIconPath(ext);
    if (await pathExists(abs)) return { abs, ext, rel: "assets/age-icon." + ext };
  }
  return null;
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
      out.export.format = ["jpeg", "auto", "png"].includes(raw.export.format) ? raw.export.format : "png";
      // 0 = off; otherwise clamp to something an ad server would plausibly ask
      // for. Absent (older settings.json) falls back to the 200 KB default.
      out.export.maxFileSizeKb =
        raw.export.maxFileSizeKb === 0 || raw.export.maxFileSizeKb === "0"
          ? 0
          : Math.round(clampNumber(raw.export.maxFileSizeKb, 10, 5000, DEFAULT_SETTINGS.export.maxFileSizeKb));
      out.export.superSample =
        raw.export.superSample === undefined ? true : !!raw.export.superSample;
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
  // NOTE: deliberately NOT using --font-render-hinting=none. Disabling hinting
  // makes text softer; keeping default hinting renders crisp, Canva-like text
  // even at 1× resolution.
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

/**
 * Render one banner format and return the finished file — plus, when the HTML5
 * export asked for it, the markup that produced it.
 *
 * Supersampling is the quality fix: Chrome rasterises a big source photo
 * straight into a small banner box with a cheap filter, and that is where the
 * softness came from. Rendering at roughly 2× and resampling down with
 * Lanczos-3 (lib/image.js) keeps the detail. Text is unaffected either way —
 * it is drawn from vectors at whatever resolution we render at.
 *
 * @returns {Promise<{image: {buffer:Buffer,ext:string,mime:string,bytes:number,note:string},
 *                    markup: string|null, width: number, height: number}>}
 */
async function renderSpec(spec, data, browser, opts) {
  const o = opts || {};
  const scale = clampNumber(o.scale, 1, 2, 1);
  const outWidth = Math.round(spec.width * scale);
  const outHeight = Math.round(spec.height * scale);
  const canProcess = imageTools.isAvailable();
  const superSample = !!o.superSample && canProcess;
  // Cap at 3×: beyond that the screenshot gets big and slow for no visible gain.
  const dpr = superSample ? Math.min(3, scale * 2) : scale;
  const wantJpegShot = !canProcess && o.format === "jpeg";

  const page = await browser.newPage();
  try {
    // deviceScaleFactor > 1 renders at higher resolution; the screenshot pixel
    // size becomes logical size × dpr.
    await page.setViewport({ width: spec.width, height: spec.height, deviceScaleFactor: dpr });
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

    const shot = {
      // With sharp present we always capture lossless and encode once, at the
      // end, from the best possible source. Without it, Chrome's own encoder
      // has to produce the final file directly.
      type: wantJpegShot ? "jpeg" : "png",
      clip: { x: 0, y: 0, width: spec.width, height: spec.height },
      captureBeyondViewport: false,
    };
    if (wantJpegShot) shot.quality = Math.round(clampNumber(o.jpegQuality, 70, 100, 92));

    const raw = await page.screenshot(shot);
    const resampled = await imageTools.downscale(raw, outWidth, outHeight);
    const image = await imageTools.encodeToBudget(resampled, {
      format: o.format,
      maxBytes: o.maxBytes,
      jpegQuality: o.jpegQuality,
    });

    // The HTML5 creative reuses the exact DOM that was just screenshotted, with
    // the inlined data: URLs swapped for the filenames that go in the ZIP. Done
    // in-page rather than by string surgery so the rewrite can never mangle a
    // base64 payload.
    let markup = null;
    if (o.assetNames) {
      markup = await page.evaluate((names) => {
        const root = document.getElementById("banner-root");
        if (!root) return null;
        const photo = root.querySelector(".bn__img");
        if (photo) photo.setAttribute("src", names.photo);
        const icon = root.querySelector("img.bn__age-icon");
        if (icon && names.icon) icon.setAttribute("src", names.icon);
        return root.outerHTML;
      }, o.assetNames);
    }

    return { image, markup, width: outWidth, height: outHeight };
  } finally {
    await page.close().catch(() => {});
  }
}

async function generateAll(data, opts) {
  // One retry for the whole batch if the browser died mid-render.
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const browser = await getBrowser();
      const out = {};
      for (const spec of SPECS) {
        out[spec.key] = await renderSpec(spec, data, browser, opts);
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
// HTML5 (Campaign Manager 360) packaging
// --------------------------------------------------------------------------
async function loadFontFiles() {
  const names = await fsp.readdir(FONTS_DIR).catch(() => []);
  return Promise.all(
    names
      .filter((name) => name.endsWith(".woff2"))
      .map(async (name) => ({ name, buffer: await fsp.readFile(path.join(FONTS_DIR, name)) }))
  );
}

/**
 * Build one Campaign Manager 360 HTML5 ZIP per format under history/<id>/html/.
 *
 * The byte budget applies to the finished ZIP, not to one file inside it, so
 * the photo only gets the budget minus what the fonts and markup already cost.
 * If the package still overshoots (an unusually detailed photo), the photo
 * budget is tightened by the overshoot and the package is rebuilt once.
 *
 * @returns {Promise<Object<string,string>>} spec key → path relative to the entry folder
 */
async function buildHtmlPackages(params) {
  const { folderAbs, fileBase, rendered, photoBuffer, zoom, clickUrl, ageIcon, maxBytes, photoName, title, report } =
    params;

  const css = await fsp.readFile(BANNER_CSS, "utf8");
  const fonts = await loadFontFiles();
  const icon = ageIcon ? { name: "age-icon." + ageIcon.ext, buffer: await fsp.readFile(ageIcon.abs) } : null;
  const fixedBytes =
    fonts.reduce((sum, font) => sum + font.buffer.length, 0) + (icon ? icon.buffer.length : 0) + 8 * 1024;
  const overhead = Math.max(HTML_PHOTO_RESERVE_BYTES, fixedBytes);

  const htmlDir = path.join(folderAbs, "html");
  await fsp.mkdir(htmlDir, { recursive: true });

  const out = {};
  for (const spec of SPECS) {
    const result = rendered[spec.key];
    if (!result.markup) throw new Error("Mangler markup for " + spec.key + " – kunne ikke bygge HTML5-pakken");

    let photoBudget = maxBytes ? Math.max(50 * 1024, maxBytes - overhead) : 0;
    let zip = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const photo = await imageTools.preparePhoto(photoBuffer, spec.media, { zoom, maxBytes: photoBudget });
      zip = await html5.buildCreativeZip({
        spec,
        markup: result.markup,
        css,
        fonts,
        icon,
        clickUrl,
        title,
        photo: { name: photoName, buffer: photo.buffer },
      });
      if (!maxBytes || zip.length <= maxBytes) break;
      photoBudget = Math.max(40 * 1024, photoBudget - (zip.length - maxBytes) - 4 * 1024);
    }

    const zipName = html5.creativeZipName(fileBase, spec.label);
    await fsp.writeFile(path.join(htmlDir, zipName), zip);
    out[spec.key] = "html/" + zipName;

    const row = report && report.find((entry) => entry.key === spec.key);
    if (row) {
      row.htmlFile = zipName;
      row.htmlBytes = zip.length;
    }
  }
  return out;
}

/**
 * Stream an HTML5 download.
 *
 * One format goes out as the CM360 ZIP itself — that file IS the creative you
 * upload. Several formats cannot be merged into one CM360 creative, so they
 * travel inside an outer ZIP as separate ready-to-upload packages, alongside
 * the backup images CM360 asks for and a short Norwegian read-me.
 */
async function sendHtmlDownload(res, ctx) {
  const { folderAbs, fileBase, setSpecs, htmlFiles, files, clickUrl } = ctx;
  const available = setSpecs.filter((spec) => htmlFiles && htmlFiles[spec.key]);
  if (!available.length) {
    return res.status(404).json({ error: "Denne oppføringen har ingen HTML5-pakker" });
  }

  if (available.length === 1) {
    const rel = htmlFiles[available[0].key];
    const abs = path.join(folderAbs, rel);
    if (!(await pathExists(abs))) return res.status(404).json({ error: "HTML5-pakken finnes ikke lenger" });
    return res.download(abs, path.basename(rel));
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${fileBase}-html.zip"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("warning", (e) => console.warn("[archiver:html] " + e.message));
  archive.on("error", (e) => {
    console.error("[archiver:html] " + e.message);
    if (!res.headersSent) res.status(500).json({ error: "Kunne ikke lage ZIP" });
    else res.destroy();
  });
  archive.pipe(res);

  const listed = [];
  for (const spec of available) {
    const rel = htmlFiles[spec.key];
    const abs = path.join(folderAbs, rel);
    if (!(await pathExists(abs))) continue;
    // store: the nested ZIPs and the JPEG backups are already compressed.
    archive.file(abs, { name: path.basename(rel), store: true });
    listed.push({ zipName: path.basename(rel), width: spec.width, height: spec.height });

    const backup = files && files[spec.key];
    if (backup && (await pathExists(path.join(folderAbs, backup)))) {
      archive.file(path.join(folderAbs, backup), { name: "reservebilder/" + backup, store: true });
    }
  }
  archive.append(Buffer.from(html5.READ_ME(fileBase, clickUrl || "", listed), "utf8"), { name: "LES-MEG.txt" });
  await archive.finalize();
}

// --------------------------------------------------------------------------
// Express app
// --------------------------------------------------------------------------
const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  // The download filename and the per-file size report travel as headers, so
  // they have to be readable by the page that asked for them.
  res.header("Access-Control-Expose-Headers", "Content-Disposition, X-Entry-Id, X-Banner-Report");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// The UI is served from the same origin it calls, so a state-changing request
// carrying a FOREIGN Origin is not this app — it is some other page open in the
// operator's browser reaching localhost. Block those: they could otherwise
// rewrite settings, swap the 18+ badge mark or delete history. Requests with no
// Origin at all (curl, scripts) are left alone; a browser always sends one on a
// cross-origin write.
const READ_ONLY_METHODS = ["GET", "HEAD", "OPTIONS"];
app.use((req, res, next) => {
  if (READ_ONLY_METHODS.includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next();
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: "Ugyldig Origin" });
  }
  if (originHost !== req.get("host")) {
    return res.status(403).json({ error: "Forespørselen kom fra et annet nettsted og ble blokkert" });
  }
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

// PNG/JPG only, deliberately. SVG is out because an uploaded one would be
// served from this origin and SVG can carry script — and the built-in mark is
// already vector, so nothing is lost. (A hand-placed assets/age-icon.svg is
// still honoured; that needs filesystem access anyway.) WEBP is out because
// the mark is copied into every Campaign Manager 360 package, and WEBP is not
// an accepted asset type there.
const uploadBadgeIcon = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = ["image/jpeg", "image/png"].includes(file.mimetype);
    cb(ok ? null : new Error("Ikonet må være PNG eller JPG"), ok);
  },
}).single("icon");

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
    // An empty Merkevare field means "no label", not "use the default" — the
    // default belongs to the form, so only a request that omits the field
    // entirely falls back to it (kept for older clients / direct API calls).
    const brandLabel = (b.brandLabel == null ? "NORSK TIPPING" : String(b.brandLabel)).slice(0, 60);
    const vinnersjanse = String(b.vinnersjanse || "").slice(0, 120);
    // Vinnersjanse defaults OFF on the 190×190 Nyhetsgrid (image too small to
    // read it well) — only switched on explicitly when fronting a jackpot.
    const showVinnerOnNewsgrid = b.showVinnerOnNewsgrid === "1" || b.showVinnerOnNewsgrid === "true";
    const imagePositionX = clampNumber(b.imagePositionX, 0, 100, 50);
    const imagePositionY = clampNumber(b.imagePositionY, 0, 100, 50);
    const imageZoom = clampNumber(b.imageZoom, 0, 30, 0);
    // Per-format headline scales (+ fallback to a legacy global headlineScale)
    const legacyHl = clampNumber(b.headlineScale, 0.5, 2, 1);
    const hlReadpeak = clampNumber(b.headlineScaleReadpeak, 0.5, 2, legacyHl);
    const hlDesktop = clampNumber(b.headlineScaleDesktop, 0.5, 2, legacyHl);
    const hlMobile = clampNumber(b.headlineScaleMobile, 0.5, 2, legacyHl);
    const hlNewsgrid = clampNumber(b.headlineScaleNewsgrid, 0.5, 2, legacyHl);
    const subtitleScale = clampNumber(b.subtitleScale, 0.5, 2, 1);
    const lesMerSize = clampNumber(b.lesMerSize, 12, 28, 17);
    const lesMerStyle = b.lesMerStyle === "button" ? "button" : "text";
    const accentColor = /^#[0-9a-fA-F]{3,8}$/.test(String(b.accentColor || "")) ? String(b.accentColor) : "#2f2f2f";
    // 1× is the size the ad server actually takes; 1.5×/2× exist for retina
    // and for reuse outside the placement.
    const resolution = clampNumber(b.resolution, 1, 2, 1);
    const format = ["png", "jpeg", "auto"].includes(b.format) ? b.format : settings.export.format || "png";
    const maxBytes = settings.export.maxFileSizeKb > 0 ? settings.export.maxFileSizeKb * 1024 : 0;
    const baseName = sanitizeFilename(b.filename);

    // "image" = flattened PNG/JPEG. "html" = a Campaign Manager 360 HTML5
    // creative per format, where the headline stays live text.
    const outputType = b.outputType === "html" ? "html" : "image";
    let clickUrl = "";
    let photoAsset = null;
    if (outputType === "html") {
      const parsed = normalizeClickUrl(b.clickUrl);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      clickUrl = parsed.url;
      photoAsset = imageTools.photoAsset(req.file.buffer);
      if (!photoAsset.ok) {
        return res.status(400).json({
          error:
            "HTML5-pakken kan bare bruke JPG, PNG eller GIF når bildebiblioteket (sharp) mangler. " +
            "Kjør «npm install» på nytt, eller last opp bildet som JPG.",
        });
      }
    }
    // An HTML5 creative is always its ad.size, so the resolution control only
    // affects the images. Forcing 1× keeps the backup images the same size as
    // the creative — Campaign Manager 360 requires them to match.
    const renderScale = outputType === "html" ? 1 : resolution;

    const includeTs = settings.export.includeTimestampInFilename;
    const now = new Date();
    const fileBase = includeTs ? `${baseName}-${fileStamp(now)}` : baseName;

    const ageIcon = await findAgeIcon();
    const imageDataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

    const data = {
      imageDataUrl,
      imagePositionX,
      imagePositionY,
      imageZoom,
      headlineScaleReadpeak: hlReadpeak,
      headlineScaleDesktop: hlDesktop,
      headlineScaleMobile: hlMobile,
      headlineScaleNewsgrid: hlNewsgrid,
      subtitleScale,
      lesMerSize,
      headline,
      subtitle,
      brandLabel,
      vinnersjanse,
      showVinnerOnNewsgrid,
      lesMerStyle,
      accentColor,
      ageIconUrl: ageIcon ? pathToFileURL(ageIcon.abs).href : "",
      annonseText: settings.staticBadges.annonseText,
      ageBadgeText: settings.staticBadges.ageBadgeText,
    };

    // Serialize the heavy Puppeteer work.
    const rendered = await enqueue(() =>
      generateAll(data, {
        scale: renderScale,
        superSample: settings.export.superSample,
        format,
        maxBytes,
        jpegQuality: settings.export.jpegQuality,
        // Only pay for the markup capture when an HTML5 package needs it.
        assetNames:
          outputType === "html"
            ? { photo: photoAsset.name, icon: ageIcon ? "age-icon." + ageIcon.ext : "" }
            : null,
      })
    );

    // Persist to history/<id>/ — id carries a short random suffix so two
    // generations in the same millisecond with the same filename can't collide.
    const timestamp = now.getTime();
    const id = `${timestamp}-${baseName}-${Math.random().toString(36).slice(2, 8)}`;
    const folderRel = `history/${id}`;
    const folderAbs = path.join(HISTORY_DIR, id);
    await fsp.mkdir(folderAbs, { recursive: true });

    // The extension follows what the encoder actually produced: a PNG that
    // could not be squeezed under the byte budget comes back as a JPEG, and
    // the file it is written to has to say so.
    const files = {};
    const report = [];
    for (const spec of SPECS) {
      const result = rendered[spec.key];
      const fname = `${fileBase}-${spec.label}.${result.image.ext}`;
      await fsp.writeFile(path.join(folderAbs, fname), result.image.buffer);
      files[spec.key] = fname;
      report.push({
        key: spec.key,
        label: spec.label,
        file: fname,
        width: result.width,
        height: result.height,
        bytes: result.image.bytes,
        note: result.image.note,
      });
    }

    let htmlFiles = null;
    if (outputType === "html") {
      htmlFiles = await buildHtmlPackages({
        folderAbs,
        fileBase,
        rendered,
        photoBuffer: req.file.buffer,
        zoom: imageZoom,
        clickUrl,
        ageIcon,
        maxBytes,
        photoName: photoAsset.name,
        title: headline || baseName,
        report,
      });
    }

    const entry = {
      id,
      filename: baseName,
      fileBase,
      timestamp: now.toISOString(),
      headline,
      subtitle,
      vinnersjanse,
      outputType,
      clickUrl,
      folderPath: folderRel + "/",
      thumbnailPath: `${folderRel}/${files.desktop}`,
      files,
      htmlFiles,
      report,
    };

    // Atomic, serialized history update (no lost-update race with other requests).
    await withHistoryLock(async () => {
      let history = await loadHistory();
      history.unshift(entry);
      history = await trimHistory(history);
      await writeHistory(history);
    });

    // All four formats are rendered above and saved to history regardless.
    // `downloadSet` only controls what THIS response streams — the other
    // combinations remain one click away via /api/history/:id/download,
    // reusing the files already on disk (no re-render needed):
    //   "core"     → the original 3 (ReadPeak/Desktop/Mobil) — default
    //   "newsgrid" → just the 190×190 news-grid placement, as a single file
    //   "all"      → all 4, zipped together
    const downloadSet = ["core", "newsgrid", "all"].includes(b.downloadSet) ? b.downloadSet : "core";
    const setSpecs = specsForSet(downloadSet);
    res.setHeader("X-Entry-Id", id);
    // Per-file sizes + any note ("saved as JPEG because PNG missed 200 KB"),
    // so the UI can show what actually came out instead of leaving the user to
    // discover it in Finder.
    res.setHeader("X-Banner-Report", encodeURIComponent(JSON.stringify(report)));

    if (outputType === "html") {
      return sendHtmlDownload(res, { folderAbs, fileBase, setSpecs, htmlFiles, files, clickUrl });
    }

    if (downloadSet === "newsgrid") {
      const spec = setSpecs[0];
      res.setHeader("Content-Type", rendered[spec.key].image.mime);
      res.setHeader("Content-Disposition", `attachment; filename="${files[spec.key]}"`);
      return res.send(rendered[spec.key].image.buffer);
    }

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
    for (const spec of setSpecs) {
      archive.append(rendered[spec.key].image.buffer, { name: files[spec.key] });
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

  // ?set=core|newsgrid|all — which formats to include. Defaults to "all" so
  // the plain history "Last ned" link keeps giving everything that was
  // generated for that entry (older entries simply lack a "newsgrid" file,
  // and are skipped below, same as any other missing/removed file).
  const set = ["core", "newsgrid", "all"].includes(req.query.set) ? req.query.set : "all";
  const setSpecs = specsForSet(set);
  const files = entry.files || {};

  // ?type=html — the Campaign Manager 360 packages, when this entry was
  // generated as HTML5. Image entries simply have no htmlFiles and 404.
  if (req.query.type === "html") {
    return sendHtmlDownload(res, {
      folderAbs,
      fileBase: entry.fileBase || entry.filename,
      setSpecs,
      htmlFiles: entry.htmlFiles,
      files,
      clickUrl: entry.clickUrl,
    });
  }

  if (set === "newsgrid") {
    const spec = setSpecs[0];
    const fname = files[spec.key];
    const fpath = fname && path.join(folderAbs, fname);
    if (!fname || !(await pathExists(fpath))) {
      return res.status(404).json({ error: "Nyhetsgrid-filen finnes ikke for denne oppføringen" });
    }
    return res.download(fpath, fname);
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
  for (const spec of setSpecs) {
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
// The response carries two READ-ONLY extras next to the saved settings:
// `ageIcon` (a custom mark, if one was uploaded) and `imageTools`, so the UI
// can say out loud when the byte budget cannot be enforced. Both are ignored
// on the way back in — see normalizeSettings().
app.get("/api/settings", async (req, res) => {
  const settings = await loadSettings();
  const icon = await findAgeIcon();
  let version = 0;
  if (icon) {
    version = await fsp
      .stat(icon.abs)
      .then((s) => Math.round(s.mtimeMs))
      .catch(() => 0);
  }
  res.json({
    ...settings,
    ageIcon: icon ? { path: icon.rel, version } : null,
    imageTools: { available: imageTools.isAvailable(), reason: imageTools.unavailableReason() },
  });
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

// Replace the Norsk Tipping mark in the 18+ badge. Optional — with no upload
// the badge draws banner.js's built-in inline SVG, which is what everyone
// should normally use.
app.post("/api/settings/badge-icon", withMulter(uploadBadgeIcon), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Mangler ikon-fil" });
    await fsp.mkdir(ASSETS_DIR, { recursive: true });
    // Trust the BYTES, not the declared Content-Type — the extension decides how
    // this file is served back out of public/, so it has to match what it is.
    const ext = { "image/png": "png", "image/jpeg": "jpg" }[sniffImageMime(req.file.buffer)];
    if (!ext) return res.status(400).json({ error: "Ikonet må være PNG eller JPG" });
    // Only one custom mark can be active, so clear the other extensions first.
    for (const other of AGE_ICON_EXTS) {
      if (other !== ext) await fsp.rm(ageIconPath(other), { force: true }).catch(() => {});
    }
    await fsp.writeFile(ageIconPath(ext), req.file.buffer);
    res.json({ ok: true, ageIcon: { path: "assets/age-icon." + ext, version: Date.now() } });
  } catch (err) {
    console.error("[badge-icon] " + err.message);
    res.status(500).json({ error: "Kunne ikke lagre ikonet" });
  }
});

app.delete("/api/settings/badge-icon", async (req, res) => {
  try {
    for (const ext of AGE_ICON_EXTS) await fsp.rm(ageIconPath(ext), { force: true }).catch(() => {});
    res.json({ ok: true, ageIcon: null });
  } catch (err) {
    console.error("[badge-icon] " + err.message);
    res.status(500).json({ error: "Kunne ikke fjerne ikonet" });
  }
});

// ---- Fetch image from URL (proxy) ----------------------------------------
// Lets a user paste a Norsk Tipping image link (often AVIF) instead of
// downloading + converting. Fetching server-side avoids browser CORS — and
// means the server opens a socket to a URL a user typed, so every request goes
// through lib/safe-fetch.js, which refuses anything resolving inside the
// network and re-checks each redirect hop.
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

    const fetched = await safeFetch.fetchImage(url, {
      maxBytes: MAX_UPLOAD_BYTES,
      timeoutMs: 12000,
      headers: {
        // Browser-like UA: some image CDNs reject non-browser agents.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
      },
    });

    const buf = fetched.buffer;
    if (buf.length === 0) return res.status(400).json({ error: "Lenken returnerte et tomt svar" });

    // Trust the bytes first — a server claiming "image/png" while sending
    // something else must not get through. The declared type is only a
    // fallback for formats the sniffer does not know (and many CDNs send
    // application/octet-stream anyway).
    const declared = fetched.contentType.split(";")[0].trim().toLowerCase();
    const mime = sniffImageMime(buf) || (ACCEPTED_IMAGE_MIMES.includes(declared) ? declared : null);
    if (!mime || !ACCEPTED_IMAGE_MIMES.includes(mime)) {
      return res.status(400).json({ error: "Lenken er ikke et støttet bilde (JPG/PNG/WEBP/AVIF/GIF)" });
    }

    let name = "bilde";
    try {
      const last = decodeURIComponent(new URL(fetched.finalUrl).pathname.split("/").pop() || "");
      if (last) name = last.replace(/\.[a-z0-9]+$/i, "") || "bilde";
    } catch {}

    res.json({
      dataUrl: `data:${mime};base64,${buf.toString("base64")}`,
      mimetype: mime,
      size: buf.length,
      name,
    });
  } catch (err) {
    console.warn("[fetch-image] " + (err && err.message ? err.message : err));
    // Only messages this module raised on purpose are shown; anything else
    // (DNS errors, TLS failures) could describe the internal network.
    const message = err && err.safe ? err.message : "Kunne ikke hente bildet fra lenken";
    res.status(400).json({ error: message });
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

  if (!imageTools.isAvailable()) {
    console.warn(
      "\n[bilde] sharp er ikke tilgjengelig – supersampling og størrelsesgrensen " +
        "er slått av for denne økten.\n        Kjør `npm install` på nytt for å få den tilbake. (" +
        imageTools.unavailableReason() +
        ")"
    );
  }

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
