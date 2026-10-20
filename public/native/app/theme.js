/* =========================================================================
   app/theme.js — colours, fonts and logos.

   One editor used in two places: the project's "Tema" panel and the brand
   kit editor (Merkevarer). It works through a small adapter
   ({ get, set, assets, addAssets }), so it does not care which one it edits.

   Contrast is checked live (WCAG AA, 4.5:1 for text): a pale brand colour
   behind white text is flagged before anyone publishes it.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var S = window.NativeSchema;
  var R = window.NativeRender;
  var Fonts = window.WallpaperFonts;

  var loadedPreviews = {};

  function previewFont(family) {
    if (loadedPreviews[family] || !Fonts.has(family)) return;
    loadedPreviews[family] = true;
    document.head.appendChild(h("link", { rel: "stylesheet", href: Fonts.cssUrl(family) }));
  }

  function contrastNotes(theme) {
    var c = theme.colors;
    var out = [];
    var check = function (fg, bg, what) {
      var r = R.contrast(fg, bg);
      if (r < 4.5) out.push(what + " har lav kontrast (" + r.toFixed(1).replace(".", ",") + ":1, bør være minst 4,5:1).");
    };
    check(c.text, "#ffffff", "Tekst på hvit bakgrunn");
    check(c.text, c.soft, "Tekst på lys bakgrunn");
    check(c.link, "#ffffff", "Lenker");
    check(R.onColor(c.primary), c.primary, "Tekst på merkefargen");
    check(R.onColor(c.accent), c.accent, "Knappetekst");
    return out;
  }

  /** The font chooser for one role (heading/body). */
  function fontPicker(role, theme, adapter, redraw) {
    var font = theme.fonts[role];
    var customFamilies = {};
    var assets = adapter.assets();
    Object.keys(assets).forEach(function (id) {
      if (assets[id].kind === "font") customFamilies[assets[id].family] = true;
    });

    function setFont(patch) {
      var t = adapter.get();
      var fonts = Object.assign({}, t.fonts);
      fonts[role] = Object.assign({}, fonts[role], patch);
      adapter.set(Object.assign({}, t, { fonts: fonts }));
      redraw();
    }

    var source = ui.segmented(
      [["google", "Google"], ["custom", "Egen fil"], ["system", "System"]],
      font.source,
      function (v) {
        if (v === "custom") {
          var fams = Object.keys(customFamilies);
          setFont({ source: "custom", family: fams[0] || font.family });
        } else if (v === "google") {
          setFont({ source: "google", family: Fonts.has(font.family) ? font.family : role === "heading" ? "Source Serif 4" : "Source Sans 3" });
        } else setFont({ source: "system" });
      },
      { small: true }
    );

    var body = h("div.nx-stack.nx-stack--sm");
    if (font.source === "google") {
      var sel = h("select.nx-input.nx-select");
      Fonts.CATEGORIES.forEach(function (cat) {
        var group = h("optgroup", { label: cat.label });
        Fonts.FAMILIES.filter(function (f) { return f.c === cat.id; }).forEach(function (f) {
          group.appendChild(h("option", { value: f.f, selected: f.f === font.family }, f.f));
        });
        sel.appendChild(group);
      });
      sel.addEventListener("change", function () {
        previewFont(sel.value);
        setFont({ family: sel.value, weight: Fonts.nearestWeight(sel.value, font.weight) });
      });
      var fam = Fonts.find(font.family);
      var weights = fam ? fam.w : [400, 700];
      var w = h("select.nx-input.nx-select.nx-fontweight");
      weights.forEach(function (x) { w.appendChild(h("option", { value: x, selected: x === font.weight }, String(x))); });
      w.addEventListener("change", function () { setFont({ weight: Number(w.value) }); });
      body.appendChild(h("div.nx-row", null, sel, w));
      previewFont(font.family);
    } else if (font.source === "custom") {
      var fams = Object.keys(customFamilies);
      if (fams.length) {
        var cs = h("select.nx-input.nx-select");
        fams.forEach(function (f) { cs.appendChild(h("option", { value: f, selected: f === font.family }, f)); });
        cs.addEventListener("change", function () { setFont({ family: cs.value }); });
        var cw = h("input.nx-input.nx-num", { type: "number", min: 100, max: 900, step: 100, value: font.weight });
        cw.addEventListener("change", function () { setFont({ weight: Number(cw.value) }); });
        body.appendChild(h("div.nx-row", null, cs, cw));
      } else {
        body.appendChild(h("p.nx-muted", null, "Ingen egne skrifter ennå. Last opp skriftfilene (WOFF2 er best) nedenfor."));
      }
    }
    var sample = h("div.nx-fontsample", {
      style: { fontFamily: R.fontStack(font), fontWeight: String(font.weight) },
    }, role === "heading" ? "Derfor velger flere elbil i år" : "Brødteksten skal være lett å lese, også på mobil – æ, ø og å.");
    return h("div.nx-field", null, h("div.nx-field__head", null, h("span.nx-field__label", null, role === "heading" ? "Titler" : "Brødtekst"), source), body, sample);
  }

  function fontUpload(adapter, redraw) {
    var input = h("input", { type: "file", accept: ".woff2,.woff,.ttf,.otf", hidden: true });
    var family = h("input.nx-input", { type: "text", placeholder: "Skriftnavn, f.eks. FordAntenna" });
    var weight = h("select.nx-input.nx-select.nx-fontweight");
    [300, 400, 500, 600, 700, 800, 900].forEach(function (x) { weight.appendChild(h("option", { value: x, selected: x === 400 }, String(x))); });
    var italic = h("input", { type: "checkbox" });
    var license = h("input", { type: "checkbox" });
    input.addEventListener("change", function () {
      var file = input.files[0];
      input.value = "";
      if (!file) return;
      if (!family.value.trim()) return ui.toast("Skriv skriftnavnet først", "err");
      if (!license.checked) return ui.toast("Bekreft at lisensen tillater bruk på nett", "err");
      NP.api.upload("/api/native/assets/font", file, { family: family.value.trim(), weight: weight.value, style: italic.checked ? "italic" : "normal" }).then(function (r) {
        adapter.addAssets([r.asset]);
        ui.toast("Skriften «" + r.asset.family + " " + r.asset.weight + "» er lagt til", "ok");
        redraw();
      }, function (err) { ui.toast(err.message, "err"); });
    });
    return h(
      "details.nx-details",
      null,
      h("summary", null, "Last opp egen skrift"),
      h(
        "div.nx-stack.nx-stack--sm",
        null,
        h("div.nx-row", null, family, weight),
        h("label.nx-check", null, italic, " Kursiv"),
        h("label.nx-check", null, license, " Lisensen tillater bruk på nettsider (webfont)"),
        ui.button("Velg fil …", { icon: "upload", small: true, onClick: function () { input.click(); } }),
        input,
        h("p.nx-help", null, "Last opp én fil per vekt (f.eks. 400 og 700). Bare tegnene siden bruker sendes ikke – egne skrifter følger med i sin helhet.")
      )
    );
  }

  // Curated looks: colours + fonts that work together. A starting point for
  // advertisers without a brand kit; the logo and everything else stay.
  var PRESETS = [
    { name: "Nordisk lys", colors: { primary: "#1f3a5f", accent: "#e4572e", dark: "#0f1c2e", soft: "#f3efe7", text: "#1c2430", link: "#1f5fa8", page: "#fbf9f5" }, heading: "Fraunces", body: "Inter", scale: "large", tracking: "tight" },
    { name: "Natt og neon", colors: { primary: "#7c5cff", accent: "#00e0b8", dark: "#07070c", soft: "#16161f", text: "#14141c", link: "#7c5cff", page: "#0c0c12" }, heading: "Space Grotesk", body: "Inter", scale: "display", tracking: "tight" },
    { name: "Skandinavisk skog", colors: { primary: "#2f5d4e", accent: "#d9a441", dark: "#13261f", soft: "#eef2ec", text: "#1d2a24", link: "#2f6d57", page: "#ffffff" }, heading: "DM Serif Display", body: "DM Sans", scale: "large", tracking: "normal" },
    { name: "Luksus", colors: { primary: "#111111", accent: "#b8945a", dark: "#0a0a0a", soft: "#f4f1ec", text: "#161616", link: "#8a6a35", page: "#ffffff" }, heading: "Playfair Display", body: "Inter", scale: "display", tracking: "tight" },
    { name: "Sterk kampanje", colors: { primary: "#d7263d", accent: "#ffd23f", dark: "#1b1b1e", soft: "#fff4e6", text: "#1b1b1e", link: "#c11f33", page: "#ffffff" }, heading: "Archivo Black", body: "Archivo", scale: "large", tracking: "tight" },
    { name: "Finans og innsikt", colors: { primary: "#0b3c5d", accent: "#1fa37a", dark: "#082436", soft: "#edf3f7", text: "#14222e", link: "#0b5f99", page: "#ffffff" }, heading: "Source Serif 4", body: "Source Sans 3", scale: "normal", tracking: "normal" },
    { name: "Wrapped", colors: { primary: "#024950", accent: "#ff7b22", dark: "#012e33", soft: "#fcf8ea", text: "#10282b", link: "#0b6f78", page: "#fcf8ea" }, heading: "Archivo Black", body: "DM Sans", scale: "display", tracking: "tight" },
  ];

  function presets(adapter, redraw) {
    var row = h("div.nx-presets");
    PRESETS.forEach(function (pr) {
      var sw = h("span.nx-preset__sw", null,
        h("i", { style: "background:" + pr.colors.page }), h("i", { style: "background:" + pr.colors.primary }),
        h("i", { style: "background:" + pr.colors.accent }), h("i", { style: "background:" + pr.colors.dark }));
      row.appendChild(h("button.nx-preset", { type: "button", title: "Bruk «" + pr.name + "»", on: { click: function () {
        var t = adapter.get();
        var fonts = {
          heading: Object.assign({}, t.fonts.heading, { family: pr.heading, source: "google", weight: /Black|Display/.test(pr.heading) ? 400 : 700 }),
          body: Object.assign({}, t.fonts.body, { family: pr.body, source: "google", weight: 400 }),
        };
        adapter.set(Object.assign({}, t, { colors: Object.assign({}, t.colors, pr.colors), fonts: fonts, scale: pr.scale, tracking: pr.tracking }));
        redraw();
        ui.toast("Utseendet «" + pr.name + "» er brukt – angre med Ctrl+Z", "ok");
      } } }, sw, h("span", null, pr.name)));
    });
    return h("div.nx-field", null, h("div.nx-field__head", null, h("span.nx-field__label", null, "Ferdige utseender"), h("span.nx-muted", null, "farger og skrift")), row);
  }

  /**
   * The theme editor. adapter:
   *   get() → theme, set(theme), assets() → map, addAssets(list),
   *   logo: { get() → id, set(id) } (advertiser logo), extra (node, optional)
   */
  function editor(adapter) {
    var root = h("div.nx-theme");

    function redraw() {
      var theme = adapter.get();
      ui.clear(root);
      if (adapter.extra) root.appendChild(adapter.extra());

      // logo
      if (adapter.logo) {
        var logoId = adapter.logo.get();
        var assets = adapter.assets();
        root.appendChild(
          h(
            "div.nx-field",
            null,
            h("div.nx-field__head", null, h("span.nx-field__label", null, "Annonsørens logo"), h("span.nx-muted", null, "vises i merkingen øverst")),
            h(
              "div.nx-logo-pick",
              null,
              logoId && assets[logoId] ? h("img", { src: ui.thumb(assets[logoId], logoId, 320), alt: "" }) : h("span.nx-muted", null, "Ingen logo – navnet vises i stedet"),
              h(
                "div.nx-row",
                null,
                ui.button(logoId ? "Bytt" : "Velg logo", { small: true, onClick: function () {
                  (adapter.pickImage ? adapter.pickImage() : NP.media.pick({ kind: "image" })).then(function (id) {
                    if (id) {
                      adapter.logo.set(id);
                      redraw();
                    }
                  });
                } }),
                logoId ? ui.button("Fjern", { small: true, kind: "ghost", onClick: function () { adapter.logo.set(""); redraw(); } }) : null
              )
            ),
            h("p.nx-help", null, "PNG med gjennomsiktig bakgrunn eller WEBP, minst 300 px bred.")
          )
        );
      }

      // colours
      var colors = h("div.nx-colors");
      S.THEME_COLORS.forEach(function (c) {
        var key = c[0];
        var input = h("input.nx-color", { type: "color", value: theme.colors[key], "aria-label": c[1] + " – velg farge" });
        var hex = h("input.nx-input.nx-hex", { type: "text", value: theme.colors[key], maxlength: 7, spellcheck: "false", "aria-label": c[1] + " – fargekode" });
        function set(v) {
          var t = adapter.get();
          var cols = Object.assign({}, t.colors);
          cols[key] = v.toLowerCase();
          adapter.set(Object.assign({}, t, { colors: cols }), { group: "color:" + key });
        }
        input.addEventListener("input", function () {
          hex.value = input.value;
          set(input.value);
        });
        input.addEventListener("change", redraw);
        hex.addEventListener("change", function () {
          if (!/^#[0-9a-f]{6}$/i.test(hex.value.trim())) return ui.toast("Skriv fargen som #rrggbb", "err");
          input.value = hex.value.trim();
          set(hex.value.trim());
          redraw();
        });
        colors.appendChild(h("label.nx-colorrow", null, input, h("span.nx-colorrow__label", null, c[1]), hex));
      });
      root.appendChild(h("div.nx-field", null, h("div.nx-field__head", null, h("span.nx-field__label", null, "Farger")), colors));
      var notes = contrastNotes(theme);
      if (notes.length) {
        root.appendChild(h("div.nx-note.nx-note--warn", null, ui.icon("circle-alert", 15), h("div", null, notes.map(function (n) { return h("div", null, n); }))));
      }

      // fonts
      root.appendChild(fontPicker("heading", theme, adapter, redraw));
      root.appendChild(fontPicker("body", theme, adapter, redraw));
      root.appendChild(fontUpload(adapter, redraw));

      // details
      var radius = h("input.nx-range", { type: "range", min: 0, max: 32, step: 1, value: theme.radius });
      var radiusVal = h("span.nx-muted", null, theme.radius + " px");
      radius.addEventListener("input", function () {
        radiusVal.textContent = radius.value + " px";
        adapter.set(Object.assign({}, adapter.get(), { radius: Number(radius.value) }), { group: "radius" });
      });
      root.appendChild(h("div.nx-field", null, h("div.nx-field__head", null, h("span.nx-field__label", null, "Runde hjørner"), radiusVal), radius));
      root.appendChild(
        h("div.nx-field", null, h("div.nx-field__head", null, h("span.nx-field__label", null, "Knapper")),
          ui.segmented([["solid", "Fylt"], ["pill", "Pille"], ["outline", "Kontur"]], theme.button, function (v) {
            adapter.set(Object.assign({}, adapter.get(), { button: v }));
          }, { small: true }))
      );
      var upper = h("input", { type: "checkbox", checked: theme.headingCase === "upper" });
      upper.addEventListener("change", function () {
        adapter.set(Object.assign({}, adapter.get(), { headingCase: upper.checked ? "upper" : "none" }));
      });
      root.appendChild(h("label.nx-switch", null, upper, h("span.nx-switch__track"), h("span", null, "Titler med store bokstaver")));
      var btnUpper = h("input", { type: "checkbox", checked: theme.buttonCase === "upper" });
      btnUpper.addEventListener("change", function () {
        adapter.set(Object.assign({}, adapter.get(), { buttonCase: btnUpper.checked ? "upper" : "none" }));
      });
      root.appendChild(h("label.nx-switch", null, btnUpper, h("span.nx-switch__track"), h("span", null, "Knappetekst med store bokstaver")));

      // typography scale
      var scaleSel = h("select.nx-input.nx-select");
      S.TYPE_SCALES.forEach(function (o) { scaleSel.appendChild(h("option", { value: o[0], selected: o[0] === theme.scale }, o[1])); });
      scaleSel.addEventListener("change", function () { adapter.set(Object.assign({}, adapter.get(), { scale: scaleSel.value })); });
      root.appendChild(h("div.nx-field", null, h("div.nx-field__head", null, h("span.nx-field__label", null, "Størrelse på titler")), scaleSel,
        h("p.nx-help", null, "«Magasin» gir store, redaksjonelle titler – fint med en sterk overskriftsskrift.")));
      root.appendChild(
        h("div.nx-field", null, h("div.nx-field__head", null, h("span.nx-field__label", null, "Bokstavavstand i titler")),
          ui.segmented([["tight", "Tett"], ["normal", "Normal"], ["wide", "Luftig"]], theme.tracking || "normal", function (v) {
            adapter.set(Object.assign({}, adapter.get(), { tracking: v }));
          }, { small: true }))
      );

      // ready-made looks
      root.appendChild(presets(adapter, redraw));
    }

    redraw();
    root.refresh = redraw;
    return root;
  }

  /** The project's theme panel (with brand kits). */
  function panel() {
    var root = h("div.nx-stack");
    var kitBox = h("div.nx-kitbar");
    root.appendChild(kitBox);

    function project() {
      return NP.store.get().project;
    }

    function drawKits() {
      ui.clear(kitBox);
      NP.api.brandKits().then(function (r) {
        var kits = r.brandKits || [];
        var sel = h("select.nx-input.nx-select");
        sel.appendChild(h("option", { value: "" }, kits.length ? "Bruk en merkevare …" : "Ingen merkevarer lagret"));
        kits.forEach(function (k) { sel.appendChild(h("option", { value: k.id, selected: k.id === project().brandKit }, k.name)); });
        sel.addEventListener("change", function () {
          var kit = kits.filter(function (k) { return k.id === sel.value; })[0];
          if (!kit) return;
          ui.confirm("Bruke «" + kit.name + "»?", "Farger, skrifter og logo byttes ut med merkevarens. Teksten endres ikke.", "Bruk merkevaren").then(function (ok) {
            if (!ok) return drawKits();
            NP.store.update(function (p) {
              return Object.assign({}, p, {
                brandKit: kit.id,
                theme: kit.theme,
                assets: Object.assign({}, p.assets, kit.assets),
                advertiser: Object.assign({}, p.advertiser, { logo: kit.advertiser.logo || p.advertiser.logo, name: p.advertiser.name || kit.advertiser.name, url: p.advertiser.url || kit.advertiser.url }),
              });
            });
            ui.toast("Merkevaren er brukt", "ok");
            ed.refresh();
          });
        });
        kitBox.appendChild(h("div.nx-row", null, sel, ui.button("Lagre som merkevare", { small: true, icon: "bookmark-plus", onClick: saveKit })));
      });
    }

    function saveKit() {
      var p = project();
      ui.prompt("Lagre som merkevare", "Navn", p.advertiser.name || "", "Lagre").then(function (name) {
        if (!name) return;
        var used = {};
        if (p.advertiser.logo) used[p.advertiser.logo] = p.assets[p.advertiser.logo];
        Object.keys(p.assets).forEach(function (id) { if (p.assets[id].kind === "font") used[id] = p.assets[id]; });
        NP.api.saveBrandKit({ id: p.brandKit || undefined, name: name, advertiser: p.advertiser, theme: p.theme, assets: used }).then(function (r) {
          NP.store.update(function (x) { return Object.assign({}, x, { brandKit: r.brandKit.id }); });
          ui.toast("Merkevaren «" + name + "» er lagret – den kan brukes i nye prosjekter", "ok");
          drawKits();
        }, function (err) { ui.toast(err.message, "err"); });
      });
    }

    var ed = editor({
      get: function () { return project().theme; },
      set: function (theme, opts) {
        NP.store.update(function (p) { return Object.assign({}, p, { theme: theme }); }, opts);
      },
      assets: function () { return project().assets; },
      addAssets: function (list) { NP.store.addAssets(list); },
      logo: {
        get: function () { return project().advertiser.logo; },
        set: function (id) {
          NP.store.update(function (p) { return Object.assign({}, p, { advertiser: Object.assign({}, p.advertiser, { logo: id }) }); });
        },
      },
    });
    root.appendChild(ed);
    drawKits();
    var unsub = NP.store.subscribe(function (s, change) {
      if (change.kind === "project" && change.undo) ed.refresh();
    });
    root.destroy = unsub;
    return root;
  }

  NP.theme = { editor: editor, panel: panel, contrastNotes: contrastNotes, PRESETS: PRESETS };
})();
