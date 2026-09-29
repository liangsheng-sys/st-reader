# T13 交接：主题继承、独立存储与锚点已交付

分支：`task/T13-core-storage`。实现提交：`f497b98`；滚动容器集成修复：`fe3f66a`。任务状态：待验收。已吸收 Opus 的 T21 提交 `f230093`，结果同步到日常开发目录，不需要切分支才能验收。T14 未开工，等你说“继续”。

## 做了什么

- **cssScope**：克隆 `#chat` 规则到 `#stcr_chat`，保留 important、媒体/条件规则、嵌套规则与伪元素；切主题、新增/删除 style、Ny 内联变量变化都会自动更新。不改宿主样式或聊天。与 T21 集成时修复双滚动条（I015）。
- **store**：宿主 localforage 的独立 IndexedDB 实例 **st-reader**，提供批注、收藏、屏蔽词、设置，以及 I010 要求的替换规则、图片素材，共六类数据。整楼收藏与指定候选收藏可并存，保存标题与片段。
- **JSON 备份**：六类数据完整导出、预览导入数量、原子合并。重复项跳过，保留当前编辑；损坏备份、未来版本、悬空素材引用全部拒绝，不会写入一半。
- **小图片存储**：PNG/JPG/WebP/SVG，每张≤200 KiB、最多30张；SVG 清洗，图片引用检查、删除保护，全部随 JSON 备份。没有引入新依赖或第三方素材。
- **anchor**：在正文或思维链内生成跨文本节点引用，以聊天/楼/候选/区域隔离。正则变化后能唯一定位则恢复 Range，否则持久化到 orphan；原引用与批注保留，文本恢复后可重新附着。
- **合同与自测**：03 §5.5–5.8 写明实际签名、JSDoc、错误与示例；Node 累计50项，浏览器累计70项，另有真正重新加载页面的存储验证。T12 已交付接口未改。
- **I013**：开工时雾岚合成角色卡与清单不一致。核对到默认聊天变为大文件且宿主补齐字段；所有聊天文件哈希仍一致。服务停止后仅重新生成这一张合成 PNG，恢复清单一致，未改聊天或设置、未放宽自测。

## 改动文件

- 新增 `extension/src/core/cssScope.js`、`store.js`、`anchor.js`、`assetCodec.js`、`persistence.test.js`、`persistenceBrowser.test.js`。
- 修改 `extension/index.js`（启动/开发自测入口）、`fixtureSelfTest.js`（T11 字体检查支持 Ny 重复导入的别名）、`dev/selftest.mjs`。
- 更新 `docs/03_TECH_SPEC.md`、`04_TASKS.md`、`06_ISSUES.md`、`SETUP_WINDOWS.md` 及本信。
- **未改** `src/ui/`、`style.css` 或人类的 `07_FEEDBACK.md`；保留 T21 全部界面。

## 人类验收步骤（不需要会代码）

1. 资源管理器地址栏粘贴 **E:\st-reader\dev**，回车，双击 **test-core.cmd**。应逐行显示“通过”，最后 **全部通过（50 项）**。按任意键关闭。
2. 双击同目录的 **start-dev-st.cmd**。等黑窗口出现 **listening on IPv4: 127.0.0.1:8100**，浏览器打开 **http://localhost:8100**。
3. 这个浏览器若尚未导入测试字体：点顶栏**积木图标 → Ny字体管理器 → 导入字体**，点**浏览…**，选择 **E:\st-reader\.dev\fixtures\fonts\JetBrainsMono.ttf**，点**导入字体**，再点新字体下面的**设为正文**。若名字是 **JetBrainsMono (2)** 也可以。等几秒后刷新。字体的存储按浏览器和网址隔离，保持 localhost:8100。
4. 点顶栏**名片图标（角色管理）**，在列表里点 **雾岚（虚构）**；若正显示角色详情，先点面板左上角**列表图标**返回列表。应看到普通的三楼聊天。不要点欢迎页的“大文件”最近聊天；大文件请从阅读器里打开。
5. 如果阅读器已经打开，按 **Esc** 关闭。按 **F12**，点 **Console / 控制台**，粘贴下面这一行，按回车：

   ```js
   await window.stcrSelfTest()
   ```

   应显示 **全部通过（70 项）**，passed 全为 true。包含 Ny 字体、主题变化、新增 style、JSON 往返、锚点与孤立恢复、只读终检。不想粘贴代码，可打开 **http://localhost:8100/?stcrSelfTest=1&coreWhenChat=1**，再照第4步点雾岚，自动运行同一套检查。
