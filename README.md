# Banner Generator

🇬🇧 English · [🇳🇴 Norsk](README.no.md)

An internal tool that turns **one photo + a few text fields into four ad banners
at once**, then downloads them as a ZIP — either as images or as
upload-ready **Campaign Manager 360 HTML5 packages**. It replaces the manual
Canva workflow. Built for the ABC Nyheter / Norsk Tipping banner format.

| Format        | Size       | Use                  |
| ------------- | ---------- | -------------------- |
| **ReadPeak**  | 308 × 380  | ReadPeak widget      |
| **Desktop**   | 580 × 500  | Desktop ad           |
| **Mobile**    | 320 × 400  | Mobile ad            |
| **Nyhetsgrid**| 190 × 190  | Front-page news grid |

## Features

- 🖼️ **Upload or fetch by URL** — drag & drop / pick a file, **or paste an image
  link** (great for AVIF images from Norsk Tipping). Accepts JPG, PNG, WEBP,
  AVIF, GIF. Output is lossless PNG, or JPEG when a banner would otherwise
  break the size limit.
- ✂️ **Drag-to-reframe + zoom** — position the photo and zoom in up to 30 %; the
  crop preview matches the real cropped image area.
- ⚡ **Live preview** — the three banners update as you type and are rendered by
  the *same* code that produces the final PNG, so the preview is faithful.
- 🔠 **Adjustable text size** for headline & subtitle, plus **Les mer as a button
  or plain text**, and a **colour picker** for "Les mer" + "NORSK TIPPING".
