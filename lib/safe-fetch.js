"use strict";

/* =========================================================================
 * safe-fetch.js — fetching a URL the user pasted, without turning the server
 * into a probe for whatever this machine can reach.
 *
 * "Paste an image link" means a stranger's string decides where the server
 * opens a socket. Left alone that is a server-side request forgery: the link
 * can point at 127.0.0.1, at a printer on the office LAN, or at a cloud
 * metadata endpoint on 169.254.169.254, and the response comes back to the
 * browser as a "banner photo".
 *
 * Four things close it, and all four are needed:
 *
 *   1. Only http(s). No file:, no data:, no gopher:.
 *   2. Every address the hostname resolves to is checked against the reserved
 *      ranges — not just the hostname string. `internal.example.com` resolving
 *      to 10.0.0.5 is exactly as dangerous as typing 10.0.0.5.
 *   3. The check runs inside the DNS lookup the socket itself uses, so there
 *      is no window between "we checked" and "it connected" for DNS to change
 *      its answer (DNS rebinding).
 *   4. Redirects are followed by hand, one hop at a time, re-running all of
 *      the above. `redirect: "follow"` would have handed a public URL the
 *      ability to bounce us anywhere.
 *
 * Plus a streamed size cap, so a hostile server cannot answer with gigabytes.
 * ========================================================================= */

const dns = require("dns");
const net = require("net");
const http = require("http");
const https = require("https");

const MAX_REDIRECTS = 5;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

/** Errors safe to show the user; anything else is reported generically. */
class SafeFetchError extends Error {
  constructor(message) {
    super(message);
    this.name = "SafeFetchError";
    this.safe = true;
  }
}

// --------------------------------------------------------------------------
// Address classification
// --------------------------------------------------------------------------
function ipv4ToInt(ip) {
  const parts = String(ip).split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

// Everything that is not the public internet. Ordinary CDN addresses fall
// through; loopback, LAN, carrier-grade NAT, link-local (which is where cloud
// metadata lives), multicast, documentation and reserved space do not.
const BLOCKED_V4 = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. 255.255.255.255
].map(([base, bits]) => ({
  base: ipv4ToInt(base),
  mask: bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0,
}));

function isBlockedIPv4(address) {
  const value = ipv4ToInt(address);
  if (value === null) return true; // unparseable → refuse
  return BLOCKED_V4.some((range) => ((value & range.mask) >>> 0) === range.base);
}

/**
 * Expand any IPv6 form to its eight 16-bit groups, resolving `::` and an
 * embedded IPv4 tail. Returns null for anything that will not parse — callers
 * treat that as blocked.
 */
