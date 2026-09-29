# T30 交接：core 修复与验收入口已交付，性能仍有一项待解决

分支：`task/T30-integration-audit`，从 `task/T23b-replace-rules` 的 `4489626` 接续，保持线性历史。交付时 `main` 以 `git merge --ff-only` 快进到本卡最终提交。状态：**待验收，NF2 性能遗留 I020 未关闭**。没有改 `extension/src/ui/`；02 只改了 §6.4 优先级那一行。

## 做了什么

- I018①：core Canvas 字体名正确加引号，六个 FA 图标栅格化后都验证了实际 PNG 面积/高度，防止退回10px小点。I018②评估后保留单项 CSS 方案，没绕过资源过滤去整段复制 cssText；限制写入03。
- I019：自动名字整体保护。我的规则完整同名可覆盖，无交集照常替换；内部片段、跨边界和非同名长词不能拆开名字。群成员、用户/角色、宏、大小写、整词、作用域和嵌套名字都有回归。
- `mappings` 增加 `skippedOverlap:true` 与 `skippedRules:[{from,to,count}]`。诊断附在真正保护整名的实际映射上；顶层仍只有实际替换，不让旧 UI 将未执行规则误用于批注。正文/思维链/名字/正则宏合并时不丢诊断。03 §5.9/5.10 已写清合同。
- 独立生成 **53.39 MiB / 4000楼**，保留完整真实 UI 的性能/内存复测入口；没有把原21MiB样本改名冒充50MiB，也没读真实聊天。结果见下表，失败照常返回非零。
- 提供安装/卸载 `.cmd`、全仓库静态审计脚本、M3全项勾选清单，补完Windows手册§3。
- I013选“改检查方式”：角色PNG验证CRC和chara/ccv3中的身份、描述、创建者、角色版本、合成标记、作用域正则。允许宿主补默认字段、重编码图片和改变当前chat；**所有聊天依旧严格比大小与SHA-256**。比只打印“重建”更合适，因为正常浏览不该让自测反复红灯。补字段成功、改身份/删正则失败的反例已进selftest。

## 性能实测与限制

开发实例固定 `E:\st-reader\.dev\data` / localhost:8100；本机现有 Chrome 152，1440×1000，正常GPU、未做CPU节流；最终轮恢复合成Ny JetBrainsMono字体。每次新建临时浏览器，先等页面/字体就绪、打开小聊天作为基线，再测大聊天。计时含只读API、JSON解析、30楼排版和首帧绘制，不包括启动整个ST；操作系统文件缓存未清空。只计浏览器JS堆，不冒充全进程内存。

样本：`STCR-95-T30-50MiB-4000楼`，**55987114字节**；SHA-256：`4a0401a1be1b1fc9fc700917a8319f8bdd29ae4eb0a713bc5c4a6c9fcd509c72`。每楼约4600字，无真实人物/记录。文件与校验清单只在`.dev`，未入库。

| 最终轮（无CPU采样） | 实测 | 判定 |
|---|---|---|
| 打开阅读器至大文件正文可见，3轮 | **2216 / 1529 / 1438 ms** | 本轮均<3s |
| 分页翻屏，20次 | 69–135ms，**P95 121ms** | 尚未达到本卡可复测的P95<100ms目标；不能声称完全流畅 |
| 前进加载30楼一批，8次 | 171 / 209 / 220 / 332 / 346 / 315 / 326 / 312ms | 最慢346ms，超本卡预取<300ms判据 |
| 活跃正文DOM | 最多120楼 | 通过；没有整篇4000楼渲染 |
| 主动GC后JS堆 | 小聊天27.78MiB；大聊天64.10MiB；翻页后64.46MiB | 增量约36.68MiB |
| 3次切回小聊天 | 28.52 / 28.58 / 28.60MiB；关闭28.58MiB | 回收最少**97.8%增量**，无整份大聊天残留 |
| 宿主聊天/候选/元信息/选择快照 | 前后一致 | 通过 |
| 禁用API / 外网请求 | 拦截审计数组 `[]` | 无尝试 |

“流畅”的数值判据是本卡为复测设定的工程目标，不替代人类肉眼验收。最终脚本报告 **passed:false**，不是全绿。

调试中所有轮次摘要也保留，不能只看最快一次：

