"use strict";

/* =========================================================================
 * sheet.js — turning a spreadsheet into banner rows.
 *
 * Three ways in, one table out:
 *   • a Google Sheets link   → fetched as CSV by the server (see links.js)
 *   • an uploaded file       → CSV / TSV / TXT, or XLSX (read by xlsx.js)
 *   • cells pasted from Sheets/Excel → tab-separated text
 *
 * The table is then read by HEADER, not by position: the columns can come in
 * any order, carry Norwegian, English or Turkish names, and the sheet may have
 * a title row or two above the headers. Without a recognisable header row at
 * all (someone pasted just the cells), the columns are guessed from their
 * content — the one full of http links is the image, the longest text is the
 * headline — and the guess is reported so it can be checked.
 * ========================================================================= */

const MAX_ROWS = 300;
const HEADER_SCAN_ROWS = 10;

/**
 * Column aliases, compared after folding case, accents and punctuation (see
 * fold()). Order matters only for readability; every alias is unique.
 */
const FIELDS = {
  headline: ["overskrift", "tittel", "headline", "heading", "title", "baslik", "tekst", "text", "annonsetekst"],
  image: [
    "bildelenke", "bilde", "bildeurl", "bildelink", "bildeadresse", "foto", "fotolenke",
    "image", "imageurl", "imagelink", "img", "photo", "picture",
    "resim", "resimlinki", "resimurl", "gorsel", "gorsellinki",
  ],
  filename: ["filnavn", "fil", "navn", "filename", "file", "name", "dosyaadi", "dosya", "ad"],
  clickUrl: [
    "klikklenke", "klikkurl", "landingsside", "landingpage", "clickurl", "clicktag", "klikk",
    "destinationurl", "hedefurl", "tiklamalinki",
  ],
  weight: ["skrift", "skrifttykkelse", "vekt", "weight", "fontweight", "font", "kalinlik"],
  focus: ["fokus", "bildeposisjon", "posisjon", "focus", "position", "crop", "odak", "konum"],
  zoom: ["zoom", "forstorrelse", "yakinlastirma"],
};

/** Lowercase, strip accents (æøå too), drop everything but letters/digits. */
function fold(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const ALIAS_TO_FIELD = (() => {
  const map = new Map();
  for (const [field, aliases] of Object.entries(FIELDS)) {
    for (const alias of aliases) map.set(alias, field);
  }
  return map;
})();

/** Which field a header cell names, or null. "Overskrift (maks 60)" still counts. */
function fieldForHeader(header) {
  const folded = fold(header);
  if (!folded) return null;
  if (ALIAS_TO_FIELD.has(folded)) return ALIAS_TO_FIELD.get(folded);
  // A header with a note after it — "Overskrift (maks 60 tegn)", "Bilde-URL
  // fra Drive" — starts with the alias. Longest alias first, so "bildelenke"
  // wins over "bilde".
  const aliases = Array.from(ALIAS_TO_FIELD.keys()).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    if (alias.length >= 4 && folded.startsWith(alias)) return ALIAS_TO_FIELD.get(alias);
  }
  return null;
}

// --------------------------------------------------------------------------
// Delimited text
// --------------------------------------------------------------------------
/**
 * The delimiter of a CSV/TSV text: whichever of tab, semicolon and comma
 * splits the first lines most consistently. Norwegian Excel writes ";" CSVs,
 * Google writes ",", and pasted cells arrive tab-separated.
 */
function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let best = ",";
  let bestScore = -1;
  for (const d of ["\t", ";", ","]) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const nonZero = counts.filter((c) => c > 0);
    if (!nonZero.length) continue;
    // Consistent and frequent: lines that agree with the most common count.
    const mode = mostCommon(nonZero);
    const score = counts.filter((c) => c === mode).length * 10 + mode;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function countOutsideQuotes(line, d) {
  let n = 0;
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === d && !quoted) n++;
  }
  return n;
}

function mostCommon(arr) {
  const counts = new Map();
  let best = arr[0];
  for (const v of arr) {
    counts.set(v, (counts.get(v) || 0) + 1);
    if (counts.get(v) > counts.get(best)) best = v;
  }
  return best;
}

/**
 * RFC 4180 parse: quoted fields, doubled quotes, line breaks inside quotes,
 * CRLF or LF, a UTF-8 BOM. Returns rows of plain strings.
 */
