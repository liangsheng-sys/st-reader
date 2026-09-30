你是本项目的引擎与数据层工程师，接着上次的工作。先重读 AGENTS.md、docs/05_DECISIONS.md、docs/06_ISSUES.md（重点 I005、I013、I018、I019）、docs/handoff/2026-09-29_fable_to_human_T31.md 与 Opus 的 T23a/T23b 交接信。当前所有交付都在分支 task/T23b-replace-rules 上（线性历史）。本次做 docs/04_TASKS.md 的 T30，做完停下告诉我怎么验收。

三条铁律不变：只读（D02）；数据（只用 .dev 开发实例，不读、列、写 F:\Claude\xinllm\SillyTavern\data\；安装脚本只由人类双击）；磁盘（不写 C/F 盘、不装依赖、不下载大文件）。

T30 要求，按顺序：
1. 先修两条 core 问题，进 selftest：
   - I018①：cardFonts.js 里 canvas 字体名加引号，让"替换成图标"经 core 导出时图标完整；顺手评估 I018②（简写属性含 var() 丢失）是否在 core 侧解析，不必须。
   - I019：按规划者在 06 拍板的语义实现——自动名字（单聊 char/user、群成员）整体受保护；我的规则只有在原词与某个自动名字完全相等、或不与任何自动名字重叠时才生效；部分重叠的我的规则对该自动名字不生效，并在 mappings 里标 skippedOverlap 让 UI 提示。更新 03 §5.9/5.10 与 02 §6.4 的优先级一行（只改那一行，其余 02 是 Opus 的）。
2. 性能与大文件（I005、NF2）：用 fixture 生成一份 ≥50 MB 的合成聊天（不入库），在开发实例里测阅读器打开 < 3 s、翻页流畅、切换聊天后内存回落；结果写进交接信。
3. 只读审计：全仓库 grep D02 清单、出站请求；结果写进交接信。
4. install/link-to-my-st.cmd：只做一件事——在 F:\Claude\xinllm\SillyTavern\data\default-user\extensions\ 下建目录联接 st-reader 指向 E:\st-reader；目标已存在则提示并退出，不覆盖、不删除；不读不写其他任何东西。另给 install/unlink-from-my-st.cmd 只删联接。脚本你只能写，不能运行。
5. docs/M3_验收清单.md：F1–F9 与 NF1–NF5 逐条"打开什么、点哪里、看到什么、勾选"，给完全不会代码的人；开头写清安装步骤与"验收完在真实 ST 里核对聊天没变"的方法。
6. 补全 SETUP_WINDOWS.md §3 安装一节。
7. 修 I013 反复发生：让 dev/selftest.mjs 对角色卡 PNG 的检查只比对聊天 SHA 与卡片内 JSON 的关键字段，而不是文件大小；或在检查失败时打印"运行 generate-fixtures.cmd 重建"的一句提示。二选一，写明理由。
8. 把 main 快进到你的最终提交（git merge --ff-only），确认 .dev/.tmp 未入库。

每项都要交能跑的东西与验收步骤。不做任务卡以外的事，不改 src/ui。
