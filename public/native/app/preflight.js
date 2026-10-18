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

   Besides the fields themselves it reads the page as it renders (headings
   in order, link texts, #links and the ids they point at), the share card
   (title, description, picture) and an estimate of what a reader downloads.
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
    // the sample copy of the premium templates and the ready-made designs
    "Eksempeltall i malen", "eksempelpris i malen", "eksempeltekst", "Kort forklaring.", "Hvorfor den er med.", "Ordrett sitat.",
    "Nordvei", "Fjellro", "Fjordbank", "Kino Nord", "Kari Nordmann", "Line Berg", "Ida Haugen", "Navn på kilden",
    "Én setning som oppsummerer hele saken", "Tittel på kapitlet", "Første punkt", "Første kapittel",
  ];

  var DEMO_NAME = /^Demo – /;

  // Share cards: Facebook and LinkedIn cut the title at about 70 characters
  // and the description at about 160 (fewer on mobile).
  var SHARE_TITLE_MAX = 70;
  var SHARE_DESC_MIN = 50;
  var SHARE_DESC_MAX = 160;
  // Link texts that say nothing when a screen reader lists the page's links.
  var VAGUE_LINKS = ["les mer", "les mer her", "mer", "se mer", "klikk her", "trykk her", "her", "lenke", "link", "mer info", "mer informasjon", "gå videre"];
  // What a reader downloads, roughly: a WebP variant at ~1440 px holds about
  // 0.12 bytes per pixel. Thresholds for the whole page and the first screen.
  var WEBP_BYTES_PER_PX = 0.12;
  var DESKTOP_IMAGE_PX = 1440;
  var MB = 1048576;
  var PAGE_IMAGES_WARN = 8 * MB;
  var FIRST_SCREEN_WARN = 3 * MB;

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

  // ---- the share card ----------------------------------------------------------
  function firstHero(project) {
    var s = project.pages[0] && project.pages[0].sections[0];
    return s && s.type === "hero" ? s : null;
  }

  /** What Facebook / LinkedIn show when the page is shared (as render.js builds the tags). */
  function shareInfo(project, settings) {
    var st = settings || {};
    var hero = firstHero(project);
    var label = (st.disclosureLabel || "Annonsørinnhold fra {annonsør}").replace("{annonsør}", project.advertiser.name || "annonsør");
    var title = project.meta.title || (hero && hero.props.title) || project.name;
    var image = project.meta.ogImage || (hero && !hero.props.video && hero.props.image) || "";
    return {
      title: title,
      ownTitle: !!project.meta.title,
      description: project.meta.description,
      fallbackDescription: label,
      image: image && project.assets[image] ? image : "",
      host: hostOf(project.meta.publicUrl) || st.siteName || "",
    };
  }

  function hostOf(url) {
    var m = /^https?:\/\/([^/]+)/.exec(url || "");
    return m ? m[1].replace(/^www\./, "") : "";
  }

  function checkShare(project, settings, add) {
    var info = shareInfo(project, settings);
    var where = " (Prosjekt → Deling og søk)";
    if (!info.ownTitle) add("info", "Ingen egen delingstittel – sidens H1 brukes." + where);
    if (info.title.length > SHARE_TITLE_MAX) add("warn", "Delingstittelen er " + info.title.length + " tegn. Facebook og LinkedIn kutter etter omtrent " + SHARE_TITLE_MAX + "." + where);
    if (!info.description) add("warn", "Beskrivelsen for deling mangler – da står det bare «" + info.fallbackDescription + "» under tittelen." + where);
    else if (info.description.length > SHARE_DESC_MAX) add("warn", "Delingsbeskrivelsen er " + info.description.length + " tegn og blir kuttet etter omtrent " + SHARE_DESC_MAX + "." + where);
    else if (info.description.length < SHARE_DESC_MIN) add("info", "Delingsbeskrivelsen er kort (" + info.description.length + " tegn). Én til to setninger om hva leseren får, fungerer best." + where);
    if (!info.image) add("warn", "Ingen delingsbilde: velg et bilde, eller gi heroen et bilde." + where);
  }

  // ---- the page as it renders ---------------------------------------------------------
  function renderedSections(project, settings, page) {
    var st = settings || {};
    var ctx = {
      mode: "preview",
      project: project,
      page: page,
      settings: st,
      assets: Object.assign({}, st.assets || {}, project.assets),
      url: function () { return ""; },
      pageHref: function () { return "#"; },
    };
    return page.sections.map(function (s, i) {
      try {
        return window.NativeRender.renderSection(ctx, s, i);
      } catch (_) {
        return "";
      }
    });
  }

  function plainHtml(html) {
    return D.plainText(html).replace(/\s+/g, " ").trim();
  }

  /** Two sections with the same anchor, and #links that lead nowhere on their page. */
  function checkAnchors(page, html, name, add) {
    var seen = {};
    page.sections.forEach(function (s, i) {
      var a = s.style.anchor ? D.slugify(s.style.anchor, "") : "";
      if (!a) return;
      if (seen[a]) add("error", name(i) + ": ankeret «#" + a + "» brukes også av " + name(seen[a] - 1) + ". Lenker dit havner bare på den første. (Stil → Navigasjon)", page, s);
      else seen[a] = i + 1;
    });
    var ids = { "np-top": true, "np-main": true };
    html.forEach(function (part) {
      part.replace(/\sid="([^"]+)"/g, function (_, id) { ids[id] = true; return ""; });
    });
    html.forEach(function (part, i) {
      var dead = {};
      part.replace(/href="#([^"]+)"/g, function (_, id) {
        if (!ids[D.decodeEntities(id)]) dead[id] = true;
        return "";
      });
      Object.keys(dead).forEach(function (id) {
        add("error", name(i) + ": lenken «#" + id + "» peker ikke til noe på siden. Gi målseksjonen dette ankeret, eller rett lenken.", page, page.sections[i]);
      });
    });
  }

  /** Headings should step down one level at a time: H1 → H2 → H3. */
  function checkHeadings(page, html, name, add) {
    var last = 1;
    html.forEach(function (part, i) {
      var jumped = null;
      part.replace(/<h([1-6])\b/g, function (_, n) {
        var level = Number(n);
        if (!jumped && level > last + 1) jumped = [last, level];
        last = level;
        return "";
      });
      if (jumped) add("warn", name(i) + ": overskriftene hopper fra H" + jumped[0] + " til H" + jumped[1] + ". Skjermlesere og søkemotorer leser nivåene som en innholdsfortegnelse – gi seksjonen en tittel, eller bruk et mellomnivå.", page, page.sections[i]);
    });
  }

  /** The same vague text ("Les mer") on several links. */
  function checkLinkText(page, html, add) {
    var counts = {};
    var first = {};
    html.forEach(function (part, i) {
      part.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/g, function (_, inner) {
        var text = plainHtml(inner).toLowerCase().replace(/[.!:→›»]+$/, "").trim();
        if (VAGUE_LINKS.indexOf(text) === -1) return "";
        counts[text] = (counts[text] || 0) + 1;
        if (first[text] === undefined) first[text] = i;
        return "";
      });
    });
    Object.keys(counts).forEach(function (text) {
      if (counts[text] < 2) return;
      add("warn", "«" + text.charAt(0).toUpperCase() + text.slice(1) + "» står på " + counts[text] + " lenker. Lest opp uten sammenheng sier de ingenting – skriv hvor lenken fører, f.eks. «Se ladekartet».", page, page.sections[first[text]]);
    });
  }

  // ---- page weight ---------------------------------------------------------------------
  function imageBytes(a) {
    if (!a) return 0;
    if (!a.widths || !a.widths.length || !a.w) return a.bytes || 0; // served as it is
    var w = Math.min(DESKTOP_IMAGE_PX, a.widths[a.widths.length - 1]);
    var h = a.h ? (w * a.h) / a.w : w * 0.66;
    return Math.min(a.bytes || Infinity, w * h * WEBP_BYTES_PER_PX);
  }

  function sectionBytes(project, s) {
    var images = 0;
    var video = 0;
    D.usedAssets({ pages: [{ sections: [s] }], assets: project.assets, theme: {}, advertiser: {}, meta: {} }).forEach(function (id) {
      var a = project.assets[id];
      if (!a) return;
      if (a.kind === "video") video += a.bytes || 0;
      else if (a.kind !== "font") images += imageBytes(a);
    });
    return { images: images, video: video };
  }

  function mb(bytes) {
    return (bytes / MB).toFixed(1).replace(".", ",") + " MB";
  }

  function checkWeight(project, add) {
    project.pages.forEach(function (page) {
      var images = 0;
      var video = 0;
      var seen = {};
      page.sections.forEach(function (s) {
        var b = sectionBytes(project, s);
        images += b.images;
        video += b.video;
        seen[s.id] = b;
      });
      var multi = project.pages.length > 1 ? "«" + page.label + "»: " : "";
      var say = function (text) { return multi ? multi + text : text.charAt(0).toUpperCase() + text.slice(1); };
      var first = page.sections[0];
      if (first && first.type === "hero") {
        var hb = seen[first.id];
        var top = hb.images + hb.video;
        if (top > FIRST_SCREEN_WARN) add("warn", say("første skjerm (heroen) veier ca. " + mb(top) + ". Over " + mb(FIRST_SCREEN_WARN) + " åpner siden tregt på mobil – bruk et lettere bilde eller en kortere video."), page, first);
      }
      if (images > PAGE_IMAGES_WARN) add("warn", say("bildene veier til sammen ca. " + mb(images) + " på desktop. Vurder færre eller mindre bilder."), page);
      add("info", say("sidevekt (anslag, desktop): ca. " + mb(images) + " bilder" + (video ? " og " + mb(video) + " video" : "") + ". Mobil laster mindre bildeversjoner."), page);
    });
  }

  function run(project, settings) {
    var out = [];
    var add = function (level, text, page, section) {
      out.push({ level: level, text: text, page: page ? page.id : null, section: section ? section.id : null, pageLabel: page ? page.label : "" });
    };
    var assets = project.assets;

    // Photos inside lists (cards, galleries, products …) need alt text too,
    // unless the block shows a text that describes them anyway.
    function checkListImages(s, name, page) {
      S.fieldsOf(s.type).forEach(function (f) {
        if (f.type !== "list") return;
        var missing = 0;
        (s.props[f.key] || []).forEach(function (item) {
          f.item.forEach(function (sub) {
            var v = item[sub.key];
            if (sub.type !== "image" || !v || !assets[v]) return;
            var described = item.alt || item.title || item.name || item.front;
            if (!assets[v].alt && !described) missing++;
          });
        });
        if (missing) add("warn", name + ": " + missing + " bilde(r) i «" + f.label + "» mangler alt-tekst.", page, s);
      });
    }

    function checkBlock(s, name, page) {
      var p = s.props;
      if (s.type === "poll" && p.options.filter(function (o) { return o.label; }).length < 2) add("error", name + ": avstemningen trenger minst to svaralternativer.", page, s);
      if (s.type === "poll") add("info", name + ": resultatet telles bare når siden publiseres på /n/. I ZIP-eksport går svaret bare til målingen.", page, s);
      if (s.type === "countdown") {
        var at = window.NativeRender.osloTime(p.date);
        if (!at) add("error", name + ": datoen «" + p.date + "» er ugyldig (bruk ÅÅÅÅ-MM-DD TT:MM).", page, s);
        else if (at < Date.now()) add("warn", name + ": datoen er passert – siden viser «" + p.done + "».", page, s);
        if (p.ctaLabel && !p.ctaUrl) add("error", name + ": knappen mangler lenke.", page, s);
      }
      if (s.type === "hotspots") {
        var untitled = p.items.filter(function (it) { return !it.title; }).length;
        if (untitled) add("warn", name + ": " + untitled + " punkt(er) mangler tittel.", page, s);
      }
      if (s.type === "tabs" && p.items.some(function (it) { return !it.label; })) add("warn", name + ": en fane mangler navn.", page, s);
      if (s.type === "tabs" && p.items.some(function (it) { return it.ctaLabel && !it.ctaUrl; })) add("error", name + ": en lenke i fanene mangler adresse.", page, s);
      if (s.type === "cards") {
        if ((p.look === "overlay" || p.look === "tile") && p.items.some(function (it) { return !it.image; })) add("warn", name + ": «" + (p.look === "tile" ? "Bildefliser" : "Tekst over bildet") + "» trenger bilde på alle kort.", page, s);
        if (p.items.some(function (it) { return it.linkLabel && !it.url; })) add("error", name + ": en lenke i kortene mangler adresse.", page, s);
        if (p.look === "tile" && p.items.some(function (it) { return !it.url; })) add("warn", name + ": lenkefliser uten lenke kan ikke klikkes.", page, s);
      }
      if (s.type === "quiz" && p.ctaLabel && !p.ctaUrl) add("error", name + ": knappen etter quizen mangler lenke.", page, s);
      if (s.type === "specTable" && p.rows.some(function (r) { return !r.label; })) add("warn", name + ": en rad mangler navn.", page, s);
      if (s.type === "flipCards" && p.items.some(function (it) { return !it.back; })) add("warn", name + ": et kort har tom bakside.", page, s);
      if (s.type === "rankList" && p.layout === "scenes" && p.items.some(function (it) { return !it.image; })) add("warn", name + ": «Scener i hel skjerm» ser best ut med bilde på hver plass.", page, s);
      if (s.type === "stickyStory" && p.layout !== "overlay" && !p.image && !p.video) add("warn", name + ": delt skjerm trenger et bilde eller en video.", page, s);
      if (s.type === "statement" && p.accent && String(p.text).toLowerCase().indexOf(String(p.accent).toLowerCase().split(/\s+/)[0]) === -1) add("warn", name + ": ordet «" + p.accent + "» som skal utheves, står ikke i teksten.", page, s);
    }

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
        if (s.style.bg === "video" && !s.style.bgVideo) add("warn", name + ": bakgrunn er satt til video, men ingen er valgt.", page, s);
        checkListImages(s, name, page);
        checkBlock(s, name, page);
      });
    });

    // Page-level options (Side).
    var x = project.extras || {};
    if (x.stickyCta && !x.stickyUrl && !project.advertiser.url) add("error", "Den flytende knappen har ingen lenke, og annonsørens nettside er ikke fylt ut. (Side → Flytende knapp)");
    if (x.chapterNav && x.chapterNav !== "none") {
      var chapters = 0;
      project.pages.forEach(function (pg) { pg.sections.forEach(function (sec) { if (sec.style.chapter) chapters++; }); });
      if (chapters < 2) add("warn", "Kapittelmenyen er slått på, men bare " + chapters + " seksjon(er) har kapittelnavn. (Seksjon → Stil → Navigasjon)");
    }
    if (x.customCss) add("info", "Siden bruker egen CSS. Sjekk den på mobil før eksport.");
    if (project.tracking.clickPrefix) add("info", "Alle annonsørlenker går via klikksporingen " + project.tracking.clickPrefix.slice(0, 50) + "…");

    var demoUsed = D.usedAssets(project).filter(function (id) { return assets[id] && DEMO_NAME.test(assets[id].name || ""); });
    if (demoUsed.length) add("warn", demoUsed.length + " demobilde(r) fra malen er fortsatt i bruk. Bytt dem ut med annonsørens egne bilder.");

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

    checkShare(project, settings || {}, add);
    project.pages.forEach(function (page) {
      var multi = project.pages.length > 1;
      var name = function (i) { return (multi ? page.label + " › " : "") + (i + 1) + ". " + S.BLOCKS[page.sections[i].type].label; };
      var html = renderedSections(project, settings, page);
      checkAnchors(page, html, name, add);
      checkHeadings(page, html, name, add);
      checkLinkText(page, html, add);
    });
    checkWeight(project, add);
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

  NP.preflight = { run: run, list: list, panel: panel, go: go, shareInfo: shareInfo };
})();
