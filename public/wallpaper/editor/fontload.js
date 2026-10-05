/* =========================================================================
   editor/fontload.js — load Google Fonts into the editor on demand.

   A family is only fetched once something uses it (one <link> per family, so
   a single failing family cannot take the others with it). The font picker
   shows every family in its own face through tiny `text=` subsets that only
   contain the family's name.

   Text boxes are measured after rendering, so when a font finishes loading
   the canvas has to re-measure — `onChange` is how it hears about that.
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Fonts = window.WallpaperFonts;

  var loaded = {};
  var previews = {};
  var listeners = [];

  function addLink(href) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
    return link;
  }

  /** Make sure every weight of `family` is available to the canvas. */
  function ensure(family) {
    if (!Fonts.has(family) || loaded[family]) return;
    loaded[family] = true;
    var link = addLink(Fonts.cssUrl(family));
    link.addEventListener("error", function () {
      loaded[family] = false;
      WPE.toast && WPE.toast("Kunne ikke laste skriften «" + family + "». Sjekk nettilkoblingen.", "err");
    });
  }

  /** Load every family a document uses. */
  function ensureDoc(doc) {
    ["background", "topbanner"].forEach(function (k) {
      doc.artboards[k].elements.forEach(function (el) {
        if (el.style && el.style.font) ensure(el.style.font);
      });
    });
  }

  /** Name-only subset for the picker. */
  function preview(family) {
    if (previews[family] || loaded[family]) return;
    previews[family] = true;
    addLink(Fonts.previewUrl(family));
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  if (document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener("loadingdone", function () {
      listeners.forEach(function (fn) {
        fn();
      });
    });
  }

  WPE.fontload = { ensure: ensure, ensureDoc: ensureDoc, preview: preview, onChange: onChange };
})();
