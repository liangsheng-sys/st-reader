# T14 交接：离线 PNG、脱敏与 Ny 字体嵌入已交付

分支：`task/T14-card-export`。实现提交 `b63adf7`，SVG补充验证 `8d98822`。任务状态：通过。内容已同步到 `E:\st-reader` 日常开发目录，双击原启动器即可验收；保留 Opus 的 T22 界面改动和人类的 `07_FEEDBACK.md`。本卡完成后停止，没有开始T23或T30。

人类验收记录（2026-09-29）：用户确认“已验收，可以提交了”。本次仅更新任务状态和交接记录；沿用下文 Node 68/68、浏览器 99/99 的验证结果，没有修改实现代码。

## 做了什么

- 固定 **modern-screenshot 4.7.0**，单文件ESM，完整MIT许可位于文件顶部；源码哈希核验一致，登记LICENSES。没有构建、npm install、node_modules、CDN或worker。
- `exportCard(rootEl, {maskWords,replaceNames,maskStyle,...})` 返回真实 **PNG Blob**。支持单楼/多楼/已处理选段，隔离副本排版，不修改输入DOM；异常也清理。
- 原文层名字/规则变换：我的规则优先，随后单聊char/user或按群成员定义顺序的char1..N；同级长词优先，不串换。支持作用范围、大小写、Unicode整词、文字、六种FA图标和本地图片。
- 替换片段在显示正则前取出，穿过一次正则/格式化后只在文本节点恢复。替换文字不会被当作HTML或宏执行，也不会被屏蔽词再次吞掉；名字宏变体和正则replacement中的名字宏均处理。损坏占位符时拒绝导出。
- 正则后的文本节点遮盖：跨em/strong等内联节点匹配，保留代码/主题；原词被删除，再生成实心条、圆角块或3个图案。默认统一3em宽，支持原长度。遮盖元素、属性中不藏原词。
- **Ny字体**：只读 `nytw-fonts/fonts` 中实际使用的本地Blob，完整嵌入PNG的中间文档；实际字形验证通过，未复制Ny源码或修改其数据库。图标用已加载FA字形离线画成小PNG。
- 图片类型沿用T13素材校验；SVG再次清洗，外部资源/脚本被移除。截图不补取任何网络资源；只能使用内嵌/已加载且可读取的图片。
- 03 §4.4、§5.9–5.11写实：签名、JSDoc、优先级、选段流程、错误、字体边界与接入例。T12/T13已有接口不变，新增合同已登记I016。

## 改动文件

- 新增 `extension/src/core/cardExport.js`、`cardContent.js`、`cardTransforms.js`、`cardSnapshot.js`、`cardFonts.js`、`cardExport.test.js`、`cardExportBrowser.test.js`。
- 新增 `extension/vendor/modern-screenshot.mjs`。
- 修改 `extension/index.js`（开发检查/PNG演示入口）、`dev/selftest.mjs`。
- 更新03、04、06、LICENSES、SETUP_WINDOWS及本信。**没有修改src/ui、style.css、用户反馈**。

## 人类验收步骤（不需要会代码）

1. 打开资源管理器，地址栏粘贴 **E:\st-reader\dev**，回车。双击 **test-core.cmd**，最后应显示 **全部通过（68 项）**。按任意键关闭。
2. 双击 **start-dev-st.cmd**；若已有开发黑窗口运行就用原窗口。浏览器打开 **http://localhost:8100**。
3. 字体准备：点顶栏**积木图标 → Ny字体管理器 → 导入字体**。若当前浏览器没有可用字体，点**浏览…**，选 **E:\st-reader\.dev\fixtures\fonts\JetBrainsMono.ttf**，点**导入字体**，再点新字体的**设为正文**。名字带 `(2)` 或其他编号也可以。等几秒，刷新。
4. 在地址栏打开 **http://localhost:8100/?stcrExportDemo=1**。应弹出 **T14实际PNG**：名字行是char，正文宏里有char/user，左边薄荷色细线，“今晚”和“星图”被黑条遮盖，`iii WWW 0123456789`是等宽字形。若提示阅读器开着，按Esc关闭后重试。
5. 点 **保存PNG（请选E盘）**，在保存窗口选 **E:\st-reader\.tmp**，文件名填 **T14-card.png**。若浏览器不支持保存窗口，按提示右键图片 → **图片另存为**，仍保存到这个E盘位置。不要用默认的C盘下载目录。
6. 用资源管理器打开刚保存的PNG，放大看遮盖仍实心、颜色/字形正确。回浏览器点 **关闭验收图**，宿主聊天和候选应没变化。演示是对真实合成楼调用exportCard后显示Blob，图片不是静态预制文件。
7. 完整自动检查：回 **http://localhost:8100**，点顶栏**名片图标（角色管理）**，从角色列表打开 **雾岚（虚构）**的普通三楼聊天；不要点欢迎页大文件最近聊天。关闭阅读器，按 **F12 → Console/控制台**，粘贴 `await window.stcrSelfTest()`，回车，应 **99项全绿**。
8. 不想粘贴代码，可以先打开 **http://localhost:8100/?stcrSelfTest=1&coreWhenChat=1**，再照第7步点雾岚，自动跑同一套检查。告诉我“通过”或哪一步不对；本卡后不自动领下一张。

