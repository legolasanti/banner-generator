/* =========================================================================
   editor/interact.js — pointer interaction on the Wallpaper canvas.

     click            select (Shift: add/remove)
     drag element     move — snaps to the artboard, the safe area, the page
                      edges and other elements (hold Alt to move freely,
                      Shift to lock to one axis)
     drag handle      resize; rotated elements resize in their own frame so
                      the opposite side stays put. Corners keep proportions
                      for images, icons and text (Shift swaps that).
     drag ↻           rotate (Shift: 15° steps; snaps to 0/45/90… otherwise)
     drag empty area  marquee select
     double-click     edit text in place (text and shapes)
     Space / middle   pan;  Ctrl/⌘ + wheel: zoom at the pointer
     drop files       upload and place images where they land

   Locked elements are click-through on the canvas (so a locked background
   photo never steals the click); select them from the layer list.
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var store = WPE.store;
  var geom = WPE.geom;
  var canvas = WPE.canvas;

  var DRAG_THRESHOLD = 3;
  var SNAP_PX = 6; // screen px
  var ASPECT_BY_DEFAULT = { image: true, icon: true, text: true };

  var gesture = null;
  var spaceDown = false;

  function stage() {
    return canvas.dom.stage;
  }

  /**
   * Topmost unlocked, visible element under a client point, and the artboard
   * it lives on — in Samlet view that can be either one.
   * @returns {{el: Object, board: string}|null}
   */
  function hitTest(x, y) {
    var list = document.elementsFromPoint(x, y);
    for (var i = 0; i < list.length; i++) {
      var node = list[i].closest ? list[i].closest(".wp-el") : null;
      if (!node) continue;
      var board = canvas.boardOfNode(node);
      if (!board) continue;
      var id = node.getAttribute("data-id");
      var el = store.state.doc.artboards[board].elements.find(function (e) { return e.id === id; });
      if (el && !el.locked && !el.hidden) return { el: el, board: board };
    }
    return null;
  }

  /** Make `board` the active artboard (Samlet view: follows the click). */
  function activate(board) {
    if (board && board !== store.state.view.board) store.setBoard(board);
  }

  function snapEnabled(e) {
    return store.state.view.snap && !e.altKey;
  }

  // ---- move --------------------------------------------------------------------
  function beginMove(e, start) {
    var ids = store.state.view.sel.filter(function (id) {
      var el = store.byId(id);
      return el && !el.locked;
    });
    if (!ids.length) return null;
    var origin = {};
    ids.forEach(function (id) {
      var el = store.byId(id);
      origin[id] = { x: el.x, y: el.y };
    });
    var skip = {};
    ids.forEach(function (id) { skip[id] = true; });
    return {
      type: "move",
      ids: ids,
      origin: origin,
      start: start,
      box: geom.unionBounds(ids.map(store.byId)),
      targets: geom.snapTargets(store.boardSpec(), store.elements(), skip),
      started: false,
    };
  }

  function doMove(g, e) {
    var p = canvas.toBoard(e.clientX, e.clientY);
    var dx = p.x - g.start.x;
    var dy = p.y - g.start.y;
    if (!g.started) {
      if (Math.hypot(dx, dy) * canvas.zoom() < DRAG_THRESHOLD) return;
      g.started = true;
      store.checkpoint();
    }
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    var guides = [];
    if (snapEnabled(e)) {
      var moved = { x: g.box.x + dx, y: g.box.y + dy, w: g.box.w, h: g.box.h };
      var s = geom.snapBox(moved, g.targets, SNAP_PX / canvas.zoom());
      dx += e.shiftKey && dx === 0 ? 0 : s.dx;
      dy += e.shiftKey && dy === 0 ? 0 : s.dy;
      guides = s.guides;
    }
    canvas.setSnapGuides(guides);
    store.update(g.ids, function (el) {
      var o = g.origin[el.id];
      return { x: Math.round((o.x + dx) * 10) / 10, y: Math.round((o.y + dy) * 10) / 10 };
    });
    var z = canvas.zoom();
    canvas.setLiveLabel({
      text: "X " + Math.round(g.box.x + dx) + "  ·  Y " + Math.round(g.box.y + dy),
      x: (g.box.x + dx) * z,
      y: (g.box.y + dy) * z - 30,
    });
  }

  // ---- resize --------------------------------------------------------------------
  function beginResize(handle, e) {
    var el = store.selected()[0];
    if (!el || el.locked) return null;
    store.checkpoint();
    var f = geom.frame(el);
    var skip = {};
    skip[el.id] = true;
    return {
      type: "resize",
      handle: handle,
      el: el,
      f: f,
      start: canvas.toBoard(e.clientX, e.clientY),
      targets: geom.snapTargets(store.boardSpec(), store.elements(), skip),
    };
  }

  function doResize(g, e) {
    var el = g.el;
    var f = g.f;
    var p = canvas.toBoard(e.clientX, e.clientY);
    var d = geom.rotatePoint(p.x - g.start.x, p.y - g.start.y, 0, 0, -f.rot);
    var hd = g.handle;
    var sx = hd.indexOf("e") !== -1 ? 1 : hd.indexOf("w") !== -1 ? -1 : 0;
    var sy = hd.indexOf("s") !== -1 ? 1 : hd.indexOf("n") !== -1 ? -1 : 0;
    var corner = sx !== 0 && sy !== 0;
    var keep = corner ? !!ASPECT_BY_DEFAULT[el.type] !== e.shiftKey : e.shiftKey && el.type !== "text" && el.type !== "line";

    var w = f.w + sx * d.x;
    var hh = f.h + sy * d.y;
    var s = 1;
    if (keep) {
      if (corner) {
        var dw = sx * f.w;
        var dh = sy * f.h;
        s = 1 + (d.x * dw + d.y * dh) / (dw * dw + dh * dh);
      } else {
        s = sx ? w / f.w : hh / f.h;
      }
      s = Math.max(s, 8 / Math.min(f.w, f.h));
      w = f.w * s;
      hh = f.h * s;
    }
    var minW = el.type === "text" ? 24 : 4;
    w = Math.max(minW, w);
    hh = Math.max(4, hh);
    if (el.type === "text" && !keep) hh = f.h;

    // Keep the opposite side (or corner) exactly where it was.
    var cx = f.x + f.w / 2;
    var cy = f.y + f.h / 2;
    var anchor = geom.rotatePoint(cx - (sx * f.w) / 2, cy - (sy * f.h) / 2, cx, cy, f.rot);
    var off = geom.rotatePoint((sx * w) / 2, (sy * hh) / 2, 0, 0, f.rot);
    var ncx = anchor.x + off.x;
    var ncy = anchor.y + off.y;
    var x = ncx - w / 2;
    var y = ncy - hh / 2;

    var guides = [];
    if (!f.rot && !keep && snapEnabled(e)) {
      var edges = { x: sx === 1 ? [2] : sx === -1 ? [0] : [], y: sy === 1 ? [2] : sy === -1 ? [0] : [] };
      var sn = geom.snapBox({ x: x, y: y, w: w, h: hh }, g.targets, SNAP_PX / canvas.zoom(), edges);
      if (sx === 1) w += sn.dx;
      if (sx === -1) { x += sn.dx; w -= sn.dx; }
      if (sy === 1) hh += sn.dy;
      if (sy === -1) { y += sn.dy; hh -= sn.dy; }
      guides = sn.guides;
    }
    canvas.setSnapGuides(guides);

    var r = function (v) { return Math.round(v * 10) / 10; };
    var patch = { x: r(x), y: r(y), w: r(w) };
    if (el.type === "text") {
      if (keep) {
        patch.style = Object.assign({}, el.style, { size: r(el.style.size * s) });
        patch.padX = r(el.padX * s);
        patch.padY = r(el.padY * s);
        patch.radius = r(el.radius * s);
      }
    } else if (el.type !== "line") {
      patch.h = r(hh);
    }
    store.update(el.id, patch);
    var z = canvas.zoom();
    canvas.setLiveLabel({
      text: Math.round(w) + " × " + Math.round(el.type === "text" ? f.h * (keep ? s : 1) : hh),
      x: ncx * z - 40,
      y: (ncy + hh / 2) * z + 14,
    });
  }

  // ---- rotate --------------------------------------------------------------------
  function beginRotate(e) {
    var el = store.selected()[0];
    if (!el || el.locked) return null;
    store.checkpoint();
    var f = geom.frame(el);
    return { type: "rotate", el: el, c: { x: f.x + f.w / 2, y: f.y + f.h / 2 } };
  }

  function doRotate(g, e) {
    var p = canvas.toBoard(e.clientX, e.clientY);
    var deg = (Math.atan2(p.y - g.c.y, p.x - g.c.x) * 180) / Math.PI + 90;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    else {
      var near = Math.round(deg / 45) * 45;
      if (Math.abs(deg - near) < 3) deg = near;
    }
    deg = ((((deg + 180) % 360) + 360) % 360) - 180;
    store.update(g.el.id, { rot: Math.round(deg * 10) / 10 });
    var z = canvas.zoom();
    canvas.setLiveLabel({ text: Math.round(deg) + "°", x: g.c.x * z + 16, y: g.c.y * z - 12 });
  }

  // ---- marquee -------------------------------------------------------------------
  function doMarquee(g, e) {
    var p = canvas.toBoard(e.clientX, e.clientY);
    var box = {
      x: Math.min(p.x, g.start.x), y: Math.min(p.y, g.start.y),
      w: Math.abs(p.x - g.start.x), h: Math.abs(p.y - g.start.y),
    };
    var z = canvas.zoom();
    var wrap = canvas.dom.wrap;
    var m = canvas.dom.marquee;
    m.hidden = false;
    var o = canvas.origin();
    m.style.left = wrap.offsetLeft + (o.x + box.x) * z + "px";
    m.style.top = wrap.offsetTop + (o.y + box.y) * z + "px";
    m.style.width = box.w * z + "px";
    m.style.height = box.h * z + "px";
    var hits = store.elements()
      .filter(function (el) {
        return !el.locked && !el.hidden && geom.intersects(box, geom.bounds(geom.frame(el)));
      })
      .map(function (el) { return el.id; });
    var base = g.additive ? g.before : [];
    store.select(base.concat(hits.filter(function (id) { return base.indexOf(id) === -1; })));
  }

  // ---- text editing ----------------------------------------------------------------
  /** Plain text from a contenteditable, whatever the browser inserted. */
  function readEditable(node) {
    var out = "";
    (function walk(n) {
      n.childNodes.forEach(function (c) {
        if (c.nodeType === 3) out += c.data;
        else if (c.nodeName === "BR") out += "\n";
        else {
          if (/^(DIV|P)$/.test(c.nodeName) && out && !/\n$/.test(out)) out += "\n";
          walk(c);
        }
      });
    })(node);
    return out.replace(/\n$/, "");
  }

  function startEdit(id) {
    var el = store.byId(id);
    if (!el || el.locked || (el.type !== "text" && el.type !== "shape")) return;
    store.checkpoint();
    if (el.type === "shape" && !el.text) store.update(id, { text: "Tekst" });
    store.select([id]);
    // Render the current text first: while editing, the canvas leaves this
    // element's node alone so the caret survives every keystroke.
    canvas.flushNow();
    store.state.view.editing = id;
    var node = canvas.nodeFor(id);
    var tx = node && node.querySelector(".wp-tx");
    if (!tx) return;
    try {
      tx.contentEditable = "plaintext-only";
    } catch (_) {
      tx.contentEditable = "true";
    }
    if (tx.contentEditable !== "plaintext-only") tx.contentEditable = "true";
    tx.spellcheck = false;
    tx.classList.add("is-editing");
    tx.focus();
    var range = document.createRange();
    range.selectNodeContents(tx);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    function onInput() {
      store.update(id, { text: readEditable(tx) });
      if (canvas.dom && canvas.nodeFor(id)) {
        geom.setMeasured(id, canvas.nodeFor(id).offsetHeight);
      }
    }
    function onPaste(e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData("text/plain");
      document.execCommand("insertText", false, text);
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        tx.blur();
      }
      e.stopPropagation();
    }
    function finish() {
      tx.removeEventListener("input", onInput);
      tx.removeEventListener("paste", onPaste);
      tx.removeEventListener("keydown", onKey);
      tx.removeEventListener("blur", finish);
      tx.contentEditable = "false";
      tx.classList.remove("is-editing");
      var cur = store.byId(id);
      store.state.view.editing = null;
      if (cur && cur.type === "text" && !cur.text.trim()) {
        store.remove([id]);
        store.select([]);
      } else {
        store.setView({});
      }
      canvas.flushNow();
    }
    tx.addEventListener("input", onInput);
    tx.addEventListener("paste", onPaste);
    tx.addEventListener("keydown", onKey);
    tx.addEventListener("blur", finish);
    WPE.canvas.flushNow();
  }

  // ---- pointer wiring ----------------------------------------------------------------
  function onPointerDown(e) {
    var st = stage();
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      gesture = { type: "pan", x: e.clientX, y: e.clientY, sl: st.scrollLeft, st: st.scrollTop };
      st.classList.add("is-panning");
      st.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    var editing = store.state.view.editing;
    if (editing) {
      var editNode = canvas.nodeFor(editing);
      if (editNode && editNode.contains(e.target)) return; // caret placement
      document.activeElement && document.activeElement.blur();
    }
    var handle = e.target.closest && e.target.closest("[data-handle]");
    if (handle) {
      e.preventDefault();
      gesture = handle.dataset.handle === "rotate" ? beginRotate(e) : beginResize(handle.dataset.handle, e);
      if (gesture) st.setPointerCapture(e.pointerId);
      return;
    }
    var found = hitTest(e.clientX, e.clientY);
    // In Samlet view the click also decides which artboard is being edited.
    activate(found ? found.board : canvas.boardAtView(canvas.toView(e.clientX, e.clientY)));
    var hit = found ? found.el : null;
    var start = canvas.toBoard(e.clientX, e.clientY);
    st.focus({ preventScroll: true });
    if (hit) {
      var sel = store.state.view.sel;
      if (e.shiftKey) {
        store.select(sel.indexOf(hit.id) === -1 ? sel.concat(hit.id) : sel.filter(function (id) { return id !== hit.id; }));
        return;
      }
      if (sel.indexOf(hit.id) === -1) store.select([hit.id]);
      gesture = beginMove(e, start);
    } else {
      if (!e.shiftKey) store.select([]);
      gesture = { type: "marquee", start: start, additive: e.shiftKey, before: store.state.view.sel.slice(), moved: false };
    }
    if (gesture) st.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!gesture) {
      if (e.buttons === 0 && !spaceDown) {
        var hit = hitTest(e.clientX, e.clientY);
        canvas.setHover(hit && hit.board === store.state.view.board ? hit.el.id : null);
      }
      return;
    }
    if (gesture.type === "pan") {
      stage().scrollLeft = gesture.sl - (e.clientX - gesture.x);
      stage().scrollTop = gesture.st - (e.clientY - gesture.y);
    } else if (gesture.type === "move") doMove(gesture, e);
    else if (gesture.type === "resize") doResize(gesture, e);
    else if (gesture.type === "rotate") doRotate(gesture, e);
    else if (gesture.type === "marquee") doMarquee(gesture, e);
  }

  function onPointerUp(e) {
    if (!gesture) return;
    var st = stage();
    try { st.releasePointerCapture(e.pointerId); } catch (_) {}
    st.classList.remove("is-panning");
    canvas.dom.marquee.hidden = true;
    canvas.setSnapGuides([]);
    canvas.setLiveLabel(null);
    gesture = null;
  }

  function onDoubleClick(e) {
    var found = hitTest(e.clientX, e.clientY);
    if (!found) return;
    activate(found.board);
    if (found.el.type === "text" || found.el.type === "shape") startEdit(found.el.id);
  }

  function onWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    var factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022));
    canvas.zoomBy(factor, { x: e.clientX, y: e.clientY });
  }

  // ---- files dropped on the canvas -----------------------------------------------------
  function onDragOver(e) {
    if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, "Files") === -1) return;
    e.preventDefault();
    stage().classList.add("is-drop");
  }

  function onDrop(e) {
    stage().classList.remove("is-drop");
    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    e.preventDefault();
    activate(canvas.boardAtView(canvas.toView(e.clientX, e.clientY)));
    var p = canvas.toBoard(e.clientX, e.clientY);
    Array.prototype.forEach.call(files, function (file, i) {
      WPE.assets.placeFile(file, { x: p.x + i * 24, y: p.y + i * 24 });
    });
  }

  function mount() {
    var st = stage();
    st.tabIndex = 0;
    st.addEventListener("pointerdown", onPointerDown);
    st.addEventListener("pointermove", onPointerMove);
    st.addEventListener("pointerup", onPointerUp);
    st.addEventListener("pointercancel", onPointerUp);
    st.addEventListener("pointerleave", function () {
      if (!gesture) canvas.setHover(null);
    });
    st.addEventListener("dblclick", onDoubleClick);
    st.addEventListener("wheel", onWheel, { passive: false });
    st.addEventListener("dragover", onDragOver);
    st.addEventListener("dragleave", function () { st.classList.remove("is-drop"); });
    st.addEventListener("drop", onDrop);
    window.addEventListener("keydown", function (e) {
      // Space still presses a focused button or link; only on the canvas
      // (or nothing focused) does it mean "pan".
      var control = e.target && e.target.closest && e.target.closest("button, a, select, summary");
      if (e.code === "Space" && !control && !WPE.util.isTyping(e.target) && WPE.main && WPE.main.isActive()) {
        if (!spaceDown) st.classList.add("can-pan");
        spaceDown = true;
        e.preventDefault();
      }
    });
    function releaseSpace() {
      spaceDown = false;
      st.classList.remove("can-pan");
    }
    window.addEventListener("keyup", function (e) {
      if (e.code === "Space") releaseSpace();
    });
    // Released while another window had focus: the keyup never comes.
    window.addEventListener("blur", releaseSpace);
  }

  WPE.interact = { mount: mount, startEdit: startEdit, hitTest: hitTest };
})();
