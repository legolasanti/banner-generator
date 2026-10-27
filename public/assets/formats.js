/* =========================================================================
   formats.js — SINGLE SOURCE OF TRUTH for what this tool can produce.

   Three products, each with its own set of banner formats:
     • norsktipping — Norsk Tipping's Desktop, Mobil and Nyhetsgrid placements
     • readpeak     — the Nyhetsgrid placement sold to any advertiser (shown
                      as «Nyhetsgrid»; the id stays "readpeak" so history,
                      settings and Bulk sheets keep working), without the
                      18+/Hjelpelinjen mark and without the Vinnersjanse strip
                      (both are Norsk Tipping obligations)
     • houseads     — abc shopping's own house formats, Noto Serif on white,
                      ANNONSE + logo across the top

   Loaded by the server (require) AND by the browser (global BannerFormats), so
   the format list, the pixel dimensions and the download sets can never drift
   apart between the two.

   `media` is the photo area inside the banner. It MUST stay in sync with the
   .bn__media heights in banner.css: the HTML5 export sizes the shipped photo
   from these numbers, and a mismatch ships a photo at the wrong resolution.
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BannerFormats = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  // Every format renders through the one generic Puppeteer template; the type
  // below is what picks the markup and the CSS.
  var TEMPLATE = "banner.html";

  // ---- Norsk Tipping -----------------------------------------------------
  // `fileStem` is what the downloaded file is called after the user's name:
  // "euro-fredaguke44-desktop_F1P0G1T0R0.png". Norsk Tipping's reports are
  // read by placement, and the size only made the names longer. `label`
  // stays the format's identity for settings (size limits) and history.
  var NT_DESKTOP = {
    key: "desktop", type: "desktop", file: TEMPLATE,
    width: 580, height: 500, label: "desktop-580x500", fileStem: "desktop",
    media: { width: 580, height: 355 },
    name: "Desktop",
  };
  var NT_MOBILE = {
    key: "mobile", type: "mobile", file: TEMPLATE,
    width: 320, height: 400, label: "mobile-320x400", fileStem: "mobile",
    media: { width: 320, height: 275 },
    name: "Mobil",
  };
  var NT_NEWSGRID = {
    key: "newsgrid", type: "newsgrid", file: TEMPLATE,
    width: 190, height: 190, label: "newsgrid-190x190", fileStem: "newsgrid",
    media: { width: 190, height: 107 },
    name: "Nyhetsgrid", hint: "forsiden",
  };

  // ---- Nyhetsgrid (generic advertiser) -----------------------------------
  // Deliberately the same geometry as Norsk Tipping's — the placement is
  // identical, only the regulated furniture comes off.
  var RP_NEWSGRID = {
    key: "newsgrid", type: "newsgrid", file: TEMPLATE,
    width: 190, height: 190, label: "newsgrid-190x190",
    media: { width: 190, height: 107 },
    name: "Nyhetsgrid", hint: "forsiden",
  };

  // ---- Houseads ----------------------------------------------------------
  // Photo areas are the measured proportions of the approved Canva creatives,
  // scaled to the real ad size. `headline` records the type spec that came with
  // them (Noto Serif at a fixed pt size, with a fixed number of lines) so the
  // UI can state the limit and banner.css can be checked against it.
  //
  // `autoFit` is the format's default text-size rule (see autofit.js): tiers
  // of [up to N characters, size], anything longer set at `min`. The numbers
  // are measured, not guessed: ~60 real Norwegian shop headlines, cut at every
  // word, rendered in each format at 130 %→70 %, each tier set where at least
  // 97 % of headlines that long still fit whole (bold, the tighter weight).
  // Short copy may grow to 120 %, but the first two tiers stop at ~40 % and
  // ~60 % of what fits at 100 %, so a headline only grows when it is genuinely
  // short. `maxChars` is what still fits at 70 % — past it the format cannot
  // take the headline at all. Innstillinger can override every rule.
  var HA_MOBILE = {
    key: "house-mobile", type: "house-mobile", file: TEMPLATE,
    width: 320, height: 400, label: "house-320x400",
    media: { width: 320, height: 242 },
    name: "Mobil", hint: "320×400",
    headline: { size: 22, lines: 3 },
    autoFit: { min: 0.7, max: 1.2, maxChars: 97, tiers: [[26, 1.2], [40, 1.1], [64, 1], [74, 0.9], [82, 0.8]] },
  };
  // The tall sibling of the toppbanner: same row layout (headline beside the
  // photo), but with the height to give the photo a plain 4:3 crop and the
  // headline four lines instead of three. No Canva original either; the header
  // is the desktop's, and the photo stops at 520px so the copy keeps a column
  // wide enough (376px, ~16 characters at 36px) for long Norwegian words.
  var HA_BILLBOARD = {
    key: "house-billboard", type: "house-billboard", file: TEMPLATE,
    width: 980, height: 500, label: "house-980x500",
    media: { width: 520, height: 420 },
    name: "Billboard", hint: "980×500",
    headline: { size: 36, lines: 4 },
    autoFit: { min: 0.7, max: 1.2, maxChars: 96, tiers: [[25, 1.2], [40, 1.1], [65, 1], [73, 0.9], [78, 0.8]] },
  };
  var HA_PANORAMA = {
    key: "house-panorama", type: "house-panorama", file: TEMPLATE,
    width: 980, height: 300, label: "house-980x300",
    media: { width: 514, height: 243 },
    name: "Toppbanner", hint: "980×300",
    headline: { size: 31, lines: 3 },
    autoFit: { min: 0.7, max: 1.2, maxChars: 85, tiers: [[25, 1.2], [39, 1.1], [63, 1], [66, 0.9], [77, 0.8]] },
  };
  var HA_DESKTOP = {
    key: "house-desktop", type: "house-desktop", file: TEMPLATE,
    width: 580, height: 500, label: "house-580x500",
    media: { width: 580, height: 314 },
    name: "Desktop", hint: "580×500",
    headline: { size: 26.5, lines: 2 },
    autoFit: { min: 0.7, max: 1.2, maxChars: 116, tiers: [[30, 1.2], [46, 1.1], [74, 1], [77, 0.9], [85, 0.8]] },
  };
  var HA_SKYSCRAPER = {
    key: "house-skyscraper", type: "house-skyscraper", file: TEMPLATE,
    width: 300, height: 600, label: "house-300x600",
    media: { width: 300, height: 323 },
    name: "Skyskraper", hint: "300×600",
    headline: { size: 25.7, lines: 4 },
    autoFit: { min: 0.7, max: 1.2, maxChars: 96, tiers: [[25, 1.2], [40, 1.1], [65, 1], [73, 0.9], [78, 0.8]] },
  };
  // The one house format with no Canva original to measure. Its proportions are
  // derived from the other four instead: same 300px width — and so the same
  // side padding and header type — as the skyscraper, a photo at ~47% of the
  // height (the family sits at 48–63%), and the largest headline that still
  // leaves three lines inside 250px.
  var HA_RECTANGLE = {
    key: "house-rectangle", type: "house-rectangle", file: TEMPLATE,
    width: 300, height: 250, label: "house-300x250",
    media: { width: 300, height: 122 },
    name: "Rektangel", hint: "300×250",
    headline: { size: 20, lines: 3 },
    autoFit: { min: 0.7, max: 1.2, maxChars: 97, tiers: [[26, 1.2], [35, 1.1], [66, 1], [74, 0.9], [82, 0.8]] },
  };

  var PRODUCTS = {
    norsktipping: {
      id: "norsktipping",
      label: "Norsk Tipping",
      // Which typeface the HTML5 packages have to carry for this product.
      fontPrefix: "arimo-",
      specs: [NT_DESKTOP, NT_MOBILE, NT_NEWSGRID],
      // Regulated furniture: the 18+/Hjelpelinjen mark and the Vinnersjanse
      // strip only belong on Norsk Tipping's own placements.
      ageBadge: true,
      vinnersjanse: true,
      // Fields the form offers for this product. Ingress, Merkevare and «Les
      // mer» belonged to the ReadPeak 308×380 only, which is no longer sold.
      fields: ["gameType"],
      // The five yes/no questions whose answers end the filename
      // (assets/filetags.js), so Ad Manager reports can be split on them.
      fileTags: true,
      brandLabelDefault: "NORSK TIPPING",
      // Download packages, in the order they appear in the UI.
      sets: [
        { id: "all", label: "Alle 3", keys: ["desktop", "mobile", "newsgrid"], count: "3 størrelser" },
        { id: "core", label: "Desktop + Mobil", keys: ["desktop", "mobile"], count: "2 størrelser" },
        { id: "newsgrid", label: "Kun Nyhetsgrid 190×190", keys: ["newsgrid"], count: "1 størrelse (190×190)" },
      ],
      defaultSet: "all",
    },

    readpeak: {
      id: "readpeak",
      label: "Nyhetsgrid",
      fontPrefix: "arimo-",
      specs: [RP_NEWSGRID],
      ageBadge: false,
      vinnersjanse: false,
      // Image and headline only: the 190×190 has no room for anything else.
      fields: [],
      brandLabelDefault: "",
      sets: [{ id: "all", label: "Nyhetsgrid 190×190", keys: ["newsgrid"], count: "1 størrelse (190×190)" }],
      defaultSet: "all",
    },

    houseads: {
      id: "houseads",
      label: "Houseads",
      fontPrefix: "noto-serif-",
      specs: [HA_MOBILE, HA_PANORAMA, HA_BILLBOARD, HA_DESKTOP, HA_SKYSCRAPER, HA_RECTANGLE],
      ageBadge: false,
      vinnersjanse: false,
      // Headline and image only — the header (ANNONSE + abc shopping) is fixed
      // furniture on every house format.
      fields: [],
      brandLabelDefault: "",
      sets: [
        {
          id: "all",
          label: "Alle 6",
          keys: ["house-mobile", "house-panorama", "house-billboard", "house-desktop", "house-skyscraper", "house-rectangle"],
          count: "6 størrelser",
        },
        { id: "house-mobile", label: "320×400", keys: ["house-mobile"], count: "1 størrelse (320×400)" },
        { id: "house-panorama", label: "980×300", keys: ["house-panorama"], count: "1 størrelse (980×300)" },
        { id: "house-billboard", label: "980×500", keys: ["house-billboard"], count: "1 størrelse (980×500)" },
        { id: "house-desktop", label: "580×500", keys: ["house-desktop"], count: "1 størrelse (580×500)" },
        { id: "house-skyscraper", label: "300×600", keys: ["house-skyscraper"], count: "1 størrelse (300×600)" },
        { id: "house-rectangle", label: "300×250", keys: ["house-rectangle"], count: "1 størrelse (300×250)" },
      ],
      defaultSet: "all",
    },
  };

  var ORDER = ["norsktipping", "readpeak", "houseads"];
  var DEFAULT_PRODUCT = "norsktipping";

  function getProduct(id) {
    return PRODUCTS[id] || PRODUCTS[DEFAULT_PRODUCT];
  }

  /** Every spec of a product, or just the ones in a named download set. */
  function specsFor(productId, setId) {
    var product = getProduct(productId);
    if (!setId) return product.specs.slice();
    var set = null;
    for (var i = 0; i < product.sets.length; i++) {
      if (product.sets[i].id === setId) set = product.sets[i];
    }
    if (!set) set = product.sets[0];
    return product.specs.filter(function (spec) {
      return set.keys.indexOf(spec.key) !== -1;
    });
  }

  function findSet(productId, setId) {
    var sets = getProduct(productId).sets;
    for (var i = 0; i < sets.length; i++) {
      if (sets[i].id === setId) return sets[i];
    }
    return sets[0];
  }

  function specByKey(productId, key) {
    var specs = getProduct(productId).specs;
    for (var i = 0; i < specs.length; i++) {
      if (specs[i].key === key) return specs[i];
    }
    return null;
  }

  /**
   * The text-size rule for one format: the saved override when there is one,
   * otherwise the measured default. Null for formats without auto-fit.
   * @param {Object} spec
   * @param {Object} [overrides] settings.autoFit, keyed by format label
   */
  function autoFitRule(spec, overrides) {
    if (!spec || !spec.autoFit) return null;
    var own = overrides && overrides[spec.label];
    if (!own) return spec.autoFit;
    return {
      min: own.min != null ? own.min : spec.autoFit.min,
      max: own.max != null ? own.max : spec.autoFit.max,
      maxChars: spec.autoFit.maxChars,
      tiers: Array.isArray(own.tiers) && own.tiers.length ? own.tiers : spec.autoFit.tiers,
    };
  }

  function hasField(productId, field) {
    return getProduct(productId).fields.indexOf(field) !== -1;
  }

  /** The format's part of a filename: "desktop" for Norsk Tipping, else the label. */
  function fileStem(spec) {
    return (spec && (spec.fileStem || spec.label)) || "banner";
  }

  return {
    PRODUCTS: PRODUCTS,
    ORDER: ORDER,
    DEFAULT_PRODUCT: DEFAULT_PRODUCT,
    TEMPLATE: TEMPLATE,
    getProduct: getProduct,
    specsFor: specsFor,
    findSet: findSet,
    specByKey: specByKey,
    hasField: hasField,
    fileStem: fileStem,
    autoFitRule: autoFitRule,
  };
});
