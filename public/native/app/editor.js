/* =========================================================================
   app/editor.js — the editor screen for one project.

     top bar   back, project name, save state, undo/redo, page switcher,
               device width, AI, preview, review, export
     left      panels: Seksjoner · AI-assistent · Medier · Tema · Prosjekt · Kontroll ·
               Gjennomgang
     middle    the live page (canvas.js)
     right     the selected section's properties (props.js)

   Keyboard: Ctrl+Z / Ctrl+Shift+Z undo/redo, Ctrl+S save now,
   Delete removes the selected section, Escape deselects, 1/2/3 switch device,
   Ctrl+C / Ctrl+V copy and paste a section (with Alt: only its style),
   Ctrl+D duplicates, Alt+↑/↓ moves the selected section.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var D = window.NativeDoc;

  var PANELS = [
    ["sections", "Seksjoner", "layers"],
    ["assistant", "AI-assistent", "sparkles"],
    ["media", "Medier", "images"],
    ["theme", "Tema", "palette"],
    ["extras", "Side", "panels-top-left"],
    ["project", "Prosjekt", "settings"],
    ["check", "Kontroll", "list-checks"],
    ["review", "Gjennomgang", "message-square"],
  ];

  var SAVE_TEXT = { saved: "Lagret", dirty: "Ikke lagret", saving: "Lagrer …", error: "Kunne ikke lagre", conflict: "Endret av andre" };

  var current = null;

  function open(id, host, topbar) {
    ui.clear(host);
    host.appendChild(h("div.nx-loading", null, ui.spinner(), " Åpner prosjektet …"));
    return close().then(function () {
      return NP.api.project(id);
    }).then(function (r) {
      build(r.project, host, topbar);
    }, function (err) {
      ui.clear(host);
      host.appendChild(ui.empty("circle-alert", "Kunne ikke åpne prosjektet", err.message, ui.button("Til prosjektene", { onClick: function () { location.hash = "#/"; } })));
    });
  }

  function build(project, host, topbar) {
    NP.store.load(project);
    ui.clear(host);
    ui.clear(topbar);
    var panelName = "sections";
    var panelNode = null;
    var badges = {};

    // ---- top bar ---------------------------------------------------------------
    var name = h("input.nx-title", { type: "text", value: project.name, "aria-label": "Prosjektnavn", maxlength: 120 });
    name.addEventListener("change", function () {
      var v = name.value.trim() || "Uten navn";
      NP.store.update(function (p) { return Object.assign({}, p, { name: v }); });
    });
    var saveState = h("span.nx-save");
    var undo = ui.button("", { icon: "undo-2", kind: "ghost", title: "Angre (Ctrl+Z)", onClick: function () { NP.store.undo(); } });
    var redo = ui.button("", { icon: "redo-2", kind: "ghost", title: "Gjør om (Ctrl+Shift+Z)", onClick: function () { NP.store.redo(); } });
    var pageSel = h("select.nx-input.nx-select.nx-select--sm.nx-pagesel", { "aria-label": "Side" });
    pageSel.addEventListener("change", function () { NP.store.setPage(pageSel.value); });
    var device = ui.segmented(
      [["desktop", "", "monitor", "Desktop (1)"], ["tablet", "", "tablet", "Nettbrett (2)"], ["mobile", "", "smartphone", "Mobil (3)"]],
      "desktop",
      function (v) { NP.store.setDevice(v); },
      { iconOnly: true, label: "Skjermstørrelse" }
    );
    var status = h("span.nx-status");

    topbar.appendChild(
      h(
        "div.nx-edbar",
        null,
        h("a.nx-btn.nx-btn--ghost.nx-btn--sm", { href: "#/", title: "Alle prosjekter" }, ui.icon("arrow-left", 16)),
        h("div.nx-edbar__name", null, name, h("div.nx-edbar__meta", null, status, saveState)),
        h("div.nx-edbar__mid", null, undo, redo, h("span.nx-sep"), pageSel, device),
        h(
          "div.nx-edbar__right",
          null,
          ui.button("AI", { icon: "sparkles", cls: "nx-btn--ai", title: "Lag siden med AI, eller be AI-assistenten om endringer", onClick: function () {
            // An empty page starts the wizard; a page with content opens the assistant.
            if (NP.store.page().sections.length) openPanel("assistant");
            else NP.ai.open();
          } }),
          ui.button("Forhåndsvis", { icon: "eye", kind: "ghost", title: "Åpne siden i en ny fane", onClick: preview }),
          ui.button("Del", { icon: "send", kind: "ghost", title: "Send til gjennomgang", onClick: function () { openPanel("review"); } }),
          ui.button("Eksporter", { icon: "download", kind: "primary", onClick: function () { NP.publish.dialog(); } })
        )
      )
    );

    function preview() {
      NP.store.save().then(function () {
        window.open(NP.api.previewUrl(NP.store.get().project.id, NP.store.page().slug), "_blank", "noopener");
      });
    }

    // ---- layout ---------------------------------------------------------------------
    var rail = h("nav.nx-rail", { "aria-label": "Paneler" });
    var panelBox = h("div.nx-panel");
    var panelHead = h("h2.nx-panel__title");
    var panelBody = h("div.nx-panel__body");
    panelBox.appendChild(panelHead);
    panelBox.appendChild(panelBody);
    var center = h("div.nx-center");
    var right = h("aside.nx-right", { "aria-label": "Egenskaper" });
    host.appendChild(h("div.nx-editor", null, rail, panelBox, center, right));

    PANELS.forEach(function (pn) {
      var b = h("button.nx-rail__btn", { type: "button", title: pn[1], dataset: { panel: pn[0] }, on: { click: function () { openPanel(pn[0]); } } },
        ui.icon(pn[2], 20), h("span", null, pn[1]), h("span.nx-badge", { hidden: true }));
      rail.appendChild(b);
    });

    function openPanel(nameKey) {
      panelName = nameKey;
      if (panelNode && panelNode.destroy) panelNode.destroy();
      ui.clear(panelBody);
      Array.prototype.forEach.call(rail.children, function (b) { b.classList.toggle("is-active", b.dataset.panel === nameKey); });
      var def = PANELS.filter(function (p) { return p[0] === nameKey; })[0];
      panelHead.textContent = def ? def[1] : "";
      if (nameKey === "sections") panelNode = NP.sections.panel();
      if (nameKey === "assistant") panelNode = NP.assistant.panel();
      if (nameKey === "media") panelNode = NP.media.grid({});
      if (nameKey === "theme") panelNode = NP.theme.panel();
      if (nameKey === "extras") panelNode = NP.extras.panel();
      if (nameKey === "project") panelNode = NP.projectPanel.panel();
      if (nameKey === "check") panelNode = NP.preflight.panel();
      if (nameKey === "review") panelNode = NP.review.panel();
      panelBody.appendChild(panelNode);
    }

    function setBadge(nameKey, n) {
      badges[nameKey] = n;
      var b = rail.querySelector('[data-panel="' + nameKey + '"] .nx-badge');
      if (!b) return;
      b.hidden = !n;
      b.textContent = String(n);
    }

    var canvas = NP.canvas.create(center);
    var props = NP.propsPanel.create(right);
    NP.props = props;

    // ---- reacting to the store --------------------------------------------------------
    function syncBar(state) {
      saveState.textContent = SAVE_TEXT[state.save] || "";
      saveState.className = "nx-save is-" + state.save;
      saveState.title = state.error || "";
      undo.disabled = !NP.store.canUndo();
      redo.disabled = !NP.store.canRedo();
      status.textContent = D.STATUS_LABELS[state.project.status] || "";
      status.className = "nx-status is-" + state.project.status;
      if (document.activeElement !== name) name.value = state.project.name;
      ui.clear(pageSel);
      state.project.pages.forEach(function (pg) {
        pageSel.appendChild(h("option", { value: pg.id, selected: pg.id === state.pageId }, pg.label));
      });
      pageSel.hidden = state.project.pages.length < 2;
      device.set(state.device);
      document.title = state.project.name + " · Native Premium";
    }

    var conflictShown = false;
    var unsub = NP.store.subscribe(function (state, change) {
      syncBar(state);
      if (change.kind === "save" && state.save === "conflict" && !conflictShown) {
        conflictShown = true;
        var m = ui.modal({
          title: "Prosjektet er endret av noen andre",
          sticky: true,
          body: h("p", null, "En kollega har lagret prosjektet etter at du åpnet det. Endringene dine er ikke lagret, for å unngå at noens arbeid blir overskrevet. Last inn på nytt for å se den nyeste versjonen (kopier gjerne teksten du skrev først)."),
          actions: [
            ui.button("Bli her", { kind: "ghost", onClick: function () { m.close(); } }),
            ui.button("Last inn på nytt", { kind: "primary", onClick: function () { m.close(); location.reload(); } }),
          ],
        });
      }
      if (change.kind === "select" && state.selected && panelName !== "sections" && window.innerWidth < 1300) {
        /* keep the chosen panel; the right panel shows the section */
      }
    });
    syncBar(NP.store.get());
    openPanel("sections");

    // Count open comments for the badge.
    NP.api.comments(project.id).then(function (d) {
      setBadge("review", d.comments.filter(function (c) { return !c.parent && !c.resolved; }).length);
    }).catch(function () {});

    // ---- keyboard ------------------------------------------------------------------------
    function onKey(e) {
      if (document.querySelector(".nx-modal-bg")) return;
      var typing = window.WPE.util.isTyping(e.target);
      var mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        NP.store.save().then(function () { ui.toast("Lagret", "ok"); });
        return;
      }
      if (typing) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) NP.store.redo();
        else NP.store.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        NP.store.redo();
        return;
      }
      var sel = NP.store.get().selected;
      if (mod && e.key.toLowerCase() === "c" && sel && !hasTextSelection()) {
        e.preventDefault();
        if (e.altKey) NP.sections.copyStyle(sel);
        else NP.sections.copy(sel);
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        if (e.altKey && sel) NP.sections.pasteStyle(sel);
        else NP.sections.paste(sel);
        return;
      }
      if (mod && e.key.toLowerCase() === "d" && sel) {
        e.preventDefault();
        NP.store.duplicateSection(sel);
        return;
      }
      if (sel && e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        var secs = NP.store.page().sections;
        var at = secs.findIndex(function (x) { return x.id === sel; });
        var to = at + (e.key === "ArrowUp" ? -1 : 1);
        if (to >= 0 && to < secs.length) NP.store.moveSection(sel, to);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        NP.sections.remove(sel);
      }
      if (e.key === "Escape" && sel) NP.store.select(null);
      if (e.key === "1") NP.store.setDevice("desktop");
      if (e.key === "2") NP.store.setDevice("tablet");
      if (e.key === "3") NP.store.setDevice("mobile");
    }
    document.addEventListener("keydown", onKey);

    current = {
      destroy: function () {
        document.removeEventListener("keydown", onKey);
        unsub();
        canvas.destroy();
        props.destroy();
        if (panelNode && panelNode.destroy) panelNode.destroy();
      },
    };
    NP.editor.openPanel = openPanel;
    NP.editor.setBadge = setBadge;
    NP.editor.canvas = canvas;
  }

  function hasTextSelection() {
    var sel = window.getSelection && window.getSelection();
    return !!(sel && String(sel).length);
  }

  function close() {
    var p = Promise.resolve();
    if (current) {
      current.destroy();
      current = null;
      p = NP.store.close();
    }
    return p;
  }

  NP.editor = { open: open, close: close, openPanel: function () {}, setBadge: function () {} };
})();
