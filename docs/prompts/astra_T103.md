你是本项目的引擎与数据层工程师（astra），接着 M11 的工作。先读 AGENTS.md、docs/05_DECISIONS.md 的 D48（番外视图，全文）、docs/04_TASKS.md 的 M12（T103；也看 T105 了解 Opus 会怎么用你的接口）、docs/03_TECH_SPEC.md §5.2（MessageModel / RenderedMessage，注意 T75 加的 `displayText`）、§5.22（导出文档）、`src/core/htmlBlockLocate.js`（"排好版的正文里哪段对应 displayText 的哪个区间"，你要复用这套定位）、`src/ui/logic.js` 的 `foldRuns` / `isStHidden`（UI 现在怎么折叠楼）。前置：0.4.1 发布提交已在 main。一张卡一个分支 `task/T103-sidestory-core`，做完停下给人类验收步骤。Opus 可能同时在做 T104（只动 `src/ui/` 与 `style.css`），你只动 `src/core/`、`dev/`、`docs/03`、`docs/06`；开工前 `git status`，有别人的未提交改动就用 `git worktree add .tmp/wt-astra` 做。

铁律不变：只读（D02 名单、`readonlyGuard.js`、`audit-readonly.mjs` 一字不动）；数据（只用 `.dev` 的 8100；不碰 F:/Claude/xinllm/SillyTavern/data/）；磁盘（不写 C/F 盘、不装依赖、不下载）。§5 只增不改。交付前四套自测全绿，test-release 前后备份 / 还原 `.dev/.../user/files/st-reader-backup*.json` 与 settings.json。

## T103 番外识别引擎（D48、F21）

人类原话（社区 3 + 人类的括号）："许愿一个能够把番外单独拎出来的功能。一个页面包含所有正文，另一个页面包含所有番外。需要考虑这几种用户：1. 写作模型随正文附上小剧场／番外的，也就是在 char 楼层，让用户自己填小剧场的正则标签；2. 在新楼层直接发'请暂停正文，写一个小剧场／番外'，可以通过 user 楼层识别关键词，这种情况 user 楼层 + char 楼层都需要拎出去；3. 自己手动隐藏小剧场楼层的用户。让用户自己选自己的方式。"

这张卡只做引擎：规则校验、分类、片段定位、导出按视图过滤、fixture 与测试、§5.23 合同。UI（开关、折叠条、两个视图）是 Opus 的 T105。

### 要做

1. **新文件 `src/core/sideStory.js`**（纯函数为主，Node 可测）：
   - `normalizeSideStoryRules(raw)` → 规则对象：
     ```js
     {
       tag:     { on:false, mode:'pair' | 'regex', start:'<小剧场>', end:'</小剧场>', pattern:'', flags:'gs', scanRendered:false },
       keyword: { on:false, words:['小剧场','番外','if线','平行世界','暂停正文'] },
       hidden:  { on:false },
     }
     ```
     坏值回默认；`pattern` 非法正则 → `on:false` 并在返回值 `errors[]` 里说明；`words` 去空白、去重、每词 ≤ 30 字、≤ 50 个；`start`/`end` 各 ≤ 200 字。
   - `classifySideStory(handle, rules, { swipeOf, texts })` → `{ floors: Set<number>, segments: Map<number, Array<{start:number,end:number,swipe:number}>>, stats }`：
     - **关键词法**：用户楼（`isUser`）当前候选文本含任一词（大小写不敏感、整词或子串都算，中文按子串）→ 该楼与它之后**直到下一条用户楼之前**的所有楼整楼进 `floors`。
     - **隐藏法**：`isStHiddenFloor(model)`（T101 搬进 core 的那个）→ 整楼进 `floors`。
     - **标签法**：在每楼当前候选（`swipeOf(index)` 给的，缺省用 ST 的 `swipeId`）的文本上找：`pair` 模式找 `start`…`end`（字面，不区分大小写，允许多段，未闭合的到楼尾）；`regex` 模式用 `pattern`/`flags`（强制加 `g`，拒绝没有 `g` 就会死循环的写法）。文本来源：默认在**原文**（`SwipeModel.text`）上找，`scanRendered:true` 时改在 `renderMessage(handle, index, swipe).displayText`（显示正则之后）上找——因为有人用正则把 `<小剧场>` 改写成别的标签。两种来源都返回 UTF-16 区间 `{start,end}`，并在结果里标明 `source:'raw' | 'rendered'`。整楼都是片段（去掉空白后没有别的字）时升级为整楼进 `floors`。
     - 关键词法与隐藏法先算（只读模型字段，4000 楼也要 < 50 ms）；标签法 `scanRendered` 为真时允许异步分批（返回 Promise，`onProgress`），UI 会先显示再补。
   - `locateSegments(root, displayText, ranges)` → `Range[]`：把 `displayText` 区间映射到排好版的 DOM（`root` 是 `.mes_text`）；复用 `htmlBlockLocate.js` 的对齐办法（它已经解决了"Markdown 加了标签、空白被折叠"的对不上问题），对不上的区间返回 `null` 并计数，UI 退回"整楼折叠条"。原文来源（`source:'raw'`）的区间要先换算到 `displayText`：原文到显示正则之后的文本若被正则改过长度，就按"原文片段的首尾各 20 字在 displayText 里找"的办法重定位，找不到同样返回 `null`。
   - **推荐 UI 做法**（写进 §5.23 给 Opus）：两个视图都渲染整楼，用 `locateSegments` 的 Range 把"另一部分"包进 `<span class="stcr-side-part" hidden>`（或折叠条），**不删节点**，这样划线锚点（按整楼文本算）不受影响。如果你判断 `renderMessage` 仍需要"只渲染区间 / 排除区间"的新可选参数，可以加，但旧签名不变。

