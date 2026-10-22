"use strict";

/* Native Premium v2: the new blocks, page-level extras, ready-made designs,
   premium templates with the demo photo kit, polls, and the safety rules
   around custom CSS and click trackers. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");

const S = require("../public/native/schema.js");
const D = require("../public/native/doc.js");
const R = require("../public/native/render.js");
const T = require("../public/native/templates.js");
const P = require("../public/native/presets.js");
const { createPollStore } = require("../lib/native/polls");
const { createNative } = require("../lib/native");
const imageTools = require("../lib/image");
const safeFetch = require("../lib/safe-fetch");

const ICONS = require("../public/wallpaper/icons.json").icons;
const DEMO = require("../lib/native/demo/credits.json").map((x) => x.name);

const SETTINGS = { studioName: "ABC BrandStudio", footerText: "Journalistene har ingen rolle.", disclosureLabel: "Annonsørinnhold fra {annonsør}" };

function ctxFor(project, mode, extra) {
  return Object.assign(
    {
      mode,
      project,
      page: project.pages[0],
      settings: SETTINGS,
      assets: project.assets,
      url: (id, w) => "/a/" + id + (w ? "?w=" + w : ""),
      pageHref: () => "#",
      cssHref: "/np.css",
      runtimeSrc: "/np.js",
    },
    extra || {}
  );
}

function projectWith(sections, more) {
  return D.normalizeProject(Object.assign({ name: "Test", advertiser: { name: "Ford", url: "https://www.ford.no/" }, pages: [{ sections }] }, more || {}));
}

// ---- schema --------------------------------------------------------------------------
test("every block in ORDER exists, renders and has a known icon", () => {
  assert.equal(S.ORDER.length, Object.keys(S.BLOCKS).length);
  S.ORDER.forEach((t) => {
    assert.ok(S.BLOCKS[t], t);
    assert.ok(ICONS[S.BLOCKS[t].icon], "icon for " + t);
    assert.ok(S.GROUPS.indexOf(S.BLOCKS[t].group) !== -1, "group for " + t);
  });
});

test("every block renders in every mode, with defaults and without media", () => {
  const p = projectWith(S.ORDER.map((type) => ({ type })));
  ["editor", "preview", "export", "publish"].forEach((mode) => {
    const html = R.renderDocument(ctxFor(p, mode));
    assert.equal((html.match(/data-np-type="/g) || []).length, S.ORDER.length, mode);
    assert.ok(!/undefined|NaN|\[object Object\]/.test(html.replace(/<script[\s\S]*?<\/script>/g, "")), mode + " leaks a JS value");
  });
});

test("style `when` conditions only name real fields and options", () => {
  S.STYLE_FIELDS.concat(S.EXTRA_FIELDS).forEach((f) => {
    Object.keys(f.when || {}).forEach((k) => {
      const dep = S.styleField(k) || S.EXTRA_FIELDS.find((x) => x.key === k);
      assert.ok(dep, f.key + " depends on " + k);
      const want = [].concat(f.when[k]);
      if (dep.type === "select") want.forEach((v) => assert.ok(dep.options.some((o) => o[0] === v), f.key + ": " + v));
    });
  });
});

// ---- presets and templates ------------------------------------------------------------
function checkSection(where, sec) {
  assert.ok(S.BLOCKS[sec.type], where + " type " + sec.type);
  Object.entries(sec.props || {}).forEach(([k, v]) => {
    const f = S.field(sec.type, k);
    assert.ok(f, where + " unknown prop " + k);
    if ((f.type === "text" || f.type === "textarea") && f.max) assert.ok(String(v).length <= f.max, where + " " + k + " over " + f.max);
    if (f.type === "select") assert.ok(f.options.some((o) => o[0] === v), where + " " + k + "=" + v);
    if (f.type === "list") {
      v.forEach((item) => Object.entries(item).forEach(([kk, vv]) => {
        const sub = f.item.find((x) => x.key === kk);
        assert.ok(sub, where + " " + k + "." + kk);
        if (sub.max && (sub.type === "text" || sub.type === "textarea")) assert.ok(String(vv).length <= sub.max, where + " " + k + "." + kk + " too long");
      }));
    }
  });
  Object.entries(sec.style || {}).forEach(([k, v]) => {
    const f = S.styleField(k);
    assert.ok(f, where + " unknown style " + k);
    if (f.type === "select") assert.ok(f.options.some((o) => o[0] === v), where + " style " + k + "=" + v);
  });
  JSON.stringify(sec).replace(/demo:([a-z0-9-]+)/g, (m, n) => {
    assert.ok(DEMO.indexOf(n) !== -1, where + " unknown demo photo " + n);
    return m;
  });
}

test("ready-made designs are valid and insert without demo photos", () => {
  assert.ok(P.PRESETS.length >= 40);
  const ids = new Set();
  P.PRESETS.forEach((pr) => {
    assert.ok(!ids.has(pr.id), "duplicate " + pr.id);
    ids.add(pr.id);
    assert.ok(P.GROUPS.indexOf(pr.group) !== -1, pr.id);
    checkSection("preset " + pr.id, pr.section);
    const inserted = P.sectionOf(pr, null);
    assert.ok(!/demo:/.test(JSON.stringify(inserted)), pr.id + " keeps a demo ref");
    assert.ok(D.createSection(inserted.type, inserted), pr.id);
  });
});

test("templates are valid, use the demo kit and carry a theme of their own", () => {
  const premium = T.TEMPLATES.filter((t) => t.premium);
  assert.ok(premium.length >= 7);
  T.TEMPLATES.forEach((t) => {
    t.sections.forEach((sec, i) => checkSection(t.id + "[" + i + "]", sec));
    Object.keys(t.extras || {}).forEach((k) => assert.ok(S.EXTRA_FIELDS.find((f) => f.key === k), t.id + " extra " + k));
    assert.ok(T.demoNames(t).length > 0, t.id + " has photos");
  });
  premium.forEach((t) => {
    const theme = D.normalizeTheme(T.themeOf(t), null);
    assert.equal(theme.fonts.heading.family, t.theme.fonts.heading.family);
    assert.equal(theme.colors.page, t.theme.colors.page);
  });
});

test("template expansion swaps demo names for ids and drops unknown ones", () => {
  const t = T.find("bil-premium");
  const id = "a".repeat(64) + ".jpg";
  const ex = T.expand(t, { "ev-aerial-snow-road": id });
  assert.equal(ex.sections[0].props.image, id);
  assert.equal(ex.sections[4].props.image, "");
  assert.ok(/demo:/.test(JSON.stringify(t.sections)), "the original is untouched");
});

// ---- doc ---------------------------------------------------------------------------
test("custom CSS can style but never load, run or hide the locked parts", () => {
  const css = D.sanitizeCss('a{color:red}</style><script>alert(1)</script> @import url(//x.io/a.css); b{background:url(https://x.io/p.gif)} c{width:expression(alert(1))} .np-disclosure{display:none !important} d{x:u\\72l(y)}');
  assert.ok(!/</.test(css));
  assert.ok(!/@import/i.test(css));
  assert.ok(!/url\s*\(/i.test(css));
  assert.ok(!/expression\s*\(/i.test(css));
  assert.ok(!/!\s*important/i.test(css));
  assert.ok(!/\\/.test(css));
  const p = projectWith([{ type: "richText" }], { extras: { customCss: "h1{color:red}</style><b>" } });
  const html = R.renderDocument(ctxFor(p, "export"));
  assert.match(html, /<style id="np-custom">#np-main\{h1\{color:red\}\/style>b>\}<\/style>/);
});

test("custom CSS is nested in <main>: it cannot climb out to the disclosure or footer", () => {
  const tricks = [
    ".np .np-disclosure{display:none!/**/important}",
    "} .np-disclosure__in{display:none}",
    "body:has(&) .np-footer{display:none}",
    "@layer x{.np-disclosure{display:none}}",
    "@scope (body){.np-disclosure{display:none}}",
    "b{background:image-set(\"https://x.io/p.png\" 1x)}",
    "@font-face{font-family:x;src:url(https://x.io/f.woff2)}",
  ];
  tricks.forEach((t) => {
    const out = D.scopeCss(t);
    if (!out) return; // the whole rule was removed
    assert.ok(out.startsWith("#np-main{") && out.endsWith("}"), t);
    assert.ok(!/important|&|@layer|@scope|@font-face|https:\/\/x\.io\/f|image-set\(/i.test(out), t + " → " + out);
    // Braces stay balanced, so nothing escapes the #np-main nesting.
    let depth = 0;
    for (const ch of out.slice("#np-main{".length, -1)) {
      depth += ch === "{" ? 1 : ch === "}" ? -1 : 0;
      assert.ok(depth >= 0, t);
    }
    assert.equal(depth, 0, t);
  });
  assert.equal(D.scopeCss("  "), "");
});

