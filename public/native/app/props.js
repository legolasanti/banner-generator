/* =========================================================================
   app/props.js — the right-hand panel: everything about the selected
   section, generated from its schema.

     Innhold    the block's own fields
     Stil       background, spacing, alignment, entrance animation — the
                spacing and alignment can differ on tablet and mobile
     Synlighet  hide on desktop / tablet / mobile

   While the user types here the canvas updates; the form itself is only
   rebuilt when something ELSE changed the section (undo, editing in place,
   AI), so the caret never jumps.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var S = window.NativeSchema;
  var D = window.NativeDoc;

  var DEV_LABEL = { desktop: "Desktop", tablet: "Nettbrett", mobile: "Mobil" };

  function create(host) {
    var root = h("div.nx-props");
    host.appendChild(root);
    var tab = "content";
    var shownFor = null;

    function project() {
      return NP.store.get().project;
    }

    function section() {
      var sel = NP.store.get().selected;
      var f = sel && D.findSection(project(), sel);
      return f ? f.section : null;
    }

    function empty() {
      ui.clear(root);
      root.appendChild(
        h(
          "div.nx-props__empty",
          null,
          ui.icon("mouse-pointer-click", 28),
          h("h3", null, "Velg en seksjon"),
          h("p", null, "Klikk på en del av siden for å redigere den. Dobbeltklikk på en tekst for å skrive rett på siden."),
          h(
            "div.nx-stack.nx-stack--sm",
            null,
            ui.button("Tema og farger", { icon: "palette", onClick: function () { NP.editor.openPanel("theme"); } }),
            ui.button("Prosjekt og deling", { icon: "settings", onClick: function () { NP.editor.openPanel("project"); } })
          )
        )
      );
    }

    function draw() {
      var s = section();
      shownFor = s ? s.id : null;
      if (!s) return empty();
      ui.clear(root);
      var block = S.BLOCKS[s.type];
      var device = NP.store.get().device;
      root.appendChild(
        h(
          "div.nx-props__head",
          null,
          h("span.nx-props__icon", null, ui.icon(block.icon, 18)),
          h("div", null, h("h3", null, block.label), h("p.nx-muted", null, block.desc)),
          ui.button("", { icon: "x", kind: "ghost", small: true, title: "Lukk", onClick: function () { NP.store.select(null); } })
        )
      );
      var tabs = ui.segmented(
        [["content", "Innhold"], ["style", "Stil"], ["show", "Synlighet"]],
        tab,
        function (v) { tab = v; draw(); },
        { small: true, label: "Faner" }
      );
      root.appendChild(h("div.nx-props__tabs", null, tabs));
      var body = h("div.nx-props__body");
      root.appendChild(body);
      if (tab === "content") contentTab(body, s);
      if (tab === "style") styleTab(body, s, device);
      if (tab === "show") showTab(body, s);
    }

    function contentTab(body, s) {
      var ctx = { project: project(), type: s.type, ai: NP.aiConfigured && S.BLOCKS[s.type].ai !== false };
      S.fieldsOf(s.type).forEach(function (f) {
        if (!NP.fields.visible(f, s.props)) return;
        var fieldCtx = Object.assign({}, ctx, { ai: ctx.ai && f.ai !== false, path: f.key });
        body.appendChild(
          NP.fields.control(f, s.props[f.key], function (v, opts) {
            NP.store.setField(s.id, f.key, v, opts);
            // Fields that show/hide others need the form redrawn.
            if (f.type === "select" || f.type === "toggle") requestAnimationFrame(draw);
          }, fieldCtx)
        );
      });
      if (s.type === "hero" && !s.props.image && !s.props.video) {
        body.insertBefore(h("p.nx-note", null, ui.icon("info", 15), " Uten bilde eller video vises tittelen på hvit bakgrunn."), body.firstChild);
      }
      if (s.type === "cta" && !s.props.url) {
        body.insertBefore(h("p.nx-note.nx-note--warn", null, ui.icon("circle-alert", 15), " Knappen mangler lenke."), body.firstChild);
      }
    }

    function styleTab(body, s, device) {
      var notMain = device !== "desktop";
      body.appendChild(
        h(
          "div.nx-row.nx-row--tight",
          null,
          ui.button("Kopier stil", { small: true, kind: "ghost", icon: "copy", title: "Kopier stilen (Alt+Ctrl+C)", onClick: function () { NP.sections.copyStyle(s.id); } }),
          ui.button("Lim inn stil", { small: true, kind: "ghost", icon: "clipboard-paste", title: "Lim inn stil (Alt+Ctrl+V)", disabled: !NP.sections.hasStyle(), onClick: function () { NP.sections.pasteStyle(s.id); draw(); } })
        )
      );
      if (notMain) {
        body.appendChild(
          h(
            "p.nx-note",
            null,
            ui.icon(device === "mobile" ? "smartphone" : "tablet", 15),
            " Du redigerer " + DEV_LABEL[device].toLowerCase() + "-visningen. Felt merket ",
            h("span.nx-dot"),
            " kan være annerledes her; resten gjelder alle skjermer."
          )
        );
      }
      var effective = D.styleFor(s, device);
      var lastGroup = null;
      S.STYLE_FIELDS.forEach(function (f) {
        if (!NP.fields.visible(f, effective)) return;
        if (f.group && f.group !== lastGroup) {
          lastGroup = f.group;
          body.appendChild(h("h4.nx-group", null, f.group));
        }
        var overridden = notMain && f.rs && s.rs[device] && s.rs[device].style && s.rs[device].style[f.key] !== undefined;
        var node = NP.fields.control(f, effective[f.key], function (v, opts) {
          NP.store.setStyle(s.id, f.key, v, f.rs ? device : "desktop");
          if (f.type === "select" || f.type === "toggle" || f.type === "image" || f.type === "video" || (opts && opts.from !== "panel")) requestAnimationFrame(draw);
        }, { project: project() });
        if (notMain && f.rs) {
          node.classList.add("is-rs");
          var head = node.querySelector(".nx-field__head");
          if (head) {
            head.appendChild(h("span.nx-dot" + (overridden ? ".is-on" : ""), { title: overridden ? "Egen verdi på " + DEV_LABEL[device].toLowerCase() : "Arver fra større skjerm" }));
            if (overridden) {
              head.appendChild(ui.button("Tilbakestill", { small: true, kind: "ghost", onClick: function () {
                NP.store.setStyle(s.id, f.key, null, device);
                requestAnimationFrame(draw);
              } }));
            }
          }
        }
        body.appendChild(node);
      });
    }

    function showTab(body, s) {
      body.appendChild(h("p.nx-muted", null, "Skjul seksjonen på enkelte skjermer, f.eks. en liggende video på mobil når du har en egen stående versjon."));
      ["desktop", "tablet", "mobile"].forEach(function (d) {
        var input = h("input", { type: "checkbox", checked: !s.hide[d] });
        input.addEventListener("change", function () { NP.store.setHidden(s.id, d, !input.checked); });
        body.appendChild(h("label.nx-switch", null, input, h("span.nx-switch__track", { "aria-hidden": "true" }), h("span", null, "Vis på " + DEV_LABEL[d].toLowerCase())));
      });
      var name = h("input.nx-input", { type: "text", value: s.name || "", placeholder: S.BLOCKS[s.type].label, maxlength: 60 });
      name.addEventListener("input", function () {
        NP.store.updateSection(s.id, function (x) { return Object.assign({}, x, { name: name.value }); }, { group: "name:" + s.id, from: "panel" });
      });
      body.appendChild(h("label.nx-field", null, h("span.nx-field__label", null, "Internt navn (vises bare i editoren)"), name));
    }

    var unsub = NP.store.subscribe(function (state, change) {
      if (change.kind === "select" || change.kind === "page" || change.kind === "load") {
        if (change.kind === "select") tab = "content";
        return draw();
      }
      if (change.kind === "device" && tab === "style") return draw();
      if (change.kind === "project" && change.from !== "panel") {
        var sel = state.selected;
        if (!sel) return;
        if (sel !== shownFor || change.undo || (change.sections && change.sections.indexOf(sel) !== -1 && change.from !== "frame")) draw();
      }
    });

    draw();
    return {
      refresh: draw,
      focusField: function (path) {
        var key = String(path).split(".")[0];
        var node = root.querySelector('.nx-field[data-key="' + key + '"]');
        if (!node) return;
        node.scrollIntoView({ block: "nearest", behavior: "smooth" });
        node.classList.add("is-flash");
        setTimeout(function () { node.classList.remove("is-flash"); }, 900);
      },
      destroy: function () {
        unsub();
        root.remove();
      },
    };
  }

  NP.propsPanel = { create: create };
})();
