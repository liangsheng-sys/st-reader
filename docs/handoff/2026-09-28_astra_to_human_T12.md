# T12 交接：只读数据与格式化管线、真实接口合同

分支：`task/T12-core-pipeline`。本卡状态：待验收；T13 尚未开工。

## 做了什么

- 交付 `chatSource / messageModel / regexPipeline / formatter`。最近、角色、群组、聊天摘要与“当前聊天”入口均有真实实现；正文按需取单个聊天，默认每页 30 楼，候选与思维链独立，支持取消与关闭释放。
- 策略 a、b 都在 ST 1.14.0 开发实例实际运行：宿主选雾岚，读星灯；作用域、header 名字宏、目标聊天深度、正则只跑一次、思维链正则均通过。选 b（独立格式化），理由和证据写入 `03 §4.1`。a 仅保留在开发实例做可重跑实验。
- 处理宿主宏解释器的副作用风险（I011）：只展开目标 user/char 与 match，未知宏保留字面量，不调用可能写宿主变量的解释器。Node 中四种危险宏反例均通过。
- `03 §5` 已成为合同 v1：真实签名、JSDoc、字段语义、错误与取消行为、UI 示例、生命周期。落实 I006 的列表、缩略图、摘要、日期/时长/swipeId、当前聊天键；收藏元信息留在 T13。
- 按 T12 卡要求，另交付纯文本引用生成/重定位、名字字面量替换、屏蔽词分段，进入共用自测。DOM Range、orphan 持久化和 PNG 仍属后续卡。
- 合并已验收 T20 的文档分支（合并提交 `a73b71a`），以最新界面需求为准。解决两个 I007 的编号冲突：开发隔离仍为 I007，Opus 的卡片扩展需求改为 **I010**。已同步引用，不修改 Opus 的 UI 代码。

## 改动文件

- `extension/src/core/chatSource.js`、`messageModel.js`、`regexPipeline.js`、`formatter.js`：四个主模块。
- `extension/src/core/hostRuntime.js`：宿主模块加载；`textTransforms.js`：共享纯函数。
- `extension/src/core/core.test.js`、`coreBrowser.test.js`：纯逻辑与开发浏览器实证。
- `extension/index.js`：初始化格式化模块、开发自测入口与网址触发。
- `dev/selftest.mjs`、`dev/test-core.cmd`：Node 检查与双击入口。
- `docs/03_TECH_SPEC.md`、`04_TASKS.md`、`06_ISSUES.md`、`SETUP_WINDOWS.md`、本交接信。
- 人类已有的 `docs/07_FEEDBACK.md` 修改未改动、未纳入本卡提交。

## 人类验收步骤（必填，小白可操作）

1. 资源管理器地址栏粘贴 `E:\st-reader\dev`，回车，双击 **test-core.cmd**。应看到逐行“通过”，最后 **全部通过（36 项）**。按任意键关闭。
2. 双击同目录的 **start-dev-st.cmd**。保持黑窗口打开，等到 **SillyTavern is listening on IPv4: 127.0.0.1:8100**。若开发实例已经在运行，直接用已有窗口。
3. 浏览器打开 **http://localhost:8100**。点顶栏最右边的**角色管理（名片图标）**，点 **雾岚（虚构）**。若打开的是其他角色详情，先点面板左上角的**选择/创建角色（列表图标）**返回列表。应看到雾岚普通聊天的三楼。
4. 按 **F12**（部分笔记本需 Fn+F12），点 **Console / 控制台**。粘贴 `await window.stcrSelfTest()` 并回车。
5. 等最后一行 **全部通过（45 项）**，表格所有 passed 都为 true。策略 a 和 b 都应出现“未选中星灯”“深度”“只跑一次”“思维链”的通过项；当前页面仍是雾岚三楼。
6. 若不想粘贴代码，在控制台开着时打开 **http://localhost:8100/?stcrSelfTest=1&coreWhenChat=1**，然后按第 3 步选雾岚，会自动跑同一套检查。
7. 看到两处“全部通过”即可回复“已验收，继续 T13”。若失败，把控制台报错文字发给工程师；不要通过编辑/发送聊天来修样本。

本卡还没有阅读器窗口，界面由 T21 接入。无需连接 AI，也无需重装 Ny 或字体。若误选星灯时运行，提示先开雾岚是预期保护；切到雾岚后重新运行即可。

## 实际验证记录

