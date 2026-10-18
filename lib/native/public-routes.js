"use strict";

/* =========================================================================
 * public-routes.js — the two kinds of page people outside the team open.
 *
 *   /p/<token>/[<variant>/]   review link for the advertiser: the frozen
 *                             review round, with comment pins and "Godkjenn"
 *   /n/<slug>/[<variant>/]    a page ABC design publishes itself
 *
 * Neither needs a login (when logins are switched on, these paths stay
 * open). The review token is 24 random bytes, never the project id, and a
 * new round can revoke it.
 *
 * Published pages may carry the team's measurement snippets (Kilkaya,
 * Mixpanel, GTM …). They are served with a CSP sandbox, so a snippet runs
 * in an opaque origin: it gets no cookies, and since the API sends no CORS
 * headers it cannot read the API's answers either.
 * For production, the ZIP on the publisher's own domain is still preferred.
 * ========================================================================= */

const { handle } = require("./routes");
const { sharedComments } = require("./projects");
const { UserError, NotFoundError } = require("./fsutil");

const WINDOW_MS = 10 * 60 * 1000;
const MAX_WRITES = 40;
// Opening a review link is two requests (page + comments); a whole agency
// behind one address reloading for an afternoon stays well under this.
const MAX_READS = 300;

const MAX_KEYS = 5000;

/**
 * Tiny per-IP limiter for the anonymous review endpoints: at most `max`
 * requests per address in a sliding window. Requests refused while over the
 * limit are not counted, so a client that keeps retrying gets in again once
 * its older requests age out. At MAX_KEYS addresses the least recently seen
 * are forgotten (never everyone at once).
 *
 * req.ip is the socket's address unless Express trusts a proxy: behind a
 * reverse proxy, set TRUST_PROXY (see server.js), or every reader shares
 * the proxy's address — and one budget.
 */
function createLimiter(max) {
  const limit = max || MAX_WRITES;
  const hits = new Map();
  return function limited(req) {
    const key = req.ip || "?";
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
    const over = list.length >= limit;
    if (!over) list.push(now);
    hits.delete(key); // re-inserted last: the Map's order is "least recently seen" first
    hits.set(key, list);
    while (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value);
    return over;
  };
}

/** The review link's own 429: a page, since a person opened it. */
function tooManyPage() {
  return (
    '<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow"><title>Vent litt</title>' +
    "<style>body{font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1b1f27;background:#f6f7f9;margin:0;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}main{max-width:420px;text-align:center}h1{font-size:22px;margin:0 0 8px}</style>" +
    "</head><body><main><h1>For mange forespørsler</h1><p>Siden er åpnet svært mange ganger fra denne adressen på kort tid. Vent noen minutter og last inn på nytt.</p></main></body></html>"
  );
}

