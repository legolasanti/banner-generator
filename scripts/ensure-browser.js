"use strict";

/* =========================================================================
 * ensure-browser.js — make sure `npm install` leaves behind a browser the
 * server can actually launch.
 *
 * npm 11 stopped running dependencies' install scripts by default. Puppeteer
 * downloads its Chromium from exactly such a script, so on a fresh machine
 * `npm install` now finishes with a cheerful warning and no browser, and the
 * first "Generer bannere" fails with something that looks nothing like the
 * real cause. A script in THIS package is not blocked, so it can fill the gap.
 *
 * It downloads nothing when it does not have to: an already-downloaded
 * Chromium, a Google Chrome installed on the machine, or an explicit
 * PUPPETEER_EXECUTABLE_PATH all count, and the ~150 MB is skipped.
 *
 * It never fails the install. Worst case it prints what to run by hand — a
 * missing browser must not leave a colleague with a half-installed project.
 * ========================================================================= */

const fs = require("fs");
const { execFileSync } = require("child_process");

// Where Google Chrome normally lands per platform. Matches the fallbacks in
// server.js (launchCandidates), which is what actually starts the browser.
const SYSTEM_CHROME = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    (process.env.LOCALAPPDATA || "") + "\\Google\\Chrome\\Application\\chrome.exe",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ],
};

function existingSystemChrome() {
  const candidates = SYSTEM_CHROME[process.platform] || [];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function bundledChromium() {
  try {
    const puppeteer = require("puppeteer");
    const path = puppeteer.executablePath();
    return path && fs.existsSync(path) ? path : null;
  } catch {
    // Not installed yet, or no browser recorded — either way, nothing bundled.
    return null;
  }
}

function main() {
  if (process.env.PUPPETEER_SKIP_DOWNLOAD === "true") return;

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    console.log("[nettleser] bruker PUPPETEER_EXECUTABLE_PATH — laster ikke ned noe.");
    return;
  }

  const bundled = bundledChromium();
  if (bundled) {
    console.log("[nettleser] Chromium er allerede på plass.");
    return;
  }

  const system = existingSystemChrome();
  if (system) {
    console.log("[nettleser] fant Google Chrome på maskinen — hopper over nedlastingen (~150 MB).");
    return;
  }

  console.log("[nettleser] laster ned Chromium til Puppeteer (~150 MB, én gang) …");
  try {
    execFileSync(process.execPath, [require.resolve("puppeteer/lib/esm/puppeteer/node/cli.js"), "browsers", "install", "chrome"], {
      stdio: "inherit",
    });
    console.log("[nettleser] ferdig.");
  } catch {
    // Older/newer Puppeteer layouts move that CLI around; fall back to npx.
    try {
      execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["puppeteer", "browsers", "install", "chrome"], {
        stdio: "inherit",
      });
      console.log("[nettleser] ferdig.");
    } catch {
      console.warn(
        "\n[nettleser] Klarte ikke å laste ned Chromium automatisk.\n" +
          "            Appen virker likevel hvis Google Chrome er installert.\n" +
          "            Ellers, kjør denne kommandoen selv:\n\n" +
          "              npx puppeteer browsers install chrome\n"
      );
    }
  }
}

main();
