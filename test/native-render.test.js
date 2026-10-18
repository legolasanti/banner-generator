"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const D = require("../public/native/doc.js");
const R = require("../public/native/render.js");

const IMG = "a".repeat(64) + ".jpg";

function ctxFor(project, mode, extra) {
  return Object.assign(
    {
      mode: mode || "export",
      project,
      page: project.pages[0],
      settings: { disclosureLabel: "Annonsørinnhold fra {annonsør}", publisherName: "ABC Nyheter", footerText: "Første.\n\nAndre.", headHtml: "<!--HEAD-->", bodyHtml: "" },
      assets: project.assets,
      url: (id, w) => "assets/" + (w ? id.slice(0, 64) + "-" + w + ".webp" : id),
      pageHref: () => "#",
      cssText: ".np{}",
      runtimeSrc: "assets/np.js",
    },
    extra || {}
  );
}

function project(sections, extra) {
  return D.normalizeProject(
    Object.assign(
      {
        name: "Test",
        advertiser: { name: 'Ford <b>"AS"</b>', url: "https://www.ford.no/" },
        assets: { [IMG]: { w: 2400, h: 1600, widths: [480, 960, 1440, 2400], alt: "En bil" } },
        pages: [{ sections }],
      },
      extra || {}
    )
  );
}

test("the disclosure label is always there and names the advertiser, escaped", () => {
  const html = R.renderDocument(ctxFor(project([{ type: "richText" }])));
  assert.match(html, /Annonsørinnhold fra <strong>Ford &lt;b&gt;&quot;AS&quot;&lt;\/b&gt;<\/strong>/);
  assert.match(html, /<footer class="np-footer">/);
  assert.match(html, /<p>Første\.<\/p><p>Andre\.<\/p>/);
});

