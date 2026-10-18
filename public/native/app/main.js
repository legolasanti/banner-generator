/* =========================================================================
   app/main.js — boots Native Premium and routes between its screens.

     #/                 projects
     #/p/<id>           the editor (…/ai opens the AI wizard right away)
     #/merkevarer       brand kits
     #/bibliotek        library
     #/innstillinger    settings
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;

  var main = document.getElementById("nxMain");
  var topbar = document.getElementById("nxTopbar");

  var NAV = [
    ["#/", "Prosjekter"],
    ["#/merkevarer", "Merkevarer"],
    ["#/bibliotek", "Bibliotek"],
    ["#/innstillinger", "Innstillinger"],
  ];

  function nav(active) {
    ui.clear(topbar);
    var tabs = h("nav.tabs", { "aria-label": "Native Premium" });
    NAV.forEach(function (n) {
      tabs.appendChild(h("a.tab" + (n[0] === active ? ".is-active" : ""), { href: n[0], "aria-current": n[0] === active ? "page" : null }, n[1]));
    });
    topbar.appendChild(tabs);
  }

  // The address the app is showing, and a pass for the one navigation the
  // user has just confirmed.
  var shown = null;
  var confirmed = false;

  function inEditor(hash) {
    return /^#\/p\//.test(hash || "");
  }

  /**
   * Leaving a project with edits that are not on the server: put the old
   * address back while asking (leave.js), and go on only if the user says so.
   */
  function guarded(hash) {
    if (confirmed || !inEditor(shown) || hash === shown || !NP.store.get() || !NP.store.hasUnsaved()) return false;
    history.replaceState(null, "", shown);
    NP.leave.confirm().then(function (ok) {
      if (!ok) return;
      confirmed = true;
      location.hash = hash;
    });
    return true;
  }

  function route() {
    var hash = location.hash || "#/";
    if (guarded(hash)) return Promise.resolve();
    confirmed = false;
    shown = hash;
    var m = /^#\/p\/([A-Za-z0-9_-]{4,40})(\/ai)?$/.exec(hash);
    document.body.classList.toggle("nx-in-editor", !!m);
    if (m) {
      if (m[2]) {
        history.replaceState(null, "", "#/p/" + m[1]);
        shown = "#/p/" + m[1];
      }
      return NP.editor.open(m[1], main, topbar).then(function () {
        if (m[2]) setTimeout(function () { NP.ai.open(); }, 300);
      });
    }
    return NP.editor.close().then(function () {
      ui.clear(main);
      document.title = "Native Premium · ABC design";
      if (hash === "#/merkevarer") {
        nav(hash);
        return NP.brands.view(main);
      }
      if (hash === "#/bibliotek") {
        nav(hash);
        return NP.library.view(main);
      }
      if (hash === "#/innstillinger") {
        nav(hash);
        return NP.settingsView.view(main);
      }
      nav("#/");
      NP.projects.view(main);
    });
  }

  function boot() {
    Promise.all([
      window.WPE.util.loadIcons().catch(function () {}),
      NP.api.settings().then(function (r) {
        NP.settings = r.settings;
        NP.aiConfigured = !!(r.ai && r.ai.configured);
      }).catch(function () {
        NP.settings = {};
      }),
    ]).then(function () {
      window.addEventListener("hashchange", route);
      route();
    });
  }

  boot();
})();
