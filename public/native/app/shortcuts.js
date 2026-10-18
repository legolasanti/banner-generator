/* =========================================================================
   app/shortcuts.js — the editor's keyboard shortcuts, and the sheet "?"
   opens to list them. Both live here so the sheet never promises a key
   that does something else.

   handle() runs for keys pressed anywhere in the editor, including inside
   the preview iframe (canvas.js forwards those) — except while text is
   being typed, in a field or right on the page.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;

  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var MOD = MAC ? "⌘" : "Ctrl";
  var ALT = MAC ? "⌥" : "Alt";

  // [keys, what it does] in groups, for the sheet.
  var SHEET = [
    ["Generelt", [
      [[MOD, "S"], "Lagre nå"],
      [[MOD, "Z"], "Angre"],
      [[MOD, "⇧", "Z"], "Gjør om"],
      [["?"], "Vis denne oversikten"],
      [["Esc"], "Fjern valget"],
    ]],
    ["Seksjoner", [
      [[MOD, "C"], "Kopier seksjonen (også til et annet prosjekt)"],
      [[MOD, "V"], "Lim inn under den valgte"],
      [[MOD, ALT, "C"], "Kopier bare stilen"],
      [[MOD, ALT, "V"], "Lim inn stilen på den valgte"],
      [[MOD, "D"], "Dupliser"],
      [[ALT, "↑"], "Flytt opp"],
      [[ALT, "↓"], "Flytt ned"],
      [["Delete"], "Slett"],
      [["⇧", "klikk"], "Velg flere på rad i seksjonslisten"],
      [[MOD, "klikk"], "Legg til eller fjern én i valget"],
    ]],
    ["Forhåndsvisning", [
      [["1"], "Desktop"],
      [["2"], "Nettbrett"],
      [["3"], "Mobil"],
      [["Dobbeltklikk"], "Skriv rett på siden"],
      [[MOD, "B"], "Fet skrift mens du skriver"],
      [[MOD, "I"], "Kursiv mens du skriver"],
      [["Esc"], "Ferdig med å skrive"],
    ]],
  ];

  function hasTextSelection(win) {
    var sel = (win || window).getSelection && (win || window).getSelection();
    return !!(sel && String(sel).length);
  }

  function saveNow() {
    NP.store.save().then(function () {
      ui.toast("Lagret", "ok");
    }, function (err) {
      ui.toast(err.message, "err");
    });
  }

  function moveSelection(up) {
    var ids = NP.store.picked();
    if (ids.length > 1) return NP.store.moveSections(ids, up ? -1 : 1);
    var sel = ids[0];
    var secs = NP.store.page().sections;
    var at = secs.findIndex(function (x) { return x.id === sel; });
    var to = at + (up ? -1 : 1);
    if (to >= 0 && to < secs.length) NP.store.moveSection(sel, to);
  }

  /**
   * One keydown, from the editor or from the preview frame (`win` is the
   * window the key was pressed in, for its text selection).
   */
  function handle(e, win) {
    if (document.querySelector(".nx-modal-bg")) return;
    if (!NP.store.get()) return;
    var typing = window.WPE.util.isTyping(e.target);
    var mod = e.metaKey || e.ctrlKey;
    var key = (e.key || "").toLowerCase();
    if (mod && key === "s") {
      e.preventDefault();
      return saveNow();
    }
    if (typing) return;
    if (mod && key === "z") {
      e.preventDefault();
      if (e.shiftKey) NP.store.redo();
      else NP.store.undo();
      return;
    }
    if (mod && key === "y") {
      e.preventDefault();
      return NP.store.redo();
    }
    var ids = NP.store.picked();
    var sel = NP.store.get().selected;
    // Ctrl+C with text marked on the page copies the text, as everywhere else.
    if (mod && key === "c" && ids.length && !hasTextSelection(win)) {
      e.preventDefault();
      if (e.altKey && sel) NP.sections.copyStyle(sel);
      else NP.sections.copy(ids);
      return;
    }
    if (mod && key === "v") {
      e.preventDefault();
      if (e.altKey && sel) NP.sections.pasteStyle(sel);
      else NP.sections.paste(ids[ids.length - 1] || null);
      return;
    }
    if (mod && key === "d" && ids.length) {
      e.preventDefault();
      if (ids.length > 1) NP.store.duplicateSections(ids);
      else NP.store.duplicateSection(sel);
      return;
    }
    if (ids.length && e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      return moveSelection(e.key === "ArrowUp");
    }
    if ((e.key === "Delete" || e.key === "Backspace") && ids.length) {
      e.preventDefault();
      return NP.sections.remove(ids);
    }
    if (mod || e.altKey) return;
    if (e.key === "Escape" && ids.length) return NP.store.select(null);
    if (e.key === "?") {
      e.preventDefault();
      return open();
    }
    if (e.key === "1") NP.store.setDevice("desktop");
    if (e.key === "2") NP.store.setDevice("tablet");
    if (e.key === "3") NP.store.setDevice("mobile");
  }

  function keys(list) {
    var out = h("span.nx-keys");
    list.forEach(function (k, i) {
      if (i) out.appendChild(h("span.nx-keys__plus", { "aria-hidden": "true" }, "+"));
      out.appendChild(h("kbd.nx-kbd", null, k));
    });
    return out;
  }

  /** The cheat sheet. */
  function open() {
    var body = h("div.nx-shortcuts");
    SHEET.forEach(function (group) {
      var dl = h("dl.nx-shortcuts__list");
      group[1].forEach(function (row) {
        dl.appendChild(h("div.nx-shortcuts__row", null, h("dt", null, keys(row[0])), h("dd", null, row[1])));
      });
      body.appendChild(h("section.nx-shortcuts__group", null, h("h3.nx-panel__h", null, group[0]), dl));
    });
    body.appendChild(h("p.nx-help.nx-shortcuts__foot", null, "Hurtigtastene virker også når du har klikket i forhåndsvisningen – men ikke mens du skriver i et felt eller rett på siden."));
    var m = ui.modal({ title: "Hurtigtaster", wide: true, body: body, actions: [ui.button("Lukk", { kind: "primary", onClick: function () { m.close(); } })] });
  }

  NP.shortcuts = { handle: handle, open: open };
})();
