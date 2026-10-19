/* =========================================================================
   live.js — the NT Live creative at run time.

   One function, LiveAd.mount(root, type, config, options), builds a Norsk
   Tipping banner that shows TODAY's matches from a sheet, one slide per
   match: a photo, a looping video or a CSS animation on top; competition,
   teams, kick-off time (or a ticking countdown) and a button below. The
   regulated furniture (Annonse, 18+ | Hjelpelinjen.no, Vinnersjanse) is the
   very markup banner.js draws on the static banners.

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

  function esc(value) {
    return PARTS ? PARTS.escapeHtml(value) : String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function safeColor(value, fallback) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(value || "")) ? String(value) : fallback;
  }

  function isHttps(url) {
    return /^https:\/\//i.test(String(url || ""));
  }

  function animationName(value, fallback) {
    var name = LD.fold(value);
    return ANIMATIONS.indexOf(name) !== -1 ? name : fallback;
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

  function teamsHtml(row, design) {
    if (design.teamsInAnimation === false || !row.home) return "";
    return (
      '<div class="bn__anim-teams"><span>' + esc(row.home) + "</span>" +
      (row.away ? "<em>mot</em><span>" + esc(row.away) + "</span>" : "") +
      "</div>"
    );
  }

  function mediaHtml(media, row, design) {
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
      teamsHtml(row, design) +
      "</div>"
    );
  }

  function kickerText(row, design) {
    var product = String(design.kicker == null ? "Oddsen" : design.kicker).trim();
    var league = row.league || "";
    if (product && league) return product + " · " + league;
    return product || league;
  }

  function bodyHtml(row, config, type, label) {
    var design = config.design || {};
    var kicker = kickerText(row, design);
    var cta = String(row.cta || design.ctaText || "").trim();
    var odds = row.odds ? row.odds.replace(/\s*[-–,;]\s*/g, " · ") : "";
    var ctaClass = type === "newsgrid" ? "bn__live-cta bn__live-cta--text" : "bn__live-cta";
    return (
      '<div class="bn__body">' +
      (kicker ? '<span class="bn__live-kicker">' + esc(kicker) + "</span>" : "") +
      '<h2 class="bn__headline">' + esc(row.title) + "</h2>" +
      '<span class="bn__live-time">' + esc(label) + "</span>" +
      (odds ? '<span class="bn__live-odds">' + esc(odds) + "</span>" : "") +
      (cta ? '<span class="' + ctaClass + '">' + esc(cta) + "</span>" : "") +
      "</div>"
    );
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
  // Headline fitting: step the size down (two notches) when two lines are
  // not enough — long team names on the 190×190 and the 320×400.
  // ------------------------------------------------------------------------
  function fitHeadline(h2) {
    if (!h2) return;
    h2.classList.remove("is-fit-1", "is-fit-2");
    for (var step = 1; step <= 2; step++) {
      if (h2.scrollHeight <= h2.clientHeight + 1) return;
      h2.classList.remove("is-fit-" + (step - 1));
      h2.classList.add("is-fit-" + step);
    }
  }

  // ------------------------------------------------------------------------
  // Mount
  // ------------------------------------------------------------------------
  /**
   * @param {HTMLElement} root
   * @param {string} type  "readpeak" | "desktop" | "mobile" | "newsgrid"
   * @param {Object} config  { rows, design, badges, assets, source }
   * @param {Object} [options]
   *   now: Date      — pretend it is this moment (the preview's date picker)
   *   autoplay: bool — rotate and tick (default true)
   *   still: bool    — the backup image: no video, animations frozen
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
    var transition = design.transition === "slide" || design.transition === "none" ? design.transition : "fade";

    var state = { slides: [], index: 0, scope: "none", selectionKey: "", timers: [], destroyed: false, playing: autoplay };
    var stage = null;
    var slideEls = [];

    function now() {
      return new Date(Date.now() + offsetMs);
    }

    function labelFor(row) {
      if (row.isFallback) return row.text;
      return LD.timeLabel(row, now(), selectOpts);
    }

    function isLiveLabel(row) {
      if (row.isFallback || !row.time) return false;
      var start = LD.kickoffMs(row.date, row.time);
      var diff = start - now().getTime();
      var finishedAfter = Number(design.finishedAfterMin) || LD.DEFAULTS.finishedAfterMin;
      return diff <= 0 && diff > -finishedAfter * 60000;
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
      var cls = "bn bn--live bn--" + type + " bn--p-norsktipping bn--live-" + transition;
      if (still) cls += " bn--still";
      root.className = cls;
      root.style.setProperty("--live-accent", safeColor(design.accent, "#1a6b1a"));
      var scale = Number(design.textScale);
      root.style.setProperty("--hl-scale", isFinite(scale) && scale > 0 ? Math.max(0.6, Math.min(1.6, scale)) : 1);
      var badgeData = {
        annonseText: badges.annonseText || "Annonse",
        ageBadgeText: badges.ageBadgeText || "18+ | Hjelpelinjen.no",
        ageIconUrl: badges.ageIconUrl || "",
        hideAgeBadge: !!badges.hideAgeBadge,
        vinnersjanse: badges.vinnersjanse || "",
        showVinnerOnNewsgrid: !!badges.showVinnerOnNewsgrid,
      };
      root.innerHTML =
        '<div class="bn__live-stage"></div>' +
        '<div class="bn__live-badges bn__media">' + (PARTS ? PARTS.overlaysFor(type, badgeData) : "") + "</div>";
      stage = root.firstChild;
    }

    function renderSlides() {
      stage.innerHTML = "";
      slideEls = [];
      state.slides.forEach(function (row) {
        var media = mediaFor(row, cfg, still);
        var el = document.createElement("div");
        el.className = "bn__live-slide";
        el.innerHTML = '<div class="bn__media">' + mediaHtml(media, row, design) + "</div>" + bodyHtml(row, cfg, type, labelFor(row));
        wireMedia(el, media, row);
        stage.appendChild(el);
        slideEls.push(el);
      });
      state.index = Math.min(state.index, Math.max(0, state.slides.length - 1));
      show(state.index, true);
      slideEls.forEach(function (el) { fitHeadline(el.querySelector(".bn__headline")); });
      updateTimes();
    }

    // A photo or video that fails to load gives way to the animation, so the
    // slot is never a broken-image icon in a live ad.
    function wireMedia(el, media, row) {
      var host = el.querySelector(".bn__media");
      var node = host.firstChild;
      if (!node || media.kind === "anim") return;
      var swap = function () {
        if (media.kind === "video" && media.poster) {
          host.innerHTML = '<img class="bn__img" alt="" src="' + esc(media.poster) + '">';
          host.firstChild.addEventListener("error", function () {
            host.innerHTML = mediaHtml({ kind: "anim", preset: animationName(design.defaultMedia, "gradient") }, row, design);
          });
          return;
        }
        host.innerHTML = mediaHtml({ kind: "anim", preset: animationName(design.defaultMedia, "gradient") }, row, design);
      };
      node.addEventListener("error", swap);
      if (media.kind === "video") {
        // A video that cannot start (autoplay refused, codec) is swapped too.
        node.addEventListener("stalled", function () {
          if (node.readyState < 2) swap();
        });
      }
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
        var video = el.querySelector("video");
        if (!video) return;
        if (active) {
          var p = video.play();
          if (p && p.catch) p.catch(function () {});
        } else {
          video.pause();
          try { video.currentTime = 0; } catch (e) { /* not seekable yet */ }
        }
      });
      state.index = index;
      syncExit();
      if (o.onChange) o.onChange(controller);
    }

    function updateTimes() {
      var changed = false;
      state.slides.forEach(function (row, i) {
        var el = slideEls[i] && slideEls[i].querySelector(".bn__live-time");
        if (!el) return;
        var label = labelFor(row);
        if (el.textContent !== label) {
          el.textContent = label;
          changed = true;
        }
        el.classList.toggle("is-live", isLiveLabel(row));
      });
      return changed;
    }

    function reselect() {
      var picked = LD.select(rows, now(), selectOpts);
      var slides = picked.slides.length ? picked.slides : [fallbackRow(design)];
      var key = picked.scope + ":" + slides.map(function (r) { return r.id; }).join(",");
      if (key === state.selectionKey) return false;
      state.selectionKey = key;
      state.scope = picked.scope;
      state.dayOffset = picked.dayOffset;
      state.slides = slides;
      state.index = 0;
      renderSlides();
      return true;
    }

    function startTimers() {
      clearTimers();
      if (!autoplay || !state.playing) return;
      if (state.slides.length > 1) {
        state.timers.push(setInterval(function () { show(state.index + 1); }, slideMs));
      }
      // Countdown ticks every second; the selection itself is re-checked
      // every 20 s so a match that just finished drops out and midnight
      // flips the day without a reload.
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
            if (/^\s*</.test(text)) throw new Error("html"); // a login page, not the sheet
            var table = LD.readTable(LD.parseCsv(text));
            if (!table.rows.length) return false;
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
      next: function () { show(state.index + 1); },
      prev: function () { show(state.index - 1); },
      goTo: function (i) { show(i, false); },
      pause: function () { state.playing = false; clearTimers(); },
      play: function () { state.playing = true; startTimers(); },
      setNow: function (date) {
        offsetMs = date ? new Date(date).getTime() - Date.now() : 0;
        if (!reselect()) updateTimes();
        startTimers();
      },
      exitUrl: function () { return exitUrlFor(state.slides[state.index]); },
      currentRow: function () { return state.slides[state.index] || null; },
      labelFor: labelFor,
      refresh: refresh,
      destroy: function () {
        state.destroyed = true;
        clearTimers();
        root.innerHTML = "";
      },
    };

    buildFrame();
    reselect();
    startTimers();

    if (o.exit) {
      ["mousedown", "touchstart", "contextmenu", "auxclick", "focus", "click"].forEach(function (evt) {
        o.exit.addEventListener(evt, syncExit, true);
      });
      syncExit();
    }
    var wantRefresh = o.refresh != null ? o.refresh : design.liveRefresh !== false;
    if (wantRefresh && !still) refresh();

    return controller;
  }

  global.LiveAd = { mount: mount, mediaFor: mediaFor, ANIMATIONS: ANIMATIONS, fallbackRow: fallbackRow };
})(typeof window !== "undefined" ? window : this);
