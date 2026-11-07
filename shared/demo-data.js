/* ============================================================================
   demo-data.js — the static preview dataset.

   Used only when the WebExtension bookmark API is unavailable (file:// review
   or a plain HTTP static server). Shape is exactly what shared/api.js
   normalises in the real world: a *flat* node list with parentId + index, so
   both layers go through the same walker and behave identically.

   Content rules
     · real, plausible bookmarks — no lorem, no placeholder domains
     · 3 levels of nesting (工具栏 → 阅读 → 播客, 工具栏 → 工具 → 浏览器扩展)
     · two empty folders (旅行 / 移动端书签) so empty states are reachable
     · usage + history are sparse on purpose: the recommendation block resolves
       to 4 bookmarks + 2 history items and never repeats a pinned item

   Nothing here is fetched. These are strings.
   ========================================================================== */

(function () {
  'use strict';
  var MK = (window.MK = window.MK || {});

  /* Deterministic timestamps so "date added" sorting is stable across reloads. */
  var T0 = 1700000000000;
  var STEP = 3600 * 1000;
  var seq = 0;

  /* ── the tree, written nested because that is how humans read it ──────── */

  var ROOTS = [
    {
      id: 'demo-toolbar',
      rootKey: 'toolbar',
      title: 'toolbar',
      children: [
        {
          id: 'demo-dev',
          title: '开发文档',
          children: [
            { id: 'bm-mdn', title: 'MDN Web 文档', url: 'https://developer.mozilla.org/zh-CN/' },
            { id: 'bm-webext', title: 'web-ext 文档', url: 'https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/' },
            { id: 'bm-caniuse', title: 'Can I use', url: 'https://caniuse.com/' },
            { id: 'bm-cssgrid', title: 'Spec · CSS Grid', url: 'https://drafts.csswg.org/css-grid/' },
            { id: 'bm-node', title: 'Node.js API', url: 'https://nodejs.org/api/' },
            { id: 'bm-svelte', title: 'Svelte 文档', url: 'https://svelte.dev/docs' },
            { id: 'bm-vite', title: 'Vite 中文文档', url: 'https://cn.vitejs.dev/' },
            { id: 'bm-git', title: 'Git 手册', url: 'https://git-scm.com/docs' },
            { id: 'bm-aria', title: 'WAI-ARIA 规范', url: 'https://www.w3.org/TR/wai-aria-1.2/' },
            { id: 'bm-ecma', title: 'ECMAScript 规范', url: 'https://tc39.es/ecma262/' },
            { id: 'bm-wasm', title: 'WebAssembly 规范', url: 'https://webassembly.github.io/spec/' },
            { id: 'bm-browserslist', title: 'Browserslist', url: 'https://browsersl.ist/' }
          ]
        },
        {
          id: 'demo-design',
          title: '设计参考',
          children: [
            { id: 'bm-dribbble', title: 'Dribbble', url: 'https://dribbble.com/' },
            { id: 'bm-mobbin', title: 'Mobbin', url: 'https://mobbin.com/' },
            { id: 'bm-typewolf', title: 'Typewolf', url: 'https://www.typewolf.com/' },
            { id: 'bm-coolors', title: 'Coolors', url: 'https://coolors.co/' },
            { id: 'bm-awwwards', title: 'Awwwards', url: 'https://www.awwwards.com/' },
            { id: 'bm-zcool', title: '站酷 ZCOOL', url: 'https://www.zcool.com.cn/' },
            { id: 'bm-behance', title: 'Behance', url: 'https://www.behance.net/' },
            { id: 'bm-pinterest', title: 'Pinterest', url: 'https://www.pinterest.com/' },
            { id: 'bm-godly', title: 'Godly', url: 'https://godly.website/' },
            { id: 'bm-landbook', title: 'Land-book', url: 'https://land-book.com/' }
          ]
        },
        {
          id: 'demo-reading',
          title: '阅读',
          children: [
            { id: 'bm-sspai', title: '少数派', url: 'https://sspai.com/' },
            { id: 'bm-duku', title: '读库', url: 'https://www.dukuzh.com/' },
            { id: 'bm-douban-movie', title: '豆瓣电影', url: 'https://movie.douban.com/' },
            { id: 'bm-zhihu', title: '知乎', url: 'https://www.zhihu.com/' },
            { id: 'bm-jike', title: '即刻', url: 'https://web.okjike.com/' },
            { id: 'bm-ruanyf', title: '阮一峰的网络日志', url: 'https://www.ruanyifeng.com/blog/' },
            { id: 'bm-hn', title: 'Hacker News', url: 'https://news.ycombinator.com/' },
            { id: 'bm-marginalian', title: 'The Marginalian', url: 'https://www.themarginalian.org/' },
            { id: 'bm-initium', title: '端传媒', url: 'https://theinitium.com/' },
            { id: 'bm-gcores', title: '机核 GCORES', url: 'https://www.gcores.com/' },
            {
              id: 'demo-podcast',
              title: '播客',
              children: [
                { id: 'bm-xiaoyuzhou', title: '小宇宙', url: 'https://www.xiaoyuzhoufm.com/' },
                { id: 'bm-yitian', title: '一天世界', url: 'https://yitianshijie.net/' },
                { id: 'bm-shengdong', title: '声动活泼', url: 'https://sheng.fm/' }
              ]
            }
          ]
        },
        {
          id: 'demo-tools',
          title: '工具',
          children: [
            { id: 'bm-figma', title: 'Figma', url: 'https://www.figma.com/files' },
            { id: 'bm-notion', title: 'Notion', url: 'https://www.notion.so/' },
            { id: 'bm-linear', title: 'Linear', url: 'https://linear.app/' },
            { id: 'bm-vercel', title: 'Vercel', url: 'https://vercel.com/dashboard' },
            { id: 'bm-github', title: 'GitHub', url: 'https://github.com/' },
            { id: 'bm-raycast', title: 'Raycast', url: 'https://www.raycast.com/' },
            { id: 'bm-excalidraw', title: 'Excalidraw', url: 'https://excalidraw.com/' },
            { id: 'bm-tinypng', title: 'TinyPNG', url: 'https://tinypng.com/' },
            { id: 'bm-obsidian', title: 'Obsidian', url: 'https://obsidian.md/' },
            { id: 'bm-warp', title: 'Warp', url: 'https://www.warp.dev/' },
            {
              id: 'demo-ext',
              title: '浏览器扩展',
              children: [
                { id: 'bm-amo', title: '附加组件开发者中心', url: 'https://extensionworkshop.com/' },
                { id: 'bm-mdn-webext', title: 'MDN · WebExtensions', url: 'https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions' },
                { id: 'bm-chrome-ext', title: 'Chrome 扩展文档', url: 'https://developer.chrome.com/docs/extensions/' }
              ]
            }
          ]
        },
        {
          id: 'demo-later',
          title: '稍后读',
          children: [
            { id: 'bm-arena', title: 'Are.na', url: 'https://www.are.na/' },
            { id: 'bm-ziticq', title: '字体传奇', url: 'https://www.ziticq.com/' },
            { id: 'bm-pmthinking', title: '产品沉思录', url: 'https://pmthinking.com/' },
            { id: 'bm-wbw', title: 'Wait But Why', url: 'https://waitbutwhy.com/' },
            { id: 'bm-wanqu', title: '湾区日报', url: 'https://wanqu.co/' },
            { id: 'bm-readwise', title: 'Readwise Reader', url: 'https://readwise.io/read' }
          ]
        },
        { id: 'demo-travel', title: '旅行', children: [] }
      ]
    },
    {
      id: 'demo-menu',
      rootKey: 'menu',
      title: 'menu',
      children: [
        {
          id: 'demo-devmenu',
          title: '开发',
          children: [
            {
              id: 'demo-frontend',
              title: '前端',
              children: [
                { id: 'bm-react', title: 'React', url: 'https://react.dev/' },
                { id: 'bm-vue', title: 'Vue.js', url: 'https://cn.vuejs.org/' },
                { id: 'bm-ts', title: 'TypeScript', url: 'https://www.typescriptlang.org/docs/' },
                { id: 'bm-tailwind', title: 'Tailwind CSS', url: 'https://tailwindcss.com/' },
                { id: 'bm-astro', title: 'Astro', url: 'https://astro.build/' },
                { id: 'bm-next', title: 'Next.js', url: 'https://nextjs.org/' },
                { id: 'bm-nuxt', title: 'Nuxt', url: 'https://nuxt.com/' },
                { id: 'bm-eslint', title: 'ESLint', url: 'https://eslint.org/' }
              ]
            },
            {
              id: 'demo-backend',
              title: '后端',
              children: [
                { id: 'bm-golang', title: 'Go 语言中文网', url: 'https://studygolang.com/' },
                { id: 'bm-pg', title: 'PostgreSQL 文档', url: 'https://www.postgresql.org/docs/' },
                { id: 'bm-redis', title: 'Redis 文档', url: 'https://redis.io/docs/' },
                { id: 'bm-docker', title: 'Docker 文档', url: 'https://docs.docker.com/' },
                { id: 'bm-rust', title: 'Rust 程序设计语言', url: 'https://www.rust-lang.org/' },
                { id: 'bm-k8s', title: 'Kubernetes 文档', url: 'https://kubernetes.io/docs/' }
              ]
            }
          ]
        },
        {
          id: 'demo-life',
          title: '生活',
          children: [
            { id: 'bm-douban-book', title: '豆瓣读书', url: 'https://book.douban.com/' },
            { id: 'bm-xiachufang', title: '下厨房', url: 'https://www.xiachufang.com/' },
            { id: 'bm-weather', title: '中国天气网', url: 'http://www.weather.com.cn/' },
            { id: 'bm-12306', title: '铁路 12306', url: 'https://www.12306.cn/' },
            { id: 'bm-smzdm', title: '什么值得买', url: 'https://www.smzdm.com/' },
            { id: 'bm-natgeo', title: '国家地理', url: 'https://www.nationalgeographic.com/' }
          ]
        },
        {
          id: 'demo-media',
          title: '影音',
          children: [
            { id: 'bm-youtube', title: 'YouTube', url: 'https://www.youtube.com/' },
            { id: 'bm-bilibili', title: '哔哩哔哩', url: 'https://www.bilibili.com/' },
            { id: 'bm-netflix', title: 'Netflix', url: 'https://www.netflix.com/' },
            { id: 'bm-spotify', title: 'Spotify', url: 'https://open.spotify.com/' },
            { id: 'bm-imdb', title: 'IMDb', url: 'https://www.imdb.com/' },
            { id: 'bm-douban-music', title: '豆瓣音乐', url: 'https://music.douban.com/' }
          ]
        }
      ]
    },
    {
      id: 'demo-unfiled',
      rootKey: 'unfiled',
      title: 'unfiled',
      children: [
        {
          id: 'demo-temp',
          title: '临时',
          children: [
            { id: 'bm-webdev', title: 'web.dev', url: 'https://web.dev/' },
            { id: 'bm-undraw', title: 'unDraw', url: 'https://undraw.co/' },
            { id: 'bm-squoosh', title: 'Squoosh', url: 'https://squoosh.app/' },
            { id: 'bm-regex101', title: 'Regex101', url: 'https://regex101.com/' },
            { id: 'bm-jsoncrack', title: 'JSON Crack', url: 'https://jsoncrack.com/' },
            { id: 'bm-carbon', title: 'Carbon', url: 'https://carbon.now.sh/' }
          ]
        }
      ]
    },
    /* mobile stays empty on purpose — it is the "empty folder card" case */
    { id: 'demo-mobile', rootKey: 'mobile', title: 'mobile', children: [] }
  ];

  /* ── flatten to the parentId/index shape api.js consumes ─────────────── */

  var NODES = [];

  function push(raw, parentId, index) {
    seq += 1;
    NODES.push({
      id: raw.id,
      parentId: parentId,
      index: index,
      title: raw.title,
      url: raw.url || null,
      dateAdded: T0 + seq * STEP
    });
  }

  (function walk(list, parentId) {
    list.forEach(function (raw, i) {
      push(raw, parentId, i);
      if (raw.children) walk(raw.children, raw.id);
    });
  })(ROOTS, 'demo-root');

  var ROOT_KEY = {};
  ROOTS.forEach(function (r) { ROOT_KEY[r.id] = r.rootKey; });

  /* ── usage / history ──────────────────────────────────────────────────── */

  var NOW = Date.now();
  var DAY = 24 * 3600 * 1000;

  var USAGE = {
    'https://github.com/': { count: 42, last: NOW - 0.2 * DAY },
    'https://www.figma.com/files': { count: 28, last: NOW - 1.1 * DAY },
    'https://developer.mozilla.org/zh-CN/': { count: 19, last: NOW - 0.4 * DAY },
    'https://sspai.com/': { count: 15, last: NOW - 2 * DAY },
    'https://www.are.na/': { count: 12, last: NOW - 3 * DAY },
    'https://linear.app/': { count: 9, last: NOW - 4 * DAY },
    'https://news.ycombinator.com/': { count: 7, last: NOW - 6 * DAY },
    'https://movie.douban.com/': { count: 6, last: NOW - 9 * DAY }
  };

  /* 知乎 is also a bookmark, so the history group must de-duplicate it and
     exactly two "from your history" entries survive. */
  var HISTORY = [
    {
      url: 'https://www.v2ex.com/',
      title: 'V2EX · 创意工作者的社区',
      visitCount: 22,
      lastVisitTime: NOW - 0.5 * DAY
    },
    {
      url: 'https://juejin.cn/',
      title: '稀土掘金 · 开发者社区',
      visitCount: 18,
      lastVisitTime: NOW - 1.4 * DAY
    },
    {
      url: 'https://www.zhihu.com/',
      title: '知乎 · 有问题，就会有答案',
      visitCount: 12,
      lastVisitTime: NOW - 2.2 * DAY
    }
  ];

  MK.demo = {
    id: 'tabmark.demo.v1',

    /* deep copies — the demo layer mutates its own copy freely */
    nodes: function () {
      return NODES.map(function (n) {
        return {
          id: n.id,
          parentId: n.parentId,
          index: n.index,
          title: n.title,
          url: n.url,
          dateAdded: n.dateAdded
        };
      });
    },

    usage: function () {
      var out = {};
      Object.keys(USAGE).forEach(function (k) {
        out[k] = { count: USAGE[k].count, last: USAGE[k].last };
      });
      return out;
    },

    history: function () {
      return HISTORY.map(function (h) {
        return {
          url: h.url,
          title: h.title,
          visitCount: h.visitCount,
          lastVisitTime: h.lastVisitTime
        };
      });
    },

    /* mixed on purpose: 3 bookmarks + 1 folder */
    pinned: function () {
      return [
        { type: 'bookmark', id: 'bm-github' },
        { type: 'bookmark', id: 'bm-figma' },
        { type: 'bookmark', id: 'bm-sspai' },
        { type: 'folder', id: 'demo-design' }
      ];
    },

    roots: ['demo-toolbar', 'demo-menu', 'demo-unfiled', 'demo-mobile'],
    rootKey: ROOT_KEY
  };
})();
