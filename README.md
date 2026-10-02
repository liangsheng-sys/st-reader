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

**ST Reader 不向作者或统计服务收集、上传任何信息**，没有遥测、广告、统计服务或云端账户。批注、收藏、阅读设置、屏蔽词、替换规则及小图片素材保存在当前浏览器的阅读器独立存储中；手动导出的 JSON 和 PNG 由你保管。清理站点数据、换浏览器或换访问地址前，可在 **Aa → 更多设置 → 导出我的批注与收藏** 备份；导入只恢复阅读器数据，不导入聊天文件。

## 第三方域名披露

**扩展没有 CDN、统计或代理服务。** 获取聊天只使用你正在访问的 ST 服务；检查更新和更新由 ST 访问 GitHub 获取扩展代码。阅读及截图期间，额外的外部请求来源是**你聊天里模型生成或你提供的 HTML**；HTML 可以引用外部图片、字体、样式、脚本，也可能由其中的脚本发起 HTTPS 请求。域名随内容变化，无法列成固定白名单。

| 场景 | 请求来源与默认行为 | 如何关闭 |
|---|---|---|
| HTML 阅读 | 默认允许 HTML 使用 HTTPS 外链；地址来自该段 HTML 及其引用的资源或脚本 | **Aa → 更多设置 → HTML → 允许外链** 关闭全部；也可点某个 HTML 块的网络按钮，只对这一块断网 |
| HTML 截图 | 默认带上 HTML 引用的图片、字体、CSS；该块已断网时继承关闭状态。按网站许可读取并内嵌素材，不重跑交互脚本 | 截图窗口关闭 **带上外链素材** |
| 安装与更新 | ST/Git 按你填写的仓库 URL 访问 **github.com** 获取公开代码；这属于扩展安装与更新 | 是否安装、何时手动更新由你和 ST 的更新设置决定 |
| 检查更新 / 更新 | **ST 访问 github.com**，通过 ST 内置接口对阅读器自身目录执行 Git fetch / pull，不上传聊天或批注 | 不点击检查或更新即可；开发目录不可更新 |

资源网站会接收到正常网络请求；这不代表 ST Reader 在收集信息。截图读取跨站素材不带第三方登录凭据，不使用后端代理。某些网站不允许浏览器跨域读取，素材便无法进入 PNG，窗口会提示，其他内容仍可导出。阅读器内的外链开关只控制阅读器，不修改 ST 主聊天或其他扩展的联网行为。

## 当前边界

- 普通 HTML 小剧场可以交互；依赖酒馆助手专有 API、变量或其他扩展运行环境的代码不保证可用。
- HTML 截图保存可见画面的静态副本，不保存游戏程序或任意网页的全部运行状态；不支持的画布、Shadow DOM 等会提示或无法完整还原。
- 脱敏不做图片文字识别，也不修改 HTML 属性、CSS 或脚本内容。已脱敏的当前画面不会再重复套用替换规则；脚本后来新增的文字需要用屏蔽词处理。分享前请检查预览。
- 大聊天采用分批显示；约 50 MB 的合成聊天已做测试，但首次打开仍可能超过 3 秒，尚不承诺在所有环境稳定达标。
- 批注和收藏保存在本机浏览器，不自动跨设备同步。

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

ST Reader is a read-only SillyTavern extension for browsing chats, switching between response variants, annotating passages, bookmarking conversations, and exporting redacted PNG cards or HTML snapshots. It reuses your ST theme, display regexes, and supported local fonts. Chat files stay unchanged; reader data is stored locally, with no telemetry or information collection by the extension. User-provided HTML may load external resources by default, including assets for screenshots; you can turn this off. Install the repository URL through **Extensions → Install extension**. Source code is public under **AGPL-3.0**.
