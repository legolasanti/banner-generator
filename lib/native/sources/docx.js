"use strict";

/* =========================================================================
 * sources/docx.js — read a Word document (.docx), e.g. a Google Doc saved
 * with Fil → Last ned → Microsoft Word when the link cannot be shared.
 *
 * A .docx is a ZIP of XML. This reads word/document.xml paragraph by
 * paragraph: heading styles become headings, numbered/bulleted paragraphs
 * become list items, bold/italic runs and hyperlinks are kept, and embedded
 * pictures (word/media/*) are returned so they can be imported as assets.
 * Comments (word/comments.xml) come back as notes, like for Google Docs.
 *
 * Reuses the ZIP reader written for Bulk's .xlsx import — no new dependency.
 * ========================================================================= */

const Doc = require("../../../public/native/doc.js");
const { _readZip: readZip } = require("../../bulk/xlsx");
const { richToText, countWords } = require("./text");
const { UserError } = require("../fsutil");

const MAX_MEDIA = 60;

function decodeXml(s) {
  return Doc.decodeEntities(String(s));
}

function attr(attrs, name) {
  const m = new RegExp("(?:^|\\s)" + name.replace(":", "\\:") + '="([^"]*)"').exec(attrs);
  return m ? decodeXml(m[1]) : null;
}

function rels(xml) {
  const map = new Map();
  const re = /<Relationship\b([^>]*)\/?>/g;
  let m;
  while ((m = re.exec(xml || ""))) {
    const id = attr(m[1], "Id");
    if (id) map.set(id, { target: attr(m[1], "Target"), mode: attr(m[1], "TargetMode") });
  }
  return map;
}

/** Text of one run, with <w:tab/> and <w:br/> kept as whitespace. */
function runText(runXml) {
  let out = "";
  const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(runXml))) {
    if (m[1] !== undefined) out += decodeXml(m[1]);
    else if (m[0].startsWith("<w:tab")) out += " ";
    else out += "\n";
  }
  return out;
}

function runHtml(runXml) {
  const t = runText(runXml);
  if (!t) return "";
  const props = (/<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(runXml) || [])[1] || "";
  let out = Doc.escapeHtml(t).replace(/\n/g, "<br>");
  if (/<w:i(?:\s+w:val="(?:1|true|on)")?\s*\/>/.test(props)) out = "<em>" + out + "</em>";
  if (/<w:b(?:\s+w:val="(?:1|true|on)")?\s*\/>/.test(props)) out = "<strong>" + out + "</strong>";
  return out;
}

function headingLevel(pPr) {
  const style = (/<w:pStyle w:val="([^"]+)"/.exec(pPr) || [])[1] || "";
  if (/^(Title|Tittel)$/i.test(style)) return 2;
  const m = /^(?:Heading|Overskrift|berschrift)\s*(\d)$/i.exec(style.replace(/([a-z])(\d)$/i, "$1 $2"));
  if (m) return Number(m[1]) <= 1 ? 2 : 3;
  return 0;
}

/**
 * .docx bytes → { title, html, text, notes[], media[{name, buffer}] }.
 * @throws {UserError} when the file is not a readable Word document
 */
function parseDocx(buffer) {
  let zip;
  try {
    zip = readZip(buffer);
  } catch {
    throw new UserError("Filen er ikke et gyldig Word-dokument (.docx)");
  }
  const xml = zip.text("word/document.xml");
  if (!xml) throw new UserError("Filen er ikke et gyldig Word-dokument (.docx)");
  const links = rels(zip.text("word/_rels/document.xml.rels"));

  const blocks = [];
  let list = null;
  const body = (/<w:body>([\s\S]*)<\/w:body>/.exec(xml) || [])[1] || xml;
  const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>|<w:p\b[^>]*\/>/g;
  let m;
  while ((m = paraRe.exec(body))) {
    const p = m[1] || "";
    const pPr = (/<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(p) || [])[1] || "";
    let inner = "";
    // Hyperlinks wrap runs; plain runs sit directly in the paragraph.
    const partRe = /<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>|<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
    let part;
    while ((part = partRe.exec(p))) {
      if (part[2] !== undefined) {
        const rid = attr(part[1], "r:id");
        const target = rid && links.get(rid);
        const label = (part[2].match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) || []).map(runHtml).join("");
        const href = target && target.mode === "External" ? target.target : "";
        inner += href ? '<a href="' + Doc.escapeHtml(href) + '">' + label + "</a>" : label;
      } else {
        inner += runHtml("<w:r>" + part[3] + "</w:r>");
      }
    }
    const isList = /<w:numPr>/.test(pPr) || /<w:pStyle w:val="(List|Liste)/i.test(pPr);
    const level = headingLevel(pPr);
    if (isList && inner.trim()) {
      if (!list) {
        list = [];
        blocks.push({ list });
      }
      list.push(inner);
      continue;
    }
    list = null;
    if (!inner.replace(/<[^>]+>/g, "").trim()) continue;
    blocks.push(level ? "<h" + level + ">" + inner + "</h" + level + ">" : "<p>" + inner + "</p>");
  }
  const rawHtml = blocks.map((b) => (typeof b === "string" ? b : "<ul>" + b.list.map((li) => "<li>" + li + "</li>").join("") + "</ul>")).join("");
  const html = Doc.sanitizeRich(rawHtml, 200000);

  const notes = [];
  const comments = zip.text("word/comments.xml");
  if (comments) {
    const cre = /<w:comment\b[^>]*>([\s\S]*?)<\/w:comment>/g;
    let c;
    while ((c = cre.exec(comments))) {
      const t = runText(c[1]).replace(/\s+/g, " ").trim();
      if (t) notes.push(t);
    }
  }

  const coreTitle = decodeXml((/<dc:title>([\s\S]*?)<\/dc:title>/.exec(zip.text("docProps/core.xml") || "") || [])[1] || "").trim();
  const media = [];
  for (const [, rel] of links) {
    if (media.length >= MAX_MEDIA) break;
    if (!rel.target || rel.mode === "External" || !/^media\/[\w.-]+\.(png|jpe?g|gif|webp)$/i.test(rel.target)) continue;
    const name = "word/" + rel.target;
    if (!zip.has(name)) continue;
    media.push({ name: rel.target.slice(6), path: name });
  }
  const text = richToText(html);
  return { title: coreTitle, html, text, notes, media, words: countWords(text) };
}

/** The bytes of one embedded picture (binary-safe read from the ZIP). */
function mediaBuffer(buffer, entryPath) {
  const zlib = require("zlib");
  // The shared reader returns text; pictures need the raw bytes, so read the
  // local header ourselves (same layout readZip already validated).
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = buffer.readUInt16LE(eocd + 10);
  let ptr = buffer.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(ptr + 10);
    const compSize = buffer.readUInt32LE(ptr + 20);
    const size = buffer.readUInt32LE(ptr + 24);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const local = buffer.readUInt32LE(ptr + 42);
    const name = buffer.slice(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    if (name === entryPath) {
      if (size > 50 * 1024 * 1024) return null;
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const data = buffer.slice(start, start + compSize);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: 50 * 1024 * 1024 });
      return null;
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

module.exports = { parseDocx, mediaBuffer };
