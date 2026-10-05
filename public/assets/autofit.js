/* =========================================================================
   autofit.js — picks the headline size for a banner format.

   Two steps, in this order:

     1. The RULE. A per-format table of character counts → size: a short
        headline is set bigger than the approved spec size, a long one smaller,
        down to a floor (70 %). This is the design intent, and it is what keeps
        fifty banners from one sheet looking like one campaign rather than
        fifty different type sizes chosen by line length alone.

     2. The PROOF. The rule is a guess about how wide the letters are; the
        renderer knows. The banner is laid out off-screen at the rule's size
        and checked: every line inside the clamp, nothing pushed past the
        bottom of the banner, no word split in half. If it fails, the size
        steps down 5 % at a time until it passes — or reaches the floor, in
        which case the text is simply too long for that format and says so.

   The rule tables live in formats.js (`autoFit` on each spec) and can be
   overridden from Innstillinger, so they are shared by everyone on the server.

   Loaded by the browser (global BannerAutofit) for the live previews and the
   bulk page, and by the Puppeteer template so the export re-checks the very
   size it is about to screenshot. Requires window.renderBanner.
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BannerAutofit = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var STEP = 0.05;
  var HARD_MIN = 0.5;
  var HARD_MAX = 2;
  // Room the headline has to leave above the banner's bottom edge. The house
  // formats keep 10–24px themselves; this only catches a clamp taller than the
  // body it sits in.
  var BOTTOM_SAFE = 4;

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  /** Whitespace collapsed, ends trimmed — what the reader actually sees. */
  function normalize(text) {
    return String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  }

  /** Characters as a reader counts them (an emoji or "å" is one). */
  function countChars(text) {
    return Array.from(normalize(text)).length;
  }

  /**
   * Clean a rule table: tiers sorted by character count, sizes clamped, no
   * duplicates. Anything unusable falls back to the defaults it was given.
   *
   * @param {{min:number,max:number,tiers:Array<[number,number]>}} rule
   * @param {{min:number,max:number,tiers:Array<[number,number]>}} fallback
   */
  function cleanRule(rule, fallback) {
    var base = fallback || { min: 0.7, max: 1.2, tiers: [] };
    if (!rule || typeof rule !== "object") return base;
    var min = clamp(Number(rule.min), HARD_MIN, 1, base.min);
    var max = clamp(Number(rule.max), 1, HARD_MAX, base.max);
    var seen = {};
    var tiers = (Array.isArray(rule.tiers) ? rule.tiers : [])
      .map(function (t) {
        return [Math.round(Number(t && t[0])), round2(Number(t && t[1]))];
      })
      .filter(function (t) {
        return isFinite(t[0]) && t[0] > 0 && t[0] <= 500 && isFinite(t[1]);
      })
      .map(function (t) {
        return [t[0], Math.max(min, Math.min(max, t[1]))];
      })
      .sort(function (a, b) {
        return a[0] - b[0];
      })
      .filter(function (t) {
        if (seen[t[0]]) return false;
        seen[t[0]] = true;
        return true;
      });
    if (!tiers.length) tiers = base.tiers.slice();
    return { min: min, max: max, tiers: tiers };
  }

  function clamp(n, lo, hi, fallback) {
    if (!isFinite(n)) n = fallback;
    return Math.max(lo, Math.min(hi, n));
  }

  /** Step 1: the size the rule asks for at this length. */
  function ruleScale(rule, chars) {
    for (var i = 0; i < rule.tiers.length; i++) {
      if (chars <= rule.tiers[i][0]) return rule.tiers[i][1];
    }
    return rule.min;
  }

  /**
   * Whether the headline inside a rendered banner is shown whole.
   *
   * @param {HTMLElement} bn the .bn root, laid out at its real size (no
   *                         transform — getBoundingClientRect would scale)
   * @returns {{fits:boolean, clipped:boolean, overflowsBanner:boolean,
   *            brokenWord:string, lines:number}}
   */
  function inspect(bn) {
    var h = bn.querySelector(".bn__headline");
    if (!h) return { fits: true, clipped: false, overflowsBanner: false, brokenWord: "", lines: 0 };
    var lh = parseFloat(getComputedStyle(h).lineHeight) || 1;
    // A clamped line is a whole line-height of hidden content. Anything less
    // is the serif's own ascenders and descenders poking past a 1.2 line box
    // (Noto Serif does by ~2px), which is not text going missing.
    var clipped = h.scrollHeight - h.clientHeight > lh * 0.5;
    var hr = h.getBoundingClientRect();
    var br = bn.getBoundingClientRect();
    var overflowsBanner = hr.bottom > br.bottom - BOTTOM_SAFE + 0.5;
    var brokenWord = findBrokenWord(h);
    var lines = Math.round(Math.min(h.scrollHeight, h.clientHeight) / lh);
    return {
      fits: !clipped && !overflowsBanner && !brokenWord,
      clipped: clipped,
      overflowsBanner: overflowsBanner,
      brokenWord: brokenWord,
      lines: lines,
    };
  }

  /**
   * A word the browser had to split across two lines because it was wider than
   * the column (word-break: break-word). Hyphens and slashes are legitimate
   * break points, so each piece between them is checked on its own.
   */
  function findBrokenWord(h) {
    var node = h.firstChild;
    if (!node || node.nodeType !== 3) return "";
    var text = node.nodeValue;
    var re = /[^\s\-‐-—\/]+/g;
    var m;
    var range = document.createRange();
    while ((m = re.exec(text))) {
      if (m[0].length < 2) continue;
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      var rects = range.getClientRects();
      var top = null;
      for (var i = 0; i < rects.length; i++) {
        if (rects[i].width < 0.5) continue;
        if (top === null) top = rects[i].top;
        else if (Math.abs(rects[i].top - top) > 2) return m[0];
      }
    }
    return "";
  }

  // One hidden stage per document, reused: building a fresh one per check would
  // re-request the photo for every candidate size.
  var sandbox = null;
  function stage() {
    if (sandbox && sandbox.isConnected) return sandbox;
    sandbox = document.createElement("div");
    sandbox.setAttribute("aria-hidden", "true");
    sandbox.style.cssText =
      "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;contain:layout style;";
    document.body.appendChild(sandbox);
    return sandbox;
  }

  /**
   * Step 2: the largest size at or below the rule's that the format shows in
   * full.
   *
   * @param {string} type  format type, e.g. "house-mobile"
   * @param {Object} data  banner data as for renderBanner (headline, product, …)
   * @param {Object} rule  a cleaned rule (see cleanRule)
   * @returns {{scale:number, ruleScale:number, chars:number, fits:boolean,
   *            reason:string, lines:number}}
   *   reason: "" | "for-lang" (does not fit even at the floor) | "tom"
   */
  function fit(type, data, rule) {
    var chars = countChars(data.headline);
    var wanted = ruleScale(rule, chars);
    if (!chars) return { scale: wanted, ruleScale: wanted, chars: 0, fits: false, reason: "tom", lines: 0 };

    var host = stage();
    var bn = document.createElement("div");
    host.appendChild(bn);
    try {
      var scale = wanted;
      var last = null;
      // Hard stop well past any sane number of steps.
      for (var guard = 0; guard < 40; guard++) {
        var scales = {};
        scales[type] = scale;
        window.renderBanner(bn, type, Object.assign({}, data, { headlineScales: scales, imageDataUrl: "", placeholderUrl: "" }));
        last = inspect(bn);
        if (last.fits) {
          return { scale: round2(scale), ruleScale: wanted, chars: chars, fits: true, reason: "", lines: last.lines };
        }
        if (scale - STEP < rule.min - 1e-6) break;
        scale = round2(scale - STEP);
      }
      return {
        scale: round2(Math.max(rule.min, scale)),
        ruleScale: wanted,
        chars: chars,
        fits: false,
        reason: last && last.brokenWord && !last.clipped ? "langt-ord" : "for-lang",
        brokenWord: last ? last.brokenWord : "",
        lines: last ? last.lines : 0,
      };
    } finally {
      host.removeChild(bn);
    }
  }

  /** Human wording for a failed fit, in the UI's language. */
  function describe(result) {
    if (!result || result.fits) return "";
    if (result.reason === "tom") return "Mangler overskrift";
    if (result.reason === "langt-ord") {
      return "«" + result.brokenWord + "» er for langt til å stå på én linje";
    }
    return "Overskriften er for lang for dette formatet, selv på " + Math.round(result.scale * 100) + " %";
  }

  return {
    STEP: STEP,
    normalize: normalize,
    countChars: countChars,
    cleanRule: cleanRule,
    ruleScale: ruleScale,
    inspect: inspect,
    fit: fit,
    describe: describe,
  };
});
