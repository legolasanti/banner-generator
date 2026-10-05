"use strict";

/* =========================================================================
 * routes.js — the /api/bulk endpoints.
 *
 *   POST   /api/bulk/sheet         {url} a Google Sheets / CSV link, or {text}
 *                                  pasted cells → rows
 *   POST   /api/bulk/sheet-file    multipart "file": .csv .tsv .txt .xlsx → rows
 *   GET    /api/bulk/template.csv  an example sheet to start from
 *   POST   /api/bulk/image         {url} → stored photo (see images.js)
 *   POST   /api/bulk/image-file    multipart "image" → stored photo
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

const MAX_SHEET_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** The example rows behind "Last ned mal" — real, public, reachable photos. */
const TEMPLATE_ROWS = [
  ["Overskrift", "Bildelenke", "Filnavn", "Skrift", "Fokus", "Klikk-lenke"],
  [
    "Spar opptil 50 % på hotell i høst",
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=2000",
    "hotell-host",
    "Halvfet",
    "",
    "https://www.abcnyheter.no/",
  ],
  [
    "Gran Canarias 12 mest spektakulære designhotell",
    "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=2000",
    "gran-canaria-designhotell",
    "Normal",
    "",
    "",
  ],
  ["Vinterjakken alle snakker om er endelig på salg", "https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=2000", "", "", "", ""],
  ["Ny sofa?", "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=2000", "", "", "", ""],
];

function toCsv(rows) {
  const cell = (v) => (/[",\n\r]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/**
 * @param {import("express").Express} app
 * @param {Object} deps
 * @param {Object} deps.safeFetch
 * @param {Object} deps.images  createBulkImages(...)
 * @param {Object} deps.jobs    createBulkJobs(...)
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
          headers: { "User-Agent": "Mozilla/5.0 BannerGenerator", Accept: "text/csv,text/plain,*/*;q=0.5" },
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

      const text = fetched.buffer.toString("utf8");
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
        const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
        if (isZip || name.endsWith(".xlsx")) {
          const { table, sheetName } = xlsx.readFirstSheet(buf);
          return respondRows(res, table, { kind: "xlsx", name: req.file.originalname, sheetName });
        }
        if (/\.(xls|numbers|ods)$/.test(name)) {
          return res.status(400).json({ error: "Lagre arket som .xlsx eller .csv først (Fil → Last ned / Eksporter)." });
        }
        // CSV/TSV: UTF-8, falling back to Windows-1252 (old Excel exports),
        // which would otherwise turn æøå into replacement characters.
        let text = buf.toString("utf8");
        if (text.includes("�")) text = buf.toString("latin1");
        return respondRows(res, sheet.parseDelimited(text), { kind: "file", name: req.file.originalname });
      } catch (e) {
        fail(res, e, "Kunne ikke lese filen", "sheet-file");
      }
    });
  });

  app.get("/api/bulk/template.csv", (req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="houseads-bulk-mal.csv"');
    res.send(toCsv(TEMPLATE_ROWS));
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

module.exports = { registerBulkRoutes, TEMPLATE_ROWS, toCsv };
