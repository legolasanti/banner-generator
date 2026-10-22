/* =========================================================================
   native/templates/basics.js — the plain workhorses (category «Grunnmal»).

   Part of the built-in page templates; native/templates.js collects the parts
   and documents what a template may carry. Loaded before templates.js in the
   browser, required by it on the server (UMD).
   ========================================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.NativeTemplateSets = root.NativeTemplateSets || {}).basics = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var P = function (text) {
    return "<p>" + text + "</p>";
  };

  function font(family, weight) {
    return { family: family, source: "google", weight: weight };
  }

  return [
    // =====================================================================
    // Workhorses
    // =====================================================================
    {
      id: "lansering",
      name: "Lansering",
      category: "Grunnmal",
      description: "Nytt produkt eller ny modell: stor åpning, fortelling i scroll, nøkkeltall og prøv-det-selv.",
      use: "Bil, elektronikk, nye tjenester",
      sections: [
        { type: "hero", props: { kicker: "Produktnavn", title: "En tittel som vekker nysgjerrighet", ingress: "Ingressen forteller i én til to setninger hva leseren får vite.", layout: "overlay", height: "full", image: "demo:road-mountains" } },
        { type: "richText", props: { html: P("Åpningsavsnittet setter scenen: hvem, hva og hvorfor nå. Hold avsnittene korte.") + "<h2>Mellomtittel som deler opp teksten</h2>" + P("Utdyp med konkrete detaljer fra kildene.") } },
        { type: "stats", props: { title: "", items: [{ value: "0", unit: "", label: "nøkkeltall fra kildene" }, { value: "0", unit: "", label: "nøkkeltall fra kildene" }, { value: "0", unit: "", label: "nøkkeltall fra kildene" }] }, style: { bg: "soft" } },
        { type: "stickyStory", props: { image: "demo:fjord", slides: [{ title: "Første poeng", text: "Bildet står stille mens teksten ruller over." }, { title: "Andre poeng", text: "Bytt bakgrunn per kort om du vil.", image: "demo:mountain-lake" }, { title: "Tredje poeng", text: "Avslutt fortellingen her." }] } },
        { type: "imageText", props: { image: "demo:car-interior", title: "Detaljen som gjør forskjellen", html: P("Forklar én egenskap grundig, med bilde ved siden av."), ctaLabel: "Les mer" } },
        { type: "quote", props: { text: "Et ordrett sitat fra en kunde, en ekspert eller annonsøren.", name: "Navn Navnesen", role: "Tittel" } },
        { type: "factBox", props: { title: "Fakta", items: [{ text: "Pris" }, { text: "Rekkevidde / størrelse" }, { text: "Tilgjengelighet" }, { text: "Garanti" }, { text: "Mer informasjon" }] } },
        { type: "cta", props: { variant: "band", title: "Lyst til å prøve selv?", text: "En kort setning om hva som skjer når leseren klikker.", label: "Book prøvekjøring" } },
      ],
    },
    {
      id: "kampanje",
      name: "Kampanje og produkter",
      category: "Grunnmal",
      description: "Butikk eller netthandel: tilbud, produktkort med pris og tydelige knapper.",
      use: "Jula, dagligvare, interiør, sesongkampanjer",
      sections: [
        { type: "hero", props: { kicker: "Kampanje", title: "Tittel som forteller hva leseren sparer eller får", ingress: "Ingress med tidsrom og hovedtilbud.", layout: "split", height: "tall", image: "demo:dining" } },
        { type: "richText", props: { html: P("Fortell hvorfor kampanjen er relevant akkurat nå, med et konkret behov leseren kjenner igjen.") } },
        { type: "productCards", props: { title: "Utvalgte produkter", items: [{ name: "Produkt", text: "Kort beskrivelse", price: "999,-", image: "demo:desk" }, { name: "Produkt", text: "Kort beskrivelse", price: "999,-", image: "demo:sofa" }, { name: "Produkt", text: "Kort beskrivelse", price: "999,-", image: "demo:laptop" }] } },
        { type: "imageText", props: { title: "Tips: slik får du mest ut av det", html: P("Et nyttig råd som gir saken verdi utover tilbudet."), side: "right", image: "demo:sofa" } },
        { type: "factBox", props: { title: "Godt å vite", collapsible: false, items: [{ text: "Kampanjeperiode" }, { text: "Gjelder i butikk og på nett" }, { text: "Forbehold om utsolgte varer" }] } },
        { type: "cta", props: { variant: "band", title: "Se hele kampanjen", label: "Til kampanjen" } },
      ],
    },
    {
      id: "guide",
      name: "Guide og råd",
      category: "Grunnmal",
      description: "Nyttig, tekstdrevet sak: steg for steg, spørsmål og svar, faktaboks.",
      use: "Bank, forsikring, helse, bolig",
      sections: [
        { type: "hero", props: { kicker: "Guide", title: "Slik gjør du … (konkret tittel)", ingress: "Hva leseren lærer, i én setning.", layout: "below", height: "auto", image: "demo:desk" } },
        { type: "richText", props: { dropCap: true, html: P("Innledning som beskriver problemet leseren har.") + "<h2>1. Første steg</h2>" + P("Konkret råd.") + "<h2>2. Andre steg</h2>" + P("Konkret råd.") + "<h2>3. Tredje steg</h2>" + P("Konkret råd.") } },
        { type: "image", props: { caption: "Bildetekst", image: "demo:laptop" } },
        { type: "accordion", props: { title: "Ofte stilte spørsmål", items: [{ q: "Spørsmål leseren lurer på?", a: "Kort og presist svar." }, { q: "Et spørsmål til?", a: "Svar." }] } },
        { type: "factBox", props: { title: "Kort oppsummert", items: [{ text: "Det viktigste rådet" }, { text: "Det nest viktigste" }, { text: "Hvor du finner mer" }] } },
        { type: "cta", props: { variant: "button", label: "Les mer hos annonsøren" } },
      ],
    },
    {
      id: "portrett",
      name: "Portrett og intervju",
      category: "Grunnmal",
      description: "Menneskene først: stort bilde, sitater og en personlig historie.",
      use: "Kampanjer med ambassadører, kunder eller ansatte",
      sections: [
        { type: "hero", props: { kicker: "", title: "Et sitat eller en påstand fra hovedpersonen", ingress: "Hvem er personen, og hvorfor skal vi høre på dem?", layout: "overlay", height: "full", position: "bottom-left", image: "demo:portrait-hiker" } },
        { type: "richText", props: { dropCap: true, html: P("Scenen der vi møter personen. Bruk detaljer fra intervjuet.") + P("Bakgrunnen for historien.") } },
        { type: "quote", props: { text: "Det beste sitatet fra intervjuet, ordrett.", name: "Navn", role: "Rolle", image: "demo:portrait-woman" } },
        { type: "image", props: { caption: "Bildetekst", image: "demo:portrait-field" } },
        { type: "richText", props: { html: "<h2>Mellomtittel</h2>" + P("Videre i historien – hvordan annonsørens produkt eller tjeneste kommer inn naturlig.") } },
        { type: "cta", props: { variant: "link", label: "Les mer om …" } },
      ],
    },
    {
      id: "scroll",
      name: "Scrollfortelling",
      category: "Grunnmal",
      description: "Visuell sak med video, fast bakgrunn og parallakse. Krever gode bilder og helst video.",
      use: "Reise, mat, bil, livsstil – når bildene bærer saken",
      sections: [
        { type: "hero", props: { kicker: "", title: "Kort, sterk tittel", ingress: "Én setning.", layout: "overlay", height: "full", position: "center", image: "demo:mist-peak" } },
        { type: "stickyStory", props: { image: "demo:forest-mist", slides: [{ title: "", text: "Første del av fortellingen." }, { title: "", text: "Andre del.", image: "demo:waterfall" }, { title: "", text: "Tredje del.", image: "demo:canoe" }], cardSide: "center" } },
        { type: "richText", props: { html: P("Brødtekst mellom de visuelle delene.") } },
        { type: "parallaxImage", props: { title: "En linje over bildet", image: "demo:aurora" } },
        { type: "richText", props: { html: P("Avslutt historien.") } },
        { type: "cta", props: { variant: "band", title: "Oppfordring", label: "Les mer" }, style: { bg: "dark" } },
      ],
    },
  ];
});
