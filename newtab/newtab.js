/* ============================================================================
   newtab.js — the bookmark desk (v2).

   Mental model
     · ONE navigation surface: the sidebar tree. The content area never repeats
       the bookmark tree; it shows one view at a time.
     · views: all | folder | pinned | recent | search
     · bookmarks are opened in a new tab by default (settings.openWith).

   Everything below is plain DOM — no innerHTML with user data, no framework,
   no network. Data comes from shared/api.js.
   ========================================================================== */

(function () {
  'use strict';

  var MK = window.MK;
  var api = MK.api;
  var I = MK.icons;
  var t = function (k, p) { return MK.i18n.t(k, p); };
  var MOD = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Ctrl';

  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function icon(name, size) {
    var s = el('span', 'ico');
    s.appendChild(I.el(name, size || 15));
    return s;
  }
  function btn(tag, cls, label, iconName) {
    var b = el(tag === 'a' ? 'button' : tag, cls);
    if (iconName) b.appendChild(icon(iconName, 15));
    if (label) b.appendChild(el('span', null, label));
    return b;
  }
  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }
  function isDark() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function hueFor(str) {
    var seed = 0, s = String(str || '');
    for (var i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) % 360;
    return seed;
  }

  /* ── state ────────────────────────────────────────────────────────────── */

  var state = {
    tree: null,
    settings: null,
    pinned: [],
    usage: {},
    history: [],
    view: { kind: 'all', folderId: null },
    q: '',
    results: null,
    searchSeq: 0,
    sp: { open: false, rows: [], sel: -1, query: '' },
    historyView: { query: '', range: 'today' },
    engineMenuOpen: false,
    loading: true,
    failed: false,
    expanded: {},
    menu: null,
    toastTimer: null,
    lastFocus: null
  };

  var nodes = {
    app: $('app'), side: $('side'), tree: $('tree'), rail: $('rail'), wall: $('wall'),
    resizer: $('sideResizer'), navAll: $('navAll'),
    navPinned: $('navPinned'), navRecent: $('navRecent'),
    countAll: $('countAll'), countPinned: $('countPinned'),
    title: $('viewTitle'), count: $('viewCount'), crumbs: $('crumbs'),
    content: $('content'), scroll: $('scroll'), topbar: document.querySelector('.topbar'),
    searchWrap: $('searchWrap'), searchBox: $('searchBox'), searchInput: $('searchInput'),
    searchKbd: $('searchKbd'), searchPop: $('searchPop'),
    engineBtn: $('btnEngine'), engineBadge: $('engineBadge'), engPop: $('engPop'),
    clearSearch: $('btnClearSearch'), cancelSearch: $('btnSearchCancel'),
    sortBtn: $('btnSort'), sortLabel: $('sortLabel'), organizeBtn: $('btnOrganize'),
    addBtn: $('btnAdd'), sideNote: $('sideNote'), themeBtn: $('btnThemeSide'),
    toast: $('toast'), toastText: $('toastText'), toastAction: $('toastAction'),
    menuLayer: $('menuLayer'), dlg: $('dlg'), dlgTitle: $('dlgTitle'),
    dlgBody: $('dlgBody'), dlgFoot: $('dlgFoot'), dlgClose: $('dlgClose'),
    announcer: $('announcer'), menuBtn: $('btnMenu'), histBar: $('histBar')
  };

  /* ── small data helpers ───────────────────────────────────────────────── */

  function nodeById(id) { return state.tree && state.tree.byId[id] || null; }

  function ancestorsOf(node) {
    var out = [];
    var cur = node;
    while (cur && cur.parentId && state.tree.byId[cur.parentId]) {
      cur = state.tree.byId[cur.parentId];
      out.unshift(cur);
    }
    return out;
  }

  function isAncestor(candidateId, nodeId) {
    var cur = nodeById(nodeId);
    while (cur && cur.parentId) {
      if (cur.parentId === candidateId) return true;
      cur = state.tree.byId[cur.parentId];
    }
    return false;
  }

  function isRoot(node) { return !!(node && node.rootKey); }

  function folderUrlList(node) {
    var out = [];
    (function walk(n) {
      n.children.forEach(function (c) {
        if (c.url) out.push(c.url);
        else walk(c);
      });
    })(node);
    return out;
  }

  function isPinned(type, id) {
    return state.pinned.some(function (p) { return p.type === type && p.id === id; });
  }

  function pinnedItems() {
    return state.pinned.map(function (ref) {
      var n = nodeById(ref.id);
      return n ? { type: ref.type, node: n } : null;
    }).filter(Boolean);
  }

  function topLevelFolders() {
    var out = [];
    state.tree.roots.forEach(function (root) {
      root.children.forEach(function (c) {
        if (!c.url) out.push(c);
      });
    });
    return out;
  }

  function sortNodes(list, key) {
    var arr = list.slice();
    if (key === 'default' || !key) {
      arr.sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
      return arr;
    }
    if (key === 'name') {
      arr.sort(function (a, b) {
        return String(a.title || '').localeCompare(String(b.title || ''), MK.i18n.lang, { numeric: true });
      });
      return arr;
    }
    if (key === 'added') {
      /* newest first — the only direction that makes sense without a second control */
      arr.sort(function (a, b) { return (b.dateAdded || 0) - (a.dateAdded || 0); });
      return arr;
    }
    if (key === 'usage') {
      arr.sort(function (a, b) {
        var ua = (state.usage[a.url] && state.usage[a.url].count) || 0;
        var ub = (state.usage[b.url] && state.usage[b.url].count) || 0;
        if (ua !== ub) return ub - ua;
        return (a.index || 0) - (b.index || 0);
      });
      return arr;
    }
    return arr;
  }

  function sortedBookmarks(list) {
    return sortNodes(list, state.settings.sortKey);
  }

  /* ── chrome: icons / theme / language ─────────────────────────────────── */

  function hydrateIcons(root) {
    var scope = root || document;
    var els = scope.querySelectorAll('[data-icon]');
    for (var i = 0; i < els.length; i++) {
      var target = els[i];
      if (target.getAttribute('data-icon-ready') === '1') continue;
      var size = parseInt(target.getAttribute('data-size'), 10) || 16;
      target.appendChild(I.el(target.getAttribute('data-icon'), size));
      target.setAttribute('data-icon-ready', '1');
    }
  }

  function applyTheme() {
    var root = document.documentElement;
    var qTheme = new URLSearchParams(window.location.search).get('theme');
    var theme = (qTheme === 'light' || qTheme === 'dark') ? qTheme : state.settings.theme;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
    var name = state.settings.theme === 'dark' ? 'moon'
      : state.settings.theme === 'light' ? 'sun' : 'monitor';
    I.mount(nodes.themeBtn, name, 16);
    nodes.themeBtn.setAttribute('data-icon-ready', '1');
  }

  function applyLanguage() {
    MK.i18n.setLang(MK.i18n.resolve(state.settings.language));
    MK.i18n.apply(document);
  }

  /* ── sidebar ──────────────────────────────────────────────────────────── */

  function renderSide() {
    /* While searching, no folder claims the active state — the result list is
       its own view, and a highlighted folder implies you are still inside it. */
    var focusFolder = state.view.kind === 'folder' ? state.view.folderId : null;
    var activeFolder = state.q ? null : focusFolder;
    if (focusFolder) expandAncestors(focusFolder);

    nodes.navAll.classList.toggle('is-active', state.view.kind === 'all' && !state.q);
    nodes.navPinned.classList.toggle('is-active', state.view.kind === 'pinned' && !state.q);
    nodes.navRecent.classList.toggle('is-active', state.view.kind === 'recent' && !state.q);

    nodes.countAll.textContent = state.tree ? String(state.tree.bookmarks.length) : '';
    nodes.countPinned.textContent = state.pinned.length ? String(state.pinned.length) : '';

    clear(nodes.tree);
    if (!state.tree) return;

    var visibleRoots = state.tree.roots.filter(function (r) {
      return r.recCount > 0 || r.id === focusFolder || hasExpandedDescendant(r);
    });
    if (!visibleRoots.length) visibleRoots = state.tree.roots;

    visibleRoots.forEach(function (root) {
      nodes.tree.appendChild(treeBranch(root, 0, activeFolder));
    });

    if (nodes.app.getAttribute('data-collapsed') === '1') renderRail();
  }

  function hasExpandedDescendant(node) {
    return node.children.some(function (c) {
      return !c.url && (state.expanded[c.id] || hasExpandedDescendant(c));
    });
  }

  function treeBranch(node, depth, activeId) {
    var frag = document.createDocumentFragment();
    var row = el('div', 'tree-row' + (isRoot(node) ? ' is-root' : ''));
    if (node.id === activeId) row.classList.add('is-active');
    row.setAttribute('role', 'treeitem');
    row.dataset.folderId = node.id;
    row.dataset.depth = String(depth);

    var kids = node.children.filter(function (c) { return !c.url; });
    var isOpen = !!state.expanded[node.id];
    row.dataset.open = isOpen ? '1' : '0';
    row.setAttribute('aria-expanded', kids.length ? String(isOpen) : 'false');

    var twist = el('button', 'tree-twist' + (kids.length ? '' : ' is-leaf'));
    twist.type = 'button';
    twist.tabIndex = -1;
    twist.appendChild(I.el('chevronRight', 11));
    twist.setAttribute('aria-hidden', 'true');
    if (kids.length) {
      twist.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleFolderOpen(node.id);
      });
    }
    row.appendChild(twist);

    var main = el('button', 'tree-main');
    main.type = 'button';
    main.appendChild(icon(isOpen && kids.length ? 'folderOpen' : 'folder', 15)).classList.add('tree-icon');
    main.appendChild(el('span', 'tree-name', node.title));
    if (node.recCount) main.appendChild(el('span', 'tree-count', String(node.recCount)));
    main.addEventListener('click', function () { enterFolder(node.id); });
    main.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' && kids.length && !isOpen) { e.preventDefault(); toggleFolderOpen(node.id, true); }
      if (e.key === 'ArrowLeft') {
        if (kids.length && isOpen) {
          e.preventDefault();
          toggleFolderOpen(node.id, false);
        } else if (node.parentId && nodeById(node.parentId)) {
          e.preventDefault();
          var parentRow = nodes.tree.querySelector('[data-folder-id="' + cssEsc(node.parentId) + '"] .tree-main');
          if (parentRow) parentRow.focus();
        }
      }
    });
    row.appendChild(main);

    dropTarget(row, node.id);
    frag.appendChild(row);

    if (kids.length) {
      var box = el('div', 'tree-kids');
      box.style.paddingLeft = '14px';
      if (!isOpen) box.hidden = true;
      kids.sort(function (a, b) { return (a.index || 0) - (b.index || 0); }).forEach(function (kid) {
        box.appendChild(treeBranch(kid, depth + 1, activeId));
      });
      frag.appendChild(box);
    }
    return frag;
  }

  function toggleFolderOpen(id, force) {
    var open = force === undefined ? !state.expanded[id] : force;
    state.expanded[id] = open;
    var ui = api.getUI() || {};
    var list = Object.keys(state.expanded).filter(function (k) { return state.expanded[k]; });
    ui.expanded = list;
    api.setUI(ui);
    renderSide();
    var row = nodes.tree.querySelector('[data-folder-id="' + cssEsc(id) + '"]');
    if (row) {
      var main = row.querySelector('.tree-main');
      if (main) main.focus();
    }
  }

  function expandAncestors(folderId) {
    var node = nodeById(folderId);
    if (!node) return;
    ancestorsOf(node).forEach(function (a) {
      if (!state.expanded[a.id]) state.expanded[a.id] = true;
    });
  }

  function cssEsc(v) { return String(v).replace(/["\\]/g, '\\$&'); }

  /* ── header ───────────────────────────────────────────────────────────── */

  function setHeader(title, countText, crumbs) {
    nodes.title.textContent = title;
    nodes.count.textContent = countText || '';
    clear(nodes.crumbs);
    if (crumbs && crumbs.length) {
      nodes.crumbs.hidden = false;
      crumbs.forEach(function (c, i) {
        if (i) nodes.crumbs.appendChild(el('span', 'crumb-sep', '/'));
        var b = el('button', 'crumb', c.title);
        b.type = 'button';
        if (c.id) b.addEventListener('click', function () { enterFolder(c.id); });
        else b.disabled = true;
        nodes.crumbs.appendChild(b);
      });
    } else {
      nodes.crumbs.hidden = true;
    }
  }

  function renderHeader() {
    nodes.sortBtn.hidden = false;
    if (state.view.kind === 'folder') {
      var node = nodeById(state.view.folderId);
      if (!node) { state.view = { kind: 'all', folderId: null }; renderHeader(); return; }
      var crumbs = ancestorsOf(node).map(function (a) { return { id: a.id, title: a.title }; });
      setHeader(node.title, t('items', { n: node.recCount }), crumbs);
      return;
    }
    if (state.view.kind === 'pinned') {
      setHeader(t('pinned'), state.pinned.length ? t('items', { n: state.pinned.length }) : '', null);
      return;
    }
    if (state.view.kind === 'recent') {
      var recent = filterHistory(state.history);
      setHeader(t('recentVisits'), recent.length ? t('items', { n: recent.length }) : '', null);
      return;
    }
    setHeader(t('allBookmarks'), state.tree ? t('bookmarkCount', { n: state.tree.bookmarks.length }) : '', null);
  }

  /* ── content ──────────────────────────────────────────────────────────── */

  function histRefresh() {
    if (state.histRefreshFn) state.histRefreshFn();
  }

  function renderContent() {
    clear(nodes.content);
    state.histRefreshFn = null;
    var onRecent = state.view.kind === 'recent';
    nodes.histBar.hidden = !onRecent;
    if (onRecent) {
      clear(nodes.histBar);
      nodes.histBar.appendChild(buildHistTools());
    }
    nodes.content.classList.toggle('is-colview', colMode());
    if (state.failed) { nodes.content.appendChild(errorState()); return; }
    if (state.loading) { nodes.content.appendChild(skeletonState()); return; }
    if (state.view.kind === 'folder') { renderFolderView(); return; }
    if (state.view.kind === 'pinned') { renderPinnedView(); return; }
    if (state.view.kind === 'recent') { renderRecentView(); return; }
    renderAllView();
  }

  function section(title, count, action) {
    var sec = el('section', 'sec');
    var head = el('div', 'sec-head');
    var h = el('h2', 'sec-title');
    if (title.icon) h.appendChild(icon(title.icon, 14));
    h.appendChild(document.createTextNode(title.text));
    head.appendChild(h);
    if (count !== undefined && count !== null) head.appendChild(el('span', 'sec-count', String(count)));
    if (action) {
      var b = el('button', 'sec-link', null);
      b.type = 'button';
      b.appendChild(document.createTextNode(action.label));
      if (action.icon) b.appendChild(icon(action.icon, 12));
      b.addEventListener('click', action.onClick);
      head.appendChild(b);
    }
    sec.appendChild(head);
    return sec;
  }

  function grid(items, extraClass) {
    var cls = 'grid';
    if (extraClass) cls += ' ' + extraClass;
    var g = el('div', cls);
    items.forEach(function (n) { g.appendChild(n); });
    return g;
  }

  /* markoob 列布局: compact style only — each section becomes a column of
     stacked rows, sections flow side by side. Card style is always row. */
  function colMode() {
    return state.settings.bookmarkStyle === 'compact' &&
      state.settings.layoutType === 'col';
  }

  function renderAllView() {
    var hasAny = false;

    var pins = pinnedItems().slice(0, 6);
    if (pins.length) {
      hasAny = true;
      var pinSec = section({ text: t('pinned'), icon: 'pin' }, pins.length);
      if (state.pinned.length > pins.length) {
        pinSec.firstChild.appendChild(makeLink(t('viewAll'), function () { setView('pinned'); }));
      }
      pinSec.appendChild(grid(pins.map(function (p) { return cardFor(p.node, { zone: 'pinned' }); })));
      nodes.content.appendChild(pinSec);
    }

    if (state.settings.recommendations) {
      var visits = recentHistory(6);
      if (visits.length) {
        hasAny = true;
        var recSec = section({ text: t('recentVisits'), icon: 'history' }, null,
          { label: t('viewAll'), icon: 'chevronRight', onClick: function () { setView('recent'); } });
        recSec.appendChild(grid(visits.map(function (h) { return historyCard(h, 'visit'); })));
        nodes.content.appendChild(recSec);
      }
    }

    var folders = topLevelFolders();
    if (folders.length) {
      hasAny = true;
      var folderSec = section({ text: t('foldersSection'), icon: 'folder' }, folders.length);
      folderSec.appendChild(grid(folders.map(function (f) { return folderCard(f); })));
      nodes.content.appendChild(folderSec);
    }

    if (!hasAny) {
      nodes.content.appendChild(stateBlock('empty', t('emptyState'), t('emptyStateHint'), [
        { label: t('addBookmark'), primary: true, onClick: function () { openBookmarkDialog(null); } }
      ]));
    }
  }

  function makeLink(label, onClick) {
    var b = el('button', 'sec-link', null);
    b.type = 'button';
    b.appendChild(document.createTextNode(label));
    b.appendChild(icon('chevronRight', 12));
    b.addEventListener('click', onClick);
    return b;
  }

  function renderPinnedView() {
    var items = pinnedItems();
    if (!items.length) {
      nodes.content.appendChild(stateBlock('pin', t('emptyPinnedTitle'), t('emptyPinnedHint'), null));
      return;
    }
    var sec = el('section', 'sec');
    var g = el('div', 'grid is-wide');
    items.forEach(function (p, i) {
      var c = cardFor(p.node, { zone: 'pinned', pinIndex: i });
      g.appendChild(c);
    });
    sec.appendChild(g);
    nodes.content.appendChild(sec);
  }

  function renderRecentView() {
    /* Full history browser. The search/range/clear tools live in the topbar
       (hist-bar); typing here only refreshes the grid, so focus survives. */
    var gridEl = grid([]);
    state.histRefreshFn = function () {
      var all = filterHistory(state.history);
      var list = all.slice(0, 60);
      nodes.count.textContent = all.length ? t('items', { n: all.length }) : '';
      clear(gridEl);
      if (!list.length) {
        gridEl.appendChild(el('p', 'agg-empty', t('historyEmpty')));
      } else {
        list.forEach(function (h) { gridEl.appendChild(historyCard(h, 'recent')); });
      }
    };
    state.histRefreshFn();
    nodes.content.appendChild(gridEl);
  }

  /* Aggregate view: one section per child folder, each listing that folder's
     own children (subfolders and bookmarks side by side, like the reference).
     Direct bookmarks of the current folder get their own section on top. */
  function aggregateSection(title, count, action, items) {
    var sec = section(title, count, action);
    sec.classList.add('is-aggregate');
    if (!items.length) {
      sec.appendChild(el('p', 'agg-empty', t('emptyFolderTitle')));
      return sec;
    }
    sec.appendChild(grid(items.map(function (n) {
      return cardFor(n, { zone: 'agg', compact: true });
    }), 'is-compact'));
    return sec;
  }

  function byIndex(a, b) { return (a.index || 0) - (b.index || 0); }

  /* Every folder that actually holds bookmarks becomes its own section, in tree
     order, labelled by its path below the folder you opened. That is the promise
     the sidebar makes — "click a folder, see everything inside it, top to
     bottom" — so nested folders are expanded rather than collapsed into a row. */
  function flattenSections(node) {
    var out = [];
    (function walk(parent, prefix) {
      var kids = parent.children.slice().sort(byIndex);
      var books = kids.filter(function (c) { return !!c.url; });
      if (books.length) {
        out.push({
          label: prefix || t('inThisFolder'),
          folder: parent,
          items: sortedBookmarks(books)
        });
      }
      kids.filter(function (c) { return !c.url; }).forEach(function (f) {
        walk(f, prefix ? prefix + ' › ' + f.title : f.title);
      });
    })(node, '');
    return out;
  }

  function renderFolderView() {
    var node = nodeById(state.view.folderId);
    if (!node) { setView('all'); return; }

    var kids = node.children.slice().sort(byIndex);

    if (!kids.length) {
      nodes.content.appendChild(stateBlock('folder', t('emptyFolderTitle'), t('emptyFolderHint'), [
        { label: t('addBookmark'), primary: true, onClick: function () { openBookmarkDialog(null, node.id); } },
        { label: t('addFolder'), onClick: function () { openFolderDialog(null, node.id); } }
      ]));
      return;
    }

    var hasChildFolders = kids.some(function (c) { return !c.url; });

    /* Leaf folder: just its bookmarks, no section chrome. */
    if (!hasChildFolders) {
      var only = el('section', 'sec');
      only.appendChild(grid(sortedBookmarks(kids).map(function (b) {
        return cardFor(b, { zone: 'folder', compact: true });
      }), 'is-compact'));
      nodes.content.appendChild(only);
      return;
    }

    var sections = flattenSections(node);
    if (!sections.length) {
      sections = [{ label: t('emptyFolderTitle'), folder: node, items: [] }];
    }
    sections.forEach(function (s) {
      nodes.content.appendChild(aggregateSection(
        { text: s.label, icon: s.folder === node ? 'bookmark' : 'folder' },
        t('items', { n: s.items.length }), null, s.items));
    });
  }

  /* ── cards ────────────────────────────────────────────────────────────── */

  function faviconTile(url) {
    var host = api.hostnameOf(url) || '';
    var fav = el('span', 'fav');
    var letter = (host.replace(/^www\./, '')[0] || '·').toUpperCase();
    /* Local data: URL first. Only when the user opted in do we fall back to
       asking the site for /favicon.ico — that is a network request, so it stays
       behind a switch in Settings → Organize. */
    var src = api.getFavicon(url);
    if (!src && state.settings && state.settings.faviconRemote) src = api.remoteFavicon(url);
    if (src) {
      var img = document.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      var fallback = function () {
        clear(fav);
        paintLetter(fav, letter, host);
      };
      img.addEventListener('error', fallback);
      img.addEventListener('load', function () { if (!img.naturalWidth) fallback(); });
      img.src = src;
      fav.appendChild(img);
    } else {
      paintLetter(fav, letter, host);
    }
    return fav;
  }

  function paintLetter(fav, letter, host) {
    var h = hueFor(host);
    fav.classList.add('is-letter');
    fav.textContent = letter;
    if (isDark()) {
      fav.style.background = 'hsl(' + h + ' 18% 27%)';
      fav.style.color = 'hsl(' + h + ' 45% 76%)';
    } else {
      fav.style.background = 'hsl(' + h + ' 32% 90%)';
      fav.style.color = 'hsl(' + h + ' 38% 34%)';
    }
  }

  function cardFor(node, opts) {
    opts = opts || {};
    if (opts.compact === undefined) {
      opts.compact = state.settings.bookmarkStyle === 'compact';
    }
    var isFolder = !node.url;
    var card = el('div', 'card' + (opts.zone === 'search' ? '' : ''));
    card.dataset.kind = isFolder ? 'folder' : 'bookmark';
    card.dataset.id = node.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'link');

    var sub = isFolder ? t('items', { n: node.recCount }) : (api.hostnameOf(node.url) || node.url);
    var aria = isFolder
      ? t('folderAria', { title: node.title, n: node.recCount })
      : node.title + ', ' + sub;
    card.setAttribute('aria-label', aria);

    if (isFolder) {
      var f = el('span', 'fav is-folder');
      f.appendChild(I.el('folder', 17));
      card.appendChild(f);
    } else {
      card.appendChild(faviconTile(node.url));
    }

    var main = el('span', 'card-main');
    var titleEl = el('span', 'card-title');
    if (opts.query) appendHighlighted(titleEl, node.title, opts.query);
    else titleEl.textContent = node.title;
    main.appendChild(titleEl);
    main.appendChild(el('span', 'card-sub', sub));
    card.appendChild(main);

    if (opts.compact) {
      /* Folder-aggregate rows: one line, neutral surface, count on the right
         for folders. No per-domain tint — at this density the stripes read as
         noise rather than information. */
      card.classList.add('is-compact');
      card.title = isFolder ? node.title : (node.url || '');
      if (isFolder) card.appendChild(el('span', 'card-count', t('items', { n: node.recCount })));
    }

    var p = el('button', 'card-pin');
    p.type = 'button';
    p.tabIndex = -1;
    p.title = isPinned(isFolder ? 'folder' : 'bookmark', node.id) ? t('unpin') : t('pin');
    p.setAttribute('aria-label', p.title);
    p.appendChild(I.el(isPinned(isFolder ? 'folder' : 'bookmark', node.id) ? 'pinOff' : 'pin', 13));
    p.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePin(node);
    });
    card.appendChild(p);

    if (isFolder) {
      card.addEventListener('click', function () { enterFolder(node.id); });
      /* pinned cards are drop targets for reordering, not for nesting */
      if (opts.zone !== 'pinned') dropTarget(card, node.id);
    } else {
      card.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey) openNode(node, 'tab');
        else openNode(node);
      });
      card.addEventListener('auxclick', function (e) {
        if (e.button === 1) { e.preventDefault(); openNode(node, 'tab'); }
      });
    }

    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isFolder) enterFolder(node.id); else openNode(node);
      }
    });
    card.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      openNodeMenu(node, e.clientX, e.clientY);
    });

    if (!isFolder) {
      card.draggable = true;
      card.addEventListener('dragstart', function (e) { onDragStart(e, node, card); });
      card.addEventListener('dragend', function () { onDragEnd(); });
    } else {
      card.draggable = true;
      card.addEventListener('dragstart', function (e) { onDragStart(e, node, card); });
      card.addEventListener('dragend', function () { onDragEnd(); });
    }

    if (opts.zone === 'pinned' && typeof opts.pinIndex === 'number') {
      card.dataset.pinIndex = String(opts.pinIndex);
      pinnedDropTarget(card, opts.pinIndex);
    }

    return card;
  }

  function folderCard(node, query) {
    return cardFor(node, { zone: query ? 'search' : 'folder', query: query });
  }

  function historyCard(h, zone, query) {
    var card = el('div', 'card is-ghost');
    card.dataset.kind = 'history';
    card.dataset.url = h.url;
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    card.setAttribute('aria-label', (h.title || h.url) + ', ' + t('historyGroup'));

    var fav = faviconTile(h.url);
    card.appendChild(fav);

    var main = el('span', 'card-main');
    var titleEl = el('span', 'card-title');
    var title = h.title || h.url;
    if (query) appendHighlighted(titleEl, title, query);
    else titleEl.textContent = title;
    main.appendChild(titleEl);
    main.appendChild(el('span', 'card-sub', api.hostnameOf(h.url) || h.url));
    card.appendChild(main);

    card.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey) api.openUrl(h.url, 'tab').catch(function () {});
      else openUrl(h.url, state.settings.openWith === 'current' ? 'current' : 'tab');
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openUrl(h.url, state.settings.openWith === 'current' ? 'current' : 'tab');
      }
    });
    card.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      openHistoryMenu(h, e.clientX, e.clientY);
    });
    return card;
  }

  function appendHighlighted(container, text, query) {
    var src = String(text || '');
    var q = String(query || '').trim();
    if (!q) { container.textContent = src; return; }
    var lower = src.toLowerCase();
    var at = lower.indexOf(q.toLowerCase());
    if (at < 0) { container.textContent = src; return; }
    container.appendChild(document.createTextNode(src.slice(0, at)));
    var mark = document.createElement('mark');
    mark.textContent = src.slice(at, at + q.length);
    container.appendChild(mark);
    container.appendChild(document.createTextNode(src.slice(at + q.length)));
  }

  function stateBlock(kind, title, desc, actions) {
    var wrap = el('div', 'state');
    var box = el('span', 'state-ico');
    box.appendChild(I.el(kind === 'search' ? 'search' : kind === 'pin' ? 'pin' : kind === 'history' ? 'history' : kind === 'error' ? 'alert' : 'empty', 22));
    wrap.appendChild(box);
    wrap.appendChild(el('p', 'state-title', title));
    if (desc) wrap.appendChild(el('p', 'state-desc', desc));
    if (actions && actions.length) {
      var row = el('div', 'state-actions');
      actions.forEach(function (a) {
        var b = el('button', 'btn' + (a.primary ? ' is-primary' : ''), a.label);
        b.type = 'button';
        b.addEventListener('click', a.onClick);
        row.appendChild(b);
      });
      wrap.appendChild(row);
    }
    return wrap;
  }

  function skeletonState() {
    var wrap = el('div');
    for (var s = 0; s < 2; s++) {
      var head = el('div', 'sk sk-head');
      wrap.appendChild(head);
      var g = el('div', 'grid');
      for (var i = 0; i < 6; i++) g.appendChild(el('div', 'sk'));
      wrap.appendChild(g);
    }
    return wrap;
  }

  function errorState() {
    return stateBlock('error', t('errorTitle'), t('errorHint'), [
      { label: t('retry'), primary: true, onClick: function () { location.reload(); } }
    ]);
  }

  /* ── views / navigation ───────────────────────────────────────────────── */

  function setView(kind, folderId) {
    state.view = { kind: kind, folderId: folderId || null };
    state.q = '';
    closeSpop();
    state.sp.query = '';
    state.sp.items = [];
    nodes.searchInput.value = '';
    nodes.searchBox.classList.remove('has-value');
    nodes.app.classList.remove('is-searching');
    nodes.clearSearch.hidden = true;
    if (kind === 'folder') expandAncestors(folderId);
    closeDrawer();
    render();
    nodes.scroll.scrollTop = 0;
    announce(kind === 'folder' ? nodeById(folderId) && nodeById(folderId).title : t(kind === 'pinned' ? 'pinned' : kind === 'recent' ? 'recentVisits' : 'allBookmarks'));
  }

  function enterFolder(id) {
    if (!nodeById(id)) return;
    setView('folder', id);
  }

  function render() {
    renderSide();
    renderHeader();
    renderContent();
  }

  function announce(text) {
    if (!text) return;
    nodes.announcer.textContent = '';
    setTimeout(function () { nodes.announcer.textContent = text; }, 30);
  }

  /* ── search: engine button + results popover ──────────────────────────── */

  function currentEngine() {
    return MK.engines.byId(state.settings || {}, (state.settings || {}).searchEngine);
  }

  function renderEngineBadge() {
    var e = currentEngine();
    clear(nodes.engineBadge);
    if (!e) return;
    nodes.engineBadge.textContent = (e.name || '?').trim().charAt(0).toUpperCase();
    nodes.engineBadge.style.background = 'hsl(' + (e.hue === undefined ? 220 : e.hue) + ' 58% 46%)';
    nodes.engineBtn.title = t('searchEngine') + ' · ' + e.name;
  }

  function searchWithEngine(q) {
    var query = String(q || '').trim();
    if (!query) return;
    var e = currentEngine();
    if (!e) return;
    closeSpop();
    closeSearchMode();
    api.openUrl(MK.engines.url(e, query), 'tab').catch(function () { /* ignore */ });
  }

  /* ── engine switcher: a menu, not a dialog — one click to change engines,
     with the editing surface one floor down ─────────────────────────────── */

  function renderEngPop() {
    var wrap = nodes.engPop;
    clear(wrap);
    var cur = currentEngine();

    MK.engines.visible(state.settings).forEach(function (e) {
      var on = !!cur && cur.id === e.id;
      var row = el('button', 'engpop-row' + (on ? ' is-sel' : ''));
      row.type = 'button';
      row.setAttribute('role', 'menuitemradio');
      row.setAttribute('aria-checked', String(on));

      var badge = el('span', 'engine-badge', (e.name || '?').trim().charAt(0).toUpperCase());
      badge.style.background = 'hsl(' + (e.hue === undefined ? 220 : e.hue) + ' 58% 46%)';
      row.appendChild(badge);
      row.appendChild(el('span', 'engpop-name', e.name));
      var tick = el('span', 'engpop-tick');
      if (on) tick.appendChild(I.el('check', 14));
      row.appendChild(tick);

      row.addEventListener('click', function () { selectEngine(e.id); });
      wrap.appendChild(row);
    });

    wrap.appendChild(el('div', 'engpop-sep'));

    var manage = el('button', 'engpop-row is-manage');
    manage.type = 'button';
    manage.setAttribute('role', 'menuitem');
    manage.appendChild(I.el('gear', 14));
    manage.appendChild(el('span', 'engpop-name', t('engineManage')));
    manage.addEventListener('click', function () {
      closeEngPop();
      openEngineDialog();
    });
    wrap.appendChild(manage);
  }

  function openEngPop() {
    if (state.engineMenuOpen) return;
    closeSpop();
    renderEngPop();
    state.engineMenuOpen = true;
    nodes.engPop.hidden = false;
    nodes.engineBtn.setAttribute('aria-expanded', 'true');
  }

  function closeEngPop() {
    if (!state.engineMenuOpen) return;
    state.engineMenuOpen = false;
    nodes.engPop.hidden = true;
    nodes.engPop.textContent = '';
    nodes.engineBtn.setAttribute('aria-expanded', 'false');
  }

  function selectEngine(id) {
    var e = MK.engines.byId(state.settings, id);
    if (!e) return;
    closeEngPop();
    api.patchSettings({ searchEngine: e.id }).then(function () {
      state.settings = api.getSettings();
      renderEngineBadge();
      if (state.sp.open) renderSpop();
      nodes.searchInput.focus();
    });
  }

  function openSpop() {
    if (state.sp.open) return;
    state.sp.open = true;
    nodes.searchPop.hidden = false;
    nodes.searchInput.setAttribute('aria-expanded', 'true');
    if (isMobile()) {
      nodes.app.classList.add('is-searching');
      var b = nodes.searchBox.getBoundingClientRect();
      nodes.searchPop.style.top = Math.round(b.bottom + 6) + 'px';
    }
  }

  function closeSpop() {
    if (!state.sp.open) return;
    state.sp.open = false;
    state.sp.sel = -1;
    nodes.searchPop.hidden = true;
    nodes.searchPop.style.top = '';
    if (isMobile()) nodes.app.classList.remove('is-searching');
    nodes.searchPop.textContent = '';
    nodes.searchPop.removeAttribute('aria-activedescendant');
    nodes.searchInput.setAttribute('aria-expanded', 'false');
  }

  function spGroupLabel(kind) {
    if (kind === 'folder') return t('foldersGroup');
    if (kind === 'history') return t('historyTag');
    return t('bookmarksGroup');
  }

  function renderSpop() {
    var sp = state.sp;
    var q = sp.query;
    clear(nodes.searchPop);

    if (!q) { closeSpop(); return; }
    openSpop();

    if (!sp.items.length) {
      var empty = el('div', 'sp-empty');
      empty.appendChild(el('div', 'sp-empty-title', t('searchNoMatch')));
      empty.appendChild(el('div', 'sp-empty-hint', t('searchNoMatchHint', { q: q, name: (currentEngine() || {}).name || '' })));
      nodes.searchPop.appendChild(empty);
    } else {
      var lastKind = '';
      sp.items.forEach(function (it, i) {
        if (it.kind !== lastKind) {
          nodes.searchPop.appendChild(el('div', 'spop-group', spGroupLabel(it.kind)));
          lastKind = it.kind;
        }
        var row = el('button', 'sp-row');
        row.type = 'button';
        row.id = 'sp-opt-' + i;
        row.dataset.i = String(i);
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(i === sp.sel));
        if (i === sp.sel) row.classList.add('is-sel');

        if (it.kind === 'folder') {
          var f = el('span', 'fav is-folder');
          f.appendChild(I.el('folder', 15));
          row.appendChild(f);
        } else {
          row.appendChild(faviconTile(it.url));
        }

        var main = el('span', 'sp-main');
        var title = el('span', 'sp-title');
        appendHighlighted(title, it.title || it.url || '', q);
        main.appendChild(title);
        var sub = it.kind === 'folder' ? t('items', { n: it.count || 0 }) : (api.hostnameOf(it.url) || it.url || '');
        main.appendChild(el('span', 'sp-sub', sub));
        row.appendChild(main);

        if (it.kind === 'history') row.appendChild(el('span', 'sp-tag', t('historyTag')));

        row.addEventListener('mousedown', function (e) { e.preventDefault(); });
        row.addEventListener('click', function () { activateSp(i); });
        nodes.searchPop.appendChild(row);
      });
    }

    var foot = el('button', 'sp-foot');
    foot.type = 'button';
    foot.id = 'sp-opt-' + sp.items.length;
    foot.dataset.i = String(sp.items.length);
    foot.setAttribute('role', 'option');
    if (sp.sel === sp.items.length) foot.classList.add('is-sel');
    foot.appendChild(icon('globe', 14));
    foot.appendChild(document.createTextNode(t('searchWebWith', { q: q, name: (currentEngine() || {}).name || '' })));
    foot.addEventListener('mousedown', function (e) { e.preventDefault(); });
    foot.addEventListener('click', function () { searchWithEngine(sp.query); });
    nodes.searchPop.appendChild(foot);
  }

  function selectSp(next) {
    var max = state.sp.items.length; /* footer row is index === length */
    if (next < 0) next = 0;
    if (next > max) next = max;
    state.sp.sel = next;
    nodes.searchPop.setAttribute('aria-activedescendant', 'sp-opt-' + next);
    var rows = nodes.searchPop.querySelectorAll('.sp-row, .sp-foot');
    for (var i = 0; i < rows.length; i++) {
      var isSel = rows[i].dataset.i === String(next);
      rows[i].classList.toggle('is-sel', isSel);
      if (rows[i].classList.contains('sp-row')) rows[i].setAttribute('aria-selected', String(isSel));
      if (isSel && rows[i].scrollIntoView) rows[i].scrollIntoView({ block: 'nearest' });
    }
  }

  function activateSp(i) {
    var it = state.sp.items[i];
    if (!it) return;
    closeSearchMode();
    var q = state.sp.query;
    if (it.kind === 'folder') {
      clearSearch(false);
      enterFolder(it.id);
      return;
    }
    clearSearch(false);
    if (it.kind === 'history') openUrl(it.url, state.settings.openWith === 'current' ? 'current' : 'tab');
    else {
      var n = nodeById(it.id);
      if (n) openNode(n);
      else openUrl(it.url);
    }
    announce(it.title || q);
  }

  function commitSp() {
    if (!state.sp.open) { searchWithEngine(nodes.searchInput.value.trim()); return; }
    if (state.sp.sel >= 0 && state.sp.sel < state.sp.items.length) activateSp(state.sp.sel);
    else searchWithEngine(state.sp.query);
  }

  function runSearch(q) {
    state.sp.query = q;
    state.sp.sel = -1;
    state.searchSeq += 1;
    var seq = state.searchSeq;

    if (!q) { state.sp.items = []; closeSpop(); return; }

    api.search(q).then(function (res) {
      if (seq !== state.searchSeq) return;
      var items = [];
      res.folders.slice(0, 4).forEach(function (r) {
        items.push({ kind: 'folder', id: r.node.id, title: r.node.title, count: r.node.recCount });
      });
      res.bookmarks.slice(0, 8).forEach(function (r) {
        items.push({ kind: 'bookmark', id: r.node.id, title: r.node.title, url: r.node.url });
      });
      if (state.settings.searchHistory) {
        var lower = q.toLowerCase();
        var seen = {};
        state.history.some(function (h) {
          if (!h.url || seen[h.url]) return false;
          seen[h.url] = true;
          var hit = (h.title || '').toLowerCase().indexOf(lower) >= 0 ||
            (h.url || '').toLowerCase().indexOf(lower) >= 0;
          if (!hit) return false;
          items.push({ kind: 'history', title: h.title || h.url, url: h.url });
          return items.length >= 18;
        });
      }
      state.sp.items = items;
      renderSpop();
    }).catch(function () {
      if (seq !== state.searchSeq) return;
      state.sp.items = [];
      renderSpop();
    });
  }

  function onQueryInput() {
    var q = nodes.searchInput.value.trim();
    state.q = q;
    nodes.searchBox.classList.toggle('has-value', !!q);
    nodes.clearSearch.hidden = !q;
    runSearch(q);
  }

  function clearSearch(focus) {
    nodes.searchInput.value = '';
    state.q = '';
    state.sp.query = '';
    state.sp.items = [];
    state.searchSeq += 1;
    nodes.searchBox.classList.remove('has-value');
    nodes.clearSearch.hidden = true;
    closeSpop();
    if (focus) nodes.searchInput.focus();
  }

  function isMobile() {
    return window.matchMedia('(max-width: 860px)').matches;
  }

  function closeSearchMode() {
    nodes.app.classList.remove('is-searching');
    nodes.searchPop.style.top = '';
    clearSearch(false);
    nodes.searchInput.blur();
  }

  function focusSearch() {
    nodes.searchInput.focus();
    if (!isMobile()) nodes.searchInput.select();
  }

  /* ── open actions ─────────────────────────────────────────────────────── */

  function openNode(node, where) {
    if (!node) return;
    if (!node.url) { enterFolder(node.id); return; }
    openUrl(node.url, where || (state.settings.openWith === 'current' ? 'current' : 'tab'));
  }

  function openUrl(url, where) {
    api.openUrl(url, where).then(function () {
      api.recordOpen(url);
      state.usage = api.getUsage();
    }).catch(function (e) { openError(e, url); });
  }

  function openError(e, url) {
    var code = e && e.code;
    if (code === 'fileBlocked') {
      if (url) api.copyText(url).catch(function () {});
      toast(t('fileUrlBlocked'));
    } else if (code === 'privateBlocked') toast(t('privateBlocked'));
    else if (code === 'blocked') toast(t('bookmarkletBlocked'));
    else toast(t('permissionDenied', { what: t('openInNewTab') }));
  }

  function openFolderAll(node) {
    var urls = folderUrlList(node);
    if (!urls.length) { toast(t('emptyFolderTitle')); return; }
    api.openAll(urls, 'tab').then(function (res) {
      if (res && res.count) toast(t('items', { n: res.count }));
    }).catch(function (e) { openError(e); });
  }

  function togglePin(node) {
    var type = node.url ? 'bookmark' : 'folder';
    var exists = isPinned(type, node.id);
    var next;
    if (exists) {
      next = state.pinned.filter(function (p) { return !(p.type === type && p.id === node.id); });
    } else {
      next = state.pinned.concat([{ type: type, id: node.id }]);
    }
    state.pinned = next;
    api.setPinned(next);
    toast(t(exists ? (type === 'bookmark' ? 'bookmarkUnpinned' : 'folderUnpinned') : (type === 'bookmark' ? 'bookmarkPinned' : 'folderPinned')));
    render();
  }

  /* ── drag & drop ──────────────────────────────────────────────────────── */

  var drag = { node: null, card: null };

  function onDragStart(e, node, card) {
    if (isRoot(node)) { e.preventDefault(); return; }
    drag.node = node;
    drag.card = card;
    card.classList.add('is-dragging');
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.id);
    } catch (err) { /* ignore */ }
  }

  function onDragEnd() {
    if (drag.card) drag.card.classList.remove('is-dragging');
    drag.node = null;
    drag.card = null;
    clearDropClasses();
  }

  function clearDropClasses() {
    var all = document.querySelectorAll('.is-drop, .is-drop-before, .is-drop-after');
    for (var i = 0; i < all.length; i++) {
      all[i].classList.remove('is-drop', 'is-drop-before', 'is-drop-after');
    }
  }

  function canDrop(folderId) {
    if (!drag.node) return false;
    if (drag.node.id === folderId) return false;
    if (isAncestor(drag.node.id, folderId)) return false;
    return true;
  }

  function dropTarget(host, folderId) {
    host.addEventListener('dragover', function (e) {
      if (!canDrop(folderId)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      host.classList.add('is-drop');
    });
    host.addEventListener('dragleave', function (e) {
      if (host.contains(e.relatedTarget)) return;
      host.classList.remove('is-drop');
    });
    host.addEventListener('drop', function (e) {
      if (!canDrop(folderId)) return;
      e.preventDefault();
      var moved = drag.node;
      host.classList.remove('is-drop');
      var folder = nodeById(folderId);
      api.moveNode(moved.id, { parentId: folderId }).then(function () {
        return api.getTree(true);
      }).then(function (tree) {
        state.tree = tree;
        toast(t('movedTo', { folder: folder ? folder.title : '' }));
        render();
      }).catch(function () { toast(t('moveFailed')); });
    });
  }

  function pinnedDropTarget(card, index) {
    card.addEventListener('dragover', function (e) {
      if (!drag.node) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      var rect = card.getBoundingClientRect();
      var after = (e.clientX - rect.left) > rect.width / 2;
      card.classList.toggle('is-drop-after', after);
      card.classList.toggle('is-drop-before', !after);
    });
    card.addEventListener('dragleave', function () {
      card.classList.remove('is-drop-before', 'is-drop-after');
    });
    card.addEventListener('drop', function (e) {
      if (!drag.node) return;
      e.preventDefault();
      var rect = card.getBoundingClientRect();
      var after = (e.clientX - rect.left) > rect.width / 2;
      var type = drag.node.url ? 'bookmark' : 'folder';
      var list = state.pinned.filter(function (p) { return !(p.type === type && p.id === drag.node.id); });
      var entry = { type: type, id: drag.node.id };
      var targetIdx = state.pinned.findIndex(function (p) { return p.type === type && p.id === drag.node.id; });
      var insertAt = index + (after ? 1 : 0);
      if (targetIdx >= 0 && targetIdx < insertAt) insertAt -= 1;
      list.splice(Math.max(0, Math.min(insertAt, list.length)), 0, entry);
      state.pinned = list;
      api.setPinned(list);
      render();
    });
  }

  /* ── context menus ────────────────────────────────────────────────────── */

  function closeMenu(restore) {
    if (!state.menu) return;
    nodes.menuLayer.hidden = true;
    clear(nodes.menuLayer);
    var m = state.menu;
    state.menu = null;
    if (restore && m.trigger) {
      try { m.trigger.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }

  function openMenu(items, x, y, opts) {
    opts = opts || {};
    closeMenu(false);
    nodes.menuLayer.hidden = false;
    var m = el('div', 'menu');
    m.setAttribute('role', 'menu');
    m.setAttribute('aria-label', opts.label || t('moreActions'));

    items.forEach(function (item) {
      if (item.sep) { m.appendChild(el('div', 'menu-sep')); return; }
      if (item.group) { m.appendChild(el('div', 'menu-label', item.group)); return; }
      var b = el('button', 'menu-item' + (item.danger ? ' is-danger' : ''));
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      if (item.icon) b.appendChild(icon(item.icon, 15));
      b.appendChild(el('span', null, item.label));
      if (item.hint) b.appendChild(el('span', 'menu-hint', item.hint));
      if (item.checked) {
        var chk = el('span', 'menu-check');
        chk.appendChild(I.el('checkSmall', 14));
        b.appendChild(chk);
      }
      b.addEventListener('click', function () {
        closeMenu(true);
        setTimeout(item.onClick, 0);
      });
      m.appendChild(b);
    });

    nodes.menuLayer.appendChild(m);
    var rect = m.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var left = Math.min(Math.max(8, x), vw - rect.width - 8);
    var top = Math.min(Math.max(8, y), vh - rect.height - 8);
    m.style.left = left + 'px';
    m.style.top = top + 'px';

    m.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      var list = Array.prototype.slice.call(m.querySelectorAll('.menu-item'));
      var at = list.indexOf(document.activeElement);
      var next = e.key === 'ArrowDown'
        ? (at + 1) % list.length
        : (at <= 0 ? list.length - 1 : at - 1);
      if (list[next]) list[next].focus();
    });

    state.menu = { trigger: opts.trigger || null };
    var first = m.querySelector('.menu-item');
    if (first && opts.focus !== false) first.focus();
  }

  function menuAt(trigger, items, opts) {
    var rect = trigger.getBoundingClientRect();
    openMenu(items, rect.left, rect.bottom + 6, Object.assign({ trigger: trigger }, opts || {}));
  }

  function openNodeMenu(node, x, y, trigger) {
    var isFolder = !node.url;
    var pinType = isFolder ? 'folder' : 'bookmark';
    var pinned = isPinned(pinType, node.id);
    var items = [];

    if (isFolder) {
      items.push({ label: t('openFolder'), icon: 'folderOpen', onClick: function () { enterFolder(node.id); } });
      items.push({ label: t('openAllNewTab', { n: node.recCount }), icon: 'external', onClick: function () { openFolderAll(node); } });
    } else {
      items.push({ label: t('openInNewTab'), icon: 'external', hint: 'Enter', onClick: function () { openNode(node, 'tab'); } });
      items.push({ label: t('openInNewWindow'), icon: 'window', onClick: function () { openNode(node, 'window'); } });
      items.push({ label: t('openInPrivate'), icon: 'mask', onClick: function () { openNode(node, 'private'); } });
    }
    items.push({ sep: true });
    items.push({
      label: pinned ? t('unpin') : t('pin'), icon: pinned ? 'pinOff' : 'pin',
      onClick: function () { togglePin(node); }
    });
    if (!isFolder) {
      items.push({ label: t('copyUrl'), icon: 'copy', onClick: function () { copyUrl(node.url); } });
      items.push({ label: t('qrCode'), icon: 'qr', onClick: function () { openQr(node.url, node.title); } });
    }
    items.push({ label: isFolder ? t('rename') : t('edit'), icon: 'pencil', onClick: function () {
      if (isFolder) openFolderDialog(node); else openBookmarkDialog(node);
    } });
    items.push({ sep: true });
    items.push({ label: t('delete'), icon: 'trash', danger: true, onClick: function () { confirmDelete(node); } });

    if (x === undefined) menuAt(trigger, items, { label: isFolder ? t('folderMenu') : t('itemMenu') });
    else openMenu(items, x, y, { trigger: trigger, label: isFolder ? t('folderMenu') : t('itemMenu') });
  }

  function openHistoryMenu(h, x, y) {
    openMenu([
      { label: t('openInNewTab'), icon: 'external', onClick: function () { openUrl(h.url, 'tab'); } },
      { label: t('copyUrl'), icon: 'copy', onClick: function () { copyUrl(h.url); } },
      { sep: true },
      { label: t('addBookmark'), icon: 'bookmarkPlus', onClick: function () {
        openBookmarkDialog({ id: null, title: h.title, url: h.url, parentId: null });
      } }
    ], x, y, { label: t('historyGroup') });
  }

  function openSortMenu(trigger) {
    var keys = ['default', 'name', 'added', 'usage'];
    var labels = { default: t('sortDefault'), name: t('sortName'), added: t('sortAdded'), usage: t('sortUsage') };
    menuAt(trigger, keys.map(function (k) {
      return {
        label: labels[k], checked: state.settings.sortKey === k, onClick: function () {
          api.patchSettings({ sortKey: k }).then(function () {
            state.settings = api.getSettings();
            updateSortLabel();
            render();
          });
        }
      };
    }), { label: t('sort') });
  }

  function openAddMenu(trigger) {
    menuAt(trigger, [
      { label: t('addBookmark'), icon: 'bookmarkPlus', hint: 'N', onClick: function () { openBookmarkDialog(null); } },
      { label: t('addFolder'), icon: 'folderPlus', onClick: function () { openFolderDialog(null); } },
      { sep: true },
      { label: t('settings'), icon: 'gear', hint: MOD + ' ,', onClick: openSettings }
    ], { label: t('add') });
  }

  function openThemeMenu(trigger) {
    var themes = [
      { k: 'system', label: t('systemTheme'), icon: 'monitor' },
      { k: 'light', label: t('lightTheme'), icon: 'sun' },
      { k: 'dark', label: t('darkTheme'), icon: 'moon' }
    ];
    menuAt(trigger, themes.map(function (th) {
      return {
        label: th.label, icon: th.icon, checked: state.settings.theme === th.k,
        onClick: function () {
          api.patchSettings({ theme: th.k }).then(function () {
            state.settings = api.getSettings();
            applyTheme();
            render();
          });
        }
      };
    }), { label: t('theme') });
  }

  function updateSortLabel() {
    var labels = { default: t('sortDefault'), name: t('sortName'), added: t('sortAdded'), usage: t('sortUsage') };
    nodes.sortLabel.textContent = labels[state.settings.sortKey] || labels.default;
  }

  /* ── dialogs ──────────────────────────────────────────────────────────── */

  function openDialog(opts) {
    var dlg = nodes.dlg;
    nodes.dlgTitle.textContent = opts.title || '';
    dlg.dataset.size = opts.size || '';
    dlg.onkeydown = null;
    clear(nodes.dlgBody);
    clear(nodes.dlgFoot);
    if (opts.body) nodes.dlgBody.appendChild(opts.body);
    (opts.actions || []).forEach(function (a) {
      var b = el('button', 'btn' + (a.primary ? ' is-primary' : '') + (a.danger ? ' is-danger' : ''), a.label);
      b.type = 'button';
      b.addEventListener('click', a.onClick);
      nodes.dlgFoot.appendChild(b);
    });
    if (opts.footerClass) nodes.dlgFoot.className = 'dlg-foot ' + opts.footerClass;
    else nodes.dlgFoot.className = 'dlg-foot';

    if (!dlg.open) dlg.showModal();
    var focusTarget = nodes.dlgBody.querySelector('input, select, textarea, button') ||
      nodes.dlgFoot.querySelector('button');
    if (focusTarget) setTimeout(function () { try { focusTarget.focus(); } catch (e) {} }, 20);
  }

  function closeDialog() {
    nodes.dlg.onkeydown = null;
    if (nodes.dlg.open) nodes.dlg.close();
  }

  function field(labelKey, input, hint) {
    var wrap = el('div', 'field');
    var lab = el('label', 'field-label', t(labelKey));
    var id = 'f_' + Math.random().toString(36).slice(2, 7);
    input.id = id;
    lab.htmlFor = id;
    wrap.appendChild(lab);
    wrap.appendChild(input);
    if (hint) wrap.appendChild(el('p', 'field-hint', hint));
    return wrap;
  }

  function textInput(value, placeholderKey) {
    var input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
    if (placeholderKey) input.placeholder = t(placeholderKey);
    input.maxLength = 400;
    input.autocomplete = 'off';
    return input;
  }

  function folderSelect(selectedId) {
    var wrap = el('div', 'select-wrap');
    var sel = document.createElement('select');
    function addOption(id, label, depth) {
      var o = document.createElement('option');
      o.value = id;
      o.textContent = (depth ? '\u00A0\u00A0'.repeat(depth) + '› ' : '') + label;
      if (id === selectedId) o.selected = true;
      sel.appendChild(o);
    }
    state.tree.roots.forEach(function (root) {
      addOption(root.id, root.title, 0);
      (function walk(n, d) {
        n.children.forEach(function (c) {
          if (c.url) return;
          addOption(c.id, c.title, d);
          walk(c, d + 1);
        });
      })(root, 1);
    });
    wrap.appendChild(sel);
    var chev = el('span', 'select-chev');
    chev.appendChild(I.el('chevronDown', 12));
    wrap.appendChild(chev);
    return { wrap: wrap, select: sel };
  }

  function defaultFolderId() {
    var ui = api.getUI() || {};
    var candidates = [];
    if (state.view.kind === 'folder') candidates.push(state.view.folderId);
    candidates.push(ui.lastCreateFolderId, state.settings.lastFolderId);
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] && nodeById(candidates[i])) return candidates[i];
    }
    var unfiled = state.tree.roots.filter(function (r) { return r.rootKey === 'unfiled'; })[0];
    return unfiled ? unfiled.id : (state.tree.roots[0] && state.tree.roots[0].id) || null;
  }

  function openBookmarkDialog(node, parentId) {
    var editing = !!(node && node.id);
    var title = textInput(editing ? node.title : '', 'titleHint');
    var url = textInput(editing ? node.url : '', 'urlHint');
    url.inputMode = 'url';
    url.spellcheck = false;
    var folder = folderSelect(parentId || (editing ? node.parentId : defaultFolderId()));
    var body = el('div');
    body.appendChild(field('titleLabel', title));
    body.appendChild(field('urlLabel', url, null));
    body.appendChild(field('folderLabel', folder.wrap));

    var err = el('p', 'field-hint');
    err.style.color = 'var(--danger)';
    err.hidden = true;
    body.appendChild(err);

    function submit() {
      var raw = url.value.trim();
      var norm;
      try { norm = api.normalizeUrl(raw); } catch (e) { norm = { ok: false, reason: 'blocked' }; }
      if (!norm || !norm.ok) {
        err.textContent = norm && norm.reason === 'blocked' ? t('bookmarkletBlocked') : t('bookmarkletBlocked');
        err.hidden = false;
        url.setAttribute('aria-invalid', 'true');
        url.focus();
        return;
      }
      var finalTitle = title.value.trim() || api.hostnameOf(norm.url) || norm.url;
      var pid = folder.select.value;
      var done = function () {
        closeDialog();
        toast(t('saved'));
        refreshTree();
        var ui = api.getUI() || {};
        ui.lastCreateFolderId = pid;
        api.setUI(ui);
        api.patchSettings({ lastFolderId: pid });
      };
      if (editing) {
        api.updateBookmark(node.id, { title: finalTitle, url: norm.url }).then(function () {
          if (node.parentId !== pid) return api.moveNode(node.id, { parentId: pid });
          return null;
        }).then(done).catch(function (e) { failSave(e, err); });
      } else {
        api.createBookmark({ parentId: pid, title: finalTitle, url: norm.url }).then(done)
          .catch(function (e) { failSave(e, err); });
      }
    }

    function failSave(e, errNode) {
      errNode.textContent = t('saveFailed', { what: (e && e.code) === 'permission' ? t('permissionDenied', { what: t('folder') }) : String(e && e.message || '') });
      errNode.hidden = false;
    }

    openDialog({
      title: editing ? t('editBookmarkTitle') : t('addBookmarkTitle'),
      body: body,
      actions: [
        { label: t('cancel'), onClick: closeDialog },
        { label: editing ? t('save') : t('addBookmark'), primary: true, onClick: submit }
      ]
    });

    nodes.dlg.onkeydown = function (e) {
      if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') {
        e.preventDefault();
        submit();
      }
    };
    setTimeout(function () { title.focus(); title.select(); }, 30);
  }

  function openFolderDialog(node, parentId) {
    var editing = !!(node && node.id);
    var name = textInput(editing ? node.title : '', 'nameHint');
    var body = el('div');
    body.appendChild(field('nameLabel', name));
    if (!editing && parentId) {
      var parent = nodeById(parentId);
      if (parent) body.appendChild(el('p', 'field-hint', t('folderLabel') + '：' + parent.title));
    }
    var err = el('p', 'field-hint');
    err.style.color = 'var(--danger)';
    err.hidden = true;
    body.appendChild(err);

    function submit() {
      var value = name.value.trim();
      if (!value) { name.focus(); return; }
      if (editing) {
        api.updateFolder(node.id, { title: value }).then(function () {
          closeDialog();
          refreshTree();
        }).catch(function () { err.textContent = t('saveFailed', { what: value }); err.hidden = false; });
      } else {
        var pid = parentId || (state.view.kind === 'folder' ? state.view.folderId : defaultFolderId());
        api.createFolder({ parentId: pid, title: value }).then(function (id) {
          state.expanded[pid] = true;
          closeDialog();
          refreshTree().then(function () {
            toast(t('saved'));
            enterFolder(id);
          });
        }).catch(function () { err.textContent = t('saveFailed', { what: value }); err.hidden = false; });
      }
    }

    openDialog({
      title: editing ? t('renameFolderTitle') : t('addFolderTitle'),
      body: body,
      actions: [
        { label: t('cancel'), onClick: closeDialog },
        { label: t('save'), primary: true, onClick: submit }
      ]
    });
    nodes.dlg.onkeydown = function (e) {
      if (e.key === 'Enter' && e.target === name) { e.preventDefault(); submit(); }
    };
    setTimeout(function () { name.focus(); name.select(); }, 30);
  }

  function confirmDelete(node) {
    var isFolder = !node.url;
    var body = el('div');
    body.appendChild(el('p', 'set-about', t(isFolder ? 'deleteFolderDesc' : 'deleteBookmarkDesc', { name: node.title })));
    openDialog({
      title: t(isFolder ? 'deleteFolderTitle' : 'deleteBookmarkTitle'),
      body: body,
      actions: [
        { label: t('cancel'), onClick: closeDialog },
        {
          label: t('delete'), danger: true, onClick: function () {
            closeDialog();
            deleteNode(node);
          }
        }
      ]
    });
  }

  function deleteNode(node) {
    var isFolder = !node.url;
    var pinType = isFolder ? 'folder' : 'bookmark';
    var pinIndex = state.pinned.findIndex(function (p) { return p.type === pinType && p.id === node.id; });
    var snap = isFolder ? null : {
      parentId: node.parentId,
      index: node.index,
      title: node.title,
      url: node.url,
      dateAdded: node.dateAdded
    };
    api.removeNode(node.id).then(function () {
      state.pinned = state.pinned.filter(function (p) { return p.id !== node.id; });
      api.setPinned(state.pinned);
      if (isFolder) {
        toast(t('deletedFolder'));
      } else {
        toast(t('deletedBookmark'), {
          action: {
            label: t('undo'),
            run: function () {
              api.createBookmark({ parentId: snap.parentId, index: snap.index, title: snap.title, url: snap.url })
                .then(function (id) {
                  if (pinIndex >= 0) {
                    state.pinned = state.pinned.slice();
                    state.pinned.splice(Math.min(pinIndex, state.pinned.length), 0, { type: 'bookmark', id: id });
                    api.setPinned(state.pinned);
                  }
                  refreshTree();
                  toast(t('restored'));
                })
                .catch(function () { toast(t('saveFailed', { what: snap.title })); });
            }
          }
        });
      }
      if (state.view.kind === 'folder' && state.view.folderId === node.id) state.view = { kind: 'all', folderId: null };
      refreshTree();
    }).catch(function () { toast(t('saveFailed', { what: node.title })); });
  }

  function openQr(url, title) {
    var body = el('div');
    var wrap = el('div', 'qr-wrap');
    var card = el('div', 'qr-card');
    var canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 420;
    card.appendChild(canvas);
    wrap.appendChild(card);
    wrap.appendChild(el('div', 'qr-url', url));
    wrap.appendChild(el('p', 'qr-hint', t('qrHint')));
    body.appendChild(wrap);

    var ok = false;
    try { ok = MK.qr.render(canvas, url, 8); } catch (e) { ok = false; }
    if (!ok) {
      clear(wrap);
      wrap.appendChild(el('p', 'state-desc', t('saveFailed', { what: t('qrCode') })));
    }

    openDialog({
      title: t('qrTitle'),
      body: body,
      footerClass: 'is-center',
      actions: [
        { label: t('copyLink'), onClick: function () { copyUrl(url); } },
        {
          label: t('downloadQr'), primary: true, onClick: function () {
            MK.qr.download(canvas, 'tabmark-' + (api.hostnameOf(url) || 'link')).then(function () {
              toast(t('saved'));
            }).catch(function () { toast(t('saveFailed', { what: t('downloadQr') })); });
          }
        }
      ]
    });
  }

  function copyUrl(url) {
    api.copyText(url).then(function () { toast(t('copied')); })
      .catch(function () { toast(t('copyFailed')); });
  }

  /* ── settings ─────────────────────────────────────────────────────────── */

  function seg(options, current, onPick) {
    var wrap = el('div', 'seg');
    options.forEach(function (o) {
      var b = el('button', null, o.label);
      b.type = 'button';
      b.dataset.value = o.value;
      b.classList.toggle('is-on', o.value === current);
      b.addEventListener('click', function () {
        syncSeg(wrap, o.value);
        onPick(o.value);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function syncSeg(wrap, value) {
    var list = wrap.querySelectorAll('button');
    for (var i = 0; i < list.length; i++) {
      list[i].classList.toggle('is-on', list[i].dataset.value === value);
    }
  }

  function toggle(on, onChange) {
    var b = el('button', 'switch');
    b.type = 'button';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.addEventListener('click', function () {
      var next = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', next ? 'true' : 'false');
      onChange(next);
    });
    return b;
  }

  function setRow(name, desc, control) {
    var row = el('div', 'set-row');
    var text = el('div', 'set-text');
    text.appendChild(el('div', 'set-name', name));
    if (desc) text.appendChild(el('div', 'set-desc', desc));
    row.appendChild(text);
    var c = el('div', 'set-control');
    c.appendChild(control);
    row.appendChild(c);
    return row;
  }

  function patch(p, after) {
    api.patchSettings(p).then(function () {
      state.settings = api.getSettings();
      if (after) after();
    });
  }

  /* ── search engines ───────────────────────────────────────────────────── */

  function saveEngines(list, extra) {
    /* list === null means "forget the custom list", which makes settings.engines
       null again and lets MK.engines fall back to the built-in table — so a
       future build can add engines without the user being stuck on a snapshot */
    var patchObj = { engines: list };
    if (extra) Object.keys(extra).forEach(function (k) { patchObj[k] = extra[k]; });
    return api.patchSettings(patchObj).then(function () {
      return api.flushSettings();
    }).then(function () {
      state.settings = api.getSettings();
      renderEngineBadge();
    });
  }

  function openEngineDialog() {
    var body = el('div');

    function rebuild() {
      clear(body);
      var list = MK.engines.list(state.settings);

      var wrap = el('div', 'eng-list');
      var dragFrom = -1;

      list.forEach(function (eng, idx) {
        var row = el('div', 'eng-row' + (eng.hidden ? ' is-hidden' : ''));
        row.dataset.id = eng.id;
        row.draggable = true;

        var grip = el('span', 'eng-grip');
        grip.appendChild(I.el('grip', 14));
        row.appendChild(grip);

        var badge = el('span', 'engine-badge', (eng.name || '?').trim().charAt(0).toUpperCase());
        badge.style.background = 'hsl(' + (eng.hue === undefined ? 220 : eng.hue) + ' 58% 46%)';
        row.appendChild(badge);

        row.appendChild(el('span', 'eng-name', eng.name));

        var actions = el('div', 'eng-actions');

        var eye = el('button', 'icon-btn');
        eye.type = 'button';
        eye.title = eng.hidden ? t('engineShow') : t('engineHide');
        eye.setAttribute('aria-label', eye.title);
        eye.appendChild(I.el(eng.hidden ? 'eyeOff' : 'eye', 15));
        eye.addEventListener('click', function () {
          var next = MK.engines.list(state.settings).map(function (x) {
            return x.id === eng.id ? Object.assign({}, x, { hidden: !x.hidden }) : x;
          });
          var vis = next.filter(function (x) { return !x.hidden; });
          if (!vis.length) { toast(t('engineKeepOne')); return; }
          saveEngines(next).then(function () {
            if (eng.id === state.settings.searchEngine && eng.hidden !== true) {
              /* hide the active one → switch to the first still visible */
              return saveEngines(next, { searchEngine: vis[0].id });
            }
            return null;
          }).then(rebuild);
        });
        actions.appendChild(eye);

        var del = el('button', 'icon-btn');
        del.type = 'button';
        del.title = t('engineDelete');
        del.setAttribute('aria-label', del.title);
        del.appendChild(I.el('trash', 15));
        del.addEventListener('click', function () {
          var cur = MK.engines.list(state.settings);
          if (cur.length <= 1) { toast(t('engineKeepOne')); return; }
          var next = cur.filter(function (x) { return x.id !== eng.id; });
          var extra = state.settings.searchEngine === eng.id
            ? { searchEngine: (next.filter(function (x) { return !x.hidden; })[0] || next[0]).id }
            : null;
          saveEngines(next, extra).then(function () {
            toast(t('engineRemoved'));
            rebuild();
          });
        });
        actions.appendChild(del);
        row.appendChild(actions);

        /* the row itself is the "use this engine" affordance — the eye and
           trash buttons stay on top of it */
        if (state.settings.searchEngine === eng.id) {
          row.classList.add('is-current');
          var tick = el('span', 'eng-tick');
          tick.appendChild(I.el('check', 14));
          row.insertBefore(tick, actions);
        }
        row.addEventListener('click', function (e) {
          if (e.target.closest('.eng-actions')) return;
          if (state.settings.searchEngine === eng.id) return;
          saveEngines(MK.engines.list(state.settings), { searchEngine: eng.id }).then(function () {
            renderEngineBadge();
            rebuild();
          });
        });

        row.addEventListener('dragstart', function (e) {
          dragFrom = idx;
          row.classList.add('is-dragging');
          try { e.dataTransfer.setData('text/plain', eng.id); } catch (err) { /* ignore */ }
          e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', function () { row.classList.remove('is-dragging'); });
        row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('is-drop'); });
        row.addEventListener('dragleave', function () { row.classList.remove('is-drop'); });
        row.addEventListener('drop', function (e) {
          e.preventDefault();
          row.classList.remove('is-drop');
          if (dragFrom < 0 || dragFrom === idx) return;
          var next = MK.engines.list(state.settings);
          var moved = next.splice(dragFrom, 1)[0];
          next.splice(idx, 0, moved);
          dragFrom = -1;
          saveEngines(next).then(rebuild);
        });

        wrap.appendChild(row);
      });
      body.appendChild(wrap);

      var add = el('button', 'eng-add');
      add.type = 'button';
      add.appendChild(icon('plus', 14));
      add.appendChild(document.createTextNode(t('engineAdd')));
      add.addEventListener('click', function () { body.appendChild(engineForm(rebuild)); add.hidden = true; });
      body.appendChild(add);
    }

    rebuild();
    openDialog({
      title: t('enginesTitle'),
      size: 'md',
      body: body,
      actions: [
        {
          label: t('engineRestore'),
          onClick: function () {
            saveEngines(null, { searchEngine: 'google' }).then(function () {
              openEngineDialog();
            });
          }
        },
        { label: t('done'), primary: true, onClick: closeDialog }
      ]
    });
  }

  function engineForm(onDone) {
    var form = el('div', 'eng-form');
    var name = textInput('', 'engineNamePh');
    var url = textInput('', 'engineUrlPh');
    url.inputMode = 'url';
    url.spellcheck = false;
    form.appendChild(field('engineNameLabel', name));
    form.appendChild(field('engineUrlLabel', url));
    form.appendChild(el('p', 'field-hint', t('engineUrlHint')));

    var save = el('button', 'btn is-primary', t('save'));
    save.type = 'button';
    save.addEventListener('click', function () {
      var n = name.value.trim();
      var u = url.value.trim();
      if (!n || u.indexOf('%s') < 0) { toast(t('engineInvalid')); url.focus(); return; }
      var list = MK.engines.list(state.settings);
      list.push({ id: 'custom-' + Date.now(), name: n, url: u, hue: 220, hidden: false });
      saveEngines(list).then(function () {
        toast(t('engineAdded'));
        onDone();
      });
    });
    form.appendChild(save);
    setTimeout(function () { name.focus(); }, 30);
    return form;
  }

  /* ── organize panel ───────────────────────────────────────────────────── */

  function downloadJson(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function orgRow(iconName, name, desc, control) {
    var row = el('div', 'org-row');
    var ico = el('div', 'org-ico');
    ico.appendChild(I.el(iconName, 16));
    row.appendChild(ico);
    var main = el('div', 'org-main');
    main.appendChild(el('div', 'org-name', name));
    main.appendChild(el('div', 'org-desc', desc));
    row.appendChild(main);
    var side = el('div', 'org-side');
    if (control) side.appendChild(control);
    row.appendChild(side);
    return row;
  }

  function openOrganizeDialog() {
    var body = el('div', 'org-list');

    var hint = el('div', 'org-hint');
    hint.appendChild(icon('shield', 14));
    hint.appendChild(el('span', null, t('organizeUndoHint')));
    body.appendChild(hint);

    /* 1 · backup */
    var backupBtn = el('button', 'btn', t('organizeBackupRun'));
    backupBtn.type = 'button';
    var backupNote = el('div', 'org-note');
    var didBackup = false;
    backupBtn.addEventListener('click', function () {
      backupBtn.disabled = true;
      api.snapshot().then(function (data) {
        var stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        downloadJson('tabmark-bookmarks-' + stamp + '.json', JSON.stringify(data, null, 2));
        didBackup = true;
        backupNote.className = 'org-note is-good';
        backupNote.textContent = t('organizeBackupDone', { n: data.nodeCount });
      }).catch(function () {
        backupNote.className = 'org-note is-warn';
        backupNote.textContent = t('permissionDenied', { what: 'bookmarks' });
      }).then(function () { backupBtn.disabled = false; });
    });
    var backupRow = orgRow('download', t('organizeBackup'), t('organizeBackupDesc'), backupBtn);
    backupRow.querySelector('.org-main').appendChild(backupNote);
    body.appendChild(backupRow);

    /* 2 · duplicates */
    var dupNote = el('div', 'org-note');
    var dupBtn = el('button', 'btn', t('organizeDupScan'));
    dupBtn.type = 'button';
    var dupFix = el('button', 'btn', t('organizeDupFix', { n: 0 }));
    dupFix.type = 'button';
    dupFix.hidden = true;
    var dupWrap = el('div');
    var groups = [];

    dupBtn.addEventListener('click', function () {
      dupBtn.disabled = true;
      api.findDuplicates().then(function (list) {
        groups = list;
        clear(dupWrap);
        dupFix.hidden = true;
        if (!list.length) {
          dupNote.className = 'org-note is-good';
          dupNote.textContent = t('organizeDupNone');
          return;
        }
        var extra = list.reduce(function (n, g) { return n + g.items.length - 1; }, 0);
        dupNote.className = 'org-note is-warn';
        dupNote.textContent = t('organizeDupFound', { n: list.length, m: list.reduce(function (a, g) { return a + g.items.length; }, 0) });

        var listEl = el('div', 'org-dup-list');
        list.slice(0, 6).forEach(function (g) {
          g.items.forEach(function (item, i) {
            var row = el('div', 'org-dup-item');
            row.appendChild(el('span', 'org-dup-host', api.hostnameOf(g.url) || ''));
            row.appendChild(el('span', 'org-dup-title', item.title || item.url));
            if (i === 0) row.appendChild(el('span', 'org-keep', t('organizeDup')));
            listEl.appendChild(row);
          });
        });
        dupWrap.appendChild(listEl);

        dupFix.textContent = t('organizeDupFix', { n: extra });
        dupFix.hidden = false;
        dupFix.dataset.count = String(extra);
      }).catch(function () {
        dupNote.className = 'org-note is-warn';
        dupNote.textContent = t('permissionDenied', { what: 'bookmarks' });
      }).then(function () { dupBtn.disabled = false; });
    });

    dupFix.addEventListener('click', function () {
      if (!didBackup) { toast(t('organizeDupFirst')); return; }
      var ids = [];
      groups.forEach(function (g) {
        g.items.slice(1).forEach(function (item) { ids.push(item.id); });
      });
      if (!ids.length) return;
      api.removeMany(ids).then(function (failed) {
        var done = ids.length - failed.length;
        dupNote.className = 'org-note is-good';
        dupNote.textContent = t('organizeDupDone', { n: done });
        clear(dupWrap);
        dupFix.hidden = true;
        groups = [];
        refreshTree();
      });
    });

    var dupRow = orgRow('copy', t('organizeDup'), t('organizeDupDesc'), dupBtn);
    var dupMain = dupRow.querySelector('.org-main');
    dupMain.appendChild(dupNote);
    dupMain.appendChild(dupFix);
    dupMain.appendChild(dupWrap);
    body.appendChild(dupRow);

    /* 3 · icons */
    var iconNote = el('div', 'org-note');
    var iconBtn = el('button', 'btn', t('organizeIconsRun'));
    iconBtn.type = 'button';
    iconBtn.addEventListener('click', function () {
      iconBtn.disabled = true;
      api.harvestTabIcons().then(function (n) {
        iconNote.className = n ? 'org-note is-good' : 'org-note';
        iconNote.textContent = n ? t('organizeIconsDone', { n: n }) : t('organizeIconsNone');
        if (n) render();
      }).catch(function () {
        iconNote.textContent = t('permissionDenied', { what: 'tabs' });
      }).then(function () { iconBtn.disabled = false; });
    });
    var iconRow = orgRow('image', t('organizeIcons'), t('organizeIconsDesc'), iconBtn);
    var iconMain = iconRow.querySelector('.org-main');
    iconMain.appendChild(iconNote);
    var remoteRow = el('label', 'org-desc');
    remoteRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;cursor:pointer';
    remoteRow.appendChild(toggle(!!state.settings.faviconRemote, function (on) {
      patch({ faviconRemote: on }, function () {
        render();
        iconNote.className = 'org-note';
        iconNote.textContent = on ? t('organizeRemoteDesc') : '';
      });
    }));
    remoteRow.appendChild(el('span', null, t('organizeRemote')));
    iconMain.appendChild(remoteRow);
    iconMain.appendChild(el('div', 'org-desc', t('organizeRemoteDesc')));
    body.appendChild(iconRow);

    /* 4 · clean up */
    var cleanNote = el('div', 'org-note');
    var cleanBtn = el('button', 'btn', t('organizeCleanRun'));
    cleanBtn.type = 'button';
    cleanBtn.addEventListener('click', function () {
      cleanBtn.disabled = true;
      api.findIssues().then(function (issues) {
        var total = issues.emptyFolders.length + issues.untitled.length;
        if (!total) {
          cleanNote.className = 'org-note is-good';
          cleanNote.textContent = t('organizeCleanNone');
          return null;
        }
        var renames = issues.untitled.map(function (b) {
          return api.updateBookmark(b.id, { title: api.hostnameOf(b.url) || b.url });
        });
        return Promise.all(renames).then(function () {
          return api.removeMany(issues.emptyFolders.map(function (f) { return f.id; }));
        }).then(function (failed) {
          var done = total - failed.length;
          cleanNote.className = 'org-note is-good';
          cleanNote.textContent = t('organizeCleanDone', { n: done });
          refreshTree();
        });
      }).catch(function () {
        cleanNote.className = 'org-note is-warn';
        cleanNote.textContent = t('permissionDenied', { what: 'bookmarks' });
      }).then(function () { cleanBtn.disabled = false; });
    });
    var cleanRow = orgRow('broom', t('organizeClean'), t('organizeCleanDesc'), cleanBtn);
    cleanRow.querySelector('.org-main').appendChild(cleanNote);
    body.appendChild(cleanRow);

    openDialog({
      title: t('organizeTitle'),
      size: 'md',
      body: body,
      actions: [{ label: t('done'), primary: true, onClick: closeDialog }]
    });
  }

  /* ── wallpaper ────────────────────────────────────────────────────────── */

  var GRADIENTS = [
    { id: 'dawn', css: 'linear-gradient(135deg,#f7dcc8 0%,#e7b2a5 44%,#b9c0e8 100%)', lum: 205 },
    { id: 'mint', css: 'linear-gradient(155deg,#d9f0e3 0%,#b9dbe9 52%,#a9b8e0 100%)', lum: 205 },
    { id: 'dusk', css: 'linear-gradient(140deg,#3a3958 0%,#655a79 46%,#a4758a 100%)', lum: 95 },
    { id: 'slate', css: 'linear-gradient(150deg,#e9ecef 0%,#cfd6dc 58%,#b4bec6 100%)', lum: 213 },
    { id: 'lilac', css: 'linear-gradient(150deg,#efe6f8 0%,#d8cdf0 54%,#c1c9ee 100%)', lum: 218 },
    { id: 'sand', css: 'linear-gradient(150deg,#f8f0e0 0%,#eaddc6 54%,#dcc9ab 100%)', lum: 225 }
  ];

  function wallpaperValue() {
    var w = (state.settings && state.settings.wallpaper) || {};
    return {
      kind: w.kind || 'none', value: w.value || '',
      dim: typeof w.dim === 'number' ? w.dim : 0,
      ink: w.ink || 'auto',
      inkColor: w.inkColor || '#f2f2f4'
    };
  }

  /* is the effective theme dark? (explicit or system) */
  function themeIsDark() {
    var t = state.settings.theme;
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /* decide light or dark text over the wallpaper: user pick wins, else
     auto = light text when the wallpaper itself is dark OR the theme is dark */
  function wallpaperInk(w) {
    if (w.ink === 'light' || w.ink === 'dark' || w.ink === 'custom') return w.ink;
    if (themeIsDark()) return 'light';
    if (w.kind === 'gradient') {
      var g = GRADIENTS.filter(function (x) { return x.id === w.value; })[0];
      return (g && g.lum < 150) ? 'light' : 'dark';
    }
    if (w.kind === 'image') {
      /* 自选图常有局部亮斑，均值偏高但暗区占比大 —— 阈值从严 */
      return (typeof w.imgLum === 'number' && w.imgLum < 168) ? 'light' : 'dark';
    }
    return 'dark';
  }

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return { r: 242, g: 242, b: 244 };
    var n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function sampleImageLuminance(url, cb) {
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 8, 8);
        var d = ctx.getImageData(0, 0, 8, 8).data;
        var sum = 0;
        for (var i = 0; i < d.length; i += 4) {
          sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        }
        cb(Math.round(sum / (d.length / 4)));
      } catch (e) { cb(160); }
    };
    img.onerror = function () { cb(160); };
    img.src = url;
  }

  function applyAppearance() {
    var st = state.settings;
    nodes.app.style.setProperty('--font-scale', String(st.fontScale || 1));
    nodes.app.style.setProperty('--width-scale', String(st.widthScale || 1));
    nodes.app.classList.toggle('no-anim', !!st.noAnim);
  }

  function applyWallpaper() {
    var w = wallpaperValue();
    var on = w.kind === 'gradient' || w.kind === 'image';
    nodes.app.classList.toggle('is-wall', on);
    var ink = on ? wallpaperInk(w) : (themeIsDark() ? 'light' : 'dark');
    nodes.app.classList.toggle('ink-light', on && ink === 'light');
    nodes.app.classList.toggle('ink-dark', on && ink === 'dark');
    nodes.app.classList.toggle('ink-custom', on && ink === 'custom');
    if (on && ink === 'custom') {
      var c = hexToRgb(w.inkColor);
      nodes.app.style.setProperty('--wall-ink-1', w.inkColor);
      nodes.app.style.setProperty('--wall-ink-2', 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.82)');
      nodes.app.style.setProperty('--wall-ink-3', 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.55)');
    } else {
      nodes.app.style.removeProperty('--wall-ink-1');
      nodes.app.style.removeProperty('--wall-ink-2');
      nodes.app.style.removeProperty('--wall-ink-3');
    }
    nodes.wall.style.setProperty('--wall-dim', String(w.dim || 0));
    if (!on) { nodes.wall.style.backgroundImage = 'none'; return; }
    if (w.kind === 'gradient') {
      var g = GRADIENTS.filter(function (x) { return x.id === w.value; })[0] || GRADIENTS[0];
      nodes.wall.style.backgroundImage = g.css;
      return;
    }
    api.getWallpaperImage().then(function (url) {
      if (!url) { nodes.app.classList.remove('is-wall'); return; }
      nodes.wall.style.backgroundImage = 'url("' + url + '")';
      if (w.ink === 'auto' && typeof w.imgLum !== 'number') {
        sampleImageLuminance(url, function (lum) {
          state.settings.wallpaper.imgLum = lum;
          applyWallpaper();
        });
      }
    });
  }

  function readImageFile(file, cb, fail) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { fail(); return; }
    var reader = new FileReader();
    reader.onerror = fail;
    reader.onload = function () {
      var img = new Image();
      img.onerror = fail;
      img.onload = function () {
        var max = 2560;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var out = canvas.toDataURL('image/jpeg', 0.82);
        if (out.length > 1200000) out = canvas.toDataURL('image/jpeg', 0.6);
        cb(out);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  /* ── sidebar width & rail ─────────────────────────────────────────────── */

  function applySideWidth() {
    var w = Number(state.settings.sideWidth) || 252;
    w = Math.max(168, Math.min(340, w));
    nodes.app.style.setProperty('--sidebar-w', w + 'px');
  }

  function initSideResize() {
    var dragging = false, startX = 0, startW = 252;

    function onMove(e) {
      if (!dragging) return;
      var next = Math.max(168, Math.min(340, startW + (e.clientX - startX)));
      nodes.app.style.setProperty('--sidebar-w', next + 'px');
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      nodes.app.classList.remove('is-resizing');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      var w = parseInt(nodes.app.style.getPropertyValue('--sidebar-w'), 10);
      if (w) api.patchSettings({ sideWidth: w });
    }

    nodes.resizer.addEventListener('pointerdown', function (e) {
      if (nodes.app.getAttribute('data-collapsed') === '1') return;
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startW = nodes.side.getBoundingClientRect().width || 252;
      nodes.app.classList.add('is-resizing');
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
    nodes.resizer.addEventListener('dblclick', function () {
      state.settings.sideWidth = 252;
      applySideWidth();
      api.patchSettings({ sideWidth: 252 });
    });
  }

  function renderRail() {
    clear(nodes.rail);
    if (nodes.app.getAttribute('data-collapsed') !== '1') return;

    function add(opts) {
      var b = el('button', 'rail-btn');
      b.type = 'button';
      b.title = opts.title;
      b.setAttribute('aria-label', opts.title);
      if (opts.icon) b.appendChild(I.el(opts.icon, 16));
      else {
        b.textContent = opts.text;
        if (opts.text && opts.text.length > 2) b.classList.add('is-wide2');
        else if (opts.wide) b.classList.add('is-wide');
      }
      if (opts.active) b.classList.add('is-active');
      b.addEventListener('click', opts.onClick);
      nodes.rail.appendChild(b);
      return b;
    }

    add({ icon: 'grid', title: t('allBookmarks'), active: state.view.kind === 'all', onClick: function () { setView('all'); } });
    add({ icon: 'pin', title: t('pinned'), active: state.view.kind === 'pinned', onClick: function () { setView('pinned'); } });
    add({ icon: 'history', title: t('recentVisits'), active: state.view.kind === 'recent', onClick: function () { setView('recent'); } });
    nodes.rail.appendChild(el('div', 'rail-sep'));

    var entries = [];
    state.tree.roots.forEach(function (root) {
      entries.push({ id: root.id, title: root.title });
      root.children.forEach(function (c) {
        if (!c.url) entries.push({ id: c.id, title: c.title });
      });
    });
    /* One glyph per folder, as asked. When two names start with the same
       character the later one borrows its last character instead (书签工具栏 → 书,
       书签菜单 → 菜) — still one glyph, but no two identical buttons. Latin names
       have no glyph worth showing, so they use word initials (BT / BM). */
    var usedGlyph = {};
    var entries2 = entries.map(function (e) {
      var name = (e.title || '?').trim();
      if (/^[\x20-\x7e]/.test(name)) {
        var words = name.split(/\s+/).filter(Boolean);
        var ini = words.length > 1
          ? (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
          : name.slice(0, 2).toUpperCase();
        return { entry: e, name: name, label: ini, latin: true };
      }
      var chars = name.split('');
      var order = [0, chars.length - 1, 1, 2];
      var glyph = chars[0];
      for (var i = 0; i < order.length; i++) {
        var ch = chars[order[i]];
        if (ch && !usedGlyph[ch]) { glyph = ch; break; }
      }
      usedGlyph[glyph] = true;
      return { entry: e, name: name, label: glyph, latin: false };
    });

    entries2.forEach(function (x) {
      add({
        text: x.label,
        title: x.name,
        wide: x.latin,
        active: state.view.kind === 'folder' && state.view.folderId === x.entry.id,
        onClick: function () { enterFolder(x.entry.id); }
      });
    });
  }

  function setGroup(title) {
    var g = el('div', 'set-group');
    g.appendChild(el('div', 'set-group-title', title));
    return g;
  }

  /* markoob-style preview thumbnails: a little mock of the option */
  function styleThumb(kind, label, selected, onPick) {
    var b = el('button', 'thum' + (selected ? ' is-sel' : ''));
    b.type = 'button';
    var mock = el('span', 'thum-mock' + (kind === 'compact' ? ' is-compact' : ''));
    var n = kind === 'compact' ? 4 : 2;
    for (var i = 0; i < n; i++) mock.appendChild(el('span', 'thum-line'));
    b.appendChild(mock);
    b.appendChild(el('span', 'thum-label', label));
    var check = el('span', 'thum-check');
    check.appendChild(I.el('check', 12));
    b.appendChild(check);
    b.addEventListener('click', onPick);
    return b;
  }

  function bookmarkStyleRow() {
    var wrap = el('div');
    function rebuild() {
      clear(wrap);
      var thumbs = el('div', 'thum-row');
      /* re-open settings after switching: the layout row's disabled state
         depends on the style, and stale closures can't refresh it */
      function restyle(v) {
        patch(v, function () {
          render();
          if (document.querySelector('dialog[open]')) { closeDialog(); openSettings(); }
        });
      }
      thumbs.appendChild(styleThumb('card', t('styleCard'),
        state.settings.bookmarkStyle !== 'compact', function () {
          restyle({ bookmarkStyle: 'card', layoutType: 'row' });
        }));
      thumbs.appendChild(styleThumb('compact', t('styleCompact'),
        state.settings.bookmarkStyle === 'compact', function () {
          restyle({ bookmarkStyle: 'compact' });
        }));
      wrap.appendChild(setRow(t('bookmarkStyle'), null, thumbs));
    }
    rebuild();
    return wrap;
  }

  function layoutRow() {
    var wrap = el('div');
    function rebuild() {
      clear(wrap);
      var compact = state.settings.bookmarkStyle === 'compact';
      var thumbs = el('div', 'thum-row');
      thumbs.appendChild(styleThumb('card', t('layoutRow'),
        state.settings.layoutType !== 'col', function () {
          patch({ layoutType: 'row' }, render);
        }));
      thumbs.appendChild(styleThumb('compact', t('layoutCol'),
        state.settings.layoutType === 'col', function () {
          if (compact) patch({ layoutType: 'col' }, render);
        }));
      thumbs.querySelectorAll('.thum')[1].classList.toggle('is-disabled', !compact);
      thumbs.querySelectorAll('.thum')[1].disabled = !compact;
      wrap.appendChild(setRow(t('layoutType'), compact ? null : t('layoutCompactOnly'), thumbs));
    }
    rebuild();
    return wrap;
  }

  function wallpaperRow() {
    var wrap = el('div');

    function commit(patchObj) {
      api.patchWallpaper(patchObj).then(function () {
        state.settings = api.getSettings();
        applyAppearance();
    applyWallpaper();
        rebuild();
      });
    }

    function rebuild() {
      clear(wrap);
      var w = wallpaperValue();

      var swatches = el('div', 'wp-swatches');

      var none = el('button', 'wp-swatch is-none' + (w.kind === 'none' ? ' is-sel' : ''));
      none.type = 'button';
      none.title = t('wallpaperNone');
      none.textContent = t('wallpaperNone');
      none.addEventListener('click', function () { commit({ kind: 'none', value: '' }); });
      swatches.appendChild(none);

      GRADIENTS.forEach(function (g) {
        var sw = el('button', 'wp-swatch' + (w.kind === 'gradient' && w.value === g.id ? ' is-sel' : ''));
        sw.type = 'button';
        sw.style.background = g.css;
        sw.title = t('wallpaperGradient');
        sw.addEventListener('click', function () { commit({ kind: 'gradient', value: g.id }); });
        swatches.appendChild(sw);
      });

      if (w.kind === 'image') {
        var cur = el('span', 'wp-swatch is-sel');
        cur.id = 'wpCurrent';
        swatches.appendChild(cur);
        api.getWallpaperImage().then(function (url) {
          if (url && cur.isConnected) {
            var img = document.createElement('img');
            img.alt = '';
            img.src = url;
            clear(cur);
            cur.appendChild(img);
          }
        });
      }

      wrap.appendChild(setRow(t('wallpaper'), null, swatches));

      var ctrl = el('div', 'wp-dim');
      var pick = el('button', 'btn', t('wallpaperPick'));
      pick.type = 'button';
      var file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/*';
      file.hidden = true;
      pick.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        readImageFile(f, function (dataUrl) {
          api.setWallpaperImage(dataUrl).then(function () {
            return api.patchWallpaper({ kind: 'image', value: 'local' });
          }).then(function () {
            state.settings = api.getSettings();
            applyWallpaper();
            rebuild();
          });
        }, function () { toast(t('wallpaperFailed')); });
        file.value = '';
      });
      ctrl.appendChild(pick);
      if (w.kind === 'image') {
        var rm = el('button', 'btn', t('wallpaperClear'));
        rm.type = 'button';
        rm.addEventListener('click', function () {
          api.setWallpaperImage('').then(function () { commit({ kind: 'none', value: '' }); });
        });
        ctrl.appendChild(rm);
      }
      ctrl.appendChild(file);
      wrap.appendChild(setRow(t('wallpaperImage'), t('wallpaperHint'), ctrl));

      if (w.kind !== 'none') {
        var inkSeg = seg([
          { value: 'auto', label: t('inkAuto') },
          { value: 'light', label: t('inkLight') },
          { value: 'dark', label: t('inkDark') },
          { value: 'custom', label: t('inkCustom') }
        ], w.ink || 'auto', function (v) { commit({ ink: v }); });
        wrap.appendChild(setRow(t('wallpaperInk'), null, inkSeg));

        if ((w.ink || 'auto') === 'custom') {
          var colorWrap = el('div', 'ink-color-row');
          var swatches = ['#f2f2f4', '#ffe9b8', '#bfeee4', '#ffd6e0', '#cfe0ff'];
          swatches.forEach(function (c) {
            var sw = el('button', 'ink-swatch');
            sw.type = 'button';
            sw.style.background = c;
            sw.title = c;
            sw.addEventListener('click', function () {
              commit({ inkColor: c });
            });
            colorWrap.appendChild(sw);
          });
          var picker = document.createElement('input');
          picker.type = 'color';
          picker.className = 'ink-picker';
          picker.value = w.inkColor || '#f2f2f4';
          picker.addEventListener('input', function () {
            commit({ inkColor: picker.value });
          });
          colorWrap.appendChild(picker);
          wrap.appendChild(setRow(t('inkCustomHint'), null, colorWrap));
        }
      }

      if (w.kind !== 'none') {
        var range = document.createElement('input');
        range.type = 'range';
        range.min = '0';
        range.max = '60';
        range.step = '5';
        range.value = String(Math.round((w.dim || 0) * 100));
        var val = el('span', 'wp-dim-val', range.value + '%');
        range.addEventListener('input', function () {
          val.textContent = range.value + '%';
          nodes.wall.style.setProperty('--wall-dim', String(Number(range.value) / 100));
        });
        range.addEventListener('change', function () {
          commit({ dim: Number(range.value) / 100 });
        });
        var dimWrap = el('div', 'wp-dim');
        dimWrap.appendChild(range);
        dimWrap.appendChild(val);
        wrap.appendChild(setRow(t('wallpaperDim'), null, dimWrap));
      }
    }

    rebuild();
    return wrap;
  }

  /* markoob-style bottom slider toast: live preview, commit on close */
  function openSliderToast(opts) {
    closeSliderToast();
    var toastEl = el('div', 'sl-toast');
    toastEl.id = 'sliderToast';
    var title = el('span', 'sl-title');
    if (opts.icon) title.appendChild(I.el(opts.icon, 16));
    title.appendChild(document.createTextNode(opts.label));
    toastEl.appendChild(title);

    var range = document.createElement('input');
    range.type = 'range';
    range.min = String(opts.min);
    range.max = String(opts.max);
    range.step = String(opts.step);
    range.value = String(opts.value);
    toastEl.appendChild(range);

    var val = el('span', 'sl-val', Number(opts.value).toFixed(2).replace(/0$/, ''));
    toastEl.appendChild(val);

    range.addEventListener('input', function () {
      val.textContent = Number(range.value).toFixed(2).replace(/0$/, '');
      opts.onLive(Number(range.value));
    });

    var done = el('button', 'sl-done');
    done.type = 'button';
    done.setAttribute('aria-label', t('done'));
    done.appendChild(I.el('check', 16));
    done.addEventListener('click', function () {
      opts.onDone(Number(range.value));
      closeSliderToast();
    });
    toastEl.appendChild(done);

    (document.querySelector('dialog[open]') || document.body).appendChild(toastEl);
  }

  function closeSliderToast() {
    var t0 = document.getElementById('sliderToast');
    if (t0) t0.remove();
  }

  function openSettings() {
    var body = el('div');

    /* ── 外观 ── */
    var g1 = setGroup(t('appearanceSection'));
    g1.appendChild(setRow(t('theme'), null, seg([
      { value: 'system', label: t('systemTheme') },
      { value: 'light', label: t('lightTheme') },
      { value: 'dark', label: t('darkTheme') }
    ], state.settings.theme, function (v) {
      patch({ theme: v }, function () { applyTheme(); render(); });
    })));
    g1.appendChild(setRow(t('language'), null, seg([
      { value: 'auto', label: t('autoDetect') },
      { value: 'zh', label: t('zhLabel') },
      { value: 'en', label: t('enLabel') }
    ], state.settings.language, function (v) {
      patch({ language: v }, function () {
        applyLanguage();
        api.getTree(true).then(function (tree) {
          state.tree = tree;
          render();
          closeDialog();
          openSettings();
        });
      });
    })));
    g1.appendChild(bookmarkStyleRow());
    g1.appendChild(layoutRow());
    function adjustBtn(key, opts) {
      var b = el('button', 'btn', t('styleAdjust'));
      b.type = 'button';
      b.addEventListener('click', function () {
        openSliderToast({
          icon: opts.icon,
          label: opts.label,
          min: opts.min,
          max: opts.max,
          step: 0.05,
          value: Number(state.settings[key]) || 1,
          onLive: function (v) {
            state.settings[key] = v;
            applyAppearance();
          },
          onDone: function (v) {
            patch(Object.fromEntries([[key, v]]), function () { render(); });
          }
        });
      });
      return b;
    }
    g1.appendChild(setRow(t('fontSize'), null, adjustBtn('fontScale', {
      icon: 'type', label: t('fontSize'), min: 0.8, max: 1.3
    })));
    g1.appendChild(setRow(t('bookmarkWidth'), null, adjustBtn('widthScale', {
      icon: 'width', label: t('bookmarkWidth'), min: 0.5, max: 1.5
    })));
    g1.appendChild(setRow(t('disableAnim'), null, toggle(!!state.settings.noAnim, function (on) {
      patch({ noAnim: on }, applyAppearance);
    })));
    g1.appendChild(wallpaperRow());
    body.appendChild(g1);

    /* ── 书签 ── */
    var g2 = setGroup(t('bookmarksSection'));
    g2.appendChild(setRow(t('openWith'), null, seg([
      { value: 'newtab', label: t('newTab') },
      { value: 'current', label: t('currentTab') }
    ], state.settings.openWith, function (v) {
      patch({ openWith: v });
    })));
    g2.appendChild(setRow(t('recommendations'), t('recommendationsDesc'), toggle(state.settings.recommendations, function (on) {
      patch({ recommendations: on }, function () {
        if (on) loadHistory(true).then(function () { render(); });
        else render();
      });
    })));
    var widthRow = el('button', 'btn', t('engineRestore'));
    widthRow.type = 'button';
    widthRow.addEventListener('click', function () {
      state.settings.sideWidth = 252;
      applySideWidth();
      api.patchSettings({ sideWidth: 252 });
      toast(t('sidebarResetHint'));
    });
    g2.appendChild(setRow(t('sidebarWidth'), t('sidebarResetHint'), widthRow));
    body.appendChild(g2);

    /* ── 搜索 ── */
    var g3 = setGroup(t('searchSection'));
    var engineBtn = el('button', 'btn');
    engineBtn.type = 'button';
    var eng = currentEngine();
    engineBtn.textContent = (eng ? eng.name : '') + ' ›';
    engineBtn.addEventListener('click', openEngineDialog);
    g3.appendChild(setRow(t('searchEngine'), null, engineBtn));
    g3.appendChild(setRow(t('searchHistory'), t('searchHistoryDesc'), toggle(state.settings.searchHistory, function (on) {
      patch({ searchHistory: on }, function () {
        if (on) loadHistory(true);
      });
    })));
    body.appendChild(g3);

    /* ── 数据 ── */
    var g4 = setGroup(t('dataSection'));
    var orgBtn = el('button', 'btn', t('organize'));
    orgBtn.type = 'button';
    orgBtn.addEventListener('click', function () { closeDialog(); openOrganizeDialog(); });
    g4.appendChild(setRow(t('organize'), t('organizeBackupDesc'), orgBtn));

    var reset = el('button', 'btn', t('resetUsage'));
    reset.type = 'button';
    reset.addEventListener('click', function () {
      api.clearUsage().then(function () {
        state.usage = {};
        toast(t('resetUsageDone'));
        render();
      });
    });
    g4.appendChild(setRow(t('resetUsage'), t('resetUsageDesc'), reset));
    body.appendChild(g4);

    /* ── 关于 ── */
    var g5 = setGroup(t('aboutSection'));
    var about = el('div', 'set-about');
    var version = '2.1.0';
    try {
      var _rt = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime :
        (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime : null;
      if (_rt && _rt.getManifest) version = _rt.getManifest().version;
    } catch (e) { /* demo */ }
    var p1 = el('p');
    p1.appendChild(el('strong', null, 'Tabmark '));
    p1.appendChild(document.createTextNode(t('version', { v: version })));
    about.appendChild(p1);
    about.appendChild(el('p', null, t('privacyNote')));
    g5.appendChild(about);

    var keys = el('div', 'kbd-list');
    [
      [t('shortcutSearch'), MOD + ' K'],
      [t('shortcutAdd'), MOD + ' N'],
      [t('shortcutSettings'), MOD + ' ,'],
      [t('shortcutEsc'), 'Esc']
    ].forEach(function (row) {
      var r = el('div', 'kbd-row');
      r.appendChild(el('span', null, row[0]));
      r.appendChild(el('kbd', null, row[1]));
      keys.appendChild(r);
    });
    g5.appendChild(el('div', 'set-sub', t('shortcuts')));
    g5.appendChild(keys);
    body.appendChild(g5);

    openDialog({
      title: t('settings'),
      size: 'lg',
      body: body,
      actions: [{ label: t('done'), primary: true, onClick: closeDialog }]
    });
  }

  /* ── toast ────────────────────────────────────────────────────────────── */

  function toast(text, opts) {
    opts = opts || {};
    clearTimeout(state.toastTimer);
    nodes.toastText.textContent = text;
    if (opts.action) {
      nodes.toastAction.hidden = false;
      nodes.toastAction.textContent = opts.action.label;
      nodes.toastAction.onclick = function () {
        hideToast();
        opts.action.run();
      };
    } else {
      nodes.toastAction.hidden = true;
      nodes.toastAction.onclick = null;
    }
    nodes.toast.hidden = false;
    requestAnimationFrame(function () { nodes.toast.classList.add('is-on'); });
    state.toastTimer = setTimeout(hideToast, opts.duration || (opts.action ? 7000 : 2400));
  }

  function hideToast() {
    clearTimeout(state.toastTimer);
    nodes.toast.classList.remove('is-on');
    setTimeout(function () { nodes.toast.hidden = true; }, 200);
  }

  /* ── data loading ─────────────────────────────────────────────────────── */

  function loadHistory(force) {
    if (!state.settings.recommendations && !state.settings.searchHistory) return Promise.resolve([]);
    if (state.history.length && !force) return Promise.resolve(state.history);
    return api.topHistory(45, 400).then(function (list) {
      state.history = list || [];
      return state.history;
    }).catch(function () { return []; });
  }

  function recentHistory(limit) {
    var seen = {};
    var bookmarked = {};
    state.tree.bookmarks.forEach(function (b) { bookmarked[b.url] = true; });
    var out = [];
    state.history.forEach(function (h) {
      if (!h.url || seen[h.url] || bookmarked[h.url]) return;
      seen[h.url] = true;
      out.push(h);
    });
    out.sort(function (a, b) { return (b.lastVisitTime || 0) - (a.lastVisitTime || 0); });
    return limit ? out.slice(0, limit) : out;
  }

  var DAY = 86400000;
  function startOfToday() {
    var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  }

  function filterHistory(list) {
    var v = state.historyView;
    var q = (v.query || '').toLowerCase();
    var start = 0, end = Infinity;
    if (v.range === 'today') { start = startOfToday(); }
    else if (v.range === 'yesterday') { start = startOfToday() - DAY; end = startOfToday(); }
    else if (v.range === 'd7') { start = Date.now() - 7 * DAY; }
    else if (v.range === 'd30') { start = Date.now() - 30 * DAY; }
    return (list || []).filter(function (h) {
      if (!h.url) return false;
      var t = h.lastVisitTime || 0;
      if (t < start || t >= end) return false;
      if (q && ((h.title || '') + ' ' + (h.url || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return (b.lastVisitTime || 0) - (a.lastVisitTime || 0); });
  }

  /* search box + date range + clear button for the history sections */
  function buildHistTools() {
    var tools = el('div', 'hist-tools');
    var box = el('span', 'hist-search');
    var inp = document.createElement('input');
    inp.type = 'search';
    inp.placeholder = t('historySearch');
    inp.value = state.historyView.query;
    var deb = null;
    inp.addEventListener('input', function () {
      clearTimeout(deb);
      deb = setTimeout(function () {
        state.historyView.query = inp.value.trim();
        histRefresh();
      }, 220);
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === 'Escape') e.preventDefault();
      e.stopPropagation();
    });
    box.appendChild(inp);
    tools.appendChild(box);

    var sel = document.createElement('select');
    sel.className = 'hist-select';
    [
      ['today', 'rangeToday'], ['yesterday', 'rangeYesterday'],
      ['d7', 'range7'], ['d30', 'range30'], ['all', 'rangeAll']
    ].forEach(function (pair) {
      var o = document.createElement('option');
      o.value = pair[0]; o.textContent = t(pair[1]);
      if (state.historyView.range === pair[0]) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      state.historyView.range = sel.value;
      histRefresh();
    });
    tools.appendChild(sel);

    var clr = el('button', 'icon-btn', null);
    clr.type = 'button';
    clr.title = t('historyClear');
    clr.setAttribute('aria-label', t('historyClear'));
    clr.appendChild(I.el('trash', 15));
    clr.addEventListener('click', function () {
      if (!window.confirm(t('historyClearDesc'))) return;
      api.clearHistory().then(function () {
        state.historyView = { query: '', range: 'today' };
        return loadHistory(true);
      }).then(function () {
        toast(t('historyCleared'));
        render();
      });
    });
    tools.appendChild(clr);
    return tools;
  }

  function refreshTree() {
    return api.getTree(true).then(function (tree) {
      state.tree = tree;
      state.usage = api.getUsage();
      state.pinned = api.getPinned();
      state.history = state.history;
      render();
      return tree;
    }).catch(function () { return null; });
  }

  /* ── boot & events ────────────────────────────────────────────────────── */

  function initState() {
    state.settings = api.getSettings();
    state.pinned = (api.getPinned() || []).filter(function (p) {
      return p && (p.type === 'bookmark' || p.type === 'folder') && p.id;
    });
    state.usage = api.getUsage() || {};
    var ui = api.getUI() || {};
    (ui.expanded || []).forEach(function (id) { state.expanded[id] = true; });
    if (ui.lastCreateFolderId) state.settings.lastFolderId = ui.lastCreateFolderId;

    var params = new URLSearchParams(window.location.search);
    var qLang = params.get('lang');
    if (qLang === 'zh' || qLang === 'en') MK.i18n.setLang(qLang);
    else applyLanguage();

    applyTheme();
    MK.i18n.apply(document);
    hydrateIcons();

    [[nodes.navAll, 'allBookmarks'], [nodes.navPinned, 'pinned'], [nodes.navRecent, 'recentVisits'],
      [nodes.themeBtn, 'theme'], [$('btnSettingsSide'), 'settings'], [nodes.menuBtn, 'foldersSection']]
      .forEach(function (pair) {
        pair[0].title = t(pair[1]);
      });

    if (api.isDemo) {
      nodes.sideNote.textContent = t('previewShort');
      nodes.sideNote.classList.add('is-preview');
      nodes.sideNote.title = t('previewNote');
    }

    nodes.searchKbd.textContent = MOD + ' K';
  }

  function loadAll() {
    return Promise.all([api.getTree(true), loadHistory()]).then(function (res) {
      state.tree = res[0];
      var before = state.pinned.length;
      state.pinned = state.pinned.filter(function (p) { return !!state.tree.byId[p.id]; });
      if (state.pinned.length !== before) api.setPinned(state.pinned);
      state.loading = false;
      /* open only the toolbar root on first run; the other roots stay folded
         so the sidebar reads as a short outline rather than a wall of names */
      state.tree.roots.forEach(function (r) {
        if (state.expanded[r.id] === undefined) {
          state.expanded[r.id] = r.rootKey === 'toolbar';
        }
      });
    }).catch(function () {
      state.loading = false;
      state.failed = true;
    });
  }

  function onScroll() {
    nodes.topbar.classList.toggle('is-stuck', nodes.scroll.scrollTop > 4);
    if (state.menu) closeMenu(false);
  }

  function isTyping(target) {
    if (!target) return false;
    var tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function moveCardFocus(dir) {
    var cards = Array.prototype.slice.call(nodes.content.querySelectorAll('.card'));
    if (!cards.length) return;
    var current = document.activeElement;
    var idx = cards.indexOf(current);
    if (idx < 0) { cards[0].focus(); return; }
    var cols = 1;
    var gridEl = cards[0].parentNode;
    if (gridEl) {
      var style = window.getComputedStyle(gridEl);
      var template = style.gridTemplateColumns || '';
      cols = Math.max(1, template.split(' ').filter(Boolean).length);
    }
    var next = idx;
    if (dir === 'ArrowRight') next = Math.min(cards.length - 1, idx + 1);
    if (dir === 'ArrowLeft') next = Math.max(0, idx - 1);
    if (dir === 'ArrowDown') next = Math.min(cards.length - 1, idx + cols);
    if (dir === 'ArrowUp') next = Math.max(0, idx - cols);
    if (next !== idx) cards[next].focus();
  }

  function bind() {
    nodes.navAll.addEventListener('click', function () { setView('all'); });
    nodes.navPinned.addEventListener('click', function () { setView('pinned'); });
    nodes.navRecent.addEventListener('click', function () { setView('recent'); });

    nodes.searchInput.addEventListener('input', debounce(onQueryInput, 80));
    nodes.searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!state.sp.open && state.sp.items.length) { renderSpop(); selectSp(0); }
        else selectSp(state.sp.sel + 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectSp(state.sp.sel <= 0 ? 0 : state.sp.sel - 1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        commitSp();
        return;
      }
      if (e.key === 'Escape') {
        if (state.engineMenuOpen) { e.stopPropagation(); closeEngPop(); }
        else if (state.sp.open) { e.stopPropagation(); closeSpop(); }
        else if (nodes.searchInput.value) { clearSearch(true); }
        return;
      }
      if (e.key === 'Tab' && state.sp.open) closeSpop();
    });
    nodes.engineBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (state.engineMenuOpen) closeEngPop();
      else openEngPop();
    });
    nodes.engineBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    nodes.organizeBtn.addEventListener('click', openOrganizeDialog);

    document.addEventListener('mousedown', function (e) {
      if (state.engineMenuOpen && !nodes.engPop.contains(e.target)) closeEngPop();
      var insideSearch = nodes.searchWrap.contains(e.target);
      if (state.sp.open && !insideSearch) closeSpop();
      if (nodes.app.classList.contains('is-searching') && !insideSearch) {
        closeSearchMode();
      }
    });

    nodes.clearSearch.addEventListener('click', function () { clearSearch(true); });
    nodes.cancelSearch.addEventListener('click', function () {
      closeSearchMode();
    });
    /* mobile: the bar is always expanded; tapping it just focuses */

    nodes.sortBtn.addEventListener('click', function () { openSortMenu(nodes.sortBtn); });
    nodes.addBtn.addEventListener('click', function () { openAddMenu(nodes.addBtn); });
    nodes.themeBtn.addEventListener('click', function () { openThemeMenu(nodes.themeBtn); });
    $('btnSettingsSide').addEventListener('click', openSettings);
    $('btnAddFolderSide').addEventListener('click', function () { openFolderDialog(null); });

    $('btnSideToggle').addEventListener('click', function () {
      var next = !nodes.app.hasAttribute('data-collapsed') || nodes.app.getAttribute('data-collapsed') !== '1';
      setCollapsed(next);
    });
    nodes.menuBtn.addEventListener('click', function () { nodes.app.setAttribute('data-drawer', '1'); });
    nodes.app.addEventListener('click', function (e) {
      if (nodes.app.getAttribute('data-drawer') !== '1') return;
      if (nodes.side.contains(e.target) || nodes.menuBtn.contains(e.target)) return;
      closeDrawer();
    });

    nodes.scroll.addEventListener('scroll', onScroll, { passive: true });

    nodes.menuLayer.addEventListener('mousedown', function (e) { e.preventDefault(); });
    nodes.menuLayer.addEventListener('click', function () { closeMenu(true); });
    nodes.menuLayer.addEventListener('contextmenu', function (e) { e.preventDefault(); closeMenu(true); });

    nodes.dlgClose.addEventListener('click', closeDialog);
    nodes.dlg.addEventListener('cancel', function () { /* native close */ });
    nodes.dlg.addEventListener('click', function (e) {
      if (e.target === nodes.dlg) {
        var r = nodes.dlg.getBoundingClientRect();
        var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) closeDialog();
      }
    });

    document.addEventListener('keydown', function (e) {
      var meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); focusSearch(); return; }
      if (meta && e.key === ',') { e.preventDefault(); openSettings(); return; }
      if (meta && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); openBookmarkDialog(null); return; }
      if (e.key === 'Escape') {
        if (state.menu) { closeMenu(true); return; }
        if (nodes.dlg.open) { closeDialog(); return; }
        if (state.sp.open) { closeSpop(); nodes.searchInput.blur(); return; }
        if (state.q) { clearSearch(true); return; }
        if (nodes.app.getAttribute('data-drawer') === '1') { closeDrawer(); return; }
        if (isMobile() && nodes.app.classList.contains('is-searching')) {
          closeSearchMode();
        }
      }
      /* Type anywhere → search. The key itself is left alone so it lands in the
         input we just focused (works for IME too). */
      if (!isTyping(e.target) && !meta && !e.altKey && !nodes.dlg.open) {
        if (e.key.length === 1 || e.key === 'Process') {
          focusSearch();
          return;
        }
      }
      if (!isTyping(e.target) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) >= 0) {
        if (document.activeElement && document.activeElement.classList.contains('card')) {
          e.preventDefault();
          moveCardFocus(e.key);
        }
      }
      if (e.key === 'F10' && e.shiftKey) {
        var card = document.activeElement;
        if (card && card.classList.contains('card') && card.dataset.id) {
          e.preventDefault();
          var n = nodeById(card.dataset.id);
          if (n) openNodeMenu(n, undefined, undefined, card);
        }
      }
    });

    window.addEventListener('resize', debounce(function () {
      if (state.menu) closeMenu(false);
      if (window.matchMedia('(max-width: 860px)').matches) {
        nodes.app.removeAttribute('data-collapsed');
        nodes.rail.hidden = true;
      } else {
        closeDrawer();
        nodes.app.classList.remove('is-searching');
      }
    }, 150));

    api.onChanged(function () {
      refreshTree().then(function () { if (state.q) onQueryInput(); });
    });
  }

  function setCollapsed(next) {
    nodes.app.setAttribute('data-collapsed', next ? '1' : '0');
    nodes.rail.hidden = !next;
    if (next) renderRail();
    api.patchSettings({ sidebarCollapsed: next });
    var toggle = $('btnSideToggle');
    I.mount(toggle, 'panelLeft', 16);
    toggle.setAttribute('data-icon-ready', '1');
    toggle.setAttribute('aria-label', next ? t('sidebarExpand') : t('sidebarCollapse'));
    toggle.setAttribute('title', next ? t('sidebarExpand') : t('sidebarCollapse'));
  }

  function closeDrawer() { nodes.app.removeAttribute('data-drawer'); }

  function boot() {
    api.init().then(function () {
      initState();
      return loadAll();
    }).then(function () {
      if (state.settings.sidebarCollapsed && !isMobile()) nodes.app.setAttribute('data-collapsed', '1');
      applySideWidth();
      applyWallpaper();
      renderEngineBadge();
      updateSortLabel();
      initSideResize();
      bind();
      render();
      hydrateIcons();
      if (state.settings.sidebarCollapsed && !isMobile()) {
        nodes.rail.hidden = false;
        renderRail();
      }
    }).catch(function () {
      state.loading = false;
      state.failed = true;
      applyTheme();
      applyWallpaper();
      hydrateIcons();
      render();
    });
  }

  boot();
})();
