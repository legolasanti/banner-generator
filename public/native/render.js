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

  var RATIO = { "16:9": "16 / 9", "9:16": "9 / 16", "4:3": "4 / 3", "3:4": "3 / 4", "1:1": "1 / 1", "4:5": "4 / 5" };

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

  function isDark(bg) {
    return onColor(bg) === "#ffffff";
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
  function themeCss(theme, opts) {
    var c = theme.colors;
    var headH = opts && opts.hasVariants ? 104 : 56;
    return (
      ":root{" +
      "--np-primary:" + c.primary + ";" +
      "--np-accent:" + c.accent + ";" +
      "--np-dark:" + c.dark + ";" +
      "--np-soft:" + c.soft + ";" +
      "--np-text:" + c.text + ";" +
      "--np-link:" + c.link + ";" +
      "--np-on-primary:" + onColor(c.primary) + ";" +
      "--np-on-accent:" + onColor(c.accent) + ";" +
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
    if (!t.enabled || !/^https?:\/\//i.test(url)) return url;
    var hashAt = url.indexOf("#");
    var base = hashAt === -1 ? url : url.slice(0, hashAt);
    var hash = hashAt === -1 ? "" : url.slice(hashAt);
    if (/[?&]utm_source=/.test(base)) return url;
    var params = [];
    if (t.source) params.push("utm_source=" + encodeURIComponent(t.source));
    if (t.medium) params.push("utm_medium=" + encodeURIComponent(t.medium));
    if (t.campaign) params.push("utm_campaign=" + encodeURIComponent(t.campaign));
    if (!params.length) return url;
    return base + (base.indexOf("?") === -1 ? "?" : "&") + params.join("&") + hash;
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
        alt: o.alt !== undefined ? o.alt : meta.alt || "",
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
  function sectionClasses(section, extra, mode) {
    var st = section.style;
    var cls = ["np-sec", "np-t-" + section.type];
    var bg = st.bg || "none";
    cls.push("np-bg-" + bg);
    if (bg === "brand" || bg === "dark" || bg === "image") cls.push("np-on-dark");
    if (bg === "custom" && st.bgColor && isDark(st.bgColor)) cls.push("np-on-dark");
    cls.push("np-pad-" + (st.pad || "m"));
    if (st.align) cls.push("np-align-" + st.align);
    ["tablet", "mobile"].forEach(function (dev) {
      var o = section.rs[dev] && section.rs[dev].style;
      if (!o) return;
      var p = dev === "tablet" ? "t" : "m";
      if (o.pad) cls.push("np-pad-" + p + "-" + o.pad);
      if (o.align) cls.push("np-align-" + p + "-" + o.align);
    });
    if (st.anim && st.anim !== "none") cls.push("np-anim-" + st.anim);
    // The editor keeps hidden sections on screen (faded, labelled), so they
    // can still be selected and switched back on.
    ["desktop", "tablet", "mobile"].forEach(function (d) {
      if (section.hide[d]) cls.push((mode === "editor" ? "np-edh-" : "np-hide-") + d);
    });
    return cls.concat(extra || []).join(" ");
  }

  // The brand background flips text colour with the theme: a pale brand colour
  // needs dark text.
  function brandTextFix(ctx, section) {
    if (section.style.bg !== "brand") return "";
    return isDark(ctx.project.theme.colors.primary) ? "" : " np-on-light";
  }

  function wrapSection(ctx, section, inner, opts) {
    var o = opts || {};
    var st = section.style;
    var style = [];
    if (st.bg === "custom" && st.bgColor) style.push("--np-sec-bg:" + st.bgColor);
    if (o.style) style.push(o.style);
    var bgLayer = "";
    if (st.bg === "image" && st.bgImage && ctx.assets[st.bgImage]) {
      style.push("--np-overlay:" + (st.overlay / 100).toFixed(2));
      bgLayer = '<div class="np-bgimg" aria-hidden="true">' + img(ctx, st.bgImage, { alt: "", sizes: "100vw" }) + "</div>";
    }
    var cls = sectionClasses(section, o.cls, ctx.mode) + brandTextFix(ctx, section);
    var anchor = st.anchor ? '<span class="np-anchor" id="' + esc(D.slugify(st.anchor, "")) + '"></span>' : "";
    return (
      "<" + (o.tag || "section") +
      attrs({
        id: "np-" + section.id,
        class: cls,
        style: style.join(";") || null,
        "data-np-section": ctx.mode === "editor" ? section.id : null,
        "data-np-type": section.type,
      }) +
      ">" + anchor + bgLayer + inner + "</" + (o.tag || "section") + ">"
    );
  }

  function wrap(width, inner, extraCls) {
    return '<div class="np-wrap np-w-' + width + (extraCls ? " " + extraCls : "") + '">' + inner + "</div>";
  }

  var R = {};

  R.hero = function (ctx, s, isFirst) {
    var p = s.props;
    var m = media(ctx, p, { image: "image", imageMobile: "imageMobile", video: "video", videoMobile: "videoMobile" }, { eager: isFirst, field: "image" });
    var hasMedia = !!m;
    var text =
      '<div class="np-hero__text">' +
      (p.kicker ? '<span class="np-kicker"' + ed(ctx, "kicker") + ">" + esc(p.kicker) + "</span>" : ctx.mode === "editor" ? '<span class="np-kicker np-ed-empty"' + ed(ctx, "kicker") + "></span>" : "") +
      '<h1 class="np-h1"' + ed(ctx, "title") + ">" + esc(p.title) + "</h1>" +
      (p.ingress || ctx.mode === "editor" ? '<p class="np-ingress' + (p.ingress ? "" : " np-ed-empty") + '"' + ed(ctx, "ingress") + ">" + textHtml(p.ingress) + "</p>" : "") +
      "</div>";
    var layout = hasMedia || ctx.mode === "editor" ? p.layout : "below";
    var mediaHtml = hasMedia ? m : placeholder(ctx, "Velg et bilde eller en video for hero");
    var cls = ["np-hero", "np-hero--" + layout, "np-hero--h-" + p.height, "np-hero--pos-" + p.position];
    var inner;
    if (layout === "overlay") {
      inner =
        '<div class="np-hero__media">' + mediaHtml + "</div>" +
        wrap("wide", text) +
        (p.scrollHint && p.height === "full" ? '<a class="np-hero__hint" href="#np-after-hero" aria-label="Les videre">' + ICONS.down + "</a>" : "");
    } else if (layout === "split") {
      inner = '<div class="np-hero__media">' + mediaHtml + "</div>" + '<div class="np-wrap">' + text + "</div>";
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
    var body = '<div class="np-rich' + (p.dropCap ? " np-dropcap" : "") + '"' + ed(ctx, "html") + ">" + rich(p.html) + "</div>";
    return wrapSection(ctx, s, wrap(p.width, body));
  };

  function figure(ctx, id, alt, caption, fieldPrefix, ratio, sizes) {
    if (!id || !ctx.assets[id]) return placeholder(ctx, "Velg et bilde");
    var crop = ratio && ratio !== "auto";
    return (
      '<figure class="np-figure' + (crop ? " np-figure--crop" : "") + '"' + (crop ? ' style="aspect-ratio:' + RATIO[ratio] + '"' : "") + ">" +
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
        figure(ctx, id, alt, cap, key, p.ratio, sizes) +
        (cap || (ctx.mode === "editor" && !two) ? '<p class="np-figcap' + (cap ? "" : " np-ed-empty") + '"' + ed(ctx, capKey) + ">" + esc(cap) + "</p>" : "") +
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
    var btnCls = "np-btn" + (ctx.project.theme.button === "pill" ? " np-btn--pill" : "") + (ctx.project.theme.button === "outline" ? " np-btn--outline" : "");
    function button(label, url, field, ghost) {
      if (!label) return "";
      return '<a class="' + btnCls + (ghost ? " np-btn--ghost" : "") + '"' + linkAttrs(ctx, url, label) + "><span" + ed(ctx, field) + ">" + esc(label) + "</span>" + ICONS.arrow + "</a>";
    }
    var inner;
    if (p.variant === "link") {
      inner = '<a class="np-arrowlink"' + linkAttrs(ctx, p.url, p.label) + '><span class="np-arrowlink__c">' + ICONS.arrow + "</span><span" + ed(ctx, "label") + ">" + esc(p.label) + "</span></a>";
    } else {
      inner =
        (p.variant === "band" && p.title ? '<h2 class="np-h2"' + ed(ctx, "title") + ">" + esc(p.title) + "</h2>" : "") +
        (p.variant === "band" && p.text ? '<p class="np-cta__text"' + ed(ctx, "text") + ">" + textHtml(p.text) + "</p>" : "") +
        '<div class="np-cta__btns">' + button(p.label, p.url, "label") + button(p.label2, p.url2, "label2", true) + "</div>";
    }
    return wrapSection(ctx, s, wrap("text", '<div class="np-cta np-cta--' + p.variant + '">' + inner + "</div>"));
  };

  R.quote = function (ctx, s) {
    var p = s.props;
    var who = p.name || p.role
      ? '<figcaption class="np-quote__by">' +
        (p.image && ctx.assets[p.image] ? img(ctx, p.image, { alt: "", sizes: "56px" }) : "") +
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
      if (sl.image && ctx.assets[sl.image]) {
        layers.push('<div class="np-story__layer" data-np-layer="' + (i + 1) + '">' + img(ctx, sl.image, { alt: "", sizes: "100vw" }) + "</div>");
      }
      var layerRef = sl.image && ctx.assets[sl.image] ? layers.length - 1 : null;
      return (
        '<div class="np-story__card" data-np-card' + (layerRef !== null ? ' data-np-show="' + layerRef + '"' : "") + ">" +
        '<div class="np-story__box">' +
        (sl.title ? '<h2 class="np-h2"' + ed(ctx, "slides." + sl.id + ".title") + ">" + esc(sl.title) + "</h2>" : "") +
        (sl.text ? '<p' + ed(ctx, "slides." + sl.id + ".text") + ">" + textHtml(sl.text) + "</p>" : "") +
        "</div></div>"
      );
    });
    var inner =
      '<div class="np-story__media" aria-hidden="true">' + layers.join("") + "</div>" +
      '<div class="np-story__cards">' + cards.join("") + "</div>";
    return wrapSection(ctx, s, '<div class="np-story np-story--' + p.transition + " np-story--" + p.cardSide + '" data-np-story style="--np-overlay:' + (p.overlay / 100).toFixed(2) + '">' + inner + "</div>");
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

  R.stats = function (ctx, s) {
    var p = s.props;
    var items = p.items.map(function (it) {
      return (
        '<div class="np-stat">' +
        '<div class="np-stat__v"><span' + (p.countUp ? " data-np-count" : "") + ed(ctx, "items." + it.id + ".value") + ">" + esc(it.value) + "</span>" +
        (it.unit ? '<span class="np-stat__u"' + ed(ctx, "items." + it.id + ".unit") + ">" + esc(it.unit) + "</span>" : "") +
        "</div>" +
        '<div class="np-stat__l"' + ed(ctx, "items." + it.id + ".label") + ">" + esc(it.label) + "</div>" +
        "</div>"
      );
    });
    var inner =
      (p.title ? '<h2 class="np-h2 np-stats__title"' + ed(ctx, "title") + ">" + esc(p.title) + "</h2>" : "") +
      '<div class="np-stats" style="--np-cols:' + Math.max(1, Math.min(4, p.items.length)) + '">' + items.join("") + "</div>";
    return wrapSection(ctx, s, wrap("wide", inner));
  };

  R.productCards = function (ctx, s) {
    var p = s.props;
    var cards = p.items.map(function (it) {
      var tag = it.url ? "a" : "div";
      var open = it.url ? '<a class="np-prod"' + linkAttrs(ctx, it.url, it.name) + ">" : '<div class="np-prod">';
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
      '<div class="np-prods" style="--np-cols:' + p.columns + '">' + cards.join("") + "</div>";
    return wrapSection(ctx, s, wrap("wide", inner));
  };

  R.gallery = function (ctx, s) {
    var p = s.props;
    var items = p.items.filter(function (it) { return it.image && ctx.assets[it.image]; });
    if (!items.length) return wrapSection(ctx, s, wrap("wide", placeholder(ctx, "Legg til bilder i galleriet")));
    var figs = items.map(function (it) {
      return (
        "<figure>" + img(ctx, it.image, { alt: it.alt, sizes: p.mode === "grid" ? "(max-width: 599px) 50vw, 360px" : "(max-width: 599px) 80vw, 760px" }) +
        (it.caption ? '<figcaption class="np-figcap">' + esc(it.caption) + "</figcaption>" : "") +
        "</figure>"
      );
    });
    var inner = p.mode === "grid"
      ? '<div class="np-gal np-gal--grid">' + figs.join("") + "</div>"
      : '<div class="np-gal np-gal--carousel" data-np-carousel><div class="np-gal__track" tabindex="0" role="region" aria-label="Bildegalleri">' + figs.join("") + "</div>" +
        '<div class="np-gal__nav"><button type="button" data-np-prev aria-label="Forrige bilde">' + ICONS.left + '</button><button type="button" data-np-next aria-label="Neste bilde">' + ICONS.right + "</button></div></div>";
    return wrapSection(ctx, s, wrap(p.mode === "grid" ? "wide" : "full", inner));
  };

  R.compare = function (ctx, s) {
    var p = s.props;
    if (!(p.before && ctx.assets[p.before] && p.after && ctx.assets[p.after])) {
      return wrapSection(ctx, s, wrap("wide", placeholder(ctx, "Velg et før- og et etter-bilde")));
    }
    var inner =
      '<div class="np-cmp" data-np-compare>' +
      img(ctx, p.before, { alt: p.alt, sizes: "(max-width: 1148px) 100vw, 1100px" }) +
      '<div class="np-cmp__after">' + img(ctx, p.after, { alt: "", sizes: "(max-width: 1148px) 100vw, 1100px" }) + "</div>" +
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
        '<p class="np-quiz__qt"' + ed(ctx, "questions." + q.id + ".q") + ">" + (qi + 1) + ". " + esc(q.q) + "</p>" +
        '<div class="np-quiz__opts" role="group">' +
        options.map(function (o, i) {
          return '<button type="button" class="np-quiz__opt" data-np-opt="' + i + '">' + esc(o) + "</button>";
        }).join("") +
        "</div>" +
        (q.explain ? '<details class="np-quiz__ex"><summary>Se svaret</summary><p>' + esc(options[q.correct - 1] || "") + " – " + textHtml(q.explain) + "</p></details>" : "") +
        "</div>"
      );
    });
    var inner =
      (p.title ? '<h2 class="np-h2 np-quiz__title"' + ed(ctx, "title") + ">" + esc(p.title) + "</h2>" : "") +
      '<div class="np-quiz" data-np-quiz>' + qs.join("") + '<p class="np-quiz__score" aria-live="polite"></p></div>';
    return wrapSection(ctx, s, wrap("text", inner));
  };

  R.chart = function (ctx, s) {
    var p = s.props;
    var max = p.items.reduce(function (m, it) { return Math.max(m, Math.abs(it.value)); }, 0) || 1;
    var fmt = function (v) {
      return String(Math.round(v * 10) / 10).replace(".", ",") + (p.unit ? " " + p.unit : "");
    };
    var rows = p.items.map(function (it) {
      var pct = Math.max(2, Math.round((Math.abs(it.value) / max) * 100));
      return (
        '<div class="np-chart__row"><span class="np-chart__lab"' + ed(ctx, "items." + it.id + ".label") + ">" + esc(it.label) + "</span>" +
        '<div class="np-chart__bar"><div class="np-chart__fill" style="width:' + pct + '%">' + esc(fmt(it.value)) + "</div></div></div>"
      );
    });
    var inner =
      (p.title ? '<h2 class="np-h2 np-chart__title"' + ed(ctx, "title") + ">" + esc(p.title) + "</h2>" : "") +
      '<figure class="np-chart" style="margin:0" role="img" aria-label="' + esc(p.title || "Diagram") + '">' + rows.join("") + "</figure>" +
      (p.source ? '<p class="np-chart__src"' + ed(ctx, "source") + ">Kilde: " + esc(p.source) + "</p>" : "");
    return wrapSection(ctx, s, wrap("text", inner));
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
      '<header class="np-disclosure" role="banner" id="np-top"><div class="np-disclosure__in">' +
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

  function footer(ctx) {
    var st = ctx.settings;
    var paras = String(st.footerText || "").split(/\n{2,}/).map(function (t) { return t.trim(); }).filter(Boolean);
    return (
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
      "<script>document.documentElement.classList.add('np-js')</script>",
      tracking && ctx.settings.headHtml ? expandMacros(ctx.settings.headHtml) : "",
      tracking && p.tracking.headHtml ? expandMacros(p.tracking.headHtml) : "",
      ctx.extraHead || "",
      "</head>",
    ].filter(Boolean).join("\n");
    var body = [
      "<body" + attrs({
        class: "np" + (p.theme.headingCase === "upper" ? " np-upper" : ""),
        "data-np-project": D.slugify(p.meta.slug || p.name, "annonse"),
        "data-np-page": ctx.page.slug,
        "data-np-advertiser": p.advertiser.name || null,
        "data-np-mode": ctx.mode,
      }) + ">",
      tracking && ctx.settings.bodyHtml ? expandMacros(ctx.settings.bodyHtml) : "",
      tracking && p.tracking.bodyHtml ? expandMacros(p.tracking.bodyHtml) : "",
      disclosure(ctx),
      variantNav(ctx),
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

  /** Every distinct character the page shows — for subsetting its fonts. */
  function pageText(project) {
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
    add("0123456789,.-–«»%: Vis alle fakta Se svaret Kilde");
    return Object.keys(chars).filter(function (c) { return c !== "\n"; }).join("");
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
    variantNav: variantNav,
    footer: footer,
    embedUrl: embedUrl,
    expandMacros: expandMacros,
    outbound: outbound,
    pageText: pageText,
  };
});
