# 第三方许可记录

引入任何库、字体、图标、素材前先登记。无明确许可的不许用。

本项目按 D17 使用 AGPL-3.0，完整原文在仓库根 [LICENSE](../LICENSE)（GNU 官方 `https://www.gnu.org/licenses/agpl-3.0.txt`，34,523 字节）。自有 JS/MJS 首行为 `// ST Reader — AGPL-3.0`，CSS 使用合法块注释 `/* ST Reader — AGPL-3.0 */`。第三方 vendor 保留原许可与文件内容。

| 名称 | 版本 | 许可 | 用途 | 引入者 | 位置 |
|---|---|---|---|---|---|
| SillyTavern | 1.14.0 | AGPL-3.0 | 宿主程序；本扩展作为独立插件通过其公开扩展 API 运行，不复制其源码。若日后分发本扩展并内嵌 ST 源码片段，须整体按 AGPL-3.0 | Fable | 不入库 |
| [modern-screenshot](https://github.com/qq15725/modern-screenshot/tree/v4.7.0) | 4.7.0 | MIT，Copyright (c) 2021-present wxm；完整许可随单文件顶部保留 | DOM→PNG 导出（D06），不使用 CDN、worker 或自动下载字体 | astra（T14） | `vendor/modern-screenshot.mjs` |
| [Ny-font-manager](https://github.com/Naya1-1/Ny-font-manager) | 1.1.9；固定提交 `784d627d29941a9ba8abf275953179fb34840c64` | GPL-3.0，已核对上游 `LICENSE.txt` | 仅在开发实例中做兼容测试（F5），保留完整上游许可，**不**打包进本扩展 | astra（T11） | `.dev/data/default-user/extensions/Ny-font-manager/`，不入库 |
| [JetBrains Mono](https://github.com/google/fonts/tree/6e4b84c976cadb3c49a40fd9a1c203e4f7fcf2da/ofl/jetbrainsmono) | 固定字体提交 `6e4b84c976cadb3c49a40fd9a1c203e4f7fcf2da`；可变直体，187,208 字节 | SIL OFL 1.1，版权 JetBrains Mono Project Authors，已核对并保留 `OFL.txt` | Ny 本地字体导入、IndexedDB 与后续 PNG 验证；拉丁字母/数字等宽样本，中文由系统字体回退 | astra（T11） | `.dev/fixtures/fonts/`，不入库 |
| showdown / DOMPurify / highlight.js / localforage / lodash / Fuse | 随 ST | 各自 MIT/BSD | 通过 `SillyTavern.libs` 使用，不复制 | — | 不入库 |

图标：v1 只用 ST 已加载的 Font Awesome（ST 自带，OFL/MIT）。

T14 的上游单文件来自 `https://unpkg.com/modern-screenshot@4.7.0/dist/index.mjs`，54,773 字节，SHA-256 `d6ce0ad42851eb3c6a56b89ab15839f5eaee512df6b27845c42e58d3605dd945`。只在文件顶部追加同版本包的完整 MIT 许可（1,077 字节），库源码未修改；没有 npm install、构建依赖或 source map。字体与图标仍使用宿主及 Ny 已有内容，不随扩展重复分发。

T11 的安装清单及每文件体积、Git blob 校验值见 `dev/fixtures/dependencies.lock.json`。下载限额为单文件 5,000,000 字节；上游代码与字体仅在 `.dev/` 中安装，阅读器运行文件未引入它们的源码。合成头像由 Node 原生绘制几何图形，故事、角色及测试说明均从零创作，无第三方素材。
