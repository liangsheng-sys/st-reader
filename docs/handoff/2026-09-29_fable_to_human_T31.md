# T31 交接：交付前只读复查——通过，但离"装到你的 ST"还差一张卡

复查对象：分支 `task/T23b-replace-rules` 最新提交 `623c633`（含 T10–T14、T20–T23b 全部交付）。

## 结论一句话
扩展代码**满足只读铁律与无出站请求**，自测全绿，许可齐全。但 **T30（性能审计、安装脚本、M3 验收清单）还没开工**，所以现在还不能装到你真实的 ST 上。另有两条 core 小问题要 astra 在 T30 一起修。

## 复查项与结果
| 项 | 方法 | 结果 |
|---|---|---|
| D02 写聊天接口 | 全仓库 grep `/api/chats/(save|rename|delete|import|group/…)` | 只出现在 `readonlyGuard.js` 的拦截清单里，**无调用** |
| D02 禁用方法 | grep `saveChat / deleteMessage / deleteLastMessage / renameChat / clearChat / addOneMessage / updateChatMetadata / saveMetadata / saveSettingsDebounced(` | **空** |
| 不改 chat / swipe_id / chatMetadata | grep 赋值与数组变更 | **空** |
| 实际用到的 `/api` | 枚举字符串 | 只有 `characters/get`、`characters/chats`、`characters/all`、`groups/all`、`chats/get`、`chats/group/get`、`chats/search`、`chats/recent`，全部只读 |
| 无出站请求 | grep `fetch/XMLHttpRequest/sendBeacon/WebSocket` 与 `http(s)://` | 只有 `chatSource.js` 一处同源 fetch 与开发自测；URL 只有 SVG/XHTML 命名空间常量。vendored 库自带通用 fetch，但导出时传入的 fetchFn 禁网（T14 已实测 0 次请求） |
| 开发入口不污染生产 | 读 `index.js` | `stcrSelfTest / stcrExportDemo / stcrStorageProbe` 与只读守卫都只在 `localhost:8100` 生效 |
| 语法 | `node --check` 全部 js/mjs | 0 失败 |
| UI 自测 | `node extension/src/ui/ui.test.js` | **27/27** |
| core 自测 | `node dev/selftest.mjs` | 首次**失败**：雾岚合成角色卡被 ST 改写（同 I013）。我用 `dev/fixtures/gen.mjs` 重建合成样本后 **68/68**。这是开发数据漂移，不是扩展 bug；但说明 I013 会反复发生 |
| 许可 | 读 `LICENSES.md`、vendor 文件头 | modern-screenshot 4.7.0 MIT 完整；Ny-font-manager GPL 与 JetBrains Mono OFL 只在 `.dev/`，未入库 |
| `.dev/ .tmp/` 未入库 | `git ls-files` | 空 |
| 体积 | `du` | extension 713 KB（含 124 KB 测试文件），远小于 NF4 的 3 MB |
| 分支 | `git log` | 所有工作线性叠在 task 分支上，`main` 仍停在 T00，需快进 |

## 没做 / 待办
- **T30 未开工**：`install/link-to-my-st.cmd` 不存在、`docs/M3_验收清单.md` 不存在、50 MB 大文件性能未测。
- **I018①**（core）：`cardFonts.js:83` 字体名未加引号，走 core 的"替换成图标"会画成小点。UI 已绕开，但 T23b 的规则图标仍走 core。
- **I019**（core，脱敏安全）：我的规则原词若只是自动名字的一部分，会让真名其余部分露出。规划者已在 06 拍板语义（自动名字整体受保护），请 astra 在 T30 实现。
- 磁盘：C 474 MB、F 2.7 GB、E 7.6 GB。F 盘仍不满 T01 的 5 GB 要求。

## 人类现在要做的
1. 不用验收本卡；看完上面"结论一句话"即可。
2. 清 F 盘到 ≥ 5 GB（T01）。
3. 进 `E:\st-reader` 运行 `codex`，粘 `docs\prompts\astra_T30.md`。
