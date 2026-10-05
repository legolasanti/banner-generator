/* =========================================================================
   editor/geom.js — element geometry and smart-guide snapping.

   All numbers are ARTBOARD pixels (1920×850 or 1000×300), never screen
   pixels; the canvas converts with the zoom factor at the edges.

   Text boxes grow with their content, so their real height is measured from
   the DOM after each render and kept here rather than in the document — a
   measurement is not an edit, and must not create an undo step.
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});

  var measured = {}; // element id → rendered height (text only)

  function setMeasured(id, h) {
    var changed = Math.abs((measured[id] || 0) - h) > 0.5;
    measured[id] = h;
    return changed;
  }

  /** {x, y, w, h, rot} with a text box's measured height. */
  function frame(el) {
    var h = el.type === "text" && measured[el.id] ? measured[el.id] : el.h;
    return { x: el.x, y: el.y, w: el.w, h: h, rot: el.rot || 0 };
  }

  function rotatePoint(px, py, cx, cy, deg) {
    var a = (deg * Math.PI) / 180;
    var c = Math.cos(a);
    var s = Math.sin(a);
    var dx = px - cx;
    var dy = py - cy;
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  }

  function corners(f) {
    var cx = f.x + f.w / 2;
    var cy = f.y + f.h / 2;
    return [
      rotatePoint(f.x, f.y, cx, cy, f.rot),
      rotatePoint(f.x + f.w, f.y, cx, cy, f.rot),
      rotatePoint(f.x + f.w, f.y + f.h, cx, cy, f.rot),
      rotatePoint(f.x, f.y + f.h, cx, cy, f.rot),
    ];
  }

  /** Axis-aligned bounds of a (possibly rotated) frame. */
  function bounds(f) {
    if (!f.rot) return { x: f.x, y: f.y, w: f.w, h: f.h };
    var pts = corners(f);
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var x = Math.min.apply(null, xs);
    var y = Math.min.apply(null, ys);
    return { x: x, y: y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y };
  }

  function unionBounds(list) {
    if (!list.length) return null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    list.forEach(function (el) {
      var b = bounds(frame(el));
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function contains(outer, inner) {
    return (
      inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 &&
      inner.x + inner.w <= outer.x + outer.w + 0.5 && inner.y + inner.h <= outer.y + outer.h + 0.5
    );
  }

  // ---- snapping --------------------------------------------------------------
  /**
   * Lines worth snapping to on this artboard: its edges and centre, the safe
   * area, where the page sits on the background, and every other visible
   * element's edges and centre.
   */
  function snapTargets(spec, elements, skipIds) {
    var xs = [0, spec.width / 2, spec.width];
    var ys = [0, spec.height / 2, spec.height];
    var s = spec.safe;
    xs.push(s.x, s.x + s.width, s.x + s.width / 2);
    ys.push(s.y, s.y + s.height);
    if (spec.site) {
      var c = spec.site.content;
      xs.push(c.x, c.x + c.width);
      ys.push(c.y);
      (spec.sideZones || []).forEach(function (z) {
        xs.push(z.x + z.width / 2);
      });
    }
    elements.forEach(function (el) {
      if (el.hidden || skipIds[el.id]) return;
      var b = bounds(frame(el));
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    });
    return { xs: xs, ys: ys };
  }

  function nearest(values, targets, threshold) {
    var best = null;
    values.forEach(function (v, i) {
      targets.forEach(function (t) {
        var d = t - v;
        if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d: d, at: t, which: i };
      });
    });
    return best;
  }

  /**
   * Snap a moving box. Returns the correction to apply and the guide lines to
   * draw. `edges` limits which sides may snap (resize moves only one side).
   *
   * @returns {{dx:number, dy:number, guides:Array<{axis:"x"|"y", at:number}>}}
   */
  function snapBox(box, targets, threshold, edges) {
    var e = edges || { x: [0, 1, 2], y: [0, 1, 2] };
    var xv = [box.x, box.x + box.w / 2, box.x + box.w].filter(function (_, i) { return e.x.indexOf(i) !== -1; });
    var yv = [box.y, box.y + box.h / 2, box.y + box.h].filter(function (_, i) { return e.y.indexOf(i) !== -1; });
    var sx = nearest(xv, targets.xs, threshold);
    var sy = nearest(yv, targets.ys, threshold);
    var guides = [];
    if (sx) guides.push({ axis: "x", at: sx.at });
    if (sy) guides.push({ axis: "y", at: sy.at });
    return { dx: sx ? sx.d : 0, dy: sy ? sy.d : 0, guides: guides };
  }

  WPE.geom = {
    setMeasured: setMeasured,
    frame: frame,
    corners: corners,
    bounds: bounds,
    unionBounds: unionBounds,
    intersects: intersects,
    contains: contains,
    rotatePoint: rotatePoint,
    snapTargets: snapTargets,
    snapBox: snapBox,
  };
})();
