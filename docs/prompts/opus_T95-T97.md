你是本项目的界面与阅读体验负责人，这一轮仍临时负责引擎（D32 继续生效）。先读 CLAUDE.md（含末尾"临时授权"）、docs/05_DECISIONS.md 的 D32、D40、D42、D43、docs/04_TASKS.md 的 M10（T95–T97）、docs/06_ISSUES.md 的 I056、docs/handoff/ 里 T90–T92 的交接信与 T73（卡片内嵌外链素材的做法，T97 要复用）。前置：0.3.2 发布提交已在 main。一次只做一张卡，顺序 T95 → T96 → T97；每张卡从 main 开分支 `task/<ID>-<短名>`，做完停下告诉人类怎么验收，等"继续"再做下一张。

三条铁律不变：只读（D02：禁用名单、`readonlyGuard.js`、`dev/audit-readonly.mjs` 一字不动）；数据（只用 `.dev` 的 8100 开发实例，不碰 F:/Claude/xinllm/SillyTavern/data/；读 ST 源码 `F:/Claude/xinllm/SillyTavern/public/` 可以）；磁盘（不写 C/F 盘、不装依赖、不下载素材）。D32 要求：03 §5 只增不改；三套自测全绿；交接信单列"core 改动"。环境提醒见 `opus_T90-T92.md` 开头那一段，同样适用。

## T95 在酒馆里打开（D40；反馈 2）

人类原话："希望有快捷键，可以把聊天在酒馆里打开，方便续写。"

这是 NF5"不改当前聊天"的一个**显式例外**，D40 已拍板：阅读器只调用 ST 公开在 `SillyTavern.getContext()` 上的导航函数，效果等同于用户在 ST 聊天列表里点开那个聊天；阅读器自己不写任何东西。ST 源码里 `openCharacterChat(file_name)` 会 `clearChat()`、改 `characters[chid].chat`、`getChat()`、再 `createOrEditCharacter` 保存角色卡的"当前聊天"指针；`openGroupChat(groupId, chatId)` 类似并保存群组。这些都是 ST 自己的行为，不属于阅读器的写入；**D02 名单、守卫、审计都不改**。

要做：
1. 顶栏加按钮（`fa-arrow-up-right-from-square`，提示"在酒馆里打开这个聊天（O）"），快捷键 `O`（输入框聚焦时不抢；登记到 02 §4 与使用说明"快捷键"）。
2. 流程：
   - ST 正在生成（核对 ST 怎么暴露这个状态；找不到公开字段就看 `#mes_stop` 是否可见）或正在存盘 → 提示"酒馆正忙，稍后再试"，不动。
   - 首次使用弹 ST 的 `callGenericPopup` 确认："把酒馆切到这个聊天？酒馆会像你在它的聊天列表里点开一样，把它记为这个角色当前的聊天。阅读器自己不会改任何东西。" 带"不再提示"勾选（存 prefs）。
   - 目标就是 ST 当前聊天 → 只关阅读器，然后滚到正在读的那一楼。
   - 单聊：按 `avatarUrl` 在 `getContext().characters` 里找下标，不是当前角色就先 `selectCharacterById(下标)`，再 `openCharacterChat(文件名)`——核对它要的是带不带 `.jsonl`。群聊：核对 `getContext()` 上有没有 `openGroupById` 之类的群组选择函数；有就用，没有就提示"群聊暂不支持在酒馆里打开"并记 06。
   - 等 `CHAT_CHANGED`（10 s 超时则提示"酒馆没有切过去，请手动打开"）。然后 `#chat .mes[mesid="N"]` 存在就 `scrollIntoView({block:'start'})`，不存在（ST 只渲染最后一批楼）就提示"酒馆只加载了最后一部分楼层"。
   - 阅读器里选的候选与 ST 的 `swipe_id` 不同 → 提示"酒馆显示的是它自己当前的候选"。阅读器**不改** `swipe_id`。
   - 任何一步抛错 → toast 显示错误一句话，不留半开状态。
3. 文档：README"只读与隐私"加一段（"在酒馆里打开"让 ST 做它平常打开聊天时做的事，阅读器不写）；01 NF5 已有补充句，核对一致；使用说明"读"加一条；02 §1.1 / §4。
4. 测试：Node 层覆盖"找下标 / 文件名 / 状态判断"的纯函数；浏览器回归在 8100：对雾岚的另一个样本聊天按 `O`，断言 `getCurrentChatId()` 变了、`chat.length` 对、`swipe_id` 没变、阅读器已关。**注意**：ST 会改写样本角色卡 PNG 的 `chat` 字段，fixture 哈希自测会因此失败——测前复制 `.dev/data/default-user/characters/` 到 `.tmp/t95-keep/`，测后还原（或重跑 `dev/generate-fixtures.cmd`）。8100 的守卫会拦 ST 对空聊天的 `/api/chats/save`，用有内容的样本测。

验收：阅读器里读到第 N 楼按 `O` → 阅读器关闭，ST 当前聊天已是这个聊天并停在第 N 楼附近；ST 的候选序号没变；ST 正在生成时按 `O` 只出提示。

## T96 阅读器主题与铺满（D42；反馈 5）

人类原话："定制一个额外阅读器主题，优化阅读体验，并铺满两个抽屉中间的区域（可以是专用，也可以依旧对酒馆主题做兼容）。" 规划者取"兼容"路线：不另起炉灶，在阅读器子树里覆盖 ST 主题变量，让克隆来的 ST 规则、正则美化、楼内样式照常命中。

