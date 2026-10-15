"use strict";

/* =========================================================================
 * ai/revise.js — the page as the AI assistant sees it, and its edits back.
 *
 * After a page exists, the user types what to change ("kortere ingress",
 * "flytt sitatet opp", "legg til en FAQ om lading", "mørkere hero"). The
 * model gets the page as it really is — every section's id, type, content
 * and non-default style, the theme, the page options and the custom CSS —
 * and answers with a list of operations:
 *
 *   update   change fields of one section (only the fields that change)
 *   insert   a new section of a type, after a given section
 *   delete   remove a section
 *   move     put a section after another
 *   style    change a section's look (background, spacing, animation …)
 *   theme    change colours / fonts / corner radius for the whole page
 *   extras   page options (progress bar, floating button …)
 *   css      replace the page's custom CSS
 *
 * Everything the model sends is untrusted: values pass through the same
 * normalisers as the editor (doc.js), photos are short ids (B1 …) mapped
 * to the project's real assets, and links/CSS are sanitised. An operation
 * that points at a section that does not exist is reported, not applied.
 * ========================================================================= */

const S = require("../../../public/native/schema.js");
const Doc = require("../../../public/native/doc.js");
const validate = require("./validate");

const MAX_IMAGES = 80;
const MAX_OPS = 40;
const OPS = ["update", "insert", "delete", "move", "style", "theme", "extras", "css"];

/**
 * Short ids for the project's photos (B1, B2 …), both directions. Photos the
 * project's pages use come first, so a photo on the page always has an id
 * (an unmapped one would read as "" and be wiped when the model echoes it).
 */
function imageIds(project) {
  const toShort = {};
  const fromShort = {};
  const images = Object.keys(project.assets || {}).filter((id) => project.assets[id].kind === "image");
  const used = new Set(Doc.usedAssets ? Doc.usedAssets(project) : []);
  images
    .filter((id) => used.has(id))
    .concat(images.filter((id) => !used.has(id)))
    .slice(0, MAX_IMAGES)
    .forEach((id, i) => {
      toShort[id] = "B" + (i + 1);
      fromShort["B" + (i + 1)] = id;
    });
  return { toShort, fromShort };
}

function imagesText(project, ids) {
  return Object.keys(ids.fromShort)
    .map((short) => {
      const a = project.assets[ids.fromShort[short]];
      const bits = [a.name, a.alt, a.desc].filter(Boolean).join(" – ");
      return "- " + short + (a.w && a.h ? " (" + a.w + "×" + a.h + ")" : "") + ": " + (bits || "uten beskrivelse");
    })
    .join("\n");
}

function viewValue(f, v, ids) {
  if (f.type === "video") return undefined;
  if (f.type === "image") return v ? ids.toShort[v] || "" : "";
  if (f.type === "list") {
    return (Array.isArray(v) ? v : []).map((item) => {
      // Item ids travel so edits can be matched to the right item.
      const out = { id: item.id };
      f.item.forEach((sub) => {
        const sv = viewValue(sub, item[sub.key], ids);
        if (sv !== undefined) out[sub.key] = sv;
      });
      return out;
    });
  }
  return v;
}

/** One section as the model reads it. */
function sectionView(sec, ids) {
  const props = {};
  S.fieldsOf(sec.type).forEach((f) => {
    const v = viewValue(f, sec.props[f.key], ids);
    if (v !== undefined) props[f.key] = v;
  });
  const style = {};
  S.STYLE_FIELDS.forEach((f) => {
    const v = sec.style[f.key];
    if (v === undefined || v === f.default || v === "" || f.type === "video") return;
    style[f.key] = f.type === "image" ? ids.toShort[v] || "" : v;
  });
  const hidden = Object.keys(sec.hide || {}).filter((d) => sec.hide[d]);
  const view = { id: sec.id, type: sec.type, props, style };
  if (sec.name) view.name = sec.name;
  if (hidden.length) view.hiddenOn = hidden;
  return view;
}

/** The whole page as the model reads it ("the code"). */
function pageView(project, page, ids) {
  const extras = Object.assign({}, project.extras);
  const css = extras.customCss || "";
  delete extras.customCss;
  return {
    sections: page.sections.map((s) => sectionView(s, ids)),
    theme: project.theme,
    extras,
    css,
  };
}

/** Compact field catalog: every block type the AI may use, with limits. */
function blockCatalog() {
  const fieldText = (f) => {
    let t = f.key + "(" + f.type;
    if (f.max) t += "≤" + f.max;
    if (f.type === "select") t += ":" + f.options.map((o) => o[0]).join("|");
    if (f.type === "list") t += ":[" + f.item.filter((x) => x.type !== "video").map((x) => x.key + (x.max ? "≤" + x.max : "")).join(",") + "]" + (f.maxItems ? "≤" + f.maxItems : "");
    return t + ")";
  };
  return S.aiBlockTypes()
    .map((t) => {
      const b = S.BLOCKS[t];
      return "- " + t + " (" + b.label + " – " + b.desc + "): " + b.fields.filter((f) => f.type !== "video").map(fieldText).join(", ");
    })
    .join("\n");
}

