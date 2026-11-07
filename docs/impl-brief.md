# 工程实现契约（Frontend Engineer 必读）

> **⚠ v1 存档**：v2.0 保留了本文的架构骨架（`shared/api.js` 数据层、无构建、禁 innerHTML 注入、demo 降级层、设计令牌），但设置项已收敛到 `shared/defaults.js` 的 9 个键，QA 参数只余 `?theme=`、`?lang=`、`?fast=1`。涉及已移除功能（引导、布局/密度/字号/宽度、隐藏）的章节不再适用，保留作历史参考。

> 主理人写给前端工程的角色边界与接口契约。视觉细节以 `docs/design-spec.md` + `shared/tokens.css` 为准，交互以 `docs/ux-spec.md` 为准；本文件只约束**架构、数据、API 与验收**，不替代设计。

## 0. 硬约束
- 原生 HTML/CSS/JS，**无框架、无构建步骤、无 npm 依赖**（QR 库以单文件 vendor 形式引入）。
- **无内联 `<script>`**（MV3 CSP）；脚本用经典 `<script defer>`，不用 ES module（保证 `file://` 静态预览可用）。
- **零网络请求**：字体本地、图标内联 SVG、二维码本地生成、favicon 不请求外部服务。
- 所有用户内容（书签标题/URL/文件夹名）用 `textContent` 或属性赋值，禁止拼 `innerHTML`。
- 代码分 IIFE + 单一全局命名空间 `window.MK`，避免全局污染。
- 中文优先、英文完整；所有 UI 文案走 `MK.i18n.t()`，不得硬编码在渲染函数里。

## 1. 文件与职责
```
manifest.json
background.js              # 默认值、右键菜单、favicon 缓存、用量清理
newtab/newtab.html|css|js  # 新标签页（主界面）
popup/popup.html|css|js    # 工具栏弹窗
shared/tokens.css          # 设计令牌（design-architect 产出，工程只消费）
shared/theme-init.js       # 首帧主题：同步读 localStorage 并在 <html> 写 data-theme（防闪白）
shared/i18n.js             # zh/en 文案 + t() + DOM 本地化
shared/api.js              # WebExtension 适配层 + demo 适配层 + settings 存储
shared/qr.js               # QR 渲染/下载（vendor qrcode-generator UTF-8）
shared/vendor/qrcode.js    # 从 node_modules/qrcode-generator/dist/qrcode_UTF8.js 复制，保留 MIT 头
shared/demo-data.js        # 演示书签树（仅无扩展 API 时加载）
shared/icons.js            # 内联 SVG 图标工厂
assets/fonts/*.woff2, assets/icon-*.png
```
Demo 资源只在 `MK.api.isDemo` 时启用；扩展环境不加载 `demo-data.js`（可用动态 script 注入，或直接加载但仅 demo 读取，二者皆可，优先简单）。

## 2. 数据模型（统一规范化）
```js
// 节点
{ id, parentId, index, title, url|null, dateAdded, children: []|null, rootKey: 'toolbar'|'menu'|'unfiled'|'mobile'|null, path: ['工具栏','开发'] }
```
- `MK.api.getTree()` → `{ roots: Node[], byId: Map, bookmarks: Node[], folders: Node[] }`。
- Firefox 根节点 id 形如 `toolbar_____` / `menu________` / `unfiled_____` / `mobile______`；用 id 前缀 + 标题兜底映射，显示名走 i18n（书签工具栏 / 书签菜单 / 其他书签 / 移动端书签）。
- 折叠状态、展开状态只存 UI 状态（storage.local `ui`），不写书签树。

## 3. Settings（`MK.api.settings`）
默认值：
```js
{
  theme: 'system',            // system|light|dark
  layout: 'row',              // row|column
  style: 'card',              // card|compact
  fontSize: 14,               // 12–18
  cardWidth: 200,             // 160–280
  hideEmptyFolders: false,
  showLastFolder: false,
  showHistoryInSearch: true,
  recommendations: true,
  openWith: 'newtab',         // newtab|current
  animations: true,
  showHidden: false,
  language: 'auto',           // auto|zh|en
  onboardingDone: false,
  sidebarWidth: 248,
  sidebarCollapsed: false,
  sortKey: 'default',         // default|frequency|alphabet|adddate
  sortDir: 'asc',
  lastFolderId: null
}
```
存储键：`settings`（对象）、`pinned`（`[{type,id}]`）、`hidden`（`{bookmarks:[],folders:[]}`）、`usage`（`{url:{count,last}}`）、`favicons`（`{host:dataUrl}`）、`ui`（`{expanded:[],scroll:{}}`）。
`settings` 写入用 debounce 300ms；读取失败必须回退默认值，不允许白屏。

## 4. API 适配层（`shared/api.js`）
统一返回 Promise；所有 `browser.*` 调用包 try/catch 并转成 `{ok,data,error}` 或抛出带 code 的错误（二选一，内部统一）。
必须实现：
- 书签：`getTree, createBookmark, updateBookmark, updateFolder, removeNode, moveNode, searchBookmarks`
- 打开：`openUrl(url,{where})` where = `tab|window|private|current`；`openAll(urls,{where})`
- 历史：`searchHistory(q,limit)`、`topHistory(days,limit)`
- 存储：`getSettings/saveSettings/getPinned/setPinned/getHidden/setHidden/getUsage/recordOpen/getFavicon/setFavicon`
- 系统：`getActiveTab()`、`copyText()`、`searchWeb(q)`、`openNewtab()`、`openSettings()`
- 事件：`onChanged(cb)`（bookmarks.onCreated/onRemoved/onChanged/onMoved 合并 debounce 150ms）

