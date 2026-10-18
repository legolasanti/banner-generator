/* =========================================================================
   bulk/fit.js — sizes every headline and decides what is wrong with a row.

   Fitting lays a banner out off-screen several times per format (autofit.js),
   so fifty rows × six formats is done in small slices between frames rather
   than in one block that would freeze the page.

   Each row then gets a list of issues, worst first:
     error  — would produce a broken or wrong banner; the row is not generated
     warn   — will be generated, but worth a look (a small photo)
     info   — what the tool did on its own (a size stepped down to fit)
   ========================================================================= */
(function () {
  "use strict";

  var BULK = (window.BULK = window.BULK || {});
  var A = window.BannerAutofit;
  var store = BULK.store;
  var state = BULK.state;

  var queue = [];
  var queued = {};
  var running = false;
  var fontsReady = null;
  var SLICE_MS = 12;

  function loadFonts() {
    if (!fontsReady) {
      fontsReady = Promise.all([
        document.fonts.load('700 30px "Noto Serif"'),
        document.fonts.load('400 30px "Noto Serif"'),
      ]).catch(function () {});
    }
    return fontsReady;
  }

  /** Queue rows for (re)fitting. Without arguments: every row. */
  function schedule(rows) {
    (rows || state.rows).forEach(function (row) {
      if (queued[row.rid]) return;
      queued[row.rid] = true;
      queue.push(row);
    });
    if (!running) {
      running = true;
      loadFonts().then(pump);
    }
  }

  function pump() {
    var start = performance.now();
    while (queue.length && performance.now() - start < SLICE_MS) {
      var row = queue.shift();
      delete queued[row.rid];
      if (state.rows.indexOf(row) === -1) continue; // removed meanwhile
      fitRow(row);
      store.emit("fit", row);
    }
    if (queue.length) setTimeout(pump, 0);
    else {
      running = false;
      store.emit("fit-done");
    }
  }

  function fitRow(row) {
    var data = { product: BULK.PRODUCT, headline: row.headline, houseWeight: store.weightOf(row) };
    var fit = {};
    store.allSpecs().forEach(function (spec) {
      var manual = row.manual[spec.type];
      if (manual != null) {
        // A size set by hand is kept as is — but still checked, so a manual
        // 130 % that clips the third line is flagged rather than shipped.
        var exact = { min: manual, max: manual, tiers: [[100000, manual]] };
        var r = A.fit(spec.type, data, exact);
        r.manual = true;
        r.ruleScale = A.ruleScale(store.rule(spec), r.chars);
        fit[spec.type] = r;
      } else {
        fit[spec.type] = A.fit(spec.type, data, store.rule(spec));
      }
    });
    row.fit = fit;
    evaluate(row);
  }

  function dims(spec) {
    return spec.width + "×" + spec.height;
  }

  /** Rebuild row.issues and row.level from the current state. */
  function evaluate(row) {
    var issues = [];
    var specs = store.specs();
    var add = function (level, text, type) {
      issues.push({ level: level, text: text, type: type || null });
    };

    if (!row.headline) add("error", "Mangler overskrift");

    var img = row.image || {};
    if (img.status === "missing") add("error", "Mangler bildelenke");
    else if (img.status === "error") add("error", img.error || "Bildet kunne ikke hentes");
    else if (img.status === "waiting" || img.status === "loading") add("pending", "Henter bilde …");

    if (row.headline) {
      specs.forEach(function (spec) {
        var f = row.fit[spec.type];
        if (!f) return;
        if (!f.fits) {
          var max = spec.autoFit && spec.autoFit.maxChars;
          var text =
            f.reason === "langt-ord"
              ? dims(spec) + ": «" + f.brokenWord + "» er for langt for én linje"
              : f.manual
              ? dims(spec) + ": får ikke plass på " + Math.round(f.scale * 100) + " % – sett størrelsen lavere eller på Auto"
              : dims(spec) + ": for lang (" + f.chars + " tegn" + (max ? ", maks ca. " + max : "") + ")";
          add("error", text, spec.type);
        } else if (!f.manual && f.scale < f.ruleScale - 1e-6) {
          add("info", dims(spec) + " satt ned til " + Math.round(f.scale * 100) + " % for å få plass", spec.type);
        }
      });
    }

    // A photo smaller than the frame it fills will look soft. Measured against
    // the frame at the chosen resolution and zoom.
    if (img.status === "ok" && img.width && img.height) {
      var res = state.output.type === "html" ? 1 : state.output.resolution;
      var zoom = 1 + (row.zoom || 0) / 100;
      var soft = specs.filter(function (spec) {
        var need = Math.max((spec.media.width * res * zoom) / img.width, (spec.media.height * res * zoom) / img.height);
        return need > 1.15;
      });
      if (soft.length) {
        add("warn", "Bildet er lite (" + img.width + "×" + img.height + ") og kan bli uskarpt i " + soft.map(dims).join(", "));
      }
    }

    if (state.output.type === "html") {
      var url = row.clickUrl || state.output.clickUrl;
      if (!url) add("error", "HTML5 trenger en klikk-lenke (i arket eller som standard nederst)");
      else if (!/^https?:\/\/\S+$/i.test(url)) add("error", "Klikk-lenken er ikke en gyldig https://-adresse");
    }

    var order = { error: 0, pending: 1, warn: 2, info: 3 };
    issues.sort(function (a, b) {
      return order[a.level] - order[b.level];
    });
    row.issues = issues;
    row.level = issues.length ? issues[0].level : "ok";
    if (row.level === "info") row.level = "ok";
  }

  /** Re-evaluate without refitting (output settings changed). */
  function evaluateAll() {
    state.rows.forEach(evaluate);
    store.emit("evaluated");
  }

  function counts() {
    var c = { all: 0, ok: 0, warn: 0, error: 0, pending: 0, included: 0, ready: 0 };
    state.rows.forEach(function (row) {
      c.all++;
      c[row.level === "ok" ? "ok" : row.level] = (c[row.level === "ok" ? "ok" : row.level] || 0) + 1;
      if (row.include) c.included++;
      if (row.include && (row.level === "ok" || row.level === "warn")) c.ready++;
    });
    return c;
  }

  function isBusy() {
    return running;
  }

  // Refit what changed.
  store.on(function (what, payload) {
    if (what === "rows") schedule();
    else if (what === "list") schedule(payload.added);
    else if (what === "row" && payload.refit) schedule([payload.row]);
    else if (what === "row") {
      evaluate(payload.row);
    } else if (what === "rules" || what === "weight") schedule();
    else if (what === "formats" || what === "output") evaluateAll();
  });

  BULK.fit = { schedule: schedule, evaluate: evaluate, evaluateAll: evaluateAll, counts: counts, isBusy: isBusy, loadFonts: loadFonts };
})();