function scriptJson(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function registerPublicRoutes(app, deps) {
  const { projects, settings, pages, readPublished } = deps;
  const polls = deps.polls || require("./polls").createPollStore(deps.dataDir);
  // Votes get their own, roomier budget: many readers of a campaign page can
  // share one office or mobile-carrier address.
  const voteLimited = createLimiter(200);
  // The published version a vote is checked against, read once per version.
  const versionCache = new Map();
  async function publishedProject(entry) {
    const key = entry.id + "/" + entry.version;
    if (!versionCache.has(key)) {
      if (versionCache.size > 50) versionCache.clear();
      versionCache.set(key, projects.readVersion(entry.id, entry.version).then((v) => v.project));
      versionCache.get(key).catch(() => versionCache.delete(key));
    }
    return versionCache.get(key);
  }
  const limited = createLimiter();
  const readLimited = createLimiter(MAX_READS);

  // ---- review link -----------------------------------------------------------
  async function sendReview(req, res) {
    if (readLimited(req)) {
      res.set("Retry-After", "120");
      return res.status(429).type("html").send(tooManyPage());
    }
    const found = await projects.findByReviewToken(req.params.token);
    const project = found.project;
    const rec = found.record;
    const page = project.pages.find((p) => p.slug === req.params.page) || project.pages[0];
    const s = await settings.get();
    const base = "/p/" + req.params.token + "/";
    const boot = {
      token: req.params.token,
      round: rec.review.round,
      name: rec.name,
      advertiser: rec.advertiser.name,
      page: page.id,
      status: rec.status,
    };
    const html = await pages.renderHosted(project, s, page, {
      mode: "preview",
      pageHref: (pg) => base + (pg === project.pages[0] ? "" : pg.slug + "/"),
      extraHead: '<link rel="stylesheet" href="/native/review/review.css">',
      extraBody: "<script>window.NP_REVIEW=" + scriptJson(boot) + '</script><script src="/native/review/review.js" defer></script>',
    });
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    res.type("html").send(html);
  }

  // Express matches "/p/x" and "/p/x/" alike, so only redirect the bare one.
  app.get("/p/:token", (req, res, next) => (req.path.endsWith("/") ? next() : res.redirect(301, "/p/" + encodeURIComponent(req.params.token) + "/")));
  app.get("/p/:token/", handle("review", "Kunne ikke vise siden", sendReview));
  app.get("/p/:token/:page/", handle("review", "Kunne ikke vise siden", sendReview));

  app.get("/api/review/:token", handle("reviewData", "Kunne ikke hente kommentarene", async (req, res) => {
    if (readLimited(req)) throw new UserError("For mange forespørsler på kort tid. Vent litt og prøv igjen.", 429);
    const found = await projects.findByReviewToken(req.params.token);
    const data = await projects.listComments(found.record.id);
    res.set("Cache-Control", "no-store");
    // Only what the advertiser may see: never the team's internal notes or
    // the AI's warnings.
    res.json({
      round: found.record.review.round,
      status: found.record.status,
      comments: sharedComments(data.comments).filter((c) => !c.resolved || c.round === found.record.review.round),
      approvals: data.approvals.filter((a) => a.round === found.record.review.round),
    });
  }));

  app.post("/api/review/:token/comments", handle("reviewComment", "Kunne ikke lagre kommentaren", async (req, res) => {
    if (limited(req)) throw new UserError("For mange kommentarer på kort tid. Vent litt og prøv igjen.", 429);
    const found = await projects.findByReviewToken(req.params.token);
    const b = req.body || {};
    const comment = await projects.addComment(found.record.id, {
      text: b.text,
      author: b.author,
      anchor: b.anchor,
      parent: b.parent,
      round: found.record.review.round,
      from: "client",
    });
    res.status(201).json({ comment });
  }));

  app.post("/api/review/:token/approve", handle("approve", "Kunne ikke godkjenne", async (req, res) => {
    if (limited(req)) throw new UserError("For mange forsøk. Vent litt og prøv igjen.", 429);
    const found = await projects.findByReviewToken(req.params.token);
    const approval = await projects.approve(found.record.id, { name: (req.body || {}).name, round: (req.body || {}).round });
    res.json({ approval });
  }));

  // ---- published pages ---------------------------------------------------------------
  async function sendPublished(req, res) {
    const map = await readPublished();
    const entry = Object.prototype.hasOwnProperty.call(map, req.params.slug) ? map[req.params.slug] : null;
    if (!entry) throw new NotFoundError("Siden finnes ikke");
    const v = await projects.readVersion(entry.id, entry.version);
    const project = v.project;
    const page = project.pages.find((p) => p.slug === req.params.page) || project.pages[0];
    if (req.params.page && page === project.pages[0] && req.params.page !== page.slug) throw new NotFoundError("Siden finnes ikke");
    const s = await settings.get();
    const base = "/n/" + req.params.slug + "/";
    const origin = s.publicBaseUrl || req.protocol + "://" + req.get("host");
    const html = await pages.renderHosted(project, s, page, {
      mode: "publish",
      pageHref: (pg) => base + (pg === project.pages[0] ? "" : pg.slug + "/"),
      canonical: origin + base + (page === project.pages[0] ? "" : page.slug + "/"),
      absoluteBase: origin,
      api: origin + "/n-api/vote/" + encodeURIComponent(req.params.slug),
    });
    res.set(
      "Content-Security-Policy",
      "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
    );
    if (project.meta.noindex) res.set("X-Robots-Tag", "noindex, nofollow");
    // Without a configured public address the canonical comes from the Host
    // header, so the page must not be cached for others.
    res.set("Cache-Control", s.publicBaseUrl ? "public, max-age=60" : "private, no-store");
    res.type("html").send(html);
  }

  // ---- votes from published pages --------------------------------------------
  // The page runs sandboxed (opaque origin), so this one endpoint answers any
  // origin. It takes a text/plain body: no preflight, no cookies, no secrets.
  const textBody = require("express").text({ type: "text/plain", limit: "1kb" });
  app.options("/n-api/vote/:slug/:section", (req, res) => {
    res.set("Access-Control-Allow-Origin", "*").set("Access-Control-Allow-Methods", "POST").set("Access-Control-Allow-Headers", "Content-Type").sendStatus(204);
  });
  app.post("/n-api/vote/:slug/:section", textBody, handle("vote", "Kunne ikke lagre svaret", async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "no-store");
    if (voteLimited(req)) throw new UserError("For mange svar på kort tid.", 429);
    const map = await readPublished();
    const entry = Object.prototype.hasOwnProperty.call(map, req.params.slug) ? map[req.params.slug] : null;
    if (!entry) throw new NotFoundError("Siden finnes ikke");
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    const project = await publishedProject(entry);
    const counts = await polls.vote(req.params.slug, project, req.params.section, String((body && body.option) || ""));
    res.json({ counts });
  }));

  app.get("/n/:slug", (req, res, next) => (req.path.endsWith("/") ? next() : res.redirect(301, "/n/" + encodeURIComponent(req.params.slug) + "/")));
  app.get("/n/:slug/", handle("published", "Kunne ikke vise siden", sendPublished));
  app.get("/n/:slug/:page/", handle("published", "Kunne ikke vise siden", sendPublished));
}

module.exports = { registerPublicRoutes, scriptJson, createLimiter };
