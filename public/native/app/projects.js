/* =========================================================================
   app/projects.js — the Native Premium start page: every project as a card
   (newest first), search and status filter, and "Ny Native Premium".

   A new project starts from one of three places: a built-in template or a
   saved page from the library, an empty page, or the AI wizard — and can
   take a brand kit's colours, fonts and logo from the first second.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var D = window.NativeDoc;
  var T = window.NativeTemplates;

  function newDialog() {
    var name = h("input.nx-input", { type: "text", placeholder: "F.eks. Ford Puma – høstkampanje", maxlength: 120, autofocus: true });
    var adv = h("input.nx-input", { type: "text", placeholder: "F.eks. Ford", maxlength: 80 });
    var url = h("input.nx-input", { type: "url", placeholder: "https://www.ford.no/" });
    var kitSel = h("select.nx-input.nx-select");
    kitSel.appendChild(h("option", { value: "" }, "Standard (ingen merkevare)"));
    var start = "ai";
    var template = "bil-premium";
    var tplBox = h("div");
    var kits = [];

    NP.api.brandKits().then(function (r) {
      kits = r.brandKits || [];
      kits.forEach(function (k) { kitSel.appendChild(h("option", { value: k.id }, k.name)); });
    });
    kitSel.addEventListener("change", function () {
      var k = kits.filter(function (x) { return x.id === kitSel.value; })[0];
      if (k && !adv.value) adv.value = k.advertiser.name || k.name;
      if (k && !url.value) url.value = k.advertiser.url || "";
    });

    var demoOn = h("input", { type: "checkbox", checked: true });
    var gal = NP.tplGallery.gallery({
      selected: template,
      onSelect: function (id) { template = id; },
      onUse: function () { create.click(); },
      useDemo: function () { return demoOn.checked; },
    });
    tplBox.appendChild(gal);
    // Pages saved to the library are templates too (no thumbnail).
    NP.api.library().then(function (r) {
      var pages = (r.items || []).filter(function (x) { return x.kind === "page"; });
      if (!pages.length) return;
      var row = h("div.nx-tplgrid");
      pages.forEach(function (it) {
        var b = h(
          "button.nx-tpl",
          { type: "button", on: { click: function () {
            template = it.id;
            gal.select(null);
            Array.prototype.forEach.call(row.children, function (n) { n.setAttribute("aria-pressed", String(n === b)); });
          } } },
          h("strong", null, it.name),
          h("span.nx-muted", null, it.description || it.category),
          ui.sectionStrip(it.sections)
        );
        row.appendChild(b);
      });
      tplBox.appendChild(h("h4.nx-group", null, "Fra biblioteket"));
      tplBox.appendChild(row);
    });

    var startSeg = ui.segmented(
      [["ai", "Med AI", "sparkles"], ["template", "Fra mal", "layout-template"], ["empty", "Tom side", "file-plus"]],
      start,
      function (v) {
        start = v;
        tplWrap.hidden = v !== "template";
        // The gallery needs the room; the plain form does not.
        m.node.classList.toggle("nx-modal--xl", v === "template");
      }
    );
    var tplWrap = h(
      "div.nx-field",
      { hidden: true },
      h("div.nx-field__head", null, h("span.nx-field__label", null, "Mal"),
        h("label.nx-switch.nx-switch--sm", null, demoOn, h("span.nx-switch__track"), h("span", null, "Med demobilder"))),
      tplBox
    );

    var create = ui.button("Opprett", { kind: "primary", onClick: function () {
      var n = name.value.trim() || (adv.value.trim() ? adv.value.trim() + " – Native Premium" : "Ny Native Premium");
      create.disabled = true;
      NP.api.createProject({
        name: n,
        advertiser: { name: adv.value.trim(), url: D.safeUrl(url.value.trim()) },
        brandKit: kitSel.value || undefined,
        template: start === "template" ? template : undefined,
        demo: start === "template" ? demoOn.checked : undefined,
      }).then(function (r) {
        var p = r.project;
        // "Tom side" and "Med AI" start without the template's sections.
        var after = start === "template" ? Promise.resolve() : NP.api.saveProject(p.id, Object.assign({}, p, { pages: [Object.assign({}, p.pages[0], { sections: [] })] }), p.rev);
        return after.then(function () {
          m.close();
          location.hash = "#/p/" + p.id + (start === "ai" ? "/ai" : "");
        });
      }).catch(function (err) {
        create.disabled = false;
        ui.toast(err.message, "err");
      });
    } });

    var m = ui.modal({
      title: "Ny Native Premium",
      wide: true,
      body: h(
        "div.nx-stack",
        null,
        h("div.nx-grid2", null,
          h("label.nx-field", null, h("span.nx-field__label", null, "Annonsør"), adv),
          h("label.nx-field", null, h("span.nx-field__label", null, "Annonsørens nettside"), url)
        ),
        h("label.nx-field", null, h("span.nx-field__label", null, "Prosjektnavn"), name),
        h("label.nx-field", null, h("span.nx-field__label", null, "Merkevare (farger, skrifter, logo)"), kitSel),
        h("div.nx-field", null, h("span.nx-field__label", null, "Start"), startSeg),
        tplWrap,
        h("p.nx-help", null, "Med AI: lim inn Google Docs-briefen og Drive-mappen, svar på noen spørsmål, og få et utkast du redigerer videre.")
      ),
      actions: [ui.button("Avbryt", { kind: "ghost", onClick: function () { m.close(); } }), create],
    });
  }

  function view(host) {
    var root = h("div.page.nx-page");
    var search = h("input.nx-input.nx-search", { type: "search", placeholder: "Søk i prosjekter …", "aria-label": "Søk i prosjekter" });
    var filter = "all";
    var grid = h("div.nx-cards");
    var all = [];

    root.appendChild(
      ui.pageHead(
        "Prosjekter",
        "Alle Native Premium-saker for ABC Nyheter. Lag en ny med AI, fra en mal eller fra en tom side.",
        ui.button("Ny Native Premium", { kind: "primary", icon: "plus", onClick: newDialog })
      )
    );
    root.appendChild(
      h(
        "div.nx-page__tools",
        null,
        search,
        ui.segmented([["all", "Alle"], ["draft", "Utkast"], ["review", "Til gjennomgang"], ["approved", "Godkjent"], ["published", "Publisert"]], filter, function (v) { filter = v; draw(); }, { small: true, label: "Vis status" })
      )
    );
    root.appendChild(grid);
    host.appendChild(root);
    search.addEventListener("input", ui.debounce(draw, 120));

    function card(p) {
      var thumb = p.thumb ? h("img", { src: NP.api.assetUrl(p.thumb, 480), alt: "", loading: "lazy", on: { error: function (e) { e.target.src = NP.api.assetUrl(p.thumb, 0); } } }) : h("div.nx-card__ph", null, ui.icon("panel-top", 30));
      var menuBtn = ui.button("", { icon: "ellipsis-vertical", kind: "ghost", small: true, title: "Flere valg for «" + p.name + "»", onClick: function (e) {
        e.stopPropagation();
        ui.popover(e.currentTarget, h("div.nx-menu", null,
          h("button", { type: "button", on: { click: function () { ui.closePopover(); location.hash = "#/p/" + p.id; } } }, ui.icon("pencil", 15), " Åpne"),
          h("button", { type: "button", on: { click: function () {
            ui.closePopover();
            NP.api.duplicateProject(p.id).then(function () { ui.toast("Prosjektet er kopiert", "ok"); load(); }, function (err) { ui.toast(err.message, "err"); });
          } } }, ui.icon("copy", 15), " Lag kopi"),
          h("button", { type: "button", on: { click: function () {
            ui.closePopover();
            window.open(NP.api.previewUrl(p.id), "_blank", "noopener");
          } } }, ui.icon("eye", 15), " Forhåndsvis"),
          h("button.is-danger", { type: "button", on: { click: function () {
            ui.closePopover();
            ui.confirm("Slette «" + p.name + "»?", "Prosjektet flyttes til papirkurven på serveren (data/native/trash) og kan hentes tilbake av en administrator.", "Slett", true).then(function (ok) {
              if (!ok) return;
              NP.api.deleteProject(p.id).then(function () { ui.toast("Slettet", "ok"); load(); }, function (err) { ui.toast(err.message, "err"); });
            });
          } } }, ui.icon("trash", 15), " Slett")
        ), { align: "right" });
      } });
      // The title link covers the whole card (::after); the menu sits outside
      // the link so opening it does not also open the project.
      return h(
        "article.nx-card",
        null,
        h("span.nx-card__img", null, thumb, h("span.nx-status.badge.is-" + p.status, null, D.STATUS_LABELS[p.status])),
        h("span.nx-card__body", null,
          h("span.nx-card__adv", null, p.advertiser || "Ukjent annonsør"),
          h("a.nx-card__name", { href: "#/p/" + p.id }, p.name),
          h("span.nx-card__foot", null,
            // Two steady lines: when, then what (a third would not fit the card).
            h("span.nx-card__meta", null,
              h("span", null, "Endret " + ui.when(p.updatedAt)),
              h("span", null, (p.owner ? p.owner + " · " : "") + p.sections + (p.sections === 1 ? " seksjon" : " seksjoner") + (p.pages > 1 ? ", " + p.pages + " varianter" : ""))),
            h("span.nx-card__menu", null, menuBtn))
        )
      );
    }

    function draw() {
      ui.clear(grid);
      var q = search.value.trim().toLowerCase();
      var list = all.filter(function (p) {
        if (filter !== "all" && p.status !== filter) return false;
        return !q || (p.name + " " + p.advertiser).toLowerCase().indexOf(q) !== -1;
      });
      if (!all.length) {
        grid.appendChild(ui.empty("sparkles", "Ingen prosjekter ennå", "Lag den første Native Premium-saken – med AI eller fra en mal.", ui.button("Ny Native Premium", { kind: "primary", icon: "plus", onClick: newDialog })));
        return;
      }
      if (!list.length) {
        grid.appendChild(ui.empty("search", "Ingen treff", "Ingen prosjekter passer søket eller filteret. Prøv et annet ord eller «Alle»."));
        return;
      }
      list.forEach(function (p) { grid.appendChild(card(p)); });
    }

    function load() {
      ui.clear(grid);
      grid.appendChild(h("div.nx-loading", null, ui.spinner(), " Henter prosjekter …"));
      NP.api.projects().then(function (r) {
        all = r.projects;
        draw();
      }, function (err) {
        ui.clear(grid);
        grid.appendChild(ui.empty("circle-alert", "Kunne ikke hente prosjektene", err.message));
      });
    }
    load();
  }

  NP.projects = { view: view, newDialog: newDialog };
})();
