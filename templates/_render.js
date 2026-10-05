/* Shared init for all Puppeteer templates.
   Reads window.__DATA__ (injected by the server before navigation), renders
   the banner, then flips window.__BANNER_READY__ once fonts + images have
   finished loading so the server knows it is safe to screenshot. */
function __initBanner(type) {
  window.__BANNER_READY__ = false;
  window.__BANNER_ERROR__ = null;

  function whenImagesLoaded(cb) {
    var imgs = Array.prototype.slice.call(document.images);
    var pending = imgs.length;
    if (!pending) return cb();
    var done = function () {
      if (--pending === 0) cb();
    };
    imgs.forEach(function (img) {
      if (img.complete) {
        done();
      } else {
        img.addEventListener("load", done);
        img.addEventListener("error", done);
      }
    });
  }

  // Auto-sized headlines (Bulk, and Houseads with "Auto" on) were measured in
  // the user's browser. This re-measures in the browser that takes the actual
  // screenshot, with the real fonts loaded, and steps the size down if the
  // headline would be cut — so a different browser engine on the client can
  // never ship a clipped headline. What happened is reported in __FIT__.
  function verifyFit(root, type, data) {
    var check = data.autoFitCheck;
    if (!check || !window.BannerAutofit) return;
    // Only the formats whose size the auto rule picked; a size set by hand is
    // left exactly as the user chose it.
    if (Array.isArray(check.types) && check.types.indexOf(type) === -1) return;
    var A = window.BannerAutofit;
    var scales = Object.assign({}, data.headlineScales || {});
    var start = Number(scales[type]) || 1;
    var scale = start;
    var min = Number(check.min) || 0.7;
    var result = A.inspect(root);
    while (!result.fits && scale - A.STEP >= min - 1e-6) {
      scale = Math.round((scale - A.STEP) * 100) / 100;
      scales[type] = scale;
      window.renderBanner(root, type, Object.assign({}, data, { headlineScales: scales }));
      result = A.inspect(root);
    }
    window.__FIT__ = { requested: start, scale: scale, fits: result.fits, brokenWord: result.brokenWord || "" };
  }

  function start() {
    try {
      var data = window.__DATA__ || {};
      var root = document.getElementById("banner-root");
      window.renderBanner(root, type, data);
      var fontsReady =
        document.fonts && document.fonts.ready
          ? document.fonts.ready
          : Promise.resolve();
      fontsReady
        .catch(function () {})
        .then(function () {
          verifyFit(root, type, data);
          whenImagesLoaded(function () {
            // double rAF so layout/paint settles before the screenshot
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                window.__BANNER_READY__ = true;
              });
            });
          });
        });
    } catch (err) {
      window.__BANNER_ERROR__ = String((err && err.stack) || err);
      window.__BANNER_READY__ = true; // unblock the server; it will inspect the error
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
}
