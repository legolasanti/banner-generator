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
    var root = h("div.nx-page");
    var box = h("div.nx-stack");
    root.appendChild(h("div.nx-page__head", null, h("div", null, h("h1", null, "Bibliotek"), h("p.nx-muted", null, "Maler og lagrede seksjoner. Lagre en seksjon fra verktøylinjen på siden (bokmerke-ikonet)."))));
    root.appendChild(box);
    host.appendChild(root);

    function types(sections) {
      return h("span.nx-tpl__types", null, sections.map(function (s) { return ui.icon(S.BLOCKS[s.type] ? S.BLOCKS[s.type].icon : "square", 14); }));
    }

    function load() {
      ui.clear(box);
      NP.api.library().then(function (r) {
        box.appendChild(h("h2.nx-page__h2", null, "Innebygde maler"));
        var g1 = h("div.nx-libgrid");
        r.templates.forEach(function (t) {
          g1.appendChild(h("div.nx-libitem", null, h("strong", null, t.name), h("span.nx-muted", null, t.description), h("span.nx-muted", null, "Passer for: " + t.use), types(t.sections)));
        });
        box.appendChild(g1);
        box.appendChild(h("h2.nx-page__h2", null, "Lagret av teamet"));
        var items = r.items || [];
        if (!items.length) {
          box.appendChild(h("p.nx-muted", null, "Ingenting lagret ennå."));
          return;
        }
        var g2 = h("div.nx-libgrid");
        items.forEach(function (it) {
          g2.appendChild(
            h(
              "div.nx-libitem",
              null,
              h("span.nx-tag", null, it.kind === "page" ? "Side" : "Seksjon"),
              h("strong", null, it.name),
              h("span.nx-muted", null, it.category + (it.by ? " · " + it.by : "") + " · " + ui.when(it.createdAt)),
              it.description ? h("span.nx-muted", null, it.description) : null,
              types(it.sections),
              ui.button("Slett", { small: true, kind: "ghost", icon: "trash", onClick: function () {
                ui.confirm("Slette «" + it.name + "»?", "", "Slett", true).then(function (ok) { if (ok) NP.api.deleteLibrary(it.id).then(load); });
              } })
            )
          );
        });
        box.appendChild(g2);
      });
    }
    load();
  }

  NP.library = { view: view, saveSection: saveSection, savePage: function () {
    var page = NP.store.page();
    save("page", page.sections, NP.store.get().project.name);
  } };
})();
