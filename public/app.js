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
    export: {
      jpegQuality: 92,
      includeTimestampInFilename: false,
      format: "png",
      maxFileSizeKb: 200,
      superSample: true,
    },
  };

  const state = {
    settings: JSON.parse(JSON.stringify(DEFAULTS)),
    imageDataUrl: null,
    imageBlob: null,
    imageName: "bilde.png",
    posX: 50,
    posY: 50,
    zoom: 0,
    hl: { readpeak: 1, desktop: 1, mobile: 1, newsgrid: 1 },
    subtitleScale: 1,
    lesMerSize: 17,
    resolution: 1,
    format: "png",
    lesMerStyle: "text",
    accentColor: "#2f2f2f",
    ageIcon: null, // { path, version } when a custom mark has been uploaded
    lastBlobUrl: null,
    downloadSet: "all", // "all" | "core" | "newsgrid" — what Generer actually produces
    outputType: "image", // "image" (PNG/JPEG) | "html" (Campaign Manager 360)
    showVinnerOnNewsgrid: false, // off by default — only turned on when fronting a jackpot
  };

  const DOWNLOAD_SET_LABELS = {
    image: {
      all: { count: "4 størrelser", primary: "Last ned alle 4 (ZIP)" },
      core: { count: "3 størrelser", primary: "Last ned ZIP" },
      newsgrid: { count: "1 størrelse (190×190)", primary: "Last ned 190×190" },
    },
    // One CM360 creative per format, so several formats arrive as an outer ZIP
    // of ready-to-upload ZIPs rather than as one merged package.
    html: {
      all: { count: "4 HTML5-pakker", primary: "Last ned alle 4 HTML5-pakker" },
      core: { count: "3 HTML5-pakker", primary: "Last ned 3 HTML5-pakker" },
      newsgrid: { count: "1 HTML5-pakke (190×190)", primary: "Last ned HTML5-pakke" },
    },
  };

  // The choice cards already say what each option is; this only adds what they
  // have no room for. Empty for "image", where there is nothing more to say.
  const OUTPUT_TYPE_NOTES = {
    image: "",
    html:
      "Overskriften blir ekte tekst i stedet for piksler, så den er knivskarp på alle " +
      "skjermer — og pakken blir mye lettere. Velger du flere formater, kommer de som " +
      "én ZIP per format.",
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
    advToggle: $("#advToggle"),
    advPanel: $("#advPanel"),
    hlReadpeak: $("#hlReadpeak"),
    hlReadpeakOut: $("#hlReadpeakOut"),
    hlDesktop: $("#hlDesktop"),
    hlDesktopOut: $("#hlDesktopOut"),
    hlMobile: $("#hlMobile"),
    hlMobileOut: $("#hlMobileOut"),
    hlNewsgrid: $("#hlNewsgrid"),
    hlNewsgridOut: $("#hlNewsgridOut"),
    subtitleScale: $("#subtitleScale"),
    subtitleScaleOut: $("#subtitleScaleOut"),
    lesMerSize: $("#lesMerSize"),
    lesMerSizeOut: $("#lesMerSizeOut"),
    resolution: $("#resolution"),
    resolutionGroup: $("#resolutionGroup"),
    formatSel: $("#formatSel"),
    budgetNote: $("#budgetNote"),
    setFormat: $("#setFormat"),
    outputType: $("#outputType"),
    outputTypeNote: $("#outputTypeNote"),
    clickUrlField: $("#clickUrlField"),
    clickUrl: $("#clickUrl"),
    brandLabel: $("#brandLabel"),
    gameType: $("#gameType"),
    customVinnerField: $("#customVinnerField"),
    customVinner: $("#customVinner"),
    newsgridVinner: $("#newsgridVinner"),
    lesMerStyle: $("#lesMerStyle"),
    accentColor: $("#accentColor"),
    accentHex: $("#accentHex"),
    filename: $("#filename"),
    filenamePreview: $("#filenamePreview"),

    form: $("#bannerForm"),
    downloadSet: $("#downloadSet"),
    generateBtn: $("#generateBtn"),
    result: $("#result"),
    downloadLink: $("#downloadLink"),
    resultFiles: $("#resultFiles"),
    resultAlt: $("#resultAlt"),
    downloadNewsgrid: $("#downloadNewsgrid"),
    downloadAll: $("#downloadAll"),
    downloadCore: $("#downloadCore"),

    previews: {
      readpeak: $("#preview-readpeak"),
      desktop: $("#preview-desktop"),
      mobile: $("#preview-mobile"),
      newsgrid: $("#preview-newsgrid"),
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
    iconPreview: $("#iconPreview"),
    iconInput: $("#iconInput"),
    resetIcon: $("#resetIcon"),
    setQuality: $("#setQuality"),
    qualityOut: $("#qualityOut"),
    setMaxSize: $("#setMaxSize"),
    maxSizeOut: $("#maxSizeOut"),
    setSuperSample: $("#setSuperSample"),
    setTimestamp: $("#setTimestamp"),
    imageToolsWarning: $("#imageToolsWarning"),
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

  // Empty string means "no custom mark" — banner.js then draws its built-in
  // inline SVG, which is the normal case.
  function ageIconUrl() {
    if (!state.ageIcon || !state.ageIcon.path) return "";
    return state.ageIcon.path + (state.ageIcon.version ? "?v=" + state.ageIcon.version : "");
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
      showVinnerOnNewsgrid: state.showVinnerOnNewsgrid,
      imageZoom: state.zoom,
      headlineScaleReadpeak: state.hl.readpeak,
      headlineScaleDesktop: state.hl.desktop,
      headlineScaleMobile: state.hl.mobile,
      headlineScaleNewsgrid: state.hl.newsgrid,
      subtitleScale: state.subtitleScale,
      lesMerSize: state.lesMerSize,
      lesMerStyle: state.lesMerStyle,
      accentColor: state.accentColor,
      ageIconUrl: ageIconUrl(),
      annonseText: state.settings.staticBadges.annonseText,
      ageBadgeText: state.settings.staticBadges.ageBadgeText,
    };
  }

  function renderPreviews() {
    const data = buildData();
    window.renderBanner(el.previews.readpeak, "readpeak", data);
    window.renderBanner(el.previews.desktop, "desktop", data);
    window.renderBanner(el.previews.mobile, "mobile", data);
    window.renderBanner(el.previews.newsgrid, "newsgrid", data);
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
    const base = sanitizeFilename(v) + ts + "-desktop-580x500";
    if (state.outputType === "html") {
      el.filenamePreview.textContent = "→ " + base + ".zip";
      return;
    }
    // "auto" — and any format that has to give way to the size limit — is
    // decided at render time, so show both possibilities rather than lie.
    const ext = state.format === "jpeg" ? "jpg" : state.format === "auto" ? "png/jpg" : "png";
    el.filenamePreview.textContent = "→ " + base + "." + ext;
  }

  function updateBudgetNote() {
    if (!el.budgetNote) return;
    const kb = state.settings.export.maxFileSizeKb;
    const tools = state.settings.imageTools;
    // Never promise a limit the server cannot actually enforce.
    if (tools && tools.available === false) {
      el.budgetNote.textContent =
        "Størrelsesgrensen er av: bildebiblioteket «sharp» mangler. Kjør «npm install» på nytt.";
      return;
    }
    el.budgetNote.textContent = kb
      ? "Hver fil holdes under " + kb + " KB. Kommer en PNG over, lagres den som JPEG."
      : "Ingen størrelsesgrense er satt (skrus på i Innstillinger).";
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
    custom.textContent = "Tom / egendefinert";
    el.gameType.appendChild(custom);

    if (prev && $$("option", el.gameType).some((o) => o.value === prev)) {
      el.gameType.value = prev;
    }
    onGameChange();
  }

  // "Tom / egendefinert" starts blank on purpose: it is both the free-text
  // option AND the way to get no Vinnersjanse badge at all. Prefilling an
  // example would put a wrong odds claim in the banner for anyone who picked it
  // to write their own text — or to write nothing.
  function onGameChange() {
    const isCustom = el.gameType.value === CUSTOM;
    el.customVinnerField.hidden = !isCustom;
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
    el.newsgridVinner.addEventListener("change", () => {
      state.showVinnerOnNewsgrid = el.newsgridVinner.checked;
      renderPreviews();
    });
    updateCounters();
  }

  // Generic segmented control: highlights the clicked button, calls onChange.
  function segmented(container, onChange) {
    $$(".seg", container).forEach((b) =>
      b.addEventListener("click", () => {
        $$(".seg", container).forEach((x) => x.classList.toggle("is-active", x === b));
        onChange(b.dataset.val);
      })
    );
  }
  function segmentedSet(container, val) {
    $$(".seg", container).forEach((x) => x.classList.toggle("is-active", x.dataset.val === String(val)));
  }

  function initAdvanced() {
    el.advToggle.addEventListener("click", () => {
      const willOpen = el.advPanel.hidden;
      el.advPanel.hidden = !willOpen;
      el.advToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    const bindScale = (input, out, apply) =>
      input.addEventListener("input", () => {
        out.textContent = input.value + "%";
        apply(+input.value / 100);
        renderPreviews();
      });
    bindScale(el.hlReadpeak, el.hlReadpeakOut, (v) => (state.hl.readpeak = v));
    bindScale(el.hlDesktop, el.hlDesktopOut, (v) => (state.hl.desktop = v));
    bindScale(el.hlMobile, el.hlMobileOut, (v) => (state.hl.mobile = v));
    bindScale(el.hlNewsgrid, el.hlNewsgridOut, (v) => (state.hl.newsgrid = v));
    bindScale(el.subtitleScale, el.subtitleScaleOut, (v) => (state.subtitleScale = v));

    el.lesMerSize.addEventListener("input", () => {
      state.lesMerSize = +el.lesMerSize.value;
      el.lesMerSizeOut.textContent = el.lesMerSize.value;
      renderPreviews();
    });

    segmented(el.resolution, (val) => (state.resolution = +val));
    segmented(el.formatSel, (val) => {
      state.format = val;
      updateFilenamePreview();
    });
  }

  function initDownloadSet() {
    segmented(el.downloadSet, (val) => {
      state.downloadSet = val;
      setLoading(false); // refreshes the "Generer bannere · N størrelser" label
    });
  }

  // Image vs HTML5 changes what is produced, what the button says, and whether
  // a landing-page URL is required.
  function applyOutputType() {
    const isHtml = state.outputType === "html";
    el.clickUrlField.hidden = !isHtml;
    // An HTML5 creative always serves at its ad.size, so the resolution control
    // has nothing to act on — and the backup images have to stay at 1× to match
    // what Campaign Manager 360 expects.
    if (el.resolutionGroup) el.resolutionGroup.hidden = isHtml;
    el.outputTypeNote.textContent = OUTPUT_TYPE_NOTES[state.outputType] || "";
    updateFilenamePreview();
    // Never clear the spinner out from under a generation that is still running.
    if (!el.generateBtn.classList.contains("is-loading")) setLoading(false);
  }

  function initOutputType() {
    segmented(el.outputType, (val) => {
      state.outputType = val === "html" ? "html" : "image";
      hideResult();
      applyOutputType();
    });
    el.clickUrl.addEventListener("input", hideResult);
    applyOutputType();
  }

  // Everything around a preview banner inside its card: the card padding, the
  // header line, the flex gaps and the stage's own padding. Subtracting it is
  // what lets the height budget below be about the BANNER rather than the box.
  const CARD_CHROME = 78;
  const NEWSGRID_CHROME = 34; // plus its "Vis vinnersjanse" checkbox row

  /**
   * Size every preview so all four are visible at once, at the largest scale
   * that still fits.
   *
   * Two constraints, whichever bites first: the width of the card, and half the
   * panel's height — because the four banners sit in two rows and having to
   * scroll to compare them defeats the point of a live preview.
   */
  function fitPreviews() {
    const body = $(".previews__body");
    let rowHeight = Infinity;
    if (body && body.clientHeight) {
      const style = getComputedStyle(body);
      const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      const gap = parseFloat(style.rowGap) || 20;
      rowHeight = (body.clientHeight - padding - gap) / 2;
    }

    $$(".preview-stage").forEach((stage) => {
      const card = stage.closest(".pcard");
      if (!card) return;
      const w = parseFloat(stage.style.getPropertyValue("--w")) || 320;
      const h = parseFloat(stage.style.getPropertyValue("--h")) || 400;
      const isNewsgrid = card.classList.contains("pcard--newsgrid");
      // Upper bounds: ReadPeak and Mobil stop at life-size, which is the most
      // honest a preview can be; Desktop is too wide for that; the 190×190
      // needs magnifying to be judged at all.
      const max = isNewsgrid ? 2 : w >= 500 ? 0.85 : 1;

      // Measure the CARD, not the stage: the stage shrink-wraps its own
      // content, so measuring it just reads back the scale already applied and
      // the banner never actually shrinks to fit a narrow column.
      const pad = parseFloat(getComputedStyle(card).paddingLeft) || 0;
      const availWidth = card.clientWidth - pad * 2;
      const availHeight = rowHeight - CARD_CHROME - (isNewsgrid ? NEWSGRID_CHROME : 0);

      let scale = max;
      if (availWidth > 0) scale = Math.min(scale, availWidth / w);
      if (isFinite(availHeight) && availHeight > 80) {
        // …but a preview shrunk past the point of being readable helps nobody.
        // On a short screen, let the panel scroll instead.
        const floor = isNewsgrid ? 1.2 : 0.6;
        scale = Math.min(scale, Math.max(availHeight / h, floor));
      }
      if (!isFinite(scale) || scale <= 0) scale = max;
      stage.style.setProperty("--scale", scale.toFixed(4));
    });
  }

  // -------- generate --------------------------------------------------------
  function hideResult() {
    el.result.hidden = true;
    el.resultFiles.innerHTML = "";
    if (state.lastBlobUrl) {
      URL.revokeObjectURL(state.lastBlobUrl);
      state.lastBlobUrl = null;
    }
  }

  function setLoading(on) {
    el.generateBtn.classList.toggle("is-loading", on);
    el.generateBtn.disabled = on || !state.imageDataUrl;
    const labels = DOWNLOAD_SET_LABELS[state.outputType] || DOWNLOAD_SET_LABELS.image;
    el.generateBtn.querySelector(".btn-generate__label").textContent = on
      ? "Genererer …"
      : "Generer bannere · " + labels[state.downloadSet].count;
  }

  function isOverBudget(bytes) {
    const kb = state.settings.export.maxFileSizeKb;
    return kb > 0 && bytes > kb * 1024;
  }

  // What actually came out: name, size, and any compromise the encoder had to
  // make. Without this the user only finds out in Finder — which is exactly how
  // an over-the-limit file gets uploaded by accident.
  function renderReport(rawHeader, asHtml) {
    el.resultFiles.innerHTML = "";
    if (!rawHeader) return;
    let rows;
    try {
      rows = JSON.parse(decodeURIComponent(rawHeader));
    } catch (_) {
      return;
    }
    if (!Array.isArray(rows)) return;

    rows.forEach((row) => {
      const bytes = asHtml ? row.htmlBytes : row.bytes;
      if (!bytes) return;
      const li = document.createElement("li");
      li.className = "result__file";

      const name = document.createElement("span");
      name.className = "result__file-name";
      name.textContent = (asHtml ? row.htmlFile : row.file) || row.label;

      const size = document.createElement("span");
      size.className = "result__file-size" + (isOverBudget(bytes) ? " is-over" : "");
      size.textContent = formatBytes(bytes);

      li.appendChild(name);
      li.appendChild(size);
      if (!asHtml && row.note) {
        const note = document.createElement("span");
        note.className = "result__file-note";
        note.textContent = row.note;
        li.appendChild(note);
      }
      el.resultFiles.appendChild(li);
    });
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
    if (state.outputType === "html" && !el.clickUrl.value.trim()) {
      toast("HTML5-pakken trenger en klikk-lenke (landingsside)", "err");
      el.clickUrl.focus();
      return;
    }
    hideResult();
    setLoading(true);
    // Freeze what this run is producing: the controls stay live while the
    // server works, and the result has to describe the request that was sent,
    // not whatever the form says by the time it comes back.
    const outputType = state.outputType;
    const downloadSet = state.downloadSet;

    const fd = new FormData();
    fd.append("image", state.imageBlob, state.imageName);
    fd.append("headline", el.headline.value);
    fd.append("subtitle", el.subtitle.value);
    fd.append("brandLabel", el.brandLabel.value);
    fd.append("vinnersjanse", currentVinnersjanse());
    fd.append("showVinnerOnNewsgrid", state.showVinnerOnNewsgrid ? "1" : "0");
    fd.append("imagePositionX", state.posX);
    fd.append("imagePositionY", state.posY);
    fd.append("imageZoom", state.zoom);
    fd.append("headlineScaleReadpeak", state.hl.readpeak);
    fd.append("headlineScaleDesktop", state.hl.desktop);
    fd.append("headlineScaleMobile", state.hl.mobile);
    fd.append("headlineScaleNewsgrid", state.hl.newsgrid);
    fd.append("subtitleScale", state.subtitleScale);
    fd.append("lesMerSize", state.lesMerSize);
    fd.append("lesMerStyle", state.lesMerStyle);
    fd.append("accentColor", state.accentColor);
    fd.append("resolution", state.resolution);
    fd.append("format", state.format);
    fd.append("filename", el.filename.value);
    fd.append("jpegQuality", state.settings.export.jpegQuality);
    fd.append("downloadSet", downloadSet);
    fd.append("outputType", outputType);
    fd.append("clickUrl", el.clickUrl.value.trim());

    try {
      const res = await fetch("/api/generate", { method: "POST", body: fd });
      const ctype = res.headers.get("content-type") || "";
      const isDownloadable = ctype.indexOf("application/zip") !== -1 || ctype.indexOf("image/") === 0;
      if (!res.ok || !isDownloadable) {
        let msg = "Generering feilet";
        try { msg = (await res.json()).error || msg; } catch (_) {}
        throw new Error(msg);
      }
      const entryId = res.headers.get("x-entry-id");
      const blob = await res.blob();
      const isHtml = outputType === "html";
      // Only a single-image download can end in something other than .zip, and
      // the size limit may have turned that PNG into a JPEG — so trust the
      // server's Content-Disposition first and keep this purely as a fallback.
      const fallbackExt = !isHtml && downloadSet === "newsgrid" ? "png" : "zip";
      const name = filenameFromDisposition(
        res.headers.get("content-disposition"),
        (sanitizeFilename(el.filename.value) || "banner") + "." + fallbackExt
      );
      state.lastBlobUrl = URL.createObjectURL(blob);
      el.downloadLink.href = state.lastBlobUrl;
      el.downloadLink.download = name;
      el.downloadLink.textContent = DOWNLOAD_SET_LABELS[outputType][downloadSet].primary;
      renderReport(res.headers.get("x-banner-report"), isHtml);

      // Every generation renders + saves all 4 formats regardless of Pakke —
      // only THIS response (the blob above) matches what was selected. The
      // other two combinations are already on disk too, so offer them as
      // quick secondary links against that same history entry (no re-render).
      if (entryId) {
        const suffix = isHtml ? "&type=html" : "";
        const link = (set) => "/api/history/" + encodeURIComponent(entryId) + "/download?set=" + set + suffix;
        el.downloadNewsgrid.href = link("newsgrid");
        el.downloadAll.href = link("all");
        el.downloadCore.href = link("core");
        el.downloadNewsgrid.hidden = downloadSet === "newsgrid";
        el.downloadAll.hidden = downloadSet === "all";
        el.downloadCore.hidden = downloadSet === "core";
        el.resultAlt.hidden = false;
      } else {
        el.resultAlt.hidden = true;
      }
      el.result.hidden = false;
      el.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
      // Best-effort auto-download. If the browser blocks the programmatic
      // click (e.g. "multiple downloads"), the visible "Last ned" link below
      // is the reliable fallback.
      try { el.downloadLink.click(); } catch (_) {}
      toast("Bannere generert", "ok");
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
      dl.textContent = entry.htmlFiles ? "Bilder" : "Last ned";
      dl.href = "/api/history/" + encodeURIComponent(entry.id) + "/download";
      // Entries generated as HTML5 keep both: the images (also the backup
      // images for CM360) and the ready-to-upload packages.
      let htmlDl = null;
      if (entry.htmlFiles) {
        htmlDl = document.createElement("a");
        htmlDl.className = "btn-ghost btn-sm";
        htmlDl.textContent = "HTML5";
        htmlDl.href = "/api/history/" + encodeURIComponent(entry.id) + "/download?set=all&type=html";
      }
      const del = document.createElement("button");
      del.className = "btn-ghost btn-sm is-danger";
      del.type = "button";
      del.textContent = "Slett";
      del.addEventListener("click", () => deleteEntry(entry, card));

      actions.appendChild(dl);
      if (htmlDl) actions.appendChild(htmlDl);
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
    if (tab === "new") requestAnimationFrame(fitPreviews);
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

  function activeSeg(container) {
    const b = container.querySelector(".seg.is-active");
    return b ? b.dataset.val : null;
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
        maxFileSizeKb: +el.setMaxSize.value,
        superSample: el.setSuperSample.checked,
        includeTimestampInFilename: el.setTimestamp.checked,
        format: activeSeg(el.setFormat) || "png",
      },
    };
  }

  function maxSizeLabel(kb) {
    return kb > 0 ? kb + " KB" : "ingen grense";
  }

  function fillSettingsForm(s) {
    renderPresetRows(s.gamePresets);
    el.setAnnonse.value = s.staticBadges.annonseText;
    el.setAge.value = s.staticBadges.ageBadgeText;
    el.setQuality.value = s.export.jpegQuality;
    el.qualityOut.textContent = s.export.jpegQuality;
    el.setMaxSize.value = s.export.maxFileSizeKb;
    el.maxSizeOut.textContent = maxSizeLabel(s.export.maxFileSizeKb);
    el.setSuperSample.checked = s.export.superSample !== false;
    el.setTimestamp.checked = s.export.includeTimestampInFilename;
    segmentedSet(el.setFormat, s.export.format || "png");
    el.iconPreview.src = ageIconUrl() || "assets/norsktipping-icon.svg";
    el.resetIcon.hidden = !state.ageIcon;
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
      // saving a new default format also updates the current session
      state.format = state.settings.export.format || "png";
      segmentedSet(el.formatSel, state.format);
      fillSettingsForm(state.settings);
      rebuildGameSelect();
      renderPreviews();
      updateFilenamePreview();
      updateBudgetNote();
      toast("Innstillinger lagret", "ok");
    } catch (_) {
      toast("Kunne ikke lagre innstillinger", "err");
    }
  }

  async function uploadIcon(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append("icon", file);
    try {
      const res = await fetch("/api/settings/badge-icon", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      state.ageIcon = data.ageIcon || null;
      el.iconPreview.src = ageIconUrl() || "assets/norsktipping-icon.svg";
      el.resetIcon.hidden = !state.ageIcon;
      renderPreviews();
      toast("Merket er oppdatert", "ok");
    } catch (err) {
      toast(err.message || "Kunne ikke laste opp merket", "err");
    }
  }

  async function resetIcon() {
    try {
      const res = await fetch("/api/settings/badge-icon", { method: "DELETE" });
      if (!res.ok) throw new Error();
      state.ageIcon = null;
      el.iconPreview.src = "assets/norsktipping-icon.svg";
      el.resetIcon.hidden = true;
      renderPreviews();
      toast("Standardmerket er i bruk igjen", "ok");
    } catch (_) {
      toast("Kunne ikke fjerne merket", "err");
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
    el.setMaxSize.addEventListener("input", () => (el.maxSizeOut.textContent = maxSizeLabel(+el.setMaxSize.value)));
    segmented(el.setFormat, () => {});
    el.saveSettings.addEventListener("click", saveSettings);
    el.resetSettings.addEventListener("click", () => {
      if (confirm("Tilbakestille til standardverdier? (Lagre for å bekrefte)")) {
        fillSettingsForm(JSON.parse(JSON.stringify(DEFAULTS)));
      }
    });
    el.iconInput.addEventListener("change", () => {
      uploadIcon(el.iconInput.files[0]);
      el.iconInput.value = "";
    });
    el.resetIcon.addEventListener("click", resetIcon);
  }

  // -------- boot ------------------------------------------------------------
  async function loadSettings() {
    try {
      const s = await (await fetch("/api/settings")).json();
      if (!s || !s.gamePresets) return;
      state.settings = s;
      state.ageIcon = s.ageIcon || null;
      // The size limit and the extra-sharpness pass both need sharp. Say so
      // plainly rather than quietly producing 1 MB files.
      if (s.imageTools && !s.imageTools.available) {
        el.imageToolsWarning.hidden = false;
        el.imageToolsWarning.textContent =
          "Bildebiblioteket «sharp» mangler, så størrelsesgrensen og ekstra skarphet er slått av " +
          "for denne økten. Kjør «npm install» på nytt for å få dem tilbake.";
      }
    } catch (_) {
      /* keep defaults */
    }
  }

  async function boot() {
    initUpload();
    initDrag();
    initFields();
    initAppearance();
    initAdvanced();
    initDownloadSet();
    initOutputType();
    initTabs();
    initSettings();
    el.form.addEventListener("submit", onGenerate);
    el.generateBtn.disabled = true;

    await loadSettings();
    // initialise the per-session download format from the saved default
    state.format = state.settings.export.format || "png";
    segmentedSet(el.formatSel, state.format);
    rebuildGameSelect("vikinglotto");
    updateFilenamePreview();
    updateBudgetNote();
    renderPreviews();
    fitPreviews();
    loadHistory();

    let raf = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fitPreviews);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
