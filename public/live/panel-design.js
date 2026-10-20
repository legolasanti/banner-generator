/* =========================================================================
   live/panel-design.js — the Design tab: the template gallery (each card
   is the real runtime, running the campaign's own matches at 320×400; it
   rotates on hover), the user's own HTML/CSS, the accent colour, what
   matches without a photo show, the entrance motion and the text size.
   ========================================================================= */
(function () {
  "use strict";

  var NTLIVE = (window.NTLIVE = window.NTLIVE || {});
  var h = window.WPE.util.h;
  var LD = window.LiveData;
  var LT = window.LiveTemplates;
  var form = NTLIVE.form;
  var icon = NTLIVE.icon;
  var THUMB_W = 320;
  var THUMB_H = 400;

  function sampleRows() {
    return LD.readTable(LD.parseCsv(LD.templateCsv(new Date(), ";"))).rows;
  }

  function panel(app) {
    var state = app.state;
    var root = h("div.lv-stack");
    var thumbs = [];
    var dirty = false;

    // ---- gallery --------------------------------------------------------------
    var gallery = h("div.lv-gallery", { role: "radiogroup", "aria-label": "Mal" });
    var entries = LT.TEMPLATES.map(function (t) { return { id: t.id, name: t.name, description: t.description, mode: t.mode }; });
    entries.push({ id: LT.CUSTOM_ID, name: "Egen kode", description: "Din egen HTML og CSS, med plassholdere for kampdataene.", custom: true });

    entries.forEach(function (t) {
      var root2 = h("div.bn");
      var scaler = h("div.lv-tpl__scaler", null, root2);
      var stage = h("div.lv-tpl__stage", null, scaler);
      var card = h(
        "button.lv-tpl",
        { type: "button", role: "radio", "data-id": t.id, title: t.description },
        stage,
        h("span.lv-tpl__check", { "aria-hidden": "true" }, icon("check", 12)),
        t.mode === "list" ? h("span.lv-tpl__flag", null, "Liste") : null,
        t.custom ? h("span.lv-tpl__flag.lv-tpl__flag--code", null, icon("code", 11), "Kode") : null,
        h("span.lv-tpl__name", null, t.name),
        h("span.lv-tpl__desc", null, t.description)
      );
      card.addEventListener("click", function () {
        if (t.custom && !state.design.customHtml) {
          NTLIVE.codeEditor.open(app, { seedFrom: state.design.template === LT.CUSTOM_ID ? null : state.design.template });
          return;
        }
        app.setDesign("template", t.id);
        markSelected();
      });
      card.addEventListener("mouseenter", function () { if (thumb.ctrl) thumb.ctrl.play(); });
      card.addEventListener("mouseleave", function () { if (thumb.ctrl) thumb.ctrl.pause(); });
      var thumb = { entry: t, root: root2, scaler: scaler, stage: stage, card: card, ctrl: null };
      thumbs.push(thumb);
      gallery.appendChild(card);
    });

    function markSelected() {
      thumbs.forEach(function (th) {
        var on = th.entry.id === state.design.template;
        th.card.classList.toggle("is-active", on);
        th.card.setAttribute("aria-checked", on ? "true" : "false");
      });
      codeLink.querySelector(".lv-btn__label").textContent = state.design.template === LT.CUSTOM_ID ? "Rediger koden" : "Tilpass denne malen i kode";
    }

    function visible() {
      return root.offsetParent !== null;
    }

    function mountThumbs() {
      if (!visible()) {
        dirty = true;
        return;
      }
      dirty = false;
      var rows = state.rows.length ? state.rows : sampleRows();
      thumbs.forEach(function (th) {
        if (th.ctrl) th.ctrl.destroy();
        var w = th.stage.clientWidth || 160;
        var scale = w / THUMB_W;
        th.scaler.style.transform = "scale(" + scale + ")";
        th.stage.style.height = Math.round(THUMB_H * scale) + "px";
        if (th.entry.custom && !state.design.customHtml) {
          th.root.className = "bn";
          th.root.innerHTML = "";
          th.stage.classList.add("is-blank");
          th.ctrl = null;
          return;
        }
        th.stage.classList.remove("is-blank");
        var cfg = app.previewConfig({ design: { template: th.entry.id }, rows: rows });
        th.ctrl = window.LiveAd.mount(th.root, "mobile", cfg, { autoplay: true, refresh: false });
        th.ctrl.pause();
      });
    }

    var codeLink = form.button("Tilpass denne malen i kode", { kind: "quiet", size: "sm", icon: "code", onClick: function () {
      NTLIVE.codeEditor.open(app, { seedFrom: state.design.template === LT.CUSTOM_ID ? null : state.design.template });
    } });

    root.appendChild(
      form.card("Mal", [gallery, h("div.lv-actions.lv-actions--between", null, h("span.lv-fine", null, "Hold musepekeren over en mal for å se den rotere."), codeLink)], {
        desc: "Hvordan hver kamp ser ut. Alle malene fungerer i alle fire formatene.",
      })
    );

    // ---- colour -----------------------------------------------------------------
    root.appendChild(
      form.card("Farge", [
        form.color({ value: state.design.accent, presets: LT.ACCENTS, onChange: function (v) { if (v !== state.design.accent) app.setDesign("accent", v); } }),
        h("p.lv-fine", null, "Én aksentfarge; mørke og lyse toner til flater, knapper og animasjoner regnes ut av den."),
      ])
    );

    // ---- background -------------------------------------------------------------
    var bgGrid = h("div.lv-bgs", { role: "radiogroup", "aria-label": "Bakgrunn uten bilde" });
    var bgTiles = [];
    LT.BACKGROUNDS.forEach(function (b) {
      var art = h("span.lv-bg__art");
      if (b.id === "bilde") art.appendChild(icon("image", 18));
      else art.appendChild(h("span.bn__anim.bn__anim--" + b.id, null, b.id === "konfetti" ? confetti() : null));
      var tile = h("button.lv-bg", { type: "button", role: "radio", "data-id": b.id }, art, h("span.lv-bg__name", null, b.name));
      tile.addEventListener("click", function () {
        if (b.id === "bilde" && !state.fallbackImage) {
          app.toast("Last opp et reservebilde under Tekster først", "err");
          return;
        }
        app.setDesign("defaultMedia", b.id);
        paintBgs();
      });
      bgTiles.push(tile);
      bgGrid.appendChild(tile);
    });
    function confetti() {
      var out = [];
      for (var i = 0; i < 6; i++) {
        var s = h("span.bn__confetti");
        s.style.left = (i * 17 + 6) + "%";
        s.style.background = ["#ffc000", "#ff7337", "#00c1ff", "#ff7ea9", "#96d94e", "#ffffff"][i];
        s.style.animationDelay = -(i * 0.5) + "s";
        out.push(s);
      }
      return out;
    }
    function paintBgs() {
      var pal = window.LiveAd.palette(state.design.accent);
      Object.keys(pal).forEach(function (k) { bgGrid.style.setProperty(k, pal[k]); });
      bgTiles.forEach(function (t) {
        var on = t.getAttribute("data-id") === state.design.defaultMedia;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-checked", on ? "true" : "false");
      });
    }
    paintBgs();
    root.appendChild(
      form.card("Uten bilde eller video", [
        bgGrid,
        form.toggle({ value: state.design.teamsInAnimation, label: "Skriv lagnavnene stort i animasjonen", hint: "Gjelder malene med bildeflate (Klassisk og Oddstavle).", onChange: function (v) { app.setDesign("teamsInAnimation", v); } }),
        h("p.lv-fine", null, "Kolonnen «Animasjon» i arket overstyrer per kamp. Et bilde eller en video i arket går alltid foran."),
      ], { desc: "Det kampene viser når arket ikke har bilde." })
    );

    // ---- motion & type ----------------------------------------------------------
    var motionDesc = h("p.lv-fine");
    function describeMotion() {
      var m = LT.MOTIONS.filter(function (x) { return x.id === state.design.motion; })[0];
      motionDesc.textContent = m ? m.description : "";
    }
    describeMotion();
    var replay = form.button("Spill av igjen", { kind: "quiet", size: "sm", icon: "refresh", onClick: function () { app.rebuild(); } });
    root.appendChild(
      form.card("Bevegelse og tekst", [
        form.field(
          "Inngang",
          form.seg({
            value: state.design.motion,
            block: true,
            items: LT.MOTIONS.map(function (m) { return [m.id, m.name, m.description]; }),
            onChange: function (v) {
              app.setDesign("motion", v);
              describeMotion();
            },
          }),
          null,
          { aside: replay }
        ),
        motionDesc,
        form.field("Tekststørrelse", form.range({ min: 0.7, max: 1.4, step: 0.05, value: state.design.textScale, fmt: function (v) { return Math.round(v * 100) + " %"; }, onChange: function (v) { app.setDesign("textScale", v); } }), "Skalerer overskriften. Lange lagnavn krymper uansett av seg selv til de får plass."),
      ])
    );

    app.on("config", function () {
      markSelected();
      paintBgs();
      mountThumbs();
    });
    app.on("rows", mountThumbs);
    app.on("tab", function (id) {
      if (id === "design") requestAnimationFrame(function () { if (dirty || thumbs.some(function (t) { return !t.ctrl && !(t.entry.custom && !state.design.customHtml); })) mountThumbs(); });
    });
    markSelected();
    requestAnimationFrame(mountThumbs);
    return root;
  }

  NTLIVE.panels = NTLIVE.panels || {};
  NTLIVE.panels.design = panel;
})();
