# 功能与文案清单（v2，由 shared/i18n.js 生成）

> 本表是 `shared/i18n.js` 的镜像，由 `docs/gen-inventory.js` 自动生成，请勿手改。
> 重新生成：`node docs/gen-inventory.js`。

## 通用
| key | zh | en |
|---|---|---|
| appName | Tabmark | Tabmark |
| appDesc | 把书签整理成一张干净的书桌，新标签页一屏直达。 | A calm, local-first bookmark desk on every new tab. |
| search | 搜索书签 | Search bookmarks |
| searchHint | 搜索网页、书签 | Search web or bookmarks |
| historySearch | 搜索历史记录 | Search history |
| rangeToday | 今天 | Today |
| rangeYesterday | 昨天 | Yesterday |
| range7 | 近 7 天 | Last 7 days |
| range30 | 近 30 天 | Last 30 days |
| rangeAll | 全部 | All time |
| historyClear | 清除历史 | Clear history |
| historyClearDesc | 将删除浏览器中的全部历史记录，无法撤销。确定清除？ | This deletes ALL browser history and cannot be undone. Clear it? |
| historyEmpty | 没有匹配的浏览记录 | No matching history |
| historyCleared | 浏览历史已清除 | History cleared |
| wallpaperInk | 文字颜色 | Text color |
| inkAuto | 自动 | Auto |
| inkLight | 浅色 | Light |
| inkDark | 深色 | Dark |
| allBookmarks | 全部书签 | All bookmarks |
| pinned | 置顶 | Pinned |
| recentVisits | 最近浏览 | Recently visited |
| foldersSection | 文件夹 | Folders |
| recentlyAdded | 最近添加 | Recently added |
| loading | 正在读取书签… | Reading bookmarks… |
| errorTitle | 读不到书签 | Bookmarks unavailable |
| errorHint | Firefox 没有授予书签权限。请到扩展管理里允许后重试。 | Firefox blocked bookmark access. Allow it in the add-on manager and retry. |
| retry | 重试 | Retry |
| previewNote | 预览模式：未连接 Firefox 书签接口，数据只存在本页。 | Preview mode: no Firefox bookmark API, data stays on this page. |
| previewShort | 预览 | Preview |

## 空状态
| key | zh | en |
|---|---|---|
| emptyState | 这里还没有书签 | No bookmarks here yet |
| emptyStateHint | 在地址栏点星标收藏页面，或点右上角的 ＋ 手动添加。 | Star a page in the address bar, or use ＋ in the corner. |
| emptyFolderTitle | 空文件夹 | Empty folder |
| emptyFolderHint | 把书签拖进来，或用 ＋ 新建一个。 | Drop a bookmark here, or create one with ＋. |
| emptyPinnedTitle | 还没有置顶 | Nothing pinned yet |
| emptyPinnedHint | 在任意书签上右键，选择「置顶」，常用入口就会排在最上面。 | Right-click any bookmark and choose “Pin” to keep it on top. |
| recentEmptyTitle | 还没有浏览记录 | No history yet |
| recentEmptyHint | Firefox 的历史记录为空，或者没有授予访问权限。 | Firefox history is empty, or access wasn’t granted. |
| recentAllSavedHint | 最近访问的页面都已经收藏了，回书签里就能找到。 | Every recent page is already bookmarked — you’ll find them in your bookmarks. |
| folderAria | {{title}}，文件夹，{{n}} 项 | {{title}}, folder, {{n}} items |
| noResults | 没有找到「{{q}}」 | Nothing found for “{{q}}” |
| noResultsHint | 换个关键词，或者直接去网上搜索。 | Try another word, or search the web. |
| searchWebFor | 在网页中搜索「{{q}}」 | Search the web for “{{q}}” |

## 分组
| key | zh | en |
|---|---|---|
| historyGroup | 浏览历史 | History |
| bookmarksGroup | 书签 | Bookmarks |
| foldersGroup | 文件夹 | Folders |
| items | {{n}} 项 | {{n}} items |
| bookmarkCount | {{n}} 个书签 | {{n}} bookmarks |
| folderCount | {{n}} 个文件夹 | {{n}} folders |

## 排序
| key | zh | en |
|---|---|---|
| sort | 排序 | Sort |
| sortDefault | 默认顺序 | Default |
| sortName | 名称 | Name |
| sortAdded | 添加时间 | Date added |
| sortUsage | 使用频率 | Most used |

