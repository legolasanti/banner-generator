# Banner Generator

🇬🇧 English · [🇳🇴 Norsk](README.no.md)

An internal tool that turns **one photo + a few text fields into three ad banners
at once**, then downloads them as a ZIP of PNGs. It replaces the manual Canva
workflow. Built for the ABC Nyheter / Norsk Tipping banner format.

| Format       | Size       | Use                |
| ------------ | ---------- | ------------------ |
| **ReadPeak** | 308 × 380  | ReadPeak widget    |
| **Desktop**  | 580 × 500  | Desktop ad         |
| **Mobile**   | 320 × 400  | Mobile ad          |

## Features

- 🖼️ **Upload or fetch by URL** — drag & drop / pick a file, **or paste an image
  link** (great for AVIF images from Norsk Tipping). Accepts JPG, PNG, WEBP,
  AVIF, GIF. Output is always lossless PNG.
- ✂️ **Drag-to-reframe + zoom** — position the photo and zoom in up to 30 %; the
  crop preview matches the real cropped image area.
- ⚡ **Live preview** — the three banners update as you type and are rendered by
  the *same* code that produces the final PNG, so the preview is faithful.
- 🔠 **Adjustable text size** for headline & subtitle, plus **Les mer as a button
  or plain text**, and a **colour picker** for "Les mer" + "NORSK TIPPING".
- 🕘 **History** of the last 30 packages (re-download / delete).
- ⚙️ **Settings** — editable game-type presets, badge text, logo and export
  options.
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

### Running on a different port

The default port is **4050**. To use another port:

```bash
PORT=8080 npm start        # macOS / Linux
```
```powershell
$env:PORT=8080; npm start  # Windows PowerShell
```

### Troubleshooting

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
├── templates/             Puppeteer templates → produce the final PNGs
│   ├── readpeak.html
│   ├── desktop.html
│   ├── mobile.html
│   └── _render.js         Shared init (signals "ready to screenshot")
├── public/
│   ├── index.html         App UI
│   ├── style.css          App styling (chrome only)
│   ├── app.js             Frontend logic
│   └── assets/
│       ├── banner.css     ┐ ONE source of truth for the banner look —
│       ├── banner.js      ┘ used by BOTH the templates and the live preview
│       ├── fonts/         Bundled Arimo (Arial-compatible)
│       ├── hjelpelinjen-logo.png
│       └── placeholder.svg
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
| `POST /api/generate`             | Multipart: image + fields → streams a ZIP of 3 PNGs  |
| `POST /api/fetch-image`          | `{url}` → fetches an image from a link (SSRF-guarded)|
| `GET  /api/history`              | List of the last 30 packages                         |
| `GET  /api/history/:id/download` | Re-download a previous package                       |
| `DELETE /api/history/:id`        | Delete a package                                     |
| `GET  /api/settings`             | Read settings                                        |
| `POST /api/settings`             | Save settings                                        |
| `POST /api/settings/logo`        | Upload a new logo                                    |
| `GET  /api/health`               | Status (browser connected?)                          |

`POST /api/generate` fields: `image` (file, max 10 MB, JPG/PNG/WEBP/AVIF/GIF),
`headline`, `subtitle`, `brandLabel`, `vinnersjanse` (empty = badge hidden),
`imagePositionX`/`imagePositionY` (0–100), `imageZoom` (0–30), `headlineScale`
& `subtitleScale` (0.5–2), `lesMerStyle` (`button` | `text`), `accentColor`
(hex), `filename`, `jpegQuality`.

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
