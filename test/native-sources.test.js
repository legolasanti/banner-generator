"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("zlib");

const gdoc = require("../lib/native/sources/gdoc");
const drive = require("../lib/native/sources/drive");
const web = require("../lib/native/sources/web");
const docx = require("../lib/native/sources/docx");

// A trimmed copy of what Google Docs' "export as HTML" produces.
const GDOC = `<html><head><meta content="text/html; charset=UTF-8" http-equiv="content-type"><style type="text/css">.c3{font-weight:700}.c5{font-style:italic}.c9{color:#000000}</style><title>Ford Puma – brief</title></head>
<body class="c8 doc-content"><p class="c2 title" id="h.1"><span class="c9">Ford Puma Gen-E</span></p>
<h1 class="c4"><span>Kjernebudskap</span></h1>
<p class="c2"><span class="c9">Pris fra </span><span class="c3">349 900 kr</span><span class="c9">, </span><span class="c5">kampanje</span><sup><a href="#cmnt1" id="cmnt_ref1">[a]</a></sup></p>
<p class="c2"><span>Les mer: </span><a class="c7" href="https://www.google.com/url?q=https://www.ford.no/puma&amp;sa=D&amp;source=editors&amp;ust=1&amp;usg=x">ford.no</a></p>
<ul class="lst-kix_1 start"><li class="c1 li-bullet-0"><span>376 km rekkevidde</span></li><li class="c1 li-bullet-0"><span>523 liter</span></li></ul>
<p class="c2"><span style="overflow: hidden;"><img alt="Bil" src="https://lh7-rt.googleusercontent.com/docsz/abc123?key=xyz" style="width: 602px"></span></p>
<div class="c6"><p class="c2"><a href="#cmnt_ref1" id="cmnt1">[a]</a><span class="c9">Sjekk prisen med Ford før publisering</span></p></div>
</body></html>`;

test("Google Docs export → clean text with bold, links unwrapped, comments as notes", () => {
  const r = gdoc.parseGoogleDocHtml(GDOC);
  assert.equal(r.title, "Ford Puma – brief");
  assert.match(r.html, /<h2>Ford Puma Gen-E<\/h2>/);
  assert.match(r.html, /<strong>349 900 kr<\/strong>/);
  assert.match(r.html, /<em>kampanje<\/em>/);
  assert.match(r.html, /<a href="https:\/\/www\.ford\.no\/puma">ford\.no<\/a>/);
  assert.ok(!r.html.includes("cmnt"), "comment anchors removed");
  assert.deepEqual(r.notes, ["Sjekk prisen med Ford før publisering"]);
  assert.deepEqual(r.images, [{ url: "https://lh7-rt.googleusercontent.com/docsz/abc123?key=xyz", alt: "Bil" }]);
  assert.match(r.text, /## Kjernebudskap/);
  assert.match(r.text, /- 376 km rekkevidde/);
  assert.match(r.text, /\*\*349 900 kr\*\*/);
});

test("Google Docs links: the document id is found in every link shape", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
  assert.equal(gdoc.docIdFromUrl("https://docs.google.com/document/d/" + id + "/edit?usp=sharing"), id);
  assert.equal(gdoc.docIdFromUrl("https://docs.google.com/document/u/0/d/" + id + "/edit"), id);
  assert.equal(gdoc.docIdFromUrl("https://docs.google.com/spreadsheets/d/" + id + "/edit"), null);
  assert.equal(gdoc.docIdFromUrl("https://evil.example/document/d/" + id), null);
});

