# 06 · 问题与异议

谁发现谁写。格式：ID、日期、提出者、影响、状态（open / 已处理 / 不处理）。

| ID | 日期 | 提出者 | 问题 | 影响 | 状态 |
|---|---|---|---|---|---|
| I001 | 2026-09-28 | Fable | **F 盘 300 GB 只剩 145 MB（100%）**，真实 ST 就装在 F 盘。ST 自己保存聊天/设置都可能失败；M3 联接安装与验收前必须先清出 ≥ 5 GB | 阻塞 T32 | open，人类处理（T01） |
| I002 | 2026-09-28 | Fable | E 盘 7.7 GB、C 盘 296 MB、D 2.5 GB、K 7.5 GB。所有工具、缓存、临时文件只能进 E 盘；npm/pnpm 缓存默认写 C 盘，不许跑 `npm install` | 全程 | open，规则已写入 00 |
| I003 | 2026-09-28 | Fable | `messageFormatting()` 按**当前选中角色**与**当前 chat 数组**跑正则与深度。阅读器读其他角色时作用域与深度会错。T12 两种策略均实测后选择 b；证据与限制见 03 §4.1 | T12 | 已处理；宿主选雾岚时读取星灯，作用域/深度/只跑一次均通过 |
| I004 | 2026-09-28 | Fable | Ny-font-manager 用高优先级注入 CSS，且部分规则可能以 `#chat` 或 `.mes_text` 为选择器；cssScope 克隆规则时需处理 `!important` 与 `@font-face`（后者不需克隆，全局生效） | T13 / F5 | open |
| I005 | 2026-09-28 | Fable | 立项记录的真实数据规模：372 个角色目录、1730 个 jsonl、6.5 GB，162 个文件 >10 MB，2 个 >50 MB。必须按需加载单个聊天、分页渲染，不得一次索引全部正文。T12 仅用合成 21.35 MiB / 1600 楼验证分页与释放，没有读取真实数据 | T12 / T30 | open；T12 已完成，50 MB 与整合性能由 T30 验证 |
| I006 | 2026-09-28 | Opus | T20 界面说明（02）需要 §5 补充：①`listCharacters()` / `listGroups()`（含缩略图 URL）、`listByGroup(groupId)`；②ChatSummary 的标题、日期、楼数、预览；③每个 swipe 的 sendDate/reasoningDuration 与楼层 swipeId；④`getCurrentChatKey()`；⑤bookmarks 保存聊天显示名与片段 | T21/T22 | open；①–④已在 T12 实现并写入 03 §5 合同 v1，⑤由 T13 交付 |
| I007 | 2026-09-28 | astra | `--dataRoot` 不会隔离 `public/scripts/extensions/third-party` 的全局扩展；宿主“管理扩展”调用的 `/api/extensions/version` 还可能执行 `git.fetch('origin')`。仅禁用前端扩展不足以满足不写 F 盘。T10 通过 `--import` 预载模块，在开发进程内把全局扩展与程序备份目录改到 `.dev/`，不修改 ST 源码。另固定临时目录、占位开发 access.log 防止迁移旧日志；宿主内置默认设置的 Horde 改为本地未连接后端 | T10 / 后续开发启动 | 已处理；必须用启动脚本，不能省略开发隔离预载模块 |
| I008 | 2026-09-28 | astra | 原规格误写群聊与单聊共用 header、按 group.id 读聊天。核对 ST 1.14 源码后确认群聊 JSONL 全是消息行，读取参数为 chat_id；元信息在群组定义中。T11 样本故意使用不同的 group.id/chat_id，03 §1/§2 已更正 | T12 chatSource / 群聊宏与成员解析 | 已处理；T12 Node 与浏览器均验证第一楼保留、不同 ID、逐成员宏与作用域 |
| I009 | 2026-09-28 | astra | 锁定的 Ny-font-manager 1.1.9 从 IndexedDB Blob 经 ArrayBuffer/FontFace 加载本地字体，并不创建 `@font-face` 或 blob URL。仅克隆 CSS 无法保证截图字体嵌入。T11 安装真实插件与本地 OFL 字体，提供浏览器持久化/应用自测；T14 需验证 PNG 实际字形 | T14 / I004 | open，T14 处理；03 §4.2 已登记事实 |
| I010 | 2026-09-28 | Opus | 人类 T20 反馈后卡片新增需求，需 core 支持：①store 新增 `replaceRules`（`{from, to:{kind:'text'|'icon'|'asset', value}, scope:'all'|avatar, caseSensitive, wholeWord}`），纳入 exportAll/importAll；②store 新增 `assets`（用户导入的小图片，≤200 KB×30，存 Blob 或 dataURL，含名称），纳入导出/导入；③T14 的名字替换/屏蔽变换函数支持"替换为图标或图片元素"与优先级（我的规则 > 自动 > 屏蔽词，长词优先）；④自动规则：单聊 `{{char}}`→`char`、`{{user}}`→`user`、群成员→`char1..N`（按成员顺序）。另：T23 范围因此变大（第四套"书摘"模板、替换规则管理、图片导入），请规划者评估是否拆卡 | T13/T14/T23 | open，编号由 Opus 分支 I007 迁移；建议拆为模板工作台、替换规则、图片素材管理三卡，规划者在 T23 开工前确认 |
| I011 | 2026-09-28 | astra | 宿主 runRegexScript 最终 replacement 会调用全局 substituteParams，characterOverride 不覆盖所有名字宏，且其他宏可能写变量/元信息。T12 只展开目标 user/char 与 match；潜在宏文本走无副作用正则后备，未知宏保持字面量，不执行宏命令。正文也不调用宿主 exclusion 宏扩展 | T12 / 正则兼容与 D02 | 已处理；四类副作用反例进共用自测。此为合同 v1 的明确边界，后续扩宏须另登记审计 |
