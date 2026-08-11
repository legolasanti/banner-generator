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

  // Norsk Tipping brand mark, inlined so the badge needs no asset request and
  // stays razor sharp at every size. Keep in sync with
  // public/assets/norsktipping-icon.svg (both derive from
  // references/norsktipping-full-color.svg, wordmark removed).
  var AGE_ICON_SVG =
    '<svg class="bn__age-icon" viewBox="0 0 19.805 19.943" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
    '<polygon fill="#FFC000" points="4.048 0 0 4.076 5.856 9.972 0 15.867 4.048 19.943 13.951 9.972"/>' +
    '<polygon fill="#96D94E" points="5.856 9.972 13.951 9.972 0 4.076"/>' +
    '<polygon fill="#00A332" points="4.048 0 0 4.076 13.951 9.972"/>' +
    '<polygon fill="#FF7337" points="5.856 9.972 4.048 19.943 13.951 9.972"/>' +
    '<polygon fill="#FF7EA9" points="15.757 0 10.82 4.971 14.869 9.047 19.805 4.076"/>' +
    '<polygon fill="#EF2500" points="15.757 0 14.869 9.047 19.805 4.076"/>' +
    '<polygon fill="#00C1FF" points="19.805 15.867 14.869 10.896 10.82 14.972"/>' +
    '<polygon fill="#0058FF" points="15.757 19.943 19.805 15.867 10.82 14.972"/>' +
    "</svg>";

  // 18+ | Hjelpelinjen.no badge — REAL TEXT plus the brand mark, not one
  // flattened bitmap lockup. The old lockup was a 150×24 PNG that turned mushy
  // the moment the badge was scaled down (worst on the 190×190 Nyhetsgrid);
  // live text is rendered at the output resolution and stays legible. The part
  // before "|" is bold ("18+"), the rest regular, matching the official lockup.
  function ageBadge(data, extraClass) {
    var raw = String(data.ageBadgeText || "18+ | Hjelpelinjen.no").trim();
    var pipe = raw.indexOf("|");
    var text =
      pipe === -1
        ? '<span class="bn__age-rest">' + escapeHtml(raw) + "</span>"
        : '<span class="bn__age-lead">' + escapeHtml(raw.slice(0, pipe).trim()) + "</span>" +
          '<span class="bn__age-sep" aria-hidden="true">|</span>' +
          '<span class="bn__age-rest">' + escapeHtml(raw.slice(pipe + 1).trim()) + "</span>";
    // A custom mark uploaded in Innstillinger overrides the inline default.
    var icon = data.ageIconUrl
      ? '<img class="bn__age-icon" src="' + escapeHtml(data.ageIconUrl) + '" alt="">'
      : AGE_ICON_SVG;
    return (
      '<span class="bn__badge bn__age' +
      (extraClass ? " " + extraClass : "") +
      '">' +
      '<span class="bn__age-text">' +
      text +
      "</span>" +
      icon +
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
  // Default is plain text (button only when explicitly requested).
  function ctaMarkup(data) {
    var accent = safeColor(data.accentColor, "#000000");
    var size = Number(data.lesMerSize);
    if (!isFinite(size)) size = 17;
    size = Math.max(12, Math.min(28, size));
    if (data.lesMerStyle === "button") {
      return '<span class="bn__cta" style="background:' + accent + ";font-size:" + size + 'px">Les mer</span>';
    }
    return '<span class="bn__cta bn__cta--text" style="color:' + accent + ";font-size:" + size + 'px">Les mer</span>';
  }

  function renderReadpeak(data) {
    var annonse = escapeHtml(data.annonseText || "Annonse");
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
      '<span class="bn__brandlabel">' +
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

  // Nyhetsgrid 190×190 — the front-page news-grid placement. The image is
  // small at this size, so Annonse + 18/Hjelpelinjen are merged into one
  // full-width bar across the top of the photo (instead of two floating
  // pills) to stay legible; see the Canva reference "NT - 190x190".
  // Vinnersjanse defaults OFF here (too small to read) — only switched on
  // explicitly when fronting a jackpot ("vinnerpott"), per Monika.
  function renderNewsgrid(data) {
    var annonse = escapeHtml(data.annonseText || "Annonse");
    var vinnerText = data.showVinnerOnNewsgrid ? String(data.vinnersjanse || "").trim() : "";
    var vinner = vinnerText ? '<span class="bn__badge bn__vinner">' + escapeHtml(vinnerText) + "</span>" : "";
    return (
      '<div class="bn__media">' +
      mediaImg(data) +
      '<span class="bn__topbar">' +
      '<span class="bn__topbar-annonse">' +
      annonse +
      "</span>" +
      ageBadge(data, "bn__topbar-age") +
      "</span>" +
      vinner +
      "</div>" +
      '<div class="bn__body">' +
      '<h2 class="bn__headline">' +
      escapeHtml(data.headline || "Overskrift kommer her") +
      "</h2>" +
      "</div>"
    );
  }

  var HL_SCALE_KEYS = {
    readpeak: "headlineScaleReadpeak",
    desktop: "headlineScaleDesktop",
    mobile: "headlineScaleMobile",
    newsgrid: "headlineScaleNewsgrid",
  };

  /**
   * Render a banner into a root element.
   * @param {HTMLElement} root
   * @param {"readpeak"|"desktop"|"mobile"|"newsgrid"} type
   * @param {Object} data
   */
  function renderBanner(root, type, data) {
    if (!root) return;
    data = data || {};
    var cls = "bn bn--" + type;
    // Per-format headline scale (falls back to a legacy global, then 1).
    var key = HL_SCALE_KEYS[type] || "headlineScaleDesktop";
    var hl = Number(data[key]);
    if (!isFinite(hl)) hl = Number(data.headlineScale);
    if (!isFinite(hl)) hl = 1;
    var st = Number(data.subtitleScale);
    if (!isFinite(st)) st = 1;
    if (type === "readpeak" && !(data.subtitle && String(data.subtitle).trim())) {
      cls += " bn--no-ingress";
    }
    root.className = cls;
    root.style.setProperty("--hl-scale", Math.max(0.5, Math.min(2, hl)));
    root.style.setProperty("--st-scale", Math.max(0.5, Math.min(2, st)));
    if (type === "readpeak") {
      root.innerHTML = renderReadpeak(data);
    } else if (type === "newsgrid") {
      root.innerHTML = renderNewsgrid(data);
    } else {
      root.innerHTML = renderDesktopOrMobile(data);
    }
  }

  global.renderBanner = renderBanner;
  // expose helpers for potential reuse/testing
  global.renderBanner.escapeHtml = escapeHtml;
})(typeof window !== "undefined" ? window : this);
