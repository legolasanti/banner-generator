"use strict";

/* =========================================================================
 * sources/pdf.js — read a PDF brief (a printed Word file, a press kit, a
 * product sheet) into the same { title, text, words } shape as the other
 * sources.
 *
 * Text PDFs are read locally with unpdf (pdf.js, no native code). A scanned
 * PDF has no text layer; it is flagged `scanned`, and the route may then ask
 * OpenRouter to OCR it (ocrPrompt below) — that costs a little and sends the
 * file to the AI provider, so it only happens when AI is configured.
 * ========================================================================= */

const { countWords, MAX_TEXT } = require("./text");
const { UserError } = require("../fsutil");

// Fewer readable words than this per page (and under MIN_WORDS in all) →
// treat the PDF as a scan. Real scans give next to nothing.
const MIN_WORDS_PER_PAGE = 5;
const MIN_WORDS = 10;
const MAX_PAGES = 120;

let unpdf = null;
async function lib() {
  if (!unpdf) unpdf = await import("unpdf");
  return unpdf;
}

function cleanPageText(s) {
  return String(s || "")
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    // A hyphen at a line end splits a word ("elbil-\nen" → "elbilen").
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Free pdf.js memory; the proxy's method name differs between builds. */
function release(doc) {
  try {
    const done = typeof doc.destroy === "function" ? doc.destroy() : typeof doc.cleanup === "function" ? doc.cleanup() : null;
    if (done && typeof done.catch === "function") done.catch(() => {});
  } catch {
    /* nothing to free */
  }
}

/**
 * @param {Buffer} buffer
 * @returns {Promise<{title: string, text: string, html: string, notes: string[], words: number, pages: number, scanned: boolean}>}
 */
async function parsePdf(buffer) {
  if (!buffer || buffer.length < 5 || buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new UserError("Filen er ikke en gyldig PDF");
  }
  const { getDocumentProxy, extractText, getMeta } = await lib();
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer));
  } catch (err) {
    if (err && /password/i.test(err.message || "")) throw new UserError("PDF-en er passordbeskyttet. Lagre en kopi uten passord og prøv igjen.");
    throw new UserError("PDF-en kunne ikke leses. Er filen skadet?");
  }
  try {
    if (pdf.numPages > MAX_PAGES) throw new UserError("PDF-en har " + pdf.numPages + " sider. Maks " + MAX_PAGES + " – del den opp eller lim inn de viktigste delene.");
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).map(cleanPageText);
    let body = pages.filter(Boolean).join("\n\n");
    if (body.length > MAX_TEXT) body = body.slice(0, MAX_TEXT) + "\n\n[… resten er kuttet]";
    let title = "";
    try {
      const meta = await getMeta(pdf);
      title = String((meta && meta.info && meta.info.Title) || "").trim().slice(0, 120);
    } catch {
      /* no metadata is fine */
    }
    const words = countWords(body);
    return { title, text: body, html: "", notes: [], words, pages: totalPages, scanned: words < Math.max(MIN_WORDS, totalPages * MIN_WORDS_PER_PAGE) };
  } finally {
    release(pdf);
  }
}

/** Instruction for the OCR fallback (OpenRouter file-parser). */
const OCR_PROMPT =
  "Transcribe this document to plain Markdown, verbatim and in its original language. Keep headings (##), lists (- ) and tables as Markdown. " +
  "Do not summarise, translate, correct or add anything. If a part is unreadable, write [uleselig].";

module.exports = { parsePdf, cleanPageText, OCR_PROMPT };
