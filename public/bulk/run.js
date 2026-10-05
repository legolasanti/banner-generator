/* =========================================================================
   bulk/run.js — the bar at the bottom: how to deliver, the button, and the
   run itself.

   Only rows that are ticked and have no errors are sent. The run happens on
   the server (lib/bulk/jobs.js); this polls it, mirrors each row's state onto
   its card, and when it finishes offers the ZIP in the chosen folder layout —
   plus the other layouts, which cost nothing (the files are already made).
   The job id is remembered, so a reload in the middle picks the run back up.
   ========================================================================= */
(function () {
  "use strict";

  var BULK = (window.BULK = window.BULK || {});
  var store = BULK.store;
  var state = BULK.state;
  var h = window.WPE.util.h;

  var POLL_MS = 900;
  var dom = {};
  var pollTimer = null;

  var LAYOUTS = [
    ["format", "Per størrelse", "Én mappe per størrelse, f.eks. 320x400/"],
    ["banner", "Per banner", "Én mappe per banner med alle størrelsene"],
    ["flat", "Alt i én", "Alle filene direkte i ZIP-en"],
  ];

  function seg(items, active, onPick, label) {
    var wrap = h("div.segmented.bk-seg", { role: "group", "aria-label": label });
    items.forEach(function (it) {
      var b = h("button.seg", { type: "button", "data-val": it[0], title: it[2] || null }, it[1]);
      if (String(it[0]) === String(active)) b.classList.add("is-active");
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(wrap.children, function (x) { x.classList.toggle("is-active", x === b); });
        onPick(it[0]);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

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
    dom.name = h("input.bk-input.bk-name", { type: "text", maxlength: 60, placeholder: "houseads-bulk", value: o.name || "", "aria-label": "Navn på ZIP-filen" });
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
    dom.progressText = h("span.bk-progress__text");
    dom.cancel = h("button.btn-ghost.btn-sm", { type: "button" }, "Avbryt");
    dom.cancel.addEventListener("click", cancel);
    dom.progress.appendChild(h("div.bk-progress__track", null, dom.bar));
    dom.progress.appendChild(h("div.bk-progress__row", null, dom.progressText, dom.cancel));

    dom.result = h("div.bk-result", { hidden: true });

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

  function sendable() {
    return state.rows.filter(function (r) {
      return r.include && (r.level === "ok" || r.level === "warn");
    });
  }

  /** The button's wording and the line beside it. */
  function refresh() {
    if (!dom.go) return;
    var running = state.job && (state.job.status === "queued" || state.job.status === "running");
    var c = BULK.fit.counts();
    var ready = sendable().length;
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
        };
      }),
      options: {
        formats: state.formats.slice(),
        outputType: state.output.type,
        format: state.output.format,
        resolution: state.output.resolution,
        name: state.output.name || defaultName(),
        clickUrl: state.output.clickUrl,
      },
    };
  }

  function defaultName() {
    var src = state.source || {};
    var base = src.sheetName || (src.name ? src.name.replace(/\.[a-z0-9]+$/i, "") : "") || "houseads-bulk";
    return base;
  }

  function start() {
    var rows = sendable();
    if (!rows.length) return;
    clearRunMarks();
    dom.result.hidden = true;
    dom.go.disabled = true;
    fetch("/api/bulk/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(rows)),
    })
      .then(BULK.source.readJson)
      .then(function (job) {
        job.rids = rows.map(function (r) { return r.rid; });
        track(job);
      })
      .catch(function (err) {
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

  /** Copy each row's run state onto its card. */
  function mirrorRows(job) {
    if (!job.rids) return;
    job.rows.forEach(function (r, i) {
      var row = store.findRow(job.rids[i]);
      if (row) row.run = { status: r.status, error: r.error };
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
      return;
    }
    var html = job.outputType === "html";
    var layout = state.output.layout;
    var layoutName = LAYOUTS.filter(function (l) { return l[0] === layout; })[0][1].toLowerCase();
    var head =
      (job.status === "cancelled" ? "Avbrutt: " : "Ferdig: ") +
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

  /** Pick a run back up after a reload. */
  function resume(jobId) {
    if (!jobId) return;
    fetch("/api/bulk/jobs/" + encodeURIComponent(jobId))
      .then(BULK.source.readJson)
      .then(function (job) {
        // Row ids are new after a reload; match by position among the sent rows.
        job.rids = null;
        track(job);
      })
      .catch(function () { /* finished and forgotten, or the server restarted */ });
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

  BULK.run = { build: build, refresh: refresh, resume: resume };
})();
