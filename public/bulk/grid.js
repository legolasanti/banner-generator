/* =========================================================================
   bulk/grid.js — the review screen: a toolbar, then one card per row with
   its headline (editable in place), what is wrong with it, and every chosen
   format side by side at the same scale, so relative sizes read true.

   Fifty rows × six formats is three hundred live banners, so a card only
   draws its banners once it scrolls near the viewport, and a card that is
   off-screen when its row changes is just marked stale and redrawn when it
   comes back.
   ========================================================================= */
(function () {
  "use strict";

  var BULK = (window.BULK = window.BULK || {});
  var store = BULK.store;
  var state = BULK.state;
  var h = window.WPE.util.h;

  var DENSITY = { s: 0.2, m: 0.28, l: 0.4 };
  var LEVEL_LABEL = { ok: "Klar", warn: "Sjekk", error: "Feil", pending: "Venter" };

  var dom = {};
  var cards = {}; // rid → {card, thumbs, headline, ...}
  var observer = null;
  var visible = {};
  var stale = {};

  // ---- toolbar ----------------------------------------------------------
  function seg(items, active, onPick, label) {
    var wrap = h("div.segmented.bk-seg", { role: "group", "aria-label": label });
    items.forEach(function (it) {
      var b = h("button.seg", { type: "button", "data-val": it[0], title: it[2] || null }, it[1]);
      if (String(it[0]) === String(active)) b.classList.add("is-active");
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(wrap.children, function (x) { x.classList.toggle("is-active", x === b); });
        onPick(it[0]);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function buildToolbar() {
    dom.sourceLine = h("div.bk-srcline");
    dom.filters = h("div.bk-filters", { role: "group", "aria-label": "Vis rader" });
    dom.formatChips = h("div.bk-formats", { role: "group", "aria-label": "Formater" });
    store.allSpecs().forEach(function (spec) {
      var input = h("input", { type: "checkbox", checked: state.formats.indexOf(spec.key) !== -1 });
      input.addEventListener("change", function () {
        var on = store.allSpecs()
          .filter(function (s) {
            return s.key === spec.key ? input.checked : state.formats.indexOf(s.key) !== -1;
          })
          .map(function (s) { return s.key; });
        if (!on.length) {
          input.checked = true;
          BULK.source.toast("Minst ett format må være med", "err");
          return;
        }
        state.formats = on;
        store.emit("formats");
      });
      dom.formatChips.appendChild(
        h("label.bk-chip", { title: spec.name }, input, h("span", null, spec.width + "×" + spec.height))
      );
    });

    var smart = h("input", { type: "checkbox", checked: state.smartCrop });
    smart.addEventListener("change", function () {
      state.smartCrop = smart.checked;
      store.emit("crop");
    });

    var rulesBtn = h("button.btn-ghost.btn-sm", { type: "button" }, "Tekststørrelse-regler");
    rulesBtn.addEventListener("click", function () { BULK.rules.open(); });

    dom.toolbar = h(
      "div.bk-toolbar",
      null,
      h("div.bk-toolbar__row", null, dom.sourceLine, h("div.bk-toolbar__spacer"), rulesBtn),
      h(
        "div.bk-toolbar__row.bk-toolbar__row--controls",
        null,
        dom.filters,
        h("span.bk-sep"),
        h("div.bk-ctl", null, h("span.bk-ctl__label", null, "Formater"), dom.formatChips),
        h("span.bk-sep"),
        h(
          "div.bk-ctl",
          null,
          h("span.bk-ctl__label", null, "Skrift"),
          seg([["bold", "Halvfet"], ["regular", "Normal"]], state.weight, function (v) {
            state.weight = v;
            store.emit("weight");
          }, "Skrifttykkelse")
        ),
        h("label.bk-check", { title: "Holder motivet i bildet når det beskjæres. Av = midt i bildet." }, smart, h("span", null, "Smart beskjæring")),
        h("div.bk-toolbar__spacer"),
        h(
          "div.bk-ctl",
          null,
          h("span.bk-ctl__label", null, "Visning"),
          seg([["s", "S"], ["m", "M"], ["l", "L"]], state.density, function (v) {
            state.density = v;
            applyDensity();
          }, "Størrelse på forhåndsvisning")
        )
      )
    );
    return dom.toolbar;
  }

  function renderSourceLine() {
    var src = state.source || {};
    var what =
      src.kind === "google" ? "Google Sheets" : src.kind === "xlsx" || src.kind === "file" ? src.name || "Fil" : src.kind === "demo" ? "Eksempeldata" : src.kind === "paste" ? "Innlimte celler" : src.kind === "url" ? "Lenke" : "Regneark";
    dom.sourceLine.innerHTML = "";
    dom.sourceLine.appendChild(h("span.bk-srcline__what", null, what));
    if (src.sheetName) dom.sourceLine.appendChild(h("span.bk-srcline__muted", null, "· fane «" + src.sheetName + "»"));
    var mapped = state.columns.filter(function (c) { return c.field; }).map(function (c) { return c.header; });
    if (mapped.length) dom.sourceLine.appendChild(h("span.bk-srcline__muted", { title: "Kolonner som brukes" }, "· " + mapped.join(", ")));
    if (src.url) {
      var again = h("button.bk-link", { type: "button" }, "Hent på nytt");
      again.addEventListener("click", function () {
        if (!confirm("Hente arket på nytt? Endringer du har gjort her, erstattes av det som står i arket.")) return;
        BULK.source.reload().catch(function (err) { BULK.source.toast(err.message, "err"); });
      });
      dom.sourceLine.appendChild(again);
    }
    var change = h("button.bk-link", { type: "button" }, "Bytt ark");
    change.addEventListener("click", function () {
      if (!confirm("Lukke dette arket og starte på nytt?")) return;
      store.clear();
    });
    dom.sourceLine.appendChild(change);
  }

  function renderFilters() {
    var c = BULK.fit.counts();
    dom.filters.innerHTML = "";
    [
      ["all", "Alle", c.all],
      ["ok", "Klare", c.ok],
      ["warn", "Sjekk", c.warn],
      ["error", "Feil", c.error],
      ["pending", "Venter", c.pending],
    ].forEach(function (f) {
      if (f[0] !== "all" && !f[2] && state.filter !== f[0]) return;
      var b = h(
        "button.bk-filter.bk-filter--" + f[0],
        { type: "button", "aria-pressed": state.filter === f[0] ? "true" : "false" },
        f[1],
        h("span.bk-filter__n", null, String(f[2] || 0))
      );
      b.addEventListener("click", function () {
        state.filter = f[0];
        renderFilters();
        applyFilter();
      });
      dom.filters.appendChild(b);
    });
  }

  function applyFilter() {
    var any = false;
    state.rows.forEach(function (row) {
      var c = cards[row.rid];
      if (!c) return;
      var show = state.filter === "all" || row.level === state.filter;
      c.card.hidden = !show;
      if (show) any = true;
    });
    dom.empty.hidden = any || !state.rows.length;
  }

  function applyDensity() {
    dom.list.style.setProperty("--bk-scale", DENSITY[state.density] || DENSITY.m);
    Object.keys(cards).forEach(function (rid) { stale[rid] = true; });
    redrawVisible();
  }

  // ---- row cards --------------------------------------------------------
  function buildCard(row) {
    var include = h("input", { type: "checkbox", checked: row.include, title: "Ta med i nedlastingen" });
    include.addEventListener("change", function () {
      store.updateRow(row, { include: include.checked });
    });

    var headline = h("textarea.bk-hl", { rows: 2, maxlength: 200, "aria-label": "Overskrift, rad " + (row.sheetRow || "") });
    headline.value = row.headline;
    var t = null;
    headline.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        store.updateRow(row, { headline: headline.value.replace(/\s+/g, " ").trim() }, { refit: true });
      }, 220);
    });

    var count = h("span.bk-count");
    var file = h("span.bk-file");
    var issues = h("ul.bk-issues");
    var badge = h("span.bk-badge");
    var adjust = h("button.btn-ghost.btn-sm", { type: "button" }, "Juster");
    adjust.addEventListener("click", function () { BULK.editor.open(row.rid); });
    var thumbs = h("div.bk-thumbs");
    var runMark = h("span.bk-runmark", { hidden: true });

    var card = h(
      "article.bk-card",
      { "data-rid": row.rid },
      h(
        "div.bk-card__meta",
        null,
        h(
          "div.bk-card__top",
          null,
          h("label.bk-include", null, include),
          h("span.bk-rownum", { title: "Rad i regnearket" }, row.sheetRow ? "Rad " + row.sheetRow : "—"),
          badge,
          runMark,
          h("span.bk-toolbar__spacer"),
          adjust
        ),
        headline,
        h("div.bk-card__sub", null, count, file),
        issues
      ),
      thumbs
    );
    cards[row.rid] = { card: card, include: include, headline: headline, count: count, file: file, issues: issues, badge: badge, thumbs: thumbs, runMark: runMark, built: false };
    if (observer) observer.observe(card);
    return card;
  }

  function updateMeta(row) {
    var c = cards[row.rid];
    if (!c) return;
    c.card.classList.toggle("is-excluded", !row.include);
    c.card.dataset.level = row.level;
    c.include.checked = row.include;
    if (document.activeElement !== c.headline && c.headline.value !== row.headline) c.headline.value = row.headline;
    var n = window.BannerAutofit.countChars(row.headline);
    c.count.textContent = n + " tegn";
    c.file.textContent = (row.filename ? row.filename : "filnavn fra overskrift") + (row.weight ? " · " + (row.weight === "regular" ? "Normal" : "Halvfet") : "");
    c.badge.className = "bk-badge bk-badge--" + row.level;
    c.badge.textContent = LEVEL_LABEL[row.level] || "";
    c.issues.innerHTML = "";
    row.issues
      .filter(function (i) { return i.level !== "pending"; })
      .forEach(function (i) {
        c.issues.appendChild(h("li.bk-issue.bk-issue--" + i.level, null, i.text));
      });
    var run = row.run;
    c.runMark.hidden = !run;
    if (run) {
      c.runMark.className = "bk-runmark bk-runmark--" + run.status;
      c.runMark.textContent =
        run.status === "done" ? "✓ laget" : run.status === "running" ? "lages …" : run.status === "error" ? "✕ " + (run.error || "feilet") : run.status === "waiting" ? "i kø" : "";
      c.runMark.title = run.error || "";
    }
  }

  /** Draw (or redraw) the banner thumbnails of one card. */
  function drawThumbs(row) {
    var c = cards[row.rid];
    if (!c) return;
    stale[row.rid] = false;
    c.thumbs.innerHTML = "";
    var data = store.bannerData(row);
    var img = row.image || {};
    store.specs().forEach(function (spec) {
      var f = row.fit[spec.type];
      var scale = store.scaleOf(row, spec.type);
      var bad = f && !f.fits;
      var pill = h(
        "span.bk-pill" + (bad ? ".is-bad" : "") + (row.manual[spec.type] != null ? ".is-manual" : ""),
        { title: row.manual[spec.type] != null ? "Satt for hånd" : "Valgt automatisk" },
        bad ? "! " : "",
        Math.round(scale * 100) + " %"
      );
      var bn = h("div.bn");
      var stage = h(
        "button.bk-thumb" + (bad ? ".is-bad" : ""),
        {
          type: "button",
          title: spec.name + " " + spec.width + "×" + spec.height + " – klikk for å justere",
        },
        h("span.bk-thumb__frame", null, h("span.bk-thumb__scaler", null, bn)),
        h("span.bk-thumb__label", null, spec.width + "×" + spec.height, pill)
      );
      // Custom properties need setProperty; Object.assign(style) ignores them.
      stage.style.setProperty("--w", spec.width);
      stage.style.setProperty("--h", spec.height);
      stage.addEventListener("click", function () { BULK.editor.open(row.rid, spec.type); });
      window.renderBanner(bn, spec.type, data);
      if (img.status === "waiting" || img.status === "loading") stage.classList.add("is-loading");
      if (img.status === "error" || img.status === "missing") stage.classList.add("is-noimage");
      // A preview that has gone from the server (old session) says so.
      var photo = bn.querySelector(".bn__img");
      if (photo) {
        photo.addEventListener("error", function () {
          if (row.image && row.image.status === "ok") {
            store.updateRow(row, { image: { status: "error", error: "Bildet er ikke lenger på serveren – hent det på nytt" } });
          }
        });
      }
      c.thumbs.appendChild(stage);
    });
    c.built = true;
  }

  function redrawVisible() {
    Object.keys(visible).forEach(function (rid) {
      if (!visible[rid] || !stale[rid]) return;
      var row = store.findRow(rid);
      if (row) drawThumbs(row);
    });
  }

  function refreshRow(row) {
    updateMeta(row);
    stale[row.rid] = true;
    if (visible[row.rid]) drawThumbs(row);
  }

  function rebuild() {
    dom.list.innerHTML = "";
    cards = {};
    visible = {};
    stale = {};
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          var rid = e.target.dataset.rid;
          visible[rid] = e.isIntersecting;
          if (e.isIntersecting && (stale[rid] || !cards[rid].built)) {
            var row = store.findRow(rid);
            if (row) drawThumbs(row);
          }
        });
      },
      { root: dom.scroll, rootMargin: "700px 0px" }
    );
    state.rows.forEach(function (row) {
      stale[row.rid] = true;
      dom.list.appendChild(buildCard(row));
      updateMeta(row);
    });
    renderSourceLine();
    renderWarnings();
    renderFilters();
    applyFilter();
    applyDensity();
  }

  function renderWarnings() {
    dom.warnings.innerHTML = "";
    var list = state.warnings || [];
    dom.warnings.hidden = !list.length;
    list.forEach(function (w) { dom.warnings.appendChild(h("li", null, w)); });
  }

  // Filters/counts are cheap but run on every fit; batch them per frame.
  var countsQueued = false;
  function refreshCountsSoon() {
    if (countsQueued) return;
    countsQueued = true;
    requestAnimationFrame(function () {
      countsQueued = false;
      renderFilters();
      if (state.filter !== "all") applyFilter();
      if (BULK.run) BULK.run.refresh();
    });
  }

  function build(host) {
    dom.scroll = host;
    dom.warnings = h("ul.bk-warnings", { hidden: true });
    dom.list = h("div.bk-list");
    dom.empty = h("p.bk-empty", { hidden: true }, "Ingen rader i dette utvalget.");
    host.appendChild(buildToolbar());
    host.appendChild(dom.warnings);
    host.appendChild(dom.list);
    host.appendChild(dom.empty);
  }

  store.on(function (what, payload) {
    if (!dom.list) return;
    if (what === "fit") {
      refreshRow(payload);
      refreshCountsSoon();
    } else if (what === "row") {
      refreshRow(payload.row);
      refreshCountsSoon();
    } else if (what === "evaluated" || what === "formats" || what === "crop" || what === "run-rows") {
      state.rows.forEach(refreshRow);
      refreshCountsSoon();
    }
  });

  BULK.grid = { build: build, rebuild: rebuild, refreshRow: refreshRow };
})();
