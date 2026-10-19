# ABC design

[🇬🇧 English](README.md) · 🇳🇴 Norsk

ABC Nyheters interne designverktøy, i to områder (bytt øverst til venstre):

- **Annonser** — gjør **ett bilde + noen tekstfelt om til et helt sett
  annonse­bannere på én gang**, og laster dem ned som en ZIP — enten som bilder
  eller som opplastingsklare **HTML5-pakker til Campaign Manager 360**. Det
  erstatter den manuelle Canva-flyten. Her ligger Norsk Tipping, ReadPeak,
  Houseads, Bulk og Wallpaper.
- **Native Premium** — lager lange annonsørinnholdssider slik ABC BrandStudio
  tidligere laget i Vev: scrollfortelling, video, faktabokser, produktkort,
  gjennomgangslenker til annonsøren, ZIP-eksport — og en **AI-modus** som leser
  Google Docs-briefen og Drive-mappen, stiller de få spørsmålene som betyr noe og
  skriver et første utkast. Se [Native Premium](#native-premium).

Tre produkter, valgt med fanene øverst. Hvert produkt har sine egne formater,
sine egne felt og sitt eget faste innhold på banneret. På alle tre **får
overskriften en understrek når musa er over banneret** — samme signal som en
artikkeltittel på abcnyheter.no — i forhåndsvisningen og i HTML5-kreativen (også
ved tastaturfokus); bildeeksporten viser den aldri.

### Norsk Tipping

De regulerte plasseringene: 18+/Hjelpelinjen-merket og vinnersjanse-stripen.

| Format         | Størrelse  | Bruk                |
| -------------- | ---------- | ------------------- |
| **ReadPeak**   | 308 × 380  | ReadPeak-widget     |
| **Desktop**    | 580 × 500  | Desktop-annonse     |
| **Mobil**      | 320 × 400  | Mobil-annonse       |
| **Nyhetsgrid** | 190 × 190  | Nyhetsgrid på forsiden |

### NT Live (dynamisk HTML5 for Norsk Tipping)

De samme fire Norsk Tipping-størrelsene, men annonsen bestemmer innholdet selv når
den vises. Du holder et Google-regneark med kamper (dato, avspark, hjemmelag,
bortelag og valgfritt turnering, lenke, bilde, video, animasjon, knappetekst,
odds); annonsen viser kampene som går **i dag (norsk tid)**, én etter én: bilde,
video eller animasjon øverst, så lagene, avsparket («I dag kl. 21:00», nedtelling
eller «Pågår nå») og en knapp. Uten kamper i dag vises neste dag med kamper
(«I morgen kl. 21:00») eller en reserveplakat.

- Lim inn Sheets-lenken (delt som «Alle med lenken») eller cellene, se kampene og
  advarslene, juster tekster, tempo og utseende mens de fire formatene kjører på
  høyre side, og eksporter én opplastingsklar ZIP per format pluss reservebilder.
  Eksempelark: `/api/live/template.csv`.
- **Live-oppdatering:** pakken har med radene den ble laget av, og kan i tillegg
  lese arket på nytt hver gang annonsen vises, så nye kamper kommer med uten ny
  opplasting. Feiler hentingen, brukes de innpakkede radene.
- **Klikk:** enten går alt til `clickTag` (spores av CM360), eller kampens egen
  lenke fra arket vinner når den finnes – det går utenom CM360-sporingen hvis
  arket ikke har sporingslenker, og verktøyet sier fra.
- **Bilder** for de neste N dagene pakkes inn (`media/`); resten, og all video,
  hentes fra https-lenken når annonsen vises.

### ReadPeak

De samme to ReadPeak-plasseringene solgt til hvilken som helst annonsør — altså
**uten** 18+/Hjelpelinjen-merket og **uten** vinnersannsynlighet. Den grønne
etiketten er annonsørens eget navn, og «Les mer» kan endres («Les mer her»,
«Sjekk utvalget her», …).

| Format         | Størrelse  | Bruk                |
| -------------- | ---------- | ------------------- |
| **ReadPeak**   | 308 × 380  | ReadPeak-widget     |
| **Nyhetsgrid** | 190 × 190  | Nyhetsgrid på forsiden |

### Houseads

abc shoppings egne formater: ANNONSE oppe til venstre, abc shopping-logoen oppe
til høyre, hvit bakgrunn og overskrift i Noto Serif. Bildeområder og
skriftstørrelser er hentet fra de godkjente Canva-malene.

| Format          | Størrelse  | Overskrift                  |
| --------------- | ---------- | --------------------------- |
| **Mobil**       | 320 × 400  | Noto Serif 22 — 3 linjer    |
| **Toppbanner**  | 980 × 300  | Noto Serif 31 — 3 linjer, ved siden av bildet |
| **Billboard**   | 980 × 500  | Noto Serif 36 — 4 linjer, ved siden av bildet |
| **Desktop**     | 580 × 500  | Noto Serif 26,5 — 2 linjer  |
| **Skyskraper**  | 300 × 600  | Noto Serif 25,7 — 4 linjer  |
| **Rektangel**   | 300 × 250  | Noto Serif 20 — 3 linjer    |

300×250 kom til senere og har ingen Canva-original, så proporsjonene er avledet
fra de fire andre i stedet — samme bredde og topptekst som skyskraperen, og den
største overskriften som fortsatt gir plass til tre linjer innenfor 250px.
Dukker det opp en Canva-versjon, ligger tallene i `public/assets/formats.js` og
i `.bn--house-rectangle`-blokken i `public/assets/banner.css`. Det samme
gjelder 980×500: toppbannerets oppsett med et 520×420-bilde, så overskriften får
en kolonne som er bred nok til lange norske sammensatte ord.

### Bulk (mange bannere fra regneark)

**Bulk**-fanen lager mange bannere på én gang — **Houseads, ReadPeak eller
Norsk Tipping** (velg øverst): én rad i regnearket per banner, hver rad i alle
valgte størrelser, levert som én ZIP. Bannerne er nøyaktig de samme som
enkeltfanene lager (samme faste innhold, 18+-merket bare på Norsk Tipping).

1. **Hent arket** — lim inn en Google Sheets-lenke (arket må være delt som
   *Alle med lenken → Leser*; en lenke til en bestemt fane bruker den fanen),
   last opp `.xlsx` / `.csv` / `.tsv`, eller kopier cellene i Sheets og lim dem
   inn. *Last ned mal (CSV)* gir en ferdig mal, og *Prøv med eksempeldata*
   laster et eksempel som virker.
2. **Kontroller** — alle bilder hentes, alle overskrifter får størrelse per
   format, og hver rad sier *Klar*, *Sjekk* eller *Feil* med årsak (mangler
   bilde, død lenke, overskrift for lang for et format, et ord for langt for én
   linje, bilde for lite til skarpt resultat). Rett en overskrift direkte, eller
   *Juster* en rad: dra fokuspunktet i bildet (eller flytt det med piltastene,
   Shift for større steg), zoom, bytt eller hent bildet på nytt, endre skrift,
   filnavn eller klikk-lenke, og sett størrelsen for hånd i et format. Hvert kort
   viser det endelige filnavnet (`hotell-host-2` når to rader ville kollidert).
   **Mange rader samtidig:** huk av rader (eller *Alle som vises* / *Bare
   klare*) og sett skrift eller spilltype, tilbakestill størrelser til Auto, ta
   med/ta ut, dupliser eller fjern. Søk på overskrift, filnavn eller radnummer,
   sorter på rekkefølge i arket, lengde eller status, og legg til en tom rad med
   *+ Ny rad*. *Feilrapport (CSV)* lister alle rader med problemer — radnummer,
   overskrift og årsak — til å sende tilbake til den som fylte ut arket.
3. **Last ned** — PNG, JPEG, Auto eller HTML5 (CM360), 1×/1,5×/2×, og ZIP-en
   ordnet per størrelse (`320x400/…`), per banner eller alt i én mappe.
   Kjøringen går i bakgrunnen med fremdrift og tidsanslag; den kan avbrytes
   (ferdige bannere beholdes), og den havner i *Historikk* mens den går. Hver
   ZIP har `rapport.csv` (overskrift, brukt størrelse og filstørrelse per fil;
   formater serveren måtte gjøre mindre enn planlagt, er merket). Rader som
   feilet, listes i resultatpanelet.

Rader med feil hoppes over – de leveres aldri ødelagte. Arbeidet — og en
kjøring som går eller er ferdig, med nedlastingen — overlever at siden lastes på
nytt. *Hent på nytt* leser arket igjen og beholder justeringene for rader der
overskriften er uendret. Bilder som er ryddet bort fra serveren, hentes på nytt
fra lenkene.

**Arket.** Første rad er kolonnenavn; rekkefølgen spiller ingen rolle, og andre
kolonner ignoreres (norske, engelske og tyrkiske navn virker).

| Kolonne | Må med | Eksempel | Merknad |
| --- | --- | --- | --- |
| `Overskrift` | ja | Spar opptil 50 % på hotell i høst | |
| `Bildelenke` | ja | https://…/hotell.jpg | Direkte bildelenke. Delingslenker fra Google Drive og Dropbox virker også. |
| `Filnavn` | nei | hotell-host | Tomt = lages fra overskriften |
| `Skrift` | nei | Halvfet / Normal | Tomt = valget for hele kjøringen |
| `Fokus` | nei | topp · bunn venstre · 30/70 | Hvor bildet holdes ved beskjæring. Tomt = automatisk |
| `Klikk-lenke` | nei | https://www.abcnyheter.no/… | Bare HTML5. Tomt = standardlenken ved nedlasting |
| `Ingress` | nei | Nybrent hver morgen … | ReadPeak og Norsk Tipping |
| `Merkevare` | nei | KAFFEHUSET | ReadPeaks grønne etikett. Tomt = *Felles for alle rader* |
| `Knappetekst` | nei | Sjekk utvalget her | ReadPeak. Tomt = «Les mer her» |
| `Spilltype` | nei | Lotto / Vikinglotto / Eurojackpot / Sport | Norsk Tipping. Bestemmer vinnersjanse-linjen |
| `Vinnersjanse` | nei | Vinnersjanse 1.premie … | Norsk Tipping, egen ordlyd i stedet for spillets |

ReadPeak og Norsk Tipping har et *Felles for alle rader*-panel for verdiene de
fleste radene deler (merkevare, knappetekst, spill, stil og farge på «Les mer»).
Overskriftene deres måles per format og trappes ned (til minst 75 %) til ingenting
klippes; en avkuttet ingress eller en knapp som brytes, gir *Feil*.

Nyttig i arket: `=LEN(A2)` for antall tegn, `=IMAGE(C2)` for å se bildet. Et
demoark: *Houseads bulk – mal* (Google Sheets).

**Automatisk beskjæring.** Bildet holdes der detaljene og fargene er, dratt mot
midten; i høye bilder (som oftest en person) beholdes øvre tredjedel, så ansikter
overlever de brede formatene. Slå av med *Smart beskjæring*, sett `Fokus` i
arket, eller dra punktet i *Juster*.

### Auto tekststørrelse

Houseads-overskrifter får størrelse per format ut fra lengden – kort tekst
større (opptil 120 %), lang tekst mindre (ned til 70 %) – og blir deretter
**målt**: blir teksten kuttet eller et ord delt, settes den ned 5 % om gangen.
Standardreglene er målt med ~60 ekte norske butikkoverskrifter i hvert format:

| Format | 120 % | 110 % | 100 % | 90 % | 80 % | 70 % (maks) |
| --- | --- | --- | --- | --- | --- | --- |
| 320×400 | ≤ 26 | ≤ 40 | ≤ 64 | ≤ 74 | ≤ 82 | ~97 |
| 980×300 | ≤ 25 | ≤ 39 | ≤ 63 | ≤ 66 | ≤ 77 | ~85 |
| 980×500 | ≤ 25 | ≤ 40 | ≤ 65 | ≤ 73 | ≤ 78 | ~96 |
| 580×500 | ≤ 30 | ≤ 46 | ≤ 74 | ≤ 77 | ≤ 85 | ~116 |
| 300×600 | ≤ 25 | ≤ 40 | ≤ 65 | ≤ 73 | ≤ 78 | ~96 |
| 300×250 | ≤ 26 | ≤ 35 | ≤ 66 | ≤ 74 | ≤ 82 | ~97 |

(tegn, mellomrom regnet med). Reglene kan endres for alle under *Bulk →
Tekststørrelse-regler*, som også har et testfelt. I Houseads-fanen har hvert
formats *Tekststørrelse*-glidebryter en **Auto**-bryter; drar du i den, blir
formatet manuelt. Eksporten måler hver Auto-størrelse på nytt i nettleseren som
tar bildet, så en kuttet overskrift kan ikke leveres.

### Wallpaper

En fullverdig designeditor (egen **Wallpaper**-fane) for wallpaper-plasseringen
i to deler: en **bakgrunn på 1920 × 850** bak hele siden og et **toppbanner på
1000 × 300** øverst i innholdskolonnen. Designeren lager den rett i nettleseren
— eller laster opp et ferdig design og legger ekte tekst og knapper oppå.

| Tegneflate     | Størrelse   | Sikker sone                         |
| -------------- | ----------- | ----------------------------------- |
| **Bakgrunn**   | 1920 × 850  | 1280 × 700, midtstilt, fra toppen   |
| **Toppbanner** | 1000 × 300  | hele banneret                       |

- **Tekst** i 104 Google-skrifter (alle vekter og kursiv familien har),
  størrelse, linjeavstand, sperring, justering, farge eller gradient-tekst,
  kontur, understrek/gjennomstrek, store bokstaver, og tekstboks med fyll,
  luft og hjørner.
- **Former** — rektangel, avrundet, sirkel/ellipse, trekant, rombe, femkant,
  sekskant, stjerne, tilbudsmerke, pil, vinkel, snakkeboble, hjerte, ramme —
  med fyll (farge, lineær/radiell gradient eller ingen), hel/stiplet/prikket
  kant, hjørneradius og tekst inni. Ferdige **knapper**.
- **Linjer** — hel, stiplet, prikket, med pil/prikk/strek i endene.
- **Ikoner** — hele Lucide-settet (~1 850), søkbart, kan farges.
- **Bilder** — last opp, dra inn, lim inn fra utklippstavlen eller hent fra
  lenke; utsnitt (fyll/tilpass/strekk), fokus, zoom, speilvending, runde
  hjørner eller sirkel, kant og filtre (lysstyrke, kontrast, metning, gråtone,
  sepia, fargetone). «Importer ferdig design» legger en hel PNG/JPG inn som
  låst bunnlag.
- **Effekter** på alt: synlighet, uskarphet, skygge, blandingsmodus og en
  hover-effekt som virker i HTML5-eksporten.
- **Lerretet**: flytt, skaler (roterte elementer skaleres i egen retning),
  roter, markeringsramme, smarte hjelpelinjer som fester seg til tegneflaten,
  sikker sone, sidens kanter og andre elementer, justering/fordeling, lag
  (rekkefølge, lås, skjul, gi navn), angre/gjør om, kopier/lim inn,
  piltaster, zoom og panorering.
- **Hjelpelinjer som aldri eksporteres**: den røde sikre sonen og et overlegg
  som viser hvor nettsiden dekker bakgrunnen — begge kan slås av.
- **Kvalitetssjekk** som varsler om det som faktisk går galt med formatet:
  innhold delvis utenfor sikker sone, innhold skjult under nettsiden, bilder
  forstørret forbi oppløsningen sin, bitteliten tekst.
- **Forhåndsvisning på nettsiden** i 1280/1440/1680/1920 px viser nøyaktig hvor
  mye av sidene hver skjerm ser.
- **Eksport** som JPG/PNG eller HTML5 (én CM360-klar ZIP per tegneflate, tekst
  beholdt som ekte tekst med skrifter redusert til tegnene som faktisk brukes
  — typisk 2–5 KB per snitt). Dialogen lager de ekte filene mens du endrer
  innstillingene og viser størrelsen mot grensen (standard 2 × 100 KB), og det
  komprimerte bildet kan ses i 100 %/200 % før du laster ned.
- Lagres automatisk i nettleseren; lagre/åpne en selvstendig prosjektfil; alle
  eksporter havner i **Historikk** sammen med designet, så de kan åpnes og
  redigeres igjen.

## Native Premium

Åpnes med **Native Premium** øverst til venstre (eller `http://localhost:4050/native/`).

### Hva en side består av

En side er en liste med **seksjoner** (blokker). Hver blokktype har sine egne felt
og ser riktig ut på desktop, nettbrett og mobil av seg selv:

| Gruppe | Blokker |
| --- | --- |
| Topp | **Hero** — bilde eller video (egne stående filer for mobil), stikktittel, H1, ingress; tekst over bildet, side om side, bilde over, **bilde i ramme**, **zoom** (bildet vokser til full bredde når man scroller) eller **typografisk**; tittelstørrelse opp til «gigantisk», tittel-animasjon (ord / linje / bokstav), langsom zoom; **Kapittel** (merke, tittel, innledning; midtstilt, stor til venstre eller stort tall) |
| Tekst | **Brødtekst** (mellomtitler, lister, sitater, lenker, utheving, ingress-avsnitt, to spalter), **Stor tekst** (én stor setning; ordene lyser opp ved scroll, ord for ord, skrivemaskin, fargeovergang eller kontur), **Faktaboks**, **Sitat**, **Personer og sitater** (portrett eller portrettvideo), **Tall** (rent, kort, linjer eller ett gigantisk), **Topp-liste** (rangert, nedtelling, scener i hel skjerm med store tall, fakta og «Visste du?»), **Steg for steg**, **Kort / rutenett** (bokser, rent, tekst over bilde, lenkefliser; valgfri 3D-vipping), **Faner**, **Tidslinje**, **Tabell / sammenligning** (opptil 3 kolonner, én uthevet), **Spørsmål og svar**, **Diagram** (liggende, stående, smultring), **Løpende tekst**, **Kilder**, **Skillelinje** |
| Media | **Bilde** (ett eller to; 21:9 … 4:5; zoom ved scroll, gardin, langsom zoom; fotokreditering), **Bilde + tekst**, **Video**, **Galleri** (karusell, rutenett, mosaikk, lysbildeserie; fullskjerm ved klikk), **Bilde med punkter** (dra punktene i forhåndsvisningen, dobbeltklikk for å legge til), **Innbygging** |
| Handling | **CTA** (bånd, **kort med bilde**, knapp eller pil-lenke), **Produktkort** (rutenett eller karusell), **Avstemning** (resultatet telles på sider som publiseres her), **Nedtelling** (norsk tid, med knapp) |
| Effekter | **Scrollfortelling** (over bildet eller **delt skjerm**; ton, zoom, skyv, stabling, uskarp, gardin eller sirkel; hvite, glass-, mørke eller rene kort; fremdriftsprikker; eget bilde eller video per kort), **Scroll-video**, **Sidelengs scroll**, **Parallakse-bilde**, **Snu-kort**, **Før / etter**, **Quiz** (fremdrift, resultattekster etter poeng, knapp) |

Hver seksjon har også **stil**: bakgrunn (temafarge, egen farge, **fargeovergang**
— lineær, fra midten eller myk «aurora» —, **bilde** eller **video**, eget bilde/video
for mobil), bakgrunnseffekt (står fast, langsom zoom, parallakse), filmkorn,
tekstfarge, luft og **minimum høyde** (per skjerm), **formede kanter** (bølge, skrå,
bue, sagtann), animasjon inn (ton, skli, zoom, uskarp, maske, løft, **ett og ett
element**) med tempo og forsinkelse, **effekter som følger scrollingen** (tones ut,
vokser inn, dybde, scene-skifte) og navn i **kapittelmenyen**.

**Side-panelet:** lesefremdrift, **kapittelmeny** (stripe under merkingen eller
prikker i siden), lesetid i hero, **flytende knapp** som dukker opp etter en
valgt andel av siden (skjules over CTA-er og bunnteksten), «Likte du denne saken?
Ja/Nei» nederst, linjen «Annonsørinnhold for … / Produsert av …» og egen CSS (som
aldri kan skjule merkingen).

**Ferdige design:** «Legg til seksjon» viser 51 ferdig designede seksjoner med
levende miniatyrer (åpninger, kapitler, store tekster, tall, lister, kort,
scrollfortellinger, handling, og det bransjene trenger hver gang: eksempel på
effektiv rente, forbehold for helseråd, faner per ukedag, pakketabell, ukens
tilbud med førpris) — med søk. Seksjoner og stil kan kopieres og limes
inn, også mellom prosjekter (Ctrl+C / Ctrl+V, med Alt bare stilen).

**Maler:** i tillegg til de fem arbeidshestene finnes femten **premium-maler**, hver
med egne skrifter, farger og sideinnstillinger, kledd i et demosett med bilder
(Unsplash, rundt 80 bilder): **Bil-lansering premium**, **Topp 5 – nedtelling**,
**Året i tall («Wrapped»)**, **Reise – immersiv**, **Interaktiv guide
(«utforsker»)**, **Rapport og innsikt**, **Mat og smak** — og én per bransje ABC
BrandStudio selger mye til: **Apotek og helse** (farmasøyten som ekspert, faner
per hudtype, forbeholdene helsereklame krever), **Lokal produsent («fra kube til
bord»)** (honning, meieri, bryggeri — produsentens år som scrollfortelling),
**Bank – første bolig** (guide i steg, sammenligning av lån, eksempel på
effektiv rente), **Energi og bærekraft** (klikkbart tak, forbruk i diagram),
**Bolig – nytt prosjekt** (nabolaget, leilighetstyper, nedtelling til
salgsstart), **Dagligvare – ukemeny** (middag per ukedag, tilbud med førpris,
avstemning), **Arbeidsgiver og rekruttering** og **Trening og aktiv hverdag**
(mørk, store bokstaver, medlemskap i tabell). Galleriet i «Ny Native Premium»
filtrerer på bransje og søker på ord, viser hver mal levende og åpner en
forhåndsvisning i full størrelse (desktop/mobil) med alle effektene. Demobilder
og eksempeltekst flagges i **Kontroll** til de er byttet ut.

**Tema:** i tillegg til farger, skrifter og logo: sidebakgrunn (lyse eller mørke
sider), størrelse på titler (opp til «Magasin»), bokstavavstand, store bokstaver i
titler/knapper og sju ferdige utseender.

**Merkingen** er ikke en blokk og kan ikke fjernes: hver side starter med en fast
«Annonsørinnhold fra {annonsør}»-linje med utgivers og annonsørens logo, og slutter
med den faste bunnteksten. Ordlyden settes én gang i **Innstillinger**.

### Editoren

- **Midten:** den ekte siden, akkurat slik den publiseres, i desktop-, nettbrett-
  eller mobilbredde (tastene 1/2/3). Klikk på en seksjon for å velge den;
  **dobbeltklikk på en tekst for å skrive rett på siden**.
- **Høyre:** feltene til seksjonen (med tegnteller mot anbefalt lengde), stil
  (bakgrunn, luft, justering, animasjon — luft og justering kan være forskjellig
  per skjerm) og synlighet per skjerm.
- **Venstre:** Seksjoner (dra for å flytte) · Medier (last opp, **importer fra en
  Google Drive-mappe**, fra lenke, eller **lag med AI**; alt-tekst, fokuspunkt) ·
  Tema (farger med kontrastsjekk, Google- eller egne skrifter, logo, knappestil,
  tittelstørrelse, ferdige utseender; **merkevarer** per annonsør) · Side
  (sideinnstillinger) · Prosjekt (annonsør, **varianter** som «For menn» /
  «For kvinner» med faner, delingsbilde og -tekst, endelig adresse, UTM, egne
  skript) · Kontroll (alt som bør rettes før annonsøren ser siden) · Gjennomgang.
- **Flere seksjoner samtidig:** Shift- eller Cmd-klikk i seksjonslisten; en linje
  flytter, dupliserer, kopierer eller sletter gruppen i ett steg.
- **Tastatur:** `?` (eller tastatur-ikonet) viser alle snarveiene. De virker også
  når fokus står i forhåndsvisningen.
- **Redusert bevegelse:** en bryter i verktøylinjen viser siden slik lesere med
  «reduser bevegelse» ser den.
- Angre/gjør om (Ctrl+Z / Ctrl+Shift+Z; jevn skriving blir et steg med noen
  sekunders mellomrom), lagrer automatisk, en versjon hvert 10. minutt, navngitte
  versjoner og gjenoppretting. Har en kollega lagret i mellomtiden, sier editoren
  fra i stedet for å skrive over, advarer til det er løst og tilbyr **Lagre min
  versjon som kopi**. Publisering, ny runde og eksport kjører aldri på en kopi som
  ikke er lagret.
- **Kontroll** ser også på delingstittel, -beskrivelse og -bilde (med
  forhåndsvisning av delingskortet under Prosjekt), doble ankere og døde
  `#lenker`, hoppede overskriftsnivåer, gjentatte «Les mer»-lenker og sidens vekt
  (med varsel om en tung første skjerm). Å publisere en versjon annonsøren ikke
  har godkjent, krever en bekreftelse.

### AI-modus (OpenRouter)

**AI** i editoren (eller «Med AI» når du lager et prosjekt) åpner en veiviser i fire
steg når siden er tom. Har siden innhold, åpner **AI** i stedet **AI-assistenten**
(se under).

1. **Kilder** — slipp **dokumenter** i feltet (PDF, Word .docx, .txt/.md – flere om
   gangen), lim inn **alt du vet** i tekstfeltet (briefen, e-posten fra annonsøren,
   fakta, priser, lenker), lim inn lenken til en **Google Docs**-brief, annonsørens
   **produktsider**, og importer **Drive-mappen** med bilder/video. Kommentarer i
   dokumentet blir med som notater; bilder i Word-filer importeres og vises til AI-en.
   Skannede PDF-er (uten tekst) leses med tekstgjenkjenning via OpenRouter.
   Her velger du også:
   - **Mal** (valgfritt) — f.eks. «Bil-lansering premium». AI-en følger malens
     rekkefølge og design (oppsett, størrelser, bakgrunner, animasjoner) og
     skriver eget innhold fra kildene; eksempelteksten i malen brukes aldri.
     Uten mal lager AI-en strukturen selv.
   - **Kvalitet** — Økonomi, Standard eller Premium (se tabellen under).
2. **Spørsmål** — AI-en leser alt (også bildene) og viser hvordan den forstår
   oppdraget: sammendrag, faktaene den fant (med de som må sjekkes merket: priser,
   tall som ikke stemmer), sitater, hva hvert bilde viser og hvor det passer.
   Så stiller den **maks åtte spørsmål** — bare det kildene ikke svarer på:
   motstridende fakta, manglende CTA-lenke, uklare sitater, juridiske punkter;
   vinkel/tone/målgruppe bare hvis briefen er taus. Forslaget er forhåndsvalgt,
   så de fleste svar er ett klikk.
3. **Plan** — tre tittelforslag, ingress og seksjonsplan, alt kan endres
   (seksjoner som får designet fra malen er merket «fra malen»).
4. **Skriv** — seksjonene skrives (samtidig), sjekkes mot tegngrensene (én
   automatisk rettingsrunde) og settes inn på siden. AI-ens advarsler («prisen må
   bekreftes av Ford») lagres som kommentarer på seksjonene det gjelder. Med mal
   kan du også ta med malens farger, skrifter og sidevalg.

**AI-assistenten** (panelet «AI-assistent» til venstre) endrer siden etterpå med
vanlige ord: «gjør ingressen kortere», «flytt sitatet opp under heroen», «legg til
en FAQ om lading før CTA-en», «mørkegrønn primærfarge», «skjul testimonials på
mobil». Den ser hele siden slik den er lagret — seksjonene med id, type, innhold og
stil, temaet, sidevalgene og egen CSS — og endrer bare det du ber om. Velg en
seksjon på siden for å si «denne». Mangler den fakta (en pris, en lenke) eller er
noe uklart, gjør den det den kan og **spør om resten**, med klikkbare svar. Hver
endring er ett steg: «Angre endringen» setter siden tilbake akkurat slik den var.
**Vis koden** (‹›) viser det AI-en ser, hele det lagrede dokumentet og HTML-en.

Hvert tekstfelt har også en ✨-meny: kortere, lengre, enklere, varmere, mer
saklig, ny vinkel, tre titler, rett språkfeil — alltid tre alternativer.

AI-en følger disse reglene: norsk bokmål (titler med liten forbokstav etter første
ord, norsk typografi), fakta og sitater **bare** fra kildene (hver påstand knyttet
til en fakta-ID), ingen superlativer uten dokumentasjon (markedsføringsloven § 3),
ingen produksjonsord («Native Premium», «målgruppe», «CTA») i teksten til leseren,
skriver aldri merkingen selv. Promptene er versjonert i `lib/native/ai/prompts.js`;
kostnaden for hvert kall logges per prosjekt (også kall som feilet, men ble betalt).

**Kvalitetsnivåer** (målt 15.10.2026 på en ekte brief; en hel side = analyse,
plan og ca. 10 seksjoner):

| Nivå | Modell (standard) | Ca. pris per side | Passer til |
| --- | --- | --- | --- |
| Økonomi | `deepseek/deepseek-v4.1-flash` | 0,5 kr | utkast, mange varianter; godt norsk, men tregere |
| Standard | `anthropic/claude-sonnet-5.5` | 3 kr | det meste – best tekst for pengene |
| Premium | `anthropic/claude-opus-5.5` | 7 kr | viktige kunder; skarpest spørsmål og plan |

Modellene og forvalgt nivå endres i **Innstillinger**. Appen sender
`temperature` og tenke-innstillinger bare til modeller som støtter dem (nyere
Claude- og Gemini-modeller avviser `temperature`).

**Oppsett:** kopier `.env.example` til `.env` og fyll inn `OPENROUTER_API_KEY`
(nøkkelen skal **bare** stå i `.env`, som aldri sjekkes inn – ikke i
`.env.example`). Start appen på nytt etterpå. Alle forespørsler sendes med
**zero data retention** og «ingen trening på innholdet».

Valgfritt: `GOOGLE_API_KEY` (med Drive API slått på) gir nøyaktige filtyper og
størrelser for Drive-mapper; uten den leses mappens offentlige visning.

### Gjennomgang, eksport, publisering

- **Gjennomgang (Del):** «Send til gjennomgang» låser siden som runde 1, 2, … og
  kopierer en lenke (`/p/<tilfeldig nøkkel>/`). Annonsøren åpner den uten
  innlogging, **fester kommentarer rett på siden** og **godkjenner med navnet sitt**.
  Endringer etterpå vises først i neste runde. Lenken kan trekkes tilbake.
  Annonsøren ser bare sine egne kommentarer, svar i sine tråder og kommentarer
  teamet har merket **Synlig for annonsøren** — interne notater og AI-ens
  advarsler når dem aldri.
- **Eksport:** en ZIP med `index.html` (og én mappe per variant), WebP-bilder i
  flere størrelser, sidens skrifter **redusert til tegnene den bruker** og lagt ved
  (ingen kall til Google fra leserne — GDPR), video, skript og en `LES-MEG.txt`.
  Alle stier er relative: last opp mappen hvor som helst, eller åpne den fra disken.
- **Publiser her:** ABC design kan også vise siden selv på `/n/<adresse>/` (for
  testing, eller når verktøyet ligger på en server med eget domene). Publiserte
  sider kjøres i en CSP-sandkasse.
- **Måling:** sidene sender `np_view`, `np_scroll` (25/50/75/100), `np_time`,
  `np_cta_click`, `np_video` (start/25/50/75/ferdig), `np_factbox_open`,
  `np_share`, `np_quiz_*`, `np_tab`, `np_hotspot`, `np_flip`, `np_poll`,
  `np_feedback`, `np_chapter`, `np_gallery` og `np_lightbox` til `window.dataLayer`
  og som DOM-hendelsen `np:track`. En valgfri **klikksporing** (DoubleClick, Adform …)
  kan legges foran alle annonsørlenker (Prosjekt → Måling).
  Legg inn Kilkaya / Mixpanel / GTM én gang i Innstillinger; piksler fra annonseservere
  med `[timestamp]`/`[cachebuster]` får nytt tall ved hver visning.
- Sidene virker **uten JavaScript** (alt synlig; bevegelse er et tillegg),
  respekterer `prefers-reduced-motion` og laster bare bildestørrelsen skjermen trenger.

### Innlogging (for en felles server)

Av som standard. For å kreve innlogging for alle: legg `AUTH=on` i `.env` og lag brukere:

```bash
npm run user:add -- kari --admin   # spør om navn og passord
npm run user:add -- ola
npm run user:list
npm run user:passwd -- ola
npm run user:remove -- ola
```

Gjennomgangslenker (`/p/…`), publiserte sider (`/n/…`) og filene deres er åpne.
Bare administratorer kan endre innstillingene for Native Premium.

### Hvor ting lagres

`data/native/` (prosjekter, versjoner, kommentarer, AI-logg, innstillinger,
merkevarer, bibliotek; slettede prosjekter havner i `data/native/trash/`),
`uploads/native/` (bilder med WebP-versjoner, video, skrifter) og
`data/users.json`. Ta backup av `data/` og `uploads/` sammen.

## Funksjoner

- 🖼️ **Last opp eller hent fra lenke** — dra og slipp / velg fil, **eller lim inn
  en bildelenke** (nyttig for AVIF-bilder fra Norsk Tipping). Godtar JPG, PNG,
  WEBP, AVIF, GIF. Utdata er tapsfri PNG, eller JPEG hvis banneret ellers ville
  sprengt størrelsesgrensen.
- ✂️ **Dra for å beskjære + zoom** — plasser bildet og zoom inn opptil 30 %;
  beskjæringsvinduet matcher det faktiske bildeområdet.
- ⚡ **Live forhåndsvisning** — hvert format i det valgte produktet oppdateres
  mens du skriver, rendret av *samme* kode som lager den endelige PNG-en, så
  forhåndsvisningen er tro mot resultatet.
- 🔠 **Justerbar tekststørrelse** for overskrift og ingress, **Les mer som knapp
  eller ren tekst**, og en **fargevelger** for «Les mer» + «NORSK TIPPING».
- 📦 **HTML5-eksport til Campaign Manager 360** — én opplastingsklar ZIP per
  format, der overskriften forblir **ekte tekst** (knivskarp på alle skjermer) og
  landingssiden er koblet opp som `clickTag`. Se
  [HTML5 til Campaign Manager 360](#html5-til-campaign-manager-360).
- 🪶 **200 KB-grense** — hver fil komprimeres til å holde seg innenfor
  annonseserverens grense, og appen viser hvilken størrelse den endte på.
- 🔍 **Ekstra skarphet** — bannerne rendres i 2× og skaleres ned med Lanczos-3,
  som fjerner uskarpheten en rett 1×-render etterlater i fotoet.
- 🕘 **Historikk** over de siste 30 pakkene (last ned på nytt / slett).
- ⚙️ **Innstillinger** — redigerbare spilltyper, merketekst og merke,
  størrelsesgrense og eksport.
- 🔤 **Innebygde skrifter (Arimo, Noto Serif)** slik at forhåndsvisning og
  nedlastet PNG ser helt like ut på alle plattformer, også Linux-servere. En
  HTML5-pakke får bare skriften produktet sitt faktisk bruker.

---

## Krav

- **Node.js 20 eller nyere** — <https://nodejs.org>
  På macOS: last ned **«macOS Installer (.pkg)»** (ikke `.tar.gz`) og kjør den
  helt ferdig. Dette gjør du bare **én gang** — det blir værende.
- **Git** (kun for å klone fra GitHub) — <https://git-scm.com>

`npm install` sørger også for at Puppeteer har en nettleser å bruke. Er Google
Chrome allerede installert på maskinen, brukes den som den er; hvis ikke lastes
en Chromium-kopi (~150 MB) ned én gang. Uansett krever første installasjon
internett og noen minutter.

> npm 11 kjører ikke lenger avhengigheters installasjonsskript automatisk, og
> det var nettopp slik Puppeteer hentet den nettleseren — derfor henter dette
> prosjektet den selv, fra `scripts/ensure-browser.js`. Linjene
> `npm warn allow-scripts` du kanskje ser under installasjonen, er ufarlige.

Den installerer også **sharp**, som står for nedskaleringen og
størrelsesgrensen. sharp kommer som ferdigbygd binærfil og trenger normalt ingen
byggeverktøy. Den er bevisst satt opp som *valgfri*: skulle den mislykkes, går
`npm install` likevel gjennom og appen virker fortsatt — den faller bare tilbake
til vanlig rendring, slår av størrelsesgrensen og sier fra ved oppstart og i
Innstillinger.

> **Viktig:** etter at du har installert Node, **avslutt Terminal helt (Cmd + Q)
> og åpne den på nytt.** Ny PATH gjelder først i en ny terminaløkt — dette er den
> vanligste grunnen til at `npm`/`node` virker «ikke funnet» rett etter
> installasjon.

---

## Kom raskt i gang

```bash
git clone https://github.com/legolasanti/banner-generator.git
cd banner-generator
npm install          # installerer avhengigheter + laster ned Chromium
npm start            # starter serveren
```

Åpne deretter **<http://localhost:4050>** i nettleseren.

For utvikling med automatisk omstart:

```bash
npm run dev
```

---

## Oppdatere en kopi du allerede har

Har du klonet dette fra før? Alt under skjer i **ett Terminal-vindu** og tar
omtrent ett minutt. Følg de fire stegene i rekkefølge.

### 1 · Stopp appen hvis den kjører

Kjører appen, viser Terminal-vinduet den ble startet i noe slikt:

```
  ABC design kjører på  http://localhost:4050

[puppeteer] browser ready (pid 10080)
```

Klikk på det vinduet og trykk **`Ctrl + C`** (hold `Ctrl`, trykk `C` — dette er
`Ctrl` også på Mac, *ikke* `Cmd`). Appen stopper og du får ledeteksten tilbake.

> Usikker på om den kjører? Åpne <http://localhost:4050> i en nettleser. Laster
> siden, kjører den og du trenger dette steget. Sier nettleseren at den ikke får
> kontakt, er den allerede stoppet — gå til steg 2.

### 2 · Sjekk at du står i prosjektmappen

Oppdatering virker bare inne i prosjektmappen. Ledeteksten må slutte på
**`banner-generator`**:

```
abraham@MacBook banner-generator %
```

Gjør den ikke det, gå dit først (juster stien til der du har den):

```bash
cd ~/Desktop/banner-generator
```

For å være helt sikker: kjør `ls` — du skal se `server.js`, `package.json`,
`public` og `templates` i lista:

```
LICENSE           history           package-lock.json scripts           test
README.md         history.json      package.json      server.js         uploads
README.no.md      lib               public            settings.json
_smoke.sh         node_modules      references        templates
```

Viser `ls` noe annet, står du i feil mappe og `git pull` vil svare
`not a git repository`.

### 3 · Kjør de tre kommandoene, i denne rekkefølgen

```bash
git pull
npm install
npm start
```

Hva hver av dem gjør, og hvordan «det gikk bra» ser ut:

| Kommando | Hva den gjør | Du skal se |
| -------- | ------------ | ---------- |
| `git pull` | Henter den nye versjonen fra GitHub | En liste med endrede filer, som ender på noe slikt som `21 files changed` |
| `npm install` | Installerer det den nye versjonen trenger | `added / changed N packages` (advarsler om `npm audit` er normalt) |
| `npm start` | Starter appen | `ABC design kjører på  http://localhost:4050` |

Kjør dem én om gangen, og vent til hver er ferdig før du skriver den neste.
`npm install` er den trege — gi den et minutt.

### 4 · Åpne appen

Gå til <http://localhost:4050>. Fanene øverst skal nå si:

```
Norsk Tipping   ReadPeak   Houseads   Historikk
```

Ser du fortsatt den gamle **Ny banner**-fanen alene? Da viser nettleseren en
mellomlagret side — det er ikke en mislykket oppdatering. Tving oppdatering med
**`Cmd + Shift + R`** (macOS) eller **`Ctrl + F5`** (Windows).

La Terminal-vinduet stå åpent mens du jobber. Lukker du det, stopper appen.

### Hva du får i denne versjonen

- **Bulk for alle produkter:** ReadPeak og Norsk Tipping fra regneark, ikke bare
  Houseads — pluss valg av rader med felles handlinger, søk og sortering, en
  feilrapport å sende tilbake, og kjøringer som overlever at siden lastes på nytt.
- **Native Premium:** åtte nye bransjemaler (apotek, lokal produsent, bank,
  energi, bolig, dagligvare, arbeidsgiver, trening) med egne demobilder, et
  galleri som filtrerer på bransje, tryggere lagring (konflikter, å forlate
  siden), interne kommentarer som aldri når annonsøren, flervalg, en
  snarveioversikt og en strengere *Kontroll*.
- **Understrek ved hover** på alle bannernes overskrifter, og standardlinjene
  for vinnersjanse får nå plass i sin helhet på 320×400 og 190×190.
- Bruker du `npm run dev`, start den på nytt én gang: nodemon overser nå data-
  og historikkfilene (den startet før på nytt midt i en kjøring).

Tidligere:

- Tre produkter i fanene i stedet for ett: **Norsk Tipping** (uendret),
  **ReadPeak** (de samme to plasseringene uten 18+-merket og uten
  vinnersannsynlighet, med annonsørens eget navn og «Les mer» som kan endres) og
  **Houseads** (abc shoppings 320×400, 980×300, 980×500, 580×500, 300×600
  og 300×250).
- **Bulk**: mange Houseads fra ett Google-ark / Excel / CSV, kontrollert rad for
  rad og lastet ned som én ZIP (se *Bulk* over), og nye **980×500**.
- **Auto tekststørrelse** på Houseads-formatene: størrelsen følger lengden på
  overskriften og måles, så ingenting kuttes.
- **Egne grenser per format** under Innstillinger → Eksport, så et 190×190 og et
  980×300 slipper å dele én størrelsesgrense.
- Overskrift og Ingress får plass til tre linjer hver, og «Les mer» følger
  Ingressen i stedet for å ligge nederst i kortet.

### Merk

**`npm install` er ikke valgfritt her** — det er den som henter inn `sharp`, som
både størrelsesgrensen og ekstra skarphet bygger på. Hopper du over den, starter
appen fortsatt, men den sier fra ved oppstart og i Innstillinger om at begge er
slått av.

**Dine egne ting røres ikke.** `settings.json`, `history/`-mappen og et eventuelt
opplastet merke ligger utenfor versjonskontroll, så `git pull` tar aldri på dem.
Gamle innstillingsfiler leses som de er: det den nye versjonen har lagt til
(egne størrelsesgrenser per format) starter bare tomt, og gamle
historikk-oppføringer fungerer videre som Norsk Tipping-pakker.

**Sier `git pull` at du har lokale endringer** du ikke har gjort med vilje,
legger `git stash` dem til side, og `git stash drop` kaster dem for godt.

**Lastet du ned en ZIP i stedet for å klone?** Da er det ingenting å hente — last
ned ZIP-en på nytt fra GitHub, eller klon prosjektet ordentlig én gang med
kommandoen under [Kom raskt i gang](#kom-raskt-i-gang), så er framtidige
oppdateringer bare én `git pull`.

---

## Sette det opp på en annen maskin (steg for steg)

1. **Installer Node.js 20 eller nyere**
   - Gå til <https://nodejs.org> og last ned **LTS**-versjonen.
   - På macOS: velg **«macOS Installer (.pkg)»** — **ikke** `.tar.gz`.
   - Åpne `.pkg`-filen og kjør den helt ferdig (Continue → Install).
   - **Avslutt Terminal helt (Cmd + Q) og åpne den på nytt** — ny PATH gjelder
     bare i en ny terminaløkt.
   - Sjekk:
     ```bash
     node -v      # skal vise v20.x eller nyere
     npm -v       # skal vise 10.x e.l.
     ```
   - Du installerer Node **én gang**; deretter virker det i hver nye terminal.
     Du trenger **ikke** installere det på nytt hver gang.
   - Hvis `node`/`npm` fortsatt er «command not found», har maskinen trolig
     **nvm**. Kjør `nvm alias default 20` én gang og sørg for at `~/.zshrc`
     laster nvm (se Feilsøking), åpne så en ny terminal.

2. **Installer Git** (om nødvendig) fra <https://git-scm.com>.

3. **Klon prosjektet fra GitHub**
   ```bash
   git clone https://github.com/legolasanti/banner-generator.git
   cd banner-generator
   ```
   (Eller last ned repoet som ZIP fra GitHub, pakk det ut og gå inn i mappen.)

4. **Installer avhengigheter** (laster også ned Chromium):
   ```bash
   npm install
   ```

5. **Kjør det**
   ```bash
   npm start
   ```
   Du skal se:
   ```
   ABC design kjører på  http://localhost:4050
   ```

6. **Åpne appen** på <http://localhost:4050>.

7. **Stopp serveren** med `Ctrl + C` i terminalen.

### På Windows

Samme framgangsmåte, med én Windows-spesifikk snublestein. Installer Node fra
<https://nodejs.org> (**LTS**, Windows Installer `.msi`), **lukk alle
terminalvinduer og åpne et nytt**, og kjør så:

```powershell
git clone https://github.com/legolasanti/banner-generator.git
cd banner-generator
npm install
npm start
```

Får du **«npm.ps1 cannot be loaded because running scripts is disabled on this
system»**, hopp til
[npm.ps1 kan ikke kjøres](#windows-npmps1-kan-ikke-kjores-skript-er-avslatt)
under — det er én kommando å fikse.

### Annen port

Standardporten er **4050**. For en annen port:

```bash
PORT=8080 npm start         # macOS / Linux
```
```powershell
$env:PORT=8080; npm start   # Windows PowerShell
```

### Feilsøking

<a id="windows-npmps1-kan-ikke-kjores-skript-er-avslatt"></a>

- **Windows: `npm.ps1 cannot be loaded because running scripts is disabled on
  this system` (`PSSecurityException` / `UnauthorizedAccess`)**

  Det er ikke noe galt med prosjektet. Windows leveres med PowerShell-skript
  avslått (`Restricted`), npm installerer seg selv som et PowerShell-skript
  (`npm.ps1`), og PowerShell velger den filen framfor `npm.cmd`. Det er også
  derfor `node -v` virker mens `npm` ikke gjør det — `node.exe` er et ekte
  program, ikke et skript.

  **Løsningen, én linje.** Åpne et **vanlig** PowerShell-vindu — du trenger
  **ikke** «Kjør som administrator», fordi `-Scope CurrentUser` bare skriver til
  dine egne brukerinnstillinger:

  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

  Svar `Y` på spørsmålet. Endringen gjelder umiddelbart — ingen omstart
  nødvendig. Sjekk og fortsett:

  ```powershell
  Get-ExecutionPolicy -Scope CurrentUser   # → RemoteSigned
  npm install
  npm start
  ```

  > Ikke dropp `-Scope CurrentUser`. Uten den gjelder kommandoen hele maskinen,
  > og *da* trengs administratorrettigheter — den feiler med «access denied».
  > Det er den feilen som får de fleste guider til å be deg kjøre PowerShell som
  > administrator. Det trenger du altså ikke.

  **`RemoteSigned`** er riktig nivå: lokalt installerte skript som `npm.ps1`
  kjører, mens en `.ps1` du laster ned fra nettet eller får på e-post fortsatt
  blir stoppet. Ikke bruk `Unrestricted` eller varig `Bypass` — de fjerner den
  beskyttelsen uten å gi deg noe ekstra her.

  **Vil du helst ikke endre noen innstilling?** Hvilken som helst av disse virker
  i stedet:

  ```powershell
  npm.cmd install          # .cmd-fila er ikke et PowerShell-skript
  ```
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass   # kun dette vinduet
  ```
  Eller bruk **Ledetekst / Command Prompt** (Start → skriv `cmd` → Enter) i
  stedet for PowerShell — der virker alle kommandoene i denne README-en
  uendret. I VS Code: `Ctrl + Shift + P` → *Terminal: Select Default Profile* →
  **Command Prompt**.

  **Fortsatt blokkert, men nå med «npm.ps1 is not digitally signed»?** Enten
  styrer arbeidsgiveren dette med Group Policy — kjør `Get-ExecutionPolicy -List`,
  og er `MachinePolicy` eller `UserPolicy` noe annet enn `Undefined`, må du be
  IT om hjelp, for da vinner ingenting du setter lokalt — eller så er filen
  merket som nedlastet, og da rydder
  `Unblock-File -Path "C:\Program Files\nodejs\npm.ps1"` opp (den trenger et
  administratorvindu, siden den skriver inne i `Program Files`).

- **`node: command not found` / `npm: command not found`** → Node er ikke i PATH
  i denne terminaløkten. Installer Node via **macOS .pkg** (over), og **avslutt
  Terminal helt (Cmd + Q) og åpne på nytt**. Du trenger ikke installere Node hver
  gang — når det først er installert, blir det værende.
  - Hvis det fortsatt feiler, har du trolig **nvm**. Legg disse linjene nederst i
    `~/.zshrc`, kjør `nvm alias default 20`, og åpne en ny terminal:
    ```bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    ```
  - Rask engangsløsning (nvm): `source ~/.nvm/nvm.sh && nvm use 20 && npm start`
- **Puppeteer klarer ikke å starte nettleseren** → den innebygde Chromium kan
  henge etter helt nye OS-versjoner. Serveren faller automatisk tilbake til en
  installert Google Chrome på macOS. Du kan også peke på en hvilken som helst
  Chrome/Chromium:
  ```bash
  PUPPETEER_EXECUTABLE_PATH="/sti/til/chrome" npm start
  ```
- **Porten er opptatt** → start på en annen port (se over).
- **«sharp mangler» ved oppstart / i Innstillinger** → det valgfrie
  bildebiblioteket ble ikke installert. Alt virker fortsatt, men 200 KB-grensen
  og ekstra skarphet er av. Kjør `npm install` på nytt; fortsetter det å feile,
  kjør `npm install sharp` alene for å se den egentlige feilmeldingen.

---

## HTML5 til Campaign Manager 360

Under **Nedlastingstype** velger du **HTML5 · Campaign Manager 360** og fyller
inn **klikk-lenken** (landingssiden). I stedet for å flate banneret ut til piksler
eksporteres det som en ekte nettside: overskriften forblir levende tekst, så den
er skarp på enhver skjerm og enhver oppløsning, og hele kreativen veier langt
mindre enn bildeversjonen.

Du får **én opplastingsklar ZIP per format** — én ZIP er én CM360-kreativ:

```
test-desktop-580x500.zip
├── index.html                         ← hovedfilen, i roten
├── image.jpg                          ← fotoet
└── fonts/
    ├── arimo-latin-400-normal.woff2
    └── arimo-latin-700-normal.woff2
```

`index.html` inneholder de to tingene Campaign Manager 360 ser etter:

```html
<meta name="ad.size" content="width=580,height=500">
<script type="text/javascript">
  var clickTag = "https://www.norsk-tipping.no/...";
</script>
```

Utgangen følger Googles dokumenterte mønster,
`<a href="javascript:window.open(window.clickTag)">`, slik at Campaign Manager
360 bytter ut URL-en med sin egen sporingslenke når annonsen kjører. Verdien du
skriver inn i appen er standardverdien, og det forhåndsvisningen åpner. Et lite
skript gjør deretter lenken om til den ekte clickTag-URL-en (`target="_blank"`),
lest på nytt ved hver interaksjon, slik at høyreklikk → «Åpne link i ny fane» og
midtklikk også fungerer — nettlesere blokkerer `javascript:`-lenker der, og
Chrome viser `about:blank#blocked`.

Velger du flere formater, får du en ytre ZIP med de opplastingsklare ZIP-ene, en
mappe `reservebilder/` med ett reservebilde per format, og en `LES-MEG.txt`.
**Pakk ut den ytre ZIP-en og last opp ZIP-ene inni** — Campaign Manager 360 vil
ha hver kreativ som sin egen ZIP. Reservebilder lastes opp for seg i CM360; de
ligger bevisst utenfor kreativ-ZIP-en, fordi Google ikke tillater dem der.

Velger du bare ett format, *er* nedlastingen selve kreativ-ZIP-en, klar til
opplasting som den er. Reservebildet finner du som den tilsvarende filen under
**Historikk → Bilder**.

**Oppløsning** er skjult i HTML5-modus: en HTML5-kreativ vises alltid i sin
`ad.size`, og reservebildene må bli værende i 1× for at målene skal stemme med
kreativen.

Sett målene på kreativen i CM360 nøyaktig likt formatet (580 × 500 osv.) —
kreativen, `ad.size`-taggen og reservebildet må alle stemme overens.

Campaign Manager 360 kontrollerer ZIP-en ved opplasting og sier fra om noe er
galt; det er den sjekken du skal stole på. Googles frittstående HTML5-validator
(`h5validator.appspot.com/dcm/asset`) ble varslet utfaset i april 2025 — den
svarer kanskje fortsatt, men ikke bygg rutinen din på den.

---

## Filstørrelse og kvalitet

Annonseserverne har en grense på **200 KB per fil**, og en tapsfri PNG av et
detaljert foto sprenger den med god margin. Derfor går hver rendring gjennom et
budsjett:

1. **Tapsfri PNG** hvis den får plass — ingenting kastes.
2. **PNG med 256 farger** hvis *den* får plass — fortsatt helt skarp på teksten.
3. **JPEG** (mozjpeg, 4:4:4-krominans) på den høyeste kvaliteten som får plass,
   funnet med binærsøk i stedet for et fast tall.

Størrelsesgrensen går foran formatet du valgte: en PNG som ikke kommer under
grensen lagres som JPEG i stedet, og appen sier fra under nedlastingsknappen,
sammen med den faktiske størrelsen på hver fil. 4:4:4 er viktig her — standard
4:2:0, som de fleste kodere bruker, er nettopp det som smører ut liten farget
tekst og Norsk Tipping-merket.

**Auto** sammenligner de to og tar den minste: PNG på flate flater, der den er
både mindre og skarpere, og JPEG på foto, der tapsfritt koster flere ganger så
mange byte uten at du ser forskjell.

Standardgrensen endres (eller slås av med `0`) under **Innstillinger →
Eksport**, og et enkelt format kan få sin egen grense under **Egne grenser per
format** rett under — et 190×190-bilde og et 980×300-toppbanner handles ikke
under samme vektgrense, så ett globalt tall er enten for stramt for de store
formatene eller meningsløst for de små. En tom rad arver standarden; `0` betyr
ingen grense for det formatet. Grensen følger *størrelsen*, så ReadPeak 308×380
deler én grense mellom Norsk Tipping- og ReadPeak-produktet.

En HTML5-pakke har et gulv bildeeksporten ikke har: to woff2-skrifter pluss
markupen veier ~40 KB før bildet er med. En grense under det kan ikke innfris,
og appen sier fra på filen i stedet for å levere en pakke som stille bryter
grensen.

**Ekstra skarphet** rendrer hvert banner i 2× og skalerer det ned med en
Lanczos-3-kjerne. Chrome skalerer et stort kildefoto inn i den lille
bannerrammen med et billig filter; å skalere ordentlig er det som tetter
kvalitetsgapet. Det koster noen sekunder per runde og kan skrus av i
Innstillinger.

**Oppløsning** (1× / 1,5× / 2×) er en egen kontroll: **1× er den faktiske
annonsestørrelsen**, og det er den du laster opp. De større er for
retina-plasseringer og gjenbruk andre steder. Størrelsesgrensen gjelder det du
faktisk lager, så velger du 2×, vil du som regel heve eller slå av grensen.

---

## Publisere prosjektet til GitHub

Du oppretter et repo som heter **`banner-generator`** under kontoen din. På
GitHub-siden «Create a new repository»:

- **Add a README file → slå AV.** Prosjektet har allerede en README; lager GitHub
  også en, får du konflikt ved første push.
- **Add .gitignore → «No .gitignore».** Prosjektet har allerede en `.gitignore`.
- **Add license → «No license».** ⚠️ Viktig: prosjektet bruker en **egen lisens**
  (se `LICENSE`). Velger du MIT/Apache osv. her, legger GitHub til en *annen*
  `LICENSE`-fil som motsier vår. La det stå på **No license** — vår `LICENSE`
  ligger allerede i repoet og vises av GitHub.

Push deretter prosjektet (kjør inne i `banner-generator`-mappen):

```bash
git init
git add .
git commit -m "Initial commit: Banner Generator"
git branch -M main
git remote add origin https://github.com/legolasanti/banner-generator.git
git push -u origin main
```

> Hvis du *likevel* opprettet repoet med en README på GitHub, kjør
> `git pull --rebase origin main` én gang før `git push`.

---

## Lisens & kreditt

Dette prosjektet er **kildeåpent, men ikke fritt videredistribuerbart**. Alle
lisensrettigheter tilhører **Abraham Ceviz**; **ABC Nyheter** kan bruke det fritt;
andre kan lese og kjøre det lokalt, men kan **ikke** selge det eller distribuere
endrede versjoner. Se [`LICENSE`](LICENSE) for de fullstendige vilkårene.

Laget med hjerte, humor og altfor mye kaffe ☕ av
**[Abraham Ceviz](https://www.linkedin.com/in/abrahamceviz/)**.
