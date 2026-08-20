/* =========================================================================
   formats.js — SINGLE SOURCE OF TRUTH for what this tool can produce.

   Three products, each with its own set of banner formats:
     • norsktipping — the original four Norsk Tipping placements
     • readpeak     — the same two ReadPeak placements sold to any advertiser,
                      so without the 18+/Hjelpelinjen mark and without the
                      Vinnersjanse strip (both are Norsk Tipping obligations)
     • houseads     — abc shopping's own four house formats, Noto Serif on
                      white, ANNONSE + logo across the top

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
  var NT_READPEAK = {
    key: "readpeak", type: "readpeak", file: TEMPLATE,
    width: 308, height: 380, label: "readpeak-308x380",
    media: { width: 308, height: 160 },
    name: "ReadPeak",
  };
  var NT_DESKTOP = {
    key: "desktop", type: "desktop", file: TEMPLATE,
    width: 580, height: 500, label: "desktop-580x500",
    media: { width: 580, height: 355 },
    name: "Desktop",
  };
  var NT_MOBILE = {
    key: "mobile", type: "mobile", file: TEMPLATE,
    width: 320, height: 400, label: "mobile-320x400",
    media: { width: 320, height: 275 },
    name: "Mobil",
  };
  var NT_NEWSGRID = {
    key: "newsgrid", type: "newsgrid", file: TEMPLATE,
    width: 190, height: 190, label: "newsgrid-190x190",
    media: { width: 190, height: 107 },
    name: "Nyhetsgrid", hint: "forsiden",
  };

  // ---- ReadPeak (generic advertiser) -------------------------------------
  // Deliberately the same geometry as the Norsk Tipping pair — the placements
  // are identical, only the regulated furniture comes off.
  var RP_READPEAK = {
    key: "readpeak", type: "readpeak", file: TEMPLATE,
    width: 308, height: 380, label: "readpeak-308x380",
    media: { width: 308, height: 160 },
    name: "ReadPeak",
  };
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
  var HA_MOBILE = {
    key: "house-mobile", type: "house-mobile", file: TEMPLATE,
    width: 320, height: 400, label: "house-320x400",
    media: { width: 320, height: 242 },
    name: "Mobil", hint: "320×400",
    headline: { size: 22, lines: 3 },
  };
  var HA_PANORAMA = {
    key: "house-panorama", type: "house-panorama", file: TEMPLATE,
    width: 980, height: 300, label: "house-980x300",
    media: { width: 514, height: 243 },
    name: "Toppbanner", hint: "980×300",
    headline: { size: 31, lines: 3 },
  };
  var HA_DESKTOP = {
    key: "house-desktop", type: "house-desktop", file: TEMPLATE,
    width: 580, height: 500, label: "house-580x500",
    media: { width: 580, height: 314 },
    name: "Desktop", hint: "580×500",
    headline: { size: 26.5, lines: 2 },
  };
  var HA_SKYSCRAPER = {
    key: "house-skyscraper", type: "house-skyscraper", file: TEMPLATE,
    width: 300, height: 600, label: "house-300x600",
    media: { width: 300, height: 323 },
    name: "Skyskraper", hint: "300×600",
    headline: { size: 25.7, lines: 4 },
  };

  var PRODUCTS = {
    norsktipping: {
      id: "norsktipping",
      label: "Norsk Tipping",
      // Which typeface the HTML5 packages have to carry for this product.
      fontPrefix: "arimo-",
      specs: [NT_READPEAK, NT_DESKTOP, NT_MOBILE, NT_NEWSGRID],
      // Regulated furniture: the 18+/Hjelpelinjen mark and the Vinnersjanse
      // strip only belong on Norsk Tipping's own placements.
      ageBadge: true,
      vinnersjanse: true,
      // Fields the form offers for this product.
      fields: ["subtitle", "brandLabel", "gameType", "lesMer"],
      brandLabelDefault: "NORSK TIPPING",
      // Download packages, in the order they appear in the UI.
      sets: [
        { id: "all", label: "Alle 4", keys: ["readpeak", "desktop", "mobile", "newsgrid"], count: "4 størrelser" },
        { id: "core", label: "Kun de 3 første", keys: ["readpeak", "desktop", "mobile"], count: "3 størrelser" },
        { id: "newsgrid", label: "Kun Nyhetsgrid 190×190", keys: ["newsgrid"], count: "1 størrelse (190×190)" },
      ],
      defaultSet: "all",
    },

    readpeak: {
      id: "readpeak",
      label: "ReadPeak",
      fontPrefix: "arimo-",
      specs: [RP_READPEAK, RP_NEWSGRID],
      ageBadge: false,
      vinnersjanse: false,
      fields: ["subtitle", "brandLabel", "lesMer", "ctaText"],
      brandLabelDefault: "",
      sets: [
        { id: "all", label: "Begge", keys: ["readpeak", "newsgrid"], count: "2 størrelser" },
        { id: "readpeak", label: "Kun ReadPeak 308×380", keys: ["readpeak"], count: "1 størrelse (308×380)" },
        { id: "newsgrid", label: "Kun Nyhetsgrid 190×190", keys: ["newsgrid"], count: "1 størrelse (190×190)" },
      ],
      defaultSet: "all",
    },

    houseads: {
      id: "houseads",
      label: "Houseads",
      fontPrefix: "noto-serif-",
      specs: [HA_MOBILE, HA_PANORAMA, HA_DESKTOP, HA_SKYSCRAPER],
      ageBadge: false,
      vinnersjanse: false,
      // Headline and image only — the header (ANNONSE + abc shopping) is fixed
      // furniture on every house format.
      fields: [],
      brandLabelDefault: "",
      sets: [
        { id: "all", label: "Alle 4", keys: ["house-mobile", "house-panorama", "house-desktop", "house-skyscraper"], count: "4 størrelser" },
        { id: "house-mobile", label: "320×400", keys: ["house-mobile"], count: "1 størrelse (320×400)" },
        { id: "house-panorama", label: "980×300", keys: ["house-panorama"], count: "1 størrelse (980×300)" },
        { id: "house-desktop", label: "580×500", keys: ["house-desktop"], count: "1 størrelse (580×500)" },
        { id: "house-skyscraper", label: "300×600", keys: ["house-skyscraper"], count: "1 størrelse (300×600)" },
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

  function hasField(productId, field) {
    return getProduct(productId).fields.indexOf(field) !== -1;
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
  };
});