test("text fields are escaped, never interpreted as HTML", () => {
  const html = R.renderDocument(ctxFor(project([{ type: "hero", props: { title: '<img src=x onerror="alert(1)">' } }])));
  assert.ok(!html.includes("<img src=x"));
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("advertiser links get UTM tags and rel=sponsored", () => {
  const p = project([{ type: "cta", props: { label: "Prøv", url: "https://www.ford.no/a?x=1#top" } }], {
    tracking: { utm: { source: "abcnyheter", medium: "native", campaign: "puma" } },
  });
  const html = R.renderDocument(ctxFor(p));
  assert.match(html, /href="https:\/\/www\.ford\.no\/a\?x=1&amp;utm_source=abcnyheter&amp;utm_medium=native&amp;utm_campaign=puma#top"/);
  assert.match(html, /rel="sponsored noopener"/);
  const off = project([{ type: "cta", props: { label: "Prøv", url: "https://www.ford.no/" } }], { tracking: { utm: { enabled: false } } });
  assert.ok(!R.renderDocument(ctxFor(off)).includes("utm_source"));
});

test("images get srcset of the WebP variants, the hero is preloaded and eager", () => {
  const html = R.renderDocument(ctxFor(project([{ type: "hero", props: { title: "T", image: IMG } }, { type: "image", props: { image: IMG } }])));
  assert.match(html, /srcset="assets\/a{64}-480\.webp 480w, assets\/a{64}-960\.webp 960w/);
  assert.match(html, /<link rel="preload" as="image"/);
  assert.match(html, /loading="eager" fetchpriority="high"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /alt="En bil"/);
});

test("tracking snippets only go into exported and published pages", () => {
  const p = project([{ type: "richText" }], { tracking: { headHtml: "<!--PROJECT-->" } });
  assert.match(R.renderDocument(ctxFor(p, "export")), /<!--HEAD-->[\s\S]*<!--PROJECT-->/);
  assert.ok(!R.renderDocument(ctxFor(p, "preview")).includes("<!--HEAD-->"));
  assert.ok(!R.renderDocument(ctxFor(p, "editor")).includes("<!--PROJECT-->"));
});

test("preview pages are noindex; the editor marks fields for in-place editing", () => {
  const p = project([{ type: "hero", props: { title: "T" } }], { meta: { noindex: false } });
  assert.match(R.renderDocument(ctxFor(p, "preview")), /name="robots" content="noindex, nofollow"/);
  assert.ok(!R.renderDocument(ctxFor(p, "export")).includes('content="noindex'));
  assert.match(R.renderDocument(ctxFor(p, "editor")), /data-np-field="title"/);
  assert.ok(!R.renderDocument(ctxFor(p, "export")).includes("data-np-field"));
});

test("hidden sections: hide classes when published, faded markers in the editor", () => {
  const p = project([{ type: "richText", hide: { mobile: true } }]);
  assert.match(R.renderDocument(ctxFor(p, "export")), /np-hide-mobile/);
  assert.match(R.renderDocument(ctxFor(p, "editor")), /np-edh-mobile/);
});

test("only known players can be embedded", () => {
  assert.equal(R.embedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(R.embedUrl("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(R.embedUrl("https://vimeo.com/123456789"), "https://player.vimeo.com/video/123456789?dnt=1");
  assert.equal(R.embedUrl("https://public.flourish.studio/visualisation/1234567/"), "https://flo.uri.sh/visualisation/1234567/embed");
  assert.equal(R.embedUrl("https://evil.example/embed"), "");
  assert.equal(R.embedUrl("javascript:alert(1)"), "");
});

test("ad-server cache-buster macros are filled in at view time", () => {
  const out = R.expandMacros('<img src="https://ad.x/p?ord=[timestamp]" width="1" height="1">');
  assert.match(out, /^<script>/);
  assert.match(out, /<noscript><img src="https:\/\/ad\.x\/p\?ord=\d+"/);
  assert.equal(R.expandMacros('<img src="https://ad.x/p">'), '<img src="https://ad.x/p">');
});

test("contrast helper picks readable text colours", () => {
  assert.equal(R.onColor("#00095b"), "#ffffff");
  assert.equal(R.onColor("#fff4c2"), "#111111");
  assert.ok(R.contrast("#000000", "#ffffff") > 20);
});

test("variant tabs link the pages; pageText collects the characters to subset", () => {
  const p = D.normalizeProject({ pages: [{ label: "For menn", sections: [{ type: "hero", props: { title: "Æøå!" } }] }, { label: "For kvinner" }] });
  const html = R.renderDocument(ctxFor(p, "export", { pageHref: (pg) => pg.slug + "/" }));
  assert.match(html, /<nav class="np-variants"/);
  assert.match(html, /aria-current="page">For menn/);
  const chars = R.pageText(p);
  ["Æ", "ø", "å", "!", "F", "k"].forEach((c) => assert.ok(chars.includes(c), c));
});

test("every block type renders in every mode without throwing", () => {
  const S = require("../public/native/schema.js");
  const p = project(S.ORDER.map((type) => ({ type })));
  ["editor", "preview", "export"].forEach((mode) => {
    const html = R.renderDocument(ctxFor(p, mode));
    S.ORDER.forEach((type) => assert.ok(html.includes('data-np-type="' + type + '"'), mode + ":" + type));
  });
});

test("hotspots at full size: the picture is edge to edge, the title keeps the side margins", () => {
  const p = project([{ type: "hotspots", props: { image: IMG, size: "full", title: "Se detaljene" } }]);
  const html = R.renderSection(ctxFor(p), p.pages[0].sections[0], 0);
  assert.match(html, /<div class="np-wrap np-w-wide"><h2 class="np-h2 np-hs__title"/);
  assert.match(html, /<div class="np-wrap np-w-full"><div class="np-hs"/);
  assert.doesNotMatch(html, /np-w-full"><h2/);
  const wide = R.renderSection(ctxFor(p), Object.assign({}, p.pages[0].sections[0], { props: Object.assign({}, p.pages[0].sections[0].props, { size: "wide" }) }), 0);
  assert.match(wide, /<div class="np-wrap np-w-wide"><h2[^>]*>Se detaljene<\/h2><div class="np-hs"/, "other sizes unchanged");
});

test("stats carry the width of the widest number + unit, so the row's size fits its cards", () => {
  const p = project([{ type: "stats", props: { look: "cards", items: [{ value: "98", unit: "", label: "b" }, { value: "16 000", unit: "kWh", label: "a" }] } }]);
  const html = R.renderSection(ctxFor(p), p.pages[0].sections[0], 0);
  const widths = [...html.matchAll(/--np-vw:([\d.]+)/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, 1, "one value for the row");
  assert.ok(Math.abs(widths[0] - (6 * 0.62 + 0.1 + 3 * 0.62 * 0.45) * 1.04) < 0.02, "the widest one");
});

// ---- dark themes: the theme's colours decide a section's tone ------------------------------
const DARK_THEME = { colors: { primary: "#c6ff3d", accent: "#c6ff3d", dark: "#0b0b0b", soft: "#18181a", text: "#111111", link: "#4f7f00", page: "#0f0f10" } };

function toneOf(theme, style) {
  const p = project([{ type: "richText", style }], { theme });
  const html = R.renderSection(ctxFor(p), p.pages[0].sections[0], 0);
  return /class="([^"]+)"/.exec(html)[1].split(" ").filter((c) => /^np-on-/.test(c)).sort().join(" ");
}

test("section tone follows the theme's colours: dark soft, pale brand, dark page", () => {
  assert.equal(toneOf(DARK_THEME, { bg: "soft" }), "np-on-dark", "a dark «soft» band has light text");
  assert.equal(toneOf(DARK_THEME, { bg: "brand" }), "np-on-light np-on-light-sec", "a lime band has dark text, and is not also np-on-dark");
  assert.equal(toneOf(DARK_THEME, { bg: "dark" }), "np-on-dark");
  assert.equal(toneOf(DARK_THEME, { bg: "none" }), "np-on-dark", "the dark page itself");
  assert.equal(toneOf(DARK_THEME, { bg: "brand", tone: "light" }), "np-on-dark", "a manual tone still wins");
  // A light theme is unchanged.
  const light = { colors: { primary: "#0b4fb3", accent: "#e8590c", dark: "#14213d", soft: "#f2f4f7", text: "#111111", link: "#0b4fb3", page: "#ffffff" } };
  assert.equal(toneOf(light, { bg: "soft" }), "np-on-light-sec");
  assert.equal(toneOf(light, { bg: "brand" }), "np-on-dark");
  assert.equal(toneOf(light, { bg: "dark" }), "np-on-dark");
  assert.equal(toneOf(light, { bg: "none" }), "np-on-light-sec");
});

test("theme CSS gives dark themes readable cards and buttons", () => {
  const css = R.themeCss(D.normalizeTheme(DARK_THEME));
  assert.match(css, /--np-soft-card:rgba\(0, 0, 0, 0\.06\)/, "cards on a light band are not the dark soft colour");
  assert.match(css, /--np-on-soft:#f4f5f7/);
  assert.match(css, /--np-btn-dark-bg:#c6ff3d;--np-btn-dark-fg:#111111/, "a lime button with dark text on dark sections");
  assert.match(css, /--np-brand-accent:#111111/, "a lime accent on a lime band falls back to dark");
  const light = R.themeCss(D.normalizeTheme({ colors: { primary: "#0b4fb3", soft: "#f2f4f7", text: "#1b1f27" } }));
  assert.match(light, /--np-btn-dark-bg:#ffffff;--np-btn-dark-fg:#0b4fb3/, "light themes keep the white button");
  assert.match(light, /--np-soft-card:#f2f4f7/);
  assert.match(light, /--np-ink:#1b1f27/);
});