| 轮次/工具差异 | 3次打开ms | 翻屏P95/最慢ms | 批次最慢ms |
|---|---|---|---|
| 初始禁GPU、字体尚未恢复、双rAF | 4038 / 3009 / 1471 | 111 / 122 | 338 |
| 正常GPU，等待字体/页面完成，双rAF | 1568 / 1461 / 1619 | 93 / 125 | 272 |
| 同上，重复测量 | 2524 / 1736 / 1704 | 117 / 139 | 271 |
| 改为rAF后下一任务，未恢复Ny | 3834 / 5717 / 4350 | 174 / 197 | 716 |
| 带CPU采样（有开销，只用于定位） | 3646 / 1858 / 1910 | 99 / 134 | 415 |
| 最终，Ny恢复、rAF后下一任务 | 2216 / 1529 / 1438 | 121 / 135 | 346 |

双rAF多计一个刷新周期，正式脚本已改为rAF之后的任务；同时记录首帧而不是只测core读取。多轮波动仍然存在，所以**不能承诺稳定<3s**。CPU采样主要热点是布局/可见性读取：`getBoundingClientRect`约694ms、`reader.ensureWindow`约679ms、`reader.isShown`约522ms；core `safeHtml`约31ms、`convertMarkdown`约24ms（整轮累积采样，不是一次调用）。未发现足以解释主要耗时的core处理瓶颈，按你的边界没有改UI或偷偷用CSS改变它的布局。已登记 **I020**，由规划者安排Opus处理再复测。

报告：`.dev/fixtures/t30-performance-result.json`；最终轮另存 `t30-performance-2026-09-29T09-58-12-801Z.json`。脚本后续每次同时保存带时间戳历史。调试早轮的原始文件被下一轮替换，上表保留当时控制台数据与工具差异。

## 改动文件

- core：`cardFonts.js`、`cardTransforms.js`、`cardContent.js`及其Node/浏览器回归；`performanceBrowser.test.js`；`extension/index.js`仅增加开发自测接线。
- dev：独立性能fixture生成器和双击入口、`test-performance.mjs/.cmd`、`audit-readonly.mjs`、PNG语义校验与fixture自测、README。
- install：`link-to-my-st.cmd`、`unlink-from-my-st.cmd`。
- docs：03合同、04任务状态、06问题、02唯一一行、Windows手册§3、`M3_验收清单.md`和本信。

## 人类验收步骤

1. 资源管理器地址栏粘贴 **E:\st-reader\dev**，回车。双击 **test-core.cmd**，应看到“**全部通过（73项）**”。这一步不用开ST。未生成T30大文件时少一项；先做下一步再重跑可看到73项。
2. 如果开发黑窗口开着，先Ctrl+C停掉。双击 **generate-performance.cmd**，应显示53.39MiB/4000楼。双击 **start-dev-st.cmd**，出现 `listening … 8100` 后，再双击 **test-performance.cmd**。它自己用独立浏览器测试，不改你现有浏览器。看到耗时、内存数字；当前已知翻页目标可能红，属于I020，请把数字交回，不要当成你操作错了。
3. 浏览器打开 **http://localhost:8100**。积木图标 → Ny字体管理器，按手册把 `.dev\fixtures\fonts\JetBrainsMono.ttf` 设为正文；选雾岚普通聊天，关阅读器。F12 → Console/控制台，粘贴 `await window.stcrSelfTest()` 回车，应 **104项全绿**。只测性能用 `await window.stcrSelfTest({performance:true})`；普通浏览器缺少主动GC时仍需第2步验证内存。
4. 点书本 → 星灯第12楼 🖼 → 管理替换规则。添加 `虚构 → 假想` 后，完整姓名仍应为char/user，不能出现“测试旅人（假想）”。再加完整 `星灯（虚构） → 阿星`，应能覆盖。点图案选择内置星星/爱心等，导出PNG到E盘，图标应完整。
5. 按 **[M3_验收清单](../M3_验收清单.md)** 逐行做F1–F9、NF1–NF5。它开头有安装步骤、前后记录和刷新核对真实聊天的方法。**安装与卸载脚本只能你双击；本次AI均未运行。** F盘先留出≥5GB。
6. 正式ST中，开阅读器前记录角色、聊天名、末楼原文与候选；退出并刷新后逐项核对。需要全文精确比对时按清单由你自行导出前后JSONL做`fc /b`；不要把真实记录交给AI。
7. 把勾选结果/红字写进07或发在聊天里。开发用完Ctrl+C停止。NF2可单独反馈“翻页实际感受+脚本数字”。

## 已执行验证

