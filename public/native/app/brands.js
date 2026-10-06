/* =========================================================================
   app/brands.js — Merkevarer: one brand kit per advertiser (logo, colours,
   fonts, button style), made once and used by every project for them.
   The kit editor is the same theme editor the projects use (theme.js).
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var S = window.NativeSchema;
  var D = window.NativeDoc;

  function swatches(theme) {
    return h("span.nx-kit__sw", null, ["primary", "accent", "dark", "soft"].map(function (k) {
      return h("span", { style: { background: theme.colors[k] }, title: k });
    }));
  }

  function editKit(kit, onSaved) {
    var draft = JSON.parse(JSON.stringify(kit || {
      name: "",
      advertiser: { name: "", url: "", logo: "" },
      theme: S.DEFAULT_THEME,
      assets: {},
    }));
    var name = h("input.nx-input", { type: "text", value: draft.name || "", placeholder: "F.eks. Ford", maxlength: 80 });
    var url = h("input.nx-input", { type: "url", value: draft.advertiser.url || "", placeholder: "https://" });
    var notes = h("textarea.nx-input.nx-textarea", { rows: 2, placeholder: "Notater: tone, ting å unngå, kontaktperson …" });
    notes.value = draft.notes || "";

    // The kit editor uploads into the kit's own asset list (no project open).
    function pickImage() {
      return new Promise(function (resolve) {
        var input = h("input", { type: "file", accept: "image/png,image/webp,image/jpeg" });
        input.addEventListener("change", function () {
          if (!input.files[0]) return resolve(null);
          NP.api.upload("/api/native/assets/image", input.files[0], {}).then(function (r) {
            draft.assets[r.asset.id] = r.asset;
            resolve(r.asset.id);
          }, function (err) { ui.toast(err.message, "err"); resolve(null); });
        });
        input.click();
      });
    }

    var ed = NP.theme.editor({
      get: function () { return draft.theme; },
      set: function (t) { draft.theme = t; },
      assets: function () { return draft.assets; },
      addAssets: function (list) { list.forEach(function (a) { draft.assets[a.id] = a; }); },
      logo: {
        get: function () { return draft.advertiser.logo; },
        set: function (id) { draft.advertiser.logo = id; },
      },
      pickImage: pickImage,
    });

    var m = ui.modal({
      title: kit ? "Rediger merkevare" : "Ny merkevare",
      wide: true,
      body: h(
        "div.nx-stack",
        null,
        h("div.nx-grid2", null,
          h("label.nx-field", null, h("span.nx-field__label", null, "Navn (annonsør)"), name),
          h("label.nx-field", null, h("span.nx-field__label", null, "Nettside"), url)
        ),
        ed,
        h("label.nx-field", null, h("span.nx-field__label", null, "Notater"), notes)
      ),
      actions: [
        ui.button("Avbryt", { kind: "ghost", onClick: function () { m.close(); } }),
        ui.button("Lagre merkevaren", { kind: "primary", onClick: function () {
          if (!name.value.trim()) return ui.toast("Gi merkevaren et navn", "err");
          draft.name = name.value.trim();
          draft.advertiser.name = draft.advertiser.name || draft.name;
          draft.advertiser.url = D.safeUrl(url.value.trim());
          draft.notes = notes.value;
          NP.api.saveBrandKit(draft).then(function () {
            ui.toast("Merkevaren er lagret", "ok");
            m.close();
            onSaved();
          }, function (err) { ui.toast(err.message, "err"); });
        } }),
      ],
    });
  }

  function view(host) {
    var root = h("div.nx-page");
    var grid = h("div.nx-kits");
    root.appendChild(h("div.nx-page__head", null,
      h("div", null, h("h1", null, "Merkevarer"), h("p.nx-muted", null, "Logo, farger og skrifter per annonsør. Velg merkevaren når du lager et nytt prosjekt.")),
      ui.button("Ny merkevare", { kind: "primary", icon: "plus", onClick: function () { editKit(null, load); } })
    ));
    root.appendChild(grid);
    host.appendChild(root);

    function load() {
      ui.clear(grid);
      NP.api.brandKits().then(function (r) {
        var kits = r.brandKits || [];
        if (!kits.length) {
          grid.appendChild(ui.empty("palette", "Ingen merkevarer ennå", "Lag en merkevare for annonsører dere jobber med ofte – da får nye saker riktig uttrykk med én gang."));
          return;
        }
        kits.forEach(function (k) {
          var logo = k.advertiser.logo && k.assets[k.advertiser.logo];
          grid.appendChild(
            h(
              "div.nx-kit",
              null,
              h("div.nx-kit__logo", null, logo ? h("img", { src: ui.thumb(logo, k.advertiser.logo, 320), alt: k.name }) : h("strong", null, k.name)),
              h("div.nx-kit__body", null,
                h("strong", null, k.name),
                h("span.nx-muted", null, k.theme.fonts.heading.family + " / " + k.theme.fonts.body.family),
                swatches(k.theme)
              ),
              h("div.nx-row", null,
                ui.button("Rediger", { small: true, onClick: function () { editKit(k, load); } }),
                ui.button("", { small: true, kind: "ghost", icon: "trash", title: "Slett", onClick: function () {
                  ui.confirm("Slette «" + k.name + "»?", "Prosjekter som bruker merkevaren beholder fargene sine.", "Slett", true).then(function (ok) {
                    if (ok) NP.api.deleteBrandKit(k.id).then(load);
                  });
                } })
              )
            )
          );
        });
      });
    }
    load();
  }

  NP.brands = { view: view };
})();
