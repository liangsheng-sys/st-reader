# T41 交接：像素遮盖、文字背景、代码脱敏与聊天收藏 core

## 第三步验收返修（I027）

人类在 `2227b41` 版本第 3 步报告 3 条内联样式 CSP 错误，以及最终“临时 DOM 泄漏”。本信已更新为返修后的验收数字，T41 仍待人类验收。

- 旧版复现：单次测试确有 3 条样式 CSP 报错；另保留一个真实 `createCardSnapshot` 导出文档或让两轮自测重叠，均出现同名清理失败。现有日志不能确定人类当时是哪种页面状态；此前干净页面全绿不足以覆盖这些情况。
- 解析 CSP 增加 `style-src 'unsafe-inline'`，让 DOMParser 保留内联样式，不开放 CSS 外链、图片、字体或脚本。内联样式属性仍保持原值。
- `selfTestRunner.js` 让网址自动触发和手动自测按调用次序运行，各自保留选项与结果；一轮失败不妨碍重跑。Node 和浏览器共用反例验证。
- 清理检查保存开测前的节点身份，只审计本轮新增残留；不移除既有节点。新反例刻意留下节点，确认仍能报错，随后清理；错误会给出数量和节点标记，不输出聊天文字。
- 隔离浏览器复测：专项 **35/35**；已有真实导出文档时 **35/35** 且原文档仍在；两次重叠调用分别 **35/35**；完整 **132/132**。内联样式 CSP 报错 **0**，最终临时节点 **0**，D02/外链请求 **0**。Node **103/103**、UI **27/27**。
- 本轮开发服务已停止；`.tmp/t41-recheck.mjs`、本次 `t41-recheck-*` 浏览器配置及 `stcr-runtime-gWdkgZ` 已清理，旧任务临时目录不动。没有运行安装脚本或触碰真实数据。

**人类只需重验第 3 步**：先启动开发实例，打开不带参数的 `http://localhost:8100/` → Ctrl+F5 → F12 控制台 → Ctrl+L 清除旧日志 → 执行下文同一命令，应显示 **35 项全部通过**，不再出现上述两类错误。不用删存储、重建样本或重做联接。

## 做了什么

- 分支 `task/T41-core-fixes`，从已验收的 T40 main 开始。本轮只做 T41，T44a/T46 未开工。记录了人类对 T40 的“已验收，请继续”，任务板 T40 改为通过。
- 非统一遮盖在 DOM 适配层用 `Range.getBoundingClientRect().width` 测量；先读取全部命中，再逆序改副本，支持英文、中文、emoji、跨内联节点。已连接且有布局时写 px；纯函数和无布局输入保留码点数回退。统一长度仍为 3em。
- `exportCard` 先在禁网副本里收集并加载字体，再测原词和遮盖，避免按临时后备字体计算宽度；真实 PNG 像素已验证。
- `ReplaceRule.to.background` 为文字目标的可选六位实色 `#RRGGBB`。存储、备份、执行均校验；预览正文、名字行、思维链及 PNG 保留背景；segments/mappings/skippedRules 也保留该字段。替换结果不被后续屏蔽词二次处理。
- 新增 `maskCodeText(text, opts)` 同步返回字符串，`maskHtmlString(html, opts)` 异步返回字符串，从 `codeTransforms.js` 或 `cardExport.js` 导入。HTML 用禁网环境的 DOMParser，只改 Text.data；不改标签、属性、注释和 script/style 内容，也不把用户 HTML 放到宿主活动 DOM。
- 收藏增加 kind=chat/floor/swipe；聊天收藏的身份键只用 chatKey。旧无 kind 记录和备份自动在读取副本/导入时推断类型，原楼层/候选 ID 不变；只读迁移不写库，三类收藏互不覆盖、可筛选、可备份。
- §5 合同及 I025 已登记。**I026 是明确的 UI 接入依赖**：现有工作台遮盖调用发生在节点挂载之前，因此仍走回退；Opus 须在 T42 调整排版/测量顺序。本卡未改 src/ui，不把 core 测试冒充工作台已接好。

## 改动文件

