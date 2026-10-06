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
