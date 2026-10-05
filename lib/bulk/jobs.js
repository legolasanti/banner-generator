"use strict";

/* =========================================================================
 * jobs.js — a bulk run: many rows × several formats, rendered in the
 * background while the page polls for progress.
 *
 * A run is too long for one HTTP request (fifty rows × six formats is three
 * hundred screenshots), so POST /api/bulk/jobs only validates and queues, and
 * GET /api/bulk/jobs/:id reports where it has got to.
 *
 * Rows go through the SAME render queue as the single-banner builder, one row
 * per turn, so somebody making one banner while a bulk run is going waits for
 * at most one row, not for the whole sheet. Inside a row the formats render in
 * parallel pages.
 *
 * A row that fails (a photo that has since been deleted, a crash) is marked
 * and skipped; the run goes on. Cancelling stops after the current row and
 * still saves what was finished, so nothing done is thrown away.
 * ========================================================================= */

const path = require("path");
const fsp = require("fs/promises");
const crypto = require("crypto");
const { pathToFileURL } = require("url");

const MAX_ROWS = 300;
// Finished jobs stay pollable this long, then are forgotten (their files live
// on in history).
const JOB_TTL_MS = 6 * 3600 * 1000;
const ROW_CONCURRENCY = 3;

class BulkJobError extends Error {
  constructor(message) {
    super(message);
    this.name = "BulkJobError";
    this.safe = true;
  }
}

/**
 * A filename from a headline, cut at a word rather than mid-word: «Denne
 * overskriften er altfor lang …» → "denne-overskriften-er-altfor-lang", not
 * "…-fordi-d" where the 60-character limit happened to fall.
 */
const NAME_FROM_HEADLINE_MAX = 48;
function nameFromHeadline(sanitize, headline) {
  const full = sanitize(headline);
  if (full.length <= NAME_FROM_HEADLINE_MAX) return full;
  let out = "";
  for (const word of full.split("-")) {
    const next = out ? out + "-" + word : word;
    if (next.length > NAME_FROM_HEADLINE_MAX) break;
    out = next;
  }
  return out || full.slice(0, NAME_FROM_HEADLINE_MAX);
}

function clamp(n, lo, hi, fallback) {
  let v = Number(n);
  if (!isFinite(v)) v = fallback;
  return Math.max(lo, Math.min(hi, v));
}

/**
 * @param {Object} deps
 * @param {Object} deps.formats             public/assets/formats.js
 * @param {Function} deps.enqueue           the shared render queue
 * @param {Function} deps.generateAll       (specs, data, opts) → {key: rendered}
 * @param {Function} deps.buildHtmlPackages see server.js
 * @param {Function} deps.loadSettings
 * @param {Function} deps.budgetFor         (settings, spec) → bytes
 * @param {Function} deps.sanitizeFilename
 * @param {Function} deps.normalizeClickUrl
 * @param {Function} deps.fileStamp
 * @param {Function} deps.saveHistoryEntry  (entry) → Promise
 * @param {Object} deps.images              lib/bulk/images.js instance
 * @param {Object} deps.imageTools          lib/image.js
 * @param {string} deps.historyDir
 * @param {string} deps.logoPath            abc shopping mark (absolute)
 * @param {string} deps.logoAsset           its name inside an HTML5 ZIP
 */
