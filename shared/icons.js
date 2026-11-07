/* ============================================================================
   icons.js — inline SVG only. stroke 1.5, no fills, no icon font, no network.

   Every glyph is a constant string in this file; nothing here ever receives
   user data. Markup is turned into real DOM with DOMParser + importNode rather
   than an HTML sink, so the page never parses attacker-reachable HTML and the
   AMO linter's "unsafe innerHTML" rule stays quiet. User-supplied text must
   always go through textContent.

   API
     MK.icons.svg(name, size?)   -> "<svg …>…</svg>" string
     MK.icons.node(markup)       -> SVGElement (detached)
     MK.icons.el(name, size?)    -> SVGElement
     MK.icons.mount(box, name, size?) -> box, with the glyph appended
   ========================================================================== */

(function () {
  'use strict';
  var MK = (window.MK = window.MK || {});
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* 16×16 grid, 1.5 stroke, round caps — one visual language for the product. */
  var P = {
    search: '<circle cx="7" cy="7" r="4.4"/><path d="M10.4 10.4 14 14"/>',
    x: '<path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8"/>',
    chevronDown: '<path d="M4 6.2 8 10.2l4-4"/>',
    chevronRight: '<path d="M6 3.8 10.2 8 6 12.2"/>',
    chevronUp: '<path d="M4 9.8 8 5.8l4 4"/>',
    folder: '<path d="M2 4.6h4.2L7.4 6.2H14v6.2H2z"/>',
    folderOpen: '<path d="M2 12.4V4.6h4.2L7.4 6.2H13v1.6"/><path d="M2 12.4 3.9 7.8H15l-1.9 4.6z"/>',
    grid: '<rect x="2.4" y="2.4" width="4.6" height="4.6" rx="1"/><rect x="9" y="2.4" width="4.6" height="4.6" rx="1"/><rect x="2.4" y="9" width="4.6" height="4.6" rx="1"/><rect x="9" y="9" width="4.6" height="4.6" rx="1"/>',
    gear: '<circle cx="8" cy="8" r="2.3"/><path d="M8 1.9v1.6M8 12.5v1.6M1.9 8h1.6M12.5 8h1.6M3.7 3.7l1.1 1.1M11.2 11.2l1.1 1.1M12.3 3.7l-1.1 1.1M4.8 11.2l-1.1 1.1"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    pin: '<path d="M6.2 2.2h3.6l-.5 3.4 1.9 1.9v1.3H4.7V7.5l1.9-1.9z"/><path d="M8 8.8V14"/>',
    pinOff: '<path d="M6.2 2.2h3.6l-.5 3.4 1.9 1.9v1.3H4.7V7.5l1.9-1.9z"/><path d="M8 8.8V14"/><path d="M2.2 13.8 13.8 2.2"/>',
    eye: '<path d="M1.7 8S4.1 4.2 8 4.2 14.3 8 14.3 8 11.9 11.8 8 11.8 1.7 8 1.7 8z"/><circle cx="8" cy="8" r="1.9"/>',
    eyeOff: '<path d="M3.2 3.2S2.4 5 1.7 8c1 2.4 3.4 3.8 6.3 3.8 1.2 0 2.3-.3 3.2-.8"/><path d="M12.8 12.8S13.6 11 14.3 8c-1-2.4-3.4-3.8-6.3-3.8-1 0-2 .2-2.8.6"/><path d="M2.2 13.8 13.8 2.2"/>',
    pencil: '<path d="M11.1 2.6 13.4 4.9 5.6 12.7 3 13l.3-2.6z"/>',
    copy: '<rect x="5.6" y="5.6" width="8" height="8" rx="1.2"/><path d="M10.4 5.6V2.9a.9.9 0 0 0-.9-.9H3.8a.9.9 0 0 0-.9.9v5.7c0 .5.4.9.9.9h2.7"/>',
    trash: '<path d="M2.8 4.6h10.4M6.4 4.6V2.9h3.2v1.7M4.6 4.6l.6 8.9h5.6l.6-8.9"/>',
    external: '<path d="M9.4 2.6h4v4M13.4 2.6 7.6 8.4"/><path d="M6.2 3.4H3.4v9.2h9.2V9.8"/>',
    window: '<rect x="2.4" y="3.4" width="11.2" height="9.2" rx="1.2"/><path d="M2.4 6.4h11.2"/>',
    mask: '<circle cx="5.1" cy="7.6" r="2.3"/><circle cx="10.9" cy="7.6" r="2.3"/><path d="M7.4 7.6h1.2"/><path d="M2.8 7.6H1.6M14.4 7.6h-1.2"/>',
    qr: '<rect x="2.4" y="2.4" width="4.4" height="4.4" rx=".8"/><rect x="9.2" y="2.4" width="4.4" height="4.4" rx=".8"/><rect x="2.4" y="9.2" width="4.4" height="4.4" rx=".8"/><path d="M9.4 9.4h1.4v1.4H9.4zM12.2 12.2h1.4v1.4h-1.4zM12.2 9.4h1.4M9.4 12.2v1.4"/>',
    check: '<path d="M3.2 8.4 6.4 11.6 12.8 4.6"/>',
    arrowLeft: '<path d="M9.6 3.4 5 8l4.6 4.6"/>',
    undo: '<path d="M5.6 3.6 2.4 6.8l3.2 3.2"/><path d="M2.4 6.8h6.4a3.6 3.6 0 0 1 0 7.2H7.4"/>',
    sun: '<circle cx="8" cy="8" r="2.6"/><path d="M8 1.9v1.5M8 12.6v1.5M1.9 8h1.5M12.6 8h1.5M3.7 3.7l1 1M11.3 11.3l1 1M12.3 3.7l-1 1M4.7 11.3l-1 1"/>',
    layoutRow: '<rect x="2.4" y="3.2" width="11.2" height="4" rx="1"/><rect x="2.4" y="8.8" width="11.2" height="4" rx="1"/>',
    layoutColumn: '<rect x="2.4" y="2.8" width="4.6" height="10.4" rx="1"/><rect x="9" y="2.8" width="4.6" height="10.4" rx="1"/>',
    type: '<path d="M3.6 12.4 6.9 3.6h.2l3.3 8.8"/><path d="M4.9 9.4h4.2"/>',
    width: '<path d="M2.6 3.6v8.8M13.4 3.6v8.8"/><path d="M5.6 8h4.8M7.2 6.4 5.6 8l1.6 1.6M10.4 6.4 12 8l-1.6 1.6"/>',
    motion: '<path d="M5.4 3.6 12 8l-6.6 4.4z"/>',
    globe: '<circle cx="8" cy="8" r="5.6"/><path d="M2.4 8h11.2"/><path d="M8 2.4c1.6 1.6 2.4 3.5 2.4 5.6S9.6 12 8 13.6C6.4 12 5.6 10.1 5.6 8S6.4 4 8 2.4z"/>',
    info: '<circle cx="8" cy="8" r="5.6"/><path d="M8 7.2v4"/><circle cx="8" cy="5" r=".7"/>',
    panelLeft: '<rect x="2.4" y="3" width="11.2" height="10" rx="1.2"/><path d="M6.2 3v10"/>',
    clock: '<circle cx="8" cy="8" r="5.6"/><path d="M8 4.8V8l2.4 1.4"/>',
    bookmark: '<path d="M4.4 2.6h7.2v10.8L8 10.6l-3.6 2.8z"/>',
    alert: '<path d="M8 2.6 14 13.2H2z"/><path d="M8 6.6v3"/><circle cx="8" cy="11.4" r=".7"/>',
    empty: '<path d="M2.4 9.2h3.2l1 1.6h2.8l1-1.6h3.2"/><path d="M2.4 9.2 4 3.4h8l1.6 5.8v3.4H2.4z"/>',
    refresh: '<path d="M13.2 8a5.2 5.2 0 1 1-1.7-3.9"/><path d="M13.4 2.6v2.9h-2.9"/>',
    star: '<path d="M8 2.6 9.7 6.2l3.9.5-2.9 2.7.8 3.9L8 11.4 4.5 13.3l.8-3.9L2.4 6.7l3.9-.5z"/>',
    bars: '<path d="M2.6 4.6h10.8M2.6 8h6.8M2.6 11.4h8.6"/>',
    shield: '<path d="M8 2.4 13 4.2v3.6c0 2.8-2.2 4.6-5 5.8-2.8-1.2-5-3-5-5.8V4.2z"/><path d="M5.9 8.1 7.4 9.6l2.8-2.8"/>',

    /* —— v2 additions —— */
    more: '<circle cx="3.4" cy="8" r=".9" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r=".9" fill="currentColor" stroke="none"/><circle cx="12.6" cy="8" r=".9" fill="currentColor" stroke="none"/>',
    broom: '<path d="M8 2.6 14 6 8 9.4 2 6z"/><path d="M2.6 9.3 8 12.3l5.4-3"/><path d="M2.6 11.7 8 14.7l5.4-3"/>',
    image: '<rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.6"/><circle cx="5.6" cy="6.4" r="1"/><path d="M3.1 11.5 6.2 8.7a1.2 1.2 0 0 1 1.6 0L10 10.9"/><path d="M9.4 10l.9-.9a1.2 1.2 0 0 1 1.6 0l2 1.9"/>',
    sparkle: '<path d="M8 2.4l1.2 3.1 3.1 1.2-3.1 1.2L8 11l-1.2-3.1-3.1-1.2 3.1-1.2z"/><path d="M12.4 10.6l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>',
    bookmarkPlus: '<path d="M4.4 2.6h7.2v10.8L8 10.6l-3.6 2.8z"/><path d="M8 5.2v4M6 7.2h4"/>',
    folderPlus: '<path d="M2 4.6h4.2L7.4 6.2H14v3.2"/><path d="M2 4.6v7.8h4.4"/><path d="M11.8 9.4v4.2M9.7 11.5h4.2"/>',
    command: '<path d="M5.6 2.6a1.7 1.7 0 1 0 1.7 1.7v7.4a1.7 1.7 0 1 0 1.7-1.7H4.9a1.7 1.7 0 1 0 1.7 1.7V5.9"/><path d="M11.1 2.6a1.7 1.7 0 1 1-1.7 1.7v7.4a1.7 1.7 0 1 1-1.7-1.7h7.4"/>',
    moon: '<path d="M13.2 9.4A5.4 5.4 0 0 1 6.6 2.8a5.6 5.6 0 1 0 6.6 6.6z"/>',
    monitor: '<rect x="2.2" y="3.2" width="11.6" height="8" rx="1.2"/><path d="M5.6 13.4h4.8M8 11.2v2.2"/>',
    arrowUpRight: '<path d="M5 11 11 5M6.2 5H11v4.8"/>',
    grip: '<circle cx="6" cy="4.6" r=".8" fill="currentColor" stroke="none"/><circle cx="10" cy="4.6" r=".8" fill="currentColor" stroke="none"/><circle cx="6" cy="8" r=".8" fill="currentColor" stroke="none"/><circle cx="10" cy="8" r=".8" fill="currentColor" stroke="none"/><circle cx="6" cy="11.4" r=".8" fill="currentColor" stroke="none"/><circle cx="10" cy="11.4" r=".8" fill="currentColor" stroke="none"/>',
    history: '<path d="M2.6 8a5.4 5.4 0 1 0 1.6-3.8"/><path d="M2.4 2.6v2.9h2.9"/><path d="M8 5.2V8l2 1.2"/>',
    download: '<path d="M8 2.8v7.4M5.2 7.4 8 10.2l2.8-2.8"/><path d="M3.2 12.6h9.6"/>',
    sortAsc: '<path d="M4.4 3.4v9.2M2.4 10.6l2 2 2-2"/><path d="M8.6 5h4.8M8.6 8h3.6M8.6 11h2.4"/>',
    checkSmall: '<path d="M3.6 8.4 6.6 11.4 12.4 4.8"/>'
  };

  function svg(name, size) {
    var body = P[name] || P.folder;
    var s = size || 16;
    return '<svg xmlns="' + SVG_NS + '" viewBox="0 0 16 16" width="' + s + '" height="' + s +
      '" fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      body + '</svg>';
  }

  /* Constant markup -> detached SVGElement. DOMParser builds the tree in an
     inert document that is never rendered, and importNode copies it over; no
     HTML parsing happens in the page, so no untrusted string can become markup. */
  var parser = null;
  function node(markup) {
    if (!parser) parser = new DOMParser();
    var doc = parser.parseFromString(markup, 'image/svg+xml');
    var root = doc && doc.documentElement;
    if (!root || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) {
      /* fail soft: an empty svg keeps layout identical, never throws */
      root = document.createElementNS(SVG_NS, 'svg');
      root.setAttribute('viewBox', '0 0 16 16');
      root.setAttribute('aria-hidden', 'true');
      return root;
    }
    return document.importNode(root, true);
  }

  function el(name, size) {
    return node(svg(name, size));
  }

  function mount(box, name, size) {
    while (box.firstChild) box.removeChild(box.firstChild);
    box.appendChild(el(name, size));
    return box;
  }

  MK.icons = {
    svg: svg,
    node: node,
    el: el,
    mount: mount
  };
})();