- `src/core/cardTransforms.js`：共享背景色校验、映射保留背景。
- `src/core/cardContent.js`：替换背景、Range 测宽、先测量后修改。
- `src/core/cardExport.js`、`cardSnapshot.js`：字体就绪顺序、新函数重导出。
- `src/core/store.js`：三类收藏与旧数据兼容、规则背景校验。
- 新增 `src/core/codeTransforms.js`、`coreFixes.test.js`、`coreFixesBrowser.test.js`。
- 返修新增 `src/core/selfTestRunner.js`，为开发自测提供串行调度；更新 I027 与本信。
- `index.js`、`dev/selftest.mjs`：共用自测入口，浏览器可只跑 T41。
- `docs/03_TECH_SPEC.md` §4.4/5.5/5.9/5.10/5.12、`06_ISSUES.md`、`04_TASKS.md`、`07_FEEDBACK.md`、`SETUP_WINDOWS.md`、`dev/README.md`。

## 自动验证

| 检查 | 结果 |
|---|---|
| `node dev/selftest.mjs` | **103/103**，含新增 12 项 T41 纯逻辑/存储测试；聊天 fixture SHA-256 仍通过 |
| `node src/ui/ui.test.js` | **27/27**；未修改 UI |
| `await stcrSelfTest({core:false,coreFixes:true})` | **35/35**（13 保护 + 12 纯逻辑 + 10 浏览器） |
| `await stcrSelfTest()` | **132/132**；保留 Ny 字体、PNG 像素、存储、正则与只读旧回归 |
| 浏览器请求审计 | D02/外链拦截列表 **0 条**；HTML 测试保留外链 img/iframe/link/@import，解析时无外链请求 |
| 静态审计、源码许可头 | 通过；自有 JS/MJS/CSS 首行 **64/64** |

浏览器测试运行在本机已有 Chrome、1440×1000，配置/缓存只在 `.tmp/t41-browser-*`。第一次受限环境的 Chrome 调试连接在 Page.enable 超时，未进入断言；获运行权限后同一测试流程的专项与全量均通过。没有降低测试标准。完整回归使用 `.dev` 的虚构角色与已有 Ny 合成测试字体；PNG 在内存中解码逐像素检查，无图片下载。

开发服务已停止；本次浏览器配置、`.tmp/t41-browser-check.mjs` 与 `.tmp/stcr-runtime-DCIvs9` 已清理，旧任务临时目录不动。没有下载新依赖或文件，没有运行真实安装/卸载入口。

## 人类验收步骤（不需要读代码）

1. 打开资源管理器，顶部地址栏粘贴 **E:\st-reader\dev**，按回车。
2. 双击 **test-core.cmd**。最后应先看到 **全部通过（103 项）**，再看到 **全部通过（27 项）**，最后显示“检查完成，请继续浏览器验收”。按任意键关闭。
3. 双击 **start-dev-st.cmd**，等黑窗口显示 **listening**。浏览器打开 **http://localhost:8100**，按 **Ctrl+F5** 强制刷新。
4. 按 **F12**（笔记本可能是 Fn+F12），点 **Console / 控制台**。粘贴下面这一行，回车：

   ```js
   await window.stcrSelfTest({core:false,coreFixes:true})
   ```

5. 等待约十几秒。应显示 **全部通过（35 项）**，表格 passed 列全部为 true。可看到“PNG 中非统一遮盖实际像素宽度”“替换文字背景”“HTML 只改文本”“聊天收藏与背景色使用真实 IndexedDB”等通过项。无需先选角色，不需要重新导入字体。
6. 若不想粘贴命令，先打开 F12，再在地址栏输入 **http://localhost:8100/?stcrSelfTest=1&core=0&coreFixes=1**；控制台应显示相同的 35 项结果。
7. 出现 false 或红色“自测失败”时，复制报错发给工程师；不要编辑聊天或重建样本来“消除”错误。测试会自动清理自己的专用数据库和临时节点。
8. 验收结束后，在开发黑窗口按 **Ctrl+C**；如询问终止批处理，输入 **Y** 再回车。把验收结果告诉我；通过后回复“继续”才做 T44a。

本卡没有新颜色按钮/聊天收藏按钮，也不需要再次运行真实 ST 的 unlink/link。**现有工作台的非统一宽度仍待 Opus 按 I026 接入**；本轮以 core 的可执行验证验收，不能把旧界面的表现当成已完成集成。

