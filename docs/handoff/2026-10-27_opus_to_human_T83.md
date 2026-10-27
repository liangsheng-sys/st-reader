# T83 交接：正文里的内联 SVG 能显示，分享卡片 PNG 里也看得到

## 做了什么
- **正文显示 SVG**：以前模型在正文里写一段 `<svg>`（图标、徽章、带渐变的小图），阅读器里只剩一个空框。原因有三个：
  1. SVG 写成多行时，Markdown 转换往里面插了换行标签，SVG 一下子就碎了，里面的东西全丢；
  2. 为了防止和 ST 的页面冲突，所有 `id` 都被删了，渐变、裁剪、蒙版找不到目标，颜色全没；
  3. `<use>`（复用同一个形状，比如画几颗一样的星星）被整个删掉。
- **现在**：
  - 整块 SVG 在 Markdown 转换前先"收起来"，转完再放回去，多行、带缩进都不会碎。代码块里的 SVG 照旧当文字显示。
  - SVG 里的 `id` 统一改成 `stcr-svg-<一串编号>-原名`，渐变、裁剪、蒙版的引用跟着改。不会和 ST 的页面撞名，两楼里同名的 id 也不会串。
  - `<use>` 只认本块里自己定义的形状。
- **安全规则不放松**：
  - 外链的 `<use>`、外链图片、外链链接、`script`、事件属性（`onload` 等）、`foreignObject`、动画元素，照旧全部去掉；
  - 样式里指向外面的 `url()` 换成 `none`。阅读器不会因为 SVG 多发任何网络请求。
- **分享卡片**：以前选中的文字里只要有 SVG，导出就报错"请先把内联 SVG 作为已清洗素材导入"，整张卡都导不出来。现在 SVG 按同一份白名单复制进卡片，PNG 里看得到。
- **屏蔽词落在 SVG 文字里**：SVG 里画不出平时那种涂黑条，词会直接消失、留个空洞。现在换成等长的实心方块字 `█`。
  - 阅读器的脱敏显示和卡片都是这样；替换规则直接换成替换文字。
  - 原词照旧删掉、看不出来。
- **样本**：纸舟（虚构）/ STCR-02 加了**第 15 楼**，散文中间一枚多行 SVG 灯塔徽章，用到：
  - 深蓝到橘色的渐变天空、灯顶光晕；
  - 圆形裁剪、三颗用 `<use>` 复用的星星、底部文字；
  - 三个必须被拦掉的反例：外链 `use`、`script`、外链图片。
  - 已经追加进 8100 的开发数据，不用重建样本。

## 改动文件
- core（见下表）：`src/core/formatter.js`、`src/core/cardSnapshot.js`、`src/core/cardContent.js`
- 界面：`src/ui/redact.js`（脱敏显示在 SVG 里用方块字）
- 样本：
  - `dev/fixtures/data.mjs`（第 15 楼 `SVG_TEXT`）；
  - `dev/fixtures/append-html.mjs`（多认一个"14 楼"的已知版本）；
  - `dev/fixtures/selftest.mjs`（新增 1 项，纸舟楼数 14 → 15）；
  - `dev/fixtures/README.md`。
- 测试：
  - `src/core/coreBrowser.test.js`：新增 2 项；
  - `src/core/cardExportBrowser.test.js`：新增 1 项。
- 文档：
  - `docs/03_TECH_SPEC.md` §5.13：新增"T83 增补"一段；
  - `docs/02_UI_SPEC.md`：新 §9.14；
  - `docs/04_TASKS.md`：T83 改为"待验收"。

