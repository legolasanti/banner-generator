/* =========================================================================
   editor/props.js — the right-hand properties panel.

   What it shows follows the selection:
     nothing      → the artboard (background, project name, checks, tips)
     one element  → position, its type's own settings, effects
     several      → position/alignment/distribution and shared effects

   The panel is rebuilt only when the SHAPE of the selection changes (other
   ids, other types). A plain value change just calls sync() on each
   control, so an input you are typing in keeps its focus.

   Type-specific sections live in props-types.js.
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Doc = window.WallpaperDoc;
  var store = WPE.store;
  var geom = WPE.geom;
  var util = WPE.util;
  var C = WPE.controls;
  var h = util.h;

  var host = null;
  var controls = [];
  var signature = "";

  function track(c) {
    controls.push(c);
    return c.node;
  }

  function ids() {
    return store.state.view.sel.slice();
  }
  function first() {
    return store.selected()[0];
  }
  function setAll(patch) {
    store.update(ids(), patch);
  }

  // ---- alignment -----------------------------------------------------------------
  var alignTarget = "board"; // board | safe

  function targetRect(list) {
    if (list.length > 1) return geom.unionBounds(list);
    var spec = store.boardSpec();
    if (alignTarget === "safe") return { x: spec.safe.x, y: spec.safe.y, w: spec.safe.width, h: spec.safe.height };
    return { x: 0, y: 0, w: spec.width, h: spec.height };
  }

  function align(how) {
    var list = store.selected().filter(function (el) { return !el.locked; });
    if (!list.length) return;
    var t = targetRect(list);
    store.checkpoint();
    store.update(list.map(function (el) { return el.id; }), function (el) {
      var b = geom.bounds(geom.frame(el));
      var dx = 0;
      var dy = 0;
      if (how === "left") dx = t.x - b.x;
      if (how === "hcenter") dx = t.x + t.w / 2 - (b.x + b.w / 2);
      if (how === "right") dx = t.x + t.w - (b.x + b.w);
      if (how === "top") dy = t.y - b.y;
      if (how === "vcenter") dy = t.y + t.h / 2 - (b.y + b.h / 2);
      if (how === "bottom") dy = t.y + t.h - (b.y + b.h);
      return { x: Math.round((el.x + dx) * 10) / 10, y: Math.round((el.y + dy) * 10) / 10 };
    });
  }

  function distribute(axis) {
    var list = store.selected().filter(function (el) { return !el.locked; });
    if (list.length < 3) return;
    var items = list.map(function (el) { return { el: el, b: geom.bounds(geom.frame(el)) }; });
    var pos = axis === "x" ? "x" : "y";
    var size = axis === "x" ? "w" : "h";
    items.sort(function (a, b) { return a.b[pos] - b.b[pos]; });
    var start = items[0].b[pos];
    var end = items[items.length - 1].b[pos] + items[items.length - 1].b[size];
    var total = items.reduce(function (s, it) { return s + it.b[size]; }, 0);
    var gap = (end - start - total) / (items.length - 1);
    var cursor = start;
    var shift = {};
    items.forEach(function (it) {
      shift[it.el.id] = cursor - it.b[pos];
      cursor += it.b[size] + gap;
    });
    store.checkpoint();
    store.update(items.map(function (it) { return it.el.id; }), function (el) {
      var p = {};
      p[pos] = Math.round((el[pos] + shift[el.id]) * 10) / 10;
      return p;
    });
  }

  function iconBtn(icon, title, onClick, extraClass) {
    return h("button.wp-btn.wp-btn--icon" + (extraClass ? "." + extraClass : ""), { type: "button", title: title, "aria-label": title, on: { click: onClick } }, util.icon(icon, 16));
  }

  // ---- sections: frame ---------------------------------------------------------------
  function frameSection(list) {
    var single = list.length === 1;
    var el = list[0];
    var content = [];
    if (single) {
      var numF = function (label, key, opts) {
        return track(C.num(Object.assign({
          label: label,
          get: function () { var e = first(); return e ? (key === "h" ? geom.frame(e).h : e[key]) : 0; },
          set: function (v) { var p = {}; p[key] = v; setAll(p); },
        }, opts || {})));
      };
      var locked = function () { var e = first(); return !e || e.locked; };
      content.push(h("div.wp-grid2", null,
        numF("X", "x", { disabled: locked }), numF("Y", "y", { disabled: locked }),
        numF("B", "w", { min: 1, disabled: locked }),
        el.type === "line" ? numF("Tykk.", "h", { min: 4, disabled: function () { return true; } }) :
          numF("H", "h", { min: 1, disabled: function () { var e = first(); return !e || e.locked || e.type === "text"; } })
      ));
      content.push(h("div.wp-grid2", null,
        numF("↻", "rot", { min: -360, max: 360, suffix: "°", disabled: locked }),
        h("div.wp-hint-sm", null, el.type === "text" ? "Høyden følger teksten" : "")
      ));
      var tgt = C.seg({
        options: [{ value: "board", label: "Tegneflate" }, { value: "safe", label: "Sikker sone" }],
        get: function () { return alignTarget; },
        set: function (v) { alignTarget = v; },
      });
      content.push(C.row("Juster mot", track(tgt)));
    }
    content.push(h("div.wp-btnrow", null,
      iconBtn("align-start-vertical", "Venstre", function () { align("left"); }),
      iconBtn("align-center-vertical", "Midtstill vannrett", function () { align("hcenter"); }),
      iconBtn("align-end-vertical", "Høyre", function () { align("right"); }),
      iconBtn("align-start-horizontal", "Topp", function () { align("top"); }),
      iconBtn("align-center-horizontal", "Midtstill loddrett", function () { align("vcenter"); }),
      iconBtn("align-end-horizontal", "Bunn", function () { align("bottom"); })
    ));
    if (list.length >= 3) {
      content.push(h("div.wp-btnrow", null,
        h("button.wp-btn.wp-btn--ghost.wp-btn--sm", { type: "button", on: { click: function () { distribute("x"); } } }, util.icon("align-horizontal-distribute-center", 14), "Fordel vannrett"),
        h("button.wp-btn.wp-btn--ghost.wp-btn--sm", { type: "button", on: { click: function () { distribute("y"); } } }, util.icon("align-vertical-distribute-center", 14), "Fordel loddrett")
      ));
    }
    content.push(h("div.wp-btnrow", null,
      h("span.wp-row__lab", null, "Lag"),
      iconBtn("bring-to-front", "Fremst (Ctrl+Shift+])", function () { store.checkpoint(); store.reorder(ids(), "front"); }),
      iconBtn("arrow-up", "Et hakk frem (Ctrl+])", function () { store.checkpoint(); store.reorder(ids(), "forward"); }),
      iconBtn("arrow-down", "Et hakk bak (Ctrl+[)", function () { store.checkpoint(); store.reorder(ids(), "backward"); }),
      iconBtn("send-to-back", "Bakerst (Ctrl+Shift+[)", function () { store.checkpoint(); store.reorder(ids(), "back"); })
    ));
    return C.section(single ? "Plassering" : "Plassering og justering", content);
  }

  // ---- sections: effects ---------------------------------------------------------------
  function effectsSection(list) {
    var el = list[0];
    var content = [];
    content.push(track(C.slider({
      label: "Synlighet", min: 0, max: 100, reset: 100,
      get: function () { var e = first(); return e ? Math.round(e.opacity * 100) : 100; },
      set: function (v) { setAll({ opacity: v / 100 }); },
      format: function (v) { return v + "%"; },
    })));
    content.push(track(C.slider({
      label: "Uskarphet", min: 0, max: 40, step: 0.5, reset: 0,
      get: function () { var e = first(); return e ? e.blur : 0; },
      set: function (v) { setAll({ blur: v }); },
      format: function (v) { return v + " px"; },
    })));

    var shadowOn = C.toggle({
      label: "Skygge", icon: "box",
      get: function () { var e = first(); return !!(e && e.shadow); },
      set: function (on) { setAll({ shadow: on ? { x: 0, y: 8, blur: 24, color: "#00000059" } : null }); rebuild(); },
    });
    content.push(C.row(null, track(shadowOn)));
    if (el.shadow) {
      var sh = function (key, label, min, max) {
        return track(C.num({
          label: label, min: min, max: max,
          get: function () { var e = first(); return e && e.shadow ? e.shadow[key] : 0; },
          set: function (v) { store.update(ids(), function (e) { var s = Object.assign({}, e.shadow || { x: 0, y: 8, blur: 24, color: "#00000059" }); s[key] = v; return { shadow: s }; }); },
        }));
      };
      content.push(h("div.wp-grid3", null, sh("x", "X", -200, 200), sh("y", "Y", -200, 200), sh("blur", "Uskarp", 0, 200)));
      content.push(C.row("Skyggefarge", track(C.color({
        get: function () { var e = first(); return e && e.shadow ? e.shadow.color : "#00000059"; },
        set: function (v) { store.update(ids(), function (e) { return { shadow: Object.assign({}, e.shadow, { color: v || "#00000000" }) }; }); },
      }))));
    }

    var blends = [
      ["normal", "Normal"], ["multiply", "Multipliser"], ["screen", "Skjerm"], ["overlay", "Overlegg"],
      ["darken", "Mørkere"], ["lighten", "Lysere"], ["color-dodge", "Farge-lysning"], ["color-burn", "Farge-brenning"],
      ["soft-light", "Mykt lys"], ["hard-light", "Hardt lys"], ["difference", "Differanse"],
    ].map(function (b) { return { value: b[0], label: b[1] }; });
    content.push(C.row("Blanding", track(C.select({
      options: blends,
      get: function () { var e = first(); return e ? e.blend : "normal"; },
      set: function (v) { setAll({ blend: v }); },
    }))));
    content.push(C.row("Hover", track(C.select({
      options: [
        { value: "none", label: "Ingen" }, { value: "lift", label: "Løft opp" }, { value: "grow", label: "Forstørr litt" },
        { value: "brighten", label: "Lysere" }, { value: "dim", label: "Mørkere" },
      ],
      get: function () { var e = first(); return e ? e.hover : "none"; },
      set: function (v) { setAll({ hover: v }); },
    }))));
    content.push(h("p.wp-note", null, "Hover virker bare i HTML5-eksporten, når musen er over annonsen."));
    return C.section("Effekter", content, { collapsed: sectionState.effects !== false, onToggle: function (c) { sectionState.effects = c; } });
  }

  var sectionState = {};

  // ---- nothing selected: the artboard ----------------------------------------------------
  function artboardSections() {
    var spec = store.boardSpec();
    var out = [];
    out.push(C.section("Prosjekt", [
      C.row("Navn", track(C.text({
        placeholder: "Navn på wallpaper",
        get: function () { return store.state.doc.name; },
        set: function (v) { store.setDoc(Object.assign({}, store.state.doc, { name: v.slice(0, 80) || "Ny wallpaper" })); },
      }))),
    ]));
    out.push(C.section(spec.name + " · " + spec.width + "×" + spec.height, [
      C.row("Bakgrunn", track(C.fill({
        get: function () { return store.board().bg; },
        set: function (f) { store.setBoardProps({ bg: f || Doc.solid("#ffffff") }); },
        defaultColor: "#ffffff",
      })), { stack: true }),
      h("p.wp-note", null, spec.key === "background"
        ? "Bakgrunnen ligger bak hele siden. Midten dekkes av nettsiden, så logo, tilbud og knapper må ligge i sidefeltene innenfor den røde sikre sonen (1280×700)."
        : "Toppbanneret ligger øverst i innholdskolonnen, midt på siden. Hele banneret er synlig."),
    ]));
    out.push(WPE.preflight.section());
    out.push(C.section("Snarveier", [
      h("ul.wp-tips", null,
        h("li", null, h("b", null, "Dobbeltklikk"), " på tekst eller form for å skrive"),
        h("li", null, h("b", null, "Shift"), " + dra hjørne: fri skalering / låst akse"),
        h("li", null, h("b", null, "Alt"), " + dra: flytt uten magnet"),
        h("li", null, h("b", null, "Ctrl/⌘ + hjul"), " zoom · ", h("b", null, "Mellomrom"), " + dra: panorer"),
        h("li", null, h("b", null, "Ctrl/⌘ + D"), " dupliser · ", h("b", null, "Piltaster"), " flytt 1 px (Shift: 10)"),
        h("li", null, h("b", null, "Ctrl/⌘ + Z"), " angre · ", h("b", null, "Ctrl/⌘ + Shift + Z"), " gjør om")
      ),
    ], { collapsed: true }));
    return out;
  }

  // ---- header ---------------------------------------------------------------------------
  function header(list) {
    var title;
    if (!list.length) title = "Tegneflate";
    else if (list.length > 1) title = list.length + " elementer";
    else title = Doc.displayName(list[0]);
    var actions = h("div.wp-props__actions");
    if (list.length) {
      var allLocked = list.every(function (el) { return el.locked; });
      var allHidden = list.every(function (el) { return el.hidden; });
      actions.appendChild(iconBtn("copy", "Dupliser (Ctrl+D)", function () { WPE.keys.duplicate(); }));
      actions.appendChild(iconBtn(allLocked ? "lock" : "lock-open", allLocked ? "Lås opp" : "Lås", function () {
        store.checkpoint(); setAll({ locked: !allLocked }); rebuild();
      }, allLocked ? "is-on" : ""));
      actions.appendChild(iconBtn(allHidden ? "eye-off" : "eye", allHidden ? "Vis" : "Skjul", function () {
        store.checkpoint(); setAll({ hidden: !allHidden }); rebuild();
      }, allHidden ? "is-on" : ""));
      actions.appendChild(iconBtn("trash", "Slett (Delete)", function () { WPE.keys.removeSelection(); }, "is-danger"));
    }
    return h("header.wp-props__head", null, h("h3", { title: title }, title), actions);
  }

  // ---- build / sync ---------------------------------------------------------------------
  function sig() {
    var list = store.selected();
    return store.state.view.board + "|" + list.map(function (el) {
      return el.id + ":" + el.type + ":" + (el.kind || "") + ":" + (el.locked ? 1 : 0) + ":" + (el.hidden ? 1 : 0) +
        ":" + (el.shadow ? 1 : 0) + ":" + (el.fill ? el.fill.type : "-") + ":" + (el.fit || "") +
        ":" + (el.style && el.style.gradient ? 1 : 0) + ":" + (el.text ? 1 : 0);
    }).join(",");
  }

  function rebuild() {
    if (!host) return;
    controls = [];
    var list = store.selected();
    signature = sig();
    var scroll = host.scrollTop;
    util.clear(host);
    host.appendChild(header(list));
    var body = h("div.wp-props__body");
    if (!list.length) {
      artboardSections().forEach(function (s) { body.appendChild(s); });
    } else {
      body.appendChild(frameSection(list));
      if (list.length === 1) {
        WPE.propsTypes.sections(list[0], track).forEach(function (s) { body.appendChild(s); });
      }
      body.appendChild(effectsSection(list));
    }
    host.appendChild(body);
    host.scrollTop = scroll;
  }

  function sync() {
    if (sig() !== signature) return rebuild();
    controls.forEach(function (c) { c.sync(); });
    var head = host.querySelector(".wp-props__head h3");
    var list = store.selected();
    if (head && list.length === 1) head.textContent = Doc.displayName(list[0]);
    WPE.preflight.refresh();
  }

  function mount(node) {
    host = node;
    store.subscribe(function (what) {
      if (what === "sel" || what === "board") rebuild();
      else if (what === "doc") sync();
    });
    rebuild();
  }

  WPE.props = { mount: mount, rebuild: rebuild, align: align, iconBtn: iconBtn };
})();
