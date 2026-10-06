"use strict";

/* =========================================================================
 * auth.js — optional logins for when ABC design runs on a shared server.
 *
 * Off by default (local use needs no login). With AUTH=on in .env, every
 * page and API requires a signed-in user, except what people outside the
 * team must reach without one:
 *   /p/…            review links for the advertiser
 *   /n/…            pages ABC design publishes
 *   /api/review/…   comments and approval from a review link
 *   /np-assets/…    the images, videos and fonts those pages use
 *   /native/runtime, /native/review   their scripts
 *
 * Users live in data/users.json with scrypt password hashes; manage them
 * with `npm run user:add` / `user:list` / `user:remove` (scripts/user.js).
 * Roles: "admin" (may change Native Premium settings) and "user".
 *
 * Sessions are a signed cookie (HMAC-SHA256), HttpOnly, SameSite=Lax,
 * Secure behind HTTPS, valid 7 days. Together with server.js's Origin check
 * on every write this covers CSRF. Failed logins are rate-limited per IP.
 * ========================================================================= */

const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const express = require("express");

const COOKIE = "abcd_session";
const SESSION_MS = 7 * 24 * 3600 * 1000;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const USERNAME_RE = /^[a-z0-9._-]{2,40}$/;

const PUBLIC_PREFIXES = ["/login", "/logout", "/p/", "/n/", "/n-api/vote/", "/api/review/", "/np-assets/", "/native/runtime/", "/native/review/", "/api/health"];

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

function isEnabled() {
  return /^(on|true|1|yes)$/i.test(String(process.env.AUTH || ""));
}

