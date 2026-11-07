/* ============================================================================
   engines.js — search engines as plain URL templates.

   There is no browser API that says "search with DuckDuckGo": Firefox's
   browser.search.search only knows the *installed* engines, and the user may
   not have them. So every entry here is just a template with %s, opened with
   tabs.create — same as typing the address yourself.

   No favicons are fetched for these: a letter badge with the brand hue keeps
   the "zero network requests" promise. Engines are user-editable (add, rename,
   hide, delete, reorder), so the list lives in settings.engines once touched;
   null means "use the built-in defaults below".

   API
     MK.engines.builtin()             -> fresh copy of the built-in list
     MK.engines.list(settings)        -> the effective list (user list or default)
     MK.engines.visible(settings)     -> list minus hidden entries
     MK.engines.byId(settings, id)    -> engine | first visible | null
     MK.engines.url(engine, query)    -> search URL with %s replaced
   ========================================================================== */

(function (global) {
  'use strict';

  /* hue drives the letter badge; kept in the same hsl() shape the cards use */
  var BUILTIN = [
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s', hue: 217, hidden: false },
    { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s', hue: 197, hidden: false },
    { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s', hue: 24, hidden: false },
    { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=%s', hue: 220, hidden: false },
    { id: 'quark', name: '夸克', url: 'https://quark.sm.cn/s?q=%s', hue: 265, hidden: false },
    { id: 'yandex', name: 'Yandex', url: 'https://yandex.com/search/?text=%s', hue: 3, hidden: false },
    { id: 'zhihu', name: '知乎', url: 'https://www.zhihu.com/search?type=content&q=%s', hue: 210, hidden: false },
    { id: 'xiaohongshu', name: '小红书', url: 'https://www.xiaohongshu.com/search_result?keyword=%s', hue: 355, hidden: false },
    { id: 'bilibili', name: 'bilibili', url: 'https://search.bilibili.com/all?keyword=%s', hue: 190, hidden: false }
  ];

  function clone(list) {
    return list.map(function (e) {
      return { id: e.id, name: e.name, url: e.url, hue: e.hue === undefined ? 220 : e.hue, hidden: !!e.hidden };
    });
  }

  function builtin() { return clone(BUILTIN); }

  function list(settings) {
    var custom = settings && settings.engines;
    if (Array.isArray(custom) && custom.length) return clone(custom);
    return builtin();
  }

  function visible(settings) {
    var out = list(settings).filter(function (e) { return !e.hidden; });
    return out.length ? out : list(settings).slice(0, 1);
  }

  function byId(settings, id) {
    var all = list(settings);
    var hit = null;
    for (var i = 0; i < all.length; i++) if (all[i].id === id) { hit = all[i]; break; }
    if (hit && !hit.hidden) return hit;
    var vis = visible(settings);
    return vis.length ? vis[0] : null;
  }

  function url(engine, query) {
    var q = String(query === undefined || query === null ? '' : query);
    var tpl = (engine && engine.url) || BUILTIN[0].url;
    if (tpl.indexOf('%s') < 0) tpl = tpl + '%s';
    return tpl.replace('%s', encodeURIComponent(q));
  }

  global.MK = global.MK || {};
  global.MK.engines = {
    builtin: builtin,
    list: list,
    visible: visible,
    byId: byId,
    url: url
  };
})(typeof window !== 'undefined' ? window : this);
