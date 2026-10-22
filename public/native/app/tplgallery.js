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

  // A thumbnail is a poster of the page: screen-tall parts (hero, pinned
  // stories, scenes) are capped at 640 px, so the opening and the sections
  // after it show together, and the card can scroll through it on hover.
  var POSTER_H = 640;
  var THUMB_HEAD =
    "<style>html,body{overflow:hidden!important}html{scroll-behavior:auto!important}body{pointer-events:none}" +
    ".np-hero--h-full,.np-hero--h-tall{--np-hero-h:" + POSTER_H + "px!important}" +
    ".np-minh-screen{min-height:" + POSTER_H + "px!important}.np-minh-half{min-height:" + Math.round(POSTER_H * 0.55) + "px!important}" +
    ".np-hero__zoom{height:auto!important;--np-z:1!important}.np-hero__pin{position:relative!important;height:" + POSTER_H + "px!important;top:0!important}" +
    ".np-hx,.np-hx__pin{height:auto!important;position:relative!important}" +
    ".np-story__media{height:" + POSTER_H + "px!important}.np-story__cards{padding:160px 0 120px!important}.np-story__card{min-height:" + Math.round(POSTER_H * 0.7) + "px!important}" +
    ".np-rank--scenes .np-rank__item{min-height:" + POSTER_H + "px!important}.np-rank--scenes .np-rank__img{height:" + POSTER_H + "px!important}" +
    ".np-sticky,.np-chapnav--side,.np-progress,.np-hero__hint{display:none!important}" +
    "</style><script>window.NP_EDITOR=true</script>";

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
      extraHead: o.thumb ? THUMB_HEAD : "",
    };
    return R.renderDocument(ctx);
  }

  function preview(tpl, useDemo, onUse) {
    // The dialog opens at once; the page fills in when the demo photos are
    // ready (the first time, the server has to store the whole kit).
    (function () {
      var frame = h("iframe.nx-tplprev__frame", { title: "Forhåndsvisning av " + tpl.name, sandbox: "allow-same-origin allow-scripts" });
      var device = "desktop";
      var loading = h("div.nx-tplprev__loading", { role: "status" }, h("span.spinner", { "aria-hidden": "true" }), "Laster forhåndsvisning …");
      var wrap = h("div.nx-tplprev__stage.is-loading", null, frame, loading);
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
      // An empty iframe fires "load" for about:blank first; only the page counts.
      frame.addEventListener("load", function () {
        if (frame.srcdoc) wrap.classList.remove("is-loading");
      });
      demo().then(function (d) {
        frame.srcdoc = documentFor(projectFrom(tpl, d, useDemo));
      });
    })();
  }

  // Hovering a card scrolls its page slowly from top to bottom (the
  // signature moments further down), and back when the pointer leaves.
  var PEEK_SPEED = 900; // page px per second
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function peekOnHover(node, frame, view) {
    if (reduceMotion) return;
    var raf = 0;
    function win() {
      try { return frame.contentWindow && frame.contentWindow.document.documentElement ? frame.contentWindow : null; } catch (e) { return null; }
    }
    function run(to, speed) {
      cancelAnimationFrame(raf);
      var w = win();
      if (!w || !view.classList.contains("is-ready")) return;
      var from = w.scrollY;
      var dist = to - from;
      if (Math.abs(dist) < 2) return;
      var dur = Math.abs(dist) / speed * 1000;
      var t0 = null;
      (function step(t) {
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / dur);
        var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        w.scrollTo(0, from + dist * e);
        if (k < 1) raf = requestAnimationFrame(step);
      })(performance.now());
    }
    node.addEventListener("mouseenter", function () {
      var w = win();
      if (w) run(Math.max(0, w.document.documentElement.scrollHeight - w.innerHeight), PEEK_SPEED);
      node.classList.add("is-peek");
    });
    node.addEventListener("mouseleave", function () {
      run(0, PEEK_SPEED * 6);
      node.classList.remove("is-peek");
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
      peekOnHover(node, frame, view);
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        demo().then(function (d) {
          frame.style.transform = "scale(" + (view.clientWidth / 1280).toFixed(4) + ")";
          frame.addEventListener("load", function () { view.classList.add("is-ready"); }, { once: true });
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

    var wrap = h("div.nx-tplgal-wrap", null, toolbar(), grid);
    wrap.select = select;
    wrap.addCard = function (node) { grid.appendChild(node); };
    return wrap;

    // Twenty templates is past the point where scrolling finds the right
    // one, so the gallery gets an industry filter and a search over name,
    // use and description. Filtering only hides cards: thumbnails that were
    // already rendered stay rendered, the rest load lazily when shown.
    function toolbar() {
      var category = "";
      var search = h("input.nx-input.nx-tplgal__search", { type: "search", placeholder: "Søk etter bransje eller mal …", "aria-label": "Søk i malene" });
      var count = h("span.nx-muted.nx-tplgal__count", { "aria-live": "polite" });
      var used = (T.CATEGORIES || []).filter(function (c) {
        return T.TEMPLATES.some(function (t) { return t.category === c; });
      });
      var chips = h("div.nx-tplgal__cats", { role: "group", "aria-label": "Bransje" },
        [["", "Alle"]].concat(used.map(function (c) { return [c, c === "Grunnmal" ? "Grunnmaler" : c]; })).map(function (pair) {
          var n = pair[0] ? T.TEMPLATES.filter(function (t) { return t.category === pair[0]; }).length : T.TEMPLATES.length;
          return h("button.nx-tplgal__cat", { type: "button", "aria-pressed": String(pair[0] === category), "data-cat": pair[0], on: { click: function () {
            category = pair[0];
            Array.prototype.forEach.call(chips.children, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-cat") === category)); });
            apply();
          } } }, pair[1], h("span.nx-tplgal__n", null, String(n)));
        })
      );
      function apply() {
        var q = search.value.trim().toLowerCase();
        var shown = 0;
        T.TEMPLATES.forEach(function (t) {
          var text = (t.name + " " + (t.use || "") + " " + (t.description || "") + " " + (t.category || "")).toLowerCase();
          var visible = (!category || t.category === category) && (!q || text.indexOf(q) !== -1);
          cards[t.id].hidden = !visible;
          if (visible) shown++;
        });
        count.textContent = shown === T.TEMPLATES.length ? "" : shown ? shown + " av " + T.TEMPLATES.length + " maler" : "Ingen maler passer – prøv et annet ord.";
      }
      search.addEventListener("input", ui.debounce(apply, 100));
      return h("div.nx-tplgal__bar", null, h("div.nx-row", null, search, count), chips);
    }
  }

  NP.tplGallery = { gallery: gallery, preview: preview, projectFrom: projectFrom, documentFor: documentFor, demo: demo };
})();
