/* =========================================================================
   app/library.js — Bibliotek: the built-in page templates and the team's
   own saved sections and pages. Saving goes from the section toolbar
   ("Lagre i biblioteket") or from a whole page here.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var S = window.NativeSchema;
  var D = window.NativeDoc;

  function assetsFor(sections) {
    var p = NP.store.get().project;
    var out = {};
    D.usedAssets({ pages: [{ sections: sections }], assets: p.assets, theme: {}, advertiser: {}, meta: {} }).forEach(function (id) {
      if (p.assets[id]) out[id] = p.assets[id];
    });
    return out;
  }

  function save(kind, sections, defaultName) {
    var name = h("input.nx-input", { type: "text", value: defaultName || "", maxlength: 80, autofocus: true });
    var cat = h("input.nx-input", { type: "text", value: "Egne", maxlength: 40, list: "nx-lib-cats" });
    var desc = h("input.nx-input", { type: "text", maxlength: 300, placeholder: "Når passer den?" });
    var m = ui.modal({
      title: kind === "page" ? "Lagre siden som mal" : "Lagre seksjonen i biblioteket",
      body: h(
        "div.nx-stack",
        null,
        h("label.nx-field", null, h("span.nx-field__label", null, "Navn"), name),
        h("label.nx-field", null, h("span.nx-field__label", null, "Kategori"), cat),
        h("datalist#nx-lib-cats", null, ["Egne", "Åpninger", "Fakta", "Handling", "Bil", "Retail", "Reise"].map(function (c) { return h("option", { value: c }); })),
        h("label.nx-field", null, h("span.nx-field__label", null, "Beskrivelse"), desc),
        h("p.nx-help", null, "Bilder som brukes, følger med. Tekst kan gjerne være eksempeltekst.")
      ),
      actions: [
        ui.button("Avbryt", { kind: "ghost", onClick: function () { m.close(); } }),
        ui.button("Lagre", { kind: "primary", onClick: function () {
          NP.api.saveLibrary({ kind: kind, name: name.value.trim(), category: cat.value.trim(), description: desc.value.trim(), sections: sections, assets: assetsFor(sections) }).then(function () {
            ui.toast("Lagret i biblioteket", "ok");
            m.close();
          }, function (err) { ui.toast(err.message, "err"); });
        } }),
      ],
    });
  }

  function saveSection(section) {
    save("section", [section], section.name || S.BLOCKS[section.type].label);
  }

  function view(host) {
    var root = h("div.page.nx-page");
    var box = h("div.nx-libsecs");
    root.appendChild(ui.pageHead("Bibliotek", "Ferdige maler og seksjoner teamet har lagret. Start nye saker fra dem under «Ny Native Premium».", null));
    root.appendChild(box);
    host.appendChild(root);

    function heading(title, n, desc) {
      return h("div.nx-libsec__head", null,
        h("h2.nx-libsec__title", null, title, h("span.nx-libsec__n", null, String(n))),
        h("p.nx-libsec__desc", null, desc));
    }

    // Long descriptions are clamped to keep the cards in step; the full
    // text is in the tooltip.
    function card(opts) {
      return h(
        "article.nx-libitem",
        null,
        h("div.nx-libitem__main", null,
          opts.tag || null,
          h("h3.nx-libitem__name", null, opts.name),
          opts.meta ? h("p.nx-libitem__meta", null, opts.meta) : null,
          opts.desc ? h("p.nx-libitem__desc", { title: opts.desc }, opts.desc) : null,
          opts.use ? h("p.nx-libitem__use", { title: opts.use }, h("strong", null, "Passer for: "), opts.use) : null),
        h("div.nx-libitem__foot", null, ui.sectionStrip(opts.sections), opts.action || null)
      );
    }

    function load() {
      ui.clear(box);
      box.appendChild(h("div.nx-loading", null, ui.spinner(), " Henter biblioteket …"));
      NP.api.library().then(function (r) {
        ui.clear(box);
        var items = r.items || [];
        var g1 = h("div.nx-libgrid");
        r.templates.forEach(function (t) {
          g1.appendChild(card({ name: t.name, desc: t.description, use: t.use, sections: t.sections }));
        });
        box.appendChild(h("section.nx-libsec", null, heading("Innebygde maler", r.templates.length, "Hele sider med ferdig design og eksempeltekst."), g1));

        var saved = h("section.nx-libsec", null, heading("Lagret av teamet", items.length, "Seksjoner og sider dere har lagret selv."));
        box.appendChild(saved);
        if (!items.length) {
          saved.appendChild(ui.empty("bookmark", "Ingenting lagret ennå", "Åpne et prosjekt, velg en seksjon på siden og trykk bokmerke-ikonet i verktøylinjen over den."));
          return;
        }
        var g2 = h("div.nx-libgrid");
        items.forEach(function (it) {
          g2.appendChild(card({
            tag: h("span.nx-tag", null, it.kind === "page" ? "Side" : "Seksjon"),
            name: it.name,
            meta: it.category + (it.by ? " · " + it.by : "") + " · " + ui.when(it.createdAt),
            desc: it.description,
            sections: it.sections,
            action: ui.button("", { small: true, kind: "ghost", icon: "trash", title: "Slett «" + it.name + "»", cls: "is-danger", onClick: function () {
              ui.confirm("Slette «" + it.name + "»?", "", "Slett", true).then(function (ok) { if (ok) NP.api.deleteLibrary(it.id).then(load); });
            } }),
          }));
        });
        saved.appendChild(g2);
      }, function (err) {
        ui.clear(box);
        box.appendChild(ui.empty("circle-alert", "Kunne ikke hente biblioteket", err.message, ui.button("Prøv igjen", { icon: "refresh-cw", onClick: load })));
      });
    }
    load();
  }

  NP.library = { view: view, saveSection: saveSection, savePage: function () {
    var page = NP.store.page();
    save("page", page.sections, NP.store.get().project.name);
  } };
})();
