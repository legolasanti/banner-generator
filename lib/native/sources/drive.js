"use strict";

/* =========================================================================
 * sources/drive.js — list and fetch the photos and videos in a Google Drive
 * folder shared as "Alle med lenken".
 *
 * Two ways to list a folder:
 *   1. With GOOGLE_API_KEY set: the Drive API (exact types, sizes, pixel
 *      dimensions, paging).
 *   2. Without: the folder's public "embedded view" page, which Google serves
 *      to anyone for a link-shared folder. Names and ids only; the type is
 *      read from the file name.
 * Files are downloaded from drive.usercontent.google.com (no virus-scan
 * interstitial for link-shared files with confirm=t).
 *
 * Everything goes through lib/safe-fetch.js like every other outbound fetch.
 * ========================================================================= */

const fsp = require("fs/promises");

const Doc = require("../../../public/native/doc.js");

const ID_RE = /^[\w-]{10,100}$/;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;
const HEIC_EXT = /\.(heic|heif)$/i;

/** Folder id from any Drive folder link, or null. */
function folderIdFromUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    return null;
  }
  if (url.hostname !== "drive.google.com") return null;
  const m = /\/folders\/([\w-]{10,})/.exec(url.pathname);
  const id = m ? m[1] : url.pathname === "/open" ? url.searchParams.get("id") : null;
  return id && ID_RE.test(id) ? id : null;
}

/** Single file id from a Drive file link, or null. */
function fileIdFromUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    return null;
  }
  if (url.hostname !== "drive.google.com" && url.hostname !== "docs.google.com") return null;
  const m = /\/file\/d\/([\w-]{10,})/.exec(url.pathname);
  const id = m ? m[1] : /^\/(open|uc)$/.test(url.pathname) ? url.searchParams.get("id") : null;
  return id && ID_RE.test(id) ? id : null;
}