test("projects saved before page options keep their look", () => {
  const old = D.normalizeProject({ name: "Gammel", pages: [{ sections: [{ type: "hero" }] }] });
  assert.equal(old.extras.progress, false);
  assert.equal(old.extras.credit, false);
  assert.equal(D.createProject({}).extras.progress, true);
});

test("extras are normalised with defaults and limits", () => {
  const x = D.normalizeExtras({ chapterNav: "nope", stickyAfter: 500, stickyUrl: "javascript:alert(1)", progress: "yes", feedbackQ: "x".repeat(900) }, null);
  assert.equal(x.chapterNav, "none");
  assert.equal(x.stickyAfter, 90);
  assert.equal(x.stickyUrl, "");
  assert.equal(x.progress, false);
  assert.ok(x.feedbackQ.length <= S.HARD_MAX.text);
});

test("highlight and strikethrough survive the rich-text sanitiser, attributes do not", () => {
  assert.equal(D.sanitizeRich('<p>Hei <mark onclick="x()">du</mark> <del>før</del></p>'), "<p>Hei <mark>du</mark> <s>før</s></p>");
});

test("the click tracker accepts only https and wraps every outbound link", () => {
  assert.equal(D.normalizeProject({ tracking: { clickPrefix: "http://ad.example/?" } }).tracking.clickPrefix, "");
  const sections = [{ type: "cta", props: { label: "Kjøp", url: "https://www.ford.no/puma" } }];
  const plain = projectWith(sections, { tracking: { clickPrefix: "https://ad.doubleclick.net/ddm/clk/1;2;?" } });
  const html = R.renderDocument(ctxFor(plain, "export"));
  assert.ok(html.indexOf('href="https://ad.doubleclick.net/ddm/clk/1;2;?' + encodeURIComponent("https://www.ford.no/puma?utm_source=abcnyheter&utm_medium=native&utm_campaign=test")) !== -1);
  const macro = projectWith(sections, { tracking: { clickPrefix: "https://track.adform.net/C/?bn=1;cdata=%%DEST_URL%%" } });
  assert.ok(R.renderDocument(ctxFor(macro, "export")).indexOf("cdata=" + encodeURIComponent("https://www.ford.no/puma?")) !== -1);
  // The editor preview keeps the plain link.
  assert.ok(R.renderDocument(ctxFor(plain, "editor")).indexOf("doubleclick") === -1);
});

