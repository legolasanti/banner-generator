"use strict";

/* =========================================================================
 * ai/schemas.js — the JSON shapes the model must answer in.
 *
 * Built for "strict" structured output, which every major provider accepts
 * only in a restricted JSON Schema dialect:
 *   - every object lists all its properties as required and forbids others
 *   - no minLength / maxLength / maximum / maxItems (Anthropic rejects them),
 *     so limits travel in `description` and are checked afterwards
 *     (validate.js) — with one repair round when the model overshoots
 *   - no recursion
 *
 * Section schemas come straight from public/native/schema.js, so a new block
 * type or field is automatically something the AI can write.
 * ========================================================================= */

const S = require("../../../public/native/schema.js");

const str = (description) => ({ type: "string", description });
const arr = (items, description) => ({ type: "array", items, description });
const obj = (properties, description) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
  ...(description ? { description } : {}),
});

const QUESTION_CATEGORIES = ["mal", "malgruppe", "budskap", "fakta", "tone", "cta", "visuelt", "sitater", "juridisk", "struktur"];

/** Step 1: read the material, find facts and gaps, ask the right questions. */
function analysisSchema(imageIds) {
  const imageId = imageIds.length ? { type: "string", enum: imageIds } : str("Bilde-ID");
  return obj({
    summary: str("3–5 setninger: hva saken handler om, for hvem, og hva annonsøren vil oppnå."),
    advertiser: obj({ name: str("Annonsørens navn slik det skal stå i merkingen."), url: str("Annonsørens nettadresse, eller tom streng.") }),
    product: str("Produktet/tjenesten/kampanjen saken handler om."),
    audience: str("Målgruppen slik kildene beskriver den, eller tom streng hvis uklart."),
    tone: str("Tonen kildene peker mot, eller tom streng."),
    facts: arr(
      obj({
        id: str("Kort ID: F1, F2 …"),
        text: str("Ett konkret faktum, så presist som i kilden (tall, pris, dato, egenskap)."),
        source: str("Hvor faktumet står (dokumentnavn, nettside eller «brief»)."),
        needsCheck: { type: "boolean", description: "true hvis faktumet er uklart, motstridende eller kan være utdatert (f.eks. priser)." },
      }),
      "Alle etterprøvbare fakta i kildene. Bare det som faktisk står der."
    ),
    quotes: arr(
      obj({ text: str("Ordrett sitat fra kildene."), person: str("Hvem som sier det."), role: str("Personens rolle, eller tom streng.") }),
      "Ordrette sitater som finnes i kildene. Tom liste hvis ingen."
    ),
    links: arr(obj({ label: str("Hva lenken er"), url: str("Full URL") }), "Lenker i kildene som kan brukes som CTA."),
    angles: arr(
      obj({ title: str("Arbeidstittel for vinkelen"), pitch: str("1–2 setninger: hvorfor leseren bryr seg") }),
      "Tre ulike redaksjonelle vinkler saken kan ha."
    ),
    images: arr(
      obj({
        id: imageId,
        description: str("Hva bildet viser, nøkternt."),
        alt: str("Alternativ tekst for skjermlesere, maks 125 tegn."),
        orientation: { type: "string", enum: ["liggende", "staende", "kvadrat"] },
        suggestedUse: str("Hvor bildet passer: hero, ved et bestemt avsnitt, produktbilde, bakgrunn …"),
        quality: { type: "string", enum: ["god", "middels", "svak"], description: "Teknisk og visuell kvalitet for bruk stort." },
      }),
      "Ett element per bilde du har fått."
    ),
    gaps: arr(str("Én ting som mangler eller er uklart."), "Det som mangler for å skrive en god og korrekt sak."),
    questions: arr(
      obj({
        id: str("Q1, Q2 …"),
        category: { type: "string", enum: QUESTION_CATEGORIES },
        question: str("Kort spørsmål på norsk bokmål, du-form."),
        why: str("Én setning om hvorfor du spør – gjerne med det konkrete du så i kildene."),
        type: { type: "string", enum: ["single", "multi", "text"] },
        options: arr(str("Svaralternativ"), "2–5 alternativer for single/multi, hentet fra kildene når mulig. Tom liste for text."),
        suggested: str("Svaret du tror er riktig ut fra kildene (et av alternativene, eller fritekst). Tom streng hvis du ikke vet."),
        required: { type: "boolean", description: "true hvis saken ikke kan skrives forsvarlig uten svaret." },
      }),
      "Maks 8 spørsmål, viktigst først."
    ),
  });
}

/** Step 2: the page plan the user approves. */
function outlineSchema(imageIds) {
  const types = S.aiBlockTypes();
  return obj({
    titles: arr(str("Tittelforslag (H1), maks 90 tegn, setningsformat (stor forbokstav bare først)."), "Nøyaktig tre ulike tittelforslag."),
    angle: str("Den valgte vinkelen i én setning."),
    ingress: str("Forslag til ingress, maks 260 tegn."),
    sections: arr(
      obj({
        type: { type: "string", enum: types },
        purpose: str("Hva seksjonen skal gjøre for leseren, 1–2 setninger, med hvilke fakta (F-ID-er) den bruker."),
        imageIds: arr(imageIds.length ? { type: "string", enum: imageIds } : str("Bilde-ID"), "Bilder seksjonen skal bruke (kan være tom)."),
        templateIndex: { type: "integer", description: "Indeksen til malseksjonen denne bygger på, eller -1 (ingen mal / ny seksjon)." },
      }),
      "Seksjonene i rekkefølge. Første er alltid hero. Siste er en CTA."
    ),
  });
}

