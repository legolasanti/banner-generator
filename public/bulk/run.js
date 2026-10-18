/* =========================================================================
   bulk/run.js — the bar at the bottom: how to deliver, the button, and the
   run itself.

   Only rows that are ticked and have no errors are sent. The run happens on
   the server (lib/bulk/jobs.js); this polls it, mirrors each row's state onto
   its card, and when it finishes offers the ZIP in the chosen folder layout —
   plus the other layouts, which cost nothing (the files are already made).
   The job is remembered, so a reload in the middle picks the run back up,
   and a reload after it still shows the result, its downloads and what
   failed.
   ========================================================================= */
(function () {
  "use strict";

  var BULK = (window.BULK = window.BULK || {});
  var store = BULK.store;
  var state = BULK.state;
  var h = window.WPE.util.h;

  var POLL_MS = 900;
  var IMAGE_MISSING = "image-missing"; // lib/bulk/jobs.js
  var MAX_LISTED_FAILURES = 12;
  var dom = {};
  var pollTimer = null;
  // Between the click and the server's answer: no second run may start.
  var starting = false;

  var LAYOUTS = [
    ["format", "Per størrelse", "Én mappe per størrelse, f.eks. 320x400/"],
    ["banner", "Per banner", "Én mappe per banner med alle størrelsene"],
    ["flat", "Alt i én", "Alle filene direkte i ZIP-en"],
  ];

  var seg = BULK.ui.seg;

  function setOutput(patch) {
    Object.assign(state.output, patch);
    store.emit("output");
    applyOutputVisibility();
    refresh();
  }

  function applyOutputVisibility() {
    var html = state.output.type === "html";
    dom.resGroup.hidden = html;
    dom.clickGroup.hidden = !html;
  }

  function build(host) {
    var o = state.output;
    var type = o.type === "html" ? "html" : o.format;
    dom.typeSeg = seg(
      [["png", "PNG"], ["jpeg", "JPEG"], ["auto", "Auto", "Minste fil som ser bra ut"], ["html", "HTML5", "Campaign Manager 360"]],
      type,
      function (v) {
        if (v === "html") setOutput({ type: "html" });
        else setOutput({ type: "image", format: v });
      },
      "Filtype"
    );
    dom.resGroup = h(
      "div.bk-ctl",
      null,
      h("span.bk-ctl__label", null, "Oppløsning"),
      seg([[1, "1×"], [1.5, "1,5×"], [2, "2×"]], o.resolution, function (v) { setOutput({ resolution: +v }); }, "Oppløsning")
    );
    dom.layoutSeg = seg(LAYOUTS, o.layout, function (v) {
      setOutput({ layout: v });
      renderResult();
    }, "Mappestruktur");
    dom.name = h("input.bk-input.bk-name", { type: "text", maxlength: 60, placeholder: "navn på ZIP-filen", value: o.name || "", "aria-label": "Navn på ZIP-filen" });
    dom.name.addEventListener("input", function () { state.output.name = dom.name.value; store.persist(); });
    dom.click = h("input.bk-input", { type: "url", placeholder: "https://… brukes der arket ikke har klikk-lenke", value: o.clickUrl || "", spellcheck: "false", "aria-label": "Standard klikk-lenke" });
    var ct = null;
    dom.click.addEventListener("input", function () {
      clearTimeout(ct);
      ct = setTimeout(function () { setOutput({ clickUrl: dom.click.value.trim() }); }, 250);
    });
    dom.clickGroup = h("div.bk-ctl.bk-ctl--grow", null, h("span.bk-ctl__label", null, "Klikk-lenke"), dom.click);

    dom.summary = h("div.bk-run__summary");
    dom.go = h("button.btn-generate.bk-go", { type: "button" }, h("span.btn-generate__spinner", { "aria-hidden": "true" }), h("span.btn-generate__label", null, "Generer"));
    dom.go.addEventListener("click", start);

    dom.progress = h("div.bk-progress", { hidden: true });
    dom.bar = h("span.bk-progress__bar");
    dom.track = h("div.bk-progress__track", { role: "progressbar", "aria-label": "Fremdrift", "aria-valuemin": "0", "aria-valuemax": "100" }, dom.bar);
    dom.progressText = h("span.bk-progress__text");
    dom.cancel = h("button.btn-ghost.btn-sm", { type: "button" }, "Avbryt");
    dom.cancel.addEventListener("click", cancel);
    dom.progress.appendChild(dom.track);
    dom.progress.appendChild(h("div.bk-progress__row", null, dom.progressText, dom.cancel));

    dom.result = h("div.bk-result", { hidden: true, "aria-live": "polite" });

    host.appendChild(
      h(
        "div.bk-run",
        null,
        h(
          "div.bk-run__opts",
          null,
          h("div.bk-ctl", null, h("span.bk-ctl__label", null, "Filtype"), dom.typeSeg),
          dom.resGroup,
          h("div.bk-ctl", null, h("span.bk-ctl__label", null, "Mapper i ZIP"), dom.layoutSeg),
          h("div.bk-ctl", null, h("span.bk-ctl__label", null, "Navn"), dom.name),
          dom.clickGroup
        ),
        h("div.bk-run__act", null, dom.summary, dom.go),
        dom.progress,
        dom.result
      )
    );
    applyOutputVisibility();
    refresh();
  }

  function isRunning(job) {
    return !!job && (job.status === "queued" || job.status === "running");
  }

  /** The button's wording and the line beside it. */
  function refresh() {
    if (!dom.go) return;
    dom.name.placeholder = window.BULK_NAMES.sanitizeFilename(defaultName());
    var running = isRunning(state.job) || starting;
    var c = BULK.fit.counts();
    var ready = store.sendable().length;
    var formats = store.specs().length;
    var excludedErr = state.rows.filter(function (r) { return r.include && r.level === "error"; }).length;
    var pending = c.pending || 0;
    var fitting = BULK.fit.isBusy();

    dom.go.disabled = running || !ready || pending > 0 || fitting;
    dom.go.classList.toggle("is-loading", !!running);
    var label = dom.go.querySelector(".btn-generate__label");
    label.textContent = running
      ? "Genererer …"
      : "Generer " + ready + (ready === 1 ? " banner" : " bannere") + " · " + ready * formats + " filer";

    var parts = [];
    if (pending) parts.push("Venter på " + pending + (pending === 1 ? " bilde" : " bilder") + " …");
    else if (fitting) parts.push("Beregner tekststørrelser …");
    if (excludedErr) parts.push(excludedErr + (excludedErr === 1 ? " rad med feil hoppes over" : " rader med feil hoppes over"));
    var off = state.rows.filter(function (r) { return !r.include; }).length;
    if (off) parts.push(off + " tatt ut");
    if (c.warn) parts.push(c.warn + " å sjekke");
    dom.summary.textContent = parts.join(" · ");
    dom.summary.classList.toggle("is-bad", !!excludedErr);
  }

  function payload(rows) {
    var specs = store.specs();
    return {
      rows: rows.map(function (row) {
        var pos = store.positionOf(row);
        var scales = {};
        var autoTypes = [];
        specs.forEach(function (spec) {
          scales[spec.type] = store.scaleOf(row, spec.type);
          if (row.manual[spec.type] == null) autoTypes.push(spec.type);
        });
        return {
          rid: row.rid,
          sheetRow: row.sheetRow,
          headline: row.headline,
          imageId: row.image.id,
          filename: row.filename,
          weight: store.weightOf(row),
          posX: pos.x,
          posY: pos.y,
          zoom: row.zoom || 0,
          scales: scales,
          autoTypes: autoTypes,
          clickUrl: row.clickUrl,
          // Resolved here (the run's defaults filled in), exactly as the
          // previews drew them.
          subtitle: store.has("subtitle") ? row.subtitle : "",
          brandLabel: store.brandOf(row),
          ctaText: store.ctaOf(row),
          vinnersjanse: store.vinnerOf(row),
        };
      }),
      options: {
        product: state.product,
        lesMerStyle: state.common.lesMerStyle,
        accentColor: state.common.accentColor,
        showVinnerOnNewsgrid: !!state.common.showVinnerOnNewsgrid,
        formats: state.formats.slice(),
        outputType: state.output.type,
        format: state.output.format,
        resolution: state.output.resolution,
        name: zipName(),
        clickUrl: state.output.clickUrl,
      },
    };
  }

  function defaultName() {
    var src = state.source || {};
    var base = src.sheetName || (src.name ? src.name.replace(/\.[a-z0-9]+$/i, "") : "") || state.product + "-bulk";
    return base;
  }

  /** The run's name: the ZIP, the history entry, the error report. */
  function zipName() {
    return window.BULK_NAMES.sanitizeFilename(state.output.name || defaultName());
  }

  function start() {
    if (starting || isRunning(state.job)) return;
    // A headline still being typed belongs in this run, not the next one.
    store.flushEdits();
    var rows = store.sendable();
    if (!rows.length) return;
    starting = true;
    clearRunMarks();
    dom.result.hidden = true;
    refresh();
    fetch("/api/bulk/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(rows)),
    })
      .then(BULK.source.readJson)
      .then(function (job) {
        starting = false;
        job.rids = rows.map(function (r) { return r.rid; });
        track(job);
      })
      .catch(function (err) {
        starting = false;
        BULK.source.toast(err.message, "err");
        refresh();
      });
  }

  function track(job) {
    state.job = job;
    store.persist();
    showProgress(job);
    clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, POLL_MS);
  }

  var pollFailures = 0;
  var MAX_POLL_FAILURES = 8;

  function poll() {
    var job = state.job;
    if (!job) return;
    fetch("/api/bulk/jobs/" + encodeURIComponent(job.id))
      .then(function (res) {
        // 404 = the server no longer knows the run (it restarted): final.
        return BULK.source.readJson(res).catch(function (err) {
          if (res.status === 404) err.final = true;
          throw err;
        });
      })
      .then(function (next) {
        // The sheet was closed (or another run started) while this was in flight.
        if (state.job !== job) return;
        pollFailures = 0;
        next.rids = job.rids;
        state.job = next;
        // The first finished banner creates the history entry: remember it,
        // so a reload or a restart still has the download of what was made.
        if (next.entryId && !job.entryId) store.persist();
        mirrorRows(next);
        showProgress(next);
        if (next.status === "queued" || next.status === "running") {
          pollTimer = setTimeout(poll, POLL_MS);
        } else {
          finished(next);
        }
      })
      .catch(function (err) {
        if (state.job !== job) return;
        // A laptop waking up or a dropped connection: the run goes on on the
        // server, so keep asking for a while before giving up.
        if (!err.final && ++pollFailures < MAX_POLL_FAILURES) {
          pollTimer = setTimeout(poll, POLL_MS * Math.min(8, pollFailures + 1));
          return;
        }
        state.job = Object.assign({}, job, {
          status: "failed",
          error: err.final ? err.message : "Mistet kontakten med serveren. Sjekk Historikk – kjøringen kan ha blitt ferdig der.",
        });
        showProgress(state.job);
        finished(state.job);
      });
  }

  /**
   * Copy each row's run state onto its card. Rows are matched by id (the
   * server echoes it, and ids survive a reload); a photo the run found gone
   * is marked on the row itself, so «Hent bildene på nytt» offers to fix it —
   * but not when replaying a saved result after a reload: the photo may have
   * been fetched again since.
   */
  function mirrorRows(job, replay) {
    (job.rows || []).forEach(function (r, i) {
      var row = store.findRow(r.rid || (job.rids && job.rids[i]));
      if (!row) return;
      row.run = { status: r.status, error: r.error, notes: r.notes || [], smaller: r.smaller || [] };
      if (!replay && r.code === IMAGE_MISSING && row.image && row.image.status === "ok") BULK.source.imageGone(row, r.error);
    });
    store.emit("run-rows");
  }

  function clearRunMarks() {
    state.rows.forEach(function (r) { r.run = null; });
    store.emit("run-rows");
  }

  function fmtTime(sec) {
    if (sec < 60) return Math.max(5, Math.round(sec / 5) * 5) + " s";
    var m = Math.floor(sec / 60);
    var s = Math.round((sec % 60) / 10) * 10;
    return m + " min" + (s ? " " + s + " s" : "");
  }

  function showProgress(job) {
    var running = job.status === "queued" || job.status === "running";
    dom.progress.hidden = !running;
    refresh();
    if (!running) return;
    var settled = job.done + job.failed;
    var frac = job.total ? settled / job.total : 0;
    dom.bar.style.transform = "scaleX(" + Math.max(0.02, frac) + ")";
    dom.track.setAttribute("aria-valuenow", String(Math.round(frac * 100)));
    var text = "Lager " + Math.min(job.total, settled + 1) + " av " + job.total;
    if (job.startedAt && job.done > 0) {
      var perRow = (Date.now() - job.startedAt) / 1000 / job.done;
      text += " · ca. " + fmtTime(perRow * (job.total - settled)) + " igjen";
    } else if (job.status === "queued") {
      text = "Venter på tur …";
    }
    dom.progressText.textContent = text;
  }

  function finished(job) {
    clearTimeout(pollTimer);
    dom.track.removeAttribute("aria-valuenow");
    store.persist();
    refresh();
    renderResult();
    if (job.status === "done" || (job.status === "cancelled" && job.entryId)) {
      // Fill the Historikk tab and start the download.
      window.dispatchEvent(new CustomEvent("bulk:exported", { detail: job }));
      var link = dom.result.querySelector("a.btn-download");
      if (link && job.status === "done") {
        try { link.click(); } catch (_) {}
      }
      BULK.source.toast(job.status === "done" ? "Bannerne er ferdige" : "Avbrutt – de ferdige er lagret", "ok");
    } else if (job.status === "failed") {
      BULK.source.toast(job.error || "Genereringen feilet", "err");
    }
  }

  function downloadUrl(job, layout, html) {
    return (
      "/api/history/" + encodeURIComponent(job.entryId) + "/download?layout=" + layout + (html ? "&type=html" : "")
    );
  }

  function renderResult() {
    var job = state.job;
    dom.result.innerHTML = "";
    if (!job || job.status === "queued" || job.status === "running") {
      dom.result.hidden = true;
      return;
    }
    dom.result.hidden = false;
    if (!job.entryId) {
      dom.result.appendChild(h("p.bk-result__text.is-bad", null, job.error || "Ingen bannere ble laget."));
      renderFailures(job);
      return;
    }
    var html = job.outputType === "html";
    var layout = state.output.layout;
    var layoutName = LAYOUTS.filter(function (l) { return l[0] === layout; })[0][1].toLowerCase();
    // A run cut off by a restart: its counts are from before the cut, so the
    // download (which holds everything that was made) says it instead.
    var head =
      job.status === "failed"
        ? "Stoppet underveis – det som ble ferdig, er med i ZIP-en"
        : (job.status === "cancelled" ? "Avbrutt: " : "Ferdig: ") +
          job.done + (job.done === 1 ? " banner" : " bannere") + " i " + job.formats.length + " størrelser" +
          (job.failed ? " · " + job.failed + " feilet" : "");
    var main = h("a.btn-download", { href: downloadUrl(job, layout, html), download: "" }, "Last ned ZIP (" + layoutName + ")");
    var alts = LAYOUTS.filter(function (l) { return l[0] !== layout; }).map(function (l) {
      return h("a.result__alt-link", { href: downloadUrl(job, l[0], html), download: "" }, l[1]);
    });
    if (html) alts.push(h("a.result__alt-link", { href: downloadUrl(job, layout, false), download: "" }, "Bare bildene"));
    dom.result.appendChild(
      h(
        "div.bk-result__top",
        null,
        h("span.bk-result__text", null, head),
        main
      )
    );
    dom.result.appendChild(
      h("div.result__alt", null, h("span.result__alt-label", null, "eller:"), alts, h("span.result__alt-label", null, "· ligger også i Historikk"))
    );
    renderFailures(job);
  }

  /**
   * What did not get made, by sheet row — click one to fix it — and the
   * report to send to whoever filled in the sheet. Rows that got smaller
   * text than planned are listed too: they are made, but worth a look.
   */
  function renderFailures(job) {
    var failed = [];
    var smaller = [];
    (job.rows || []).forEach(function (r, i) {
      var row = store.findRow(r.rid || (job.rids && job.rids[i]));
      if (r.status === "error") failed.push({ row: row, text: r.error || "feilet" });
      else if (r.status === "done" && r.smaller && r.smaller.length) smaller.push({ row: row, text: (r.notes || []).slice(-r.smaller.length).join(" · ") });
    });
    if (!failed.length && !smaller.length) return;
    var item = function (f, cls) {
      var label = f.row ? (f.row.sheetRow ? "Rad " + f.row.sheetRow : "Ny rad") + ": " + (f.row.headline || "(uten overskrift)") : "(raden er fjernet)";
      var btn = h("button.bk-link", { type: "button", disabled: !f.row }, label);
      if (f.row) btn.addEventListener("click", function () { BULK.editor.open(f.row.rid); });
      return h("li" + cls, null, btn, h("span", null, " – " + f.text));
    };
    var list = h("ul.bk-result__fails");
    failed.slice(0, MAX_LISTED_FAILURES).forEach(function (f) { list.appendChild(item(f, ".is-bad")); });
    smaller.slice(0, Math.max(0, MAX_LISTED_FAILURES - failed.length)).forEach(function (f) { list.appendChild(item(f, "")); });
    var more = failed.length + smaller.length - list.children.length;
    if (more > 0) list.appendChild(h("li.bk-result__more", null, "… og " + more + " til (se feilrapporten)"));
    var report = h("button.btn-ghost.btn-sm", { type: "button" }, "Last ned feilrapport (CSV)");
    report.addEventListener("click", function () { BULK.ui.downloadProblemReport(state.rows, zipName()); });
    var title = [];
    if (failed.length) title.push(failed.length + (failed.length === 1 ? " banner ble ikke laget" : " bannere ble ikke laget"));
    if (smaller.length) title.push(smaller.length + " fikk mindre tekst enn planlagt");
    dom.result.appendChild(
      h("div.bk-result__failbox", null, h("div.bk-result__failhead", null, h("b", null, title.join(" · ")), report), list)
    );
  }

  function cancel() {
    var job = state.job;
    if (!job) return;
    dom.cancel.disabled = true;
    fetch("/api/bulk/jobs/" + encodeURIComponent(job.id), { method: "DELETE" })
      .then(BULK.source.readJson)
      .then(function () { dom.progressText.textContent = "Avbryter etter denne banneren …"; })
      .catch(function (err) { BULK.source.toast(err.message, "err"); })
      .then(function () { dom.cancel.disabled = false; });
  }

  /**
   * After a reload: follow a run that was still going, or show the result of
   * the last one. A run the server has forgotten (it restarted, or the run is
   * hours old) keeps the result as it was saved — its files are in Historikk.
   */
  function resume(saved) {
    if (!saved || !saved.id) return;
    if (!isRunning(saved)) {
      state.job = saved;
      mirrorRows(saved, true);
      refresh();
      renderResult();
      return;
    }
    fetch("/api/bulk/jobs/" + encodeURIComponent(saved.id))
      .then(BULK.source.readJson)
      .then(function (job) {
        job.rids = saved.rids || null;
        mirrorRows(job);
        if (isRunning(job)) track(job);
        else {
          state.job = job;
          finished(job);
        }
      })
      .catch(function () {
        // Usually the server restarted mid-run: what was finished is in
        // Historikk (lib/bulk/history.js keeps it).
        state.job = Object.assign({}, saved, {
          status: "failed",
          error: "Fant ikke kjøringen på serveren lenger – den kan ha blitt startet på nytt. Det som ble ferdig, ligger i Historikk.",
        });
        store.persist();
        refresh();
        renderResult();
      });
  }

  store.on(function (what) {
    if (what === "fit-done" || what === "evaluated" || what === "rows" || what === "formats") refresh();
    // The sheet was closed: stop following its run and clear what it showed.
    // (The run itself carries on on the server and lands in Historikk.)
    if (what === "rows" && !state.rows.length && dom.go) {
      clearTimeout(pollTimer);
      dom.progress.hidden = true;
      dom.result.hidden = true;
      refresh();
    }
  });

  BULK.run = { build: build, refresh: refresh, resume: resume, zipName: zipName };
})();
