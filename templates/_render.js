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
