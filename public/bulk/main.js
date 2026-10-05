/* =========================================================================
   bulk/main.js — assembles the Bulk tab inside #view-bulk.

   Two screens in one view: the start screen (where the sheet comes from)
   until rows exist, then the workspace (toolbar + rows, run bar pinned at
   the bottom). Built the first time the tab opens and kept alive after that.
   ========================================================================= */
(function () {
  "use strict";

  var BULK = (window.BULK = window.BULK || {});
  var store = BULK.store;
  var state = BULK.state;
  var h = window.WPE.util.h;

  var view = null;
  var built = false;
  var booting = false; // settings are loading; build() follows
  var dom = {};

  function loadSettings() {
    return fetch("/api/settings")
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (s) {
        BULK.settings = s;
        state.rules = (s && s.autoFit) || {};
      });
  }

  function showScreen() {
    var has = state.rows.length > 0;
    dom.start.hidden = has;
    dom.work.hidden = !has;
  }

  function build() {
    view = document.getElementById("view-bulk");
    dom.start = h("div.bk-screen.bk-screen--start");
    dom.scroll = h("div.bk-scroll");
    dom.runHost = h("div.bk-runhost");
    dom.work = h("div.bk-screen.bk-screen--work", { hidden: true }, dom.scroll, dom.runHost);
    view.appendChild(h("div.bk", null, dom.start, dom.work));
    BULK.source.buildStart(dom.start);
    BULK.grid.build(dom.scroll);
    BULK.run.build(dom.runHost);
    built = true;
  }

  function activate() {
    if (built) {
      showScreen();
      return;
    }
    if (booting) return;
    // The session is restored BEFORE the controls are built, so the toolbar
    // and the run bar start out showing the restored formats, weight and
    // output — not the defaults with the old values hiding behind them.
    booting = true;
    loadSettings().then(function () {
      var resumed = store.restore();
      build();
      if (resumed) {
        store.emit("rows"); // rebuilds the cards and refits every row
        state.rows.forEach(function (row) {
          if (!row.image || row.image.status !== "ok") BULK.source.queueImage(row);
        });
        BULK.run.resume(resumed.jobId);
      } else {
        showScreen();
      }
    });
  }

  store.on(function (what) {
    if (!built) return;
    if (what === "rows") {
      BULK.grid.rebuild();
      showScreen();
      dom.scroll.scrollTop = 0;
    }
  });

  BULK.main = { activate: activate };
})();
