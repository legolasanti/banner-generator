"use strict";

/* Tests for the second round of Bulk fixes: sheets that fool the header
   detection, files in encodings Excel likes, XLSX files formatted far below
   their data, the filenames, and a run that survives a cancel at the wrong
   moment, a restart and a photo that was cleared from the server. Each test
   names the failure it pins down. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const express = require("express");

const formats = require("../public/assets/formats.js");
const names = require("../public/bulk/names.js");
const sheet = require("../lib/bulk/sheet");
const xlsx = require("../lib/bulk/xlsx");
const bulkHistory = require("../lib/bulk/history");
const { reportCsv } = require("../lib/bulk/deliver");
const { createBulkJobs, IMAGE_MISSING } = require("../lib/bulk/jobs");
const { createBulkImages } = require("../lib/bulk/images");
const { registerBulkRoutes, decodeSheetText } = require("../lib/bulk/routes");
const { zipToBuffer } = require("../lib/html5");

const IMAGE_ID = "b".repeat(40);

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ---------------------------------------------------------------------------
// Filenames
// ---------------------------------------------------------------------------
test("a typed extension is dropped, not folded into the name", () => {
  assert.equal(names.sanitizeFilename("hotell.png"), "hotell");
  assert.equal(names.sanitizeFilename("Høst-kampanje.JPEG"), "host-kampanje");
  assert.equal(names.sanitizeFilename("pakke.zip"), "pakke");
  // Only a real extension at the end: a dot inside is just dropped.
  assert.equal(names.sanitizeFilename("v1.2 tilbud"), "v12-tilbud");
});

test("letters NFKD cannot split are folded, not lost", () => {
  assert.equal(names.sanitizeFilename("Kışlık mont"), "kislik-mont");
  assert.equal(names.sanitizeFilename("Straße"), "strasse");
  assert.equal(names.sanitizeFilename("İstanbul"), "istanbul");
  assert.equal(names.sanitizeFilename("Ærø og Ålesund"), "aero-og-alesund");
  assert.equal(names.sanitizeFilename("!!!"), "banner");
});

test("file bases are unique and match what the run will use", () => {
  assert.deepEqual(
    names.fileBases([
      { headline: "Ny sofa" },
      { headline: "Ny sofa" },
      { filename: "ny-sofa" },
      { filename: "hotell.png" },
      { headline: "" },
    ]),
    ["ny-sofa", "ny-sofa-2", "ny-sofa-3", "hotell", "banner-5"]
  );
});

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------
test("a title row that starts like a column name does not become the header", () => {
  const out = sheet.readTable([
    ["Overskrifter uke 42"],
    ["Overskrift", "Bildelenke", "Filnavn"],
    ["Spar 50 %", "https://x.no/1.jpg", "spar"],
  ]);
  assert.equal(out.headerRow, 1);
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].headline, "Spar 50 %");
  assert.equal(out.rows[0].sheetRow, 3);
});

test("the row naming the most columns wins, exact names over prefixes", () => {
  const table = [
    ["Tekst fra kunden", "Bilde fra Drive"], // two prefix matches
    ["Overskrift", "Bildelenke", "Skrift"], // three exact
    ["Hei", "https://x.no/a.jpg", "Normal"],
  ];
  assert.equal(sheet.findHeaderRow(table), 1);
});

test("a single named column is still used when nothing names two", () => {
  const out = sheet.readTable([["Overskrift", "Antall tegn"], ["Hei", "3"]]);
  assert.equal(out.headerRow, 0);
  assert.equal(out.rows[0].headline, "Hei");
});

test("caption, font size and colour columns are not the photo, weight or headline", () => {
  assert.equal(sheet.fieldForHeader("Bildetekst"), null);
  assert.equal(sheet.fieldForHeader("Bildekreditt"), null);
  assert.equal(sheet.fieldForHeader("Fotograf"), null);
  assert.equal(sheet.fieldForHeader("Fontstørrelse"), null);
  assert.equal(sheet.fieldForHeader("Tekstfarge"), null);
  assert.equal(sheet.fieldForHeader("Tekststørrelse"), null);
  // The real ones still work, with or without a note.
  assert.equal(sheet.fieldForHeader("Bilde"), "image");
  assert.equal(sheet.fieldForHeader("Bilde-URL fra Drive"), "image");
  assert.equal(sheet.fieldForHeader("Skrift"), "weight");
  assert.equal(sheet.fieldForHeader("Tekst"), "headline");

  const out = sheet.readTable([
    ["Bildetekst", "Overskrift", "Bilde", "Fontstørrelse"],
    ["Foto: NTB", "Hei", "https://x.no/a.jpg", "24"],
  ]);
  assert.equal(out.rows[0].imageUrl, "https://x.no/a.jpg");
  assert.equal(out.rows[0].weight, "");
});

test("pasted cells keep quotes that do not wrap the whole cell", () => {
  const rows = sheet.parseDelimited('Overskrift\tBildelenke\n"Ny" sofa til halv pris\thttps://x.no/a.jpg\n');
  assert.deepEqual(rows[1], ['"Ny" sofa til halv pris', "https://x.no/a.jpg"]);
});

test("a lone opening quote in pasted cells does not swallow the rest", () => {
  const rows = sheet.parseDelimited('Overskrift\tBildelenke\n"Sitat uten slutt\thttps://x.no/a.jpg\nNeste\thttps://x.no/b.jpg\n');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], ['"Sitat uten slutt', "https://x.no/a.jpg"]);
  assert.deepEqual(rows[2], ["Neste", "https://x.no/b.jpg"]);
});

test("a pasted cell with a line break, wrapped in quotes, is still one cell", () => {
  const rows = sheet.parseDelimited('Overskrift\tBildelenke\n"To\nlinjer med ""sitat"""\thttps://x.no/a.jpg\n');
  assert.deepEqual(rows[1], ['To\nlinjer med "sitat"', "https://x.no/a.jpg"]);
});

// ---------------------------------------------------------------------------
// Encodings and file types
// ---------------------------------------------------------------------------
test("Excel's «Unicode-tekst» (UTF-16 with a BOM) is decoded", () => {
  const text = "Overskrift\tBildelenke\r\nSpar på høsten\thttps://x.no/a.jpg\r\n";
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  const be = Buffer.from(le);
  be.swap16();
  assert.equal(decodeSheetText(le), text);
  assert.equal(decodeSheetText(be), text);
  const out = sheet.readTable(sheet.parseDelimited(decodeSheetText(le)));
  assert.equal(out.rows[0].headline, "Spar på høsten");
});

test("an old Windows-1252 CSV keeps its æøå and typographic quotes", () => {
  const buf = Buffer.from([0x48, 0xf8, 0x73, 0x74, 0x20, 0x93, 0x6e, 0xe5, 0x94]); // Høst “nå”
  assert.equal(decodeSheetText(buf), "Høst “nå”");
  assert.equal(decodeSheetText(Buffer.from("Høst", "utf8")), "Høst");
});

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------
function xlsxWith(sheetXml, sharedXml) {
  const files = [
    { name: "xl/workbook.xml", buffer: Buffer.from('<workbook><sheets><sheet name="A" r:id="rId1"/></sheets></workbook>') },
    { name: "xl/worksheets/sheet1.xml", buffer: Buffer.from("<worksheet><sheetData>" + sheetXml + "</sheetData></worksheet>") },
  ];
  if (sharedXml) files.push({ name: "xl/sharedStrings.xml", buffer: Buffer.from("<sst>" + sharedXml + "</sst>") });
  return zipToBuffer(files);
}

test("an empty shared string (<si/>) does not shift the strings after it", async () => {
  const { table } = xlsx.readFirstSheet(
    await xlsxWith(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>2</v></c></row>',
      "<si><t>Overskrift</t></si><si/><si><t>Bildelenke</t></si>"
    )
  );
  assert.deepEqual(table, [["Overskrift", "Bildelenke"]]);
});

test("styled empty rows far below the data are skipped, not refused", async () => {
  const cell = (ref, text) => '<c r="' + ref + '" t="inlineStr"><is><t>' + text + "</t></is></c>";
  let xml = '<row r="1">' + cell("A1", "Overskrift") + cell("B1", "Bildelenke") + "</row>";
  xml += '<row r="2">' + cell("A2", "Hei") + cell("B2", "https://x.no/a.jpg") + "</row>";
  xml += '<row r="30000" s="3" customFormat="1"><c r="A30000" s="3"/><c r="B30000" s="3"/></row>';
  xml += '<row r="40000" ht="20" customHeight="1"/>';
  const { table } = xlsx.readFirstSheet(await xlsxWith(xml));
  assert.equal(table.length, 2);
  assert.equal(sheet.readTable(table).rows[0].headline, "Hei");
});

test("a real value beyond the row limit is still refused", async () => {
  const xml = '<row r="30000"><c r="A30000" t="inlineStr"><is><t>x</t></is></c></row>';
  await assert.rejects(async () => xlsx.readFirstSheet(await xlsxWith(xml)), /for stort/);
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
async function withBulkApp(deps, fn) {
  const app = express();
  app.use(express.json());
  registerBulkRoutes(app, { safeFetch: {}, images: {}, jobs: {}, ...deps });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  try {
    await fn("http://127.0.0.1:" + server.address().port);
  } finally {
    server.close();
  }
}

test(".ods and .numbers get the «save as .xlsx» message, not «not a valid XLSX»", async () => {
  await withBulkApp({}, async (base) => {
    for (const name of ["ark.ods", "ark.numbers"]) {
      const fd = new FormData();
      // A ZIP header, as both formats have.
      fd.append("file", new Blob([Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])]), name);
      const res = await fetch(base + "/api/bulk/sheet-file", { method: "POST", body: fd });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.match(body.error, /Lagre arket som \.xlsx/);
    }
  });
});

test("an uploaded UTF-16 sheet is read", async () => {
  await withBulkApp({}, async (base) => {
    const text = "Overskrift\tBildelenke\r\nSpar på høsten\thttps://x.no/a.jpg\r\n";
    const fd = new FormData();
    fd.append("file", new Blob([Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")])]), "ark.txt");
    const res = await fetch(base + "/api/bulk/sheet-file", { method: "POST", body: fd });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.rows[0].headline, "Spar på høsten");
  });
});

test("saving the text-size rules sends only the rules", async () => {
  let got = null;
  await withBulkApp(
    { updateAutoFit: async (autoFit) => ((got = autoFit), { autoFit, export: { format: "png" } }) },
    async (base) => {
      const rules = { "house-320x400": { min: 0.7, tiers: [[20, 1.2]] } };
      const res = await fetch(base + "/api/bulk/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoFit: rules, export: { format: "jpeg" } }),
      });
      assert.equal(res.status, 200);
      assert.deepEqual(got, rules);
      assert.deepEqual(await res.json(), { autoFit: rules });
      const bad = await fetch(base + "/api/bulk/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoFit: [1] }),
      });
      assert.equal(bad.status, 400);
    }
  );
});

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------
test("rendering a photo counts as using it, and gone photos are reported", async () => {
  const dir = tmpDir("bulk-img-");
  const images = createBulkImages({ dir, imageTools: {}, safeFetch: {}, sniffImageMime: () => null, links: {} });
  const meta = { id: IMAGE_ID, master: IMAGE_ID + ".jpg", preview: IMAGE_ID + ".preview.jpg", v: 5 };
  await fsp.writeFile(path.join(dir, IMAGE_ID + ".json"), JSON.stringify(meta));
  await fsp.writeFile(path.join(dir, meta.master), "x");
  await fsp.writeFile(path.join(dir, meta.preview), "x");
  const old = new Date(Date.now() - 20 * 24 * 3600 * 1000);
  await fsp.utimes(path.join(dir, IMAGE_ID + ".json"), old, old);

  assert.equal(await images.masterPath(IMAGE_ID), path.join(dir, meta.master));
  const touched = (await fsp.stat(path.join(dir, IMAGE_ID + ".json"))).mtimeMs;
  assert.ok(touched > Date.now() - 60 * 1000, "masterPath moves the last-used time forward");

  const gone = "c".repeat(40);
  assert.deepEqual(await images.missing([IMAGE_ID, gone, "../etc", IMAGE_ID]), [gone, "../etc"]);
  await fsp.rm(path.join(dir, meta.preview));
  assert.deepEqual(await images.missing([IMAGE_ID]), [IMAGE_ID], "a missing preview counts as gone");
});

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------
const HOUSE = formats.getProduct("houseads").specs;

/**
 * A job service with the renderer replaced: every format "renders" at the
 * requested scale unless `shrink` says otherwise, and the history writes are
 * recorded.
 */
