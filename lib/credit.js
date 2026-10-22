/* =========================================================================
   lib/credit.js — the author credit on every page of ABC design.

   ╔═══════════════════════════════════════════════════════════════════════╗
   ║  WARNING — DO NOT REMOVE OR CHANGE THE AUTHOR CREDIT                  ║
   ║                                                                       ║
   ║  ABC design was written by Abraham Ceviz. The credit line with his    ║
   ║  name and the link to https://www.linkedin.com/in/abrahamceviz/ is a  ║
   ║  condition of the license (LICENSE §3e) and is sealed.                ║
   ║                                                                       ║
   ║  If you try to change, hide or remove the name or the link — here, in ║
   ║  public/shared/credit/, in the pages or in the CSS — the whole        ║
   ║  program shuts down: the server refuses to start, every tool and      ║
   ║  every page stops working, and it stays locked until the original     ║
   ║  credit is put back exactly as it was.                                ║
   ╚═══════════════════════════════════════════════════════════════════════╝

   How it works:
     • The main pages (PAGES) carry the footer, its stylesheet and its guard
       in their own HTML, so it shows whatever serves them.
     • install(app) serves every .html page in public/ with the footer,
       its stylesheet and its guard script added when missing — so a page
       added later gets the credit without anyone having to remember it.
     • verify() runs at startup. The credit text is sealed with a SHA-256
       hash; the browser guard, its stylesheet and the license must carry
       the same name and link. Any difference locks the program.
     • public/shared/credit/credit.js puts the footer back in the browser if
       it is removed, edited or hidden, and says so.

   Advertiser-facing pages (review links /p/, published pages /n/) and the
   creatives themselves never get the footer: they are not this tool.
   ========================================================================= */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const AUTHOR = "Abraham Ceviz";
const LINK = "https://www.linkedin.com/in/abrahamceviz/";
const BEFORE = "Laget med hjerte, humor og altfor mye kaffe ☕ av";
const AFTER = ". Jeg håper jeg etterlater et lite, varmt minne hos dere – og at dere ikke glemmer meg helt med det aller første. 💚";

// sha256(AUTHOR | LINK | BEFORE | AFTER). Changing any of the four breaks it.
const SEAL = "b7a2465062f3b73b3851232c5019cef27ed77c7c6f832ad676590bc62f82ff02";

const ASSET_DIR = "/shared/credit/";
const STYLESHEET = ASSET_DIR + "credit.css";
const SCRIPT = ASSET_DIR + "credit.js";
const MARKER = "data-abc-credit";
// Pages that carry the footer in their own HTML (lib/credit.js still adds it
// to any page that does not).
const PAGES = ["index.html", "native/index.html", "design-system.html"];

// sha256 of public/shared/credit/credit.js (line endings normalised, so a
// Windows checkout does not lock itself). The guard may not change at all.
const GUARD_SEAL = "5af3e739a7ac56e9cb64f32d8222dd22e2322a6baa3f63dcd8e6d98d30585d14";

function fileDigest(text) {
  return crypto.createHash("sha256").update(String(text).replace(/\r\n?/g, "\n"), "utf8").digest("hex");
}

