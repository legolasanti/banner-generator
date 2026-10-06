/* =========================================================================
   app/store.js — the open project and everything the editor is looking at.

   The project is immutable: every edit builds a new project object (sharing
   the parts that did not change), so undo/redo is just a list of previous
   projects, and the canvas can tell which sections changed by comparing
   references.

   Typing in one field is ONE undo step: edits with the same `group` within
   a second of each other replace the last step instead of adding one.

   Saving: every change marks the project dirty; it is sent to the server
   1.2 s after the last change, together with the revision it was based on.
   If a colleague saved in between, the server answers 409 and the editor
   says so instead of overwriting their work.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var Doc = window.NativeDoc;
  var S = window.NativeSchema;

  var MAX_UNDO = 200;
  var GROUP_MS = 1000;
  var SAVE_DELAY = 1200;

  var state = null;
  var past = [];
  var future = [];
  var lastGroup = { key: null, at: 0 };
  var listeners = [];
  var saveTimer = 0;
  var saving = null;

  function emit(change) {
    listeners.slice().forEach(function (fn) {
      try {
        fn(state, change);
      } catch (err) {
        console.error(err);
      }
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function load(project) {
    clearTimeout(saveTimer);
    past = [];
    future = [];
    lastGroup = { key: null, at: 0 };
    state = {
      project: project,
      rev: project.rev,
      pageId: project.pages[0].id,
      selected: null,
      device: "desktop",
      save: "saved",
      error: "",
    };
    emit({ kind: "load" });
  }

  function get() {
    return state;
  }

  function page() {
    if (!state) return null;
    for (var i = 0; i < state.project.pages.length; i++) if (state.project.pages[i].id === state.pageId) return state.project.pages[i];
    return state.project.pages[0];
  }

  // ---- immutable edits ---------------------------------------------------------
  function changedSections(before, after) {
    var ids = [];
    var prev = {};
    before.pages.forEach(function (p) {
      p.sections.forEach(function (s) { prev[s.id] = s; });
    });
    after.pages.forEach(function (p) {
      p.sections.forEach(function (s) {
        if (prev[s.id] !== s) ids.push(s.id);
      });
    });
    return ids;
  }

  // The chapter menu lists sections by their "Navn i kapittelmenyen", so a
  // change there needs the page chrome redrawn, not just the section.
  function chapterKey(project) {
    return project.pages.map(function (p) { return p.sections.map(function (s) { return s.style.chapter || ""; }).join("\u0001"); }).join("|");
  }

  function structureKey(project) {
    return project.pages.map(function (p) { return p.id + ":" + p.sections.map(function (s) { return s.id; }).join(","); }).join("|");
  }

  /**
   * Apply `fn(project) → newProject`. opts.group merges rapid edits into one
   * undo step; opts.from = "frame" means the canvas already shows the change
   * (typing in place), so it must not re-render under the caret.
   */
  function update(fn, opts) {
    var o = opts || {};
    var before = state.project;
    var after = fn(before);
    if (!after || after === before) return;
    var now = Date.now();
    if (o.group && lastGroup.key === o.group && now - lastGroup.at < GROUP_MS && past.length) {
      // Same burst of typing: keep the step from before the burst.
    } else {
      past.push(before);
      if (past.length > MAX_UNDO) past.shift();
    }
    lastGroup = { key: o.group || null, at: now };
    future = [];
    state = Object.assign({}, state, { project: after });
    markDirty();
    emit({
      kind: "project",
      sections: changedSections(before, after),
      structure: structureKey(before) !== structureKey(after),
      theme: before.theme !== after.theme || before.assets !== after.assets,
      shell:
        before.advertiser !== after.advertiser ||
        before.pages.length !== after.pages.length ||
        before.variantNav !== after.variantNav ||
        before.extras !== after.extras ||
        chapterKey(before) !== chapterKey(after),
      from: o.from || null,
    });
  }

  function undo() {
    if (!past.length) return;
    var before = state.project;
    future.push(before);
    state = Object.assign({}, state, { project: past.pop() });
    lastGroup = { key: null, at: 0 };
    fixSelection();
    markDirty();
    emit({ kind: "project", sections: null, structure: true, theme: true, shell: true, undo: true });
  }

  function redo() {
    if (!future.length) return;
    past.push(state.project);
    state = Object.assign({}, state, { project: future.pop() });
    lastGroup = { key: null, at: 0 };
    fixSelection();
    markDirty();
    emit({ kind: "project", sections: null, structure: true, theme: true, shell: true, undo: true });
  }

  function fixSelection() {
    var p = state.project;
    if (!p.pages.some(function (pg) { return pg.id === state.pageId; })) state.pageId = p.pages[0].id;
    if (state.selected && !Doc.findSection(p, state.selected)) state.selected = null;
  }

  // ---- helpers for the common edits ----------------------------------------------
  function mapSections(project, fn) {
    var changed = false;
    var pages = project.pages.map(function (pg) {
      var secs = pg.sections.map(function (s) {
        var n = fn(s);
        if (n !== s) changed = true;
        return n;
      });
      return changed ? Object.assign({}, pg, { sections: secs }) : pg;
    });
    return changed ? Object.assign({}, project, { pages: pages }) : project;
  }

  function updateSection(id, fn, opts) {
    update(function (p) {
      return mapSections(p, function (s) { return s.id === id ? fn(s) : s; });
    }, opts);
  }

  /**
   * Set a field by path: "title", or "items.<itemId>.text" inside a list.
   * The value is normalised by the field's own rules before it is stored.
   */
  function setField(sectionId, path, value, opts) {
    updateSection(sectionId, function (s) {
      var parts = String(path).split(".");
      var f = S.field(s.type, parts[0]);
      if (!f) return s;
      var props;
      if (parts.length === 3 && f.type === "list") {
        var sub = f.item.filter(function (x) { return x.key === parts[2]; })[0];
        if (!sub) return s;
        var list = s.props[f.key].map(function (item) {
          if (item.id !== parts[1]) return item;
          var copy = Object.assign({}, item);
          copy[sub.key] = Doc.normalizeField(sub, value, { assets: state.project.assets });
          return copy;
        });
        props = Object.assign({}, s.props);
        props[f.key] = list;
      } else {
        props = Object.assign({}, s.props);
        props[f.key] = Doc.normalizeField(f, value, { assets: state.project.assets });
      }
      return Object.assign({}, s, { props: props });
    }, Object.assign({ group: "f:" + sectionId + ":" + path }, opts || {}));
  }

  /** Style on the main (desktop) layout, or an override for tablet/mobile. */
  function setStyle(sectionId, key, value, device) {
    updateSection(sectionId, function (s) {
      var f = S.styleField(key);
      if (!f) return s;
      var v = Doc.normalizeField(f, value, { assets: state.project.assets });
      if (!device || device === "desktop" || !f.rs) {
        var style = Object.assign({}, s.style);
        style[key] = v;
        return Object.assign({}, s, { style: style });
      }
      var rs = Object.assign({}, s.rs);
      var dev = Object.assign({}, rs[device] || {});
      var st = Object.assign({}, dev.style || {});
      if (value === null) delete st[key];
      else st[key] = v;
      dev.style = st;
      rs[device] = dev;
      return Object.assign({}, s, { rs: rs });
    }, { group: "s:" + sectionId + ":" + key });
  }

  function setHidden(sectionId, device, hidden) {
    updateSection(sectionId, function (s) {
      var hide = Object.assign({}, s.hide);
      hide[device] = !!hidden;
      return Object.assign({}, s, { hide: hide });
    });
  }

  function updatePage(fn) {
    update(function (p) {
      return Object.assign({}, p, {
        pages: p.pages.map(function (pg) { return pg.id === state.pageId ? fn(pg) : pg; }),
      });
    });
  }

  function addSection(section, index) {
    updatePage(function (pg) {
      var secs = pg.sections.slice();
      var at = index === undefined || index < 0 || index > secs.length ? secs.length : index;
      secs.splice(at, 0, section);
      return Object.assign({}, pg, { sections: secs });
    });
    select(section.id);
  }

  function removeSection(id) {
    updatePage(function (pg) {
      return Object.assign({}, pg, { sections: pg.sections.filter(function (s) { return s.id !== id; }) });
    });
    if (state.selected === id) select(null);
  }

  function moveSection(id, toIndex) {
    updatePage(function (pg) {
      var secs = pg.sections.slice();
      var from = secs.findIndex(function (s) { return s.id === id; });
      if (from === -1) return pg;
      var item = secs.splice(from, 1)[0];
      var to = Math.max(0, Math.min(secs.length, toIndex));
      if (to === from) return pg;
      secs.splice(to, 0, item);
      return Object.assign({}, pg, { sections: secs });
    });
  }

  function duplicateSection(id) {
    var found = Doc.findSection(state.project, id);
    if (!found) return;
    var copy = Doc.cloneSection(found.section);
    addSection(copy, found.index + 1);
  }

  /** Add assets (metadata from an upload) to the project. */
  function addAssets(list) {
    var add = (list || []).filter(Boolean);
    if (!add.length) return;
    update(function (p) {
      var assets = Object.assign({}, p.assets);
      add.forEach(function (a) {
        assets[a.id] = Doc.normalizeAsset(a.id, Object.assign({}, assets[a.id] || {}, a));
      });
      return Object.assign({}, p, { assets: assets });
    });
  }

  function setAsset(id, patch) {
    update(function (p) {
      if (!p.assets[id]) return p;
      var assets = Object.assign({}, p.assets);
      assets[id] = Doc.normalizeAsset(id, Object.assign({}, assets[id], patch));
      return Object.assign({}, p, { assets: assets });
    }, { group: "a:" + id + ":" + Object.keys(patch).join(",") });
  }

  function select(id) {
    if (state.selected === id) return;
    state = Object.assign({}, state, { selected: id });
    emit({ kind: "select" });
  }

  function setPage(id) {
    if (state.pageId === id) return;
    state = Object.assign({}, state, { pageId: id, selected: null });
    emit({ kind: "page" });
  }

  function setDevice(d) {
    if (state.device === d) return;
    state = Object.assign({}, state, { device: d });
    emit({ kind: "device" });
  }

  // ---- saving ------------------------------------------------------------------------
  function setSave(status, error) {
    state = Object.assign({}, state, { save: status, error: error || "" });
    emit({ kind: "save" });
  }

  function markDirty() {
    if (state.save === "conflict") return;
    setSave("dirty");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY);
  }

  function save() {
    clearTimeout(saveTimer);
    if (!state || state.save === "conflict") return Promise.resolve();
    if (saving) {
      // One save at a time; the latest state goes out right after.
      return saving.then(function () {
        if (state.save === "dirty") return save();
      });
    }
    var project = state.project;
    var id = project.id;
    setSave("saving");
    saving = NP.api
      .saveProject(id, project, state.rev)
      .then(function (res) {
        if (!state || state.project.id !== id) return;
        var unchanged = state.project === project;
        state = Object.assign({}, state, { rev: res.rev, project: Object.assign({}, state.project, { rev: res.rev, status: res.status }) });
        setSave(unchanged ? "saved" : "dirty");
        if (state.save === "dirty") saveTimer = setTimeout(save, SAVE_DELAY);
      })
      .catch(function (err) {
        if (err.status === 409) {
          setSave("conflict", err.message);
        } else {
          setSave("error", err.message);
          saveTimer = setTimeout(save, 8000);
        }
      })
      .then(function () {
        saving = null;
      });
    return saving;
  }

  /** After a server-side change (review round, status …): adopt rev/status. */
  function adopt(fields) {
    state = Object.assign({}, state, {
      rev: fields.rev !== undefined ? fields.rev : state.rev,
      project: Object.assign({}, state.project, fields),
    });
    emit({ kind: "meta" });
  }

  window.addEventListener("beforeunload", function (e) {
    if (state && (state.save === "dirty" || state.save === "saving" || state.save === "error")) {
      save();
      e.preventDefault();
      e.returnValue = "";
    }
  });

  NP.store = {
    load: load,
    get: get,
    page: page,
    subscribe: subscribe,
    update: update,
    updateSection: updateSection,
    setField: setField,
    setStyle: setStyle,
    setHidden: setHidden,
    updatePage: updatePage,
    addSection: addSection,
    removeSection: removeSection,
    moveSection: moveSection,
    duplicateSection: duplicateSection,
    addAssets: addAssets,
    setAsset: setAsset,
    select: select,
    setPage: setPage,
    setDevice: setDevice,
    undo: undo,
    redo: redo,
    canUndo: function () { return past.length > 0; },
    canRedo: function () { return future.length > 0; },
    save: save,
    adopt: adopt,
    close: function () {
      clearTimeout(saveTimer);
      listeners = [];
      var closing = state;
      var p = state && state.save !== "saved" && state.save !== "conflict" ? save() : Promise.resolve();
      return p.then(function () {
        if (state === closing || (state && closing && state.project.id === closing.project.id)) state = null;
      });
    },
  };
})();
