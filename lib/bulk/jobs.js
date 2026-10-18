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
 *
 * The history entry is written after the FIRST finished row and updated after
 * every one after it (see history.js), so a restart in the middle of a run
 * keeps what was made instead of leaving a folder nobody can download.
 * ========================================================================= */

const path = require("path");
const fsp = require("fs/promises");
const crypto = require("crypto");
const { pathToFileURL } = require("url");

const names = require("../../public/bulk/names.js");
const products = require("../../public/bulk/products.js");
const bulkHistory = require("./history");

const MAX_ROWS = 300;
// Finished jobs stay pollable this long, then are forgotten (their files live
// on in history).
const JOB_TTL_MS = 6 * 3600 * 1000;
const ROW_CONCURRENCY = 3;

// A row whose photo has gone from the server. The page maps this code onto
// the row's photo, so "Hent bildene på nytt" can fix it.
const IMAGE_MISSING = "image-missing";

class BulkJobError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "BulkJobError";
    this.safe = true;
    if (code) this.code = code;
  }
}

/** See public/bulk/names.js; kept here with its old argument order. */
function nameFromHeadline(sanitize, headline) {
  return names.nameFromHeadline(headline, sanitize);
}

/**
 * Formats the renderer had to set smaller than planned when it re-measured
 * the headline (fonts differ by a hair between the page and Chrome on the
 * server), or that still did not fit at its smallest. The page showed the
 * planned size; the card and the report say what shipped.
 */
function smallerThanPlanned(specs, fit) {
  const out = [];
  for (const spec of specs) {
    const f = fit[spec.type];
    if (!f) continue;
    if (f.scale < f.requested - 1e-6 || !f.fits) {
      out.push({ type: spec.type, size: spec.width + "×" + spec.height, requested: f.requested, scale: f.scale, fits: f.fits });
    }
  }
  return out;
}

