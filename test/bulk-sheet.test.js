"use strict";

/* Tests for reading a banner spreadsheet: CSV/TSV parsing, the column
   detection that lets a sheet use its own header names and order, the
   minimal XLSX reader, and the link rewrites that turn "share" links into the
   file itself. A sheet read wrong does not fail loudly — it produces fifty
   banners with the filename where the headline should be — so these pin the
   behaviour down. */

const test = require("node:test");
const assert = require("node:assert/strict");

const sheet = require("../lib/bulk/sheet");
const xlsx = require("../lib/bulk/xlsx");
const links = require("../lib/bulk/links");
const { zipToBuffer } = require("../lib/html5");

// ---------------------------------------------------------------------------
// Delimited text
// ---------------------------------------------------------------------------
test("parses quoted CSV fields with commas, quotes and line breaks", () => {
  const rows = sheet.parseDelimited('Overskrift,Bildelenke\n"Spar 50 %, nå","https://x.no/a.jpg"\n"Han sa ""hei""\nto linjer",b\n');
  assert.deepEqual(rows, [
    ["Overskrift", "Bildelenke"],
    ["Spar 50 %, nå", "https://x.no/a.jpg"],
    ['Han sa "hei"\nto linjer', "b"],
  ]);
});

test("detects tab (pasted cells), semicolon (Norwegian Excel) and comma", () => {
  assert.equal(sheet.detectDelimiter("a\tb\tc\n1\t2\t3"), "\t");
  assert.equal(sheet.detectDelimiter("Overskrift;Bildelenke\nHei, du;https://x.no/a.jpg"), ";");
  assert.equal(sheet.detectDelimiter("Overskrift,Bildelenke\nHei;du,https://x.no/a.jpg"), ",");
});

test("strips a UTF-8 BOM and handles CRLF", () => {
  const rows = sheet.parseDelimited("﻿Overskrift,Bildelenke\r\nA,B\r\n");
  assert.deepEqual(rows, [["Overskrift", "Bildelenke"], ["A", "B"]]);
});

// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------
test("recognises header names in Norwegian, English and Turkish, in any order", () => {
  assert.equal(sheet.fieldForHeader("Overskrift"), "headline");
  assert.equal(sheet.fieldForHeader("Headline"), "headline");
  assert.equal(sheet.fieldForHeader("Başlık"), "headline");
  assert.equal(sheet.fieldForHeader("Bildelenke"), "image");
  assert.equal(sheet.fieldForHeader("Bilde-URL"), "image");
  assert.equal(sheet.fieldForHeader("Resim linki"), "image");
  assert.equal(sheet.fieldForHeader("Image URL"), "image");
  assert.equal(sheet.fieldForHeader("Klikk-lenke"), "clickUrl");
  assert.equal(sheet.fieldForHeader("Filnavn"), "filename");
  assert.equal(sheet.fieldForHeader("Skrift"), "weight");
  assert.equal(sheet.fieldForHeader("Fokus"), "focus");
  // A note after the name still counts, and the longer alias wins.
  assert.equal(sheet.fieldForHeader("Overskrift (maks 60 tegn)"), "headline");
  assert.equal(sheet.fieldForHeader("Bildeposisjon"), "focus");
  // Helper columns in the template must NOT be mistaken for data.
  assert.equal(sheet.fieldForHeader("Antall tegn"), null);
  assert.equal(sheet.fieldForHeader("Forhåndsvisning"), null);
  assert.equal(sheet.fieldForHeader("Kommentar"), null);
});

test("reads rows by header, skipping a title row above and blank rows", () => {
  const table = [
    ["Høstkampanje 2026"],
    [],
    ["Bildelenke", "Antall tegn", "Overskrift", "Filnavn", "Skrift", "Fokus"],
    ["https://x.no/1.jpg", "20", "  Spar   opptil 50 %  ", "spar-50", "Normal", "topp"],
    ["", "", "", "", "", ""],
    ["https://x.no/2.jpg", "", "Ny sofa", "", "", "30/70"],
  ];
  const out = sheet.readTable(table);
  assert.equal(out.headerRow, 2);
  assert.equal(out.guessed, false);
  assert.equal(out.rows.length, 2);
  assert.deepEqual(
    { ...out.rows[0] },
    {
      sheetRow: 4,
      headline: "Spar opptil 50 %",
      imageUrl: "https://x.no/1.jpg",
      filename: "spar-50",
      clickUrl: "",
      weight: "regular",
      focus: { x: 50, y: 0 },
      zoom: null,
    }
  );
  assert.equal(out.rows[1].sheetRow, 6);
  assert.deepEqual(out.rows[1].focus, { x: 30, y: 70 });
  assert.equal(out.rows[1].weight, "");
});

