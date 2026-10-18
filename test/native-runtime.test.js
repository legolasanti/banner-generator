"use strict";

/* The page runtime (np.js) in a real browser: the interactive blocks must
   work, report to dataLayer, and stay usable with reduced motion.
   Uses the same Chrome the app uses for screenshots; skipped when none can
   be started (e.g. a CI box without a browser). */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const D = require("../public/native/doc.js");
const R = require("../public/native/render.js");

const CSS = fs.readFileSync(path.join(__dirname, "../public/native/runtime/np.css"), "utf8");
const JS = fs.readFileSync(path.join(__dirname, "../public/native/runtime/np.js"), "utf8");

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

function pageHtml(sections, extras, theme) {
  const project = D.normalizeProject({
    name: "Runtime",
    advertiser: { name: "Ford", url: "https://www.ford.no/" },
    extras: extras || {},
    theme,
    pages: [{ sections }],
  });
  return R.renderDocument({
    mode: "export",
    project,
    page: project.pages[0],
    settings: { footerText: "Tekst." },
    assets: {},
    url: () => "",
    pageHref: () => "#",
    cssText: CSS,
    runtimeSrc: "data:text/javascript,",
    // The runtime inline, so the page needs no server.
    extraBody: "<script>" + JS + "</script>",
  });
}

let browser = null;

test.before(async () => {
  browser = await launch();
});

test.after(async () => {
  if (browser) await browser.close();
});

async function open(html, opts) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  if (opts && opts.reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setContent(html, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 200));
  page.errors = errors;
  return page;
}

function events(page) {
  return page.evaluate(() => (window.dataLayer || []).map((e) => e.event));
}

test("tabs, hotspots, flip cards and the poll respond and are measured", async (t) => {
  if (!browser) return t.skip("no browser");
  const html = pageHtml([
    { type: "tabs", props: { items: [{ label: "En", title: "Første" }, { label: "To", title: "Andre" }] } },
    { type: "flipCards" },
    { type: "poll" },
    { type: "quiz", props: { questions: [{ q: "Q?", options: "A\nB", correct: 2 }], results: [{ min: 1, title: "Høy" }, { min: 0, title: "Lav" }] } },
  ]);
  const page = await open(html);
  // tabs
  await page.click('[role="tab"]:nth-child(2)');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('[role="tabpanel"]')].map((p) => p.hidden));
  assert.deepEqual(tabs, [true, false]);
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "En");
  // flip
  await page.click("[data-np-flip]");
  assert.equal(await page.$eval("[data-np-flip]", (b) => b.getAttribute("aria-pressed")), "true");
  // poll (no server: thanks + locked buttons)
  await page.click("[data-np-vote]");
  assert.equal(await page.$eval(".np-poll__msg", (n) => n.textContent), "Takk for svaret!");
  assert.ok(await page.$eval("[data-np-vote]", (b) => b.disabled));
  // quiz with a result
  await page.click('[data-np-opt="1"]');
  assert.equal(await page.$eval(".np-quiz__res:not([hidden]) .np-quiz__rt", (n) => n.textContent), "Høy");
  // Results in any order: the highest threshold reached wins.
  const ev = await events(page);
  ["np_view", "np_tab", "np_flip", "np_poll", "np_quiz_complete"].forEach((e) => assert.ok(ev.indexOf(e) !== -1, e));
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("hotspots open one at a time and close with Escape", async (t) => {
  if (!browser) return t.skip("no browser");
  const img = "c".repeat(64) + ".jpg";
  const project = D.normalizeProject({
    name: "H",
    advertiser: { name: "X" },
    assets: { [img]: { name: "i", w: 1200, h: 800 } },
    pages: [{ sections: [{ type: "hotspots", props: { image: img } }] }],
  });
  const html = R.renderDocument({
    mode: "export", project, page: project.pages[0], settings: {}, assets: project.assets,
    url: () => "data:image/gif;base64,R0lGODlhAQABAAAAACw=", pageHref: () => "#", cssText: CSS, runtimeSrc: "data:text/javascript,",
    extraBody: "<script>" + JS + "</script>",
  });
  const page = await open(html);
  const dots = await page.$$(".np-hs__dot");
  await dots[0].click();
  await dots[1].click();
  const open1 = await page.$$eval(".np-hs__pt", (pts) => pts.map((p) => p.classList.contains("is-open")));
  assert.deepEqual(open1, [false, true]);
  await page.keyboard.press("Escape");
  assert.equal(await page.$$eval(".np-hs__pt.is-open", (n) => n.length), 0);
  await page.close();
});

