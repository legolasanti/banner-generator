/* =========================================================================
   editor/preview.js — "Forhåndsvis på nettsiden".

   Puts both artboards where they really go: the background centred behind a
   mock page, the top banner at the top of the 1000px content column, and the
   page content covering the middle. The screen width can be switched
   between common sizes, which is the honest way to show what a 1280px laptop
   actually sees of the sides. Hover effects are live here, as in HTML5.
   The page is a plain news front page with invented headlines and tinted
   photo blocks — believable enough to judge the ad next to content, without
   copying any real site's design. A dashed line marks the fold of a laptop
   screen (spec: the top 700 px of the background are what is sure to show).
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Spec = window.WallpaperSpec;
  var Render = window.WallpaperRender;
  var store = WPE.store;
  var util = WPE.util;
  var h = util.h;

  var HEADER_H = 64;
  var width = 1440;
  var dom = {};

  var NAV = ["Nyheter", "Innenriks", "Utenriks", "Økonomi", "Sport", "Kultur", "Helse", "Bolig", "Reise", "Mat"];
  var LEAD = { kicker: "Siste nytt", title: "Strømprisen faller i hele landet før helgen", lede: "Milde vinder og fulle magasiner gir de laveste prisene siden i fjor sommer." };
  var STORIES = [
    "Slik blir været i helgen",
    "Ny undersøkelse: Nordmenn sparer mer enn før",
    "Fem turer du rekker før snøen kommer",
    "Derfor stiger boligprisene i Bergen",
    "Landslaget klart for sluttspillet",
    "Ekspertene: Dette bør du sjekke før vinteren",
    "Rekordmange tok toget i sommer",
    "Kokkens beste tips til en rask middag",
  ];
  // Muted photo stand-ins, so the page has colour without real pictures.
  var TINTS = ["#c9d6df", "#d8cfc4", "#cdd8c5", "#d6c9d6", "#c5d3d8", "#dcd3bf", "#c9cfdc", "#d3dcc9", "#e0cdc5"];

  function mockContent() {
    var lead = h("article.wp-mock__lead", null,
      h("div.wp-mock__img.wp-mock__img--lead", { style: { background: "linear-gradient(135deg, " + TINTS[0] + ", " + TINTS[4] + ")" } }),
      h("div.wp-mock__leadtext", null,
        h("span.wp-mock__kicker", null, LEAD.kicker),
        h("h3.wp-mock__h1", null, LEAD.title),
        h("p.wp-mock__lede", null, LEAD.lede)));
    var cards = STORIES.map(function (t, i) {
      return h("article.wp-mock__card", null,
        h("div.wp-mock__img", { style: { background: TINTS[(i + 1) % TINTS.length] } }),
        h("h4.wp-mock__h2", null, t));
    });
    return h("div.wp-mock__content", null,
      h("nav.wp-mock__sections", null, NAV.map(function (n, i) { return h("span" + (i === 0 ? ".is-on" : ""), null, n); })),
      lead,
      h("div.wp-mock__cards", null, cards));
  }

  function page() {
    var bgSpec = Spec.get("background");
    var tbSpec = Spec.get("topbanner");
    var doc = store.state.doc;
    var V = width;
    var totalH = HEADER_H + bgSpec.height;
    var root = h("div.wp-mock", { style: { width: V + "px", height: totalH + "px" } });
    root.appendChild(h("div.wp-mock__header", { style: { height: HEADER_H + "px" } },
      h("span.wp-mock__logo", null, "Nyhetssiden"), h("div.wp-mock__search", null, "Søk i saker …"),
      h("span.wp-mock__nav", null, "Meny  ·  Logg inn")));

    var bgWrap = h("div.ad-exit.wp-mock__bg", { style: { left: (V - bgSpec.width) / 2 + "px", top: HEADER_H + "px" } });
    var bg = h("div");
    Render.renderArtboard(bg, doc.artboards.background, bgSpec, { assetUrl: WPE.canvas.assetUrl });
    bgWrap.appendChild(bg);
    root.appendChild(bgWrap);

    var colX = (V - Spec.CONTENT_W) / 2;
    var tbWrap = h("div.ad-exit.wp-mock__tb", { style: { left: colX + "px", top: HEADER_H + "px" } });
    var tb = h("div");
    Render.renderArtboard(tb, doc.artboards.topbanner, tbSpec, { assetUrl: WPE.canvas.assetUrl });
    tbWrap.appendChild(tb);
    root.appendChild(tbWrap);

    var content = mockContent();
    Object.assign(content.style, { left: colX + "px", top: HEADER_H + tbSpec.height + "px", width: Spec.CONTENT_W + "px" });
    root.appendChild(content);

    // Where a laptop screen ends: below it, nothing is sure to be seen.
    var safe = bgSpec.safe;
    root.appendChild(h("div.wp-mock__fold", { style: { top: HEADER_H + safe.y + safe.height + "px" } },
      h("span", null, "Skjermkant på en vanlig bærbar – det under synes først når leseren scroller")));
    return { node: root, height: totalH };
  }

  function render() {
    util.clear(dom.stage);
    var p = page();
    var avail = dom.stage.clientWidth - 32;
    var scale = Math.min(1, avail / width);
    var frame = h("div.wp-mock__frame", { style: { width: width * scale + "px", height: p.height * scale + "px" } });
    p.node.style.transform = "scale(" + scale + ")";
    frame.appendChild(p.node);
    dom.stage.appendChild(frame);
    var side = Math.max(0, (width - Spec.CONTENT_W) / 2);
    dom.info.textContent =
      "Skjerm " + width + " px bred · synlig bakgrunn på hver side: " + Math.round(side) + " px" +
      (width < Spec.get("background").width ? " · ytterkantene av bakgrunnen vises ikke" : "") +
      " · vist i " + Math.round(scale * 100) + " %";
    dom.buttons.forEach(function (b) {
      b.classList.toggle("is-on", Number(b.dataset.w) === width);
      b.setAttribute("aria-pressed", Number(b.dataset.w) === width ? "true" : "false");
    });
  }

  function build() {
    dom.info = h("span.wp-prev__info");
    dom.buttons = Spec.PREVIEW_WIDTHS.map(function (w) {
      return h("button.wp-seg__b", { type: "button", dataset: { w: String(w) }, on: { click: function () { width = w; render(); } } }, w + " px");
    });
    dom.stage = h("div.wp-prev__stage");
    var card = h("div.wp-modal__card.wp-prev", { role: "dialog", "aria-modal": "true", "aria-label": "Forhåndsvisning på nettsiden" },
      h("header.wp-modal__head", null, h("h2", null, "Forhåndsvis på nettsiden"),
        h("div.wp-seg", { role: "group", "aria-label": "Skjermbredde" }, dom.buttons),
        h("button.wp-btn.wp-btn--icon", { type: "button", title: "Lukk", "aria-label": "Lukk", on: { click: close } }, util.icon("x", 18))),
      dom.stage,
      h("footer.wp-modal__foot", null, dom.info, h("span.wp-prev__hint", null, "Hold musen over annonsen for å se hover-effekter (HTML5)."))
    );
    dom.modal = h("div.wp-modal", { hidden: true, on: { pointerdown: function (e) { if (e.target === dom.modal) close(); } } }, card);
    document.body.appendChild(dom.modal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && dom.modal && !dom.modal.hidden) close();
    });
    window.addEventListener("resize", function () {
      if (dom.modal && !dom.modal.hidden) render();
    });
  }

  function open() {
    if (!dom.modal) build();
    dom.modal.hidden = false;
    requestAnimationFrame(render);
  }
  function close() {
    if (dom.modal) dom.modal.hidden = true;
  }

  WPE.preview = { open: open, close: close };
})();
