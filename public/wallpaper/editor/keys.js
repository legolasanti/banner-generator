/* =========================================================================
   editor/keys.js — keyboard shortcuts and the clipboard.

   Active only while the Wallpaper tab is open and nobody is typing in a
   field. Copy/paste works across the two artboards; pasting an image from
   the system clipboard (a screenshot, an image copied in a browser) uploads
   it and places it.
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Doc = window.WallpaperDoc;
  var store = WPE.store;
  var util = WPE.util;

  var clipboard = null; // array of elements
  var pasteCount = 0;

  function clone(els, offset) {
    return els.map(function (el) {
      return Doc.normalizeElement(Object.assign({}, JSON.parse(JSON.stringify(el)), {
        id: Doc.uid(), x: el.x + offset, y: el.y + offset, locked: false,
      }));
    });
  }

  function duplicate() {
    var sel = store.selected();
    if (!sel.length) return;
    store.checkpoint();
    store.add(clone(sel, 20));
  }

  function removeSelection() {
    var ids = store.selected().filter(function (el) { return !el.locked; }).map(function (el) { return el.id; });
    if (!ids.length) {
      if (store.selected().length) WPE.toast("Elementet er låst – lås det opp først", "err");
      return;
    }
    store.checkpoint();
    store.remove(ids);
    store.select([]);
  }

  function copy() {
    var sel = store.selected();
    if (!sel.length) return false;
    clipboard = JSON.parse(JSON.stringify(sel));
    pasteCount = 0;
    return true;
  }

  function paste() {
    if (!clipboard || !clipboard.length) return;
    pasteCount += 1;
    store.checkpoint();
    store.add(clone(clipboard, 20 * pasteCount));
  }

  function nudge(dx, dy) {
    var ids = store.selected().filter(function (el) { return !el.locked; }).map(function (el) { return el.id; });
    if (!ids.length) return;
    store.checkpoint();
    store.update(ids, function (el) { return { x: el.x + dx, y: el.y + dy }; });
  }

  function onKey(e) {
    if (!WPE.main || !WPE.main.isActive()) return;
    if (document.querySelector(".wp-modal:not([hidden])")) return;
    var mod = e.metaKey || e.ctrlKey;
    var key = e.key;
    var typing = util.isTyping(e.target);

    if (mod && !e.altKey && (key === "z" || key === "Z")) {
      if (typing) return;
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (mod && (key === "y" || key === "Y")) {
      if (typing) return;
      e.preventDefault();
      store.redo();
      return;
    }
    if (mod && (key === "s" || key === "S")) {
      e.preventDefault();
      WPE.toast("Designet lagres automatisk i denne nettleseren. Bruk Prosjekt → Lagre som fil for en kopi.", "ok");
      return;
    }
    if (typing) return;

    if (mod && (key === "c" || key === "C")) {
      if (copy()) e.preventDefault();
    } else if (mod && (key === "x" || key === "X")) {
      if (copy()) { e.preventDefault(); removeSelection(); }
    } else if (mod && (key === "d" || key === "D")) {
      e.preventDefault();
      duplicate();
    } else if (mod && (key === "a" || key === "A")) {
      e.preventDefault();
      store.select(store.elements().filter(function (el) { return !el.locked && !el.hidden; }).map(function (el) { return el.id; }));
    } else if (mod && key === "]") {
      e.preventDefault();
      store.checkpoint();
      store.reorder(store.state.view.sel, e.shiftKey ? "front" : "forward");
    } else if (mod && key === "[") {
      e.preventDefault();
      store.checkpoint();
      store.reorder(store.state.view.sel, e.shiftKey ? "back" : "backward");
    } else if (mod && (key === "0")) {
      e.preventDefault();
      WPE.canvas.fit();
    } else if (mod && (key === "=" || key === "+")) {
      e.preventDefault();
      WPE.canvas.zoomBy(1.2);
    } else if (mod && key === "-") {
      e.preventDefault();
      WPE.canvas.zoomBy(1 / 1.2);
    } else if (key === "Delete" || key === "Backspace") {
      if (store.state.view.sel.length) { e.preventDefault(); removeSelection(); }
    } else if (key === "Escape") {
      store.select([]);
    } else if (key === "Enter") {
      var one = store.selected();
      if (one.length === 1 && (one[0].type === "text" || one[0].type === "shape")) {
        e.preventDefault();
        WPE.interact.startEdit(one[0].id);
      }
    } else if (key.indexOf("Arrow") === 0) {
      if (!store.state.view.sel.length) return;
      e.preventDefault();
      var step = e.shiftKey ? 10 : 1;
      if (key === "ArrowLeft") nudge(-step, 0);
      if (key === "ArrowRight") nudge(step, 0);
      if (key === "ArrowUp") nudge(0, -step);
      if (key === "ArrowDown") nudge(0, step);
    }
  }

  function onPaste(e) {
    if (!WPE.main || !WPE.main.isActive() || util.isTyping(e.target)) return;
    var items = (e.clipboardData && e.clipboardData.items) || [];
    var files = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === "file" && /^image\//.test(items[i].type)) files.push(items[i].getAsFile());
    }
    if (files.length) {
      e.preventDefault();
      files.forEach(function (f) { WPE.assets.placeFile(f); });
      return;
    }
    if (clipboard) {
      e.preventDefault();
      paste();
    }
  }

  function mount() {
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
  }

  WPE.keys = { mount: mount, duplicate: duplicate, removeSelection: removeSelection, copy: copy, paste: paste };
})();
