/* =========================================================================
   bulk/ui.js — small pieces the Bulk screens share: the segmented control,
   keeping Tab inside a modal, a file the browser saves, and the error report
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
    trapTab: trapTab,
    saveText: saveText,
    toCsv: toCsv,
    problemLines: problemLines,
    downloadProblemReport: downloadProblemReport,
  };
})();
