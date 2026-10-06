/* =========================================================================
   app/media.js — the project's photos and videos.

   Ways in: drag & drop or choose files, paste an image URL, or import from a
   shared Google Drive folder (where the team keeps the shoot). Videos are
   measured in the browser (size, length) and get a poster frame grabbed
   from about a second in, so a page never shows a black box while the video
   loads.

   The same grid serves as the media panel and as the picker that image and
   video fields open (pick({kind}) → Promise<assetId|null>).
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var Doc = window.NativeDoc;

  var IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/;
  var VIDEO_TYPES = /^video\/(mp4|webm|quicktime)$/;

  function project() {
    return NP.store.get().project;
  }

  function usedIds() {
    var set = {};
    Doc.usedAssets(project()).forEach(function (id) { set[id] = true; });
    return set;
  }

  // ---- uploads ---------------------------------------------------------------
  function measureVideo(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.playsInline = true;
      var done = false;
      function finish(meta, poster) {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        resolve({ meta: meta, poster: poster });
      }
      v.onloadedmetadata = function () {
        var meta = { w: v.videoWidth, h: v.videoHeight, duration: v.duration };
        v.currentTime = Math.min(1, (v.duration || 2) / 3);
        v.onseeked = function () {
          try {
            var c = document.createElement("canvas");
            var scale = Math.min(1, 1920 / (v.videoWidth || 1920));
            c.width = Math.round(v.videoWidth * scale);
            c.height = Math.round(v.videoHeight * scale);
            c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
            c.toBlob(function (blob) { finish(meta, blob); }, "image/jpeg", 0.86);
          } catch (_) {
            finish(meta, null);
          }
        };
      };
      v.onerror = function () { finish({}, null); };
      setTimeout(function () { finish({}, null); }, 15000);
      v.src = url;
    });
  }

  /** Upload files; resolves the stored asset metadata (videos with poster). */
  function uploadFiles(files, onProgress) {
    var list = Array.prototype.slice.call(files || []);
    var out = [];
    var i = 0;
    function next() {
      if (i >= list.length) return Promise.resolve(out);
      var file = list[i++];
      var report = function (p) { if (onProgress) onProgress(file.name, (i - 1 + p) / list.length); };
      var job;
      if (IMAGE_TYPES.test(file.type) || /\.(jpe?g|png|webp|gif|avif)$/i.test(file.name)) {
        job = NP.api.upload("/api/native/assets/image", file, {}, report).then(function (r) { out.push(r.asset); });
      } else if (VIDEO_TYPES.test(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
        job = measureVideo(file).then(function (m) {
          var posterJob = m.poster
            ? NP.api.upload("/api/native/assets/image", new File([m.poster], file.name.replace(/\.\w+$/, "") + "-poster.jpg", { type: "image/jpeg" }), {})
            : Promise.resolve(null);
          return posterJob.then(function (pr) {
            return NP.api.upload("/api/native/assets/video", file, { w: m.meta.w, h: m.meta.h, duration: m.meta.duration }, report).then(function (r) {
              if (pr) {
                out.push(pr.asset);
                r.asset.poster = pr.asset.id;
              }
              out.push(r.asset);
            });
          });
        });
      } else if (/\.(heic|heif)$/i.test(file.name)) {
        job = Promise.reject(new Error(file.name + ": HEIC støttes ikke. Eksporter som JPG først."));
      } else {
        job = Promise.reject(new Error(file.name + ": filtypen støttes ikke"));
      }
      return job.catch(function (err) { ui.toast(err.message, "err"); }).then(next);
    }
    return next();
  }

  function uploadAndAdd(files, status) {
    if (!files || !files.length) return Promise.resolve([]);
    if (status) status.textContent = "Laster opp …";
    return uploadFiles(files, function (name, p) {
      if (status) status.textContent = "Laster opp " + name + " – " + Math.round(p * 100) + " %";
    }).then(function (assets) {
      if (status) status.textContent = "";
      NP.store.addAssets(assets);
      if (assets.length) ui.toast(assets.length === 1 ? "Filen er lagt til" : assets.length + " filer er lagt til", "ok");
      return assets;
    });
  }

  function importUrl() {
    return ui.prompt("Hent bilde fra lenke", "Bildeadresse (https://…)", "", "Hent").then(function (url) {
      if (!url) return null;
      return NP.api.post("/api/native/assets/url", { url: url }).then(function (r) {
        NP.store.addAssets([r.asset]);
        ui.toast("Bildet er lagt til", "ok");
        return r.asset;
      }, function (err) { ui.toast(err.message, "err"); return null; });
    });
  }

  // ---- Google Drive ---------------------------------------------------------------------
  function driveDialog(opts) {
    var o = opts || {};
    return new Promise(function (resolve) {
      var input = h("input.nx-input", { type: "url", placeholder: "https://drive.google.com/drive/folders/…", value: o.url || "" });
      var listBox = h("div.nx-drive");
      var status = h("p.nx-muted");
      var importBtn = ui.button("Importer valgte", { kind: "primary", disabled: true, onClick: doImport });
      var files = [];
      var chosen = {};
      var docs = [];

      function load() {
        var url = input.value.trim();
        if (!url) return;
        status.textContent = "Leser mappen …";
        ui.clear(listBox);
        NP.api.source("drive", { url: url }).then(function (r) {
          files = r.files.filter(function (f) { return f.kind === "image" || f.kind === "video" || f.kind === "heic"; });
          docs = r.files.filter(function (f) { return f.kind === "gdoc"; });
          files.forEach(function (f) { if (f.kind !== "heic") chosen[f.id] = true; });
          status.textContent = files.length
            ? files.length + " bilder/videoer" + (docs.length ? " og " + docs.length + " Google-dokument" : "") + " i mappen."
            : "Fant ingen bilder eller videoer i mappen." + (docs.length ? " (Men " + docs.length + " dokument.)" : "");
          render();
        }, function (err) {
          status.textContent = err.message;
        });
      }

      function render() {
        ui.clear(listBox);
        files.forEach(function (f) {
          var check = h("input", { type: "checkbox", checked: !!chosen[f.id], disabled: f.kind === "heic" });
          check.addEventListener("change", function () {
            chosen[f.id] = check.checked;
            sync();
          });
          listBox.appendChild(
            h(
              "label.nx-drive__item" + (f.kind === "heic" ? ".is-off" : ""),
              { title: f.kind === "heic" ? "HEIC kan ikke importeres – eksporter som JPG" : f.name },
              check,
              h("span.nx-drive__thumb", null, h("img", { src: f.thumb, alt: "", loading: "lazy", referrerpolicy: "no-referrer", on: { error: function (e) { e.target.replaceWith(ui.icon(f.kind === "video" ? "clapperboard" : "image", 22)); } } })),
              h("span.nx-drive__name", null, f.name),
              h("span.nx-tag", null, f.kind === "video" ? "Video" : f.kind === "heic" ? "HEIC" : "Bilde")
            )
          );
        });
        if (docs.length && o.onDoc) {
          listBox.appendChild(h("p.nx-muted.nx-span", null, "Dokumenter i mappen – bruk som kilde:"));
          docs.forEach(function (d) {
            listBox.appendChild(ui.button(d.name, {
              icon: "file-text",
              small: true,
              onClick: function () { o.onDoc("https://docs.google.com/document/d/" + d.id + "/edit"); },
            }));
          });
        }
        sync();
      }

      function sync() {
        var n = files.filter(function (f) { return chosen[f.id]; }).length;
        importBtn.disabled = !n;
        importBtn.querySelector("span").textContent = n ? "Importer " + n + (n === 1 ? " fil" : " filer") : "Importer valgte";
      }

      function doImport() {
        var pickList = files.filter(function (f) { return chosen[f.id]; }).map(function (f) {
          return { id: f.id, name: f.name, kind: f.kind, w: f.w, h: f.h, duration: f.duration };
        });
        importBtn.disabled = true;
        var done = [];
        var errors = [];
        // In batches, so the user sees progress and one huge video does not
        // hold everything up.
        var batches = [];
        for (var i = 0; i < pickList.length; i += 4) batches.push(pickList.slice(i, i + 4));
        var k = 0;
        function step() {
          if (k >= batches.length) return Promise.resolve();
          status.textContent = "Henter " + Math.min(pickList.length, (k + 1) * 4) + " av " + pickList.length + " …";
          return NP.api.post("/api/native/sources/drive/import", { files: batches[k++] }).then(function (r) {
            done = done.concat(r.assets);
            errors = errors.concat(r.errors);
          }).then(step);
        }
        step().then(function () {
          NP.store.addAssets(done);
          status.textContent = "";
          if (errors.length) ui.toast(errors.length + " filer kunne ikke hentes: " + errors[0].error, "err");
          if (done.length) ui.toast(done.length + " filer importert fra Drive", "ok");
          m.close(done);
        }, function (err) {
          status.textContent = err.message;
          importBtn.disabled = false;
        });
      }

      input.addEventListener("keydown", function (e) { if (e.key === "Enter") load(); });
      var m = ui.modal({
        title: "Importer fra Google Drive",
        wide: true,
        body: h(
          "div.nx-stack",
          null,
          h("p.nx-muted", null, "Mappen må være delt som «Alle med lenken» (Leser). Bilder får automatisk mindre WebP-versjoner; videoer hentes i originalstørrelse."),
          h("div.nx-row", null, input, ui.button("Les mappen", { onClick: load })),
          status,
          listBox
        ),
        actions: [ui.button("Lukk", { kind: "ghost", onClick: function () { m.close([]); } }), importBtn],
        onClose: function (r) { resolve(r || []); },
      });
      if (o.url) load();
    });
  }

  // ---- focal point -----------------------------------------------------------------------
  function focalDialog(id) {
    var meta = project().assets[id];
    if (!meta) return;
    var dot = h("span.nx-focal__dot");
    var img = h("img", { src: ui.thumb(meta, id, 960), alt: "" });
    var box = h("div.nx-focal", null, img, dot);
    var pos = { x: meta.focal ? meta.focal.x : 50, y: meta.focal ? meta.focal.y : 50 };
    function place() {
      dot.style.left = pos.x + "%";
      dot.style.top = pos.y + "%";
    }
    box.addEventListener("pointerdown", function (e) {
      var r = img.getBoundingClientRect();
      pos = { x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) };
      place();
    });
    place();
    var m = ui.modal({
      title: "Fokuspunkt",
      body: h("div.nx-stack", null, h("p.nx-muted", null, "Klikk på det viktigste i bildet. Når bildet beskjæres (mobil, hero, kvadrat), holdes dette punktet synlig."), box),
      actions: [
        ui.button("Avbryt", { kind: "ghost", onClick: function () { m.close(); } }),
        ui.button("Lagre", { kind: "primary", onClick: function () { NP.store.setAsset(id, { focal: pos }); m.close(); } }),
      ],
    });
  }

  // ---- AI helpers ------------------------------------------------------------------------
  function aiAlt(id, input) {
    var btnState = ui.toast("Lager alt-tekst …");
    return NP.api.ai("alt", { projectId: project().id, assetId: id }).then(function (r) {
      NP.store.setAsset(id, { alt: r.alt, desc: r.description });
      if (input) input.value = r.alt;
      ui.toast("Alt-tekst laget – sjekk at den stemmer", "ok");
      return btnState;
    }, function (err) { ui.toast(err.message, "err"); });
  }

  function aiImageDialog() {
    return new Promise(function (resolve) {
      var p = project();
      var prompt = h("textarea.nx-input.nx-textarea", { rows: 4, placeholder: "F.eks.: En familie lader bilen utenfor en hytte på fjellet en høstkveld, varmt lys fra vinduene." });
      var aspect = "16:9";
      var seg = ui.segmented([["16:9", "16:9"], ["4:3", "4:3"], ["1:1", "1:1"], ["3:4", "3:4"], ["9:16", "9:16"]], aspect, function (v) { aspect = v; }, { small: true });
      var refs = {};
      var refBox = h("div.nx-refs");
      Object.keys(p.assets).filter(function (id) { return p.assets[id].kind === "image"; }).slice(0, 24).forEach(function (id) {
        var b = h("button.nx-ref", { type: "button", title: "Bruk som referanse", "aria-pressed": "false", on: { click: function () {
          refs[id] = !refs[id];
          b.setAttribute("aria-pressed", String(!!refs[id]));
        } } }, h("img", { src: ui.thumb(p.assets[id], id, 160), alt: "" }));
        refBox.appendChild(b);
      });
      var status = h("p.nx-muted");
      var go = ui.button("Lag bilde", { kind: "primary", icon: "sparkles", onClick: function () {
        go.disabled = true;
        status.textContent = "Lager bildet – dette tar gjerne 20–60 sekunder …";
        NP.api.ai("image", {
          projectId: p.id,
          prompt: prompt.value,
          aspect: aspect,
          referenceIds: Object.keys(refs).filter(function (k) { return refs[k]; }),
        }).then(function (r) {
          NP.store.addAssets([r.asset]);
          ui.toast("Bildet er laget (" + ui.money(r.cost) + ") – merk det som illustrasjon", "ok");
          m.close(r.asset.id);
        }, function (err) {
          status.textContent = err.message;
          go.disabled = false;
        });
      } });
      var m = ui.modal({
        title: "Lag illustrasjon med AI",
        wide: true,
        body: h(
          "div.nx-stack",
          null,
          h("label.nx-field", null, h("span.nx-field__label", null, "Beskriv bildet"), prompt),
          h("div.nx-field", null, h("span.nx-field__label", null, "Format"), seg),
          refBox.childNodes.length ? h("div.nx-field", null, h("span.nx-field__label", null, "Referansebilder (valgfritt) – produktet skal se riktig ut"), refBox) : null,
          h("p.nx-note", null, ui.icon("info", 15), " AI-bilder er illustrasjoner, ikke dokumentasjon. Vær Varsom-plakaten 4.11: manipulerte bilder skal være tydelig merket. Bruk aldri AI-bilder som bevis for produktegenskaper."),
          status
        ),
        actions: [ui.button("Avbryt", { kind: "ghost", onClick: function () { m.close(null); } }), go],
        onClose: function (r) { resolve(r || null); },
      });
    });
  }

  // ---- the grid ------------------------------------------------------------------------------
  /**
   * A media grid. opts.kind filters (image/video), opts.onPick makes cards
   * selectable, otherwise cards show alt text and tools.
   */
  function grid(opts) {
    var o = opts || {};
    var root = h("div.nx-media");
    var filter = o.kind || "all";
    var status = h("span.nx-muted.nx-media__status");
    var fileInput = h("input", { type: "file", multiple: true, hidden: true, accept: o.kind === "video" ? "video/*" : o.kind === "image" ? "image/*" : "image/*,video/*" });
    fileInput.addEventListener("change", function () {
      uploadAndAdd(fileInput.files, status).then(function (assets) {
        fileInput.value = "";
        if (o.onPick && assets.length === 1 && (!o.kind || assets[0].kind === o.kind)) o.onPick(assets[0].id);
      });
    });
    var tools = h(
      "div.nx-media__tools",
      null,
      ui.button("Last opp", { icon: "upload", small: true, kind: "primary", onClick: function () { fileInput.click(); } }),
      ui.button("Fra Drive", { icon: "cloud-download", small: true, onClick: function () { driveDialog().then(draw); } }),
      o.kind !== "video" ? ui.button("Fra lenke", { icon: "link", small: true, onClick: function () { importUrl().then(function (a) { draw(); if (a && o.onPick) o.onPick(a.id); }); } }) : null,
      o.kind !== "video" && NP.aiConfigured ? ui.button("Lag med AI", { icon: "sparkles", small: true, onClick: function () { aiImageDialog().then(function (id) { draw(); if (id && o.onPick) o.onPick(id); }); } }) : null,
      fileInput,
      status
    );
    var filters = o.kind
      ? null
      : ui.segmented([["all", "Alle"], ["image", "Bilder"], ["video", "Video"]], filter, function (v) { filter = v; draw(); }, { small: true });
    var list = h("div.nx-media__grid");
    root.appendChild(tools);
    if (filters) root.appendChild(filters);
    root.appendChild(list);

    // Drop files anywhere on the grid.
    root.addEventListener("dragover", function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") !== -1) {
        e.preventDefault();
        root.classList.add("is-drop");
      }
    });
    root.addEventListener("dragleave", function (e) {
      if (!root.contains(e.relatedTarget)) root.classList.remove("is-drop");
    });
    root.addEventListener("drop", function (e) {
      e.preventDefault();
      root.classList.remove("is-drop");
      uploadAndAdd(e.dataTransfer.files, status).then(draw);
    });

    function card(id, meta, used) {
      var poster = meta.kind === "video" ? meta.poster : id;
      var pmeta = poster && project().assets[poster];
      var img = pmeta ? h("img", { src: ui.thumb(pmeta, poster, 320), alt: "", loading: "lazy" }) : h("div.nx-media__vid", null, ui.icon("clapperboard", 26));
      if (o.onPick) {
        return h(
          "button.nx-media__card.is-pick",
          { type: "button", title: meta.name, on: { click: function () { o.onPick(id); } } },
          h("span.nx-media__img", null, img, meta.kind === "video" ? h("span.nx-media__badge", null, ui.icon("play", 12), " " + fmtDur(meta.duration)) : null),
          h("span.nx-media__name", null, meta.name || "–")
        );
      }
      var alt = h("input.nx-input.nx-input--sm", { type: "text", value: meta.alt || "", placeholder: meta.kind === "image" ? "Alt-tekst (påkrevd)" : "Beskrivelse", maxlength: 300 });
      alt.addEventListener("input", function () { NP.store.setAsset(id, { alt: alt.value }); });
      return h(
        "div.nx-media__card" + (meta.kind === "image" && !meta.alt ? ".needs-alt" : ""),
        null,
        h("span.nx-media__img", null, img,
          used ? h("span.nx-media__used", { title: "I bruk på siden" }, ui.icon("check", 12)) : null,
          meta.kind === "video" ? h("span.nx-media__badge", null, ui.icon("play", 12), " " + fmtDur(meta.duration)) : null,
          meta.source === "ai" ? h("span.nx-media__badge.nx-media__badge--ai", null, "AI") : null
        ),
        h("span.nx-media__name", { title: meta.name }, meta.name || "–"),
        h("span.nx-muted.nx-media__dim", null, meta.w && meta.h ? meta.w + " × " + meta.h : "", meta.bytes ? " · " + fmtBytes(meta.bytes) : ""),
        alt,
        h(
          "span.nx-media__acts",
          null,
          meta.kind === "image" && NP.aiConfigured ? ui.button("", { icon: "sparkles", small: true, kind: "ghost", title: "Lag alt-tekst med AI", onClick: function () { aiAlt(id, alt); } }) : null,
          meta.kind === "image" ? ui.button("", { icon: "crosshair", small: true, kind: "ghost", title: "Fokuspunkt", onClick: function () { focalDialog(id); } }) : null,
          ui.button("", { icon: "trash", small: true, kind: "ghost", title: used ? "I bruk – fjern den fra siden først" : "Fjern fra prosjektet", disabled: used, onClick: function () {
            NP.store.update(function (p) {
              var assets = Object.assign({}, p.assets);
              delete assets[id];
              return Object.assign({}, p, { assets: assets });
            });
            draw();
          } })
        )
      );
    }

    function draw() {
      ui.clear(list);
      var p = project();
      var used = usedIds();
      // Posters belong to their video; they are not listed on their own.
      var posters = {};
      Object.keys(p.assets).forEach(function (id) { if (p.assets[id].kind === "video" && p.assets[id].poster) posters[p.assets[id].poster] = true; });
      var ids = Object.keys(p.assets).filter(function (id) {
        var a = p.assets[id];
        if (a.kind === "font" || posters[id]) return false;
        return filter === "all" || a.kind === filter;
      });
      if (!ids.length) {
        list.appendChild(ui.empty("images", "Ingen filer ennå", "Dra bilder eller videoer hit, eller hent dem fra Google Drive."));
        return;
      }
      ids.reverse().forEach(function (id) { list.appendChild(card(id, p.assets[id], !!used[id])); });
    }
    draw();
    root.refresh = draw;
    return root;
  }

  function fmtDur(s) {
    if (!s) return "";
    var m = Math.floor(s / 60);
    return m + ":" + String(Math.round(s % 60)).padStart(2, "0");
  }

  function fmtBytes(b) {
    return b > 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.round(b / 1024) + " KB";
  }

  /** Open the picker. Resolves the chosen asset id, or null. */
  function pick(opts) {
    var o = opts || {};
    return new Promise(function (resolve) {
      var chosen = null;
      var m = ui.modal({
        title: o.kind === "video" ? "Velg video" : "Velg bilde",
        full: true,
        body: grid({ kind: o.kind, onPick: function (id) { chosen = id; m.close(); } }),
        onClose: function () { resolve(chosen); },
      });
    });
  }

  NP.media = { grid: grid, pick: pick, uploadAndAdd: uploadAndAdd, driveDialog: driveDialog, aiImageDialog: aiImageDialog, focalDialog: focalDialog };
})();