test("guesses the columns when cells were pasted without a header row", () => {
  const out = sheet.readTable([
    ["Spar opptil 50 % på hotell", "https://x.no/1.jpg"],
    ["Ny sofa til halv pris", "https://x.no/2.jpg"],
  ]);
  assert.equal(out.guessed, true);
  assert.equal(out.rows.length, 2);
  assert.equal(out.rows[0].headline, "Spar opptil 50 % på hotell");
  assert.equal(out.rows[1].imageUrl, "https://x.no/2.jpg");
  assert.ok(out.warnings.some((w) => /gjettet/.test(w)));
});

test("says which required column is missing", () => {
  const out = sheet.readTable([["Overskrift", "Filnavn"], ["Hei", "a"]]);
  assert.ok(out.warnings.some((w) => /bildelenke/i.test(w)));
});

test("caps the number of rows and says so", () => {
  const table = [["Overskrift", "Bildelenke"]];
  for (let i = 0; i < sheet.MAX_ROWS + 5; i++) table.push(["H" + i, "https://x.no/" + i + ".jpg"]);
  const out = sheet.readTable(table);
  assert.equal(out.rows.length, sheet.MAX_ROWS);
  assert.equal(out.truncated, true);
});

test("uses the link behind a cell when the cell shows only a word", () => {
  const out = sheet.readTable([
    ["Overskrift", "Bildelenke"],
    ["Hei", { v: "Bilde", href: "https://x.no/a.jpg" }],
  ]);
  assert.equal(out.rows[0].imageUrl, "https://x.no/a.jpg");
});

test("parses focus words and numbers, and zoom in either form", () => {
  assert.deepEqual(sheet.parseFocus("bunn venstre"), { x: 0, y: 100 });
  assert.deepEqual(sheet.parseFocus("Høyre"), { x: 100, y: 50 });
  assert.deepEqual(sheet.parseFocus("midt"), { x: 50, y: 50 });
  assert.deepEqual(sheet.parseFocus("x 20 y 140"), { x: 20, y: 100 });
  assert.equal(sheet.parseFocus(""), null);
  assert.equal(sheet.parseFocus("tull"), null);
  assert.equal(sheet.parseZoom("15 %"), 15);
  assert.equal(sheet.parseZoom("0,15"), 15);
  assert.equal(sheet.parseZoom("90"), 30);
  assert.equal(sheet.parseZoom("x"), null);
});

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------
async function makeXlsx() {
  const files = [
    {
      name: "xl/workbook.xml",
      buffer: Buffer.from(
        '<workbook xmlns:r="r"><sheets><sheet name="Bannere" sheetId="1" r:id="rId1"/></sheets></workbook>'
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      buffer: Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    },
    {
      name: "xl/sharedStrings.xml",
      buffer: Buffer.from(
        "<sst><si><t>Overskrift</t></si><si><t>Bildelenke</t></si>" +
          "<si><r><t>Spar </t></r><r><t>50 % &amp; mer</t></r></si><si><t>Bilde</t></si></sst>"
      ),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      buffer: Buffer.from(
        "<worksheet><sheetData>" +
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
          '<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3" t="s"><v>3</v></c></row>' +
          '<row r="4"><c r="A4" t="inlineStr"><is><t>Ny sofa</t></is></c>' +
          '<c r="B4" t="str"><f>IMAGE("https://x.no/sofa.jpg")</f><v></v></c></row>' +
          '</sheetData><hyperlinks><hyperlink ref="B3" r:id="rId9"/></hyperlinks></worksheet>'
      ),
    },
    {
      name: "xl/worksheets/_rels/sheet1.xml.rels",
      buffer: Buffer.from('<Relationships><Relationship Id="rId9" Target="https://x.no/hotell.jpg"/></Relationships>'),
    },
  ];
  return zipToBuffer(files);
}

test("reads the first sheet of an XLSX, with rich text, hyperlinks and IMAGE()", async () => {
  const { sheetName, table } = xlsx.readFirstSheet(await makeXlsx());
  assert.equal(sheetName, "Bannere");
  assert.equal(table.length, 4); // the empty row 2 is kept so row numbers match
  const out = sheet.readTable(table);
  assert.equal(out.rows.length, 2);
  assert.equal(out.rows[0].headline, "Spar 50 % & mer");
  assert.equal(out.rows[0].imageUrl, "https://x.no/hotell.jpg");
  assert.equal(out.rows[0].sheetRow, 3);
  assert.equal(out.rows[1].imageUrl, "https://x.no/sofa.jpg");
});

test("rejects a file that is not an XLSX with a readable message", () => {
  assert.throws(() => xlsx.readFirstSheet(Buffer.from("not a zip at all, just text....")), (err) => err.safe === true);
});

test("XLSX column letters map to indexes", () => {
  assert.equal(xlsx._columnIndex("A1"), 0);
  assert.equal(xlsx._columnIndex("Z9"), 25);
  assert.equal(xlsx._columnIndex("AA10"), 26);
});

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------
test("turns a Google Sheets link into its CSV export, keeping the tab", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
  assert.equal(
    links.googleSheetCsvUrl("https://docs.google.com/spreadsheets/d/" + id + "/edit#gid=123"),
    "https://docs.google.com/spreadsheets/d/" + id + "/export?format=csv&gid=123"
  );
  assert.equal(
    links.googleSheetCsvUrl("https://docs.google.com/spreadsheets/u/0/d/" + id + "/edit?usp=sharing"),
    "https://docs.google.com/spreadsheets/d/" + id + "/export?format=csv"
  );
  assert.equal(
    links.googleSheetCsvUrl("https://docs.google.com/spreadsheets/d/e/2PACX-abc_DEF/pubhtml?gid=7"),
    "https://docs.google.com/spreadsheets/d/e/2PACX-abc_DEF/pub?output=csv&gid=7&single=true"
  );
  assert.equal(links.googleSheetCsvUrl("https://example.com/sheet.csv"), null);
  assert.equal(links.googleSheetCsvUrl("ikke en lenke"), null);
});

