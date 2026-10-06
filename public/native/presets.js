/* =========================================================================
   native/presets.js — ready-designed sections ("Ferdige design").

   A block with its props and style already tuned, so a good-looking section
   is one click away instead of ten settings. The "Legg til seksjon" dialog
   shows them with a live thumbnail; templates.js and the AI planner can use
   them by id. Placeholder copy says what belongs there.

   Shared verbatim by the browser and the server (UMD).
   ========================================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NativePresets = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PRESETS = [
    // ---- openings ----
    { id: "hero-type", name: "Typografisk åpning", group: "Åpning", section: { type: "hero", props: { layout: "type", kicker: "Produktnavn", title: "En stor, tydelig tittel som setter tonen", ingress: "Ingressen sier hva leseren får – i én eller to setninger.", titleSize: "xxl", titleFx: "words", height: "full", position: "bottom-left" }, style: { bg: "dark", grain: true } } },
    { id: "hero-gradient", name: "Åpning med fargeovergang", group: "Åpning", section: { type: "hero", props: { layout: "type", kicker: "Kampanje", title: "Tittel over en myk fargeovergang", ingress: "Fungerer uten bilder – og ser likevel påkostet ut.", titleSize: "xl", titleFx: "lines", height: "tall", position: "center" }, style: { bg: "gradient", bgGradient: "mesh" } } },
    { id: "hero-zoom", name: "Bilde som vokser ved scroll", group: "Åpning", section: { type: "hero", props: { layout: "zoom", image: "demo:road-mountains", kicker: "Ny modell", title: "Tittelen står, bildet vokser", ingress: "Leseren scroller – bildet åpner seg til full bredde.", titleSize: "xl", height: "full" } } },
    { id: "hero-framed", name: "Bilde i ramme", group: "Åpning", section: { type: "hero", props: { layout: "framed", image: "demo:sofa", kicker: "Guide", title: "Rolig og redaksjonell åpning", ingress: "Bildet i en avrundet ramme, tittel og ingress under.", titleSize: "l", height: "auto" } } },
    { id: "hero-split", name: "Delt åpning", group: "Åpning", section: { type: "hero", props: { layout: "split", image: "demo:strawberries", kicker: "Tilbud", title: "Bilde til venstre, budskap til høyre", ingress: "God når produktbildet skal synes godt.", height: "tall" } } },
    { id: "chapter-number", name: "Kapittel med stort tall", group: "Kapittel", section: { type: "chapter", props: { label: "01", title: "Første kapittel", intro: "Én setning om hva denne delen handler om.", layout: "number" }, style: { bg: "none", pad: "xl", minH: "auto", chapter: "Kapittel 1" } } },
    { id: "chapter-dark", name: "Kapittel på mørk bakgrunn", group: "Kapittel", section: { type: "chapter", props: { label: "Del 2", title: "Når historien tar en ny retning", intro: "En kort innledning til neste del.", layout: "center" }, style: { bg: "dark", pad: "xl", minH: "half", shapeBottom: "curve", chapter: "Del 2" } } },
    { id: "chapter-image", name: "Kapittel over helt bilde", group: "Kapittel", section: { type: "chapter", props: { label: "Del 3", title: "Et kapittel som åpner som et filmbilde", layout: "left" }, style: { bg: "image", bgImage: "demo:mountain-lake", overlay: 45, pad: "xl", minH: "screen", valign: "bottom", chapter: "Del 3" } } },
    // ---- text ----
    { id: "statement-scroll", name: "Stor tekst som lyser opp", group: "Tekst", section: { type: "statement", props: { kicker: "Visste du", text: "Ordene tennes ett etter ett mens leseren scroller – perfekt for kjernebudskapet.", accent: "kjernebudskapet", fx: "scroll", size: "xl" }, style: { pad: "xl", minH: "half" } } },
    { id: "statement-gradient", name: "Stor tekst i fargeovergang", group: "Tekst", section: { type: "statement", props: { text: "Én setning som skal huskes.", fx: "gradient", size: "xxl" }, style: { pad: "xl", align: "center" } } },
    { id: "statement-type", name: "Skrivemaskin", group: "Tekst", section: { type: "statement", props: { kicker: "2026 oppsummert", text: "Skrives ut bokstav for bokstav.", fx: "typewriter", size: "xl", font: "body" }, style: { bg: "dark", pad: "xl" } } },
    { id: "text-lead", name: "Brødtekst med ingress og forbokstav", group: "Tekst", section: { type: "richText", props: { lead: true, dropCap: true, html: "<p>Første avsnitt blir større og fungerer som ingress.</p><p>Deretter fortsetter teksten i vanlig størrelse, med <mark>utheving</mark> som tegnes når leseren kommer hit.</p><h2>Mellomtittel</h2><p>Mer tekst.</p>" } } },
    { id: "quote-dark", name: "Stort sitat på mørk bunn", group: "Tekst", section: { type: "quote", props: { text: "Et sterkt, ordrett sitat som oppsummerer historien.", name: "Navn Navnesen", role: "Tittel" }, style: { bg: "dark", pad: "xl", anim: "blur" } } },
    { id: "marquee-brand", name: "Løpende tekst i merkefarge", group: "Tekst", section: { type: "marquee", props: { text: "Produktnavn", sep: "star", size: "xl", outline: true }, style: { bg: "brand", pad: "s" } } },
    // ---- numbers & lists ----
    { id: "stats-cards", name: "Nøkkeltall i kort", group: "Tall og lister", section: { type: "stats", props: { title: "Tallene bak", look: "cards", items: [{ value: "402", unit: "km", label: "rekkevidde" }, { value: "30", unit: "min", label: "hurtiglading" }, { value: "7", unit: "år", label: "garanti" }] }, style: { anim: "stagger", pad: "l" } } },
    { id: "stats-huge", name: "Ett gigantisk tall", group: "Tall og lister", section: { type: "stats", props: { look: "huge", items: [{ value: "26", unit: "timer", label: "Så lang tid tar det i snitt å selge en bil hos oss." }] }, style: { bg: "brand", pad: "xl" } } },
    { id: "rank-scenes", name: "Topp 5 som scener", group: "Tall og lister", section: { type: "rankList", props: { title: "Fem øyeblikk du må få med deg", order: "down", layout: "scenes", items: [{ title: "Femteplass", text: "Hvorfor den er med." }, { title: "Fjerdeplass", text: "Hvorfor den er med." }, { title: "Tredjeplass", text: "Hvorfor den er med." }] }, style: { pad: "none", anim: "none", bg: "dark" } } },
    { id: "rank-list", name: "Topp-liste med fakta", group: "Tall og lister", section: { type: "rankList", props: { title: "Fem grunner", layout: "list", items: [{ title: "Første grunn", text: "Forklaring.", specs: "Pris: fra 349 900 kr\nRekkevidde: 402 km", fact: "En overraskende detalj." }, { title: "Andre grunn", text: "Forklaring." }, { title: "Tredje grunn", text: "Forklaring." }] }, style: { anim: "stagger" } } },
    { id: "steps-row", name: "Slik fungerer det", group: "Tall og lister", section: { type: "steps", props: { title: "Slik gjør du det", layout: "row" }, style: { bg: "soft", pad: "l", anim: "stagger" } } },
    { id: "timeline", name: "Tidslinje", group: "Tall og lister", section: { type: "timeline", props: { title: "Hundre år på veien" }, style: { pad: "l" } } },
    { id: "spec-compare", name: "Sammenligningstabell", group: "Tall og lister", section: { type: "specTable", props: { title: "Velg modellen som passer deg", head1: "Basis", head2: "Pluss", head3: "Premium", highlight: "2", rows: [{ label: "Pris fra", v1: "349 900 kr", v2: "399 900 kr", v3: "459 900 kr" }, { label: "Rekkevidde", v1: "350 km", v2: "402 km", v3: "480 km" }, { label: "Firehjulstrekk", v1: "–", v2: "✓", v3: "✓" }], note: "Priser og data fra annonsøren, gjelder per oktober 2026." } } },
    { id: "chart-columns", name: "Søylediagram", group: "Tall og lister", section: { type: "chart", props: { title: "Utviklingen år for år", kind: "column", highlight: 4, unit: "%", source: "Kilde fra materialet", items: [{ label: "2023", value: 12 }, { label: "2024", value: 19 }, { label: "2025", value: 27 }, { label: "2026", value: 43 }] } } },
    { id: "chart-donut", name: "Andeler (smultring)", group: "Tall og lister", section: { type: "chart", props: { title: "Hva kundene velger", kind: "donut", unit: "%", items: [{ label: "Elektrisk", value: 43 }, { label: "Hybrid", value: 24 }, { label: "Diesel", value: 18 }, { label: "Bensin", value: 15 }] }, style: { bg: "soft" } } },
    // ---- cards ----
    { id: "cards-overlay", name: "Kort med tekst over bilde", group: "Kort og faner", section: { type: "cards", props: { title: "Tre grunner til å velge riktig", look: "overlay", columns: "3", items: [{ image: "demo:canoe", title: "Første", text: "Kort forklaring." }, { image: "demo:waterfall", title: "Andre", text: "Kort forklaring." }, { image: "demo:mist-peak", title: "Tredje", text: "Kort forklaring." }] }, style: { anim: "stagger" } } },
    { id: "cards-tiles", name: "Lenkefliser (hub)", group: "Kort og faner", section: { type: "cards", props: { title: "Utforsk mer", look: "tile", columns: "4", items: [{ title: "Kategori", image: "demo:dining" }, { title: "Kategori", image: "demo:sofa" }, { title: "Kategori", image: "demo:desk" }, { title: "Kategori", image: "demo:laptop" }] }, style: { anim: "stagger" } } },
    { id: "cards-icons", name: "Argumenter med tall", group: "Kort og faner", section: { type: "cards", props: { title: "Derfor fungerer det", look: "plain", columns: "3", items: [{ symbol: "01", title: "Første", text: "Kort forklaring." }, { symbol: "02", title: "Andre", text: "Kort forklaring." }, { symbol: "03", title: "Tredje", text: "Kort forklaring." }] }, style: { anim: "stagger", pad: "l" } } },
    { id: "tabs-big", name: "Faner med store knapper", group: "Kort og faner", section: { type: "tabs", props: { title: "Velg rom", look: "big", items: [{ label: "Entré", title: "Smarte løsninger i entreen", html: "<p>Tips.</p>" }, { label: "Stue", title: "Mer plass i stua", html: "<p>Tips.</p>" }, { label: "Bad", title: "Orden på badet", html: "<p>Tips.</p>" }] } } },
    { id: "flip", name: "Snu-kort (test deg selv)", group: "Kort og faner", section: { type: "flipCards", props: { title: "Myte eller fakta?" }, style: { bg: "soft", anim: "stagger" } } },
    { id: "people", name: "Personer i karusell", group: "Kort og faner", section: { type: "testimonials", props: { title: "De har prøvd det", layout: "carousel", items: [{ image: "demo:portrait-woman", quote: "Ordrett sitat.", name: "Navn", role: "Rolle" }, { image: "demo:portrait-man", quote: "Ordrett sitat.", name: "Navn", role: "Rolle" }, { image: "demo:portrait-hiker", quote: "Ordrett sitat.", name: "Navn", role: "Rolle" }] } } },
    // ---- media & scroll ----
    { id: "story-split", name: "Scrollfortelling, delt skjerm", group: "Bilde og scroll", section: { type: "stickyStory", props: { layout: "split-left", transition: "wipe", image: "demo:fjord" } } },
    { id: "story-glass", name: "Scrollfortelling med glasskort", group: "Bilde og scroll", section: { type: "stickyStory", props: { layout: "overlay", cardStyle: "glass", transition: "zoom", cardSide: "right", image: "demo:forest-mist" } } },
    { id: "story-mask", name: "Scrollfortelling med sirkel-overgang", group: "Bilde og scroll", section: { type: "stickyStory", props: { layout: "overlay", cardStyle: "plain", transition: "mask", cardSide: "center", image: "demo:stars" } } },
    { id: "hscroll", name: "Sidelengs scroll", group: "Bilde og scroll", section: { type: "hScroll", props: { title: "Bli med på reisen", panel: "l", items: [{ image: "demo:waterfall", title: "Første", text: "Tekst." }, { image: "demo:canoe", title: "Andre", text: "Tekst." }, { image: "demo:mist-peak", title: "Tredje", text: "Tekst." }] }, style: { bg: "dark" } } },
    { id: "image-zoom", name: "Bilde som zoomer ved scroll", group: "Bilde og scroll", section: { type: "image", props: { size: "full", ratio: "21:9", fx: "zoom", image: "demo:road-open" }, style: { pad: "none" } } },
    { id: "image-reveal", name: "Bilde som åpner seg", group: "Bilde og scroll", section: { type: "image", props: { size: "wide", ratio: "16:9", fx: "reveal", image: "demo:fjord" } } },
    { id: "hotspots", name: "Bilde med forklarende punkter", group: "Bilde og scroll", section: { type: "hotspots", props: { title: "Se nærmere på detaljene", image: "demo:car-interior" } } },
    { id: "gallery-slides", name: "Lysbildeserie", group: "Bilde og scroll", section: { type: "gallery", props: { mode: "slideshow", items: [{ image: "demo:concert" }, { image: "demo:aurora" }] } } },
    { id: "gallery-masonry", name: "Bildemosaikk", group: "Bilde og scroll", section: { type: "gallery", props: { mode: "masonry", items: [{ image: "demo:canoe" }, { image: "demo:forest-mist" }, { image: "demo:waterfall" }, { image: "demo:mist-peak" }, { image: "demo:stars" }, { image: "demo:mountain-lake" }] } } },
    // ---- action ----
    { id: "cta-card", name: "Handling: kort med bilde", group: "Handling", section: { type: "cta", props: { variant: "card", image: "demo:road-sunset", title: "Klar for å prøve selv?", text: "En kort setning om hva som skjer når leseren klikker.", label: "Book prøvekjøring" } } },
    { id: "cta-gradient", name: "Handling: bånd med fargeovergang", group: "Handling", section: { type: "cta", props: { variant: "band", title: "Se hele kampanjen", label: "Til kampanjen" }, style: { bg: "gradient", bgGradient: "linear", bgAngle: 120, pad: "l", shapeTop: "wave" } } },
    { id: "countdown", name: "Nedtelling til premiere", group: "Handling", section: { type: "countdown", props: { title: "Premiere om", ctaLabel: "Kjøp billett" }, style: { bg: "dark", pad: "l" } } },
    { id: "poll", name: "Avstemning", group: "Handling", section: { type: "poll", props: { question: "Hva er viktigst for deg?", options: [{ label: "Pris" }, { label: "Rekkevidde" }, { label: "Design" }] } } },
    { id: "quiz", name: "Quiz med resultat", group: "Handling", section: { type: "quiz", props: { title: "Hvor mye vet du?", results: [{ min: 0, title: "Nybegynner", text: "Les saken en gang til!" }, { min: 2, title: "Ekspert", text: "Imponerende." }] }, style: { bg: "soft" } } },
  ];

  var GROUPS = ["Åpning", "Kapittel", "Tekst", "Tall og lister", "Kort og faner", "Bilde og scroll", "Handling"];

  function find(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return null;
  }

  var DEMO_RE = /^demo:([a-z0-9-]+)$/;

  function walk(value, fn) {
    if (Array.isArray(value)) return value.map(function (v) { return walk(v, fn); });
    if (value && typeof value === "object") {
      var out = {};
      Object.keys(value).forEach(function (k) { out[k] = walk(value[k], fn); });
      return out;
    }
    return fn(value);
  }

  /**
   * The preset's section with demo photos swapped for real ids (thumbnails)
   * or removed (what is inserted: the user picks their own photos).
   */
  function sectionOf(preset, ids) {
    return walk(preset.section, function (v) {
      var m = typeof v === "string" && DEMO_RE.exec(v);
      return m ? (ids && ids[m[1]]) || "" : v;
    });
  }

  return { PRESETS: PRESETS, GROUPS: GROUPS, find: find, sectionOf: sectionOf };
});