// ---- render: page chrome -------------------------------------------------------------
test("chapter menu lists the sections that have a chapter name, in order", () => {
  const p = projectWith(
    [
      { type: "hero" },
      { type: "chapter", style: { chapter: "Veien" } },
      { type: "richText" },
      { type: "chapter", style: { chapter: "Innsiden" } },
    ],
    { extras: { chapterNav: "top" } }
  );
  const html = R.renderDocument(ctxFor(p, "export"));
  const nav = /<nav class="np-chapnav[^"]*"[\s\S]*?<\/nav>/.exec(html)[0];
  const labels = (nav.match(/np-chapnav__t">([^<]+)</g) || []).map((m) => m.replace(/.*>/, "").replace("<", ""));
  assert.deepEqual(labels, ["Veien", "Innsiden"]);
  assert.ok(nav.indexOf('href="#np-' + p.pages[0].sections[1].id + '"') !== -1);
});

test("the floating button falls back to the advertiser link and never ships without one", () => {
  const withSite = projectWith([{ type: "hero" }], { extras: { stickyCta: true, stickyLabel: "Book" } });
  assert.match(R.renderDocument(ctxFor(withSite, "export")), /class="np-sticky[^"]*"[^>]*><a[^>]*href="https:\/\/www\.ford\.no\/\?utm_source/);
  const noSite = D.normalizeProject(Object.assign({}, withSite, { advertiser: { name: "Ford" } }));
  assert.ok(R.renderDocument(ctxFor(noSite, "export")).indexOf("np-sticky") === -1);
  assert.ok(R.renderDocument(ctxFor(noSite, "editor")).indexOf("np-sticky") !== -1);
});

