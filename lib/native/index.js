"use strict";

/* =========================================================================
 * native/index.js — wires Native Premium into the Express app.
 *
 * server.js calls createNative(...) once and native.register(app) before its
 * catch-all route. Everything Native Premium stores lives under data/native/
 * (projects, settings, brand kits, library) and uploads/native/ (images,
 * videos, fonts), both git-ignored.
 * ========================================================================= */

const path = require("path");
const express = require("express");

const { createProjectStore } = require("./projects");
const { createAssetStore, NAME_RE } = require("./assets");
const { createBrandKits, createLibrary } = require("./collections");
const { createSettingsStore } = require("./settings");
const { createPageBuilder } = require("./pages");
const { registerNativeRoutes } = require("./routes");
const { registerPublicRoutes } = require("./public-routes");
const { registerSourceRoutes } = require("./sources/routes");
const { registerAiRoutes } = require("./ai/routes");
const { createFontSource } = require("../google-fonts");

function createNative(opts) {
  const dataDir = opts.dataDir;
  const assetDir = path.join(opts.uploadsDir, "native");
  const projects = createProjectStore({ dataDir });
  const assets = createAssetStore({ dir: assetDir, getSharp: opts.getSharp });
  const brandKits = createBrandKits(dataDir);
  const library = createLibrary(dataDir);
  const settings = createSettingsStore(dataDir);
  const fontSource = createFontSource({ cacheDir: opts.fontCacheDir });
  const pages = createPageBuilder({ assets, fontSource });

  function register(app) {
    // Projects can hold many sections; review comments are tiny.
    app.use("/api/native", express.json({ limit: "12mb" }));
    app.use("/api/review", express.json({ limit: "64kb" }));

    // Content-addressed files: names never change, so cache them forever.
    app.use(
      "/np-assets",
      (req, res, next) => {
        const name = req.path.replace(/^\//, "");
        if (!NAME_RE.test(name)) return res.status(404).end();
        next();
      },
      express.static(assetDir, {
        index: false,
        dotfiles: "deny",
        immutable: true,
        maxAge: "365d",
        fallthrough: false,
        setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
      })
    );

    const deps = { projects, assets, brandKits, library, settings, pages, safeFetch: opts.safeFetch, dataDir };
    const { readPublished } = registerNativeRoutes(app, deps);
    registerSourceRoutes(app, deps);
    registerAiRoutes(app, deps);
    registerPublicRoutes(app, Object.assign({}, deps, { readPublished }));
  }

  return { register, projects, assets, settings, pages };
}

module.exports = { createNative };