function parseDelimited(text, delimiter) {
  const src = String(text || "").replace(/^﻿/, "");
  const d = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// --------------------------------------------------------------------------
// Table → rows
// --------------------------------------------------------------------------
/** A cell is either a string or {v, href} (XLSX hyperlinks / IMAGE()). */
function cellText(cell) {
  if (cell == null) return "";
  if (typeof cell === "object") return String(cell.v == null ? "" : cell.v);
  return String(cell);
}
function cellHref(cell) {
  return cell && typeof cell === "object" && cell.href ? String(cell.href) : "";
}

function isUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value || "").trim());
}

function isEmptyRow(row) {
  return !row || row.every((c) => !cellText(c).trim() && !cellHref(c));
}

/** The first row (within the first few) that names a headline or image column. */
function findHeaderRow(table) {
  const limit = Math.min(table.length, HEADER_SCAN_ROWS);
  for (let r = 0; r < limit; r++) {
    const fields = (table[r] || []).map((c) => fieldForHeader(cellText(c)));
    if (fields.includes("headline") || fields.includes("image")) return r;
  }
  return -1;
}

/**
 * No header row: guess from content. The column whose cells are mostly links
 * is the image; of the rest, the one with the longest average text is the
 * headline. Returns null when nothing usable stands out.
 */
function guessColumns(table) {
  const width = table.reduce((w, r) => Math.max(w, r.length), 0);
  const stats = [];
  for (let c = 0; c < width; c++) {
    const values = table.map((r) => cellText(r[c]).trim()).filter(Boolean);
    const links = table.filter((r) => isUrl(cellText(r[c])) || isUrl(cellHref(r[c]))).length;
    const avg = values.length ? values.reduce((s, v) => s + v.length, 0) / values.length : 0;
    stats.push({ c, filled: values.length, links, avg });
  }
  const imageCol = stats
    .filter((s) => s.links > 0 && s.links >= s.filled * 0.6)
    .sort((a, b) => b.links - a.links)[0];
  const textCol = stats
    .filter((s) => s !== imageCol && s.filled > 0 && s.links < s.filled * 0.5)
    .sort((a, b) => b.avg - a.avg)[0];
  if (!imageCol && !textCol) return null;
  const map = {};
  if (textCol) map.headline = textCol.c;
  if (imageCol) map.image = imageCol.c;
  return map;
}

/**
 * Read a raw table (array of rows of cells) into banner rows.
 *
 * @param {Array<Array<string|{v:string,href?:string}>>} table
 * @returns {{
 *   columns: Array<{index:number, header:string, field:string|null}>,
 *   headerRow: number,      // 0-based, -1 when the columns were guessed
 *   guessed: boolean,
 *   rows: Array<Object>,
 *   warnings: string[],
 *   truncated: boolean
 * }}
 */
