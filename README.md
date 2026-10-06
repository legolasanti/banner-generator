# ABC design

🇬🇧 English · [🇳🇴 Norsk](README.no.md)

ABC Nyheter's internal design tool, in two areas (switch at the top left):

- **Annonser** — turns **one photo + a few text fields into a whole set of ad
  banners at once**, then downloads them as a ZIP — either as images or as
  upload-ready **Campaign Manager 360 HTML5 packages**. It replaces the manual
  Canva workflow. Norsk Tipping, ReadPeak, Houseads, Bulk and Wallpaper live here.
- **Native Premium** — builds long-form advertiser content pages ("annonsørinnhold")
  like the ones ABC BrandStudio used to make in Vev: scroll storytelling, video,
  fact boxes, product cards, review links for the advertiser, ZIP export — and an
  **AI mode** that reads the Google Docs brief and the Drive folder, asks the few
  questions that matter and writes a first draft.
  See [Native Premium](#native-premium).

Three products, picked with the tabs at the top. Each has its own formats, its
own form fields and its own furniture on the banner:

### Norsk Tipping

The regulated placements: 18+/Hjelpelinjen mark and a Vinnersjanse strip.

| Format        | Size       | Use                  |
| ------------- | ---------- | -------------------- |
| **ReadPeak**  | 308 × 380  | ReadPeak widget      |
| **Desktop**   | 580 × 500  | Desktop ad           |
| **Mobile**    | 320 × 400  | Mobile ad            |
| **Nyhetsgrid**| 190 × 190  | Front-page news grid |

### ReadPeak

The same two ReadPeak placements sold to any advertiser — so **without** the
18+/Hjelpelinjen mark and **without** the Vinnersjanse strip. The green label
carries the advertiser's own name, and the call to action is editable ("Les mer
her", "Sjekk utvalget her", …).

| Format        | Size       | Use                  |
| ------------- | ---------- | -------------------- |
| **ReadPeak**  | 308 × 380  | ReadPeak widget      |
| **Nyhetsgrid**| 190 × 190  | Front-page news grid |

### Houseads

abc shopping's own formats: ANNONSE upper-left, the abc shopping mark
upper-right, white ground and a Noto Serif headline. Photo areas and type sizes
come from the approved Canva creatives.

| Format          | Size       | Headline                   |
| --------------- | ---------- | -------------------------- |
| **Mobil**       | 320 × 400  | Noto Serif 22 — 3 lines    |
| **Toppbanner**  | 980 × 300  | Noto Serif 31 — 3 lines, beside the photo |
| **Billboard**   | 980 × 500  | Noto Serif 36 — 4 lines, beside the photo |
| **Desktop**     | 580 × 500  | Noto Serif 26.5 — 2 lines  |
| **Skyskraper**  | 300 × 600  | Noto Serif 25.7 — 4 lines  |
| **Rektangel**   | 300 × 250  | Noto Serif 20 — 3 lines    |

The 300×250 arrived later and has no Canva original, so its proportions are
derived from the other four instead — same width and header type as the
skyscraper, and the largest headline that still leaves three lines inside 250px.
If a Canva version turns up, the numbers to match are in
`public/assets/formats.js` and the `.bn--house-rectangle` block of
`public/assets/banner.css`. The same goes for the 980×500: the toppbanner's
layout with a 520×420 photo, leaving the headline a column wide enough for long
Norwegian compound words.

### Bulk (Houseads from a spreadsheet)

The **Bulk** tab makes many Houseads at once: one spreadsheet row per banner,
every row in every chosen size, delivered as one ZIP.

1. **Bring the sheet in** — paste a Google Sheets link (the sheet must be
   shared as *Anyone with the link → Viewer*; a link to a specific tab uses
   that tab), upload an `.xlsx` / `.csv` / `.tsv`, or copy the cells in Sheets
   and paste them. *Last ned mal (CSV)* gives a ready template, and *Prøv med
   eksempeldata* loads a working example.
2. **Check** — every photo is fetched, every headline is sized per format, and
   each row says *Klar*, *Sjekk* or *Feil* with the reason (missing photo, dead
   link, a headline too long for a format, a word too long for one line, a
   photo too small for sharp output). Edit a headline in place, or *Juster* a
   row: drag the focus point on the photo, zoom, swap the photo, change weight,
   filename or click link, and set any format's size by hand.
3. **Download** — PNG, JPEG, Auto or HTML5 (CM360), 1×/1.5×/2×, and the ZIP
   laid out per size (`320x400/…`), per banner, or flat. The run happens in the
   background with progress and an estimate; it can be cancelled (finished
   banners are kept), and it lands in *Historikk*. Every ZIP holds
   `rapport.csv` (headline, size used and file size per file).

Rows with errors are skipped, never shipped broken. The work survives a reload
of the page.

**The sheet.** The first row names the columns; order does not matter and
other columns are ignored (Norwegian, English and Turkish names work).

| Column | Required | Example | Note |
| --- | --- | --- | --- |
| `Overskrift` | yes | Spar opptil 50 % på hotell i høst | |
| `Bildelenke` | yes | https://…/hotell.jpg | A direct image link. Google Drive and Dropbox share links work too. |
| `Filnavn` | no | hotell-host | Empty = made from the headline |
| `Skrift` | no | Halvfet / Normal | Empty = the run's choice |
| `Fokus` | no | topp · bunn venstre · 30/70 | Where to hold the crop. Empty = automatic |
| `Klikk-lenke` | no | https://www.abcnyheter.no/… | HTML5 only. Empty = the default set at download |

Helpful extras in the sheet: `=LEN(A2)` for a character count, `=IMAGE(C2)` to
see the photo. A demo sheet: *Houseads bulk – mal* (Google Sheets).

**Automatic crop.** The photo is held where its detail and colour are, pulled
toward the centre; for tall photos (usually a person) the upper third is kept,
so faces survive the wide formats. Switch it off with *Smart beskjæring*, set
`Fokus` in the sheet, or drag the point in *Juster*.

### Auto text size

Houseads headlines are sized per format from their length — short copy bigger
(up to 120 %), long copy smaller (down to 70 %) — and then **measured**: if the
text would be clipped or a word split, it steps down 5 % at a time. The
default rules were measured with ~60 real Norwegian shop headlines in every
format:

| Format | 120 % | 110 % | 100 % | 90 % | 80 % | 70 % (max) |
| --- | --- | --- | --- | --- | --- | --- |
| 320×400 | ≤ 26 | ≤ 40 | ≤ 64 | ≤ 74 | ≤ 82 | ~97 |
| 980×300 | ≤ 25 | ≤ 39 | ≤ 63 | ≤ 66 | ≤ 77 | ~85 |
| 980×500 | ≤ 25 | ≤ 40 | ≤ 65 | ≤ 73 | ≤ 78 | ~96 |
| 580×500 | ≤ 30 | ≤ 46 | ≤ 74 | ≤ 77 | ≤ 85 | ~116 |
| 300×600 | ≤ 25 | ≤ 40 | ≤ 65 | ≤ 73 | ≤ 78 | ~96 |
| 300×250 | ≤ 26 | ≤ 35 | ≤ 66 | ≤ 74 | ≤ 82 | ~97 |

(characters, spaces included). The rules are editable for everyone under
*Bulk → Tekststørrelse-regler*, which also has a test field. In the Houseads
tab each format's *Tekststørrelse* slider has an **Auto** switch; dragging a
slider makes that format manual. The export re-measures every Auto size in the
rendering browser before the screenshot, so a clipped headline cannot ship.

### Wallpaper

A full design editor (its own **Wallpaper** tab) for the two-part wallpaper
placement: a **1920 × 850 background** behind the whole page and a **1000 × 300
top banner** at the top of the content column. Designers build it right in the
browser — or upload a finished design and put live text and buttons on top.

| Artboard       | Size        | Safe area                         |
| -------------- | ----------- | --------------------------------- |
| **Bakgrunn**   | 1920 × 850  | 1280 × 700, centred, from the top |
| **Toppbanner** | 1000 × 300  | the whole banner                  |

- **Text** in 104 Google Fonts (every weight and italic the family has), size,
  line height, letter spacing, alignment, colour or gradient text, outline,
  underline/strike, capitals, and a text box with fill, padding and radius.
- **Shapes** — rectangle, rounded, circle/ellipse, triangle, diamond,
  pentagon, hexagon, star, offer burst, arrow, chevron, speech bubble, heart,
  frame — with fill (colour, linear/radial gradient or none), solid/dashed/
  dotted borders, corner radius, and text inside. Ready-made **buttons**.
- **Lines** — solid, dashed, dotted, with arrow/dot/bar ends.
- **Icons** — the full Lucide set (~1 850), searchable, recolourable.
- **Images** — upload, drag in, paste from the clipboard or fetch by link;
  crop (fill/fit/stretch), focus, zoom, flip, round corners or circle,
  border, and filters (brightness, contrast, saturation, greyscale, sepia,
  hue). "Import finished design" drops a complete PNG/JPG in as a locked
  bottom layer.
- **Effects** on everything: opacity, blur, drop shadow, blend mode, and a
  hover effect that comes alive in the HTML5 export.
- **Canvas**: move, resize (rotated elements resize in their own frame),
  rotate, marquee select, smart guides that snap to the artboard, the safe
  area, the page edges and other elements, alignment/distribution, layers
  (reorder, lock, hide, rename), undo/redo, copy/paste, keyboard nudging,
  zoom and pan.
- **Guides that never export**: the red safe-area frame and an overlay
  showing where the page covers the background — each can be switched off.
- **Quality check** flags what really goes wrong with this format: content
  partly outside the safe area, content hidden under the page, images blown
  up past their resolution, tiny text.
- **Site preview** at 1280/1440/1680/1920 px shows exactly how much of the
  sides each screen sees.
- **Export** as JPG/PNG or as HTML5 (one CM360-ready ZIP per artboard, text
  kept as live text with fonts subset to the glyphs actually used — typically
  2–5 KB per face). The dialog renders the real files as you change settings
  and shows each one's size against its limit (default 2 × 100 KB), with the
  compressed image viewable at 100 %/200 % before you download.
- Autosaved in the browser; save/open a self-contained project file; every
  export lands in **History** with its design, so it can be reopened and
  edited.

## Native Premium

Open it with **Native Premium** at the top left (or `http://localhost:4050/native/`).

### What a page is made of

A page is a list of **sections** (blocks). Each block type has its own fields and
looks right on desktop, tablet and mobile by itself:

| Group | Blocks |
| --- | --- |
| Top | **Hero** — photo or video (separate portrait files for mobile), kicker, H1, ingress; overlay, split, photo-above, **framed**, **zoom** (the photo grows to full bleed as you scroll) or **typographic**; title size up to "gigantic", title animation (word / line / letter), slow zoom; **Chapter** (part label, title, intro; centred, big left or huge number) |
| Text | **Body text** (sub-headings, lists, quotes, links, ==highlight==, lead paragraph, two columns), **Statement** (one big sentence; words light up as you scroll, word by word, typewriter, gradient or outline), **Fact box**, **Quote**, **People** (portrait or portrait video, quote, name, role), **Numbers** (plain, cards, lines or one gigantic), **Top list** (ranked, countdown, full-screen scenes with huge numerals, specs and "Visste du?"), **Steps**, **Cards** (boxed, plain, text-over-photo, link tiles; optional 3D tilt), **Tabs**, **Timeline**, **Table / comparison** (up to 3 columns, one highlighted), **Q&A**, **Chart** (bars, columns, donut), **Marquee**, **Sources**, **Divider** |
| Media | **Image** (one or two; 21:9 … 4:5; zoom-on-scroll, curtain reveal, slow zoom; photo credit), **Image + text**, **Video**, **Gallery** (carousel, grid, masonry, slideshow; fullscreen lightbox), **Hotspots** (numbered points on a photo — drag them in the preview, double-click to add), **Embed** |
| Action | **CTA** (band, **card with photo**, button or arrow link), **Product cards** (grid or carousel), **Poll** (results counted on pages hosted here), **Countdown** (Norwegian time, with button) |
| Effects | **Scroll story** (overlay or **split screen**; fade, zoom, slide, stack, blur, curtain or circle transitions; white, glass, dark or plain cards; progress dots; a photo or video per card), **Scroll video**, **Horizontal scroll** (panels slide sideways while you scroll down), **Parallax image**, **Flip cards**, **Before / after**, **Quiz** (progress bar, result texts by score, button) |

Every section also has a **style**: background (theme colour, own colour,
**gradient** — linear, radial or soft "aurora" —, **photo** or **video**, separate
mobile photo/video), background effect (fixed, slow zoom, parallax), film grain,
text tone, spacing and **minimum height** (per device), **shaped edges** (wave,
slant, curve, zigzag), entrance animation (fade, slide, zoom, blur, mask reveal,
rise, **one item at a time**) with speed and delay, **scroll-linked effects**
(fade out, grow in, depth, pinned scene change) and a name for the **chapter menu**.

**Page options (Side):** reading-progress bar, **chapter menu** (bar under the
disclosure or dots at the side), reading time in the hero, a **floating button**
that appears after a set share of the page (hidden over CTAs and the footer),
"Likte du denne saken? Ja/Nei" at the end, the "Annonsørinnhold for … / Produsert
av …" credit line, and custom CSS (which can never hide the disclosure).

**Ready-made designs:** "Add section" opens 43 designed sections with live
thumbnails (openings, chapters, statements, numbers, lists, cards, scroll
stories, calls to action) — search by word. Sections and their style can be
copied and pasted, also between projects (Ctrl+C / Ctrl+V, Alt for style only).

**Templates:** besides the five workhorses there are seven **premium templates**,
each with its own fonts, colours and page options, dressed in a demo photo kit
(Unsplash): **Car launch premium**, **Top 5 countdown**, **"Wrapped" year in
numbers**, **Immersive travel**, **Interactive explorer** (tabs per room/audience),
**Report & insight** and **Food & taste**. The gallery in "Ny Native Premium"
shows each one live and opens a full-size preview (desktop/mobile) with all
effects running. Demo photos and sample copy are flagged in **Check** until replaced.

**Theme:** besides colours, fonts and logo: page background colour (light or
dark pages), heading size scale (up to "Magazine"), letter spacing, uppercase
headings/buttons and seven ready-made looks.

The **disclosure** is not a block and cannot be removed: every page starts with a
sticky "Annonsørinnhold fra {advertiser}" bar with the publisher's and the
advertiser's logos, and ends with the fixed footer text. The wording is set once
in **Settings**.

### The editor

- **Middle:** the real page, exactly as it will be published, at desktop, tablet
  or mobile width (keys 1/2/3). Click a section to select it; **double-click a
  text to type right on the page**.
- **Right:** the selected section's fields (with character counters against the
  editorial limits), its style (background, spacing, alignment, entrance
  animation — spacing and alignment can differ per device) and visibility per
  device.
