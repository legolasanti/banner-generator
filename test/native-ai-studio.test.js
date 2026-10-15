"use strict";

// The AI studio additions: quality tiers, model-capability-aware requests,
// PDF/text sources, template-guided plans and the page assistant (revise).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const express = require("express");

const S = require("../public/native/schema.js");
const D = require("../public/native/doc.js");
const T = require("../public/native/templates.js");
const schemas = require("../lib/native/ai/schemas");
const prompts = require("../lib/native/ai/prompts");
const revise = require("../lib/native/ai/revise");
const openrouter = require("../lib/native/ai/openrouter");
const pdf = require("../lib/native/sources/pdf");
const { createPipeline } = require("../lib/native/ai/pipeline");
const { createProjectStore } = require("../lib/native/projects");
const { createSettingsStore, normalizeSettings, modelForTier } = require("../lib/native/settings");
const { createNative } = require("../lib/native");
const safeFetch = require("../lib/safe-fetch");
const imageTools = require("../lib/image");

const IMG = "a".repeat(64) + ".jpg";
const IMG2 = "b".repeat(64) + ".jpg";

// ---- helpers ---------------------------------------------------------------------
/** A minimal one-page PDF with `text` on it, wrapped into short lines (or no text at all). */
function makePdf(text) {
  const lines = String(text || "").match(/.{1,60}(\s|$)/g) || [];
  const stream = lines.length ? "BT /F1 12 Tf 72 740 Td " + lines.map((l) => "(" + l.trim() + ") Tj 0 -16 Td").join(" ") + " ET" : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += i + 1 + " 0 obj\n" + body + "\nendobj\n";
  });
  const xref = out.length;
  out += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  offsets.forEach((o) => (out += String(o).padStart(10, "0") + " 00000 n \n"));
  out += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
  return Buffer.from(out, "latin1");
}

function fakeChat(make) {
  const calls = [];
  const fn = async (req) => {
    calls.push(req);
    const data = make(req, calls);
    if (data instanceof Error) throw data;
    return { data, text: JSON.stringify(data), images: [], model: req.model, usage: { prompt: 10, completion: 20, cost: 0.002 } };
  };
  fn.calls = calls;
  return fn;
}

async function setup(chat, projectOverrides) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "np-studio-"));
  const projects = createProjectStore({ dataDir: dir });
  const settings = createSettingsStore(dir);
  const assets = { preview: async () => ({ buffer: Buffer.from("jpg"), mime: "image/jpeg" }) };
  const rec = await projects.create(
    D.normalizeProject(Object.assign({ name: "Studio", advertiser: { name: "Nordvei" }, assets: { [IMG]: { w: 2000, h: 1000, alt: "Bil på fjellvei" }, [IMG2]: { w: 800, h: 800 } } }, projectOverrides || {}))
  );
  return { pipeline: createPipeline({ projects, assets, settings, chat }), projects, rec, settings };
}

// ---- settings: quality tiers ---------------------------------------------------------
test("quality tiers map to models; unknown tiers fall back to the team default", () => {
  const ai = normalizeSettings({}).ai;
  assert.equal(modelForTier(ai, "okonomi"), ai.economyModel);
  assert.equal(modelForTier(ai, "standard"), ai.defaultModel);
  assert.equal(modelForTier(ai, "premium"), ai.premiumModel);
  assert.equal(modelForTier(ai, "gratis"), ai.defaultModel);
  const custom = normalizeSettings({ ai: { defaultTier: "premium", premiumModel: "x/opus", economyModel: "not a model id" } }).ai;
  assert.equal(modelForTier(custom, undefined), "x/opus");
  assert.equal(custom.economyModel, ai.economyModel, "an invalid model id keeps the default");
  assert.equal(normalizeSettings({ ai: { defaultTier: "gull" } }).ai.defaultTier, "standard");
});

