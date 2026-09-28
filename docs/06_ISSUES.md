# 06 · 问题与异议

谁发现谁写。格式：ID、日期、提出者、影响、状态（open / 已处理 / 不处理）。

| ID | 日期 | 提出者 | 问题 | 影响 | 状态 |
|---|---|---|---|---|---|
| I001 | 2026-09-28 | Fable | **F 盘 300 GB 只剩 145 MB（100%）**，真实 ST 就装在 F 盘。ST 自己保存聊天/设置都可能失败；M3 联接安装与验收前必须先清出 ≥ 5 GB | 阻塞 T32 | open，人类处理（T01） |
| I002 | 2026-09-28 | Fable | E 盘 7.7 GB、C 盘 296 MB、D 2.5 GB、K 7.5 GB。所有工具、缓存、临时文件只能进 E 盘；npm/pnpm 缓存默认写 C 盘，不许跑 `npm install` | 全程 | open，规则已写入 00 |
| I003 | 2026-09-28 | Fable | `messageFormatting()`（ST `public/script.js:1650-1678`）按**当前选中角色**与**当前 chat 数组**跑正则与深度。阅读器读其他角色的聊天时作用域正则会错、深度会错。需自有正则管线（T12，两种策略见 03 §4.2） | T12 | open |
| I004 | 2026-09-28 | Fable | Ny-font-manager 用高优先级注入 CSS，且部分规则可能以 `#chat` 或 `.mes_text` 为选择器；cssScope 克隆规则时需处理 `!important` 与 `@font-face`（后者不需克隆，全局生效） | T13 / F5 | open |
| I005 | 2026-09-28 | Fable | 真实数据规模：372 个角色目录、1730 个 jsonl、6.5 GB，162 个文件 >10 MB，2 个 >50 MB。阅读器必须按需加载单个聊天、分页渲染；不得一次索引全部正文 | T12 / T30 | open |
| I006 | 2026-09-28 | Opus | T20 界面说明（02）需要 §5 补充：①`listCharacters()` / `listGroups()`（抽屉"按角色"一级列表，含缩略图 URL）；`listByGroup(groupId)`；②`ChatSummary` 含 `{chatKey, title, isGroup, lastDate, messageCount, preview}`；③视图模型每个 swipe 带 `sendDate` 与 `reasoningDuration`，楼层带 ST 当前 `swipeId`（用于"ST 当前"小圆点）；④`getCurrentChatKey()`（"当前"入口，只读）；⑤bookmarks 记录里存聊天显示名与片段，便于跨聊天收藏列表不打开聊天就能显示 | T21/T22 | open，astra 在 T12/T13 处理；UI 先用 mock |
| I007 | 2026-09-28 | astra | `--dataRoot` 不会隔离 `public/scripts/extensions/third-party` 的全局扩展；宿主“管理扩展”调用的 `/api/extensions/version` 还可能执行 `git.fetch('origin')`。仅禁用前端扩展不足以满足不写 F 盘。T10 通过 `--import` 预载模块，在开发进程内把全局扩展与程序备份目录改到 `.dev/`，不修改 ST 源码。另固定临时目录、占位开发 access.log 防止迁移旧日志；宿主内置默认设置的 Horde 改为本地未连接后端 | T10 / 后续开发启动 | 已处理；必须用启动脚本，不能省略开发隔离预载模块 |
