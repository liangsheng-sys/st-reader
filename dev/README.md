开发实例与合成数据。实例数据根固定为 `E:\st-reader\.dev\data`（gitignore），端口 8100。

- 双击 `start-dev-st.cmd` 启动；它通过原生 Node 启动器完成配置、目录联接与临时目录初始化，再运行现有 ST 程序。
- `config.dev.yaml` 是首次生成 `.dev/config.yaml` 的模板，不覆盖已有配置。
- `isolate-dev-st.mjs` 只在开发进程内把全局扩展和程序备份目录指向 `.dev/`，不修改宿主源码。
- `node dev/selftest.mjs` 运行纯逻辑自测（当前 T10 只读保护 13 项）。浏览器控制台运行 `await window.stcrSelfTest()`。
- `start-dev-st.cmd --prepare-only` 只准备环境；`--no-pause` 用于自动验证，服务退出后不等待按键。这两个参数均不能改写数据根。
- `fixtures/gen.mjs` 留给 T11；后续模块继续加入已有自测入口。

完整人类步骤见 `docs/SETUP_WINDOWS.md` §2。

T30 验证入口：
- `node dev/selftest.mjs`：当前已生成 T11/T30 fixture 时 73 项；角色卡只验关键 JSON，聊天仍验 SHA-256。
- 先停开发服务，双击 `generate-performance.cmd` 生成53.39MiB/4000楼，再启动服务并双击 `test-performance.cmd`。不需要 npm 或额外下载。
- `node dev/test-performance.mjs --core-browser` 追加104项完整浏览器回归；`--profile` 可诊断CPU热点，有采样开销，不能作为正式耗时。
- 浏览器配置和缓存只在 `.tmp/t30-browser-*`，完成自动清理；默认报告与带时间戳的历史报告在 `.dev/fixtures/t30-performance*.json`。失败会返回非零，不能据此认定全绿；性能遗留见 I020。
- `node dev/audit-readonly.mjs` 扫描全仓库、分类输出D02/网络命中、核对扩展体积和未跟踪数据；网络字面量需结合人工审计与浏览器实证。
