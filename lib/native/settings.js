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

// Three quality levels the user picks per job (wizard and assistant). Chosen
// from a benchmark on a real brief (Ford Puma, 2026-10-15), full page ≈
// analysis + plan + 10 sections:
//   okonomi   DeepSeek V4.1 Flash   ≈ $0.04 / side – good bokmål, slower
//   standard  Claude Sonnet 5.5     ≈ $0.30 / side – best prose per krone
//   premium   Claude Opus 5.5       ≈ $0.70 / side – sharpest questions/plans
// All three read images, so photos go to the chosen model directly.
const TIERS = ["okonomi", "standard", "premium"];

const DEFAULT_AI = {
  defaultTier: "standard",
  economyModel: "deepseek/deepseek-v4.1-flash",
  defaultModel: "anthropic/claude-sonnet-5.5",
  premiumModel: "anthropic/claude-opus-5.5",
  fallbackModels: ["anthropic/claude-haiku-5.5", "deepseek/deepseek-v4.1-flash"],
  fastModel: "anthropic/claude-haiku-5.5",
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
    defaultTier: TIERS.includes(src.defaultTier) ? src.defaultTier : DEFAULT_AI.defaultTier,
    economyModel: model(src.economyModel, DEFAULT_AI.economyModel),
    defaultModel: model(src.defaultModel, DEFAULT_AI.defaultModel),
    premiumModel: model(src.premiumModel, DEFAULT_AI.premiumModel),
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

/** The model for a quality level ("okonomi" | "standard" | "premium"). */
function modelForTier(ai, tier) {
  const t = TIERS.includes(tier) ? tier : ai.defaultTier;
  if (t === "okonomi") return ai.economyModel;
  if (t === "premium") return ai.premiumModel;
  return ai.defaultModel;
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

module.exports = { createSettingsStore, normalizeSettings, modelForTier, DEFAULTS, DEFAULT_AI, TIERS };
