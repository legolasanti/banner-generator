"use strict";

/* =========================================================================
 * collections.js — brand kits and the section library.
 *
 * Both are small lists shared by the whole team, each one JSON file:
 *   data/native/brandkits.json   one entry per advertiser (Ford, Jula …):
 *                                logo, colours, fonts, button style
 *   data/native/library.json     saved sections and whole page templates
 *
 * A brand kit or library entry carries the metadata of the assets it uses,
 * so applying it to a project brings the images and fonts along.
 * ========================================================================= */

const path = require("path");

const Doc = require("../../public/native/doc.js");
const S = require("../../public/native/schema.js");
const { readJson, writeJsonAtomic, createLocks, NotFoundError, UserError } = require("./fsutil");

const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
const MAX_ITEMS = 500;

function pickAssets(raw, ids) {
  const out = {};
  const src = raw && typeof raw === "object" ? raw : {};
  ids.forEach((id) => {
    if (Doc.isAssetId(id) && src[id]) out[id] = Doc.normalizeAsset(id, src[id]);
  });
  return out;
}

function normalizeBrandKit(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  // Normalise through a throwaway project so the theme rules are identical.
  const assetIds = Object.keys(src.assets || {}).filter(Doc.isAssetId).slice(0, 40);
  const assets = pickAssets(src.assets, assetIds);
  const probe = Doc.normalizeProject({ theme: src.theme, advertiser: src.advertiser, assets });
  return {
    id: typeof src.id === "string" && ID_RE.test(src.id) ? src.id : Doc.newId("bk"),
    name: Doc.cleanText(src.name, 80, false).trim() || probe.advertiser.name || "Uten navn",
    advertiser: probe.advertiser,
    theme: probe.theme,
    assets: probe.assets,
    notes: Doc.cleanText(src.notes, 2000, true),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeLibraryItem(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const assets = pickAssets(src.assets, Object.keys(src.assets || {}).slice(0, 200));
  const probe = Doc.normalizeProject({ assets, pages: [{ sections: Array.isArray(src.sections) ? src.sections.slice(0, 40) : [] }] });
  const sections = probe.pages[0].sections;
  if (!sections.length) throw new UserError("Malen har ingen seksjoner");
  const used = {};
  sections.forEach((s) => {
    Doc.usedAssets({ pages: [{ sections: [s] }], assets: probe.assets, theme: {}, advertiser: {}, meta: {} }).forEach((id) => {
      if (probe.assets[id]) used[id] = probe.assets[id];
    });
  });
  return {
    id: typeof src.id === "string" && ID_RE.test(src.id) ? src.id : Doc.newId("lib"),
    name: Doc.cleanText(src.name, 80, false).trim() || S.BLOCKS[sections[0].type].label,
    category: Doc.cleanText(src.category, 40, false).trim() || "Egne",
    kind: src.kind === "page" ? "page" : "section",
    description: Doc.cleanText(src.description, 300, false),
    sections,
    assets: used,
    by: Doc.cleanText(src.by, 80, false),
    createdAt: typeof src.createdAt === "string" ? src.createdAt : new Date().toISOString(),
  };
}

function createCollection(file, normalize, label) {
  const withLock = createLocks();

  async function all() {
    const data = await readJson(file, []);
    return Array.isArray(data) ? data : [];
  }

  async function findById(id) {
    const item = (await all()).find((x) => x.id === id);
    if (!item) throw new NotFoundError("Fant ikke " + label);
    return item;
  }

  async function upsert(raw, extra) {
    return withLock("all", async () => {
      const list = await all();
      const item = normalize(Object.assign({}, raw, extra || {}));
      const idx = list.findIndex((x) => x.id === item.id);
      if (idx === -1 && list.length >= MAX_ITEMS) throw new UserError("Listen er full");
      const next = idx === -1 ? [item].concat(list) : list.map((x, i) => (i === idx ? item : x));
      await writeJsonAtomic(file, next);
      return item;
    });
  }

  async function remove(id) {
    return withLock("all", async () => {
      const list = await all();
      if (!list.some((x) => x.id === id)) throw new NotFoundError("Fant ikke " + label);
      await writeJsonAtomic(file, list.filter((x) => x.id !== id));
    });
  }

  return { findAll: all, findById, upsert, remove };
}

function createBrandKits(dataDir) {
  return createCollection(path.join(dataDir, "brandkits.json"), normalizeBrandKit, "merkevaren");
}

function createLibrary(dataDir) {
  return createCollection(path.join(dataDir, "library.json"), normalizeLibraryItem, "malen");
}

module.exports = { createBrandKits, createLibrary, normalizeBrandKit, normalizeLibraryItem };
