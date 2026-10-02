# 04 · 任务板

状态：`待开始` / `进行中` / `待验收` / `通过` / `退回`。每张卡一次会话能做完。人类用 `prompts/` 里对应提示词开工。

## M0 立项
| ID | 任务 | 负责 | 状态 | 验收标准 |
|---|---|---|---|---|
| T00 | 建仓库与全部合同文档 | 规划者 | 通过 | 人类读 `01`、`05` 后确认"是我想要的阅读器" |
| T01 | 人类：**F 盘清出 ≥ 5 GB**（真实 ST 在 F 盘，只剩 145 MB）；E 盘保持 ≥ 3 GB | 人类 | 通过（2026-10-01 只读卷容量核对：F 约 37.17 GiB，E 约 6.84 GiB；未访问真实数据） | 资源管理器里 F 盘可用空间 ≥ 5 GB |
| T02 | 人类：在 `E:\st-reader` 目录能启动 `codex`（astra）与 `claude`（可切 Opus 5.5） | 人类 | 待开始 | 两个都能出现输入框 |

## M1 引擎与开发环境（astra）
| ID | 任务 | 负责 | 状态 | 验收标准 |
|---|---|---|---|---|
| T10 | **开发实例**：`dev/start-dev-st.cmd` + `.dev/config.yaml`（`dataRoot: E:\st-reader\.dev\data`，`port: 8100`，`listen: false`，`whitelistMode: true`）；首次运行自动建 `.dev/`、把仓库根以目录联接挂到 `.dev/data/default-user/extensions/st-reader`；`src/core/readonlyGuard.js`（包装 fetch，命中 D02 禁用接口即 throw）。补全 `SETUP_WINDOWS.md` 的"启动开发实例"一节 | astra | 通过 | 人类双击 `dev\start-dev-st.cmd`，浏览器打开 `http://localhost:8100`，扩展列表里有"阅读器 (ST Reader)"且控制台有占位日志 |
| T11 | **合成数据** `dev/fixtures/gen.mjs`（Node 内置模块，无依赖）：生成 ≥3 个角色（其一带作用域正则且加入 `character_allowed_regex`）、1 个群聊、楼层含 3–5 个 swipe 且各带思维链、代码块（≥3 种语言）、原始 HTML、超长楼（≥20k 字）、一份 ≥20 MB 聊天；一套带 `custom_css`（含 `#chat .mes_text` 与 `#chat .mes_text q` 选择器）的主题；≥3 条全局显示类正则（其一使用 `{{char}}`，其一带 minDepth/maxDepth）；开发实例里安装 Ny-font-manager 并登记 LICENSES。**不得复制任何真实聊天** | astra | 通过 | 双击开发实例后能在 ST 里打开这些角色与群聊；正则与主题可见 |
| T12 | **core 第一批**：`chatSource / messageModel / regexPipeline / formatter`；决定 §4.1 策略并写明理由；把 §5 接口写实；`dev/selftest.mjs`（Node 跑纯逻辑：header 解析、swipe/思维链取值、锚点、脱敏文本变换）+ 浏览器端 `stcrSelfTest()`（在开发实例控制台跑正则命中/深度/只跑一次断言） | astra | 通过 | `node dev/selftest.mjs` 全绿；开发实例控制台 `stcrSelfTest()` 全绿；未选中角色 A 时渲染 A 的聊天，A 的作用域正则命中 |
| T13 | **core 第二批**：`cssScope / store / anchor`；主题切换、新增 style 后重跑；store 导出/导入 JSON；锚点重定位含 orphan | astra | 通过 | 控制台演示：切主题后 `#stcr_chat` 内规则更新；导出 JSON 再导入数据一致；改正则后锚点仍能定位或进 orphan |
| T14 | **cardExport**：vendored `modern-screenshot`（登记 LICENSES）；`exportCard(rootEl, opts)` → PNG Blob；名字替换与屏蔽 span 变换函数（纯函数，进 selftest）；验证 Ny-font-manager 的 IndexedDB 字体在 PNG 里生效 | astra | 通过 | 控制台对一个楼层调用后下载出 PNG，字体与主题色正确，屏蔽词被盖住 |

