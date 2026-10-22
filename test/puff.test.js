"use strict";

/* Artikkelpuff 980×600: the measured layout, the crop maths shared by the
   preview and the server, which story each uploaded file lands in, the
   upload store, the export's input checks and the Campaign Manager 360
   package with its three exits. No browser — the Puppeteer render is
   covered by the smoke test. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const PuffAd = require("../public/assets/puff.js");
const media = require("../lib/puff/media");
const pkg = require("../lib/puff/package");
const { createPuff, packageSize } = require("../lib/puff");
const html5 = require("../lib/html5");
const imageTools = require("../lib/image");

const ASSETS = path.join(__dirname, "../public/assets");
const sharp = imageTools.getSharp();

/** Names and bytes of every entry, read from the central directory. */
function unzip(buf) {
  const files = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.slice(start, start + size);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

test("layout matches the measured Canva original", () => {
  assert.equal(PuffAd.WIDTH, 980);
  assert.equal(PuffAd.HEIGHT, 600);
  const [main, s2, s3] = PuffAd.SLOTS;
  assert.deepEqual(main.box, { x: 32, y: 68, w: 620, h: 413 });
  assert.deepEqual([s2.box.w, s2.box.h, s3.box.w, s3.box.h], [276, 183, 276, 183]);
  // Even 32 px margins left and right, 20 px gutter between the columns.
  assert.equal(main.box.x, 32);
  assert.equal(s2.box.x + s2.box.w, 980 - 32);
  assert.equal(s2.box.x - (main.box.x + main.box.w), 20);
  // Headlines sit under their photo, never overlapping it or the next one.
  for (const slot of PuffAd.SLOTS) assert.ok(slot.head.y > slot.box.y + slot.box.h);
  assert.ok(s2.head.y + s2.head.lh * 2 < s3.box.y);
  assert.ok(main.head.y + main.head.lh * 2 <= 600);
});

test("crop placement", async (t) => {
  await t.test("cover without zoom fills the box and centres", () => {
    const p = PuffAd.placement(1600, 900, 620, 413, { zoom: 0, x: 50, y: 50 });
    assert.ok(Math.abs(p.height - 413) < 1e-9);
    assert.ok(p.width > 620);
    assert.ok(Math.abs(p.left - (620 - p.width) / 2) < 1e-9);
    assert.equal(p.top, 0);
  });

  await t.test("zoom magnifies around the focus point", () => {
    const p = PuffAd.placement(800, 600, 276, 183, { zoom: 100, x: 0, y: 100 });
    assert.ok(Math.abs(p.width - 276 * 2) < 1e-9);
    assert.ok(p.left === 0, "left edge"); // -0 from (box - media) × 0
    assert.ok(Math.abs(p.top - (183 - p.height)) < 1e-9);
  });

  await t.test("the visible rect is what the box shows, in source pixels", () => {
    const r = PuffAd.visibleRect(1920, 1080, 620, 413, { zoom: 0, x: 50, y: 50 });
    assert.equal(r.height, 1080);
    assert.ok(Math.abs(r.width / r.height - 620 / 413) < 0.01);
    assert.ok(Math.abs(r.left - (1920 - r.width) / 2) <= 1);
    const corner = PuffAd.visibleRect(1000, 1000, 276, 183, { zoom: 0, x: 0, y: 0 });
    assert.ok(corner.left === 0 && corner.top === 0);
  });

  await t.test("dragging moves the focus the opposite way and stays in range", () => {
    const start = { zoom: 0, x: 50, y: 50 };
    const right = PuffAd.panBy(1600, 900, 620, 413, start, 40, 0);
    assert.ok(right.x < 50);
    assert.equal(right.y, 50, "no vertical slack on a wide photo");
    const far = PuffAd.panBy(1600, 900, 620, 413, start, -100000, 0);
    assert.equal(far.x, 100);
  });

  await t.test("a new photo starts zoomed in a little, so it slides every way", () => {
    const c = PuffAd.DEFAULT_CROP;
    assert.ok(c.zoom > 0 && c.x === 50 && c.y === 50);
    for (const [w, h] of [[1600, 900], [900, 1600], [620, 413]]) {
      for (const slot of PuffAd.SLOTS) {
        const room = PuffAd.spare(w, h, slot.box.w, slot.box.h, c);
        assert.ok(room.x > 0 && room.y > 0, `${w}×${h} in ${slot.box.w}×${slot.box.h}`);
        const moved = PuffAd.panBy(w, h, slot.box.w, slot.box.h, c, 10, 10);
        assert.ok(moved.x < 50 && moved.y < 50);
      }
    }
  });

  await t.test("without zoom a photo the box's shape has no room to slide", () => {
    assert.deepEqual(PuffAd.spare(620, 413, 620, 413, { zoom: 0, x: 50, y: 50 }), { x: 0, y: 0 });
  });

  await t.test("a crop out of range is pulled back", () => {
    assert.deepEqual(PuffAd.normalizeCrop({ zoom: 500, x: -3, y: "abc" }), { zoom: 100, x: 0, y: 50 });
  });
});

test("which story each dropped file goes to", async (t) => {
  const none = [false, false, false];
  await t.test("three or more files fill the stories in order", () => {
    assert.deepEqual(PuffAd.assignSlots(3, none, null), [0, 1, 2]);
    assert.deepEqual(PuffAd.assignSlots(5, [true, true, true], null), [0, 1, 2]);
  });
  await t.test("fewer files go to the empty stories first", () => {
    assert.deepEqual(PuffAd.assignSlots(1, [true, false, true], null), [1]);
    assert.deepEqual(PuffAd.assignSlots(2, [false, true, false], null), [0, 2]);
    assert.deepEqual(PuffAd.assignSlots(2, [true, true, true], null), [0, 1]);
  });
  await t.test("dropped on a story: that one, then the empty ones after it", () => {
    assert.deepEqual(PuffAd.assignSlots(1, [true, true, true], 2), [2]);
    assert.deepEqual(PuffAd.assignSlots(3, [false, true, false], 1), [1, 2, 0]);
    assert.deepEqual(PuffAd.assignSlots(3, [true, true, false], 0), [0, 2], "only one empty story left");
  });
});

test("document rules", () => {
  const doc = PuffAd.normalizeDoc({
    label: "  ",
    logo: { src: "/puff-assets/x.png", height: 999 },
    slots: [{ kind: "video", src: "/a.mp4", poster: "/p.jpg", headline: "  Hei\n\n  der  ", link: " https://a.no/x " }, { kind: "bogus", src: "/b.jpg" }],
  });
  assert.equal(doc.label, "");
  assert.equal(doc.logo.height, PuffAd.LOGO_HEIGHT.max);
  assert.equal(doc.slots.length, 3);
  assert.equal(doc.slots[0].headline, "Hei\nder");
  assert.equal(doc.slots[0].link, "https://a.no/x");
  assert.equal(doc.slots[1].kind, "empty");
  assert.equal(doc.slots[1].src, "", "an unknown kind keeps no source");
  assert.equal(PuffAd.normalizeDoc({ slots: [{ headline: "x".repeat(500) }] }).slots[0].headline.length, PuffAd.MAX_HEADLINE);
});

test("upload store", async (t) => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const ftyp = (brand) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftyp" + brand), Buffer.alloc(8)]);

  await t.test("the type comes from the bytes", () => {
    assert.equal(media.sniff(PNG), "png");
    assert.equal(media.sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), "jpg");
    assert.equal(media.sniff(ftyp("isom")), "mp4");
    assert.equal(media.sniff(ftyp("avif")), "avif");
    assert.equal(media.sniff(ftyp("qt  ")), "mov");
    assert.equal(media.sniff(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])), "webm");
    assert.equal(media.sniff(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  });

  await t.test("only stored names are accepted as sources", () => {
    const id = "a".repeat(64) + ".mp4";
    assert.equal(media.idFromUrl("/puff-assets/" + id), id);
    assert.equal(media.idFromUrl("/puff-assets/../../server.js"), null);
    assert.equal(media.idFromUrl("https://evil.example/" + id), null);
    assert.equal(media.kindOf(id), "video");
    assert.equal(media.kindOf("b".repeat(64) + ".webp"), "image");
  });

  await t.test("saves content-addressed and refuses QuickTime", { skip: !sharp }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "puff-store-"));
    const store = media.createMediaStore({ dir, getSharp: () => sharp });
    const jpg = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#336699" } }).jpeg().toBuffer();
    const a = await store.save(jpg, "media");
    const b = await store.save(jpg, "media");
    assert.equal(a.id, b.id);
    assert.deepEqual([a.kind, a.w, a.h], ["image", 40, 30]);
    assert.ok(await store.exists(a.id));
    await assert.rejects(store.save(ftyp("qt  "), "media"), /QuickTime/);
    await assert.rejects(store.save(ftyp("isom"), "logo"), /Logoen må være et bilde/);
  });

  await t.test("a logo is trimmed to its visible edges and stored as PNG", { skip: !sharp }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "puff-logo-"));
    const store = media.createMediaStore({ dir, getSharp: () => sharp });
    const mark = await sharp({ create: { width: 100, height: 20, channels: 4, background: "#cc0000" } }).png().toBuffer();
    const padded = await sharp({ create: { width: 300, height: 120, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: mark, left: 50, top: 50 }])
      .png()
      .toBuffer();
    const up = await store.save(padded, "logo");
    assert.ok(up.id.endsWith(".png"));
    assert.deepEqual([up.w, up.h], [100, 20]);
  });
});