function fieldSchema(f, imageIds) {
  const limit = f.max ? " Maks " + f.max + " tegn." : "";
  const hint = (f.hint ? f.hint + " " : "") + (f.label ? "(" + f.label + ")" : "");
  switch (f.type) {
    case "text":
    case "textarea":
      return str((hint + limit).trim() + (f.type === "textarea" ? " Kan ha linjeskift." : ""));
    case "rich":
      return arr(
        obj({
          kind: { type: "string", enum: ["p", "h2", "h3", "ul", "quote"] },
          text: str("Teksten. **fet** og [lenketekst](https://…) er lov. Tom for ul."),
          items: arr(str("Listepunkt"), "Bare for ul, ellers tom liste."),
        }),
        (hint + " Samlet maks " + (f.max || 4000) + " tegn.").trim()
      );
    case "image":
      return imageIds.length ? { type: "string", enum: imageIds.concat([""]), description: (hint + " Tom streng = ikke noe bilde.").trim() } : str("Tom streng.");
    case "number":
      return { type: "number", description: hint };
    case "toggle":
      return { type: "boolean", description: hint };
    case "select":
      return { type: "string", enum: f.options.map((o) => o[0]), description: hint };
    case "list": {
      const props = {};
      f.item.filter((sub) => sub.ai !== false && sub.type !== "url" && sub.type !== "video").forEach((sub) => {
        props[sub.key] = fieldSchema(sub, imageIds);
      });
      return arr(obj(props), (hint + " Maks " + (f.maxItems || 10) + " elementer.").trim());
    }
    default:
      return null;
  }
}

/** Step 3: one section's content. */
function sectionSchema(type, imageIds) {
  const props = {};
  S.fieldsOf(type)
    .filter((f) => S.aiWrites(type, f) && f.type !== "url" && f.type !== "video")
    .forEach((f) => {
      const sch = fieldSchema(f, imageIds);
      if (sch) props[f.key] = sch;
    });
  return obj({
    props: obj(props, "Innholdet i seksjonen."),
    usedFacts: arr(str("F-ID"), "ID-ene til faktaene teksten bygger på."),
    warnings: arr(str("Advarsel"), "Ting redaktøren må sjekke: påstander uten kilde, usikre tall, manglende lenke. Tom liste hvis ingen."),
  });
}

/** Rewrite tools in the editor: a few alternatives for one field. */
function rewriteSchema(max) {
  return obj({
    variants: arr(str("Alternativ tekst." + (max ? " Maks " + max + " tegn." : "")), "Nøyaktig tre alternativer, ulike fra hverandre."),
  });
}

/** The assistant: a reply, maybe questions, and operations on the page. */
function reviseSchema(ops) {
  return obj({
    reply: str("1–3 setninger på norsk bokmål: hva du endret, eller hvorfor du spør."),
    questions: arr(
      obj({
        id: str("Q1, Q2 …"),
        question: str("Kort spørsmål, du-form."),
        why: str("Én setning om hvorfor du spør."),
        options: arr(str("Svaralternativ"), "2–4 konkrete alternativer, eller tom liste for fritekst."),
        suggested: str("Ditt beste forslag, eller tom streng."),
      }),
      "Bare for det du ikke kan gjøre uten svar (manglende fakta eller virkelig uklart). Ellers tom liste."
    ),
    ops: arr(
      obj({
        op: { type: "string", enum: ops },
        sectionId: str("ID-en til seksjonen operasjonen gjelder, eller tom streng."),
        type: str("Blokktype for insert, ellers tom streng."),
        after: str("For insert/move: ID-en til seksjonen den skal stå etter, eller START. Ellers tom streng."),
        props: str("JSON-objekt som tekst med feltene som endres (for css: hele CSS-en som ren tekst). Tom streng hvis ingen."),
        style: str("JSON-objekt som tekst med stilfeltene som endres, eller tom streng."),
        summary: str("Én kort linje på norsk om endringen."),
      }),
      "Operasjonene for alt du kan gjøre nå, i rekkefølge."
    ),
    warnings: arr(str("Advarsel"), "Ting kollegaen må sjekke (påstander uten kilde, usikre tall). Tom liste hvis ingen."),
  });
}

function altSchema() {
  return obj({
    alt: str("Alternativ tekst, maks 125 tegn, uten «bilde av»."),
    description: str("Nøktern beskrivelse av bildet for redaktøren, 1–2 setninger."),
  });
}

module.exports = { analysisSchema, outlineSchema, sectionSchema, rewriteSchema, reviseSchema, altSchema, QUESTION_CATEGORIES };
