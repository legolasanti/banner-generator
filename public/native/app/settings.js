/* =========================================================================
   app/settings.js — Innstillinger: what every Native Premium page shares.

     Merking     the disclosure label, publisher and studio logos, footer
                 text — the legally important parts, set once for all
     Publisering the public address of ABC design (for /n/ pages)
     Måling      Kilkaya / Mixpanel / GTM snippets for every page, UTM defaults
     AI          which OpenRouter models do what, zero data retention
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;

  function field(label, input, help) {
    return h("label.nx-field", null, h("span.nx-field__label", null, label), input, help ? h("p.nx-help", null, help) : null);
  }

  /** One settings group: title and what it is for on the left, fields on the right. */
  function group(id, title, desc) {
    var fields = Array.prototype.slice.call(arguments, 3);
    return h("section.nx-setsec", { "aria-labelledby": id },
      h("div.nx-setsec__intro", null, h("h2.nx-setsec__title", { id: id }, title), desc ? h("p.nx-setsec__desc", null, desc) : null),
      h("div.nx-setsec__fields", null, fields));
  }

  function view(host) {
    var root = h("div.page.nx-page");
    var body = h("div");
    root.appendChild(ui.pageHead("Innstillinger", "Det alle Native Premium-sider deler: merking, publisering, måling og AI-modeller.", null));
    root.appendChild(body);
    host.appendChild(root);
    body.appendChild(h("div.nx-loading", null, ui.spinner(), " Henter innstillingene …"));

    Promise.all([NP.api.settings(), NP.api.aiStatus()]).then(function (res) {
      var s = JSON.parse(JSON.stringify(res[0].settings));
      var status = res[1];
      ui.clear(body);

      function input(key, opts) {
        var o = opts || {};
        var el = o.multiline
          ? h("textarea.nx-input.nx-textarea" + (o.code ? ".nx-code" : ""), { rows: o.rows || 4, spellcheck: o.code ? "false" : "true" })
          : h("input.nx-input", { type: o.type || "text", placeholder: o.placeholder || "", list: o.list || null });
        el.value = o.get ? o.get() : s[key] || "";
        el.addEventListener("input", function () {
          if (o.set) o.set(el.value);
          else s[key] = el.value;
        });
        return el;
      }

      function logo(key, label) {
        var box = h("div.nx-logo-pick");
        function draw() {
          ui.clear(box);
          var id = s[key];
          box.appendChild(id && s.assets[id] ? h("img", { src: ui.thumb(s.assets[id], id, 320), alt: "" }) : h("span.nx-muted", null, "Ingen – navnet vises som tekst"));
          var file = h("input", { type: "file", accept: "image/png,image/webp,image/jpeg", hidden: true });
          file.addEventListener("change", function () {
            if (!file.files[0]) return;
            NP.api.upload("/api/native/assets/image", file.files[0], {}).then(function (r) {
              s.assets[r.asset.id] = r.asset;
              s[key] = r.asset.id;
              draw();
            }, function (err) { ui.toast(err.message, "err"); });
          });
          box.appendChild(h("div.nx-row", null, ui.button(id ? "Bytt" : "Last opp", { small: true, onClick: function () { file.click(); } }), id ? ui.button("Fjern", { small: true, kind: "ghost", onClick: function () { s[key] = ""; draw(); } }) : null, file));
        }
        draw();
        return h("div.nx-field", null, h("span.nx-field__label", null, label), box);
      }

      var models = h("datalist#nx-models");
      var ai = s.ai;
      function modelInput(key, label, help) {
        return field(label, input(null, { list: "nx-models", get: function () { return ai[key]; }, set: function (v) { ai[key] = v.trim(); } }), help);
      }

      var form = h(
        "div.nx-settings",
        null,
        group("nx-set-merking", "Merking", "Fast på alle sider og kan ikke endres i prosjektene. {annonsør} byttes ut med annonsørens navn.",
          field("Merketekst øverst", input("disclosureLabel"), "Må inneholde {annonsør}. Standard: «Annonsørinnhold fra {annonsør}»."),
          h("div.nx-grid2", null, field("Utgiver", input("publisherName")), field("Utgivers nettside", input("publisherUrl", { type: "url" }))),
          logo("publisherLogo", "Utgivers logo (øverst til venstre)"),
          field("Bunntekst", input("footerText", { multiline: true, rows: 6 }), "Avsnitt skilles med en tom linje."),
          h("div.nx-grid2", null, field("Studio", input("studioName")), field("Nettstedsnavn (og:site_name)", input("siteName"))),
          logo("studioLogo", "Studio-logo (nederst)")
        ),

        group("nx-set-pub", "Publisering", "Adressen sider som ABC design publiserer selv, får.",
          field("Offentlig adresse til ABC design", input("publicBaseUrl", { type: "url", placeholder: "https://design.abcnyheter.no" }), "Brukes for sider ABC design publiserer selv (/n/…/) og i delingsbilder. Tom = adressen du bruker nå.")
        ),

        group("nx-set-maling", "Måling", "Skript som legges inn på alle eksporterte og publiserte sider – aldri i editoren eller på gjennomgangslenker.",
          h("p.nx-help", null, "Sidene sender også egne hendelser til window.dataLayer: np_view, np_scroll, np_time, np_cta_click, np_video, np_factbox_open, np_share."),
          field("I <head> (f.eks. Kilkaya, Mixpanel, GTM)", input("headHtml", { multiline: true, code: true, rows: 6 })),
          field("Rett etter <body> (f.eks. GTM noscript)", input("bodyHtml", { multiline: true, code: true, rows: 3 })),
          h("div.nx-grid2", null, field("Standard utm_source", input("utmSource")), field("Standard utm_medium", input("utmMedium")))
        ),

        group("nx-set-ai", "AI (OpenRouter)", "Hvilke modeller AI-veiviseren og AI-assistenten bruker, og hva som skjer med dataene.",
          h("div.nx-note" + (status.configured ? ".nx-note--ok" : ".nx-note--warn"), null,
            ui.icon(status.configured ? "badge-check" : "circle-alert", 16),
            status.configured ? " API-nøkkelen er satt opp." : " OPENROUTER_API_KEY mangler i .env – AI-funksjonene er av."),
          h("div.nx-note", null, ui.icon("info", 15), " Google Drive leses " + (status.drive === "api" ? "via Drive API (GOOGLE_API_KEY)." : "via den offentlige mappevisningen. Med GOOGLE_API_KEY i .env får du sikrere lister med bildestørrelser.")),
          h("p.nx-muted", null, "Brukeren velger kvalitet for hver jobb (veiviseren og AI-assistenten). Hvert nivå bruker modellen under. Testet 15.10.2026 på en ekte brief: Økonomi ≈ 0,5 kr, Standard ≈ 3 kr, Premium ≈ 7 kr for en hel side."),
          h("div.nx-grid2", null,
            modelInput("economyModel", "Økonomi", "Billigst. Standard: deepseek/deepseek-v4.1-flash."),
            modelInput("defaultModel", "Standard", "Standard: anthropic/claude-sonnet-5.5.")),
          h("div.nx-grid2", null,
            modelInput("premiumModel", "Premium", "Standard: anthropic/claude-opus-5.5."),
            field("Forvalgt nivå", (function () {
              var sel = h("select.nx-input.nx-select");
              [["okonomi", "Økonomi"], ["standard", "Standard"], ["premium", "Premium"]].forEach(function (o) {
                sel.appendChild(h("option", { value: o[0], selected: ai.defaultTier === o[0] }, o[1]));
              });
              sel.addEventListener("change", function () { ai.defaultTier = sel.value; });
              return sel;
            })(), "Brukes når et prosjekt ikke har valgt nivå selv.")),
          field("Reservemodeller (kommaseparert)", input(null, {
            get: function () { return ai.fallbackModels.join(", "); },
            set: function (v) { ai.fallbackModels = v.split(",").map(function (x) { return x.trim(); }).filter(Boolean); },
            list: "nx-models",
          }), "Brukes automatisk hvis hovedmodellen er nede. Velg gjerne fra en annen leverandør."),
          modelInput("visionModel", "Bildeanalyse (reserve når nivåets modell ikke ser bilder)"),
          modelInput("fastModel", "Rask og billig modell (tekstgjenkjenning av skannede PDF-er)"),
          modelInput("imageModel", "Bildegenerering", "F.eks. google/gemini-3.1-flash-image."),
          (function () {
            var zdr = h("input", { type: "checkbox", checked: ai.zdr });
            zdr.addEventListener("change", function () { ai.zdr = zdr.checked; });
            return h("label.nx-switch", null, zdr, h("span.nx-switch__track"), h("span", null, "Bare leverandører som ikke lagrer data (zero data retention)"));
          })(),
          models,
          ui.button("Hent modelliste fra OpenRouter", { small: true, icon: "refresh-cw", cls: "nx-self-start", onClick: function () {
            NP.api.aiModels().then(function (r) {
              ui.clear(models);
              r.models.forEach(function (m) {
                var price = m.input !== null ? " – $" + m.input.toFixed(2) + "/$" + m.output.toFixed(2) + " per 1M" : "";
                models.appendChild(h("option", { value: m.id }, m.name + price + (m.vision ? " · bilder" : "") + (m.imageOut ? " · lager bilder" : "")));
              });
              ui.toast(r.models.length + " modeller hentet – begynn å skrive i et modellfelt for å velge", "ok");
            }, function (err) { ui.toast(err.message, "err"); });
          } })
        ),

        h("div.nx-settings__foot", null, h("p.nx-help", null, "Endringene brukes først når du har lagret."), ui.button("Lagre innstillingene", { kind: "primary", icon: "save", onClick: function () {
          NP.api.saveSettings(s).then(function (r) {
            NP.settings = r.settings;
            ui.toast("Innstillingene er lagret", "ok");
          }, function (err) { ui.toast(err.message, "err"); });
        } }))
      );
      body.appendChild(form);
    }, function (err) {
      ui.clear(body);
      body.appendChild(ui.empty("circle-alert", "Kunne ikke hente innstillingene", err.message));
    });
  }

  NP.settingsView = { view: view };
})();