test("export checks", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "puff-check-"));
  const puff = createPuff({
    historyDir: path.join(dir, "history"),
    uploadsDir: dir,
    publicDir: path.join(__dirname, "../public"),
    templatesDir: path.join(__dirname, "../templates"),
    imageTools,
    html5,
    getBrowser: async () => {
      throw new Error("no browser in unit tests");
    },
    enqueue: (task) => task(),
    loadSettings: async () => ({ export: { format: "png", jpegQuality: 92, maxFileSizeKb: 200, formatLimits: {} } }),
    budgetFor: () => 0,
    normalizeClickUrl: (raw) => {
      try {
        const url = new URL(String(raw || "").trim());
        return /^https?:$/.test(url.protocol) ? { ok: true, url: url.href } : { ok: false, error: "Klikk-lenken må starte med http:// eller https://" };
      } catch {
        return { ok: false, error: "Mangler klikk-lenke (landingsside-URL)" };
      }
    },
    sanitizeFilename: (s) => s,
    fileStamp: () => "",
    saveEntry: async () => {},
  });

  async function stored(kind) {
    const buf =
      kind === "video"
        ? Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(16, kind.length)])
        : await sharp({ create: { width: 800, height: 600, channels: 3, background: "#808080" } }).jpeg().toBuffer();
    return (await puff.store.save(buf, "media")).url;
  }

  async function validDoc() {
    const img = await stored("image");
    const vid = await stored("video");
    return {
      slots: [
        { kind: "video", src: vid, poster: img, w: 1280, h: 720, headline: "Én", link: "https://a.no/1" },
        { kind: "image", src: img, w: 800, h: 600, headline: "To", link: "https://a.no/2" },
        { kind: "image", src: img, w: 800, h: 600, headline: "Tre", link: "" },
      ],
    };
  }

  await t.test("a complete document passes; an empty side link falls back", { skip: !sharp }, async () => {
    const { links, ids } = await puff.checkDoc(await validDoc());
    assert.deepEqual(links, ["https://a.no/1", "https://a.no/2", ""]);
    assert.equal(ids.slots.length, 3);
    assert.ok(ids.posters[0]);
  });

  await t.test("every story needs media, a headline and (the lead) a link", { skip: !sharp }, async () => {
    const doc = await validDoc();
    await assert.rejects(puff.checkDoc({ ...doc, slots: [doc.slots[0], { ...doc.slots[1], kind: "empty" }, doc.slots[2]] }), /Sak 2 mangler bilde eller video/);
    await assert.rejects(puff.checkDoc({ ...doc, slots: [{ ...doc.slots[0], headline: "" }, doc.slots[1], doc.slots[2]] }), /Hovedsak mangler overskrift/);
    await assert.rejects(puff.checkDoc({ ...doc, slots: [{ ...doc.slots[0], link: "" }, doc.slots[1], doc.slots[2]] }), /Hovedsak: mangler klikk-lenke/);
    await assert.rejects(puff.checkDoc({ ...doc, slots: [doc.slots[0], { ...doc.slots[1], link: "javascript:alert(1)" }, doc.slots[2]] }), /Sak 2: klikk-lenken må starte med http/);
  });

  await t.test("sources must be stored uploads of the right kind", { skip: !sharp }, async () => {
    const doc = await validDoc();
    const missing = "/puff-assets/" + "f".repeat(64) + ".jpg";
    await assert.rejects(puff.checkDoc({ ...doc, slots: [doc.slots[0], { ...doc.slots[1], src: missing }, doc.slots[2]] }), /Sak 2: filen finnes ikke lenger/);
    await assert.rejects(puff.checkDoc({ ...doc, slots: [doc.slots[0], { ...doc.slots[1], src: doc.slots[0].src }, doc.slots[2]] }), /Sak 2: filen finnes ikke lenger/, "a video passed off as an image");
    await assert.rejects(puff.checkDoc({ ...doc, slots: [{ ...doc.slots[0], poster: "" }, doc.slots[1], doc.slots[2]] }), /stillbildet fra videoen mangler/);
  });
});

