/* =========================================================================
   live/panel-export.js — the Eksport tab and the export itself: file name
   and clickTag, what a click opens, live refresh, which photos travel in
   the package, which formats, and the result (one CM360 ZIP per format,
   its size against the format's limit, and the backup images).
   ========================================================================= */
(function () {
  "use strict";

  var NTLIVE = (window.NTLIVE = window.NTLIVE || {});
  var h = window.WPE.util.h;
  var F = window.BannerFormats;
  var form = NTLIVE.form;
  var icon = NTLIVE.icon;

  var running = false;
  var panelDom = {};

  function kb(bytes) {
    return Math.round(bytes / 1024) + " KB";
  }

  function slug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[æ]/g, "ae").replace(/[ø]/g, "o").replace(/[å]/g, "a")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  function baseName(state) {
    return slug(state.filename || state.name) || "nt-live";
  }

  // ---- the panel --------------------------------------------------------------
  function panel(app) {
    var state = app.state;
    var d = state.design;
    var root = h("div.lv-stack");

    var namePreview = h("code.lv-filename");
    function paintName() {
      namePreview.textContent = baseName(state) + "-desktop-580x500.zip";
    }
    paintName();
    root.appendChild(
      form.card("Pakken", [
        form.field("Filnavn", form.text({ value: state.filename, placeholder: slug(state.name) || "oddsen-cl-uke43", maxLength: 80, onChange: function (v) { app.patch({ filename: v }, true); paintName(); } }), null, { aside: namePreview }),
        form.field("Klikk-lenke (clickTag)", form.text({ type: "url", value: state.clickUrl, placeholder: "https://www.norsk-tipping.no/…", onChange: function (v) { app.patch({ clickUrl: v.trim() }); } }), "Landingssiden Campaign Manager 360 sporer og kan overstyre."),
      ], { desc: "Navnet på filene og siden annonsen åpner." })
    );

    var exitNote = h("div");
    function paintExit() {
      exitNote.innerHTML = "";
      exitNote.appendChild(
        state.design.exitMode === "row"
          ? form.note("warn", "Kampens egen lenke går utenom klikksporingen i Campaign Manager 360. Trenger dere sporing på alle klikk: velg «Alltid clickTag», eller legg sporingslenker i Lenke-kolonnen.")
          : form.note("ok", "Alle klikk går til clickTag og spores av Campaign Manager 360.")
      );
    }
    paintExit();
    root.appendChild(
      form.card("Klikk", [
        form.seg({
          value: d.exitMode,
          block: true,
          items: [["row", "Kampens lenke", "Lenken fra arket når den finnes, ellers clickTag"], ["clicktag", "Alltid clickTag", "Alle klikk spores av Campaign Manager 360"]],
          onChange: function (v) { app.setDesign("exitMode", v); paintExit(); },
        }),
        exitNote,
      ], { desc: "Hva som åpnes når noen klikker på annonsen." })
    );

    var liveNote = h("div");
    function paintLive() {
      liveNote.innerHTML = "";
      var urls = state.source && state.source.liveUrls ? state.source.liveUrls : [];
      if (!state.design.liveRefresh) {
        liveNote.appendChild(form.note("info", "Av: pakken viser kampene som er hentet nå. Endres arket, må pakkene lages på nytt."));
      } else if (urls.length) {
        liveNote.appendChild(form.note("ok", "Annonsen henter arket på nytt hver gang den vises. Nye kamper kommer med uten ny opplasting."));
      } else {
        liveNote.appendChild(form.note("warn", "Krever en delt Google Sheets-lenke under Kamper. Uten den får pakken bare kampene som er hentet nå."));
      }
    }
    paintLive();
    root.appendChild(
      form.card("Live-oppdatering", [
        form.toggle({ value: d.liveRefresh, label: "Hent arket på nytt ved hver visning", onChange: function (v) { app.setDesign("liveRefresh", v); paintLive(); } }),
        liveNote,
      ], { desc: "Om annonsen henter nye kamper selv etter at den er lastet opp." })
    );

    root.appendChild(
      form.card("Bilder i pakken", [
        form.row(
          form.field("Dager med bilder", form.number({ min: 0, max: 30, value: d.bundleDays, unit: "dager", onChange: function (v) { app.setDesign("bundleDays", v); } })),
          form.field("Maks per bilde", form.number({ min: 15, max: 300, step: 5, value: d.mediaKb, unit: "KB", onChange: function (v) { app.setDesign("mediaKb", v); } }))
        ),
      ], { desc: "Bildene til kampene de nærmeste dagene pakkes inn og krympes. Bilder lenger fram og all video hentes fra lenken i arket når annonsen vises." })
    );

    var specs = F.getProduct("norsktipping").specs;
    var formats = h("div.lv-formats");
    specs.forEach(function (spec) {
      var ratio = spec.height / spec.width;
      var shape = h("span.lv-format__shape", { "aria-hidden": "true" });
      shape.style.width = Math.round(22 / Math.max(1, ratio)) + "px";
      shape.style.height = Math.round(22 * Math.min(1, ratio)) + "px";
      var input = h("input", { type: "checkbox", "aria-label": spec.name });
      input.checked = state.keys.indexOf(spec.key) !== -1;
      input.addEventListener("change", function () {
        var keys = specs.map(function (s) { return s.key; }).filter(function (k) { return k === spec.key ? input.checked : state.keys.indexOf(k) !== -1; });
        app.patch({ keys: keys }, true);
      });
      formats.appendChild(h("label.lv-format", null, input, shape, h("span.lv-format__text", null, h("b", null, spec.name), h("span", null, spec.width + "×" + spec.height)), h("span.lv-format__tick", { "aria-hidden": "true" }, icon("check", 12))));
    });
    root.appendChild(form.card("Formater", [formats], { desc: "Én ZIP per format, klar for opplasting." }));

    panelDom.button = form.button("Lag HTML5-pakker", { kind: "primary", size: "lg", icon: "download", onClick: function () { run(app); } });
    panelDom.result = h("div");
    root.appendChild(h("div.lv-exportbar", null, panelDom.button, h("p.lv-fine", null, "Lager pakkene, reservebildene og en LES-MEG.txt, og lagrer kjøringen i Historikk.")));
    root.appendChild(panelDom.result);
    if (state.lastResult) renderResult(app, state.lastResult, false);

    app.on("rows", paintLive);
    return root;
  }

  // ---- result -------------------------------------------------------------------
  function renderResult(app, data, autoDownload) {
    var host = panelDom.result;
    if (!host) return;
    host.innerHTML = "";
    var htmlUrl = "/api/history/" + encodeURIComponent(data.id) + "/download?type=html";
    var imgUrl = "/api/history/" + encodeURIComponent(data.id) + "/download";
    var live = data.live || {};
    var files = h("ul.lv-files");
    (data.report || []).forEach(function (r) {
      var limit = r.limitBytes || 0;
      var pct = limit ? Math.min(100, Math.round((r.htmlBytes / limit) * 100)) : 0;
      var over = limit && r.htmlBytes > limit;
      var bar = h("span.lv-files__bar", null, h("span.lv-files__fill"));
      bar.firstChild.style.width = pct + "%";
      files.appendChild(
        h(
          "li.lv-files__item" + (over ? ".is-over" : ""),
          null,
          h("span.lv-files__name", null, icon("file", 14), r.htmlFile),
          h("span.lv-files__size", null, kb(r.htmlBytes) + (limit ? " av " + kb(limit) : "")),
          limit ? bar : null,
          over ? h("span.lv-files__note", null, r.htmlNote || "Over grensen") : null
        )
      );
    });
    var history = form.button("Se i Historikk", { kind: "quiet", size: "sm", icon: "history", onClick: function () {
      var tab = document.getElementById("tab-history");
      if (tab) tab.click();
    } });
    host.appendChild(
      h(
        "section.lv-result",
        null,
        h(
          "header.lv-result__head",
          null,
          h("span.lv-result__badge", null, icon("check", 16)),
          h("div", null, h("h3", null, "Pakkene er klare"), h("p", null, [live.rows + " kamper", live.today + " i dag", live.bundled + " bilder pakket inn", "live-oppdatering " + (live.liveRefresh ? "på" : "av")].join(" · ")))
        ),
        files,
        h(
          "div.lv-actions.lv-actions--wrap",
          null,
          h("a.lv-btn.lv-btn--primary", { href: htmlUrl, download: "" }, icon("download", 16), h("span.lv-btn__label", null, "Last ned HTML5-pakkene")),
          h("a.lv-btn.lv-btn--ghost", { href: imgUrl, download: "" }, icon("image", 16), h("span.lv-btn__label", null, "Reservebilder")),
          history
        ),
        data.warnings && data.warnings.length
          ? form.note("warn", h("ul.lv-warnlist", null, data.warnings.map(function (w) { return h("li", null, w.row ? h("span.lv-warnlist__row", null, "Rad " + w.row) : null, w.message); })))
          : null
      )
    );
    if (autoDownload) {
      var a = h("a", { href: htmlUrl, download: "", hidden: true });
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  // ---- run ------------------------------------------------------------------------
  function setBusy(app, on) {
    running = on;
    [panelDom.button, app.exportButton].forEach(function (b) {
      if (!b) return;
      b.disabled = on;
      b.classList.toggle("is-loading", on);
      var label = b.querySelector(".lv-btn__label");
      if (label) label.textContent = on ? "Lager pakkene…" : "Lag HTML5-pakker";
    });
  }

  function run(app) {
    var state = app.state;
    if (running) return;
    var problem = !state.rows.length
      ? ["kamper", "Hent kampene fra regnearket først"]
      : !/^https?:\/\//.test(state.clickUrl)
        ? ["eksport", "Klikk-lenken må starte med https://"]
        : !state.keys.length
          ? ["eksport", "Velg minst ett format"]
          : null;
    if (problem) {
      app.selectTab(problem[0]);
      app.toast(problem[1], "err");
      return;
    }
    setBusy(app, true);
    var body = {
      name: state.name,
      filename: baseName(state),
      clickUrl: state.clickUrl,
      keys: state.keys,
      design: state.design,
      badges: state.badges,
      rows: state.rows,
      source: state.source ? { url: state.source.url || state.sheetUrl } : { url: state.sheetUrl },
      fallbackImage: state.fallbackImage || null,
    };
    fetch("/api/live/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) {
        var type = r.headers.get("content-type") || "";
        if (!/json/.test(type)) throw new Error(r.status === 404 ? "Serveren kjenner ikke NT Live ennå – start ABC design på nytt (npm start)" : "Uventet svar fra serveren (" + r.status + ")");
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || "Eksporten feilet");
          return data;
        });
      })
      .then(function (data) {
        state.lastResult = data;
        app.selectTab("eksport");
        renderResult(app, data, true);
        window.dispatchEvent(new CustomEvent("live:exported", { detail: data }));
        app.toast("HTML5-pakkene er klare", "ok");
      })
      .catch(function (err) { app.toast(err.message, "err"); })
      .then(function () { setBusy(app, false); });
  }

  NTLIVE.exporter = { panel: panel, run: run };
})();