## core 改动（D32）
| 文件 | 改了什么 | 合同 |
|---|---|---|
| `src/core/formatter.js` | Markdown 前把整块 `<svg>` 换成占位符，转完放回；DOMPurify 多放行 `use`；新函数 `scopeInlineSvg`：SVG 内 id 加 `stcr-svg-<内容哈希>-` 前缀、`url(#…)` 跟着改、别的 `url()` 换 `none`、`<use>` 只留本块 `#id`、删 `<image>` / `<feImage>`；SVG 外的 id 照旧删；`filterCssUrls` 多放行 `url(#stcr-svg-…)` | 只增：没有 SVG 的楼输出逐字不变（原有测试全过）；03 §5.13 新增"T83 增补" |
| `src/core/cardSnapshot.js` | 卡片副本遇到 SVG 不再抛错，按白名单重建；属性去事件 / `data-*` / `xmlns*`，`href` 只给 `<use>` 留本卡 `#stcr-svg-*`，`url()` 只留本卡存在的 `#id` | 只增：原来会失败的输入现在能导出；其他非 HTML 命名空间（MathML）仍抛错，报错文字换成更准确的说法 |
| `src/core/cardContent.js` | `maskTextNodesInPlace`：屏蔽词在 SVG `<text>` 里时插入等长 `█` 文字，不插 HTML 遮盖块 | 只增：SVG 以外不变 |
| `src/core/coreBrowser.test.js`、`src/core/cardExportBrowser.test.js` | 新增 3 项测试 | — |
| `docs/03_TECH_SPEC.md` §5.13 | 新增"T83 增补"一段，没改任何旧句子 | 只增 |

`readonlyGuard.js` 名单和 `audit-readonly.mjs` 都没动。

## 人类验收步骤

在 **8100** 上验收：
1. 双击 `dev\start-dev-st.cmd`，等出现 listening。
2. 用平常的浏览器打开 `http://localhost:8100`。之前开着 8100 的页面，请先**刷新一次**。

**A. 正文里看到徽章**
1. 打开阅读器，左边抽屉找 **纸舟（虚构）** → **STCR-02-代码与长文**，滚到最后一楼（第 15 楼）。
2. 应该看到"纸舟从口袋里摸出一枚小小的灯塔徽章"，下面一枚圆形徽章：
   - 天空从深蓝渐变到橘色；
   - 灯塔顶上一团淡黄的光晕；
   - 天上三颗小星星（左上角那颗很小）；
   - 外圈一道金边，底部写着"纸港灯塔 · 虚构"。
3. 徽章不应该被一个框框起来（它不是 HTML 网页块），上下的文字照常是正文。

**B. 卡片 PNG 里也有**
1. 在第 15 楼从"纸舟从口袋里"一直选到最后一句"……这枚徽章。）"，点浮出来的 **卡片**。
2. 工作台预览里能看到徽章。点 **导出 PNG**。
3. 打开下载的 PNG：徽章、渐变、星星、金边都在。

**C. 屏蔽词遮住徽章上的字**
1. 在工作台右边"屏蔽词"里加一个 **纸港**。
2. 预览里徽章底部变成 **██灯塔 · 虚构**，正文里的字照常是涂黑条。导出 PNG 也一样。
3. 验完把"纸港"删掉。

## 只读自查
- `rg --no-ignore -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src vendor style.css`：
  - 只有 `readonlyGuard.js` 第 4–10 行（禁用名单本身）和 `htmlSnapshot.test.js:12`（"必须拒绝"的测试输入），和上次相同。
- `node dev/audit-readonly.mjs` → 静态边界检查通过。
- 新增代码没有网络请求，也没有写聊天或 ST 设置的调用。SVG 的外链全部在显示前去掉；卡片导出仍有"离线闸门"，截图库想联网就直接报错。
- 样本只追加了 `.dev` 里纸舟这一条聊天和它的校验清单，用的是已有的 `append-html.mjs`，没有动别的聊天、角色或设置。
- 是否读写过 F:\Claude\xinllm\SillyTavern\data：否。

