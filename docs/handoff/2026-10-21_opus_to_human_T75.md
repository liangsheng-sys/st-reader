# T75 交接：正则改过 / 产出的 HTML 正确框住，楼内样式不再整段删除（I057–I059）

T73 验收后，人类要求"接着试着解决显示问题"。这三个问题原来没有任务卡，我在 04 里开了 T75，排在 T74 发布复查之前。

## 做了什么

- **I057：正则改了模型写的 HTML 盒子，整楼（连散文）被塞进一个框。** 现在只框盒子，散文留在框外。
- **I058：正则产出的整页网页（`<html><body>…`）没进框，按正文渲染，按钮不能点。** 现在单独进框，里面的脚本在沙箱里照常运行。
- **I059：楼内 `<style>` 只要有动画（`@keyframes`）、字体（`@font-face`）或反斜杠（图标字符 `content:"\f005"` 常用），整段样式就被删掉，盒子只剩没样式的字。** 现在逐条清洗：
  - 动画和图标字符保留；
  - 只去掉会加载外部字体 / 样式表的规则，以及单条危险的写法。
- **不变的部分：**
  - 普通的正则美化（T73 的信纸、状态条）仍在正文里显示，和 ST 一样，不会突然变成一个个框；
  - T72 的社区卡结构（第 11 楼）也和以前一样。

## 复现与根因

1. **I057 / I058：识别用错了文本。** 阅读器是在"正则之前的原文"上找裸 HTML 的，但正文是"正则之后的文本"排出来的。
   - 正则一改，两边的标签对不上，就退回"整楼一块"（I057）；
   - 正则产出的 HTML 原文里根本没有，就认不出来（I058）。
   - 现在改在正则之后的文本上找。另外修了一个复现时才看到的小问题：单独一行的 `<html><head><style>` 被 Markdown 包进了段落，也会对不上。
2. **I059：格式化把整段样式删掉了。** 为防外链和转义绕过，格式化见到可疑内容就整段删除。现在用浏览器自己的 CSS 解析器把样式拆开，一条条重建。
3. **复现时发现的旧风险：** ST 自己的 CSS 解析器和浏览器对畸形样式理解不一样，ST 加过"只作用于这一楼"前缀的样式，到浏览器里可能读出一条不带前缀、作用于整页的规则。以前就存在，ST 主界面里也一样。
   - 既然现在逐条重建，就顺手拦住：选择器不以阅读器前缀开头的规则整条丢掉。

## core 改动（D32）

| 文件 | 改了什么 | 为什么 |
|---|---|---|
| `src/core/formatter.js` | ① `renderMessage` 返回值多一个 `displayText`（正则之后、Markdown 之前的正文）<br>② 新导出 `cleanStyleText()`：逐条清洗楼内 `<style>`。`@keyframes` 改名为 `stcr-kf-*` 防止覆盖 ST 自己的动画；去掉 `@font-face` / `@import` 等；强制阅读器前缀<br>③ 正文 `<style>` 改用它，不再整段删除 | I057 / I058 需要正则后的文本；I059 |
| `src/core/cssDeclarations.js`（新） | `cssDeclarations(style)`：遍历声明，含 `var()` 的简写取整条 | 从 T73 的 `cardSnapshot.js` 抽出来，两处共用 |
| `src/core/cardSnapshot.js` | 改用 `cssDeclarations`，行为不变 | 去重 |
| `src/core/coreBrowser.test.js` | 加两条：样式清洗（动画改名、图标字符、危险规则、单条丢弃、带 `}` 的动画名、选择器前缀），以及 `displayText` | 回归 |

合同只增不改：`renderMessage` 旧字段都在，`detectHtmlBlocks` 没动，写在 03 §5.13 "T75 增补"。`readonlyGuard.js` 名单和 `audit-readonly.mjs` 没动。

`dev/fixtures/`：纸舟加了第 13、14 楼和三条 `stcr-t75-` 全局正则（`DISPLAY_REGEX`）。`.dev` 里已经停服用 `append-html.mjs` 追加，其他楼层和设置不变。

## 改动文件

- 界面：
  - `src/ui/htmlBlocks.js`：`findHtmlBlocks(textEl, raw, display)` 改在 display 上找；只装 `<style>` 的段落算作 style；
  - `src/ui/floorToolbar.js`：传入 `displayText`；
  - `src/ui/uiBrowser.test.js`：新增 `testHtmlAfterRegexBrowser`，已接进发布测试。
