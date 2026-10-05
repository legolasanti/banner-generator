"use strict";

/* =========================================================================
 * xlsx.js — reads the first worksheet of an .xlsx file into a table.
 *
 * Deliberately small and dependency-free: an .xlsx is a ZIP of XML files, and
 * a banner sheet needs only cell text, plus the URL behind a cell when it has
 * one — a Ctrl+K hyperlink, or an =IMAGE("…") / =HYPERLINK("…") formula, which
 * is how people like to preview photos inside Google Sheets. The SheetJS npm
 * package is unmaintained there and pulls in known advisories; this does the
 * one job needed and refuses anything that looks like a ZIP bomb.
 * ========================================================================= */

const zlib = require("zlib");

const MAX_ENTRY_BYTES = 40 * 1024 * 1024;
const MAX_CELLS = 200000;

class XlsxError extends Error {
  constructor(message) {
    super(message);
    this.name = "XlsxError";
    this.safe = true;
  }
}

// --------------------------------------------------------------------------
// ZIP (central directory → entries)
// --------------------------------------------------------------------------
function readZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new XlsxError("Filen er ikke en gyldig XLSX-fil");
  // End of central directory: last 22 bytes + up to 64 KB of comment.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError("Filen er ikke en gyldig XLSX-fil");
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== 0x02014b50) throw new XlsxError("XLSX-filen er skadet");
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const size = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const local = buf.readUInt32LE(ptr + 42);
    const name = buf.slice(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    entries.set(name, { method, compSize, size, local });
    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return {
    has: (name) => entries.has(name),
    text(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (e.size > MAX_ENTRY_BYTES) throw new XlsxError("XLSX-filen er for stor");
      if (buf.readUInt32LE(e.local) !== 0x04034b50) throw new XlsxError("XLSX-filen er skadet");
      const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
      const data = buf.slice(start, start + e.compSize);
      let out;
      if (e.method === 0) out = data;
      else if (e.method === 8) out = zlib.inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
      else throw new XlsxError("XLSX-filen bruker en komprimering som ikke støttes");
      return out.toString("utf8");
    },
  };
}

// --------------------------------------------------------------------------
// XML helpers (the files are machine-written and regular; no DTDs)
// --------------------------------------------------------------------------
function decodeXml(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(attrs, name) {
  const m = new RegExp("(?:^|\\s)" + name + '="([^"]*)"').exec(attrs);
  return m ? decodeXml(m[1]) : null;
}

/** Every <t> inside a fragment, joined — skipping phonetic runs (<rPh>). */
function textRuns(xml) {
  const cleaned = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(cleaned))) out += m[1] ? decodeXml(m[1]) : "";
  return out;
}

function relsMap(xml) {
  const map = new Map();
  if (!xml) return map;
  const re = /<Relationship\b([^>]*)\/?>/g;
  let m;
  while ((m = re.exec(xml))) {
    const id = attr(m[1], "Id");
    const target = attr(m[1], "Target");
    if (id && target) map.set(id, target);
  }
  return map;
}

function columnIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref || "");
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters[0]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** The first quoted http(s) URL in a formula — IMAGE("…") or HYPERLINK("…";…). */
function urlInFormula(formula) {
  const m = /"(https?:\/\/[^"]+)"/i.exec(decodeXml(formula || ""));
  return m ? m[1] : "";
}

function resolvePath(base, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/**
 * The first worksheet as rows of cells. A cell is a string, or {v, href} when
 * a link sits behind it.
 *
 * @param {Buffer} buf
 * @returns {{sheetName: string, table: Array<Array<string|{v:string,href:string}>>}}
 */
function readFirstSheet(buf) {
  const zip = readZip(buf);
  const workbook = zip.text("xl/workbook.xml");
  if (!workbook) throw new XlsxError("Fant ingen regneark i filen");

  const sheetTag = /<sheet\b([^>]*)\/?>/.exec(workbook);
  if (!sheetTag) throw new XlsxError("Fant ingen regneark i filen");
  const sheetName = attr(sheetTag[1], "name") || "Ark1";
  const rid = attr(sheetTag[1], "r:id");
  const wbRels = relsMap(zip.text("xl/_rels/workbook.xml.rels"));
  let sheetPath = rid && wbRels.get(rid) ? resolvePath("xl/workbook.xml", wbRels.get(rid)) : "xl/worksheets/sheet1.xml";
  if (!zip.has(sheetPath)) sheetPath = "xl/worksheets/sheet1.xml";
  const sheet = zip.text(sheetPath);
  if (!sheet) throw new XlsxError("Fant ingen regneark i filen");

  const sharedXml = zip.text("xl/sharedStrings.xml") || "";
  const shared = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(sharedXml))) shared.push(textRuns(m[1]));

  // Hyperlinks: <hyperlink ref="B2" r:id="rId3"/> with the target in the
  // sheet's own .rels file.
  const sheetRelsPath = sheetPath.replace(/([^/]+)$/, "_rels/$1.rels");
  const sheetRels = relsMap(zip.text(sheetRelsPath));
  const links = new Map();
  const hlRe = /<hyperlink\b([^>]*)\/?>/g;
  while ((m = hlRe.exec(sheet))) {
    const ref = attr(m[1], "ref");
    const id = attr(m[1], "r:id");
    const target = id ? sheetRels.get(id) : null;
    if (ref && target && /^https?:/i.test(target)) links.set(ref.split(":")[0], target);
  }

  const table = [];
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g;
  let cells = 0;
  while ((m = rowRe.exec(sheet))) {
    const rowAttrs = m[1] || m[3] || "";
    const r = Number(attr(rowAttrs, "r")) || table.length + 1;
    const row = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c;
    let col = 0;
    while ((c = cellRe.exec(m[2] || ""))) {
      if (++cells > MAX_CELLS) throw new XlsxError("Regnearket er for stort");
      const ref = attr(c[1], "r");
      const idx = ref ? columnIndex(ref) : col;
      col = idx + 1;
      const type = attr(c[1], "t");
      const inner = c[2] || "";
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
      const f = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(inner);
      let text = "";
      if (type === "s") text = shared[Number(v && v[1])] || "";
      else if (type === "inlineStr") text = textRuns(inner);
      else if (v) text = decodeXml(v[1]);
      if (type === "b") text = text === "1" ? "TRUE" : "FALSE";
      const href = (ref && links.get(ref)) || urlInFormula(f && f[1]);
      row[idx] = href ? { v: text, href } : text;
    }
    // Keep row numbers honest: blank rows in the sheet stay blank here.
    while (table.length < r - 1) table.push([]);
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = "";
    table.push(row);
  }
  return { sheetName, table };
}

module.exports = { readFirstSheet, XlsxError, _readZip: readZip, _columnIndex: columnIndex };
