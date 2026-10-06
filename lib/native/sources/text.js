"use strict";

/* =========================================================================
 * sources/text.js — shared helpers for turning documents into text the AI
 * (and a human) can read.
 *
 * Every source (Google Docs, .docx, a product page) ends up as:
 *   html   the cleaned formatted text (doc.sanitizeRich subset)
 *   text   the same as light Markdown: "## " headings, "- " list items,
 *          **bold**, [link](url) — the format the model reads best
 * ========================================================================= */

const Doc = require("../../../public/native/doc.js");

const MAX_TEXT = 60000;

/** Sanitised HTML → light Markdown. */
function richToText(html) {
  let s = String(html || "");
  s = s.replace(/<h2>([\s\S]*?)<\/h2>/g, "\n\n## $1\n\n");
  s = s.replace(/<h3>([\s\S]*?)<\/h3>/g, "\n\n### $1\n\n");
  s = s.replace(/<li>([\s\S]*?)<\/li>/g, "\n- $1");
  s = s.replace(/<\/(ul|ol)>/g, "\n\n");
  s = s.replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_, inner) => "\n\n> " + inner.replace(/<\/?p>/g, " ").trim() + "\n\n");
  s = s.replace(/<p>([\s\S]*?)<\/p>/g, "\n\n$1\n\n");
  s = s.replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**");
  s = s.replace(/<em>([\s\S]*?)<\/em>/g, "*$1*");
  s = s.replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (_, href, label) => {
    const clean = Doc.decodeEntities(href);
    return label.trim() === clean ? clean : "[" + label + "](" + clean + ")";
  });
  s = s.replace(/<br>/g, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = Doc.decodeEntities(s);
  s = s.replace(/[ \t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + "\n\n[… resten er kuttet]" : s;
}

/** Strip a whole HTML page down to its readable content. */
function readableHtml(html) {
  let s = String(html || "");
  s = s.replace(/<(script|style|noscript|svg|template|iframe|form|button|select)\b[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ");
  const main = /<main\b[\s\S]*?<\/main>/i.exec(s) || /<article\b[\s\S]*?<\/article>/i.exec(s);
  if (main) s = main[0];
  else {
    const body = /<body\b[\s\S]*?<\/body>/i.exec(s);
    if (body) s = body[0];
  }
  return s;
}

function countWords(text) {
  return (String(text).match(/[\p{L}\p{N}]+/gu) || []).length;
}

module.exports = { richToText, readableHtml, countWords, MAX_TEXT };
