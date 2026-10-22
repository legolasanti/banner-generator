"use strict";

/* =========================================================================
 * puff/package.js — the Campaign Manager 360 package for an Artikkelpuff.
 *
 * Same contract as lib/html5.js (ad.size, top-level click variables in a
 * classic <script> in <head>, the documented javascript: exits, nothing
 * referenced that is not in the ZIP), with one difference: three stories,
 * three exits. The variables are clickTag, clickTag2 and clickTag3 — the
 * clickTag\d* pattern Google's ad servers detect — and an empty story link
 * falls back to the lead story's, so every exit always goes somewhere.
 *
 *   <name>-puff-980x600.zip
 *     index.html                       ← markup and styles inline
 *     image-1.jpg …                    ← each photo cut to what its box shows
 *     video-1.mp4, poster-1.jpg …      ← videos at the ZIP root (CM360 does
 *                                        not allow videos inside folders)
 *     logo.png
 *     fonts/noto-sans-latin-700-normal.woff2
 *     fonts/noto-serif-latin-700-normal.woff2
 * ========================================================================= */

const html5 = require("../html5");

// Google's documented size ceiling for an HTML5 ZIP is 10 MB; one of its pages
// says 9.5. Design for the lower one.
const MAX_ZIP_BYTES = Math.round(9.5 * 1024 * 1024);
const EXIT_VARS = ["clickTag", "clickTag2", "clickTag3"];
const FONT_FILES = ["noto-sans-latin-700-normal.woff2", "noto-serif-latin-700-normal.woff2"];

function escapeAttr(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsString(value) {
  return JSON.stringify(String(value == null ? "" : value)).replace(/</g, "\\u003c");
}

/** The javascript: exit for story n (1-based), as CM360 documents it. */
function exitHref(n) {
  return "javascript:window.open(window." + EXIT_VARS[n - 1] + ")";
}

/**
 * Give every [data-exit] anchor in the markup its documented exit. Done on the
 * serialised string because the markup comes out of Puppeteer; the anchors are
 * our own, written as `<a class="…" data-exit="n"` with no href yet.
 */
function wireExits(markup) {
  return String(markup).replace(/<a ([^>]*?)data-exit="([123])"/g, (all, before, n) => {
    return '<a href="' + exitHref(Number(n)) + '" ' + before + 'data-exit="' + n + '"';
  });
}

// Same reasoning as EXIT_UPGRADE in lib/html5.js: once the page runs, each
// anchor points straight at its click variable (new tab), re-read on every
// interaction so a late CM360 rewrite still wins. Videos are nudged to play,
// since some hosts start iframes paused.
const RUNTIME = `<script type="text/javascript">
  (function () {
    var names = ${JSON.stringify(EXIT_VARS)};
    var exits = document.querySelectorAll("a[data-exit]");
    function sync(a) {
      var url = window[names[Number(a.getAttribute("data-exit")) - 1]] || window.clickTag;
      if (!url) return;
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
    }
    for (var i = 0; i < exits.length; i++) {
      (function (a) {
        sync(a);
        ["mousedown", "touchstart", "contextmenu", "auxclick", "focus", "click"].forEach(function (type) {
          a.addEventListener(type, function () { sync(a); }, true);
        });
      })(exits[i]);
    }
    var videos = document.querySelectorAll("video");
    for (var v = 0; v < videos.length; v++) {
      videos[v].muted = true;
      var p = videos[v].play && videos[v].play();
      if (p && p.catch) p.catch(function () {});
    }
  })();
</script>`;

/**
 * @param {Object} p
 * @param {string} p.markup   #banner-root outerHTML from the template (package mode)
 * @param {string} p.css      puff.css, already pruned to the shipped fonts
 * @param {string[]} p.links  three validated landing pages (empty → lead story's)
 * @param {string} p.title
 */
function buildIndexHtml(p) {
  const links = EXIT_VARS.map((_, i) => p.links[i] || p.links[0]);
  return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="ad.size" content="width=980,height=600">
<title>${escapeAttr(p.title)} — 980×600</title>
<script type="text/javascript">
  var clickTag = ${jsString(links[0])};
  var clickTag2 = ${jsString(links[1])};
  var clickTag3 = ${jsString(links[2])};
</script>
<style>
html, body {
  margin: 0;
  padding: 0;
  background: #f5f5f5;
  overflow: hidden;
  width: 980px;
  height: 600px;
}
${p.css}
</style>
</head>
<body>
${wireExits(p.markup)}
${RUNTIME}
</body>
</html>
`;
}

/**
 * @param {Object} p  buildIndexHtml() params plus
 * @param {Array<{name:string,buffer:Buffer}>} p.fonts  → fonts/<name>
 * @param {Array<{name:string,buffer:Buffer}>} p.files  → ZIP root
 * @returns {Promise<Buffer>}
 */
async function buildZip(p) {
  const css = html5.pruneFontFaces(p.css, p.fonts);
  const files = [{ name: "index.html", buffer: Buffer.from(buildIndexHtml({ ...p, css }), "utf8") }];
  for (const font of p.fonts) files.push({ name: "fonts/" + font.name, buffer: font.buffer });
  for (const file of p.files) files.push({ name: file.name, buffer: file.buffer });
  return html5.zipToBuffer(files);
}

module.exports = { buildIndexHtml, buildZip, wireExits, exitHref, EXIT_VARS, FONT_FILES, MAX_ZIP_BYTES };
