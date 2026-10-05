/* =========================================================================
   editor/panels.js — the left rail and its drawers: templates, text,
   elements (shapes, lines, buttons), icons, images, background and layers.

   Everything a drawer adds lands in the middle of what is currently visible
   on the canvas, selected, and as one undo step.
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Doc = window.WallpaperDoc;
  var Render = window.WallpaperRender;
  var store = WPE.store;
  var util = WPE.util;
  var h = util.h;

  var dom = {};
  var current = null;
  var panelOpts = {};

  // ---- adding ------------------------------------------------------------------------
  function centered(type, o) {
    var c = WPE.canvas.viewCenter();
    var d = Doc.DEFAULTS[type];
    var w = o.w || d.w;
    var hh = o.h || d.h;
    return Doc.createElement(type, Object.assign({}, o, { x: Math.round(c.x - w / 2), y: Math.round(c.y - hh / 2), w: w, h: hh }));
  }

  function addElement(type, o) {
    var el = centered(type, o || {});
    if (!el) return null;
    if (el.style) WPE.fontload.ensure(el.style.font);
    store.checkpoint();
    store.add(el);
    return el;
  }

  /** A preset drawn by the real renderer, scaled into a tile. */
  function presetTile(el, onClick, opts) {
    var o = opts || {};
    var maxW = o.maxW || 132;
    var maxH = o.maxH || 64;
    if (el.style) WPE.fontload.ensure(el.style.font);
    var scale = Math.min(1, maxW / el.w, maxH / el.h);
    var node = Render.renderElement(Object.assign({}, el, { x: 0, y: 0 }), { assetUrl: WPE.canvas.assetUrl });
    var holder = h("div.wp-tile__art", { style: { width: el.w * scale + "px", height: el.h * scale + "px" } });
    var inner = h("div.wp-ab", { style: { width: el.w + "px", height: el.h + "px", transform: "scale(" + scale + ")", transformOrigin: "0 0", background: "transparent", overflow: "visible" } }, node);
    holder.appendChild(inner);
    return h("button.wp-tile" + (o.cls ? "." + o.cls : ""), { type: "button", title: o.title || "", on: { click: onClick } }, holder, o.label ? h("span.wp-tile__lab", null, o.label) : null);
  }

  // ---- text ----------------------------------------------------------------------------
  var TEXT_PRESETS = [
    { label: "Overskrift", o: { w: 640, text: "Legg til en overskrift", style: { font: "Montserrat", weight: 800, size: 64, lineHeight: 1.05 } } },
    { label: "Undertittel", o: { w: 520, text: "Legg til en undertittel", style: { font: "Montserrat", weight: 600, size: 32 } } },
    { label: "Brødtekst", o: { w: 420, text: "Legg til litt brødtekst", style: { font: "Inter", weight: 400, size: 20, lineHeight: 1.4 } } },
  ];

  var TEXT_COMBOS = [
    { w: 420, text: "TILBUD NÅ!", style: { font: "Anton", weight: 400, size: 72, color: "#ffd60a", strokeWidth: 3, strokeColor: "#111111" } },
    { w: 460, text: "kr 14 995,–", style: { font: "Playfair Display", weight: 700, size: 64, color: "#12305e" } },
    { w: 360, text: "Kun i dag", style: { font: "Pacifico", weight: 400, size: 54, color: "#e63946" } },
    { w: 520, text: "BLACK WEEK", style: { font: "Bebas Neue", weight: 400, size: 96, letterSpacing: 0.08, color: "#111111" } },
    { w: 700, text: "Sommerens beste pris", style: { font: "Montserrat", weight: 800, size: 52, gradient: { type: "gradient", kind: "linear", angle: 90, stops: [{ color: "#ff7a00", pos: 0 }, { color: "#e63946", pos: 100 }] } } },
    { w: 380, text: "NYHET", fill: { type: "solid", color: "#111111" }, padX: 18, padY: 6, radius: 6, style: { font: "Montserrat", weight: 800, size: 36, color: "#ffffff", letterSpacing: 0.12, align: "center" } },
    { w: 480, text: "Eksklusivt medlemstilbud", style: { font: "Cormorant Garamond", weight: 600, italic: true, size: 48, color: "#7c4a1e" } },
    { w: 420, text: "Bestill i dag →", style: { font: "Inter", weight: 700, size: 36, underline: true, color: "#1d4ed8" } },
  ];

  function textPanel() {
    var btns = TEXT_PRESETS.map(function (p, i) {
      return h("button.wp-textadd.wp-textadd--" + i, {
        type: "button", style: { fontFamily: window.WallpaperFonts.stack(p.o.style.font), fontWeight: p.o.style.weight },
        on: { click: function () { addElement("text", p.o); } },
      }, p.label);
    });
    TEXT_PRESETS.forEach(function (p) { WPE.fontload.ensure(p.o.style.font); });
    var combos = h("div.wp-tiles.wp-tiles--1", null, TEXT_COMBOS.map(function (o) {
      var el = Doc.createElement("text", Object.assign({ x: 0, y: 0 }, o));
      el.h = Math.round(o.style.size * (o.style.lineHeight || 1.15) + (o.padY || 0) * 2);
      return presetTile(el, function () { addElement("text", o); }, { maxW: 250, maxH: 56, cls: "wp-tile--wide" });
    }));
    return [
      h("p.wp-drawer__hint", null, "Klikk for å legge til. Dobbeltklikk tekst på lerretet for å skrive."),
      h("div.wp-textadds", null, btns),
      h("h4.wp-drawer__sub", null, "Tekstkombinasjoner"),
      combos,
    ];
  }

  // ---- elements --------------------------------------------------------------------------
  var SHAPES = [
    ["rect", "Rektangel", { w: 320, h: 200 }],
    ["rect", "Avrundet", { w: 320, h: 200, radius: 28 }],
    ["rect", "Kvadrat", { w: 220, h: 220 }],
    ["ellipse", "Sirkel", { w: 220, h: 220 }],
    ["ellipse", "Ellipse", { w: 320, h: 200 }],
    ["triangle", "Trekant", { w: 240, h: 210 }],
    ["diamond", "Rombe", { w: 220, h: 220 }],
    ["pentagon", "Femkant", { w: 220, h: 220 }],
    ["hexagon", "Sekskant", { w: 240, h: 220 }],
    ["star", "Stjerne", { w: 220, h: 220, points: 5, inner: 0.45 }],
    ["burst", "Tilbudsmerke", { w: 200, h: 200, points: 18, inner: 0.86, fill: { type: "solid", color: "#f5c542" } }],
    ["arrow", "Pil", { w: 280, h: 140 }],
    ["chevron", "Vinkel", { w: 240, h: 140 }],
    ["bubble", "Snakkeboble", { w: 280, h: 200, radius: 24 }],
    ["heart", "Hjerte", { w: 220, h: 200, fill: { type: "solid", color: "#e63946" } }],
    ["rect", "Ramme", { w: 320, h: 200, fill: null, border: { width: 6, color: "#111111", style: "solid" } }],
    ["octagon", "Åttekant", { w: 220, h: 220 }],
    ["parallelogram", "Parallellogram", { w: 320, h: 140 }],
    ["trapezoid", "Trapes", { w: 300, h: 160 }],
    ["cross", "Pluss", { w: 200, h: 200 }],
    ["ribbon", "Bånd", { w: 360, h: 90, fill: { type: "solid", color: "#e63946" } }],
    ["tag", "Prislapp", { w: 260, h: 110, fill: { type: "solid", color: "#f5c542" } }],
    ["shield", "Skjold", { w: 200, h: 230 }],
    ["semicircle", "Halvsirkel", { w: 280, h: 140 }],
    ["ring", "Ring", { w: 220, h: 220, inner: 0.62 }],
    ["ellipse", "Sirkelramme", { w: 220, h: 220, fill: null, border: { width: 6, color: "#111111", style: "dashed" } }],
  ];

  // Ready-made stickers: badges with the text already in them.
  var STICKERS = [
    { kind: "burst", w: 180, h: 180, points: 20, inner: 0.86, fill: { type: "solid", color: "#f5c542" }, text: "-50%", style: { font: "Anton", weight: 400, size: 50, color: "#111111" }, rot: -8 },
    { kind: "ribbon", w: 300, h: 70, fill: { type: "solid", color: "#e63946" }, text: "NYHET", style: { font: "Montserrat", weight: 800, size: 28, color: "#ffffff", letterSpacing: 0.12 } },
    { kind: "tag", w: 240, h: 96, fill: { type: "solid", color: "#111111" }, text: "kr 499,–", style: { font: "Montserrat", weight: 800, size: 30, color: "#ffffff" }, padX: 10, padY: 0 },
    { kind: "ellipse", w: 170, h: 170, fill: { type: "solid", color: "#1a6b1a" }, border: { width: 4, color: "#ffffff", style: "dashed" }, text: "GRATIS\nFRAKT", style: { font: "Bebas Neue", weight: 400, size: 36, lineHeight: 1, color: "#ffffff", letterSpacing: 0.04 }, rot: 8 },
    { kind: "shield", w: 170, h: 200, fill: { type: "gradient", kind: "linear", angle: 180, stops: [{ color: "#f7e7b4", pos: 0 }, { color: "#c9a24b", pos: 100 }] }, text: "BEST\nI TEST", style: { font: "Oswald", weight: 700, size: 30, lineHeight: 1, color: "#3b2a07" } },
    { kind: "star", w: 180, h: 180, points: 5, inner: 0.5, fill: { type: "solid", color: "#ff7a00" }, text: "TOPP", style: { font: "Anton", weight: 400, size: 30, color: "#ffffff" }, padY: 18 },
    { kind: "rect", w: 220, h: 56, radius: 4, rot: -6, fill: { type: "solid", color: "#111111" }, text: "KUN I DAG", style: { font: "Bebas Neue", weight: 400, size: 32, color: "#ffd60a", letterSpacing: 0.08 } },
    { kind: "bubble", w: 240, h: 150, radius: 22, fill: { type: "solid", color: "#ffffff" }, border: { width: 3, color: "#111111", style: "solid" }, text: "Bare nå!", style: { font: "Caveat", weight: 700, size: 44, color: "#111111" }, padY: 4 },
    { kind: "ellipse", w: 160, h: 160, fill: { type: "solid", color: "#e63946" }, text: "UTSALG", style: { font: "Anton", weight: 400, size: 30, color: "#ffffff" }, shadow: { x: 0, y: 8, blur: 20, color: "#e6394666" } },
    { kind: "rect", w: 230, h: 64, radius: 999, fill: { type: "gradient", kind: "linear", angle: 90, stops: [{ color: "#6d28d9", pos: 0 }, { color: "#ec4899", pos: 100 }] }, text: "Fri retur", style: { font: "Poppins", weight: 700, size: 22, color: "#ffffff" } },
  ];

  var LINES = [
    ["Linje", {}],
    ["Stiplet", { stroke: { style: "dashed" } }],
    ["Prikket", { stroke: { style: "dotted", width: 6 } }],
    ["Pil", { end: "arrow" }],
    ["Dobbel pil", { start: "arrow", end: "arrow" }],
    ["Tykk", { stroke: { width: 12, cap: "butt" } }],
  ];

  var BUTTONS = [
    { w: 220, h: 60, radius: 999, fill: { type: "solid", color: "#2fa84f" }, text: "Bestill her ›", style: { font: "Montserrat", weight: 800, size: 20, color: "#ffffff" }, hover: "lift" },
    { w: 200, h: 58, radius: 10, fill: { type: "solid", color: "#111111" }, text: "Kjøp nå", style: { font: "Inter", weight: 700, size: 20, color: "#ffffff" }, hover: "lift" },
    { w: 200, h: 58, radius: 999, fill: null, border: { width: 2.5, color: "#111111", style: "solid" }, text: "Les mer", style: { font: "Inter", weight: 700, size: 19, color: "#111111" }, hover: "grow" },
    { w: 230, h: 62, radius: 999, fill: { type: "gradient", kind: "linear", angle: 90, stops: [{ color: "#ff7a00", pos: 0 }, { color: "#e63946", pos: 100 }] }, text: "Se tilbudet", style: { font: "Montserrat", weight: 800, size: 20, color: "#ffffff" }, shadow: { x: 0, y: 8, blur: 20, color: "#e6394666" }, hover: "lift" },
    { w: 200, h: 56, radius: 6, fill: { type: "solid", color: "#ffd60a" }, text: "BESTILL", style: { font: "Montserrat", weight: 800, size: 19, letterSpacing: 0.08, color: "#111111" }, hover: "brighten" },
    { w: 230, h: 60, radius: 4, fill: { type: "solid", color: "#12305e" }, text: "GÅ TIL TILBUD", style: { font: "Bebas Neue", weight: 400, size: 28, letterSpacing: 0.06, color: "#ffffff" }, hover: "lift" },
    { w: 230, h: 60, radius: 999, fill: { type: "solid", color: "#ffffff" }, text: "Bestill nå →", style: { font: "Inter", weight: 700, size: 20, color: "#1d4ed8" }, shadow: { x: 0, y: 6, blur: 18, color: "#0000002e" }, hover: "lift" },
    { w: 150, h: 150, kind: "ellipse", fill: { type: "solid", color: "#e63946" }, text: "KJØP\nNÅ", style: { font: "Anton", weight: 400, size: 34, lineHeight: 1, color: "#ffffff" }, hover: "grow" },
    { w: 230, h: 60, radius: 12, fill: { type: "gradient", kind: "linear", angle: 135, stops: [{ color: "#12305e", pos: 0 }, { color: "#3b82f6", pos: 100 }] }, text: "Bestill reisen", style: { font: "Poppins", weight: 700, size: 20, color: "#ffffff" }, shadow: { x: 0, y: 10, blur: 24, color: "#1d4ed855" }, hover: "lift" },
    { w: 220, h: 58, radius: 0, fill: { type: "solid", color: "#ffffff" }, border: { width: 2, color: "#c9a24b", style: "solid" }, text: "SE KOLLEKSJONEN", style: { font: "Montserrat", weight: 600, size: 14, letterSpacing: 0.18, color: "#3b2a07" }, hover: "brighten" },
    { w: 210, h: 60, kind: "chevron", fill: { type: "solid", color: "#ff7a00" }, text: "Gå til salg", style: { font: "Inter", weight: 800, size: 19, color: "#ffffff" }, padX: 28, hover: "grow" },
    { w: 200, h: 58, radius: 999, fill: { type: "solid", color: "#e5f4e3" }, text: "Les mer ›", style: { font: "Inter", weight: 700, size: 19, color: "#1a6b1a" }, hover: "dim" },
  ];

  function shapeProps(extra) {
    return Object.assign({ fill: { type: "solid", color: "#1a6b1a" } }, extra);
  }

  function elementsPanel() {
    var shapes = h("div.wp-tiles.wp-tiles--4", null, SHAPES.map(function (s) {
      var o = shapeProps(Object.assign({ kind: s[0] }, s[2]));
      var el = Doc.createElement("shape", Object.assign({ x: 0, y: 0 }, o));
      return presetTile(el, function () { addElement("shape", o); }, { maxW: 54, maxH: 44, title: s[1], cls: "wp-tile--sq" });
    }));
    var lines = h("div.wp-tiles.wp-tiles--3", null, LINES.map(function (l) {
      var o = Object.assign({ w: 320, h: 28 }, l[1]);
      if (o.stroke) o.stroke = Object.assign({}, Doc.DEFAULTS.line.stroke, o.stroke);
      var el = Doc.createElement("line", Object.assign({ x: 0, y: 0 }, o));
      return presetTile(el, function () { addElement("line", o); }, { maxW: 80, maxH: 24, title: l[0], label: l[0] });
    }));
    var buttons = h("div.wp-tiles.wp-tiles--2", null, BUTTONS.map(function (b) {
      var o = Object.assign({ kind: "rect" }, b);
      var el = Doc.createElement("shape", Object.assign({ x: 0, y: 0 }, o));
      return presetTile(el, function () { addElement("shape", o); }, { maxW: 116, maxH: 50 });
    }));
    var stickers = h("div.wp-tiles.wp-tiles--2", null, STICKERS.map(function (st) {
      var el = Doc.createElement("shape", Object.assign({ x: 0, y: 0 }, st));
      return presetTile(el, function () { addElement("shape", st); }, { maxW: 110, maxH: 70 });
    }));
    return [
      h("h4.wp-drawer__sub", null, "Former"),
      shapes,
      h("p.wp-drawer__hint", null, "Alle former kan ha tekst – dobbeltklikk formen for å skrive i den."),
      h("h4.wp-drawer__sub", null, "Knapper"),
      buttons,
      h("h4.wp-drawer__sub", null, "Merker og klistremerker"),
      stickers,
      h("h4.wp-drawer__sub", null, "Linjer"),
      lines,
    ];
  }

  // ---- icons ------------------------------------------------------------------------------
  var POPULAR = [
    "arrow-right", "chevron-right", "circle-check", "check", "star", "heart", "gift", "tag", "percent", "badge-percent",
    "shopping-cart", "shopping-bag", "truck", "ship", "plane", "car", "train-front", "hotel", "map-pin", "calendar",
    "clock", "phone", "mail", "sparkles", "flame", "zap", "trophy", "crown", "sun", "snowflake",
    "umbrella", "coffee", "utensils", "wine", "music", "ticket", "credit-card", "wallet", "smartphone", "monitor",
    "house", "shield-check", "thumbs-up", "info", "play", "circle-play", "bell", "leaf", "trees", "mountain",
  ];

  function iconsPanel() {
    var set = util.icons();
    if (!set) return [h("p.wp-drawer__hint", null, "Laster ikoner …")];
    var names = Object.keys(set.icons);
    var search = h("input.wp-search", { type: "search", placeholder: "Søk i " + names.length + " ikoner (engelsk: ship, gift …)" });
    var grid = h("div.wp-icongrid");
    var more = h("button.wp-btn.wp-btn--ghost.wp-btn--sm.wp-btn--block", { type: "button" }, "Vis flere");
    var limit = 120;
    var replaceId = panelOpts.replace || null;
    var note = replaceId ? h("p.wp-drawer__hint.is-accent", null, "Velg et ikon for å bytte det markerte.") : null;

    /** Name hits first (exact, prefix, anywhere), then tag hits. */
    function matches(q) {
      if (!q) return POPULAR.filter(function (n) { return set.icons[n]; }).concat(names.filter(function (n) { return POPULAR.indexOf(n) === -1; }));
      var ranked = [];
      names.forEach(function (n) {
        var rank = n === q ? 0 : n.indexOf(q) === 0 ? 1 : n.indexOf(q) !== -1 ? 2 : -1;
        if (rank === -1) {
          var tags = set.tags[n] || [];
          for (var i = 0; i < tags.length; i++) {
            if (tags[i] === q) { rank = 3; break; }
            if (tags[i].indexOf(q) !== -1) rank = 4;
          }
        }
        if (rank !== -1) ranked.push({ n: n, r: rank });
      });
      ranked.sort(function (a, b) { return a.r - b.r || a.n.length - b.n.length || (a.n < b.n ? -1 : 1); });
      return ranked.map(function (x) { return x.n; });
    }
    function pick(name) {
      if (replaceId && store.byId(replaceId)) {
        store.checkpoint();
        store.update(replaceId, { icon: name, nodes: set.icons[name] });
        return;
      }
      addElement("icon", { icon: name, nodes: set.icons[name], w: 96, h: 96 });
    }
    function render() {
      var list = matches(search.value.trim().toLowerCase());
      util.clear(grid);
      list.slice(0, limit).forEach(function (n) {
        grid.appendChild(h("button.wp-iconbtn", { type: "button", title: n, on: { click: function () { pick(n); } } }, util.icon(n, 24)));
      });
      if (!list.length) grid.appendChild(h("p.wp-empty-sm", null, "Ingen ikoner funnet. Prøv et engelsk ord."));
      more.hidden = list.length <= limit;
    }
    search.addEventListener("input", function () { limit = 120; render(); });
    more.addEventListener("click", function () { limit += 240; render(); });
    render();
    setTimeout(function () { search.focus(); }, 40);
    return [note, search, grid, more, h("p.wp-drawer__credit", null, "Ikoner: Lucide (ISC-lisens)")];
  }

  // ---- images --------------------------------------------------------------------------------
  function imagesPanel() {
    var spec = store.boardSpec();
    var input = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/avif,image/gif", multiple: true, hidden: true });
    input.addEventListener("change", function () {
      Array.prototype.forEach.call(input.files, function (f, i) {
        var c = WPE.canvas.viewCenter();
        WPE.assets.placeFile(f, { x: c.x + i * 24, y: c.y + i * 24 });
      });
      input.value = "";
    });
    var drop = h("button.wp-dropzone", { type: "button", on: { click: function () { input.click(); } } },
      util.icon("image-plus", 26), h("strong", null, "Last opp bilder"),
      h("span", null, "eller dra dem rett inn på lerretet"), h("small", null, "JPG · PNG · WEBP · AVIF · GIF — maks 25 MB"));

    var url = h("input.wp-text", { type: "url", placeholder: "Lim inn bildelenke …" });
    var fetchBtn = h("button.wp-btn.wp-btn--primary.wp-btn--sm", { type: "button" }, "Hent");
    function fetchUrl() {
      var v = url.value.trim();
      if (!v) return;
      fetchBtn.disabled = true;
      WPE.assets.fromUrl(v).then(function (a) {
        WPE.assets.placeAsset(a);
        url.value = "";
      }).catch(function (err) {
        WPE.toast(err.message || "Kunne ikke hente bildet", "err");
      }).then(function () { fetchBtn.disabled = false; });
    }
    fetchBtn.addEventListener("click", fetchUrl);
    url.addEventListener("keydown", function (e) { if (e.key === "Enter") fetchUrl(); });

    var design = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/avif", hidden: true });
    design.addEventListener("change", function () {
      var f = design.files[0];
      design.value = "";
      if (f) WPE.assets.importDesign(f).catch(function (err) { WPE.toast(err.message, "err"); });
    });
    var importBox = h("div.wp-importbox", null,
      h("strong", null, "Har du et ferdig design?"),
      h("p", null, "Last opp hele " + spec.name.toLowerCase() + "en (" + spec.width + "×" + spec.height + ", gjerne i dobbel størrelse " + spec.width * 2 + "×" + spec.height * 2 + " for skarphet). Den legges låst i bunnen – så kan du legge ekte tekst og knapper oppå."),
      h("button.wp-btn.wp-btn--ghost.wp-btn--sm", { type: "button", on: { click: function () { design.click(); } } }, util.icon("upload", 14), "Importer ferdig " + spec.name.toLowerCase()),
      design
    );

    var gallery = h("div.wp-gallery");
    function renderGallery() {
      util.clear(gallery);
      var items = WPE.assets.recent();
      if (!items.length) {
        gallery.appendChild(h("p.wp-empty-sm", null, "Bildene du laster opp, havner her."));
        return;
      }
      items.forEach(function (a) {
        gallery.appendChild(h("button.wp-gallery__item", {
          type: "button", title: a.name + " · " + a.width + "×" + a.height,
          on: { click: function () { WPE.assets.placeAsset(a); } },
        }, h("img", { src: a.url, alt: "", loading: "lazy" })));
      });
    }
    renderGallery();
    WPE.assets.onRecent(function () { if (current === "images") renderGallery(); });

    return [drop, input, h("div.wp-urlrow", null, url, fetchBtn), importBox, h("h4.wp-drawer__sub", null, "Opplastede bilder"), gallery];
  }

  // ---- background ------------------------------------------------------------------------------
  function backgroundPanel() {
    var spec = store.boardSpec();
    var fill = WPE.controls.fill({
      get: function () { return store.board().bg; },
      set: function (f) { store.setBoardProps({ bg: f || Doc.solid("#ffffff") }); },
      defaultColor: "#ffffff",
    });
    var unsub = store.subscribe(function (what) { if (what === "doc" || what === "board") fill.sync(); });
    backgroundPanel.cleanup = unsub;
    var sw = h("div.wp-swatches.wp-swatches--lg", null, WPE.controls.PALETTE.map(function (c) {
      return h("button.wp-swatch", { type: "button", title: c, style: { background: c }, on: { click: function () { store.checkpoint(); store.setBoardProps({ bg: Doc.solid(c) }); } } });
    }));
    var gr = h("div.wp-gradpresets.wp-gradpresets--lg", null, WPE.controls.GRADIENTS.map(function (g) {
      return h("button.wp-gradpreset", { type: "button", style: { background: Render.fillCss(g) }, on: { click: function () { store.checkpoint(); store.setBoardProps({ bg: g }); } } });
    }));
    return [
      h("p.wp-drawer__hint", null, "Bakgrunnsfarge for " + spec.name.toLowerCase() + " (" + spec.width + "×" + spec.height + "). Vil du ha et bilde i bakgrunnen: Bilder → «Fyll flaten»."),
      h("h4.wp-drawer__sub", null, "Farger"), sw,
      h("h4.wp-drawer__sub", null, "Gradienter"), gr,
      h("h4.wp-drawer__sub", null, "Egendefinert"), fill.node,
    ];
  }

  // ---- layers ----------------------------------------------------------------------------------
  var TYPE_ICON = { text: "type", shape: "shapes", line: "minus", image: "image", icon: "star" };

  function layersPanel() {
    var list = h("ol.wp-layers");
    var dragId = null;
    function render() {
      util.clear(list);
      var els = store.elements();
      var sel = store.state.view.sel;
      if (!els.length) {
        list.appendChild(h("li.wp-empty-sm", null, "Ingen elementer på " + store.boardSpec().name.toLowerCase() + " ennå."));
        return;
      }
      els.slice().reverse().forEach(function (el) {
        var name = h("span.wp-layer__name", { title: "Dobbeltklikk for å gi nytt navn" }, Doc.displayName(el));
        name.addEventListener("dblclick", function (e) {
          e.stopPropagation();
          var input = h("input.wp-layer__rename", { type: "text", value: el.name || Doc.displayName(el), maxlength: 60 });
          name.replaceWith(input);
          input.focus();
          input.select();
          var done = function () {
            store.checkpoint();
            store.update(el.id, { name: input.value.trim() });
          };
          input.addEventListener("blur", done);
          input.addEventListener("keydown", function (ev) { if (ev.key === "Enter") input.blur(); ev.stopPropagation(); });
        });
        var row = h("li.wp-layer" + (sel.indexOf(el.id) !== -1 ? ".is-sel" : "") + (el.hidden ? ".is-hidden" : ""), {
          draggable: true, dataset: { id: el.id },
          on: {
            click: function (e) {
              if (e.target.closest("button")) return;
              if (e.shiftKey) store.select(sel.indexOf(el.id) === -1 ? sel.concat(el.id) : sel.filter(function (x) { return x !== el.id; }));
              else store.select([el.id]);
            },
            dragstart: function (e) { dragId = el.id; e.dataTransfer.effectAllowed = "move"; row.classList.add("is-drag"); },
            dragend: function () { dragId = null; row.classList.remove("is-drag"); },
            dragover: function (e) { if (dragId) { e.preventDefault(); row.classList.add("is-over"); } },
            dragleave: function () { row.classList.remove("is-over"); },
            drop: function (e) {
              e.preventDefault();
              row.classList.remove("is-over");
              if (!dragId || dragId === el.id) return;
              var index = store.elements().findIndex(function (x) { return x.id === el.id; });
              store.checkpoint();
              store.moveTo(dragId, index);
            },
          },
        },
          h("span.wp-layer__grip", null, util.icon("grip-vertical", 14)),
          h("span.wp-layer__type", null, util.icon(TYPE_ICON[el.type] || "square", 15)),
          name,
          h("button.wp-layer__btn" + (el.hidden ? ".is-on" : ""), { type: "button", title: el.hidden ? "Vis" : "Skjul", on: { click: function () { store.checkpoint(); store.update(el.id, { hidden: !el.hidden }); } } }, util.icon(el.hidden ? "eye-off" : "eye", 15)),
          h("button.wp-layer__btn" + (el.locked ? ".is-on" : ""), { type: "button", title: el.locked ? "Lås opp" : "Lås", on: { click: function () { store.checkpoint(); store.update(el.id, { locked: !el.locked }); } } }, util.icon(el.locked ? "lock" : "lock-open", 15))
        );
        list.appendChild(row);
      });
    }
    render();
    var unsub = store.subscribe(function (what) { if (what === "doc" || what === "sel" || what === "board") render(); });
    layersPanel.cleanup = unsub;
    return [h("p.wp-drawer__hint", null, "Øverst i lista ligger øverst i designet. Dra for å endre rekkefølge. Låste elementer velges her."), list];
  }

  // ---- templates ----------------------------------------------------------------------------------
  function templatesPanel() {
    return [
      h("p.wp-drawer__hint", null, "En mal fyller både bakgrunn og toppbanner. Du kan angre med Ctrl/⌘+Z."),
      h("div.wp-templates", null, WPE.templates.map(function (t) {
        var doc = Doc.normalizeDoc(t.make());
        WPE.fontload.ensureDoc(doc);
        var thumb = h("div.wp-tpl__thumb");
        // The whole wallpaper as it lands on the page: background with the
        // top banner in place.
        var ab = h("div", { style: { position: "absolute", left: "0", top: "0", width: "1920px", height: "850px" } });
        var bgNode = h("div");
        var tbNode = h("div");
        Render.renderArtboard(bgNode, doc.artboards.background, { width: 1920, height: 850 }, { assetUrl: WPE.canvas.assetUrl });
        Render.renderArtboard(tbNode, doc.artboards.topbanner, { width: 1000, height: 300 }, { assetUrl: WPE.canvas.assetUrl });
        var site = window.WallpaperSpec.get("background").site.topbanner;
        ab.appendChild(bgNode);
        ab.appendChild(h("div", { style: { position: "absolute", left: site.x + "px", top: site.y + "px" } }, tbNode));
        ab.style.transformOrigin = "0 0";
        thumb.appendChild(ab);
        // Scale to whatever width the drawer gives the card, once laid out.
        requestAnimationFrame(function () {
          ab.style.transform = "scale(" + thumb.clientWidth / 1920 + ")";
        });
        return h("button.wp-tpl", {
          type: "button",
          on: {
            click: function () {
              var d = store.state.doc;
              var hasContent = d.artboards.background.elements.length || d.artboards.topbanner.elements.length;
              if (hasContent && !confirm("Erstatte designet med malen «" + t.name + "»? (Kan angres)")) return;
              var fresh = Doc.normalizeDoc(t.make());
              WPE.fontload.ensureDoc(fresh);
              store.load(fresh);
              WPE.canvas.fit();
            },
          },
        }, thumb, h("span.wp-tpl__name", null, t.name), h("span.wp-tpl__desc", null, t.desc));
      })),
    ];
  }

  // ---- rail ---------------------------------------------------------------------------------------
  var PANELS = [
    { id: "templates", label: "Maler", icon: "layout-template", build: templatesPanel },
    { id: "text", label: "Tekst", icon: "type", build: textPanel },
    { id: "elements", label: "Elementer", icon: "shapes", build: elementsPanel },
    { id: "icons", label: "Ikoner", icon: "star", build: iconsPanel },
    { id: "images", label: "Bilder", icon: "image", build: imagesPanel },
    { id: "background", label: "Bakgrunn", icon: "paint-bucket", build: backgroundPanel },
    { id: "layers", label: "Lag", icon: "layers", build: layersPanel },
  ];

  function open(id, opts) {
    var p = PANELS.find(function (x) { return x.id === id; });
    PANELS.forEach(function (x) { if (x.build.cleanup) { x.build.cleanup(); x.build.cleanup = null; } });
    if (!p || (current === id && !opts)) {
      current = null;
      dom.drawer.hidden = true;
      dom.rail.querySelectorAll(".wp-rail__b").forEach(function (b) { b.classList.remove("is-on"); });
      requestAnimationFrame(function () { window.dispatchEvent(new Event("resize")); });
      return;
    }
    panelOpts = opts || {};
    current = id;
    dom.rail.querySelectorAll(".wp-rail__b").forEach(function (b) { b.classList.toggle("is-on", b.dataset.panel === id); });
    util.clear(dom.drawerBody);
    dom.drawerTitle.textContent = p.label;
    util.append(dom.drawerBody, p.build());
    var wasHidden = dom.drawer.hidden;
    dom.drawer.hidden = false;
    dom.drawerBody.scrollTop = 0;
    if (wasHidden) requestAnimationFrame(function () { window.dispatchEvent(new Event("resize")); });
  }

  function mount(rail, drawer) {
    dom.rail = rail;
    dom.drawer = drawer;
    dom.drawerTitle = h("h3");
    dom.drawerBody = h("div.wp-drawer__body");
    drawer.appendChild(h("header.wp-drawer__head", null, dom.drawerTitle,
      h("button.wp-btn.wp-btn--icon", { type: "button", title: "Lukk panelet", on: { click: function () { open(null); } } }, util.icon("chevron-left", 16))));
    drawer.appendChild(dom.drawerBody);
    PANELS.forEach(function (p) {
      rail.appendChild(h("button.wp-rail__b", { type: "button", dataset: { panel: p.id }, title: p.label, on: { click: function () { open(p.id); } } },
        util.icon(p.icon, 20), h("span", null, p.label)));
    });
    // Re-open the current drawer when the artboard changes: several panels
    // (images, background, layers) talk about "this" artboard.
    store.subscribe(function (what) {
      if (what === "board" && ["images", "background", "layers"].indexOf(current) !== -1) open(current, panelOpts);
    });
  }

  WPE.panels = { mount: mount, open: open, current: function () { return current; } };
})();
