# T62 交接：隐藏楼不再被当成系统楼（I050 根因修复）

分支：`task/T62-hidden-floors`，从 main 的 `5f82638` 开始。未改 `src/core/`，未合并回 main，未推送。

## 做了什么

1. **系统楼判定抽成纯函数**：`src/ui/logic.js` 新增 `isSystemLike(model)` =
   `isNarrator`（`extra.type === 'narrator'`）**或**（`isSystem` 且 名字为空 / `System` / `SillyTavern System` 且不多于一个候选）。
   其余 `is_system` 楼一律按普通楼处理。`floorToolbar.js`（建楼、填楼、工具条、候选控件、头像）、`reader.js`（隐藏用户楼折叠）、`cardPieces.js`、`cardStudio.js` 都改用这个判定；`cardStudio` 通过 `cardPieces` 传出的 `piece.isSystem` 自动跟上。
2. **隐藏楼的名字行加淡色小标签"已隐藏"**（`span.stcr-hidden-tag`，`data-stcr-ignore-anchor` 不参与划线锚点；`title="在 ST 里被隐藏、不发给模型，阅读器照常显示"`）。只在"是 `is_system`、但不是 `isSystemLike`"的楼显示；工具条、候选切换、头像、收藏、划线全部照旧可用。Aa 里**没有**加开关。
3. **"隐藏用户楼"折叠**：`hiddenUserRuns` 改用 `isSystemLike`，被隐藏过的用户楼和普通用户楼连成一段，不再在中间断开。
4. **fixture**：`dev/fixtures/data.mjs` 的 `makeMessage` 增加 `isSystem` 选项；星灯聊天（STCR-01）第 1–3 楼 `is_system:true`（名字、候选不变，其中**第 1 楼保留 3 个候选**）。已重跑 `node dev/fixtures/gen.mjs` 重新落盘并更新 `.dev/fixtures/manifest.json` 的字节数与 SHA-256。`dev/fixtures/selftest.mjs` 相应加了一组断言、并把 swipe 数断言从 `[3,4,5]` 改成 `[3,3,4,5]`。
5. **浏览器回归**：`src/ui/uiBrowser.test.js` 新增导出 `testHiddenFloorsBrowser()`（10 项），并已挂进 `testTextAlignBrowser()` 的结果里（所以 `test-release.cmd` 的界面项从 28 变成 **38**）。
6. **版本**：`manifest.json` → 0.2.1；`CHANGELOG.md` 加 0.2.1 一节（大白话）。README 未动。
7. 文档：`docs/02_UI_SPEC.md` §1.3 系统楼一条改写；`docs/04_TASKS.md` T62 → 待验收；`docs/06_ISSUES.md` I050 追加 T62 处理说明。

## 一个真实的坑（回归抓到的）

第一版把判定写成 `if (!model.isSystem) return false; if (model.isNarrator) return true;`。浏览器回归立刻红了：ST 的 `/sys` 旁白楼 **`is_system` 通常是 false**（只有"只设 bias、正文为空"的那种才会置 true），按第一版会被漏判成普通楼。已改成任务卡规定的 `isNarrator || (isSystem && …)`，并补了对应断言（`旁白不受 isSystem 影响`）。node 侧单测当时也写错了同一条期望，已一并修正。

## 改动文件

- `src/ui/logic.js`：`isSystemLike`；`hiddenUserRuns` 改用它
- `src/ui/floorToolbar.js`：建楼/填楼用 `isSystemLike`；"已隐藏"标签
- `src/ui/reader.js`：`pageNodes` 两处判定改用 `isSystemLike`
- `src/ui/cardPieces.js`：`piece.isSystem` 改用 `isSystemLike`
- `src/ui/ui.test.js`：+`isSystemLike` 与隐藏用户楼两组单测（31 项）
- `src/ui/uiBrowser.test.js`：+`testHiddenFloorsBrowser`，并入 `testTextAlignBrowser`
- `style.css`：`.stcr-hidden-tag`
- `dev/fixtures/data.mjs`、`dev/fixtures/selftest.mjs`、`dev/fixtures/README.md`、`.dev/fixtures/manifest.json`（重生成）
- `manifest.json`、`CHANGELOG.md`、`docs/02_UI_SPEC.md`、`docs/04_TASKS.md`、`docs/06_ISSUES.md`