**Demo 适配层**：无 `browser.bookmarks` 时启用；用 `localStorage['markoob.demo.v1']` 持久化树/设置/置顶/隐藏/用量；所有方法行为与真实层一致。顶栏显示低调的「演示模式」徽标（仅 demo）。
**favicon**：真实层读 `favicons` 缓存（background 用 `tabs.onUpdated` 缓存 `data:` 图标，上限 300，LRU）；demo 只生成字母色块。**不得**请求 `_favicon/`、`/favicon.ico` 或第三方图标服务。

## 5. 推荐算法
```
对每个书签（去重 URL、排除 pinned/hidden/被 hideEmptyFolders 隐藏的项；**不排除** all 视图内容列表中已显示的项，允许同屏重复）：
  usageScore = log1p(usage[url].count) * 2.2
  historyScore = log1p(近30天访问次数) * 1.0 * recency(0.5–1)
  lastOpenBoost = 最近 7 天打开过 ? 0.8 : 0
  score = usageScore + historyScore + lastOpenBoost
取前 6；不足时用「未收藏的高频历史页」补足，最多 3 条并标注来源。
无数据时给空态文案，不伪造推荐。
```

## 6. 关键行为
- **首帧主题**：`newtab.html` / `popup.html` 的 `<head>` 中、CSS 之前引入**同步** `shared/theme-init.js`；它读 `localStorage['markoob.theme']`（`light|dark`，system 则不写）并设置 `<html data-theme>`。设置变更时同时写 `browser.storage.local` 与 localStorage，二者保持一致。禁止用内联脚本（CSP）。
- **打开书签**：锚点 `href` 保留（可中键/Ctrl 点击），click 记录 usage；`openWith==='current'` 时当前页跳转，否则新标签页。
- **URL 校验**：缺协议自动补 `https://`；拒绝 `javascript:`、`data:`、`vbscript:`；`file://` 打开时复制链接并 toast（Firefox 限制）。
- **删除可撤销**：删除前后快照节点，Toast「撤销」重建（文件夹递归重建，index 尽量还原）。
- **隐私窗口**：调用前先 `browser.extension.isAllowedIncognitoAccess()`，false 时直接 toast「请在扩展详情中允许在隐私窗口运行」，不要静默退化成普通窗口。
- **拖拽**：书签拖到文件夹 = move；书签拖到书签 = 同父排序；仅 `sortKey==='default'` 允许，否则 toast + 「使用默认排序」动作。置顶列表拖拽独立排序。
- **右键菜单**：自绘，键盘可操作（↑↓/Enter/Esc，Shift+F10 触发），视口边缘自动翻转；点击遮罩/Esc/滚动关闭。
- **二维码**：qrcode-generator UTF-8，typeNumber 0，EC 'M'，quiet zone 4 模块；白底（深色主题也用白卡），支持下载 PNG 与复制链接。
- **弹窗**：读取当前 tab；未收藏→表单；已收藏→状态 + 编辑 + 取消收藏；标题≠页面标题时显示「与页面标题同步」。`Enter` 保存，`Esc` 关闭。
- **首次引导**：4 步覆盖层，`settings.onboardingDone` 后不再出现；`#onboarding` 可强制打开。
- **键盘**：`Ctrl/Cmd+K`、`/` 聚焦搜索；方向键按几何位置移动卡片焦点；`Esc` 逐层关闭；`Enter` 打开。
- **响应式**：<1080px 自动收起侧栏；<760px 单列；侧栏 196–320px 可拖拽并持久化（以 `tokens.css` 与 `ux-spec` §0 为准）。
- **状态**：加载骨架（延迟 120ms 显示，一旦显示至少停留 400ms；8s 转错误）、空文件夹、搜索无结果、书签 API 不可用（错误页 + 重试）。

## 7. 静态预览 / 验收钩子
`newtab.html` 在无扩展 API 时自动 demo，并支持查询参数（用于截图走查）：
- `?theme=light|dark` 强制主题（不写设置）
- `?layout=row|column&style=card|compact`
- `?state=settings|onboarding|qr|context|search` 打开对应界面/示例菜单/预填搜索
`popup.html` demo 支持 `?state=saved|unsaved|qr`。
所有状态必须无控制台报错。

## 8. 验收命令
- 语法：`node --check` 所有 JS。
- 规范：`/home/hlub/.workbuddy/binaries/node/workspace/node_modules/.bin/web-ext lint --source-dir markoob-firefox`
- 载入烟测：`timeout 45 /home/hlub/.workbuddy/binaries/node/workspace/node_modules/.bin/web-ext run --source-dir markoob-firefox --firefox=/usr/bin/firefox --no-reload --no-input --args=-headless --start-url about:newtab`，输出出现 `Installed ... as a temporary add-on` 即通过。
- 截图：Firefox headless（`.tmp/shot.sh`），1440×900 与 1920×1080，明暗各一组；状态用 `?state=` 钩子。
- 交付 zip：`cd markoob-firefox && zip -r ../markoob-firefox.zip . -x '*.DS_Store'`（zip 根目录必须是 manifest.json）。

## 9. 工程禁区
- 不引 CDN、不引外部字体、不发 fetch/XHR、不写 `<script>` 内联、不用 `innerHTML` 渲染用户数据、不使用 Chrome-only API（`chrome.tabs.group`、`chrome.search`、`_favicon`）。
- 不修改 `shared/tokens.css` 的语义变量名；需要新变量先在实现中提出来（可追加，不可重命名）。
- 不把设置面板做成独立 options 页；设置是新标签页内的抽屉。
