开发实例与合成数据。实例数据根固定为 `E:\st-reader\.dev\data`（gitignore），端口 8100。

T54a 版本与更新：先关闭旧的开发服务窗口，重新双击 `start-dev-st.cmd`，等到 listening。打开 `http://localhost:8100/?stcrUpdateDemo=1`，应看到 ST Reader v0.1.0、“开发目录，不可更新”、日志和不能点击的立即更新按钮。这是 core 开发验收面板，正式阅读器入口属于 Opus T54b。

双击 `test-update-service.cmd` 自动跑专项与完整浏览器回归（210 项），出现 `T54a OK.` 即通过。无需打开控制台；若想单测，F12 → Console 输入 `await stcrSelfTest({core:false,updateService:true})`，预期 36 项全绿。Node 全量现为 145 项、UI 30 项。报告为 `.dev/fixtures/t54a-performance-result.json`，截图为 `.dev/fixtures/t54a-update-demo.png`，均不入库；独立浏览器缓存只在 `.tmp/t54a-browser-*`，结束自动清理。检查/更新响应的成功、全局安装、无远端与错误分支用替身验证，真实开发联接零 Git 请求；不在工作仓库实际拉取代码。只读明细见 [T54a 交接](../docs/handoff/2026-10-02_astra_to_human_T54a.md)。

- 双击 `start-dev-st.cmd` 启动；它通过原生 Node 启动器完成配置、目录联接与临时目录初始化，再运行现有 ST 程序。T40 后开发联接指向 `E:\st-reader` 仓库根；已知旧目标会自动迁移，未知联接或普通目录会停止并保留。
- `config.dev.yaml` 是首次生成 `.dev/config.yaml` 的模板，不覆盖已有配置。
- `isolate-dev-st.mjs` 只在开发进程内把全局扩展和程序备份目录指向 `.dev/`，不修改宿主源码。
- 在仓库根运行 `node dev/selftest.mjs` 做 core、样本及联接内存替身自测；`node src/ui/ui.test.js` 做界面纯逻辑与静态检查。浏览器控制台运行 `await window.stcrSelfTest()`。
- `start-dev-st.cmd --prepare-only` 只准备环境；`--no-pause` 用于自动验证，服务退出后不等待按键。这两个参数均不能改写数据根。
- `fixtures/gen.mjs` 生成 T11 合成数据；后续模块继续加入已有自测入口。

完整人类步骤见 `docs/SETUP_WINDOWS.md` §2。

I041 高度回归（2026-10-02）：启动 8100 开发实例后，双击 `test-html-height.cmd`，用已有浏览器在 1366 / 1024 两种视口各验纸月样本 390 / 768 / 1200 排版宽度、断网/允许外链、动态收起展开、脱离文档流与内部滚动、重建及外层等比缩放；随后跑完整浏览器回归。等价命令 `node dev/test-performance.mjs --html-height --core-browser`。浏览器配置仅在 `.tmp/i041-browser-*`，完成清理；报告在 `.dev/fixtures/i041-performance*.json`，不入库。控制台单独验为 `await stcrSelfTest({core:false,htmlHeight:true})`；默认完整自测与 htmlRenderer 专项也会包含这些回归。

T53（D24）：
- `node dev/selftest.mjs` 为 142 项，`node src/ui/ui.test.js` 为 30 项；`await window.stcrSelfTest()` 完整浏览器 203 项。数字是本卡交付时记录。
- 缓存专项：关闭阅读器后，在开发实例控制台运行 `await window.stcrSelfTest({core:false,chatCache:true})`，预期 34 项通过（13 保护 + 16 逻辑 + 5 真实 API）。无需选中大聊天，不改宿主选择。
- 重开计时：开发实例运行期间双击 `test-chat-cache.cmd`，或执行 `node dev/test-performance.mjs --chat-cache --core-browser`。自动使用已有 21.35 MiB / 1600 楼样本，独立浏览器的配置和缓存在 `.tmp/t53-browser-*`，结束清理；不安装浏览器、不下载、不读真实 ST 数据。
- 计时到正式阅读器的正文首帧，包含最新摘要校验。`await window.stcrSelfTest({cachePerformance:true})` 是同一套浏览器测试；自动脚本额外跨页刷新检查缓存为空，并跑完整回归。
- `.dev/fixtures/t53-performance-result.json` 及带时间戳报告保存每次结果（不入库）；**当前 300 ms 断言失败，退出码为 1 是如实报告性能未达标**，见 I040。其他功能项通过不抵消该失败。界面已渲染抽屉的再次展开接线留 Opus，见 I042。

