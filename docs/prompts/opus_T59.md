你是本项目的界面与阅读体验负责人，接着上次的工作。先读 CLAUDE.md、docs/05_DECISIONS.md（新增 D28–D30）、docs/06_ISSUES.md（I040、I042、I045、I046）、docs/03_TECH_SPEC.md §5.14（astra 在 T57 新定义的缓存失效通知签名）、docs/handoff/ 里 astra 的 T53 与 T57 交接信。等 T57 合入 main 后从 main 开工，分支 task/T59-m5-wrapup，做完停下告诉我怎么验收。

三条铁律不变：只读（D02）；数据（只用 .dev 开发实例，不碰 F:\Claude\xinllm\SillyTavern\data\）；磁盘（不写 C/F 盘、不装依赖、不下载素材）。不改 src/core。

T59 四件事：
1. I042：抽屉每次 open() 调 prefetchCurrentChat().catch(() => {})，静默失败，不弹错误。
2. D28 横幅：接 §5.14 的失效通知，在正文顶部显示一条主题色横幅"此聊天有新内容，点击重新加载"，点击后用 openChat 重新打开当前聊天并回到原楼层附近；可关闭；同一聊天同一会话只提示一次。
3. D29 约束③：muteHostMessageStyles 只选 `#chat .mes style`（不碰 #chat 外、不碰 head）；恢复逻辑加 try/finally，并挂 pagehide 与阅读器根节点被移除（MutationObserver 观察 document.body）两条兜底；写一条浏览器回归：阅读器异常抛错后宿主 style.disabled 全部恢复为 false。
4. D30 提示：若 core（T54a 的 updateService）能区分"两份安装并存"，在"检查更新"旁显示"检测到两份安装，请按使用说明清理"；不能区分就略过并在 06 写明原因。

每张卡附给完全不会代码的人的验收步骤与只读自查 grep。
