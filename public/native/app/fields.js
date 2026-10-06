/* =========================================================================
   app/fields.js — one form control per schema field type.

   control(field, value, onChange, ctx) returns a node. The properties panel
   builds a section's whole form from schema.js with these, so a new field in
   the schema needs no new UI code.

   Text fields show a live character count against the editorial limit (red
   when over) and, when the section type allows it, a ✨ button with the AI
   rewrite tools.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var Doc = window.NativeDoc;
  var S = window.NativeSchema;

  function counter(f, text) {
    if (!f.max) return null;
    var node = h("span.nx-count");
    node.update = function (t) {
      var n = String(t || "").length;
      node.textContent = n + " / " + f.max;
      node.classList.toggle("is-over", n > f.max);
      node.classList.toggle("is-near", n <= f.max && n > f.max * 0.9);
    };
    node.update(text);
    return node;
  }

  function label(f, extra) {
    return h(
      "div.nx-field__head",
      null,
      h("span.nx-field__label", null, f.label, f.required ? h("span.nx-req", { title: "Påkrevd" }, " *") : null),
      extra || null
    );
  }

  function wrap(f, control, headExtra, help) {
    return h("div.nx-field", { dataset: { key: f.key } }, label(f, headExtra), control, help || f.help ? h("p.nx-help", null, help || f.help) : null);
  }

  function aiButton(f, getValue, apply, ctx) {
    if (!ctx || !ctx.ai) return null;
    return ui.button("", {
      icon: "sparkles",
      kind: "ghost",
      small: true,
      cls: "nx-ai-mini",
      title: "Skriv om med AI",
      onClick: function (e) {
        NP.ai.rewriteMenu(e.currentTarget, {
          type: ctx.type,
          field: ctx.path || f.key,
          label: f.label,
          value: getValue(),
          rich: f.type === "rich",
          apply: apply,
        });
      },
    });
  }

  // ---- text / textarea ---------------------------------------------------------------
  function textControl(f, value, onChange, ctx) {
    var multi = f.type === "textarea";
    var input = multi
      ? h("textarea.nx-input.nx-textarea", { rows: 3, spellcheck: "true", lang: "nb" })
      : h("input.nx-input", { type: "text", spellcheck: "true", lang: "nb" });
    input.value = value || "";
    var count = counter(f, input.value);
    function autosize() {
      if (!multi) return;
      input.style.height = "auto";
      input.style.height = Math.min(320, input.scrollHeight + 2) + "px";
    }
    input.addEventListener("input", function () {
      if (count) count.update(input.value);
      autosize();
      onChange(input.value, { from: "panel" });
    });
    requestAnimationFrame(autosize);
    var ai = aiButton(f, function () { return input.value; }, function (v) {
      input.value = v;
      if (count) count.update(v);
      autosize();
      onChange(v);
    }, ctx);
    return wrap(f, input, h("span.nx-field__tools", null, count, ai));
  }

  // ---- formatted text ------------------------------------------------------------------
  var RICH_TOOLS = [
    ["bold", "bold", "Fet (Ctrl+B)"],
    ["italic", "italic", "Kursiv (Ctrl+I)"],
    ["h2", "heading-2", "Mellomtittel"],
    ["h3", "heading-3", "Liten mellomtittel"],
    ["ul", "list", "Punktliste"],
    ["ol", "list-ordered", "Nummerert liste"],
    ["quote", "text-quote", "Sitat"],
    ["link", "link", "Lenke"],
    ["clear", "remove-formatting", "Fjern formatering"],
  ];

  function exec(cmd) {
    switch (cmd) {
      case "bold":
      case "italic":
        document.execCommand(cmd);
        break;
      case "h2":
      case "h3":
      case "p":
        document.execCommand("formatBlock", false, cmd);
        break;
      case "quote":
        document.execCommand("formatBlock", false, "blockquote");
        break;
      case "ul":
        document.execCommand("insertUnorderedList");
        break;
      case "ol":
        document.execCommand("insertOrderedList");
        break;
      case "clear":
        document.execCommand("removeFormat");
        document.execCommand("formatBlock", false, "p");
        break;
    }
  }

  function richEditor(value, onInput, opts) {
    var o = opts || {};
    var area = h("div.nx-rich", { contenteditable: "true", spellcheck: "true", lang: "nb", role: "textbox", "aria-multiline": "true" });
    area.innerHTML = Doc.sanitizeRich(value || "", S.HARD_MAX.rich);
    var bar = h("div.nx-rich__bar", { role: "toolbar", "aria-label": "Formatering" });
    RICH_TOOLS.forEach(function (t) {
      bar.appendChild(
        h(
          "button.nx-rich__tool",
          {
            type: "button",
            title: t[2],
            "aria-label": t[2],
            on: {
              mousedown: function (e) { e.preventDefault(); },
              click: function () {
                area.focus();
                if (t[0] === "link") {
                  var sel = window.getSelection();
                  var range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
                  ui.prompt("Lenke", "Adresse (https://…)", "https://").then(function (url) {
                    if (!url) return;
                    var safe = Doc.safeUrl(url);
                    if (!safe) return ui.toast("Ugyldig lenke", "err");
                    area.focus();
                    if (range) {
                      sel.removeAllRanges();
                      sel.addRange(range);
                    }
                    if (range && range.collapsed) document.execCommand("insertText", false, safe);
                    document.execCommand("createLink", false, safe);
                    emit();
                  });
                  return;
                }
                exec(t[0]);
                emit();
              },
            },
          },
          ui.icon(t[1], 16)
        )
      );
    });
    function emit() {
      var clean = Doc.sanitizeRich(area.innerHTML, S.HARD_MAX.rich);
      onInput(clean);
    }
    area.addEventListener("input", emit);
    // Paste as clean formatted text: Word/Docs markup goes through the sanitiser.
    area.addEventListener("paste", function (e) {
      var data = e.clipboardData;
      if (!data) return;
      e.preventDefault();
      var html = data.getData("text/html");
      var text = data.getData("text/plain");
      var clean = html ? Doc.sanitizeRich(html, S.HARD_MAX.rich) : Doc.sanitizeRich(Doc.escapeHtml(text).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>"), S.HARD_MAX.rich);
      document.execCommand("insertHTML", false, clean);
      emit();
    });
    area.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "i")) {
        e.preventDefault();
        exec(e.key === "b" ? "bold" : "italic");
        emit();
      }
    });
    var node = h("div.nx-richwrap" + (o.tall ? ".is-tall" : ""), null, bar, area);
    node.set = function (v) {
      area.innerHTML = Doc.sanitizeRich(v || "", S.HARD_MAX.rich);
    };
    node.area = area;
    return node;
  }

  function richControl(f, value, onChange, ctx) {
    var count = f.max ? counter(f, Doc.plainText(value)) : null;
    var editor = richEditor(value, function (html) {
      if (count) count.update(Doc.plainText(html));
      onChange(html, { from: "panel" });
    }, { tall: true });
    var ai = aiButton(f, function () { return Doc.sanitizeRich(editor.area.innerHTML, S.HARD_MAX.rich); }, function (v) {
      editor.set(v);
      if (count) count.update(Doc.plainText(v));
      onChange(v);
    }, ctx);
    return wrap(f, editor, h("span.nx-field__tools", null, count, ai));
  }

  // ---- url -------------------------------------------------------------------------------
  function urlControl(f, value, onChange) {
    var input = h("input.nx-input", { type: "url", placeholder: "https://", spellcheck: "false" });
    input.value = value || "";
    var state = h("span.nx-url-state");
    var open = h("a.nx-iconlink", { target: "_blank", rel: "noopener", title: "Åpne lenken", hidden: true }, ui.icon("external-link", 15));
    function check() {
      var v = input.value.trim();
      var ok = !v || !!Doc.safeUrl(v);
      state.textContent = v && !ok ? "Ugyldig lenke" : "";
      input.classList.toggle("is-bad", !ok);
      var safe = Doc.safeUrl(v);
      open.hidden = !/^https?:/.test(safe);
      if (!open.hidden) open.href = safe;
    }
    input.addEventListener("input", function () {
      check();
      var safe = Doc.safeUrl(input.value.trim());
      if (safe || !input.value.trim()) onChange(safe, { from: "panel" });
    });
    check();
    return wrap(f, h("div.nx-url", null, input, open), state);
  }

  // ---- media ---------------------------------------------------------------------------
  function mediaControl(f, value, onChange, ctx) {
    var kind = f.type;
    var box = h("div.nx-media-pick");
    function render(v) {
      ui.clear(box);
      var meta = v && ctx.project.assets[v];
      if (meta) {
        var preview = kind === "image"
          ? h("img", { src: ui.thumb(meta, v, 480), alt: "" })
          : meta.poster && ctx.project.assets[meta.poster]
            ? h("img", { src: ui.thumb(ctx.project.assets[meta.poster], meta.poster, 480), alt: "" })
            : h("div.nx-media-pick__vid", null, ui.icon("clapperboard", 28));
        box.appendChild(
          h(
            "div.nx-media-pick__has",
            null,
            h("button.nx-media-pick__thumb", { type: "button", title: "Bytt", on: { click: pick } }, preview),
            h(
              "div.nx-media-pick__meta",
              null,
              h("span.nx-media-pick__name", null, meta.name || (kind === "image" ? "Bilde" : "Video")),
              h("span.nx-muted", null, (meta.w && meta.h ? meta.w + " × " + meta.h : "") + (kind === "image" && !meta.alt ? " · mangler alt-tekst" : "")),
              h(
                "div.nx-row",
                null,
                ui.button("Bytt", { small: true, onClick: pick }),
                ui.button("Fjern", { small: true, kind: "ghost", onClick: function () { onChange(""); render(""); } })
              )
            )
          )
        );
      } else {
        box.appendChild(
          h(
            "button.nx-media-pick__empty",
            { type: "button", on: { click: pick } },
            ui.icon(kind === "image" ? "image-plus" : "clapperboard", 20),
            h("span", null, kind === "image" ? "Velg bilde" : "Velg video")
          )
        );
      }
    }
    function pick() {
      NP.media.pick({ kind: kind }).then(function (id) {
        if (!id) return;
        onChange(id);
        render(id);
      });
    }
    render(value);
    return wrap(f, box);
  }

  // ---- select / toggle / number / color --------------------------------------------------
  function selectControl(f, value, onChange) {
    if (f.options.length <= 3 && f.options.every(function (o) { return o[1].length < 14; })) {
      return wrap(f, ui.segmented(f.options, value, function (v) { onChange(v); }, { label: f.label }));
    }
    var sel = h("select.nx-input.nx-select");
    f.options.forEach(function (o) {
      sel.appendChild(h("option", { value: o[0], selected: o[0] === value }, o[1]));
    });
    sel.addEventListener("change", function () { onChange(sel.value); });
    return wrap(f, sel);
  }

  function toggleControl(f, value, onChange) {
    var input = h("input", { type: "checkbox", checked: !!value });
    input.addEventListener("change", function () { onChange(input.checked); });
    return h("label.nx-switch", { dataset: { key: f.key } }, input, h("span.nx-switch__track", { "aria-hidden": "true" }), h("span", null, f.label));
  }

  function numberControl(f, value, onChange) {
    var range = h("input.nx-range", { type: "range", min: f.min, max: f.max, step: f.step || 1 });
    var num = h("input.nx-input.nx-num", { type: "number", min: f.min, max: f.max, step: f.step || 1 });
    range.value = num.value = value;
    var wide = f.max - f.min <= 200;
    function set(v, from) {
      var n = Math.max(f.min, Math.min(f.max, Number(v)));
      if (!isFinite(n)) return;
      if (from !== range) range.value = n;
      if (from !== num) num.value = n;
      onChange(n, { from: "panel" });
    }
    range.addEventListener("input", function () { set(range.value, range); });
    num.addEventListener("change", function () { set(num.value, num); });
    return wrap(f, wide ? h("div.nx-row", null, range, num) : num);
  }

  function colorControl(f, value, onChange, ctx) {
    var input = h("input.nx-color", { type: "color", value: value || "#ffffff" });
    var hex = h("input.nx-input.nx-hex", { type: "text", value: value || "", placeholder: "fra tema", spellcheck: "false", maxlength: 7 });
    input.addEventListener("input", function () {
      hex.value = input.value;
      onChange(input.value, { from: "panel" });
    });
    hex.addEventListener("change", function () {
      var v = hex.value.trim();
      if (v && !/^#[0-9a-f]{6}$/i.test(v)) return ui.toast("Skriv fargen som #rrggbb", "err");
      if (v) input.value = v;
      onChange(v);
    });
    var swatches = h("div.nx-swatches");
    var theme = ctx && ctx.project && ctx.project.theme;
    if (theme) {
      S.THEME_COLORS.forEach(function (c) {
        var col = theme.colors[c[0]];
        swatches.appendChild(h("button.nx-swatch", {
          type: "button",
          title: c[1] + " " + col,
          style: { background: col },
          on: { click: function () { input.value = col; hex.value = col; onChange(col); } },
        }));
      });
    }
    return wrap(f, h("div.nx-row", null, input, hex, swatches));
  }

  // ---- lists ----------------------------------------------------------------------------------
  function itemSummary(f, item) {
    for (var i = 0; i < f.item.length; i++) {
      var sub = f.item[i];
      if ((sub.type === "text" || sub.type === "textarea") && item[sub.key]) return String(item[sub.key]).slice(0, 60);
    }
    return f.itemLabel || "Element";
  }

  function listControl(f, value, onChange, ctx) {
    var items = (value || []).slice();
    var box = h("div.nx-list");
    var openId = items.length === 1 ? items[0].id : null;

    function commit(next) {
      items = next;
      onChange(next.map(function (it) { return Object.assign({}, it); }));
      render();
    }

    function render() {
      ui.clear(box);
      items.forEach(function (item, i) {
        var isOpen = openId === item.id;
        var card = h("div.nx-list__item" + (isOpen ? ".is-open" : ""));
        var head = h(
          "div.nx-list__head",
          null,
          h("button.nx-list__toggle", {
            type: "button",
            "aria-expanded": String(isOpen),
            on: { click: function () { openId = isOpen ? null : item.id; render(); } },
          }, ui.icon(isOpen ? "chevron-down" : "chevron-right", 15), h("span", null, (i + 1) + ". " + itemSummary(f, item))),
          h(
            "span.nx-list__acts",
            null,
            ui.button("", { icon: "arrow-up", kind: "ghost", small: true, title: "Flytt opp", disabled: i === 0, onClick: function () {
              var n = items.slice();
              n.splice(i - 1, 0, n.splice(i, 1)[0]);
              commit(n);
            } }),
            ui.button("", { icon: "arrow-down", kind: "ghost", small: true, title: "Flytt ned", disabled: i === items.length - 1, onClick: function () {
              var n = items.slice();
              n.splice(i + 1, 0, n.splice(i, 1)[0]);
              commit(n);
            } }),
            ui.button("", { icon: "trash", kind: "ghost", small: true, title: "Fjern", onClick: function () {
              commit(items.filter(function (x) { return x.id !== item.id; }));
            } })
          )
        );
        card.appendChild(head);
        if (isOpen) {
          var body = h("div.nx-list__body");
          f.item.forEach(function (sub) {
            body.appendChild(
              control(sub, item[sub.key], function (v, o) {
                items = items.map(function (x) {
                  if (x.id !== item.id) return x;
                  var c = Object.assign({}, x);
                  c[sub.key] = v;
                  return c;
                });
                onChange(items, o);
              }, Object.assign({}, ctx, { path: f.key + "." + item.id + "." + sub.key }))
            );
          });
          card.appendChild(body);
        }
        box.appendChild(card);
      });
      if (!f.maxItems || items.length < f.maxItems) {
        box.appendChild(
          ui.button("Legg til " + (f.itemLabel || "element").toLowerCase(), {
            icon: "plus",
            small: true,
            kind: "ghost",
            cls: "nx-list__add",
            onClick: function () {
              var fresh = Doc.normalizeField(f, [{}], { assets: ctx.project.assets })[0];
              openId = fresh.id;
              commit(items.concat([fresh]));
            },
          })
        );
      }
    }
    render();
    return wrap(f, box, h("span.nx-muted", null, items.length + (f.maxItems ? " / " + f.maxItems : "")));
  }

  // ---- dispatch ----------------------------------------------------------------------------
  function control(f, value, onChange, ctx) {
    switch (f.type) {
      case "text":
      case "textarea":
        return textControl(f, value, onChange, ctx);
      case "rich":
        return richControl(f, value, onChange, ctx);
      case "url":
        return urlControl(f, value, onChange, ctx);
      case "image":
      case "video":
        return mediaControl(f, value, onChange, ctx);
      case "select":
        return selectControl(f, value, onChange, ctx);
      case "toggle":
        return toggleControl(f, value, onChange, ctx);
      case "number":
        return numberControl(f, value, onChange, ctx);
      case "color":
        return colorControl(f, value, onChange, ctx);
      case "list":
        return listControl(f, value, onChange, ctx);
      default:
        return h("div");
    }
  }

  /** Is the field visible given the other values (schema `when`)? */
  function visible(f, values) {
    if (!f.when) return true;
    return Object.keys(f.when).every(function (k) {
      return values[k] === f.when[k];
    });
  }

  NP.fields = { control: control, visible: visible, richEditor: richEditor, counter: counter };
})();
