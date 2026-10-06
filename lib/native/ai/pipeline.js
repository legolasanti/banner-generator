"use strict";

/* =========================================================================
 * ai/pipeline.js — the AI mode, step by step.
 *
 *   analyze   material (docs, pages, notes, photos) → summary, facts, quotes,
 *             photo descriptions, angles, gaps and the QUESTIONS to ask
 *   outline   analysis + answers → three headlines and a section plan
 *   write     one section of the plan → a real section (validated, with one
 *             repair round when it breaks a limit)
 *   rewrite   one field → three alternatives (shorter, warmer, fix …)
 *   alt       one photo → alt text
 *   image     prompt (+ reference photos) → a generated illustration
 *
 * Photos are shown to the model as short ids (B1, B2 …) mapped to asset ids
 * here, so the model can never point at a file the project does not have.
 * Every call is logged (step, model, tokens, cost) in the project.
 * ========================================================================= */

const S = require("../../../public/native/schema.js");
const Doc = require("../../../public/native/doc.js");
const prompts = require("./prompts");
const schemas = require("./schemas");
const validate = require("./validate");
const openrouter = require("./openrouter");
const { UserError } = require("../fsutil");

const MAX_IMAGES = 14;
const MAX_SOURCE_CHARS = 110000;
const PREVIEW_PX = 640;

