/* =========================================================================
   bulk/products.js — what Bulk needs to know about each banner product
   beyond its formats (those are in assets/formats.js): which sheet columns
   it reads, the defaults for fields left empty, the limits the single-banner
   form also holds them to, and the example sheet.

   Loaded by the server (require, lib/bulk/jobs.js and routes.js) AND by the
   browser (global BULK_PRODUCTS), so the template the page offers, the
   columns it shows and what the run accepts cannot drift apart.

   The banner itself is drawn exactly as the single-banner tabs draw it (see
   app.js buildData and server.js /api/generate): same renderer, same data
   fields, same defaults — only where the values come from differs.
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BULK_PRODUCTS = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  // The same caps as server.js /api/generate, so a bulk banner can hold
  // exactly what a single one can.
  var LIMITS = { headline: 200, subtitle: 120, brandLabel: 60, ctaText: 40, vinnersjanse: 120 };

  var COMMON = ["headline", "image", "filename", "focus", "zoom", "clickUrl"];

  // Free photos that stay reachable, for the example sheets.
  var PHOTO = {
    hotel: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=2000",
    pool: "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=2000",
    jacket: "https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=2000",
    sofa: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=2000",
    coffee: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=2000",
    kitchen: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=2000",
    friends: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=2000",
    aurora: "https://images.unsplash.com/photo-1507272931001-fc06c17e4f43?w=2000",
  };

  var PRODUCTS = {
    houseads: {
      id: "houseads",
      label: "Houseads",
      fields: COMMON.concat(["weight"]),
      template: [
        ["Overskrift", "Bildelenke", "Filnavn", "Skrift", "Fokus", "Klikk-lenke"],
        ["Spar opptil 50 % på hotell i høst", PHOTO.hotel, "hotell-host", "Halvfet", "", "https://www.abcnyheter.no/"],
        ["Gran Canarias 12 mest spektakulære designhotell", PHOTO.pool, "gran-canaria-designhotell", "Normal", "", ""],
        ["Vinterjakken alle snakker om er endelig på salg", PHOTO.jacket, "", "", "", ""],
        ["Ny sofa?", PHOTO.sofa, "", "", "", ""],
      ],
    },
    readpeak: {
      id: "readpeak",
      label: "Nyhetsgrid",
      fields: COMMON.concat(["subtitle", "brandLabel", "ctaText"]),
      // The wording real ReadPeak creatives run; the single tab starts at
      // "Les mer", which reads unfinished on its own.
      ctaDefault: "Les mer her",
      // A ReadPeak widget names its advertiser; without one it looks like
      // editorial content, so an empty Merkevare is worth a look.
      brandExpected: true,
      template: [
        ["Overskrift", "Ingress", "Bildelenke", "Merkevare", "Knappetekst", "Filnavn", "Klikk-lenke"],
        [
          "Slik får du kaffen til å smake som på kafé",
          "Baristaen forklarer de tre grepene som gjør størst forskjell hjemme.",
          PHOTO.coffee, "KAFFEHUSET", "Les mer her", "kaffe-kafe", "https://www.abcnyheter.no/",
        ],
        [
          "Fem kjøkkenvaner som sparer deg for tusenlapper",
          "Små endringer i hverdagen gir merkbart lavere strømregning.",
          PHOTO.kitchen, "KAFFEHUSET", "Se tipsene", "", "",
        ],
        ["Her ser du nordlyset best i vinter", "", PHOTO.aurora, "", "", "", ""],
        ["Ny sofa til stua?", "Vi har testet årets mest populære modeller.", PHOTO.sofa, "", "Sjekk utvalget", "", ""],
      ],
    },
    norsktipping: {
      id: "norsktipping",
      label: "Norsk Tipping",
      fields: COMMON.concat(["subtitle", "brandLabel", "gameType", "vinnersjanse"]),
      // No call-to-action field on the Norsk Tipping form: it always says this.
      ctaFixed: "Les mer",
      // Calm, factual copy: draws, deadlines and the jackpot as a number —
      // never a promise of winning. The 18+/Hjelpelinjen mark is added to
      // every banner by the renderer.
      template: [
        ["Overskrift", "Ingress", "Bildelenke", "Spilltype", "Vinnersjanse", "Filnavn", "Klikk-lenke"],
        [
          "Lørdagens Lotto-trekning nærmer seg",
          "Husk å levere kupongen før kl. 18.00. Spill med måte.",
          PHOTO.coffee, "Lotto", "", "lotto-lordag", "https://www.norsk-tipping.no/",
        ],
        [
          "Vikinglotto trekkes onsdag",
          "Rekker kan leveres i appen eller hos kommisjonær fram til kl. 18.00.",
          PHOTO.aurora, "Vikinglotto", "", "", "",
        ],
        ["Eurojackpot: trekning fredag kveld", "", PHOTO.kitchen, "Eurojackpot", "", "", ""],
        ["Følg kampene fra helgens runde", "Oddsen oppdateres fortløpende.", PHOTO.friends, "Sport", "", "", ""],
      ],
    },
  };

  var ORDER = ["houseads", "readpeak", "norsktipping"];
  var DEFAULT = "houseads";

  function get(id) {
    return PRODUCTS[id] || PRODUCTS[DEFAULT];
  }

  function isId(id) {
    return ORDER.indexOf(id) !== -1;
  }

  function hasField(id, field) {
    return get(id).fields.indexOf(field) !== -1;
  }

  /** Lowercase, æøå folded, letters and digits only (as sheet.js fold()). */
  function fold(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  /**
   * The game preset a sheet's «Spilltype» names — by id or label, ignoring
   * case and punctuation ("Vikinglotto", "viking lotto", "Sport (ingen
   * vinnersjanse)" and "sport" all work). Null when it names none.
   *
   * @param {string} value
   * @param {Array<{id:string,label:string,vinnersjanse:string}>} presets
   */
  function matchGame(value, presets) {
    var v = fold(value);
    if (!v) return null;
    var list = presets || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (fold(p.id) === v || fold(p.label) === v) return p;
    }
    // "Sport" for "Sport (ingen vinnersjanse)": the label's first word.
    for (var j = 0; j < list.length; j++) {
      var first = fold(String(list[j].label || "").split(/[\s(]/)[0]);
      if (first && first === v) return list[j];
    }
    return null;
  }

  /**
   * The odds line a Norsk Tipping row carries: its own «Vinnersjanse» text,
   * else its game's, else the run's default game's.
   */
  function vinnersjanseFor(row, presets, defaultGameId) {
    var own = String(row.vinnersjanse || "").trim();
    if (own) return own;
    var game = matchGame(row.gameType, presets) || matchGame(defaultGameId, presets);
    return game ? String(game.vinnersjanse || "") : "";
  }

  /** The example sheet as CSV (UTF-8 with a BOM, so Excel reads æøå). */
  function templateCsv(id) {
    var cell = function (v) {
      return /[",\n\r]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    };
    return "﻿" + get(id).template.map(function (r) { return r.map(cell).join(","); }).join("\r\n") + "\r\n";
  }

  return {
    LIMITS: LIMITS,
    PRODUCTS: PRODUCTS,
    ORDER: ORDER,
    DEFAULT: DEFAULT,
    get: get,
    isId: isId,
    hasField: hasField,
    matchGame: matchGame,
    vinnersjanseFor: vinnersjanseFor,
    templateCsv: templateCsv,
  };
});
