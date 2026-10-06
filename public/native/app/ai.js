/* =========================================================================
   app/ai.js — the AI mode.

   A wizard in four steps, each one reviewable before the next:

     1 Kilder    the material: a Google Docs brief (by link or .docx), the
                 shared Drive folder with the shoot, the advertiser's product
                 pages, a few lines from the user, and which photos to show
     2 Spørsmål  the AI's reading of it — summary, facts (with the ones to
                 double-check flagged), quotes, photo descriptions — and the
                 handful of questions it really needs answered, with its own
                 best guess pre-selected
     3 Plan      three headline options, the ingress and the section plan;
                 everything editable, reorderable, removable
     4 Skriv     each section written in parallel and checked against the
                 limits; then placed on the page, with the AI's warnings
                 saved as comments on the sections they concern

   Its state lives in project.ai, so closing the wizard loses nothing.
   Also here: the ✨ rewrite menu that text fields use.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var S = window.NativeSchema;
  var D = window.NativeDoc;

  var CATEGORY = {
    mal: "Mål", malgruppe: "Målgruppe", budskap: "Vinkel", fakta: "Fakta", tone: "Tone",
    cta: "Lenker", visuelt: "Bilder", sitater: "Sitater", juridisk: "Juridisk", struktur: "Struktur",
  };
  var MAX_IMAGES = 14;
  var CONCURRENCY = 3;

  function project() {
    return NP.store.get().project;
  }

  function saveAi(ai) {
    NP.store.update(function (p) {
      return Object.assign({}, p, { ai: Object.assign({}, p.ai || {}, ai, { at: new Date().toISOString() }) });
    }, { group: "ai-state" });
  }

  function notConfigured() {
    var m = ui.modal({
      title: "AI er ikke satt opp",
      body: h(
        "div.nx-stack",
        null,
        h("p", null, "For å bruke AI trenger ABC design en API-nøkkel fra OpenRouter."),
        h("ol.nx-steps-list", null,
          h("li", null, "Lag en nøkkel på openrouter.ai/keys (kontoen til ABC / Hegnar Media)."),
          h("li", null, "Kopier .env.example til .env i mappen til ABC design."),
          h("li", null, "Lim inn nøkkelen etter OPENROUTER_API_KEY= og start appen på nytt (npm start).")
        ),
        h("p.nx-muted", null, "Modellene velges under Innstillinger. Alle forespørsler sendes med «zero data retention», så leverandørene lagrer ikke briefen.")
      ),
      actions: [ui.button("OK", { kind: "primary", onClick: function () { m.close(); } })],
    });
  }

  // =====================================================================
  // The wizard
  // =====================================================================
  function open() {
    if (!NP.aiConfigured) return notConfigured();
    var p = project();
    var saved = p.ai || {};
    var st = {
      step: saved.outline ? 3 : saved.analysis ? 2 : 1,
      brief: saved.brief || "",
      advertiser: saved.advertiser || p.advertiser.name || "",
      sources: Array.isArray(saved.sources) ? saved.sources : [],
      selectedImages: saved.selectedImages || null,
      analysis: saved.analysis || null,
      imageMap: saved.imageMap || {},
      answers: saved.answers || {},
      outline: saved.outline || null,
      title: saved.title || "",
      ingress: saved.ingress || "",
      length: saved.length || "normal",
      cost: 0,
      busy: false,
    };
    var body = h("div.nx-wiz");
    var foot = h("div.nx-wiz__foot");
    var stepper = h("ol.nx-wiz__steps");
    var m = ui.modal({ title: "Lag siden med AI", full: true, sticky: true, body: h("div.nx-wiz__wrap", null, stepper, body, foot) });

    function persist() {
      saveAi({
        brief: st.brief,
        advertiser: st.advertiser,
        sources: st.sources.map(function (s) {
          return { kind: s.kind, title: s.title, name: s.name, url: s.url, text: String(s.text || "").slice(0, 30000), notes: s.notes || [], facts: s.facts || [], words: s.words, images: s.images || [] };
        }),
        selectedImages: st.selectedImages,
        analysis: st.analysis,
        imageMap: st.imageMap,
        answers: st.answers,
        outline: st.outline,
        title: st.title,
        ingress: st.ingress,
        length: st.length,
      });
    }

    function drawSteps() {
      ui.clear(stepper);
      [["Kilder", 1], ["Spørsmål", 2], ["Plan", 3], ["Skriv", 4]].forEach(function (s) {
        var reachable = s[1] === 1 || (s[1] === 2 && st.analysis) || (s[1] === 3 && st.outline) || (s[1] === 4 && st.outline);
        stepper.appendChild(
          h("li.nx-wiz__step" + (st.step === s[1] ? ".is-cur" : "") + (st.step > s[1] ? ".is-done" : ""), null,
            h("button", { type: "button", disabled: !reachable || st.busy || s[1] === 4, on: { click: function () { go(s[1]); } } },
              h("span.nx-wiz__num", null, String(s[1])), h("span", null, s[0])))
        );
      });
      if (st.cost) stepper.appendChild(h("li.nx-wiz__cost.nx-muted", { title: "Kostnad for AI-kallene i denne økten" }, "≈ " + ui.money(st.cost)));
    }

    function go(step) {
      st.step = step;
      draw();
    }

    function draw() {
      drawSteps();
      ui.clear(body);
      ui.clear(foot);
      if (st.step === 1) stepSources();
      if (st.step === 2) stepQuestions();
      if (st.step === 3) stepPlan();
      if (st.step === 4) stepWrite();
      body.scrollTop = 0;
    }

    function busy(on, text) {
      st.busy = on;
      ui.clear(foot);
      if (on) foot.appendChild(h("div.nx-wiz__busy", null, ui.spinner(), h("span", null, text || "Jobber …")));
      drawSteps();
    }

    // ---- step 1: sources ------------------------------------------------------------
    function sourceCard(src, i) {
      var label = src.kind === "gdoc" ? "Google Docs" : src.kind === "docx" ? "Word" : src.kind === "web" ? "Nettside" : "Kilde";
      return h(
        "div.nx-src",
        null,
        h("span.nx-src__icon", null, ui.icon(src.kind === "web" ? "globe" : "file-text", 18)),
        h("div.nx-src__main", null,
          h("strong", null, src.title || src.name || src.url || label),
          h("span.nx-muted", null, label + " · " + (src.words || 0) + " ord" +
            (src.notes && src.notes.length ? " · " + src.notes.length + " kommentarer" : "") +
            (src.facts && src.facts.length ? " · " + src.facts.length + " produktdata" : "")),
          src.images && src.images.length
            ? ui.button("Importer " + src.images.length + " bilder fra dokumentet", { small: true, kind: "ghost", icon: "image-plus", onClick: function (e) {
                var btn = e.currentTarget;
                btn.disabled = true;
                NP.api.source("images", { urls: src.images.map(function (x) { return x.url; }) }).then(function (r) {
                  NP.store.addAssets(r.assets);
                  src.images = [];
                  ui.toast(r.assets.length + " bilder importert", "ok");
                  draw();
                }, function (err) { ui.toast(err.message, "err"); btn.disabled = false; });
              } })
            : null
        ),
        ui.button("", { icon: "trash", small: true, kind: "ghost", title: "Fjern kilden", onClick: function () {
          st.sources.splice(i, 1);
          persist();
          draw();
        } })
      );
    }

    function addSource(promise, btn) {
      if (btn) btn.disabled = true;
      return promise.then(function (r) {
        st.sources.push(r.source);
        if (r.assets && r.assets.length) {
          NP.store.addAssets(r.assets);
          ui.toast(r.assets.length + " bilder fra dokumentet er lagt til", "ok");
        }
        persist();
        draw();
      }, function (err) {
        ui.toast(err.message, "err");
        if (btn) btn.disabled = false;
      });
    }

    function stepSources() {
      var gdoc = h("input.nx-input", { type: "url", placeholder: "https://docs.google.com/document/d/…" });
      var gdocBtn = ui.button("Hent dokumentet", { onClick: function () {
        if (gdoc.value.trim()) addSource(NP.api.source("gdoc", { url: gdoc.value.trim() }), gdocBtn);
      } });
      var web = h("input.nx-input", { type: "url", placeholder: "https://www.annonsor.no/produkt" });
      var webBtn = ui.button("Les siden", { onClick: function () {
        if (web.value.trim()) addSource(NP.api.source("web", { url: web.value.trim() }), webBtn);
      } });
      var docx = h("input", { type: "file", accept: ".docx", hidden: true });
      docx.addEventListener("change", function () {
        if (docx.files[0]) addSource(NP.api.upload("/api/native/sources/docx", docx.files[0], {}), null);
      });
      var brief = h("textarea.nx-input.nx-textarea", { rows: 5, placeholder: "Hva vet du om oppdraget? F.eks.: Ford vil nå småbarnsfamilier som vurderer elbil. Vinkel: hverdagen med én bil. Kampanje til 30. november. CTA: book prøvekjøring." });
      brief.value = st.brief;
      brief.addEventListener("input", function () { st.brief = brief.value; });
      brief.addEventListener("change", persist);
      var adv = h("input.nx-input", { type: "text", value: st.advertiser, placeholder: "Annonsør" });
      adv.addEventListener("input", function () { st.advertiser = adv.value; });

      var images = Object.keys(project().assets).filter(function (id) { return project().assets[id].kind === "image"; });
      if (!st.selectedImages) st.selectedImages = images.slice(0, MAX_IMAGES);
      var imgGrid = h("div.nx-wiz__imgs");
      images.forEach(function (id) {
        var on = st.selectedImages.indexOf(id) !== -1;
        var b = h("button.nx-ref", { type: "button", "aria-pressed": String(on), title: project().assets[id].name || "", on: { click: function () {
          var i = st.selectedImages.indexOf(id);
          if (i === -1) {
            if (st.selectedImages.length >= MAX_IMAGES) return ui.toast("Maks " + MAX_IMAGES + " bilder kan analyseres om gangen", "err");
            st.selectedImages.push(id);
          } else st.selectedImages.splice(i, 1);
          b.setAttribute("aria-pressed", String(st.selectedImages.indexOf(id) !== -1));
        } } }, h("img", { src: ui.thumb(project().assets[id], id, 160), alt: "" }));
        imgGrid.appendChild(b);
      });

      body.appendChild(
        h(
          "div.nx-wiz__cols",
          null,
          h(
            "div.nx-stack",
            null,
            h("h3", null, "Hva skal AI-en lese?"),
            h("p.nx-muted", null, "Jo bedre kildene er, jo bedre blir både spørsmålene og teksten. AI-en bruker bare fakta fra kildene."),
            h("label.nx-field", null, h("span.nx-field__label", null, ui.icon("file-text", 14), " Brief i Google Docs"), h("div.nx-row", null, gdoc, gdocBtn),
              h("p.nx-help", null, "Del dokumentet som «Alle med lenken kan lese». Går ikke det: Fil → Last ned → Word, og ", h("a", { href: "#", on: { click: function (e) { e.preventDefault(); docx.click(); } } }, "last opp .docx-filen"), "."), docx),
            h("label.nx-field", null, h("span.nx-field__label", null, ui.icon("globe", 14), " Annonsørens nettside / produktside"), h("div.nx-row", null, web, webBtn)),
            h("div.nx-field", null, h("span.nx-field__label", null, ui.icon("cloud-download", 14), " Bilder og video i Google Drive"),
              ui.button("Importer fra Drive-mappe …", { onClick: function () {
                NP.media.driveDialog({ onDoc: function (url) { addSource(NP.api.source("gdoc", { url: url }), null); } }).then(function (assets) {
                  if (assets && assets.length) {
                    st.selectedImages = (st.selectedImages || []).concat(assets.filter(function (a) { return a.kind === "image"; }).map(function (a) { return a.id; })).slice(0, MAX_IMAGES);
                  }
                  draw();
                });
              } })),
            h("label.nx-field", null, h("span.nx-field__label", null, "Annonsør"), adv),
            h("label.nx-field", null, h("span.nx-field__label", null, "Din brief / notater"), brief)
          ),
          h(
            "div.nx-stack",
            null,
            h("h3", null, "Kilder (" + st.sources.length + ")"),
            st.sources.length ? h("div.nx-stack.nx-stack--sm", null, st.sources.map(sourceCard)) : h("p.nx-muted", null, "Ingen kilder ennå."),
            h("h3", null, "Bilder AI-en skal se på (" + (st.selectedImages || []).length + ")"),
            images.length
              ? imgGrid
              : h("p.nx-muted", null, "Ingen bilder i prosjektet. Importer fra Drive eller last opp under Medier – AI-en foreslår da hvor hvert bilde passer."),
            ui.button("Last opp bilder …", { small: true, kind: "ghost", icon: "upload", onClick: function () {
              var f = h("input", { type: "file", accept: "image/*,video/*", multiple: true });
              f.addEventListener("change", function () {
                NP.media.uploadAndAdd(f.files).then(function (assets) {
                  st.selectedImages = (st.selectedImages || []).concat(assets.filter(function (a) { return a.kind === "image"; }).map(function (a) { return a.id; })).slice(0, MAX_IMAGES);
                  draw();
                });
              });
              f.click();
            } })
          )
        )
      );

      foot.appendChild(h("span.nx-muted", null, "Steg 1 av 4"));
      foot.appendChild(ui.button(st.analysis ? "Analyser på nytt" : "Analyser og lag spørsmål", { kind: "primary", icon: "sparkles", onClick: analyze }));
      if (st.analysis) foot.appendChild(ui.button("Til spørsmålene", { onClick: function () { go(2); } }));
    }

    function analyze() {
      st.brief = st.brief.trim();
      if (!st.brief && !st.sources.length) return ui.toast("Legg til minst én kilde eller skriv en kort brief", "err");
      if (st.advertiser && !project().advertiser.name) {
        NP.store.update(function (p) { return Object.assign({}, p, { advertiser: Object.assign({}, p.advertiser, { name: st.advertiser }) }); });
      }
      busy(true, "Leser kildene og bildene … (20–60 sekunder)");
      NP.store.save().then(function () {
        return NP.api.ai("analyze", {
          projectId: project().id,
          brief: st.brief,
          advertiser: st.advertiser,
          sources: st.sources,
          imageIds: st.selectedImages || [],
        });
      }).then(function (r) {
        st.analysis = r.analysis;
        st.imageMap = r.imageMap;
        st.cost += r.cost || 0;
        st.outline = null;
        // Pre-fill the answers with the AI's own best guess.
        var answers = {};
        (r.analysis.questions || []).forEach(function (q) {
          if (!q.suggested) return;
          answers[q.id] = q.type === "multi" ? [q.suggested] : q.suggested;
        });
        st.answers = answers;
        persist();
        busy(false);
        go(2);
      }, function (err) {
        busy(false);
        draw();
        ui.toast(err.message, "err");
      });
    }

    // ---- step 2: analysis + questions ----------------------------------------------
    function questionNode(q) {
      var current = st.answers[q.id];
      var box = h("div.nx-q" + (q.required ? ".is-req" : ""));
      box.appendChild(h("div.nx-q__head", null, h("span.nx-tag", null, CATEGORY[q.category] || q.category), q.required ? h("span.nx-tag.nx-tag--req", null, "Må svares") : null));
      box.appendChild(h("p.nx-q__text", null, q.question));
      if (q.why) box.appendChild(h("p.nx-q__why", null, q.why));
      var name = "q-" + q.id;
      if (q.type === "single" || q.type === "multi") {
        var multi = q.type === "multi";
        var chosen = multi ? (Array.isArray(current) ? current.slice() : current ? [current] : []) : current;
        var other = h("input.nx-input.nx-input--sm", { type: "text", placeholder: "Annet …" });
        var opts = (q.options || []).slice();
        if (!multi && chosen && opts.indexOf(chosen) === -1) other.value = chosen;
        if (multi) chosen.forEach(function (c) { if (opts.indexOf(c) === -1) other.value = c; });
        opts.forEach(function (opt) {
          var input = h("input", { type: multi ? "checkbox" : "radio", name: name, value: opt, checked: multi ? chosen.indexOf(opt) !== -1 : chosen === opt });
          input.addEventListener("change", function () {
            if (multi) {
              var vals = Array.prototype.slice.call(box.querySelectorAll('input[name="' + name + '"]:checked')).map(function (x) { return x.value; });
              if (other.value.trim()) vals.push(other.value.trim());
              st.answers[q.id] = vals;
            } else {
              st.answers[q.id] = opt;
              other.value = "";
            }
          });
          box.appendChild(h("label.nx-q__opt", null, input, h("span", null, opt), opt === q.suggested ? h("span.nx-tag.nx-tag--ai", { title: "Forslag ut fra kildene" }, "forslag") : null));
        });
        other.addEventListener("input", function () {
          if (multi) {
            var vals = Array.prototype.slice.call(box.querySelectorAll('input[name="' + name + '"]:checked')).map(function (x) { return x.value; });
            if (other.value.trim()) vals.push(other.value.trim());
            st.answers[q.id] = vals;
          } else {
            Array.prototype.forEach.call(box.querySelectorAll('input[name="' + name + '"]'), function (x) { x.checked = false; });
            st.answers[q.id] = other.value;
          }
        });
        box.appendChild(other);
      } else {
        var input = h("textarea.nx-input.nx-textarea", { rows: 2, placeholder: q.suggested || "" });
        input.value = typeof current === "string" ? current : "";
        input.addEventListener("input", function () { st.answers[q.id] = input.value; });
        box.appendChild(input);
      }
      return box;
    }

    function stepQuestions() {
      var a = st.analysis;
      if (!a) return go(1);
      var p = project();
      var revImages = {};
      Object.keys(st.imageMap || {}).forEach(function (k) { revImages[k] = st.imageMap[k]; });

      var facts = h("ul.nx-facts");
      (a.facts || []).forEach(function (f) {
        facts.appendChild(h("li" + (f.needsCheck ? ".is-check" : ""), null, h("span.nx-facts__id", null, f.id), h("span", null, f.text), f.needsCheck ? h("span.nx-tag.nx-tag--warn", null, "sjekk") : null, f.source ? h("span.nx-muted", null, " – " + f.source) : null));
      });
      var imgs = h("div.nx-wiz__imgdesc");
      (a.images || []).forEach(function (im) {
        var id = revImages[im.id];
        if (!id || !p.assets[id]) return;
        imgs.appendChild(h("div.nx-imgdesc", null,
          h("img", { src: ui.thumb(p.assets[id], id, 160), alt: "" }),
          h("div", null, h("strong", null, im.id + " · " + im.quality), h("p", null, im.description), h("p.nx-muted", null, "→ " + im.suggestedUse))));
      });
      var useAlt = ui.button("Bruk AI-ens alt-tekster der de mangler", { small: true, kind: "ghost", icon: "check", onClick: function () {
        var n = 0;
        (a.images || []).forEach(function (im) {
          var id = revImages[im.id];
          if (id && p.assets[id] && !p.assets[id].alt && im.alt) {
            NP.store.setAsset(id, { alt: im.alt, desc: im.description });
            n++;
          }
        });
        ui.toast(n + " alt-tekster lagt inn", "ok");
      } });

      var lengthSel = ui.segmented([["kort", "Kort (4–6 seksjoner)"], ["normal", "Normal (7–10)"], ["lang", "Lang (11–14)"]], st.length, function (v) { st.length = v; }, { small: true });

      body.appendChild(
        h(
          "div.nx-wiz__cols",
          null,
          h(
            "div.nx-stack",
            null,
            h("h3", null, "Spørsmål fra AI-en"),
            h("p.nx-muted", null, (a.questions || []).length
              ? "Svar på det du kan. Forslagene er AI-ens tolkning av kildene – bekreft eller endre."
              : "AI-en har ingen spørsmål – kildene svarer på alt den trenger."),
            (a.questions || []).map(questionNode),
            h("div.nx-field", null, h("span.nx-field__label", null, "Lengde"), lengthSel)
          ),
          h(
            "div.nx-stack",
            null,
            h("h3", null, "Slik leser AI-en oppdraget"),
            h("p", null, a.summary),
            a.product ? h("p.nx-muted", null, "Produkt: " + a.product) : null,
            a.audience ? h("p.nx-muted", null, "Målgruppe: " + a.audience) : null,
            (a.gaps || []).length ? h("div.nx-note.nx-note--warn", null, ui.icon("circle-alert", 15), h("div", null, h("strong", null, "Mangler: "), a.gaps.join(" · "))) : null,
            h("details.nx-details", { open: true }, h("summary", null, "Fakta (" + (a.facts || []).length + ")"), facts),
            (a.quotes || []).length ? h("details.nx-details", null, h("summary", null, "Sitater (" + a.quotes.length + ")"), h("div", null, a.quotes.map(function (q) { return h("p", null, "«" + q.text + "» – " + q.person + (q.role ? ", " + q.role : "")); }))) : null,
            (a.images || []).length ? h("details.nx-details", null, h("summary", null, "Bildene (" + a.images.length + ")"), imgs, useAlt) : null
          )
        )
      );
      foot.appendChild(ui.button("Tilbake", { kind: "ghost", onClick: function () { persist(); go(1); } }));
      foot.appendChild(ui.button("Lag plan for siden", { kind: "primary", icon: "sparkles", onClick: makeOutline }));
      if (st.outline) foot.appendChild(ui.button("Til planen", { onClick: function () { persist(); go(3); } }));
    }

    function missingRequired() {
      return (st.analysis.questions || []).filter(function (q) {
        if (!q.required) return false;
        var v = st.answers[q.id];
        return !v || (Array.isArray(v) ? !v.length : !String(v).trim());
      });
    }

    function makeOutline() {
      var missing = missingRequired();
      var ask = missing.length
        ? ui.confirm("Noen spørsmål er ikke besvart", "«" + missing[0].question + "»" + (missing.length > 1 ? " og " + (missing.length - 1) + " til" : "") + " mangler svar. AI-en skriver da rundt det og legger inn en advarsel.", "Fortsett likevel")
        : Promise.resolve(true);
      ask.then(function (ok) {
        if (!ok) return;
        persist();
        busy(true, "Planlegger siden …");
        NP.api.ai("outline", {
          projectId: project().id,
          analysis: st.analysis,
          answers: st.answers,
          imageMap: st.imageMap,
          brief: st.brief,
          length: { kort: "kort, 4–6 seksjoner", normal: "normal, 7–10 seksjoner", lang: "lang, 11–14 seksjoner" }[st.length],
        }).then(function (r) {
          st.outline = r.outline;
          st.cost += r.cost || 0;
          st.title = r.outline.titles[0] || "";
          st.ingress = r.outline.ingress || "";
          persist();
          busy(false);
          go(3);
        }, function (err) {
          busy(false);
          draw();
          ui.toast(err.message, "err");
        });
      });
    }

    // ---- step 3: plan ------------------------------------------------------------------
    function stepPlan() {
      var o = st.outline;
      if (!o) return go(2);
      var p = project();
      var titles = h("div.nx-stack.nx-stack--sm");
      var custom = h("input.nx-input", { type: "text", maxlength: 120, placeholder: "Eller skriv din egen tittel" });
      if (o.titles.indexOf(st.title) === -1) custom.value = st.title;
      o.titles.forEach(function (t) {
        var r = h("input", { type: "radio", name: "np-title", checked: st.title === t });
        r.addEventListener("change", function () { st.title = t; custom.value = ""; });
        titles.appendChild(h("label.nx-q__opt.nx-q__opt--title", null, r, h("span", null, t), h("span.nx-muted", null, t.length + " tegn")));
      });
      custom.addEventListener("input", function () {
        st.title = custom.value;
        Array.prototype.forEach.call(titles.querySelectorAll("input"), function (x) { x.checked = false; });
      });
      var ingress = h("textarea.nx-input.nx-textarea", { rows: 3 });
      ingress.value = st.ingress;
      ingress.addEventListener("input", function () { st.ingress = ingress.value; });

      var list = h("ol.nx-plan");
      function drawList() {
        ui.clear(list);
        o.sections.forEach(function (sec, i) {
          var type = h("select.nx-input.nx-select.nx-select--sm");
          S.aiBlockTypes().forEach(function (t) { type.appendChild(h("option", { value: t, selected: t === sec.type }, S.BLOCKS[t].label)); });
          type.addEventListener("change", function () { sec.type = type.value; });
          var purpose = h("textarea.nx-input.nx-textarea", { rows: 2 });
          purpose.value = sec.purpose;
          purpose.addEventListener("input", function () { sec.purpose = purpose.value; });
          var imgs = h("div.nx-plan__imgs");
          (sec.imageIds || []).forEach(function (short) {
            var id = st.imageMap[short];
            if (!id || !p.assets[id]) return;
            imgs.appendChild(h("button.nx-plan__img", { type: "button", title: "Fjern " + short, on: { click: function () {
              sec.imageIds = sec.imageIds.filter(function (x) { return x !== short; });
              drawList();
            } } }, h("img", { src: ui.thumb(p.assets[id], id, 160), alt: short })));
          });
          var addImg = h("select.nx-input.nx-select.nx-select--sm", { title: "Legg til bilde" });
          addImg.appendChild(h("option", { value: "" }, "+ bilde"));
          Object.keys(st.imageMap).forEach(function (short) {
            if ((sec.imageIds || []).indexOf(short) === -1) addImg.appendChild(h("option", { value: short }, short));
          });
          addImg.addEventListener("change", function () {
            if (!addImg.value) return;
            sec.imageIds = (sec.imageIds || []).concat([addImg.value]);
            drawList();
          });
          list.appendChild(
            h(
              "li.nx-plan__item",
              null,
              h("div.nx-plan__head", null,
                h("span.nx-plan__n", null, String(i + 1)),
                type,
                h("span.nx-plan__acts", null,
                  ui.button("", { icon: "arrow-up", small: true, kind: "ghost", disabled: i === 0, title: "Flytt opp", onClick: function () { o.sections.splice(i - 1, 0, o.sections.splice(i, 1)[0]); drawList(); } }),
                  ui.button("", { icon: "arrow-down", small: true, kind: "ghost", disabled: i === o.sections.length - 1, title: "Flytt ned", onClick: function () { o.sections.splice(i + 1, 0, o.sections.splice(i, 1)[0]); drawList(); } }),
                  ui.button("", { icon: "trash", small: true, kind: "ghost", title: "Fjern", disabled: o.sections.length <= 1, onClick: function () { o.sections.splice(i, 1); drawList(); } })
                )
              ),
              purpose,
              Object.keys(st.imageMap).length ? h("div.nx-row", null, imgs, addImg) : null
            )
          );
        });
        list.appendChild(h("li", null, ui.button("Legg til seksjon i planen", { small: true, kind: "ghost", icon: "plus", onClick: function () {
          o.sections.splice(o.sections.length - 1, 0, { type: "richText", purpose: "", imageIds: [] });
          drawList();
        } })));
      }
      drawList();

      body.appendChild(
        h(
          "div.nx-wiz__cols",
          null,
          h("div.nx-stack", null,
            h("h3", null, "Tittel"),
            titles,
            custom,
            h("label.nx-field", null, h("span.nx-field__label", null, "Ingress"), ingress),
            h("p.nx-muted", null, "Vinkel: " + (o.angle || "–"))
          ),
          h("div.nx-stack", null, h("h3", null, "Seksjoner"), h("p.nx-muted", null, "Endre rekkefølge, type eller beskrivelse. Beskrivelsen er instruksen til skribenten (med fakta-ID-er)."), list)
        )
      );
      foot.appendChild(ui.button("Tilbake", { kind: "ghost", onClick: function () { persist(); go(2); } }));
      foot.appendChild(ui.button("Lag ny plan", { kind: "ghost", icon: "refresh-cw", onClick: makeOutline }));
      foot.appendChild(ui.button("Skriv siden", { kind: "primary", icon: "sparkles", onClick: function () {
        if (!st.title.trim()) return ui.toast("Velg eller skriv en tittel", "err");
        persist();
        go(4);
      } }));
    }

    // ---- step 4: write -------------------------------------------------------------------
    function stepWrite() {
      var o = st.outline;
      var results = new Array(o.sections.length);
      var rows = o.sections.map(function (sec, i) {
        var status = h("span.nx-wiz__state", null, ui.spinner());
        var row = h("li.nx-wiz__row", null, h("span.nx-plan__n", null, String(i + 1)), h("span", null, S.BLOCKS[sec.type].label), h("span.nx-muted.nx-wiz__purpose", null, sec.purpose), status);
        row.status = status;
        return row;
      });
      var listBox = h("ol.nx-wiz__rows", null, rows);
      var mode = "replace";
      var modeSel = ui.segmented([["replace", "Erstatt siden"], ["append", "Legg til under"], ["variant", "Ny variant"]], mode, function (v) { mode = v; }, { small: true });
      var asComments = h("input", { type: "checkbox", checked: true });
      var apply = ui.button("Sett inn på siden", { kind: "primary", icon: "check", disabled: true, onClick: function () { place(); } });
      body.appendChild(h("div.nx-stack", null,
        h("h3", null, "Skriver «" + st.title + "»"),
        h("p.nx-muted", null, "Seksjonene skrives samtidig og kontrolleres mot tegngrensene. Over grensen → én runde med retting."),
        listBox,
        h("div.nx-field", null, h("span.nx-field__label", null, "Hvor skal teksten?"), modeSel),
        h("label.nx-check", null, asComments, " Lagre AI-ens advarsler som kommentarer på seksjonene")
      ));
      busy(true, "Skriver …");
      var next = 0;
      var failed = 0;
      function worker() {
        if (next >= o.sections.length) return Promise.resolve();
        var i = next++;
        return writeOne(i).then(worker);
      }
      function writeOne(i) {
        var row = rows[i];
        ui.clear(row.status);
        row.status.appendChild(ui.spinner());
        return NP.api.ai("write", {
          projectId: project().id,
          outline: o,
          index: i,
          title: st.title,
          analysis: st.analysis,
          answers: st.answers,
          imageMap: st.imageMap,
          sourceText: st.sources.map(function (s) { return (s.title || s.url || "") + ":\n" + String(s.text || "").slice(0, 6000); }).join("\n\n").slice(0, 24000),
        }).then(function (r) {
          results[i] = r;
          st.cost += r.cost || 0;
          ui.clear(row.status);
          var note = r.problems.length ? r.problems.length + " over grensen" : r.warnings.length ? r.warnings.length + " advarsler" : "ok";
          row.status.appendChild(h("span.nx-tag" + (r.problems.length || r.warnings.length ? ".nx-tag--warn" : ".nx-tag--ok"), null, note));
          drawSteps();
        }, function (err) {
          failed++;
          ui.clear(row.status);
          row.status.appendChild(h("span.nx-tag.nx-tag--req", { title: err.message }, "feilet"));
          row.status.appendChild(ui.button("Prøv igjen", { small: true, kind: "ghost", onClick: function () {
            failed--;
            writeOne(i).then(check);
          } }));
        });
      }
      function check() {
        var done = results.filter(Boolean).length;
        apply.disabled = done === 0;
        apply.querySelector("span").textContent = done === o.sections.length ? "Sett inn på siden" : "Sett inn " + done + " av " + o.sections.length;
      }
      var workers = [];
      for (var k = 0; k < CONCURRENCY; k++) workers.push(worker());
      Promise.all(workers).then(function () {
        busy(false);
        foot.appendChild(ui.button("Tilbake til planen", { kind: "ghost", onClick: function () { go(3); } }));
        foot.appendChild(apply);
        check();
        if (failed) ui.toast(failed + " seksjoner feilet – prøv dem igjen eller sett inn resten", "err");
      });

      function place() {
        var sections = [];
        var warnings = [];
        results.forEach(function (r, i) {
          if (!r) return;
          var sec = r.section;
          if (sec.type === "hero" && i === 0) {
            sec = Object.assign({}, sec, { props: Object.assign({}, sec.props, { title: st.title.trim() || sec.props.title, ingress: st.ingress.trim() || sec.props.ingress }) });
          }
          sections.push(sec);
          r.warnings.concat(r.problems).forEach(function (w) { warnings.push({ section: sec.id, text: w }); });
        });
        if (!sections.length) return;
        var pageId = NP.store.get().pageId;
        if (mode === "variant") {
          var probe = D.normalizeProject(Object.assign({}, project(), { pages: project().pages.concat([{ label: "AI-versjon", sections: sections }]) }));
          var fresh = probe.pages[probe.pages.length - 1];
          NP.store.update(function (p) { return Object.assign({}, p, { pages: p.pages.concat([fresh]) }); });
          pageId = fresh.id;
          NP.store.setPage(pageId);
        } else {
          NP.store.updatePage(function (pg) {
            return Object.assign({}, pg, { sections: mode === "append" ? pg.sections.concat(sections) : sections });
          });
        }
        // The plan's title also names an empty project.
        if (/^(Ny Native Premium|Uten navn)$/.test(project().name)) {
          NP.store.update(function (p) { return Object.assign({}, p, { name: st.title.slice(0, 120) }); });
        }
        persist();
        NP.store.save().then(function () {
          if (!asComments.checked || !warnings.length) return;
          var round = project().review ? project().review.round : 0;
          return Promise.all(warnings.slice(0, 40).map(function (w) {
            return NP.api.addComment(project().id, { text: "AI: " + w.text, round: round, anchor: { section: w.section, page: pageId } });
          }));
        }).then(function () {
          ui.toast("Siden er skrevet (" + ui.money(st.cost) + "). Les gjennom – AI-en kan ta feil.", "ok");
          if (warnings.length) NP.editor.openPanel("review");
          m.close();
        });
      }
    }

    draw();
  }

  // =====================================================================
  // The ✨ menu on text fields
  // =====================================================================
  var REWRITES = [
    ["shorter", "Kortere"],
    ["longer", "Litt lengre"],
    ["simpler", "Enklere språk"],
    ["personal", "Varmere / mer personlig"],
    ["formal", "Mer saklig"],
    ["angle", "Ny vinkel"],
    ["headline", "Tre titler"],
    ["fix", "Rett språkfeil"],
  ];

  function pageContext(skipSectionId) {
    var page = NP.store.page();
    return page.sections
      .filter(function (s) { return s.id !== skipSectionId; })
      .map(function (s) { return S.BLOCKS[s.type].label + ": " + NP.sections.summary(s); })
      .join("\n")
      .slice(0, 6000);
  }

  function rewriteMenu(anchor, opts) {
    if (!NP.aiConfigured) return notConfigured();
    var custom = h("input.nx-input.nx-input--sm", { type: "text", placeholder: "Egen instruks, f.eks. «nevn prisen tidligere»" });
    var out = h("div.nx-rw__out");
    var menu = h("div.nx-rw");
    REWRITES.forEach(function (r) {
      menu.appendChild(h("button.nx-rw__opt", { type: "button", on: { click: function () { run(r[0]); } } }, r[1]));
    });
    custom.addEventListener("keydown", function (e) { if (e.key === "Enter" && custom.value.trim()) run("custom"); });
    var facts = project().ai && project().ai.analysis ? (project().ai.analysis.facts || []).map(function (f) { return f.id + ": " + f.text; }).join("\n") : "";
    function run(kind) {
      ui.clear(out);
      out.appendChild(h("div.nx-row", null, ui.spinner(), h("span.nx-muted", null, "Skriver tre forslag …")));
      NP.api.ai("rewrite", {
        projectId: project().id,
        type: opts.type,
        field: opts.field,
        text: opts.value,
        instruction: kind === "custom" ? "" : kind,
        custom: custom.value.trim(),
        context: pageContext(NP.store.get().selected),
        facts: facts,
      }).then(function (r) {
        ui.clear(out);
        r.variants.forEach(function (v) {
          var preview = opts.rich ? h("div.nx-rw__rich") : h("span", null, v.value);
          if (opts.rich) preview.innerHTML = v.value;
          out.appendChild(h("button.nx-rw__var" + (v.over ? ".is-over" : ""), { type: "button", on: { click: function () {
            opts.apply(v.value);
            ui.closePopover();
            ui.toast("Teksten er byttet – Ctrl+Z angrer", "ok");
          } } }, preview, h("span.nx-muted", null, v.length + (r.max ? " / " + r.max : "") + " tegn")));
        });
      }, function (err) {
        ui.clear(out);
        out.appendChild(h("p.nx-err", null, err.message));
      });
    }
    ui.popover(anchor, h("div.nx-rw__wrap", null, h("strong", null, "Skriv om: " + opts.label), menu, custom, out), { className: "nx-rw-pop", align: "right" });
  }

  NP.ai = { open: open, rewriteMenu: rewriteMenu, notConfigured: notConfigured };
})();
