你是本项目的引擎与数据层工程师，接着上次的工作。先重读 AGENTS.md、docs/05_DECISIONS.md（新增 D24–D27）、docs/06_ISSUES.md（I036、I037）、docs/feedback/2026-10-01_二次安装问题反馈.txt（人类原话；同目录的截图含真实聊天，不入库，可以看但不要复制内容到任何文件）。从 main 开工。本次依次做 docs/04_TASKS.md 的 T51、T53、T54a，每张卡一个分支、一封交接信，做完一张停下告诉我怎么验收，等我说"继续"再领下一张。

三条铁律不变：只读（D02）；数据（只用 .dev 开发实例，不碰 F:\Claude\xinllm\SillyTavern\data\）；磁盘（不写 C/F 盘、不装依赖、不下载大文件）。

T51 裸 HTML 边界与透明背景（D26）：detectHtmlBlocks 的裸 HTML 分支改为只返回"第一个块级 HTML 标签到最后一个闭合标签"的区间，前后散文留在正文；一楼里有多段时逐段返回；交互 iframe 背景透明（外壳与内容两层 html/body 都 background:transparent，iframe 加 allowtransparency），内容自己的 body 背景照常生效。fixture 追加样本：一行『场景标题』散文 + 大段带 <style> 的 HTML + 一行散文（内容虚构）。selftest 覆盖区间、散文不入 iframe、多段。注意 Opus 的 htmlBlocks.js 依赖返回结构，字段变化写 06 并在交接信通知。

T53 重开提速（D24）：chatSource 加内存 LRU：最近 3 个聊天、总字节上限 150 MB，缓存原始数组与已构建页模型；列表打开时预取"当前聊天"第一页；命中时不请求 /api/chats/get，但用 /api/chats/search（或 /recent）返回的 file_size / last_mes 校验，变化即失效重拉；刷新页面即空，不写 IndexedDB。selftest 覆盖命中、失效、容量淘汰；浏览器自测在开发实例计时：第二次打开 21 MB 合成聊天 < 300 ms。

T54a 版本与更新 core（D25）：新建 src/core/updateService.js：getVersion()（读本扩展 manifest，经 ST 的 getExtensionManifest 或同源 fetch）、checkUpdate()（POST /api/extensions/version，body {extensionName, global}，两种安装位置都试）、runUpdate()（POST /api/extensions/update）、getChangelog()（同源 fetch 扩展目录 CHANGELOG.md，按 "## x.y.z" 切段）、lastSeenVersion 存 store.settings。开发实例是目录联接、没有 git 远端：要能识别并返回 {state:'dev'}，UI 显示"开发目录，不可更新"而不是报错。这两个接口只对扩展自身目录做 git 操作，不碰聊天；把它们登记进 03 §1 的"允许接口"并在 README 第三方域名披露表加一行"检查更新 / 更新：ST 访问 github.com"。readonlyGuard 的禁用清单不变。selftest 覆盖 changelog 解析与 dev 状态判断。

不要最小执行；每张卡附给完全不会代码的人的验收步骤与只读自查。
