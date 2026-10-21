你是本项目的界面与阅读体验负责人，这一轮临时也负责引擎（D32）。先读 CLAUDE.md（含末尾"临时授权"）、docs/05_DECISIONS.md 的 D32、D36–D38、docs/06_ISSUES.md 的 I020、I054、docs/04_TASKS.md 的 M8（T80–T83）、docs/handoff/ 里 T70–T73 的交接信。一次只做一张卡，顺序 T80 → T81 → T82 → T83；每张卡从 main 开分支 `task/<ID>-<短名>`，做完停下告诉我怎么验收。

三条铁律不变：只读（D02）；数据（只用 .dev 的 8100 开发实例，不碰 F:/Claude/xinllm/SillyTavern/data/）；磁盘（不写 C/F 盘、不装依赖、不下载素材）。D32 要求：03 §5 只增不改；三套自测全绿；交接信单列"core 改动"。

## T80 导航与悬浮件（反馈 2、6、8；I054、D37）

人类原话：跟随条"现在有点挡到正文了"，要"一键跳到上/下一层楼"，HTML 工具栏"需要隐藏开关"。社区：TauriTavern 手机竖屏"顶部的那个 x 点不动，必须把屏幕横过来"。

要做：
1. 跟随条重做：默认收成右缘一枚细长胶囊（楼名 + 候选序号 `2/5`），悬停或点按展开为整条：上一楼 ↑、下一楼 ↓、回到本楼开头、候选切换、收藏星。≥1000px 时停在正文列右侧的空白处（正文列居中、两侧有余量），绝不压字；<1000px 贴右缘；"左 / 右"位置偏好记入 prefs（Aa → 显示）。不做拖动。
2. 键盘 `[` `]` 上下楼（输入框聚焦时不抢）。
3. Aa → 显示新增开关"隐藏 HTML 工具条"：开着时 HTML 块上方的工具条平时不显示，鼠标悬停块时淡入；触屏点块一角出现。
4. 手机竖屏顶栏：标题 `min-width:0` + 省略号，✕ `flex-shrink:0` 固定右上，根容器 `padding-top: env(safe-area-inset-top)`；无头浏览器 390×844 断言 ✕ 的矩形完全在视口内并能触发关闭。我们没法装 TT（D37、磁盘铁律），只能这样核对。
5. README"当前边界"加一句："TauriTavern 据社区反馈可用，作者未在 TT 上测试。"

验收：1366 宽窗口，长楼滚动时右侧只有一枚小胶囊，悬停展开，点 ↓ 到下一楼开头；Aa 里开"隐藏 HTML 工具条"后工具条消失、悬停出现；F12 切到手机 390 宽，右上 ✕ 可点。

## T81 脱敏统一（D36、D38；反馈 3、5、10）

人类原话："自动名字开启时，没有在复制脱敏版代码和脱敏显示中生效""缺少一个直接管理替换和屏蔽规则的按钮""需要支持好几个不同的字/词替换为同一个文字/样式"。

要做：
1. Aa 脱敏区新增全局开关"自动名字（角色名、你的名字换成 char / user）"，默认开。脱敏显示（`redact.js`）、复制脱敏版代码（`htmlBlocks.js`）默认跟随；卡片工作台与 HTML 截图对话框的同名开关初始值改为跟随全局、对话框内仍可临时关。
2. Aa 脱敏区加按钮"管理屏蔽词与替换规则…"，打开现有 `createRulesManager`。
3. 规则记录新增可选 `aliases: string[]`（core `store.js` 校验：字符串数组、去重、不与 `from` 重复；导出格式 version 仍为 1；旧 JSON 导入不报错）。`textTransforms` / `cardTransforms` 把 `from` 与 `aliases` 都当原词，长词优先规则不变。规则编辑界面"更多原词"多行输入（一行一个），列表一行显示 `灯塔、灯台 → 某地`。Node 测试覆盖。

验收：Aa 开脱敏显示，正文里角色名显示为 char；HTML 块"复制脱敏版代码"粘出来名字已换；给一条规则加第二个原词，两个词都被替换；Aa 里点"管理…"直接进规则面板。

## T82 滚动性能（I020；反馈 1）

人类原话："用鼠标滚动阅读的体验需要更流畅丝滑。" I020 记录的热点是 UI 的 `getBoundingClientRect / ensureWindow / isShown`。

要做：
1. 在 8100 打开 4000 楼大样本，Performance 录 10 秒连续滚轮，找出长帧来源。
2. 改法候选：IntersectionObserver 哨兵代替每帧遍历测量；缓存楼高、只在尺寸变化时重测；`content-visibility: auto` + `contain-intrinsic-size`；滚动监听 `passive`；进度条与跟随条更新节流到每 100 ms。不改分页上限与内存回收逻辑。
3. `dev/test-performance.cmd` 新增两项：连续滚动 10 秒长帧（>50 ms）≤ 2；翻屏 P95 < 60 ms。全绿后在 I020 写复测数字。

验收：人类在 4000 楼样本上用滚轮连续读两分钟不卡顿；性能脚本输出 passed=true。

## T83 内联 SVG（反馈 12）

要做：`formatter.js` 的 `safeHtml` 放行 `svg path circle rect line polyline polygon g defs linearGradient radialGradient stop text tspan clipPath mask use symbol`，仍禁 `href / xlink:href`、`script`、外部 `use`；沙箱里本来就能跑的不动；卡片导出确认 SVG 进 PNG；fixture 加一楼含内联 SVG 图标与渐变。

验收：样本楼的 SVG 在正文和卡片 PNG 里都能看到。

每张卡交接信按模板，附只读自查、`audit-readonly` 结果与"core 改动"一节。
