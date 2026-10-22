"use strict";

/* The motion system (Stil → Bevegelse, Side → Bevegelse): the schema keys,
   what the renderer writes for them, and what np.js does with them in a
   real browser (skipped when no Chrome can be started). Old projects must
   look exactly as before: none of the new classes appear unless asked for. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const S = require("../public/native/schema.js");
const D = require("../public/native/doc.js");
const R = require("../public/native/render.js");

const CSS = fs.readFileSync(path.join(__dirname, "../public/native/runtime/np.css"), "utf8");
const JS = fs.readFileSync(path.join(__dirname, "../public/native/runtime/np.js"), "utf8");

function project(sections, extras) {
  return D.normalizeProject({ name: "Motion", advertiser: { name: "Ford" }, extras: extras || {}, pages: [{ sections }] });
}

/** The page's markup only: no inline stylesheet or runtime. */
function markup(page) {
  return page.slice(page.indexOf("<body")).replace(/<script>[\s\S]*?<\/script>/g, "");
}

function html(sections, extras, opts) {
  const p = project(sections, extras);
  return R.renderDocument({
    mode: "export",
    project: p,
    page: p.pages[0],
    settings: { footerText: "Tekst." },
    assets: {},
    url: () => "",
    pageHref: () => "#",
    cssText: CSS,
    runtimeSrc: "data:text/javascript,",
    extraBody: opts && opts.noRuntime ? "" : "<script>" + JS + "</script>",
  });
}

// ---- schema -------------------------------------------------------------------
test("the new motion keys exist with defaults that change nothing", () => {
  const s = D.normalizeSection({ type: "richText", props: {} });
  assert.equal(s.style.anim, "fade-up");
  assert.equal(s.style.animEase, "smooth");
  assert.equal(s.style.animStep, 90);
  assert.equal(s.style.animRepeat, false);
  assert.equal(s.style.headFx, "none");
  assert.equal(s.style.transition, "none");
  assert.equal(s.style.scrollFx, "none");
  const x = D.normalizeExtras({});
  assert.equal(x.motion, "normal");
  assert.equal(x.hoverFx, "subtle");
  for (const key of ["animEase", "animStep", "animRepeat", "headFx", "transition"]) {
    assert.equal(S.styleField(key).group, "Bevegelse", key);
  }
});

test("old motion values still validate; unknown ones fall back", () => {
  for (const a of ["none", "fade", "fade-up", "slide-left", "slide-right", "zoom", "blur", "reveal", "stagger", "rise"]) {
    assert.equal(D.normalizeSection({ type: "richText", style: { anim: a } }).style.anim, a);
  }
  for (const f of ["fade-out", "scale-in", "drift", "sticky-fade"]) {
    assert.equal(D.normalizeSection({ type: "richText", style: { scrollFx: f } }).style.scrollFx, f);
  }
  const bad = D.normalizeSection({ type: "richText", style: { anim: "explode", transition: "warp", animEase: "x", headFx: "<script>", animStep: 99999 } }).style;
  assert.equal(bad.anim, "fade-up");
  assert.equal(bad.transition, "none");
  assert.equal(bad.animEase, "smooth");
  assert.equal(bad.headFx, "none");
  assert.equal(bad.animStep, 400);
  assert.equal(D.normalizeExtras({ motion: "wild", hoverFx: "spin" }).motion, "normal");
});

test("tempo, curve, delay and repeat only show for an entrance that moves", () => {
  const vis = (f, v) => !f.when || Object.keys(f.when).every((k) => (Array.isArray(f.when[k]) ? f.when[k].indexOf(v[k]) !== -1 : v[k] === f.when[k]));
  for (const key of ["animSpeed", "animEase", "animDelay", "animRepeat"]) {
    assert.equal(vis(S.styleField(key), { anim: "none" }), false, key);
    assert.equal(vis(S.styleField(key), { anim: "iris" }), true, key);
  }
  assert.equal(vis(S.styleField("animStep"), { anim: "fade" }), false);
  assert.equal(vis(S.styleField("animStep"), { anim: "stagger" }), true);
});

