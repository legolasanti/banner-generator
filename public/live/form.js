/* =========================================================================
   live/form.js — the controls the NT Live tab is built from: labelled
   fields, text/number/select/range inputs, segmented controls, switches,
   colour swatches and cards. Each control takes a value and an onChange,
   so the panels own the state and this file owns none.
   ========================================================================= */
(function () {
  "use strict";

  var NTLIVE = (window.NTLIVE = window.NTLIVE || {});
  var h = window.WPE.util.h;
  var icon = NTLIVE.icon;

  var uid = 0;
  function nextId(prefix) {
    uid++;
    return "lv-" + (prefix || "c") + "-" + uid;
  }

  /** A label above a control, with an optional hint under it. */
  function field(label, control, hint, opts) {
    var o = opts || {};
    var wrap = h("div.lv-field" + (o.className ? "." + o.className : ""));
    var labelFor = control && (control.getAttribute && (control.getAttribute("data-for") || control.id));
    var head = h("div.lv-field__head", null, h("label.lv-field__label", labelFor ? { for: labelFor } : null, label));
    if (o.aside) head.appendChild(h("span.lv-field__aside", null, o.aside));
    wrap.appendChild(head);
    wrap.appendChild(control);
    if (hint) wrap.appendChild(h("p.lv-field__hint", null, hint));
    return wrap;
  }

  function text(o) {
    var el = h("input.lv-input", {
      type: o.type || "text",
      id: nextId("t"),
      value: o.value == null ? "" : o.value,
      placeholder: o.placeholder || null,
      maxlength: o.maxLength || null,
      spellcheck: "false",
      autocomplete: "off",
      "aria-label": o.ariaLabel || null,
    });
    el.addEventListener("input", function () { o.onChange(el.value); });
    if (o.onEnter) {
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          o.onEnter(el.value);
        }
      });
    }
    if (o.onBlur) el.addEventListener("blur", function () { o.onBlur(el.value); });
    return el;
  }

  function textarea(o) {
    var el = h("textarea.lv-input.lv-textarea", { id: nextId("ta"), placeholder: o.placeholder || null, rows: o.rows || 5, spellcheck: "false" });
    el.value = o.value || "";
    el.addEventListener("input", function () { o.onChange(el.value); });
    return el;
  }

  /** A number with − / + steppers; the value is clamped to [min, max]. */
  function number(o) {
    var id = nextId("n");
    var input = h("input.lv-num__input", { type: "number", id: id, min: o.min, max: o.max, step: o.step || 1, value: o.value, inputmode: "numeric" });
    function commit(v) {
      var n = Number(v);
      if (!isFinite(n)) n = o.value;
      n = Math.max(o.min, Math.min(o.max, n));
      input.value = n;
      o.onChange(n);
    }
    var minus = h("button.lv-num__btn", { type: "button", "aria-label": "Mindre", tabindex: "-1" }, "−");
    var plus = h("button.lv-num__btn", { type: "button", "aria-label": "Mer", tabindex: "-1" }, "+");
    minus.addEventListener("click", function () { commit(Number(input.value) - (o.step || 1)); });
    plus.addEventListener("click", function () { commit(Number(input.value) + (o.step || 1)); });
    input.addEventListener("change", function () { commit(input.value); });
    var wrap = h("div.lv-num", { "data-for": id }, minus, input, o.unit ? h("span.lv-num__unit", null, o.unit) : null, plus);
    return wrap;
  }

  /** A slider with its value shown beside it. fmt(value) → label. */
  function range(o) {
    var out = h("output.lv-range__out", null, o.fmt(o.value));
    var el = h("input.lv-range", { type: "range", id: nextId("r"), min: o.min, max: o.max, step: o.step || 1, value: o.value });
    function paint() {
      var pct = ((Number(el.value) - o.min) / (o.max - o.min)) * 100;
      el.style.setProperty("--fill", pct + "%");
    }
    el.addEventListener("input", function () {
      out.textContent = o.fmt(Number(el.value));
      paint();
      o.onChange(Number(el.value));
    });
    paint();
    return h("div.lv-range__row", { "data-for": el.id }, el, out);
  }

  function select(o) {
    var el = h("select.lv-input.lv-select", { id: nextId("s") });
    o.options.forEach(function (opt) {
      var option = h("option", { value: opt[0] }, opt[1]);
      if (String(opt[0]) === String(o.value)) option.selected = true;
      el.appendChild(option);
    });
    el.addEventListener("change", function () { o.onChange(el.value); });
    return el;
  }

  /** A row of buttons where one is active. items: [[value, label, title?, iconName?]]. */
  function seg(o) {
    var wrap = h("div.lv-seg" + (o.size === "sm" ? ".lv-seg--sm" : "") + (o.block ? ".lv-seg--block" : ""), { role: "radiogroup", "aria-label": o.label || null });
    function setActive(value) {
      Array.prototype.forEach.call(wrap.children, function (x) {
        var on = x.getAttribute("data-val") === String(value);
        x.classList.toggle("is-active", on);
        x.setAttribute("aria-checked", on ? "true" : "false");
        x.tabIndex = on ? 0 : -1;
      });
    }
    o.items.forEach(function (it) {
      var b = h("button.lv-seg__btn", { type: "button", role: "radio", "data-val": String(it[0]), title: it[2] || null, "aria-label": !it[1] && it[2] ? it[2] : null }, it[3] ? icon(it[3], 14) : null, it[1] ? h("span", null, it[1]) : null);
      b.addEventListener("click", function () {
        setActive(it[0]);
        o.onChange(it[0]);
      });
      b.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        var sib = e.key === "ArrowRight" ? b.nextElementSibling || wrap.firstElementChild : b.previousElementSibling || wrap.lastElementChild;
        sib.focus();
        sib.click();
      });
      wrap.appendChild(b);
    });
    setActive(o.value);
    wrap.setValue = setActive;
    return wrap;
  }

  /** A switch with a label and an optional hint. */
  function toggle(o) {
    var input = h("input.lv-switch__input", { type: "checkbox", id: nextId("sw"), role: "switch" });
    input.checked = !!o.value;
    input.addEventListener("change", function () { o.onChange(input.checked); });
    var lab = h(
      "label.lv-switch",
      { for: input.id },
      input,
      h("span.lv-switch__track", { "aria-hidden": "true" }, h("span.lv-switch__thumb")),
      h("span.lv-switch__text", null, h("span.lv-switch__label", null, o.label), o.hint ? h("span.lv-switch__hint", null, o.hint) : null)
    );
    return lab;
  }

  function checkbox(o) {
    var input = h("input", { type: "checkbox", id: nextId("cb") });
    input.checked = !!o.value;
    input.addEventListener("change", function () { o.onChange(input.checked); });
    return h("label.lv-check", { for: input.id }, input, h("span.lv-check__box", { "aria-hidden": "true" }, icon("check", 12)), h("span.lv-check__label", null, o.label), o.aside ? h("span.lv-check__aside", null, o.aside) : null);
  }

  /** Preset swatches plus a free colour picker and hex field. */
  function color(o) {
    var value = o.value;
    var wrap = h("div.lv-colors");
    var swatches = h("div.lv-swatches", { role: "radiogroup", "aria-label": "Aksentfarge" });
    var picker = h("input.lv-colors__picker", { type: "color", value: value, "aria-label": "Velg egen farge" });
    var hex = h("input.lv-input.lv-colors__hex", { type: "text", value: value, maxlength: 7, spellcheck: "false", "aria-label": "Fargekode" });
    function set(v, from) {
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
      value = v.toLowerCase();
      if (from !== "picker") picker.value = value;
      if (from !== "hex") hex.value = value;
      Array.prototype.forEach.call(swatches.children, function (s) {
        var on = s.getAttribute("data-hex") === value;
        s.classList.toggle("is-active", on);
        s.setAttribute("aria-checked", on ? "true" : "false");
      });
      o.onChange(value);
    }
    (o.presets || []).forEach(function (p) {
      var b = h("button.lv-swatch", { type: "button", role: "radio", "data-hex": p.hex.toLowerCase(), title: p.name + " " + p.hex }, icon("check", 12));
      b.style.setProperty("--sw", p.hex);
      b.addEventListener("click", function () { set(p.hex.toLowerCase(), "swatch"); });
      swatches.appendChild(b);
    });
    picker.addEventListener("input", function () { set(picker.value, "picker"); });
    hex.addEventListener("input", function () {
      var v = hex.value.trim();
      if (v && v[0] !== "#") v = "#" + v;
      set(v, "hex");
    });
    var custom = h("label.lv-colors__custom", { title: "Egen farge" }, picker, h("span.lv-colors__chip", { style: { background: value } }));
    picker.addEventListener("input", function () { custom.lastChild.style.background = picker.value; });
    wrap.appendChild(swatches);
    wrap.appendChild(h("div.lv-colors__row", null, custom, hex));
    set(value, "init");
    return wrap;
  }

  /** A titled group of fields inside a panel. */
  function card(title, children, opts) {
    var o = opts || {};
    var c = h("section.lv-card" + (o.className ? "." + o.className : ""));
    if (title) {
      // Title and action share the first line, so the description below gets the full width.
      var bar = h("div.lv-card__titlebar", null, h("h3.lv-card__title", null, title), o.action || null);
      c.appendChild(h("header.lv-card__head", null, bar, o.desc ? h("p.lv-card__desc", null, o.desc) : null));
    }
    var body = h("div.lv-card__body");
    (children || []).forEach(function (ch) { if (ch) body.appendChild(ch); });
    c.appendChild(body);
    c.body = body;
    return c;
  }

  function row() {
    var wrap = h("div.lv-row");
    Array.prototype.forEach.call(arguments, function (c) { if (c) wrap.appendChild(c); });
    return wrap;
  }

  /** A button with an optional leading icon. kind: primary | ghost | quiet. */
  function button(label, opts) {
    var o = opts || {};
    var b = h("button.lv-btn.lv-btn--" + (o.kind || "ghost") + (o.size ? ".lv-btn--" + o.size : ""), { type: "button", title: o.title || o.ariaLabel || null, "aria-label": o.ariaLabel || null }, o.icon ? icon(o.icon, o.size === "sm" ? 14 : 16) : null, label ? h("span.lv-btn__label", null, label) : null);
    if (o.onClick) b.addEventListener("click", o.onClick);
    return b;
  }

  var NOTICE_TONE = { info: "info", warn: "warning", ok: "success" };

  /** A small note: info, warn or ok (the shared .notice, in the matching tone). */
  function note(kind, children) {
    return h("div.notice.notice--" + NOTICE_TONE[kind] + ".lv-note.lv-note--" + kind, null, icon(kind === "warn" ? "alert" : kind === "ok" ? "check" : "info", 15), h("div.lv-note__body", null, children));
  }

  NTLIVE.form = {
    field: field,
    text: text,
    textarea: textarea,
    number: number,
    range: range,
    select: select,
    seg: seg,
    toggle: toggle,
    checkbox: checkbox,
    color: color,
    card: card,
    row: row,
    button: button,
    note: note,
  };
})();
