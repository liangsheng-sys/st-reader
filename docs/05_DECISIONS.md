# 05 · 已拍板的决定

任何 AI 不得推翻。异议写 `06_ISSUES.md`，由人类决定是否修改本文件。

| # | 日期 | 决定 | 理由 |
|---|---|---|---|
| D01 | 2026-09-28 | **形态：ST 第三方 UI 扩展**（全屏阅读器覆盖层），不是独立网站，也不是酒馆助手脚本 | 运行在 ST 同源页面内，主题、字体（含 Ny-font-manager 的 IndexedDB 字体与注入 CSS）、代码高亮、markdown 管线、角色卡作用域正则全部现成可复用；聊天用 ST 只读 API 按需拉取，372 个角色无需手动导出；酒馆助手脚本做全屏 UI 与持久化都别扭；独立网站要重做美化与正则且每次要手动导出 |
| D02 | 2026-09-28 | **只读铁律**：扩展代码禁止调用 `/api/chats/save`、`/rename`、`/delete`、`/import`、`/group/save`、`/group/delete`、`/group/import`，禁止 `saveChat`、`deleteMessage`、`deleteLastMessage`、`renameChat`、`clearChat`，禁止修改 `chat[]`、`chatMetadata`、`swipe_id`；批注/收藏/屏蔽词全部存扩展自己的存储 | 用户红线："不要让任何 AI 碰我已有的聊天记录" |
| D03 | 2026-09-28 | 开发全程用**独立开发实例**：`node F:\Claude\xinllm\SillyTavern\server.js --dataRoot E:\st-reader\.dev\data --configPath E:\st-reader\.dev\config.yaml --port 8100`，数据根里只有 AI 生成的合成聊天。任何 AI 不得把 dataRoot 指向真实数据目录 | 只读铁律 + 磁盘 |
| D04 | 2026-09-28 | 安装到真实 ST 用**目录联接**：`mklink /J F:\Claude\xinllm\SillyTavern\data\default-user\extensions\st-reader E:\st-reader\extension`；由人类双击 `install\link-to-my-st.cmd` 完成，AI 不执行 | F 盘没空间；AI 不碰真实数据目录 |
| D05 | 2026-09-28 | 存储：IndexedDB（`SillyTavern.libs.localforage`，实例名 `st-reader`）为主；键 = chatKey（`avatar_url/file_name`，群聊 `group:<id>/<file>`）+ 楼层号 + swipe 号 + 文本锚点；提供一键导出/导入 JSON；可选备份到 Data Bank 文件区（`/api/files/upload` 写 `user/files/`，不在 chats 目录） | 不改聊天文件，可迁移 |
| D06 | 2026-09-28 | 分享卡片导出用浏览器端 DOM→PNG，库选 `modern-screenshot`（MIT），单文件 ESM 随扩展分发，不走 CDN | 离线、能带上页面已加载的字体 |
| D07 | 2026-09-28 | 团队：astra（Codex CLI）做引擎/数据层/开发环境/导出管线；Opus 5.5（Claude Code）做 UI/视觉/卡片模板/阅读体验；Fable 做规划、合同文档、任务卡、交付前只读复查；Gemini 不参与代码。**不搭代理层**（CLIProxyAPI / opencodex / OMP / PI 等），各自分开工作，靠同一 git 仓库 + `docs/` 协作 | 与《镜与日》项目一致；任务天然可串行切分；人类维护不了代理层；两个 CLI 已装好 |
| D08 | 2026-09-28 | 项目位置 `E:\st-reader\`（git 仓库）；扩展本体在 `extension/`；开发实例数据在 `.dev/`（gitignore）。**不写 C 盘、不写 F 盘** | 只有 E 盘有余量 |
| D09 | 2026-09-28 | 纯 ESM + 原生 JS + CSS，**不引入打包器与 node_modules**；第三方库以单文件 vendored 进 `extension/vendor/` 并登记 `LICENSES.md` | ST 第三方扩展直接加载源码；省磁盘；用户不会 build |
| D10 | 2026-09-28 | 阅读器楼层复用 ST 的 DOM 类名（`.mes .mes_block .mes_text .name_text .mes_reasoning_details` 等），并把页面所有样式表里 `#chat` 前缀的规则**克隆改写**为 `#stcr_chat`，让用户已有主题/美化/字体 CSS 原样生效。**不复用**按钮类名（`.mes_edit`、`.swipe_right` 等），避免触发 ST 的委托事件 | "支持 ST 美化"的核心手段 |
| D11 | 2026-09-28 | v1 不做：酒馆助手 iframe 界面的交互渲染、AI 生成、编辑聊天、跨设备同步。v1 对酒馆助手界面楼层显示原文/代码块 | 控制范围 |
| D12 | 2026-09-28 | 阅读器根容器 id `#stcr_root`，正文容器 `#stcr_chat`，所有自有类名前缀 `stcr-`；存储键前缀 `stcr:` | 避免与 ST 和其他扩展冲突 |
| D13 | 2026-09-28 | 桌面优先，手机可用（响应式三档：<600 / <1000 / ≥1000 px） | 用户主要在电脑上读 |
| D14 | 2026-09-28 | Cline-pass 杂牌模型只做备胎；Gemini 只润色文档不碰代码 | 能力边界 |
| D15 | 2026-09-30 | **HTML 楼层在阅读器内自行渲染**，修订 D11：用阅读器自己的沙箱 iframe（`sandbox="allow-scripts"`，`srcdoc`，**不**依赖酒馆助手），识别"```围栏内含 `<body>`"与"裸 HTML（正文含 `<html>`/`<body>`/`<style>`且无围栏）"两类；提供宽度预设（手机 390 / 平板 768 / 桌面 1200 / 跟随正文）与自适应高度。分享：静态副本（去脚本、同源）→ PNG，带裁剪框 | 人类痛点：中文 RP 社区常让模型直接产 HTML；ST 聊天栏宽度限制导致渲染难看；酒馆助手没有给其他插件的公开渲染 API，且其 iframe 宽度绑死聊天栏 |
| D16 | 2026-09-30 | 沙箱 iframe **默认断网**（CSP `default-src 'none'`，仅允许内联样式/脚本与 data:/blob: 图片）；用户可在该楼点"允许加载外链资源"临时放开，**每次打开阅读器需重新确认**，并在 README 显著位置披露"外链域名来自你聊天里模型生成的代码，扩展自身不请求任何第三方域名" | NF3 与社区发布规则（披露第三方域名、可关闭） |
| D17 | 2026-09-30 | 许可 **AGPL-3.0**；LICENSE 放仓库根；每个源文件头一行版权注释 | 与宿主 ST 同许可最无争议；社区要求公开源码并声明协议以保护作者 |
| D18 | 2026-09-30 | **仓库根即扩展**：`manifest.json / index.js / style.css / src/ / vendor/` 移到仓库根，`docs/ dev/ install/` 保留；GitHub 仓库 `liangsheng-sys/st-reader`；`homePage` 指向它，`auto_update: true` | ST"安装扩展"直接 `git clone` 仓库并要求根目录有 manifest.json |
| D19 | 2026-09-30 | 收藏分两层：**收藏整个聊天**（抽屉"收藏"页只显示这些）与**收藏楼 / swipe**（右侧批注面板，"本聊天 / 全部聊天"切换） | 人类反馈两处收藏重复 |
| D20 | 2026-09-30 | "按角色"列表**跟随 ST 当前排序**（读 `powerUserSettings.sort_field/sort_order`，字段 `name / create_date / fav / date_last_chat / chat_size`），可在阅读器内临时切换，另加 ST 标签筛选与名字搜索。不引入第三方角色管理脚本 | 人类反馈；复用 ST 已有排序逻辑与数据 |
| D21 | 2026-09-30 | **脱敏阅读模式**：阅读器设置里一个开关，把屏蔽词与替换规则套用到阅读器正文显示（只改显示，不改聊天）；划线锚点始终按未脱敏文本计算 | 人类痛点 [1] |
| D22 | 2026-09-30 | **修订 D16（人类决定）**：HTML 沙箱**默认允许外链**（仅 HTTPS，core 的 allowNetwork:true 边界不变）；Aa 设置里"允许外链"开关可整体关掉，每一块也可单独断网；不再"每次打开阅读器确认"。截图 / 静态导出仍始终断网。README 仍须显著披露"外链域名来自你聊天里模型生成的代码，扩展自身不请求任何第三方域名"，并说明怎么关掉 | 人类原话"我认为外链应该是默认允许的"（T44b 开工时） |
| D23 | 2026-10-01 | **修订 D22 的截图断网要求（人类决定）**：交付“截当前画面”只读快照接口；HTML 截图**默认带上用户 HTML 引用的外链图片、字体和样式**，不另行要求开启/确认。截图准备可按浏览器 CORS 规则读取并内嵌这些展示资源；保留显式 allowNetwork:false。不得新增扩展自有服务域名、遥测、上传聊天、代理或宿主聊天写入。资源来自用户内容，失败需提示；最终静态副本仍去脚本/事件，交互 iframe 不取得宿主同源权限。发布披露应说明资源请求来自用户 HTML，不能再声称截图阶段绝无外链请求 | 人类原话：“opus要你赶紧做‘截当前画面’的接口。还有截图需要默认带上外链素材……这是对插件的要求，没必要阻拦用户自己的sillytavern使用请求。” |

