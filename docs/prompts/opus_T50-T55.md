你是本项目的界面与阅读体验负责人，接着上次的工作。先重读 CLAUDE.md、docs/05_DECISIONS.md（新增 D24–D27）、docs/06_ISSUES.md（I036、I037）、docs/feedback/2026-10-01_二次安装问题反馈.txt（人类原话；同目录四张截图含真实聊天，可以看，不要把内容复制进任何文件）。从 main 开工。本次依次做 docs/04_TASKS.md 的 T50、T52、T55、T54b（T54b 要等 astra 的 T54a 交付，没交付先做前三张并停下），每张卡一个分支、一封交接信，做完一张停下告诉我怎么验收，等我说"继续"再领下一张。

三条铁律不变：只读（D02）；数据（只用 .dev 开发实例，不碰 F:\Claude\xinllm\SillyTavern\data\）；磁盘（不写 C/F 盘、不装依赖、不下载素材）。不改 src/core；接口不够写 06 并用 mock 先做完。

T50 正文居中 bug（反馈 1，截图 阅读器-文字.png）：人类用的是 ST 自带主题，真实 ST 里阅读器正文居中，ST 本身正常，开发实例没复现过。开发实例的 .dev/data/default-user/themes 里有 ST 自带五套主题（Azure、Cappuccino、Celestial Macaron、Dark Lite、Dark V 1.0），逐套切换，再分别切 ST 用户设置里"聊天样式"的 默认 / 气泡 / 文档 三种，找出哪种组合复现。可能原因按概率：cssScope 克隆了某条带 text-align 的 #chat 规则（看 src/core/cssScope.js 产出的 <style id="stcr-scoped-css">）；楼层被当成系统楼套了 .stcr-mes--system（style.css:136）；宿主某个父容器的 text-align 被继承。找到后修复：根因在 UI 直接改；根因在 core 写 06 给 astra，并先在 UI 用 `#stcr_root #stcr_chat .mes_text { text-align: start }` 之类低优先级兜底。加浏览器回归断言：五套主题 × 三种显示下 .mes_text 的 computed textAlign 为 start 或 left。人类会在真实 ST 复查。

人类已回复复现条件（2026-10-01）：Cappuccino 与 Celestial Macaron 都复现；头像样式圆形、聊天风格气泡、media style 为 list。规划者核对了 ST 自带主题文件：这两套的 custom_css 都是空的，共同点是 chat_display=1（气泡），Dark Lite 是 0。所以先按"气泡模式"复现（ST 用户设置 → 聊天风格 → 气泡），再切圆形头像。线索按优先级：①气泡模式下 `body.bubblechat .mes` 规则（public/css/toggle-dependent.css:306）会被 cssScope 克隆进 #stcr_chat，看克隆产物里是否连带了别的声明；②ST style.css:685 `.mes.smallSysMes .mes_text { text-align: center }`，检查阅读器楼层是否意外带上 smallSysMes 或被 `:has()` 匹配；③人类真实 ST 还装了 LittleWhiteBox、JS-Slash-Runner 等扩展，它们注入的 <style> 可能含 `#chat .mes_text { text-align: center }` 之类规则并被克隆——在开发实例装不了它们，所以修复必须是通用的：对克隆规则里的 text-align 做白名单处理（只允许作用于 .stcr-mes--system），或在 #stcr_chat .mes_text 上以足够优先级写 `text-align: start`，并让用户主题仍能通过自定义 CSS 覆盖。把最终根因写进交接信。

T52 宽度与伸出（D27，截图 2 和 3）：①"跟随 ST"的正文宽度改为读宿主 #sheld（没有则 #chat）的实际渲染宽度，ResizeObserver 跟随，不再用 --sheldWidth 变量；②HTML 块在正文里时去掉白色外框（style.css:249 的 iframe 白底与边框），让它像酒馆助手那样和正文融为一体；③宽度预设大于正文时：先伸到视口可用宽度（左右各留 16px），仍放不下就对渲染区整体 transform: scale() 等比缩小到可用宽度，并把容器高度按缩放后的实际高度收紧，不留空白、不横向裁切；分页模式同样处理；缩放时显示一个小字"已缩放 83%"。验收：1366 宽窗口下"桌面 1200"完整可见；"跟随正文"时阅读器正文和 ST 聊天栏等宽，误差 ≤ 2px。

T55 使用说明（反馈 5）：写 docs/使用说明.md，面向完全不懂代码的用户，自然语言，按"怎么打开 / 读 / 记（划线批注收藏）/ 分享（卡片与脱敏）/ HTML 小剧场 / 设置与备份 / 常见问题"组织，2500 字以内，不出现任务编号、分支、合同等内部词；每个功能写"在哪里点、会发生什么"。然后在 Aa → 更多设置加"使用说明"按钮，阅读器内以面板渲染这个文件（同源 fetch 扩展目录下的 docs/使用说明.md，用 ST 的 showdown 转 HTML、DOMPurify 清洗），README 的"怎么用"一节改为链接它。

T54b 版本与更新 UI（D25）：Aa → 更多设置顶部一行"ST Reader v0.2.0 · 检查更新"；点击走 T54a 的 checkUpdate；有新版显示"立即更新"，完成后提示"刷新页面生效"；开发目录显示"开发目录，不可更新"；更新后首次打开阅读器弹"本次更新了什么"面板（T54a 的 getChangelog 对应版本段），有"不再提醒"开关（存 store.settings）。验收由人类在真实 ST 点检查更新。

每张卡附给完全不会代码的人的验收步骤与只读自查 grep。
