/* =========================================================================
   live/preview.js — the stage: the four Norsk Tipping formats running the
   real NT Live runtime as artboards (Desktop on its own row, ReadPeak,
   Mobil and Nyhetsgrid side by side under it, or one format in focus),
   a clock the user can move ("before kick-off", "during the match", "a day
   without matches"), playback controls and a strip of the matches in the
   rotation with the current one's progress.

   The previews ARE the creative: same live.js, same CSS, same template.
   The only difference from the package is that the rows come from the app,
   not from the sheet at serve time, and photos load from their links.
   ========================================================================= */
(function () {
  "use strict";

  var NTLIVE = (window.NTLIVE = window.NTLIVE || {});
  var h = window.WPE.util.h;
  var F = window.BannerFormats;
  var LD = window.LiveData;
  var form = NTLIVE.form;
  var icon = NTLIVE.icon;
  var BOARD_PAD = 28;
  var ROW_GAP = 28;
  var BEFORE_KICKOFF_MIN = 15;
  var INTO_MATCH_MIN = 25;

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  /** Date → value for <input type="datetime-local">, in the browser's zone. */
  function toLocalInput(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  /**
   * @param {HTMLElement} host
   * @param {Object} app  see main.js
   */
  function build(host, app) {
    var state = app.state;
    var specs = F.getProduct("norsktipping").specs;
    var config = null;
    var simulated = null; // Date, or null for "now"
    var playing = true;
    var cards = [];

    // ---- toolbar ------------------------------------------------------------
    var timeInput = h("input.lv-input.lv-time", { type: "datetime-local", "aria-label": "Vis annonsen slik den ser ut på dette tidspunktet", title: "Vis annonsen slik den ser ut på dette tidspunktet" });
    timeInput.value = toLocalInput(new Date());
    var presets = h("div.lv-presets.lv-seg.lv-seg--sm", { role: "group", "aria-label": "Hopp til et tidspunkt" });
    var PRESETS = [
      { id: "now", label: "Nå", title: "Klokka nå" },
      { id: "before", label: "Før avspark", title: BEFORE_KICKOFF_MIN + " min før neste kamp" },
      { id: "during", label: "Under kamp", title: INTO_MATCH_MIN + " min ut i neste kamp" },
      { id: "empty", label: "Uten kamper", title: "En dag uten kamper: reserveplakaten" },
    ];
    var presetBtns = {};
    PRESETS.forEach(function (p) {
      var b = h("button.lv-seg__btn.lv-preset", { type: "button", title: p.title, "aria-pressed": "false" }, p.label);
      b.addEventListener("click", function () { applyPreset(p.id); });
      presetBtns[p.id] = b;
      presets.appendChild(b);
    });

    var prevBtn = form.button("", { kind: "icon", size: "sm", icon: "left", ariaLabel: "Forrige kamp", title: "Forrige kamp (←)" });
    var playBtn = form.button("", { kind: "icon", size: "sm", icon: "pause", ariaLabel: "Pause", title: "Pause / spill (mellomrom)" });
    var nextBtn = form.button("", { kind: "icon", size: "sm", icon: "right", ariaLabel: "Neste kamp", title: "Neste kamp (→)" });

    // One control for what the board shows: all four formats, or one of
    // them large. (Two controls — Alle/Ett plus a format picker that appeared
    // on "Ett" — made the toolbar jump to a second row.)
    function viewValue() { return state.ui.layout === "fokus" ? "fokus:" + state.ui.focusKey : "alle"; }
    var viewSeg = form.seg({
      value: viewValue(),
      size: "sm",
      label: "Visning",
      items: [["alle", "Alle", "Alle fire formatene", "grid"]].concat(specs.map(function (s) { return ["fokus:" + s.key, s.name, s.name + " " + s.width + "×" + s.height + " – stort"]; })),
      onChange: function (v) {
        app.setUi(v === "alle" ? { layout: "alle" } : { layout: "fokus", focusKey: v.slice(6) });
        applyLayout();
      },
    });
    var bgSeg = form.seg({
      value: state.ui.bg,
      size: "sm",
      label: "Bakgrunn",
      items: [["rutenett", "", "Rutenett"], ["lys", "", "Lys side"], ["mork", "", "Mørk side"]],
      onChange: function (v) { app.setUi({ bg: v }); paintBg(); },
    });
    bgSeg.classList.add("lv-bgseg");
    var zoomSeg = form.seg({
      value: state.ui.zoom,
      size: "sm",
      label: "Zoom",
      items: [["fit", "Tilpass", "Tilpass til flaten"], ["1", "100 %", "Faktisk størrelse"], ["2", "200 %", "Dobbel størrelse"]],
      onChange: function (v) { app.setUi({ zoom: v }); fit(); },
    });

    /** A labelled group in the toolbar: a small caption over its controls. */
    var groupUid = 0;
    function toolGroup(label, hint) {
      var id = "lv-tool-lab-" + ++groupUid;
      var ctrls = Array.prototype.slice.call(arguments, 2);
      return h("div.lv-tool__group", { role: "group", "aria-labelledby": id, title: hint }, h("span.lv-tool__lab", { id: id }, label), h("div.lv-tool__ctrls", null, ctrls));
    }

    var bar = h(
      "div.lv-tool",
      null,
      toolGroup("Tidspunkt", "Se annonsen slik den ser ut på et annet tidspunkt", timeInput, presets),
      h(
        "div.lv-tool__set",
        null,
        toolGroup("Visning", "Alle fire formatene, eller ett av dem stort", viewSeg),
        toolGroup("Zoom", null, zoomSeg),
        toolGroup("Bakgrunn", "Flaten bak annonsene", bgSeg)
      )
    );

    var strip = h("div.lv-strip");
    var stripLabel = h("span.lv-strip__label");
    var stripChips = h("div.lv-strip__chips", { role: "tablist", "aria-label": "Kampene i rotasjonen" });
    strip.appendChild(h("div.lv-strip__play", { role: "group", "aria-label": "Avspilling" }, prevBtn, playBtn, nextBtn));
    strip.appendChild(stripLabel);
    strip.appendChild(stripChips);

    // ---- artboards ------------------------------------------------------------
    var board = h("div.lv-board");
    var hero = h("div.lv-board__row.lv-board__row--hero");
    var trio = h("div.lv-board__row.lv-board__row--trio");
    board.appendChild(hero);
    board.appendChild(trio);

    specs.forEach(function (spec) {
      var root = h("div.bn");
      var scaler = h("div.lv-art__scaler", null, root);
      scaler.style.width = spec.width + "px";
      scaler.style.height = spec.height + "px";
      var frame = h("div.lv-art__frame", null, scaler);
      var counter = h("span.lv-art__count");
      var opens = h("span.lv-art__opens");
      var art = h(
        "figure.lv-art",
        { "data-key": spec.key },
        h("figcaption.lv-art__head", null, h("span.lv-art__name", null, spec.name), h("span.lv-art__dim", null, spec.width + "×" + spec.height), counter),
        frame,
        h("div.lv-art__foot", null, icon("link", 12), opens)
      );
      frame.addEventListener("dblclick", function () {
        app.setUi({ layout: "fokus", focusKey: spec.key });
        viewSeg.setValue(viewValue());
        applyLayout();
      });
      (spec.key === "desktop" ? hero : trio).appendChild(art);
      cards.push({ spec: spec, root: root, scaler: scaler, frame: frame, art: art, opens: opens, counter: counter, ctrl: null });
    });

    var empty = h(
      "div.lv-strip__empty",
      null,
      icon("info", 15),
      h("span", null, h("b", null, "Ingen kamper ennå"), " – annonsen viser reserveplakaten. Hent arket under ", h("b", null, "Kamper"), ", eller prøv med eksempelkamper.")
    );
    var sample = form.button("Prøv eksempelkamper", { kind: "ghost", size: "sm", icon: "sparkles", onClick: function () {
      var table = LD.readTable(LD.parseCsv(LD.templateCsv(new Date(), ";")));
      app.patch({ rows: table.rows, columns: table.columns, warnings: table.warnings, source: { kind: "sample", liveUrls: [] }, fetchedAt: new Date().toISOString() });
    } });
    empty.appendChild(sample);
    strip.appendChild(empty);

    var canvas = h("div.lv-canvas", null, board);
    var pv = h("div.lv-pv", null, bar, strip, canvas);
    host.appendChild(pv);

    // ---- behaviour -------------------------------------------------------------
    function controllers() {
      return cards.filter(function (c) { return c.ctrl && !c.art.hidden; }).map(function (c) { return c.ctrl; });
    }

    function lead() {
      var visible = cards.filter(function (c) { return c.ctrl && !c.art.hidden; });
      return visible.length ? visible[0].ctrl : null;
    }

    function setNow(date) {
      simulated = date;
      timeInput.value = toLocalInput(date || new Date());
      cards.forEach(function (c) { if (c.ctrl) c.ctrl.setNow(simulated); });
      markPreset(date ? null : "now");
      renderStrip(true);
    }

    function markPreset(id) {
      Object.keys(presetBtns).forEach(function (k) {
        presetBtns[k].classList.toggle("is-active", k === id);
        presetBtns[k].setAttribute("aria-pressed", k === id ? "true" : "false");
      });
    }

    function nextKickoff() {
      var nowMs = Date.now();
      var finishedAfter = (Number(state.design.finishedAfterMin) || 120) * 60000;
      var best = null;
      state.rows.forEach(function (r) {
        if (!r.time) return;
        var t = LD.kickoffMs(r.date, r.time);
        if (!isFinite(t) || t + finishedAfter <= nowMs) return;
        if (!best || t < best.t) best = { t: t, row: r };
      });
      return best;
    }

    function emptyMoment() {
      var last = state.rows.reduce(function (m, r) { return r.date > m ? r.date : m; }, "");
      var base = last ? new Date(LD.kickoffMs(last, "12:00")) : new Date();
      return new Date(base.getTime() + (Number(state.design.lookAheadDays) + 2) * 86400000);
    }

    function applyPreset(id) {
      var k = nextKickoff();
      var date = null;
      if (id === "before" || id === "during") {
        if (!k) return app.toast("Ingen kommende kamper i arket", "err");
        date = new Date(k.t + (id === "before" ? -BEFORE_KICKOFF_MIN : INTO_MATCH_MIN) * 60000);
      } else if (id === "empty") {
        date = emptyMoment();
      }
      setNow(date);
      if (date) markPreset(id);
      if (k && (id === "before" || id === "during")) controllers().forEach(function (c) { c.goToRow(k.row.id); });
    }

    function setPlaying(on) {
      playing = on;
      playBtn.innerHTML = "";
      playBtn.appendChild(icon(on ? "pause" : "play", 16));
      playBtn.setAttribute("aria-label", on ? "Pause" : "Spill");
      strip.classList.toggle("is-paused", !on);
      cards.forEach(function (c) {
        if (!c.ctrl) return;
        if (on) c.ctrl.play();
        else c.ctrl.pause();
      });
      renderStrip(false);
    }

    timeInput.addEventListener("change", function () {
      var d = timeInput.value ? new Date(timeInput.value) : null;
      setNow(d && !isNaN(d.getTime()) ? d : null);
    });
    playBtn.addEventListener("click", function () { setPlaying(!playing); });
    prevBtn.addEventListener("click", function () {
      setPlaying(false);
      controllers().forEach(function (c) { c.prev(); });
    });
    nextBtn.addEventListener("click", function () {
      setPlaying(false);
      controllers().forEach(function (c) { c.next(); });
    });

    function onKey(e) {
      if (!pv.offsetParent || document.querySelector(".lv-modal")) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) return;
      if (e.key === "ArrowRight") nextBtn.click();
      else if (e.key === "ArrowLeft") prevBtn.click();
      else if (e.key === " ") {
        e.preventDefault();
        playBtn.click();
      } else return;
    }
    document.addEventListener("keydown", onKey);

    // ---- strip ------------------------------------------------------------------
    var stripKey = "";
    function renderStrip(force) {
      var ctrl = lead();
      if (!ctrl) return;
      var st = ctrl.state;
      var key = st.selectionKey + "|" + (ctrl.listMode ? "list" : "");
      if (force || key !== stripKey) {
        stripKey = key;
        stripChips.innerHTML = "";
        var slides = st.slides;
        var fallback = !!(slides.length && slides[0].isFallback);
        strip.classList.toggle("is-fallback", fallback);
        if (fallback) {
          // With no rows at all, the "Ingen kamper ennå" notice says it.
          stripLabel.textContent = "";
          if (state.rows.length) stripChips.appendChild(h("span.lv-strip__msg", null, icon("image", 15), h("span", null, h("b", null, "Ingen kamper på dette tidspunktet"), " – annonsen viser reserveplakaten.")));
        } else if (ctrl.listMode) {
          stripLabel.textContent = scopeWord(st);
          stripChips.appendChild(h("span.lv-strip__chip.is-active.is-static", null, icon("sheet", 13), h("span", null, "Kampliste · " + (st.rows || []).length + " kamper på én flate")));
        } else {
          stripLabel.textContent = scopeWord(st);
          slides.forEach(function (row, i) {
            var live = ctrl.isLive(row);
            var chip = h(
              "button.lv-strip__chip",
              { type: "button", role: "tab", "data-i": i, title: row.title },
              live ? h("span.lv-strip__live", null, "Live") : h("span.lv-strip__time", null, row.time ? row.time.replace(":", state.design.clockSep === "." ? "." : ":") : "–"),
              h("span.lv-strip__title", null, row.title),
              h("span.lv-strip__bar", { "aria-hidden": "true" })
            );
            chip.addEventListener("click", function () {
              setPlaying(false);
              controllers().forEach(function (c) { c.goTo(i); });
            });
            stripChips.appendChild(chip);
          });
        }
      }
      Array.prototype.forEach.call(stripChips.querySelectorAll("button.lv-strip__chip"), function (chip) {
        var on = Number(chip.getAttribute("data-i")) === st.index;
        if (on && chip.classList.contains("is-active")) {
          // restart the progress bar
          chip.classList.remove("is-active");
          void chip.offsetWidth;
        }
        chip.classList.toggle("is-active", on);
        chip.setAttribute("aria-selected", on ? "true" : "false");
      });
    }

    function scopeWord(st) {
      if (st.scope === "today") return "I dag";
      if (st.scope === "next") return st.dayOffset === 1 ? "I morgen" : "Om " + st.dayOffset + " dager";
      return "";
    }

    function onChange(card) {
      return function (ctrl) {
        var n = ctrl.slides.length;
        card.counter.textContent = n > 1 ? ctrl.index + 1 + " / " + n : "";
        var url = ctrl.exitUrl();
        var row = ctrl.currentRow();
        card.opens.textContent = url ? url.replace(/^https?:\/\//, "") : "(ingen lenke)";
        card.opens.title = (row && row.link && state.design.exitMode !== "clicktag" ? "Kampens egen lenke: " : "clickTag: ") + url;
        if (card === leadCard()) renderStrip(false);
      };
    }

    function leadCard() {
      for (var i = 0; i < cards.length; i++) if (cards[i].ctrl && !cards[i].art.hidden) return cards[i];
      return null;
    }

    // ---- layout & scale ------------------------------------------------------------
    function applyLayout() {
      var focus = state.ui.layout === "fokus";
      viewSeg.setValue(viewValue());
      board.classList.toggle("is-focus", focus);
      cards.forEach(function (c) { c.art.hidden = focus && c.spec.key !== state.ui.focusKey; });
      trio.hidden = focus && state.ui.focusKey === "desktop";
      hero.hidden = focus && state.ui.focusKey !== "desktop";
      fit();
      // Artboards that were hidden could not measure their text: fit again.
      requestAnimationFrame(function () { cards.forEach(function (c) { if (c.ctrl && !c.art.hidden) c.ctrl.refit(); }); });
      stripKey = "";
      renderStrip(true);
    }

    function paintBg() {
      canvas.setAttribute("data-bg", state.ui.bg);
    }

    function fit() {
      var w = canvas.clientWidth - BOARD_PAD * 2;
      var hgt = canvas.clientHeight - BOARD_PAD * 2 - 60;
      if (w <= 0) return;
      var zoom = state.ui.zoom;
      var scale;
      if (state.ui.layout === "fokus") {
        var c = cards.filter(function (x) { return x.spec.key === state.ui.focusKey; })[0];
        var fitScale = Math.min(w / c.spec.width, Math.max(0.4, hgt / c.spec.height), 2);
        scale = zoom === "fit" ? fitScale : Number(zoom);
      } else {
        var trioW = specs.filter(function (s) { return s.key !== "desktop"; }).reduce(function (sum, s) { return sum + s.width; }, 0) + ROW_GAP * 2;
        // Fit: both rows side by side in the width, and — down to 70 % — in
        // the height too, so the whole board is visible without scrolling.
        var boardH = 500 + 400 + ROW_GAP + 2 * 46;
        scale = zoom === "fit" ? Math.min(1, w / trioW, Math.max(0.7, hgt / boardH)) : Number(zoom);
        if (zoom === "fit" && scale < 0.55) scale = Math.min(1, w / 580);
      }
      cards.forEach(function (c) {
        c.scaler.style.transform = "scale(" + scale + ")";
        c.frame.style.width = Math.round(c.spec.width * scale) + "px";
        c.frame.style.height = Math.round(c.spec.height * scale) + "px";
      });
      board.style.setProperty("--art-scale", scale);
    }
    window.addEventListener("resize", fit);
    var ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(function () { fit(); }) : null;
    if (ro) ro.observe(canvas);

    function mountAll() {
      cards.forEach(function (c) {
        if (c.ctrl) c.ctrl.destroy();
        c.ctrl = window.LiveAd.mount(c.root, c.spec.type, config, {
          now: simulated,
          autoplay: true,
          refresh: false,
          onChange: onChange(c),
        });
        if (!playing) c.ctrl.pause();
        onChange(c)(c.ctrl);
      });
      empty.hidden = state.rows.length > 0;
      strip.style.setProperty("--slide-ms", (Number(state.design.slideMs) || 5000) + "ms");
      requestAnimationFrame(function () {
        fit();
        cards.forEach(function (c) { if (c.ctrl) c.ctrl.refit(); });
      });
      stripKey = "";
      renderStrip(true);
    }

    paintBg();
    applyLayout();
    markPreset("now");

    return {
      setConfig: function (next) {
        config = next;
        mountAll();
      },
      fit: function () {
        fit();
        cards.forEach(function (c) { if (c.ctrl) c.ctrl.refit(); });
      },
      /** Jump to a moment the match is on air and show its slide. */
      showRow: function (row) {
        var t = row.time ? LD.kickoffMs(row.date, row.time) - BEFORE_KICKOFF_MIN * 60000 : LD.kickoffMs(row.date, "12:00");
        setNow(new Date(t));
        setPlaying(false);
        controllers().forEach(function (c) { c.goToRow(row.id); });
        renderStrip(false);
        pv.classList.remove("is-flash");
        void pv.offsetWidth;
        pv.classList.add("is-flash");
      },
      showFallback: function () {
        applyPreset("empty");
      },
      destroy: function () {
        cards.forEach(function (c) { if (c.ctrl) c.ctrl.destroy(); });
        window.removeEventListener("resize", fit);
        document.removeEventListener("keydown", onKey);
        if (ro) ro.disconnect();
      },
    };
  }

  NTLIVE.preview = { build: build };
})();
