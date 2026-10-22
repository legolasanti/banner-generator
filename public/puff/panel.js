/* =========================================================================
   puff/panel.js — the Artikkelpuff form on the left, in the same four steps
   as the banner builder: 1 Bilder og video, 2 Tekst og lenker, 3 Annonsør,
   4 Nedlasting, with the generate button in the footer.

   Built once; refresh() only updates what changed, so a slider or a text
   field being used is never rebuilt under the pointer. Every change goes to
   main.js through `app`.
   ========================================================================= */
(function () {
  "use strict";

  var PUFF = (window.PUFF = window.PUFF || {});
  var Ad = window.PuffAd;
  var M = PUFF.media;
  var h = window.WPE.util.h;

  var ICON_UPLOAD =
    '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
  var ICON_LINK =
    '<svg class="inputicon__icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

  function svg(markup) {
    var t = document.createElement("template");
    t.innerHTML = markup; // constant markup above, never user input
    return t.content.firstChild;
  }

  function setValue(input, value) {
    if (document.activeElement !== input && input.value !== String(value)) input.value = value;
  }

  function fileChooser(accept, multiple, onFiles) {
    var input = h("input", { type: "file", accept: accept, hidden: true, multiple: !!multiple });
    input.addEventListener("change", function () {
      if (input.files && input.files.length) onFiles(input.files);
      input.value = "";
    });
    return input;
  }

  function step(n, title) {
    return h("h3.fgroup__title", null, h("span.fgroup__step", null, String(n)), title);
  }

  function slider(label, attrs, onInput) {
    var input = h("input", Object.assign({ type: "range", "aria-label": label }, attrs));
    var out = h("output.pu-slider__out");
    input.addEventListener("input", function () {
      onInput(Number(input.value));
    });
    return { node: h("label.pu-slider", null, h("span.pu-slider__name", null, label), input, out), input: input, out: out };
  }

  // ---- 1 · media ----------------------------------------------------------------
  function mediaSection(app, refs) {
    var chooser = fileChooser(M.ACCEPT, true, function (files) {
      app.addFiles(files, null);
    });
    var zone = h(
      "div.dropzone.pu-drop",
      { tabindex: "0", role: "button", "aria-label": "Last opp bilder og video til alle tre sakene" },
      chooser,
      h(
        "div.dropzone__empty",
        null,
        svg(ICON_UPLOAD),
        h("p", null, h("strong", null, "Dra inn alle tre på én gang"), h("br"), "eller klikk og marker flere filer"),
        h("span.dropzone__hint", null, "JPG · PNG · WEBP · AVIF · GIF · MP4 · WEBM")
      )
    );
    zone.addEventListener("click", function (e) {
      if (e.target !== chooser) chooser.click();
    });
    zone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        chooser.click();
      }
    });
    ["dragenter", "dragover"].forEach(function (type) {
      zone.addEventListener(type, function (e) {
        e.preventDefault();
        zone.classList.add("is-drag");
      });
    });
    zone.addEventListener("dragleave", function () {
      zone.classList.remove("is-drag");
    });
    zone.addEventListener("drop", function (e) {
      e.preventDefault();
      zone.classList.remove("is-drag");
      if (e.dataTransfer.files && e.dataTransfer.files.length) app.addFiles(e.dataTransfer.files, null);
    });

    refs.slots = Ad.SLOTS.map(function (spec, i) {
      return slotCard(app, spec, i);
    });
    return h(
      "section.fgroup",
      null,
      step(1, "Bilder og video"),
      h("div.field", null, zone, h("p.field__help", null, "Første fil blir hovedsaken, de to neste sak 2 og 3. Rekkefølgen kan endres etterpå, og du kan slippe en fil rett på en sak i forhåndsvisningen.")),
      h("div.pu-slots", null, refs.slots.map(function (s) { return s.node; }))
    );
  }

  function slotCard(app, spec, i) {
    var chooser = fileChooser(M.ACCEPT, false, function (files) {
      app.addFiles(files, i);
    });
    var thumbImg = h("img.pu-slot__img", { alt: "" });
    var kind = h("span.pu-slot__kind");
    var thumb = h("div.pu-slot__thumb", { title: "Bytt fil" }, thumbImg, kind);
    thumb.addEventListener("click", function () {
      chooser.click();
    });
    var file = h("span.pu-slot__file");
    var warn = h("p.pu-slot__warn");
    var btnSwap = h("button.btn-ghost.btn-sm", { type: "button" }, "Bytt fil");
    btnSwap.addEventListener("click", function () {
      chooser.click();
    });
    var btnUp = h("button.btn-ghost.btn-sm.pu-slot__move", { type: "button", title: "Flytt opp", "aria-label": "Flytt " + spec.name + " opp" }, "↑");
    var btnDown = h("button.btn-ghost.btn-sm.pu-slot__move", { type: "button", title: "Flytt ned", "aria-label": "Flytt " + spec.name + " ned" }, "↓");
    var btnRemove = h("button.btn-ghost.btn-sm.is-danger", { type: "button" }, "Fjern");
    btnUp.addEventListener("click", function () {
      app.moveSlot(i, -1);
    });
    btnDown.addEventListener("click", function () {
      app.moveSlot(i, 1);
    });
    btnRemove.addEventListener("click", function () {
      app.clearSlot(i);
    });
    btnUp.disabled = i === 0;
    btnDown.disabled = i === Ad.SLOTS.length - 1;

    var zoom = slider("Zoom", { min: 0, max: Ad.MAX_ZOOM, step: 1, value: 0 }, function (v) {
      app.setCrop(i, { zoom: v });
    });
    var poster = slider("Stillbilde", { min: 0, max: 10, step: 0.1, value: 0 }, function (v) {
      poster.out.textContent = M.formatSeconds(v);
      app.setPosterTime(i, v);
    });
    var reset = h("button.btn-ghost.btn-sm", { type: "button" }, "Nullstill utsnitt");
    reset.addEventListener("click", function () {
      app.setCrop(i, { zoom: 0, x: 50, y: 50 });
    });
    var controls = h("div.pu-slot__controls", null, zoom.node, poster.node, h("div.pu-slot__row", null, h("span.field__help", null, "Dra i forhåndsvisningen for å flytte utsnittet."), reset));

    var node = h(
      "article.pu-slot",
      { dataset: { slot: String(i) } },
      chooser,
      h(
        "div.pu-slot__top",
        null,
        thumb,
        h(
          "div.pu-slot__body",
          null,
          h("div.pu-slot__title", null, h("span.pu-slot__num", null, String(i + 1)), spec.name, h("span.pu-slot__size", null, spec.box.w + "×" + spec.box.h)),
          file,
          h("div.pu-slot__actions", null, btnSwap, btnUp, btnDown, btnRemove)
        )
      ),
      controls,
      warn
    );
    ["dragenter", "dragover"].forEach(function (type) {
      node.addEventListener(type, function (e) {
        e.preventDefault();
        e.stopPropagation();
        node.classList.add("is-drop");
      });
    });
    node.addEventListener("dragleave", function (e) {
      if (!node.contains(e.relatedTarget)) node.classList.remove("is-drop");
    });
    node.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      node.classList.remove("is-drop");
      if (e.dataTransfer.files && e.dataTransfer.files.length) app.addFiles(e.dataTransfer.files, i);
    });

    function refresh(slot, busy) {
      var empty = slot.kind === "empty";
      node.classList.toggle("is-empty", empty);
      node.classList.toggle("is-busy", busy != null);
      var src = slot.kind === "video" ? slot.poster : slot.src;
      if (src) {
        if (thumbImg.getAttribute("src") !== src) thumbImg.setAttribute("src", src);
      } else thumbImg.removeAttribute("src");
      thumbImg.hidden = !src;
      kind.textContent = empty ? "" : slot.kind === "video" ? "Video" + (slot.duration ? " · " + M.formatSeconds(slot.duration) : "") : "Bilde";
      kind.hidden = empty;
      file.textContent =
        busy != null
          ? "Laster opp … " + Math.round(busy * 100) + " %"
          : empty
          ? "Tom – slipp en fil her"
          : [slot.name || (slot.kind === "video" ? "video" : "bilde"), slot.w && slot.h ? slot.w + "×" + slot.h : "", M.formatBytes(slot.bytes)].filter(Boolean).join(" · ");
      btnRemove.disabled = empty;
      controls.hidden = empty;
      setValue(zoom.input, slot.crop.zoom);
      zoom.out.textContent = Math.round(slot.crop.zoom) + " %";
      poster.node.hidden = slot.kind !== "video";
      if (slot.kind === "video") {
        poster.input.max = String(Math.max(0.1, Math.floor((slot.duration || 0.1) * 10) / 10));
        setValue(poster.input, slot.posterTime || 0);
        poster.out.textContent = M.formatSeconds(slot.posterTime || 0);
      }
      // A source smaller than the box gets enlarged, and an enlarged photo is
      // soft — say so while it can still be swapped.
      var box = spec.box;
      var place = Ad.placement(slot.w, slot.h, box.w, box.h, slot.crop);
      var k = slot.w ? place.width / slot.w : 0;
      warn.textContent = !empty && k > 1.05 ? "Lav oppløsning: forstørres " + Math.round(k * 100) + " % i annonsen og kan bli uskarp." : "";
      warn.hidden = !warn.textContent;
    }

    return { node: node, refresh: refresh };
  }

  // ---- 2 · text and links ------------------------------------------------------
  function textSection(app, refs) {
    refs.texts = Ad.SLOTS.map(function (spec, i) {
      var id = "pu-head-" + i;
      var counter = h("span.counter");
      var area = h("textarea.textarea", { id: id, rows: 2, maxlength: Ad.MAX_HEADLINE, placeholder: i === 0 ? "F.eks. New York Times anbefaler denne norske øya i 2026" : i === 1 ? "F.eks. Fra reinsdyr til kongekrabbe og fersk fisk" : "F.eks. Bare 70 meter bred på det smaleste" });
      area.addEventListener("input", function () {
        app.setSlot(i, { headline: area.value });
      });
      var fit = h("span.pu-fit");
      var link = h("input.input", { type: "url", spellcheck: "false", inputmode: "url", placeholder: i === 0 ? "https://… (lenken til hovedsaken)" : "Tom = samme lenke som hovedsaken", "aria-label": spec.name + " – lenke" });
      link.addEventListener("input", function () {
        app.setSlot(i, { link: link.value.trim() });
      });
      var node = h(
        "div.field.pu-text",
        null,
        h("label.field__label", { for: id }, h("span.pu-slot__num", null, String(i + 1)), spec.name, h("span.field__hint", null, "maks 2 linjer"), counter),
        area,
        fit,
        h("div.inputicon", null, svg(ICON_LINK), link)
      );
      return {
        node: node,
        refresh: function (slot, fitInfo) {
          setValue(area, slot.headline);
          setValue(link, slot.link);
          counter.textContent = slot.headline.length + " / " + Ad.MAX_HEADLINE;
          link.setAttribute("aria-invalid", slot.link && !/^https?:\/\/\S+\.\S+/.test(slot.link) ? "true" : "false");
          var f = fitInfo || null;
          fit.className = "pu-fit";
          if (!slot.headline) fit.textContent = "";
          else if (!f) fit.textContent = "";
          else if (!f.fits) {
            fit.textContent = "For lang – kuttes etter to linjer. Kort ned teksten.";
            fit.classList.add("is-bad");
          } else if (f.scale < 0.999) {
            fit.textContent = "Passer – skriften er krympet til " + Math.round(f.scale * 100) + " %.";
            fit.classList.add("is-warn");
          } else {
            fit.textContent = "Passer i full størrelse.";
            fit.classList.add("is-ok");
          }
        },
      };
    });
    return h(
      "section.fgroup",
      null,
      step(2, "Tekst og lenker"),
      refs.texts.map(function (t) { return t.node; }),
      h("p.field__help", null, "Hver sak er sin egen klikkflate i HTML5-annonsen (clickTag, clickTag2 og clickTag3). Linjeskift med Enter.")
    );
  }

  // ---- 3 · advertiser -------------------------------------------------------------
  function advertiserSection(app, refs) {
    var label = h("input.input", { type: "text", id: "pu-label", maxlength: 40, placeholder: Ad.DEFAULT_LABEL });
    label.addEventListener("input", function () {
      app.setDoc({ label: label.value });
    });
    var chooser = fileChooser("image/png,image/jpeg,image/webp", false, function (files) {
      app.uploadLogo(files[0]);
    });
    var logoImg = h("img.pu-logo__img", { alt: "Logo" });
    var logoMeta = h("span.filemeta__size");
    var pick = h("button.btn-ghost.btn-sm", { type: "button" }, "Last opp logo");
    var remove = h("button.btn-ghost.btn-sm.is-danger", { type: "button" }, "Fjern");
    pick.addEventListener("click", function () {
      chooser.click();
    });
    remove.addEventListener("click", function () {
      app.setDoc({ logo: { src: "", w: 0, h: 0 } });
    });
    var size = slider("Høyde", { min: Ad.LOGO_HEIGHT.min, max: Ad.LOGO_HEIGHT.max, step: 1, value: Ad.LOGO_HEIGHT.def }, function (v) {
      app.setDoc({ logo: { height: v } });
    });
    var box = h("div.pu-logo", null, chooser, h("div.pu-logo__swatch", null, logoImg, h("span.pu-logo__none", null, "Ingen logo")), h("div.pu-logo__side", null, logoMeta, h("div.row", null, pick, remove)));
    box.addEventListener("dragover", function (e) {
      e.preventDefault();
      box.classList.add("is-drop");
    });
    box.addEventListener("dragleave", function () {
      box.classList.remove("is-drop");
    });
    box.addEventListener("drop", function (e) {
      e.preventDefault();
      box.classList.remove("is-drop");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) app.uploadLogo(e.dataTransfer.files[0]);
    });

    refs.advertiser = function (doc, logoBusy) {
      setValue(label, doc.label);
      var has = !!doc.logo.src;
      box.classList.toggle("has-logo", has);
      if (has && logoImg.getAttribute("src") !== doc.logo.src) logoImg.setAttribute("src", doc.logo.src);
      logoImg.hidden = !has;
      logoMeta.textContent = logoBusy ? "Laster opp …" : has ? doc.logo.w + "×" + doc.logo.h + " px, trimmet" : "PNG med gjennomsiktig bakgrunn er best";
      pick.textContent = has ? "Bytt logo" : "Last opp logo";
      remove.disabled = !has;
      size.node.hidden = !has;
      setValue(size.input, doc.logo.height);
      size.out.textContent = Math.round(doc.logo.height) + " px";
    };
    return h(
      "section.fgroup",
      null,
      step(3, "Annonsør"),
      h("div.field", null, h("label.field__label", { for: "pu-label" }, "Merking", h("span.field__hint", null, "tom = «Annonsørinnhold»")), label),
      h("div.field", null, h("span.field__label", null, "Logo", h("span.field__hint", null, "høyrestilt øverst")), box, size.node)
    );
  }

  // ---- 4 · download -----------------------------------------------------------------
  function exportSection(app, refs) {
    var name = h("input.input", { type: "text", id: "pu-filename", maxlength: 60, placeholder: "hurtigruten-traena" });
    name.addEventListener("input", function () {
      app.set("filename", name.value);
    });
    var preview = h("span.field__preview.pu-filename");
    var choice = h(
      "div.choice",
      { role: "group", "aria-label": "Nedlastingstype" },
      h("button.seg.choice__opt", { type: "button", dataset: { val: "html" } }, h("span.choice__title", null, "HTML5"), h("span.choice__desc", null, "ZIP til Campaign Manager 360 – med video og tre lenker")),
      h("button.seg.choice__opt", { type: "button", dataset: { val: "image" } }, h("span.choice__title", null, "Bilde"), h("span.choice__desc", null, "PNG/JPEG – video vises som stillbilde"))
    );
    choice.addEventListener("click", function (e) {
      var b = e.target.closest(".choice__opt");
      if (b) app.set("outputType", b.dataset.val);
    });
    var fmt = h(
      "div.segmented",
      { role: "group", "aria-label": "Filformat" },
      ["png", "jpeg", "auto"].map(function (v) {
        return h("button.seg", { type: "button", dataset: { val: v } }, v === "auto" ? "Auto" : v.toUpperCase());
      })
    );
    fmt.addEventListener("click", function (e) {
      var b = e.target.closest(".seg");
      if (b) app.set("format", b.dataset.val);
    });
    var note = h("span.field__preview");

    refs.exportFields = function (state) {
      setValue(name, state.filename);
      preview.textContent = (app.fileBase() || "artikkelpuff") + "-" + Ad.LABEL + (state.outputType === "html" ? ".zip" : "." + (state.format === "jpeg" ? "jpg" : "png"));
      Array.prototype.forEach.call(choice.children, function (b) {
        b.classList.toggle("is-active", b.dataset.val === state.outputType);
      });
      Array.prototype.forEach.call(fmt.children, function (b) {
        b.classList.toggle("is-active", b.dataset.val === state.format);
      });
      var hasVideo = state.doc.slots.some(function (s) { return s.kind === "video"; });
      note.textContent =
        state.outputType === "html"
          ? "Reservebildet (980×600) lages samtidig og lastes ned fra Historikk." + (hasVideo ? " Videoen spilles uten lyd, i loop." : "")
          : hasVideo
          ? "Bildeversjonen viser stillbildet du valgte fra videoen."
          : "";
    };
    return h(
      "section.fgroup",
      null,
      step(4, "Nedlasting"),
      h("div.field", null, h("label.field__label", { for: "pu-filename" }, "Filnavn", h("span.field__hint", null, "uten filtype")), name, preview),
      h("div.field", null, h("span.field__label", null, "Nedlastingstype"), choice, note),
      h("div.field", null, h("span.field__label", null, "Filformat", h("span.field__hint", null, "bilde og reservebilde")), fmt)
    );
  }

  // ---- footer ------------------------------------------------------------------------
  function footer(app, refs) {
    var btn = h("button.btn-generate", { type: "submit" }, h("span.btn-generate__spinner", { "aria-hidden": "true" }), h("span.btn-generate__label", null, "Lag Artikkelpuff"));
    var hint = h("p.form__hint");
    var result = h("div.result", { hidden: true });
    refs.footer = function (state, missing) {
      btn.disabled = !!missing || state.busy;
      btn.classList.toggle("is-loading", !!state.busy);
      btn.lastChild.textContent = state.busy ? "Lager …" : state.outputType === "html" ? "Lag Artikkelpuff · HTML5" : "Lag Artikkelpuff · bilde";
      hint.textContent = missing || "";
      hint.hidden = !missing;
    };
    refs.result = result;
    return h("div.form__footer", null, btn, hint, result);
  }

  /**
   * @param {HTMLElement} host  the form element
   * @param {Object} app        main.js callbacks
   */
  function create(host, app) {
    var refs = {};
    var scroll = h(
      "div.form__scroll",
      null,
      h(
        "header.form__intro",
        null,
        h("h2.form__title", null, "Houseads"),
        h("p.form__desc", null, "Artikkelpuff 980×600: tre annonsørsaker i én annonse. Last opp bilder og video på én gang – hver får sitt eget utsnitt, sin overskrift og sin lenke."),
        h(
          "div.segmented.segmented--block.house-mode",
          { role: "group", "aria-label": "Houseads-type" },
          h("button.seg", { type: "button", dataset: { houseMode: "bannere" }, "aria-pressed": "false" }, "Bannere · 6 formater"),
          h("button.seg.is-active", { type: "button", dataset: { houseMode: "puff" }, "aria-pressed": "true" }, "Artikkelpuff · 980×600")
        )
      ),
      mediaSection(app, refs),
      textSection(app, refs),
      advertiserSection(app, refs),
      exportSection(app, refs)
    );
    host.appendChild(scroll);
    host.appendChild(footer(app, refs));
    host.addEventListener("submit", function (e) {
      e.preventDefault();
      app.generate();
    });

    function refresh(state, fit) {
      state.doc.slots.forEach(function (slot, i) {
        refs.slots[i].refresh(slot, state.busySlots[i]);
        refs.texts[i].refresh(slot, fit && fit[i]);
      });
      refs.advertiser(state.doc, state.logoBusy);
      refs.exportFields(state);
      refs.footer(state, app.missing());
    }

    return { refresh: refresh, result: refs.result };
  }

  PUFF.panel = { create: create };
})();