## 操作
| key | zh | en |
|---|---|---|
| add | 添加 | Add |
| addBookmark | 添加书签 | Add bookmark |
| addFolder | 新建文件夹 | New folder |
| settings | 设置 | Settings |
| edit | 编辑 | Edit |
| delete | 删除 | Delete |
| rename | 重命名 | Rename |
| done | 完成 | Done |
| cancel | 取消 | Cancel |
| save | 保存 | Save |
| close | 关闭 | Close |
| copyUrl | 复制链接 | Copy link |
| copied | 已复制 | Copied |
| qrCode | 二维码 | QR code |
| downloadQr | 下载图片 | Download image |
| copyLink | 复制链接 | Copy link |
| pin | 置顶 | Pin |
| unpin | 取消置顶 | Unpin |
| openInNewTab | 在新标签页打开 | Open in new tab |
| openInNewWindow | 在新窗口打开 | Open in new window |
| openInPrivate | 在隐私窗口打开 | Open in private window |
| openAllNewTab | 在新标签页打开全部（{{n}}） | Open all in new tabs ({{n}}) |
| openFolder | 打开文件夹 | Open folder |
| viewAll | 查看全部 | View all |
| moreActions | 更多操作 | More actions |
| itemMenu | 书签操作 | Bookmark actions |
| folderMenu | 文件夹操作 | Folder actions |
| menuBlank | 更多操作 | More actions |
| backToAll | 返回全部书签 | Back to all bookmarks |
| sidebarCollapse | 收起侧栏 | Collapse sidebar |
| sidebarExpand | 展开侧栏 | Expand sidebar |
| expandFolder | 展开 | Expand |
| collapseFolder | 收起 | Collapse |
| clearSearch | 清除搜索 | Clear search |
| dropToMove | 拖到文件夹即可移动 | Drop onto a folder to move |

## 表单
| key | zh | en |
|---|---|---|
| titleLabel | 标题 | Title |
| titleHint | 书签标题 | Bookmark title |
| urlLabel | 链接 | URL |
| urlHint | https://example.com | https://example.com |
| folderLabel | 文件夹 | Folder |
| nameLabel | 名称 | Name |
| nameHint | 文件夹名称 | Folder name |
| addBookmarkTitle | 添加书签 | Add bookmark |
| editBookmarkTitle | 编辑书签 | Edit bookmark |
| addFolderTitle | 新建文件夹 | New folder |
| renameFolderTitle | 重命名文件夹 | Rename folder |

## 删除与撤销
| key | zh | en |
|---|---|---|
| deleteBookmarkTitle | 删除这个书签？ | Delete this bookmark? |
| deleteBookmarkDesc | 「{{name}}」将从书签中移除，你可以马上撤销。 | “{{name}}” will be removed from your bookmarks. You can undo this right away. |
| deleteFolderTitle | 删除这个文件夹？ | Delete this folder? |
| deleteFolderDesc | 「{{name}}」及其中所有内容都会被永久删除，且无法撤销。 | “{{name}}” and everything inside will be permanently deleted. This cannot be undone. |
| deletedBookmark | 书签已删除 | Bookmark deleted |
| deletedFolder | 文件夹已删除 | Folder deleted |
| undo | 撤销 | Undo |
| restored | 已恢复 | Restored |
| movedTo | 已移动到「{{folder}}」 | Moved to “{{folder}}” |
| moveFailed | 移动失败 | Could not move |
| bookmarkPinned | 已置顶 | Pinned |
| bookmarkUnpinned | 已取消置顶 | Unpinned |
| folderPinned | 文件夹已置顶 | Folder pinned |
| folderUnpinned | 已取消置顶 | Folder unpinned |

## 错误
| key | zh | en |
|---|---|---|
| privateBlocked | 无法打开隐私窗口，请在扩展详情中允许「在隐私窗口运行」。 | Can’t open a private window. Allow “Run in Private Windows” in the add-on details. |
| fileUrlBlocked | Firefox 扩展不能直接打开本地文件，链接已复制。 | Firefox add-ons can’t open local files. The link was copied instead. |
| bookmarkletBlocked | 这类链接无法直接打开。 | This kind of link can’t be opened directly. |
| saveFailed | 保存失败：{{what}} | Couldn’t save: {{what}} |
| permissionDenied | 权限不足：{{what}} | Permission denied: {{what}} |
| copyFailed | 复制失败 | Couldn’t copy |

