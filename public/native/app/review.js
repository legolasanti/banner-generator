/* =========================================================================
   app/review.js — "Gjennomgang": review rounds, comments and versions.

   Sending to review freezes the current state as a numbered round and gives
   a link the advertiser can open without logging in. They pin comments to
   the page and approve with their name. Edits made afterwards stay in the
   editor until the next round is sent, so the advertiser never reviews a
   moving target.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var S = window.NativeSchema;
  var D = window.NativeDoc;

  function project() {
    return NP.store.get().project;
  }

  function absolute(path) {
    return location.origin + path;
  }

  function sectionName(id) {
    var f = id && D.findSection(project(), id);
    return f ? (f.index + 1) + ". " + S.BLOCKS[f.section.type].label + (project().pages.length > 1 ? " (" + f.page.label + ")" : "") : "";
  }

  function sendRound(onDone) {
    return NP.store.save().then(function () {
      var items = NP.preflight.run(project(), NP.settings || {});
      var errors = items.filter(function (x) { return x.level === "error"; });
      var ask = errors.length
        ? ui.confirm("Sende med " + errors.length + " feil?", "Kontrollen fant feil, f.eks.: " + errors[0].text + " Vil du sende likevel?", "Send likevel", true)
        : Promise.resolve(true);
      return ask.then(function (ok) {
        if (!ok) return;
        return NP.api.startReview(project().id).then(function (r) {
          NP.store.adopt({ review: r.review, status: r.status, rev: r.rev });
          ui.copyText(absolute(r.url), "Lenken");
          ui.toast("Runde " + r.review.round + " er sendt – lenken er kopiert", "ok");
          if (onDone) onDone();
        });
      });
    }).catch(function (err) { ui.toast(err.message, "err"); });
  }

  function commentNode(c, all, refresh) {
    var replies = all.filter(function (x) { return x.parent === c.id; });
    var resolved = h("input", { type: "checkbox", checked: c.resolved });
    resolved.addEventListener("change", function () {
      NP.api.resolveComment(project().id, c.id, resolved.checked).then(refresh, function (err) { ui.toast(err.message, "err"); });
    });
    var reply = h("input.nx-input.nx-input--sm", { type: "text", placeholder: "Svar …" });
    reply.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || !reply.value.trim()) return;
      NP.api.addComment(project().id, { text: reply.value.trim(), parent: c.id, round: c.round, anchor: c.anchor }).then(refresh, function (err) { ui.toast(err.message, "err"); });
    });
    return h(
      "div.nx-comment" + (c.resolved ? ".is-done" : "") + (c.from === "client" ? ".is-client" : ""),
      null,
      h(
        "div.nx-comment__head",
        null,
        h("strong", null, c.author),
        h("span.nx-tag" + (c.from === "client" ? ".nx-tag--client" : ""), null, c.from === "client" ? "Kunde" : "Teamet"),
        h("span.nx-muted", null, "Runde " + c.round + " · " + ui.when(c.at)),
        h("label.nx-check.nx-comment__done", { title: "Løst" }, resolved, " Løst")
      ),
      c.anchor && c.anchor.section
        ? h("button.nx-comment__where", { type: "button", on: { click: function () {
            if (c.anchor.page) NP.store.setPage(c.anchor.page);
            NP.store.select(c.anchor.section);
          } } }, ui.icon("map-pin", 13), " ", sectionName(c.anchor.section) || "Seksjonen finnes ikke lenger", c.anchor.excerpt ? " – «" + c.anchor.excerpt + "»" : "", c.anchor.device && c.anchor.device !== "desktop" ? " (" + c.anchor.device + ")" : "")
        : null,
      h("p.nx-comment__text", null, c.text),
      replies.map(function (r) {
        return h("div.nx-comment__reply", null, h("strong", null, r.author), " ", h("span.nx-muted", null, ui.when(r.at)), h("p", null, r.text));
      }),
      reply
    );
  }

  function panel() {
    var root = h("div.nx-stack");

    function draw() {
      ui.clear(root);
      var p = project();
      var rv = p.review;
      root.appendChild(h("div.nx-statusline", null, h("span.nx-status.is-" + p.status, null, D.STATUS_LABELS[p.status]), rv ? h("span.nx-muted", null, "Runde " + rv.round + " sendt " + ui.when(rv.sentAt)) : null));
      if (rv) {
        var url = absolute("/p/" + rv.token + "/");
        root.appendChild(
          h(
            "div.nx-linkbox",
            null,
            h("input.nx-input.nx-input--sm", { type: "text", value: url, readonly: true, on: { focus: function (e) { e.target.select(); } } }),
            ui.button("", { icon: "copy", small: true, title: "Kopier lenken", onClick: function () { ui.copyText(url, "Lenken"); } }),
            h("a.nx-btn.nx-btn--sm", { href: url, target: "_blank", rel: "noopener", title: "Åpne som kunden ser den" }, ui.icon("external-link", 15))
          )
        );
        root.appendChild(h("p.nx-help", null, "Kunden ser runde " + rv.round + " slik den var da du sendte den. Nye endringer vises først når du sender en ny runde."));
      } else {
        root.appendChild(h("p.nx-help", null, "Send en lenke til annonsøren. De kan kommentere direkte på siden og godkjenne med navnet sitt – uten å logge inn."));
      }
      root.appendChild(
        h(
          "div.nx-row",
          null,
          ui.button(rv ? "Send ny runde" : "Send til gjennomgang", { icon: "send", kind: "primary", onClick: function () { sendRound(draw); } }),
          rv ? ui.button("Trekk tilbake lenken", { small: true, kind: "ghost", onClick: function () {
            ui.confirm("Trekke tilbake lenken?", "Den gamle lenken slutter å virke. Neste runde får en ny lenke.", "Trekk tilbake", true).then(function (ok) {
              if (!ok) return;
              NP.api.revokeReview(p.id).then(function (r) {
                NP.store.adopt({ review: r.review, rev: r.rev });
                ui.toast("Lenken er trukket tilbake", "ok");
                draw();
              });
            });
          } }) : null
        )
      );

      var commentsBox = h("div.nx-stack.nx-stack--sm");
      root.appendChild(h("h3.nx-panel__h", null, "Kommentarer"));
      root.appendChild(commentsBox);
      var newC = h("textarea.nx-input.nx-textarea", { rows: 2, placeholder: "Intern kommentar til teamet …" });
      root.appendChild(
        h(
          "div.nx-stack.nx-stack--sm",
          null,
          newC,
          ui.button("Legg til kommentar", { small: true, onClick: function () {
            if (!newC.value.trim()) return;
            var sel = NP.store.get().selected;
            NP.api.addComment(p.id, {
              text: newC.value.trim(),
              round: rv ? rv.round : 0,
              anchor: sel ? { section: sel, page: NP.store.get().pageId } : null,
            }).then(function () {
              newC.value = "";
              loadComments();
            }, function (err) { ui.toast(err.message, "err"); });
          } }),
          h("p.nx-help", null, "Er en seksjon valgt, festes kommentaren til den.")
        )
      );

      function loadComments() {
        ui.clear(commentsBox);
        commentsBox.appendChild(ui.spinner());
        NP.api.comments(p.id).then(function (data) {
          ui.clear(commentsBox);
          (data.approvals || []).slice().reverse().forEach(function (a) {
            commentsBox.appendChild(h("div.nx-note.nx-note--ok", null, ui.icon("badge-check", 16), " Godkjent av ", h("strong", null, a.name), " (runde " + a.round + ", " + ui.when(a.at) + ")"));
          });
          var top = data.comments.filter(function (c) { return !c.parent; }).reverse();
          var open = top.filter(function (c) { return !c.resolved; });
          var done = top.filter(function (c) { return c.resolved; });
          if (!top.length) commentsBox.appendChild(h("p.nx-muted", null, "Ingen kommentarer ennå."));
          open.forEach(function (c) { commentsBox.appendChild(commentNode(c, data.comments, loadComments)); });
          if (done.length) {
            var det = h("details.nx-details", null, h("summary", null, done.length + " løste"));
            done.forEach(function (c) { det.appendChild(commentNode(c, data.comments, loadComments)); });
            commentsBox.appendChild(det);
          }
          NP.editor && NP.editor.setBadge && NP.editor.setBadge("review", open.length);
        }, function (err) {
          ui.clear(commentsBox);
          commentsBox.appendChild(h("p.nx-muted", null, err.message));
        });
      }
      loadComments();

      // versions
      root.appendChild(h("h3.nx-panel__h", null, "Versjoner"));
      var vbox = h("div.nx-versions");
      root.appendChild(
        ui.button("Lagre versjon nå", { small: true, icon: "save", onClick: function () {
          ui.prompt("Lagre versjon", "Navn på versjonen", "Før endringer fra kunden", "Lagre").then(function (label) {
            if (label === null) return;
            NP.store.save().then(function () { return NP.api.snapshot(p.id, label); }).then(function () {
              ui.toast("Versjonen er lagret", "ok");
              loadVersions();
            }, function (err) { ui.toast(err.message, "err"); });
          });
        } })
      );
      root.appendChild(vbox);
      var KIND = { auto: "Automatisk", manual: "Lagret", review: "Gjennomgang", publish: "Publisert", export: "Eksportert", restore: "Før gjenoppretting" };
      function loadVersions() {
        ui.clear(vbox);
        NP.api.versions(p.id).then(function (r) {
          if (!r.versions.length) vbox.appendChild(h("p.nx-muted", null, "Ingen versjoner ennå. Det lagres automatisk en versjon hvert 10. minutt mens du jobber."));
          r.versions.slice(0, 40).forEach(function (v) {
            vbox.appendChild(
              h(
                "div.nx-version",
                null,
                h("span.nx-version__label", null, v.label || KIND[v.kind] || v.kind),
                h("span.nx-muted", null, ui.when(v.at) + (v.by ? " · " + v.by : "")),
                ui.button("Gjenopprett", { small: true, kind: "ghost", onClick: function () {
                  ui.confirm("Gjenopprette denne versjonen?", "Siden blir slik den var " + ui.when(v.at) + ". Nåværende tilstand lagres først som en egen versjon, så ingenting går tapt.", "Gjenopprett").then(function (ok) {
                    if (!ok) return;
                    NP.store.save().then(function () { return NP.api.restore(p.id, v.file); }).then(function (res) {
                      NP.store.load(res.project);
                      ui.toast("Versjonen er gjenopprettet", "ok");
                    }, function (err) { ui.toast(err.message, "err"); });
                  });
                } })
              )
            );
          });
        });
      }
      loadVersions();
    }

    draw();
    var unsub = NP.store.subscribe(function (s, change) {
      if (change.kind === "meta") draw();
    });
    root.destroy = unsub;
    return root;
  }

  NP.review = { panel: panel, sendRound: sendRound };
})();
