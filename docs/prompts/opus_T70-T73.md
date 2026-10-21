你是本项目的界面与阅读体验负责人，这一轮临时也负责引擎（D32：astra 缺席，core 由你接管）。先读 CLAUDE.md（含末尾"临时授权"）、docs/05_DECISIONS.md 的 D32–D35、docs/06_ISSUES.md 的 I051–I053、I055、docs/04_TASKS.md 的 M7（T70–T73）、docs/03_TECH_SPEC.md §5.5（存储）、§5.14（缓存）、§5.15（更新）、docs/handoff/2026-10-21_fable_to_human_M7.md。一次只做一张卡，顺序 T70 → T71 → T72 → T73；每张卡从 main 开分支 `task/<ID>-<短名>`，做完停下告诉我怎么验收，我说"继续"再做下一张。

三条铁律不变：只读（D02，`readonlyGuard.js` 名单不放宽）；数据（只用 .dev 的 8100 开发实例，不碰 F:/Claude/xinllm/SillyTavern/data/）；磁盘（不写 C/F 盘、不装依赖、不下载素材、临时文件只放 .tmp/）。D32 额外要求：03 §5 合同只增不改；交付前 `node dev/selftest.mjs`、`node src/ui/ui.test.js`、`dev/test-release.cmd` 全绿；交接信单列"core 改动"一节，写清改了 core 哪些文件、为什么、合同加了什么。

## T70 自动备份到 ST 服务器（D33、I053）

背景：人类和社区都说"怕丢"。现在批注、收藏、规则、设置全在浏览器 IndexedDB，清站点数据或换浏览器就没了，连"更新了什么"也因此反复弹（I053）。D33 的做法：IndexedDB 继续当本地主存；每次变更后自动把整份 JSON 写到 ST 服务器的用户文件区；小开关类设置走 ST 自己的 extension_settings。

要做：
1. core 新增 `src/core/backupService.js`：`scheduleMirror()`（3 秒防抖；阅读器关闭与 `pagehide` 时立即 flush）、`mirrorNow()`、`restoreFromServer()`、`getMirrorStatus()`。store 的每次 `mutate` 之后调 `scheduleMirror()`。
2. 写法：`store.exportAll()` 的 JSON → base64 → POST `/api/files/upload`（body `{name, data}`，ST 原样覆盖写到 `data/<用户>/user/files/`；先在开发实例 ST 源码 `src/endpoints/files.js` 核对文件名校验规则，用 `st-reader-backup.json` 这种只含字母数字点横线的名字）。每天第一次写时另存 `st-reader-backup-YYYYMMDD.json`；列出并只保留最近 7 份，多余的用 `/api/files/delete` 删，**只删自己这个前缀的文件**。读回走静态路径 `/user/files/<name>`。
3. `extension_settings['st-reader']`（用 `getContext().extensionSettings`）存 `{rev, mirroredAt, bytes, lastSeenVersion, updateNotice}`，改完调 `getContext().saveSettingsDebounced()`。`updateService` 的 `lastSeenVersion` 改读写这里；`prefs.updateNotice` 同步到这里。
4. 启动（扩展加载完、首次打开阅读器前）比对 `extension_settings.rev` 与本地 IndexedDB 的 rev：本地为空或落后 → 读服务器备份，按 D33 合并（同 id 以 `updatedAt` 新者胜，屏蔽词并集），然后 toast"已从 ST 服务器恢复批注 N 条"。合并与 rev 规则写成纯函数进 selftest。
5. UI：Aa → 更多设置的"备份"行改成两行：第一行"上次自动备份：10-21 09:30 · 1.2 MB"（没备份过显示原因，例如"ST 文件接口不可用"）；第二行按钮"立即备份""从服务器恢复"，原"导出 / 导入 JSON"保留在旁边。
6. 文档面板层级：社区截图里"更新了什么"面板被正文叠在上面，查 `.stcr-doc-backdrop` 的层叠上下文并修正，顺手确认面板只弹一次。
7. 文档：README"只读与隐私"一段改写（批注会自动备份到你 ST 的 `data/<用户>/user/files/`，不在 chats 目录；清站点数据后会自动恢复）；`docs/使用说明.md`"设置与备份"重写；03 新增 §5.16 备份合同；`dev/audit-readonly.mjs` 若按路径白名单工作，把这两个接口登记为"用户文件区，非聊天"。
8. 回归：Node selftest 覆盖合并、rev 比对、7 份轮替的纯逻辑；浏览器回归在 8100 上真写 `.dev/data/default-user/user/files/`，断言文件内容等于 `exportAll()`，并做一次"清 IndexedDB → 重开 → 自动恢复"。

