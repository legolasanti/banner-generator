// The author credit: sealed text, added to every page, and the lock that
// stops the program when someone changes it. See lib/credit.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const express = require("express");

const credit = require("../lib/credit");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const LICENSE = path.join(ROOT, "LICENSE");

/** A throwaway copy of the files verify() reads, to tamper with. */
function scratchTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "abc-credit-"));
  const pub = path.join(dir, "public");
  fs.mkdirSync(path.join(pub, "shared", "credit"), { recursive: true });
  for (const f of ["credit.js", "credit.css"]) {
    fs.copyFileSync(path.join(PUBLIC_DIR, "shared", "credit", f), path.join(pub, "shared", "credit", f));
  }
  fs.copyFileSync(LICENSE, path.join(dir, "LICENSE"));
  return { dir, pub, license: path.join(dir, "LICENSE") };
}

function edit(file, from, to) {
  const s = fs.readFileSync(file, "utf8");
  assert.ok(s.includes(from), "fixture text not found: " + from);
  fs.writeFileSync(file, s.split(from).join(to));
}

test("the shipped credit is intact", () => {
  assert.deepEqual(credit.problems(PUBLIC_DIR, LICENSE, path.join(ROOT, "server.js")), []);
  assert.equal(credit._digest(), credit.SEAL);
});

test("the footer names Abraham Ceviz and links to his LinkedIn", () => {
  const html = credit.footerHtml();
  assert.match(html, /<strong>Abraham Ceviz<\/strong>/);
  assert.match(html, /href="https:\/\/www\.linkedin\.com\/in\/abrahamceviz\/"/);
  assert.match(html, /altfor mye kaffe ☕ av/);
  assert.match(html, /ikke glemmer meg helt med det aller første\. 💚/);
});

test("inject adds stylesheet, footer and guard once, before </head> and the last </body>", () => {
  const page = "<!doctype html><html><head><title>x</title></head><body><p>a</p><script>var s='</body>'</script></body></html>";
  const out = credit.inject(page);
  assert.match(out, /<link rel="stylesheet" href="\/shared\/credit\/credit\.css"[^>]*><\/head>/);
  assert.match(out, /<\/footer><script src="\/shared\/credit\/credit\.js"[^>]*><\/script><\/body><\/html>$/);
  assert.equal(credit.inject(out), out, "idempotent");
});

test("every page in public/ gets the credit when served, also pages added later", async () => {
  const tree = scratchTree();
  fs.writeFileSync(path.join(tree.pub, "index.html"), "<html><head></head><body>home</body></html>");
  fs.mkdirSync(path.join(tree.pub, "nytt"));
  fs.writeFileSync(path.join(tree.pub, "nytt", "index.html"), "<html><head></head><body>ny side</body></html>");
  fs.writeFileSync(path.join(tree.pub, "app.js"), "1");
  const app = express();
  credit.install(app, { publicDir: tree.pub });
  app.use(express.static(tree.pub));
  const server = app.listen(0);
  const port = server.address().port;
  const get = (p) =>
    new Promise((resolve, reject) => {
      http.get({ port, path: p }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }).on("error", reject);
    });
  try {
    for (const p of ["/", "/index.html", "/nytt/", "/nytt/index.html"]) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      assert.match(r.body, /Abraham Ceviz/, p);
      assert.match(r.body, /shared\/credit\/credit\.js/, p);
    }
    const js = await get("/app.js");
    assert.equal(js.body, "1", "non-pages untouched");
    const escape = await get("/..%2f..%2fetc%2fpasswd.html");
    assert.notEqual(escape.status, 200);
  } finally {
    server.close();
  }
});

for (const [name, tamper] of [
  ["the name is changed in the browser guard", (t) => edit(path.join(t.pub, "shared/credit/credit.js"), 'var AUTHOR = "Abraham Ceviz"', 'var AUTHOR = "Someone Else"')],
  ["the link is changed in the browser guard", (t) => edit(path.join(t.pub, "shared/credit/credit.js"), "linkedin.com/in/abrahamceviz/", "example.com/")],
  ["the guard is deleted", (t) => fs.rmSync(path.join(t.pub, "shared/credit/credit.js"))],
  ["the stylesheet hides the footer", (t) => edit(path.join(t.pub, "shared/credit/credit.css"), ".appfoot {\n  flex: none;", ".appfoot {\n  display: none;")],
  ["the license loses the attribution", (t) => edit(t.license, "Abraham Ceviz", "The Author")],
]) {
  test("the program locks itself when " + name, () => {
    const t = scratchTree();
    tamper(t);
    const codes = [];
    const logs = [];
    const ok = credit.verify({ publicDir: t.pub, licenseFile: t.license, exit: (c) => codes.push(c), log: (m) => logs.push(m) });
    assert.equal(ok, false);
    assert.deepEqual(codes, [78]);
    assert.match(logs.join("\n"), /ABC design IS LOCKED/);
    assert.match(logs.join("\n"), /whole program has shut down/);
  });
}

test("the program locks itself when server.js stops adding the credit", () => {
  const t = scratchTree();
  const server = path.join(t.dir, "server.js");
  fs.writeFileSync(server, fs.readFileSync(path.join(ROOT, "server.js"), "utf8").replace("credit.install(app, { publicDir: PUBLIC_DIR });", "// gone"));
  assert.deepEqual(credit.problems(t.pub, t.license, server), ["server.js no longer adds the credit to the pages"]);
});

test("an intact tree starts without a word", () => {
  const t = scratchTree();
  const codes = [];
  assert.equal(credit.verify({ publicDir: t.pub, licenseFile: t.license, exit: (c) => codes.push(c), log: () => {} }), true);
  assert.deepEqual(codes, []);
});

test("no page in public/ hard-codes its own copy of the footer", () => {
  const pages = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html")) pages.push(p);
    }
  };
  walk(PUBLIC_DIR);
  assert.ok(pages.length >= 3);
  for (const p of pages) assert.doesNotMatch(fs.readFileSync(p, "utf8"), /<footer class="appfoot"/, path.relative(ROOT, p));
});
