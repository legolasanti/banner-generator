/* =========================================================================
   live/main.js — the NT Live tab: the sheet on the left with everything the
   campaign decides (texts, timing, look, export), the four formats running
   live on the right, and the export that turns it into Campaign Manager 360
   packages. Built the first time the tab opens, kept alive after that; the
   work in progress survives a reload (localStorage).
   ========================================================================= */
(function () {
  "use strict";

  var NTLIVE = (window.NTLIVE = window.NTLIVE || {});
  var h = window.WPE.util.h;
  var form = NTLIVE.form;
  var LD = window.LiveData;
  var F = window.BannerFormats;
  var STORAGE_KEY = "ntlive:v1";
  var MAX_STORED_FALLBACK = 1500000; // chars of data URL kept across reloads

  var DEFAULT_DESIGN = {
    kicker: "Oddsen",
    ctaText: "Spill nå",
    timeMode: "clock",
    clockSep: ":",
    liveLabel: "Pågår nå",
    slideMs: 5000,
    transition: "fade",
    lookAheadDays: 1,
    finishedAfterMin: 120,
    maxSlides: 6,
    accent: "#1a6b1a",
    textScale: 1,
    defaultMedia: "gradient",
    teamsInAnimation: true,
    fallbackHeadline: "Dagens kamper på Oddsen",
    fallbackText: "Nye kamper hver dag",
    exitMode: "row",
    liveRefresh: true,
    bundleDays: 3,
    mediaKb: 45,
  };

  var state = {
    name: "",
    filename: "",
    clickUrl: "https://www.norsk-tipping.no/sport/oddsen",
    sheetUrl: "",
    pasted: "",
    source: null, // { kind, url, liveUrls }
    rows: [],
    columns: {},
    warnings: [],
    design: Object.assign({}, DEFAULT_DESIGN),
    badges: { vinnersjanse: "", showVinnerOnNewsgrid: false },
    keys: ["readpeak", "desktop", "mobile", "newsgrid"],
    fallbackImage: "", // data URL
  };
  var settings = null;
  var view = null;
  var built = false;
  var dom = {};
  var preview = null;
  var rebuildTimer = null;

  // ---- persistence ----------------------------------------------------------
  function save() {
    try {
      var copy = Object.assign({}, state);
      if (copy.fallbackImage && copy.fallbackImage.length > MAX_STORED_FALLBACK) copy.fallbackImage = "";
      localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
    } catch (e) {
      /* quota or private mode: the session simply does not survive a reload */
    }
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      Object.keys(state).forEach(function (k) {
        if (saved[k] !== undefined) state[k] = saved[k];
      });
      state.design = Object.assign({}, DEFAULT_DESIGN, saved.design || {});
      state.badges = Object.assign({ vinnersjanse: "", showVinnerOnNewsgrid: false }, saved.badges || {});
    } catch (e) {
      /* ignore a corrupt session */
    }
  }

  function toast(message, kind) {
    var host = document.getElementById("toasts");
    if (!host) return;
    var t = h("div.toast" + (kind ? ".toast--" + kind : ""), null, h("span.toast__dot"), h("span", null, message));
    host.appendChild(t);
    setTimeout(function () { t.remove(); }, kind === "err" ? 7000 : 3500);
  }

  // ---- the config the runtime reads (same shape as the package) -------------
  function previewConfig() {
    var st = settings || {};
    var badges = st.staticBadges || {};
    var icon = st.ageIcon && st.ageIcon.path ? "/" + st.ageIcon.path + (st.ageIcon.version ? "?v=" + st.ageIcon.version : "") : "";
    return {
      rows: state.rows,
      design: Object.assign({}, state.design, { clickUrl: state.clickUrl }),
      badges: {
        annonseText: badges.annonseText || "Annonse",
        ageBadgeText: badges.ageBadgeText || "18+ | Hjelpelinjen.no",
        ageIconUrl: icon,
        vinnersjanse: state.badges.vinnersjanse,
        showVinnerOnNewsgrid: state.badges.showVinnerOnNewsgrid,
      },
      assets: { media: {}, fallback: state.fallbackImage || "" },
      source: { liveUrls: [] },
    };
  }

  function scheduleRebuild() {
    save();
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(function () {
      if (preview) preview.setConfig(previewConfig());
    }, 150);
  }

  function setDesign(key, value) {
    state.design = Object.assign({}, state.design, (function () { var o = {}; o[key] = value; return o; })());
    scheduleRebuild();
  }

  // ---- the sheet ----------------------------------------------------------
  function describeRows() {
    var n = state.rows.length;
    if (!n) return "Ingen kamper hentet ennå.";
    var picked = LD.select(state.rows, new Date(), state.design);
    var today = picked.scope === "today" ? picked.slides.length : 0;
    var parts = [n + (n === 1 ? " kamp" : " kamper"), today + " i dag"];
    if (state.warnings.length) parts.push(state.warnings.length + (state.warnings.length === 1 ? " advarsel" : " advarsler"));
    if (state.source && state.source.liveUrls && state.source.liveUrls.length) parts.push("live-oppdatering mulig");
    else if (state.source && state.source.kind === "google") parts.push("live-oppdatering: nei (lenken er ikke https-delbar)");
    return parts.join(" · ");
  }

  function renderRowsTable() {
    dom.rowsHost.innerHTML = "";
    dom.rowsStatus.textContent = describeRows();
    if (!state.rows.length) return;
    var table = h("table.lv-table", null, h("thead", null, h("tr", null, ["Rad", "Dato", "Tid", "Kamp", "Turnering", "Media", "Lenke"].map(function (t) { return h("th", null, t); }))));
    var tbody = h("tbody");
    var today = LD.osloParts(new Date()).ymd;
    state.rows.forEach(function (r) {
      var media = r.video ? "video" : r.image ? "bilde" : r.animation ? "anim: " + r.animation : "–";
      var d = r.date.split("-");
      var tr = h(
        "tr",
        { class: r.date === today ? "is-today" : r.date < today ? "is-past" : "" },
        h("td", null, String(r.sheetRow || "")),
        h("td", null, d[2] + "." + d[1] + "." + d[0]),
        h("td", null, r.time || "–"),
        h("td", null, r.title),
        h("td", null, r.league || "–"),
        h("td", null, media),
        h("td", null, r.link ? h("a", { href: r.link, target: "_blank", rel: "noopener" }, "lenke") : "–")
      );
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    dom.rowsHost.appendChild(table);
    if (state.warnings.length) {
      var ul = h("ul.lv-warnings");
      state.warnings.slice(0, 40).forEach(function (w) {
        ul.appendChild(h("li", null, (w.row ? "Rad " + w.row + ": " : "") + w.message));
      });
      dom.rowsHost.appendChild(ul);
    }
  }

  function fetchSheet(body) {
    dom.fetchBtn.disabled = true;
    dom.fetchBtn.textContent = "Henter…";
    return fetch("/api/live/sheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || "Kunne ikke lese regnearket");
          return data;
        });
      })
      .then(function (data) {
        state.rows = data.rows || [];
        state.columns = data.columns || {};
        state.warnings = data.warnings || [];
        state.source = data.source || null;
        renderRowsTable();
        scheduleRebuild();
        if (!state.rows.length) toast("Fant ingen kamper i arket – sjekk kolonnene Dato, Tid og Kamp", "err");
        else toast(state.rows.length + " kamper hentet", "ok");
      })
      .catch(function (err) {
        toast(err.message, "err");
      })
      .then(function () {
        dom.fetchBtn.disabled = false;
        dom.fetchBtn.textContent = "Hent kamper";
      });
  }

  function buildSheetSection() {
    var url = form.text({
      value: state.sheetUrl,
      placeholder: "https://docs.google.com/spreadsheets/d/…",
      onChange: function (v) { state.sheetUrl = v.trim(); save(); },
    });
    url.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        fetchSheet({ url: state.sheetUrl });
      }
    });
    dom.fetchBtn = h("button.btn-primary.btn-sm", { type: "button" }, "Hent kamper");
    dom.fetchBtn.addEventListener("click", function () {
      if (state.pasted.trim() && !state.sheetUrl) fetchSheet({ text: state.pasted });
      else fetchSheet({ url: state.sheetUrl });
    });
    var pasted = form.textarea({
      value: state.pasted,
      rows: 4,
      placeholder: "…eller lim inn cellene fra arket her (med overskriftsraden)",
      onChange: function (v) { state.pasted = v; save(); },
    });
    var pasteBtn = h("button.btn-ghost.btn-sm", { type: "button" }, "Bruk innlimte celler");
    pasteBtn.addEventListener("click", function () {
      if (!state.pasted.trim()) return toast("Lim inn cellene først", "err");
      fetchSheet({ text: state.pasted });
    });
    dom.rowsStatus = h("p.lv-status", null, describeRows());
    dom.rowsHost = h("div.lv-rows");
    var help = h(
      "p.lv-help",
      null,
      "Kolonner (valgfri rekkefølge): ",
      h("b", null, "Dato"),
      ", ",
      h("b", null, "Tid"),
      ", ",
      h("b", null, "Hjemmelag"),
      " og ",
      h("b", null, "Bortelag"),
      " (eller én kolonne ",
      h("b", null, "Kamp"),
      "), og valgfritt Turnering, Lenke, Bilde, Video, Animasjon (gradient · lys · striper · puls · konfetti), Knappetekst, Odds. ",
      h("a", { href: "/api/live/template.csv", download: "" }, "Last ned mal (CSV)"),
      ". Del arket som «Alle med lenken» – det trenger annonsen også for å oppdatere seg selv."
    );
    return form.section("1 · Kampene", "Google Sheets-lenke eller innlimte celler", [
      form.field("Regneark", form.row(url, dom.fetchBtn)),
      form.field("Lim inn celler", form.row(pasted, pasteBtn)),
      help,
      dom.rowsStatus,
      dom.rowsHost,
    ]);
  }

  // ---- content & timing -----------------------------------------------------
  function buildContentSection() {
    var d = state.design;
    return form.section("2 · Innhold", "Tekstene rundt kampene", [
      form.field("Kampanjenavn", form.text({ value: state.name, placeholder: "Oddsen – Champions League", onChange: function (v) { state.name = v; save(); } }), "Vises i Historikk"),
      form.field("Filnavn", form.text({ value: state.filename, placeholder: "oddsen-cl-uke43", onChange: function (v) { state.filename = v; save(); } }), "uten filtype"),
      form.field("Klikk-lenke (clickTag)", form.text({ type: "url", value: state.clickUrl, placeholder: "https://www.norsk-tipping.no/…", onChange: function (v) { state.clickUrl = v.trim(); scheduleRebuild(); } }), "Standard landingsside; kampens egen lenke kan overstyre (se Eksport)"),
      form.row(
        form.field("Produktlinje", form.text({ value: d.kicker, placeholder: "Oddsen", maxLength: 60, onChange: function (v) { setDesign("kicker", v); } }), "Over lagene; turneringen fra arket legges til"),
        form.field("Knappetekst", form.text({ value: d.ctaText, placeholder: "Spill nå", maxLength: 40, onChange: function (v) { setDesign("ctaText", v); } }), "Tom = ingen knapp")
      ),
      form.field(
        "Tidsvisning",
        form.seg({
          value: d.timeMode,
          items: [["clock", "Klokkeslett", "«I dag kl. 21:00»"], ["countdown", "Nedtelling", "«Starter om 2 t 14 min»"], ["both", "Begge", "«I dag kl. 21:00 · om 2 t 14 min»"]],
          onChange: function (v) { setDesign("timeMode", v); },
        })
      ),
      form.row(
        form.field("Klokkeslett", form.seg({ value: d.clockSep, items: [[":", "21:00"], [".", "21.00"]], onChange: function (v) { setDesign("clockSep", v); } })),
        form.field("Tekst mens kampen pågår", form.text({ value: d.liveLabel, maxLength: 40, onChange: function (v) { setDesign("liveLabel", v); } }))
      ),
    ]);
  }

  function buildTimingSection() {
    var d = state.design;
    return form.section(
      "3 · Rotasjon og dager",
      "Hvor lenge hver kamp vises, og hva som skjer uten kamper",
      [
        form.field("Sekunder per kamp", form.range({ min: 2, max: 20, value: d.slideMs / 1000, fmt: function (v) { return v + " s"; }, onChange: function (v) { setDesign("slideMs", v * 1000); } })),
        form.row(
          form.field("Overgang", form.seg({ value: d.transition, items: [["fade", "Toning"], ["slide", "Glidende"], ["none", "Ingen"]], onChange: function (v) { setDesign("transition", v); } })),
          form.field("Maks kamper", form.number({ min: 1, max: 12, value: d.maxSlides, onChange: function (v) { setDesign("maxSlides", v); } }))
        ),
        form.row(
          form.field("Uten kamper i dag: se fram", form.number({ min: 0, max: 14, value: d.lookAheadDays, onChange: function (v) { setDesign("lookAheadDays", v); } }), "dager («I morgen kl. …», «Lørdag kl. …»); 0 = bare i dag"),
          form.field("Fjern kamp etter avspark", form.number({ min: 0, max: 600, step: 15, value: d.finishedAfterMin, onChange: function (v) { setDesign("finishedAfterMin", v); } }), "minutter – «Pågår nå» fram til da")
        ),
      ],
      false
    );
  }

  // ---- look -----------------------------------------------------------------
  function readFallbackFile(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(file.type)) return toast("Reservebildet må være JPG, PNG, WEBP, AVIF eller GIF", "err");
    if (file.size > 9 * 1024 * 1024) return toast("Reservebildet er for stort (maks 9 MB)", "err");
    var reader = new FileReader();
    reader.onload = function () {
      state.fallbackImage = String(reader.result || "");
      updateFallbackPreview();
      scheduleRebuild();
    };
    reader.readAsDataURL(file);
  }

  function updateFallbackPreview() {
    dom.fallbackImg.hidden = !state.fallbackImage;
    dom.fallbackImg.src = state.fallbackImage || "";
    dom.fallbackClear.hidden = !state.fallbackImage;
  }

  function buildLookSection() {
    var d = state.design;
    var file = h("input", { type: "file", accept: "image/*", hidden: true });
    file.addEventListener("change", function () { readFallbackFile(file.files && file.files[0]); file.value = ""; });
    var pick = h("button.btn-ghost.btn-sm", { type: "button" }, "Velg bilde…");
    pick.addEventListener("click", function () { file.click(); });
    dom.fallbackClear = h("button.btn-ghost.btn-sm.is-danger", { type: "button", hidden: true }, "Fjern");
    dom.fallbackClear.addEventListener("click", function () {
      state.fallbackImage = "";
      updateFallbackPreview();
      scheduleRebuild();
    });
    dom.fallbackImg = h("img.lv-fallback__img", { alt: "", hidden: true });
    updateFallbackPreview();

    return form.section(
      "4 · Utseende",
      "Farge, animasjon og reserveplakaten",
      [
        form.row(
          form.field("Aksentfarge", form.color({ value: d.accent, onChange: function (v) { setDesign("accent", v); } }), "Knapp, produktlinje og animasjoner"),
          form.field("Tekststørrelse", form.range({ min: 0.7, max: 1.4, step: 0.05, value: d.textScale, fmt: function (v) { return Math.round(v * 100) + " %"; }, onChange: function (v) { setDesign("textScale", v); } }))
        ),
        form.field(
          "Kamper uten bilde eller video viser",
          form.select({
            value: d.defaultMedia,
            options: [["gradient", "Animasjon: gradient"], ["lys", "Animasjon: lys"], ["striper", "Animasjon: striper"], ["puls", "Animasjon: puls"], ["konfetti", "Animasjon: konfetti"], ["bilde", "Reservebildet (under)"]],
            onChange: function (v) { setDesign("defaultMedia", v); },
          }),
          "Kolonnen «Animasjon» i arket overstyrer per kamp"
        ),
        form.checkbox({ value: d.teamsInAnimation, label: "Skriv lagene store i animasjonen", onChange: function (v) { setDesign("teamsInAnimation", v); } }),
        form.field("Reservebilde", h("div.lv-fallback", null, form.row(pick, dom.fallbackClear), dom.fallbackImg, file), "Brukes på reserveplakaten og som bilde når du velger det over. Pakkes alltid inn."),
        form.row(
          form.field("Reserveoverskrift", form.text({ value: d.fallbackHeadline, maxLength: 90, onChange: function (v) { setDesign("fallbackHeadline", v); } }), "Når arket ikke har kamper"),
          form.field("Reservetekst", form.text({ value: d.fallbackText, maxLength: 90, onChange: function (v) { setDesign("fallbackText", v); } }))
        ),
        form.field("Vinnersjanse-tekst", form.text({ value: state.badges.vinnersjanse, maxLength: 120, placeholder: "Tom for sport", onChange: function (v) { state.badges = Object.assign({}, state.badges, { vinnersjanse: v }); scheduleRebuild(); } }), "Sport har ingen vinnersjanse-strip; fyll ut bare for lotterispill"),
        form.checkbox({ value: state.badges.showVinnerOnNewsgrid, label: "Vis vinnersjanse også på 190×190", onChange: function (v) { state.badges = Object.assign({}, state.badges, { showVinnerOnNewsgrid: v }); scheduleRebuild(); } }),
      ],
      false
    );
  }

  // ---- export ---------------------------------------------------------------
  function kb(bytes) {
    return Math.round(bytes / 1024) + " KB";
  }

  function renderResult(data) {
    dom.result.innerHTML = "";
    var htmlUrl = "/api/history/" + encodeURIComponent(data.id) + "/download?type=html";
    var imgUrl = "/api/history/" + encodeURIComponent(data.id) + "/download";
    var list = h("ul.lv-result__files");
    (data.report || []).forEach(function (r) {
      var over = r.limitBytes && r.htmlBytes > r.limitBytes;
      list.appendChild(h("li", { class: over ? "is-over" : "" }, h("span.lv-result__name", null, r.htmlFile), h("span.lv-result__size", null, kb(r.htmlBytes) + (over ? " · over grensen på " + kb(r.limitBytes) : ""))));
    });
    var live = data.live || {};
    var summary = live.rows + " kamper i pakken · " + live.today + " i dag · " + live.bundled + " bilder pakket inn · live-oppdatering " + (live.liveRefresh ? "på" : "av");
    dom.result.appendChild(
      h(
        "div.lv-result",
        null,
        h("div.lv-result__top", null, h("strong", null, "Ferdig."), " ", summary),
        list,
        h("div.lv-result__actions", null, h("a.btn-primary.btn-sm", { href: htmlUrl, download: "" }, "Last ned HTML5-pakkene"), h("a.btn-ghost.btn-sm", { href: imgUrl, download: "" }, "Reservebilder")),
        data.warnings && data.warnings.length
          ? h("ul.lv-warnings", null, data.warnings.map(function (w) { return h("li", null, (w.row ? "Rad " + w.row + ": " : "") + w.message); }))
          : null
      )
    );
    // Start the download the user came for.
    var a = h("a", { href: htmlUrl, download: "", hidden: true });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function doExport() {
    if (!state.rows.length) return toast("Hent kampene fra regnearket først", "err");
    if (!/^https?:\/\//.test(state.clickUrl)) return toast("Klikk-lenken må starte med https://", "err");
    if (!state.keys.length) return toast("Velg minst ett format", "err");
    dom.exportBtn.disabled = true;
    dom.exportBtn.textContent = "Lager pakkene…";
    var body = {
      name: state.name,
      filename: state.filename || state.name || "nt-live",
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
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || "Eksporten feilet");
          return data;
        });
      })
      .then(function (data) {
        renderResult(data);
        window.dispatchEvent(new CustomEvent("live:exported", { detail: data }));
        toast("HTML5-pakkene er klare", "ok");
      })
      .catch(function (err) {
        toast(err.message, "err");
      })
      .then(function () {
        dom.exportBtn.disabled = false;
        dom.exportBtn.textContent = "Lag HTML5-pakker";
      });
  }

  function buildExportSection() {
    var d = state.design;
    var specs = F.getProduct("norsktipping").specs;
    var formatBoxes = h("div.lv-formats");
    specs.forEach(function (spec) {
      formatBoxes.appendChild(
        form.checkbox({
          value: state.keys.indexOf(spec.key) !== -1,
          label: spec.name + " " + spec.width + "×" + spec.height,
          onChange: function (on) {
            state.keys = specs.map(function (s) { return s.key; }).filter(function (k) { return k === spec.key ? on : state.keys.indexOf(k) !== -1; });
            save();
          },
        })
      );
    });
    dom.exportBtn = h("button.btn-primary.btn-generate", { type: "button" }, "Lag HTML5-pakker");
    dom.exportBtn.addEventListener("click", doExport);
    dom.result = h("div");
    return form.section("5 · Eksport til Campaign Manager 360", "Klikk, live-oppdatering og hva som pakkes inn", [
      form.field(
        "Hva et klikk åpner",
        form.seg({
          value: d.exitMode,
          items: [["row", "Kampens lenke", "Lenken fra arket når den finnes, ellers klikk-lenken"], ["clicktag", "Alltid clickTag", "Alle klikk spores av Campaign Manager 360"]],
          onChange: function (v) { setDesign("exitMode", v); },
        }),
        "Kampens egen lenke går utenom CM360-sporingen – legg sporingslenker i arket om begge deler trengs"
      ),
      form.checkbox({ value: d.liveRefresh, label: "Live-oppdatering fra arket", hint: "Annonsen henter arket på nytt hver visning (krever delt Google Sheets-lenke). Nye kamper kommer med uten ny opplasting.", onChange: function (v) { setDesign("liveRefresh", v); } }),
      form.row(
        form.field("Dager med bilder i pakken", form.number({ min: 0, max: 30, value: d.bundleDays, onChange: function (v) { setDesign("bundleDays", v); } }), "Bilder lenger fram hentes fra lenken ved visning"),
        form.field("KB per bilde", form.number({ min: 15, max: 300, step: 5, value: d.mediaKb, onChange: function (v) { setDesign("mediaKb", v); } }))
      ),
      form.field("Formater", formatBoxes),
      dom.exportBtn,
      dom.result,
    ]);
  }

  // ---- assembly -------------------------------------------------------------
  function build() {
    view = document.getElementById("view-live");
    var side = h("aside.lv-side", null, buildSheetSection(), buildContentSection(), buildTimingSection(), buildLookSection(), buildExportSection());
    var main = h("section.lv-main");
    view.appendChild(h("div.lv", null, side, main));
    preview = NTLIVE.preview.build(main);
    preview.setConfig(previewConfig());
    renderRowsTable();
    built = true;
  }

  function loadSettings() {
    return fetch("/api/settings")
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (s) { settings = s; });
  }

  var booting = false;
  function activate() {
    if (built) {
      if (preview) preview.fit();
      return;
    }
    if (booting) return;
    booting = true;
    restore();
    loadSettings().then(function () {
      build();
      booting = false;
    });
  }

  /** Reopen an exported run from history (its project.json). */
  function openProject(url) {
    var folder = url.replace(/[^/]*$/, "");
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("Fant ikke prosjektet");
        return r.json();
      })
      .then(function (p) {
        state.name = p.name || "";
        state.filename = p.filename || "";
        state.clickUrl = p.clickUrl || state.clickUrl;
        state.design = Object.assign({}, DEFAULT_DESIGN, p.design || {});
        state.badges = Object.assign({ vinnersjanse: "", showVinnerOnNewsgrid: false }, p.badges || {});
        state.rows = p.rows || [];
        state.keys = p.keys || state.keys;
        state.source = p.source || null;
        state.sheetUrl = (p.source && p.source.url) || "";
        state.warnings = [];
        state.fallbackImage = "";
        var done = function () {
          save();
          if (built) {
            view.innerHTML = "";
            built = false;
            build();
          } else {
            activate();
          }
          toast("Prosjektet er åpnet – hent arket på nytt for ferske kamper", "ok");
        };
        if (!p.fallbackImage) return done();
        return fetch(folder + p.fallbackImage)
          .then(function (r) { return r.ok ? r.blob() : null; })
          .then(function (blob) {
            if (!blob) return done();
            var reader = new FileReader();
            reader.onload = function () {
              state.fallbackImage = String(reader.result || "");
              done();
            };
            reader.readAsDataURL(blob);
          });
      })
      .catch(function (err) { toast(err.message, "err"); });
  }

  NTLIVE.main = { activate: activate, openProject: openProject, state: state };
})();
