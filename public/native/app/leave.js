/* =========================================================================
   app/leave.js — leaving the editor inside the app (a tab in the top bar,
   the browser's Back button, any other address) must not drop edits that
   are not on the server. The browser's own "leave page?" question only
   covers closing or reloading the tab.

   confirm() tries to save first. If that cannot be done — a colleague saved
   in between, or the network is down — it asks: keep my version as a copy,
   leave without saving, or stay.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;

  /** Ask what to do with edits that could not be saved. Resolves true to leave. */
  function ask(err) {
    return new Promise(function (resolve) {
      var answered = false;
      function answer(leave) {
        answered = true;
        resolve(leave);
        m.close();
      }
      var conflict = NP.store.get().save === "conflict";
      var m = ui.modal({
        title: "Endringene dine er ikke lagret",
        sticky: true,
        body: h("p", null, (conflict
          ? "En kollega har lagret prosjektet etter at du åpnet det, så endringene dine kunne ikke lagres."
          : "Siden kunne ikke lagres" + (err && err.message ? " (" + err.message + ")" : "") + ".") +
          " Går du videre nå, mister du dem – med mindre du lagrer din versjon som et eget prosjekt."),
        onClose: function () {
          if (!answered) resolve(false);
        },
        actions: [
          ui.button("Bli her", { kind: "ghost", onClick: function () { answer(false); } }),
          ui.button("Forlat uten å lagre", { kind: "danger", onClick: function () { answer(true); } }),
          ui.button("Lagre min versjon som kopi", { kind: "primary", onClick: function () {
            NP.store.saveAsCopy().then(function (p) {
              ui.toast("Din versjon er lagret som «" + p.name + "»", "ok");
              answer(true);
            }, function (e) {
              ui.toast(e.message, "err");
            });
          } }),
        ],
      });
    });
  }

  /** May the editor be closed now? Resolves true when nothing would be lost (or the user chose so). */
  function confirm() {
    if (!NP.store.get() || !NP.store.hasUnsaved()) return Promise.resolve(true);
    return NP.store.save().then(function () { return true; }, ask);
  }

  NP.leave = { confirm: confirm };
})();
