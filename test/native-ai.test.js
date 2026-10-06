"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const S = require("../public/native/schema.js");
const D = require("../public/native/doc.js");
const schemas = require("../lib/native/ai/schemas");
const validate = require("../lib/native/ai/validate");
const openrouter = require("../lib/native/ai/openrouter");
const { createPipeline } = require("../lib/native/ai/pipeline");
const { createProjectStore } = require("../lib/native/projects");
const { createSettingsStore } = require("../lib/native/settings");

const IMG = "a".repeat(64) + ".jpg";

/** Every object in a strict schema must list all its properties as required. */
function assertStrict(schema, where) {
  if (!schema || typeof schema !== "object") return;
  if (schema.type === "object") {
    assert.equal(schema.additionalProperties, false, where + ": additionalProperties");
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), where + ": required");
    Object.keys(schema.properties).forEach((k) => assertStrict(schema.properties[k], where + "." + k));
  }
  if (schema.type === "array") assertStrict(schema.items, where + "[]");
  ["maxLength", "minLength", "maximum", "minimum", "maxItems"].forEach((k) => assert.ok(!(k in schema), where + " must not use " + k));
}

test("every JSON schema the model gets is valid strict-mode schema", () => {
  assertStrict(schemas.analysisSchema(["B1", "B2"]), "analysis");
  assertStrict(schemas.analysisSchema([]), "analysis(no images)");
  assertStrict(schemas.outlineSchema(["B1"]), "outline");
  assertStrict(schemas.rewriteSchema(90), "rewrite");
  assertStrict(schemas.altSchema(), "alt");
  S.aiBlockTypes().forEach((t) => assertStrict(schemas.sectionSchema(t, ["B1"]), "section:" + t));
});

test("the AI never gets to write media, links or blocks marked off-limits", () => {
  const hero = schemas.sectionSchema("hero", ["B1"]).properties.props.properties;
  assert.ok("title" in hero && "image" in hero);
  assert.ok(!("video" in hero) && !("layout" in hero) && !("overlay" in hero));
  const cta = schemas.sectionSchema("cta", []).properties.props.properties;
  assert.ok(!("url" in cta), "URLs are never invented by the model");
  assert.ok(!S.aiBlockTypes().includes("video"));
  assert.ok(!S.aiBlockTypes().includes("embed"));
});

test("model blocks become sanitised HTML; image ids map to real assets only", () => {
  const html = validate.blocksToHtml([
    { kind: "h2", text: "Mer plass", items: [] },
    { kind: "p", text: "Les **mer** på [ford.no](https://www.ford.no/) og [farlig](javascript:evil).", items: [] },
    { kind: "ul", text: "", items: ["a", "", "b"] },
    { kind: "quote", text: "Sitat", items: [] },
  ]);
  assert.equal(html, '<h2>Mer plass</h2><p>Les <strong>mer</strong> på <a href="https://www.ford.no/">ford.no</a> og farlig.</p><ul><li>a</li><li>b</li></ul><blockquote><p>Sitat</p></blockquote>');
  const r = validate.toSection("imageText", { props: { title: "T", html: [{ kind: "p", text: "x", items: [] }], image: "B1", alt: "a", ctaLabel: "" } }, { imageMap: { B1: IMG }, assets: { [IMG]: D.normalizeAsset(IMG, {}) } });
  assert.equal(r.section.props.image, IMG);
  const bad = validate.toSection("imageText", { props: { image: "B9" } }, { imageMap: { B1: IMG }, assets: {} });
  assert.equal(bad.section.props.image, "");
});

test("limits are checked with a little grace, and reported in plain words", () => {
  const long = "x".repeat(120);
  const r = validate.toSection("hero", { props: { title: long, kicker: "", ingress: "" } }, {});
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /«Tittel \(H1\)» \(title\) er 120 tegn, maks 90/);
  const ok = validate.toSection("hero", { props: { title: "x".repeat(95), kicker: "", ingress: "" } }, {});
  assert.equal(ok.problems.length, 0, "95 is within the 10 % grace");
});