function styleCatalog() {
  return S.STYLE_FIELDS.filter((f) => f.type !== "video")
    .map((f) => f.key + (f.options ? ":" + f.options.map((o) => o[0]).join("|") : "(" + f.type + ")"))
    .join("; ");
}

function extrasCatalog() {
  return S.EXTRA_FIELDS.filter((f) => f.key !== "customCss")
    .map((f) => f.key + (f.options ? ":" + f.options.map((o) => o[0]).join("|") : "(" + f.type + ")"))
    .join("; ");
}

// ---- applying the operations ---------------------------------------------------

function parseObject(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  const s = String(raw || "").trim();
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Rich text from the model: HTML is kept (sanitised later); plain text becomes paragraphs. */
function richValue(v) {
  if (Array.isArray(v)) return validate.blocksToHtml(v);
  const s = String(v || "");
  if (/<[a-z][\s\S]*>/i.test(s)) return Doc.sanitizeRich(s, S.HARD_MAX.rich);
  return validate.blocksToHtml(s.split(/\n{2,}/).map((p) => ({ kind: "p", text: p.trim(), items: [] })));
}

function convertValue(f, v, ids) {
  if (f.type === "video") return undefined;
  if (f.type === "rich") return richValue(v);
  if (f.type === "image") return v ? ids.fromShort[String(v)] || "" : "";
  if (f.type === "list") {
    if (!Array.isArray(v)) return undefined;
    return v.filter((item) => item && typeof item === "object").map((item) => {
      const out = {};
      if (typeof item.id === "string") out.id = item.id;
      f.item.forEach((sub) => {
        if (item[sub.key] === undefined) return;
        const cv = convertValue(sub, item[sub.key], ids);
        if (cv !== undefined) out[sub.key] = cv;
      });
      return out;
    });
  }
  return v;
}

/** The model's field values for `type` → props ready for normalizeSection. Unknown keys drop. */
function convertProps(type, raw, ids, current) {
  const out = {};
  const unknown = [];
  Object.keys(raw).forEach((key) => {
    const f = S.field(type, key);
    if (!f) return unknown.push(key);
    let v = convertValue(f, raw[key], ids);
    if (v === undefined) return;
    // List items keep their ids and hidden fields (videos …): matched by id;
    // by position only when the model sent no ids at all.
    if (f.type === "list" && Array.isArray(current && current[key])) {
      const old = current[key];
      const byId = {};
      old.forEach((it) => { if (it && it.id) byId[it.id] = it; });
      const anyIds = v.some((item) => item.id && byId[item.id]);
      v = v.map((item, i) => {
        const base = anyIds ? (item.id && byId[item.id]) || {} : old[i] || {};
        return Object.assign({}, base, item, { id: base.id || item.id });
      });
    }
    out[key] = v;
  });
  return { props: out, unknown };
}

function convertStyle(raw, ids) {
  const out = {};
  Object.keys(raw).forEach((key) => {
    const f = S.styleField(key);
    if (!f || f.type === "video") return;
    out[key] = f.type === "image" ? (raw[key] ? ids.fromShort[String(raw[key])] || "" : "") : raw[key];
  });
  return out;
}

/** style.hiddenOn: ["mobile", …] → the section's per-device visibility. */
function hideFrom(rawStyle, current) {
  if (!Array.isArray(rawStyle.hiddenOn)) return current;
  const on = rawStyle.hiddenOn.map(String);
  return { desktop: on.includes("desktop"), tablet: on.includes("tablet"), mobile: on.includes("mobile") };
}

/** Position after `after` ("START" = top). Missing/unknown → -1. */
function indexAfter(sections, after) {
  if (after === "START") return 0;
  const i = sections.findIndex((s) => s.id === after);
  return i === -1 ? -1 : i + 1;
}

/**
 * Apply the model's operations to the project's page.
 * @returns {{sections: Object[], theme: Object|null, extras: Object|null, changes: Object[], warnings: string[]}}
 */
function applyOps(project, page, rawOps, ids) {
  const ctx = { assets: project.assets };
  let sections = page.sections.slice();
  let theme = null;
  let extras = null;
  const changes = [];
  const warnings = [];
  const touched = new Set();

  const find = (id) => sections.findIndex((s) => s.id === id);

  (Array.isArray(rawOps) ? rawOps : []).slice(0, MAX_OPS).forEach((op) => {
    if (!op || !OPS.includes(op.op)) return;
    const summary = Doc.cleanText(op.summary, 200, false);
    const fail = (why) => warnings.push((summary ? summary + ": " : "") + why);
    const i = op.sectionId ? find(op.sectionId) : -1;

    if (op.op === "update" || op.op === "style") {
      if (i === -1) return fail("fant ikke seksjonen " + (op.sectionId || "(mangler id)"));
      const sec = sections[i];
      const rawProps = parseObject(op.props);
      const rawStyle = parseObject(op.style);
      if (rawProps === null || rawStyle === null) return fail("ugyldig JSON fra AI-en");
      const conv = convertProps(sec.type, rawProps, ids, sec.props);
      if (conv.unknown.length) warnings.push("Ukjente felt ignorert i " + S.BLOCKS[sec.type].label + ": " + conv.unknown.join(", "));
      const next = Doc.normalizeSection(
        Object.assign({}, sec, {
          props: Object.assign({}, sec.props, conv.props),
          style: Object.assign({}, sec.style, convertStyle(rawStyle, ids)),
          hide: hideFrom(rawStyle, sec.hide),
        }),
        ctx
      );
      sections = sections.slice(0, i).concat([next], sections.slice(i + 1));
      touched.add(next.id);
      changes.push({ op: op.op, sectionId: next.id, type: next.type, summary });
      return;
    }

    if (op.op === "insert") {
      if (!S.aiBlockTypes().includes(op.type)) return fail("ukjent seksjonstype «" + op.type + "»");
      const rawProps = parseObject(op.props);
      const rawStyle = parseObject(op.style);
      if (rawProps === null || rawStyle === null) return fail("ugyldig JSON fra AI-en");
      const fresh = Doc.normalizeSection(
        {
          type: op.type,
          props: convertProps(op.type, rawProps, ids, null).props,
          style: Object.assign({}, S.BLOCKS[op.type].style || {}, convertStyle(rawStyle, ids)),
          hide: hideFrom(rawStyle, {}),
        },
        ctx
      );
      let at = indexAfter(sections, op.after || "");
      if (at === -1) {
        // No (known) position: just before a closing CTA, else at the end.
        at = sections.length && sections[sections.length - 1].type === "cta" ? sections.length - 1 : sections.length;
        if (op.after) warnings.push((summary ? summary + ": " : "") + "fant ikke seksjonen «" + op.after + "», satt inn nederst");
      }
      sections = sections.slice(0, at).concat([fresh], sections.slice(at));
      touched.add(fresh.id);
      changes.push({ op: "insert", sectionId: fresh.id, type: fresh.type, summary });
      return;
    }

    if (op.op === "delete") {
      if (i === -1) return fail("fant ikke seksjonen " + (op.sectionId || "(mangler id)"));
      changes.push({ op: "delete", sectionId: op.sectionId, type: sections[i].type, summary });
      sections = sections.slice(0, i).concat(sections.slice(i + 1));
      touched.delete(op.sectionId);
      return;
    }

    if (op.op === "move") {
      if (i === -1) return fail("fant ikke seksjonen " + (op.sectionId || "(mangler id)"));
      if (op.after === op.sectionId) return;
      const sec = sections[i];
      const rest = sections.slice(0, i).concat(sections.slice(i + 1));
      const at = indexAfter(rest, op.after || "");
      if (at === -1) return fail("vet ikke hvor seksjonen skal flyttes (after mangler eller er ukjent)");
      sections = rest.slice(0, at).concat([sec], rest.slice(at));
      changes.push({ op: "move", sectionId: sec.id, type: sec.type, summary });
      return;
    }

    if (op.op === "theme") {
      const raw = parseObject(op.props);
      if (!raw) return fail("ugyldig JSON fra AI-en");
      const base = theme || project.theme;
      const merged = Object.assign({}, base, raw, {
        colors: Object.assign({}, base.colors, raw.colors || {}),
        fonts: {
          heading: Object.assign({}, base.fonts.heading, (raw.fonts && raw.fonts.heading) || {}),
          body: Object.assign({}, base.fonts.body, (raw.fonts && raw.fonts.body) || {}),
        },
      });
      theme = Doc.normalizeTheme(merged, ctx);
      changes.push({ op: "theme", sectionId: "", type: "", summary });
      return;
    }

    if (op.op === "extras" || op.op === "css") {
      const base = extras || project.extras;
      let patch;
      if (op.op === "css") {
        const css = typeof op.props === "string" ? op.props.trim() : "";
        // An empty css op is far more often a confused model than a wish to delete all CSS.
        if (!css && !/fjern|slett|tøm/i.test(summary)) return fail("tom CSS ignorert");
        patch = { customCss: Doc.sanitizeCss(css) };
      }
      else {
        patch = parseObject(op.props);
        if (!patch) return fail("ugyldig JSON fra AI-en");
        delete patch.customCss;
      }
      extras = Doc.normalizeProject({ assets: project.assets, extras: Object.assign({}, base, patch) }).extras;
      changes.push({ op: op.op, sectionId: "", type: "", summary });
    }
  });

  // Over-long text is kept (the editor's counters turn red) but reported.
  sections.forEach((sec) => {
    if (!touched.has(sec.id)) return;
    validate.problems(sec.type, sec.props).forEach((p) => warnings.push(S.BLOCKS[sec.type].label + ": " + p));
  });

  return { sections, theme, extras, changes, warnings };
}

module.exports = { imageIds, imagesText, pageView, sectionView, blockCatalog, styleCatalog, extrasCatalog, applyOps, convertProps, richValue, OPS };
