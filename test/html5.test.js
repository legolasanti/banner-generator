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

/* ---------------------------------------------------------------------------
 * Broken relative references.
 *
 * Campaign Manager 360 resolves every relative URL in a bundle before it will
 * accept it, and rejects the upload on one it cannot find:
 *   "The HTML5 bundle contains a broken relative file reference(s):
 *    fonts/noto-serif-latin-400-normal.woff2, …"
 * It does not care whether the rule is ever applied — and a browser never
 * complains, because it only fetches a face some text actually uses. So this is
 * a failure that passes every local check and only shows up on upload day.
 *
 * banner.css declares both families the tool uses while a creative ships only
 * the one its banners are set in, which is exactly how the dangling references
 * got there in the first place.
 * ------------------------------------------------------------------------- */
const fs = require("node:fs");
const path = require("node:path");

const ASSETS = path.join(__dirname, "..", "public", "assets");
const BANNER_CSS = fs.readFileSync(path.join(ASSETS, "banner.css"), "utf8");
const formats = require("../public/assets/formats.js");

/** Font files a product actually ships, the same way the server picks them. */
function fontsFor(productId) {
  const prefix = formats.getProduct(productId).fontPrefix;
  return fs
    .readdirSync(path.join(ASSETS, "fonts"))
    .filter((name) => name.endsWith(".woff2") && name.startsWith(prefix))
    .map((name) => ({ name }));
}

/** Every relative reference a validator would try to resolve inside the bundle. */
function relativeRefs(html) {
  const refs = new Set();
  const patterns = [/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, /\bsrc\s*=\s*"([^"]+)"/g, /\bhref\s*=\s*"([^"]+)"/g];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const ref = match[1].trim();
      if (!/^(https?:|data:|javascript:|#|\/\/)/i.test(ref)) refs.add(ref);
    }
  }
  return [...refs];
}

test("pruneFontFaces keeps only the faces the package carries", async (t) => {
  const css = `
@font-face { font-family: "Arimo"; src: url("fonts/arimo-latin-400-normal.woff2") format("woff2"); }
@font-face { font-family: "Noto Serif"; src: url("fonts/noto-serif-latin-400-normal.woff2") format("woff2"); }
.bn { color: #111; }`;

  await t.test("drops a family that is not shipped", () => {
    const out = html5.pruneFontFaces(css, [{ name: "arimo-latin-400-normal.woff2" }]);
    assert.match(out, /arimo-latin-400-normal/);
    assert.doesNotMatch(out, /noto-serif/, "an unshipped face must not stay behind as a dead URL");
  });

  await t.test("leaves the rest of the stylesheet alone", () => {
    const out = html5.pruneFontFaces(css, [{ name: "arimo-latin-400-normal.woff2" }]);
    assert.match(out, /\.bn \{ color: #111; \}/);
  });

  await t.test("shipping nothing leaves no @font-face at all", () => {
    assert.doesNotMatch(html5.pruneFontFaces(css, []), /@font-face/);
  });
});

test("no creative references a file it does not contain", async (t) => {
  for (const productId of formats.ORDER) {
    const fonts = fontsFor(productId);
    for (const spec of formats.getProduct(productId).specs) {
      await t.test(productId + "/" + spec.key, () => {
        // What the packager puts in the ZIP, minus index.html itself.
        const shipped = new Set(["image.jpg", ...fonts.map((f) => "fonts/" + f.name)]);
        let markup = '<div id="banner-root" class="bn bn--' + spec.type + '">';
        markup += '<img class="bn__img" src="image.jpg">';
        if (spec.type.indexOf("house-") === 0) {
          markup += '<img class="bn__house-logo" src="abc-shopping.png">';
          shipped.add("abc-shopping.png");
        }
        markup += "</div>";

        const css = html5.pruneFontFaces(BANNER_CSS, fonts);
        const html = html5.buildIndexHtml(spec, markup, css, "https://example.com/", "Test");

        for (const ref of relativeRefs(html)) {
          assert.ok(
            shipped.has(ref),
            "index.html points at " + ref + ", which is not in the " + productId + " package"
          );
        }
        // …and the family it IS set in has to survive the pruning.
        assert.match(css, /@font-face/, productId + " lost every face");
      });
    }
  }
});
