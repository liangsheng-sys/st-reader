# 第三方许可记录

引入任何库、字体、图标、素材前先登记。无明确许可的不许用。

| 名称 | 版本 | 许可 | 用途 | 引入者 | 位置 |
|---|---|---|---|---|---|
| SillyTavern | 1.14.0 | AGPL-3.0 | 宿主程序；本扩展作为独立插件通过其公开扩展 API 运行，不复制其源码。若日后分发本扩展并内嵌 ST 源码片段，须整体按 AGPL-3.0 | Fable | 不入库 |
| modern-screenshot | 待定 | MIT | DOM→PNG 导出（D06） | astra（T14） | `extension/vendor/` |
| Ny-font-manager | 待定 | GPL-3.0 | 仅在开发实例中安装做兼容测试（F5），**不**打包进本扩展 | astra（T11） | `.dev/`，不入库 |
| showdown / DOMPurify / highlight.js / localforage / lodash / Fuse | 随 ST | 各自 MIT/BSD | 通过 `SillyTavern.libs` 使用，不复制 | — | 不入库 |

图标：v1 只用 ST 已加载的 Font Awesome（ST 自带，OFL/MIT）。
