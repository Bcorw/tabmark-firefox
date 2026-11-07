/* ============================================================================
   Tabmark for Firefox — background (Manifest V3, Firefox background.scripts)

   Responsibilities (and nothing else):
     1. write default settings on install
     2. register context menus ("收藏到 Tabmark" for page + link, "打开 Tabmark")
     3. cache data: favicons reported by tabs.onUpdated, keyed by hostname (LRU 300)
     4. drop usage records older than 180 days

   No network access of any kind.
   ========================================================================== */

(function () {
  'use strict';

  var api = typeof browser !== 'undefined' ? browser : chrome;
  var FAVICON_LIMIT = 300;
  var FAVICON_MAX_LEN = 32000;
  var USAGE_TTL = 180 * 24 * 60 * 60 * 1000;

  /* single source of truth: shared/defaults.js is loaded right before this
     file in manifest.background.scripts (see manifest.json). */
  var DEFAULTS = (typeof self !== 'undefined' && self.MK_DEFAULTS) || {};

  /* ── settings ─────────────────────────────────────────────────────────── */

  function ensureDefaults(done) {
    api.storage.local.get('settings').then(function (res) {
      var stored = res && res.settings ? res.settings : {};
      var merged = {};
      for (var k in DEFAULTS) {
        if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
          merged[k] = Object.prototype.hasOwnProperty.call(stored, k) ? stored[k] : DEFAULTS[k];
        }
      }
      for (var k2 in stored) {
        if (Object.prototype.hasOwnProperty.call(stored, k2) &&
            !Object.prototype.hasOwnProperty.call(merged, k2)) {
          merged[k2] = stored[k2];
        }
      }
      return api.storage.local.set({ settings: merged });
    }).then(function () {
      if (typeof done === 'function') done();
    }).catch(function () {
      if (typeof done === 'function') done();
    });
  }

  /* ── context menus ────────────────────────────────────────────────────── */

  function createMenus() {
    if (!api.contextMenus) return;
    // removeAll first so reloads never duplicate items
    api.contextMenus.removeAll().then(function () {
      api.contextMenus.create({
        id: 'tabmark-bookmark-page',
        title: '收藏此页到 Tabmark',
        contexts: ['page']
      });
      api.contextMenus.create({
        id: 'tabmark-bookmark-link',
        title: '收藏链接到 Tabmark',
        contexts: ['link']
      });
      api.contextMenus.create({
        id: 'tabmark-sep-1',
        type: 'separator',
        contexts: ['page', 'link']
      });
      api.contextMenus.create({
        id: 'tabmark-open',
        title: '打开 Tabmark',
        contexts: ['page', 'link']
      });
    }).catch(function () { /* menus are a nicety, never fatal */ });
  }

  function newtabUrl() {
    return api.runtime.getURL('newtab/newtab.html');
  }

  api.contextMenus.onClicked.addListener(function (info, tab) {
    if (info.menuItemId === 'tabmark-open') {
      api.tabs.create({ url: newtabUrl() }).catch(function () {});
      return;
    }
    var url = null;
    var title = null;
    if (info.menuItemId === 'tabmark-bookmark-link') {
      url = info.linkUrl || null;
      title = info.selectionText || null;
    } else if (info.menuItemId === 'tabmark-bookmark-page') {
      url = info.pageUrl || (tab && tab.url) || null;
      title = tab && tab.title ? tab.title : null;
    }
    if (!url || !/^(https?|ftp|ftps|file):/i.test(url)) return;

    api.bookmarks.search({ query: url }).then(function (hits) {
      var existing = (hits || []).filter(function (n) {
        return n.type === 'bookmark' && n.url === url;
      });
      if (existing.length) {
        return api.tabs.create({ url: newtabUrl() });
      }
      return api.storage.local.get('settings').then(function (res) {
        var s = res && res.settings ? res.settings : {};
        var parentId = s.lastFolderId || 'unfiled_____';
        return api.bookmarks.get(parentId).then(function (nodes) {
          return parentId;
        }, function () {
          return 'unfiled_____';
        }).then(function (pid) {
          return api.bookmarks.create({
            parentId: pid,
            title: title || url,
            url: url
          });
        });
      });
    }).catch(function () {
      // last resort: create in unfiled
      api.bookmarks.create({ parentId: 'unfiled_____', title: title || url, url: url })
        .catch(function () {});
    });
  });

  /* ── favicon cache (data: URLs only, never fetched) ───────────────────── */

  function hostOf(url) {
    try {
      var u = new URL(url);
      if (!u.hostname) return null;
      return u.hostname.replace(/^www\./, '');
    } catch (e) {
      return null;
    }
  }

  var faviconQueue = [];
  var faviconTimer = null;

  function queueFavicon(host, dataUrl) {
    if (!host || !dataUrl || dataUrl.indexOf('data:image') !== 0) return;
    if (dataUrl.length > FAVICON_MAX_LEN) return;
    faviconQueue.push([host, dataUrl]);
    if (faviconTimer) return;
    faviconTimer = setTimeout(flushFavicons, 900);
  }

  function flushFavicons() {
    faviconTimer = null;
    var batch = faviconQueue;
    faviconQueue = [];
    if (!batch.length) return;
    api.storage.local.get(['favicons', 'faviconsOrder']).then(function (res) {
      var map = res && res.favicons ? res.favicons : {};
      var order = res && res.faviconsOrder && res.faviconsOrder.length
        ? res.faviconsOrder.slice()
        : Object.keys(map);
      batch.forEach(function (pair) {
        var host = pair[0];
        if (map[host] === pair[1]) return;
        map[host] = pair[1];
        var i = order.indexOf(host);
        if (i >= 0) order.splice(i, 1);
        order.push(host);
      });
      while (order.length > FAVICON_LIMIT) {
        var evicted = order.shift();
        delete map[evicted];
      }
      return api.storage.local.set({ favicons: map, faviconsOrder: order });
    }).catch(function () {});
  }

  api.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    try {
      var icon = changeInfo && changeInfo.favIconUrl;
      if (!icon && changeInfo && changeInfo.status === 'complete' && tab) {
        icon = tab.favIconUrl;
      }
      if (!icon) return;
      var url = (tab && tab.url) || (changeInfo && changeInfo.url) || '';
      queueFavicon(hostOf(url), icon);
    } catch (e) { /* ignore */ }
  });

  /* wiped on browser restart by design; nothing to rebuild */

  /* ── usage housekeeping ───────────────────────────────────────────────── */

  function cleanupUsage() {
    return api.storage.local.get('usage').then(function (res) {
      var usage = res && res.usage ? res.usage : null;
      if (!usage) return null;
      var now = Date.now();
      var out = {};
      var changed = false;
      for (var url in usage) {
        if (!Object.prototype.hasOwnProperty.call(usage, url)) continue;
        var rec = usage[url];
        var last = rec && typeof rec.last === 'number' ? rec.last : 0;
        if (last && now - last > USAGE_TTL) {
          changed = true;
          continue;
        }
        out[url] = rec;
      }
      if (!changed) return null;
      return api.storage.local.set({ usage: out });
    }).catch(function () {});
  }

  api.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'tabmark:cleanup') {
      cleanupUsage();
    }
    return false;
  });

  /* ── lifecycle ────────────────────────────────────────────────────────── */

  api.runtime.onInstalled.addListener(function () {
    ensureDefaults(function () {
      createMenus();
      cleanupUsage();
    });
  });

  api.runtime.onStartup.addListener(function () {
    ensureDefaults();
    cleanupUsage();
  });
})();