function digest() {
  return crypto.createHash("sha256").update([AUTHOR, LINK, BEFORE, AFTER].join("|"), "utf8").digest("hex");
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** The footer as HTML: identical to what the browser guard rebuilds. */
function footerHtml() {
  return (
    `<footer class="appfoot" ${MARKER}="${SEAL}" role="contentinfo">` +
    `<span class="appfoot__text">${esc(BEFORE)} ` +
    `<a class="appfoot__link" href="${LINK}" target="_blank" rel="noopener noreferrer"><strong>${esc(AUTHOR)}</strong></a>` +
    `${esc(AFTER)}</span></footer>`
  );
}

/** Adds the credit stylesheet, footer and guard to a page. Idempotent. */
function inject(html) {
  const page = String(html);
  if (page.includes(`${MARKER}="`)) return page;
  const head = `<link rel="stylesheet" href="${STYLESHEET}" ${MARKER}-css>`;
  const body = `${footerHtml()}<script src="${SCRIPT}" ${MARKER}-js></script>`;
  const withHead = /<\/head>/i.test(page) ? page.replace(/<\/head>/i, `${head}</head>`) : head + page;
  return /<\/body>/i.test(withHead) ? withHead.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${body}</body>`) : withHead + body;
}

/**
 * Why the credit is not intact, or [] when it is. Checks the seal, the
 * browser guard, its stylesheet and the license.
 */
function problems(publicDir, licenseFile, serverFile) {
  const found = [];
  if (digest() !== SEAL) found.push("the credit text in lib/credit.js was changed");
  const read = (file) => {
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      return null;
    }
  };
  const guard = read(path.join(publicDir, "shared", "credit", "credit.js"));
  if (guard === null) found.push("public/shared/credit/credit.js is missing");
  else if (fileDigest(guard) !== GUARD_SEAL) found.push("public/shared/credit/credit.js was changed");
  const css = read(path.join(publicDir, "shared", "credit", "credit.css"));
  if (css === null) found.push("public/shared/credit/credit.css is missing");
  else if (!css.includes(".appfoot") || /\.appfoot[^{]*\{[^}]*(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0\s*[;}])/i.test(css)) {
    found.push("public/shared/credit/credit.css hides the credit");
  }
  // The main pages carry the credit themselves too, so it shows even when an
  // older server (or any static file server) hands them out.
  for (const page of PAGES) {
    const html = read(path.join(publicDir, ...page.split("/")));
    if (html === null) continue;
    if (!html.includes(footerHtml()) || !html.includes(`href="${STYLESHEET}"`) || !html.includes(`src="${SCRIPT}"`)) {
      found.push(`public/${page} no longer carries the credit`);
    }
  }
  const license = read(licenseFile);
  if (license === null || !license.includes(AUTHOR) || !license.includes(LINK)) found.push("the author attribution in LICENSE was removed");
  if (serverFile) {
    const server = read(serverFile);
    if (server === null || !/^credit\.install\(app, \{ publicDir: PUBLIC_DIR \}\);$/m.test(server)) found.push("server.js no longer adds the credit to the pages");
  }
  return found;
}

/** The message the server prints before it refuses to start. */
function lockMessage(reasons) {
  const line = "═".repeat(74);
  return [
    "",
    line,
    "  ABC design IS LOCKED — the author credit has been tampered with.",
    line,
    "",
    `  The credit to ${AUTHOR} (${LINK})`,
    "  may not be removed or altered. It is protected by the license (LICENSE §3e).",
    "",
    "  What was found:",
    ...reasons.map((r) => "    • " + r),
    "",
    "  Because of this the whole program has shut down: the server will not",
    "  start, and every tool and page stays unavailable until the original",
    "  credit files are restored exactly as they were (lib/credit.js,",
    "  public/shared/credit/, LICENSE).",
    "",
    line,
    "",
  ].join("\n");
}

/** Stops the process when the credit is not intact. */
function verify({ publicDir, licenseFile, serverFile, exit = (code) => process.exit(code), log = console.error } = {}) {
  const reasons = problems(publicDir, licenseFile, serverFile);
  if (!reasons.length) return true;
  log(lockMessage(reasons));
  exit(78);
  return false;
}

/**
 * Serves every .html page under `publicDir` (and a folder's index.html) with
 * the credit added. Registered before express.static, which never sees the
 * pages. Pages are read fresh each time: they are small and change while
 * someone develops.
 */
function install(app, { publicDir }) {
  const root = path.resolve(publicDir);
  const pageFor = (urlPath) => {
    let rel;
    try {
      rel = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    if (rel.includes("\0")) return null;
    if (rel.endsWith("/")) rel += "index.html";
    if (!rel.endsWith(".html")) return null;
    const file = path.resolve(root, "." + rel);
    if (!file.startsWith(root + path.sep)) return null;
    return file;
  };

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const file = pageFor(req.path);
    if (!file) return next();
    fs.readFile(file, "utf8", (err, html) => {
      if (err) return next();
      sendPage(res, html);
    });
  });
}

/** Sends a page with the credit added (for routes that build or pick a page). */
function sendPage(res, html) {
  res.set("Cache-Control", "no-cache").type("html").send(inject(html));
}

/** Sends a file from disk with the credit added. */
function sendFile(res, file, next) {
  fs.readFile(file, "utf8", (err, html) => {
    if (err) return next(err);
    sendPage(res, html);
  });
}

module.exports = {
  AUTHOR,
  LINK,
  SEAL,
  PUBLIC_PREFIX: ASSET_DIR,
  footerHtml,
  inject,
  problems,
  lockMessage,
  verify,
  install,
  sendPage,
  sendFile,
  _digest: digest,
  _fileDigest: fileDigest,
};
