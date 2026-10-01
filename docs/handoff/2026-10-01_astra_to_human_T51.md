# T51 交接：裸 HTML 区间与透明沙箱已交付，正式 UI 接线交给 Opus

## 做了什么
- 从 main（`fedb119`）创建分支 `task/T51-html-boundaries`，仅处理 T51；未开始 T53、T54a。
- `detectHtmlBlocks` 不再把整楼当作裸 HTML。只返回块级标签至本段最后闭合标签的 UTF-16 区间，保留前后与段间散文；支持同楼多段、连续的独立 html/body 文档、嵌套标签、属性引号内的 `>`、CSS/脚本中的伪标签。围栏规则和原有识别门槛保持。
- 两层 iframe 均设透明背景与 allowtransparency；两层 html/body 默认透明。内容默认样式放在首个匿名 CSS 层中，内容自己的普通、行内、通配或 @layer 背景均可覆盖，断网与允许外链两种模式均验证。
- 纸舟合成聊天追加第 9、10 楼：场景标题 + 大段带 style 的网页 + 尾声，以及散文隔开的两段网页。内容完全虚构，不来自反馈截图。已离线升级 `.dev` 样本及其 SHA-256 清单，其他聊天不变。
- 提供独立开发验收窗口 `stcrHtmlBoundaryDemo()`，并将区间与浏览器验证接入已有自测入口。
- 发现并修复开发验收阻塞 I039：宿主 public 中的旧扩展副本曾遮蔽 `.dev` 联接。开发预载脚本现在让第三方扩展请求走 ST 原有 `.dev` 路由；只在开发进程复用宿主现有 Express，未安装依赖，未写宿主文件。重启后对入口、引擎、fixture 做 HTTP 响应与 E 盘源码逐字节一致验证。

## 改动文件
- `src/core/htmlRenderer.js`：识别区间、两层透明背景。
- `src/core/htmlRenderer.test.js`、`htmlRendererBrowser.test.js`、新增 `htmlBoundaryBrowser.test.js`：纯逻辑与实际浏览器验证。
- 新增 `src/core/htmlBoundaryDemo.js`、`index.js`：仅开发实例的可视验收入口。
- `dev/fixtures/html.mjs`、`append-html.mjs`、`selftest.mjs`、`README.md`：合成样本、安全追加与说明。
- `dev/isolate-dev-st.mjs`：开发资源路由隔离。
- `docs/03_TECH_SPEC.md` §1/§5.13、`04_TASKS.md`、`06_ISSUES.md`：合同、状态、I038/I039。
- 本交接信。`src/ui/`、readonlyGuard 禁用清单均未修改。

## 人类验收步骤（必填，小白可操作）
1. 用资源管理器打开 **E:\st-reader\dev**，双击 **test-core.cmd**。应看到 Node“全部通过（126 项）”和 UI“全部通过（30 项）”。按任意键关闭此窗口。
2. 在同一文件夹双击 **start-dev-st.cmd**，保持黑窗口打开；等出现 `Go to: http://127.0.0.1:8100/`。浏览器打开 **http://localhost:8100**。如果已经有旧的 8100 开发窗口，请先在那个黑窗口按 Ctrl+C 关闭再启动，以便加载 I039 修复；不要关闭真实酒馆。
3. 浏览器按 **Ctrl+Shift+R** 强制刷新。按 **F12**，点 **Console / 控制台**；在底部输入以下一行后按回车：

   ```js
   await stcrSelfTest({core:false,htmlRenderer:true}); await stcrHtmlBoundaryDemo();
   ```

   应看到“全部通过（47 项）”，随后出现“T51 · 裸 HTML 边界验收（完全虚构）”窗口。若浏览器自行限制粘贴，按控制台自己的提示操作即可。
4. 默认显示一段网页：上方“纸月观测站”的引号标题在网页外；向下滚动，网页结束后还有“合上虚构的观测簿……”的尾声。两句散文不应出现在网页内部。
5. 点 **同楼两段 HTML**，窗口显示“已显示 2 段 HTML”。向下滚动：观测站 → “旅人走过一段散文……” → 蓝邮局 → 尾声，顺序完整，段间散文在两张网页之间。
6. 点 **切换纸面颜色**，可来回切换深蓝与米色纸面。第一张网页未指定底色的空隙跟着纸面变；卡片自己的浅绿色仍在。第二张“蓝邮局”有自己的浅蓝 body 底色，应始终保留。
7. 点 **关闭验收窗口**，返回原来的开发酒馆；最后在开发黑窗口按 **Ctrl+C** 停服。把验收结果告诉我；确认后说“继续”，我才领取 T53。

**本轮验的是 core。** 你已明确指定“UI 接线留给 Opus”，所以正式阅读器目前仍可能整楼隐藏散文、不能显示多段。这不是已完成的界面效果；请把本信的“给下一个人的话”交给 Opus。白框、宽度与裁切仍由 T52 处理，无需去真实酒馆验本次 core。

