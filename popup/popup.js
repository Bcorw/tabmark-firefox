/* ============================================================================
   popup.js — 360px toolbar popup.

   States
     unsaved : title + folder + primary save
     saved   : folder row + four actions (edit / QR / copy / delete)
     edit    : title + folder + cancel/save
     qr      : local canvas QR with copy/download
     bad     : no openable page

   All copy comes from MK.i18n; all icons are constant SVG from MK.icons.
   ========================================================================== */

(function () {
  'use strict';

  var MK = window.MK;
  var api = MK.api;
  var I = MK.icons;
  var t = function (k, p) { return MK.i18n.t(k, p); };

  var $ = function (id) { return document.getElementById(id); };

  var nodes = {
    fav: $('ppFav'), title: $('ppTitle'), url: $('ppUrl'), qr: $('ppQr'),
    badge: $('ppBadge'), body: $('ppBody'), status: $('ppStatus'),
    open: $('ppOpen'), settings: $('ppSettings')
  };

  var state = {
    tab: null,
    tree: null,
    bookmark: null,
    mode: 'unsaved',
    pending: false,
    statusTimer: null
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function ico(name, size) {
    var s = el('span', 'ico');
    s.appendChild(I.el(name, size || 14));
    return s;
  }
  function hostname(url) { return api.hostnameOf(url) || ''; }
  function openable(url) { return /^(https?|ftp|ftps):/i.test(url || ''); }
  function hue(str) {
    var seed = 0, s = String(str || '');
    for (var i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) % 360;
    return seed;
  }
  function isDark() {
    var a = document.documentElement.getAttribute('data-theme');
    if (a === 'dark') return true;
    if (a === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function hydrateIcons() {
    var els = document.querySelectorAll('[data-icon]');
    for (var i = 0; i < els.length; i++) {
      if (els[i].getAttribute('data-icon-ready') === '1') continue;
      els[i].appendChild(I.el(els[i].getAttribute('data-icon'), parseInt(els[i].getAttribute('data-size'), 10) || 15));
      els[i].setAttribute('data-icon-ready', '1');
    }
  }

  /* ── header ───────────────────────────────────────────────────────────── */

  function renderHeader() {
    var tab = state.tab || {};
    var url = tab.url || '';
    clear(nodes.fav);

    var letter = (hostname(url).replace(/^www\./, '')[0] || '·').toUpperCase();
    var h = hue(hostname(url));
    nodes.fav.textContent = letter;
    if (isDark()) {
      nodes.fav.style.background = 'hsl(' + h + ' 18% 27%)';
      nodes.fav.style.color = 'hsl(' + h + ' 45% 76%)';
    } else {
      nodes.fav.style.background = 'hsl(' + h + ' 32% 90%)';
      nodes.fav.style.color = 'hsl(' + h + ' 38% 34%)';
    }

    var iconUrl = tab.favIconUrl || '';
    if (openable(url) && /^(data|https?):/i.test(iconUrl)) {
      var img = document.createElement('img');
      img.alt = '';
      img.addEventListener('load', function () {
        clear(nodes.fav);
        nodes.fav.style.background = 'transparent';
        nodes.fav.appendChild(img);
      });
      img.addEventListener('error', function () { /* letter stays */ });
      img.src = iconUrl;
    }

    nodes.title.textContent = tab.title || hostname(url) || t('appName');
    nodes.title.title = tab.title || '';
    nodes.url.textContent = url;
    nodes.url.title = url;
    nodes.qr.hidden = !openable(url);
  }

  /* ── folders ──────────────────────────────────────────────────────────── */

  function folderList() {
    var out = [];
    if (!state.tree) return out;
    state.tree.roots.forEach(function (root) {
      out.push({ id: root.id, title: root.title, depth: 0 });
      (function walk(n, d) {
        n.children.forEach(function (c) {
          if (c.url) return;
          out.push({ id: c.id, title: c.title, depth: d });
          walk(c, d + 1);
        });
      })(root, 1);
    });
    return out;
  }

  function folderById(id) {
    return state.tree && state.tree.byId ? state.tree.byId[id] : null;
  }

  function defaultFolderId() {
    var ui = api.getUI() || {};
    var settings = api.getSettings();
    var candidates = [ui.lastCreateFolderId, settings.lastFolderId];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] && folderById(candidates[i])) return candidates[i];
    }
    var unfiled = state.tree.roots.filter(function (r) { return r.rootKey === 'unfiled'; })[0];
    return (unfiled && unfiled.id) || (state.tree.roots[0] && state.tree.roots[0].id) || null;
  }

  function folderSelect(selected) {
    var wrap = el('div', 'pp-select-wrap');
    var sel = el('select', 'pp-select');
    folderList().forEach(function (f) {
      var o = document.createElement('option');
      o.value = f.id;
      o.textContent = (f.depth ? '\u00A0\u00A0'.repeat(f.depth) + '› ' : '') + f.title;
      if (f.id === selected) o.selected = true;
      sel.appendChild(o);
    });
    var chev = el('span', 'pp-select-chev');
    chev.appendChild(I.el('chevronDown', 12));
    wrap.appendChild(sel);
    wrap.appendChild(chev);
    return { wrap: wrap, select: sel };
  }

  function rememberFolder(id) {
    api.patchSettings({ lastFolderId: id });
    var ui = api.getUI() || {};
    ui.lastCreateFolderId = id;
    api.setUI(ui);
  }

  /* ── status ───────────────────────────────────────────────────────────── */

  function setStatus(text, opts) {
    opts = opts || {};
    clearTimeout(state.statusTimer);
    nodes.status.hidden = !text;
    nodes.status.classList.toggle('is-error', !!opts.error);
    clear(nodes.status);
    if (!text) return;
    nodes.status.appendChild(el('span', 'pp-status-text', text));
    if (opts.action) {
      var b = el('button', 'pp-status-action', opts.action.label);
      b.type = 'button';
      b.addEventListener('click', function () { b.disabled = true; opts.action.run(); });
      nodes.status.appendChild(b);
    }
    state.statusTimer = setTimeout(function () {
      nodes.status.hidden = true;
    }, opts.action ? 9000 : 2600);
  }

  /* ── unsaved / edit ───────────────────────────────────────────────────── */

  function buildForm(initial) {
    var form = el('form', 'pp-form');
    var title = el('input', 'pp-input');
    title.type = 'text';
    title.value = initial.title || '';
    title.placeholder = t('titleHint');
    title.maxLength = 300;

    var folder = folderSelect(initial.folderId || defaultFolderId());

    var titleRow = el('div', 'pp-row');
    titleRow.appendChild(el('label', 'pp-label', t('titleLabel')));
    titleRow.appendChild(title);

    var folderRow = el('div', 'pp-row');
    folderRow.appendChild(el('label', 'pp-label', t('ppSaveHere')));
    folderRow.appendChild(folder.wrap);

    form.appendChild(titleRow);
    form.appendChild(folderRow);

    var actions = el('div', 'pp-actions-save');
    if (initial.editing) {
      actions.style.display = 'flex';
      actions.style.gap = '8px';
      var cancel = el('button', 'pp-btn', t('cancel'));
      cancel.type = 'button';
      cancel.addEventListener('click', function () {
        setStatus('');
        renderSaved();
      });
      var save = el('button', 'pp-btn is-primary', t('save'));
      save.type = 'submit';
      actions.appendChild(cancel);
      actions.appendChild(save);
    } else {
      var saveNew = el('button', 'pp-btn is-primary', t('bookmarkPage'));
      saveNew.type = 'submit';
      actions.appendChild(saveNew);
    }
    form.appendChild(actions);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.pending) return;
      submitForm(title, folder.select, initial.editing);
    });

    setTimeout(function () {
      title.focus();
      var len = title.value.length;
      try { title.setSelectionRange(len, len); } catch (err) { /* ignore */ }
    }, 20);

    return form;
  }

  function submitForm(titleInput, select, editing) {
    var url = state.tab.url;
    var norm;
    try { norm = api.normalizeUrl(url); } catch (e) { norm = { ok: false }; }
    if (!norm || !norm.ok) {
      setStatus(t('bookmarkletBlocked'), { error: true });
      return;
    }
    var value = titleInput.value.trim() || hostname(norm.url) || norm.url;
    var folderId = select.value;
    state.pending = true;

    if (editing && state.bookmark) {
      var move = state.bookmark.parentId !== folderId;
      api.updateBookmark(state.bookmark.id, { title: value }).then(function () {
        if (move) return api.moveNode(state.bookmark.id, { parentId: folderId });
        return null;
      }).then(function () {
        state.bookmark.title = value;
        if (move) state.bookmark.parentId = folderId;
        state.pending = false;
        rememberFolder(folderId);
        setStatus(t('saved'));
        renderSaved();
      }).catch(function () {
        state.pending = false;
        setStatus(t('saveFailed', { what: t('titleLabel') }), { error: true });
      });
      return;
    }

    api.createBookmark({ parentId: folderId, title: value, url: norm.url }).then(function (id) {
      state.pending = false;
      rememberFolder(folderId);
      state.bookmark = { id: id, parentId: folderId, title: value, url: norm.url };
      renderSaved();
      setStatus(t('savedTo', { folder: (folderById(folderId) || {}).title || '' }));
    }).catch(function () {
      state.pending = false;
      setStatus(t('saveFailed', { what: t('folderLabel') }), { error: true });
    });
  }

  function renderUnsaved() {
    clear(nodes.body);
    state.mode = 'unsaved';
    nodes.body.appendChild(buildForm({
      title: (state.tab && state.tab.title) || '',
      folderId: defaultFolderId(),
      editing: false
    }));
  }

  /* ── saved ────────────────────────────────────────────────────────────── */

  function renderSaved() {
    state.mode = 'saved';
    clear(nodes.body);
    if (!state.bookmark) { renderUnsaved(); return; }

    var folder = folderById(state.bookmark.parentId);
    var row = el('div', 'pp-saved');
    row.appendChild(ico('checkSmall', 15));
    row.appendChild(el('span', 'pp-saved-name', folder ? folder.title : ''));
    row.appendChild(el('span', 'pp-saved-tag', t('bookmarked')));

    var change = el('button', 'pp-change', t('changeFolder'));
    change.type = 'button';
    change.addEventListener('click', startEdit);
    row.appendChild(change);
    nodes.body.appendChild(row);

    var grid = el('div', 'pp-grid');
    grid.appendChild(tile('pencil', t('edit'), startEdit));
    grid.appendChild(tile('qr', t('qrCode'), renderQr));
    grid.appendChild(tile('copy', t('copyLink'), function () {
      api.copyText(state.bookmark.url).then(function () { setStatus(t('copied')); })
        .catch(function () { setStatus(t('copyFailed'), { error: true }); });
    }));
    grid.appendChild(tile('trash', t('delete'), removeBookmark, true));
    nodes.body.appendChild(grid);

    if (state.tab && state.tab.title && state.tab.title !== state.bookmark.title) {
      var linkRow = el('div', 'pp-linkrow');
      var link = el('button', 'pp-link');
      link.type = 'button';
      link.appendChild(ico('refresh', 12));
      link.appendChild(el('span', null, t('usePageTitle')));
      link.addEventListener('click', syncTitle);
      linkRow.appendChild(link);
      nodes.body.appendChild(linkRow);
    }
  }

  function tile(iconName, label, onClick, danger) {
    var b = el('button', 'pp-tile' + (danger ? ' is-danger' : ''));
    b.type = 'button';
    b.appendChild(ico(iconName, 16));
    b.appendChild(el('span', null, label));
    b.addEventListener('click', onClick);
    return b;
  }

  function startEdit() {
    state.mode = 'edit';
    clear(nodes.body);
    setStatus('');
    nodes.body.appendChild(buildForm({
      title: state.bookmark.title,
      folderId: state.bookmark.parentId,
      editing: true
    }));
  }

  function syncTitle() {
    if (state.pending || !state.bookmark) return;
    state.pending = true;
    api.updateBookmark(state.bookmark.id, { title: state.tab.title }).then(function () {
      state.bookmark.title = state.tab.title;
      state.pending = false;
      setStatus(t('saved'));
      renderSaved();
    }).catch(function () {
      state.pending = false;
      setStatus(t('saveFailed', { what: t('titleLabel') }), { error: true });
    });
  }

  function removeBookmark() {
    if (state.pending || !state.bookmark) return;
    state.pending = true;
    var snap = {
      parentId: state.bookmark.parentId,
      title: state.bookmark.title,
      url: state.bookmark.url
    };
    api.removeNode(state.bookmark.id).then(function () {
      state.pending = false;
      state.bookmark = null;
      renderUnsaved();
      setStatus(t('removed'), {
        action: {
          label: t('undo'),
          run: function () {
            api.createBookmark({ parentId: snap.parentId, title: snap.title, url: snap.url })
              .then(function (id) {
                state.bookmark = { id: id, parentId: snap.parentId, title: snap.title, url: snap.url };
                renderSaved();
                setStatus(t('restored'));
              }).catch(function () {
                setStatus(t('saveFailed', { what: snap.title }), { error: true });
              });
          }
        }
      });
    }).catch(function () {
      state.pending = false;
      setStatus(t('saveFailed', { what: snap.title }), { error: true });
    });
  }

  /* ── QR ───────────────────────────────────────────────────────────────── */

  function renderQr() {
    if (!openable(state.tab.url)) return;
    state.mode = 'qr';
    clear(nodes.body);

    var wrap = el('div', 'pp-qr');
    var card = el('div', 'pp-qr-card');
    var canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 360;
    card.appendChild(canvas);
    wrap.appendChild(card);
    wrap.appendChild(el('div', 'pp-qr-url', state.tab.url));
    wrap.appendChild(el('p', 'pp-qr-hint', t('qrHint')));

    var ok = false;
    try { ok = MK.qr.render(canvas, state.tab.url, 8); } catch (e) { ok = false; }
    if (!ok) {
      clear(wrap);
      wrap.appendChild(el('p', 'pp-qr-hint', t('saveFailed', { what: t('qrCode') })));
    } else {
      var actions = el('div', 'pp-grid is-three');
      actions.appendChild(tile('copy', t('copyLink'), function () {
        api.copyText(state.tab.url).then(function () { setStatus(t('copied')); })
          .catch(function () { setStatus(t('copyFailed'), { error: true }); });
      }));
      actions.appendChild(tile('download', t('downloadQr'), function () {
        MK.qr.download(canvas, hostname(state.tab.url)).then(function () {
          setStatus(t('saved'));
        }).catch(function () {
          setStatus(t('saveFailed', { what: t('downloadQr') }), { error: true });
        });
      }));
      actions.appendChild(tile('arrowLeft', t('close'), function () {
        setStatus('');
        if (state.bookmark) renderSaved(); else renderUnsaved();
      }));
      wrap.appendChild(actions);
    }
    nodes.body.appendChild(wrap);
  }

  /* ── boot ─────────────────────────────────────────────────────────────── */

  function demoTab() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('state') === 'saved') {
      return { url: 'https://sspai.com/', title: '少数派 - 高质量数字指南', favIconUrl: '' };
    }
    return {
      url: 'https://sspai.com/post/85555',
      title: '把书签当成一张阅读桌：本地优先的书签管理 - 少数派',
      favIconUrl: ''
    };
  }

  function boot() {
    api.init().then(function () {
      var params = new URLSearchParams(window.location.search);
      var settings = api.getSettings();

      var qTheme = params.get('theme');
      if (qTheme === 'light' || qTheme === 'dark') document.documentElement.setAttribute('data-theme', qTheme);
      else if (settings.theme === 'light' || settings.theme === 'dark') {
        document.documentElement.setAttribute('data-theme', settings.theme);
      }

      var qLang = params.get('lang');
      MK.i18n.setLang(qLang === 'zh' || qLang === 'en' ? qLang : MK.i18n.resolve(settings.language));
      MK.i18n.apply(document);
      hydrateIcons();

      if (api.isDemo) {
        nodes.badge.hidden = false;
        nodes.badge.textContent = t('previewShort');
      }

      nodes.open.addEventListener('click', function () { api.openNewtab(); });
      nodes.settings.addEventListener('click', function () { api.openSettings(); });
      nodes.qr.addEventListener('click', renderQr);

      var tabPromise = api.isDemo ? Promise.resolve(demoTab()) : api.getActiveTab();
      return Promise.all([tabPromise, api.getTree(true)]).then(function (res) {
        state.tab = res[0];
        state.tree = res[1];
        renderHeader();

        if (!openable(state.tab.url)) {
          state.mode = 'bad';
          clear(nodes.body);
          var box = el('div', 'pp-state');
          box.appendChild(el('div', 'pp-state-title', t('noActiveTab')));
          box.appendChild(el('p', 'pp-state-desc', t('bookmarkletBlocked')));
          nodes.body.appendChild(box);
          return;
        }

        var hit = state.tree.bookmarks.filter(function (b) { return b.url === state.tab.url; })[0];
        state.bookmark = hit || null;

        var st = params.get('state');
        if (st === 'qr') { renderQr(); return; }
        if (state.bookmark) renderSaved(); else renderUnsaved();
      });
    }).catch(function () {
      clear(nodes.body);
      var box = el('div', 'pp-state');
      box.appendChild(el('div', 'pp-state-title', t('errorTitle')));
      box.appendChild(el('p', 'pp-state-desc', t('errorHint')));
      nodes.body.appendChild(box);
    });
  }

  boot();
})();
