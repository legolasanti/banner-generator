/* =========================================================================
   live/main.js — the NT Live tab: a header with the campaign and the
   export, a settings panel in five tabs (Kamper, Design, Tekster, Rotasjon,
   Eksport) and the four formats running live on a stage. Owns the state;
   the panels and the preview read it through `app` and change it through
   app.patch / app.setDesign, which save and re-render.

   Built the first time the tab opens, kept alive after that; the work in
   progress survives a reload (localStorage).
   ========================================================================= */
(function () {
  "use strict";

  var NTLIVE = (window.NTLIVE = window.NTLIVE || {});
  var h = window.WPE.util.h;
  var LD = window.LiveData;
  var LT = window.LiveTemplates;
  var icon = NTLIVE.icon;
  var STORAGE_KEY = "ntlive:v1";
  var MAX_STORED_FALLBACK = 1500000; // chars of data URL kept across reloads
  var REBUILD_DELAY_MS = 140;

  var DEFAULT_DESIGN = {
    kicker: "Oddsen",
    ctaText: "Spill nå",
    timeMode: "clock",
    clockSep: ":",
    liveLabel: "Pågår nå",
    slideMs: 5000,
    transition: "fade",
    lookAheadDays: 1,
    finishedAfterMin: 120,
    maxSlides: 6,
    accent: "#1a6b1a",
    textScale: 1,
    defaultMedia: "gradient",
    teamsInAnimation: true,
    fallbackHeadline: "Dagens kamper på Oddsen",
    fallbackText: "Nye kamper hver dag",
    exitMode: "row",
    liveRefresh: true,
    bundleDays: 3,
    mediaKb: 45,
    template: "klassisk",
    motion: "standard",
    listTitle: "Dagens kamper",
    customHtml: "",
    customCss: "",
    customMode: "slides",
    customZone: "strip",
  };
  var DEFAULT_BADGES = { vinnersjanse: "", showVinnerOnNewsgrid: false };
  var DEFAULT_UI = { tab: "kamper", layout: "alle", focusKey: "desktop", bg: "rutenett", zoom: "fit" };

  var state = {
    name: "",
    filename: "",
    clickUrl: "https://www.norsk-tipping.no/sport/oddsen",
    sheetUrl: "",
    sourceMode: "sheet", // "sheet" | "paste"
    pasted: "",
    source: null, // { kind, url, liveUrls }
    rows: [],
    columns: {},
    warnings: [],
    fetchedAt: "",
    design: Object.assign({}, DEFAULT_DESIGN),
    badges: Object.assign({}, DEFAULT_BADGES),
    keys: ["readpeak", "desktop", "mobile", "newsgrid"],
    fallbackImage: "", // data URL
    ui: Object.assign({}, DEFAULT_UI),
    lastResult: null,
  };

  var settings = null;
  var view = null;
  var built = false;
  var preview = null;
  var rebuildTimer = null;
  var listeners = {};
  var dom = {};

  // ---- events ---------------------------------------------------------------
  function on(name, fn) {
    (listeners[name] = listeners[name] || []).push(fn);
  }
  function emit(name, detail) {
    (listeners[name] || []).forEach(function (fn) {
      try {
        fn(detail);
      } catch (err) {
        console.error("[ntlive] " + name + ": " + (err && err.stack ? err.stack : err));
      }
    });
  }

  // ---- persistence ----------------------------------------------------------
  function save() {
    try {
      var copy = Object.assign({}, state, { lastResult: null });
      if (copy.fallbackImage && copy.fallbackImage.length > MAX_STORED_FALLBACK) copy.fallbackImage = "";
      localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
      markSaved();
    } catch (e) {
      /* quota or private mode: the session simply does not survive a reload */
    }
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      Object.keys(state).forEach(function (k) {
        if (saved[k] !== undefined) state[k] = saved[k];
      });
      state.design = Object.assign({}, DEFAULT_DESIGN, saved.design || {});
      state.badges = Object.assign({}, DEFAULT_BADGES, saved.badges || {});
      state.ui = Object.assign({}, DEFAULT_UI, saved.ui || {});
      state.lastResult = null;
    } catch (e) {
      /* ignore a corrupt session */
    }
  }

  var savedTimer = null;
  function markSaved() {
    if (!dom.saved) return;
    dom.saved.classList.add("is-saving");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(function () { dom.saved.classList.remove("is-saving"); }, 600);
  }

  function toast(message, kind) {
    var host = document.getElementById("toasts");
    if (!host) return;
    var t = h("div.toast" + (kind ? ".toast--" + kind : ""), null, h("span.toast__dot"), h("span", null, message));
    host.appendChild(t);
    setTimeout(function () { t.remove(); }, kind === "err" ? 7000 : 3500);
  }

  // ---- the config the runtime reads (same shape as the package) -------------
  function badgesConfig() {
    var st = settings || {};
    var badges = st.staticBadges || {};
    var iconPath = st.ageIcon && st.ageIcon.path ? "/" + st.ageIcon.path + (st.ageIcon.version ? "?v=" + st.ageIcon.version : "") : "";
    return {
      annonseText: badges.annonseText || "Annonse",
      ageBadgeText: badges.ageBadgeText || "18+ | Hjelpelinjen.no",
      ageIconUrl: iconPath,
      vinnersjanse: state.badges.vinnersjanse,
      showVinnerOnNewsgrid: state.badges.showVinnerOnNewsgrid,
    };
  }

  /**
   * @param {Object} [over]  { design, rows, templateId } — a variation for
   *   the gallery thumbnails and the code editor's draft.
   */
  function previewConfig(over) {
    var o = over || {};
    var design = Object.assign({}, state.design, o.design || {}, { clickUrl: state.clickUrl });
    return {
      rows: o.rows || state.rows,
      design: design,
      template: LT.resolve(design, o.templateId ? { id: o.templateId } : null),
      badges: badgesConfig(),
      assets: { media: {}, fallback: state.fallbackImage || "" },
      source: { liveUrls: [] },
    };
  }

  function scheduleRebuild() {
    save();
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(function () {
      if (preview) preview.setConfig(previewConfig());
      emit("config");
    }, REBUILD_DELAY_MS);
  }

  function setDesign(key, value) {
    var next = {};
    next[key] = value;
    state.design = Object.assign({}, state.design, next);
    scheduleRebuild();
    emit("design", key);
    if (key === "template") updateHeader();
  }

  /** Shallow-merge top-level state; `quiet` skips the preview rebuild. */
  function patch(changes, quiet) {
    Object.keys(changes).forEach(function (k) { state[k] = changes[k]; });
    if (quiet) save();
    else scheduleRebuild();
    if (changes.rows || changes.warnings || changes.source) emit("rows");
    if (built) updateHeader();
  }

  function setUi(changes) {
    state.ui = Object.assign({}, state.ui, changes);
    save();
    emit("ui", changes);
  }

  // ---- header -----------------------------------------------------------------
  function headerStats() {
    var n = state.rows.length;
    if (!n) return [{ text: "Ingen kamper ennå", kind: "muted" }];
    var picked = LD.select(state.rows, new Date(), state.design);
    var out = [{ text: n + (n === 1 ? " kamp" : " kamper"), kind: "" }];
    if (picked.scope === "today") out.push({ text: picked.slides.length + " i dag", kind: "ok" });
    else if (picked.scope === "next") out.push({ text: "neste: " + LD.dayWord(picked.dayOffset, picked.ymd).toLowerCase(), kind: "" });
    else out.push({ text: "ingen i dag", kind: "warn" });
    if (state.warnings.length) out.push({ text: state.warnings.length + (state.warnings.length === 1 ? " advarsel" : " advarsler"), kind: "warn" });
    var live = state.design.liveRefresh && state.source && state.source.liveUrls && state.source.liveUrls.length;
    out.push({ text: live ? "Live-oppdatering" : "Fast utvalg", kind: live ? "live" : "muted" });
    return out;
  }

  function updateHeader() {
    if (!dom.stats) return;
    dom.stats.innerHTML = "";
    headerStats().forEach(function (s) {
      dom.stats.appendChild(h("span.lv-chip" + (s.kind ? ".lv-chip--" + s.kind : ""), null, s.kind === "live" ? h("span.lv-chip__pulse") : null, s.text));
    });
    var tpl = LT.byId(state.design.template);
    dom.tplName.textContent = tpl ? tpl.name : "Egen kode";
    if (dom.tabBadge) {
      dom.tabBadge.textContent = state.rows.length ? String(state.rows.length) : "";
      dom.tabBadge.hidden = !state.rows.length;
      dom.tabBadge.classList.toggle("is-warn", state.warnings.length > 0);
    }
  }

  function buildHeader() {
    dom.saved = h("span.lv-saved", { title: "Alt lagres automatisk i denne nettleseren" }, icon("check", 13), "Lagret");
    dom.stats = h("div.lv-head__stats");
    dom.tplName = h("span");
    var name = h("input.lv-head__name", {
      type: "text",
      value: state.name,
      placeholder: "Navngi kampanjen…",
      maxlength: 120,
      spellcheck: "false",
      "aria-label": "Kampanjenavn (vises i Historikk)",
    });
    name.addEventListener("input", function () { patch({ name: name.value }, true); });
    dom.headExport = NTLIVE.form.button("Lag HTML5-pakker", { kind: "primary", icon: "download", onClick: function () { NTLIVE.exporter.run(app); } });
    return h(
      "header.lv-head",
      null,
      h(
        "div.lv-head__id",
        null,
        h("span.lv-head__mark", { "aria-hidden": "true" }, icon("radio", 18)),
        h("div.lv-head__titles", null, name, h("span.lv-head__sub", null, "NT Live · dynamisk HTML5 · mal: ", dom.tplName))
      ),
      dom.stats,
      h("div.lv-head__actions", null, dom.saved, dom.headExport)
    );
  }

  // ---- side panel tabs --------------------------------------------------------
  var TABS = [
    { id: "kamper", label: "Kamper", icon: "sheet", build: function () { return NTLIVE.panels.sheet(app); } },
    { id: "design", label: "Design", icon: "palette", build: function () { return NTLIVE.panels.design(app); } },
    { id: "tekster", label: "Tekster", icon: "type", build: function () { return NTLIVE.panels.texts(app); } },
    { id: "rotasjon", label: "Rotasjon", icon: "repeat", build: function () { return NTLIVE.panels.rotation(app); } },
    { id: "eksport", label: "Eksport", icon: "upload", build: function () { return NTLIVE.exporter.panel(app); } },
  ];

  function buildSide() {
    var tablist = h("div.lv-tabs", { role: "tablist", "aria-label": "Innstillinger" });
    var panels = h("div.lv-panels");
    var buttons = {};
    var bodies = {};
    TABS.forEach(function (t) {
      var b = h("button.lv-tab", { type: "button", role: "tab", id: "lv-tab-" + t.id, "aria-controls": "lv-panel-" + t.id }, icon(t.icon, 16), h("span", null, t.label));
      if (t.id === "kamper") {
        dom.tabBadge = h("span.lv-tab__badge", { hidden: true });
        b.appendChild(dom.tabBadge);
      }
      b.addEventListener("click", function () { selectTab(t.id); });
      b.addEventListener("keydown", function (e) {
        var i = TABS.indexOf(t);
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          var nextTab = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
          selectTab(nextTab.id);
          buttons[nextTab.id].focus();
        }
      });
      buttons[t.id] = b;
      tablist.appendChild(b);
      var body = h("div.lv-panel", { role: "tabpanel", id: "lv-panel-" + t.id, "aria-labelledby": "lv-tab-" + t.id, hidden: true });
      body.appendChild(t.build());
      bodies[t.id] = body;
      panels.appendChild(body);
    });
    function selectTab(id) {
      TABS.forEach(function (t) {
        var on = t.id === id;
        buttons[t.id].classList.toggle("is-active", on);
        buttons[t.id].setAttribute("aria-selected", on ? "true" : "false");
        buttons[t.id].tabIndex = on ? 0 : -1;
        bodies[t.id].hidden = !on;
      });
      panels.scrollTop = 0;
      if (state.ui.tab !== id) setUi({ tab: id });
      emit("tab", id);
    }
    app.selectTab = selectTab;
    var side = h("aside.lv-side", null, tablist, panels);
    selectTab(TABS.some(function (t) { return t.id === state.ui.tab; }) ? state.ui.tab : "kamper");
    return side;
  }

  // ---- assembly -----------------------------------------------------------------
  function build() {
    view = document.getElementById("view-live");
    var main = h("section.lv-main", { "aria-label": "Forhåndsvisning" });
    var shell = h("div.lv", null, buildHeader(), buildSide(), main);
    view.appendChild(shell);
    preview = NTLIVE.preview.build(main, app);
    preview.setConfig(previewConfig());
    built = true;
    updateHeader();
    emit("rows");
  }

  function loadSettings() {
    return fetch("/api/settings")
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (s) { settings = s; });
  }

  var booting = false;
  function activate() {
    if (built) {
      if (preview) preview.fit();
      return;
    }
    if (booting) return;
    booting = true;
    restore();
    loadSettings().then(function () {
      build();
      booting = false;
    });
  }

  function rebuildAll() {
    listeners = {};
    if (preview) preview.destroy();
    view.innerHTML = "";
    built = false;
    build();
  }

  /** Reopen an exported run from history (its project.json). */
  function openProject(url) {
    var folder = url.replace(/[^/]*$/, "");
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("Fant ikke prosjektet");
        return r.json();
      })
      .then(function (p) {
        state.name = p.name || "";
        state.filename = p.filename || "";
        state.clickUrl = p.clickUrl || state.clickUrl;
        state.design = Object.assign({}, DEFAULT_DESIGN, p.design || {});
        state.badges = Object.assign({}, DEFAULT_BADGES, p.badges || {});
        state.rows = p.rows || [];
        state.keys = p.keys || state.keys;
        state.source = p.source || null;
        state.sheetUrl = (p.source && p.source.url) || "";
        state.sourceMode = state.sheetUrl ? "sheet" : state.sourceMode;
        state.warnings = [];
        state.fallbackImage = "";
        state.lastResult = null;
        state.ui = Object.assign({}, state.ui, { tab: "kamper" });
        var done = function () {
          save();
          if (built) rebuildAll();
          else activate();
          toast("Prosjektet er åpnet – hent arket på nytt for ferske kamper", "ok");
        };
        if (!p.fallbackImage) return done();
        return fetch(folder + p.fallbackImage)
          .then(function (r) { return r.ok ? r.blob() : null; })
          .then(function (blob) {
            if (!blob) return done();
            var reader = new FileReader();
            reader.onload = function () {
              state.fallbackImage = String(reader.result || "");
              done();
            };
            reader.readAsDataURL(blob);
          });
      })
      .catch(function (err) { toast(err.message, "err"); });
  }

  var app = {
    state: state,
    DEFAULT_DESIGN: DEFAULT_DESIGN,
    get settings() { return settings; },
    get preview() { return preview; },
    on: on,
    emit: emit,
    save: save,
    patch: patch,
    setDesign: setDesign,
    setUi: setUi,
    toast: toast,
    previewConfig: previewConfig,
    rebuild: scheduleRebuild,
    updateHeader: updateHeader,
    selectTab: function () {},
    get exportButton() { return dom.headExport; },
  };

  NTLIVE.main = { activate: activate, openProject: openProject, state: state, app: app };
})();
