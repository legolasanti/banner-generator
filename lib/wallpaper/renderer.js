"use strict";

/* =========================================================================
 * wallpaper/renderer.js — draw one Wallpaper artboard in headless Chrome.
 *
 * Loads templates/wallpaper.html, which runs the SAME public/wallpaper/
 * render.js the editor draws with. Returns the exact-size PNG (supersampled
 * and resampled with Lanczos-3, like the banner builder) and, when asked,
 * the artboard's markup with every image pointed at its HTML5 package name.
 * ========================================================================= */

const path = require("path");
const { pathToFileURL } = require("url");

const { fontFaceCss } = require("../google-fonts");

const TEMPLATE = path.join(__dirname, "..", "..", "templates", "wallpaper.html");

/**
 * @param {import("puppeteer").Browser} browser
 * @param {Object} p
 * @param {{width:number,height:number}} p.size
 * @param {Object} p.artboard        normalised artboard (doc.js)
 * @param {Array} p.faces            fonts from google-fonts getFace()
 * @param {string} p.assetDir        absolute dir holding uploaded assets
 * @param {number} [p.scale=1]       output scale (1 = ad size)
 * @param {boolean} [p.superSample]  render at 2× and resample down
 * @param {Object<string,string>} [p.names] element id → package file name;
 *                                   when set, the markup is returned too
 * @param {Object} p.imageTools      lib/image.js
 * @returns {Promise<{png: Buffer, width: number, height: number, markup: string|null}>}
 */
async function renderArtboard(browser, p) {
  const scale = Math.max(1, Math.min(2, Number(p.scale) || 1));
  const outW = Math.round(p.size.width * scale);
  const outH = Math.round(p.size.height * scale);
  const superSample = !!p.superSample && p.imageTools.isAvailable();
  const dpr = superSample ? Math.min(3, scale * 2) : scale;

  const fontCss = fontFaceCss(p.faces, (face) => {
    const mime = face.format === "woff2" ? "font/woff2" : face.format === "woff" ? "font/woff" : "font/ttf";
    return "data:" + mime + ";base64," + face.buffer.toString("base64");
  });

  const page = await browser.newPage();
  try {
    await page.setViewport({ width: p.size.width, height: p.size.height, deviceScaleFactor: dpr });
    await page.evaluateOnNewDocument(
      (d) => {
        window.__WP__ = d;
      },
      {
        artboard: p.artboard,
        width: p.size.width,
        height: p.size.height,
        fontCss,
        faces: p.faces.map((f) => ({ family: f.family, weight: f.weight, italic: f.italic, text: f.text || " " })),
        assetBase: pathToFileURL(p.assetDir).href.replace(/\/?$/, "/"),
      }
    );
    await page.goto(pathToFileURL(TEMPLATE).href, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction("window.__WP_READY__ === true", { timeout: 30000 });
    const error = await page.evaluate(() => window.__WP_ERROR__ || null);
    if (error) throw Object.assign(new Error(String(error).split("\n")[0]), { safe: /bildet/.test(error) });

    const raw = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: p.size.width, height: p.size.height },
      captureBeyondViewport: false,
    });
    const png = await p.imageTools.downscale(raw, outW, outH);

    let markup = null;
    if (p.names) {
      markup = await page.evaluate((names) => {
        const root = document.getElementById("wp-root");
        root.querySelectorAll("img.wp-img").forEach((img) => {
          const name = names[img.getAttribute("data-el")];
          if (name) img.setAttribute("src", name);
          img.removeAttribute("data-el");
          img.removeAttribute("data-asset");
        });
        root.removeAttribute("id");
        return root.outerHTML;
      }, p.names);
    }
    return { png, width: outW, height: outH, markup };
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { renderArtboard };
