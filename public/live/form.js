/* =========================================================================
   live/form.js — the form pieces the NT Live tab is built from: labelled
   fields, text/number/select/range/colour inputs, a segmented control and
   collapsible sections. Each control takes a value and an onChange, so
   main.js owns the state and this file owns no state at all.
   ========================================================================= */
(function () {
  "use strict";

  var NTLIVE = (window.NTLIVE = window.NTLIVE || {});
  var h = window.WPE.util.h;

  /** A label above a control, with an optional hint under the label. */
  function field(label, control, hint) {
    var wrap = h("div.lv-field");
    var lab = h("label.lv-field__label", null, label);
    if (control.id) lab.htmlFor = control.id;
    wrap.appendChild(lab);
    if (hint) wrap.appendChild(h("span.lv-field__hint", null, hint));
    wrap.appendChild(control);
    return wrap;
  }

  var uid = 0;
  function nextId(prefix) {
    uid++;
    return "lv-" + (prefix || "c") + "-" + uid;
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
    });
    el.addEventListener("input", function () { o.onChange(el.value); });
    if (o.onBlur) el.addEventListener("blur", function () { o.onBlur(el.value); });
    return el;
  }

  function textarea(o) {
    var el = h("textarea.lv-input.lv-textarea", { id: nextId("ta"), placeholder: o.placeholder || null, rows: o.rows || 5, spellcheck: "false" });
    el.value = o.value || "";
    el.addEventListener("input", function () { o.onChange(el.value); });
    return el;
  }

  function number(o) {
    var el = h("input.lv-input.lv-input--num", { type: "number", id: nextId("n"), min: o.min, max: o.max, step: o.step || 1, value: o.value });
    el.addEventListener("change", function () {
      var v = Number(el.value);
      if (!isFinite(v)) v = o.value;
      v = Math.max(o.min, Math.min(o.max, v));
      el.value = v;
      o.onChange(v);
    });
    return el;
  }

  /** A slider with its value shown beside it. fmt(value) → label. */
  function range(o) {
    var out = h("output.lv-range__out", null, o.fmt(o.value));
    var el = h("input.lv-range", { type: "range", id: nextId("r"), min: o.min, max: o.max, step: o.step || 1, value: o.value });
    el.addEventListener("input", function () {
      out.textContent = o.fmt(Number(el.value));
      o.onChange(Number(el.value));
    });
    var wrap = h("div.lv-range__row", null, el, out);
    wrap.id = el.id;
    return wrap;
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

  /** A row of buttons where one is active. items: [[value, label, title?]]. */
  function seg(o) {
    var wrap = h("div.segmented.lv-seg", { role: "group", "aria-label": o.label || null });
    o.items.forEach(function (it) {
      var b = h("button.seg", { type: "button", "data-val": it[0], title: it[2] || null }, it[1]);
      var active = String(it[0]) === String(o.value);
      if (active) b.classList.add("is-active");
      b.setAttribute("aria-pressed", active ? "true" : "false");
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(wrap.children, function (x) {
          x.classList.toggle("is-active", x === b);
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
        o.onChange(it[0]);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function checkbox(o) {
    var input = h("input", { type: "checkbox", id: nextId("cb") });
    input.checked = !!o.value;
    input.addEventListener("change", function () { o.onChange(input.checked); });
    var lab = h("label.lv-check", { htmlFor: input.id }, input, h("span", null, o.label));
    if (o.hint) lab.appendChild(h("span.lv-check__hint", null, o.hint));
    return lab;
  }

  function color(o) {
    var input = h("input.lv-color", { type: "color", id: nextId("col"), value: o.value });
    var hex = h("span.lv-color__hex", null, o.value);
    input.addEventListener("input", function () {
      hex.textContent = input.value;
      o.onChange(input.value);
    });
    var wrap = h("div.lv-color__row", null, input, hex);
    wrap.id = input.id;
    return wrap;
  }

  /** A collapsible group of fields. */
  function section(title, desc, children, open) {
    var det = h("details.lv-section", { open: open !== false });
    det.appendChild(h("summary.lv-section__sum", null, h("span.lv-section__title", null, title), desc ? h("span.lv-section__desc", null, desc) : null));
    var body = h("div.lv-section__body");
    children.forEach(function (c) { if (c) body.appendChild(c); });
    det.appendChild(body);
    return det;
  }

  function row() {
    var wrap = h("div.lv-row");
    Array.prototype.forEach.call(arguments, function (c) { if (c) wrap.appendChild(c); });
    return wrap;
  }

  NTLIVE.form = { field: field, text: text, textarea: textarea, number: number, range: range, select: select, seg: seg, checkbox: checkbox, color: color, section: section, row: row };
})();