function fakeJobs(opts) {
  const o = opts || {};
  const historyDir = tmpDir("bulk-run-");
  const upserts = [];
  let renders = 0;
  const service = createBulkJobs({
    formats,
    historyDir,
    enqueue: (task) => task(),
    loadSettings: async () => ({ export: { format: "png", includeTimestampInFilename: false }, staticBadges: { annonseText: "Annonse" } }),
    budgetFor: () => 0,
    normalizeClickUrl: (u) => ({ ok: true, url: u }),
    fileStamp: () => "",
    logoPath: "/logo.png",
    images: {
      isId: (id) => /^[a-f0-9]{40}$/.test(id),
      masterPath: async (id) => (o.missingImage === id ? null : "/photo.jpg"),
    },
    generateAll: async (specs, data) => {
      renders++;
      if (o.onRender) await o.onRender(renders, service);
      const out = {};
      for (const spec of specs) {
        const requested = data.headlineScales[spec.type];
        const scale = o.shrink && o.shrink[spec.type] ? o.shrink[spec.type] : requested;
        out[spec.key] = {
          image: { buffer: Buffer.from("png"), ext: "png", bytes: 3, note: "" },
          width: spec.width,
          height: spec.height,
          fit: { requested, scale, fits: true },
        };
      }
      return out;
    },
    upsertHistoryEntry: async (entry, upsertOpts) => {
      upserts.push({ ...JSON.parse(JSON.stringify(entry)), _insert: !!(upsertOpts && upsertOpts.insert) });
      if (o.upsert) return o.upsert(entry, upsertOpts, upserts.length);
      return true;
    },
  });
  return { service, upserts, historyDir };
}

