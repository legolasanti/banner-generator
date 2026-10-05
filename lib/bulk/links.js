"use strict";

/* =========================================================================
 * links.js — the links people actually paste, turned into links that return
 * the file itself.
 *
 * A Google Sheets "share" link opens the editor, a Drive "share" link opens a
 * viewer page, a Dropbox link opens a preview: all three answer with HTML, not
 * with the spreadsheet or the photo. Each has a documented direct form; this
 * rewrites to it. Anything else is passed through untouched.
 * ========================================================================= */

/**
 * The CSV export URL for a Google Sheets link, keeping the tab (gid) the link
 * points at. Null when the link is not a Google Sheet.
 *
 *   …/spreadsheets/d/<id>/edit#gid=123        → …/d/<id>/export?format=csv&gid=123
 *   …/spreadsheets/d/e/<pubId>/pubhtml?gid=1  → …/d/e/<pubId>/pub?output=csv&gid=1
 */
function googleSheetCsvUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    return null;
  }
  if (url.hostname !== "docs.google.com") return null;
  const gid = gidOf(url);

  // Published to the web: /spreadsheets/d/e/<pubId>/pubhtml | /pub
  const pub = /^\/spreadsheets\/d\/e\/([\w-]+)\//.exec(url.pathname);
  if (pub) {
    const out = new URL("https://docs.google.com/spreadsheets/d/e/" + pub[1] + "/pub");
    out.searchParams.set("output", "csv");
    if (gid) {
      out.searchParams.set("gid", gid);
      out.searchParams.set("single", "true");
    }
    return out.href;
  }

  const doc = /^\/spreadsheets(?:\/u\/\d+)?\/d\/([\w-]{20,})/.exec(url.pathname);
  if (!doc) return null;
  const out = new URL("https://docs.google.com/spreadsheets/d/" + doc[1] + "/export");
  out.searchParams.set("format", "csv");
  if (gid) out.searchParams.set("gid", gid);
  return out.href;
}

function gidOf(url) {
  const fromQuery = url.searchParams.get("gid");
  if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;
  const fromHash = /(?:^|[#&])gid=(\d+)/.exec(url.hash || "");
  return fromHash ? fromHash[1] : "";
}

/** True for any docs.google.com spreadsheet link, valid or not. */
function looksLikeGoogleSheet(raw) {
  return /docs\.google\.com\/spreadsheets\//i.test(String(raw || ""));
}

/**
 * An image link rewritten to its direct-download form.
 *
 *   drive.google.com/file/d/<id>/view?usp=sharing → drive.google.com/uc?export=download&id=<id>
 *   drive.google.com/open?id=<id>                 → (same)
 *   www.dropbox.com/…/x.jpg?dl=0                   → …?raw=1
 */
function directImageUrl(raw) {
  const value = String(raw || "").trim();
  let url;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  const host = url.hostname.toLowerCase();

  if (host === "drive.google.com" || host === "docs.google.com") {
    const id =
      (/\/file\/d\/([\w-]{10,})/.exec(url.pathname) || [])[1] ||
      (/^\/(?:open|uc)$/.test(url.pathname) ? url.searchParams.get("id") : null);
    if (id && /^[\w-]{10,}$/.test(id)) {
      return "https://drive.google.com/uc?export=download&id=" + id;
    }
    return value;
  }

  if (host === "www.dropbox.com" || host === "dropbox.com") {
    url.searchParams.delete("dl");
    url.searchParams.set("raw", "1");
    return url.href;
  }

  return value;
}

/** Which service a link belongs to — used to word errors helpfully. */
function serviceOf(raw) {
  const s = String(raw || "").toLowerCase();
  if (/drive\.google\.com|docs\.google\.com\/(?:uc|file)/.test(s)) return "drive";
  if (/docs\.google\.com\/spreadsheets/.test(s)) return "sheets";
  if (/dropbox\.com/.test(s)) return "dropbox";
  return "";
}

module.exports = { googleSheetCsvUrl, looksLikeGoogleSheet, directImageUrl, serviceOf };
