/* =========================================================================
   bulk/names.js — the filenames a bulk run produces.

   Loaded by the server (require, through server.js and lib/bulk/jobs.js) AND
   by the browser (global BULK_NAMES), so the name a row shows before the run
   is exactly the name it gets in the ZIP — including the "-2" a duplicate
   gets. The same sanitising serves the single-banner builder's filenames.
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BULK_NAMES = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  // Room for a campaign name, a week, a placement and Norsk Tipping's
  // creative code ("vikinglotto-torsdaguke44-kampanje-...") without cutting it.
  var MAX_LENGTH = 100;
  // A filename from a headline is cut at a word below this (see nameFromHeadline).
  var NAME_FROM_HEADLINE_MAX = 48;

  // Letters NFKD does not take apart into a base letter plus an accent. The
  // Turkish dotless ı in particular would otherwise simply vanish ("Kışlık"
  // → "kslk").
  var FOLDS = [
    [/æ/g, "ae"], [/ø/g, "o"], [/å/g, "a"], [/ı/g, "i"], [/ß/g, "ss"],
    [/œ/g, "oe"], [/đ/g, "d"], [/ł/g, "l"], [/þ/g, "th"], [/ð/g, "d"],
  ];
  // People type the extension into the Filnavn column ("hotell.png"); the run
  // adds its own, so it is dropped rather than folded into "hotellpng".
  var TYPED_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg|zip|html?|pdf)$/i;

  /** "Spar 50 % på hotell!" → "spar-50-pa-hotell". Never empty: "banner". */
  function sanitizeFilename(name) {
    var s = String(name == null ? "" : name).trim().replace(TYPED_EXTENSION, "").toLowerCase();
    for (var i = 0; i < FOLDS.length; i++) s = s.replace(FOLDS[i][0], FOLDS[i][1]);
    // strip remaining accents/diacritics
    s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    s = s.replace(/\s+/g, "-");
    s = s.replace(/[^a-z0-9-]/g, "");
    s = s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
    s = s.slice(0, MAX_LENGTH).replace(/^-+|-+$/g, "");
    return s || "banner";
  }

  /**
   * A filename from a headline, cut at a word rather than mid-word: «Denne
   * overskriften er altfor lang …» → "denne-overskriften-er-altfor-lang", not
   * "…-fordi-d" where the length limit happened to fall.
   */
  function nameFromHeadline(headline, sanitize) {
    var full = (sanitize || sanitizeFilename)(headline);
    if (full.length <= NAME_FROM_HEADLINE_MAX) return full;
    var out = "";
    var words = full.split("-");
    for (var i = 0; i < words.length; i++) {
      var next = out ? out + "-" + words[i] : words[i];
      if (next.length > NAME_FROM_HEADLINE_MAX) break;
      out = next;
    }
    return out || full.slice(0, NAME_FROM_HEADLINE_MAX);
  }

  /**
   * The file base of every row of a run, in order: the row's own filename, or
   * one made from its headline, made unique — two rows with the same name
   * would overwrite each other in the ZIP, so the second becomes "…-2".
   *
   * @param {Array<{filename?:string, headline?:string}>} rows
   * @returns {string[]}
   */
  function fileBases(rows) {
    var used = {};
    return rows.map(function (row, i) {
      var r = row || {};
      var base = r.filename ? sanitizeFilename(r.filename) : nameFromHeadline(String(r.headline || ""));
      if (base === "banner" && !r.filename) base = "banner-" + (i + 1);
      var unique = base;
      for (var n = 2; used[unique]; n++) unique = (base.slice(0, MAX_LENGTH - 5) + "-" + n).replace(/-+/g, "-");
      used[unique] = true;
      return unique;
    });
  }

  return {
    MAX_LENGTH: MAX_LENGTH,
    NAME_FROM_HEADLINE_MAX: NAME_FROM_HEADLINE_MAX,
    sanitizeFilename: sanitizeFilename,
    nameFromHeadline: nameFromHeadline,
    fileBases: fileBases,
  };
});
