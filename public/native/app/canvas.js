/* =========================================================================
   app/canvas.js — the live page preview in the middle of the editor.

   It is the real page: the same renderer and stylesheet as the published
   page, inside an iframe at the chosen device width (scaled down to fit when
   the window is narrower). Editing happens right on it:
     click            select a section (or the image under the pointer)
     double-click     edit that text in place (plain fields as plain text,
                      formatted fields with Ctrl+B / Ctrl+I)
     toolbar          move, duplicate, hide, delete, add a section below

   Only what changed is re-rendered: a field edit replaces one <section>, a
   reorder rebuilds <main>, a theme change swaps the theme <style>. The text
   being typed in place is never re-rendered under the caret.
   ========================================================================= */
(function () {
  "use strict";

  var NP = (window.NP = window.NP || {});
  var ui = NP.ui;
  var h = ui.h;
  var S = window.NativeSchema;
  var D = window.NativeDoc;
  var R = window.NativeRender;
  var Fonts = window.WallpaperFonts || window.Fonts;

  var ICON = {};
  function svg(name) {
    if (!ICON[name]) ICON[name] = ui.icon(name, 16).outerHTML;
    return ICON[name];
  }

  function create(host) {
    var stage = h("div.nx-stage");
    var scaler = h("div.nx-scaler");
    var frame = h("iframe.nx-frame", { title: "Forhåndsvisning av siden", sandbox: "allow-same-origin allow-scripts" });
    scaler.appendChild(frame);
    stage.appendChild(scaler);
    host.appendChild(stage);

    var win = null;
    var docu = null;
    var editing = null; // { el, sectionId, field, type }
    var lastSelected = null;
    var rendered = {}; // sectionId → section object last rendered
    var unsub = null;

    function st() {
      return NP.store.get();
    }

    function ctx() {
      var s = st();
      var settings = NP.settings || {};
      return {
        mode: "editor",
        project: s.project,
        page: NP.store.page(),
        settings: settings,
        assets: Object.assign({}, settings.assets || {}, s.project.assets),
        url: function (id, w) { return NP.api.assetUrl(id, w); },
        pageHref: function () { return "#"; },
        cssHref: "/native/runtime/np.css",
        runtimeSrc: "/native/runtime/np.js",
        fontLinks: fontLinks(s.project),
        fontCss: customFonts(s.project),
        extraHead: '<script>window.NP_EDITOR=true;document.documentElement.classList.add("np-editor")</script><link rel="stylesheet" href="/native/app/frame.css">',
      };
    }

    function fontLinks(project) {
      var fams = {};
      ["heading", "body"].forEach(function (k) {
        var f = project.theme.fonts[k];
        if (f.source === "google" && Fonts && Fonts.has(f.family)) fams[f.family] = true;
      });
      return Object.keys(fams).map(function (fam) { return '<link rel="stylesheet" href="' + D.escapeHtml(Fonts.cssUrl(fam)) + '">'; }).join("\n");
    }

    function customFonts(project) {
      return Object.keys(project.assets)
        .filter(function (id) { return project.assets[id].kind === "font"; })
        .map(function (id) {
          var a = project.assets[id];
          return "@font-face{font-family:" + JSON.stringify(a.family) + ";font-weight:" + a.weight + ";font-style:" + a.style + ";font-display:swap;src:url(" + JSON.stringify(NP.api.assetUrl(id)) + ");}";
        })
        .join("");
    }

    // ---- full render ------------------------------------------------------------
    function full() {
      var scrollY = win ? win.scrollY : 0;
      editing = null;
      var c = ctx();
      lastFontLinks = c.fontLinks;
      var html = R.renderDocument(c);
      if (!c.page.sections.length) html = html.replace('<main id="np-main">', '<main id="np-main"><div class="nx-frame-empty">Siden er tom. Legg til en seksjon fra panelet til venstre – eller bruk AI.</div>');
      frame.onload = function () {
        win = frame.contentWindow;
        docu = frame.contentDocument;
        bind();
        rendered = {};
        c.page.sections.forEach(function (s) { rendered[s.id] = s; });
        decorateAll();
        if (scrollY) win.scrollTo(0, scrollY);
      };
      frame.srcdoc = html;
    }

    function sectionEl(id) {
      return docu && docu.getElementById("np-" + id);
    }

    // ---- partial updates ----------------------------------------------------------
    function replaceSections(ids) {
      if (!docu) return full();
      var c = ctx();
      var page = c.page;
      ids.forEach(function (id) {
        if (editing && editing.sectionId === id) return;
        var idx = page.sections.findIndex(function (s) { return s.id === id; });
        if (idx === -1) return;
        var el = sectionEl(id);
        if (!el) return;
        var tmp = docu.createElement("div");
        tmp.innerHTML = R.renderSection(c, page.sections[idx], idx);
        // A hero also renders the #np-after-hero marker after itself.
        var nodes = Array.prototype.slice.call(tmp.childNodes);
        var after = el.nextElementSibling;
        if (after && after.id === "np-after-hero") after.remove();
        nodes.forEach(function (n) { el.parentNode.insertBefore(n, el); });
        el.remove();
        rendered[id] = page.sections[idx];
        var fresh = sectionEl(id);
        if (fresh && win.NPRuntime) win.NPRuntime.bind(fresh);
      });
      decorateAll();
    }

    function rebuildMain() {
      if (!docu) return full();
      var c = ctx();
      var main = docu.getElementById("np-main");
      if (!main) return full();
      editing = null;
      if (win.NPRuntime) win.NPRuntime.resetScrollers();
      main.innerHTML = c.page.sections.length
        ? R.renderMain(c)
        : '<div class="nx-frame-empty">Siden er tom. Legg til en seksjon fra panelet til venstre – eller bruk AI.</div>';
      rendered = {};
      c.page.sections.forEach(function (s) { rendered[s.id] = s; });
      if (win.NPRuntime) win.NPRuntime.bind(main);
      decorateAll();
    }

    // Colours, radius and fonts change often (a colour picker fires on every
    // move): swap the theme <style> and re-render <main>, no frame reload —
    // unless the set of web fonts changed, which needs new <link>s.
    var lastFontLinks = "";
    function themeUpdate() {
      if (!docu) return full();
      var c = ctx();
      if (c.fontLinks !== lastFontLinks) {
        lastFontLinks = c.fontLinks;
        return full();
      }
      var style = docu.getElementById("np-theme");
      if (!style) return full();
      var p = c.project;
      style.textContent = R.themeCss(p.theme, { hasVariants: p.variantNav && p.pages.length > 1 }) + (c.fontCss || "");
      docu.body.classList.toggle("np-upper", p.theme.headingCase === "upper");
      var head = docu.querySelector(".np-disclosure");
      if (head) head.outerHTML = R.disclosure(c);
      rebuildMain();
    }

    function onChange(state, change) {
      if (change.kind === "load" || change.kind === "page") return full();
      if (change.kind === "select") return decorateAll();
      if (change.kind === "device") return fit();
      if (change.kind !== "project") return;
      if (change.shell) return full();
      if (change.theme) return themeUpdate();
      if (change.structure) return rebuildMain();
      var ids = change.sections || [];
      if (change.from === "frame" && editing) ids = ids.filter(function (id) { return id !== editing.sectionId; });
      if (ids.length) replaceSections(ids);
    }

    // ---- selection decoration -------------------------------------------------------
    function decorateAll() {
      if (!docu) return;
      var sel = st().selected;
      Array.prototype.forEach.call(docu.querySelectorAll(".nx-ftool, .nx-addbtn, .nx-hidden-label"), function (n) { n.remove(); });
      Array.prototype.forEach.call(docu.querySelectorAll(".np-sec"), function (el) {
        var id = el.getAttribute("data-np-section");
        el.classList.toggle("nx-sel", id === sel);
        var cls = el.className;
        if (/np-edh-/.test(cls)) {
          var label = docu.createElement("span");
          label.className = "nx-hidden-label";
          label.textContent = "Skjult på denne skjermen";
          el.insertBefore(label, el.firstChild);
        }
      });
      if (sel) {
        var el = sectionEl(sel);
        if (el) {
          toolbar(el, sel);
          if (lastSelected !== sel) {
            var r = el.getBoundingClientRect();
            if (r.top < 0 || r.top > win.innerHeight * 0.7) el.scrollIntoView({ block: "start", behavior: "smooth" });
          }
        }
      }
      lastSelected = sel;
    }

    function toolbar(el, id) {
      var found = D.findSection(st().project, id);
      if (!found) return;
      var page = NP.store.page();
      var idx = page.sections.findIndex(function (s) { return s.id === id; });
      var bar = docu.createElement("div");
      bar.className = "nx-ftool";
      bar.innerHTML =
        '<span class="nx-ftool__name">' + D.escapeHtml(S.BLOCKS[found.section.type].label) + "</span>" +
        '<button type="button" data-act="up" title="Flytt opp"' + (idx === 0 ? " disabled" : "") + ">" + svg("arrow-up") + "</button>" +
        '<button type="button" data-act="down" title="Flytt ned"' + (idx === page.sections.length - 1 ? " disabled" : "") + ">" + svg("arrow-down") + "</button>" +
        '<button type="button" data-act="dup" title="Dupliser">' + svg("copy") + "</button>" +
        '<button type="button" data-act="lib" title="Lagre i biblioteket">' + svg("bookmark-plus") + "</button>" +
        '<button type="button" data-act="del" title="Slett">' + svg("trash") + "</button>";
      bar.addEventListener("click", function (e) {
        e.stopPropagation();
        var b = e.target.closest("button");
        if (!b || b.disabled) return;
        var act = b.getAttribute("data-act");
        if (act === "up") NP.store.moveSection(id, idx - 1);
        if (act === "down") NP.store.moveSection(id, idx + 1);
        if (act === "dup") NP.store.duplicateSection(id);
        if (act === "del") NP.sections.remove(id);
        if (act === "lib") NP.library.saveSection(found.section);
      });
      el.appendChild(bar);
      var add = docu.createElement("button");
      add.type = "button";
      add.className = "nx-addbtn";
      add.innerHTML = svg("plus") + "<span>Legg til under</span>";
      add.addEventListener("click", function (e) {
        e.stopPropagation();
        NP.sections.addMenu(add, idx + 1, frame);
      });
      el.appendChild(add);
    }

    // ---- interaction inside the frame ------------------------------------------------
    function fieldOf(el) {
      var f = el.closest("[data-np-field]");
      var sec = el.closest("[data-np-section]");
      if (!f || !sec) return null;
      return { el: f, field: f.getAttribute("data-np-field"), sectionId: sec.getAttribute("data-np-section") };
    }

    function fieldDef(sectionId, path) {
      var found = D.findSection(st().project, sectionId);
      if (!found) return null;
      var parts = path.split(".");
      var f = S.field(found.section.type, parts[0]);
      if (f && f.type === "list" && parts.length === 3) {
        return f.item.filter(function (x) { return x.key === parts[2]; })[0] || null;
      }
      return f;
    }

    function bind() {
      docu.addEventListener("mouseover", function (e) {
        var sec = e.target.closest && e.target.closest(".np-sec");
        Array.prototype.forEach.call(docu.querySelectorAll(".nx-hover"), function (n) { if (n !== sec) n.classList.remove("nx-hover"); });
        if (sec) sec.classList.add("nx-hover");
      });
      docu.addEventListener("mouseleave", function () {
        Array.prototype.forEach.call(docu.querySelectorAll(".nx-hover"), function (n) { n.classList.remove("nx-hover"); });
      });
      docu.addEventListener("click", function (e) {
        if (editing && editing.el.contains(e.target)) return;
        var link = e.target.closest("a");
        if (link) e.preventDefault();
        var sec = e.target.closest("[data-np-section]");
        if (!sec) {
          NP.store.select(null);
          return;
        }
        var id = sec.getAttribute("data-np-section");
        var wasSelected = st().selected === id;
        NP.store.select(id);
        // A second click on an image of the selected section opens the picker.
        var info = fieldOf(e.target);
        if (wasSelected && info && e.target.tagName === "IMG") {
          var def = fieldDef(id, info.field);
          if (def && def.type === "image") {
            NP.media.pick({ kind: "image" }).then(function (asset) { if (asset) NP.store.setField(id, info.field, asset); });
          }
        }
        if (info) NP.props && NP.props.focusField && NP.props.focusField(info.field);
      });
      docu.addEventListener("dblclick", function (e) {
        var info = fieldOf(e.target);
        if (!info) return;
        var def = fieldDef(info.sectionId, info.field);
        if (!def || ["text", "textarea", "rich"].indexOf(def.type) === -1) return;
        e.preventDefault();
        startEdit(info, def);
      });
      docu.addEventListener("keydown", function (e) {
        if (editing) return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) NP.store.redo();
          else NP.store.undo();
        }
      });
      docu.addEventListener("submit", function (e) { e.preventDefault(); });
    }

    function readValue(el, def) {
      if (def.type === "rich") return D.sanitizeRich(el.innerHTML, S.HARD_MAX.rich);
      var t = el.innerText.replace(/ /g, " ");
      return def.type === "textarea" ? t.replace(/\n{3,}/g, "\n\n").trim() : t.replace(/\s*\n\s*/g, " ").trim();
    }

    function startEdit(info, def) {
      stopEdit();
      var el = info.el;
      var rich = def.type === "rich";
      try {
        el.contentEditable = rich ? "true" : "plaintext-only";
        if (!rich && el.contentEditable !== "plaintext-only") el.contentEditable = "true";
      } catch (_) {
        el.contentEditable = "true";
      }
      el.spellcheck = true;
      el.setAttribute("lang", "nb");
      editing = { el: el, sectionId: info.sectionId, field: info.field, def: def };
      el.focus();
      var range = docu.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      var sel = win.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);

      var onInput = function () {
        NP.store.setField(info.sectionId, info.field, readValue(el, def), { from: "frame" });
      };
      var onKey = function (e) {
        if (e.key === "Escape" || (e.key === "Enter" && def.type === "text")) {
          e.preventDefault();
          el.blur();
        }
        if (rich && (e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "i")) {
          e.preventDefault();
          docu.execCommand(e.key === "b" ? "bold" : "italic");
          onInput();
        }
      };
      var onPaste = function (e) {
        e.preventDefault();
        var cd = e.clipboardData;
        if (rich && cd.getData("text/html")) {
          docu.execCommand("insertHTML", false, D.sanitizeRich(cd.getData("text/html"), S.HARD_MAX.rich));
        } else {
          docu.execCommand("insertText", false, cd.getData("text/plain"));
        }
        onInput();
      };
      var onBlur = function () {
        el.removeEventListener("input", onInput);
        el.removeEventListener("keydown", onKey);
        el.removeEventListener("paste", onPaste);
        el.removeEventListener("blur", onBlur);
        el.removeAttribute("contenteditable");
        var id = info.sectionId;
        editing = null;
        replaceSections([id]);
        if (NP.props && NP.props.refresh) NP.props.refresh();
      };
      el.addEventListener("input", onInput);
      el.addEventListener("keydown", onKey);
      el.addEventListener("paste", onPaste);
      el.addEventListener("blur", onBlur);
    }

    function stopEdit() {
      if (editing && editing.el) editing.el.blur();
    }

    // ---- device width & scaling ------------------------------------------------------
    function fit() {
      var dev = S.DEVICES.filter(function (d) { return d.id === st().device; })[0] || S.DEVICES[0];
      var avail = stage.clientWidth - 48;
      var width = dev.width;
      var scale = Math.min(1, avail / width);
      var height = (stage.clientHeight - 32) / scale;
      frame.style.width = width + "px";
      frame.style.height = height + "px";
      scaler.style.width = width * scale + "px";
      scaler.style.height = height * scale + "px";
      frame.style.transform = scale < 1 ? "scale(" + scale + ")" : "";
      stage.dataset.device = dev.id;
      stage.classList.toggle("is-scaled", scale < 1);
    }

    var ro = new ResizeObserver(function () { fit(); });
    ro.observe(stage);

    unsub = NP.store.subscribe(onChange);
    fit();
    full();

    return {
      refresh: full,
      fit: fit,
      scrollTo: function (id) {
        var el = sectionEl(id);
        if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
      },
      window: function () { return win; },
      destroy: function () {
        if (unsub) unsub();
        ro.disconnect();
        stage.remove();
      },
    };
  }

  NP.canvas = { create: create };
})();
