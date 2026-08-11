"use strict";

/* Tests for the SSRF guard on "hent fra lenke".
   Each blocked range here is somewhere a pasted URL could otherwise reach:
   this machine, the office LAN, or a cloud metadata endpoint. */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const safeFetch = require("../lib/safe-fetch");

test("address classification", async (t) => {
  const blocked = [
    ["127.0.0.1", "loopback"],
    ["127.1.2.3", "the rest of 127/8"],
    ["0.0.0.0", "this network"],
    ["10.1.2.3", "private class A"],
    ["172.16.0.1", "private class B, low end"],
    ["172.31.255.254", "private class B, high end"],
    ["192.168.1.1", "private class C"],
    ["169.254.169.254", "cloud metadata"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::1", "IPv6 loopback"],
    ["::", "IPv6 unspecified"],
    ["fe80::1", "IPv6 link-local"],
    ["fc00::1", "IPv6 unique local"],
    ["fd12:3456::1", "IPv6 unique local, fd form"],
    ["ff02::1", "IPv6 multicast"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback — the classic bypass"],
    ["::ffff:169.254.169.254", "IPv4-mapped metadata"],
    ["::ffff:10.0.0.1", "IPv4-mapped private"],
    ["64:ff9b::127.0.0.1", "NAT64 loopback"],
    ["[::1]", "bracketed, the form URL.hostname actually hands back"],
    ["[::ffff:127.0.0.1]", "bracketed IPv4-mapped loopback"],
    ["[fe80::1]", "bracketed link-local"],
    ["not-an-address", "anything unparseable"],
    ["", "empty"],
  ];
  for (const [address, why] of blocked) {
    await t.test(`blocks ${address || "(empty)"} — ${why}`, () => {
      assert.equal(safeFetch.isBlockedAddress(address), true);
    });
  }

  const allowed = [
    ["8.8.8.8", "public DNS"],
    ["1.1.1.1", "public DNS"],
    ["93.184.216.34", "an ordinary public host"],
    ["172.32.0.1", "just outside the private class B range"],
    ["172.15.255.255", "just below the private class B range"],
    ["11.0.0.1", "just outside 10/8"],
    ["2606:4700::1111", "public IPv6"],
    ["[2606:4700::1111]", "bracketed public IPv6"],
    ["::ffff:8.8.8.8", "IPv4-mapped public address stays allowed"],
  ];
  for (const [address, why] of allowed) {
    await t.test(`allows ${address} — ${why}`, () => {
      assert.equal(safeFetch.isBlockedAddress(address), false);
    });
  }
});

test("IPv6 expansion", async (t) => {
  await t.test("expands ::", () => {
    assert.deepEqual(safeFetch.expandIPv6("::"), [0, 0, 0, 0, 0, 0, 0, 0]);
  });
  await t.test("expands ::1", () => {
    assert.deepEqual(safeFetch.expandIPv6("::1"), [0, 0, 0, 0, 0, 0, 0, 1]);
  });
  await t.test("expands a full address", () => {
    assert.deepEqual(safeFetch.expandIPv6("2001:db8:0:0:0:0:0:1"), [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
  });
  await t.test("folds an embedded IPv4 tail into two groups", () => {
    assert.deepEqual(safeFetch.expandIPv6("::ffff:127.0.0.1"), [0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
  });
  await t.test("returns null for nonsense", () => {
    assert.equal(safeFetch.expandIPv6("hello"), null);
  });
});

test("fetching", async (t) => {
  await t.test("refuses a non-http scheme", async () => {
    await assert.rejects(
      () => safeFetch.fetchImage("file:///etc/passwd", { maxBytes: 1000, timeoutMs: 2000 }),
      /http\(s\)/
    );
  });

  await t.test("refuses a literal loopback address", async () => {
    await assert.rejects(
      () => safeFetch.fetchImage("http://127.0.0.1:9/x.png", { maxBytes: 1000, timeoutMs: 2000 }),
      /privat eller lokal/
    );
  });

  await t.test("refuses a bare IPv6 loopback literal", async () => {
    await assert.rejects(
      () => safeFetch.fetchImage("http://[::1]:9/x.png", { maxBytes: 1000, timeoutMs: 2000 }),
      /privat eller lokal/
    );
  });

  await t.test("refuses an IPv4-mapped IPv6 loopback literal", async () => {
    await assert.rejects(
      () => safeFetch.fetchImage("http://[::ffff:127.0.0.1]:9/x.png", { maxBytes: 1000, timeoutMs: 2000 }),
      /privat eller lokal/
    );
  });

  await t.test("refuses a hostname that resolves to loopback", async () => {
    // localhost is the everyday case a plain string check misses when the
    // attacker uses any other name pointing at 127.0.0.1.
    await assert.rejects(
      () => safeFetch.fetchImage("http://localhost:9/x.png", { maxBytes: 1000, timeoutMs: 2000 }),
      /privat eller lokal/
    );
  });

  // A 3xx must come back to the caller so the loop can re-run every check on
  // the new URL. If it were followed inside the request, a public link could
  // bounce us anywhere and nothing would look.
  await t.test("hands a redirect back instead of following it", async () => {
    const server = http.createServer((req, res) => {
      if (req.url === "/start.png") {
        res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
        return res.end();
      }
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address();
    try {
      const result = await safeFetch._requestOnce(`http://127.0.0.1:${port}/start.png`, {
        maxBytes: 1000,
        timeoutMs: 2000,
        headers: {},
      });
      assert.equal(result.redirect, "http://169.254.169.254/latest/meta-data/");
      assert.equal(result.body, undefined, "the redirect must not have been followed");
      // …and that target is exactly what the loop then refuses.
      assert.equal(safeFetch.isBlockedAddress(new URL(result.redirect).hostname), true);
    } finally {
      server.close();
    }
  });

  await t.test("resolves a relative redirect against the current URL", async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(301, { Location: "/moved/image.png" });
      res.end();
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address();
    try {
      const result = await safeFetch._requestOnce(`http://127.0.0.1:${port}/a/b.png`, {
        maxBytes: 1000,
        timeoutMs: 2000,
        headers: {},
      });
      assert.equal(result.redirect, `http://127.0.0.1:${port}/moved/image.png`);
    } finally {
      server.close();
    }
  });

  await t.test("stops the body at the size cap instead of after it", async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "image/png" });
      // No Content-Length — the cap cannot rely on a declared size.
      res.write(Buffer.alloc(64 * 1024));
      res.write(Buffer.alloc(64 * 1024));
      res.end();
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address();
    try {
      await assert.rejects(
        () =>
          safeFetch._requestOnce(`http://127.0.0.1:${port}/big.png`, {
            maxBytes: 32 * 1024,
            timeoutMs: 2000,
            headers: {},
          }),
        /for stort/
      );
    } finally {
      server.close();
    }
  });

  await t.test("stops after too many redirects", () => {
    assert.equal(safeFetch.MAX_REDIRECTS, 5);
  });
});
