/* =========================================================================
   editor/templates.js — ten starting points for a Wallpaper.

   Each template is ONE picture across both files. On the page the top banner
   sits on the background at x 460, y 0, so:
     • the background gradient is sliced: the top banner gets exactly the
       part of it that it covers (vgrad);
     • decoration that runs behind the top banner (lines, tape, the sun,
       clouds…) is copied into the top banner at the same page position
       (split) — so a line crossing the page does not stop at the banner's
       edge, it continues through it.
   Side content sits in the two strips that are always visible inside the
   safe area (x 320–460 and 1460–1600, y 0–700). Templates use shapes, text
   and icons only; photos are the designer's own.
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Doc = window.WallpaperDoc;
  var Spec = window.WallpaperSpec;

  var L = 320; // left strip
  var R = 1460; // right strip
  var SW = 140; // strip width
  var TB = Spec.get("background").site.topbanner; // {x:460, y:0, width:1000, height:300}

  // ---- helpers ----------------------------------------------------------------
  function el(type, o) {
    return Doc.createElement(type, o);
  }
  function solid(c) {
    return Doc.solid(c);
  }
  function grad(angle, a, b, kind) {
    return { type: "gradient", kind: kind || "linear", angle: angle, stops: [{ color: a, pos: 0 }, { color: b, pos: 100 }] };
  }
  function radial(c, fadeTo) {
    return { type: "gradient", kind: "radial", angle: 0, stops: [{ color: c, pos: 0 }, { color: fadeTo, pos: 100 }] };
  }
  function icon(name, o) {
    var set = WPE.util.icons();
    return el("icon", Object.assign({ icon: name, nodes: set && set.icons[name] ? set.icons[name] : [] }, o));
  }
  function text(x, y, w, t, style, extra) {
    return el("text", Object.assign({ x: x, y: y, w: w, text: t, style: Object.assign({ align: "center" }, style) }, extra));
  }
  function button(x, y, w, hgt, label, fill, style, extra) {
    return el("shape", Object.assign({
      kind: "rect", x: x, y: y, w: w, h: hgt, radius: 999, fill: fill, text: label,
      style: Object.assign({ font: "Montserrat", weight: 800, size: 14, color: "#ffffff" }, style), hover: "lift",
    }, extra));
  }
  function hline(y, color, width, extra) {
    return el("line", Object.assign({ x: 0, y: y - 6, w: 1920, h: 12, stroke: { color: color, width: width, style: "solid", cap: "butt" } }, extra));
  }

  function hex(c) {
    var s = c.slice(1);
    return [0, 2, 4].map(function (i) { return parseInt(s.substr(i, 2), 16); });
  }
  function mix(a, b, t) {
    var x = hex(a);
    var y = hex(b);
    return "#" + x.map(function (v, i) {
      return ("0" + Math.round(v + (y[i] - v) * t).toString(16)).slice(-2);
    }).join("");
  }

  /** A top-to-bottom gradient for the background, and the slice of it the top banner covers. */
  function vgrad(top, bottom) {
    var bg = Spec.get("background");
    return {
      bg: grad(180, top, bottom),
      tb: grad(180, mix(top, bottom, TB.y / bg.height), mix(top, bottom, (TB.y + TB.height) / bg.height)),
    };
  }

  function overlapsTopbanner(e) {
    var b = WPE.geom.bounds({ x: e.x, y: e.y, w: e.w, h: e.h, rot: e.rot || 0 });
    return b.x < TB.x + TB.width && b.x + b.w > TB.x && b.y < TB.y + TB.height && b.y + b.h > TB.y;
  }

  /** Decoration for the whole page, plus the copies the top banner needs to continue it. */
  function split(decor) {
    return {
      bg: decor,
      tb: decor.filter(overlapsTopbanner).map(function (e) {
        return Doc.createElement(e.type, Object.assign({}, e, { id: undefined, x: e.x - TB.x, y: e.y - TB.y }));
      }),
    };
  }

  function make(name, fills, decor, side, topContent) {
    var d = split(decor);
    return {
      name: name,
      artboards: {
        background: { bg: fills.bg, elements: d.bg.concat(side(L, "left"), side(R, "right")) },
        topbanner: { bg: fills.tb, elements: d.tb.concat(topContent) },
      },
    };
  }

  // Deterministic scatter, so a template looks the same every time it opens.
  function scatter(n, seed, fn) {
    var out = [];
    var s = seed;
    function rnd() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    }
    for (var i = 0; i < n; i++) out.push(fn(rnd, i));
    return out;
  }

  // ---- 1. Cruise, sky blue -----------------------------------------------------------
  function cruise() {
    var navy = "#12305e";
    var cloud = function (x, y, w, hgt, op) {
      return el("shape", { kind: "ellipse", x: x, y: y, w: w, h: hgt, fill: solid("#ffffff"), opacity: op || 0.7, blur: 26, name: "Sky" });
    };
    return make("Cruise – himmelblå", vgrad("#86c8f5", "#eef8ff"), [
      el("shape", { kind: "ellipse", x: 1660, y: -120, w: 360, h: 360, fill: radial("#fff3a8", "#fff3a800"), name: "Sol" }),
      cloud(-160, 560, 760, 380), cloud(1340, 540, 760, 420), cloud(520, -70, 460, 170, 0.8), cloud(1040, 36, 380, 130, 0.65),
      cloud(120, 90, 260, 90, 0.6), cloud(1640, 300, 240, 80, 0.55),
    ], function (x) {
      return [
        el("shape", { kind: "rect", x: x + 10, y: 40, w: 120, h: 100, radius: 14, fill: solid("#ffffff"), shadow: { x: 0, y: 6, blur: 18, color: "#12305e26" }, text: "DIN\nLOGO", style: { font: "Montserrat", weight: 800, size: 18, lineHeight: 1.05, color: navy } }),
        el("shape", { kind: "burst", points: 18, inner: 0.86, x: x + 10, y: 178, w: 120, h: 120, rot: -8, fill: solid("#f5c542"), text: "-40%", style: { font: "Anton", weight: 400, size: 34, color: "#111111" } }),
        text(x, 326, SW, "2-døgns cruise\nOslo–Kiel", { font: "Montserrat", weight: 700, size: 16, lineHeight: 1.2, color: navy }),
        text(x, 378, SW, "fra kr 1 499,–", { font: "Montserrat", weight: 600, size: 15, color: navy }),
        button(x + 10, 420, 120, 42, "BESTILL ›", grad(90, "#2fa84f", "#1a6b1a"), {}, { shadow: { x: 0, y: 6, blur: 14, color: "#1a6b1a55" } }),
        text(x, 474, SW, "Begrenset antall", { font: "Inter", weight: 500, size: 12, color: navy }, { opacity: 0.75 }),
      ];
    }, [
      text(48, 56, 560, "Sommerens beste\ncruisetilbud", { font: "Montserrat", weight: 800, size: 50, lineHeight: 1.05, align: "left", color: navy }),
      text(50, 180, 560, "Spar opptil 40 % – kun denne uken", { font: "Montserrat", weight: 500, size: 21, align: "left", color: "#1d4ed8" }),
      el("shape", { kind: "burst", points: 20, inner: 0.86, x: 650, y: 44, w: 150, h: 150, rot: 10, fill: solid("#f5c542"), text: "-40%", style: { font: "Anton", weight: 400, size: 44, color: "#111111" } }),
      button(806, 200, 166, 50, "BESTILL NÅ ›", grad(90, "#2fa84f", "#1a6b1a"), { size: 15 }, { shadow: { x: 0, y: 8, blur: 18, color: "#1a6b1a55" } }),
    ]);
  }

  // ---- 2. Dark premium --------------------------------------------------------------
  function premium() {
    var gold = grad(135, "#f7e7b4", "#c9a24b");
    var goldLine = "#c9a24b";
    return make("Mørk premium", vgrad("#0b1224", "#1e293b"), [
      el("shape", { kind: "ellipse", x: 120, y: 80, w: 560, h: 560, fill: radial("#c9a24b3a", "#c9a24b00"), name: "Glød" }),
      el("shape", { kind: "ellipse", x: 1240, y: 80, w: 560, h: 560, fill: radial("#c9a24b3a", "#c9a24b00"), name: "Glød" }),
      hline(24, goldLine, 1.5, { name: "Gullinje" }),
      hline(276, goldLine, 1.5, { name: "Gullinje" }),
      el("line", { x: 0, y: 364, w: 600, h: 12, rot: 90, stroke: { color: "#c9a24b66", width: 1, style: "solid", cap: "butt" }, name: "Ramme" }),
      el("line", { x: 1320, y: 364, w: 600, h: 12, rot: 90, stroke: { color: "#c9a24b66", width: 1, style: "solid", cap: "butt" }, name: "Ramme" }),
    ], function (x) {
      return [
        text(x, 52, SW, "HØSTEN 2026", { font: "Montserrat", weight: 600, size: 11, letterSpacing: 0.3, color: goldLine }),
        text(x, 90, SW, "Eksklusivt", { font: "Playfair Display", weight: 700, italic: true, size: 28, gradient: gold }),
        text(x, 144, SW, "Høstens\nkolleksjon", { font: "Montserrat", weight: 300, size: 13, lineHeight: 1.4, letterSpacing: 0.12, uppercase: true, color: "#e5e7eb" }),
        el("shape", { kind: "diamond", x: x + 58, y: 222, w: 24, h: 24, fill: gold }),
        text(x, 300, SW, "-30 %", { font: "Playfair Display", weight: 700, size: 44, color: "#ffffff" }),
        text(x, 362, SW, "på utvalgte varer", { font: "Montserrat", weight: 400, size: 13, color: "#cbd5e1" }),
        el("shape", { kind: "rect", x: x + 10, y: 408, w: 120, h: 40, radius: 2, fill: null, border: { width: 1.5, color: goldLine, style: "solid" }, text: "SE MER", style: { font: "Montserrat", weight: 600, size: 12, color: "#f7e7b4", letterSpacing: 0.22 }, hover: "brighten" }),
      ];
    }, [
      text(60, 60, 640, "Høstens kolleksjon", { font: "Playfair Display", weight: 700, italic: true, size: 62, align: "left", gradient: gold }),
      text(64, 158, 620, "NÅ OPPTIL 30 % RABATT PÅ UTVALGTE VARER", { font: "Montserrat", weight: 500, size: 15, letterSpacing: 0.16, align: "left", color: "#e5e7eb" }),
      button(62, 200, 190, 50, "HANDLE NÅ", gold, { font: "Montserrat", weight: 700, size: 14, letterSpacing: 0.2, color: "#0b1224" }, { radius: 2 }),
      el("shape", { kind: "ring", x: 790, y: 58, w: 170, h: 170, inner: 0.93, fill: gold, text: "-30 %", style: { font: "Playfair Display", weight: 700, size: 42, color: "#ffffff" } }),
    ]);
  }

  // ---- 3. Red sale --------------------------------------------------------------------
  function sale() {
    return make("Salg – rødt og gult", vgrad("#e63946", "#9d0208"), [
      el("shape", { kind: "rect", x: -120, y: 248, w: 2160, h: 14, rot: -2, fill: solid("#ffd60a"), name: "Stripe" }),
      el("shape", { kind: "rect", x: -120, y: 272, w: 2160, h: 5, rot: -2, fill: solid("#ffffff"), opacity: 0.6, name: "Stripe" }),
      el("shape", { kind: "star", points: 5, inner: 0.45, x: 40, y: 80, w: 160, h: 160, fill: solid("#ffd60a"), opacity: 0.35, rot: 12 }),
      el("shape", { kind: "star", points: 5, inner: 0.45, x: 1720, y: 520, w: 150, h: 150, fill: solid("#ffd60a"), opacity: 0.35, rot: -16 }),
    ], function (x) {
      return [
        text(x, 30, SW, "SALG", { font: "Anton", weight: 400, size: 58, color: "#ffd60a" }, { shadow: { x: 0, y: 5, blur: 0, color: "#7f1d1d" } }),
        el("shape", { kind: "rect", x: x + 5, y: 128, w: 130, h: 44, radius: 6, rot: -4, fill: solid("#111111"), text: "KUN I HELGEN", padX: 4, style: { font: "Bebas Neue", weight: 400, size: 20, color: "#ffffff", letterSpacing: 0.04 } }),
        el("shape", { kind: "ellipse", x: x + 10, y: 300, w: 120, h: 120, fill: solid("#ffffff"), text: "opptil\n-50%", style: { font: "Anton", weight: 400, size: 30, lineHeight: 1, color: "#e63946" }, shadow: { x: 0, y: 8, blur: 20, color: "#00000040" } }),
        text(x, 440, SW, "Tusenvis av varer\nsatt ned", { font: "Inter", weight: 600, size: 14, lineHeight: 1.3, color: "#ffffff" }),
        button(x + 10, 500, 120, 44, "Til salget ›", solid("#ffd60a"), { font: "Inter", weight: 800, size: 15, color: "#111111" }, { hover: "grow" }),
      ];
    }, [
      text(44, 30, 540, "STORT SALG", { font: "Anton", weight: 400, size: 110, align: "left", color: "#ffd60a" }, { shadow: { x: 0, y: 6, blur: 0, color: "#7f1d1d" } }),
      text(48, 176, 520, "Opptil 50 % på tusenvis av varer", { font: "Inter", weight: 700, size: 24, align: "left", color: "#ffffff" }),
      el("shape", { kind: "ellipse", x: 640, y: 36, w: 180, h: 180, fill: solid("#ffffff"), text: "-50%", style: { font: "Anton", weight: 400, size: 54, color: "#e63946" }, shadow: { x: 0, y: 10, blur: 24, color: "#00000040" } }),
      button(842, 186, 130, 48, "Handle ›", solid("#111111"), { font: "Inter", weight: 800, size: 18 }, { hover: "grow" }),
    ]);
  }

  // ---- 4. Black Week ------------------------------------------------------------------
  function blackWeek() {
    var tapeY = 236;
    var tape = [el("shape", { kind: "rect", x: 0, y: tapeY, w: 1920, h: 40, fill: solid("#ffd60a"), name: "Sperrebånd" })];
    for (var i = 0; i < 33; i++) {
      tape.push(el("shape", { kind: "parallelogram", x: i * 60 - 20, y: tapeY, w: 44, h: 40, fill: solid("#0a0a0a"), name: "Sperrebånd" }));
    }
    return make("Black Week", { bg: solid("#0a0a0a"), tb: solid("#0a0a0a") }, tape.concat([
      el("shape", { kind: "ellipse", x: 20, y: 380, w: 420, h: 420, fill: radial("#ffd60a22", "#ffd60a00"), name: "Glød" }),
      el("shape", { kind: "ellipse", x: 1480, y: 380, w: 420, h: 420, fill: radial("#ffd60a22", "#ffd60a00"), name: "Glød" }),
    ]), function (x) {
      return [
        text(x, 28, SW, "BLACK\nWEEK", { font: "Anton", weight: 400, size: 50, lineHeight: 0.98, color: "#ffffff" }),
        text(x, 150, SW, "Kun til søndag", { font: "Inter", weight: 600, size: 14, color: "#ffd60a" }),
        text(x, 300, SW, "-60%", { font: "Anton", weight: 400, size: 54, color: "#ffd60a" }),
        text(x, 392, SW, "på tusenvis\nav varer", { font: "Inter", weight: 500, size: 15, lineHeight: 1.3, color: "#ffffff" }),
        el("shape", { kind: "rect", x: x + 10, y: 456, w: 120, h: 46, radius: 4, fill: solid("#ffd60a"), text: "HANDLE ›", style: { font: "Inter", weight: 800, size: 16, color: "#0a0a0a" }, hover: "grow" }),
      ];
    }, [
      text(46, 26, 620, "BLACK WEEK", { font: "Anton", weight: 400, size: 120, align: "left", color: "#ffffff" }),
      text(50, 180, 560, "Årets laveste priser – kun til søndag", { font: "Inter", weight: 600, size: 20, align: "left", color: "#d4d4d4" }),
      el("shape", { kind: "tag", x: 694, y: 34, w: 256, h: 104, fill: solid("#ffd60a"), text: "-60%", style: { font: "Anton", weight: 400, size: 62, color: "#0a0a0a" }, padX: 24, padY: 0 }),
      el("shape", { kind: "rect", x: 760, y: 160, w: 190, h: 52, radius: 4, fill: solid("#ffffff"), text: "HANDLE NÅ", style: { font: "Inter", weight: 800, size: 18, color: "#0a0a0a" }, hover: "grow" }),
    ]);
  }

  // ---- 5. Summer sunset ---------------------------------------------------------------
  function summer() {
    var coral = "#f2613f";
    return make("Sommer – solnedgang", vgrad("#ff7e5f", "#feb47b"), [
      el("shape", { kind: "ellipse", x: 700, y: -220, w: 520, h: 520, fill: { type: "gradient", kind: "radial", angle: 0, stops: [{ color: "#fff6c9", pos: 0 }, { color: "#ffd166", pos: 55 }, { color: "#ffd16600", pos: 100 }] }, name: "Sol" }),
      el("shape", { kind: "ellipse", x: -240, y: 690, w: 2400, h: 420, fill: solid("#2ec4b6"), opacity: 0.85, name: "Bølge" }),
      el("shape", { kind: "ellipse", x: -120, y: 740, w: 2200, h: 420, fill: solid("#1b9aaa"), name: "Bølge" }),
      el("shape", { kind: "ellipse", x: 60, y: 60, w: 200, h: 60, fill: solid("#ffffff"), opacity: 0.35, blur: 14, name: "Sky" }),
      el("shape", { kind: "ellipse", x: 1660, y: 120, w: 220, h: 64, fill: solid("#ffffff"), opacity: 0.35, blur: 14, name: "Sky" }),
    ], function (x) {
      return [
        icon("sun", { x: x + 46, y: 30, w: 48, h: 48, color: "#ffffff", strokeWidth: 1.6 }),
        text(x, 90, SW, "Sommer-\nsalg", { font: "Pacifico", weight: 400, size: 32, lineHeight: 1.15, color: "#ffffff" }, { shadow: { x: 0, y: 3, blur: 8, color: "#b4452a66" } }),
        text(x, 196, SW, "-30%", { font: "Anton", weight: 400, size: 52, color: "#ffffff" }),
        text(x, 282, SW, "på hagemøbler\nog grill", { font: "Poppins", weight: 600, size: 15, lineHeight: 1.3, color: "#ffffff" }),
        button(x + 10, 346, 120, 44, "Handle nå", solid("#ffffff"), { font: "Poppins", weight: 700, size: 15, color: coral }),
      ];
    }, [
      text(160, 44, 680, "Sommersalg", { font: "Pacifico", weight: 400, size: 88, color: "#ffffff" }, { shadow: { x: 0, y: 4, blur: 12, color: "#b4452a66" } }),
      text(160, 176, 680, "Opptil 30 % på hagemøbler og grill", { font: "Poppins", weight: 600, size: 22, color: "#ffffff" }),
      button(400, 226, 200, 48, "Se tilbudene ›", solid("#ffffff"), { font: "Poppins", weight: 700, size: 16, color: coral }, { shadow: { x: 0, y: 8, blur: 20, color: "#b4452a44" } }),
    ]);
  }

  // ---- 6. Christmas --------------------------------------------------------------------
  function christmas() {
    var goldC = "#f5c542";
    var snow = scatter(46, 7, function (rnd) {
      var s = 4 + Math.round(rnd() * 8);
      return el("shape", { kind: "ellipse", x: Math.round(rnd() * 1910), y: Math.round(rnd() * 840), w: s, h: s, fill: solid("#ffffff"), opacity: 0.35 + rnd() * 0.45, name: "Snø" });
    });
    return make("Jul – grønn og gull", vgrad("#0f3d2e", "#072319"), snow.concat([
      el("shape", { kind: "star", points: 5, inner: 0.42, x: 70, y: 70, w: 90, h: 90, fill: solid(goldC), opacity: 0.8, rot: -10 }),
      el("shape", { kind: "star", points: 5, inner: 0.42, x: 1740, y: 90, w: 70, h: 70, fill: solid(goldC), opacity: 0.8, rot: 12 }),
    ]), function (x) {
      return [
        icon("gift", { x: x + 40, y: 36, w: 60, h: 60, color: goldC, strokeWidth: 1.5 }),
        text(x, 112, SW, "God jul", { font: "Dancing Script", weight: 700, size: 40, color: "#ffffff" }),
        el("line", { x: x + 35, y: 170, w: 70, h: 12, stroke: { color: goldC, width: 1.5, style: "solid", cap: "round" } }),
        text(x, 196, SW, "-25%", { font: "DM Serif Display", weight: 400, size: 52, color: goldC }),
        text(x, 266, SW, "på alle\njulegaver", { font: "Montserrat", weight: 500, size: 15, lineHeight: 1.3, color: "#ffffff" }),
        button(x + 10, 330, 120, 44, "Kjøp gaver ›", solid("#c8102e"), { font: "Montserrat", weight: 700, size: 13 }),
      ];
    }, [
      text(56, 56, 640, "Årets julegavetips", { font: "DM Serif Display", weight: 400, size: 64, align: "left", color: "#ffffff" }),
      text(58, 146, 600, "Opptil 25 % rabatt – fri frakt til jul", { font: "Montserrat", weight: 500, size: 20, align: "left", color: "#d1fae5" }),
      button(58, 198, 200, 50, "Finn gavene ›", solid("#c8102e"), { size: 15 }),
      icon("gift", { x: 800, y: 60, w: 150, h: 150, color: goldC, strokeWidth: 1.1 }),
    ]);
  }

  // ---- 7. Travel ---------------------------------------------------------------------------
  function travel() {
    var teal = "#0e7490";
    var yellow = "#fde047";
    // A dashed flight path from the left strip up to the plane on the right —
    // straight through the top banner.
    var x0 = 400;
    var y0 = 640;
    var x1 = 1520;
    var y1 = 96;
    var len = Math.round(Math.hypot(x1 - x0, y1 - y0));
    var ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    var path = el("line", {
      x: (x0 + x1) / 2 - len / 2, y: (y0 + y1) / 2 - 12, w: len, h: 24, rot: Math.round(ang * 10) / 10,
      stroke: { color: "#ffffff", width: 3, style: "dashed", cap: "round" }, start: "circle", opacity: 0.85, name: "Flyrute",
    });
    var cloud = function (x, y, w, hgt) {
      return el("shape", { kind: "ellipse", x: x, y: y, w: w, h: hgt, fill: solid("#ffffff"), opacity: 0.55, blur: 22, name: "Sky" });
    };
    return make("Reise – sol i vinter", vgrad("#0891b2", "#a5f3fc"), [
      cloud(60, 140, 300, 90), cloud(1580, 360, 320, 100), cloud(700, 30, 360, 110), cloud(-100, 620, 600, 260), cloud(1400, 620, 640, 280),
      path,
    ], function (x, where) {
      var y = where === "right" ? 150 : 40;
      var items = [
        text(x, y, SW, "Sol i\nvinter?", { font: "Montserrat", weight: 800, size: 26, lineHeight: 1.05, color: "#ffffff" }),
        text(x, y + 72, SW, "Fly + hotell", { font: "Montserrat", weight: 500, size: 15, color: "#ecfeff" }),
        text(x, y + 104, SW, "fra", { font: "Montserrat", weight: 500, size: 13, color: "#ecfeff" }),
        text(x, y + 120, SW, "3 999,–", { font: "Montserrat", weight: 800, size: 28, color: yellow }),
        button(x + 10, y + 172, 120, 44, "Bestill ›", solid("#ffffff"), { size: 15, color: teal }),
      ];
      if (where === "right") items.unshift(icon("plane", { x: x + 44, y: 60, w: 52, h: 52, color: "#ffffff", strokeWidth: 1.6 }));
      return items;
    }, [
      text(48, 50, 580, "Sol i vinter?", { font: "Montserrat", weight: 800, size: 62, align: "left", color: "#ffffff" }, { shadow: { x: 0, y: 4, blur: 14, color: "#0e749066" } }),
      text(50, 136, 580, "Fly + hotell til Syden fra 3 999,–", { font: "Montserrat", weight: 600, size: 22, align: "left", color: "#ecfeff" }),
      button(50, 196, 196, 50, "Bestill reisen ›", solid("#ffffff"), { size: 16, color: teal }, { shadow: { x: 0, y: 8, blur: 20, color: "#0e749055" } }),
      el("shape", { kind: "ellipse", x: 770, y: 50, w: 180, h: 180, fill: solid(yellow), text: "fra\n3 999,–", style: { font: "Montserrat", weight: 800, size: 26, lineHeight: 1.1, color: teal }, shadow: { x: 0, y: 10, blur: 24, color: "#0e749055" } }),
    ]);
  }

  // ---- 8. Fresh & green -----------------------------------------------------------------------
  function fresh() {
    var dark = "#14532d";
    var green = "#16a34a";
    return make("Frisk og grønn", { bg: solid("#eef6e7"), tb: solid("#eef6e7") }, [
      el("shape", { kind: "ellipse", x: -180, y: -140, w: 580, h: 520, fill: solid("#cfe9c4"), name: "Form" }),
      el("shape", { kind: "ellipse", x: 1480, y: 540, w: 640, h: 540, fill: solid("#d6eecb"), name: "Form" }),
      el("shape", { kind: "ellipse", x: 1180, y: -170, w: 440, h: 400, fill: solid("#dcf1d3"), name: "Form" }),
      el("shape", { kind: "ellipse", x: -120, y: 640, w: 420, h: 360, fill: solid("#dcf1d3"), name: "Form" }),
    ], function (x) {
      return [
        text(x, 40, SW, "UKENS\nKUPP", { font: "Bricolage Grotesque", weight: 800, size: 30, lineHeight: 1, color: dark }),
        el("shape", { kind: "tag", x: x + 5, y: 124, w: 130, h: 58, fill: solid("#f5c542"), text: "39,90", style: { font: "Bricolage Grotesque", weight: 800, size: 26, color: dark }, padX: 12, padY: 0 }),
        text(x, 202, SW, "Økologiske\nepler, 1 kg", { font: "Inter", weight: 500, size: 14, lineHeight: 1.35, color: "#166534" }),
        icon("apple", { x: x + 46, y: 258, w: 48, h: 48, color: green, strokeWidth: 1.6 }),
        button(x + 10, 330, 120, 44, "Bestill ›", solid(green), { font: "Inter", weight: 700, size: 15 }),
      ];
    }, [
      text(56, 58, 620, "Fersk mat levert\npå døra", { font: "Bricolage Grotesque", weight: 800, size: 52, lineHeight: 1.02, align: "left", color: dark }),
      text(58, 186, 620, "Første levering gratis – bruk koden FERSK", { font: "Inter", weight: 500, size: 19, align: "left", color: "#166534" }),
      el("shape", { kind: "tag", x: 720, y: 44, w: 230, h: 90, fill: solid("#f5c542"), text: "Gratis\nlevering", style: { font: "Bricolage Grotesque", weight: 800, size: 24, lineHeight: 1, color: dark }, padX: 20, padY: 0, rot: -4 }),
      button(760, 170, 190, 54, "Bestill nå ›", solid(green), { font: "Inter", weight: 700, size: 17 }),
    ]);
  }

  // ---- 9. Tech neon ----------------------------------------------------------------------------
  function tech() {
    var neon = grad(90, "#22d3ee", "#ec4899");
    var grid = [];
    for (var i = 0; i < 6; i++) grid.push(hline(560 + i * 50, "#7c3aed40", 1, { name: "Rutenett" }));
    return make("Tech – neon", vgrad("#1e0b3b", "#07051a"), [
      el("shape", { kind: "ellipse", x: 520, y: -260, w: 620, h: 620, fill: radial("#ec489966", "#ec489900"), name: "Glød" }),
      el("shape", { kind: "ellipse", x: 980, y: -200, w: 560, h: 560, fill: radial("#22d3ee55", "#22d3ee00"), name: "Glød" }),
      el("shape", { kind: "ellipse", x: 80, y: 300, w: 420, h: 420, fill: radial("#7c3aed44", "#7c3aed00"), name: "Glød" }),
      el("shape", { kind: "ellipse", x: 1420, y: 300, w: 420, h: 420, fill: radial("#7c3aed44", "#7c3aed00"), name: "Glød" }),
    ].concat(grid), function (x) {
      return [
        el("shape", { kind: "rect", x: x + 26, y: 40, w: 88, h: 26, radius: 999, fill: solid("#22d3ee"), padX: 4, padY: 0, text: "NYHET", style: { font: "Space Grotesk", weight: 700, size: 12, color: "#07051a", letterSpacing: 0.1 } }),
        text(x, 84, SW, "Den nye\nmobilen", { font: "Space Grotesk", weight: 700, size: 26, lineHeight: 1.05, color: "#ffffff" }),
        text(x, 152, SW, "fra", { font: "Space Grotesk", weight: 500, size: 12, color: "#a5b4fc" }),
        text(x, 168, SW, "9 990,–", { font: "Space Grotesk", weight: 700, size: 28, gradient: neon }),
        icon("smartphone", { x: x + 45, y: 226, w: 50, h: 50, color: "#22d3ee", strokeWidth: 1.4 }),
        button(x + 10, 306, 120, 44, "Bestill ›", neon, { font: "Space Grotesk", weight: 700, size: 15 }, { shadow: { x: 0, y: 8, blur: 20, color: "#ec489955" } }),
      ];
    }, [
      text(56, 52, 660, "Neste generasjon", { font: "Unbounded", weight: 700, size: 52, align: "left", gradient: neon }),
      text(58, 140, 620, "Raskere, lysere og smartere – nå i butikk", { font: "Space Grotesk", weight: 500, size: 20, align: "left", color: "#c7d2fe" }),
      button(58, 196, 214, 52, "Forhåndsbestill ›", neon, { font: "Space Grotesk", weight: 700, size: 16 }, { shadow: { x: 0, y: 10, blur: 24, color: "#ec489966" } }),
      icon("smartphone", { x: 800, y: 60, w: 150, h: 150, color: "#22d3ee", strokeWidth: 1.1 }),
    ]);
  }

  // ---- 10. Nordic minimal ------------------------------------------------------------------------
  function nordic() {
    var ink = "#1f2937";
    return make("Nordisk minimal", { bg: solid("#f5f1ea"), tb: solid("#f5f1ea") }, [
      hline(290, ink, 1, { name: "Linje" }),
      el("shape", { kind: "ellipse", x: 1540, y: 440, w: 360, h: 360, fill: null, border: { width: 1.5, color: "#c2b8a3", style: "solid" }, name: "Sirkel" }),
      el("shape", { kind: "ellipse", x: 30, y: 420, w: 300, h: 300, fill: solid("#ebe3d6"), name: "Sirkel" }),
      el("shape", { kind: "semicircle", x: 1040, y: 210, w: 160, h: 80, fill: solid("#e4d8c4"), name: "Halvsirkel" }),
    ], function (x) {
      return [
        text(x, 40, SW, "Nytt i\nbutikk", { font: "Fraunces", weight: 600, italic: true, size: 30, lineHeight: 1.05, color: ink }),
        el("line", { x: x + 45, y: 114, w: 50, h: 12, stroke: { color: ink, width: 1, style: "solid", cap: "butt" } }),
        text(x, 140, SW, "HØST 2026", { font: "Inter", weight: 600, size: 11, letterSpacing: 0.28, color: "#6b5e4b" }),
        text(x, 312, SW, "Myke tekstiler,\nvarme farger.", { font: "Inter", weight: 400, size: 14, lineHeight: 1.45, color: "#374151" }),
        el("shape", { kind: "rect", x: x + 10, y: 380, w: 120, h: 42, radius: 0, fill: null, border: { width: 1.5, color: ink, style: "solid" }, text: "UTFORSK", style: { font: "Inter", weight: 600, size: 12, letterSpacing: 0.2, color: ink }, hover: "dim" }),
      ];
    }, [
      text(60, 70, 640, "Enkel. Varm. Nordisk.", { font: "Fraunces", weight: 600, size: 54, align: "left", color: ink }),
      text(62, 146, 560, "Høstens kolleksjon er her – se nyhetene i butikk og på nett.", { font: "Inter", weight: 400, size: 18, align: "left", color: "#4b5563" }),
      el("shape", { kind: "rect", x: 62, y: 206, w: 170, h: 48, radius: 0, fill: solid(ink), text: "UTFORSK", style: { font: "Inter", weight: 600, size: 13, letterSpacing: 0.2, color: "#f5f1ea" }, hover: "dim" }),
    ]);
  }

  function blank() {
    return Doc.emptyDoc();
  }

  WPE.templates = [
    { id: "cruise", name: "Cruise – himmelblå", desc: "Logo, tilbudsmerke og knapp i begge sidefelt", make: cruise },
    { id: "premium", name: "Mørk premium", desc: "Gull på mørkt, gullinjer gjennom hele siden", make: premium },
    { id: "sale", name: "Salg – rødt og gult", desc: "Kraftige tall og striper", make: sale },
    { id: "blackweek", name: "Black Week", desc: "Sperrebånd tvers over siden", make: blackWeek },
    { id: "summer", name: "Sommer – solnedgang", desc: "Solen bak toppbanneret, bølger nederst", make: summer },
    { id: "christmas", name: "Jul – grønn og gull", desc: "Snø over hele siden, gavetema", make: christmas },
    { id: "travel", name: "Reise – sol i vinter", desc: "Flyrute fra sidefelt til sidefelt", make: travel },
    { id: "fresh", name: "Frisk og grønn", desc: "Mat og dagligvare, prislapper", make: fresh },
    { id: "tech", name: "Tech – neon", desc: "Neon-gradienter på mørkt", make: tech },
    { id: "nordic", name: "Nordisk minimal", desc: "Lyst, luftig og elegant", make: nordic },
    { id: "blank", name: "Tomt", desc: "Start helt på nytt", make: blank },
  ];
})();
