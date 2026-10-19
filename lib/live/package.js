"use strict";

/* =========================================================================
 * live/package.js — the Campaign Manager 360 package for an NT Live creative.
 *
 * Same contract as lib/html5.js (ad.size, a top-level `var clickTag`, the
 * documented javascript: exit, every relative reference present in the ZIP),
 * but the page is not a screenshot of a DOM: it carries the three runtime
 * scripts and the baked data, and draws itself when the ad loads.
 *
 *   <banner>-desktop-580x500.zip
 *     index.html                     ← styles, scripts and data, all inline
 *     fonts/arimo-latin-400-normal.woff2
 *     fonts/arimo-latin-700-normal.woff2
 *     media/1.jpg …                  ← photos for the next few days' matches
 *     fallback.jpg                   ← the campaign photo (when uploaded)
 *     age-icon.png                   ← only with a custom 18+ mark
 *
 * Anything not in the ZIP (photos further out, every video, the sheet itself
 * when live refresh is on) is loaded over https at serve time.
 * ========================================================================= */

const html5 = require("../html5");

const AD_SIZE_META = (w, h) => `<meta name="ad.size" content="width=${w},height=${h}">`;
const CLICK_HANDLER = "javascript:window.open(window.clickTag)";

function escapeAttr(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A JS string literal that can never close the <script> it sits in. */
function jsString(value) {
  return JSON.stringify(String(value == null ? "" : value)).replace(/</g, "\\u003c");
}

/** JSON safe inside a classic <script>: no `</`, no U+2028/2029. */
function jsJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** The stylesheet without its comments — banner.css is a third commentary,
    and the package pays for every byte. Strings in CSS never contain the
    comment delimiters this looks for, so a plain regex is safe here. */
function stripCssComments(css) {
  return String(css)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** A script body that cannot terminate its own element early. */
function inlineScript(source) {
  return String(source).replace(/<\/script/gi, "<\\/script");
}

/**
 * The primary index.html for one format.
 *
 * @param {Object} p
 * @param {{width:number,height:number,type:string}} p.spec
 * @param {string} p.bannerCss   banner.css, already pruned to the shipped fonts
 * @param {string} p.liveCss     live.css
 * @param {string[]} p.scripts   [banner.js, live-data.js, live.js] sources
 * @param {Object} p.config      what LiveAd.mount() reads (rows, design, …)
 * @param {string} p.clickUrl    validated http(s) default landing page
 * @param {string} p.title
 */
function buildIndexHtml(p) {
  const { spec } = p;
  return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
${AD_SIZE_META(spec.width, spec.height)}
<title>${escapeAttr(p.title)} — ${spec.width}×${spec.height}</title>
<script type="text/javascript">
  var clickTag = ${jsString(p.clickUrl)};
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
  position: relative;
  width: ${spec.width}px;
  height: ${spec.height}px;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
#banner-root { width: ${spec.width}px; height: ${spec.height}px; }

${stripCssComments(p.bannerCss)}

${stripCssComments(p.liveCss)}
</style>
</head>
<body>
<a class="ad-exit" href="${CLICK_HANDLER}" aria-label="${escapeAttr(p.title)}">
<div id="banner-root" class="bn bn--live bn--${escapeAttr(spec.type)}"></div>
</a>
<script type="text/javascript">
${p.scripts.map(inlineScript).join("\n")}
</script>
<script type="text/javascript">
  (function () {
    var config = ${jsJson(p.config)};
    var root = document.getElementById("banner-root");
    var exit = document.querySelector(".ad-exit");
    // The exit always opens whatever LiveAd points it at: the match's own
    // link when the campaign chose "lenke per kamp", otherwise clickTag —
    // re-read on every interaction, so CM360's rewrite of clickTag still wins.
    window.LiveAd.mount(root, ${jsString(spec.type)}, config, { exit: exit });
  })();
</script>
</body>
</html>
`;
}

/**
 * Build the ZIP for one format.
 *
 * @param {Object} p  everything buildIndexHtml() takes, plus
 * @param {Array<{name:string,buffer:Buffer}>} p.fonts   → fonts/<name>
 * @param {Array<{name:string,buffer:Buffer}>} p.files   media/…, fallback.jpg, age-icon.…
 * @returns {Promise<Buffer>}
 */
async function buildZip(p) {
  const bannerCss = html5.pruneFontFaces(p.bannerCss, p.fonts);
  const files = [{ name: "index.html", buffer: Buffer.from(buildIndexHtml({ ...p, bannerCss }), "utf8") }];
  for (const font of p.fonts) files.push({ name: "fonts/" + font.name, buffer: font.buffer });
  for (const file of p.files || []) files.push({ name: file.name, buffer: file.buffer });
  return html5.zipToBuffer(files);
}

/** The Norwegian read-me that travels with a multi-format download. */
function readMe(ctx) {
  const lines = [
    "ABC DESIGN — NT LIVE: dynamiske HTML5-annonser for Campaign Manager 360",
    "=======================================================================",
    "",
    "Én opplastingsklar ZIP per format:",
    "",
  ];
  ctx.entries.forEach((e) => lines.push("  • " + e.zipName + "   (" + e.width + "×" + e.height + ", " + Math.round(e.bytes / 1024) + " KB)"));
  lines.push(
    "",
    "HVA ANNONSEN GJØR",
    "-----------------",
    "Annonsen leser kampene fra regnearket og viser dem som gjelder I DAG",
    "(norsk tid): lagene øverst, avspark under («I dag kl. 21:00», nedtelling",
    "eller «Pågår nå»), og en knapp. Flere kamper samme dag vises etter tur.",
    "En kamp forsvinner " + ctx.design.finishedAfterMin + " min etter avspark. Uten kamper i dag vises",
    ctx.design.lookAheadDays > 0
      ? "neste dag med kamper (inntil " + ctx.design.lookAheadDays + " dag(er) fram), ellers reserveplakaten."
      : "reserveplakaten («" + ctx.design.fallbackHeadline + "»).",
    "",
    "Kampene som ligger i pakken er de som sto i arket " + ctx.generatedAt + ".",
    ctx.liveRefresh
      ? "I tillegg henter annonsen arket på nytt hver gang den vises, så nye kamper\nkommer med uten ny opplasting – så lenge arket er delt som «Alle med lenken»."
      : "Live-oppdatering er slått av: endres arket, må pakkene eksporteres på nytt.",
    "",
    "KLIKK",
    "-----",
    ctx.design.exitMode === "clicktag"
      ? "Alle klikk går til clickTag (landingssiden under), som Campaign Manager 360\nsporer og kan overstyre:"
      : "Et klikk åpner kampens egen lenke fra arket når den finnes, ellers clickTag.\nMERK: kampens egen lenke går utenom Campaign Manager 360 sin klikksporing.\nVil du ha sporing på alle klikk, velg «Alle klikk til clickTag» i verktøyet,\neller legg sporingslenker i Lenke-kolonnen. Standard clickTag:",
    "       " + ctx.clickUrl,
    "",
    "SLIK LASTER DU OPP",
    "------------------",
    "1. Pakk ut denne filen. IKKE pakk ut ZIP-filene inni – én ZIP er én kreativ.",
    "2. Campaign Manager 360: Ny → Kreativ → HTML5-visning, og velg ZIP-filen.",
    "3. Sett målene i Campaign Manager 360 nøyaktig likt formatet (ad.size ligger",
    "   i pakken). Reservebildet ligger i mappen «reservebilder» og lastes opp FOR",
    "   SEG i feltet «Reservebilde». Det viser første kamp slik den så ut ved eksport.",
    "",
    "BILDER OG VIDEO",
    "---------------",
    "Bilder for kampene de neste " + ctx.design.bundleDays + " dagene ligger i pakken (mappen media/).",
    "Bilder lenger fram, og all video, hentes fra lenken i arket når annonsen vises –",
    "bruk direkte https-lenker til jpg/png/mp4 (Drive-delingslenker skrives om",
    "automatisk, men video fra Drive spilles ikke av). Uten bilde vises animasjonen.",
    "",
    "Generert fra filnavnet \"" + ctx.fileBase + "\"."
  );
  return lines.join("\n") + "\n";
}

module.exports = { buildIndexHtml, buildZip, readMe, jsJson, stripCssComments, CLICK_HANDLER };
