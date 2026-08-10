# Banner Generator

[🇬🇧 English](README.md) · 🇳🇴 Norsk

Et internt verktøy som gjør **ett bilde + noen tekstfelt om til fire
annonse­bannere på én gang**, og laster dem ned som en ZIP — enten som bilder
eller som opplastingsklare **HTML5-pakker til Campaign Manager 360**. Det
erstatter den manuelle Canva-flyten. Laget for ABC Nyheter / Norsk
Tipping-formatet.

| Format         | Størrelse  | Bruk                |
| -------------- | ---------- | ------------------- |
| **ReadPeak**   | 308 × 380  | ReadPeak-widget     |
| **Desktop**    | 580 × 500  | Desktop-annonse     |
| **Mobil**      | 320 × 400  | Mobil-annonse       |
| **Nyhetsgrid** | 190 × 190  | Nyhetsgrid på forsiden |

## Funksjoner

- 🖼️ **Last opp eller hent fra lenke** — dra og slipp / velg fil, **eller lim inn
  en bildelenke** (nyttig for AVIF-bilder fra Norsk Tipping). Godtar JPG, PNG,
  WEBP, AVIF, GIF. Utdata er tapsfri PNG, eller JPEG hvis banneret ellers ville
  sprengt størrelsesgrensen.
- ✂️ **Dra for å beskjære + zoom** — plasser bildet og zoom inn opptil 30 %;
  beskjæringsvinduet matcher det faktiske bildeområdet.
- ⚡ **Live forhåndsvisning** — de tre bannerne oppdateres mens du skriver og
  rendres av *samme* kode som lager den endelige PNG-en, så forhåndsvisningen er
  tro mot resultatet.
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
- 🔤 **Innebygd skrift (Arimo)** slik at forhåndsvisning og nedlastet PNG ser helt
  like ut på alle plattformer, også Linux-servere.

---

## Krav

- **Node.js 20 eller nyere** — <https://nodejs.org>
  På macOS: last ned **«macOS Installer (.pkg)»** (ikke `.tar.gz`) og kjør den
  helt ferdig. Dette gjør du bare **én gang** — det blir værende.
- **Git** (kun for å klone fra GitHub) — <https://git-scm.com>

`npm install` laster også ned en Chromium-kopi til Puppeteer (~150 MB), så første
installasjon krever internett og noen minutter.

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
   Banner Generator kjører på  http://localhost:4050
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
skriver inn i appen er standardverdien, og det forhåndsvisningen åpner.

Velger du flere formater, får du en ytre ZIP med de opplastingsklare ZIP-ene, en
mappe `reservebilder/` med ett reservebilde per format, og en `LES-MEG.txt`.
**Pakk ut den ytre ZIP-en og last opp ZIP-ene inni** — Campaign Manager 360 vil
ha hver kreativ som sin egen ZIP. Reservebilder lastes opp for seg i CM360; de
ligger bevisst utenfor kreativ-ZIP-en, fordi Google ikke tillater dem der.

Sett målene på kreativen i CM360 nøyaktig likt formatet (580 × 500 osv.) —
kreativen, `ad.size`-taggen og reservebildet må alle stemme overens. Vil du
dobbeltsjekke en pakke før opplasting, tar Googles egen validator imot ZIP-en
direkte: <https://h5validator.appspot.com/dcm/asset>.

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

Grensen endres (eller slås av med `0`) under **Innstillinger → Eksport**.

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
