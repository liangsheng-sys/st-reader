开发实例与合成数据。实例数据根固定为 `E:\st-reader\.dev\data`（gitignore），端口 8100。

- 双击 `start-dev-st.cmd` 启动；它通过原生 Node 启动器完成配置、目录联接与临时目录初始化，再运行现有 ST 程序。
- `config.dev.yaml` 是首次生成 `.dev/config.yaml` 的模板，不覆盖已有配置。
- `isolate-dev-st.mjs` 只在开发进程内把全局扩展和程序备份目录指向 `.dev/`，不修改宿主源码。
- `node dev/selftest.mjs` 运行纯逻辑自测（当前 T10 只读保护 13 项）。浏览器控制台运行 `await window.stcrSelfTest()`。
- `start-dev-st.cmd --prepare-only` 只准备环境；`--no-pause` 用于自动验证，服务退出后不等待按键。这两个参数均不能改写数据根。
- `fixtures/gen.mjs` 留给 T11；后续模块继续加入已有自测入口。

完整人类步骤见 `docs/SETUP_WINDOWS.md` §2。
