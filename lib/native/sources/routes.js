"use strict";

/* =========================================================================
 * sources/routes.js — bring the team's material into a project.
 *
 *   POST /api/native/sources/gdoc          {url}   Google Docs brief → text
 *   POST /api/native/sources/file          file    PDF, Word (.docx) or text (.txt/.md) → text
 *                                                  (+ a Word file's pictures as assets; a scanned
 *                                                  PDF is OCR'd through OpenRouter when AI is set up)
 *   POST /api/native/sources/docx          file    same as /file (kept for older clients)
 *   POST /api/native/sources/web           {url}   product page → text + product facts
 *   POST /api/native/sources/drive         {url}   list a shared Drive folder
 *   POST /api/native/sources/drive/import  {files: [{id, name, kind}]}  → assets
 *   POST /api/native/sources/images        {urls}  pictures from a Google Doc → assets
 *
 * Text sources return { source } — the browser keeps them with the AI brief.
 * Media come back as asset metadata for the project's asset list.
 * ========================================================================= */

const multer = require("multer");

const gdoc = require("./gdoc");
const docx = require("./docx");
const pdf = require("./pdf");
const { countWords, MAX_TEXT } = require("./text");
const openrouter = require("../ai/openrouter");
const web = require("./web");
const { createDrive } = require("./drive");
const { handle } = require("../routes");
const { UserError } = require("../fsutil");

const MAX_DOCX_BYTES = 30 * 1024 * 1024;
const OCR_MAX_BYTES = 20 * 1024 * 1024;
const OCR_TIMEOUT_MS = 240000;
const MAX_IMPORT = 40;
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_VIDEO_BYTES = 400 * 1024 * 1024;
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };

function friendly(err, what) {
  if (err && err.safe) return Object.assign(new Error(err.message.replace(/bildet/gi, what)), { safe: true, status: 400 });
  return err;
}

/** Run `fn` over `items` with at most `n` at a time, keeping order. */
async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