function kindOf(name, mime, href) {
  if (mime === "application/vnd.google-apps.folder" || /\/folders\//.test(href || "")) return "folder";
  if (mime === "application/vnd.google-apps.document" || /docs\.google\.com\/document\//.test(href || "")) return "gdoc";
  if (/^image\//.test(mime || "") || IMAGE_EXT.test(name)) return HEIC_EXT.test(name) || /heic|heif/.test(mime || "") ? "heic" : "image";
  if (HEIC_EXT.test(name)) return "heic";
  if (/^video\//.test(mime || "") || VIDEO_EXT.test(name)) return "video";
  if (/\.docx$/i.test(name) || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  return "other";
}

/** Parse the embedded folder view HTML into entries. Pure, so it is tested. */
function parseEmbeddedFolder(html) {
  const out = [];
  const re = /<div class="flip-entry"[^>]*id="entry-([\w-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(String(html || ""))) && out.length < 500) {
    const id = m[1];
    if (!ID_RE.test(id)) continue;
    const href = Doc.decodeEntities(m[2]);
    const name = Doc.decodeEntities(m[3].replace(/<[^>]+>/g, "")).trim().slice(0, 200);
    out.push({ id, name, kind: kindOf(name, "", href), href });
  }
  return out;
}

function createDrive(deps) {
  const { safeFetch } = deps;
  const apiKey = () => process.env.GOOGLE_API_KEY || "";
  const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };

  async function listViaApi(folderId) {
    const files = [];
    let pageToken = "";
    for (let page = 0; page < 5; page++) {
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("q", "'" + folderId + "' in parents and trashed = false");
      url.searchParams.set("fields", "nextPageToken, files(id,name,mimeType,size,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis))");
      url.searchParams.set("pageSize", "200");
      url.searchParams.set("supportsAllDrives", "true");
      url.searchParams.set("includeItemsFromAllDrives", "true");
      url.searchParams.set("key", apiKey());
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const got = await safeFetch.fetchImage(url.href, { maxBytes: 4 * 1024 * 1024, timeoutMs: 20000, headers: UA });
      const data = JSON.parse(got.buffer.toString("utf8"));
      (data.files || []).forEach((f) => {
        const meta = f.imageMediaMetadata || f.videoMediaMetadata || {};
        files.push({
          id: f.id,
          name: f.name,
          kind: kindOf(f.name, f.mimeType, ""),
          size: Number(f.size) || 0,
          w: meta.width || 0,
          h: meta.height || 0,
          duration: meta.durationMillis ? meta.durationMillis / 1000 : 0,
        });
      });
      pageToken = data.nextPageToken || "";
      if (!pageToken) break;
    }
    return files;
  }

  async function listViaEmbed(folderId) {
    const got = await safeFetch.fetchImage("https://drive.google.com/embeddedfolderview?id=" + encodeURIComponent(folderId), {
      maxBytes: 8 * 1024 * 1024,
      timeoutMs: 20000,
      headers: UA,
    });
    if (/accounts\.google\.com/.test(got.finalUrl)) throw notShared();
    return parseEmbeddedFolder(got.buffer.toString("utf8"));
  }

  function notShared() {
    return Object.assign(new Error("Mappen er ikke delt. Velg Del → «Alle med lenken» (Leser) i Google Drive, og prøv igjen."), { safe: true });
  }

  /** Every entry of a folder: images, videos, docs, sub-folders. */
  async function list(url) {
    const folderId = folderIdFromUrl(url);
    if (!folderId) throw Object.assign(new Error("Lim inn en lenke til en Google Drive-mappe"), { safe: true });
    let files;
    try {
      files = apiKey() ? await listViaApi(folderId) : await listViaEmbed(folderId);
    } catch (err) {
      if (err && err.safe && /HTTP 40[134]/.test(err.message)) throw notShared();
      throw err;
    }
    return {
      folderId,
      files: files.map((f) => Object.assign({}, f, { thumb: "https://drive.google.com/thumbnail?id=" + f.id + "&sz=w400" })),
      via: apiKey() ? "api" : "embed",
    };
  }

  function downloadUrl(fileId) {
    if (!ID_RE.test(String(fileId))) throw Object.assign(new Error("Ugyldig fil-ID"), { safe: true });
    return apiKey()
      ? "https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media&supportsAllDrives=true&key=" + encodeURIComponent(apiKey())
      : "https://drive.usercontent.google.com/download?id=" + fileId + "&export=download&confirm=t";
  }

  function downloadError(err) {
    if (err && err.safe && /HTTP 40[134]/.test(err.message)) return notShared();
    if (err && err.safe) return Object.assign(new Error(err.message.replace(/bildet/gi, "filen")), { safe: true });
    return err;
  }

  /** Download one file by id into memory (photos). */
  async function download(fileId, maxBytes) {
    const url = downloadUrl(fileId);
    let got;
    try {
      got = await safeFetch.fetchImage(url, { maxBytes, timeoutMs: 120000, headers: UA });
    } catch (err) {
      throw downloadError(err);
    }
    if (/text\/html/i.test(got.contentType)) throw notShared();
    return got.buffer;
  }

  /**
   * Download one file by id straight to `file` (videos: up to several hundred
   * MB, never held in memory). The timeout is for a stalled transfer; a big
   * file that keeps arriving may take as long as it needs.
   */
  async function downloadToFile(fileId, maxBytes, file) {
    const url = downloadUrl(fileId);
    let got;
    try {
      got = await safeFetch.fetchToFile(url, { file, maxBytes, timeoutMs: 120000, headers: UA });
    } catch (err) {
      throw downloadError(err);
    }
    if (/text\/html/i.test(got.contentType)) {
      await fsp.rm(file, { force: true }).catch(() => {});
      throw notShared();
    }
    return got;
  }

  return { list, download, downloadToFile };
}

module.exports = { createDrive, folderIdFromUrl, fileIdFromUrl, parseEmbeddedFolder, kindOf };