test("package photo size: 2× the box, never upscaled", () => {
  assert.deepEqual(packageSize({ width: 2000, height: 1333 }, { w: 620, h: 413 }), { width: 1240, height: 826 });
  assert.deepEqual(packageSize({ width: 400, height: 266 }, { w: 276, h: 183 }), { width: 400, height: 265 });
  assert.deepEqual(packageSize({ width: 200, height: 133 }, { w: 276, h: 183 }), { width: 276, height: 183 });
});

test("Campaign Manager 360 package", async (t) => {
  const css = fs.readFileSync(path.join(ASSETS, "puff.css"), "utf8");
  const fonts = pkg.FONT_FILES.map((name) => ({ name, buffer: fs.readFileSync(path.join(ASSETS, "fonts", name)) }));
  const markup =
    '<div id="banner-root" class="pf"><a class="pf__head" data-exit="1"><span class="pf__label">Annonsørinnhold</span><img class="pf__logo" src="logo.png"></a>' +
    '<a class="pf__item pf__item--main" data-slot="0" data-exit="1"><div class="pf__media"><video class="pf__img" src="video-1.mp4" poster="poster-1.jpg"></video></div></a>' +
    '<a class="pf__item pf__item--s2" data-slot="1" data-exit="2"><div class="pf__media"><img class="pf__img pf__img--baked" src="image-2.jpg"></div></a>' +
    '<a class="pf__item pf__item--s3" data-slot="2" data-exit="3"><div class="pf__media"><img class="pf__img pf__img--baked" src="image-3.jpg"></div></a></div>';
  const files = ["video-1.mp4", "poster-1.jpg", "image-2.jpg", "image-3.jpg", "logo.png"].map((name) => ({ name, buffer: Buffer.from(name) }));
  const params = { markup, css, fonts, files, links: ["https://a.no/1", "https://a.no/2", ""], title: "Test </script>" };

  await t.test("ad.size and three click variables in a classic head script", () => {
    const html = pkg.buildIndexHtml({ ...params, css: "" });
    const head = html.slice(0, html.indexOf("</head>"));
    assert.match(head, /<meta name="ad.size" content="width=980,height=600">/);
    assert.match(head, /var clickTag = "https:\/\/a.no\/1";/);
    assert.match(head, /var clickTag2 = "https:\/\/a.no\/2";/);
    assert.match(head, /var clickTag3 = "https:\/\/a.no\/1";/, "an empty story link uses the lead story's");
    assert.doesNotMatch(head, /<\/script>[^]*Test <\/script>/, "the title is escaped");
  });

  await t.test("each story is its own documented exit", () => {
    const html = pkg.buildIndexHtml({ ...params, css: "" });
    assert.match(html, /<a href="javascript:window.open\(window.clickTag\)" class="pf__head" data-exit="1"/);
    assert.match(html, /<a href="javascript:window.open\(window.clickTag2\)" class="pf__item pf__item--s2" data-slot="1" data-exit="2"/);
    assert.match(html, /<a href="javascript:window.open\(window.clickTag3\)" class="pf__item pf__item--s3" data-slot="2" data-exit="3"/);
    assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB|openDatabase/);
  });

  await t.test("the ZIP holds everything it references, videos at the root", async () => {
    const zip = unzip(await pkg.buildZip(params));
    const names = Object.keys(zip).sort();
    assert.deepEqual(names, ["fonts/noto-sans-latin-700-normal.woff2", "fonts/noto-serif-latin-700-normal.woff2", "image-2.jpg", "image-3.jpg", "index.html", "logo.png", "poster-1.jpg", "video-1.mp4"]);
    const html = zip["index.html"].toString("utf8");
    const refs = [...html.matchAll(/(?:src|poster)="([^"]+)"|url\("?([^")]+)"?\)/g)].map((m) => m[1] || m[2]);
    assert.ok(refs.length >= 7);
    for (const ref of refs) assert.ok(zip[ref], "referenced but missing: " + ref);
  });

  await t.test("a face whose file is not shipped is not declared", async () => {
    const zip = unzip(await pkg.buildZip({ ...params, fonts: fonts.slice(1) }));
    const html = zip["index.html"].toString("utf8");
    assert.doesNotMatch(html, /noto-sans-latin-700/);
    assert.match(html, /noto-serif-latin-700/);
  });
});
