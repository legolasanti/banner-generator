/* =========================================================================
   editor/canvas.js — the Wallpaper canvas: draws the artboard(s), the guides
   and the selection, and owns zoom.

   Two ways of looking at the design:
     • one artboard at a time (Bakgrunn or Toppbanner), or
     • "Samlet" — both together, exactly where they end up on the page: the
       top banner sits on the background at x 460, y 0. Clicking an element
       makes its artboard the active one, so both can be designed in one go.

   All coordinates the rest of the editor sees are in the ACTIVE artboard's
   own pixels. In Samlet view the top banner's origin (460, 0) is added on
   the way to the screen and taken off on the way back — see origin().

   Layout (screen space):
     .wp-stage            scroll container
       .wp-world          sized to the zoomed view + margin
         .wp-boardwrap    the view's on-screen box (W·zoom × H·zoom)
           .wp-scaler     transform: scale(zoom) — artboards at 1:1 inside
             .wp-ab                  background (or the single artboard)
             .wp-tbhost > .wp-ab     top banner, positioned in Samlet view
           svg.wp-guides  safe area, page overlay, snap lines (never exported)
           .wp-sel        selection boxes and handles

   Elements are rendered incrementally: a node is rebuilt only when its
   content changes; a move or resize just rewrites its frame.
   Pointer interaction lives in interact.js.
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Render = window.WallpaperRender;
  var Spec = window.WallpaperSpec;
  var store = WPE.store;
  var geom = WPE.geom;
  var h = WPE.util.h;

  var SVG_NS = "http://www.w3.org/2000/svg";
  var PAD = 72;
  var MIN_ZOOM = 0.05;
  var MAX_ZOOM = 4;

  var dom = {};
  var nodes = { background: {}, topbanner: {} }; // board → element id → { node, key }
  var snapGuides = [];
  var hoverId = null;
  var liveLabel = null;
  var raf = 0;
  var dirty = { board: false };
  var lastMode = null;

  function assetUrl(id) {
    return "/wp-assets/" + encodeURIComponent(id);
  }

  function combined() {
    return !!store.state.view.combined;
  }

  /** The size of what the canvas shows. */
  function viewSpec() {
    return combined() ? Spec.get("background") : store.boardSpec();
  }

  /** Where the active artboard's (0,0) sits inside the view, in px. */
  function origin(board) {
    var key = board || store.state.view.board;
    if (combined() && key === "topbanner") {
      var tb = Spec.get("background").site.topbanner;
      return { x: tb.x, y: tb.y };
    }
    return { x: 0, y: 0 };
  }

  /** Which artboard a point in VIEW coordinates belongs to. */
  function boardAtView(p) {
    if (!combined()) return store.state.view.board;
    var tb = Spec.get("background").site.topbanner;
    return p.x >= tb.x && p.x <= tb.x + tb.width && p.y >= tb.y && p.y <= tb.y + tb.height ? "topbanner" : "background";
  }

  // ---- mount -----------------------------------------------------------------
  function mount(host) {
    dom.stage = host;
    dom.world = h("div.wp-world");
    dom.wrap = h("div.wp-boardwrap");
    dom.scaler = h("div.wp-scaler");
    dom.roots = { background: h("div"), topbanner: h("div") };
    dom.tbHost = h("div.wp-tbhost");
    dom.tbHost.appendChild(dom.roots.topbanner);
    dom.guides = document.createElementNS(SVG_NS, "svg");
    dom.guides.setAttribute("class", "wp-guides");
    dom.sel = h("div.wp-sel");
    dom.marquee = h("div.wp-marquee", { hidden: true });
    dom.scaler.appendChild(dom.roots.background);
    dom.scaler.appendChild(dom.tbHost);
    dom.wrap.appendChild(dom.scaler);
    dom.wrap.appendChild(dom.guides);
    dom.wrap.appendChild(dom.sel);
    dom.world.appendChild(dom.wrap);
    dom.world.appendChild(dom.marquee);
    host.appendChild(dom.world);

    store.subscribe(function (what) {
      if (what === "doc") schedule(true);
      else if (what === "board") {
        schedule(true);
        // Switching artboards by clicking in Samlet view must not jump.
        if (!combined()) requestAnimationFrame(fit);
      } else if (what === "sel" || what === "view") {
        var mode = combined();
        if (mode !== lastMode) {
          lastMode = mode;
          schedule(true);
          requestAnimationFrame(fit);
        } else schedule(false);
      }
    });
    lastMode = combined();
    WPE.fontload.onChange(function () {
      schedule(true);
    });
    window.addEventListener("resize", function () {
      schedule(false);
    });
  }

  function schedule(board) {
    if (board) dirty.board = true;
    if (raf) return;
    raf = requestAnimationFrame(flush);
  }

  function flush() {
    raf = 0;
    if (dirty.board) renderBoards();
    layout();
    drawGuides();
    drawSelection();
    dirty.board = false;
  }

  function flushNow() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    dirty.board = true;
    flush();
  }

  // ---- artboards ---------------------------------------------------------------
  function visibleBoards() {
    return combined() ? ["background", "topbanner"] : [store.state.view.board];
  }

  function renderOne(key) {
    var root = dom.roots[key];
    var board = store.state.doc.artboards[key];
    var spec = Spec.get(key);
    var map = nodes[key];
    root.className = "wp-ab";
    root.style.width = spec.width + "px";
    root.style.height = spec.height + "px";
    root.style.background = Render.fillCss(board.bg);

    var editing = store.state.view.editing;
    var keep = {};
    board.elements.forEach(function (el, i) {
      keep[el.id] = true;
      var rec = map[el.id];
      var ckey = Render.contentKey(el);
      if (rec && (rec.key === ckey || editing === el.id)) {
        Render.applyFrame(rec.node, el);
      } else {
        var node = Render.renderElement(el, { assetUrl: assetUrl });
        if (rec) root.replaceChild(node, rec.node);
        rec = map[el.id] = { node: node, key: ckey };
      }
      if (root.children[i] !== rec.node) root.insertBefore(rec.node, root.children[i] || null);
    });
    Object.keys(map).forEach(function (id) {
      if (keep[id]) return;
      map[id].node.remove();
      delete map[id];
    });
    board.elements.forEach(function (el) {
      if (el.type === "text" && map[el.id]) geom.setMeasured(el.id, map[el.id].node.offsetHeight);
    });
  }

  function renderBoards() {
    var show = visibleBoards();
    ["background", "topbanner"].forEach(function (key) {
      var on = show.indexOf(key) !== -1;
      var host = key === "topbanner" ? dom.tbHost : dom.roots.background;
      host.style.display = on ? "" : "none";
      if (on) renderOne(key);
    });
    var o = combined() ? origin("topbanner") : { x: 0, y: 0 };
    dom.tbHost.style.left = o.x + "px";
    dom.tbHost.style.top = o.y + "px";
    dom.tbHost.classList.toggle("is-placed", combined());
  }

  function nodeFor(id, board) {
    var rec = nodes[board || store.state.view.board][id];
    return rec ? rec.node : null;
  }

  /** The artboard a rendered element node belongs to. */
  function boardOfNode(node) {
    if (dom.roots.topbanner.contains(node)) return "topbanner";
    if (dom.roots.background.contains(node)) return "background";
    return null;
  }

  // ---- zoom & layout -------------------------------------------------------------
  function zoom() {
    return store.state.view.zoom;
  }

  function layout() {
    var spec = viewSpec();
    var z = zoom();
    var w = spec.width * z;
    var hgt = spec.height * z;
    var sw = dom.stage.clientWidth;
    var sh = dom.stage.clientHeight;
    var worldW = Math.max(sw, w + PAD * 2);
    var worldH = Math.max(sh, hgt + PAD * 2);
    dom.world.style.width = worldW + "px";
    dom.world.style.height = worldH + "px";
    dom.wrap.style.width = w + "px";
    dom.wrap.style.height = hgt + "px";
    dom.wrap.style.left = Math.round((worldW - w) / 2) + "px";
    dom.wrap.style.top = Math.round((worldH - hgt) / 2) + "px";
    dom.scaler.style.transform = "scale(" + z + ")";
    dom.scaler.style.width = spec.width + "px";
    dom.scaler.style.height = spec.height + "px";
  }

  /** View coordinates (Samlet: background px) of a client point. */
  function toView(clientX, clientY) {
    var r = dom.wrap.getBoundingClientRect();
    var z = zoom();
    return { x: (clientX - r.left) / z, y: (clientY - r.top) / z };
  }

  /** Active-artboard coordinates of a client point. */
  function toBoard(clientX, clientY, board) {
    var v = toView(clientX, clientY);
    var o = origin(board);
    return { x: v.x - o.x, y: v.y - o.y };
  }

  function setZoom(z, anchor) {
    var next = WPE.util.clamp(z, MIN_ZOOM, MAX_ZOOM);
    var sr = dom.stage.getBoundingClientRect();
    var a = anchor || { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 };
    var vp = toView(a.x, a.y);
    store.setView({ zoom: next });
    layout();
    var r = dom.wrap.getBoundingClientRect();
    dom.stage.scrollLeft += r.left + vp.x * next - a.x;
    dom.stage.scrollTop += r.top + vp.y * next - a.y;
    schedule(false);
  }

  function zoomBy(factor, anchor) {
    setZoom(zoom() * factor, anchor);
  }

  function fit() {
    if (!dom.stage) return;
    var spec = viewSpec();
    var sw = dom.stage.clientWidth - PAD * 2;
    var sh = dom.stage.clientHeight - PAD * 2;
    if (sw <= 0 || sh <= 0) return;
    store.setView({ zoom: WPE.util.clamp(Math.min(sw / spec.width, sh / spec.height, 1), MIN_ZOOM, 1) });
    layout();
    dom.stage.scrollLeft = (dom.world.offsetWidth - dom.stage.clientWidth) / 2;
    dom.stage.scrollTop = (dom.world.offsetHeight - dom.stage.clientHeight) / 2;
    schedule(false);
  }

  /** Centre of what is visible, in active-artboard px — where new things go. */
  function viewCenter() {
    var sr = dom.stage.getBoundingClientRect();
    var spec = store.boardSpec();
    var p = toBoard(sr.left + sr.width / 2, sr.top + sr.height / 2);
    return { x: WPE.util.clamp(p.x, 0, spec.width), y: WPE.util.clamp(p.y, 0, spec.height) };
  }

  // ---- guides ------------------------------------------------------------------
  function svgEl(tag, attrs, parent) {
    var n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) {
      n.setAttribute(k, attrs[k]);
    });
    if (parent) parent.appendChild(n);
    return n;
  }

  function label(parent, x, y, text, cls) {
    var t = svgEl("text", { x: x, y: y, class: cls || "wp-g-label" }, parent);
    t.textContent = text;
    return t;
  }

  function tag(parent, x, y, text, cls) {
    var g = svgEl("g", { class: cls }, parent);
    var w = text.length * 6.6 + 12;
    svgEl("rect", { x: x, y: y, width: w, height: 18, rx: 4 }, g);
    label(g, x + 6, y + 13, text, "wp-g-taglabel");
  }

  function drawGuides() {
    var z = zoom();
    var v = store.state.view;
    var both = combined();
    var spec = both ? Spec.get("background") : store.boardSpec();
    var g = dom.guides;
    WPE.util.clear(g);
    g.setAttribute("width", spec.width * z);
    g.setAttribute("height", spec.height * z);
    var defs = svgEl("defs", {}, g);
    var pat = svgEl("pattern", { id: "wpHatch", width: 10, height: 10, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    svgEl("rect", { width: 10, height: 10, fill: "rgba(28,33,22,0.5)" }, pat);
    svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 10, stroke: "rgba(255,255,255,0.22)", "stroke-width": 4 }, pat);

    if (v.site && spec.site) {
      var tb = spec.site.topbanner;
      var ct = spec.site.content;
      var cx = (ct.x + ct.width / 2) * z;
      // In Samlet view the real top banner is drawn there, so only the page
      // content is covered.
      if (!both) {
        svgEl("rect", { x: tb.x * z, y: tb.y * z, width: tb.width * z, height: tb.height * z, class: "wp-g-topbanner" }, g);
        label(g, cx, (tb.y + tb.height / 2) * z, "Toppbanner 1000×300 ligger her", "wp-g-label wp-g-center");
      }
      svgEl("rect", { x: ct.x * z, y: ct.y * z, width: ct.width * z, height: ct.height * z, fill: "url(#wpHatch)", class: "wp-g-content" }, g);
      label(g, cx, (ct.y + 60) * z + 10, "Nettsidens innhold dekker dette området", "wp-g-label wp-g-center");
    }

    if (v.safe) {
      var s = spec.safe;
      var full = s.x === 0 && s.y === 0 && s.width === spec.width && s.height === spec.height;
      if (!full) {
        svgEl("path", {
          d:
            "M0,0H" + spec.width * z + "V" + spec.height * z + "H0Z " +
            "M" + s.x * z + "," + s.y * z + "V" + (s.y + s.height) * z + "H" + (s.x + s.width) * z + "V" + s.y * z + "Z",
          class: "wp-g-outside",
          "fill-rule": "evenodd",
        }, g);
      }
      svgEl("rect", { x: s.x * z + 1, y: s.y * z + 1, width: s.width * z - 2, height: s.height * z - 2, class: "wp-g-safe" }, g);
      tag(g, s.x * z + 2, (s.y + s.height) * z - 21, "Sikker sone " + s.width + "×" + s.height, "wp-g-safetag");
    }

    if (both) {
      // Which artboard is being edited, and where the top banner's edges are.
      var t = Spec.get("background").site.topbanner;
      var active = v.board === "topbanner";
      svgEl("rect", {
        x: t.x * z + 0.5, y: t.y * z + 0.5, width: t.width * z - 1, height: t.height * z - 1,
        class: "wp-g-tbframe" + (active ? " is-active" : ""),
      }, g);
      tag(g, t.x * z + 2, (t.y + t.height) * z + 3, "Toppbanner 1000×300" + (active ? " · redigeres" : ""), "wp-g-tbtag" + (active ? " is-active" : ""));
    }

    var o = origin();
    var aspec = store.boardSpec();
    snapGuides.forEach(function (sg) {
      if (sg.axis === "x") svgEl("line", { x1: (o.x + sg.at) * z, y1: o.y * z, x2: (o.x + sg.at) * z, y2: (o.y + aspec.height) * z, class: "wp-g-snap" }, g);
      else svgEl("line", { x1: o.x * z, y1: (o.y + sg.at) * z, x2: (o.x + aspec.width) * z, y2: (o.y + sg.at) * z, class: "wp-g-snap" }, g);
    });
  }

  // ---- selection -----------------------------------------------------------------
  var HANDLES = {
    all: ["nw", "n", "ne", "e", "se", "s", "sw", "w"],
    text: ["nw", "ne", "e", "se", "sw", "w"],
    line: ["e", "w"],
  };

  function boxFor(el, cls) {
    var f = geom.frame(el);
    var z = zoom();
    var o = origin();
    return h("div", {
      class: cls,
      style: {
        left: (o.x + f.x) * z + "px",
        top: (o.y + f.y) * z + "px",
        width: f.w * z + "px",
        height: f.h * z + "px",
        transform: f.rot ? "rotate(" + f.rot + "deg)" : "",
      },
    });
  }

  function drawSelection() {
    var sel = store.selected();
    var v = store.state.view;
    WPE.util.clear(dom.sel);
    var z = zoom();
    var o = origin();

    if (hoverId && v.sel.indexOf(hoverId) === -1) {
      var hov = store.byId(hoverId);
      if (hov && !hov.hidden) dom.sel.appendChild(boxFor(hov, "wp-hover"));
    }
    if (!sel.length) return drawLabel();

    sel.forEach(function (el) {
      var box = boxFor(el, "wp-selbox" + (el.locked ? " is-locked" : ""));
      if (v.editing === el.id) box.classList.add("is-editing");
      if (sel.length === 1 && !el.locked && v.editing !== el.id) {
        var list = HANDLES[el.type] || HANDLES.all;
        list.forEach(function (hd) {
          box.appendChild(h("div", { class: "wp-handle wp-handle--" + hd, dataset: { handle: hd } }));
        });
        box.appendChild(h("div.wp-rotate", { dataset: { handle: "rotate" }, title: "Roter (Shift = 15° steg)" }, WPE.util.icon("rotate-cw", 12)));
      }
      if (el.locked) box.appendChild(h("div.wp-lockbadge", { title: "Låst" }, WPE.util.icon("lock", 11)));
      dom.sel.appendChild(box);
    });

    if (sel.length > 1) {
      var u = geom.unionBounds(sel);
      dom.sel.appendChild(h("div.wp-groupbox", {
        style: { left: (o.x + u.x) * z + "px", top: (o.y + u.y) * z + "px", width: u.w * z + "px", height: u.h * z + "px" },
      }));
    }
    drawLabel();
  }

  function drawLabel() {
    if (!liveLabel) return;
    var o = origin();
    var z = zoom();
    dom.sel.appendChild(h("div.wp-livelabel", { style: { left: liveLabel.x + o.x * z + "px", top: liveLabel.y + o.y * z + "px" } }, liveLabel.text));
  }

  // ---- state from interact.js -------------------------------------------------------
  function setSnapGuides(list) {
    snapGuides = list || [];
    schedule(false);
  }
  function setHover(id) {
    if (id === hoverId) return;
    hoverId = id;
    schedule(false);
  }
  function setLiveLabel(l) {
    liveLabel = l;
    schedule(false);
  }

  WPE.canvas = {
    mount: mount,
    dom: dom,
    flushNow: flushNow,
    nodeFor: nodeFor,
    boardOfNode: boardOfNode,
    boardAtView: boardAtView,
    origin: origin,
    combined: combined,
    toView: toView,
    toBoard: toBoard,
    zoom: zoom,
    setZoom: setZoom,
    zoomBy: zoomBy,
    fit: fit,
    viewCenter: viewCenter,
    setSnapGuides: setSnapGuides,
    setHover: setHover,
    setLiveLabel: setLiveLabel,
    assetUrl: assetUrl,
    MIN_ZOOM: MIN_ZOOM,
    MAX_ZOOM: MAX_ZOOM,
  };
})();
