/* =========================================================================
   doc.js — the Wallpaper design document: its shape, its defaults, and the
   one function that turns anything claiming to be a document into a safe one.

   A document is plain JSON:

     { version, name,
       artboards: {
         background: { bg: Fill, elements: [Element…] },
         topbanner:  { bg: Fill, elements: [Element…] } } }

   Element types: text · shape · line · image · icon. Every element carries
   the same frame (x, y, w, h, rot) and effects (opacity, blur, shadow, blend,
   hover); the rest depends on its type — see the DEFAULTS table below.

   normalizeDoc() is used on BOTH sides and on everything from outside: a
   project file someone opens, the IndexedDB autosave, and every request the
   server gets. It never trusts a field; unknown keys are dropped, numbers are
   clamped, colours and fonts are checked against allow-lists, and icon
   geometry is reduced to a handful of SVG attributes. The renderer can then
   assume a well-formed document and stay simple.

   Pure functions only; nothing here mutates its input.
   ========================================================================= */
(function (root, factory) {
  var fonts = typeof module === "object" && module.exports ? require("./fonts.js") : root.WallpaperFonts;
  var api = factory(fonts);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WallpaperDoc = api;
})(typeof window !== "undefined" ? window : this, function (Fonts) {
  "use strict";

  var VERSION = 1;
  var MAX_ELEMENTS = 400;
  var MAX_TEXT = 2000;

  var TYPES = ["text", "shape", "line", "image", "icon"];
  var SHAPE_KINDS = [
    "rect", "ellipse", "triangle", "diamond", "pentagon", "hexagon",
    "star", "burst", "arrow", "chevron", "bubble", "heart",
    "octagon", "parallelogram", "trapezoid", "cross", "ribbon", "tag", "shield", "semicircle", "ring",
  ];
  var BLENDS = [
    "normal", "multiply", "screen", "overlay", "darken", "lighten",
    "color-dodge", "color-burn", "soft-light", "hard-light", "difference",
  ];
  // Hover effects only exist in the HTML5 export — a PNG has no pointer.
  var HOVERS = ["none", "lift", "grow", "brighten", "dim"];
  var BORDER_STYLES = ["solid", "dashed", "dotted"];
  var LINE_ENDS = ["none", "arrow", "circle", "bar"];
  var ALIGNS = ["left", "center", "right", "justify"];
  var VALIGNS = ["top", "middle", "bottom"];
  var FITS = ["cover", "contain", "fill"];

  var ICON_TAGS = {
    path: ["d"],
    circle: ["cx", "cy", "r", "fill"],
    ellipse: ["cx", "cy", "rx", "ry"],
    rect: ["x", "y", "width", "height", "rx", "ry"],
    line: ["x1", "y1", "x2", "y2"],
    polyline: ["points"],
    polygon: ["points"],
  };
  // Geometry only: digits, path commands, separators. Nothing that could ever
  // be read as a URL, a script or markup.
  var ICON_VALUE = /^[0-9a-zA-Z.,\s+-]{0,4000}$/;

  var COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  var ASSET_ID = /^[a-f0-9]{64}\.(?:jpg|png|webp|avif|gif)$/;
  var ELEMENT_ID = /^[A-Za-z0-9_-]{1,40}$/;

  // ---- tiny helpers -------------------------------------------------------
  function isObj(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }
  function num(v, min, max, fallback) {
    var n = Number(v);
    if (!isFinite(n)) n = fallback;
    return Math.max(min, Math.min(max, n));
  }
  function round(v, digits) {
    var f = Math.pow(10, digits || 0);
    return Math.round(v * f) / f;
  }
  function oneOf(v, list, fallback) {
    return list.indexOf(v) !== -1 ? v : fallback;
  }
  function bool(v) {
    return v === true;
  }
  function str(v, max) {
    return String(v == null ? "" : v).slice(0, max);
  }
  function color(v, fallback) {
    if (v === "transparent") return v;
    return typeof v === "string" && COLOR.test(v) ? v.toLowerCase() : fallback;
  }

  var _seq = 0;
  function uid() {
    _seq = (_seq + 1) % 1e6;
    return "e" + Date.now().toString(36) + _seq.toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---- fills ---------------------------------------------------------------
  function solid(c) {
    return { type: "solid", color: c };
  }

  function normalizeStops(stops) {
    var list = Array.isArray(stops) ? stops.slice(0, 6) : [];
    var out = list
      .filter(isObj)
      .map(function (s) {
        return { color: color(s.color, "#000000"), pos: round(num(s.pos, 0, 100, 0), 1) };
      })
      .sort(function (a, b) {
        return a.pos - b.pos;
      });
    if (out.length < 2) {
      return [
        { color: "#1a6b1a", pos: 0 },
        { color: "#0f4a10", pos: 100 },
      ];
    }
    return out;
  }

  /** A fill is a solid colour or a linear/radial gradient; null = none. */
  function normalizeFill(v, fallback) {
    if (v === null) return null;
    if (!isObj(v)) return fallback === undefined ? null : fallback;
    if (v.type === "gradient") {
      return {
        type: "gradient",
        kind: oneOf(v.kind, ["linear", "radial"], "linear"),
        angle: round(num(v.angle, -360, 360, 90), 1),
        stops: normalizeStops(v.stops),
      };
    }
    return solid(color(v.color, "#000000"));
  }

  function normalizeBorder(v) {
    var b = isObj(v) ? v : {};
    return {
      width: round(num(b.width, 0, 60, 0), 1),
      color: color(b.color, "#111111"),
      style: oneOf(b.style, BORDER_STYLES, "solid"),
    };
  }

  function normalizeShadow(v) {
    if (!isObj(v)) return null;
    return {
      x: round(num(v.x, -200, 200, 0), 1),
      y: round(num(v.y, -200, 200, 6), 1),
      blur: round(num(v.blur, 0, 200, 18), 1),
      color: color(v.color, "#00000059"),
    };
  }

  // ---- text ----------------------------------------------------------------
  var TEXT_STYLE = {
    font: "Inter",
    weight: 700,
    italic: false,
    size: 56,
    lineHeight: 1.15,
    letterSpacing: 0, // em
    align: "left",
    valign: "middle",
    color: "#111111",
    gradient: null,
    uppercase: false,
    underline: false,
    strike: false,
    strokeWidth: 0,
    strokeColor: "#ffffff",
  };

  function normalizeTextStyle(v, base) {
    var s = isObj(v) ? v : {};
    var d = base || TEXT_STYLE;
    var font = Fonts.has(s.font) ? s.font : d.font;
    var italic = s.italic === undefined ? d.italic : bool(s.italic);
    var grad = normalizeFill(s.gradient === undefined ? d.gradient : s.gradient, null);
    return {
      font: font,
      weight: Fonts.nearestWeight(font, s.weight === undefined ? d.weight : s.weight, italic),
      italic: italic,
      size: round(num(s.size, 4, 800, d.size), 1),
      lineHeight: round(num(s.lineHeight, 0.6, 3, d.lineHeight), 2),
      letterSpacing: round(num(s.letterSpacing, -0.3, 1.5, d.letterSpacing), 3),
      align: oneOf(s.align, ALIGNS, d.align),
      valign: oneOf(s.valign, VALIGNS, d.valign),
      color: color(s.color, d.color),
      gradient: grad && grad.type === "gradient" ? grad : null,
      uppercase: s.uppercase === undefined ? d.uppercase : bool(s.uppercase),
      underline: s.underline === undefined ? d.underline : bool(s.underline),
      strike: s.strike === undefined ? d.strike : bool(s.strike),
      strokeWidth: round(num(s.strokeWidth, 0, 30, d.strokeWidth), 1),
      strokeColor: color(s.strokeColor, d.strokeColor),
    };
  }

  // ---- icons ---------------------------------------------------------------
  function normalizeIconNodes(nodes) {
    if (!Array.isArray(nodes)) return [];
    var out = [];
    for (var i = 0; i < nodes.length && out.length < 60; i++) {
      var node = nodes[i];
      if (!Array.isArray(node) || !Object.prototype.hasOwnProperty.call(ICON_TAGS, node[0]) || !isObj(node[1])) continue;
      var allowed = ICON_TAGS[node[0]];
      var attrs = {};
      for (var k = 0; k < allowed.length; k++) {
        var name = allowed[k];
        var val = node[1][name];
        if (val === undefined || val === null) continue;
        val = String(val);
        if (ICON_VALUE.test(val)) attrs[name] = val;
      }
      out.push([node[0], attrs]);
    }
    return out;
  }

  // ---- elements --------------------------------------------------------------
  var FRAME = {
    x: 0, y: 0, w: 200, h: 100, rot: 0,
    opacity: 1, blur: 0, shadow: null, blend: "normal", hover: "none",
    locked: false, hidden: false, name: "",
  };

  var FILTERS = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, hue: 0 };

  /** Per-type defaults; also what the "Legg til" buttons start from. */
  var DEFAULTS = {
    text: {
      w: 520, h: 70,
      text: "Skriv tekst her",
      style: TEXT_STYLE,
      fill: null, padX: 0, padY: 0, radius: 0,
      border: { width: 0, color: "#111111", style: "solid" },
    },
    shape: {
      w: 240, h: 240,
      kind: "rect",
      fill: solid("#1a6b1a"),
      border: { width: 0, color: "#111111", style: "solid" },
      radius: 0, points: 5, inner: 0.5,
      text: "",
      style: Object.assign({}, TEXT_STYLE, { size: 32, align: "center", color: "#ffffff" }),
      padX: 16, padY: 12,
    },
    line: {
      w: 320, h: 24,
      stroke: { color: "#111111", width: 4, style: "solid", cap: "round" },
      start: "none", end: "none",
    },
    image: {
      w: 400, h: 300,
      asset: "", natW: 0, natH: 0,
      fit: "cover", posX: 50, posY: 50, zoom: 1,
      flipX: false, flipY: false, radius: 0, mask: "none",
      border: { width: 0, color: "#ffffff", style: "solid" },
      filters: FILTERS,
    },
    icon: {
      w: 96, h: 96,
      icon: "star", nodes: [],
      color: "#111111", strokeWidth: 2, fill: null,
    },
  };

  var TYPE_NAMES = { text: "Tekst", shape: "Form", line: "Linje", image: "Bilde", icon: "Ikon" };

  function normalizeFrame(e, d) {
    return {
      x: round(num(e.x, -6000, 6000, FRAME.x), 2),
      y: round(num(e.y, -6000, 6000, FRAME.y), 2),
      w: round(num(e.w, 1, 8000, d.w), 2),
      h: round(num(e.h, 1, 8000, d.h), 2),
      rot: round(num(e.rot, -360, 360, 0), 2),
      opacity: round(num(e.opacity, 0, 1, 1), 3),
      blur: round(num(e.blur, 0, 100, 0), 1),
      shadow: normalizeShadow(e.shadow),
      blend: oneOf(e.blend, BLENDS, "normal"),
      hover: oneOf(e.hover, HOVERS, "none"),
      locked: bool(e.locked),
      hidden: bool(e.hidden),
      name: str(e.name, 60),
    };
  }

  var BY_TYPE = {
    text: function (e, d) {
      return {
        text: str(e.text === undefined ? d.text : e.text, MAX_TEXT),
        style: normalizeTextStyle(e.style, d.style),
        fill: normalizeFill(e.fill, null),
        padX: round(num(e.padX, 0, 400, d.padX), 1),
        padY: round(num(e.padY, 0, 400, d.padY), 1),
        radius: round(num(e.radius, 0, 999, d.radius), 1),
        border: normalizeBorder(e.border),
      };
    },
    shape: function (e, d) {
      return {
        kind: oneOf(e.kind, SHAPE_KINDS, d.kind),
        fill: normalizeFill(e.fill === undefined ? d.fill : e.fill, null),
        border: normalizeBorder(e.border),
        radius: round(num(e.radius, 0, 999, d.radius), 1),
        points: Math.round(num(e.points, 3, 40, d.points)),
        inner: round(num(e.inner, 0.1, 0.95, d.inner), 3),
        text: str(e.text, MAX_TEXT),
        style: normalizeTextStyle(e.style, d.style),
        padX: round(num(e.padX, 0, 400, d.padX), 1),
        padY: round(num(e.padY, 0, 400, d.padY), 1),
      };
    },
    line: function (e, d) {
      var s = isObj(e.stroke) ? e.stroke : {};
      return {
        stroke: {
          color: color(s.color, d.stroke.color),
          width: round(num(s.width, 0.5, 80, d.stroke.width), 1),
          style: oneOf(s.style, BORDER_STYLES, "solid"),
          cap: oneOf(s.cap, ["round", "butt", "square"], "round"),
        },
        start: oneOf(e.start, LINE_ENDS, "none"),
        end: oneOf(e.end, LINE_ENDS, "none"),
      };
    },
    image: function (e, d) {
      var f = isObj(e.filters) ? e.filters : {};
      return {
        asset: typeof e.asset === "string" && ASSET_ID.test(e.asset) ? e.asset : "",
        natW: Math.round(num(e.natW, 0, 30000, 0)),
        natH: Math.round(num(e.natH, 0, 30000, 0)),
        fit: oneOf(e.fit, FITS, d.fit),
        posX: round(num(e.posX, 0, 100, 50), 2),
        posY: round(num(e.posY, 0, 100, 50), 2),
        zoom: round(num(e.zoom, 1, 5, 1), 3),
        flipX: bool(e.flipX),
        flipY: bool(e.flipY),
        radius: round(num(e.radius, 0, 999, 0), 1),
        mask: oneOf(e.mask, ["none", "circle"], "none"),
        // Known to have no transparent pixels (measured at upload).
        opaque: bool(e.opaque),
        border: normalizeBorder(e.border),
        filters: {
          brightness: Math.round(num(f.brightness, 0, 200, 100)),
          contrast: Math.round(num(f.contrast, 0, 200, 100)),
          saturate: Math.round(num(f.saturate, 0, 300, 100)),
          grayscale: Math.round(num(f.grayscale, 0, 100, 0)),
          sepia: Math.round(num(f.sepia, 0, 100, 0)),
          hue: Math.round(num(f.hue, -180, 180, 0)),
        },
      };
    },
    icon: function (e, d) {
      return {
        icon: /^[a-z0-9-]{1,60}$/.test(e.icon) ? e.icon : d.icon,
        nodes: normalizeIconNodes(e.nodes),
        color: color(e.color, d.color),
        strokeWidth: round(num(e.strokeWidth, 0.25, 6, d.strokeWidth), 2),
        fill: e.fill === null || e.fill === undefined ? null : color(e.fill, null),
      };
    },
  };

  /** A well-formed element, or null when it cannot be one (unknown type). */
  function normalizeElement(raw) {
    if (!isObj(raw) || TYPES.indexOf(raw.type) === -1) return null;
    var d = DEFAULTS[raw.type];
    // Ids key plain objects all over the editor, so a name Object.prototype
    // already has ("constructor", "__proto__") is never kept.
    var idOk = ELEMENT_ID.test(raw.id) && !(raw.id in Object.prototype);
    var out = { id: idOk ? raw.id : uid(), type: raw.type };
    var frame = normalizeFrame(raw, d);
    var rest = BY_TYPE[raw.type](raw, d);
    Object.keys(frame).forEach(function (k) {
      out[k] = frame[k];
    });
    Object.keys(rest).forEach(function (k) {
      out[k] = rest[k];
    });
    // An image without a usable asset is nothing to draw.
    if (out.type === "image" && !out.asset) return null;
    return out;
  }

  function normalizeArtboard(raw) {
    var a = isObj(raw) ? raw : {};
    var seen = Object.create(null);
    var elements = (Array.isArray(a.elements) ? a.elements : [])
      .slice(0, MAX_ELEMENTS)
      .map(normalizeElement)
      .filter(Boolean)
      .map(function (el) {
        // Ids must be unique inside an artboard: selection, rendering and the
        // HTML5 asset names are all keyed on them.
        if (seen[el.id]) el = Object.assign({}, el, { id: uid() });
        seen[el.id] = true;
        return el;
      });
    return { bg: normalizeFill(a.bg, solid("#ffffff")) || solid("#ffffff"), elements: elements };
  }

  function emptyDoc() {
    return {
      version: VERSION,
      name: "Ny wallpaper",
      artboards: {
        background: { bg: solid("#ffffff"), elements: [] },
        topbanner: { bg: solid("#ffffff"), elements: [] },
      },
    };
  }

  function normalizeDoc(raw) {
    var d = isObj(raw) ? raw : {};
    var boards = isObj(d.artboards) ? d.artboards : {};
    return {
      version: VERSION,
      name: str(d.name, 80) || "Ny wallpaper",
      artboards: {
        background: normalizeArtboard(boards.background),
        topbanner: normalizeArtboard(boards.topbanner),
      },
    };
  }

  /** A fresh element of `type` with `overrides` applied, then normalised. */
  function createElement(type, overrides) {
    var base = Object.assign({ id: uid(), type: type }, JSON.parse(JSON.stringify(DEFAULTS[type] || {})));
    var o = overrides || {};
    var merged = Object.assign({}, base, o);
    if (o.style) merged.style = Object.assign({}, base.style, o.style);
    if (o.stroke) merged.stroke = Object.assign({}, base.stroke, o.stroke);
    if (o.filters) merged.filters = Object.assign({}, base.filters, o.filters);
    return normalizeElement(merged);
  }

  /** What an element is called in the layer list. */
  function displayName(el) {
    if (el.name) return el.name;
    if ((el.type === "text" || el.type === "shape") && el.text) {
      var t = el.text.replace(/\s+/g, " ").trim();
      if (t) return t.length > 28 ? t.slice(0, 27) + "…" : t;
    }
    if (el.type === "icon") return "Ikon · " + el.icon;
    return TYPE_NAMES[el.type] || "Element";
  }

  /** Text as it is actually drawn (text-transform included). */
  function renderedText(el) {
    var t = el.text || "";
    return el.style && el.style.uppercase ? t.toUpperCase() : t;
  }

  /**
   * Every font face an artboard draws, with the characters drawn in it —
   * exactly what the exporter needs to request a glyph subset per face.
   *
   * @returns {Array<{family:string, weight:number, italic:boolean, text:string}>}
   */
  function usedFaces(artboard) {
    var map = Object.create(null);
    (artboard.elements || []).forEach(function (el) {
      if (el.hidden || (el.type !== "text" && el.type !== "shape")) return;
      var text = renderedText(el);
      if (!text.replace(/\s/g, "")) return;
      var s = el.style;
      // Key on the face that actually gets loaded: a family with no real
      // italic at this weight is slanted from its upright face, so italic and
      // upright text share ONE font file — and must share one glyph subset.
      var italic = !!s.italic && Fonts.hasItalic(s.font, s.weight);
      var key = s.font + "|" + s.weight + "|" + (italic ? 1 : 0);
      if (!map[key]) map[key] = { family: s.font, weight: s.weight, italic: italic, chars: [] };
      // Whole code points, never UTF-16 halves: splitting an emoji's
      // surrogate pair makes the subset URL unencodable.
      Array.from(text).forEach(function (ch) {
        if (ch !== "\n" && ch !== "\r" && map[key].chars.indexOf(ch) === -1) map[key].chars.push(ch);
      });
    });
    return Object.keys(map)
      .sort()
      .map(function (k) {
        var f = map[k];
        return { family: f.family, weight: f.weight, italic: f.italic, text: " " + f.chars.join("") };
      });
  }

  /** Every asset id the document points at. */
  function usedAssets(doc) {
    var ids = {};
    ["background", "topbanner"].forEach(function (key) {
      doc.artboards[key].elements.forEach(function (el) {
        if (el.type === "image" && el.asset) ids[el.asset] = true;
      });
    });
    return Object.keys(ids);
  }

  return {
    VERSION: VERSION,
    MAX_ELEMENTS: MAX_ELEMENTS,
    TYPES: TYPES,
    SHAPE_KINDS: SHAPE_KINDS,
    BLENDS: BLENDS,
    HOVERS: HOVERS,
    BORDER_STYLES: BORDER_STYLES,
    LINE_ENDS: LINE_ENDS,
    FITS: FITS,
    TEXT_STYLE: TEXT_STYLE,
    DEFAULTS: DEFAULTS,
    ASSET_ID: ASSET_ID,
    COLOR: COLOR,
    uid: uid,
    solid: solid,
    emptyDoc: emptyDoc,
    normalizeDoc: normalizeDoc,
    normalizeArtboard: normalizeArtboard,
    normalizeElement: normalizeElement,
    normalizeFill: normalizeFill,
    normalizeTextStyle: normalizeTextStyle,
    normalizeIconNodes: normalizeIconNodes,
    createElement: createElement,
    displayName: displayName,
    renderedText: renderedText,
    usedFaces: usedFaces,
    usedAssets: usedAssets,
  };
});
