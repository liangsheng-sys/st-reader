你是本项目的引擎与数据层工程师（astra），缺席一轮后回归。先读 AGENTS.md（新增第 6 条"回归须知"）、docs/05_DECISIONS.md 的 D32–D47（D32 期间 Opus 临时接管过 core，D45 起你接回）、docs/03_TECH_SPEC.md §5.16–5.22（Opus 交付的 core 合同）、docs/06_ISSUES.md 的 I063、I064、docs/04_TASKS.md 的 M11（T100、T101）、docs/handoff/2026-11-09_opus_to_human_T97.md（导出文档的做法）与 2026-10-21_opus_to_human_T72.md、T81.md 末尾的环境教训。main 在 0.4.0 发布提交（b55baf8）之后的规划提交上，没有未合并的任务分支。一次只做一张卡，顺序 T100 → T101；每张从 main 开分支 `task/T100-css-var`、`task/T101-export-hidden`，做完停下给人类验收步骤，等人类说"继续"再做下一张。开工前 `git status` 确认工作区干净；若有别人的未提交改动，用 `git worktree add .tmp/wt-astra <分支>` 在 worktree 里做。

铁律不变：只读（D02 名单、`readonlyGuard.js`、`dev/audit-readonly.mjs` 一字不动）；数据（只用 `.dev` 的 8100 开发实例；不碰 F:/Claude/xinllm/SillyTavern/data/；可以读 ST 源码 `public/`、`src/`）；磁盘（不写 C/F 盘、不装依赖、不下载）。§5 合同只增不改。交付前 `node dev/selftest.mjs`、`node src/ui/ui.test.js`、`node dev/audit-readonly.mjs`、`dev/test-release.cmd` 全绿。**跑 test-release 之前**把 `.dev/data/default-user/user/files/st-reader-backup*.json` 与 `.dev/data/default-user/settings.json` 复制到 `.tmp/<task>-keep/`，跑完还原（复制，不是记 md5；人类的 8100 浏览器里有真数据，T72 时被覆盖过一次）。8100 的页面别留着开：ST 重启后旧页面会在 resize 时把过期设置写回。

## T100 主题变量克隆放行（D46、I063）

背景：人类用的美化主题"絮语"把对白做成字幕条：

```css
#chat .mes_text q {
    padding: 0.17em 0.45em 0.08em;
    border-radius: 6px;
    background: var(--xy-sub-bg);
    color: var(--xy-sub-fg);
    font-family: var(--xy-sans-bold);
    font-weight: 600;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
}
```

`--xy-sub-bg` / `--xy-sub-fg` 定义在 `:root` 与 `#chat .mes[is_user='true'] .mes_text:not(:has(.edit_textarea))`，`--xy-sans-bold` 在 `html:root`；都是纯色或字体名。`src/core/cssScope.js` 第 69 行对资源属性（background、border-image、mask、content、filter…）只要值含 `var()` 或 `attr()` 就 `return null`，于是整条 `background` 没了，只剩反色字，字幕条"没有显示"。主题文件在人类电脑 `F:/sillytavern美化/themes/xuyu/絮语.json`（这是美化不是聊天，可以读；**不要复制进仓库**，是别人的作品；测试用自己写的几行假规则）。

