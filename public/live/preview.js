/* =========================================================================
   live/preview.js — the four Norsk Tipping formats running the real NT Live
   runtime side by side, with a clock the user can move ("show me what this
   looks like Saturday at 17:55") and controls to step through the matches.

   The previews ARE the creative: same live.js, same CSS, same data. The only
   difference from the package is that the rows come from the app, not from
   the sheet at serve time, and the photos load from their links instead of
   from the ZIP.
   ========================================================================= */
(function () {
  "use strict";

  var NTLIVE = (window.NTLIVE = window.NTLIVE || {});
  var h = window.WPE.util.h;
  var F = window.BannerFormats;

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  /** Date → value for <input type="datetime-local">, in the browser's zone. */
  function toLocalInput(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function scopeWord(ctrl) {
    var st = ctrl.state;
    if (!st.slides.length || st.slides[0].isFallback) return "ingen kamper – reserveplakat";
    if (st.scope === "today") return "i dag";
    if (st.scope === "next") return st.dayOffset === 1 ? "i morgen" : "om " + st.dayOffset + " dager";
    return "";
  }

  /**
   * @param {HTMLElement} host
   * @returns {{setConfig:Function, destroy:Function}}
   */
  function build(host) {
    var specs = F.getProduct("norsktipping").specs;
    var config = null;
    var simulated = null; // Date or null for "now"
    var playing = true;
    var cards = [];

    // ---- toolbar ------------------------------------------------------------
    var timeInput = h("input.lv-input.lv-time", { type: "datetime-local", title: "Vis annonsen slik den ser ut på dette tidspunktet" });
    timeInput.value = toLocalInput(new Date());
    var nowBtn = h("button.btn-ghost.btn-sm", { type: "button", title: "Tilbake til klokka nå" }, "Nå");
    var playBtn = h("button.btn-ghost.btn-sm", { type: "button" }, "Pause");
    var prevBtn = h("button.btn-ghost.btn-sm", { type: "button", title: "Forrige kamp" }, "‹");
    var nextBtn = h("button.btn-ghost.btn-sm", { type: "button", title: "Neste kamp" }, "›");
    var status = h("span.lv-pv__status", null, "");
    var bar = h(
      "div.lv-pv__bar",
      null,
      h("div.lv-pv__group", null, h("span.lv-pv__lab", null, "Vis som"), timeInput, nowBtn),
      h("div.lv-pv__group", null, prevBtn, playBtn, nextBtn, status)
    );

    timeInput.addEventListener("change", function () {
      var d = timeInput.value ? new Date(timeInput.value) : null;
      simulated = d && !isNaN(d.getTime()) ? d : null;
      cards.forEach(function (c) { if (c.ctrl) c.ctrl.setNow(simulated); });
      updateStatus();
    });
    nowBtn.addEventListener("click", function () {
      simulated = null;
      timeInput.value = toLocalInput(new Date());
      cards.forEach(function (c) { if (c.ctrl) c.ctrl.setNow(null); });
      updateStatus();
    });
    function setPlaying(on) {
      playing = on;
      playBtn.textContent = on ? "Pause" : "Spill";
      cards.forEach(function (c) {
        if (!c.ctrl) return;
        if (on) c.ctrl.play();
        else c.ctrl.pause();
      });
    }
    playBtn.addEventListener("click", function () { setPlaying(!playing); });
    prevBtn.addEventListener("click", function () {
      setPlaying(false);
      cards.forEach(function (c) { if (c.ctrl) c.ctrl.prev(); });
    });
    nextBtn.addEventListener("click", function () {
      setPlaying(false);
      cards.forEach(function (c) { if (c.ctrl) c.ctrl.next(); });
    });

    // ---- cards -------------------------------------------------------------
    var grid = h("div.lv-pv__grid");
    specs.forEach(function (spec) {
      var root = h("div.bn");
      var scaler = h("div.lv-pv__scaler", { style: { width: spec.width + "px", height: spec.height + "px" } }, root);
      var stage = h("div.lv-pv__stage", null, scaler);
      var opens = h("div.lv-pv__opens", null, "");
      var counter = h("span.lv-pv__count", null, "");
      var card = h(
        "article.lv-pv__card",
        { "data-key": spec.key },
        h("header.lv-pv__head", null, h("span.lv-pv__name", null, spec.name), h("span.lv-pv__dim", null, spec.width + "×" + spec.height), counter),
        stage,
        opens
      );
      grid.appendChild(card);
      cards.push({ spec: spec, root: root, scaler: scaler, stage: stage, opens: opens, counter: counter, ctrl: null });
    });

    host.appendChild(h("div.lv-pv", null, bar, grid));

    function fit() {
      cards.forEach(function (c) {
        var w = c.stage.clientWidth - 2;
        if (w <= 0) return;
        var scale = Math.min(1, w / c.spec.width);
        c.scaler.style.transform = "scale(" + scale + ")";
        c.stage.style.height = Math.round(c.spec.height * scale) + "px";
      });
    }
    window.addEventListener("resize", fit);

    function updateStatus() {
      var first = cards[0] && cards[0].ctrl;
      if (!first) return;
      var st = first.state;
      var n = st.slides.length;
      status.textContent = (n && !st.slides[0].isFallback ? n + (n === 1 ? " kamp" : " kamper") + " " : "") + scopeWord(first);
    }

    function onChange(card) {
      return function (ctrl) {
        var row = ctrl.currentRow();
        var n = ctrl.slides.length;
        card.counter.textContent = n > 1 ? ctrl.index + 1 + "/" + n : "";
        var url = ctrl.exitUrl();
        card.opens.textContent = url ? "Åpner: " + url : "Åpner: (ingen lenke)";
        card.opens.title = row && row.link ? "Kampens egen lenke fra arket" : "clickTag / klikk-lenken";
        if (card === cards[0]) updateStatus();
      };
    }

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
      requestAnimationFrame(fit);
      updateStatus();
    }

    return {
      setConfig: function (next) {
        config = next;
        mountAll();
      },
      fit: fit,
      destroy: function () {
        cards.forEach(function (c) { if (c.ctrl) c.ctrl.destroy(); });
        window.removeEventListener("resize", fit);
      },
    };
  }

  NTLIVE.preview = { build: build };
})();
