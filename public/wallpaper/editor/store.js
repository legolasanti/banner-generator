/* =========================================================================
   editor/store.js — the Wallpaper editor's state and its undo history.

   The design document is IMMUTABLE: every change produces a new document
   object and shares everything it did not touch. That makes undo cheap and
   exact — a history entry is just a reference to an earlier document.

   Undo works on checkpoints, not on individual updates: an interaction calls
   checkpoint() once when it starts (pointerdown on a handle, focus on an
   input) and may then update the document dozens of times while the pointer
   moves or the slider slides. One Ctrl+Z takes all of it back.

   Everything else (which artboard, what is selected, zoom, guides) is view
   state and lives in `view`. Listeners are told which part changed.
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Doc = window.WallpaperDoc;
  var Spec = window.WallpaperSpec;

  var MAX_HISTORY = 150;

  var state = {
    doc: Doc.emptyDoc(),
    view: {
      board: "background",
      // Both artboards on one canvas, placed as on the page. The default,
      // because a wallpaper is designed as one picture.
      combined: true,
      sel: [],
      zoom: 0.5,
      safe: true, // red safe-area frame
      site: true, // where the page covers the background
      snap: true,
      editing: null, // id of the text element being typed into
    },
  };

  var undoStack = [];
  var redoStack = [];
  var listeners = [];

  function emit(what) {
    listeners.slice().forEach(function (fn) {
      try {
        fn(what, state);
      } catch (err) {
        console.error("[wallpaper] listener failed", err);
      }
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (l) {
        return l !== fn;
      });
    };
  }

  // ---- reads -----------------------------------------------------------------
  function board() {
    return state.doc.artboards[state.view.board];
  }
  function boardSpec() {
    return Spec.get(state.view.board);
  }
  function elements() {
    return board().elements;
  }
  function byId(id) {
    var list = elements();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function selected() {
    return state.view.sel.map(byId).filter(Boolean);
  }

  // ---- history ---------------------------------------------------------------
  function checkpoint() {
    if (undoStack[undoStack.length - 1] === state.doc) return;
    undoStack.push(state.doc);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    emit("history");
  }

  function canUndo() {
    return undoStack.length > 0 && !(undoStack.length === 1 && undoStack[0] === state.doc);
  }
  function canRedo() {
    return redoStack.length > 0;
  }

  function pruneSelection() {
    var ids = {};
    elements().forEach(function (el) {
      ids[el.id] = true;
    });
    var next = state.view.sel.filter(function (id) {
      return ids[id];
    });
    if (next.length !== state.view.sel.length) state.view.sel = next;
  }

  function undo() {
    while (undoStack.length && undoStack[undoStack.length - 1] === state.doc) undoStack.pop();
    if (!undoStack.length) return false;
    redoStack.push(state.doc);
    state.doc = undoStack.pop();
    state.view.editing = null;
    pruneSelection();
    emit("doc");
    emit("history");
    return true;
  }

  function redo() {
    if (!redoStack.length) return false;
    undoStack.push(state.doc);
    state.doc = redoStack.pop();
    state.view.editing = null;
    pruneSelection();
    emit("doc");
    emit("history");
    return true;
  }

  // ---- writes ----------------------------------------------------------------
  function setDoc(doc) {
    if (doc === state.doc) return;
    state.doc = doc;
    pruneSelection();
    emit("doc");
  }

  /** New document with the current artboard's element list replaced. */
  function withElements(list, key) {
    var k = key || state.view.board;
    var boards = Object.assign({}, state.doc.artboards);
    boards[k] = Object.assign({}, boards[k], { elements: list });
    return Object.assign({}, state.doc, { artboards: boards });
  }

  function setBoardProps(patch, key) {
    var k = key || state.view.board;
    var boards = Object.assign({}, state.doc.artboards);
    boards[k] = Object.assign({}, boards[k], patch);
    setDoc(Object.assign({}, state.doc, { artboards: boards }));
  }

  /**
   * Apply `patch` (an object, or a function el → object) to the elements with
   * the given ids. Every result goes back through normalizeElement, so an
   * editor bug can never put a malformed element into the document.
   */
  function update(ids, patch) {
    var want = {};
    (Array.isArray(ids) ? ids : [ids]).forEach(function (id) {
      want[id] = true;
    });
    var changed = false;
    var next = elements().map(function (el) {
      if (!want[el.id]) return el;
      var p = typeof patch === "function" ? patch(el) : patch;
      if (!p) return el;
      var merged = Doc.normalizeElement(Object.assign({}, el, p));
      if (!merged) return el;
      changed = true;
      return merged;
    });
    if (changed) setDoc(withElements(next));
  }

  /** Shallow-merge into a nested object field (style, stroke, filters…). */
  function updateNested(ids, field, patch) {
    update(ids, function (el) {
      var out = {};
      out[field] = Object.assign({}, el[field], typeof patch === "function" ? patch(el[field], el) : patch);
      return out;
    });
  }

  function add(els, opts) {
    var list = (Array.isArray(els) ? els : [els]).map(Doc.normalizeElement).filter(Boolean);
    if (!list.length) return [];
    var cur = elements();
    if (cur.length + list.length > Doc.MAX_ELEMENTS) {
      WPE.toast && WPE.toast("Maks " + Doc.MAX_ELEMENTS + " elementer per tegneflate", "err");
      return [];
    }
    var next = opts && opts.atBottom ? list.concat(cur) : cur.concat(list);
    setDoc(withElements(next));
    select(list.map(function (el) {
      return el.id;
    }));
    return list;
  }

  function remove(ids) {
    var drop = {};
    ids.forEach(function (id) {
      drop[id] = true;
    });
    setDoc(
      withElements(
        elements().filter(function (el) {
          return !drop[el.id];
        })
      )
    );
  }

  /** Re-order: "front" | "forward" | "backward" | "back". */
  function reorder(ids, where) {
    var list = elements().slice();
    var set = {};
    ids.forEach(function (id) {
      set[id] = true;
    });
    var moving = list.filter(function (el) {
      return set[el.id];
    });
    if (!moving.length) return;
    var rest = list.filter(function (el) {
      return !set[el.id];
    });
    var next;
    if (where === "front") next = rest.concat(moving);
    else if (where === "back") next = moving.concat(rest);
    else {
      next = list.slice();
      var step = where === "forward" ? 1 : -1;
      var order = where === "forward" ? next.slice().reverse() : next.slice();
      order.forEach(function (el) {
        if (!set[el.id]) return;
        var i = next.indexOf(el);
        var j = i + step;
        if (j < 0 || j >= next.length || set[next[j].id]) return;
        next[i] = next[j];
        next[j] = el;
      });
    }
    setDoc(withElements(next));
  }

  /** Move one element to an absolute index (layer panel drag). */
  function moveTo(id, index) {
    var list = elements().slice();
    var from = list.findIndex(function (el) {
      return el.id === id;
    });
    if (from === -1) return;
    var el = list.splice(from, 1)[0];
    list.splice(Math.max(0, Math.min(list.length, index)), 0, el);
    setDoc(withElements(list));
  }

  // ---- view ------------------------------------------------------------------
  function select(ids) {
    var next = (ids || []).filter(Boolean);
    var same = next.length === state.view.sel.length && next.every(function (id, i) {
      return state.view.sel[i] === id;
    });
    if (same) return;
    state.view.sel = next;
    if (state.view.editing && next.indexOf(state.view.editing) === -1) state.view.editing = null;
    emit("sel");
  }

  function setBoard(key) {
    if (!Spec.get(key) || key === state.view.board) return;
    state.view.board = key;
    state.view.sel = [];
    state.view.editing = null;
    emit("board");
  }

  function setView(patch) {
    Object.assign(state.view, patch);
    emit("view");
  }

  /** Replace the whole document (open project, template). Undoable. */
  function load(doc, opts) {
    checkpoint();
    state.view.sel = [];
    state.view.editing = null;
    state.doc = Doc.normalizeDoc(doc);
    if (opts && opts.resetHistory) {
      undoStack = [];
      redoStack = [];
    }
    emit("doc");
    emit("sel");
    emit("history");
  }

  WPE.store = {
    state: state,
    subscribe: subscribe,
    board: board,
    boardSpec: boardSpec,
    elements: elements,
    byId: byId,
    selected: selected,
    checkpoint: checkpoint,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    setDoc: setDoc,
    setBoardProps: setBoardProps,
    update: update,
    updateNested: updateNested,
    add: add,
    remove: remove,
    reorder: reorder,
    moveTo: moveTo,
    select: select,
    setBoard: setBoard,
    setView: setView,
    load: load,
  };
})();
