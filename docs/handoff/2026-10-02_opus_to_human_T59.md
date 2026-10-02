# T59 交接：M5 收尾——"有新内容"横幅、抽屉预读、宿主样式恢复兜底

分支：`task/T59-m5-wrapup`，从 main 的 `50ffff8`（T57 已合入）开始。未改 `src/core/`，未合并回 main，未推送。

## 做了什么

1. **抽屉每次展开都预读 ST 当前聊天（I042）**：第一次打开抽屉本来就会预读；现在列表已画好、再次展开时也预读一次。读失败什么都不提示。
2. **"此聊天有新内容，点击重新加载"横幅（D28）**：阅读器打开一个读过的聊天时先秒开旧内容，后台去 ST 核对；发现 ST 里这份聊天变了（楼数 / 大小 / 末条日期），正文顶部居中浮出一条主题色胶囊：
   - 点文字 → 变成"正在重新加载…" → 读成功才换正文，回到你原来看的那一楼，右下提示"已重新加载"；读失败旧内容不动，提示原因。
   - 点 **×** 关掉。同一个聊天在这一页里**只提示一次**（关掉、换聊天再回来都不再提示；刷新页面或重新加载成功后，下次再变才会再提示）。
   - 聊天文件在 ST 里被删 / 改名：同一位置显示"这个聊天在 ST 里找不到了……下面是之前读到的内容"，没有重新加载按钮。
   - 横幅只改阅读器自己的界面，不切换、不写 ST 的聊天。
3. **静音宿主楼内样式的四条边界（D29 ③）**：
   - 只选 `#chat .mes style`（ST 聊天里每楼自带的样式），`#chat` 外、`<head>`、主题、其他扩展一概不碰；只切 disabled，不删不改。
   - 恢复路径：正常关闭；打开或关闭**中途出错**（try/finally，每一项收尾单独兜住，一项失败不连累其他）；`pagehide`（离开页面）；阅读器根节点被别的脚本移出页面（观察 `document.body`，随即按关闭流程收尾）。从浏览器往返缓存回来而阅读器还开着，会重新暂停。
   - 新增浏览器回归 `testHostStylesBrowser`（12 项），并入原 `testTextAlignBrowser` 的结果，所以 astra 的 `test-release.cmd` 里"界面主题"一项会从 16 项变成 28 项。
4. **D30 两份安装提示：略过**。core 的"检查更新"找到第一份（用户目录）就停，不再问全局目录，分不出"两份并存"；界面又不能自己去问 ST 的接口。原因与给 astra 的可选方案写在 **06 I048**。你的真实 ST 已清理成一份（I046），说明文字 T57 已写好。

## 改动文件

- `src/ui/drawer.js`：`open()` 里预读
- `src/ui/reader.js`：横幅（订阅 core 的 `onStale`、重新加载、只提示一次）；`loadChat` 可接收已读好的新句柄并回到原位置；静音范围与四条恢复路径；`openReader` / `closeReader` 的 try/finally；测试用故障注入 `injectReaderFault`
- `src/ui/uiBrowser.test.js`：`testHostStylesBrowser`
- `style.css`：横幅样式（有横幅时跟随条下移让位）
- `docs/02_UI_SPEC.md` §9.10、`04_TASKS.md`（T59 → 待验收）、`06_ISSUES.md`（I042 / I045 状态，新增 I048）

## 人类验收步骤（Opus 验收实例 8101，约 5 分钟）

准备：双击 **E:\st-reader\.tmp\opus-dev\start.cmd**，看到 listening 后**等半分钟**，浏览器打开 **http://localhost:8101**，按 **Ctrl+F5**。

**A. 横幅**

1. 在 ST 右上角角色列表点 **雾岚（虚构）**；左下角 ☰ → **管理聊天文件**，选 **STCR-03-普通阅读**（三楼的小聊天）。
2. 点顶栏 **书本图标** 打开阅读器，能看到 3 楼。点右上 **×** 退出阅读器。
3. 在 ST 底部输入框里输入 `/sys 这是后来新加的一句` 回车。ST 聊天末尾多出一行灰字（这是 ST 自己往**验收实例的样本副本**里写的，不是阅读器写的，不影响 .dev 和你的真实 ST）。
4. **等一分钟**（阅读器 60 秒内不重复核对，这是 D28 的设计），再点 **书本图标**。
   - 应先立刻看到旧的 3 楼，几秒内（核对要扫一遍雾岚的全部聊天，包括 50 MB 的大样本，最多约 5 秒）正文顶部浮出一条带颜色的胶囊：**⟳ 此聊天有新内容，点击重新加载 ×**。
5. 点胶囊上的文字：变成"正在重新加载…"，几秒后正文变成 **4 楼**（最后一楼是"这是后来新加的一句"），胶囊消失，右下角提示"已重新加载"。
6. 再测"只提示一次"：退出阅读器，重复第 3 步（换一句话），等一分钟，打开阅读器 → 胶囊出现 → 这次点 **×** 关掉。退出阅读器再打开：**不再出现胶囊**（正文还是旧的；想看新内容按 Ctrl+F5 刷新页面或等下次变化）。
7. 拖窄浏览器到手机宽度看一眼：胶囊在正文顶部居中，不出屏。

