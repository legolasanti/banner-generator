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
        title: spec.name + " " + spec.width + "×" + spec.height + " – vis og rediger bare denne flaten",
        on: {
          click: function () {
            if (store.state.view.combined) store.setView({ combined: false });
            store.setBoard(key);
          },
        },
      }, h("span.wp-boards__shape.wp-boards__shape--" + key), h("span", null, h("b", null, spec.name), h("small", null, spec.width + "×" + spec.height)));
      b.dataset.key = key;
      b.dataset.size = spec.width + "×" + spec.height;
      wrap.appendChild(b);
      return b;
    }));
    return wrap;
  }

  function toolBtn(icon, title, onClick, cls) {
    return h("button.wp-btn.wp-btn--icon" + (cls ? "." + cls : ""), { type: "button", title: title, "aria-label": title, on: { click: onClick } }, util.icon(icon, 18));
  }

  // What each guide toggle does, said once when it is switched on.
  var TOGGLE_HELP = {
    snap:
      "Magnet på: når du drar eller endrer størrelse, fester elementene seg til kantene og midten av flaten, " +
      "den sikre sonen og andre elementer. Rosa linjer viser hva som står på linje. Hold Alt for å flytte fritt.",
    safe: "Sikker sone vises: alt viktig må ligge innenfor den røde rammen. Rammen eksporteres aldri.",
    site: "Nettside vises: det skraverte feltet dekkes av nettsidens innhold og synes ikke for leserne.",
  };
  var TOGGLE_OFF = {
    snap: "Magnet av: elementene flyttes fritt, ingenting festes.",
  };

  function viewToggle(key, icon, label, title) {
    var b = h("button.wp-vtog", { type: "button", title: title, "aria-label": label, on: { click: function () {
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

  function zoomMenu(anchor) {
    var item = function (label, keys, fn, disabled) {
      return h("button.wp-menu__item.wp-menu__item--row", { type: "button", disabled: !!disabled, on: { click: function () { util.closePopover(); fn(); } } },
        h("span", null, h("b", null, label)), keys ? h("kbd.wp-kbd", null, keys) : null);
    };
    var hasSel = store.state.view.sel.length > 0;
    util.popover(anchor, h("div.wp-menu.wp-menu--zoom", null,
      item("Tilpass til vinduet", "⇧1", function () { WPE.canvas.fit(); }),
      item("Zoom til markering", "⇧2", function () { WPE.canvas.zoomToSelection(); }, !hasSel),
      h("hr.wp-menu__sep"),
      [0.5, 1, 2].map(function (z) {
        return item(Math.round(z * 100) + " %", "", function () { WPE.canvas.setZoom(z); });
      }),
      h("hr.wp-menu__sep"),
      item("Zoom inn", "⌘ +", function () { WPE.canvas.zoomBy(1.2); }),
      item("Zoom ut", "⌘ −", function () { WPE.canvas.zoomBy(1 / 1.2); })
    ));
  }

  function topbar() {
    dom.undo = toolBtn("undo-2", "Angre (Ctrl/⌘+Z)", function () { store.undo(); });
    dom.redo = toolBtn("redo-2", "Gjør om (Ctrl/⌘+Shift+Z)", function () { store.redo(); });
    dom.zoomLab = h("button.wp-zoomlab", { type: "button", title: "Zoomnivå", "aria-haspopup": "true", on: { click: function () { zoomMenu(dom.zoomLab); } } }, "100 %");
    dom.status = h("span.wp-status", { title: "Designet lagres automatisk i denne nettleseren", "aria-live": "polite" });
    dom.toggles = [
      viewToggle("safe", "shield", "Sikker sone",
        "Sikker sone: viser den røde rammen som logo, tekst og knapper må ligge innenfor for å synes på alle skjermer. Rammen eksporteres aldri."),
      viewToggle("site", "layout-panel-top", "Nettside",
        "Nettside: skraverer feltet midt på bakgrunnen som nettsidens innhold dekker. Det som ligger der, synes ikke for leserne."),
      viewToggle("snap", "magnet", "Magnet",
        "Magnet: elementer fester seg til kanter, midtlinjer og andre elementer når du drar dem. Hold Alt for å flytte fritt."),
    ];
    var projectBtn = h("button.wp-btn.wp-btn--ghost", { type: "button", title: "Nytt design, åpne eller lagre prosjektfil", "aria-haspopup": "true" }, util.icon("folder-open", 16), "Prosjekt");
    projectBtn.addEventListener("click", function () { projectMenu(projectBtn); });
    return h("div.wp-top", null,
      boardTabs(),
      h("div.wp-top__group", { role: "group", "aria-label": "Angre" }, dom.undo, dom.redo),
      h("div.wp-top__group.wp-top__group--toggles", { role: "group", "aria-label": "Hjelpelinjer" }, dom.toggles),
      h("div.wp-top__group", { role: "group", "aria-label": "Zoom" },
        toolBtn("zoom-out", "Zoom ut (Ctrl/⌘ −)", function () { WPE.canvas.zoomBy(1 / 1.2); }),
        dom.zoomLab,
        toolBtn("zoom-in", "Zoom inn (Ctrl/⌘ +)", function () { WPE.canvas.zoomBy(1.2); })
      ),
      h("div.wp-top__spacer"),
      h("div.wp-top__actions", null,
        dom.status,
        projectBtn,
        h("button.wp-btn.wp-btn--ghost", { type: "button", title: "Se designet slik det ligger på nettsiden, i ulike skjermbredder", on: { click: function () { WPE.preview.open(); } } }, util.icon("monitor", 16), "Forhåndsvis"),
        h("button.wp-btn.wp-btn--primary", { type: "button", title: "Last ned bakgrunn og toppbanner som bilde eller HTML5", on: { click: function () { WPE.exporter.open(); } } }, util.icon("download", 16), "Eksporter")
      )
    );
  }

  function syncTop(what) {
    var v = store.state.view;
    if (!what || what === "board" || what === "view") {
      dom.boardBtns.forEach(function (b) {
        var on = v.combined ? b.dataset.key === "combined" : b.dataset.key === v.board;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      // In Samlet view the artboard the next edit goes to says so in its
      // second line, in the canvas's selection colour — not a second
      // highlighted button.
      dom.boardBtns.forEach(function (b) {
        if (!b.dataset.size) return;
        var editing = !!v.combined && b.dataset.key === v.board;
        b.classList.toggle("is-editing", editing);
        b.querySelector("small").textContent = editing ? "redigeres" : b.dataset.size;
      });
    }
    dom.undo.disabled = !store.canUndo();
    dom.redo.disabled = !store.canRedo();
    dom.toggles.forEach(function (b) {
      b.classList.toggle("is-on", !!v[b.dataset.key]);
      b.setAttribute("aria-pressed", v[b.dataset.key] ? "true" : "false");
    });
    dom.zoomLab.textContent = Math.round(v.zoom * 100) + " %";
    dom.zoomLab.setAttribute("aria-label", "Zoom " + Math.round(v.zoom * 100) + " % – tilpass til vinduet");
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