function expandIPv6(address) {
  if (net.isIP(address) !== 6) return null;
  let text = String(address);

  // ::ffff:127.0.0.1 and 64:ff9b::127.0.0.1 carry an IPv4 tail; fold it into
  // two hex groups so the range checks below see one uniform shape.
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (tail) {
    const value = ipv4ToInt(tail[1]);
    if (value === null) return null;
    const hi = ((value >>> 16) & 0xffff).toString(16);
    const lo = (value & 0xffff).toString(16);
    text = text.slice(0, tail.index) + hi + ":" + lo;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  let groups;
  if (halves.length === 1) {
    groups = head;
  } else {
    const rest = halves[1] ? halves[1].split(":").filter(Boolean) : [];
    const fill = 8 - head.length - rest.length;
    if (fill < 0) return null;
    groups = head.concat(new Array(fill).fill("0"), rest);
  }
  if (groups.length !== 8) return null;

  const out = groups.map((group) => (/^[0-9a-fA-F]{1,4}$/.test(group) ? parseInt(group, 16) : NaN));
  return out.some((n) => !Number.isInteger(n)) ? null : out;
}

function isBlockedIPv6(address) {
  const g = expandIPv6(address);
  if (!g) return true;

  const zeros = (from, to) => g.slice(from, to).every((n) => n === 0);
  const embeddedV4 = () => [(g[6] >> 8) & 255, g[6] & 255, (g[7] >> 8) & 255, g[7] & 255].join(".");

  // ::ffff:0:0/96 — an IPv4 address wearing an IPv6 costume. The classic
  // bypass: ::ffff:127.0.0.1 is loopback, and a string check never sees it.
  if (zeros(0, 5) && g[5] === 0xffff) return isBlockedIPv4(embeddedV4());
  // 64:ff9b::/96 — NAT64, also IPv4 underneath.
  if (g[0] === 0x0064 && g[1] === 0xff9b && zeros(2, 6)) return isBlockedIPv4(embeddedV4());

  if (zeros(0, 8)) return true; // ::
  if (zeros(0, 7) && g[7] === 1) return true; // ::1 loopback
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // 2001:db8::/32 documentation
  return false;
}

/**
 * URL.hostname serialises an IPv6 host WITH its brackets ("[::1]"), and
 * net.isIP does not recognise that form — so without stripping them every IPv6
 * literal would sail straight past the literal-address check and be dialled
 * directly, since a literal never goes through DNS either.
 */
function hostAddress(hostname) {
  const host = String(hostname || "");
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/** True when this literal address must not be connected to. */
function isBlockedAddress(address) {
  const value = hostAddress(address);
  const kind = net.isIP(value);
  if (kind === 4) return isBlockedIPv4(value);
  if (kind === 6) return isBlockedIPv6(value);
  return true; // not an address at all → refuse
}

// --------------------------------------------------------------------------
// Connection
// --------------------------------------------------------------------------
/**
 * A drop-in for dns.lookup that hands the socket only addresses that passed
 * the range check. Because the socket connects to what THIS returns, a name
 * that resolves differently a moment later cannot smuggle an internal address
 * through behind the check.
 */
function safeLookup(hostname, options, callback) {
  const opts = typeof options === "function" ? {} : options || {};
  const done = typeof options === "function" ? options : callback;

  dns.lookup(hostname, { ...opts, all: true, verbatim: true }, (err, addresses) => {
    if (err) return done(err);
    const list = (Array.isArray(addresses) ? addresses : [addresses]).filter(Boolean);
    const allowed = list.filter((entry) => !isBlockedAddress(entry.address));
    if (!allowed.length) {
      return done(new SafeFetchError("Lenken peker til en privat eller lokal adresse"));
    }
    if (opts.all) return done(null, allowed);
    done(null, allowed[0].address, allowed[0].family);
  });
}

function requestOnce(url, options) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "https:" ? https : http;
    const req = transport.request(
      target,
      { method: "GET", headers: options.headers, lookup: safeLookup },
      (res) => {
        const status = res.statusCode || 0;

        if (REDIRECT_CODES.has(status)) {
          res.resume(); // drain so the socket can be reused/closed
          const location = res.headers.location;
          if (!location) return reject(new SafeFetchError("Viderekobling uten mål"));
          let next;
          try {
            next = new URL(location, url).href;
          } catch {
            return reject(new SafeFetchError("Ugyldig viderekobling"));
          }
          return resolve({ redirect: next });
        }

        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new SafeFetchError("Kunne ikke hente bildet (HTTP " + status + ")"));
        }

        // Cap while streaming, not after: a hostile server can answer with far
        // more than it declares, and Content-Length may be absent or a lie.
        const chunks = [];
        let total = 0;
        // Destroying the response synchronously emits "aborted", so the reason
        // has to be recorded first — otherwise the user is told the connection
        // broke when in fact the image was simply too large.
        let stopped = false;
        res.on("data", (chunk) => {
          if (stopped) return;
          total += chunk.length;
          if (total > options.maxBytes) {
            stopped = true;
            reject(new SafeFetchError("Bildet er for stort (maks " + Math.round(options.maxBytes / 1048576) + " MB)"));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("aborted", () => {
          if (stopped) return;
          stopped = true;
          reject(new SafeFetchError("Forbindelsen ble brutt"));
        });
        res.on("error", (err) => {
          if (stopped) return;
          stopped = true;
          reject(err);
        });
        res.on("end", () => {
          if (stopped) return;
          stopped = true;
          resolve({
            body: Buffer.concat(chunks),
            contentType: String(res.headers["content-type"] || ""),
          });
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(options.timeoutMs, () => {
      req.destroy(new SafeFetchError("Tidsavbrudd – lenken svarte ikke"));
    });
    req.end();
  });
}

/**
 * Fetch an image URL, refusing anything that points inside the network.
 *
 * @param {string} rawUrl
 * @param {{maxBytes: number, timeoutMs: number, headers?: Object}} options
 * @returns {Promise<{buffer: Buffer, contentType: string, finalUrl: string}>}
 * @throws {SafeFetchError} with a message meant for the user
 */
async function fetchImage(rawUrl, options) {
  let current;
  try {
    current = new URL(String(rawUrl || "").trim()).href;
  } catch {
    throw new SafeFetchError("Ugyldig URL");
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = new URL(current);
    if (!/^https?:$/.test(target.protocol)) {
      throw new SafeFetchError("Bare http(s)-lenker er tillatt");
    }
    // A literal address never reaches safeLookup — the socket dials it
    // directly — so it has to be checked here.
    if (net.isIP(hostAddress(target.hostname)) && isBlockedAddress(target.hostname)) {
      throw new SafeFetchError("Lenken peker til en privat eller lokal adresse");
    }

    const result = await requestOnce(current, {
      headers: options.headers,
      maxBytes: options.maxBytes,
      timeoutMs: options.timeoutMs,
    });
    if (result.redirect) {
      current = result.redirect;
      continue;
    }
    return { buffer: result.body, contentType: result.contentType, finalUrl: current };
  }

  throw new SafeFetchError("For mange viderekoblinger");
}

module.exports = {
  fetchImage,
  isBlockedAddress,
  expandIPv6,
  SafeFetchError,
  MAX_REDIRECTS,
  // Internal, exported so the tests can prove a 3xx is HANDED BACK rather than
  // followed — the property the per-hop re-validation depends on.
  _requestOnce: requestOnce,
};
