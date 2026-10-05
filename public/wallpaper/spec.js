/* =========================================================================
   spec.js — the Wallpaper placement, as sold (see the "Spec Wallpaper" and
   "Produksjonsguide Wallpaper" sheets).

   Two separate creatives make one wallpaper:
     • background  1920×850 — sits behind the whole page. The site's 1000px
                               content column covers its middle, so only the
                               two sides (and the strip above the content)
                               are ever seen.
     • topbanner   1000×300 — sits at the top of that content column.

   Safe area: the background is centred in the browser, so on a 1280px screen
   only its middle 1280px is visible — and on a short screen only the top
   700px. Everything that has to be seen (logo, offer, CTA) goes inside
   1280×700. The top banner's safe area is the whole banner.

   Loaded by the browser (global WallpaperSpec) and by the server (require),
   so the editor, the renderer and the exporter can never disagree on a
   number.
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WallpaperSpec = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var BACKGROUND_W = 1920;
  var BACKGROUND_H = 850;
  var CONTENT_W = 1000; // the site's content column
  var SAFE_W = 1280;
  var SAFE_H = 700;
  var TOP_H = 300;

  var CONTENT_X = (BACKGROUND_W - CONTENT_W) / 2; // 460
  var SAFE_X = (BACKGROUND_W - SAFE_W) / 2; // 320

  var ARTBOARDS = {
    background: {
      key: "background",
      name: "Bakgrunn",
      label: "bakgrunn-1920x850",
      width: BACKGROUND_W,
      height: BACKGROUND_H,
      safe: { x: SAFE_X, y: 0, width: SAFE_W, height: SAFE_H },
      // Where the page sits on top of the background. Used for the
      // "Nettside" overlay and the site preview; never exported.
      site: {
        topbanner: { x: CONTENT_X, y: 0, width: CONTENT_W, height: TOP_H },
        content: { x: CONTENT_X, y: TOP_H, width: CONTENT_W, height: BACKGROUND_H - TOP_H },
      },
      // The two side strips that are guaranteed to be visible at 1280px.
      sideZones: [
        { x: SAFE_X, y: 0, width: CONTENT_X - SAFE_X, height: SAFE_H },
        { x: CONTENT_X + CONTENT_W, y: 0, width: CONTENT_X - SAFE_X, height: SAFE_H },
      ],
    },
    topbanner: {
      key: "topbanner",
      name: "Toppbanner",
      label: "toppbanner-1000x300",
      width: CONTENT_W,
      height: TOP_H,
      safe: { x: 0, y: 0, width: CONTENT_W, height: TOP_H },
      site: null,
      sideZones: [],
    },
  };

  var ORDER = ["background", "topbanner"];

  // Accepted by the ad server for each of the two files.
  var FILE_TYPES = ["jpg", "png", "gif"];
  // "Filstørrelse: 2 x 100KB" — one budget per file. Editable in the export
  // dialog, because the number is a sales term that has changed before.
  var DEFAULT_LIMIT_KB = 100;

  // Screen widths offered in the site preview.
  var PREVIEW_WIDTHS = [1280, 1440, 1680, 1920];

  function get(key) {
    return ARTBOARDS[key] || null;
  }

  return {
    ARTBOARDS: ARTBOARDS,
    ORDER: ORDER,
    FILE_TYPES: FILE_TYPES,
    DEFAULT_LIMIT_KB: DEFAULT_LIMIT_KB,
    PREVIEW_WIDTHS: PREVIEW_WIDTHS,
    CONTENT_W: CONTENT_W,
    get: get,
  };
});