- 文档：
  - `docs/02_UI_SPEC.md`（HTML 块一节）；
  - `docs/03_TECH_SPEC.md`（§5.13、`RenderedMessage`）；
  - `docs/04_TASKS.md`（新增 T75 → 待验收）；
  - `docs/06_ISSUES.md`（I057–I059 → 待验收）；
  - `dev/fixtures/README.md`。

## 人类验收步骤

在 **8100** 上验收：双击 `dev\start-dev-st.cmd`，出现 listening 后打开 `http://localhost:8100`。之前开着 8100 页面的话，**先刷新一次**。

打开阅读器，左边抽屉找 **纸舟（虚构）→ STCR-02-代码与长文**，拉到最后。

**A. 第 13 楼：正则改过的盒子和正则产出的整页（I057、I058）**
1. 从上往下应该依次看到：
   - 一行普通散文"雾散了一点……（这一段是散文，应在框外）"，**不在框里**；
   - 一条"HTML · 渲染 / 原文"工具条，下面一个深青色圆角小框"观测记录：东风二级……"；
   - 又一行散文"后来他们就回去睡了……"，**不在框里**；
   - 第二条工具条，下面一张米色小页面"纸港观测站（虚构）"，有"今天点灯 0 次"和一个"点灯"按钮。
2. 点"点灯"，数字变成 1、2、3……（网页里的脚本在框里运行）。
3. 点第一个框工具条上的"原文"，能看到代码里是 `<section class="harbor-log">`，也就是正则改过之后的样子。点"渲染"切回。

**B. 第 14 楼：带动画和图标的状态条（I059）**
1. 一行字"灯塔今晚的状态如下。"，下面是一颗深青色胶囊"● 灯塔 · 运转中 ★"：
   - 左边小圆点**一明一暗地闪**；
   - 右边是一颗黄色实心星星图标，不是方框或乱码。
2. 这条胶囊直接在正文里，**没有**"HTML"工具条。

**C. 以前的楼没变**
1. 第 12 楼（T73 信纸）：还是米色信纸，直接在正文里，没有工具条。
2. 第 11 楼（T72 社区卡）：散文、三个折叠、一个框（粉蓝胶囊 + 状态栏）、"选项：……"在框外，和 T72 验收时一样。

## 只读自查

- `rg --no-ignore -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src vendor style.css` → 只有 `readonlyGuard.js` 第 4–10 行（禁用名单本身）和 `htmlSnapshot.test.js:12`（"必须拒绝"的测试输入），与上次相同。
- `node dev/audit-readonly.mjs` → 静态边界检查通过；forbiddenCalls / hostWrites 在扩展运行文件里 0 行。

## 自测

- `node dev/selftest.mjs` → 全部通过（190 项），新增"T75 纸舟第 13、14 楼"。
- `node src/ui/ui.test.js` → 全部通过（35 项）。
- 浏览器：
  - core 浏览器自测 19 项全过；
  - 新的"正则后识别" 5 项全过；
  - 卡片导出测试只有两条 Ny 字体项没过。这两条在全新的无头浏览器里预期不过，发布测试会装字体。
- `dev/test-release.cmd` → T57 OK，浏览器被拦请求 0 次。
- 数据：
  - 跑测试前，我把 8100 的 `settings.json` 和两份阅读器备份文件**复制**到了 `.tmp/t75-keep/`。备份文件和 T73 交接时不一样，应该是你验收 T73 时阅读器自动备份的，所以以你那时的版本为准；
  - 测试结束、停服后逐个拷回，md5 与复制件一致；
  - ST 运行期间生成的 3 份 `backups/settings_*` 已删。

## 已知问题 / 没做的

- **行内 `style=""` 没改：** 带反斜杠、`image-set` 或 `@import` 的行内样式仍整条去掉。社区写法里很少见，这次没动。
- **`@font-face` 一律丢弃：** 即使字体是内嵌的 data: 也丢，正文不加载楼内自带的字体。截图 / 沙箱里的 HTML 不受影响。
- **识别规则的边界：** 原文里模型自己写了 HTML 时，同一楼里正则加的美化盒子也会被框起来。按"这一楼有没有模型写的 HTML"来分，是我定的规则：简单，和 ST 的观感最接近。你要是希望换个分法，告诉我。
- **一些动画名不改：** 名字是带引号的字符串时，`animation` 里的引用不会跟着改名，动画就不播。社区写法基本都是普通名字。

## 给下一个人的话

- **T74：** M7 还剩 T74（复查 + 0.3.0）。T75 的改动请一并写进 CHANGELOG："正则改写的 HTML 正确框住；楼内样式动画、图标保留"。
- **两个新接口：** `cleanStyleText` 和 `cssDeclarations` 都在 core，以后要清洗或复制样式，请复用它们。
