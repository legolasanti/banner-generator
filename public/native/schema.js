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
    ["blur", "Fra uskarp til skarp"],
    ["reveal", "Avdekk nedenfra (maske)"],
    ["stagger", "Elementene ett og ett"],
    ["rise", "Løft med fjæring"],
    ["mask-left", "Avdekk fra venstre (maske)"],
    ["iris", "Åpnes som en sirkel"],
    ["tilt", "Vippes opp i 3D"],
    ["drop", "Senkes ned ovenfra"],
    ["settle", "Fra nært til normalt (zoom ut)"],
  ];

  // Every entrance that actually moves (the fields for tempo, curve … only
  // show for these).
  var MOVING = ANIMATIONS.map(function (a) { return a[0]; }).filter(function (k) { return k !== "none"; });

  // How the entrance moves. "smooth" is the curve every page had before.
  var EASINGS = [
    ["smooth", "Myk (standard)"],
    ["expo", "Elegant – rask start, lang utglidning"],
    ["spring", "Fjærende – skyter litt over"],
    ["snappy", "Kvikk inn og ut"],
    ["gentle", "Rolig og jevn"],
  ];

  // How a section takes over from the one above it while the reader scrolls.
  var TRANSITIONS = [
    ["none", "Ingen (vanlig rulling)"],
    ["stack", "Legger seg over forrige som et kort"],
    ["cover", "Ruller over forrige (forrige står fast)"],
    ["curtain", "Gardin – åpnes fra midten"],
    ["zoom", "Vokser ut til full bredde"],
    ["iris", "Sirkel som åpner seg"],
    ["blend", "Fargene flyter over i hverandre"],
  ];

  var HEADING_FX = [
    ["none", "Ingen"],
    ["words", "Ord for ord nedenfra (maske)"],
    ["fade-words", "Ordene tones inn ett og ett"],
    ["letters", "Bokstav for bokstav"],
    ["highlight", "Understrek tegnes inn"],
  ];

  // Section edge shapes (the section's own colour bites into its neighbour).
  var SHAPES = [["none", "Rett"], ["wave", "Bølge"], ["slant", "Skrå"], ["curve", "Bue"], ["zigzag", "Sagtann"]];

  // ---- style fields every section has -------------------------------------
  // `rs: true` → may differ per device (stored under section.rs[device].style).
  // `group` → heading in the Stil tab. `when` values may be arrays (any of).
  var STYLE_FIELDS = [
    {
      key: "bg",
      type: "select",
      label: "Bakgrunn",
      group: "Bakgrunn",
      options: [
        ["none", "Ingen (sidefarge)"],
        ["soft", "Lys (fra tema)"],
        ["brand", "Merkefarge"],
        ["dark", "Mørk"],
        ["custom", "Egen farge"],
        ["gradient", "Fargeovergang"],
        ["image", "Bilde"],
        ["video", "Video"],
      ],
      default: "none",
    },
    { key: "bgColor", type: "color", label: "Farge", default: "", when: { bg: ["custom", "gradient"] }, group: "Bakgrunn" },
    { key: "bgColor2", type: "color", label: "Farge 2", default: "", when: { bg: "gradient" }, group: "Bakgrunn", help: "Tom = mørk farge fra temaet." },
    {
      key: "bgGradient",
      type: "select",
      label: "Type overgang",
      options: [["linear", "Lineær"], ["radial", "Fra midten"], ["mesh", "Myk «aurora»"]],
      default: "linear",
      when: { bg: "gradient" },
      group: "Bakgrunn",
    },
    { key: "bgAngle", type: "number", label: "Vinkel (grader)", min: 0, max: 360, step: 15, default: 160, when: { bg: "gradient", bgGradient: "linear" }, group: "Bakgrunn" },
    { key: "bgImage", type: "image", label: "Bakgrunnsbilde", when: { bg: "image" }, group: "Bakgrunn" },
    { key: "bgImageMobile", type: "image", label: "Bakgrunnsbilde (mobil)", when: { bg: "image" }, group: "Bakgrunn" },
    { key: "bgVideo", type: "video", label: "Bakgrunnsvideo", when: { bg: "video" }, group: "Bakgrunn", help: "Lydløs, går i loop. Kort klipp (under 15 MB)." },
    { key: "bgVideoMobile", type: "video", label: "Bakgrunnsvideo (mobil)", when: { bg: "video" }, group: "Bakgrunn" },
    { key: "overlay", type: "number", label: "Mørklegging (%)", min: 0, max: 90, step: 5, default: 40, when: { bg: ["image", "video"] }, group: "Bakgrunn" },
    {
      key: "bgFx",
      type: "select",
      label: "Bakgrunnseffekt",
      options: [["none", "Ingen"], ["fixed", "Står fast (innholdet ruller over)"], ["kenburns", "Langsom zoom"], ["parallax", "Parallakse"]],
      default: "none",
      when: { bg: ["image", "video", "gradient"] },
      group: "Bakgrunn",
    },
    { key: "grain", type: "toggle", label: "Filmkorn / tekstur", default: false, group: "Bakgrunn" },
    {
      key: "tone",
      type: "select",
      label: "Tekstfarge",
      options: [["auto", "Automatisk"], ["light", "Lys tekst"], ["dark", "Mørk tekst"]],
      default: "auto",
      group: "Bakgrunn",
    },
    {
      key: "pad",
      type: "select",
      label: "Luft over og under",
      group: "Oppsett",
      options: [["none", "Ingen"], ["s", "Liten"], ["m", "Middels"], ["l", "Stor"], ["xl", "Ekstra stor"]],
      default: "m",
      rs: true,
    },
    {
      key: "minH",
      type: "select",
      label: "Minimum høyde",
      group: "Oppsett",
      options: [["auto", "Etter innhold"], ["half", "Halv skjerm"], ["screen", "Hel skjerm"]],
      default: "auto",
      rs: true,
    },
    {
      key: "valign",
      type: "select",
      label: "Innholdet står",
      group: "Oppsett",
      options: [["top", "Øverst"], ["center", "Midt"], ["bottom", "Nederst"]],
      default: "center",
      when: { minH: ["half", "screen"] },
    },
    {
      key: "align",
      type: "select",
      label: "Tekstjustering",
      group: "Oppsett",
      options: [["", "Standard"], ["left", "Venstre"], ["center", "Midtstilt"]],
      default: "",
      rs: true,
    },
    { key: "shapeTop", type: "select", label: "Kant øverst", group: "Oppsett", options: SHAPES, default: "none" },
    { key: "shapeBottom", type: "select", label: "Kant nederst", group: "Oppsett", options: SHAPES, default: "none" },
    { key: "anim", type: "select", label: "Animasjon inn", group: "Bevegelse", options: ANIMATIONS, default: "fade-up" },
    {
      key: "animSpeed",
      type: "select",
      label: "Tempo",
      group: "Bevegelse",
      options: [["fast", "Raskt"], ["normal", "Normalt"], ["slow", "Rolig"], ["xslow", "Svært rolig"]],
      default: "normal",
      when: { anim: MOVING },
    },
    {
      key: "animEase",
      type: "select",
      label: "Bevegelseskurve",
      group: "Bevegelse",
      options: EASINGS,
      default: "smooth",
      when: { anim: MOVING },
      help: "Elegant passer til det meste. Fjærende gir liv til kort og knapper.",
    },
    { key: "animDelay", type: "number", label: "Forsinkelse (sek)", group: "Bevegelse", min: 0, max: 2, step: 0.1, default: 0, when: { anim: MOVING } },
    {
      key: "animStep",
      type: "number",
      label: "Tid mellom elementene (ms)",
      group: "Bevegelse",
      min: 30,
      max: 400,
      step: 10,
      default: 90,
      when: { anim: "stagger" },
      help: "Kort, tall, steg og produkter kommer inn etter hverandre med dette mellomrommet.",
    },
    {
      key: "animRepeat",
      type: "toggle",
      label: "Spill av hver gang seksjonen kommer inn",
      group: "Bevegelse",
      default: false,
      when: { anim: MOVING },
      help: "Av: bare første gang. På: også når leseren scroller tilbake.",
    },
    {
      key: "headFx",
      type: "select",
      label: "Mellomtitler",
      group: "Bevegelse",
      options: HEADING_FX,
      default: "none",
      help: "Gjelder seksjonens mellomtitler (H2). Heroens tittel har sin egen innstilling under Innhold.",
    },
    {
      key: "transition",
      type: "select",
      label: "Overgang fra seksjonen over",
      group: "Bevegelse",
      options: TRANSITIONS,
      default: "none",
      help: "Hvordan seksjonen tar over skjermen fra den over mens leseren scroller. Bruk på noen få, store skifter.",
    },
    {
      key: "scrollFx",
      type: "select",
      label: "Effekt mens man scroller",
      group: "Bevegelse",
      options: [
        ["none", "Ingen"],
        ["fade-out", "Tones ut når den forlater skjermen"],
        ["scale-in", "Vokser inn fra 90 %"],
        ["drift", "Innholdet glir saktere (dybde)"],
        ["sticky-fade", "Står fast og tones ut (scene-skifte)"],
        ["slide-x", "Glir sidelengs (stor tekst)"],
        ["tilt-in", "Vippes inn i 3D"],
        ["blur-out", "Blir uskarp når den forlater skjermen"],
        ["layers", "Kortene flytter seg i lag (dybde)"],
      ],
      default: "none",
      help: "Følger scrollingen direkte. Én slik effekt per skjermbilde er nok.",
    },
    { key: "anchor", type: "text", label: "Anker-ID (for lenker til #id)", group: "Navigasjon", max: 40, default: "" },
    { key: "chapter", type: "text", label: "Navn i kapittelmenyen", group: "Navigasjon", max: 40, default: "", help: "Fyll ut for at seksjonen skal få et punkt i kapittelmenyen (slås på under Side)." },
  ];

  // ---- page-level extras (Side-panelet) ----------------------------------
  // Everything that is not a section but still part of the reading
  // experience. Normalised with the same field rules as section props.
  var EXTRA_FIELDS = [
    { key: "progress", type: "toggle", label: "Lesefremdrift (stripe øverst)", default: true, group: "Lesing" },
    {
      key: "chapterNav",
      type: "select",
      label: "Kapittelmeny",
      group: "Lesing",
      options: [["none", "Av"], ["top", "Stripe under merkingen"], ["side", "Prikker i siden (desktop)"]],
      default: "none",
      help: "Viser seksjoner som har «Navn i kapittelmenyen» utfylt.",
    },
    { key: "readTime", type: "toggle", label: "Vis lesetid i hero", default: false, group: "Lesing" },
    { key: "stickyCta", type: "toggle", label: "Flytende knapp (vises etter litt scrolling)", default: false, group: "Flytende knapp" },
    { key: "stickyLabel", type: "text", label: "Knappetekst", max: 32, default: "Les mer", when: { stickyCta: true }, group: "Flytende knapp" },
    { key: "stickyUrl", type: "url", label: "Lenke", default: "", when: { stickyCta: true }, group: "Flytende knapp" },
    {
      key: "stickyAfter",
      type: "number",
      label: "Vises etter (% av siden)",
      min: 5,
      max: 90,
      step: 5,
      default: 25,
      when: { stickyCta: true },
      group: "Flytende knapp",
    },
    {
      key: "motion",
      type: "select",
      label: "Styrke på animasjonene",
      group: "Bevegelse",
      options: [["calm", "Rolig – korte bevegelser"], ["normal", "Normal"], ["bold", "Kraftig – store bevegelser"]],
      default: "normal",
      help: "Gjelder alle seksjonene. Lesere som har slått av animasjoner, ser ingen bevegelse uansett.",
    },
    {
      key: "hoverFx",
      type: "select",
      label: "Når musen er over",
      group: "Bevegelse",
      options: [
        ["none", "Ingen effekt"],
        ["subtle", "Diskret – knapper og lenker"],
        ["lift", "Løft – også kort og produkter løftes"],
        ["rich", "Rik – kort løftes og bildene zoomer"],
      ],
      default: "subtle",
    },
    { key: "feedback", type: "toggle", label: "«Likte du saken?» Ja/Nei nederst", default: false, group: "Avslutning" },
    { key: "feedbackQ", type: "text", label: "Spørsmål", max: 80, default: "Likte du denne saken?", when: { feedback: true }, group: "Avslutning" },
    { key: "credit", type: "toggle", label: "Vis «Produsert av … for …» over bunnteksten", default: true, group: "Avslutning" },
    { key: "customCss", type: "textarea", label: "Egen CSS (for avanserte justeringer)", max: 20000, hardMax: 20000, ai: false, default: "", group: "Avansert", help: "Gjelder bare seksjonene på denne siden (ikke merkingen, kapittelmenyen eller bunnteksten). Ingen @import og ingen eksterne adresser." },
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
          options: [
            ["overlay", "Tekst over bildet"],
            ["split", "Bilde og tekst side om side"],
            ["below", "Bilde over, tekst under"],
            ["framed", "Bilde i ramme, tekst under"],
            ["zoom", "Bildet vokser til full bredde ved scroll"],
            ["type", "Typografisk (stor tittel, ingen bilde)"],
          ],
          default: "overlay",
          ai: false,
        },
        { key: "titleSize", type: "select", label: "Tittelstørrelse", options: [["m", "Normal"], ["l", "Stor"], ["xl", "Ekstra stor"], ["xxl", "Gigantisk"]], default: "l", ai: false },
        { key: "titleFx", type: "select", label: "Tittel-animasjon", options: [["none", "Ingen"], ["words", "Ord for ord"], ["lines", "Linje for linje"], ["letters", "Bokstav for bokstav"]], default: "none", ai: false },
        { key: "kenBurns", type: "toggle", label: "Langsom zoom i bildet", default: false, ai: false },
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
        { key: "lead", type: "toggle", label: "Første avsnitt som ingress (større)", default: false, ai: false },
        { key: "width", type: "select", label: "Bredde", options: [["text", "Lesebredde"], ["wide", "Bred"]], default: "text", ai: false },
        { key: "columns", type: "select", label: "Spalter (desktop)", options: [["1", "Én"], ["2", "To"]], default: "1", ai: false },
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
        { key: "ratio", type: "select", label: "Format", options: [["auto", "Originalt"], ["21:9", "21:9 (kino)"], ["16:9", "16:9"], ["4:3", "4:3"], ["1:1", "1:1"], ["3:4", "3:4"], ["4:5", "4:5"]], default: "auto", ai: false },
        { key: "credit", type: "text", label: "Foto (kreditering)", max: 80, default: "", ai: false },
        {
          key: "fx",
          type: "select",
          label: "Effekt",
          options: [["none", "Ingen"], ["zoom", "Zoomer inn mens man scroller"], ["reveal", "Avdekkes ved scroll (gardin)"], ["kenburns", "Langsom zoom"]],
          default: "none",
          ai: false,
        },
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
        {
          key: "variant",
          type: "select",
          label: "Type",
          options: [["band", "Bånd med tittel og knapp"], ["card", "Kort med bilde"], ["button", "Bare knapp"], ["link", "Tekstlenke med pil"]],
          default: "band",
          ai: false,
        },
        { key: "image", type: "image", label: "Bilde", when: { variant: "card" }, ai: false },
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
            { key: "video", type: "video", label: "… eller til video (valgfritt)", ai: false },
          ],
          default: [{ title: "Første kort", text: "Tekst som ruller over bildet." }, { title: "Andre kort", text: "Neste del av fortellingen." }],
          hint: "2–4 kort som forteller en historie trinn for trinn.",
        },
        {
          key: "layout",
          type: "select",
          label: "Oppsett",
          options: [["overlay", "Kort over bildet"], ["split-left", "Bildet til venstre, tekst til høyre"], ["split-right", "Bildet til høyre, tekst til venstre"]],
          default: "overlay",
          ai: false,
        },
        {
          key: "transition",
          type: "select",
          label: "Bakgrunnsovergang",
          options: [["fade", "Ton over"], ["zoom", "Zoom"], ["slide", "Skyv opp"], ["stack", "Stables oppå"], ["blur", "Uskarp overgang"], ["wipe", "Gardin"], ["mask", "Sirkel åpner seg"], ["none", "Ingen"]],
          default: "fade",
          ai: false,
        },
        { key: "cardSide", type: "select", label: "Kortene står", options: [["left", "Til venstre"], ["center", "Midt"], ["right", "Til høyre"]], default: "left", when: { layout: "overlay" }, ai: false },
        {
          key: "cardStyle",
          type: "select",
          label: "Kortstil",
          options: [["box", "Hvit boks"], ["glass", "Frostet glass"], ["dark", "Mørk boks"], ["plain", "Bare tekst (med skygge)"]],
          default: "box",
          when: { layout: "overlay" },
          ai: false,
        },
        { key: "dots", type: "toggle", label: "Vis fremdriftsprikker", default: true, ai: false },
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
        { key: "look", type: "select", label: "Utseende", options: [["plain", "Rent"], ["cards", "Kort"], ["lines", "Med skillelinjer"], ["huge", "Ett og ett, gigantisk"]], default: "plain", ai: false },
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
        { key: "layout", type: "select", label: "Visning", options: [["grid", "Rutenett"], ["carousel", "Karusell"]], default: "grid", ai: false },
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
        {
          key: "mode",
          type: "select",
          label: "Visning",
          options: [["carousel", "Karusell"], ["grid", "Rutenett"], ["masonry", "Mosaikk"], ["slideshow", "Lysbildeserie (ett stort bilde)"]],
          default: "carousel",
          ai: false,
        },
        { key: "lightbox", type: "toggle", label: "Åpne bildene i fullskjerm ved klikk", default: true, ai: false },
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
        {
          key: "results",
          type: "list",
          label: "Resultater (valgfritt)",
          maxItems: 5,
          itemLabel: "Resultat",
          item: [
            { key: "min", type: "number", label: "Fra antall riktige", min: 0, max: 8, step: 1, default: 0 },
            { key: "title", type: "text", label: "Tittel", max: 70, default: "" },
            { key: "text", type: "textarea", label: "Tekst", max: 300, default: "" },
          ],
          default: [],
          hint: "Valgfrie omtaler etter poengsum, laveste først. Tom liste = bare «Du fikk X av Y».",
        },
        { key: "ctaLabel", type: "text", label: "Knapp etter quizen", max: 32, default: "" },
        { key: "ctaUrl", type: "url", label: "Lenke", default: "", ai: false },
      ],
    },

    chart: {
      label: "Diagram",
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
        { key: "kind", type: "select", label: "Diagramtype", options: [["bar", "Liggende søyler"], ["column", "Stående søyler"], ["donut", "Smultring (andeler)"]], default: "bar", ai: false },
        { key: "highlight", type: "number", label: "Uthev søyle nr. (0 = ingen)", min: 0, max: 10, step: 1, default: 0, ai: false },
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

    statement: {
      label: "Stor tekst",
      group: "Tekst",
      icon: "type",
      desc: "Én sterk setning i stor skrift, gjerne med effekt.",
      fields: [
        { key: "kicker", type: "text", label: "Liten tekst over (valgfritt)", max: 40, default: "" },
        { key: "text", type: "textarea", label: "Tekst", max: 240, default: "Én setning som oppsummerer hele saken.", required: true, hint: "Én kort, sterk setning (maks 25 ord). Ikke reklamespråk." },
        { key: "accent", type: "text", label: "Ord som skal utheves", max: 80, default: "", hint: "Ett eller to ord fra teksten som skal ha merkefargen.", help: "Skriv ordene nøyaktig slik de står i teksten." },
        {
          key: "fx",
          type: "select",
          label: "Effekt",
          options: [
            ["none", "Ingen"],
            ["scroll", "Ordene lyser opp mens man scroller"],
            ["words", "Ord for ord inn"],
            ["typewriter", "Skrivemaskin"],
            ["gradient", "Fargeovergang i teksten"],
            ["outline", "Kontur, fylles ved scroll"],
          ],
          default: "scroll",
          ai: false,
        },
        { key: "size", type: "select", label: "Størrelse", options: [["l", "Stor"], ["xl", "Ekstra stor"], ["xxl", "Gigantisk"]], default: "xl", ai: false },
        { key: "font", type: "select", label: "Skrift", options: [["heading", "Overskrift"], ["body", "Brødtekst"]], default: "heading", ai: false },
      ],
      style: { pad: "xl", anim: "none" },
    },

    marquee: {
      label: "Løpende tekst",
      group: "Tekst",
      icon: "move-horizontal",
      desc: "Tekst som ruller sidelengs over skjermen.",
      fields: [
        { key: "text", type: "text", label: "Tekst", max: 120, default: "Annonsørinnhold i fart", required: true, hint: "2–6 ord som gjentas, f.eks. produktnavnet." },
        { key: "sep", type: "select", label: "Skilletegn", options: [["dot", "•"], ["bar", "│"], ["star", "✦"], ["dash", "—"], ["slash", "/"]], default: "star", ai: false },
        { key: "speed", type: "select", label: "Fart", options: [["slow", "Rolig"], ["normal", "Normal"], ["fast", "Rask"]], default: "normal", ai: false },
        { key: "dir", type: "select", label: "Retning", options: [["left", "Mot venstre"], ["right", "Mot høyre"]], default: "left", ai: false },
        { key: "size", type: "select", label: "Størrelse", options: [["m", "Middels"], ["l", "Stor"], ["xl", "Ekstra stor"]], default: "l", ai: false },
        { key: "outline", type: "toggle", label: "Annenhver i kontur", default: true, ai: false },
        { key: "scrollLinked", type: "toggle", label: "Følger scrollingen", default: false, ai: false },
      ],
      style: { pad: "s", anim: "none", bg: "brand" },
    },

    chapter: {
      label: "Kapittel",
      group: "Topp",
      icon: "bookmark",
      desc: "Åpner en ny del av saken: nummer, tittel og innledning.",
      fields: [
        { key: "label", type: "text", label: "Kapittelmerke", max: 30, default: "Del 1", hint: "F.eks. «Del 1» eller «Kapittel 2»." },
        { key: "title", type: "text", label: "Tittel", max: 80, default: "Tittel på kapitlet", required: true },
        { key: "intro", type: "textarea", label: "Innledning", max: 300, default: "" },
        { key: "image", type: "image", label: "Bakgrunnsbilde (valgfritt)", ai: false },
        { key: "layout", type: "select", label: "Oppsett", options: [["center", "Midtstilt"], ["left", "Venstre, stor tittel"], ["number", "Stort tall ved siden av"]], default: "center", ai: false },
      ],
      style: { pad: "xl", bg: "dark", minH: "half" },
    },

    rankList: {
      label: "Topp-liste",
      group: "Tekst",
      icon: "list-ordered",
      desc: "Rangert liste med store tall – f.eks. «5 grunner» eller nedtelling.",
      fields: [
        { key: "title", type: "text", label: "Tittel (valgfritt)", max: 80, default: "" },
        {
          key: "items",
          type: "list",
          label: "Plasser",
          maxItems: 10,
          itemLabel: "Plass",
          item: [
            { key: "title", type: "text", label: "Tittel", max: 80, default: "" },
            { key: "text", type: "textarea", label: "Tekst", max: 600, default: "" },
            { key: "image", type: "image", label: "Bilde", ai: false },
            { key: "specs", type: "textarea", label: "Fakta (én per linje, «Navn: verdi»)", max: 400, default: "", hint: "Valgfrie nøkkelfakta, én per linje, formatert «Navn: verdi»." },
            { key: "fact", type: "text", label: "«Visste du …?»", max: 200, default: "" },
          ],
          default: [{ title: "Første punkt", text: "Hvorfor dette er med." }, { title: "Andre punkt", text: "Hvorfor dette er med." }, { title: "Tredje punkt", text: "Hvorfor dette er med." }],
          hint: "3–7 punkter. Bare påstander som står i kildene.",
        },
        { key: "order", type: "select", label: "Nummerering", options: [["up", "1, 2, 3 …"], ["down", "Nedtelling (… 3, 2, 1)"]], default: "up", ai: false },
        { key: "layout", type: "select", label: "Oppsett", options: [["list", "Liste med bilder"], ["scenes", "Scener i hel skjerm (stort tall)"], ["cards", "Kort i rutenett"]], default: "list", ai: false },
      ],
    },

    steps: {
      label: "Steg for steg",
      group: "Tekst",
      icon: "footprints",
      desc: "Nummererte steg: slik fungerer det.",
      fields: [
        { key: "title", type: "text", label: "Tittel (valgfritt)", max: 80, default: "Slik gjør du det" },
        {
          key: "items",
          type: "list",
          label: "Steg",
          maxItems: 8,
          itemLabel: "Steg",
          item: [
            { key: "title", type: "text", label: "Tittel", max: 60, default: "" },
            { key: "text", type: "textarea", label: "Tekst", max: 300, default: "" },
            { key: "image", type: "image", label: "Bilde (valgfritt)", ai: false },
          ],
          default: [{ title: "Ta kontakt", text: "Kort forklaring." }, { title: "Få et tilbud", text: "Kort forklaring." }, { title: "Ferdig", text: "Kort forklaring." }],
          hint: "3–5 konkrete steg, verb først.",
        },
        { key: "layout", type: "select", label: "Oppsett", options: [["row", "Side om side"], ["column", "Under hverandre med linje"]], default: "row", ai: false },
      ],
    },

    cards: {
      label: "Kort / rutenett",
      group: "Tekst",
      icon: "layout-grid",
      desc: "2–4 kort med bilde, tittel og tekst – argumenter, tjenester eller lenker.",
      fields: [
        { key: "title", type: "text", label: "Tittel (valgfritt)", max: 80, default: "" },
        { key: "intro", type: "textarea", label: "Innledning (valgfritt)", max: 300, default: "" },
        {
          key: "items",
          type: "list",
          label: "Kort",
          maxItems: 12,
          itemLabel: "Kort",
          item: [
            { key: "image", type: "image", label: "Bilde", ai: false },
            { key: "symbol", type: "text", label: "Symbol eller tall (valgfritt)", max: 6, default: "", hint: "Kort tall eller tegn, f.eks. «01» eller «%». Tomt hvis bilde." },
            { key: "title", type: "text", label: "Tittel", max: 60, default: "" },
            { key: "text", type: "textarea", label: "Tekst", max: 320, default: "" },
            { key: "linkLabel", type: "text", label: "Lenketekst", max: 32, default: "" },
            { key: "url", type: "url", label: "Lenke", default: "", ai: false },
          ],
          default: [{ title: "Første poeng", text: "Kort forklaring." }, { title: "Andre poeng", text: "Kort forklaring." }, { title: "Tredje poeng", text: "Kort forklaring." }],
        },
        { key: "columns", type: "select", label: "Kolonner (desktop)", options: [["2", "2"], ["3", "3"], ["4", "4"]], default: "3", ai: false },
        {
          key: "look",
          type: "select",
          label: "Utseende",
          options: [["boxed", "Bokser"], ["plain", "Rent, uten boks"], ["overlay", "Tekst over bildet"], ["tile", "Bildefliser med lenke"]],
          default: "boxed",
          ai: false,
        },
        { key: "tilt", type: "toggle", label: "Vipper med musen (desktop)", default: false, ai: false },
      ],
    },

    tabs: {
      label: "Faner",
      group: "Tekst",
      icon: "panels-top-left",
      desc: "Innhold i faner – f.eks. rom, målgrupper eller modeller.",
      fields: [
        { key: "title", type: "text", label: "Tittel (valgfritt)", max: 80, default: "" },
        {
          key: "items",
          type: "list",
          label: "Faner",
          maxItems: 6,
          itemLabel: "Fane",
          item: [
            { key: "label", type: "text", label: "Fanenavn", max: 24, default: "" },
            { key: "title", type: "text", label: "Mellomtittel", max: 80, default: "" },
            { key: "html", type: "rich", label: "Tekst", max: 1400, default: "" },
            { key: "image", type: "image", label: "Bilde", ai: false },
            { key: "ctaLabel", type: "text", label: "Lenketekst", max: 32, default: "" },
            { key: "ctaUrl", type: "url", label: "Lenke", default: "", ai: false },
          ],
          default: [{ label: "Første", title: "Første fane", html: "<p>Innhold.</p>" }, { label: "Andre", title: "Andre fane", html: "<p>Innhold.</p>" }],
          hint: "2–5 faner med korte navn (1–2 ord).",
        },
        { key: "look", type: "select", label: "Fanestil", options: [["pills", "Piller"], ["line", "Understrek"], ["big", "Store knapper"]], default: "pills", ai: false },
      ],
    },

    hotspots: {
      label: "Bilde med punkter",
      group: "Media",
      icon: "map-pin",
      desc: "Klikkbare punkter i et bilde som forklarer detaljer.",
      fields: [
        { key: "title", type: "text", label: "Tittel (valgfritt)", max: 80, default: "" },
        { key: "image", type: "image", label: "Bilde", required: true, ai: false },
        { key: "alt", type: "text", label: "Alternativ tekst", max: 140, default: "" },
        {
          key: "items",
          type: "list",
          label: "Punkter",
          maxItems: 10,
          itemLabel: "Punkt",
          item: [
            { key: "x", type: "number", label: "Plassering vannrett (%)", min: 0, max: 100, step: 1, default: 50, ai: false },
            { key: "y", type: "number", label: "Plassering loddrett (%)", min: 0, max: 100, step: 1, default: 50, ai: false },
            { key: "title", type: "text", label: "Tittel", max: 60, default: "" },
            { key: "text", type: "textarea", label: "Tekst", max: 280, default: "" },
          ],
          default: [{ x: 30, y: 40, title: "Detalj", text: "Forklaring." }, { x: 68, y: 58, title: "Detalj", text: "Forklaring." }],
          help: "Tips: dobbeltklikk i bildet i forhåndsvisningen for å flytte valgt punkt dit.",
        },
        { key: "size", type: "select", label: "Størrelse", options: [["wide", "Bred"], ["full", "Hele bredden"]], default: "wide", ai: false },
      ],
    },

    flipCards: {
      label: "Snu-kort",
      group: "Effekter",
      icon: "rotate-3d",
      desc: "Kort leseren trykker på for å avsløre svaret på baksiden.",
      fields: [
        { key: "title", type: "text", label: "Tittel (valgfritt)", max: 80, default: "" },
        { key: "hint", type: "text", label: "Instruksjon", max: 80, default: "Trykk på kortene for å se svaret" },
        {
          key: "items",
          type: "list",
          label: "Kort",
          maxItems: 9,
          itemLabel: "Kort",
          item: [
            { key: "image", type: "image", label: "Bilde på forsiden", ai: false },
            { key: "front", type: "text", label: "Tekst på forsiden", max: 80, default: "" },
            { key: "backTitle", type: "text", label: "Tittel på baksiden", max: 60, default: "" },
            { key: "back", type: "textarea", label: "Tekst på baksiden", max: 280, default: "" },
          ],
          default: [{ front: "Spørsmål eller påstand?", backTitle: "Svar", back: "Forklaring." }, { front: "Spørsmål eller påstand?", backTitle: "Svar", back: "Forklaring." }, { front: "Spørsmål eller påstand?", backTitle: "Svar", back: "Forklaring." }],
        },
        { key: "columns", type: "select", label: "Kolonner (desktop)", options: [["2", "2"], ["3", "3"]], default: "3", ai: false },
      ],
    },

    timeline: {
      label: "Tidslinje",
      group: "Tekst",
      icon: "milestone",
      desc: "Historien i årstall eller milepæler.",
      fields: [
        { key: "title", type: "text", label: "Tittel (valgfritt)", max: 80, default: "" },
        {
          key: "items",
          type: "list",
          label: "Milepæler",
          maxItems: 12,
          itemLabel: "Milepæl",
          item: [
            { key: "label", type: "text", label: "År / dato", max: 20, default: "" },
            { key: "title", type: "text", label: "Tittel", max: 80, default: "" },
            { key: "text", type: "textarea", label: "Tekst", max: 360, default: "" },
            { key: "image", type: "image", label: "Bilde (valgfritt)", ai: false },
          ],
          default: [{ label: "1925", title: "Starten", text: "Hva skjedde." }, { label: "1970", title: "Gjennombruddet", text: "Hva skjedde." }, { label: "2026", title: "I dag", text: "Hva skjer nå." }],
          hint: "Bare årstall og hendelser som står i kildene.",
        },
      ],
    },

    specTable: {
      label: "Tabell / sammenligning",
      group: "Tekst",
      icon: "table",
      desc: "Spesifikasjoner eller sammenligning i en ryddig tabell.",
      fields: [
        { key: "title", type: "text", label: "Tittel (valgfritt)", max: 80, default: "Spesifikasjoner" },
        { key: "head1", type: "text", label: "Kolonne 1", max: 30, default: "" },
        { key: "head2", type: "text", label: "Kolonne 2 (valgfri)", max: 30, default: "" },
        { key: "head3", type: "text", label: "Kolonne 3 (valgfri)", max: 30, default: "" },
        {
          key: "rows",
          type: "list",
          label: "Rader",
          maxItems: 24,
          itemLabel: "Rad",
          item: [
            { key: "label", type: "text", label: "Egenskap", max: 50, default: "" },
            { key: "v1", type: "text", label: "Verdi 1", max: 50, default: "" },
            { key: "v2", type: "text", label: "Verdi 2", max: 50, default: "" },
            { key: "v3", type: "text", label: "Verdi 3", max: 50, default: "" },
          ],
          default: [{ label: "Pris fra", v1: "" }, { label: "Rekkevidde", v1: "" }, { label: "Effekt", v1: "" }],
          hint: "Bare tall og fakta fra kildene. Bruk «✓» og «–» for ja/nei.",
        },
        { key: "highlight", type: "select", label: "Uthev kolonne", options: [["0", "Ingen"], ["1", "1"], ["2", "2"], ["3", "3"]], default: "0", ai: false },
        { key: "note", type: "text", label: "Fotnote", max: 200, default: "" },
      ],
    },

    hScroll: {
      label: "Sidelengs scroll",
      group: "Effekter",
      icon: "gallery-horizontal-end",
      desc: "Panelene glir sidelengs mens leseren scroller nedover.",
      fields: [
        { key: "title", type: "text", label: "Tittel (valgfritt)", max: 80, default: "" },
        {
          key: "items",
          type: "list",
          label: "Paneler",
          maxItems: 8,
          itemLabel: "Panel",
          item: [
            { key: "image", type: "image", label: "Bilde", ai: false },
            { key: "label", type: "text", label: "Liten tekst", max: 30, default: "" },
            { key: "title", type: "text", label: "Tittel", max: 70, default: "" },
            { key: "text", type: "textarea", label: "Tekst", max: 280, default: "" },
          ],
          default: [{ title: "Første", text: "Tekst." }, { title: "Andre", text: "Tekst." }, { title: "Tredje", text: "Tekst." }, { title: "Fjerde", text: "Tekst." }],
        },
        { key: "panel", type: "select", label: "Panelbredde", options: [["m", "Smal"], ["l", "Bred"], ["full", "Hel skjerm"]], default: "l", ai: false },
      ],
      style: { pad: "none", anim: "none" },
    },

    testimonials: {
      label: "Personer og sitater",
      group: "Tekst",
      icon: "users",
      desc: "Kort med portrett, sitat, navn og rolle.",
      fields: [
        { key: "title", type: "text", label: "Tittel (valgfritt)", max: 80, default: "" },
        {
          key: "items",
          type: "list",
          label: "Personer",
          maxItems: 9,
          itemLabel: "Person",
          item: [
            { key: "image", type: "image", label: "Portrett", ai: false },
            { key: "video", type: "video", label: "Portrettvideo (valgfri, stående)", ai: false },
            { key: "quote", type: "textarea", label: "Sitat", max: 280, default: "", hint: "Bare ordrett sitat fra kildene." },
            { key: "name", type: "text", label: "Navn", max: 60, default: "" },
            { key: "role", type: "text", label: "Rolle", max: 80, default: "" },
          ],
          default: [{ quote: "Ordrett sitat.", name: "Navn", role: "Rolle" }, { quote: "Ordrett sitat.", name: "Navn", role: "Rolle" }],
        },
        { key: "layout", type: "select", label: "Visning", options: [["grid", "Rutenett"], ["carousel", "Karusell"]], default: "grid", ai: false },
      ],
    },

    poll: {
      label: "Avstemning",
      group: "Handling",
      icon: "vote",
      desc: "Leseren svarer på ett spørsmål og ser hva andre svarte.",
      fields: [
        { key: "question", type: "text", label: "Spørsmål", max: 140, default: "Hva synes du?", required: true },
        {
          key: "options",
          type: "list",
          label: "Svaralternativer",
          maxItems: 6,
          itemLabel: "Alternativ",
          item: [{ key: "label", type: "text", label: "Alternativ", max: 60, default: "" }],
          default: [{ label: "Ja" }, { label: "Nei" }, { label: "Vet ikke" }],
        },
        { key: "thanks", type: "text", label: "Takketekst", max: 120, default: "Takk for svaret!" },
        { key: "showResults", type: "toggle", label: "Vis resultat etter svar", default: true, ai: false, help: "Resultatet telles bare når siden ligger på ABC design-serveren (/n/), og er veiledende (ikke en vitenskapelig måling). I ZIP-eksport sendes svaret bare til målingen (dataLayer)." },
      ],
    },

    countdown: {
      label: "Nedtelling",
      group: "Handling",
      icon: "timer",
      desc: "Teller ned til en dato – premiere, lansering, kampanjeslutt.",
      fields: [
        { key: "title", type: "text", label: "Tittel", max: 80, default: "Det skjer om" },
        { key: "date", type: "text", label: "Dato og tid", max: 16, default: "2026-12-24 18:00", required: true, help: "Format: ÅÅÅÅ-MM-DD TT:MM (norsk tid).", hint: "Exactly YYYY-MM-DD HH:MM, Norwegian time, only a date from the material." },
        { key: "done", type: "text", label: "Tekst når tiden er ute", max: 80, default: "Nå er det i gang!" },
        { key: "ctaLabel", type: "text", label: "Knappetekst (valgfri)", max: 32, default: "" },
        { key: "ctaUrl", type: "url", label: "Lenke", default: "", ai: false },
      ],
      style: { bg: "dark" },
    },

    sources: {
      label: "Kilder",
      group: "Tekst",
      icon: "library",
      desc: "Nummererte kilder og fotnoter nederst i saken.",
      fields: [
        { key: "title", type: "text", label: "Tittel", max: 60, default: "Kilder" },
        {
          key: "items",
          type: "list",
          label: "Kilder",
          maxItems: 30,
          itemLabel: "Kilde",
          item: [
            { key: "text", type: "text", label: "Kilde", max: 240, default: "" },
            { key: "url", type: "url", label: "Lenke", default: "", ai: false },
          ],
          default: [{ text: "Navn på kilden, år." }],
        },
      ],
      style: { pad: "s", anim: "none" },
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
    "hero", "chapter", "richText", "statement", "image", "imageText", "factBox", "quote", "testimonials",
    "stats", "rankList", "cards", "steps", "timeline", "tabs", "specTable", "cta", "productCards",
    "countdown", "poll", "video", "gallery", "hotspots", "stickyStory", "scrollVideo", "hScroll",
    "parallaxImage", "flipCards", "compare", "accordion", "quiz", "chart", "marquee", "embed",
    "sources", "divider",
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
    ["page", "Sidebakgrunn", "#ffffff"],
  ];

  var DEFAULT_THEME = {
    colors: {
      primary: "#0b3d91",
      accent: "#1e6fe8",
      dark: "#0b1730",
      soft: "#eef3fb",
      text: "#1b1f27",
      link: "#1e5fbf",
      page: "#ffffff",
    },
    fonts: {
      heading: { family: "Source Serif 4", source: "google", weight: 700 },
      body: { family: "Source Sans 3", source: "google", weight: 400 },
    },
    headingCase: "none",
    // Type scale: how big headings run relative to the body text.
    scale: "normal",
    tracking: "normal",
    radius: 10,
    button: "solid",
    buttonCase: "none",
    logo: "",
  };

  var TYPE_SCALES = [["compact", "Kompakt"], ["normal", "Normal"], ["large", "Stor"], ["display", "Magasin (svært store titler)"]];

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
    EASINGS: EASINGS,
    TRANSITIONS: TRANSITIONS,
    HEADING_FX: HEADING_FX,
    STYLE_FIELDS: STYLE_FIELDS,
    EXTRA_FIELDS: EXTRA_FIELDS,
    SHAPES: SHAPES,
    TYPE_SCALES: TYPE_SCALES,
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
