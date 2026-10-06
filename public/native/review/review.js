/* =========================================================================
   review.js — the advertiser's side of a review link (/p/<token>/).

   Loaded on top of the real page. Adds a bar at the bottom with
   "Kommenter" and "Godkjenn":
     - Kommenter: click anywhere on the page, write a comment. It is pinned
       to that spot (section + relative position + the text clicked), so the
       team sees exactly what it is about, also on mobile.
     - Godkjenn: approve this round with your name.
   Existing comments for the round show as numbered pins.

   No framework, no dependencies; talks only to /api/review/<token>.
   ========================================================================= */
(function () {
  "use strict";

  var boot = window.NP_REVIEW;
  if (!boot) return;
  var API = "/api/review/" + encodeURIComponent(boot.token);
  var NAME_KEY = "np-review-name";
  var doc = document;
  var commenting = false;
  var comments = [];

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function storedName() {
    try {
      return localStorage.getItem(NAME_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function rememberName(n) {
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch (_) {
      /* private mode: just ask again next time */
    }
  }

  function post(path, body) {
    return fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var err = new Error(data.error || "Noe gikk galt (" + r.status + ")");
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function device() {
    var w = window.innerWidth;
    return w < 600 ? "mobile" : w < 1024 ? "tablet" : "desktop";
  }

  // ---- the bar ------------------------------------------------------------------
  var bar = el("div", "npr-bar");
  var info = el("div", "npr-bar__info");
  info.appendChild(el("strong", null, "Forhåndsvisning for godkjenning"));
  info.appendChild(el("span", null, (boot.advertiser ? boot.advertiser + " · " : "") + "runde " + boot.round));
  var commentBtn = el("button", "npr-btn", "Kommenter");
  commentBtn.type = "button";
  var listBtn = el("button", "npr-btn npr-btn--ghost", "Alle kommentarer");
  listBtn.type = "button";
  var approveBtn = el("button", "npr-btn npr-btn--primary", "Godkjenn");
  approveBtn.type = "button";
  var acts = el("div", "npr-bar__acts");
  acts.appendChild(listBtn);
  acts.appendChild(commentBtn);
  acts.appendChild(approveBtn);
  bar.appendChild(info);
  bar.appendChild(acts);
  doc.body.appendChild(bar);
  doc.body.classList.add("npr-on");

  var hint = el("div", "npr-hint", "Klikk på det du vil kommentere. Esc avbryter.");
  doc.body.appendChild(hint);

  function setCommenting(on) {
    commenting = on;
    doc.body.classList.toggle("npr-commenting", on);
    commentBtn.textContent = on ? "Avbryt" : "Kommenter";
    commentBtn.classList.toggle("is-on", on);
  }

  commentBtn.addEventListener("click", function () {
    closePopup();
    setCommenting(!commenting);
  });
  doc.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      setCommenting(false);
      closePopup();
    }
  });

  // ---- popups -------------------------------------------------------------------
  var popup = null;
  function closePopup() {
    if (popup) popup.remove();
    popup = null;
  }

  function placePopup(node, x, y) {
    doc.body.appendChild(node);
    var w = node.offsetWidth;
    var hgt = node.offsetHeight;
    var left = Math.max(10, Math.min(window.innerWidth - w - 10, x - w / 2));
    var top = y + 14;
    if (top + hgt > window.innerHeight - 80) top = Math.max(10, y - hgt - 14);
    node.style.left = left + "px";
    node.style.top = top + "px";
  }

  function nameField() {
    var input = el("input", "npr-input");
    input.type = "text";
    input.placeholder = "Navnet ditt";
    input.value = storedName();
    input.maxLength = 80;
    return input;
  }

  // Click while commenting → comment form at that point.
  doc.addEventListener(
    "click",
    function (e) {
      if (!commenting) return;
      if (bar.contains(e.target) || (popup && popup.contains(e.target))) return;
      e.preventDefault();
      e.stopPropagation();
      var sec = e.target.closest && e.target.closest(".np-sec");
      var rect = sec ? sec.getBoundingClientRect() : null;
      var anchor = {
        section: sec ? sec.id.replace(/^np-/, "") : "",
        page: boot.page,
        x: rect ? (e.clientX - rect.left) / rect.width : 0,
        y: rect ? (e.clientY - rect.top) / rect.height : 0,
        excerpt: (e.target.innerText || e.target.alt || "").replace(/\s+/g, " ").trim().slice(0, 150),
        device: device(),
      };
      setCommenting(false);
      openForm(anchor, e.clientX, e.clientY);
    },
    true
  );

  function openForm(anchor, x, y) {
    closePopup();
    var box = el("div", "npr-pop");
    var title = el("strong", null, "Ny kommentar");
    var name = nameField();
    var text = el("textarea", "npr-input");
    text.rows = 4;
    text.placeholder = anchor.excerpt ? "Om «" + anchor.excerpt.slice(0, 60) + (anchor.excerpt.length > 60 ? "…" : "") + "»" : "Hva vil du endre?";
    text.maxLength = 2000;
    var err = el("p", "npr-err");
    var send = el("button", "npr-btn npr-btn--primary", "Send");
    send.type = "button";
    var cancel = el("button", "npr-btn npr-btn--ghost", "Avbryt");
    cancel.type = "button";
    var row = el("div", "npr-row");
    row.appendChild(cancel);
    row.appendChild(send);
    [title, name, text, err, row].forEach(function (n) { box.appendChild(n); });
    cancel.addEventListener("click", closePopup);
    send.addEventListener("click", function () {
      if (name.value.trim().length < 2) return (err.textContent = "Skriv navnet ditt.");
      if (!text.value.trim()) return (err.textContent = "Skriv en kommentar.");
      send.disabled = true;
      rememberName(name.value.trim());
      post("/comments", { author: name.value.trim(), text: text.value.trim(), anchor: anchor })
        .then(function (r) {
          comments.push(r.comment);
          drawPins();
          closePopup();
          toast("Takk! Kommentaren er sendt til ABC BrandStudio.");
        })
        .catch(function (e2) {
          err.textContent = e2.message;
          send.disabled = false;
        });
    });
    popup = box;
    placePopup(box, x, y);
    (name.value ? text : name).focus();
  }

  // ---- pins -----------------------------------------------------------------------
  var pinLayer = el("div", "npr-pins");
  doc.body.appendChild(pinLayer);

  function drawPins() {
    pinLayer.innerHTML = "";
    var n = 0;
    comments.forEach(function (c) {
      if (c.parent || !c.anchor || !c.anchor.section || (c.anchor.page && c.anchor.page !== boot.page)) return;
      n++;
      var sec = doc.getElementById("np-" + c.anchor.section);
      if (!sec) return;
      var pin = el("button", "npr-pin" + (c.resolved ? " is-done" : "") + (c.from === "team" ? " is-team" : ""), String(n));
      pin.type = "button";
      pin.title = c.author + ": " + c.text.slice(0, 80);
      pin.addEventListener("click", function (e) {
        e.stopPropagation();
        showComment(c, e.clientX, e.clientY);
      });
      pin.__sec = sec;
      pin.__c = c;
      pinLayer.appendChild(pin);
    });
    positionPins();
  }

  function positionPins() {
    Array.prototype.forEach.call(pinLayer.children, function (pin) {
      var r = pin.__sec.getBoundingClientRect();
      var x = r.left + pin.__c.anchor.x * r.width + window.scrollX;
      var y = r.top + pin.__c.anchor.y * r.height + window.scrollY;
      pin.style.left = x + "px";
      pin.style.top = y + "px";
      pin.style.display = r.height ? "" : "none";
    });
  }
  window.addEventListener("resize", positionPins);
  window.addEventListener("load", positionPins);
  setInterval(positionPins, 1500); // lazy images change section heights

  function showComment(c, x, y) {
    closePopup();
    var box = el("div", "npr-pop");
    box.appendChild(el("strong", null, c.author + (c.from === "team" ? " (ABC)" : "")));
    box.appendChild(el("p", "npr-text", c.text));
    comments.filter(function (r) { return r.parent === c.id; }).forEach(function (r) {
      var rep = el("div", "npr-reply");
      rep.appendChild(el("strong", null, r.author));
      rep.appendChild(el("p", "npr-text", r.text));
      box.appendChild(rep);
    });
    if (c.resolved) box.appendChild(el("p", "npr-muted", "Markert som løst."));
    var close = el("button", "npr-btn npr-btn--ghost", "Lukk");
    close.type = "button";
    close.addEventListener("click", closePopup);
    box.appendChild(close);
    popup = box;
    placePopup(box, x, y);
  }

  // ---- list of all comments ---------------------------------------------------------
  listBtn.addEventListener("click", function () {
    closePopup();
    var box = el("div", "npr-pop npr-pop--list");
    box.appendChild(el("strong", null, "Kommentarer i runde " + boot.round));
    var top = comments.filter(function (c) { return !c.parent; });
    if (!top.length) box.appendChild(el("p", "npr-muted", "Ingen kommentarer ennå. Trykk «Kommenter» og klikk på siden."));
    top.forEach(function (c, i) {
      var item = el("button", "npr-item" + (c.resolved ? " is-done" : ""));
      item.type = "button";
      item.appendChild(el("strong", null, (i + 1) + ". " + c.author));
      item.appendChild(el("span", null, c.text.slice(0, 140)));
      item.addEventListener("click", function () {
        var sec = c.anchor && doc.getElementById("np-" + c.anchor.section);
        closePopup();
        if (sec) sec.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      box.appendChild(item);
    });
    var close = el("button", "npr-btn npr-btn--ghost", "Lukk");
    close.type = "button";
    close.addEventListener("click", closePopup);
    box.appendChild(close);
    popup = box;
    doc.body.appendChild(box);
  });

  // ---- approve ----------------------------------------------------------------------
  approveBtn.addEventListener("click", function () {
    closePopup();
    setCommenting(false);
    var box = el("div", "npr-pop npr-pop--center");
    box.appendChild(el("strong", null, "Godkjenn runde " + boot.round));
    box.appendChild(el("p", "npr-muted", "Du godkjenner siden slik den ser ut nå, inkludert tekst, bilder og lenker. Godkjenningen lagres med navnet ditt og tidspunktet."));
    var name = nameField();
    var err = el("p", "npr-err");
    var ok = el("button", "npr-btn npr-btn--primary", "Godkjenn");
    ok.type = "button";
    var cancel = el("button", "npr-btn npr-btn--ghost", "Avbryt");
    cancel.type = "button";
    var row = el("div", "npr-row");
    row.appendChild(cancel);
    row.appendChild(ok);
    [name, err, row].forEach(function (n) { box.appendChild(n); });
    cancel.addEventListener("click", closePopup);
    ok.addEventListener("click", function () {
      if (name.value.trim().length < 2) return (err.textContent = "Skriv navnet ditt.");
      ok.disabled = true;
      rememberName(name.value.trim());
      post("/approve", { name: name.value.trim(), round: boot.round })
        .then(function () {
          closePopup();
          markApproved(name.value.trim());
          toast("Takk! Siden er godkjent.");
        })
        .catch(function (e2) {
          err.textContent = e2.status === 409 ? "Det finnes en nyere versjon. Last inn siden på nytt." : e2.message;
          ok.disabled = false;
        });
    });
    popup = box;
    doc.body.appendChild(box);
    name.focus();
  });

  function markApproved(by) {
    approveBtn.disabled = true;
    approveBtn.textContent = "Godkjent" + (by ? " av " + by : "");
    approveBtn.classList.add("is-done");
  }

  function toast(text) {
    var t = el("div", "npr-toast", text);
    doc.body.appendChild(t);
    setTimeout(function () { t.classList.add("is-out"); }, 3800);
    setTimeout(function () { t.remove(); }, 4300);
  }

  // ---- load --------------------------------------------------------------------------
  fetch(API)
    .then(function (r) { return r.ok ? r.json() : { comments: [], approvals: [] }; })
    .then(function (data) {
      comments = (data.comments || []).filter(function (c) { return c.round === boot.round || !c.resolved; });
      if ((data.approvals || []).length) markApproved(data.approvals[data.approvals.length - 1].name);
      drawPins();
    })
    .catch(function () {});
})();