- Node selftest **73/73**；UI原有自测 **27/27**；完整浏览器core **104/104**（含Ny实际PNG、六图标像素、I019正文/名字/宏合并、宿主快照、零fetch、失败清理）。
- 最后增加的“完整长名包含另一自动短名仍可覆盖”和“跳过诊断不挂到无关前缀”的纯函数分支，再跑Node 73/73；签名与DOM路径未变。
- 所有56个JS/ESM文件 `node --check` 通过，`git diff --check` 通过；安装脚本内嵌JS只用`vm.Script`编译验证，**没有运行脚本或访问目标目录**。
- I013：宿主正常补字段/切换默认chat不再导致PNG大小误报；身份/作用域正则损坏仍拒绝。浏览器回归后合成聊天SHA仍全部一致。
- 性能结果为失败（翻屏/跨批次阈值），具体上表；不与功能自测混写成全部通过。

## 只读自查

可复跑 `node dev/audit-readonly.mjs`。脚本用git文件清单扫描**全仓库**（含文档/测试/开发工具与未跟踪源码），再分类列出extension命中；不是先排除测试再声称全仓库为空。报告写入前一轮全仓库路径18行、方法2行、赋值0行、网络120行；本信新增说明会改变文档计数，最终稳定结论看extension分类。

| grep/审阅范围 | 结果 |
|---|---|
| `/api/chats/(save|rename|delete|import|group/(save|delete|import))` | extension恰好7行，全部是readonlyGuard.js第3–9行拦截常量；无调用。其他仓库命中是规则文档/交接 |
| `\b(saveChat|deleteMessage|deleteLastMessage|renameChat|clearChat|addOneMessage|updateChatMetadata|saveMetadata)\s*\(` | extension **0行**；全仓库2行是旧交接和交接模板里的grep示例 |
| `swipe_id/chatMetadata/chat_metadata`赋值，`getContext().chat`赋值/数组变更 | extension **0行**；人工复核上下文使用也只有读取。测试快照比较始终一致 |
| `fetch/XMLHttpRequest/sendBeacon/WebSocket/http(s):///@import` | extension33行：生产自有fetch只有chatSource同源白名单；fixtureSelfTest是本机开发只读测试；其余为测试拒绝样例/过滤器/命名空间/vendor通用能力 |
| 实际API白名单 | characters/all、get、chats；groups/all；chats/recent、get、group/get、search；均只读 |
| UI / style.css网络检索 | 无直接请求、外部URL或@import。自测里的检查表达式不算调用 |
| vendor网络能力 | modern-screenshot有通用fetch与iframe处理分支；cardExport传入禁网fetchFn、禁脚本/禁外网srcdoc，实际导出零fetch。未增vendor或依赖 |
| 浏览器请求审计 | 本次独立浏览器未出现D02/外网尝试。报告的初始化请求含ST/其他插件自己的settings/save、quick-replies/save，不是阅读器代码；数据根始终.dev |
| `.dev/.tmp`入库 | `git ls-files .dev .tmp` **空**；生成文件与报告均忽略 |
| 扩展体积 | **628686字节（约0.60MiB）**，含测试与vendor，小于3MiB |
| Opus区域 | `git diff -- extension/src/ui` **空**；02 diff只有1行增/1行删 |

本任务**没有读、列、复制、写过 `F:\Claude\xinllm\SillyTavern\data\`**，安装脚本中的路径只是源码文字。没有安装依赖、建立node_modules、下载文件或向C/F写入任务产物；浏览器临时配置/缓存全部固定E盘`.tmp`，结束清理本次目录，未删除前序任务留下的目录。开发实例使用原T10隔离启动器。

## 已知问题 / 给下一个人的话

- **规划者/Opus：I020性能待解决**，请重点看UI反复读布局/可见性的位置。修改后原样重跑同一fixture，不缩小样本或隐藏失败轮次。T31需要在T30提交后再复查。
- **Opus：I019合同已增补**，请读取03 §5.9/5.10，侧栏显示 `skippedOverlap` 的原因，移除“再点保存就会拆开姓名”的旧语义。当前core已经保护安全，UI提示尚未接入，本卡按要求未改src/ui。
- I018②仍保留边界：含var()的简写可能丢失；现有模板已用单项属性绕开。没有修改或删除Opus的说明注释。
- 安装/卸载仅静态检查，实际联接与真实ST由人类验收；AI不代跑。main快进不等同于NF2或T32已通过。
