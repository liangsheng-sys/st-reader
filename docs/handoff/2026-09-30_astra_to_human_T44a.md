# T44a 交接：HTML 沙箱、离线静态导出与裁剪

## 做了什么

- 分支 `task/T44a-html-renderer`，从已验收的 T41 `d9e6a76` 开始。记录人类“已验收成功，可以继续了”，T41/I027 改为通过。本轮只做 T44a，T46 未开始；main 仍是 T40，没有推送 GitHub。
- `htmlRenderer.js` 提供 `detectHtmlBlocks / buildSrcdoc / createSandbox`，识别围栏内 body 与明显的裸 HTML；保留 UTF-16 原文区间，多围栏/CRLF/反例进共用 selftest。
- 交互 iframe 为 `sandbox="allow-scripts"`，不赋予同源权限。可信外壳约束内容子 iframe 的导航，避免只禁资源却漏掉 location 跳转；随机 token + 消息 source 核对，ResizeObserver 等驱动自动高度。视口外也能完成 ready；update 重建并轮换 token，默认重新断网；destroy 释放节点、监听、计时器。
- 默认 CSP 为 default-src none + 内联脚本/样式 + data/blob 图片 + data 字体。声明式外链先在离线文档中去掉；不清空 performance 或伪造指标。allowNetwork:true 只开放 HTTPS 资源，权限不存储；脚本/导航的禁用反例仍受 CSP 和沙箱约束。
- `renderStatic` 创建去脚本、事件、导航及外链的同源静态副本（allow-same-origin，无脚本）；`exportRenderedHtml` 先 maskHtmlString，再静态渲染和截图，返回 PNG Blob。整数 crop 按未缩放文档像素裁剪；复用 T14 的禁网 fetchFn，未自动下载。
- 追加两楼完全虚构 fixture：纸舟第 7 楼“手机聊天记录”（含 .invalid CSS/字体），第 8 楼“网页游戏”（围栏，两个物品分支）。只升级该份合成聊天的末尾与对应清单哈希，前六楼、其他开发聊天、角色、设置不重建。
- §5.13 / I028 已登记；开发控制台新增 `stcrHtmlDemo()` 与 HTML 专项检查。没有修改 src/ui、style.css、vendor 或安装脚本。

## 改动文件

- 新增 `src/core/htmlRenderer.js`、`htmlStatic.js`、`htmlResources.js`、`offlineCapture.js`。
- `codeTransforms.js` 提取共用离线解析适配器；`cardExport.js` 改用同一禁网资源闸门，旧签名和行为保持。
- 新增 `htmlRenderer.test.js`、`htmlRendererBrowser.test.js`、`htmlRendererDemo.js`；`index.js`、`dev/selftest.mjs` 接入。
- 新增 `dev/fixtures/html.mjs`、`append-html.mjs`；`data.mjs` 和 fixture 自检包含新两楼。
- 更新技术合同、任务板、问题表、人类验收记录、SETUP_WINDOWS、开发与 fixture README，以及本信。

## 自动验证与实际画面

| 检查 | 结果 |
|---|---|
| `node dev/selftest.mjs` | **112/112**，含新增 8 项识别/CSP 与 1 项 fixture；既有聊天逐字节 SHA-256 仍校验 |
| `node src/ui/ui.test.js` | **27/27** |
| `await stcrSelfTest({core:false,htmlRenderer:true})` | **31/31**：13 保护 + 8 纯逻辑 + 10 浏览器 |
| `await stcrSelfTest()` | **150/150**，包含 T14 Ny 字体/PNG、T41 与原存储/只读回归 |
| 脱敏和裁剪像素 | 脱敏 PNG 逐像素等于直接写入预期替换文字的参考图；裁剪 90×30 的每个像素等于指定背景色 |
| 两类样本导出 | 手机/游戏均有实际 PNG；即使导出参数误传 allowNetwork:true，静态出口仍断网 |
| 开发演示按钮 | 实际生成完整游戏 **768×556**、裁剪 **300×180**；手机和游戏截图已肉眼检查 |
| 默认断网 | 带外链字体/CSS 的内容文档 performance 无外链；全部自测 D02/外链拦截列表为 0 |
| HTTPS 开关 | 本机临时 HTTPS 样式服务收到 **1** 次允许的请求，颜色生效；重建省略 allowNetwork 后颜色恢复、资源列表为空、服务无新增请求 |
| 清理 | 成功/失败/并行静态副本后新增临时节点 **0**；宿主聊天/候选/设置快照不变 |

浏览器为本机已有 Chrome，1440×1000，数据只用 `.dev` 合成实例。完整回归按原流程在临时浏览器准备已有 Ny 合成字体，没有下载或安装依赖。

开发服务 8100 与本机 HTTPS 替身 8443 均已停止。本任务浏览器全部关闭；`.tmp/t44a-*`（测试脚本、合成截图、浏览器配置、临时证书/密钥/配置）及 `stcr-runtime-G7pCN0` 已清理，旧任务临时目录未动。停服后重复运行追加器，确认两楼不会重复追加；最终 Node/UI 检查仍为 112/27 全绿。

排查记录：首轮发现视口外跨源 iframe 暂停 rAF，改为微任务首报；又发现 Chrome 会记录被 CSP 拦截的外链字体/CSS，增加资源预处理后满足“无外链条目”，没有放宽断言。远端 .invalid 的 CDP 响应替身未成功接管请求，因此不用它证明开关有效；最终改用仅监听本机 8443 的真实 HTTPS 替身，验证样式和服务端请求计数。证书用已有 Git 的 OpenSSL 在 `.tmp` 生成，只对本次临时浏览器忽略测试证书错误，没有安装系统证书、没有访问外网。测试结束后关闭浏览器与本机服务并清理证书。