更详细的说明和单独T12/T13/T14检查参数见 `SETUP_WINDOWS.md` §2.2–2.4。正式卡片工作台/模板按钮是T23，T14通过控制台和这个演示验收。

## 已执行的验证

- 日常目录 `node dev/selftest.mjs`：**68/68通过**；含18项新增纯逻辑测试。
- 正式扩展入口 `window.stcrSelfTest()`：**99/99通过**。最终轮在2026-09-29 12:36（北京时间）完成，包含SVG清洗/PNG解码，控制台没有自测失败。
- Ny实际PNG字形与同一已加载FontFace的Canvas参考：允许≤1px的行盒基线取整后，像素差 **0**；相同方法下serif回退差 **513267**。嵌入的本地文件 **187208字节**，兼容Ny重复导入别名。
- PNG解码后检查薄荷色边线与不透明黑条像素；图标/PNG/SVG素材、多楼群聊、名字开关、跨内联节点遮盖、替换优先级全部通过。
- 无绑定原文、无效倍率/尺寸/图标/空词/悬空素材/非本地图片被拒绝；成功与失败均无隔离iframe遗留；导出期间fetch调用数为0。
- 输入楼层DOM、原候选及宿主聊天/元信息/角色/群组/扩展设置/主题/原生聊天style快照均保持不变。
- 用浏览器实际查看生成PNG，确认名字、主题边线、黑条和等宽字形；保存到E盘的操作留作上述人类验收，没有让浏览器自动写默认下载目录。
- 当前日常目录的UI检查 `node extension/src/ui/ui.test.js`：**21/21通过**。这是Opus进行中代码的回归记录，不代替T22的人类验收。
- 已核对8100监听进程参数：含 `--import E:/st-reader/dev/isolate-dev-st.mjs`、`--dataRoot E:\st-reader\.dev\data`、开发config、port8100、listen false。沿用已有开发进程，未替Opus停止服务。
- vendored上游源码SHA-256与LICENSES登记一致；`git diff --check`通过。

## 只读自查（实际 grep / rg 结果）

```powershell
rg -n '/api/chats/(save|rename|delete|import|group/(save|delete|import))' extension
```

只命中 `readonlyGuard.js:3–9` 七个拦截清单字符串，**不是调用**。加 `-g '!readonlyGuard.js'` 后为空。

```powershell
rg -n '\b(saveChat|deleteMessage|deleteLastMessage|renameChat|clearChat|addOneMessage|updateChatMetadata|saveMetadata)\s*\(' extension
rg -n '(chatMetadata|swipe_id)\s*(=|\+=|-=|\+\+|--)|getContext\(\)\.chat\s*=' extension
rg -n 'fetch\(|XMLHttpRequest|sendBeacon|WebSocket' extension/src/core -g 'card*.js'
```

三组均**空**。上游vendored库自身包含通用fetch实现，不能说“整个extension没有fetch”；生产调用固定提供内嵌字体CSS、禁网资源副本和拒绝取图的fetchFn，没有启用该默认网络路径。浏览器另实测0次fetch，并以iframe CSP限制资源，只读审计不只靠grep。

- 本任务是否读、列、复制、写过 `F:\Claude\xinllm\SillyTavern\data`：**否**。
- 只使用开发合成数据和已有本地测试字体，没有复制真实聊天。没有写C/F盘、安装依赖或下载大文件；本次只下载54,773字节库文件与1,077字节许可到`.tmp/`。
- 临时工作副本、辅助测试扩展联接和下载中转文件在交付前清理；其他任务的`.tmp/`目录保留。

## 已知边界 / 没做的

- 普通URL字体没有可读字节时，使用系统回退并发console.warn/onWarning；Ny本地字体缺失或坏文件则拒绝导出。精确导出其他字体先在Ny导入并应用。测试字体的中文回退不代表中文字体已嵌入。
- 不导出跨域不可读CSS、CSS资源URL背景、交互媒体；图片像素不做OCR脱敏。宽高/倍率/像素/字体总量上限见03 §4.4。
- 受保护替换片段不参加显示正则。若脚本破坏占位符，给中文错误；不会导出可能泄漏原词的替代图。
- 部分选段先在已脱敏的createCardMessage副本上裁剪，再以replaceNames:false导出；不要给裁剪后的半楼再绑定原始整楼。工作台的选区映射与确认由T23处理。
- 没有开始T23模板/规则管理UI，也没有开始T30安装到真实实例。

## 给下一个人的话

- **Opus/T23**：按03 §5.9–5.11接入，先从store取rules/assets/maskWords，同一份options交给预览与导出。预览返回mappings只用于私有映射列表，不进分享图；名字开关、规则变化时重建原文副本。onWarning应在工作台展示。
- core返回Blob，下载按钮和保存位置由UI负责；句段提取在已经脱敏的副本上做。关闭时释放handle、DOM、Blob URL。所有控件用自有类；不应导出的控件加data-stcr-export-ignore。
- I010的①②已由T13、③④由本卡落实；现在只剩**规划者在T23开工前确认是否拆卡**。本次没有替规划者修改任务范围。
- T14首次合同已登记I016；后续改字段、签名或错误行为继续登记06并通知Opus。T12/T13已有接口未改。
- 日常目录继续留在Opus的T22分支，T14提交已快进同步；没有暂存/提交他的进行中UI或人类反馈。
