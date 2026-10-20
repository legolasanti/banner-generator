/* =========================================================================
   live/panel-sheet.js — the Kamper tab: where the matches come from (a
   shared Google Sheet or pasted cells), the sheet template (CSV download,
   copy straight into Google Sheets, or example matches to try the tool),
   every column the tool reads, and the matches it found, grouped by day.
   Clicking a match shows it in the preview at a moment it is on air.
   ========================================================================= */
(function () {
  "use strict";

  var NTLIVE = (window.NTLIVE = window.NTLIVE || {});
  var h = window.WPE.util.h;
  var LD = window.LiveData;
  var form = NTLIVE.form;
  var icon = NTLIVE.icon;

  var COLUMNS = [
    { name: "Dato", need: "Påkrevd", example: "20.10.2026", what: "Kampdagen. Også 20.10, 20/10/2026 eller 2026-10-20." },
    { name: "Tid", need: "Påkrevd", example: "21:00", what: "Avspark i norsk tid. 21:00, 21.00, 2100 og «kl. 21» går også." },
    { name: "Hjemmelag", need: "Påkrevd*", example: "Real Madrid", what: "Sammen med Bortelag. *Eller én kolonne «Kamp» med «Real Madrid – Liverpool»." },
    { name: "Bortelag", need: "Påkrevd*", example: "Liverpool", what: "Tom for arrangementer uten motstander (f.eks. et løp)." },
    { name: "Turnering", need: "Valgfri", example: "Champions League", what: "Står etter produktlinjen: «Oddsen · Champions League»." },
    { name: "Odds", need: "Valgfri", example: "2,05 - 3,60 - 3,40", what: "H – U – B. Vises i Oddstavle og Klassisk. To tall uten U går også." },
    { name: "Knappetekst", need: "Valgfri", example: "Se oddsen", what: "Overstyrer knappeteksten for akkurat denne kampen." },
    { name: "Lenke", need: "Valgfri", example: "https://www.norsk-tipping.no/…", what: "Kampens egen landingsside (https://). Ellers brukes clickTag." },
    { name: "Bilde", need: "Valgfri", example: "https://…/kamp.jpg", what: "Direkte bildelenke. Google Drive- og Dropbox-delinger skrives om." },
    { name: "Video", need: "Valgfri", example: "https://…/klipp.mp4", what: "Direkte mp4-lenke. Spilles uten lyd og i loop." },
    { name: "Animasjon", need: "Valgfri", example: "gradient", what: "gradient · lys · striper · puls · konfetti, når kampen mangler bilde." },
    { name: "Overskrift", need: "Valgfri", example: "Toppkamp i Bergen", what: "Erstatter «Hjemmelag – Bortelag» som tittel." },
    { name: "Tekst", need: "Valgfri", example: "Over 2,5 mål?", what: "En ekstra linje for egne maler ({{tekst}})." },
  ];

  var FIELD_NAMES = [
    ["date", "Dato"], ["time", "Tid"], ["home", "Hjemmelag"], ["away", "Bortelag"], ["match", "Kamp"], ["league", "Turnering"],
    ["odds", "Odds"], ["cta", "Knappetekst"], ["link", "Lenke"], ["image", "Bilde"], ["video", "Video"], ["animation", "Animasjon"],
    ["headline", "Overskrift"], ["text", "Tekst"],
  ];

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function downloadText(name, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = h("a", { href: url, download: name, hidden: true });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = h("textarea", { style: { position: "fixed", left: "-9999px" } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      if (ok) resolve();
      else reject(new Error("copy"));
    });
  }

  function panel(app) {
    var state = app.state;
    var root = h("div.lv-stack");

    // ---- source -----------------------------------------------------------
    var fetchBtn = form.button("Hent kampene", { kind: "primary", icon: "download" });
    var urlInput = form.text({
      type: "url",
      value: state.sheetUrl,
      placeholder: "https://docs.google.com/spreadsheets/d/…",
      ariaLabel: "Lenke til Google-regnearket",
      onChange: function (v) { app.patch({ sheetUrl: v.trim() }, true); },
      onEnter: function () { fetchSheet({ url: state.sheetUrl }); },
    });
    fetchBtn.addEventListener("click", function () { fetchSheet({ url: state.sheetUrl }); });
    var sheetPane = h(
      "div.lv-stack.lv-stack--tight",
      null,
      form.field("Lenke til Google-regnearket", urlInput),
      h("div.lv-actions", null, fetchBtn),
      form.note("info", ["Del arket med ", h("b", null, "Del → Alle med lenken (Leser)"), ". Det trenger annonsen også for å hente nye kamper selv."])
    );

    var pasteArea = form.textarea({
      value: state.pasted,
      rows: 5,
      placeholder: "Merk cellene i arket (med overskriftsraden), kopier og lim inn her…",
      onChange: function (v) { app.patch({ pasted: v }, true); },
    });
    var pasteBtn = form.button("Les inn cellene", { kind: "primary", icon: "check" });
    pasteBtn.addEventListener("click", function () {
      if (!state.pasted.trim()) return app.toast("Lim inn cellene først", "err");
      fetchSheet({ text: state.pasted });
    });
    var pastePane = h("div.lv-stack.lv-stack--tight", null, form.field("Innlimte celler", pasteArea), h("div.lv-actions", null, pasteBtn));

    var sourceStatus = h("div.lv-source");
    function renderSource() {
      sheetPane.hidden = state.sourceMode !== "sheet";
      pastePane.hidden = state.sourceMode !== "paste";
      sourceStatus.innerHTML = "";
      if (!state.rows.length || !state.source) return;
      var kind = state.source.kind;
      var label = kind === "sample" ? "Eksempelkamper" : kind === "paste" ? "Innlimte celler" : "Google Sheets";
      var when = state.fetchedAt ? new Date(state.fetchedAt) : null;
      var stamp = when ? " · hentet " + pad2(when.getHours()) + ":" + pad2(when.getMinutes()) : "";
      var live = state.source.liveUrls && state.source.liveUrls.length;
      var refresh = form.button("Hent på nytt", { kind: "quiet", size: "sm", icon: "refresh" });
      refresh.addEventListener("click", function () {
        if (kind === "paste") fetchSheet({ text: state.pasted });
        else if (kind === "sample") loadSample();
        else fetchSheet({ url: state.sheetUrl });
      });
      sourceStatus.appendChild(
        h(
          "div.lv-source__row",
          null,
          h("span.lv-source__dot" + (live ? ".is-live" : "")),
          h("div.lv-source__text", null, h("b", null, label), h("span", null, state.rows.length + " kamper" + stamp)),
          refresh
        )
      );
      if (kind === "google" && !live) {
        sourceStatus.appendChild(form.note("warn", "Lenken kan ikke brukes til live-oppdatering (den må være en https-lenke til et delt Google-regneark). Pakken får bare kampene som er hentet nå."));
      }
    }

    var modeSeg = form.seg({
      value: state.sourceMode,
      block: true,
      items: [["sheet", "Google Sheets", null, "sheet"], ["paste", "Lim inn celler", null, "copy"]],
      onChange: function (v) {
        app.patch({ sourceMode: v }, true);
        renderSource();
      },
    });

    root.appendChild(form.card("Hvor kommer kampene fra?", [modeSeg, sheetPane, pastePane, sourceStatus], { desc: "Annonsen viser dagens kamper fra arket, i norsk tid." }));

    // ---- template -----------------------------------------------------------
    var csvBtn = form.button("Last ned CSV-mal", { kind: "ghost", size: "sm", icon: "download", onClick: function () {
      downloadText("nt-live-kampoppsett.csv", "﻿" + LD.templateCsv(new Date(), ";"), "text/csv;charset=utf-8");
      app.toast("CSV-malen er lastet ned – åpne den i Excel, eller Fil → Importer i Google Sheets", "ok");
    } });
    var copyBtn = form.button("Kopier til Google Sheets", { kind: "ghost", size: "sm", icon: "copy", onClick: function () {
      var tsv = LD.templateRows(new Date()).map(function (r) { return r.join("\t"); }).join("\n");
      copyText(tsv).then(
        function () {
          app.toast("Kopiert! Lim inn i celle A1 i det nye regnearket (⌘V)", "ok");
          window.open("https://sheets.new", "_blank", "noopener");
        },
        function () { app.toast("Kunne ikke kopiere – bruk CSV-malen i stedet", "err"); }
      );
    } });
    var sampleBtn = form.button("Prøv med eksempelkamper", { kind: "ghost", size: "sm", icon: "sparkles", onClick: loadSample });

    var colTable = h(
      "table.lv-cols",
      null,
      h("thead", null, h("tr", null, h("th", null, "Kolonne"), h("th", null, "Eksempel"), h("th", null, "Hva den gjør"))),
      h(
        "tbody",
        null,
        COLUMNS.map(function (c) {
          return h(
            "tr",
            { class: c.need === "Valgfri" ? "" : "is-req" },
            h("td", null, h("b", null, c.name), h("span.lv-cols__need", null, c.need)),
            h("td", null, h("code", null, c.example)),
            h("td", null, c.what)
          );
        })
      )
    );
    var colDetails = h("details.lv-disclose", null, h("summary", null, icon("down", 14), "Alle 13 kolonnene arket kan ha"), h("div.lv-cols__wrap", null, colTable), h("p.lv-fine", null, "Rekkefølgen er valgfri, og overskriftene kan også være på engelsk. Rader over overskriftsraden (en tittel, f.eks.) hoppes over."));

    var templateCard = form.card("Mal for regnearket", [
      h("div.lv-actions.lv-actions--stack", null, copyBtn, csvBtn),
      h("p.lv-fine", null, "«Kopier» legger malen på utklippstavlen og åpner et nytt Google-regneark – lim inn i A1, del arket og lim lenken inn over."),
      colDetails,
      h("div.lv-divider"),
      h("div.lv-sample", null, h("span.lv-fine", null, "Ingen ark ennå? Seks kamper over fire dager, så du kan prøve malene med en gang."), sampleBtn),
    ], { desc: "Riktige overskrifter og eksempelrader – start herfra." });
    root.appendChild(templateCard);

    // ---- matches ------------------------------------------------------------
    var matchesHost = h("div");
    root.appendChild(matchesHost);

    function detectedColumns() {
      var cols = state.columns || {};
      return FIELD_NAMES.filter(function (f) { return cols[f[0]] != null; }).map(function (f) { return f[1]; });
    }

    function statusOf(row, nowMs, today) {
      if (row.date < today) return { text: "Ferdig", kind: "past" };
      if (row.date > today) return { text: LD.dayWord(LD.dayDiff(today, row.date), row.date), kind: "future" };
      if (!row.time) return { text: "I dag", kind: "today" };
      var start = LD.kickoffMs(row.date, row.time);
      var after = Number(state.design.finishedAfterMin) || 120;
      if (nowMs >= start + after * 60000) return { text: "Ferdig", kind: "past" };
      if (nowMs >= start) return { text: "Pågår", kind: "live" };
      return { text: "I dag", kind: "today" };
    }

    function mediaIcon(row) {
      if (row.video) return icon("video", 14);
      if (row.image) return icon("image", 14);
      return icon("sparkles", 14);
    }

    function renderMatches() {
      matchesHost.innerHTML = "";
      renderSource();
      if (!state.rows.length) {
        matchesHost.appendChild(
          h(
            "div.lv-empty",
            null,
            h("div.lv-empty__art", { "aria-hidden": "true" }, icon("calendar", 26)),
            h("h3.lv-empty__title", null, "Ingen kamper ennå"),
            h(
              "ol.lv-steps",
              null,
              h("li", null, h("b", null, "Kopier malen"), " til et nytt Google-regneark, eller last ned CSV-en."),
              h("li", null, h("b", null, "Fyll inn kampene"), " – dato, tid og lag er nok."),
              h("li", null, h("b", null, "Del arket"), " som «Alle med lenken» og lim lenken inn øverst.")
            )
          )
        );
        templateCard.classList.remove("is-compact");
        return;
      }
      templateCard.classList.add("is-compact");
      var nowMs = Date.now();
      var today = LD.osloParts(new Date(nowMs)).ymd;
      var sorted = state.rows.slice().sort(function (a, b) {
        return a.date === b.date ? (a.time || "99").localeCompare(b.time || "99") : a.date.localeCompare(b.date);
      });
      var groups = [];
      var byDate = {};
      sorted.forEach(function (r) {
        if (!byDate[r.date]) {
          byDate[r.date] = { date: r.date, rows: [] };
          groups.push(byDate[r.date]);
        }
        byDate[r.date].rows.push(r);
      });
      var past = groups.filter(function (g) { return g.date < today; });
      var current = groups.filter(function (g) { return g.date >= today; });
      var todayCount = byDate[today] ? byDate[today].rows.length : 0;

      var summary = h(
        "div.lv-kpis",
        null,
        kpi(state.rows.length, state.rows.length === 1 ? "kamp" : "kamper"),
        kpi(todayCount, "i dag", todayCount ? "ok" : ""),
        kpi(current.length, current.length === 1 ? "kampdag fram" : "kampdager fram"),
        kpi(state.warnings.length, state.warnings.length === 1 ? "advarsel" : "advarsler", state.warnings.length ? "warn" : "")
      );
      var cols = detectedColumns();
      var colsLine = h("div.lv-detected", null, h("span.lv-fine", null, "Fant kolonnene "), cols.map(function (c) { return h("span.lv-tag", null, c); }));

      var list = h("div.lv-days");
      function dayHeader(g) {
        var offset = LD.dayDiff(today, g.date);
        var d = g.date.split("-");
        var word = offset === 0 ? "I dag" : offset === 1 ? "I morgen" : offset === -1 ? "I går" : LD.dayWord(2, g.date);
        return h("div.lv-day__head", null, h("span.lv-day__word", null, word), h("span.lv-day__date", null, +d[2] + "." + +d[1] + "." + d[0]), h("span.lv-day__n", null, g.rows.length + (g.rows.length === 1 ? " kamp" : " kamper")));
      }
      function matchRow(r) {
        var st = statusOf(r, nowMs, today);
        var item = h(
          "button.lv-match.is-" + st.kind,
          { type: "button", title: "Vis denne kampen i forhåndsvisningen" },
          h("span.lv-match__time", null, r.time ? r.time.replace(":", state.design.clockSep === "." ? "." : ":") : "–"),
          h("span.lv-match__main", null, h("span.lv-match__title", null, r.title), h("span.lv-match__meta", null, [r.league, r.odds ? "odds " + r.odds : ""].filter(Boolean).join(" · ") || "Rad " + (r.sheetRow || "–"))),
          h("span.lv-match__media", { title: r.video ? "Video" : r.image ? "Bilde" : "Animasjon" }, mediaIcon(r)),
          h("span.lv-pill.lv-pill--" + st.kind, null, st.text)
        );
        item.addEventListener("click", function () {
          if (app.preview) app.preview.showRow(r);
        });
        return item;
      }
      current.forEach(function (g) {
        list.appendChild(h("section.lv-day", null, dayHeader(g), h("div.lv-day__rows", null, g.rows.map(matchRow))));
      });
      if (past.length) {
        var n = past.reduce(function (s, g) { return s + g.rows.length; }, 0);
        list.appendChild(
          h(
            "details.lv-disclose.lv-past",
            null,
            h("summary", null, icon("down", 14), "Tidligere dager (" + n + (n === 1 ? " kamp" : " kamper") + ")"),
            past.map(function (g) { return h("section.lv-day", null, dayHeader(g), h("div.lv-day__rows", null, g.rows.map(matchRow))); })
          )
        );
      }
      if (!current.length) list.appendChild(form.note("warn", "Alle kampene i arket er passert. Annonsen viser reserveplakaten til det kommer nye."));

      var children = [summary, colsLine];
      if (state.warnings.length) {
        children.push(
          form.note("warn", [
            h("b", null, state.warnings.length === 1 ? "Én rad trenger tilsyn" : state.warnings.length + " rader trenger tilsyn"),
            h("ul.lv-warnlist", null, state.warnings.slice(0, 40).map(function (w) { return h("li", null, w.row ? h("span.lv-warnlist__row", null, "Rad " + w.row) : null, w.message); })),
          ])
        );
      }
      children.push(list);
      matchesHost.appendChild(form.card("Kampene", children, { desc: "Klikk en kamp for å se den i forhåndsvisningen." }));
    }

    function kpi(value, label, kind) {
      return h("div.lv-kpi" + (kind ? ".lv-kpi--" + kind : ""), null, h("b", null, String(value)), h("span", null, label));
    }

    // ---- fetching ------------------------------------------------------------
    function busy(on) {
      fetchBtn.disabled = on;
      pasteBtn.disabled = on;
      fetchBtn.classList.toggle("is-loading", on);
      pasteBtn.classList.toggle("is-loading", on);
    }

    function accept(data, kind) {
      app.patch({
        rows: data.rows || [],
        columns: data.columns || {},
        warnings: data.warnings || [],
        source: data.source || { kind: kind, liveUrls: [] },
        fetchedAt: new Date().toISOString(),
      });
      if (!state.rows.length) app.toast("Fant ingen kamper – sjekk at arket har kolonnene Dato, Tid og lag", "err");
      else app.toast(state.rows.length + " kamper hentet", "ok");
    }

    function fetchSheet(body) {
      if (body.url != null && !String(body.url).trim()) return app.toast("Lim inn lenken til regnearket først", "err");
      busy(true);
      return fetch("/api/live/sheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) {
          var type = r.headers.get("content-type") || "";
          if (!/json/.test(type)) throw new Error(r.status === 404 ? "Serveren kjenner ikke NT Live ennå – start ABC design på nytt (npm start)" : "Uventet svar fra serveren (" + r.status + ")");
          return r.json().then(function (data) {
            if (!r.ok) throw new Error(data.error || "Kunne ikke lese regnearket");
            return data;
          });
        })
        .then(function (data) { accept(data, body.text ? "paste" : "google"); })
        .catch(function (err) {
          // Pasted cells can always be read right here, server or not.
          if (body.text) {
            var table = LD.readTable(LD.parseCsv(body.text));
            accept({ rows: table.rows, columns: table.columns, warnings: table.warnings, source: { kind: "paste", liveUrls: [] } }, "paste");
            return;
          }
          app.toast(err.message, "err");
        })
        .then(function () { busy(false); });
    }

    function loadSample() {
      var table = LD.readTable(LD.parseCsv(LD.templateCsv(new Date(), ";")));
      app.patch({
        rows: table.rows,
        columns: table.columns,
        warnings: table.warnings,
        source: { kind: "sample", liveUrls: [] },
        fetchedAt: new Date().toISOString(),
      });
      app.toast("Seks eksempelkamper lagt inn – bytt til ditt eget ark når du er klar", "ok");
    }

    app.on("rows", renderMatches);
    app.on("design", function (key) { if (key === "clockSep" || key === "finishedAfterMin") renderMatches(); });
    renderMatches();
    return root;
  }

  NTLIVE.panels = NTLIVE.panels || {};
  NTLIVE.panels.sheet = panel;
})();
