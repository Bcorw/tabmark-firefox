/* ============================================================================
   defaults.js — the one and only list of setting defaults.

   Loaded in three places, always before anything that reads settings:
     1. background.scripts (before background.js)  → seeds storage on install
     2. newtab.html (before MK.api)                → merges over stored values
     3. popup.html (before MK.api)

   Deliberately small: v2 removed layout / font-size / card-width / onboarding
   flags. Only preferences that change behaviour live here; appearance is
   CSS-driven and the sidebar width is a drag interaction, not a setting.
   ========================================================================== */

(function (global) {
  'use strict';

  global.MK_DEFAULTS = {
    theme: 'system',          /* system | light | dark          */
    openWith: 'newtab',       /* newtab | current                */
    recommendations: true,    /* show recent history on the home */
    searchHistory: true,      /* include history in search       */
    language: 'auto',         /* auto | zh | en                  */
    sortKey: 'default',       /* default | name | added | usage  */
    sidebarCollapsed: false,
    sideWidth: 252,           /* px, 168–340, drag-resizable     */
    lastFolderId: null,       /* preferred folder for quick saves */
    searchEngine: 'google',   /* id from shared/engines.js       */
    engines: null,            /* null = built-in list; array = user list */
    faviconRemote: false,     /* opt-in: ask sites for their favicon */
    bookmarkStyle: 'card',    /* card | compact (markoob 书签风格)    */
    layoutType: 'row',        /* row | col   (markoob 布局)           */
    fontScale: 1,             /* 0.9 | 1 | 1.15                       */
    widthScale: 1,            /* 0.85 | 1 | 1.2                       */
    noAnim: false,            /* disable bookmark animations          */
    wallpaper: { kind: 'none', value: '', dim: 0, ink: 'auto' }
  };
})(typeof self !== 'undefined' ? self : this);