## 设置
| key | zh | en |
|---|---|---|
| theme | 主题 | Theme |
| systemTheme | 跟随系统 | System |
| lightTheme | 浅色 | Light |
| darkTheme | 深色 | Dark |
| language | 语言 | Language |
| autoDetect | 自动检测 | Auto |
| zhLabel | 中文 | 中文 |
| enLabel | English | English |
| openWith | 打开方式 | Open bookmarks in |
| newTab | 新标签页 | New tab |
| currentTab | 当前标签页 | Current tab |
| recommendations | 最近浏览 | Recently visited |
| recommendationsDesc | 在首页展示最近访问的网站，数据只在本机计算。 | Show sites you visited lately on the home view. Computed locally. |
| searchHistory | 搜索包含历史 | Search history too |
| searchHistoryDesc | 搜索书签时一并显示浏览历史里的匹配项。 | Include matching pages from your browsing history in search. |
| about | 关于 | About |
| version | 版本 {{v}} | Version {{v}} |
| privacyNote | 所有数据都留在你的浏览器里，Tabmark 不做任何网络请求。 | Everything stays in your browser. Tabmark makes no network requests. |
| resetUsage | 清除使用记录 | Clear usage data |
| resetUsageDesc | 清空用于排序和推荐的打开次数统计。 | Erase open counts used for sorting and recommendations. |
| resetUsageDone | 已清除使用记录 | Usage data cleared |
| shortcuts | 快捷键 | Shortcuts |
| shortcutSearch | 聚焦搜索 | Focus search |
| shortcutAdd | 添加书签 | Add bookmark |
| shortcutSettings | 打开设置 | Open settings |
| shortcutEsc | 关闭当前面板 | Close the open panel |
| dataSection | 数据 | Data |
| behaviorSection | 行为 | Behaviour |
| appearanceSection | 外观 | Appearance |
| aboutSection | 关于 | About |

## 根目录名称
| key | zh | en |
|---|---|---|
| bookmarksToolbar | 书签工具栏 | Bookmarks Toolbar |
| bookmarksMenu | 书签菜单 | Bookmarks Menu |
| otherBookmarks | 其他书签 | Other Bookmarks |
| mobileBookmarks | 移动端书签 | Mobile Bookmarks |
| folder | 文件夹 | Folder |

## 二维码
| key | zh | en |
|---|---|---|
| qrTitle | 二维码 | QR code |
| qrHint | 用手机相机扫描，即可在手机上打开这个页面。 | Scan with your phone camera to open this page on mobile. |

## 弹窗
| key | zh | en |
|---|---|---|
| bookmarkPage | 收藏此页 | Bookmark this page |
| bookmarked | 已收藏 | Bookmarked |
| notBookmarked | 未收藏 | Not bookmarked |
| usePageTitle | 改用页面标题 | Use page title |
| savedTo | 已收藏到「{{folder}}」 | Saved to “{{folder}}” |
| saved | 已保存 | Saved |
| removed | 已取消收藏 | Bookmark removed |
| openNewtab | 打开书签台 | Open Tabmark |
| openSettings | 设置 | Settings |
| noActiveTab | 读不到当前页面 | No active page |
| privateNote | 隐私窗口 | Private window |
| quickSave | 收藏 | Save |
| changeFolder | 更改文件夹 | Change folder |
| syncTitle | 同步标题 | Sync title |
| ppEditTitle | 编辑标题 | Edit title |
| ppSaveHere | 保存到 | Save to |
| ppAlready | 这个页面已在书签中 | This page is already bookmarked |
| ppFolderTip | 下次会默认存到这里 | Next save goes here |

## 搜索下拉与搜索引擎
| key | zh | en |
|---|---|---|
| searchEngine | 搜索引擎 | Search engine |
| enginesTitle | 搜索引擎设置 | Search engines |
| searchWebWith | 用 {{name}} 搜索「{{q}}」 | Search {{name}} for “{{q}}” |
| searchNoMatch | 没有匹配的结果 | No matching results |
| searchNoMatchHint | 回车用 {{name}} 搜索「{{q}}」 | Press Enter to search {{name}} for “{{q}}” |
| historyTag | 历史 | History |
| engineAdd | 添加搜索引擎 | Add engine |
| engineNameLabel | 名称 | Name |
| engineNamePh | 例如 Kagi | e.g. Kagi |
| engineUrlLabel | 搜索地址 | Search URL |
| engineUrlPh | https://example.com/search?q=%s | https://example.com/search?q=%s |
| engineUrlHint | 用 %s 代表关键词，例如 https://example.com/search?q=%s | Use %s for the query, e.g. https://example.com/search?q=%s |
| engineRestore | 恢复默认 | Restore defaults |
| engineHide | 隐藏 | Hide |
| engineShow | 显示 | Show |
| engineDelete | 删除 | Delete |
| engineKeepOne | 至少保留一个可见的搜索引擎 | Keep at least one visible engine |
| engineInvalid | 请填写名称和包含 %s 的地址 | Enter a name and a URL containing %s |
| engineAdded | 已添加搜索引擎 | Engine added |
| engineRemoved | 已删除 | Removed |
| engineMoveUp | 上移 | Move up |
| engineMoveDown | 下移 | Move down |
| engineManage | 管理搜索引擎… | Manage search engines… |

## 文件夹聚合视图
| key | zh | en |
|---|---|---|
| inThisFolder | 本层书签 | In this folder |
| subfoldersOnly | 子文件夹 | Subfolders |
| folderTotal | {{n}} 项 | {{n}} items |

