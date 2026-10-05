/* =========================================================================
   bulk/source.js — getting the sheet in, and the photos behind it.

   Four ways in, all ending in the same rows (the server reads every one of
   them with lib/bulk/sheet.js, so they cannot disagree):
     • a Google Sheets link       → POST /api/bulk/sheet {url}
     • an .xlsx / .csv / .tsv file → POST /api/bulk/sheet-file
     • cells pasted from Sheets   → POST /api/bulk/sheet {text}
     • the built-in example       → the same template the CSV download holds

   Then every photo is fetched by the server, four at a time, and each row
   shows its own result — one dead link costs one row, not the run.
   ========================================================================= */
(function () {
  "use strict";

  var BULK = (window.BULK = window.BULK || {});
  var store = BULK.store;
  var state = BULK.state;
  var h = window.WPE.util.h;

  var IMAGE_CONCURRENCY = 4;
  var imageQueue = [];
  var imageActive = 0;
  // URL → finished image, so reloading the sheet does not fetch again.
  var imageCache = {};

  function toast(message, kind) {
    var host = document.getElementById("toasts");
    if (!host) return;
    var t = h("div", { class: "toast" + (kind ? " toast--" + kind : "") }, h("span.toast__dot"), h("span", null, message));
    host.appendChild(t);
    setTimeout(function () {
      t.classList.add("is-out");
      setTimeout(function () { t.remove(); }, 320);
    }, kind === "err" ? 5200 : 3200);
  }

  function readJson(res) {
    return res
      .json()
      .catch(function () { return {}; })
      .then(function (data) {
        if (!res.ok) throw new Error(data.error || "Noe gikk galt (HTTP " + res.status + ")");
        return data;
      });
  }

  // ---- loading the sheet --------------------------------------------------
  function accept(data, source) {
    if (!data.rows || !data.rows.length) {
      var why = (data.warnings && data.warnings[0]) || "Fant ingen rader i arket.";
      throw new Error(why);
    }
    store.setRows(data.rows, {
      source: Object.assign({}, data.source || {}, source || {}),
      columns: data.columns,
      warnings: data.warnings,
      guessed: data.guessed,
    });
    state.rows.forEach(queueImage);
    var n = data.rows.length;
    toast(n + (n === 1 ? " rad lest" : " rader lest") + " fra arket", "ok");
  }

  function fromUrl(url) {
    return fetch("/api/bulk/sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url }),
    })
      .then(readJson)
      .then(function (data) { accept(data); });
  }

  function fromText(text) {
    return fetch("/api/bulk/sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text }),
    })
      .then(readJson)
      .then(function (data) { accept(data); });
  }

  function fromFile(file) {
    if (!file) return Promise.resolve();
    if (file.size > 5 * 1024 * 1024) return Promise.reject(new Error("Filen er for stor (maks 5 MB)"));
    var fd = new FormData();
    fd.append("file", file, file.name);
    return fetch("/api/bulk/sheet-file", { method: "POST", body: fd })
      .then(readJson)
      .then(function (data) { accept(data); });
  }

  function fromDemo() {
    return fetch("/api/bulk/template.csv")
      .then(function (res) {
        if (!res.ok) throw new Error("Kunne ikke hente eksempelet");
        return res.text();
      })
      .then(function (text) {
        return fetch("/api/bulk/sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text }),
        });
      })
      .then(readJson)
      .then(function (data) { accept(data, { kind: "demo" }); });
  }

  /** Re-read the same Google/URL source (after the sheet was edited). */
  function reload() {
    var src = state.source;
    if (!src || !src.url) return Promise.reject(new Error("Denne kilden kan ikke hentes på nytt"));
    return fromUrl(src.url);
  }

  // ---- photos ------------------------------------------------------------
  function queueImage(row) {
    if (!row.imageUrl) {
      store.updateRow(row, { image: { status: "missing" } });
      return;
    }
    var cached = imageCache[row.imageUrl];
    if (cached) {
      store.updateRow(row, { image: cached });
      return;
    }
    if (row.image && row.image.status === "ok" && row.image.id) return; // restored session
    store.updateRow(row, { image: { status: "waiting" } });
    imageQueue.push(row);
    pumpImages();
  }

  function pumpImages() {
    while (imageActive < IMAGE_CONCURRENCY && imageQueue.length) {
      var row = imageQueue.shift();
      if (state.rows.indexOf(row) === -1) continue;
      imageActive++;
      loadImage(row).then(function () {
        imageActive--;
        pumpImages();
      });
    }
  }

  function loadImage(row) {
    var url = row.imageUrl;
    store.updateRow(row, { image: { status: "loading" } });
    return fetch("/api/bulk/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url }),
    })
      .then(readJson)
      .then(function (img) {
        var image = Object.assign({ status: "ok" }, img);
        imageCache[url] = image;
        // The URL may have been edited while this was in flight.
        if (row.imageUrl === url) store.updateRow(row, { image: image });
      })
      .catch(function (err) {
        if (row.imageUrl === url) store.updateRow(row, { image: { status: "error", error: err.message } });
      });
  }

  /** Replace one row's photo with a local file. */
  function uploadImage(row, file) {
    if (!file) return Promise.resolve();
    if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(file.type)) {
      return Promise.reject(new Error("Kun JPG, PNG, WEBP, AVIF eller GIF"));
    }
    var fd = new FormData();
    fd.append("image", file, file.name);
    store.updateRow(row, { image: { status: "loading" } });
    return fetch("/api/bulk/image-file", { method: "POST", body: fd })
      .then(readJson)
      .then(function (img) {
        store.updateRow(row, { imageUrl: "(lokal fil) " + file.name, image: Object.assign({ status: "ok" }, img), pos: null });
      })
      .catch(function (err) {
        store.updateRow(row, { image: { status: "error", error: err.message } });
        throw err;
      });
  }

  function setImageUrl(row, url) {
    var clean = String(url || "").trim();
    store.updateRow(row, { imageUrl: clean, pos: null });
    queueImage(row);
  }

  function retryFailed() {
    state.rows.forEach(function (row) {
      if (row.image && row.image.status === "error") {
        delete imageCache[row.imageUrl];
        queueImage(row);
      }
    });
  }

  function pendingImages() {
    return state.rows.filter(function (r) {
      return r.image && (r.image.status === "waiting" || r.image.status === "loading");
    }).length;
  }

  // ---- the start screen -------------------------------------------------
  var GUIDE = [
    ["Overskrift", "Ja", "Spar opptil 50 % på hotell i høst", "Teksten i banneret. Størrelsen velges automatisk per format."],
    ["Bildelenke", "Ja", "https://…/hotell.jpg", "Direkte lenke til bildet. Google Drive- og Dropbox-delingslenker virker også."],
    ["Filnavn", "Nei", "hotell-host", "Uten filtype. Tomt = lages fra overskriften."],
    ["Skrift", "Nei", "Halvfet / Normal", "Tomt = valget for hele kjøringen."],
    ["Fokus", "Nei", "topp · bunn venstre · 30/70", "Hvor bildet skal holdes når det beskjæres. Tomt = automatisk."],
    ["Klikk-lenke", "Nei", "https://www.abcnyheter.no/…", "Bare for HTML5. Tomt = standardlenken du setter ved nedlasting."],
  ];

  function guide() {
    var limits = store.allSpecs().map(function (spec) {
      var r = spec.autoFit;
      return h("li", null, h("b", null, spec.width + "×" + spec.height), h("span", null, "maks ca. " + r.maxChars + " tegn"));
    });
    return h(
      "details.bk-guide",
      null,
      h("summary", null, "Slik må regnearket se ut"),
      h(
        "div.bk-guide__body",
        null,
        h(
          "p",
          null,
          "Første rad er kolonnenavn – rekkefølgen spiller ingen rolle, og andre kolonner (notater, ",
          h("code", null, "=LEN(A2)"),
          ", ",
          h("code", null, "=IMAGE(B2)"),
          ") blir ignorert. Én rad = én banner i alle valgte størrelser."
        ),
        h(
          "table.bk-guide__table",
          null,
          h("thead", null, h("tr", null, h("th", null, "Kolonne"), h("th", null, "Må med"), h("th", null, "Eksempel"), h("th", null, "Merknad"))),
          h(
            "tbody",
            null,
            GUIDE.map(function (g) {
              return h("tr", null, h("td", null, h("b", null, g[0])), h("td", null, g[1]), h("td", null, h("code", null, g[2])), h("td", null, g[3]));
            })
          )
        ),
        h("p.bk-guide__sub", null, "Lengste overskrift som får plass (på 70 %):"),
        h("ul.bk-guide__limits", null, limits),
        h(
          "p.bk-guide__note",
          null,
          "Kortere tekst blir større (opptil 120 %), lengre blir mindre (ned til 70 %). Reglene kan endres under «Tekststørrelse-regler» når arket er lastet."
        )
      )
    );
  }

  function busy(btn, on) {
    btn.disabled = on;
    btn.classList.toggle("is-loading", on);
  }

  /** Build the start screen into `host`. */
  function buildStart(host) {
    var linkInput = h("input.bk-input", {
      type: "url",
      placeholder: "https://docs.google.com/spreadsheets/d/…",
      spellcheck: "false",
      "aria-label": "Lenke til Google Sheets",
    });
    var linkBtn = h("button.btn-primary.bk-btn-load", { type: "button" }, h("span.fetch-spinner", { "aria-hidden": "true" }), h("span", null, "Hent arket"));
    var runLink = function () {
      var url = linkInput.value.trim();
      if (!url) {
        toast("Lim inn lenken til regnearket først", "err");
        linkInput.focus();
        return;
      }
      busy(linkBtn, true);
      fromUrl(url)
        .catch(function (err) { toast(err.message, "err"); })
        .then(function () { busy(linkBtn, false); });
    };
    linkBtn.addEventListener("click", runLink);
    linkInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        runLink();
      }
    });

    var fileInput = h("input", { type: "file", accept: ".xlsx,.csv,.tsv,.txt,text/csv", hidden: true });
    var drop = h(
      "div.bk-drop",
      { tabindex: "0", role: "button", "aria-label": "Last opp regneark" },
      h("b", null, "Slipp en fil her"),
      h("span", null, "eller klikk for å velge"),
      h("small", null, ".xlsx · .csv · .tsv")
    );
    var runFile = function (file) {
      if (!file) return;
      drop.classList.add("is-loading");
      fromFile(file)
        .catch(function (err) { toast(err.message, "err"); })
        .then(function () {
          drop.classList.remove("is-loading");
          fileInput.value = "";
        });
    };
    drop.addEventListener("click", function () { fileInput.click(); });
    drop.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });
    fileInput.addEventListener("change", function () { runFile(fileInput.files[0]); });
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.add("is-drag");
      });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.remove("is-drag");
      });
    });
    drop.addEventListener("drop", function (e) {
      runFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });

    var paste = h("textarea.bk-input.bk-paste", {
      rows: 4,
      placeholder: "Merk cellene i Google Sheets (med overskriftsraden), kopier (⌘C / Ctrl+C) og lim inn her",
      "aria-label": "Lim inn celler",
    });
    var pasteBtn = h("button.btn-ghost.bk-btn-load", { type: "button" }, h("span.fetch-spinner", { "aria-hidden": "true" }), h("span", null, "Bruk cellene"));
    pasteBtn.addEventListener("click", function () {
      if (!paste.value.trim()) {
        toast("Lim inn cellene først", "err");
        paste.focus();
        return;
      }
      busy(pasteBtn, true);
      fromText(paste.value)
        .catch(function (err) { toast(err.message, "err"); })
        .then(function () { busy(pasteBtn, false); });
    });

    var demoBtn = h("button.btn-ghost.btn-sm", { type: "button" }, "Prøv med eksempeldata");
    demoBtn.addEventListener("click", function () {
      busy(demoBtn, true);
      fromDemo()
        .catch(function (err) { toast(err.message, "err"); })
        .then(function () { busy(demoBtn, false); });
    });

    host.appendChild(
      h(
        "div.bk-start",
        null,
        h(
          "header.bk-start__head",
          null,
          h("span.bk-kicker", null, "Houseads · bulk"),
          h("h2", null, "Mange bannere fra ett regneark"),
          h(
            "p",
            null,
            "Én rad per banner: overskrift og bildelenke. Verktøyet henter bildene, velger tekststørrelse for hvert format og lager alt i én ZIP – du kontrollerer og justerer før nedlasting."
          )
        ),
        h(
          "div.bk-sources",
          null,
          h(
            "section.bk-source.bk-source--main",
            null,
            h("h3", null, h("span.bk-num", null, "A"), "Google Sheets-lenke"),
            h("div.bk-row", null, linkInput, linkBtn),
            h("p.bk-hint", null, "Arket må være delt: Del → «Alle med lenken» → Leser. Lenken til en bestemt fane virker – den fanen brukes.")
          ),
          h("section.bk-source", null, h("h3", null, h("span.bk-num", null, "B"), "Last opp fil"), drop, fileInput),
          h("section.bk-source", null, h("h3", null, h("span.bk-num", null, "C"), "Lim inn celler"), paste, pasteBtn)
        ),
        h(
          "div.bk-start__foot",
          null,
          h("a.btn-ghost.btn-sm", { href: "/api/bulk/template.csv", download: "" }, "Last ned mal (CSV)"),
          demoBtn
        ),
        guide()
      )
    );
  }

  BULK.source = {
    buildStart: buildStart,
    fromUrl: fromUrl,
    reload: reload,
    queueImage: queueImage,
    setImageUrl: setImageUrl,
    uploadImage: uploadImage,
    retryFailed: retryFailed,
    pendingImages: pendingImages,
    toast: toast,
    readJson: readJson,
  };
})();
