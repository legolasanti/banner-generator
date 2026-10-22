"use strict";

/* The block-quality pass: the page frame follows the theme, the floating
   button keeps out of the way, headings fit, and the blocks that looked
   cheap (card icons, flip cards, people, products) render their new look. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const S = require("../public/native/schema.js");
const D = require("../public/native/doc.js");
const R = require("../public/native/render.js");

const CSS = fs.readFileSync(path.join(__dirname, "../public/native/runtime/np.css"), "utf8");
const JS = fs.readFileSync(path.join(__dirname, "../public/native/runtime/np.js"), "utf8");
const SETTINGS = { studioName: "ABC BrandStudio", footerText: "Tekst.", disclosureLabel: "Annonsørinnhold fra {annonsør}" };

function render(sections, opts) {
  const o = opts || {};
  const project = D.normalizeProject({
    name: "Blokker",
    advertiser: Object.assign({ name: "Ford", url: "https://www.ford.no/" }, o.advertiser || {}),
    extras: o.extras || {},
    theme: o.theme,
    assets: o.assets || {},
    pages: [{ sections }],
  });
  return R.renderDocument({
    mode: o.mode || "export",
    project,
    page: project.pages[0],
    settings: SETTINGS,
    assets: project.assets,
    url: (id) => "/a/" + id,
    pageHref: () => "#",
    cssText: o.inline ? CSS : "",
    cssHref: "/np.css",
    runtimeSrc: "data:text/javascript,",
    extraBody: o.inline ? "<script>" + JS + "</script>" : "",
  });
}

// ---- markup -----------------------------------------------------------------------
test("sections the floating button must avoid, and wide ones, are marked", () => {
  const html = render([
    { type: "richText" },
    { type: "cta", props: { label: "Kjøp", url: "https://x.no/" } },
    { type: "hScroll" },
    { type: "productCards", props: { layout: "carousel" } },
    { type: "image", props: { size: "full" } },
  ]);
  const tags = html.match(/<(section|header)[^>]*data-np-type="[^"]+"[^>]*>/g);
  const by = (type) => tags.find((t) => t.includes('data-np-type="' + type + '"'));
  assert.doesNotMatch(by("richText"), /data-np-busy|data-np-wide/);
  assert.match(by("cta"), /data-np-busy/);
  assert.match(by("hScroll"), /data-np-wide/);
  assert.match(by("productCards"), /data-np-busy/);
  assert.match(by("productCards"), /data-np-wide/);
  assert.match(by("image"), /data-np-wide/);
});

test("the floating button sits in a corner by default, later than before", () => {
  const x = D.normalizeExtras({ stickyCta: true, stickyLabel: "Book" }, null);
  assert.equal(x.stickyAfter, 40);
  assert.equal(x.stickyPlace, "auto");
  assert.equal(D.normalizeExtras({ stickyPlace: "nope" }, null).stickyPlace, "auto");
  assert.match(render([{ type: "hero" }], { extras: { stickyCta: true, stickyLabel: "Book" } }), /class="np-sticky np-sticky--auto" data-np-sticky="40"/);
  assert.match(render([{ type: "hero" }], { extras: { stickyCta: true, stickyLabel: "Book", stickyPlace: "center", stickyAfter: 25 } }), /class="np-sticky np-sticky--center" data-np-sticky="25"/);
});

test("a bare advertiser name in the bar is marked, so phones can drop it", () => {
  assert.match(render([{ type: "hero" }]), /class="np-disclosure np-disclosure--advword"/);
  // The label still names the advertiser.
  assert.match(render([{ type: "hero" }]), /Annonsørinnhold fra <strong>Ford<\/strong>/);
});

test("cards: a chosen icon, an emoji that maps to one, other emoji in a tile, numbers as before", () => {
  const html = render([
    {
      type: "cards",
      props: {
        items: [
          { icon: "leaf", title: "Ikon" },
          { symbol: "⚡", title: "Emoji med ikon" },
          { symbol: "🦄", title: "Emoji uten ikon" },
          { symbol: "01", title: "Tall" },
        ],
      },
    },
  ]);
  const cards = html.split('class="np-card np-st"').slice(1);
  assert.match(cards[0], /np-card__ico"><svg[^>]*><path d="M5 20c0-9/);
  assert.match(cards[1], /np-card__ico"><svg[^>]*><path d="M13 2\.5/);
  assert.match(cards[2], /np-card__sym np-card__sym--emoji"[^>]*>🦄/);
  assert.match(cards[3], /np-card__sym"[^>]*>01</);
});

test("every card icon is drawable and the icon field only takes known ids", () => {
  assert.ok(S.ICONS.length >= 30);
  for (const [id, name, d] of S.ICONS) {
    assert.match(id, /^[a-z]+$/);
    assert.ok(name);
    assert.match(d, /^M[\d.\s,a-zA-Z-]+$/, id);
  }
  Object.values(S.EMOJI_ICONS).forEach((id) => assert.ok(S.ICONS.some((i) => i[0] === id), id));
  const sec = D.normalizeSection({ type: "cards", props: { items: [{ icon: "nope" }, { icon: "star" }] } });
  assert.deepEqual(sec.props.items.map((i) => i.icon), ["", "star"]);
});

test("flip cards get a numeral and a flip chip on a front without a picture", () => {
  const html = render([{ type: "flipCards" }]);
  assert.match(html, /<span class="np-flip__n" aria-hidden="true">01<\/span>/);
  assert.match(html, /<i aria-hidden="true"><svg[\s\S]*?<b>Snu<\/b><\/i>/);
});

test("people and products carry their look on the wrapper", () => {
  assert.match(render([{ type: "testimonials" }]), /class="np-wrap np-w-wide np-tms-look--round"/);
  assert.match(render([{ type: "testimonials", props: { look: "portrait" } }]), /np-tms-look--portrait/);
  assert.match(render([{ type: "productCards" }]), /class="np-wrap np-w-wide np-prods-fit--cover"/);
  assert.match(render([{ type: "productCards", props: { imageFit: "contain" } }]), /np-prods-fit--contain/);
  assert.equal(D.normalizeSection({ type: "testimonials", props: { look: "x" } }).props.look, "round");
});

// ---- stylesheet ------------------------------------------------------------------
test("the element reset no longer outweighs the blocks' own spacing", () => {
  assert.match(CSS, /:where\(\.np\) h1, :where\(\.np\) h2, :where\(\.np\) h3 \{ margin: 0; \}/);
  assert.match(CSS, /:where\(\.np\) p \{ margin: 0; \}/);
  assert.doesNotMatch(CSS, /\.np h1, \.np h2, \.np h3 \{[^}]*margin: 0/);
});

test("a dark page gets a dark footer, and the label stays the legal yellow", () => {
  assert.match(CSS, /\.np-dark-page \.np-footer \{ background: color-mix/);
  assert.match(CSS, /\.np \.np-disclosure__label \{[^}]*background: #fff4c2 !important/);
});

test("split words never break between letters, and headings do not hyphenate", () => {
  assert.match(CSS, /\.np-wd, \.np-hw \{ white-space: nowrap; \}/);
  assert.match(CSS, /\.np h1, \.np h2, \.np h3 \{ letter-spacing: max\(-0\.024em[^}]*hyphens: manual/);
});

// ---- browser ----------------------------------------------------------------------
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

async function open(html, w, h) {
  const page = await browser.newPage();
  await page.setViewport({ width: w || 1200, height: h || 800 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setContent(html, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 250));
  page.errors = errors;
  return page;
}

const filler = (n) => Array.from({ length: n }, () => ({ type: "richText", props: { html: "<p>" + "Tekst. ".repeat(220) + "</p>" } }));

test("a word too wide for a phone shrinks the heading instead of breaking it", async (t) => {
  if (!browser) return t.skip("no browser");
  const page = await open(render([{ type: "hero", props: { layout: "type", title: "Kjempelangtordsomikkefår plass", titleSize: "xxl", titleFx: "letters" } }], { inline: true }), 390, 844);
  const r = await page.$eval(".np-h1", (h) => ({ fit: h.hasAttribute("data-np-fit"), over: h.scrollWidth - h.clientWidth, tops: [...new Set([...h.querySelector(".np-wd").children].map((c) => c.offsetTop))].length }));
  assert.ok(r.fit, "fitted");
  assert.ok(r.over <= 1, "no overflow");
  assert.equal(r.tops, 1, "the long word stays on one line");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("the floating button waits for the opening and steps aside for a call to action", async (t) => {
  if (!browser) return t.skip("no browser");
  const sections = [{ type: "hero", props: { layout: "type", title: "Åpning" } }].concat(filler(3), [{ type: "cta", props: { label: "Kjøp", url: "https://x.no/" } }], filler(3));
  const page = await open(render(sections, { inline: true, extras: { stickyCta: true, stickyLabel: "Book", stickyAfter: 5 } }));
  const on = () => page.$eval(".np-sticky", (n) => n.classList.contains("is-on"));
  const scrollTo = async (fn) => {
    await page.evaluate(fn);
    await new Promise((r) => setTimeout(r, 250));
  };
  await scrollTo(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 120); });
  assert.equal(await on(), false, "not during the opening");
  await scrollTo(() => window.scrollTo(0, document.querySelectorAll(".np-sec")[2].offsetTop));
  assert.equal(await on(), true, "after the opening");
  await scrollTo(() => {
    const cta = document.querySelector(".np-t-cta");
    window.scrollTo(0, cta.offsetTop - window.innerHeight + cta.offsetHeight / 2);
  });
  assert.equal(await on(), false, "hidden while the call to action is at the bottom");
  await scrollTo(() => window.scrollTo(0, document.documentElement.scrollHeight));
  assert.equal(await on(), false, "hidden at the end");
  await page.close();
});

test("count-up numbers end on their real value", async (t) => {
  if (!browser) return t.skip("no browser");
  const page = await open(render([{ type: "stats", props: { countUp: true, items: [{ value: "402", unit: "km", label: "rekkevidde" }, { value: "16 000", label: "kWh" }] } }], { inline: true }));
  await new Promise((r) => setTimeout(r, 1800));
  assert.deepEqual(await page.$$eval("[data-np-count]", (n) => n.map((x) => x.textContent)), ["402", "16 000"]);
  await page.close();
});

test("the framed opening shrinks its picture until a long title is above the fold", async (t) => {
  if (!browser) return t.skip("no browser");
  const id = "b".repeat(64) + ".jpg";
  const assets = { [id]: { id, name: "x.jpg", type: "image", w: 1600, h: 1000, variants: [] } };
  const title = "Slik får du mer plass hjemme – rom for rom, uten å bygge på huset";
  const page = await open(render([{ type: "hero", props: { layout: "framed", image: id, kicker: "Guide", title, ingress: "Fem grep som frigjør plass i gangen, stua og på soverommet.", titleSize: "xl", height: "auto" } }].concat(filler(1)), { inline: true, assets }), 1440, 900);
  const bottom = await page.$eval(".np-hero--framed .np-h1", (h) => h.getBoundingClientRect().bottom);
  assert.ok(bottom <= 900, "title bottom " + bottom);
  await page.close();
});

// ---- fonts ------------------------------------------------------------------------
// A Google family that is not in public/wallpaper/fonts.js is never loaded:
// the page silently falls back to a system font. Every font a template,
// the default theme or a curated look names must be in the catalogue.
test("every font the templates and looks name is in the font catalogue", () => {
  const Fonts = require("../public/wallpaper/fonts.js");
  const T = require("../public/native/templates.js");
  const missing = [];
  const check = (where, f) => {
    if (f && f.family && (f.source || "google") === "google" && !Fonts.has(f.family)) missing.push(where + ": " + f.family);
  };
  check("DEFAULT_THEME heading", S.DEFAULT_THEME.fonts.heading);
  check("DEFAULT_THEME body", S.DEFAULT_THEME.fonts.body);
  for (const t of T.TEMPLATES) {
    const th = T.themeOf(t);
    check(t.id + " heading", th.fonts.heading);
    check(t.id + " body", th.fonts.body);
  }
  const looks = fs.readFileSync(path.join(__dirname, "../public/native/app/theme.js"), "utf8");
  for (const m of looks.matchAll(/name: "([^"]+)", colors: \{[^}]*\}, heading: "([^"]+)", body: "([^"]+)"/g)) {
    check("look «" + m[1] + "» heading", { family: m[2] });
    check("look «" + m[1] + "» body", { family: m[3] });
  }
  assert.deepEqual(missing, [], "fonts not in public/wallpaper/fonts.js");
});

test("the Tema panel warns about a font that is not in the catalogue", () => {
  const src = fs.readFileSync(path.join(__dirname, "../public/native/app/theme.js"), "utf8");
  assert.match(src, /font\.source === "google" && !Fonts\.has\(font\.family\)[\s\S]{0,200}nx-note--warn/);
});
