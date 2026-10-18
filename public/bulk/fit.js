/* =========================================================================
   bulk/fit.js — sizes every headline and decides what is wrong with a row.

   Fitting lays a banner out off-screen several times per format (autofit.js),
   so fifty rows × six formats is done in small slices between frames rather
   than in one block that would freeze the page.

   The house formats size their headline by rule; ReadPeak and Norsk Tipping
   have no rules, so their headline starts at the single tab's 100 % and only
   steps down until nothing is cut (see store.rule). On those formats the
   rest of the copy is measured too, at the size the headline ended up at:
   the Ingress inside its lines, the call to action on one line, the label
   and the odds line not cut off.

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
      // Noto Serif for the house formats, Arimo for ReadPeak and Norsk
      // Tipping: measured with a fallback font, every width would be wrong.
      fontsReady = Promise.all([
        document.fonts.load('700 30px "Noto Serif"'),
        document.fonts.load('400 30px "Noto Serif"'),
        document.fonts.load('700 30px "Arimo"'),
        document.fonts.load('400 30px "Arimo"'),
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
    // Everything that takes room in the banner, so a long Ingress or label
    // presses on the headline here exactly as it will in the file.
    var data = Object.assign({}, store.bannerData(row), { imageDataUrl: "", placeholderUrl: "" });
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
      if (!spec.autoFit && row.headline) fit[spec.type].copy = inspectCopy(spec.type, data, fit[spec.type].scale);
    });
    row.fit = fit;
    evaluate(row);
  }

  // ---- the copy around the headline (ReadPeak, Norsk Tipping) ---------------
  var sandbox = null;
  function stage() {
    if (sandbox && sandbox.isConnected) return sandbox;
    sandbox = document.createElement("div");
    sandbox.setAttribute("aria-hidden", "true");
    sandbox.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;contain:layout style;";
    document.body.appendChild(sandbox);
    return sandbox;
  }

  /** The tops of the lines a text element's words sit on. */
  function lineTops(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var tops = [];
    Array.prototype.forEach.call(range.getClientRects(), function (r) {
      if (r.width < 0.5) return;
      if (!tops.some(function (t) { return Math.abs(t - r.top) < 2; })) tops.push(r.top);
    });
    return tops;
  }

  /** A word split across two lines (as autofit.js checks the headline). */
  function brokenWord(el) {
    var node = el.firstChild;
    if (!node || node.nodeType !== 3) return "";
    var re = /[^\s\-‐-—\/]+/g;
    var range = document.createRange();
    var m;
    while ((m = re.exec(node.nodeValue))) {
      if (m[0].length < 2) continue;
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      var tops = [];
      Array.prototype.forEach.call(range.getClientRects(), function (r) {
        if (r.width >= 0.5 && !tops.some(function (t) { return Math.abs(t - r.top) < 2; })) tops.push(r.top);
      });
      if (tops.length > 1) return m[0];
    }
    return "";
  }

  /**
   * Lay the banner out at the headline's final size and see what else is
   * cut: an Ingress past its line clamp or with a split word, a call to
   * action that wraps or falls off the card, a label on two lines, an odds
   * line ending in "…". Returns only what went wrong.
   */
  function inspectCopy(type, data, scale) {
    var bn = document.createElement("div");
    stage().appendChild(bn);
    try {
      var scales = {};
      scales[type] = scale;
      window.renderBanner(bn, type, Object.assign({}, data, { headlineScales: scales }));
      var out = {};
      var bottom = bn.getBoundingClientRect().bottom;
      var sub = bn.querySelector(".bn__subtitle");
      if (sub) {
        var lh = parseFloat(getComputedStyle(sub).lineHeight) || 1;
        if (sub.scrollHeight - sub.clientHeight > lh * 0.5) out.subtitleCut = true;
        var word = brokenWord(sub);
        if (word) out.subtitleWord = word;
      }
      var cta = bn.querySelector(".bn__cta");
      if (cta) {
        if (lineTops(cta).length > 1) out.ctaWraps = true;
        if (cta.getBoundingClientRect().bottom > bottom - 1) out.ctaCut = true;
      }
      var brand = bn.querySelector(".bn__brandlabel");
      if (brand && lineTops(brand).length > 1) out.brandWraps = true;
      var vinner = bn.querySelector(".bn__vinner");
      if (vinner && vinner.scrollWidth > vinner.clientWidth + 1) out.vinnerCut = true;
      return out;
    } finally {
      stage().removeChild(bn);
    }
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
    productChecks(row, add);

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
          var withIngress = !spec.autoFit && store.has("subtitle") && row.subtitle && spec.type === "readpeak";
          var text =
            f.reason === "langt-ord"
              ? dims(spec) + ": «" + f.brokenWord + "» er for langt for én linje"
              : f.manual
              ? dims(spec) + ": får ikke plass på " + Math.round(f.scale * 100) + " % – sett størrelsen lavere eller på Auto"
              : dims(spec) + ": overskriften er for lang" + (withIngress ? " sammen med ingressen" : "") +
                " (" + f.chars + " tegn" + (max ? ", maks ca. " + max : "") + ")";
          add("error", text, spec.type);
        } else if (!f.manual && f.scale < f.ruleScale - 1e-6) {
          add("info", dims(spec) + " satt ned til " + Math.round(f.scale * 100) + " % for å få plass", spec.type);
        }
        copyIssues(spec, f.copy, row, add);
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

  /** What the product needs from a row before anything is measured. */
  function productChecks(row, add) {
    var L = window.BULK_PRODUCTS.LIMITS;
    var A2 = A.countChars;
    if (store.has("subtitle") && A2(row.subtitle) > L.subtitle) {
      add("error", "Ingressen er lengre enn " + L.subtitle + " tegn (" + A2(row.subtitle) + ")");
    }
    if (store.has("brandLabel")) {
      var brand = store.brandOf(row);
      if (A2(brand) > L.brandLabel) add("error", "Merkevaren er lengre enn " + L.brandLabel + " tegn");
      else if (!brand && window.BULK_PRODUCTS.get(state.product).brandExpected) {
        add("warn", "Mangler merkevare – fyll den inn i arket eller under «Felles for alle rader»");
      }
    }
    if (store.has("ctaText")) {
      var cta = store.ctaOf(row);
      if (A2(cta) > L.ctaText) add("error", "Knappeteksten er lengre enn " + L.ctaText + " tegn");
      else if (!cta) add("warn", "Ingen knappetekst – banneren får ingen «Les mer»");
    }
    if (store.has("gameType") && row.gameType && !String(row.vinnersjanse || "").trim()) {
      if (!window.BULK_PRODUCTS.matchGame(row.gameType, store.gamePresets())) {
        add("warn", "Ukjent spilltype «" + row.gameType + "» – bruker standardspillet");
      }
    }
    if (store.has("vinnersjanse") && A2(store.vinnerOf(row)) > L.vinnersjanse) {
      add("error", "Vinnersjansen er lengre enn " + L.vinnersjanse + " tegn");
    }
  }

  /** What inspectCopy found, in words, for one format. */
  function copyIssues(spec, copy, row, add) {
    if (!copy) return;
    var d = dims(spec);
    if (copy.subtitleWord) add("error", d + ": «" + copy.subtitleWord + "» i ingressen er for langt for én linje", spec.type);
    else if (copy.subtitleCut) add("error", d + ": ingressen er for lang (" + A.countChars(row.subtitle) + " tegn)", spec.type);
    if (copy.ctaCut) add("error", d + ": knappeteksten får ikke plass", spec.type);
    else if (copy.ctaWraps) add("error", d + ": knappeteksten går over to linjer – gjør den kortere", spec.type);
    if (copy.brandWraps) add("warn", d + ": merkevaren går over to linjer", spec.type);
    // The standard odds lines are cut on the 320×400 in the single tab too
    // (the strip is 62 % wide there), so this is said, not counted against
    // the row — otherwise every Norsk Tipping row would be «Sjekk».
    if (copy.vinnerCut) add("info", d + ": vinnersjansen vises forkortet («…»)", spec.type);
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
    } else if (what === "rules" || what === "weight" || what === "common") schedule();
    else if (what === "formats" || what === "output") evaluateAll();
  });

  BULK.fit = { schedule: schedule, evaluate: evaluate, evaluateAll: evaluateAll, counts: counts, isBusy: isBusy, loadFonts: loadFonts };
})();
