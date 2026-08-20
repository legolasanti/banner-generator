"use strict";

/* =========================================================================
 * html5.js — Campaign Manager 360 HTML5 creative packaging.
 *
 * The PNG/JPEG export flattens the banner into pixels. This one keeps it as
 * an actual web page: the headline stays live text, so it is pin-sharp on
 * every screen and every DPI, and the whole creative weighs a fraction of the
 * image version (one JPEG photo + two subsetted fonts + ~10 KB of markup).
 *
 * One ZIP per format, each independently uploadable to CM360:
 *
 *   <banner>-desktop-580x500.zip
 *     index.html                        ← primary file, MUST sit at the root
 *     image.jpg                         ← the photo
 *     fonts/arimo-latin-400-normal.woff2
 *     fonts/arimo-latin-700-normal.woff2
 *
 * The markup and the CSS are the same ones the preview and the PNG use, so an
 * HTML5 creative is pixel-for-pixel the banner the user approved on screen.
 * ========================================================================= */

const archiver = require("archiver");

// --- Campaign Manager 360 contract ----------------------------------------
// These lines are what make the ZIP a valid CM360 creative rather than just a
// web page. Change them only against Google's own documentation
// (support.google.com/campaignmanager/answer/3145300).
//   • ad.size          — how CM360 learns the creative's dimensions. Exact
//                        syntax: comma separator, no space after it, no units.
//   • var clickTag     — the exit, spelled with a lower-case c and capital T.
//                        Must be a plain top-level `var` in a CLASSIC script in
//                        the <head> of the primary HTML file: CM360 scans for
//                        it, so it must not be minified, renamed, module-scoped
//                        or wrapped in a closure. CM360 rewrites its value at
//                        serve time, so the URL baked in is only the default
//                        and what the preview opens.
//   • the click handler — reads window.clickTag AT CLICK TIME (never captured
//                        into the href up front, or CM360's rewrite would be
//                        ignored) and must open a new window/tab, never
//                        navigate the current one.
const AD_SIZE_META = (w, h) => `<meta name="ad.size" content="width=${w},height=${h}">`;
const CLICK_HANDLER = "javascript:window.open(window.clickTag)";

// DV360 hard-fails on ZIP filenames of 50 characters or more, and CM360 is
// happier with short ASCII names too, so the user's filename is trimmed for the
// package name only. The banner label always survives — it is what identifies
// which creative you are uploading.
const MAX_ZIP_NAME = 49;

function creativeZipName(fileBase, label) {
  const tail = "-" + label + ".zip";
  const room = MAX_ZIP_NAME - tail.length;
  const head = String(fileBase || "banner").slice(0, Math.max(1, room)).replace(/-+$/, "");
  return head + tail;
}

/**
 * Escape a URL for embedding in a `<script>` string literal. JSON.stringify
 * handles quotes and backslashes; `<` is additionally escaped so a URL can
 * never terminate the script element early.
 */
function jsString(value) {
  return JSON.stringify(String(value == null ? "" : value)).replace(/</g, "\\u003c");
}

