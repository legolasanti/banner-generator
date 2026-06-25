# Banner Generator

[🇬🇧 English](README.md) · 🇳🇴 Norsk

Et internt verktøy som gjør **ett bilde + noen tekstfelt om til tre annonse­bannere
på én gang**, og laster dem ned som en ZIP med PNG-er. Det erstatter den manuelle
Canva-flyten. Laget for ABC Nyheter / Norsk Tipping-formatet.

| Format       | Størrelse  | Bruk               |
| ------------ | ---------- | ------------------ |
| **ReadPeak** | 308 × 380  | ReadPeak-widget    |
| **Desktop**  | 580 × 500  | Desktop-annonse    |
| **Mobil**    | 320 × 400  | Mobil-annonse      |

## Funksjoner

- 🖼️ **Last opp eller hent fra lenke** — dra og slipp / velg fil, **eller lim inn
  en bildelenke** (nyttig for AVIF-bilder fra Norsk Tipping). Godtar JPG, PNG,
  WEBP, AVIF, GIF. Utdata er alltid tapsfri PNG.
- ✂️ **Dra for å beskjære + zoom** — plasser bildet og zoom inn opptil 30 %;
  beskjæringsvinduet matcher det faktiske bildeområdet.
- ⚡ **Live forhåndsvisning** — de tre bannerne oppdateres mens du skriver og
  rendres av *samme* kode som lager den endelige PNG-en, så forhåndsvisningen er
  tro mot resultatet.
- 🔠 **Justerbar tekststørrelse** for overskrift og ingress, **Les mer som knapp
  eller ren tekst**, og en **fargevelger** for «Les mer» + «NORSK TIPPING».
- 🕘 **Historikk** over de siste 30 pakkene (last ned på nytt / slett).
- ⚙️ **Innstillinger** — redigerbare spilltyper, merketekst, logo og eksport.
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

### Annen port

Standardporten er **4050**. For en annen port:

```bash
PORT=8080 npm start         # macOS / Linux
```
```powershell
$env:PORT=8080; npm start   # Windows PowerShell
```

### Feilsøking

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
