"use strict";

/* =========================================================================
 * pages.js — turns a project into finished pages: the review link, the page
 * ABC design hosts itself (/n/<slug>/) and the downloadable ZIP.
 *
 * All three go through public/native/render.js; this module only decides
 * where assets, fonts, the stylesheet and the runtime come from:
 *
 *   preview / publish   /np-assets/<file>, np.js from /native/runtime/,
 *                       np.css inlined
 *   export (ZIP)        relative paths into assets/, everything inside the
 *                       ZIP, so the folder works on any web server — or
 *                       opened straight from disk
 *
 * Fonts: Google fonts are downloaded and SUBSET to the characters the page
 * actually uses (lib/google-fonts.js), then served from the page itself. No
 * request ever goes to Google from a reader's browser (GDPR), and a typical
 * face drops from ~40 KB to ~10 KB. Uploaded brand fonts are copied as-is.
 * ========================================================================= */

const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const archiver = require("archiver");

const Render = require("../../public/native/render.js");
const Doc = require("../../public/native/doc.js");
const Fonts = require("../../public/wallpaper/fonts.js");
const { faceFileName } = require("../google-fonts");

const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");
const CSS_FILE = path.join(PUBLIC_DIR, "native", "runtime", "np.css");
const JS_FILE = path.join(PUBLIC_DIR, "native", "runtime", "np.js");

let cssCache = null;
let jsCache = null;

async function runtimeCss() {
  if (!cssCache || process.env.NODE_ENV !== "production") {
    const raw = await fsp.readFile(CSS_FILE, "utf8");
    // Drop comments and indentation; the file is hand-written and regular.
    cssCache = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n\s+/g, "\n").replace(/\n{2,}/g, "\n").trim();
  }
  return cssCache;
}

async function runtimeJs() {
  if (!jsCache || process.env.NODE_ENV !== "production") jsCache = await fsp.readFile(JS_FILE, "utf8");
  return jsCache;
}

/** The faces a theme needs from Google Fonts. */
function googleFaces(theme) {
  const out = [];
  const add = (family, weight, italic) => {
    if (!Fonts.has(family)) return;
    const w = Fonts.nearestWeight(family, weight);
    if (out.some((f) => f.family === family && f.weight === w && f.italic === italic)) return;
    out.push({ family, weight: w, italic });
  };
  const h = theme.fonts.heading;
  const b = theme.fonts.body;
  if (h.source === "google") {
    add(h.family, h.weight, false);
    add(h.family, h.weight, true); // quotes are set in the heading face, italic
  }
  if (b.source === "google") {
    add(b.family, b.weight, false);
    add(b.family, 700, false);
    add(b.family, b.weight, true);
  }
  return out;
}

function customFontCss(project, srcFor) {
  return Object.keys(project.assets)
    .filter((id) => project.assets[id].kind === "font" && project.assets[id].family)
    .map((id) => {
      const a = project.assets[id];
      const fmt = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" }[id.split(".").pop()];
      return (
        "@font-face{font-family:" + JSON.stringify(a.family) + ";font-weight:" + a.weight + ";font-style:" + a.style +
        ";font-display:swap;src:url(" + JSON.stringify(srcFor(id)) + ") format(" + JSON.stringify(fmt) + ");}"
      );
    })
    .join("");
}

function faceCss(face, src) {
  return (
    "@font-face{font-family:" + JSON.stringify(face.family) + ";font-style:" + (face.italic ? "italic" : "normal") +
    ";font-weight:" + face.weight + ";font-display:swap;src:url(" + JSON.stringify(src) + ") format(\"woff2\");}"
  );
}