- **Left:** Sections (drag to reorder) · Media (upload, **import from a Google
  Drive folder**, from a link, or **generate with AI**; alt text, focal point) ·
  Theme (colours with contrast check, Google or uploaded brand fonts, logo,
  button style, type scale, ready-made looks; **brand kits** per advertiser) ·
  Side (page options) · Project (advertiser, **audience
  variants** like "For menn"/"For kvinner" with tabs, sharing image and text,
  final address, UTM, per-project scripts) · Check (everything to fix before the
  advertiser sees it) · Review.
- Undo/redo (Ctrl+Z / Ctrl+Shift+Z), autosave every second, an automatic version
  every 10 minutes, named versions and restore. If a colleague saved in the
  meantime, the editor says so instead of overwriting their work.

### AI mode (OpenRouter)

**AI** in the editor (or "Med AI" when creating a project) opens a four-step wizard:

1. **Sources** — paste the **Google Docs** brief link (shared as "Anyone with the
   link"; or upload it as .docx), the advertiser's **product pages**, import the
   **Drive folder** with the photos/videos, and add a few lines yourself.
   Comments in the doc come along as editorial notes; pictures inside the doc can
   be imported with one click.
2. **Questions** — the AI reads everything (photos included) and shows its
   reading: summary, the facts it found (with the ones to double-check flagged:
   prices, conflicting numbers), quotes, what each photo shows and where it fits.
   Then it asks **at most eight questions** — only what the material does not
   answer: conflicting facts, a missing CTA link, unclear quotes, legal points;
   angle/tone/audience only when the brief is silent. Its best guess is
   pre-selected, so most answers are a click.
3. **Plan** — three headline options, the ingress and the section plan, all
   editable.
4. **Write** — each section is written (in parallel), checked against the
   character limits (one automatic repair round), and placed on the page. The
   AI's warnings ("price must be confirmed by Ford") are saved as comments on
   the sections they concern.

Every text field also has a ✨ menu: shorter, longer, simpler, warmer, more
formal, new angle, three headlines, fix language — always three alternatives.

Rules the AI follows: Norwegian bokmål (sentence-case headlines, Norwegian
typography), facts and quotes **only** from the sources (each claim tied to a
fact id), no superlatives without documentation (markedsføringsloven § 3),
never writes the disclosure itself. Prompts are versioned in
`lib/native/ai/prompts.js`; the cost of every call is logged per project.

**Setup:** copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`. Models are
chosen in **Settings** (default `anthropic/claude-sonnet-5.5`, fallbacks on other
providers, a vision model for photos, an image model for illustrations). Every
request is sent with **zero data retention** and "no training on prompts". Run
your own blind test with real briefs before settling on a model.

Optional: `GOOGLE_API_KEY` (Drive API enabled) gives exact file types and sizes
for Drive folders; without it, the folder's public view is read.

### Review, export, publishing

- **Review (Share):** "Send to review" freezes the current state as round 1, 2, …
  and copies a link (`/p/<random token>/`). The advertiser opens it without a
  login, **pins comments directly on the page** and **approves with their name**.
  Edits made afterwards do not show until the next round. Links can be revoked.
- **Export:** a ZIP with `index.html` (plus one folder per variant), WebP images
  in several sizes, the page's fonts **subset to the characters it uses** and
  self-hosted (no request to Google from readers — GDPR), video, the runtime and
  a `LES-MEG.txt`. All paths are relative: upload the folder anywhere, or open it
  from disk.
- **Publish here:** ABC design can also host the page at `/n/<slug>/` (for
  testing, or when the tool runs on a server with its own domain). Published
  pages run inside a CSP sandbox.
- **Measurement:** pages push `np_view`, `np_scroll` (25/50/75/100), `np_time`,
  `np_cta_click`, `np_video` (play/25/50/75/complete), `np_factbox_open`,
  `np_share`, `np_quiz_*`, `np_tab`, `np_hotspot`, `np_flip`, `np_poll`,
  `np_feedback`, `np_chapter`, `np_gallery` and `np_lightbox` to
  `window.dataLayer` and as a `np:track` DOM event. An optional **click tracker**
  (DoubleClick, Adform …) can be put in front of every advertiser link
  (Project → Measurement).
  Put Kilkaya / Mixpanel / GTM snippets once in Settings; ad-server pixels with
  `[timestamp]`/`[cachebuster]` get a fresh number per view.
- Pages work **without JavaScript** (everything visible; motion is an extra),
  respect `prefers-reduced-motion`, and load only the image size the screen needs.

### Logins (for a shared server)

Off by default. To require a login for everyone, add `AUTH=on` to `.env` and
create users:

```bash
npm run user:add -- kari --admin   # asks for name and password
npm run user:add -- ola
npm run user:list
npm run user:passwd -- ola
npm run user:remove -- ola
```

Review links (`/p/…`), published pages (`/n/…`) and their files stay open.
Only administrators can change Native Premium settings.

### Where things are stored

`data/native/` (projects, versions, comments, AI log, settings, brand kits,
library; deleted projects go to `data/native/trash/`), `uploads/native/` (images
with their WebP variants, videos, fonts) and `data/users.json`. Back up `data/`
and `uploads/` together.

## Features

- 🖼️ **Upload or fetch by URL** — drag & drop / pick a file, **or paste an image
  link** (great for AVIF images from Norsk Tipping). Accepts JPG, PNG, WEBP,
  AVIF, GIF. Output is lossless PNG, or JPEG when a banner would otherwise
  break the size limit.
- ✂️ **Drag-to-reframe + zoom** — position the photo and zoom in up to 30 %; the
  crop preview matches the real cropped image area.
- ⚡ **Live preview** — every format of the selected product updates as you type,
  rendered by the *same* code that produces the final PNG, so the preview is
  faithful.
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
- 🔤 **Bundled fonts (Arimo, Noto Serif)** so the preview and the downloaded PNG
  look identical on every platform, including Linux servers. An HTML5 package
  only carries the family its own product uses.

---

## Requirements

- **Node.js 20 or newer** — <https://nodejs.org>
  On macOS, download the **"macOS Installer (.pkg)"** (not the `.tar.gz`) and run
  it through to the end. You only need to do this **once** — it stays available.
- **Git** (only needed to clone from GitHub) — <https://git-scm.com>

`npm install` also makes sure a browser is available for Puppeteer. If Google
Chrome is already on the machine it is used as-is; otherwise a copy of Chromium
(~150 MB) is downloaded once. Either way the first install needs an internet
connection and a few minutes.

> npm 11 no longer runs dependencies' install scripts by default, which is
> exactly how Puppeteer used to fetch that browser — so this project fetches it
> itself from `scripts/ensure-browser.js`. The `npm warn allow-scripts` lines
> you may see during install are harmless.

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

## Updating a copy you already have

Cloned this before? Everything below happens in **one Terminal window**, and it
takes about a minute. Follow the four steps in order.

### 1 · Stop the app if it is running

If the app is running, the Terminal window it was started in is showing
something like this:

```
  ABC design kjører på  http://localhost:4050

[puppeteer] browser ready (pid 10080)
```

Click that window and press **`Ctrl + C`** (hold `Ctrl`, press `C` — this is
`Ctrl` on a Mac too, *not* `Cmd`). The app stops and you get your prompt back.

> Not sure whether it is running? Open <http://localhost:4050> in a browser. If
> the page loads, it is running and you need this step. If the browser says it
> cannot connect, it is already stopped — go to step 2.

### 2 · Check that you are in the project folder

Updating only works from inside the project folder. Your prompt must end with
**`banner-generator`**:

```
abraham@MacBook banner-generator %
```

If it does not, go there first (adjust the path to wherever you keep it):

```bash
cd ~/Desktop/banner-generator
```

To be certain you are in the right place, run `ls` — you should see
`server.js`, `package.json`, `public` and `templates` in the listing:

```
LICENSE           history           package-lock.json scripts           test
README.md         history.json      package.json      server.js         uploads
README.no.md      lib               public            settings.json
_smoke.sh         node_modules      references        templates
```

If `ls` shows something else, you are in the wrong folder and `git pull` will
say `not a git repository`.

### 3 · Run the three commands, in this order

```bash
git pull
npm install
npm start
```

What each one does, and what "it worked" looks like:

| Command | What it does | You should see |
| ------- | ------------ | -------------- |
| `git pull` | Downloads the new version from GitHub | A list of changed files, ending in something like `21 files changed` |
| `npm install` | Installs anything the new version needs | `added / changed N packages` (warnings about `npm audit` are normal) |
| `npm start` | Starts the app | `ABC design kjører på  http://localhost:4050` |

Run them one at a time and wait for each to finish before typing the next.
`npm install` is the slow one — give it a minute.

### 4 · Open the app

Go to <http://localhost:4050>. The tab bar at the top should now read:

```
Norsk Tipping   ReadPeak   Houseads   Historikk
```

Still seeing the old single **Ny banner** tab? That is the browser showing you a
cached page, not a failed update — hard-refresh with **`Cmd + Shift + R`**
(macOS) or **`Ctrl + F5`** (Windows).

Leave the Terminal window open while you work. Closing it stops the app.

### What you get in this version

- Three products in the tab bar instead of one: **Norsk Tipping** (unchanged),
  **ReadPeak** (same two placements without the 18+ mark and the Vinnersjanse
  strip, with the advertiser's own name and an editable "Les mer") and
  **Houseads** (abc shopping's 320×400, 980×300, 980×500, 580×500, 300×600
  and 300×250).
- **Bulk**: many Houseads from one Google Sheet / Excel / CSV, checked row by
  row and downloaded as one ZIP (see *Bulk* above), and the new **980×500**.
- **Auto text size** on the Houseads formats: the size follows the headline's
  length and is measured so nothing is clipped.
- **Egne grenser per format** under Innstillinger → Eksport, so a 190×190 and a
  980×300 no longer have to share one size limit.
- Overskrift and Ingress both fit three lines, and "Les mer" follows the Ingress
  instead of sitting on the floor of the card.

### Notes

**`npm install` is not optional here** — it is what brings in `sharp`, which the
size limit and the extra-sharpness pass are built on. Skip it and the app still
starts, but it says on startup and in Settings that both are switched off.

**Your own things are left alone.** `settings.json`, the `history/` folder and
any uploaded badge mark are all outside version control, so `git pull` never
touches them. Old settings files are read as-is: anything the new version added
(per-format size limits) simply starts empty, and old history entries keep
working as Norsk Tipping packages.

**If `git pull` complains about local changes** you did not make on purpose,
`git stash` puts them aside and `git stash drop` throws them away for good.

**Downloaded a ZIP instead of cloning?** Then there is nothing to pull — download
the ZIP again from GitHub, or clone it properly once with the command in
[Quick start](#quick-start) so future updates are a single `git pull`.

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
   ABC design kjører på  http://localhost:4050
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
the default and what the preview opens. A small script then turns that href into
the real clickTag URL (`target="_blank"`), re-read on every interaction, so
right-click → "Open link in new tab" and middle-click work too — browsers block
`javascript:` links there and Chrome shows `about:blank#blocked`.

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

Change the default limit (or switch it off with `0`) under **Innstillinger →
Eksport**, and give an individual placement its own ceiling under **Egne grenser
per format** right below it — a 190×190 thumbnail and a 980×300 toppbanner are
not traded under the same weight limit, so one global number is either too tight
for the big formats or meaningless for the small ones. A blank row inherits the
default; `0` means no limit for that format. The limit belongs to the *size*, so
the ReadPeak 308×380 shares one ceiling across the Norsk Tipping and ReadPeak
products.

An HTML5 package has a floor the image export does not: two woff2 faces plus the
markup weigh ~40 KB before the photo is in. A per-format limit below that cannot
be met, and the app says so on the file rather than quietly handing over an
over-budget package.

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
├── data/                Native Premium projects, settings, users (created on first use)
├── lib/
│   ├── native/            Native Premium: projects + versions, assets, pages/export,
│   │                      review + published routes, polls.js (votes on published
│   │                      pages), demo/ (the templates' demo photos + credits),
│   │                      sources/ (Docs, Drive, docx, web pages), ai/ (OpenRouter
│   │                      client, prompts, schemas, pipeline)
│   ├── auth.js            Optional logins (AUTH=on)
│   ├── image.js           Downscaling + the per-file byte budget (sharp)
│   ├── html5.js           Campaign Manager 360 package builder
│   ├── safe-fetch.js      "Fetch from link" without reaching inside the network
│   └── bulk/              Bulk: sheet + XLSX reading, link rewrites, photos,
│                          background runs, ZIP delivery, /api/bulk routes
├── templates/             Puppeteer pages → produce the final banners
│   ├── banner.html        One generic template; the format arrives in the data
│   └── _render.js         Shared init (signals "ready to screenshot")
├── public/
│   ├── index.html         App UI
│   ├── style.css          App styling (chrome only)
│   ├── app.js             Frontend logic
│   ├── bulk/              The Bulk tab (state, fitting, grid, editor, rules, run)
│   ├── native/            Native Premium: schema.js (the blocks, style and page
│   │                      options), doc.js (model + sanitiser), render.js (ONE
│   │                      renderer for editor, review links and export),
│   │                      templates.js + presets.js (templates and ready-made
│   │                      sections), runtime/ (np.css + np.js of the
│   │                      published page), app/ (the editor), review/ (the
│   │                      advertiser's review overlay)
│   └── assets/
│       ├── formats.js     ONE source of truth for the products and their
│       │                  formats — loaded by the server AND the browser
│       ├── banner.css     ┐ ONE source of truth for the banner look —
│       ├── banner.js      ┘ used by BOTH the templates and the live preview
│       ├── autofit.js     Headline size from length + measurement (Auto)
│       ├── fonts/         Bundled Arimo (Arial-compatible) + Noto Serif
│       ├── norsktipping-icon.svg   The mark in the 18+ badge
│       ├── abc-shopping.png        The Houseads mark
│       └── placeholder.svg
├── scripts/               ensure-browser.js — guarantees Puppeteer has a browser;
│                          user.js — manage logins
├── test/                  node --test suites (npm test)
├── references/            Source artwork + real ads to compare against
├── history/               Saved packages (max 30)
├── uploads/               Wallpaper + Bulk photos (bulk ones cleared after 21 days)
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
| `POST /api/fetch-image`          | `{url}` → fetches an image from a link                |
| `GET  /api/history`              | List of the last 30 packages                         |
| `GET  /api/history/:id/download` | Re-download a package — `?set=core\|newsgrid\|all`, `&type=html`; bulk runs: `?layout=format\|banner\|flat`, `&row=N` |
| `DELETE /api/history/:id`        | Delete a package                                     |
| `GET  /api/settings`             | Read settings (+ `ageIcon`, `imageTools`, read-only) |
| `POST /api/settings`             | Save settings                                        |
| `POST /api/settings/badge-icon`  | Replace the mark in the 18+ badge (PNG/JPG)          |
| `DELETE /api/settings/badge-icon`| Go back to the built-in mark                         |
| `POST /api/wallpaper/assets`     | Multipart `file` → stores an image by SHA-256, returns its id |
| `POST /api/wallpaper/estimate`   | `{doc, options}` → each file's real size (+ preview image)    |
| `POST /api/wallpaper/export`     | `{doc, options}` → streams the download, saves to history     |
| `GET  /wp-assets/:id`            | An uploaded wallpaper image (immutable)              |
| `POST /api/bulk/sheet`           | `{url}` (Google Sheets/CSV link) or `{text}` (pasted cells) → rows |
| `POST /api/bulk/sheet-file`      | Multipart `file` (.xlsx/.csv/.tsv) → rows             |
| `GET  /api/bulk/template.csv`    | The example sheet                                    |
| `POST /api/bulk/image`           | `{url}` → fetches and stores a photo (master, preview, focus) |
| `POST /api/bulk/image-file`      | Multipart `image` → stores a photo                    |
| `POST /api/bulk/jobs`            | `{rows, options}` → starts a run (202)               |
| `GET  /api/bulk/jobs/:id`        | Progress of a run                                    |
| `DELETE /api/bulk/jobs/:id`      | Cancel (finished rows are kept)                      |
| `GET  /bulk-assets/:file`        | A stored bulk photo (immutable)                      |
| `GET  /api/health`               | Status (browser connected?)                          |
| `/api/native/…`                  | Native Premium: projects, versions, review, comments, export, publish, assets, brand kits, library, settings, sources, AI — see the header of [lib/native/routes.js](lib/native/routes.js), [sources/routes.js](lib/native/sources/routes.js) and [ai/routes.js](lib/native/ai/routes.js) |
| `GET  /p/:token/`, `/api/review/:token…` | The advertiser's review link (no login)      |
| `GET  /n/:slug/`                 | A page published by ABC design                       |
| `POST /n-api/vote/:slug/:section`| A poll / "Likte du saken?" vote from a published page (any origin, text/plain) |
| `GET  /np-assets/:file`          | Native Premium images (+ WebP variants), videos, fonts (immutable) |

All four formats are rendered and saved on every generate; `downloadSet` only
picks what the response streams. Writes are rejected when they arrive with a
foreign `Origin`.

`POST /api/fetch-image` opens a socket to a URL somebody typed, so
[lib/safe-fetch.js](lib/safe-fetch.js) checks **every address the hostname
resolves to** — not just the text of the hostname — against the loopback,
private, carrier-NAT, link-local (cloud metadata) and multicast ranges,
including IPv4-mapped IPv6 forms like `::ffff:127.0.0.1`. The check runs inside
the DNS lookup the socket itself uses, so the answer cannot change between the
check and the connection, and redirects are followed one hop at a time with the
whole check repeated. The body is capped while streaming, not after.

`POST /api/generate` fields: `image` (file, max 10 MB, JPG/PNG/WEBP/AVIF/GIF),
`product` (`norsktipping` | `readpeak` | `houseads`, default `norsktipping`),
`headline`, `subtitle`, `brandLabel`, `ctaText` (the "Les mer" wording; empty =
no call to action), `vinnersjanse` (empty = badge hidden; ignored unless the
product is `norsktipping`), `showVinnerOnNewsgrid`,
`imagePositionX`/`imagePositionY` (0–100), `imageZoom` (0–30), `headlineScales`
(JSON, format type → 0.5–2) & `subtitleScale` (0.5–2), `lesMerStyle`
(`button` | `text`), `lesMerSize`, `accentColor` (hex), `houseWeight`
(`bold` | `regular`), `resolution` (1 | 1.5 | 2), `format`
(`png` | `jpeg` | `auto`), `filename`, `downloadSet` (a set id from the
product's own list in `formats.js`), `outputType` (`image` | `html`) and —
required for `html` — `clickUrl`.

The 18+/Hjelpelinjen mark and the Vinnersjanse strip are decided by `product` on
the server, not by the client: they are Norsk Tipping obligations and must never
end up on another advertiser's creative.

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
- Put secrets in environment variables (or `.env`): `OPENROUTER_API_KEY`,
  optionally `GOOGLE_API_KEY`, and `AUTH=on` + users for a shared server
  (see [Logins](#logins-for-a-shared-server)). Keep `data/` and `uploads/` on a
  persistent disk.

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
