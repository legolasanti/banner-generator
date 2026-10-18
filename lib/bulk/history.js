"use strict";

/* =========================================================================
 * history.js — a bulk run's place in Historikk.
 *
 * A run's entry in history.json is a SUMMARY (name, counts, formats, the
 * thumbnail). The per-banner details — files, sizes used, the report — can be
 * a few hundred rows and live next to the files, in history/<id>/rows.json:
 * /api/history is loaded every time the Historikk tab opens, and inlining
 * three hundred rows per run there made it megabytes.
 *
 * The entry is written as soon as the first banner of a run is finished and
 * kept up to date after every row, so a server restart in the middle of a run
 * leaves a usable (partial) download rather than an orphaned folder. At
 * startup, tidy() marks such runs as stopped, moves the rows of entries
 * written by older versions out of history.json, and removes folders nothing
 * refers to any more.
 * ========================================================================= */

const path = require("path");
const fsp = require("fs/promises");

const ROWS_FILE = "rows.json";
const PRODUCT_LABELS = { readpeak: "ReadPeak", norsktipping: "Norsk Tipping" };
// A folder younger than this may belong to a run (or a single export) that
// is being written right now, possibly by another process on the same
// folder, so it is never swept.
const ORPHAN_MIN_AGE_MS = 3600 * 1000;
// Every history id starts with a millisecond timestamp (see server.js and
// jobs.js); anything else in the folder is not ours to delete.
const HISTORY_ID_RE = /^\d{13}-[a-z0-9-]+$/;

async function writeJsonAtomic(target, data) {
  const tmp = target + "." + process.pid + "." + Date.now() + ".tmp";
  await fsp.writeFile(tmp, JSON.stringify(data), "utf8");
  try {
    await fsp.rename(tmp, target);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/** Save a run's per-banner rows next to its files. */
function writeRows(historyDir, id, rows) {
  return writeJsonAtomic(path.join(historyDir, id, ROWS_FILE), rows);
}

/** A run's rows: inline (entries from older versions) or from rows.json. */
async function loadRows(entry, historyDir) {
  if (Array.isArray(entry.rows)) return entry.rows;
  try {
    const rows = JSON.parse(await fsp.readFile(path.join(historyDir, entry.id, ROWS_FILE), "utf8"));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** What /api/history sends for an entry: bulk entries without their rows. */
function summarize(entry) {
  if (!entry || entry.kind !== "bulk" || !("rows" in entry)) return entry;
  const { rows, ...rest } = entry;
  return rest;
}

/**
 * The line Historikk shows under a run's name. Houseads, the original Bulk
 * product, goes unnamed; the others say which product the run made.
 */
function headlineFor(count, formatCount, stage, product) {
  const label = product && product !== "houseads" ? PRODUCT_LABELS[product] || "" : "";
  const base =
    (label ? label + " · " : "") + count + (count === 1 ? " banner" : " bannere") + " · " + formatCount + " formater";
  if (stage === "running") return base + " · lages …";
  if (stage === "interrupted") return base + " · stoppet underveis";
  return base;
}

/**
 * Runs whose entry still says "being made" when the server starts were cut
 * off by a restart. Returns a new array (and whether anything changed).
 */
function recoverInterrupted(history) {
  let changed = false;
  const out = history.map((e) => {
    if (!e || e.kind !== "bulk" || !e.partial) return e;
    changed = true;
    const { partial, ...rest } = e;
    return {
      ...rest,
      interrupted: true,
      headline: headlineFor(e.count || 0, (e.formats || []).length, "interrupted", e.product),
    };
  });
  return { history: out, changed };
}

/** Move inline rows (older versions) into rows.json. Returns a new array. */
async function migrateInlineRows(history, historyDir) {
  let changed = false;
  const out = [];
  for (const e of history) {
    if (!e || e.kind !== "bulk" || !Array.isArray(e.rows)) {
      out.push(e);
      continue;
    }
    try {
      await writeRows(historyDir, e.id, e.rows);
      out.push(summarize(e));
      changed = true;
    } catch {
      out.push(e); // folder gone or unwritable: leave the entry as it was
    }
  }
  return { history: out, changed };
}

/**
 * Remove history folders that no entry refers to and that have not been
 * touched for an hour — what a crash between "files written" and "entry
 * saved" leaves behind.
 *
 * @returns {Promise<string[]>} the folder names removed
 */
async function sweepOrphans(historyDir, history, now) {
  const known = new Set(history.map((e) => e && e.id));
  const cutoff = (now || Date.now()) - ORPHAN_MIN_AGE_MS;
  const removed = [];
  const names = await fsp.readdir(historyDir).catch(() => []);
  for (const name of names) {
    if (known.has(name) || !HISTORY_ID_RE.test(name)) continue;
    const abs = path.join(historyDir, name);
    const stat = await fsp.stat(abs).catch(() => null);
    if (!stat || !stat.isDirectory() || stat.mtimeMs > cutoff) continue;
    await fsp.rm(abs, { recursive: true, force: true }).catch(() => {});
    removed.push(name);
  }
  return removed;
}

/**
 * The startup pass over history (see the top of this file).
 *
 * @param {Object} deps
 * @param {string} deps.historyDir
 * @param {Function} deps.withLock      server.js withHistoryLock
 * @param {Function} deps.loadHistory
 * @param {Function} deps.writeHistory
 */
function tidy(deps) {
  return deps.withLock(async () => {
    const loaded = await deps.loadHistory();
    const migrated = await migrateInlineRows(loaded, deps.historyDir);
    const recovered = recoverInterrupted(migrated.history);
    if (migrated.changed || recovered.changed) await deps.writeHistory(recovered.history);
    const removed = await sweepOrphans(deps.historyDir, recovered.history);
    if (removed.length) console.log("[bulk] removed " + removed.length + " history folder(s) without an entry");
    return { removed, recovered: recovered.changed };
  });
}

module.exports = {
  ROWS_FILE,
  ORPHAN_MIN_AGE_MS,
  writeRows,
  loadRows,
  summarize,
  headlineFor,
  recoverInterrupted,
  migrateInlineRows,
  sweepOrphans,
  tidy,
};
