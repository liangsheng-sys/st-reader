你是本项目的引擎与数据层工程师。先读 AGENTS.md、docs/00_README_FOR_AI.md、docs/05_DECISIONS.md、docs/03_TECH_SPEC.md、docs/06_ISSUES.md。本次做 docs/04_TASKS.md 的 T10，做完再依次领 T11、T12、T13、T14，每张卡一个分支、一封交接信，做完一张就停下告诉我怎么验收，等我说"继续"再领下一张。

三条铁律，违反即失败：
1. 只读：扩展代码不得调用任何写聊天的接口（清单在 D02）。交接信里附 grep 自查。
2. 数据：只用 E:\st-reader\.dev\ 的开发实例；--dataRoot 永远是 E:\st-reader\.dev\data；不得读、列、复制 F:\Claude\xinllm\SillyTavern\data\ 下任何东西。核对 ST API 可以读 F:\Claude\xinllm\SillyTavern\public\ 和 src\ 的源码。
3. 磁盘：不写 C 盘、不写 F 盘、不 npm install、不建 node_modules、不下载大文件。临时文件只进 .tmp/。

T10 要求：dev/start-dev-st.cmd + .dev/config.yaml（dataRoot E:\st-reader\.dev\data、port 8100、listen false、whitelistMode true）；首次运行自动建 .dev/ 并把 extension/ 用目录联接挂到 .dev/data/default-user/extensions/st-reader；写 extension/src/core/readonlyGuard.js（包装 window.fetch，命中 D02 禁用路径就 throw 并 console.error，开发实例默认开启）；补全 docs/SETUP_WINDOWS.md §2。验收：我双击 cmd，浏览器打开 localhost:8100，扩展列表里有"阅读器 (ST Reader)"。

T11 要求：dev/fixtures/gen.mjs 只用 Node 内置模块，按任务卡生成全部合成数据（角色、群聊、多 swipe 带思维链、代码块、HTML、超长楼、≥20 MB 大文件、带 custom_css 的主题、全局正则、作用域正则 + character_allowed_regex），并在开发实例里装 Ny-font-manager 做兼容测试，登记 LICENSES。所有内容都是虚构的，不许从任何真实聊天复制。

T12 要求：chatSource / messageModel / regexPipeline / formatter 四个模块；§4.1 两种正则策略都要试到能证明为止再选，理由写进 03 §4.1；把 03 §5 接口写实（签名 + JSDoc + 示例）；dev/selftest.mjs（Node 跑纯逻辑）与 window.stcrSelfTest()（浏览器跑正则命中、深度、只跑一次、未选中角色的作用域正则命中）。

T13 要求：cssScope（克隆 #chat 规则到 #stcr_chat，主题切换与新增 style 后重跑，处理 !important）、store（localforage 实例 'st-reader'，annotations/bookmarks/maskWords/settings，导出导入 JSON）、anchor（生成与重定位，失配进 orphan）。都进 selftest。

T14 要求：vendored modern-screenshot 单文件（登记 LICENSES）；exportCard(rootEl, {maskWords, replaceNames, maskStyle}) → PNG Blob；名字替换（正则前原文层）与屏蔽 span 包裹（正则后文本节点层）两个纯函数进 selftest；验证 Ny-font-manager 的 IndexedDB 字体在 PNG 里生效。

不要最小执行：任务卡里写的每一项都要交付并能跑。每个交付都附给完全不会代码的人的验收步骤。§5 接口交付后就是与 Opus 的合同，以后改动要在 06_ISSUES.md 登记。