## 人类验收步骤（约 5 分钟，完全不用代码）

> **更正（2026-10-03）**：第一版写的是 8101（`.tmp/opus-dev/start.cmd`），那是错的——8101 读的是 `.tmp/wt-opus` 里旧的 T59 代码和旧样本副本，看不到本次改动。本卡的改动和重新生成的样本都在主目录与 `.dev`，请用下面的 **8100 开发实例**。

准备：双击 **E:/st-reader/dev/start-dev-st.cmd**，看到 `listening` 后**等半分钟**，浏览器打开 **http://localhost:8100**，按 **Ctrl+F5**。

**A. 隐藏楼不再居中**

1. 右上角角色列表点 **星灯（虚构）**，左下角 ☰ → **管理聊天文件**，选 **STCR-01-正则与多候选**。
2. 点顶栏 **书本图标** 打开阅读器；弹出"0.2.1 更新了什么"点 **知道了**。
3. 看第 1、2、3 楼（从 0 数，就是第 2、3、4 个方块）：正文**左对齐**、有**头像**和**工具条**；名字旁有淡色小标签 **"已隐藏"**，鼠标停上去有说明；**第 1 楼右侧有 `‹ 1 / 3 ›`**，点 `›` 能换候选。
4. 第 0 楼和第 4 楼以后**没有**"已隐藏"标签。

**B. 新开关"隐藏 ST 已隐藏的楼"**

5. 点右下 **Aa**，"显示"一行现在有三个开关：**隐藏用户楼 / 隐藏 ST 已隐藏的楼 / 脱敏显示**。
6. 只打开 **隐藏 ST 已隐藏的楼**：第 0 楼下面变成一行小字 **"— 已隐藏 · 3 条 —"**，第 1–3 楼不见了，第 4 楼接着显示。点这行字 → 三楼展开；再点 → 收起。
7. 再把 **隐藏用户楼** 也打开：最上面变成 **"— 收起 5 条 —"**（第 0–4 楼：用户楼和隐藏楼挨在一起，合成一行），后面每个用户楼各有一行 **"— 你 · 1 条 —"**。
8. 只开 **隐藏用户楼**、关掉另一个：只有用户楼收起，第 1、3 楼（星灯说的、被隐藏过的）照常显示带"已隐藏"标签。
9. 两个都关掉，恢复原样。关掉阅读器再打开，开关状态保持你最后选的。

**C. 真正的旁白楼仍居中小字**

10. 在 ST 底部输入框敲 `/sys 这是一句旁白` 回车（ST 写进 `.dev` 的合成样本，不碰你的真实 ST；做完可双击 `dev/generate-fixtures.cmd` 前先关 8100 恢复样本，不恢复也不影响本次验收）。关掉阅读器再打开，拉到最后：这行**居中小字、无头像无工具条、无"已隐藏"标签**；打开"隐藏 ST 已隐藏的楼"它也**不会被收起**。

**D. 在真实 ST 里核对**

11. 更新到 0.2.1 后打开你之前"除第 0 楼外全部居中"的聊天：正文左对齐、名字旁有"已隐藏"、能换候选；在 Aa 打开"隐藏 ST 已隐藏的楼"，被你点过小眼睛的楼收成一行。

**结束**：8100 黑窗口按 **Ctrl+C**，输入 **Y** 回车。

## 自动检查

| 检查 | 结果 |
|---|---|
| `node src/ui/ui.test.js` | 全部通过（32 项，含新开关的折叠规则） |
| `node dev/selftest.mjs` | 全部通过（168 项） |
| `node dev/audit-readonly.mjs` | 静态边界检查通过 |
| `testHiddenFloorsBrowser`（8100 无头 Chrome） | 10/10 |
| `testTextAlignBrowser`（8100，含上面 10 项 + 宿主样式 12 项） | 38/38 |
| 真实 fixture 端到端（8100 打开 STCR-01） | 12 楼；第 1–3 楼 `align=start`、有头像/工具条/`已隐藏`标签，第 1 楼有 `‹ 1 / 3 ›`；第 0、4+ 楼无标签 |

