/* =========================================================================
   app/preflight.js — "Kontroll": what to fix before the advertiser sees it.

   Runs on the project in the browser, instantly, every time the panel opens
   or the export / review dialog starts. Three levels:
     error  will look broken or is not allowed (no advertiser name in the
            label, a button without a link, template text left in)
     warn   will work but should be fixed (missing alt text, text over the
            limit, a low-resolution hero, heavy videos, poor contrast)
     info   good to know (no final address yet)
   Each item links to its section.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var S = window.NativeSchema;
  var D = window.NativeDoc;

  // Text from the built-in templates that must not survive into a real page.
  var PLACEHOLDERS = [
    "Tittel på saken", "Skriv teksten her", "En tittel som vekker nysgjerrighet", "Ingressen forteller", "Navn Navnesen",
    "Første poeng", "Andre poeng", "Tredje poeng", "nøkkeltall fra kildene", "Kort beskrivelse", "Et ordrett sitat",
    "Mellomtittel som deler opp", "Åpningsavsnittet setter scenen", "Første faktapunkt", "Andre faktapunkt", "Spørsmål leseren lurer på",
    "Utdyp med konkrete detaljer", "Tekst ved siden av bildet", "Forklar én egenskap", "En kort setning om hva som skjer",
  ];

  function sectionText(s) {
    var parts = [];
    S.fieldsOf(s.type).forEach(function (f) {
      var v = s.props[f.key];
      if (f.type === "rich") parts.push(D.plainText(v));
      else if (f.type === "text" || f.type === "textarea") parts.push(v);
      else if (f.type === "list") (v || []).forEach(function (item) {
        f.item.forEach(function (sub) { if (sub.type === "text" || sub.type === "textarea") parts.push(item[sub.key]); });
      });
    });
    return parts.join("\n");
  }

  function run(project, settings) {
    var out = [];
    var add = function (level, text, page, section) {
      out.push({ level: level, text: text, page: page ? page.id : null, section: section ? section.id : null, pageLabel: page ? page.label : "" });
    };
    var assets = project.assets;

    if (!project.advertiser.name) add("error", "Annonsørens navn mangler – merkingen øverst blir «" + (settings.disclosureLabel || "").replace("{annonsør}", "annonsør") + "». (Prosjekt → Annonsør)");
    if (!project.advertiser.logo) add("info", "Ingen annonsørlogo – navnet vises i stedet. (Tema → Annonsørens logo)");

    project.pages.forEach(function (page) {
      if (!page.sections.length) add("error", "Siden «" + page.label + "» er tom.", page);
      var first = page.sections[0];
      if (first && first.type !== "hero") add("warn", "Siden begynner ikke med en hero – det er der H1-tittelen står.", page, first);
      var h1 = page.sections.filter(function (s) { return s.type === "hero"; }).length;
      if (h1 > 1) add("warn", "Siden har " + h1 + " hero-seksjoner, altså flere H1-titler.", page);

      var multi = project.pages.length > 1;
      page.sections.forEach(function (s, i) {
        var name = (multi ? page.label + " › " : "") + (i + 1) + ". " + S.BLOCKS[s.type].label;
        var p = s.props;
        var txt = sectionText(s);
        PLACEHOLDERS.forEach(function (ph) {
          if (txt.indexOf(ph) !== -1) add("error", name + ": malteksten «" + ph + "» er ikke byttet ut.", page, s);
        });
        // Required fields and limits.
        S.fieldsOf(s.type).forEach(function (f) {
          var v = p[f.key];
          if (f.required && (v === "" || v === null || (Array.isArray(v) && !v.length))) {
            add(f.type === "url" ? "error" : "warn", name + ": «" + f.label + "» mangler.", page, s);
          }
          if (f.max && (f.type === "text" || f.type === "textarea" || f.type === "rich")) {
            var n = f.type === "rich" ? D.plainText(v).length : String(v || "").length;
            if (n > f.max) add("warn", name + ": «" + f.label + "» er " + n + " tegn (anbefalt maks " + f.max + ").", page, s);
          }
          if (f.type === "image" && v && assets[v]) {
            var a = assets[v];
            if (!a.alt && !(s.type === "image" && (f.key === "image" ? p.alt : p.alt2))) add("warn", name + ": bildet «" + (a.name || "uten navn") + "» mangler alt-tekst.", page, s);
            if (s.type === "hero" && a.w && a.w < 1600) add("warn", name + ": hero-bildet er bare " + a.w + " px bredt og kan se uskarpt ut på store skjermer (minst 1920 px anbefales).", page, s);
            if (a.source === "ai") add("info", name + ": bruker et AI-laget bilde – det skal være en illustrasjon, ikke dokumentasjon.", page, s);
          }
          if (f.type === "video" && v && assets[v]) {
            var vm = assets[v];
            if (vm.bytes > 40 * 1048576) add("warn", name + ": videoen er " + Math.round(vm.bytes / 1048576) + " MB. Over 40 MB lastes tregt på mobil.", page, s);
          }
        });
        if (s.type === "cta" && p.label2 && !p.url2) add("error", name + ": knapp 2 mangler lenke.", page, s);
        if (s.type === "imageText" && p.ctaLabel && !p.ctaUrl) add("error", name + ": lenken «" + p.ctaLabel + "» mangler adresse.", page, s);
        if (s.type === "productCards") {
          var noUrl = p.items.filter(function (it) { return !it.url; }).length;
          if (noUrl) add("warn", name + ": " + noUrl + " produkt(er) mangler lenke.", page, s);
        }
        if (s.type === "quote" && !p.name) add("warn", name + ": sitatet mangler navn på den som sier det.", page, s);
        if (s.type === "stats") {
          p.items.forEach(function (it) {
            if (!/^-?[\d\s.,]+$/.test(String(it.value).trim())) add("warn", name + ": «" + it.value + "» er ikke et tall og kan ikke telles opp.", page, s);
          });
        }
        if (s.hide.desktop && s.hide.tablet && s.hide.mobile) add("warn", name + ": er skjult på alle skjermer.", page, s);
        if (s.style.bg === "image" && !s.style.bgImage) add("warn", name + ": bakgrunn er satt til bilde, men ingen er valgt.", page, s);
        if (s.type === "embed" && p.url && !window.NativeRender.embedUrl(p.url)) add("error", name + ": lenken kan ikke bygges inn.", page, s);
      });
    });

    NP.theme.contrastNotes(project.theme).forEach(function (n) { add("warn", "Tema: " + n); });

    var videoBytes = 0;
    var seen = {};
    D.usedAssets(project).forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      if (assets[id] && assets[id].kind === "video") videoBytes += assets[id].bytes || 0;
    });
    if (videoBytes > 80 * 1048576) add("warn", "Videoene er til sammen " + Math.round(videoBytes / 1048576) + " MB. Vurder å komprimere dem (f.eks. HandBrake, 1080p, 5–8 Mbit/s).");
    if (!project.meta.publicUrl) add("info", "Endelig adresse er ikke satt (Prosjekt → Deling). Eksporten får da ikke canonical og delingsbilde.");
    var order = { error: 0, warn: 1, info: 2 };
    return out.sort(function (a, b) { return order[a.level] - order[b.level]; });
  }

  function list(items, onGo) {
    if (!items.length) return h("div.nx-note.nx-note--ok", null, ui.icon("badge-check", 16), " Alt ser bra ut.");
    var box = h("ul.nx-checks");
    items.forEach(function (it) {
      box.appendChild(
        h(
          "li.nx-check-item.is-" + it.level,
          null,
          ui.icon(it.level === "error" ? "circle-alert" : it.level === "warn" ? "triangle-alert" : "info", 15),
          h("span", null, it.text),
          it.section ? ui.button("Vis", { small: true, kind: "ghost", onClick: function () { onGo(it); } }) : null
        )
      );
    });
    return box;
  }

  function go(it) {
    if (it.page) NP.store.setPage(it.page);
    if (it.section) NP.store.select(it.section);
  }

  function panel() {
    var root = h("div.nx-stack");
    function draw() {
      ui.clear(root);
      var items = run(NP.store.get().project, NP.settings || {});
      var errors = items.filter(function (x) { return x.level === "error"; }).length;
      var warns = items.filter(function (x) { return x.level === "warn"; }).length;
      root.appendChild(h("p.nx-muted", null, errors + " feil, " + warns + " advarsler."));
      root.appendChild(list(items, go));
      root.appendChild(ui.button("Kjør på nytt", { icon: "refresh-cw", small: true, kind: "ghost", onClick: draw }));
    }
    draw();
    return root;
  }

  NP.preflight = { run: run, list: list, panel: panel, go: go };
})();