T30 验证入口：
- `node dev/selftest.mjs`：角色卡只验关键 JSON，聊天仍验 SHA-256；总项数随新增回归变化，以最后“全部通过”为准。
- 先停开发服务，双击 `generate-performance.cmd` 生成53.39MiB/4000楼，再启动服务并双击 `test-performance.cmd`。不需要 npm 或额外下载。
- `node dev/test-performance.mjs --core-browser` 追加104项完整浏览器回归；`--profile` 可诊断CPU热点，有采样开销，不能作为正式耗时。
- 浏览器配置和缓存只在 `.tmp/t30-browser-*`，完成自动清理；默认报告与带时间戳的历史报告在 `.dev/fixtures/t30-performance*.json`。失败会返回非零，不能据此认定全绿；性能遗留见 I020。
- `node dev/audit-readonly.mjs` 扫描全仓库、分类输出D02/网络命中、核对扩展体积和未跟踪数据；网络字面量需结合人工审计与浏览器实证。

T40 后审计的扩展范围为根目录 `manifest.json / index.js / style.css / LICENSE` 与 `src/ / vendor/`；另外阻止 `.dev/`、`.tmp/` 和 `docs/*.png` 进入 Git。安装脚本只用内存替身测试，绝不运行 `install/run-junction.mjs`。

T41：`test-core.cmd` 依次通过 Node 103 项、UI 27 项。启动开发实例后，控制台输入 `await window.stcrSelfTest({core:false,coreFixes:true})` 可单独跑 35 项（13 保护 + 12 纯逻辑 + 10 浏览器），无需选角色或导入字体；完整默认浏览器检查现为 132 项，仍需原 T14 的雾岚与 Ny 字体准备。T41 包含实际 PNG 的遮盖像素宽度/替换背景、HTML 属性与脚本保持、禁网解析和独立 IndexedDB 往返。I027 返修补上内联样式 CSP、重复自测串行与节点清理反例；Ctrl+F5 后重验。工作台测量时机已由 T42 接好（I026，人类已验收）。以上数字保留为 T41 阶段记录；2026-10-01 最新整合代码为 Node 116/116、UI 30/30、完整浏览器 156/156；性能 I020 仍未全绿，见 I032 交接。

T44a（I029 返修）：当前 Node **116 项**、UI **27 项**；`await stcrSelfTest({core:false,htmlRenderer:true})` 应通过 **37 项**（13 保护 + 12 识别/CSP/裁剪逻辑 + 12 浏览器）。`await stcrHtmlDemo()` 打开独立合成演示：手机聊天、网页游戏、宽度、默认 2 倍/可选 3 倍脱敏 PNG；在静态预览任意拖出选区、移动、拖四角调整，再点“生成选区 PNG”。清除后可重画，缩小预览仍换算正确；原固定左上角入口已移除。也可用 `?stcrSelfTest=1&core=0&htmlRenderer=1` 或 `?stcrHtmlDemo=1`。完整默认浏览器检查现为 **156 项**。故意的导航/脚本反例会产生 CSP “blocked” 提示；不能出现 false、“自测失败”或内联样式被阻止。开发 fixture 的纸舟第 7、8 楼为新样本，旧实例用 `node dev/fixtures/append-html.mjs` 停服追加，不能重建整个数据目录。返修无需重建数据或重做联接；详细验收见 docs/SETUP_WINDOWS.md §2.6。

I032（2026-10-01，D23）：最新整合结果为 **Node 119/119、UI 30/30、完整浏览器 172/172**，上面的数字保留为历史阶段记录。`await window.stcrSelfTest({core:false,htmlSnapshot:true})` 单独检查当前画面快照与外链截图，预期 **29/29**；需要既有 Ny 开发字体。`await window.stcrHtmlDemo()` 默认打开合成游戏，默认截当前画面并带上外链素材；点出结局后生成预览，390px 宽度、2 倍对应 780px PNG，仍支持任意框选。外链按资源网站 CORS 许可内嵌；失败显示提示，可手动断网。正式 UI 的按钮由 Opus 接入，详细小白步骤、只读自查与限制见 [I032 实施交接](../docs/handoff/2026-10-01_astra_to_opus_I032_snapshot.md)。T46 未开始；I020 性能问题未关闭。