function createAuth(opts) {
  const usersFile = path.join(opts.dataDir, "users.json");
  const secretFile = path.join(opts.dataDir, ".session-secret");
  let secret = null;
  const fails = new Map();

  function getSecret() {
    if (secret) return secret;
    if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
      secret = Buffer.from(process.env.SESSION_SECRET);
      return secret;
    }
    try {
      secret = fs.readFileSync(secretFile);
    } catch {
      fs.mkdirSync(path.dirname(secretFile), { recursive: true });
      secret = crypto.randomBytes(48);
      fs.writeFileSync(secretFile, secret, { mode: 0o600 });
    }
    return secret;
  }

  // ---- users ------------------------------------------------------------------
  async function readUsers() {
    try {
      const data = JSON.parse(await fsp.readFile(usersFile, "utf8"));
      return Array.isArray(data) ? data : [];
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  }

  async function writeUsers(list) {
    await fsp.mkdir(path.dirname(usersFile), { recursive: true });
    const tmp = usersFile + "." + process.pid + ".tmp";
    await fsp.writeFile(tmp, JSON.stringify(list, null, 1), { mode: 0o600 });
    await fsp.rename(tmp, usersFile);
  }

  async function addUser(username, name, password, role) {
    const u = String(username || "").trim().toLowerCase();
    if (!USERNAME_RE.test(u)) throw new Error("Brukernavnet kan bare ha a–z, 0–9, punktum, - og _ (2–40 tegn)");
    if (String(password || "").length < 10) throw new Error("Passordet må ha minst 10 tegn");
    const list = await readUsers();
    if (list.some((x) => x.username === u)) throw new Error("Brukeren finnes allerede");
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(password, salt);
    list.push({
      username: u,
      name: String(name || u).trim().slice(0, 80) || u,
      role: role === "admin" ? "admin" : "user",
      salt: salt.toString("base64"),
      hash: hash.toString("base64"),
      createdAt: new Date().toISOString(),
    });
    await writeUsers(list);
  }

  async function setPassword(username, password) {
    if (String(password || "").length < 10) throw new Error("Passordet må ha minst 10 tegn");
    const list = await readUsers();
    const user = list.find((x) => x.username === String(username).toLowerCase());
    if (!user) throw new Error("Fant ikke brukeren");
    const salt = crypto.randomBytes(16);
    user.salt = salt.toString("base64");
    user.hash = (await scrypt(password, salt)).toString("base64");
    // Changing the password signs the user out everywhere.
    user.since = Date.now() + 1;
    await writeUsers(list);
  }

  async function removeUser(username) {
    const list = await readUsers();
    const next = list.filter((x) => x.username !== String(username).toLowerCase());
    if (next.length === list.length) throw new Error("Fant ikke brukeren");
    await writeUsers(next);
  }

  async function verify(username, password) {
    const list = await readUsers();
    const user = list.find((x) => x.username === String(username || "").trim().toLowerCase());
    // Hash even for unknown users, so timing does not reveal who exists.
    const salt = user ? Buffer.from(user.salt, "base64") : crypto.randomBytes(16);
    const got = await scrypt(password || "", salt);
    if (!user) return null;
    const want = Buffer.from(user.hash, "base64");
    return want.length === got.length && crypto.timingSafeEqual(want, got) ? user : null;
  }

  // ---- sessions ------------------------------------------------------------------
  function sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const mac = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
    return body + "." + mac;
  }

  function unsign(value) {
    const [body, mac] = String(value || "").split(".");
    if (!body || !mac) return null;
    const want = crypto.createHmac("sha256", getSecret()).update(body).digest();
    const got = Buffer.from(mac, "base64url");
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
    try {
      const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      return data && data.exp > Date.now() ? data : null;
    } catch {
      return null;
    }
  }

  function readCookie(req) {
    const raw = req.headers.cookie || "";
    const m = new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)").exec(raw);
    if (!m) return "";
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return "";
    }
  }

  function secure(req) {
    return req.secure || /^https$/i.test(String(req.get("x-forwarded-proto") || ""));
  }

  function setCookie(req, res, value, maxAgeMs) {
    const parts = [COOKIE + "=" + encodeURIComponent(value), "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=" + Math.floor(maxAgeMs / 1000)];
    if (secure(req)) parts.push("Secure");
    res.setHeader("Set-Cookie", parts.join("; "));
  }

  async function userFromRequest(req) {
    const s = unsign(readCookie(req));
    if (!s) return null;
    const list = await readUsers();
    const u = list.find((x) => x.username === s.u);
    if (!u || (u.since && s.iat < u.since)) return null;
    return { username: u.username, name: u.name, role: u.role };
  }

  // Checked on the raw path, so anything that a static handler could decode
  // into a different file (/p/..%2fapp.js) is never public.
  function isPublic(p) {
    if (/%2f|%5c|%2e|\\|\/\.\.?(\/|$)/i.test(p)) return false;
    return PUBLIC_PREFIXES.some((pre) => p === pre.replace(/\/$/, "") || p.startsWith(pre));
  }

  /** Attach req.user; when logins are on, stop anyone without one. */
  function middleware() {
    return async (req, res, next) => {
      req.user = null;
      if (!isEnabled()) return next();
      try {
        req.user = await userFromRequest(req);
      } catch (err) {
        return next(err);
      }
      if (req.user || isPublic(req.path)) return next();
      if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Du må logge inn", login: true });
      res.redirect(302, "/login?next=" + encodeURIComponent(req.originalUrl));
    };
  }

  function tooMany(ip) {
    const now = Date.now();
    const list = (fails.get(ip) || []).filter((t) => now - t < FAIL_WINDOW_MS);
    fails.set(ip, list);
    return list.length >= MAX_FAILS;
  }

  function safeNext(v) {
    const s = String(v || "/");
    return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
  }

  function loginPage(next, error) {
    const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    return `<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Logg inn · ABC design</title><meta name="robots" content="noindex">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f1f4ed;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#15180f}
form{width:min(360px,calc(100vw - 32px));background:#fff;border:1px solid #e5e9df;border-radius:18px;padding:28px;box-shadow:0 10px 30px rgba(18,22,10,.1);display:flex;flex-direction:column;gap:14px}
h1{margin:0 0 4px;font-size:22px}h1 b{font-weight:800}
label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:#565b4c}
input{height:42px;border:1px solid #d3d8c9;border-radius:10px;padding:0 12px;font:inherit}
input:focus{outline:none;border-color:#1a6b1a;box-shadow:0 0 0 3px rgba(26,107,26,.2)}
button{height:44px;border:0;border-radius:10px;background:#1a6b1a;color:#fff;font:700 15px/1 inherit;cursor:pointer}
.err{background:#fbecea;color:#c52b22;border-radius:10px;padding:10px 12px;font-size:14px}
</style></head><body><form method="post" action="/login"><h1><b>ABC</b> design</h1>
${error ? '<p class="err">' + esc(error) + "</p>" : ""}
<input type="hidden" name="next" value="${esc(next)}">
<label>Brukernavn<input name="username" autocomplete="username" required autofocus></label>
<label>Passord<input name="password" type="password" autocomplete="current-password" required></label>
<button type="submit">Logg inn</button></form></body></html>`;
  }

  function routes(app) {
    const form = express.urlencoded({ extended: false, limit: "10kb" });
    app.get("/login", (req, res) => {
      if (!isEnabled()) return res.redirect("/");
      res.set("Cache-Control", "no-store").type("html").send(loginPage(safeNext(req.query.next), ""));
    });
    app.post("/login", form, express.json({ limit: "10kb" }), async (req, res, next) => {
      try {
        if (!isEnabled()) return res.redirect("/");
        // Per address AND user name, so one person mistyping behind a shared
        // proxy address cannot lock the whole team out.
        const ip = (req.ip || "?") + "|" + String((req.body && req.body.username) || "").toLowerCase().slice(0, 40);
        const nextUrl = safeNext(req.body && req.body.next);
        if (tooMany(ip)) {
          return res.status(429).type("html").send(loginPage(nextUrl, "For mange forsøk. Vent et kvarter og prøv igjen."));
        }
        const user = await verify(req.body && req.body.username, req.body && req.body.password);
        if (!user) {
          fails.get(ip).push(Date.now());
          return res.status(401).type("html").send(loginPage(nextUrl, "Feil brukernavn eller passord."));
        }
        fails.delete(ip);
        const now = Date.now();
        setCookie(req, res, sign({ u: user.username, iat: now, exp: now + SESSION_MS }), SESSION_MS);
        res.redirect(303, nextUrl);
      } catch (err) {
        next(err);
      }
    });
    app.post("/logout", (req, res) => {
      setCookie(req, res, "", 0);
      res.redirect(303, isEnabled() ? "/login" : "/");
    });
    app.get("/api/me", (req, res) => {
      res.json({ auth: isEnabled(), user: req.user || null });
    });
  }

  return { middleware, routes, addUser, removeUser, setPassword, readUsers, verify, isEnabled, _sign: sign, _unsign: unsign, _isPublic: isPublic };
}

module.exports = { createAuth, isEnabled };
