你是本项目的引擎与数据层工程师，接着上次的工作。先读 AGENTS.md、docs/05_DECISIONS.md（新增 D28–D30）、docs/06_ISSUES.md（I040 已拍板、I046、I047）、docs/04_TASKS.md 的 T57。main 已快进到 Opus 的 task/T55-guide（含 T50/T52/T54a/T54b/T55 与你的 I041）。你的 T53 还在 task/T53-memory-cache 上，与 main 分叉。本次做 T57，一张卡一个分支 task/T57-release-0.2.0，做完停下告诉我怎么验收。

三条铁律不变：只读（D02）；数据（只用 .dev 开发实例，不碰 F:\Claude\xinllm\SillyTavern\data\）；磁盘（不写 C/F 盘、不装依赖、不下载大文件；GitHub 推送由人类做）。

T57 按顺序：
1. 从 main 开分支，把 task/T53-memory-cache 合进来。预计冲突：dev/README.md、dev/selftest.mjs、dev/test-performance.mjs、docs/04_TASKS.md、index.js。规则：docs/04_TASKS.md 与 06/07 以 main 为准，只把 T53 自己那一行与 I040/I042 条目带过来（I047）；代码冲突两边功能都要保留（Opus 的 htmlBlocks/updateUi 接线与你的 chatCache）。合并后 Node、浏览器、UI 三套自测必须全绿再往下。
2. 按 D28 改校验时机：openChat 缓存命中时立即返回缓存句柄（首屏不等 search）；后台发起一次 search 比对 file_size / last_mes / 楼数，结果缓存 60 s；发现变化时不替换正文，通过句柄上的事件或回调通知 UI（在 03 §5.14 定义签名，例如 handle.onStale(cb) 或 EventTarget），UI 的横幅由 Opus 的 T59 接。浏览器自测把"< 300 ms"改为"缓存命中时首屏渲染完成 < 300 ms"，后台校验耗时单独记录不计入。test-performance 同步调整，I040 在 06 记为已处理并写实测数字。
3. manifest.json 版本 0.1.0 → 0.2.0；SETUP_WINDOWS 里写死的 0.1.0 字样同步。
4. CHANGELOG 0.2.0 一节（Opus 已预写）补两行：重开提速（按 D28 的实际行为描述）、阅读器打开时临时静音聊天自带样式（D29）。保持大白话。
5. D30 写进三处：README 安装节加"曾用目录联接安装的人，先双击 install/unlink-from-my-st.cmd 再用 URL 安装，两份并存会加载旧副本"；docs/使用说明.md 常见问题加一条同样内容（用户口吻，Opus 的文风）；SETUP_WINDOWS §3 加"开发联接与正式安装二选一"。
6. README"只读与隐私"一节加 D29 那句话。
7. 全部自测全绿、`node dev/audit-readonly.mjs` 通过后，快进 main 到你的最终提交，交接信里给出提交编号，停下等 Fable 做 T61 复查。不打 tag、不推送。

不要最小执行；交接信附给完全不会代码的人的验收步骤与只读自查。