要做：
1. prefs：`theme: 'host' | 'paper' | 'night'`（默认 host）、`widthMode: 'host' | 'full' | 'custom'`（默认 host；现有 `width` 滑块只在 custom 时显示）。`normalizePrefs` 与 `ui.test.js` 补。
2. `style.css`：`#stcr_root[data-theme="paper"]` / `[data-theme="night"]` 内覆盖 `--SmartThemeBodyColor / EmColor / QuoteColor / BlurTintColor / ChatTintColor / UserMesBlurTintColor / BotMesBlurTintColor / BorderColor / ShadowColor` 等 ST 变量（到 ST 源码 `public/css/` 核对完整名单）以及阅读器自己的 `--stcr-*` 外框变量；配色与 `cardStudio` 的"纸张 / 深色"模板**同一组值**（抽成共享常量或在 02 写明对照）。阅读器主题下：楼层去气泡底色与边框、名字行弱化、默认行距 1.8、楼间距加大、页面底色盖住 ST 背景图；抽屉、面板、浮层、设置条同步换肤。不改字体。划线四色在两套主题下对比度够。
3. "铺满"：正文列 `max-width: none`，左右各留 24–40 px 页边距（手机档 12 px）；HTML 块"跟随正文"宽度随之变化；`--stcr-host-width` 的 D27 逻辑在 host 模式保持不变。
4. 回归：五个 ST 主题 × 三个阅读器主题 × 两种宽度在 8100 截图核对（含正则美化楼、HTML 楼、系统楼、思维链、划线）；`uiBrowser.test.js` 断言切回 `host` 时正文的若干计算样式（颜色、宽度、行距）与改前快照一致；卡片工作台"继承主题"模板**仍继承 ST 主题**，不跟阅读器主题走（避免范围蔓延，交接信写明）。
5. 02 §2 / §9 记录；使用说明"设置"一节加一段；CHANGELOG 由复查卡写。

验收：Aa → 显示切"纸张"，整个阅读器变暖白纸色，正则美化与状态栏还在；开"铺满"后正文撑满左右面板之间；切回"跟随酒馆"和原来一模一样；刷新后保持。

## T97 导出为文档（D43；社区 2、I056）

社区原话："想要那种可以直接阅读的、没有各种符号的、可以直接阅读的文档，当小说翻看……能够勾选是否显示小剧场 / 思维链 / 记忆表格 / 状态栏 / 其他七杂八表格……想要有那个是谁说出的话（user 和 char）那种区分：user：（一大段文字）char：（一大段文字）"。

要做：
1. core 新建 `src/core/documentExport.js`：`exportDocument(handle, options, { onProgress, signal }) → Promise<{ filename, mimeType, blob }>`。文字**从显示结果取**（正则之后、`renderMessage` 格式化之后的 DOM，与阅读器看到的一致），不从原文剥符号：块级元素与 `<br>` 换行、列表项前加"· "、`<q>` 与引号保留字符、去 `<style>` / 脚本 / `<img>`（留 `[图片]`）。按选项剔除：HTML 块（沙箱块，含小剧场、状态栏）、`<details>` 折叠块、表格、代码块、思维链、系统楼与隐藏楼、用户楼。候选：酒馆当前 / 阅读器里选的 / 全部（全部时每个候选前一行"候选 2/3"）。
   - **TXT**：`名字：`（或 `user：` / `char：`，自动名字按 D38）单独一行，正文一段一段，楼与楼之间空一行；可选 `第 N 楼 · 2026-10-31 21:05` 小标题行；思维链勾上时放在正文前，用"（思考）…（思考结束）"包住。
   - **HTML**：单文件，`<meta charset="utf-8">`，内联一份纸张样式（与 T96 的纸张主题同源），说话人名加粗一行，思维链与折叠块用 `<details><summary>`，表格与代码块勾上时保留结构；**无脚本、无外部请求**；图片只内嵌 data: 与同源能读到的（复用 T73 / D23 的内嵌工具），其余留文字说明；不嵌字体。
   - 脱敏：勾上时复用 `redact.js` / `cardTransforms` 的屏蔽词、替换规则与自动名字（只改文本节点）；文件名 `角色名 - 聊天名.txt/.html`，脱敏开时名字也换。
   - 大聊天：按批建、`requestIdleCallback` 让出主线程、`onProgress(done, total)`、`signal` 可取消；4000 楼样本导出后内存回落。
2. UI：顶栏 ⋯ 加"导出为文档…"，对话框选项按 D43（格式 / 范围 / 候选 / 包含 / 说话人 / 脱敏），默认：TXT、整个聊天、酒馆当前候选、只含楼号与用户楼、名字标注、脱敏跟随 Aa"脱敏显示"；记住上次选择（prefs）；进度条与取消；完成后用与"导出 JSON"相同的下载方式。
3. 测试：Node 层覆盖文字提取与四类剔除、候选三种、说话人三种、TXT 不含 `* # | >` 开头的 Markdown 行；浏览器层在纸舟与重楼样本上导出 TXT / HTML，断言不含 `<script`、HTML 里没有 `http(s)://` 的 `src`，开脱敏后不含角色名；4000 楼样本导出耗时与内存记进交接信。
4. 文档：README"能做什么"加一句；使用说明"分享"一节加"导出为文档"；03 §5 新增合同段；02 §9。

验收：纸舟聊天导出 TXT 用记事本打开：每楼"名字："起头、没有 Markdown 符号、状态栏没了、楼之间空一行；勾上思维链导出 HTML，断网用浏览器打开能展开"思考过程"、图片位置是文字说明或内嵌图；开脱敏后名字变 user / char。

每张卡交接信按 `docs/handoff/README.md` 模板，附只读自查、`audit-readonly` 结果、"core 改动"一节。
