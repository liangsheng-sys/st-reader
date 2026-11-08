你是本项目的界面与阅读体验负责人，这一轮仍临时负责引擎（D32 继续生效，人类 2026-11-08 确认）。先读 CLAUDE.md（含末尾"临时授权"）、docs/05_DECISIONS.md 的 D32、D33、D39、D41、D44、docs/06_ISSUES.md 的 I060、I061、docs/04_TASKS.md 的 M9（T90–T92）、docs/handoff/ 里 T70、T82 的交接信（备份与滚动性能的来龙去脉）。一次只做一张卡，顺序 T90 → T91 → T92；每张卡从 main 开分支 `task/<ID>-<短名>`，做完停下告诉人类怎么验收，等人类说"继续"再做下一张。

三条铁律不变：只读（D02：禁用名单、`readonlyGuard.js`、`dev/audit-readonly.mjs` 一字不动）；数据（只用 `.dev` 的 8100 开发实例，不碰 F:/Claude/xinllm/SillyTavern/data/）；磁盘（不写 C/F 盘、不装依赖、不下载素材，临时文件只放 `.tmp/`）。D32 要求：03 §5 只增不改；`node dev/selftest.mjs`、`node src/ui/ui.test.js`、`dev/test-release.cmd` 全绿；交接信单列"core 改动"。

环境提醒（来自之前几轮的教训）：
- 任何 8100 发布测试或 e2e 之前，先把 `.dev/data/default-user/user/files/st-reader-backup*.json` 与 `.dev/data/default-user/settings.json` **复制**到 `.tmp/<task>-keep/`，测完还原；手动 e2e 里改过的偏好会通过镜像文件漏进发布测试。
- 8100 的只读保护会拦 ST 自己的 `/api/chats/save`，所以 8100 上发不了消息；需要"ST 发一条消息"的场景在 8101（`.tmp/opus-dev/start.cmd`，先把 `.tmp/wt-opus` 切到任务分支）做，或用 `eventSource.emit` 只读地模拟事件。
- 开 8100 后先 `--nav` 一次再探测，别在旧页面上跑；结束时只杀自己的无头 Chrome（按 profile 目录匹配），绝不 `taskkill /IM chrome.exe`。
- 人类电脑经常忙（CPU 40–70%），性能阈值先在 main 上跑对照再下结论。

## T90 打开速度（I060、I061、D39；反馈 4）

人类原话："为什么我感觉打开聊天的速度反而没有之前快了……打开一个 200 多楼的聊天花了好几分钟。"

规划者读代码发现的确定问题（I060）：`backupService.start` 里 `store.onChange(() => scheduleMirror())` 订阅了一切变更，而 `prefs.js` 的 `setReadPosition` / `rememberSwipe` 每 1.5 s 把阅读进度写进 `store.settings`。读长聊天时每 3 s 就 `exportAll()` 一次（全部批注 + 最多 30 张 base64 图）再 base64 再 `/api/files/upload`。这是 0.3.0 之后才有的路径，先修它。

要做：
1. **D39**：`store.js` 给"瞬时状态"提供一种写法，持久到 IndexedDB、保留在备份 JSON 里，但**不触发 `onChange` 的镜像、不递增 rev**（怎么做你定：例如 `store.settings.set(key, value, { transient: true })`，或单独的 `store.settings.setTransient`，§5 只增）。`prefs.js` 的进度与候选记忆改走它；偏好开关（字号、脱敏等）照旧触发镜像。关闭阅读器与 `pagehide` 时，若自上次镜像以来只有瞬时状态变过，最多补写一次（让换浏览器也能接着读）。`backupService.test.js` 加断言：连续写进度 10 次、等 5 s，mirror 调用次数为 0；关阅读器后为 1。
2. **诊断**：Aa → 更多设置新增"诊断"行。记录最近一次打开聊天的分段耗时：等 ST 返回文件（`/api/chats/get` 往返）、解析 JSON 与建模型、建首批 DOM（含正则 + 格式化 + `<style>` 清洗）、首屏排版到可滚动、创建了几个沙箱；另附楼数、文件大小、是否命中缓存、备份 JSON 大小与上次镜像耗时、阅读器版本、浏览器 UA、窗口尺寸。"复制诊断信息"按钮复制成纯文本，**不含任何正文、名字、文件名**（聊天只写"楼数 / 字节数"）。首屏之后把这些数字也 `console.info` 一行。
3. **重楼样本**：`dev/fixtures` 新增 `STCR-96-重楼-240楼`（挂在雾岚名下）：每楼 = 两三段散文 + 一个带 `<style>`（含 @keyframes 与渐变）和三个 `<details><summary>` 的状态栏 `<div>` 盒 + 一张 2–4 KB 的 data: PNG + 一处能被 fixture 里某条显示正则命中的标记；第 240 楼长一些；给它写一条阅读进度在末尾（模拟"接着读"）。`dev/generate-fixtures.cmd` 能生成，fixture 哈希清单更新。全部虚构文本。
4. 在该样本上用 Performance 面板录"点击打开 → 能滚动"，找热点。I061 列的候选：每楼 `cleanStyleText` 的浏览器 CSS 解析、`findHtmlBlocks` / `locateRaw` 定位、DOMPurify 处理含 data: 图的长楼、沙箱是不是为整批 30 楼甚至 120 楼都建了、T82 的空闲预建是否在首屏前就抢主线程、进度恢复是不是从第 1 楼逐批建到末尾。修到：**冷开（去掉等 ST 返回文件那一段）≤ 2 s，命中缓存重开 ≤ 300 ms，沙箱只为视口一屏内的楼创建，首屏可滚动前不跑空闲预建**。能缓存的按楼缓存（例如同一段 `<style>` 文本的清洗结果用 Map 记一次）。不改分页上限、不改内存回收逻辑。
5. `dev/test-performance.cmd` 加 `--heavy`：跑上面三条阈值；`dev/test-release.cmd` 不必包含它（人类电脑忙时会抖），但交接信里要有在 main 与本分支各跑三次的数字。
6. 使用说明"常见问题"的"打开很长的聊天有点慢？"改写：先说 0.3.2 修了什么，再说"还是慢就 Aa → ⋯ → 诊断 → 复制诊断信息，发给作者"。