6. 确认刷新后数据还在：保持控制台打开，地址栏输入 **http://localhost:8100/?stcrStorageProbe=write**。等出现 **“刷新验证已写入”**，把地址最后的 `write` 改成 `read`，回车。应出现 **“跨页面持久化验证通过：六类数据与 orphan 均保留；专用测试表已清理。”**。这套检查使用专用测试表，不动已有批注/收藏。
7. 肉眼看主题：回到 **http://localhost:8100**，打开雾岚，点顶栏**书本图标**。正文左边应有薄荷色边线。退出阅读器，在**用户设置（人形带齿轮）→ UI主题**切另一套主题，再打开阅读器，应跟着变化；切回 **STCR T11 · 雾岛纸页**，边线恢复。
8. 长聊天回归：阅读器左上角 **≡ → 最近 → 雾岚的 STCR-90-大文件-1600楼**。正文只有一条滚动条；点底部楼层进度，填 **1500**，点**跳转**，应显示 **第1500楼 · 共1600楼**。
9. 按 Esc 退出阅读器；黑窗口按 **Ctrl+C** 停止。告诉我“通过”或哪一步不对。验收后说“继续”，我再领 T14。

更完整的故障处理见 `SETUP_WINDOWS.md` §2.3。若 Node 提示合成文件哈希不符，先停止开发实例，再双击 `generate-fixtures.cmd` 恢复合成样本；不要通过编辑清单掩盖差异。

## 已执行验证

- `node dev/selftest.mjs`：50项全绿，含六类 JSON 往返/重复合并/写入失败原子性/并发/图片限额与引用/UTF-16 引用/CSS 安全边界。
- `node extension/src/ui/ui.test.js`：Opus 的19项回归全绿。
- T11 的 `stcrSelfTest({fixtures:true,font:true,rendered:true})`：21项回归全绿，按当前 Ny 字体别名查到实际 IndexedDB Blob，字节数与内容哈希均正确。
- 正式开发扩展入口 `window.stcrSelfTest()`：70项全绿。最后一轮合成21.35 MiB读取、取两页、渲染末楼约 **457 ms**；不是50 MB性能结论。
- 真实 IndexedDB 重开与页面重载：六类数据及孤立批注均保留，专用测试表清理成功。
- 真实 Ny 的本地 FontFace：重新导入并应用 JetBrainsMono (2)，刷新后正文与阅读器字体一致，important 保留。没有下载字体，使用 T11 已准备的187208字节本地文件。PNG字形嵌入尚归T14。
- 正则与锚点：测试脚本副本经过真实 `runDisplayRegex`，前后文改变仍定位；替换掉引用则进入 orphan；移除测试正则恢复附着，原批注未丢失。宿主正则设置不变。
- 在 ST 的主题下拉框实际执行 **雾岛纸页 → Azure → 雾岛纸页**，阅读器正文随之变化，边线消失/恢复；原有圆形头像、扁平聊天样式已复原。
- 阅读器实际打开1600楼文件、跳到1500楼；修复前出现双滚动条，修复后只有外层滚动条，进度显示正确。
- 自动终检逐项比对宿主聊天、元信息、候选、当前角色/群组、扩展设置、主题及原生聊天 style；一致。临时文档、样式、存储测试表清理完毕。

