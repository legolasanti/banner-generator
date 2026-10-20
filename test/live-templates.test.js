"use strict";

/* NT Live templates: the built-in designs render for a match and for the
   fallback poster, the user's own code is scoped and stripped of what may
   not run in an ad, the regulated furniture stays out of reach, and the
   server only accepts designs the runtime knows. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const LD = require("../public/assets/live-data.js");
const LT = require("../public/assets/live-templates.js");
const live = require("../lib/live");
const pkg = require("../lib/live/package");

// live.js is a browser script; run it in a sandbox that has LiveData.
function loadRuntime() {
  const sandbox = { LiveData: LD, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/assets/live.js"), "utf8"), sandbox);
  return sandbox.LiveAd;
}
const LiveAd = loadRuntime();

const CTX = {
  id: "r0",
  nr: 1,
  reserve: false,
  hjemmelag: "Real Madrid",
  bortelag: "Liverpool",
  kamp: "Real Madrid – Liverpool",
  turnering: "Champions League",
  produkt: "Oddsen",
  kicker: "Oddsen · Champions League",
  tekst: "",
  knappetekst: "Spill nå",
  odds: "2,30 · 3,50 · 2,95",
  odds1: "2,30",
  oddsx: "3,50",
  odds2: "2,95",
  harodds: true,
  hjemmekode: "RMA",
  bortekode: "LIV",
  dag: "I dag",
  dato: "tirsdag 20. oktober",
  klokkeslett: "21:00",
  klokke: "I dag kl. 21:00",
  tid: "I dag kl. 21:00",
  kort: "21:00",
  listetittel: "Dagens kamper",
  harbilde: false,
  media: { html: '<div class="bn__anim bn__anim--gradient"></div>' },
  bakgrunn: { html: '<div class="bn__anim bn__anim--gradient"></div>' },
  nedtelling: { html: '<span class="bn__cd-host" data-live="nedtelling"></span>' },
};

test("the template engine", async (t) => {
  await t.test("escapes text, inserts raw HTML only for the media placeholders", () => {
    const out = LiveAd.renderTemplate("<b>{{kamp}}</b>{{media}}", { kamp: "<img onerror=x>", media: { html: "<i>m</i>" } });
    assert.equal(out, "<b>&lt;img onerror=x&gt;</b><i>m</i>");
  });

  await t.test("sections, inverted sections and loops", () => {
    const tpl = "{{#odds}}O{{/odds}}{{^odds}}-{{/odds}}|{{#kamper}}[{{kamp}}:{{produkt}}]{{/kamper}}";
    assert.equal(LiveAd.renderTemplate(tpl, { odds: "", produkt: "P", kamper: [{ kamp: "A" }, { kamp: "B" }] }), "-|[A:P][B:P]");
    assert.equal(LiveAd.renderTemplate(tpl, { odds: "1", kamper: [] }), "O|");
  });

  await t.test("placeholder names are case-insensitive; unbalanced tags do not throw", () => {
    assert.equal(LiveAd.renderTemplate("{{#harOdds}}x{{/harOdds}}", { harodds: true }), "x");
    assert.doesNotThrow(() => LiveAd.renderTemplate("{{#a}}open{{/b}}", { a: true }));
  });

  await t.test("team codes and odds the way Norwegians write them", () => {
    assert.equal(LiveAd.teamCode("Real Madrid"), "RMA");
    assert.equal(LiveAd.teamCode("Arsenal"), "ARS");
    assert.equal(LiveAd.teamCode("Paris Saint-Germain"), "PSG");
    assert.equal(LiveAd.teamCode("1. FC Köln"), "KÖL");
    assert.deepEqual(Array.from(LiveAd.oddsParts("2,10 - 3,40 - 3,20")), ["2,10", "3,40", "3,20"]);
    assert.deepEqual(Array.from(LiveAd.oddsParts("2.10/3.40/3.20")), ["2,10", "3,40", "3,20"]);
  });
});

test("every built-in template renders a match and the fallback poster", () => {
  for (const tpl of LT.TEMPLATES) {
    const listCtx = Object.assign({}, CTX, { kamper: [CTX, Object.assign({}, CTX, { id: "r1", nr: 2 })] });
    const match = LiveAd.renderTemplate(tpl.html, listCtx);
    assert.ok(!/\{\{/.test(match), tpl.id + ": leftover placeholder");
    assert.ok(/Real Madrid|RMA/.test(match), tpl.id + ": the match is missing");
    const reserve = LiveAd.renderTemplate(tpl.html, Object.assign({}, CTX, { reserve: true, kamp: "Dagens kamper på Oddsen", hjemmelag: "", bortelag: "", kamper: [] }));
    assert.ok(/Dagens kamper/.test(reserve), tpl.id + ": the fallback poster has no headline");
    assert.ok(!/data-live="tid"/.test(reserve) || tpl.id === "kampliste", tpl.id + ": the poster should not tick");
    assert.equal(LT.lintCss(tpl.css).dropped, 0, tpl.id + ": a rule touches the regulated furniture");
    assert.ok(LT.lintCss(tpl.css).balanced, tpl.id + ": unbalanced CSS");
    assert.deepEqual(LT.lintHtml(tpl.html).problems, [], tpl.id);
  }
});

test("scoping the template stylesheet", async (t) => {
  await t.test("everything lands inside the slide layer; format classes fuse with the root", () => {
    const css = LT.scopeCss(".x { color: red } .bn--mobile .x, .bn:hover .y { top: 0 }", ".bn--tpl-a");
    assert.match(css, /\.bn--tpl-a \.bn__live-stage \.x \{/);
    assert.match(css, /\.bn--tpl-a\.bn--mobile \.bn__live-stage \.x, \.bn--tpl-a:hover \.bn__live-stage \.y \{/);
  });

  await t.test("rules on the root itself keep only custom properties", () => {
    const css = LT.scopeCss(".bn--desktop { --badges-h: 200px; display: none; opacity: 0 }", ".s");
    assert.match(css, /\.s\.bn--desktop \{ --badges-h: 200px \}/);
    assert.ok(!/display|opacity/.test(css));
  });

  await t.test("broad selectors cannot reach the badge layer (review #1)", () => {
    const css = LT.scopeCss("span { display: none !important } * { visibility: hidden } ~ * { opacity: 0 } .bn__live-stage { z-index: 99 }", ".s");
    css.split("\n").filter(Boolean).forEach((rule) => assert.match(rule, /^\.s \.bn__live-stage /, rule));
    assert.ok(!/z-index/.test(css));
  });

  await t.test("a class that only starts with .bn is a descendant, not the root", () => {
    assert.equal(LT.scopeSelector(".bn__live-cta", ".s"), ".s .bn__live-stage .bn__live-cta");
    assert.equal(LT.scopeSelector("body .x", ".s"), ".s .bn__live-stage .x");
  });

  await t.test("@media is scoped inside, @keyframes is left alone, @import is dropped", () => {
    const css = LT.scopeCss("@import url(x.css); @media (min-width: 1px) { .a { b: c } } @keyframes k { from { opacity: 0 } }", ".s");
    assert.match(css, /@media \(min-width: 1px\) \{\n\.s \.bn__live-stage \.a \{/);
    assert.match(css, /@keyframes k \{ from \{ opacity: 0 \} \}/);
    assert.ok(!/import/.test(css));
  });

  await t.test("rules reaching Annonse / 18+ / Vinnersjanse are dropped", () => {
    const css = LT.scopeCss(".bn__age { display: none } .ok, .bn__annonse { opacity: 0 } .bn__live-badges { top: 900px }", ".s");
    assert.ok(!/bn__age|bn__annonse|bn__live-badges/.test(css));
    assert.match(css, /\.s \.bn__live-stage \.ok \{/);
    assert.equal(LT.lintCss(".bn__age{x:y} .a{b:c}").dropped, 1);
  });

  await t.test("url() only to https or an inline image", () => {
    const css = LT.sanitizeCss(".a { background: url(http://x/y.png) } .b { background: url('https://x/y.png') }");
    assert.match(css, /\.a \{ background: none \}/);
    assert.match(css, /url\('https:\/\/x\/y\.png'\)/);
  });
});

test("the user's own HTML keeps the CM360 contract", () => {
  const dirty = '<div onclick="x()" onmouseover=\'y\'>a</div><script>alert(1)</script><iframe src="//x"></iframe><a href="javascript:alert(1)">l</a><form><input></form><img src=x onerror=alert(1)>';
  const clean = LT.sanitizeHtml(dirty);
  assert.ok(!/<script|<iframe|<form|<input|onclick|onmouseover|onerror|javascript:|<a\b/i.test(clean), clean);
  assert.match(clean, /<div>a<\/div>/);
  assert.match(clean, /<span href="#">l<\/span>/);
  assert.ok(LT.lintHtml("{{#a}}x").problems.length === 1);
  // review #3: handlers after a slash or quote, and tags split around others
  const tricky = LT.sanitizeHtml('<img src="x"/onerror="alert(1)"><svg/onload=alert(1)><scr<script>ipt>alert(1)</scr</script>ipt>');
  assert.ok(!/onerror|onload|<script/i.test(tricky), tricky);
});

test("resolving a design", async (t) => {
  await t.test("built-ins by id, unknown ids fall back to Klassisk", () => {
    assert.equal(LT.resolve({ template: "matchkort" }).id, "matchkort");
    assert.equal(LT.resolve({ template: "nope" }).id, "klassisk");
    assert.equal(LT.resolve({ template: "kampliste" }).mode, "list");
  });

  await t.test("egen: the user's code, sanitised and scoped to its own class", () => {
    const r = LT.resolve({ template: "egen", customHtml: "<p>{{kamp}}</p><script>x</script>", customCss: "p { color: red }", customMode: "list", customZone: "media" });
    assert.equal(r.id, "egen");
    assert.equal(r.html, "<p>{{kamp}}</p>");
    assert.match(r.css, /^\.bn--tpl-egen \.bn__live-stage p \{/);
    assert.equal(r.mode, "list");
    assert.equal(r.zone, "media");
    assert.equal(LT.resolve({ template: "egen" }, { id: "egen-utkast" }).id, "egen-utkast");
  });
});

test("server normalisation of the new design fields", () => {
  const d = live.normalizeDesign({ template: "odds", motion: "livlig", transition: "zoom", customHtml: "<b onclick=x>a</b>", customMode: "x" });
  assert.equal(d.template, "odds");
  assert.equal(d.motion, "livlig");
  assert.equal(d.transition, "zoom");
  assert.equal(d.customHtml, "<b>a</b>");
  assert.equal(d.customMode, "slides");
  const bad = live.normalizeDesign({ template: "<x>", motion: "fast" });
  assert.equal(bad.template, "klassisk");
  assert.equal(bad.motion, "standard");
});

test("the package carries the resolved template and stays lean", () => {
  const read = (name) => fs.readFileSync(path.join(__dirname, "../public/assets", name), "utf8");
  const design = live.normalizeDesign({ template: "nedtelling" });
  const html = pkg.buildIndexHtml({
    spec: { key: "mobile", type: "mobile", width: 320, height: 400 },
    bannerCss: read("banner.css"),
    liveCss: read("live.css"),
    scripts: [read("banner.js"), read("live-data.js"), read("live.js")],
    config: { rows: [], design, template: LT.resolve(design), badges: {}, assets: {}, source: { liveUrls: [] } },
    clickUrl: "https://www.norsk-tipping.no/",
    title: "T",
  });
  assert.match(html, /"id":"nedtelling"/);
  assert.match(html, /\.bn--tpl-nedtelling \.bn__live-stage \.lt-cd/);
  assert.ok(!/live-templates/.test(html), "the template registry itself never ships");
});

test("the example sheet has every column and reads back with odds", () => {
  const rows = LD.templateRows(new Date("2026-10-20T10:00:00Z"));
  assert.equal(rows[0].length, 13);
  const out = LD.readTable(LD.parseCsv(LD.templateCsv(new Date("2026-10-20T10:00:00Z"))));
  assert.equal(out.rows[0].odds, "2,05 - 3,60 - 3,40");
  assert.equal(out.rows[0].date, "2026-10-20");
});

test("list rows are numbered from 1 (review #6)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../public/assets/live.js"), "utf8");
  assert.match(src, /slide\.rows\.map\(function \(r, i\) \{ return contextFor\(r, i\); \}\)/);
});

test("an edited row re-renders on refresh: the selection key carries row content (review #5)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../public/assets/live.js"), "utf8");
  assert.match(src, /\[r\.id, r\.date, r\.time, r\.title/);
  assert.match(src, /if \(\/\^\\s\*<\/\.test\(text\)\) return attempt\(i \+ 1\)/);
});

test("the badge zone can never collapse below the badges (review #2)", () => {
  const css = fs.readFileSync(path.join(__dirname, "../public/assets/live.css"), "utf8");
  assert.match(css, /height: max\(var\(--badges-h, 100%\), 36px\) !important/);
});