test("feedback buttons and the credit line render only when switched on", () => {
  const on = projectWith([{ type: "hero" }], { extras: { feedback: true, credit: true } });
  const html = R.renderDocument(ctxFor(on, "export"));
  assert.match(html, /data-np-feedback/);
  assert.match(html, /Produsert av <strong>ABC BrandStudio<\/strong>/);
  const off = projectWith([{ type: "hero" }], { extras: { feedback: false, credit: false, progress: false } });
  const h2 = R.renderDocument(ctxFor(off, "export"));
  assert.ok(h2.indexOf("data-np-feedback") === -1 && h2.indexOf("np-credit-line") === -1 && h2.indexOf("np-progress") === -1);
});

test("section style: gradient tone, edges, scroll effects and height classes", () => {
  const p = projectWith([
    { type: "richText", style: { bg: "gradient", bgColor: "#ff2e4d", bgColor2: "#08080c", bgGradient: "radial" } },
    { type: "richText", style: { bg: "gradient", bgColor: "#fff4e0", bgColor2: "#ffe0b0" } },
    { type: "richText", style: { shapeTop: "wave", shapeBottom: "zigzag", scrollFx: "drift", minH: "screen", valign: "bottom", anim: "stagger", animDelay: 0.4, grain: true } },
    { type: "richText", style: { bg: "brand", tone: "dark" } },
  ]);
  const html = R.renderDocument(ctxFor(p, "export"));
  const secs = html.match(/<section[^>]*>/g);
  assert.match(secs[0], /np-on-dark/);
  assert.match(secs[0], /radial-gradient/);
  assert.match(secs[1], /np-on-light-sec/);
  assert.match(secs[2], /np-shape-t-wave/);
  assert.match(secs[2], /np-shape-b-zigzag/);
  assert.match(secs[2], /np-sfx-drift/);
  assert.match(secs[2], /np-minh-screen np-va-bottom/);
  assert.match(secs[2], /--np-delay:0\.4s/);
  assert.match(secs[2], /np-grain/);
  assert.match(secs[3], /np-on-light-sec/);
  assert.equal((html.match(/class="np-edge np-edge--/g) || []).length, 2);
});

test("hero title effects keep the full title for screen readers", () => {
  const p = projectWith([{ type: "hero", props: { title: "Fem øyeblikk", titleFx: "words" } }]);
  const html = R.renderDocument(ctxFor(p, "export"));
  assert.match(html, /<h1 class="np-h1 np-h1--l np-tfx np-tfx--words" aria-label="Fem øyeblikk">/);
  assert.equal((html.match(/class="np-wi"/g) || []).length, 2);
});

test("statement marks the accent words; typewriter keeps the text without JS", () => {
  const p = projectWith([
    { type: "statement", props: { text: "Fem ladestopp, ett spørsmål.", accent: "ladestopp", fx: "scroll" } },
    { type: "statement", props: { text: "Skrives ut.", fx: "typewriter" } },
  ]);
  const html = R.renderDocument(ctxFor(p, "export"));
  assert.match(html, /<span class="np-sw np-acc" style="--i:1">ladestopp,<\/span>/);
  assert.match(html, /data-np-typewriter data-text="Skrives ut\.">Skrives ut\.<\/span>/);
});

test("countdown converts Norwegian time with daylight saving", () => {
  assert.equal(new Date(R.osloTime("2026-12-24 18:00")).toISOString(), "2026-12-24T17:00:00.000Z");
  assert.equal(new Date(R.osloTime("2026-07-01 12:00")).toISOString(), "2026-07-01T10:00:00.000Z");
  assert.equal(R.osloTime("24.12.2026"), 0);
});

test("spec table counts its columns and highlights one", () => {
  const p = projectWith([{ type: "specTable", props: { head1: "A", head2: "B", highlight: "2", rows: [{ label: "Pris", v1: "1", v2: "2", v3: "" }] } }]);
  const html = R.renderDocument(ctxFor(p, "export"));
  assert.match(html, /np-spec--c2/);
  assert.match(html, /<td class="is-hl">2<\/td>/);
});

test("hotspots and tabs stay usable without JavaScript", () => {
  const img = "b".repeat(64) + ".jpg";
  const assets = { [img]: { name: "x", w: 1600, h: 1000, widths: [960] } };
  const p = projectWith(
    [
      { type: "hotspots", props: { image: img, items: [{ x: 10, y: 20, title: "Rattet", text: "Oppvarmet." }] } },
      { type: "tabs", props: { items: [{ label: "En", title: "Første" }, { label: "To", title: "Andre" }] } },
    ],
    { assets }
  );
  const html = R.renderDocument(ctxFor(p, "export"));
  assert.match(html, /class="np-hs__list"><li><strong>Rattet<\/strong> Oppvarmet\.<\/li>/);
  assert.match(html, /role="tabpanel"[^>]*hidden/);
  assert.match(html, /aria-selected="true"/);
});

test("fonts are subset with both letter cases (CSS may uppercase headings)", () => {
  const text = R.pageText(projectWith([{ type: "hero", props: { title: "øyeblikk" } }]));
  ["Ø", "Y", "ø", "y"].forEach((c) => assert.ok(text.indexOf(c) !== -1, c));
});

// ---- polls --------------------------------------------------------------------------------
test("polls count only real options of real poll sections", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "np-poll-"));
  const store = createPollStore(dir);
  const p = projectWith([{ type: "poll" }, { type: "richText" }], { extras: { feedback: true } });
  const poll = p.pages[0].sections[0];
  const opt = poll.props.options[1].id;
  let counts = await store.vote("min-side", p, poll.id, opt);
  counts = await store.vote("min-side", p, poll.id, opt);
  assert.equal(counts[opt], 2);
  assert.equal((await store.vote("min-side", p, "feedback", "ja")).ja, 1);
  await assert.rejects(store.vote("min-side", p, poll.id, "x_fake"), /Ukjent svar/);
  await assert.rejects(store.vote("min-side", p, p.pages[0].sections[1].id, opt), /Ukjent avstemning/);
  await assert.rejects(store.vote("../etc", p, poll.id, opt), /Ukjent side/);
  const noFeedback = D.normalizeProject(Object.assign({}, p, { extras: { feedback: false } }));
  await assert.rejects(store.vote("min-side", noFeedback, "feedback", "ja"), /Ukjent avstemning/);
  assert.deepEqual(Object.keys(await store.counts("min-side")).sort(), [poll.id, "feedback"].sort());
});

