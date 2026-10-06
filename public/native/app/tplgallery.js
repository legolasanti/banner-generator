/* =========================================================================
   app/tplgallery.js — the template gallery in "Ny Native Premium".

   Every built-in template is rendered for real (same renderer, its own
   theme, the demo photos) as a live thumbnail, and "Forhåndsvis" opens it
   full size with the page runtime, so the scroll effects can be tried
   before anyone commits to a template.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var D = window.NativeDoc;
  var R = window.NativeRender;
  var T = window.NativeTemplates;
  var Fonts = window.WallpaperFonts;

  var demoPromise = null;

  function demo() {
    if (!demoPromise) {
      demoPromise = NP.api.demo().then(function (r) { return r.demo || {}; }, function () { demoPromise = null; return {}; });
    }
    return demoPromise;
  }

  /** A full project built from a template, the way the server would. */
  function projectFrom(tpl, demoAssets, useDemo) {
    var ids = {};
    var assets = {};
    if (useDemo !== false) {
      Object.keys(demoAssets).forEach(function (n) {
        ids[n] = demoAssets[n].id;
        assets[demoAssets[n].id] = demoAssets[n];
      });
    }
    var expanded = T.expand(tpl, ids);
    var base = D.createProject({
      name: tpl.name,
      advertiser: { name: "Annonsør" },
      theme: tpl.theme ? T.themeOf(tpl) : undefined,
      assets: assets,
      sections: expanded.sections,
    });
    return D.normalizeProject(Object.assign({}, base, { extras: tpl.extras || {} }));
  }

  function fontLinks(project) {
    var fams = {};
    ["heading", "body"].forEach(function (k) {
      var f = project.theme.fonts[k];
      if (f.source === "google" && Fonts && Fonts.has(f.family)) fams[f.family] = true;
    });
    return Object.keys(fams).map(function (fam) { return '<link rel="stylesheet" href="' + D.escapeHtml(Fonts.cssUrl(fam)) + '">'; }).join("");
  }

  function documentFor(project, opts) {
    var o = opts || {};
    var settings = NP.settings || {};
    var ctx = {
      mode: "preview",
      project: project,
      page: project.pages[0],
      settings: settings,
      assets: Object.assign({}, settings.assets || {}, project.assets),
      url: function (id, w) { return NP.api.assetUrl(id, w); },
      pageHref: function () { return "#"; },
      cssHref: "/native/runtime/np.css",
      runtimeSrc: "/native/runtime/np.js",
      fontLinks: fontLinks(project),
      extraHead: o.thumb
        ? "<style>html,body{overflow:hidden!important}body{pointer-events:none}</style><script>window.NP_EDITOR=true</script>"
        : "",
    };
    return R.renderDocument(ctx);
  }

  function preview(tpl, useDemo, onUse) {
    demo().then(function (d) {
      var project = projectFrom(tpl, d, useDemo);
      var frame = h("iframe.nx-tplprev__frame", { title: "Forhåndsvisning av " + tpl.name, sandbox: "allow-same-origin allow-scripts" });
      var device = "desktop";
      var wrap = h("div.nx-tplprev__stage", null, frame);
      var seg = ui.segmented([["desktop", "", "monitor", "Desktop"], ["mobile", "", "smartphone", "Mobil"]], device, function (v) {
        device = v;
        wrap.classList.toggle("is-mobile", v === "mobile");
      }, { iconOnly: true, label: "Skjerm" });
      var m = ui.modal({
        title: tpl.name,
        full: true,
        body: h("div.nx-tplprev", null, h("div.nx-row", null, h("p.nx-muted", { style: "flex:1;margin:0" }, tpl.description), seg), wrap),
        actions: [
          ui.button("Lukk", { kind: "ghost", onClick: function () { m.close(); } }),
          onUse ? ui.button("Bruk denne malen", { kind: "primary", icon: "check", onClick: function () { m.close(); onUse(tpl.id); } }) : null,
        ].filter(Boolean),
      });
      frame.srcdoc = documentFor(project);
    });
  }

  /**
   * The gallery. opts: { selected, onSelect(id), useDemo() → bool }.
   * Returns a node with .select(id).
   */
  function gallery(opts) {
    var grid = h("div.nx-tplgal");
    var selected = opts.selected;
    var cards = {};

    function card(tpl) {
      var frame = h("iframe.nx-tplgal__frame", { tabindex: "-1", "aria-hidden": "true", sandbox: "allow-same-origin allow-scripts", loading: "lazy" });
      var view = h("span.nx-tplgal__view", null, frame, h("span.nx-tplgal__shade"));
      var node = h(
        "div.nx-tplgal__card" + (tpl.id === selected ? ".is-sel" : ""),
        null,
        h("button.nx-tplgal__pick", { type: "button", "aria-pressed": String(tpl.id === selected), on: { click: function () { select(tpl.id); } } },
          view,
          h("span.nx-tplgal__meta", null,
            h("strong", null, tpl.name, tpl.premium ? h("span.nx-tplgal__badge", null, "Premium") : null),
            h("span.nx-muted", null, tpl.use || ""))
        ),
        ui.button("Forhåndsvis", { small: true, kind: "ghost", icon: "eye", cls: "nx-tplgal__prev", onClick: function () {
          preview(tpl, opts.useDemo ? opts.useDemo() : true, function (id) { select(id); if (opts.onUse) opts.onUse(id); });
        } })
      );
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        demo().then(function (d) {
          frame.style.transform = "scale(" + (view.clientWidth / 1280).toFixed(4) + ")";
          frame.srcdoc = documentFor(projectFrom(tpl, d, opts.useDemo ? opts.useDemo() : true), { thumb: true });
        });
      }, { rootMargin: "200px" });
      requestAnimationFrame(function () { io.observe(node); });
      cards[tpl.id] = node;
      return node;
    }

    function select(id) {
      selected = id;
      Object.keys(cards).forEach(function (k) {
        cards[k].classList.toggle("is-sel", k === id);
        cards[k].querySelector(".nx-tplgal__pick").setAttribute("aria-pressed", String(k === id));
      });
      if (opts.onSelect) opts.onSelect(id);
    }

    T.TEMPLATES.forEach(function (t) { grid.appendChild(card(t)); });
    grid.select = select;
    grid.addCard = function (node) { grid.appendChild(node); };
    return grid;
  }

  NP.tplGallery = { gallery: gallery, preview: preview, projectFrom: projectFrom, documentFor: documentFor, demo: demo };
})();
