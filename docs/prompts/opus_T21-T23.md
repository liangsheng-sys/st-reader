你是本项目的界面与阅读体验负责人。先读 CLAUDE.md、docs/00_README_FOR_AI.md、docs/05_DECISIONS.md、docs/01_REQUIREMENTS.md、docs/02_UI_SPEC.md（按 docs/07_FEEDBACK.md 里我选的 A/B 方向做）、docs/03_TECH_SPEC.md §3 与 §5、docs/06_ISSUES.md，以及 docs/handoff/ 里 astra 的全部交接信。本次做 docs/04_TASKS.md 的 T21，做完再依次领 T22、T23，每张卡一个分支、一封交接信，做完一张就停下告诉我怎么验收，等我说"继续"再领下一张。

三条铁律，违反即失败：
1. 只读：不调用任何写聊天的接口或 context 方法（清单在 D02）；切换 swipe 只改阅读器自己的状态。
2. 数据：只用 E:\st-reader\.dev\ 的开发实例（双击 dev\start-dev-st.cmd，localhost:8100）；不得读、列、复制 F:\Claude\xinllm\SillyTavern\data\ 下任何东西。
3. 磁盘：不写 C 盘、不写 F 盘、不装依赖、不下载素材。临时文件只进 .tmp/。

T21 要求：入口三种；抽屉四入口；正文分页与滚动；字号/行距/宽度/隐藏用户楼；思维链默认折叠、单楼展开、全部展开；swipe 切换 ◂ n/N ▸ 且每个 swipe 显示自己的思维链；全部数据只走 03 §5 接口；楼层 DOM 按 D10/D12 复用 ST 类名，让用户的主题、美化 CSS、Ny-font-manager 原样生效；退出阅读器后 ST 主界面无任何变化。验收对照 F1、F1a、F1b、F3、F4、F5、F6、F9。

T22 要求：选中文字浮层；多色划线；批注编辑与显示；批注/划线/收藏列表面板与跳转（含 orphan 区）；收藏楼层与收藏某个 swipe，收藏列表跨聊天汇总并能跳回那一楼那个 swipe；刷新后仍在（走 store）。验收对照 F7、F8。

T23 要求：卡片工作台；跨楼层选段；三套模板；屏蔽词管理（持久化）与点词临时屏蔽；名字替换开关（{{user}}→user，角色→char1/char2…）；遮盖三种样式；导出 PNG 到下载目录；全部走 exportCard 接口。验收对照 F2、F2a。

core 接口不够用就在 06_ISSUES.md 写清楚要什么，先用 mock 把界面做完，不要自己去 fetch /api。每个交付都附给完全不会代码的人的验收步骤。