**B. 抽屉预读（可选，需要控制台）**

8. 阅读器开着时按 **F12** → Console，粘贴回车：
   `(await import('/scripts/extensions/third-party/st-reader/src/core/chatSource.js')).getChatCacheStats().prefetches`
   记下数字。点阅读器左上 **≡** 打开抽屉、再点一次收起、再点一次打开，然后再粘贴同一行：数字比刚才**多 2**（每次展开 +1）。

**C. 宿主样式恢复（控制台一行）**

9. **先退出阅读器**，在 Console 粘贴回车：
   `await (await import('/scripts/extensions/third-party/st-reader/src/ui/uiBrowser.test.js')).testHostStylesBrowser({force:true})`
   表格应 **12 行全部 passed: true**，包括"打开中途抛错后全部恢复""关闭中途抛错后全部恢复""pagehide 后全部恢复""根节点被移走后全部恢复""全程 .mes 外与 head 未被禁用"。测试期间阅读器会自己开关几次，属正常。
10. 顺手看一眼：ST 里点 **星灯（虚构）**，在管理聊天文件里选 **STCR-T50-居中复现**（楼里带卡片样式）。打开阅读器：正文仍左对齐、普通楼没有卡片底色；退出阅读器：ST 里那张卡片的样子和打开前一样。

**结束**：8101 黑窗口按 **Ctrl+C**，输入 **Y** 回车。

## 自动检查

| 检查 | 结果 |
|---|---|
| `node src/ui/ui.test.js` | 全部通过（30 项） |
| `node dev/selftest.mjs` | 全部通过（167 项，core 未改） |
| `node dev/audit-readonly.mjs` | 静态边界检查通过 |
| `testHostStylesBrowser`（8101） | 12/12 |
| `testTextAlignBrowser`（8101，五套主题 × 三种显示 + 上面 12 项） | 28/28 |
| 横幅实测（8101 无头 Chrome，往 8101 样本副本末尾追加一楼；另按上面 A 的步骤用 `/sys` 走了一遍） | 冷读 3 楼 → 追加 → 重开 0.5–1 s 内出现横幅（`/sys` 那遍 ST 正忙，后台核对 4.1 s 后出现）；点击后 4 楼、横幅消失、提示"已重新加载"；手机 390 宽显示正常；关掉后同页重开不再出现；样本副本已按备份还原（md5 一致），`/sys` 产生的 ST 备份与误发到 Assistant 的一次测试聊天已删除 |
| 抽屉预读 | 列表已画好时再次展开，prefetches 计数 +1 |
| 全流程请求 | 只有 `characters/get`、`chats/search`、`chats/get`、`characters/all`、`groups/all`、`chats/recent` 六个读取，外加 ST 自己启动时的 `settings/save`；无任何聊天写入 |

## 只读自查

```text
rg --no-ignore -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src vendor style.css
```

- 共 8 行，全部是既有的 `src/core/readonlyGuard.js:4–10` 禁用名单与 `src/core/htmlSnapshot.test.js:12` 拒绝样本；本次新增 **0** 行。
- `src/ui/` 里查 `saveChat|deleteMessage|deleteLastMessage|renameChat|clearChat|addOneMessage|updateChatMetadata|saveMetadata|swipe_id|chatMetadata|/api/`：只有 `prefs.js` 第 3 行注释"绝不写……"；`fetch(` 只有既有的 `docPanel.js` 读使用说明 md。横幅重新加载走 `openChat(key,{reload:true})`，预读走 `prefetchCurrentChat()`，都是 03 §5 的只读接口。
- 静音宿主样式只设 `HTMLStyleElement.disabled`，不删不改，不碰 `getContext().chat` / `chatMetadata` / `swipe_id`。
- 本任务是否读写、列出、复制过 `F:\Claude\xinllm\SillyTavern\data`：**否**。只用 8101 的样本副本 `.tmp\opus-dev\data`；未写 C/F 盘、未装依赖、未下载素材。

## 已知问题 / 没做的

- 横幅的"变化"只看 ST 摘要的楼数 / 大小 / 末条日期：同楼数、同大小、同日期的原地改字发现不了（core 合同限制，见 03 §5.14）。
- 60 秒内反复开关同一个聊天不会重复核对，所以改完马上重开可能没有横幅，等一分钟或刷新页面即可。
- 重新加载走的是冷读，大聊天（几十 MB）要等几秒，期间胶囊显示"正在重新加载…"，旧正文可继续看。
- D30 提示没做（I048）。

## 给下一个人的话

- Fable（T61）：D29 ③ 的四条恢复路径看 `reader.js` 的 `muteHostMessageStyles` 与 `closeReader`；回归入口是 `testHostStylesBrowser`，已并入 `testTextAlignBrowser`，`test-release.cmd` 的界面项计数会变成 28。
- astra：若想做 D30 提示，按 I048 在 `checkUpdate` 结果里加一个"两处都存在"的字段即可，UI 接一行字。