test("the countdown ticks and switches to the done text", async (t) => {
  if (!browser) return t.skip("no browser");
  const page = await open(pageHtml([{ type: "countdown", props: { date: "2020-01-01 00:00", done: "Nå er det i gang!" } }, { type: "countdown", props: { date: "2099-01-01 00:00" } }]));
  assert.equal(await page.$eval(".np-cd.is-done .np-cd__over", (n) => n.textContent), "Nå er det i gang!");
  const days = await page.$$eval('[data-u="d"]', (n) => n[1].textContent);
  assert.ok(Number(days) > 1000);
  await page.close();
});

test("scroll effects: statement words light up, progress and floating button follow", async (t) => {
  if (!browser) return t.skip("no browser");
  const filler = Array.from({ length: 6 }, () => ({ type: "richText", props: { html: "<p>" + "Tekst. ".repeat(200) + "</p>" } }));
  const page = await open(
    pageHtml([{ type: "statement", props: { text: "En to tre fire fem seks", fx: "scroll" } }].concat(filler), { stickyCta: true, stickyLabel: "Book", stickyAfter: 20, progress: true })
  );
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 300); });
  await new Promise((r) => setTimeout(r, 300));
  const lit = await page.$$eval(".np-sw.is-lit", (n) => n.length);
  assert.ok(lit > 0, "some words lit");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.5));
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(await page.$eval(".np-sticky", (n) => n.classList.contains("is-on")));
  const ev = await events(page);
  assert.ok(ev.indexOf("np_scroll") !== -1);
  await page.close();
});

test("reduced motion: everything visible, nothing animates", async (t) => {
  if (!browser) return t.skip("no browser");
  const page = await open(
    pageHtml([
      { type: "statement", props: { text: "Alle ord synlig", fx: "scroll" } },
      { type: "hero", props: { title: "Ord for ord", titleFx: "words" } },
      { type: "stats", style: { anim: "stagger" } },
    ]),
    { reduced: true }
  );
  assert.equal(await page.$$eval(".np-sw:not(.is-lit)", (n) => n.length), 0);
  const opacities = await page.$$eval(".np-sec > .np-wrap", (n) => n.map((w) => getComputedStyle(w).opacity));
  assert.ok(opacities.every((o) => o === "1"));
  await page.close();
});

test("without JavaScript the content is all there", async (t) => {
  if (!browser) return t.skip("no browser");
  const html = pageHtml([
    { type: "tabs", props: { items: [{ label: "En", title: "Første" }, { label: "To", title: "Andre" }] } },
    { type: "rankList", props: { layout: "scenes" } },
    { type: "hScroll" },
  ]).replace(/<script>[\s\S]*?<\/script>/g, "");
  const page = await browser.newPage();
  await page.setJavaScriptEnabled(false);
  await page.setContent(html, { waitUntil: "load" });
  const visible = await page.$$eval('[role="tabpanel"]', (ps) => ps.map((p) => getComputedStyle(p).display !== "none"));
  assert.deepEqual(visible, [true, true]);
  assert.equal(await page.$eval(".np-tabs__list", (n) => getComputedStyle(n).display), "none");
  await page.close();
});