function createPageBuilder(deps) {
  const { assets, fontSource } = deps;

  /**
   * Subset Google faces for a project. Returns the @font-face CSS plus the
   * files; a font that cannot be fetched (offline) falls back to the system
   * font stack and is reported, never fatal.
   */
  async function subsetFonts(project, srcFor) {
    const text = Render.pageText(project);
    const files = [];
    const warnings = [];
    let css = "";
    for (const face of googleFaces(project.theme)) {
      try {
        const got = await fontSource.getFace({ family: face.family, weight: face.weight, italic: face.italic, text });
        const name = faceFileName(got);
        files.push({ name, buffer: got.buffer, face: got });
        css += faceCss(got, srcFor(name, got));
      } catch (err) {
        warnings.push("Skriften «" + face.family + "» kunne ikke hentes (" + (err.safe ? err.message : "nettverksfeil") + ").");
      }
    }
    return { css, files, warnings };
  }

  function baseCtx(project, settings, page, mode) {
    return {
      mode,
      project,
      page,
      settings,
      assets: Object.assign({}, settings.assets, project.assets),
    };
  }

  /** The review link / hosted page: assets from this server. */
  async function renderHosted(project, settings, page, opts) {
    const o = opts || {};
    const mode = o.mode || "preview";
    const ctx = baseCtx(project, settings, page, mode);
    ctx.url = (id, w) => "/np-assets/" + assets.variantName(id, w);
    ctx.pageHref = o.pageHref;
    ctx.cssText = await runtimeCss();
    ctx.runtimeSrc = "/native/runtime/np.js";
    const fonts = await subsetFonts(project, (name, face) => {
      // Content-addressed copy in the asset store, so /np-assets serves it.
      const id = crypto.createHash("sha256").update(face.buffer).digest("hex") + ".woff2";
      face.storeAs = id;
      return "/np-assets/" + id;
    });
    for (const f of fonts.files) {
      const id = f.face.storeAs;
      const abs = assets.fileFor(id);
      try {
        await fsp.access(abs);
      } catch {
        await fsp.writeFile(abs, f.buffer);
      }
    }
    ctx.fontCss = fonts.css + customFontCss(project, (id) => "/np-assets/" + id);
    const canonical = o.canonical || "";
    ctx.canonical = canonical;
    const og = project.meta.ogImage || firstImage(page);
    ctx.ogImageUrl = og && o.absoluteBase ? o.absoluteBase + "/np-assets/" + assets.variantName(og, pickWidth(ctx.assets[og], 1200)) : "";
    ctx.extraHead = o.extraHead || "";
    ctx.extraBody = o.extraBody || "";
    return Render.renderDocument(ctx);
  }

  function pickWidth(meta, want) {
    const ws = (meta && meta.widths) || [];
    if (!ws.length) return 0;
    return ws.find((w) => w >= want) || ws[ws.length - 1];
  }

  function firstImage(page) {
    const hero = page.sections.find((s) => s.type === "hero");
    return hero && hero.props.image ? hero.props.image : "";
  }

  /**
   * Stream the project as a ZIP: index.html (first page), <variant>/index.html,
   * assets/… and LES-MEG.txt. Resolves with a report of what went in.
   */
  async function exportZip(project, settings, output) {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const done = new Promise((resolve, reject) => {
      archive.on("error", reject);
      output.on("close", resolve);
      output.on("finish", resolve);
    });
    archive.pipe(output);

    const merged = Object.assign({}, settings.assets, project.assets);
    const used = new Set(Doc.usedAssets(project));
    [settings.publisherLogo, settings.studioLogo].forEach((id) => id && used.add(id));
    const files = [];
    const add = (name, data) => {
      archive.append(data, { name });
      files.push({ name, bytes: data.length });
    };

    const dirFor = (id) => {
      const kind = Doc.assetKind(id);
      return kind === "video" ? "video/" : kind === "font" ? "fonts/" : "img/";
    };

    // Assets: variants for images (originals only when there are none).
    for (const id of used) {
      const meta = merged[id];
      if (!meta) continue;
      if (meta.kind === "image" && meta.widths && meta.widths.length) {
        for (const w of meta.widths) {
          const name = assets.variantName(id, w);
          const buf = await assets.read(name);
          if (buf) add("assets/img/" + name, buf);
        }
      } else {
        const buf = await assets.read(id);
        if (buf) add("assets/" + dirFor(id) + id, buf);
      }
    }

    const fonts = await subsetFonts(project, (name) => "@@ASSETS@@fonts/" + name);
    fonts.files.forEach((f) => add("assets/fonts/" + f.name, f.buffer));

    // Share image as JPEG, absolute only if we know where the page will live.
    const og = project.meta.ogImage || firstImage(project.pages[0]);
    let ogName = "";
    if (og && merged[og]) {
      const jpg = await assets.shareImage(og).catch(() => null);
      if (jpg) {
        ogName = "assets/img/deling.jpg";
        add(ogName, jpg);
      }
    }

    add("assets/np.js", Buffer.from(await runtimeJs(), "utf8"));
    const css = await runtimeCss();
    const base = project.meta.publicUrl;

    project.pages.forEach((page, i) => {
      const prefix = i === 0 ? "" : "../";
      const ctx = baseCtx(project, settings, page, "export");
      ctx.url = (id, w) => prefix + "assets/" + dirFor(id) + assets.variantName(id, w);
      ctx.pageHref = (pg) => {
        const k = project.pages.indexOf(pg);
        if (i === 0) return k === 0 ? "./index.html" : pg.slug + "/index.html";
        return k === 0 ? "../index.html" : "../" + pg.slug + "/index.html";
      };
      ctx.cssText = css;
      ctx.runtimeSrc = prefix + "assets/np.js";
      ctx.fontCss = fonts.css.replace(/@@ASSETS@@/g, prefix + "assets/") + customFontCss(project, (id) => prefix + "assets/fonts/" + id);
      ctx.canonical = base ? base + (i === 0 ? "" : page.slug + "/") : "";
      ctx.ogImageUrl = base && ogName ? base + ogName : "";
      const html = Render.renderDocument(ctx);
      add((i === 0 ? "" : page.slug + "/") + "index.html", Buffer.from(html, "utf8"));
    });

    const report = buildReport(project, files, fonts.warnings);
    add("LES-MEG.txt", Buffer.from(readMe(project, settings, report), "utf8"));
    await archive.finalize();
    await done;
    return report;
  }

  return { renderHosted, exportZip, subsetFonts, runtimeCss };
}

