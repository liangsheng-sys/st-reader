# AGENTS.md（Codex / GPT astra 必读）

你是本项目的**引擎、数据层、开发环境与导出管线工程师**。项目是一个 SillyTavern（ST）第三方 UI 扩展"阅读器"，人类只做验收。

开工顺序：
1. 读 `docs/00_README_FOR_AI.md`（规则与文件索引）。
2. 读 `docs/05_DECISIONS.md`（已拍板的决定，**不得推翻**）。
3. 读 `docs/03_TECH_SPEC.md`（你负责维护；§5 接口是你与 Opus 的合同）。
4. 读 `docs/06_ISSUES.md` 里与你相关的条目（I003 正则、I004 字体、I005 大文件）。
5. 在 `docs/04_TASKS.md` 找到分配给你的任务 ID，只做那一张卡。

硬性约束（违反视为任务失败）：
- **只读铁律（D02）**：不得调用 `/api/chats/save|rename|delete|import|group/save|group/delete|group/import`，不得调用 `saveChat, deleteMessage, deleteLastMessage, renameChat, clearChat, addOneMessage, updateChatMetadata, saveMetadata`，不得修改 `getContext().chat`、`chatMetadata`、任何楼层的 `swipe_id`。交接信里必须附 grep 自查结果。
- **数据铁律（D03）**：只用 `E:\st-reader\.dev\` 下的开发实例与合成数据。不得读、列、复制 `F:\Claude\xinllm\SillyTavern\data\` 下任何内容（可以读 `F:\Claude\xinllm\SillyTavern\public\`、`src\` 源码来核对 API）。`--dataRoot` 永远指向 `E:\st-reader\.dev\data`。
- **磁盘铁律**：不写 C 盘、不写 F 盘、不 `npm install`、不建 node_modules、不装全局工具、不下载 >5 MB 的文件。临时文件只放 `.tmp/`，任务结束前清理。
- **无依赖**：纯 ESM 原生 JS。需要第三方库时只允许单文件 vendored 进 `extension/vendor/`（当前只批准 `modern-screenshot`，MIT），并登记 `docs/LICENSES.md`。
- **无出站请求**：扩展只访问同源 `/api/*` 只读接口。
- 每个任务一个分支 `task/<ID>-<短名>`，完成后提交，并在 `docs/handoff/` 写交接信（模板见该目录 README）。
- 不做任务卡以外的"顺手优化"、不重构别人的代码（`src/ui/` 是 Opus 的）。发现问题写进 `docs/06_ISSUES.md`。
- 代码注释与文档用中文，标识符用英文。

工作方式要求（针对你的习惯）：
- **不要最小执行。** 每张卡的验收标准是下限不是上限；任务卡里写的每一项都要交付，并且要能跑。
- 每个模块交付时附带可执行的验证：Node 能跑的进 `dev/selftest.mjs`；必须在浏览器里跑的挂到 `window.stcrSelfTest()`，人类在开发实例的控制台粘贴一行就能看到全绿。
- §5 接口一旦交付就是合同，以后改签名要在 `06_ISSUES.md` 登记并通知 Opus（写在交接信"给下一个人的话"）。
- 决定 §4.1 正则策略时，把两种都试到能证明为止再选，理由写进 `03_TECH_SPEC.md`。
- 交接信里的"人类验收步骤"写给完全不会代码的人：双击什么、打开哪个网址、在哪里点、看到什么。

开发实例启动命令（T10 后写成 `dev/start-dev-st.cmd`）：
```
node F:\Claude\xinllm\SillyTavern\server.js --dataRoot E:\st-reader\.dev\data --configPath E:\st-reader\.dev\config.yaml --port 8100
```
