/* =========================================================================
   banner.js — SINGLE SOURCE OF TRUTH for banner markup.
   Defines a global renderBanner() used by BOTH:
     • the Puppeteer templates (templates/*.html) → final PNG output
     • the in-browser live previews (public/app.js) → instant feedback
   Because the same function + banner.css produce both, the on-screen preview
   is a faithful representation of the downloaded banner.
   Plain ES5-ish global script (no modules) so it loads via <script src> in
   the Puppeteer pages too.
   ========================================================================= */
(function (global) {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clampPct(value, fallback) {
    var n = Number(value);
    if (!isFinite(n)) n = fallback;
    return Math.max(0, Math.min(100, n));
  }

  // Validate a hex colour before inlining it into a style attribute (prevents
  // CSS/style injection from the accent-colour field).
  function safeColor(value, fallback) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(value || "")) ? String(value) : fallback;
  }

  // Build the <img> for the photo area, including object-position and a
  // graceful fallback to the placeholder when there is no source.
  function mediaImg(data) {
    var src = data.imageDataUrl || data.placeholderUrl || "";
    if (!src) return ""; // no image: the .bn__media pattern shows through
    var x = clampPct(data.imagePositionX, 50);
    var y = clampPct(data.imagePositionY, 50);
    var z = Number(data.imageZoom);
    if (!isFinite(z)) z = 0;
    z = Math.max(0, Math.min(30, z));
    var scale = 1 + z / 100;
    // Zoom = scale the cover-image about the framed focal point so position +
    // zoom work together. Container overflow clips the excess.
    var style =
      "object-position:" + x + "% " + y + "%;" +
      "transform:scale(" + scale + ");" +
      "transform-origin:" + x + "% " + y + "%;";
    return '<img class="bn__img" alt="" src="' + src + '" style="' + style + '">';
  }

  // 18+ | Hjelpelinjen.no badge. The logo asset contains the full lockup;
  // if it fails to load we fall back to plain text so a banner is never empty.
  function ageBadge(data, extraClass) {
    var logo = data.logoUrl || "";
    var alt = escapeHtml(data.ageBadgeText || "18+ | Hjelpelinjen.no");
    var fallback =
      '<span class="bn__age-fallback bn__hidden">' + alt + "</span>";
    var img = logo
      ? '<img src="' +
        logo +
        '" alt="' +
        alt +
        "\" onerror=\"this.style.display='none';var s=this.nextElementSibling;if(s)s.classList.remove('bn__hidden');\">"
      : '<span class="bn__age-fallback">' + alt + "</span>";
    return (
      '<span class="bn__badge bn__age' +
      (extraClass ? " " + extraClass : "") +
      '">' +
      img +
      (logo ? fallback : "") +
      "</span>"
    );
  }

  function vinnerBadge(data) {
    var text = (data.vinnersjanse || "").trim();
    if (!text) return ""; // Sport / empty → no badge at all
    return '<span class="bn__badge bn__vinner">' + escapeHtml(text) + "</span>";
  }

  function annonseBadge(data) {
    var text = data.annonseText || "Annonse";
    return '<span class="bn__badge bn__annonse">' + escapeHtml(text) + "</span>";
  }

  // "Les mer" — either a filled button or plain bold text, in the accent colour.
  function ctaMarkup(data) {
    var accent = safeColor(data.accentColor, "#000000");
    if (data.lesMerStyle === "text") {
      return '<span class="bn__cta bn__cta--text" style="color:' + accent + '">Les mer</span>';
    }
    return '<span class="bn__cta" style="background:' + accent + '">Les mer</span>';
  }

  function renderReadpeak(data) {
    var annonse = escapeHtml(data.annonseText || "Annonse");
    var accent = safeColor(data.accentColor, "#000000");
    return (
      // Image flush at the very top; Annonse + 18+ overlay the image (like
      // Desktop/Mobile), no separate top bar.
      '<div class="bn__media">' +
      mediaImg(data) +
      '<span class="bn__annonse-top">' +
      annonse +
      "</span>" +
      ageBadge(data) +
      vinnerBadge(data) +
      "</div>" +
      '<div class="bn__body">' +
      '<span class="bn__brandlabel" style="color:' +
      accent +
      '">' +
      escapeHtml(data.brandLabel || "NORSK TIPPING") +
      "</span>" +
      '<h2 class="bn__headline">' +
      escapeHtml(data.headline || "Overskrift kommer her") +
      "</h2>" +
      '<p class="bn__subtitle">' +
      escapeHtml(data.subtitle || "") +
      "</p>" +
      ctaMarkup(data) +
      "</div>"
    );
  }

  function renderDesktopOrMobile(data) {
    return (
      '<div class="bn__media">' +
      mediaImg(data) +
      annonseBadge(data) +
      ageBadge(data) +
      vinnerBadge(data) +
      "</div>" +
      '<div class="bn__body">' +
      '<h2 class="bn__headline">' +
      escapeHtml(data.headline || "Overskrift kommer her") +
      "</h2>" +
      "</div>"
    );
  }

  /**
   * Render a banner into a root element.
   * @param {HTMLElement} root
   * @param {"readpeak"|"desktop"|"mobile"} type
   * @param {Object} data
   */
  function renderBanner(root, type, data) {
    if (!root) return;
    data = data || {};
    root.className = "bn bn--" + type;
    // Per-banner text-size multipliers (driven by the "Tekststørrelse" control).
    var hl = Number(data.headlineScale);
    if (!isFinite(hl)) hl = 1;
    var st = Number(data.subtitleScale);
    if (!isFinite(st)) st = 1;
    root.style.setProperty("--hl-scale", Math.max(0.5, Math.min(2, hl)));
    root.style.setProperty("--st-scale", Math.max(0.5, Math.min(2, st)));
    if (type === "readpeak") {
      root.innerHTML = renderReadpeak(data);
    } else {
      root.innerHTML = renderDesktopOrMobile(data);
    }
  }

  global.renderBanner = renderBanner;
  // expose helpers for potential reuse/testing
  global.renderBanner.escapeHtml = escapeHtml;
})(typeof window !== "undefined" ? window : this);
