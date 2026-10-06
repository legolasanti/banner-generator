"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");

const { createAuth } = require("../lib/auth");

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "abcd-auth-"));
  return createAuth({ dataDir: dir });
}

test("users: hashed passwords, rules for names and length, verify", async () => {
  const auth = setup();
  await assert.rejects(auth.addUser("Ka ri", "Kari", "langtpassord1"), /Brukernavnet/);
  await assert.rejects(auth.addUser("kari", "Kari", "kort"), /minst 10/);
  await auth.addUser("Kari", "Kari Nordmann", "riktig-passord", "admin");
  await assert.rejects(auth.addUser("kari", "x", "riktig-passord"), /finnes/);
  const users = await auth.readUsers();
  assert.equal(users[0].username, "kari");
  assert.ok(!JSON.stringify(users).includes("riktig-passord"));
  assert.equal((await auth.verify("KARI", "riktig-passord")).role, "admin");
  assert.equal(await auth.verify("kari", "feil-passord"), null);
  assert.equal(await auth.verify("ukjent", "riktig-passord"), null);
});

test("sessions are signed: tampering or expiry invalidates them", () => {
  const auth = setup();
  const v = auth._sign({ u: "kari", iat: Date.now(), exp: Date.now() + 60000 });
  assert.equal(auth._unsign(v).u, "kari");
  const [body, mac] = v.split(".");
  const forged = Buffer.from(JSON.stringify({ u: "admin", iat: 0, exp: Date.now() + 60000 })).toString("base64url") + "." + mac;
  assert.equal(auth._unsign(forged), null);
  assert.equal(auth._unsign(body + ".x"), null);
  assert.equal(auth._unsign(auth._sign({ u: "kari", exp: Date.now() - 1 })), null);
});

test("public paths stay open, everything else needs a login", () => {
  const auth = setup();
  ["/p/abc/", "/n/ford/", "/api/review/x/comments", "/np-assets/a.webp", "/native/runtime/np.js", "/login"].forEach((p) => assert.ok(auth._isPublic(p), p));
  ["/", "/native/", "/api/native/projects", "/api/generate", "/history/x", "/pages"].forEach((p) => assert.ok(!auth._isPublic(p), p));
});

test("with AUTH=on: redirect to login, 401 on the API, and a working login", async () => {
  process.env.AUTH = "on";
  const auth = setup();
  await auth.addUser("kari", "Kari", "riktig-passord");
  const app = express();
  app.use(auth.middleware());
  auth.routes(app);
  app.get("/", (req, res) => res.send("hei " + req.user.name));
  app.get("/api/x", (req, res) => res.json({ ok: true }));
  app.get("/p/t/", (req, res) => res.send("review"));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const home = await fetch(base + "/", { redirect: "manual" });
    assert.equal(home.status, 302);
    assert.equal(home.headers.get("location"), "/login?next=%2F");
    assert.equal((await fetch(base + "/api/x")).status, 401);
    assert.equal((await fetch(base + "/p/t/")).status, 200);
    const bad = await fetch(base + "/login", { method: "POST", body: new URLSearchParams({ username: "kari", password: "nei" }), redirect: "manual" });
    assert.equal(bad.status, 401);
    const ok = await fetch(base + "/login", { method: "POST", body: new URLSearchParams({ username: "kari", password: "riktig-passord", next: "//evil.example" }), redirect: "manual" });
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.get("location"), "/", "open redirects are refused");
    const cookie = ok.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly; SameSite=Lax/);
    const me = await fetch(base + "/", { headers: { cookie: cookie.split(";")[0] } });
    assert.equal(await me.text(), "hei Kari");
    await auth.setPassword("kari", "nytt-passord-123");
    const after = await fetch(base + "/", { headers: { cookie: cookie.split(";")[0] }, redirect: "manual" });
    assert.equal(after.status, 302, "a new password signs out old sessions");
  } finally {
    delete process.env.AUTH;
    server.close();
  }
});

test("with logins off, nothing is blocked", async () => {
  delete process.env.AUTH;
  const auth = setup();
  const app = express();
  app.use(auth.middleware());
  app.get("/", (req, res) => res.send(String(req.user)));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  try {
    const r = await fetch("http://127.0.0.1:" + server.address().port + "/");
    assert.equal(await r.text(), "null");
  } finally {
    server.close();
  }
});

test("encoded traversal never counts as a public path; a broken cookie is ignored", () => {
  const auth = setup();
  ["/p/..%2fapp.js", "/p/%2e%2e/app.js", "/n/../index.html", "/np-assets/..\\x"].forEach((p) => assert.ok(!auth._isPublic(p), p));
  assert.equal(auth._unsign("%E0%A4%A"), null);
});
