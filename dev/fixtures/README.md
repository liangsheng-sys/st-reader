# T11 合成样本

T30：`dev/generate-performance.cmd` 单独生成 `STCR-95-T30-50MiB-4000楼`（55987114字节），必须先停服务，不重建其他样本。`selftest.mjs` 同时验证其大小、SHA-256和4000楼逐行JSON。

I013：宿主正常保存角色卡会补字段、重编码PNG或改变默认chat。自测改为PNG块CRC与chara/ccv3关键JSON字段（姓名、描述、创建者、角色版本、合成标记、作用域正则），不再用PNG大小/哈希判定漂移。所有聊天以及其他清单文件仍严格检查原大小与SHA-256；改名字或删正则仍会失败，无需每次正常浏览后重建fixture。

所有角色、头像、故事、思维链字段从代码生成，未使用真实聊天。生成器仅用 Node 内置模块，固定写入 `E:\st-reader\.dev\data`。先运行 T10 启动器初始化并停止服务，再双击 `dev/generate-fixtures.cmd`。Ny 兼容扩展与测试字体另由 `dev/install-test-font.cmd` 安装；详细点击步骤见 `docs/SETUP_WINDOWS.md` 的 §2.1。

| 样本 | 内容与预期 |
|---|---|
| 星灯（虚构） / STCR-01-正则与多候选 | 12 楼；第 5、9、11 楼分别有 3、4、5 个候选，各有独立日期、思维链和时长；最后一楼当前候选为 3/5。T62：第 1–3 楼 `is_system:true`（被 ST 隐藏过、名字与候选不变，其中第 1 楼 3 个候选），用来回归"隐藏楼不再当场旁白" |
| 纸舟（虚构） / STCR-02-代码与长文 | 11 楼；前 6 楼保留 JavaScript、Python、CSS、HTML / q / 表格、两万字长楼、思维链边界；第 7 楼是裸 HTML 手机聊天，第 8 楼是围栏 HTML 网页游戏；T51 第 9 楼为场景标题 + 大段带 style 的 HTML + 尾声，第 10 楼为散文间隔的两段 HTML |
| 雾岚（虚构） / STCR-03-普通阅读 | 普通短聊天，含不会命中星灯作用域的标记 |
| 雾岚（虚构） / STCR-90-大文件-1600楼 | 1600 楼，约 21.35 MiB；流式生成与校验，不把全部文本拼进内存 |
| STCR · 雾岛观测队（虚构） | 三位成员，4 楼；group.id=`stcr-t11-island`，chat_id=`stcr-t11-island-chat`；群聊文件无 header |
| STCR T11 · 雾岛纸页 | 深青背景、薄荷色正文边线、金色引号；包含题目要求的两个 #chat 选择器与 !important |

全局正则均为显示类：`【一次】` 每次附加一个 ✓（可发现二次执行），`【称呼】` 展开 `{{char}}` / `{{user}}`，`【近景】` 仅在深度 0–2 变成“近景命中”，`【思考标记】` 在思维链变成“思考命中”；另有一条禁用脚本作反例。星灯的 `【星灯暗号】` 由角色作用域脚本替换，avatar 已加入 `character_allowed_regex`。

重复运行只重建这些 STCR 样本、更新对应正则/允许名单并重新应用主题；不删除其他开发文件。开发服务占用 8100 时拒绝运行。每个生成文件的字节数与 SHA-256 写入 `.dev/fixtures/manifest.json`，`node dev/selftest.mjs` 会流式核验；浏览器只读自检见操作手册。

`dependencies.lock.json` 逐文件锁定官方仓库提交、Git blob 校验值和大小；下载器限制单文件小于 5 MB，不用 npm，不创建 node_modules，不用临时下载目录。已安装文件必须匹配校验值，否则停止且保留现有文件。许可证见 `docs/LICENSES.md`。Ny 只装在开发数据目录，不打包进阅读器。

字体必须由每个验收浏览器分别导入。使用 `http://localhost:8100` 保持同源；`127.0.0.1` 是另一份浏览器数据库。T11 验证 IndexedDB、FontFace 与宿主正文应用，T14 再验证 PNG 字形。

T72 第 11 楼是 `COMMUNITY_HTML`（散文 + 三个 details + 渐变胶囊样式盒 + 带 `<style>` 的状态栏 + `<selection>` + 小剧场 details），两个候选；第 2 个候选开头带 `RENDER_FAULT_MARK`，只在开发实例（8100）里故意走“原样显示”，用于人工验收。既有实例停服后再跑一次 `append-html.mjs` 即追加（脚本接受 6/8/10/11/12 楼版本）。

T75 第 13、14 楼是 `DISPLAY_TEXTS`，配三条 `stcr-t75-` 全局显示正则（`DISPLAY_REGEX`）：
- 第 13 楼：散文 + 模型写的 `<style>` + `<div class="harbor-log">`（正则改成 `<section>`）+ 散文 + `【观测站页面】`（正则换成一整页 `<html>…</html>`，带一个能点的"点灯"按钮）；
- 第 14 楼：纯文字 + `【灯塔状态】`，正则换成带 `@keyframes` 闪烁圆点和 `content:"\f005"` 星星的状态条。

`append-html.mjs` 接受 6/8/10/11/12/13/14 楼版本，只替换 `stcr-t73-` / `stcr-t75-` 开头的正则。

T83 第 15 楼是 `SVG_TEXT`：散文 + 多行内联 SVG 灯塔徽章（线性渐变天空、径向光晕、裁剪圆、`symbol` + `use` 星星、`tspan` 文字），外链 `use`、`script`、外链 `image` 是反例；没有 `<style>`，不会被当成 HTML 块。`append-html.mjs` 现在接受 6/8/10/11/12/13/14/15 楼版本。

T73 第 12 楼是 `BEAUTY_TEXT`：`<letter><char>…</char>…</letter>` 加 `【邮戳】【花边】【外链】` 三个记号，靠五条 `stcr-t73-` 全局显示正则（`BEAUTY_REGEX`）变成带 `<style>` 的信纸、渐变邮戳、data: 花边和一格 https 外链背景（`example.invalid`，永远取不到）。`append-html.mjs` 同时只替换 settings.json 里 `stcr-t73-` 开头的正则，不动 `stcr-t11-` 那五条。**停服改 settings.json 之前，先关掉或刷新所有打开着 8100 的页面**：旧页面会在窗口缩放时把它内存里的旧设置存回去（ST 自己的 `/api/settings/save`，只读保护不拦）。

T44a 与 T51 的四楼在 `html.mjs`，全部从零编造；手机样本含 `.invalid` 域名的外链 CSS/字体，用于断网验证。游戏有两件物品和不同文字结局，不调用宿主或任何服务。T51 的观测站不设 body 底色，蓝邮局显式设 body 底色；两个混排样本没有外链。新生成的 fixture 自动包含四楼；既有实例应停服后执行 `node dev/fixtures/append-html.mjs`，只追加纸舟末尾并更新该条 SHA-256，不动已存在楼层、其他聊天、角色或设置。脚本只接受已知的 6/8/10 楼版本，不相等时拒绝覆盖；重复运行不会重复追加。本次工程师已完成追加，人类无需重建样本。T51 core 的可视验收入口为开发控制台 `await stcrHtmlBoundaryDemo()`；正式阅读器混排接线由 Opus 完成（I038）。
