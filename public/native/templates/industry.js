/* =========================================================================
   native/templates/industry.js — one template per kind of advertiser ABC BrandStudio keeps getting.

   Part of the built-in page templates; native/templates.js collects the parts
   and documents what a template may carry. Loaded before templates.js in the
   browser, required by it on the server (UMD).
   ========================================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.NativeTemplateSets = root.NativeTemplateSets || {}).industry = factory();
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
    // Industry templates — one per kind of advertiser ABC BrandStudio
    // keeps getting (pharmacy, food producer, bank, energy, property,
    // grocery, employer, gym). Each has its own look and photo kit, and its
    // sample copy shows what that industry's page has to say (effective
    // interest example for loans, "read the leaflet" for pharmacy …).
    // =====================================================================
    {
      id: "apotek",
      name: "Apotek og helse",
      premium: true,
      category: "Helse",
      description: "Rolig og tillitvekkende: farmasøyten som ekspert, faner per hudtype, rutine i steg, produkter med pris og en faktaboks med forbeholdene helsereklame krever.",
      use: "Apotek, hudpleie, helsetjenester, vitaminer, optikere",
      theme: {
        colors: { primary: "#0f5b4f", accent: "#e98a5b", dark: "#0a2f29", soft: "#eef5f1", text: "#16312c", link: "#11705f", page: "#fbfcfa" },
        fonts: { heading: font("Lexend", 600), body: font("Nunito Sans", 400) },
        scale: "large",
        tracking: "tight",
        radius: 18,
        button: "pill",
      },
      extras: { progress: true, readTime: true, stickyCta: true, stickyLabel: "Book gratis hudprat", stickyAfter: 35, feedback: true, feedbackQ: "Fikk du svar på det du lurte på?" },
      sections: [
        { type: "hero", props: { layout: "split", image: "demo:pharmacist-advice", kicker: "Apotek Nord", title: "Vinterhuden trenger mer enn en ny krem", ingress: "Farmasøyt Amina Rahimi forklarer hvorfor huden tørker ut når kulda kommer – og hva som faktisk hjelper.", titleSize: "l", titleFx: "words", height: "tall" } },
        { type: "richText", props: { lead: true, html: P("Kald luft ute og tørr varme inne. Det er en kombinasjon huden ikke liker, og i januar merker de fleste det: stramhet, flass og røde flekker på kinn og hender.") + P("«Mange bytter krem når de egentlig burde bytte rutine», sier Amina. Her er rådene hun gir oftest over disken.") } },
        { type: "stats", props: { look: "cards", countUp: true, items: [{ value: "8 av 10", unit: "", label: "kjenner tørr hud om vinteren" }, { value: "15", unit: "min", label: "gratis hudprat med farmasøyt" }, { value: "120", unit: "", label: "apotek i hele landet" }] }, style: { bg: "soft", pad: "l", anim: "stagger" } },
        { type: "tabs", props: { title: "Hva slags hud har du?", look: "pills", items: [{ label: "Tørr", title: "Tørr hud: lås inn fuktigheten", html: P("Smør deg mens huden fortsatt er fuktig etter dusjen. Velg en fet krem uten parfyme om kvelden.") + "<ul><li>Lunkent vann, ikke varmt</li><li>Krem innen tre minutter</li></ul>", image: "demo:skincare-leaves", ctaLabel: "Se kremer for tørr hud" }, { label: "Sensitiv", title: "Sensitiv hud: færre produkter", html: P("Jo færre ingredienser, jo mindre å reagere på. Test nye produkter på et lite område først.") + "<ul><li>Parfymefritt og uten farge</li><li>Ett nytt produkt om gangen</li></ul>", image: "demo:skincare-stones", ctaLabel: "Se milde produkter" }, { label: "Fet", title: "Fet hud: fukt uten fett", html: P("Også fet hud blir dehydrert om vinteren. Velg en lett gelkrem og dropp de sterkeste rensegelene.") + "<ul><li>Mild rens morgen og kveld</li><li>Solkrem også i januar</li></ul>", image: "demo:serum-face", ctaLabel: "Se lette kremer" }, { label: "Barn", title: "Barnehud: kort bad og mye krem", html: P("Barnehud er tynnere og tørker raskere ut. Korte bad og en fet krem etterpå holder de fleste plagene unna.") + "<ul><li>Maks ti minutter i badekaret</li><li>Spør oss om eksem</li></ul>", image: "demo:pharmacist-shelf", ctaLabel: "Se produkter for barn" }] }, style: { pad: "l" } },
        { type: "steps", props: { title: "Kveldsrutinen på tre minutter", layout: "row", items: [{ image: "demo:skincare-stones", title: "Rens mildt", text: "Lunkent vann og en rens uten såpe. Klapp tørt – ikke gni." }, { image: "demo:serum-face", title: "Fukt", text: "Et serum med hyaluronsyre på fuktig hud trekker til seg vann." }, { image: "demo:skincare-leaves", title: "Lås inn", text: "En fetere krem over holder på fuktigheten gjennom natta." }] }, style: { anim: "stagger", pad: "l" } },
        { type: "imageText", props: { image: "demo:pharmacist-shelf", alt: "Farmasøyt henter en eske fra hyllen", title: "Spør farmasøyten – uten timebestilling", html: P("Alle apotekene våre har farmasøyter som kan se på huden din og anbefale en rutine. Det koster ingenting, og du trenger ikke time.") + P("Har du utslett som ikke går over, sender vi deg videre til lege."), ctaLabel: "Finn nærmeste apotek", side: "right", ratio: "4:5" } },
        { type: "quote", props: { text: "Det beste rådet er ofte det billigste: Kortere dusjer, lavere temperatur og krem med en gang.", name: "Amina Rahimi", role: "Farmasøyt, Apotek Nord" }, style: { bg: "soft", pad: "xl", anim: "fade-up" } },
        { type: "productCards", props: { title: "Farmasøytens favoritter", columns: "3", buttonLabel: "Se produktet", items: [{ image: "demo:skincare-leaves", name: "Fuktkrem uten parfyme", text: "50 ml. For tørr og sensitiv hud.", price: "149,-" }, { image: "demo:serum-face", name: "Serum med hyaluronsyre", text: "30 ml. Til kveldsrutinen.", price: "229,-", oldPrice: "279,-", badge: "Ukens tilbud" }, { image: "demo:skincare-stones", name: "Mild rens", text: "200 ml. Uten såpe.", price: "119,-" }] }, style: { anim: "stagger" } },
        { type: "accordion", props: { title: "Spørsmål vi ofte får", items: [{ q: "Hvor ofte bør jeg bytte hudpleieprodukter?", a: "Sjelden. Gi et nytt produkt fire til seks uker før du bedømmer det, og bytt bare én ting om gangen." }, { q: "Trenger jeg solkrem om vinteren?", a: "På dager med sol, og særlig på fjellet, ja. Snøen reflekterer mye av solstrålingen." }, { q: "Når bør jeg gå til lege?", a: "Hvis utslettet klør mye, sprekker, væsker eller ikke blir bedre etter to uker med god rutine." }] } },
        { type: "factBox", props: { title: "Godt å vite", variant: "soft", collapsible: false, items: [{ text: "Rådene i saken erstatter ikke undersøkelse hos lege." }, { text: "Reseptfrie legemidler: Les pakningsvedlegget før bruk." }, { text: "Priser og tilbud er eksempler i malen – bytt ut med annonsørens." }] } },
        { type: "cta", props: { variant: "card", image: "demo:walk-forest", title: "Book en gratis hudprat", text: "15 minutter med en farmasøyt – på apoteket eller på video.", label: "Book hudprat", label2: "Finn apotek" } },
      ],
    },

    {
      id: "honning",
      name: "Lokal produsent («fra kube til bord»)",
      premium: true,
      category: "Mat",
      description: "Gyllen og sanselig: hele reisen fra bigården til glasset, med delt scrollfortelling, sesonger, sidelengs smaksguide, myter, mosaikk og produkter.",
      use: "Honning, meieri, bryggeri, gårdsmat, kaffebrenneri – produsenter med en historie",
      theme: {
        colors: { primary: "#8a5800", accent: "#f2b632", dark: "#2b1d05", soft: "#fbf1d9", text: "#2b2210", link: "#9b6500", page: "#fffbf1" },
        fonts: { heading: font("Playfair Display", 700), body: font("Karla", 400) },
        scale: "display",
        tracking: "tight",
        radius: 10,
        button: "pill",
      },
      extras: { progress: true, chapterNav: "side", readTime: true, feedback: true },
      sections: [
        { type: "hero", props: { layout: "overlay", image: "demo:honey-dipper", kicker: "Lynghei Honning", title: "Sommeren på glass", ingress: "Bak hvert glass står 80 000 bier, én birøkter og en blomstereng i Hardanger. Bli med fra kube til frokostbord.", titleSize: "xxl", titleFx: "words", height: "full", position: "bottom-left", overlay: 40, kenBurns: true } },
        { type: "statement", props: { text: "En bie lager omtrent en tolvtedels teskje honning i hele sitt liv. Tenk på det neste gang du tar en skje.", accent: "en tolvtedels teskje", fx: "scroll", size: "l" }, style: { pad: "xl" } },
        { type: "chapter", props: { label: "Våren", title: "I bigården", intro: "Ola Haugland har hatt bier i 31 år. Han kjenner hver kube på lyden.", layout: "left" }, style: { bg: "image", bgImage: "demo:beekeeper-hives", overlay: 45, bgFx: "fixed", minH: "screen", valign: "bottom", pad: "xl", chapter: "I bigården" } },
        { type: "richText", props: { lead: true, dropCap: true, html: P("Det er tidlig i mai, og bigården summer. Ola løfter lokket på den første kuben og nikker fornøyd: Dronningen har lagt egg, og arbeiderne er allerede ute etter selje og løvetann.") + P("«Biene bestemmer», sier han. «Jeg prøver bare å ikke stå i veien.» <mark>Det er derfor ingen glass smaker helt likt.</mark>") } },
        { type: "stickyStory", props: { image: "demo:bees-meadow", layout: "split-left", transition: "fade", cardStyle: "plain", slides: [{ title: "Mai: Første blomstring", text: "Selje, løvetann og frukttrær. Biene bygger opp styrken etter vinteren." }, { title: "Juli: Engene", text: "Kløver og bringebær gir den lyse, milde sommerhonningen.", image: "demo:meadow" }, { title: "August: Lyngen", text: "Når lyngen blomstrer på heiene, får honningen den dype, nesten karamellaktige smaken.", image: "demo:meadow-sunset" }, { title: "September: Slynging", text: "Vokstavlene løftes ut én for én. Honningen slynges ut – kald, så smaken ikke går tapt.", image: "demo:beekeeper-frame" }] }, style: { chapter: "Året rundt" } },
        { type: "stats", props: { look: "huge", countUp: true, items: [{ value: "80 000", unit: "bier", label: "i én kube midt på sommeren" }] }, style: { bg: "brand", pad: "xl", shapeTop: "wave" } },
        { type: "chapter", props: { label: "Smaken", title: "Fire glass, fire somre", layout: "center" }, style: { bg: "none", pad: "l", chapter: "Smaken" } },
        { type: "hScroll", props: { title: "Finn din favoritt", panel: "l", items: [{ image: "demo:honey-jar", label: "Mild", title: "Sommerhonning", text: "Lys og blomstrete. Til te, yoghurt og barna." }, { image: "demo:honeycomb", label: "Kraftig", title: "Lynghonning", text: "Mørk, aromatisk og geléaktig. Til ost og kjøtt." }, { image: "demo:honey", label: "Kremet", title: "Kremet honning", text: "Rørt i fire dager. Smøres rett på brødskiva." }, { image: "demo:honeycomb-plate", label: "Rå", title: "Med vokstavle", text: "Rett fra kuben, slik biene laget den." }] }, style: { bg: "dark" } },
        { type: "timeline", props: { title: "Fra kube til glass", items: [{ label: "Dag 1", title: "Tavlene løftes ut", text: "Bare tavler der biene har forseglet cellene – da er honningen moden." }, { label: "Dag 2", title: "Slynging", text: "Voksen skjæres av, og honningen slynges ut kaldt." }, { label: "Dag 3–6", title: "Hvile og røring", text: "Honningen får hvile, og den kremete varianten røres hver dag." }, { label: "Dag 7", title: "På glass", text: "Hvert glass merkes med bigård og år." }] } },
        { type: "flipCards", props: { title: "Myte eller fakta?", hint: "Trykk på kortene", columns: "3", items: [{ front: "Honning blir aldri dårlig", backTitle: "Nesten fakta", back: "Riktig lagret holder honning seg i årevis. Den kan krystallisere, men det er helt naturlig." }, { front: "Hard honning er gammel honning", backTitle: "Myte", back: "Krystallisering avhenger av blomstene, ikke alderen. Sett glasset i lunkent vann." }, { front: "Barn under ett år bør ikke få honning", backTitle: "Fakta", back: "Det er det helsemyndighetene anbefaler. Fra ettårsalderen går det fint." }] }, style: { bg: "soft", anim: "stagger" } },
        { type: "gallery", props: { mode: "masonry", items: [{ image: "demo:bees-comb", alt: "Bier på en vokstavle" }, { image: "demo:honeycomb", alt: "Vokstavle med honning" }, { image: "demo:beekeeper-frame", alt: "Birøkter med vokstavle" }, { image: "demo:meadow", alt: "Blomstereng" }, { image: "demo:honey-jar", alt: "Honningglass" }, { image: "demo:honeycomb-plate", alt: "Vokstavle på fat" }] } },
        { type: "quote", props: { text: "Den beste honningen lager biene. Jobben min er å ikke ødelegge den på veien til glasset.", name: "Ola Haugland", role: "Birøkter i Hardanger" }, style: { bg: "dark", pad: "xl", anim: "blur" } },
        { type: "productCards", props: { title: "Årets honning", columns: "3", buttonLabel: "Finn i butikk", items: [{ image: "demo:honey-jar", name: "Sommerhonning", text: "350 g", price: "79,90" }, { image: "demo:honeycomb", name: "Lynghonning", text: "350 g", price: "99,90", badge: "Sesong" }, { image: "demo:honey", name: "Kremet honning", text: "450 g", price: "89,90" }] }, style: { anim: "stagger" } },
        { type: "cta", props: { variant: "card", image: "demo:honey-jar", title: "Smak sommeren hele året", text: "Finn Lynghei Honning i butikken nær deg, eller bestill rett fra bigården.", label: "Finn butikk", label2: "Bestill fra bigården" } },
      ],
    },

    {
      id: "boliglan",
      name: "Bank – første bolig",
      premium: true,
      category: "Finans",
      description: "Nyttig og trygg: guide i steg, faner per livssituasjon, sammenligning av lån, kundehistorier og eksempel på effektiv rente slik finansavtaleloven krever.",
      use: "Bank, boliglån, sparing, forsikring, pensjon",
      theme: {
        colors: { primary: "#0e3b2e", accent: "#3ad29f", dark: "#08241c", soft: "#eaf6f0", text: "#11251f", link: "#0f7a57", page: "#ffffff" },
        fonts: { heading: font("Schibsted Grotesk", 700), body: font("Inter", 400) },
        scale: "large",
        tracking: "tight",
        radius: 14,
        button: "solid",
      },
      extras: { progress: true, chapterNav: "top", readTime: true, stickyCta: true, stickyLabel: "Få finansieringsbevis", stickyAfter: 30 },
      sections: [
        { type: "hero", props: { layout: "framed", image: "demo:couple-news", kicker: "Fjordbank", title: "Slik kjøper du din første bolig", ingress: "Fra sparekonto til nøkkeloverlevering: alt du må vite, forklart av rådgiverne som hjelper tusenvis av førstegangskjøpere hvert år.", titleSize: "xl", titleFx: "words", height: "auto" } },
        { type: "stats", props: { look: "lines", items: [{ value: "10", unit: "%", label: "egenkapital er minstekravet" }, { value: "5 ×", unit: "", label: "inntekten er normalt maks lånebeløp" }, { value: "34", unit: "år", label: "er siste året du kan spare i BSU" }] }, style: { pad: "l", anim: "stagger" } },
        { type: "chapter", props: { label: "01", title: "Før du begynner å se", intro: "Det viktigste arbeidet gjør du før den første visningen.", layout: "number" }, style: { bg: "none", pad: "l", chapter: "Forberedelser" } },
        { type: "steps", props: { title: "Fem steg til nøkkelen", layout: "column", items: [{ title: "Finn ut hva du kan låne", text: "Inntekt, gjeld og egenkapital avgjør. Lånekalkulatoren gir deg et anslag på to minutter." }, { title: "Få finansieringsbevis", text: "Beviset viser selgeren at du kan by. Det gjelder vanligvis i tre måneder." }, { title: "Gå på visning", text: "Les tilstandsrapporten før du går, og ta med en liste med spørsmål." }, { title: "Legg inn bud", text: "Bestem deg for en smertegrense før budrunden – og hold den." }, { title: "Overtakelse", text: "Sjekk at alt er som avtalt, og les av strømmen samme dag." }] }, style: { anim: "stagger" } },
        { type: "tabs", props: { title: "Hvem kjøper?", look: "line", items: [{ label: "Alene", title: "Kjøper du alene?", html: P("Mange kjøper sammen med noen for å klare egenkapitalen. Alene er det ekstra viktig å ha en buffer.") + "<ul><li>Vurder en mindre bolig først</li><li>BSU gir skattefradrag frem til du er 34</li></ul>", image: "demo:house-snow", ctaLabel: "Regn på lånet" }, { label: "Sammen", title: "Kjøper dere sammen?", html: P("Skriv en samboeravtale som sier hvem som eier hva – særlig hvis dere har ulik egenkapital.") + "<ul><li>Felles lån, felles ansvar</li><li>Avtal hva som skjer ved brudd</li></ul>", image: "demo:couple-kitchen", ctaLabel: "Book en rådgiver" }, { label: "Med hjelp", title: "Får du hjelp fra foreldre?", html: P("Foreldre kan stille tilleggssikkerhet i sin egen bolig, slik at du slipper å ha hele egenkapitalen selv.") + "<ul><li>Sikkerheten kan begrenses i tid og beløp</li><li>Alle parter bør få råd</li></ul>", image: "demo:houses-mountains", ctaLabel: "Les om tilleggssikkerhet" }] }, style: { bg: "soft", pad: "l", chapter: "Din situasjon" } },
        { type: "specTable", props: { title: "Sammenlign boliglånene", head1: "Boliglån", head2: "Boliglån ung", head3: "Grønt boliglån", highlight: "2", rows: [{ label: "Nominell rente", v1: "5,44 %", v2: "5,19 %", v3: "5,09 %" }, { label: "For hvem", v1: "Alle", v2: "Under 34 år", v3: "Energiklasse A eller B" }, { label: "Avdragsfrihet", v1: "Inntil 5 år", v2: "Inntil 5 år", v3: "Inntil 5 år" }, { label: "Etableringsgebyr", v1: "0 kr", v2: "0 kr", v3: "0 kr" }], note: "Eksempelrenter i malen. Bytt ut med annonsørens gjeldende priser og vilkår." }, style: { chapter: "Lånene" } },
        { type: "imageText", props: { image: "demo:houses-mountains", alt: "To sorte hus foran snødekte fjell", title: "Lavere rente for energismarte boliger", html: P("Kjøper du en bolig med energiklasse A eller B, får du grønt boliglån. Det gir lavere rente – og lavere strømregning.") + P("Energiklassen står i salgsoppgaven."), ctaLabel: "Les om grønt boliglån", side: "left", ratio: "4:3" } },
        { type: "testimonials", props: { title: "De har gjort det", layout: "grid", items: [{ image: "demo:couple-kitchen", quote: "Rådgiveren ba oss sette en grense før budrunden. Det reddet oss fra å by over evne.", name: "Hanna og Even", role: "Kjøpte i Trondheim" }, { image: "demo:portrait-sun", quote: "Jeg trodde jeg måtte vente fem år til. Med BSU og tilleggssikkerhet tok det ett.", name: "Mia, 26", role: "Kjøpte i Bergen" }, { image: "demo:portrait-man", quote: "Finansieringsbeviset var klart samme dag.", name: "Tobias, 31", role: "Kjøpte i Drammen" }] }, style: { anim: "stagger" } },
        { type: "accordion", props: { title: "Spørsmål og svar", items: [{ q: "Hva er BSU?", a: "Boligsparing for ungdom. Du kan spare inntil 27 500 kroner i året og få 10 prosent av beløpet i skattefradrag, frem til året du fyller 34 (sjekk gjeldende satser)." }, { q: "Hva koster det å kjøpe bolig utover prisen?", a: "Dokumentavgift ved selveier, tinglysingsgebyr og eventuelt omkostninger til boligselskapet. Regn med noen prosent av kjøpesummen." }, { q: "Hvor lenge gjelder finansieringsbeviset?", a: "Vanligvis tre måneder. Det kan fornyes." }] } },
        { type: "factBox", props: { title: "Eksempel på effektiv rente", variant: "brand", collapsible: false, items: [{ text: "Effektiv rente 5,61 % ved lån på 2 000 000 kr over 25 år." }, { text: "Kostnad: 1 696 000 kr. Totalt: 3 696 000 kr." }, { text: "Eksempeltall i malen – banken må oppgi sine egne tall." }] } },
        { type: "cta", props: { variant: "band", title: "Klar til å se på bolig?", text: "Søk om finansieringsbevis på fem minutter – svaret får du som regel samme dag.", label: "Få finansieringsbevis", label2: "Book en rådgiver" }, style: { bg: "brand", pad: "xl", shapeTop: "curve" } },
      ],
    },

    {
      id: "energi",
      name: "Energi og bærekraft",
      premium: true,
      category: "Energi",
      description: "Mørk og teknologisk: bildet vokser ved scroll, fast scrollfortelling, klikkbare punkter på taket, forbruk i diagram og konkrete råd.",
      use: "Strøm, solceller, varmepumper, elbillading, industri og grønn omstilling",
      theme: {
        colors: { primary: "#0b1f33", accent: "#c4f04a", dark: "#06121f", soft: "#eef3f7", text: "#0d1a26", link: "#1e6fb8", page: "#f8fafc" },
        fonts: { heading: font("Space Grotesk", 700), body: font("Inter", 400) },
        scale: "large",
        tracking: "tight",
        radius: 12,
        button: "solid",
      },
      extras: { progress: true, chapterNav: "top", readTime: true },
      sections: [
        { type: "hero", props: { layout: "zoom", image: "demo:wind-sea", kicker: "Vestkraft", title: "Strømmen som blåser inn fra havet", ingress: "Hva skal til for at strømmen din blir renere – og billigere? Vi har fulgt den fra turbinen til stikkontakten.", titleSize: "xl", height: "full" } },
        { type: "statement", props: { text: "Den billigste kilowattimen er den du aldri bruker.", accent: "aldri bruker", fx: "gradient", size: "xl", font: "heading" }, style: { pad: "xl", align: "center" } },
        { type: "stats", props: { look: "cards", countUp: true, items: [{ value: "16 000", unit: "kWh", label: "bruker en vanlig enebolig i året" }, { value: "60", unit: "%", label: "av forbruket går til oppvarming" }, { value: "30", unit: "%", label: "kan spares med varmepumpe" }] }, style: { bg: "dark", pad: "l", anim: "stagger" } },
        { type: "stickyStory", props: { image: "demo:wind-fog", layout: "overlay", transition: "zoom", cardStyle: "glass", cardSide: "left", dots: true, slides: [{ title: "Fra havet", text: "Turbinene står 30 kilometer fra land, der vinden er sterkest og jevnest." }, { title: "Gjennom nettet", text: "Strømmen går i kabel til land og videre ut i nettet – på under ett sekund.", image: "demo:wind-sea" }, { title: "Hjem til deg", text: "Med solceller på taket blir du selv en liten produsent.", image: "demo:solar-house" }] }, style: { chapter: "Reisen" } },
        { type: "chart", props: { title: "Strømforbruk gjennom året (enebolig)", kind: "column", unit: "kWh", highlight: 1, source: "Eksempeltall i malen", items: [{ label: "Jan", value: 2300 }, { label: "Mar", value: 1700 }, { label: "Mai", value: 900 }, { label: "Jul", value: 600 }, { label: "Sep", value: 900 }, { label: "Nov", value: 1900 }] }, style: { pad: "l", chapter: "Forbruket" } },
        { type: "hotspots", props: { title: "Slik fungerer solcellene på taket", image: "demo:solar-house", alt: "Hus med solcellepanel på taket", size: "wide", items: [{ x: 62, y: 32, title: "Panelene", text: "Gir strøm også på overskyede dager, bare mindre." }, { x: 30, y: 70, title: "Inverteren", text: "Gjør om likestrøm til strømmen du bruker i huset." }, { x: 80, y: 74, title: "Måleren", text: "Det du ikke bruker selv, selges tilbake til nettet." }] }, style: { bg: "soft", chapter: "Solceller" } },
        { type: "cards", props: { title: "Tre ting du kan gjøre i kveld", look: "plain", columns: "3", items: [{ symbol: "01", title: "Senk temperaturen", text: "Én grad lavere sparer om lag fem prosent av oppvarmingen." }, { symbol: "02", title: "Lad om natten", text: "Prisene er ofte lavest mellom midnatt og seks." }, { symbol: "03", title: "Sjekk varmtvannet", text: "65 grader holder. Mye mer er bortkastet." }] }, style: { anim: "stagger", pad: "l" } },
        { type: "flipCards", props: { title: "Myte eller fakta?", hint: "Trykk for å se svaret", columns: "3", items: [{ front: "Solceller fungerer ikke i Norge", backTitle: "Myte", back: "Kulde gjør panelene mer effektive. Lange sommerdager gir mye strøm." }, { front: "Varmepumpe lønner seg også i kulde", backTitle: "Fakta", back: "Moderne pumper leverer varme ned mot minus 25 grader." }, { front: "Standby-forbruk er ubetydelig", backTitle: "Myte", back: "Det kan utgjøre flere hundre kilowattimer i året." }] }, style: { bg: "dark", anim: "stagger" } },
        { type: "quote", props: { text: "Det grønne skiftet skjer ikke bare på havet. Det skjer på hvert eneste tak og i hver eneste sikringsboks.", name: "Ingrid Sæther", role: "Energiingeniør, Vestkraft" }, style: { pad: "xl", anim: "reveal" } },
        { type: "cta", props: { variant: "card", image: "demo:solar-install", title: "Hva kan taket ditt produsere?", text: "Få et gratis anslag på solceller for din adresse – på to minutter.", label: "Sjekk adressen din" } },
        { type: "sources", props: { title: "Kilder", items: [{ text: "Tallene i malen er eksempler. Oppgi annonsørens kilder her." }, { text: "NVE: Energibruk i husholdninger" }] } },
      ],
    },

    {
      id: "bolig",
      name: "Bolig – nytt prosjekt",
      premium: true,
      category: "Bolig",
      description: "Lys og eksklusiv: åpning over hele skjermen, nabolaget i sidelengs scroll, klikkbare punkter på kjøkkenet, leilighetstyper, tidslinje og nedtelling til salgsstart.",
      use: "Boligutvikler, eiendomsmegler, interiør, hytteprosjekter",
      theme: {
        colors: { primary: "#2d2a26", accent: "#b08d57", dark: "#1c1a17", soft: "#f1ece4", text: "#26231f", link: "#8a6a3a", page: "#f8f5f0" },
        fonts: { heading: font("Cormorant Garamond", 600), body: font("Manrope", 400) },
        scale: "display",
        tracking: "normal",
        radius: 4,
        button: "outline",
      },
      extras: { progress: true, chapterNav: "side", stickyCta: true, stickyLabel: "Meld interesse", stickyAfter: 25 },
      sections: [
        { type: "hero", props: { layout: "overlay", image: "demo:houses-mountains", kicker: "Tunet Bolig", title: "Nabolaget der fjellet er hagen", ingress: "42 leiligheter og 8 rekkehus ved foten av fjellet – 20 minutter fra sentrum. Salgsstart i mars.", titleSize: "xxl", titleFx: "lines", height: "full", position: "bottom-left", overlay: 35, kenBurns: true } },
        { type: "statement", props: { text: "Vi ville bygge boliger vi selv ønsket å bo i: lyse, stille og med naturen rett utenfor døra.", accent: "naturen rett utenfor døra", fx: "scroll", size: "l" }, style: { pad: "xl" } },
        { type: "hScroll", props: { title: "Livet rundt Tunet", panel: "l", items: [{ image: "demo:mountain-lake", label: "Natur", title: "Fem minutter til vannet", text: "Bading om sommeren, skøyter om vinteren." }, { image: "demo:forest-mist", label: "Tur", title: "Lysløypa starter her", text: "Sju kilometer, belyst til klokka 22." }, { image: "demo:cafe", label: "Hverdag", title: "Kafé og butikk", text: "I første etasje i hovedbygget." }, { image: "demo:city-park", label: "By", title: "20 minutter til sentrum", text: "Buss hvert tiende minutt i rushtiden." }] }, style: { bg: "dark", chapter: "Nabolaget" } },
        { type: "chapter", props: { label: "Boligene", title: "Lys fra tre sider", intro: "Alle leilighetene har vinduer i minst to retninger og balkong mot vest.", layout: "center" }, style: { bg: "none", pad: "l", chapter: "Boligene" } },
        { type: "hotspots", props: { title: "Kjøkkenet i en tremannsleilighet", image: "demo:kitchen-bright", alt: "Lyst kjøkken med spisebord", size: "wide", items: [{ x: 70, y: 40, title: "Integrerte hvitevarer", text: "Kjøleskap, oppvaskmaskin og induksjon er med i prisen." }, { x: 38, y: 62, title: "Spiseplass for seks", text: "Plass til et stort bord ved vinduet." }, { x: 52, y: 22, title: "Takhøyde 2,7 meter", text: "Gir luft og lys i hele rommet." }] } },
        { type: "cards", props: { title: "Velg din bolig", look: "boxed", columns: "3", items: [{ image: "demo:kitchen-modern", title: "2-roms", text: "48–55 m². Fra 3 490 000 kr.", linkLabel: "Se planløsning" }, { image: "demo:sofa", title: "3-roms", text: "68–82 m². Fra 4 790 000 kr.", linkLabel: "Se planløsning" }, { image: "demo:house-red", title: "Rekkehus", text: "118 m² og egen hage. Fra 7 290 000 kr.", linkLabel: "Se planløsning" }] }, style: { bg: "soft", pad: "l", anim: "stagger" } },
        { type: "gallery", props: { mode: "slideshow", items: [{ image: "demo:kitchen-modern", alt: "Kjøkken", caption: "Kjøkken i 2-roms, mørk variant (illustrasjon)." }, { image: "demo:dining", alt: "Spisestue", caption: "Spisestue mot vest." }, { image: "demo:sofa", alt: "Stue", caption: "Stue med vinduer i to retninger." }] } },
        { type: "timeline", props: { title: "Veien til innflytting", items: [{ label: "Mars 2027", title: "Salgsstart", text: "Visning i salgslokalet og på nett." }, { label: "Høsten 2027", title: "Byggestart", text: "Når 60 prosent er solgt." }, { label: "Vår 2029", title: "Innflytting", text: "Trinn 1 med 24 leiligheter." }] }, style: { chapter: "Tidsplan" } },
        { type: "countdown", props: { title: "Salgsstart om", date: "2027-03-01 18:00", done: "Salget er i gang!", ctaLabel: "Meld interesse" }, style: { bg: "dark", pad: "xl" } },
        { type: "factBox", props: { title: "Godt å vite", variant: "soft", collapsible: false, items: [{ text: "Priser er eksempler i malen og inkluderer ikke omkostninger." }, { text: "Bildene er illustrasjoner." }, { text: "Energiklasse B, felles parkeringskjeller med lading." }] } },
        { type: "cta", props: { variant: "card", image: "demo:house-snow", title: "Bli først i køen", text: "Meld interesse og få invitasjon til visningen før alle andre.", label: "Meld interesse", label2: "Last ned prospekt" } },
      ],
    },

    {
      id: "ukemeny",
      name: "Dagligvare – ukemeny",
      premium: true,
      category: "Mat",
      description: "Leken og sulten: middag for hver ukedag i faner, oppskrift i steg, ukens tilbud med førpris, avstemning og nedtelling til tilbudet går ut.",
      use: "Dagligvare, matkasser, netthandel, kjøkkenutstyr",
      theme: {
        colors: { primary: "#c8341e", accent: "#ffc23d", dark: "#2a120c", soft: "#fff3e3", text: "#2a1a14", link: "#b52d18", page: "#fffaf4" },
        fonts: { heading: font("Bricolage Grotesque", 800), body: font("DM Sans", 400) },
        scale: "large",
        tracking: "tight",
        radius: 20,
        button: "pill",
      },
      extras: { progress: true, stickyCta: true, stickyLabel: "Se ukens tilbud", stickyAfter: 30, feedback: true, feedbackQ: "Fikk du middagsinspirasjon?" },
      sections: [
        { type: "hero", props: { layout: "split", image: "demo:shopper", kicker: "Torget Mat", title: "Fem middager for hele uka – under 200 kroner", ingress: "Kokk Jonas Lie har satt sammen ukemenyen. Alt kjøpes i én handletur, og ingenting går til spille.", titleSize: "l", titleFx: "words", height: "tall" } },
        { type: "marquee", props: { text: "Ukemenyen · Én handletur · Null matsvinn", sep: "star", size: "l", speed: "normal" }, style: { bg: "brand", pad: "s" } },
        { type: "tabs", props: { title: "Hva blir det til middag?", look: "big", items: [{ label: "Mandag", title: "Ovnsbakt laks med rotgrønnsaker", html: P("Alt på ett brett, 30 minutter i ovnen. Rester blir til lunsj tirsdag.") + "<ul><li>4 laksefileter</li><li>Gulrot, pastinakk og poteter</li></ul>", image: "demo:vegetables", ctaLabel: "Se oppskriften" }, { label: "Tirsdag", title: "Pasta med grønnsakssaus", html: P("Bruk restene av rotgrønnsakene fra mandag – blendet til en kremet saus.") + "<ul><li>500 g pasta</li><li>Revet ost</li></ul>", image: "demo:cooking-family", ctaLabel: "Se oppskriften" }, { label: "Onsdag", title: "Taco med kylling", html: P("Ukens høydepunkt for barna. Kyllingen kan stekes kvelden før.") + "<ul><li>600 g kyllingfilet</li><li>Lomper og grønnsaker</li></ul>", image: "demo:kitchen-bright", ctaLabel: "Se oppskriften" }, { label: "Torsdag", title: "Grønnsakssuppe med brød", html: P("Rester av grønnsaker gjør seg best i suppe. Bak brødet selv – det tar ti minutter å elte.") + "<ul><li>1 liter kraft</li><li>Hjemmebakt brød</li></ul>", image: "demo:baking", ctaLabel: "Se oppskriften" }, { label: "Fredag", title: "Hjemmelaget pizza", html: P("Deigen lages torsdag og hviler i kjøleskapet til fredag.") + "<ul><li>Hvetemel og gjær</li><li>Tomatsaus og mozzarella</li></ul>", image: "demo:cooking-family", ctaLabel: "Se oppskriften" }] }, style: { pad: "l" } },
        { type: "productCards", props: { title: "Ukens tilbud", columns: "4", layout: "carousel", buttonLabel: "Legg i handlelisten", items: [{ image: "demo:produce-shelf", name: "Norske epler", text: "1 kg", price: "24,90", oldPrice: "34,90", badge: "-30 %" }, { image: "demo:vegetables", name: "Rotgrønnsaker", text: "Pose, 1,5 kg", price: "29,90" }, { image: "demo:strawberries", name: "Jordbær", text: "400 g", price: "34,90", oldPrice: "44,90", badge: "Tilbud" }, { image: "demo:honey", name: "Norsk honning", text: "350 g", price: "79,90" }] }, style: { bg: "soft", anim: "stagger" } },
        { type: "steps", props: { title: "Fredagspizza på 20 minutter", layout: "row", items: [{ image: "demo:baking", title: "Kjevle ut", text: "Ta deigen ut av kjøleskapet en time før." }, { image: "demo:vegetables", title: "Topp", text: "Tynt lag saus, ost og det du har igjen fra uka." }, { image: "demo:kitchen-modern", title: "Stek", text: "250 grader, nederst i ovnen, i ti minutter." }] }, style: { anim: "stagger", pad: "l" } },
        { type: "stats", props: { look: "plain", items: [{ value: "198", unit: "kr", label: "for fem middager til fire personer" }, { value: "0", unit: "", label: "matrester i søpla" }, { value: "1", unit: "", label: "handletur" }] }, style: { pad: "l", anim: "stagger" } },
        { type: "quote", props: { text: "Den smarteste middagen er den som bruker restene fra i går.", name: "Jonas Lie", role: "Kokk og matskribent" }, style: { bg: "brand", pad: "xl", shapeTop: "wave" } },
        { type: "poll", props: { question: "Hvilken middag lager du først?", options: [{ label: "Ovnsbakt laks" }, { label: "Taco med kylling" }, { label: "Hjemmelaget pizza" }, { label: "Grønnsakssuppe" }], thanks: "Takk! Slik har leserne stemt:" } },
        { type: "countdown", props: { title: "Ukens tilbud gjelder i", date: "2026-11-01 23:59", done: "Nye tilbud er ute!", ctaLabel: "Se tilbudene" }, style: { bg: "dark", pad: "l" } },
        { type: "cta", props: { variant: "band", title: "Få handlelisten på telefonen", text: "Hele ukemenyen samlet i appen – med alle varene i riktig mengde.", label: "Last ned handlelisten" }, style: { bg: "brand", pad: "xl", shapeTop: "zigzag" } },
      ],
    },

    {
      id: "karriere",
      name: "Arbeidsgiver og rekruttering",
      premium: true,
      category: "Jobb",
      description: "Menneskene i front: typografisk åpning, ansatte forteller, en dag på jobb i sidelengs scroll, fordeler, søknadsprosess og spørsmål.",
      use: "Rekruttering, arbeidsgiverprofil, utdanning, traineeprogram",
      theme: {
        colors: { primary: "#2b2bd9", accent: "#ff6b4a", dark: "#12123d", soft: "#f0f0fb", text: "#16163a", link: "#2b2bd9", page: "#ffffff" },
        fonts: { heading: font("Syne", 700), body: font("Inter", 400) },
        scale: "display",
        tracking: "tight",
        radius: 24,
        button: "pill",
      },
      extras: { progress: true, chapterNav: "top", stickyCta: true, stickyLabel: "Se ledige stillinger", stickyAfter: 30 },
      sections: [
        { type: "hero", props: { layout: "type", kicker: "Nordverk søker folk", title: "Vi ser etter folk som vil bygge noe som varer", ingress: "340 kolleger på seks kontorer. Vi lager programvaren som holder norske sykehus, havner og strømnett i gang.", titleSize: "xxl", titleFx: "words", height: "tall", position: "center" }, style: { bg: "brand", grain: true, shapeBottom: "curve" } },
        { type: "stats", props: { look: "cards", countUp: true, items: [{ value: "340", unit: "", label: "kolleger" }, { value: "28", unit: "", label: "nasjonaliteter" }, { value: "4,7", unit: "/5", label: "i trivsel i årets undersøkelse" }] }, style: { pad: "l", anim: "stagger" } },
        { type: "richText", props: { lead: true, html: P("Vi tror ikke på perfekte CV-er. Vi tror på folk som er nysgjerrige, som sier fra, og som liker å se at det de lager faktisk blir brukt.") + P("Her forteller tre av kollegene våre hvordan det er å jobbe hos oss.") } },
        { type: "testimonials", props: { title: "Kollegene forteller", layout: "carousel", items: [{ image: "demo:portrait-woman", quote: "Første uka fikk jeg ansvar for en ekte kunde. Det var skummelt – og akkurat det jeg trengte.", name: "Selma, 27", role: "Utvikler, Bergen" }, { image: "demo:portrait-man", quote: "Jeg kom fra industrien. Her bruker jeg fortsatt alt jeg kan, bare på en ny måte.", name: "Arvid, 49", role: "Fagleder, Trondheim" }, { image: "demo:portrait-sun", quote: "Fire dager på kontoret, én hjemme, og ingen som teller timer.", name: "Lena, 34", role: "Designer, Oslo" }] }, style: { bg: "soft", chapter: "Kollegene" } },
        { type: "hScroll", props: { title: "En dag hos oss", panel: "m", items: [{ image: "demo:team-laugh", label: "08:30", title: "Morgenmøte", text: "Ti minutter, stående, med kaffe." }, { image: "demo:team-whiteboard", label: "10:00", title: "Problemløsning", text: "Hele teamet ved tavla før noen skriver en linje kode." }, { image: "demo:team-laptop", label: "13:00", title: "Kundedemo", text: "Vi viser kunden det vi har laget – hver fredag." }, { image: "demo:cafe", label: "16:00", title: "Hjem", text: "Kjernetid til 15. Resten bestemmer du." }] }, style: { bg: "dark", chapter: "Hverdagen" } },
        { type: "cards", props: { title: "Dette får du", look: "boxed", columns: "4", items: [{ symbol: "⏱", title: "Fleksitid", text: "Kjernetid 9–15." }, { symbol: "🏡", title: "Hjemmekontor", text: "Inntil to dager i uka." }, { symbol: "📚", title: "Fagdager", text: "Ti dager i året til læring." }, { symbol: "👶", title: "Full lønn i permisjon", text: "Også over 6G." }] }, style: { pad: "l", anim: "stagger", chapter: "Fordeler" } },
        { type: "quote", props: { text: "Vi ansetter for holdning og nysgjerrighet. Resten lærer vi deg.", name: "Kristin Aas", role: "Daglig leder, Nordverk" }, style: { bg: "brand", pad: "xl", anim: "blur" } },
        { type: "timeline", props: { title: "Slik søker du", items: [{ label: "Uke 1", title: "Send søknad", text: "En CV og noen setninger om hvorfor du vil jobbe her. Ingen lange brev." }, { label: "Uke 2", title: "Første samtale", text: "En uformell prat på 30 minutter, på video eller kaffe." }, { label: "Uke 3", title: "Caseoppgave", text: "En liten oppgave du løser sammen med to av oss." }, { label: "Uke 4", title: "Svar", text: "Du får svar, uansett utfall." }] }, style: { chapter: "Søknaden" } },
        { type: "gallery", props: { mode: "grid", items: [{ image: "demo:team-laugh", alt: "Kolleger ler sammen" }, { image: "demo:team-whiteboard", alt: "Møte ved tavla" }, { image: "demo:team-laptop", alt: "Kolleger rundt en laptop" }] } },
        { type: "accordion", props: { title: "Spørsmål og svar", items: [{ q: "Må jeg ha utdanning innen IT?", a: "Nei. Mange av oss kommer fra helt andre fag. Vi ser etter hvordan du tenker." }, { q: "Kan jeg jobbe deltid?", a: "Ja, i mange stillinger. Si fra i søknaden." }, { q: "Har dere traineeprogram?", a: "Ja, med oppstart hver høst. Søknadsfristen er 1. mars." }] } },
        { type: "cta", props: { variant: "band", title: "Klar for neste steg?", text: "Se ledige stillinger, eller send en åpen søknad – vi leser alle.", label: "Se ledige stillinger", label2: "Send åpen søknad" }, style: { bg: "dark", pad: "xl", shapeTop: "slant" } },
      ],
    },

    {
      id: "trening",
      name: "Trening og aktiv hverdag",
      premium: true,
      category: "Helse",
      description: "Mørk og energisk: store versaler, skrivemaskin-tekst, øvelser som kort, test deg selv, medlemskap i tabell og nedtelling til kampanjen slutter.",
      use: "Treningssenter, sportsbutikk, løp og arrangementer, helseapper",
      theme: {
        colors: { primary: "#c6ff3d", accent: "#c6ff3d", dark: "#0b0b0b", soft: "#18181a", text: "#111111", link: "#4f7f00", page: "#0f0f10" },
        fonts: { heading: font("Barlow Condensed", 800), body: font("Barlow", 400) },
        scale: "display",
        tracking: "normal",
        headingCase: "upper",
        buttonCase: "upper",
        radius: 6,
        button: "solid",
      },
      extras: { progress: true, stickyCta: true, stickyLabel: "Prøv gratis i 7 dager", stickyAfter: 25, feedback: true },
      sections: [
        { type: "hero", props: { layout: "overlay", image: "demo:gym-trainer", kicker: "Kraft Trening", title: "Sterkere på 12 uker", ingress: "Personlig trener Marte Lund har laget programmet for deg som vil komme i gang – tre økter i uka, 45 minutter hver.", titleSize: "xxl", titleFx: "letters", height: "full", position: "bottom-left", overlay: 55 } },
        { type: "statement", props: { kicker: "Marte sier", text: "Du trenger ikke mer motivasjon. Du trenger en plan.", fx: "typewriter", size: "xl", font: "heading" }, style: { pad: "xl", align: "center" } },
        { type: "rankList", props: { title: "Fem øvelser programmet bygger på", order: "up", layout: "cards", items: [{ title: "Knebøy", text: "Beina og setet. Start med egen kroppsvekt." }, { title: "Markløft", text: "Hele baksiden av kroppen. Teknikken først." }, { title: "Pushups", text: "Bryst, skuldre og armer. Mot benken går fint." }, { title: "Roing", text: "Ryggen og holdningen. Med strikk hjemme." }, { title: "Planke", text: "Kjernemuskulaturen. 3 × 30 sekunder." }] }, style: { anim: "stagger", pad: "l" } },
        { type: "stats", props: { look: "huge", countUp: true, items: [{ value: "36", unit: "økter", label: "på 12 uker – det er alt som skal til" }] }, style: { bg: "brand", pad: "xl" } },
        { type: "imageText", props: { image: "demo:gym-pair", alt: "Mann og kvinne trener", title: "Du trener aldri alene", html: P("Første økt tar du sammen med en trener, som justerer programmet etter deg. Deretter følger appen deg resten av veien.") + P("Står du fast, booker du en ny time på 30 sekunder."), ctaLabel: "Book første økt", side: "left", ratio: "4:5" } },
        { type: "quiz", props: { title: "Hvor mye vet du om trening?", questions: [{ q: "Hvor mange økter i uka trenger en nybegynner?", options: "1\n2–3\n6", correct: 2, explain: "To til tre økter gir god fremgang og tid til restitusjon." }, { q: "Når skjer muskelveksten?", options: "Under økta\nI hvilen etterpå\nKun om morgenen", correct: 2, explain: "Muskelen bygges opp i hvilen mellom øktene." }, { q: "Hva bør du øke først?", options: "Vekten\nAntall repetisjoner\nTempoet", correct: 2, explain: "Flere repetisjoner med god teknikk før tyngre vekter." }], results: [{ min: 0, title: "Helt fersk", text: "Perfekt – programmet er laget for deg." }, { min: 2, title: "Godt i gang", text: "Du kan teorien. Nå gjenstår bare øktene." }], ctaLabel: "Start programmet" }, style: { bg: "soft" } },
        { type: "testimonials", props: { title: "De gjorde det", layout: "grid", items: [{ image: "demo:portrait-hiker", quote: "Jeg hadde aldri løftet en vekt. Etter 12 uker tar jeg knebøy med 60 kilo.", name: "Stine, 38", role: "Medlem i Tromsø" }, { image: "demo:run-sunset", quote: "Ryggen har aldri vært bedre.", name: "Henrik, 52", role: "Medlem i Bodø" }, { image: "demo:walk-forest", quote: "Tre økter i uka passet inn i småbarnslivet.", name: "Amalie, 33", role: "Medlem i Ålesund" }] }, style: { anim: "stagger" } },
        { type: "specTable", props: { title: "Velg medlemskap", head1: "Basis", head2: "Pluss", head3: "Premium", highlight: "2", rows: [{ label: "Pris per måned", v1: "349 kr", v2: "499 kr", v3: "749 kr" }, { label: "Alle sentre", v1: "–", v2: "✓", v3: "✓" }, { label: "Gruppetimer", v1: "–", v2: "✓", v3: "✓" }, { label: "Personlig trener", v1: "–", v2: "1 time", v3: "1 time i måneden" }, { label: "Bindingstid", v1: "Ingen", v2: "Ingen", v3: "Ingen" }], note: "Eksempelpriser i malen. Bytt ut med annonsørens priser og vilkår." } },
        { type: "countdown", props: { title: "Ingen innmeldingsavgift i", date: "2026-11-30 23:59", done: "Kampanjen er over – følg med på neste!", ctaLabel: "Bli medlem" }, style: { bg: "dark", pad: "xl", grain: true } },
        { type: "cta", props: { variant: "band", title: "Prøv gratis i 7 dager", text: "Ingen binding, ingen innmeldingsavgift. Programmet ligger klart i appen.", label: "Start gratis prøveuke" }, style: { bg: "brand", pad: "xl", shapeTop: "slant" } },
      ],
    },
  ];
});
