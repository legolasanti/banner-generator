"use strict";

/* =========================================================================
 * ai/openrouter.js — the one place that talks to OpenRouter.
 *
 * OpenRouter is an OpenAI-compatible gateway in front of Claude, GPT, Gemini,
 * DeepSeek and others; the team picks models in Settings. Every request:
 *   - carries the key from OPENROUTER_API_KEY (never sent to the browser)
 *   - asks for zero data retention and no training on the prompt
 *     (provider.zdr / data_collection: "deny") — briefs are confidential
 *   - lists fallback models, so one provider's outage does not stop work
 *   - for JSON answers, sends a strict JSON schema, requires providers that
 *     honour it, and enables OpenRouter's response-healing plugin
 *   - returns the cost OpenRouter reports, so spend can be shown per project
 *   - sends sampling settings (temperature) only to models that accept them:
 *     newer Claude and Gemini models reject temperature, and with
 *     require_parameters OpenRouter then finds no provider at all (404)
 *
 * OPENROUTER_BASE_URL may point elsewhere (the tests run a local stub).
 * ========================================================================= */

const DEFAULT_BASE = "https://openrouter.ai/api/v1";
const TIMEOUT_MS = 180000;
const MODEL_CACHE_MS = 6 * 3600 * 1000;
const MODEL_FAIL_MS = 60 * 1000;

let modelCache = { at: 0, list: null, pending: null };

class AiError extends Error {
  constructor(message, status, usage) {
    super(message);
    this.safe = true;
    this.status = status || 502;
    // What a failed call still cost (a truncated answer is billed in full).
    if (usage) this.usage = usage;
  }
}

function usageOf(payload, fallbackModel) {
  const u = (payload && payload.usage) || {};
  return {
    model: (payload && payload.model) || fallbackModel,
    prompt: u.prompt_tokens || 0,
    completion: u.completion_tokens || 0,
    reasoning: (u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens) || 0,
    cost: typeof u.cost === "number" ? u.cost : 0,
  };
}

function baseUrl() {
  return (process.env.OPENROUTER_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
}

function isConfigured() {
  return !!process.env.OPENROUTER_API_KEY;
}

function friendlyStatus(status, detail) {
  if (status === 401 || status === 403) return "OpenRouter avviste API-nøkkelen. Sjekk OPENROUTER_API_KEY.";
  if (status === 402) return "OpenRouter-kontoen er tom for kreditt.";
  if (status === 429) return "For mange forespørsler mot AI-tjenesten akkurat nå. Prøv igjen om litt.";
  if (status === 400 && /schema|response_format|structured/i.test(detail || "")) {
    return "Den valgte modellen støtter ikke strukturerte svar. Velg en annen modell i Innstillinger.";
  }
  if (status === 404 && /model/i.test(detail || "")) return "Modellen finnes ikke hos OpenRouter. Sjekk modellnavnet i Innstillinger.";
  return "AI-tjenesten svarte med en feil (" + status + "). Prøv igjen.";
}

/** Model output → JSON, tolerating a Markdown fence around it. */
function parseJson(text) {
  let s = String(text || "").trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fence) s = fence[1];
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end > start) s = s.slice(start, end + 1);
  }
  try {
    return JSON.parse(s);
  } catch {
    throw new AiError("AI-svaret kunne ikke tolkes. Prøv igjen.");
  }
}

/**
 * @param {Object} req
 * @param {string}   req.model         first choice
 * @param {string[]} [req.fallbacks]   tried in order if it fails
 * @param {Array}    req.messages      OpenAI-style messages (content may be an array with image_url parts)
 * @param {{name: string, schema: Object}} [req.json]  strict JSON schema for the answer
 * @param {boolean}  [req.zdr=true]
 * @param {number}   [req.temperature]
 * @param {number}   [req.maxTokens]
 * @param {string[]} [req.modalities]  e.g. ["image", "text"] for image output
 * @param {Object}   [req.reasoning]   e.g. {effort: "low"}; sent only to models that accept it
 * @param {Array}    [req.plugins]     extra OpenRouter plugins (e.g. file-parser for PDFs)
 * @returns {Promise<{data: any, text: string, model: string, usage: Object, images: string[]}>}
 */
