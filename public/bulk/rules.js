/* =========================================================================
   bulk/rules.js — the text-size rules, editable.

   One card per house format: "up to N characters → X %" lines, the size for
   anything longer, and what the format can take at most. A test line at the
   top shows, for any headline typed into it, the size each format would
   actually get — the rule's answer and, where the renderer had to step it
   down, the final one.

   Saved into settings.json (settings.autoFit), so the whole team shares one
   set of rules. A format left at its defaults is not stored at all, so a
   later re-measurement of the defaults reaches it.
   ========================================================================= */
(function () {
  "use strict";

  var BULK = (window.BULK = window.BULK || {});
  var store = BULK.store;
  var state = BULK.state;
  var F = window.BannerFormats;
  var A = window.BannerAutofit;
  var h = window.WPE.util.h;

  var MAX_TIERS = 8;
  var dom = null;
  var draft = {}; // label → {min, tiers}
  var lastFocus = null;

  function pct(n) {
    return Math.round(n * 100);
  }

  function defaultsFor(spec) {
    return { min: spec.autoFit.min, max: spec.autoFit.max, tiers: spec.autoFit.tiers.map(function (t) { return t.slice(); }) };
  }

  function loadDraft() {
    draft = {};
    store.allSpecs().forEach(function (spec) {
      var r = F.autoFitRule(spec, state.rules);
      draft[spec.label] = { min: r.min, max: r.max, tiers: r.tiers.map(function (t) { return t.slice(); }) };
    });
  }

  function isDefault(spec) {
    var d = defaultsFor(spec);
    var c = draft[spec.label];
    return JSON.stringify([d.min, d.tiers]) === JSON.stringify([c.min, c.tiers]);
  }

  function numberInput(value, min, max, step, label, onChange) {
    var input = h("input.bk-num-in", { type: "number", min: min, max: max, step: step, value: value, "aria-label": label });
    input.addEventListener("change", function () {
      var v = Number(input.value);
      if (!isFinite(v)) return;
      onChange(Math.max(min, Math.min(max, v)));
    });
    return input;
  }

  function card(spec) {
    var rule = draft[spec.label];
    var body = h("div.bk-rule__tiers");
    rule.tiers.forEach(function (t, i) {
      var del = h("button.bk-rule__del", { type: "button", title: "Fjern linjen", "aria-label": "Fjern linjen" }, "×");
      del.addEventListener("click", function () {
        rule.tiers.splice(i, 1);
        redraw();
      });
      body.appendChild(
        h(
          "div.bk-rule__line",
          null,
          h("span", null, "Opptil"),
          numberInput(t[0], 1, 500, 1, "Antall tegn", function (v) {
            t[0] = Math.round(v);
            rule.tiers.sort(function (a, b) { return a[0] - b[0]; });
            redraw();
          }),
          h("span", null, "tegn →"),
          numberInput(pct(t[1]), 50, 160, 5, "Tekststørrelse i prosent", function (v) {
            t[1] = Math.round(v) / 100;
            redraw();
          }),
          h("span", null, "%"),
          del
        )
      );
    });
    var add = h("button.bk-link", { type: "button", disabled: rule.tiers.length >= MAX_TIERS }, "+ linje");
    add.addEventListener("click", function () {
      var last = rule.tiers[rule.tiers.length - 1];
      rule.tiers.push([last ? last[0] + 10 : 30, last ? Math.max(rule.min, last[1] - 0.1) : 1]);
      redraw();
    });
    var reset = h("button.bk-link", { type: "button", hidden: isDefault(spec) }, "Standard");
    reset.addEventListener("click", function () {
      draft[spec.label] = defaultsFor(spec);
      redraw();
    });
    var last = rule.tiers.length ? rule.tiers[rule.tiers.length - 1][0] : 0;
    return h(
      "section.bk-rule" + (isDefault(spec) ? "" : ".is-changed"),
      null,
      h("header.bk-rule__head", null, h("b", null, spec.width + "×" + spec.height), h("span", null, spec.name), h("span.bk-toolbar__spacer"), reset),
      body,
      h(
        "div.bk-rule__line.bk-rule__line--rest",
        null,
        h("span", null, "Lengre enn " + last + " tegn →"),
        numberInput(pct(rule.min), 50, 100, 5, "Minste tekststørrelse", function (v) {
          rule.min = Math.round(v) / 100;
          redraw();
        }),
        h("span", null, "%")
      ),
      h("div.bk-rule__foot", null, add, h("span.bk-rule__max", null, "Får plass: maks ca. " + spec.autoFit.maxChars + " tegn"))
    );
  }

  function testRow() {
    var text = dom.test.value.replace(/\s+/g, " ").trim();
    dom.testOut.innerHTML = "";
    if (!text) return;
    var n = A.countChars(text);
    dom.testOut.appendChild(h("span.bk-test__n", null, n + " tegn:"));
    BULK.fit.loadFonts().then(function () {
      store.allSpecs().forEach(function (spec) {
        var rule = A.cleanRule(draft[spec.label], spec.autoFit);
        var r = A.fit(spec.type, { product: BULK.PRODUCT, headline: text, houseWeight: state.weight }, rule);
        var label = !r.fits ? "for lang" : r.scale < r.ruleScale ? pct(r.ruleScale) + " → " + pct(r.scale) + " %" : pct(r.scale) + " %";
        dom.testOut.appendChild(h("span.bk-test__chip" + (r.fits ? "" : ".is-bad"), null, h("b", null, spec.width + "×" + spec.height), label));
      });
    });
  }

  function redraw() {
    dom.cards.innerHTML = "";
    store.allSpecs().forEach(function (spec) { dom.cards.appendChild(card(spec)); });
    testRow();
  }

  function build() {
    dom = {};
    dom.cards = h("div.bk-rules");
    dom.test = h("input.bk-input", { type: "text", placeholder: "Skriv en overskrift for å se hvilken størrelse den får", maxlength: 200 });
    dom.testOut = h("div.bk-test__out");
    dom.test.addEventListener("input", testRow);
    dom.save = h("button.btn-primary", { type: "button" }, "Lagre regler");
    dom.save.addEventListener("click", save);
    var cancel = h("button.btn-ghost", { type: "button" }, "Avbryt");
    cancel.addEventListener("click", close);
    var resetAll = h("button.btn-ghost", { type: "button" }, "Alle til standard");
    resetAll.addEventListener("click", function () {
      store.allSpecs().forEach(function (spec) { draft[spec.label] = defaultsFor(spec); });
      redraw();
    });

    dom.root = h(
      "div.wp-modal.bk-rules-modal",
      { role: "dialog", "aria-modal": "true", "aria-label": "Tekststørrelse-regler" },
      h(
        "div.wp-modal__card",
        null,
        h("header.wp-modal__head", null, h("h2", null, "Tekststørrelse-regler")),
        h(
          "div.bk-rules__body",
          null,
          h(
            "p.bk-rules__intro",
            null,
            "Størrelsen velges ut fra antall tegn i overskriften, per format. Deretter sjekkes det at teksten faktisk får plass – ",
            "gjør den ikke det, settes den ned 5 % om gangen. Standardverdiene er målt med ekte norske overskrifter. Reglene gjelder for alle som bruker verktøyet."
          ),
          h("div.bk-test", null, dom.test, dom.testOut),
          dom.cards
        ),
        h("footer.wp-modal__foot", null, resetAll, h("span.bk-toolbar__spacer"), cancel, dom.save)
      )
    );
    dom.root.addEventListener("mousedown", function (e) {
      if (e.target === dom.root) close();
    });
    dom.root.addEventListener("keydown", function (e) {
      BULK.ui.trapTab(dom.root, e);
      if (e.key === "Escape") close();
    });
  }

  function open() {
    if (!dom) build();
    loadDraft();
    lastFocus = document.activeElement;
    document.body.appendChild(dom.root);
    redraw();
    dom.test.focus();
  }

  function close() {
    if (dom && dom.root.isConnected) dom.root.remove();
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function save() {
    var overrides = {};
    store.allSpecs().forEach(function (spec) {
      if (isDefault(spec)) return;
      var r = draft[spec.label];
      overrides[spec.label] = { min: r.min, max: spec.autoFit.max, tiers: r.tiers };
    });
    dom.save.disabled = true;
    // Only the rules go to the server: sending the whole settings object back
    // would undo whatever someone changed in Innstillinger meanwhile.
    fetch("/api/bulk/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoFit: overrides }),
    })
      .then(BULK.source.readJson)
      .then(function (saved) {
        applyRules(saved.autoFit || {});
        BULK.settings = Object.assign({}, BULK.settings, { autoFit: saved.autoFit || {} });
        BULK.source.toast("Reglene er lagret", "ok");
        close();
      })
      .catch(function (err) { BULK.source.toast(err.message || "Kunne ikke lagre", "err"); })
      .then(function () { dom.save.disabled = false; });
  }

  /** New rules from the server: refit everything, and tell the single builder. */
  function applyRules(rules) {
    state.rules = rules || {};
    store.emit("rules");
    window.dispatchEvent(new CustomEvent("autofit:rules", { detail: state.rules }));
  }

  BULK.rules = { open: open, close: close, applyRules: applyRules };
})();