## M2 阅读体验（Opus；T20 可立即开始，T21 起需 T12 交付）
| ID | 任务 | 负责 | 状态 | 验收标准 |
|---|---|---|---|---|
| T20 | **界面设计说明** `docs/02_UI_SPEC.md`：信息架构、三档宽度布局、抽屉、楼层工具条、选中浮层、批注面板、卡片工作台、设置条；线框用文字/ASCII；给出 2 套视觉方向（A/B）供人类选 | Opus | 通过 | 人类选出 A 或 B，并回答"找得到东西" |
| T21 | **阅读器主界面**：入口（魔杖菜单 + 顶栏按钮 + `/reader`）；抽屉四入口；正文分页/滚动；字号/行距/宽度/隐藏用户楼；思维链折叠与全展开；**swipe 切换**；接 §5 接口；ST 类名复用（D10/D12） | Opus | 通过 | 按 F1/F1a/F1b 验收；退出后 ST 主界面无变化 |
| T22 | **划线 / 批注 / 收藏 UI**：选中浮层、多色划线、批注编辑、批注列表与跳转、收藏楼层与收藏 swipe、收藏列表跨聊天；接 T13 | Opus | 通过 | 按 F7/F8 验收；刷新后仍在 |
| T23a | **卡片工作台·本体**（02 §6.1–6.3 + §6.4 第一层）：入口三处（楼层工具条 🖼、选中浮层"卡片"含跨楼选区、批注面板划线条目）；预览所见即所得；四套模板（继承主题 / 纸张 / 深色 / 书摘）；三档尺寸；三种遮盖样式 + "统一长度"开关；**自动名字替换**总开关（{{char}}→char、{{user}}→user、群成员→char1..N）与实时映射列表（只显示"自动"）；永久屏蔽词列表（增删，与 `store.maskWords` 同表）+ 预览里点词临时遮住 / 加入永久；显示名字行 / 包含思维链 / 底部署名开关；书摘模板带"我的想法"（取该选段的批注）；导出 PNG 到下载目录，导出期间禁用按钮，`onWarning` 在工作台展示；严格按 03 §5.9 选段合同（在 `createCardMessage` 副本上裁剪，`replaceNames:false` 导出）；关闭时释放 handle / DOM / Blob URL。**本卡不做**自定义替换规则 UI 与图片导入：右侧"[管理替换规则…]"按钮显示但灰置，提示"下一版"；"小图案"样式只提供六个内置图标 | Opus | 通过 | 按 F2 / F2a 验收（屏蔽词、自动名字、三种遮盖、四模板、跨楼选段、导出 PNG）；导出后 ST 聊天与候选不变 |
| T23b | **替换规则与素材管理**（02 §6.4 第二层 + §6.5 + §1.5 "设为替换词"）："管理替换规则"面板（原词 / 替换为文字或图案 / 作用范围全部或仅某角色 / 区分大小写 / 整词，增删改，走 `store.replaceRules`）；三处添加入口（面板 +、预览点词"总是替换为…"、阅读器选中浮层"屏蔽 ▾ → 设为替换词…"）；映射列表补"我的规则"标签与优先级效果；图案选择条（六个内置图标 + `+ 导入图片`）；素材导入（PNG/JPG/WebP/SVG，≤200 KB×30，走 `store.assets`，改名 / 删除含"N 条规则在用"提示）；书摘模板"封面"可选导入图片；规则与素材随 T22 的备份导出 / 导入 | Opus | 通过 | 在 T23a 通过后开工。按 F2a 验收：自定义规则覆盖自动规则、长词优先、作用范围生效、导入图片能当遮盖图案与替换图案、备份往返后规则与图片仍在 |

## M3 集成与验收
| ID | 任务 | 负责 | 状态 | 验收标准 |
|---|---|---|---|---|
| T30 | **性能与只读审计**：50 MB fixture 打开 < 3 s、翻页流畅、切换聊天内存回落；全仓库 grep 禁用接口为空；`install/link-to-my-st.cmd`（只建目录联接，路径写死为 `F:\Claude\xinllm\SillyTavern\data\default-user\extensions\st-reader`，存在则提示不覆盖）；补全 `SETUP_WINDOWS.md` 安装一节；写 `docs/M3_验收清单.md`（F1–F9 逐条勾选表）；**另含**：修 I018①、按 06 拍板语义实现 I019、≥50 MB 合成文件实测、`unlink-from-my-st.cmd`、修 I013 反复发生、把 `main` 快进到最终提交 | astra | 待验收（人工1–7步已完成；NF2肉眼流畅，打开定量遗留 I020；本轮预取达标，I021 已由 T42 完成） | 人类能看懂清单；性能数据及未达标项如实见 T30 交接 |
| T31 | **交付前只读复查**：只读铁律、无出站请求、许可登记、`.dev` 未入库 | Fable | 通过（报告 `handoff/2026-09-29_fable_to_human_T31.md`；须在 T30 后再复查一次） | 复查报告写 `handoff/` |
| T32 | 人类：双击 `install\link-to-my-st.cmd`，重启 ST，按 `M3_验收清单.md` 逐条验收，结论写 `07_FEEDBACK.md`；退回项由规划者拆新卡 | 人类 | 通过（人工步骤完成；NF2定量遗留另记I020） | 07 有记录 |

