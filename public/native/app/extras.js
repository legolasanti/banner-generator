/* =========================================================================
   app/extras.js — the "Side" panel: what belongs to the page as a whole
   rather than to one section (reading progress, chapter menu, the floating
   button, the closing "Likte du saken?", the credit line, custom CSS).

   The form is built from schema.EXTRA_FIELDS with the same controls as the
   section properties, so a new page-level option needs no UI code here.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var S = window.NativeSchema;

  function panel() {
    var root = h("div.nx-extras");

    function extras() {
      return NP.store.get().project.extras || {};
    }

    function set(key, value, opts) {
      NP.store.update(function (p) {
        var next = Object.assign({}, p.extras);
        next[key] = value;
        return Object.assign({}, p, { extras: window.NativeDoc.normalizeExtras(next, { assets: p.assets }) });
      }, { group: "extras:" + key, from: opts && opts.from === "panel" ? "panel" : null });
    }

    function draw() {
      ui.clear(root);
      var x = extras();
      var chapters = 0;
      NP.store.get().project.pages.forEach(function (pg) { pg.sections.forEach(function (s) { if (s.style.chapter) chapters++; }); });
      var lastGroup = null;
      S.EXTRA_FIELDS.forEach(function (f) {
        if (!NP.fields.visible(f, x)) return;
        if (f.group !== lastGroup) {
          lastGroup = f.group;
          root.appendChild(h("h4.nx-group", null, f.group));
        }
        root.appendChild(
          NP.fields.control(f, x[f.key], function (v, opts) {
            set(f.key, v, opts);
            if (f.type === "toggle" || f.type === "select") requestAnimationFrame(draw);
          }, { project: NP.store.get().project, path: f.key })
        );
        if (f.key === "chapterNav" && x.chapterNav !== "none" && !chapters) {
          root.appendChild(h("p.nx-note.nx-note--warn", null, ui.icon("info", 15), " Ingen seksjoner har kapittelnavn ennå. Velg en seksjon → Stil → Navigasjon."));
        }
        if (f.key === "credit" && x.credit && !(NP.settings && NP.settings.studioName)) {
          root.appendChild(h("p.nx-note", null, ui.icon("info", 15), " Studionavnet hentes fra Innstillinger."));
        }
      });
    }

    var unsub = NP.store.subscribe(function (s, change) {
      if (change.kind === "project" && change.undo) draw();
    });
    draw();
    root.destroy = unsub;
    return root;
  }

  NP.extras = { panel: panel };
})();
