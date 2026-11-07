/* ============================================================================
   api.js — the only place that talks to WebExtension APIs.

   Two interchangeable layers behind one interface:
     • real  — browser.bookmarks / history / storage / tabs (Firefox ≥115)
     • demo  — localStorage['tabmark.demo.v1'], used for static previews

   Every method returns a Promise. Failures reject with an Error carrying
   `.code` so callers can pick the right toast:
     'permission' | 'privateBlocked' | 'fileBlocked' | 'blocked' | 'invalid'
   ========================================================================== */

(function () {
  'use strict';
  var MK = (window.MK = window.MK || {});
  var t = function (k, p) { return MK.i18n ? MK.i18n.t(k, p) : k; };

  var EXT = (typeof browser !== 'undefined' && browser && browser.bookmarks) ? browser :
    (typeof chrome !== 'undefined' && chrome && chrome.bookmarks) ? chrome : null;
  var isDemo = !EXT;

  /* In a static preview the very same document is served over http(s) or
     file:, and `browser` is undefined — that is the only difference. */
  var DEMO_KEY = 'tabmark.demo.v1';
  var DAY = 24 * 3600 * 1000;

  /* single source of truth: shared/defaults.js (loaded before this file) */
  var DEFAULTS = (typeof window !== 'undefined' && window.MK_DEFAULTS) || {};

  var ROOT_NAMES = {
    toolbar: 'bookmarksToolbar',
    menu: 'bookmarksMenu',
    unfiled: 'otherBookmarks',
    mobile: 'mobileBookmarks'
  };

  /* ── error helper ─────────────────────────────────────────────────────── */

  function fail(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  function looksLikePermissionError(e) {
    if (!e) return false;
    var s = String(e.message || e) + ' ' + String(e.name || '');
    return /permission|denied|not allowed|Invalid permissions/i.test(s);
  }

  /* ── demo persistence ─────────────────────────────────────────────────── */

  var demoDB = null;

  function demoLoad() {
    if (demoDB) return demoDB;
    var raw = null;
    try {
      raw = window.localStorage.getItem(DEMO_KEY);
    } catch (e) { /* storage may be blocked */ }
    var parsed = null;
    if (raw) {
      try { parsed = JSON.parse(raw); } catch (e2) { parsed = null; }
    }
    if (!parsed || !parsed.nodes || !parsed.nodes.length) {
      parsed = {
        nodes: MK.demo ? MK.demo.nodes() : [],
        settings: {},
        pinned: MK.demo ? MK.demo.pinned() : [],
        hidden: { bookmarks: [], folders: [] },
        usage: MK.demo ? MK.demo.usage() : {},
        ui: { expanded: [], scroll: {}, lastCreateFolderId: null }
      };
    }
    /* keep shapes defensive for old payloads */
    parsed.settings = parsed.settings || {};
    parsed.pinned = parsed.pinned || [];
    parsed.hidden = parsed.hidden || { bookmarks: [], folders: [] };
    parsed.hidden.bookmarks = parsed.hidden.bookmarks || [];
    parsed.hidden.folders = parsed.hidden.folders || [];
    parsed.usage = parsed.usage || {};
    parsed.ui = parsed.ui || { expanded: [], scroll: {} };
    demoDB = parsed;
    return demoDB;
  }

  var demoWriteTimer = null;
  function demoSave(immediate) {
    if (demoWriteTimer) {
      clearTimeout(demoWriteTimer);
      demoWriteTimer = null;
    }
    var write = function () {
      try {
        window.localStorage.setItem(DEMO_KEY, JSON.stringify(demoDB));
      } catch (e) { /* quota / private mode */ }
    };
    if (immediate) write();
    else demoWriteTimer = setTimeout(write, 120);
  }

  /* ── storage abstraction ──────────────────────────────────────────────── */

  function rawGet(keys) {
    if (!isDemo) return EXT.storage.local.get(keys);
    var db = demoLoad();
    var out = {};
    var list = Array.isArray(keys) ? keys : [keys];
    list.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(db, k)) out[k] = db[k];
    });
    return Promise.resolve(out);
  }

  function rawSet(obj) {
    if (!isDemo) return EXT.storage.local.set(obj);
    var db = demoLoad();
    Object.keys(obj).forEach(function (k) { db[k] = obj[k]; });
    demoSave();
    return Promise.resolve();
  }

  /* ── public state ─────────────────────────────────────────────────────── */

  var S = {
    settings: null,
    pinned: [],
    hidden: { bookmarks: [], folders: [] },
    usage: {},
    ui: { expanded: [], scroll: {}, lastCreateFolderId: null },
    favicons: {}
  };

  /* ── settings ─────────────────────────────────────────────────────────── */

  var settingsTimer = null;
  var settingsDirty = false;

  function mergeDefaults(stored) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = Object.prototype.hasOwnProperty.call(stored || {}, k) ? stored[k] : DEFAULTS[k];
    });
    Object.keys(stored || {}).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = stored[k];
    });
    return out;
  }

  function mirrorLocal(s) {
    try {
      if (s.theme === 'light' || s.theme === 'dark') {
        window.localStorage.setItem('tabmark.theme', s.theme);
      } else {
        window.localStorage.removeItem('tabmark.theme');
      }
      if (s.animations === false) window.localStorage.setItem('tabmark.motion', 'off');
      else window.localStorage.removeItem('tabmark.motion');
    } catch (e) { /* ignore */ }
  }

  function loadSettings() {
    return rawGet('settings').then(function (res) {
      S.settings = mergeDefaults(res && res.settings);
      mirrorLocal(S.settings);
      return S.settings;
    }).catch(function () {
      S.settings = mergeDefaults({});
      return S.settings;
    });
  }

  function patchSettings(patch) {
    if (!S.settings) S.settings = mergeDefaults({});
    Object.keys(patch).forEach(function (k) { S.settings[k] = patch[k]; });
    mirrorLocal(S.settings);
    settingsDirty = true;
    if (settingsTimer) clearTimeout(settingsTimer);
    settingsTimer = setTimeout(function () {
      settingsTimer = null;
      flushSettings();
    }, 300);
    return Promise.resolve(S.settings);
  }

  function flushSettings() {
    if (!settingsDirty || !S.settings) return Promise.resolve();
    settingsDirty = false;
    var snapshot = JSON.parse(JSON.stringify(S.settings));
    return rawSet({ settings: snapshot }).catch(function () {
      settingsDirty = true;
    });
  }

  /* ── pinned / hidden / usage / ui ─────────────────────────────────────── */

  function debounceWrite(getter, key, timerName) {
    if (timerName.t) clearTimeout(timerName.t);
    timerName.t = setTimeout(function () {
      timerName.t = null;
      var payload = {};
      payload[key] = getter();
      rawSet(payload);
    }, 250);
  }

  var timers = { pinned: { t: null }, hidden: { t: null }, usage: { t: null }, ui: { t: null } };

  function setPinned(list) {
    S.pinned = list || [];
    debounceWrite(function () { return JSON.parse(JSON.stringify(S.pinned)); }, 'pinned', timers.pinned);
    return Promise.resolve(S.pinned);
  }

  function setHidden(next) {
    S.hidden = {
      bookmarks: (next && next.bookmarks ? next.bookmarks : []).slice(),
      folders: (next && next.folders ? next.folders : []).slice()
    };
    debounceWrite(function () { return JSON.parse(JSON.stringify(S.hidden)); }, 'hidden', timers.hidden);
    return Promise.resolve(S.hidden);
  }

  function recordOpen(url) {
    if (!url) return Promise.resolve();
    var rec = S.usage[url] || { count: 0, last: 0 };
    S.usage[url] = { count: (rec.count || 0) + 1, last: Date.now() };
    debounceWrite(function () { return JSON.parse(JSON.stringify(S.usage)); }, 'usage', timers.usage);
    return Promise.resolve();
  }

  /* Erase the open-count table (settings → clear usage data). Pinned and the
     bookmark tree are untouched. */
  function clearUsage() {
    S.usage = {};
    if (timers.usage.t) { clearTimeout(timers.usage.t); timers.usage.t = null; }
    return rawSet({ usage: {} });
  }

  function setUI(patch) {
    Object.keys(patch).forEach(function (k) { S.ui[k] = patch[k]; });
    debounceWrite(function () { return JSON.parse(JSON.stringify(S.ui)); }, 'ui', timers.ui);
    return Promise.resolve(S.ui);
  }

  /* ── tree ─────────────────────────────────────────────────────────────── */

  var treeCache = null;

  function rootKeyOf(id, title, parentId) {
    if (!id) return null;
    /* Firefox's invisible parent of the four roots */
    if (/^root_+$/.test(id)) return null;
    /* Chrome: invisible root has id "0"; the three roots hang off it with
       fixed ids 1/2/3. Guarded by parentId so Firefox numeric ids never hit. */
    if (id === '0') return null;
    if (parentId === '0') {
      if (id === '1') return 'toolbar';
      if (id === '2') return 'unfiled';
      if (id === '3') return 'mobile';
    }
    if (id.indexOf('toolbar') === 0) return 'toolbar';
    if (id.indexOf('menu') === 0) return 'menu';
    if (id.indexOf('unfiled') === 0) return 'unfiled';
    if (id.indexOf('mobile') === 0) return 'mobile';
    if (id.indexOf('demo-toolbar') === 0) return 'toolbar';
    if (id.indexOf('demo-menu') === 0) return 'menu';
    if (id.indexOf('demo-unfiled') === 0) return 'unfiled';
    if (id.indexOf('demo-mobile') === 0) return 'mobile';
    var s = String(title || '').toLowerCase();
    if (s === 'toolbar' || s.indexOf('toolbar') === 0) return 'toolbar';
    if (s === 'menu' || s.indexOf('bookmarks menu') === 0) return 'menu';
    if (s.indexOf('unfiled') === 0 || s.indexOf('other bookmarks') === 0) return 'unfiled';
    if (s.indexOf('mobile') === 0) return 'mobile';
    /* Chrome roots in zh-CN UI */
    if (s.indexOf('书签栏') === 0) return 'toolbar';
    if (s.indexOf('其他书签') === 0) return 'unfiled';
    if (s.indexOf('移动设备书签') === 0 || s.indexOf('移动书签') === 0) return 'mobile';
    return null;
  }

  function displayTitle(node) {
    if (node.rootKey) {
      var key = ROOT_NAMES[node.rootKey];
      return key ? t(key) : node.title;
    }
    return node.title || t('folder');
  }

  /* Normalise raw Firefox nodes (or demo rows) into one shape, then stitch
     parent/child links, paths and recursive counts. */
  function buildTree(rawNodes) {
    var byId = Object.create(null);
    var all = [];

    rawNodes.forEach(function (n) {
      var node = {
        id: n.id,
        parentId: n.parentId || null,
        index: typeof n.index === 'number' ? n.index : 0,
        title: n.title || '',
        url: n.url || null,
        dateAdded: n.dateAdded || 0,
        children: [],
        rootKey: null,
        path: [],
        recCount: 0
      };
      byId[node.id] = node;
      all.push(node);
    });

    all.forEach(function (node) {
      var parent = node.parentId ? byId[node.parentId] : null;
      if (parent) parent.children.push(node);
    });

    all.forEach(function (node) {
      node.children.sort(function (a, b) { return a.index - b.index; });
      node.rootKey = rootKeyOf(node.id, node.title, node.parentId);
      if (node.rootKey) node.title = displayTitle(node);
    });

    /* roots = the four system folders, one each, in fixed order */
    var roots = [];
    var seenRoot = Object.create(null);
    all.forEach(function (n) {
      if (!n.rootKey || seenRoot[n.rootKey]) return;
      var parent = n.parentId ? byId[n.parentId] : null;
      if (parent && parent.rootKey) return;
      seenRoot[n.rootKey] = true;
      roots.push(n);
    });
    var order = { toolbar: 0, menu: 1, unfiled: 2, mobile: 3 };
    roots.sort(function (a, b) { return order[a.rootKey] - order[b.rootKey]; });

    function walk(node, path) {
      node.path = path;
      var count = 0;
      node.children.forEach(function (child) {
        count += walk(child, path.concat([node.title]));
        if (child.url) count += 1;
      });
      node.recCount = count;
      return count;
    }
    roots.forEach(function (r) { walk(r, []); });

    var bookmarks = [];
    var folders = [];
    function flatten(node) {
      if (node.url) {
        bookmarks.push(node);
      } else {
        if (!node.rootKey) folders.push(node);
        node.children.forEach(flatten);
      }
    }
    roots.forEach(flatten);

    return {
      roots: roots,
      byId: byId,
      all: all,
      bookmarks: bookmarks,
      folders: folders
    };
  }

  function getTree(force) {
    if (treeCache && !force) return Promise.resolve(treeCache);
    if (isDemo) {
      var db = demoLoad();
      treeCache = buildTree(db.nodes);
      return Promise.resolve(treeCache);
    }
    return EXT.bookmarks.getTree().then(function (raw) {
      var flat = [];
      (function visit(list) {
        (list || []).forEach(function (n) {
          flat.push({
            id: n.id,
            parentId: n.parentId,
            index: typeof n.index === 'number' ? n.index : 0,
            title: n.title,
            url: n.url || null,
            dateAdded: n.dateAdded || 0
          });
          if (n.children && n.children.length) visit(n.children);
        });
      })(raw);
      treeCache = buildTree(flat);
      return treeCache;
    }).catch(function (e) {
      if (looksLikePermissionError(e) || !e) throw fail('permission');
      throw fail('permission', String(e.message || e));
    });
  }

  /* ── search ───────────────────────────────────────────────────────────── */

  /* Weights are fixed by docs/ux-spec.md §3-C. No fuzzy matching, no pinyin,
     no typo correction — "what you type is what you see". */
  function normalizeQuery(q) {
    var s = String(q == null ? '' : q);
    try { s = s.normalize('NFC'); } catch (e) { /* old engines */ }
    return s.trim().toLowerCase();
  }

  function matchScore(node, query) {
    var q = query === undefined ? '' : query;
    if (!q) return 0;
    var title = String(node.title || '').toLowerCase();
    if (!node.url) {
      /* folder: one weight only (名称包含 = 50) */
      return title.indexOf(q) >= 0 ? 50 : 0;
    }
    var href = String(node.url).toLowerCase();
    var host = hostnameOf(node.url).toLowerCase();
    var score = 0;
    if (title.indexOf(q) === 0) score = 100;
    else if (title.indexOf(q) > 0) score = 60;
    if (host.indexOf(q) === 0) score = Math.max(score, 45);
    else if (host.indexOf(q) > 0) score = Math.max(score, 35);
    if (!score && href.indexOf(q) >= 0) score = 20;
    return score;
  }

  function usageCount(node) {
    var rec = node && node.url ? S.usage[node.url] : null;
    return rec && rec.count ? rec.count : 0;
  }

  /* weight desc -> usage desc -> original order asc */
  function byScore(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    var ua = usageCount(a.node);
    var ub = usageCount(b.node);
    if (ub !== ua) return ub - ua;
    return (a.node.index || 0) - (b.node.index || 0);
  }

  /* -> [{ node, score }] — bookmarks only, weight-sorted */
  function searchBookmarks(q) {
    var query = normalizeQuery(q);
    if (!query) return Promise.resolve([]);
    return getTree().then(function (tree) {
      return tree.bookmarks
        .map(function (n) { return { node: n, score: matchScore(n, query) }; })
        .filter(function (r) { return r.score > 0; })
        .sort(byScore);
    });
  }

  /* -> { folders: [...], bookmarks: [...] } — both weight-sorted */
  function search(q) {
    var query = normalizeQuery(q);
    if (!query) return Promise.resolve({ folders: [], bookmarks: [] });
    return getTree().then(function (tree) {
      var pick = function (list) {
        return list
          .map(function (n) { return { node: n, score: matchScore(n, query) }; })
          .filter(function (r) { return r.score > 0; })
          .sort(byScore);
      };
      var folders = pick(tree.folders);
      /* include the four roots as folders too — "工具栏" must be findable */
      pick(tree.roots).forEach(function (r) { folders.push(r); });
      folders.sort(byScore);
      return { folders: folders, bookmarks: pick(tree.bookmarks) };
    });
  }

  /* ── mutations ────────────────────────────────────────────────────────── */

  function demoNextIndex(parentId) {
    var db = demoLoad();
    var kids = db.nodes.filter(function (n) { return n.parentId === parentId; });
    return kids.length;
  }

  function demoId(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function createBookmark(opts) {
    var parentId = opts.parentId;
    var title = opts.title || '';
    var url = opts.url;
    if (isDemo) {
      var db = demoLoad();
      var node = {
        id: demoId('bm'),
        parentId: parentId,
        index: typeof opts.index === 'number' ? opts.index : demoNextIndex(parentId),
        title: title,
        url: url,
        dateAdded: Date.now()
      };
      db.nodes.push(node);
      demoSave(true);
      treeCache = null;
      return Promise.resolve(node.id);
    }
    var payload = { parentId: parentId, title: title, url: url };
    if (typeof opts.index === 'number') payload.index = opts.index;
    return EXT.bookmarks.create(payload).then(function (n) {
      treeCache = null;
      return n.id;
    }).catch(function (e) {
      throw fail(looksLikePermissionError(e) ? 'permission' : 'invalid', String(e.message || e));
    });
  }

  function createFolder(opts) {
    var parentId = opts.parentId;
    var title = opts.title || t('folder');
    if (isDemo) {
      var db = demoLoad();
      var node = {
        id: demoId('fd'),
        parentId: parentId,
        index: demoNextIndex(parentId),
        title: title,
        url: null,
        dateAdded: Date.now()
      };
      db.nodes.push(node);
      demoSave(true);
      treeCache = null;
      return Promise.resolve(node.id);
    }
    return EXT.bookmarks.create({ parentId: parentId, title: title }).then(function (n) {
      treeCache = null;
      return n.id;
    }).catch(function (e) {
      throw fail(looksLikePermissionError(e) ? 'permission' : 'invalid', String(e.message || e));
    });
  }

  function updateBookmark(id, opts) {
    var patch = {};
    if (opts.title !== undefined) patch.title = opts.title;
    if (opts.url !== undefined) patch.url = opts.url;
    if (isDemo) {
      var db = demoLoad();
      var node = null;
      db.nodes.forEach(function (n) { if (n.id === id) node = n; });
      if (!node) return Promise.reject(fail('invalid', 'missing'));
      if (patch.title !== undefined) node.title = patch.title;
      if (patch.url !== undefined) node.url = patch.url;
      treeCache = null;
      if (opts.parentId && opts.parentId !== node.parentId) {
        node.parentId = opts.parentId;
        node.index = demoNextIndex(opts.parentId);
      }
      demoSave(true);
      return Promise.resolve(id);
    }
    return EXT.bookmarks.update(id, patch).then(function () {
      if (opts.parentId) {
        return EXT.bookmarks.get(id).then(function (nodes) {
          var cur = nodes && nodes[0];
          if (cur && cur.parentId !== opts.parentId) {
            return EXT.bookmarks.move(id, { parentId: opts.parentId });
          }
          return null;
        });
      }
      return null;
    }).then(function () {
      treeCache = null;
      return id;
    }).catch(function (e) {
      throw fail('invalid', String(e.message || e));
    });
  }

  function updateFolder(id, opts) {
    if (isDemo) {
      var db = demoLoad();
      db.nodes.forEach(function (n) {
        if (n.id === id && opts.title !== undefined) n.title = opts.title;
      });
      treeCache = null;
      demoSave(true);
      return Promise.resolve(id);
    }
    return EXT.bookmarks.update(id, { title: opts.title }).then(function () {
      treeCache = null;
      return id;
    }).catch(function (e) {
      throw fail('invalid', String(e.message || e));
    });
  }

  function removeNode(id) {
    if (isDemo) {
      var db = demoLoad();
      var doomed = {};
      (function mark(nid) {
        doomed[nid] = true;
        db.nodes.forEach(function (n) {
          if (n.parentId === nid && !doomed[n.id]) mark(n.id);
        });
      })(id);
      db.nodes = db.nodes.filter(function (n) { return !doomed[n.id]; });
      demoSave(true);
      treeCache = null;
      return Promise.resolve();
    }
    return EXT.bookmarks.removeTree(id).then(function () {
      treeCache = null;
    }).catch(function (e) {
      throw fail('invalid', String(e.message || e));
    });
  }

  function moveNode(id, opts) {
    if (isDemo) {
      var db = demoLoad();
      var node = null;
      var siblings = [];
      db.nodes.forEach(function (n) {
        if (n.id === id) node = n;
      });
      if (!node) return Promise.reject(fail('invalid', 'missing'));
      node.parentId = opts.parentId;
      db.nodes.forEach(function (n) {
        if (n.parentId === opts.parentId && n.id !== id) siblings.push(n);
      });
      siblings.sort(function (a, b) { return a.index - b.index; });
      var at = typeof opts.index === 'number' ? Math.max(0, Math.min(opts.index, siblings.length)) : siblings.length;
      siblings.splice(at, 0, node);
      siblings.forEach(function (n, i) { n.index = i; });
      demoSave(true);
      treeCache = null;
      return Promise.resolve();
    }
    var payload = { parentId: opts.parentId };
    if (typeof opts.index === 'number') payload.index = opts.index;
    return EXT.bookmarks.move(id, payload).then(function () {
      treeCache = null;
    }).catch(function (e) {
      throw fail('invalid', String(e.message || e));
    });
  }

  /* ── url policy ───────────────────────────────────────────────────────── */

  var BLOCKED = /^(javascript|data|vbscript|blob|filesystem|about|chrome|moz-extension|resource):/i;

  function normalizeUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) return { ok: false, reason: 'empty' };
    if (s.indexOf('//') === 0) s = 'https:' + s;
    else if (s.indexOf(':') < 0 && !/\s/.test(s)) s = 'https://' + s;
    var m = /^([a-z][a-z0-9+.-]*):/i.exec(s);
    if (m) s = m[1].toLowerCase() + s.slice(m[1].length);
    if (BLOCKED.test(s)) return { ok: false, reason: 'blocked' };
    try {
      var u = new URL(s);
      if (!u.protocol) return { ok: false, reason: 'invalid' };
      return { ok: true, url: u.href };
    } catch (e) {
      return { ok: false, reason: 'invalid' };
    }
  }

  function isFileUrl(url) {
    return /^file:/i.test(String(url || ''));
  }

  function hostnameOf(url) {
    try {
      var u = new URL(url);
      return (u.hostname || '').replace(/^www\./, '');
    } catch (e) {
      return '';
    }
  }

  /* ── opening ──────────────────────────────────────────────────────────── */

  function openUrl(url, where) {
    where = where || 'tab';
    if (!url) return Promise.reject(fail('invalid'));
    if (BLOCKED.test(url)) return Promise.reject(fail('blocked'));
    if (isFileUrl(url)) return Promise.reject(fail('fileBlocked'));

    /* demo: open synchronously — an async resolve lands outside the user-gesture
       window and the popup blocker eats window.open on mobile */
    if (isDemo) {
      var w = null;
      try { w = window.open(url, '_blank'); } catch (e) { /* blocked */ }
      return Promise.resolve({ simulated: true, opened: !!w, url: url, where: where });
    }

    if (where === 'private') {
      return EXT.extension.isAllowedIncognitoAccess().then(function (allowed) {
        if (!allowed) throw fail('privateBlocked');
        return EXT.windows.create({ url: url, incognito: true });
      }).then(function () { return { ok: true }; })
        .catch(function (e) {
          if (e && e.code) throw e;
          throw fail('privateBlocked');
        });
    }
    if (where === 'window') {
      return EXT.windows.create({ url: url }).then(function () { return { ok: true }; })
        .catch(function () { throw fail('permission'); });
    }
    if (where === 'current') {
      return EXT.tabs.update({ url: url }).then(function () { return { ok: true }; })
        .catch(function () { throw fail('permission'); });
    }
    return EXT.tabs.create({ url: url }).then(function () { return { ok: true }; })
      .catch(function () { throw fail('permission'); });
  }

  function openAll(urls, where) {
    var list = (urls || []).filter(function (u) {
      return u && !BLOCKED.test(u) && !isFileUrl(u);
    });
    if (!list.length) return Promise.resolve({ ok: true, count: 0 });
    if (isDemo) return Promise.resolve({ simulated: true, url: list[0], where: where, count: list.length });

    if (where === 'private') {
      return EXT.extension.isAllowedIncognitoAccess().then(function (allowed) {
        if (!allowed) throw fail('privateBlocked');
        return EXT.windows.create({ url: list, incognito: true });
      }).then(function () { return { ok: true, count: list.length }; })
        .catch(function (e) {
          if (e && e.code) throw e;
          throw fail('privateBlocked');
        });
    }
    if (where === 'window') {
      return EXT.windows.create({ url: list }).then(function () { return { ok: true }; })
        .catch(function () { throw fail('permission'); });
    }
    return list.reduce(function (chain, u) {
      return chain.then(function () { return EXT.tabs.create({ url: u, active: false }); });
    }, Promise.resolve()).then(function () { return { ok: true, count: list.length }; })
      .catch(function () { throw fail('permission'); });
  }

  /* ── history ──────────────────────────────────────────────────────────── */

  function searchHistory(q, limit) {
    if (isDemo) {
      var query = String(q || '').toLowerCase();
      var hits = (MK.demo ? MK.demo.history() : []).filter(function (h) {
        return (h.title || '').toLowerCase().indexOf(query) >= 0 ||
          (h.url || '').toLowerCase().indexOf(query) >= 0;
      });
      return Promise.resolve(hits.slice(0, limit || 20));
    }
    if (!EXT.history) return Promise.resolve([]);
    return EXT.history.search({
      text: String(q || ''),
      maxResults: limit || 20,
      startTime: Date.now() - 365 * DAY
    }).then(function (items) {
      return (items || []).map(function (h) {
        return {
          url: h.url,
          title: h.title || '',
          visitCount: h.visitCount || 0,
          lastVisitTime: h.lastVisitTime || 0
        };
      });
    }).catch(function () { return []; });
  }

  function topHistory(days, limit) {
    if (isDemo) {
      var list = (MK.demo ? MK.demo.history() : []).slice();
      list.sort(function (a, b) {
        return (b.visitCount || 0) - (a.visitCount || 0) ||
          (b.lastVisitTime || 0) - (a.lastVisitTime || 0);
      });
      return Promise.resolve(list.slice(0, limit || 50));
    }
    if (!EXT.history) return Promise.resolve([]);
    return EXT.history.search({
      text: '',
      maxResults: 400,
      startTime: Date.now() - (days || 30) * DAY
    }).then(function (items) {
      return (items || []).map(function (h) {
        return {
          url: h.url,
          title: h.title || '',
          visitCount: h.visitCount || 0,
          lastVisitTime: h.lastVisitTime || 0
        };
      }).sort(function (a, b) { return b.visitCount - a.visitCount; });
    }).catch(function () { return []; });
  }

  function clearHistory() {
    if (isDemo) return Promise.resolve({ simulated: true });
    if (!EXT.history) return Promise.resolve({ ok: false });
    return EXT.history.deleteAll()
      .then(function () { return { ok: true }; })
      .catch(function () { return { ok: false }; });
  }

  /* ── favicons ─────────────────────────────────────────────────────────── */

  function getFavicon(url) {
    var host = hostnameOf(url);
    if (!host) return null;
    return S.favicons[host] || null;
  }

  /* Written by background.js from tabs.onUpdated (data: URLs only). Capped so
     one pathological icon can never blow the storage quota. */
  function setFavicon(host, dataUrl) {
    if (!host || !dataUrl || String(dataUrl).indexOf('data:image') !== 0) {
      return Promise.resolve(null);
    }
    if (String(dataUrl).length > 32000) return Promise.resolve(null);
    S.favicons[host] = dataUrl;
    var keys = Object.keys(S.favicons);
    if (keys.length > 300) {
      /* crude LRU: drop the first inserted keys (object order is insertion) */
      keys.slice(0, keys.length - 300).forEach(function (k) { delete S.favicons[k]; });
    }
    return rawSet({ favicons: S.favicons }).then(function () { return dataUrl; });
  }

  /* ── system ───────────────────────────────────────────────────────────── */

  function getActiveTab() {
    if (isDemo) {
      return Promise.resolve({
        title: 'Tabmark — 使用说明',
        url: 'https://example.com/tabmark-guide',
        favIconUrl: '',
        private: false
      });
    }
    return EXT.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab) throw fail('invalid');
      return {
        id: tab.id,
        title: tab.title || tab.url || '',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl || '',
        private: !!tab.incognito
      };
    }).catch(function (e) { throw fail('permission', String(e.message || e)); });
  }

  function copyText(text) {
    var value = String(text == null ? '' : text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value).catch(function () {
        return legacyCopy(value);
      });
    }
    return legacyCopy(value);
  }

  function legacyCopy(value) {
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) resolve();
        else reject(fail('permission'));
      } catch (e) {
        reject(fail('permission'));
      }
    });
  }

  function searchWeb(q) {
    if (isDemo || !EXT.search || !EXT.search.search) {
      return Promise.reject(fail('permission'));
    }
    return EXT.search.search({ query: q }).then(function () { return { ok: true }; })
      .catch(function () { throw fail('permission'); });
  }

  function newtabUrl() {
    if (isDemo) return window.location.pathname.replace(/popup\/[^/]*$/, 'newtab/newtab.html');
    return EXT.runtime.getURL('newtab/newtab.html');
  }

  function openNewtab(hash) {
    var base = newtabUrl();
    var url = hash ? base + hash : base;
    if (isDemo) {
      window.open(url, '_blank');
      return Promise.resolve({ simulated: true });
    }
    return EXT.tabs.create({ url: url }).then(function () { return { ok: true }; })
      .catch(function () { throw fail('permission'); });
  }

  /* Settings live in the newtab drawer (impl-brief §9: no options page), so
     "open settings" just opens the newtab with the drawer already open. */
  function openSettings() {
    var base = newtabUrl();
    var url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'state=settings';
    if (isDemo) {
      window.open(url, '_blank');
      return Promise.resolve({ simulated: true });
    }
    return EXT.tabs.create({ url: url }).then(function () { return { ok: true }; })
      .catch(function () { throw fail('permission'); });
  }

  /* ── change events ────────────────────────────────────────────────────── */

  var changeCbs = [];
  var changeTimer = null;

  function emitChange() {
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(function () {
      changeTimer = null;
      treeCache = null;
      changeCbs.forEach(function (cb) {
        try { cb(); } catch (e) { /* one bad listener must not break the page */ }
      });
    }, 150);
  }

  function onChanged(cb) {
    changeCbs.push(cb);
    return function () {
      var i = changeCbs.indexOf(cb);
      if (i >= 0) changeCbs.splice(i, 1);
    };
  }

  if (!isDemo) {
    try {
      EXT.bookmarks.onCreated.addListener(emitChange);
      EXT.bookmarks.onRemoved.addListener(emitChange);
      EXT.bookmarks.onChanged.addListener(emitChange);
      EXT.bookmarks.onMoved.addListener(emitChange);
    } catch (e) { /* ignore */ }
  } else {
    /* manual bumps from the demo layer so both worlds behave the same */
    MK.demoBus = { emit: emitChange };
  }

  /* ── init ─────────────────────────────────────────────────────────────── */

  function init() {
    return Promise.all([
      loadSettings(),
      rawGet(['pinned', 'hidden', 'usage', 'ui', 'favicons'])
    ]).then(function (res) {
      var store = res[1] || {};
      S.pinned = Array.isArray(store.pinned) ? store.pinned : (MK.demo && isDemo ? MK.demo.pinned() : []);
      S.hidden = store.hidden && typeof store.hidden === 'object'
        ? { bookmarks: store.hidden.bookmarks || [], folders: store.hidden.folders || [] }
        : { bookmarks: [], folders: [] };
      S.usage = store.usage && typeof store.usage === 'object' ? store.usage : {};
      S.ui = store.ui && typeof store.ui === 'object'
        ? { expanded: store.ui.expanded || [], scroll: store.ui.scroll || {}, lastCreateFolderId: store.ui.lastCreateFolderId || null }
        : { expanded: [], scroll: {}, lastCreateFolderId: null };
      S.favicons = store.favicons && typeof store.favicons === 'object' ? store.favicons : {};
      if (MK.i18n) MK.i18n.setLang(MK.i18n.resolve(S.settings.language));
      return S;
    }).catch(function () {
      S.settings = mergeDefaults({});
      return S;
    });
  }

  /* ── wallpaper ────────────────────────────────────────────────────────── */

  function getWallpaper() {
    var w = S.settings && S.settings.wallpaper;
    if (!w || typeof w !== 'object') return { kind: 'none', value: '', dim: 0 };
    return { kind: w.kind || 'none', value: w.value || '', dim: typeof w.dim === 'number' ? w.dim : 0 };
  }

  function patchWallpaper(patch) {
    var next = getWallpaper();
    Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
    return patchSettings({ wallpaper: next }).then(flushSettings).then(function () { return next; });
  }

  function getWallpaperImage() {
    return rawGet('wallpaperImage').then(function (r) { return (r && r.wallpaperImage) || ''; })
      .catch(function () { return ''; });
  }

  function setWallpaperImage(dataUrl) {
    return rawSet({ wallpaperImage: dataUrl || '' }).catch(function () { return null; });
  }

  /* ── bulk maintenance (backup / duplicates / icons) ───────────────────── */

  /* Flat, restorable snapshot: one record per node, parentId preserved. */
  function snapshot() {
    return getTree(true).then(function (tree) {
      var nodesOut = [];
      (function walk(n) {
        nodesOut.push({
          id: n.id,
          parentId: n.parentId || null,
          index: n.index || 0,
          title: n.title || '',
          url: n.url || null,
          rootKey: n.rootKey || null,
          dateAdded: n.dateAdded || 0
        });
        (n.children || []).forEach(walk);
      })({ id: 'root', children: tree.roots });
      return {
        app: 'Tabmark',
        format: 'tabmark.backup.v1',
        exportedAt: new Date().toISOString(),
        nodeCount: nodesOut.length,
        nodes: nodesOut
      };
    });
  }

  function dupKey(url) {
    try {
      var u = new URL(url);
      var host = u.hostname.replace(/^www\./, '').toLowerCase();
      var path = u.pathname.replace(/\/+$/, '');
      return host + path + (u.search || '');
    } catch (e) { return String(url || ''); }
  }

  function findDuplicates() {
    return getTree().then(function (tree) {
      var groups = {};
      tree.bookmarks.forEach(function (b) {
        var k = dupKey(b.url);
        (groups[k] = groups[k] || []).push(b);
      });
      var out = [];
      Object.keys(groups).forEach(function (k) {
        if (groups[k].length < 2) return;
        var items = groups[k].slice().sort(function (a, b) {
          return (a.dateAdded || 0) - (b.dateAdded || 0) || (a.index || 0) - (b.index || 0);
        });
        out.push({ key: k, url: items[0].url, items: items });
      });
      out.sort(function (a, b) { return b.items.length - a.items.length; });
      return out;
    });
  }

  function findIssues() {
    return getTree().then(function (tree) {
      var emptyFolders = tree.folders.filter(function (f) {
        return !(f.recCount > 0) && !f.rootKey;
      });
      var untitled = tree.bookmarks.filter(function (b) {
        return !String(b.title || '').trim();
      });
      return { emptyFolders: emptyFolders, untitled: untitled };
    });
  }

  /* Sequentially delete many nodes; resolves with the ids that survived. */
  function removeMany(ids) {
    var failed = [];
    return ids.reduce(function (chain, id) {
      return chain.then(function () {
        return removeNode(id).catch(function () { failed.push(id); });
      });
    }, Promise.resolve()).then(function () { return failed; });
  }

  /* Icons we can collect without touching the network: any inline (data:) icon
     Firefox already holds for an open tab. Remote icons are opt-in elsewhere. */
  function harvestTabIcons() {
    if (isDemo || !EXT.tabs || !EXT.tabs.query) return Promise.resolve(0);
    return EXT.tabs.query({}).then(function (tabs) {
      var added = 0;
      (tabs || []).forEach(function (t) {
        var host = hostnameOf(t.url);
        var icon = t.favIconUrl;
        if (!host || !icon || S.favicons[host]) return;
        if (String(icon).indexOf('data:image') !== 0) return;
        if (String(icon).length > 32000) return;
        S.favicons[host] = icon;
        added++;
      });
      if (!added) return 0;
      return rawSet({ favicons: S.favicons }).then(function () { return added; });
    }).catch(function () { return 0; });
  }

  MK.api = {
    isDemo: isDemo,
    state: S,
    DEFAULTS: DEFAULTS,
    init: init,
    /* settings */
    settings: {
      get: function () { return S.settings || mergeDefaults({}); },
      patch: patchSettings,
      flush: flushSettings,
      defaults: DEFAULTS
    },
    getSettings: function () { return S.settings || mergeDefaults({}); },
    patchSettings: patchSettings,
    flushSettings: flushSettings,
    /* collections */
    getPinned: function () { return S.pinned; },
    setPinned: setPinned,
    getHidden: function () { return S.hidden; },
    setHidden: setHidden,
    getUsage: function () { return S.usage; },
    clearUsage: clearUsage,
    recordOpen: recordOpen,
    getUI: function () { return S.ui; },
    setUI: setUI,
    getFavicon: getFavicon,
    setFavicon: setFavicon,
    harvestTabIcons: harvestTabIcons,
    remoteFavicon: function (url) {
      var host = hostnameOf(url);
      return host ? 'https://' + host + '/favicon.ico' : null;
    },

    /* wallpaper */
    getWallpaper: getWallpaper,
    patchWallpaper: patchWallpaper,
    getWallpaperImage: getWallpaperImage,
    setWallpaperImage: setWallpaperImage,

    /* bulk maintenance */
    snapshot: snapshot,
    findDuplicates: findDuplicates,
    findIssues: findIssues,
    removeMany: removeMany,
    /* tree */
    getTree: getTree,
    invalidateTree: function () { treeCache = null; },
    /* search */
    search: search,
    searchBookmarks: searchBookmarks,
    matchScore: matchScore,
    normalizeQuery: normalizeQuery,
    /* mutations */
    createBookmark: createBookmark,
    createFolder: createFolder,
    updateBookmark: updateBookmark,
    updateFolder: updateFolder,
    removeNode: removeNode,
    moveNode: moveNode,
    /* open */
    openUrl: openUrl,
    openAll: openAll,
    /* history */
    searchHistory: searchHistory,
    clearHistory: clearHistory,
    topHistory: topHistory,
    /* system */
    getActiveTab: getActiveTab,
    copyText: copyText,
    searchWeb: searchWeb,
    openNewtab: openNewtab,
    openSettings: openSettings,
    /* misc */
    normalizeUrl: normalizeUrl,
    isFileUrl: isFileUrl,
    hostnameOf: hostnameOf,
    onChanged: onChanged,
    emitChange: emitChange
  };
})();
