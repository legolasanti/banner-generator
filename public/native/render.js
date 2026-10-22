/* =========================================================================
   native/render.js — turns a Native Premium project into HTML.

   One renderer for everything, so what the editor shows is what ships:
     mode "editor"   the live preview inside the editor iframe: adds
                     data-np-* hooks for selecting and editing in place, shows
                     placeholders for missing media, never runs tracking code
     mode "preview"  the review link the advertiser opens
     mode "export"   the static ZIP (relative asset paths, tracking included)
     mode "publish"  the page ABC design hosts itself (/n/<slug>/)

   Output is plain strings (no DOM), so Node and the browser share it. Every
   value that reaches the markup is escaped here; formatted text is run
   through doc.sanitizeRich() again even though normalisation already did it.

   The page reads fully without JavaScript. runtime/np.js only adds motion,
   video autoplay, the fold-out fact box, the quiz and the share links.

   ctx (built by the caller):
     mode, assets           project.assets merged with the settings' assets
     url(id, width)         URL of an asset (width → the webp variant)
     settings               disclosure texts + logos (lib/native/settings.js)
     page                   the page being rendered
     pageHref(page)         link to another variant page
     cssHref / cssText      np.css as a link (editor/preview) or inline (export)
     runtimeSrc             np.js
     fontCss                @font-face rules / Google Fonts @import
     canonical              absolute URL of this page, if known
     ogImageUrl             absolute URL of the share image, if known
   ========================================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./schema.js"), require("./doc.js"));
  else root.NativeRender = factory(root.NativeSchema, root.NativeDoc);
})(typeof self !== "undefined" ? self : this, function (S, D) {
  "use strict";

  var esc = D.escapeHtml;

  var ICONS = {
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3Z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    messenger: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3C6.9 3 3 6.7 3 11.5c0 2.6 1.1 4.8 3 6.3V21l2.9-1.6c.9.3 2 .4 3.1.4 5.1 0 9-3.7 9-8.5S17.1 3 12 3Zm1 11.3-2.3-2.4-4.4 2.4 4.9-5.2 2.3 2.4 4.4-2.4-4.9 5.2Z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  };

  // Line icons for cards (schema.ICONS), by id.
  var LINE_ICONS = {};
  (S.ICONS || []).forEach(function (i) { LINE_ICONS[i[0]] = i[2]; });

  function lineIcon(id) {
    var d = LINE_ICONS[id];
    if (!d) return "";
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  /** The icon a card shows: the chosen one, else the one an emoji stands for. */
  function cardIcon(it) {
    if (it.icon && LINE_ICONS[it.icon]) return it.icon;
    var sym = String(it.symbol || "").trim();
    return (S.EMOJI_ICONS && S.EMOJI_ICONS[sym]) || "";
  }

  var RATIO = { "21:9": "21 / 9", "16:9": "16 / 9", "9:16": "9 / 16", "4:3": "4 / 3", "3:4": "3 / 4", "1:1": "1 / 1", "4:5": "4 / 5" };

  // ---- colour ---------------------------------------------------------------
  function luminance(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    var rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (c) {
      var s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  function contrast(a, b) {
    var la = luminance(a);
    var lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /** Black or white text, whichever reads better on `bg`. */
  function onColor(bg) {
    return contrast(bg, "#ffffff") >= contrast(bg, "#111111") ? "#ffffff" : "#111111";
  }

  /** The average of two #rrggbb colours (what a gradient between them reads as). */
  function mix(a, b) {
    var x = parseInt(String(a).slice(1), 16);
    var y = parseInt(String(b).slice(1), 16);
    var c = [16, 8, 0].map(function (sh) { return Math.round((((x >> sh) & 255) + ((y >> sh) & 255)) / 2); });
    return "#" + c.map(function (v) { return (v < 16 ? "0" : "") + v.toString(16); }).join("");
  }

  function isDark(bg) {
    return onColor(bg) === "#ffffff";
  }

  /** `a` moved `k` (0–1) of the way to `b`. */
  function towards(a, b, k) {
    var x = parseInt(String(a).slice(1), 16);
    var y = parseInt(String(b).slice(1), 16);
    var c = [16, 8, 0].map(function (sh) {
      var u = (x >> sh) & 255;
      return Math.round(u + (((y >> sh) & 255) - u) * k);
    });
    return "#" + c.map(function (v) { return (v < 16 ? "0" : "") + v.toString(16); }).join("");
  }

  /** A colour as text on the page's light surfaces (the page, or white when
   *  the page is dark, and the soft band when it is light): readable on both. */
  function inkOn(color, page, soft) {
    var light = isDark(page) ? "#ffffff" : page;
    var out = readableOn(color, light);
    return soft && !isDark(soft) ? readableOn(out, soft) : out;
  }

  /** The accent as text on `bg`: darkened (or lightened) until it reads (3:1). */
  function readableOn(color, bg) {
    var target = isDark(bg) ? "#ffffff" : "#111111";
    var out = color;
    for (var k = 0.2; contrast(out, bg) < 3 && k <= 1; k += 0.2) out = towards(color, target, k);
    return out;
  }

  // ---- fonts ------------------------------------------------------------------
  var SYS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  function fontStack(font) {
    var generic = /serif|garamond|baskerville|lora|merriweather|playfair|prata|fraunces|bitter|slab/i.test(font.family) &&
      !/sans/i.test(font.family) ? "Georgia, serif" : SYS;
    if (font.source === "system") return generic;
    return '"' + String(font.family).replace(/["\\]/g, "") + '", ' + generic;
  }

  // ---- theme → :root custom properties --------------------------------------
  var SCALE = { compact: 0.86, normal: 1, large: 1.14, display: 1.32 };
  var TRACK = { normal: "-0.012em", tight: "-0.035em", wide: "0.01em" };

  function themeCss(theme, opts) {
    var c = theme.colors;
    var headH = opts && opts.hasVariants ? 104 : 56;
    var page = c.page || "#ffffff";
    var darkPage = isDark(page);
    // Text for light surfaces: the theme's text colour when it is dark (it
    // always is on a light theme), else near-black.
    var ink = isDark(c.text) ? c.text : "#111111";
    // In a band filled with the brand colour, an accent too close to it
    // disappears: there it falls back to the text colour of that band.
    var brandFg = onColor(c.primary) === "#ffffff" ? "#ffffff" : ink;
    var accentOnBrand = contrast(c.accent, c.primary) < 2 ? brandFg : c.accent;
    // The main button on a dark section is white with brand-coloured text —
    // unless the brand colour is too pale to read on white (lime): then the
    // button is the brand colour itself.
    var paleBrand = contrast(c.primary, "#ffffff") < 3;
    return (
      ":root{" +
      "--np-page:" + page + ";" +
      "--np-page-text:" + (darkPage ? "#f4f5f7" : c.text) + ";" +
      "--np-hs:" + (SCALE[theme.scale] || 1) + ";" +
      "--np-track:" + (TRACK[theme.tracking] || TRACK.normal) + ";" +
      "--np-btn-case:" + (theme.buttonCase === "upper" ? "uppercase" : "none") + ";" +
      "--np-on-dark-page:" + (darkPage ? 1 : 0) + ";" +
      "--np-primary:" + c.primary + ";" +
      "--np-accent:" + c.accent + ";" +
      "--np-dark:" + c.dark + ";" +
      "--np-soft:" + c.soft + ";" +
      "--np-text:" + c.text + ";" +
      "--np-link:" + c.link + ";" +
      "--np-on-primary:" + onColor(c.primary) + ";" +
      "--np-on-accent:" + onColor(c.accent) + ";" +
      "--np-brand:" + c.primary + ";" +
      "--np-ink:" + ink + ";" +
      // Cards on a light section: the soft colour, unless the theme's soft is dark.
      "--np-soft-card:" + (isDark(c.soft) ? "rgba(0, 0, 0, 0.06)" : c.soft) + ";" +
      "--np-on-soft:" + (isDark(c.soft) ? "#f4f5f7" : c.text) + ";" +
      "--np-brand-accent:" + accentOnBrand + ";" +
      // Accent-coloured words on the page itself (statement highlights):
      // a pale accent on a pale page is pulled darker until it reads.
      "--np-accent-text:" + inkOn(c.accent, page, c.soft) + ";" +
      "--np-primary-text:" + inkOn(c.primary, page, c.soft) + ";" +
      // On white cards (products, flip-card backs, the variant bar) and on
      // the theme's dark colour.
      "--np-accent-white:" + readableOn(c.accent, "#ffffff") + ";" +
      "--np-primary-white:" + readableOn(c.primary, "#ffffff") + ";" +
      "--np-accent-on-dark:" + readableOn(c.accent, isDark(c.dark) ? c.dark : "#111111") + ";" +
      "--np-brand-on-accent:" + onColor(accentOnBrand) + ";" +
      "--np-btn-dark-bg:" + (paleBrand ? c.primary : "#ffffff") + ";" +
      "--np-btn-dark-fg:" + (paleBrand ? onColor(c.primary) : c.primary) + ";" +
      "--np-radius:" + theme.radius + "px;" +
      "--np-font-h:" + fontStack(theme.fonts.heading) + ";" +
      "--np-font-b:" + fontStack(theme.fonts.body) + ";" +
      "--np-font-sys:" + SYS + ";" +
      "--np-weight-h:" + theme.fonts.heading.weight + ";" +
      "--np-weight-b:" + theme.fonts.body.weight + ";" +
      "--np-head-h:" + headH + "px;" +
      "}" +
      (opts && opts.hasVariants ? "@media (max-width:599px){:root{--np-head-h:94px}}" : "@media (max-width:599px){:root{--np-head-h:50px}}")
    );
  }

  // ---- small builders ----------------------------------------------------------
  function attrs(map) {
    var out = "";
    Object.keys(map).forEach(function (k) {
      var v = map[k];
      if (v === undefined || v === null || v === false || v === "") return;
      out += v === true ? " " + k : " " + k + '="' + esc(v) + '"';
    });
    return out;
  }

  function ed(ctx, field) {
    return ctx.mode === "editor" ? ' data-np-field="' + esc(field) + '"' : "";
  }

  function textHtml(s) {
    return esc(s).replace(/\n/g, "<br>");
  }

  function rich(html) {
    return D.sanitizeRich(html, S.HARD_MAX.rich);
  }

  function placeholder(ctx, label) {
    return ctx.mode === "editor" ? '<div class="np-ph">' + esc(label) + "</div>" : "";
  }

  // UTM tagging + sponsored rel for every link to the advertiser.
  function outbound(ctx, url) {
    if (!url) return "";
    var t = ctx.project.tracking.utm;
    if (!/^https?:\/\//i.test(url)) return url;
    if (!t.enabled) return clickWrap(ctx, url);
    var hashAt = url.indexOf("#");
    var base = hashAt === -1 ? url : url.slice(0, hashAt);
    var hash = hashAt === -1 ? "" : url.slice(hashAt);
    if (/[?&]utm_source=/.test(base)) return clickWrap(ctx, url);
    var params = [];
    if (t.source) params.push("utm_source=" + encodeURIComponent(t.source));
    if (t.medium) params.push("utm_medium=" + encodeURIComponent(t.medium));
    if (t.campaign) params.push("utm_campaign=" + encodeURIComponent(t.campaign));
    if (!params.length) return clickWrap(ctx, url);
    return clickWrap(ctx, base + (base.indexOf("?") === -1 ? "?" : "&") + params.join("&") + hash);
  }

  /**
   * An ad-server click tracker (DoubleClick, Adform …) in front of every
   * outbound link: "https://ad.doubleclick.net/…;?" + the encoded target, or
   * the target dropped into a %%DEST_URL%% / {url} macro.
   */
  function clickWrap(ctx, url) {
    var pre = ctx.project.tracking && ctx.project.tracking.clickPrefix;
    if (!pre || ctx.mode === "editor") return url;
    if (/%%DEST_URL%%|\{url\}/i.test(pre)) return pre.replace(/%%DEST_URL%%|\{url\}/gi, encodeURIComponent(url));
    return pre + encodeURIComponent(url);
  }

  function linkAttrs(ctx, url, label) {
    var href = outbound(ctx, url);
    if (!href) return attrs({ href: ctx.mode === "editor" ? "#" : null });
    var external = /^https?:\/\//i.test(href);
    return attrs({
      href: href,
      target: external ? "_blank" : null,
      rel: external ? "sponsored noopener" : null,
      "data-np-cta": label || true,
    });
  }

  // ---- images -----------------------------------------------------------------
  function variantWidths(meta) {
    return meta && meta.widths && meta.widths.length ? meta.widths : [];
  }

  function srcset(ctx, id) {
    var meta = ctx.assets[id];
    return variantWidths(meta)
      .map(function (w) {
        return ctx.url(id, w) + " " + w + "w";
      })
      .join(", ");
  }

  function bestSrc(ctx, id, want) {
    var ws = variantWidths(ctx.assets[id]);
    if (!ws.length) return ctx.url(id, 0);
    var pick = ws[ws.length - 1];
    for (var i = 0; i < ws.length; i++) {
      if (ws[i] >= want) {
        pick = ws[i];
        break;
      }
    }
    return ctx.url(id, pick);
  }

  /**
   * <img> (or <picture> with a mobile source). opts: alt, sizes, eager, cls,
   * mobile (asset id for ≤599px), field (editor hook).
   */
  function img(ctx, id, opts) {
    var o = opts || {};
    var meta = ctx.assets[id];
    if (!id || !meta) return "";
    var focal = meta.focal ? meta.focal.x + "% " + meta.focal.y + "%" : null;
    var tag =
      "<img" +
      attrs({
        src: bestSrc(ctx, id, 1280),
        srcset: srcset(ctx, id) || null,
        sizes: srcset(ctx, id) ? o.sizes || "100vw" : null,
        width: meta.w || null,
        height: meta.h || null,
        // The field's own alt text wins, then the asset's; decorative
        // images (backgrounds, a second copy) get an empty alt on purpose.
        alt: o.decorative ? "" : o.alt || meta.alt || "",
        loading: o.eager ? "eager" : "lazy",
        fetchpriority: o.eager ? "high" : null,
        decoding: "async",
        class: o.cls || null,
        style: focal && focal !== "50% 50%" ? "object-position:" + focal : null,
      }) +
      (o.field ? ed(ctx, o.field) : "") +
      ">";
    var mob = o.mobile && ctx.assets[o.mobile] ? o.mobile : "";
    if (!mob) return tag;
    var mmeta = ctx.assets[mob];
    return (
      "<picture>" +
      "<source" +
      attrs({
        media: "(max-width: 599px)",
        srcset: srcset(ctx, mob) || ctx.url(mob, 0),
        sizes: srcset(ctx, mob) ? "100vw" : null,
        width: mmeta.w || null,
        height: mmeta.h || null,
      }) +
      ">" +
      tag +
      "</picture>"
    );
  }

  // ---- video ----------------------------------------------------------------------
  /** One <video>. ambient → muted loop, started by the runtime when on screen. */
  function videoTag(ctx, id, opts) {
    var o = opts || {};
    var meta = ctx.assets[id];
    if (!id || !meta) return "";
    var poster = o.poster || meta.poster;
    var posterUrl = poster && ctx.assets[poster] ? bestSrc(ctx, poster, 1280) : null;
    var type = /\.webm$/.test(id) ? "video/webm" : "video/mp4";
    var a = {
      class: o.cls || null,
      poster: posterUrl,
      preload: o.ambient ? "none" : "metadata",
      playsinline: true,
      muted: o.ambient ? true : null,
      loop: o.ambient && !o.scrub ? true : null,
      controls: o.ambient ? null : true,
      "data-np-ambient": o.ambient && !o.scrub ? true : null,
      "data-np-scrub": o.scrub ? true : null,
      "data-np-video": o.label || true,
      "aria-label": o.label || null,
      disableremoteplayback: o.ambient ? true : null,
    };
    if (o.ambient) a["aria-hidden"] = o.decorative ? "true" : null;
    return "<video" + attrs(a) + '><source src="' + esc(ctx.url(id, 0)) + '" type="' + type + '"></video>';
  }

  /** Desktop + optional mobile video, each shown only on its device. */
  function videoPair(ctx, desk, mob, opts) {
    if (!mob || !ctx.assets[mob]) return videoTag(ctx, desk, opts);
    return (
      videoTag(ctx, desk, Object.assign({}, opts, { cls: ((opts && opts.cls) || "") + " np-only-desk" })) +
      videoTag(ctx, mob, Object.assign({}, opts, { cls: ((opts && opts.cls) || "") + " np-only-mob" }))
    );
  }

  /** Background media: video if there is one (image as its poster), else image. */
  function media(ctx, p, keys, opts) {
    var o = opts || {};
    var video = p[keys.video];
    var image = p[keys.image];
    if (video && ctx.assets[video]) {
      return videoPair(ctx, video, p[keys.videoMobile], {
        ambient: true,
        decorative: true,
        poster: image || null,
      });
    }
    if (image && ctx.assets[image]) {
      return img(ctx, image, { alt: o.alt || "", mobile: p[keys.imageMobile], eager: o.eager, sizes: "100vw", field: o.field });
    }
    return "";
  }

  // ---- sections ------------------------------------------------------------------
  /**
   * Is the section's own background dark (so its text should be light)? The
   * theme's colours decide, not their names: a dark theme can have a dark
   * "soft" and a pale (lime) brand colour.
   */
  function darkBg(st, theme) {
    var bg = st.bg || "none";
    if (bg === "image" || bg === "video") return true;
    if (bg === "brand") return isDark(theme.colors.primary);
    if (bg === "dark") return isDark(theme.colors.dark);
    if (bg === "soft") return isDark(theme.colors.soft);
    if (bg === "custom") return !!st.bgColor && isDark(st.bgColor);
    if (bg === "gradient") return isDark(mix(st.bgColor || theme.colors.primary, st.bgColor2 || theme.colors.dark));
    return isDark(theme.colors.page || "#ffffff");
  }

  function sectionClasses(section, extra, mode, theme) {
    var st = section.style;
    var cls = ["np-sec", "np-t-" + section.type];
    var bg = st.bg || "none";
    cls.push("np-bg-" + bg);
    var dark = theme ? darkBg(st, theme) : bg === "brand" || bg === "dark" || bg === "image";
    if (st.tone === "light") dark = true;
    if (st.tone === "dark") dark = false;
    cls.push(dark ? "np-on-dark" : "np-on-light-sec");
    cls.push("np-pad-" + (st.pad || "m"));
    if (st.align) cls.push("np-align-" + st.align);
    if (st.minH && st.minH !== "auto") cls.push("np-minh-" + st.minH, "np-va-" + (st.valign || "center"));
    ["tablet", "mobile"].forEach(function (dev) {
      var o = section.rs[dev] && section.rs[dev].style;
      if (!o) return;
      var p = dev === "tablet" ? "t" : "m";
      if (o.pad) cls.push("np-pad-" + p + "-" + o.pad);
      if (o.align) cls.push("np-align-" + p + "-" + o.align);
      if (o.minH) cls.push("np-minh-" + p + "-" + o.minH);
    });
    if (st.anim && st.anim !== "none") {
      cls.push("np-anim-" + st.anim);
      if (st.animEase && st.animEase !== "smooth") cls.push("np-ease-" + st.animEase);
      if (st.animRepeat) cls.push("np-repeat");
    }
    if (st.animSpeed && st.animSpeed !== "normal") cls.push("np-speed-" + st.animSpeed);
    if (st.scrollFx && st.scrollFx !== "none") cls.push("np-sfx-" + st.scrollFx);
    if (st.transition && st.transition !== "none") cls.push("np-tr", "np-tr-" + st.transition);
    if (st.headFx && st.headFx !== "none") cls.push("np-hfx", "np-hfx-" + st.headFx);
    if (st.shapeTop && st.shapeTop !== "none") cls.push("np-shape-t", "np-shape-t-" + st.shapeTop);
    if (st.shapeBottom && st.shapeBottom !== "none") cls.push("np-shape-b", "np-shape-b-" + st.shapeBottom);
    if (st.grain) cls.push("np-grain");
    if ((bg === "image" || bg === "video" || bg === "gradient") && st.bgFx && st.bgFx !== "none") cls.push("np-bgfx-" + st.bgFx);
    // The editor keeps hidden sections on screen (faded, labelled), so they
    // can still be selected and switched back on.
    ["desktop", "tablet", "mobile"].forEach(function (d) {
      if (section.hide[d]) cls.push((mode === "editor" ? "np-edh-" : "np-hide-") + d);
    });
    return cls.concat(extra || []).join(" ");
  }

  // A pale brand colour needs dark text (the section is np-on-light-sec then;
  // np-on-light is kept for custom CSS written against it).
  function brandTextFix(ctx, section) {
    if (section.style.bg !== "brand" || section.style.tone !== "auto") return "";
    return isDark(ctx.project.theme.colors.primary) ? "" : " np-on-light";
  }

  function gradientCss(st, theme) {
    var a = st.bgColor || theme.colors.primary;
    var b = st.bgColor2 || theme.colors.dark;
    if (st.bgGradient === "radial") return "radial-gradient(120% 90% at 50% 0%, " + a + " 0%, " + b + " 70%)";
    if (st.bgGradient === "mesh") {
      return (
        "radial-gradient(60% 70% at 15% 20%, " + a + " 0%, transparent 60%)," +
        "radial-gradient(55% 60% at 85% 30%, " + theme.colors.accent + "cc 0%, transparent 62%)," +
        "radial-gradient(70% 70% at 60% 100%, " + a + "aa 0%, transparent 65%)," + b
      );
    }
    return "linear-gradient(" + (st.bgAngle || 0) + "deg, " + a + " 0%, " + b + " 100%)";
  }

  // Sections the floating button must not sit on: things the reader acts on
  // or reads closely (np.js hides the button while one is at the bottom).
  var BUSY = { cta: 1, productCards: 1, quiz: 1, poll: 1, countdown: 1, compare: 1, hotspots: 1, tabs: 1, testimonials: 1, specTable: 1, flipCards: 1, accordion: 1, quote: 1, steps: 1, rankList: 1, stickyStory: 1, factBox: 1, embed: 1 };
  // Sections that reach the right edge, where the side chapter dots sit.
  var WIDE = { hScroll: 1, parallaxImage: 1, scrollVideo: 1, stickyStory: 1, gallery: 1, marquee: 1 };
  function isWide(section) {
    var p = section.props || {};
    if (WIDE[section.type]) return true;
    if ((section.type === "productCards" || section.type === "testimonials") && p.layout === "carousel") return true;
    return (section.type === "image" || section.type === "hotspots" || section.type === "video") && p.size === "full";
  }

  function wrapSection(ctx, section, inner, opts) {
    var o = opts || {};
    var st = section.style;
    var theme = ctx.project.theme;
    var style = [];
    if (st.bg === "custom" && st.bgColor) style.push("--np-sec-bg:" + st.bgColor);
    if (st.bg === "gradient") style.push("--np-sec-bg:" + gradientCss(st, theme));
    if (st.animDelay) style.push("--np-delay:" + Number(st.animDelay).toFixed(1) + "s");
    if (st.anim === "stagger" && st.animStep && st.animStep !== 90) style.push("--np-step:" + Math.round(st.animStep) + "ms");
    if (o.style) style.push(o.style);
    var bgLayer = "";
    if (st.bg === "image" && st.bgImage && ctx.assets[st.bgImage]) {
      style.push("--np-overlay:" + (st.overlay / 100).toFixed(2));
      bgLayer = '<div class="np-bgimg" aria-hidden="true"><div class="np-bgimg__in">' + img(ctx, st.bgImage, { decorative: true, sizes: "100vw", mobile: st.bgImageMobile }) + "</div></div>";
    } else if (st.bg === "video" && st.bgVideo && ctx.assets[st.bgVideo]) {
      style.push("--np-overlay:" + (st.overlay / 100).toFixed(2));
      bgLayer = '<div class="np-bgimg" aria-hidden="true"><div class="np-bgimg__in">' + videoPair(ctx, st.bgVideo, st.bgVideoMobile, { ambient: true, decorative: true }) + "</div></div>";
    } else if (st.bg === "image" || st.bg === "video") {
      bgLayer = ctx.mode === "editor" ? '<div class="np-bgimg np-bgimg--empty" aria-hidden="true"></div>' : "";
    }
    var cls = sectionClasses(section, o.cls, ctx.mode, theme) + brandTextFix(ctx, section);
    var anchor = st.anchor ? '<span class="np-anchor" id="' + esc(D.slugify(st.anchor, "")) + '"></span>' : "";
    // Shaped edges are spacers the section's own background (and mask) extend
    // into; np.css overlaps them with the neighbouring section.
    var top = st.shapeTop && st.shapeTop !== "none" ? '<span class="np-edge np-edge--t" aria-hidden="true"></span>' : "";
    var bottom = st.shapeBottom && st.shapeBottom !== "none" ? '<span class="np-edge np-edge--b" aria-hidden="true"></span>' : "";
    var tag = o.tag || "section";
    var body = top + anchor + bgLayer + inner + bottom;
    return (
      "<" + tag +
      attrs({
        id: "np-" + section.id,
        class: cls,
        style: style.join(";") || null,
        "data-np-section": ctx.mode === "editor" ? section.id : null,
        "data-np-type": section.type,
        "data-np-chapter": st.chapter || null,
        "data-np-busy": BUSY[section.type] ? true : null,
        "data-np-wide": isWide(section) ? true : null,
        // Sections whose look follows the scroll: np.js feeds them progress.
        "data-np-motion": (st.transition && st.transition !== "none") || (st.scrollFx && st.scrollFx !== "none") ? true : null,
      }) +
      ">" + body + "</" + tag + ">"
    );
  }

  function wrap(width, inner, extraCls) {
    return '<div class="np-wrap np-w-' + width + (extraCls ? " " + extraCls : "") + '">' + inner + "</div>";
  }

  /** Stagger index for repeated items (cards, stats …): `style="--i:n"`. */
  function si(i, extra) {
    return ' style="--i:' + i + (extra ? ";" + extra : "") + '"';
  }

  /**
   * A title split into words (or letters) for the word-by-word animations.
   * The plain text stays in an aria-label so screen readers read it whole.
   */
  function splitText(text, mode) {
    var t = String(text || "");
    if (!mode || mode === "none") return esc(t);
    if (mode === "letters") {
      var n = 0;
      return t.split(/(\s+)/).map(function (w) {
        if (/^\s+$/.test(w)) return " ";
        return '<span class="np-wd">' + Array.from(w).map(function (ch) {
          return '<span class="np-ch" style="--i:' + n++ + '">' + esc(ch) + "</span>";
        }).join("") + "</span>";
      }).join("");
    }
    if (mode === "lines") {
      return t.split(/\n/).map(function (line, i) {
        return '<span class="np-ln"><span style="--i:' + i + '">' + esc(line) + "</span></span>";
      }).join(" ");
    }
    var k = 0;
    return t.split(/(\s+)/).map(function (w) {
      if (/^\s+$/.test(w)) return " ";
      return '<span class="np-wd"><span class="np-wi" style="--i:' + k++ + '">' + esc(w) + "</span></span>";
    }).join("");
  }

  /** Words of a statement, with the accent words marked. */
  function accentWords(text, accent) {
    var words = String(text || "").split(/(\s+)/);
    var acc = String(accent || "").toLowerCase().split(/\s+/).filter(Boolean).map(function (w) { return w.replace(/[^\p{L}\p{N}]/gu, ""); });
    var k = 0;
    return words.map(function (w) {
      if (/^\s+$/.test(w) || !w) return w ? " " : "";
      var bare = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      var hit = bare && acc.indexOf(bare) !== -1;
      return '<span class="np-sw' + (hit ? " np-acc" : "") + '" style="--i:' + k++ + '">' + esc(w) + "</span>";
    }).join("");
  }

  function readMinutes(page) {
    var words = 0;
    page.sections.forEach(function (sec) {
      S.fieldsOf(sec.type).forEach(function (f) {
        var v = sec.props[f.key];
        if (f.type === "rich") words += D.plainText(v).split(/\s+/).length;
        else if (f.type === "textarea") words += String(v || "").split(/\s+/).length;
        else if (f.type === "list") {
          (v || []).forEach(function (item) {
            f.item.forEach(function (sub) {
              if (sub.type === "textarea" || sub.type === "rich") words += D.plainText(item[sub.key]).split(/\s+/).length;
            });
          });
        }
      });
    });
    return Math.max(1, Math.round(words / 200));
  }

  function btnClass(ctx, ghost) {
    var t = ctx.project.theme.button;
    return "np-btn" + (t === "pill" ? " np-btn--pill" : "") + (t === "outline" ? " np-btn--outline" : "") + (ghost ? " np-btn--ghost" : "");
  }

  function button(ctx, label, url, field, ghost) {
    if (!label) return "";
    return '<a class="' + btnClass(ctx, ghost) + '"' + linkAttrs(ctx, url, label) + "><span" + ed(ctx, field) + ">" + esc(label) + "</span>" + ICONS.arrow + "</a>";
  }

  function heading(ctx, text, field, cls) {
    if (!text) return "";
    return '<h2 class="np-h2' + (cls ? " " + cls : "") + '"' + ed(ctx, field) + ">" + esc(text) + "</h2>";
  }

  var R = {};

  R.hero = function (ctx, s, isFirst) {
    var p = s.props;
    var m = p.layout === "type" ? "" : media(ctx, p, { image: "image", imageMobile: "imageMobile", video: "video", videoMobile: "videoMobile" }, { eager: isFirst, field: "image" });
    var hasMedia = !!m;
    var extras = ctx.project.extras || {};
    var meta = extras.readTime && isFirst ? '<p class="np-hero__meta">' + readMinutes(ctx.page) + " min lesing</p>" : "";
    var titleFx = p.titleFx && p.titleFx !== "none" ? " np-tfx np-tfx--" + p.titleFx : "";
    var text =
      '<div class="np-hero__text">' +
      (p.kicker ? '<span class="np-kicker"' + ed(ctx, "kicker") + ">" + esc(p.kicker) + "</span>" : ctx.mode === "editor" ? '<span class="np-kicker np-ed-empty"' + ed(ctx, "kicker") + "></span>" : "") +
      '<h1 class="np-h1 np-h1--' + (p.titleSize || "l") + titleFx + '"' + ed(ctx, "title") + (titleFx ? ' aria-label="' + esc(p.title) + '"' : "") + ">" +
      (titleFx && ctx.mode !== "editor" ? splitText(p.title, p.titleFx) : esc(p.title)) + "</h1>" +
      (p.ingress || ctx.mode === "editor" ? '<p class="np-ingress' + (p.ingress ? "" : " np-ed-empty") + '"' + ed(ctx, "ingress") + ">" + textHtml(p.ingress) + "</p>" : "") +
      meta +
      "</div>";
    var layout = p.layout === "type" ? "type" : hasMedia || ctx.mode === "editor" ? p.layout : "below";
    var mediaHtml = hasMedia ? m : placeholder(ctx, "Velg et bilde eller en video for hero");
    var cls = ["np-hero", "np-hero--" + layout, "np-hero--h-" + p.height, "np-hero--pos-" + p.position];
    if (p.kenBurns) cls.push("np-kb");
    var hint = p.scrollHint && p.height === "full" ? '<a class="np-hero__hint" href="#np-after-hero" aria-label="Les videre">' + ICONS.down + "</a>" : "";
    var inner;
    if (layout === "overlay") {
      inner = '<div class="np-hero__media">' + mediaHtml + "</div>" + wrap("wide", text) + hint;
    } else if (layout === "split") {
      inner = '<div class="np-hero__media">' + mediaHtml + "</div>" + '<div class="np-wrap">' + text + "</div>";
    } else if (layout === "framed") {
      inner = wrap("wide", '<div class="np-hero__frame"><div class="np-hero__media">' + mediaHtml + "</div></div>") + wrap("text", text);
    } else if (layout === "zoom") {
      // A tall track; the media is pinned and grows from a framed card to
      // full bleed while the reader scrolls (np.js sets --np-z 0 → 1).
      inner =
        '<div class="np-hero__zoom" data-np-zoom><div class="np-hero__pin">' +
        '<div class="np-hero__media">' + mediaHtml + "</div>" +
        wrap("wide", text) +
        "</div></div>";
    } else if (layout === "type") {
      inner = wrap("wide", text) + hint;
    } else {
      inner = (hasMedia || ctx.mode === "editor" ? '<div class="np-hero__media">' + mediaHtml + "</div>" : "") + wrap("text", text);
    }
    return (
      wrapSection(ctx, s, inner, {
        tag: "header",
        cls: cls,
        style: "--np-overlay:" + (p.overlay / 100).toFixed(2),
      }) + '<span id="np-after-hero"></span>'
    );
  };

  R.richText = function (ctx, s) {
    var p = s.props;
    var body = '<div class="np-rich' + (p.dropCap ? " np-dropcap" : "") + (p.lead ? " np-lead" : "") + (p.columns === "2" ? " np-cols2" : "") + '"' + ed(ctx, "html") + ">" + rich(p.html) + "</div>";
    return wrapSection(ctx, s, wrap(p.width, body));
  };

  function figure(ctx, id, alt, caption, fieldPrefix, ratio, sizes, fx) {
    if (!id || !ctx.assets[id]) return placeholder(ctx, "Velg et bilde");
    var crop = ratio && ratio !== "auto";
    var fxCls = fx && fx !== "none" ? " np-ifx np-ifx--" + fx : "";
    return (
      '<figure class="np-figure' + (crop ? " np-figure--crop" : "") + fxCls + '"' + (crop ? ' style="aspect-ratio:' + RATIO[ratio] + '"' : "") + (fx === "zoom" ? " data-np-zoomimg" : "") + ">" +
      img(ctx, id, { alt: alt, sizes: sizes, field: fieldPrefix }) +
      "</figure>"
    );
  }

  R.image = function (ctx, s) {
    var p = s.props;
    var two = p.image2 && ctx.assets[p.image2];
    var sizes = p.size === "full" ? "100vw" : p.size === "wide" ? "(max-width: 1148px) 100vw, 1100px" : "(max-width: 748px) 100vw, 700px";
    if (two) sizes = sizes.replace(/100vw, (\d+)px/, function (_, n) { return "100vw, " + Math.round(n / 2) + "px"; });
    function one(id, alt, cap, key, capKey) {
      return (
        "<div>" +
        figure(ctx, id, alt, cap, key, p.ratio, sizes, p.fx) +
        (cap || (ctx.mode === "editor" && !two) || (p.credit && capKey === "caption")
          ? '<p class="np-figcap' + (cap ? "" : " np-ed-empty") + '"><span' + ed(ctx, capKey) + ">" + esc(cap) + "</span>" +
            (p.credit && capKey === "caption" ? ' <span class="np-credit">Foto: ' + esc(p.credit) + "</span>" : "") + "</p>"
          : "") +
        "</div>"
      );
    }
    var inner = two
      ? '<div class="np-pair">' + one(p.image, p.alt, p.caption, "image", "caption") + one(p.image2, p.alt2, p.caption2, "image2", "caption2") + "</div>"
      : one(p.image, p.alt, p.caption, "image", "caption");
    return wrapSection(ctx, s, wrap(p.size, inner));
  };

  R.imageText = function (ctx, s) {
    var p = s.props;
    var ratio = p.ratio && p.ratio !== "auto" ? ' style="aspect-ratio:' + RATIO[p.ratio] + '"' : "";
    var mediaHtml = p.image && ctx.assets[p.image]
      ? '<div class="np-it__media"' + ratio + ">" + img(ctx, p.image, { alt: p.alt, sizes: "(max-width: 599px) 100vw, 550px", field: "image" }) + "</div>"
      : '<div class="np-it__media">' + placeholder(ctx, "Velg et bilde") + "</div>";
    var link = p.ctaLabel && (p.ctaUrl || ctx.mode === "editor")
      ? '<a class="np-arrowlink"' + linkAttrs(ctx, p.ctaUrl, p.ctaLabel) + '><span class="np-arrowlink__c">' + ICONS.arrow + "</span><span" + ed(ctx, "ctaLabel") + ">" + esc(p.ctaLabel) + "</span></a>"
      : "";
    var body =
      '<div class="np-it__body">' +
      (p.title ? '<h2 class="np-h2"' + ed(ctx, "title") + ">" + esc(p.title) + "</h2>" : "") +
      '<div class="np-rich"' + ed(ctx, "html") + ">" + rich(p.html) + "</div>" +
      link +
      "</div>";
    return wrapSection(ctx, s, wrap("wide", '<div class="np-it np-it--' + p.side + '">' + mediaHtml + body + "</div>"));
  };

  R.factBox = function (ctx, s) {
    var p = s.props;
    var items = p.items.filter(function (it) { return it.text || ctx.mode === "editor"; });
    var fold = p.collapsible && items.length > 4;
    var body =
      '<div class="np-fact__body" id="np-fb-' + esc(s.id) + '">' +
      '<h2' + ed(ctx, "title") + ">" + esc(p.title) + "</h2>" +
      (p.intro ? '<p class="np-fact__intro"' + ed(ctx, "intro") + ">" + textHtml(p.intro) + "</p>" : "") +
      "<ul>" +
      items.map(function (it) {
        return "<li" + ed(ctx, "items." + it.id + ".text") + ">" + esc(it.text) + "</li>";
      }).join("") +
      "</ul></div>" +
      (fold && ctx.mode !== "editor"
        ? '<button class="np-fact__more" type="button" aria-expanded="false" aria-controls="np-fb-' + esc(s.id) + '"><span>Vis alle fakta</span>' + ICONS.down + "</button>"
        : "");
    return wrapSection(ctx, s, wrap("text", '<aside class="np-fact np-fact--' + p.variant + (fold ? " np-fact--fold" : "") + '" data-np-fold>' + body + "</aside>"));
  };

  R.cta = function (ctx, s) {
    var p = s.props;
    var inner;
    if (p.variant === "link") {
      inner = '<a class="np-arrowlink"' + linkAttrs(ctx, p.url, p.label) + '><span class="np-arrowlink__c">' + ICONS.arrow + "</span><span" + ed(ctx, "label") + ">" + esc(p.label) + "</span></a>";
      return wrapSection(ctx, s, wrap("text", '<div class="np-cta np-cta--link">' + inner + "</div>"));
    }
    var texts =
      (p.variant !== "button" ? heading(ctx, p.title, "title") : "") +
      (p.variant !== "button" && p.text ? '<p class="np-cta__text"' + ed(ctx, "text") + ">" + textHtml(p.text) + "</p>" : "") +
      '<div class="np-cta__btns">' + button(ctx, p.label, p.url, "label") + button(ctx, p.label2, p.url2, "label2", true) + "</div>";
    if (p.variant === "card") {
      var pic = p.image && ctx.assets[p.image] ? img(ctx, p.image, { decorative: true, sizes: "(max-width: 599px) 100vw, 560px" }) : placeholder(ctx, "Velg et bilde");
      inner = '<div class="np-cta np-cta--card"><div class="np-cta__img">' + pic + '</div><div class="np-cta__body">' + texts + "</div></div>";
      return wrapSection(ctx, s, wrap("wide", inner));
    }
    return wrapSection(ctx, s, wrap("text", '<div class="np-cta np-cta--' + p.variant + '">' + texts + "</div>"));
  };

  R.quote = function (ctx, s) {
    var p = s.props;
    var who = p.name || p.role
      ? '<figcaption class="np-quote__by">' +
        (p.image && ctx.assets[p.image] ? img(ctx, p.image, { decorative: true, sizes: "56px" }) : "") +
        "<span>" +
        (p.name ? '<span class="np-quote__name"' + ed(ctx, "name") + ">" + esc(p.name) + "</span>" : "") +
        (p.role ? '<span class="np-quote__role"' + ed(ctx, "role") + ">" + esc(p.role) + "</span>" : "") +
        "</span></figcaption>"
      : "";
    var inner = '<figure class="np-quote np-quote--' + p.size + '"><blockquote class="np-quote__text"' + ed(ctx, "text") + ">" + textHtml(p.text) + "</blockquote>" + who + "</figure>";
    return wrapSection(ctx, s, wrap("text", inner));
  };

  R.video = function (ctx, s) {
    var p = s.props;
    if (!p.video || !ctx.assets[p.video]) return wrapSection(ctx, s, wrap(p.size, placeholder(ctx, "Last opp eller velg en video")));
    var ambient = p.mode === "ambient";
    var desk = RATIO[p.ratio] || "16 / 9";
    var mob = RATIO[p.ratioMobile] || desk;
    var box =
      '<div class="np-video np-video--' + p.mode + '" style="aspect-ratio:' + desk + '">' +
      videoPair(ctx, p.video, p.videoMobile, { ambient: ambient, poster: p.poster || null, label: p.caption || "Video", decorative: ambient && !p.caption }) +
      "</div>";
    var style = mob !== desk ? "<style>@media (max-width:599px){#np-" + s.id + " .np-video{aspect-ratio:" + mob + "!important}}</style>" : "";
    var cap = p.caption ? '<p class="np-figcap"' + ed(ctx, "caption") + ">" + esc(p.caption) + "</p>" : "";
    return wrapSection(ctx, s, wrap(p.size, style + box + cap));
  };

  R.stickyStory = function (ctx, s) {
    var p = s.props;
    var layers = [];
    var base = media(ctx, p, { image: "image", imageMobile: "imageMobile", video: "video", videoMobile: "videoMobile" }, {});
    layers.push('<div class="np-story__layer is-active" data-np-layer="0">' + (base || placeholder(ctx, "Velg bakgrunn")) + "</div>");
    var cards = p.slides.map(function (sl, i) {
      var own = "";
      if (sl.video && ctx.assets[sl.video]) own = videoTag(ctx, sl.video, { ambient: true, decorative: true, poster: sl.image || null });
      else if (sl.image && ctx.assets[sl.image]) own = img(ctx, sl.image, { decorative: true, sizes: p.layout === "overlay" ? "100vw" : "50vw" });
      if (own) layers.push('<div class="np-story__layer" data-np-layer="' + layers.length + '">' + own + "</div>");
      var layerRef = own ? layers.length - 1 : null;
      return (
        '<div class="np-story__card" data-np-card' + (layerRef !== null ? ' data-np-show="' + layerRef + '"' : "") + ">" +
        '<div class="np-story__box">' +
        (sl.title ? '<h2 class="np-h2"' + ed(ctx, "slides." + sl.id + ".title") + ">" + esc(sl.title) + "</h2>" : "") +
        (sl.text ? "<p" + ed(ctx, "slides." + sl.id + ".text") + ">" + textHtml(sl.text) + "</p>" : "") +
        "</div></div>"
      );
    });
    var dots = p.dots && p.slides.length > 1
      ? '<div class="np-story__dots" aria-hidden="true">' + p.slides.map(function (_, i) { return "<i" + (i === 0 ? ' class="is-on"' : "") + "></i>"; }).join("") + "</div>"
      : "";
    var inner =
      '<div class="np-story__media" aria-hidden="true">' + layers.join("") + dots + "</div>" +
      '<div class="np-story__cards">' + cards.join("") + "</div>";
    var cls = ["np-story", "np-story--" + p.transition, "np-story--" + p.layout];
    if (p.layout === "overlay") cls.push("np-story--" + p.cardSide, "np-story--card-" + p.cardStyle);
    return wrapSection(ctx, s, '<div class="' + cls.join(" ") + '" data-np-story style="--np-overlay:' + (p.overlay / 100).toFixed(2) + '">' + inner + "</div>");
  };

  R.scrollVideo = function (ctx, s) {
    var p = s.props;
    if (!p.video || !ctx.assets[p.video]) return wrapSection(ctx, s, wrap("wide", placeholder(ctx, "Velg en video som skal spilles av med scroll")));
    var caps = p.captions.filter(function (c) { return c.text; }).map(function (c, i, all) {
      var from = (i + 0.3) / all.length;
      var to = (i + 0.95) / all.length;
      return '<p class="np-sv__cap" data-np-from="' + from.toFixed(3) + '" data-np-to="' + to.toFixed(3) + '"' + ed(ctx, "captions." + c.id + ".text") + ">" + esc(c.text) + "</p>";
    });
    var inner =
      '<div class="np-sv" data-np-scrollvideo style="--np-len:' + Number(p.length) + '"><div class="np-sv__stick">' +
      videoPair(ctx, p.video, p.videoMobile, { ambient: true, scrub: true, decorative: true }) +
      caps.join("") +
      "</div></div>";
    return wrapSection(ctx, s, inner);
  };

  R.parallaxImage = function (ctx, s) {
    var p = s.props;
    var speed = { slow: 0.15, medium: 0.3, fast: 0.5 }[p.speed] || 0.3;
    var image = p.image && ctx.assets[p.image]
      ? '<div class="np-para__img" data-np-parallax="' + speed + '">' + img(ctx, p.image, { alt: p.alt, sizes: "100vw", field: "image" }) + "</div>"
      : placeholder(ctx, "Velg et bilde");
    var title = p.title ? '<h2 class="np-para__t"' + ed(ctx, "title") + ">" + esc(p.title) + "</h2>" : "";
    return wrapSection(ctx, s, '<div class="np-para np-para--' + p.height + '">' + image + title + "</div>");
  };

  /**
   * How wide a number + unit is, in em of the number's font (digits about
   * 0.62 em, the unit at 0.45 em size). np.css divides the card's width by the
   * widest in the row, so "16 000 kWh" shrinks to fit instead of breaking at
   * the thousands space.
   */
  function statWidth(value, unit) {
    var w = String(value || "").length * 0.62;
    if (unit) w += 0.1 + String(unit).length * 0.62 * 0.45;
    return Math.max(1, Math.round(w * 1.04 * 100) / 100);
  }

  R.stats = function (ctx, s) {
    var p = s.props;
    var items = p.items.map(function (it, i) {
      return (
        '<div class="np-stat np-st"' + si(i) + ">" +
        '<div class="np-stat__v"><span' + (p.countUp ? " data-np-count" : "") + ed(ctx, "items." + it.id + ".value") + ">" + esc(it.value) + "</span>" +
        (it.unit ? '<span class="np-stat__u"' + ed(ctx, "items." + it.id + ".unit") + ">" + esc(it.unit) + "</span>" : "") +
        "</div>" +
        '<div class="np-stat__l"' + ed(ctx, "items." + it.id + ".label") + ">" + esc(it.label) + "</div>" +
        "</div>"
      );
    });
    var inner =
      (p.title ? '<h2 class="np-h2 np-stats__title"' + ed(ctx, "title") + ">" + esc(p.title) + "</h2>" : "") +
      // One size for the row: the widest number decides, so the cards match.
      '<div class="np-stats np-stats--' + (p.look || "plain") + '" style="--np-cols:' + Math.max(1, Math.min(4, p.items.length)) +
      ";--np-vw:" + Math.max.apply(null, p.items.map(function (it) { return statWidth(it.value, it.unit); }).concat([1])) + '">' + items.join("") + "</div>";
    return wrapSection(ctx, s, wrap("wide", inner));
  };

  R.productCards = function (ctx, s) {
    var p = s.props;
    var cards = p.items.map(function (it, i) {
      var tag = it.url ? "a" : "div";
      var open = it.url ? '<a class="np-prod np-st"' + si(i) + linkAttrs(ctx, it.url, it.name) + ">" : '<div class="np-prod np-st"' + si(i) + ">";
      return (
        open +
        (it.badge ? '<span class="np-prod__badge"' + ed(ctx, "items." + it.id + ".badge") + ">" + esc(it.badge) + "</span>" : "") +
        '<div class="np-prod__img">' + (it.image && ctx.assets[it.image] ? img(ctx, it.image, { alt: it.name, sizes: "(max-width: 599px) 50vw, 360px" }) : placeholder(ctx, "Bilde")) + "</div>" +
        '<div class="np-prod__b">' +
        '<span class="np-prod__name"' + ed(ctx, "items." + it.id + ".name") + ">" + esc(it.name) + "</span>" +
        (it.text ? '<span class="np-prod__text"' + ed(ctx, "items." + it.id + ".text") + ">" + esc(it.text) + "</span>" : "") +
        (it.price ? '<span class="np-prod__price"><span' + ed(ctx, "items." + it.id + ".price") + ">" + esc(it.price) + "</span>" + (it.oldPrice ? '<span class="np-prod__old">' + esc(it.oldPrice) + "</span>" : "") + "</span>" : "") +
        (it.url && p.buttonLabel ? '<span class="np-prod__cta">' + esc(p.buttonLabel) + " →</span>" : "") +
        "</div></" + tag + ">"
      );
    });
    var inner =
      (p.title ? '<h2 class="np-h2 np-prod__title"' + ed(ctx, "title") + ">" + esc(p.title) + "</h2>" : "") +
      (p.layout === "carousel"
        ? '<div class="np-gal--carousel np-prods-car" data-np-carousel><div class="np-gal__track np-prods np-prods--row" tabindex="0" role="region" aria-label="Produkter">' + cards.join("") + "</div>" +
          '<div class="np-gal__nav"><button type="button" data-np-prev aria-label="Forrige">' + ICONS.left + '</button><button type="button" data-np-next aria-label="Neste">' + ICONS.right + "</button></div></div>"
        : '<div class="np-prods" style="--np-cols:' + p.columns + '">' + cards.join("") + "</div>");
    return wrapSection(ctx, s, wrap("wide", inner, "np-prods-fit--" + (p.imageFit === "contain" ? "contain" : "cover")));
  };

  R.gallery = function (ctx, s) {
    var p = s.props;
    var items = p.items.filter(function (it) { return it.image && ctx.assets[it.image]; });
    if (!items.length) return wrapSection(ctx, s, wrap("wide", placeholder(ctx, "Legg til bilder i galleriet")));
    var lb = p.lightbox && ctx.mode !== "editor";
    var sizes = p.mode === "grid" || p.mode === "masonry" ? "(max-width: 599px) 50vw, 380px" : p.mode === "slideshow" ? "(max-width: 1148px) 100vw, 1100px" : "(max-width: 599px) 80vw, 760px";
    var figs = items.map(function (it, i) {
      var full = lb ? ' data-np-full="' + esc(bestSrc(ctx, it.image, 2000)) + '"' : "";
      return (
        '<figure class="np-st' + (p.mode === "slideshow" && i === 0 ? " is-on" : "") + '"' + si(i) + (p.mode === "slideshow" ? " data-np-slide" : "") + ">" +
        (lb ? '<button type="button" class="np-gal__zoom"' + full + ' aria-label="Vis bildet større">' : "") +
        img(ctx, it.image, { alt: it.alt, sizes: sizes, eager: false }) +
        (lb ? "</button>" : "") +
        (it.caption ? '<figcaption class="np-figcap">' + esc(it.caption) + "</figcaption>" : "") +
        "</figure>"
      );
    });
    var inner;
    if (p.mode === "grid" || p.mode === "masonry") {
      inner = '<div class="np-gal np-gal--' + p.mode + '"' + (lb ? " data-np-lightbox" : "") + ">" + figs.join("") + "</div>";
    } else if (p.mode === "slideshow") {
      inner =
        '<div class="np-gal np-gal--slideshow" data-np-slideshow' + (lb ? " data-np-lightbox" : "") + ">" +
        '<div class="np-gal__stage">' + figs.join("") + "</div>" +
        '<div class="np-gal__bar"><button type="button" data-np-prev aria-label="Forrige bilde">' + ICONS.left + "</button>" +
        '<span class="np-gal__count" aria-live="polite">1 / ' + items.length + "</span>" +
        '<button type="button" data-np-next aria-label="Neste bilde">' + ICONS.right + "</button></div></div>";
    } else {
      inner = '<div class="np-gal np-gal--carousel" data-np-carousel' + (lb ? " data-np-lightbox" : "") + '><div class="np-gal__track" tabindex="0" role="region" aria-label="Bildegalleri">' + figs.join("") + "</div>" +
        '<div class="np-gal__nav"><button type="button" data-np-prev aria-label="Forrige bilde">' + ICONS.left + '</button><button type="button" data-np-next aria-label="Neste bilde">' + ICONS.right + "</button></div></div>";
    }
    var width = p.mode === "carousel" ? "full" : "wide";
    return wrapSection(ctx, s, wrap(width, inner));
  };

  R.compare = function (ctx, s) {
    var p = s.props;
    if (!(p.before && ctx.assets[p.before] && p.after && ctx.assets[p.after])) {
      return wrapSection(ctx, s, wrap("wide", placeholder(ctx, "Velg et før- og et etter-bilde")));
    }
    var inner =
      '<div class="np-cmp" data-np-compare>' +
      img(ctx, p.before, { alt: p.alt, sizes: "(max-width: 1148px) 100vw, 1100px" }) +
      '<div class="np-cmp__after">' + img(ctx, p.after, { decorative: true, sizes: "(max-width: 1148px) 100vw, 1100px" }) + "</div>" +
      '<span class="np-cmp__line"></span>' +
      '<span class="np-cmp__lab np-cmp__lab--b">' + esc(p.beforeLabel) + "</span>" +
      '<span class="np-cmp__lab np-cmp__lab--a">' + esc(p.afterLabel) + "</span>" +
      '<input type="range" min="0" max="100" value="50" aria-label="Sammenlign før og etter">' +
      "</div>";
    return wrapSection(ctx, s, wrap("wide", inner));
  };

  R.accordion = function (ctx, s) {
    var p = s.props;
    var items = p.items.map(function (it) {
      return (
        "<details" + (ctx.mode === "editor" ? " open" : "") + "><summary" + ed(ctx, "items." + it.id + ".q") + ">" + esc(it.q) + "</summary>" +
        '<div class="np-acc__a"' + ed(ctx, "items." + it.id + ".a") + ">" + esc(it.a) + "</div></details>"
      );
    });
    var inner = (p.title ? '<h2 class="np-h2 np-acc__title"' + ed(ctx, "title") + ">" + esc(p.title) + "</h2>" : "") + '<div class="np-acc">' + items.join("") + "</div>";
    return wrapSection(ctx, s, wrap("text", inner));
  };

  R.quiz = function (ctx, s) {
    var p = s.props;
    var qs = p.questions.map(function (q, qi) {
      var options = String(q.options || "").split("\n").map(function (o) { return o.trim(); }).filter(Boolean).slice(0, 6);
      return (
        '<div class="np-quiz__q" data-np-q data-np-correct="' + Math.max(0, Math.min(options.length - 1, q.correct - 1)) + '">' +
        '<p class="np-quiz__n">Spørsmål ' + (qi + 1) + " av " + p.questions.length + "</p>" +
        '<p class="np-quiz__qt"' + ed(ctx, "questions." + q.id + ".q") + ">" + esc(q.q) + "</p>" +
        '<div class="np-quiz__opts" role="group">' +
        options.map(function (o, i) {
          return '<button type="button" class="np-quiz__opt" data-np-opt="' + i + '"><span class="np-quiz__l">' + "ABCDEF"[i] + "</span>" + esc(o) + "</button>";
        }).join("") +
        "</div>" +
        (q.explain ? '<details class="np-quiz__ex"><summary>Se svaret</summary><p>' + esc(options[q.correct - 1] || "") + " – " + textHtml(q.explain) + "</p></details>" : "") +
        "</div>"
      );
    });
    var results = (p.results || []).filter(function (r) { return r.title || r.text; }).map(function (r) {
      return '<div class="np-quiz__res" data-np-min="' + r.min + '" hidden><p class="np-quiz__rt">' + esc(r.title) + "</p>" + (r.text ? "<p>" + textHtml(r.text) + "</p>" : "") + "</div>";
    });
    var cta = p.ctaLabel ? '<div class="np-quiz__cta" hidden>' + button(ctx, p.ctaLabel, p.ctaUrl, "ctaLabel") + "</div>" : "";
    var inner =
      heading(ctx, p.title, "title", "np-quiz__title") +
      '<div class="np-quiz" data-np-quiz>' +
      '<div class="np-quiz__bar" aria-hidden="true"><i></i></div>' +
      qs.join("") +
      '<div class="np-quiz__end"><p class="np-quiz__score" aria-live="polite"></p>' + results.join("") + cta + "</div></div>";
    return wrapSection(ctx, s, wrap("text", inner));
  };

  var CHART_COLORS = ["--np-primary", "--np-accent", "--np-dark"];

  R.chart = function (ctx, s) {
    var p = s.props;
    var max = p.items.reduce(function (m, it) { return Math.max(m, Math.abs(it.value)); }, 0) || 1;
    var total = p.items.reduce(function (m, it) { return m + Math.max(0, it.value); }, 0) || 1;
    var fmt = function (v) {
      return String(Math.round(v * 10) / 10).replace(".", ",") + (p.unit ? " " + p.unit : "");
    };
    var hl = Number(p.highlight) || 0;
    var body;
    if (p.kind === "donut") {
      var acc = 0;
      var stops = [];
      var legend = p.items.map(function (it, i) {
        var share = Math.max(0, it.value) / total;
        var col = "color-mix(in srgb, var(--np-primary) " + Math.max(18, 100 - i * 18) + "%, var(--np-accent))";
        if (i % 2 === 1) col = "color-mix(in srgb, var(--np-accent) " + Math.max(25, 100 - i * 15) + "%, var(--np-soft))";
        stops.push(col + " " + (acc * 100).toFixed(2) + "% " + ((acc + share) * 100).toFixed(2) + "%");
        acc += share;
        return '<li class="np-st"' + si(i) + '><i style="background:' + col + '"></i><span' + ed(ctx, "items." + it.id + ".label") + ">" + esc(it.label) + "</span><strong>" + esc(fmt(it.value)) + "</strong></li>";
      });
      body =
        '<div class="np-donut"><div class="np-donut__ring" style="background:conic-gradient(' + stops.join(",") + ')"><span>' +
        esc(p.items[hl ? hl - 1 : 0] ? fmt(p.items[hl ? hl - 1 : 0].value) : "") + "</span></div>" +
        '<ul class="np-donut__legend">' + legend.join("") + "</ul></div>";
    } else if (p.kind === "column") {
      body =
        '<div class="np-cols" style="--n:' + p.items.length + '">' +
        p.items.map(function (it, i) {
          var pct = Math.max(2, Math.round((Math.abs(it.value) / max) * 100));
          return (
            '<div class="np-col' + (hl === i + 1 ? " is-hl" : "") + '"' + si(i) + '><span class="np-col__v">' + esc(fmt(it.value)) + "</span>" +
            '<div class="np-col__bar"><div class="np-col__fill" style="height:' + pct + '%"></div></div>' +
            '<span class="np-col__lab"' + ed(ctx, "items." + it.id + ".label") + ">" + esc(it.label) + "</span></div>"
          );
        }).join("") +
        "</div>";
    } else {
      body = p.items.map(function (it, i) {
        var pct = Math.max(2, Math.round((Math.abs(it.value) / max) * 100));
        return (
          '<div class="np-chart__row' + (hl === i + 1 ? " is-hl" : "") + '"><span class="np-chart__lab"' + ed(ctx, "items." + it.id + ".label") + ">" + esc(it.label) + "</span>" +
          '<div class="np-chart__bar"><div class="np-chart__fill" style="width:' + pct + "%;--i:" + i + '">' + esc(fmt(it.value)) + "</div></div></div>"
        );
      }).join("");
    }
    var inner =
      heading(ctx, p.title, "title", "np-chart__title") +
      '<figure class="np-chart np-chart--' + p.kind + '" style="margin:0" role="img" aria-label="' + esc((p.title || "Diagram") + ": " + p.items.map(function (it) { return it.label + " " + fmt(it.value); }).join(", ")) + '">' + body + "</figure>" +
      (p.source ? '<p class="np-chart__src"' + ed(ctx, "source") + ">Kilde: " + esc(p.source) + "</p>" : "");
    return wrapSection(ctx, s, wrap(p.kind === "column" ? "wide" : "text", inner));
  };

  /** Only well-known players, rewritten to their embed URL. Anything else → "". */
  function embedUrl(raw) {
    var u;
    try {
      u = new URL(raw);
    } catch (_) {
      return "";
    }
    var host = u.hostname.replace(/^www\./, "");
    var m;
    if (host === "youtube.com" || host === "m.youtube.com") {
      var v = u.searchParams.get("v");
      if (v && /^[\w-]{6,20}$/.test(v)) return "https://www.youtube-nocookie.com/embed/" + v;
      if ((m = /^\/(embed|shorts)\/([\w-]{6,20})/.exec(u.pathname))) return "https://www.youtube-nocookie.com/embed/" + m[2];
    }
    if (host === "youtu.be" && (m = /^\/([\w-]{6,20})/.exec(u.pathname))) return "https://www.youtube-nocookie.com/embed/" + m[1];
    if (host === "youtube-nocookie.com" && (m = /^\/embed\/([\w-]{6,20})/.exec(u.pathname))) return "https://www.youtube-nocookie.com/embed/" + m[1];
    if (host === "vimeo.com" && (m = /^\/(\d{5,12})/.exec(u.pathname))) return "https://player.vimeo.com/video/" + m[1] + "?dnt=1";
    if (host === "player.vimeo.com" && (m = /^\/video\/(\d{5,12})/.exec(u.pathname))) return "https://player.vimeo.com/video/" + m[1] + "?dnt=1";
    if ((host === "public.flourish.studio" || host === "flo.uri.sh") && (m = /^\/(visualisation|story)\/(\d{3,12})/.exec(u.pathname))) {
      return "https://flo.uri.sh/" + m[1] + "/" + m[2] + "/embed";
    }
    if (host === "datawrapper.dwcdn.net" && (m = /^\/(\w{5})\/(\d+\/)?/.exec(u.pathname))) return "https://datawrapper.dwcdn.net/" + m[1] + "/" + (m[2] || "");
    if (host === "open.spotify.com" && (m = /^\/(?:embed\/)?(track|episode|show|playlist|album)\/(\w{10,30})/.exec(u.pathname))) {
      return "https://open.spotify.com/embed/" + m[1] + "/" + m[2];
    }
    if (host === "google.com" && /^\/maps\/embed/.test(u.pathname)) return u.href;
    return "";
  }

  R.embed = function (ctx, s) {
    var p = s.props;
    var src = embedUrl(p.url);
    if (!src) return wrapSection(ctx, s, wrap("wide", placeholder(ctx, p.url ? "Denne lenken kan ikke bygges inn" : "Lim inn en lenke (YouTube, Vimeo, Flourish …)")));
    var frame =
      '<div class="np-embed" style="aspect-ratio:' + (RATIO[p.ratio] || "16 / 9") + '">' +
      (ctx.mode === "editor"
        ? '<div class="np-ph" style="position:absolute;inset:0;border-radius:0">Innbygging: ' + esc(src.replace(/^https:\/\//, "").slice(0, 60)) + "</div>"
        : "<iframe" + attrs({
            src: src,
            title: p.title || "Innebygd innhold",
            loading: "lazy",
            allow: "autoplay; encrypted-media; fullscreen; picture-in-picture",
            allowfullscreen: true,
            referrerpolicy: "strict-origin-when-cross-origin",
          }) + "></iframe>") +
      "</div>";
    return wrapSection(ctx, s, wrap("wide", frame));
  };

  R.divider = function (ctx, s) {
    return wrapSection(ctx, s, wrap("text", s.props.line ? '<hr class="np-hr">' : '<div aria-hidden="true"></div>'));
  };

  // ---- new blocks (v2) ------------------------------------------------------------
  R.statement = function (ctx, s) {
    var p = s.props;
    var fx = p.fx || "none";
    var body;
    if (ctx.mode === "editor") body = esc(p.text);
    else if (fx === "typewriter") body = '<span class="np-tw" data-np-typewriter data-text="' + esc(p.text) + '">' + esc(p.text) + "</span>";
    else body = accentWords(p.text, p.accent);
    var inner =
      (p.kicker ? '<p class="np-kicker"' + ed(ctx, "kicker") + ">" + esc(p.kicker) + "</p>" : "") +
      '<p class="np-statement np-statement--' + p.size + " np-sfont-" + p.font + " np-sfx-" + fx + '"' + (fx === "scroll" || fx === "outline" ? " data-np-words" : "") + ed(ctx, "text") + ' aria-label="' + esc(p.text) + '">' + body + "</p>";
    return wrapSection(ctx, s, wrap("wide", inner));
  };

  var SEP = { dot: "•", bar: "│", star: "✦", dash: "—", slash: "/" };

  R.marquee = function (ctx, s) {
    var p = s.props;
    var unit = "";
    for (var i = 0; i < 6; i++) {
      unit += '<span class="np-mq__t' + (p.outline && i % 2 ? " np-mq__t--o" : "") + '">' + esc(p.text) + '</span><span class="np-mq__s">' + SEP[p.sep] + "</span>";
    }
    var inner =
      '<div class="np-mq np-mq--' + p.size + " np-mq--" + p.speed + " np-mq--" + p.dir + '"' + (p.scrollLinked ? " data-np-mqscroll" : "") + ed(ctx, "text") + ">" +
      '<span class="np-sr">' + esc(p.text) + "</span>" +
      '<div class="np-mq__track" aria-hidden="true"><div class="np-mq__run">' + unit + '</div><div class="np-mq__run">' + unit + "</div></div></div>";
    return wrapSection(ctx, s, inner);
  };

  R.chapter = function (ctx, s) {
    var p = s.props;
    var bg = p.image && ctx.assets[p.image] ? '<div class="np-chap__bg" aria-hidden="true">' + img(ctx, p.image, { decorative: true, sizes: "100vw" }) + "</div>" : "";
    var inner =
      '<div class="np-chap np-chap--' + p.layout + '">' +
      (p.label ? '<p class="np-chap__label"' + ed(ctx, "label") + ">" + esc(p.label) + "</p>" : "") +
      '<h2 class="np-chap__title"' + ed(ctx, "title") + ">" + esc(p.title) + "</h2>" +
      (p.intro ? '<p class="np-chap__intro"' + ed(ctx, "intro") + ">" + textHtml(p.intro) + "</p>" : "") +
      "</div>";
    return wrapSection(ctx, s, bg + wrap(p.layout === "center" ? "text" : "wide", inner), { cls: bg ? ["np-chap-has-bg"] : null });
  };

  function specLines(text) {
    return String(text || "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var at = l.indexOf(":");
      return at > 0 ? { k: l.slice(0, at).trim(), v: l.slice(at + 1).trim() } : { k: "", v: l };
    });
  }

  R.rankList = function (ctx, s) {
    var p = s.props;
    var n = p.items.length;
    var items = p.items.map(function (it, i) {
      var num = p.order === "down" ? n - i : i + 1;
      var specs = specLines(it.specs);
      var path = "items." + it.id + ".";
      return (
        '<article class="np-rank__item np-st"' + si(i) + ">" +
        '<div class="np-rank__num" aria-hidden="true">' + num + "</div>" +
        (it.image && ctx.assets[it.image] ? '<div class="np-rank__img">' + img(ctx, it.image, { alt: it.title, sizes: p.layout === "scenes" ? "100vw" : "(max-width: 599px) 100vw, 520px" }) + "</div>" : p.layout === "list" ? "" : "") +
        '<div class="np-rank__body">' +
        '<h3 class="np-rank__t"><span class="np-sr">' + num + ". </span><span" + ed(ctx, path + "title") + ">" + esc(it.title) + "</span></h3>" +
        (it.text ? '<p class="np-rank__text"' + ed(ctx, path + "text") + ">" + textHtml(it.text) + "</p>" : "") +
        (specs.length ? '<dl class="np-rank__specs">' + specs.map(function (sp) { return "<div>" + (sp.k ? "<dt>" + esc(sp.k) + "</dt>" : "") + "<dd>" + esc(sp.v) + "</dd></div>"; }).join("") + "</dl>" : "") +
        (it.fact ? '<p class="np-rank__fact"><strong>Visste du?</strong> <span' + ed(ctx, path + "fact") + ">" + esc(it.fact) + "</span></p>" : "") +
        "</div></article>"
      );
    });
    var inner = heading(ctx, p.title, "title", "np-rank__title") + '<div class="np-rank np-rank--' + p.layout + '">' + items.join("") + "</div>";
    return wrapSection(ctx, s, p.layout === "scenes" ? '<div class="np-wrap np-w-wide">' + heading(ctx, p.title, "title", "np-rank__title") + "</div>" + '<div class="np-rank np-rank--scenes">' + items.join("") + "</div>" : wrap("wide", inner));
  };

  R.steps = function (ctx, s) {
    var p = s.props;
    var items = p.items.map(function (it, i) {
      var path = "items." + it.id + ".";
      return (
        '<li class="np-step np-st"' + si(i) + ">" +
        (it.image && ctx.assets[it.image] ? '<div class="np-step__img">' + img(ctx, it.image, { alt: it.title, sizes: "(max-width: 599px) 100vw, 360px" }) + "</div>" : "") +
        '<span class="np-step__n" aria-hidden="true">' + (i + 1) + "</span>" +
        '<h3 class="np-step__t"' + ed(ctx, path + "title") + ">" + esc(it.title) + "</h3>" +
        (it.text ? '<p class="np-step__text"' + ed(ctx, path + "text") + ">" + textHtml(it.text) + "</p>" : "") +
        "</li>"
      );
    });
    var inner = heading(ctx, p.title, "title", "np-steps__title") + '<ol class="np-steps np-steps--' + p.layout + '" style="--n:' + p.items.length + '">' + items.join("") + "</ol>";
    return wrapSection(ctx, s, wrap(p.layout === "row" ? "wide" : "text", inner));
  };

  R.cards = function (ctx, s) {
    var p = s.props;
    var items = p.items.map(function (it, i) {
      var path = "items." + it.id + ".";
      var hasImg = it.image && ctx.assets[it.image];
      var iconId = cardIcon(it);
      var tag = it.url && (p.look === "tile" || p.look === "overlay") ? "a" : "div";
      var open = tag === "a" ? '<a class="np-card np-st"' + si(i) + linkAttrs(ctx, it.url, it.title) + ">" : '<div class="np-card np-st"' + si(i) + ">";
      var link = tag === "div" && it.linkLabel && (it.url || ctx.mode === "editor")
        ? '<a class="np-card__link"' + linkAttrs(ctx, it.url, it.linkLabel) + "><span" + ed(ctx, path + "linkLabel") + ">" + esc(it.linkLabel) + "</span>" + ICONS.arrow + "</a>"
        : "";
      return (
        open +
        (hasImg ? '<div class="np-card__img">' + img(ctx, it.image, { alt: p.look === "overlay" || p.look === "tile" ? "" : it.title, decorative: p.look === "overlay" || p.look === "tile", sizes: "(max-width: 599px) 100vw, 420px" }) + "</div>" : "") +
        '<div class="np-card__b">' +
        (iconId
          ? '<span class="np-card__ico">' + lineIcon(iconId) + "</span>"
          : it.symbol ? '<span class="np-card__sym' + (/\p{Extended_Pictographic}/u.test(it.symbol) ? " np-card__sym--emoji" : "") + '"' + ed(ctx, path + "symbol") + ">" + esc(it.symbol) + "</span>" : "") +
        (it.title ? '<h3 class="np-card__t"' + ed(ctx, path + "title") + ">" + esc(it.title) + "</h3>" : "") +
        (it.text && p.look !== "tile" ? '<p class="np-card__text"' + ed(ctx, path + "text") + ">" + textHtml(it.text) + "</p>" : "") +
        link +
        (tag === "a" ? '<span class="np-card__go" aria-hidden="true">' + ICONS.arrow + "</span>" : "") +
        "</div></" + tag + ">"
      );
    });
    var inner =
      (p.title || p.intro ? '<div class="np-cards__head">' + heading(ctx, p.title, "title") + (p.intro ? '<p class="np-cards__intro"' + ed(ctx, "intro") + ">" + textHtml(p.intro) + "</p>" : "") + "</div>" : "") +
      '<div class="np-cards np-cards--' + p.look + '" style="--np-cols:' + p.columns + '"' + (p.tilt ? " data-np-tilt" : "") + ">" + items.join("") + "</div>";
    return wrapSection(ctx, s, wrap("wide", inner));
  };

  R.tabs = function (ctx, s) {
    var p = s.props;
    var base = "np-tab-" + s.id;
    var list = p.items.map(function (it, i) {
      return '<button type="button" role="tab" id="' + base + "-t" + i + '" aria-controls="' + base + "-p" + i + '" aria-selected="' + (i === 0) + '"' + (i ? ' tabindex="-1"' : "") + ed(ctx, "items." + it.id + ".label") + ">" + esc(it.label || "Fane " + (i + 1)) + "</button>";
    });
    var panels = p.items.map(function (it, i) {
      var path = "items." + it.id + ".";
      var hasImg = it.image && ctx.assets[it.image];
      return (
        '<div class="np-tabs__panel' + (hasImg ? " has-img" : "") + '" role="tabpanel" id="' + base + "-p" + i + '" aria-labelledby="' + base + "-t" + i + '"' + (i && ctx.mode !== "editor" ? " hidden" : "") + ">" +
        (hasImg ? '<div class="np-tabs__img">' + img(ctx, it.image, { alt: it.title, sizes: "(max-width: 599px) 100vw, 540px" }) + "</div>" : "") +
        '<div class="np-tabs__body">' +
        (ctx.mode === "editor" && i ? '<p class="np-ed-tablabel">Fane: ' + esc(it.label) + "</p>" : "") +
        heading(ctx, it.title, path + "title") +
        '<div class="np-rich"' + ed(ctx, path + "html") + ">" + rich(it.html) + "</div>" +
        (it.ctaLabel ? '<a class="np-arrowlink"' + linkAttrs(ctx, it.ctaUrl, it.ctaLabel) + '><span class="np-arrowlink__c">' + ICONS.arrow + "</span><span" + ed(ctx, path + "ctaLabel") + ">" + esc(it.ctaLabel) + "</span></a>" : "") +
        "</div></div>"
      );
    });
    var inner =
      heading(ctx, p.title, "title", "np-tabs__title") +
      '<div class="np-tabs np-tabs--' + p.look + '" data-np-tabs><div class="np-tabs__list" role="tablist">' + list.join("") + "</div>" + panels.join("") + "</div>";
    return wrapSection(ctx, s, wrap("wide", inner));
  };

  R.hotspots = function (ctx, s) {
    var p = s.props;
    if (!p.image || !ctx.assets[p.image]) return wrapSection(ctx, s, wrap("wide", heading(ctx, p.title, "title") + placeholder(ctx, "Velg et bilde og plasser punktene")));
    var pts = p.items.map(function (it, i) {
      var id = "np-hs-" + s.id + "-" + i;
      var right = it.x > 60;
      return (
        '<div class="np-hs__pt' + (right ? " is-right" : "") + (it.y > 65 ? " is-up" : "") + '" style="left:' + it.x + "%;top:" + it.y + '%">' +
        '<button type="button" class="np-hs__dot" aria-expanded="false" aria-controls="' + id + '" data-np-hs-i="' + i + '"><span>' + (i + 1) + '</span><span class="np-sr">: ' + esc(it.title) + "</span></button>" +
        '<div class="np-hs__pop" id="' + id + '" role="note"><strong' + ed(ctx, "items." + it.id + ".title") + ">" + esc(it.title) + "</strong>" + (it.text ? "<p" + ed(ctx, "items." + it.id + ".text") + ">" + textHtml(it.text) + "</p>" : "") + "</div>" +
        "</div>"
      );
    });
    var list = '<ol class="np-hs__list">' + p.items.map(function (it) { return "<li><strong>" + esc(it.title) + "</strong> " + esc(it.text) + "</li>"; }).join("") + "</ol>";
    var title = heading(ctx, p.title, "title", "np-hs__title");
    var picture = '<div class="np-hs" data-np-hotspots' + (ctx.mode === "editor" ? ' data-np-hs-edit="1"' : "") + ">" + img(ctx, p.image, { alt: p.alt, sizes: p.size === "full" ? "100vw" : "(max-width: 1148px) 100vw, 1100px", field: "image" }) + pts.join("") + "</div>";
    // Full size: only the picture goes edge to edge; the title and the
    // no-script list keep the page's side margins.
    if (p.size === "full") return wrapSection(ctx, s, (title ? wrap("wide", title) : "") + wrap("full", picture) + wrap("wide", list));
    return wrapSection(ctx, s, wrap(p.size, title + picture + list));
  };

  var FLIP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 0 1 14.6-5.9L20.5 8.5"/><path d="M20.5 3.5v5h-5"/><path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9L3.5 15.5"/><path d="M3.5 20.5v-5h5"/></svg>';

  R.flipCards = function (ctx, s) {
    var p = s.props;
    var items = p.items.map(function (it, i) {
      var path = "items." + it.id + ".";
      var hasImg = it.image && ctx.assets[it.image];
      return (
        '<button type="button" class="np-flip np-st"' + si(i) + ' aria-pressed="false" data-np-flip>' +
        '<span class="np-flip__in">' +
        '<span class="np-flip__f' + (hasImg ? " has-img" : "") + '">' + (hasImg ? img(ctx, it.image, { decorative: true, sizes: "(max-width: 599px) 50vw, 360px" }) : "") +
        (hasImg ? "" : '<span class="np-flip__n" aria-hidden="true">' + (i < 9 ? "0" : "") + (i + 1) + "</span>") +
        "<span" + ed(ctx, path + "front") + ">" + esc(it.front) + "</span>" +
        '<i aria-hidden="true">' + FLIP_ICON + "<b>Snu</b></i></span>" +
        '<span class="np-flip__b"><strong' + ed(ctx, path + "backTitle") + ">" + esc(it.backTitle) + "</strong><span" + ed(ctx, path + "back") + ">" + textHtml(it.back) + "</span></span>" +
        "</span></button>"
      );
    });
    var inner =
      heading(ctx, p.title, "title", "np-flips__title") +
      (p.hint ? '<p class="np-flips__hint"' + ed(ctx, "hint") + ">" + esc(p.hint) + "</p>" : "") +
      '<div class="np-flips" style="--np-cols:' + p.columns + '">' + items.join("") + "</div>";
    return wrapSection(ctx, s, wrap("wide", inner));
  };

  R.timeline = function (ctx, s) {
    var p = s.props;
    var items = p.items.map(function (it, i) {
      var path = "items." + it.id + ".";
      return (
        '<li class="np-tl__item np-st"' + si(i) + ">" +
        '<span class="np-tl__label"' + ed(ctx, path + "label") + ">" + esc(it.label) + "</span>" +
        '<div class="np-tl__body">' +
        '<h3 class="np-tl__t"' + ed(ctx, path + "title") + ">" + esc(it.title) + "</h3>" +
        (it.text ? "<p" + ed(ctx, path + "text") + ">" + textHtml(it.text) + "</p>" : "") +
        (it.image && ctx.assets[it.image] ? '<div class="np-tl__img">' + img(ctx, it.image, { alt: it.title, sizes: "(max-width: 599px) 100vw, 560px" }) + "</div>" : "") +
        "</div></li>"
      );
    });
    var inner = heading(ctx, p.title, "title", "np-tl__title") + '<ol class="np-tl" data-np-timeline>' + items.join("") + "</ol>";
    return wrapSection(ctx, s, wrap("text", inner));
  };

  R.specTable = function (ctx, s) {
    var p = s.props;
    var heads = [p.head1, p.head2, p.head3];
    var cols = 1 + (p.head2 || p.rows.some(function (r) { return r.v2; }) ? 1 : 0) + (p.head3 || p.rows.some(function (r) { return r.v3; }) ? 1 : 0);
    var hl = Number(p.highlight) || 0;
    var hasHead = heads.slice(0, cols).some(Boolean);
    function cell(v, c, tag) {
      return "<" + tag + (hl === c ? ' class="is-hl"' : "") + ">" + esc(v) + "</" + tag + ">";
    }
    var head = hasHead ? "<thead><tr><td></td>" + heads.slice(0, cols).map(function (hd, i) { return cell(hd, i + 1, "th"); }).join("") + "</tr></thead>" : "";
    var rows = p.rows.map(function (r) {
      return '<tr><th scope="row"' + ed(ctx, "rows." + r.id + ".label") + ">" + esc(r.label) + "</th>" + [r.v1, r.v2, r.v3].slice(0, cols).map(function (v, i) { return cell(v, i + 1, "td"); }).join("") + "</tr>";
    });
    var inner =
      heading(ctx, p.title, "title", "np-spec__title") +
      '<div class="np-spec__wrap" tabindex="0" role="region" aria-label="' + esc(p.title || "Tabell") + '"><table class="np-spec np-spec--c' + cols + '">' + head + "<tbody>" + rows.join("") + "</tbody></table></div>" +
      (p.note ? '<p class="np-spec__note"' + ed(ctx, "note") + ">" + esc(p.note) + "</p>" : "");
    return wrapSection(ctx, s, wrap(cols > 1 ? "wide" : "text", inner));
  };

  R.hScroll = function (ctx, s) {
    var p = s.props;
    var panels = p.items.map(function (it, i) {
      var path = "items." + it.id + ".";
      var hasImg = it.image && ctx.assets[it.image];
      return (
        '<article class="np-hx__p' + (hasImg ? " has-img" : "") + '">' +
        (hasImg ? '<div class="np-hx__img">' + img(ctx, it.image, { decorative: true, sizes: p.panel === "full" ? "100vw" : "(max-width: 599px) 85vw, 640px" }) + "</div>" : "") +
        '<div class="np-hx__b">' +
        (it.label ? '<span class="np-hx__l"' + ed(ctx, path + "label") + ">" + esc(it.label) + "</span>" : '<span class="np-hx__l">' + String(i + 1).padStart(2, "0") + "</span>") +
        '<h3 class="np-hx__t"' + ed(ctx, path + "title") + ">" + esc(it.title) + "</h3>" +
        (it.text ? "<p" + ed(ctx, path + "text") + ">" + textHtml(it.text) + "</p>" : "") +
        "</div></article>"
      );
    });
    var inner =
      '<div class="np-hx np-hx--' + p.panel + '" data-np-hscroll style="--n:' + p.items.length + '"><div class="np-hx__pin">' +
      (p.title ? wrap("wide", heading(ctx, p.title, "title", "np-hx__title")) : "") +
      '<div class="np-hx__track" tabindex="0" role="region" aria-label="' + esc(p.title || "Paneler") + '">' + panels.join("") + "</div>" +
      '<div class="np-hx__bar" aria-hidden="true"><i></i></div>' +
      "</div></div>";
    return wrapSection(ctx, s, inner);
  };

  R.testimonials = function (ctx, s) {
    var p = s.props;
    var items = p.items.map(function (it, i) {
      var path = "items." + it.id + ".";
      var look = p.look || "round";
      var portrait = it.video && ctx.assets[it.video]
        ? '<div class="np-tm__media np-tm__media--v">' + videoTag(ctx, it.video, { ambient: true, decorative: true, poster: it.image || null }) + "</div>"
        : look !== "none" && it.image && ctx.assets[it.image] ? '<div class="np-tm__media">' + img(ctx, it.image, { decorative: true, sizes: look === "portrait" ? "(max-width: 599px) 100vw, 380px" : "200px" }) + "</div>" : "";
      return (
        '<figure class="np-tm np-st' + (it.video && ctx.assets[it.video] ? " np-tm--video" : "") + '"' + si(i) + ">" + portrait +
        '<blockquote class="np-tm__q"' + ed(ctx, path + "quote") + ">" + textHtml(it.quote) + "</blockquote>" +
        '<figcaption><span class="np-tm__name"' + ed(ctx, path + "name") + ">" + esc(it.name) + "</span>" + (it.role ? '<span class="np-tm__role"' + ed(ctx, path + "role") + ">" + esc(it.role) + "</span>" : "") + "</figcaption>" +
        "</figure>"
      );
    });
    var list = p.layout === "carousel"
      ? '<div class="np-gal--carousel" data-np-carousel><div class="np-gal__track np-tms np-tms--row" tabindex="0" role="region" aria-label="Sitater">' + items.join("") + "</div>" +
        '<div class="np-gal__nav"><button type="button" data-np-prev aria-label="Forrige">' + ICONS.left + '</button><button type="button" data-np-next aria-label="Neste">' + ICONS.right + "</button></div></div>"
      : '<div class="np-tms" style="--np-cols:' + Math.min(3, Math.max(1, p.items.length)) + '">' + items.join("") + "</div>";
    return wrapSection(ctx, s, wrap("wide", heading(ctx, p.title, "title", "np-tms__title") + list, "np-tms-look--" + (p.look || "round")));
  };

  R.poll = function (ctx, s) {
    var p = s.props;
    var opts = p.options.filter(function (o) { return o.label || ctx.mode === "editor"; }).map(function (o, i) {
      return '<button type="button" class="np-poll__opt" data-np-vote="' + esc(o.id) + '"' + si(i) + "><span class=\"np-poll__l\"" + ed(ctx, "options." + o.id + ".label") + ">" + esc(o.label) + '</span><span class="np-poll__pct"></span><i class="np-poll__bar"></i></button>';
    });
    var inner =
      '<div class="np-poll" data-np-poll="' + esc(s.id) + '"' + (p.showResults ? " data-np-results" : "") + ' data-np-thanks="' + esc(p.thanks) + '">' +
      '<p class="np-poll__q"' + ed(ctx, "question") + ">" + esc(p.question) + "</p>" +
      '<div class="np-poll__opts">' + opts.join("") + "</div>" +
      '<p class="np-poll__msg" aria-live="polite"></p></div>';
    return wrapSection(ctx, s, wrap("text", inner));
  };

  /** "2026-12-24 18:00" in Norwegian time → epoch ms (CET/CEST by the EU rule). */
  function osloTime(text) {
    var m = /^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d))?$/.exec(String(text || "").trim());
    if (!m) return 0;
    var y = +m[1], mo = +m[2], d = +m[3], hh = +(m[4] || 0), mi = +(m[5] || 0);
    var utc = Date.UTC(y, mo - 1, d, hh, mi);
    function lastSunday(month) {
      var dt = new Date(Date.UTC(y, month + 1, 0, 1));
      dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
      return dt.getTime();
    }
    var summer = utc - 3600000 >= lastSunday(2) && utc - 7200000 < lastSunday(9);
    return utc - (summer ? 2 : 1) * 3600000;
  }

  R.countdown = function (ctx, s) {
    var p = s.props;
    var at = osloTime(p.date);
    var units = [["d", "dager"], ["h", "timer"], ["m", "minutter"], ["s", "sekunder"]];
    var inner =
      heading(ctx, p.title, "title", "np-cd__title") +
      '<div class="np-cd" data-np-countdown="' + at + '" data-done="' + esc(p.done) + '">' +
      '<div class="np-cd__units">' + units.map(function (u) { return '<div class="np-cd__u"><span class="np-cd__v" data-u="' + u[0] + '">00</span><span class="np-cd__l">' + u[1] + "</span></div>"; }).join("") + "</div>" +
      '<p class="np-cd__date">' + (at ? esc(new Date(at).toLocaleString("nb-NO", { timeZone: "Europe/Oslo", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })) : "Ugyldig dato") + "</p>" +
      "</div>" +
      (p.ctaLabel ? '<div class="np-cta__btns">' + button(ctx, p.ctaLabel, p.ctaUrl, "ctaLabel") + "</div>" : "");
    return wrapSection(ctx, s, wrap("text", '<div class="np-cdwrap">' + inner + "</div>"));
  };

  R.sources = function (ctx, s) {
    var p = s.props;
    var items = p.items.filter(function (it) { return it.text || ctx.mode === "editor"; }).map(function (it) {
      var t = '<span' + ed(ctx, "items." + it.id + ".text") + ">" + esc(it.text) + "</span>";
      return "<li>" + t + (it.url ? ' <a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)) + "</a>" : "") + "</li>";
    });
    return wrapSection(ctx, s, wrap("text", '<div class="np-src"><h2 class="np-src__t"' + ed(ctx, "title") + ">" + esc(p.title) + "</h2><ol>" + items.join("") + "</ol></div>"));
  };

  function renderSection(ctx, section, index) {
    var fn = R[section.type];
    if (!fn) return "";
    return fn(ctx, section, index === 0);
  }

  // ---- fixed parts -------------------------------------------------------------
  function label(settings, project) {
    var name = project.advertiser.name || "annonsør";
    var tpl = settings.disclosureLabel || "Annonsørinnhold fra {annonsør}";
    var parts = tpl.split("{annonsør}");
    return parts.map(esc).join("<strong>" + esc(name) + "</strong>");
  }

  function logoOrWord(ctx, assetId, word, cls) {
    if (assetId && ctx.assets[assetId]) return img(ctx, assetId, { alt: word, eager: true, sizes: "150px", cls: cls });
    return '<span class="np-disclosure__word">' + esc(word) + "</span>";
  }

  function disclosure(ctx) {
    var st = ctx.settings;
    var p = ctx.project;
    var pubHref = st.publisherUrl ? ' href="' + esc(st.publisherUrl) + '"' : "";
    var advHref = p.advertiser.url ? ' href="' + esc(outbound(ctx, p.advertiser.url)) + '" target="_blank" rel="sponsored noopener"' : "";
    return (
      '<header class="np-disclosure' + (ctx.assets[p.advertiser.logo || p.theme.logo] ? "" : " np-disclosure--advword") + '" role="banner" id="np-top"><div class="np-disclosure__in">' +
      "<a class=\"np-disclosure__pub\"" + pubHref + ' aria-label="' + esc(st.publisherName || "ABC Nyheter") + '">' +
      logoOrWord(ctx, st.publisherLogo, st.publisherName || "ABC Nyheter") + "</a>" +
      '<span class="np-disclosure__label">' + label(st, p) + "</span>" +
      "<a class=\"np-disclosure__adv\"" + advHref + ' aria-label="' + esc(p.advertiser.name || "Annonsør") + '">' +
      logoOrWord(ctx, p.advertiser.logo || p.theme.logo, p.advertiser.name || "") + "</a>" +
      "</div></header>"
    );
  }

  function variantNav(ctx) {
    var p = ctx.project;
    if (!p.variantNav || p.pages.length < 2) return "";
    return (
      '<nav class="np-variants" aria-label="Versjoner"><div class="np-variants__in">' +
      p.pages.map(function (pg) {
        var current = pg.id === ctx.page.id;
        return "<a" + attrs({ href: ctx.pageHref(pg), "aria-current": current ? "page" : null }) + ">" + esc(pg.label) + "</a>";
      }).join("") +
      "</div></nav>"
    );
  }

  function feedbackBox(ctx) {
    var x = ctx.project.extras || {};
    if (!x.feedback) return "";
    return (
      '<div class="np-fb" data-np-feedback><p class="np-fb__q">' + esc(x.feedbackQ) + "</p>" +
      '<div class="np-fb__btns"><button type="button" data-np-fb="ja">👍 Ja</button><button type="button" data-np-fb="nei">👎 Nei</button></div>' +
      '<p class="np-fb__thanks" aria-live="polite"></p></div>'
    );
  }

  function creditLine(ctx) {
    var x = ctx.project.extras || {};
    var st = ctx.settings;
    if (!x.credit || !st.studioName) return "";
    return (
      '<div class="np-credit-line"><span>Annonsørinnhold for <strong>' + esc(ctx.project.advertiser.name || "annonsør") + "</strong></span>" +
      "<span>Produsert av <strong>" + esc(st.studioName) + "</strong></span></div>"
    );
  }

  function footer(ctx) {
    var st = ctx.settings;
    var paras = String(st.footerText || "").split(/\n{2,}/).map(function (t) { return t.trim(); }).filter(Boolean);
    return (
      feedbackBox(ctx) +
      creditLine(ctx) +
      '<footer class="np-footer"><div class="np-footer__in">' +
      '<a class="np-footer__top" href="#np-top">' + ICONS.up + "<span>Til toppen</span></a>" +
      '<div class="np-share" data-np-share>' +
      '<a data-np-share-to="facebook" href="#" aria-label="Del på Facebook">' + ICONS.facebook + "</a>" +
      '<a data-np-share-to="messenger" href="#" aria-label="Del på Messenger">' + ICONS.messenger + "</a>" +
      '<a data-np-share-to="mail" href="#" aria-label="Del på e-post">' + ICONS.mail + "</a>" +
      '<a data-np-share-to="copy" href="#" aria-label="Kopier lenken">' + ICONS.link + "</a>" +
      "</div>" +
      '<div class="np-footer__text">' + paras.map(function (t) { return "<p>" + textHtml(t) + "</p>"; }).join("") + "</div>" +
      (st.studioName || st.studioLogo
        ? '<div class="np-footer__studio">' + (st.studioLogo && ctx.assets[st.studioLogo] ? img(ctx, st.studioLogo, { alt: st.studioName || "", sizes: "200px" }) : esc(st.studioName)) + "</div>"
        : "") +
      "</div></footer>"
    );
  }

  /** Reading progress, chapter menu and the floating button. */
  function chrome(ctx) {
    var x = ctx.project.extras || {};
    var out = "";
    if (x.progress) out += '<div class="np-progress" aria-hidden="true"><i></i></div>';
    var chapters = ctx.page.sections.filter(function (s) { return s.style.chapter && !(s.hide.desktop && s.hide.mobile); });
    if (x.chapterNav !== "none" && chapters.length) {
      out +=
        '<nav class="np-chapnav np-chapnav--' + x.chapterNav + '" aria-label="Kapitler" data-np-chapnav><ol>' +
        chapters.map(function (s, i) {
          return '<li><a href="#np-' + esc(s.id) + '"><span class="np-chapnav__n">' + (i + 1) + "</span><span class=\"np-chapnav__t\">" + esc(s.style.chapter) + "</span></a></li>";
        }).join("") +
        "</ol></nav>";
    }
    // The floating button links to its own URL, else to the advertiser's site.
    // A shipped page never gets a button that goes nowhere.
    var stickyUrl = x.stickyUrl || ctx.project.advertiser.url || "";
    var shipped = ctx.mode === "export" || ctx.mode === "publish";
    if (x.stickyCta && x.stickyLabel && (stickyUrl || !shipped)) {
      out +=
        '<div class="np-sticky np-sticky--' + (x.stickyPlace === "center" ? "center" : "auto") + '" data-np-sticky="' + Number(x.stickyAfter || 40) + '"' + (ctx.mode === "editor" ? ' data-np-shown="1"' : "") + ">" +
        '<a class="' + btnClass(ctx) + '"' + linkAttrs(ctx, stickyUrl, x.stickyLabel) + "><span>" + esc(x.stickyLabel) + "</span>" + ICONS.arrow + "</a></div>";
    }
    return out;
  }

  // ---- whole document --------------------------------------------------------
  function metaTags(ctx) {
    var p = ctx.project;
    var title = ctx.page.title || p.meta.title || (p.pages[0].sections[0] && p.pages[0].sections[0].props.title) || p.name;
    var label = (ctx.settings.disclosureLabel || "Annonsørinnhold fra {annonsør}").replace("{annonsør}", p.advertiser.name || "annonsør");
    var desc = p.meta.description || label;
    var shareTitle = title + " – " + label;
    var out = [
      "<title>" + esc(title) + " | " + esc(label) + "</title>",
      '<meta name="description" content="' + esc(desc) + '">',
      '<meta property="og:type" content="article">',
      '<meta property="og:title" content="' + esc(shareTitle) + '">',
      '<meta property="og:description" content="' + esc(desc) + '">',
      '<meta name="twitter:card" content="summary_large_image">',
    ];
    if (ctx.canonical) {
      out.push('<link rel="canonical" href="' + esc(ctx.canonical) + '">');
      out.push('<meta property="og:url" content="' + esc(ctx.canonical) + '">');
    }
    if (ctx.ogImageUrl) out.push('<meta property="og:image" content="' + esc(ctx.ogImageUrl) + '">');
    if (ctx.settings.siteName) out.push('<meta property="og:site_name" content="' + esc(ctx.settings.siteName) + '">');
    if (p.meta.noindex || ctx.mode === "preview" || ctx.mode === "editor") out.push('<meta name="robots" content="noindex, nofollow">');
    return out.join("\n");
  }

  function firstHeroImage(ctx) {
    var s = ctx.page.sections[0];
    if (!s || s.type !== "hero" || s.props.video) return "";
    return s.props.image && ctx.assets[s.props.image] ? s.props.image : "";
  }

  /**
   * Ad-server pixels carry a cache-buster macro ([timestamp], [cachebuster],
   * %%CACHEBUSTER%%) that must be a fresh number on every view. A static page
   * cannot do that in its HTML, so each such <img> becomes a tiny script that
   * fills the number in when the page is opened (with the plain <img> kept
   * in <noscript>).
   */
  var MACRO_RE = /\[(?:timestamp|cachebuster|random)\]|%%CACHEBUSTER%%|\$\{CACHEBUSTER\}/gi;
  function expandMacros(html) {
    return String(html || "").replace(/<img\b[^>]*\bsrc\s*=\s*"([^"]*)"[^>]*>/gi, function (tag, src) {
      if (!MACRO_RE.test(src)) return tag;
      MACRO_RE.lastIndex = 0;
      var js = JSON.stringify(D.decodeEntities(src)).replace(/</g, "\\u003c");
      return (
        "<script>(function(){var i=new Image(1,1);i.alt=\"\";i.src=" + js +
        ".replace(/\\[(?:timestamp|cachebuster|random)\\]|%%CACHEBUSTER%%|\\$\\{CACHEBUSTER\\}/gi,String(Date.now())+Math.floor(Math.random()*1e6));})();</script>" +
        "<noscript>" + tag.replace(MACRO_RE, String(Date.now())) + "</noscript>"
      );
    });
  }

  /** The `<main>` content of a page: every section in order. */
  function renderMain(ctx) {
    return ctx.page.sections.map(function (s, i) { return renderSection(ctx, s, i); }).join("\n");
  }

  /** Page-wide motion options (Side → Bevegelse) as body classes. */
  function motionClasses(extras) {
    var x = extras || {};
    var out = "";
    if (x.motion && x.motion !== "normal") out += " np-mv-" + x.motion;
    // "subtle" is the stylesheet's own hover, so it needs no class.
    if (x.hoverFx && x.hoverFx !== "subtle") out += " np-hover-" + x.hoverFx;
    return out;
  }

  function renderDocument(ctx) {
    var p = ctx.project;
    var hasVariants = p.variantNav && p.pages.length > 1;
    var tracking = ctx.mode === "export" || ctx.mode === "publish";
    var hero = firstHeroImage(ctx);
    var head = [
      "<!doctype html>",
      '<html lang="nb" class="np-html">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta name="generator" content="ABC design – Native Premium">',
      metaTags(ctx),
      hero ? '<link rel="preload" as="image" imagesrcset="' + esc(srcset(ctx, hero)) + '" imagesizes="100vw" href="' + esc(bestSrc(ctx, hero, 1280)) + '">' : "",
      ctx.fontLinks || "",
      '<style id="np-theme">' + themeCss(p.theme, { hasVariants: hasVariants }) + (ctx.fontCss || "") + "</style>",
      ctx.cssText ? "<style>" + ctx.cssText + "</style>" : '<link rel="stylesheet" href="' + esc(ctx.cssHref) + '">',
      '<style id="np-custom">' + D.scopeCss((p.extras && p.extras.customCss) || "") + "</style>",
      // Content only hides for animation once this class is set; if np.js
      // never arrives (blocked, offline), the class comes off again.
      "<script>document.documentElement.classList.add('np-js');setTimeout(function(){if(!window.NPRuntime)document.documentElement.classList.remove('np-js')},3500)</script>",
      tracking && ctx.settings.headHtml ? expandMacros(ctx.settings.headHtml) : "",
      tracking && p.tracking.headHtml ? expandMacros(p.tracking.headHtml) : "",
      ctx.extraHead || "",
      "</head>",
    ].filter(Boolean).join("\n");
    var body = [
      "<body" + attrs({
        class: "np" + (p.theme.headingCase === "upper" ? " np-upper" : "") + (isDark(p.theme.colors.page || "#ffffff") ? " np-dark-page" : "") + motionClasses(p.extras),
        "data-np-project": D.slugify(p.meta.slug || p.name, "annonse"),
        "data-np-page": ctx.page.slug,
        "data-np-advertiser": p.advertiser.name || null,
        "data-np-mode": ctx.mode,
        "data-np-api": ctx.api || null,
      }) + ">",
      tracking && ctx.settings.bodyHtml ? expandMacros(ctx.settings.bodyHtml) : "",
      tracking && p.tracking.bodyHtml ? expandMacros(p.tracking.bodyHtml) : "",
      disclosure(ctx),
      variantNav(ctx),
      chrome(ctx),
      '<main id="np-main">',
      renderMain(ctx),
      "</main>",
      footer(ctx),
      '<script src="' + esc(ctx.runtimeSrc) + '" defer></script>',
      ctx.extraBody || "",
      "</body>",
      "</html>",
    ].filter(Boolean).join("\n");
    return head + "\n" + body + "\n";
  }

  /**
   * Every distinct character the page shows — for subsetting its fonts.
   * Includes the fixed parts: the disclosure ("Annonsørinnhold fra Citroën"),
   * the footer text and the credit line, which come from the settings.
   */
  function pageText(project, settings) {
    var st = settings || {};
    var chars = {};
    function add(s) {
      String(s || "").split("").forEach(function (c) { chars[c] = true; });
    }
    project.pages.forEach(function (pg) {
      add(pg.label);
      pg.sections.forEach(function (s) {
        S.fieldsOf(s.type).forEach(function (f) {
          var v = s.props[f.key];
          if (f.type === "rich") add(D.plainText(v));
          else if (f.type === "text" || f.type === "textarea") add(v);
          else if (f.type === "list") {
            (v || []).forEach(function (item) {
              f.item.forEach(function (sub) {
                if (sub.type === "text" || sub.type === "textarea") add(item[sub.key]);
                if (sub.type === "number") add(String(item[sub.key]));
              });
            });
          }
        });
      });
    });
    var x = project.extras || {};
    add(x.stickyLabel);
    add(x.feedbackQ);
    project.pages.forEach(function (pg) { pg.sections.forEach(function (s) { add(s.style.chapter); }); });
    add(project.advertiser && project.advertiser.name);
    add(st.disclosureLabel || "Annonsørinnhold fra {annonsør}");
    add(st.footerText);
    add(st.publisherName);
    add(st.studioName);
    add("0123456789,.-–«»%: Vis alle fakta Se svaret Kilde Visste du? Spørsmål av min lesing dager timer minutter sekunder Takk Ja Nei Annonsørinnhold for Produsert av ✦•│—/↻");
    // CSS may change the case (uppercase headings and buttons), so the font
    // needs both forms of every letter.
    Object.keys(chars).forEach(function (c) {
      chars[c.toUpperCase()] = true;
      chars[c.toLowerCase()] = true;
    });
    return Object.keys(chars).filter(function (c) { return c !== "\n" && c.length === 1; }).join("");
  }

  return {
    ICONS: ICONS,
    onColor: onColor,
    contrast: contrast,
    isDark: isDark,
    themeCss: themeCss,
    fontStack: fontStack,
    renderSection: renderSection,
    renderMain: renderMain,
    renderDocument: renderDocument,
    disclosure: disclosure,
    chrome: chrome,
    splitText: splitText,
    osloTime: osloTime,
    readMinutes: readMinutes,
    variantNav: variantNav,
    footer: footer,
    embedUrl: embedUrl,
    expandMacros: expandMacros,
    outbound: outbound,
    pageText: pageText,
  };
});
