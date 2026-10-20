/* =========================================================================
   app/editor.js — the editor screen for one project.

     top bar   back, project name, save state, undo/redo, page switcher,
               device width, AI, preview, review, export
     left      panels: Seksjoner · AI-assistent · Medier · Tema · Prosjekt · Kontroll ·
               Gjennomgang
     middle    the live page (canvas.js)
     right     the selected section's properties (props.js)

   Keyboard: see shortcuts.js ("?" lists them). Keys pressed inside the
   preview frame reach the same handler.

   When a colleague saved first (409), a banner stays over the page until
   the user reloads or keeps their version as a copy: nothing more is saved
   in the meantime, and leaving the page warns.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var D = window.NativeDoc;

  // [key, name, icon, what the panel is for]
  var PANELS = [
    ["sections", "Seksjoner", "layers", "Sidens innhold i rekkefølge. Dra for å flytte, klikk for å redigere."],
    ["assistant", "AI-assistent", "sparkles", "Be AI-en om endringer i tekst, rekkefølge eller design."],
    ["media", "Medier", "images", "Bilder og video i prosjektet. Gi hvert bilde en alt-tekst."],
    ["theme", "Tema", "palette", "Farger, skrifter og logo for hele siden."],
    ["extras", "Side", "panels-top-left", "Lesefremdrift, kapittelmeny, flytende knapp og avslutning."],
    ["project", "Prosjekt", "settings", "Annonsør, varianter og hvordan siden ser ut når den deles."],
    ["check", "Kontroll", "list-checks", "Det som bør rettes før siden sendes eller eksporteres."],
    ["review", "Gjennomgang", "message-square", "Annonsørens kommentarer, godkjenning og tidligere versjoner."],
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
    var motion = h("button.nx-btn.nx-btn--ghost.nx-motion", {
      type: "button",
      title: "Vis siden slik den ser ut med «redusert bevegelse» slått på",
      "aria-label": "Redusert bevegelse",
      "aria-pressed": "false",
      on: { click: function () {
        var on = motion.getAttribute("aria-pressed") !== "true";
        motion.setAttribute("aria-pressed", String(on));
        canvas.setReducedMotion(on);
      } },
    }, ui.icon("pause", 15), h("span", null, "Redusert bevegelse"));

    topbar.appendChild(
      h(
        "div.nx-edbar",
        null,
        h("a.nx-btn.nx-btn--ghost", { href: "#/", title: "Alle prosjekter", "aria-label": "Tilbake til alle prosjekter" }, ui.icon("arrow-left", 16)),
        h("div.nx-edbar__name", null, name, h("div.nx-edbar__meta", null, status, saveState)),
        h("div.nx-edbar__mid", null,
          h("div.nx-edbar__group", { role: "group", "aria-label": "Historikk" }, undo, redo),
          h("span.nx-sep", { "aria-hidden": "true" }),
          h("div.nx-edbar__group", { role: "group", "aria-label": "Visning" }, pageSel, device, motion)),
        h(
          "div.nx-edbar__right",
          null,
          ui.button("AI", { icon: "sparkles", cls: "nx-btn--ai", title: "Lag siden med AI, eller be AI-assistenten om endringer", onClick: function () {
            // An empty page starts the wizard; a page with content opens the assistant.
            if (NP.store.page().sections.length) openPanel("assistant");
            else NP.ai.open();
          } }),
          ui.button("", { icon: "keyboard", kind: "ghost", title: "Hurtigtaster (?)", onClick: function () { NP.shortcuts.open(); } }),
          h("span.nx-sep", { "aria-hidden": "true" }),
          ui.button("Forhåndsvis", { icon: "eye", kind: "ghost", title: "Åpne siden i en ny fane", onClick: preview }),
          ui.button("Del", { icon: "send", kind: "ghost", title: "Send til gjennomgang", onClick: function () { openPanel("review"); } }),
          ui.button("Eksporter", { icon: "download", kind: "primary", title: "Eksporter eller publiser siden", onClick: function () { NP.publish.dialog(); } })
        )
      )
    );

    // The tab is opened right away, inside the click: a window opened after
    // the save (asynchronously) is blocked as a popup by Safari and Firefox.
    function preview() {
      var url = NP.api.previewUrl(NP.store.get().project.id, NP.store.page().slug);
      var win = window.open("", "_blank");
      if (win) {
        win.opener = null;
        win.document.title = "Forhåndsvisning";
        win.document.body.textContent = "Lagrer og åpner forhåndsvisningen …";
      }
      NP.store.save().then(function () {
        if (win) win.location.replace(url);
        else window.open(url, "_blank", "noopener");
      }, function (err) {
        if (win) win.close();
        ui.toast(err.message, "err");
      });
    }

    // ---- layout ---------------------------------------------------------------------
    var rail = h("nav.nx-rail", { "aria-label": "Paneler" });
    var panelBox = h("div.nx-panel");
    var panelTitle = h("h2.nx-panel__title");
    var panelDesc = h("p.nx-panel__desc");
    var panelHead = h("header.nx-panel__head", null, panelTitle, panelDesc);
    var panelBody = h("div.nx-panel__body");
    panelBox.appendChild(panelHead);
    panelBox.appendChild(panelBody);
    var center = h("div.nx-center");
    var conflictBar = h("div.nx-conflict", { role: "alert", hidden: true },
      ui.icon("triangle-alert", 18),
      h("div.nx-conflict__text", null,
        h("strong", null, "En kollega har lagret en nyere versjon."),
        h("span", null, " Endringene dine blir ikke lagret herfra. Last inn på nytt for å se den nyeste – eller ta vare på din versjon som et eget prosjekt.")),
      h("div.nx-conflict__acts", null,
        ui.button("Lagre min versjon som kopi", { small: true, onClick: saveCopy }),
        ui.button("Last inn på nytt", { small: true, kind: "primary", onClick: reload })));
    center.appendChild(conflictBar);
    var right = h("aside.nx-right", { "aria-label": "Egenskaper" });
    host.appendChild(h("div.nx-editor", null, rail, panelBox, center, right));

    PANELS.forEach(function (pn) {
      var b = h("button.nx-rail__btn", { type: "button", title: pn[1] + " – " + pn[3], "aria-pressed": "false", dataset: { panel: pn[0] }, on: { click: function () { openPanel(pn[0]); } } },
        ui.icon(pn[2], 20), h("span.nx-rail__label", null, pn[1]), h("span.nx-badge", { hidden: true }));
      rail.appendChild(b);
    });

    function openPanel(nameKey) {
      panelName = nameKey;
      if (panelNode && panelNode.destroy) panelNode.destroy();
      ui.clear(panelBody);
      Array.prototype.forEach.call(rail.children, function (b) {
        b.classList.toggle("is-active", b.dataset.panel === nameKey);
        b.setAttribute("aria-pressed", String(b.dataset.panel === nameKey));
      });
      var def = PANELS.filter(function (p) { return p[0] === nameKey; })[0];
      panelTitle.textContent = def ? def[1] : "";
      panelDesc.textContent = def ? def[3] : "";
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

    var canvas = NP.canvas.create(center, { onKey: function (e, win) { NP.shortcuts.handle(e, win); } });
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
      status.className = "nx-status badge is-" + state.project.status;
      conflictBar.hidden = state.save !== "conflict";
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
          body: h("p", null, "En kollega har lagret prosjektet etter at du åpnet det. Endringene dine er ikke lagret, for å unngå at noens arbeid blir overskrevet. Last inn på nytt for å se den nyeste versjonen, eller lagre din versjon som et eget prosjekt så ingenting går tapt."),
          actions: [
            ui.button("Bli her", { kind: "ghost", onClick: function () { m.close(); } }),
            ui.button("Lagre min versjon som kopi", { onClick: function () { m.close(); saveCopy(); } }),
            ui.button("Last inn på nytt", { kind: "primary", onClick: function () { m.close(); reload(); } }),
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
      NP.shortcuts.handle(e, window);
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

  /** After a conflict: keep this editor's state as a project of its own, and open it. */
  function saveCopy() {
    NP.store.saveAsCopy().then(function (p) {
      ui.toast("Din versjon er lagret som «" + p.name + "»", "ok");
      // Nothing is lost now: close without the "not saved" question, then open the copy.
      return NP.store.close().then(function () { location.hash = "#/p/" + p.id; });
    }).catch(function (err) {
      ui.toast(err.message, "err");
    });
  }

  /** Reload without the "leave page?" question: the user chose to drop the unsaved edits. */
  function reload() {
    NP.store.close().then(function () { location.reload(); });
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
