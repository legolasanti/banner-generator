/* =========================================================================
   bulk/state.js — the Bulk tab's model: the rows read from the sheet, what
   the user changed on each, and the run settings. Every other bulk module
   reads and writes through here and listens for changes.

   A row keeps what came from the sheet and what the user overrode apart
   (row.pos vs row.sheetFocus vs the photo's own focus; row.manual vs the
   auto-fit result), so "back to automatic" is always possible.

   The work survives a reload: rows and settings are kept in localStorage
   (the photos themselves are on the server, referred to by id).
   ========================================================================= */
(function () {
  "use strict";

  var BULK = (window.BULK = window.BULK || {});
  var F = window.BannerFormats;
  var PRODUCT = "houseads";
  var STORE_KEY = "bulk.session.v1";

  var listeners = [];
  var seq = 1;

  var state = {
    // {kind: "google"|"url"|"file"|"xlsx"|"paste"|"demo", url?, name?, sheetName?}
    source: null,
    columns: [],
    warnings: [],
    guessed: false,
    rows: [],
    // Which house formats to preview and produce.
    formats: F.getProduct(PRODUCT).specs.map(function (s) { return s.key; }),
    weight: "bold",
    smartCrop: true,
    density: "m",
    filter: "all",
    // Text-size rule overrides from settings (label → rule).
    rules: {},
    output: { type: "image", format: "png", resolution: 1, layout: "format", name: "", clickUrl: "" },
    job: null, // live job view while a run is going
  };

  function on(fn) {
    listeners.push(fn);
  }
  function emit(what, payload) {
    listeners.forEach(function (fn) {
      try {
        fn(what, payload);
      } catch (err) {
        console.error("[bulk] listener failed on " + what, err);
      }
    });
    if (what !== "job" && what !== "fit" && what !== "run-rows") persistSoon();
  }

  function specs() {
    return F.getProduct(PRODUCT).specs.filter(function (s) {
      return state.formats.indexOf(s.key) !== -1;
    });
  }
  function allSpecs() {
    return F.getProduct(PRODUCT).specs;
  }

  /** A row as read from the sheet (see lib/bulk/sheet.js readTable). */
  function makeRow(src) {
    return {
      rid: "r" + seq++,
      sheetRow: src.sheetRow || null,
      headline: src.headline || "",
      imageUrl: src.imageUrl || "",
      filename: src.filename || "",
      clickUrl: src.clickUrl || "",
      weight: src.weight || "", // "" = the run's default
      sheetFocus: src.focus || null,
      zoom: src.zoom == null ? 0 : src.zoom,
      pos: null, // set by dragging in the editor; wins over everything
      manual: {}, // format type → scale set by hand
      include: true,
      image: { status: src.imageUrl ? "waiting" : "missing" },
      fit: {}, // format type → BannerAutofit.fit() result
      issues: [],
      level: "pending",
      run: null, // status from the last run, if any
    };
  }

  function setRows(srcRows, meta) {
    state.rows = srcRows.map(makeRow);
    state.source = meta.source || null;
    state.columns = meta.columns || [];
    state.warnings = meta.warnings || [];
    state.guessed = !!meta.guessed;
    state.filter = "all";
    emit("rows");
  }

  function clear() {
    state.rows = [];
    state.source = null;
    state.columns = [];
    state.warnings = [];
    state.job = null;
    emit("rows");
  }

  function findRow(rid) {
    for (var i = 0; i < state.rows.length; i++) if (state.rows[i].rid === rid) return state.rows[i];
    return null;
  }

  /** Change a row and tell everyone. `refit` when the text size may change. */
  function updateRow(row, patch, opts) {
    Object.keys(patch).forEach(function (k) {
      row[k] = patch[k];
    });
    emit("row", { row: row, refit: !!(opts && opts.refit) });
  }

  // ---- derived values ----------------------------------------------------
  function weightOf(row) {
    return row.weight || state.weight;
  }

  /** Where the crop is held: dragged > sheet's «Fokus» > the photo's own > centre. */
  function positionOf(row) {
    if (row.pos) return row.pos;
    if (row.sheetFocus) return row.sheetFocus;
    if (state.smartCrop && row.image && row.image.focus) return row.image.focus;
    return { x: 50, y: 50 };
  }

  function scaleOf(row, type) {
    if (row.manual[type] != null) return row.manual[type];
    var f = row.fit[type];
    return f ? f.scale : 1;
  }

  /** Everything renderBanner needs for this row's live preview. */
  function bannerData(row) {
    var pos = positionOf(row);
    var scales = {};
    allSpecs().forEach(function (s) {
      scales[s.type] = scaleOf(row, s.type);
    });
    return {
      product: PRODUCT,
      hideAgeBadge: true,
      imageDataUrl: row.image && row.image.previewUrl ? row.image.previewUrl : "",
      placeholderUrl: "",
      imagePositionX: pos.x,
      imagePositionY: pos.y,
      imageZoom: row.zoom,
      headline: row.headline,
      headlineScales: scales,
      houseWeight: weightOf(row),
      houseLogoUrl: "assets/abc-shopping.png",
      annonseText: (BULK.settings && BULK.settings.staticBadges && BULK.settings.staticBadges.annonseText) || "Annonse",
    };
  }

  function rule(spec) {
    return window.BannerAutofit.cleanRule(F.autoFitRule(spec, state.rules), spec.autoFit);
  }

  // ---- persistence -------------------------------------------------------
  var persistTimer = null;
  function persistSoon() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 400);
  }

  function persist() {
    try {
      if (!state.rows.length) {
        localStorage.removeItem(STORE_KEY);
        return;
      }
      var rows = state.rows.map(function (r) {
        return {
          sheetRow: r.sheetRow, headline: r.headline, imageUrl: r.imageUrl, filename: r.filename,
          clickUrl: r.clickUrl, weight: r.weight, sheetFocus: r.sheetFocus, zoom: r.zoom, pos: r.pos,
          manual: r.manual, include: r.include,
          image: r.image && r.image.status === "ok" ? r.image : null,
        };
      });
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          v: 1,
          savedAt: Date.now(),
          source: state.source, columns: state.columns, warnings: state.warnings, guessed: state.guessed,
          formats: state.formats, weight: state.weight, smartCrop: state.smartCrop, density: state.density,
          output: state.output, rows: rows,
          jobId: state.job && (state.job.status === "running" || state.job.status === "queued") ? state.job.id : null,
        })
      );
    } catch (_) {
      /* storage full or blocked — the session simply is not remembered */
    }
  }

  /** Bring back the last session. Returns the saved job id to resume, if any. */
  function restore() {
    var saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch (_) {
      saved = null;
    }
    if (!saved || saved.v !== 1 || !Array.isArray(saved.rows) || !saved.rows.length) return null;
    state.source = saved.source || null;
    state.columns = saved.columns || [];
    state.warnings = saved.warnings || [];
    state.guessed = !!saved.guessed;
    var known = allSpecs().map(function (s) { return s.key; });
    if (Array.isArray(saved.formats)) {
      var formats = saved.formats.filter(function (k) { return known.indexOf(k) !== -1; });
      if (formats.length) state.formats = formats;
    }
    state.weight = saved.weight === "regular" ? "regular" : "bold";
    state.smartCrop = saved.smartCrop !== false;
    state.density = ["s", "m", "l"].indexOf(saved.density) !== -1 ? saved.density : "m";
    if (saved.output) Object.assign(state.output, saved.output);
    state.rows = saved.rows.map(function (r) {
      var row = makeRow({
        sheetRow: r.sheetRow, headline: r.headline, imageUrl: r.imageUrl, filename: r.filename,
        clickUrl: r.clickUrl, weight: r.weight, focus: r.sheetFocus, zoom: r.zoom,
      });
      row.pos = r.pos || null;
      row.manual = r.manual || {};
      row.include = r.include !== false;
      if (r.image && r.image.id) row.image = r.image;
      return row;
    });
    return { jobId: saved.jobId || null, savedAt: saved.savedAt };
  }

  BULK.PRODUCT = PRODUCT;
  BULK.state = state;
  BULK.store = {
    on: on,
    emit: emit,
    specs: specs,
    allSpecs: allSpecs,
    setRows: setRows,
    clear: clear,
    findRow: findRow,
    updateRow: updateRow,
    weightOf: weightOf,
    positionOf: positionOf,
    scaleOf: scaleOf,
    bannerData: bannerData,
    rule: rule,
    restore: restore,
    persist: persist,
  };
})();
