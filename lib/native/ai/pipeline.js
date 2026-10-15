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
 *   revise    the finished page + an instruction in plain words → a reply,
 *             questions when unclear, and operations applied to the page
 *             (see revise.js)
 *   alt       one photo → alt text
 *   image     prompt (+ reference photos) → a generated illustration
 *
 * Photos are shown to the model as short ids (B1, B2 …) mapped to asset ids
 * here, so the model can never point at a file the project does not have.
 * Every call is logged (step, model, tokens, cost) in the project.
 *
 * Each request may carry `tier` ("okonomi" | "standard" | "premium"), which
 * picks the model (settings.modelForTier). A chosen template (`templateId`)
 * makes the plan follow its structure and gives each written section the
 * template section's design (layout, sizes, background, animation).
 * ========================================================================= */

const S = require("../../../public/native/schema.js");
const Doc = require("../../../public/native/doc.js");
const Templates = require("../../../public/native/templates.js");
const Revise = require("./revise");
const { modelForTier } = require("../settings");
const prompts = require("./prompts");
const schemas = require("./schemas");
const validate = require("./validate");
const openrouter = require("./openrouter");
const { UserError } = require("../fsutil");

// Per step: how hard thinking models may think, and the answer budget
// (reasoning tokens count against max_tokens, so the budget leaves room).
const STEP_LIMITS = {
  analyze: { reasoning: { effort: "medium" }, maxTokens: 32000 },
  outline: { reasoning: { effort: "medium" }, maxTokens: 20000 },
  write: { reasoning: { effort: "low" }, maxTokens: 16000 },
  repair: { reasoning: { effort: "low" }, maxTokens: 16000 },
  rewrite: { reasoning: { effort: "low" }, maxTokens: 12000 },
  revise: { reasoning: { effort: "medium" }, maxTokens: 32000 },
  alt: { reasoning: { effort: "low" }, maxTokens: 4000 },
};

const MAX_IMAGES = 14;
const MAX_HISTORY = 10;
const DESIGN_TYPES = ["select", "toggle", "number", "color"];
const MAX_SOURCE_CHARS = 110000;
const PREVIEW_PX = 640;

