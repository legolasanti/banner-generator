/* =========================================================================
   native/schema.js — the block catalogue of Native Premium.

   One description of every section type a page can hold, and of every field
   inside it. Everything else reads from here, so they can never disagree:

     - doc.js       normalises a project field by field (types, limits)
     - render.js    knows which fields exist and their defaults
     - the editor   builds its property forms from the field list
     - lib/native/ai builds the JSON schema the model must answer in, and
                    checks the answer against the same character limits

   Field types:
     text      one line              { max }
     textarea  several lines, plain  { max }
     rich      formatted text (sanitised HTML subset, see doc.js) { max }
     image     an image asset id
     video     a video asset id
     url       http(s) / mailto / tel / #anker
     select    one of `options` ([value, label])
     toggle    true / false
     number    { min, max, step }
     color     #rrggbb, or "" for "from the theme"
     list      array of objects described by `item`, at most `maxItems`

   `max` is the editorial limit: the editor shows a counter against it and
   the AI is told to stay under it. It is not a hard cut — normalisation only
   trims at HARD_MAX so a long paste is never silently lost.

   `ai: false` marks a field the model never writes (media choices, layout
   toggles it has no business deciding). `hint` is sent to the model.

   Shared verbatim by the browser and the server (UMD).
   ========================================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NativeSchema = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var HARD_MAX = { text: 600, textarea: 4000, rich: 40000 };

  // Breakpoints, same as the pages built in Vev: desktop is the main layout,
  // tablet and mobile inherit from it and may override style fields.
  var DEVICES = [
    { id: "desktop", label: "Desktop", width: 1280, query: null },
    { id: "tablet", label: "Nettbrett", width: 768, query: "(max-width: 1023px)" },
    { id: "mobile", label: "Mobil", width: 390, query: "(max-width: 599px)" },
  ];

  var ANIMATIONS = [
    ["none", "Ingen"],
    ["fade", "Ton inn"],
    ["fade-up", "Ton inn nedenfra"],
    ["slide-left", "Skli inn fra venstre"],
    ["slide-right", "Skli inn fra høyre"],
    ["zoom", "Zoom inn"],
  ];

  // ---- style fields every section has -------------------------------------
  // `rs: true` → may differ per device (stored under section.rs[device].style).
  var STYLE_FIELDS = [
    {
      key: "bg",
      type: "select",
      label: "Bakgrunn",
      options: [
        ["none", "Ingen (hvit)"],
        ["soft", "Lys (fra tema)"],
        ["brand", "Merkefarge"],
        ["dark", "Mørk"],
        ["custom", "Egen farge"],
        ["image", "Bilde"],
      ],
      default: "none",
    },
    { key: "bgColor", type: "color", label: "Bakgrunnsfarge", default: "", when: { bg: "custom" } },
    { key: "bgImage", type: "image", label: "Bakgrunnsbilde", when: { bg: "image" } },
    { key: "overlay", type: "number", label: "Mørklegging (%)", min: 0, max: 90, step: 5, default: 40, when: { bg: "image" } },
    {
      key: "pad",
      type: "select",
      label: "Luft over og under",
      options: [["none", "Ingen"], ["s", "Liten"], ["m", "Middels"], ["l", "Stor"], ["xl", "Ekstra stor"]],
      default: "m",
      rs: true,
    },
    {
      key: "align",
      type: "select",
      label: "Tekstjustering",
      options: [["", "Standard"], ["left", "Venstre"], ["center", "Midtstilt"]],
      default: "",
      rs: true,
    },
    { key: "anim", type: "select", label: "Animasjon inn", options: ANIMATIONS, default: "fade-up" },
    { key: "anchor", type: "text", label: "Anker-ID (for lenker til #id)", max: 40, default: "" },
  ];

  // ---- the blocks ----------------------------------------------------------
  // `group` decides where the block sits in the "Legg til" menu.
  var BLOCKS = {
    hero: {
      label: "Hero",
      group: "Topp",
      icon: "panel-top",
      desc: "Stor åpning: bilde eller video, tittel og ingress.",
      fields: [
        { key: "kicker", type: "text", label: "Stikktittel", max: 40, default: "", hint: "Kort over tittelen, ofte produktnavnet. Store bokstaver." },
        { key: "title", type: "text", label: "Tittel (H1)", max: 90, default: "Tittel på saken", required: true, hint: "Hovedtittel. Konkret og nysgjerrighetsskapende, ikke reklamespråk." },
        { key: "ingress", type: "textarea", label: "Ingress", max: 260, default: "", hint: "1–2 setninger som sier hva leseren får." },
        { key: "image", type: "image", label: "Bilde (desktop)", ai: true, hint: "Bilde-ID fra listen over tilgjengelige bilder." },
        { key: "imageMobile", type: "image", label: "Bilde (mobil, stående)", ai: false },
        { key: "video", type: "video", label: "Bakgrunnsvideo (desktop)", ai: false },
        { key: "videoMobile", type: "video", label: "Bakgrunnsvideo (mobil, stående)", ai: false },
        {
          key: "layout",
          type: "select",
          label: "Oppsett",
          options: [["overlay", "Tekst over bildet"], ["split", "Bilde og tekst side om side"], ["below", "Bilde over, tekst under"]],
          default: "overlay",
          ai: false,
        },
        { key: "height", type: "select", label: "Høyde", options: [["full", "Hele skjermen"], ["tall", "Høy (75 %)"], ["auto", "Etter innhold"]], default: "full", ai: false },
        { key: "position", type: "select", label: "Tekstplassering", options: [["center", "Midt"], ["bottom", "Nede"], ["bottom-left", "Nede til venstre"]], default: "bottom", ai: false },
        { key: "overlay", type: "number", label: "Mørklegging (%)", min: 0, max: 90, step: 5, default: 35, ai: false },
        { key: "scrollHint", type: "toggle", label: "Vis «scroll ned»-pil", default: true, ai: false },
      ],
      style: { pad: "none", anim: "fade" },
    },

    richText: {
      label: "Brødtekst",
      group: "Tekst",
      icon: "pilcrow",
      desc: "Avsnitt, mellomtitler, lister, sitater og lenker.",
      fields: [
        { key: "html", type: "rich", label: "Tekst", max: 4000, default: "<p>Skriv teksten her.</p>", required: true, hint: "Brødtekst. Korte avsnitt (2–4 setninger). Mellomtitler (h2) for å dele opp. Konkrete fakta." },
        { key: "dropCap", type: "toggle", label: "Stor forbokstav", default: false, ai: false },
        { key: "width", type: "select", label: "Bredde", options: [["text", "Lesebredde"], ["wide", "Bred"]], default: "text", ai: false },
      ],
    },

    image: {
      label: "Bilde",
      group: "Media",
      icon: "image",
      desc: "Ett eller to bilder med bildetekst.",
      fields: [
        { key: "image", type: "image", label: "Bilde", required: true, hint: "Bilde-ID." },
        { key: "alt", type: "text", label: "Alternativ tekst", max: 140, default: "", hint: "Beskriv hva bildet viser, for skjermlesere." },
        { key: "caption", type: "text", label: "Bildetekst", max: 160, default: "" },
        { key: "image2", type: "image", label: "Bilde 2 (valgfritt)", hint: "Valgfritt andre bilde ved siden av, eller null." },
        { key: "alt2", type: "text", label: "Alternativ tekst 2", max: 140, default: "" },
        { key: "caption2", type: "text", label: "Bildetekst 2", max: 160, default: "" },
        { key: "size", type: "select", label: "Størrelse", options: [["text", "Lesebredde"], ["wide", "Bred"], ["full", "Hele bredden"]], default: "wide", ai: false },
        { key: "ratio", type: "select", label: "Format", options: [["auto", "Originalt"], ["16:9", "16:9"], ["4:3", "4:3"], ["1:1", "1:1"], ["3:4", "3:4"]], default: "auto", ai: false },
      ],
    },

    imageText: {
      label: "Bilde + tekst",
      group: "Media",
      icon: "layout-panel-left",
      desc: "Bilde på den ene siden, tekst på den andre.",
      fields: [
        { key: "image", type: "image", label: "Bilde", required: true, hint: "Bilde-ID." },
        { key: "alt", type: "text", label: "Alternativ tekst", max: 140, default: "" },
        { key: "title", type: "text", label: "Mellomtittel", max: 80, default: "" },
        { key: "html", type: "rich", label: "Tekst", max: 1400, default: "<p>Tekst ved siden av bildet.</p>" },
        { key: "ctaLabel", type: "text", label: "Lenketekst", max: 40, default: "" },
        { key: "ctaUrl", type: "url", label: "Lenke", default: "", ai: false },
        { key: "side", type: "select", label: "Bildet står", options: [["left", "Til venstre"], ["right", "Til høyre"]], default: "left", ai: false },
        { key: "ratio", type: "select", label: "Bildeformat", options: [["4:5", "4:5"], ["1:1", "1:1"], ["4:3", "4:3"], ["auto", "Originalt"]], default: "4:5", ai: false },
      ],
    },

    factBox: {
      label: "Faktaboks",
      group: "Tekst",
      icon: "list-checks",
      desc: "Fakta i punktform, kan lukkes sammen.",
      fields: [
        { key: "title", type: "text", label: "Tittel", max: 70, default: "Fakta", required: true },
        { key: "intro", type: "textarea", label: "Innledning", max: 240, default: "" },
        {
          key: "items",
          type: "list",
          label: "Punkter",
          maxItems: 16,
          itemLabel: "Punkt",
          item: [{ key: "text", type: "text", label: "Punkt", max: 180, default: "" }],
          default: [{ text: "Første faktapunkt" }, { text: "Andre faktapunkt" }],
          hint: "Konkrete, etterprøvbare fakta fra kildene. Ingen påstander uten grunnlag.",
        },
        { key: "variant", type: "select", label: "Farge", options: [["brand", "Merkefarge"], ["soft", "Lys"], ["dark", "Mørk"]], default: "brand", ai: false },
        { key: "collapsible", type: "toggle", label: "Lukket til leseren åpner", default: true, ai: false },
      ],
    },

    cta: {
      label: "Handling (CTA)",
      group: "Handling",
      icon: "mouse-pointer-click",
      desc: "Knapp, bånd eller lenke til annonsøren.",
      fields: [
        { key: "variant", type: "select", label: "Type", options: [["band", "Bånd med tittel og knapp"], ["button", "Bare knapp"], ["link", "Tekstlenke med pil"]], default: "band", ai: false },
        { key: "title", type: "text", label: "Tittel", max: 70, default: "Klar for å prøve?", hint: "Kort oppfordring. Bare for bånd." },
        { key: "text", type: "textarea", label: "Tekst", max: 200, default: "" },
        { key: "label", type: "text", label: "Knappetekst", max: 32, default: "Les mer", required: true, hint: "2–4 ord, verb først (Book prøvekjøring, Se tilbudet)." },
        { key: "url", type: "url", label: "Lenke", default: "", required: true, ai: false },
        { key: "label2", type: "text", label: "Knapp 2 (valgfri)", max: 32, default: "" },
        { key: "url2", type: "url", label: "Lenke 2", default: "", ai: false },
      ],
      style: { bg: "brand" },
    },

    quote: {
      label: "Sitat",
      group: "Tekst",
      icon: "quote",
      desc: "Stort sitat med navn.",
      fields: [
        { key: "text", type: "textarea", label: "Sitat", max: 260, default: "Et godt sitat som oppsummerer saken.", required: true, hint: "Bare ordrett sitat fra kildene. Aldri dikt opp sitater." },
        { key: "name", type: "text", label: "Navn", max: 60, default: "" },
        { key: "role", type: "text", label: "Tittel / rolle", max: 80, default: "" },
        { key: "image", type: "image", label: "Portrett (valgfritt)", ai: false },
        { key: "size", type: "select", label: "Størrelse", options: [["large", "Stor"], ["medium", "Middels"]], default: "large", ai: false },
      ],
    },

    video: {
      label: "Video",
      group: "Media",
      icon: "clapperboard",
      desc: "Film med avspiller, eller stemningsvideo som går av seg selv.",
      ai: false,
      fields: [
        { key: "video", type: "video", label: "Video (desktop)", required: true },
        { key: "videoMobile", type: "video", label: "Video (mobil)" },
        { key: "poster", type: "image", label: "Forsidebilde (valgfritt)" },
        { key: "mode", type: "select", label: "Avspilling", options: [["player", "Med avspiller (lyd, kontroller)"], ["ambient", "Stemning (lydløs, går i loop)"]], default: "player" },
        { key: "ratio", type: "select", label: "Format desktop", options: [["16:9", "16:9"], ["9:16", "9:16"], ["1:1", "1:1"], ["4:5", "4:5"]], default: "16:9" },
        { key: "ratioMobile", type: "select", label: "Format mobil", options: [["", "Som desktop"], ["16:9", "16:9"], ["9:16", "9:16"], ["1:1", "1:1"], ["4:5", "4:5"]], default: "" },
        { key: "caption", type: "text", label: "Bildetekst", max: 160, default: "" },
        { key: "size", type: "select", label: "Størrelse", options: [["text", "Lesebredde"], ["wide", "Bred"], ["full", "Hele bredden"]], default: "wide" },
      ],
    },

    stickyStory: {
      label: "Scrollfortelling",
      group: "Effekter",
      icon: "layers",
      desc: "Bilde eller video står fast mens tekstkort ruller over.",
      fields: [
        { key: "image", type: "image", label: "Bakgrunnsbilde", hint: "Bilde-ID for den faste bakgrunnen." },
        { key: "imageMobile", type: "image", label: "Bakgrunnsbilde (mobil)", ai: false },
        { key: "video", type: "video", label: "Bakgrunnsvideo", ai: false },
        { key: "videoMobile", type: "video", label: "Bakgrunnsvideo (mobil)", ai: false },
        {
          key: "slides",
          type: "list",
          label: "Kort",
          maxItems: 6,
          itemLabel: "Kort",
          item: [
            { key: "title", type: "text", label: "Tittel", max: 70, default: "" },
            { key: "text", type: "textarea", label: "Tekst", max: 420, default: "" },
            { key: "image", type: "image", label: "Bytt bakgrunn til (valgfritt)", ai: false },
          ],
          default: [{ title: "Første kort", text: "Tekst som ruller over bildet." }, { title: "Andre kort", text: "Neste del av fortellingen." }],
          hint: "2–4 kort som forteller en historie trinn for trinn.",
        },
        { key: "transition", type: "select", label: "Bakgrunnsovergang", options: [["fade", "Ton over"], ["zoom", "Zoom"], ["none", "Ingen"]], default: "fade", ai: false },
        { key: "cardSide", type: "select", label: "Kortene står", options: [["left", "Til venstre"], ["center", "Midt"], ["right", "Til høyre"]], default: "left", ai: false },
        { key: "overlay", type: "number", label: "Mørklegging (%)", min: 0, max: 90, step: 5, default: 20, ai: false },
      ],
      style: { pad: "none", anim: "none" },
    },

    scrollVideo: {
      label: "Scroll-video",
      group: "Effekter",
      icon: "film",
      desc: "Videoen spilles av mens leseren scroller.",
      ai: false,
      fields: [
        { key: "video", type: "video", label: "Video", required: true, help: "Korte klipp (5–20 sek) uten lyd fungerer best." },
        { key: "videoMobile", type: "video", label: "Video (mobil)" },
        { key: "length", type: "select", label: "Scroll-lengde", options: [["2", "Kort (2 skjermer)"], ["3", "Middels (3 skjermer)"], ["5", "Lang (5 skjermer)"]], default: "3" },
        {
          key: "captions",
          type: "list",
          label: "Tekster underveis",
          maxItems: 5,
          itemLabel: "Tekst",
          item: [{ key: "text", type: "text", label: "Tekst", max: 120, default: "" }],
          default: [],
        },
      ],
      style: { pad: "none", anim: "none" },
    },

    parallaxImage: {
      label: "Parallakse-bilde",
      group: "Effekter",
      icon: "move-vertical",
      desc: "Bilde som beveger seg saktere enn siden.",
      fields: [
        { key: "image", type: "image", label: "Bilde", required: true, hint: "Bilde-ID." },
        { key: "alt", type: "text", label: "Alternativ tekst", max: 140, default: "" },
        { key: "title", type: "text", label: "Tekst over bildet (valgfritt)", max: 90, default: "" },
        { key: "height", type: "select", label: "Høyde", options: [["m", "Middels"], ["l", "Høy"], ["full", "Hele skjermen"]], default: "l", ai: false },
        { key: "speed", type: "select", label: "Effekt", options: [["slow", "Svak"], ["medium", "Middels"], ["fast", "Sterk"]], default: "medium", ai: false },
      ],
      style: { pad: "none" },
    },

    stats: {
      label: "Tall",
      group: "Tekst",
      icon: "chart-no-axes-column",
      desc: "Store nøkkeltall som teller opp.",
      fields: [
        { key: "title", type: "text", label: "Tittel (valgfritt)", max: 70, default: "" },
        {
          key: "items",
          type: "list",
          label: "Tall",
          maxItems: 4,
          itemLabel: "Tall",
          item: [
            { key: "value", type: "text", label: "Tall", max: 12, default: "", hint: "Bare tallet, f.eks. 402 eller 7,5." },
            { key: "unit", type: "text", label: "Enhet", max: 12, default: "", hint: "f.eks. km, %, kr" },
            { key: "label", type: "text", label: "Forklaring", max: 70, default: "" },
          ],
          default: [{ value: "402", unit: "km", label: "rekkevidde" }, { value: "30", unit: "min", label: "hurtiglading" }],
          hint: "Bare tall som står i kildene.",
        },
        { key: "countUp", type: "toggle", label: "Tell opp når synlig", default: true, ai: false },
      ],
    },

    productCards: {
      label: "Produktkort",
      group: "Handling",
      icon: "shopping-bag",
      desc: "Produkter med bilde, pris og lenke.",
      fields: [
        { key: "title", type: "text", label: "Tittel (valgfritt)", max: 70, default: "" },
        {
          key: "items",
          type: "list",
          label: "Produkter",
          maxItems: 12,
          itemLabel: "Produkt",
          item: [
            { key: "image", type: "image", label: "Bilde" },
            { key: "name", type: "text", label: "Navn", max: 60, default: "" },
            { key: "text", type: "textarea", label: "Kort tekst", max: 160, default: "" },
            { key: "price", type: "text", label: "Pris", max: 24, default: "", hint: "Bare pris fra kildene, f.eks. 1 299,-" },
            { key: "oldPrice", type: "text", label: "Før-pris", max: 24, default: "" },
            { key: "badge", type: "text", label: "Merke", max: 20, default: "" },
            { key: "url", type: "url", label: "Lenke", default: "", ai: false },
          ],
          default: [{ name: "Produkt", text: "", price: "" }],
        },
        { key: "buttonLabel", type: "text", label: "Knappetekst", max: 24, default: "Se produktet" },
        { key: "columns", type: "select", label: "Kolonner (desktop)", options: [["2", "2"], ["3", "3"], ["4", "4"]], default: "3", ai: false },
      ],
    },

    gallery: {
      label: "Galleri",
      group: "Media",
      icon: "gallery-horizontal",
      desc: "Flere bilder som karusell eller rutenett.",
      fields: [
        {
          key: "items",
          type: "list",
          label: "Bilder",
          maxItems: 20,
          itemLabel: "Bilde",
          item: [
            { key: "image", type: "image", label: "Bilde" },
            { key: "alt", type: "text", label: "Alternativ tekst", max: 140, default: "" },
            { key: "caption", type: "text", label: "Bildetekst", max: 140, default: "" },
          ],
          default: [],
        },
        { key: "mode", type: "select", label: "Visning", options: [["carousel", "Karusell"], ["grid", "Rutenett"]], default: "carousel", ai: false },
      ],
    },

    compare: {
      label: "Før / etter",
      group: "Effekter",
      icon: "columns-2",
      desc: "To bilder med en skyveknapp mellom.",
      ai: false,
      fields: [
        { key: "before", type: "image", label: "Før", required: true },
        { key: "after", type: "image", label: "Etter", required: true },
        { key: "beforeLabel", type: "text", label: "Etikett før", max: 20, default: "Før" },
        { key: "afterLabel", type: "text", label: "Etikett etter", max: 20, default: "Etter" },
        { key: "alt", type: "text", label: "Alternativ tekst", max: 140, default: "" },
      ],
    },

    accordion: {
      label: "Spørsmål og svar",
      group: "Tekst",
      icon: "list-collapse",
      desc: "Sammenleggbare spørsmål og svar.",
      fields: [
        { key: "title", type: "text", label: "Tittel (valgfritt)", max: 70, default: "Ofte stilte spørsmål" },
        {
          key: "items",
          type: "list",
          label: "Spørsmål",
          maxItems: 12,
          itemLabel: "Spørsmål",
          item: [
            { key: "q", type: "text", label: "Spørsmål", max: 120, default: "" },
            { key: "a", type: "textarea", label: "Svar", max: 700, default: "" },
          ],
          default: [{ q: "Spørsmål?", a: "Svar." }],
        },
      ],
    },

    quiz: {
      label: "Quiz",
      group: "Effekter",
      icon: "badge-question-mark",
      desc: "Enkle spørsmål med svar og forklaring.",
      fields: [
        { key: "title", type: "text", label: "Tittel", max: 70, default: "Test deg selv" },
        {
          key: "questions",
          type: "list",
          label: "Spørsmål",
          maxItems: 8,
          itemLabel: "Spørsmål",
          item: [
            { key: "q", type: "text", label: "Spørsmål", max: 140, default: "" },
            { key: "options", type: "textarea", label: "Svaralternativer (ett per linje)", max: 400, default: "", hint: "2–4 alternativer, ett per linje." },
            { key: "correct", type: "number", label: "Riktig svar (nr.)", min: 1, max: 4, step: 1, default: 1 },
            { key: "explain", type: "textarea", label: "Forklaring", max: 300, default: "" },
          ],
          default: [{ q: "Spørsmål?", options: "Alternativ A\nAlternativ B", correct: 1, explain: "" }],
        },
      ],
    },

    chart: {
      label: "Søylediagram",
      group: "Tekst",
      icon: "chart-bar",
      desc: "Enkle søyler som vokser når de vises.",
      fields: [
        { key: "title", type: "text", label: "Tittel", max: 80, default: "" },
        {
          key: "items",
          type: "list",
          label: "Søyler",
          maxItems: 10,
          itemLabel: "Søyle",
          item: [
            { key: "label", type: "text", label: "Navn", max: 40, default: "" },
            { key: "value", type: "number", label: "Verdi", min: -1e9, max: 1e9, step: 0.1, default: 0 },
          ],
          default: [{ label: "A", value: 40 }, { label: "B", value: 70 }],
        },
        { key: "unit", type: "text", label: "Enhet", max: 12, default: "" },
        { key: "source", type: "text", label: "Kilde", max: 120, default: "" },
      ],
    },

    embed: {
      label: "Innbygging",
      group: "Media",
      icon: "code-xml",
      desc: "YouTube, Vimeo, Flourish, Google Maps m.m.",
      ai: false,
      fields: [
        { key: "url", type: "url", label: "Lenke", required: true, help: "Lim inn vanlig lenke fra YouTube, Vimeo, Flourish, Datawrapper, Spotify eller Google Maps." },
        { key: "title", type: "text", label: "Tittel (for skjermlesere)", max: 100, default: "" },
        { key: "ratio", type: "select", label: "Format", options: [["16:9", "16:9"], ["4:3", "4:3"], ["1:1", "1:1"], ["9:16", "9:16"]], default: "16:9" },
      ],
    },

    divider: {
      label: "Skillelinje / luft",
      group: "Tekst",
      icon: "separator-horizontal",
      desc: "Luft eller strek mellom seksjoner.",
      ai: false,
      fields: [{ key: "line", type: "toggle", label: "Vis strek", default: true }],
      style: { pad: "s", anim: "none" },
    },
  };

  var ORDER = [
    "hero", "richText", "image", "imageText", "factBox", "quote", "stats", "cta",
    "productCards", "video", "gallery", "stickyStory", "scrollVideo", "parallaxImage",
    "compare", "accordion", "quiz", "chart", "embed", "divider",
  ];

  var GROUPS = ["Topp", "Tekst", "Media", "Handling", "Effekter"];

  // ---- theme ---------------------------------------------------------------
  var THEME_COLORS = [
    ["primary", "Merkefarge", "#0b3d91"],
    ["accent", "Knapp / aksent", "#1e6fe8"],
    ["dark", "Mørk", "#0b1730"],
    ["soft", "Lys bakgrunn", "#eef3fb"],
    ["text", "Tekst", "#1b1f27"],
    ["link", "Lenker", "#1e5fbf"],
  ];

  var DEFAULT_THEME = {
    colors: {
      primary: "#0b3d91",
      accent: "#1e6fe8",
      dark: "#0b1730",
      soft: "#eef3fb",
      text: "#1b1f27",
      link: "#1e5fbf",
    },
    fonts: {
      heading: { family: "Source Serif 4", source: "google", weight: 700 },
      body: { family: "Source Sans 3", source: "google", weight: 400 },
    },
    headingCase: "none",
    radius: 10,
    button: "solid",
    logo: "",
  };

  function fieldsOf(type) {
    var b = BLOCKS[type];
    return b ? b.fields : [];
  }

  function field(type, key) {
    var list = fieldsOf(type);
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
  }

  function styleField(key) {
    for (var i = 0; i < STYLE_FIELDS.length; i++) if (STYLE_FIELDS[i].key === key) return STYLE_FIELDS[i];
    return null;
  }

  /** Whether the model may write this field (block-level `ai:false` wins). */
  function aiWrites(type, f) {
    var b = BLOCKS[type];
    if (!b || b.ai === false) return false;
    return f.ai !== false;
  }

  /** Block types the AI may choose when it plans a page. */
  function aiBlockTypes() {
    return ORDER.filter(function (t) {
      return BLOCKS[t].ai !== false;
    });
  }

  return {
    VERSION: 1,
    HARD_MAX: HARD_MAX,
    DEVICES: DEVICES,
    ANIMATIONS: ANIMATIONS,
    STYLE_FIELDS: STYLE_FIELDS,
    BLOCKS: BLOCKS,
    ORDER: ORDER,
    GROUPS: GROUPS,
    THEME_COLORS: THEME_COLORS,
    DEFAULT_THEME: DEFAULT_THEME,
    fieldsOf: fieldsOf,
    field: field,
    styleField: styleField,
    aiWrites: aiWrites,
    aiBlockTypes: aiBlockTypes,
  };
});
