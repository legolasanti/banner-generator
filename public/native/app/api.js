/* =========================================================================
   app/api.js — every call the Native Premium editor makes to the server.
   JSON in, JSON out; a failed call throws an Error with the server's own
   (Norwegian, user-facing) message, plus .status and the JSON body as .body.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});

  function request(method, url, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (res.ok) return data;
          if (res.status === 401 && data && data.login) {
            location.href = "/login?next=" + encodeURIComponent(location.pathname + location.hash);
          }
          var err = new Error((data && data.error) || "Serveren svarte " + res.status);
          err.status = res.status;
          err.body = data;
          throw err;
        });
    });
  }

  /**
   * Multipart upload with progress (fetch cannot report upload progress).
   * @param {string} url
   * @param {File} file
   * @param {Object} [fields]
   * @param {function(number)} [onProgress] 0..1
   */
  function upload(url, file, fields, onProgress) {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      Object.keys(fields || {}).forEach(function (k) {
        if (fields[k] !== undefined && fields[k] !== null) fd.append(k, fields[k]);
      });
      fd.append("file", file);
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.responseType = "json";
      if (onProgress) {
        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable) onProgress(e.loaded / e.total);
        };
      }
      xhr.onload = function () {
        var data = xhr.response || {};
        if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
        reject(new Error(data.error || "Opplasting feilet (" + xhr.status + ")"));
      };
      xhr.onerror = function () {
        reject(new Error("Opplasting feilet – sjekk nettilkoblingen"));
      };
      xhr.send(fd);
    });
  }

  var P = "/api/native";
  var enc = encodeURIComponent;

  NP.api = {
    get: function (url) { return request("GET", url); },
    post: function (url, body) { return request("POST", url, body || {}); },
    put: function (url, body) { return request("PUT", url, body); },
    del: function (url) { return request("DELETE", url); },
    upload: upload,

    projects: function () { return request("GET", P + "/projects"); },
    createProject: function (body) { return request("POST", P + "/projects", body); },
    project: function (id) { return request("GET", P + "/projects/" + enc(id)); },
    saveProject: function (id, project, baseRev) { return request("PUT", P + "/projects/" + enc(id), { project: project, baseRev: baseRev }); },
    deleteProject: function (id) { return request("DELETE", P + "/projects/" + enc(id)); },
    duplicateProject: function (id) { return request("POST", P + "/projects/" + enc(id) + "/duplicate"); },
    setStatus: function (id, status) { return request("POST", P + "/projects/" + enc(id) + "/status", { status: status }); },
    versions: function (id) { return request("GET", P + "/projects/" + enc(id) + "/versions"); },
    version: function (id, file) { return request("GET", P + "/projects/" + enc(id) + "/versions/" + enc(file)); },
    snapshot: function (id, label) { return request("POST", P + "/projects/" + enc(id) + "/versions", { label: label }); },
    restore: function (id, file) { return request("POST", P + "/projects/" + enc(id) + "/versions/" + enc(file) + "/restore"); },
    startReview: function (id) { return request("POST", P + "/projects/" + enc(id) + "/review"); },
    revokeReview: function (id) { return request("POST", P + "/projects/" + enc(id) + "/review/revoke"); },
    comments: function (id) { return request("GET", P + "/projects/" + enc(id) + "/comments"); },
    addComment: function (id, body) { return request("POST", P + "/projects/" + enc(id) + "/comments", body); },
    resolveComment: function (id, cid, resolved) { return request("POST", P + "/projects/" + enc(id) + "/comments/" + enc(cid), { resolved: resolved }); },
    publish: function (id) { return request("POST", P + "/projects/" + enc(id) + "/publish"); },
    unpublish: function (id) { return request("DELETE", P + "/projects/" + enc(id) + "/publish"); },
    published: function () { return request("GET", P + "/published"); },
    aiUsage: function (id) { return request("GET", P + "/projects/" + enc(id) + "/ai"); },
    previewUrl: function (id, slug) { return P + "/projects/" + enc(id) + "/preview" + (slug ? "/" + enc(slug) : ""); },
    exportUrl: function (id) { return P + "/projects/" + enc(id) + "/export"; },

    brandKits: function () { return request("GET", P + "/brandkits"); },
    saveBrandKit: function (kit) { return request("POST", P + "/brandkits", kit); },
    deleteBrandKit: function (id) { return request("DELETE", P + "/brandkits/" + enc(id)); },
    library: function () { return request("GET", P + "/library"); },
    saveLibrary: function (item) { return request("POST", P + "/library", item); },
    deleteLibrary: function (id) { return request("DELETE", P + "/library/" + enc(id)); },
    settings: function () { return request("GET", P + "/settings"); },
    saveSettings: function (s) { return request("POST", P + "/settings", s); },

    aiStatus: function () { return request("GET", P + "/ai/status"); },
    aiModels: function () { return request("GET", P + "/ai/models"); },
    ai: function (step, body) { return request("POST", P + "/ai/" + step, body); },
    source: function (kind, body) { return request("POST", P + "/sources/" + kind, body); },

    assetUrl: function (id, width) {
      if (!id) return "";
      return "/np-assets/" + (width ? id.slice(0, 64) + "-" + width + ".webp" : id);
    },
  };
})();
