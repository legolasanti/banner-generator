/* =========================================================================
   app/sections.js — the section list (left panel) and "Legg til seksjon".

   The list is the page's table of contents: drag to reorder, click to jump,
   eye to hide per device. Adding a section opens a catalogue grouped like
   the schema (Topp, Tekst, Media, Handling, Effekter) plus the team's saved
   sections from the library.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var S = window.NativeSchema;
  var D = window.NativeDoc;

  function summary(s) {
    var p = s.props;
    var text = p.title || p.label || p.name || p.text || p.kicker || "";
    if (!text && p.html) text = D.plainText(p.html);
    if (!text && p.items && p.items[0]) text = p.items[0].text || p.items[0].name || p.items[0].q || p.items[0].label || "";
    if (!text && p.slides && p.slides[0]) text = p.slides[0].title || p.slides[0].text || "";
    return String(text).replace(/\s+/g, " ").slice(0, 60);
  }

  function hiddenOn(s) {
    return ["desktop", "tablet", "mobile"].filter(function (d) { return s.hide[d]; });
  }

  function panel() {
    var root = h("div.nx-seclist");
    var list = h("ol.nx-seclist__list", { "aria-label": "Seksjoner på siden" });
    var dragId = null;

    function draw() {
      var state = NP.store.get();
      var page = NP.store.page();
      ui.clear(list);
      list.appendChild(h("li.nx-seclist__fixed", { title: "Merkingen er fast og kan ikke fjernes" }, ui.icon("lock", 14), h("span", null, "Annonsørmerking")));
      page.sections.forEach(function (s, i) {
        var hidden = hiddenOn(s);
        var item = h(
          "li.nx-seclist__item" + (state.selected === s.id ? ".is-sel" : ""),
          { draggable: "true", dataset: { id: s.id } },
          h("span.nx-seclist__grip", { "aria-hidden": "true" }, ui.icon("grip-vertical", 14)),
          h(
            "button.nx-seclist__main",
            { type: "button", on: { click: function () { NP.store.select(s.id); } } },
            h("span.nx-seclist__icon", null, ui.icon(S.BLOCKS[s.type].icon, 16)),
            h("span.nx-seclist__text", null, h("span.nx-seclist__type", null, (i + 1) + ". " + S.BLOCKS[s.type].label), h("span.nx-seclist__sum", null, summary(s) || "–"))
          ),
          hidden.length ? h("span.nx-seclist__hid", { title: "Skjult på " + hidden.map(devName).join(", ") }, ui.icon("eye-off", 14)) : null
        );
        item.addEventListener("dragstart", function (e) {
          dragId = s.id;
          item.classList.add("is-drag");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", s.id);
        });
        item.addEventListener("dragend", function () {
          dragId = null;
          item.classList.remove("is-drag");
          Array.prototype.forEach.call(list.querySelectorAll(".is-over-top,.is-over-bottom"), function (n) { n.classList.remove("is-over-top", "is-over-bottom"); });
        });
        item.addEventListener("dragover", function (e) {
          if (!dragId || dragId === s.id) return;
          e.preventDefault();
          var r = item.getBoundingClientRect();
          var top = e.clientY < r.top + r.height / 2;
          item.classList.toggle("is-over-top", top);
          item.classList.toggle("is-over-bottom", !top);
        });
        item.addEventListener("dragleave", function () { item.classList.remove("is-over-top", "is-over-bottom"); });
        item.addEventListener("drop", function (e) {
          e.preventDefault();
          if (!dragId || dragId === s.id) return;
          var r = item.getBoundingClientRect();
          var top = e.clientY < r.top + r.height / 2;
          var from = page.sections.findIndex(function (x) { return x.id === dragId; });
          var to = i + (top ? 0 : 1);
          if (from < to) to -= 1;
          NP.store.moveSection(dragId, to);
        });
        list.appendChild(item);
      });
      list.appendChild(h("li.nx-seclist__fixed", null, ui.icon("lock", 14), h("span", null, "Bunntekst og deling")));
    }

    root.appendChild(list);
    root.appendChild(
      h(
        "div.nx-seclist__foot",
        null,
        ui.button("Legg til seksjon", { icon: "plus", kind: "primary", onClick: function () {
          var page = NP.store.page();
          var sel = NP.store.get().selected;
          var idx = sel ? page.sections.findIndex(function (s) { return s.id === sel; }) + 1 : page.sections.length;
          addDialog(idx);
        } })
      )
    );
    var unsub = NP.store.subscribe(function (s, change) {
      if (change.kind === "project" || change.kind === "select" || change.kind === "page" || change.kind === "load") draw();
    });
    draw();
    root.destroy = unsub;
    return root;
  }

  function devName(d) {
    return { desktop: "desktop", tablet: "nettbrett", mobile: "mobil" }[d];
  }

  /** The block catalogue as a dialog; inserts at `index` of the open page. */
  function addDialog(index) {
    var libItems = [];
    var body = h("div.nx-addgrid");
    var m = ui.modal({ title: "Legg til seksjon", wide: true, body: body });

    function insert(section) {
      NP.store.addSection(section, index);
      m.close();
    }

    S.GROUPS.forEach(function (g) {
      var types = S.ORDER.filter(function (t) { return S.BLOCKS[t].group === g; });
      if (!types.length) return;
      body.appendChild(h("h3.nx-addgrid__group", null, g));
      var row = h("div.nx-addgrid__row");
      types.forEach(function (t) {
        var b = S.BLOCKS[t];
        row.appendChild(
          h(
            "button.nx-addcard",
            { type: "button", on: { click: function () { insert(D.createSection(t)); } } },
            h("span.nx-addcard__icon", null, ui.icon(b.icon, 22)),
            h("span.nx-addcard__name", null, b.label),
            h("span.nx-addcard__desc", null, b.desc)
          )
        );
      });
      body.appendChild(row);
    });

    var libRow = h("div.nx-addgrid__row");
    var libHead = h("h3.nx-addgrid__group", null, "Fra biblioteket");
    NP.api.library().then(function (r) {
      libItems = (r.items || []).filter(function (x) { return x.kind === "section"; });
      if (!libItems.length) return;
      body.appendChild(libHead);
      libItems.forEach(function (item) {
        libRow.appendChild(
          h(
            "button.nx-addcard.nx-addcard--lib",
            {
              type: "button",
              on: {
                click: function () {
                  NP.store.addAssets(Object.keys(item.assets || {}).map(function (id) { return Object.assign({ id: id }, item.assets[id]); }));
                  var secs = item.sections.map(D.cloneSection);
                  secs.forEach(function (s, k) { NP.store.addSection(s, index + k); });
                  m.close();
                },
              },
            },
            h("span.nx-addcard__icon", null, ui.icon("bookmark", 20)),
            h("span.nx-addcard__name", null, item.name),
            h("span.nx-addcard__desc", null, item.category + (item.by ? " · " + item.by : ""))
          )
        );
      });
      body.appendChild(libRow);
    }).catch(function () {});
  }

  function remove(id) {
    var found = D.findSection(NP.store.get().project, id);
    if (!found) return;
    ui.confirm("Slette seksjonen?", "«" + S.BLOCKS[found.section.type].label + "» fjernes fra siden. Du kan angre med Ctrl+Z.", "Slett", true).then(function (ok) {
      if (ok) NP.store.removeSection(id);
    });
  }

  NP.sections = { panel: panel, addDialog: addDialog, addMenu: function (anchor, index) { addDialog(index); }, remove: remove, summary: summary };
})();
