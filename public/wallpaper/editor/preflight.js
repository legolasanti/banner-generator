/* =========================================================================
   editor/preflight.js — checks a Wallpaper design before it ships.

   The mistakes that actually happen with this format:
     • a logo or button that sits partly outside the 1280×700 safe area,
       so it is cut off on a laptop;
     • something important placed in the middle of the background, where the
       page itself covers it;
     • a small image blown up past its own resolution;
     • type too small to read, or an element left off the artboard.
   Each finding links to the element, so fixing it is one click away.
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Doc = window.WallpaperDoc;
  var Spec = window.WallpaperSpec;
  var store = WPE.store;
  var geom = WPE.geom;
  var util = WPE.util;
  var h = util.h;

  var MIN_TEXT_PX = 11;

  function important(el) {
    return el.type === "text" || el.type === "icon" || (el.type === "shape" && !!el.text);
  }

  /**
   * How much an image is magnified on the artboard: 1 = one source pixel per
   * artboard pixel, 2 = blown up to double. 0 when the size is unknown.
   */
  function imageScale(el) {
    if (el.type !== "image" || !el.natW || !el.natH) return 0;
    var sx = (el.w * el.zoom) / el.natW;
    var sy = (el.h * el.zoom) / el.natH;
    if (el.fit === "contain") return Math.min(sx, sy);
    return Math.max(sx, sy); // cover and fill both stretch to the larger factor
  }

  /** Does `el` fully hide what is under it? Opaque images and solid rectangles only. */
  function isOpaqueCover(el) {
    if (el.hidden || el.opacity < 1 || el.blend !== "normal" || el.rot || el.blur) return false;
    if (el.type === "image") {
      return el.fit !== "contain" && !el.radius && el.mask === "none" && (el.opaque || /\.jpg$/.test(el.asset));
    }
    return el.type === "shape" && el.kind === "rect" && !el.radius &&
      !!el.fill && el.fill.type === "solid" && el.fill.color.length <= 7;
  }

  /**
   * The element that completely covers `el` on its artboard, if any — the
   * usual reason an edit "does nothing": the thing being changed is simply
   * underneath another picture.
   */
  function coveredBy(el, elements) {
    var idx = elements.indexOf(el);
    if (idx === -1 || el.hidden) return null;
    var b = geom.bounds(geom.frame(el));
    for (var i = elements.length - 1; i > idx; i--) {
      var top = elements[i];
      if (isOpaqueCover(top) && geom.contains(geom.frame(top), b)) return top;
    }
    return null;
  }

  function rect(r) {
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }

  function quote(el, key) {
    var name = "«" + Doc.displayName(el) + "»";
    if (key !== "background") return name;
    // The same element usually exists on both sides — say which one.
    var f = geom.frame(el);
    return name + (f.x + f.w / 2 < Spec.get("background").width / 2 ? " (venstre)" : " (høyre)");
  }

  function check(doc) {
    var out = [];
    Spec.ORDER.forEach(function (key) {
      var spec = Spec.get(key);
      var board = doc.artboards[key];
      var visible = board.elements.filter(function (el) { return !el.hidden; });
      var boardRect = { x: 0, y: 0, w: spec.width, h: spec.height };
      var safe = rect(spec.safe);
      if (!visible.length) {
        out.push({ level: "warn", board: key, id: null, text: spec.name + " er tom" });
        return;
      }
      var hidden = {}; // cover id → the elements it hides, reported as one finding
      visible.forEach(function (el) {
        var b = geom.bounds(geom.frame(el));
        var cover = coveredBy(el, board.elements);
        if (cover) {
          (hidden[cover.id] = hidden[cover.id] || { cover: cover, list: [] }).list.push(el);
          return;
        }
        var fullBleed = b.w >= spec.width * 0.9 && b.h >= spec.height * 0.9;
        if (!geom.intersects(b, boardRect)) {
          out.push({ level: "warn", board: key, id: el.id, text: quote(el, key) + " ligger utenfor tegneflaten" });
          return;
        }
        if (key === "background" && important(el) && !fullBleed) {
          if (!geom.intersects(b, safe)) {
            out.push({ level: "info", board: key, id: el.id, text: quote(el, key) + " ligger utenfor sikker sone – synes bare på store skjermer" });
          } else if (!geom.contains(safe, b)) {
            out.push({ level: "warn", board: key, id: el.id, text: quote(el, key) + " ligger delvis utenfor sikker sone" });
          }
          if (spec.site) {
            var covered = [rect(spec.site.topbanner), rect(spec.site.content)].some(function (r) {
              return geom.intersects(b, r);
            });
            if (covered) out.push({ level: "warn", board: key, id: el.id, text: quote(el, key) + " ligger under nettsiden og blir (delvis) skjult" });
          }
        }
        var scale = imageScale(el);
        if (scale > 1.25) {
          out.push({ level: "warn", board: key, id: el.id, text: quote(el, key) + " er forstørret til " + Math.round(scale * 100) + " % – kan bli uskarpt. Last opp en større versjon." });
        }
        if ((el.type === "text" || (el.type === "shape" && el.text)) && el.style.size < MIN_TEXT_PX) {
          out.push({ level: "info", board: key, id: el.id, text: quote(el, key) + " har svært liten tekst (" + el.style.size + " px)" });
        }
      });
      Object.keys(hidden).forEach(function (cid) {
        var h0 = hidden[cid];
        var what = h0.list.length === 1 ? quote(h0.list[0], key) + " er" : h0.list.length + " elementer er";
        out.unshift({ level: "warn", board: key, id: h0.list.length === 1 ? h0.list[0].id : cid,
          text: what + " helt skjult bak «" + Doc.displayName(h0.cover) + "» – flytt dem fremst eller bildet bakerst" });
      });
    });
    return out;
  }

  function goTo(issue) {
    store.setBoard(issue.board);
    if (issue.id) store.select([issue.id]);
  }

  function list(issues) {
    if (!issues.length) {
      return h("p.wp-pf-ok", null, util.icon("circle-check", 16), "Alt ser bra ut – ingen avvik funnet.");
    }
    return h("ul.wp-pf", null, issues.map(function (it) {
      return h("li.wp-pf__item.is-" + it.level, null,
        h("button", { type: "button", on: { click: function () { goTo(it); } } },
          util.icon(it.level === "warn" ? "triangle-alert" : "info", 15),
          h("span", null, h("b", null, Spec.get(it.board).name + ": "), it.text)
        )
      );
    }));
  }

  var sectionBody = null;

  function section() {
    sectionBody = h("div.wp-pf-host");
    fill(sectionBody);
    return WPE.controls.section("Kvalitetssjekk", [sectionBody]);
  }

  function fill(node) {
    util.clear(node);
    node.appendChild(list(check(store.state.doc)));
  }

  /** Re-run the checks into the panel section, if it is on screen. */
  function refresh() {
    if (sectionBody && sectionBody.isConnected) fill(sectionBody);
  }

  WPE.preflight = { check: check, list: list, section: section, refresh: refresh, imageScale: imageScale, coveredBy: coveredBy };
})();
