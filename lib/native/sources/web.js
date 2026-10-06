"use strict";

/* =========================================================================
 * sources/web.js — read an advertiser's product or campaign page.
 *
 * Keeps what helps a writer: the title, the meta description, the main text
 * (navigation, footers and scripts stripped), and any schema.org Product /
 * Offer data in JSON-LD — that is where shops put the real name, price and
 * currency, which beats guessing from the layout.
 * ========================================================================= */

const Doc = require("../../../public/native/doc.js");
const { richToText, readableHtml, countWords } = require("./text");

const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_PAGE_TEXT = 15000;

function meta(html, name) {
  const re = new RegExp('<meta[^>]+(?:name|property)=["\']' + name.replace(":", "\\:") + '["\'][^>]*>', "i");
  const tag = re.exec(html);
  if (!tag) return "";
  const c = /content=["']([^"']*)["']/i.exec(tag[0]);
  return c ? Doc.decodeEntities(c[1]).trim() : "";
}

/** schema.org Product / Offer facts from JSON-LD blocks. */
function productFacts(html) {
  const facts = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  const visit = (node) => {
    if (!node || typeof node !== "object" || facts.length >= 30) return;
    if (Array.isArray(node)) return node.forEach(visit);
    const type = [].concat(node["@type"] || []).join(",");
    if (/Product|Car|Vehicle|Offer/i.test(type)) {
      const offers = [].concat(node.offers || []);
      const offer = offers[0] && typeof offers[0] === "object" ? offers[0] : {};
      const price = offer.price || offer.lowPrice || node.price;
      const currency = offer.priceCurrency || node.priceCurrency || "";
      const f = {
        type: type.slice(0, 40),
        name: String(node.name || "").slice(0, 160),
        brand: String((node.brand && (node.brand.name || node.brand)) || "").slice(0, 80),
        price: price ? String(price).slice(0, 30) + (currency ? " " + currency : "") : "",
        description: String(node.description || "").replace(/\s+/g, " ").slice(0, 400),
      };
      if (f.name || f.price) facts.push(f);
    }
    if (node["@graph"]) visit(node["@graph"]);
  };
  while ((m = re.exec(html))) {
    try {
      visit(JSON.parse(m[1].trim()));
    } catch {
      /* broken JSON-LD is common; skip it */
    }
  }
  return facts;
}

/** Page HTML → { title, description, image, text, facts }. Pure; tested. */
function parsePage(html, finalUrl) {
  const raw = String(html || "");
  const title = meta(raw, "og:title") || Doc.decodeEntities(((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw) || [])[1] || "").trim());
  const description = meta(raw, "og:description") || meta(raw, "description");
  let image = meta(raw, "og:image");
  try {
    image = image ? new URL(image, finalUrl).href : "";
  } catch {
    image = "";
  }
  const clean = Doc.sanitizeRich(readableHtml(raw), 300000);
  let text = richToText(clean);
  if (text.length > MAX_PAGE_TEXT) text = text.slice(0, MAX_PAGE_TEXT) + "\n\n[… resten er kuttet]";
  return { title: title.slice(0, 200), description: description.slice(0, 400), image, text, facts: productFacts(raw), words: countWords(text) };
}

module.exports = { parsePage, productFacts, MAX_PAGE_BYTES };
