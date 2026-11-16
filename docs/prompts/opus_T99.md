你是本项目的界面与阅读体验负责人。先读 CLAUDE.md（"临时授权"一段已标注结束：D32 撤销，astra 回归，`src/core/` 又是 astra 的，你不改；接口不够写 06 并用 mock）、docs/05_DECISIONS.md 的 D45–D47、docs/04_TASKS.md 的 M11（T99）、docs/06_ISSUES.md 的 I064、I065，以及你自己 T80（胶囊）、T90（诊断）、T95（"不再提示"）、T97（导出对话框）的交接信。前置：astra 的 T100、T101 应已合入 main（`git log --oneline -5` 看到 "T101:" 开头的提交即可）；若 T101 还没合入，先做 ①–④，⑤ 等它。一张卡一个分支 `task/T99-small-switches`，从 main 开；做完停下给人类验收步骤。

铁律不变：只读（D02；`src/ui/` 里不得出现 `fetch(` 与 `/api/`，`ui.test.js` 会查）；数据（只用 `.dev` 的 8100 或你的 8101 开发实例，不碰 F:/Claude/xinllm/SillyTavern/data/）；磁盘（不写 C/F 盘、不装依赖、不下载）。交付前 `node src/ui/ui.test.js`、`node dev/selftest.mjs`、`dev/test-release.cmd` 全绿（跑前备份 `.dev/.../user/files/st-reader-backup*.json` 与 settings.json 到 `.tmp/t99-keep/`，跑完还原）。前端细节你可以自作主张，但每一条在回复与交接信里列出来（人类 2026-11-09 授权）。

## T99 小开关与导航合集

① **"在酒馆里打开前先确认"开关**：Aa → ⋯（更多设置）加一行开关，读写 T95 存"不再提示"的同一个 prefs 键（`openInStConfirm` 或你当时用的名字，保持兼容），勾过"不再提示"的人能在这里重新打开；打开后再按 O 又弹确认。

② **`[` `]` 旧习惯开关**：Aa → ⋯ → 显示加"`[` `]` 换候选（旧习惯）"，默认关。开着时 `[` `]` 对鼠标所在楼换候选（T80 之前的行为），`,` `.` 变成上一楼 / 下一楼；胶囊与按钮的 title 里的键名跟着换。02 §4 快捷键表与使用说明"快捷键"写明两种模式。

③ **导航**（人类反馈 2："楼层胶囊新增一个回到本楼结尾、跳转聊天末尾，后者也可以放在底部页码跳转，opus 自己考虑"）。我的安排，你可调整但要说明：
- 胶囊展开列里"回到这一楼开头"旁加"到这一楼结尾"（`fa-arrows-down-to-line`）：让这一楼最后一行停在视口底部往上约一行处；楼比视口短时等同于回到开头。
- 底部进度条两端各加一枚小按钮："第一楼"（`fa-angles-up`，title 写 Home）与"最后一楼"（`fa-angles-down`，title 写 End），调用已有的 `jumpTo(0)` / `jumpTo(total-1)`；<600px 也要放得下、不挤掉进度文字。
- 不要在胶囊里放"聊天末尾"：胶囊是"这一楼"的工具，整本的首末放底栏。

④ **诊断加宿主一行**：Aa → ⋯ → 诊断的文本加"宿主：SillyTavern 1.x.y" 或 "宿主：TauriTavern"（`window.__TAURI__` 存在或 UA 含 `Tauri` 即 TT；ST 版本从 `getContext()` 或 `/version` 已缓存的信息拿，拿不到写"未知"，**不要**为此新发请求）。这是为了 I065（社区说 TT 上慢）以后能分辨截图来自哪个宿主。

⑤ **导出对话框按 D47 拆项**（等 T101 合入 main）：`src/ui/docExport.js` 里"系统楼和隐藏楼"一项拆成两项——"酒馆里隐藏过的楼"（对应 `include.stHidden`，**默认勾**，提示"在 ST 里点过小眼睛隐藏的楼，是正文"）与"系统提示与旁白"（对应 `include.hidden`，默认不勾）。范围或勾选变化时，对话框下方实时显示"将导出 N 楼（跳过 M 楼）"：遍历范围内的 `handle.getMessage(i)` 用 core 的 `isSystemLikeFloor` / `isStHiddenFloor` 数，4000 楼也要瞬间算完（只读模型字段，不渲染）。导出完成的提示写"已导出 N 楼，跳过 M 楼（隐藏 a、系统 b）"，用 `stats.skippedHidden` / `skippedSystem`。使用说明"导出"一节补一句。

其他：02 §4 与使用说明同步；`ui.test.js` 覆盖 ② 的键位切换与 ⑤ 的计数函数；浏览器自测在 390×844 断言底栏两枚按钮都在视口内可点。交接信按模板，附只读自查、人类验收步骤（双击什么、点哪里、看到什么）与"我自己定的"清单。做完停下等 Fable 做 T102 复查，不升版本号。