## M4 使用反馈修补与发布（v0.1.0）
先 T40（重构目录），其余 astra / Opus 卡按目录分工可并行；T44b 需 T44a 交付。
| ID | 任务 | 负责 | 状态 | 验收标准 |
|---|---|---|---|---|
| T40 | **仓库重构为可直接安装**（D17/D18）：`extension/*` 移到仓库根；更新 `dev/`、`install/`、自测与文档里的路径；`LICENSE`（AGPL-3.0）；每个源文件头加版权行；`manifest.json` 补 `homePage`、`auto_update:true`、`version 0.1.0`；`.gitignore` 加 `docs/*.png`；人类的反馈 txt 移到 `docs/feedback/`；`main` 快进 | astra | 通过（人类 2026-09-30 验收） | `node dev/selftest.mjs` 与 `ui.test.js` 全绿；人类重跑 `install/unlink-from-my-st.cmd` + `link-to-my-st.cmd` 后 ST 里扩展正常 |
| T41 | **core 修补**：①遮盖宽度按原词实际像素宽度（F14④，DOM 适配层测量）；②`ReplaceRule.to` 文字类型加 `background`（#RRGGBB）；③`maskCodeText(text, opts)` 与 `maskHtmlString(html, opts)`：只改文本节点，不碰标签 / 属性 / `<script>` 内容（F10b、F10a 用）；④store bookmarks 新增 `kind:'chat'`（F13）；⑤§5 合同更新；全部进 selftest | astra | 通过（人类 2026-09-30 验收；T42 已完成 I026 UI 测量接线） | selftest 新增项全绿；03 §5 有签名 |
| T42 | **UI 细节**（F14①②③、F15①②③）：Aa 对齐；隐藏思维链开关；替换文字背景色与色块颜色选择器（8 个预设 + 色号输入）；遮盖高度贴行高；I021 独立开关接线 | Opus | 通过（人类 2026-09-30 验收；遮盖高度按意见改为字高） | 人类肉眼；I021 场景：关自动名字仍替换"灯塔→某地" |
| T43 | **抽屉改造**（F12、F13）：按角色页跟随 ST 排序 + 临时切换下拉 + ST 标签筛选 + 搜索框；收藏页改为"收藏的聊天"（聊天列表项与阅读器顶栏加收藏聊天按钮）；楼 / swipe 收藏只留右侧面板 | Opus | 通过（人类 2026-09-30 验收；core 接口见 I030） | 372 角色样本（T11 可生成大量空角色）10 秒内找到；两处收藏不重复 |
| T44a | **HTML 渲染 core**（D15/D16）：`htmlRenderer.js`：识别两类 HTML；生成 `srcdoc`（注入高度上报脚本 + CSP meta）；`sandbox="allow-scripts"`；`allowNetwork` 开关重建 srcdoc；`renderStatic(html, opts)` 生成去脚本同源静态副本供截图；`exportRenderedHtml(html, {width, scale, maskWords, rules, crop})` → PNG Blob；进 selftest（识别、脱敏文本节点、CSP 字符串） | astra | 通过（人类 2026-09-30 验收；Node116/116；UI27/27；专项37/37；浏览器156/156；§5.13/I028/I029） | 默认断网渲染、脱敏 PNG；默认 2 倍、可选 3 倍清晰度；在静态预览任意框选、移动、调四角，支持缩小预览；正式 UI 仍属 T44b |
| T44b | **HTML 渲染 UI**（F10/F10a/F10b）：楼内"渲染 / 原文"切换（默认按设置，默认渲染）、宽度预设、允许外链按钮（含每次确认与提示文案）；卡片工作台"渲染视图"来源 + 裁剪框；代码块"复制脱敏版"按钮；02_UI_SPEC 补 §10 | Opus | 通过（人类 2026-10-01 验收；验收意见补做见交接信；截当前进度见 I032） | 用人类两个提示词生成的样本 HTML（由 T11 fixture 追加 2 楼合成样本，不用真实聊天）验收 |
| T45 | **脱敏阅读模式**（F11/D21）：设置条开关；渲染时套用 `maskText` / 规则；锚点按未脱敏文本；开关状态持久化 | Opus（core 需要什么写 06） | 通过（人类 2026-09-30 验收；core 无需新接口） | 开启后正文脱敏；已有划线不孤立 |
| T46 | **发布材料**（F16）：README.md 发布版（中文为主 + 英文简介；功能 GIF 可选；安装 URL；只读声明；第三方域名披露；参考项目致谢；AGPL 声明）；`CHANGELOG.md`；`docs/发布指南.md`（小白版：GitHub 网页建仓 → `git remote add` → 首次 push 用浏览器登录 → 打 tag v0.1.0 → 发 Release → 社区帖子模板含"公开源码、无信息收集、外链域名披露"） | astra | 通过（人类 2026-10-01“一直到46都做完了”）| 人类读指南能独立完成推送；本卡不实际推送或代替 T47/T48 |
| T47 | **发布前复查**：D02 / NF3 再审（含沙箱 CSP）；许可头；README 披露是否属实 | Fable | 通过（报告 `handoff/2026-10-01_fable_to_human_T47.md`，main 已快进） | 报告写 handoff |
| T48 | 人类：照 `docs/发布指南.md` 推送 GitHub，在真实 ST 里用 URL 重新安装验证，社区发帖 | 人类 | 待开始 | 帖子链接记 07 |
| I032 | **当前画面快照与外链截图 core（D23）**：createSandbox.snapshot() 返回当前静态 HTML；表单值可脱敏、滚动可还原、画布与动态样式可保留；生命周期和消息校验；HTML 截图默认内嵌外链展示资源，失败提示，保留断网；§5 合同、Node/浏览器/PNG 验证与交接 | astra | 待验收（2026-10-01；Node 119/119、UI 30/30、浏览器 172/172；交接见 I032_snapshot；不开始 T46） | 两个游戏结局、表单脱敏、滚动区、外链图片/字体/CSS 的实际 PNG；宿主不变；Opus 可按合同接“截当前画面” |

