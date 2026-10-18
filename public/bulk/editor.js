/* =========================================================================
   bulk/editor.js — one row up close.

   Left: the whole photo with a focus point to drag (one point serves every
   format: it sits at the same relative spot in each crop), zoom, a way to
   swap the photo, and the row's text and settings. Right: every chosen
   format at a readable size, each with its own text size — "Auto" follows
   the rules, switching it off gives a slider.

   Alt+← / Alt+→ step through the rows the list showed when the editor was
   opened, in its order — the same rows even when fixing one takes it out of
   the «Feil» filter — and Esc closes. The focus point moves with the arrow
   keys too (Shift for bigger steps), and Tab stays inside the editor.
   ========================================================================= */
(function () {
  "use strict";

  var BULK = (window.BULK = window.BULK || {});
  var store = BULK.store;
  var state = BULK.state;
  var h = window.WPE.util.h;

  var HEADLINE_DEBOUNCE_MS = 160;
  var NUDGE = 1; // focus point step, in percent
  var NUDGE_BIG = 10;

  var dom = null;
  var current = null; // row
  var navList = []; // the rows Alt+←/→ walk through, fixed when the editor opens
  var focusType = null;
  var lastFocus = null;
  var sliding = false; // a size slider is being dragged

  /** The rows to step through: the list as it was, minus rows since removed. */
  function stepRows() {
    return navList.filter(function (r) { return state.rows.indexOf(r) !== -1; });
  }

  function build() {
    dom = {};
    dom.title = h("h2");
    dom.counter = h("span.bk-ed__counter");
    dom.prev = h("button.iconbtn", { type: "button", title: "Forrige rad (Alt+←)", "aria-label": "Forrige rad" }, "‹");
    dom.next = h("button.iconbtn", { type: "button", title: "Neste rad (Alt+→)", "aria-label": "Neste rad" }, "›");
    dom.close = h("button.btn-primary.btn-sm", { type: "button" }, "Ferdig");
    dom.duplicate = h("button.btn-ghost.btn-sm", { type: "button", title: "Lag en kopi av raden rett under" }, "Dupliser");
    dom.remove = h("button.btn-ghost.btn-sm.is-danger", { type: "button", title: "Fjern raden fra listen (regnearket endres ikke)" }, "Fjern");
    dom.duplicate.addEventListener("click", function () {
      store.flushEdits("ed:");
      var copy = store.duplicateRow(current);
      navList.splice(navList.indexOf(current) + 1, 0, copy);
      open(copy.rid);
    });
    dom.remove.addEventListener("click", function () {
      var row = current;
      if (!confirm("Fjerne denne raden fra listen? Regnearket endres ikke.")) return;
      var list = stepRows();
      var next = list[list.indexOf(row) + 1] || list[list.indexOf(row) - 1];
      store.flushEdits("ed:");
      store.removeRows([row]);
      if (next) open(next.rid);
      else close();
    });
    dom.prev.addEventListener("click", function () { step(-1); });
    dom.next.addEventListener("click", function () { step(1); });
    dom.close.addEventListener("click", close);

    // Photo + focus point
    dom.photo = h("img.bk-focus__img", { alt: "", draggable: "false" });
    dom.dot = h("span.bk-focus__dot", { "aria-hidden": "true" });
    dom.focusBox = h(
      "div.bk-focus",
      {
        title: "Dra punktet dit motivet er, eller bruk piltastene (Shift = større steg)",
        tabindex: "0",
        role: "slider",
        "aria-label": "Fokuspunkt i bildet. Piltastene flytter det, Shift gir større steg.",
        "aria-valuemin": "0",
        "aria-valuemax": "100",
      },
      dom.photo,
      dom.dot
    );
    dom.focusBox.addEventListener("keydown", nudgeFocus);
    dom.focusNote = h("span.bk-ed__note");
    dom.autoFocus = h("button.bk-link", { type: "button" }, "Automatisk");
    dom.autoFocus.addEventListener("click", function () { store.updateRow(current, { pos: null }); });
    dom.zoom = h("input", { type: "range", min: 0, max: 30, step: 1, "aria-label": "Zoom" });
    dom.zoomOut = h("output");
    dom.zoom.addEventListener("input", function () {
      dom.zoomOut.textContent = dom.zoom.value + " %";
      store.updateRow(current, { zoom: +dom.zoom.value }, { touch: true });
    });
    initDrag();

    dom.imgUrl = h("input.bk-input", { type: "url", placeholder: "Ny bildelenke", spellcheck: "false" });
    dom.imgFetch = h("button.btn-ghost.btn-sm", { type: "button" }, "Hent");
    dom.imgFile = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/avif,image/gif", hidden: true });
    dom.imgUpload = h("button.btn-ghost.btn-sm", { type: "button" }, "Last opp …");
    dom.imgFetch.addEventListener("click", function () {
      if (!dom.imgUrl.value.trim()) return dom.imgUrl.focus();
      BULK.source.setImageUrl(current, dom.imgUrl.value);
    });
    dom.imgUpload.addEventListener("click", function () { dom.imgFile.click(); });
    dom.imgFile.addEventListener("change", function () {
      var file = dom.imgFile.files[0];
      dom.imgFile.value = "";
      BULK.source.uploadImage(current, file).catch(function (err) { BULK.source.toast(err.message, "err"); });
    });
    dom.imgStatus = h("p.bk-ed__imgstatus", { "aria-live": "polite" });
    dom.imgAgain = h("button.bk-link", { type: "button", title: "Hent bildet fra lenken i arket en gang til" }, "Hent bildet på nytt");
    dom.imgAgain.addEventListener("click", function () { BULK.source.refetchImage(current); });

    // Text and settings
    dom.headline = h("textarea.bk-input", { rows: 3, maxlength: 200, "aria-label": "Overskrift" });
    dom.count = h("span.counter");
    dom.headline.addEventListener("input", function () {
      dom.count.textContent = window.BannerAutofit.countChars(dom.headline.value) + " tegn";
      // The row typed in, not whichever row is open when the timer fires.
      var row = current;
      var text = dom.headline.value;
      store.deferEdit("ed:" + row.rid, function () {
        if (state.rows.indexOf(row) === -1) return;
        store.updateRow(row, { headline: text.replace(/\s+/g, " ").trim() }, { refit: true });
      }, HEADLINE_DEBOUNCE_MS);
    });

    dom.weight = h("div.segmented.bk-seg", { role: "group", "aria-label": "Skrift" });
    [["", "Som resten"], ["bold", "Halvfet"], ["regular", "Normal"]].forEach(function (w) {
      var b = h("button.seg", { type: "button", "data-val": w[0] }, w[1]);
      b.addEventListener("click", function () { store.updateRow(current, { weight: w[0] }, { refit: true, touch: true }); });
      dom.weight.appendChild(b);
    });

    dom.filename = h("input.bk-input", { type: "text", maxlength: 60, placeholder: "lages fra overskriften" });
    dom.filename.addEventListener("input", function () { store.updateRow(current, { filename: dom.filename.value.trim() }, { touch: true }); });
    dom.fileOut = h("span.field__hint.bk-ed__fileout");
    dom.click = h("input.bk-input", { type: "url", placeholder: "https://… (bare for HTML5)", spellcheck: "false" });
    dom.click.addEventListener("input", function () { store.updateRow(current, { clickUrl: dom.click.value.trim() }, { touch: true }); });
    dom.include = h("input", { type: "checkbox" });
    dom.include.addEventListener("change", function () { store.updateRow(current, { include: dom.include.checked }); });
    dom.issues = h("ul.bk-issues.bk-issues--ed");

    var field = function (label, control, extra) {
      return h("div.bk-ed__field", null, h("label.field__label", null, label, extra || null), control);
    };

    dom.previews = h("div.bk-ed__previews");

    var left = h(
      "div.bk-ed__left",
      null,
      h("h4", null, "Bilde", dom.focusNote, dom.autoFocus),
      dom.focusBox,
      h("div.slider", null, h("span.slider__name", null, "Zoom"), dom.zoom, dom.zoomOut),
      h("div.bk-ed__imgline", null, dom.imgStatus, dom.imgAgain),
      h("div.bk-row", null, dom.imgUrl, dom.imgFetch, dom.imgUpload, dom.imgFile),
      h("h4", null, "Tekst"),
      field("Overskrift", dom.headline, dom.count),
      field("Skrift", dom.weight),
      field("Filnavn", dom.filename, dom.fileOut),
      field("Klikk-lenke", dom.click),
      h("label.bk-check", null, dom.include, h("span", null, "Ta med i nedlastingen")),
      dom.issues,
      h("div.bk-ed__rowacts", null, dom.duplicate, dom.remove)
    );

    dom.root = h(
      "div.wp-modal.bk-ed",
      { role: "dialog", "aria-modal": "true", "aria-label": "Juster banner" },
      h(
        "div.wp-modal__card.bk-ed__card",
        null,
        h("header.wp-modal__head", null, dom.prev, dom.next, dom.title, dom.counter, dom.close),
        h("div.bk-ed__grid", null, left, h("div.bk-ed__right", null, dom.previews))
      )
    );
    dom.root.addEventListener("mousedown", function (e) {
      if (e.target === dom.root) close();
    });
    dom.root.addEventListener("keydown", onKey);
  }

  function onKey(e) {
    BULK.ui.trapTab(dom.root, e);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      step(e.key === "ArrowLeft" ? -1 : 1);
    }
  }

  // ---- focus point ------------------------------------------------------
  /** The rectangle the photo actually occupies inside the contain-fitted box. */
  function photoRect() {
    var box = dom.focusBox.getBoundingClientRect();
    var iw = dom.photo.naturalWidth;
    var ih = dom.photo.naturalHeight;
    if (!iw || !ih) return box;
    var s = Math.min(box.width / iw, box.height / ih);
    var w = iw * s;
    var hgt = ih * s;
    return { left: box.left + (box.width - w) / 2, top: box.top + (box.height - hgt) / 2, width: w, height: hgt };
  }

  function placeDot() {
    if (!current) return;
    var pos = store.positionOf(current);
    dom.focusBox.setAttribute("aria-valuenow", String(pos.x));
    dom.focusBox.setAttribute("aria-valuetext", pos.x + " % fra venstre, " + pos.y + " % fra toppen");
    var r = photoRect();
    var box = dom.focusBox.getBoundingClientRect();
    dom.dot.style.left = r.left - box.left + (pos.x / 100) * r.width + "px";
    dom.dot.style.top = r.top - box.top + (pos.y / 100) * r.height + "px";
  }

  /** Arrow keys move the focus point; Shift moves it ten times as far. */
  function nudgeFocus(e) {
    var moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    var m = moves[e.key];
    if (!m || e.altKey || e.metaKey || e.ctrlKey || !current || !current.image || current.image.status !== "ok") return;
    e.preventDefault();
    var step = e.shiftKey ? NUDGE_BIG : NUDGE;
    var pos = store.positionOf(current);
    var clamp = function (v) { return Math.max(0, Math.min(100, Math.round(v))); };
    store.updateRow(current, { pos: { x: clamp(pos.x + m[0] * step), y: clamp(pos.y + m[1] * step) } });
  }

  function initDrag() {
    var dragging = false;
    var move = function (e) {
      var r = photoRect();
      var x = Math.max(0, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100)));
      var y = Math.max(0, Math.min(100, Math.round(((e.clientY - r.top) / r.height) * 100)));
      store.updateRow(current, { pos: { x: x, y: y } });
    };
    dom.focusBox.addEventListener("pointerdown", function (e) {
      if (!current || !current.image || current.image.status !== "ok") return;
      dragging = true;
      dom.focusBox.setPointerCapture(e.pointerId);
      dom.focusBox.classList.add("is-dragging");
      move(e);
    });
    dom.focusBox.addEventListener("pointermove", function (e) {
      if (dragging) move(e);
    });
    var end = function () {
      dragging = false;
      dom.focusBox.classList.remove("is-dragging");
    };
    dom.focusBox.addEventListener("pointerup", end);
    dom.focusBox.addEventListener("pointercancel", end);
    dom.photo.addEventListener("load", placeDot);
  }

  // ---- previews ---------------------------------------------------------
  function renderPreviews() {
    var row = current;
    dom.previews.innerHTML = "";
    var data = store.bannerData(row);
    var width = Math.max(320, dom.previews.clientWidth - 8);
    store.specs().forEach(function (spec) {
      var f = row.fit[spec.type];
      var isManual = row.manual[spec.type] != null;
      var scale = store.scaleOf(row, spec.type);
      var wide = spec.width >= 700;
      var colW = wide ? width : (width - 16) / 2;
      var view = Math.min(1, (colW - 28) / spec.width);

      var bn = h("div.bn");
      var stage = h("div.preview-stage", null, h("div.preview-scaler", null, bn));
      stage.style.setProperty("--w", spec.width);
      stage.style.setProperty("--h", spec.height);
      stage.style.setProperty("--scale", view.toFixed(4));
      window.renderBanner(bn, spec.type, data);

      var auto = h("input", { type: "checkbox", checked: !isManual });
      var slider = h("input", { type: "range", min: 50, max: 160, step: 5, value: Math.round(scale * 100), disabled: !isManual, "aria-label": spec.name + " tekststørrelse" });
      var out = h("output", null, Math.round(scale * 100) + " %");
      auto.addEventListener("change", function () {
        var manual = Object.assign({}, row.manual);
        if (auto.checked) delete manual[spec.type];
        else manual[spec.type] = scale;
        store.updateRow(row, { manual: manual }, { refit: true });
      });
      // While the slider is held, only this banner is redrawn: rebuilding the
      // cards would replace the slider under the pointer and end the drag.
      slider.addEventListener("input", function () {
        sliding = true;
        out.textContent = slider.value + " %";
        var manual = Object.assign({}, row.manual);
        manual[spec.type] = +slider.value / 100;
        store.updateRow(row, { manual: manual }, { refit: true });
        window.renderBanner(bn, spec.type, store.bannerData(row));
      });
      slider.addEventListener("change", function () {
        sliding = false;
        renderSoon();
      });

      var note = "";
      if (f && !f.fits) note = window.BannerAutofit.describe(f);
      else if (f && !isManual && f.scale < f.ruleScale - 1e-6) note = "Regelen sier " + Math.round(f.ruleScale * 100) + " %, satt ned for å få plass";
      else if (f && !isManual) note = "Regel: " + f.chars + " tegn → " + Math.round(f.ruleScale * 100) + " %";

      var card = h(
        "article.pcard.bk-ed__pcard" + (wide ? ".pcard--wide" : "") + (f && !f.fits ? ".is-bad" : "") + (focusType === spec.type ? ".is-focus" : ""),
        null,
        h("header.pcard__head", null, h("span.pcard__name", null, spec.name), h("span.pcard__dim", null, spec.width + " × " + spec.height)),
        h("div.pcard__stage", null, stage),
        h(
          "div.bk-ed__size",
          null,
          h("label.bk-check", { title: "Følg tekststørrelse-reglene" }, auto, h("span", null, "Auto")),
          slider,
          out
        ),
        note ? h("p.bk-ed__fitnote" + (f && !f.fits ? ".is-bad" : ""), null, note) : null
      );
      dom.previews.appendChild(card);
    });
    if (focusType) {
      var target = dom.previews.querySelector(".is-focus");
      if (target) target.scrollIntoView({ block: "nearest" });
      focusType = null;
    }
  }

  function renderLeft() {
    var row = current;
    var list = stepRows();
    var idx = list.indexOf(row);
    dom.title.textContent = row.sheetRow ? "Rad " + row.sheetRow : "Banner";
    dom.counter.textContent = idx >= 0 ? idx + 1 + " av " + list.length : "";
    dom.prev.disabled = idx <= 0;
    dom.next.disabled = idx === -1 || idx >= list.length - 1;

    var img = row.image || {};
    if (img.status === "ok") {
      if (dom.photo.getAttribute("src") !== img.previewUrl) dom.photo.src = img.previewUrl;
      dom.focusBox.classList.remove("is-empty");
    } else {
      dom.photo.removeAttribute("src");
      dom.focusBox.classList.add("is-empty");
    }
    dom.imgStatus.textContent =
      img.status === "ok"
        ? (img.width ? img.width + "×" + img.height + " px" : "") + (row.imageUrl ? " · " + shorten(row.imageUrl) : "")
        : img.status === "error"
        ? img.error || "Bildet kunne ikke hentes"
        : img.status === "missing"
        ? "Ingen bildelenke i arket"
        : "Henter bilde …";
    dom.imgStatus.classList.toggle("is-bad", img.status === "error" || img.status === "missing");
    dom.imgAgain.hidden = !/^https?:\/\//i.test(row.imageUrl) || img.status === "loading" || img.status === "waiting";
    dom.focusNote.textContent = row.pos ? "· satt for hånd" : row.sheetFocus ? "· fra arket" : state.smartCrop && img.focus ? "· automatisk" : "· midten";
    dom.autoFocus.hidden = !row.pos;
    dom.zoom.value = row.zoom || 0;
    dom.zoomOut.textContent = (row.zoom || 0) + " %";
    placeDot();

    if (document.activeElement !== dom.headline && dom.headline.value !== row.headline) dom.headline.value = row.headline;
    dom.count.textContent = window.BannerAutofit.countChars(dom.headline.value) + " tegn";
    Array.prototype.forEach.call(dom.weight.children, function (b) {
      b.classList.toggle("is-active", b.dataset.val === (row.weight || ""));
    });
    if (document.activeElement !== dom.filename) dom.filename.value = row.filename;
    dom.fileOut.textContent = "→ " + store.fileBaseOf(row);
    dom.fileOut.title = "Navnet filene får i ZIP-en (uten format og filtype)";
    if (document.activeElement !== dom.click) dom.click.value = row.clickUrl;
    dom.click.placeholder = state.output.clickUrl ? state.output.clickUrl + " (standard)" : "https://… (bare for HTML5)";
    dom.include.checked = row.include;
    dom.issues.innerHTML = "";
    row.issues
      .filter(function (i) { return i.level !== "pending"; })
      .forEach(function (i) { dom.issues.appendChild(h("li.bk-issue.bk-issue--" + i.level, null, i.text)); });
  }

  function shorten(url) {
    var s = String(url);
    return s.length > 60 ? s.slice(0, 40) + "…" + s.slice(-16) : s;
  }

  function render() {
    if (!current) return;
    renderLeft();
    renderPreviews();
  }

  function open(rid, type) {
    var row = store.findRow(rid);
    if (!row) return;
    if (!dom) build();
    store.flushEdits(); // the card's headline, if it was still being typed
    // Another row: its own text in the fields, even the one that has focus
    // (renderLeft leaves a focused field alone so typing is not overwritten).
    if (row !== current) {
      dom.headline.value = row.headline;
      dom.filename.value = row.filename;
      dom.click.value = row.clickUrl;
    }
    current = row;
    focusType = type || null;
    dom.imgUrl.value = "";
    if (!dom.root.isConnected) {
      lastFocus = document.activeElement;
      navList = store.viewRows();
      if (navList.indexOf(row) === -1) navList = state.rows.slice();
      document.body.appendChild(dom.root);
    }
    requestAnimationFrame(function () {
      render();
      dom.headline.focus({ preventScroll: true });
    });
  }

  function step(dir) {
    store.flushEdits("ed:");
    var list = stepRows();
    var idx = list.indexOf(current);
    var next = list[idx + dir];
    if (next) open(next.rid);
  }

  function close() {
    if (!dom || !dom.root.isConnected) return;
    store.flushEdits("ed:");
    dom.root.remove();
    current = null;
    navList = [];
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  var queued = false;
  function renderSoon() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      if (!current) return;
      if (sliding) renderLeft();
      else render();
    });
  }

  store.on(function (what, payload) {
    if (!current || !dom || !dom.root.isConnected) return;
    if (what === "fit" && payload === current) renderSoon();
    else if (what === "row" && payload.row === current) renderSoon();
    else if (what === "evaluated" || what === "formats" || what === "crop") renderSoon();
    else if ((what === "rows" || what === "list") && state.rows.indexOf(current) === -1) close();
  });
  window.addEventListener("resize", function () {
    if (current) renderSoon();
  });

  BULK.editor = { open: open, close: close };
})();