## 只读自查（grep / rg）

在仓库执行以下实际检索；命中情况如实列出，不把拦截清单误报成“全仓库零命中”。

```powershell
rg -n '/api/chats/(save|rename|delete|import|group/(save|delete|import))' extension
```

结果仅 `extension/src/core/readonlyGuard.js:3–9` 七行拦截清单；排除该文件后 **空**。不是 API 调用。

```powershell
rg -n '\b(saveChat|deleteMessage|deleteLastMessage|renameChat|clearChat|addOneMessage|updateChatMetadata|saveMetadata)\s*\(' extension
rg -n '(chatMetadata|swipe_id)\s*(=|\+=|-=|\+\+|--)|getContext\(\)\.chat\s*=' extension
rg -n 'fetch\(|XMLHttpRequest|sendBeacon|WebSocket' extension/src/core/cssScope.js extension/src/core/store.js extension/src/core/anchor.js extension/src/core/assetCodec.js
```

三组均 **空**。新模块不发网络请求；CSS 克隆保守过滤远端/API资源及无法证明安全的动态资源声明。静态检索另结合浏览器快照终检与 UI 的只读规则回归，不把 grep 当作完整证明。

- 本任务是否读、列、复制、写过 `F:\Claude\xinllm\SillyTavern\data`：**否**。
- 开发进程固定 `--dataRoot E:\st-reader\.dev\data`，通过既有隔离启动器启动；仅核对允许的 `public/` 源码。未安装依赖、未建 node_modules、未下载文件、未写 C/F 盘。
- 工作副本、辅助联接、卡片临时备份与测试运行目录均只放 `.tmp/`，交付前清理本任务创建的内容；其他任务预留的临时目录未动。

## 已知边界 / 后续卡

- 划线、收藏、导出/导入按钮是 T22；T13 的接口和自动检查现在即可用。T21 的 localStorage 阅读设置尚需 UI 迁移到 store.settings（I012），本卡没有擅改 prefs.js。
- 跨域不可读样式表跳过；直接 CSSOM insertRule/replaceSync 或 adoptedStyleSheets 更新须发设置事件或调用 refreshCssScope。资源属性中的动态 URL 保守略过。普通主题颜色/字号变量、Ny字体和important已验证。
- Web Locks 可用时支持多标签串行；不支持时保证当前实例写入顺序。备份上限24 MiB；素材总量上限30×200 KiB。UI滚动进度写入应去抖。
- Ny 字体不属于阅读器 JSON 备份，字体导入/迁移仍由 Ny 管理。T14负责PNG。

## 给下一个人的话

- **Opus / T22**：直接按03 §5.5–5.8接入。收藏包含title/preview（I006已完成）；批注anchor含part，rawText传所读候选对应区域的正则前原文；不要把未加载页判成孤立。高亮控件加data-stcr-ignore-anchor，异步完成前若页面已变应丢弃旧Range。
- **I012**：两个旧键可原名存进store.settings；get/set为异步，落盘成功后才删localStorage旧键。设置、进度、候选记忆都会纳入JSON。迁移失败保留旧数据，导入重复设置键保留现有值。
- **I015**：cssScope负责解除原生正文容器的普通max-height/overflow；UI继续由外层滚动/分页，不需要另复制宿主CSS。
- **T14**：replaceRules/assets存储与备份已落实I010①②；③④的名字替换、图标/图片执行、优先级和群成员自动规则尚待T14。素材已经过清洗；按引用ID取dataUrl。
- **规划者**：I010（Opus旧分支原I007）的T23扩容仍需在T23开工前决定是否拆成“模板工作台 / 替换规则 / 图片素材管理”。本次没有替规划者拍板，也没有开始T23。
- T12接口未改。T13新合同已交付；后续变更签名、字段语义或错误行为仍须登记06并在交接信通知Opus。
