你是本项目的界面与阅读体验负责人，接着上次的工作。先读 CLAUDE.md、docs/06_ISSUES.md 的 I050（含人类控制台诊断结论）、docs/04_TASKS.md 的 T62。从 main 开工，分支 task/T62-hidden-floors，做完停下告诉我怎么验收。

三条铁律不变：只读（D02）；数据（只用 .dev 开发实例，不碰 F:\Claude\xinllm\SillyTavern\data\）；磁盘（不写 C/F 盘、不装依赖）。

背景：ST 的"隐藏消息"就是把楼的 is_system 置 true（名字、swipes、extra 都不变），ST 自己照常排版只变灰。人类真实聊天里大量楼被隐藏过，阅读器把它们全当成了系统楼：居中小字、没头像、没工具条、不能切 swipe。这是 0.2.0 发布后人类在真实 ST 里看到"除第 0 楼外全部居中"的根因。core 的 MessageModel 已有 isNarrator（extra.type==='narrator'），不需要改 core。

T62 要做：
1. 系统楼样式判定改为：isNarrator，或（isSystem 且名字为空/"System" 且无 swipes）。其余 isSystem 为 true 的楼按普通楼渲染：头像、工具条、swipe 切换、收藏、划线、批注全部可用。把判定抽成 logic.js 里的纯函数 isSystemLike(model) 并加 Node 测试，floorToolbar / cardPieces / cardStudio / reader 都用它。
2. 隐藏楼的名字行后面加一个淡色小标签"已隐藏"，悬停提示"在 ST 里被隐藏、不发给模型，阅读器照常显示"。Aa 里不加开关。
3. logic.js 的"隐藏用户楼"折叠：隐藏过的用户楼也要能折叠。
4. fixture：在 dev/fixtures/gen.mjs 的星灯聊天里给第 1–3 楼加 is_system:true（名字不变、其中一楼保留多 swipe），manifest 清单同步。这是 astra 的文件，本卡允许你改这一处，交接信写明。
5. 浏览器回归：隐藏楼 .mes_text 计算 textAlign 为 start，且有 swipe 控件；真正的 narrator 楼仍居中。
6. manifest 0.2.1，CHANGELOG 加 0.2.1 一节（大白话："被隐藏过的楼不再居中、可以切 swipe 了"），README 不用动。

验收步骤写给完全不会代码的人，并给出人类在真实 ST 里核对的一步：更新后打开之前居中的那个聊天，正文左对齐、名字旁有"已隐藏"小标签、能切候选。交接信附只读自查 grep。