## M5 二次安装反馈修补（v0.2.0）
原文 `docs/feedback/2026-10-01_二次安装问题反馈.txt` 与四张截图（截图不入库）。T50/T52/T55 Opus，T51/T53/T54a astra，可并行；T54b 需 T54a。
| ID | 任务 | 负责 | 状态 | 验收标准 |
|---|---|---|---|---|
| T50 | **正文居中 bug**（反馈 1）：在开发实例用 ST 自带五套主题（Azure / Cappuccino / Celestial Macaron / Dark Lite / Dark V 1.0）与"气泡 / 文档 / 默认"三种 chat_display 逐一复现；查明是 cssScope 克隆了哪条规则、还是 `.stcr-mes--system` 误判、还是宿主 `text-align` 继承；修复并加浏览器回归断言（每套主题下 `.mes_text` 的 computed textAlign 为 start/left）。若根因在 core，写 06 交给 astra 并先在 UI 兜底 | Opus | 通过（人类 2026-10-02“已全部验收”） | 五套主题 × 三种显示模式下正文左对齐；人类在真实 ST 复查 |
| T51 | **裸 HTML 边界 + 透明背景**（D26）：`detectHtmlBlocks` 裸 HTML 只返回标签区间，前后散文留给正文；返回多段时逐段独立渲染；交互 iframe `background: transparent`，`allowtransparency`；selftest 覆盖"一行散文 + 大段 HTML + 一行散文" | astra | 通过（人类 2026-10-01 验收 core；UI 接线仍留给 Opus，见 I038） | fixture 新增该样本；开发演示散文在 iframe 外、按格式化器排版；正式阅读器仍需 Opus 接线 |
| I041 | **交互 HTML 高度抖动**（Opus T52 反馈；人类 2026-10-02 指派）：修复折叠外边距导致的高度循环；三种宽度稳定、交互可增高/缩短、内部滚动区保持，附浏览器回归 | astra | 通过（人类 2026-10-02“已通过，请继续T54a”） | 1366 / 1024 窗口下纸月样本高度稳定、无根滚动溢出；两层隔离与宿主只读保持 |
| T52 | **宽度与伸出**（D27，反馈 2）：①"跟随 ST"宽度改为读取宿主 `#sheld` 实际宽度（ResizeObserver 跟随）；②HTML 块在正文内时去掉白色外框；③预设宽度 > 正文宽度：伸到视口可用宽度（左右各留 16px），仍不够则 `transform: scale()` 等比缩到可用宽度并保持高度自适应，不再横向裁切；分页模式同样处理 | Opus | 通过（人类 2026-10-02“已全部验收”） | 桌面 1200 在 1366 宽窗口下完整可见；跟随正文时与 ST 聊天栏等宽（误差 ≤ 2px） |
| T53 | **重开提速**（D24）：`chatSource` 内存 LRU（3 个 / 150 MB）缓存原始数组与页模型；列表项悬停或打开抽屉时预取当前聊天第一页；缓存命中时不再请求 `/api/chats/get`，但用 `/api/chats/search` 返回的 `file_size`/`last_mes` 校验是否过期；selftest 覆盖命中 / 失效 / 容量淘汰 | astra | 待验收（功能 142/142 Node、203/203 浏览器；**300 ms 未达标，I040 open**；抽屉重展开接线见 I042） | 第二次打开同一聊天 < 300 ms（控制台计时）；文件变化后重新拉取 |
| T54a | **版本与更新 core**（D25）：`updateService.js`：`getVersion()`（读 manifest）、`checkUpdate()`（POST `/api/extensions/version` {extensionName:'st-reader', global}）、`runUpdate()`（POST `/api/extensions/update`）、`getChangelog()`（fetch 同源扩展目录 `CHANGELOG.md`，解析为版本段落）、`store.settings` 记 `lastSeenVersion`；全局 / 用户目录两种安装位置都要处理；D02 清单不变，README 披露补"检查更新由 ST 访问 github.com" | astra | 待验收（Node 145、UI 30、完整浏览器 210；开发联接零 Git；交接见 T54a） | 开发实例里（联接安装，无 git 远端）按钮显示"开发目录，不可更新"而不报错；selftest 覆盖 changelog 解析 |
| T54b | **版本与更新 UI**：Aa → 更多设置顶部显示"ST Reader v0.2.0"、"检查更新"按钮（有新版 → "立即更新" → 完成后提示刷新）；更新后首次打开阅读器弹"本次更新"面板（CHANGELOG 对应版本段）；可关闭"更新提醒" | Opus | 通过（人类 2026-10-02 验收） | 人类在真实 ST 点检查更新能看到结果 |
| T55 | **使用说明**（反馈 5）：写 `docs/使用说明.md`（面向用户、自然语言、按"读 / 记 / 分享 / HTML / 设置与备份 / 常见问题"组织，≤ 2500 字，不出现任务 ID 和内部术语）；阅读器 Aa → 更多设置加"使用说明"按钮，在阅读器内以面板渲染该文件（同源 fetch + ST 的 showdown + DOMPurify），README 也链接它 | Opus | 通过（人类 2026-10-02“已全部验收”） | 人类读完能自己找到每个功能 |
| T56 | 社区帖子：规划者已写草稿 `docs/社区帖子_v0.1.0.md`，人类改成自己的口气后发 | 人类 | 待验收 | 人类满意 |
| T57 | **整合与 0.2.0**：①把 `task/T53-memory-cache` 合入 main（冲突以 main 为准，I047）；②按 D28 改 T53 校验时机，首屏 < 300 ms 进浏览器自测；③manifest 0.2.0；④CHANGELOG 0.2.0 补重开提速与 D29 静音两行；⑤README 安装节 + 使用说明常见问题 + SETUP §3 写 D30；⑥README 只读节加 D29 那句话；⑦自测全绿后快进 main，停下等 Fable 复查 | astra | 待开始 | Node / 浏览器 / UI 自测全绿；缓存命中首屏 < 300 ms；文档三处有 D30 |
| T58 | 人类：按发布指南第 9 节推送与发 Release | 人类 | 待开始 | GitHub 有 v0.2.0 |
| T59 | **M5 收尾 UI**：①I042 抽屉每次 `open()` 调 `prefetchCurrentChat().catch(()=>{})`；②D28 横幅"此聊天有新内容，点击重新加载"；③D29 约束③：静音恢复加 `try/finally`、`pagehide`、根节点移除兜底，且只选 `#chat .mes style`；④D30 两份并存提示（core 能区分则接，否则写 06） | Opus | 待开始 | 在 T57 合并后的 main 上开工；抽屉重开能看到预取请求；fixture 改动后横幅出现；异常后宿主样式恢复 |
| T60 | 人类：按使用说明"两份安装"一节，双击 `install/unlink-from-my-st.cmd` 去掉联接，只保留 URL 安装；重启 ST 确认阅读器只出现一次 | 人类 | 通过（2026-10-02 人类运行 unlink 显示“联接不存在”，联接早已清理） | 扩展列表只有一个"阅读器 (ST Reader)" |
| T61 | 发布前复查 0.2.0（T47 清单 + D28 / D29 / D30 落实核对） | Fable | 待开始 | 报告写 handoff |