// ---- HTTP: templates with demo photos, votes on published pages -------------------------
let base;
let server;

test.before(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "np-v2-"));
  const app = express();
  createNative({
    dataDir: path.join(root, "data"),
    uploadsDir: path.join(root, "uploads"),
    fontCacheDir: path.join(root, "fonts"),
    getSharp: imageTools.getSharp,
    safeFetch,
  }).register(app);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});

test.after(() => server && server.close());

async function call(method, url, body, type) {
  const res = await fetch(base + url, {
    method,
    headers: body ? { "Content-Type": type || "application/json" } : {},
    body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})), res };
}

test("a premium template brings its look, extras and demo photos", async () => {
  const c = await call("POST", "/api/native/projects", { name: "Reise", advertiser: { name: "Fjellro" }, template: "reise" });
  assert.equal(c.status, 201);
  const p = c.data.project;
  const tpl = T.find("reise");
  assert.equal(p.theme.fonts.heading.family, tpl.theme.fonts.heading.family);
  assert.equal(p.extras.chapterNav, tpl.extras.chapterNav);
  assert.equal(Object.keys(p.assets).length, T.demoNames(tpl).length);
  assert.ok(p.assets[p.pages[0].sections[0].props.image], "hero photo is a real asset");
  assert.ok(Object.values(p.assets).every((a) => /^Demo – /.test(a.name) && a.alt));
  const preview = await fetch(base + "/api/native/projects/" + p.id + "/preview").then((r) => r.text());
  assert.ok(preview.indexOf("/np-assets/") !== -1);

  const bare = await call("POST", "/api/native/projects", { name: "Uten bilder", template: "reise", demo: false });
  assert.equal(Object.keys(bare.data.project.assets).length, 0);
  assert.equal(bare.data.project.pages[0].sections[0].props.image, "");
});

