/* =========================================================================
   app/publish.js — getting the page out: the ZIP export and (optionally)
   hosting it on ABC design itself under /n/<slug>/.

   Both start with the same check list (preflight.js), so nobody exports a
   page with a button that leads nowhere without being told.

   The ZIP is downloaded by the browser itself (a form posted into a hidden
   frame), so a page with several hundred MB of video streams straight to
   disk instead of being held in memory first. An error answer lands in the
   frame instead of a download, and is shown as a message.

   Publishing a version the advertiser has not approved asks first.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;

  function project() {
    return NP.store.get().project;
  }

  var ERROR_WAIT_MS = 10 * 60 * 1000;

  /**
   * POST to `url` as a normal browser download. Resolves when the request
   * is on its way; `onError(message)` runs if the server answers with an
   * error page instead of the file.
   */
  function browserDownload(url, onError) {
    var name = "np-dl-" + Date.now();
    var frame = h("iframe", { name: name, hidden: true, title: "Nedlasting" });
    var form = h("form", { method: "POST", action: url, target: name, hidden: true });
    function cleanup() {
      clearTimeout(timer);
      frame.remove();
      form.remove();
    }
    // A download never loads the frame; an error answer (JSON) does.
    frame.addEventListener("load", function () {
      var text = "";
      try {
        text = frame.contentDocument.body.textContent || "";
      } catch (_) {
        /* not readable: nothing to show */
      }
      var msg = "Eksporten feilet";
      try {
        msg = JSON.parse(text).error || msg;
      } catch (_) {
        /* not JSON */
      }
      if (text) onError(msg);
      cleanup();
    });
    var timer = setTimeout(cleanup, ERROR_WAIT_MS);
    document.body.appendChild(frame);
    document.body.appendChild(form);
    form.submit();
  }

  function download(btn, status) {
    var p = project();
    btn.disabled = true;
    status.textContent = "Lagrer …";
    return NP.store
      .save()
      .then(function () {
        status.textContent = "Lager ZIP – bilder, skrifter og video pakkes. Nedlastingen starter av seg selv når filen er klar.";
        browserDownload(NP.api.exportUrl(p.id), function (msg) {
          status.textContent = msg;
          ui.toast(msg, "err");
        });
        ui.toast("Eksporten er startet", "ok");
      })
      .catch(function (err) {
        status.textContent = err.message;
        ui.toast(err.message, "err");
      })
      .then(function () {
        // Not twice in a row by accident; the download runs on its own.
        setTimeout(function () { btn.disabled = false; }, 4000);
      });
  }

  /** Why this version is not approved by the advertiser, or "" when it is. */
  function notApproved(p) {
    if (p.status === "approved" || p.status === "published") return "";
    if (!p.review) return "Siden har ikke vært sendt til annonsøren for gjennomgang.";
    if (p.status === "review") return "Runde " + p.review.round + " venter fortsatt på godkjenning fra annonsøren.";
    return "Siden er endret etter runde " + p.review.round + ", så annonsøren har ikke sett denne versjonen.";
  }

  /** Publishing a version the advertiser has not approved needs a yes. */
  function confirmUnapproved(p) {
    var why = notApproved(p);
    if (!why) return Promise.resolve(true);
    return ui.confirm("Publisere uten godkjenning?", why + " Vil du publisere likevel?", "Publiser likevel", true);
  }

  function publish(p, done) {
    confirmUnapproved(project()).then(function (ok) {
      if (!ok) return;
      return NP.store.save().then(function () { return NP.api.publish(p.id); }).then(function (res) {
        NP.store.adopt({ status: "published" });
        ui.toast("Publisert på " + res.path, "ok");
        done();
      });
    }).catch(function (err) { ui.toast(err.message, "err"); });
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
          ui.button(mine ? "Publiser endringene" : "Publiser her", { icon: "globe", onClick: function () { publish(p, drawPublish); } }),
          mine ? ui.button("Avpubliser", { kind: "ghost", onClick: function () {
            ui.confirm("Avpublisere?", "Siden slutter å virke på " + base + "/n/" + mine + "/.", "Avpubliser", true).then(function (ok) {
              if (!ok) return;
              NP.api.unpublish(p.id).then(function (r) {
                NP.store.adopt({ status: r.status || "draft" });
                ui.toast("Siden er avpublisert", "ok");
                drawPublish();
              }, function (err) { ui.toast(err.message, "err"); });
            });
          } }) : null
        ));
      }, function (err) {
        pubStatus.appendChild(h("p.nx-muted", null, err.message));
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
        notApproved(p) ? h("p.nx-note.nx-note--warn", null, ui.icon("circle-alert", 15), " Ikke godkjent: " + notApproved(p)) : null,
        h("p.nx-muted", null, "ABC design kan også vise siden selv, på /n/<adresse>/. Nyttig for testing og når verktøyet ligger på en server med eget domene."),
        pubStatus
      ),
      actions: [ui.button("Lukk", { kind: "ghost", onClick: function () { m.close(); } })],
    });
    drawPublish();
  }

  NP.publish = { dialog: dialog };
})();