function createPipeline(deps) {
  const { projects, assets, settings } = deps;
  const chat = deps.chat || openrouter.chat;
  // With an injected chat (tests) there is no model list to ask.
  const modelInfo = deps.modelInfo || (deps.chat ? async () => null : openrouter.modelInfo);

  function tierModel(s, input) {
    return modelForTier(s.ai, input && input.tier);
  }

  /** The tier's model if it can see images, else the dedicated vision model. */
  async function visionModelFor(s, input) {
    const m = tierModel(s, input);
    const info = await modelInfo(m).catch(() => null);
    return info && info.vision ? m : s.ai.visionModel;
  }

  function templateOf(input) {
    return input && input.templateId ? Templates.find(String(input.templateId)) : null;
  }

  /**
   * A template section's design for a written section of `type`: its layout
   * fields (select/toggle/number/colour) and its style, with demo photos
   * removed. Null when the index does not point at a section of that type.
   */
  function templateDesign(tpl, index, type) {
    const raw = tpl && Number.isInteger(index) && index >= 0 ? tpl.sections[index] : null;
    if (!raw || raw.type !== type) return null;
    const sec = Templates.expand({ sections: [raw] }, {}).sections[0];
    const props = {};
    S.fieldsOf(type).forEach((f) => {
      if (DESIGN_TYPES.includes(f.type) && sec.props && sec.props[f.key] !== undefined) props[f.key] = sec.props[f.key];
    });
    return { props, style: Object.assign({}, S.BLOCKS[type].style || {}, sec.style || {}), sample: raw };
  }

  function logCall(projectId, step, usage, failed) {
    return projects
      .appendAiLog(projectId, {
        step: failed ? step + ":feilet" : step,
        model: usage.model,
        promptVersion: prompts.PROMPT_VERSION,
        prompt: usage.prompt,
        completion: usage.completion,
        cost: usage.cost,
      })
      .catch((e) => console.warn("[ai] logg: " + e.message));
  }

  async function call(projectId, step, req) {
    const s = await settings.get();
    const opts = Object.assign({ zdr: s.ai.zdr, fallbacks: s.ai.fallbackModels }, STEP_LIMITS[step.split(":")[0]] || {}, req);
    let result;
    try {
      result = await chat(opts);
    } catch (err) {
      // Failed calls can still be billed (a truncated answer is paid in full).
      if (err && err.usage) await logCall(projectId, step, err.usage, true);
      throw err;
    }
    await logCall(projectId, step, Object.assign({ model: result.model }, result.usage), false);
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
      model: shortIds.length ? await visionModelFor(s, input) : tierModel(s, input),
      messages: [
        { role: "system", content: prompts.ANALYZE_SYSTEM },
        { role: "user", content },
      ],
      json: { name: "native_analysis", schema: schemas.analysisSchema(shortIds) },
      temperature: 0.3,
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
    const template = templateOf(input);
    const result = await call(projectId, "outline", {
      model: tierModel(s, input),
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
            template,
          }),
        },
      ],
      json: { name: "native_outline", schema: schemas.outlineSchema(Object.keys(imageMap)) },
      temperature: 0.6,
    });
    const plan = result.data;
    const allowed = S.aiBlockTypes();
    plan.sections = (plan.sections || [])
      .filter((x) => x && allowed.includes(x.type))
      .slice(0, 16)
      .map((x) => Object.assign({}, x, { templateIndex: template && templateDesign(template, x.templateIndex, x.type) ? x.templateIndex : -1 }));
    if (!plan.sections.length || plan.sections[0].type !== "hero") {
      const heroAt = template ? template.sections.findIndex((x) => x.type === "hero") : -1;
      plan.sections.unshift({ type: "hero", purpose: "Åpning med tittel og ingress.", imageIds: [], templateIndex: heroAt });
    }
    plan.templateId = template ? template.id : "";
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
    const design = templateDesign(templateOf(input) || templateOf(plan), Number(plan.sections[index].templateIndex), type);
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
          templateSection: design ? design.sample : null,
        }),
      },
    ];
    const req = {
      model: tierModel(s, input),
      json: { name: "native_section_" + type, schema: schemas.sectionSchema(type, shortIds) },
      temperature: 0.7,
    };
    const base = { assets: project.assets, imageMap, style: design ? design.style : S.BLOCKS[type].style || {}, baseProps: design ? design.props : {} };
    // The template's layout choices win over the model's.
    const withDesign = (out) =>
      design && Object.keys(design.props).length
        ? Object.assign({}, out, { section: Doc.normalizeSection(Object.assign({}, out.section, { props: Object.assign({}, out.section.props, design.props) }), { assets: project.assets }) })
        : out;
    let result = await call(projectId, "write:" + type, Object.assign({ messages }, req));
    let out = withDesign(validate.toSection(type, result.data, base));
    let cost = result.usage.cost;
    if (out.problems.length) {
      const retry = messages.concat([
        { role: "assistant", content: JSON.stringify(result.data) },
        { role: "user", content: prompts.repairUser(out.problems) },
      ]);
      result = await call(projectId, "repair:" + type, Object.assign({ messages: retry }, req));
      cost += result.usage.cost;
      const second = withDesign(validate.toSection(type, result.data, base));
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
      model: tierModel(s, input),
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
    });
    const variants = (result.data.variants || []).slice(0, 3).map((v) => {
      const value = rich ? Doc.sanitizeRich(v, S.HARD_MAX.rich) : Doc.cleanText(v, S.HARD_MAX.textarea, true);
      const length = rich ? Doc.plainText(value).length : value.length;
      return { value, length, over: max ? length > max : false };
    });
    return { variants, max, cost: result.usage.cost };
  }

  // ---- the assistant ------------------------------------------------------------------
  /**
   * Change the saved page by instruction. The browser saves first, sends the
   * instruction (and the conversation so far), and gets back the new section
   * list (plus theme/extras when those changed) to put in its store — one
   * undo step.
   */
  async function revise(projectId, input) {
    const project = await projects.findById(projectId);
    // The browser saves first and says which version it saw; anything else
    // would revise an older page and overwrite newer edits.
    if (input.rev !== undefined && input.rev !== null && Number(input.rev) !== Number(project.rev)) {
      throw Object.assign(new UserError("Siden er ikke lagret i siste versjon. Vent til den er lagret, og prøv igjen."), { status: 409 });
    }
    const s = await settings.get();
    const page = project.pages.find((p) => p.id === input.pageId) || project.pages[0];
    const instruction = Doc.cleanText(input.instruction, 4000, true).trim();
    if (instruction.length < 2) throw new UserError("Skriv hva du vil endre");
    const ids = Revise.imageIds(project);
    const history = (Array.isArray(input.history) ? input.history : [])
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m && m.role === "assistant" ? "assistant" : "user", text: Doc.cleanText(m && m.text, 2000, true) }))
      .filter((m) => m.text.trim());
    const ai = project.ai || {};
    const sourceText = (Array.isArray(ai.sources) ? ai.sources : [])
      .map((src) => (src.title || src.name || src.url || "Kilde") + ":\n" + String(src.text || "").slice(0, 8000))
      .join("\n\n")
      .slice(0, 24000);
    const selected = page.sections.some((x) => x.id === input.selected) ? input.selected : "";
    const result = await call(projectId, "revise", {
      model: tierModel(s, input),
      messages: [
        { role: "system", content: prompts.reviseSystem() },
        {
          role: "user",
          content: prompts.reviseUser({
            advertiser: project.advertiser.name,
            analysis: ai.analysis && typeof ai.analysis === "object" ? ai.analysis : null,
            sourceText,
            images: Revise.imagesText(project, ids),
            page: Revise.pageView(project, page, ids),
            history,
            selected,
            instruction,
          }),
        },
      ],
      json: { name: "native_revise", schema: schemas.reviseSchema(Revise.OPS) },
      temperature: 0.4,
    });
    const data = result.data || {};
    const questions = (Array.isArray(data.questions) ? data.questions : []).slice(0, 3).map((q) => ({
      id: Doc.cleanText(q && q.id, 10, false) || "Q",
      question: Doc.cleanText(q && q.question, 300, false),
      why: Doc.cleanText(q && q.why, 300, false),
      options: (Array.isArray(q && q.options) ? q.options : []).slice(0, 4).map((o) => Doc.cleanText(o, 200, false)).filter(Boolean),
      suggested: Doc.cleanText(q && q.suggested, 200, false),
    })).filter((q) => q.question);
    const applied = Revise.applyOps(project, page, data.ops, ids);
    const warnings = applied.warnings.concat((Array.isArray(data.warnings) ? data.warnings : []).map((w) => Doc.cleanText(w, 300, false)).filter(Boolean)).slice(0, 20);
    return {
      reply: Doc.cleanText(data.reply, 1200, true),
      questions,
      changes: applied.changes,
      warnings,
      pageId: page.id,
      sections: applied.changes.some((c) => c.sectionId || c.op === "delete" || c.op === "move") ? applied.sections : null,
      theme: applied.theme,
      extras: applied.extras,
      model: result.model,
      cost: result.usage.cost,
    };
  }

  /** The page exactly as the assistant reads it (for "Vis koden"). */
  async function view(projectId, input) {
    const project = await projects.findById(projectId);
    const page = project.pages.find((p) => p.id === (input && input.pageId)) || project.pages[0];
    const ids = Revise.imageIds(project);
    return { page: Revise.pageView(project, page, ids), images: Revise.imagesText(project, ids) };
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

  return { analyze, outline, write, rewrite, revise, view, alt, image, imageIdsFor, templateDesign };
}

module.exports = { createPipeline };
