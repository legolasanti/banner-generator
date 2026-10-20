/* =========================================================================
   live-templates.js — the designs an NT Live creative can wear, and the
   rules for the user's own HTML/CSS.

   A template is plain HTML with placeholders plus a stylesheet:

     {{kamp}}               text, always escaped
     {{media}}              raw HTML the runtime builds (photo, video, animation)
     {{#odds}}…{{/odds}}    shown only when there are odds
     {{^reserve}}…{{/reserve}}  shown only when it is NOT the fallback poster
     {{#kamper}}…{{/kamper}}    repeated per match (list templates)

   The runtime (live.js) renders it; this file only knows what exists and
   how to make a stylesheet safe to drop next to the creative:

   • Every selector is scoped to `.bn--tpl-<id>`, so two templates on one
     page (the gallery) never style each other. A selector that starts with
     a format class (`.bn--desktop .x`) is fused to that scope, so one
     stylesheet can tune all four sizes.
   • Rules that would reach the regulated furniture (Annonse, 18+ |
     Hjelpelinjen.no, Vinnersjanse) are dropped. Those are drawn by the
     runtime in their own layer and a template may not move or hide them.
   • The user's own HTML loses scripts, frames, forms, inline handlers and
     javascript: links. The ad must keep the Campaign Manager 360 contract.

   UMD: a global in the browser (window.LiveTemplates), a module in Node.
   Nothing in here ships inside a package — the server resolves the chosen
   template into the config.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LiveTemplates = factory();
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var MAX_HTML = 20000;
  var MAX_CSS = 30000;
  var CUSTOM_ID = "egen";

  // ------------------------------------------------------------------------
  // Built-in templates
  // ------------------------------------------------------------------------
  // `zone` says where Annonse and 18+ sit: "media" = over the photo area
  // (whose height the template sets with --badges-h), "strip" = a slim strip
  // along the top edge, for designs without a photo band.
  var TEMPLATES = [
    {
      id: "klassisk",
      name: "Klassisk",
      description: "Bilde eller animasjon øverst, kampen under. Norsk Tippings standardoppsett.",
      mode: "slides",
      zone: "media",
      html: [
        '<div class="bn__media lt-media">{{media}}</div>',
        '<div class="bn__body lt-body">',
        '{{#kicker}}<span class="bn__live-kicker" data-inn="opp" style="--i:0">{{kicker}}</span>{{/kicker}}',
        '<h2 class="bn__headline" data-inn="opp" style="--i:1">{{kamp}}</h2>',
        '{{^reserve}}<span class="bn__live-time" data-live="tid" data-inn="opp" style="--i:2">{{tid}}</span>{{/reserve}}',
        '{{#reserve}}{{#tekst}}<span class="bn__live-time" data-inn="opp" style="--i:2">{{tekst}}</span>{{/tekst}}{{/reserve}}',
        '{{#odds}}<span class="bn__live-odds" data-inn="opp" style="--i:3">{{odds}}</span>{{/odds}}',
        '{{#knappetekst}}<span class="bn__live-cta" data-inn="opp" style="--i:4">{{knappetekst}}</span>{{/knappetekst}}',
        "</div>",
      ].join("\n"),
      css: [
        ".bn--desktop { --badges-h: 300px; }",
        ".bn--mobile { --badges-h: 215px; }",
        ".bn--readpeak { --badges-h: 160px; }",
        ".bn--newsgrid { --badges-h: 100px; }",
        ".lt-media { flex: none; height: var(--badges-h); }",
        ".lt-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; align-items: flex-start; background: #ffffff; }",
        ".bn--readpeak .lt-body { background: #edf5ed; }",
        ".bn__live-cta { margin-top: auto; }",
        ".bn--desktop .lt-body { padding: 15px 20px 18px; gap: 6px; }",
        ".bn--desktop .bn__live-kicker { font-size: 13px; }",
        ".bn--desktop .bn__headline { font-size: calc(33px * var(--hl-scale, 1)); line-height: 1.08; }",
        ".bn--desktop .bn__live-time { font-size: 18px; }",
        ".bn--desktop .bn__live-odds { font-size: 15px; }",
        ".bn--desktop .bn__live-cta { font-size: 15px; padding: 11px 20px; }",
        ".bn--mobile .lt-body { padding: 12px 16px 14px; gap: 5px; }",
        ".bn--mobile .bn__live-kicker { font-size: 11px; }",
        ".bn--mobile .bn__headline { font-size: calc(24px * var(--hl-scale, 1)); line-height: 1.1; }",
        ".bn--mobile .bn__live-time { font-size: 14.5px; }",
        ".bn--mobile .bn__live-odds { font-size: 13px; }",
        ".bn--mobile .bn__live-cta { font-size: 13.5px; padding: 10px 16px; }",
        ".bn--readpeak .lt-body { padding: 14px; gap: 5px; }",
        ".bn--readpeak .bn__live-kicker { font-size: 10.5px; letter-spacing: 0.7px; }",
        ".bn--readpeak .bn__headline { font-size: calc(23px * var(--hl-scale, 1)); line-height: 1.14; -webkit-line-clamp: 3; }",
        ".bn--readpeak .bn__live-time { font-size: 15px; }",
        ".bn--readpeak .bn__live-odds { font-size: 13px; }",
        ".bn--readpeak .bn__live-cta { font-size: 13px; padding: 10px 0; width: 100%; text-align: center; border-radius: 4px; }",
        ".bn--newsgrid .lt-body { padding: 8px 10px; gap: 3px; }",
        ".bn--newsgrid .bn__live-kicker, .bn--newsgrid .bn__live-odds { display: none; }",
        ".bn--newsgrid .bn__headline { font-size: calc(14.5px * var(--hl-scale, 1)); line-height: 1.15; }",
        ".bn--newsgrid .bn__live-time { font-size: 11px; }",
        ".bn--newsgrid .bn__live-cta { font-size: 10.5px; background: transparent; color: var(--live-accent); padding: 0; box-shadow: none; font-weight: 800; }",
        '.bn--newsgrid .bn__live-cta::after { content: " \\2192"; }',
      ].join("\n"),
    },
    {
      id: "matchkort",
      name: "Matchkort",
      description: "Lagene mot hverandre med draktmerker, VS-puls og banelinjer. Kraftig uten bilder.",
      mode: "slides",
      zone: "strip",
      html: [
        '<div class="lt-mk">',
        '<div class="lt-mk__bg">{{bakgrunn}}</div>',
        '<div class="lt-mk__pitch" aria-hidden="true"></div>',
        "{{^reserve}}",
        '<div class="lt-mk__top">{{#kicker}}<span class="lt-mk__kicker" data-inn="fade" style="--i:0">{{kicker}}</span>{{/kicker}}</div>',
        "{{#bortelag}}",
        '<div class="lt-mk__teams">',
        '<div class="lt-mk__team" data-inn="venstre" style="--i:1"><span class="lt-mk__crest">{{hjemmekode}}</span><span class="lt-mk__name">{{hjemmelag}}</span></div>',
        '<div class="lt-mk__vs" data-inn="pop" style="--i:3"><span>VS</span></div>',
        '<div class="lt-mk__team" data-inn="hoyre" style="--i:1"><span class="lt-mk__crest">{{bortekode}}</span><span class="lt-mk__name">{{bortelag}}</span></div>',
        "</div>",
        '<h2 class="bn__headline lt-mk__sr">{{kamp}}</h2>',
        "{{/bortelag}}",
        '{{^bortelag}}<div class="lt-mk__teams lt-mk__teams--reserve"><h2 class="bn__headline lt-mk__solo" data-inn="pop" style="--i:1">{{kamp}}</h2></div>{{/bortelag}}',
        '<span class="lt-mk__time" data-live="tid" data-inn="opp" style="--i:4">{{tid}}</span>',
        '{{#knappetekst}}<span class="bn__live-cta lt-mk__cta" data-inn="opp" style="--i:5">{{knappetekst}}</span>{{/knappetekst}}',
        "{{/reserve}}",
        "{{#reserve}}",
        '<div class="lt-mk__teams lt-mk__teams--reserve">',
        '{{#produkt}}<span class="lt-mk__kicker" data-inn="fade" style="--i:0">{{produkt}}</span>{{/produkt}}',
        '<h2 class="bn__headline lt-mk__solo" data-inn="pop" style="--i:1">{{kamp}}</h2>',
        '{{#tekst}}<span class="lt-mk__sub" data-inn="opp" style="--i:2">{{tekst}}</span>{{/tekst}}',
        "</div>",
        '{{#knappetekst}}<span class="bn__live-cta lt-mk__cta" data-inn="opp" style="--i:3">{{knappetekst}}</span>{{/knappetekst}}',
        "{{/reserve}}",
        "</div>",
      ].join("\n"),
      css: [
        ".lt-mk { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; text-align: center; color: #ffffff; background: var(--live-deep); overflow: hidden; box-sizing: border-box; padding: calc(var(--u) * 64px) calc(var(--u) * 26px) calc(var(--u) * 30px); }",
        ".lt-mk__bg { position: absolute; inset: 0; z-index: 0; }",
        ".lt-mk__bg::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(var(--live-deep-rgb), 0.74), rgba(var(--live-deep-rgb), 0.95) 72%); }",
        ".lt-mk__pitch { position: absolute; inset: 0; z-index: 0; pointer-events: none;",
        "  background: radial-gradient(circle at 50% 50%, transparent calc(var(--u) * 96px), rgba(255,255,255,0.11) calc(var(--u) * 96px + 1px), rgba(255,255,255,0.11) calc(var(--u) * 98px), transparent calc(var(--u) * 99px)),",
        "  linear-gradient(90deg, transparent calc(50% - 1px), rgba(255,255,255,0.09) calc(50% - 1px), rgba(255,255,255,0.09) calc(50% + 1px), transparent calc(50% + 1px)); }",
        ".lt-mk > *:not(.lt-mk__bg):not(.lt-mk__pitch) { position: relative; z-index: 1; }",
        ".lt-mk__top { min-height: calc(var(--u) * 28px); max-width: 100%; }",
        ".lt-mk__kicker { display: inline-block; max-width: 100%; box-sizing: border-box; font-size: calc(var(--u) * 12.5px); font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: calc(var(--u) * 7px) calc(var(--u) * 14px); border-radius: 999px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); }",
        ".lt-mk__teams { flex: 1 1 auto; min-height: 0; width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-content: center; align-items: start; gap: calc(var(--u) * 14px); }",
        ".lt-mk__teams--reserve { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: calc(var(--u) * 12px); }",
        ".lt-mk__team { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 12px); }",
        ".lt-mk__crest { width: calc(var(--u) * 108px); height: calc(var(--u) * 108px); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: calc(var(--u) * 31px); font-weight: 700; letter-spacing: 0.03em; background: linear-gradient(155deg, rgba(255,255,255,0.26), rgba(255,255,255,0.05)); box-shadow: inset 0 0 0 2px rgba(255,255,255,0.4), 0 12px 30px rgba(0,0,0,0.28); }",
        ".lt-mk__name { max-width: 100%; font-size: calc(var(--u) * 23px); font-weight: 700; line-height: 1.12; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }",
        ".lt-mk__vs { flex: none; margin-top: calc(var(--u) * 29px); width: calc(var(--u) * 50px); height: calc(var(--u) * 50px); border-radius: 50%; display: flex; align-items: center; justify-content: center; position: relative; background: #ffffff; color: var(--live-accent); font-size: calc(var(--u) * 15px); font-weight: 700; letter-spacing: 0.04em; box-shadow: 0 6px 18px rgba(0,0,0,0.25); }",
        ".lt-mk__vs::after { content: ''; position: absolute; inset: calc(var(--u) * -6px); border-radius: 50%; border: 2px solid rgba(255,255,255,0.55); animation: ltMkRing 2.4s ease-out infinite; }",
        "@keyframes ltMkRing { 0% { transform: scale(0.85); opacity: 0.9; } 100% { transform: scale(1.65); opacity: 0; } }",
        ".lt-mk__sr { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }",
        ".lt-mk__solo { color: #ffffff; font-size: calc(var(--u) * 40px * var(--hl-scale, 1)); line-height: 1.06; -webkit-line-clamp: 3; }",
        ".lt-mk__sub { font-size: calc(var(--u) * 18px); opacity: 0.82; font-weight: 700; }",
        ".lt-mk__time { margin-top: calc(var(--u) * 10px); max-width: 100%; box-sizing: border-box; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: calc(var(--u) * 19px); font-weight: 700; font-variant-numeric: tabular-nums; padding: calc(var(--u) * 8px) calc(var(--u) * 18px); border-radius: 999px; background: rgba(0,0,0,0.24); }",
        ".lt-mk__time.is-live { background: #c52b22; }",
        ".lt-mk__cta { margin-top: calc(var(--u) * 16px); background: #ffffff; color: var(--live-deep); font-size: calc(var(--u) * 16px); padding: calc(var(--u) * 13px) calc(var(--u) * 32px); border-radius: 999px; box-shadow: 0 8px 22px rgba(0,0,0,0.25); }",
        ".bn--mobile .lt-mk__kicker, .bn--readpeak .lt-mk__kicker { font-size: 10px; }",
        ".bn--mobile .lt-mk__time, .bn--readpeak .lt-mk__time { font-size: 14px; }",
        ".bn--mobile .lt-mk__cta, .bn--readpeak .lt-mk__cta { font-size: 13px; }",
        ".bn--newsgrid .lt-mk { padding: 26px 10px 9px; }",
        ".bn--newsgrid .lt-mk__top, .bn--newsgrid .lt-mk__name, .bn--newsgrid .lt-mk__sub { display: none; }",
        ".bn--newsgrid .lt-mk__crest { font-size: 15px; }",
        ".bn--newsgrid .lt-mk__vs { font-size: 9px; }",
        ".bn--newsgrid .lt-mk__solo { font-size: calc(17px * var(--hl-scale, 1)); }",
        ".bn--newsgrid .lt-mk__time { font-size: 11px; padding: 4px 9px; margin-top: 6px; }",
        ".bn--newsgrid .lt-mk__cta { margin-top: 6px; font-size: 10.5px; padding: 0; background: transparent; color: #ffffff; box-shadow: none; }",
        '.bn--newsgrid .lt-mk__cta::after { content: " \\2192"; }',
      ].join("\n"),
    },
    {
      id: "fullbilde",
      name: "Fullbilde",
      description: "Bildet, videoen eller animasjonen fyller hele flaten; teksten ligger over.",
      mode: "slides",
      zone: "strip",
      html: [
        '<div class="lt-fb">',
        '<div class="lt-fb__media">{{bakgrunn}}</div>',
        '{{^harbilde}}{{#bortelag}}<div class="lt-fb__mark" aria-hidden="true" data-inn="zoom" style="--i:0"><span>{{hjemmekode}}</span><i>vs</i><span>{{bortekode}}</span></div>{{/bortelag}}{{/harbilde}}',
        '<div class="lt-fb__shade"></div>',
        '<div class="lt-fb__body">',
        '{{#kicker}}<span class="lt-fb__kicker" data-inn="opp" style="--i:0">{{kicker}}</span>{{/kicker}}',
        '<h2 class="bn__headline lt-fb__title" data-inn="opp" style="--i:1">{{kamp}}</h2>',
        '{{#reserve}}{{#tekst}}<span class="lt-fb__sub" data-inn="opp" style="--i:2">{{tekst}}</span>{{/tekst}}{{/reserve}}',
        '<div class="lt-fb__row" data-inn="opp" style="--i:2">',
        '{{^reserve}}<span class="lt-fb__time" data-live="tid">{{tid}}</span>{{/reserve}}',
        '{{#knappetekst}}<span class="bn__live-cta lt-fb__cta">{{knappetekst}}</span>{{/knappetekst}}',
        "</div>",
        "</div>",
        "</div>",
      ].join("\n"),
      css: [
        ".lt-fb { position: absolute; inset: 0; overflow: hidden; background: var(--live-deep); color: #ffffff; }",
        ".lt-fb__media { position: absolute; inset: 0; }",
        ".lt-fb__mark { position: absolute; left: 0; right: 0; top: 24%; display: flex; align-items: center; justify-content: center; gap: calc(var(--u) * 18px); font-size: calc(var(--u) * 92px); font-weight: 700; letter-spacing: -0.02em; line-height: 1; color: transparent; -webkit-text-stroke: 2px rgba(255,255,255,0.28); }",
        ".lt-fb__mark i { font-style: normal; font-size: 0.3em; letter-spacing: 0.2em; -webkit-text-stroke: 0; color: rgba(255,255,255,0.55); }",
        ".bn--mobile .lt-fb__mark, .bn--readpeak .lt-fb__mark { font-size: 54px; top: 26%; }",
        ".bn--newsgrid .lt-fb__mark { font-size: 31px; top: 24%; gap: 6px; -webkit-text-stroke-width: 1px; }",
        ".lt-fb__shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.62) 66%, rgba(0,0,0,0.88) 100%); }",
        ".lt-fb__body { position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: flex-start; gap: calc(var(--u) * 10px); padding: 0 calc(var(--u) * 26px) calc(var(--u) * 24px); }",
        ".lt-fb__kicker { max-width: 100%; box-sizing: border-box; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: calc(var(--u) * 12.5px); font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; background: var(--live-accent); color: var(--live-on-accent); padding: calc(var(--u) * 6px) calc(var(--u) * 11px); border-radius: calc(var(--u) * 5px); }",
        ".lt-fb__title { color: #ffffff; font-size: calc(var(--u) * 40px * var(--hl-scale, 1)); line-height: 1.04; letter-spacing: -0.02em; text-shadow: 0 2px 14px rgba(0,0,0,0.35); -webkit-line-clamp: 2; }",
        ".lt-fb__sub { font-size: calc(var(--u) * 18px); font-weight: 700; opacity: 0.9; }",
        ".lt-fb__row { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: calc(var(--u) * 14px); margin-top: calc(var(--u) * 4px); }",
        ".lt-fb__time { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: calc(var(--u) * 19px); font-weight: 700; font-variant-numeric: tabular-nums; }",
        ".lt-fb__time.is-live { color: #ff6b5e; }",
        ".lt-fb__cta { flex: none; margin-left: auto; font-size: calc(var(--u) * 16px); padding: calc(var(--u) * 12px) calc(var(--u) * 24px); border-radius: calc(var(--u) * 7px); }",
        ".bn--mobile .lt-fb__kicker, .bn--readpeak .lt-fb__kicker { font-size: 10px; }",
        ".bn--mobile .lt-fb__time, .bn--readpeak .lt-fb__time { font-size: 14px; }",
        ".bn--mobile .lt-fb__cta, .bn--readpeak .lt-fb__cta { font-size: 13px; }",
        ".bn--readpeak .lt-fb__title { -webkit-line-clamp: 3; }",
        ".bn--newsgrid .lt-fb__body { padding: 0 9px 8px; gap: 4px; }",
        ".bn--newsgrid .lt-fb__kicker, .bn--newsgrid .lt-fb__sub { display: none; }",
        ".bn--newsgrid .lt-fb__title { font-size: calc(15px * var(--hl-scale, 1)); line-height: 1.12; }",
        ".bn--newsgrid .lt-fb__time { font-size: 10.5px; }",
        ".bn--newsgrid .lt-fb__cta { font-size: 10px; padding: 4px 7px; border-radius: 4px; }",
      ].join("\n"),
    },
    {
      id: "nedtelling",
      name: "Nedtelling",
      description: "En stor, tikkende nedtelling til avspark. Bytter til «Pågår nå» når kampen starter.",
      mode: "slides",
      zone: "strip",
      html: [
        '<div class="lt-cd">',
        '<div class="lt-cd__bg">{{bakgrunn}}</div>',
        '<div class="lt-cd__body">',
        '{{#kicker}}<span class="lt-cd__kicker" data-inn="fade" style="--i:0">{{kicker}}</span>{{/kicker}}',
        '<h2 class="bn__headline lt-cd__title" data-inn="opp" style="--i:1">{{kamp}}</h2>',
        "{{^reserve}}",
        '<span class="lt-cd__cap" data-inn="fade" style="--i:2">Avspark om</span>',
        '<div class="lt-cd__clock" data-inn="pop" style="--i:3">{{nedtelling}}</div>',
        '<span class="lt-cd__when" data-inn="fade" style="--i:4">{{klokke}}</span>',
        "{{/reserve}}",
        '{{#reserve}}{{#tekst}}<span class="lt-cd__when" data-inn="opp" style="--i:2">{{tekst}}</span>{{/tekst}}{{/reserve}}',
        '{{#knappetekst}}<span class="bn__live-cta lt-cd__cta" data-inn="opp" style="--i:5">{{knappetekst}}</span>{{/knappetekst}}',
        "</div>",
        "</div>",
      ].join("\n"),
      css: [
        ".lt-cd { position: absolute; inset: 0; overflow: hidden; background: var(--live-deep); color: #ffffff; }",
        ".lt-cd__bg { position: absolute; inset: 0; opacity: 0.55; }",
        ".lt-cd__bg::after { content: ''; position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 40%, rgba(var(--live-deep-rgb), 0.35), rgba(var(--live-deep-rgb), 0.92) 75%); }",
        ".lt-cd__body { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: calc(var(--u) * 10px); padding: calc(var(--u) * 56px) calc(var(--u) * 24px) calc(var(--u) * 28px); box-sizing: border-box; }",
        ".lt-cd__kicker { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: calc(var(--u) * 13px); font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.85; }",
        ".lt-cd__title { color: #ffffff; font-size: calc(var(--u) * 34px * var(--hl-scale, 1)); line-height: 1.06; letter-spacing: -0.015em; -webkit-line-clamp: 2; }",
        ".lt-cd__cap { margin-top: calc(var(--u) * 8px); font-size: calc(var(--u) * 12px); font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.7; }",
        ".is-live .lt-cd__cap { display: none; }",
        ".lt-cd__clock .bn__cd { gap: calc(var(--u) * 8px); }",
        ".lt-cd__clock .bn__cd-n { min-width: calc(var(--u) * 82px); padding: calc(var(--u) * 12px) 0 calc(var(--u) * 10px); font-size: calc(var(--u) * 46px); border-radius: calc(var(--u) * 12px); background: #ffffff; color: var(--live-deep); box-shadow: 0 10px 26px rgba(0,0,0,0.3), inset 0 -3px 0 rgba(0,0,0,0.08); }",
        ".lt-cd__clock .bn__cd-l { margin-top: calc(var(--u) * 7px); font-size: calc(var(--u) * 11px); opacity: 0.75; }",
        ".lt-cd__clock .bn__cd-sep { font-size: calc(var(--u) * 34px); padding-top: calc(var(--u) * 12px); opacity: 0.6; }",
        ".lt-cd__clock .bn__cd-live { font-size: calc(var(--u) * 26px); padding: calc(var(--u) * 12px) calc(var(--u) * 24px); border-radius: 999px; background: #c52b22; }",
        ".lt-cd__when { font-size: calc(var(--u) * 16px); font-weight: 700; opacity: 0.85; }",
        ".lt-cd__cta { margin-top: calc(var(--u) * 10px); background: var(--live-bright); color: #ffffff; font-size: calc(var(--u) * 16px); padding: calc(var(--u) * 13px) calc(var(--u) * 30px); border-radius: 999px; }",
        ".bn--desktop .lt-cd__body { gap: 12px; }",
        ".bn--desktop .lt-cd__title { font-size: calc(44px * var(--hl-scale, 1)); }",
        ".bn--desktop .lt-cd__clock .bn__cd { gap: 10px; }",
        ".bn--desktop .lt-cd__clock .bn__cd-n { min-width: 104px; font-size: 62px; padding: 16px 0 13px; border-radius: 14px; }",
        ".bn--desktop .lt-cd__clock .bn__cd-l { font-size: 12px; margin-top: 9px; }",
        ".bn--desktop .lt-cd__clock .bn__cd-sep { font-size: 46px; padding-top: 18px; }",
        ".bn--desktop .lt-cd__when { font-size: 18px; }",
        ".bn--desktop .lt-cd__cta { font-size: 17px; padding: 15px 36px; }",
        ".bn--mobile .lt-cd__kicker, .bn--readpeak .lt-cd__kicker { font-size: 10px; }",
        ".bn--mobile .lt-cd__cap, .bn--readpeak .lt-cd__cap { font-size: 9.5px; }",
        ".bn--mobile .lt-cd__clock .bn__cd-l, .bn--readpeak .lt-cd__clock .bn__cd-l { font-size: 9px; }",
        ".bn--mobile .lt-cd__when, .bn--readpeak .lt-cd__when { font-size: 13px; }",
        ".bn--mobile .lt-cd__cta, .bn--readpeak .lt-cd__cta { font-size: 13px; }",
        ".bn--newsgrid .lt-cd__body { padding: 24px 8px 8px; gap: 4px; }",
        ".bn--newsgrid .lt-cd__kicker, .bn--newsgrid .lt-cd__cap, .bn--newsgrid .lt-cd__when { display: none; }",
        ".bn--newsgrid .lt-cd__title { font-size: calc(14px * var(--hl-scale, 1)); line-height: 1.12; }",
        ".bn--newsgrid .lt-cd__clock .bn__cd { gap: 3px; }",
        ".bn--newsgrid .lt-cd__clock .bn__cd-n { min-width: 38px; font-size: 20px; padding: 6px 0 5px; border-radius: 6px; }",
        ".bn--newsgrid .lt-cd__clock .bn__cd-l { font-size: 7.5px; margin-top: 3px; }",
        ".bn--newsgrid .lt-cd__clock .bn__cd-sep { font-size: 15px; padding-top: 6px; }",
        ".bn--newsgrid .lt-cd__clock .bn__cd-live { font-size: 13px; padding: 6px 12px; }",
        ".bn--newsgrid .lt-cd__cta { margin-top: 3px; font-size: 10.5px; padding: 0; background: transparent; }",
        '.bn--newsgrid .lt-cd__cta::after { content: " \\2192"; }',
      ].join("\n"),
    },
    {
      id: "odds",
      name: "Oddstavle",
      description: "Kampen med H · U · B-odds som spretter inn. Fyll ut kolonnen Odds i arket.",
      mode: "slides",
      zone: "media",
      html: [
        '<div class="bn__media lt-media">{{media}}</div>',
        '<div class="bn__body lt-od">',
        '{{#kicker}}<span class="bn__live-kicker" data-inn="opp" style="--i:0">{{kicker}}</span>{{/kicker}}',
        '<h2 class="bn__headline lt-od__title" data-inn="opp" style="--i:1">{{kamp}}</h2>',
        '{{^reserve}}<span class="bn__live-time" data-live="tid" data-inn="opp" style="--i:2">{{tid}}</span>{{/reserve}}',
        '{{#reserve}}{{#tekst}}<span class="bn__live-time" data-inn="opp" style="--i:2">{{tekst}}</span>{{/tekst}}{{/reserve}}',
        "{{#harodds}}",
        '<div class="lt-od__odds">',
        '<span class="lt-od__o" data-inn="pop" style="--i:3"><small>H</small><b>{{odds1}}</b></span>',
        '{{#oddsx}}<span class="lt-od__o" data-inn="pop" style="--i:4"><small>U</small><b>{{oddsx}}</b></span>{{/oddsx}}',
        '<span class="lt-od__o" data-inn="pop" style="--i:5"><small>B</small><b>{{odds2}}</b></span>',
        "</div>",
        "{{/harodds}}",
        '{{^harodds}}<span class="lt-od__push"></span>{{/harodds}}',
        '{{#knappetekst}}<span class="bn__live-cta lt-od__cta" data-inn="opp" style="--i:6">{{knappetekst}}</span>{{/knappetekst}}',
        "</div>",
      ].join("\n"),
      css: [
        ".bn--desktop { --badges-h: 232px; }",
        ".bn--mobile { --badges-h: 160px; }",
        ".bn--readpeak { --badges-h: 132px; }",
        ".bn--newsgrid { --badges-h: 74px; }",
        ".lt-media { flex: none; height: var(--badges-h); }",
        ".lt-od { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; align-items: stretch; background: #ffffff; padding: calc(var(--u) * 16px) calc(var(--u) * 20px) calc(var(--u) * 18px); gap: calc(var(--u) * 6px); }",
        ".bn--readpeak .lt-od { background: #edf5ed; }",
        ".lt-od > * { align-self: flex-start; }",
        ".bn__live-kicker { font-size: calc(var(--u) * 13px); }",
        ".lt-od__title { font-size: calc(var(--u) * 29px * var(--hl-scale, 1)); line-height: 1.08; -webkit-line-clamp: 2; }",
        ".bn__live-time { font-size: calc(var(--u) * 16px); }",
        ".lt-od__odds { align-self: stretch; display: flex; gap: calc(var(--u) * 8px); margin-top: auto; }",
        ".lt-od__o { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 3px); padding: calc(var(--u) * 10px) calc(var(--u) * 8px) calc(var(--u) * 11px); border-radius: calc(var(--u) * 9px); background: var(--live-soft); box-shadow: inset 0 0 0 1px rgba(var(--live-accent-rgb), 0.22); }",
        ".lt-od__o small { font-size: calc(var(--u) * 12px); font-weight: 700; letter-spacing: 0.08em; color: var(--live-muted, #5c6157); }",
        ".lt-od__o b { font-size: calc(var(--u) * 28px); line-height: 1; font-weight: 700; color: var(--live-deep); font-variant-numeric: tabular-nums; }",
        ".lt-od__push { margin-top: auto; }",
        ".lt-od__cta { margin-top: calc(var(--u) * 10px); align-self: stretch; text-align: center; font-size: calc(var(--u) * 16px); padding: calc(var(--u) * 12px) 0; border-radius: calc(var(--u) * 8px); }",
        ".bn--mobile .bn__live-kicker, .bn--readpeak .bn__live-kicker { font-size: 10.5px; }",
        ".bn--mobile .bn__live-time, .bn--readpeak .bn__live-time { font-size: 13px; }",
        ".bn--mobile .lt-od__o small, .bn--readpeak .lt-od__o small { font-size: 11px; }",
        ".bn--mobile .lt-od__cta, .bn--readpeak .lt-od__cta { font-size: 13.5px; }",
        ".bn--newsgrid .lt-od { padding: 6px 9px 7px; gap: 3px; }",
        ".bn--newsgrid .bn__live-kicker, .bn--newsgrid .lt-od__cta { display: none; }",
        ".bn--newsgrid .lt-od__title { font-size: calc(13.5px * var(--hl-scale, 1)); line-height: 1.12; }",
        ".bn--newsgrid .bn__live-time { font-size: 10.5px; }",
        ".bn--newsgrid .lt-od__odds { gap: 3px; margin-top: auto; }",
        ".bn--newsgrid .lt-od__o { flex-direction: row; justify-content: space-between; align-items: baseline; padding: 3px 5px; border-radius: 4px; gap: 2px; }",
        ".bn--newsgrid .lt-od__o small { font-size: 8px; }",
        ".bn--newsgrid .lt-od__o b { font-size: 11.5px; }",
        ".bn--desktop .lt-od__title { font-size: calc(32px * var(--hl-scale, 1)); }",
      ].join("\n"),
    },
    {
      id: "kampliste",
      name: "Kampliste",
      description: "Alle dagens kamper på én flate, med klokkeslett og live-markering. Roterer ikke.",
      mode: "list",
      zone: "strip",
      html: [
        '<div class="lt-kl">',
        '<div class="lt-kl__head">',
        '<span class="lt-kl__title" data-inn="opp" style="--i:0">{{listetittel}}</span>',
        '{{#dag}}<span class="lt-kl__day" data-inn="opp" style="--i:1">{{produkt}}{{#produkt}} · {{/produkt}}{{dag}}</span>{{/dag}}',
        "</div>",
        "{{^reserve}}",
        '<ol class="lt-kl__list">',
        '{{#kamper}}<li class="lt-kl__row" data-rid="{{id}}" data-inn="venstre" style="--i:{{nr}}">',
        '<span class="lt-kl__time" data-live="kort">{{kort}}</span>',
        '<span class="lt-kl__match"><span class="lt-kl__teams">{{kamp}}</span>{{#turnering}}<span class="lt-kl__league">{{turnering}}</span>{{/turnering}}</span>',
        "</li>{{/kamper}}",
        "</ol>",
        "{{/reserve}}",
        '{{#reserve}}<div class="lt-kl__empty"><h2 class="bn__headline" data-inn="opp" style="--i:2">{{kamp}}</h2>{{#tekst}}<span data-inn="opp" style="--i:3">{{tekst}}</span>{{/tekst}}</div>{{/reserve}}',
        '{{#knappetekst}}<span class="bn__live-cta lt-kl__cta" data-inn="opp" style="--i:9">{{knappetekst}}</span>{{/knappetekst}}',
        "</div>",
      ].join("\n"),
      css: [
        ".lt-kl { position: absolute; inset: 0; display: flex; flex-direction: column; background: #ffffff; overflow: hidden; }",
        ".lt-kl__head { flex: none; display: flex; flex-direction: column; gap: calc(var(--u) * 4px); padding: calc(var(--u) * 60px) calc(var(--u) * 22px) calc(var(--u) * 16px); color: #ffffff; background: linear-gradient(135deg, var(--live-accent), var(--live-deep)); position: relative; overflow: hidden; }",
        ".lt-kl__head::after { content: ''; position: absolute; right: calc(var(--u) * -40px); top: calc(var(--u) * -40px); width: calc(var(--u) * 180px); height: calc(var(--u) * 180px); border-radius: 50%; border: calc(var(--u) * 26px) solid rgba(255,255,255,0.07); }",
        ".lt-kl__title { font-size: calc(var(--u) * 31px * var(--hl-scale, 1)); font-weight: 700; line-height: 1.05; letter-spacing: -0.015em; }",
        ".lt-kl__day { font-size: calc(var(--u) * 13px); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.82; }",
        ".lt-kl__list { flex: 1 1 auto; min-height: 0; list-style: none; margin: 0; padding: calc(var(--u) * 6px) calc(var(--u) * 22px); display: flex; flex-direction: column; overflow: hidden; }",
        ".lt-kl__row { display: flex; align-items: center; gap: calc(var(--u) * 14px); padding: calc(var(--u) * 10px) 0; border-bottom: 1px solid #e8ece4; min-height: 0; }",
        ".lt-kl__row:last-child { border-bottom: 0; }",
        ".lt-kl__time { flex: none; min-width: calc(var(--u) * 62px); font-size: calc(var(--u) * 18px); font-weight: 700; color: var(--live-accent); font-variant-numeric: tabular-nums; }",
        ".lt-kl__time.is-live { color: #c52b22; }",
        ".lt-kl__match { min-width: 0; display: flex; flex-direction: column; gap: 1px; }",
        ".lt-kl__teams { font-size: calc(var(--u) * 18px); font-weight: 700; color: #1d1f1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
        ".lt-kl__league { font-size: calc(var(--u) * 12px); color: #6b7064; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
        ".lt-kl__empty { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 0 calc(var(--u) * 22px); color: #5c6157; font-weight: 700; }",
        ".lt-kl__empty .bn__headline { font-size: calc(var(--u) * 28px * var(--hl-scale, 1)); }",
        ".lt-kl__cta { flex: none; margin: 0 calc(var(--u) * 22px) calc(var(--u) * 18px); text-align: center; font-size: calc(var(--u) * 16px); padding: calc(var(--u) * 12px) 0; border-radius: calc(var(--u) * 8px); }",
        ".lt-kl__row:nth-child(n+7) { display: none; }",
        ".bn--mobile .lt-kl__row:nth-child(n+6), .bn--readpeak .lt-kl__row:nth-child(n+6) { display: none; }",
        ".bn--mobile .lt-kl__day, .bn--readpeak .lt-kl__day { font-size: 10px; }",
        ".bn--mobile .lt-kl__league, .bn--readpeak .lt-kl__league { font-size: 10px; }",
        ".bn--mobile .lt-kl__cta, .bn--readpeak .lt-kl__cta { font-size: 13.5px; }",
        ".bn--readpeak .lt-kl { background: #edf5ed; }",
        ".bn--readpeak .lt-kl__row { border-bottom-color: #d6e3d4; }",
        ".bn--newsgrid .lt-kl__head { padding: 22px 9px 6px; gap: 0; }",
        ".bn--newsgrid .lt-kl__title { font-size: calc(14px * var(--hl-scale, 1)); }",
        ".bn--newsgrid .lt-kl__day, .bn--newsgrid .lt-kl__league, .bn--newsgrid .lt-kl__cta { display: none; }",
        ".bn--newsgrid .lt-kl__list { padding: 2px 9px; }",
        ".bn--newsgrid .lt-kl__row { gap: 6px; padding: 5px 0; }",
        ".bn--newsgrid .lt-kl__row:nth-child(n+5) { display: none; }",
        ".bn--newsgrid .lt-kl__time { min-width: 30px; font-size: 10.5px; }",
        ".bn--newsgrid .lt-kl__teams { font-size: 10.5px; }",
      ].join("\n"),
    },
  ];

  // Starting point for "Egen kode" from scratch: small, commented, shows the
  // conventions (placeholders, data-inn motion, a format override).
  var CUSTOM_STARTER = {
    html: [
      '<div class="egen">',
      '  <div class="egen__bilde">{{bakgrunn}}</div>',
      '  <div class="egen__tekst">',
      '    {{#kicker}}<span class="egen__liga" data-inn="opp" style="--i:0">{{kicker}}</span>{{/kicker}}',
      '    <h2 class="bn__headline egen__kamp" data-inn="opp" style="--i:1">{{kamp}}</h2>',
      '    {{^reserve}}<span class="egen__tid" data-live="tid" data-inn="opp" style="--i:2">{{tid}}</span>{{/reserve}}',
      '    {{#knappetekst}}<span class="bn__live-cta egen__knapp" data-inn="pop" style="--i:3">{{knappetekst}}</span>{{/knappetekst}}',
      "  </div>",
      "</div>",
    ].join("\n"),
    css: [
      "/* Alt her gjelder bare denne annonsen. --u er 1 på desktop og mindre",
      "   på de små formatene, så calc(var(--u) * 20px) skalerer av seg selv.",
      "   Start en regel med .bn--mobile, .bn--readpeak, .bn--newsgrid eller",
      "   .bn--desktop for å justere ett format. */",
      ".egen { position: absolute; inset: 0; background: var(--live-deep); color: #fff; }",
      ".egen__bilde { position: absolute; inset: 0; opacity: 0.6; }",
      ".egen__tekst { position: absolute; left: 0; right: 0; bottom: 0; padding: calc(var(--u) * 24px);",
      "  display: flex; flex-direction: column; align-items: flex-start; gap: calc(var(--u) * 8px); }",
      ".egen__liga { font-size: calc(var(--u) * 13px); font-weight: 700; text-transform: uppercase; letter-spacing: .12em; }",
      ".egen__kamp { color: #fff; font-size: calc(var(--u) * 38px); line-height: 1.05; }",
      ".egen__tid { font-size: calc(var(--u) * 18px); font-weight: 700; }",
      ".egen__knapp { font-size: calc(var(--u) * 16px); padding: calc(var(--u) * 12px) calc(var(--u) * 22px); }",
      ".bn--newsgrid .egen__liga { display: none; }",
    ].join("\n"),
  };

  /** Placeholders the editor offers, in the order it lists them. */
  var PLACEHOLDERS = [
    { key: "kamp", label: "Kamp", example: "Real Madrid – Liverpool" },
    { key: "hjemmelag", label: "Hjemmelag", example: "Real Madrid" },
    { key: "bortelag", label: "Bortelag", example: "Liverpool" },
    { key: "hjemmekode", label: "Hjemmekode", example: "RMA" },
    { key: "bortekode", label: "Bortekode", example: "LIV" },
    { key: "turnering", label: "Turnering", example: "Champions League" },
    { key: "produkt", label: "Produktlinje", example: "Oddsen" },
    { key: "kicker", label: "Produkt · turnering", example: "Oddsen · Champions League" },
    { key: "tid", label: "Tid (oppdateres)", example: "I dag kl. 21:00", note: 'Legg data-live="tid" på elementet, så tikker det.' },
    { key: "nedtelling", label: "Nedtelling (HTML)", example: "02 : 14 : 09", html: true },
    { key: "klokke", label: "Dag + klokkeslett", example: "I dag kl. 21:00" },
    { key: "dag", label: "Dag", example: "I dag" },
    { key: "dato", label: "Dato", example: "tirsdag 20. oktober" },
    { key: "klokkeslett", label: "Klokkeslett", example: "21:00" },
    { key: "knappetekst", label: "Knappetekst", example: "Spill nå" },
    { key: "tekst", label: "Tekst", example: "Over 2,5 mål?" },
    { key: "odds", label: "Odds (linje)", example: "2,05 · 3,60 · 3,40" },
    { key: "odds1", label: "Odds H", example: "2,05" },
    { key: "oddsx", label: "Odds U", example: "3,60" },
    { key: "odds2", label: "Odds B", example: "3,40" },
    { key: "media", label: "Media (HTML)", example: "bilde/video/animasjon", html: true },
    { key: "bakgrunn", label: "Bakgrunn (HTML)", example: "media uten lagnavn", html: true },
    { key: "listetittel", label: "Listetittel", example: "Dagens kamper" },
  ];

  var SECTIONS = [
    { key: "reserve", label: "Reserveplakat", hint: "{{#reserve}}…{{/reserve}} vises når arket ikke har kamper" },
    { key: "harodds", label: "Har odds", hint: "{{#harodds}}…{{/harodds}}" },
    { key: "harbilde", label: "Har bilde/video", hint: "{{#harbilde}}…{{/harbilde}}" },
    { key: "kamper", label: "Kampliste", hint: "{{#kamper}}…{{/kamper}} gjentas per kamp (listemaler)" },
  ];

  var MOTIONS = [
    { id: "av", name: "Av", description: "Ingen inngang; bare overgangen mellom kampene." },
    { id: "rolig", name: "Rolig", description: "Myk toning, korte avstander." },
    { id: "standard", name: "Standard", description: "Elementene glir inn etter hverandre." },
    { id: "livlig", name: "Livlig", description: "Sprett og lengre bevegelser. Mest blikkfang." },
  ];

  var ENTRANCES = ["opp", "ned", "venstre", "hoyre", "pop", "fade", "zoom"];

  var BACKGROUNDS = [
    { id: "gradient", name: "Gradient" },
    { id: "lys", name: "Lyskaster" },
    { id: "striper", name: "Striper" },
    { id: "puls", name: "Puls" },
    { id: "konfetti", name: "Konfetti" },
    { id: "bilde", name: "Reservebildet" },
  ];

  var ACCENTS = [
    { hex: "#1a6b1a", name: "Oddsen-grønn" },
    { hex: "#0f4a10", name: "Mørk grønn" },
    { hex: "#0b5e8a", name: "Havblå" },
    { hex: "#14213d", name: "Natt" },
    { hex: "#5b2a86", name: "Lilla" },
    { hex: "#c52b22", name: "Rød" },
    { hex: "#d9480f", name: "Oransje" },
    { hex: "#2f2f2f", name: "Grafitt" },
  ];

  function byId(id) {
    for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i];
    return null;
  }

  function ids() {
    return TEMPLATES.map(function (t) { return t.id; }).concat([CUSTOM_ID]);
  }

  // ------------------------------------------------------------------------
  // Sanitising the user's own code
  // ------------------------------------------------------------------------
  var BLOCKED_TAGS = "script|iframe|frame|frameset|object|embed|applet|link|meta|base|form|input|button|textarea|select|style|title|noscript|template|portal";

  /**
   * HTML the creative can carry. Not a general-purpose sanitizer: the author
   * is a trusted colleague, the point is to keep the ad within the CM360
   * contract (no scripts, no nested links, no frames) whatever is pasted in.
   */
  function sanitizeHtml(input) {
    var s = String(input == null ? "" : input).slice(0, MAX_HTML);
    var paired = new RegExp("<(" + BLOCKED_TAGS + ")\\b[\\s\\S]*?<\\/\\1\\s*>", "gi");
    var single = new RegExp("<\\/?(" + BLOCKED_TAGS + ")\\b[^>]*>", "gi");
    // Repeat until nothing changes, so a tag split around another
    // ("<scr<script>ipt>") cannot reassemble itself.
    for (var pass = 0; pass < 8; pass++) {
      var before = s;
      s = s.replace(/<!--[\s\S]*?-->/g, "");
      s = s.replace(paired, "");
      s = s.replace(single, "");
      // Inline handlers in any quoting style, also after / or a quote.
      s = s.replace(/([\s/"'])on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "$1");
      if (s === before) break;
    }
    // Tidy the gaps removed attributes leave inside a tag.
    s = s.replace(/<[a-z][^<>]*>/gi, function (tag) {
      return tag.replace(/\s{2,}/g, " ").replace(/\s+(\/?>)$/, "$1");
    });
    // Links and sources that run code.
    s = s.replace(/(href|src|xlink:href|action|formaction|srcdoc)\s*=\s*("\s*(?:javascript|vbscript|data:text\/html)[^"]*"|'\s*(?:javascript|vbscript|data:text\/html)[^']*'|(?:javascript|vbscript):[^\s>]*)/gi, '$1="#"');
    s = s.replace(/\ssrcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    // The whole creative is already one link; a nested <a> is invalid HTML.
    s = s.replace(/<a\b/gi, "<span").replace(/<\/a\s*>/gi, "</span>");
    return s;
  }

  function stripCssComments(css) {
    return String(css).replace(/\/\*[\s\S]*?\*\//g, "");
  }

  function sanitizeCss(input) {
    var s = stripCssComments(String(input == null ? "" : input).slice(0, MAX_CSS));
    s = s.replace(/<\/?style/gi, "");
    s = s.replace(/@import[^;]*;?/gi, "");
    s = s.replace(/expression\s*\(/gi, "(");
    s = s.replace(/(behavior|-moz-binding)\s*:[^;}]*/gi, "");
    // url() only to https or an inline image.
    s = s.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, function (m, q, url) {
      var u = url.trim();
      if (/^https:\/\//i.test(u) || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(u)) return "url(" + q + u + q + ")";
      return "none";
    });
    return s;
  }

  // Selectors that would touch the regulated furniture.
  var PROTECTED = /bn__(live-badges|badge|age|annonse|vinner|topbar|annonse-top)/;

  function splitTopLevel(text, sep) {
    var out = [];
    var depth = 0;
    var start = 0;
    var quote = "";
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (quote) {
        if (c === quote && text[i - 1] !== "\\") quote = "";
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (c === sep && depth === 0) {
        out.push(text.slice(start, i));
        start = i + 1;
      }
    }
    out.push(text.slice(start));
    return out;
  }

  /**
   * One selector → the same selector inside the template's slides, or null
   * to drop it. Everything lands under `.bn__live-stage`, the layer the
   * slides live in, so no rule — however broad (`*`, `span`, `~ *`) — can
   * reach the badge layer next to it. A selector that starts with the
   * root's own classes (.bn, .bn--desktop, :hover on it) fuses them to the
   * scope first, so one stylesheet can tune all four sizes.
   * @returns {{selector:string, root:boolean}|null}  root: it targets the
   *   ad root itself (only custom properties are kept for those)
   */
  function scopeRule(selector, scope) {
    var sel = selector.trim();
    if (!sel || PROTECTED.test(sel) || /bn__live-stage/.test(sel)) return null;
    sel = sel.replace(/^(html|body|:root)\b\s*/i, ":scope ");
    var head = "";
    var m = /^((?::scope|\.bn(?:--[\w-]+)?(?![\w-]))(?:\.bn--[\w-]+|:hover|:focus-within)*)(.*)$/.exec(sel);
    if (m) {
      head = m[1].replace(/^:scope/, "").replace(/^\.bn(?![\w-])/, "");
      sel = m[2];
    }
    var rest = sel.trim().replace(/^[>+~]\s*/, "");
    if (!rest) return { selector: scope + head, root: true };
    return { selector: (scope + head + " .bn__live-stage " + rest).replace(/\s+/g, " ").trim(), root: false };
  }

  /** Back-compat helper (tests, lint): the scoped selector text or null. */
  function scopeSelector(selector, scope) {
    var r = scopeRule(selector, scope);
    return r ? r.selector : null;
  }

  /** Only `--name: value` declarations, for rules on the ad root. */
  function customPropertiesOnly(body) {
    return splitTopLevel(body, ";")
      .map(function (d) { return d.trim(); })
      .filter(function (d) { return /^--[\w-]+\s*:/.test(d); })
      .join("; ");
  }

  /** Find the `}` that closes the block opened at `open` (an index of `{`). */
  function closeOf(text, open) {
    var depth = 0;
    var quote = "";
    for (var i = open; i < text.length; i++) {
      var c = text[i];
      if (quote) {
        if (c === quote && text[i - 1] !== "\\") quote = "";
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return text.length;
  }

  function scopeBlocks(text, scope) {
    var out = "";
    var i = 0;
    while (i < text.length) {
      var brace = text.indexOf("{", i);
      var semi = text.indexOf(";", i);
      if (brace === -1) break;
      if (semi !== -1 && semi < brace && /^\s*@/.test(text.slice(i, semi))) {
        i = semi + 1; // @charset / @import / @namespace: never needed here
        continue;
      }
      var prelude = text.slice(i, brace).trim();
      var end = closeOf(text, brace);
      var body = text.slice(brace + 1, end);
      i = end + 1;
      if (!prelude) continue;
      if (/^@(media|supports|container)\b/i.test(prelude)) {
        var inner = scopeBlocks(body, scope);
        if (inner.trim()) out += prelude + " {\n" + inner + "}\n";
      } else if (/^@(-webkit-)?keyframes\b/i.test(prelude) || /^@font-face\b/i.test(prelude)) {
        out += prelude + " {" + body + "}\n";
      } else if (/^@/.test(prelude)) {
        continue;
      } else {
        var rules = splitTopLevel(prelude, ",")
          .map(function (s) { return scopeRule(s, scope); })
          .filter(Boolean);
        var inner2 = rules.filter(function (r) { return !r.root; }).map(function (r) { return r.selector; });
        var roots = rules.filter(function (r) { return r.root; }).map(function (r) { return r.selector; });
        if (inner2.length) out += inner2.join(", ") + " {" + body + "}\n";
        var vars = roots.length ? customPropertiesOnly(body) : "";
        if (vars) out += roots.join(", ") + " { " + vars + " }\n";
      }
    }
    return out;
  }

  /** A stylesheet confined to one template's root class. */
  function scopeCss(css, scope) {
    return scopeBlocks(sanitizeCss(css), scope);
  }

  /** What the editor reports about the user's CSS: rules kept and dropped. */
  function lintCss(css) {
    var clean = sanitizeCss(css);
    var dropped = 0;
    var kept = 0;
    (function walk(text) {
      var i = 0;
      while (i < text.length) {
        var brace = text.indexOf("{", i);
        if (brace === -1) break;
        var prelude = text.slice(i, brace).trim().replace(/^[^{]*;/, "").trim();
        var end = closeOf(text, brace);
        var body = text.slice(brace + 1, end);
        i = end + 1;
        if (/^@(media|supports|container)\b/i.test(prelude)) walk(body);
        else if (/^@/.test(prelude) || !prelude) continue;
        else {
          splitTopLevel(prelude, ",").forEach(function (s) {
            if (scopeSelector(s, ".x")) kept++;
            else if (s.trim()) dropped++;
          });
        }
      }
    })(clean);
    var opens = (clean.match(/{/g) || []).length;
    var closes = (clean.match(/}/g) || []).length;
    return { kept: kept, dropped: dropped, balanced: opens === closes };
  }

  function lintHtml(html) {
    var raw = String(html || "");
    var clean = sanitizeHtml(raw);
    var sections = [];
    var re = /\{\{\s*([#^/])\s*([\wæøå-]+)\s*\}\}/gi;
    var m;
    var problems = [];
    while ((m = re.exec(clean))) {
      var key = m[2].toLowerCase();
      if (m[1] === "/") {
        if (sections[sections.length - 1] === key) sections.pop();
        else problems.push("{{/" + m[2] + "}} lukker en seksjon som ikke er åpnet");
      } else sections.push(key);
    }
    sections.forEach(function (k) { problems.push("{{#" + k + "}} er ikke lukket med {{/" + k + "}}"); });
    return { removed: clean.length !== raw.slice(0, MAX_HTML).length, tooLong: raw.length > MAX_HTML, problems: problems };
  }

  // ------------------------------------------------------------------------
  // Resolving a design into what the runtime renders
  // ------------------------------------------------------------------------
  /**
   * @param {Object} design  needs .template, and .customHtml/.customCss/
   *                          .customMode/.customZone for "egen"
   * @param {Object} [opts]   { id } — render under another class (the
   *                          editor's unsaved draft next to the saved one)
   * @returns {{id:string, mode:string, zone:string, html:string, css:string}}
   */
  function resolve(design, opts) {
    var d = design || {};
    var o = opts || {};
    var custom = d.template === CUSTOM_ID;
    var base = custom ? null : byId(d.template) || TEMPLATES[0];
    var id = String(o.id || (custom ? CUSTOM_ID : base.id)).replace(/[^\w-]/g, "");
    var html = custom ? sanitizeHtml(d.customHtml || CUSTOM_STARTER.html) : base.html;
    var css = custom ? (d.customCss == null ? CUSTOM_STARTER.css : d.customCss) : base.css;
    return {
      id: id,
      mode: custom ? (d.customMode === "list" ? "list" : "slides") : base.mode,
      zone: custom ? (d.customZone === "media" ? "media" : "strip") : base.zone,
      html: html,
      css: scopeCss(css, ".bn--tpl-" + id),
    };
  }

  return {
    TEMPLATES: TEMPLATES,
    CUSTOM_ID: CUSTOM_ID,
    CUSTOM_STARTER: CUSTOM_STARTER,
    PLACEHOLDERS: PLACEHOLDERS,
    SECTIONS: SECTIONS,
    MOTIONS: MOTIONS,
    ENTRANCES: ENTRANCES,
    BACKGROUNDS: BACKGROUNDS,
    ACCENTS: ACCENTS,
    MAX_HTML: MAX_HTML,
    MAX_CSS: MAX_CSS,
    byId: byId,
    ids: ids,
    sanitizeHtml: sanitizeHtml,
    sanitizeCss: sanitizeCss,
    scopeCss: scopeCss,
    scopeSelector: scopeSelector,
    scopeRule: scopeRule,
    lintCss: lintCss,
    lintHtml: lintHtml,
    resolve: resolve,
  };
});
