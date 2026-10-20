/* =========================================================================
   live-data.js — the data side of NT Live: a match sheet turned into the
   slides a dynamic Norsk Tipping creative shows TODAY.

   Loaded in three places, so it is one UMD file with no dependencies:
     • the server (require)       — reads the sheet the user pasted, validates
                                    it and bakes the rows into the package
     • the app (global LiveData)  — the live preview
     • the creative itself        — inlined into index.html, so an ad that
                                    refreshes from the sheet at serve time
                                    reads it with exactly the same rules

   Rules worth knowing:
     • A row is one match: a date, a kick-off time, two teams (or one "Kamp"
       cell), and optionally a link, a photo, a video, an animation preset, a
       button text and a competition name. Columns are read by header, in
       Norwegian, English or Turkish, in any order.
     • "Today" is today in Norway (Europe/Oslo), whatever clock the viewer's
       machine runs. The creative only ever shows the kick-off TIME, never the
       date — the date is what decides whether the row is shown at all.
     • A match leaves the rotation `finishedAfterMin` minutes after kick-off.
       Until then it says "Pågår nå" once it has started.
     • No match today → the next day with matches within `lookAheadDays`
       ("I morgen kl. 21:00", "Lørdag kl. 18:00"), else the fallback slide.
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LiveData = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var TIME_ZONE = "Europe/Oslo";
  var DAY_MS = 86400000;
  var HEADER_SCAN_ROWS = 10;
  var MAX_ROWS = 500;

  var DEFAULTS = {
    finishedAfterMin: 120,
    lookAheadDays: 1,
    maxSlides: 6,
    timeMode: "clock", // "clock" | "countdown" | "both"
    clockSep: ":", // "21:00" or "21.00"
    liveLabel: "Pågår nå",
    startsLabel: "Starter",
  };

  var WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
  var MONTHS_SHORT = ["jan.", "feb.", "mars", "april", "mai", "juni", "juli", "aug.", "sep.", "okt.", "nov.", "des."];

  /**
   * Column aliases, compared folded (see fold()). An alias is matched exactly
   * first, then as a prefix ("Dato (dd.mm.åååå)" still means dato).
   */
  var FIELDS = {
    date: ["dato", "kampdato", "dag", "date", "matchdate", "day", "tarih", "mactarihi", "gun"],
    time: ["tid", "klokkeslett", "kl", "klokka", "klokken", "avspark", "starttid", "kampstart", "time", "kickoff", "kickofftime", "start", "starttime", "saat", "baslangic"],
    home: ["hjemmelag", "hjemme", "lag1", "home", "hometeam", "team1", "evsahibi", "takim1"],
    away: ["bortelag", "borte", "lag2", "away", "awayteam", "team2", "deplasman", "takim2"],
    match: ["kamp", "oppgjor", "match", "fixture", "game", "event", "mac", "karsilasma"],
    league: ["turnering", "liga", "serie", "konkurranse", "league", "competition", "tournament", "lig", "turnuva"],
    link: ["lenke", "klikklenke", "klikkurl", "landingsside", "url", "link", "clickurl", "clicktag", "landingpage", "baglanti", "hedefurl"],
    image: ["bilde", "bildelenke", "bildeurl", "foto", "image", "imageurl", "photo", "picture", "resim", "gorsel"],
    video: ["video", "videolenke", "videourl", "film", "mp4", "klipp", "videolink"],
    animation: ["animasjon", "effekt", "bakgrunn", "animation", "effect", "background", "animasyon", "efekt"],
    cta: ["knapp", "knappetekst", "cta", "ctatekst", "buttontext", "button", "buton", "butonmetni"],
    text: ["tekst", "undertekst", "ingress", "beskrivelse", "text", "subtitle", "description", "aciklama"],
    headline: ["overskrift", "tittel", "headline", "title", "baslik"],
    odds: ["odds", "oddsen", "kurs", "oran", "oranlar"],
  };

  var NOT_A_FIELD = ["bildetekst", "bildekreditt", "fotograf", "imagecredit", "caption", "linktext", "lenketekst", "datoformat", "dateformat"];

  /** Lowercase, æøå folded, letters and digits only. */
  function fold(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .replace(/å/g, "a")
      .replace(/ı/g, "i")
      .replace(/ş/g, "s")
      .replace(/ğ/g, "g")
      .replace(/ç/g, "c")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  var ALIAS_TO_FIELD = (function () {
    var map = {};
    Object.keys(FIELDS).forEach(function (field) {
      FIELDS[field].forEach(function (alias) {
        map[alias] = field;
      });
    });
    return map;
  })();
  var ALIASES_BY_LENGTH = Object.keys(ALIAS_TO_FIELD).sort(function (a, b) {
    return b.length - a.length;
  });

  function fieldForHeader(header) {
    var folded = fold(header);
    if (!folded) return null;
    if (ALIAS_TO_FIELD[folded]) return ALIAS_TO_FIELD[folded];
    for (var i = 0; i < NOT_A_FIELD.length; i++) {
      if (folded.indexOf(NOT_A_FIELD[i]) === 0) return null;
    }
    for (var j = 0; j < ALIASES_BY_LENGTH.length; j++) {
      var alias = ALIASES_BY_LENGTH[j];
      // Short aliases ("kl", "mac", "tid") only count when they are the
      // whole header: as prefixes they would match far too much.
      if (alias.length >= 4 && folded.indexOf(alias) === 0) return ALIAS_TO_FIELD[alias];
    }
    return null;
  }

  // ------------------------------------------------------------------------
  // CSV
  // ------------------------------------------------------------------------
  function detectDelimiter(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); }).slice(0, 10);
    var best = ",";
    var bestScore = -1;
    [",", ";", "\t"].forEach(function (d) {
      var counts = lines.map(function (l) { return countOutsideQuotes(l, d); });
      var nonZero = counts.filter(function (c) { return c > 0; });
      if (!nonZero.length) return;
      var mode = mostCommon(nonZero);
      var score = counts.filter(function (c) { return c === mode; }).length * 10 + mode;
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    });
    return best;
  }

  function countOutsideQuotes(line, d) {
    var n = 0;
    var inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (!inQ && ch === d) n++;
    }
    return n;
  }

  function mostCommon(arr) {
    var seen = {};
    var best = arr[0];
    var bestN = 0;
    arr.forEach(function (v) {
      seen[v] = (seen[v] || 0) + 1;
      if (seen[v] > bestN) {
        bestN = seen[v];
        best = v;
      }
    });
    return best;
  }

  /** RFC 4180 parse: quoted cells, doubled quotes, CR/LF inside quotes. */
  function parseCsv(text, delimiter) {
    var src = String(text == null ? "" : text).replace(/^﻿/, "");
    var d = delimiter || detectDelimiter(src);
    var rows = [];
    var row = [];
    var cell = "";
    var inQ = false;
    for (var i = 0; i < src.length; i++) {
      var ch = src[i];
      if (inQ) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            cell += '"';
            i++;
          } else {
            inQ = false;
          }
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === d) {
        row.push(cell);
        cell = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && src[i + 1] === "\n") i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += ch;
      }
    }
    if (cell !== "" || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ""; });
    });
  }

  // ------------------------------------------------------------------------
  // Dates and times
  // ------------------------------------------------------------------------
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  /**
   * "20.10.2026", "20/10/2026", "20-10-2026", "2026-10-20", "20.10.26",
   * "20.10" (this year), and a cell that also carries a time → "YYYY-MM-DD".
   */
  function parseDate(value, refYear) {
    var s = String(value == null ? "" : value).trim();
    if (!s) return null;
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    var y;
    var mo;
    var d;
    if (m) {
      y = +m[1];
      mo = +m[2];
      d = +m[3];
    } else {
      m = /^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?(?!\d)/.exec(s);
      if (!m) return null;
      d = +m[1];
      mo = +m[2];
      y = m[3] ? +m[3] : refYear || new Date().getFullYear();
      if (y < 100) y += 2000;
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var check = new Date(Date.UTC(y, mo - 1, d));
    if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
    return y + "-" + pad2(mo) + "-" + pad2(d);
  }

  /** "21:00", "21.00", "kl. 21:00", "2100", "21" → "21:00". */
  function parseTime(value) {
    var s = String(value == null ? "" : value).trim().toLowerCase().replace(/^kl\.?\s*/, "");
    if (!s) return null;
    // A date cell that also carries the time: take what follows the date.
    var tail = /(\d{1,2})[:.h](\d{2})(?!\d)/.exec(s);
    var h;
    var mi;
    if (tail) {
      h = +tail[1];
      mi = +tail[2];
    } else if (/^\d{4}$/.test(s)) {
      h = +s.slice(0, 2);
      mi = +s.slice(2);
    } else if (/^\d{1,2}$/.test(s)) {
      h = +s;
      mi = 0;
    } else {
      return null;
    }
    if (h > 23 || mi > 59) return null;
    return pad2(h) + ":" + pad2(mi);
  }

  /** Wall-clock parts of an instant in Norway. */
  function osloParts(date) {
    var dt = date instanceof Date ? date : new Date(date);
    try {
      var fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      });
      var p = {};
      fmt.formatToParts(dt).forEach(function (part) { p[part.type] = part.value; });
      var hour = +p.hour === 24 ? 0 : +p.hour;
      return { ymd: p.year + "-" + p.month + "-" + p.day, minutes: hour * 60 + +p.minute, seconds: +p.second };
    } catch (e) {
      return {
        ymd: dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate()),
        minutes: dt.getHours() * 60 + dt.getMinutes(),
        seconds: dt.getSeconds(),
      };
    }
  }

  /** Minutes Norway is ahead of UTC at a given instant (60 or 120). */
  function osloOffsetMinutes(date) {
    var parts = osloParts(date);
    var ymd = parts.ymd.split("-");
    var wallAsUtc = Date.UTC(+ymd[0], +ymd[1] - 1, +ymd[2], Math.floor(parts.minutes / 60), parts.minutes % 60, parts.seconds);
    return Math.round((wallAsUtc - date.getTime()) / 60000);
  }

  /** The instant (ms) a Norwegian wall-clock date + time happens. */
  function kickoffMs(ymd, hm) {
    if (!ymd) return NaN;
    var d = ymd.split("-");
    var t = (hm || "00:00").split(":");
    var guess = Date.UTC(+d[0], +d[1] - 1, +d[2], +t[0], +t[1]);
    var offset = osloOffsetMinutes(new Date(guess));
    var first = guess - offset * 60000;
    // Re-check around a DST switch, where the offset at the guess and at the
    // real instant can differ.
    var offset2 = osloOffsetMinutes(new Date(first));
    return guess - offset2 * 60000;
  }

  function ymdToUtc(ymd) {
    var d = ymd.split("-");
    return Date.UTC(+d[0], +d[1] - 1, +d[2]);
  }

  function dayDiff(fromYmd, toYmd) {
    return Math.round((ymdToUtc(toYmd) - ymdToUtc(fromYmd)) / DAY_MS);
  }

  function weekdayOf(ymd) {
    return WEEKDAYS[new Date(ymdToUtc(ymd)).getUTCDay()];
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /** "I dag", "I morgen", "Lørdag", or "Lørdag 25. okt." further out. */
  function dayWord(offset, ymd) {
    if (offset === 0) return "I dag";
    if (offset === 1) return "I morgen";
    var word = capitalize(weekdayOf(ymd));
    if (offset > 6) {
      var d = ymd.split("-");
      word += " " + +d[2] + ". " + MONTHS_SHORT[+d[1] - 1];
    }
    return word;
  }

  // ------------------------------------------------------------------------
  // Rows
  // ------------------------------------------------------------------------
  function isUrl(value) {
    return /^https?:\/\/\S+$/i.test(String(value || "").trim());
  }

  /**
   * A Drive or Dropbox share link rewritten to the form that returns the
   * file itself. Anything else passes through.
   */
  function directMediaUrl(raw) {
    var value = String(raw || "").trim();
    var m = /drive\.google\.com\/(?:file\/d\/([\w-]{10,})|(?:open|uc)\?(?:.*&)?id=([\w-]{10,}))/.exec(value);
    if (m) return "https://drive.google.com/uc?export=download&id=" + (m[1] || m[2]);
    if (/^https?:\/\/(www\.)?dropbox\.com\//.test(value)) {
      return value.replace(/[?&]dl=\d/, "").replace(/([?&])raw=1/, "") + (value.indexOf("?") === -1 ? "?raw=1" : "&raw=1");
    }
    return value;
  }

  /** "Real Madrid - Liverpool", "Arsenal – PSG", "Barcelona vs Bayern" → two names. */
  function splitMatch(value) {
    var s = String(value || "").trim();
    if (!s) return null;
    var m = /^(.+?)\s+(?:-|–|—|vs\.?|v\.?|mot)\s+(.+)$/i.exec(s);
    if (!m) return { home: s, away: "" };
    return { home: m[1].trim(), away: m[2].trim() };
  }

  function clean(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  /**
   * One sheet row → one normalised match. `raw` is keyed by field name.
   * Returns { row, problems[] }; a row without a date is unusable.
   */
  function normalizeRow(raw, index) {
    var problems = [];
    var date = parseDate(raw.date);
    var time = parseTime(raw.time) || (raw.date ? parseTime(String(raw.date).replace(/^[\d./-]+\s*/, "")) : null);
    var home = clean(raw.home);
    var away = clean(raw.away);
    if ((!home || !away) && raw.match) {
      var parts = splitMatch(raw.match);
      if (parts) {
        home = home || parts.home;
        away = away || parts.away;
      }
    }
    var headline = clean(raw.headline);
    var title = headline || (home && away ? home + " – " + away : home || away);
    if (!date) problems.push(raw.date ? "Datoen «" + clean(raw.date) + "» ble ikke forstått (bruk dd.mm.åååå)" : "Mangler dato");
    if (!time) problems.push(raw.time ? "Klokkeslettet «" + clean(raw.time) + "» ble ikke forstått (bruk tt:mm)" : "Mangler klokkeslett");
    if (!title) problems.push("Mangler lag (Hjemmelag/Bortelag eller Kamp)");
    var link = clean(raw.link);
    if (link && !isUrl(link)) problems.push("Lenken må starte med https://");
    var image = clean(raw.image);
    var video = clean(raw.video);
    if (image && !isUrl(image)) problems.push("Bildelenken må starte med https://");
    if (video && !isUrl(video)) problems.push("Videolenken må starte med https://");
    return {
      row: {
        id: "r" + index,
        date: date,
        time: time,
        home: home,
        away: away,
        title: title,
        league: clean(raw.league),
        link: isUrl(link) ? link : "",
        image: isUrl(image) ? image : "",
        video: isUrl(video) ? video : "",
        animation: fold(raw.animation),
        cta: clean(raw.cta),
        text: clean(raw.text),
        odds: clean(raw.odds),
      },
      problems: problems,
    };
  }

  function headerScore(cells) {
    var fields = {};
    cells.forEach(function (c) {
      var f = fieldForHeader(c);
      if (f) fields[f] = true;
    });
    var n = Object.keys(fields).length;
    var anchored = fields.date || fields.match || (fields.home && fields.away);
    return anchored ? n : 0;
  }

  /**
   * A parsed table (array of arrays) → normalised rows plus what was found.
   * @returns {{rows:Array, columns:Object, headerRow:number, warnings:Array}}
   */
  function readTable(table) {
    var best = -1;
    var bestScore = 1;
    var limit = Math.min(HEADER_SCAN_ROWS, table.length);
    for (var i = 0; i < limit; i++) {
      var score = headerScore(table[i]);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best === -1) {
      return {
        rows: [],
        columns: {},
        headerRow: -1,
        warnings: [{ row: 0, message: "Fant ingen overskriftsrad. Arket trenger minst kolonnene Dato, Tid og Kamp (eller Hjemmelag og Bortelag)." }],
      };
    }
    var columns = {};
    table[best].forEach(function (cell, col) {
      var f = fieldForHeader(cell);
      if (f && columns[f] == null) columns[f] = col;
    });
    var rows = [];
    var warnings = [];
    var body = table.slice(best + 1, best + 1 + MAX_ROWS);
    body.forEach(function (cells, k) {
      var raw = {};
      Object.keys(columns).forEach(function (f) {
        raw[f] = cells[columns[f]];
      });
      var filled = Object.keys(raw).some(function (f) { return clean(raw[f]); });
      if (!filled) return;
      var sheetRow = best + 2 + k; // 1-based, as the user sees it in Sheets
      var out = normalizeRow(raw, k);
      out.row.sheetRow = sheetRow;
      out.problems.forEach(function (message) {
        warnings.push({ row: sheetRow, message: message });
      });
      if (out.row.date && out.row.title) rows.push(out.row);
    });
    if (table.length - (best + 1) > MAX_ROWS) {
      warnings.push({ row: 0, message: "Bare de første " + MAX_ROWS + " radene er lest." });
    }
    return { rows: rows, columns: columns, headerRow: best, warnings: warnings };
  }

  // ------------------------------------------------------------------------
  // Picking today's slides
  // ------------------------------------------------------------------------
  function opt(options, key) {
    var o = options || {};
    var v = o[key];
    return v == null || v === "" ? DEFAULTS[key] : v;
  }

  function isFinished(row, nowMs, finishedAfterMin) {
    if (!row.time) return false;
    var start = kickoffMs(row.date, row.time);
    return isFinite(start) && start + finishedAfterMin * 60000 <= nowMs;
  }

  function byTime(a, b) {
    var ta = a.time || "99:99";
    var tb = b.time || "99:99";
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  }

  /**
   * The rows to rotate through right now.
   * @returns {{scope:"today"|"next"|"none", dayOffset:number, ymd:string, slides:Array}}
   */
  function select(rows, now, options) {
    var nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
    var today = osloParts(new Date(nowMs)).ymd;
    var finishedAfter = Number(opt(options, "finishedAfterMin"));
    var lookAhead = Math.max(0, Number(opt(options, "lookAheadDays")));
    var maxSlides = Math.max(1, Number(opt(options, "maxSlides")));
    var valid = (rows || []).filter(function (r) { return r && r.date && r.title; });

    var todays = valid
      .filter(function (r) { return r.date === today && !isFinished(r, nowMs, finishedAfter); })
      .sort(byTime);
    if (todays.length) {
      return { scope: "today", dayOffset: 0, ymd: today, slides: todays.slice(0, maxSlides) };
    }
    var future = {};
    valid.forEach(function (r) {
      var offset = dayDiff(today, r.date);
      if (offset >= 1 && offset <= lookAhead) (future[offset] = future[offset] || []).push(r);
    });
    var offsets = Object.keys(future).map(Number).sort(function (a, b) { return a - b; });
    if (offsets.length) {
      var ymd = future[offsets[0]][0].date;
      return { scope: "next", dayOffset: offsets[0], ymd: ymd, slides: future[offsets[0]].sort(byTime).slice(0, maxSlides) };
    }
    return { scope: "none", dayOffset: 0, ymd: today, slides: [] };
  }

  function countdownWord(diffMs) {
    var total = Math.max(0, Math.round(diffMs / 1000));
    var days = Math.floor(total / 86400);
    var hours = Math.floor((total % 86400) / 3600);
    var mins = Math.floor((total % 3600) / 60);
    if (days >= 1) return "om " + days + " d " + hours + " t";
    if (hours >= 1) return "om " + hours + " t " + mins + " min";
    if (mins >= 1) return "om " + mins + " min";
    return "om " + (total % 60) + " sek";
  }

  function clockText(row, sep) {
    return row.time ? row.time.replace(":", sep) : "";
  }

  /**
   * What the time line says for one row at one instant.
   *   clock:      "I dag kl. 21:00"       /  "I morgen kl. 21:00"  /  "Pågår nå"
   *   countdown:  "Starter om 2 t 14 min" /  "Pågår nå"
   *   both:       "I dag kl. 21:00 · om 2 t 14 min"
   */
  function timeLabel(row, now, options) {
    var nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
    var mode = opt(options, "timeMode");
    var sep = opt(options, "clockSep");
    var today = osloParts(new Date(nowMs)).ymd;
    var offset = dayDiff(today, row.date);
    var day = dayWord(offset, row.date);
    if (!row.time) return day;
    var start = kickoffMs(row.date, row.time);
    var diff = start - nowMs;
    var clock = day + " kl. " + clockText(row, sep);
    if (diff <= 0) {
      var finishedAfter = Number(opt(options, "finishedAfterMin"));
      return diff > -finishedAfter * 60000 ? opt(options, "liveLabel") : clock;
    }
    if (mode === "countdown") return opt(options, "startsLabel") + " " + countdownWord(diff);
    if (mode === "both") return clock + " · " + countdownWord(diff);
    return clock;
  }

  /**
   * The example sheet: every column the tool reads, in the order people fill
   * them in, with a few days of realistic rows starting `fromDate`.
   * @returns {string[][]} header row first
   */
  function templateRows(fromDate) {
    var base = fromDate ? new Date(fromDate) : new Date();
    function day(offset) {
      var d = new Date(base.getTime() + offset * DAY_MS);
      return pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + d.getFullYear();
    }
    var oddsen = "https://www.norsk-tipping.no/sport/oddsen";
    return [
      ["Dato", "Tid", "Hjemmelag", "Bortelag", "Turnering", "Odds", "Knappetekst", "Lenke", "Bilde", "Video", "Animasjon", "Overskrift", "Tekst"],
      [day(0), "18:45", "Arsenal", "PSG", "Champions League", "2,05 - 3,60 - 3,40", "Spill nå", oddsen, "", "", "gradient", "", ""],
      [day(0), "21:00", "Real Madrid", "Liverpool", "Champions League", "2,30 - 3,50 - 2,95", "Se oddsen", oddsen, "", "", "lys", "", "Over 2,5 mål?"],
      [day(0), "21:00", "Galatasaray", "Barcelona", "Champions League", "3,90 - 3,80 - 1,85", "", oddsen, "", "", "striper", "", ""],
      [day(1), "18:45", "Bodø/Glimt", "Lazio", "Europa League", "2,40 - 3,40 - 2,80", "", oddsen, "", "", "puls", "", ""],
      [day(1), "21:00", "Tottenham", "Roma", "Europa League", "2,10 - 3,50 - 3,30", "", oddsen, "", "", "", "", ""],
      [day(3), "18:00", "Brann", "Molde", "Eliteserien", "2,15 - 3,50 - 3,10", "Spill nå", oddsen, "", "", "konfetti", "Toppkamp i Bergen", ""],
    ];
  }

  /** The example sheet as CSV text (semicolons, like Norwegian Excel). */
  function templateCsv(fromDate, delimiter) {
    var d = delimiter || ";";
    return templateRows(fromDate)
      .map(function (r) {
        return r.map(function (c) { return /[",;\t\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(d);
      })
      .join("\n") + "\n";
  }

  return {
    FIELDS: FIELDS,
    DEFAULTS: DEFAULTS,
    MAX_ROWS: MAX_ROWS,
    fold: fold,
    fieldForHeader: fieldForHeader,
    parseCsv: parseCsv,
    detectDelimiter: detectDelimiter,
    parseDate: parseDate,
    parseTime: parseTime,
    osloParts: osloParts,
    kickoffMs: kickoffMs,
    dayDiff: dayDiff,
    dayWord: dayWord,
    directMediaUrl: directMediaUrl,
    splitMatch: splitMatch,
    normalizeRow: normalizeRow,
    readTable: readTable,
    select: select,
    timeLabel: timeLabel,
    countdownWord: countdownWord,
    templateRows: templateRows,
    templateCsv: templateCsv,
  };
});