- `cmd /d /c dev\test-core.cmd --no-pause`：退出码 0，**36/36**（13 保护 + 8 样本 + 15 core）。验证 header、候选回退、日期、深度、作用域允许名单、预设顺序、捕获组/trim/宏、分页/关闭/空聊天/取消、锚点与脱敏。
- 本机开发浏览器，2026-09-28 22:32（UTC+8）：**45/45**（13 保护 + 15 core + 17 浏览器）。两种策略均实际执行，包含 a 抛错后的设置内容/引用恢复。生产渲染固定 b，不临时修改宿主设置。
- 同轮合成 **21.35 MiB / 1600 楼**：读取 + 取首尾两页 + 渲染末楼 **529 ms**；首 30 楼、末 10 楼。此为本机这一轮观测，不是跨设备性能保证，也不是完整 UI 渲染耗时。
- 三种代码高亮、HTML/q/表格、≥20k 字长楼、CSS 作用域与资源清洗、候选思维链、群聊成员宏、取消请求全部通过。
- 前后宿主 chat/元信息/当前角色/聊天键/正则/允许名单/禁用设置快照一致；禁用列表引用一致。页面最后仍是雾岚普通三楼。
- 浏览器检查后重新流式核对 fixture 文件大小和 SHA-256：全部与 T11 清单一致。ESM 语法检查 13 个文件通过，`git diff --check` 无空白错误。

## 只读自查（必填）

以下在仓库根运行，用 `rg`（ripgrep）完成 grep 自查；无匹配的退出码为 1。

```powershell
rg -n '/api/chats/(save|rename|delete|import|group/(save|delete|import))' extension
# 仅 readonlyGuard.js:3–9 的七条阻断路径常量；没有请求调用。

rg -n '/api/chats/(save|rename|delete|import|group/(save|delete|import))' extension -g '!readonlyGuard.js'
# 空，退出码 1。

rg -n '\b(saveChat|deleteMessage|deleteLastMessage|renameChat|clearChat|addOneMessage|updateChatMetadata|saveMetadata)\s*\(' extension
# 空，退出码 1。

rg -n '(chatMetadata|swipe_id|\.chat\b)\s*([+*/-]?=|\+\+|--)' extension
# 空，退出码 1。

rg -n '(fetch\(|XMLHttpRequest|sendBeacon|WebSocket)' extension
# 两个真实 fetch 入口：chatSource.js:34 与 T11 fixtureSelfTest.js:8。
# 其余为 readonlyGuard.test.js 的内存替身；无 XHR / beacon / socket。
```

- 整个 extension 的禁用路径 grep 不是空：这是 T10 的阻断清单，不能删除它来制造“零命中”。排除清单后为零。
- 人工复查：chatSource 的请求只从八条同源只读 API 白名单发出；不切换宿主角色/聊天；模型只处理读取结果的独立数据。chatMetadata 与 swipe_id 的出现仅为快照、读取、合成测试对象，没有宿主写入。静态 grep 不能代替此调用链检查。
- 本任务是否读、列、复制、写过 `F:\Claude\xinllm\SillyTavern\data`：**否**。核对 ST 只读 public/src 源码；运行既有启动器，数据根固定 `E:\st-reader\.dev\data`。
- 本任务未安装依赖、未建 node_modules、未下载第三方文件；未写 C/F 盘。只启动隔离开发实例，临时目录在 `.tmp/`，交付前关闭本次进程并清理其目录；其他任务已有临时目录保留。

## 已知问题 / 没做的

- I005 的 50 MB 与完整 UI 性能还需 T30；本卡只证明合成 21.35 MiB 管线。ST 的 API 整文件返回，因此仍有整文件解析/内存成本，分页是模型与渲染层。
- 未知宏按字面量保留；消息外部媒体与交互 HTML 不加载，CSS 资源 URL/全局规则不进入正文（03 §4.1、I011）。普通展示 HTML、主题可用的类名和安全 CSS 已验证。
- T13 的 cssScope/store/DOM 锚点，T14 的字体 PNG 尚未开始。主题 `#chat` 克隆不能因本卡安全 CSS 测试通过就视为已经完成。
- 仅实测 ST 1.14.0 开发实例，未声称已验证其他 ST 版本。

## 给下一个人的话

- **Opus：请以 03 §5 合同 v1 接 T21，替换 mock。** 名字/标题/摘要用 textContent；正文 HTML 放 .mes_text；楼/页/候选从 0 开始。先 await initFormatter；切换请求使用 AbortController 和请求代号，离开页面 close。候选状态留在阅读器；代码复制按钮使用自有 stcr- 类。
- 旧规格 store/anchor/export 占位签名不构成已交付接口；本次现有合同以后改动必须记入 06 并在交接信通知你。I006 的收藏标题/片段由 T13 接续。
- **规划者：请在 T23 开工前评估 I010（Opus 原 I007）拆卡。** 建议分别做模板工作台（含第四套书摘）、永久替换规则管理、图片素材导入/管理；可各自验收。当前只是建议，尚未由规划者拍板，不擅自新增任务编号。T13/T14 的数据与导出需求仍按 I010 保留。
- astra 下一张仅在用户说“继续”后领 T13；继续使用 `dev/start-dev-st.cmd` 的隔离预载，不直接启动未隔离 ST。