test("turns Drive and Dropbox share links into direct downloads", () => {
  assert.equal(
    links.directImageUrl("https://drive.google.com/file/d/1a2B3c4D5e6F7g8H9i/view?usp=sharing"),
    "https://drive.google.com/uc?export=download&id=1a2B3c4D5e6F7g8H9i"
  );
  assert.equal(
    links.directImageUrl("https://drive.google.com/open?id=1a2B3c4D5e6F7g8H9i"),
    "https://drive.google.com/uc?export=download&id=1a2B3c4D5e6F7g8H9i"
  );
  assert.equal(
    links.directImageUrl("https://www.dropbox.com/s/abc/hotell.jpg?dl=0"),
    "https://www.dropbox.com/s/abc/hotell.jpg?raw=1"
  );
  assert.equal(links.directImageUrl("https://images.example.com/a.jpg?w=1600"), "https://images.example.com/a.jpg?w=1600");
});

// ---------------------------------------------------------------------------
// Hardening (from review)
// ---------------------------------------------------------------------------
function tinyXlsx(sheetXml) {
  return zipToBuffer([
    { name: "xl/workbook.xml", buffer: Buffer.from('<workbook><sheets><sheet name="A" r:id="rId1"/></sheets></workbook>') },
    { name: "xl/worksheets/sheet1.xml", buffer: Buffer.from("<worksheet><sheetData>" + sheetXml + "</sheetData></worksheet>") },
  ]);
}

test("an XLSX with an absurd row or column number is refused, not allocated", async () => {
  const cell = '<c r="A1" t="inlineStr"><is><t>x</t></is></c>';
  await assert.rejects(async () => xlsx.readFirstSheet(await tinyXlsx('<row r="4000000000">' + cell + "</row>")), /for stort/);
  await assert.rejects(
    async () => xlsx.readFirstSheet(await tinyXlsx('<row r="1"><c r="ZZZZZZ1" t="inlineStr"><is><t>x</t></is></c></row>')),
    /kolonner/
  );
});

test("a self-closing XLSX row does not swallow the next one", async () => {
  const { table } = xlsx.readFirstSheet(
    await tinyXlsx(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Overskrift</t></is></c></row>' +
        '<row r="2" ht="30" customHeight="1"/>' +
        '<row r="3"><c r="A3" t="inlineStr"><is><t>Hei</t></is></c></row>'
    )
  );
  assert.deepEqual(table, [["Overskrift"], [], ["Hei"]]);
});

test("focus words with æøå and Turkish letters are recognised", () => {
  assert.deepEqual(sheet.parseFocus("øverst til venstre"), { x: 0, y: 0 });
  assert.deepEqual(sheet.parseFocus("Øverst"), { x: 50, y: 0 });
  assert.deepEqual(sheet.parseFocus("sağ üst"), { x: 100, y: 0 });
});
