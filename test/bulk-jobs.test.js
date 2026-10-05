"use strict";

/* Tests for the parts of Bulk that decide what gets made: the text-size rule
   tables, the validation of a run request (the server must not trust what
   the page sends), the filenames, and the report that ships in the ZIP. */

const test = require("node:test");
const assert = require("node:assert/strict");

const formats = require("../public/assets/formats.js");
const autofit = require("../public/assets/autofit.js");
const { createBulkJobs, nameFromHeadline } = require("../lib/bulk/jobs");
const { reportCsv, sizeFolder } = require("../lib/bulk/deliver");

const HOUSE = formats.getProduct("houseads").specs;

// The server's own helpers, reduced to what parseRequest needs.
function sanitizeFilename(name) {
  let s = String(name == null ? "" : name).trim().toLowerCase();
  s = s.replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a");
  s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  s = s.replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/^-+|-+$/g, "");
  return s || "banner";
}
function normalizeClickUrl(raw) {
  try {
    const url = new URL(String(raw || "").trim());
    return /^https?:$/.test(url.protocol) ? { ok: true, url: url.href } : { ok: false, error: "bad" };
  } catch {
    return { ok: false, error: "Mangler klikk-lenke" };
  }
}
const IMAGE_ID = "a".repeat(40);
const jobs = createBulkJobs({
  formats,
  sanitizeFilename,
  normalizeClickUrl,
  images: { isId: (id) => /^[a-f0-9]{40}$/.test(id) },
});
const SETTINGS = { export: { format: "png" } };

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
test("every house format has a sane default rule", () => {
  for (const spec of HOUSE) {
    const r = spec.autoFit;
    assert.ok(r, spec.key + " has no autoFit rule");
    assert.ok(r.min >= 0.5 && r.min <= 1, spec.key + " min");
    assert.ok(r.max >= 1 && r.max <= 1.3, spec.key + " max");
    for (let i = 1; i < r.tiers.length; i++) {
      assert.ok(r.tiers[i][0] > r.tiers[i - 1][0], spec.key + ": character counts must rise");
      assert.ok(r.tiers[i][1] <= r.tiers[i - 1][1], spec.key + ": sizes must not grow with length");
    }
    assert.ok(r.maxChars > r.tiers[r.tiers.length - 1][0], spec.key + ": maxChars beyond the last tier");
  }
});

test("the 980x500 is registered like the other house formats", () => {
  const spec = formats.specByKey("houseads", "house-billboard");
  assert.equal(spec.width, 980);
  assert.equal(spec.height, 500);
  assert.ok(formats.findSet("houseads", "all").keys.includes("house-billboard"));
});

test("the rule picks the tier by character count and falls to the floor", () => {
  const rule = autofit.cleanRule({ min: 0.7, max: 1.2, tiers: [[20, 1.2], [30, 1.1], [42, 1]] });
  assert.equal(autofit.ruleScale(rule, 5), 1.2);
  assert.equal(autofit.ruleScale(rule, 20), 1.2);
  assert.equal(autofit.ruleScale(rule, 21), 1.1);
  assert.equal(autofit.ruleScale(rule, 42), 1);
  assert.equal(autofit.ruleScale(rule, 43), 0.7);
});

test("cleanRule sorts, dedupes and clamps a hand-edited table", () => {
  const rule = autofit.cleanRule(
    { min: 0.2, max: 9, tiers: [[42, 1], [20, 3], [20, 1.1], [-5, 1], ["x", 1]] },
    { min: 0.7, max: 1.2, tiers: [[10, 1]] }
  );
  assert.equal(rule.min, 0.5);
  assert.equal(rule.max, 2);
  assert.deepEqual(rule.tiers, [[20, 2], [42, 1]]);
});

test("an override replaces only what it names", () => {
  const spec = HOUSE[0];
  const r = formats.autoFitRule(spec, { [spec.label]: { tiers: [[10, 1.2]] } });
  assert.deepEqual(r.tiers, [[10, 1.2]]);
  assert.equal(r.min, spec.autoFit.min);
  assert.equal(formats.autoFitRule(spec, {}), spec.autoFit);
  assert.equal(formats.autoFitRule(formats.specByKey("norsktipping", "desktop"), {}), null);
});

test("characters are counted as a reader counts them", () => {
  assert.equal(autofit.countChars("  Spar   50 %  "), 9); // spaces count, runs of them once
  assert.equal(autofit.countChars("Ærø og Ålesund"), 14);
  assert.equal(autofit.countChars("🎉 Fest"), 6);
});