test("the demo kit is listed with stored assets", async () => {
  const r = await call("GET", "/api/native/demo");
  assert.equal(r.status, 200);
  assert.equal(Object.keys(r.data.demo).length, DEMO.length);
  assert.match(r.data.demo[DEMO[0]].id, D.ASSET_RE);
});

test("published pages take votes from any origin and return the counts", async () => {
  const c = await call("POST", "/api/native/projects", { name: "Avstemning", advertiser: { name: "Ford" } });
  const p = c.data.project;
  const withPoll = Object.assign({}, p, { pages: [Object.assign({}, p.pages[0], { sections: [D.createSection("hero"), D.createSection("poll")] })] });
  const saved = await call("PUT", "/api/native/projects/" + p.id, { project: withPoll, baseRev: p.rev });
  assert.equal(saved.status, 200);
  const full = (await call("GET", "/api/native/projects/" + p.id)).data.project;
  const poll = full.pages[0].sections[1];
  const pub = await call("POST", "/api/native/projects/" + p.id + "/publish");
  const slug = pub.data.slug;
  const page = await fetch(base + "/n/" + slug + "/").then((r) => r.text());
  assert.match(page, new RegExp('data-np-api="[^"]*/n-api/vote/' + slug + '"'));

  const v = await call("POST", "/n-api/vote/" + slug + "/" + poll.id, JSON.stringify({ option: poll.props.options[0].id }), "text/plain");
  assert.equal(v.status, 200);
  assert.equal(v.res.headers.get("access-control-allow-origin"), "*");
  assert.equal(v.data.counts[poll.props.options[0].id], 1);
  const bad = await call("POST", "/n-api/vote/" + slug + "/" + poll.id, JSON.stringify({ option: "nope" }), "text/plain");
  assert.equal(bad.status, 400);
  const unknown = await call("POST", "/n-api/vote/finnes-ikke/" + poll.id, JSON.stringify({ option: "x" }), "text/plain");
  assert.equal(unknown.status, 404);
});
