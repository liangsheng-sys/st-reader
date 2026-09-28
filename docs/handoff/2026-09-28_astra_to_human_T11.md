# T11 交接：合成数据、主题正则与本地字体兼容样本

分支：`task/T11-fixtures`。仅交付 T11；等待人类验收与“继续”后再领 T12。

## 做了什么
- 原生 Node 生成 3 张带有效 PNG 元数据的虚构角色卡、4 份单聊、1 个三成员群聊。头像、故事和思维链字段全部从零生成。
- 覆盖 3/4/5 个 swipe、逐候选思维链/日期/时长、缺失思维链边界、三种代码、原始 HTML、25,212 字符长楼；大文件 1600 楼，22,387,914 字节（21.35 MiB）。
- 测试主题包含两个指定的 #chat 选择器与 !important；4 条启用的全局显示正则、1 条禁用对照、星灯角色作用域正则与允许名单。宽度按宿主 vw 单位设置为 75，已实际查看页面。
- 在 `.dev/data/default-user/extensions/Ny-font-manager` 安装上游 1.1.9，固定提交及逐文件校验；本地 JetBrains Mono 测试字体 187,208 字节。上游 GPL-3.0 与字体 OFL-1.1 均已登记并保留许可文件。安装总下载 716,602 字节，没有 npm/node_modules。
- Node 自检 21 项通过；浏览器完整自检 21 项通过，核对真实 IndexedDB 字体 Blob、FontFace 状态与正文计算字体。刷新后仍为 JetBrainsMono。也实际打开了纸舟、雾岚和群聊，控制台无错误。
- 浏览器测试结束再次核验全部生成文件的大小与 SHA-256，均与生成清单一致。服务运行时生成器/安装器会拒绝操作；重复安装校验下载 0 字节。

## 改动文件
- `dev/fixtures/`：数据定义、PNG 编码、固定路径校验、流式生成、Node 验证、带锁文件的开发字体安装器与样本索引。
- `dev/generate-fixtures.cmd`、`dev/install-test-font.cmd`、`dev/selftest.mjs`。
- `extension/src/core/fixtureSelfTest.js`、`extension/index.js`：仅开发实例的可选只读验收；未修改 `src/ui/`。
- `docs/03_TECH_SPEC.md`、`04_TASKS.md`、`06_ISSUES.md`、`LICENSES.md`、`SETUP_WINDOWS.md` 和本交接信。
- `.dev/` 下的样本、设置、Ny 插件与字体均不入库。既有 `docs/07_FEEDBACK.md` 修改留给原作者，未纳入本卡提交。

## 人类验收步骤（必填，小白可操作）
1. 打开资源管理器，在地址栏输入 `E:\st-reader\dev` 并回车。当前样本和字体扩展已准备好，双击 **start-dev-st.cmd**。黑窗口出现 listening 后打开 **http://localhost:8100**。
2. 点顶栏最右的 **角色管理（名片图标）**。应看到星灯、纸舟、雾岚三位“（虚构）”角色及 **STCR · 雾岛观测队（虚构）**。
3. 点 **星灯（虚构）**，最后一楼显示“候选 3/5”，正文有“【一次】✓”“星灯作用域命中”“近景命中”，较早楼层仍保留“【近景】”。点“思考了一会”可展开虚构思维链。只查看，不点候选箭头、编辑或发送。
4. 点角色面板上方 **选择/创建角色（列表图标）** 回到列表，再点 **纸舟（虚构）**。上下滚动可看到三种代码框、HTML 引号和长文；正文左边为薄荷色边线，引号为金色。
5. 回到列表点 **STCR · 雾岛观测队（虚构）**，应看到测试旅人和三个成员共 4 楼。点雾岚则是 3 楼短聊天。
6. 大文件在 `E:\st-reader\.dev\data\default-user\chats\STCR_T11_Mist`，右键 `STCR-90-大文件-1600楼.jsonl` → **属性**，大小超过 20 MB。
7. 点顶栏 **扩展（积木图标）** → 展开 **Ny字体管理器** → **导入字体** → 本地字体文件的 **浏览…**。选 `E:\st-reader\.dev\fixtures\fonts\JetBrainsMono.ttf`，点面板内 **导入字体**。“已导入字体”若折叠先展开，再点 JetBrainsMono 的 **设为正文**。等几秒保存后刷新。若本浏览器已有这条字体，直接设为正文即可，不重复导入。
8. 重新打开星灯。`STCR FONT PROBE: iii WWW 0123456789` 应为等宽字。按 **F12 → Console / 控制台**，粘贴 `await window.stcrSelfTest({fixtures:true,font:true,rendered:true})` 并回车，应显示 **全部通过（21 项）**。字体按浏览器和网址隔离，必须一直使用 localhost:8100；换浏览器需要重复第 7 步。
9. 要重建样本：先在黑窗口按 **Ctrl+C** 停服务，再双击 **generate-fixtures.cmd**，应显示大文件 21.35 MiB 与 **全部通过（21 项）**。这会恢复本卡 STCR 样本、正则和主题。`install-test-font.cmd` 可校验/恢复缺失的开发字体文件，完成后再启动 ST。完整说明见 `docs/SETUP_WINDOWS.md` §2.1。

