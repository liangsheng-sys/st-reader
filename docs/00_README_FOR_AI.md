# 00 · 所有 AI 开工必读

## 一句话
ST Reader：SillyTavern（下称 ST）的第三方 UI 扩展，在 ST 页面内打开一个全屏"小说阅读器"来读聊天记录。思维链折叠、楼内切换 swipe、划线批注、收藏楼层/收藏 swipe、选段生成脱敏分享卡片；沿用用户已有的主题、美化 CSS、字体（含 Ny-font-manager）与正则。**永远只读。**

## 团队
| 角色 | 谁 | 读哪份专属指令 |
|---|---|---|
| 人类 | 项目所有者，只做验收与后勤 | `07_FEEDBACK.md` |
| 引擎 / 数据层 / 开发环境 / 导出管线 | Codex CLI（GPT astra） | `/AGENTS.md` |
| UI / 视觉 / 阅读体验 / 卡片模板 | Claude Code（Opus 5.5） | `/CLAUDE.md` |
| 规划 / 合同文档 / 交付前只读复查 | Claude Code（Fable） | 本文档全部 |
| 文案润色（可选） | Gemini（网页） | 不碰代码 |

## 文件索引
| 文件 | 用途 | 维护者 |
|---|---|---|
| `01_REQUIREMENTS.md` | 需求清单 F1–F9 / NF，验收对照表 | 规划者 |
| `02_UI_SPEC.md` | 界面设计说明（信息架构、布局、线框） | Opus（T20 产出） |
| `03_TECH_SPEC.md` | 技术规格：目录、模块、已核实的 ST API、core↔ui 接口 | astra |
| `04_TASKS.md` | 任务板。每张卡有 ID、负责 AI、状态、验收标准 | 规划者 / 双方追加 |
| `05_DECISIONS.md` | 已拍板的决定。**任何 AI 不得推翻**，有异议写 06 | 规划者 |
| `06_ISSUES.md` | 问题、异议、跨角色需求 | 谁发现谁写 |
| `07_FEEDBACK.md` | 人类验收记录 | 人类 / 帮人类记录的 AI |
| `handoff/` | 交接信 | 交付任务的 AI |
| `prompts/` | 人类复制给各 AI 的开工提示词 | 规划者 |
| `research/` | 调研与对比 | 规划者 / astra |
| `LICENSES.md` | 所有第三方库、字体、素材的许可记录 | 引入者 |
| `SETUP_WINDOWS.md` | 人类安装、启动开发实例、联接到真实 ST 的步骤 | 规划者 / astra |
| `发布指南.md` | 人类在 GitHub 建仓、推送、发 Release、社区发帖与以后更新；先整合发布 main | astra |

仓库根 [README](../README.md) 为公开使用说明，[CHANGELOG](../CHANGELOG.md) 记录发布版本；外链披露以 D22/D23 为准。

## 通用规则
1. 只做自己任务卡上的事。任务卡在 `04_TASKS.md`。
2. 开工先看 `05_DECISIONS.md` 和 `06_ISSUES.md` 里与自己相关的条目。
3. 每个任务一个分支 `task/<ID>-<短名>`。提交信息中文，首行 `<ID>: 做了什么`。
4. 完成后写交接信到 `handoff/YYYY-MM-DD_<from>_to_<to>_<ID>.md`（模板见 `handoff/README.md`），并把任务卡状态改为 `待验收`。
5. 交付必须附**人类验收步骤**：双击什么、点哪里、看到什么。人类是小白，不会读代码。
6. **只读铁律（D02）**：扩展代码不得调用 `/api/chats/save`、`/rename`、`/delete`、`/import`、`/group/save`、`/group/delete`、`/group/import`，不得调用 `saveChat`、`deleteMessage`、`deleteLastMessage`、`renameChat`、`clearChat`，不得修改 `getContext().chat`、`chatMetadata`、`swipe_id`。批注、收藏、屏蔽词全部存扩展自己的存储。
7. **数据铁律（D03/D04）**：开发只用 `E:\st-reader\.dev\` 下的独立实例与合成数据。任何 AI 不得读、写、列出、复制 `F:\Claude\xinllm\SillyTavern\data\`（或任何真实 ST 数据目录）里的 `chats`、`group chats`、`characters`、`settings.json`。安装到真实 ST 由人类双击脚本完成。
8. **磁盘铁律**：C 盘、F 盘几乎满。不写 C 盘、不写 F 盘、不下载大文件、不装全局工具、不建 node_modules。临时文件只放 `.tmp/`，结束清理。
9. 纯 ESM 原生 JS + CSS，无打包器。第三方库只允许单文件 vendored 进 `vendor/` 且登记 `LICENSES.md`；无明确许可的不许用。
10. 扩展业务只访问同源 `/api/*` 只读接口，不新增自有第三方服务或遥测。D22/D23 是人类明确授权的例外：用户 HTML 可加载外链；HTML 截图默认按 CORS、GET；跨站不带凭据，ST 同源资源保留当前会话 读取并内嵌其引用的图片、字体、样式，显式断网仍可用。D02、数据与磁盘铁律不变。
11. 有新点子写进 `01_REQUIREMENTS.md` 末尾"v2 候选"区，不进 v1。

## 任务状态
`待开始` → `进行中` → `待验收` → `通过` / `退回`（退回附人类一句话原因）
