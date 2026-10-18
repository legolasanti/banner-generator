"use strict";

/* =========================================================================
 * routes.js — the /api/bulk endpoints.
 *
 *   POST   /api/bulk/sheet         {url} a Google Sheets / CSV link, or {text}
 *                                  pasted cells → rows
 *   POST   /api/bulk/sheet-file    multipart "file": .csv .tsv .txt .xlsx → rows
 *   GET    /api/bulk/template.csv  an example sheet to start from (?product=…)
 *   POST   /api/bulk/image         {url} → stored photo (see images.js)
 *   POST   /api/bulk/image-file    multipart "image" → stored photo
 *   POST   /api/bulk/image-check   {ids} → {missing}: photos no longer stored
 *   PUT    /api/bulk/rules         {autoFit} → saves only the text-size rules
 *   POST   /api/bulk/jobs          start a run (see jobs.js)
 *   GET    /api/bulk/jobs/:id      progress
 *   DELETE /api/bulk/jobs/:id      cancel (finished rows are kept)
 *
 * The finished run is a history entry; its download goes through
 * /api/history/:id/download like every other entry (see deliver.js).
 * ========================================================================= */

const multer = require("multer");

const sheet = require("./sheet");
const xlsx = require("./xlsx");
const links = require("./links");
const products = require("../../public/bulk/products.js");

const MAX_SHEET_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/**
 * The text of an uploaded or fetched CSV/TSV. Excel's «Unicode-tekst» is
 * UTF-16 with a byte-order mark; everything else is UTF-8, falling back to
 * Windows-1252 (old Excel exports), which would otherwise turn æøå into
 * replacement characters. Not latin1: that maps ’ “ ” – € to control
 * characters.
 */
function decodeSheetText(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  const text = buf.toString("utf8");
  return text.includes("\uFFFD") ? decodeWindows1252(buf) : text;
}

// Windows-1252 differs from latin1 only in 0x80–0x9F. Done by hand: Node's
// TextDecoder("windows-1252") decodes as latin1 in the versions this runs on.
const CP1252_HIGH =
  "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";
function decodeWindows1252(buf) {
  let out = "";
  for (const byte of buf) out += byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80] : String.fromCharCode(byte);
  return out;
}


/**
 * @param {import("express").Express} app
 * @param {Object} deps
 * @param {Object} deps.safeFetch
 * @param {Object} deps.images  createBulkImages(...)
 * @param {Object} deps.jobs    createBulkJobs(...)
 * @param {Function} deps.updateAutoFit  (autoFit) → the saved settings
 */
