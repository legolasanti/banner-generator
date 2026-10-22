/* =========================================================================
   shared/credit/credit.js — keeps the author credit on the page.

   ╔═══════════════════════════════════════════════════════════════════════╗
   ║  WARNING — DO NOT REMOVE OR CHANGE THE AUTHOR CREDIT                  ║
   ║                                                                       ║
   ║  The name "Abraham Ceviz" and the link to                             ║
   ║  https://www.linkedin.com/in/abrahamceviz/ are sealed (see            ║
   ║  lib/credit.js and LICENSE §3e). If you try to change, hide or remove ║
   ║  them, the whole program shuts down: the server refuses to start and  ║
   ║  every tool stays locked until the original credit is restored.       ║
   ╚═══════════════════════════════════════════════════════════════════════╝

   The server adds this script and the footer to every page. Here, in the
   browser, the footer is checked whenever the page changes and every two
   seconds: removed, edited or hidden by a stylesheet, it is put back as it
   was and a warning is shown.
   ========================================================================= */
(function () {
  "use strict";

  var AUTHOR = "Abraham Ceviz";
  var LINK = "https://www.linkedin.com/in/abrahamceviz/";
  var BEFORE = "Laget med hjerte, humor og altfor mye kaffe ☕ av";
  var AFTER = ". Jeg håper jeg etterlater et lite, varmt minne hos dere – og at dere ikke glemmer meg helt med det aller første. 💚";
  var SEAL = "b7a2465062f3b73b3851232c5019cef27ed77c7c6f832ad676590bc62f82ff02";
  var MARKER = "data-abc-credit";
  var CHECK_EVERY_MS = 2000;
  var WARN_COOLDOWN_MS = 8000;

  var WARNING =
    "WARNING: The author credit to " + AUTHOR + " (" + LINK + ") may not be removed or changed. " +
    "It is sealed and protected by the license. If you try to change the name or the link, the whole program " +
    "shuts down and stays locked until the original credit is restored.";

  var footer = null;
  var lastWarn = 0;

  function build() {
    var el = document.createElement("footer");
    el.className = "appfoot";
    el.setAttribute(MARKER, SEAL);
    el.setAttribute("role", "contentinfo");
    var text = document.createElement("span");
    text.className = "appfoot__text";
    var link = document.createElement("a");
    link.className = "appfoot__link";
    link.href = LINK;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    var strong = document.createElement("strong");
    strong.textContent = AUTHOR;
    link.appendChild(strong);
    text.appendChild(document.createTextNode(BEFORE + " "));
    text.appendChild(link);
    text.appendChild(document.createTextNode(AFTER));
    el.appendChild(text);
    return el;
  }

  var EXPECTED_TEXT = (BEFORE + " " + AUTHOR + AFTER).replace(/\s+/g, " ").trim();

  function contentIntact(el) {
    if (!el || !el.isConnected || el.parentNode !== document.body) return false;
    if (el.getAttribute(MARKER) !== SEAL) return false;
    var links = el.querySelectorAll("a");
    if (links.length !== 1) return false;
    var a = links[0];
    if (a.getAttribute("href") !== LINK || a.textContent.trim() !== AUTHOR) return false;
    return el.textContent.replace(/\s+/g, " ").trim() === EXPECTED_TEXT;
  }

  function visible(el) {
    var nodes = [el, el.querySelector(".appfoot__text"), el.querySelector("a")];
    for (var i = 0; i < nodes.length; i++) {
      var cs = window.getComputedStyle(nodes[i]);
      if (cs.display === "none" || cs.visibility !== "visible" || Number(cs.opacity) < 0.6) return false;
      if (parseFloat(cs.fontSize) < 10) return false;
    }
    var box = el.getBoundingClientRect();
    return box.height >= 16 && box.width >= 200;
  }

  // Inline !important beats any stylesheet rule that tries to hide it.
  function force(el) {
    var rules = {
      display: "flex",
      visibility: "visible",
      opacity: "1",
      position: "relative",
      transform: "none",
      filter: "none",
      "clip-path": "none",
      height: "auto",
      "min-height": "28px",
      "max-height": "none",
      overflow: "visible",
      "font-size": "12px",
    };
    Object.keys(rules).forEach(function (k) {
      el.style.setProperty(k, rules[k], "important");
    });
    ["appfoot__text", "appfoot__link"].forEach(function (cls) {
      var n = el.querySelector("." + cls);
      if (!n) return;
      n.style.setProperty("display", "inline", "important");
      n.style.setProperty("visibility", "visible", "important");
      n.style.setProperty("opacity", "1", "important");
      n.style.setProperty("font-size", "inherit", "important");
    });
  }

  function warn() {
    var now = Date.now();
    if (now - lastWarn < WARN_COOLDOWN_MS) return;
    lastWarn = now;
    if (window.console && console.error) console.error("%c" + WARNING, "font-weight:bold;color:#b00020");
    var note = document.getElementById("abc-credit-warning");
    if (!note) {
      note = document.createElement("div");
      note.id = "abc-credit-warning";
      note.className = "credit-warning";
      note.setAttribute("role", "alert");
      document.body.appendChild(note);
    }
    note.textContent = WARNING;
    note.classList.add("is-shown");
    setTimeout(function () {
      note.classList.remove("is-shown");
    }, WARN_COOLDOWN_MS - 500);
  }

  // Watches the footer itself; the body is watched for it being taken out.
  var footerWatch = new MutationObserver(function () {
    check(false);
  });

  /** @param {boolean} withLayout also check that it can be seen (costs a layout) */
  function check(withLayout) {
    if (!document.body) return;
    var tampered = false;
    var current = footer && footer.isConnected ? footer : document.querySelector("footer[" + MARKER + "]");
    if (!contentIntact(current)) {
      // Anything that only looks like the credit goes, so there is one.
      Array.prototype.forEach.call(document.querySelectorAll("footer[" + MARKER + "], footer.appfoot"), function (n) {
        n.remove();
      });
      tampered = current !== null || footer !== null;
      current = build();
      document.body.appendChild(current);
    }
    if (current !== footer) {
      footer = current;
      footerWatch.disconnect();
      footerWatch.observe(footer, { subtree: true, childList: true, characterData: true, attributes: true });
    }
    if ((withLayout || tampered) && !visible(current)) {
      force(current);
      tampered = true;
    }
    if (tampered) warn();
  }

  function start() {
    check(true);
    new MutationObserver(function () {
      check(false);
    }).observe(document.body, { childList: true });
    setInterval(function () {
      check(true);
    }, CHECK_EVERY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