function createPipeline(deps) {
  const { projects, assets, settings } = deps;
  const chat = deps.chat || openrouter.chat;

  async function call(projectId, step, req) {
    const s = await settings.get();
    const result = await chat(Object.assign({ zdr: s.ai.zdr, fallbacks: s.ai.fallbackModels }, req));
    await projects
      .appendAiLog(projectId, {
        step,
        model: result.model,
        promptVersion: prompts.PROMPT_VERSION,
        prompt: result.usage.prompt,
        completion: result.usage.completion,
        cost: result.usage.cost,
      })
      .catch((e) => console.warn("[ai] logg: " + e.message));
    return result;
  }

  /** Short ids for the project's photos (only ones it really has). */
  function imageIdsFor(project, ids) {
    const map = {};
    (Array.isArray(ids) ? ids : [])
      .filter((id) => project.assets[id] && project.assets[id].kind === "image")
      .slice(0, MAX_IMAGES)
      .forEach((id, i) => {
        map["B" + (i + 1)] = id;
      });
    return map;
  }

  /** A map the browser sent back, kept only where it points at real photos. */
  function checkedMap(project, map) {
    const out = {};
    Object.keys(map || {}).forEach((k) => {
      if (/^B\d{1,2}$/.test(k) && project.assets[map[k]] && project.assets[map[k]].kind === "image") out[k] = map[k];
    });
    return out;
  }

  async function imagePart(id) {
    const p = await assets.preview(id, PREVIEW_PX);
    if (!p) return null;
    return { type: "image_url", image_url: { url: "data:" + p.mime + ";base64," + p.buffer.toString("base64") } };
  }

  function cleanSources(list) {
    const sources = (Array.isArray(list) ? list : []).slice(0, 12).map((src) => ({
      label: Doc.cleanText(src && (src.title || src.name || src.kind), 120, false) || "Kilde",
      url: Doc.safeUrl(src && src.url),
      text: Doc.cleanText(src && src.text, 80000, true),
      notes: Array.isArray(src && src.notes) ? src.notes.slice(0, 40).map((n) => Doc.cleanText(n, 600, true)) : [],
      facts: Array.isArray(src && src.facts) ? src.facts.slice(0, 20) : [],
    }));
    // Share the budget so one huge page cannot crowd out the brief.
    const total = sources.reduce((n, s) => n + s.text.length, 0);
    if (total > MAX_SOURCE_CHARS) {
      const ratio = MAX_SOURCE_CHARS / total;
      sources.forEach((s) => {
        const keep = Math.max(2000, Math.floor(s.text.length * ratio));
        if (s.text.length > keep) s.text = s.text.slice(0, keep) + "\n[… kuttet]";
      });
    }
    return sources;
  }

  // ---- 1. analyse ------------------------------------------------------------
  async function analyze(projectId, input) {
    const project = await projects.findById(projectId);
    const s = await settings.get();
    const imageMap = imageIdsFor(project, input.imageIds);
    const shortIds = Object.keys(imageMap);
    const sources = cleanSources(input.sources);
    const brief = Doc.cleanText(input.brief, 20000, true);
    if (!brief.trim() && !sources.some((x) => x.text.trim())) {
      throw new UserError("Legg til minst én kilde: et Google Docs-dokument, en nettside eller en kort brief.");
    }
    const content = [{ type: "text", text: prompts.analyzeUser({ advertiser: project.advertiser.name || input.advertiser, brief, sources, images: shortIds.map((id) => ({ id })) }) }];
    for (const short of shortIds) {
      const part = await imagePart(imageMap[short]);
      if (!part) continue;
      content.push({ type: "text", text: "Bilde " + short + ":" });
      content.push(part);
    }
    const result = await call(projectId, "analyze", {
      model: shortIds.length ? s.ai.visionModel : s.ai.defaultModel,
      messages: [
        { role: "system", content: prompts.ANALYZE_SYSTEM },
        { role: "user", content },
      ],
      json: { name: "native_analysis", schema: schemas.analysisSchema(shortIds) },
      temperature: 0.3,
      maxTokens: 9000,
    });
    const analysis = result.data;
    analysis.questions = (analysis.questions || []).slice(0, 8);
    return { analysis, imageMap, model: result.model, cost: result.usage.cost };
  }

  // ---- 2. outline ----------------------------------------------------------------
  async function outline(projectId, input) {
    const project = await projects.findById(projectId);
    const s = await settings.get();
    const imageMap = checkedMap(project, input.imageMap);
    if (!input.analysis || typeof input.analysis !== "object") throw new UserError("Kjør analysen først");
    const result = await call(projectId, "outline", {
      model: s.ai.defaultModel,
      messages: [
        { role: "system", content: prompts.OUTLINE_SYSTEM },
        {
          role: "user",
          content: prompts.outlineUser({
            advertiser: project.advertiser.name,
            analysis: input.analysis,
            answers: input.answers,
            angle: Doc.cleanText(input.angle, 400, false),
            brief: Doc.cleanText(input.brief, 20000, true),
            length: Doc.cleanText(input.length, 60, false),
          }),
        },
      ],
      json: { name: "native_outline", schema: schemas.outlineSchema(Object.keys(imageMap)) },
      temperature: 0.6,
      maxTokens: 5000,
    });
    const plan = result.data;
    const allowed = S.aiBlockTypes();
    plan.sections = (plan.sections || []).filter((x) => allowed.includes(x.type)).slice(0, 16);
    if (!plan.sections.length || plan.sections[0].type !== "hero") plan.sections.unshift({ type: "hero", purpose: "Åpning med tittel og ingress.", imageIds: [] });
    return { outline: plan, imageMap, model: result.model, cost: result.usage.cost };
  }

  // ---- 3. write one section ---------------------------------------------------------
  async function write(projectId, input) {
    const project = await projects.findById(projectId);
    const s = await settings.get();
    const imageMap = checkedMap(project, input.imageMap);
    const plan = input.outline;
    const index = Number(input.index);
    if (!plan || !Array.isArray(plan.sections) || !plan.sections[index]) throw new UserError("Ukjent seksjon i planen");
    const type = plan.sections[index].type;
    if (!S.aiBlockTypes().includes(type)) throw new UserError("Denne seksjonstypen kan ikke skrives av AI");
    const shortIds = Object.keys(imageMap);
    const messages = [
      { role: "system", content: prompts.writeSystem(type) },
      {
        role: "user",
        content: prompts.writeUser({
          advertiser: project.advertiser.name,
          title: Doc.cleanText(input.title, 200, false),
          outline: plan,
          index,
          analysis: input.analysis || {},
          answers: input.answers,
          angle: Doc.cleanText(input.angle, 400, false),
          previous: Doc.cleanText(input.previous, 6000, true),
          sourceText: Doc.cleanText(input.sourceText, 30000, true),
        }),
      },
    ];
    const req = {
      model: s.ai.defaultModel,
      json: { name: "native_section_" + type, schema: schemas.sectionSchema(type, shortIds) },
      temperature: 0.7,
      maxTokens: 6000,
    };
    const base = { assets: project.assets, imageMap, style: (S.BLOCKS[type].style || {}) };
    let result = await call(projectId, "write:" + type, Object.assign({ messages }, req));
    let out = validate.toSection(type, result.data, base);
    let cost = result.usage.cost;
    if (out.problems.length) {
      const retry = messages.concat([
        { role: "assistant", content: JSON.stringify(result.data) },
        { role: "user", content: prompts.repairUser(out.problems) },
      ]);
      result = await call(projectId, "repair:" + type, Object.assign({ messages: retry }, req));
      cost += result.usage.cost;
      const second = validate.toSection(type, result.data, base);
      if (second.problems.length <= out.problems.length) out = second;
    }
    return Object.assign(out, { model: result.model, cost });
  }

  // ---- tools ------------------------------------------------------------------------
  async function rewrite(projectId, input) {
    await projects.findById(projectId);
    const s = await settings.get();
    const type = S.BLOCKS[input.type] ? input.type : null;
    const f = type ? S.field(type, String(input.field || "").split(".").pop()) || null : null;
    let field = f;
    if (type && !field) {
      // List item fields: "items.<id>.text" → the sub-field definition.
      S.fieldsOf(type).forEach((lf) => {
        if (lf.type === "list") lf.item.forEach((sub) => {
          if (sub.key === String(input.field || "").split(".").pop()) field = sub;
        });
      });
    }
    const text = Doc.cleanText(input.text, 40000, true);
    if (!text.trim()) throw new UserError("Det er ingen tekst å omskrive");
    const rich = field && field.type === "rich";
    const max = field && field.max ? field.max : 0;
    const result = await call(projectId, "rewrite:" + (input.instruction || "custom"), {
      model: s.ai.defaultModel,
      messages: [
        { role: "system", content: prompts.REWRITE_SYSTEM + (rich ? "\n- The text is HTML (p, h2, h3, ul/li, strong, em, a, blockquote). Return valid HTML using only those tags." : "") },
        {
          role: "user",
          content: prompts.rewriteUser({
            fieldLabel: field ? field.label : "Tekst",
            max,
            instruction: input.instruction,
            custom: Doc.cleanText(input.custom, 600, true),
            context: Doc.cleanText(input.context, 8000, true),
            facts: Doc.cleanText(input.facts, 6000, true),
            text,
          }),
        },
      ],
      json: { name: "native_rewrite", schema: schemas.rewriteSchema(max) },
      temperature: 0.8,
      maxTokens: rich ? 9000 : 2500,
    });
    const variants = (result.data.variants || []).slice(0, 3).map((v) => {
      const value = rich ? Doc.sanitizeRich(v, S.HARD_MAX.rich) : Doc.cleanText(v, S.HARD_MAX.textarea, true);
      const length = rich ? Doc.plainText(value).length : value.length;
      return { value, length, over: max ? length > max : false };
    });
    return { variants, max, cost: result.usage.cost };
  }

  async function alt(projectId, assetId) {
    const project = await projects.findById(projectId);
    const s = await settings.get();
    if (!project.assets[assetId] || project.assets[assetId].kind !== "image") throw new UserError("Fant ikke bildet i prosjektet");
    const part = await imagePart(assetId);
    if (!part) throw new UserError("Fant ikke bildefilen");
    const result = await call(projectId, "alt", {
      model: s.ai.visionModel,
      messages: [
        { role: "system", content: prompts.ALT_SYSTEM },
        { role: "user", content: [{ type: "text", text: "Skriv alt-tekst for dette bildet. Saken handler om: " + (project.name || "") }, part] },
      ],
      json: { name: "native_alt", schema: schemas.altSchema() },
      temperature: 0.2,
      maxTokens: 600,
    });
    return { alt: Doc.cleanText(result.data.alt, 200, false), description: Doc.cleanText(result.data.description, 600, true), cost: result.usage.cost };
  }

  /**
   * Generate an illustration. Reference photos (the advertiser's product
   * shots) steer it. The prompt forbids text in the image — copy belongs in
   * the page, where it can be read, translated and corrected.
   */
  async function image(projectId, input) {
    const project = await projects.findById(projectId);
    const s = await settings.get();
    const prompt = Doc.cleanText(input.prompt, 2000, true).trim();
    if (prompt.length < 8) throw new UserError("Beskriv bildet du vil ha");
    const aspect = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"].includes(input.aspect) ? input.aspect : "16:9";
    const refs = (Array.isArray(input.referenceIds) ? input.referenceIds : [])
      .filter((id) => project.assets[id] && project.assets[id].kind === "image")
      .slice(0, 4);
    const content = [
      {
        type: "text",
        text:
          "Create a photorealistic editorial image for a Norwegian magazine article. Aspect ratio " + aspect +
          ". No text, letters, logos or watermarks in the image. Natural light, realistic Scandinavian setting unless told otherwise.\n\n" +
          prompt + (refs.length ? "\n\nUse the attached reference photos for the product's exact look." : ""),
      },
    ];
    for (const id of refs) {
      const part = await imagePart(id);
      if (part) content.push(part);
    }
    const result = await call(projectId, "image", {
      model: s.ai.imageModel,
      fallbacks: [],
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
      temperature: 0.9,
      timeoutMs: 240000,
    });
    if (!result.images.length) throw new UserError("Modellen laget ikke noe bilde. Prøv en annen beskrivelse.");
    const buf = Buffer.from(result.images[0].split(",")[1], "base64");
    const asset = await assets.storeImage(buf, { name: "ai-" + Doc.slugify(prompt.slice(0, 40), "bilde"), source: "ai" });
    asset.ai = { model: result.model, prompt };
    asset.alt = "";
    return { asset, cost: result.usage.cost };
  }

  return { analyze, outline, write, rewrite, alt, image, imageIdsFor };
}

module.exports = { createPipeline };