## 只读自查（grep 结果）

在 `E:\st-reader` 执行：

```powershell
rg --no-ignore -n '/api/chats/(save|rename|delete|import|group/(save|delete|import))\b' index.js src style.css vendor
rg --no-ignore -n '\b(saveChat|deleteMessage|deleteLastMessage|renameChat|clearChat|addOneMessage|updateChatMetadata|saveMetadata)\s*\(' index.js src style.css vendor
rg --no-ignore -n '(swipe_id|chatMetadata|chat_metadata)\s*(=(?!=)|\+=|\?\?=)|getContext\(\)\.chat.*(=(?!=)|\.push\(|\.splice\()' --pcre2 index.js src style.css vendor
node dev/audit-readonly.mjs
git ls-files -- 'docs/*.png' .dev .tmp
```

- 第一项 **7 行**，仅 `src/core/readonlyGuard.js:4–10` 的既有禁用路径名单：save、rename、delete、import、group/save、group/delete、group/import；不是请求调用，不声称“完全为空”。
- 写方法调用 **0 命中**；宿主 chat/metadata/swipe 赋值 **0 命中**。无匹配的 rg 退出码 1 正常。
- 审计通过，扩展含许可与新增自测仍小于 0.7 MiB；网络字面量中的新 `.invalid` 地址只用于禁网反例，浏览器 CDP 证实没有外链请求。
- `.dev/.tmp/docs/*.png` 已跟踪文件 **0**。没有读取两张人类截图。
- 是否读、列、复制、写 `F:\Claude\xinllm\SillyTavern\data`：**否**。是否运行真实安装/卸载入口：**否**。始终使用 **E:\st-reader\.dev\data**，不写 C/F 盘，不装依赖，不创建 node_modules，不推送 GitHub。

## 已知问题 / 没做的

- I026：旧工作台仍先遮盖后挂载，需 T42 调整测量时机；本卡只交付 core，不改 Opus UI。
- 无布局的节点无法知道最终字体/字号，仍按码点数回退。Range 跨行时取外接矩形宽度；UI 必须在未缩放的 1:1 上下文测量，再执行预览 fit。
- HTML 字符串接口按独立文本节点匹配，不跨标签拼接词；DOMParser 会规范化格式，不能保证原 HTML 字节不变。输出保留原属性和脚本，**不是清洗结果**，不能挂到宿主 DOM。
- 字符串出口只返回文字：图标用对应 Unicode，图片用 `[图片]`，屏蔽词用方块，背景色不变成新 span。它服务于代码复制和后续 HTML 管线，与卡片 DOM/PNG 背景适配有明确区别。
- T44a 沙箱、HTML 导出及 T46 发布材料本轮没有开工；I020 性能、I021 UI 子开关仍按原任务安排。

## 给下一个人的话

- 先读 **03 §5.12、I025、I026**；现有 core 函数签名保持兼容。T41 留在 `task/T41-core-fixes`，main 仍是已验收 T40，本卡没有代推远程。Opus 接入前需取得本卡提交，不能从仅含 T40 的 main 假定新接口已存在。
- **T42**：规则保存/编辑要保留 `to.background`；空背景请删字段。工作台逐词 wrapMaskSpans 前，须在最终模板样式的未缩放上下文挂载副本并等待字体，每轮新的副本也应能布局；测完再 fit，关闭/过期构建时清理临时 DOM。不要在 display:none 里测，不要对宿主聊天插测量节点。最后实际验证预览与导出都与原词等宽。
- **T43**：聊天抽屉查询 `store.bookmarks.list({kind:'chat'})`；楼/候选面板筛选 floor/swipe，不把无楼号 chat 记录当成第 0 楼。put 聊天收藏时不传 mesIndex/swipeIndex；旧 ID 和备份保持兼容。
- **T44a/T44b**：`maskHtmlString` 是 **Promise**，必须 await；文本节点外的信息按合同保留，显示时仍需沙箱，静态截图仍要去 script/事件。纯文本用 maskCodeText，HTML 不能直接用全串替换。assets 在字符串出口不读库、不转图片。
- **T45**：脱敏阅读显示仍须保持原文锚点合同；本轮没有改变 anchor 或 renderMessage 的行为。