async function finish(service, id) {
  for (let i = 0; i < 200; i++) {
    const job = service.get(id);
    if (job.status !== "queued" && job.status !== "running") return job;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("run did not finish");
}

const runBody = (rows) => ({
  rows: rows.map((r, i) => ({ rid: "r" + (i + 1), headline: "Banner " + (i + 1), imageId: IMAGE_ID, scales: { [HOUSE[0].type]: 0.7 }, ...r })),
  options: { formats: [HOUSE[0].key], outputType: "image", format: "png", name: "test" },
});

test("the history entry is written after the first banner and kept up to date", async () => {
  const { service, upserts, historyDir } = fakeJobs();
  const job = await finish(service, (await service.create(runBody([{}, {}, {}]))).id);
  assert.equal(job.status, "done");
  assert.equal(upserts.length, 4, "one per row, then the final one");
  assert.equal(upserts[0].partial, true);
  assert.equal(upserts[0].count, 1);
  assert.match(upserts[0].headline, /lages/);
  const last = upserts[upserts.length - 1];
  assert.equal(last.partial, undefined);
  assert.equal(last.count, 3);
  assert.equal(last.rows, undefined, "the entry itself holds no rows");
  const rows = JSON.parse(await fsp.readFile(path.join(historyDir, job.id, bulkHistory.ROWS_FILE), "utf8"));
  assert.equal(rows.length, 3);
  assert.equal(job.rows[0].rid, "r1", "the page matches its cards by rid");
});

test("a cancel that arrives while the last banner renders does not cancel the run", async () => {
  const { service } = fakeJobs({
    onRender: async (n, svc) => {
      if (n === 2) svc.cancel(svc._lastId);
    },
  });
  const created = await service.create(runBody([{}, {}]));
  service._lastId = created.id;
  const job = await finish(service, created.id);
  assert.equal(job.status, "done");
  assert.equal(job.done, 2);
});

test("a cancel that stops rows is a cancelled run with the rest skipped", async () => {
  const { service, upserts } = fakeJobs({
    onRender: async (n, svc) => {
      if (n === 1) svc.cancel(svc._lastId);
    },
  });
  const created = await service.create(runBody([{}, {}, {}]));
  service._lastId = created.id;
  const job = await finish(service, created.id);
  assert.equal(job.status, "cancelled");
  assert.deepEqual(job.rows.map((r) => r.status), ["done", "skipped", "skipped"]);
  assert.equal(upserts[upserts.length - 1].cancelled, true);
});

test("a photo cleared from the server is reported as such on its row", async () => {
  const gone = "d".repeat(40);
  const { service } = fakeJobs({ missingImage: gone });
  const job = await finish(service, (await service.create(runBody([{}, { imageId: gone }]))).id);
  assert.equal(job.rows[1].status, "error");
  assert.equal(job.rows[1].code, IMAGE_MISSING);
  assert.match(job.rows[1].error, /finnes ikke lenger/);
  assert.equal(job.rows[0].code, undefined);
});

test("a size the renderer had to step below the plan is reported", async () => {
  const type = HOUSE[0].type;
  const { service, historyDir } = fakeJobs({ shrink: { [type]: 0.65 } });
  const job = await finish(service, (await service.create(runBody([{}]))).id);
  const row = job.rows[0];
  assert.equal(row.smaller.length, 1);
  assert.equal(row.smaller[0].requested, 0.7);
  assert.equal(row.smaller[0].scale, 0.65);
  assert.ok(row.notes.some((n) => /satt ned fra 70 % til 65 %/.test(n)));

  const rows = JSON.parse(await fsp.readFile(path.join(historyDir, job.id, bulkHistory.ROWS_FILE), "utf8"));
  const csv = reportCsv({ rows }, { [HOUSE[0].key]: HOUSE[0].label }, false);
  assert.match(csv, /Tekst satt ned fra 70 % ved generering/);
});

test("a run deleted in Historikk while going stops instead of bringing its entry back", async () => {
  // Inserted by the first save; gone (deleted) by the second.
  const { service, upserts } = fakeJobs({ upsert: (entry, opts) => !!(opts && opts.insert) });
  const job = await finish(service, (await service.create(runBody([{}, {}, {}, {}]))).id);
  assert.equal(job.status, "failed");
  assert.match(job.error, /slettet fra Historikk/);
  assert.equal(job.entryId, null);
  assert.equal(upserts.filter((u) => u._insert).length, 1, "only the first save may add the entry");
  assert.equal(upserts.length, 2, "nothing written after it was found gone");
  assert.deepEqual(job.rows.map((r) => r.status), ["done", "done", "skipped", "skipped"]);
});

test("a final save that fails leaves the entry stopped, not «lages …»", async () => {
  const { service, upserts } = fakeJobs({
    upsert: (entry) => {
      if (!entry.partial && !entry.interrupted) throw new Error("disk full");
      return true;
    },
  });
  const job = await finish(service, (await service.create(runBody([{}, {}]))).id);
  assert.equal(job.status, "failed");
  const last = upserts[upserts.length - 1];
  assert.equal(last.interrupted, true);
  assert.equal(last.partial, undefined);
  assert.match(last.headline, /stoppet underveis/);
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
test("a run cut off by a restart is marked as stopped, not left «being made»", () => {
  const { history, changed } = bulkHistory.recoverInterrupted([
    { id: "1", kind: "bulk", partial: true, count: 4, formats: ["a", "b"], headline: "x" },
    { id: "2", kind: "bulk", count: 2, formats: ["a"], headline: "2 bannere · 1 formater" },
    { id: "3", headline: "single" },
  ]);
  assert.equal(changed, true);
  assert.equal(history[0].partial, undefined);
  assert.equal(history[0].interrupted, true);
  assert.equal(history[0].headline, "4 bannere · 2 formater · stoppet underveis");
  assert.equal(history[1].headline, "2 bannere · 1 formater");
  assert.equal(bulkHistory.recoverInterrupted([history[1]]).changed, false);
});

test("old entries' inline rows move to rows.json; /api/history gets summaries", async () => {
  const dir = tmpDir("bulk-hist-");
  await fsp.mkdir(path.join(dir, "1700000000000-a-abc"));
  const entry = { id: "1700000000000-a-abc", kind: "bulk", rows: [{ index: 0, fileBase: "a" }] };
  const { history, changed } = await bulkHistory.migrateInlineRows([entry, { id: "x", kind: "single" }], dir);
  assert.equal(changed, true);
  assert.equal(history[0].rows, undefined);
  assert.deepEqual(await bulkHistory.loadRows(history[0], dir), entry.rows);
  assert.deepEqual(await bulkHistory.loadRows(entry, dir), entry.rows, "inline rows are still read");
  assert.equal(bulkHistory.summarize(entry).rows, undefined);
  assert.equal(entry.rows.length, 1, "summarize does not touch the stored entry");
});

// A folder in a history dir: `bulk` gives it the rows.json only a bulk run
// writes, `ageMs` backdates it.
async function makeFolder(dir, name, ageMs, bulk) {
  await fsp.mkdir(path.join(dir, name));
  if (bulk) await fsp.writeFile(path.join(dir, name, bulkHistory.ROWS_FILE), "[]");
  const t = new Date(Date.now() - ageMs);
  await fsp.utimes(path.join(dir, name), t, t);
}
const HOUR = 3600 * 1000;

test("only old bulk folders without an entry are swept, into the trash", async () => {
  const dir = tmpDir("bulk-sweep-");
  await makeFolder(dir, "1700000000001-known-aaa", 5 * HOUR, true);
  await makeFolder(dir, "1700000000002-orphan-bbb", 5 * HOUR, true);
  await makeFolder(dir, "1700000000003-fresh-ccc", 60 * 1000, true); // a run being written now
  await makeFolder(dir, "1700000000004-single-ddd", 5 * HOUR, false); // a single banner or wallpaper
  await makeFolder(dir, "not-a-history-id", 5 * HOUR, true);
  await fsp.writeFile(path.join(dir, "history.json"), "[]");
  const now = Date.now();
  const moved = await bulkHistory.sweepOrphans(dir, [{ id: "1700000000001-known-aaa" }], now);
  assert.deepEqual(moved, ["1700000000002-orphan-bbb"]);
  const left = (await fsp.readdir(dir)).sort();
  assert.deepEqual(left, [
    ".trash", "1700000000001-known-aaa", "1700000000003-fresh-ccc", "1700000000004-single-ddd", "history.json", "not-a-history-id",
  ]);
  assert.deepEqual(await fsp.readdir(path.join(dir, ".trash")), ["1700000000002-orphan-bbb~" + now], "moved, not deleted");

  // The trash keeps a folder for 30 days, then lets it go.
  const later = [{ id: "1700000000001-known-aaa" }, { id: "1700000000003-fresh-ccc" }];
  await bulkHistory.sweepOrphans(dir, later, now + 31 * 24 * HOUR);
  assert.deepEqual(await fsp.readdir(path.join(dir, ".trash")), []);
});

async function tidyIn(dir, historyText) {
  const json = path.join(dir, "..", path.basename(dir) + "-history.json");
  if (historyText != null) await fsp.writeFile(json, historyText);
  let written = null;
  const result = await bulkHistory.tidy({
    historyDir: dir,
    historyJson: json,
    withLock: (fn) => fn(),
    writeHistory: async (h) => { written = h; },
  });
  return { result, written };
}

test("a corrupt or missing history.json never sweeps anything", async () => {
  for (const text of ['[{"id": "1700000000001-known-aaa"', null, '{"not": "a list"}']) {
    const dir = tmpDir("bulk-tidy-");
    await makeFolder(dir, "1700000000001-known-aaa", 5 * HOUR, true);
    await makeFolder(dir, "1700000000002-other-bbb", 5 * HOUR, true);
    const { result, written } = await tidyIn(dir, text);
    assert.equal(result.skipped, true, String(text));
    assert.equal(written, null, "nothing written back");
    assert.equal((await fsp.readdir(dir)).length, 2, "every folder still there");
  }
});

test("an empty history next to existing folders is treated as lost, not empty", async () => {
  const dir = tmpDir("bulk-tidy-");
  await makeFolder(dir, "1700000000002-orphan-bbb", 5 * HOUR, true);
  const { result } = await tidyIn(dir, "[]");
  assert.equal(result.skipped, true);
  assert.deepEqual(await fsp.readdir(dir), ["1700000000002-orphan-bbb"]);
});

test("a clean history.json lets tidy recover a stopped run and sweep a real orphan", async () => {
  const dir = tmpDir("bulk-tidy-");
  await makeFolder(dir, "1700000000001-known-aaa", 5 * HOUR, true);
  await makeFolder(dir, "1700000000002-orphan-bbb", 5 * HOUR, true);
  await makeFolder(dir, "1700000000003-single-ccc", 5 * HOUR, false);
  const { result, written } = await tidyIn(
    dir,
    JSON.stringify([{ id: "1700000000001-known-aaa", kind: "bulk", partial: true, count: 1, formats: ["a"] }])
  );
  assert.deepEqual(result.removed, ["1700000000002-orphan-bbb"]);
  assert.equal(written[0].interrupted, true);
  assert.ok((await fsp.readdir(dir)).includes("1700000000003-single-ccc"), "non-bulk folders are left alone");
});
