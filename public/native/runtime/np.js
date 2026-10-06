/* =========================================================================
   np.js — the small runtime of a published Native Premium page.

   No dependencies, no build step. Everything here is an enhancement: the page
   is complete without it (np.css only hides animated content under html.np-js,
   which this file's inline sibling sets, and reveals it again here).

   What it does:
     - entrance animations (IntersectionObserver → .np-in)
     - ambient videos: play only while on screen, never with reduced motion
     - scroll-pinned stories, scroll-scrubbed video, parallax, count-up numbers
     - fact box fold-out, gallery arrows, before/after slider, quiz, share links
     - measurement: standard events pushed to window.dataLayer and fired as a
       "np:track" DOM event, so GTM, Kilkaya, Mixpanel or anything else in the
       page's head can pick them up. It never sends anything anywhere itself.

   The editor preview loads the same file with window.NP_EDITOR = true: no
   tracking, no share links, and NPRuntime.bind(root) re-binds the sections
   the editor just re-rendered.
   ========================================================================= */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var EDITOR = !!window.NP_EDITOR;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.add("np-js");

  // ---- measurement ----------------------------------------------------------
  var body = doc.body;
  var info = {
    np_project: (body && body.getAttribute("data-np-project")) || "",
    np_page: (body && body.getAttribute("data-np-page")) || "",
    np_advertiser: (body && body.getAttribute("data-np-advertiser")) || "",
  };

  function track(event, data) {
    if (EDITOR) return;
    var payload = { event: event };
    var k;
    for (k in info) payload[k] = info[k];
    for (k in data || {}) payload[k] = data[k];
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(payload);
      window.dispatchEvent(new CustomEvent("np:track", { detail: payload }));
    } catch (_) {
      /* a broken third-party dataLayer must never break the page */
    }
  }

  // ---- helpers ------------------------------------------------------------------
  function $all(sel, scope) {
    return Array.prototype.slice.call((scope || doc).querySelectorAll(sel));
  }

  function once(el, key) {
    if (el["__np_" + key]) return false;
    el["__np_" + key] = true;
    return true;
  }

  var io = "IntersectionObserver" in window;

  function onVisible(el, cb, opts) {
    if (!io) return cb(el, true);
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        cb(e.target, e.isIntersecting, e);
      });
    }, opts || { threshold: 0.15 });
    obs.observe(el);
    return obs;
  }

  // ---- scroll loop (one rAF for everything that follows the scroll) ----------
  var scrollers = []; // bound to sections (dropped when the editor re-renders)
  var persistent = []; // page-wide (scroll depth, the "scrolled" flag)
  var ticking = false;

  function frame() {
    ticking = false;
    var vh = window.innerHeight;
    var i;
    for (i = 0; i < persistent.length; i++) persistent[i](vh);
    for (i = 0; i < scrollers.length; i++) scrollers[i](vh);
  }

  function requestFrame() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(frame);
    }
  }

  window.addEventListener("scroll", requestFrame, { passive: true });
  window.addEventListener("resize", requestFrame);

  // ---- entrance animations ------------------------------------------------------
  function bindReveal(scope) {
    $all(".np-sec", scope).forEach(function (sec) {
      if (!once(sec, "reveal")) return;
      if (EDITOR && !window.NP_PLAY_ANIMATIONS) {
        sec.classList.add("np-in");
        return;
      }
      if (reduced || !io) {
        sec.classList.add("np-in");
        return;
      }
      var obs = onVisible(
        sec,
        function (el, visible) {
          if (!visible) return;
          el.classList.add("np-in");
          obs.unobserve(el);
        },
        { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
      );
    });
  }

  // ---- videos ---------------------------------------------------------------------
  function shown(el) {
    return el.offsetParent !== null || el.getClientRects().length > 0;
  }

  function bindAmbient(scope) {
    $all("video[data-np-ambient]", scope).forEach(function (v) {
      if (!once(v, "ambient")) return;
      v.muted = true;
      if (reduced) return; // poster only
      onVisible(
        v,
        function (el, visible) {
          if (visible && shown(el)) {
            if (el.preload === "none") el.preload = "auto";
            var p = el.play();
            if (p && p.catch) p.catch(function () {});
          } else if (!el.paused) {
            el.pause();
          }
        },
        { threshold: 0.2 }
      );
    });
  }

  function bindPlayers(scope) {
    $all("video[controls]", scope).forEach(function (v) {
      if (!once(v, "player")) return;
      var label = v.getAttribute("data-np-video") || "video";
      var marks = {};
      v.addEventListener("play", function () {
        track("np_video", { np_action: "play", np_label: label });
      });
      v.addEventListener("timeupdate", function () {
        if (!v.duration) return;
        var pct = (v.currentTime / v.duration) * 100;
        [25, 50, 75].forEach(function (m) {
          if (pct >= m && !marks[m]) {
            marks[m] = true;
            track("np_video", { np_action: "progress", np_percent: m, np_label: label });
          }
        });
      });
      v.addEventListener("ended", function () {
        track("np_video", { np_action: "complete", np_label: label });
      });
    });
  }

  // ---- sticky story ----------------------------------------------------------------
  function bindStories(scope) {
    $all("[data-np-story]", scope).forEach(function (story) {
      if (!once(story, "story")) return;
      var layers = $all("[data-np-layer]", story);
      var cards = $all("[data-np-card]", story);
      if (layers.length < 2 || !io) return;
      // The layer each card shows: its own image, else the last one before it.
      var current = 0;
      var targets = cards.map(function (card) {
        var own = card.getAttribute("data-np-show");
        if (own !== null) current = Number(own);
        return current;
      });
      function activate(index) {
        layers.forEach(function (l, i) {
          l.classList.toggle("is-active", i === index);
        });
      }
      cards.forEach(function (card, i) {
        onVisible(
          card,
          function (el, visible) {
            if (visible) activate(targets[i]);
          },
          { threshold: 0, rootMargin: "-45% 0px -45% 0px" }
        );
      });
    });
  }

  // ---- scroll-scrubbed video ------------------------------------------------------
  function bindScrollVideos(scope) {
    $all("[data-np-scrollvideo]", scope).forEach(function (sec) {
      if (!once(sec, "scrub")) return;
      var caps = $all(".np-sv__cap", sec);
      var target = 0;
      function videoNow() {
        var vids = $all("video", sec).filter(shown);
        return vids[0] || null;
      }
      $all("video", sec).forEach(function (v) {
        v.preload = "auto";
        v.pause();
      });
      scrollers.push(function (vh) {
        var rect = sec.getBoundingClientRect();
        var total = rect.height - vh;
        if (rect.bottom < -vh || rect.top > vh * 2) return;
        var progress = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
        var v = videoNow();
        if (v && v.duration && !reduced) {
          target = progress * (v.duration - 0.05);
          if (Math.abs(v.currentTime - target) > 0.03) {
            if (v.fastSeek && Math.abs(v.currentTime - target) > 1) v.fastSeek(target);
            else v.currentTime = target;
          }
        }
        caps.forEach(function (c) {
          var from = Number(c.getAttribute("data-np-from"));
          var to = Number(c.getAttribute("data-np-to"));
          c.classList.toggle("is-on", progress >= from && progress <= to);
        });
      });
      requestFrame();
    });
  }

  // ---- parallax --------------------------------------------------------------------
  function bindParallax(scope) {
    if (reduced) return;
    $all("[data-np-parallax]", scope).forEach(function (el) {
      if (!once(el, "parallax")) return;
      var speed = Number(el.getAttribute("data-np-parallax")) || 0.3;
      var host = el.parentNode;
      scrollers.push(function (vh) {
        var r = host.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        var center = r.top + r.height / 2 - vh / 2;
        var shift = Math.max(-1, Math.min(1, center / vh)) * speed * r.height * -0.35;
        el.style.transform = "translate3d(0," + shift.toFixed(1) + "px,0)";
      });
      requestFrame();
    });
  }

  // ---- count up -----------------------------------------------------------------
  function parseNumber(text) {
    var clean = String(text).replace(/\s| /g, "");
    var m = /^(-?)(\d+)(?:[.,](\d+))?$/.exec(clean.replace(/\.(?=\d{3}(\D|$))/g, ""));
    if (!m) return null;
    return { value: parseFloat(m[1] + m[2] + (m[3] ? "." + m[3] : "")), decimals: m[3] ? m[3].length : 0, grouped: /\d\s\d{3}/.test(text) };
  }

  function formatNumber(n, decimals, grouped) {
    var s = n.toFixed(decimals);
    var parts = s.split(".");
    if (grouped) parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return parts.join(",");
  }

  function bindCounters(scope) {
    $all("[data-np-count]", scope).forEach(function (el) {
      if (!once(el, "count") || EDITOR || reduced) return;
      var parsed = parseNumber(el.textContent);
      if (!parsed) return;
      var original = el.textContent;
      el.textContent = formatNumber(0, parsed.decimals, parsed.grouped);
      var obs = onVisible(
        el,
        function (target, visible) {
          if (!visible) return;
          obs && obs.unobserve(target);
          var start = null;
          var dur = 1400;
          function step(t) {
            if (start === null) start = t;
            var k = Math.min(1, (t - start) / dur);
            var eased = 1 - Math.pow(1 - k, 3);
            target.textContent = k < 1 ? formatNumber(parsed.value * eased, parsed.decimals, parsed.grouped) : original;
            if (k < 1) window.requestAnimationFrame(step);
          }
          window.requestAnimationFrame(step);
        },
        { threshold: 0.6 }
      );
    });
  }

  // ---- fact box ---------------------------------------------------------------------
  function bindFactBoxes(scope) {
    $all(".np-fact--fold", scope).forEach(function (box) {
      if (!once(box, "fold")) return;
      var btn = box.querySelector(".np-fact__more");
      if (!btn) return;
      var label = btn.querySelector("span");
      btn.addEventListener("click", function () {
        var open = !box.classList.contains("is-open");
        box.classList.toggle("is-open", open);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        if (label) label.textContent = open ? "Vis færre" : "Vis alle fakta";
        if (open) track("np_factbox_open", {});
      });
    });
  }

  // ---- gallery ------------------------------------------------------------------------
  function bindCarousels(scope) {
    $all("[data-np-carousel]", scope).forEach(function (car) {
      if (!once(car, "carousel")) return;
      var track_ = car.querySelector(".np-gal__track");
      var prev = car.querySelector("[data-np-prev]");
      var next = car.querySelector("[data-np-next]");
      function update() {
        var max = track_.scrollWidth - track_.clientWidth - 2;
        prev.disabled = track_.scrollLeft <= 2;
        next.disabled = track_.scrollLeft >= max;
      }
      function go(dir) {
        var fig = track_.querySelector("figure");
        var step = fig ? fig.getBoundingClientRect().width + 16 : track_.clientWidth * 0.8;
        track_.scrollBy({ left: dir * step, behavior: reduced ? "auto" : "smooth" });
      }
      prev.addEventListener("click", function () { go(-1); });
      next.addEventListener("click", function () { go(1); });
      track_.addEventListener("scroll", update, { passive: true });
      update();
    });
  }

  // ---- before / after -------------------------------------------------------------
  function bindCompare(scope) {
    $all("[data-np-compare]", scope).forEach(function (box) {
      if (!once(box, "compare")) return;
      var input = box.querySelector("input");
      input.addEventListener("input", function () {
        box.style.setProperty("--pos", input.value + "%");
      });
    });
  }

  // ---- quiz -----------------------------------------------------------------------------
  function bindQuiz(scope) {
    $all("[data-np-quiz]", scope).forEach(function (quiz) {
      if (!once(quiz, "quiz")) return;
      var questions = $all("[data-np-q]", quiz);
      var answered = 0;
      var right = 0;
      var score = quiz.querySelector(".np-quiz__score");
      questions.forEach(function (q, qi) {
        var correct = Number(q.getAttribute("data-np-correct"));
        var opts = $all("[data-np-opt]", q);
        opts.forEach(function (btn) {
          btn.addEventListener("click", function () {
            if (q.__np_done) return;
            q.__np_done = true;
            var pick = Number(btn.getAttribute("data-np-opt"));
            opts.forEach(function (b, i) {
              b.disabled = true;
              if (i === correct) b.classList.add("is-right");
            });
            if (pick !== correct) btn.classList.add("is-wrong");
            else right++;
            answered++;
            var ex = q.querySelector(".np-quiz__ex");
            if (ex) {
              ex.classList.add("is-on");
              ex.open = true;
            }
            track("np_quiz_answer", { np_question: qi + 1, np_correct: pick === correct });
            if (answered === questions.length && score) {
              score.textContent = "Du fikk " + right + " av " + questions.length + " riktige.";
              track("np_quiz_complete", { np_score: right, np_total: questions.length });
            }
          });
        });
      });
    });
  }

  // ---- share --------------------------------------------------------------------------
  function bindShare(scope) {
    $all("[data-np-share]", scope).forEach(function (box) {
      if (!once(box, "share")) return;
      if (EDITOR) return;
      var url = location.href.split("#")[0];
      var title = doc.title;
      var mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      $all("[data-np-share-to]", box).forEach(function (a) {
        var to = a.getAttribute("data-np-share-to");
        if (to === "facebook") {
          a.href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url);
          a.target = "_blank";
          a.rel = "noopener";
        } else if (to === "messenger") {
          if (!mobile) {
            a.hidden = true;
            return;
          }
          a.href = "fb-messenger://share/?link=" + encodeURIComponent(url);
        } else if (to === "mail") {
          a.href = "mailto:?subject=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(url);
        } else if (to === "copy") {
          if (!navigator.clipboard) {
            a.hidden = true;
            return;
          }
          a.addEventListener("click", function (e) {
            e.preventDefault();
            navigator.clipboard.writeText(url).then(function () {
              a.setAttribute("aria-label", "Lenken er kopiert");
              a.style.borderColor = "currentColor";
            });
          });
        }
        a.addEventListener("click", function () {
          track("np_share", { np_network: to });
        });
      });
    });
  }

  // ---- measurement hooks ----------------------------------------------------------
  function bindTracking() {
    if (EDITOR) return;
    track("np_view", {});
    doc.addEventListener(
      "click",
      function (e) {
        var a = e.target.closest && e.target.closest("[data-np-cta]");
        if (!a) return;
        track("np_cta_click", { np_label: a.getAttribute("data-np-cta"), np_url: a.getAttribute("href") || "" });
      },
      true
    );
    var depths = [25, 50, 75, 100];
    var reached = {};
    persistent.push(function (vh) {
      var h = doc.documentElement.scrollHeight - vh;
      var pct = h > 0 ? ((window.scrollY || window.pageYOffset) / h) * 100 : 100;
      depths.forEach(function (d) {
        if (pct >= d - 1 && !reached[d]) {
          reached[d] = true;
          track("np_scroll", { np_percent: d });
        }
      });
    });
    [10, 30, 60, 120].forEach(function (sec) {
      setTimeout(function () {
        if (doc.visibilityState !== "hidden") track("np_time", { np_seconds: sec });
      }, sec * 1000);
    });
  }

  function bind(scope) {
    bindReveal(scope);
    bindAmbient(scope);
    bindPlayers(scope);
    bindStories(scope);
    bindScrollVideos(scope);
    bindParallax(scope);
    bindCounters(scope);
    bindFactBoxes(scope);
    bindCarousels(scope);
    bindCompare(scope);
    bindQuiz(scope);
    bindShare(scope);
    requestFrame();
  }

  window.NPRuntime = {
    bind: bind,
    track: track,
    // The editor re-renders sections; dropped nodes take their listeners along,
    // but the shared scroll loop must forget them too.
    resetScrollers: function () {
      scrollers.length = 0;
    },
  };

  function start() {
    body = doc.body;
    info.np_project = body.getAttribute("data-np-project") || "";
    info.np_page = body.getAttribute("data-np-page") || "";
    info.np_advertiser = body.getAttribute("data-np-advertiser") || "";
    persistent.push(function () {
      root.classList.toggle("np-scrolled", (window.scrollY || window.pageYOffset) > 80);
    });
    bind(doc);
    bindTracking();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start);
  else start();
})();
