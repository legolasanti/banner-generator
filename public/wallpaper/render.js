/* =========================================================================
   render.js — draws a Wallpaper artboard as plain DOM + CSS + inline SVG.

   The one renderer behind all three outputs:
     • the editor canvas (live, element by element),
     • the Puppeteer page the PNG/JPEG is screenshotted from,
     • the markup that ships inside the HTML5 creative.
   Because they share this file, what the designer sees is what the ad server
   gets — the same guarantee the banner builder makes with banner.js.

   Every element becomes:
     <div class="wp-el wp-t-<type>" data-id>     frame: position, size,
       <div class="wp-c [wp-hv-*]">               rotation, opacity, blend,
         …content…                                blur/drop-shadow filters
       </div>
     </div>
   The inner .wp-c exists so an HTML5 hover effect can transform the content
   without fighting the element's own rotation.

   Only ever reads a NORMALISED document (doc.js): colours, fonts, numbers and
   icon geometry are already validated, and all text goes in via textContent.
   ========================================================================= */
(function (root, factory) {
  var fonts = typeof module === "object" && module.exports ? require("./fonts.js") : root.WallpaperFonts;
  var api = factory(fonts);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WallpaperRender = api;
})(typeof window !== "undefined" ? window : this, function (Fonts) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  var BASE_CSS = [
    ".wp-ab{position:relative;overflow:hidden;box-sizing:border-box;}",
    ".wp-ab *{box-sizing:border-box;}",
    ".wp-el{position:absolute;margin:0;transform-origin:50% 50%;}",
    ".wp-c{position:relative;width:100%;height:100%;}",
    ".wp-t-text>.wp-c{height:auto;}",
    ".wp-tx{display:block;margin:0;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;" +
      "font-kerning:normal;text-rendering:geometricPrecision;}",
    ".wp-box{position:absolute;inset:0;display:flex;flex-direction:column;}",
    ".wp-svg{position:absolute;left:0;top:0;overflow:visible;display:block;}",
    ".wp-clip{position:absolute;inset:0;overflow:hidden;}",
    ".wp-img{position:absolute;left:0;top:0;width:100%;height:100%;display:block;max-width:none;}",
    ".wp-hv-lift,.wp-hv-grow,.wp-hv-brighten,.wp-hv-dim{transition:transform .25s ease,filter .25s ease;}",
  ].join("\n");

  // Hover effects live in the HTML5 export only. `.ad-exit` is the click
  // area the packager wraps the whole creative in (lib/html5.js).
  var HOVER_CSS = [
    ".ad-exit:hover .wp-hv-lift{transform:translateY(-4px);}",
    ".ad-exit:hover .wp-hv-grow{transform:scale(1.05);}",
    ".ad-exit:hover .wp-hv-brighten{filter:brightness(1.12);}",
    ".ad-exit:hover .wp-hv-dim{filter:brightness(0.88);}",
  ].join("\n");

  var _gid = 0;

  // ---- colour & fill -------------------------------------------------------
  function stopsCss(stops) {
    return stops
      .map(function (s) {
        return s.color + " " + s.pos + "%";
      })
      .join(", ");
  }

  /** CSS `background` value for a fill; "transparent" for none. */
  function fillCss(fill) {
    if (!fill) return "transparent";
    if (fill.type === "solid") return fill.color;
    if (fill.kind === "radial") return "radial-gradient(ellipse closest-side at 50% 50%, " + stopsCss(fill.stops) + ")";
    return "linear-gradient(" + fill.angle + "deg, " + stopsCss(fill.stops) + ")";
  }

  function svg(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      node.setAttribute(k, attrs[k]);
    });
    return node;
  }

  /**
   * SVG paint for a fill. Gradients need a <defs> entry; the direction maths
   * mirrors CSS so a gradient looks the same on a CSS rectangle and an SVG
   * star (angle 0 = towards the top, 90 = towards the right).
   */
  function svgPaint(fill, defs) {
    if (!fill) return "none";
    if (fill.type === "solid") return fill.color;
    var id = "wpg" + (++_gid).toString(36);
    var grad;
    if (fill.kind === "radial") {
      grad = svg("radialGradient", { id: id, cx: "0.5", cy: "0.5", r: "0.5" });
    } else {
      var a = (fill.angle * Math.PI) / 180;
      var sx = Math.sin(a) / 2;
      var sy = Math.cos(a) / 2;
      grad = svg("linearGradient", {
        id: id,
        x1: (0.5 - sx).toFixed(4), y1: (0.5 + sy).toFixed(4),
        x2: (0.5 + sx).toFixed(4), y2: (0.5 - sy).toFixed(4),
      });
    }
    fill.stops.forEach(function (s) {
      grad.appendChild(svg("stop", { offset: s.pos + "%", "stop-color": s.color }));
    });
    defs.appendChild(grad);
    return "url(#" + id + ")";
  }

  function dropShadow(sh) {
    return sh ? "drop-shadow(" + sh.x + "px " + sh.y + "px " + sh.blur / 2 + "px " + sh.color + ")" : "";
  }

  function dashArray(style, width) {
    if (style === "dashed") return width * 3 + " " + width * 2;
    if (style === "dotted") return "0.01 " + width * 2;
    return "";
  }

  // ---- shape geometry ------------------------------------------------------
  function polygonPoints(n, w, h, inset, innerRatio) {
    var cx = w / 2;
    var cy = h / 2;
    var rx = w / 2 - inset;
    var ry = h / 2 - inset;
    var pts = [];
    var steps = innerRatio ? n * 2 : n;
    for (var i = 0; i < steps; i++) {
      var r = innerRatio && i % 2 === 1 ? innerRatio : 1;
      var ang = -Math.PI / 2 + (i * 2 * Math.PI) / steps;
      pts.push((cx + Math.cos(ang) * rx * r).toFixed(2) + "," + (cy + Math.sin(ang) * ry * r).toFixed(2));
    }
    return pts.join(" ");
  }

  function pts(list) {
    return list.map(function (p) { return p[0].toFixed(2) + "," + p[1].toFixed(2); }).join(" ");
  }

  /**
   * A path drawn in a 0..1 unit box, scaled into the element's inset box.
   * cmds: ["M", [x,y], "C", [x,y], [x,y], [x,y], …, "Z"]
   */
  function unitPath(cmds, x0, y0, w, h) {
    return cmds.map(function (c) {
      if (typeof c === "string") return c;
      return (x0 + c[0] * w).toFixed(2) + "," + (y0 + c[1] * h).toFixed(2);
    }).join(" ");
  }

  // A symmetric heart: two round lobes, a soft notch, a clean point.
  var HEART = [
    "M", [0.5, 0.97],
    "C", [0.36, 0.86], [0.0, 0.62], [0.0, 0.31],
    "C", [0.0, 0.13], [0.13, 0.0], [0.29, 0.0],
    "C", [0.39, 0.0], [0.46, 0.06], [0.5, 0.15],
    "C", [0.54, 0.06], [0.61, 0.0], [0.71, 0.0],
    "C", [0.87, 0.0], [1.0, 0.13], [1.0, 0.31],
    "C", [1.0, 0.62], [0.64, 0.86], [0.5, 0.97],
    "Z",
  ];

  var SHIELD = [
    "M", [0.5, 0.0],
    "C", [0.68, 0.08], [0.84, 0.1], [1.0, 0.1],
    "L", [1.0, 0.46],
    "C", [1.0, 0.74], [0.78, 0.9], [0.5, 1.0],
    "C", [0.22, 0.9], [0.0, 0.74], [0.0, 0.46],
    "L", [0.0, 0.1],
    "C", [0.16, 0.1], [0.32, 0.08], [0.5, 0.0],
    "Z",
  ];

  function ellipsePath(cx, cy, rx, ry) {
    return (
      "M" + (cx - rx) + "," + cy +
      " a" + rx + "," + ry + " 0 1,0 " + 2 * rx + ",0" +
      " a" + rx + "," + ry + " 0 1,0 " + -2 * rx + ",0 Z"
    );
  }

  /** SVG geometry for the non-rectangular shapes, inset so the stroke stays inside. */
  function shapeNode(el) {
    var w = el.w;
    var h = el.h;
    var i = el.border.width / 2;
    var R = w - i;
    var B = h - i;
    switch (el.kind) {
      case "triangle":
        return svg("polygon", { points: w / 2 + "," + i + " " + R + "," + B + " " + i + "," + B });
      case "diamond":
        return svg("polygon", { points: w / 2 + "," + i + " " + R + "," + h / 2 + " " + w / 2 + "," + B + " " + i + "," + h / 2 });
      case "pentagon":
        return svg("polygon", { points: polygonPoints(5, w, h, i) });
      case "hexagon":
        return svg("polygon", { points: polygonPoints(6, w, h, i) });
      case "star":
        return svg("polygon", { points: polygonPoints(el.points, w, h, i, el.inner) });
      case "burst":
        return svg("polygon", { points: polygonPoints(Math.max(8, el.points), w, h, i, el.inner) });
      case "arrow": {
        var head = Math.min(w * 0.45, h * 0.9);
        var t = h * 0.22;
        return svg("polygon", {
          points: [
            [i, t + i], [R - head, t + i], [R - head, i], [R, h / 2],
            [R - head, B], [R - head, B - t], [i, B - t],
          ].map(function (p) { return p[0].toFixed(2) + "," + p[1].toFixed(2); }).join(" "),
        });
      }
      case "chevron": {
        var d = Math.min(w * 0.4, h * 0.5);
        return svg("polygon", {
          points: [[i, i], [R - d, i], [R, h / 2], [R - d, B], [i, B], [i + d, h / 2]]
            .map(function (p) { return p[0].toFixed(2) + "," + p[1].toFixed(2); }).join(" "),
        });
      }
      case "bubble": {
        var body = B - h * 0.2;
        var r = Math.min(el.radius || 24, (body - i) / 2, (R - i) / 2);
        var tx = i + w * 0.18;
        return svg("path", {
          d:
            "M" + (i + r) + "," + i + " H" + (R - r) + " Q" + R + "," + i + " " + R + "," + (i + r) +
            " V" + (body - r) + " Q" + R + "," + body + " " + (R - r) + "," + body +
            " H" + (tx + w * 0.16) + " L" + tx + "," + B + " L" + (tx + w * 0.02) + "," + body +
            " H" + (i + r) + " Q" + i + "," + body + " " + i + "," + (body - r) +
            " V" + (i + r) + " Q" + i + "," + i + " " + (i + r) + "," + i + " Z",
        });
      }
      case "heart":
        return svg("path", { d: unitPath(HEART, i, i, w - 2 * i, h - 2 * i) });
      case "shield":
        return svg("path", { d: unitPath(SHIELD, i, i, w - 2 * i, h - 2 * i) });
      case "octagon": {
        var c = Math.min(w, h) * 0.2929;
        return svg("polygon", { points: pts([[i + c, i], [R - c, i], [R, i + c], [R, B - c], [R - c, B], [i + c, B], [i, B - c], [i, i + c]]) });
      }
      case "parallelogram": {
        var sk = Math.min(w * 0.25, h * 0.6);
        return svg("polygon", { points: pts([[i + sk, i], [R, i], [R - sk, B], [i, B]]) });
      }
      case "trapezoid": {
        var tp = Math.min(w * 0.22, h * 0.6);
        return svg("polygon", { points: pts([[i + tp, i], [R - tp, i], [R, B], [i, B]]) });
      }
      case "cross": {
        var t2 = Math.min(w, h) * 0.17;
        var mx = w / 2;
        var my = h / 2;
        return svg("polygon", { points: pts([
          [mx - t2, i], [mx + t2, i], [mx + t2, my - t2], [R, my - t2], [R, my + t2], [mx + t2, my + t2],
          [mx + t2, B], [mx - t2, B], [mx - t2, my + t2], [i, my + t2], [i, my - t2], [mx - t2, my - t2],
        ]) });
      }
      case "ribbon": {
        var n = Math.min(h * 0.35, w * 0.15);
        return svg("polygon", { points: pts([[i, i], [R, i], [R - n, h / 2], [R, B], [i, B], [i + n, h / 2]]) });
      }
      case "tag": {
        var pnt = Math.min(w * 0.3, h * 0.5);
        var hr = Math.min(h * 0.09, pnt * 0.3);
        var body = "M" + (i + pnt) + "," + i + " L" + R + "," + i + " L" + R + "," + B + " L" + (i + pnt) + "," + B + " L" + i + "," + h / 2 + " Z ";
        var node = svg("path", { d: body + ellipsePath(i + pnt * 0.75, h / 2, hr, hr), "fill-rule": "evenodd" });
        return node;
      }
      case "semicircle":
        return svg("path", { d: "M" + i + "," + B + " A" + (w / 2 - i) + "," + (h - 2 * i) + " 0 0 1 " + R + "," + B + " Z" });
      case "ring":
        return svg("path", {
          d: ellipsePath(w / 2, h / 2, w / 2 - i, h / 2 - i) + " " + ellipsePath(w / 2, h / 2, (w / 2 - i) * el.inner, (h / 2 - i) * el.inner),
          "fill-rule": "evenodd",
        });
      default:
        return null;
    }
  }

  // ---- text ----------------------------------------------------------------
  /** The block holding the words; shared by text elements and shape labels. */
  function textBlock(text, s, shadow) {
    var tx = document.createElement("div");
    tx.className = "wp-tx";
    var st = tx.style;
    st.fontFamily = Fonts.stack(s.font);
    st.fontWeight = String(s.weight);
    st.fontStyle = s.italic ? "italic" : "normal";
    st.fontSize = s.size + "px";
    st.lineHeight = String(s.lineHeight);
    st.letterSpacing = s.letterSpacing + "em";
    st.textAlign = s.align;
    st.textTransform = s.uppercase ? "uppercase" : "none";
    var deco = [];
    if (s.underline) deco.push("underline");
    if (s.strike) deco.push("line-through");
    st.textDecoration = deco.length ? deco.join(" ") : "none";
    if (s.gradient) {
      st.backgroundImage = fillCss(s.gradient);
      st.webkitBackgroundClip = "text";
      st.backgroundClip = "text";
      st.color = "transparent";
      st.webkitTextFillColor = "transparent";
      st.textDecorationColor = s.gradient.stops[0].color;
    } else {
      st.color = s.color;
    }
    if (s.strokeWidth > 0) {
      st.webkitTextStroke = s.strokeWidth + "px " + s.strokeColor;
      st.paintOrder = "stroke fill";
    }
    // Glyph shadow as a filter rather than text-shadow: text-shadow paints over
    // a background-clip:text gradient, a drop-shadow sits behind it correctly.
    if (shadow) st.filter = dropShadow(shadow);
    tx.textContent = text;
    return tx;
  }

  function applyBorder(st, border) {
    if (border.width > 0) st.border = border.width + "px " + border.style + " " + border.color;
  }

  var VALIGN_FLEX = { top: "flex-start", middle: "center", bottom: "flex-end" };

  // ---- element content -----------------------------------------------------
  function renderText(el, c) {
    var st = c.style;
    st.background = fillCss(el.fill);
    st.padding = el.padY + "px " + el.padX + "px";
    st.borderRadius = el.radius + "px";
    applyBorder(st, el.border);
    c.appendChild(textBlock(el.text, el.style, el.shadow));
  }

  function shapeLabel(el) {
    if (!el.text) return null;
    var box = document.createElement("div");
    box.className = "wp-box";
    box.style.justifyContent = VALIGN_FLEX[el.style.valign] || "center";
    box.style.padding = el.padY + "px " + el.padX + "px";
    box.appendChild(textBlock(el.text, el.style, null));
    return box;
  }

  function renderShape(el, c, outer) {
    if (el.kind === "rect" || el.kind === "ellipse") {
      var st = c.style;
      st.background = fillCss(el.fill);
      st.borderRadius = el.kind === "ellipse" ? "50%" : el.radius + "px";
      applyBorder(st, el.border);
      if (el.shadow) {
        st.boxShadow = el.shadow.x + "px " + el.shadow.y + "px " + el.shadow.blur + "px " + el.shadow.color;
      }
      // Border is drawn inside the box, so the label's inset has to account for it.
      var label = shapeLabel(el);
      if (label) {
        if (el.border.width) label.style.inset = -el.border.width + "px";
        c.appendChild(label);
      }
      return;
    }
    var root = svg("svg", {
      class: "wp-svg",
      width: el.w, height: el.h,
      viewBox: "0 0 " + el.w + " " + el.h,
      "aria-hidden": "true",
    });
    var defs = svg("defs");
    root.appendChild(defs);
    var node = shapeNode(el);
    if (node) {
      node.setAttribute("fill", svgPaint(el.fill, defs));
      if (el.border.width > 0) {
        node.setAttribute("stroke", el.border.color);
        node.setAttribute("stroke-width", el.border.width);
        node.setAttribute("stroke-linejoin", "round");
        var dash = dashArray(el.border.style, el.border.width);
        if (dash) node.setAttribute("stroke-dasharray", dash);
        if (el.border.style === "dotted") node.setAttribute("stroke-linecap", "round");
      }
      root.appendChild(node);
    }
    c.appendChild(root);
    if (el.shadow) outer.push(dropShadow(el.shadow));
    var label = shapeLabel(el);
    if (label) c.appendChild(label);
  }

  function renderLine(el, c, outer) {
    var s = el.stroke;
    var w = el.w;
    var h = el.h;
    var y = h / 2;
    var head = Math.max(s.width * 3, 10);
    var x0 = el.start === "arrow" ? head * 0.8 : el.start === "none" ? 0 : s.width;
    var x1 = el.end === "arrow" ? w - head * 0.8 : el.end === "none" ? w : w - s.width;
    var root = svg("svg", { class: "wp-svg", width: w, height: h, viewBox: "0 0 " + w + " " + h, "aria-hidden": "true" });
    var line = svg("line", {
      x1: x0, y1: y, x2: x1, y2: y,
      stroke: s.color, "stroke-width": s.width,
      "stroke-linecap": s.style === "dotted" ? "round" : s.cap,
    });
    var dash = dashArray(s.style, s.width);
    if (dash) line.setAttribute("stroke-dasharray", dash);
    root.appendChild(line);

    function end(kind, atStart) {
      var tip = atStart ? 0 : w;
      var dir = atStart ? 1 : -1;
      if (kind === "arrow") {
        root.appendChild(svg("polygon", {
          points: tip + "," + y + " " + (tip + dir * head) + "," + (y - head * 0.6) + " " + (tip + dir * head) + "," + (y + head * 0.6),
          fill: s.color,
        }));
      } else if (kind === "circle") {
        root.appendChild(svg("circle", { cx: tip + dir * s.width * 1.8, cy: y, r: s.width * 1.8, fill: s.color }));
      } else if (kind === "bar") {
        root.appendChild(svg("rect", {
          x: atStart ? 0 : w - s.width, y: y - head * 0.7, width: s.width, height: head * 1.4, fill: s.color,
        }));
      }
    }
    end(el.start, true);
    end(el.end, false);
    c.appendChild(root);
    if (el.shadow) outer.push(dropShadow(el.shadow));
  }

  function imageFilterCss(f) {
    var parts = [];
    if (f.brightness !== 100) parts.push("brightness(" + f.brightness / 100 + ")");
    if (f.contrast !== 100) parts.push("contrast(" + f.contrast / 100 + ")");
    if (f.saturate !== 100) parts.push("saturate(" + f.saturate / 100 + ")");
    if (f.grayscale) parts.push("grayscale(" + f.grayscale / 100 + ")");
    if (f.sepia) parts.push("sepia(" + f.sepia / 100 + ")");
    if (f.hue) parts.push("hue-rotate(" + f.hue + "deg)");
    return parts.join(" ");
  }

  function renderImage(el, c, outer, opts) {
    var clip = document.createElement("div");
    clip.className = "wp-clip";
    clip.style.borderRadius = el.mask === "circle" ? "50%" : el.radius + "px";
    var img = document.createElement("img");
    img.className = "wp-img";
    img.alt = "";
    img.draggable = false;
    img.decoding = "sync";
    img.setAttribute("data-asset", el.asset);
    img.setAttribute("data-el", el.id);
    img.src = opts.assetUrl ? opts.assetUrl(el.asset, el) : el.asset;
    var st = img.style;
    st.objectFit = el.fit;
    st.objectPosition = el.posX + "% " + el.posY + "%";
    var tf = [];
    if (el.zoom !== 1) tf.push("scale(" + el.zoom + ")");
    if (el.flipX || el.flipY) tf.push("scale(" + (el.flipX ? -1 : 1) + "," + (el.flipY ? -1 : 1) + ")");
    if (tf.length) {
      st.transform = tf.join(" ");
      st.transformOrigin = el.posX + "% " + el.posY + "%";
    }
    var fcss = imageFilterCss(el.filters);
    if (fcss) st.filter = fcss;
    clip.appendChild(img);
    c.appendChild(clip);
    if (el.border.width > 0) {
      var ring = document.createElement("div");
      ring.className = "wp-clip";
      ring.style.borderRadius = clip.style.borderRadius;
      applyBorder(ring.style, el.border);
      c.appendChild(ring);
    }
    if (el.shadow) outer.push(dropShadow(el.shadow));
  }

  function renderIcon(el, c, outer) {
    var root = svg("svg", {
      class: "wp-svg",
      width: "100%", height: "100%",
      viewBox: "0 0 24 24",
      preserveAspectRatio: "xMidYMid meet",
      fill: el.fill || "none",
      stroke: el.color,
      "stroke-width": el.strokeWidth,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    });
    root.style.color = el.color;
    root.style.width = "100%";
    root.style.height = "100%";
    el.nodes.forEach(function (n) {
      root.appendChild(svg(n[0], n[1]));
    });
    c.appendChild(root);
    if (el.shadow) outer.push(dropShadow(el.shadow));
  }

  var CONTENT = { text: renderText, shape: renderShape, line: renderLine, image: renderImage, icon: renderIcon };

  // ---- frame ---------------------------------------------------------------
  /** Position, size and rotation only — cheap enough to run on every drag frame. */
  function applyFrame(node, el) {
    var st = node.style;
    st.left = el.x + "px";
    st.top = el.y + "px";
    st.width = el.w + "px";
    st.height = el.type === "text" ? "auto" : el.h + "px";
    st.transform = el.rot ? "rotate(" + el.rot + "deg)" : "";
  }

  /**
   * Whether a change in `el` needs the content rebuilt, or only the frame.
   * SVG geometry is drawn in the element's own pixel size, so for SVG kinds a
   * resize is a content change.
   */
  function contentKey(el) {
    var copy = {};
    Object.keys(el).forEach(function (k) {
      copy[k] = el[k];
    });
    delete copy.x;
    delete copy.y;
    delete copy.rot;
    var svgSized = el.type === "line" || (el.type === "shape" && el.kind !== "rect" && el.kind !== "ellipse");
    if (!svgSized) {
      delete copy.w;
      if (el.type !== "text") delete copy.h;
    }
    if (el.type === "text") delete copy.h; // measured, never an input
    return JSON.stringify(copy);
  }

  /**
   * Build one element. `opts.assetUrl(id, el)` resolves an image asset to a
   * URL for this context (editor route, file:// in Puppeteer, package name in
   * the HTML5 export).
   */
  function renderElement(el, opts) {
    var o = opts || {};
    var node = document.createElement("div");
    node.className = "wp-el wp-t-" + el.type;
    node.setAttribute("data-id", el.id);
    applyFrame(node, el);
    var st = node.style;
    if (el.opacity !== 1) st.opacity = String(el.opacity);
    if (el.blend !== "normal") st.mixBlendMode = el.blend;
    if (el.hidden) st.display = "none";

    var c = document.createElement("div");
    c.className = "wp-c" + (el.hover !== "none" ? " wp-hv-" + el.hover : "");
    var outer = [];
    CONTENT[el.type](el, c, outer, o);
    if (el.blur) outer.push("blur(" + el.blur + "px)");
    if (outer.length) st.filter = outer.join(" ");
    node.appendChild(c);
    return node;
  }

  /**
   * Draw a whole artboard into `container`, replacing what was there.
   * Hidden elements are skipped entirely unless `opts.keepHidden` — the
   * editor keeps them (display:none) so toggling visibility is instant.
   */
  function renderArtboard(container, artboard, size, opts) {
    var o = opts || {};
    container.className = "wp-ab" + (o.className ? " " + o.className : "");
    container.style.width = size.width + "px";
    container.style.height = size.height + "px";
    container.style.background = fillCss(artboard.bg);
    while (container.firstChild) container.removeChild(container.firstChild);
    artboard.elements.forEach(function (el) {
      if (el.hidden && !o.keepHidden) return;
      container.appendChild(renderElement(el, o));
    });
    return container;
  }

  return {
    BASE_CSS: BASE_CSS,
    HOVER_CSS: HOVER_CSS,
    fillCss: fillCss,
    renderElement: renderElement,
    renderArtboard: renderArtboard,
    applyFrame: applyFrame,
    contentKey: contentKey,
  };
});