// ---------------------------------------------------------------------------
// Run requests
// ---------------------------------------------------------------------------
test("a run request is validated and normalised", () => {
  const req = jobs.parseRequest(
    {
      rows: [
        { headline: "  Spar   50 %  ", imageId: IMAGE_ID, scales: { "house-mobile": 9, "house-panorama": "x" }, posX: 140, zoom: -3, weight: "x" },
        { headline: "", imageId: IMAGE_ID },
        { headline: "Hei", imageId: "../../etc/passwd" },
      ],
      options: { formats: ["house-mobile", "house-panorama", "nonsense"], outputType: "image", format: "gif", resolution: 7 },
    },
    SETTINGS
  );
  assert.deepEqual(req.specs.map((s) => s.key), ["house-mobile", "house-panorama"]);
  assert.equal(req.format, "png");
  assert.equal(req.resolution, 2);
  const [a, b, c] = req.rows;
  assert.equal(a.headline, "Spar 50 %");
  assert.equal(a.scales["house-mobile"], 2);
  assert.equal(a.scales["house-panorama"], 1);
  assert.equal(a.posX, 100);
  assert.equal(a.zoom, 0);
  assert.equal(a.weight, "bold");
  assert.equal(a.preError, "");
  assert.equal(b.preError, "Mangler overskrift");
  assert.equal(c.preError, "Mangler bilde");
});

test("a run needs at least one known format and at least one row", () => {
  assert.throws(() => jobs.parseRequest({ rows: [{}], options: { formats: ["x"] } }, SETTINGS), /format/);
  assert.throws(() => jobs.parseRequest({ rows: [], options: { formats: ["house-mobile"] } }, SETTINGS), /rader/);
});

test("HTML5 rows need a click link, from the row or the run's default", () => {
  const base = { headline: "Hei", imageId: IMAGE_ID };
  const req = jobs.parseRequest(
    {
      rows: [base, { ...base, clickUrl: "https://abc.no/a" }],
      options: { formats: ["house-mobile"], outputType: "html" },
    },
    SETTINGS
  );
  assert.ok(req.rows[0].preError);
  assert.equal(req.rows[1].clickUrl, "https://abc.no/a");
  assert.equal(req.resolution, 1, "HTML5 is always 1x");

  const withDefault = jobs.parseRequest(
    { rows: [base], options: { formats: ["house-mobile"], outputType: "html", clickUrl: "https://abc.no/" } },
    SETTINGS
  );
  assert.equal(withDefault.rows[0].preError, "");
  assert.equal(withDefault.rows[0].clickUrl, "https://abc.no/");
});

test("filenames are unique within a run", () => {
  const row = { headline: "Ny sofa", imageId: IMAGE_ID };
  const req = jobs.parseRequest(
    { rows: [row, row, { ...row, filename: "ny-sofa" }], options: { formats: ["house-mobile"] } },
    SETTINGS
  );
  assert.deepEqual(req.rows.map((r) => r.fileBase), ["ny-sofa", "ny-sofa-2", "ny-sofa-3"]);
});

test("a filename made from a long headline is cut at a word", () => {
  const name = nameFromHeadline(
    sanitizeFilename,
    "Denne overskriften er altfor lang for et lite format fordi den bare fortsetter"
  );
  assert.equal(name, "denne-overskriften-er-altfor-lang-for-et-lite");
  assert.ok(name.length <= 48);
  assert.equal(nameFromHeadline(sanitizeFilename, "Kort"), "kort");
});

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------
test("the report is one semicolon line per file, readable by Norwegian Excel", () => {
  const csv = reportCsv(
    {
      rows: [
        {
          sheetRow: 2,
          fileBase: "spar",
          headline: 'Spar 50 %; "nå"',
          report: [{ key: "house-mobile", label: "house-320x400", file: "spar-house-320x400.png", bytes: 51200, scale: 1.1, note: "" }],
        },
      ],
    },
    { "house-mobile": "house-320x400" },
    false
  );
  assert.ok(csv.startsWith("﻿"), "BOM so Excel reads UTF-8");
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[1], '2;spar;"Spar 50 %; ""nå""";320x400;110 %;spar-house-320x400.png;50;');
});

test("size folders drop the house- prefix", () => {
  assert.equal(sizeFolder("house-980x500"), "980x500");
});
