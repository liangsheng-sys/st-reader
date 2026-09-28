# T10 交接：独立开发实例、扩展联接与只读保护已可运行

分支：`task/T10-dev-instance`。任务状态：待验收。T11–T14 未开工，等人类说“继续”。

## 做了什么
- 双击 cmd 自动生成 `.dev/config.yaml`、开发目录、默认设置和扩展目录联接；数据根固定为人类已确认的 `E:\st-reader\.dev\data`，端口 8100，只监听本机，保留白名单。
- 配置模板入库，`.dev/` 不入库。重复运行保留已有配置、设置和数据；错误配置、错误联接、目录重定向、端口占用均停止并提示，不覆盖冲突内容。
- 复用现有 ST 1.14.0 程序及其已有依赖，未安装 npm 依赖、未创建 node_modules。临时文件和运行缓存均在 E 盘。
- 发现宿主全局扩展不会随 dataRoot 隔离，已登记并解决 I007：通过启动预载模块只调整开发进程内的目录常量，隔离全局扩展和程序备份，不修改 F 盘源码。模型、分词器下载、扩展自动更新及服务端插件在开发配置中关闭。
- 模块载入时立即包装开发窗口的 fetch。七个 D02 地址同步抛出 `StcrReadonlyError` 并 `console.error`，不调用原 fetch；允许的只读请求原样转发。重复安装幂等。
- 补齐给非程序员的启动、查看扩展、控制台自测、停止与排错说明。保留人类原有 `docs/07_FEEDBACK.md` 修改，不将它加入本任务提交；保留期间已提交的 Opus T20 文档。

## 改动文件
- `.gitattributes`：固定 cmd 的 CRLF，解决 Windows 对中文批处理 LF 换行的误读。
- `dev/start-dev-st.cmd`、`dev/start-dev-st.mjs`、`dev/isolate-dev-st.mjs`：启动入口、环境准备及进程内路径隔离。
- `dev/config.dev.yaml`：可重建开发配置的模板。
- `extension/src/core/readonlyGuard.js`、`readonlyGuard.test.js`：保护与共用自测。
- `extension/index.js`：启用保护、挂载 `window.stcrSelfTest()`、占位日志；支持开发网址参数自动跑自测。
- `dev/selftest.mjs`、`dev/README.md`：Node 验证入口与说明。
- `docs/03_TECH_SPEC.md`、`04_TASKS.md`、`06_ISSUES.md`、`SETUP_WINDOWS.md` 及本交接信。
- 本机产物 `.dev/config.yaml`、`.dev/data/`、`.dev/global-extensions/`、`.dev/program-backups/` 均忽略，不提交。

## 人类验收步骤（必填，小白可操作）
1. 打开资源管理器，在地址栏粘贴 `E:\st-reader\dev`，按回车。双击 **start-dev-st.cmd**。
2. 保持黑窗口打开，等出现 **SillyTavern is listening on IPv4: 127.0.0.1:8100**。
3. 浏览器打开 **http://localhost:8100**。若出现欢迎页，填虚构名字并点“保存”。无需连接 AI。工程师已在此独立实例中用“虚构测试读者”完成过欢迎页，通常不会再次出现。
4. 点顶部 **积木图标（扩展）** → **管理扩展**。在 **Installed Extensions** 下应有 **阅读器 (ST Reader) 0.0.1**，前面的框已勾选。这就是本卡的主要验收项，现在还没有完整阅读器界面。
5. 按 **F12** → **Console / 控制台**，能看到“开发实例只读保护已开启”和“占位入口已加载”。输入 `await window.stcrSelfTest()` 并回车，应看到 **13 项 passed 全为 true** 和“全部通过（13 项）”。也可打开 **http://localhost:8100/?stcrSelfTest=1** 自动运行，再看控制台。
6. 切回黑窗口按 **Ctrl+C** 停止。若问是否终止批处理，输入 **Y**。本次工程验证的后台实例在交付前已停止，直接双击不会与它抢占端口。
7. 告诉工程师“通过”或具体哪一步不符合预期；说“继续”后才开始 T11。