## 人类验收步骤（不需要读代码）

1. 资源管理器地址栏输入 **E:\st-reader\dev**，双击 **test-core.cmd**。应看到 **112 项**、**27 项全部通过**，按任意键关闭。
2. 双击 **start-dev-st.cmd**，等 listening；浏览器打开 **http://localhost:8100/**，按 **Ctrl+F5**。
3. 按 **F12 → Console / 控制台**，粘贴下面一行，回车：

   ```js
   await window.stcrSelfTest({core:false,htmlRenderer:true})
   ```

   应显示 **31 项全部通过**，passed 全为 true。故意的反例可能显示 `Framing ... st-reader-fixture.invalid ... blocked` 或 `Blocked script execution`，表示尝试已被阻止；**false、“自测失败”、内联样式被阻止、加载超时均须原样反馈，不能忽略**。
4. 再执行 `await window.stcrHtmlDemo()`。出现“完全虚构 HTML 验收”面板；手机里的聊天区域能滚动。
5. 点“网页游戏”，依次点 390px、768px、1200px，观察排版；窄窗口会横向滚动。点游戏里的“举起纸灯”看到飞鸟结局，点“摇响铜铃”看到纸舟结局；状态行会显示自动高度。
6. 点“生成脱敏 PNG”，等面板下方出现图片。图片中“秘密”变成方块，“灯塔”变成“某地”。静态图使用初始 HTML，所以显示“尚未选择”，不会复制刚刚点出的结局。
7. 勾“只截左上角 300×180”，再生成；应只见左上角，状态行显示**实际尺寸 300×180px**。如果需要保存，点“保存 PNG”，自己选 **E 盘**；不会自动下载。
8. 点“关闭演示”，再在开发黑窗口按 **Ctrl+C** 停服。反馈验收结果；成功后说“继续”才开始 T46。

无需重做联接、重装扩展、清空存储或重建 fixture。正式阅读器里的“渲染/原文”、允许外链按钮、拖动裁剪框属 T44b；本轮用独立演示验收 core。

## 只读自查（grep 结果）

在 `E:\st-reader` 执行：

```powershell
rg --no-ignore -n '/api/chats/(save|rename|delete|import|group/(save|delete|import))\b' index.js src style.css vendor
rg --no-ignore -n '\b(saveChat|deleteMessage|deleteLastMessage|renameChat|clearChat|addOneMessage|updateChatMetadata|saveMetadata)\s*\(' index.js src style.css vendor
rg --no-ignore -n '(swipe_id|chatMetadata|chat_metadata)\s*(=(?!=)|\+=|\?\?=)|getContext\(\)\.chat.*(=(?!=)|\.push\(|\.splice\()' --pcre2 index.js src style.css vendor
node dev/audit-readonly.mjs
git ls-files -- 'docs/*.png' .dev .tmp
```

- 禁用路径 **7 行**，仅 `src/core/readonlyGuard.js:4–10` 的既有防护名单，不是调用。
- 写方法调用 **0**；宿主 chat/metadata/swipe 赋值 **0**。rg 无匹配退出码 1 正常。
- 静态审计通过；运行文件含 LICENSE 仍低于 **0.8 MiB**。新网络字面量是合成反例/策略检查，没有新增固定外链服务；allowNetwork 的作用及披露边界见 D16/§5.13。
- `.dev/.tmp/docs/*.png` 已跟踪文件 **0**；未查看人类两张截图。自有 JS/MJS/CSS 许可首行 **73/73**。
- 是否读、列、复制、写真实 `F:\Claude\xinllm\SillyTavern\data`：**否**。是否运行安装/卸载脚本：**否**。无 C/F 写入、无依赖安装、无大文件下载、无远程推送；只读执行已有 Git OpenSSL，输出全在 E 盘临时目录。

## 已知问题 / 没做的

- T44b 正式 UI 未接入；T46 发布材料未开始。I020、I021、I026 按原分工保留。
- 静态导出是输入 HTML 的初始页面，不能读取不透明源沙箱里脚本运行后的当前画面；纯脚本生成的内容/canvas 不会凭空出现在静态副本中。
- 只脱敏文本节点；属性（例如 input.value）、CSS 生成文字、图片像素不在范围内，不做 OCR。字符串出口沿用 T41 的图标 Unicode / 图片 `[图片]` 回退，不插入背景 span。
- 断网时外链 CSS/字体/图片被去掉，本地回退可能与手动允许联网后的画面不同。跨标签名字、启发式识别、viewport 单位、局部滚动区均须按 §5.13 边界使用，不能声称任意 HTML 均像浏览器整页保存一样还原。

## 给下一个人的话

- Opus 先读 **03 §5.13、I028**。本分支包含已验收 T41；main 仍是 T40，接线前须取得这些提交。不要仅凭 main 假定接口已存在。
- 交互节点**不得加 allow-same-origin**；追加到容器后 await ready；换楼、关闭、过期构建都 destroy。消息只驱动高度，不能作为宿主操作。source/token 已由 core 校验。
- 允许外链只存当前阅读器会话的内存，每次打开重新确认；update 省略 allowNetwork 会重新断网，宽度切换需要按用户本次确认状态显式传值。
- crop 用静态文档的 1:1 坐标；预览缩放后由 UI 换算，不能把屏幕像素直接交给 core。导出按钮 await 期间禁用，失败保留预览；保存位置交人类。
- HTML 复制脱敏必须 await maskHtmlString；不得对全串作名字替换，也不能把输出直接挂入宿主 DOM。T44b 的渲染开关应保留原文入口，识别区间用于非破坏性替换。
- T47 复查必须看可信外壳及内容两层 CSP、默认资源预处理、静态清理与禁网截图闸门；不能只 grep 一个 sandbox 属性。