function describeSmaller(s) {
  const pct = (n) => Math.round(n * 100) + " %";
  return s.fits
    ? s.size + ": tekst satt ned fra " + pct(s.requested) + " til " + pct(s.scale) + " ved generering"
    : s.size + ": teksten fikk ikke helt plass, selv på " + pct(s.scale);
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
 * @param {Function} deps.normalizeClickUrl
 * @param {Function} deps.fileStamp
 * @param {Function} deps.upsertHistoryEntry (entry) → Promise; adds the entry,
 *                                           or replaces the one with its id
 * @param {Object} deps.images              lib/bulk/images.js instance
 * @param {Object} deps.imageTools          lib/image.js
 * @param {string} deps.historyDir
 * @param {string} deps.logoPath            abc shopping mark (absolute)
 * @param {string} deps.logoAsset           its name inside an HTML5 ZIP
 * @param {Function} [deps.findAgeIcon]     () → {abs, ext} | null: a custom
 *                                           18+ mark (Norsk Tipping only)
 */
function createBulkJobs(deps) {
  const jobs = new Map();

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
    const productId = products.isId(o.product) ? o.product : products.DEFAULT;
    const product = deps.formats.getProduct(productId);
    const own = products.get(productId);
    const has = (field) => own.fields.includes(field);

    const wanted = Array.isArray(o.formats) ? o.formats.map(String) : [];
    const specs = product.specs.filter((s) => wanted.includes(s.key));
    if (!specs.length) throw new BulkJobError("Velg minst ett format");

    const outputType = o.outputType === "html" ? "html" : "image";
    const format = ["png", "jpeg", "auto"].includes(o.format) ? o.format : settings.export.format || "png";
    const resolution = outputType === "html" ? 1 : clamp(o.resolution, 1, 2, 1);
    const defaultClick = String(o.clickUrl || "").trim();
    // The run-wide look of the call to action and the Nyhetsgrid odds line —
    // the same controls the single-banner form has, with its defaults.
    const style = {
      lesMerStyle: o.lesMerStyle === "button" ? "button" : "text",
      accentColor: /^#[0-9a-fA-F]{3,8}$/.test(String(o.accentColor || "")) ? String(o.accentColor) : "#2f2f2f",
      showVinnerOnNewsgrid: product.vinnersjanse ? o.showVinnerOnNewsgrid === true : false,
    };

    const rawRows = Array.isArray(b.rows) ? b.rows : [];
    if (!rawRows.length) throw new BulkJobError("Ingen rader å generere");
    if (rawRows.length > MAX_ROWS) throw new BulkJobError("Maks " + MAX_ROWS + " bannere per kjøring");

    const cleanRows = rawRows.map((r) => (r && typeof r === "object" ? r : {}));
    const headlines = cleanRows.map((row) => String(row.headline || "").replace(/\s+/g, " ").trim().slice(0, 200));
    // The same function names the rows in the page before the run, so what
    // the card showed is what the ZIP holds.
    const bases = names.fileBases(cleanRows.map((row, i) => ({ filename: String(row.filename || ""), headline: headlines[i] })));
    const rows = cleanRows.map((row, i) => {
      const headline = headlines[i];
      const imageId = String(row.imageId || "");

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
        fileBase: bases[i],
        weight: row.weight === "regular" ? "regular" : "bold",
        posX: clamp(row.posX, 0, 100, 50),
        posY: clamp(row.posY, 0, 100, 50),
        zoom: clamp(row.zoom, 0, 30, 0),
        scales,
        // Verify only the formats whose size the auto rule chose; a size set
        // by hand is the user's call.
        autoTypes: Array.isArray(row.autoTypes) ? row.autoTypes.map(String) : specs.map((s) => s.type),
        clickUrl,
        ...productText(row, product, own, has),
        preError: !headline
          ? "Mangler overskrift"
          : !deps.images.isId(imageId)
          ? "Mangler bilde"
          : clickError
          ? clickError
          : "",
      };
    });

    const name = names.sanitizeFilename(o.name || productId + "-bulk");
    return { product: productId, specs, outputType, format, resolution, rows, name, style };
  }

  /**
   * A row's ReadPeak / Norsk Tipping copy, held to the single form's limits.
   * The page resolves the run's defaults (Merkevare, Knappetekst, Spilltype)
   * before sending, so what arrives is what is drawn; a field the product
   * does not have is drawn the way its single tab draws it.
   */
  function productText(row, product, own, has) {
    const text = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
    const L = products.LIMITS;
    return {
      subtitle: has("subtitle") ? text(row.subtitle, L.subtitle) : "",
      brandLabel: has("brandLabel") ? text(row.brandLabel == null ? product.brandLabelDefault : row.brandLabel, L.brandLabel) : "",
      ctaText: has("ctaText") ? text(row.ctaText == null ? own.ctaDefault : row.ctaText, L.ctaText) : own.ctaFixed || "Les mer",
      vinnersjanse: product.vinnersjanse ? text(row.vinnersjanse, L.vinnersjanse) : "",
    };
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
      cancelled: false,
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
    // The 18+ mark: the built-in one unless a custom one was uploaded.
    job.ageIcon = deps.formats.getProduct(req.product).ageBadge && deps.findAgeIcon ? await deps.findAgeIcon() : null;
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
        state.smaller = result.smaller;
        state.notes = result.report
          .filter((r) => r.note || r.htmlNote)
          .map((r) => r.label + ": " + (r.note || r.htmlNote))
          .concat(result.smaller.map(describeSmaller));
      } catch (err) {
        console.warn("[bulk] row " + (row.index + 1) + ": " + (err && err.message ? err.message : err));
        state.status = "error";
        state.error = err && err.safe ? err.message : "Kunne ikke lage denne banneren";
        if (err && err.code === IMAGE_MISSING) state.code = IMAGE_MISSING;
        continue;
      }
      await saveProgress(job, false);
    }

    // Rows never reached because of a cancel.
    for (const state of job.rows) if (state.status === "waiting") state.status = "skipped";
    // A cancel that arrived while the last row was rendering stopped nothing:
    // the run is complete, and is treated (and downloaded) as such.
    const skipped = job.rows.some((r) => r.status === "skipped");

    if (job.results.length) {
      job.cancelled = skipped;
      await saveProgress(job, true);
    } else {
      await fsp.rm(folderAbs, { recursive: true, force: true }).catch(() => {});
    }
    job.status = skipped ? "cancelled" : job.results.length ? "done" : "failed";
    if (job.status === "failed" && !job.error) job.error = "Ingen av bannerne kunne lages";
    job.finishedAt = Date.now();
  }

  /**
   * Write the finished rows and the history entry. Called after every row,
   * so a crash loses at most the row being rendered. A failed write must not
   * stop the run — the files are still there, and the next row tries again.
   */
  async function saveProgress(job, final) {
    try {
      await bulkHistory.writeRows(deps.historyDir, job.id, job.results);
      const entry = buildEntry(job, final);
      await deps.upsertHistoryEntry(entry);
      job.entryId = entry.id;
    } catch (err) {
      console.error("[bulk] could not save progress of " + job.id + ": " + (err && err.message ? err.message : err));
      if (final) throw err;
    }
  }

  /**
   * What the renderer gets for one row: the same fields, with the same
   * meaning, as server.js /api/generate builds from the single-banner form,
   * so a bulk banner is the banner that tab would have made.
   */
  function bannerData(job, row, master) {
    const { req, settings } = job;
    const product = deps.formats.getProduct(req.product);
    return {
      product: req.product,
      // A file:// URL rather than a data: URL: the template is a file:// page,
      // and passing a 2400px photo as base64 into every page is the slow part.
      imageDataUrl: pathToFileURL(master).href,
      imagePositionX: row.posX,
      imagePositionY: row.posY,
      imageZoom: row.zoom,
      headline: row.headline,
      headlineScales: row.scales,
      subtitle: row.subtitle,
      brandLabel: row.brandLabel,
      ctaText: row.ctaText,
      vinnersjanse: row.vinnersjanse,
      showVinnerOnNewsgrid: req.style.showVinnerOnNewsgrid,
      subtitleScale: 1,
      lesMerSize: 17,
      lesMerStyle: req.style.lesMerStyle,
      accentColor: req.style.accentColor,
      houseWeight: row.weight,
      // Not client-controlled, exactly as for a single banner: the 18+ mark
      // is a Norsk Tipping obligation and never drawn for anyone else.
      hideAgeBadge: !product.ageBadge,
      ageIconUrl: job.ageIcon ? pathToFileURL(job.ageIcon.abs).href : "",
      houseLogoUrl: pathToFileURL(deps.logoPath).href,
      annonseText: settings.staticBadges.annonseText,
      ageBadgeText: settings.staticBadges.ageBadgeText,
      autoFitCheck: { min: 0.5, types: row.autoTypes },
    };
  }

  async function renderRow(job, row, folderAbs, budget, stampSuffix) {
    const { req, settings } = job;
    const master = await deps.images.masterPath(row.imageId);
    if (!master) throw new BulkJobError("Bildet finnes ikke lenger på serveren – hent det på nytt", IMAGE_MISSING);
    const fileBase = row.fileBase + stampSuffix;

    const data = bannerData(job, row, master);

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
      assetNames:
        req.outputType === "html"
          ? { photo: photoAsset.name, icon: job.ageIcon ? "age-icon." + job.ageIcon.ext : "", logo: deps.logoAsset }
          : null,
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
        planned: row.scales[spec.type],
      });
    }

    let htmlFiles = null;
    if (req.outputType === "html") {
      htmlFiles = await deps.buildHtmlPackages({
        specs: req.specs,
        product: req.product,
        folderAbs,
        fileBase,
        rendered,
        photoBuffer: masterBuffer,
        zoom: row.zoom,
        clickUrl: row.clickUrl,
        ageIcon: job.ageIcon,
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
      subtitle: row.subtitle || undefined,
      brandLabel: row.brandLabel || undefined,
      fileBase,
      clickUrl: row.clickUrl,
      files,
      htmlFiles,
      report,
      fit,
      smaller: smallerThanPlanned(req.specs, fit),
    };
  }

  /** The history entry: a summary only — the rows are in rows.json. */
  function buildEntry(job, final) {
    const { req } = job;
    const first = job.results[0];
    const thumbKey = req.specs[0].key;
    const entry = {
      id: job.id,
      kind: "bulk",
      product: req.product,
      filename: req.name,
      fileBase: req.name,
      timestamp: new Date(job.createdAt).toISOString(),
      headline: bulkHistory.headlineFor(job.results.length, req.specs.length, final ? null : "running", req.product),
      outputType: req.outputType,
      formats: req.specs.map((s) => s.key),
      folderPath: "history/" + job.id + "/",
      thumbnailPath: "history/" + job.id + "/" + first.files[thumbKey],
      count: job.results.length,
      failed: job.rows.filter((r) => r.status === "error").length,
      cancelled: !!job.cancelled,
    };
    if (!final) entry.partial = true;
    return entry;
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
      product: job.req.product,
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

  return { create, get, cancel, parseRequest, bannerData, MAX_ROWS };
}

module.exports = { createBulkJobs, BulkJobError, MAX_ROWS, IMAGE_MISSING, nameFromHeadline, smallerThanPlanned, describeSmaller };
