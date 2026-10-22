/* =========================================================================
   puff/stage.js — the live Artikkelpuff on the right: the real 980×600 ad,
   scaled to the panel, with a hit layer on top of the three photo areas.

   On a story's area you can drag to move the crop, double-click to reset it,
   click an empty one to pick a file, and drop files straight onto it. The ad
   itself never takes pointer events, so what you see is exactly the creative.

   Re-rendering the ad would restart every video, so a change that keeps the
   same files only patches the DOM: crop geometry, headlines, label and logo.
   ========================================================================= */
(function () {
  "use strict";

  var PUFF = (window.PUFF = window.PUFF || {});
  var Ad = window.PuffAd;
  var h = window.WPE.util.h;

  function structureKey(doc) {
    return JSON.stringify([
      doc.logo.src,
      doc.slots.map(function (s) {
        return [s.kind, s.src, s.poster];
      }),
    ]);
  }

  function px(n) {
    return Math.round(n * 1000) / 1000 + "px";
  }

  /**
   * @param {HTMLElement} host
   * @param {Object} cb
   * @param {Function} cb.onPan        (index, crop)
   * @param {Function} cb.onReset      (index)
   * @param {Function} cb.onFiles      (files, index|null)
   * @param {Function} cb.onPick       (index)
   * @param {Function} cb.onFit        (results)
 * @param {Function} cb.onPickLogo   ()
 * @param {Function} cb.onLogoFile   (file)
   */
  function create(host, cb) {
    var frame = h("div.pu-stage__frame");
    var adRoot = h("div.pu-stage__ad");
    var hits = h("div.pu-stage__hits");
    frame.appendChild(adRoot);
    frame.appendChild(hits);
    host.appendChild(frame);

    var doc = null;
    var key = "";
    var scale = 1;
    var drag = null;
    var hitNodes = [];
    var NUDGE = 2; // px in the ad per arrow key press
    var NUDGE_BIG = 10;
    var ZOOM_STEP = 5;

    // ---- hit layer -----------------------------------------------------------
    Ad.SLOTS.forEach(function (spec, i) {
      var progress = h("span.pu-hit__bar");
      var node = h(
        "div.pu-hit",
        { dataset: { slot: String(i) }, tabindex: "0", title: spec.name + " · " + spec.box.w + "×" + spec.box.h },
        h("span.pu-hit__tag", null, i + 1 + " · " + spec.name + " · " + spec.box.w + "×" + spec.box.h),
        h("span.pu-hit__hint", null, "Dra for å flytte · knip for å zoome · dobbeltklikk nullstiller"),
        h("span.pu-hit__empty", null, "Klikk eller slipp bilde/video her"),
        h("span.pu-hit__busy", null, h("span.pu-hit__label", null, "Laster opp …"), h("span.pu-hit__track", null, progress))
      );
      node.style.left = px(spec.box.x);
      node.style.top = px(spec.box.y);
      node.style.width = px(spec.box.w);
      node.style.height = px(spec.box.h);
      node._bar = progress;
      bindHit(node, i);
      hits.appendChild(node);
      hitNodes.push(node);
    });

    function hasMedia(i) {
      return doc && doc.slots[i].kind !== "empty";
    }

    function bindHit(node, i) {
      node.addEventListener("pointerdown", function (e) {
        if (e.button !== 0 || !hasMedia(i)) return;
        e.preventDefault();
        node.setPointerCapture(e.pointerId);
        drag = { i: i, x: e.clientX, y: e.clientY, crop: doc.slots[i].crop };
        node.classList.add("is-dragging");
      });
      node.addEventListener("pointermove", function (e) {
        if (!drag || drag.i !== i) return;
        var slot = doc.slots[i];
        var box = Ad.SLOTS[i].box;
        var dx = (e.clientX - drag.x) / scale;
        var dy = (e.clientY - drag.y) / scale;
        drag.x = e.clientX;
        drag.y = e.clientY;
        drag.crop = Ad.panBy(slot.w, slot.h, box.w, box.h, drag.crop, dx, dy);
        cb.onPan(i, drag.crop);
      });
      var end = function () {
        if (!drag || drag.i !== i) return;
        drag = null;
        node.classList.remove("is-dragging");
      };
      node.addEventListener("pointerup", end);
      node.addEventListener("pointercancel", end);
      node.addEventListener("dblclick", function () {
        if (hasMedia(i)) cb.onReset(i);
      });
      // Arrow keys nudge the photo (Shift: further); + and − zoom.
      node.addEventListener("keydown", function (e) {
        if (!hasMedia(i)) return;
        var slot = doc.slots[i];
        var step = e.shiftKey ? NUDGE_BIG : NUDGE;
        // Same direction as dragging: the photo moves the way the arrow points.
        var move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (move) {
          e.preventDefault();
          var box = Ad.SLOTS[i].box;
          cb.onPan(i, Ad.panBy(slot.w, slot.h, box.w, box.h, slot.crop, move[0], move[1]));
          return;
        }
        var dz = e.key === "+" || e.key === "=" ? ZOOM_STEP : e.key === "-" ? -ZOOM_STEP : 0;
        if (dz) {
          e.preventDefault();
          cb.onZoom(i, slot.crop.zoom + dz);
        }
      });
      // Pinch on a trackpad (and Ctrl + wheel) zooms the photo.
      node.addEventListener(
        "wheel",
        function (e) {
          if (!e.ctrlKey || !hasMedia(i)) return;
          e.preventDefault();
          cb.onZoom(i, doc.slots[i].crop.zoom - e.deltaY * 0.5);
        },
        { passive: false }
      );
      node.addEventListener("click", function () {
        if (!hasMedia(i)) cb.onPick(i);
      });
      node.addEventListener("dragenter", function (e) {
        e.preventDefault();
        node.classList.add("is-drop");
      });
      node.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        node.classList.add("is-drop");
      });
      node.addEventListener("dragleave", function () {
        node.classList.remove("is-drop");
      });
      node.addEventListener("drop", function (e) {
        e.preventDefault();
        e.stopPropagation();
        node.classList.remove("is-drop");
        if (e.dataTransfer.files && e.dataTransfer.files.length) cb.onFiles(e.dataTransfer.files, i);
      });
    }

    // The logo spot: click to upload, or drop a logo straight onto it.
    var logoHit = h("div.pu-hit.pu-hit--logo", { title: "Logo – klikk eller slipp fil" }, h("span.pu-hit__empty", null, "+ Logo"));
    var LOGO_SPOT = { w: 220, h: 35 };
    logoHit.style.right = px(Ad.HEADER.logo.right);
    logoHit.style.top = px(Ad.HEADER.logo.centerY - LOGO_SPOT.h / 2);
    logoHit.style.width = px(LOGO_SPOT.w);
    logoHit.style.height = px(LOGO_SPOT.h);
    logoHit.addEventListener("click", function () {
      cb.onPickLogo();
    });
    logoHit.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.stopPropagation();
      logoHit.classList.add("is-drop");
    });
    logoHit.addEventListener("dragleave", function () {
      logoHit.classList.remove("is-drop");
    });
    logoHit.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      logoHit.classList.remove("is-drop");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) cb.onLogoFile(e.dataTransfer.files[0]);
    });
    hits.appendChild(logoHit);

    // Files dropped anywhere else on the stage are spread over the stories.
    host.addEventListener("dragover", function (e) {
      e.preventDefault();
      host.classList.add("is-drop");
    });
    host.addEventListener("dragleave", function (e) {
      if (!host.contains(e.relatedTarget)) host.classList.remove("is-drop");
    });
    host.addEventListener("drop", function (e) {
      e.preventDefault();
      host.classList.remove("is-drop");
      if (e.dataTransfer.files && e.dataTransfer.files.length) cb.onFiles(e.dataTransfer.files, null);
    });

    // ---- scale ------------------------------------------------------------------
    function resize() {
      var style = getComputedStyle(host);
      var room = host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      scale = Math.max(0.2, Math.min(1, room / Ad.WIDTH));
      frame.style.width = px(Ad.WIDTH * scale);
      frame.style.height = px(Ad.HEIGHT * scale);
      adRoot.style.transform = "scale(" + scale + ")";
      hits.style.transform = "scale(" + scale + ")";
      frame.style.setProperty("--pu-scale", String(scale));
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
    window.addEventListener("resize", resize);

    // ---- drawing ------------------------------------------------------------------
    function patch() {
      var label = adRoot.querySelector(".pf__label");
      if (label) label.textContent = doc.label || Ad.DEFAULT_LABEL;
      var logo = adRoot.querySelector(".pf__logo");
      if (logo) {
        var lh = doc.logo.height;
        logo.style.height = px(lh);
        if (doc.logo.w && doc.logo.h) logo.style.width = px(Math.min(Ad.HEADER.logo.maxW, (doc.logo.w / doc.logo.h) * lh));
        logo.style.top = px(Ad.HEADER.logo.centerY - lh / 2);
      }
      var items = adRoot.querySelectorAll(".pf__item");
      doc.slots.forEach(function (slot, i) {
        var item = items[i];
        if (!item) return;
        var media = item.querySelector(".pf__img");
        if (media) {
          var box = Ad.SLOTS[i].box;
          var p = Ad.placement(slot.w, slot.h, box.w, box.h, slot.crop);
          media.style.left = px(p.left);
          media.style.top = px(p.top);
          media.style.width = px(p.width);
          media.style.height = px(p.height);
        }
        var head = item.querySelector(".pf__headline");
        var text = slot.headline || "";
        if (head && head._text !== text) {
          while (head.firstChild) head.removeChild(head.firstChild);
          text.split("\n").forEach(function (line, n) {
            if (n) head.appendChild(document.createElement("br"));
            head.appendChild(document.createTextNode(line));
          });
          head._text = text;
        }
      });
    }

    var fitTimer = 0;
    function refit() {
      clearTimeout(fitTimer);
      fitTimer = setTimeout(function () {
        var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
        ready.then(function () {
          cb.onFit(Ad.fit(adRoot));
        });
      }, 30);
    }

    function update(next) {
      doc = next;
      var k = structureKey(doc);
      if (k !== key) {
        key = k;
        Ad.render(adRoot, doc, { mode: "preview" });
        adRoot.classList.add("pu-stage__ad");
        adRoot.querySelectorAll(".pf__headline").forEach(function (node, i) {
          node._text = doc.slots[i].headline || "";
        });
        adRoot.querySelectorAll("video").forEach(function (v) {
          var p = v.play && v.play();
          if (p && p.catch) p.catch(function () {});
        });
      } else {
        patch();
      }
      hitNodes.forEach(function (node, i) {
        node.classList.toggle("is-empty", !hasMedia(i));
      });
      logoHit.classList.toggle("is-empty", !doc.logo.src);
      resize();
      refit();
    }

    function setBusy(i, progress) {
      var node = hitNodes[i];
      if (!node) return;
      var busy = progress != null;
      node.classList.toggle("is-busy", busy);
      if (busy) node._bar.style.width = Math.round(Math.max(0.04, progress) * 100) + "%";
    }

    return { update: update, setBusy: setBusy, resize: resize };
  }

  PUFF.stage = { create: create };
})();
