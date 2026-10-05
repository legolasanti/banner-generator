/* =========================================================================
   editor/controls.js — the property controls used by the side panels.

   Every control is built from a getter and a setter and returns
   { node, sync }. The panel calls sync() after each document change; a
   control that has focus is left alone so typing is never interrupted.

   Undo: a control calls store.checkpoint() when an interaction BEGINS (focus,
   pointerdown, opening a picker). Everything until the next checkpoint —
   every step of a slider drag — undoes as one.
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Fonts = window.WallpaperFonts;
  var Doc = window.WallpaperDoc;
  var util = WPE.util;
  var h = util.h;
  var store = WPE.store;

  function cp() {
    store.checkpoint();
  }

  // ---- colour helpers -----------------------------------------------------------
  function splitColor(c) {
    if (!c || c === "transparent") return { hex: "#000000", a: 0 };
    var s = c.slice(1);
    if (s.length === 3 || s.length === 4) s = s.split("").map(function (ch) { return ch + ch; }).join("");
    var a = s.length === 8 ? parseInt(s.slice(6), 16) / 255 : 1;
    return { hex: "#" + s.slice(0, 6).toLowerCase(), a: a };
  }
  function joinColor(hex, a) {
    if (a >= 0.999) return hex.toLowerCase();
    return hex.toLowerCase() + ("0" + Math.round(a * 255).toString(16)).slice(-2);
  }

  var PALETTE = [
    "#ffffff", "#f3f4f6", "#d1d5db", "#6b7280", "#1f2937", "#000000",
    "#1a6b1a", "#22852a", "#2fa84f", "#a7f3d0", "#0d9488", "#14b8a6",
    "#12305e", "#1d4ed8", "#3b82f6", "#bfe3ff", "#6d28d9", "#a855f7",
    "#e63946", "#c52b22", "#ec4899", "#f4a261", "#ff7a00", "#f5c542",
  ];

  /** Colours already used in the design, most useful first. */
  function docColors() {
    var seen = {};
    var out = [];
    function add(c) {
      if (!c || c === "transparent") return;
      var k = c.slice(0, 7);
      if (seen[k]) return;
      seen[k] = true;
      out.push(k);
    }
    function fill(f) {
      if (!f) return;
      if (f.type === "solid") add(f.color);
      else f.stops.forEach(function (s) { add(s.color); });
    }
    ["background", "topbanner"].forEach(function (key) {
      var b = store.state.doc.artboards[key];
      fill(b.bg);
      b.elements.forEach(function (el) {
        fill(el.fill);
        if (el.style) { add(el.style.color); fill(el.style.gradient); }
        if (el.stroke) add(el.stroke.color);
        if (el.border && el.border.width) add(el.border.color);
        if (el.type === "icon") add(el.color);
      });
    });
    return out.slice(0, 18);
  }

  function swatchRow(colors, onPick) {
    return h("div.wp-swatches", null, colors.map(function (c) {
      return h("button.wp-swatch", {
        type: "button", title: c, style: { background: c },
        on: { click: function () { onPick(c); } },
      });
    }));
  }

  /** The colour picker popover body. `set` gets called live while picking. */
  function colorPanel(get, set, allowNone) {
    var cur = splitColor(get());
    var native = h("input.wp-cp-native", { type: "color", value: cur.hex });
    var hexIn = h("input.wp-cp-hex", { type: "text", value: cur.hex.toUpperCase(), maxlength: 7, spellcheck: false });
    var alpha = h("input.wp-cp-alpha", { type: "range", min: 0, max: 100, value: Math.round(cur.a * 100) });
    var alphaOut = h("span.wp-cp-alphaout", null, Math.round(cur.a * 100) + "%");

    function apply(hex, a) {
      cur = { hex: hex, a: a };
      native.value = hex;
      if (document.activeElement !== hexIn) hexIn.value = hex.toUpperCase();
      alpha.value = Math.round(a * 100);
      alphaOut.textContent = Math.round(a * 100) + "%";
      set(joinColor(hex, a));
    }
    native.addEventListener("input", function () { apply(native.value, cur.a || 1); });
    hexIn.addEventListener("input", function () {
      var v = hexIn.value.trim();
      if (v[0] !== "#") v = "#" + v;
      if (/^#[0-9a-f]{6}$/i.test(v)) apply(v.toLowerCase(), cur.a || 1);
    });
    alpha.addEventListener("input", function () { apply(cur.hex, alpha.value / 100); });

    var eye = null;
    if (window.EyeDropper) {
      eye = h("button.wp-btn.wp-btn--icon", {
        type: "button", title: "Hent farge fra skjermen",
        on: {
          click: function () {
            new window.EyeDropper().open().then(function (r) { apply(r.sRGBHex.slice(0, 7), 1); }).catch(function () {});
          },
        },
      }, util.icon("pipette", 16));
    }
    var dc = docColors();
    return h("div.wp-cp", null,
      h("div.wp-cp-top", null, native, h("div.wp-cp-fields", null,
        h("div.wp-cp-row", null, hexIn, eye),
        h("div.wp-cp-row", null, h("span.wp-cp-lab", null, "Synlighet"), alpha, alphaOut)
      )),
      dc.length ? h("div.wp-cp-sec", null, h("span.wp-cp-lab", null, "I designet"), swatchRow(dc, function (c) { apply(c, 1); })) : null,
      h("div.wp-cp-sec", null, h("span.wp-cp-lab", null, "Palett"), swatchRow(PALETTE, function (c) { apply(c, 1); })),
      allowNone ? h("button.wp-btn.wp-btn--ghost.wp-cp-none", { type: "button", on: { click: function () { set(null); util.closePopover(); } } }, "Ingen farge") : null
    );
  }

  function swatchStyle(c) {
    if (!c) return { background: "repeating-conic-gradient(#d4d7cf 0 25%, #fff 0 50%) 0 0/8px 8px" };
    return { background: "linear-gradient(" + c + "," + c + "), repeating-conic-gradient(#d4d7cf 0 25%, #fff 0 50%) 0 0/8px 8px" };
  }

  // ---- controls ---------------------------------------------------------------------
  function color(o) {
    var chip = h("span.wp-colorbtn__chip");
    var text = h("span.wp-colorbtn__hex");
    var btn = h("button.wp-colorbtn", { type: "button", title: o.title || "Velg farge" }, chip, text);
    function sync() {
      var c = o.get();
      Object.assign(chip.style, { background: "" }, swatchStyle(c));
      text.textContent = c ? c.slice(0, 7).toUpperCase() + (c.length > 7 ? " " + Math.round(splitColor(c).a * 100) + "%" : "") : "Ingen";
    }
    btn.addEventListener("click", function () {
      cp();
      util.popover(btn, colorPanel(o.get, function (v) { o.set(v); sync(); }, o.allowNone));
    });
    sync();
    return { node: btn, sync: sync };
  }

  function num(o) {
    var input = h("input.wp-num__in", { type: "number", step: o.step || 1, min: o.min, max: o.max });
    var lab = h("span.wp-num__lab", { title: "Dra for å endre" }, o.label || "");
    var node = h("label.wp-num", null, lab, input, o.suffix ? h("span.wp-num__suf", null, o.suffix) : null);
    function clampV(v) {
      var n = Number(v);
      if (!isFinite(n)) return null;
      if (o.min !== undefined) n = Math.max(o.min, n);
      if (o.max !== undefined) n = Math.min(o.max, n);
      return n;
    }
    input.addEventListener("focus", cp);
    input.addEventListener("input", function () {
      var v = clampV(input.value);
      if (v !== null && input.value !== "") o.set(v);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") input.blur();
    });
    // Scrub: drag the label left/right to change the value.
    lab.addEventListener("pointerdown", function (e) {
      if (o.disabled && o.disabled()) return;
      e.preventDefault();
      cp();
      var x0 = e.clientX;
      var v0 = Number(o.get()) || 0;
      var step = o.step || 1;
      lab.setPointerCapture(e.pointerId);
      function move(ev) {
        var v = clampV(v0 + Math.round((ev.clientX - x0) / 2) * step * (ev.shiftKey ? 10 : 1));
        if (v !== null) { o.set(v); sync(); }
      }
      function up() {
        lab.removeEventListener("pointermove", move);
        lab.removeEventListener("pointerup", up);
      }
      lab.addEventListener("pointermove", move);
      lab.addEventListener("pointerup", up);
    });
    function sync() {
      var dis = !!(o.disabled && o.disabled());
      input.disabled = dis;
      node.classList.toggle("is-disabled", dis);
      if (document.activeElement === input) return;
      var v = o.get();
      var digits = o.digits === undefined ? (o.step && o.step < 1 ? 2 : 0) : o.digits;
      input.value = v === null || v === undefined ? "" : String(Math.round(v * Math.pow(10, digits)) / Math.pow(10, digits));
    }
    sync();
    return { node: node, sync: sync };
  }

  function slider(o) {
    var range = h("input.wp-range", { type: "range", min: o.min, max: o.max, step: o.step || 1 });
    var out = h("span.wp-slider__out");
    var node = h("div.wp-slider", null, o.label ? h("span.wp-slider__lab", null, o.label) : null, range, out);
    range.addEventListener("pointerdown", cp);
    range.addEventListener("keydown", cp);
    range.addEventListener("input", function () {
      o.set(Number(range.value));
      out.textContent = o.format ? o.format(Number(range.value)) : range.value;
    });
    range.addEventListener("dblclick", function () {
      if (o.reset === undefined) return;
      cp();
      o.set(o.reset);
      sync();
    });
    function sync() {
      var v = o.get();
      if (document.activeElement !== range) range.value = v;
      out.textContent = o.format ? o.format(v) : String(v);
    }
    sync();
    return { node: node, sync: sync };
  }

  function seg(o) {
    var node = h("div.wp-seg" + (o.wide ? ".wp-seg--wide" : ""), { role: "group" });
    var btns = o.options.map(function (opt) {
      var b = h("button.wp-seg__b", {
        type: "button", title: opt.title || opt.label || "",
        on: { click: function () { cp(); o.set(opt.value); sync(); } },
      }, opt.icon ? util.icon(opt.icon, 16) : null, opt.icon && !opt.showLabel ? null : opt.label);
      node.appendChild(b);
      return b;
    });
    function sync() {
      var v = o.get();
      btns.forEach(function (b, i) { b.classList.toggle("is-on", o.options[i].value === v); });
    }
    sync();
    return { node: node, sync: sync };
  }

  function toggle(o) {
    var b = h("button.wp-tog", {
      type: "button", title: o.title || "",
      on: { click: function () { cp(); o.set(!o.get()); sync(); } },
    }, o.icon ? util.icon(o.icon, 16) : null, o.label || null);
    function sync() {
      var on = !!o.get();
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    sync();
    return { node: b, sync: sync };
  }

  function select(o) {
    var s = h("select.wp-select", null, o.options.map(function (opt) {
      return h("option", { value: String(opt.value) }, opt.label);
    }));
    s.addEventListener("change", function () {
      cp();
      var opt = o.options.find(function (x) { return String(x.value) === s.value; });
      o.set(opt ? opt.value : s.value);
    });
    function sync() {
      if (o.options.refresh) o.options.refresh(s);
      s.value = String(o.get());
    }
    sync();
    return { node: h("div.wp-selectwrap", null, s), sync: sync, el: s };
  }

  function textarea(o) {
    var t = h("textarea.wp-textarea", { rows: o.rows || 3, placeholder: o.placeholder || "", maxlength: 2000 });
    t.addEventListener("focus", cp);
    t.addEventListener("input", function () { o.set(t.value); });
    function sync() {
      if (document.activeElement !== t) t.value = o.get() || "";
    }
    sync();
    return { node: t, sync: sync };
  }

  function text(o) {
    var t = h("input.wp-text", { type: "text", placeholder: o.placeholder || "", maxlength: o.max || 80, spellcheck: false });
    t.addEventListener("focus", cp);
    t.addEventListener("input", function () { o.set(t.value); });
    t.addEventListener("keydown", function (e) { if (e.key === "Enter") t.blur(); });
    function sync() {
      if (document.activeElement !== t) t.value = o.get() || "";
    }
    sync();
    return { node: t, sync: sync };
  }

  // ---- fills -----------------------------------------------------------------------
  var GRADIENTS = [
    [0, "#1a6b1a", "#2fa84f"], [90, "#12305e", "#3b82f6"], [135, "#f5c542", "#ff7a00"],
    [135, "#ec4899", "#6d28d9"], [180, "#bfe3ff", "#ffffff"], [90, "#e63946", "#f4a261"],
    [160, "#0f172a", "#334155"], [45, "#14b8a6", "#a7f3d0"],
  ].map(function (g) {
    return { type: "gradient", kind: "linear", angle: g[0], stops: [{ color: g[1], pos: 0 }, { color: g[2], pos: 100 }] };
  });

  /**
   * Solid / gradient / none. `o.get()` returns a doc Fill (or null); `o.set`
   * receives one. Used for backgrounds, shape fills and gradient text.
   */
  function fill(o) {
    var node = h("div.wp-fill");
    var modeSeg = null;
    var body = h("div.wp-fill__body");
    var parts = [];
    var mode = null;

    function currentMode() {
      var f = o.get();
      return !f ? "none" : f.type === "gradient" ? "gradient" : "solid";
    }

    function build() {
      mode = currentMode();
      util.clear(body);
      parts = [];
      var f = o.get();
      if (mode === "solid") {
        var c = color({ get: function () { var x = o.get(); return x && x.type === "solid" ? x.color : "#000000"; }, set: function (v) { o.set(v ? Doc.solid(v) : o.allowNone ? null : Doc.solid("#000000")); }, allowNone: o.allowNone });
        parts.push(c);
        body.appendChild(c.node);
      } else if (mode === "gradient") {
        buildGradient(f);
      }
    }

    function patchGrad(p) {
      var g = o.get();
      if (!g || g.type !== "gradient") return;
      o.set(Object.assign({}, g, p));
    }

    function buildGradient() {
      var kind = seg({
        options: [{ value: "linear", label: "Lineær" }, { value: "radial", label: "Radiell" }],
        get: function () { var g = o.get(); return g && g.kind; },
        set: function (v) { patchGrad({ kind: v }); build(); },
      });
      var angle = slider({
        label: "Vinkel", min: 0, max: 360, step: 1,
        get: function () { var g = o.get(); return g ? ((g.angle % 360) + 360) % 360 : 0; },
        set: function (v) { patchGrad({ angle: v }); },
        format: function (v) { return v + "°"; },
      });
      var stopsBox = h("div.wp-stops");
      var g = o.get();
      g.stops.forEach(function (s, i) {
        var col = color({
          get: function () { var gg = o.get(); return gg && gg.stops[i] ? gg.stops[i].color : "#000000"; },
          set: function (v) {
            var gg = o.get();
            if (!gg || !gg.stops[i]) return;
            var stops = gg.stops.slice();
            stops[i] = Object.assign({}, stops[i], { color: v || "#00000000" });
            patchGrad({ stops: stops });
          },
        });
        var pos = num({
          label: "", min: 0, max: 100, suffix: "%",
          get: function () { var gg = o.get(); return gg && gg.stops[i] ? gg.stops[i].pos : 0; },
          set: function (v) {
            var gg = o.get();
            if (!gg || !gg.stops[i]) return;
            var stops = gg.stops.slice();
            stops[i] = Object.assign({}, stops[i], { pos: v });
            patchGrad({ stops: stops });
          },
        });
        var del = g.stops.length > 2 ? h("button.wp-btn.wp-btn--icon", {
          type: "button", title: "Fjern fargestopp",
          on: { click: function () { cp(); var gg = o.get(); patchGrad({ stops: gg.stops.filter(function (_, j) { return j !== i; }) }); build(); } },
        }, util.icon("x", 14)) : null;
        parts.push(col, pos);
        stopsBox.appendChild(h("div.wp-stop", null, col.node, pos.node, del));
      });
      var add = g.stops.length < 6 ? h("button.wp-btn.wp-btn--ghost.wp-btn--sm", {
        type: "button",
        on: { click: function () { cp(); var gg = o.get(); var last = gg.stops[gg.stops.length - 1]; patchGrad({ stops: gg.stops.concat({ color: last.color, pos: 100 }) }); build(); } },
      }, "+ Fargestopp") : null;
      var presets = h("div.wp-gradpresets", null, GRADIENTS.map(function (pg) {
        return h("button.wp-gradpreset", {
          type: "button", title: "Bruk gradient", style: { background: window.WallpaperRender.fillCss(pg) },
          on: { click: function () { cp(); o.set(pg); build(); } },
        });
      }));
      parts.push(kind, angle);
      body.appendChild(kind.node);
      if (g.kind === "linear") body.appendChild(angle.node);
      body.appendChild(stopsBox);
      if (add) body.appendChild(add);
      body.appendChild(presets);
    }

    var modes = [];
    if (o.allowNone) modes.push({ value: "none", label: "Ingen" });
    modes.push({ value: "solid", label: "Farge" }, { value: "gradient", label: "Gradient" });
    modeSeg = seg({
      options: modes,
      get: currentMode,
      set: function (v) {
        var f = o.get();
        if (v === "none") o.set(null);
        else if (v === "solid") o.set(Doc.solid(f && f.type === "gradient" ? f.stops[0].color : (f && f.color) || o.defaultColor || "#1a6b1a"));
        else {
          var base = f && f.type === "solid" ? f.color.slice(0, 7) : o.defaultColor || "#1a6b1a";
          o.set({ type: "gradient", kind: "linear", angle: 90, stops: [{ color: base, pos: 0 }, { color: "#ffffff", pos: 100 }] });
        }
        build();
      },
    });
    node.appendChild(modeSeg.node);
    node.appendChild(body);
    build();
    return {
      node: node,
      sync: function () {
        modeSeg.sync();
        if (currentMode() !== mode) build();
        else parts.forEach(function (p) { p.sync(); });
      },
    };
  }

  // ---- font picker -------------------------------------------------------------------
  function fontList(current, onPick) {
    var search = h("input.wp-fp-search", { type: "search", placeholder: "Søk blant " + Fonts.FAMILIES.length + " skrifter …" });
    var cat = "all";
    var chips = h("div.wp-fp-cats");
    var list = h("div.wp-fp-list");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        WPE.fontload.preview(en.target.dataset.family);
        io.unobserve(en.target);
      });
    }, { root: list });
    var used = {};
    ["background", "topbanner"].forEach(function (k) {
      store.state.doc.artboards[k].elements.forEach(function (el) { if (el.style) used[el.style.font] = true; });
    });

    function row(fam) {
      var r = h("button.wp-fp-item" + (fam.f === current ? ".is-on" : ""), {
        type: "button", dataset: { family: fam.f },
        style: { fontFamily: Fonts.stack(fam.f) },
        on: { click: function () { onPick(fam.f); util.closePopover(); } },
      }, fam.f, h("span.wp-fp-meta", null, fam.w.length + (fam.w.length === 1 ? " vekt" : " vekter") + (fam.i.length ? " · kursiv" : "")));
      io.observe(r);
      return r;
    }

    function render() {
      var q = search.value.trim().toLowerCase();
      util.clear(list);
      var fams = Fonts.FAMILIES.filter(function (f) {
        return (cat === "all" || f.c === cat) && (!q || f.f.toLowerCase().indexOf(q) !== -1);
      });
      // Names that START with the query first: "play" → Playfair before Red Hat Display.
      if (q) {
        fams = fams.slice().sort(function (a, b) {
          return (a.f.toLowerCase().indexOf(q) === 0 ? 0 : 1) - (b.f.toLowerCase().indexOf(q) === 0 ? 0 : 1);
        });
      }
      var inDoc = fams.filter(function (f) { return used[f.f]; });
      if (inDoc.length && !q && cat === "all") {
        list.appendChild(h("div.wp-fp-head", null, "I designet"));
        inDoc.forEach(function (f) { list.appendChild(row(f)); });
        list.appendChild(h("div.wp-fp-head", null, "Alle skrifter"));
      }
      fams.forEach(function (f) { list.appendChild(row(f)); });
      if (!fams.length) list.appendChild(h("div.wp-empty-sm", null, "Ingen treff"));
    }
    [{ id: "all", label: "Alle" }].concat(Fonts.CATEGORIES).forEach(function (c) {
      var b = h("button.wp-chip" + (c.id === cat ? ".is-on" : ""), {
        type: "button",
        on: { click: function () { cat = c.id; chips.querySelectorAll(".wp-chip").forEach(function (x) { x.classList.toggle("is-on", x === b); }); render(); } },
      }, c.label);
      chips.appendChild(b);
    });
    search.addEventListener("input", render);
    render();
    setTimeout(function () { search.focus(); }, 30);
    return h("div.wp-fp", null, search, chips, list);
  }

  function font(o) {
    var btn = h("button.wp-fontbtn", { type: "button" });
    function sync() {
      var f = o.get();
      btn.textContent = f;
      btn.style.fontFamily = Fonts.stack(f);
      WPE.fontload.preview(f);
    }
    btn.addEventListener("click", function () {
      cp();
      util.popover(btn, fontList(o.get(), function (fam) {
        WPE.fontload.ensure(fam);
        o.set(fam);
        sync();
      }), { className: "wp-pop--fonts" });
    });
    sync();
    return { node: btn, sync: sync };
  }

  // ---- layout helpers ----------------------------------------------------------------
  function row(label, content, opts) {
    return h("div.wp-row" + (opts && opts.stack ? ".wp-row--stack" : ""), null,
      label ? h("span.wp-row__lab", null, label) : null,
      h("div.wp-row__ctl", null, content));
  }

  function section(title, content, opts) {
    var o = opts || {};
    var body = h("div.wp-sec__body", null, content);
    var head = h("button.wp-sec__head", { type: "button", "aria-expanded": o.collapsed ? "false" : "true" },
      h("span", null, title), o.extra || null, util.icon("chevron-down", 14));
    var sec = h("section.wp-sec" + (o.collapsed ? ".is-collapsed" : ""), null, head, body);
    head.addEventListener("click", function (e) {
      if (e.target.closest(".wp-sec__extra")) return;
      var collapsed = sec.classList.toggle("is-collapsed");
      head.setAttribute("aria-expanded", collapsed ? "false" : "true");
      if (o.onToggle) o.onToggle(collapsed);
    });
    return sec;
  }

  WPE.controls = {
    color: color,
    num: num,
    slider: slider,
    seg: seg,
    toggle: toggle,
    select: select,
    textarea: textarea,
    text: text,
    fill: fill,
    font: font,
    row: row,
    section: section,
    splitColor: splitColor,
    joinColor: joinColor,
    PALETTE: PALETTE,
    GRADIENTS: GRADIENTS,
  };
})();
