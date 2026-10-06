/* =========================================================================
   app/ui.js — small UI building blocks for Native Premium, on top of the
   Wallpaper editor's helpers (WPE.util: h, icon, toast, popover).

   Dialogs are built here rather than with alert()/confirm()/prompt(): those
   block the page, look foreign and cannot hold a form.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var U = window.WPE.util;
  var h = U.h;

  function icon(name, size) {
    return U.icon(name, size || 16);
  }

  function button(label, opts) {
    var o = opts || {};
    var cls = "button.nx-btn" + (o.kind ? ".nx-btn--" + o.kind : "") + (o.small ? ".nx-btn--sm" : "") + (o.cls ? "." + o.cls : "");
    return h(
      cls,
      {
        type: o.type || "button",
        title: o.title || null,
        "aria-label": o.aria || (label ? null : o.title) || null,
        disabled: o.disabled || null,
        on: o.onClick ? { click: o.onClick } : null,
      },
      o.icon ? icon(o.icon, o.iconSize || 16) : null,
      label ? h("span", null, label) : null
    );
  }

  /**
   * A modal dialog. Returns { node, close }. Closes on Escape and on the
   * backdrop; focus moves into it and back to where it was on close.
   */
  function modal(opts) {
    var o = opts || {};
    var before = document.activeElement;
    var closed = false;
    var backdrop = h("div.nx-modal-bg");
    var box = h(
      "div.nx-modal" + (o.wide ? ".nx-modal--wide" : "") + (o.full ? ".nx-modal--full" : ""),
      { role: "dialog", "aria-modal": "true", "aria-label": o.title || "Dialog", tabindex: "-1" },
      h(
        "div.nx-modal__head",
        null,
        h("h2", null, o.title || ""),
        button("", { icon: "x", kind: "ghost", title: "Lukk", onClick: function () { close(); } })
      ),
      h("div.nx-modal__body", null, o.body),
      o.actions && o.actions.length ? h("div.nx-modal__foot", null, o.actions) : null
    );
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    requestAnimationFrame(function () {
      backdrop.classList.add("is-in");
      var first = box.querySelector("[autofocus], input, textarea, select");
      (first || box).focus();
    });
    function onKey(e) {
      if (e.key === "Escape" && !closed) {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey, true);
    backdrop.addEventListener("pointerdown", function (e) {
      if (e.target === backdrop && !o.sticky) close();
    });
    function close(result) {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey, true);
      backdrop.classList.remove("is-in");
      setTimeout(function () { backdrop.remove(); }, 180);
      if (before && before.focus) before.focus();
      if (o.onClose) o.onClose(result);
    }
    return { node: box, close: close };
  }

  /** A yes/no question. Resolves true/false. */
  function confirmDialog(title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      var answered = false;
      var m = modal({
        title: title,
        body: h("p.nx-muted", null, text),
        onClose: function () {
          if (!answered) resolve(false);
        },
        actions: [
          button("Avbryt", { kind: "ghost", onClick: function () { m.close(); } }),
          button(okLabel || "OK", {
            kind: danger ? "danger" : "primary",
            onClick: function () {
              answered = true;
              resolve(true);
              m.close();
            },
          }),
        ],
      });
    });
  }

  /** Ask for one line of text. Resolves the text, or null. */
  function promptDialog(title, label, value, okLabel) {
    return new Promise(function (resolve) {
      var answered = false;
      var input = h("input.nx-input", { type: "text", value: value || "", autofocus: true });
      var m;
      function ok() {
        answered = true;
        resolve(input.value.trim());
        m.close();
      }
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") ok();
      });
      m = modal({
        title: title,
        body: h("label.nx-field", null, h("span.nx-field__label", null, label), input),
        onClose: function () {
          if (!answered) resolve(null);
        },
        actions: [button("Avbryt", { kind: "ghost", onClick: function () { m.close(); } }), button(okLabel || "OK", { kind: "primary", onClick: ok })],
      });
    });
  }

  /** Segmented control: [[value, label, icon?]] → node with .set(value). */
  function segmented(options, value, onChange, opts) {
    var o = opts || {};
    var node = h("div.nx-seg" + (o.small ? ".nx-seg--sm" : ""), { role: "group", "aria-label": o.label || null });
    var buttons = options.map(function (opt) {
      var b = h(
        "button.nx-seg__btn",
        {
          type: "button",
          title: opt[3] || opt[1],
          "aria-pressed": String(opt[0] === value),
          on: {
            click: function () {
              set(opt[0]);
              onChange(opt[0]);
            },
          },
        },
        opt[2] ? icon(opt[2], 16) : null,
        opt[1] && !o.iconOnly ? h("span", null, opt[1]) : null
      );
      b.dataset.value = opt[0];
      node.appendChild(b);
      return b;
    });
    function set(v) {
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.value === v));
      });
    }
    node.set = set;
    return node;
  }

  /** The smallest variant of an image that is at least `want` px wide. */
  function thumb(meta, id, want) {
    if (!id) return "";
    var ws = (meta && meta.widths) || [];
    if (!ws.length) return NP.api.assetUrl(id, 0);
    var w = ws[ws.length - 1];
    for (var i = 0; i < ws.length; i++) {
      if (ws[i] >= (want || 480)) {
        w = ws[i];
        break;
      }
    }
    return NP.api.assetUrl(id, w);
  }

  var RTF = typeof Intl !== "undefined" && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat("nb", { numeric: "auto" }) : null;

  function when(iso) {
    var t = Date.parse(iso);
    if (!t) return "";
    var diff = (t - Date.now()) / 1000;
    var abs = Math.abs(diff);
    if (RTF) {
      if (abs < 60) return "akkurat nå";
      if (abs < 3600) return RTF.format(Math.round(diff / 60), "minute");
      if (abs < 86400) return RTF.format(Math.round(diff / 3600), "hour");
      if (abs < 7 * 86400) return RTF.format(Math.round(diff / 86400), "day");
    }
    return new Date(t).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
  }

  function money(usd) {
    if (!usd) return "0 kr";
    var nok = usd * 10.8;
    return (nok < 1 ? nok.toFixed(2) : nok.toFixed(1)).replace(".", ",") + " kr";
  }

  function spinner() {
    return h("span.nx-spin", { "aria-hidden": "true" });
  }

  function empty(iconName, title, text, action) {
    return h("div.nx-empty", null, icon(iconName, 34), h("h3", null, title), text ? h("p", null, text) : null, action || null);
  }

  function copyText(text, what) {
    var done = function () { U.toast((what || "Teksten") + " er kopiert", "ok"); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done, function () { U.toast("Kunne ikke kopiere", "err"); });
    } else {
      var ta = h("textarea", { style: { position: "fixed", opacity: "0" } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        done();
      } catch (_) {
        U.toast("Kunne ikke kopiere", "err");
      }
      ta.remove();
    }
  }

  NP.ui = {
    h: h,
    icon: icon,
    clear: U.clear,
    toast: U.toast,
    popover: U.popover,
    closePopover: U.closePopover,
    debounce: U.debounce,
    button: button,
    modal: modal,
    confirm: confirmDialog,
    prompt: promptDialog,
    segmented: segmented,
    thumb: thumb,
    when: when,
    money: money,
    spinner: spinner,
    empty: empty,
    copyText: copyText,
  };
})();
