/* =========================================================================
   native/templates.js — the built-in page templates.

   Starting structures for the kinds of advertorial ABC BrandStudio makes,
   from the plain workhorses (Lansering, Guide …) to the premium formats the
   big Nordic brand studios build in Vev (scroll-driven launches, Topp 5
   countdowns, "Wrapped" data stories, immersive travel pieces, explorers,
   reports).

   A template may carry:
     theme    its own look (used when the project has no brand kit)
     extras   page-level options (progress bar, chapter menu, floating button)
     sections the page, with "demo:<name>" for photos from the demo kit
              (lib/native/demo): expand() swaps them for real asset ids

   The copy is sample text for invented advertisers (Nordvei, Fjellro,
   Fjordbank …). It shows the tone and length that belong in each place, and
   it is obviously not real, so an unfinished page is never mistaken for a
   finished one.

   Shared verbatim by the browser and the server (UMD).
   ========================================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NativeTemplates = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var P = function (text) {
    return "<p>" + text + "</p>";
  };

  function font(family, weight) {
    return { family: family, source: "google", weight: weight };
  }

  var TEMPLATES = [
    // =====================================================================
    // Premium formats
    // =====================================================================
    {
      id: "bil-premium",
      name: "Bil-lansering premium",
      premium: true,
      description: "Bildet vokser ut av skjermen, ord som lyser opp, delt scrollfortelling, interiør med klikkbare punkter og sammenligningstabell.",
      use: "Bil, elbil, båt, premium teknologi",
      theme: {
        colors: { primary: "#14161b", accent: "#3d7bff", dark: "#0b0c10", soft: "#eef0f4", text: "#15171c", link: "#2a62d9", page: "#f7f7f5" },
        fonts: { heading: font("Sora", 700), body: font("Inter", 400) },
        scale: "large",
        tracking: "tight",
        radius: 14,
        button: "pill",
      },
      extras: { progress: true, chapterNav: "top", readTime: true, stickyCta: true, stickyLabel: "Book prøvekjøring", stickyAfter: 30 },
      sections: [
        { type: "hero", props: { layout: "zoom", kicker: "Nordvei Aurora", title: "Stillheten har fått 600 hestekrefter", ingress: "Vi kjørte den nye elbilen fra Oslo til Lofoten på én uke. Dette lærte vi.", image: "demo:road-mountains", titleSize: "xl", height: "full" } },
        { type: "statement", props: { text: "1 400 kilometer, fem ladestopp og ett spørsmål vi ikke klarte å slutte å stille: Hvorfor gjorde vi ikke dette før?", accent: "fem ladestopp", fx: "scroll", size: "l" }, style: { pad: "xl" } },
        { type: "chapter", props: { label: "01", title: "Veien nordover", intro: "Første etappe går over Dovre – i minus fire grader og motvind.", layout: "number" }, style: { bg: "none", pad: "l", chapter: "Veien nordover" } },
        { type: "richText", props: { lead: true, dropCap: true, html: P("Klokka er halv sju når vi ruller ut av garasjen på Majorstuen. Batteriet står på 100 prosent, kaffen er varm, og navigasjonen har allerede planlagt de fem stoppene vi trenger for å nå Lofoten.") + P("Det er nettopp denne roen som overrasker mest. Ingen motorlyd, bare dekkene mot asfalten og et lavt sus fra vinden. <mark>Etter to timer har vi glemt at vi kjører elektrisk.</mark>") + "<h2>Rekkevidde uten regnestykker</h2>" + P("Bilen beregner ladestoppene selv, ut fra temperatur, høydemeter og kjørestil. På Dombås viser den 31 prosent igjen – nøyaktig som planlagt.") } },
        { type: "image", props: { image: "demo:road-open", alt: "Åpen landevei mellom fjellsider", caption: "Over fjellet: 210 kilometer uten en eneste annen bil i synsfeltet.", credit: "Demo", size: "full", ratio: "21:9", fx: "zoom" }, style: { pad: "none" } },
        { type: "stats", props: { title: "Tallene fra turen", look: "cards", items: [{ value: "600", unit: "hk", label: "samlet effekt" }, { value: "540", unit: "km", label: "rekkevidde (WLTP)" }, { value: "18", unit: "min", label: "fra 10 til 80 prosent" }] }, style: { bg: "soft", pad: "l", anim: "stagger" } },
        { type: "stickyStory", props: { image: "demo:fjord", layout: "split-left", transition: "wipe", slides: [{ title: "Dag 2: Fjordene", text: "Morgenen i Romsdalen er så stille at vi hører fossen før vi ser den." }, { title: "Dag 3: Fjellet", text: "Over Saltfjellet faller temperaturen til minus åtte. Kupeen holder 21 grader.", image: "demo:mountain-lake" }, { title: "Dag 5: Fremme", text: "Lofoten i solnedgang. 1 400 kilometer, og bilen står med 22 prosent igjen.", image: "demo:road-sunset" }] }, style: { chapter: "Opplevelsen" } },
        { type: "chapter", props: { label: "02", title: "Innsiden", intro: "Materialer, skjermer og detaljene du ikke legger merke til før du trenger dem.", layout: "number" }, style: { bg: "none", pad: "l", chapter: "Innsiden" } },
        { type: "hotspots", props: { image: "demo:car-interior", alt: "Førerplassen", size: "wide", items: [{ x: 32, y: 44, title: "Rattet", text: "Oppvarmet, med fysiske knapper for det du bruker mest." }, { x: 55, y: 30, title: "Instrumentpanelet", text: "Viser rekkevidde, ladestopp og fart – ikke mer." }, { x: 72, y: 62, title: "Midtkonsollen", text: "Trådløs lading for to telefoner og plass til en stor flaske." }, { x: 18, y: 70, title: "Dørpanelet", text: "Resirkulert ull og aluminium." }] } },
        { type: "quote", props: { text: "Jeg trodde jeg kom til å savne motorlyden. Det eneste jeg savner nå, er stillheten når jeg kjører en annen bil.", name: "Kari Nordmann", role: "Testsjåfør på turen" }, style: { bg: "dark", pad: "xl", anim: "blur" } },
        { type: "specTable", props: { title: "Velg din Aurora", head1: "Range", head2: "Performance", head3: "Signature", highlight: "2", rows: [{ label: "Pris fra", v1: "549 900 kr", v2: "629 900 kr", v3: "719 900 kr" }, { label: "Rekkevidde", v1: "540 km", v2: "510 km", v3: "490 km" }, { label: "Effekt", v1: "408 hk", v2: "600 hk", v3: "600 hk" }, { label: "0–100 km/t", v1: "5,4 s", v2: "3,6 s", v3: "3,6 s" }, { label: "Firehjulstrekk", v1: "–", v2: "✓", v3: "✓" }], note: "Eksempeltall i malen. Bytt ut med annonsørens dokumenterte data." }, style: { chapter: "Modellene" } },
        { type: "testimonials", props: { title: "De har kjørt den", items: [{ image: "demo:portrait-woman", quote: "Familiebilen vi ikke visste at vi trengte.", name: "Ingrid H.", role: "Bergen" }, { image: "demo:portrait-man", quote: "Ladingen tok kortere tid enn lunsjen.", name: "Jonas B.", role: "Trondheim" }, { image: "demo:portrait-hiker", quote: "Stille, rask og overraskende praktisk.", name: "Sara L.", role: "Tromsø" }] }, style: { anim: "stagger" } },
        { type: "cta", props: { variant: "card", image: "demo:road-sunset", title: "Kjør den selv", text: "Book en prøvekjøring hos nærmeste forhandler – helt uforpliktende.", label: "Book prøvekjøring", label2: "Se alle modeller" } },
      ],
    },

    {
      id: "topp5",
      name: "Topp 5 – nedtelling",
      premium: true,
      description: "Mørk og filmatisk: gigantiske tall i scener som står fast, lysbildeserie, nedtelling til premieren, snu-kort og avstemning.",
      use: "Film, konsert, reise, «5 grunner til …»",
      theme: {
        colors: { primary: "#ff2e4d", accent: "#ff2e4d", dark: "#08080c", soft: "#16161f", text: "#14141c", link: "#ff5a72", page: "#0c0c12" },
        fonts: { heading: font("Anton", 400), body: font("Inter", 400) },
        scale: "display",
        tracking: "normal",
        headingCase: "upper",
        buttonCase: "upper",
        radius: 4,
        button: "solid",
      },
      extras: { progress: true, stickyCta: true, stickyLabel: "Kjøp billetter", stickyAfter: 20, feedback: true },
      sections: [
        { type: "hero", props: { layout: "overlay", image: "demo:concert", kicker: "Kino Nord presenterer", title: "Fem øyeblikk du aldri glemmer", ingress: "Før premieren 24. desember: scenene som gjorde serien til en klassiker.", titleSize: "xl", titleFx: "words", height: "full", position: "bottom-left", overlay: 55, kenBurns: true } },
        { type: "marquee", props: { text: "Premiere 24. desember", sep: "star", size: "l", outline: true, speed: "normal" }, style: { bg: "brand", pad: "s" } },
        { type: "richText", props: { lead: true, html: P("Noen scener setter seg fast. Vi har gått gjennom tjue år med filmhistorie og plukket ut de fem øyeblikkene publikum fortsatt snakker om.") + P("Rangeringen er vår egen. Er du enig? Stem nederst i saken.") } },
        { type: "rankList", props: { order: "down", layout: "scenes", items: [{ title: "Hoppet fra taket", text: "Fire kameraer, én tagning og et publikum som holdt pusten.", image: "demo:light-trails", specs: "Hvor: Oslo sentrum\nÅr: 2006\nTagninger: 1", fact: "Scenen ble filmet klokka fire om natta for å unngå trafikk." }, { title: "Brannen", text: "Den eneste scenen i serien der stuntkoordinatoren nektet å se på.", image: "demo:fire-ring", specs: "Hvor: Studio Fornebu\nÅr: 2011", fact: "Flammene var ekte – brannvesenet sto klare." }, { title: "Nordlysscenen", text: "Ventetiden på riktig himmel var tre uker.", image: "demo:aurora", specs: "Hvor: Senja\nÅr: 2015" }, { title: "Jakten i natt", text: "Byen som kulisse, og lyset som hovedperson.", image: "demo:night-bokeh", specs: "Hvor: Bergen\nÅr: 2019" }, { title: "Finalen", text: "Ti minutter uten dialog. Fortsatt den mest omtalte slutten i serien.", image: "demo:star-trails", specs: "Hvor: Hardangervidda\nÅr: 2022", fact: "Musikken ble spilt inn med 60 musikere på én dag." }] }, style: { pad: "none", anim: "none" } },
        { type: "gallery", props: { mode: "slideshow", items: [{ image: "demo:concert", alt: "Konsert med lysshow", caption: "Premierefesten i 2022." }, { image: "demo:city-night", alt: "By om kvelden", caption: "Bergen, opptak av jakten." }, { image: "demo:sparkler", alt: "Stjerneskudd", caption: "Fra innspillingen av finalen." }] } },
        { type: "quote", props: { text: "Vi visste at publikum ville huske finalen. Vi visste ikke at de skulle huske den i femten år.", name: "Regissøren", role: "I et intervju fra 2022" }, style: { pad: "xl", anim: "reveal" } },
        { type: "countdown", props: { title: "Premiere om", date: "2026-12-24 18:00", done: "Nå på kino!", ctaLabel: "Kjøp billetter" }, style: { bg: "gradient", bgGradient: "radial", pad: "xl", grain: true } },
        { type: "flipCards", props: { title: "Myte eller fakta?", hint: "Trykk på kortene for å se svaret", items: [{ front: "Hovedrolleinnehaveren gjorde alle stuntene selv", backTitle: "Myte", back: "Tre av fem stunt ble gjort av en dobbel." }, { front: "Nordlyset i scene tre er ekte", backTitle: "Fakta", back: "Det tok tre uker å fange det." }, { front: "Finalen ble filmet på én dag", backTitle: "Myte", back: "Den tok elleve dager å filme." }] }, style: { anim: "stagger" } },
        { type: "poll", props: { question: "Hvilket øyeblikk er best?", options: [{ label: "Hoppet fra taket" }, { label: "Brannen" }, { label: "Nordlysscenen" }, { label: "Finalen" }], thanks: "Takk! Slik har leserne stemt:" } },
        { type: "cta", props: { variant: "band", title: "Se den på kino først", text: "Billettene til premieren selges nå.", label: "Kjøp billetter" }, style: { bg: "gradient", bgGradient: "linear", bgAngle: 120, pad: "l", shapeTop: "slant" } },
      ],
    },

    {
      id: "wrapped",
      name: "Året i tall («Wrapped»)",
      premium: true,
      description: "Spotify Wrapped-stil: store tall, skrivemaskin, topplister, snu-kort, diagrammer og løpende tekst i en sterk fargepalett.",
      use: "Årsoppsummering, bank, forsikring, handel, tjenester med data",
      theme: {
        colors: { primary: "#024950", accent: "#ff7b22", dark: "#012e33", soft: "#e9f5ef", text: "#10282b", link: "#0b6f78", page: "#fcf8ea" },
        fonts: { heading: font("Unbounded", 800), body: font("DM Sans", 400) },
        scale: "large",
        tracking: "tight",
        radius: 22,
        button: "pill",
      },
      extras: { progress: true, feedback: true, feedbackQ: "Var dette nyttig?" },
      sections: [
        { type: "hero", props: { layout: "type", kicker: "Fjordbank oppsummerer", title: "2026 Wrapped", ingress: "Hva sparte nordmenn til, hva kjøpte de, og hvem overrasket mest? Her er året i tall.", titleSize: "xxl", titleFx: "letters", height: "full", position: "center" }, style: { bg: "brand", grain: true, shapeBottom: "wave" } },
        { type: "statement", props: { kicker: "Først det viktigste", text: "Året du sparte mer enn du trodde.", fx: "typewriter", size: "xl", font: "heading" }, style: { pad: "xl", align: "center" } },
        { type: "stats", props: { look: "huge", items: [{ value: "26", unit: "timer", label: "Så lenge brukte snittkunden på å nå sparemålet for ferien." }] }, style: { bg: "custom", bgColor: "#ff7b22", pad: "xl", shapeTop: "curve" } },
        { type: "rankList", props: { title: "Topp 5 sparemål", layout: "cards", items: [{ title: "Ferie", text: "41 prosent av alle sparemål." }, { title: "Bolig", text: "Egenkapital, oppussing og flytting." }, { title: "Buffer", text: "Uforutsette utgifter." }, { title: "Bil", text: "De fleste sparer til elbil." }, { title: "Barna", text: "Fondssparing i barnas navn." }] }, style: { anim: "stagger", pad: "l" } },
        { type: "marquee", props: { text: "Spar smart", sep: "dot", size: "xl", outline: true, scrollLinked: true }, style: { bg: "dark", pad: "s" } },
        { type: "chart", props: { title: "Hva sparte vi mest til?", kind: "donut", unit: "%", source: "Eksempeltall i malen", items: [{ label: "Ferie", value: 41 }, { label: "Bolig", value: 24 }, { label: "Buffer", value: 18 }, { label: "Bil", value: 11 }, { label: "Annet", value: 6 }] }, style: { pad: "l" } },
        { type: "flipCards", props: { title: "Tror du dette stemmer?", hint: "Trykk for å se fasiten", columns: "3", items: [{ front: "Flere spart i desember enn i januar", backTitle: "Feil", back: "Januar er fortsatt årets store sparemåned." }, { front: "Unge under 30 sparer mest i fond", backTitle: "Riktig", back: "Seks av ti har en fondsavtale." }, { front: "Nordmenn bruker mest penger på fredager", backTitle: "Riktig", back: "Fredag slår lørdag med god margin." }] }, style: { bg: "soft", anim: "stagger" } },
        { type: "chart", props: { title: "Sparingen måned for måned", kind: "column", unit: "%", highlight: 1, items: [{ label: "Jan", value: 14 }, { label: "Mar", value: 9 }, { label: "Mai", value: 7 }, { label: "Jul", value: 4 }, { label: "Sep", value: 8 }, { label: "Nov", value: 11 }] } },
        { type: "testimonials", props: { title: "Slik sparte de", layout: "carousel", items: [{ image: "demo:portrait-sun", quote: "Jeg rundet opp hvert kjøp. Det ble en hel ferie.", name: "Maja, 27", role: "Oslo" }, { image: "demo:portrait-field", quote: "Bufferen reddet oss da vaskemaskinen tok kvelden.", name: "Lene, 41", role: "Stavanger" }, { image: "demo:portrait-man", quote: "Endelig egenkapital.", name: "Ahmed, 33", role: "Drammen" }] } },
        { type: "poll", props: { question: "Hva sparer du til i 2027?", options: [{ label: "Ferie" }, { label: "Bolig" }, { label: "Buffer" }, { label: "Noe annet" }] }, style: { pad: "l" } },
        { type: "cta", props: { variant: "band", title: "Sett ditt eget sparemål", text: "Det tar to minutter i appen.", label: "Kom i gang" }, style: { bg: "brand", pad: "xl", shapeTop: "zigzag" } },
      ],
    },

    {
      id: "reise",
      name: "Reise – immersiv",
      premium: true,
      description: "Stemningsfull og bildetung: tittel ord for ord, sidelengs scroll, parallakse, tidslinje, mosaikk og scrollfortelling med sirkel-overgang.",
      use: "Reiseliv, hotell, opplevelser, mat og drikke",
      theme: {
        colors: { primary: "#2f5d4e", accent: "#d9a441", dark: "#11201b", soft: "#eef2ec", text: "#1d2a24", link: "#2f6d57", page: "#fbfaf6" },
        fonts: { heading: font("Instrument Serif", 400), body: font("Manrope", 400) },
        scale: "display",
        tracking: "tight",
        radius: 6,
        button: "pill",
      },
      extras: { progress: true, chapterNav: "side", readTime: true },
      sections: [
        { type: "hero", props: { layout: "overlay", image: "demo:fjord", kicker: "Fjellro Hotell", title: "Der tiden går saktere", ingress: "Tre dager mellom fjord og fjell – med telefonen i lomma.", titleSize: "xxl", titleFx: "words", height: "full", position: "bottom-left", overlay: 40, kenBurns: true } },
        { type: "statement", props: { text: "Det finnes steder der det eneste som haster, er solnedgangen.", accent: "solnedgangen", fx: "scroll", size: "xl" }, style: { pad: "xl" } },
        { type: "chapter", props: { label: "Dag 1", title: "Fjorden", intro: "Vi ankommer med båt. Telefonen mister dekning et sted ute på fjorden – og det er helt greit.", layout: "left" }, style: { bg: "image", bgImage: "demo:mountain-lake", overlay: 45, bgFx: "fixed", minH: "screen", valign: "bottom", pad: "xl", chapter: "Dag 1: Fjorden" } },
        { type: "richText", props: { lead: true, dropCap: true, html: P("Hotellet ligger der veien slutter. Tjue rom, en badstue på brygga og en kokk som henter fisken selv hver morgen.") + P("«Vi vil at folk skal glemme klokka», sier vertinnen mens hun skjenker kaffe fra et bål. Det tar oss omtrent en time.") } },
        { type: "hScroll", props: { title: "Det du ikke må gå glipp av", panel: "l", items: [{ image: "demo:waterfall", label: "Tur", title: "Fossen bak hotellet", text: "45 minutter å gå, og du kan stå bak vannet." }, { image: "demo:canoe", label: "Padling", title: "Kano ved soloppgang", text: "Kanoene står klare på brygga – gratis for gjester." }, { image: "demo:mist-peak", label: "Topptur", title: "Over skyene", text: "Med guide fra hotellet, tre timer opp." }, { image: "demo:forest-mist", label: "Ro", title: "Skogsbadet", text: "En time i skogen, uten et ord." }] }, style: { bg: "dark" } },
        { type: "parallaxImage", props: { image: "demo:aurora", alt: "Nordlys", title: "Når mørket kommer, begynner showet", height: "full", speed: "medium" } },
        { type: "chapter", props: { label: "Dag 2", title: "Fjellet", intro: "En dag uten plan er også en plan.", layout: "center" }, style: { bg: "none", pad: "xl", chapter: "Dag 2: Fjellet" } },
        { type: "timeline", props: { title: "En dag på Fjellro", items: [{ label: "07:00", title: "Kaffe på brygga", text: "Bålkaffe og utsikt før de andre våkner." }, { label: "10:00", title: "Tur til fossen", text: "Med matpakke fra kjøkkenet." }, { label: "15:00", title: "Badstue og fjordbad", text: "Seks grader i vannet. Du klarer det." }, { label: "19:00", title: "Middag", text: "Sju retter fra fjorden og fjellet." }] } },
        { type: "gallery", props: { mode: "masonry", items: [{ image: "demo:canoe", alt: "Kano" }, { image: "demo:forest-mist", alt: "Skog i tåke" }, { image: "demo:waterfall", alt: "Foss" }, { image: "demo:mist-peak", alt: "Fjelltopp" }, { image: "demo:mountain-lake", alt: "Fjellsjø" }, { image: "demo:stars", alt: "Stjernehimmel" }] } },
        { type: "stickyStory", props: { image: "demo:stars", layout: "overlay", cardStyle: "plain", transition: "mask", cardSide: "center", slides: [{ title: "Dag 3", text: "Den siste kvelden ligger vi på brygga og teller stjerneskudd." }, { title: "Elleve", text: "Vi slutter å telle etter elleve.", image: "demo:aurora" }] }, style: { chapter: "Dag 3: Himmelen" } },
        { type: "factBox", props: { title: "Praktisk info", collapsible: false, variant: "soft", items: [{ text: "Tre netter fra 8 900 kr per person (eksempelpris i malen)" }, { text: "Båt fra Bergen to ganger daglig" }, { text: "Alle måltider inkludert" }, { text: "Åpent mai–oktober" }] } },
        { type: "cta", props: { variant: "card", image: "demo:canoe", title: "Bli med til fjorden", text: "Se ledige datoer for neste sesong.", label: "Se ledige datoer" } },
      ],
    },

    {
      id: "utforsker",
      name: "Interaktiv guide («utforsker»)",
      premium: true,
      description: "Leseren velger selv: faner per rom eller målgruppe, produktkarusell, steg for steg, lenkefliser og spørsmål og svar.",
      use: "Interiør, dagligvare, bank-råd, forsikring, retail",
      theme: {
        colors: { primary: "#1f3a5f", accent: "#e4572e", dark: "#0f1c2e", soft: "#f3efe7", text: "#1c2430", link: "#1f5fa8", page: "#fbf9f5" },
        fonts: { heading: font("Fraunces", 600), body: font("Inter", 400) },
        scale: "large",
        tracking: "tight",
        radius: 16,
        button: "pill",
      },
      extras: { progress: true, chapterNav: "top" },
      sections: [
        { type: "hero", props: { layout: "framed", image: "demo:sofa", kicker: "Hjemme-guiden", title: "Slik får du mer plass hjemme – rom for rom", ingress: "Enkle grep som gjør hverdagen lettere, valgt ut av interiørarkitekt Line Berg.", titleSize: "xl", titleFx: "words", height: "auto" } },
        { type: "richText", props: { lead: true, html: P("Rot handler sjelden om for mange ting. Det handler om at tingene ikke har en fast plass. Velg rommet du vil starte med.") } },
        { type: "tabs", props: { title: "Velg rom", look: "big", items: [{ label: "Stue", title: "Stua: skjul det du ikke bruker hver dag", html: P("Lukkede skap nederst, åpne hyller øverst. Da ser rommet ryddig ut selv når det ikke er det.") + "<ul><li>Én kurv per familiemedlem</li><li>Bokhylle som romdeler</li></ul>", image: "demo:sofa", ctaLabel: "Se stueløsninger" }, { label: "Kjøkken", title: "Kjøkkenet: frigjør benken", html: P("Alt du bruker mindre enn én gang i uka, flyttes inn i skapene.") + "<ul><li>Skinne med kroker på veggen</li><li>Uttrekk i hjørneskapet</li></ul>", image: "demo:dining", ctaLabel: "Se kjøkkenløsninger" }, { label: "Kontor", title: "Hjemmekontoret: ett bord, to funksjoner", html: P("Et bord som er kontor på dagtid og spisebord om kvelden trenger en fast plass til laptopen.") + "<ul><li>Skuff under bordplata</li><li>Ladestasjon i skapet</li></ul>", image: "demo:desk", ctaLabel: "Se kontorløsninger" }] }, style: { chapter: "Rom for rom" } },
        { type: "productCards", props: { title: "Linas favoritter", layout: "carousel", buttonLabel: "Se produktet", items: [{ image: "demo:dining", name: "Spisebord Fjære", text: "Heltre eik, plass til seks.", price: "6 990,-", badge: "Nyhet" }, { image: "demo:desk", name: "Skrivebord Lun", text: "Med skjult kabelkanal.", price: "2 490,-", oldPrice: "2 990,-" }, { image: "demo:sofa", name: "Sofa Bølge", text: "Avtakbart trekk.", price: "12 990,-" }, { image: "demo:laptop", name: "Skuffeseksjon Rad", text: "Passer under de fleste bord.", price: "890,-" }] }, style: { bg: "soft", chapter: "Favoritter" } },
        { type: "steps", props: { title: "Slik rydder du på en helg", layout: "row", items: [{ title: "Tøm ett rom", text: "Alt ut på gulvet. Ja, alt." }, { title: "Sorter i tre", text: "Behold, gi bort, kast." }, { title: "Gi alt en plass", text: "Det som ikke får plass, får dra." }] }, style: { anim: "stagger", pad: "l", chapter: "Steg for steg" } },
        { type: "cards", props: { title: "Utforsk flere guider", look: "tile", columns: "4", items: [{ image: "demo:dining", title: "Kjøkken" }, { image: "demo:sofa", title: "Stue" }, { image: "demo:desk", title: "Kontor" }, { image: "demo:laptop", title: "Bod" }] }, style: { anim: "stagger" } },
        { type: "accordion", props: { title: "Spørsmål og svar", items: [{ q: "Hvor lang tid tar levering?", a: "Vanligvis 3–5 virkedager (eksempeltekst i malen)." }, { q: "Kan jeg få hjelp til montering?", a: "Ja, montering kan bestilles sammen med varene." }, { q: "Hvor lenge har jeg åpent kjøp?", a: "365 dager på de fleste produkter." }] }, style: { chapter: "Spørsmål" } },
        { type: "cta", props: { variant: "band", title: "Klar for å komme i gang?", text: "Se alle løsningene i nettbutikken.", label: "Til nettbutikken" }, style: { bg: "brand", pad: "l", shapeTop: "curve" } },
      ],
    },

    {
      id: "rapport",
      name: "Rapport og innsikt",
      premium: true,
      description: "Erstatter PDF-en: kapittelmeny, nøkkeltall, diagrammer, ekspertsitater, tre søyler, steg, spørsmål og kilder.",
      use: "Bank, finans, energi, helse, offentlig sektor",
      theme: {
        colors: { primary: "#0b3c5d", accent: "#1fa37a", dark: "#082436", soft: "#edf3f7", text: "#14222e", link: "#0b5f99", page: "#ffffff" },
        fonts: { heading: font("Source Serif 4", 700), body: font("Source Sans 3", 400) },
        scale: "normal",
        tracking: "normal",
        radius: 8,
        button: "solid",
      },
      extras: { progress: true, chapterNav: "top", readTime: true },
      sections: [
        { type: "hero", props: { layout: "split", image: "demo:city-park", kicker: "Rapport 2026", title: "Slik bor vi om ti år", ingress: "Fjordbank har spurt 4 000 nordmenn om bolig, økonomi og drømmer. Her er funnene.", titleSize: "l", height: "tall" } },
        { type: "stats", props: { look: "lines", items: [{ value: "4 000", unit: "", label: "svar" }, { value: "62", unit: "%", label: "vil eie bolig" }, { value: "1 av 3", unit: "", label: "vurderer å flytte" }] }, style: { pad: "l", anim: "stagger" } },
        { type: "chapter", props: { label: "01", title: "Situasjonen", intro: "Hvor står vi i dag?", layout: "number" }, style: { bg: "none", pad: "l", chapter: "Situasjonen" } },
        { type: "richText", props: { lead: true, html: P("Boligprisene har steget raskere enn lønningene i ti år. Likevel sier seks av ti at de vil eie, ikke leie.") + P("Det er særlig unge voksne som merker presset: <mark>Bare 28 prosent under 30 år tror de får råd til bolig alene.</mark>") } },
        { type: "chart", props: { title: "Andel som eier bolig, etter alder", kind: "column", unit: "%", highlight: 1, source: "Eksempeltall i malen", items: [{ label: "Under 30", value: 28 }, { label: "30–39", value: 61 }, { label: "40–49", value: 74 }, { label: "50–59", value: 82 }, { label: "60+", value: 88 }] }, style: { bg: "soft" } },
        { type: "statement", props: { text: "Drømmen om egen bolig lever – men den har flyttet ut av byen.", accent: "flyttet ut", fx: "scroll", size: "l" }, style: { pad: "xl" } },
        { type: "chapter", props: { label: "02", title: "Hva ekspertene sier", layout: "number" }, style: { bg: "none", pad: "l", chapter: "Ekspertene" } },
        { type: "testimonials", props: { items: [{ image: "demo:portrait-woman", quote: "Vi ser en tydelig flytting mot mellomstore byer.", name: "Dr. Hanne Lie", role: "Boligøkonom" }, { image: "demo:portrait-man", quote: "Fleksibelt arbeid har endret regnestykket for mange.", name: "Erik Moe", role: "Analytiker, Fjordbank" }, { image: "demo:portrait-hiker", quote: "Felles eie kan bli det nye normale.", name: "Siri Dahl", role: "Forsker" }] }, style: { anim: "stagger" } },
        { type: "cards", props: { title: "Tre trender som former fremtiden", look: "plain", columns: "3", items: [{ symbol: "01", title: "Mindre og smartere", text: "Færre kvadratmeter, mer fleksible løsninger." }, { symbol: "02", title: "Felles eie", text: "Flere kjøper sammen med venner eller familie." }, { symbol: "03", title: "Grønn bolig", text: "Energiklasse betyr mer for prisen enn før." }] }, style: { bg: "soft", pad: "l", anim: "stagger" } },
        { type: "chart", props: { title: "Hvor vil du bo om ti år?", kind: "donut", unit: "%", items: [{ label: "Storby", value: 31 }, { label: "Mellomstor by", value: 38 }, { label: "Bygd", value: 22 }, { label: "Vet ikke", value: 9 }] } },
        { type: "chapter", props: { label: "03", title: "Veien videre", layout: "number" }, style: { bg: "none", pad: "l", chapter: "Veien videre" } },
        { type: "steps", props: { title: "Slik kan du forberede deg", layout: "column", items: [{ title: "Kartlegg økonomien", text: "Vit hva du har, og hva du trenger." }, { title: "Start sparingen tidlig", text: "Selv små beløp vokser over tid." }, { title: "Snakk med en rådgiver", text: "Få en plan som passer deg." }] } },
        { type: "accordion", props: { title: "Om undersøkelsen", items: [{ q: "Hvem er spurt?", a: "4 000 personer over 18 år, representativt utvalg (eksempeltekst)." }, { q: "Når ble den gjennomført?", a: "August 2026." }] } },
        { type: "sources", props: { title: "Kilder", items: [{ text: "Fjordbank boligundersøkelse 2026 (eksempel)" }, { text: "Statistisk sentralbyrå, boligstatistikk" }] } },
        { type: "cta", props: { variant: "band", title: "Last ned hele rapporten", text: "28 sider med tall, grafer og råd.", label: "Last ned rapporten" }, style: { bg: "dark", pad: "l" } },
      ],
    },

    {
      id: "smak",
      name: "Mat og smak",
      premium: true,
      description: "Varm og appetittvekkende: delt åpning, løpende tekst, oppskrift i steg med bilder, kort over bilder, quiz og produkter.",
      use: "Dagligvare, restaurant, drikke, sesongkampanjer",
      theme: {
        colors: { primary: "#7a2e1f", accent: "#e8a33d", dark: "#2a1410", soft: "#f7efe4", text: "#2a1d18", link: "#9a3b26", page: "#fffaf3" },
        fonts: { heading: font("DM Serif Display", 400), body: font("DM Sans", 400) },
        scale: "large",
        tracking: "normal",
        radius: 18,
        button: "pill",
      },
      extras: { progress: true, feedback: true },
      sections: [
        { type: "hero", props: { layout: "split", image: "demo:strawberries", kicker: "Sesongens smak", title: "Sommeren smaker best når den er norsk", ingress: "Tre oppskrifter fra kokk Ida Haugen – med bær som er plukket i går.", titleSize: "xl", height: "tall" } },
        { type: "marquee", props: { text: "Norske bær", sep: "dot", size: "l", outline: false, speed: "slow" }, style: { bg: "brand", pad: "s" } },
        { type: "richText", props: { lead: true, dropCap: true, html: P("Norske jordbær modner sakte i lyse netter. Det gir mer sukker og mer smak – og en sesong som er altfor kort.") + P("Vi ba Ida Haugen om tre oppskrifter som lar bærene være hovedpersonen.") } },
        { type: "steps", props: { title: "Jordbær med honning og myntesukker", layout: "row", items: [{ image: "demo:strawberries", title: "Skyll og del", text: "500 g jordbær i båter." }, { image: "demo:honey", title: "Ringle honning", text: "To spiseskjeer, gjerne lokal." }, { image: "demo:vegetables", title: "Topp med mynte", text: "Knus mynte og sukker i en morter." }] }, style: { anim: "stagger", pad: "l" } },
        { type: "imageText", props: { image: "demo:coffee-brew", alt: "Barista heller kaffe", title: "Til kaffen: bærkake på 20 minutter", html: P("En luftig kake med bær bakt rett inn. Server lun, med en kopp nytraktet kaffe."), ctaLabel: "Se oppskriften", side: "right", ratio: "4:5" } },
        { type: "cards", props: { title: "Flere sommerfavoritter", look: "overlay", columns: "3", items: [{ image: "demo:tea", title: "Iste med bær", text: "Kald, frisk og lite søt." }, { image: "demo:cafe", title: "Brunsj i hagen", text: "Fem retter du lager kvelden før." }, { image: "demo:honey", title: "Honning-glasur", text: "Til grillet frukt." }] }, style: { anim: "stagger" } },
        { type: "quote", props: { text: "Et godt bær trenger nesten ingenting. Litt syre, litt sødme – og tid.", name: "Ida Haugen", role: "Kokk" }, style: { bg: "soft", pad: "xl" } },
        { type: "quiz", props: { title: "Hvor godt kjenner du bærene?", questions: [{ q: "Når er norsk jordbærsesong på sitt beste?", options: "Mai\nJuli\nSeptember", correct: 2, explain: "Juli gir flest bær med mest sukker." }, { q: "Hva gir norske bær ekstra sødme?", options: "Lyse netter\nMye regn\nSandjord", correct: 1, explain: "Lange lyse netter gir sakte modning." }], results: [{ min: 0, title: "Bærnybegynner", text: "Les saken en gang til – og smak deg frem." }, { min: 2, title: "Bærekspert!", text: "Du kan dette. Nå gjenstår bare å plukke." }] }, style: { bg: "soft" } },
        { type: "productCards", props: { title: "Handle ingrediensene", columns: "3", buttonLabel: "Legg i handlekurven", items: [{ image: "demo:strawberries", name: "Norske jordbær", text: "400 g", price: "39,90" }, { image: "demo:honey", name: "Lynghonning", text: "350 g", price: "89,90" }, { image: "demo:tea", name: "Sommerte", text: "20 poser", price: "34,90" }] } },
        { type: "cta", props: { variant: "card", image: "demo:cafe", title: "Alle oppskriftene samlet", text: "Lagre dem i appen og få handlelisten automatisk.", label: "Se alle oppskrifter" } },
      ],
    },

    // =====================================================================
    // Workhorses
    // =====================================================================
    {
      id: "lansering",
      name: "Lansering",
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

  function find(id) {
    for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i];
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

  /** Names of the demo photos a template uses. */
  function demoNames(tpl) {
    var seen = {};
    walk(tpl.sections, function (v) {
      var m = typeof v === "string" && DEMO_RE.exec(v);
      if (m) seen[m[1]] = true;
      return v;
    });
    return Object.keys(seen);
  }

  /** The template with "demo:<name>" replaced by ids[name] (or removed). */
  function expand(tpl, ids) {
    var map = ids || {};
    return Object.assign({}, tpl, {
      sections: walk(tpl.sections, function (v) {
        var m = typeof v === "string" && DEMO_RE.exec(v);
        return m ? map[m[1]] || "" : v;
      }),
    });
  }

  /** The template's look as a full theme object (normalised later). */
  function themeOf(tpl) {
    var t = tpl.theme || {};
    return {
      colors: Object.assign({}, t.colors || {}),
      fonts: { heading: (t.fonts && t.fonts.heading) || {}, body: (t.fonts && t.fonts.body) || {} },
      headingCase: t.headingCase,
      scale: t.scale,
      tracking: t.tracking,
      radius: t.radius,
      button: t.button,
      buttonCase: t.buttonCase,
    };
  }

  return { TEMPLATES: TEMPLATES, find: find, demoNames: demoNames, expand: expand, themeOf: themeOf };
});