function registerBulkRoutes(app, deps) {
  const { safeFetch, images, jobs } = deps;

  const fail = (res, err, fallback, tag) => {
    if (!(err && err.safe)) console.error("[bulk:" + tag + "] " + (err && err.stack ? err.stack : err));
    if (res.headersSent) return res.destroy();
    res.status(err && err.safe ? 400 : 500).json({ error: err && err.safe ? err.message : fallback });
  };

  const respondRows = (res, table, source) => {
    const out = sheet.readTable(table);
    res.json({ source, ...out });
  };

  // ---- the sheet -----------------------------------------------------------
  app.post("/api/bulk/sheet", async (req, res) => {
    try {
      const body = req.body || {};
      if (typeof body.text === "string" && body.text.trim()) {
        if (body.text.length > MAX_SHEET_BYTES) return res.status(400).json({ error: "Teksten er for lang" });
        return respondRows(res, sheet.parseDelimited(body.text), { kind: "paste" });
      }

      const raw = String(body.url || "").trim();
      if (!raw) return res.status(400).json({ error: "Lim inn en lenke til regnearket" });
      const csvUrl = links.googleSheetCsvUrl(raw);
      if (links.looksLikeGoogleSheet(raw) && !csvUrl) {
        return res.status(400).json({ error: "Lenken ser ut som Google Sheets, men mangler regnearkets ID" });
      }
      const target = csvUrl || raw;
      if (!/^https?:\/\//i.test(target)) return res.status(400).json({ error: "Lenken må starte med https://" });

      let fetched;
      try {
        fetched = await safeFetch.fetchImage(target, {
          maxBytes: MAX_SHEET_BYTES,
          timeoutMs: 15000,
          headers: { "User-Agent": "Mozilla/5.0 ABCdesign", Accept: "text/csv,text/plain,*/*;q=0.5" },
        });
      } catch (err) {
        if (err && err.safe && /HTTP 40[134]/.test(err.message) && csvUrl) {
          throw Object.assign(new Error(
            "Fikk ikke tilgang til regnearket. Del det som «Alle med lenken» (Leser), eller lim inn cellene direkte."
          ), { safe: true });
        }
        if (err && err.safe) throw Object.assign(new Error(err.message.replace("bildet", "regnearket").replace("Bildet", "Regnearket")), { safe: true });
        throw err;
      }

      const text = decodeSheetText(fetched.buffer);
      const looksHtml = /text\/html/i.test(fetched.contentType) || /^\s*<(!doctype|html)/i.test(text.slice(0, 200));
      if (looksHtml) {
        return res.status(400).json({
          error: csvUrl
            ? "Regnearket er ikke delt. Velg Del → «Alle med lenken» (Leser) i Google Sheets, og prøv igjen."
            : "Lenken går til en nettside, ikke til et regneark. Bruk en Google Sheets-lenke eller en CSV-fil.",
        });
      }
      return respondRows(res, sheet.parseDelimited(text), { kind: csvUrl ? "google" : "url", url: raw });
    } catch (err) {
      fail(res, err, "Kunne ikke lese regnearket", "sheet");
    }
  });

  const uploadSheet = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SHEET_BYTES },
  }).single("file");

  app.post("/api/bulk/sheet-file", (req, res) => {
    uploadSheet(req, res, (err) => {
      if (err) {
        const msg = err.code === "LIMIT_FILE_SIZE" ? "Filen er for stor (maks 5 MB)" : "Opplasting feilet";
        return res.status(400).json({ error: msg });
      }
      try {
        if (!req.file) return res.status(400).json({ error: "Mangler fil" });
        const name = String(req.file.originalname || "").toLowerCase();
        const buf = req.file.buffer;
        // By name first: .ods and .numbers are ZIPs too, but not XLSX inside,
        // and deserve the way out rather than "not a valid XLSX file".
        if (/\.(xls|numbers|ods)$/.test(name)) {
          return res.status(400).json({ error: "Lagre arket som .xlsx eller .csv først (Fil → Last ned / Eksporter)." });
        }
        const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
        if (isZip || name.endsWith(".xlsx")) {
          const { table, sheetName } = xlsx.readFirstSheet(buf);
          return respondRows(res, table, { kind: "xlsx", name: req.file.originalname, sheetName });
        }
        return respondRows(res, sheet.parseDelimited(decodeSheetText(buf)), { kind: "file", name: req.file.originalname });
      } catch (e) {
        fail(res, e, "Kunne ikke lese filen", "sheet-file");
      }
    });
  });

  // ?product=readpeak|norsktipping|houseads — each product's own columns and
  // example copy (public/bulk/products.js). The demo button reads the same.
  app.get("/api/bulk/template.csv", (req, res) => {
    const id = products.isId(req.query.product) ? req.query.product : products.DEFAULT;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="' + id + '-bulk-mal.csv"');
    res.send(products.templateCsv(id));
  });

  // ---- photos --------------------------------------------------------------
  app.post("/api/bulk/image", async (req, res) => {
    try {
      res.json(await images.fromUrl((req.body || {}).url));
    } catch (err) {
      fail(res, err, "Kunne ikke hente bildet", "image");
    }
  });

  const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES } }).single("image");
  app.post("/api/bulk/image-file", (req, res) => {
    uploadImage(req, res, async (err) => {
      if (err) {
        const msg = err.code === "LIMIT_FILE_SIZE" ? "Bildet er for stort (maks 25 MB)" : "Opplasting feilet";
        return res.status(400).json({ error: msg });
      }
      try {
        if (!req.file) return res.status(400).json({ error: "Mangler bilde" });
        res.json(await images.ingest(req.file.buffer, req.file.originalname));
      } catch (e) {
        fail(res, e, "Kunne ikke lagre bildet", "image-file");
      }
    });
  });

  app.post("/api/bulk/image-check", async (req, res) => {
    try {
      const ids = (req.body || {}).ids;
      if (!Array.isArray(ids)) return res.status(400).json({ error: "Mangler bilde-ID-er" });
      res.json({ missing: await images.missing(ids) });
    } catch (err) {
      fail(res, err, "Kunne ikke sjekke bildene", "image-check");
    }
  });

  // ---- text-size rules -----------------------------------------------------
  // Only the rules: saving them must not write back every other setting as
  // the page last saw it (someone may have changed the export settings in
  // Innstillinger since).
  app.put("/api/bulk/rules", async (req, res) => {
    try {
      const autoFit = (req.body || {}).autoFit;
      if (!autoFit || typeof autoFit !== "object" || Array.isArray(autoFit)) {
        return res.status(400).json({ error: "Mangler reglene" });
      }
      const saved = await deps.updateAutoFit(autoFit);
      res.json({ autoFit: saved.autoFit || {} });
    } catch (err) {
      fail(res, err, "Kunne ikke lagre reglene", "rules");
    }
  });

  // ---- runs ----------------------------------------------------------------
  app.post("/api/bulk/jobs", async (req, res) => {
    try {
      res.status(202).json(await jobs.create(req.body));
    } catch (err) {
      fail(res, err, "Kunne ikke starte genereringen", "jobs");
    }
  });

  app.get("/api/bulk/jobs/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Fant ikke kjøringen – serveren kan ha blitt startet på nytt" });
    res.json(job);
  });

  app.delete("/api/bulk/jobs/:id", (req, res) => {
    const job = jobs.cancel(req.params.id);
    if (!job) return res.status(404).json({ error: "Fant ikke kjøringen" });
    res.json(job);
  });
}

module.exports = { registerBulkRoutes, decodeSheetText };
