core/ 由 astra（Codex）负责。纯逻辑模块尽量不依赖 DOM，便于 dev/selftest.mjs 在 Node 里跑。

T40 后本目录为仓库根下的 `src/core/`。UI 继续使用 `../core/*.js` 相对导入，§5 接口未变；在仓库根执行 `node dev/selftest.mjs`。
