/* =========================================================================
   app.js — Banner Generator frontend.
   No framework. Talks to the Express API, drives the live previews via the
   shared window.renderBanner(), handles upload + drag-to-reframe, history and
   settings. Live previews use the SAME renderer as the final PNG output.
   ========================================================================= */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  const CUSTOM = "__custom__";
  const DEFAULTS = {
    gamePresets: [
      { id: "vikinglotto", label: "Vikinglotto", vinnersjanse: "Vinnersjanse 1.premie 1:61 mill. per rekke" },
      { id: "eurojackpot", label: "Eurojackpot", vinnersjanse: "Vinnersjanse 1.premie 1:140 mill. per rekke" },
      { id: "lotto", label: "Lotto", vinnersjanse: "Vinnersjanse 1.premie 1:5,4 mill. per rekke" },
      { id: "sport", label: "Sport (ingen vinnersjanse)", vinnersjanse: "" },
    ],
    staticBadges: { annonseText: "Annonse", ageBadgeText: "18+ | Hjelpelinjen.no" },
    export: { jpegQuality: 92, includeTimestampInFilename: false },
  };

  const state = {
    settings: JSON.parse(JSON.stringify(DEFAULTS)),
    imageDataUrl: null,
    imageBlob: null,
    imageName: "bilde.png",
    posX: 50,
    posY: 50,
    zoom: 0,
    headlineScale: 1,
    subtitleScale: 1,
    lesMerStyle: "text",
    accentColor: "#000000",
    logoVersion: 0,
    lastBlobUrl: null,
  };

  const IMAGE_MIME_RE = /^image\/(jpeg|png|webp|avif|gif)$/;

  // -------- element refs ----------------------------------------------------
  const el = {
    tabs: $$(".tab"),
    viewNew: $("#view-new"),
    viewHistory: $("#view-history"),
    historyCount: $("#historyCount"),

    dropzone: $("#dropzone"),
    fileInput: $("#fileInput"),
    dropzoneEmpty: $("#dropzoneEmpty"),
    dropzoneFile: $("#dropzoneFile"),
    fileName: $("#fileName"),
    fileSize: $("#fileSize"),
    removeImage: $("#removeImage"),
    imageUrl: $("#imageUrl"),
    fetchUrlBtn: $("#fetchUrlBtn"),

    cropField: $("#cropField"),
    cropFrame: $("#cropFrame"),
    cropImg: $("#cropImg"),
    zoomInput: $("#zoom"),
    zoomOut: $("#zoomOut"),
    posXInput: $("#posX"),
    posYInput: $("#posY"),
    posXOut: $("#posXOut"),
    posYOut: $("#posYOut"),

    headline: $("#headline"),
    headlineCount: $("#headlineCount"),
    subtitle: $("#subtitle"),
    subtitleCount: $("#subtitleCount"),
    headlineScale: $("#headlineScale"),
    headlineScaleOut: $("#headlineScaleOut"),
    subtitleScale: $("#subtitleScale"),
    subtitleScaleOut: $("#subtitleScaleOut"),
    brandLabel: $("#brandLabel"),
    gameType: $("#gameType"),
    customVinnerField: $("#customVinnerField"),
    customVinner: $("#customVinner"),
    lesMerStyle: $("#lesMerStyle"),
    accentColor: $("#accentColor"),
    accentHex: $("#accentHex"),
    filename: $("#filename"),
    filenamePreview: $("#filenamePreview"),

    form: $("#bannerForm"),
    generateBtn: $("#generateBtn"),
    result: $("#result"),
    downloadLink: $("#downloadLink"),

    previews: {
      readpeak: $("#preview-readpeak"),
      desktop: $("#preview-desktop"),
      mobile: $("#preview-mobile"),
    },

    historyGrid: $("#historyGrid"),
    historyEmpty: $("#historyEmpty"),

    openSettings: $("#openSettings"),
    closeSettings: $("#closeSettings"),
    drawer: $("#settingsDrawer"),
    drawerOverlay: $("#drawerOverlay"),
    presetsList: $("#presetsList"),
    addPreset: $("#addPreset"),
    setAnnonse: $("#setAnnonse"),
    setAge: $("#setAge"),
    logoPreview: $("#logoPreview"),
    logoInput: $("#logoInput"),
    setQuality: $("#setQuality"),
    qualityOut: $("#qualityOut"),
    setTimestamp: $("#setTimestamp"),
    saveSettings: $("#saveSettings"),
    resetSettings: $("#resetSettings"),

    toasts: $("#toasts"),
  };

  // -------- helpers ---------------------------------------------------------
  function sanitizeFilename(name) {
    let s = String(name || "").trim().toLowerCase();
    s = s.replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a");
    s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    s = s.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    s = s.replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");
    return s || "banner";
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const date = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", year: "numeric" }).format(d);
    const time = new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" }).format(d);
    return date + " – " + time;
  }

  function toast(message, kind) {
    const t = document.createElement("div");
    t.className = "toast" + (kind ? " toast--" + kind : "");
    t.innerHTML = '<span class="toast__dot"></span><span></span>';
    t.lastChild.textContent = message;
    el.toasts.appendChild(t);
    setTimeout(() => {
      t.classList.add("is-out");
      setTimeout(() => t.remove(), 320);
    }, 3200);
  }

  function logoUrl() {
    return "assets/hjelpelinjen-logo.png" + (state.logoVersion ? "?v=" + state.logoVersion : "");
  }

  // -------- previews --------------------------------------------------------
  function currentVinnersjanse() {
    const val = el.gameType.value;
    if (val === CUSTOM) return el.customVinner.value;
    const preset = state.settings.gamePresets.find((g) => g.id === val);
    return preset ? preset.vinnersjanse : "";
  }

  function buildData() {
    return {
      imageDataUrl: state.imageDataUrl,
      placeholderUrl: "assets/placeholder.svg",
      imagePositionX: state.posX,
      imagePositionY: state.posY,
      headline: el.headline.value,
      subtitle: el.subtitle.value,
      brandLabel: el.brandLabel.value,
      vinnersjanse: currentVinnersjanse(),
      imageZoom: state.zoom,
      headlineScale: state.headlineScale,
      subtitleScale: state.subtitleScale,
      lesMerStyle: state.lesMerStyle,
      accentColor: state.accentColor,
      logoUrl: logoUrl(),
      annonseText: state.settings.staticBadges.annonseText,
      ageBadgeText: state.settings.staticBadges.ageBadgeText,
    };
  }

  function renderPreviews() {
    const data = buildData();
    window.renderBanner(el.previews.readpeak, "readpeak", data);
    window.renderBanner(el.previews.desktop, "desktop", data);
    window.renderBanner(el.previews.mobile, "mobile", data);
  }

  // -------- position / crop -------------------------------------------------
  function applyCropTransform() {
    if (!el.cropImg) return;
    var scale = 1 + state.zoom / 100;
    el.cropImg.style.objectPosition = state.posX + "% " + state.posY + "%";
    el.cropImg.style.transform = "scale(" + scale + ")";
    el.cropImg.style.transformOrigin = state.posX + "% " + state.posY + "%";
  }

  function setPosition(x, y) {
    state.posX = Math.max(0, Math.min(100, Math.round(x)));
    state.posY = Math.max(0, Math.min(100, Math.round(y)));
    el.posXInput.value = state.posX;
    el.posYInput.value = state.posY;
    el.posXOut.textContent = state.posX + "%";
    el.posYOut.textContent = state.posY + "%";
    applyCropTransform();
    renderPreviews();
  }

  function setZoom(z) {
    state.zoom = Math.max(0, Math.min(30, Math.round(z)));
    el.zoomInput.value = state.zoom;
    el.zoomOut.textContent = state.zoom + "%";
    applyCropTransform();
    renderPreviews();
  }

  function initDrag() {
    let dragging = false;
    let startX = 0, startY = 0, baseX = 50, baseY = 50, w = 1, h = 1;

    el.cropFrame.addEventListener("pointerdown", (e) => {
      if (!state.imageDataUrl) return;
      dragging = true;
      const rect = el.cropFrame.getBoundingClientRect();
      w = rect.width; h = rect.height;
      startX = e.clientX; startY = e.clientY;
      baseX = state.posX; baseY = state.posY;
      el.cropFrame.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.cropFrame.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      // Drag the photo: moving right reveals the left side → posX decreases.
      const dx = ((e.clientX - startX) / w) * 100 * 1.25;
      const dy = ((e.clientY - startY) / h) * 100 * 1.25;
      setPosition(baseX - dx, baseY - dy, true);
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      try { el.cropFrame.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    el.cropFrame.addEventListener("pointerup", end);
    el.cropFrame.addEventListener("pointercancel", end);

    el.posXInput.addEventListener("input", () => setPosition(+el.posXInput.value, state.posY));
    el.posYInput.addEventListener("input", () => setPosition(state.posX, +el.posYInput.value));
    el.zoomInput.addEventListener("input", () => setZoom(+el.zoomInput.value));
  }

  // -------- upload ----------------------------------------------------------
  // Shared by both upload and URL-fetch: store the image (as a blob, so the
  // generate request works identically for both paths) and reveal the cropper.
  function applyImage(blob, dataUrl, name, size) {
    state.imageBlob = blob;
    state.imageDataUrl = dataUrl;
    state.imageName = name || "bilde.png";
    el.cropImg.src = dataUrl;
    el.fileName.textContent = state.imageName;
    el.fileSize.textContent = size ? formatBytes(size) : "";
    el.dropzoneEmpty.hidden = true;
    el.dropzoneFile.hidden = false;
    el.cropField.hidden = false;
    setZoom(0);
    setPosition(50, 50);
    el.generateBtn.disabled = false;
    hideResult();
  }

  function handleFile(file) {
    if (!file) return;
    if (!IMAGE_MIME_RE.test(file.type)) {
      toast("Kun JPG, PNG, WEBP, AVIF eller GIF er tillatt", "err");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("Filen er for stor (maks 10 MB)", "err");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => applyImage(file, reader.result, file.name, file.size);
    reader.readAsDataURL(file);
  }

  function dataUrlToBlob(dataUrl) {
    const comma = dataUrl.indexOf(",");
    const mime = (/data:([^;]+)/.exec(dataUrl.slice(0, comma)) || [])[1] || "image/png";
    const bin = atob(dataUrl.slice(comma + 1));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function extForMime(m) {
    return (
      { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif" }[m] ||
      "png"
    );
  }

  function setFetching(on) {
    el.fetchUrlBtn.disabled = on;
    el.fetchUrlBtn.classList.toggle("is-loading", on);
  }

  async function fetchFromUrl() {
    const url = el.imageUrl.value.trim();
    if (!url) {
      toast("Lim inn en bildelenke først", "err");
      return;
    }
    setFetching(true);
    try {
      const res = await fetch("/api/fetch-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente bildet");
      const blob = dataUrlToBlob(data.dataUrl);
      const name = (data.name || "bilde") + "." + extForMime(data.mimetype);
      applyImage(blob, data.dataUrl, name, data.size);
      toast("Bilde hentet fra lenke", "ok");
    } catch (err) {
      toast(err.message || "Kunne ikke hente bildet", "err");
    } finally {
      setFetching(false);
    }
  }

  function clearImage() {
    state.imageBlob = null;
    state.imageDataUrl = null;
    el.fileInput.value = "";
    el.cropImg.removeAttribute("src");
    el.dropzoneEmpty.hidden = false;
    el.dropzoneFile.hidden = true;
    el.cropField.hidden = true;
    el.generateBtn.disabled = true;
    setZoom(0);
    setPosition(50, 50);
    hideResult();
  }

  function initUpload() {
    el.dropzone.addEventListener("click", (e) => {
      if (e.target.closest("#removeImage")) return;
      if (state.imageDataUrl) return; // don't reopen picker when a file is loaded
      el.fileInput.click();
    });
    el.dropzone.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !state.imageDataUrl) {
        e.preventDefault();
        el.fileInput.click();
      }
    });
    el.fileInput.addEventListener("change", () => handleFile(el.fileInput.files[0]));
    el.removeImage.addEventListener("click", (e) => {
      e.stopPropagation();
      clearImage();
    });

    ["dragenter", "dragover"].forEach((ev) =>
      el.dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        el.dropzone.classList.add("is-drag");
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      el.dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        if (ev === "dragleave" && el.dropzone.contains(e.relatedTarget)) return;
        el.dropzone.classList.remove("is-drag");
      })
    );
    el.dropzone.addEventListener("drop", (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    el.fetchUrlBtn.addEventListener("click", fetchFromUrl);
    el.imageUrl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        fetchFromUrl();
      }
    });
  }

  function initAppearance() {
    $$(".seg", el.lesMerStyle).forEach((b) =>
      b.addEventListener("click", () => {
        state.lesMerStyle = b.dataset.val;
        $$(".seg", el.lesMerStyle).forEach((x) => x.classList.toggle("is-active", x === b));
        renderPreviews();
      })
    );
    el.accentColor.addEventListener("input", () => {
      state.accentColor = el.accentColor.value;
      if (el.accentHex) el.accentHex.textContent = el.accentColor.value;
      renderPreviews();
    });
  }

  // -------- form fields -----------------------------------------------------
  function updateCounters() {
    el.headlineCount.textContent = el.headline.value.length + " / 120";
    el.subtitleCount.textContent = el.subtitle.value.length + " / 80";
  }
  function updateFilenamePreview() {
    const v = el.filename.value.trim();
    if (!v) {
      el.filenamePreview.textContent = "";
      return;
    }
    const ts = state.settings.export.includeTimestampInFilename ? "-{tidsstempel}" : "";
    el.filenamePreview.textContent = "→ " + sanitizeFilename(v) + ts + "-desktop-580x500.png";
  }

  function rebuildGameSelect(keepValue) {
    const prev = keepValue || el.gameType.value;
    el.gameType.innerHTML = "";
    state.settings.gamePresets.forEach((g) => {
      const o = document.createElement("option");
      o.value = g.id;
      o.textContent = g.label;
      el.gameType.appendChild(o);
    });
    const custom = document.createElement("option");
    custom.value = CUSTOM;
    custom.textContent = "Custom / Egendefinert";
    el.gameType.appendChild(custom);

    if (prev && $$("option", el.gameType).some((o) => o.value === prev)) {
      el.gameType.value = prev;
    }
    onGameChange();
  }

  function onGameChange() {
    const isCustom = el.gameType.value === CUSTOM;
    el.customVinnerField.hidden = !isCustom;
    // Prefill the custom field with a realistic example to edit from.
    if (isCustom && !el.customVinner.value.trim()) {
      el.customVinner.value = "Vinnersjanse 1.premie 1:61 mill. per rekke";
    }
    renderPreviews();
  }

  function initFields() {
    ["input", "change"].forEach((ev) => {
      el.headline.addEventListener(ev, () => { updateCounters(); renderPreviews(); });
      el.subtitle.addEventListener(ev, () => { updateCounters(); renderPreviews(); });
      el.brandLabel.addEventListener(ev, renderPreviews);
      el.customVinner.addEventListener(ev, renderPreviews);
    });
    el.filename.addEventListener("input", updateFilenamePreview);
    el.gameType.addEventListener("change", onGameChange);
    el.headlineScale.addEventListener("input", () => {
      state.headlineScale = +el.headlineScale.value / 100;
      el.headlineScaleOut.textContent = el.headlineScale.value + "%";
      renderPreviews();
    });
    el.subtitleScale.addEventListener("input", () => {
      state.subtitleScale = +el.subtitleScale.value / 100;
      el.subtitleScaleOut.textContent = el.subtitleScale.value + "%";
      renderPreviews();
    });
    updateCounters();
  }

  // -------- generate --------------------------------------------------------
  function hideResult() {
    el.result.hidden = true;
    if (state.lastBlobUrl) {
      URL.revokeObjectURL(state.lastBlobUrl);
      state.lastBlobUrl = null;
    }
  }

  function setLoading(on) {
    el.generateBtn.classList.toggle("is-loading", on);
    el.generateBtn.disabled = on || !state.imageDataUrl;
    el.generateBtn.querySelector(".btn-generate__label").textContent = on
      ? "Genererer …"
      : "Generer bannere · 3 størrelser";
  }

  function filenameFromDisposition(header, fallback) {
    if (!header) return fallback;
    const m = /filename="?([^"]+)"?/.exec(header);
    return m ? m[1] : fallback;
  }

  async function onGenerate(e) {
    e.preventDefault();
    if (!state.imageBlob) {
      toast("Last opp et bilde eller hent fra lenke først", "err");
      return;
    }
    hideResult();
    setLoading(true);

    const fd = new FormData();
    fd.append("image", state.imageBlob, state.imageName);
    fd.append("headline", el.headline.value);
    fd.append("subtitle", el.subtitle.value);
    fd.append("brandLabel", el.brandLabel.value);
    fd.append("vinnersjanse", currentVinnersjanse());
    fd.append("imagePositionX", state.posX);
    fd.append("imagePositionY", state.posY);
    fd.append("imageZoom", state.zoom);
    fd.append("headlineScale", state.headlineScale);
    fd.append("subtitleScale", state.subtitleScale);
    fd.append("lesMerStyle", state.lesMerStyle);
    fd.append("accentColor", state.accentColor);
    fd.append("filename", el.filename.value);
    fd.append("jpegQuality", state.settings.export.jpegQuality);

    try {
      const res = await fetch("/api/generate", { method: "POST", body: fd });
      const ctype = res.headers.get("content-type") || "";
      if (!res.ok || ctype.indexOf("application/zip") === -1) {
        let msg = "Generering feilet";
        try { msg = (await res.json()).error || msg; } catch (_) {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const name = filenameFromDisposition(
        res.headers.get("content-disposition"),
        (sanitizeFilename(el.filename.value) || "banner") + ".zip"
      );
      state.lastBlobUrl = URL.createObjectURL(blob);
      el.downloadLink.href = state.lastBlobUrl;
      el.downloadLink.download = name;
      el.result.hidden = false;
      el.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
      // Best-effort auto-download. If the browser blocks the programmatic
      // click (e.g. "multiple downloads"), the visible "Last ned ZIP" link
      // below is the reliable fallback.
      try { el.downloadLink.click(); } catch (_) {}
      toast("Bannere generert – last ned ZIP", "ok");
      loadHistory();
    } catch (err) {
      toast(err.message || "Generering feilet", "err");
    } finally {
      setLoading(false);
    }
  }

  // -------- history ---------------------------------------------------------
  async function loadHistory() {
    let items = [];
    try {
      items = await (await fetch("/api/history")).json();
    } catch (_) {
      items = [];
    }
    if (Array.isArray(items) && items.length) {
      el.historyCount.hidden = false;
      el.historyCount.textContent = items.length;
    } else {
      el.historyCount.hidden = true;
    }
    renderHistory(items);
  }

  function renderHistory(items) {
    el.historyGrid.innerHTML = "";
    if (!items.length) {
      el.historyEmpty.hidden = false;
      return;
    }
    el.historyEmpty.hidden = true;
    items.forEach((entry, i) => {
      const card = document.createElement("article");
      card.className = "hcard";
      card.style.animationDelay = Math.min(i * 0.03, 0.4) + "s";

      const thumb = document.createElement("img");
      thumb.className = "hcard__thumb";
      thumb.loading = "lazy";
      thumb.alt = entry.filename;
      thumb.src = "/" + entry.thumbnailPath;
      thumb.onerror = () => { thumb.src = "assets/placeholder.svg"; };

      const body = document.createElement("div");
      body.className = "hcard__body";
      const name = document.createElement("div");
      name.className = "hcard__name";
      name.textContent = entry.filename;
      const head = document.createElement("div");
      head.className = "hcard__head";
      head.textContent = entry.headline || "—";
      const time = document.createElement("span");
      time.className = "hcard__time";
      time.textContent = formatDate(entry.timestamp);

      const actions = document.createElement("div");
      actions.className = "hcard__actions";
      const dl = document.createElement("a");
      dl.className = "btn-ghost btn-sm";
      dl.textContent = "Last ned";
      dl.href = "/api/history/" + encodeURIComponent(entry.id) + "/download";
      const del = document.createElement("button");
      del.className = "btn-ghost btn-sm is-danger";
      del.type = "button";
      del.textContent = "Slett";
      del.addEventListener("click", () => deleteEntry(entry, card));

      actions.appendChild(dl);
      actions.appendChild(del);
      body.appendChild(name);
      body.appendChild(head);
      body.appendChild(time);
      body.appendChild(actions);
      card.appendChild(thumb);
      card.appendChild(body);
      el.historyGrid.appendChild(card);
    });
  }

  async function deleteEntry(entry, card) {
    if (!confirm('Slette "' + entry.filename + '"?')) return;
    try {
      const res = await fetch("/api/history/" + encodeURIComponent(entry.id), { method: "DELETE" });
      if (!res.ok) throw new Error();
      card.remove();
      toast("Slettet", "ok");
      loadHistory();
    } catch (_) {
      toast("Kunne ikke slette", "err");
    }
  }

  // -------- tabs ------------------------------------------------------------
  function switchTab(tab, focusTab) {
    el.tabs.forEach((b) => {
      const active = b.dataset.tab === tab;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
      b.tabIndex = active ? 0 : -1; // roving tabindex
      if (active && focusTab) b.focus();
    });
    el.viewNew.classList.toggle("is-hidden", tab !== "new");
    el.viewHistory.classList.toggle("is-hidden", tab !== "history");
    el.viewNew.tabIndex = tab === "new" ? 0 : -1;
    el.viewHistory.tabIndex = tab === "history" ? 0 : -1;
    if (tab === "history") loadHistory();
  }

  function initTabs() {
    el.tabs.forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    // WAI-ARIA tablist keyboard support: Arrow / Home / End move + select.
    const order = ["new", "history"];
    const tablist = document.querySelector(".tabs");
    tablist.addEventListener("keydown", (e) => {
      const activeBtn = document.querySelector(".tab.is-active");
      const cur = order.indexOf(activeBtn ? activeBtn.dataset.tab : "new");
      let next = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (cur + 1) % order.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (cur - 1 + order.length) % order.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = order.length - 1;
      if (next !== null) {
        e.preventDefault();
        switchTab(order[next], true);
      }
    });
    $$("[data-goto]").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.goto)));
  }

  // -------- settings --------------------------------------------------------
  function renderPresetRows(presets) {
    el.presetsList.innerHTML = "";
    presets.forEach((g) => el.presetsList.appendChild(presetRow(g)));
  }

  function presetRow(g) {
    const row = document.createElement("div");
    row.className = "preset-row";
    const label = document.createElement("input");
    label.type = "text";
    label.placeholder = "Navn";
    label.value = g.label || "";
    label.dataset.role = "label";
    const vinner = document.createElement("input");
    vinner.type = "text";
    vinner.placeholder = "Vinnersjanse-tekst (tom = skjult)";
    vinner.value = g.vinnersjanse || "";
    vinner.dataset.role = "vinner";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "preset-row__del";
    del.title = "Fjern";
    del.textContent = "×";
    del.addEventListener("click", () => row.remove());
    row.appendChild(label);
    row.appendChild(vinner);
    row.appendChild(del);
    return row;
  }

  function collectSettingsFromForm() {
    const presets = $$(".preset-row", el.presetsList)
      .map((row) => ({
        label: $('[data-role="label"]', row).value.trim(),
        vinnersjanse: $('[data-role="vinner"]', row).value,
      }))
      .filter((g) => g.label);
    return {
      gamePresets: presets,
      staticBadges: {
        annonseText: el.setAnnonse.value.trim() || "Annonse",
        ageBadgeText: el.setAge.value.trim() || "18+ | Hjelpelinjen.no",
      },
      export: {
        jpegQuality: +el.setQuality.value,
        includeTimestampInFilename: el.setTimestamp.checked,
      },
    };
  }

  function fillSettingsForm(s) {
    renderPresetRows(s.gamePresets);
    el.setAnnonse.value = s.staticBadges.annonseText;
    el.setAge.value = s.staticBadges.ageBadgeText;
    el.setQuality.value = s.export.jpegQuality;
    el.qualityOut.textContent = s.export.jpegQuality;
    el.setTimestamp.checked = s.export.includeTimestampInFilename;
    el.logoPreview.src = logoUrl();
  }

  function openDrawer() {
    if (state._overlayTimer) {
      clearTimeout(state._overlayTimer);
      state._overlayTimer = null;
    }
    state._lastFocused = document.activeElement;
    fillSettingsForm(state.settings);
    el.drawerOverlay.hidden = false;
    el.drawer.removeAttribute("inert");
    el.drawer.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      el.drawerOverlay.classList.add("is-open");
      el.drawer.classList.add("is-open");
      el.closeSettings.focus();
    });
  }
  function closeDrawer() {
    el.drawerOverlay.classList.remove("is-open");
    el.drawer.classList.remove("is-open");
    el.drawer.setAttribute("aria-hidden", "true");
    el.drawer.setAttribute("inert", "");
    if (state._lastFocused && state._lastFocused.focus) state._lastFocused.focus();
    if (state._overlayTimer) clearTimeout(state._overlayTimer);
    state._overlayTimer = setTimeout(() => {
      el.drawerOverlay.hidden = true;
      state._overlayTimer = null;
    }, 320);
  }

  async function saveSettings() {
    const payload = collectSettingsFromForm();
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      state.settings = await res.json();
      fillSettingsForm(state.settings);
      rebuildGameSelect();
      renderPreviews();
      updateFilenamePreview();
      toast("Innstillinger lagret", "ok");
    } catch (_) {
      toast("Kunne ikke lagre innstillinger", "err");
    }
  }

  async function uploadLogo(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append("logo", file);
    try {
      const res = await fetch("/api/settings/logo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      state.logoVersion = Date.now();
      el.logoPreview.src = logoUrl();
      renderPreviews();
      toast("Logo oppdatert", "ok");
    } catch (err) {
      toast(err.message || "Kunne ikke laste opp logo", "err");
    }
  }

  function initSettings() {
    el.openSettings.addEventListener("click", openDrawer);
    el.closeSettings.addEventListener("click", closeDrawer);
    el.drawerOverlay.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.drawer.classList.contains("is-open")) closeDrawer();
    });
    el.addPreset.addEventListener("click", () =>
      el.presetsList.appendChild(presetRow({ label: "", vinnersjanse: "" }))
    );
    el.setQuality.addEventListener("input", () => (el.qualityOut.textContent = el.setQuality.value));
    el.saveSettings.addEventListener("click", saveSettings);
    el.resetSettings.addEventListener("click", () => {
      if (confirm("Tilbakestille til standardverdier? (Lagre for å bekrefte)")) {
        fillSettingsForm(JSON.parse(JSON.stringify(DEFAULTS)));
      }
    });
    el.logoInput.addEventListener("change", () => {
      uploadLogo(el.logoInput.files[0]);
      el.logoInput.value = "";
    });
  }

  // -------- boot ------------------------------------------------------------
  async function loadSettings() {
    try {
      const s = await (await fetch("/api/settings")).json();
      if (s && s.gamePresets) state.settings = s;
    } catch (_) {
      /* keep defaults */
    }
  }

  async function boot() {
    initUpload();
    initDrag();
    initFields();
    initAppearance();
    initTabs();
    initSettings();
    el.form.addEventListener("submit", onGenerate);
    el.generateBtn.disabled = true;

    await loadSettings();
    rebuildGameSelect("vikinglotto");
    updateFilenamePreview();
    renderPreviews();
    loadHistory();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
