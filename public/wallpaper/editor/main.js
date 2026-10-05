/* =========================================================================
   editor/main.js — assembles the Wallpaper editor inside #view-wallpaper.

   Built lazily the first time the tab opens (the icon set and the editor UI
   are not needed by anyone who only makes banners), then kept alive: leaving
   the tab and coming back returns to exactly the same state.

     ┌ top bar: artboard switch · undo/redo · guides · zoom · project · export ┐
     │ rail │ drawer │              canvas               │  properties       │
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Spec = window.WallpaperSpec;
  var Render = window.WallpaperRender;
  var store = WPE.store;
  var util = WPE.util;
  var h = util.h;

  var view = null;
  var built = false;
  var booting = null;
  var dom = {};

  function isActive() {
    return !!view && !view.classList.contains("is-hidden");
  }

  function injectCss() {
    var style = document.createElement("style");
    style.id = "wp-render-css";
    style.textContent = Render.BASE_CSS + "\n" + Render.HOVER_CSS;
    document.head.appendChild(style);
  }

  // ---- top bar ----------------------------------------------------------------------
  function boardTabs() {
    var wrap = h("div.wp-boards", { role: "tablist", "aria-label": "Tegneflate" });
    // "Samlet" first: both artboards on one canvas, as they sit on the page.
    var both = h("button.wp-boards__b", {
      type: "button", role: "tab", title: "Bakgrunn og toppbanner sammen, slik de ligger på siden. Klikk et element for å redigere det.",
      on: { click: function () { store.setView({ combined: true }); } },
    }, h("span.wp-boards__shape.wp-boards__shape--both", null, h("i")), h("span", null, h("b", null, "Samlet"), h("small", null, "begge sammen")));
    both.dataset.key = "combined";
    wrap.appendChild(both);
    dom.boardBtns = [both].concat(Spec.ORDER.map(function (key) {
      var spec = Spec.get(key);
      var b = h("button.wp-boards__b", {
        type: "button", role: "tab",
        on: {
          click: function () {
            if (store.state.view.combined) store.setView({ combined: false });
            store.setBoard(key);
          },
        },
      }, h("span.wp-boards__shape.wp-boards__shape--" + key), h("span", null, h("b", null, spec.name), h("small", null, spec.width + "×" + spec.height)));
      b.dataset.key = key;
      wrap.appendChild(b);
      return b;
    }));
    return wrap;
  }

  function toolBtn(icon, title, onClick, cls) {
    return h("button.wp-tool" + (cls ? "." + cls : ""), { type: "button", title: title, "aria-label": title, on: { click: onClick } }, util.icon(icon, 18));
  }

  // What each guide toggle does, said once when it is switched on.
  var TOGGLE_HELP = {
    snap:
      "Magnet ON: while you drag or resize, elements snap to the artboard edges and centre, the safe area, " +
      "the page edges and other elements, and pink guide lines show what lined up. Hold Alt to move freely for a moment.",
    safe: "Sikker sone vises: alt viktig må ligge innenfor den røde rammen. Rammen eksporteres aldri.",
    site: "Nettside vises: det skraverte feltet dekkes av nettsidens innhold og synes ikke.",
  };
  var TOGGLE_OFF = {
    snap: "Magnet OFF: elements move freely, nothing snaps.",
  };

  function viewToggle(key, icon, label, title) {
    var b = h("button.wp-vtog", { type: "button", title: title, on: { click: function () {
      var p = {};
      p[key] = !store.state.view[key];
      store.setView(p);
      var msg = p[key] ? TOGGLE_HELP[key] : TOGGLE_OFF[key];
      if (msg) WPE.toast(msg, "ok");
    } } },
      util.icon(icon, 16), h("span", null, label));
    b.dataset.key = key;
    return b;
  }

  function projectMenu(anchor) {
    var fileIn = h("input", { type: "file", accept: ".json,application/json", hidden: true });
    fileIn.addEventListener("change", function () {
      var f = fileIn.files[0];
      fileIn.value = "";
      if (!f) return;
      WPE.storage.openProjectFile(f).then(function () { WPE.canvas.fit(); }).catch(function (err) { WPE.toast(err.message, "err"); });
    });
    var item = function (icon, label, desc, fn) {
      return h("button.wp-menu__item", { type: "button", on: { click: function () { util.closePopover(); fn(); } } },
        util.icon(icon, 16), h("span", null, h("b", null, label), h("small", null, desc)));
    };
    util.popover(anchor, h("div.wp-menu", null,
      item("file-plus", "Nytt tomt design", "Begynn på nytt (kan angres)", function () {
        if (!confirm("Starte et nytt, tomt design? Det nåværende kan hentes tilbake med Angre.")) return;
        store.load(window.WallpaperDoc.emptyDoc());
        WPE.panels.open("templates", {});
      }),
      item("folder-open", "Åpne prosjektfil …", "En .wallpaper.json lagret tidligere", function () { fileIn.click(); }),
      item("save", "Lagre som fil", "Hele designet med bilder, til deling/arkiv", function () {
        WPE.storage.saveProjectFile().then(function () { WPE.toast("Prosjektfilen er lastet ned", "ok"); }).catch(function (err) { WPE.toast(err.message, "err"); });
      }),
      fileIn
    ), { align: "right" });
  }

  function topbar() {
    dom.undo = toolBtn("undo-2", "Angre (Ctrl/⌘+Z)", function () { store.undo(); });
    dom.redo = toolBtn("redo-2", "Gjør om (Ctrl/⌘+Shift+Z)", function () { store.redo(); });
    dom.zoomLab = h("button.wp-zoomlab", { type: "button", title: "Tilpass til vinduet (Ctrl/⌘+0)", on: { click: function () { WPE.canvas.fit(); } } }, "100 %");
    dom.status = h("span.wp-status", { title: "Designet lagres automatisk i denne nettleseren" });
    dom.toggles = [
      viewToggle("safe", "shield", "Sikker sone", "Vis/skjul den røde sikre sonen (eksporteres aldri)"),
      viewToggle("site", "layout-panel-top", "Nettside", "Vis hvor nettsiden dekker bakgrunnen"),
      viewToggle("snap", "magnet", "Magnet", "Fest til kanter og hjelpelinjer (hold Alt for å slå av midlertidig)"),
    ];
    var projectBtn = h("button.wp-btn.wp-btn--ghost", { type: "button" }, util.icon("folder-open", 16), "Prosjekt");
    projectBtn.addEventListener("click", function () { projectMenu(projectBtn); });
    return h("div.wp-top", null,
      boardTabs(),
      h("div.wp-top__group", null, dom.undo, dom.redo),
      h("div.wp-top__group", null, dom.toggles),
      h("div.wp-top__group", null,
        toolBtn("zoom-out", "Zoom ut (Ctrl/⌘ −)", function () { WPE.canvas.zoomBy(1 / 1.2); }),
        dom.zoomLab,
        toolBtn("zoom-in", "Zoom inn (Ctrl/⌘ +)", function () { WPE.canvas.zoomBy(1.2); })
      ),
      h("div.wp-top__spacer"),
      dom.status,
      projectBtn,
      h("button.wp-btn.wp-btn--ghost", { type: "button", title: "Se designet slik det ligger på nettsiden", on: { click: function () { WPE.preview.open(); } } }, util.icon("monitor", 16), "Forhåndsvis"),
      h("button.wp-btn.wp-btn--primary", { type: "button", on: { click: function () { WPE.exporter.open(); } } }, util.icon("download", 16), "Eksporter")
    );
  }

  function syncTop(what) {
    var v = store.state.view;
    if (!what || what === "board" || what === "view") {
      dom.boardBtns.forEach(function (b) {
        var on = v.combined ? b.dataset.key === "combined" : b.dataset.key === v.board;
        // In Samlet view, mark which artboard the next edit goes to.
        b.classList.toggle("is-sub", !!v.combined && b.dataset.key === v.board);
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
    }
    dom.undo.disabled = !store.canUndo();
    dom.redo.disabled = !store.canRedo();
    dom.toggles.forEach(function (b) { b.classList.toggle("is-on", !!v[b.dataset.key]); });
    dom.zoomLab.textContent = Math.round(v.zoom * 100) + " %";
  }

  // ---- build ---------------------------------------------------------------------------
  function build() {
    injectCss();
    var rail = h("nav.wp-rail", { "aria-label": "Verktøy" });
    var drawer = h("aside.wp-drawer", { hidden: true });
    var stage = h("div.wp-stage", { "aria-label": "Lerret" });
    var props = h("aside.wp-props", { "aria-label": "Egenskaper" });
    var root = h("div.wp", null, topbar(), h("div.wp-main", null, rail, drawer, stage, props));
    view.appendChild(root);

    WPE.canvas.mount(stage);
    WPE.interact.mount();
    WPE.props.mount(props);
    WPE.panels.mount(rail, drawer);
    WPE.keys.mount();

    store.subscribe(function (what) { syncTop(what); });
    WPE.storage.onStatus(function (s) {
      dom.status.textContent = s === "saving" ? "Lagrer …" : s === "saved" ? "Lagret" : "Kunne ikke lagre";
      dom.status.classList.toggle("is-err", s === "error");
    });
    syncTop();
  }

  /** Open (and on first use, build) the editor. */
  function activate() {
    if (built) {
      requestAnimationFrame(function () { WPE.canvas.flushNow(); });
      return Promise.resolve();
    }
    if (booting) return booting;
    view.classList.add("is-loading");
    booting = util.loadIcons()
      .catch(function () {
        WPE.toast("Kunne ikke laste ikonene – editoren virker, men uten ikoner", "err");
      })
      .then(function () {
        build();
        built = true;
        return WPE.storage.restore().catch(function () { return false; });
      })
      .then(function (restored) {
        WPE.fontload.ensureDoc(store.state.doc);
        WPE.storage.startAutosave();
        var d = store.state.doc;
        var empty = !d.artboards.background.elements.length && !d.artboards.topbanner.elements.length;
        WPE.panels.open(empty ? "templates" : "text");
        if (restored && !empty) WPE.toast("Fortsetter der du slapp", "ok");
        view.classList.remove("is-loading");
        requestAnimationFrame(function () { WPE.canvas.fit(); });
      });
    return booting;
  }

  /** Reopen a design from history. */
  function openProject(url) {
    return activate().then(function () {
      return WPE.storage.openFromUrl(url).then(function () {
        WPE.fontload.ensureDoc(store.state.doc);
        requestAnimationFrame(function () { WPE.canvas.fit(); });
      });
    }).catch(function (err) {
      WPE.toast(err.message || "Kunne ikke åpne designet", "err");
    });
  }

  function init() {
    view = document.getElementById("view-wallpaper");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  WPE.main = { activate: activate, isActive: isActive, openProject: openProject };
})();