test("Drive: folder ids from links, entries from the public folder view", () => {
  assert.equal(drive.folderIdFromUrl("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing"), "1AbCdEfGhIjKlMnOp");
  assert.equal(drive.folderIdFromUrl("https://drive.google.com/drive/u/1/folders/1AbCdEfGhIjKlMnOp"), "1AbCdEfGhIjKlMnOp");
  assert.equal(drive.folderIdFromUrl("https://example.com/drive/folders/1AbCdEfGhIjKlMnOp"), null);
  const html =
    '<div class="flip-entry" id="entry-1aaaaaaaaaaaaaaaa" tabindex="0"><div class="flip-entry-info"><a href="https://drive.google.com/file/d/1aaaaaaaaaaaaaaaa/view?usp=drive_web"><div class="flip-entry-title">IMG_0042.JPG</div></a></div></div>' +
    '<div class="flip-entry" id="entry-1bbbbbbbbbbbbbbbb"><a href="https://drive.google.com/file/d/1bbbbbbbbbbbbbbbb/view"><div class="flip-entry-title">film &amp; lyd.mov</div></a></div>' +
    '<div class="flip-entry" id="entry-1cccccccccccccccc"><a href="https://docs.google.com/document/d/1cccccccccccccccc/edit"><div class="flip-entry-title">Brief</div></a></div>' +
    '<div class="flip-entry" id="entry-1dddddddddddddddd"><a href="https://drive.google.com/file/d/1dddddddddddddddd/view"><div class="flip-entry-title">IMG_1.HEIC</div></a></div>';
  const entries = drive.parseEmbeddedFolder(html);
  assert.deepEqual(entries.map((e) => [e.name, e.kind]), [
    ["IMG_0042.JPG", "image"],
    ["film & lyd.mov", "video"],
    ["Brief", "gdoc"],
    ["IMG_1.HEIC", "heic"],
  ]);
});

test("product pages: main text without scripts or navigation, plus schema.org product data", () => {
  const html = `<html><head><title>Puma | Ford</title><meta name="description" content="Nye Puma">
    <meta property="og:image" content="/img/puma.jpg">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Ford Puma Gen-E","brand":{"name":"Ford"},"offers":{"@type":"Offer","price":"349900","priceCurrency":"NOK"}}</script>
    <script>window.track=1</script></head><body><nav>Meny Meny</nav><main><h1>Ford Puma</h1><p>Helelektrisk og <b>romslig</b>.</p></main><footer>Cookies</footer></body></html>`;
  const r = web.parsePage(html, "https://www.ford.no/puma");
  assert.equal(r.title, "Puma | Ford");
  assert.equal(r.description, "Nye Puma");
  assert.equal(r.image, "https://www.ford.no/img/puma.jpg");
  assert.match(r.text, /Helelektrisk og \*\*romslig\*\*/);
  assert.ok(!/Meny|Cookies|window\.track/.test(r.text));
  assert.deepEqual(r.facts[0], { type: "Product", name: "Ford Puma Gen-E", brand: "Ford", price: "349900 NOK", description: "" });
});

// ---- a tiny .docx built in memory (stored ZIP, no compression) -------------
function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const deflated = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, deflated);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(deflated.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + deflated.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat(locals.concat([cd, end]));
}

test("Word documents: headings, lists, bold, links, comments and embedded pictures", () => {
  const doc = `<?xml version="1.0"?><w:document xmlns:w="w" xmlns:r="r"><w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Jula høst</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Tilbud</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Pris </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>299,-</w:t></w:r><w:hyperlink r:id="rId5"><w:r><w:t>jula.no</w:t></w:r></w:hyperlink></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Punkt én</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Punkt to</w:t></w:r></w:p>
  </w:body></w:document>`;
  const rels = `<Relationships><Relationship Id="rId5" Type="hyperlink" Target="https://www.jula.no/" TargetMode="External"/><Relationship Id="rId6" Type="image" Target="media/image1.png"/></Relationships>`;
  const comments = `<w:comments xmlns:w="w"><w:comment w:id="0"><w:p><w:r><w:t>Bekreft pris</w:t></w:r></w:p></w:comment></w:comments>`;
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const buf = zip([
    ["word/document.xml", doc],
    ["word/_rels/document.xml.rels", rels],
    ["word/comments.xml", comments],
    ["word/media/image1.png", png],
  ]);
  const r = docx.parseDocx(buf);
  assert.match(r.html, /<h2>Jula høst<\/h2><h2>Tilbud<\/h2>/);
  assert.match(r.html, /<p>Pris <strong>299,-<\/strong><a href="https:\/\/www\.jula\.no\/">jula\.no<\/a><\/p>/);
  assert.match(r.html, /<ul><li>Punkt én<\/li><li>Punkt to<\/li><\/ul>/);
  assert.deepEqual(r.notes, ["Bekreft pris"]);
  assert.deepEqual(r.media, [{ name: "image1.png", path: "word/media/image1.png" }]);
  assert.deepEqual(docx.mediaBuffer(buf, "word/media/image1.png"), png);
  assert.throws(() => docx.parseDocx(Buffer.from("not a zip at all, sorry")), /Word/);
});
