/* =========================================================================
   filetags.js — the creative code at the end of a Norsk Tipping filename.

   "euro-fredaguke44-desktop_F1P0G1T0R0.png": five yes/no answers about the
   creative, so a creative-level Ad Manager report can be split on any one of
   them (G1 against G0, and so on) without tagging anything by hand.

     F  face           a face in the photo
     P  prize          the prize amount in the copy («Vant 14,3 mill»)
     G  geography      where the winner lives («her bor vinneren»)
     T  short text     a headline of at most 30 characters — measured, not asked
     R  game reference the game named, or its logo shown

   Loaded by the server (require) AND by the browser (global BannerFileTags),
   so the code the form shows is exactly the code the file gets.
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BannerFileTags = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var SHORT_TEXT_MAX = 30;

  // In the order the code is written. `auto` questions are answered from the
  // headline rather than by the user.
  var QUESTIONS = [
    { id: "F", title: "Ansikt", question: "Viser bildet et ansikt?" },
    { id: "P", title: "Premiebeløp", question: "Står premiebeløpet i teksten?", example: "Vant 14,3 mill" },
    { id: "G", title: "Sted", question: "Står det hvor vinneren bor?", example: "her bor vinneren" },
    { id: "T", title: "Kort tekst", question: "Overskrift på maks " + SHORT_TEXT_MAX + " tegn", auto: true },
    { id: "R", title: "Spillnavn", question: "Nevnes spillet, eller vises logoen?" },
  ];

  var CODE_PATTERN = /^F[01]P[01]G[01]T[01]R[01]$/;

  /** Characters as a reader counts them, ignoring the edges and doubled spaces. */
  function textLength(headline) {
    return String(headline == null ? "" : headline).trim().replace(/\s+/g, " ").length;
  }

  function isShortText(headline) {
    var n = textLength(headline);
    return n > 0 && n <= SHORT_TEXT_MAX;
  }

  /**
   * Every answer, with T filled in from the headline. A question left
   * unanswered stays null.
   * @param {Object<string, boolean|null>} answers  { F: true, P: false, … }
   * @param {string} headline
   */
  function resolve(answers, headline) {
    var a = answers || {};
    var out = {};
    QUESTIONS.forEach(function (q) {
      if (q.id === "T") out.T = textLength(headline) ? isShortText(headline) : null;
      else out[q.id] = typeof a[q.id] === "boolean" ? a[q.id] : null;
    });
    return out;
  }

  /** "F1P0G1T0R0", or "" while any answer is still missing. */
  function code(answers, headline) {
    var r = resolve(answers, headline);
    var out = "";
    for (var i = 0; i < QUESTIONS.length; i++) {
      var v = r[QUESTIONS[i].id];
      if (v === null) return "";
      out += QUESTIONS[i].id + (v ? "1" : "0");
    }
    return out;
  }

  /** The same code with "?" for what is still missing — for the preview. */
  function draft(answers, headline) {
    var r = resolve(answers, headline);
    return QUESTIONS.map(function (q) {
      var v = r[q.id];
      return q.id + (v === null ? "?" : v ? "1" : "0");
    }).join("");
  }

  /** A code sent by a client, or "" when it is not exactly the five pairs. */
  function clean(value) {
    var s = String(value == null ? "" : value).trim().toUpperCase();
    return CODE_PATTERN.test(s) ? s : "";
  }

  /** "desktop" + "F1P0G1T0R0" → "desktop_F1P0G1T0R0"; no code → "desktop". */
  function withCode(stem, tag) {
    return tag ? stem + "_" + tag : stem;
  }

  return {
    SHORT_TEXT_MAX: SHORT_TEXT_MAX,
    QUESTIONS: QUESTIONS,
    textLength: textLength,
    isShortText: isShortText,
    resolve: resolve,
    code: code,
    draft: draft,
    clean: clean,
    withCode: withCode,
  };
});