function registerSourceRoutes(app, deps) {
  const { safeFetch, assets } = deps;
  const drive = createDrive({ safeFetch });

  app.post("/api/native/sources/gdoc", handle("gdoc", "Kunne ikke lese dokumentet", async (req, res) => {
    const url = String((req.body || {}).url || "").trim();
    const id = gdoc.docIdFromUrl(url);
    if (!id) throw new UserError("Lim inn en lenke til et Google Docs-dokument (docs.google.com/document/…)");
    let got;
    try {
      got = await safeFetch.fetchImage(gdoc.exportUrl(id), { maxBytes: gdoc.MAX_DOC_BYTES, timeoutMs: 30000, headers: UA });
    } catch (err) {
      if (err && err.safe && /HTTP 40[134]/.test(err.message)) {
        throw new UserError("Dokumentet er ikke delt. Velg Del → «Alle med lenken» (Leser) i Google Docs. Alternativt: Fil → Last ned → Word, og last opp filen her.");
      }
      throw friendly(err, "dokumentet");
    }
    if (/accounts\.google\.com/.test(got.finalUrl) || !/text\/html/i.test(got.contentType)) {
      throw new UserError("Dokumentet er ikke delt. Velg Del → «Alle med lenken» (Leser) i Google Docs, eller last det ned som Word og last opp filen.");
    }
    const parsed = gdoc.parseGoogleDocHtml(got.buffer.toString("utf8"));
    if (!parsed.text.trim()) throw new UserError("Dokumentet ser ut til å være tomt");
    res.json({ source: Object.assign({ kind: "gdoc", url }, parsed) });
  }));

  const uploadFile = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCX_BYTES, files: 1 } }).single("file");

  function receive(req, res) {
    return new Promise((resolve, reject) =>
      uploadFile(req, res, (err) => (err ? reject(new UserError(err.code === "LIMIT_FILE_SIZE" ? "Filen er for stor (maks 30 MB)" : "Opplasting feilet")) : resolve()))
    );
  }

  function kindOf(file) {
    const name = String(file.originalname || "").toLowerCase();
    const head = file.buffer.subarray(0, 5).toString("latin1");
    if (head === "%PDF-" || name.endsWith(".pdf")) return "pdf";
    if (name.endsWith(".docx") || head.startsWith("PK")) return "docx";
    if (/\.(txt|md|markdown|text)$/.test(name) || /^text\//.test(file.mimetype || "")) return "text";
    return "";
  }

  async function readDocx(file) {
    const parsed = docx.parseDocx(file.buffer);
    const stored = [];
    for (const m of parsed.media) {
      const buf = docx.mediaBuffer(file.buffer, m.path);
      if (!buf) continue;
      try {
        stored.push(await assets.storeImage(buf, { name: m.name, source: "upload" }));
      } catch {
        /* an odd embedded format (EMF, WMF) is simply skipped */
      }
    }
    const { media, ...rest } = parsed;
    return { source: Object.assign({ kind: "docx", name: file.originalname }, rest), assets: stored };
  }

  /** A scanned PDF → text via OpenRouter's PDF parser (OCR). */
  async function ocrPdf(file) {
    const s = await deps.settings.get();
    const result = await openrouter.chat({
      model: s.ai.fastModel,
      fallbacks: [s.ai.defaultModel],
      zdr: s.ai.zdr,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: pdf.OCR_PROMPT },
            { type: "file", file: { filename: "dokument.pdf", file_data: "data:application/pdf;base64," + file.buffer.toString("base64") } },
          ],
        },
      ],
      plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }],
      temperature: 0,
      maxTokens: 32000,
      timeoutMs: OCR_TIMEOUT_MS,
    });
    let text = String(result.text || "").trim();
    if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT) + "\n\n[… resten er kuttet]";
    return { text, cost: result.usage.cost, model: result.model, usage: result.usage };
  }

  /** OCR spend goes into the project's AI log when the browser says which project. */
  function logOcr(projectId, usage, failed) {
    if (!projectId || !deps.projects || !usage) return Promise.resolve();
    return deps.projects
      .appendAiLog(projectId, { step: failed ? "ocr:feilet" : "ocr", model: usage.model, promptVersion: "ocr", prompt: usage.prompt || 0, completion: usage.completion || 0, cost: usage.cost || 0 })
      .catch((e) => console.warn("[ai] logg: " + e.message));
  }

  async function readPdf(file, projectId) {
    const parsed = await pdf.parsePdf(file.buffer);
    const source = Object.assign({ kind: "pdf", name: file.originalname }, parsed);
    const hasText = !!parsed.text.trim();
    const keepExtracted = (warning) => {
      if (!hasText) throw new UserError("PDF-en ser ut til å være skannet (ingen tekst). Lim inn teksten i notatfeltet, eller last opp originaldokumentet.");
      return { source: Object.assign(source, { warning }), assets: [] };
    };
    if (!parsed.scanned) return { source, assets: [] };
    if (!openrouter.isConfigured() || file.buffer.length > OCR_MAX_BYTES) return keepExtracted("Lite lesbar tekst – PDF-en kan være skannet.");
    let ocr;
    try {
      ocr = await ocrPdf(file);
    } catch (err) {
      await logOcr(projectId, err && err.usage, true);
      if (hasText) return keepExtracted("Tekstgjenkjenning feilet – bruker teksten som kunne leses direkte.");
      throw err;
    }
    await logOcr(projectId, Object.assign({ model: ocr.model }, ocr.usage), false);
    // OCR replaces the extracted text only when it really found more.
    if (!ocr.text || countWords(ocr.text) <= parsed.words) {
      if (hasText) return Object.assign(keepExtracted("Lite lesbar tekst – PDF-en kan være skannet."), { cost: ocr.cost });
      throw new UserError("Fant ingen lesbar tekst i PDF-en, heller ikke med tekstgjenkjenning.");
    }
    return {
      source: Object.assign(source, { text: ocr.text, words: countWords(ocr.text), scanned: true, ocr: true }),
      assets: [],
      cost: ocr.cost,
    };
  }

  function readText(file) {
    const text = file.buffer.toString("utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
    if (!text) throw new UserError("Filen er tom");
    const clipped = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + "\n\n[… resten er kuttet]" : text;
    return { source: { kind: "text", name: file.originalname, title: "", text: clipped, html: "", notes: [], words: countWords(clipped) }, assets: [] };
  }

  const fileHandler = handle("sourceFile", "Kunne ikke lese dokumentet", async (req, res) => {
    await receive(req, res);
    if (!req.file) throw new UserError("Mangler fil");
    const kind = kindOf(req.file);
    const projectId = typeof (req.body || {}).projectId === "string" ? req.body.projectId : "";
    if (kind === "pdf") return res.json(await readPdf(req.file, /^np_[\w-]{6,40}$/.test(projectId) ? projectId : ""));
    if (kind === "docx") return res.json(await readDocx(req.file));
    if (kind === "text") return res.json(readText(req.file));
    throw new UserError("Filtypen støttes ikke. Bruk PDF, Word (.docx) eller tekst (.txt/.md). Gamle .doc-filer: lagre som .docx først.");
  });

  app.post("/api/native/sources/file", fileHandler);
  app.post("/api/native/sources/docx", fileHandler);

  app.post("/api/native/sources/web", handle("web", "Kunne ikke lese siden", async (req, res) => {
    const url = String((req.body || {}).url || "").trim();
    if (!/^https?:\/\//i.test(url)) throw new UserError("Lenken må starte med https://");
    let got;
    try {
      got = await safeFetch.fetchImage(url, { maxBytes: web.MAX_PAGE_BYTES, timeoutMs: 20000, headers: Object.assign({ Accept: "text/html" }, UA) });
    } catch (err) {
      throw friendly(err, "siden");
    }
    if (!/html/i.test(got.contentType)) throw new UserError("Lenken går ikke til en nettside");
    const parsed = web.parsePage(got.buffer.toString("utf8"), got.finalUrl);
    res.json({ source: Object.assign({ kind: "web", url: got.finalUrl }, parsed) });
  }));

  app.post("/api/native/sources/drive", handle("drive", "Kunne ikke lese mappen", async (req, res) => {
    try {
      res.json(await drive.list(String((req.body || {}).url || "")));
    } catch (err) {
      throw friendly(err, "mappen");
    }
  }));

  app.post("/api/native/sources/drive/import", handle("driveImport", "Kunne ikke hente filene", async (req, res) => {
    const files = Array.isArray((req.body || {}).files) ? req.body.files.slice(0, MAX_IMPORT) : [];
    if (!files.length) throw new UserError("Velg minst én fil");
    const results = await mapLimit(files, 3, async (f) => {
      const name = String(f.name || "").slice(0, 120);
      try {
        if (f.kind === "video") {
          const buf = await drive.download(f.id, MAX_VIDEO_BYTES);
          return { ok: true, asset: await assets.storeVideoBuffer(buf, { name, w: f.w, h: f.h, duration: f.duration, source: "drive" }) };
        }
        if (f.kind === "image") {
          const buf = await drive.download(f.id, MAX_IMAGE_BYTES);
          return { ok: true, asset: await assets.storeImage(buf, { name, source: "drive" }) };
        }
        return { ok: false, name, error: "Filtypen kan ikke importeres" };
      } catch (err) {
        return { ok: false, name, error: err && err.safe ? err.message : "Kunne ikke hente filen" };
      }
    });
    res.json({
      assets: results.filter((r) => r.ok).map((r) => r.asset),
      errors: results.filter((r) => !r.ok).map((r) => ({ name: r.name, error: r.error })),
    });
  }));

  app.post("/api/native/sources/images", handle("docImages", "Kunne ikke hente bildene", async (req, res) => {
    const urls = Array.isArray((req.body || {}).urls) ? req.body.urls.slice(0, MAX_IMPORT) : [];
    const results = await mapLimit(urls, 3, async (url) => {
      try {
        const got = await safeFetch.fetchImage(String(url), { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 30000, headers: UA });
        return { ok: true, asset: await assets.storeImage(got.buffer, { name: "fra-dokumentet", source: "url" }) };
      } catch (err) {
        return { ok: false, error: err && err.safe ? err.message : "Kunne ikke hente bildet" };
      }
    });
    res.json({ assets: results.filter((r) => r.ok).map((r) => r.asset), errors: results.filter((r) => !r.ok) });
  }));
}

module.exports = { registerSourceRoutes, mapLimit };
