/* =========================================================================
   native/doc.js — the Native Premium project model.

   A project is one advertorial: theme, meta, tracking and one or more pages
   (audience variants such as "menn" / "kvinner"), each a list of sections
   described by schema.js. The disclosure header ("Annonsørinnhold fra …")
   and the disclosure footer are NOT sections: the renderer always adds them,
   so neither a user nor the AI can remove or reword them.

   normalizeProject() is an allow-list: it rebuilds a project from untrusted
   JSON (the browser, an imported file, a model's answer) field by field,
   using the schema. Unknown keys are dropped, numbers clamped, colours and
   URLs checked, formatted text reduced to a small safe HTML subset, and
   asset ids accepted only when the project actually has that asset.

   Everything returns new objects; nothing passed in is modified.

   Shared verbatim by the browser and the server (UMD).
   ========================================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./schema.js"));
  else root.NativeDoc = factory(root.NativeSchema);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  var VERSION = 1;
  var MAX_PAGES = 6;
  var MAX_SECTIONS = 80;
  var MAX_ASSETS = 600;

  // sha256 + extension. SVG is never accepted: it can carry script and the
  // files are served from the tool's own origin.
  var ASSET_RE = /^[a-f0-9]{64}\.(webp|jpg|png|gif|avif|mp4|webm|mov|woff2|woff|ttf|otf)$/;
  var IMAGE_EXT = /\.(webp|jpg|png|gif|avif)$/;
  var VIDEO_EXT = /\.(mp4|webm|mov)$/;
  var FONT_EXT = /\.(woff2|woff|ttf|otf)$/;
  var COLOR_RE = /^#[0-9a-f]{6}$/i;
  var ID_RE = /^[A-Za-z0-9_-]{4,40}$/;

  var STATUSES = ["draft", "review", "approved", "published"];
  var STATUS_LABELS = { draft: "Utkast", review: "Til gjennomgang", approved: "Godkjent", published: "Publisert" };

  // ---- ids -------------------------------------------------------------------
  var ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  function randomBytes(n) {
    var c = typeof globalThis !== "undefined" && globalThis.crypto;
    var out = new Uint8Array(n);
    if (c && c.getRandomValues) return c.getRandomValues(out);
    // Node < 19 without a global webcrypto.
    return new Uint8Array(require("crypto").randomBytes(n));
  }

  /** A short random id: "s_x8Kd02mQ" (prefix + 10 base62 chars ≈ 59 bits). */
  function newId(prefix, length) {
    var len = length || 10;
    var bytes = randomBytes(len);
    var s = "";
    for (var i = 0; i < len; i++) s += ALPHABET[bytes[i] % 62];
    return (prefix ? prefix + "_" : "") + s;
  }

  // ---- text helpers ----------------------------------------------------------
  function str(v) {
    if (v === null || v === undefined) return "";
    return String(v);
  }

  // Control characters (except tab/newline) never belong in copy, and the
  // Unicode line/paragraph separators break inline <script> JSON.
  function cleanText(v, hardMax, multiline) {
    var s = str(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g, "");
    s = s.replace(/\r\n?/g, "\n");
    if (!multiline) s = s.replace(/\s*\n\s*/g, " ");
    return s.length > hardMax ? s.slice(0, hardMax) : s;
  }

  function escapeHtml(s) {
    return str(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function decodeEntities(s) {
    return str(s)
      .replace(/&nbsp;/g, " ")
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) {
        var n = parseInt(h, 16);
        return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
      })
      .replace(/&#(\d+);/g, function (_, d) {
        var n = Number(d);
        return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
      })
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  // ---- URLs ------------------------------------------------------------------
  /** http(s), mailto:, tel: or an in-page #anchor; anything else becomes "". */
  function safeUrl(v) {
    var s = str(v).trim();
    if (!s) return "";
    if (/^#[A-Za-z][\w-]{0,40}$/.test(s)) return s;
    if (/^mailto:[^\s<>"]+$/i.test(s)) return s.slice(0, 300);
    if (/^tel:\+?[\d\s()-]{3,30}$/i.test(s)) return s.replace(/\s+/g, "");
    if (/^www\./i.test(s)) s = "https://" + s;
    if (!/^https?:\/\//i.test(s)) return "";
    if (/[\s<>"]/.test(s) || s.length > 2000) return "";
    return s;
  }

  // ---- formatted text: a tiny allow-list HTML sanitiser ------------------
  // Works on strings, so the same code runs in Node and the browser. Only the
  // tags below survive; every other tag is dropped and its text kept. The one
  // attribute ever kept is href on <a>, and only a safe URL.
  var RICH_TAGS = {
    p: "p", h2: "h2", h3: "h3", h4: "h3", strong: "strong", b: "strong", em: "em", i: "em",
    u: "u", a: "a", ul: "ul", ol: "ol", li: "li", blockquote: "blockquote", br: "br",
    sup: "sup", sub: "sub", div: "p", h1: "h2", mark: "mark", s: "s", del: "s",
  };
  var DROP_CONTENT = /^(script|style|iframe|object|embed|template|noscript|svg|math|head|title|textarea|select)$/i;

  function sanitizeRich(input, hardMax) {
    var html = str(input);
    if (hardMax && html.length > hardMax * 2) html = html.slice(0, hardMax * 2);
    var out = [];
    var stack = [];
    var skip = null; // { tag, depth } while inside <script>, <style> …
    var re = /<!--[\s\S]*?-->|<(\/?)([A-Za-z][A-Za-z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|(<)/g;
    var m;

    function top() {
      return stack[stack.length - 1];
    }
    function push(tag, raw) {
      out.push(raw || "<" + tag + ">");
      stack.push(tag);
    }
    function pop() {
      out.push("</" + stack.pop() + ">");
    }
    function closeTag(tag) {
      var idx = stack.lastIndexOf(tag);
      if (idx === -1) return;
      while (stack.length > idx) pop();
    }
    // Pop until the top may hold a new block (top level or a <blockquote>).
    function toBlockLevel() {
      while (stack.length && top() !== "blockquote") pop();
    }
    // Make sure there is a container that can hold text / inline tags.
    function ensureText() {
      var t = top();
      if (t === "ul" || t === "ol") return push("li");
      if (!t || t === "blockquote") return push("p");
    }

    while ((m = re.exec(html))) {
      if (m[0].lastIndexOf("<!--", 0) === 0) continue;
      var name = m[2] ? m[2].toLowerCase() : "";
      var closing = m[1] === "/";
      if (skip) {
        if (name === skip.tag) skip.depth += closing ? -1 : 1;
        if (skip.depth <= 0) skip = null;
        continue;
      }
      if (m[4] !== undefined || m[5]) {
        var t = decodeEntities(m[4] !== undefined ? m[4] : "<");
        if (!t.trim() && (!stack.length || /^(ul|ol|blockquote)$/.test(top()))) continue;
        ensureText();
        out.push(escapeHtml(t).replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
        continue;
      }
      if (DROP_CONTENT.test(name)) {
        if (!closing && !/\/\s*$/.test(m[3])) skip = { tag: name, depth: 1 };
        continue;
      }
      var tag = RICH_TAGS[name];
      if (!tag) continue;
      if (closing) {
        if (tag !== "br") closeTag(tag);
        continue;
      }
      if (tag === "br") {
        if (stack.length && !/^(ul|ol|blockquote)$/.test(top())) out.push("<br>");
        continue;
      }
      if (tag === "p" || tag === "h2" || tag === "h3" || tag === "blockquote" || tag === "ul" || tag === "ol") {
        // A paragraph inside a list item (Google Docs writes those) is just
        // the item's text.
        if (tag === "p" && top() === "li") continue;
        toBlockLevel();
        if (tag === "blockquote" && stack.indexOf("blockquote") !== -1) continue;
        push(tag);
        continue;
      }
      if (tag === "li") {
        var list = Math.max(stack.lastIndexOf("ul"), stack.lastIndexOf("ol"));
        if (list === -1) {
          toBlockLevel();
          push("ul");
        } else {
          while (stack.length > list + 1) pop();
        }
        push("li");
        continue;
      }
      // Inline formatting.
      ensureText();
      if (stack.indexOf(tag) !== -1) continue; // no <strong> inside <strong>
      if (tag === "a") {
        var hm = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[3]);
        var href = safeUrl(decodeEntities(hm ? hm[2] || hm[3] || hm[4] || "" : ""));
        push("a", href ? '<a href="' + escapeHtml(href) + '">' : "<a>");
        continue;
      }
      push(tag);
    }
    while (stack.length) pop();
    var result = out.join("").replace(/<a>([\s\S]*?)<\/a>/g, "$1");
    // Drop empty elements (repeat: emptying an <li> can empty its list).
    for (var pass = 0; pass < 3; pass++) {
      result = result
        .replace(/<(p|h2|h3|li|strong|em|u|sup|sub|a|mark|s)(?: [^>]*)?>(?:\s|\u00a0|<br>)*<\/\1>/g, "")
        .replace(/<(ul|ol|blockquote)>\s*<\/\1>/g, "");
    }
    if (hardMax && result.length > hardMax) {
      var cut = result.lastIndexOf("</p>", hardMax);
      result = cut > 0 ? result.slice(0, cut + 4) : "";
    }
    return result;
  }

  /** Visible text of formatted HTML, for counting characters. */
  function plainText(html) {
    return decodeEntities(
      str(html)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|h2|h3|li|blockquote)>/gi, "\n")
        .replace(/<[^>]*>/g, "")
    )
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  // ---- assets ----------------------------------------------------------------
  function assetKind(id) {
    if (IMAGE_EXT.test(id)) return "image";
    if (VIDEO_EXT.test(id)) return "video";
    if (FONT_EXT.test(id)) return "font";
    return null;
  }

  function isAssetId(v) {
    return typeof v === "string" && ASSET_RE.test(v);
  }

  /** A reference survives only if it is well-formed, of the right kind and known. */
  function assetRef(v, kind, ctx) {
    if (!isAssetId(v) || assetKind(v) !== kind) return "";
    if (ctx && ctx.assets && !ctx.assets[v]) return "";
    return v;
  }

  function normalizeAsset(id, raw) {
    var a = raw && typeof raw === "object" ? raw : {};
    var kind = assetKind(id);
    var out = {
      kind: kind,
      name: cleanText(a.name, 120, false),
      w: clampInt(a.w, 0, 20000, 0),
      h: clampInt(a.h, 0, 20000, 0),
      bytes: clampInt(a.bytes, 0, 2e9, 0),
      alt: cleanText(a.alt, 300, false),
      source: ["upload", "drive", "url", "ai", "brand", "settings"].indexOf(a.source) >= 0 ? a.source : "upload",
    };
    if (kind === "image") {
      out.widths = Array.isArray(a.widths)
        ? a.widths.filter(function (w) { return typeof w === "number" && w > 0 && w <= 4000; }).slice(0, 8)
        : [];
      out.opaque = a.opaque !== false;
      out.focal = {
        x: clampNum(a.focal && a.focal.x, 0, 100, 50),
        y: clampNum(a.focal && a.focal.y, 0, 100, 50),
      };
      if (a.ai && typeof a.ai === "object") out.ai = { model: cleanText(a.ai.model, 120, false), prompt: cleanText(a.ai.prompt, 2000, true) };
      if (a.desc) out.desc = cleanText(a.desc, 600, true);
    }
    if (kind === "video") {
      out.poster = isAssetId(a.poster) && assetKind(a.poster) === "image" ? a.poster : "";
      out.duration = clampNum(a.duration, 0, 36000, 0);
    }
    if (kind === "font") {
      out.family = cleanText(a.family, 80, false).replace(/["'<>;{}]/g, "");
      out.weight = clampInt(a.weight, 100, 900, 400);
      out.style = a.style === "italic" ? "italic" : "normal";
    }
    return out;
  }

  // ---- numbers ---------------------------------------------------------------
  function clampNum(v, min, max, dflt) {
    var n = typeof v === "number" ? v : parseFloat(v);
    if (!isFinite(n)) return dflt;
    return Math.max(min, Math.min(max, n));
  }

  function clampInt(v, min, max, dflt) {
    return Math.round(clampNum(v, min, max, dflt));
  }

  // ---- fields ----------------------------------------------------------------
  function defaultValue(f) {
    if (f.type === "list") {
      return (f.default || []).map(function (item) {
        return normalizeItem(f, item, null);
      });
    }
    if (f.default !== undefined) return f.default;
    if (f.type === "toggle") return false;
    if (f.type === "number") return f.min !== undefined ? Math.max(f.min, 0) : 0;
    return "";
  }

  function normalizeItem(f, raw, ctx) {
    var src = raw && typeof raw === "object" ? raw : {};
    var item = { id: typeof src.id === "string" && ID_RE.test(src.id) ? src.id : newId("i", 8) };
    f.item.forEach(function (sub) {
      item[sub.key] = normalizeField(sub, src[sub.key], ctx);
    });
    return item;
  }

  function normalizeField(f, v, ctx) {
    switch (f.type) {
      case "text":
        return v === undefined ? defaultValue(f) : cleanText(v, f.hardMax || S.HARD_MAX.text, false);
      case "textarea":
        return v === undefined ? defaultValue(f) : cleanText(v, f.hardMax || S.HARD_MAX.textarea, true);
      case "rich":
        return v === undefined ? defaultValue(f) : sanitizeRich(v, S.HARD_MAX.rich);
      case "url":
        return v === undefined ? defaultValue(f) : safeUrl(v);
      case "image":
        return assetRef(v, "image", ctx);
      case "video":
        return assetRef(v, "video", ctx);
      case "select": {
        var ok = f.options.some(function (o) { return o[0] === v; });
        return ok ? v : defaultValue(f);
      }
      case "toggle":
        return v === undefined ? defaultValue(f) : v === true;
      case "number":
        return clampNum(v, f.min, f.max, defaultValue(f));
      case "color":
        return typeof v === "string" && COLOR_RE.test(v) ? v.toLowerCase() : "";
      case "list": {
        if (!Array.isArray(v)) return v === undefined ? defaultValue(f) : [];
        return v.slice(0, f.maxItems || 20).map(function (item) {
          return normalizeItem(f, item, ctx);
        });
      }
      default:
        return "";
    }
  }

  function normalizeStyle(raw, type, ctx, partial) {
    var src = raw && typeof raw === "object" ? raw : {};
    var blockDefaults = (S.BLOCKS[type] && S.BLOCKS[type].style) || {};
    var out = {};
    S.STYLE_FIELDS.forEach(function (f) {
      if (partial) {
        if (!f.rs || src[f.key] === undefined) return;
        out[f.key] = normalizeField(f, src[f.key], ctx);
        return;
      }
      var v = src[f.key];
      if (v === undefined && blockDefaults[f.key] !== undefined) v = blockDefaults[f.key];
      out[f.key] = normalizeField(f, v, ctx);
    });
    return out;
  }

  function normalizeSection(raw, ctx) {
    var src = raw && typeof raw === "object" ? raw : {};
    var type = S.BLOCKS[src.type] ? src.type : null;
    if (!type) return null;
    var props = {};
    var rawProps = src.props && typeof src.props === "object" ? src.props : {};
    S.fieldsOf(type).forEach(function (f) {
      props[f.key] = normalizeField(f, rawProps[f.key], ctx);
    });
    var rs = {};
    ["tablet", "mobile"].forEach(function (dev) {
      var d = src.rs && src.rs[dev];
      if (!d || typeof d !== "object") return;
      var style = normalizeStyle(d.style, type, ctx, true);
      if (Object.keys(style).length) rs[dev] = { style: style };
    });
    var hide = src.hide && typeof src.hide === "object" ? src.hide : {};
    return {
      id: typeof src.id === "string" && ID_RE.test(src.id) ? src.id : newId("s"),
      type: type,
      props: props,
      style: normalizeStyle(src.style, type, ctx, false),
      rs: rs,
      hide: { desktop: hide.desktop === true, tablet: hide.tablet === true, mobile: hide.mobile === true },
      name: cleanText(src.name, 60, false),
    };
  }

  function slugify(v, fallback) {
    var s = str(v)
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .replace(/å/g, "a")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "");
    return s || fallback || "side";
  }

  function normalizePage(raw, ctx, index) {
    var src = raw && typeof raw === "object" ? raw : {};
    var sections = Array.isArray(src.sections) ? src.sections : [];
    var label = cleanText(src.label, 60, false) || (index === 0 ? "Hovedside" : "Variant " + (index + 1));
    return {
      id: typeof src.id === "string" && ID_RE.test(src.id) ? src.id : newId("p"),
      label: label,
      slug: slugify(src.slug || label, "side-" + (index + 1)),
      title: cleanText(src.title, 140, false),
      sections: sections
        .slice(0, MAX_SECTIONS)
        .map(function (s) { return normalizeSection(s, ctx); })
        .filter(Boolean),
    };
  }

  function normalizeFont(raw, dflt, ctx) {
    var src = raw && typeof raw === "object" ? raw : {};
    var source = ["google", "custom", "system"].indexOf(src.source) >= 0 ? src.source : dflt.source;
    var family = cleanText(src.family, 80, false).replace(/["'<>;{}\\]/g, "").trim() || dflt.family;
    return {
      family: family,
      source: source,
      weight: clampInt(src.weight, 100, 900, dflt.weight),
    };
  }

  function normalizeTheme(raw, ctx) {
    var src = raw && typeof raw === "object" ? raw : {};
    var D = S.DEFAULT_THEME;
    var colors = {};
    S.THEME_COLORS.forEach(function (c) {
      var v = src.colors && src.colors[c[0]];
      colors[c[0]] = typeof v === "string" && COLOR_RE.test(v) ? v.toLowerCase() : D.colors[c[0]];
    });
    var fonts = src.fonts && typeof src.fonts === "object" ? src.fonts : {};
    return {
      colors: colors,
      fonts: {
        heading: normalizeFont(fonts.heading, D.fonts.heading, ctx),
        body: normalizeFont(fonts.body, D.fonts.body, ctx),
      },
      headingCase: src.headingCase === "upper" ? "upper" : "none",
      scale: oneOf(src.scale, S.TYPE_SCALES.map(function (x) { return x[0]; }), D.scale),
      tracking: oneOf(src.tracking, ["normal", "tight", "wide"], D.tracking),
      radius: clampInt(src.radius, 0, 40, D.radius),
      button: ["solid", "outline", "pill"].indexOf(src.button) >= 0 ? src.button : D.button,
      buttonCase: src.buttonCase === "upper" ? "upper" : "none",
      logo: assetRef(src.logo, "image", ctx),
      logoDark: assetRef(src.logoDark, "image", ctx),
    };
  }

  function oneOf(v, list, dflt) {
    return list.indexOf(v) >= 0 ? v : dflt;
  }

  /**
   * Custom CSS from the Side panel. It ends up inside a <style> on a page
   * hosted on the tool's own origin, so it may style but never load or run
   * anything: no "<" (cannot close the style tag), no comments (they could
   * hide a keyword from the checks below), no @import / @font-face, no url()
   * or image-set() (no outside requests), no expression(), no escapes (which
   * could spell those again) and no !important.
   */
  function sanitizeCss(v) {
    return cleanText(v, 20000, true)
      .replace(/\/\*[\s\S]*?(\*\/|$)/g, "")
      .replace(/[<\\]/g, "")
      .replace(/@(import|charset|font-face|namespace|layer|scope|property)\b[^;{]*(;|\{[^}]*\})?/gi, "")
      .replace(/\b(url|image-set|-webkit-image-set|cross-fade|image|element|paint|src|expression)\s*\(/gi, "none(")
      .replace(/(java|vb)script\s*:/gi, "")
      .replace(/!\s*important/gi, "");
  }

  /**
   * The custom CSS as it goes into the page: nested inside #np-main, so its
   * rules can only reach the sections — never the disclosure label, the
   * variant tabs, the chapter menu or the footer, which all live outside
   * <main>. "&" is removed (it would let a nested selector climb out again)
   * and stray closing braces are dropped, so the nesting cannot be closed early.
   */
  function scopeCss(css) {
    var src = sanitizeCss(css).replace(/&/g, "");
    if (!src.trim()) return "";
    var out = "";
    var depth = 0;
    for (var i = 0; i < src.length; i++) {
      var ch = src[i];
      if (ch === "{") depth++;
      if (ch === "}") {
        if (!depth) continue;
        depth--;
      }
      out += ch;
    }
    while (depth-- > 0) out += "}";
    return "#np-main{" + out + "}";
  }

  function normalizeExtras(raw, ctx) {
    var src = raw && typeof raw === "object" ? raw : {};
    var out = {};
    S.EXTRA_FIELDS.forEach(function (f) {
      out[f.key] = normalizeField(f, src[f.key], ctx);
    });
    out.customCss = sanitizeCss(out.customCss);
    return out;
  }

  function normalizeAssets(raw) {
    var out = {};
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw)
      .filter(isAssetId)
      .slice(0, MAX_ASSETS)
      .forEach(function (id) {
        out[id] = normalizeAsset(id, raw[id]);
        if (out[id].kind === "video" && out[id].poster && !raw[out[id].poster]) out[id].poster = "";
      });
    return out;
  }

  /**
   * Rebuild a project from untrusted JSON. Server-owned bookkeeping (status,
   * review rounds, revision, owner, timestamps) is copied through only when it
   * is well-formed; the server overwrites it anyway when it saves.
   */
  function normalizeProject(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    var assets = normalizeAssets(src.assets);
    var ctx = { assets: assets };
    var pages = Array.isArray(src.pages) && src.pages.length ? src.pages.slice(0, MAX_PAGES) : [{}];
    var adv = src.advertiser && typeof src.advertiser === "object" ? src.advertiser : {};
    var meta = src.meta && typeof src.meta === "object" ? src.meta : {};
    var tracking = src.tracking && typeof src.tracking === "object" ? src.tracking : {};
    var utm = tracking.utm && typeof tracking.utm === "object" ? tracking.utm : {};
    var name = cleanText(src.name, 120, false) || "Uten navn";
    var normalizedPages = pages.map(function (p, i) { return normalizePage(p, ctx, i); });
    // Page slugs are folder names in the export, so they must be unique.
    var seen = {};
    normalizedPages = normalizedPages.map(function (p, i) {
      var slug = p.slug;
      var n = 2;
      while (seen[slug]) slug = p.slug + "-" + n++;
      seen[slug] = true;
      return slug === p.slug ? p : Object.assign({}, p, { slug: slug });
    });

    return {
      app: "abc-design-native",
      version: VERSION,
      id: typeof src.id === "string" && ID_RE.test(src.id) ? src.id : newId("np", 14),
      name: name,
      advertiser: {
        name: cleanText(adv.name, 80, false),
        url: safeUrl(adv.url),
        logo: assetRef(adv.logo, "image", ctx),
      },
      brandKit: typeof src.brandKit === "string" && ID_RE.test(src.brandKit) ? src.brandKit : "",
      theme: normalizeTheme(src.theme, ctx),
      meta: {
        title: cleanText(meta.title, 140, false),
        description: cleanText(meta.description, 300, false),
        ogImage: assetRef(meta.ogImage, "image", ctx),
        slug: slugify(meta.slug || name, "annonse"),
        // Where the page will live once published (for canonical / og:url and
        // an absolute og:image). Empty = unknown.
        publicUrl: /^https?:\/\//.test(safeUrl(meta.publicUrl)) ? safeUrl(meta.publicUrl).replace(/[?#].*$/, "").replace(/\/?$/, "/") : "",
        noindex: meta.noindex !== false,
      },
      tracking: {
        clickPrefix: /^https:\/\/[^\s<>"]+$/.test(str(tracking.clickPrefix).trim()) ? str(tracking.clickPrefix).trim().slice(0, 600) : "",
        headHtml: cleanText(tracking.headHtml, 20000, true),
        bodyHtml: cleanText(tracking.bodyHtml, 20000, true),
        utm: {
          enabled: utm.enabled !== false,
          source: slugish(utm.source, "abcnyheter"),
          medium: slugish(utm.medium, "native"),
          campaign: slugish(utm.campaign, slugify(name, "")),
        },
      },
      variantNav: src.variantNav !== false,
      // Projects saved before page options existed keep looking the same:
      // no progress bar or credit line appears on a page someone approved.
      extras: normalizeExtras(src.extras && typeof src.extras === "object" ? src.extras : { progress: false, credit: false }, ctx),
      pages: normalizedPages,
      assets: assets,
      status: STATUSES.indexOf(src.status) >= 0 ? src.status : "draft",
      rev: clampInt(src.rev, 0, 1e9, 0),
      createdAt: isIsoDate(src.createdAt) ? src.createdAt : "",
      updatedAt: isIsoDate(src.updatedAt) ? src.updatedAt : "",
      owner: cleanText(src.owner, 80, false),
      notes: cleanText(src.notes, 4000, true),
      ai: normalizeAi(src.ai),
    };
  }

  /**
   * The AI wizard's working state (sources, analysis, answers, plan), kept
   * with the project so the user can come back to it. Plain JSON only, size
   * capped; it is never rendered.
   */
  var MAX_AI_BYTES = 400000;
  var MAX_CHAT = 40;

  /** One message in the AI assistant's conversation (project.ai.chat). */
  function normalizeChatMessage(m) {
    if (!m || typeof m !== "object") return null;
    var text = cleanText(m.text, 4000, true);
    var out = { role: m.role === "assistant" ? "assistant" : "user", text: text };
    if (isIsoDate(m.at)) out.at = m.at;
    if (Array.isArray(m.changes)) {
      out.changes = m.changes.slice(0, 40).map(function (c) {
        c = c && typeof c === "object" ? c : {};
        return { op: cleanText(c.op, 12, false), sectionId: cleanText(c.sectionId, 40, false), type: cleanText(c.type, 40, false), summary: cleanText(c.summary, 200, false) };
      });
    }
    if (Array.isArray(m.warnings)) out.warnings = m.warnings.slice(0, 20).map(function (w) { return cleanText(w, 300, false); });
    if (Array.isArray(m.questions)) {
      out.questions = m.questions.slice(0, 3).map(function (q) {
        q = q && typeof q === "object" ? q : {};
        return {
          question: cleanText(q.question, 300, false),
          why: cleanText(q.why, 300, false),
          options: (Array.isArray(q.options) ? q.options : []).slice(0, 4).map(function (o) { return cleanText(o, 200, false); }),
          suggested: cleanText(q.suggested, 200, false),
        };
      });
    }
    if (typeof m.cost === "number" && isFinite(m.cost)) out.cost = Math.max(0, m.cost);
    if (typeof m.model === "string") out.model = cleanText(m.model, 120, false);
    return text || out.changes ? out : null;
  }

  function normalizeAi(raw) {
    if (!raw || typeof raw !== "object") return null;
    var keep = {};
    ["brief", "advertiser", "length", "title", "ingress", "angle", "at"].forEach(function (k) {
      if (typeof raw[k] === "string") keep[k] = cleanText(raw[k], 20000, true);
    });
    ["sources", "analysis", "answers", "outline", "imageMap", "selectedImages"].forEach(function (k) {
      if (raw[k] && typeof raw[k] === "object") keep[k] = raw[k];
    });
    if (typeof raw.templateId === "string" && /^[a-z0-9-]{1,60}$/.test(raw.templateId)) keep.templateId = raw.templateId;
    if (["okonomi", "standard", "premium"].indexOf(raw.tier) >= 0) keep.tier = raw.tier;
    if (Array.isArray(raw.chat)) keep.chat = raw.chat.slice(-MAX_CHAT).map(normalizeChatMessage).filter(Boolean);
    var json;
    try {
      json = JSON.stringify(keep);
    } catch (_) {
      return null;
    }
    if (json.length > MAX_AI_BYTES) {
      // Drop the bulky source texts first; the analysis already holds the facts.
      delete keep.sources;
      json = JSON.stringify(keep);
      if (json.length > MAX_AI_BYTES && keep.chat) {
        keep.chat = keep.chat.slice(-8);
        json = JSON.stringify(keep);
      }
      if (json.length > MAX_AI_BYTES) return null;
    }
    return JSON.parse(json);
  }

  function slugish(v, dflt) {
    var s = str(v === undefined ? dflt : v).trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").slice(0, 80);
    return s;
  }

  function isIsoDate(v) {
    return typeof v === "string" && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v);
  }

  // ---- construction -------------------------------------------------------
  function createSection(type, overrides) {
    var o = overrides || {};
    return normalizeSection(
      { type: type, props: o.props || {}, style: o.style || {}, rs: o.rs, hide: o.hide, name: o.name },
      o.ctx || null
    );
  }

  function createProject(opts) {
    var o = opts || {};
    return normalizeProject({
      extras: o.extras || {},
      name: o.name || "Ny Native Premium",
      advertiser: o.advertiser || {},
      theme: o.theme || S.DEFAULT_THEME,
      assets: o.assets || {},
      pages: [{ label: "Hovedside", sections: o.sections || [
        { type: "hero", props: { title: "Tittel på saken", ingress: "Ingress som sier hva leseren får." } },
        { type: "richText" },
        { type: "factBox" },
        { type: "cta" },
      ] }],
    });
  }

  /**
   * A deep copy of a section with fresh ids (for duplicate / paste / library).
   * The anchor id and the chapter-menu name are cleared — two sections with
   * the same anchor break #links and list the chapter twice — unless
   * opts.keepNav (a whole page copied as a set keeps its own navigation).
   */
  function cloneSection(section, opts) {
    var copy = JSON.parse(JSON.stringify(section));
    copy.id = newId("s");
    if (!(opts && opts.keepNav === true) && copy.style) {
      copy.style.anchor = "";
      copy.style.chapter = "";
    }
    S.fieldsOf(copy.type).forEach(function (f) {
      if (f.type === "list" && Array.isArray(copy.props[f.key])) {
        copy.props[f.key] = copy.props[f.key].map(function (item) {
          return Object.assign({}, item, { id: newId("i", 8) });
        });
      }
    });
    return copy;
  }

  // ---- queries ----------------------------------------------------------------
  function eachAssetInSection(section, fn) {
    S.fieldsOf(section.type).forEach(function (f) {
      var v = section.props[f.key];
      if ((f.type === "image" || f.type === "video") && v) fn(v);
      if (f.type === "list" && Array.isArray(v)) {
        v.forEach(function (item) {
          f.item.forEach(function (sub) {
            if ((sub.type === "image" || sub.type === "video") && item[sub.key]) fn(item[sub.key]);
          });
        });
      }
    });
    S.STYLE_FIELDS.forEach(function (f) {
      if ((f.type === "image" || f.type === "video") && section.style && section.style[f.key]) fn(section.style[f.key]);
    });
  }

  /** Every asset id the project's content refers to (videos bring their poster). */
  function usedAssets(project) {
    var set = {};
    function add(id) {
      if (!id) return;
      set[id] = true;
      var a = project.assets && project.assets[id];
      if (a && a.kind === "video" && a.poster) set[a.poster] = true;
    }
    project.pages.forEach(function (p) {
      p.sections.forEach(function (s) { eachAssetInSection(s, add); });
    });
    add(project.theme && project.theme.logo);
    add(project.theme && project.theme.logoDark);
    add(project.advertiser && project.advertiser.logo);
    add(project.meta && project.meta.ogImage);
    Object.keys(project.assets || {}).forEach(function (id) {
      if (project.assets[id].kind === "font") set[id] = true;
    });
    return Object.keys(set);
  }

  function findSection(project, sectionId) {
    for (var i = 0; i < project.pages.length; i++) {
      var p = project.pages[i];
      for (var j = 0; j < p.sections.length; j++) {
        if (p.sections[j].id === sectionId) return { page: p, pageIndex: i, section: p.sections[j], index: j };
      }
    }
    return null;
  }

  /** Effective style of a section on a device (desktop ← tablet ← mobile cascade). */
  function styleFor(section, device) {
    var st = Object.assign({}, section.style);
    if (device === "tablet" || device === "mobile") Object.assign(st, (section.rs.tablet && section.rs.tablet.style) || {});
    if (device === "mobile") Object.assign(st, (section.rs.mobile && section.rs.mobile.style) || {});
    return st;
  }

  return {
    VERSION: VERSION,
    MAX_PAGES: MAX_PAGES,
    MAX_SECTIONS: MAX_SECTIONS,
    STATUSES: STATUSES,
    STATUS_LABELS: STATUS_LABELS,
    ASSET_RE: ASSET_RE,
    newId: newId,
    escapeHtml: escapeHtml,
    decodeEntities: decodeEntities,
    safeUrl: safeUrl,
    sanitizeRich: sanitizeRich,
    plainText: plainText,
    cleanText: cleanText,
    slugify: slugify,
    assetKind: assetKind,
    isAssetId: isAssetId,
    normalizeAsset: normalizeAsset,
    normalizeField: normalizeField,
    normalizeSection: normalizeSection,
    normalizeTheme: normalizeTheme,
    normalizeProject: normalizeProject,
    createSection: createSection,
    createProject: createProject,
    cloneSection: cloneSection,
    usedAssets: usedAssets,
    findSection: findSection,
    styleFor: styleFor,
    sanitizeCss: sanitizeCss,
    scopeCss: scopeCss,
    normalizeExtras: normalizeExtras,
    defaultValue: defaultValue,
  };
});
