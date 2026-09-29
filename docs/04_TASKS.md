# 04 · 任务板

状态：`待开始` / `进行中` / `待验收` / `通过` / `退回`。每张卡一次会话能做完。人类用 `prompts/` 里对应提示词开工。

## M0 立项
| ID | 任务 | 负责 | 状态 | 验收标准 |
|---|---|---|---|---|
| T00 | 建仓库与全部合同文档 | 规划者 | 待验收 | 人类读 `01`、`05` 后确认"是我想要的阅读器" |
| T01 | 人类：**F 盘清出 ≥ 5 GB**（真实 ST 在 F 盘，只剩 145 MB）；E 盘保持 ≥ 3 GB | 人类 | 待开始 | 资源管理器里 F 盘可用空间 ≥ 5 GB |
| T02 | 人类：在 `E:\st-reader` 目录能启动 `codex`（astra）与 `claude`（可切 Opus 5.5） | 人类 | 待开始 | 两个都能出现输入框 |

## M1 引擎与开发环境（astra）
| ID | 任务 | 负责 | 状态 | 验收标准 |
|---|---|---|---|---|
| T10 | **开发实例**：`dev/start-dev-st.cmd` + `.dev/config.yaml`（`dataRoot: E:\st-reader\.dev\data`，`port: 8100`，`listen: false`，`whitelistMode: true`）；首次运行自动建 `.dev/`、把 `extension/` 以目录联接挂到 `.dev/data/default-user/extensions/st-reader`；`extension/src/core/readonlyGuard.js`（包装 fetch，命中 D02 禁用接口即 throw）。补全 `SETUP_WINDOWS.md` 的"启动开发实例"一节 | astra | 通过 | 人类双击 `dev\start-dev-st.cmd`，浏览器打开 `http://localhost:8100`，扩展列表里有"阅读器 (ST Reader)"且控制台有占位日志 |
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
| T23a | **卡片工作台·本体**（02 §6.1–6.3 + §6.4 第一层）：入口三处（楼层工具条 🖼、选中浮层"卡片"含跨楼选区、批注面板划线条目）；预览所见即所得；四套模板（继承主题 / 纸张 / 深色 / 书摘）；三档尺寸；三种遮盖样式 + "统一长度"开关；**自动名字替换**总开关（{{char}}→char、{{user}}→user、群成员→char1..N）与实时映射列表（只显示"自动"）；永久屏蔽词列表（增删，与 `store.maskWords` 同表）+ 预览里点词临时遮住 / 加入永久；显示名字行 / 包含思维链 / 底部署名开关；书摘模板带"我的想法"（取该选段的批注）；导出 PNG 到下载目录，导出期间禁用按钮，`onWarning` 在工作台展示；严格按 03 §5.9 选段合同（在 `createCardMessage` 副本上裁剪，`replaceNames:false` 导出）；关闭时释放 handle / DOM / Blob URL。**本卡不做**自定义替换规则 UI 与图片导入：右侧"[管理替换规则…]"按钮显示但灰置，提示"下一版"；"小图案"样式只提供六个内置图标 | Opus | 待验收 | 按 F2 / F2a 验收（屏蔽词、自动名字、三种遮盖、四模板、跨楼选段、导出 PNG）；导出后 ST 聊天与候选不变 |
| T23b | **替换规则与素材管理**（02 §6.4 第二层 + §6.5 + §1.5 "设为替换词"）："管理替换规则"面板（原词 / 替换为文字或图案 / 作用范围全部或仅某角色 / 区分大小写 / 整词，增删改，走 `store.replaceRules`）；三处添加入口（面板 +、预览点词"总是替换为…"、阅读器选中浮层"屏蔽 ▾ → 设为替换词…"）；映射列表补"我的规则"标签与优先级效果；图案选择条（六个内置图标 + `+ 导入图片`）；素材导入（PNG/JPG/WebP/SVG，≤200 KB×30，走 `store.assets`，改名 / 删除含"N 条规则在用"提示）；书摘模板"封面"可选导入图片；规则与素材随 T22 的备份导出 / 导入 | Opus | 待开始 | 在 T23a 通过后开工。按 F2a 验收：自定义规则覆盖自动规则、长词优先、作用范围生效、导入图片能当遮盖图案与替换图案、备份往返后规则与图片仍在 |

## M3 集成与验收
| ID | 任务 | 负责 | 状态 | 验收标准 |
|---|---|---|---|---|
| T30 | **性能与只读审计**：50 MB fixture 打开 < 3 s、翻页流畅、切换聊天内存回落；全仓库 grep 禁用接口为空；`install/link-to-my-st.cmd`（只建目录联接，路径写死为 `F:\Claude\xinllm\SillyTavern\data\default-user\extensions\st-reader`，存在则提示不覆盖）；补全 `SETUP_WINDOWS.md` 安装一节；写 `docs/M3_验收清单.md`（F1–F9 逐条勾选表） | astra | 待开始 | 人类能看懂清单 |
| T31 | **交付前只读复查**：只读铁律、无出站请求、许可登记、`.dev` 未入库 | Fable | 待开始 | 复查报告写 `handoff/` |
| T32 | 人类：双击 `install\link-to-my-st.cmd`，重启 ST，按 `M3_验收清单.md` 逐条验收，结论写 `07_FEEDBACK.md`；退回项由规划者拆新卡 | 人类 | 待开始 | 07 有记录 |
