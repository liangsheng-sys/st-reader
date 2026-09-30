你是本项目的界面与阅读体验负责人，接着上次的工作。先重读 CLAUDE.md、docs/05_DECISIONS.md（新增 D15–D21）、docs/01_REQUIREMENTS.md 的"v1.1 追加"、docs/06_ISSUES.md（I018–I024）、docs/feedback/2026-09-30_初次安装使用的新问题.txt（人类原话，含两个真实提示词样例）、docs/handoff/ 里 astra 的 T40 与 T41 交接信、docs/03_TECH_SPEC.md §5 新增合同。注意 T40 已把扩展移到仓库根（不再有 extension/ 目录），先 git pull / 切到 main 再开工。本次依次做 docs/04_TASKS.md 的 T42、T43、T45、T44b（T44b 要等 astra 的 T44a 交付，若未交付先做前三张并停下），每张卡一个分支、一封交接信，做完一张停下告诉我怎么验收，等我说"继续"再领下一张。

三条铁律不变：只读（D02）；数据（只用 .dev 开发实例，不碰 F:\Claude\xinllm\SillyTavern\data\）；磁盘（不写 C/F 盘、不装依赖、不下载素材）。不改 src/core；接口不够写 06 并用 mock 先做完。

T42 UI 细节（对应人类反馈 1、2、3、4、5 与 I021）：①Aa 设置条各行元素与标签对齐（栅格化）；②"隐藏思维链"开关：开启后"思考了 x 秒"整行不出现，楼层工具条的 🧠 也隐藏；③替换规则"文字"类型加背景色选项（8 个预设色 + 色号输入，走 T41 的 to.background）；④色块遮盖的颜色选择器（同一套 8 预设 + 色号，走 MaskStyle.color），涂黑保持黑/白；⑤涂黑与色块高度贴合行高（用 1em 或 line-height 计算，不再 80%）；⑥I021 接线：卡片工作台"名字替换"拆成"自动名字"与"我的规则"两个独立开关（core 的 autoReplaceNames / applyReplaceRules）。

T43 抽屉改造（D19/D20，反馈 7、8）：①按角色页默认跟随 ST 当前排序（powerUserSettings.sort_field / sort_order；字段 name、create_date、fav、date_last_chat、chat_size 来自 characters[]），顶部一个小下拉可临时改；ST 标签筛选（context.tags / tagMap）；名字搜索框；群组页同理但只排序 + 搜索；②"收藏"页改为"收藏的聊天"（走 store.bookmarks kind:'chat'）：聊天列表项悬停出现 ☆、阅读器顶栏也有"收藏此聊天"；楼与 swipe 的收藏只留右侧面板（保留"本聊天 / 全部聊天"切换），抽屉不再列它们；③大量角色下用虚拟滚动，让 astra 的 fixture 生成 400 个空角色时列表不卡（若 fixture 没有，让我知道，先用 mock 数据验）。

T45 脱敏阅读模式（D21）：设置条一个开关"脱敏显示"，开启后正文按 store.maskWords 与 replaceRules 显示（用 T41 的 maskText / 规则函数，只改显示副本）；划线锚点始终按未脱敏文本生成与定位（你现有的 Highlight API 方案需处理文本节点被替换后的偏移映射，写清做法）；开关持久化到 store.settings；被替换处有细微下划点提示"此处已脱敏"，悬停不显示原词。

T44b HTML 渲染 UI（D15/D16，F10/F10a/F10b）：①楼内 HTML 块默认渲染（设置条可改默认为原文），块右上角小工具条：渲染/原文切换、宽度预设（手机 390 / 平板 768 / 桌面 1200 / 跟随正文）、"允许加载外链资源"（点后弹 ST 确认框，文案说明外链来自模型生成代码，每次打开阅读器需重新确认）；②卡片工作台新增来源"渲染视图"：显示静态预览，可拖裁剪框，导出走 exportRenderedHtml，屏蔽词与规则同一份 options；③代码块复制按钮旁加"复制脱敏版"（走 maskCodeText）；④02_UI_SPEC 补 §10 写清以上布局。验收用 T44a 追加的两楼合成 HTML 样本，不用真实聊天。

每张卡附给完全不会代码的人的验收步骤与只读自查 grep。