test("re-rendering sections in the editor does not pile up handlers, listeners or timers", async (t) => {
  if (!browser) return t.skip("no browser");
  const page = await open(
    pageHtml([
      { type: "hScroll" },
      { type: "statement", props: { text: "En to tre fire", fx: "scroll" } },
      { type: "timeline" },
      { type: "countdown", props: { date: "2099-01-01 00:00" } },
    ])
  );
  const result = await page.evaluate(async () => {
    const R = window.NPRuntime;
    // What the editor does on every field edit: swap the section, bind, dispose.
    const rerender = () => {
      document.querySelectorAll(".np-sec").forEach((sec) => {
        const fresh = sec.cloneNode(true);
        sec.replaceWith(fresh);
        R.bind(fresh);
      });
      R.dispose();
    };
    rerender();
    const before = R.stats();
    let resizeAdded = 0;
    let resizeRemoved = 0;
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = (type, fn, o) => { if (type === "resize") resizeAdded++; return add(type, fn, o); };
    window.removeEventListener = (type, fn, o) => { if (type === "resize") resizeRemoved++; return remove(type, fn, o); };
    for (let i = 0; i < 25; i++) rerender();
    const cd = document.querySelector("[data-np-countdown]");
    const s0 = cd.querySelector('[data-u="s"]').textContent;
    await new Promise((r) => setTimeout(r, 1100));
    return { before, after: R.stats(), resizeAdded, resizeRemoved, ticked: cd.querySelector('[data-u="s"]').textContent !== s0 };
  });
  assert.deepEqual(result.after, result.before, "25 more edits, not one handler more");
  assert.ok(result.before.scrollers >= 3, "the scroll effects are bound");
  assert.equal(result.resizeAdded, result.resizeRemoved, "every resize listener of a dropped section is removed");
  assert.ok(result.ticked, "the live countdown still ticks");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("stats: a number and its unit stay on one line and fit the card", async (t) => {
  if (!browser) return t.skip("no browser");
  const items = [
    { value: "16 000", unit: "kWh", label: "Strøm i året" },
    { value: "1 250 000", unit: "kroner", label: "Pris" },
    { value: "98", unit: "%", label: "Fornøyde" },
  ];
  for (const look of ["cards", "lines", "huge", "plain"]) {
    for (const width of [1280, 390]) {
      const page = await open(pageHtml([{ type: "stats", props: { look, countUp: false, items } }]));
      await page.setViewport({ width, height: 900 });
      const lines = await page.$$eval(".np-stat__v", (vs) =>
        vs.map((v) => {
          const lineHeight = parseFloat(getComputedStyle(v).fontSize) * 1.3;
          const stat = v.closest(".np-stat");
          const box = stat.getBoundingClientRect();
          const cs = getComputedStyle(stat);
          const inner = box.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          return { oneLine: v.getBoundingClientRect().height < lineHeight, fits: v.scrollWidth <= Math.ceil(inner) + 1 };
        })
      );
      lines.forEach((l, i) => {
        assert.ok(l.oneLine, look + " @" + width + ": value " + i + " wraps");
        assert.ok(l.fits, look + " @" + width + ": value " + i + " overflows its card");
      });
      await page.close();
    }
  }
});

test("dark theme with a lime brand: text, cards and buttons all read", async (t) => {
  if (!browser) return t.skip("no browser");
  const theme = { colors: { primary: "#c6ff3d", accent: "#c6ff3d", dark: "#0b0b0b", soft: "#18181a", text: "#111111", link: "#4f7f00", page: "#0f0f10" } };
  const page = await open(pageHtml([
    { type: "quiz", style: { bg: "soft" }, props: { questions: [{ q: "Hvor mange økter?", options: "1\n2–3", correct: 2 }] } },
    { type: "rankList", props: { layout: "cards" } },
    { type: "stats", props: { look: "cards" } },
    { type: "poll", style: { bg: "soft" } },
    { type: "factBox", props: { variant: "soft" } },
    { type: "cta", style: { bg: "brand" }, props: { label: "Start gratis", url: "https://x.no/" } },
    { type: "cta", style: { bg: "none" }, props: { label: "Bli medlem", url: "https://x.no/" } },
  ], {}, theme));
  const results = await page.evaluate(() => {
    const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
    const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    function background(el) {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c.a > 0) layers.push(c);
        if (c.a === 1) break;
      }
      return layers.reverse().reduce((acc, c) => over(c, acc), { r: 255, g: 255, b: 255, a: 1 });
    }
    const lum = (c) => [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const pick = { "quiz question": ".np-quiz__qt", "quiz option": ".np-quiz__opt", "rank card title": ".np-rank--cards .np-rank__t", "rank card text": ".np-rank--cards .np-rank__body p, .np-rank--cards .np-rank__body div", "stat value": ".np-stat__v", "stat label": ".np-stat__l", "poll option": ".np-poll__opt", "fact box": ".np-fact--soft li", "button on lime band": ".np-bg-brand .np-btn", "button on dark page": ".np-bg-none.np-t-cta .np-btn" };
    return Object.keys(pick).map((name) => {
      const el = document.querySelector(pick[name]);
      if (!el) return { name, missing: true };
      return { name, ratio: Math.round(ratio(parse(getComputedStyle(el).color), background(el)) * 10) / 10 };
    });
  });
  results.forEach((r) => {
    assert.ok(!r.missing, r.name + " not found");
    assert.ok(r.ratio >= 4.5, r.name + ": contrast " + r.ratio + " < 4.5");
  });
  await page.close();
});
