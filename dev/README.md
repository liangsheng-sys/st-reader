开发实例与合成数据。实例数据根固定为 `E:\st-reader\.dev\data`（gitignore），端口 8100。

- 双击 `start-dev-st.cmd` 启动；它通过原生 Node 启动器完成配置、目录联接与临时目录初始化，再运行现有 ST 程序。T40 后开发联接指向 `E:\st-reader` 仓库根；已知旧目标会自动迁移，未知联接或普通目录会停止并保留。
- `config.dev.yaml` 是首次生成 `.dev/config.yaml` 的模板，不覆盖已有配置。
- `isolate-dev-st.mjs` 只在开发进程内把全局扩展和程序备份目录指向 `.dev/`，不修改宿主源码。
- 在仓库根运行 `node dev/selftest.mjs` 做 core、样本及联接内存替身自测；`node src/ui/ui.test.js` 做界面纯逻辑与静态检查。浏览器控制台运行 `await window.stcrSelfTest()`。
- `start-dev-st.cmd --prepare-only` 只准备环境；`--no-pause` 用于自动验证，服务退出后不等待按键。这两个参数均不能改写数据根。
- `fixtures/gen.mjs` 生成 T11 合成数据；后续模块继续加入已有自测入口。

完整人类步骤见 `docs/SETUP_WINDOWS.md` §2。

T30 验证入口：
- `node dev/selftest.mjs`：角色卡只验关键 JSON，聊天仍验 SHA-256；总项数随新增回归变化，以最后“全部通过”为准。
- 先停开发服务，双击 `generate-performance.cmd` 生成53.39MiB/4000楼，再启动服务并双击 `test-performance.cmd`。不需要 npm 或额外下载。
- `node dev/test-performance.mjs --core-browser` 追加104项完整浏览器回归；`--profile` 可诊断CPU热点，有采样开销，不能作为正式耗时。
- 浏览器配置和缓存只在 `.tmp/t30-browser-*`，完成自动清理；默认报告与带时间戳的历史报告在 `.dev/fixtures/t30-performance*.json`。失败会返回非零，不能据此认定全绿；性能遗留见 I020。
- `node dev/audit-readonly.mjs` 扫描全仓库、分类输出D02/网络命中、核对扩展体积和未跟踪数据；网络字面量需结合人工审计与浏览器实证。

T40 后审计的扩展范围为根目录 `manifest.json / index.js / style.css / LICENSE` 与 `src/ / vendor/`；另外阻止 `.dev/`、`.tmp/` 和 `docs/*.png` 进入 Git。安装脚本只用内存替身测试，绝不运行 `install/run-junction.mjs`。

T41：`test-core.cmd` 依次通过 Node 102 项、UI 27 项。启动开发实例后，控制台输入 `await window.stcrSelfTest({core:false,coreFixes:true})` 可单独跑 33 项（13 保护 + 11 纯逻辑 + 9 浏览器），无需选角色或导入字体；完整默认浏览器检查现为 130 项，仍需原 T14 的雾岚与 Ny 字体准备。T41 包含实际 PNG 的遮盖像素宽度/替换背景、HTML 属性与脚本保持、禁网解析和独立 IndexedDB 往返。工作台测量时机尚需 Opus 接入，见 I026。
