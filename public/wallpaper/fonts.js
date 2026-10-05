/* =========================================================================
   fonts.js — the Google Fonts the Wallpaper editor offers (generated).

   Every family is listed with the exact weights (w) and italic weights (i)
   Google serves for it, taken from fonts.google.com/metadata/fonts. The list
   is what both the editor and the server trust: a weight that is not listed
   here is never requested, because one unknown weight makes the whole css2
   request fail with HTTP 400.

   c = category: sans | serif | display | script | mono
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WallpaperFonts = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var FAMILIES = [
    {"f":"Inter","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Roboto","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Open Sans","c":"sans","w":[300,400,500,600,700,800],"i":[300,400,500,600,700,800]},
    {"f":"Lato","c":"sans","w":[100,300,400,700,900],"i":[100,300,400,700,900]},
    {"f":"Montserrat","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Poppins","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Raleway","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Nunito","c":"sans","w":[200,300,400,500,600,700,800,900,1000],"i":[200,300,400,500,600,700,800,900,1000]},
    {"f":"Nunito Sans","c":"sans","w":[200,300,400,500,600,700,800,900,1000],"i":[200,300,400,500,600,700,800,900,1000]},
    {"f":"Work Sans","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Rubik","c":"sans","w":[300,400,500,600,700,800,900],"i":[300,400,500,600,700,800,900]},
    {"f":"Manrope","c":"sans","w":[200,300,400,500,600,700,800],"i":[]},
    {"f":"DM Sans","c":"sans","w":[100,200,300,400,500,600,700,800,900,1000],"i":[100,200,300,400,500,600,700,800,900,1000]},
    {"f":"Plus Jakarta Sans","c":"sans","w":[200,300,400,500,600,700,800],"i":[200,300,400,500,600,700,800]},
    {"f":"Outfit","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[]},
    {"f":"Figtree","c":"sans","w":[300,400,500,600,700,800,900],"i":[300,400,500,600,700,800,900]},
    {"f":"Urbanist","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Sora","c":"sans","w":[100,200,300,400,500,600,700,800],"i":[]},
    {"f":"Space Grotesk","c":"sans","w":[300,400,500,600,700],"i":[]},
    {"f":"Archivo","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Archivo Black","c":"sans","w":[400],"i":[]},
    {"f":"Archivo Narrow","c":"sans","w":[400,500,600,700],"i":[400,500,600,700]},
    {"f":"Barlow","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Barlow Condensed","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Roboto Condensed","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Oswald","c":"sans","w":[200,300,400,500,600,700],"i":[]},
    {"f":"Bebas Neue","c":"sans","w":[400],"i":[]},
    {"f":"Anton","c":"sans","w":[400],"i":[]},
    {"f":"Fjalla One","c":"sans","w":[400],"i":[]},
    {"f":"Teko","c":"sans","w":[300,400,500,600,700],"i":[]},
    {"f":"Kanit","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Exo 2","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Titillium Web","c":"sans","w":[200,300,400,600,700,900],"i":[200,300,400,600,700]},
    {"f":"Josefin Sans","c":"sans","w":[100,200,300,400,500,600,700],"i":[100,200,300,400,500,600,700]},
    {"f":"Quicksand","c":"sans","w":[300,400,500,600,700],"i":[]},
    {"f":"Comfortaa","c":"display","w":[300,400,500,600,700],"i":[]},
    {"f":"Fredoka","c":"sans","w":[300,400,500,600,700],"i":[]},
    {"f":"Baloo 2","c":"display","w":[400,500,600,700,800],"i":[]},
    {"f":"Lexend","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[]},
    {"f":"Mulish","c":"sans","w":[200,300,400,500,600,700,800,900,1000],"i":[200,300,400,500,600,700,800,900,1000]},
    {"f":"Source Sans 3","c":"sans","w":[200,300,400,500,600,700,800,900],"i":[200,300,400,500,600,700,800,900]},
    {"f":"PT Sans","c":"sans","w":[400,700],"i":[400,700]},
    {"f":"Ubuntu","c":"sans","w":[300,400,500,700],"i":[300,400,500,700]},
    {"f":"Cabin","c":"sans","w":[400,500,600,700],"i":[400,500,600,700]},
    {"f":"Karla","c":"sans","w":[200,300,400,500,600,700,800],"i":[200,300,400,500,600,700,800]},
    {"f":"Heebo","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[]},
    {"f":"Mukta","c":"sans","w":[200,300,400,500,600,700,800],"i":[]},
    {"f":"IBM Plex Sans","c":"sans","w":[100,200,300,400,500,600,700],"i":[100,200,300,400,500,600,700]},
    {"f":"Noto Sans","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Arimo","c":"sans","w":[400,500,600,700],"i":[400,500,600,700]},
    {"f":"Schibsted Grotesk","c":"sans","w":[400,500,600,700,800,900],"i":[400,500,600,700,800,900]},
    {"f":"Libre Franklin","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Red Hat Display","c":"sans","w":[300,400,500,600,700,800,900],"i":[300,400,500,600,700,800,900]},
    {"f":"Syne","c":"sans","w":[400,500,600,700,800],"i":[]},
    {"f":"Unbounded","c":"sans","w":[200,300,400,500,600,700,800,900],"i":[]},
    {"f":"Bricolage Grotesque","c":"sans","w":[200,300,400,500,600,700,800],"i":[]},
    {"f":"Onest","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[]},
    {"f":"Chakra Petch","c":"sans","w":[300,400,500,600,700],"i":[300,400,500,600,700]},
    {"f":"Saira","c":"sans","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Playfair Display","c":"serif","w":[400,500,600,700,800,900],"i":[400,500,600,700,800,900]},
    {"f":"Merriweather","c":"serif","w":[300,400,500,600,700,800,900],"i":[300,400,500,600,700,800,900]},
    {"f":"Lora","c":"serif","w":[400,500,600,700],"i":[400,500,600,700]},
    {"f":"Noto Serif","c":"serif","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"PT Serif","c":"serif","w":[400,700],"i":[400,700]},
    {"f":"Libre Baskerville","c":"serif","w":[400,500,600,700],"i":[400,500,600,700]},
    {"f":"EB Garamond","c":"serif","w":[400,500,600,700,800],"i":[400,500,600,700,800]},
    {"f":"Cormorant Garamond","c":"serif","w":[300,400,500,600,700],"i":[300,400,500,600,700]},
    {"f":"DM Serif Display","c":"serif","w":[400],"i":[400]},
    {"f":"Instrument Serif","c":"serif","w":[400],"i":[400]},
    {"f":"Abril Fatface","c":"display","w":[400],"i":[]},
    {"f":"Bitter","c":"serif","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Roboto Slab","c":"serif","w":[100,200,300,400,500,600,700,800,900],"i":[]},
    {"f":"Zilla Slab","c":"serif","w":[300,400,500,600,700],"i":[300,400,500,600,700]},
    {"f":"Crimson Pro","c":"serif","w":[200,300,400,500,600,700,800,900],"i":[200,300,400,500,600,700,800,900]},
    {"f":"Fraunces","c":"serif","w":[100,200,300,400,500,600,700,800,900],"i":[100,200,300,400,500,600,700,800,900]},
    {"f":"Source Serif 4","c":"serif","w":[200,300,400,500,600,700,800,900],"i":[200,300,400,500,600,700,800,900]},
    {"f":"Prata","c":"serif","w":[400],"i":[]},
    {"f":"Yeseva One","c":"display","w":[400],"i":[]},
    {"f":"Alfa Slab One","c":"display","w":[400],"i":[]},
    {"f":"Lobster","c":"display","w":[400],"i":[]},
    {"f":"Pacifico","c":"script","w":[400],"i":[]},
    {"f":"Dancing Script","c":"script","w":[400,500,600,700],"i":[]},
    {"f":"Caveat","c":"script","w":[400,500,600,700],"i":[]},
    {"f":"Satisfy","c":"script","w":[400],"i":[]},
    {"f":"Great Vibes","c":"script","w":[400],"i":[]},
    {"f":"Permanent Marker","c":"script","w":[400],"i":[]},
    {"f":"Kaushan Script","c":"script","w":[400],"i":[]},
    {"f":"Sacramento","c":"script","w":[400],"i":[]},
    {"f":"Amatic SC","c":"script","w":[400,700],"i":[]},
    {"f":"Righteous","c":"display","w":[400],"i":[]},
    {"f":"Bangers","c":"display","w":[400],"i":[]},
    {"f":"Black Ops One","c":"display","w":[400],"i":[]},
    {"f":"Russo One","c":"sans","w":[400],"i":[]},
    {"f":"Passion One","c":"display","w":[400,700,900],"i":[]},
    {"f":"Luckiest Guy","c":"display","w":[400],"i":[]},
    {"f":"Press Start 2P","c":"display","w":[400],"i":[]},
    {"f":"Bungee","c":"display","w":[400],"i":[]},
    {"f":"Lilita One","c":"display","w":[400],"i":[]},
    {"f":"Paytone One","c":"sans","w":[400],"i":[]},
    {"f":"Titan One","c":"display","w":[400],"i":[]},
    {"f":"Staatliches","c":"display","w":[400],"i":[]},
    {"f":"Roboto Mono","c":"mono","w":[100,200,300,400,500,600,700],"i":[100,200,300,400,500,600,700]},
    {"f":"JetBrains Mono","c":"mono","w":[100,200,300,400,500,600,700,800],"i":[100,200,300,400,500,600,700,800]},
    {"f":"Space Mono","c":"mono","w":[400,700],"i":[400,700]}
  ];

  var CATEGORIES = [
    { id: "sans", label: "Sans serif" },
    { id: "serif", label: "Serif" },
    { id: "display", label: "Display" },
    { id: "script", label: "Håndskrift" },
    { id: "mono", label: "Mono" },
  ];

  var DEFAULT_FAMILY = "Inter";
  var CSS2 = "https://fonts.googleapis.com/css2?family=";

  // No prototype: a family called "constructor" must not look like a font.
  var byName = Object.create(null);
  FAMILIES.forEach(function (fam) {
    byName[fam.f] = fam;
  });

  function find(family) {
    return byName[family] || null;
  }

  function has(family) {
    return !!byName[family];
  }

  /**
   * The weight Google actually serves that is closest to the one asked for,
   * preferring the heavier side on a tie (bold stays bold). Always picked from
   * the upright weights: switching italic on must never change the weight.
   * Where no real italic exists at that weight, the browser slants the
   * upright face — in the editor and in every export alike.
   */
  function nearestWeight(family, weight) {
    var fam = find(family) || find(DEFAULT_FAMILY);
    var list = fam.w;
    var want = Number(weight) || 400;
    var best = list[0];
    for (var n = 0; n < list.length; n++) {
      var d = Math.abs(list[n] - want);
      var bd = Math.abs(best - want);
      if (d < bd || (d === bd && list[n] > best)) best = list[n];
    }
    return best;
  }

  /** Whether the family has a real italic at this weight (else it is synthesised). */
  function hasItalic(family, weight) {
    var fam = find(family);
    return !!fam && fam.i.indexOf(Number(weight)) !== -1;
  }

  function familyParam(family) {
    return encodeURIComponent(family).replace(/%20/g, "+");
  }

  /**
   * css2 URL for every weight and italic of one family — what the editor loads
   * the moment a family is used. One link per family on purpose: a single bad
   * family in a combined request would take all the others down with it.
   */
  function cssUrl(family) {
    var fam = find(family);
    if (!fam) return "";
    var tuples = fam.w.map(function (w) {
      return "0," + w;
    });
    fam.i.forEach(function (w) {
      tuples.push("1," + w);
    });
    return CSS2 + familyParam(fam.f) + ":ital,wght@" + tuples.join(";") + "&display=swap";
  }

  /**
   * css2 URL for one exact face, subset to the characters in `text`. Google
   * then serves a font holding only those glyphs — typically 2–8 KB instead of
   * 20–60 KB — which is what keeps a live-text HTML5 creative inside a 100 KB
   * budget.
   */
  function subsetUrl(family, weight, italic, text) {
    var fam = find(family);
    if (!fam) return "";
    var w = nearestWeight(fam.f, weight, italic);
    var ital = italic && fam.i.indexOf(w) !== -1 ? 1 : 0;
    return (
      CSS2 + familyParam(fam.f) + ":ital,wght@" + ital + "," + w +
      "&text=" + encodeURIComponent(text || " ")
    );
  }

  /** Tiny css2 URL for rendering a family's own name in the font picker. */
  function previewUrl(family) {
    var fam = find(family);
    if (!fam) return "";
    return subsetUrl(fam.f, nearestWeight(fam.f, 400, false), false, fam.f);
  }

  /** CSS font-family value with a sensible generic fallback per category. */
  function stack(family) {
    var fam = find(family) || find(DEFAULT_FAMILY);
    var generic = { serif: "serif", mono: "monospace", script: "cursive" }[fam.c] || "sans-serif";
    return '"' + fam.f + '", ' + generic;
  }

  return {
    FAMILIES: FAMILIES,
    CATEGORIES: CATEGORIES,
    DEFAULT_FAMILY: DEFAULT_FAMILY,
    find: find,
    has: has,
    nearestWeight: nearestWeight,
    hasItalic: hasItalic,
    cssUrl: cssUrl,
    subsetUrl: subsetUrl,
    previewUrl: previewUrl,
    stack: stack,
  };
});
