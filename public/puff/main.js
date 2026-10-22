/* =========================================================================
   puff/main.js — the Artikkelpuff workspace inside Houseads: owns the state,
   wires the form (panel.js) to the live ad (stage.js), runs the uploads and
   the export. Built the first time it is opened; the work in progress
   survives a reload (localStorage — only references to uploaded files, so
   it stays small).
   ========================================================================= */
(function () {
  "use strict";

  var PUFF = (window.PUFF = window.PUFF || {});
  var Ad = window.PuffAd;
  var M = PUFF.media;
  var util = window.WPE.util;
  var h = util.h;
  var STORAGE_KEY = "puff:v1";
  var POSTER_DELAY_MS = 350;

  var state = {
    doc: Ad.emptyDoc(),
    filename: "",
    outputType: "html",
    format: "png",
    busySlots: [null, null, null],
    logoBusy: false,
    busy: false,
  };
  var built = false;
  var panel = null;
  var stage = null;
  var fit = null;
  var uploadSeq = [0, 0, 0];

  // ---- persistence -------------------------------------------------------------
  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ doc: state.doc, filename: state.filename, outputType: state.outputType, format: state.format })
      );
    } catch (e) {
      /* private mode or full storage: the work simply does not survive a reload */
    }
  }

  function restore() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;
      state.doc = Ad.normalizeDoc(saved.doc);
      state.filename = typeof saved.filename === "string" ? saved.filename : "";
      state.outputType = saved.outputType === "image" ? "image" : "html";
      state.format = ["png", "jpeg", "auto"].indexOf(saved.format) !== -1 ? saved.format : "png";
    } catch (e) {
      /* a damaged entry starts the builder empty */
    }
  }

  // ---- rendering -----------------------------------------------------------------
  function render() {
    if (!built) return;
    stage.update(state.doc);
    panel.refresh(state, fit);
  }

  function commit() {
    save();
    render();
  }

  // ---- document edits -------------------------------------------------------------
  function setSlot(i, patch) {
    var slots = state.doc.slots.slice();
    slots[i] = Object.assign({}, slots[i], patch);
    state.doc = Object.assign({}, state.doc, { slots: slots });
    commit();
  }

  function setCrop(i, patch) {
    setSlot(i, { crop: Ad.normalizeCrop(Object.assign({}, state.doc.slots[i].crop, patch)) });
  }

  function setDoc(patch) {
    var next = Object.assign({}, state.doc, patch);
    if (patch.logo) next.logo = Object.assign({}, state.doc.logo, patch.logo);
    state.doc = Ad.normalizeDoc(next);
    commit();
  }

  /** A story moves as a whole: media, crop, headline and link. */
  function moveSlot(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= state.doc.slots.length || state.busySlots[i] != null || state.busySlots[j] != null) return;
    var slots = state.doc.slots.slice();
    var tmp = slots[i];
    slots[i] = slots[j];
    slots[j] = tmp;
    state.doc = Object.assign({}, state.doc, { slots: slots });
    commit();
  }

  /** Removes the media only; the headline and link stay for the next file. */
  function clearSlot(i) {
    var keep = state.doc.slots[i];
    uploadSeq[i]++;
    state.busySlots[i] = null;
    setSlot(i, Object.assign(Ad.emptySlot(), { headline: keep.headline, link: keep.link }));
  }

  function set(key, value) {
    state[key] = value;
    commit();
  }

  // ---- uploads ----------------------------------------------------------------------
  function busy(i, progress) {
    state.busySlots[i] = progress;
    stage.setBusy(i, progress);
    panel.refresh(state, fit);
  }

  function uploadPoster(src, time) {
    return M.captureFrame(src, time).then(function (blob) {
      return M.upload(blob, { name: "stillbilde.jpg" });
    });
  }

  function uploadInto(i, file, kind) {
    var token = ++uploadSeq[i];
    var stale = function () {
      return token !== uploadSeq[i];
    };
    busy(i, 0);
    return M.upload(file, {
      onProgress: function (p) {
        if (!stale()) busy(i, p * 0.9);
      },
    })
      .then(function (up) {
        if (stale()) return;
        var base = { name: file.name, bytes: up.bytes, crop: { zoom: 0, x: 50, y: 50 } };
        if (up.kind === "image") {
          return setSlot(i, Object.assign(base, { kind: "image", src: up.url, poster: "", w: up.w, h: up.h, duration: 0, posterTime: 0 }));
        }
        return M.probeVideo(up.url).then(function (info) {
          var time = M.defaultPosterTime(info.duration);
          return uploadPoster(up.url, time).then(function (poster) {
            if (stale()) return;
            setSlot(i, Object.assign(base, { kind: "video", src: up.url, poster: poster.url, w: info.w, h: info.h, duration: info.duration, posterTime: time }));
          });
        });
      })
      .catch(function (err) {
        if (!stale()) util.toast(Ad.SLOTS[i].name + ": " + err.message, "err");
      })
      .then(function () {
        // A newer upload or a "Fjern" owns the slot's busy state now.
        if (!stale()) busy(i, null);
      });
  }

  /**
   * Files from a drop or a file picker. `target` is the story they were
   * dropped on, or null for "spread them over the stories".
   */
  function addFiles(fileList, target) {
    var files = Array.prototype.slice.call(fileList || []);
    var usable = [];
    files.forEach(function (file) {
      var c = M.classify(file);
      if (c.error) util.toast(c.error, "err");
      else usable.push({ file: file, kind: c.kind });
    });
    if (!usable.length) return;
    var filled = state.doc.slots.map(function (s, i) {
      return s.kind !== "empty" || state.busySlots[i] != null;
    });
    var targets = M.assign(usable.length, filled, target);
    if (usable.length > targets.length) {
      util.toast("Artikkelpuffen har tre saker – " + (usable.length - targets.length) + " fil(er) ble ikke brukt.", "err");
    }
    targets.forEach(function (slot, n) {
      uploadInto(slot, usable[n].file, usable[n].kind);
    });
  }

  var posterTimers = [0, 0, 0];
  function setPosterTime(i, time) {
    var slot = state.doc.slots[i];
    if (slot.kind !== "video") return;
    setSlot(i, { posterTime: time });
    clearTimeout(posterTimers[i]);
    posterTimers[i] = setTimeout(function () {
      var src = state.doc.slots[i].src;
      uploadPoster(src, time)
        .then(function (poster) {
          if (state.doc.slots[i].src === src) setSlot(i, { poster: poster.url });
        })
        .catch(function (err) {
          util.toast("Stillbilde: " + err.message, "err");
        });
    }, POSTER_DELAY_MS);
  }

  function uploadLogo(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      util.toast("Logoen må være PNG, JPG eller WEBP.", "err");
      return;
    }
    state.logoBusy = true;
    panel.refresh(state, fit);
    M.upload(file, { role: "logo" })
      .then(function (up) {
        setDoc({ logo: { src: up.url, w: up.w, h: up.h } });
      })
      .catch(function (err) {
        util.toast("Logo: " + err.message, "err");
      })
      .then(function () {
        state.logoBusy = false;
        panel.refresh(state, fit);
      });
  }

  // ---- export -------------------------------------------------------------------------
  function fileBase() {
    var names = window.BULK_NAMES;
    var raw = state.filename || (state.doc.slots[0].headline || "").split("\n")[0];
    return names ? names.sanitizeFilename(raw) : raw;
  }

  /** What still stands between the form and an export, or "". */
  function missing() {
    var uploading = state.busySlots.some(function (b) { return b != null; });
    if (uploading) return "Venter på opplasting …";
    for (var i = 0; i < state.doc.slots.length; i++) {
      var s = state.doc.slots[i];
      var name = Ad.SLOTS[i].name;
      if (s.kind === "empty") return name + " mangler bilde eller video.";
      if (!s.headline) return name + " mangler overskrift.";
    }
    if (!state.doc.slots[0].link) return "Hovedsaken mangler lenke.";
    return "";
  }

  function downloadUrl(id, type) {
    return "/api/history/" + encodeURIComponent(id) + "/download" + (type === "html" ? "?type=html" : "");
  }

  function showResult(res) {
    var box = panel.result;
    util.clear(box);
    var r = res.report || {};
    var isHtml = res.outputType === "html";
    var primary = h("a.btn-download", { href: downloadUrl(res.id, isHtml ? "html" : ""), download: "" }, isHtml ? "Last ned HTML5" : "Last ned bilde");
    var files = h("ul.result__files");
    var row = function (name, bytes, note, over) {
      files.appendChild(
        h(
          "li.result__file",
          null,
          h("span.result__file-name", null, name),
          h("span.result__file-size" + (over ? ".is-over" : ""), null, util.formatKb(bytes || 0)),
          note ? h("span.result__file-note", null, note) : null
        )
      );
    };
    if (isHtml) row(r.htmlFile, r.htmlBytes, r.htmlNote, !!r.htmlNote);
    row(r.file, r.bytes, r.note, r.limitBytes && r.bytes > r.limitBytes);
    box.appendChild(h("div.result__top", null, h("span.result__text", null, "Ferdig!"), primary));
    box.appendChild(files);
    if (isHtml) {
      box.appendChild(
        h("div.result__alt", null, h("span.result__alt-label", null, "reservebilde til CM360:"), h("a.result__alt-link", { href: downloadUrl(res.id, ""), download: "" }, "Last ned bilde"))
      );
    }
    (res.warnings || []).forEach(function (w) {
      box.appendChild(h("p.notice.notice--warning.pu-result__warn", null, w));
    });
    box.hidden = false;
    try {
      primary.click();
    } catch (e) {
      /* the visible link is the fallback */
    }
  }

  function generate() {
    if (state.busy || missing()) return;
    state.busy = true;
    panel.result.hidden = true;
    panel.refresh(state, fit);
    fetch("/api/puff/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc: state.doc, filename: fileBase(), outputType: state.outputType, format: state.format }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || "Eksporten feilet");
          return body;
        });
      })
      .then(function (body) {
        showResult(body);
        window.dispatchEvent(new CustomEvent("puff:exported", { detail: body }));
      })
      .catch(function (err) {
        util.toast(err.message, "err");
      })
      .then(function () {
        state.busy = false;
        panel.refresh(state, fit);
      });
  }

  function openProject(url) {
    activate();
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Fant ikke prosjektet");
        return res.json();
      })
      .then(function (p) {
        state.doc = Ad.normalizeDoc(p.doc);
        state.filename = p.filename || "";
        state.outputType = p.outputType === "image" ? "image" : "html";
        state.format = ["png", "jpeg", "auto"].indexOf(p.format) !== -1 ? p.format : "png";
        panel.result.hidden = true;
        commit();
        util.toast("Artikkelpuffen er åpnet – endre og lag den på nytt.");
      })
      .catch(function (err) {
        util.toast(err.message, "err");
      });
  }

  // ---- build ----------------------------------------------------------------------------
  var app = {
    setSlot: setSlot,
    setCrop: setCrop,
    setDoc: setDoc,
    moveSlot: moveSlot,
    clearSlot: clearSlot,
    addFiles: addFiles,
    setPosterTime: setPosterTime,
    uploadLogo: uploadLogo,
    set: set,
    fileBase: fileBase,
    missing: missing,
    generate: generate,
  };

  function build() {
    var view = document.getElementById("view-puff");
    var form = h("form.panel.form.pu-form", { novalidate: true, autocomplete: "off" });
    var stageHost = h("div.pu-stage");
    var spec = h(
      "dl.pu-spec",
      null,
      h("div", null, h("dt", null, "Format"), h("dd", null, "980×600")),
      h("div", null, h("dt", null, "Hovedsak"), h("dd", null, "620×413")),
      h("div", null, h("dt", null, "Sak 2 og 3"), h("dd", null, "276×183")),
      h("div", null, h("dt", null, "Overskrift"), h("dd", null, "Noto Serif Bold 33 / 19 px")),
      h("div", null, h("dt", null, "Merking"), h("dd", null, "Noto Sans Bold 21 px")),
      h("div", null, h("dt", null, "Bakgrunn"), h("dd", null, "#F5F5F5"))
    );
    var preview = h(
      "div.panel.previews.pu-preview",
      null,
      h("div.previews__head", null, h("h2", null, "Forhåndsvisning"), h("span.previews__note", null, "Dra i et bilde for å flytte utsnittet – slipp filer rett på en sak")),
      h("div.previews__body.pu-preview__body", null, stageHost, spec)
    );
    view.appendChild(h("div.workspace.pu", null, form, preview));
    panel = PUFF.panel.create(form, app);
    stage = PUFF.stage.create(stageHost, {
      onPan: function (i, crop) {
        setSlot(i, { crop: crop });
      },
      onReset: function (i) {
        setCrop(i, { zoom: 0, x: 50, y: 50 });
      },
      onFiles: addFiles,
      onPick: function (i) {
        var chooser = document.querySelector('.pu-slot[data-slot="' + i + '"] input[type="file"]');
        if (chooser) chooser.click();
      },
      onPickLogo: function () {
        var chooser = document.querySelector('.pu-logo input[type="file"]');
        if (chooser) chooser.click();
      },
      onLogoFile: uploadLogo,
      onFit: function (result) {
        fit = result;
        panel.refresh(state, fit);
      },
    });
    built = true;
  }

  function activate() {
    if (!built) {
      restore();
      build();
    }
    render();
    stage.resize();
  }

  PUFF.main = { activate: activate, openProject: openProject, state: state };
})();
