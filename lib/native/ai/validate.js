"use strict";

/* =========================================================================
 * ai/validate.js — check a model's section against the block schema and
 * turn it into a real section.
 *
 * The providers cannot enforce character limits, so this does: every field
 * the model wrote is measured against the editorial limit in schema.js
 * (10 % grace, since a one-word overshoot is not worth a round trip). What
 * fails comes back as plain sentences the model can act on in its repair
 * round. Whatever still fails after that is kept — the editor's character
 * counters turn red, nothing is silently cut.
 * ========================================================================= */

const S = require("../../../public/native/schema.js");
const Doc = require("../../../public/native/doc.js");

const GRACE = 1.1;

function inline(text) {
  let s = Doc.escapeHtml(String(text || ""));
  s = s.replace(/\[([^\]]{1,200})\]\(([^)\s]{1,600})\)/g, (_, label, url) => {
    const href = Doc.safeUrl(Doc.decodeEntities(url));
    return href ? '<a href="' + Doc.escapeHtml(href) + '">' + label + "</a>" : label;
  });
  s = s.replace(/\*\*([^*]{1,400})\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\s][^*]{0,300}?)\*(?=[\s.,;:!?)]|$)/g, "$1<em>$2</em>");
  return s.replace(/\n/g, "<br>");
}

/** The model's block list → sanitised rich-text HTML. */
function blocksToHtml(blocks) {
  if (typeof blocks === "string") return Doc.sanitizeRich(blocks, S.HARD_MAX.rich);
  const html = (Array.isArray(blocks) ? blocks : [])
    .map((b) => {
      if (!b || typeof b !== "object") return "";
      if (b.kind === "ul") {
        const items = (b.items || []).filter((x) => String(x).trim());
        return items.length ? "<ul>" + items.map((x) => "<li>" + inline(x) + "</li>").join("") + "</ul>" : "";
      }
      if (!String(b.text || "").trim()) return "";
      if (b.kind === "h2" || b.kind === "h3") return "<" + b.kind + ">" + inline(b.text) + "</" + b.kind + ">";
      if (b.kind === "quote") return "<blockquote><p>" + inline(b.text) + "</p></blockquote>";
      return "<p>" + inline(b.text) + "</p>";
    })
    .join("");
  return Doc.sanitizeRich(html, S.HARD_MAX.rich);
}

function measure(f, value) {
  if (f.type === "rich") return Doc.plainText(value).length;
  return String(value || "").length;
}

/**
 * Problems with one section's props, as sentences for the repair prompt.
 * `props` are already converted (rich text is HTML here).
 */
function problems(type, props) {
  const out = [];
  S.fieldsOf(type).forEach((f) => {
    if (!S.aiWrites(type, f)) return;
    const v = props[f.key];
    if (f.max && (f.type === "text" || f.type === "textarea" || f.type === "rich")) {
      const n = measure(f, v);
      if (n > f.max * GRACE) out.push("«" + f.label + "» (" + f.key + ") er " + n + " tegn, maks " + f.max + ".");
      if (f.required && n === 0) out.push("«" + f.label + "» (" + f.key + ") mangler.");
    }
    if (f.type === "list" && Array.isArray(v)) {
      if (f.maxItems && v.length > f.maxItems) out.push("«" + f.label + "» har " + v.length + " elementer, maks " + f.maxItems + ".");
      v.forEach((item, i) => {
        f.item.forEach((sub) => {
          if (!sub.max || (sub.type !== "text" && sub.type !== "textarea")) return;
          const n = String(item[sub.key] || "").length;
          if (n > sub.max * GRACE) out.push("«" + f.label + "» nr. " + (i + 1) + ", «" + sub.label + "» er " + n + " tegn, maks " + sub.max + ".");
        });
      });
    }
  });
  return out;
}

/**
 * The model's answer → { section, problems }. `imageMap` turns the short
 * image ids the model saw (B1, B2 …) into real asset ids; unknown ids drop.
 */
function toSection(type, answer, opts) {
  const o = opts || {};
  const map = o.imageMap || {};
  const raw = (answer && answer.props) || {};
  const props = {};
  S.fieldsOf(type).forEach((f) => {
    if (!S.aiWrites(type, f) || raw[f.key] === undefined) return;
    if (f.type === "rich") props[f.key] = blocksToHtml(raw[f.key]);
    else if (f.type === "image") props[f.key] = map[raw[f.key]] || "";
    else if (f.type === "list") {
      props[f.key] = (Array.isArray(raw[f.key]) ? raw[f.key] : []).filter((item) => item && typeof item === "object").map((item) => {
        const out = {};
        f.item.forEach((sub) => {
          if (item[sub.key] === undefined) return;
          out[sub.key] = sub.type === "image" ? map[item[sub.key]] || "" : item[sub.key];
        });
        return out;
      });
    } else props[f.key] = raw[f.key];
  });
  const merged = Object.assign({}, o.baseProps || {}, props);
  const section = Doc.normalizeSection(
    { type, props: merged, style: o.style || {}, name: "" },
    { assets: o.assets || {} }
  );
  return {
    section,
    problems: problems(type, section.props),
    usedFacts: Array.isArray(answer && answer.usedFacts) ? answer.usedFacts.filter((x) => typeof x === "string").slice(0, 40) : [],
    warnings: Array.isArray(answer && answer.warnings) ? answer.warnings.filter((x) => typeof x === "string").map((w) => w.slice(0, 300)).slice(0, 10) : [],
  };
}

module.exports = { blocksToHtml, problems, toSection, inline };
