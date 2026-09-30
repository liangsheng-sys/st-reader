ui/ 由 Opus（Claude Code）负责。只通过 03_TECH_SPEC §5 的接口调用 core，不直接 fetch /api。

T40 后本目录为仓库根下的 `src/ui/`，入口与样式分别为根目录的 `index.js`、`style.css`。纯逻辑及静态验收：在仓库根执行 `node src/ui/ui.test.js`。浏览器扩展 URL 仍是 `/scripts/extensions/third-party/st-reader/`，模板相对地址与 core 导入无需改动。
