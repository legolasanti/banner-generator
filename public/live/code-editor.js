/* =========================================================================
   live/code-editor.js — "Egen kode": the user's own HTML and CSS for the
   creative, in a full-screen editor with the real runtime previewing the
   draft beside it. Placeholders ({{kamp}}, {{tid}}, {{nedtelling}} …) and
   motion attributes (data-inn) are one click away; the draft renders under
   its own class (egen-utkast) so it never disturbs the saved design, and
   it only replaces it on «Bruk koden».
   ========================================================================= */
(function () {
  "use strict";

  var NTLIVE = (window.NTLIVE = window.NTLIVE || {});
  var h = window.WPE.util.h;
  var F = window.BannerFormats;
  var LD = window.LiveData;
  var LT = window.LiveTemplates;
  var form = NTLIVE.form;
  var icon = NTLIVE.icon;
  var DRAFT_ID = "egen-utkast";
  var RENDER_DELAY_MS = 260;

  var CSS_SNIPPETS = [
    ["calc(var(--u) * 20px)", "Skalert størrelse"],
    ["var(--live-accent)", "Aksent"],
    ["var(--live-deep)", "Mørk tone"],
    ["var(--live-soft)", "Lys tone"],
    ["var(--live-on-accent)", "Tekst på aksent"],
    [".bn--desktop ", "Bare desktop"],
    [".bn--mobile ", "Bare mobil"],
    [".bn--readpeak ", "Bare ReadPeak"],
    [".bn--newsgrid ", "Bare 190×190"],
    [".is-live ", "Mens kampen pågår"],
  ];

  function codeArea(value, onInput) {
    var gutter = h("pre.lv-code__gutter", { "aria-hidden": "true" });
    var ta = h("textarea.lv-code__ta", { spellcheck: "false", autocomplete: "off", autocapitalize: "off", wrap: "off" });
    ta.value = value;
    function lines() {
      var n = ta.value.split("\n").length;
      var out = "";
      for (var i = 1; i <= n; i++) out += i + "\n";
      gutter.textContent = out;
    }
    ta.addEventListener("input", function () {
      lines();
      onInput(ta.value);
    });
    ta.addEventListener("scroll", function () { gutter.scrollTop = ta.scrollTop; });
    ta.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      e.preventDefault();
      insert(ta, "  ");
    });
    lines();
    var wrap = h("div.lv-code", null, gutter, ta);
    wrap.textarea = ta;
    wrap.set = function (v) {
      ta.value = v;
      lines();
    };
    return wrap;
  }

  function insert(ta, text) {
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    ta.setRangeText(text, start, end, "end");
    ta.focus();
    ta.dispatchEvent(new Event("input"));
  }

  function open(app, opts) {
    if (document.querySelector(".lv-modal")) return;
    var o = opts || {};
    var state = app.state;
    var d = state.design;
    var seed = o.seedFrom ? LT.byId(o.seedFrom) : null;
    var draft = seed
      ? { html: seed.html, css: seed.css, mode: seed.mode, zone: seed.zone }
      : d.customHtml
        ? { html: d.customHtml, css: d.customCss, mode: d.customMode, zone: d.customZone }
        : { html: LT.CUSTOM_STARTER.html, css: LT.CUSTOM_STARTER.css, mode: "slides", zone: "strip" };
    var saved = JSON.stringify(draft);
    var tab = "html";
    var formatKey = "mobile";
    var ctrl = null;
    var timer = null;

    // ---- editor side ---------------------------------------------------------
    var htmlArea = codeArea(draft.html, function (v) { draft.html = v; schedule(); });
    var cssArea = codeArea(draft.css, function (v) { draft.css = v; schedule(); });
    var htmlLint = h("span.lv-lint");
    var cssLint = h("span.lv-lint");
    var tabHtml = h("button.lv-etab", { type: "button" }, "HTML", htmlLint);
    var tabCss = h("button.lv-etab", { type: "button" }, "CSS", cssLint);
    var chips = h("div.lv-snips");
    var lintLine = h("div.lv-lintline");

    function paintChips() {
      chips.innerHTML = "";
      chips.appendChild(h("span.lv-snips__lab", null, "Sett inn"));
      if (tab === "html") {
        LT.PLACEHOLDERS.forEach(function (p) {
          var b = h("button.lv-snip" + (p.html ? ".is-html" : ""), { type: "button", title: p.label + " – f.eks. «" + p.example + "»" + (p.note ? ". " + p.note : "") }, "{{" + p.key + "}}");
          b.addEventListener("click", function () { insert(htmlArea.textarea, "{{" + p.key + "}}"); });
          chips.appendChild(b);
        });
        LT.SECTIONS.forEach(function (s) {
          var b = h("button.lv-snip.is-section", { type: "button", title: s.hint }, "{{#" + s.key + "}}");
          b.addEventListener("click", function () {
            var ta = htmlArea.textarea;
            var sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
            insert(ta, "{{#" + s.key + "}}" + sel + "{{/" + s.key + "}}");
          });
          chips.appendChild(b);
        });
        LT.ENTRANCES.forEach(function (e) {
          var b = h("button.lv-snip.is-motion", { type: "button", title: "Inngangsanimasjon. Legg style=\"--i:2\" til for å forsinke." }, 'data-inn="' + e + '"');
          b.addEventListener("click", function () { insert(htmlArea.textarea, ' data-inn="' + e + '" style="--i:1"'); });
          chips.appendChild(b);
        });
      } else {
        CSS_SNIPPETS.forEach(function (s) {
          var b = h("button.lv-snip", { type: "button", title: s[1] }, s[0].trim());
          b.addEventListener("click", function () { insert(cssArea.textarea, s[0]); });
          chips.appendChild(b);
        });
      }
    }

    function selectTab(t) {
      tab = t;
      tabHtml.classList.toggle("is-active", t === "html");
      tabCss.classList.toggle("is-active", t === "css");
      htmlArea.hidden = t !== "html";
      cssArea.hidden = t !== "css";
      paintChips();
      (t === "html" ? htmlArea : cssArea).textarea.focus();
    }
    tabHtml.addEventListener("click", function () { selectTab("html"); });
    tabCss.addEventListener("click", function () { selectTab("css"); });

    function lint() {
      var hl = LT.lintHtml(draft.html);
      var cl = LT.lintCss(draft.css);
      var problems = hl.problems.slice();
      if (hl.removed) problems.push("Noe i HTML-en er fjernet: skript, iframes, skjemaer, on…-attributter og lenker kan ikke ligge i en annonse.");
      if (hl.tooLong) problems.push("HTML-en er lengre enn " + LT.MAX_HTML + " tegn; resten tas ikke med.");
      if (cl.dropped) problems.push(cl.dropped + (cl.dropped === 1 ? " CSS-regel" : " CSS-regler") + " rører Annonse/18+-merkingen og brukes ikke. Den tegnes alltid av annonsen selv.");
      if (!cl.balanced) problems.push("CSS-en har ulikt antall { og }.");
      htmlLint.className = "lv-lint" + (hl.problems.length || hl.removed ? " is-warn" : " is-ok");
      cssLint.className = "lv-lint" + (cl.dropped || !cl.balanced ? " is-warn" : " is-ok");
      lintLine.innerHTML = "";
      if (problems.length) lintLine.appendChild(form.note("warn", h("ul.lv-warnlist", null, problems.map(function (p) { return h("li", null, p); }))));
      else lintLine.appendChild(h("span.lv-lintline__ok", null, icon("check", 13), cl.kept + " CSS-regler · klar til bruk"));
    }

    var modeSeg = form.seg({
      value: draft.mode,
      size: "sm",
      items: [["slides", "Én kamp om gangen"], ["list", "Alle kamper i liste"]],
      onChange: function (v) { draft.mode = v; schedule(); },
    });
    var zoneSeg = form.seg({
      value: draft.zone,
      size: "sm",
      items: [["strip", "Toppstripe", "Annonse og 18+ i en stripe øverst"], ["media", "Over bildeflaten", "Annonse nederst i bildeflaten; høyden settes med --badges-h"]],
      onChange: function (v) { draft.zone = v; schedule(); },
    });

    var startSel = form.select({
      value: "",
      options: [["", "Start fra …"]].concat(LT.TEMPLATES.map(function (t) { return [t.id, t.name]; })).concat([["__tom", "Enkel startmal"]]),
      onChange: function (v) {
        if (!v) return;
        var t = v === "__tom" ? { html: LT.CUSTOM_STARTER.html, css: LT.CUSTOM_STARTER.css, mode: "slides", zone: "strip" } : LT.byId(v);
        draft.html = t.html;
        draft.css = t.css;
        draft.mode = t.mode;
        draft.zone = t.zone;
        htmlArea.set(draft.html);
        cssArea.set(draft.css);
        modeSeg.setValue(draft.mode);
        zoneSeg.setValue(draft.zone);
        startSel.value = "";
        schedule();
      },
    });
    startSel.classList.add("lv-select--sm");

    // ---- preview side ------------------------------------------------------------
    var specs = F.getProduct("norsktipping").specs;
    var root = h("div.bn");
    var scaler = h("div.lv-art__scaler", null, root);
    var frame = h("div.lv-art__frame", null, scaler);
    var stage = h("div.lv-editor__stage", null, frame);
    var fmtSeg = form.seg({
      value: formatKey,
      size: "sm",
      items: specs.map(function (s) { return [s.key, s.name, s.width + "×" + s.height]; }),
      onChange: function (v) { formatKey = v; render(); },
    });
    var replay = form.button("", { kind: "icon", icon: "refresh", ariaLabel: "Spill av igjen", title: "Spill av igjen" });
    replay.addEventListener("click", render);
    var nextBtn = form.button("", { kind: "icon", icon: "right", ariaLabel: "Neste kamp", title: "Neste kamp" });
    nextBtn.addEventListener("click", function () { if (ctrl) ctrl.next(); });

    function render() {
      clearTimeout(timer);
      lint();
      var spec = specs.filter(function (s) { return s.key === formatKey; })[0];
      scaler.style.width = spec.width + "px";
      scaler.style.height = spec.height + "px";
      var avail = Math.max(120, stage.clientWidth - 40);
      var availH = Math.max(120, stage.clientHeight - 40);
      var scale = Math.min(1.25, avail / spec.width, availH / spec.height);
      scaler.style.transform = "scale(" + scale + ")";
      frame.style.width = Math.round(spec.width * scale) + "px";
      frame.style.height = Math.round(spec.height * scale) + "px";
      if (ctrl) ctrl.destroy();
      var rows = state.rows.length ? state.rows : LD.readTable(LD.parseCsv(LD.templateCsv(new Date(), ";"))).rows;
      var cfg = app.previewConfig({
        rows: rows,
        templateId: DRAFT_ID,
        design: { template: LT.CUSTOM_ID, customHtml: draft.html, customCss: draft.css, customMode: draft.mode, customZone: draft.zone },
      });
      ctrl = window.LiveAd.mount(root, spec.type, cfg, { autoplay: true, refresh: false });
      dirtyNote.hidden = true;
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(render, RENDER_DELAY_MS);
    }

    // ---- shell --------------------------------------------------------------------
    var dirtyNote = h(
      "div.lv-dirty",
      { hidden: true },
      h("span", null, "Endringene er ikke brukt ennå."),
      form.button("Forkast", { kind: "quiet", size: "sm", onClick: function () { close(true); } }),
      form.button("Fortsett å redigere", { kind: "ghost", size: "sm", onClick: function () { dirtyNote.hidden = true; } })
    );
    var apply = form.button("Bruk koden", { kind: "primary", icon: "check", onClick: function () {
      var next = Object.assign({}, state.design, {
        template: LT.CUSTOM_ID,
        customHtml: LT.sanitizeHtml(draft.html),
        customCss: draft.css.slice(0, LT.MAX_CSS),
        customMode: draft.mode,
        customZone: draft.zone,
      });
      app.patch({ design: next });
      app.toast("Egen kode er i bruk", "ok");
      close(true);
    } });
    var closeBtn = form.button("", { kind: "icon", icon: "x", ariaLabel: "Lukk", onClick: function () { close(false); } });

    var doc = h(
      "details.lv-disclose.lv-editor__doc",
      null,
      h("summary", null, icon("info", 14), "Slik fungerer malkoden"),
      h(
        "ul.lv-doclist",
        null,
        h("li", null, h("code", null, "{{kamp}}"), " settes inn som tekst. ", h("code", null, "{{media}}"), ", ", h("code", null, "{{bakgrunn}}"), " og ", h("code", null, "{{nedtelling}}"), " er ferdig HTML."),
        h("li", null, h("code", null, "{{#odds}}…{{/odds}}"), " vises bare når verdien finnes; ", h("code", null, "{{^reserve}}…{{/reserve}}"), " når det ikke er reserveplakaten."),
        h("li", null, h("code", null, 'data-live="tid"'), " gjør at elementet tikker («Starter om 4 min», «Pågår nå»). Slide-elementet får ", h("code", null, ".is-live"), " mens kampen pågår."),
        h("li", null, h("code", null, 'data-inn="opp"'), " (ned, venstre, hoyre, pop, fade, zoom) og ", h("code", null, 'style="--i:2"'), " gir inngang med forsinkelse. Bevegelse-valget under Design styrer tempoet."),
        h("li", null, "All CSS gjelder bare kampflaten i denne annonsen. ", h("code", null, "calc(var(--u) * 20px)"), " skalerer til alle formatene; start en regel med ", h("code", null, ".bn--mobile"), " for å justere ett format."),
        h("li", null, "Annonse og 18+ | Hjelpelinjen.no ligger i et eget lag over kampflaten. Ingen regel her når dem, så de kan ikke flyttes eller skjules."),
        h("li", null, "Skript, iframes, skjemaer og lenker fjernes: hele annonsen er allerede én klikkflate (clickTag).")
      )
    );

    var modal = h(
      "div.lv-modal",
      { role: "dialog", "aria-modal": "true", "aria-label": "Egen kode" },
      h(
        "div.lv-modal__panel",
        null,
        h(
          "header.lv-modal__head",
          null,
          h("span.lv-modal__icon", null, icon("code", 18)),
          h("div.lv-modal__titles", null, h("h2", null, "Egen kode"), h("p", null, "HTML og CSS for hver kamp. Forhåndsvisningen til høyre er den ekte annonsen.")),
          h("div.lv-modal__tools", null, startSel, closeBtn)
        ),
        h(
          "div.lv-editor",
          null,
          h(
            "div.lv-editor__left",
            null,
            h("div.lv-etabs", null, tabHtml, tabCss),
            htmlArea,
            cssArea,
            chips,
            h("div.lv-editor__opts", null, form.field("Visning", modeSeg), form.field("Annonse og 18+", zoneSeg)),
            lintLine
          ),
          h(
            "div.lv-editor__right",
            null,
            h("div.lv-editor__bar", null, fmtSeg, h("div.lv-tool__spacer"), nextBtn, replay),
            stage,
            doc
          )
        ),
        h("footer.lv-modal__foot", null, dirtyNote, h("div.lv-tool__spacer"), form.button("Avbryt", { kind: "ghost", onClick: function () { close(false); } }), apply)
      )
    );

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        apply.click();
      }
    }

    function close(force) {
      if (!force && JSON.stringify(draft) !== saved) {
        dirtyNote.hidden = false;
        return;
      }
      clearTimeout(timer);
      if (ctrl) ctrl.destroy();
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", schedule);
      var style = document.getElementById("lt-style-" + DRAFT_ID);
      if (style) style.remove();
      modal.classList.add("is-closing");
      setTimeout(function () { modal.remove(); }, 160);
    }

    document.body.appendChild(modal);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", schedule);
    selectTab("html");
    requestAnimationFrame(render);
  }

  NTLIVE.codeEditor = { open: open };
})();