## 自测
- `node dev/selftest.mjs` → 全部通过（193 项，新增 1 项：第 15 楼样本内容）。
- `node src/ui/ui.test.js` → 全部通过（41 项）。
- 浏览器新增 3 项，都过了：
  - "T83 内联 SVG"：用合成的两块多行 SVG 测——不被 Markdown 拆开；4 个 id 都加了前缀且互不相撞；渐变引用跟着改；本块 `use` 留下、外链 / 指空的删掉；指空和外链的 `url()` 变 `none`；没有脚本、`foreignObject`、`<image>`、外链；行内代码里的 SVG 还是文字。
  - "T83 纸舟第 15 楼徽章"：渐变、光晕、裁剪、星星都在，每个引用都找得到目标，反例都去掉了。
  - "T83 内联 SVG 进卡片 PNG"：真导出第 15 楼，PNG 里数到金边和橘色天空的像素；屏蔽"纸港"后，徽章文字是 `██灯塔`，SVG 里没有 HTML 元素，正文的屏蔽词照旧是遮盖块。
  - 对照：把格式化器换回 main 原样，前两项失败（"SVG 被 Markdown 拆开或丢了子元素""徽章元素不全"），说明测试真能抓到问题。
- 中途发现并修了一个坑：卡片导出会把绑定原文的楼重新格式化一遍。格式化器留下的空 `<image>` 让截图库去取空地址，被离线闸门拦下，报"卡片存在无法离线读取的资源"。现在格式化器直接删掉 `<image>`。
- 脱敏显示：在浏览器里对 SVG 文字跑 `redactElement`，屏蔽"纸港"、把"灯塔"替换成"某塔"，显示 `██某塔 · 虚构`，正文段落 `██的某塔`。原词留在隐藏的 `<tspan>` 里，SVG 里没有 HTML 元素。
- `dev\test-release.cmd`（最终代码）跑了三次，第三次 **T57 OK**：
  - 自动备份回归通过；浏览器完整自测 **259 项全过**（含新加的 3 项）；界面浏览器测试 **78 项全过**；只读审计通过；缓存首屏 186 / 170 / 89 ms。
  - 前两次各卡在一项和计时有关、T80–T82 也遇到过、main 原样也时过时不过的测试上：
    - 第一次："21 MB 缓存命中首屏 < 300 ms"（333 / 282 / 313 ms）。当时 CPU 占用 90%（Edge 约一个整核，Windows 搜索索引也在跑），冷启动打开大文件用了 7.7 秒。其余 259 + 78 项都过了。
    - 第二次：I032"滚动区还原……下半部颜色"（core 截图沙箱的测试，不走正文格式化器）。
  - 这两项都和 SVG 无关：没有 SVG 的楼，格式化器只多了一次"找 `<svg`"的正则匹配。
- 数据：
  - 跑测试前把 8100 的 `settings.json` 和三份阅读器备份文件**复制**到 `.tmp/t83-keep/`；
  - 每轮发布测试前停服，逐个拷回，md5 和复制件一致；
  - ST 测试期间自己生成的 `backups/settings_*` 已删。

## 已知问题 / 没做的
- SVG 里的**滤镜**（模糊、阴影等 `filter` / `fe*`）在正文里能显示，但不进卡片（卡片白名单只有任务卡列的那些，外加 `ellipse`）。卡片里引用被删掉的滤镜时，那个形状照常画、只是没有滤镜效果。
- SVG 里的 `<image>` 一律删掉（地址本来就不允许，留着也是空的）。想在 SVG 里放图，目前做不到。
- 批注的小图标（划线末尾那个）如果正好落在 SVG 文字里，显示不出来。划线本身的颜色用的是浏览器高亮，不受影响。
- SVG 里的文字用"选中 → 卡片"可以选进卡片，但很难只选 SVG 里的一部分字。这是浏览器对 SVG 文字选择的限制。

## 给下一个人的话
- 正文 SVG 的安全处理全在 `formatter.js` 的 `scopeInlineSvg`，卡片那边是 `cardSnapshot.js` 的 `SVG_TAGS` + `copySvgAttributes`。两边白名单要一起改。
- 卡片导出时，绑定原文的楼会再走一遍格式化器（`renderCardParts`），结果不经过 `cardSnapshot` 的白名单。所以格式化器里一定不能留下会联网的元素。
- 往 SVG 文字里插东西要用 SVG 命名空间的元素（`tspan`），插 HTML 的 `span` 画不出来。
