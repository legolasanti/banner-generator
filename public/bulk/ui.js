/* =========================================================================
   bulk/ui.js — small pieces the Bulk screens share: the segmented control,
   line icons, keeping Tab inside a modal, a file the browser saves, and the error report
   for whoever filled in the sheet.
   ========================================================================= */
(function () {
  "use strict";

  var BULK = (window.BULK = window.BULK || {});
  var h = window.WPE.util.h;

  /** A row of buttons where one is active. items: [[value, label, title?]]. */
  function seg(items, active, onPick, label) {
    var wrap = h("div.segmented.bk-seg", { role: "group", "aria-label": label });
    items.forEach(function (it) {
      var b = h("button.seg", { type: "button", "data-val": it[0], title: it[2] || null }, it[1]);
      if (String(it[0]) === String(active)) b.classList.add("is-active");
      b.setAttribute("aria-pressed", String(it[0]) === String(active) ? "true" : "false");
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(wrap.children, function (x) {
          x.classList.toggle("is-active", x === b);
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
        onPick(it[0]);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  // The few line icons the Bulk screens use, drawn inline (Lucide geometry,
  // 24×24, stroke 2) so they are there on first paint.
  var SVG_NS = "http://www.w3.org/2000/svg";
  var ICONS = {
    link: [["path", "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"], ["path", "M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"]],
    upload: [["path", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"], ["path", "m17 8-5-5-5 5M12 3v12"]],
    download: [["path", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"], ["path", "m7 10 5 5 5-5M12 15V3"]],
    clipboard: [["path", "M9 4h6v3H9z"], ["path", "M15 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"]],
    left: [["path", "m15 18-6-6 6-6"]],
    right: [["path", "m9 18 6-6-6-6"]],
    x: [["path", "M18 6 6 18M6 6l12 12"]],
  };

  /** An inline SVG icon by name, hidden from screen readers. */
  function icon(name, size) {
    var s = String(size || 16);
    var svg = document.createElementNS(SVG_NS, "svg");
    [["viewBox", "0 0 24 24"], ["width", s], ["height", s], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "2"],
      ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"], ["focusable", "false"]].forEach(function (a) {
      svg.setAttribute(a[0], a[1]);
    });
    svg.classList.add("bk-ico");
    (ICONS[name] || []).forEach(function (n) {
      var el = document.createElementNS(SVG_NS, n[0]);
      el.setAttribute("d", n[1]);
      svg.appendChild(el);
    });
    return svg;
  }

  var FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /**
   * Keep Tab inside `root` (a modal): from the last control back to the
   * first, and the other way with Shift. Call from the modal's keydown.
   */
  function trapTab(root, e) {
    if (e.key !== "Tab") return;
    var list = Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (el) {
      return !el.hidden && el.offsetParent !== null;
    });
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    var active = document.activeElement;
    if (e.shiftKey && (active === first || !root.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !root.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  /** Hand the browser a text file to save. */
  function saveText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = h("a", { href: url, download: filename, hidden: true });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // Same rules as the run's rapport.csv (lib/bulk/deliver.js): semicolons and
  // a BOM for Norwegian Excel, and a cell starting with = + - @ defused, since
  // headlines come from someone's sheet.
  function csvCell(value) {
    var s = String(value == null ? "" : value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(lines) {
    return "﻿" + lines.map(function (l) { return l.map(csvCell).join(";"); }).join("\r\n") + "\r\n";
  }

  var LEVEL_WORD = { error: "Feil", warn: "Sjekk" };

  /**
   * Every row with something to fix, as a sheet the person who filled it in
   * can work through: the row number they know, the headline, and why — in
   * words, not codes. Problems found before the run and failures during it
   * both count; rows that are only "Venter" do not.
   */
  function problemLines(rows) {
    var lines = [["Rad i arket", "Overskrift", "Bildelenke", "Status", "Årsak"]];
    rows.forEach(function (row) {
      var reasons = (row.issues || [])
        .filter(function (i) { return i.level === "error" || i.level === "warn"; })
        .map(function (i) { return i.text; });
      var status = LEVEL_WORD[row.level] || "";
      var run = row.run;
      if (run && run.status === "error") {
        status = "Feilet ved generering";
        reasons.push(run.error || "Kunne ikke lage banneren");
      } else if (run && run.notes && run.notes.length && run.smaller && run.smaller.length) {
        status = status || "Laget, med merknad";
        reasons = reasons.concat(run.notes);
      }
      if (!reasons.length) return;
      lines.push([row.sheetRow || "", row.headline, row.imageUrl, status, reasons.join(" · ")]);
    });
    return lines;
  }

  function downloadProblemReport(rows, name) {
    var lines = problemLines(rows);
    if (lines.length < 2) return 0;
    saveText((name || "houseads-bulk") + "-feilrapport.csv", toCsv(lines), "text/csv;charset=utf-8");
    return lines.length - 1;
  }

  BULK.ui = {
    seg: seg,
    icon: icon,
    trapTab: trapTab,
    saveText: saveText,
    toCsv: toCsv,
    problemLines: problemLines,
    downloadProblemReport: downloadProblemReport,
  };
})();