要做：
1. `collectScopedCss` 收集阶段先建一张"自定义属性定义表"：遍历所有可读样式表（同源与内联；跨域读不到的跳过并计数）的每条规则，凡属性名以 `--` 开头记录 `name → [values]`（`@media` 等条件块里的也记）；再加 `#chat` 元素的行内 style，兜底 `getComputedStyle(document.documentElement)` 与 `getComputedStyle(#chat)` 对该名的当前值。
2. `scopeDeclarationValue` 资源属性分支改为：值里有 `attr(` → 仍 null；有 `var(` → 对每个 `var(--x[, fallback])`：取 `--x` 的全部定义加上 fallback，每个值递归同样处理（深度 ≤ 4，循环引用即失败），叶子值过现有地址检查（data:、同源 blob:、同源 http(s)、不许 `/api/`、不许 `image-set(` 与反斜杠）；**全部**通过 → 返回原值（保留 `var()` 写法，主题改色时跟着变）；任一失败或找不到任何定义 → null，计入 `skippedDeclarations`。
3. selftest（Node，用现有的 CSSOM 假对象或字符串级入口）加四组：`:root{--a:#fff} #chat .mes_text q{background:var(--a)}` 保留；`--b: url(https://evil.example/x.png)` 丢弃；`--c: var(--a)` 两层保留；`var(--nope, url(https://evil.example/y.png))` 回退值含外链 → 丢弃。
4. 浏览器自测（8100，挂进现有 coreBrowser 测试或新文件）：把上面那条 `q` 规则连同 `:root{--xy-sub-bg:#222;--xy-sub-fg:#fff;--xy-sans-bold:sans-serif}` 注入 `#custom-style`，打开阅读器（主题"跟随酒馆"），断言 `#stcr_chat .mes_text q` 的 computed `background-color` 等于宿主 `#chat .mes_text q` 的；测完移除注入、恢复原样。
5. 03 §5.7 样式合同补一段"资源属性里 `var()` 的放行条件"；06 I063 写实测；README 不用改（没有新请求：宿主本来就在 `#chat` 上用同一条规则）。

人类验收步骤要写成：真实 ST 换到絮语主题 → 打开阅读器 → Aa 主题选"跟随酒馆" → 对白有和 ST 一样的反色字幕条。

## T101 导出包含酒馆隐藏楼（core）（D47、I064）

现状：`src/core/documentExport.js` 第 75 行把 `isSystem` 或 `isNarrator` 的楼在 `include.hidden` 为假时全部跳过；ST 用小眼睛隐藏的楼也是 `is_system:true`，社区用户隐藏了旧楼省上下文，导出"整个聊天"就只剩最近几楼。UI 里 T62 的判定在 `src/ui/logic.js`：`isSystemLike(model)` = `isNarrator`，或（`isSystem` 且名字为 System 或空 且无候选）；`isStHidden(model)` = `isSystem && !isSystemLike`。

要做：
1. 把这两条判定搬进 core：`messageModel.js` 导出 `isSystemLikeFloor(model)` 与 `isStHiddenFloor(model)`，逻辑与 `logic.js` 逐字一致（UI 以后可改为 import；这次不碰 `src/ui/`）。
2. `documentText.js`：`DOC_INCLUDE_DEFAULTS` 加 `stHidden: true`（`normalizeDocOptions` 自然接受）。`documentExport.js` 跳楼规则改为：`isSystemLikeFloor` 且 `!include.hidden` → 跳，`stats.skippedSystem++`；`isStHiddenFloor` 且 `!include.stHidden` → 跳，`stats.skippedHidden++`；其余照旧。`stats.skipped` 保持为两者之和（旧字段不变）。
3. `documentText.test.js` 覆盖 `hidden` × `stHidden` 四种组合，以及旧调用（不传 `stHidden`）默认包含隐藏楼；selftest 用星灯 fixture（第 1–3 楼 `is_system:true`）整本导出，断言默认包含那三楼、楼号连续。
4. 03 §5.22 只增：`include.stHidden` 一行、`stats.skippedHidden` / `skippedSystem` 一行、两个新导出函数一行。
5. UI 对话框不动（Opus 的 T99 ⑤ 接：拆成两项并显示楼数）。

人类验收：8100 打开星灯聊天 → 顶栏 ⋮ → 导出为文档 → 整个聊天 → 下载的 TXT 里能看到第 1–3 楼（此时对话框那一项还是旧文案"系统楼和隐藏楼"且没勾，这是预期，T99 会改）。

每张卡交接信按 `docs/handoff/README.md` 模板写，附 grep 只读自查与给完全不会代码的人的验收步骤。T101 完成并通过验收后把 main 快进到你的最终提交（不打 tag、不推送），停下等 Fable 做 T102 复查。不要最小执行。