## 可执行验证与结果
- `node dev/selftest.mjs`：**126/126**，含 T51 区间与 fixture 检查；落盘合成聊天 SHA-256 全部一致。
- `node src/ui/ui.test.js`：**30/30**；未改 UI。
- `await stcrSelfTest({core:false,htmlRenderer:true})`：**47/47**，含两层 computed style、内容底色覆盖、散文不进真实快照、多段互不混入、清理与宿主快照不变。
- `await stcrSelfTest()`：**182/182**，包括既有交互游戏、静态 PNG、当前画面快照、脱敏、字体和存储回归。
- 最终浏览器报告：`.dev/fixtures/t51-browser-result.json`，时间 `2026-10-01T14:28:31.718Z`，`blocked: []`、`passed: true`。浏览器配置、缓存、临时截图均在 `.tmp/`，测试完清理；报告只含计数与请求路径，不含聊天正文。
- 可视复核：实际打开演示、点击同楼两段与纸面切换、滚动到尾声；截图确认段间/尾声在网页外，透明空隙跟随纸面、第二段浅蓝底保留；关闭后验收窗口和沙箱均为 0 个。
- 初轮浏览器因调试初始化超时未完成；随后曾误载 public 旧代码，只得到旧的 37 项结果且找不到新演示入口，**不作为本次通过证据**。I039 修复后的 47/182 项才是最终结果。

## 只读自查（必填）
执行：

```text
rg --no-ignore -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src vendor style.css
```

结果非空，仅以下 **8 行既有防护/拒绝样本**，逐条核对没有实际调用：
- `src/core/readonlyGuard.js:4`：`/api/chats/save`，禁用名单。
- `src/core/readonlyGuard.js:5`：`/api/chats/rename`，禁用名单。
- `src/core/readonlyGuard.js:6`：`/api/chats/delete`，禁用名单。
- `src/core/readonlyGuard.js:7`：`/api/chats/import`，禁用名单。
- `src/core/readonlyGuard.js:8`：`/api/chats/group/save`，禁用名单。
- `src/core/readonlyGuard.js:9`：`/api/chats/group/delete`，禁用名单。
- `src/core/readonlyGuard.js:10`：`/api/chats/group/import`，禁用名单。
- `src/core/htmlSnapshot.test.js:12`：把 save/group-delete URL 作为纯函数“应拒绝”输入，不发送请求。

补查 `saveChat/deleteMessage/deleteLastMessage/renameChat/clearChat/addOneMessage/updateChatMetadata/saveMetadata` 的调用表达式，扩展命中 **0**。

- `node dev/audit-readonly.mjs`：静态边界通过；扩展禁写调用 **0**、宿主字段赋值 **0**；禁用路径仅上述 8 行。网络命中均按既有允许接口、拒绝样本、测试或 vendor 通用能力分类，T51 未新增业务请求。
- 浏览器拦截统计：禁写聊天请求 **0**、外网请求 **0**。ST 自己的开发设置保存出现在请求清单中，不是扩展写聊天；T51 自测前后宿主聊天、候选、元信息与设置快照不变。
- `git diff --name-only -- src/ui` 为空；`.dev/.tmp` 与反馈 PNG/JPG 已跟踪文件 **0**。
- 本任务是否读写/列举过 `F:\Claude\xinllm\SillyTavern\data`：**否**。未打开、复制或入库真实聊天截图。
- 未写 C/F 盘，未装依赖或全局工具，未创建 node_modules，未下载大文件。启动器始终使用 `.dev/data`。

## 已知问题 / 没做的
- I038：正式阅读器局部区间与多段的接线尚未完成，由 Opus 负责；本次 core 演示不能代替 UI 验收。
- 沿用原有“无围栏、含 html/body/style、结构密度达标”入口门槛；普通 div 片段不会因此全部变成网页。标签边界扫描不等同浏览器完整 HTML 容错器，缺闭合标签的畸形片段保留原文。
- 同一段顶层兄弟标签只隔空白/注释时合为一段，保留 style 与内容的作用域；完整 html/body 文档则可单独拆分。
- 没有改 T52 外框/宽度，也未开始缓存、版本或更新服务；main 未快进、未推送。

## 给下一个人的话
- **通知 Opus：§5.13 的四字段和同步签名不变，但 raw.start 不一定为 0、raw.end 不一定是全文长度，raw 也不一定只有一段。** `findHtmlBlocks` 不能再只接 `found.length === 1`；`attach` 不能再整体移动/隐藏 `.mes_text`。
- 按原文区间切分再走正文格式化、显示脱敏与锚点处理；不要拿原文 start/end 去切已经过正则/Markdown/脱敏的 HTML。原文切换、候选切换、多段截图/复制必须分别对应自己的 block.html。
- 请用纸舟第 9、10 楼覆盖“单段前后散文”和“同楼两段”；散文在渲染/原文来回切换中都应保留，锚点文本不要被无意改变。开发演示只供参考分段消费，不替代正式 UI 管线。
- 透明底已经在 core 两层落实；外框若仍白是 T52 的 UI 样式，不要再给内容 iframe 强制白底或 important 透明。
- 继续开发请使用重启后的 `dev/start-dev-st.cmd`，避免 I039 的 public 旧副本遮蔽。分支基于 main 的 `fedb119`；通过后由人类安排整合。