2. **导出按视图过滤**：`exportDocument` 的 `options` 加 `view: 'all' | 'main' | 'side'`（默认 `'all'`）与 `sideStory: rules`。`main` 跳过 `floors` 里的楼、并从文字里去掉 `segments`（TXT 与 HTML 都要；HTML 用 `locateSegments` 包起来再剔除）；`side` 只保留 `floors` 里的楼与 `segments`（片段级的楼在 TXT 里写 `第 N 楼 · 候选 k`，HTML 里同样标注）。`stats` 加 `skippedByView`。`documentText.test.js` / selftest 覆盖两视图。

3. **fixture**：`dev/fixtures` 加一个新聊天（`STCR-97-番外-48楼` 之类，≥ 40 楼），用 `generate-fixtures` 的方式生成：三段 `<小剧场>…</小剧场>`（其中一段跨多段落、一段在楼首、一段整楼都是）、一段 `<details><summary>番外</summary>…</details>`、两处用户楼"请暂停正文，写一个小剧场"+ 角色回复（其中一处回复有两个候选）、连续五楼 `is_system:true` 的隐藏楼（普通名字、有候选，不是 System 楼）、一楼真正的旁白楼。fixture 哈希自测同步更新。

4. **selftest**：三法单独与组合的结果与人工数的一致（把期望写死在测试里）；`regex` 模式缺 `g` 的拒绝；`scanRendered` 走 `renderMessage`；`locateSegments` 在带 Markdown 加粗与软换行的片段上能对上；导出 `main` 的 TXT 不含任何小剧场文字、`side` 只含小剧场且带楼号。

5. **03 §5.23** 写合同：规则对象、三个函数签名、`view` / `sideStory` 选项、推荐 UI 做法、存储键建议（`stcr:ui:sidestory:rules:v1` 全局规则、`stcr:ui:sidestory:chat:v1` 每聊天的"不分番外"开关，都是 `store.settings`，非瞬时，随备份），以及性能数字（4000 楼样本三法各多久）。

人类验收步骤：8100 打开新 fixture 聊天 → ⋮ → 导出为文档 → 这次对话框还没有"只正文 / 只番外"（T105 才加），所以让人类在控制台贴一行你准备好的 `window.stcrSelfTest()` 子项，看到"番外引擎 N/N 通过"即可；再把导出的两份 TXT 放进 `.tmp/`，告诉人类打开看：一份没有小剧场，一份只有小剧场。

交接信按模板，附 grep 只读自查；做完停下，Opus 的 T105 要等你合入 main。不要最小执行。
