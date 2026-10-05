/* =========================================================================
   editor/export.js — the export dialog.

   The point of this dialog is that nobody has to guess: as soon as a setting
   changes, the server renders and encodes the design exactly as the download
   will be, and the dialog shows each file's real weight against its limit —
   plus the compressed image itself, which can be inspected at 100 % before a
   single byte is downloaded.

   Settings are remembered per browser (localStorage), since they mostly stay
   the same from one campaign to the next.
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Spec = window.WallpaperSpec;
  var store = WPE.store;
  var util = WPE.util;
  var C = WPE.controls;
  var h = util.h;

  var KEY = "wallpaper-export-v1";
  var DEFAULTS = {
    outputType: "image",
    format: "auto",
    qualityMode: "auto",
    quality: 85,
    scale: 1,
    limits: { background: Spec.DEFAULT_LIMIT_KB, topbanner: Spec.DEFAULT_LIMIT_KB },
    boards: { background: true, topbanner: true },
    clickUrl: "",
    trackerUrl: "",
  };

  var opts = load();
  var dom = {};
  var pending = null;
  var lastResults = null;

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && typeof raw === "object") {
        return Object.assign({}, DEFAULTS, raw, {
          limits: Object.assign({}, DEFAULTS.limits, raw.limits),
          boards: Object.assign({}, DEFAULTS.boards, raw.boards),
        });
      }
    } catch (_) {}
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (_) {}
  }

  function set(patch) {
    opts = Object.assign({}, opts, patch);
    save();
    syncControls();
    schedule();
  }

  function selectedBoards() {
    return Spec.ORDER.filter(function (k) { return opts.boards[k]; });
  }

  function requestOptions() {
    return {
      outputType: opts.outputType,
      artboards: selectedBoards(),
      format: opts.format,
      quality: opts.qualityMode === "auto" ? "auto" : opts.quality,
      scale: opts.scale,
      limits: opts.limits,
      clickUrl: opts.clickUrl.trim(),
      trackerUrl: opts.trackerUrl.trim(),
      filename: store.state.doc.name,
    };
  }

  function urlProblem() {
    var v = opts.clickUrl.trim();
    if (!v) return opts.outputType === "html" ? "HTML5 trenger en klikk-lenke" : "";
    try {
      var u = new URL(v);
      if (!/^https?:$/.test(u.protocol)) return "Klikk-lenken må starte med https://";
    } catch (_) {
      return "Klikk-lenken er ikke en gyldig adresse";
    }
    return "";
  }

  // ---- estimate --------------------------------------------------------------------
  var schedule = util.debounce(estimate, 450);

  function estimate() {
    if (!dom.modal || dom.modal.hidden) return;
    if (!selectedBoards().length) {
      renderResults(null, "Velg minst én fil å eksportere.");
      return;
    }
    var problem = urlProblem();
    if (problem && opts.outputType === "html") {
      renderResults(null, problem + " for å beregne størrelsen.");
      return;
    }
    if (pending) pending.abort();
    var ctrl = new AbortController();
    pending = ctrl;
    dom.results.classList.add("is-busy");
    var body = { doc: store.state.doc, options: Object.assign(requestOptions(), opts.outputType === "image" ? { clickUrl: "" } : {}) };
    util.postJson("/api/wallpaper/estimate", body, ctrl.signal)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (pending !== ctrl) return;
        lastResults = data;
        renderResults(data, "");
      })
      .catch(function (err) {
        if (err.name === "AbortError") return;
        renderResults(null, err.message || "Kunne ikke beregne størrelsen");
      })
      .then(function () {
        if (pending === ctrl) {
          pending = null;
          dom.results.classList.remove("is-busy");
        }
      });
  }

  function bar(bytes, limit) {
    var pct = limit ? Math.min(100, (bytes / limit) * 100) : 0;
    var over = limit && bytes > limit;
    var near = !over && limit && bytes > limit * 0.9;
    return h("div.wp-bar" + (over ? ".is-over" : near ? ".is-near" : ""), null,
      h("div.wp-bar__fill", { style: { width: (limit ? pct : 100) + "%" } }));
  }

  function resultCard(r, isHtml) {
    var over = r.limitBytes && r.bytes > r.limitBytes;
    var status = over
      ? h("span.wp-res__status.is-over", null, util.icon("triangle-alert", 14), "Over grensen")
      : h("span.wp-res__status.is-ok", null, util.icon("circle-check", 14), r.limitBytes ? "Under grensen" : "Ingen grense");
    var spec = Spec.get(r.key);
    var kind = isHtml ? "HTML5-ZIP" : (r.ext || "").toUpperCase() + " · " + r.width + "×" + r.height;
    var head = h("div.wp-res__head", null,
      h("strong", null, spec.name), h("span.wp-res__kind", null, kind), status);
    var size = h("div.wp-res__size", null,
      h("span.wp-res__kb" + (over ? ".is-over" : ""), null, util.formatKb(r.bytes)),
      h("span.wp-res__limit", null, r.limitBytes ? " av " + util.formatKb(r.limitBytes) : ""));
    var card = h("div.wp-res" + (over ? ".is-over" : ""), null, head, size, bar(r.bytes, r.limitBytes));
    if (r.note) card.appendChild(h("p.wp-res__note", null, r.note));
    if (isHtml && r.breakdown) {
      var b = r.breakdown;
      card.appendChild(h("div.wp-res__parts", null,
        h("span", null, "Markup/tekst ", h("b", null, util.formatKb(b.html))),
        h("span", null, "Skrifter ", h("b", null, util.formatKb(b.fonts))),
        h("span", null, "Bilder ", h("b", null, util.formatKb(b.images)))
      ));
      if (r.files) {
        card.appendChild(h("details.wp-res__files", null, h("summary", null, r.files.length + " filer i pakken"),
          h("ul", null, r.files.map(function (f) { return h("li", null, h("code", null, f.name), " ", util.formatKb(f.bytes)); }))));
      }
    }
    if (!isHtml && r.preview) {
      var img = h("img.wp-res__thumb", { src: r.preview, alt: spec.name + " slik den lastes ned" });
      card.insertBefore(h("button.wp-res__thumbbtn", { type: "button", title: "Se i 100 % – slik filen faktisk ser ut", on: { click: function () { viewer(r.preview, spec); } } }, img,
        h("span.wp-res__zoom", null, util.icon("zoom-in", 14), "Se i 100 %")), card.firstChild);
    }
    return card;
  }

  function renderResults(data, message) {
    util.clear(dom.results);
    if (message) {
      dom.results.appendChild(h("p.wp-res__msg", null, util.icon("info", 16), message));
      updateDownload(false);
      return;
    }
    if (!data) return;
    var isHtml = data.outputType === "html";
    var total = 0;
    var anyOver = false;
    data.results.forEach(function (r) {
      total += r.bytes;
      if (r.limitBytes && r.bytes > r.limitBytes) anyOver = true;
      dom.results.appendChild(resultCard(r, isHtml));
    });
    dom.results.appendChild(h("p.wp-res__total", null, "Totalt ", h("b", null, util.formatKb(total)),
      anyOver ? " – noe er over grensen. Velg «Auto» kvalitet, senk kvaliteten, eller forenkle designet." : ""));
    updateDownload(true);
  }

  // ---- 100 % viewer ----------------------------------------------------------------
  function viewer(src, spec) {
    var img = h("img", { src: src, alt: "" });
    var zoom = 1;
    var wrap = h("div.wp-viewer__scroll", null, img);
    function apply() {
      img.style.width = spec.width * zoom + "px";
      zoomLab.textContent = Math.round(zoom * 100) + " %";
    }
    var zoomLab = h("span.wp-viewer__lab");
    var node = h("div.wp-viewer", { role: "dialog", "aria-label": "Forhåndsvisning i full størrelse" },
      h("div.wp-viewer__bar", null,
        h("strong", null, spec.name + " – slik filen ser ut etter komprimering"),
        h("button.wp-btn.wp-btn--ghost.wp-btn--sm", { type: "button", on: { click: function () { zoom = 1; apply(); } } }, "100 %"),
        h("button.wp-btn.wp-btn--ghost.wp-btn--sm", { type: "button", on: { click: function () { zoom = 2; apply(); } } }, "200 %"),
        zoomLab,
        h("button.wp-btn.wp-btn--icon", { type: "button", title: "Lukk", on: { click: close } }, util.icon("x", 18))
      ),
      wrap);
    function close() {
      node.remove();
      document.removeEventListener("keydown", onEsc, true);
    }
    function onEsc(e) {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
    }
    document.addEventListener("keydown", onEsc, true);
    document.body.appendChild(node);
    apply();
  }

  // ---- download --------------------------------------------------------------------
  function updateDownload(ready) {
    var problem = urlProblem();
    dom.urlMsg.textContent = problem;
    dom.download.disabled = !selectedBoards().length || !!problem || !!dom.download.dataset.busy;
    dom.download.classList.toggle("is-ready", !!ready);
  }

  function filenameFrom(header, fallback) {
    var m = /filename="?([^"]+)"?/.exec(header || "");
    return m ? m[1] : fallback;
  }

  function download() {
    if (dom.download.disabled) return;
    dom.download.dataset.busy = "1";
    dom.download.disabled = true;
    dom.download.classList.add("is-loading");
    var label = dom.download.querySelector(".wp-dl__label");
    label.textContent = "Lager filene …";
    util.postJson("/api/wallpaper/export", { doc: store.state.doc, options: requestOptions() })
      .then(function (res) {
        var name = filenameFrom(res.headers.get("content-disposition"), "wallpaper.zip");
        return res.blob().then(function (blob) {
          util.saveBlob(blob, name);
          WPE.toast("Lastet ned " + name + " – ligger også i Historikk", "ok");
          window.dispatchEvent(new CustomEvent("wallpaper:exported"));
        });
      })
      .catch(function (err) {
        WPE.toast(err.message || "Eksporten feilet", "err");
      })
      .then(function () {
        delete dom.download.dataset.busy;
        dom.download.classList.remove("is-loading");
        label.textContent = "Last ned";
        updateDownload(true);
      });
  }

  // ---- dialog ------------------------------------------------------------------------
  var controls = [];
  function track(c) {
    controls.push(c);
    return c.node;
  }
  function syncControls() {
    controls.forEach(function (c) { c.sync(); });
    if (!dom.modal) return;
    dom.modal.classList.toggle("is-html", opts.outputType === "html");
    dom.modal.classList.toggle("is-manual", opts.qualityMode === "manual" && opts.outputType === "image");
    updateDownload(false);
  }

  function limitInput(key) {
    var spec = Spec.get(key);
    return track(C.num({
      label: spec.name, min: 0, max: 5000, step: 10, suffix: "KB",
      get: function () { return opts.limits[key]; },
      set: function (v) { var l = Object.assign({}, opts.limits); l[key] = Math.round(v); set({ limits: l }); },
    }));
  }

  function build() {
    controls = [];
    var boards = h("div.wp-ex__boards", null, Spec.ORDER.map(function (k) {
      var spec = Spec.get(k);
      var box = h("input", { type: "checkbox" });
      box.checked = !!opts.boards[k];
      box.addEventListener("change", function () { var b = Object.assign({}, opts.boards); b[k] = box.checked; set({ boards: b }); });
      controls.push({ node: box, sync: function () { box.checked = !!opts.boards[k]; } });
      return h("label.wp-check", null, box, h("span", null, h("b", null, spec.name), " " + spec.width + "×" + spec.height));
    }));

    var type = h("div.wp-choice", null, [
      ["image", "Bilde", "JPG/PNG – til vanlige bildeplasseringer"],
      ["html", "HTML5", "Tekst forblir ekte, skarp tekst. ZIP per fil med clickTag"],
    ].map(function (t) {
      var b = h("button.wp-choice__b", { type: "button", on: { click: function () { set({ outputType: t[0] }); } } },
        h("strong", null, t[1]), h("span", null, t[2]));
      controls.push({ node: b, sync: function () { b.classList.toggle("is-on", opts.outputType === t[0]); } });
      return b;
    }));

    var clickUrl = track(C.text({ placeholder: "https://…", max: 2000, get: function () { return opts.clickUrl; }, set: function (v) { set({ clickUrl: v }); } }));
    var trackerUrl = track(C.text({ placeholder: "https://… (valgfritt)", max: 2000, get: function () { return opts.trackerUrl; }, set: function (v) { set({ trackerUrl: v }); } }));
    dom.urlMsg = h("p.wp-ex__err");

    var settings = h("div.wp-ex__settings", null,
      h("h4", null, "Hva skal lastes ned"), boards,
      h("h4", null, "Filtype"), type,
      h("div.wp-ex__img", null,
        C.row("Format", track(C.seg({
          options: [{ value: "auto", label: "Auto", title: "Minst mulig fil som fortsatt ser bra ut" }, { value: "jpg", label: "JPG" }, { value: "png", label: "PNG" }],
          get: function () { return opts.format; }, set: function (v) { set({ format: v }); },
        }))),
        C.row("Kvalitet", track(C.seg({
          options: [{ value: "auto", label: "Auto – best innen grensen" }, { value: "manual", label: "Manuell" }],
          get: function () { return opts.qualityMode; }, set: function (v) { set({ qualityMode: v }); },
        }))),
        h("div.wp-ex__manual", null, track(C.slider({
          label: "JPG-kvalitet", min: 30, max: 100, reset: 85,
          get: function () { return opts.quality; }, set: function (v) { set({ quality: v }); },
        }))),
        C.row("Oppløsning", track(C.seg({
          options: [{ value: 1, label: "1× (annonsestørrelse)" }, { value: 1.5, label: "1,5×" }, { value: 2, label: "2×" }],
          get: function () { return opts.scale; }, set: function (v) { set({ scale: v }); },
        })))
      ),
      h("h4", null, "Maks filstørrelse"),
      h("div.wp-grid2", null, limitInput("background"), limitInput("topbanner")),
      h("p.wp-note", null, "Standard er " + Spec.DEFAULT_LIMIT_KB + " KB per fil (2 × " + Spec.DEFAULT_LIMIT_KB + " KB). 0 = ingen grense. For HTML5 gjelder grensen hele ZIP-filen."),
      h("h4", null, "Lenker"),
      C.row("Klikk-lenke", clickUrl, { stack: true }),
      dom.urlMsg,
      C.row("Visningsteller", trackerUrl, { stack: true }),
      h("p.wp-note", null, "Klikk-lenken legges inn som clickTag i HTML5. For bilder står lenkene i LES-MEG.txt i ZIP-filen.")
    );

    dom.results = h("div.wp-ex__results");
    dom.preflight = h("div.wp-ex__pf");
    // A finding jumps to its element — close the dialog so it can be fixed.
    dom.preflight.addEventListener("click", function (e) { if (e.target.closest("button")) close(); });
    dom.download = h("button.wp-btn.wp-btn--primary.wp-dl", { type: "button", on: { click: download } },
      h("span.wp-dl__spin"), util.icon("download", 16), h("span.wp-dl__label", null, "Last ned"));

    var card = h("div.wp-modal__card.wp-ex", { role: "dialog", "aria-modal": "true", "aria-label": "Eksporter wallpaper" },
      h("header.wp-modal__head", null, h("h2", null, "Eksporter wallpaper"),
        h("button.wp-btn.wp-btn--icon", { type: "button", title: "Lukk", on: { click: close } }, util.icon("x", 18))),
      h("div.wp-ex__grid", null,
        settings,
        h("div.wp-ex__right", null,
          h("h4", null, "Slik blir filene", h("span.wp-ex__live", null, h("i"), "beregnes live")),
          dom.results,
          h("h4", null, "Kvalitetssjekk"),
          dom.preflight
        )
      ),
      h("footer.wp-modal__foot", null,
        h("span.wp-ex__foot", null, "Alle eksporter lagres også i Historikk, sammen med designet."),
        h("button.wp-btn.wp-btn--ghost", { type: "button", on: { click: close } }, "Avbryt"),
        dom.download)
    );
    dom.modal = h("div.wp-modal", { hidden: true, on: { pointerdown: function (e) { if (e.target === dom.modal) close(); } } }, card);
    document.body.appendChild(dom.modal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && dom.modal && !dom.modal.hidden && !document.querySelector(".wp-viewer") && !document.querySelector(".wp-pop")) close();
    });
  }

  function open() {
    if (!dom.modal) build();
    if (store.state.view.editing && document.activeElement) document.activeElement.blur();
    dom.modal.hidden = false;
    util.clear(dom.preflight);
    dom.preflight.appendChild(WPE.preflight.list(WPE.preflight.check(store.state.doc)));
    syncControls();
    renderResults(null, "Beregner …");
    estimate();
  }

  function close() {
    if (!dom.modal) return;
    dom.modal.hidden = true;
    if (pending) pending.abort();
    pending = null;
  }

  WPE.exporter = { open: open, close: close, last: function () { return lastResults; } };
})();