test("parseJson tolerates a Markdown fence and surrounding chatter", () => {
  assert.deepEqual(openrouter.parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(openrouter.parseJson('Her er svaret: {"a":2} Håper det hjelper'), { a: 2 });
  assert.throws(() => openrouter.parseJson("ikke json"), /tolkes/);
});

// ---- the pipeline with a fake model ------------------------------------------
async function setup(chat) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "np-ai-"));
  const projects = createProjectStore({ dataDir: dir });
  const settings = createSettingsStore(dir);
  const assets = { preview: async () => ({ buffer: Buffer.from("jpg"), mime: "image/jpeg" }), storeImage: async (buf, meta) => ({ id: "f".repeat(64) + ".png", kind: "image", source: meta.source }) };
  const rec = await projects.create(
    D.normalizeProject({ name: "AI", advertiser: { name: "Ford" }, assets: { [IMG]: { w: 2000, h: 1000 } } })
  );
  return { pipeline: createPipeline({ projects, assets, settings, chat }), projects, rec };
}

function fakeChat(responses) {
  const calls = [];
  const fn = async (req) => {
    calls.push(req);
    const name = req.json ? req.json.name : "image";
    const make = responses[name] || responses[name.replace(/_[a-zA-Z]+$/, "")];
    const data = typeof make === "function" ? make(req, calls) : make;
    return { data, text: JSON.stringify(data), images: data && data.__images ? data.__images : [], model: "test/model", usage: { prompt: 10, completion: 20, cost: 0.001 } };
  };
  fn.calls = calls;
  return fn;
}

test("analyze: photos travel as short ids with a preview, the questions are capped at 8", async () => {
  const chat = fakeChat({
    native_analysis: (req) => ({
      summary: "s", advertiser: { name: "Ford", url: "" }, product: "Puma", audience: "", tone: "",
      facts: [{ id: "F1", text: "349 900 kr", source: "brief", needsCheck: true }], quotes: [], links: [], angles: [],
      images: [{ id: "B1", description: "bil", alt: "Bil", orientation: "liggende", suggestedUse: "hero", quality: "god" }],
      gaps: [],
      questions: Array.from({ length: 12 }, (_, i) => ({ id: "Q" + i, category: "fakta", question: "?", why: "", type: "text", options: [], suggested: "", required: false })),
    }),
  });
  const { pipeline, projects, rec } = await setup(chat);
  const r = await pipeline.analyze(rec.id, { brief: "Ford Puma, pris 349 900", sources: [{ kind: "gdoc", title: "Brief", text: "Tekst" }], imageIds: [IMG, "nope.jpg"] });
  assert.deepEqual(r.imageMap, { B1: IMG });
  assert.equal(r.analysis.questions.length, 8);
  const user = chat.calls[0].messages[1].content;
  assert.equal(user[0].type, "text");
  assert.match(user[0].text, /KILDE 1 – Brief/);
  assert.ok(user.some((p) => p.type === "image_url" && p.image_url.url.startsWith("data:image/jpeg;base64,")));
  assert.equal(chat.calls[0].json.schema.properties.images.items.properties.id.enum[0], "B1");
  assert.equal((await projects.aiUsage(rec.id)).calls, 1);
});

test("analyze refuses to run with no material at all", async () => {
  const { pipeline, rec } = await setup(fakeChat({}));
  await assert.rejects(pipeline.analyze(rec.id, { brief: "  ", sources: [] }), /minst én kilde/);
});

test("outline: unknown block types are dropped and the page always opens with a hero", async () => {
  const chat = fakeChat({
    native_outline: { titles: ["a", "b", "c"], angle: "x", ingress: "i", sections: [{ type: "richText", purpose: "p", imageIds: [] }, { type: "video", purpose: "no", imageIds: [] }, { type: "cta", purpose: "c", imageIds: [] }] },
  });
  const { pipeline, rec } = await setup(chat);
  const r = await pipeline.outline(rec.id, { analysis: { summary: "s", facts: [] }, answers: {}, imageMap: { B1: IMG, B2: "../evil" } });
  assert.deepEqual(r.outline.sections.map((s) => s.type), ["hero", "richText", "cta"]);
  assert.deepEqual(r.imageMap, { B1: IMG });
});

