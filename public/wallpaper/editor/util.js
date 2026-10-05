/* =========================================================================
   editor/util.js — small shared helpers for the Wallpaper editor: a DOM
   builder, UI icons (drawn from the same Lucide set the icon panel offers),
   toasts, popovers and a couple of formatting functions.
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var SVG_NS = "http://www.w3.org/2000/svg";

  var iconSet = null; // { icons, tags } from icons.json, loaded once

  function loadIcons() {
    if (iconSet) return Promise.resolve(iconSet);
    return fetch("wallpaper/icons.json")
      .then(function (r) {
        if (!r.ok) throw new Error("icons " + r.status);
        return r.json();
      })
      .then(function (data) {
        iconSet = data;
        return data;
      });
  }

  /** Inline SVG for a Lucide icon by name (empty span until the set is loaded). */
  function icon(name, size) {
    var s = size || 18;
    var nodes = iconSet && iconSet.icons[name];
    var root = document.createElementNS(SVG_NS, "svg");
    root.setAttribute("viewBox", "0 0 24 24");
    root.setAttribute("width", s);
    root.setAttribute("height", s);
    root.setAttribute("fill", "none");
    root.setAttribute("stroke", "currentColor");
    root.setAttribute("stroke-width", "2");
    root.setAttribute("stroke-linecap", "round");
    root.setAttribute("stroke-linejoin", "round");
    root.setAttribute("aria-hidden", "true");
    root.classList.add("wpi");
    (nodes || []).forEach(function (n) {
      var child = document.createElementNS(SVG_NS, n[0]);
      Object.keys(n[1]).forEach(function (k) {
        child.setAttribute(k, n[1][k]);
      });
      root.appendChild(child);
    });
    return root;
  }

  /**
   * h("button.cls#id", {attrs, on: {click}}, children…)
   * Text children become text nodes — never HTML.
   */
  function h(tag, props) {
    var m = /^([a-z0-9-]+)((?:[.#][\w-]+)*)$/i.exec(tag);
    var node = document.createElement(m ? m[1] : "div");
    if (m && m[2]) {
      m[2].replace(/([.#])([\w-]+)/g, function (_, kind, name) {
        if (kind === ".") node.classList.add(name);
        else node.id = name;
        return "";
      });
    }
    var p = props || {};
    Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (v === undefined || v === null || v === false) return;
      if (k === "on") {
        Object.keys(v).forEach(function (ev) {
          node.addEventListener(ev, v[ev]);
        });
      } else if (k === "style" && typeof v === "object") {
        Object.assign(node.style, v);
      } else if (k === "class") {
        String(v).split(/\s+/).filter(Boolean).forEach(function (c) {
          node.classList.add(c);
        });
      } else if (k === "dataset") {
        Object.assign(node.dataset, v);
      } else if (k in node && typeof v !== "string") {
        node[k] = v;
      } else {
        node.setAttribute(k, v === true ? "" : v);
      }
    });
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function append(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) return child.forEach(function (c) { append(node, c); });
    node.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  // ---- toasts (same look as the rest of the app) ---------------------------
  function toast(message, kind) {
    var host = document.getElementById("toasts");
    if (!host) return;
    var t = h("div", { class: "toast" + (kind ? " toast--" + kind : "") }, h("span.toast__dot"), h("span", null, message));
    host.appendChild(t);
    setTimeout(function () {
      t.classList.add("is-out");
      setTimeout(function () { t.remove(); }, 320);
    }, Math.max(kind === "err" ? 5200 : 3200, String(message).length * 55));
  }

  // ---- popovers --------------------------------------------------------------
  var openPop = null;

  function closePopover() {
    if (!openPop) return;
    var p = openPop;
    openPop = null;
    p.node.remove();
    if (p.onClose) p.onClose();
  }

  /**
   * Open `content` in a floating panel anchored to `anchor`. Only one popover
   * is open at a time; outside clicks and Escape close it.
   */
  function popover(anchor, content, opts) {
    closePopover();
    var o = opts || {};
    var node = h("div.wp-pop" + (o.className ? "." + o.className : ""), { role: "dialog" }, content);
    document.body.appendChild(node);
    var r = anchor.getBoundingClientRect();
    var pw = node.offsetWidth;
    var ph = node.offsetHeight;
    var left = o.align === "right" ? r.right - pw : r.left;
    left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));
    var top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    node.style.left = left + "px";
    node.style.top = top + "px";
    openPop = { node: node, anchor: anchor, onClose: o.onClose };
    return node;
  }

  document.addEventListener(
    "pointerdown",
    function (e) {
      if (!openPop) return;
      if (openPop.node.contains(e.target) || openPop.anchor.contains(e.target)) return;
      closePopover();
    },
    true
  );
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openPop) {
      closePopover();
      e.stopPropagation();
    }
  }, true);

  // ---- misc ------------------------------------------------------------------
  function debounce(fn, ms) {
    var t = 0;
    var wrapped = function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(null, args);
      }, ms);
    };
    wrapped.cancel = function () { clearTimeout(t); };
    return wrapped;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function formatKb(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0).replace(".", ",") + " KB";
    return (bytes / 1048576).toFixed(1).replace(".", ",") + " MB";
  }

  function isTyping(target) {
    var t = target || document.activeElement;
    if (!t) return false;
    if (t.isContentEditable) return true;
    var tag = t.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag === "INPUT") return !/^(checkbox|radio|range|button|color|file)$/i.test(t.type);
    return false;
  }

  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = h("a", { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function postJson(url, body, signal) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: signal,
    }).then(function (res) {
      if (res.ok) return res;
      return res
        .json()
        .catch(function () { return {}; })
        .then(function (j) {
          throw new Error(j.error || "Serveren svarte " + res.status);
        });
    });
  }

  WPE.util = {
    loadIcons: loadIcons,
    icons: function () { return iconSet; },
    icon: icon,
    h: h,
    append: append,
    clear: clear,
    toast: toast,
    popover: popover,
    closePopover: closePopover,
    debounce: debounce,
    clamp: clamp,
    formatKb: formatKb,
    isTyping: isTyping,
    saveBlob: saveBlob,
    postJson: postJson,
  };
  WPE.toast = toast;
})();