## 只读自查

```text
rg --no-ignore -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src vendor style.css
```

- 命中 8 行，全部是既有的 `src/core/readonlyGuard.js:4–10` 禁用名单与 `src/core/htmlSnapshot.test.js:12` 拒绝样本；本次新增 **0** 行。
- 只读判定与 DOM 类名，不调用任何写聊天的方法，不碰 `getContext().chat` / `chatMetadata` / `swipe_id`。
- 本任务是否读写、列出、复制过 `F:\Claude\xinllm\SillyTavern\data`：**否**。浏览器回归只跑在 8100 开发实例；未写 C/F 盘、未装依赖、未下载素材。临时文件都在 `.tmp/t62` 与 `.tmp/opus-dev`。

## 已知问题 / 没做的

- 名字恰好叫 `System` / `SillyTavern System`、**且**没有多候选的普通隐藏楼，仍会被当成系统提示行（居中小字）。这是任务卡给的判定规则本身；真实聊天极少这样命名，若遇到把名字改回普通名即可。
- `docs/02_UI_SPEC.md` 里系统楼一条已改，但没有为"已隐藏"标签单独加线框（它只是名字行里的一个小胶囊）。

## 给下一个人的话

- Fable（T63）：回归入口 `testHiddenFloorsBrowser`，已并入 `testTextAlignBrowser`；`test-release.cmd` 的界面项计数 **28 → 38**。本卡改了 astra 的 `dev/fixtures/data.mjs`/`selftest.mjs`（任务卡明确允许），swap 数断言已同步，astra 拉回来时注意这一处。
- 判定函数只有一个：`src/ui/logic.js` 的 `isSystemLike`。以后要改"什么算系统楼"，只改这一处 + `ui.test.js` 对应断言。

## 验收后补充（2026-10-03）

人类指出两点：

1. **验收实例写错了**：见上面"更正"，步骤已改成 8100。
2. **要单独的开关**：任务提示词写了"Aa 里不加开关"，我照做了；人类指出"隐藏用户楼"和"在 ST 里点过小眼睛的楼"有交集不重合，应当能单独收起。已加：
   - 设置项 `hideStHidden`（默认关），Aa → 显示 → **"隐藏 ST 已隐藏的楼"**，悬停说明"在 ST 里点过小眼睛（不发给模型）的楼，用户楼和角色楼都收成一行，点开能看"。
   - `logic.js`：`isStHidden(model)`、`isFolded(model, {hideUser, hideStHidden})`、`foldRuns(models, opts)`（返回每段楼数与折叠条文字）；`hiddenUserRuns` 保留为旧接口。`reader.js` 的 `pageNodes` 改用 `foldRuns` / `isFolded`，两个开关任一变化都按原位置重排。折叠后的展开、跳楼落到折叠条、选段跳过看不见的楼，沿用原有机制。
   - 真正的系统楼（旁白、无名提示行）不受这个开关影响。
   - 实测（8100，STCR-01）：只开新开关 → 一行"— 已隐藏 · 3 条 —"，第 1–3 楼 `display:none`，点开即显示；两个都开 → "— 收起 5 条 —" + 三个"— 你 · 1 条 —"；只开隐藏用户楼 → 六个"— 你 · 1 条 —"。`ui.test.js` 32/32，`selftest` 168/168，`audit-readonly` 通过，`testTextAlignBrowser` 38/38（第一次因实例刚启动、扩展还没加载完报 `initFormatter`，等扩展加载完重跑通过）。
   - 文档：`CHANGELOG.md` 0.2.1"新增"，`docs/02_UI_SPEC.md` §1.3 与设置表，`docs/使用说明.md` 的 Aa 一段。
