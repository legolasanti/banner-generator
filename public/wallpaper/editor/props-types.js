/* =========================================================================
   editor/props-types.js — the per-type sections of the properties panel:
   text, shape, line, image and icon. Called by props.js with the selected
   element and a `track` function that registers each control for sync().
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Doc = window.WallpaperDoc;
  var Fonts = window.WallpaperFonts;
  var store = WPE.store;
  var util = WPE.util;
  var C = WPE.controls;
  var h = util.h;

  var WEIGHT_NAMES = {
    100: "Tynn", 200: "Ekstra lett", 300: "Lett", 400: "Normal", 500: "Medium",
    600: "Halvfet", 700: "Fet", 800: "Ekstra fet", 900: "Svart",
  };

  function ids() {
    return store.state.view.sel.slice();
  }
  function first() {
    return store.selected()[0];
  }
  function set(patch) {
    store.update(ids(), patch);
  }
  function setStyle(patch) {
    store.updateNested(ids(), "style", patch);
  }
  function styleGet(key) {
    return function () {
      var e = first();
      return e && e.style ? e.style[key] : null;
    };
  }
  function getter(key) {
    return function () {
      var e = first();
      return e ? e[key] : null;
    };
  }
  function nested(field, key) {
    return {
      get: function () { var e = first(); return e && e[field] ? e[field][key] : null; },
      set: function (v) { var p = {}; p[key] = v; store.updateNested(ids(), field, p); },
    };
  }

  // ---- text styling (text elements and shape labels) ------------------------------
  function textStyleControls(track, opts) {
    var out = [];
    out.push(C.row("Skrift", track(C.font({
      get: styleGet("font"),
      set: function (f) {
        var e = first();
        setStyle({ font: f, weight: Fonts.nearestWeight(f, e ? e.style.weight : 400) });
        WPE.props.rebuild();
      },
    }))));
    var e0 = first();
    var weights = Fonts.find(e0.style.font).w.map(function (w) {
      return { value: w, label: w + " · " + (WEIGHT_NAMES[w] || "") };
    });
    out.push(h("div.wp-grid2", null,
      track(C.select({ options: weights, get: styleGet("weight"), set: function (v) { setStyle({ weight: Number(v) }); } })),
      track(C.num({ label: "Str.", min: 4, max: 800, step: 1, suffix: "px", get: styleGet("size"), set: function (v) { setStyle({ size: v }); } }))
    ));
    out.push(h("div.wp-grid2", null,
      track(C.num({ label: "Linje", min: 0.6, max: 3, step: 0.05, digits: 2, get: styleGet("lineHeight"), set: function (v) { setStyle({ lineHeight: v }); } })),
      track(C.num({
        label: "Sperring", min: -30, max: 150, step: 0.5, digits: 1, suffix: "%",
        get: function () { var e = first(); return e ? Math.round(e.style.letterSpacing * 1000) / 10 : 0; },
        set: function (v) { setStyle({ letterSpacing: v / 100 }); },
      }))
    ));
    out.push(h("div.wp-btnrow", null,
      track(C.seg({
        options: [
          { value: "left", icon: "text-align-start", title: "Venstre" },
          { value: "center", icon: "text-align-center", title: "Midtstilt" },
          { value: "right", icon: "text-align-end", title: "Høyre" },
          { value: "justify", icon: "text-align-justify", title: "Blokkjustert" },
        ],
        get: styleGet("align"), set: function (v) { setStyle({ align: v }); },
      })),
      track(C.toggle({ icon: "italic", title: "Kursiv", get: styleGet("italic"), set: function (v) { setStyle({ italic: v }); } })),
      track(C.toggle({ icon: "underline", title: "Understrek", get: styleGet("underline"), set: function (v) { setStyle({ underline: v }); } })),
      track(C.toggle({ icon: "strikethrough", title: "Gjennomstrek", get: styleGet("strike"), set: function (v) { setStyle({ strike: v }); } })),
      track(C.toggle({ icon: "case-upper", title: "Store bokstaver", get: styleGet("uppercase"), set: function (v) { setStyle({ uppercase: v }); } }))
    ));
    if (opts && opts.valign) {
      out.push(C.row("Loddrett", track(C.seg({
        options: [
          { value: "top", icon: "align-vertical-justify-start", title: "Topp" },
          { value: "middle", icon: "align-vertical-justify-center", title: "Midten" },
          { value: "bottom", icon: "align-vertical-justify-end", title: "Bunn" },
        ],
        get: styleGet("valign"), set: function (v) { setStyle({ valign: v }); },
      }))));
    }
    out.push(C.row("Tekstfarge", track(C.fill({
      get: function () { var e = first(); if (!e) return null; return e.style.gradient || Doc.solid(e.style.color); },
      set: function (f) {
        if (!f) return;
        if (f.type === "gradient") setStyle({ gradient: f });
        else setStyle({ color: f.color, gradient: null });
      },
      defaultColor: "#111111",
    })), { stack: true }));
    out.push(h("div.wp-grid2", null,
      track(C.num({ label: "Kontur", min: 0, max: 30, step: 0.5, digits: 1, suffix: "px", get: styleGet("strokeWidth"), set: function (v) { setStyle({ strokeWidth: v }); } })),
      track(C.color({ get: styleGet("strokeColor"), set: function (v) { setStyle({ strokeColor: v || "#ffffff" }); } }))
    ));
    return out;
  }

  function borderControls(track) {
    var b = nested("border", "width");
    var c = nested("border", "color");
    var s = nested("border", "style");
    return [
      h("div.wp-grid2", null,
        track(C.num({ label: "Kant", min: 0, max: 60, step: 0.5, digits: 1, suffix: "px", get: b.get, set: b.set })),
        track(C.color({ get: c.get, set: function (v) { c.set(v || "#111111"); } }))
      ),
      track(C.seg({
        options: [{ value: "solid", label: "Hel" }, { value: "dashed", label: "Stiplet" }, { value: "dotted", label: "Prikket" }],
        get: s.get, set: s.set, wide: true,
      })),
    ];
  }

  // ---- per type ------------------------------------------------------------------------
  function textSections(el, track) {
    var content = [
      track(C.textarea({ get: getter("text"), set: function (v) { set({ text: v }); }, placeholder: "Skriv tekst …" })),
    ].concat(textStyleControls(track));
    var boxOn = !!(el.fill || el.border.width || el.padX || el.padY);
    var box = [
      C.row("Bakgrunn", track(C.fill({
        allowNone: true, defaultColor: "#f5c542",
        get: getter("fill"),
        set: function (f) {
          var e = first();
          var patch = { fill: f };
          if (f && e && !e.padX && !e.padY) { patch.padX = 16; patch.padY = 8; }
          set(patch);
        },
      })), { stack: true }),
      h("div.wp-grid3", null,
        track(C.num({ label: "Luft ↔", min: 0, max: 400, get: getter("padX"), set: function (v) { set({ padX: v }); } })),
        track(C.num({ label: "Luft ↕", min: 0, max: 400, get: getter("padY"), set: function (v) { set({ padY: v }); } })),
        track(C.num({ label: "Hjørne", min: 0, max: 999, get: getter("radius"), set: function (v) { set({ radius: v }); } }))
      ),
    ].concat(borderControls(track));
    return [
      C.section("Tekst", content),
      C.section("Tekstboks", box, { collapsed: !boxOn }),
    ];
  }

  var KIND_NAMES = {
    rect: "Rektangel", ellipse: "Sirkel/ellipse", triangle: "Trekant", diamond: "Rombe", pentagon: "Femkant",
    hexagon: "Sekskant", star: "Stjerne", burst: "Tilbudsmerke", arrow: "Pil", chevron: "Vinkel",
    bubble: "Snakkeboble", heart: "Hjerte", octagon: "Åttekant", parallelogram: "Parallellogram",
    trapezoid: "Trapes", cross: "Pluss", ribbon: "Bånd", tag: "Prislapp", shield: "Skjold",
    semicircle: "Halvsirkel", ring: "Ring",
  };

  /** The shape itself, drawn small by the real renderer — never an icon lookalike. */
  function kindPreview(kind) {
    var el = Doc.createElement("shape", {
      kind: kind, x: 0, y: 0, w: 22, h: kind === "ribbon" || kind === "tag" || kind === "arrow" || kind === "parallelogram" ? 14 : 22,
      fill: Doc.solid("#4b5563"), points: kind === "burst" ? 12 : 5, inner: kind === "ring" ? 0.55 : kind === "burst" ? 0.78 : 0.5,
      radius: kind === "bubble" ? 5 : 0,
    });
    var box = h("span.wp-kind__art");
    box.appendChild(window.WallpaperRender.renderElement(el, {}));
    return box;
  }

  function shapeSections(el, track) {
    var kinds = h("div.wp-kinds", null, Doc.SHAPE_KINDS.map(function (k) {
      return h("button.wp-kind" + (el.kind === k ? ".is-on" : ""), {
        type: "button", title: KIND_NAMES[k],
        on: { click: function () { store.checkpoint(); set({ kind: k }); } },
      }, kindPreview(k));
    }));
    var look = [
      kinds,
      C.row("Fyll", track(C.fill({ allowNone: true, get: getter("fill"), set: function (f) { set({ fill: f }); } })), { stack: true }),
    ].concat(borderControls(track));
    if (el.kind === "rect" || el.kind === "bubble") {
      look.push(track(C.slider({
        label: "Hjørner", min: 0, max: Math.round(Math.min(el.w, el.h) / 2), reset: 0,
        get: getter("radius"), set: function (v) { set({ radius: v }); }, format: function (v) { return v + " px"; },
      })));
    }
    if (el.kind === "ring") {
      look.push(track(C.slider({
        label: "Hull", min: 10, max: 95, reset: 50,
        get: function () { var e = first(); return e ? Math.round(e.inner * 100) : 50; },
        set: function (v) { set({ inner: v / 100 }); }, format: function (v) { return v + "%"; },
      })));
    }
    if (el.kind === "star" || el.kind === "burst") {
      look.push(h("div.wp-grid2", null,
        track(C.num({ label: "Tagger", min: el.kind === "burst" ? 8 : 3, max: 40, get: getter("points"), set: function (v) { set({ points: Math.round(v) }); } })),
        track(C.num({
          label: "Innside", min: 10, max: 95, suffix: "%",
          get: function () { var e = first(); return e ? Math.round(e.inner * 100) : 50; },
          set: function (v) { set({ inner: v / 100 }); },
        }))
      ));
    }
    var label = [
      track(C.textarea({ rows: 2, get: getter("text"), set: function (v) { set({ text: v }); }, placeholder: "Tekst i formen (tom = ingen)" })),
    ];
    if (el.text) {
      label = label.concat(textStyleControls(track, { valign: true }));
      label.push(h("div.wp-grid2", null,
        track(C.num({ label: "Luft ↔", min: 0, max: 400, get: getter("padX"), set: function (v) { set({ padX: v }); } })),
        track(C.num({ label: "Luft ↕", min: 0, max: 400, get: getter("padY"), set: function (v) { set({ padY: v }); } }))
      ));
    }
    return [C.section("Form · " + KIND_NAMES[el.kind], look), C.section("Tekst i formen", label)];
  }

  function lineSections(el, track) {
    var s = function (key) { return nested("stroke", key); };
    var ends = [
      { value: "none", label: "—", title: "Ingen" },
      { value: "arrow", label: "➤", title: "Pil" },
      { value: "circle", label: "●", title: "Prikk" },
      { value: "bar", label: "|", title: "Strek" },
    ];
    return [C.section("Linje", [
      h("div.wp-grid2", null,
        track(C.num({ label: "Tykk.", min: 0.5, max: 80, step: 0.5, digits: 1, suffix: "px", get: s("width").get, set: function (v) {
          store.update(ids(), function (e) { return { stroke: Object.assign({}, e.stroke, { width: v }), h: Math.max(e.h, v * 4, 12) }; });
        } })),
        track(C.color({ get: s("color").get, set: function (v) { s("color").set(v || "#111111"); } }))
      ),
      track(C.seg({ options: [{ value: "solid", label: "Hel" }, { value: "dashed", label: "Stiplet" }, { value: "dotted", label: "Prikket" }], get: s("style").get, set: s("style").set, wide: true })),
      C.row("Ende", track(C.seg({ options: [{ value: "round", label: "Rund" }, { value: "butt", label: "Rett" }, { value: "square", label: "Firkant" }], get: s("cap").get, set: s("cap").set }))),
      C.row("Start", track(C.seg({ options: ends, get: getter("start"), set: function (v) { set({ start: v }); } }))),
      C.row("Slutt", track(C.seg({ options: ends, get: getter("end"), set: function (v) { set({ end: v }); } }))),
    ])];
  }

  var FILTER_PRESETS = [
    { name: "Original", f: { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, hue: 0 } },
    { name: "Levende", f: { brightness: 104, contrast: 112, saturate: 135, grayscale: 0, sepia: 0, hue: 0 } },
    { name: "Varm", f: { brightness: 104, contrast: 102, saturate: 115, grayscale: 0, sepia: 22, hue: -6 } },
    { name: "Kald", f: { brightness: 100, contrast: 106, saturate: 90, grayscale: 0, sepia: 0, hue: 12 } },
    { name: "Dempet", f: { brightness: 104, contrast: 88, saturate: 70, grayscale: 0, sepia: 0, hue: 0 } },
    { name: "Svart-hvitt", f: { brightness: 100, contrast: 112, saturate: 100, grayscale: 100, sepia: 0, hue: 0 } },
  ];

  function imageSections(el, track) {
    var spec = store.boardSpec();
    var info = h("p.wp-note");
    // Shown when another picture lies on top of this one — the usual reason
    // an edit to an image seems to do nothing.
    var coverNote = h("p.wp-note.is-warn", { hidden: true }, h("span"),
      h("button.wp-linkbtn", { type: "button", on: { click: function () { store.checkpoint(); store.reorder(ids(), "front"); } } }, "Flytt fremst"));
    function syncInfo() {
      var e = first();
      if (!e) return;
      var scale = WPE.preflight.imageScale(e);
      // Source pixels per artboard pixel: ≥2 is retina-sharp, <1 is blown up.
      var ratio = scale ? 1 / scale : 0;
      info.textContent = e.natW
        ? "Original " + e.natW + "×" + e.natH + " px" + (ratio ? " · " + ratio.toFixed(1).replace(".", ",") + "× skarphet" : "")
        : "";
      info.classList.toggle("is-warn", ratio > 0 && ratio < 0.8);
      if (ratio > 0 && ratio < 0.8) info.textContent += " – forstørret, kan bli uskarpt";
      var cover = WPE.preflight.coveredBy(e, store.elements());
      coverNote.hidden = !cover;
      if (cover) coverNote.firstChild.textContent = "Bildet ligger bak «" + Doc.displayName(cover) + "» og synes ikke – endringer her vises derfor ikke. ";
    }
    track({ node: info, sync: syncInfo });
    syncInfo();
    var replaceInput = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/avif,image/gif", hidden: true });
    replaceInput.addEventListener("change", function () {
      var file = replaceInput.files[0];
      replaceInput.value = "";
      if (!file) return;
      WPE.assets.upload(file).then(function (a) {
        store.checkpoint();
        set({ asset: a.id, natW: a.width, natH: a.height, opaque: !!a.opaque });
      }).catch(function (err) { WPE.toast(err.message, "err"); });
    });
    var actions = h("div.wp-btnrow.wp-btnrow--wrap", null,
      h("button.wp-btn.wp-btn--ghost.wp-btn--sm", { type: "button", on: { click: function () { replaceInput.click(); } } }, util.icon("refresh-cw", 14), "Bytt bilde"),
      h("button.wp-btn.wp-btn--ghost.wp-btn--sm", {
        type: "button", title: "Fyll hele tegneflaten og legg bakerst",
        on: { click: function () {
          store.checkpoint();
          set({ x: 0, y: 0, w: spec.width, h: spec.height, rot: 0, fit: "cover" });
          store.reorder(ids(), "back");
        } },
      }, util.icon("maximize", 14), "Fyll flaten"),
      h("button.wp-btn.wp-btn--ghost.wp-btn--sm", {
        type: "button", title: "Tilbake til bildets egne proporsjoner",
        on: { click: function () {
          var e = first();
          if (!e || !e.natW) return;
          store.checkpoint();
          var hh = Math.round((e.w * e.natH) / e.natW);
          set({ h: hh, zoom: 1, posX: 50, posY: 50 });
        } },
      }, util.icon("scan", 14), "Riktige proporsjoner"),
      replaceInput
    );
    var crop = [
      info,
      coverNote,
      actions,
      C.row("Utsnitt", track(C.seg({
        options: [{ value: "cover", label: "Fyll" }, { value: "contain", label: "Tilpass" }, { value: "fill", label: "Strekk" }],
        get: getter("fit"), set: function (v) { set({ fit: v }); },
      }))),
      track(C.slider({ label: "Zoom", min: 100, max: 500, reset: 100, get: function () { var e = first(); return e ? Math.round(e.zoom * 100) : 100; }, set: function (v) { set({ zoom: v / 100 }); }, format: function (v) { return v + "%"; } })),
      track(C.slider({ label: "Fokus ↔", min: 0, max: 100, reset: 50, get: getter("posX"), set: function (v) { set({ posX: v }); }, format: function (v) { return v + "%"; } })),
      track(C.slider({ label: "Fokus ↕", min: 0, max: 100, reset: 50, get: getter("posY"), set: function (v) { set({ posY: v }); }, format: function (v) { return v + "%"; } })),
      h("div.wp-btnrow", null,
        track(C.toggle({ icon: "arrow-left-right", label: "Speil", title: "Speilvend vannrett", get: getter("flipX"), set: function (v) { set({ flipX: v }); } })),
        track(C.toggle({ icon: "arrow-up-down", label: "Snu", title: "Speilvend loddrett", get: getter("flipY"), set: function (v) { set({ flipY: v }); } })),
        track(C.toggle({ icon: "circle", label: "Sirkel", title: "Beskjær til sirkel", get: function () { var e = first(); return e && e.mask === "circle"; }, set: function (v) { set({ mask: v ? "circle" : "none" }); } }))
      ),
      track(C.slider({ label: "Hjørner", min: 0, max: 400, reset: 0, get: getter("radius"), set: function (v) { set({ radius: v }); }, format: function (v) { return v + " px"; } })),
    ].concat(borderControls(track));

    var filt = function (key, label, min, max, reset, unit) {
      return track(C.slider({
        label: label, min: min, max: max, reset: reset,
        get: function () { var e = first(); return e ? e.filters[key] : reset; },
        set: function (v) { var p = {}; p[key] = v; store.updateNested(ids(), "filters", p); },
        format: function (v) { return v + (unit || "%"); },
      }));
    };
    var presets = h("div.wp-chips", null, FILTER_PRESETS.map(function (p) {
      return h("button.wp-chip", { type: "button", on: { click: function () { store.checkpoint(); set({ filters: p.f }); } } }, p.name);
    }));
    var filters = [
      presets,
      filt("brightness", "Lysstyrke", 0, 200, 100),
      filt("contrast", "Kontrast", 0, 200, 100),
      filt("saturate", "Metning", 0, 300, 100),
      filt("grayscale", "Gråtone", 0, 100, 0),
      filt("sepia", "Sepia", 0, 100, 0),
      filt("hue", "Fargetone", -180, 180, 0, "°"),
      h("p.wp-note", null, "Dobbeltklikk en glidebryter for å nullstille den."),
    ];
    return [C.section("Bilde", crop), C.section("Filtre", filters, { collapsed: true })];
  }

  function iconSections(el, track) {
    return [C.section("Ikon · " + el.icon, [
      h("div.wp-grid2", null,
        track(C.color({ get: getter("color"), set: function (v) { set({ color: v || "#111111" }); } })),
        track(C.num({ label: "Strek", min: 0.25, max: 6, step: 0.25, digits: 2, get: getter("strokeWidth"), set: function (v) { set({ strokeWidth: v }); } }))
      ),
      C.row("Fyll", track(C.color({ allowNone: true, get: getter("fill"), set: function (v) { set({ fill: v }); } }))),
      h("button.wp-btn.wp-btn--ghost.wp-btn--sm", {
        type: "button", on: { click: function () { WPE.panels.open("icons", { replace: el.id }); } },
      }, util.icon("refresh-cw", 14), "Bytt ikon"),
    ])];
  }

  var BY_TYPE = { text: textSections, shape: shapeSections, line: lineSections, image: imageSections, icon: iconSections };

  WPE.propsTypes = {
    sections: function (el, track) {
      return BY_TYPE[el.type] ? BY_TYPE[el.type](el, track) : [];
    },
  };
})();