## 已执行验证
- 从不存在的 `.dev/` 初始化成功；联接类型 **Junction**，目标为 `E:\st-reader\extension`。
- 重复初始化与 ST 自动补全配置后的重新初始化均通过；配置字节保持一致，联接不重复创建。
- 临时把开发配置端口改成 8101 后，启动器退出码为 1、明确提示 8100、没有自动覆盖配置；测试后已恢复原配置。
- 服务运行时重复启动，退出码为 1，提示端口占用；原实例继续运行。
- `node dev/selftest.mjs`：13 项全部通过，包括七条禁用路径的字符串、URL、Request、大小写、查询串、尾斜线、编码及方法变体；允许请求参数、Promise 与接收者保持原样；Request 正文未消耗；幂等与开发地址识别通过。
- 最终启动命令实际运行到 **127.0.0.1:8100**；前端编译成功。浏览器已完成欢迎页，扩展列表的第三方项只有已勾选的 **阅读器 (ST Reader)**。
- 最终浏览器 `?stcrSelfTest=1`：控制台显示占位日志、保护开启日志、**全部通过（13 项）**；浏览器错误日志为空。
- `node --check` 检查启动器、隔离模块及扩展入口通过；`git diff --check` 通过。

## 只读自查（必填）

使用 `rg` 执行 grep 等价检查（退出码 1 表示没有命中）：

```powershell
rg -n 'chats/(save|rename|delete|import)|group/(save|delete|import)|\b(saveChat|deleteMessage|deleteLastMessage|renameChat|clearChat|addOneMessage|updateChatMetadata|saveMetadata)\s*\(' extension
```

结果不为空，**仅 7 行，是保护模块必须包含的拦截名单，不是接口调用**：

```text
extension/src/core/readonlyGuard.js:3: '/api/chats/save',
extension/src/core/readonlyGuard.js:4: '/api/chats/rename',
extension/src/core/readonlyGuard.js:5: '/api/chats/delete',
extension/src/core/readonlyGuard.js:6: '/api/chats/import',
extension/src/core/readonlyGuard.js:7: '/api/chats/group/save',
extension/src/core/readonlyGuard.js:8: '/api/chats/group/delete',
extension/src/core/readonlyGuard.js:9: '/api/chats/group/import',
```

```powershell
rg -n 'chats/(save|rename|delete|import)|group/(save|delete|import)|\b(saveChat|deleteMessage|deleteLastMessage|renameChat|clearChat|addOneMessage|updateChatMetadata|saveMetadata)\s*\(' extension -g '!readonlyGuard.js'
rg -n '\b(chatMetadata|swipe_id|saveChat|deleteMessage|deleteLastMessage|renameChat|clearChat|addOneMessage|updateChatMetadata|saveMetadata)\b' extension
```

上述两条结果均为空；保护模块另行人工核对：拦截后先抛错，只有未命中时才通过 `Reflect.apply` 转发。自测调用的是内存对象上的 fetch 替身，没有向禁用地址发送请求。入口仅订阅宿主事件，不修改 `getContext().chat`。扩展没有出站网络请求。

- 本任务是否读、列、写、复制过 `F:\Claude\xinllm\SillyTavern\data`：**否**。只核对程序源码、使用程序自带默认资源与本次 `.dev/` 开发产物。
- 未写 C 盘或 F 盘；未安装任何工具或依赖，未下载大文件。
- `git check-ignore .dev/config.yaml .dev/data .tmp` 三项均匹配；`.tmp/` 的本任务临时文件已清理。

## 已知问题 / 没做的
- 保护只覆盖当前窗口的 fetch；直接宿主函数调用、XHR 等通道仍须靠 D02 代码规则约束。它也会阻止开发实例中宿主通过 fetch 保存聊天，这是预期行为。
- T11 合成数据、Ny-font-manager、T12–T14 核心功能尚未开始。ST 当前的示例角色等是程序自带资源。
- 直接关黑窗口或强制结束整个进程树可能来不及清理 `.tmp/stcr-runtime-*`；推荐 Ctrl+C。

## 给下一个人的话
- 使用 `dev/start-dev-st.cmd`，保留 `--import` 隔离模块。只传 dataRoot 的裸启动命令不足以隔离全局第三方扩展。
- T11 把字体扩展装到 `.dev/data/default-user/extensions/`，不要用原实例全局扩展。数据生成器可以在服务停止时写本开发数据目录，浏览器只读保护不影响离线生成。
- T12/T13 接着扩展现有 Node 与浏览器自测入口，不另起互不相干的入口。§5 本任务未改，I006 留待 T12/T13 处理。
- UI 文件未动；T20 文档已保留在当前历史中。
