"use strict";

/* "Kontroll" (public/native/app/preflight.js) under node: the browser file
   runs in a vm context with the real schema, doc and renderer and a stub of
   the UI it does not use here. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PUBLIC = path.join(__dirname, "..", "public", "native");

function load() {
  const ctx = { console, crypto: globalThis.crypto, Uint8Array, Date, JSON, Math };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.NP = { ui: { h: () => null }, theme: { contrastNotes: () => [] } };
  vm.createContext(ctx);
  ["schema.js", "doc.js", "render.js", "app/preflight.js"].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(PUBLIC, f), "utf8"), ctx, { filename: f });
  });
  return { D: ctx.NativeDoc, preflight: ctx.NP.preflight };
}

const { D, preflight } = load();
const SETTINGS = { disclosureLabel: "Annonsørinnhold fra {annonsør}" };
const IMG = "a".repeat(64) + ".jpg";
const VID = "b".repeat(64) + ".mp4";

function project(sections, extra) {
  return D.normalizeProject(
    Object.assign(
      {
        name: "Kontroll",
        advertiser: { name: "Ford", url: "https://www.ford.no/" },
        meta: { title: "Ny elbil for hele familien", description: "Slik lader du hjemme, på hytta og på veien – med tall fra Ford og Elbilforeningen." },
        assets: {
          [IMG]: { kind: "image", name: "hero", alt: "Bil ved hytta", w: 6000, h: 4000, bytes: 12 * 1048576, widths: [480, 960, 1440, 2400] },
          [VID]: { kind: "video", name: "film", bytes: 20 * 1048576, w: 1920, h: 1080 },
        },
        pages: [{ sections }],
      },
      extra || {}
    )
  );
}

const hero = (props) => ({ type: "hero", props: Object.assign({ title: "Ny elbil for hele familien", ingress: "Ingress.", image: IMG }, props || {}) });
const texts = (items) => items.map((it) => it.text);
// Plain copies: arrays made inside the vm belong to another realm.
const run = (p) => Array.from(preflight.run(p, SETTINGS), (it) => ({ level: it.level, text: it.text, section: it.section }));

test("two sections with the same anchor are an error; #links must lead somewhere", () => {
  const p = project([
    hero(),
    { type: "richText", style: { anchor: "lading" }, props: { html: '<p>Se <a href="#lading">ladingen</a> og <a href="#finnes-ikke">dette</a>.</p>' } },
    { type: "richText", style: { anchor: "Lading" }, props: { html: "<p>To.</p>" } },
  ]);
  const items = run(p);
  const dup = items.filter((it) => /ankeret «#lading» brukes også/.test(it.text));
  assert.equal(dup.length, 1);
  assert.equal(dup[0].level, "error");
  assert.equal(dup[0].section, p.pages[0].sections[2].id, "points at the second one");
  const dead = items.filter((it) => /lenken «#/.test(it.text));
  assert.deepEqual(texts(dead).map((t) => /#finnes-ikke/.test(t)), [true], "only the dead link, not #lading");
});

test("headings that skip a level are flagged", () => {
  const items = run(project([hero(), { type: "richText", props: { html: "<h3>Under</h3><p>Tekst.</p>" } }]));
  assert.ok(items.some((it) => it.level === "warn" && /hopper fra H1 til H3/.test(it.text)));
  const fine = run(project([hero(), { type: "richText", props: { html: "<h2>Del</h2><h3>Under</h3><p>Tekst.</p>" } }]));
  assert.ok(!fine.some((it) => /hopper/.test(it.text)));
});

test("the same vague link text on several links is flagged once", () => {
  const html = '<p><a href="https://www.ford.no/a">Les mer</a> og <a href="https://www.ford.no/b">les mer.</a> og <a href="https://www.ford.no/c">Se ladekartet</a></p>';
  const items = run(project([hero(), { type: "richText", props: { html } }]));
  const vague = items.filter((it) => /står på \d+ lenker/.test(it.text));
  assert.equal(vague.length, 1);
  assert.match(vague[0].text, /«Les mer» står på 2 lenker/);
});

test("the share card: missing description, long title, no picture", () => {
  const p = project([hero({ image: "" })], { meta: { title: "En svært lang tittel som garantert blir kuttet av Facebook og LinkedIn i forhåndsvisningen", description: "" } });
  const items = texts(run(p));
  assert.ok(items.some((t) => /Delingstittelen er \d+ tegn/.test(t)));
  assert.ok(items.some((t) => /Beskrivelsen for deling mangler – da står det bare «Annonsørinnhold fra Ford»/.test(t)));
  assert.ok(items.some((t) => /Ingen delingsbilde/.test(t)));
  const info = preflight.shareInfo(p, SETTINGS);
  assert.equal(info.ownTitle, true);
  assert.equal(info.image, "");
  const ok = texts(run(project([hero()])));
  assert.ok(!ok.some((t) => /Delingstittelen er|Beskrivelsen for deling|Ingen delingsbilde/.test(t)), ok.join("\n"));
});

test("page weight: a heavy first screen warns, the estimate is reported", () => {
  const heavy = run(project([hero({ video: VID }), { type: "richText" }]));
  assert.ok(heavy.some((it) => it.level === "warn" && /Første skjerm \(heroen\) veier ca\. 20,\d MB/.test(it.text)));
  const light = run(project([hero(), { type: "richText" }]));
  assert.ok(!light.some((it) => /Første skjerm/.test(it.text)), "a 12 MB original is served as a ~0,2 MB WebP");
  assert.ok(light.some((it) => it.level === "info" && /Sidevekt \(anslag, desktop\): ca\. 0,2 MB bilder/.test(it.text)));
});
