/* =========================================================================
   app/project-panel.js — the project's own settings.

     Annonsør    name (goes into "Annonsørinnhold fra …") and web address
     Sider       audience variants (menn / kvinner / alle): add, rename,
                 reorder, remove; whether readers see tabs between them
     Deling      title, description and share image; the address the page
                 will live at (canonical, og:url); search engines on/off
     Måling      UTM tags added to every advertiser link, and snippets for
                 this project only (the team-wide ones are in Innstillinger)
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var D = window.NativeDoc;

  function project() {
    return NP.store.get().project;
  }

  function text(label, value, onInput, opts) {
    var o = opts || {};
    var input = o.multiline
      ? h("textarea.nx-input.nx-textarea" + (o.code ? ".nx-code" : ""), { rows: o.rows || 3, placeholder: o.placeholder || "", spellcheck: o.code ? "false" : "true" })
      : h("input.nx-input", { type: o.type || "text", placeholder: o.placeholder || "", maxlength: o.max || null });
    input.value = value || "";
    var count = o.max && !o.code ? NP.fields.counter({ max: o.max }, input.value) : null;
    input.addEventListener("input", function () {
      if (count) count.update(input.value);
      onInput(input.value);
    });
    return h("label.nx-field", null, h("div.nx-field__head", null, h("span.nx-field__label", null, label), count), input, o.help ? h("p.nx-help", null, o.help) : null);
  }

  function set(patchFn, group) {
    NP.store.update(function (p) { return D.normalizeProject(Object.assign({}, p, patchFn(p))); }, { group: group, from: "panel" });
  }

  // Normalising the whole project on every keystroke here is fine: these
  // fields are short and the project is small. It keeps slug/url rules in one
  // place (doc.js).
  function setDirect(patchFn, group) {
    NP.store.update(function (p) { return Object.assign({}, p, patchFn(p)); }, { group: group, from: "panel" });
  }

  /** How the page looks when shared on Facebook / LinkedIn; redraws with every edit. */
  function shareCard() {
    var box = h("div.nx-sharecard", { "aria-label": "Forhåndsvisning av deling" });
    function draw() {
      var p = project();
      var info = NP.preflight.shareInfo(p, NP.settings || {});
      var label = (NP.settings && NP.settings.disclosureLabel ? NP.settings.disclosureLabel : "Annonsørinnhold fra {annonsør}").replace("{annonsør}", p.advertiser.name || "annonsør");
      ui.clear(box);
      box.appendChild(info.image
        ? h("img.nx-sharecard__img", { src: ui.thumb(p.assets[info.image], info.image, 480), alt: "" })
        : h("div.nx-sharecard__img.is-empty", null, ui.icon("image-off", 22), h("span", null, "Uten bilde")));
      box.appendChild(h("div.nx-sharecard__text", null,
        info.host ? h("span.nx-sharecard__host", null, info.host) : null,
        h("strong.nx-sharecard__title", null, info.title + " – " + label),
        h("span.nx-sharecard__desc", null, info.description || label)));
    }
    draw();
    box.refresh = draw;
    return box;
  }

  function pagesBlock() {
    var box = h("div.nx-pages");
    function draw() {
      ui.clear(box);
      var p = project();
      var cur = NP.store.get().pageId;
      p.pages.forEach(function (pg, i) {
        var label = h("input.nx-input.nx-input--sm", { type: "text", value: pg.label, maxlength: 60, "aria-label": "Navn på siden" });
        label.addEventListener("change", function () {
          var v = label.value.trim() || pg.label;
          setDirect(function (x) {
            return { pages: x.pages.map(function (q) { return q.id === pg.id ? Object.assign({}, q, { label: v, slug: i === 0 ? q.slug : D.slugify(v, q.slug) }) : q; }) };
          });
          draw();
        });
        box.appendChild(
          h(
            "div.nx-pages__row" + (pg.id === cur ? ".is-cur" : ""),
            null,
            h("button.nx-pages__open", { type: "button", title: "Rediger denne siden", on: { click: function () { NP.store.setPage(pg.id); } } }, ui.icon(pg.id === cur ? "eye" : "file-text", 15)),
            label,
            // The main page lives at the root, so only variants show an address.
            h("span.nx-muted.nx-pages__slug", { title: "Adresse i eksporten" }, i === 0 ? "" : "/" + pg.slug + "/"),
            ui.button("", { icon: "arrow-up", small: true, kind: "ghost", title: "Flytt opp", disabled: i === 0, onClick: function () { move(i, -1); } }),
            ui.button("", { icon: "trash", small: true, kind: "ghost", title: "Slett siden", disabled: p.pages.length === 1, onClick: function () { removePage(pg); } })
          )
        );
      });
      var p2 = project();
      box.appendChild(
        h(
          "div.nx-pages__add",
          null,
          ui.button("Ny variant", { icon: "copy", small: true, title: "Ny variant – en kopi av siden du står på", disabled: p2.pages.length >= D.MAX_PAGES, onClick: function () { addPage(true); } }),
          ui.button("Tom side", { icon: "file-plus", small: true, title: "Ny, tom side", disabled: p2.pages.length >= D.MAX_PAGES, onClick: function () { addPage(false); } })
        )
      );
      var nav = h("input", { type: "checkbox", checked: p2.variantNav });
      nav.addEventListener("change", function () { setDirect(function () { return { variantNav: nav.checked }; }); });
      if (p2.pages.length > 1) box.appendChild(h("label.nx-switch", null, nav, h("span.nx-switch__track"), h("span", null, "Vis faner mellom sidene øverst")));
    }
    function move(i, dir) {
      setDirect(function (p) {
        var pages = p.pages.slice();
        var item = pages.splice(i, 1)[0];
        pages.splice(i + dir, 0, item);
        return { pages: pages };
      });
      draw();
    }
    function addPage(copy) {
      ui.prompt(copy ? "Ny variant" : "Ny side", "Navn (vises i fanene, f.eks. «For kvinner»)", "", "Lag").then(function (name) {
        if (!name) return;
        var cur = NP.store.page();
        // A variant is a page of its own: it keeps the anchors and chapter names.
        var sections = copy ? cur.sections.map(function (s) { return D.cloneSection(s, { keepNav: true }); }) : [];
        var probe = D.normalizeProject(Object.assign({}, project(), { pages: project().pages.concat([{ label: name, sections: sections }]) }));
        var fresh = probe.pages[probe.pages.length - 1];
        setDirect(function (p) { return { pages: p.pages.concat([fresh]) }; });
        NP.store.setPage(fresh.id);
        draw();
      });
    }
    function removePage(pg) {
      ui.confirm("Slette «" + pg.label + "»?", "Siden og alle seksjonene på den fjernes. Du kan angre med Ctrl+Z.", "Slett", true).then(function (ok) {
        if (!ok) return;
        setDirect(function (p) { return { pages: p.pages.filter(function (q) { return q.id !== pg.id; }) }; });
        if (NP.store.get().pageId === pg.id) NP.store.setPage(project().pages[0].id);
        draw();
      });
    }
    draw();
    box.refresh = draw;
    return box;
  }

  function panel() {
    var p = project();
    var root = h("div.nx-stack");

    root.appendChild(h("h3.nx-panel__h", null, "Annonsør"));
    root.appendChild(text("Navn på annonsøren", p.advertiser.name, function (v) {
      setDirect(function (x) { return { advertiser: Object.assign({}, x.advertiser, { name: D.cleanText(v, 80, false) }) }; }, "adv-name");
    }, { max: 80, help: "Står i merkingen: «" + (NP.settings && NP.settings.disclosureLabel ? NP.settings.disclosureLabel : "Annonsørinnhold fra {annonsør}").replace("{annonsør}", p.advertiser.name || "…") + "»." }));
    root.appendChild(text("Annonsørens nettside", p.advertiser.url, function (v) {
      setDirect(function (x) { return { advertiser: Object.assign({}, x.advertiser, { url: D.safeUrl(v) }) }; }, "adv-url");
    }, { type: "url", placeholder: "https://" }));

    root.appendChild(h("h3.nx-panel__h", null, "Sider og varianter"));
    root.appendChild(h("p.nx-help", null, "Lag egne versjoner for ulike målgrupper. Hver variant får sin egen adresse og fane."));
    var pages = pagesBlock();
    root.appendChild(pages);

    root.appendChild(h("h3.nx-panel__h", null, "Deling og søk"));
    root.appendChild(text("Prosjektnavn (internt)", p.name, function (v) {
      setDirect(function () { return { name: D.cleanText(v, 120, false) || "Uten navn" }; }, "name");
    }, { max: 120 }));
    root.appendChild(text("Tittel ved deling", p.meta.title, function (v) {
      setDirect(function (x) { return { meta: Object.assign({}, x.meta, { title: D.cleanText(v, 140, false) }) }; }, "meta-title");
    }, { max: 90, placeholder: "Tom = sidens H1", help: "Vises i Facebook/LinkedIn-forhåndsvisning, alltid med «Annonsørinnhold fra …»." }));
    root.appendChild(text("Beskrivelse", p.meta.description, function (v) {
      setDirect(function (x) { return { meta: Object.assign({}, x.meta, { description: D.cleanText(v, 300, false) }) }; }, "meta-desc");
    }, { multiline: true, max: 160, rows: 3 }));
    var card = shareCard();
    root.appendChild(h("div.nx-field", null, h("div.nx-field__head", null, h("span.nx-field__label", null, "Slik ser delingen ut"), h("span.nx-muted", null, "Facebook / LinkedIn")), card));
    var og = p.meta.ogImage;
    root.appendChild(
      h(
        "div.nx-field",
        null,
        h("div.nx-field__head", null, h("span.nx-field__label", null, "Delingsbilde"), h("span.nx-muted", null, "1200 × 630")),
        h(
          "div.nx-logo-pick",
          null,
          og && p.assets[og] ? h("img", { src: ui.thumb(p.assets[og], og, 480), alt: "" }) : h("span.nx-muted", null, "Tom = hero-bildet"),
          ui.button(og ? "Bytt" : "Velg", { small: true, onClick: function () {
            NP.media.pick({ kind: "image" }).then(function (id) {
              if (!id) return;
              setDirect(function (x) { return { meta: Object.assign({}, x.meta, { ogImage: id }) }; });
              NP.editor.openPanel("project");
            });
          } })
        )
      )
    );
    root.appendChild(text("Kort adresse (slug)", p.meta.slug, function (v) {
      setDirect(function (x) { return { meta: Object.assign({}, x.meta, { slug: D.slugify(v, "annonse") }) }; }, "slug");
    }, { help: "Brukes i filnavnet og i /n/<slug>/ når ABC design publiserer selv." }));
    root.appendChild(text("Endelig adresse (valgfritt)", p.meta.publicUrl, function (v) {
      setDirect(function (x) { return { meta: Object.assign({}, x.meta, { publicUrl: v.trim() }) }; }, "publicUrl");
    }, { type: "url", placeholder: "https://annonse.finansavisen.no/…/", help: "Der siden skal ligge når den publiseres. Gir riktig canonical og delingsbilde i ZIP-eksporten." }));
    var noindex = h("input", { type: "checkbox", checked: p.meta.noindex });
    noindex.addEventListener("change", function () {
      setDirect(function (x) { return { meta: Object.assign({}, x.meta, { noindex: noindex.checked }) }; });
    });
    root.appendChild(h("label.nx-switch", null, noindex, h("span.nx-switch__track"), h("span", null, "Skjul for søkemotorer (noindex)")));

    root.appendChild(h("h3.nx-panel__h", null, "Måling"));
    var utm = p.tracking.utm;
    var utmOn = h("input", { type: "checkbox", checked: utm.enabled });
    utmOn.addEventListener("change", function () {
      setDirect(function (x) { return { tracking: Object.assign({}, x.tracking, { utm: Object.assign({}, x.tracking.utm, { enabled: utmOn.checked }) }) }; });
    });
    root.appendChild(h("label.nx-switch", null, utmOn, h("span.nx-switch__track"), h("span", null, "Legg UTM-parametere på lenker til annonsøren")));
    ["source", "medium", "campaign"].forEach(function (k) {
      root.appendChild(text("utm_" + k, utm[k], function (v) {
        setDirect(function (x) {
          var u = Object.assign({}, x.tracking.utm);
          u[k] = v.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").slice(0, 80);
          return { tracking: Object.assign({}, x.tracking, { utm: u }) };
        }, "utm-" + k);
      }));
    });
    root.appendChild(
      text("Klikksporing foran alle annonsørlenker (valgfritt)", p.tracking.clickPrefix, function (v) {
        setDirect(function (x) { return { tracking: Object.assign({}, x.tracking, { clickPrefix: v.trim() }) }; }, "click");
      }, {
        placeholder: "https://ad.doubleclick.net/ddm/clk/…;?",
        help: "Fra annonsørens byrå (DoubleClick, Adform …). Lenken legges etter, URL-kodet – eller der det står %%DEST_URL%% eller {url}. Må starte med https://.",
      })
    );
    root.appendChild(
      h(
        "details.nx-details",
        null,
        h("summary", null, "Egne skript for dette prosjektet"),
        h("p.nx-help", null, "Felles skript (Kilkaya, Mixpanel, GTM) legges inn én gang i Innstillinger. Her legger du det som bare gjelder denne kampanjen, f.eks. annonsørens visningspiksel. Kjøres bare i eksport og publisert side – aldri i editoren."),
        text("I <head>", p.tracking.headHtml, function (v) {
          setDirect(function (x) { return { tracking: Object.assign({}, x.tracking, { headHtml: v }) }; }, "head");
        }, { multiline: true, code: true, rows: 4, placeholder: "<script>…</script>" }),
        text("Rett etter <body>", p.tracking.bodyHtml, function (v) {
          setDirect(function (x) { return { tracking: Object.assign({}, x.tracking, { bodyHtml: v }) }; }, "body");
        }, { multiline: true, code: true, rows: 4, placeholder: '<img src="https://…/pixel?cb=[timestamp]" width="1" height="1" alt="">' })
      )
    );

    root.appendChild(h("h3.nx-panel__h", null, "Notater"));
    root.appendChild(text("Interne notater (vises ikke på siden)", p.notes, function (v) {
      setDirect(function () { return { notes: v }; }, "notes");
    }, { multiline: true, rows: 4 }));

    var unsub = NP.store.subscribe(function (s, change) {
      if (change.kind === "page" || (change.kind === "project" && change.undo)) pages.refresh();
      if (change.kind === "project" || change.kind === "meta") card.refresh();
    });
    root.destroy = unsub;
    return root;
  }

  NP.projectPanel = { panel: panel, set: set };
})();
