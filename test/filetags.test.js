"use strict";

/* The Norsk Tipping creative code at the end of a filename
   (public/assets/filetags.js) and the names the files get around it. */

const test = require("node:test");
const assert = require("node:assert/strict");

const tags = require("../public/assets/filetags.js");
const formats = require("../public/assets/formats.js");
const names = require("../public/bulk/names.js");

const ALL_YES = { F: true, P: true, G: true, R: true };

test("the code is the five answers in the order F P G T R", () => {
  assert.equal(tags.code({ F: true, P: false, G: true, R: false }, "Her bor vinneren"), "F1P0G1T1R0");
  assert.equal(tags.code({ F: false, P: true, G: false, R: true }, "Vant 14,3 mill – her bor vinneren i Bergen"), "F0P1G0T0R1");
});

test("T is measured from the headline, at most 30 characters", () => {
  const exactly30 = "a".repeat(30);
  assert.equal(tags.code(ALL_YES, exactly30), "F1P1G1T1R1");
  assert.equal(tags.code(ALL_YES, exactly30 + "b"), "F1P1G1T0R1");
  // Edges and doubled spaces are not characters anyone reads.
  assert.equal(tags.textLength("  Vant   14 mill  "), 12);
  // An answer sent for T is ignored — it is not the user's to set.
  assert.equal(tags.code(Object.assign({ T: false }, ALL_YES), "Kort"), "F1P1G1T1R1");
});

test("no code until every question is answered", () => {
  assert.equal(tags.code({ F: true, P: true, G: true }, "Kort"), "");
  assert.equal(tags.code(ALL_YES, ""), "", "T cannot be measured without a headline");
  assert.equal(tags.draft({ F: true, G: false }, "Kort"), "F1P?G0T1R?");
  assert.equal(tags.draft({}, ""), "F?P?G?T?R?");
});

test("a code from a client is taken only when it is exactly the five pairs", () => {
  assert.equal(tags.clean("F1P0G1T0R0"), "F1P0G1T0R0");
  assert.equal(tags.clean(" f1p0g1t0r0 "), "F1P0G1T0R0");
  for (const bad of ["", "F1P0G1T0", "F2P0G1T0R0", "F1P0G1T0R0X", "../F1P0G1T0R0", null, undefined]) {
    assert.equal(tags.clean(bad), "", String(bad));
  }
});

test("Norsk Tipping files are named by placement, with the code after it", () => {
  const nt = formats.getProduct("norsktipping");
  assert.equal(nt.fileTags, true);
  const stems = nt.specs.map((spec) => tags.withCode(formats.fileStem(spec), "F1P0G1T0R0"));
  assert.deepEqual(stems, ["desktop_F1P0G1T0R0", "mobile_F1P0G1T0R0", "newsgrid_F1P0G1T0R0"]);
  assert.equal(tags.withCode("desktop", ""), "desktop", "no code, no underscore");
  // Other products keep the size in the name: Houseads' formats would collide without it.
  assert.equal(formats.fileStem(formats.specByKey("houseads", "house-mobile")), "house-320x400");
  assert.ok(!formats.getProduct("readpeak").fileTags);
});

test("a long campaign name is not cut at 60 characters any more", () => {
  const long = "vikinglotto-torsdaguke44-kampanje-host-bergen-vinner-variant-a-test";
  assert.ok(long.length > 60);
  assert.equal(names.sanitizeFilename(long), long);
  assert.equal(names.sanitizeFilename("x".repeat(150)).length, names.MAX_LENGTH);
});
