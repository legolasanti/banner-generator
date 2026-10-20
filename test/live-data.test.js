"use strict";

/* NT Live data rules: how a match sheet is read, which rows are "today" in
   Norway, and what the time line says. The same file runs inside the
   creative, so these are the rules an ad in Campaign Manager 360 follows. */

const test = require("node:test");
const assert = require("node:assert/strict");

const LD = require("../public/assets/live-data.js");

// 2026-10-19 is a Monday. Norway is on CEST (UTC+2) until 25 October 2026.
const MON_1830 = new Date("2026-10-19T16:30:00Z"); // 18:30 Oslo
const MON_2230 = new Date("2026-10-19T20:30:00Z"); // 22:30 Oslo
const rows = LD.readTable(
  LD.parseCsv(
    [
      "Dato;Tid;Hjemmelag;Bortelag;Turnering;Lenke;Bilde;Animasjon",
      "19.10.2026;18:45;Arsenal;PSG;Champions League;https://nt.no/a;;gradient",
      "19.10.2026;21:00;Real Madrid;Liverpool;Champions League;https://nt.no/b;https://img.example/rm.jpg;",
      "19.10.2026;21:00;Galatasaray;Barcelona;;;;konfetti",
      "20.10.2026;20:00;Bodø/Glimt;Rosenborg;Eliteserien;;;",
      "24.10.2026;16:00;Brann;Molde;Eliteserien;;;",
    ].join("\n")
  )
).rows;

