"use strict";

/* Bulk for all three banner products: the sheet columns each product reads,
   the run request and the data handed to the renderer (which must be what
   the single-banner tab would hand it), the HTML5 and PNG paths per product,
   and the per-product checks on the page. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");

const formats = require("../public/assets/formats.js");
const products = require("../public/bulk/products.js");
const sheet = require("../lib/bulk/sheet");
const bulkHistory = require("../lib/bulk/history");
const { reportCsv } = require("../lib/bulk/deliver");
const { createBulkJobs } = require("../lib/bulk/jobs");
const { registerBulkRoutes } = require("../lib/bulk/routes");

const IMAGE_ID = "a".repeat(40);
const PRESETS = [
  { id: "vikinglotto", label: "Vikinglotto", vinnersjanse: "Vinnersjanse 1.premie 1:61 mill. per rekke" },
  { id: "lotto", label: "Lotto", vinnersjanse: "Vinnersjanse 1.premie 1:5,4 mill. per rekke" },
  { id: "sport", label: "Sport (ingen vinnersjanse)", vinnersjanse: "" },
];
const SETTINGS = {
  export: { format: "png", includeTimestampInFilename: false },
  staticBadges: { annonseText: "Annonse", ageBadgeText: "18+ | Hjelpelinjen.no" },
};

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------
test("each product's example sheet reads back into its own fields", () => {
  for (const id of products.ORDER) {
    const out = sheet.readTable(sheet.parseDelimited(products.templateCsv(id)));
    assert.equal(out.rows.length, products.get(id).template.length - 1, id);
    assert.equal(out.guessed, false, id);
    for (const col of out.columns) assert.ok(col.field, id + ": column «" + col.header + "» is recognised");
  }
  const rp = sheet.readTable(sheet.parseDelimited(products.templateCsv("readpeak"))).rows[0];
  assert.equal(rp.brandLabel, "KAFFEHUSET");
  assert.equal(rp.ctaText, "Les mer her");
  assert.match(rp.subtitle, /Baristaen/);
  const nt = sheet.readTable(sheet.parseDelimited(products.templateCsv("norsktipping"))).rows;
  assert.deepEqual(nt.map((r) => r.gameType), ["Lotto", "Vikinglotto", "Eurojackpot", "Sport"]);
});

test("the product columns have English and Turkish names too", () => {
  const out = sheet.readTable([
    ["Headline", "Description", "Image URL", "Brand", "Button text", "Oyun", "Odds"],
    ["Hei", "Mer tekst", "https://x.no/a.jpg", "ACME", "Kjøp nå", "Lotto", "1:10"],
  ]);
  const r = out.rows[0];
  assert.deepEqual(
    [r.headline, r.subtitle, r.imageUrl, r.brandLabel, r.ctaText, r.gameType, r.vinnersjanse],
    ["Hei", "Mer tekst", "https://x.no/a.jpg", "ACME", "Kjøp nå", "Lotto", "1:10"]
  );
  assert.equal(sheet.fieldForHeader("Açıklama"), "subtitle");
  assert.equal(sheet.fieldForHeader("Marka"), "brandLabel");
  assert.equal(sheet.fieldForHeader("Spilltype"), "gameType");
});

test("a game is found by id, label or the label's first word", () => {
  assert.equal(products.matchGame("Viking lotto", PRESETS).id, "vikinglotto");
  assert.equal(products.matchGame("sport", PRESETS).id, "sport");
  assert.equal(products.matchGame("LOTTO", PRESETS).id, "lotto");
  assert.equal(products.matchGame("Keno", PRESETS), null);
  assert.equal(products.matchGame("", PRESETS), null);
});

test("the odds line: the row's own text, else its game's, else the run's game's", () => {
  assert.equal(products.vinnersjanseFor({ vinnersjanse: "Egen tekst" }, PRESETS, "lotto"), "Egen tekst");
  assert.match(products.vinnersjanseFor({ gameType: "Vikinglotto" }, PRESETS, "lotto"), /1:61/);
  assert.match(products.vinnersjanseFor({ gameType: "" }, PRESETS, "lotto"), /1:5,4/);
  assert.equal(products.vinnersjanseFor({ gameType: "Sport" }, PRESETS, "lotto"), "");
});

test("each product has a template download", async () => {
  const app = express();
  registerBulkRoutes(app, { safeFetch: {}, images: {}, jobs: {} });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    const nt = await fetch(base + "/api/bulk/template.csv?product=norsktipping");
    assert.match(nt.headers.get("content-disposition"), /norsktipping-bulk-mal\.csv/);
    const bytes = Buffer.from(await nt.arrayBuffer());
    assert.equal(bytes.slice(0, 3).toString("hex"), "efbbbf", "a BOM, so Excel reads æøå");
    assert.match(bytes.toString("utf8"), /^\uFEFFOverskrift,Ingress,Bildelenke,Spilltype/);
    const fallback = await fetch(base + "/api/bulk/template.csv?product=nonsense");
    assert.match(await fallback.text(), /Skrift/, "unknown product → Houseads");
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------
function fakeService(opts) {
  const o = opts || {};
  const calls = { render: [], html: [] };
  const service = createBulkJobs({
    formats,
    historyDir: fs.mkdtempSync(path.join(os.tmpdir(), "bulk-prod-")),
    enqueue: (task) => task(),
    loadSettings: async () => SETTINGS,
    budgetFor: () => 0,
    normalizeClickUrl: (u) => (u ? { ok: true, url: u } : { ok: false, error: "Mangler klikk-lenke" }),
    fileStamp: () => "",
    logoPath: "/logo.png",
    logoAsset: "abc-shopping.png",
    findAgeIcon: async () => o.ageIcon || null,
    imageTools: { photoAsset: () => ({ ok: true, name: "image.jpg" }) },
    images: { isId: (id) => /^[a-f0-9]{40}$/.test(id), masterPath: async () => __filename },
    generateAll: async (specs, data, renderOpts) => {
      calls.render.push({ specs: specs.map((s) => s.key), data, assetNames: renderOpts.assetNames });
      const out = {};
      for (const spec of specs) {
        out[spec.key] = {
          image: { buffer: Buffer.from("png"), ext: "png", bytes: 3, note: "" },
          width: spec.width,
          height: spec.height,
          markup: "<div></div>",
          fit: { requested: 1, scale: 1, fits: true },
        };
      }
      return out;
    },
    buildHtmlPackages: async (params) => {
      calls.html.push(params);
      const out = {};
      for (const spec of params.specs) out[spec.key] = "html/" + spec.key + ".zip";
      return out;
    },
    upsertHistoryEntry: async () => {},
  });
  return { service, calls };
}

async function finish(service, id) {
  for (let i = 0; i < 200; i++) {
    const job = service.get(id);
    if (job.status !== "queued" && job.status !== "running") return job;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("run did not finish");
}

const allKeys = (id) => formats.getProduct(id).specs.map((s) => s.key);

test("a ReadPeak request keeps its copy and fills only what the form would", () => {
  const { service } = fakeService();
  const req = service.parseRequest(
    {
      rows: [
        { headline: "A", imageId: IMAGE_ID, subtitle: "  Mer   tekst ", brandLabel: "ACME", ctaText: "Kjøp", vinnersjanse: "1:1", weight: "regular" },
        { headline: "B", imageId: IMAGE_ID },
      ],
      options: { product: "readpeak", formats: allKeys("readpeak"), lesMerStyle: "button", accentColor: "red", showVinnerOnNewsgrid: true },
    },
    SETTINGS
  );
  assert.equal(req.product, "readpeak");
  assert.deepEqual(req.specs.map((s) => s.key), ["readpeak", "newsgrid"]);
  assert.equal(req.name, "readpeak-bulk");
  const [a, b] = req.rows;
  assert.equal(a.subtitle, "Mer tekst");
  assert.equal(a.brandLabel, "ACME");
  assert.equal(a.ctaText, "Kjøp");
  assert.equal(a.vinnersjanse, "", "no odds line outside Norsk Tipping");
  assert.equal(b.brandLabel, "", "ReadPeak has no default advertiser");
  assert.equal(b.ctaText, "Les mer her");
  assert.deepEqual(req.style, { lesMerStyle: "button", accentColor: "#2f2f2f", showVinnerOnNewsgrid: false });
});

test("a Norsk Tipping request: fixed «Les mer», NORSK TIPPING by default, odds kept", () => {
  const { service } = fakeService();
  const req = service.parseRequest(
    {
      rows: [{ headline: "A", imageId: IMAGE_ID, ctaText: "Kjøp", vinnersjanse: "Vinnersjanse 1:61", subtitle: "x".repeat(300) }],
      options: { product: "norsktipping", formats: ["readpeak", "mobile"], showVinnerOnNewsgrid: true },
    },
    SETTINGS
  );
  const [a] = req.rows;
  assert.equal(a.ctaText, "Les mer");
  assert.equal(a.brandLabel, "NORSK TIPPING");
  assert.equal(a.vinnersjanse, "Vinnersjanse 1:61");
  assert.equal(a.subtitle.length, products.LIMITS.subtitle);
  assert.equal(req.style.showVinnerOnNewsgrid, true);
});

test("a request without a product is Houseads, and Houseads drops the other products' copy", () => {
  const { service } = fakeService();
  const req = service.parseRequest(
    { rows: [{ headline: "A", imageId: IMAGE_ID, subtitle: "Ingress", brandLabel: "X" }], options: { formats: allKeys("houseads") } },
    SETTINGS
  );
  assert.equal(req.product, "houseads");
  assert.equal(req.rows[0].subtitle, "");
  assert.equal(req.rows[0].brandLabel, "");
});

test("the renderer gets the single tab's fields, with the 18+ mark only for Norsk Tipping", async () => {
  for (const id of ["houseads", "readpeak", "norsktipping"]) {
    const { service, calls } = fakeService({ ageIcon: { abs: "/x/age-icon.svg", ext: "svg" } });
    const created = await service.create({
      rows: [{ headline: "Hei", imageId: IMAGE_ID, subtitle: "Ingress", brandLabel: "ACME", vinnersjanse: "1:61" }],
      options: { product: id, formats: allKeys(id), outputType: "image" },
    });
    const job = await finish(service, created.id);
    assert.equal(job.status, "done", id);
    assert.equal(job.product, id);
    const { data, specs, assetNames } = calls.render[0];
    assert.deepEqual(specs, allKeys(id), id + ": every format of the product");
    assert.equal(assetNames, null, "no HTML5 markup capture for PNG");
    assert.equal(data.product, id);
    assert.equal(data.hideAgeBadge, id !== "norsktipping", id);
    assert.equal(data.ageIconUrl ? true : false, id === "norsktipping", id + ": custom mark only where the badge is");
    assert.equal(data.vinnersjanse, id === "norsktipping" ? "1:61" : "");
    assert.equal(data.subtitle, id === "houseads" ? "" : "Ingress");
    assert.equal(data.ctaText, id === "readpeak" ? "Les mer her" : "Les mer");
    assert.equal(data.ageBadgeText, "18+ | Hjelpelinjen.no");
    for (const key of ["lesMerStyle", "accentColor", "lesMerSize", "subtitleScale", "showVinnerOnNewsgrid", "annonseText"]) {
      assert.ok(key in data, id + ": " + key);
    }
  }
});

test("the HTML5 path builds each product's packages with its own furniture", async () => {
  for (const id of ["readpeak", "norsktipping"]) {
    const { service, calls } = fakeService({ ageIcon: { abs: "/x/age-icon.svg", ext: "svg" } });
    const created = await service.create({
      rows: [{ headline: "Hei", imageId: IMAGE_ID, clickUrl: "https://abc.no/" }],
      options: { product: id, formats: allKeys(id), outputType: "html" },
    });
    const job = await finish(service, created.id);
    assert.equal(job.status, "done", id);
    const html = calls.html[0];
    assert.equal(html.product, id);
    assert.deepEqual(html.specs.map((s) => s.key), allKeys(id));
    assert.equal(html.clickUrl, "https://abc.no/");
    const nt = id === "norsktipping";
    assert.equal(html.ageIcon ? true : false, nt, id + ": the custom 18+ mark travels only with Norsk Tipping");
    assert.equal(calls.render[0].assetNames.icon, nt ? "age-icon.svg" : "");
  }
});

test("the report adds the Ingress for ReadPeak and Norsk Tipping; Historikk names the product", () => {
  const rows = [{ sheetRow: 2, fileBase: "a", headline: "Hei", subtitle: "Ingress", report: [{ key: "readpeak", label: "readpeak-308x380", file: "a.png", bytes: 2048, scale: 1 }] }];
  const rp = reportCsv({ product: "readpeak", rows }, { readpeak: "readpeak-308x380" }, false);
  assert.match(rp, /^\uFEFFRad i arket;Filnavn;Overskrift;Ingress;Format/);
  assert.match(rp, /2;a;Hei;Ingress;readpeak-308x380;100 %/);
  const house = reportCsv({ product: "houseads", rows }, {}, false);
  assert.ok(!/Ingress/.test(house));
  assert.equal(bulkHistory.headlineFor(4, 2, null, "readpeak"), "ReadPeak · 4 bannere · 2 formater");
  assert.equal(bulkHistory.headlineFor(4, 2, null, "houseads"), "4 bannere · 2 formater");
});

// ---------------------------------------------------------------------------
// The page: what it draws and what it checks
// ---------------------------------------------------------------------------
function loadPage() {
  global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  // Fitting needs a real layout engine; here it is simply never started
  // (fonts that never finish loading), so only the checks run.
  global.document = { fonts: { load: () => new Promise(() => {}) } };
  global.window = {
    BannerFormats: formats,
    BannerAutofit: require("../public/assets/autofit.js"),
    BULK_NAMES: require("../public/bulk/names.js"),
    BULK_PRODUCTS: products,
    WPE: { util: { h: () => ({}) } },
  };
  for (const f of ["../public/bulk/state.js", "../public/bulk/fit.js", "../public/assets/banner.js"]) {
    delete require.cache[require.resolve(f)];
    require(f);
  }
  window.BULK.settings = { gamePresets: PRESETS, staticBadges: SETTINGS.staticBadges };
  return window.BULK;
}

function render(type, data) {
  const root = { className: "", style: { setProperty() {} }, innerHTML: "" };
  window.renderBanner(root, type, data);
  return root;
}

test("the page draws each product's banner like its single tab", () => {
  const BULK = loadPage();
  const { store, state } = BULK;

  store.setProduct("readpeak");
  state.common.brandLabel.readpeak = "KAFFEHUSET";
  store.setRows([{ sheetRow: 2, headline: "Kaffe", subtitle: "Bedre hjemme", imageUrl: "x" }], {});
  let data = store.bannerData(state.rows[0]);
  let html = render("readpeak", data).innerHTML;
  assert.match(html, /bn__brandlabel">KAFFEHUSET</);
  assert.match(html, /bn__subtitle">Bedre hjemme</);
  assert.match(html, />Les mer her</);
  assert.ok(!/bn__age/.test(html), "no 18+ mark on another advertiser's banner");

  store.setProduct("norsktipping");
  state.common.gameType = "vikinglotto";
  data = store.bannerData(state.rows[0]);
  html = render("mobile", data).innerHTML;
  assert.match(html, /bn__age/);
  assert.match(html, /bn__vinner">Vinnersjanse 1\.premie 1:61/);
  assert.match(render("readpeak", data).innerHTML, /bn__brandlabel">NORSK TIPPING<.*>Les mer</);
  assert.ok(!/bn__vinner/.test(render("newsgrid", data).innerHTML), "off on the Nyhetsgrid by default");
});

test("switching product keeps the rows, drops hand-set sizes and takes the new formats", () => {
  const BULK = loadPage();
  const { store, state } = BULK;
  store.setRows([{ sheetRow: 2, headline: "A", imageUrl: "x" }], {});
  state.rows[0].manual = { "house-mobile": 0.9 };
  store.setProduct("readpeak");
  assert.equal(state.rows.length, 1);
  assert.deepEqual(state.rows[0].manual, {});
  assert.deepEqual(state.formats, ["readpeak", "newsgrid"]);
  assert.equal(store.rule(formats.getProduct("readpeak").specs[0]).min, 0.75, "measured from 100 % down to a floor");
});

test("the page's checks per product", () => {
  const BULK = loadPage();
  const { store, state } = BULK;
  const issues = (row) => {
    BULK.fit.evaluate(row);
    return row.issues.map((i) => i.level + ": " + i.text);
  };

  store.setProduct("readpeak");
  state.common.brandLabel.readpeak = "";
  store.setRows([{ sheetRow: 2, headline: "Hei", imageUrl: "x" }], {});
  const row = state.rows[0];
  row.image = { status: "ok", id: IMAGE_ID };
  assert.ok(issues(row).some((t) => /^warn: Mangler merkevare/.test(t)));
  row.brandLabel = "ACME";
  row.ctaText = "x".repeat(41);
  row.subtitle = "y".repeat(121);
  const many = issues(row);
  assert.ok(many.some((t) => /^error: Knappeteksten er lengre enn 40/.test(t)));
  assert.ok(many.some((t) => /^error: Ingressen er lengre enn 120/.test(t)));
  row.ctaText = "Kjøp";
  row.subtitle = "";
  row.fit = { readpeak: { fits: true, scale: 1, ruleScale: 1, copy: { ctaWraps: true, brandWraps: true } } };
  const measured = issues(row);
  assert.ok(measured.includes("error: 308×380: knappeteksten går over to linjer – gjør den kortere"));
  assert.ok(measured.includes("warn: 308×380: merkevaren går over to linjer"));
  assert.equal(row.level, "error");

  store.setProduct("norsktipping");
  const nt = state.rows[0];
  nt.image = { status: "ok", id: IMAGE_ID };
  nt.gameType = "Keno";
  assert.ok(issues(nt).some((t) => /^warn: Ukjent spilltype «Keno»/.test(t)));
  nt.fit = { mobile: { fits: true, scale: 1, ruleScale: 1, copy: { vinnerCut: true } } };
  nt.gameType = "Lotto";
  assert.deepEqual(issues(nt), ["info: 320×400: vinnersjansen vises forkortet («…»)"]);
  assert.equal(nt.level, "ok", "a shortened odds line alone does not make a row «Sjekk»");
});
