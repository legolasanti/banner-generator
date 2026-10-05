/* =========================================================================
   editor/storage.js — images in, designs saved.

   WPE.assets   uploading images (file, drop, paste, URL) and placing them.
                Uploads go to the server, which stores them by content hash;
                the design refers to that id, so the JSON stays small and the
                exporter reads the full-quality original.
   WPE.storage  autosave (IndexedDB, per browser), and project files — one
                self-contained .json with the images embedded, for handing a
                design to a colleague or keeping it outside the app.
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Doc = window.WallpaperDoc;
  var store = WPE.store;
  var util = WPE.util;

  var MAX_BYTES = 25 * 1024 * 1024;
  var TYPES = /^image\/(jpeg|png|webp|avif|gif)$/;
  var FILE_APP = "banner-generator-wallpaper";

  // ---- IndexedDB (tiny key/value) -----------------------------------------------
  var dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve, reject) {
        if (!window.indexedDB) return reject(new Error("IndexedDB mangler"));
        var req = indexedDB.open("wallpaper-editor", 1);
        req.onupgradeneeded = function () {
          req.result.createObjectStore("kv");
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    return dbPromise;
  }
  function kvGet(key) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var req = d.transaction("kv").objectStore("kv").get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function kvSet(key, value) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction("kv", "readwrite");
        tx.objectStore("kv").put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  // ---- assets ----------------------------------------------------------------------
  var recent = [];
  var recentListeners = [];

  function rememberAsset(a) {
    recent = [a].concat(recent.filter(function (r) { return r.id !== a.id; })).slice(0, 80);
    kvSet("assets", recent).catch(function () {});
    recentListeners.forEach(function (fn) { fn(recent); });
  }

  function naturalSize(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
      img.onerror = function () { resolve({ width: 0, height: 0 }); };
      img.src = url;
    });
  }

  /** Upload one image file. Resolves to {id, url, width, height, name}. */
  function upload(file) {
    if (!file || !TYPES.test(file.type)) {
      return Promise.reject(new Error("Kun JPG, PNG, WEBP, AVIF eller GIF kan brukes"));
    }
    if (file.size > MAX_BYTES) return Promise.reject(new Error("Bildet er for stort (maks 25 MB)"));
    var fd = new FormData();
    fd.append("file", file, file.name || "bilde");
    return fetch("/api/wallpaper/assets", { method: "POST", body: fd })
      .then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok) throw new Error(j.error || "Opplasting feilet");
          return j;
        });
      })
      .then(function (j) {
        // The browser's own reading of the size is what the canvas will show
        // (EXIF orientation included), so it wins over the server's.
        return naturalSize(j.url).then(function (n) {
          var a = {
            id: j.id,
            url: j.url,
            width: n.width || j.width,
            height: n.height || j.height,
            opaque: j.opaque === true || /\.jpg$/.test(j.id),
            name: (file.name || "bilde").slice(0, 80),
          };
          rememberAsset(a);
          return a;
        });
      });
  }

  /** An image element for `asset`, fitted into the artboard around `center`. */
  function imageElement(asset, center) {
    var spec = store.boardSpec();
    var nw = asset.width || 800;
    var nh = asset.height || 600;
    var scale = Math.min(1, (spec.width * 0.45) / nw, (spec.height * 0.8) / nh);
    var w = Math.max(8, Math.round(nw * scale));
    var hgt = Math.max(8, Math.round(nh * scale));
    var c = center || WPE.canvas.viewCenter();
    return Doc.createElement("image", {
      asset: asset.id,
      natW: nw,
      natH: nh,
      opaque: !!asset.opaque || /\.jpg$/.test(asset.id),
      x: Math.round(c.x - w / 2),
      y: Math.round(c.y - hgt / 2),
      w: w,
      h: hgt,
      name: asset.name ? asset.name.replace(/\.[a-z0-9]+$/i, "") : "",
    });
  }

  function placeAsset(asset, center) {
    store.checkpoint();
    return store.add(imageElement(asset, center));
  }

  function placeFile(file, center) {
    WPE.toast("Laster opp " + (file.name || "bilde") + " …");
    return upload(file)
      .then(function (a) {
        placeAsset(a, center);
      })
      .catch(function (err) {
        WPE.toast(err.message || "Opplasting feilet", "err");
      });
  }

  /** Fetch an image from a link (through the server's safe fetcher), then upload it. */
  function fromUrl(url) {
    return util
      .postJson("/api/fetch-image", { url: url })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        return fetch(data.dataUrl)
          .then(function (r) { return r.blob(); })
          .then(function (blob) {
            var ext = (data.mimetype || "image/png").split("/")[1];
            return upload(new File([blob], (data.name || "bilde") + "." + ext, { type: data.mimetype }));
          });
      });
  }

  /**
   * A finished design (a full-size PNG/JPG from Canva, Photoshop…) as the
   * artboard's bottom layer, full-bleed and locked, so text and buttons can
   * still be added on top as live text.
   */
  function importDesign(file) {
    var spec = store.boardSpec();
    return upload(file).then(function (a) {
      store.checkpoint();
      var el = Doc.createElement("image", {
        asset: a.id, natW: a.width, natH: a.height, opaque: !!a.opaque,
        x: 0, y: 0, w: spec.width, h: spec.height,
        fit: "cover", locked: true, name: "Ferdig design",
      });
      store.add(el, { atBottom: true });
      var ratio = a.width / a.height;
      var want = spec.width / spec.height;
      if (a.width < spec.width || a.height < spec.height) {
        WPE.toast("Bildet er mindre enn " + spec.width + "×" + spec.height + " – det blir forstørret og kan se uskarpt ut", "err");
      } else if (Math.abs(ratio - want) / want > 0.03) {
        WPE.toast("Bildet har et annet format enn " + spec.width + "×" + spec.height + " – det beskjæres for å fylle flaten", "err");
      } else {
        WPE.toast("Designet er lagt inn som låst bakgrunn på " + spec.name.toLowerCase(), "ok");
      }
      return el;
    });
  }

  // ---- autosave ---------------------------------------------------------------------
  var statusListeners = [];
  function setStatus(s) {
    statusListeners.forEach(function (fn) { fn(s); });
  }

  var autosave = util.debounce(function () {
    kvSet("autosave", { doc: store.state.doc, savedAt: Date.now() })
      .then(function () { setStatus("saved"); })
      .catch(function () { setStatus("error"); });
  }, 700);

  function startAutosave() {
    store.subscribe(function (what) {
      if (what !== "doc") return;
      setStatus("saving");
      autosave();
    });
  }

  function restore() {
    return Promise.all([
      kvGet("autosave").catch(function () { return null; }),
      kvGet("assets").catch(function () { return null; }),
    ]).then(function (r) {
      if (Array.isArray(r[1])) recent = r[1].filter(function (a) { return a && Doc.ASSET_ID.test(a.id); });
      if (r[0] && r[0].doc) {
        store.load(r[0].doc, { resetHistory: true });
        return true;
      }
      return false;
    });
  }

  // ---- project files ------------------------------------------------------------------
  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(blob);
    });
  }

  function saveProjectFile() {
    var doc = store.state.doc;
    var ids = Doc.usedAssets(doc);
    return Promise.all(
      ids.map(function (id) {
        return fetch("/wp-assets/" + encodeURIComponent(id))
          .then(function (r) {
            if (!r.ok) throw new Error("Mangler bilde " + id.slice(0, 8));
            return r.blob();
          })
          .then(blobToDataUrl)
          .then(function (data) { return [id, data]; });
      })
    ).then(function (pairs) {
      var assets = {};
      pairs.forEach(function (p) { assets[p[0]] = p[1]; });
      var payload = { app: FILE_APP, version: Doc.VERSION, savedAt: new Date().toISOString(), doc: doc, assets: assets };
      var name = (doc.name || "wallpaper").toLowerCase().replace(/[^a-z0-9æøå]+/gi, "-").replace(/^-|-$/g, "") || "wallpaper";
      util.saveBlob(new Blob([JSON.stringify(payload)], { type: "application/json" }), name + ".wallpaper.json");
    });
  }

  function remap(doc, map) {
    var boards = {};
    Object.keys(doc.artboards || {}).forEach(function (k) {
      var b = doc.artboards[k] || {};
      boards[k] = Object.assign({}, b, {
        elements: (b.elements || []).map(function (el) {
          return el && el.type === "image" && map[el.asset] ? Object.assign({}, el, { asset: map[el.asset] }) : el;
        }),
      });
    });
    return Object.assign({}, doc, { artboards: boards });
  }

  function openProjectFile(file) {
    return file
      .text()
      .then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (_) {
          throw new Error("Filen er ikke et gyldig prosjekt");
        }
        if (!data || data.app !== FILE_APP || !data.doc) throw new Error("Filen er ikke et Wallpaper-prosjekt");
        var entries = Object.keys(data.assets || {}).filter(function (id) {
          return typeof data.assets[id] === "string" && /^data:image\//.test(data.assets[id]);
        });
        return Promise.all(
          entries.map(function (id) {
            return fetch(data.assets[id])
              .then(function (r) { return r.blob(); })
              .then(function (blob) { return upload(new File([blob], "bilde", { type: blob.type })); })
              .then(function (a) { return [id, a.id]; });
          })
        ).then(function (pairs) {
          var map = {};
          pairs.forEach(function (p) { map[p[0]] = p[1]; });
          store.load(Doc.normalizeDoc(remap(data.doc, map)));
          WPE.toast("Prosjektet er åpnet", "ok");
        });
      });
  }

  /** Reopen a design saved with an export (history → «Rediger»). */
  function openFromUrl(url) {
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("Fant ikke prosjektet");
        return r.json();
      })
      .then(function (doc) {
        store.load(Doc.normalizeDoc(doc));
        WPE.toast("Designet er åpnet fra historikken", "ok");
      });
  }

  WPE.assets = {
    upload: upload,
    placeFile: placeFile,
    placeAsset: placeAsset,
    fromUrl: fromUrl,
    importDesign: importDesign,
    recent: function () { return recent; },
    onRecent: function (fn) { recentListeners.push(fn); },
  };
  WPE.storage = {
    startAutosave: startAutosave,
    restore: restore,
    saveProjectFile: saveProjectFile,
    openProjectFile: openProjectFile,
    openFromUrl: openFromUrl,
    onStatus: function (fn) { statusListeners.push(fn); },
  };
})();
