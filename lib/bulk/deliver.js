"use strict";

/* =========================================================================
 * deliver.js — streams a finished bulk run as one ZIP.
 *
 * Three folder layouts, because the person downloading decides how the files
 * are going to be uploaded:
 *
 *   format  (default) one folder per size — "320x400/", "980x500/" … — which is
 *           how ad servers and CMS bulk uploads are usually done
 *   banner  one folder per banner, holding all its sizes
 *   flat    everything in the root
 *
 * Every ZIP also carries rapport.csv: one line per file with the headline,
 * the text size that was used and the file size, so the run can be checked
 * without opening three hundred images. Semicolon-separated with a BOM, so
 * Norwegian Excel opens it straight into columns.
 * ========================================================================= */

const path = require("path");
const fsp = require("fs/promises");
const archiver = require("archiver");

const { loadRows } = require("./history");

const LAYOUTS = ["format", "banner", "flat"];
const PRODUCT_TITLES = { houseads: "Houseads", readpeak: "ReadPeak", norsktipping: "Norsk Tipping" };

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

/** "house-320x400" → "320x400" — the folder name a person recognises. */
function sizeFolder(label) {
  return String(label).replace(/^house-/, "");
}

function csvCell(value) {
  let s = String(value == null ? "" : value);
  // Headlines and names come from someone's sheet; a cell starting with = + -
  // or @ would run as a formula when the report is opened in Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * A size below the one planned in the page: the renderer re-measured the
 * headline and had to step it down. Said in the report, so nobody wonders
 * why one banner's text is smaller than its neighbour's.
 */
function plannedNote(r) {
  if (!r.planned || !r.scale || r.scale >= r.planned - 1e-6) return "";
  return "Tekst satt ned fra " + Math.round(r.planned * 100) + " % ved generering";
}

function reportCsv(entry, labelByKey, isHtml) {
  // ReadPeak and Norsk Tipping banners carry an Ingress too; Houseads do not,
  // and their report keeps the columns it always had.
  const withIngress = entry.product === "readpeak" || entry.product === "norsktipping";
  const head = ["Rad i arket", "Filnavn", "Overskrift"].concat(withIngress ? ["Ingress"] : []);
  const lines = [head.concat(["Format", "Tekststørrelse", "Fil", "KB", "Merknad"])];
  for (const row of entry.rows || []) {
    for (const r of row.report || []) {
      const file = isHtml ? r.htmlFile || r.file : r.file;
      const bytes = isHtml ? r.htmlBytes || r.bytes : r.bytes;
      const notes = [(isHtml ? r.htmlNote : r.note) || "", plannedNote(r)].filter(Boolean);
      lines.push([
        row.sheetRow || "",
        row.fileBase,
        row.headline,
      ].concat(withIngress ? [row.subtitle || ""] : [], [
        sizeFolder(labelByKey[r.key] || r.label),
        r.scale ? Math.round(r.scale * 100) + " %" : "",
        file,
        bytes ? Math.round(bytes / 1024) : "",
        notes.join(" · "),
      ]));
    }
  }
  return "﻿" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

function readMe(entry, isHtml, layout) {
  const where = {
    format: "Én mappe per størrelse (f.eks. 320x400/).",
    banner: "Én mappe per banner, med alle størrelsene inni.",
    flat: "Alle filene ligger direkte i ZIP-en.",
  }[layout];
  const html = isHtml
    ? "\nHver .zip er én ferdig HTML5-annonse for Campaign Manager 360 – last dem opp\n" +
      "som de er, uten å pakke dem ut. Reservebildene (backup images) ligger i\n" +
      "mappen «reservebilder» ved siden av.\n"
    : "";
  const title = (PRODUCT_TITLES[entry.product] || "Houseads") + " – bulk";
  return (
    title + "\n" +
    "=".repeat(title.length) + "\n\n" +
    entry.count + " bannere i " + (entry.formats || []).length + " størrelser.\n" +
    where + "\n" + html +
    "\nrapport.csv viser overskrift, tekststørrelse og filstørrelse for hver fil.\n"
  );
}

/**
 * @param {import("http").ServerResponse} res
 * @param {Object} entry   the history entry (kind "bulk")
 * @param {string} historyDir
 * @param {{layout?:string, type?:string}} query
 * @param {Object} formats public/assets/formats.js
 */
async function sendZip(res, storedEntry, historyDir, query, formats) {
  const folderAbs = path.join(historyDir, storedEntry.id);
  if (!(await exists(folderAbs))) return res.status(404).json({ error: "Filene finnes ikke lenger" });
  const entry = { ...storedEntry, rows: await loadRows(storedEntry, historyDir) };

  const isHtml = query.type === "html";
  if (isHtml && entry.outputType !== "html") {
    return res.status(404).json({ error: "Denne kjøringen ble laget som bilder, ikke HTML5" });
  }
  const layout = LAYOUTS.includes(query.layout) ? query.layout : "format";
  const labelByKey = {};
  for (const spec of formats.getProduct(entry.product).specs) labelByKey[spec.key] = spec.label;

  const name = (entry.fileBase || entry.filename || "bulk") + (isHtml ? "-html5" : "") + ".zip";
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("warning", (e) => console.warn("[archiver:bulk] " + e.message));
  archive.on("error", (e) => {
    console.error("[archiver:bulk] " + e.message);
    if (!res.headersSent) res.status(500).json({ error: "Kunne ikke lage ZIP" });
    else res.destroy();
  });
  archive.pipe(res);

  const folderFor = (row, key) => {
    if (layout === "format") return sizeFolder(labelByKey[key] || key) + "/";
    if (layout === "banner") return row.fileBase + "/";
    return "";
  };

  for (const row of entry.rows || []) {
    for (const key of entry.formats || Object.keys(row.files || {})) {
      const dir = folderFor(row, key);
      const image = row.files && row.files[key];
      if (isHtml) {
        const rel = row.htmlFiles && row.htmlFiles[key];
        if (rel && (await exists(path.join(folderAbs, rel)))) {
          archive.file(path.join(folderAbs, rel), { name: dir + path.basename(rel), store: true });
        }
        if (image && (await exists(path.join(folderAbs, image)))) {
          archive.file(path.join(folderAbs, image), { name: dir + "reservebilder/" + image, store: true });
        }
      } else if (image && (await exists(path.join(folderAbs, image)))) {
        archive.file(path.join(folderAbs, image), { name: dir + image, store: true });
      }
    }
  }
  archive.append(Buffer.from(reportCsv(entry, labelByKey, isHtml), "utf8"), { name: "rapport.csv" });
  archive.append(Buffer.from(readMe(entry, isHtml, layout), "utf8"), { name: "LES-MEG.txt" });
  await archive.finalize();
}

/** One banner of a run (all its sizes), e.g. from the row's download button. */
async function sendRow(res, entry, historyDir, index, query) {
  const row = (await loadRows(entry, historyDir)).find((r) => r.index === index);
  if (!row) return res.status(404).json({ error: "Fant ikke banneren" });
  const folderAbs = path.join(historyDir, entry.id);
  const isHtml = query.type === "html";
  const files = Object.values((isHtml ? row.htmlFiles : row.files) || {});
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${row.fileBase}${isHtml ? "-html5" : ""}.zip"`);
  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("error", () => (res.headersSent ? res.destroy() : res.status(500).end()));
  archive.pipe(res);
  for (const rel of files) {
    const abs = path.join(folderAbs, rel);
    if (await exists(abs)) archive.file(abs, { name: path.basename(rel), store: true });
  }
  await archive.finalize();
}

module.exports = { sendZip, sendRow, reportCsv, sizeFolder, LAYOUTS };