async function chat(req) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AiError("AI er ikke satt opp: OPENROUTER_API_KEY mangler i .env-filen.", 503);
  const models = [req.model].concat(req.fallbacks || []).filter((m, i, all) => m && all.indexOf(m) === i);
  const body = {
    model: models[0],
    messages: req.messages,
    usage: { include: true },
    provider: {
      data_collection: "deny",
      zdr: req.zdr !== false,
      require_parameters: !!req.json,
      allow_fallbacks: true,
    },
  };
  if (models.length > 1) body.models = models;
  // Thinking models spend part of max_tokens on reasoning; keep it bounded
  // per step and never send the reasoning text back.
  if (req.reasoning && (await allSupport(models, "reasoning"))) body.reasoning = Object.assign({ exclude: true }, req.reasoning);
  // With thinking on, Anthropic accepts no temperature but the default.
  const temperature = req.temperature === undefined ? 0.7 : req.temperature;
  if (!body.reasoning && (await allSupport(models, "temperature"))) body.temperature = temperature;
  if (req.maxTokens) req = Object.assign({}, req, { maxTokens: await capTokens(models, req.maxTokens) });
  if (req.maxTokens) body.max_tokens = req.maxTokens;
  if (req.modalities) body.modalities = req.modalities;
  const plugins = Array.isArray(req.plugins) ? req.plugins.slice() : [];
  if (req.json) {
    body.response_format = { type: "json_schema", json_schema: { name: req.json.name, strict: true, schema: req.json.schema } };
    plugins.push({ id: "response-healing" });
  }
  if (plugins.length) body.plugins = plugins;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs || TIMEOUT_MS);
  let res;
  try {
    res = await fetch(baseUrl() + "/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://abcnyheter.no/abc-design",
        "X-OpenRouter-Title": "ABC design",
        "X-Title": "ABC design",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err && err.name === "AbortError") throw new AiError("AI-tjenesten brukte for lang tid. Prøv igjen.", 504);
    throw new AiError("Fikk ikke kontakt med AI-tjenesten. Sjekk nettilkoblingen.", 502);
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }
  if (!res.ok || !payload || payload.error) {
    const detail = payload && payload.error ? JSON.stringify(payload.error).slice(0, 400) : raw.slice(0, 400);
    console.error("[ai] OpenRouter " + res.status + ": " + detail);
    throw new AiError(friendlyStatus(payload && payload.error && payload.error.code ? Number(payload.error.code) || res.status : res.status, detail));
  }
  const choice = payload.choices && payload.choices[0];
  const msg = (choice && choice.message) || {};
  const text = typeof msg.content === "string" ? msg.content : Array.isArray(msg.content) ? msg.content.map((p) => p.text || "").join("") : "";
  const usage = usageOf(payload, models[0]);
  if (choice && choice.finish_reason === "length" && req.json) {
    throw new AiError("AI-svaret ble for langt og ble kuttet. Prøv igjen, eventuelt med kortere kilder.", 502, usage);
  }
  const images = (msg.images || [])
    .map((im) => (im && im.image_url && im.image_url.url) || "")
    .filter((u) => /^data:image\/(png|jpeg|webp);base64,/.test(u));
  let data = null;
  if (req.json) {
    try {
      data = parseJson(text);
    } catch (err) {
      err.usage = usage;
      throw err;
    }
  }
  return { data, text, images, model: usage.model, usage };
}

async function fetchModels() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(baseUrl() + "/models", { signal: ctrl.signal });
    if (!res.ok) throw new AiError("Kunne ikke hente modellisten");
    const data = await res.json();
    return (data.data || []).map((m) => {
      const params = m.supported_parameters || [];
      return {
        id: m.id,
        name: m.name,
        context: m.context_length || 0,
        input: m.pricing ? Number(m.pricing.prompt) * 1e6 : null,
        output: m.pricing ? Number(m.pricing.completion) * 1e6 : null,
        vision: !!(m.architecture && (m.architecture.input_modalities || []).includes("image")),
        files: !!(m.architecture && (m.architecture.input_modalities || []).includes("file")),
        imageOut: !!(m.architecture && (m.architecture.output_modalities || []).includes("image")),
        structured: params.includes("structured_outputs") || params.includes("response_format"),
        maxOut: (m.top_provider && Number(m.top_provider.max_completion_tokens)) || 0,
        params,
      };
    });
  } catch (err) {
    if (err && err.safe) throw err;
    throw new AiError("Kunne ikke hente modellisten fra OpenRouter");
  } finally {
    clearTimeout(timer);
  }
}

/** The models OpenRouter offers right now (Settings picker, capability checks). Cached. */
async function listModels() {
  if (modelCache.list && Date.now() - modelCache.at < MODEL_CACHE_MS) return modelCache.list;
  // A failing catalogue is not asked again on every call for a minute.
  if (modelCache.failedAt && Date.now() - modelCache.failedAt < MODEL_FAIL_MS) throw new AiError("Kunne ikke hente modellisten fra OpenRouter");
  if (!modelCache.pending) {
    modelCache.pending = fetchModels()
      .then((list) => {
        modelCache = { at: Date.now(), list, pending: null };
        return list;
      })
      .catch((err) => {
        modelCache.pending = null;
        if (!modelCache.failedAt) console.warn("[ai] modellisten er utilgjengelig: " + err.message);
        modelCache.failedAt = Date.now();
        throw err;
      });
  }
  return modelCache.pending;
}

/** One model's entry from the list, or null when unknown / list unavailable. */
async function modelInfo(id) {
  const list = await listModels().catch(() => null);
  if (!list) return null;
  const bare = String(id || "").replace(/:(batch|free|nitro|floor|online)$/, "");
  return list.find((m) => m.id === id) || list.find((m) => m.id === bare) || null;
}

/** True only when every model is known to accept `param`. Unknown → false (safe: omit it). */
async function allSupport(models, param) {
  for (const id of models) {
    const info = await modelInfo(id);
    if (!info || !info.params.includes(param)) return false;
  }
  return true;
}

/** max_tokens no higher than the smallest known output limit in the chain. */
async function capTokens(models, wanted) {
  let cap = wanted;
  for (const id of models) {
    const info = await modelInfo(id);
    if (info && info.maxOut > 0) cap = Math.min(cap, info.maxOut);
  }
  return cap;
}

/** Test hook: forget the cached model list. */
function resetModelCache() {
  modelCache = { at: 0, list: null, pending: null };
}

module.exports = { chat, listModels, modelInfo, allSupport, resetModelCache, isConfigured, parseJson, AiError };
