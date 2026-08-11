"use strict";

/* Tests for the Campaign Manager 360 contract. Every assertion here maps to a
   documented CM360 rule — get one wrong and the ZIP is rejected on upload, or
   worse, serves without tracking the click. */

const test = require("node:test");
const assert = require("node:assert/strict");

const html5 = require("../lib/html5");

const SPEC = { key: "desktop", width: 580, height: 500, label: "desktop-580x500" };
const MARKUP = '<div id="banner-root" class="bn bn--desktop"><img class="bn__img" src="image.jpg"></div>';
const CSS = ".bn { color: #111; }";

function buildDesktop(clickUrl, title) {
  return html5.buildIndexHtml(SPEC, MARKUP, CSS, clickUrl || "https://example.com/landing", title || "Test");
}

test("index.html carries the CM360 contract", async (t) => {
  await t.test("declares ad.size in Google's exact syntax", () => {
    // Comma separator, no space after it, no units — CM360 is literal about this.
    assert.ok(buildDesktop().includes('<meta name="ad.size" content="width=580,height=500">'));
  });

  await t.test("declares clickTag as a plain top-level var", () => {
    const html = buildDesktop("https://example.com/landing");
    assert.match(html, /<script type="text\/javascript">\s*\n\s*var clickTag = "https:\/\/example\.com\/landing";/);
    // A module script would not create window.clickTag, and CM360 reads the
    // global — so the script tag must stay classic.
    assert.ok(!html.includes('type="module"'));
  });

  await t.test("uses the documented exit and reads clickTag at click time", () => {
    const html = buildDesktop();
    assert.ok(html.includes('href="javascript:window.open(window.clickTag)"'));
    // Capturing the URL into the href up front would defeat CM360's rewrite.
    assert.ok(!/href="https?:\/\//.test(html));
  });

  await t.test("declares UTF-8", () => {
    assert.ok(buildDesktop().includes('http-equiv="Content-Type" content="text/html; charset=utf-8"'));
  });

  await t.test("references nothing outside the package", () => {
    const html = buildDesktop();
    assert.ok(!/(?:src|href)\s*=\s*["']https?:\/\//.test(html));
  });

  await t.test("uses no storage APIs — CM360 rejects bundles that do", () => {
    assert.ok(!/localStorage|sessionStorage|indexedDB|openDatabase/.test(buildDesktop()));
  });

  await t.test("a hostile landing page cannot break out of the script tag", () => {
    const html = buildDesktop('https://evil.example/"</script><script>alert(1)</script>');
    assert.ok(!html.includes("</script><script>alert"), "the URL must not terminate the script element");
    assert.ok(html.includes("\\u003c/script"), "'<' has to be escaped inside the JS string");
  });

  await t.test("a hostile title cannot break out of an attribute", () => {
    const html = buildDesktop("https://example.com/", '"><img src=x onerror=alert(1)>');
    assert.ok(!html.includes("onerror=alert(1)>"), "the title must stay inside its attribute");
  });
});

test("creative ZIP naming", async (t) => {
  await t.test("stays under the 50-character limit DV360 hard-fails on", () => {
    const name = html5.creativeZipName("en-veldig-lang-kampanje-med-altfor-mange-ord-i-navnet", "desktop-580x500");
    assert.ok(name.length < 50, `got ${name.length} chars: ${name}`);
    assert.ok(name.endsWith("-desktop-580x500.zip"), "the format must survive the trim — it identifies the creative");
  });

  await t.test("leaves a short name alone", () => {
    assert.equal(html5.creativeZipName("lotto", "mobile-320x400"), "lotto-mobile-320x400.zip");
  });

  await t.test("never leaves a dangling separator", () => {
    assert.ok(!/-{2,}/.test(html5.creativeZipName("a".repeat(20) + "-----", "newsgrid-190x190")));
  });
});

test("packaging", async (t) => {
  await t.test("puts index.html at the ZIP root with only referenced assets", async () => {
    const zip = await html5.buildCreativeZip({
      spec: SPEC,
      markup: MARKUP,
      css: CSS,
      photo: { name: "image.jpg", buffer: Buffer.from("fake-jpeg") },
      fonts: [{ name: "arimo-latin-400-normal.woff2", buffer: Buffer.from("fake-font") }],
      clickUrl: "https://example.com/",
      title: "Test",
    });
    // Read the ZIP's central-directory filenames straight out of the bytes —
    // no unzip binary, no temp files.
    const names = [...zip.toString("latin1").matchAll(/PK\x03\x04.{22}/gs)].map((m) => {
      const at = m.index;
      const len = zip.readUInt16LE(at + 26);
      return zip.toString("utf8", at + 30, at + 30 + len);
    });
    assert.ok(names.includes("index.html"), "primary file must be at the root, not nested");
    assert.ok(names.includes("image.jpg"));
    assert.ok(names.includes("fonts/arimo-latin-400-normal.woff2"));
    assert.ok(!names.some((n) => n.endsWith(".zip")), "no .zip inside a creative .zip");
    assert.ok(!names.some((n) => n.startsWith("__MACOSX") || n.includes("/.")), "no archiver junk");
    assert.ok(
      names.every((n) => /^[a-z0-9._/-]+$/.test(n)),
      "no %, spaces or uppercase in filenames"
    );
  });
});