function escapeAttr(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build the primary index.html for one format.
 *
 * @param {{width:number,height:number,label:string}} spec
 * @param {string} markup   #banner-root outerHTML, asset srcs already rewritten
 *                          to the package-relative filenames
 * @param {string} css      contents of public/assets/banner.css, verbatim —
 *                          its `fonts/…woff2` URLs already resolve correctly
 *                          because the fonts sit in fonts/ next to index.html
 * @param {string} clickUrl validated http(s) landing page
 * @param {string} title
 * @returns {string}
 */
function buildIndexHtml(spec, markup, css, clickUrl, title) {
  return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
${AD_SIZE_META(spec.width, spec.height)}
<title>${escapeAttr(title)} — ${spec.width}×${spec.height}</title>
<script type="text/javascript">
  var clickTag = ${jsString(clickUrl)};
</script>
<style>
html, body {
  margin: 0;
  padding: 0;
  background: #ffffff;
  overflow: hidden;
  width: ${spec.width}px;
  height: ${spec.height}px;
}
/* Whole-creative click area. Sized to the ad so there is no dead zone. */
.ad-exit {
  display: block;
  width: ${spec.width}px;
  height: ${spec.height}px;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

${css}
</style>
</head>
<body>
<a class="ad-exit" href="${CLICK_HANDLER}" aria-label="${escapeAttr(title)}">
${markup}
</a>
</body>
</html>
`;
}

const READ_ME = (fileBase, clickUrl, entries) => `BANNER GENERATOR — HTML5-pakker for Campaign Manager 360
==========================================================

Én ferdig, opplastingsklar ZIP per bannerformat:

${entries.map((e) => `  • ${e.zipName}   (${e.width}×${e.height})`).join("\n")}

SLIK LASTER DU DEM OPP
----------------------
1. Pakk ut denne filen. IKKE pakk ut ZIP-filene inni — Campaign Manager 360
   skal ha dem som ZIP. Én ZIP = én kreativ.
2. Campaign Manager 360: Ny → Kreativ → HTML5-visning, og velg ZIP-filen.
   Skal du ta alle på én gang: Ny → Masseopplasting av kreativressurser, og
   marker ZIP-filene (bare ZIP-filene — ikke denne tekstfilen eller mappen
   "reservebilder").
3. Sett målene på kreativen i Campaign Manager 360 nøyaktig likt formatet:
${entries.map((e) => `       ${e.zipName.replace(/\.zip$/, "")} → ${e.width} × ${e.height}`).join("\n")}
   Målene ligger allerede i pakken (<meta name="ad.size">), og de tre —
   kreativ, ad.size og reservebilde — må være like.
4. Klikkelenken (clickTag) er allerede satt til:
       ${clickUrl}
   Campaign Manager 360 overstyrer den med sin egen sporingslenke når annonsen
   kjører. Verdien over er standardverdien og det forhåndsvisningen åpner.

RESERVEBILDE (BACKUP)
---------------------
Mappen "reservebilder" inneholder et vanlig bilde av hvert format, i samme
størrelse som HTML5-pakken. Campaign Manager 360 ber om et reservebilde til
HTML5-kreativer, og det skal lastes opp FOR SEG i feltet «Reservebilde» —
det har ikke lov til å ligge inne i selve ZIP-filen, og gjør det heller ikke her.

HVA ER I HVER ZIP
-----------------
  index.html   selve annonsen (overskriften er ekte tekst, ikke et bilde)
  image.jpg    fotoet
  fonts/       skriften (Arimo), slik at annonsen ser lik ut overalt

Alt ligger lokalt i pakken — annonsen henter ingenting utenfra, og den bruker
verken localStorage, sessionStorage eller andre API-er Campaign Manager 360
avviser.

GÅR NOE GALT?
-------------
Campaign Manager 360 sjekker pakken når du laster den opp og sier fra om noe er
feil. Får du en feilmelding der, ta med teksten tilbake til den som genererte
bannerne — filene lages på nytt på sekunder.

Generert fra filnavnet "${fileBase}".
`;

/** Collect an archiver stream into a single Buffer. */
function zipToBuffer(files) {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks = [];
    archive.on("data", (chunk) => chunks.push(chunk));
    archive.on("warning", (err) => {
      if (err.code !== "ENOENT") reject(err);
    });
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    for (const file of files) archive.append(file.buffer, { name: file.name });
    archive.finalize().catch(reject);
  });
}

/**
 * Build one CM360-ready ZIP for a single banner format.
 *
 * @param {Object} params
 * @param {{width:number,height:number,label:string}} params.spec
 * @param {string} params.markup    #banner-root outerHTML with rewritten srcs
 * @param {string} params.css       banner.css contents
 * @param {{name:string,buffer:Buffer}} params.photo        → image.jpg
 * @param {Array<{name:string,buffer:Buffer}>} params.fonts → fonts/*.woff2
 * @param {Array<{name:string,buffer:Buffer}>=} params.extras → any other artwork
 *        the markup references at the package root: a custom 18+ mark, the abc
 *        shopping logo on the house formats
 * @param {string} params.clickUrl
 * @param {string} params.title
 * @returns {Promise<Buffer>} the ZIP
 */
async function buildCreativeZip(params) {
  const files = [
    {
      name: "index.html",
      buffer: Buffer.from(
        buildIndexHtml(params.spec, params.markup, params.css, params.clickUrl, params.title),
        "utf8"
      ),
    },
    { name: params.photo.name, buffer: params.photo.buffer },
  ];
  for (const font of params.fonts) files.push({ name: "fonts/" + font.name, buffer: font.buffer });
  for (const extra of params.extras || []) files.push({ name: extra.name, buffer: extra.buffer });
  return zipToBuffer(files);
}

module.exports = { buildCreativeZip, zipToBuffer, creativeZipName, READ_ME, buildIndexHtml };