function createBulkJobs(deps) {
  const jobs = new Map();
  const PRODUCT = "houseads";

  function sweep() {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) jobs.delete(id);
    }
  }

  /** Validate and normalise a request into a job description. Throws BulkJobError. */
  function parseRequest(body, settings) {
    const b = body && typeof body === "object" ? body : {};
    const o = b.options && typeof b.options === "object" ? b.options : {};
    const product = deps.formats.getProduct(PRODUCT);

    const wanted = Array.isArray(o.formats) ? o.formats.map(String) : [];
    const specs = product.specs.filter((s) => wanted.includes(s.key));
    if (!specs.length) throw new BulkJobError("Velg minst ett format");

    const outputType = o.outputType === "html" ? "html" : "image";
    const format = ["png", "jpeg", "auto"].includes(o.format) ? o.format : settings.export.format || "png";
    const resolution = outputType === "html" ? 1 : clamp(o.resolution, 1, 2, 1);
    const defaultClick = String(o.clickUrl || "").trim();

    const rawRows = Array.isArray(b.rows) ? b.rows : [];
    if (!rawRows.length) throw new BulkJobError("Ingen rader å generere");
    if (rawRows.length > MAX_ROWS) throw new BulkJobError("Maks " + MAX_ROWS + " bannere per kjøring");

    const usedNames = new Set();
    const rows = rawRows.map((r, i) => {
      const row = r && typeof r === "object" ? r : {};
      const headline = String(row.headline || "").replace(/\s+/g, " ").trim().slice(0, 200);
      const imageId = String(row.imageId || "");
      let base = row.filename ? deps.sanitizeFilename(row.filename) : nameFromHeadline(deps.sanitizeFilename, headline);
      if (base === "banner" && !row.filename) base = "banner-" + (i + 1);
      // Two rows with the same name would overwrite each other in the ZIP.
      let unique = base;
      for (let n = 2; usedNames.has(unique); n++) unique = (base.slice(0, 55) + "-" + n).replace(/-+/g, "-");
      usedNames.add(unique);

      const scales = {};
      const sent = row.scales && typeof row.scales === "object" ? row.scales : {};
      for (const spec of specs) scales[spec.type] = clamp(sent[spec.type], 0.5, 2, 1);

      let clickUrl = "";
      let clickError = "";
      if (outputType === "html") {
        const parsed = deps.normalizeClickUrl(String(row.clickUrl || "").trim() || defaultClick);
        if (parsed.ok) clickUrl = parsed.url;
        else clickError = parsed.error;
      }

      return {
        index: i,
        rid: String(row.rid || i).slice(0, 40),
        sheetRow: Number(row.sheetRow) || null,
        headline,
        imageId,
        fileBase: unique,
        weight: row.weight === "regular" ? "regular" : "bold",
        posX: clamp(row.posX, 0, 100, 50),
        posY: clamp(row.posY, 0, 100, 50),
        zoom: clamp(row.zoom, 0, 30, 0),
        scales,
        // Verify only the formats whose size the auto rule chose; a size set
        // by hand is the user's call.
        autoTypes: Array.isArray(row.autoTypes) ? row.autoTypes.map(String) : specs.map((s) => s.type),
        clickUrl,
        preError: !headline
          ? "Mangler overskrift"
          : !deps.images.isId(imageId)
          ? "Mangler bilde"
          : clickError
          ? clickError
          : "",
      };
    });

    const name = deps.sanitizeFilename(o.name || "houseads-bulk");
    return { specs, outputType, format, resolution, rows, name };
  }

  /** Start a run. Returns the public job view straight away. */
  async function create(body) {
    sweep();
    const settings = await deps.loadSettings();
    const req = parseRequest(body, settings);
    const now = new Date();
    const id = now.getTime() + "-" + req.name + "-" + crypto.randomBytes(3).toString("hex");
    const job = {
      id,
      req,
      settings,
      status: "queued",
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      cancelRequested: false,
      entryId: null,
      error: "",
      rows: req.rows.map((r) => ({
        rid: r.rid,
        status: r.preError ? "error" : "waiting",
        error: r.preError,
        fit: {},
        files: 0,
      })),
      results: [],
    };
    jobs.set(id, job);
    run(job).catch((err) => {
      console.error("[bulk] run " + id + " failed: " + (err && err.stack ? err.stack : err));
      job.status = "failed";
      job.error = "Kjøringen stoppet uventet. Se serverloggen.";
      job.finishedAt = Date.now();
    });
    return view(job);
  }

  async function run(job) {
    const { req, settings } = job;
    const folderAbs = path.join(deps.historyDir, job.id);
    await fsp.mkdir(folderAbs, { recursive: true });
    const budget = (spec) => deps.budgetFor(settings, spec);
    const fileStampSuffix = settings.export.includeTimestampInFilename ? "-" + deps.fileStamp(job.createdAt) : "";
    job.status = "running";
    job.startedAt = Date.now();

    for (const row of req.rows) {
      const state = job.rows[row.index];
      if (job.cancelRequested) break;
      if (state.status === "error") continue;
      state.status = "running";
      try {
        const result = await deps.enqueue(() => renderRow(job, row, folderAbs, budget, fileStampSuffix));
        job.results.push(result);
        state.status = "done";
        state.files = Object.keys(result.files).length;
        state.fit = result.fit;
        state.notes = result.report.filter((r) => r.note || r.htmlNote).map((r) => r.label + ": " + (r.note || r.htmlNote));
      } catch (err) {
        console.warn("[bulk] row " + (row.index + 1) + ": " + (err && err.message ? err.message : err));
        state.status = "error";
        state.error = err && err.safe ? err.message : "Kunne ikke lage denne banneren";
      }
    }

    // Rows never reached because of a cancel.
    for (const state of job.rows) if (state.status === "waiting") state.status = "skipped";

    if (job.results.length) {
      const entry = buildEntry(job);
      await deps.saveHistoryEntry(entry);
      job.entryId = entry.id;
    } else {
      await fsp.rm(folderAbs, { recursive: true, force: true }).catch(() => {});
    }
    job.status = job.cancelRequested ? "cancelled" : job.results.length ? "done" : "failed";
    if (job.status === "failed" && !job.error) job.error = "Ingen av bannerne kunne lages";
    job.finishedAt = Date.now();
  }

  async function renderRow(job, row, folderAbs, budget, stampSuffix) {
    const { req, settings } = job;
    const master = await deps.images.masterPath(row.imageId);
    if (!master) throw new BulkJobError("Bildet finnes ikke lenger på serveren – hent det på nytt");
    const fileBase = row.fileBase + stampSuffix;

    const data = {
      product: PRODUCT,
      // A file:// URL rather than a data: URL: the template is a file:// page,
      // and passing a 2400px photo as base64 into every page is the slow part.
      imageDataUrl: pathToFileURL(master).href,
      imagePositionX: row.posX,
      imagePositionY: row.posY,
      imageZoom: row.zoom,
      headline: row.headline,
      headlineScales: row.scales,
      houseWeight: row.weight,
      hideAgeBadge: true,
      houseLogoUrl: pathToFileURL(deps.logoPath).href,
      annonseText: settings.staticBadges.annonseText,
      autoFitCheck: { min: 0.5, types: row.autoTypes },
    };

    let photoAsset = null;
    let masterBuffer = null;
    if (req.outputType === "html") {
      masterBuffer = await fsp.readFile(master);
      photoAsset = deps.imageTools.photoAsset(masterBuffer);
      if (!photoAsset.ok) throw new BulkJobError("Bildet kan ikke brukes i HTML5 uten bildebiblioteket sharp");
    }

    const rendered = await deps.generateAll(req.specs, data, {
      budgetFor: budget,
      scale: req.resolution,
      superSample: settings.export.superSample,
      format: req.format,
      jpegQuality: settings.export.jpegQuality,
      concurrency: ROW_CONCURRENCY,
      assetNames: req.outputType === "html" ? { photo: photoAsset.name, icon: "", logo: deps.logoAsset } : null,
    });

    const files = {};
    const report = [];
    const fit = {};
    for (const spec of req.specs) {
      const result = rendered[spec.key];
      const fname = fileBase + "-" + spec.label + "." + result.image.ext;
      await fsp.writeFile(path.join(folderAbs, fname), result.image.buffer);
      files[spec.key] = fname;
      const usedScale = result.fit ? result.fit.scale : row.scales[spec.type];
      fit[spec.type] = { requested: row.scales[spec.type], scale: usedScale, fits: result.fit ? result.fit.fits : true };
      report.push({
        key: spec.key,
        label: spec.label,
        file: fname,
        width: result.width,
        height: result.height,
        bytes: result.image.bytes,
        limitBytes: budget(spec),
        note: result.image.note,
        scale: usedScale,
      });
    }

    let htmlFiles = null;
    if (req.outputType === "html") {
      htmlFiles = await deps.buildHtmlPackages({
        specs: req.specs,
        product: PRODUCT,
        folderAbs,
        fileBase,
        rendered,
        photoBuffer: masterBuffer,
        zoom: row.zoom,
        clickUrl: row.clickUrl,
        ageIcon: null,
        budgetFor: budget,
        photoName: photoAsset.name,
        title: row.headline || fileBase,
        report,
      });
    }

    return {
      index: row.index,
      sheetRow: row.sheetRow,
      headline: row.headline,
      fileBase,
      clickUrl: row.clickUrl,
      files,
      htmlFiles,
      report,
      fit,
    };
  }

  function buildEntry(job) {
    const { req } = job;
    const first = job.results[0];
    const thumbKey = req.specs[0].key;
    return {
      id: job.id,
      kind: "bulk",
      product: PRODUCT,
      filename: req.name,
      fileBase: req.name,
      timestamp: new Date(job.createdAt).toISOString(),
      headline: job.results.length + " bannere · " + req.specs.length + " formater",
      outputType: req.outputType,
      formats: req.specs.map((s) => s.key),
      folderPath: "history/" + job.id + "/",
      thumbnailPath: "history/" + job.id + "/" + first.files[thumbKey],
      count: job.results.length,
      failed: job.rows.filter((r) => r.status === "error").length,
      cancelled: !!job.cancelRequested,
      rows: job.results,
    };
  }

  /** What the page polls. Never includes server paths. */
  function view(job) {
    const done = job.rows.filter((r) => r.status === "done").length;
    const failed = job.rows.filter((r) => r.status === "error").length;
    return {
      id: job.id,
      status: job.status,
      total: job.rows.length,
      done,
      failed,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      entryId: job.entryId,
      error: job.error,
      formats: job.req.specs.map((s) => s.key),
      outputType: job.req.outputType,
      rows: job.rows,
    };
  }

  function get(id) {
    const job = jobs.get(String(id));
    return job ? view(job) : null;
  }

  function cancel(id) {
    const job = jobs.get(String(id));
    if (!job) return null;
    if (job.status === "queued" || job.status === "running") job.cancelRequested = true;
    return view(job);
  }

  return { create, get, cancel, parseRequest, MAX_ROWS };
}

module.exports = { createBulkJobs, BulkJobError, MAX_ROWS, nameFromHeadline };
