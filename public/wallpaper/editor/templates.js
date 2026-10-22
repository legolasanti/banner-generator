/* =========================================================================
   editor/templates.js — ready-made Wallpapers for real kinds of advertisers.

   Each template is ONE campaign across both files, built the way takeover
   skins are built on Nordic news sites:
     • the background shows only at the sides (the site's content column
       covers the middle), so each side carries the whole message in the
       strip that is always visible (x 320–460 and 1460–1600, y 0–700):
       logo, headline, offer, button;
     • outside that strip a photo opens up on wider screens and fades into
       the edge colour, so a very wide screen never ends in a hard cut;
     • the top banner says the same thing bigger, with its own photo, in the
       same colours and fonts — in «Samlet» the three parts read as one.

   Two side layouts: "band" (a solid brand column with the photo outside
   it — calm, very legible) and "overlay" (text on a darkened photo — for
   moody products). Every element has a Norwegian layer name, so the user
   knows what to replace.

   Photos are the demo kit in lib/wallpaper/demo (Unsplash), stored by the
   server under their content id like any upload; PHOTOS below lists those
   ids (test/wallpaper-templates.test.js keeps them in step with the files).
   Advertisers and offers are invented (Nordvei, Fjordbank …).
   ========================================================================= */
(function () {
  "use strict";

  var WPE = (window.WPE = window.WPE || {});
  var Doc = window.WallpaperDoc;
  var Spec = window.WallpaperSpec;

  var BG = Spec.get("background");
  var TB = BG.site.topbanner; // {x:460, y:0, width:1000, height:300}
  var L = BG.sideZones[0].x; // 320 — left strip
  var R = BG.sideZones[1].x; // 1460 — right strip
  var SW = BG.sideZones[0].width; // 140
  var PAD = 8;
  var CW = SW - 2 * PAD; // 124 — text width in a strip

  // name → [asset id, width, height] (generated from lib/wallpaper/demo)
  var PHOTOS = {
    "trollstigen": ["a1daf1276b7c3e622b2b1047fe11538e27a26f0f14f193a3373279f48ef73e84.jpg", 1800, 1200],
    "ev-snow-suv": ["5fba723fa1d724adef0d006db629f3c524e9f14d3c0bdf1d0af7f870c012ca6e.jpg", 1800, 1200],
    "ev-suv-road": ["4bea3cd094496099c39640d1e13f2ac8154befbbb7e47e2babf903c75d12ad9d.jpg", 1800, 1200],
    "home-charger-hand": ["8adb06bd9ef0be5f6a3e293b1b370bb6440b62d10f835f79b6b77603309de79b.jpg", 1800, 1105],
    "ev-charging-night": ["1814c0a6ea10e206aa405e87b656eebf451bf64fef21883cc063ad029cd9c219.jpg", 1800, 1800],
    "energi-ev-home": ["75ab6634fe25ee8e2d1a3bb13f0df992c631c2d781916011a14ba00d41f3600b.jpg", 1800, 1200],
    "folk-kvinne-kroller": ["4883be1295dd46a450af9d935165aacc48179791539d235a73fdb603393c5f8d.jpg", 800, 1000],
    "folk-mann-skjorte": ["01dd87fbdd12e5c6b06a0696f6f08bb23b13e365cebe60af6318bb6b72ef63df.jpg", 667, 1000],
    "folk-kvinne-smil": ["9891ca76a62e980b0ab45324cd9b8b69141909b0fe14da39ae963553c54c819c.jpg", 1000, 663],
    "bank-couple-keys": ["ed2454ee055734c7e5f49a64ccfdf72b37ae4d621e87e65d5687e03b128abbbb.jpg", 1600, 1067],
    "oslo-new-apartments": ["317ce4c2303b3fa6b014db2a79d4ab860d26ff9acb9aacaefef1c9315d3991e7.jpg", 1800, 1200],
    "bank-keys-hall": ["54bfaa806782f893d256ec2dcc0faf95bade1c6e8b2722d322e8651fb30eb109.jpg", 1800, 1201],
    "mat-apples-crates": ["bf6ee1449bc897e0cdc10aa2dc7db70c159aa7f5a64ac800edda93eaa811e7f1.jpg", 1050, 1400],
    "mat-salmon-tray": ["a974632a6119c16a04f253d6f1a24f84b5ac5353a0058c5985ca2751892775b7.jpg", 1800, 1350],
    "vegetables": ["31b3b52140bb09b4d4d5e51624409ca50d9c7c25b9b0f60045ba7b01fdd20bf6.jpg", 1800, 1200],
    "headphones-black-dark": ["a5a7bac6eaac978d4967acf9e17446ef3046191f568ab118e370ab4243d5d2d9.jpg", 1440, 1800],
    "headphones-black-detail": ["33e434253a280c43352d2c608cc0498bef029ec685530a8648e43f6118b78b20.jpg", 1800, 1201],
    "headphones-cream": ["407d8392d5ec61e78aadce9ab2dc90145341f0adffd172810a33594bd03db50c.jpg", 1800, 1200],
    "lofoten-sunrise": ["00d593b65c6687091ed20e02c9faf7947a4288d80e2eb1c34fe0639d7c1ac7dd.jpg", 1800, 1012],
    "village-night": ["dd02c0aaf99ac7539dc50baf58e3179316eb4aad7e7438d7e7a80759d03dc7d6.jpg", 2000, 1333],
    "rib-sunset": ["f315734bcac2b5fa4548eb52b2b3be47041c27e383d2aaa6fd515ffd0c39b405.jpg", 2000, 1333],
    "film-night-car": ["2ba18ca5308aa51d066c252ecbbb50691209177ee1f4308021812b2139b45874.jpg", 1800, 1200],
    "film-fire-silhouette": ["2a4f7ed7ccfbe98e7e7549252c89e1163d0bafc08c63b7e2807bb4f07db72863.jpg", 1800, 1200],
    "film-rooftop-skyline": ["b861907aa61465e235410d3a191b668a4530307d6a0f89f9fa8f4bf755847270.jpg", 1800, 1440],
    "fest-singer-smoke": ["88404c74b37f5588b003172c100fa99bd62117699b00ceb7c5c73945aad63f96.jpg", 984, 1400],
    "fest-hands-sunset": ["795a688a09f737033eb399c2465f41a5221ee0f35c16a3aa3323e0010a6ac259.jpg", 1800, 1200],
    "fest-main-stage": ["55476fdcca44bc0e04fadf0d9d6bb6b1a76a98e4c287f3ef090df0981c36bbf9.jpg", 1800, 1200],
    "loft-exterior-sunset": ["762ed1b73a56a8969ec9ee5bd9987c9fcca482074982ac027637ca0e1c9360f8.jpg", 1458, 1800],
    "loft-after": ["3dad96d257751e4a209cdf528147a12bb81f38e1d84ed6504477a220ec62a55c.jpg", 1800, 1193],
    "loft-rooftop": ["3908a397341ff29d4777b0526c87eef00c8319cd650ef36b4a3ecee368c60183.jpg", 1600, 1067],
    "portrait-woman-coat": ["e58d6d4301e6a24f5f001186ae63e95a6b33dd120c3a8e8064c3fcdb0ee9410e.jpg", 1331, 2000],
    "face-woman-scarf": ["7da6f1eb331a56805f6befcd790baeb47f2271de89693db29fdd5b615a4a623e.jpg", 1200, 1800],
    "face-woman-red": ["931cf354c0f7ba6600935a102aad79420d0e224bd3d4ffcd3f57d67d57c9c2e6.jpg", 1800, 1205],
    "cabin-window-night": ["5c3ce3f6b94e80cf792555994057576364e2fd236b63c5d1aee00b4da77b5625.jpg", 2000, 1333],
    "candles-autumn": ["5cde8f4fe60286acb7140bbc13a662b37ebd82fcb2d55c5ee11f238a29a90901.jpg", 2000, 1428],
    "stove-fire": ["bbf4840e983c4c8b2ad37c2c7e37f64169d1122920cbb400c5cc5e2f58bf7611.jpg", 1800, 1199],
    "jobb-office-green": ["1f992f1394d4832dc03c2a81bafc579f441eb527b5411237e1c13308ddc2550f.jpg", 1200, 1600],
    "jobb-city-view": ["3da92873f5ae82f18cc9edba4149f1358d2005bcc28aa2b3272e911ca574788c.jpg", 1800, 1200],
    "jobb-team-laptop": ["f1cdb7fca07c4efc6c4cb340ec8567a4ec221eb7531e38565f76e14d7c38de62.jpg", 1600, 1067],
    "hiker-fjord-cliff": ["fa17b01a67fc1e104f4392c25c8cdb1e05672499d44a89de2107043b38af1533.jpg", 1200, 1800],
    "folk-mann-fjell": ["3fe05bae3d01838efbdfd8173e58580cfdcea15110d9b75e36db132751ea8d0f.jpg", 1000, 667],
    "coast-road-hills": ["49252820563dcbcdd3308b3dcf9555e30c0a62bd7e9b9db20345fb53d789df55.jpg", 1800, 1349],
  };

  // ---- small builders ---------------------------------------------------------
  function el(type, o) {
    return Doc.createElement(type, o);
  }
  function solid(c) {
    return Doc.solid(c);
  }
  /** Linear gradient from [[color, pos], …]; angle as in CSS. */
  function lin(angle, stops) {
    return { type: "gradient", kind: "linear", angle: angle, stops: stops.map(function (s) { return { color: s[0], pos: s[1] }; }) };
  }
  /** #rrggbb + alpha 0–1 → #rrggbbaa */
  function a(hex, alpha) {
    return hex + ("0" + Math.round(alpha * 255).toString(16)).slice(-2);
  }
  function rect(x, y, w, h, fill, o) {
    return el("shape", Object.assign({ kind: "rect", x: x, y: y, w: w, h: h, fill: fill, locked: false }, o));
  }
  function text(x, y, w, h, t, style, o) {
    return el("text", Object.assign({ x: x, y: y, w: w, h: h, text: t, style: Object.assign({ valign: "top", align: "left" }, style) }, o));
  }
  function photo(name, x, y, w, h, o) {
    var p = PHOTOS[name];
    return el("image", Object.assign({ asset: p[0], natW: p[1], natH: p[2], x: x, y: y, w: w, h: h, fit: "cover", posX: 50, posY: 50, zoom: 1 }, o));
  }
  function icon(name, o) {
    var set = WPE.util && WPE.util.icons ? WPE.util.icons() : null;
    return el("icon", Object.assign({ icon: name, nodes: set && set.icons[name] ? set.icons[name] : [] }, o));
  }

  // ---- the side strips ----------------------------------------------------------
  /**
   * The photo on one side (0–460 or 1460–1920) with its fades: into the edge
   * colour at the outer edge and at the bottom, and — for "overlay" — a dark
   * veil where the text sits.
   */
  function sidePhoto(t, side) {
    var left = side === "left";
    var x0 = left ? 0 : R;
    var p = t[side];
    var edge = t.edge;
    var out = [photo(p.photo, x0, 0, BG.width - R, BG.height, { posX: p.posX == null ? 50 : p.posX, posY: p.posY == null ? 50 : p.posY, zoom: p.zoom || 1, filters: p.filters, name: "Bilde " + (left ? "venstre" : "høyre") })];
    var fade = t.edgeFade || 180;
    out.push(rect(left ? 0 : BG.width - fade, 0, fade, BG.height, lin(left ? 90 : 270, [[edge, 0], [a(edge, 0), 100]]), { name: "Toning mot kanten" }));
    out.push(rect(x0, 560, BG.width - R, BG.height - 560, lin(180, [[a(edge, 0), 0], [edge, 100]]), { name: "Toning nederst" }));
    if (t.layout === "overlay") {
      var veil = t.veil || edge;
      out.push(rect(left ? 230 : R - 20, 0, 250, BG.height, lin(left ? 90 : 270, [[a(veil, 0), 0], [a(veil, t.veilStrength || 0.72), 38], [a(veil, t.veilStrength || 0.72), 100]]), { name: "Mørklegging bak teksten" }));
      out.push(rect(x0, 0, BG.width - R, 260, lin(180, [[a(veil, 0.55), 0], [a(veil, 0), 100]]), { name: "Mørklegging øverst" }));
    } else {
      // The brand column: solid, with a thin accent rule on its outer edge.
      out.push(rect(left ? L : R - 20, 0, SW + 20, BG.height, solid(t.band), { name: "Merkefelt " + (left ? "venstre" : "høyre") }));
      out.push(rect(left ? L : R + SW - 4, 0, 4, BG.height, solid(t.rule || t.accent), { name: "Kantlinje" }));
    }
    return out;
  }

  function button(x, y, w, h, label, t, extra) {
    return el("shape", Object.assign({
      kind: "rect", x: x, y: y, w: w, h: h, radius: t.radius == null ? 999 : t.radius,
      fill: t.ctaFill, text: label,
      style: Object.assign({ font: t.bodyFont, weight: 700, size: 14, color: t.ctaInk, letterSpacing: 0.02 }, t.ctaStyle),
      hover: "lift", name: "Knapp",
      shadow: t.ctaShadow === false ? null : { x: 0, y: 6, blur: 16, color: "#00000040" },
    }, extra));
  }

  /** The message in one strip: logo, kicker, headline, body, offer, button. */
  function sideCopy(t, x) {
    var s = t.side;
    var cx = x + PAD;
    var ink = t.sideInk || t.ink;
    var y = s.top || 34;
    var out = [];
    out.push(text(cx, y, CW, 30, t.brand, Object.assign({ font: t.logoFont || t.displayFont, weight: 800, size: 13, letterSpacing: 0.12, color: ink, align: "center", uppercase: true }, t.logoStyle, t.sideLogo), { name: "Logo (bytt til annonsørens logo)" }));
    out.push(rect(cx + CW / 2 - 14, y + 38, 28, 2, solid(t.accent), { name: "Strek" }));
    y += 66;
    if (s.kicker) {
      out.push(text(cx, y, CW, 20, s.kicker, { font: t.bodyFont, weight: 700, size: 11, letterSpacing: 0.18, uppercase: true, color: t.kickerInk || t.accent, align: "center" }, { name: "Stikktittel" }));
      y += 30;
    }
    out.push(text(cx, y, CW, s.headH || 150, s.headline, Object.assign({ font: t.displayFont, weight: t.displayWeight || 800, size: s.headSize || 28, lineHeight: 1.04, color: ink, align: "center" }, t.headStyle), { name: "Overskrift" }));
    y += (s.headH || 150) + 10;
    if (s.body) {
      out.push(text(cx, y, CW, 56, s.body, { font: t.bodyFont, weight: 500, size: 13, lineHeight: 1.35, color: t.mutedInk || ink, align: "center" }, { name: "Tekst" }));
      y += 66;
    }
    if (s.offer) {
      var offerH = Math.max(44, (s.offerSize || 30) + 14);
      out.push(text(cx - 4, y, CW + 8, offerH, s.offer, Object.assign({ font: t.offerFont || t.displayFont, weight: 800, size: s.offerSize || 30, lineHeight: 1, color: t.offerInk || t.accent, align: "center" }, t.offerStyle), { name: "Pris / tilbud" }));
      y += offerH;
      if (s.offerSub) {
        out.push(text(cx, y, CW, 20, s.offerSub, { font: t.bodyFont, weight: 500, size: 11, color: t.mutedInk || ink, align: "center" }, { name: "Pris, forklaring" }));
        y += 26;
      }
      y += 8;
    }
    out.push(button(cx, y, CW, 42, s.cta, t, { padX: 6, style: Object.assign({ font: t.bodyFont, weight: 700, size: 13, color: t.ctaInk }, t.ctaStyle) }));
    if (s.small) {
      out.push(text(cx - 4, y + 52, CW + 8, 76, s.small, { font: t.bodyFont, weight: 400, size: 11, lineHeight: 1.3, color: t.mutedInk || ink, align: "center" }, { opacity: 0.85, name: "Liten tekst" }));
    }
    // The address low in the strip, where a short screen still shows it.
    if (t.url) {
      out.push(rect(cx + CW / 2 - 14, 630, 28, 2, solid(t.accent), { name: "Strek" }));
      out.push(text(cx - 4, 644, CW + 8, 22, t.url, { font: t.bodyFont, weight: 600, size: 12, letterSpacing: 0.02, color: ink, align: "center" }, { name: "Nettadresse" }));
    }
    return out;
  }

  // ---- the top banner -------------------------------------------------------------
  /**
   * Photo on the right that melts into a colour field on the left ("split"),
   * or a photo across the whole banner with a veil behind the text
   * ("overlay"). Text block on the left in both.
   */
  function topBanner(t) {
    var tp = t.top;
    var W = TB.width;
    var H = TB.height;
    var field = tp.field || t.band || t.edge;
    var out = [];
    if (tp.layout === "overlay") {
      out.push(photo(tp.photo, 0, 0, W, H, { posX: tp.posX == null ? 50 : tp.posX, posY: tp.posY == null ? 50 : tp.posY, zoom: tp.zoom || 1, filters: tp.filters, name: "Bilde" }));
      out.push(rect(0, 0, W, H, lin(90, [[a(field, 0.92), 0], [a(field, 0.7), 42], [a(field, 0), 78]]), { name: "Mørklegging bak teksten" }));
    } else {
      var px = tp.photoX == null ? 440 : tp.photoX;
      out.push(photo(tp.photo, px, 0, W - px, H, { posX: tp.posX == null ? 50 : tp.posX, posY: tp.posY == null ? 50 : tp.posY, zoom: tp.zoom || 1, filters: tp.filters, name: "Bilde" }));
      out.push(rect(px - 1, 0, 200, H, lin(90, [[field, 0], [a(field, 0), 100]]), { name: "Toning inn i bildet" }));
    }
    var ink = tp.ink || t.ink;
    out.push(text(40, 30, 380, 26, t.brand, Object.assign({ font: t.logoFont || t.displayFont, weight: 800, size: 17, letterSpacing: 0.14, uppercase: true, color: ink }, t.logoStyle), { name: "Logo (bytt til annonsørens logo)" }));
    if (tp.kicker) out.push(text(40, 66, 460, 22, tp.kicker, { font: t.bodyFont, weight: 700, size: 12, letterSpacing: 0.18, uppercase: true, color: tp.kickerInk || t.kickerInk || t.accent }, { name: "Stikktittel" }));
    out.push(text(38, tp.kicker ? 88 : 72, tp.headW || 520, tp.headH || 112, tp.headline, Object.assign({ font: t.displayFont, weight: t.displayWeight || 800, size: tp.headSize || 46, lineHeight: 1.0, color: ink }, t.headStyle), { name: "Overskrift" }));
    out.push(text(40, tp.subY || 202, tp.subW || 440, 44, tp.sub, { font: t.bodyFont, weight: 500, size: 16, lineHeight: 1.35, color: tp.mutedInk || t.mutedInk || ink }, { name: "Tekst" }));
    out.push(button(40, tp.ctaY || 244, tp.ctaW || 196, 40, tp.cta, t, { style: Object.assign({ font: t.bodyFont, weight: 700, size: 14, color: t.ctaInk }, t.ctaStyle) }));
    if (tp.badge) out.push(tp.badge);
    if (tp.small) out.push(text(tp.smallX || 252, (tp.ctaY || 244) + 4, tp.smallW || 300, 34, tp.small, { font: t.bodyFont, weight: 400, size: 11, lineHeight: 1.25, color: tp.mutedInk || t.mutedInk || ink, valign: "middle" }, { name: "Liten tekst" }));
    return out;
  }

  /** A whole wallpaper from a template description. */
  function build(t) {
    var sides = sidePhoto(t, "left").concat(sidePhoto(t, "right"));
    var extra = t.extraSide ? t.extraSide(L, "left").concat(t.extraSide(R, "right")) : [];
    return {
      name: t.name,
      artboards: {
        background: { bg: solid(t.edge), elements: sides.concat(sideCopy(t, L), sideCopy(t, R), extra) },
        topbanner: { bg: solid(t.top.field || t.band || t.edge), elements: topBanner(t).concat(t.extraTop ? t.extraTop() : []) },
      },
    };
  }

  function burst(x, y, size, label, fill, ink, font, o) {
    return el("shape", Object.assign({ kind: "burst", points: 20, inner: 0.86, x: x, y: y, w: size, h: size, rot: -8, fill: fill, text: label, style: { font: font, weight: 800, size: Math.round(size * 0.24), lineHeight: 1, color: ink }, name: "Merke" }, o));
  }
  function disc(x, y, size, label, fill, ink, font, o) {
    return el("shape", Object.assign({ kind: "ellipse", x: x, y: y, w: size, h: size, fill: fill, text: label, style: { font: font, weight: 800, size: Math.round(size * 0.2), lineHeight: 1.05, color: ink }, padX: 10, padY: 10, name: "Merke", shadow: { x: 0, y: 8, blur: 22, color: "#00000040" } }, o));
  }

  // =================================================================================
  // The templates
  // =================================================================================
  var T = {};

  // ---- Bil: elbil-lansering ----------------------------------------------------------
  T.bil = {
    name: "Bil – lansering", brand: "Nordvei", layout: "overlay",
    edge: "#0b0f14", ink: "#ffffff", mutedInk: "#c9d1d9", accent: "#c6f432",
    displayFont: "Archivo", bodyFont: "Inter", displayWeight: 800,
    ctaFill: solid("#c6f432"), ctaInk: "#0b0f14", radius: 4,
    left: { photo: "trollstigen", posX: 62 }, right: { photo: "ev-snow-suv", posX: 78, posY: 60, filters: { brightness: 64, contrast: 105, saturate: 100, grayscale: 0, sepia: 0, hue: 0 } }, url: "nordvei.no",
    side: { kicker: "Nyhet", headline: "Helt ny. Helt elektrisk.", headSize: 24, headH: 104, body: "Inntil 560 km rekkevidde (WLTP)", offer: "449 900,-", offerSize: 25, offerSub: "Veil. pris levert", cta: "Prøvekjør" },
    top: {
      layout: "split", photo: "ev-suv-road", posX: 38, posY: 60, photoX: 420, field: "#0b0f14",
      kicker: "Nyhet · Aurora 2027", headline: "Nye Nordvei Aurora", headSize: 50, headH: 60,
      subY: 152, sub: "Inntil 560 km rekkevidde, 7 seter og hurtiglading på 26 minutter.", subW: 380, ctaY: 236, cta: "Book prøvekjøring ›", ctaW: 210,
      small: "Veil. pris fra 449 900 kr levert Oslo. Rekkevidde etter WLTP.", smallX: 266, smallW: 170,
    },
  };

  // ---- Energi: hjemmelading -----------------------------------------------------------
  T.lading = {
    name: "Energi – hjemmelading", brand: "Volta", layout: "overlay",
    edge: "#04211d", veil: "#04211d", ink: "#ffffff", mutedInk: "#bfe3d8", accent: "#36f1b6",
    displayFont: "Sora", bodyFont: "Inter", displayWeight: 700,
    ctaFill: solid("#36f1b6"), ctaInk: "#04211d",
    left: { photo: "home-charger-hand", posX: 70 }, right: { photo: "ev-charging-night", posX: 40 }, url: "volta.no",
    side: { kicker: "Ladeboks", headline: "Lad smart hjemme", headSize: 27, headH: 92, body: "Lader når strømmen er billigst", offer: "9 990,-", offerSize: 28, offerSub: "inkl. montering", cta: "Bestill" },
    top: {
      layout: "split", photo: "energi-ev-home", posX: 55, posY: 40, photoX: 470, field: "#04211d",
      kicker: "Volta Hjemmelading", headline: "Full bil hver morgen. Lavest mulig pris.", headSize: 40, headH: 96, headW: 450,
      subY: 190, sub: "Ladeboks med smartstyring – montert av elektriker.", subW: 420, ctaY: 240, cta: "Bestill befaring ›", ctaW: 196,
      badge: disc(784, 24, 150, "9 990,-\nmontert", solid("#36f1b6"), "#04211d", "Sora", { name: "Pris-merke", style: { font: "Sora", weight: 800, size: 23, lineHeight: 1.05, color: "#04211d" } }),
    },
  };

  // ---- Mobil: abonnement --------------------------------------------------------------
  T.mobil = {
    name: "Mobil – abonnement", brand: "Fjordnett", layout: "band",
    edge: "#1d0b3a", band: "#2a0f4f", rule: "#ff5c8a", ink: "#ffffff", mutedInk: "#e3d6ff", accent: "#ff5c8a",
    displayFont: "Outfit", bodyFont: "Outfit", displayWeight: 800,
    ctaFill: lin(90, [["#ff5c8a", 0], ["#ff8a5c", 100]]), ctaInk: "#1d0b3a",
    left: { photo: "folk-kvinne-kroller", posX: 36, posY: 30 }, right: { photo: "folk-mann-skjorte", posX: 50, posY: 25 }, url: "fjordnett.no",
    side: { kicker: "Familie", headline: "Fri data til hele gjengen", headSize: 27, headH: 124, body: "Del data med opptil 5 i familien", offer: "299,-", offerSize: 40, offerSub: "per måned", cta: "Bytt i dag" },
    top: {
      layout: "split", photo: "folk-kvinne-smil", posX: 50, posY: 32, photoX: 520, field: "#2a0f4f",
      kicker: "Fjordnett Familie", headline: "Fri data. Ingen binding.", headSize: 48, headH: 104, headW: 480,
      subY: 196, sub: "Del data med hele familien – fra 299,- i måneden.", subW: 440, ctaY: 240, cta: "Bytt i dag ›", ctaW: 170,
      badge: burst(770, 150, 130, "299,-\n/mnd", lin(135, [["#ff5c8a", 0], ["#ff8a5c", 100]]), "#1d0b3a", "Outfit", { rot: -10, name: "Pris-merke" }),
    },
  };

  // ---- Bank: boliglån -------------------------------------------------------------------
  T.bank = {
    name: "Bank – boliglån", brand: "Fjordbank", layout: "band",
    edge: "#0c2333", band: "#0f2a3d", rule: "#e2b75a", ink: "#ffffff", mutedInk: "#c9d7e2", accent: "#e2b75a",
    displayFont: "Source Serif 4", bodyFont: "Inter", displayWeight: 600, logoFont: "Inter",
    ctaFill: solid("#e2b75a"), ctaInk: "#0c2333", radius: 6, offerFont: "Source Serif 4",
    left: { photo: "bank-couple-keys", posX: 40 }, right: { photo: "oslo-new-apartments", posX: 30 }, url: "fjordbank.no",
    side: { kicker: "Første bolig", headline: "Endelig ditt eget sted", headSize: 26, headH: 100, body: "Svar på søknaden innen 24 timer", offer: "4,59 %", offerSize: 32, offerSub: "nom. rente", cta: "Søk boliglån", small: "Eff. 4,79 %, 2 mill., 25 år. Kost. 1 418 236 kr. Tot. 3 418 236 kr." },
    top: {
      layout: "split", photo: "bank-keys-hall", posX: 50, posY: 50, photoX: 540, field: "#0f2a3d",
      kicker: "Boliglån for førstegangskjøpere", headline: "Nøkkelen til ditt første hjem", headSize: 42, headH: 96, headW: 470,
      subY: 188, sub: "Nominell rente fra 4,59 %. Finansieringsbevis samme dag.", subW: 460, ctaY: 236, cta: "Søk boliglån ›", ctaW: 180,
      small: "Eff. rente 4,79 %, 2 mill. o/25 år. Kostnad 1 418 236 kr. Totalt 3 418 236 kr.", smallX: 234, smallW: 290,
    },
  };

  // ---- Dagligvare: ukens kupp -----------------------------------------------------------
  T.dagligvare = {
    name: "Dagligvare – ukens kupp", brand: "Kassen", layout: "band",
    edge: "#0e3b23", band: "#11512e", rule: "#ffd23f", ink: "#ffffff", mutedInk: "#d4ecd9", accent: "#ffd23f",
    displayFont: "Bricolage Grotesque", bodyFont: "DM Sans", displayWeight: 800,
    ctaFill: solid("#ffd23f"), ctaInk: "#11512e",
    left: { photo: "mat-apples-crates", posX: 50 }, right: { photo: "mat-salmon-tray", posX: 40 }, url: "kassen.no",
    side: { kicker: "Uke 47", headline: "Ukens kupp", headSize: 34, headH: 76, body: "Norsk laks 4 porsjoner", offer: "79,90", offerSize: 30, offerSub: "t.o.m. søndag", cta: "Se tilbudene" },
    top: {
      layout: "split", photo: "vegetables", posX: 40, posY: 50, photoX: 500, field: "#11512e",
      kicker: "Ukens kupp hos Kassen", headline: "Fersk middag for under hundrelappen", headSize: 40, headH: 96, headW: 470,
      subY: 190, sub: "Norsk laks, ferske grønnsaker og nyhøstede epler.", subW: 440, ctaY: 238, cta: "Se kundeavisen ›", ctaW: 196,
      badge: el("shape", { kind: "tag", x: 730, y: 172, w: 236, h: 100, rot: -6, fill: solid("#ffd23f"), text: "79,90", style: { font: "Bricolage Grotesque", weight: 800, size: 46, color: "#11512e" }, padX: 30, name: "Prislapp", shadow: { x: 0, y: 10, blur: 22, color: "#00000045" } }),
    },
  };

  // ---- Black Week -------------------------------------------------------------------------
  T.blackweek = {
    name: "Black Week", brand: "Lydverket", layout: "overlay",
    edge: "#070707", veil: "#070707", veilStrength: 0.6, ink: "#ffffff", mutedInk: "#bdbdbd", accent: "#e6ff00",
    displayFont: "Anton", bodyFont: "Inter", displayWeight: 400, logoFont: "Inter",
    ctaFill: solid("#e6ff00"), ctaInk: "#070707", radius: 0, offerFont: "Anton",
    headStyle: { uppercase: true, letterSpacing: 0.01 },
    left: { photo: "headphones-black-dark", posX: 40 }, right: { photo: "headphones-black-detail", posX: 30 }, url: "lydverket.no",
    side: { kicker: "Til søndag", headline: "Black Week", headSize: 44, headH: 100, body: "Hodetelefoner, høyttalere og hi-fi", offer: "-40 %", offerSize: 44, cta: "Handle nå" },
    top: {
      layout: "overlay", photo: "headphones-cream", posX: 50, posY: 50, field: "#070707", filters: { brightness: 70, contrast: 110, saturate: 100, grayscale: 100, sepia: 0, hue: 0 },
      kicker: "Lydverket · kun til søndag", headline: "BLACK WEEK", headSize: 92, headH: 100,
      subY: 196, sub: "Opptil 40 % på hodetelefoner, høyttalere og hi-fi.", subW: 460, ctaY: 240, cta: "Handle nå ›", ctaW: 170,
      badge: el("shape", { kind: "rect", x: 736, y: 74, w: 232, h: 150, rot: -4, fill: solid("#e6ff00"), text: "-40 %", style: { font: "Anton", weight: 400, size: 80, color: "#070707" }, padX: 10, name: "Rabatt-merke" }),
    },
  };

  // ---- Reise: kystreise ---------------------------------------------------------------------
  T.reise = {
    name: "Reise – kystreise", brand: "Kystlinjen", layout: "overlay",
    edge: "#0b1d2e", veil: "#0b1d2e", ink: "#ffffff", mutedInk: "#d5e2ee", accent: "#ffb35c",
    displayFont: "DM Serif Display", bodyFont: "DM Sans", displayWeight: 400, logoFont: "DM Sans",
    ctaFill: solid("#ffb35c"), ctaInk: "#0b1d2e", offerFont: "DM Serif Display",
    left: { photo: "lofoten-sunrise", posX: 70 }, right: { photo: "village-night", posX: 35 }, url: "kystlinjen.no",
    side: { kicker: "Vinter 2027", headline: "Nordlys fra dekk", headSize: 30, headH: 100, body: "7 dager Bergen–Kirkenes", offer: "9 990,-", offerSize: 30, offerSub: "per person, delt lugar", cta: "Se reisene" },
    top: {
      layout: "overlay", photo: "rib-sunset", posX: 60, posY: 45, field: "#0b1d2e",
      kicker: "Kystlinjen · vinter 2027", headline: "Opplev Lofoten når lyset kommer tilbake", headSize: 42, headH: 96, headW: 500,
      subY: 190, sub: "7 dager langs kysten fra 9 990,- per person.", subW: 440, ctaY: 238, cta: "Se reisene ›", ctaW: 170,
    },
  };

  // ---- Strømming: seriepremiere ---------------------------------------------------------------
  T.serie = {
    name: "Strømming – seriepremiere", brand: "Strømly", layout: "overlay",
    edge: "#050505", veil: "#050505", veilStrength: 0.68, ink: "#ffffff", mutedInk: "#c7c7c7", accent: "#e43d3d",
    displayFont: "Bebas Neue", bodyFont: "Inter", displayWeight: 400, logoFont: "Inter",
    ctaFill: solid("#c92a2a"), ctaInk: "#ffffff", radius: 3,
    headStyle: { letterSpacing: 0.04 },
    left: { photo: "film-night-car", posX: 60 }, right: { photo: "film-fire-silhouette", posX: 45 }, url: "stromly.no",
    side: { kicker: "Ny krimserie", headline: "Mørketid", headSize: 36, headH: 50, body: "Alle episoder fra fredag 7. november", offer: "Premiere 7.11", offerSize: 24, cta: "Se traileren" },
    top: {
      layout: "overlay", photo: "film-rooftop-skyline", posX: 60, posY: 40, field: "#050505",
      kicker: "Kun på Strømly", headline: "MØRKETID", headSize: 94, headH: 110, headW: 600,
      subY: 196, sub: "Ny norsk krimserie. Alle episoder fra fredag 7. november.", subW: 470, ctaY: 240, cta: "▶  Se traileren", ctaW: 180,
    },
  };

  // ---- Konsert / festival ------------------------------------------------------------------------
  T.festival = {
    name: "Festival – billettslipp", brand: "Fjordrock", layout: "overlay",
    edge: "#130a2b", veil: "#130a2b", veilStrength: 0.7, ink: "#ffffff", mutedInk: "#e1d7ff", accent: "#ff7ab6",
    displayFont: "Unbounded", bodyFont: "Space Grotesk", displayWeight: 800,
    ctaFill: lin(90, [["#ff5fa2", 0], ["#ffb15c", 100]]), ctaInk: "#130a2b",
    left: { photo: "fest-singer-smoke", posX: 50 }, right: { photo: "fest-hands-sunset", posX: 30 }, url: "fjordrock.no", sideLogo: { size: 11, letterSpacing: 0.08 },
    side: { kicker: "12.–14. juni", headline: "Fjord rock 2027", headSize: 25, headH: 92, body: "Tre dager, fire scener, ved sjøen i Bergen", offer: "Billetter i salg", offerSize: 17, cta: "Kjøp billett" },
    top: {
      layout: "overlay", photo: "fest-main-stage", posX: 50, posY: 40, field: "#130a2b",
      kicker: "12.–14. juni 2027 · Bergen", headline: "FJORDROCK", headSize: 76, headH: 92, headW: 620,
      subY: 190, sub: "Tre dager, fire scener og 40 artister ved sjøen.", subW: 440, ctaY: 238, cta: "Kjøp billett ›", ctaW: 180,
      badge: disc(800, 44, 140, "Early bird\n1 490,-", lin(135, [["#ff5fa2", 0], ["#ffb15c", 100]]), "#130a2b", "Unbounded", { name: "Pris-merke" }),
    },
  };

  // ---- Bolig: nytt prosjekt -----------------------------------------------------------------------
  T.bolig = {
    name: "Bolig – nytt prosjekt", brand: "Teglverket", layout: "band",
    edge: "#24180f", band: "#2e2016", rule: "#d9a273", ink: "#f7ede3", mutedInk: "#dccbbb", accent: "#d9a273",
    displayFont: "EB Garamond", bodyFont: "Inter", displayWeight: 500, logoFont: "Inter",
    ctaFill: solid("#d9a273"), ctaInk: "#24180f", radius: 0, offerFont: "EB Garamond",
    left: { photo: "loft-exterior-sunset", posX: 45 }, right: { photo: "loft-after", posX: 40 }, url: "teglverket.no", sideLogo: { size: 12, letterSpacing: 0.08 },
    side: { kicker: "Visning", headline: "Loft i gammel tegl", headSize: 30, headH: 100, body: "2–4-roms med takhøyde på 4,2 meter", offer: "fra 4,2 mill.", offerSize: 24, cta: "Se boligene" },
    top: {
      layout: "split", photo: "loft-rooftop", posX: 50, posY: 60, photoX: 520, field: "#2e2016",
      kicker: "Teglverket · salgsstart", headline: "Bo i byens vakreste fabrikk", headSize: 44, headH: 96, headW: 400,
      subY: 190, sub: "38 loftsleiligheter med takterrasse. Visning søndag 14–16.", subW: 440, ctaY: 238, cta: "Meld interesse ›", ctaW: 190,
    },
  };

  // ---- Mote: sesong ---------------------------------------------------------------------------------
  T.mote = {
    edgeFade: 90,
    name: "Mote – ny sesong", brand: "Atelier Nord", layout: "band",
    edge: "#efe6db", band: "#f6efe7", rule: "#a8242c", ink: "#1b1b1b", mutedInk: "#4a4440", accent: "#a8242c",
    displayFont: "Playfair Display", bodyFont: "Inter", displayWeight: 500, logoFont: "Inter",
    headStyle: { italic: true },
    ctaFill: solid("#1b1b1b"), ctaInk: "#f6efe7", radius: 0, ctaShadow: false, offerFont: "Playfair Display",
    ctaStyle: { letterSpacing: 0.14, uppercase: true, size: 12 },
    left: { photo: "portrait-woman-coat", posX: 50, posY: 30 }, right: { photo: "face-woman-scarf", posX: 50, posY: 30 }, url: "ateliernord.no", sideLogo: { size: 12, letterSpacing: 0.1 },
    side: { kicker: "Høst/vinter", headline: "Vinterens kåper", headSize: 26, headH: 90, body: "Ull og kasjmir, sydd for nordisk vær", offer: "-20 %", offerSize: 34, offerSub: "på nye kåper", cta: "Se mer" },
    top: {
      layout: "split", photo: "face-woman-red", posX: 50, posY: 35, photoX: 560, field: "#f6efe7", ink: "#1b1b1b",
      kicker: "Atelier Nord · høst/vinter", headline: "Varme farger, myke linjer", headSize: 46, headH: 100, headW: 500,
      subY: 190, sub: "Nå 20 % på nye kåper og strikk – kun denne uken.", subW: 460, ctaY: 238, cta: "Se kolleksjonen", ctaW: 200,
    },
  };

  // ---- Jul: julegaver ------------------------------------------------------------------------------------
  T.jul = {
    name: "Jul – julegaver", brand: "Hyttehuset", layout: "overlay",
    edge: "#2a0d0d", veil: "#2a0d0d", ink: "#fff7ec", mutedInk: "#f0d9c4", accent: "#e8c27a",
    displayFont: "Fraunces", bodyFont: "Inter", displayWeight: 600, logoFont: "Inter",
    ctaFill: solid("#e8c27a"), ctaInk: "#2a0d0d", offerFont: "Fraunces",
    left: { photo: "cabin-window-night", posX: 70 }, right: { photo: "candles-autumn", posX: 40 }, url: "hyttehuset.no", sideLogo: { size: 12, letterSpacing: 0.08 },
    side: { kicker: "Julen 2026", headline: "Gaver til hyttefolk", headSize: 26, headH: 92, body: "Pledd, lykter, kopper og ved", offer: "Fri frakt", offerSize: 26, offerSub: "over 499,-", cta: "Se gavene" },
    top: {
      layout: "overlay", photo: "stove-fire", posX: 60, posY: 55, field: "#2a0d0d",
      kicker: "Hyttehuset · julen 2026", headline: "Julegaver som varmer", headSize: 44, headH: 100, headW: 480,
      subY: 190, sub: "Alt til hyttekosen – fri frakt over 499,-.", subW: 440, ctaY: 238, cta: "Finn julegaver ›", ctaW: 196,
    },
    extraTop: function () {
      return [icon("snowflake", { x: 880, y: 28, w: 80, h: 80, color: "#e8c27a", strokeWidth: 1.4, opacity: 0.9, name: "Snøkrystall" })];
    },
  };

  // ---- B2B: programvare -------------------------------------------------------------------------------------
  T.b2b = {
    edgeFade: 90,
    name: "B2B – programvare", brand: "Regnskapet", layout: "band",
    edge: "#e9eef3", band: "#ffffff", rule: "#255fe6", ink: "#0b1f33", mutedInk: "#3e5266", accent: "#255fe6",
    displayFont: "Inter Tight", bodyFont: "Inter", displayWeight: 700,
    headStyle: { letterSpacing: -0.02 },
    ctaFill: solid("#255fe6"), ctaInk: "#ffffff", radius: 8,
    left: { photo: "jobb-office-green", posX: 60 }, right: { photo: "jobb-city-view", posX: 40 }, url: "regnskapet.no", sideLogo: { size: 12, letterSpacing: 0.08 },
    side: { kicker: "For bedrift", headline: "Regnskap på autopilot", headSize: 25, headH: 92, body: "Bilag, faktura og MVA – i én app", offer: "30 dager", offerSize: 26, offerSub: "gratis prøveperiode", cta: "Prøv gratis" },
    top: {
      layout: "split", photo: "jobb-team-laptop", posX: 50, posY: 40, photoX: 540, field: "#ffffff", ink: "#0b1f33",
      kicker: "Regnskapet for bedrift", headline: "Mindre papir. Mer tid til kundene.", headSize: 40, headH: 96, headW: 470,
      subY: 190, sub: "Bilag, faktura og MVA-melding i én app. Prøv gratis i 30 dager.", subW: 460, ctaY: 238, cta: "Prøv gratis ›", ctaW: 160,
      small: "Ingen binding. Avslutt når du vil.", smallX: 216, smallW: 220,
    },
  };

  // ---- Folkehelse: kampanje -------------------------------------------------------------------------------
  T.folkehelse = {
    edgeFade: 90,
    name: "Folkehelse – kampanje", brand: "Gå deg glad", layout: "band",
    edge: "#dfeee5", band: "#f1f8f3", rule: "#ff7a45", ink: "#123b2a", mutedInk: "#35594a", accent: "#ff7a45", kickerInk: "#b23c0d", offerInk: "#b23c0d",
    displayFont: "Lexend", bodyFont: "Lexend", displayWeight: 700, logoFont: "Lexend",
    ctaFill: solid("#123b2a"), ctaInk: "#ffffff",
    logoStyle: { letterSpacing: 0.02, uppercase: false },
    left: { photo: "hiker-fjord-cliff", posX: 40, posY: 30 }, right: { photo: "coast-road-hills", posX: 35, posY: 50 }, url: "gadegglad.no",
    side: { kicker: "Hver dag", headline: "30 minutter er nok", headSize: 25, headH: 92, body: "En rask tur holder både kropp og hode i form", offer: "30 min", offerSize: 30, cta: "Finn en tur" },
    top: {
      layout: "split", photo: "folk-mann-fjell", posX: 50, posY: 35, photoX: 540, field: "#f1f8f3", ink: "#123b2a",
      kicker: "Gå deg glad · en kampanje for bedre helse", headline: "Den beste medisinen går du selv", headSize: 42, headH: 96, headW: 470,
      subY: 190, sub: "30 minutter om dagen gjør mer enn du tror. Finn en tur nær deg.", subW: 460, ctaY: 238, cta: "Finn en tur ›", ctaW: 170,
    },
  };

  function blank() {
    return Doc.emptyDoc();
  }

  // Gallery order and filter groups.
  var LIST = [
    ["bil", "Bil", "Elbil-lansering: mørk og eksklusiv, bil på fjellvei"],
    ["lading", "Energi", "Hjemmelading og strøm: friskt grønt på mørkt"],
    ["mobil", "Telekom", "Abonnement med pris-merke og ansikter"],
    ["bank", "Finans", "Boliglån med rente og lovpålagt eksempel"],
    ["dagligvare", "Handel", "Ukens kupp med prislapp"],
    ["blackweek", "Handel", "Svart og neongult, store tall"],
    ["mote", "Handel", "Lys og redaksjonell, ny sesong"],
    ["jul", "Handel", "Varmt og lunt, julegaver"],
    ["reise", "Reise", "Kystreise i solnedgang og nordlys"],
    ["serie", "Underholdning", "Seriepremiere: filmplakat-stil"],
    ["festival", "Underholdning", "Billettslipp med neon og konsertlys"],
    ["bolig", "Bolig", "Nytt boligprosjekt: tegl og messing"],
    ["b2b", "Bedrift", "Ren og lys B2B-stil"],
    ["folkehelse", "Offentlig", "Kampanje: lyst, vennlig og tydelig"],
  ];

  WPE.TEMPLATE_PHOTOS = PHOTOS;
  WPE.templates = LIST.map(function (row) {
    var t = T[row[0]];
    return { id: row[0], name: t.name, category: row[1], desc: row[2], make: function () { return build(t); } };
  }).concat([{ id: "blank", name: "Tomt", category: "", desc: "Start helt på nytt", make: blank }]);
})();