## 整理
| key | zh | en |
|---|---|---|
| organize | 整理 | Organize |
| organizeTitle | 整理书签 | Organize bookmarks |
| organizeBackup | 备份 | Back up |
| organizeBackupDesc | 导出全部书签为 JSON 文件，留作还原依据。 | Export every bookmark as a JSON file you can keep. |
| organizeBackupRun | 导出备份 | Export backup |
| organizeBackupDone | 已导出 {{n}} 项 | Exported {{n}} items |
| organizeDup | 重复书签 | Duplicates |
| organizeDupDesc | 检测指向同一网址的多份书签。 | Find bookmarks pointing at the same URL. |
| organizeDupScan | 扫描 | Scan |
| organizeDupNone | 没有发现重复书签 | No duplicates found |
| organizeDupFound | 发现 {{n}} 组重复，共 {{m}} 项 | {{n}} duplicate groups, {{m}} items |
| organizeDupFix | 删除其余 {{n}} 项 | Delete the other {{n}} |
| organizeDupDone | 已删除 {{n}} 项重复书签 | Removed {{n}} duplicates |
| organizeDupFirst | 请先导出备份，再删除重复项 | Export a backup before deleting |
| organizeIcons | 站点图标 | Site icons |
| organizeIconsDesc | 从已打开的标签页与本地缓存补全图标。 | Fill icons from open tabs and the local cache. |
| organizeIconsRun | 补全图标 | Fill icons |
| organizeIconsDone | 补全了 {{n}} 个图标 | Added {{n}} icons |
| organizeIconsNone | 没有可补全的图标 | Nothing to fill in |
| organizeRemote | 向站点请求图标 | Request icons from sites |
| organizeRemoteDesc | 关闭时只用本地缓存，未命中的站点显示字母色块。开启后会向各网站请求 favicon。 | Off: local cache only, misses show a letter tile. On: each site is asked for its favicon. |
| organizeClean | 清理 | Clean up |
| organizeCleanDesc | 删除空文件夹，并为无标题书签补上域名。 | Remove empty folders and give untitled bookmarks their domain. |
| organizeCleanRun | 开始清理 | Clean up now |
| organizeCleanNone | 没有需要清理的内容 | Nothing to clean up |
| organizeCleanDone | 清理了 {{n}} 项 | Cleaned {{n}} items |
| organizeUndoHint | 删除不可撤销，建议先导出备份。 | Deletes cannot be undone here — export a backup first. |
| organizeDuplicatesUnit | 组 | groups |
| organizeItemsUnit | 项 | items |

## 设置：墙纸与分组
| key | zh | en |
|---|---|---|
| searchSection | 搜索 | Search |
| bookmarksSection | 书签 | Bookmarks |
| wallpaper | 背景墙纸 | Background |
| wallpaperNone | 无 | None |
| wallpaperGradient | 渐变 | Gradient |
| wallpaperImage | 图片 | Image |
| wallpaperPick | 选择图片 | Choose image |
| wallpaperClear | 移除图片 | Remove image |
| wallpaperDim | 遮罩浓度 | Dim |
| wallpaperHint | 图片会在本机压缩后保存，不会上传。 | The image is compressed and stored locally, never uploaded. |
| wallpaperTooBig | 图片过大，请选择 8MB 以内的图片 | Image too large — pick one under 8 MB |
| wallpaperFailed | 这张图片读不出来 | That image could not be read |
| sidebarWidth | 侧栏宽度 | Sidebar width |
| bookmarkStyle | 书签风格 | Bookmark style |
| styleCard | 卡片风格 | Card style |
| styleCompact | 紧凑风格 | Compact style |
| layoutType | 布局 | Layout |
| layoutRow | 行布局 | Row layout |
| layoutCol | 列布局 | Column layout |
| layoutCompactOnly | 列布局仅在紧凑风格下可用 | Column layout is only available with the compact style |
| fontSize | 字体大小 | Font size |
| fontSizeHint | 拖动滑块实时预览，范围 0.8 – 1.3 | Drag the slider to preview, 0.8 – 1.3 |
| styleAdjust | 调整 | Adjust |
| bookmarkWidth | 书签宽度 | Bookmark width |
| bookmarkWidthHint | 拖动滑块实时预览，范围 0.5 – 1.5 | Drag the slider to preview, 0.5 – 1.5 |
| disableAnim | 禁用书签动画 | Disable bookmark animations |
| sizeSmall | 小 | Small |
| sizeDefault | 默认 | Default |
| sizeLarge | 大 | Large |
| sizeNarrow | 窄 | Narrow |
| sizeWide | 宽 | Wide |
| sidebarResetHint | 拖动可调宽，双击复位 | Drag to resize, double-click to reset |

---
共 261 个 key，中英文一一对应。