- 📦 **HTML5 export for Campaign Manager 360** — one upload-ready ZIP per format,
  with the headline kept as **live text** (razor sharp on every screen) and the
  landing page wired up as a `clickTag`. See
  [HTML5 for Campaign Manager 360](#html5-for-campaign-manager-360).
- 🪶 **200 KB size budget** — every file is squeezed to fit the ad server's
  per-file limit, and the app tells you the size it landed on.
- 🔍 **Extra sharpness** — banners render at 2× and are resampled down with
  Lanczos-3, which removes the softness a straight 1× render leaves in the photo.
- 🕘 **History** of the last 30 packages (re-download / delete).
- ⚙️ **Settings** — editable game-type presets, badge text and mark, size limit
  and export options.
- 🔤 **Bundled font (Arimo)** so the preview and the downloaded PNG look identical
  on every platform, including Linux servers.

---

## Requirements

- **Node.js 20 or newer** — <https://nodejs.org>
  On macOS, download the **"macOS Installer (.pkg)"** (not the `.tar.gz`) and run
  it through to the end. You only need to do this **once** — it stays available.
- **Git** (only needed to clone from GitHub) — <https://git-scm.com>

`npm install` also downloads a copy of Chromium for Puppeteer (~150 MB), so the
first install needs an internet connection and a few minutes.

It also installs **sharp**, which does the resampling and the size budgeting.
sharp ships as a prebuilt binary, so it normally installs without any build
tools. It is an *optional* dependency on purpose: if it ever fails to install,
`npm install` still succeeds and the app still runs — it just falls back to
plain rendering, turns off the size limit, and says so on startup and in
Settings.

> **Important:** after installing Node, **fully quit Terminal (Cmd + Q) and open
> it again.** A new PATH only takes effect in a new terminal session — this is
> the #1 reason `npm`/`node` seem "not found" right after installing.

---

## Quick start

```bash
git clone https://github.com/legolasanti/banner-generator.git
cd banner-generator
npm install          # installs dependencies + downloads Chromium
npm start            # starts the server
```

Then open **<http://localhost:4050>** in your browser.

For development with auto-restart on file changes:

```bash
npm run dev
```

---

## Setting it up on another computer (step by step)

Anyone who wants to run this on their own machine can follow these steps.

1. **Install Node.js 20 or newer**
   - Go to <https://nodejs.org> and download the **LTS** version.
   - On macOS, choose the **"macOS Installer (.pkg)"** — **not** the `.tar.gz`.
   - Open the downloaded `.pkg` and run it to the end (Continue → Install).
   - **Fully quit Terminal (Cmd + Q) and open it again** — the new PATH only
     applies to a new terminal session.
   - Verify:
     ```bash
     node -v      # should print v20.x or newer
     npm -v       # should print 10.x or similar
     ```
   - You install Node **once**; it then works in every new terminal. You do
     **not** need to reinstall it each time.
   - If `node`/`npm` are still "command not found" after this, the machine
     probably has **nvm**. Fix it once with `nvm alias default 20` and make sure
     `~/.zshrc` loads nvm (see Troubleshooting), then open a new terminal.

2. **Install Git** (if not already installed) from <https://git-scm.com>.

3. **Clone the project from GitHub**
   ```bash
   git clone https://github.com/legolasanti/banner-generator.git
   cd banner-generator
   ```
   (Or download the repo as a ZIP from GitHub and unzip it, then `cd` into the
   folder.)

4. **Install dependencies** (this also downloads Chromium):
   ```bash
   npm install
   ```

5. **Run it**
   ```bash
   npm start
   ```
   You should see:
   ```
   Banner Generator kjører på  http://localhost:4050
   ```

6. **Open the app** at <http://localhost:4050>.

7. **Stop the server** with `Ctrl + C` in the terminal.

### On Windows

Same steps, with one Windows-only speed bump. Install Node from
<https://nodejs.org> (the **LTS** Windows Installer `.msi`), **close every
terminal window and open a new one**, then:

```powershell
git clone https://github.com/legolasanti/banner-generator.git
cd banner-generator
npm install
npm start
```

If `npm install` fails with **"npm.ps1 cannot be loaded because running scripts
is disabled on this system"**, jump to
[npm.ps1 cannot be loaded](#windows-npmps1-cannot-be-loaded-running-scripts-is-disabled)
below — it takes one command to fix.

### Running on a different port

The default port is **4050**. To use another port:

```bash
PORT=8080 npm start        # macOS / Linux
```
```powershell
$env:PORT=8080; npm start  # Windows PowerShell
```

### Troubleshooting

<a id="windows-npmps1-cannot-be-loaded-running-scripts-is-disabled"></a>

- **Windows: `npm.ps1 cannot be loaded because running scripts is disabled on
  this system` (`PSSecurityException` / `UnauthorizedAccess`)**

  Nothing is wrong with the project. Windows ships with PowerShell script
  execution switched off (`Restricted`), npm installs itself as a PowerShell
  script (`npm.ps1`), and PowerShell prefers that file over `npm.cmd`. That is
  also why `node -v` works while `npm` doesn't — `node.exe` is a real program,
  not a script.

  **The one-line fix.** Open a **normal** PowerShell window — you do **not**
  need "Run as administrator", because `-Scope CurrentUser` only writes to your
  own user settings:

  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

  Answer `Y` at the prompt. The change takes effect immediately — no restart
  needed. Check it and carry on:

  ```powershell
  Get-ExecutionPolicy -Scope CurrentUser   # → RemoteSigned
  npm install
  npm start
  ```

  > Do not drop the `-Scope CurrentUser` part. Without it the command targets
  > the whole machine, which *does* need administrator rights, and it fails with
  > an access-denied error. That failure is why so many guides tell you to run
  > PowerShell as administrator — you don't have to.

  **`RemoteSigned`** is the right setting: locally installed scripts like
  `npm.ps1` run, while a `.ps1` you download from a website or get by email is
  still blocked. Don't use `Unrestricted` or a permanent `Bypass` — they remove
  that protection and buy you nothing extra here.

  **Don't want to change any setting?** Any one of these works instead:

  ```powershell
  npm.cmd install          # the .cmd shim isn't a PowerShell script
  ```
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass   # this window only
  ```
  Or just use **Command Prompt** (Start → type `cmd` → Enter) instead of
  PowerShell, where every command in this README works unchanged. In VS Code:
  `Ctrl + Shift + P` → *Terminal: Select Default Profile* → **Command Prompt**.

  **Still blocked, but now with "npm.ps1 is not digitally signed"?** Either your
  workplace enforces the policy through Group Policy — run
  `Get-ExecutionPolicy -List`, and if `MachinePolicy` or `UserPolicy` is
  anything other than `Undefined`, ask IT, because nothing you set locally will
  win — or the file is flagged as downloaded, which
  `Unblock-File -Path "C:\Program Files\nodejs\npm.ps1"` clears (that one needs
  an administrator window, since it writes inside `Program Files`).

- **`node: command not found` / `npm: command not found`** → Node isn't on your
  PATH in this terminal session. Install Node via the **macOS .pkg** (above),
  then **quit Terminal completely (Cmd + Q) and reopen it**. You do not need to
  reinstall Node every time — once it's installed it persists.
  - If it still fails, you likely have **nvm**. Add these lines to the end of
    `~/.zshrc`, then run `nvm alias default 20` and open a new terminal:
    ```bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    ```
  - Quick one-off (nvm): `source ~/.nvm/nvm.sh && nvm use 20 && npm start`
- **Puppeteer fails to launch the browser** → the bundled Chromium can lag very
  new OS versions. The server automatically falls back to a system-installed
  Google Chrome on macOS. You can also point it at any Chrome/Chromium:
  ```bash
  PUPPETEER_EXECUTABLE_PATH="/path/to/chrome" npm start
  ```
- **Port already in use** → start it on another port (see above).
- **"sharp is missing" on startup / in Settings** → the optional image library
  didn't install. Everything still works, but the 200 KB budget and the extra
  sharpness pass are off. Run `npm install` again; if it keeps failing, run
  `npm install sharp` on its own to see the real error.

---

## HTML5 for Campaign Manager 360

Under **Nedlastingstype**, pick **HTML5 · Campaign Manager 360** and fill in the
**click link** (the landing page). Instead of flattening the banner into pixels,
this exports it as an actual web page: the headline stays live text, so it is
sharp on any screen and any DPI, and the whole creative weighs far less than the
image version.

You get **one upload-ready ZIP per format** — one ZIP is one CM360 creative:

```
test-desktop-580x500.zip
├── index.html                         ← primary file, at the root
├── image.jpg                          ← the photo
└── fonts/
    ├── arimo-latin-400-normal.woff2
    └── arimo-latin-700-normal.woff2
```

`index.html` carries the two things CM360 looks for:

```html
<meta name="ad.size" content="width=580,height=500">
<script type="text/javascript">
  var clickTag = "https://www.norsk-tipping.no/...";
</script>
```

The exit is Google's documented pattern,
`<a href="javascript:window.open(window.clickTag)">`, so CM360 replaces the URL
with its own tracking link when the ad runs. The value you type in the app is
the default and what the preview opens.

Pick more than one format and you get an outer ZIP containing the ready-to-upload
ZIPs, a `reservebilder/` folder with a backup image per format, and a Norwegian
`LES-MEG.txt`. **Extract the outer ZIP and upload the inner ZIPs** — CM360 wants
each creative as its own ZIP. Backup images are uploaded separately in CM360;
they are deliberately kept out of the creative ZIP, because Google forbids them
there.

Pick a single format and the download *is* the creative ZIP, ready to upload as
it stands. Its backup image is the matching file under **Historikk → Bilder**.

The **Oppløsning** control is hidden in HTML5 mode: an HTML5 creative always
serves at its `ad.size`, and the backup images have to stay at 1× so their
dimensions match the creative.

Set the creative's dimensions in CM360 to exactly match the format
(580 × 500 etc.) — the creative, the `ad.size` tag and the backup image all have
to agree.

CM360 validates the ZIP on upload and reports anything it does not like, which
is the check to rely on. Google's standalone HTML5 validator
(`h5validator.appspot.com/dcm/asset`) was announced for deprecation in April
2025 — it may still answer, but do not build a workflow on it.

---

## File size and quality

Ad servers cap these banners at **200 KB per file**, and a lossless PNG of a
detailed photo blows straight past that. So every render goes through a budget:

1. **Lossless PNG** if it fits — nothing is thrown away.
2. **256-colour PNG** if that fits — still perfectly sharp on the text.
3. **JPEG** (mozjpeg, 4:4:4 chroma) at the highest quality that fits, found by
   binary search rather than a fixed number.

The size limit outranks the format you picked: a PNG that cannot be squeezed
under the limit is saved as JPEG instead, and the app says so under the download
button along with each file's real size. 4:4:4 chroma matters here — the default
4:2:0 that most encoders use is what smears small coloured text and the Norsk
Tipping mark.

**Auto** compares the two and takes the smaller: PNG on flat artwork, where it
is both smaller and sharper, JPEG on a photo, where lossless costs several times
the bytes for no visible gain.

Change the limit (or switch it off with `0`) under **Innstillinger → Eksport**.

**Extra sharpness** renders each banner at 2× and resamples it down with a
Lanczos-3 kernel. Chrome scales a large source photo into the small banner frame
with a cheap filter; resampling properly is what closes the quality gap. It
costs a few seconds per batch and can be turned off in Settings.

**Resolution** (1× / 1,5× / 2×) is a separate control: **1× is the actual ad
size** and what you upload. The larger options are for retina placements and
reuse elsewhere. The size limit applies to whatever you produce, so if you pick
2× you will usually want to raise or disable it.

---

## Publishing this project to GitHub

You're creating a repo named **`banner-generator`** under your account. On the
GitHub "Create a new repository" page:

- **Add a README file → turn it OFF.** This project already ships a README; if
  GitHub creates one too you'd get a conflict on the first push.
- **Add .gitignore → "No .gitignore".** This project already includes a
  `.gitignore`.
- **Add license → "No license".** ⚠️ Important: this project uses a **custom
  license** (see `LICENSE`). If you pick MIT/Apache/etc. here, GitHub adds a
  *different* `LICENSE` file that contradicts ours. Leave it as **No license** —
  our `LICENSE` file is already in the repo and GitHub will display it.

Then push the local project (run these inside the `banner-generator` folder):

```bash
git init
git add .
git commit -m "Initial commit: Banner Generator"
git branch -M main
git remote add origin https://github.com/legolasanti/banner-generator.git
git push -u origin main
```

> If you *did* create the repo with a README on GitHub, run
> `git pull --rebase origin main` once before `git push`, or push to an empty
> repo created without a README.

After this, anyone can clone it with the command in **Quick start** above.

---

## Project structure

```
banner-generator/
├── server.js              Express API + Puppeteer (one shared browser, queue)
├── settings.json          Created automatically on first run
├── lib/
│   ├── image.js           Downscaling + the per-file byte budget (sharp)
│   └── html5.js           Campaign Manager 360 package builder
├── templates/             Puppeteer templates → produce the final banners
│   ├── readpeak.html
│   ├── desktop.html
│   ├── mobile.html
│   ├── newsgrid.html
│   └── _render.js         Shared init (signals "ready to screenshot")
├── public/
│   ├── index.html         App UI
│   ├── style.css          App styling (chrome only)
│   ├── app.js             Frontend logic
│   └── assets/
│       ├── banner.css     ┐ ONE source of truth for the banner look —
│       ├── banner.js      ┘ used by BOTH the templates and the live preview
│       ├── fonts/         Bundled Arimo (Arial-compatible)
│       ├── norsktipping-icon.svg   The mark in the 18+ badge
│       └── placeholder.svg
├── test/                  node --test suites (npm test)
├── references/            Source artwork + real ads to compare against
├── history/               Saved packages (max 30)
├── uploads/               Reserved (uploads are handled in memory)
├── LICENSE
├── README.md / README.no.md
└── package.json
```

**Why the live preview is accurate:** both the downloadable banners and the
in-app preview are rendered by the *same* `banner.css` + `banner.js`. Change the
look in one place and both change — the preview is a faithful copy of the result.

---

## API

| Method + path                    | Description                                          |
| -------------------------------- | ---------------------------------------------------- |
| `POST /api/generate`             | Multipart: image + fields → streams the download      |
| `POST /api/fetch-image`          | `{url}` → fetches an image from a link (SSRF-guarded)|
| `GET  /api/history`              | List of the last 30 packages                         |
| `GET  /api/history/:id/download` | Re-download a package — `?set=core\|newsgrid\|all`, `&type=html` |
| `DELETE /api/history/:id`        | Delete a package                                     |
| `GET  /api/settings`             | Read settings (+ `ageIcon`, `imageTools`, read-only) |
| `POST /api/settings`             | Save settings                                        |
| `POST /api/settings/badge-icon`  | Replace the mark in the 18+ badge (PNG/JPG)          |
| `DELETE /api/settings/badge-icon`| Go back to the built-in mark                         |
| `GET  /api/health`               | Status (browser connected?)                          |

All four formats are rendered and saved on every generate; `downloadSet` only
picks what the response streams. Writes are rejected when they arrive with a
foreign `Origin`.

`POST /api/generate` fields: `image` (file, max 10 MB, JPG/PNG/WEBP/AVIF/GIF),
`headline`, `subtitle`, `brandLabel`, `vinnersjanse` (empty = badge hidden),
`showVinnerOnNewsgrid`, `imagePositionX`/`imagePositionY` (0–100), `imageZoom`
(0–30), `headlineScaleReadpeak`/`Desktop`/`Mobile`/`Newsgrid` &
`subtitleScale` (0.5–2), `lesMerStyle` (`button` | `text`), `lesMerSize`,
`accentColor` (hex), `resolution` (1 | 1.5 | 2), `format`
(`png` | `jpeg` | `auto`), `filename`, `downloadSet`
(`all` | `core` | `newsgrid`), `outputType` (`image` | `html`) and — required
for `html` — `clickUrl`.

The response carries `X-Entry-Id` and `X-Banner-Report`: a URI-encoded JSON
array with each format's filename, pixel size, byte size and any note (for
example a PNG that had to become a JPEG to make the size limit).

---

## Deployment (multi-user)

This is a plain Node app and can be deployed to **Railway** or **Render** by
connecting the GitHub repo:

- Build: `npm install`
- Start: `npm start`
- The app reads `process.env.PORT`.

Puppeteer needs Chromium's system libraries. On a "missing shared libraries"
error, use an image with Chrome dependencies installed, or set
`PUPPETEER_EXECUTABLE_PATH` to an installed Chrome. The banner font is bundled,
so no font installation is required.

---

## License & credits

This project is **source-available, not open-source-redistributable**. All
license rights belong to **Abraham Ceviz**; **ABC Nyheter** may use it freely;
others may read and run it locally but may **not** sell it or distribute modified
versions. See [`LICENSE`](LICENSE) for the full terms.

Made with heart, humour and far too much coffee ☕ by
**[Abraham Ceviz](https://www.linkedin.com/in/abrahamceviz/)**.
