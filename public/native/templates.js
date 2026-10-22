/* =========================================================================
   native/templates.js — the built-in page templates.

   Starting structures for the kinds of advertorial ABC BrandStudio makes,
   from the plain workhorses (Lansering, Guide …) to the premium formats the
   big Nordic brand studios build in Vev (scroll-driven launches, Topp 5
   countdowns, "Wrapped" data stories, immersive travel pieces, explorers,
   reports).

   A template may carry:
     category the gallery filter it is listed under (see CATEGORIES)
     theme    its own look (used when the project has no brand kit)
     extras   page-level options (progress bar, chapter menu, floating button)
     sections the page, with "demo:<name>" for photos from the demo kit
              (lib/native/demo): expand() swaps them for real asset ids

   The copy is sample text for invented advertisers (Nordvei, Fjellro,
   Fjordbank …). It shows the tone and length that belong in each place, and
   it is obviously not real, so an unfinished page is never mistaken for a
   finished one.

   Shared verbatim by the browser and the server (UMD).
   ========================================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./templates/premium.js"), require("./templates/industry.js"), require("./templates/basics.js"));
  } else {
    var sets = root.NativeTemplateSets || {};
    root.NativeTemplates = factory(sets.premium || [], sets.industry || [], sets.basics || []);
  }
})(typeof self !== "undefined" ? self : this, function (premium, industry, basics) {
  "use strict";

  // The templates live in native/templates/: premium formats, industry
  // templates, then the plain workhorses — the gallery's default order.
  var TEMPLATES = [].concat(premium, industry, basics);

  // Gallery filter order. "Grunnmal" holds the plain workhorses.
  var CATEGORIES = ["Bil", "Finans", "Helse", "Mat", "Bolig", "Energi", "Handel", "Reise", "Jobb", "Underholdning", "Grunnmal"];

  function find(id) {
    for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i];
    return null;
  }

  var DEMO_RE = /^demo:([a-z0-9-]+)$/;

  function walk(value, fn) {
    if (Array.isArray(value)) return value.map(function (v) { return walk(v, fn); });
    if (value && typeof value === "object") {
      var out = {};
      Object.keys(value).forEach(function (k) { out[k] = walk(value[k], fn); });
      return out;
    }
    return fn(value);
  }

  /** Names of the demo photos a template uses. */
  function demoNames(tpl) {
    var seen = {};
    walk(tpl.sections, function (v) {
      var m = typeof v === "string" && DEMO_RE.exec(v);
      if (m) seen[m[1]] = true;
      return v;
    });
    return Object.keys(seen);
  }

  /** The template with "demo:<name>" replaced by ids[name] (or removed). */
  function expand(tpl, ids) {
    var map = ids || {};
    return Object.assign({}, tpl, {
      sections: walk(tpl.sections, function (v) {
        var m = typeof v === "string" && DEMO_RE.exec(v);
        return m ? map[m[1]] || "" : v;
      }),
    });
  }

  /** The template's look as a full theme object (normalised later). */
  function themeOf(tpl) {
    var t = tpl.theme || {};
    return {
      colors: Object.assign({}, t.colors || {}),
      fonts: { heading: (t.fonts && t.fonts.heading) || {}, body: (t.fonts && t.fonts.body) || {} },
      headingCase: t.headingCase,
      scale: t.scale,
      tracking: t.tracking,
      radius: t.radius,
      button: t.button,
      buttonCase: t.buttonCase,
    };
  }

  return { TEMPLATES: TEMPLATES, CATEGORIES: CATEGORIES, find: find, demoNames: demoNames, expand: expand, themeOf: themeOf };
});
