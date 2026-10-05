"use strict";

/* =========================================================================
 * wallpaper/deliver.js — writing a finished Wallpaper export to history and
 * streaming it to the browser.
 *
 * History layout (history/<id>/):
 *   <name>-bakgrunn-1920x850.jpg        image per artboard (always; they are
 *   <name>-toppbanner-1000x300.jpg      also the CM360 backup images)
 *   html/<name>-bakgrunn-1920x850.zip   HTML5 creative per artboard (HTML5 runs)
 *   project.json                        the design, so it can be reopened
 * ========================================================================= */

const fsp = require("fs/promises");
const path = require("path");
const archiver = require("archiver");

const Spec = require("../../public/wallpaper/spec.js");

function kb(bytes) {
  return Math.round(bytes / 1024) + " KB";
}

function readMe(ctx) {
  const lines = [
    "WALLPAPER — " + ctx.name,
    "=".repeat(Math.min(60, 12 + ctx.name.length)),
    "",
    "En wallpaper består av to filer som leveres sammen:",
    "",
  ];
  ctx.rows.forEach((row) => {
    lines.push("  • " + row.file + "   (" + row.width + "×" + row.height + ", " + kb(row.bytes) + ")");
  });
  lines.push(
    "",
    "PLASSERING",
    "----------",
    "  Bakgrunn 1920×850 ligger bak hele siden, sentrert. Toppbanneret 1000×300",
    "  ligger øverst i innholdskolonnen (1000 px) midt på siden.",
    "  Sikker sone for bakgrunnen er 1280×700 midt på — det er det som alltid vises.",
    ""
  );
  if (ctx.clickUrl) lines.push("KLIKK-LENKE", "-----------", "  " + ctx.clickUrl, "");
  if (ctx.trackerUrl) lines.push("VISNINGSTELLER", "--------------", "  " + ctx.trackerUrl, "");
  if (ctx.html) {
    lines.push(
      "HTML5",
      "-----",
      "  Hver ZIP er én ferdig HTML5-kreativ (index.html i roten, clickTag satt).",
      "  IKKE pakk ut ZIP-filene — last dem opp som de er. Reservebildene ligger i",
      "  mappen «reservebilder» og lastes opp for seg.",
      "  Tekst er ekte tekst med innebygde skrifter, så den er skarp på alle skjermer.",
      ""
    );
  }
  lines.push("Generert av Banner Generator – Wallpaper.");
  return lines.join("\n") + "\n";
}

/**
 * Persist an export and return the history entry for it.
 * @returns {Promise<Object>} entry
 */
async function saveToHistory(p) {
  const { historyDir, id, fileBase, filename, now, result, html5 } = p;
  const folderAbs = path.join(historyDir, id);
  await fsp.mkdir(folderAbs, { recursive: true });
  const files = {};
  const htmlFiles = {};
  const report = [];
  for (const item of result.items) {
    const name = fileBase + "-" + item.spec.label + "." + item.image.ext;
    await fsp.writeFile(path.join(folderAbs, name), item.image.buffer);
    files[item.key] = name;
    const row = {
      key: item.key,
      label: item.spec.label,
      file: name,
      width: Math.round(item.spec.width * result.opts.scale),
      height: Math.round(item.spec.height * result.opts.scale),
      bytes: item.image.bytes,
      limitBytes: result.opts.limits[item.key] > 0 ? result.opts.limits[item.key] * 1024 : 0,
      note: item.image.note,
    };
    if (item.html) {
      await fsp.mkdir(path.join(folderAbs, "html"), { recursive: true });
      const zipName = html5.creativeZipName(fileBase, item.spec.label);
      await fsp.writeFile(path.join(folderAbs, "html", zipName), item.html.zip);
      htmlFiles[item.key] = "html/" + zipName;
      row.htmlFile = zipName;
      row.htmlBytes = item.html.bytes;
      row.htmlNote = item.html.note;
    }
    report.push(row);
  }
  await fsp.writeFile(path.join(folderAbs, "project.json"), JSON.stringify(result.doc), "utf8");
  const firstKey = result.items[0].key;
  return {
    id,
    kind: "wallpaper",
    product: "wallpaper",
    filename,
    fileBase,
    timestamp: now.toISOString(),
    headline: result.doc.name,
    outputType: result.opts.outputType,
    clickUrl: result.opts.clickUrl,
    trackerUrl: result.opts.trackerUrl,
    folderPath: "history/" + id + "/",
    thumbnailPath: "history/" + id + "/" + files[firstKey],
    files,
    htmlFiles: result.opts.outputType === "html" ? htmlFiles : null,
    project: "project.json",
    report,
  };
}

async function exists(p) {
  return fsp
    .access(p)
    .then(() => true)
    .catch(() => false);
}

/**
 * Stream a wallpaper entry. One file goes out as itself; several go out as a
 * ZIP with a read-me. `type=html` streams the HTML5 creatives (plus backup
 * images), otherwise the images.
 */
async function sendDownload(res, entry, historyDir, type) {
  const folderAbs = path.join(historyDir, entry.id);
  const wantHtml = type === "html";
  const map = wantHtml ? entry.htmlFiles || {} : entry.files || {};
  const keys = Spec.ORDER.filter((k) => map[k]);
  const present = [];
  for (const key of keys) {
    if (await exists(path.join(folderAbs, map[key]))) present.push(key);
  }
  if (!present.length) {
    return res.status(404).json({ error: wantHtml ? "Denne oppføringen har ingen HTML5-pakker" : "Filene finnes ikke lenger" });
  }
  if (present.length === 1) {
    const rel = map[present[0]];
    return res.download(path.join(folderAbs, rel), path.basename(rel));
  }

  const base = entry.fileBase || entry.filename || "wallpaper";
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${base}-wallpaper${wantHtml ? "-html" : ""}.zip"`);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("warning", (e) => console.warn("[archiver:wallpaper] " + e.message));
  archive.on("error", (e) => {
    console.error("[archiver:wallpaper] " + e.message);
    if (!res.headersSent) res.status(500).json({ error: "Kunne ikke lage ZIP" });
    else res.destroy();
  });
  archive.pipe(res);

  const rows = [];
  for (const key of present) {
    const rel = map[key];
    archive.file(path.join(folderAbs, rel), { name: path.basename(rel), store: true });
    const reportRow = (entry.report || []).find((r) => r.key === key) || {};
    const spec = Spec.get(key);
    rows.push({
      file: path.basename(rel),
      width: reportRow.width || spec.width,
      height: reportRow.height || spec.height,
      bytes: (wantHtml ? reportRow.htmlBytes : reportRow.bytes) || 0,
    });
    const backup = entry.files && entry.files[key];
    if (wantHtml && backup && (await exists(path.join(folderAbs, backup)))) {
      archive.file(path.join(folderAbs, backup), { name: "reservebilder/" + backup, store: true });
    }
  }
  archive.append(
    readMe({
      name: entry.headline || base,
      rows,
      clickUrl: entry.clickUrl,
      trackerUrl: entry.trackerUrl,
      html: wantHtml,
    }),
    { name: "LES-MEG.txt" }
  );
  await archive.finalize();
}

module.exports = { saveToHistory, sendDownload, readMe };
