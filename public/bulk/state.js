/* =========================================================================
   bulk/state.js — the Bulk tab's model: the rows read from the sheet, what
   the user changed on each, and the run settings. Every other bulk module
   reads and writes through here and listens for changes.

   A row keeps what came from the sheet and what the user overrode apart
   (row.pos vs row.sheetFocus vs the photo's own focus; row.manual vs the
   auto-fit result), so "back to automatic" is always possible.

   The work survives a reload: rows and settings are kept in localStorage
   (the photos themselves are on the server, referred to by id), and so are
   the row ids, so a run still going — or the last one finished — can be
   matched to its cards after the reload.
   ========================================================================= */
(function () {
  "use strict";

  var BULK = (window.BULK = window.BULK || {});
  var F = window.BannerFormats;
  var NAMES = window.BULK_NAMES;
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
    search: "", // text (or a row number) the list is narrowed to
    sort: "sheet", // "sheet" | "long" | "short" | "status"
    // Text-size rule overrides from settings (label → rule).
    rules: {},
    output: { type: "image", format: "png", resolution: 1, layout: "format", name: "", clickUrl: "" },
    job: null, // the running job, or the last finished one (for its result)
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
    if (what !== "run-rows") basesCache = null;
    if (what !== "job" && what !== "fit" && what !== "run-rows" && what !== "view") persistSoon();
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
  function makeRow(src, rid) {
    return {
      rid: rid || "r" + seq++,
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
      selected: false, // ticked for a bulk action (not saved)
      touched: {}, // fields changed here rather than in the sheet: weight, zoom, filename, clickUrl
      image: { status: src.imageUrl ? "waiting" : "missing" },
      fit: {}, // format type → BannerAutofit.fit() result
      issues: [],
      level: "pending",
      run: null, // status from the last run, if any
    };
  }

  function applySheet(rows, meta) {
    state.rows = rows;
    state.source = meta.source || null;
    state.columns = meta.columns || [];
    state.warnings = meta.warnings || [];
    state.guessed = !!meta.guessed;
  }

  function setRows(srcRows, meta) {
    applySheet(srcRows.map(function (src) { return makeRow(src); }), meta);
    state.filter = "all";
    state.search = "";
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

  /**
   * Change a row and tell everyone. `refit` when the text size may change;
   * `touch` when the user changed it here, so a re-read of the sheet keeps it.
   */
  function updateRow(row, patch, opts) {
    var o = opts || {};
    var touched = Object.assign({}, row.touched);
    Object.keys(patch).forEach(function (k) {
      row[k] = patch[k];
      if (o.touch) touched[k] = true;
    });
    row.touched = touched;
    emit("row", { row: row, refit: !!o.refit });
  }

  // ---- edits typed but not yet applied ---------------------------------------
  // A headline is applied a moment after the last keystroke, so typing does
  // not refit on every letter. Whatever is still waiting is applied before
  // anything that reads the rows — stepping to the next row, closing the
  // editor, starting a run — so the last word typed is never lost or, worse,
  // written into the row that happens to be open by then.
  var pendingEdits = {};
  function deferEdit(key, apply, ms) {
    if (pendingEdits[key]) clearTimeout(pendingEdits[key].timer);
    pendingEdits[key] = {
      apply: apply,
      timer: setTimeout(function () {
        delete pendingEdits[key];
        apply();
      }, ms),
    };
  }
  function flushEdits(prefix) {
    Object.keys(pendingEdits).forEach(function (key) {
      if (prefix && key.indexOf(prefix) !== 0) return;
      var p = pendingEdits[key];
      delete pendingEdits[key];
      clearTimeout(p.timer);
      p.apply();
    });
  }

  // ---- adding and removing rows ----------------------------------------------
  // "list" rather than "rows": the other rows stay as they are, so only the
  // cards involved are built or dropped and only new rows are fitted.
  function removeRows(rows) {
    state.rows = state.rows.filter(function (r) { return rows.indexOf(r) === -1; });
    emit("list", { added: [], removed: rows });
  }

  /** A copy of a row right below it — same photo, same choices. */
  function duplicateRow(row) {
    var copy = makeRow({
      sheetRow: row.sheetRow, headline: row.headline, imageUrl: row.imageUrl, filename: row.filename,
      clickUrl: row.clickUrl, weight: row.weight, focus: row.sheetFocus, zoom: row.zoom,
    });
    copy.pos = row.pos ? Object.assign({}, row.pos) : null;
    copy.manual = Object.assign({}, row.manual);
    copy.include = row.include;
    copy.touched = Object.assign({}, row.touched);
    copy.image = Object.assign({}, row.image);
    var at = state.rows.indexOf(row) + 1;
    state.rows = state.rows.slice(0, at).concat([copy], state.rows.slice(at));
    emit("list", { added: [copy], removed: [] });
    return copy;
  }

  /** An empty row at the end, for a banner the sheet does not have. */
  function addBlankRow() {
    var row = makeRow({});
    state.rows = state.rows.concat([row]);
    emit("list", { added: [row], removed: [] });
    return row;
  }

  /**
   * The sheet read again («Hent på nytt»): its rows replace these, but a row
   * that is still the same row — same row number, same headline — keeps what
   * was done to it here: the focus point, the sizes set by hand, whether it
   * is included, and any field changed here instead of in the sheet.
   */
  function mergeRows(srcRows, meta) {
    var old = {};
    state.rows.forEach(function (r) { old[r.sheetRow + "|" + r.headline] = r; });
    var kept = 0;
    var rows = srcRows.map(function (src) {
      var prev = old[(src.sheetRow || null) + "|" + (src.headline || "")];
      // Same row: same id too, so its card, and a run's marks, carry over.
      var row = makeRow(src, prev ? prev.rid : null);
      if (!prev) return row;
      delete old[prev.sheetRow + "|" + prev.headline]; // a duplicate line matches once
      kept++;
      row.pos = prev.pos;
      row.manual = Object.assign({}, prev.manual);
      row.include = prev.include;
      row.touched = Object.assign({}, prev.touched);
      Object.keys(row.touched).forEach(function (k) { row[k] = prev[k]; });
      if (prev.imageUrl === row.imageUrl && prev.image && prev.image.status === "ok") row.image = prev.image;
      return row;
    });
    applySheet(rows, meta);
    emit("rows", { keepScroll: true });
    return kept;
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

  /** Rows the run will make: ticked, and without errors. */
  function sendable() {
    return state.rows.filter(function (r) {
      return r.include && (r.level === "ok" || r.level === "warn");
    });
  }

  // The name each row's files will get, exactly as the server will choose it
  // (public/bulk/names.js): uniqueness depends on which rows are sent, so it
  // is worked out for all of them at once and kept until something changes.
  var basesCache = null;
  function fileBaseOf(row) {
    if (!basesCache) {
      basesCache = {};
      var send = sendable();
      var bases = NAMES.fileBases(send);
      send.forEach(function (r, i) { basesCache[r.rid] = bases[i]; });
    }
    if (basesCache[row.rid]) return basesCache[row.rid];
    return NAMES.fileBases([row])[0];
  }

  // ---- what the list shows ------------------------------------------------
  var LEVEL_ORDER = { error: 0, warn: 1, pending: 2, ok: 3 };

  /** Whether a row passes the status filter and the search. */
  function inView(row) {
    if (state.filter !== "all" && row.level !== state.filter) return false;
    var q = String(state.search || "").trim().toLowerCase();
    if (!q) return true;
    // A bare number finds that row of the sheet («Gå til rad 12»).
    if (/^\d+$/.test(q) && String(row.sheetRow) === q) return true;
    return (
      String(row.headline).toLowerCase().indexOf(q) !== -1 ||
      String(row.filename).toLowerCase().indexOf(q) !== -1 ||
      fileBaseOf(row).indexOf(q) !== -1
    );
  }

  /** The rows the list shows, in the order it shows them. */
  function viewRows() {
    var rows = state.rows.filter(inView);
    var at = function (r) { return state.rows.indexOf(r); };
    var len = function (r) { return window.BannerAutofit.countChars(r.headline); };
    var by = {
      long: function (a, b) { return len(b) - len(a) || at(a) - at(b); },
      short: function (a, b) { return len(a) - len(b) || at(a) - at(b); },
      status: function (a, b) { return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || at(a) - at(b); },
    }[state.sort];
    return by ? rows.slice().sort(by) : rows;
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
          rid: r.rid, sheetRow: r.sheetRow, headline: r.headline, imageUrl: r.imageUrl, filename: r.filename,
          clickUrl: r.clickUrl, weight: r.weight, sheetFocus: r.sheetFocus, zoom: r.zoom, pos: r.pos,
          manual: r.manual, include: r.include, touched: r.touched,
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
          output: state.output, sort: state.sort, rows: rows,
          job: savedJob(state.job),
        })
      );
    } catch (_) {
      /* storage full or blocked — the session simply is not remembered */
    }
  }

  /**
   * The job as saved: enough to follow a running one again, or to show the
   * result (and the download links) of a finished one after a reload, when
   * the server may have forgotten it.
   */
  function savedJob(job) {
    if (!job || !job.id) return null;
    return {
      id: job.id, status: job.status, total: job.total, done: job.done, failed: job.failed,
      startedAt: job.startedAt, finishedAt: job.finishedAt, entryId: job.entryId, error: job.error,
      formats: job.formats, outputType: job.outputType, rids: job.rids || null,
      rows: (job.rows || []).map(function (r) {
        return { rid: r.rid, status: r.status, error: r.error, code: r.code, notes: r.notes, smaller: r.smaller };
      }),
    };
  }

  /** Bring back the last session. Returns the saved job to resume or show, if any. */
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
    if (["sheet", "long", "short", "status"].indexOf(saved.sort) !== -1) state.sort = saved.sort;
    var seen = {};
    state.rows = saved.rows.map(function (r) {
      // Ids from the saved session are kept (a run going on the server refers
      // to them); new ones continue after the highest.
      var rid = typeof r.rid === "string" && /^r\d+$/.test(r.rid) && !seen[r.rid] ? r.rid : null;
      if (rid) {
        seen[rid] = true;
        seq = Math.max(seq, Number(rid.slice(1)) + 1);
      }
      var row = makeRow({
        sheetRow: r.sheetRow, headline: r.headline, imageUrl: r.imageUrl, filename: r.filename,
        clickUrl: r.clickUrl, weight: r.weight, focus: r.sheetFocus, zoom: r.zoom,
      }, rid);
      row.pos = r.pos || null;
      row.manual = r.manual || {};
      row.include = r.include !== false;
      row.touched = r.touched && typeof r.touched === "object" ? r.touched : {};
      if (r.image && r.image.id) row.image = r.image;
      return row;
    });
    // Sessions saved before the job itself was kept had only its id.
    var job = saved.job && saved.job.id ? saved.job : saved.jobId ? { id: saved.jobId, status: "running" } : null;
    return { job: job, savedAt: saved.savedAt };
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
    deferEdit: deferEdit,
    flushEdits: flushEdits,
    removeRows: removeRows,
    duplicateRow: duplicateRow,
    addBlankRow: addBlankRow,
    mergeRows: mergeRows,
    sendable: sendable,
    fileBaseOf: fileBaseOf,
    inView: inView,
    viewRows: viewRows,
    weightOf: weightOf,
    positionOf: positionOf,
    scaleOf: scaleOf,
    bannerData: bannerData,
    rule: rule,
    restore: restore,
    persist: persist,
  };
})();
