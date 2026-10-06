"use strict";

/* =========================================================================
 * sources/gdoc.js — read a Google Docs brief.
 *
 * The team writes the copy brief in Google Docs. A doc shared as "Alle med
 * lenken kan lese" can be downloaded as HTML without any login:
 *   https://docs.google.com/document/d/<id>/export?format=html
 *
 * Google's export marks bold and italic with generated CSS classes rather
 * than <b>/<i>, wraps every link in a google.com/url?q=… redirect and appends
 * comments at the end. This module undoes all three:
 *   - classes with font-weight:700 / font-style:italic become <strong>/<em>
 *   - redirect links are unwrapped to the real address
 *   - comments are pulled out as separate notes (they often hold editorial
 *     instructions like "sjekk prisen med Ford"), not mixed into the copy
 * Images placed in the doc are listed so the user can import them.
 * ========================================================================= */

const Doc = require("../../../public/native/doc.js");
const { richToText, countWords } = require("./text");

const MAX_DOC_BYTES = 15 * 1024 * 1024;

/** The document id in any Google Docs link, or null. */
function docIdFromUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    return null;
  }
  if (url.hostname !== "docs.google.com") return null;
  const m = /^\/document(?:\/u\/\d+)?\/d\/([\w-]{20,})/.exec(url.pathname);
  return m ? m[1] : null;
}

function exportUrl(id) {
  return "https://docs.google.com/document/d/" + id + "/export?format=html";
}

/** Real target of a google.com/url?q=… redirect link. */
function unwrapLink(href) {
  const h = Doc.decodeEntities(href);
  try {
    const u = new URL(h);
    if ((u.hostname === "www.google.com" || u.hostname === "google.com") && u.pathname === "/url") {
      return u.searchParams.get("q") || h;
    }
  } catch {
    /* relative or broken — left as is, the sanitiser decides */
  }
  return h;
}

function classStyles(html) {
  const bold = new Set();
  const italic = new Set();
  const styleBlock = (/<style[^>]*>([\s\S]*?)<\/style>/i.exec(html) || [])[1] || "";
  const re = /\.([\w-]+)\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(styleBlock))) {
    if (/font-weight:\s*(700|bold|800|900)/.test(m[2])) bold.add(m[1]);
    if (/font-style:\s*italic/.test(m[2])) italic.add(m[1]);
  }
  return { bold, italic };
}

/**
 * Google Docs export HTML → { title, html, text, notes[], images[] }.
 * Pure function (no network), so it is tested with a saved export.
 */
function parseGoogleDocHtml(html) {
  const raw = String(html || "");
  const title = Doc.decodeEntities(((/<title>([\s\S]*?)<\/title>/i.exec(raw) || [])[1] || "").trim());
  const { bold, italic } = classStyles(raw);
  let body = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(raw) || [])[1] || raw;

  // Comments: the anchors in the text and the comment bodies at the end.
  const notes = [];
  body = body.replace(/<div[^>]*>\s*<p[^>]*>\s*<a[^>]*href="#cmnt_ref\d+"[^>]*>[^<]*<\/a>([\s\S]*?)<\/div>/gi, (_, inner) => {
    const t = Doc.decodeEntities(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (t) notes.push(t);
    return "";
  });
  body = body.replace(/<sup>\s*<a[^>]*href="#cmnt\d+"[^>]*>[^<]*<\/a>\s*<\/sup>/gi, "");

  // Images (for the user to import), then drop them from the text.
  const images = [];
  body = body.replace(/<img\b([^>]*)>/gi, (_, attrs) => {
    const src = (/\bsrc="([^"]+)"/i.exec(attrs) || [])[1];
    const alt = (/\balt="([^"]*)"/i.exec(attrs) || [])[1] || "";
    if (src) {
      const clean = Doc.decodeEntities(src);
      try {
        const host = new URL(clean).hostname;
        if (/(^|\.)googleusercontent\.com$/.test(host) && images.length < 60) images.push({ url: clean, alt: Doc.decodeEntities(alt) });
      } catch {
        /* not a URL */
      }
    }
    return "";
  });

  // The "Title" paragraph style → a heading.
  body = body.replace(/<p\b([^>]*class="[^"]*\btitle\b[^"]*"[^>]*)>([\s\S]*?)<\/p>/gi, "<h2>$2</h2>");
  body = body.replace(/<p\b([^>]*class="[^"]*\bsubtitle\b[^"]*"[^>]*)>([\s\S]*?)<\/p>/gi, "<h3>$2</h3>");

  // Class-based bold/italic → real tags.
  body = body.replace(/<span\b[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/span>/gi, (whole, cls, inner) => {
    const names = cls.split(/\s+/);
    let out = inner;
    if (names.some((c) => italic.has(c))) out = "<em>" + out + "</em>";
    if (names.some((c) => bold.has(c))) out = "<strong>" + out + "</strong>";
    return out;
  });

  body = body.replace(/<a\b([^>]*)\bhref="([^"]*)"([^>]*)>/gi, (_, a, href) => '<a href="' + Doc.escapeHtml(unwrapLink(href)) + '">');
  // Google writes one heading level more than we use (h1 for main headings).
  const clean = Doc.sanitizeRich(body, 200000);
  const text = richToText(clean);
  return { title, html: clean, text, notes, images, words: countWords(text) };
}

module.exports = { docIdFromUrl, exportUrl, parseGoogleDocHtml, unwrapLink, MAX_DOC_BYTES };
