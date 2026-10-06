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
 * in an opaque origin and can never reach the tool's own API or cookies.
 * For production, the ZIP on the publisher's own domain is still preferred.
 * ========================================================================= */

const { handle } = require("./routes");
const { UserError, NotFoundError } = require("./fsutil");

const WINDOW_MS = 10 * 60 * 1000;
const MAX_WRITES = 40;

/** Tiny per-IP limiter for the anonymous review endpoints. */
function createLimiter() {
  const hits = new Map();
  return function limited(req) {
    const key = req.ip || "?";
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) hits.clear();
    return list.length > MAX_WRITES;
  };
}

function scriptJson(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function registerPublicRoutes(app, deps) {
  const { projects, settings, pages, readPublished } = deps;
  const limited = createLimiter();

  // ---- review link -----------------------------------------------------------
  async function sendReview(req, res) {
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
    const found = await projects.findByReviewToken(req.params.token);
    const data = await projects.listComments(found.record.id);
    res.json({
      round: found.record.review.round,
      status: found.record.status,
      comments: data.comments.filter((c) => !c.resolved || c.round === found.record.review.round),
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
    });
    res.set(
      "Content-Security-Policy",
      "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
    );
    if (project.meta.noindex) res.set("X-Robots-Tag", "noindex, nofollow");
    res.set("Cache-Control", "public, max-age=60");
    res.type("html").send(html);
  }

  app.get("/n/:slug", (req, res, next) => (req.path.endsWith("/") ? next() : res.redirect(301, "/n/" + encodeURIComponent(req.params.slug) + "/")));
  app.get("/n/:slug/", handle("published", "Kunne ikke vise siden", sendPublished));
  app.get("/n/:slug/:page/", handle("published", "Kunne ikke vise siden", sendPublished));
}

module.exports = { registerPublicRoutes, scriptJson };
