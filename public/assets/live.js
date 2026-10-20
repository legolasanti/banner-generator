/* =========================================================================
   live.js — the NT Live creative at run time.

   One function, LiveAd.mount(root, type, config, options), builds a Norsk
   Tipping banner that shows TODAY's matches from a sheet. What a slide
   looks like is a template (config.template, see live-templates.js): HTML
   with placeholders plus a stylesheet already scoped to `.bn--tpl-<id>`.
   This file fills the placeholders per match, keeps the time lines and
   countdowns ticking, rotates the slides and draws the regulated furniture
   (Annonse, 18+ | Hjelpelinjen.no, Vinnersjanse) in its own layer on top —
   the very markup banner.js draws on the static banners.

   It runs in three places, with no dependencies beyond live-data.js and
   banner.js: the app's live preview, the Puppeteer page that takes the
   backup image, and the creative itself inside Campaign Manager 360 — where
   it may also refresh the rows straight from the Google Sheet, so a match
   added to the sheet shows up without re-uploading anything.

   Plain ES5-ish global script, like banner.js.
   ========================================================================= */
(function (global) {
  "use strict";

  var LD = global.LiveData;
  var PARTS = global.renderBanner && global.renderBanner.parts;
  var ANIMATIONS = ["gradient", "lys", "striper", "puls", "konfetti"];
  var CONFETTI_COLORS = ["#ffc000", "#ff7337", "#00c1ff", "#ff7ea9", "#96d94e", "#ffffff"];
  var FETCH_TIMEOUT_MS = 5000;
  var RESELECT_EVERY_MS = 20000;
  var EXIT_EVENTS = ["mousedown", "touchstart", "contextmenu", "auxclick", "focus", "click"];
  var MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
  var WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
  var TEAM_NOISE = /^(fc|afc|cf|sc|if|il|fk|bk|sk|ac|as|ss|sv|vfb|vfl|tsg|rb|rc|cd|ud|club|the|de|of|and|og|&)$/i;

  // The fallback when a config arrives without a template (an export from
  // before templates existed): the classic layout, unstyled beyond live.css.
  var BARE_TEMPLATE = {
    id: "bar",
    mode: "slides",
    zone: "media",
    html:
      '<div class="bn__media">{{media}}</div><div class="bn__body">' +
      '{{#kicker}}<span class="bn__live-kicker">{{kicker}}</span>{{/kicker}}<h2 class="bn__headline">{{kamp}}</h2>' +
      '{{^reserve}}<span class="bn__live-time" data-live="tid">{{tid}}</span>{{/reserve}}' +
      '{{#knappetekst}}<span class="bn__live-cta">{{knappetekst}}</span>{{/knappetekst}}</div>',
    css: "",
  };

  function esc(value) {
    return PARTS ? PARTS.escapeHtml(value) : String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function safeColor(value, fallback) {
    return /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? String(value) : fallback;
  }

  function isHttps(url) {
    return /^https:\/\//i.test(String(url || ""));
  }

  function animationName(value, fallback) {
    var name = LD.fold(value);
    return ANIMATIONS.indexOf(name) !== -1 ? name : fallback;
  }

  // ------------------------------------------------------------------------
  // Colour: one accent in, the shades the templates use out
  // ------------------------------------------------------------------------
  function hexRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(rgb, toward, amount) {
    return rgb.map(function (c, i) { return Math.round(c + (toward[i] - c) * amount); });
  }

  function rgbHex(rgb) {
    return "#" + rgb.map(function (c) { return (c < 16 ? "0" : "") + c.toString(16); }).join("");
  }

  function luminance(rgb) {
    var a = rgb.map(function (c) {
      var v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }

  /** CSS custom properties for one accent colour. */
  function palette(accent) {
    var base = hexRgb(safeColor(accent, "#1a6b1a"));
    var deep = mix(base, [0, 0, 0], 0.45);
    var bright = mix(base, [255, 255, 255], 0.16);
    var soft = mix(base, [255, 255, 255], 0.9);
    return {
      "--live-accent": rgbHex(base),
      "--live-accent-rgb": base.join(","),
      "--live-deep": rgbHex(deep),
      "--live-deep-rgb": deep.join(","),
      "--live-bright": rgbHex(bright),
      "--live-soft": rgbHex(soft),
      "--live-on-accent": luminance(base) > 0.45 ? "#1b1b1b" : "#ffffff",
    };
  }

  // ------------------------------------------------------------------------
  // The template engine: {{key}}, {{#key}}…{{/key}}, {{^key}}…{{/key}}
  // ------------------------------------------------------------------------
  var TOKEN = /\{\{\s*([#^/]?)\s*([\wæøåÆØÅ-]+)\s*\}\}/g;

  /** Text → a tree of text, value and section nodes. Unbalanced tags stay as text. */
  function parseTemplate(src) {
    var rootNode = { children: [] };
    var stack = [rootNode];
    var last = 0;
    var m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(src))) {
      var top = stack[stack.length - 1];
      if (m.index > last) top.children.push({ text: src.slice(last, m.index) });
      last = TOKEN.lastIndex;
      var key = m[2].toLowerCase();
      if (m[1] === "#" || m[1] === "^") {
        var node = { section: key, inverted: m[1] === "^", children: [] };
        top.children.push(node);
        stack.push(node);
      } else if (m[1] === "/") {
        if (stack.length > 1 && top.section === key) stack.pop();
      } else {
        top.children.push({ key: key });
      }
    }
    if (last < src.length) stack[stack.length - 1].children.push({ text: src.slice(last) });
    return rootNode;
  }

  function lookup(ctx, key) {
    var c = ctx;
    while (c) {
      if (Object.prototype.hasOwnProperty.call(c, key)) return c[key];
      c = c.__parent;
    }
    return undefined;
  }

  function truthy(value) {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return true;
    return !!value && value !== "0";
  }

  function renderNodes(nodes, ctx) {
    var out = "";
    nodes.forEach(function (n) {
      if (n.text != null) out += n.text;
      else if (n.key) {
        var v = lookup(ctx, n.key);
        if (v && typeof v === "object" && typeof v.html === "string") out += v.html;
        else if (v != null && typeof v !== "object") out += esc(v);
      } else if (n.section) {
        var val = lookup(ctx, n.section);
        if (n.inverted) {
          if (!truthy(val)) out += renderNodes(n.children, ctx);
        } else if (Array.isArray(val)) {
          val.forEach(function (item) {
            var child = Object.create(null);
            Object.keys(item).forEach(function (k) { child[k] = item[k]; });
            child.__parent = ctx;
            out += renderNodes(n.children, child);
          });
        } else if (truthy(val)) {
          out += renderNodes(n.children, ctx);
        }
      }
    });
    return out;
  }

  var parsedCache = {};
  function renderTemplate(src, ctx) {
    var key = String(src);
    if (!parsedCache[key]) parsedCache[key] = parseTemplate(key);
    return renderNodes(parsedCache[key].children, ctx);
  }

  /** The template's stylesheet, once per document and id. */
  function ensureStyle(doc, tpl) {
    if (!doc || !doc.head) return;
    var id = "lt-style-" + tpl.id;
    var el = doc.getElementById(id);
    if (!el) {
      el = doc.createElement("style");
      el.id = id;
      doc.head.appendChild(el);
    }
    if (el.textContent !== tpl.css) el.textContent = tpl.css || "";
  }

  // ------------------------------------------------------------------------
  // Slide content
  // ------------------------------------------------------------------------
  /**
   * What the photo area shows for a row, in order of preference: its video,
   * its photo, its own animation, then the campaign's default (the fallback
   * photo or an animation). `assets.media` maps a sheet URL to the file that
   * travels inside the package; anything not in there loads from its URL.
   */
  function mediaFor(row, config, still) {
    var assets = config.assets || {};
    var media = assets.media || {};
    var design = config.design || {};
    var image = row.image ? media[row.image] || LD.directMediaUrl(row.image) : "";
    var fallbackImage = assets.fallback || "";
    var defaultAnim = animationName(design.defaultMedia, "");
    var wantsFallbackImage = !defaultAnim && fallbackImage;

    if (row.video && !still) {
      return { kind: "video", src: row.video, poster: image || fallbackImage || "" };
    }
    if (image) return { kind: "image", src: image };
    var own = animationName(row.animation, "");
    if (own) return { kind: "anim", preset: own };
    if (wantsFallbackImage) return { kind: "image", src: fallbackImage };
    if (row.isFallback && fallbackImage) return { kind: "image", src: fallbackImage };
    return { kind: "anim", preset: defaultAnim || "gradient" };
  }

  function confettiHtml() {
    var out = "";
    for (var i = 0; i < 14; i++) {
      var left = (i * 7.3 + 3) % 100;
      var delay = (i * 0.37) % 3.4;
      var dur = 2.8 + (i % 4) * 0.45;
      out +=
        '<span class="bn__confetti" style="left:' + left.toFixed(1) + "%;background:" + CONFETTI_COLORS[i % CONFETTI_COLORS.length] +
        ";animation-delay:-" + delay.toFixed(2) + "s;animation-duration:" + dur.toFixed(2) + 's"></span>';
    }
    return out;
  }

  function teamsHtml(row) {
    if (!row.home) return "";
    return (
      '<div class="bn__anim-teams"><span>' + esc(row.home) + "</span>" +
      (row.away ? "<em>mot</em><span>" + esc(row.away) + "</span>" : "") +
      "</div>"
    );
  }

  function mediaHtml(media, row, withTeams) {
    if (media.kind === "video") {
      return (
        '<video class="bn__live-video" muted playsinline loop preload="auto"' +
        (media.poster ? ' poster="' + esc(media.poster) + '"' : "") +
        ' src="' + esc(media.src) + '"></video>'
      );
    }
    if (media.kind === "image") {
      return '<img class="bn__img" alt="" src="' + esc(media.src) + '">';
    }
    return (
      '<div class="bn__anim bn__anim--' + media.preset + '">' +
      (media.preset === "konfetti" ? confettiHtml() : "") +
      (withTeams ? teamsHtml(row) : "") +
      "</div>"
    );
  }

  /** "Real Madrid" → RMA, "Arsenal" → ARS, "Paris Saint-Germain" → PSG. */
  function teamCode(name) {
    var words = String(name || "")
      .replace(/[^\wæøåÆØÅäöüÄÖÜéèáàíóúçñ\s/.-]/g, " ")
      .split(/[\s/.-]+/)
      .filter(function (w) { return w && !/^\d+$/.test(w); });
    var main = words.filter(function (w) { return !TEAM_NOISE.test(w); });
    if (!main.length) main = words;
    if (!main.length) return "";
    if (main.length === 1) return main[0].slice(0, 3).toUpperCase();
    if (main.length === 2) return (main[0].charAt(0) + main[1].slice(0, 2)).toUpperCase();
    return (main[0].charAt(0) + main[1].charAt(0) + main[2].charAt(0)).toUpperCase();
  }

  /** "2,10 - 3,40 - 3,20", "2.10/3.40/3.20" → ["2,10", "3,40", "3,20"]. */
  function oddsParts(raw) {
    var m = String(raw || "").match(/\d+(?:[.,]\d+)?/g) || [];
    return m.slice(0, 3).map(function (x) { return x.replace(".", ","); });
  }

  function longDate(ymd) {
    if (!ymd) return "";
    var d = ymd.split("-");
    var dt = new Date(Date.UTC(+d[0], +d[1] - 1, +d[2]));
    return WEEKDAYS[dt.getUTCDay()] + " " + +d[2] + ". " + MONTHS[+d[1] - 1];
  }

  function kickerText(row, design) {
    var product = String(design.kicker == null ? "Oddsen" : design.kicker).trim();
    var league = row.league || "";
    if (product && league) return product + " · " + league;
    return product || league;
  }

  /** The slide shown when the sheet has nothing for today (or soon). */
  function fallbackRow(design) {
    return {
      id: "fallback",
      date: "",
      time: "",
      home: "",
      away: "",
      title: String(design.fallbackHeadline || "Dagens kamper på Oddsen").trim(),
      league: "",
      link: "",
      image: "",
      video: "",
      animation: "",
      cta: "",
      text: String(design.fallbackText || "").trim(),
      odds: "",
      isFallback: true,
    };
  }

  // ------------------------------------------------------------------------
  // Fitting: a text that overflows its box steps down, at most three times.
  // Works for any template: the .bn__headline and anything marked data-fit.
  // ------------------------------------------------------------------------
  function overflows(el) {
    return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
  }

  function fitText(el) {
    if (!el || !el.clientHeight) return;
    el.style.fontSize = "";
    for (var step = 0; step < 3 && overflows(el); step++) {
      var size = parseFloat(global.getComputedStyle(el).fontSize);
      if (!size) return;
      el.style.fontSize = (size * 0.88).toFixed(2) + "px";
    }
  }

  // ------------------------------------------------------------------------
  // Mount
  // ------------------------------------------------------------------------
  /**
   * @param {HTMLElement} root
   * @param {string} type  "readpeak" | "desktop" | "mobile" | "newsgrid"
   * @param {Object} config  { rows, design, badges, assets, source, template }
   * @param {Object} [options]
   *   now: Date      — pretend it is this moment (the preview's date picker)
   *   autoplay: bool — rotate and tick (default true)
   *   still: bool    — the backup image: no video, no motion
   *   refresh: bool  — fetch the sheet at start (default: design.liveRefresh)
   *   exit: Element  — the <a class="ad-exit"> to keep pointed at the right URL
   *   onChange: fn   — called with the controller after every (re)render
   * @returns {Object} controller
   */
  function mount(root, type, config, options) {
    var o = options || {};
    var cfg = config || {};
    var design = cfg.design || {};
    var badges = cfg.badges || {};
    var tpl = cfg.template && cfg.template.html ? cfg.template : BARE_TEMPLATE;
    var listMode = tpl.mode === "list";
    var still = !!o.still;
    var autoplay = o.autoplay !== false && !still;
    var offsetMs = o.now ? new Date(o.now).getTime() - Date.now() : 0;
    var rows = Array.isArray(cfg.rows) ? cfg.rows.slice() : [];
    var selectOpts = {
      finishedAfterMin: design.finishedAfterMin,
      lookAheadDays: design.lookAheadDays,
      maxSlides: design.maxSlides,
      timeMode: design.timeMode,
      clockSep: design.clockSep,
      liveLabel: design.liveLabel,
      startsLabel: design.startsLabel,
    };
    var slideMs = Math.max(2000, Math.min(20000, Number(design.slideMs) || 5000));
    var transition = ["slide", "zoom", "none"].indexOf(design.transition) !== -1 ? design.transition : "fade";
    var motion = ["av", "rolig", "livlig"].indexOf(design.motion) !== -1 ? design.motion : "standard";

    var state = { slides: [], index: 0, scope: "none", selectionKey: "", timers: [], destroyed: false, playing: autoplay };
    var stage = null;
    var slideEls = [];
    var rowsById = {};

    function now() {
      return new Date(Date.now() + offsetMs);
    }

    function today() {
      return LD.osloParts(now()).ymd;
    }

    function clock(row) {
      return row.time ? row.time.replace(":", design.clockSep === "." ? "." : ":") : "";
    }

    function diffMs(row) {
      return LD.kickoffMs(row.date, row.time) - now().getTime();
    }

    function isLive(row) {
      if (!row || row.isFallback || row.isList || !row.time) return false;
      var diff = diffMs(row);
      var finishedAfter = Number(design.finishedAfterMin) || LD.DEFAULTS.finishedAfterMin;
      return diff <= 0 && diff > -finishedAfter * 60000;
    }

    function labelFor(row) {
      if (row.isFallback) return row.text;
      if (row.isList) return "";
      return LD.timeLabel(row, now(), selectOpts);
    }

    /** "21:00", or "Live" while it is on. For list rows. */
    function shortLabel(row) {
      return isLive(row) ? "Live" : clock(row) || LD.dayWord(LD.dayDiff(today(), row.date), row.date);
    }

    function pad2(n) {
      return (n < 10 ? "0" : "") + n;
    }

    /** Countdown tiles: d/t/min further out, t/min/sek inside a day. */
    function countdownHtml(row, prev) {
      if (!row || row.isFallback || row.isList) return "";
      if (!row.time) return '<span class="bn__cd"><span class="bn__cd-live bn__cd-day">' + esc(labelFor(row)) + "</span></span>";
      var diff = diffMs(row);
      if (diff <= 0) return '<span class="bn__cd"><span class="bn__cd-live">' + esc(isLive(row) ? design.liveLabel || "Pågår nå" : labelFor(row)) + "</span></span>";
      var total = Math.floor(diff / 1000);
      var days = Math.floor(total / 86400);
      var units = days >= 1
        ? [[days, days === 1 ? "dag" : "dager"], [Math.floor((total % 86400) / 3600), "timer"], [Math.floor((total % 3600) / 60), "min"]]
        : [[Math.floor(total / 3600), "timer"], [Math.floor((total % 3600) / 60), "min"], [total % 60, "sek"]];
      return (
        '<span class="bn__cd">' +
        units
          .map(function (u, i) {
            var n = pad2(u[0]);
            var tick = prev && prev[i] !== n ? " is-tick" : "";
            return (i ? '<span class="bn__cd-sep" aria-hidden="true">:</span>' : "") +
              '<span class="bn__cd-u"><b class="bn__cd-n' + tick + '">' + n + '</b><small class="bn__cd-l">' + u[1] + "</small></span>";
          })
          .join("") +
        "</span>"
      );
    }

    function contextFor(row, index) {
      var reserve = !!row.isFallback;
      var odds = reserve ? [] : oddsParts(row.odds);
      var three = odds.length >= 3;
      var dayOffset = row.date ? LD.dayDiff(today(), row.date) : 0;
      var dag = row.date ? LD.dayWord(dayOffset, row.date) : "";
      var media = mediaFor(row, cfg, still);
      var kl = clock(row);
      return {
        id: row.id,
        nr: index + 1,
        reserve: reserve,
        hjemmelag: row.home,
        bortelag: row.away,
        kamp: row.title,
        turnering: row.league,
        produkt: String(design.kicker == null ? "Oddsen" : design.kicker).trim(),
        kicker: reserve ? String(design.kicker || "").trim() : kickerText(row, design),
        tekst: row.text,
        knappetekst: String(row.cta || design.ctaText || "").trim(),
        odds: odds.join(" · "),
        odds1: odds[0] || "",
        oddsx: three ? odds[1] : "",
        odds2: three ? odds[2] : odds[1] || "",
        harodds: odds.length >= 2,
        hjemmekode: teamCode(row.home),
        bortekode: teamCode(row.away),
        dag: dag,
        dato: longDate(row.date),
        klokkeslett: kl,
        klokke: kl ? dag + " kl. " + kl : dag,
        tid: labelFor(row),
        kort: row.isFallback ? "" : shortLabel(row),
        lenke: row.link,
        listetittel: String(design.listTitle || "Dagens kamper").trim(),
        harbilde: media.kind !== "anim",
        media: { html: mediaHtml(media, row, design.teamsInAnimation !== false) },
        bakgrunn: { html: mediaHtml(media, row, false) },
        nedtelling: { html: '<span class="bn__cd-host" data-live="nedtelling">' + countdownHtml(row) + "</span>" },
      };
    }

    function listContext(slide) {
      var first = slide.rows[0] || {};
      var ctx = contextFor(first, 0);
      ctx.kamper = slide.rows.map(function (r, i) { return contextFor(r, i); });
      ctx.id = "list";
      ctx.reserve = false;
      ctx.knappetekst = String(design.ctaText || "").trim();
      ctx.kicker = String(design.kicker || "").trim();
      return ctx;
    }

    function exitUrlFor(row) {
      var tag = global.clickTag || design.clickUrl || "";
      if (design.exitMode === "clicktag") return tag;
      return (row && row.link) || tag;
    }

    function syncExit() {
      var exit = o.exit;
      if (!exit) return;
      var url = exitUrlFor(state.slides[state.index]);
      if (!url) return;
      exit.href = url;
      exit.target = "_blank";
      exit.rel = "noopener";
    }

    function clearTimers() {
      state.timers.forEach(function (t) { clearInterval(t); });
      state.timers = [];
    }

    function buildFrame() {
      var cls = "bn bn--live bn--" + type + " bn--p-norsktipping bn--live-" + transition + " bn--m-" + motion +
        " bn--tpl-" + tpl.id + " bn--zone-" + (tpl.zone === "media" ? "media" : "strip");
      if (still) cls += " bn--still";
      root.className = cls;
      var pal = palette(design.accent);
      Object.keys(pal).forEach(function (k) { root.style.setProperty(k, pal[k]); });
      var scale = Number(design.textScale);
      root.style.setProperty("--hl-scale", isFinite(scale) && scale > 0 ? Math.max(0.6, Math.min(1.6, scale)) : 1);
      root.style.setProperty("--slide-ms", slideMs + "ms");
      ensureStyle(root.ownerDocument, tpl);
      var badgeData = {
        annonseText: badges.annonseText || "Annonse",
        ageBadgeText: badges.ageBadgeText || "18+ | Hjelpelinjen.no",
        ageIconUrl: badges.ageIconUrl || "",
        hideAgeBadge: !!badges.hideAgeBadge,
        vinnersjanse: badges.vinnersjanse || "",
        showVinnerOnNewsgrid: !!badges.showVinnerOnNewsgrid,
      };
      // The badge layer's own inline !important wins over anything a
      // template stylesheet could say about it.
      root.innerHTML =
        '<div class="bn__live-stage"></div>' +
        '<div class="bn__live-badges bn__media" style="display:block!important;visibility:visible!important;opacity:1!important;z-index:9!important;background:transparent!important">' +
        (PARTS ? PARTS.overlaysFor(type, badgeData) : "") +
        "</div>";
      stage = root.firstChild;
    }

    function renderSlides() {
      stage.innerHTML = "";
      slideEls = [];
      rowsById = {};
      state.slides.forEach(function (slide, i) {
        var el = document.createElement("div");
        el.className = "bn__live-slide";
        var ctx;
        if (slide.isList) {
          slide.rows.forEach(function (r) { rowsById[r.id] = r; });
          ctx = listContext(slide);
        } else {
          rowsById[slide.id] = slide;
          ctx = contextFor(slide, i);
        }
        el.setAttribute("data-rid", slide.isList ? "list" : slide.id);
        el.innerHTML = renderTemplate(tpl.html, ctx);
        if (!slide.isList && !slide.isFallback) wireMedia(el, slide);
        stage.appendChild(el);
        slideEls.push(el);
      });
      state.index = Math.min(state.index, Math.max(0, state.slides.length - 1));
      show(state.index, true);
      fitAll();
      updateTimes();
    }

    function fitAll() {
      slideEls.forEach(function (el) {
        Array.prototype.forEach.call(el.querySelectorAll(".bn__headline, [data-fit]"), fitText);
      });
    }

    // A photo or video that fails to load gives way to the animation (a
    // video first to its poster), so the slot is never a broken-image icon
    // in a live ad. Only the broken element is replaced, never what sits
    // next to it in the template.
    function wireMedia(el, row) {
      Array.prototype.forEach.call(el.querySelectorAll("img.bn__img, video.bn__live-video"), function (node) {
        var host = node.parentNode;
        var withTeams = !!host && /(^|\s)bn__media(\s|$)/.test(host.className) && design.teamsInAnimation !== false;
        function replaceWith(html) {
          if (!node.parentNode) return null;
          node.insertAdjacentHTML("afterend", html);
          var next = node.nextElementSibling;
          node.parentNode.removeChild(node);
          return next;
        }
        function toAnimation() {
          replaceWith(mediaHtml({ kind: "anim", preset: animationName(design.defaultMedia, "gradient") }, row, withTeams));
        }
        node.addEventListener("error", function () {
          var poster = node.tagName === "VIDEO" ? node.getAttribute("poster") : "";
          if (!poster) return toAnimation();
          var img = replaceWith('<img class="bn__img" alt="" src="' + esc(poster) + '">');
          if (img) {
            img.addEventListener("error", function () {
              node = img;
              toAnimation();
            });
          }
        });
      });
    }

    function show(index, immediate) {
      var n = slideEls.length;
      if (!n) return;
      index = ((index % n) + n) % n;
      slideEls.forEach(function (el, i) {
        var active = i === index;
        var wasActive = el.classList.contains("is-active");
        el.classList.toggle("is-active", active);
        el.classList.toggle("is-leaving", !active && wasActive && !immediate);
        Array.prototype.forEach.call(el.querySelectorAll("video"), function (video) {
          if (active) {
            var p = video.play();
            if (p && p.catch) p.catch(function () {});
          } else {
            video.pause();
            try { video.currentTime = 0; } catch (e) { /* not seekable yet */ }
          }
        });
      });
      state.index = index;
      syncExit();
      if (o.onChange) o.onChange(controller);
    }

    function rowOf(el) {
      var host = el.closest ? el.closest("[data-rid]") : null;
      var id = host ? host.getAttribute("data-rid") : "";
      return rowsById[id] || null;
    }

    function updateTimes() {
      if (!stage) return;
      Array.prototype.forEach.call(stage.querySelectorAll("[data-live]"), function (el) {
        var row = rowOf(el);
        if (!row) return;
        var kind = el.getAttribute("data-live");
        if (kind === "nedtelling") {
          var prev = Array.prototype.map.call(el.querySelectorAll(".bn__cd-n"), function (b) { return b.textContent; });
          var html = countdownHtml(row, prev.length ? prev : null);
          if (el.innerHTML !== html) el.innerHTML = html;
        } else {
          var text = kind === "kort" ? shortLabel(row) : labelFor(row);
          if (el.textContent !== text) el.textContent = text;
        }
        el.classList.toggle("is-live", isLive(row));
      });
      slideEls.forEach(function (el, i) {
        var slide = state.slides[i];
        el.classList.toggle("is-live", !!slide && !slide.isList && isLive(slide));
      });
    }

    function reselect() {
      if (state.destroyed) return false;
      var picked = LD.select(rows, now(), selectOpts);
      var slides;
      if (!picked.slides.length) slides = [fallbackRow(design)];
      else if (listMode) slides = [{ id: "list", isList: true, link: "", rows: picked.slides }];
      else slides = picked.slides;
      // Keyed on what the rows SAY, not just their position, so an edited
      // kick-off or team name in the sheet re-renders on the next refresh.
      var ids = picked.slides.map(function (r) {
        return [r.id, r.date, r.time, r.title, r.league, r.odds, r.image, r.video, r.animation, r.cta, r.text, r.link].join("\u0001");
      }).join("\u0002");
      var key = picked.scope + ":" + (picked.slides.length ? ids : "fallback");
      if (key === state.selectionKey) return false;
      state.selectionKey = key;
      state.scope = picked.scope;
      state.dayOffset = picked.dayOffset;
      state.rows = picked.slides;
      state.slides = slides;
      state.index = 0;
      renderSlides();
      return true;
    }

    function startTimers() {
      clearTimers();
      if (state.destroyed || !autoplay || !state.playing) return;
      if (state.slides.length > 1) {
        state.timers.push(setInterval(function () { show(state.index + 1); }, slideMs));
      }
      // Times tick every second; the selection itself is re-checked every
      // 20 s so a match that just finished drops out and midnight flips the
      // day without a reload.
      var ticks = 0;
      state.timers.push(
        setInterval(function () {
          ticks++;
          updateTimes();
          if (ticks % (RESELECT_EVERY_MS / 1000) === 0 && reselect()) startTimers();
        }, 1000)
      );
    }

    // ---- live refresh from the sheet ---------------------------------------
    function fetchText(url) {
      return new Promise(function (resolve, reject) {
        var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        var timer = setTimeout(function () {
          if (ctrl) ctrl.abort();
          reject(new Error("timeout"));
        }, FETCH_TIMEOUT_MS);
        fetch(url, { mode: "cors", credentials: "omit", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.text();
          })
          .then(function (text) {
            clearTimeout(timer);
            resolve(text);
          })
          .catch(function (err) {
            clearTimeout(timer);
            reject(err);
          });
      });
    }

    function refresh() {
      var urls = (cfg.source && cfg.source.liveUrls) || [];
      urls = urls.filter(isHttps);
      if (!urls.length || typeof fetch !== "function") return Promise.resolve(false);
      var attempt = function (i) {
        if (i >= urls.length) return Promise.resolve(false);
        return fetchText(urls[i]).then(
          function (text) {
            if (state.destroyed) return false;
            // A login page or an empty read: try the next form of the link.
            if (/^\s*</.test(text)) return attempt(i + 1);
            var table = LD.readTable(LD.parseCsv(text));
            if (!table.rows.length) return attempt(i + 1);
            rows = table.rows;
            state.refreshedAt = new Date().toISOString();
            if (reselect()) startTimers();
            return true;
          },
          function () {
            return attempt(i + 1);
          }
        );
      };
      return attempt(0).catch(function () { return false; });
    }

    // ---- controller --------------------------------------------------------
    var controller = {
      state: state,
      get slides() { return state.slides; },
      get index() { return state.index; },
      get listMode() { return listMode; },
      next: function () { show(state.index + 1); },
      prev: function () { show(state.index - 1); },
      goTo: function (i) { show(i, false); },
      /** Show the slide of one match, if it is in the rotation. */
      goToRow: function (id) {
        for (var i = 0; i < state.slides.length; i++) {
          if (state.slides[i].id === id) {
            show(i, false);
            return true;
          }
        }
        return false;
      },
      pause: function () { state.playing = false; clearTimers(); },
      play: function () { state.playing = true; startTimers(); },
      setNow: function (date) {
        offsetMs = date ? new Date(date).getTime() - Date.now() : 0;
        if (!reselect()) updateTimes();
        startTimers();
      },
      refit: fitAll,
      exitUrl: function () { return exitUrlFor(state.slides[state.index]); },
      currentRow: function () { return state.slides[state.index] || null; },
      isLive: isLive,
      labelFor: labelFor,
      refresh: refresh,
      destroy: function () {
        state.destroyed = true;
        clearTimers();
        if (o.exit) {
          EXIT_EVENTS.forEach(function (evt) { o.exit.removeEventListener(evt, syncExit, true); });
        }
        root.innerHTML = "";
      },
    };

    buildFrame();
    reselect();
    startTimers();

    if (o.exit) {
      EXIT_EVENTS.forEach(function (evt) {
        o.exit.addEventListener(evt, syncExit, true);
      });
      syncExit();
    }
    // Web fonts arriving late change every measurement: fit again.
    if (root.ownerDocument && root.ownerDocument.fonts && root.ownerDocument.fonts.ready) {
      root.ownerDocument.fonts.ready.then(function () { if (!state.destroyed) fitAll(); }, function () {});
    }
    var wantRefresh = o.refresh != null ? o.refresh : design.liveRefresh !== false;
    if (wantRefresh && !still) refresh();

    return controller;
  }

  global.LiveAd = {
    mount: mount,
    mediaFor: mediaFor,
    ANIMATIONS: ANIMATIONS,
    fallbackRow: fallbackRow,
    renderTemplate: renderTemplate,
    teamCode: teamCode,
    oddsParts: oddsParts,
    palette: palette,
  };
})(typeof window !== "undefined" ? window : this);