function readTable(table) {
  const warnings = [];
  const clean = (table || []).map((r) => (Array.isArray(r) ? r : []));
  const headerRow = findHeaderRow(clean);
  let map = {};
  let columns = [];
  let guessed = false;

  if (headerRow >= 0) {
    const header = clean[headerRow];
    header.forEach((cell, index) => {
      const field = fieldForHeader(cellText(cell));
      columns.push({ index, header: cellText(cell).trim(), field: field && !(field in map) ? field : null });
      if (field && !(field in map)) map[field] = index;
      else if (field) warnings.push("Kolonnen «" + cellText(cell).trim() + "» finnes to ganger – bare den første brukes.");
    });
  } else {
    const g = guessColumns(clean);
    if (!g) {
      return { columns: [], headerRow: -1, guessed: false, rows: [], warnings: ["Fant ingen kolonne for overskrift eller bildelenke."], truncated: false };
    }
    map = g;
    guessed = true;
    const width = clean.reduce((w, r) => Math.max(w, r.length), 0);
    for (let index = 0; index < width; index++) {
      const field = Object.keys(map).find((k) => map[k] === index) || null;
      columns.push({ index, header: "Kolonne " + columnLetter(index), field });
    }
    warnings.push(
      "Fant ingen overskriftsrad, så kolonnene er gjettet ut fra innholdet. " +
        "Legg gjerne til en første rad med «Overskrift» og «Bildelenke»."
    );
  }

  if (!("headline" in map)) warnings.push("Fant ingen kolonne for overskrift (f.eks. «Overskrift»).");
  if (!("image" in map)) warnings.push("Fant ingen kolonne for bildelenke (f.eks. «Bildelenke»).");

  const body = clean.slice(headerRow + 1);
  const rows = [];
  let truncated = false;
  body.forEach((raw, i) => {
    if (isEmptyRow(raw)) return;
    if (rows.length >= MAX_ROWS) {
      truncated = true;
      return;
    }
    const get = (field) => (field in map ? raw[map[field]] : undefined);
    const imageCell = get("image");
    const imageText = cellText(imageCell).trim();
    // A cell that shows a word but links somewhere (Ctrl+K in Sheets, or an
    // =IMAGE()/=HYPERLINK() formula in an XLSX) carries its URL as href.
    const imageUrl = isUrl(imageText) ? imageText : cellHref(imageCell) || imageText;
    rows.push({
      // Spreadsheet row number as the user sees it (1-based, header counted).
      sheetRow: headerRow + 2 + i,
      headline: cellText(get("headline")).replace(/\s+/g, " ").trim(),
      imageUrl,
      filename: cellText(get("filename")).trim(),
      clickUrl: (() => {
        const c = get("clickUrl");
        const t = cellText(c).trim();
        return isUrl(t) ? t : cellHref(c) || t;
      })(),
      weight: parseWeight(cellText(get("weight"))),
      focus: parseFocus(cellText(get("focus"))),
      zoom: parseZoom(cellText(get("zoom"))),
    });
  });
  if (truncated) warnings.push("Arket har flere enn " + MAX_ROWS + " rader – bare de " + MAX_ROWS + " første er tatt med.");
  if (!rows.length && headerRow >= 0) warnings.push("Arket har overskrifter, men ingen rader under dem.");

  return { columns, headerRow, guessed, rows, warnings, truncated };
}

function columnLetter(index) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "Halvfet" / "Normal" (and English/Turkish) → "bold" | "regular" | "". */
function parseWeight(value) {
  const f = fold(value);
  if (!f) return "";
  if (/^(normal|regular|vanlig|tynn|light|ince|400)$/.test(f)) return "regular";
  if (/^(halvfet|fet|bold|semibold|kalin|tykk|700)$/.test(f)) return "bold";
  return "";
}

/**
 * Where to hold the crop: words ("topp", "bunn venstre", "senter") or two
 * numbers in percent ("50/20", "30, 70", "x30 y70"). "" means automatic.
 *
 * @returns {{x:number,y:number}|null}
 */
function parseFocus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  const nums = raw.match(/-?\d+(?:[.,]\d+)?/g);
  if (nums && nums.length >= 2) {
    const x = clampPct(Number(nums[0].replace(",", ".")));
    const y = clampPct(Number(nums[1].replace(",", ".")));
    return { x, y };
  }
  // Whole words, split on anything that is not a letter — \b does not work
  // next to æ/ø/å or ğ/ü, so "øverst" would never match as a regex word.
  const words = new Set(raw.split(/[^a-zæøåçğıöşü]+/).filter(Boolean));
  const has = (list) => list.some((w) => words.has(w));
  let x = 50;
  let y = 50;
  if (has(["topp", "top", "opp", "øverst", "overst", "ust", "üst"])) y = 0;
  if (has(["bunn", "bottom", "nede", "nederst", "alt"])) y = 100;
  if (has(["venstre", "left", "sol"])) x = 0;
  if (has(["høyre", "hoyre", "right", "sağ", "sag"])) x = 100;
  if (x === 50 && y === 50 && !has(["senter", "sentrum", "midt", "midten", "center", "centre", "orta"])) return null;
  return { x, y };
}

function clampPct(n) {
  return isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50;
}

/** "15", "15 %", "0,15" → 0–30 (the zoom slider's range). "" → null. */
function parseZoom(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let n = Number(raw.replace("%", "").replace(",", ".").trim());
  if (!isFinite(n)) return null;
  if (n > 0 && n < 1) n *= 100; // 0,15 → 15 %
  return Math.max(0, Math.min(30, Math.round(n)));
}

module.exports = {
  MAX_ROWS,
  FIELDS,
  fold,
  fieldForHeader,
  detectDelimiter,
  parseDelimited,
  readTable,
  parseWeight,
  parseFocus,
  parseZoom,
  isUrl,
  columnLetter,
};
