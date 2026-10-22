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
   the editor just re-rendered. NPRuntime.dispose() then lets go of the
   sections that left the page: their scroll handlers, resize listeners,
   observers and timers (everything a binding registers is tied to its
   element). window.NP_REDUCED_MOTION = true makes the runtime behave as if
   the reader had asked for reduced motion (the editor's preview toggle).
   ========================================================================= */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var EDITOR = !!window.NP_EDITOR;
  var reduced = !!window.NP_REDUCED_MOTION || !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
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

  // What a binding leaves behind outside its element (window listeners,
  // observers), as [element, undo]: dispose() undoes it once the element has
  // left the page.
  var cleanups = [];

  function listen(el, target, type, fn) {
    target.addEventListener(type, fn);
    cleanups.push([el, function () { target.removeEventListener(type, fn); }]);
  }

  function onVisible(el, cb, opts) {
    if (!io) return cb(el, true);
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        cb(e.target, e.isIntersecting, e);
      });
    }, opts || { threshold: 0.15 });
    obs.observe(el);
    cleanups.push([el, function () { obs.disconnect(); }]);
    return obs;
  }

  // ---- scroll loop (one rAF for everything that follows the scroll) ----------
  var scrollers = []; // [element, fn(vh)] bound to sections
  var persistent = []; // page-wide (scroll depth, the "scrolled" flag)
  var ticking = false;

  function onScroll(el, fn) {
    scrollers.push([el, fn]);
  }

  function frame() {
    ticking = false;
    var vh = window.innerHeight;
    var i;
    for (i = 0; i < persistent.length; i++) persistent[i](vh);
    for (i = 0; i < scrollers.length; i++) scrollers[i][1](vh);
  }

  /** Forget everything bound to elements that are no longer in the page. */
  function dispose() {
    scrollers = scrollers.filter(function (s) { return s[0].isConnected; });
    cleanups = cleanups.filter(function (c) {
      if (c[0].isConnected) return true;
      c[1]();
      return false;
    });
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
  // Clip-path entrances let go of their clip once played (.np-done), so
  // shadows and hover lifts inside the section are never cut off.

  function seconds(el, prop, dflt) {
    var v = window.getComputedStyle(el).getPropertyValue(prop).trim();
    var n = parseFloat(v);
    if (!isFinite(n)) return dflt;
    return /ms$/.test(v) ? n / 1000 : n;
  }

  // Once played (.np-done) the stagger delays go too, so a hover on a card
  // reacts at once instead of waiting for its turn in the entrance.
  function play(sec) {
    splitHeadings(sec);
    sec.classList.add("np-in");
    clearTimeout(sec.__np_doneTimer);
    var steps = sec.classList.contains("np-anim-stagger") ? $all(".np-st", sec).length * seconds(sec, "--np-step", 0.09) : 0;
    var wait = (seconds(sec, "--np-delay", 0) + seconds(sec, "--np-dur", 0.9) * 1.3 + Math.min(steps, 4)) * 1000 + 80;
    sec.__np_doneTimer = setTimeout(function () {
      if (sec.classList.contains("np-in")) sec.classList.add("np-done");
    }, wait);
  }

  function unplay(sec) {
    clearTimeout(sec.__np_doneTimer);
    sec.classList.remove("np-in", "np-done");
  }

  /** Elements matching `sel` in scope, the scope itself included. */
  function $self(sel, scope) {
    var list = $all(sel, scope);
    if (scope && scope.nodeType === 1 && scope.matches(sel)) list.unshift(scope);
    return list;
  }

  function bindReveal(scope) {
    $self(".np-sec", scope).forEach(function (sec) {
      if (!once(sec, "reveal")) return;
      if ((EDITOR && !window.NP_PLAY_ANIMATIONS) || reduced || !io) {
        sec.classList.add("np-in", "np-done");
        if (!EDITOR && !reduced) splitHeadings(sec);
        return;
      }
      var repeat = sec.classList.contains("np-repeat");
      var obs = onVisible(
        sec,
        function (el, visible, entry) {
          if (visible) {
            play(el);
            if (!repeat) obs.unobserve(el);
          } else if (repeat && entry && entry.intersectionRatio === 0 && el.classList.contains("np-in")) {
            // Only once it is wholly off screen, so it never blinks in view.
            unplay(el);
          }
        },
        { threshold: [0, 0.12], rootMargin: "0px 0px -6% 0px" }
      );
    });
  }

  // ---- heading effects (Stil → Mellomtitler) ----------------------------------------
  // The H2s of a section with .np-hfx-* are split into words (or letters) here,
  // never in the stored HTML: without JavaScript the heading is plain text.
  // The words stay real text in the heading, so screen readers read it whole;
  // the letter mode adds an aria-label because some readers spell spans.
  var HFX = /\bnp-hfx-(words|fade-words|letters|highlight)\b/;

  function splitNode(node, mode, counter) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 1) {
        if (!/^(BR|IMG|SVG)$/i.test(child.nodeName)) splitNode(child, mode, counter);
        return;
      }
      if (child.nodeType !== 3 || !child.nodeValue) return;
      var frag = doc.createDocumentFragment();
      child.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          frag.appendChild(doc.createTextNode(" "));
          return;
        }
        var outer = doc.createElement("span");
        outer.className = "np-hw";
        if (mode === "letters") {
          Array.from(part).forEach(function (ch) {
            var c = doc.createElement("span");
            c.className = "np-hc";
            c.style.setProperty("--i", counter.n++);
            c.textContent = ch;
            outer.appendChild(c);
          });
        } else {
          var inner = doc.createElement("span");
          inner.className = "np-hwi";
          inner.style.setProperty("--i", counter.n++);
          inner.textContent = part;
          outer.appendChild(inner);
        }
        frag.appendChild(outer);
      });
      node.replaceChild(frag, child);
    });
  }

  function splitHeadings(sec) {
    var m = HFX.exec(sec.className);
    if (!m) return;
    $all("h2", sec).forEach(function (h) {
      if (h.__np_split || h.isContentEditable) return;
      h.__np_split = h.innerHTML;
      if (m[1] === "highlight") {
        var hl = doc.createElement("span");
        hl.className = "np-hl";
        while (h.firstChild) hl.appendChild(h.firstChild);
        h.appendChild(hl);
        return;
      }
      if (m[1] === "letters" && !h.hasAttribute("aria-label")) {
        h.setAttribute("aria-label", h.textContent.replace(/\s+/g, " ").trim());
        h.__np_label = true;
      }
      splitNode(h, m[1], { n: 0 });
    });
  }

  /** Puts the editor's headings back as typed (it edits them in place). */
  function joinHeadings(sec) {
    $all("h2", sec).forEach(function (h) {
      if (h.__np_split === undefined || h.isContentEditable) return;
      h.innerHTML = h.__np_split;
      if (h.__np_label) h.removeAttribute("aria-label");
      h.__np_split = undefined;
      h.__np_label = false;
    });
  }

  /**
   * Plays a section's entrance again from the start (the editor's
   * "Spill av animasjon"). Returns how long it runs, in ms.
   */
  function replay(sec) {
    if (!sec || reduced) return 0;
    unplay(sec);
    void sec.offsetWidth; // commit the hidden state before showing again
    var total = (seconds(sec, "--np-delay", 0) + seconds(sec, "--np-dur", 0.9) * 1.6) * 1000 + 900;
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        play(sec);
      });
    });
    if (EDITOR) {
      clearTimeout(sec.__np_joinTimer);
      sec.__np_joinTimer = setTimeout(function () {
        if (sec.isConnected) joinHeadings(sec);
      }, total);
    }
    return total;
  }

  // ---- scroll-linked section motion (Stil → Overgang / Effekt mens man scroller) ---
  // Sections with [data-np-motion] get their progress as custom properties,
  // which np.css turns into transforms, clips and opacity:
  //   --np-tp  0 → 1 while the section's top travels from the bottom of the
  //            screen to near the top (its entrance)
  //   --np-c   0 → 1 over the whole time the section is on screen
  //   --np-x   0 → 1 while it leaves (its bottom from the screen's bottom to top)
  // "stack" and "cover" also pin the section above (sticky) so this one
  // slides over it; "stack" dims and shrinks it as it is covered. All reads
  // happen before all writes, in the one scroll frame.
  var motion = []; // { sec, prev }
  var pinned = []; // sections pinned for a stack/cover above them

  function prevSection(sec) {
    var n = sec.previousElementSibling;
    while (n && !(n.classList && n.classList.contains("np-sec"))) n = n.previousElementSibling;
    return n;
  }

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function setVar(el, name, v) {
    var t = v.toFixed(3);
    if (el["__np" + name] === t) return;
    el["__np" + name] = t;
    el.style.setProperty(name, t);
  }

  function unpin(el) {
    el.classList.remove("np-tr-under", "np-tr-recede", "np-tr-gone");
    el.style.removeProperty("--np-stick");
    el.style.removeProperty("--np-cv");
    el.__np__stick = el["__np--np-cv"] = undefined;
  }

  // Where an element sits on screen ignoring transforms: a section that is
  // itself shrinking under the next card ("stack" chains like a deck) must
  // not look less covered, or the one beneath it would reappear.
  function layoutTop(el) {
    var y = 0;
    for (var n = el; n; n = n.offsetParent) y += n.offsetTop;
    return y - (window.scrollY || window.pageYOffset);
  }

  function motionFrame(vh) {
    if (!motion.length && !pinned.length) return;
    motion = motion.filter(function (m) { return m.sec.isConnected; });
    var headH = 0;
    var reads = motion.map(function (m) {
      if (!headH) headH = parseFloat(window.getComputedStyle(m.sec).getPropertyValue("--np-head-h")) || 0;
      var tr = m.sec.className.match(/\bnp-tr-(stack|cover)\b/);
      var prev = tr ? prevSection(m.sec) : null;
      var top = layoutTop(m.sec);
      var h = m.sec.offsetHeight;
      return { m: m, r: { top: top, bottom: top + h, height: h }, tr: tr && tr[1], prev: prev, prevH: prev ? prev.offsetHeight : 0 };
    });
    var keep = [];
    reads.forEach(function (x) {
      var sec = x.m.sec;
      var r = x.r;
      var tp = clamp01((vh - r.top) / (vh * 0.85));
      setVar(sec, "--np-tp", tp);
      setVar(sec, "--np-c", clamp01((vh - r.top) / (vh + r.height)));
      var ex = clamp01(1 - r.bottom / vh);
      setVar(sec, "--np-x", ex);
      sec.classList.toggle("np-tr-full", tp >= 0.999);
      sec.classList.toggle("np-x-on", ex > 0.001);
      if (x.prev) {
        var p = x.prev;
        keep.push(p);
        if (pinned.indexOf(p) === -1) pinned.push(p);
        p.classList.add("np-tr-under");
        p.classList.toggle("np-tr-recede", x.tr === "stack");
        var top = Math.min(headH, vh - x.prevH);
        if (p.__np__stick !== top) {
          p.__np__stick = top;
          p.style.setProperty("--np-stick", top + "px");
        }
        if (x.tr === "stack") setVar(p, "--np-cv", clamp01((vh - r.top) / Math.max(1, vh - headH)));
        // Wholly covered: hide it, so a see-through section further down never
        // shows the pinned one through itself.
        p.classList.toggle("np-tr-gone", r.top <= headH + 1);
      }
    });
    pinned = pinned.filter(function (p) {
      if (keep.indexOf(p) !== -1 && p.isConnected) return true;
      unpin(p);
      return false;
    });
  }

  function bindMotion(scope) {
    if (reduced) return;
    $self("[data-np-motion]", scope).forEach(function (sec) {
      if (!once(sec, "motion")) return;
      motion.push({ sec: sec });
    });
  }
  persistent.push(motionFrame);

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
      if (!io) return;
      if (layers.length < 2) {
        // One background: still mark the card being read (split layouts).
        cards.forEach(function (card) {
          onVisible(card, function (el, visible) { el.classList.toggle("is-on", visible); }, { threshold: 0, rootMargin: "-40% 0px -40% 0px" });
        });
        return;
      }
      // The layer each card shows: its own image, else the last one before it.
      var current = 0;
      var targets = cards.map(function (card) {
        var own = card.getAttribute("data-np-show");
        if (own !== null) current = Number(own);
        return current;
      });
      var dots = $all(".np-story__dots i", story);
      function activate(index, cardIndex) {
        layers.forEach(function (l, i) {
          l.classList.toggle("is-active", i === index);
          l.classList.toggle("is-past", i < index);
        });
        dots.forEach(function (d, i) { d.classList.toggle("is-on", i === cardIndex); });
        cards.forEach(function (c, i) { c.classList.toggle("is-on", i === cardIndex); });
      }
      cards.forEach(function (card, i) {
        onVisible(
          card,
          function (el, visible) {
            if (visible) activate(targets[i], i);
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
      onScroll(sec, function (vh) {
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
      onScroll(el, function (vh) {
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
        // A low bar: a number half hidden behind a sticky bar or a clipped
        // transition must still count up, never stay at 0.
        { threshold: 0.2 }
      );
      // Leaving the page before it was seen must not leave a 0 behind either
      // (print, "save as", a screenshot of the whole page).
      window.addEventListener("beforeprint", function () { el.textContent = original; });
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
            var bar = quiz.querySelector(".np-quiz__bar i");
            if (bar) bar.style.width = (answered / questions.length) * 100 + "%";
            var ex = q.querySelector(".np-quiz__ex");
            if (ex) {
              ex.classList.add("is-on");
              ex.open = true;
            }
            track("np_quiz_answer", { np_question: qi + 1, np_correct: pick === correct });
            if (answered === questions.length && score) {
              score.textContent = "Du fikk " + right + " av " + questions.length + " riktige.";
              // The result with the highest threshold the score reaches.
              var best = null;
              var bestMin = -1;
              $all(".np-quiz__res", quiz).forEach(function (r) {
                var min = Number(r.getAttribute("data-np-min"));
                if (min <= right && min > bestMin) {
                  best = r;
                  bestMin = min;
                }
              });
              if (best) best.hidden = false;
              var cta = quiz.querySelector(".np-quiz__cta");
              if (cta) cta.hidden = false;
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


  // ---- hero that zooms out to full bleed ----------------------------------------
  function bindHeroZoom(scope) {
    $all("[data-np-zoom]", scope).forEach(function (track_) {
      if (!once(track_, "zoom")) return;
      var hero = track_.closest(".np-hero");
      if (reduced || EDITOR) {
        track_.style.setProperty("--np-z", "1");
        if (hero) hero.classList.add("is-zoomed");
        return;
      }
      // The picture starts just below the title block.
      var textBox = track_.querySelector(".np-wrap");
      function measure() {
        if (textBox) track_.style.setProperty("--np-zt", textBox.offsetHeight + 24 + "px");
      }
      measure();
      listen(track_, window, "resize", measure);
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(measure);
      onScroll(track_, function (vh) {
        var r = track_.getBoundingClientRect();
        var total = r.height - vh;
        var p = total > 0 ? Math.min(1, Math.max(0, -r.top / (total * 0.75))) : 1;
        var eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        track_.style.setProperty("--np-z", eased.toFixed(4));
        if (hero) hero.classList.toggle("is-zoomed", eased > 0.55);
      });
      requestFrame();
    });
  }

  // ---- statement: words light up with the scroll, typewriter -------------------
  function bindStatements(scope) {
    $all("[data-np-words]", scope).forEach(function (el) {
      if (!once(el, "words")) return;
      var words = $all(".np-sw", el);
      if (!words.length) return;
      if (reduced || EDITOR) {
        words.forEach(function (w) { w.classList.add("is-lit"); });
        return;
      }
      onScroll(el, function (vh) {
        var r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        // From the text's top reaching 85 % of the screen to its bottom at 45 %.
        var start = vh * 0.85;
        var end = vh * 0.45;
        var p = (start - r.top) / (start - end + r.height);
        var lit = Math.round(Math.min(1, Math.max(0, p)) * words.length);
        for (var i = 0; i < words.length; i++) words[i].classList.toggle("is-lit", i < lit);
      });
      requestFrame();
    });
    $all("[data-np-typewriter]", scope).forEach(function (el) {
      if (!once(el, "tw") || reduced || EDITOR) return;
      var text = el.getAttribute("data-text") || el.textContent;
      el.textContent = "";
      var obs = onVisible(el, function (t, visible) {
        if (!visible) return;
        obs && obs.unobserve(t);
        var i = 0;
        (function type() {
          if (!t.isConnected) return; // re-rendered by the editor
          i++;
          t.textContent = text.slice(0, i);
          if (i < text.length) setTimeout(type, 28 + Math.random() * 50);
        })();
      }, { threshold: 0.5 });
    });
  }

  // ---- marquee that follows the scroll -------------------------------------------
  function bindMarquees(scope) {
    $all("[data-np-mqscroll]", scope).forEach(function (el) {
      if (!once(el, "mq") || reduced) return;
      var dir = el.classList.contains("np-mq--right") ? 1 : -1;
      onScroll(el, function (vh) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var shift = (vh - r.top) * 0.6 * dir;
        el.style.setProperty("--np-mqx", (dir < 0 ? shift : shift - el.scrollWidth / 2).toFixed(1) + "px");
      });
      requestFrame();
    });
  }

  // ---- tabs ------------------------------------------------------------------------------
  function bindTabs(scope) {
    $all("[data-np-tabs]", scope).forEach(function (box) {
      if (!once(box, "tabs") || EDITOR) return;
      var tabs = $all('[role="tab"]', box);
      var panels = $all('[role="tabpanel"]', box);
      function select(i, focus) {
        tabs.forEach(function (t, k) {
          var on = k === i;
          t.setAttribute("aria-selected", on ? "true" : "false");
          t.tabIndex = on ? 0 : -1;
          panels[k].hidden = !on;
        });
        if (focus) tabs[i].focus();
        track("np_tab", { np_label: tabs[i].textContent });
      }
      tabs.forEach(function (t, i) {
        t.addEventListener("click", function () { select(i); });
        t.addEventListener("keydown", function (e) {
          if (e.key === "ArrowRight") { e.preventDefault(); select((i + 1) % tabs.length, true); }
          if (e.key === "ArrowLeft") { e.preventDefault(); select((i - 1 + tabs.length) % tabs.length, true); }
          if (e.key === "Home") { e.preventDefault(); select(0, true); }
          if (e.key === "End") { e.preventDefault(); select(tabs.length - 1, true); }
        });
      });
    });
  }

  // ---- hotspots --------------------------------------------------------------------------
  function bindHotspots(scope) {
    $all("[data-np-hotspots]", scope).forEach(function (box) {
      if (!once(box, "hs")) return;
      var pts = $all(".np-hs__pt", box);
      function close(except) {
        pts.forEach(function (p) {
          if (p === except) return;
          p.classList.remove("is-open");
          p.querySelector(".np-hs__dot").setAttribute("aria-expanded", "false");
        });
      }
      pts.forEach(function (p) {
        var dot = p.querySelector(".np-hs__dot");
        dot.addEventListener("click", function (e) {
          e.stopPropagation();
          var open = !p.classList.contains("is-open");
          close(p);
          p.classList.toggle("is-open", open);
          dot.setAttribute("aria-expanded", open ? "true" : "false");
          if (open) track("np_hotspot", { np_label: (p.querySelector("strong") || {}).textContent || "" });
        });
      });
      box.__np_close = close;
    });
    // One page-wide listener (not one per block, nor per editor re-render).
    if (!hotspotDocBound) {
      hotspotDocBound = true;
      var closeAll = function () {
        $all("[data-np-hotspots]", doc).forEach(function (b) { if (b.__np_close) b.__np_close(null); });
      };
      doc.addEventListener("click", closeAll);
      doc.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(); });
    }
  }
  var hotspotDocBound = false;

  // ---- flip cards -----------------------------------------------------------------------
  function bindFlips(scope) {
    $all("[data-np-flip]", scope).forEach(function (btn) {
      if (!once(btn, "flip") || EDITOR) return;
      var front = btn.querySelector(".np-flip__f");
      var back = btn.querySelector(".np-flip__b");
      function faces(on) {
        if (front) front.setAttribute("aria-hidden", on ? "true" : "false");
        if (back) back.setAttribute("aria-hidden", on ? "false" : "true");
      }
      faces(false);
      btn.addEventListener("click", function () {
        var on = btn.getAttribute("aria-pressed") !== "true";
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        faces(on);
        if (on) track("np_flip", {});
      });
    });
  }

  // ---- timeline progress line ------------------------------------------------------
  function bindTimelines(scope) {
    $all("[data-np-timeline]", scope).forEach(function (tl) {
      if (!once(tl, "tl")) return;
      if (reduced || EDITOR) return tl.style.setProperty("--np-tlp", "1");
      onScroll(tl, function (vh) {
        var r = tl.getBoundingClientRect();
        var p = (vh * 0.6 - r.top) / r.height;
        tl.style.setProperty("--np-tlp", Math.min(1, Math.max(0, p)).toFixed(3));
      });
      requestFrame();
    });
  }

  // ---- horizontal scroll ----------------------------------------------------------------
  function bindHScroll(scope) {
    $all("[data-np-hscroll]", scope).forEach(function (sec) {
      if (!once(sec, "hx") || EDITOR) return;
      var trackEl = sec.querySelector(".np-hx__track");
      var pin = sec.querySelector(".np-hx__pin");
      var dist = 0;
      function measure() {
        dist = Math.max(0, trackEl.scrollWidth - pin.clientWidth);
        sec.style.height = pin.clientHeight + dist + window.innerHeight * 0.25 + "px";
      }
      measure();
      listen(sec, window, "resize", measure);
      listen(sec, window, "load", measure);
      onScroll(sec, function (vh) {
        var r = sec.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) return;
        var total = r.height - pin.clientHeight;
        var p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
        if (reduced) p = 0;
        trackEl.style.setProperty("--np-hxx", (-p * dist).toFixed(1) + "px");
        sec.style.setProperty("--np-hxp", p.toFixed(3));
      });
      if (reduced) {
        sec.style.height = "auto";
        trackEl.style.overflowX = "auto";
      }
      requestFrame();
    });
  }

  // ---- 3D tilt on cards -----------------------------------------------------------------
  function bindTilt(scope) {
    if (reduced || !window.matchMedia("(hover: hover)").matches) return;
    $all("[data-np-tilt] .np-card", scope).forEach(function (card) {
      if (!once(card, "tilt")) return;
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = "perspective(900px) rotateY(" + (x * 10).toFixed(2) + "deg) rotateX(" + (-y * 10).toFixed(2) + "deg) translateY(-4px)";
      });
      card.addEventListener("mouseleave", function () { card.style.transform = ""; });
    });
  }

  // ---- slideshow + lightbox -----------------------------------------------------------
  function bindSlideshows(scope) {
    $all("[data-np-slideshow]", scope).forEach(function (box) {
      if (!once(box, "slides")) return;
      var slides = $all("[data-np-slide]", box);
      var count = box.querySelector(".np-gal__count");
      var at = 0;
      function go(i) {
        at = (i + slides.length) % slides.length;
        slides.forEach(function (sl, k) { sl.classList.toggle("is-on", k === at); });
        if (count) count.textContent = at + 1 + " / " + slides.length;
      }
      var prev = box.querySelector("[data-np-prev]");
      var next = box.querySelector("[data-np-next]");
      if (prev) prev.addEventListener("click", function () { go(at - 1); });
      if (next) next.addEventListener("click", function () { go(at + 1); track("np_gallery", { np_action: "next" }); });
      var x0 = null;
      box.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      box.addEventListener("touchend", function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1));
        x0 = null;
      });
    });
  }

  function bindLightbox(scope) {
    $all("[data-np-lightbox]", scope).forEach(function (gal) {
      if (!once(gal, "lb") || EDITOR) return;
      var btns = $all("[data-np-full]", gal);
      btns.forEach(function (b, i) {
        b.addEventListener("click", function () { open(i); });
      });
      function open(i) {
        var at = i;
        var last = doc.activeElement;
        var lb = doc.createElement("div");
        lb.className = "np-lb";
        lb.setAttribute("role", "dialog");
        lb.setAttribute("aria-modal", "true");
        lb.setAttribute("aria-label", "Bilde i fullskjerm");
        lb.innerHTML = '<img alt=""><p class="np-lb__c"></p><button class="np-lb__x" aria-label="Lukk">×</button><button class="np-lb__p" aria-label="Forrige">‹</button><button class="np-lb__n" aria-label="Neste">›</button>';
        var im = lb.querySelector("img");
        var cap = lb.querySelector(".np-lb__c");
        function show() {
          var b = btns[at];
          var inner = b.querySelector("img");
          im.src = b.getAttribute("data-np-full");
          im.alt = (inner && inner.alt) || "";
          var fc = b.parentNode.querySelector("figcaption");
          cap.textContent = fc ? fc.textContent : "";
        }
        // Everything behind the dialog is inert while it is open.
        var behind = Array.prototype.slice.call(doc.body.children);
        function close() {
          doc.removeEventListener("keydown", key);
          lb.remove();
          behind.forEach(function (n) { n.inert = false; });
          doc.documentElement.style.overflow = "";
          if (last && last.focus) last.focus();
        }
        function key(e) {
          if (e.key === "Tab") {
            var f = $all("button", lb);
            var at_ = f.indexOf(doc.activeElement);
            e.preventDefault();
            f[(at_ + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
          }
          if (e.key === "Escape") close();
          if (e.key === "ArrowRight") { at = (at + 1) % btns.length; show(); }
          if (e.key === "ArrowLeft") { at = (at - 1 + btns.length) % btns.length; show(); }
        }
        lb.querySelector(".np-lb__x").onclick = close;
        lb.querySelector(".np-lb__p").onclick = function () { at = (at - 1 + btns.length) % btns.length; show(); };
        lb.querySelector(".np-lb__n").onclick = function () { at = (at + 1) % btns.length; show(); };
        lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
        doc.addEventListener("keydown", key);
        show();
        behind.forEach(function (n) { n.inert = true; });
        doc.body.appendChild(lb);
        doc.documentElement.style.overflow = "hidden";
        requestAnimationFrame(function () { lb.classList.add("is-on"); });
        lb.querySelector(".np-lb__x").focus();
        track("np_lightbox", {});
      }
    });
  }

  // ---- poll + feedback --------------------------------------------------------------------
  var API = (doc.body && doc.body.getAttribute("data-np-api")) || "";

  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (_) {
      return null;
    }
    return null;
  }

  function vote(id, option) {
    if (!API || EDITOR || !window.fetch) return Promise.resolve(null);
    return fetch(API + "/" + encodeURIComponent(id), {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ option: option }),
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function bindPolls(scope) {
    $all("[data-np-poll]", scope).forEach(function (box) {
      if (!once(box, "poll")) return;
      var id = box.getAttribute("data-np-poll");
      var key = "np-poll-" + info.np_project + "-" + id;
      var btns = $all("[data-np-vote]", box);
      var msg = box.querySelector(".np-poll__msg");
      function showCounts(counts, mine) {
        var total = 0;
        btns.forEach(function (b) { total += (counts && counts[b.getAttribute("data-np-vote")]) || 0; });
        btns.forEach(function (b) {
          var o = b.getAttribute("data-np-vote");
          b.disabled = true;
          b.classList.toggle("is-mine", o === mine);
          if (!counts || !total) return;
          var pct = Math.round((((counts[o] || 0) / total) * 100));
          b.querySelector(".np-poll__pct").textContent = pct + " %";
          b.querySelector(".np-poll__bar").style.width = pct + "%";
        });
      }
      var prev = store(key);
      if (prev && !EDITOR) {
        btns.forEach(function (b) { b.disabled = true; b.classList.toggle("is-mine", b.getAttribute("data-np-vote") === prev); });
        if (msg) msg.textContent = box.getAttribute("data-np-thanks") || "";
      }
      btns.forEach(function (b) {
        b.addEventListener("click", function () {
          if (EDITOR || b.disabled) return;
          var o = b.getAttribute("data-np-vote");
          store(key, o);
          btns.forEach(function (x) { x.disabled = true; });
          if (msg) msg.textContent = box.getAttribute("data-np-thanks") || "";
          track("np_poll", { np_option: (b.querySelector(".np-poll__l") || b).textContent });
          vote(id, o).then(function (res) {
            if (box.hasAttribute("data-np-results") && res && res.counts) showCounts(res.counts, o);
            else showCounts(null, o);
          });
        });
      });
    });
  }

  function bindFeedback() {
    $all("[data-np-feedback]", doc).forEach(function (box) {
      if (!once(box, "fb") || EDITOR) return;
      var thanks = box.querySelector(".np-fb__thanks");
      $all("[data-np-fb]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var v = b.getAttribute("data-np-fb");
          box.classList.add("is-done");
          if (thanks) thanks.textContent = "Takk for tilbakemeldingen!";
          track("np_feedback", { np_answer: v });
          vote("feedback", v);
        });
      });
    });
  }

  // ---- countdown ------------------------------------------------------------------------------
  function bindCountdowns(scope) {
    $all("[data-np-countdown]", scope).forEach(function (el) {
      if (!once(el, "cd")) return;
      var at = Number(el.getAttribute("data-np-countdown"));
      if (!at) return;
      var cells = {};
      $all("[data-u]", el).forEach(function (c) { cells[c.getAttribute("data-u")] = c; });
      function pad(n) { return (n < 10 ? "0" : "") + n; }
      function tick() {
        if (!el.isConnected) return; // the section left the page: stop ticking
        var left = Math.max(0, at - Date.now());
        if (!left) {
          el.classList.add("is-done");
          if (!el.querySelector(".np-cd__over")) {
            var p = doc.createElement("p");
            p.className = "np-cd__over";
            p.textContent = el.getAttribute("data-done") || "";
            el.insertBefore(p, el.firstChild);
          }
          return;
        }
        var s = Math.floor(left / 1000);
        cells.d.textContent = pad(Math.floor(s / 86400));
        cells.h.textContent = pad(Math.floor((s % 86400) / 3600));
        cells.m.textContent = pad(Math.floor((s % 3600) / 60));
        cells.s.textContent = pad(s % 60);
        setTimeout(tick, 1000 - (Date.now() % 1000));
      }
      tick();
    });
  }

  // ---- headings that fit ----------------------------------------------------------
  // A display title whose longest word is wider than its column ("STERKERE"
  // in a narrow phone) is made smaller until the word fits, instead of being
  // broken mid-word or cut off. Reads all, then writes all (one layout).
  var FIT_SEL = ".np-h1, .np-h2, .np-statement, .np-card__t, .np-rank__t, .np-flip__f > span, .np-chap__t, .np-quote__text";
  var MIN_FIT = 0.55;

  function fitHeadings(scope) {
    var els = $all(FIT_SEL, scope || doc).filter(function (el) { return !el.isContentEditable; });
    els.forEach(function (el) {
      if (el.hasAttribute("data-np-fit")) {
        el.removeAttribute("data-np-fit");
        el.style.removeProperty("--np-fit");
      }
    });
    var writes = [];
    els.forEach(function (el) {
      var w = el.clientWidth;
      if (!w || el.scrollWidth <= w + 1) return;
      var size = parseFloat(window.getComputedStyle(el).fontSize);
      var k = Math.max(MIN_FIT, (w / el.scrollWidth) * 0.97);
      writes.push([el, Math.floor(size * k * 10) / 10]);
    });
    writes.forEach(function (x) {
      x[0].style.setProperty("--np-fit", x[1] + "px");
      x[0].setAttribute("data-np-fit", "");
    });
  }

  // The framed opening: the picture gives way (down to MIN_FRAME) until the
  // whole title is above the fold, however long the title is.
  var MIN_FRAME = 220;

  function fitFramedHero() {
    var hero = doc.querySelector("#np-main > .np-hero--framed:first-child");
    if (!hero || EDITOR) return;
    var frame = hero.querySelector(".np-hero__frame");
    var title = hero.querySelector(".np-h1");
    if (!frame || !title) return;
    frame.style.removeProperty("height");
    var y = window.scrollY || window.pageYOffset;
    var over = title.getBoundingClientRect().bottom + y - (window.innerHeight - 24);
    if (over > 0) frame.style.height = Math.max(MIN_FRAME, frame.offsetHeight - over) + "px";
  }

  function bindFit() {
    fitHeadings(doc);
    fitFramedHero();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { fitHeadings(doc); fitFramedHero(); });
    var t = null;
    window.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(function () { fitHeadings(doc); fitFramedHero(); }, 150);
    });
  }

  // ---- chapter menu, progress, floating button ------------------------------------------------
  function bindChrome() {
    var nav = doc.querySelector("[data-np-chapnav]");
    if (nav && io) {
      var links = $all("a", nav);
      var map = {};
      links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
      var current = null;
      Object.keys(map).forEach(function (id) {
        var sec = doc.getElementById(id);
        if (!sec) return;
        onVisible(sec, function (el, visible) {
          if (!visible) return;
          if (current) current.classList.remove("is-on");
          current = map[el.id];
          current.classList.add("is-on");
          if (nav.classList.contains("np-chapnav--top") && current.scrollIntoView && current.parentNode.parentNode.scrollWidth > nav.clientWidth) {
            var list = current.parentNode.parentNode;
            list.scrollTo({ left: current.offsetLeft - list.clientWidth / 2 + current.clientWidth / 2, behavior: "smooth" });
          }
        }, { threshold: 0, rootMargin: "-45% 0px -50% 0px" });
      });
      links.forEach(function (a) {
        a.addEventListener("click", function () { track("np_chapter", { np_label: a.textContent }); });
      });
    }
    var bar = doc.querySelector(".np-progress i");
    var css = window.CSS && CSS.supports && CSS.supports("animation-timeline: scroll()");
    if (bar && !css) {
      persistent.push(function (vh) {
        var h = doc.documentElement.scrollHeight - vh;
        bar.style.setProperty("--np-p", h > 0 ? Math.min(1, (window.scrollY || window.pageYOffset) / h).toFixed(4) : "0");
      });
    }
    // The floating button: never before the reader is past the opening (the
    // hero and the section after it) nor before the page's "earliest" share;
    // hidden while anything the reader acts on or reads closely – another
    // button, products, a poll, a quote (sections marked data-np-busy) – is
    // where the button sits, and from the last call to action to the end.
    var sticky = doc.querySelector("[data-np-sticky]");
    if (sticky && !EDITOR) {
      var after = Number(sticky.getAttribute("data-np-sticky")) / 100;
      var ends = $all(".np-footer, .np-fb, .np-credit-line", doc);
      var sections = $all("#np-main > .np-sec", doc);
      var opening = sections[Math.min(1, sections.length - 1)] || null;
      var busy = $all("[data-np-busy]", doc);
      persistent.push(function (vh) {
        var y = window.scrollY || window.pageYOffset;
        var h = doc.documentElement.scrollHeight - vh;
        var p = h > 0 ? y / h : 0;
        var past = !opening || opening.getBoundingClientRect().bottom < vh * 0.35;
        var zone = vh - (sticky.offsetHeight || 60) - 48;
        var hit = function (el) {
          var r = el.getBoundingClientRect();
          return r.top < vh && r.bottom > zone;
        };
        var blocked = ends.some(function (el) { return el.getBoundingClientRect().top < vh; }) || busy.some(hit);
        sticky.classList.toggle("is-on", p >= after && past && !blocked);
      });
    }
    // Side dots step aside while something wide (cards scrolling sideways, a
    // carousel, a full-bleed picture with points) passes behind them.
    var side = doc.querySelector(".np-chapnav--side");
    if (side) {
      var wide = $all("[data-np-wide]", doc);
      persistent.push(function () {
        var r = side.getBoundingClientRect();
        var under = wide.some(function (el) {
          var b = el.getBoundingClientRect();
          return b.top < r.bottom && b.bottom > r.top;
        });
        side.classList.toggle("is-away", under);
      });
    }
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
    bindMotion(scope);
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
    bindHeroZoom(scope);
    bindStatements(scope);
    bindMarquees(scope);
    bindTabs(scope);
    bindHotspots(scope);
    bindFlips(scope);
    bindTimelines(scope);
    bindHScroll(scope);
    bindTilt(scope);
    bindSlideshows(scope);
    bindLightbox(scope);
    bindPolls(scope);
    bindCountdowns(scope);
    if (scope !== doc) fitHeadings(scope);
    requestFrame();
  }

  window.NPRuntime = {
    bind: bind,
    track: track,
    // The editor re-renders sections; dropped nodes take their own listeners
    // along, dispose() drops what was registered outside them.
    dispose: dispose,
    replay: replay,
    resetScrollers: function () {
      scrollers = [];
    },
    // How much is bound right now (the editor's leak test reads it).
    stats: function () {
      return { scrollers: scrollers.length, cleanups: cleanups.length };
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
    API = body.getAttribute("data-np-api") || "";
    bind(doc);
    bindFit();
    bindChrome();
    bindFeedback();
    bindTracking();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start);
  else start();
})();
