/* =========================================================================
   puff.js — the Artikkelpuff 980×600: three advertiser stories in one ad
   (a large lead on the left, two smaller ones stacked on the right), with
   «Annonsørinnhold» and the advertiser's logo across the top.

   The geometry is measured from the approved Canva original ("ABCN Artikkel
   980x600 – Native Premium", read from the design's own DOM in design units):
   Noto Sans Bold 20.85 px for the label, Noto Serif Bold 33.07/36 px for the
   lead headline and 19.27/20.8 px for the two side headlines, #333 on
   #f5f5f5. Margins are evened out to 32 px on both sides (Canva had 31.6 and
   35.4), which widens the right column from 273 to 276 px.

   One renderer for all three outputs, so they can never disagree:
     • "preview" — the builder: video plays, images are the uploads
     • "still"   — the backup image (Puppeteer): video shows its poster frame
     • "package" — the HTML5 creative: images are pre-cropped files in the
                   ZIP, video is the uploaded file, every story is its own exit

   Loaded by the browser (global PuffAd), by the Puppeteer template and by the
   server (require) for the geometry and the document rules.
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PuffAd = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var WIDTH = 980;
  var HEIGHT = 600;
  var LABEL = "puff-980x600";
  var MIN_TEXT_SCALE = 0.7;
  var MAX_ZOOM = 100; // percent added on top of "cover"
  // A new photo starts a little zoomed in, so it can always be slid a bit
  // left, right, up and down – like the photo in the banner builder.
  var DEFAULT_CROP = { zoom: 12, x: 50, y: 50 };
  var DEFAULT_LABEL = "Annonsørinnhold";
  var LOGO_HEIGHT = { min: 16, max: 56, def: 35 };
  var MAX_HEADLINE = 140;

  // Story slots, in reading order. `box` is the photo/video area, `head` the
  // headline under it (top edge of the text box, size and line height in px).
  var SLOTS = [
    {
      key: "main",
      name: "Hovedsak",
      box: { x: 32, y: 68, w: 620, h: 413 },
      head: { x: 32, y: 490, w: 620, size: 33.07, lh: 36, lines: 2 },
    },
    {
      key: "s2",
      name: "Sak 2",
      box: { x: 672, y: 68, w: 276, h: 183 },
      head: { x: 672, y: 257, w: 276, size: 19.27, lh: 20.8, lines: 2 },
    },
    {
      key: "s3",
      name: "Sak 3",
      box: { x: 672, y: 318, w: 276, h: 183 },
      head: { x: 672, y: 508.5, w: 276, size: 19.27, lh: 20.8, lines: 2 },
    },
  ];

  // The top row: the label on the left, the logo right-aligned to the content
  // edge and centred on the label's line.
  var HEADER = {
    label: { x: 32, y: 24, size: 20.85, lh: 29 },
    logo: { right: 32, centerY: 38.5, maxW: 260 },
  };

  // ---- document --------------------------------------------------------------
  function emptySlot() {
    return { kind: "empty", src: "", poster: "", w: 0, h: 0, crop: { zoom: 0, x: 50, y: 50 }, headline: "", link: "" };
  }

  function emptyDoc() {
    return {
      label: DEFAULT_LABEL,
      logo: { src: "", w: 0, h: 0, height: LOGO_HEIGHT.def },
      slots: SLOTS.map(emptySlot),
    };
  }

  function clamp(n, min, max, fallback) {
    var v = Number(n);
    if (!isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
  }

  function text(value, max) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim()
      .slice(0, max);
  }

  /** A crop: zoom 0–100 % on top of "cover", focus point x/y in 0–100 %. */
  function normalizeCrop(c) {
    var crop = c || {};
    return {
      zoom: clamp(crop.zoom, 0, MAX_ZOOM, 0),
      x: clamp(crop.x, 0, 100, 50),
      y: clamp(crop.y, 0, 100, 50),
    };
  }

  /**
   * The document with every field in range. Sources are kept as given — the
   * server checks them against its own store; the browser only ever puts its
   * own upload URLs there.
   */
  function normalizeDoc(input) {
    var d = input || {};
    var logo = d.logo || {};
    var slots = Array.isArray(d.slots) ? d.slots : [];
    return {
      label: text(d.label == null ? DEFAULT_LABEL : d.label, 40),
      logo: {
        src: typeof logo.src === "string" ? logo.src : "",
        w: clamp(logo.w, 0, 20000, 0),
        h: clamp(logo.h, 0, 20000, 0),
        height: clamp(logo.height, LOGO_HEIGHT.min, LOGO_HEIGHT.max, LOGO_HEIGHT.def),
      },
      slots: SLOTS.map(function (slot, i) {
        var s = slots[i] || {};
        var kind = s.kind === "image" || s.kind === "video" ? s.kind : "empty";
        return {
          kind: kind,
          src: kind === "empty" || typeof s.src !== "string" ? "" : s.src,
          poster: kind === "video" && typeof s.poster === "string" ? s.poster : "",
          w: clamp(s.w, 0, 20000, 0),
          h: clamp(s.h, 0, 20000, 0),
          crop: normalizeCrop(s.crop),
          headline: text(s.headline, MAX_HEADLINE),
          link: text(s.link, 2000).replace(/\s+/g, ""),
          name: text(s.name, 120),
          bytes: clamp(s.bytes, 0, 1e10, 0),
          duration: clamp(s.duration, 0, 36000, 0),
          posterTime: clamp(s.posterTime, 0, 36000, 0),
        };
      }),
    };
  }

  // ---- geometry ----------------------------------------------------------------
  /**
   * Where the media sits inside its box: "cover", magnified by the zoom, and
   * slid so the focus point (x/y in %) lines up — 0 % shows the left/top
   * edge, 100 % the right/bottom one, exactly like CSS object-position.
   *
   * @returns {{left:number, top:number, width:number, height:number}} px,
   *          relative to the box; the media is always at least as large as it
   */
  function placement(mediaW, mediaH, boxW, boxH, crop) {
    var c = normalizeCrop(crop);
    if (!(mediaW > 0 && mediaH > 0)) return { left: 0, top: 0, width: boxW, height: boxH };
    var cover = Math.max(boxW / mediaW, boxH / mediaH);
    var scale = cover * (1 + c.zoom / 100);
    var width = mediaW * scale;
    var height = mediaH * scale;
    return {
      left: (boxW - width) * (c.x / 100),
      top: (boxH - height) * (c.y / 100),
      width: width,
      height: height,
    };
  }

  /**
   * The part of the source (in source pixels) that the box shows — what the
   * server cuts out for the HTML5 package, so the ZIP carries no pixels the
   * ad never displays.
   */
  function visibleRect(mediaW, mediaH, boxW, boxH, crop) {
    var p = placement(mediaW, mediaH, boxW, boxH, crop);
    var k = mediaW / p.width;
    var left = Math.max(0, Math.round(-p.left * k));
    var top = Math.max(0, Math.round(-p.top * k));
    var width = Math.min(mediaW - left, Math.round(boxW * k));
    var height = Math.min(mediaH - top, Math.round(boxH * k));
    return { left: left, top: top, width: Math.max(1, width), height: Math.max(1, height) };
  }

  /** How far (px in the box) the media can slide each way at this crop. */
  function spare(mediaW, mediaH, boxW, boxH, crop) {
    var p = placement(mediaW, mediaH, boxW, boxH, crop);
    return { x: Math.max(0, p.width - boxW), y: Math.max(0, p.height - boxH) };
  }

  /** The crop focus that puts a dragged position back in range. */
  function panBy(mediaW, mediaH, boxW, boxH, crop, dx, dy) {
    var c = normalizeCrop(crop);
    var p = placement(mediaW, mediaH, boxW, boxH, c);
    var spareX = p.width - boxW;
    var spareY = p.height - boxH;
    return {
      zoom: c.zoom,
      x: spareX > 0.5 ? clamp(c.x - (dx / spareX) * 100, 0, 100, 50) : 50,
      y: spareY > 0.5 ? clamp(c.y - (dy / spareY) * 100, 0, 100, 50) : 50,
    };
  }

  /**
   * Which story each of `count` new files goes to.
   *
   * Dropped on a story (`target`): the first file replaces it, the rest go
   * on to the empty stories after it. Dropped on the shared drop zone: three
   * or more files fill the stories in order (lead first); fewer fill the
   * empty stories first and then replace from the top.
   *
   * @param {number} count
   * @param {boolean[]} filled     which stories already have media
   * @param {number|null} target
   * @returns {number[]} story index per file; files past the last story are left out
   */
  function assignSlots(count, filled, target) {
    var n = SLOTS.length;
    var taken = SLOTS.map(function (_, i) {
      return !!filled[i];
    });
    var out = [];
    if (target != null && target >= 0 && target < n) {
      out.push(target);
      taken[target] = true;
      for (var j = 1; j < n && out.length < count; j++) {
        var k = (target + j) % n;
        if (!taken[k]) {
          out.push(k);
          taken[k] = true;
        }
      }
      return out;
    }
    if (count >= n) return SLOTS.map(function (_, i) {
      return i;
    });
    var order = [];
    for (var a = 0; a < n; a++) if (!taken[a]) order.push(a);
    for (var b = 0; b < n; b++) if (taken[b]) order.push(b);
    return order.slice(0, count);
  }

  // ---- DOM -----------------------------------------------------------------------
  function el(tag, cls, parent) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (parent) parent.appendChild(node);
    return node;
  }

  function px(n) {
    return Math.round(n * 1000) / 1000 + "px";
  }

  function setBox(node, box) {
    node.style.left = px(box.x);
    node.style.top = px(box.y);
    node.style.width = px(box.w);
    if (box.h != null) node.style.height = px(box.h);
  }

  /** The headline with its line breaks kept and nothing else interpreted. */
  function fillText(node, value) {
    String(value || "")
      .split("\n")
      .forEach(function (line, i) {
        if (i) node.appendChild(document.createElement("br"));
        node.appendChild(document.createTextNode(line));
      });
  }

  function mediaNode(slot, spec, mode, resolve, index) {
    var box = spec.box;
    if (slot.kind === "empty") {
      var ph = el("div", "pf__empty");
      ph.textContent = box.w + "×" + box.h;
      return ph;
    }
    // In the package an image is already cut to exactly what the box shows.
    if (mode === "package" && slot.kind === "image") {
      var baked = el("img", "pf__img pf__img--baked");
      baked.alt = "";
      baked.setAttribute("src", resolve("image", slot, index));
      return baked;
    }
    var place = placement(slot.w, slot.h, box.w, box.h, slot.crop);
    var node;
    if (slot.kind === "video" && mode !== "still") {
      node = el("video", "pf__img");
      node.muted = true;
      node.defaultMuted = true;
      node.loop = true;
      node.autoplay = true;
      node.playsInline = true;
      // Attributes as well as properties: the package is serialised markup.
      ["muted", "loop", "autoplay", "playsinline"].forEach(function (a) {
        node.setAttribute(a, "");
      });
      node.setAttribute("preload", "auto");
      var poster = resolve("poster", slot, index);
      if (poster) node.setAttribute("poster", poster);
      node.setAttribute("src", resolve("video", slot, index));
    } else {
      node = el("img", "pf__img");
      node.alt = "";
      node.draggable = false;
      var src = slot.kind === "video" ? resolve("poster", slot, index) : resolve("image", slot, index);
      if (src) node.setAttribute("src", src);
    }
    node.style.left = px(place.left);
    node.style.top = px(place.top);
    node.style.width = px(place.width);
    node.style.height = px(place.height);
    return node;
  }

  function defaultResolve(kind, slot) {
    return kind === "poster" ? slot.poster : slot.src;
  }

  /**
   * Draw the ad into `root` (emptied first).
   *
   * @param {HTMLElement} root
   * @param {Object} doc       normalizeDoc() shape
   * @param {Object} [opts]
   * @param {"preview"|"still"|"package"} [opts.mode]
   * @param {Function} [opts.resolve]  (kind "image"|"video"|"poster"|"logo", slot, index) → URL
   * @param {boolean} [opts.exits]     wrap each story in an <a> (the package)
   */
  function render(root, doc, opts) {
    var o = opts || {};
    var mode = o.mode || "preview";
    var resolve = o.resolve || defaultResolve;
    var d = normalizeDoc(doc);
    while (root.firstChild) root.removeChild(root.firstChild);
    root.className = "pf";
    root.style.width = WIDTH + "px";
    root.style.height = HEIGHT + "px";

    // Header: the disclosure is never optional, so an emptied field falls
    // back to the standard wording rather than disappearing.
    var head = el(o.exits ? "a" : "div", "pf__head", root);
    if (o.exits) head.setAttribute("data-exit", "1");
    var label = el("span", "pf__label", head);
    label.textContent = d.label || DEFAULT_LABEL;
    label.style.left = px(HEADER.label.x);
    label.style.top = px(HEADER.label.y);
    label.style.fontSize = px(HEADER.label.size);
    label.style.lineHeight = px(HEADER.label.lh);
    var logoSrc = d.logo.src ? (o.resolve ? resolve("logo", d.logo, -1) : d.logo.src) : "";
    if (logoSrc) {
      var logo = el("img", "pf__logo", head);
      logo.alt = "";
      logo.setAttribute("src", logoSrc);
      var lh = d.logo.height;
      var lw = d.logo.w && d.logo.h ? Math.min(HEADER.logo.maxW, (d.logo.w / d.logo.h) * lh) : 0;
      logo.style.height = px(lh);
      if (lw) logo.style.width = px(lw);
      logo.style.right = px(HEADER.logo.right);
      logo.style.top = px(HEADER.logo.centerY - lh / 2);
    }

    d.slots.forEach(function (slot, i) {
      var spec = SLOTS[i];
      var item = el(o.exits ? "a" : "div", "pf__item pf__item--" + spec.key, root);
      item.setAttribute("data-slot", String(i));
      if (o.exits) item.setAttribute("data-exit", String(i + 1));
      var media = el("div", "pf__media", item);
      setBox(media, spec.box);
      media.appendChild(mediaNode(slot, spec, mode, resolve, i));
      var h = el("p", "pf__headline", item);
      setBox(h, { x: spec.head.x, y: spec.head.y, w: spec.head.w });
      h.style.fontSize = px(spec.head.size);
      h.style.lineHeight = px(spec.head.lh);
      h.setAttribute("data-lines", String(spec.head.lines));
      fillText(h, slot.headline);
    });
    return d;
  }

  /**
   * Shrink each headline until it fits its lines (down to 70 %). Needs the
   * fonts loaded to measure right. Returns one entry per story: the scale
   * used and whether the text fits at all.
   *
   * Measured as LAYOUT height with the line clamp lifted: scrollHeight would
   * count the glyphs' ink, and Noto Serif's ascenders and descenders reach a
   * few px past a 36 px line box, so even one line would read as overflow.
   */
  function fit(root) {
    var out = [];
    var nodes = root.querySelectorAll(".pf__headline");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var spec = SLOTS[i].head;
      var scale = 1;
      node.style.display = "block";
      node.style.webkitLineClamp = "none";
      var apply = function () {
        node.style.fontSize = px(spec.size * scale);
        node.style.lineHeight = px(spec.lh * scale);
      };
      var fits = function () {
        return node.offsetHeight <= spec.lh * scale * spec.lines + 2; // offsetHeight: unaffected by the stage's CSS scale
      };
      apply();
      while (!fits() && scale > MIN_TEXT_SCALE + 0.001) {
        scale = Math.max(MIN_TEXT_SCALE, Math.round((scale - 0.02) * 100) / 100);
        apply();
      }
      var ok = fits();
      node.style.display = "";
      node.style.webkitLineClamp = "";
      out.push({ scale: scale, fits: ok, empty: !node.textContent.trim() });
    }
    return out;
  }

  return {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    LABEL: LABEL,
    SLOTS: SLOTS,
    HEADER: HEADER,
    DEFAULT_LABEL: DEFAULT_LABEL,
    LOGO_HEIGHT: LOGO_HEIGHT,
    MAX_HEADLINE: MAX_HEADLINE,
    MAX_ZOOM: MAX_ZOOM,
    DEFAULT_CROP: DEFAULT_CROP,
    emptyDoc: emptyDoc,
    emptySlot: emptySlot,
    normalizeDoc: normalizeDoc,
    normalizeCrop: normalizeCrop,
    placement: placement,
    visibleRect: visibleRect,
    panBy: panBy,
    spare: spare,
    assignSlots: assignSlots,
    render: render,
    fit: fit,
  };
});
