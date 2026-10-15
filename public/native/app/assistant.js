/* =========================================================================
   app/assistant.js — the "AI-assistent" panel: change the page in plain
   words after it exists ("kortere ingress", "flytt sitatet opp", "legg til
   en FAQ om lading", "mørkegrønn primærfarge").

   Each message goes to /api/native/ai/revise with the conversation so far
   and the selected section. The server reads the saved page (its "code":
   sections, props, style, theme, page options, custom CSS), asks the model,
   validates every operation and sends back the new page. The panel applies
   it as one undoable step and lists what changed; "Angre" restores the page
   exactly as it was before that message. When something is unclear or a
   fact is missing, the AI asks instead of guessing — the questions come
   with clickable answers.

   "Vis koden" shows what the AI sees (the page as JSON) and the HTML the
   page renders to. The conversation is kept in project.ai.chat.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var S = window.NativeSchema;

  var MAX_HISTORY = 10;
  // One request at a time, across panel re-opens: { projectId }.
  var inflight = null;
  var SUGGESTIONS = [
    "Gjør ingressen kortere og mer konkret",
    "Rett språkfeil og norsk typografi på hele siden",
    "Legg til en faktaboks med de viktigste tallene",
    "Gjør heroen mørkere og mer dramatisk",
    "Mer luft mellom seksjonene",
    "Skriv tre nye forslag til tittel",
  ];
  var OP_ICON = { update: "pencil", insert: "plus", delete: "trash", move: "arrow-up-down", style: "paintbrush", theme: "palette", extras: "panels-top-left", css: "code" };

  function project() {
    return NP.store.get().project;
  }

  function chat() {
    var ai = project().ai || {};
    return Array.isArray(ai.chat) ? ai.chat : [];
  }

  function saveChat(messages, extra) {
    NP.store.update(function (p) {
      return Object.assign({}, p, { ai: Object.assign({}, p.ai || {}, { chat: messages.slice(-40) }, extra || {}) });
    }, { history: false });
  }

  function sectionLabel(id) {
    var page = NP.store.page();
    var i = page.sections.findIndex(function (s) { return s.id === id; });
    if (i === -1) return null;
    var sec = page.sections[i];
    return (i + 1) + ". " + (sec.name || S.BLOCKS[sec.type].label);
  }

  /** What restores the page to how it was before one AI change. */
  function snapshot() {
    var p = project();
    return { pageId: NP.store.get().pageId, sections: NP.store.page().sections, theme: p.theme, extras: p.extras };
  }

  /** Everything an AI answer may replace: this page's sections, the theme and the page options. */
  function stateKey() {
    var p = project();
    return JSON.stringify([NP.store.page().sections, p.theme, p.extras]);
  }

  // ---- the code view ----------------------------------------------------------------
  function codeView() {
    var p = project();
    var page = NP.store.page();
    var full = JSON.stringify({ sections: page.sections, theme: p.theme, extras: p.extras }, null, 2);
    var html = "";
    try {
      html = NP.tplGallery.documentFor(Object.assign({}, p, { pages: [page] }));
    } catch (err) {
      html = "<!-- Kunne ikke lage HTML: " + err.message + " -->";
    }
    var aiView = null;
    var tab = "ai";
    var pre = h("pre.nx-code");
    function show() {
      if (tab === "ai") pre.textContent = aiView === null ? "Henter …" : aiView;
      else pre.textContent = tab === "full" ? full : html;
    }
    var seg = ui.segmented([["ai", "Det AI-en ser"], ["full", "Full struktur"], ["html", "HTML"]], tab, function (v) { tab = v; show(); }, { small: true });
    show();
    NP.store.save().then(function () {
      return NP.api.ai("view", { projectId: p.id, pageId: NP.store.get().pageId });
    }).then(function (r) {
      aiView = "// Bildene (korte ID-er)\n// " + (r.images || "(ingen)").split("\n").join("\n// ") + "\n\n" + JSON.stringify(r.page, null, 2);
      show();
    }, function (err) {
      aiView = "Kunne ikke hente: " + err.message;
      show();
    });
    var m = ui.modal({
      title: "Koden bak siden",
      wide: true,
      body: h("div.nx-stack", null,
        h("p.nx-muted", null, "«Det AI-en ser» er nøyaktig det AI-assistenten leser og endrer: seksjonene i rekkefølge med id, type, innhold og stil som avviker fra standard, pluss tema, sidevalg og egen CSS. «Full struktur» er hele det lagrede dokumentet. HTML er det siden blir til (bilder lenkes fra appen her)."),
        seg, pre),
      actions: [
        ui.button("Kopier", { icon: "copy", kind: "ghost", onClick: function () {
          navigator.clipboard.writeText(pre.textContent).then(function () { ui.toast("Kopiert", "ok"); }, function () { ui.toast("Kunne ikke kopiere", "err"); });
        } }),
        ui.button("Lukk", { kind: "primary", onClick: function () { m.close(); } }),
      ],
    });
  }

  // ---- the panel ----------------------------------------------------------------------
  function panel() {
    var root = h("div.nx-asst");
    if (!NP.aiConfigured) {
      root.appendChild(ui.empty("sparkles", "AI er ikke satt opp", "Legg OPENROUTER_API_KEY i .env og start appen på nytt.", ui.button("Slik gjør du", { onClick: function () { NP.ai.notConfigured(); } })));
      return root;
    }

    var tier = (project().ai && project().ai.tier) || null;
    var busy = !!inflight;
    var lastUndo = null; // { snapshot, applied (stateKey after applying), index }
    var log = h("div.nx-asst__log", { "aria-live": "polite" });
    var scope = h("div.nx-asst__scope");
    var input = h("textarea.nx-input.nx-textarea.nx-asst__input", { rows: 3, placeholder: "Hva vil du endre? F.eks. «Gjør tittelen kortere» eller «Flytt sitatet opp under heroen»" });
    var send = ui.button("Send", { kind: "primary", icon: "send", cls: "nx-btn--ai", onClick: function () { submit(input.value); } });
    var status = h("div.nx-asst__status");

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit(input.value);
      }
      e.stopPropagation(); // keep editor shortcuts (Delete, 1/2/3 …) out of the text box
    });

    var head = h("div.nx-asst__head", null,
      NP.ai.tierPicker(tier, function (v, initial) {
        tier = v;
        if (!initial) NP.store.update(function (p) { return Object.assign({}, p, { ai: Object.assign({}, p.ai || {}, { tier: v }) }); }, { history: false });
      }, { small: true, compact: true }),
      ui.button("", { icon: "code", small: true, kind: "ghost", title: "Vis koden bak siden", onClick: codeView }),
      ui.button("", { icon: "trash", small: true, kind: "ghost", title: "Tøm samtalen", onClick: function () {
        if (!chat().length) return;
        ui.confirm("Tømme samtalen?", "Endringene på siden blir stående. Bare meldingene forsvinner.", "Tøm").then(function (ok) {
          if (!ok) return;
          lastUndo = null;
          saveChat([]);
          draw();
        });
      } })
    );

    root.appendChild(head);
    root.appendChild(log);
    root.appendChild(h("div.nx-asst__compose", null, scope, input, h("div.nx-asst__actions", null, status, send),
      h("p.nx-help", null, "Ctrl/⌘ + Enter sender. Velg en seksjon på siden for å si «denne».")));

    function drawScope() {
      ui.clear(scope);
      var sel = NP.store.get().selected;
      var label = sel ? sectionLabel(sel) : null;
      scope.appendChild(h("span.nx-muted", null, "Gjelder: "));
      scope.appendChild(h("strong", null, label ? "valgt seksjon «" + label + "»" : "hele siden"));
      if (label) scope.appendChild(ui.button("", { icon: "x", small: true, kind: "ghost", title: "Hele siden", onClick: function () { NP.store.select(null); } }));
    }

    function changeRow(c) {
      var label = c.sectionId ? sectionLabel(c.sectionId) : null;
      var row = h("li.nx-asst__change", null, ui.icon(OP_ICON[c.op] || "dot", 14), h("span", null, c.summary || c.op));
      if (label && c.op !== "delete") {
        row.classList.add("is-link");
        row.title = "Vis seksjonen";
        row.addEventListener("click", function () { NP.store.select(c.sectionId); });
      }
      return row;
    }

    function questionBox(q) {
      var box = h("div.nx-asst__q", null, h("p", null, h("strong", null, q.question)), q.why ? h("p.nx-muted", null, q.why) : null);
      var opts = h("div.nx-asst__opts");
      (q.options || []).forEach(function (o) {
        opts.appendChild(h("button.nx-chip" + (o === q.suggested ? ".is-sug" : ""), { type: "button", disabled: busy, on: { click: function () {
          submit("Svar på «" + q.question + "»: " + o);
        } } }, o));
      });
      if (!(q.options || []).length) {
        opts.appendChild(h("button.nx-chip", { type: "button", on: { click: function () {
          input.value = "Svar på «" + q.question + "»: ";
          input.focus();
        } } }, "Svar …"));
      }
      box.appendChild(opts);
      return box;
    }

    function message(m, i, all) {
      if (m.role === "user") return h("div.nx-msg.nx-msg--user", null, h("p", null, m.text));
      var node = h("div.nx-msg.nx-msg--ai", null, h("span.nx-msg__who", null, ui.icon("sparkles", 13), " AI-assistent"));
      if (m.text) node.appendChild(h("p", null, m.text));
      if (m.changes && m.changes.length) node.appendChild(h("ul.nx-asst__changes", null, m.changes.map(changeRow)));
      if (m.warnings && m.warnings.length) {
        node.appendChild(h("div.nx-note.nx-note--warn", null, ui.icon("circle-alert", 15), h("div", null, m.warnings.map(function (w) { return h("p", null, w); }))));
      }
      if (m.questions && m.questions.length && i === all.length - 1) m.questions.forEach(function (q) { node.appendChild(questionBox(q)); });
      var meta = h("div.nx-msg__meta");
      if (typeof m.cost === "number") meta.appendChild(h("span.nx-muted", { title: m.model || "" }, ui.money(m.cost)));
      if (lastUndo && lastUndo.index === i) {
        meta.appendChild(ui.button("Angre endringen", { small: true, kind: "ghost", icon: "undo-2", onClick: undoLast }));
      }
      node.appendChild(meta);
      return node;
    }

    function draw() {
      ui.clear(log);
      var msgs = chat();
      shownChat = msgs;
      if (!msgs.length) {
        log.appendChild(h("div.nx-asst__empty", null,
          h("p", null, h("strong", null, "Be om endringer med egne ord.")),
          h("p.nx-muted", null, "AI-assistenten ser hele siden – tekst, rekkefølge, design og CSS – og endrer bare det du ber om. Mangler den fakta, spør den først."),
          h("div.nx-asst__opts", null, SUGGESTIONS.map(function (t) {
            return h("button.nx-chip", { type: "button", on: { click: function () { input.value = t; input.focus(); } } }, t);
          })),
          ui.button("Lag hele siden fra kilder (veiviser) …", { small: true, kind: "ghost", icon: "wand-sparkles", onClick: function () { NP.ai.open(); } })));
      }
      msgs.forEach(function (m, i) { log.appendChild(message(m, i, msgs)); });
      if (busy) log.appendChild(h("div.nx-msg.nx-msg--ai.is-busy", null, ui.spinner(), h("span.nx-muted", null, " Leser siden og gjør endringene …")));
      drawScope();
      send.disabled = busy;
      input.disabled = busy;
      requestAnimationFrame(function () { log.scrollTop = log.scrollHeight; });
    }

    function undoLast() {
      if (!lastUndo) return;
      var snap = lastUndo.snapshot;
      // Edits made after the AI change would be lost by restoring the snapshot.
      var check = stateKey() === lastUndo.applied
        ? Promise.resolve(true)
        : ui.confirm("Siden er endret etterpå", "Du har gjort endringer etter AI-endringen. «Angre» setter siden tilbake til slik den var før AI-endringen, og de senere endringene forsvinner også (Ctrl+Z kan hente dem tilbake).", "Angre likevel", true);
      check.then(function (ok) {
        if (ok) restore(snap);
      });
    }

    function restore(snap) {
      NP.store.update(function (p) {
        return Object.assign({}, p, {
          theme: snap.theme,
          extras: snap.extras,
          pages: p.pages.map(function (pg) { return pg.id === snap.pageId ? Object.assign({}, pg, { sections: snap.sections }) : pg; }),
        });
      });
      var msgs = chat().concat([{ role: "assistant", text: "Endringen er angret. Siden er som før.", at: new Date().toISOString() }]);
      lastUndo = null;
      saveChat(msgs);
      draw();
      ui.toast("Endringen er angret", "ok");
    }

    function apply(r, before) {
      var touchesPage = r.sections || r.theme || r.extras;
      if (!touchesPage) return false;
      NP.store.update(function (p) {
        return Object.assign({}, p, {
          theme: r.theme || p.theme,
          extras: r.extras || p.extras,
          pages: r.sections ? p.pages.map(function (pg) { return pg.id === r.pageId ? Object.assign({}, pg, { sections: r.sections }) : pg; }) : p.pages,
        });
      });
      lastUndo = { snapshot: before, applied: stateKey() };
      var first = (r.changes || []).filter(function (c) { return c.sectionId && c.op !== "delete"; })[0];
      if (first) NP.store.select(first.sectionId);
      return true;
    }

    function submit(text) {
      var instruction = String(text || "").trim();
      if (!instruction || busy) return;
      var history = chat().slice(-MAX_HISTORY).map(function (m) { return { role: m.role, text: m.text }; });
      var msgs = chat().concat([{ role: "user", text: instruction, at: new Date().toISOString() }]);
      saveChat(msgs);
      input.value = "";
      busy = true;
      var projectId = project().id;
      inflight = { projectId: projectId };
      draw();
      var before = snapshot();
      var key = stateKey();
      NP.store.save().then(function () {
        var saveState = NP.store.get().save;
        if (saveState === "conflict") throw new Error("Prosjektet er endret av noen andre. Last inn på nytt først.");
        if (saveState === "error") throw new Error("Siden kunne ikke lagres, så AI-en ville jobbet på en eldre versjon. Sjekk nettet og prøv igjen.");
        return NP.api.ai("revise", {
          projectId: projectId,
          rev: NP.store.get().rev,
          pageId: NP.store.get().pageId,
          instruction: instruction,
          history: history,
          selected: NP.store.get().selected || "",
          tier: tier,
        });
      }).then(function (r) {
        inflight = null;
        busy = false;
        if (!NP.store.get().project || project().id !== projectId) return; // the user left the project
        var reply = { role: "assistant", text: r.reply || "", changes: r.changes || [], warnings: r.warnings || [], questions: r.questions || [], cost: r.cost, model: r.model, at: new Date().toISOString() };
        if ((r.sections || r.theme || r.extras) && stateKey() !== key) {
          reply.changes = [];
          reply.text = "Siden ble endret mens jeg jobbet, så jeg brukte ikke endringen. Send instruksen på nytt.";
        } else if (apply(r, before)) {
          lastUndo.index = chat().length; // the reply's index after it is appended below
        }
        saveChat(chat().concat([reply]));
        draw();
      }, function (err) {
        inflight = null;
        busy = false;
        if (!NP.store.get().project || project().id !== projectId) return;
        saveChat(chat().concat([{ role: "assistant", text: "Det gikk ikke: " + err.message, at: new Date().toISOString() }]));
        draw();
      });
    }

    var shownChat = chat();
    var unsub = NP.store.subscribe(function (s, change) {
      if (change.kind === "select" || change.kind === "page") drawScope();
      // A reply that arrived for an earlier copy of this panel (closed and reopened mid-request).
      if (change.kind === "project" && (chat() !== shownChat || (busy && !inflight))) {
        if (!inflight) busy = false;
        shownChat = chat();
        draw();
      }
    });
    draw();
    root.destroy = function () { unsub(); };
    return root;
  }

  NP.assistant = { panel: panel, codeView: codeView };
})();
