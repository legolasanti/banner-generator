/* =========================================================================
   app/publish.js — getting the page out: the ZIP export and (optionally)
   hosting it on ABC design itself under /n/<slug>/.

   Both start with the same check list (preflight.js), so nobody exports a
   page with a button that leads nowhere without being told.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;

  function project() {
    return NP.store.get().project;
  }

  function filenameFrom(res, fallback) {
    var cd = res.headers.get("Content-Disposition") || "";
    var m = /filename="([^"]+)"/.exec(cd);
    return m ? m[1] : fallback;
  }

  function download(btn, status) {
    var p = project();
    btn.disabled = true;
    status.textContent = "Lager ZIP – bilder, skrifter og video pakkes …";
    return NP.store
      .save()
      .then(function () { return fetch(NP.api.exportUrl(p.id), { method: "POST" }); })
      .then(function (res) {
        if (!res.ok) return res.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.error || "Eksporten feilet"); });
        var name = filenameFrom(res, "native.zip");
        return res.blob().then(function (blob) {
          window.WPE.util.saveBlob(blob, name);
          status.textContent = "Ferdig: " + name + " (" + (blob.size / 1048576).toFixed(1).replace(".", ",") + " MB).";
          ui.toast("ZIP-filen er lastet ned", "ok");
        });
      })
      .catch(function (err) {
        status.textContent = err.message;
        ui.toast(err.message, "err");
      })
      .then(function () { btn.disabled = false; });
  }

  function dialog() {
    var p = project();
    var items = NP.preflight.run(p, NP.settings || {});
    var errors = items.filter(function (x) { return x.level === "error"; });
    var status = h("p.nx-muted");
    var dl = ui.button("Last ned ZIP", { kind: "primary", icon: "download", onClick: function () { download(dl, status); } });
    var pubStatus = h("div.nx-stack.nx-stack--sm");

    function drawPublish() {
      ui.clear(pubStatus);
      NP.api.published().then(function (r) {
        var mine = Object.keys(r.published || {}).filter(function (slug) { return r.published[slug].id === p.id; })[0];
        var base = (NP.settings && NP.settings.publicBaseUrl) || location.origin;
        if (mine) {
          var url = base + "/n/" + mine + "/";
          pubStatus.appendChild(h("div.nx-linkbox", null,
            h("input.nx-input.nx-input--sm", { type: "text", value: url, readonly: true }),
            ui.button("", { icon: "copy", small: true, title: "Kopier", onClick: function () { ui.copyText(url, "Adressen"); } }),
            h("a.nx-btn.nx-btn--sm", { href: "/n/" + mine + "/", target: "_blank", rel: "noopener" }, ui.icon("external-link", 15))
          ));
          pubStatus.appendChild(h("p.nx-help", null, "Publisert " + ui.when(r.published[mine].at) + ". Endringer vises først når du publiserer på nytt."));
        }
        pubStatus.appendChild(h("div.nx-row", null,
          ui.button(mine ? "Publiser endringene" : "Publiser her", { icon: "globe", onClick: function () {
            NP.store.save().then(function () { return NP.api.publish(p.id); }).then(function (res) {
              NP.store.adopt({ status: "published" });
              ui.toast("Publisert på " + res.path, "ok");
              drawPublish();
            }, function (err) { ui.toast(err.message, "err"); });
          } }),
          mine ? ui.button("Avpubliser", { kind: "ghost", onClick: function () {
            ui.confirm("Avpublisere?", "Siden slutter å virke på " + base + "/n/" + mine + "/.", "Avpubliser", true).then(function (ok) {
              if (!ok) return;
              NP.api.unpublish(p.id).then(function () {
                NP.store.adopt({ status: "approved" });
                ui.toast("Siden er avpublisert", "ok");
                drawPublish();
              });
            });
          } }) : null
        ));
      });
    }

    var m = ui.modal({
      title: "Eksporter og publiser",
      wide: true,
      body: h(
        "div.nx-stack",
        null,
        errors.length
          ? h("div.nx-note.nx-note--warn", null, ui.icon("circle-alert", 16), " Kontrollen fant " + errors.length + " feil. Du kan eksportere likevel, men se over listen.")
          : null,
        items.length ? h("details.nx-details", { open: errors.length > 0 }, h("summary", null, "Kontroll: " + items.length + " punkter"), NP.preflight.list(items, function (it) { m.close(); NP.preflight.go(it); })) : null,
        h("h3.nx-panel__h", null, "ZIP til egen server"),
        h("p.nx-muted", null, "En ferdig mappe med index.html" + (p.pages.length > 1 ? " og en undermappe per variant" : "") + ", bilder i flere størrelser, skrifter, video og skript. Last opp mappen der siden skal ligge."),
        !p.meta.publicUrl ? h("p.nx-note", null, ui.icon("info", 15), " Fyll inn «Endelig adresse» under Prosjekt → Deling for riktig delingsbilde og canonical.") : null,
        h("div.nx-row", null, dl),
        status,
        h("h3.nx-panel__h", null, "Publiser fra ABC design"),
        h("p.nx-muted", null, "ABC design kan også vise siden selv, på /n/<adresse>/. Nyttig for testing og når verktøyet ligger på en server med eget domene."),
        pubStatus
      ),
      actions: [ui.button("Lukk", { kind: "ghost", onClick: function () { m.close(); } })],
    });
    drawPublish();
  }

  NP.publish = { dialog: dialog };
})();