// ---- the OpenRouter client -------------------------------------------------------------
test("temperature and reasoning go only to models that accept them; truncated answers still report cost", async () => {
  const seen = [];
  let reply = { content: '{"ok":true}', finish: "stop" };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      if (req.method === "GET" && req.url.endsWith("/models")) {
        return res.end(JSON.stringify({
          data: [
            { id: "old/model", supported_parameters: ["temperature", "reasoning", "structured_outputs"], architecture: { input_modalities: ["text"] }, top_provider: { max_completion_tokens: 8000 } },
            { id: "new/model", supported_parameters: ["reasoning", "structured_outputs"], architecture: { input_modalities: ["text", "image"] } },
          ],
        }));
      }
      seen.push(JSON.parse(body));
      res.end(JSON.stringify({ model: "m", choices: [{ message: { content: reply.content }, finish_reason: reply.finish }], usage: { prompt_tokens: 5, completion_tokens: 900, cost: 0.04, completion_tokens_details: { reasoning_tokens: 700 } } }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.OPENROUTER_BASE_URL = "http://127.0.0.1:" + server.address().port + "/api/v1";
  process.env.OPENROUTER_API_KEY = "sk-test";
  openrouter.resetModelCache();
  try {
    await openrouter.chat({ model: "old/model", messages: [], temperature: 0.3, reasoning: { effort: "low" }, maxTokens: 32000 });
    assert.deepEqual(seen[0].reasoning, { exclude: true, effort: "low" });
    assert.ok(!("temperature" in seen[0]), "thinking on → no temperature (Anthropic rejects it)");
    assert.equal(seen[0].max_tokens, 8000, "max_tokens is capped at the model's output limit");
    await openrouter.chat({ model: "old/model", messages: [], temperature: 0.3 });
    assert.equal(seen.pop().temperature, 0.3);

    await openrouter.chat({ model: "new/model", messages: [], temperature: 0.3 });
    assert.ok(!("temperature" in seen[1]), "Claude-style models reject temperature → it must not be sent");

    await openrouter.chat({ model: "old/model", fallbacks: ["new/model"], messages: [], temperature: 0.3 });
    assert.ok(!("temperature" in seen[2]), "one model in the chain without temperature → omitted for all");

    await openrouter.chat({ model: "unknown/model", messages: [], plugins: [{ id: "file-parser" }], json: { name: "t", schema: { type: "object" } } });
    assert.ok(!("temperature" in seen[3]), "unknown model → omitted (safe)");
    assert.deepEqual(seen[3].plugins.map((p) => p.id), ["file-parser", "response-healing"]);

    assert.equal((await openrouter.modelInfo("new/model")).vision, true);

    reply = { content: '{"ok":', finish: "length" };
    const err = await openrouter.chat({ model: "old/model", messages: [], json: { name: "t", schema: { type: "object" } } }).catch((e) => e);
    assert.match(err.message, /for langt/);
    assert.equal(err.usage.cost, 0.04);
    assert.equal(err.usage.reasoning, 700);
  } finally {
    delete process.env.OPENROUTER_BASE_URL;
    delete process.env.OPENROUTER_API_KEY;
    openrouter.resetModelCache();
    server.close();
  }
});

// ---- the pipeline: tiers, failed-call cost, templates ------------------------------------
test("each step uses the chosen tier's model and a reasoning budget", async () => {
  const chat = fakeChat((req) => {
    if (req.json.name === "native_analysis") return { summary: "s", facts: [], quotes: [], links: [], angles: [], images: [], gaps: [], questions: [] };
    return { titles: ["A", "B", "C"], angle: "v", ingress: "i", sections: [{ type: "hero", purpose: "p", imageIds: [], templateIndex: -1 }] };
  });
  const { pipeline, rec, settings } = await setup(chat);
  const ai = (await settings.get()).ai;
  await pipeline.analyze(rec.id, { brief: "Ford", tier: "okonomi" });
  await pipeline.outline(rec.id, { analysis: { facts: [] }, tier: "premium" });
  assert.equal(chat.calls[0].model, ai.economyModel);
  assert.equal(chat.calls[1].model, ai.premiumModel);
  assert.equal(chat.calls[0].reasoning.effort, "medium");
  assert.ok(chat.calls[0].maxTokens >= 20000, "the budget leaves room for reasoning tokens");
});

test("a failed call that was billed is still logged with its cost", async () => {
  const chat = fakeChat(() => Object.assign(new Error("AI-svaret ble for langt"), { safe: true, usage: { model: "m/x", prompt: 1, completion: 2, cost: 0.05 } }));
  const { pipeline, projects, rec } = await setup(chat);
  await assert.rejects(pipeline.analyze(rec.id, { brief: "Ford" }), /for langt/);
  const usage = await projects.aiUsage(rec.id);
  const text = JSON.stringify(usage);
  assert.match(text, /analyze:feilet/);
  assert.match(text, /0\.05/);
});

test("with a template, the plan follows it and sections get the template's design", async () => {
  const tpl = T.find("bil-premium");
  const heroAt = tpl.sections.findIndex((x) => x.type === "hero");
  const statementAt = tpl.sections.findIndex((x) => x.type === "statement");
  const chat = fakeChat((req) => {
    if (req.json.name === "native_outline") {
      return {
        titles: ["Tittel", "B", "C"],
        angle: "v",
        ingress: "i",
        sections: [
          { type: "hero", purpose: "Åpning", imageIds: [], templateIndex: heroAt },
          { type: "statement", purpose: "Kjernen", imageIds: [], templateIndex: statementAt },
          { type: "richText", purpose: "Tekst", imageIds: [], templateIndex: heroAt }, // wrong type for that index
        ],
      };
    }
    if (req.json.name === "native_section_hero") return { props: { kicker: "Puma", title: "Mer plass enn du tror", ingress: "Kort.", image: "" }, usedFacts: [], warnings: [] };
    return { props: { kicker: "", text: "Én setning.", accent: "", fx: "none", size: "xxl", font: "body" }, usedFacts: [], warnings: [] };
  });
  const { pipeline, rec } = await setup(chat);
  const o = await pipeline.outline(rec.id, { analysis: { facts: [] }, templateId: "bil-premium" });
  assert.match(chat.calls[0].messages[1].content, /VALGT MAL: «Bil-lansering premium»/);
  assert.equal(o.outline.templateId, "bil-premium");
  assert.deepEqual(o.outline.sections.map((x) => x.templateIndex), [heroAt, statementAt, -1]);

  const hero = await pipeline.write(rec.id, { outline: o.outline, index: 0, analysis: { facts: [] } });
  assert.equal(hero.section.props.title, "Mer plass enn du tror");
  assert.equal(hero.section.props.layout, tpl.sections[heroAt].props.layout, "layout comes from the template");
  assert.equal(hero.section.props.titleSize, tpl.sections[heroAt].props.titleSize);
  assert.equal(hero.section.props.image, "", "demo photos never leak into the page");
  assert.match(chat.calls[1].messages[1].content, /EKSEMPEL FRA MALEN/);

  const statement = await pipeline.write(rec.id, { outline: o.outline, index: 1, analysis: { facts: [] } });
  assert.equal(statement.section.props.text, "Én setning.");
  assert.equal(statement.section.props.size, tpl.sections[statementAt].props.size, "the template's size wins over the model's");
  assert.equal(statement.section.style.pad, tpl.sections[statementAt].style.pad);
});

test("outline schema carries templateIndex and stays strict", () => {
  const sec = schemas.outlineSchema([]).properties.sections.items;
  assert.ok(sec.required.includes("templateIndex"));
  const r = schemas.reviseSchema(revise.OPS);
  assert.deepEqual(r.properties.ops.items.properties.op.enum, revise.OPS);
  assert.deepEqual([...r.required].sort(), Object.keys(r.properties).sort());
});

// ---- the assistant: what the model sees ----------------------------------------------------
function pageProject() {
  return D.normalizeProject({
    name: "P",
    advertiser: { name: "Nordvei" },
    assets: { [IMG]: { w: 2000, h: 1000, alt: "Bil" }, [IMG2]: { w: 800, h: 800 } },
    pages: [{ sections: [
      { type: "hero", props: { title: "Gammel tittel", ingress: "Ingress", image: IMG } },
      { type: "richText", props: { html: "<p>Tekst</p>" } },
      { type: "factBox", props: { title: "Fakta", items: [{ text: "419 km" }, { text: "26 min" }] } },
      { type: "quote", props: { text: "Sitat", name: "Kari" } },
    ] }],
  });
}

test("the page view shows ids, content, short photo ids and only non-default style", () => {
  const p = pageProject();
  const ids = revise.imageIds(p);
  const view = revise.pageView(p, p.pages[0], ids);
  assert.equal(view.sections.length, 4);
  assert.equal(view.sections[0].id, p.pages[0].sections[0].id);
  assert.equal(view.sections[0].props.image, "B1");
  assert.ok(!("video" in view.sections[0].props), "video fields are hidden from the model");
  assert.equal(view.sections[0].style.pad, "none", "a block default that differs from the global default is shown");
  assert.ok(!("bgColor" in view.sections[1].style));
  assert.ok(typeof view.css === "string" && !("customCss" in view.extras));
  assert.match(revise.imagesText(p, ids), /B1 \(2000×1000\): Bil/);
  assert.match(prompts.reviseSystem(), /factBox \(Faktaboks/);
});

// ---- the assistant: applying operations ------------------------------------------------------
test("update/insert/delete/move/style operations are validated and applied", () => {
  const p = pageProject();
  const page = p.pages[0];
  const [hero, text, facts, quote] = page.sections;
  const ids = revise.imageIds(p);
  const r = revise.applyOps(p, page, [
    { op: "update", sectionId: hero.id, props: JSON.stringify({ title: "Ny tittel", image: "B2", bogus: 1 }), style: "", summary: "Ny tittel" },
    { op: "update", sectionId: text.id, props: JSON.stringify({ html: '<p>Hei <a href="javascript:x()">lenke</a></p><script>alert(1)</script>' }), style: "", summary: "Tekst" },
    { op: "update", sectionId: facts.id, props: JSON.stringify({ items: [{ text: "419 km rekkevidde" }, { text: "26 min" }] }), style: "", summary: "Fakta" },
    { op: "move", sectionId: quote.id, after: hero.id, props: "", style: "", summary: "Flytt sitatet" },
    { op: "insert", type: "accordion", after: facts.id, props: JSON.stringify({ title: "Spørsmål om lading", items: [{ q: "Hvor lang tid?", a: "26 minutter." }] }), style: "{}", summary: "FAQ" },
    { op: "style", sectionId: facts.id, props: "{}", style: JSON.stringify({ bg: "dark", pad: "xl", hiddenOn: ["mobile"] }), summary: "Mørk" },
    { op: "delete", sectionId: "s_finnesikke", summary: "Slett" },
    { op: "insert", type: "video", after: "START", props: "{}", style: "{}", summary: "Video" },
    { op: "update", sectionId: hero.id, props: "{ikke json", style: "", summary: "Ødelagt" },
  ], ids);

  const types = r.sections.map((x) => x.type);
  assert.deepEqual(types, ["hero", "quote", "richText", "factBox", "accordion"]);
  assert.equal(r.sections[0].props.title, "Ny tittel");
  assert.equal(r.sections[0].props.image, IMG2, "B2 → the real asset id");
  assert.equal(r.sections[0].id, hero.id, "ids are kept");
  assert.doesNotMatch(r.sections[2].props.html, /script|javascript/);
  assert.equal(r.sections[3].props.items[0].text, "419 km rekkevidde");
  assert.equal(r.sections[3].props.items[0].id, facts.props.items[0].id, "list items keep their ids");
  assert.equal(r.sections[3].style.bg, "dark");
  assert.deepEqual(r.sections[3].hide, { desktop: false, tablet: false, mobile: true });
  assert.equal(r.sections[4].props.items[0].q, "Hvor lang tid?");
  assert.equal(r.changes.length, 6);
  const warn = r.warnings.join(" | ");
  assert.match(warn, /Ukjente felt ignorert i Hero: bogus/);
  assert.match(warn, /fant ikke seksjonen s_finnesikke/);
  assert.match(warn, /ukjent seksjonstype «video»/);
  assert.match(warn, /ugyldig JSON/);
});

test("review fixes: photos on the page always get ids, list items match by id, positions are explicit", () => {
  const assets = {};
  for (let i = 0; i < 90; i++) assets[i.toString(16).padStart(2, "0").repeat(32) + ".jpg"] = { w: 10, h: 10 };
  const last = Object.keys(assets)[89];
  const p = D.normalizeProject({ assets, pages: [{ sections: [{ type: "hero", props: { title: "T", image: last } }, { type: "cta", props: { title: "Kjøp" } }] }] });
  const ids = revise.imageIds(p);
  assert.equal(ids.toShort[last], "B1", "a used photo comes first even beyond the cap");

  const q = pageProject();
  const facts = q.pages[0].sections[2];
  const [a, b] = facts.props.items;
  const view = revise.sectionView(facts, revise.imageIds(q));
  assert.equal(view.props.items[0].id, a.id, "the model sees item ids");
  const r = revise.applyOps(q, q.pages[0], [
    { op: "update", sectionId: facts.id, props: JSON.stringify({ items: [{ id: b.id, text: "26 min lading" }] }), summary: "Fjern første" },
    { op: "move", sectionId: q.pages[0].sections[3].id, after: "", summary: "Flytt uten mål" },
    { op: "css", props: "", summary: "Ingenting" },
  ], revise.imageIds(q));
  assert.deepEqual(r.sections[2].props.items.map((x) => [x.id, x.text]), [[b.id, "26 min lading"]]);
  assert.match(r.warnings.join(" "), /vet ikke hvor seksjonen skal flyttes/);
  assert.match(r.warnings.join(" "), /tom CSS ignorert/);
  assert.equal(r.extras, null);

  const withCta = revise.applyOps(p, p.pages[0], [{ op: "insert", type: "quote", after: "", props: JSON.stringify({ text: "Sitat", name: "Kari" }), summary: "Sitat" }], ids);
  assert.deepEqual(withCta.sections.map((x) => x.type), ["hero", "quote", "cta"], "no position → just before the closing CTA");
});

test("theme, extras and css operations are normalised and sanitised", () => {
  const p = pageProject();
  const r = revise.applyOps(p, p.pages[0], [
    { op: "theme", props: JSON.stringify({ colors: { primary: "#14532D", accent: "red; background:url(x)" }, radius: 4 }), summary: "Grønn" },
    { op: "extras", props: JSON.stringify({ progress: true, stickyCta: true, stickyLabel: "Book prøvekjøring", customCss: "body{}" }), summary: "Knapp" },
    { op: "css", props: ".np-t-richText h2{color:var(--np-primary);background:url(https://evil/x.png)} @import url(x);", summary: "CSS" },
  ], revise.imageIds(p));
  assert.equal(r.theme.colors.primary, "#14532d");
  assert.equal(r.theme.colors.accent, p.theme.colors.accent, "an invalid colour keeps the old one");
  assert.equal(r.theme.radius, 4);
  assert.equal(r.extras.stickyLabel, "Book prøvekjøring");
  assert.doesNotMatch(r.extras.customCss, /url\(|@import/);
  assert.match(r.extras.customCss, /np-t-richText h2/);
  assert.equal(r.sections.length, 4, "sections untouched");
});

test("over-long text from the assistant is kept but reported", () => {
  const p = pageProject();
  const r = revise.applyOps(p, p.pages[0], [{ op: "update", sectionId: p.pages[0].sections[0].id, props: JSON.stringify({ title: "x".repeat(140) }), summary: "Lang" }], revise.imageIds(p));
  assert.equal(r.sections[0].props.title.length, 140);
  assert.match(r.warnings.join(" "), /Hero: «Tittel \(H1\)» \(title\) er 140 tegn, maks 90/);
});

test("revise: does what it can, asks about the rest, and sends the conversation", async () => {
  const p = pageProject();
  let heroId;
  const chat = fakeChat((req) => ({
    reply: "Jeg kortet ned tittelen. Hva er prisen?",
    questions: [{ id: "Q1", question: "Hva er prisen?", why: "Den står ikke i materialet.", options: [], suggested: "" }],
    ops: [{ op: "update", sectionId: heroId, type: "", after: "", props: JSON.stringify({ title: "Kort" }), style: "", summary: "Kortere tittel" }],
    warnings: [],
  }));
  const { pipeline, rec } = await setup(chat, { pages: p.pages, assets: p.assets });
  heroId = rec.pages[0].sections[0].id;
  const history = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: "melding " + i }));
  const r = await pipeline.revise(rec.id, { pageId: rec.pages[0].id, instruction: "Kortere tittel og legg inn prisen", history, selected: heroId, tier: "okonomi" });
  assert.equal(r.sections[0].props.title, "Kort");
  assert.equal(r.questions.length, 1);
  assert.equal(r.changes[0].summary, "Kortere tittel");
  assert.equal(r.theme, null);
  const sent = chat.calls[0].messages[1].content;
  assert.match(sent, /MARKERT SEKSJON: s_/);
  assert.match(sent, /melding 29/);
  assert.doesNotMatch(sent, /melding 19\b/, "only the last messages travel");
  assert.match(sent, /"title":"Gammel tittel"/, "the model sees the stored page");
  await assert.rejects(pipeline.revise(rec.id, { instruction: " " }), /Skriv hva du vil endre/);
  await assert.rejects(pipeline.revise(rec.id, { instruction: "Kortere", rev: Number(rec.rev) + 5 }), (err) => err.status === 409);
  const v = await pipeline.view(rec.id, { pageId: rec.pages[0].id });
  assert.equal(v.page.sections[0].props.title, "Gammel tittel");
  assert.match(v.images, /B1/);
});

// ---- project.ai keeps the assistant's state ----------------------------------------------------
test("project.ai keeps tier, template and a bounded conversation", () => {
  const chat = Array.from({ length: 60 }, (_, i) => ({ role: "assistant", text: "m" + i, changes: [{ op: "update", summary: "x", sectionId: "s_1" }], cost: 0.01, evil: "<script>" }));
  const ai = D.normalizeProject({ ai: { tier: "premium", templateId: "bil-premium", chat } }).ai;
  assert.equal(ai.tier, "premium");
  assert.equal(ai.templateId, "bil-premium");
  assert.equal(ai.chat.length, 40);
  assert.equal(ai.chat[39].text, "m59");
  assert.ok(!("evil" in ai.chat[0]));
  assert.equal(D.normalizeProject({ ai: { tier: "gull", templateId: "../x" } }).ai.tier, undefined);
});

// ---- sources: PDF and text files ------------------------------------------------------------------
test("a text PDF is read locally; a PDF without text is flagged as scanned", async () => {
  const r = await pdf.parsePdf(makePdf("Ford Puma Gen-E har 419 km rekkevidde og lader 10-80 prosent paa 26 minutter. " + "Mer tekst her om bilen. ".repeat(8)));
  assert.match(r.text, /419 km rekkevidde/);
  assert.equal(r.pages, 1);
  assert.equal(r.scanned, false);
  const scan = await pdf.parsePdf(makePdf(""));
  assert.equal(scan.scanned, true);
  await assert.rejects(pdf.parsePdf(Buffer.from("ikke en pdf")), /ikke en gyldig PDF/);
  assert.equal(pdf.cleanPageText("elbil-\nen  kjører\n\n\n\nlangt"), "elbilen kjører\n\nlangt");
});

test("POST /sources/file reads PDF and text, refuses other types", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "np-src-"));
  const app = express();
  createNative({ dataDir: path.join(root, "data"), uploadsDir: path.join(root, "uploads"), fontCacheDir: path.join(root, "fonts"), getSharp: imageTools.getSharp, safeFetch }).register(app);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const send = async (buf, name, type) => {
    const fd = new FormData();
    fd.append("file", new Blob([buf], { type }), name);
    const res = await fetch(base + "/api/native/sources/file", { method: "POST", body: fd });
    return { status: res.status, data: await res.json() };
  };
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const a = await send(makePdf("Kampanjen varer til 30. november og gjelder alle modeller i butikk. " + "Mer innhold. ".repeat(5)), "brief.pdf", "application/pdf");
    assert.equal(a.status, 200);
    assert.equal(a.data.source.kind, "pdf");
    assert.match(a.data.source.text, /30\. november/);

    const b = await send(Buffer.from("﻿Brief\r\n\r\nCTA: book prøvekjøring", "utf8"), "notater.md", "text/markdown");
    assert.equal(b.data.source.kind, "text");
    assert.equal(b.data.source.text, "Brief\n\nCTA: book prøvekjøring");

    const c = await send(makePdf(""), "skann.pdf", "application/pdf");
    assert.equal(c.status, 400, "a scan without AI configured cannot be read");
    assert.match(c.data.error, /skannet/);

    const d = await send(Buffer.from("GIF89a"), "bilde.gif", "image/gif");
    assert.equal(d.status, 400);
    assert.match(d.data.error, /Filtypen støttes ikke/);
  } finally {
    if (saved) process.env.OPENROUTER_API_KEY = saved;
    server.close();
  }
});

test("every block type the assistant may insert is in the catalog it reads", () => {
  const catalog = revise.blockCatalog();
  S.aiBlockTypes().forEach((t) => assert.match(catalog, new RegExp("^- " + t + " \\(", "m")));
});
