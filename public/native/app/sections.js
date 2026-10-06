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

  // ---- thumbnails of ready-made designs ------------------------------------------------
  // The real renderer and stylesheet in a small iframe, without the runtime:
  // animated content then simply shows in its final state.
  function thumbDoc(section, demoAssets) {
    var state = NP.store.get();
    var settings = NP.settings || {};
    var project = Object.assign({}, state.project, {
      assets: Object.assign({}, state.project.assets, demoAssets || {}),
      pages: [{ id: "p_thumb", label: "", slug: "x", title: "", sections: [section] }],
    });
    var ctx = {
      mode: "preview",
      project: project,
      page: project.pages[0],
      settings: settings,
      assets: Object.assign({}, settings.assets || {}, project.assets),
      url: function (id, w) { return NP.api.assetUrl(id, w); },
      pageHref: function () { return "#"; },
    };
    var R = window.NativeRender;
    return (
      '<!doctype html><html class="np-html"><head><meta charset="utf-8">' +
      '<style>' + R.themeCss(project.theme, {}) + "</style>" +
      '<link rel="stylesheet" href="/native/runtime/np.css">' +
      "<style>body{overflow:hidden;pointer-events:none}.np-sec{min-height:0!important}.np-hero--h-full,.np-minh-screen{--np-hero-h:640px;min-height:640px!important}.np-hero--h-tall{--np-hero-h:560px}.np-hx,.np-hero__zoom{height:auto!important}.np-hero__pin,.np-hx__pin{position:relative!important;height:640px!important}.np-story__cards{padding:120px 0 0!important}.np-story__card{min-height:420px!important}.np-rank--scenes .np-rank__item{min-height:640px!important}.np-tabs__list{display:flex!important}.np-tabs__panel+.np-tabs__panel{display:none!important}.np-flip__b{display:none!important}.np-poll{display:block!important}.np-gal__stage figure+figure{display:none}.np-gal__stage{aspect-ratio:3/2!important}.np-gal__stage figure{position:absolute!important;opacity:1!important}</style>" +
      '</head><body class="np">' + R.renderSection(ctx, section, 1) + "</body></html>"
    );
  }

  function presetCard(preset, onPick) {
    var P = window.NativePresets;
    var frame = h("iframe.nx-preset-card__frame", { title: preset.name, tabindex: "-1", loading: "lazy", sandbox: "allow-same-origin", "aria-hidden": "true" });
    var card = h(
      "button.nx-preset-card",
      { type: "button", dataset: { q: (preset.name + " " + preset.group + " " + S.BLOCKS[preset.section.type].label).toLowerCase() }, on: { click: function () {
        var sec = P.sectionOf(preset, null);
        onPick(D.createSection(sec.type, sec));
      } } },
      h("span.nx-preset-card__view", null, frame),
      h("span.nx-preset-card__name", null, preset.name),
      h("span.nx-preset-card__type", null, ui.icon(S.BLOCKS[preset.section.type].icon, 13), " ", S.BLOCKS[preset.section.type].label)
    );
    // Fill lazily: a dialog of 40 iframes should not render all at once.
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      var view = card.firstChild;
      frame.style.transform = "scale(" + (view.clientWidth / 1280).toFixed(4) + ")";
      NP.tplGallery.demo().then(function (demo) {
        var ids = {};
        var assets = {};
        Object.keys(demo).forEach(function (n) {
          ids[n] = demo[n].id;
          assets[demo[n].id] = demo[n];
        });
        var sec = P.sectionOf(preset, ids);
        frame.srcdoc = thumbDoc(D.createSection(sec.type, Object.assign({}, sec, { ctx: { assets: assets } })), assets);
      });
    }, { rootMargin: "200px" });
    requestAnimationFrame(function () { io.observe(card); });
    return card;
  }

  /** The block catalogue as a dialog; inserts at `index` of the open page. */
  function addDialog(index) {
    var libItems = [];
    var body = h("div.nx-addgrid");
    var tab = "design";
    var search = h("input.nx-input.nx-addsearch", { type: "search", placeholder: "Søk etter seksjon … (f.eks. tall, video, quiz)", "aria-label": "Søk" });
    var tabs = ui.segmented([["design", "Ferdige design"], ["blocks", "Alle blokker"], ["lib", "Bibliotek"]], tab, function (v) { tab = v; draw(); }, { small: true });
    var head = h("div.nx-addhead", null, tabs, search);
    var wrapNode = h("div", null, head, body);
    var m = ui.modal({ title: "Legg til seksjon", wide: true, body: wrapNode });
    setTimeout(function () { search.focus(); }, 50);

    function insert(section) {
      NP.store.addSection(section, index);
      NP.store.select(section.id);
      m.close();
    }

    function filter() {
      var q = search.value.trim().toLowerCase();
      Array.prototype.forEach.call(body.querySelectorAll("[data-q]"), function (n) {
        n.hidden = q && n.dataset.q.indexOf(q) === -1;
      });
      Array.prototype.forEach.call(body.querySelectorAll(".nx-addgrid__sect"), function (sec) {
        sec.hidden = !sec.querySelector("[data-q]:not([hidden])");
      });
    }
    search.addEventListener("input", function () {
      if (search.value && tab === "lib") { tab = "blocks"; tabs.set("blocks"); draw(); }
      filter();
    });

    function drawDesigns() {
      var P = window.NativePresets;
      P.GROUPS.forEach(function (g) {
        var items = P.PRESETS.filter(function (x) { return x.group === g; });
        if (!items.length) return;
        var row = h("div.nx-presetgrid");
        items.forEach(function (pr) { row.appendChild(presetCard(pr, insert)); });
        body.appendChild(h("div.nx-addgrid__sect", null, h("h3.nx-addgrid__group", null, g), row));
      });
    }

    function drawBlocks() {
      S.GROUPS.forEach(function (g) {
        var types = S.ORDER.filter(function (t) { return S.BLOCKS[t].group === g; });
        if (!types.length) return;
        var row = h("div.nx-addgrid__row");
        types.forEach(function (t) {
          var b = S.BLOCKS[t];
          row.appendChild(
            h(
              "button.nx-addcard",
              { type: "button", dataset: { q: (b.label + " " + b.desc + " " + g + " " + t).toLowerCase() }, on: { click: function () { insert(D.createSection(t)); } } },
              h("span.nx-addcard__icon", null, ui.icon(b.icon, 22)),
              h("span.nx-addcard__name", null, b.label),
              h("span.nx-addcard__desc", null, b.desc)
            )
          );
        });
        body.appendChild(h("div.nx-addgrid__sect", null, h("h3.nx-addgrid__group", null, g), row));
      });
    }

    function drawLibrary() {
      var row = h("div.nx-addgrid__row");
      body.appendChild(h("div.nx-addgrid__sect", null, h("h3.nx-addgrid__group", null, "Fra biblioteket"), row));
      row.appendChild(h("p.nx-muted", null, "Henter …"));
      NP.api.library().then(function (r) {
        ui.clear(row);
        libItems = (r.items || []).filter(function (x) { return x.kind === "section"; });
        if (!libItems.length) {
          row.appendChild(h("p.nx-muted", null, "Biblioteket er tomt. Lagre en seksjon dit fra verktøylinjen over seksjonen (bokmerke-ikonet)."));
          return;
        }
        libItems.forEach(function (item) {
          row.appendChild(
            h(
              "button.nx-addcard.nx-addcard--lib",
              {
                type: "button",
                dataset: { q: (item.name + " " + item.category).toLowerCase() },
                on: {
                  click: function () {
                    NP.store.addAssets(Object.keys(item.assets || {}).map(function (id) { return Object.assign({ id: id }, item.assets[id]); }));
                    var secs = item.sections.map(D.cloneSection);
                    secs.forEach(function (sec, k) { NP.store.addSection(sec, index + k); });
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
        filter();
      }).catch(function () {});
    }

    function draw() {
      ui.clear(body);
      if (tab === "design") drawDesigns();
      if (tab === "blocks") drawBlocks();
      if (tab === "lib") drawLibrary();
      filter();
    }
    draw();
  }

  // ---- copy / paste ---------------------------------------------------------------------------
  // Kept in localStorage so a section can travel between projects (its images
  // and videos are content-addressed files on the server; the clipboard
  // carries their metadata along).
  var CLIP_KEY = "np-clipboard";

  function clipWrite(kind, data) {
    try {
      localStorage.setItem(CLIP_KEY + ":" + kind, JSON.stringify(data));
    } catch (_) {
      NP["_clip_" + kind] = data;
    }
  }

  function clipRead(kind) {
    try {
      var raw = localStorage.getItem(CLIP_KEY + ":" + kind);
      if (raw) return JSON.parse(raw);
    } catch (_) {
      /* fall through */
    }
    return NP["_clip_" + kind] || null;
  }

  function copy(id) {
    var p = NP.store.get().project;
    var found = D.findSection(p, id);
    if (!found) return;
    var assets = {};
    D.usedAssets({ pages: [{ sections: [found.section] }], assets: p.assets, theme: {}, advertiser: {}, meta: {} }).forEach(function (a) {
      if (p.assets[a]) assets[a] = p.assets[a];
    });
    clipWrite("section", { section: found.section, assets: assets });
    ui.toast("Seksjonen er kopiert – lim inn med Ctrl+V", "ok");
  }

  function paste(afterId) {
    var clip = clipRead("section");
    if (!clip || !clip.section) return ui.toast("Ingenting å lime inn", "err");
    NP.store.addAssets(Object.keys(clip.assets || {}).map(function (id) { return Object.assign({ id: id }, clip.assets[id]); }));
    var assets = NP.store.get().project.assets;
    var sec = D.normalizeSection(D.cloneSection(clip.section), { assets: assets });
    if (!sec) return;
    var page = NP.store.page();
    var at = afterId ? page.sections.findIndex(function (x) { return x.id === afterId; }) : -1;
    NP.store.addSection(sec, at === -1 ? page.sections.length : at + 1);
    NP.store.select(sec.id);
  }

  function copyStyle(id) {
    var found = D.findSection(NP.store.get().project, id);
    if (!found) return;
    // Background photos / videos travel with the style.
    var p = NP.store.get().project;
    var assets = {};
    S.STYLE_FIELDS.forEach(function (f) {
      var v = found.section.style[f.key];
      if ((f.type === "image" || f.type === "video") && v && p.assets[v]) {
        assets[v] = p.assets[v];
        if (p.assets[v].poster && p.assets[p.assets[v].poster]) assets[p.assets[v].poster] = p.assets[p.assets[v].poster];
      }
    });
    clipWrite("style", { style: found.section.style, rs: found.section.rs, assets: assets });
    ui.toast("Stilen er kopiert", "ok");
  }

  function hasStyle() {
    return !!clipRead("style");
  }

  function pasteStyle(id) {
    var clip = clipRead("style");
    if (!clip) return;
    NP.store.addAssets(Object.keys(clip.assets || {}).map(function (aid) { return Object.assign({ id: aid }, clip.assets[aid]); }));
    var assets = NP.store.get().project.assets;
    NP.store.updateSection(id, function (sec) {
      var next = D.normalizeSection(Object.assign({}, sec, { style: Object.assign({}, clip.style, { anchor: sec.style.anchor, chapter: sec.style.chapter }), rs: clip.rs }), { assets: assets });
      return Object.assign({}, next, { id: sec.id });
    });
    ui.toast("Stilen er limt inn", "ok");
  }

  function remove(id) {
    var found = D.findSection(NP.store.get().project, id);
    if (!found) return;
    ui.confirm("Slette seksjonen?", "«" + S.BLOCKS[found.section.type].label + "» fjernes fra siden. Du kan angre med Ctrl+Z.", "Slett", true).then(function (ok) {
      if (ok) NP.store.removeSection(id);
    });
  }

  NP.sections = {
    panel: panel,
    addDialog: addDialog,
    addMenu: function (anchor, index) { addDialog(index); },
    remove: remove,
    summary: summary,
    copy: copy,
    paste: paste,
    copyStyle: copyStyle,
    pasteStyle: pasteStyle,
    hasStyle: hasStyle,
  };
})();