test("write: a section over the limit gets exactly one repair round", async () => {
  let n = 0;
  const chat = fakeChat({
    native_section_hero: () => {
      n++;
      return { props: { kicker: "Puma", title: n === 1 ? "x".repeat(140) : "Derfor velger flere elbil", ingress: "Kort.", image: "B1" }, usedFacts: ["F1"], warnings: n === 1 ? [] : ["Pris må sjekkes"] };
    },
  });
  const { pipeline, rec } = await setup(chat);
  const outline = { titles: ["t"], angle: "", ingress: "", sections: [{ type: "hero", purpose: "Åpning", imageIds: ["B1"] }] };
  const r = await pipeline.write(rec.id, { outline, index: 0, analysis: { facts: [] }, imageMap: { B1: IMG } });
  assert.equal(chat.calls.length, 2);
  assert.match(chat.calls[1].messages[3].content, /er 140 tegn, maks 90/);
  assert.equal(r.section.props.title, "Derfor velger flere elbil");
  assert.equal(r.section.props.image, IMG);
  assert.deepEqual(r.warnings, ["Pris må sjekkes"]);
  assert.equal(r.problems.length, 0);
  assert.ok(Math.abs(r.cost - 0.002) < 1e-9);
});

test("rewrite returns three variants with their lengths; rich text stays sanitised", async () => {
  const chat = fakeChat({ native_rewrite: { variants: ["<p>Kort <script>x</script></p>", "<p>To</p>", "<p>Tre</p>"] } });
  const { pipeline, rec } = await setup(chat);
  const r = await pipeline.rewrite(rec.id, { type: "richText", field: "html", text: "<p>Lang tekst</p>", instruction: "shorter" });
  assert.equal(r.variants.length, 3);
  assert.equal(r.variants[0].value, "<p>Kort </p>");
  assert.equal(r.max, 4000);
  assert.match(chat.calls[0].messages[1].content, /Gjør teksten kortere/);
});

test("image generation stores the picture as an AI asset with its prompt", async () => {
  const png = "data:image/png;base64," + Buffer.from("png").toString("base64");
  const chat = fakeChat({ image: { __images: [png] } });
  const { pipeline, rec } = await setup(chat);
  const r = await pipeline.image(rec.id, { prompt: "En familie lader bilen ved hytta", aspect: "16:9", referenceIds: [IMG] });
  assert.equal(r.asset.source, "ai");
  assert.equal(r.asset.ai.prompt, "En familie lader bilen ved hytta");
  assert.deepEqual(chat.calls[0].modalities, ["image", "text"]);
  assert.match(chat.calls[0].messages[0].content[0].text, /No text, letters, logos/);
});

// ---- the real HTTP client against a local stub ---------------------------------
test("the OpenRouter client sends key, privacy flags, fallbacks and schema; maps errors", async () => {
  let seen = null;
  let status = 200;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen = { headers: req.headers, body: JSON.parse(body), url: req.url };
      res.writeHead(status, { "Content-Type": "application/json" });
      if (status !== 200) return res.end(JSON.stringify({ error: { code: status, message: "nope" } }));
      res.end(JSON.stringify({ model: "x/y", choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 6, cost: 0.0003 } }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.OPENROUTER_BASE_URL = "http://127.0.0.1:" + server.address().port + "/api/v1";
  process.env.OPENROUTER_API_KEY = "sk-test";
  try {
    const r = await openrouter.chat({ model: "a/b", fallbacks: ["c/d"], messages: [{ role: "user", content: "hei" }], json: { name: "t", schema: { type: "object" } } });
    assert.deepEqual(r.data, { ok: true });
    assert.equal(r.usage.cost, 0.0003);
    assert.equal(seen.url, "/api/v1/chat/completions");
    assert.equal(seen.headers.authorization, "Bearer sk-test");
    assert.equal(seen.headers["x-openrouter-title"], "ABC design");
    assert.deepEqual(seen.body.models, ["a/b", "c/d"]);
    assert.deepEqual(seen.body.provider, { data_collection: "deny", zdr: true, require_parameters: true, allow_fallbacks: true });
    assert.equal(seen.body.response_format.json_schema.strict, true);
    status = 402;
    await assert.rejects(openrouter.chat({ model: "a/b", messages: [] }), /tom for kreditt/);
    status = 401;
    await assert.rejects(openrouter.chat({ model: "a/b", messages: [] }), /API-nøkkelen/);
    delete process.env.OPENROUTER_API_KEY;
    await assert.rejects(openrouter.chat({ model: "a/b", messages: [] }), /OPENROUTER_API_KEY mangler/);
  } finally {
    delete process.env.OPENROUTER_BASE_URL;
    delete process.env.OPENROUTER_API_KEY;
    server.close();
  }
});
