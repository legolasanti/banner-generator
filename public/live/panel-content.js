/* =========================================================================
   live/panel-content.js — the Tekster tab (the words around the matches,
   how the kick-off reads, the fallback poster) and the Rotasjon tab (how
   long each match shows, how slides change, which days count).
   ========================================================================= */
(function () {
  "use strict";

  var NTLIVE = (window.NTLIVE = window.NTLIVE || {});
  var h = window.WPE.util.h;
  var LD = window.LiveData;
  var form = NTLIVE.form;
  var icon = NTLIVE.icon;
  var MAX_FALLBACK_BYTES = 9 * 1024 * 1024;

  // ---- Tekster ----------------------------------------------------------------
  function texts(app) {
    var state = app.state;
    var d = state.design;
    var root = h("div.lv-stack");

    root.appendChild(
      form.card("Rundt kampene", [
        form.row(
          form.field("Produktlinje", form.text({ value: d.kicker, placeholder: "Oddsen", maxLength: 60, onChange: function (v) { app.setDesign("kicker", v); } }), "Står over lagene; turneringen fra arket legges til."),
          form.field("Knappetekst", form.text({ value: d.ctaText, placeholder: "Spill nå", maxLength: 40, onChange: function (v) { app.setDesign("ctaText", v); } }), "Tom = ingen knapp. Arket kan overstyre per kamp.")
        ),
        form.field("Listetittel", form.text({ value: d.listTitle, placeholder: "Dagens kamper", maxLength: 60, onChange: function (v) { app.setDesign("listTitle", v); } }), "Overskriften i malen Kampliste."),
      ])
    );

    // Kick-off line, with a live example of what it will say.
    var example = h("div.lv-example", null, icon("clock", 14), h("span"));
    function paintExample() {
      var start = new Date(Date.now() + (2 * 3600 + 14 * 60) * 1000);
      var parts = LD.osloParts(start);
      var row = { date: parts.ymd, time: String(Math.floor(parts.minutes / 60)).padStart(2, "0") + ":" + String(parts.minutes % 60).padStart(2, "0") };
      var label = LD.timeLabel(row, new Date(), { timeMode: state.design.timeMode, clockSep: state.design.clockSep, liveLabel: state.design.liveLabel });
      example.lastChild.textContent = label + "   ·   når kampen går: «" + (state.design.liveLabel || "Pågår nå") + "»";
    }
    paintExample();
    root.appendChild(
      form.card("Avsparkslinjen", [
        form.field(
          "Vis",
          form.seg({
            value: d.timeMode,
            block: true,
            items: [["clock", "Klokkeslett", "«I dag kl. 21:00»"], ["countdown", "Nedtelling", "«Starter om 2 t 14 min»"], ["both", "Begge", "«I dag kl. 21:00 · om 2 t 14 min»"]],
            onChange: function (v) { app.setDesign("timeMode", v); paintExample(); },
          })
        ),
        form.row(
          form.field("Klokkeslett", form.seg({ value: d.clockSep, block: true, items: [[":", "21:00"], [".", "21.00"]], onChange: function (v) { app.setDesign("clockSep", v); paintExample(); } })),
          form.field("Mens kampen pågår", form.text({ value: d.liveLabel, maxLength: 40, onChange: function (v) { app.setDesign("liveLabel", v); paintExample(); } }))
        ),
        example,
      ], { desc: "Oppdateres hvert sekund i annonsen, i norsk tid." })
    );

    // Fallback poster: headline, text and photo.
    var file = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/avif,image/gif", hidden: true });
    var drop = h("button.lv-drop", { type: "button" });
    function paintDrop() {
      drop.innerHTML = "";
      drop.classList.toggle("has-image", !!state.fallbackImage);
      if (state.fallbackImage) {
        drop.appendChild(h("img.lv-drop__img", { src: state.fallbackImage, alt: "Reservebildet" }));
        drop.appendChild(h("span.lv-drop__over", null, icon("upload", 15), "Bytt bilde"));
      } else {
        drop.appendChild(h("span.lv-drop__icon", null, icon("image", 20)));
        drop.appendChild(h("span.lv-drop__text", null, h("b", null, "Slipp et bilde her"), h("span", null, "eller klikk for å velge · JPG, PNG, WEBP")));
      }
      clear.hidden = !state.fallbackImage;
    }
    var clear = form.button("Fjern bildet", { kind: "quiet", size: "sm", icon: "trash", onClick: function () {
      app.patch({ fallbackImage: "" });
      if (state.design.defaultMedia === "bilde") app.setDesign("defaultMedia", "gradient");
      paintDrop();
    } });
    function readFile(f) {
      if (!f) return;
      if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(f.type)) return app.toast("Reservebildet må være JPG, PNG, WEBP, AVIF eller GIF", "err");
      if (f.size > MAX_FALLBACK_BYTES) return app.toast("Reservebildet er for stort (maks 9 MB)", "err");
      var reader = new FileReader();
      reader.onload = function () {
        app.patch({ fallbackImage: String(reader.result || "") });
        paintDrop();
        app.toast("Reservebildet er lagt inn", "ok");
      };
      reader.readAsDataURL(f);
    }
    drop.addEventListener("click", function () { file.click(); });
    file.addEventListener("change", function () { readFile(file.files && file.files[0]); file.value = ""; });
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("is-over"); });
    });
    drop.addEventListener("drop", function (e) { readFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
    paintDrop();

    var showFallback = form.button("Vis reserveplakaten", { kind: "quiet", size: "sm", icon: "eye", onClick: function () { if (app.preview) app.preview.showFallback(); } });
    root.appendChild(
      form.card("Reserveplakat", [
        form.field("Overskrift", form.text({ value: d.fallbackHeadline, maxLength: 90, onChange: function (v) { app.setDesign("fallbackHeadline", v); } })),
        form.field("Tekst", form.text({ value: d.fallbackText, maxLength: 90, onChange: function (v) { app.setDesign("fallbackText", v); } })),
        form.field("Bilde", h("div.lv-stack.lv-stack--tight", null, drop, file, h("div.lv-actions", null, clear)), "Brukes på reserveplakaten, og for kampene uten bilde når «Reservebildet» er valgt under Design. Pakkes alltid inn."),
      ], { desc: "Når arket ikke har kamper i dag (eller de neste dagene du velger).", action: showFallback })
    );

    root.appendChild(
      form.card("Vinnersjanse", [
        form.field("Tekst", form.text({ value: state.badges.vinnersjanse, maxLength: 120, placeholder: "Tom for sport", onChange: function (v) { app.patch({ badges: Object.assign({}, state.badges, { vinnersjanse: v }) }); } }), "Sport har ingen vinnersjanse-linje. Fyll ut bare for lotterispill."),
        form.toggle({ value: state.badges.showVinnerOnNewsgrid, label: "Vis den også på 190×190", onChange: function (v) { app.patch({ badges: Object.assign({}, state.badges, { showVinnerOnNewsgrid: v }) }); } }),
      ])
    );
    return root;
  }

  // ---- Rotasjon -----------------------------------------------------------------
  function rotation(app) {
    var d = app.state.design;
    var root = h("div.lv-stack");
    root.appendChild(
      form.card("Rotasjon", [
        form.field("Tid per kamp", form.range({ min: 2, max: 20, value: d.slideMs / 1000, fmt: function (v) { return v + " s"; }, onChange: function (v) { app.setDesign("slideMs", v * 1000); } })),
        form.field(
          "Overgang",
          form.seg({
            value: d.transition,
            block: true,
            items: [["fade", "Toning"], ["slide", "Glidende"], ["zoom", "Zoom"], ["none", "Ingen"]],
            onChange: function (v) { app.setDesign("transition", v); },
          })
        ),
        form.field("Maks antall kamper", form.number({ min: 1, max: 12, value: d.maxSlides, unit: "kamper", onChange: function (v) { app.setDesign("maxSlides", v); } }), "De første etter avsparkstid. I Kampliste: antall rader."),
      ], { desc: "Med flere kamper samme dag vises de etter tur." })
    );
    root.appendChild(
      form.card("Hvilke kamper", [
        form.field("Uten kamper i dag, se fram", form.number({ min: 0, max: 14, value: d.lookAheadDays, unit: "dager", onChange: function (v) { app.setDesign("lookAheadDays", v); } }), "Viser neste kampdag («I morgen kl. …», «Lørdag kl. …»). 0 = bare i dag."),
        form.field("Ta kampen ut etter avspark", form.number({ min: 0, max: 600, step: 15, value: d.finishedAfterMin, unit: "min", onChange: function (v) { app.setDesign("finishedAfterMin", v); } }), "Til da står «" + (d.liveLabel || "Pågår nå") + "» med en blinkende prikk."),
        h(
          "ol.lv-rules",
          null,
          h("li", null, "Dagens kamper som ikke er ferdige, sortert på avspark."),
          h("li", null, "Ingen i dag? Neste dag med kamper, innenfor dagene over."),
          h("li", null, "Ingenting? Reserveplakaten.")
        ),
      ], { desc: "Annonsen velger på nytt hvert 20. sekund – også over midnatt." })
    );
    return root;
  }

  NTLIVE.panels = NTLIVE.panels || {};
  NTLIVE.panels.texts = texts;
  NTLIVE.panels.rotation = rotation;
})();
