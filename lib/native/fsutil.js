"use strict";

/* =========================================================================
 * fsutil.js — the few file helpers Native Premium's flat-file storage needs:
 * JSON read with a default, atomic JSON write (temp file + rename, so a crash
 * mid-write never leaves half a project), and per-key locks that serialise
 * read-modify-write cycles on the same file.
 * ========================================================================= */

const fsp = require("fs/promises");
const path = require("path");

class NotFoundError extends Error {
  constructor(message) {
    super(message || "Fant ikke");
    this.safe = true;
    this.status = 404;
  }
}

class UserError extends Error {
  constructor(message, status) {
    super(message);
    this.safe = true;
    this.status = status || 400;
  }
}

async function readJson(file, dflt) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return dflt;
    if (err instanceof SyntaxError) {
      console.error("[native] ødelagt JSON i " + file + ": " + err.message);
      return dflt;
    }
    throw err;
  }
}

async function writeJsonAtomic(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + "." + process.pid + "." + Date.now() + "." + Math.random().toString(36).slice(2, 8) + ".tmp";
  await fsp.writeFile(tmp, JSON.stringify(data, null, 1), "utf8");
  try {
    await fsp.rename(tmp, file);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/** Run `task` after every earlier task for the same key has settled. */
function createLocks() {
  const chains = new Map();
  return function withLock(key, task) {
    const prev = chains.get(key) || Promise.resolve();
    const run = prev.then(task, task);
    const tail = run.then(
      () => {},
      () => {}
    );
    chains.set(key, tail);
    tail.then(() => {
      if (chains.get(key) === tail) chains.delete(key);
    });
    return run;
  };
}

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

module.exports = { readJson, writeJsonAtomic, createLocks, exists, NotFoundError, UserError };