// ---- render ---------------------------------------------------------------------
test("a page that uses none of it renders none of it", () => {
  const out = markup(html([{ type: "hero", props: { title: "Hei" } }, { type: "richText" }], {}));
  assert.doesNotMatch(out, /np-tr[ -"]|np-hfx|np-ease-|np-repeat|data-np-motion|np-mv-|np-hover-/);
});

test("section motion becomes classes, a step variable and the progress marker", () => {
  const out = markup(html([
    { type: "richText", style: { anim: "stagger", animEase: "expo", animStep: 140, animRepeat: true, headFx: "words", transition: "stack" } },
    { type: "richText", style: { scrollFx: "slide-x" } },
  ]));
  assert.match(out, /class="[^"]*np-anim-stagger[^"]*np-ease-expo[^"]*np-repeat[^"]*np-tr np-tr-stack[^"]*np-hfx np-hfx-words/);
  assert.match(out, /--np-step:140ms/);
  assert.equal((out.match(/data-np-motion/g) || []).length, 2);
});

test("page motion becomes body classes", () => {
  assert.match(html([{ type: "richText" }], { motion: "bold", hoverFx: "rich" }), /<body class="np np-mv-bold np-hover-rich"/);
  assert.match(html([{ type: "richText" }], { motion: "calm", hoverFx: "none" }), /<body class="np np-mv-calm np-hover-none"/);
});

test("the page shows its content even if np.js never arrives", () => {
  const out = html([{ type: "richText" }]);
  assert.match(out, /classList\.add\('np-js'\);setTimeout\(function\(\)\{if\(!window\.NPRuntime\)document\.documentElement\.classList\.remove\('np-js'\)\},3500\)/);
});

// ---- stylesheet -----------------------------------------------------------------
test("every new hidden start state waits for the runtime (html.np-js)", () => {
  const block = CSS.slice(CSS.indexOf("Motion system 2"));
  const hidden = block.split("\n").filter((l) => /:not\(\.np-in\)/.test(l));
  assert.ok(hidden.length >= 8);
  for (const l of hidden) assert.match(l, /html\.np-js/, l);
});

test("reduced motion switches the new effects off", () => {
  const reduce = CSS.slice(CSS.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  for (const sel of [".np-hwi", ".np-hc", ".np-hl", ".np-tr", ".np-tr-under", ".np-sfx-slide-x", ".np-sfx-layers .np-st", ".np-tr-gone"]) {
    assert.ok(reduce.includes(sel), sel);
  }
  // Transitions and scroll effects that move only exist under no-preference.
  const block = CSS.slice(CSS.indexOf("---- section transitions"), CSS.indexOf("---- hover"));
  const outside = block.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, "");
  assert.doesNotMatch(outside, /np-tr-(stack|cover|curtain|zoom|iris|under)/);
});

// ---- browser --------------------------------------------------------------------
let puppeteer;
try {
  puppeteer = require("puppeteer");
} catch (_) {
  puppeteer = null;
}

async function launch() {
  if (!puppeteer) return null;
  const candidates = [];
  if (process.env.PUPPETEER_EXECUTABLE_PATH) candidates.push({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH });
  const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (process.platform === "darwin" && fs.existsSync(mac)) candidates.push({ executablePath: mac });
  candidates.push({});
  for (const c of candidates) {
    try {
      return await puppeteer.launch(Object.assign({ headless: "new", args: ["--no-sandbox"] }, c));
    } catch (_) {
      /* try the next one */
    }
  }
  return null;
}

let browser = null;
test.before(async () => {
  browser = await launch();
});
test.after(async () => {
  if (browser) await browser.close();
});

async function open(page_html, opts) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  if (opts && opts.reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setContent(page_html, { waitUntil: "load" });
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; });
  await new Promise((r) => setTimeout(r, 150));
  page.errors = errors;
  return page;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const filler = (n) => Array.from({ length: n }, () => ({ type: "richText", style: { anim: "none" }, props: { html: "<p>" + "Tekst som fyller. ".repeat(120) + "</p>" } }));