test("reading the sheet", async (t) => {
  await t.test("maps Norwegian, English and Turkish headers in any order", () => {
    const nb = LD.readTable([["Tid", "Kamp", "Dato"], ["21:00", "A - B", "20.10.2026"]]);
    assert.deepEqual(nb.columns, { time: 0, match: 1, date: 2 });
    const en = LD.readTable([["Match", "Date", "Kick-off", "Link"], ["A vs B", "2026-10-20", "21:00", "https://x.no"]]);
    assert.equal(en.rows[0].title, "A – B");
    assert.equal(en.rows[0].link, "https://x.no");
    const tr = LD.readTable([["Tarih", "Saat", "Ev sahibi", "Deplasman"], ["20.10.2026", "21.00", "A", "B"]]);
    assert.equal(tr.rows[0].time, "21:00");
    assert.equal(tr.rows[0].home, "A");
  });

  await t.test("skips title rows above the header and empty rows", () => {
    const out = LD.readTable([["Kamper uke 43"], [], ["Dato", "Tid", "Kamp"], ["20.10.2026", "21:00", "A - B"], ["", "", ""]]);
    assert.equal(out.headerRow, 2);
    assert.equal(out.rows.length, 1);
    assert.equal(out.rows[0].sheetRow, 4);
  });

  await t.test("reports what it could not read, row by row, and keeps the rest", () => {
    const out = LD.readTable([["Dato", "Tid", "Kamp", "Lenke"], ["ikke en dato", "21:00", "A - B", ""], ["20.10.2026", "", "C - D", "ftp://x"]]);
    assert.equal(out.rows.length, 1);
    assert.ok(out.warnings.some((w) => w.row === 2 && /Datoen/.test(w.message)));
    assert.ok(out.warnings.some((w) => w.row === 3 && /klokkeslett/i.test(w.message)));
    assert.ok(out.warnings.some((w) => w.row === 3 && /https/.test(w.message)));
    assert.equal(out.rows[0].link, "", "a bad link is dropped, not shipped");
  });

  await t.test("without a recognisable header there are no rows, and it says why", () => {
    const out = LD.readTable([["a", "b"], ["c", "d"]]);
    assert.equal(out.rows.length, 0);
    assert.match(out.warnings[0].message, /overskriftsrad/);
  });

  await t.test("parses the date and time formats people actually type", () => {
    assert.equal(LD.parseDate("20.10.2026"), "2026-10-20");
    assert.equal(LD.parseDate("20/10/2026"), "2026-10-20");
    assert.equal(LD.parseDate("2026-10-20"), "2026-10-20");
    assert.equal(LD.parseDate("5.1.26"), "2026-01-05");
    assert.equal(LD.parseDate("20.10.2026 21:00"), "2026-10-20");
    assert.equal(LD.parseDate("31.02.2026"), null);
    assert.equal(LD.parseTime("21:00"), "21:00");
    assert.equal(LD.parseTime("21.00"), "21:00");
    assert.equal(LD.parseTime("kl. 9:05"), "09:05");
    assert.equal(LD.parseTime("2100"), "21:00");
    assert.equal(LD.parseTime("25:00"), null);
  });

  await t.test("CSV parsing honours quotes and detects ; , and tab", () => {
    assert.deepEqual(LD.parseCsv('a,"b, c","d ""e"""\n1,2,3'), [["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
    assert.deepEqual(LD.parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
    assert.equal(LD.detectDelimiter("a;b;c\n1;2;3"), ";");
  });

  await t.test("Drive share links become direct links; others pass through", () => {
    assert.equal(LD.directMediaUrl("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing"), "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp");
    assert.equal(LD.directMediaUrl("https://cdn.example/x.jpg"), "https://cdn.example/x.jpg");
  });
});

test("picking today's matches (Norwegian time)", async (t) => {
  await t.test("today's unfinished matches, in kick-off order", () => {
    const picked = LD.select(rows, MON_1830, {});
    assert.equal(picked.scope, "today");
    assert.deepEqual(picked.slides.map((r) => r.title), ["Arsenal – PSG", "Real Madrid – Liverpool", "Galatasaray – Barcelona"]);
  });

  await t.test("a match leaves the rotation finishedAfterMin after kick-off", () => {
    // 22:30 Oslo: Arsenal (18:45) is out after 120 min, the 21:00 games stay.
    const picked = LD.select(rows, MON_2230, {});
    assert.deepEqual(picked.slides.map((r) => r.home), ["Real Madrid", "Galatasaray"]);
    // With 60 min the 21:00 games are over at 22:30 too, so the rotation
    // moves on to the next day with matches.
    const strict = LD.select(rows, MON_2230, { finishedAfterMin: 60 });
    assert.equal(strict.scope, "next");
    assert.equal(strict.slides[0].home, "Bodø/Glimt");
  });

  await t.test("no match today → the next day with matches within lookAheadDays, else none", () => {
    const wed = new Date("2026-10-21T10:00:00Z");
    assert.equal(LD.select(rows, wed, { lookAheadDays: 1 }).scope, "none");
    const next = LD.select(rows, wed, { lookAheadDays: 7 });
    assert.equal(next.scope, "next");
    assert.equal(next.dayOffset, 3);
    assert.equal(next.slides[0].home, "Brann");
  });

  await t.test("'today' is today in Norway, not in UTC", () => {
    // 23:30 UTC on the 19th is 01:30 on the 20th in Oslo → Tuesday's match.
    const picked = LD.select(rows, new Date("2026-10-19T23:30:00Z"), {});
    assert.equal(picked.scope, "today");
    assert.equal(picked.slides[0].home, "Bodø/Glimt");
  });

  await t.test("maxSlides caps the rotation", () => {
    assert.equal(LD.select(rows, MON_1830, { maxSlides: 2 }).slides.length, 2);
  });
});

test("the time line", async (t) => {
  const rm = rows[1]; // 21:00 today
  await t.test("clock mode: 'I dag kl. 21:00', with the chosen separator", () => {
    assert.equal(LD.timeLabel(rm, MON_1830, {}), "I dag kl. 21:00");
    assert.equal(LD.timeLabel(rm, MON_1830, { clockSep: "." }), "I dag kl. 21.00");
  });
  await t.test("countdown and both", () => {
    assert.equal(LD.timeLabel(rm, MON_1830, { timeMode: "countdown" }), "Starter om 2 t 30 min");
    assert.equal(LD.timeLabel(rm, MON_1830, { timeMode: "both" }), "I dag kl. 21:00 · om 2 t 30 min");
    assert.equal(LD.timeLabel(rm, new Date("2026-10-19T18:50:00Z"), { timeMode: "countdown" }), "Starter om 10 min");
  });
  await t.test("'Pågår nå' from kick-off until the match is dropped", () => {
    assert.equal(LD.timeLabel(rm, new Date("2026-10-19T19:30:00Z"), {}), "Pågår nå");
    assert.equal(LD.timeLabel(rm, new Date("2026-10-19T19:30:00Z"), { liveLabel: "Spilles nå" }), "Spilles nå");
  });
  await t.test("tomorrow and weekdays in Norwegian", () => {
    assert.equal(LD.timeLabel(rows[3], MON_1830, {}), "I morgen kl. 20:00");
    assert.equal(LD.timeLabel(rows[4], MON_1830, {}), "Lørdag kl. 16:00");
    assert.equal(LD.dayWord(8, "2026-10-27"), "Tirsdag 27. okt.");
  });
  await t.test("a row without a time only names the day", () => {
    const row = LD.normalizeRow({ date: "19.10.2026", match: "A - B" }, 0).row;
    assert.equal(LD.timeLabel(row, MON_1830, {}), "I dag");
  });
});

test("the example sheet reads back cleanly", () => {
  const out = LD.readTable(LD.parseCsv(LD.templateCsv(new Date("2026-10-19T12:00:00Z"))));
  assert.equal(out.rows.length, 6);
  assert.equal(out.warnings.length, 0);
  // Every column the tool reads is in the template, so it doubles as docs.
  assert.deepEqual(
    Object.keys(out.columns).sort(),
    ["animation", "away", "cta", "date", "headline", "home", "image", "league", "link", "odds", "text", "time", "video"]
  );
  assert.equal(out.rows[0].animation, "gradient");
});