## 只读自查（必填）
使用 `rg` 做 grep 等价扫描，结果如实记录：

```powershell
rg -n '/api/chats/(save|rename|delete|import|group/(save|delete|import))' extension
# 仅 readonlyGuard.js:3–9 的七条拦截常量；没有发送禁用接口的代码。

rg -n '/api/chats/(save|rename|delete|import|group/(save|delete|import))' extension -g '!readonlyGuard.js'
# 空（退出码 1：无匹配）。

rg -n '\b(saveChat|deleteMessage|deleteLastMessage|renameChat|clearChat|addOneMessage|updateChatMetadata|saveMetadata)\s*\(' extension
# 空。

rg -n '(chatMetadata|swipe_id|\.chat\b)' extension
# 空，没有读写宿主 chat/chatMetadata/swipe_id 的扩展代码。

rg -n 'fetch\(|XMLHttpRequest|sendBeacon|WebSocket|https?://' extension
# readonlyGuard.test.js 中的内存替身/URL 检测；fixtureSelfTest.js:8 的只读请求包装。
# 包装仅有 /api/chats/get 和 /api/chats/group/get 三处调用；无出站请求。
```

原模板 grep 结果并非空：D02 禁用路径必须出现在 T10 拦截表中。不能把拦截常量算成写操作，也不能为了声称“空结果”去掉保护。保护自测使用假的 fetch，不发禁用请求。新浏览器测试只读 IndexedDB `fonts` 事务。

本任务是否读、列、复制或写过 `F:\Claude\xinllm\SillyTavern\data`：**否**。开发数据始终为 `E:\st-reader\.dev\data`；仅用 T10 隔离启动器。无 C/F 写入命令、无 npm install、无新 node_modules、无超过 5 MB 的下载。自己的研究临时文件已清理，其他任务的临时目录保留。

## 已知问题 / 没做的
- T12 阅读器数据/正则管线、T13 存储与样式克隆、T14 PNG 导出均尚未开始。T11 的原生显示验收不代表后续模块已经实现。
- ST 原生宏使用当前用户；群聊显示中的 `{{char}}` 可能为空。合成 header 故意使用“测试旅人（虚构）”，与当前用户不同，供 T12 验证自己的宏上下文。
- 字体在本次测试的浏览器中已验证。人类用另一个浏览器时必须本地导入；不能声称跨浏览器字体数据库自动共享。PNG 内嵌字体留给 T14。

## 给下一个人的话
- I008 已修正规格：群聊 JSONL 没有独立 header，API 参数是 chat_id 而不是 group.id。样本故意让两者不同，避免测试误通过。
- I009：Ny 1.1.9 的本地字体从 IndexedDB Blob 经 ArrayBuffer/FontFace 加载，不提供 `@font-face` 或 blob URL；T14 需据此验证导出字形。
- I003 的两种正则策略仍需按卡分别实证。样本已有“重复运行即多一个 ✓”、深度、作用域、宏、候选思维链回退的断言材料。
- §5 合同仍是 T12 待填占位，此卡未改签名。T12 同时处理 Opus 的 I006；不要改 UI 代码。