test("an iris entrance is clipped until it scrolls in, then lets go of the clip", async (t) => {
  if (!browser) return t.skip("no browser");
  const page = await open(html(filler(2).concat([{ type: "richText", style: { anim: "iris", animSpeed: "fast" }, props: { html: "<p>Inn</p>" } }], filler(2))));
  const sel = ".np-anim-iris > .np-wrap";
  assert.match(await page.$eval(sel, (n) => getComputedStyle(n).clipPath), /circle\(0%/);
  await page.evaluate(() => document.querySelector(".np-anim-iris").scrollIntoView({ block: "center" }));
  await wait(1400);
  assert.ok(await page.$eval(".np-anim-iris", (n) => n.classList.contains("np-in") && n.classList.contains("np-done")));
  assert.equal(await page.$eval(sel, (n) => getComputedStyle(n).clipPath), "none");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("headings split into words that keep their text, and replay plays them again", async (t) => {
  if (!browser) return t.skip("no browser");
  const page = await open(html([{ type: "richText", style: { headFx: "words" }, props: { html: "<h2>Tre <em>små</em> ord</h2><p>Tekst.</p>" } }]));
  await wait(300);
  assert.equal(await page.$eval("h2", (n) => n.textContent), "Tre små ord");
  assert.equal(await page.$$eval("h2 .np-hwi", (n) => n.length), 3);
  assert.equal(await page.$eval("h2 em .np-hwi", (n) => n.textContent), "små");
  const ms = await page.evaluate(() => window.NPRuntime.replay(document.querySelector(".np-sec")));
  assert.ok(ms > 0);
  assert.equal(await page.$eval(".np-sec", (n) => n.classList.contains("np-in")), false);
  await wait(120);
  assert.equal(await page.$eval(".np-sec", (n) => n.classList.contains("np-in")), true);
  await page.close();
});

test("a stack transition pins the section above and reports its progress", async (t) => {
  if (!browser) return t.skip("no browser");
  const page = await open(
    html([{ type: "richText", style: { anim: "none", bg: "soft" }, props: { html: "<p>" + "Over. ".repeat(60) + "</p>" } }, { type: "richText", style: { anim: "none", bg: "dark", transition: "stack", minH: "screen" } }].concat(filler(2)))
  );
  const read = () =>
    page.evaluate(() => {
      const [a, b] = document.querySelectorAll(".np-sec");
      return { under: a.classList.contains("np-tr-under"), recede: a.classList.contains("np-tr-recede"), pos: getComputedStyle(a).position, tp: parseFloat(b.style.getPropertyValue("--np-tp")), full: b.classList.contains("np-tr-full"), gone: a.classList.contains("np-tr-gone") };
    });
  await page.evaluate(() => window.scrollTo(0, 1));
  await wait(150);
  const start = await read();
  assert.equal(start.under, true);
  assert.equal(start.recede, true);
  assert.equal(start.pos, "sticky");
  assert.ok(start.tp < 1);
  await page.evaluate(() => window.scrollTo(0, document.querySelectorAll(".np-sec")[1].offsetTop + 10));
  await wait(150);
  const end = await read();
  assert.equal(end.full, true);
  assert.equal(end.gone, true);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("reduced motion: no pinning, no splitting, everything visible", async (t) => {
  if (!browser) return t.skip("no browser");
  const page = await open(
    html([{ type: "richText", props: { html: "<p>Over</p>" } }, { type: "richText", style: { anim: "iris", transition: "stack", headFx: "letters" }, props: { html: "<h2>Ingen bokstaver</h2>" } }]),
    { reduced: true }
  );
  const r = await page.evaluate(() => {
    const [a, b] = document.querySelectorAll(".np-sec");
    return { under: a.classList.contains("np-tr-under"), split: !!b.querySelector(".np-hc"), clip: getComputedStyle(b.querySelector(".np-wrap")).clipPath, opacity: getComputedStyle(b.querySelector(".np-wrap")).opacity };
  });
  assert.deepEqual(r, { under: false, split: false, clip: "none", opacity: "1" });
  await page.close();
});

test("without np.js the hidden start states come off by themselves", async (t) => {
  if (!browser) return t.skip("no browser");
  const page = await open(html([{ type: "richText", style: { anim: "fade-up" } }], {}, { noRuntime: true }));
  assert.equal(await page.$eval(".np-wrap", (n) => getComputedStyle(n).opacity), "0");
  await wait(3700);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("np-js")), false);
  assert.equal(await page.$eval(".np-wrap", (n) => getComputedStyle(n).opacity), "1");
  await page.close();
});