验收（写进交接信）：开发实例打开"重楼 240 楼"样本从点击到能滚动不超过 2 秒，退出再进几乎立刻；一边读 30 秒一边看 `.dev/data/default-user/user/files/st-reader-backup.json` 的修改时间，不变；Aa → ⋯ → 诊断 → 复制，能粘出一段数字。另请人类在真实 ST 更新后对那个"几分钟"的聊天再做一次，把诊断信息贴进下次反馈。

## T91 抽屉列表缓存（D41；反馈 3）

人类原话："阅读器左侧抽屉虽然加载得挺快，但是能不能也做缓存？"

要做：
1. `chatSource.js` 的 `listCharacters / listGroups / listRecent / listByCharacter / listByGroup` 加同一页面会话内的内存缓存：有缓存立刻返回缓存，同时后台重拉，结果与缓存不同（按 JSON 比）才通知调用方（§5 只增，例如 `options.onUpdate(rows)` 回调，或 `watchList(kind, id, listener)`）。不写 IndexedDB。
2. `watchHostChatEvents` 命中时按 D41 作废：`MESSAGE_SENT / RECEIVED / EDITED / DELETED / SWIPED / UPDATED`、`CHAT_CHANGED` → "最近" + 当前角色 / 群组的聊天列表；`CHAT_DELETED / GROUP_CHAT_DELETED` → 对应项；角色与群组增删改 → 角色 / 群组表（先到 ST `event_types` 里核对真实事件名，例如 `CHARACTER_EDITED`、`CHARACTER_DELETED`、`GROUP_UPDATED`，有什么订什么，都是只读订阅）。
3. `drawer.js`：再次打开阅读器不再出现骨架条；页签、展开的角色、滚动位置在同一会话内保持；后台拉回来有差异时原地更新，不跳动、不丢当前滚动位置；页签行加一枚"刷新"图标按钮（强制重拉当前页签）。
4. 测试：Node 层覆盖"命中 / 作废 / 差异才通知 / 无差异不通知"；浏览器层在 8100 用 `eventSource.emit` 模拟一次 `MESSAGE_RECEIVED` 后断言"最近"列表被重拉。
5. README"只读与隐私"里"同一次页面会话内……"那一段补一句：角色与聊天列表也只在内存里缓存，刷新即空。

验收：第二次打开抽屉立刻有内容、没有骨架条；在 8101 的 ST 里发一条消息后再开抽屉，"最近"里那个聊天排到最前；刷新页面后第一次仍是骨架条（证明没落盘）。

## T92 收藏备注 + 顶栏图标开关（D44；反馈 1、社区 1）

人类原话："希望能给我收藏的聊天记录加备注，因为酒馆的默认名不能让我想起来里面有什么内容。" 社区："希望可以选择取消顶栏图标。"

要做：
1. `store.js`：`kind:'chat'` 收藏记录可选 `note`（字符串 ≤ 500 字，去首尾空白，空串等于没有）；导出 `version` 仍为 1；旧 JSON 导入、D33 合并（`updatedAt` 新者胜）都有测试。`chatFavorites.js` 加 `setFavoriteNote(chatKey, note)` 与变更通知。
2. 抽屉"收藏"页：每行标题下一行灰字显示备注（超长省略，`title` 显示全文）；行尾铅笔按钮打开行内小输入框（单行 textarea，回车保存、Esc 取消、失焦保存）；过滤框同时匹配备注文字。
3. 顶栏 ☆：未收藏时点击直接收藏（现状）；**已收藏时**点击弹两项小菜单"编辑备注… / 取消收藏"，避免误触取消；编辑备注用同一个输入框样式。
4. `hostSettings.js` 白名单加 `topbarIcon`（布尔，默认 true；03 §5.16 "只增"）；`mount.js` 按它决定是否挂顶栏图标，并导出能在运行时挂 / 卸的函数；Aa → 更多设置 → 显示加开关"在 ST 顶栏显示阅读器图标"；ST"扩展"面板加一个阅读器小块（`renderExtensionTemplateAsync`，模板放 `src/ui/templates/`），只放同一个开关和一句"隐藏后可从魔杖菜单「阅读器」或 /reader 打开"。两处开关互相同步。
5. 使用说明："怎么打开"加"不想要顶栏图标可以关"，"记"加"收藏的聊天可以写备注"。

验收：收藏页给一个聊天写备注"结局是灯塔亮了"，刷新后仍在，`.dev/.../user/files/st-reader-backup.json` 里能搜到；过滤框输入"灯塔"能筛出它；顶栏 ☆ 已收藏时点击出现两项菜单；关掉图标开关后顶栏图标消失、`/reader` 仍能打开、刷新后仍隐藏，ST 扩展面板里也能开回来。

每张卡交接信按 `docs/handoff/README.md` 模板，附只读自查、`audit-readonly` 结果、"core 改动"一节与性能数字（T90）。
