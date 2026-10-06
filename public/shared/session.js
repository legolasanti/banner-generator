/* =========================================================================
   shared/session.js — shows who is signed in (and "Logg ut") in the top bar
   of both areas, when logins are switched on. Does nothing otherwise.
   ========================================================================= */
(function () {
  "use strict";
  fetch("/api/me")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (me) {
      if (!me || !me.auth || !me.user) return;
      var bar = document.querySelector(".topbar");
      if (!bar) return;
      var form = document.createElement("form");
      form.method = "post";
      form.action = "/logout";
      form.className = "session";
      var who = document.createElement("span");
      who.className = "session__name";
      who.textContent = me.user.name;
      who.title = me.user.username + (me.user.role === "admin" ? " (administrator)" : "");
      var btn = document.createElement("button");
      btn.type = "submit";
      btn.className = "session__out";
      btn.textContent = "Logg ut";
      form.appendChild(who);
      form.appendChild(btn);
      bar.appendChild(form);
    })
    .catch(function () {});
})();
