/* =========================================================================
   bulk/grid.js — the review screen: a toolbar, then one card per row with
   its headline (editable in place), what is wrong with it, and every chosen
   format side by side at the same scale, so relative sizes read true.

   Fifty rows × six formats is three hundred live banners, so a card only
   draws its banners once it scrolls near the viewport, and a card that is
   off-screen when its row changes is just marked stale and redrawn when it
   comes back.

   With a few hundred rows the list needs handles: search (headline, filename
   or a row number), sorting, and a selection — the tick at the start of each
   card — that the bar at the top acts on: weight, sizes back to Auto, in or
   out of the download, duplicate, remove.
   ========================================================================= */
(function () {
  "use strict";

  var BULK = (window.BULK = window.BULK || {});
  var store = BULK.store;
  var state = BULK.state;
  var ui = BULK.ui;
  var h = window.WPE.util.h;

  var DENSITY = { s: 0.2, m: 0.28, l: 0.4 };
  var SMALL_FORMAT_BOOST = 1.75;
  var LEVEL_LABEL = { ok: "Klar", warn: "Sjekk", error: "Feil", pending: "Venter" };
  var SORTS = [
    ["sheet", "Rekkefølge i arket"],
    ["status", "Feil først"],
    ["long", "Lengst overskrift først"],
    ["short", "Kortest overskrift først"],
  ];
  var HEADLINE_DEBOUNCE_MS = 220;
  var ANNOUNCE_MS = 700;

  var dom = {};
  var cards = {}; // rid → {card, thumbs, headline, ...}
  var observer = null;
  var visible = {};
  var stale = {};

  // ---- toolbar ----------------------------------------------------------
  function buildToolbar() {
    dom.sourceLine = h("div.bk-srcline");
    dom.filters = h("div.bk-filters", { role: "group", "aria-label": "Vis rader" });
    dom.formatChips = h("div.bk-formats", { role: "group", "aria-label": "Formater" });

    var smart = h("input", { type: "checkbox", checked: state.smartCrop });
    smart.addEventListener("change", function () {
      state.smartCrop = smart.checked;
      store.emit("crop");
    });

    // The rules are the house formats' (the others are measured), and so is
    // the weight choice; both hide for the other products.
    dom.rulesBtn = h("button.btn-ghost.btn-sm", { type: "button" }, "Tekststørrelse-regler");
    dom.rulesBtn.addEventListener("click", function () { BULK.rules.open(); });
    dom.weightCtl = h(
      "div.bk-ctl",
      null,
      h("span.bk-ctl__label", null, "Skrift"),
      ui.seg([["bold", "Halvfet"], ["regular", "Normal"]], state.weight, function (v) {
        state.weight = v;
        store.emit("weight");
      }, "Skrifttykkelse")
    );
    dom.common = h("div.bk-toolbar__row.bk-common", { role: "group", "aria-label": "Felles for alle rader" });

    dom.toolbar = h(
      "div.bk-toolbar",
      null,
      h("div.bk-toolbar__row", null, dom.sourceLine, h("div.bk-toolbar__spacer"), dom.rulesBtn),
      h(
        "div.bk-toolbar__row.bk-toolbar__row--controls",
        null,
        h("div.bk-ctl", null, h("span.bk-ctl__label", null, "Produkt"), BULK.source.productSwitch()),
        h("span.bk-sep"),
        h("div.bk-ctl", null, h("span.bk-ctl__label", null, "Formater"), dom.formatChips),
        h("span.bk-sep"),
        dom.weightCtl,
        h("label.bk-check", { title: "Holder motivet i bildet når det beskjæres. Av = midt i bildet." }, smart, h("span", null, "Smart beskjæring")),
        h("div.bk-toolbar__spacer"),
        h(
          "div.bk-ctl",
          null,
          h("span.bk-ctl__label", null, "Visning"),
          ui.seg([["s", "S"], ["m", "M"], ["l", "L"]], state.density, function (v) {
            state.density = v;
            applyDensity();
          }, "Størrelse på forhåndsvisning")
        )
      ),
      dom.common,
      buildListBar()
    );
    renderProductControls();
    return dom.toolbar;
  }

  /** The format chips, and what shows only for some products. */
  function renderProductControls() {
    dom.formatChips.innerHTML = "";
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
    var house = state.product === "houseads";
    dom.rulesBtn.hidden = !house;
    dom.weightCtl.hidden = !house;
    dom.selWeight.hidden = !house;
    dom.selGame.hidden = !store.has("gameType");
    dom.selGamePick.innerHTML = "";
    store.gamePresets().forEach(function (g) { dom.selGamePick.appendChild(h("option", { value: g.id }, g.label)); });
    renderCommon();
  }

  /**
   * «Felles for alle rader»: what a row gets when its own cell is empty, and
   * the call to action's look — the controls of the single ReadPeak / Norsk
   * Tipping form, set once for the whole sheet.
   */
  function renderCommon() {
    var c = state.common;
    dom.common.innerHTML = "";
    dom.common.hidden = !store.has("brandLabel");
    if (dom.common.hidden) return;
    var changed = function () { store.emit("common"); };
    var later = null;
    var text = function (value, placeholder, label, apply, max) {
      var input = h("input.bk-input.bk-common__in", { type: "text", value: value, placeholder: placeholder, maxlength: max, "aria-label": label });
      input.addEventListener("input", function () {
        apply(input.value);
        clearTimeout(later);
        later = setTimeout(changed, 300);
      });
      return input;
    };
    var L = window.BULK_PRODUCTS.LIMITS;
    var ctl = function (label, control, title) {
      return h("label.bk-ctl", { title: title || null }, h("span.bk-ctl__label", null, label), control);
    };
    dom.common.appendChild(h("span.bk-common__title", null, "Felles for alle rader"));
    dom.common.appendChild(
      ctl("Merkevare", text(c.brandLabel[state.product] || "", state.product === "readpeak" ? "F.eks. INTERFLORA" : "", "Merkevare for rader uten egen", function (v) {
        c.brandLabel[state.product] = v;
      }, L.brandLabel), "Brukes der arket ikke har merkevare")
    );
    if (store.has("ctaText")) {
      dom.common.appendChild(
        ctl("Knappetekst", text(c.ctaText, "Les mer her", "Knappetekst for rader uten egen", function (v) { c.ctaText = v; }, L.ctaText), "Brukes der arket ikke har knappetekst")
      );
    }
    if (store.has("gameType")) {
      var game = h("select.bk-select", { "aria-label": "Spilltype for rader uten egen" });
      store.gamePresets().forEach(function (g) {
        game.appendChild(h("option", { value: g.id, selected: store.defaultGame() === g.id }, g.label));
      });
      game.addEventListener("change", function () {
        c.gameType = game.value;
        changed();
      });
      dom.common.appendChild(ctl("Spilltype", game, "Brukes der arket ikke har spilltype eller vinnersjanse"));
      var grid = h("input", { type: "checkbox", checked: !!c.showVinnerOnNewsgrid });
      grid.addEventListener("change", function () {
        c.showVinnerOnNewsgrid = grid.checked;
        changed();
      });
      dom.common.appendChild(h("label.bk-check", { title: "Bare ved vinnerpott – av som standard, som i Norsk Tipping-fanen" }, grid, h("span", null, "Vinnersjanse på 190×190")));
    }
    dom.common.appendChild(
      ctl("«Les mer»", ui.seg([["text", "Tekst"], ["button", "Knapp"]], c.lesMerStyle, function (v) {
        c.lesMerStyle = v;
        changed();
      }, "Stil på «Les mer»"))
    );
    var color = h("input.bk-color", { type: "color", value: c.accentColor, "aria-label": "Farge på «Les mer»" });
    color.addEventListener("input", function () {
      c.accentColor = color.value;
      clearTimeout(later);
      later = setTimeout(changed, 200);
    });
    dom.common.appendChild(ctl("Farge", color));
  }

  /** Select-all, the status filters, search and sort. */
  function buildListBar() {
    dom.selectAll = h("input", { type: "checkbox", "aria-label": "Velg alle radene som vises" });
    dom.selectAll.addEventListener("change", function () {
      selectWhere(dom.selectAll.checked ? function () { return true; } : null);
    });
    dom.search = h("input.bk-input.bk-search", {
      type: "search",
      placeholder: "Søk i overskrift, filnavn eller radnummer",
      "aria-label": "Søk i radene",
      spellcheck: "false",
    });
    var st = null;
    dom.search.addEventListener("input", function () {
      clearTimeout(st);
      st = setTimeout(function () {
        state.search = dom.search.value;
        applyView(true);
      }, 120);
    });
    dom.search.addEventListener("keydown", function (e) {
      // Enter on a row number (or a single hit) opens that row.
      if (e.key !== "Enter") return;
      e.preventDefault();
      state.search = dom.search.value;
      applyView(true);
      var hits = store.viewRows();
      if (hits.length === 1 || (/^\d+$/.test(dom.search.value.trim()) && hits.length)) BULK.editor.open(hits[0].rid);
    });
    dom.sort = h("select.bk-select", { "aria-label": "Sorter radene" });
    SORTS.forEach(function (s) {
      dom.sort.appendChild(h("option", { value: s[0], selected: state.sort === s[0] }, s[1]));
    });
    dom.sort.addEventListener("change", function () {
      state.sort = dom.sort.value;
      store.emit("view");
      store.persist();
      applyView(true);
    });
    dom.listTools = h("div.bk-listtools");
    // While rows are ticked, the selection bar takes this row's place rather
    // than appearing above it: the list must not jump down under the pointer
    // between ticking one row and the next.
    dom.listRow = h(
      "div.bk-toolbar__row.bk-toolbar__row--list",
      null,
      h("label.bk-include.bk-selectall", { title: "Velg alle radene som vises" }, dom.selectAll),
      buildSelectionBar(),
      dom.filters,
      dom.listTools,
      h("div.bk-toolbar__spacer"),
      dom.search,
      dom.sort
    );
    return dom.listRow;
  }

  /** What can be done to the ticked rows. Shown (in the list row) only while some are ticked. */
  function buildSelectionBar() {
    dom.selCount = h("b.bk-selbar__n");
    var link = function (label, fn, title) {
      var b = h("button.bk-link", { type: "button", title: title || null }, label);
      b.addEventListener("click", fn);
      return b;
    };
    var act = function (label, fn, extra, title) {
      var b = h("button.btn-ghost.btn-sm" + (extra || ""), { type: "button", title: title || null }, label);
      b.addEventListener("click", function () {
        var rows = selectedRows();
        if (rows.length) fn(rows);
      });
      return b;
    };
    var weight = function (label, value, title) {
      return act(label, function (rows) {
        rows.forEach(function (row) { store.updateRow(row, { weight: value }, { refit: true, touch: true }); });
      }, null, title);
    };
    dom.selbar = h(
      "div.bk-selbar",
      { hidden: true, role: "region", "aria-label": "Valgte rader" },
      dom.selCount,
      link("Alle som vises", function () { selectWhere(function () { return true; }); }),
      link("Bare klare", function () { selectWhere(function (r) { return r.level === "ok"; }); }, "Velg radene som er klare"),
      link("Ingen", function () { selectWhere(null); }),
      dom.selWeight = h(
        "span.bk-selbar__group",
        null,
        h("span.bk-sep"),
        h("span.bk-ctl__label", null, "Skrift"),
        weight("Halvfet", "bold"),
        weight("Normal", "regular"),
        weight("Som resten", "", "Følg valget for hele kjøringen")
      ),
      dom.selGame = h(
        "span.bk-selbar__group",
        null,
        h("span.bk-sep"),
        h("span.bk-ctl__label", null, "Spilltype"),
        (dom.selGamePick = h("select.bk-select", { "aria-label": "Spilltype for valgte rader" })),
        act("Sett", function (rows) {
          var preset = store.gamePresets().filter(function (g) { return g.id === dom.selGamePick.value; })[0];
          rows.forEach(function (row) {
            store.updateRow(row, { gameType: preset ? preset.label : "", vinnersjanse: "" }, { refit: true, touch: true });
          });
        }, null, "Gi de valgte radene denne spilltypen (og spillets vinnersjanse)")
      ),
      h("span.bk-sep"),
      act("Tekststørrelse til Auto", function (rows) {
        rows.forEach(function (row) {
          if (Object.keys(row.manual).length) store.updateRow(row, { manual: {} }, { refit: true });
        });
      }),
      act("Ta med", function (rows) { rows.forEach(function (row) { store.updateRow(row, { include: true }); }); }),
      act("Ta ut", function (rows) { rows.forEach(function (row) { store.updateRow(row, { include: false }); }); }),
      act("Dupliser", function (rows) { rows.forEach(function (row) { store.duplicateRow(row); }); }),
      act("Fjern", function (rows) {
        var n = rows.length;
        if (!confirm("Fjerne " + n + (n === 1 ? " rad" : " rader") + " fra listen? Regnearket endres ikke.")) return;
        store.removeRows(rows);
      }, ".is-danger")
    );
    return dom.selbar;
  }

  function selectedRows() {
    return state.rows.filter(function (r) { return r.selected; });
  }

  /** Tick the rows in view that `pick` accepts; untick the rest. No pick = none. */
  function selectWhere(pick) {
    var shown = store.viewRows();
    state.rows.forEach(function (row) {
      row.selected = !!pick && shown.indexOf(row) !== -1 && pick(row);
      var c = cards[row.rid];
      if (c) {
        c.select.checked = row.selected;
        c.card.classList.toggle("is-selected", row.selected);
      }
    });
    renderSelection();
  }

  function renderSelection() {
    var n = selectedRows().length;
    var shown = store.viewRows();
    var shownSelected = shown.filter(function (r) { return r.selected; }).length;
    dom.selbar.hidden = !n;
    dom.listRow.classList.toggle("has-selection", !!n);
    dom.selCount.textContent = n + " valgt";
    dom.selectAll.checked = !!shown.length && shownSelected === shown.length;
    dom.selectAll.indeterminate = shownSelected > 0 && shownSelected < shown.length;
  }

  function renderSourceLine() {
    var src = state.source || {};
    var what =
      src.kind === "google" ? "Google Sheets" : src.kind === "xlsx" || src.kind === "file" ? src.name || "Fil" : src.kind === "demo" ? "Eksempeldata" : src.kind === "paste" ? "Innlimte celler" : src.kind === "url" ? "Lenke" : "Regneark";
    dom.sourceLine.innerHTML = "";
    dom.sourceLine.appendChild(h("span.bk-srcline__what", null, what));
    if (src.sheetName) dom.sourceLine.appendChild(h("span.bk-srcline__muted", null, "· fane «" + src.sheetName + "»"));
    // Only the columns this product reads: an Ingress column in a Houseads
    // sheet is there, but not used.
    var mapped = state.columns
      .filter(function (c) { return c.field && store.has(c.field); })
      .map(function (c) { return c.header; });
    if (mapped.length) dom.sourceLine.appendChild(h("span.bk-srcline__muted", { title: "Kolonner som brukes" }, "· " + mapped.join(", ")));
    if (src.url) {
      var again = h("button.bk-link", { type: "button" }, "Hent på nytt");
      again.addEventListener("click", function () {
        if (!confirm("Hente arket på nytt? Rader med samme radnummer og overskrift beholder det du har justert her; resten erstattes av det som står i arket.")) return;
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
        applyView(true);
      });
      dom.filters.appendChild(b);
    });
    renderListTools();
    announceSoon(c);
  }

  /** The retry and report links beside the filters, when there is a reason. */
  function renderListTools() {
    dom.listTools.innerHTML = "";
    // A dead link may have been fixed at the source, or a server was briefly
    // down: one click tries every failed photo again.
    var failed = state.rows.filter(function (r) { return r.image && r.image.status === "error"; }).length;
    if (failed) {
      var retry = h("button.bk-link.bk-retry", { type: "button" }, "Hent " + failed + (failed === 1 ? " bilde" : " bilder") + " på nytt");
      retry.addEventListener("click", function () { BULK.source.retryFailed(); });
      dom.listTools.appendChild(retry);
    }
    if (ui.problemLines(state.rows).length > 1) {
      var report = h("button.bk-link", { type: "button", title: "Rader med feil eller merknader, med radnummer og årsak – til den som fylte ut arket" }, "Feilrapport (CSV)");
      report.addEventListener("click", function () {
        ui.downloadProblemReport(state.rows, BULK.run.zipName());
      });
      dom.listTools.appendChild(report);
    }
  }

  // Screen readers hear the counts settle, not every step of the fitting.
  var announceTimer = null;
  function announceSoon(c) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(function () {
      var parts = [c.all + (c.all === 1 ? " rad" : " rader")];
      if (c.ok) parts.push(c.ok + " klare");
      if (c.warn) parts.push(c.warn + " å sjekke");
      if (c.error) parts.push(c.error + " med feil");
      if (c.pending) parts.push(c.pending + " venter");
      dom.live.textContent = parts.join(", ");
    }, ANNOUNCE_MS);
  }

  /**
   * Show the rows the filter and search let through. `reorder` also puts the
   * cards in the chosen sort order — done only when the user changes the
   * view, never while fitting changes a status, so a card does not jump away
   * under the pointer.
   */
  function applyView(reorder) {
    var rows = store.viewRows();
    var shown = {};
    rows.forEach(function (row) { shown[row.rid] = true; });
    state.rows.forEach(function (row) {
      var c = cards[row.rid];
      if (c) c.card.hidden = !shown[row.rid];
    });
    if (reorder) {
      rows.forEach(function (row) {
        var c = cards[row.rid];
        if (c) dom.list.appendChild(c.card);
      });
    }
    dom.empty.hidden = !!rows.length || !state.rows.length;
    dom.empty.textContent = state.search ? "Ingen rader passer søket «" + state.search.trim() + "»." : "Ingen rader i dette utvalget.";
    renderSelection();
  }

  function applyDensity() {
    // ReadPeak's and Norsk Tipping's formats are a third the width of the
    // widest house formats; drawn at the house scale they would be stamps.
    var boost = state.product === "houseads" ? 1 : SMALL_FORMAT_BOOST;
    dom.list.style.setProperty("--bk-scale", (DENSITY[state.density] || DENSITY.m) * boost);
    Object.keys(cards).forEach(function (rid) { stale[rid] = true; });
    redrawVisible();
  }

  // ---- row cards --------------------------------------------------------
  function buildCard(row) {
    var label = row.sheetRow ? "rad " + row.sheetRow : "ny rad";
    var select = h("input", { type: "checkbox", checked: row.selected, "aria-label": "Velg " + label });
    select.addEventListener("change", function () {
      row.selected = select.checked;
      card.classList.toggle("is-selected", row.selected);
      renderSelection();
    });
    var include = h("button.bk-toggle", { type: "button" });
    include.addEventListener("click", function () {
      store.updateRow(row, { include: !row.include });
    });

    var headline = h("textarea.bk-hl", { rows: 2, maxlength: 200, "aria-label": "Overskrift, " + label });
    headline.value = row.headline;
    var key = "grid:" + row.rid;
    headline.addEventListener("input", function () {
      store.deferEdit(key, function () {
        if (state.rows.indexOf(row) === -1) return;
        store.updateRow(row, { headline: headline.value.replace(/\s+/g, " ").trim() }, { refit: true });
      }, HEADLINE_DEBOUNCE_MS);
    });
    headline.addEventListener("blur", function () { store.flushEdits(key); });

    // The Ingress, where the product has one: edited in place like the headline.
    var subtitle = null;
    if (store.has("subtitle")) {
      subtitle = h("textarea.bk-sub", { rows: 2, maxlength: 120, placeholder: "Ingress (valgfri)", "aria-label": "Ingress, " + label });
      subtitle.value = row.subtitle;
      var subKey = "grid-sub:" + row.rid;
      subtitle.addEventListener("input", function () {
        store.deferEdit(subKey, function () {
          if (state.rows.indexOf(row) === -1) return;
          store.updateRow(row, { subtitle: subtitle.value.replace(/\s+/g, " ").trim() }, { refit: true });
        }, HEADLINE_DEBOUNCE_MS);
      });
      subtitle.addEventListener("blur", function () { store.flushEdits(subKey); });
    }

    var count = h("span.bk-count");
    var file = h("span.bk-file");
    var issues = h("ul.bk-issues");
    var badge = h("span.bk-badge");
    var adjust = h("button.btn-ghost.btn-sm", { type: "button" }, "Juster");
    adjust.addEventListener("click", function () { BULK.editor.open(row.rid); });
    var thumbs = h("div.bk-thumbs");
    var runMark = h("span.bk-runmark", { hidden: true });

    var card = h(
      "article.bk-card" + (row.selected ? ".is-selected" : ""),
      { "data-rid": row.rid },
      h(
        "div.bk-card__meta",
        null,
        h(
          "div.bk-card__top",
          null,
          h("label.bk-include", null, select),
          h("span.bk-rownum", { title: "Rad i regnearket" }, row.sheetRow ? "Rad " + row.sheetRow : "Ny"),
          badge,
          runMark,
          h("span.bk-toolbar__spacer"),
          include,
          adjust
        ),
        headline,
        subtitle,
        h("div.bk-card__sub", null, count, file),
        issues
      ),
      thumbs
    );
    cards[row.rid] = { card: card, select: select, include: include, headline: headline, subtitle: subtitle, count: count, file: file, issues: issues, badge: badge, thumbs: thumbs, runMark: runMark, built: false };
    if (observer) observer.observe(card);
    return card;
  }

  function runMarkText(run) {
    if (run.status === "done") return "✓ laget" + (run.smaller && run.smaller.length ? " · mindre tekst" : "");
    if (run.status === "running") return "lages …";
    if (run.status === "error") return "✕ " + (run.error || "feilet");
    if (run.status === "waiting") return "i kø";
    if (run.status === "skipped") return "– ikke laget (avbrutt)";
    return "";
  }

  /** The final filename and the row's own weight, under the headline. */
  function renderFile(row) {
    var c = cards[row.rid];
    if (!c) return;
    var base = store.fileBaseOf(row);
    var extra = [];
    if (state.product === "houseads" && row.weight) extra.push(row.weight === "regular" ? "Normal" : "Halvfet");
    if (store.has("brandLabel") && store.brandOf(row)) extra.push(store.brandOf(row));
    if (store.has("gameType")) {
      var game = window.BULK_PRODUCTS.matchGame(row.gameType || store.defaultGame(), store.gamePresets());
      if (String(row.vinnersjanse || "").trim()) extra.push("egen vinnersjanse");
      else if (game) extra.push(game.label);
    }
    c.file.textContent = [base].concat(extra).join(" · ");
    c.file.title = "Filnavn i ZIP-en: " + base + "-…" + (row.filename ? "" : " (laget fra overskriften)");
  }

  function updateMeta(row) {
    var c = cards[row.rid];
    if (!c) return;
    c.card.classList.toggle("is-excluded", !row.include);
    c.card.classList.toggle("is-selected", !!row.selected);
    c.card.dataset.level = row.level;
    c.select.checked = !!row.selected;
    c.include.textContent = row.include ? "Ta ut" : "Ta med";
    c.include.setAttribute("aria-pressed", row.include ? "false" : "true");
    c.include.title = row.include ? "Ikke ta med denne i nedlastingen" : "Ta med denne i nedlastingen igjen";
    if (document.activeElement !== c.headline && c.headline.value !== row.headline) c.headline.value = row.headline;
    if (c.subtitle && document.activeElement !== c.subtitle && c.subtitle.value !== row.subtitle) c.subtitle.value = row.subtitle;
    var n = window.BannerAutofit.countChars(row.headline);
    c.count.textContent = n + " tegn";
    renderFile(row);
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
      c.runMark.textContent = runMarkText(run);
      c.runMark.title = run.error || (run.notes || []).join("\n");
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

  function addCard(row) {
    stale[row.rid] = true;
    var card = buildCard(row);
    var next = state.rows[state.rows.indexOf(row) + 1];
    var before = next && cards[next.rid] ? cards[next.rid].card : null;
    dom.list.insertBefore(card, before);
    updateMeta(row);
  }

  function dropCard(row) {
    var c = cards[row.rid];
    if (!c) return;
    if (observer) observer.unobserve(c.card);
    c.card.remove();
    delete cards[row.rid];
    delete visible[row.rid];
    delete stale[row.rid];
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
          if (!cards[rid]) return;
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
    if (dom.search.value !== state.search) dom.search.value = state.search;
    dom.sort.value = state.sort;
    renderSourceLine();
    renderWarnings();
    renderFilters();
    applyView(true);
    applyDensity();
  }

  function renderWarnings() {
    dom.warnings.innerHTML = "";
    var list = state.warnings || [];
    dom.warnings.hidden = !list.length;
    list.forEach(function (w) { dom.warnings.appendChild(h("li", null, w)); });
  }

  // Filters/counts are cheap but run on every fit; batch them per frame.
  // Filenames too: a row becoming ready can give another row its "-2".
  var countsQueued = false;
  function refreshCountsSoon() {
    if (countsQueued) return;
    countsQueued = true;
    requestAnimationFrame(function () {
      countsQueued = false;
      renderFilters();
      state.rows.forEach(renderFile);
      if (state.filter !== "all" || state.search) applyView(false);
      if (BULK.run) BULK.run.refresh();
    });
  }

  function build(host) {
    dom.scroll = host;
    dom.warnings = h("ul.bk-warnings", { hidden: true });
    dom.list = h("div.bk-list");
    dom.empty = h("p.bk-empty", { hidden: true }, "Ingen rader i dette utvalget.");
    dom.live = h("p.bk-sr", { "aria-live": "polite", role: "status" });
    var addRow = h("button.btn-ghost.btn-sm.bk-addrow", { type: "button", title: "En banner som ikke står i arket" }, "+ Ny rad");
    addRow.addEventListener("click", function () {
      var row = store.addBlankRow();
      BULK.editor.open(row.rid);
    });
    host.appendChild(buildToolbar());
    host.appendChild(dom.warnings);
    host.appendChild(dom.list);
    host.appendChild(dom.empty);
    host.appendChild(h("div.bk-listfoot", null, addRow));
    host.appendChild(dom.live);
  }

  store.on(function (what, payload) {
    if (!dom.list) return;
    if (what === "fit") {
      refreshRow(payload);
      refreshCountsSoon();
    } else if (what === "row") {
      refreshRow(payload.row);
      refreshCountsSoon();
    } else if (what === "list") {
      payload.removed.forEach(dropCard);
      payload.added.forEach(addCard);
      applyView(false);
      refreshCountsSoon();
    } else if (what === "run-rows") {
      // Only the run mark changed: the banners themselves stay as drawn.
      state.rows.forEach(updateMeta);
      renderListTools();
    } else if (what === "product") {
      renderProductControls();
      renderSourceLine();
      applyDensity();
    } else if (what === "evaluated" || what === "formats" || what === "crop") {
      state.rows.forEach(refreshRow);
      refreshCountsSoon();
    }
  });

  BULK.grid = { build: build, rebuild: rebuild, refreshRow: refreshRow };
})();
