"use strict";

/* =========================================================================
 * ai/routes.js — the AI mode's API (see pipeline.js for what each step does).
 *
 *   GET  /api/native/ai/status          is a key configured? which models?
 *   GET  /api/native/ai/models          OpenRouter's model list (for Settings)
 *   POST /api/native/ai/analyze         {projectId, brief, sources, imageIds}
 *   POST /api/native/ai/outline         {projectId, analysis, answers, imageMap, …}
 *   POST /api/native/ai/write           {projectId, outline, index, …} → one section
 *   POST /api/native/ai/rewrite         {projectId, type, field, text, instruction}
 *   POST /api/native/ai/revise          {projectId, pageId, instruction, history, selected, tier}
 *   POST /api/native/ai/view            {projectId, pageId} → the page as the assistant reads it
 *   POST /api/native/ai/alt             {projectId, assetId}
 *   POST /api/native/ai/image           {projectId, prompt, aspect, referenceIds}
 *   GET  /api/native/projects/:id/ai    calls and cost so far
 * ========================================================================= */

const { createPipeline } = require("./pipeline");
const openrouter = require("./openrouter");
const { handle } = require("../routes");
const { modelForTier } = require("../settings");

// What the quality levels mean, for the pickers (cost from the 2026-10-15 benchmark).
const TIER_INFO = [
  { id: "okonomi", label: "Økonomi", help: "Billigst. Godt norsk, men tregere. ≈ 0,5 kr per side." },
  { id: "standard", label: "Standard", help: "Best tekst for pengene. ≈ 3 kr per side." },
  { id: "premium", label: "Premium", help: "Skarpest spørsmål og plan. ≈ 7 kr per side." },
];

function registerAiRoutes(app, deps) {
  const pipeline = createPipeline(deps);
  const pid = (req) => String((req.body || {}).projectId || "");

  app.get("/api/native/ai/status", handle("aiStatus", "Kunne ikke hente AI-status", async (req, res) => {
    const s = await deps.settings.get();
    res.json({ configured: openrouter.isConfigured(), models: s.ai, tiers: TIER_INFO.map((t) => Object.assign({ model: modelForTier(s.ai, t.id) }, t)), drive: process.env.GOOGLE_API_KEY ? "api" : "embed" });
  }));

  app.get("/api/native/ai/models", handle("aiModels", "Kunne ikke hente modellene", async (req, res) => {
    const list = await openrouter.listModels();
    res.json({ models: list.map(({ params, ...m }) => m) });
  }));

  app.post("/api/native/ai/analyze", handle("aiAnalyze", "Analysen feilet", async (req, res) => {
    res.json(await pipeline.analyze(pid(req), req.body || {}));
  }));

  app.post("/api/native/ai/outline", handle("aiOutline", "Planen feilet", async (req, res) => {
    res.json(await pipeline.outline(pid(req), req.body || {}));
  }));

  app.post("/api/native/ai/write", handle("aiWrite", "Skrivingen feilet", async (req, res) => {
    res.json(await pipeline.write(pid(req), req.body || {}));
  }));

  app.post("/api/native/ai/rewrite", handle("aiRewrite", "Omskrivingen feilet", async (req, res) => {
    res.json(await pipeline.rewrite(pid(req), req.body || {}));
  }));

  app.post("/api/native/ai/revise", handle("aiRevise", "Endringen feilet", async (req, res) => {
    res.json(await pipeline.revise(pid(req), req.body || {}));
  }));

  app.post("/api/native/ai/view", handle("aiView", "Kunne ikke vise koden", async (req, res) => {
    res.json(await pipeline.view(pid(req), req.body || {}));
  }));

  app.post("/api/native/ai/alt", handle("aiAlt", "Kunne ikke lage alt-tekst", async (req, res) => {
    res.json(await pipeline.alt(pid(req), String((req.body || {}).assetId || "")));
  }));

  app.post("/api/native/ai/image", handle("aiImage", "Bildet kunne ikke lages", async (req, res) => {
    res.json(await pipeline.image(pid(req), req.body || {}));
  }));

  app.get("/api/native/projects/:id/ai", handle("aiUsage", "Kunne ikke hente AI-bruken", async (req, res) => {
    res.json(await deps.projects.aiUsage(req.params.id));
  }));

  return pipeline;
}

module.exports = { registerAiRoutes };
