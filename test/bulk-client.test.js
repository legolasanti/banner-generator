"use strict";

/* Tests for the Bulk page's model (public/bulk/state.js) and its error
   report (public/bulk/ui.js), run in Node with the few browser globals they
   touch stubbed. They pin down what a reload, a re-read sheet or a quick
   keystroke must not lose. */

const test = require("node:test");
const assert = require("node:assert/strict");

// ---- the browser, as far as these two files see it -------------------------
const storage = new Map();
global.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
global.window = {
  BannerFormats: require("../public/assets/formats.js"),
  BannerAutofit: require("../public/assets/autofit.js"),
  BULK_NAMES: require("../public/bulk/names.js"),
  WPE: { util: { h: () => ({}) } },
};
require("../public/bulk/state.js");
require("../public/bulk/ui.js");
const { store, state, ui } = { store: window.BULK.store, state: window.BULK.state, ui: window.BULK.ui };

function sheetRows(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ sheetRow: i + 2, headline: "Overskrift " + (i + 1), imageUrl: "https://x.no/" + i + ".jpg" });
  }
  return out;
}

function ready(row, level) {
  row.level = level || "ok";
  row.image = { status: "ok", id: "a".repeat(40) };
}

test.beforeEach(() => {
  storage.clear();
  state.filter = "all";
  state.search = "";
  state.sort = "sheet";
});

test("a headline typed into one row is applied to that row, even after moving on", async () => {
  store.setRows(sheetRows(2), {});
  const [a, b] = state.rows;
  // As the editor does: the row is captured when the key is pressed.
  store.deferEdit("ed:" + a.rid, () => store.updateRow(a, { headline: "Ny tekst" }), 10000);
  store.flushEdits("ed:"); // Alt+→ flushes before stepping
  assert.equal(a.headline, "Ny tekst");
  assert.equal(b.headline, "Overskrift 2");
});

test("a headline still being typed is applied before a run reads the rows", () => {
  store.setRows(sheetRows(1), {});
  const [a] = state.rows;
  store.deferEdit("grid:" + a.rid, () => store.updateRow(a, { headline: "Siste ord" }), 10000);
  store.flushEdits(); // what start() does
  assert.equal(a.headline, "Siste ord");
  let applied = 0;
  store.deferEdit("grid:" + a.rid, () => applied++, 5);
  store.flushEdits();
  store.flushEdits();
  assert.equal(applied, 1, "a flushed edit does not run again when its timer would have fired");
});

test("row ids and the last run survive a reload", () => {
  store.setRows(sheetRows(3), { source: { kind: "demo" } });
  const rids = state.rows.map((r) => r.rid);
  state.job = {
    id: "1-x-abc", status: "done", total: 3, done: 3, failed: 0, entryId: "1-x-abc", formats: ["house-mobile"],
    rows: rids.map((rid) => ({ rid, status: "done", fit: { big: "not saved" } })),
  };
  store.persist();
  state.rows = [];
  state.job = null;
  const restored = store.restore();
  assert.deepEqual(state.rows.map((r) => r.rid), rids);
  assert.equal(restored.job.entryId, "1-x-abc");
  assert.equal(restored.job.rows[0].rid, rids[0]);
  assert.equal(restored.job.rows[0].fit, undefined, "only what the result needs is kept");
  // New rows do not reuse a restored id.
  store.addBlankRow();
  const ids = state.rows.map((r) => r.rid);
  assert.equal(new Set(ids).size, ids.length);
});

test("an old session that saved only the job id is still resumed", () => {
  storage.set("bulk.session.v1", JSON.stringify({ v: 1, rows: [{ headline: "A" }], jobId: "7-a-b" }));
  const restored = store.restore();
  assert.deepEqual(restored.job, { id: "7-a-b", status: "running" });
});

test("the list filters, searches (also by row number) and sorts", () => {
  store.setRows(
    [
      { sheetRow: 2, headline: "Kort", imageUrl: "" },
      { sheetRow: 3, headline: "En mye lengre overskrift om hotell", imageUrl: "", filename: "hotell-host" },
      { sheetRow: 12, headline: "Middels lang tekst", imageUrl: "" },
    ],
    {}
  );
  const [a, b, c] = state.rows;
  ready(a);
  ready(b, "error");
  ready(c, "warn");
  state.search = "hotell";
  assert.deepEqual(store.viewRows(), [b]);
  state.search = "12";
  assert.deepEqual(store.viewRows(), [c]);
  state.search = "";
  state.sort = "long";
  assert.deepEqual(store.viewRows(), [b, c, a]);
  state.sort = "status";
  assert.deepEqual(store.viewRows(), [b, c, a]);
  state.filter = "ok";
  assert.deepEqual(store.viewRows(), [a]);
});

