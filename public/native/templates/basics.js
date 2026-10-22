/* =========================================================================
   native/templates/basics.js — the plain workhorses (category «Grunnmal»).

   The five starting points most real jobs begin from: a launch, a retail
   campaign, a practical guide, a portrait interview and a visual scroll
   story. Each has its own theme, its own photos and sample copy at the
   length and tone a finished BrandStudio page needs, so the editor shows
   what belongs where. The advertisers (Sykla, Lysverket, Trygg, Ryddig,
   Kystruta) are invented.

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
      description: "Nytt produkt: åpning i fullskjerm, et budskap som legger seg over, nøkkeltall, scrollfortelling, modellvalg og prøv-selv.",
      use: "Elsykkel, elektronikk, bil, nye tjenester – alt som skal lanseres",
      theme: {
        colors: { primary: "#13261f", accent: "#d4ff3a", dark: "#0c1713", soft: "#eef2e9", text: "#141a17", link: "#2c6a3c", page: "#fbfcf8" },
        fonts: { heading: font("Space Grotesk", 700), body: font("IBM Plex Sans", 400) },
        scale: "large",
        tracking: "tight",
        radius: 16,
        button: "pill",
      },
      extras: { progress: true, readTime: true, hoverFx: "rich" },
      sections: [
        { type: "hero", props: { layout: "overlay", image: "demo:ebike-sea", imageMobile: "demo:ebike-rider-city", kicker: "Sykla Urban 2", title: "Bakkene er de samme. Du er ikke det.", ingress: "Den nye elsykkelen fra Sykla veier 19 kilo, går 110 kilometer på én lading og er laget for norske byer. Vi har syklet den gjennom en hel høst.", titleSize: "xl", titleFx: "words", height: "full", position: "bottom-left", overlay: 35, kenBurns: true } },
        { type: "statement", props: { kicker: "Visste du", text: "Fire av ti bilturer i norske byer er kortere enn fem kilometer. Det er akkurat så langt sykkelen er raskest.", accent: "raskest", fx: "words", size: "l" }, style: { bg: "dark", pad: "xl", minH: "screen", transition: "stack", anim: "none" } },
        { type: "richText", props: { lead: true, dropCap: true, html: P("Det er halv åtte en tirsdag i oktober, og regnet har akkurat bestemt seg. Vi står nederst i Fjellveien i Bergen med en Sykla Urban 2, et kart over byens bratteste bakker og en plan om å komme på jobb uten å svette gjennom skjorta.") + P("Tjue minutter senere står sykkelen parkert utenfor kontoret. Pulsen er normal, og skjermen viser at batteriet har gått fra 100 til 91 prosent. <mark>Det er første gang i år vi har syklet til jobb i regnvær uten å angre.</mark>") + "<h2>Laget for byer som ikke er flate</h2>" + P("De fleste elsykler er tegnet for Amsterdam og København. Urban 2 er utviklet i Trondheim, og det merkes. Motoren sitter i krankboksen og leser hvor hardt du tråkker 1 000 ganger i sekundet, så hjelpen kommer i det øyeblikket bakken begynner – ikke et halvt pedaltråkk for sent.") + P("Rammen er senket, slik at du kan gå av og på i lyskryss med dress eller skjørt. Skjermene er av aluminium og går helt ned over dekket, og lyset står på hele døgnet, fordi mørketiden ikke spør om du husket å skru det på.") }, style: { anim: "fade", headFx: "highlight", animEase: "expo" } },
        { type: "imageText", props: { image: "demo:ebike-display", alt: "Hånd på styret og fargeskjermen på Sykla Urban 2", title: "Skjermen som sier fra før du går tom", html: P("Urban 2 regner ut rekkevidden fra hvordan du faktisk sykler, ikke fra et laboratorium. Den tar med høydemeterne på ruta, temperaturen ute og hvor mye hjelp du har brukt den siste uka.") + P("Kobler du til telefonen, får du sykkelen med i kalenderen: Skjermen foreslår lading kvelden før en lang dag, og varsler hvis noen flytter sykkelen når den står låst."), ctaLabel: "Se alle funksjonene", side: "left", ratio: "4:5" }, style: { anim: "mask-left", animEase: "expo", headFx: "words" } },
        { type: "stats", props: { title: "Tallene som betyr noe", countUp: true, look: "lines", items: [{ value: "19", unit: "kg", label: "med batteri – lett nok til å bære opp trappa" }, { value: "110", unit: "km", label: "rekkevidde i blandet bykjøring" }, { value: "3,5", unit: "timer", label: "fra tomt til fullt på vanlig stikkontakt" }, { value: "5", unit: "år", label: "garanti på ramme og motor" }] }, style: { bg: "brand", pad: "xl", anim: "stagger", animEase: "expo", animStep: 120, headFx: "highlight", transition: "blend" } },
        { type: "stickyStory", props: { image: "demo:bergen-wet-street", layout: "overlay", transition: "fade", cardSide: "left", cardStyle: "dark", dots: true, overlay: 25, slides: [{ title: "Regn", text: "Bergen har over 200 regnværsdager i året. Skivebremser i begge ender og dekk med refleksstripe gjør at Urban 2 stopper like kort på våt brostein som på tørr asfalt – vi målte det." }, { title: "Bakker", text: "Opptil 85 Nm dreiemoment. Fjellveien har 14 prosent stigning på det bratteste, og den tok vi i tredje gir uten å reise oss fra setet.", image: "demo:bergen-hill-street" }, { title: "Brostein og smale smug", text: "Bredere dekk og demping i forgaffelen gjør at sykkelen ikke hopper når underlaget gjør det – heller ikke ned smugene i Sandviken.", image: "demo:bergen-cobble-lane" }, { title: "Parkering", text: "Innebygd lås på bakhjulet og GPS-sporing i appen. Batteriet låses i rammen og kan tas med inn for lading.", image: "demo:trondheim-bike-parked" }] } },
        { type: "richText", props: { html: "<h2>Hva koster det egentlig å sykle?</h2>" + P("Urban 2 koster fra 29 990 kroner. Det er mye penger for en sykkel, og lite penger for en bil. Sykla har regnet på det: Bytter du 15 av de korte bilturene i måneden med sykkelen, sparer du drivstoff, bompenger og parkering for omtrent det sykkelen koster i løpet av to og et halvt år.") + P("Strømmen til en full lading koster mindre enn en krone. Første service er gratis etter tre måneder, og alle forhandlerne har lånesykkel mens din står inne.") }, style: { anim: "fade" } },
        { type: "poll", props: { question: "Hva stopper deg fra å sykle til jobben?", options: [{ label: "Bakkene" }, { label: "Regnet" }, { label: "Avstanden" }, { label: "Ingenting – jeg sykler allerede" }], thanks: "Takk! Slik har andre lesere svart:", showResults: true }, style: { bg: "soft", pad: "l", anim: "rise" } },
        { type: "specTable", props: { title: "Velg din Urban 2", head1: "Urban 2", head2: "Urban 2 Pluss", head3: "Urban 2 Last", highlight: "2", rows: [{ label: "Pris fra", v1: "29 990 kr", v2: "34 990 kr", v3: "41 990 kr" }, { label: "Rekkevidde", v1: "80 km", v2: "110 km", v3: "95 km" }, { label: "Vekt", v1: "18 kg", v2: "19 kg", v3: "27 kg" }, { label: "Bagasjebrett", v1: "–", v2: "Til 25 kg", v3: "Til 80 kg" }, { label: "Barnesete", v1: "–", v2: "Ett", v3: "To" }], note: "Priser og data fra Sykla, oktober 2026. Rekkevidden varierer med vær, vekt og terreng." }, style: { anim: "fade-up", animEase: "expo" } },
        { type: "quote", props: { text: "Jeg trodde jeg kjøpte en sykkel. Jeg kjøpte egentlig tilbake tjue minutter av hver eneste dag.", name: "Jonas Eide", role: "Syklet Urban 2 i testperioden, Bergen", image: "demo:portrait-man-smile", size: "large" }, style: { bg: "dark", pad: "l", anim: "blur", animSpeed: "slow" } },
        { type: "factBox", props: { title: "Sykla Urban 2 i korte trekk", variant: "soft", collapsible: false, items: [{ text: "Pris fra 29 990 kr. Kan kjøpes på avbetaling over 24 måneder." }, { text: "Rekkevidde opptil 110 km, lading på 3,5 timer." }, { text: "Motor i krankboksen med 85 Nm dreiemoment." }, { text: "Innebygd lås, lys som alltid står på og GPS-sporing i appen." }, { text: "Prøvetur hos alle forhandlere, uten forpliktelser." }] }, style: { anim: "fade" } },
        { type: "cta", props: { variant: "card", image: "demo:oslo-cyclist-street", title: "Prøv den i dine egne bakker", text: "Book en gratis prøvetur på 45 minutter. Vi har sykkelen klar når du kommer.", label: "Book prøvetur", label2: "Finn forhandler" }, style: { anim: "rise" } },
      ],
    },
    {
      id: "kampanje",
      name: "Kampanje og produkter",
      category: "Grunnmal",
      description: "Butikk eller netthandel: tydelig tilbud, nyttige råd, produktkort med førpris, nedtelling og vilkår.",
      use: "Interiør, dagligvare, elektronikk, sesong- og høytidskampanjer",
      theme: {
        colors: { primary: "#3b2a1e", accent: "#c4511c", dark: "#231912", soft: "#f6ede2", text: "#2a211b", link: "#a3441a", page: "#fffaf4" },
        fonts: { heading: font("Fraunces", 600), body: font("DM Sans", 400) },
        scale: "large",
        tracking: "normal",
        radius: 6,
        button: "solid",
      },
      extras: { progress: false, hoverFx: "rich" },
      sections: [
        { type: "hero", props: { layout: "split", image: "demo:lamp-sofa-warm", imageMobile: "demo:lamp-sofa-corner", kicker: "Høstkampanje · 20. oktober–10. november", title: "Mørketiden starter i stua", ingress: "Riktig lys gjør mer for et rom enn en ny sofa. Nå er alle lamper hos Lysverket 25 prosent billigere – og vi har spurt en lysdesigner hvordan du bruker dem.", titleSize: "xl", titleFx: "lines", height: "tall" } },
        { type: "marquee", props: { text: "25 % på alle lamper", sep: "star", speed: "slow", size: "l" }, style: { bg: "brand", pad: "s" } },
        { type: "richText", props: { lead: true, html: P("Når klokka stilles tilbake, flytter livet innendørs. Likevel lyser mange av oss opp stua med én taklampe – og lurer på hvorfor rommet føles kaldt.") + P("«Et rom trenger lys i tre høyder», sier lysdesigner Hedda Lunde, som har tegnet belysning til hoteller og boliger i tjue år. «Ett lys oppe for å finne fram, ett i arbeidshøyde for å lese og lage mat, og ett lavt for stemningen. Det siste er det de fleste glemmer.»") + "<h2>Tre lag med lys</h2>" + P("<strong>Allmennlys</strong> er taklampen eller spotene. Den skal være dimbar, ellers blir den enten for mye eller for lite. <strong>Arbeidslys</strong> er leselampen ved sofaen og lyset over kjøkkenbenken. <strong>Stemningslys</strong> er bordlampene, vinduslampene og stearinlysene – lavt, varmt og gjerne flere små i stedet for én stor.") }, style: { anim: "fade", headFx: "highlight" } },
        { type: "cards", props: { title: "Ett rom av gangen", look: "overlay", columns: "3", items: [{ image: "demo:candles-autumn", title: "Vinduskarmen", text: "Små lamper og levende lys i vinduet gjør rommet større om kvelden – og huset lunere fra gata." }, { image: "demo:dining-pendant", title: "Spisestua", text: "Pendelen 60–70 cm over bordplata, så lyset faller på maten og ikke i øynene." }, { image: "demo:lamp-orange-desk", title: "Hjemmekontoret", text: "Lyset fra siden, ikke bakfra – da slipper du gjenskinn i skjermen." }] }, style: { anim: "stagger", animEase: "spring", animStep: 130, headFx: "words" } },
        { type: "hotspots", props: { title: "Slik lyser du opp stua", image: "demo:living-green-stove", alt: "Stue med grønne vegger, peis, bordlampe og lyslenke", size: "wide", items: [{ x: 30, y: 55, title: "Peisen", text: "Det varmeste lyset i rommet. La den være stemningslyset, og hold de andre lampene lave rundt den." }, { x: 64, y: 45, title: "Bordlampen", text: "Tekstilskjerm og 2 700 kelvin. Den sitter lavt nok til at du ser lyset, men aldri pæra." }, { x: 77, y: 36, title: "Leselampen", text: "Et rettet lys i hylla gir arbeidslys til lesestolen uten å lyse opp hele rommet." }, { x: 73, y: 10, title: "Lyslenken", text: "Små lys høyt oppe trekker blikket opp og får taket til å føles høyere." }, { x: 17, y: 82, title: "Levende lys", text: "Det laveste laget. Ett eller to lys på bordet er nok." }] }, style: { anim: "fade-up", animEase: "expo", headFx: "words" } },
        { type: "productCards", props: { title: "Kampanjefavoritter", columns: "4", layout: "grid", buttonLabel: "Legg i handlekurv", items: [{ image: "demo:lamp-ceramic", name: "Bordlampe Kiel", text: "Keramikk, H 42 cm", price: "1 124,-", oldPrice: "1 499,-", badge: "−25 %" }, { image: "demo:lamp-brass", name: "Bordlampe Sopp", text: "Messing, H 31 cm", price: "1 874,-", oldPrice: "2 499,-", badge: "−25 %" }, { image: "demo:pendant-rattan", name: "Taklampe Flett", text: "Rotting, Ø 45 cm", price: "974,-", oldPrice: "1 299,-", badge: "Bestselger" }, { image: "demo:lamp-floor-arc", name: "Gulvlampe Bue", text: "Lin og stål, H 180 cm", price: "2 249,-", oldPrice: "2 999,-", badge: "−25 %" }] }, style: { bg: "soft", pad: "l", anim: "stagger", animEase: "spring", animStep: 110 } },
        { type: "imageText", props: { image: "demo:lamp-wall-sofa", alt: "Vegglampe over en grå sofa", title: "Lysdesignerens beste råd: Heng den lavere", html: P("«Nesten alle henger lamper for høyt», sier Hedda Lunde. «En vegglampe over sofaen bør sitte rundt 140 centimeter over gulvet, så lyset treffer boka og ikke taket.»") + P("Samme regel gjelder bordlampen: Skjermens underkant skal være omtrent i øyehøyde når du sitter. Da ser du lyset, men ikke pæra."), ctaLabel: "Se alle vegglamper", side: "right", ratio: "4:5" }, style: { anim: "fade-up", animEase: "expo" } },
        { type: "steps", props: { title: "Slik velger du riktig pære", layout: "row", items: [{ title: "Velg varm farge", text: "2 700 kelvin eller lavere gir det gule, lune lyset. Kaldere lys passer på badet og i boden." }, { title: "Se på lumen, ikke watt", text: "Rundt 400 lumen holder til en bordlampe. Over spisebordet trenger du 800 eller mer." }, { title: "Sjekk at den er dimbar", text: "Står det ikke på pakken, er den det ikke. Da hjelper ingen dimmer i veggen." }] }, style: { anim: "stagger", animEase: "expo", animStep: 140 } },
        { type: "countdown", props: { title: "Kampanjen slutter om", date: "2026-11-10 23:59", done: "Kampanjen er over – takk til alle som handlet!", ctaLabel: "Handle før fristen" }, style: { bg: "dark", pad: "l", anim: "zoom", animEase: "expo" } },
        { type: "factBox", props: { title: "Godt å vite", variant: "soft", collapsible: false, items: [{ text: "Kampanjen gjelder 20. oktober–10. november 2026, i alle butikker og på nett." }, { text: "25 % rabatt på ordinær pris. Gjelder ikke varer som allerede er satt ned." }, { text: "Fri frakt ved kjøp over 999 kroner." }, { text: "60 dagers åpent kjøp på alle lamper." }] }, style: { anim: "fade" } },
        { type: "cta", props: { variant: "band", title: "Finn lampen som passer rommet ditt", text: "Over 400 lamper på nett og i 38 butikker over hele landet.", label: "Se alle lamper", label2: "Finn nærmeste butikk" }, style: { bg: "brand", pad: "xl", anim: "rise" } },
      ],
    },
    {
      id: "guide",
      name: "Guide og råd",
      category: "Grunnmal",
      description: "Nyttig, tekstdrevet sak: tittelen synlig med en gang, tall, nummererte steg med bilder, ekspertråd, myter, spørsmål og svar og en huskeliste.",
      use: "Forsikring, bank, helse, bolig, bil – alt der leseren skal lære noe",
      theme: {
        colors: { primary: "#173d32", accent: "#b8893b", dark: "#0f2a22", soft: "#f1efe7", text: "#1c231f", link: "#1f5b49", page: "#fcfbf7" },
        fonts: { heading: font("Libre Baskerville", 400), body: font("Inter", 400) },
        scale: "large",
        tracking: "normal",
        radius: 4,
        button: "solid",
      },
      extras: { progress: true, readTime: true, motion: "calm", feedback: true, feedbackQ: "Var guiden nyttig?" },
      sections: [
        { type: "hero", props: { layout: "split", image: "demo:cabin-roof-snow", imageMobile: "demo:cabin-snow-trees", kicker: "Guide · Hytta", title: "Slik gjør du hytta klar for vinteren", ingress: "Frosne rør og snøtunge tak er de vanligste vinterskadene på norske hytter. Med én time og en god sjekkliste unngår du de fleste.", titleSize: "l", titleFx: "lines", height: "tall" } },
        { type: "richText", props: { lead: true, dropCap: true, html: P("Det er lett å glemme hytta når høsten tar over. Siste helg i september rydder du bort hagemøblene, låser døra og tenker at resten ordner seg til vinterferien. Ofte gjør det det. Men hver vinter står tusenvis av hytteeiere i døra til et kaldt, vått eller skadet hus.") + P("«De fleste vinterskadene vi ser, kunne vært unngått med en halvtime ekstra før man dro», sier skadeforebygger Kari Bakke i Trygg Forsikring. «Det er sjelden dramatisk. Det er en kran som ikke ble stengt, eller et tak ingen har sett på i fem år.»") + P("Vi har bedt henne om rådene som faktisk betyr noe – i den rekkefølgen du bør gjøre dem.") }, style: { anim: "fade" } },
        { type: "stats", props: { title: "Vinteren på hytta, i tall", countUp: true, look: "lines", items: [{ value: "4 100", unit: "", label: "skademeldinger fra hytter til Trygg sist vinter" }, { value: "62", unit: "%", label: "av dem skyldtes vann – frosne rør og lekkasjer" }, { value: "38 000", unit: "kr", label: "kostet en vannskade på hytta i snitt" }] }, style: { bg: "soft", pad: "l", anim: "stagger", animEase: "expo", animStep: 140, headFx: "highlight" } },
        { type: "steps", props: { title: "Fem ting du gjør før du låser døra", layout: "column", items: [{ title: "Steng vannet og tøm rørene", text: "Steng hovedkranen, åpne alle kraner og la dem renne tomme. Husk utekranen, vannlåsen i dusjen og vannet i toalettsisternen. Har hytta frostvakt på vannet, sjekk at den virker." }, { title: "Se på taket og takrennene", text: "Tette takrenner gir isdannelse og lekkasjer. Fjern løv og kvister, og sjekk at ingen takstein har løsnet i høststormene." }, { title: "Feie pipa og sjekk ildstedet", text: "Har pipa ikke vært feid på to år, bør du bestille feier. Sjekk at det ikke er sprekker i peisen eller ovnen, og at aska er kald før den bæres ut." }, { title: "Sett varmen på frostsikring", text: "En varmeovn på 8–10 grader i det kaldeste rommet holder rørene trygge. Har du smart styring, kan du skru opp varmen dagen før du kommer." }, { title: "Avtal snømåking og tilsyn", text: "Spør en nabo eller hyttevakt om å se innom etter store snøfall. Mange forsikringer krever at taket måkes når snølasten blir høy." }] }, style: { anim: "stagger", animEase: "expo", animStep: 160, headFx: "words" } },
        { type: "image", props: { image: "demo:outdoor-tap", alt: "Utekran med rødt håndtak", caption: "Utekranen er den som oftest blir glemt. Steng den innenfra og la den stå åpen ute.", image2: "demo:stove-fire", alt2: "Fyr i peisen i en hytte", caption2: "Aska kan holde på varmen i flere døgn. Bær den ut i en metallbøtte med lokk.", size: "wide", ratio: "4:3" }, style: { anim: "fade-up", animEase: "expo" } },
        { type: "quote", props: { text: "Den viktigste kranen på hytta er den du ikke ser. Finn hovedkranen før det blir kaldt – ikke mens vannet renner.", name: "Kari Bakke", role: "Skadeforebygger, Trygg Forsikring", image: "demo:portrait-woman-40", size: "large" }, style: { bg: "image", bgImage: "demo:cabin-window-night", overlay: 65, pad: "xl", minH: "half", anim: "mask-left", animEase: "expo" } },
        { type: "richText", props: { html: "<h2>Når skaden likevel har skjedd</h2>" + P("Kommer du til en hytte med vann på gulvet, skal du først stenge hovedkranen og slå av strømmen til rom der vannet står. Ta bilder av alt før du begynner å rydde, og ta vare på det som er ødelagt til forsikringsselskapet har sett det.") + P("Meld skaden så raskt du kan. Jo tidligere tørkingen starter, desto mindre blir skaden – og desto raskere kan du bruke hytta igjen. De fleste selskaper har døgnåpen skadetelefon i vinterferien.") }, style: { anim: "fade", headFx: "highlight" } },
        { type: "flipCards", props: { title: "Myte eller fakta?", hint: "Trykk på kortene for å se svaret", columns: "3", items: [{ image: "demo:firewood-stack", front: "Det holder å fyre godt i peisen helgen før du drar", backTitle: "Myte", back: "Varmen fra peisen er borte etter et døgn. Rørene trenger jevn varme, eller å være tomme." }, { image: "demo:cabin-snow-forest", front: "Snø på taket isolerer og er bare bra", backTitle: "Både og", back: "Et tynt lag isolerer. Men en meter våt snø kan veie over 300 kilo per kvadratmeter – mer enn mange tak tåler." }, { front: "Innboforsikringen dekker alt på hytta", backTitle: "Myte", back: "Hytta og innboet forsikres hver for seg. Sjekk at begge er med, og at summene stemmer med det du faktisk har." }] }, style: { bg: "soft", pad: "l", anim: "stagger", animEase: "spring", animStep: 130 } },
        { type: "accordion", props: { title: "Spørsmål og svar", items: [{ q: "Må jeg tømme vannet hvis hytta har varme på hele vinteren?", a: "Ikke nødvendigvis, men et strømbrudd i kuldeperioden kan gjøre stor skade. Med en enkel strømvarsler får du beskjed på telefonen hvis strømmen går." }, { q: "Hvor ofte må pipa feies?", a: "Det avhenger av hvor mye du fyrer. Kommunen sender feier etter behov, men på hytter som brukes lite, bør du selv bestille feiing hvert annet til fjerde år." }, { q: "Dekker forsikringen skader fra snø på taket?", a: "Snøtyngde dekkes som regel, men mange vilkår krever at du har gjort det som er rimelig for å forebygge – som å måke taket når snølasten er stor." }, { q: "Trenger jeg brannslukker på hytta?", a: "Ja. Alle boliger og hytter skal ha røykvarsler og slokkeutstyr. Sjekk trykket på apparatet før vinteren, og bytt batteri i røykvarsleren." }, { q: "Hva gjør jeg hvis jeg ikke kommer meg til hytta etter et uvær?", a: "Be en nabo eller hyttevakt se etter. Mange vel og hytteforeninger har lister over folk som tar oppdrag i vinterhalvåret." }] }, style: { anim: "fade-up", animEase: "expo" } },
        { type: "factBox", props: { title: "Huskeliste før du drar", variant: "brand", collapsible: false, items: [{ text: "Hovedkranen stengt og rørene tømt – også utekranen." }, { text: "Varmen satt på 8–10 grader i det kaldeste rommet." }, { text: "Takrenner renset og taket sjekket for løse takstein." }, { text: "Ildsted kaldt, aske båret ut i en metallbøtte." }, { text: "Røykvarsler testet og brannslukker sjekket." }, { text: "Avtale om snømåking og tilsyn ved store snøfall." }] }, style: { anim: "fade" } },
        { type: "cta", props: { variant: "card", image: "demo:cabins-snow", title: "Er hytta godt nok forsikret?", text: "Det tar fem minutter å sjekke om forsikringen dekker det du tror – og hva det koster å få med resten.", label: "Sjekk hytteforsikringen", label2: "Last ned sjekklisten" }, style: { anim: "rise" } },
      ],
    },
    {
      id: "portrett",
      name: "Portrett og intervju",
      category: "Grunnmal",
      description: "Menneskene først: portrett i fullskjerm, en scene som trekker leseren inn, stort sitat, intervju med spørsmål og svar, tidslinje og bildeserie.",
      use: "Ambassadører, kunder, ansatte og gründere – når en person bærer historien",
      theme: {
        colors: { primary: "#1d1a17", accent: "#0f6b62", dark: "#171411", soft: "#efe9df", text: "#1f1b17", link: "#0f6b62", page: "#f8f4ec" },
        fonts: { heading: font("Fraunces", 500), body: font("Figtree", 400) },
        scale: "display",
        tracking: "normal",
        radius: 2,
        button: "solid",
      },
      extras: { progress: true, readTime: true },
      sections: [
        { type: "hero", props: { layout: "overlay", image: "demo:potter-studio", imageMobile: "demo:potter-closeup", kicker: "Portrett", title: "«Leira bestemmer tempoet. Ikke jeg.»", ingress: "Arne Vik var ingeniør i 31 år. Som 61-åring sa han opp, kjøpte en brukt dreieskive og åpnet verksted i en gammel smie på Kaupanger. I dag har koppene hans tre måneders ventetid.", titleSize: "l", titleFx: "words", height: "full", position: "bottom-left", overlay: 45 } },
        { type: "richText", props: { lead: true, dropCap: true, html: P("Det lukter vått ler og vedfyring i smia. Arne Vik står bøyd over dreieskiva med begge hendene rundt en klump leire som ennå ikke har bestemt seg for hva den skal bli. Han sier ingenting på nesten et minutt. Så retter han seg opp, tørker hendene på forkleet og smiler.") + P("«Unnskyld. Hvis jeg slipper den nå, må jeg begynne på nytt.»") + P("Den gamle smia ved Sognefjorden har vært verkstedet hans i tre år. Hyllene langs veggene er fulle av kopper, skåler og fat i alle stadier: grå og våte, kritthvite og tørre, og blanke i den dype blåfargen som har blitt kjennetegnet hans. <mark>Alt er laget for hånd, og ingen to er like.</mark>") }, style: { anim: "fade" } },
        { type: "quote", props: { text: "Det finnes ingen snarveier i leire. Skynder du deg, ser du det på koppen tre dager senere – når den sprekker i ovnen.", name: "Arne Vik", role: "Keramiker, Kaupanger", size: "large" }, style: { bg: "dark", pad: "xl", minH: "screen", transition: "stack", anim: "mask-left", animEase: "expo", animSpeed: "slow" } },
        { type: "image", props: { image: "demo:potter-wheel", alt: "Hender som former leire på dreieskiva", caption: "Hver kopp dreies, tørkes i en uke og brennes to ganger.", image2: "demo:potter-hands-warm", alt2: "Hender som former en stor krukke", caption2: "De største krukkene tar en hel dag på skiva.", size: "wide", ratio: "4:5" }, style: { anim: "fade-up", animEase: "expo" } },
        { type: "richText", props: { html: "<h2>«Jeg hadde aldri tid. Så tok jeg den.»</h2>" + P("<strong>Du hadde en trygg jobb i over tretti år. Hvorfor sa du opp?</strong>") + P("– Jeg begynte på et kveldskurs i keramikk fordi kona mi meldte meg på. Etter tre ganger gledet jeg meg mer til onsdag kveld enn til resten av uka. Da jeg fylte 60, tenkte jeg at hvis jeg ikke gjorde det nå, ville jeg aldri gjøre det.") + P("<strong>Hva var det vanskeligste med å starte for deg selv?</strong>") + P("– Ikke leira. Papirene. Jeg var vant til at noen andre tok seg av regnskap, moms og fakturaer. Det første året brukte jeg søndagene på kvitteringer i en skoeske. Det var da jeg nesten ga opp.") + "<blockquote><p>Det første året brukte jeg søndagene på kvitteringer i en skoeske.</p></blockquote>" + P("<strong>Hva endret seg?</strong>") + P("– En kunde som driver gårdsbutikk viste meg hvordan hun gjorde det. Nå tar jeg bilde av kvitteringen med telefonen, og fakturaen går ut før kunden har kommet seg ut av døra. Søndagene er mine igjen.") + P("<strong>Hva betyr det å selge noe du har laget selv?</strong>") + P("– At folk drikker kaffe av noe jeg har holdt i hendene. Det er en merkelig, fin tanke. Noen sender meg bilder av koppene sine fra hytta eller frokostbordet. Dem har jeg hengt opp her.") }, style: { anim: "fade", headFx: "fade-words" } },
        { type: "timeline", props: { title: "Veien til verkstedet", items: [{ label: "1993", title: "Ingeniør i Bergen", text: "31 år med prosjektledelse, budsjetter og møterom." }, { label: "2019", title: "Kveldskurset", text: "Et gavekort fra kona blir til en onsdag i uka ved dreieskiva." }, { label: "2023", title: "Sier opp", text: "Kjøper brukt dreieskive og ovn, og leier den gamle smia på Kaupanger." }, { label: "2024", title: "Første brenning", text: "En tredjedel sprekker. Resten selges på julemarkedet på to timer." }, { label: "2026", title: "Ventelister", text: "Leverer til tre restauranter og har tre måneders ventetid på kopper." }] }, style: { bg: "soft", pad: "l", anim: "stagger", animEase: "expo", animStep: 150 } },
        { type: "statement", props: { text: "Den dagen jeg sluttet å føre regnskap i en skoeske, fikk jeg søndagene mine tilbake.", accent: "søndagene mine tilbake", fx: "scroll", size: "l", font: "heading" }, style: { pad: "xl" } },
        { type: "imageText", props: { image: "demo:cups-shelf", alt: "Håndlagde kopper på en hylle", title: "Tallene tar han på telefonen", html: P("Arne Vik bruker Ryddig, et regnskapsprogram for små bedrifter og enkeltpersonforetak. Kvitteringer fotograferes og føres automatisk, fakturaen sendes fra telefonen, og momsmeldingen er ferdig utfylt når fristen nærmer seg.") + P("«Jeg forstår fortsatt ikke alt som står i den», sier han. «Men jeg vet at det er riktig, og at det tar ti minutter i stedet for en søndag.»"), ctaLabel: "Les mer om Ryddig", side: "right", ratio: "4:5" }, style: { anim: "fade-up", animEase: "expo", headFx: "words" } },
        { type: "gallery", props: { mode: "grid", items: [{ image: "demo:kiln-firing", alt: "Kopper som brennes i ovnen", caption: "Andre brenning, 1 240 grader." }, { image: "demo:pottery-shelves", alt: "Hyller fulle av keramikk", caption: "Tørkehyllene i smia." }, { image: "demo:cups-row", alt: "Rader med håndlagde krus", caption: "En uke med kopper, klare for glasur." }] }, style: { anim: "stagger", animEase: "expo", animStep: 120 } },
        { type: "cta", props: { variant: "band", title: "Bruker du søndagene på papirarbeid?", text: "Prøv Ryddig gratis i 30 dager. Ingen binding, og du kan ta med deg tallene dine om du slutter.", label: "Prøv Ryddig gratis", label2: "Se hvordan det virker" }, style: { bg: "dark", pad: "xl", anim: "rise" } },
      ],
    },
    {
      id: "scroll",
      name: "Scrollfortelling",
      category: "Grunnmal",
      description: "Visuell reise der bildene bærer saken: fullskjermsåpning, tekst som tennes, fast bakgrunn som skifter, parallakse, sidelengs scroll og et personlig sitat.",
      use: "Reise, mat, natur, livsstil – når du har gode bilder og helst video",
      theme: {
        colors: { primary: "#0e2a3a", accent: "#e8b04a", dark: "#08151e", soft: "#e9eef0", text: "#122028", link: "#1d5d7a", page: "#f7f9f9" },
        fonts: { heading: font("Crimson Pro", 500), body: font("Manrope", 400) },
        scale: "display",
        tracking: "normal",
        radius: 12,
        button: "pill",
      },
      extras: { progress: true, readTime: true },
      sections: [
        { type: "hero", props: { layout: "overlay", image: "demo:reine-night-reflection", imageMobile: "demo:reine-aurora", kicker: "Kystruta · Vinterreisen", title: "Lyset kommer fra havet", ingress: "Sju døgn langs kysten fra Bergen til Lofoten, midt i mørketida. Vi trodde vi skulle oppleve mørke. Vi tok feil.", titleSize: "xxl", titleFx: "words", height: "full", position: "bottom-left", overlay: 30, kenBurns: true } },
        { type: "statement", props: { text: "I desember står sola aldri opp i Lofoten. Likevel har vi aldri sett så mye lys.", accent: "så mye lys", fx: "scroll", size: "l", font: "heading" }, style: { pad: "xl", minH: "half" } },
        { type: "stickyStory", props: { image: "demo:fjord-mist-boat", layout: "overlay", transition: "fade", cardSide: "left", cardStyle: "dark", dots: true, overlay: 20, slides: [{ title: "Dag 1 · Bergen", text: "Vi legger fra kai i regn og tåke. Fjellene på hver side forsvinner opp i skyene, og skipet glir ut i et landskap i gråtoner." }, { title: "Dag 3 · Helgelandskysten", text: "Fiskebåtene ligger tett i havna når vi går i land. Det lukter salt og diesel, og noen har hengt opp julestjerner i styrhuset.", image: "demo:harbour-boats" }, { title: "Dag 5 · Lofoten", text: "Klokka er tolv midt på dagen. Sola er under horisonten, men himmelen over fjellene er rosa – det nærmeste vi kommer en soloppgang.", image: "demo:lofoten-pink-noon" }] } },
        { type: "richText", props: { lead: true, html: P("Det første som skjer når du reiser nordover om vinteren, er at du slutter å se på klokka. Dagene er korte, men de er ikke mørke. Lyset kommer i lag: blått om morgenen, rosa og gyllent midt på dagen, og så blått igjen før det blir natt.") + P("Ombord merker du det på folk. Ingen har det travelt. Kokken kommer ut på dekk for å se på et fjell. En familie fra Stavanger blir sittende ved vinduet i panoramasalongen fra frokost til lunsj. «Vi har aldri sett vinteren fra denne siden», sier moren.") + P("Kaptein Øystein Sande har seilt langs kysten i 24 år. Han sier at vinteren er den beste tiden. «Om sommeren ser du landskapet. Om vinteren ser du lyset. Det er noe helt annet.»") }, style: { anim: "fade" } },
        { type: "parallaxImage", props: { image: "demo:aurora-reflection", alt: "Nordlys som speiler seg i havet", title: "Natt fire. Himmelen åpner seg.", height: "full", speed: "medium" } },
        { type: "richText", props: { html: "<h2>Alle på dekk</h2>" + P("Det er mannskapet som varsler. En kort beskjed på høyttaleren, og så står seksti mennesker i dunjakker på dekk og ser opp. Nordlyset kommer som et grønt bånd fra nord, blir bredere, og begynner å bevege seg. Ingen sier noe.") + P("Etterpå sitter vi i salongen med varm sjokolade og bilder som ikke ligner på det vi så. Det gjør ingenting. Det er en av de tingene du må ha vært der for å forstå.") }, style: { anim: "fade", headFx: "fade-words" } },
        { type: "hScroll", props: { title: "Fire øyeblikk fra reisen", panel: "l", items: [{ image: "demo:deck-sunset", label: "Dag 2", title: "Solnedgang klokka tre", text: "Den siste sola på flere dager, sett fra akterdekket." }, { image: "demo:rib-sunset", label: "Dag 3", title: "Havørnsafari", text: "I ribbåt mellom holmene på Helgeland, i den siste sola før mørketida." }, { image: "demo:village-night", label: "Dag 5", title: "Blåtimen i fiskeværet", text: "Lysene tennes i rorbuene mens himmelen fortsatt er blå." }, { image: "demo:coast-rocks-waves", label: "Dag 6", title: "Storm ved Vestfjorden", text: "Bølger mot svabergene – og alle samlet ved vinduene." }] }, style: { bg: "dark" } },
        { type: "quote", props: { text: "Jeg gruet meg til mørket. Nå gruer jeg meg til å reise hjem igjen.", name: "Liv Haugen", role: "Reiste med Kystruta i januar", image: "demo:portrait-woman-coat", size: "large" }, style: { pad: "l", anim: "blur", animSpeed: "slow" } },
        { type: "factBox", props: { title: "Reisen i korte trekk", variant: "soft", collapsible: false, items: [{ text: "Sju døgn fra Bergen til Lofoten, med avganger fra november til februar." }, { text: "Fra 14 900 kr per person i delt lugar, inkludert alle måltider." }, { text: "Utflukter i hver havn: havørnsafari, fiskevær, nordlysjakt og vandring." }, { text: "Nordlysgaranti: Ser du det ikke, får du ny reise med 50 % rabatt." }] }, style: { anim: "fade" } },
        { type: "cta", props: { variant: "band", title: "Vinterreisene 2027 er åpne for bestilling", text: "Lugarene med vindu mot land blir fort fulle. Bestill før 1. desember og få gratis havørnsafari.", label: "Se vinterreisene", label2: "Bestill katalog" }, style: { bg: "dark", pad: "xl", anim: "rise" } },
      ],
    },
  ];
});
