/* =========================================================================
   puff/media.js — getting files into the Artikkelpuff: which story each
   dropped file goes to, the upload itself (with progress), the size and
   length of a video, and the poster frame cut from it.

   The poster is cut here, in the browser, because the server has no video
   decoder (no ffmpeg on the machine): a frame drawn to a canvas becomes a
   JPEG upload like any photo. It is the still in the backup image and what
   the HTML5 creative shows until the video starts.
   ========================================================================= */
(function () {
  "use strict";

  var PUFF = (window.PUFF = window.PUFF || {});

  var IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif)$/i;
  var VIDEO_EXT = /\.(mp4|m4v|webm)$/i;
  var MAX_IMAGE = 15 * 1024 * 1024;
  var MAX_VIDEO = 60 * 1024 * 1024;
  var MAX_POSTER_EDGE = 1920;

  /** "image" | "video", or a Norwegian reason the file cannot be used. */
  function classify(file) {
    var type = file.type || "";
    var name = file.name || "";
    if (/quicktime/.test(type) || /\.mov$/i.test(name)) {
      return { error: name + ": .mov støttes ikke i annonser – eksporter videoen som MP4." };
    }
    var kind = /^video\//.test(type) || VIDEO_EXT.test(name) ? "video" : /^image\//.test(type) || IMAGE_EXT.test(name) ? "image" : null;
    if (!kind) return { error: name + ": ukjent filtype. Bruk JPG, PNG, WEBP, AVIF, GIF, MP4 eller WEBM." };
    if (kind === "image" && /svg/.test(type)) return { error: name + ": SVG kan ikke brukes som foto." };
    if (kind === "image" && file.size > MAX_IMAGE) return { error: name + ": bildet er over 15 MB." };
    if (kind === "video" && file.size > MAX_VIDEO) return { error: name + ": videoen er over 60 MB." };
    return { kind: kind };
  }

  /**
   * POST one file; resolves with the stored upload.
   * @param {Blob} file
   * @param {{role?: "logo", name?: string, onProgress?: Function}} [opts]
   * @returns {Promise<{id:string,url:string,kind:string,w:number,h:number,bytes:number}>}
   */
  function upload(file, opts) {
    var o = opts || {};
    return new Promise(function (resolve, reject) {
      var form = new FormData();
      form.append("file", file, o.name || file.name || "fil");
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/puff/media" + (o.role === "logo" ? "?role=logo" : ""));
      xhr.responseType = "json";
      if (o.onProgress && xhr.upload) {
        xhr.upload.addEventListener("progress", function (e) {
          if (e.lengthComputable) o.onProgress(e.loaded / e.total);
        });
      }
      xhr.addEventListener("load", function () {
        var body = xhr.response || {};
        if (xhr.status >= 200 && xhr.status < 300 && body.url) resolve(body);
        else reject(new Error(body.error || "Opplastingen feilet (" + xhr.status + ")"));
      });
      xhr.addEventListener("error", function () {
        reject(new Error("Fikk ikke kontakt med serveren"));
      });
      xhr.send(form);
    });
  }

  function loadVideo(url) {
    return new Promise(function (resolve, reject) {
      var video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      video.playsInline = true;
      var timer = setTimeout(function () {
        reject(new Error("Videoen lastet ikke"));
      }, 20000);
      video.addEventListener("loadeddata", function () {
        clearTimeout(timer);
        resolve(video);
      }, { once: true });
      video.addEventListener("error", function () {
        clearTimeout(timer);
        reject(new Error("Nettleseren kan ikke spille av denne videoen. Bruk MP4 (H.264)."));
      }, { once: true });
      video.src = url;
    });
  }

  function seek(video, time) {
    return new Promise(function (resolve) {
      var t = Math.max(0, Math.min(time, (video.duration || 0) - 0.05));
      if (Math.abs(video.currentTime - t) < 0.01) return resolve();
      video.addEventListener("seeked", function () {
        resolve();
      }, { once: true });
      video.currentTime = t;
    });
  }

  /** Width, height and length of a video the browser can play. */
  function probeVideo(url) {
    return loadVideo(url).then(function (video) {
      var info = { w: video.videoWidth, h: video.videoHeight, duration: isFinite(video.duration) ? video.duration : 0 };
      video.removeAttribute("src");
      video.load();
      return info;
    });
  }

  /**
   * One frame of the video as a JPEG blob.
   * @param {string} url
   * @param {number} time  seconds
   */
  function captureFrame(url, time) {
    return loadVideo(url).then(function (video) {
      return seek(video, time).then(function () {
        var w = video.videoWidth;
        var h = video.videoHeight;
        var k = Math.min(1, MAX_POSTER_EDGE / Math.max(w, h));
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(w * k);
        canvas.height = Math.round(h * k);
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        video.removeAttribute("src");
        video.load();
        return new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob);
            else reject(new Error("Kunne ikke lage stillbilde fra videoen"));
          }, "image/jpeg", 0.9);
        });
      });
    });
  }

  /** The default still: a second in (past most fade-ins), or a third of a short clip. */
  function defaultPosterTime(duration) {
    if (!(duration > 0)) return 0;
    return Math.round(Math.min(1, duration / 3) * 10) / 10;
  }

  function formatBytes(bytes) {
    if (!(bytes > 0)) return "";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / 1048576).toFixed(1).replace(".", ",") + " MB";
  }

  function formatSeconds(s) {
    return (Math.round(s * 10) / 10).toFixed(1).replace(".", ",") + " s";
  }

  PUFF.media = {
    classify: classify,
    assign: window.PuffAd.assignSlots,
    upload: upload,
    probeVideo: probeVideo,
    captureFrame: captureFrame,
    defaultPosterTime: defaultPosterTime,
    formatBytes: formatBytes,
    formatSeconds: formatSeconds,
    ACCEPT: "image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm,.mp4,.m4v,.webm",
  };
})();