function kb(bytes) {
  return (bytes / 1024).toFixed(0) + " KB";
}

function buildReport(project, files, warnings) {
  const total = files.reduce((n, f) => n + f.bytes, 0);
  const videos = files.filter((f) => f.name.startsWith("assets/video/")).reduce((n, f) => n + f.bytes, 0);
  const notes = warnings.slice();
  if (!project.meta.publicUrl) {
    notes.push("Adressen siden skal ligge på er ikke fylt ut (Prosjekt → Deling). Uten den mangler canonical og delingsbilde (og:image).");
  }
  if (videos > 40 * 1024 * 1024) notes.push("Videoene er til sammen " + kb(videos) + ". Vurder å komprimere dem.");
  return { files: files.length, totalBytes: total, videoBytes: videos, notes };
}

function readMe(project, settings, report) {
  const lines = [
    "ABC DESIGN — NATIVE PREMIUM",
    "===========================",
    "",
    "Prosjekt:   " + project.name,
    "Annonsør:   " + (project.advertiser.name || "–"),
    "Eksportert: " + new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
    "",
    "INNHOLD",
    "  index.html            " + project.pages[0].label,
  ];
  project.pages.slice(1).forEach((p) => lines.push("  " + (p.slug + "/index.html").padEnd(22) + p.label));
  lines.push(
    "  assets/               bilder (WebP i flere størrelser), video, skrifter, np.js",
    "",
    "PUBLISERING",
    "  Last opp HELE mappen som den er, til adressen siden skal ligge på" + (project.meta.publicUrl ? " (" + project.meta.publicUrl + ")" : "") + ".",
    "  Alle lenker er relative, så mappen fungerer på hvilken som helst server –",
    "  og kan også åpnes rett fra disken for en rask kontroll.",
    "",
    "  Merkingen «" + settings.disclosureLabel.replace("{annonsør}", project.advertiser.name || "annonsør") + "» og",
    "  bunnteksten er en fast del av siden og skal ikke fjernes.",
    "",
    "MÅLING",
    "  Siden sender disse hendelsene til window.dataLayer (og som DOM-hendelsen",
    "  «np:track»), klare for GTM, Kilkaya, Mixpanel o.l.:",
    "    np_view, np_scroll (25/50/75/100), np_time (10/30/60/120 s),",
    "    np_cta_click, np_video, np_factbox_open, np_share, np_quiz_*",
    "",
    "STØRRELSE",
    "  " + report.files + " filer, " + kb(report.totalBytes) + " totalt (" + kb(report.videoBytes) + " video).",
    "  Leseren laster bare bildestørrelsen skjermen trenger."
  );
  if (report.notes.length) {
    lines.push("", "MERK");
    report.notes.forEach((n) => lines.push("  - " + n));
  }
  return lines.join("\n") + "\n";
}

module.exports = { createPageBuilder, googleFaces, buildReport };
