# 第三方许可记录

引入任何库、字体、图标、素材前先登记。无明确许可的不许用。

| 名称 | 版本 | 许可 | 用途 | 引入者 | 位置 |
|---|---|---|---|---|---|
| SillyTavern | 1.14.0 | AGPL-3.0 | 宿主程序；本扩展作为独立插件通过其公开扩展 API 运行，不复制其源码。若日后分发本扩展并内嵌 ST 源码片段，须整体按 AGPL-3.0 | Fable | 不入库 |
| modern-screenshot | 待定 | MIT | DOM→PNG 导出（D06） | astra（T14） | `extension/vendor/` |
| [Ny-font-manager](https://github.com/Naya1-1/Ny-font-manager) | 1.1.9；固定提交 `784d627d29941a9ba8abf275953179fb34840c64` | GPL-3.0，已核对上游 `LICENSE.txt` | 仅在开发实例中做兼容测试（F5），保留完整上游许可，**不**打包进本扩展 | astra（T11） | `.dev/data/default-user/extensions/Ny-font-manager/`，不入库 |
| [JetBrains Mono](https://github.com/google/fonts/tree/6e4b84c976cadb3c49a40fd9a1c203e4f7fcf2da/ofl/jetbrainsmono) | 固定字体提交 `6e4b84c976cadb3c49a40fd9a1c203e4f7fcf2da`；可变直体，187,208 字节 | SIL OFL 1.1，版权 JetBrains Mono Project Authors，已核对并保留 `OFL.txt` | Ny 本地字体导入、IndexedDB 与后续 PNG 验证；拉丁字母/数字等宽样本，中文由系统字体回退 | astra（T11） | `.dev/fixtures/fonts/`，不入库 |
| showdown / DOMPurify / highlight.js / localforage / lodash / Fuse | 随 ST | 各自 MIT/BSD | 通过 `SillyTavern.libs` 使用，不复制 | — | 不入库 |

图标：v1 只用 ST 已加载的 Font Awesome（ST 自带，OFL/MIT）。

T11 的安装清单及每文件体积、Git blob 校验值见 `dev/fixtures/dependencies.lock.json`。下载限额为单文件 5,000,000 字节；上游代码与字体仅在 `.dev/` 中安装，阅读器 `extension/` 未引入它们的源码。合成头像由 Node 原生绘制几何图形，故事、角色及测试说明均从零创作，无第三方素材。
