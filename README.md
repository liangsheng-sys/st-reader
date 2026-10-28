# ST Reader · SillyTavern 聊天记录阅读器

在 SillyTavern 里像读小说一样翻阅聊天，留下批注、收藏喜欢的候选回复，再把选段或 HTML 小剧场做成脱敏图片。

**聊天只读，完整源码公开，不收集任何信息。** HTML 阅读和截图默认允许使用聊天内容里的外链素材，具体请求来源与关闭方法见下方[第三方域名披露](#第三方域名披露)。

## 能做什么

- **阅读单聊和群聊**：从“最近 / 按角色 / 收藏 / 当前聊天”进入，分页或滚动阅读；调整字号、行距、正文宽度，隐藏用户楼层。
- **看候选回复与思维链**：在楼内切换 swipe；思维链默认折叠，也可隐藏整行。退出阅读器后，ST 原聊天的候选选择不变。
- **沿用已有美化**：接入 ST 主题、自定义 CSS、显示正则和 Ny-font-manager 字体；代码块支持高亮与复制。
- **划线、批注与收藏**：收藏整个聊天，也可收藏某楼或某个 swipe；批注列表可跳转。支持导出、导入阅读器自己的 JSON 备份。
- **制作分享卡片**：跨楼选段、主题样式与多套模板、名字替换、自己的替换规则和屏蔽词；文字背景、遮盖颜色与宽度可调，导出 PNG。
- **脱敏阅读**：用“脱敏显示”开关直接在阅读器里显示替换结果，只改变显示副本。
- **阅读 HTML 小剧场**：在“渲染 / 原文”之间切换，选择手机、平板、桌面或跟随正文的宽度；支持普通 HTML/CSS/JavaScript 交互，无需安装酒馆助手。
- **分享 HTML 画面**：截图默认取当前结局和滚动位置，也可切换初始画面、展开长图；默认 2 倍清晰度，可选 1 倍或 3 倍，在预览中自由框选。支持屏蔽词、替换规则和“复制脱敏版”代码。

## 安装与打开

需要可正常安装第三方扩展的 SillyTavern。扩展声明最低版本 **1.13.0**，主要在 **ST 1.14.0、桌面 Chrome** 上验证；手机布局可用，其他版本和浏览器的表现可能不同。

**曾用目录联接安装的人，先双击 `install/unlink-from-my-st.cmd` 再用 URL 安装，两份并存会加载旧副本。** 正式使用只保留 URL 安装的一份，开发联接与正式安装二选一。

1. 打开 ST 顶部的 **扩展 / Extensions** 面板。
2. 点 **安装扩展 / Install extension**，粘贴下面的仓库地址，分支留空。

   ```text
   https://github.com/liangsheng-sys/st-reader
   ```

3. 按 ST 提示安装，完成后刷新页面。无需下载 ZIP、安装 npm 依赖或运行构建。
4. 点顶部的**书本图标**，或在魔杖菜单里点 **阅读器**；也可输入 `/reader`。

这使用 ST 的标准扩展安装入口，见 [ST 官方扩展说明](https://docs.sillytavern.app/extensions/)。通过开发目录联接使用本项目的人，请参照 [Windows 手册](docs/SETUP_WINDOWS.md)，不要重复安装两份。

更新时打开 **扩展 → 管理扩展 / Manage extensions**，等待检查完成，找到 **阅读器 (ST Reader)**，点更新按钮（有更新时显示的下载箭头），完成后刷新页面。没有更新按钮通常表示已是当前分支的最新提交；更新功能由 ST 管理。

## 怎么用

请看 **[使用说明](docs/使用说明.md)**：怎么打开、怎么读、划线批注收藏、分享卡片与脱敏、HTML 小剧场、设置与备份、常见问题，每个功能在哪里点、会发生什么。

装好以后，阅读器里也能随时打开它：右下角 **Aa** → **⋯** → **使用说明**。

## 只读与隐私

ST Reader 不保存、编辑、删除、导入或重命名聊天文件，不修改 ST 当前聊天的候选序号和元信息，也不替你调用模型生成内容。阅读器中的候选切换、脱敏、截图处理都作用于显示副本。

阅读器打开时会临时静音聊天里由消息自带的样式，关闭即恢复，不改聊天。

**ST Reader 不向作者或统计服务收集、上传任何信息**，没有遥测、广告、统计服务或云端账户。批注、收藏、阅读设置、屏蔽词、替换规则及小图片素材先存在当前浏览器的阅读器独立存储（IndexedDB）里；**每次改动后约 3 秒，阅读器会把这份数据自动备份到你自己 ST 的 `data/<用户>/user/files/st-reader-backup.json`**——用的是 ST 自带的文件接口，不在 chats 目录，不碰聊天。每天另存一份 `st-reader-backup-YYYYMMDD.json`，只留最近 7 份，多出的只删这些阅读器自己命名的文件。清了站点数据或换了浏览器，下次打开 ST 会自动从这份备份合并回来并提示“已从 ST 服务器恢复……”；合并时同一条以较新的为准，不删你现有的。上次备份的时间和大小在 **Aa → 更多设置 → 备份**，那里也有“立即备份”“从服务器恢复”。“已读版本”“更新后提醒”这类小开关存在 ST 自己的扩展设置里（随 ST 的 settings.json 保存）。没有第三方云：想异地保存，请自己备份 ST 的 data 目录。手动导出的 JSON 和 PNG 由你保管；导入只恢复阅读器数据，不导入聊天文件。

同一次页面会话内，最近 3 个聊天的正文与已读页会留在内存中，按估算占用限制在 150 MB 内，超限淘汰旧缓存。读取聊天列表时会预取当前聊天的第一页；ST 的接口需要一次读取该聊天全文，但只提前构建第一页。重开命中缓存时：如果它就是 ST 当前打开的聊天，直接和 ST 内存里的聊天比对，有变化就重新读取（不额外请求）；其他聊天先显示已有内容，同时在后台检查一次文件摘要，发现变化会在顶部提示“此聊天有新内容”，不会自动替换正在看的正文。阅读器还会只读地监听 ST 的发消息、编辑、删除、换候选、切换聊天等事件，一有变化就丢掉对应聊天的缓存。顶栏的“重新读取”按钮随时可以重读一遍。**正文缓存不写入 IndexedDB，刷新页面即清空**；关闭阅读器仍会保留限额内的缓存。

## 第三方域名披露

**扩展没有 CDN、统计或代理服务。** 获取聊天只使用你正在访问的 ST 服务；检查更新和更新由 ST 访问 GitHub 获取扩展代码。阅读及截图期间，额外的外部请求来源是**你聊天里模型生成或你提供的 HTML**；HTML 可以引用外部图片、字体、样式、脚本，也可能由其中的脚本发起 HTTPS 请求。域名随内容变化，无法列成固定白名单。

| 场景 | 请求来源与默认行为 | 如何关闭 |
|---|---|---|
| HTML 阅读 | 默认允许 HTML 使用 HTTPS 外链；地址来自该段 HTML 及其引用的资源或脚本 | **Aa → 更多设置 → HTML → 允许外链** 关闭全部；也可点某个 HTML 块的网络按钮，只对这一块断网 |
| HTML 截图 | 默认带上 HTML 引用的图片、字体、CSS；该块已断网时继承关闭状态。按网站许可读取并内嵌素材，不重跑交互脚本 | 截图窗口关闭 **带上外链素材** |
| 正文美化的背景图 | 正则美化等写在正文样式里的 HTTPS 背景图，按 ST 自己的"禁止外部媒体"设置（及对每个角色的允许 / 禁止）决定是否显示；ST 禁止时阅读器也不加载。分享卡片导出时，已显示的背景图按网站许可读取并嵌进 PNG，读不到的用斜纹占位并提示 | 在 ST 的用户设置里勾选 **禁止外部媒体**（或对某个角色单独禁止） |
| 安装与更新 | ST/Git 按你填写的仓库 URL 访问 **github.com** 获取公开代码；这属于扩展安装与更新 | 是否安装、何时手动更新由你和 ST 的更新设置决定 |
| 检查更新 / 更新 | **ST 访问 github.com**，通过 ST 内置接口对阅读器自身目录执行 Git fetch / pull，不上传聊天或批注 | 不点击检查或更新即可；开发目录不可更新 |

资源网站会接收到正常网络请求；这不代表 ST Reader 在收集信息。截图读取跨站素材不带第三方登录凭据，不使用后端代理。某些网站不允许浏览器跨域读取，素材便无法进入 PNG，窗口会提示，其他内容仍可导出。阅读器内的外链开关只控制阅读器，不修改 ST 主聊天或其他扩展的联网行为。

## 当前边界

- 普通 HTML 小剧场可以交互；依赖酒馆助手专有 API、变量或其他扩展运行环境的代码不保证可用。
- HTML 截图保存可见画面的静态副本，不保存游戏程序或任意网页的全部运行状态；不支持的画布、Shadow DOM 等会提示或无法完整还原。
- 脱敏不做图片文字识别，也不修改 HTML 属性、CSS 或脚本内容。已脱敏的当前画面不会再重复套用替换规则；脚本后来新增的文字需要用屏蔽词处理。分享前请检查预览。
- 大聊天采用分批显示，滚动已按需排版；约 50 MB 的合成聊天首次打开仍可能超过 3 秒，瓶颈在 ST 服务器读文件与浏览器解析。从没进过屏幕的楼按估计高度占位，滚动条位置在滚过一遍前是估计值。
- 当前聊天打开时与 ST 内存比对，非当前聊天命中缓存时在后台核对文件摘要；摘要无法识别大小、最后消息日期和楼数都没变的原地改字，顶栏"重新读取"或刷新页面可强制重读。
- 批注和收藏保存在本机浏览器，并自动备份到你自己 ST 的用户文件区；不经第三方云，不跨不同 ST 实例同步。
- TauriTavern 据社区反馈可用，作者未在 TT 上测试。
- 正文内联 SVG 可显示，但其中的 `<image>`、外链 `<use>`、脚本与 `foreignObject` 一律去掉；SVG 滤镜不进分享卡片。

## 致谢

以下项目均为**思路参考，未复制代码**，感谢作者公开分享：

- [st-viewer](https://github.com/protain233/st-viewer)
- [SillyTavern-ChatVault](https://github.com/shanye5593/SillyTavern-ChatVault)
- [SillyTavern-Immersive-Reading](https://github.com/vexory/SillyTavern-Immersive-Reading)
- [st-adhd-reader](https://github.com/9rgrz765s6-sys/st-adhd-reader)
- [酒馆助手](https://n0vi028.github.io/JS-Slash-Runner-Doc/)
- [Ny-font-manager](https://github.com/Naya1-1/Ny-font-manager)

运行时使用 ST 提供的库；PNG 导出使用随扩展分发的 **modern-screenshot**，其代码按 MIT 许可保留。实际第三方依赖与许可见 [许可记录](docs/LICENSES.md)；以上“未复制代码”指六个参考项目。

## 许可与更多资料

项目采用 **[AGPL-3.0](LICENSE)**，完整源码在本仓库公开；第三方依赖保留各自许可。

- [更新日志](CHANGELOG.md)
- [作者发布指南](docs/发布指南.md)
- [开发与 Windows 联接说明](docs/SETUP_WINDOWS.md)
- [开发检查](dev/README.md) · [协作入口](docs/00_README_FOR_AI.md)

## English

ST Reader is a read-only SillyTavern extension for browsing chats, switching between response variants, annotating passages, bookmarking conversations, and exporting redacted PNG cards or HTML snapshots. It reuses your ST theme, display regexes, and supported local fonts. Chat files stay unchanged; reader data is stored in the browser and automatically backed up to your own ST user folder (`data/<user>/user/files/`, not the chats folder), with no telemetry, third-party cloud, or information collection by the extension. User-provided HTML may load external resources by default, including assets for screenshots; you can turn this off. Install the repository URL through **Extensions → Install extension**. Source code is public under **AGPL-3.0**.