test("each row shows the filename the run will give it", () => {
  store.setRows(
    [
      { sheetRow: 2, headline: "Ny sofa", imageUrl: "x" },
      { sheetRow: 3, headline: "Ny sofa", imageUrl: "x" },
      { sheetRow: 4, headline: "Ny sofa", imageUrl: "x" },
      { sheetRow: 5, headline: "Hotell", filename: "hotell.png", imageUrl: "x" },
    ],
    {}
  );
  const [a, b, c, d] = state.rows;
  [a, b, c, d].forEach((r) => ready(r));
  b.include = false; // not sent, so c is the second "ny-sofa"
  store.emit("row", { row: b });
  assert.equal(store.fileBaseOf(a), "ny-sofa");
  assert.equal(store.fileBaseOf(c), "ny-sofa-2");
  assert.equal(store.fileBaseOf(d), "hotell");
  assert.equal(store.fileBaseOf(b), "ny-sofa", "a row that is not sent shows its plain name");
});

test("reading the sheet again keeps what was adjusted on rows that are unchanged", () => {
  store.setRows(sheetRows(3), { source: { kind: "google", url: "https://docs.google.com/x" } });
  const [a, b] = state.rows;
  a.pos = { x: 10, y: 20 };
  a.manual = { "house-mobile": 0.9 };
  store.updateRow(a, { weight: "regular", zoom: 12 }, { touch: true });
  a.include = false;
  b.pos = { x: 90, y: 90 };

  const next = sheetRows(3);
  next[1].headline = "Endret i arket"; // row 3 changed in the sheet
  next[0].weight = "bold"; // the sheet says bold, but it was changed here
  const kept = store.mergeRows(next, { source: { kind: "google", url: "https://docs.google.com/x" } });

  assert.equal(kept, 2);
  const [a2, b2] = state.rows;
  assert.equal(a2.rid, a.rid);
  assert.deepEqual(a2.pos, { x: 10, y: 20 });
  assert.deepEqual(a2.manual, { "house-mobile": 0.9 });
  assert.equal(a2.weight, "regular");
  assert.equal(a2.zoom, 12);
  assert.equal(a2.include, false);
  assert.equal(b2.headline, "Endret i arket");
  assert.equal(b2.pos, null, "a changed row starts fresh");
});

test("rows can be duplicated, added and removed", () => {
  store.setRows(sheetRows(2), {});
  const [a] = state.rows;
  a.manual = { "house-mobile": 1.1 };
  const copy = store.duplicateRow(a);
  assert.equal(state.rows[1], copy);
  assert.notEqual(copy.rid, a.rid);
  assert.deepEqual(copy.manual, a.manual);
  assert.notEqual(copy.manual, a.manual, "the copy does not share the original's objects");
  const blank = store.addBlankRow();
  assert.equal(state.rows[state.rows.length - 1], blank);
  store.removeRows([a, blank]);
  assert.equal(state.rows.length, 2);
  assert.ok(!state.rows.includes(a));
});

test("the error report lists what to fix, by sheet row, in words", () => {
  store.setRows(sheetRows(3), {});
  const [a, b, c] = state.rows;
  a.level = "error";
  a.issues = [{ level: "error", text: "Mangler bildelenke" }, { level: "info", text: "satt ned" }];
  b.level = "ok";
  b.issues = [];
  b.run = { status: "error", error: "Bildet finnes ikke lenger på serveren – hent det på nytt" };
  c.level = "ok";
  c.issues = [];
  const lines = ui.problemLines(state.rows);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[1], [2, "Overskrift 1", "https://x.no/0.jpg", "Feil", "Mangler bildelenke"]);
  assert.equal(lines[2][3], "Feilet ved generering");
  const csv = ui.toCsv([["=SUM(A1)", "a;b"]]);
  assert.equal(csv, "﻿'=SUM(A1);\"a;b\"\r\n");
});