验收步骤写给完全不会代码的人：在 8100 划一条线写一句批注，等 3 秒，打开资源管理器看 `.dev\data\default-user\user\files\` 里 `st-reader-backup.json` 时间变了；F12 → Application → 清站点数据 → 刷新 → 打开阅读器，批注还在且有"已恢复"提示；Aa → 更多设置能看到上次备份时间。

## T71 缓存校验改事件驱动（D34、I055）

背景：人类说 60 秒窗口没必要，而且过了一分钟再开也不弹横幅。D34 改成：当前聊天直接拿 `getContext().chat` 比对、过时就直接重读；监听 ST 事件即时作废缓存；非当前聊天每次后台校验；加"重新读取"按钮。

要做：
1. `chatSource.js`：删 60 秒复用；新增 `invalidateChat(chatKey)`；`openChat` 命中缓存且该 chatKey 等于宿主当前聊天时，同步比对楼数、末楼 `send_date`、各楼 `swipes.length` 与 `swipe_id`，不一致就当作 reload 冷读（不弹横幅）。
2. `index.js` 挂载时只读订阅 D34 列出的九个 `eventSource` 事件 → `invalidateChat(当前 chatKey)`。只读：回调里不碰 `chat`、`chatMetadata`、不调任何保存方法。卸载时退订。
3. 非当前聊天命中缓存：每次后台 `search` 校验，横幅逻辑不变。
4. 顶栏加"重新读取"图标按钮（`fa-rotate-right`），调 `openChat(key, {reload:true})`，成功再换正文。
5. 03 §5.14 改写；`chatCache.test.js` 的 60 秒断言改掉，补"事件作废""当前聊天实时比对"；README 隐私段删掉"60 秒"一句。

验收：8100 里在 ST 发一条消息（`/sys 测试` 也行），立刻打开阅读器，拉到底能看到新楼、没有横幅；改一个非当前聊天的 fixture 文件再打开它，出现横幅；顶栏"重新读取"按钮可用。

## T72 显示失败兜底 + 裸 HTML 边界（I051、D35）

背景：社区一张带状态栏/正则的卡，阅读器里角色楼全部"（第 N 楼显示失败）"，用户楼正常；ST 侧那一楼是散文 + 三个 `<details><summary>` + 带渐变胶囊的 div 盒 + 小剧场 details。人类自己的案例：`</div></div>` 之后的 `<selection>xxx</selection>` 和 `<details><summary>摘要</summary>` 被塞进了沙箱。

要做：
1. 兜底：`reader.js` 渲染某楼抛错时，不再只显示一句话，而是显示转义后的原文（保留换行、不渲染 HTML），名字旁加淡色小标签"原样显示"，⋯菜单加"复制错误信息"（扩展版本、ST 版本、楼号、错误名与栈，**不含正文**），并 `console.error('[st-reader] 第 N 楼渲染失败', err)`。已有的测试注入故障机制可复用。
2. 边界：`htmlRenderer.detectHtmlBlocks` 按 D35 五条改写。`htmlRenderer.test.js` 补样本"一行散文 + `<div style>` 盒 + `<selection>xxx</selection>` + `<details><summary>摘要</summary>…</details>` + 一行散文"，断言只有 div 盒是 HTML 块。
3. fixture（`dev/fixtures/data.mjs`，D32 允许）新增一楼模仿社区结构：散文若干段、三个 `<details><summary>`（带 emoji）、一个 inline style 渐变胶囊 div 盒、一个含 `<style>` 的状态栏、一个 `<selection>` 自定义标签。重新生成样本并更新清单。这一楼在阅读器里必须正常渲染。
4. 五主题下对该样本跑 `testTextAlignBrowser`。
5. 如果你在合成样本上复现不出"显示失败"，交接信里写明已排查的路径（messageFormatting、正则管线、detectHtmlBlocks、沙箱），并说明兜底后用户能把错误信息复制给我们。

验收：打开新样本那一楼：散文正常排版、三个摘要可折叠、胶囊盒在沙箱里、`<selection>` 里的字按普通正文显示；Aa → 更多设置里用测试注入让一楼出错，看到原文和"原样显示"标签，⋯菜单能复制错误信息。

## T73 卡片导出保留美化（I052）

背景：社区截图，卡片工作台预览里正则美化（纸张背景、版式、`<char>` 标题）完整，导出 PNG 只剩文字和图片。

要做：
1. 用 fixture 的正则美化楼复现（如需补一楼：楼内 `<style>`、`background-image` 分别为 data: 和 https 外链、`<char>` 标题）。先确认差在哪：楼内 `<style>` 没进快照？`background-*` longhand 漏复制？外链被 CORS 拒后整条丢？
2. 修 `cardSnapshot` / `cardExport`：楼内 `<style>` 克隆进快照并把选择器前缀到卡片根；`background-*` 全部 longhand 复制（记住：card CSS 里不能用带 `var()` 的 shorthand）；外链图片按 D23 规则内嵌，拿不到的逐项提示并画占位，不整块丢。
3. 工作台状态栏加一句"预览和导出不一样？"链接到使用说明对应段落。

验收：那一楼选段做卡片，预览与导出 PNG 肉眼一致；把一张外链图片地址改成不存在的，PNG 上有占位且有提示。

每张卡的交接信按 `docs/handoff/README.md` 模板，附只读自查 grep 与 `node dev/audit-readonly.mjs` 结果，并单列"core 改动"。
