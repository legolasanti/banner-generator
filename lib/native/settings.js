"use strict";

/* =========================================================================
 * settings.js — Native Premium settings shared by every project.
 *
 * The publisher's fixed furniture lives here, not in projects: the
 * disclosure label ("Annonsørinnhold fra {annonsør}"), the footer text, the
 * publisher and studio logos, the public address pages are published under,
 * the measurement snippets (Kilkaya, Mixpanel, GTM …) and the AI model
 * choices. A project can therefore never ship without the current wording.
 *
 * Stored as data/native/settings.json; the API key for OpenRouter is NOT
 * here — it comes from the environment (OPENROUTER_API_KEY).
 * ========================================================================= */

const path = require("path");

const Doc = require("../../public/native/doc.js");
const { readJson, writeJsonAtomic } = require("./fsutil");

const DEFAULT_FOOTER =
  "Journalistene og redaksjonen i ABC Nyheter har ingen rolle i produksjonen og publiseringen av dette annonsørinnholdet.\n\n" +
  "ABC BrandStudio er en avdeling i ABC Startsiden AS. I samarbeid med annonsør utvikler ABC Brand Studio innhold, som publiseres på alle " +
  "plattformer til ABC Startsiden og i sosiale medier. Annonsøren kan også publisere innholdet på egne flater. Innhold laget av ABC Brand " +
  "Studio er tydelig merket, så leseren klart kan oppfatte at innholdet er betalt og produsert i samarbeid med en annonsør.";

const DEFAULT_AI = {
  defaultModel: "anthropic/claude-sonnet-5.5",
  fallbackModels: ["google/gemini-3.8-flash", "openai/gpt-5.6-terra"],
  fastModel: "google/gemini-3.1-flash-lite",
  visionModel: "anthropic/claude-sonnet-5.5",
  imageModel: "google/gemini-3.1-flash-image",
  zdr: true,
};

const DEFAULTS = {
  disclosureLabel: "Annonsørinnhold fra {annonsør}",
  publisherName: "ABC Nyheter",
  publisherUrl: "https://www.abcnyheter.no/",
  publisherLogo: "",
  siteName: "ABC Nyheter",
  studioName: "ABC BrandStudio",
  studioLogo: "",
  footerText: DEFAULT_FOOTER,
  publicBaseUrl: "",
  headHtml: "",
  bodyHtml: "",
  utmSource: "abcnyheter",
  utmMedium: "native",
  assets: {},
  ai: DEFAULT_AI,
};

const MODEL_RE = /^~?[a-z0-9][\w.-]*\/[\w.:-]+$/i;

function model(v, dflt) {
  return typeof v === "string" && MODEL_RE.test(v.trim()) && v.length < 120 ? v.trim() : dflt;
}

function normalizeAi(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const fallbacks = Array.isArray(src.fallbackModels) ? src.fallbackModels : DEFAULT_AI.fallbackModels;
  return {
    defaultModel: model(src.defaultModel, DEFAULT_AI.defaultModel),
    fallbackModels: fallbacks.map((m) => model(m, "")).filter(Boolean).slice(0, 3),
    fastModel: model(src.fastModel, DEFAULT_AI.fastModel),
    visionModel: model(src.visionModel, DEFAULT_AI.visionModel),
    imageModel: model(src.imageModel, DEFAULT_AI.imageModel),
    zdr: src.zdr !== false,
  };
}

/** Rebuild settings from untrusted JSON; unknown keys are dropped. */
function normalizeSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const assets = {};
  const rawAssets = src.assets && typeof src.assets === "object" ? src.assets : {};
  Object.keys(rawAssets)
    .filter((id) => Doc.isAssetId(id) && Doc.assetKind(id) === "image")
    .slice(0, 20)
    .forEach((id) => {
      assets[id] = Doc.normalizeAsset(id, Object.assign({}, rawAssets[id], { source: "settings" }));
    });
  const logo = (v) => (typeof v === "string" && assets[v] ? v : "");
  const text = (v, max, dflt, multiline) => (v === undefined ? dflt : Doc.cleanText(v, max, !!multiline));
  let label = text(src.disclosureLabel, 120, DEFAULTS.disclosureLabel).trim();
  // The label must always name the advertiser.
  if (!label.includes("{annonsør}")) label = DEFAULTS.disclosureLabel;
  let base = Doc.safeUrl(src.publicBaseUrl);
  if (!/^https?:\/\//.test(base)) base = "";
  return {
    disclosureLabel: label,
    publisherName: text(src.publisherName, 60, DEFAULTS.publisherName).trim() || DEFAULTS.publisherName,
    publisherUrl: src.publisherUrl === undefined ? DEFAULTS.publisherUrl : Doc.safeUrl(src.publisherUrl),
    publisherLogo: logo(src.publisherLogo),
    siteName: text(src.siteName, 60, DEFAULTS.siteName),
    studioName: text(src.studioName, 60, DEFAULTS.studioName),
    studioLogo: logo(src.studioLogo),
    footerText: text(src.footerText, 3000, DEFAULTS.footerText, true).trim() || DEFAULTS.footerText,
    publicBaseUrl: base.replace(/\/+$/, ""),
    headHtml: text(src.headHtml, 20000, "", true),
    bodyHtml: text(src.bodyHtml, 20000, "", true),
    utmSource: text(src.utmSource, 60, DEFAULTS.utmSource).replace(/[^a-z0-9_.-]/gi, "").toLowerCase(),
    utmMedium: text(src.utmMedium, 60, DEFAULTS.utmMedium).replace(/[^a-z0-9_.-]/gi, "").toLowerCase(),
    assets,
    ai: normalizeAi(src.ai),
  };
}

function createSettingsStore(dataDir) {
  const file = path.join(dataDir, "settings.json");
  let cache = null;

  async function get() {
    if (cache) return cache;
    cache = normalizeSettings(await readJson(file, {}));
    return cache;
  }

  async function save(raw) {
    const next = normalizeSettings(raw);
    await writeJsonAtomic(file, next);
    cache = next;
    return next;
  }

  return { get, save };
}

module.exports = { createSettingsStore, normalizeSettings, DEFAULTS, DEFAULT_AI };
