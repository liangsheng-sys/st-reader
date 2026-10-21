# 03 · 技术规格

维护者：astra。§1–§4 由规划者起草并已核实；§5 接口由 astra 在 T12 补全并保持最新，Opus 只依赖 §5。

## §1 宿主环境（2026-09-28 已核实）
- 目标 ST 版本 **1.14.0**（用户真实实例 `F:\Claude\xinllm\SillyTavern`）。`minimum_client_version` 设 1.13.0。
- 扩展加载位置：`data/<user>/extensions/<name>/`（酒馆助手就装在这里）或 `public/scripts/extensions/third-party/`。`manifest.json` 支持 `hooks.activate`。
- `SillyTavern.getContext()` 可用项（节选）：`chat, characters, groups, name1, name2, characterId, groupId, chatId, chatMetadata, extensionSettings, powerUserSettings, eventSource, event_types, messageFormatting, substituteParams, getThumbnailUrl, openCharacterChat, openGroupChat, getCurrentChatId, getRequestHeaders, renderExtensionTemplateAsync, Popup, callGenericPopup, isMobile, saveSettingsDebounced, parseReasoningFromString, t`。
- `SillyTavern.libs`：`lodash, Fuse, DOMPurify, hljs, localforage, Handlebars, moment, showdown, yaml` 等。
- 允许接口：以下聊天 / 角色 / 群组 API 为只读（均 POST，带 `getRequestHeaders()`）：
  - `/api/chats/recent` `{pinned:[], max, metadata}` → `ChatInfo[]`（含 `avatar` 或 `group`）
  - `/api/characters/chats` `{avatar_url, simple?}` → 该角色的聊天列表
  - `/api/chats/get` `{avatar_url, file_name}` → `[header, ...messages]`
  - `/api/chats/group/get` `{id: group.chat_id}` → `messages[]`（没有独立 header）
  - `/api/chats/search` `{query, avatar_url, group_id}` → `[{file_name, file_size, message_count, last_mes, preview_message}]`
  - `/api/characters/all` → 角色列表（ChatVault 用的就是它）
  - `/api/characters/get` `{avatar_url}` → 完整角色卡（含该角色的作用域正则）
  - `/api/groups/all` `{}` → 群组定义（成员、聊天 ID、元信息）
  - 注意：`/api/chats/get` 在角色 chat 目录不存在时会 `mkdirSync`，属于宿主行为，可接受。
- D25 允许的扩展更新接口（均 POST，带 `getRequestHeaders()`）：`/api/extensions/version` 与 `/api/extensions/update`，body 固定 `{extensionName:'st-reader', global:boolean}`，只对阅读器自身安装目录执行 Git fetch / pull，不涉及聊天。它们会由 ST 访问仓库远端 github.com；不是聊天只读 API，亦不扩展到任意扩展目录。用户目录优先，仅 404 才试全局目录；更新只用检查确认的那个位置。
- 版本与日志允许 GET 自身同源 `manifest.json` / `CHANGELOG.md`，禁重定向、`cache:'no-store'`。ST 1.14.0 的 getManifests 非公开且没有 getExtensionManifest 导出，T54a 使用同源 fetch。
- **禁用**（D02）：`/api/chats/save|rename|delete|import|group/save|group/delete|group/import`，以及 context 上的 `saveChat, deleteMessage, deleteLastMessage, renameChat, clearChat, addOneMessage, updateChatMetadata, saveMetadata`。
- 服务端 CLI：`--dataRoot`、`--configPath`、`--port`、`--listen`。开发实例见 D03。
- T10 启动器：`dev/start-dev-st.cmd` → 原生 Node `start-dev-st.mjs`，首次从 `dev/config.dev.yaml` 创建被忽略的 `.dev/config.yaml`；固定 D03 数据路径，创建扩展目录联接，临时目录固定在 `.tmp/`。`--import dev/isolate-dev-st.mjs` 只在开发进程内将 `PUBLIC_DIRECTORIES.globalExtensions/backups` 指向 `.dev/`，防止管理扩展时宿主对 F 盘全局扩展执行 Git 检查（I007），不修改宿主文件。
- T51 / I039：开发预载模块还复用 ST 已安装的 Express，在开发进程内让 public 静态中间件跳过 `/scripts/extensions/third-party/`，交由 ST 后续的扩展路由从 `.dev` 用户/全局目录读取。否则宿主 public 中的旧同名副本会抢先返回，令开发联接失效。未安装依赖，未写 F 盘；运行源码与 HTTP 响应逐字节核验。
- T10 只读保护在扩展模块载入时安装（早于 `APP_READY`），仅对本机 HTTP 8100 默认启用；D02 七个路径不分 HTTP 方法拦截，抛 `StcrReadonlyError` 并记录 `console.error`。此为整个开发窗口的 fetch 断言，不替代静态审计，不覆盖 XHR 或宿主直接函数调用。只跑 13 项保护测试用 `stcrSelfTest({core:false})` 或 `?stcrSelfTest=1&core=0`。
- T11 的 Node 自检追加 8 项样本/落盘验证。浏览器 `stcrSelfTest({fixtures:true})` 共 18 项；打开星灯后附加 `{font:true, rendered:true}` 共 21 项，检查原生显示及 Ny 字体数据库/FontFace。
- T14 后 `node dev/selftest.mjs` 共 **68 项**（13 保护 + 8 样本 + 15 T12 + 14 T13 + 18 T14）；`await window.stcrSelfTest()` 共 **99 项**（此前70项 + 18 T14 纯逻辑 + 11 T14 浏览器）。先在宿主打开雾岚，使星灯未选中，关闭阅读器，并按手册导入 Ny 测试字体。网址 `?stcrSelfTest=1&coreWhenChat=1` 运行同一套检查。重跑 T13 及以前用 `{cardExport:false}`（70项）；仅 T12 用 `{persistence:false,cardExport:false}`（45项）；仅 T14 用 `{core:false,persistence:false,cardExport:true}`（42项，含13项保护）。跨页面存储实证仍为 `stcrStorageProbe('write')`，刷新后 `stcrStorageProbe('read')`。T14 没有写字体数据库；导出不发网络请求，临时 DOM finally 清理。

## §2 数据模型（ST jsonl）
- 单聊第 0 行 header：`{user_name, character_name, create_date, chat_metadata:{...}}`；群聊直接从消息开始。
- 楼层：`{name, is_user, is_system, send_date, mes, extra:{reasoning, reasoning_type, reasoning_duration, reasoning_signature?, display_text?, type?}, swipes:[string], swipe_id:number, swipe_info:[{send_date, gen_started, gen_finished, extra:{reasoning, reasoning_duration, ...}}]}`。
- 无 `swipes` 字段时视为单 swipe，正文即 `mes`。`swipe_info[i].extra.reasoning` 缺失时该 swipe 无思维链（不得回退到 `extra.reasoning`，除非 `i === swipe_id`）。
- 思维链 DOM（ST 原生）：`.mes_reasoning_details`（`<details>`）> `.mes_reasoning_summary` > `.mes_reasoning_header_title`；正文 `.mes_reasoning`。
- 群聊：没有独立 header；`/api/chats/group/get` 的 `id` 是聊天文件 ID（当前聊天为 `group.chat_id`，历史聊天为 `group.chats[]`），不是群组 ID。元信息在 `groups/<group.id>.json` 的 `chat_metadata`；成员在 `members`（avatar 文件名），消息用 `original_avatar` 标识发言角色。T11 核对 `src/endpoints/chats.js` 与 `public/scripts/group-chats.js#getGroupChat`，样本故意让 group.id 与 chat_id 不同（I008）。
- 主题：`data/<user>/themes/*.json`，字段→CSS 变量：`main_text_color→--SmartThemeBodyColor`、`italics_text_color→--SmartThemeEmColor`、`quote_text_color→--SmartThemeQuoteColor`、`blur_tint_color→--SmartThemeBlurTintColor`、`chat_tint_color→--SmartThemeChatTintColor`、`user_mes_blur_tint_color→--SmartThemeUserMesBlurTintColor`、`bot_mes_blur_tint_color→--SmartThemeBotMesBlurTintColor`、`shadow_color→--SmartThemeShadowColor`、`border_color→--SmartThemeBorderColor`、`blur_strength→--blurStrength`、`font_scale→--fontScale`、`chat_width→--sheldWidth`；`custom_css` 注入 `<style id="custom-style">`。这些都是全局变量与全局 style，阅读器容器天然继承；只有以 `#chat` 开头的选择器需要克隆（D10）。
- 正则脚本：`{id, scriptName, findRegex, replaceString, trimStrings[], placement[], disabled, markdownOnly, promptOnly, runOnEdit, substituteRegex, minDepth, maxDepth}`。`placement` 枚举：`USER_INPUT=1, AI_OUTPUT=2, SLASH_COMMAND=3, WORLD_INFO=5, REASONING=6`。全局脚本在 `extensionSettings.regex`（含 `regex_presets`）；作用域脚本在角色卡 `data.extensions.regex_scripts`，且需 `extensionSettings.character_allowed_regex` 包含该角色 avatar 才生效；预设脚本需预设名在 `preset_allowed_regex[api]`。引擎：`/scripts/extensions/regex/engine.js` 导出 `runRegexScript(script, str, {characterOverride})`、`getRegexedString`、`regex_placement`、`getRegexScripts`。

## §3 目录与模块

T40（D17/D18，2026-09-30）：仓库根即扩展，以下路径均相对 `E:\st-reader`。D04/D08/D09 的旧目录布局由 D18 取代；§5 的模块相对导入与接口均未变。ST 的扩展 URL 仍为 `/scripts/extensions/third-party/st-reader/`。

```
E:\st-reader/
  LICENSE            AGPL-3.0 全文；vendor 保留第三方许可
  manifest.json / index.js / style.css
  src/core/   (astra)
    chatSource.js     只读 API 封装；chatKey 规范；header 解析；大文件按楼分页（每页 N 楼，默认 30）
    chatCache.js      纯内存 LRU；原始数组、冻结模型与页；3 个 / 150 MB 估算限额
    messageModel.js   楼层→视图模型 {index, name, isUser, isSystem, date, swipes:[{text, reasoning, reasoningDuration}], swipeId}
    regexPipeline.js  为目标角色/群成员收集 GLOBAL/SCOPED/PRESET 显示类脚本；按该聊天算 depth；runRegexScript 逐条
    formatter.js      正则后文本 → 安全 HTML（markdown、hljs、DOMPurify）；思维链同样处理
    hostRuntime.js    缓存宿主模块加载；仅供 core 内部
    textTransforms.js 纯文本引用与字面量脱敏变换；Node/浏览器共用
    cssScope.js       克隆 #chat → #stcr_chat 规则；监听新增 style/link；主题切换重跑
    store.js          localforage 实例 'st-reader'：annotations / bookmarks / maskWords / settings / replaceRules / assets
    updateService.js  自身版本、更新状态、ST Git 更新、CHANGELOG 与已读版本；D25
    assetCodec.js     store 内部：本地小图片验证、SVG 清洗与 data URL 备份
    anchor.js         文本引用锚点 {exact, prefix, suffix} 的生成与重定位
    cardExport.js     DOM 节点 → 脱敏变换 → PNG Blob
    htmlRenderer.js   HTML 识别、交互沙箱、CSP 与高度消息；重导出静态接口
    htmlStatic.js     禁脚本静态副本、离线 PNG 与像素裁剪
    offlineCapture.js 卡片 / HTML 截图共用的禁网资源闸门
    readonlyGuard.js  开发期：包装 fetch，命中禁用接口即 throw 并 console.error
  src/ui/     (Opus)
    reader.js drawer.js floorToolbar.js selectionPopover.js cardStudio.js settingsBar.js annotationsPanel.js
    templates/*.html  Handlebars（renderExtensionTemplateAsync('third-party/st-reader/src/ui/templates', name)）
  vendor/modern-screenshot.mjs
  docs/              规格、验收与交接；docs/*.png 私有截图不入库
  dev/               start-dev-st.cmd  fixtures/gen.mjs  selftest.mjs  junction.mjs
  install/           link-to-my-st.cmd  unlink-from-my-st.cmd
```

开发联接 `.dev/data/default-user/extensions/st-reader` 与人类安装联接都指向 `E:\st-reader`。启动器只自动迁移已核对的旧开发联接；真实 ST 必须由人类先双击 unlink、再双击 link，AI 不执行。卸载只接受本仓库根或旧 `E:\st-reader\extension`，只删联接目录项。自有 `.js/.mjs` 首行是 `// ST Reader — AGPL-3.0`，`.css` 用合法 `/* ST Reader — AGPL-3.0 */`；vendor 不改。
DOM 约定（D12）：根 `#stcr_root`（`position:fixed; inset:0; z-index` 高于 ST 顶栏），正文 `#stcr_chat`，每楼 `.mes[mesid][data-swipe]`，内含 `.mes_block > .ch_name .name_text` 与 `.mes_text`，思维链 `.mes_reasoning_details`。自有类名一律 `stcr-` 前缀。

## §4 关键技术点
### 4.1 正则管线（I003）
**T12 选择策略 b，2026-09-28 在 ST 1.14.0 实测。** 可重跑证据为 `coreBrowser.test.js` 的两组策略测试；不是只读源码后推断。

| 实证项 | 策略 a：自有正则 + 临时禁用宿主正则 + messageFormatting(...,-1) | 策略 b：自有正则 + 独立 Showdown/hljs/DOMPurify |
|---|---|---|
| 宿主选雾岚，读取星灯，星灯作用域命中 | 通过 | 通过 |
| `{{user}}` / `{{char}}` 取目标聊天 header | 通过（先在脚本副本中展开） | 通过 |
| 目标 12 楼聊天早楼保留深度标记、末楼命中 | 通过 | 通过 |
| 非幂等 `【一次】` 只追加一个 ✓、禁用脚本不运行 | 通过 | 通过 |
| 每个候选自己的思维链，REASONING 正则命中 | 通过 | 通过 |
| 异常恢复 / 宿主状态 | 注入格式化异常后，禁用数组内容及引用均恢复；-1 避开源码的第 0 楼写回分支，聊天快照不变 | 不需要临时改宿主设置；聊天快照不变 |

选择 b 的理由：a 虽通过样本，但仍会读取和遍历宿主当前 `chat` 来算深度（源码 `public/script.js#messageFormatting`），并在调用期间改全局禁用列表，还可能解释用户设置中的宏。b 的数据上下文完全来自打开的目标聊天，避免这些隐含依赖。a 仅保留为开发实证入口，限制本机 8100，遇到可能含宏命令的宿主格式化设置会拒绝运行；生产 `renderMessage` 固定使用 b。

实现规则：
- 顺序为 **GLOBAL → 当前获准 PRESET → 目标角色 SCOPED**（宿主 `SCRIPT_TYPES` 的顺序）。群聊按 `original_avatar` 找发言者，缺失时只在姓名唯一匹配时回退。用户楼不借用任意群成员的作用域。
- 作用域必须在 `character_allowed_regex`；预设通过宿主 `getScriptsByType(PRESET,{allowedOnly:true})` 读取当前 API/当前预设的获准脚本，不猜历史预设。全局禁用 regex 时全部跳过。
- 按 F6，执行 markdownOnly 或 markdownOnly/promptOnly 都未勾选的脚本；仅 promptOnly 的不执行。匹配 placement、disabled、minDepth/maxDepth，深度排除 system 楼。同 ID 脚本只执行一次，候选切换每次从原文重新渲染。
- 宿主 `runRegexScript` 的 `characterOverride` 只影响部分 trim 处理，最终 replacement 调用的 `substituteParams` 没带目标名字。故先复制脚本并展开目标 user/char，查找宏支持 RAW/ESCAPED，`{{match}}` 转捕获组；不改原脚本。
- **I011：宏只读边界。** 宿主宏解释器还支持变量写入。原文、replacement、trim 有左花括号时（包括捕获组可能拼出宏）走独立 JS 正则后备执行器，保留未知宏为字面文本，绝不执行其副作用。支持数字/命名捕获、trim、普通 JS `/pattern/flags`；其余宿主宏不在此管线展开。Node 有原文、替换串、trim、捕获拼接四类反例。
- b 复用宿主 converter 的实时选项与 underscore 扩展、纯 `fixMarkdown`，实现 q 引号、排除 markdown 的字符串、隐藏名字前缀、reasoning 标签转义；hljs 处理已知语言，未知语言保留安全代码文本。DOMPurify 清洗并沿用宿主 custom- 类名前缀；文本内 style 的选择器限定 `#stcr_chat .mes_text`。
- 为 NF1/NF3，消息里的脚本、iframe、表单、宿主操作属性、资源 URL 被移除；含资源 URL/转义或全局 at-rule 的 style 不参与渲染。不加载外部媒体或执行交互 HTML（D11）。主题与 Ny 已加载的全局字体由 T13 样式克隆接入，不由消息重新下载。

### 4.2 美化命中（D10、I004）
T13 遍历 `document.styleSheets` 与 adoptedStyleSheets；只把真正的 `#chat` ID token（含等价 CSS 转义）改为 `#stcr_chat`。属性字符串、`#chatty` 不改，并列选择器只保留有关分支。追加零特异性的 `:where(#stcr_root, #stcr_root *)`，避免 `:is(#chat,.x)` 的另一分支污染原生页面。副本写入自有 `<style id="stcr-scoped-css">`，位于 head 最后；不修改宿主规则。

递归保留 `@media/@supports/@layer/@container/@scope`、嵌套选择器及声明的 `!important`，跳过跨域不可读表、禁用表及自有副本。`@font-face`、全局动画和 `:root` 变量沿用宿主。相对 `url()` 按原样式表 URL 解析；远端地址、API 地址、CSS 转义资源、image-set 及资源属性中可能间接引入 URL 的 var/attr 保守跳过（颜色、字号变量保留），避免克隆触发出站请求。跨域样式及被跳过声明可从 stats 计数看到。

MutationObserver 监听整个文档中新建/移除 style/link、style 文本、相关属性及 link load，50 ms 去抖；ST `SETTINGS_UPDATED` 同样触发。主题把 `#custom-style` 换掉/改文本后自动重跑。直接调用 CSSOM `insertRule/deleteRule/replaceSync` 或替换 adoptedStyleSheets 不一定触发 DOM 观察器：插件应发设置事件或调用 `refreshCssScope()`。只读扫描，不主动下载样式表。

**I014**：Ny 把字号/色彩等变量直接写在原生 `#chat.style`；兄弟阅读容器无法继承。T13 读取这些自定义属性的计算值，写入自有 `#stcr_chat` 规则并随变动更新；绝不写原生容器。样式自测在独立空白文档模拟变量修改，避免触发 Ny 对原生容器的观察器。

T11 锁定 Ny-font-manager 1.1.9（版本与许可证见 LICENSES）：本地文件存在 IndexedDB `nytw-fonts` / `fonts`，记录为 `{id, blob}`，由 `new FontFace(family, ArrayBuffer)` 加入 `document.fonts`，**不生成可供扫描的 `@font-face` 或 blob URL**。T14 不能仅扫描 CSS 找字体，必须验证导出包含此字体（I009）；T11 使用本地 187208 字节的 JetBrains Mono 测试拉丁字母与数字，中文由后备字体显示。

### 4.3 锚点（F7）
T13 锚点为 `{chatKey, mesIndex, swipeIndex, part, quote:{exact,prefix,suffix}, rawHash}`，`part` 区分正文和思维链。生成/匹配使用**正则后可锚定文本节点**，排除 style/script/button 与 `data-stcr-ignore-anchor`；rawHash 则来自对应候选的**正则前原文**，是 SHA-256，不存整楼副本。UTF-16 偏移与 DOM Range 一致，前后文默认各 32 码元。

先用前后文消歧，再用唯一 exact 回退；找不到或无法唯一确定分别为 `text-missing` / `ambiguous`。原文哈希变化仅作诊断，不阻止唯一文本定位。只对当前已渲染的同聊天/楼/候选/区域判断 orphan，其他目标为 unrelated，不把未加载页误判为孤立。重定位持久化 orphan，但保留原引用、批注文字与哈希；文本恢复后可从孤立区恢复。

### 4.4 卡片脱敏（F2a）
T14 在候选**原文副本**上选取不重叠的替换范围：我的规则优先于自动名字（T30/I019：但不能拆开自动名字），同级长词优先、同长按传入顺序；结果不串换。自动规则为 header 用户→user、单聊 header 角色→char、群成员按定义顺序→char1..N；未知群发言者退化为char，不冒充某个成员；同名成员按首次出现编号。`{{ user }}` 等大小写/空白变体也走此规则。名字总开关关闭时，两层替换都停用，屏蔽词仍有效。

匹配片段在**显示正则前**从原文取走，以临时不透明占位符穿过一次 `runDisplayRegex` 与既有安全格式化器，随后仅在文本节点恢复成文字/图标/图片。用户替换文字通过 textContent 放入，不能成为 HTML、宏或正则代码；替换目标被保护，既不被再次替换，也不被屏蔽词吞掉。脚本 replacement 的 user/char 宏同样先保护，避免重新插回真名。普通正文仍完整执行原正则，作用域、深度与只跑一次保持 T12 语义。**受保护片段不参与显示正则匹配**；若正则删掉、拆散占位符，或将其放入属性/style，导出明确失败，不拿未脱敏正文回退。T12 的旧纯文本函数及 renderMessage 签名没有变化。

最后在正则后的 DOM 文本节点查找屏蔽词，支持跨 em/strong/高亮 span，隔离段落/楼层边界，跳过 style/script/按钮和替换片段。删除原词后放入 `<span class="stcr-mask stcr-mask--bar|block|sticker">`；不是盖在仍存在的字上。bar 为实色直角条、block 为主题色圆角块、sticker 为3个 FA 图标或本地图片。默认统一3em宽；可关闭统一长度：DOM 适配层在修改前用 Range.getBoundingClientRect() 测实际像素宽度；无布局时按 Unicode 码点数回退为 em。导出先嵌入并加载字体再测量（T41）。遮盖元素不含原词，源属性/注释不进入截图副本。

`modern-screenshot` 固定4.7.0单文件与完整MIT许可（见 LICENSES）。副本在禁脚本、禁外网的 srcdoc 中排版，保留可读主题CSS、important、媒体/嵌套规则和伪元素，不改变宿主。仅本地 data 图片与已有可读图片的 Canvas 副本进入导出；不克隆 CSS 资源 URL、@import，禁止依赖补取资源。字体在最终副本构造后收集：用 readonly 事务读取实际使用的 Ny 本地 Blob，内嵌 data URL @font-face；字体解码失败就拒绝。FA 实心图标以宿主已加载字形离线绘制成小PNG。不加载worker，不走CDN。

I009 实证：187208字节的 Ny JetBrainsMono（兼容重复导入别名）实际嵌入PNG；把PNG的拉丁字形与同一已加载FontFace的Canvas参考比较，在允许≤1px行盒取整对齐后像素差为0，serif参考差为513267；另逐像素检查主题薄荷色边线与实心遮盖。没有把“字体名字出现在CSS里”当作完成。

导出边界：没有可读字节的普通URL字体（如ST默认Noto Sans）使用系统回退并通过console.warn / onWarning通知；需要精确字形时在Ny导入本地字体。中文是否覆盖由所导入字体决定，T11 JetBrainsMono只证明拉丁字母/数字。跨域不可读CSS、URL背景图与交互媒体不导出；不为它们发请求。宽≤8192 CSS px，高≤16384 CSS px，倍率1–3，最终≤3200万像素，本卡字体合计≤32 MiB。超限抛错，不静默裁切。

### 4.5 大文件（I005、NF2）
`/api/chats/get` 一次返回整个文件；不能整篇渲染。`chatSource` 只取被打开或当前预取的聊天，保留原始消息和紧凑深度索引，按页构造视图模型；UI 翻页时释放上一页 DOM。T53 按 D24 修订 close：只释放该句柄，最近 3 个聊天及已构建页在内存 LRU 保留，刷新即空。T12 已实测 21.35 MiB / 1600 楼；T30 新增独立 **55987114 字节 / 53.39 MiB / 4000 楼** fixture，生成器为 `dev/fixtures/performance.mjs`，不修改原 T11 卡片与聊天，数据与报告只在 `.dev/`。

`stcrSelfTest({performance:true})` 驱动真实阅读器（30楼一批、最多120楼），计时到 rAF 后绘制完成的下一任务；测3次打开、8次跨批次、20次分页翻屏、切回小聊天与关闭。`dev/test-performance.cmd` 使用已有 Chrome/Edge、独立 `.tmp` 配置、同源网络拦截和精确 JS 堆读数，主动 GC 后比较，结束清理。普通浏览器缺少主动 GC 时明确输出“内存未验证”，不能据此全勾。验收指标：打开每次 <3000ms；翻屏 P95<100ms、最慢<150ms；预取30楼一批<300ms；切小聊天**并显式清空缓存后**释放≥70%增量（T53 / D24 修订，正常缓存不视为泄漏）。实测与硬件/窗口/字体/宿主负载相关；T30 多轮有超限，**性能暂不能宣告稳定通过**，见 I020 与 T30 交接。不得挑最快一轮覆盖失败样本。

T53 内存计量：按 UTF-16 字符串、对象/字段/引用估算，原始数组、深度索引、已构建模型和不同 pageSize 的页均计费；限额为 **150,000,000 字节**，不是整页 JS 堆的硬上限。字符串共享仍保守重复计费；未渲染楼层不提前转模型。超限先淘汰最久未打开项，单项超限可以阅读但不缓存。仍在使用的句柄保有独立旧快照直到 close，不会因别的打开动作淘汰而读坏；这些活动引用及 DOM、格式化结果不属于 LRU 保留量。缓存模块不访问 store、localStorage、IndexedDB 或宿主可变数组。

T57 / D28 修订：缓存命中直接返回包含角色、群组与正文快照的句柄，首屏不等网络；首次命中或距离上次校验完成已满 60 秒时，在后台调用一次 `/api/chats/search` 比较 file_size / last_mes / 楼数（**T71 / D34 起取消 60 秒复用，见 §5.14**）。变化只通知句柄订阅者，不自动重取或替换正文。完整接口与失败、重载行为见 §5.14。宿主摘要不是精确 mtime/hash，**同大小、同末消息日期、同楼数的原地改字无法识别**；刷新或显式 reload 强制重读。

T57 性能验收用 `stcrSelfTest({cachePerformance:true})` 或 `dev/test-chat-cache.cmd`，计时从正式 openReader 调用到首屏 DOM 就绪并完成一次绘制（rAF 后下一任务）。缓存命中首屏必须 <300 ms；后台校验的完整摘要读取耗时单独记录，不计入首屏。后者另验真实页面刷新空缓存与完整浏览器回归。原 21 MB 和 53 MB 样本均保留，没有搬走大文件缩短 search 扫描；T53 旧同步计时失败记录保留在 I040。

## §5 core ↔ ui 接口（astra 在 T12 填写，Opus 只依赖这里）
**T12 合同版本 1，2026-09-28。下列已交付接口均有真实实现与可执行测试。** 后续改签名、字段语义或错误行为须登记 06 并在交接信通知 Opus。内部实证接口 `formatWithStrategy`、`loadHostRuntime`、`createChatSource` 不供 UI 依赖。

### 5.1 导入与调用签名

UI 文件位于 `src/ui/` 时从 `../core/chatSource.js`、`../core/formatter.js` 导入。列表函数与 openChat 均返回 Promise；模型、分页、渲染为同步函数。所有下标（页、楼、候选）均从 **0** 开始。

| 模块 | 已实现签名 | 返回与行为 |
|---|---|---|
| chatSource | `listCharacters(options = {})` | `Promise<CharacterSummary[]>`；返回卡片信息；列表读取同时触发当前聊天预取（见下） |
| chatSource | `listGroups(options = {})` | `Promise<GroupSummary[]>`；thumbnailUrl 使用第一个成员头像，空群为 null |
| chatSource | `listRecent(max = 30, options = {})` | `Promise<ChatSummary[]>`；max 1–200；忽略无角色/群组的临时聊天 |
| chatSource | `listByCharacter(avatarUrl, options = {})` | `Promise<ChatSummary[]>`；avatarUrl 是 PNG 文件名；无聊天目录返回 [] |
| chatSource | `listByGroup(groupId, options = {})` | `Promise<ChatSummary[]>`；groupId 是群组 ID；通过只读 search 的空查询取摘要 |
| chatSource | `getCurrentChatKey()` | `string \| null`；只读取当前角色/群组及 getCurrentChatId；欢迎页/临时聊天返回 null |
| chatSource | `makeChatKey({avatarUrl?, groupId?, fileName})` | 稳定字符串；单聊提供 avatarUrl，群聊提供 groupId；fileName 是文件 ID，不额外带存储扩展名 |
| chatSource | `parseChatKey(chatKey)` | `{isGroup, avatarUrl, groupId, fileName}`；不可直接用斜线随意拆解转义后的名字 |
| chatSource | `openChat(chatKey, {pageSize = 30, signal, reload = false} = {})` | `Promise<ChatHandle>`；pageSize 1–100，一次只取指定聊天，不切换 ST |
| chatSource | `prefetchCurrentChat({pageSize = 30, signal} = {})` | `Promise<boolean>`；有当前聊天时校验/读取并构建第一页、关闭临时句柄后返回 true；无当前聊天 false；错误抛出，由 UI 静默处理 |
| chatSource | `clearChatCache()` | 同步清空 LRU；在途旧读取不重新填回/淘汰新缓存，清空后的打开不加入旧请求；已有等待者与句柄仍可完成/读取 |
| chatSource | `getChatCacheStats()` | 冻结对象 `{entries,bytes,maxEntries,maxBytes,evictions,keys,hits,misses,invalidations,prefetches,validations,pending}`；keys 从最旧到最新，仅键与计数，无正文；pending 为当前缓存代次的在途键数，clear 不重置累计计数 |
| formatter | `initFormatter()` | `Promise<void>`；先 await，重复调用可复用；APP_READY 也会初始化 |
| formatter | `renderMessage(handle, index, swipeIndex?)` | `RenderedMessage`；省略 swipeIndex 用模型的 swipeId；从原文重跑一次完整管线 |

所有列表的 `options` 为 `{signal?: AbortSignal}`。取消时抛 `AbortError`，UI 不应弹成失败提示。冷读时，同聊天并发打开共享在途角色/摘要/正文请求（内部独立 signal）；取消单个等待者不取消其他人，最后一人取消才终止共享请求。网络错误保留原错误；HTTP/键/关闭状态使用 `StcrDataError`，`code` 为 `HTTP_<状态码>`、`INVALID_KEY`、`INVALID_RESPONSE`、`NOT_FOUND`、`CLOSED`；越界参数抛 RangeError，聊天坏行抛 TypeError。不要把错误当成空聊天。

T53 / I042：五个列表 API 都在后台预取 `getCurrentChatKey()` 的第一页，不阻塞列表，也不预取列表中其他聊天。并行列表读取合并同一次自动预取；错误静默结束。现有 UI 首次打开抽屉会读角色/群列表，因此自动接通；已画好的抽屉再次展开不调用 core，此路径仍需 Opus 在 `drawer.open()` 调用 `prefetchCurrentChat().catch(() => {})`。T57 起预取命中也遵循 D28：直接准备缓存页，后台校验，60 秒内复用结果（T71 / D34 起：当前聊天零网络比对宿主内存，不复用结果，见 §5.14）。T59 负责重展开接线；T57 未改 `src/ui/`。

### 5.2 数据类型（JSDoc）

```js
/** @typedef {{avatarUrl:string, name:string, thumbnailUrl:string}} CharacterSummary */
/** @typedef {{id:string, name:string, members:readonly string[], thumbnailUrl:string|null}} GroupSummary */
/**
 * @typedef {object} ChatSummary
 * @property {string} chatKey
 * @property {string} fileName 聊天文件 ID（例如 STCR-01-正则与多候选）
 * @property {string} title 聊天显示标题，当前就是文件 ID
 * @property {boolean} isGroup
 * @property {string|null} avatarUrl 单聊头像文件名
 * @property {string|null} groupId 群组 ID
 * @property {string|null} lastDate ISO 时间；无效为 null
 * @property {number|null} messageCount 不含单聊 header
 * @property {string} preview 原文片段，至多 240 UTF-16 码元；不是 HTML
 */
/**
 * @typedef {object} SwipeModel
 * @property {number} index
 * @property {string} text 当前候选以 mes 为准；其余以 swipes[i] 为准
 * @property {string} reasoning 无思维链为空字符串
 * @property {number|null} reasoningDuration 秒；0 有效，不要用 truthy 判断
 * @property {string|null} sendDate 优先 swipe_info[i].send_date，缺失回退楼层日期
 */
/**
 * @typedef {object} MessageModel
 * @property {number} index 原始绝对楼号；隐藏用户楼不得重新编号
 * @property {string} name
 * @property {boolean} isUser
 * @property {boolean} isSystem
 * @property {boolean} isNarrator
 * @property {string|null} date 楼层日期，ISO 或 null
 * @property {string|null} originalAvatar 群聊发言者头像文件名
 * @property {number} swipeId ST 存储的当前候选（无效时归零），UI 的小圆点依赖此值
 * @property {readonly SwipeModel[]} swipes 模型及数组均冻结，不要修改
 */
/**
 * @typedef {object} ChatHandle
 * @property {string} chatKey
 * @property {string} title
 * @property {boolean} isGroup
 * @property {{userName:string,characterName:string,createDate:string|null,metadata:object}} header
 * @property {number} total
 * @property {number} pageSize
 * @property {number} pageCount 空聊天为 0
 * @property {boolean} closed
 * @property {boolean} cacheHit 本次命中内存；不代表最新
 * @property {boolean} stale 已确认发生变化；关闭后抛 CLOSED
 * @property {Promise<object>} validation 后台结果，首屏不等待；完整字段见 §5.14
 * @property {(callback:Function)=>Function} onStale 变化订阅，返回退订函数；close 自动退订
 * @property {(index:number)=>MessageModel} getMessage 按需构建并复用冻结模型，不返回原始消息
 * @property {(pageIndex?:number)=>{pageIndex:number,start:number,end:number,total:number,pageCount:number,messages:readonly MessageModel[]}} page end 不包含；空聊天 page(0) 返回空页
 * @property {()=>void} close 幂等释放此句柄和角色快照；之后 page/getMessage/renderMessage 抛 CLOSED；原始数组/索引/已构建页由有界 LRU 保留
 */
/** @typedef {{html:string,displayText:string,reasoningHtml:string,model:MessageModel,swipeIndex:number}} RenderedMessage */ // displayText：T75 增，显示正则之后、Markdown 之前的正文
```

日期兼容 ISO、数值/数字字符串毫秒时间戳和 ST 旧版 `YYYY-M-D @HHh MMm SSs Nms`；无时区的旧格式按宿主本地时区解释，损坏日期返回 null。只有当前候选缺少 `swipe_info` 思维链时才回退楼层 extra；显式空字符串不回退。没有 swipes 时为一个候选。

群聊 header 为规范化视图：userName 优先第一条用户消息名，否则当前宿主用户名；characterName 为群名；每楼正则的 char 按实际成员确定。group.id 与 chat_id 不能混用。元信息与角色卡为独立冻结快照。`getRegexContext(index)` 是 core 内部方法，UI 不直接依赖。

聊天键：`${encodeURIComponent(avatarUrl)}/${encodeURIComponent(fileName)}`；群聊为 `group:${encodeURIComponent(groupId)}/${encodeURIComponent(fileName)}`。文件名中的文字 `.jsonl` 也可保留：仅 API 返回的物理文件名去掉最后一层存储后缀；不要对已经是 file_id 的值再次剥离。持久化用 chatKey，不用显示标题。

### 5.3 UI 接入示例（真实调用，可直接改成 UI 的事件处理）

```js
import { listCharacters, listByCharacter, openChat } from '../core/chatSource.js';
import { initFormatter, renderMessage } from '../core/formatter.js';

await initFormatter();
const characters = await listCharacters();
const character = characters.find(item => item.avatarUrl === 'STCR_T11_Aster.png');
const summaries = await listByCharacter(character.avatarUrl);
const controller = new AbortController();
const handle = await openChat(summaries[0].chatKey, { pageSize: 30, signal: controller.signal });
try {
    const page = handle.page(0);
    for (const model of page.messages) {
        const result = renderMessage(handle, model.index); // 默认显示 ST 当前候选
        // UI：安全 HTML 分别放入 .mes_text / .mes_reasoning；名字和标题用 textContent。
        // UI：复制按钮用独立 stcr- 类，不用宿主 mes_edit/swipe_right 等委托事件类。
        console.log(model.name, result.html, result.reasoningHtml);
    }
    const other = renderMessage(handle, 11, 0); // 只预览第 12 楼第 1 候选
    console.log(other.swipeIndex, other.model.swipeId); // 0, 2；ST 当前候选不变
} finally {
    handle.close();
}
```

实际 UI 应在切聊天前 `abort()` 上个未完成请求；新请求返回后核对当前请求代号，过期结果立即 close。离开聊天时清空上一页 DOM、模型引用，再 close 旧 handle；core 不接管 UI 生命周期，不暗中关闭别的 handle。阅读器候选状态自存，不能赋值给 ST 的 chat、元信息或 swipe_id。

`html` 不含操作按钮。代码高亮已完成；T21 在 `pre code` 外追加自有复制按钮，复制 `code.textContent`。主题 `#chat` 克隆由 T13 交付；本卡仅隔离消息自带 style。摘要/姓名/标题没有经过 HTML 清洗，必须用 `textContent`。

### 5.4 本卡附带的纯函数与后续边界

`textTransforms.js` 已交付：`makeTextQuote(text,start,end,contextLength=32)` → `{exact,prefix,suffix}`；`locateTextQuote(text,quote)` → `{start,end}|null`（歧义也返回 null）；`replaceLiteralNames(text,pairs)` → string（`pairs:[{from,to}]`，长词优先且不串换）；`splitMaskedText(text,words)` → `[{type:'text',text}|{type:'mask',length}]`（mask 不含原词）。这批纯逻辑进入 Node/浏览器共用测试，满足 T12 卡片中的锚点、脱敏测试要求。

T13 接口见5.5–5.8，T14接口见5.9–5.11。T12 已交付签名与行为不变；T14 的新片段模型用于 I010 的优先级、图案和安全恢复，不替换这里的旧函数。

### 5.5 T13 存储合同（2026-09-29，首次交付）

`import { store, bookmarkId } from '../core/store.js'`。所有 store 方法返回 Promise；`bookmarkId` 同步。初始化会检查宿主 localforage 与 IndexedDB；失败会抛错，不回退 ST 设置或 localStorage。库名 **st-reader**、表 **stcr_data**、单个快照键 **stcr:state:v1**，六类数据同一次 setItem 原子提交。每次操作重读持久化数据，页内串行；支持 Web Locks 的浏览器还会跨标签串行，无 Web Locks 时只保证同一实例串行。

| 签名 | 返回与行为 |
|---|---|
| `store.ready()` | `Promise<void>`；可重复等待初始化 |
| `store.annotations/bookmarks/replaceRules/assets.list(query = {})` | 记录数组，按 createdAt、id 升序；query 字段严格相等，annotations 的 chatKey/mesIndex/swipeIndex/part 在 anchor 内匹配 |
| 上述集合 `.get(id)` | 记录或 null；返回独立副本 |
| 上述集合 `.put(record)` | 保存后的完整记录；省略 id 创建，带 id 是**完整替换**（不是补丁）；更新请先 get 再展开旧字段 |
| 上述集合 `.remove(id)` | boolean，是否曾存在；assets 见下方引用规则 |
| `store.maskWords.list()` / `.set(words)` / `.add(word)` / `.remove(word)` | `Promise<string[]>`；字面、区分大小写、精确去重，保留输入空格，拒绝空白词；set 替换整个词表 |
| `store.settings.all()` | JSON 对象 |
| `store.settings.get(key, fallback = null)` | JSON 值；缺失返回 fallback 的副本 |
| `store.settings.set(key, value)` / `.remove(key)` | 保存值 / boolean；只接受有限数字、字符串、布尔、null、数组、普通对象，无 undefined/函数/日期对象/循环引用 |
| `store.info()` | `{lastExportAt:string|null, counts:{annotations,bookmarks,maskWords,settings,replaceRules,assets}}` |
| `store.exportAll()` | JSON **字符串**，含六类数据与素材；成功生成即记录 lastExportAt（不等同于用户已保存到磁盘） |
| `store.previewImport(json)` | `ImportReport`，完整验证、计数但不落盘 |
| `store.importAll(json)` | `ImportReport`，验证后原子**合并**；重复 ID、设置键、词条跳过，保留现有编辑，不覆盖/清空 |
| `bookmarkId({kind?,chatKey,mesIndex?,swipeIndex?})` | 稳定 ID；kind=chat 只含聊天键，整楼/候选旧 ID 不变；省略 kind 时由 swipeIndex 推断 floor/swipe，见5.12 |
| `store.assets.references(id)` | 使用该素材的替换规则数组 |
| `store.assets.remove(id,{removeRules = false} = {})` | 有引用默认抛 ASSET_IN_USE；明确 true 时连同引用规则原子删除 |

备份结构 `{format:'st-reader',version:1,exportedAt,data:{annotations:{[id]:record},bookmarks:{},maskWords:[],settings:{},replaceRules:{},assets:{}}`。导入/导出上限 24 MiB（UTF-8），拒绝未来版本、未知/缺失分类、危险原型键、坏引用；同 ID 素材字节不同则取消导入，避免悄悄更换已有规则的图片。preview 与 import 之间若其他页面有写入，以 import 的最新计数为准。

`StcrStoreError.code`：`UNAVAILABLE / INVALID_STATE / INVALID_DATA / INVALID_BACKUP / BACKUP_TOO_LARGE / ASSET_LIMIT / MISSING_ASSET / ASSET_IN_USE / ASSET_CONFLICT`。聊天键沿用 StcrDataError；图片类型/大小使用 TypeError/RangeError，浏览器解码、配额和存储错误保留原错误。失败时 UI 提示并保留用户输入，不能显示“已保存”。不提供清库接口。

**T70 增补**：`onChange / revision / snapshot / markSynced / mergeBackup` 与纯函数 `mergeNewer` 见 §5.16；快照新增 `rev / syncedId / syncedRev` 三个顶层字段（旧快照按 0 / null 读取，不为此迁移写入）。

```js
/** @typedef {{exact:string,prefix:string,suffix:string}} TextQuote */
/** @typedef {{chatKey:string,mesIndex:number,swipeIndex:number,part:'body'|'reasoning',quote:TextQuote,rawHash:string}} Anchor */
/**
 * @typedef {object} Annotation
 * @property {string} id 创建可省略，core 生成 stcr:annotations:...:UUID
 * @property {Anchor} anchor
 * @property {string} title 聊天显示名，最多 2000 码元；UI 用 textContent
 * @property {string} preview 列表摘要，最多 1000 码元
 * @property {string} note 默认空串，最多 100000 码元
 * @property {'yellow'|'green'|'blue'|'pink'} color 默认 yellow
 * @property {boolean} orphan 默认 false
 * @property {null|'text-missing'|'ambiguous'} orphanReason 默认 null
 * @property {string} createdAt core 生成的 ISO 时间，更新保留
 * @property {string} updatedAt core 每次 put 更新
 */
/** @typedef {{id:string,kind:'chat'|'floor'|'swipe',chatKey:string,mesIndex?:number,swipeIndex?:number|null,title:string,preview:string,createdAt:string,updatedAt:string}} Bookmark */
/** @typedef {{id:string,from:string,to:{kind:'text'|'icon'|'asset',value:string,background?:string},scope:string,caseSensitive:boolean,wholeWord:boolean,createdAt:string,updatedAt:string}} ReplaceRule */
/** @typedef {{id:string,name:string,mime:string,size:number,dataUrl:string,createdAt:string,updatedAt:string}} Asset */
/** @typedef {Object<string,{added:number,skipped:number}>} ImportReport 六个固定分类 */
```

Bookmark 创建时 id、时间由 core 生成，title/preview 必填；kind=chat 不得携带 mesIndex/swipeIndex，其他类型 swipeIndex 默认 null；id 必须与 bookmarkId 一致，不能让同一收藏产生重复行。Annotation、ReplaceRule、Asset 也允许创建时省略 id/时间；记录均使用 `stcr:` 前缀。楼号/候选号从 0 开始。

ReplaceRule：from 为非空字面量（≤1000 码元）；scope 默认为 all，或角色 avatar 文件名；caseSensitive/wholeWord 默认 false。`to.kind:'icon'` 的 value 为单个 `fa-star` 形式名称；asset 的 value 为已存在的 Asset.id；text 可为空串，且可选 to.background（严格 #RRGGBB，不能用于 icon/asset）。T41 的文字背景在预览、映射与 PNG 中保留；纯文本/HTML 字符串接口只替换 Text.data，不产生背景样式。

Asset.put 输入 `{id?,name,blob}` 或 `{id?,name,dataUrl}`；PNG/JPEG/WebP/SVG，单张≤200 KiB、最多30张，返回统一 base64 dataUrl。校验 MIME/文件头，浏览器实际解码位图；SVG 用宿主 DOMPurify 清洗并移除事件、脚本、外部资源、动画、样式和外链，备份导入也重洗。SVG 必须在 ST 浏览器调用，Node 测试使用位图。导出不含 Ny 字体；其字体数据库归 Ny 管理。

### 5.6 T13 锚点合同

`import { createAnchor, resolveAnchor, relocateAnnotations, getAnchorText, createTextAnchor, locateAnchorText, hashRawText } from '../core/anchor.js'`。

```js
/** @typedef {{chatKey:string,mesIndex:number,swipeIndex:number,part?:'body'|'reasoning',rawText:string}} AnchorContext */
/** @typedef {{status:'attached'|'orphan'|'unrelated',reason:null|'text-missing'|'ambiguous',rawChanged:boolean,start:number|null,end:number|null}} AnchorLocation */
/** @typedef {AnchorLocation & {range:Range|null}} AnchorResolution */
/** @typedef {AnchorResolution & {annotation:Annotation}} RelocatedAnnotation */
```

| 签名 | 返回与约定 |
|---|---|
| `getAnchorText(rootEl)` | 同步 string；与锚点相同的过滤文本，UI 不要用普通 textContent 代替 |
| `createTextAnchor(text,start,end,context)` | `Promise<Anchor>`；Node 纯逻辑路径，end 不包含 |
| `locateAnchorText(text,anchor,context)` | `Promise<AnchorLocation>`；Node 纯逻辑匹配 |
| `hashRawText(text)` | `Promise<string>`，sha256: 后接64位小写十六进制 |
| `createAnchor(rootEl,selectionOrRange,context)` | `Promise<Anchor>`；单个非空 Range/Selection，起止均在同一个正文或思维链容器内，否则 RangeError |
| `resolveAnchor(rootEl,anchor,context)` | `Promise<AnchorResolution>`；attached 才有跨文本节点 Range；不写存储、不包 span |
| `relocateAnnotations(rootEl,context)` | `Promise<RelocatedAnnotation[]>`；只查询当前四元组，按 §4.3 持久化 orphan，返回 UI 所需 Range |

rawText 必须传对应候选的原正文或原思维链；part 默认 body。复制按钮已排除，其余装饰节点标记 `data-stcr-ignore-anchor`。不要跨楼或正文/思维链创建一个锚点。这些函数异步计算哈希，UI 等待期间若重新渲染/切聊天，应以请求代号丢弃旧 Range，并重跑当前容器。高亮 DOM 由 T22 自己管理；core 不改选区、不写聊天、不改候选。

### 5.7 T13 样式合同

`import { startCssScope, refreshCssScope, stopCssScope } from '../core/cssScope.js'`。

`startCssScope()` 同步返回默认控制器 `{start(),refresh(),stop(),stats}`；幂等启动，APP_READY 已调用。`refreshCssScope()` 同步返回统计 `{rules,skippedSheets,skippedDeclarations,inlineVariables,revision}`；revision 只在副本文本变化时递增。`stopCssScope()` 幂等移除自己的样式/观察器/设置事件监听。UI 关闭阅读器无须 stop，保留监听即可在下次打开时使用当前主题。

UI 只需满足 `#stcr_root` 内含 `#stcr_chat` 及 D12 类名；样式克隆自动生效，无须把宿主 CSS 复制到 UI 文件。未克隆全局字体/变量，它们仍由宿主管理。具体监听范围与显式 refresh 场景见 §4.2。`createCssScope/collectScopedCss/rewriteChatSelector` 为测试内部接口，不作为 UI 合同。

I015 集成约定：UI 的外层负责滚动/翻页；cssScope 副本末尾为 `#stcr_root #stcr_chat` 解除宿主普通 `max-height/overflow` 限制（设为 none/visible），防止双滚动条。此处不加 important，不改变正文主题声明。T21 的 src/ui 未改；后续 UI 继续使用自己的外层滚动容器。

### 5.8 T13 接入示例与 I012 设置迁移

```js
import { store, bookmarkId } from '../core/store.js';
import { createAnchor, relocateAnnotations } from '../core/anchor.js';

// handle/model 与 rootEl 由 UI 当前渲染页提供；readingSwipe 是阅读器自己的候选。
const model = handle.getMessage(index);
const context = { chatKey: handle.chatKey, mesIndex: index, swipeIndex: readingSwipe,
    part: 'body', rawText: model.swipes[readingSwipe].text };
const anchor = await createAnchor(rootEl, window.getSelection(), context);
const annotation = await store.annotations.put({ anchor, title: handle.title,
    preview: anchor.quote.exact.slice(0, 240), note: '我的想法', color: 'yellow' });
await store.annotations.put({ ...annotation, note: '修改后的想法' });
const attached = await relocateAnnotations(rootEl, context);
// attached 内 status===attached 的 range 交给 UI 绘制；孤立面板用下句查询。
const orphans = await store.annotations.list({ orphan: true });

const target = { chatKey: handle.chatKey, mesIndex: index, swipeIndex: null };
await store.bookmarks.put({ ...target, title: handle.title, preview: '这楼的纯文本摘要' });
console.log(await store.bookmarks.get(bookmarkId(target)));

await store.settings.set('stcr:ui:prefs:v1', { fontSize: 18, lineHeight: 1.8 });
await store.settings.set('stcr:ui:progress:v1', { [handle.chatKey]: { index, swipe: readingSwipe } });
const backupText = await store.exportAll(); // UI 创建 application/json Blob，保存到用户选定位置。
console.table(await store.previewImport(backupText)); // 供 UI 的合并确认页使用。
console.table(await store.importAll(backupText)); // 同一份再导入全部跳过，保留当前修改。
```

I012 的两个 localStorage 键可原样作为 settings key，值可原样存纯 JSON（含阅读进度和候选记忆），会自动进入备份。**迁移归 T22 的 prefs.js 接入，不在 T13 修改 UI**：先检查 settings 已有值；缺失时读取/解析旧值，await set 成功后才删旧 localStorage 键。已有 settings 则优先保留；解析或落盘失败保留旧键。建议 UI 对进度写入去抖并等待保存 Promise；当前快照含最多约6 MiB图片，避免每个滚动事件立即持久化。

### 5.9 T14 导出合同（2026-09-29，首次交付）

从 `../core/cardExport.js` 导入下列函数。T14 不新增工作台按钮或模板，不修改 src/ui。

| 签名 | 返回与语义 |
|---|---|
| `createCardMessage(handle,index,{swipeIndex,...options}={})` | Promise<{element,mappings}>；创建未挂载的 `.mes.stcr-card-message`，含 `.name_text/.mes_text/.mes_reasoning`，没有头像/操作按钮。先从原文脱敏再格式化，支持当前候选与思维链；不切宿主候选。必须把 element 放入模板中，才能获得实时主题/字号。handle 在导出完成前不能 close |
| `bindCardSource(element,handle,index,swipeIndex?)` | 同步返回同一个 element，仅在 WeakMap 记录来源；不改 DOM。供 UI 自建楼层使用；必须含 `.mes_text`，可选 `.name_text/.mes_reasoning`。省略 swipeIndex 使用该楼 ST 当前候选 |
| `exportCard(rootEl,options={})` | Promise<Blob>，type为image/png；不下载、不写文件、不变更输入DOM。可传单楼或含多楼的模板根。元素须已连接到当前页面且有非零宽度；读取实际样式与字体后仅操作隔离副本，成功/失败都清理 |

```js
/**
 * @typedef {object} CardOptions
 * @property {boolean} [replaceNames=true] 原文替换阶段总开关；false 用于导出已处理选段，不关闭屏蔽词
 * @property {boolean} [autoReplaceNames=true] 自动名字脱敏及整名保护；可独立关闭
 * @property {boolean} [applyReplaceRules=true] 执行我的规则；可独立关闭
 * @property {ReplaceRule[]} [rules] 见5.5；导出默认读store.replaceRules，预览createCardMessage默认[]
 * @property {Asset[]} [assets] 见5.5；导出默认读store.assets，预览createCardMessage默认[]
 * @property {string[]} [maskWords] 导出默认读store.maskWords；createCardMessage不应用遮盖
 * @property {'bar'|'block'|'sticker'|MaskStyle} [maskStyle='bar']
 * @property {number} [width] 根节点实际宽度；CSS像素
 * @property {number} [scale=2] 1–3，可小数；PNG宽高乘倍率
 * @property {(message:string)=>void} [onWarning] 非本地字体回退时可在工作台展示提示
 */
/**
 * @typedef {object} MaskStyle
 * @property {'bar'|'block'|'sticker'} kind
 * @property {boolean} [uniform=true] 固定3em宽；false在DOM中按Range像素宽度，无布局时以Unicode码点数回退
 * @property {string} [color] 必须#RRGGBB实色；bar默认#000000，其余默认#72b8a5
 * @property {'fa-star'|'fa-heart'|'fa-cat'|'fa-cloud'|'fa-moon'|'fa-shield'} [icon='fa-star']
 * @property {string} [assetId] sticker可用已导入图片；给出时优先于icon
 */
/** @typedef {{from:string,to:{kind:'text'|'icon'|'asset',value:string,background?:string},count:number}} SkippedNameRule */
/** @typedef {{from:string,to:{kind:'text'|'icon'|'asset',value:string,background?:string},source:'mine'|'automatic',count:number,skippedOverlap?:true,skippedRules?:SkippedNameRule[]}} CardMapping */
```

导出开启名字替换时必须有绑定的原文；传普通已格式化楼层而不绑定会报错，因为不能在正则后的HTML上假装完成“正则前名字替换”。每次导出对绑定楼层从原始候选重渲染一次，保持模板的外壳/样式，在副本内更新三个展示区域；不会把预览已经处理过的正文再跑一次正则。没有绑定、且 `replaceNames:false` 时可直接导出任何安全DOM，此时仅做屏蔽。

**选段合同**：若只要部分楼层，先用 createCardMessage 得到已脱敏、已格式化的节点，在这个副本上提取选段（例如Range.cloneContents），放入模板；然后用 `exportCard(template,{...options,replaceNames:false})` 导出已经处理好的片段。这里的false是“导出时不再做名字阶段”，不会还原已替换的名字。规则/名字开关变化时，从原始handle重建预览和选段。不要把只剩部分正文的元素再次bind，否则导出会按绑定重建整楼。原阅读器上的选区映射与工作台重选/确认由T23处理，不能直接把阅读器原始HTML当作已脱敏HTML。

**T30 退回 / I021**：新增两个可选子开关，默认均为 true，旧调用行为不变。`autoReplaceNames:false, applyReplaceRules:true` 保留角色/用户/群成员名字，同时执行“灯塔→某地”等我的规则；已知名字宏仍按目标聊天展开。自动名字关闭时不再建立 I019 的保护范围，此时我的规则可照字面匹配名字的部分；重新开启则恢复整名保护。关闭 applyReplaceRules 不执行或验证我的规则。两个子开关都关闭时不处理原文；无论它们是什么，`replaceNames:false` 始终跳过整个阶段，避免选段导出重复替换。屏蔽词独立，仍由最后的遮盖阶段执行。T42 已接线并经人类验收（I021），预览、缓存键、选段重建、名字行、批注与映射列表同步；2026-10-01 核对状态。

我的规则 scope=all 或匹配**当前目标发言角色的avatar**；群聊按实际成员，用户楼没有任意成员作用域。整词判断按Unicode字母/数字/组合符/下划线边界；中文连续字串需要精确边界或关闭wholeWord。规则不是正则表达式；同级重叠先长词，相同长度用传入顺序，store.list的顺序稳定。目标图标只允许上述六种；素材引用必须存在，重新校验图片签名/限额，SVG再次清洗。mappings只包含实际命中，含原词，供工作台私有映射预览，不能放到分享图或日志。

**T30 / I019 合同增补**：先收集原文中全部自动名字的 UTF-16 范围（单聊 char/user、群成员、已展开的名字宏），每次“我的规则”匹配若碰到任何自动名字，必须与其中某个名字同时满足**原词逐字完全相等（区分大小写）且范围完全相同**，并且不截断其他相交的自动名字，才可覆盖；前缀、后缀、内部片段、跨边界及包含整名的更长原词均跳过该处。规则在其他不与名字相交的位置仍能执行，scope/wholeWord/caseSensitive 仍按原合同过滤。嵌套名字中，完整短名不能拆开另一个长名。

`skippedOverlap:true` 标在**真正保护了完整名字的实际映射**上（自动映射或完整同名的我的映射）；同一映射的 `skippedRules` 为 `{from,to,count}` 列表，count 为与该映射相交而跳过的次数。顶层 count 仍只统计实际替换次数。不要将诊断子项再作为替换规则；这避免旧 UI 的批注脱敏遍历 mappings 时误用一个根本没执行的规则。正文、思维链、名字行及命中的显示正则名字宏合并时保留并累加诊断。UI 可显示“为保护完整名字，已跳过部分重叠规则”，真实原词只留私有侧栏。函数签名与旧字段不变；当前 UI 的新增提示由 Opus 后续接入（见 I019）。

I018① 已修：Canvas 字体名去外层引号后重新引用，六个 FA 实心图标均作真实 PNG 像素验证。I018② 本轮不在 core 解析带 var() 的简写：安全样式拷贝会先过滤资源声明，直接复制 cssText 会绕开边界；通用简写展开又需处理层叠、!important、变量与回退。目前模板继续使用 background-color/border-color 等单项属性，外来自定义 CSS 的这类简写仍可能丢失，保留该限制。

**T73 / I052 增补（2026-10-21，Opus 按 D32 交付；只增不改，旧签名与默认值不变）**：
- I018② 收窄：复制样式表时，某个分项读出来是空串（含 `var()` 的简写展开后就是这样），改为整条复制它所属的简写（`border-top-width` → `border-top` / `border`，`*-radius` → `border-radius`，`top/right/bottom/left` → `inset`，`row/column-gap` → `gap`）；简写值同样先过资源过滤，`animation*`/`transition*` 仍不复制。宿主气泡 `border: 1px solid var(--SmartThemeBorderColor)` 因此不再在 PNG 里丢边框。
- 楼内 `<style>` 的作用域编号 `data-stcr-css`（纯数字）随克隆进快照，`#stcr_chat [data-stcr-css="N"] …` 规则在副本里照常命中。
- `exportCard` 新增可选 `fetchFn`、`signal`（只给测试和调用方注入；缺省用浏览器 fetch，`credentials:'omit'`）。字体与遮盖之后、栅格化之前调用下面的 `embedCardImages`；`onWarning` 现在也报告图片降级，不止字体。
- `cardSnapshot.js` 新导出：

| 签名 | 返回与约定 |
|---|---|
| `embedCardImages(snapshot,{onWarning?,fetchFn?,signal?}={})` | `Promise<{embedded,failed}>`。遍历副本每个元素及其 `::before/::after` 的计算样式（`background-image`、`border-image-source`、`list-style-image`、`mask-image`、`content`）；`data:` 原样，其他 URL 按 D23 读取并内嵌，结果必须是 `data:image/*`；读不到的换成 `CARD_IMAGE_PLACEHOLDER` 并逐个 `onWarning`。完成后副本里没有非 `data:` 的 `url()` |
| `CARD_IMAGE_PLACEHOLDER` | 字符串常量：浅色斜纹 SVG 的 data URL |

- `htmlExternalResources.js` 新导出 `createResourceLoader({baseUrl,fetchFn,signal,onWarning})` → `{resource(raw,base?,kind?),warn(message,url),warnings}`：`embedHtmlResources` 与 `embedCardImages` 共用的去重、限额、CORS 读取器。
- `formatter.js` 新导出 `filterCssUrls(text,allowExternal)`：样式里的 `url()` 逐个判断，`data:image/(png|jpeg|gif|webp|avif|svg+xml)` 保留，`https:` 只在 `allowExternal` 时保留，其余换成 `none`。`renderMessage` 的 allowExternal 跟随 ST 的"禁止外部媒体"（`forbid_external_media`）以及目标角色 / 群组的逐个覆盖；从前样式里只要有 `url(` 就整段删除，现在只有 `image-set(`、`@import`、反斜杠转义仍整段删除。

参数错误抛TypeError/RangeError；源handle关闭时沿用CLOSED；字体文件缺失/解码失败、图案缺失、占位符损坏、不可读图片、截图失败抛带中文原因的Error。任何错误都不产出“可能未脱敏”的替代图。UI await导出期间禁用重复按钮，catch后保留预览；关闭工作台时自行释放handle、DOM及自己创建的Blob URL。core只生成Blob，不控制用户的保存位置。

### 5.10 T14 纯变换与 DOM 适配合同

从 `cardExport.js` 可重导入 `replaceNamesInRaw/maskText/automaticNameRules/wrapMaskSpans`；纯函数的原文件为 `cardTransforms.js`。T12 textTransforms.js 的旧函数继续可用，签名未改。

| 签名 | 返回 |
|---|---|
| `automaticNameRules({userName='',characterName='',isGroup=false,groupNames=[]}={})` | 自动规则数组；不读宿主 |
| `replaceNamesInRaw(text,options={})` | `{segments,mappings}`；segments为`{kind:'text',text}`或`{kind:'replacement',to:{kind,value}}`；不存匹配原文，只在mappings里供私有预览。options含名字上下文、avatarUrl、rules、replaceNames、autoReplaceNames、applyReplaceRules；独立开关、自动名字整体保护及 skippedOverlap/skippedRules 见5.9 |
| `maskText(text,words=[],maskStyle='bar')` | 数组；普通段`{kind:'text',text,start,end}`，遮盖段`{kind:'mask',width,style,start,end}`；位置是原输入UTF-16偏移，遮盖段无原词。Node自测覆盖这两个变换内核 |
| `wrapMaskSpans(root,words=[],maskStyle='bar',assets=new Map())` | 返回root的DOM副本；输入不变，无网络或存储。uniform=false 且源节点已连接并有布局时，在源节点上只读测量全部命中范围，再给副本遮盖写入 px 宽；未连接/隐藏/零宽时回退码点数 em。调用前应等待 document.fonts.ready。assets是`Map<id,{dataUrl}>`，必须是经过store/prepareCardAssets校验的数据；一般工作台使用exportCard接管校验即可 |

自定义卡片中的副标题/批注需由UI明确决定是否显示；屏蔽会遍历这些文本节点。将不应导出的控件标记 `data-stcr-export-ignore`，副本构造时整树跳过。不要把真实名字放进背景图；图片像素不做OCR脱敏。被保护的替换文字通过 `.stcr-replacement[data-stcr-protected]` 标记，在预览裁剪时保留该包裹，保证“替换优先于屏蔽”。这两个标志都不包含真实原词。

纯函数例：`replaceNamesInRaw('测试旅人（虚构） 虚构',{userName:'测试旅人（虚构）',rules:[{from:'虚构',to:{kind:'text',value:'假想'}}]})` 的文本结果是 `user 假想`。自动映射 `测试旅人（虚构）→user` 带 `skippedOverlap:true, skippedRules:[{from:'虚构',to:{kind:'text',value:'假想'},count:1}]`；另有正常的 `虚构→假想` 我的映射。关闭 replaceNames 时仍返回原文与空映射。

### 5.11 T14 接入示例与开发验收

```js
import { createCardMessage, exportCard } from '../core/cardExport.js';
import { store } from '../core/store.js';

// handle/index来自阅读器，readingSwipe为阅读器当前看的候选。
const [rules, assets, maskWords] = await Promise.all([
    store.replaceRules.list(), store.assets.list(), store.maskWords.list(),
]);
const options = { rules, assets, maskWords, replaceNames: true,
    maskStyle: { kind: 'block', color: '#72b8a5', uniform: true },
    onWarning: message => showCardWarning(message) }; // UI自己的提示函数
const { element, mappings } = await createCardMessage(handle, index, {
    ...options, swipeIndex: readingSwipe,
});
previewRoot.replaceChildren(element); // previewRoot位于 #stcr_root / #stcr_chat 样式上下文
// mappings仅显示在私有规则列表；模板不要包含该列表。
const png = await exportCard(previewRoot, options);
// UI通过保存对话框或自己的下载按钮保存此Blob；不传聊天文件名或真实姓名作默认文件名。
const url = URL.createObjectURL(png);
previewImage.src = url;
// 替换预览图或关闭工作台时 URL.revokeObjectURL(url)。
```

在开发实例控制台：`await stcrExportDemo()` 会用合成星灯第12楼、当前存储候选构造预览，屏蔽“星图/今晚”，弹出**实际PNG**与“保存PNG（请选E盘）”按钮；也可打开 `http://localhost:8100/?stcrExportDemo=1`。先按T11手册导入Ny字体。普通浏览器支持文件选择时由人类选择E盘；不支持时右键图片另存为。`stcrSelfTest()` 的T14部分会逐项检查图案、群成员、源DOM不变、零fetch、遮盖像素、Ny字形和失败清理。

### 5.12 T41 增补合同（2026-09-30）

#### 遮盖宽度与替换背景

- `maskText` 纯函数签名、字段均不变：uniform=false 的 width 仍是 Unicode 码点数，供无 DOM 环境回退。
- `wrapMaskSpans` 仍同步返回副本。源节点连接到文档且有布局时，在源文本上对**全部命中先测量再修改副本**，用 `Range.getBoundingClientRect().width` 写 px；跨 em/strong、混合字号与 emoji 均可测。跨行时取 Range 的外接矩形宽度。未挂载、display:none 或测到零宽时退回码点数 em，统一长度仍为 3em。调用方应先等待字体就绪，在 **1:1 未缩放**的最终模板样式上下文中测量，再给预览施加 scale；函数不把未连接的输入临时挂到宿主页。
- `exportCard` 在隔离副本中先收集、内嵌并加载字体，再测原词、移除原词并添加遮盖；随后截图。避免 Ny 字体尚未解码时测到后备字体宽度。三个遮盖类型都使用相同宽度规则；高度调整仍由 T42 处理。
- **I026 / T42 已接线**：`cardStudio.compose` 先取消舞台缩放并挂载 card，再逐词 wrapMaskSpans / replaceWith，最后 fit；字体加载完后重新排版。每个新副本必须继续处于 1:1 模板布局中。T42 已有人类验收和实际 PNG 像素证据；T41 本身只交付 core，旧的未挂载调用会使用码点回退这一边界不变。
- `ReplaceRule.to.background?: string` 只在 kind=text 时允许，必须严格匹配 `#RRGGBB`，不接受透明色、CSS 名称、短色号或空值；不需要背景时**省略字段**。store 校验失败抛 INVALID_DATA，纯变换/导出校验失败抛 TypeError；旧规则完全兼容。颜色随导入导出、segments、mappings、skippedRules 保留。
- 预览与 PNG 的替换文字包裹使用 `background-color: <颜色> !important`，不解析 value 中的 HTML；名字行、正文、思维链走同一适配器。替换结果仍受保护，不被屏蔽词二次吞掉。UI 编辑/复制规则时须保留 to.background；T42 添加颜色输入与预设。

#### 代码 / HTML 字符串脱敏

从 `../core/codeTransforms.js` 导入，或通过 `cardExport.js` 重导出：

| 签名 | 返回与约定 |
|---|---|
| `maskCodeText(text, opts={})` | 同步 string，无 DOM、网络或存储。适用于纯文本代码；HTML 必须使用下一函数 |
| `maskHtmlString(html, opts={})` | `Promise<string>`，需要浏览器 document.body；使用 DOMParser 解析，只修改文本节点，返回规范化的完整 HTML 文档字符串 |

opts 接受与 `replaceNamesInRaw` 相同的名字上下文、avatarUrl、rules、replaceNames、autoReplaceNames、applyReplaceRules；额外接受 `maskWords=[]` 与 `maskStyle='bar'`。默认名字/规则开关与原接口一致；仅想处理显式规则时可设 autoReplaceNames=false。不隐式读取 store，不运行 ST 显示正则。规则长词优先、自动名字保护、作用域/大小写/整词与三个开关沿用 §5.9；替换优先于屏蔽，不串换。

字符串出口将遮盖转为实心方块：统一长度 `███`，关闭统一长度时按原词码点数重复 `█`。text 规则直接写文字；六种 icon 分别用 `★ / ♥ / 🐈 / ☁ / ☾ / 🛡`，asset 用 `[图片]` 纯文本占位。字符串接口不嵌入图片或背景 CSS，也不读取 assets；background 仍校验但没有文字之外的效果。这保持了“只改文本节点”的边界。

HTML 解析在临时、禁脚本且 `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'` 的同源沙箱解析环境中进行；用**该环境的 DOMParser**继承禁网策略。允许内联样式以保留 style 属性和 style 内容，避免解析器对它们报 CSP 错误；没有开放任何网络协议、CSS 外链、图片、字体或脚本。用户 HTML 从不放到活动页面。遍历 Text.data，包括 title、模板内容与 SVG 文本；跳过 script/style 全部内容，不改现有标签、属性、注释。匹配限于每个独立文本节点，不跨标签拼接名字。DOMParser 会规范化引号、实体与隐含 html/head/body，并修复无效 HTML，因此不承诺源字符串字节相同。解析环境在成功、失败时都移除。

这不是 HTML 安全清洗器：输出按要求仍保留原属性和 script/style，不能直接注入宿主 `innerHTML`。复制代码时作为字符串交给剪贴板；显示/导出交给 T44a 沙箱或静态清洗管线。T44a 调用必须 `await maskHtmlString(...)`。

解析策略依据：[MDN DOMParser](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString) 提醒惰性解析仍可能下载图片/iframe；[HTML 标准](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-domparser-parsefromstring) 定义解析文档的创建环境。本实现使用隔离环境并另做浏览器零外链实测，不以“不执行脚本”代替断网。

#### 三类收藏与旧数据

```js
// 整个聊天：不得传 mesIndex 或 swipeIndex（即使值为 null）。
const chatBookmark = await store.bookmarks.put({ kind: 'chat', chatKey, title, preview: '' });
await store.bookmarks.list({ kind: 'chat' });
// 整楼/候选：旧调用继续可用，返回记录补全 kind。
await store.bookmarks.put({ chatKey, mesIndex: 0, title, preview: '' }); // kind=floor
await store.bookmarks.put({ chatKey, mesIndex: 0, swipeIndex: 2, title, preview: '' }); // kind=swipe
```

kind=chat 的 ID 为 `stcr:bookmark:${encodeURIComponent(chatKey)}:chat`，目标身份仅取 chatKey；不包含楼号、候选号、标题或摘要。重复 put 同聊天更新同条记录。floor/swipe 的 ID 保持原格式，三种收藏互不覆盖；显式 kind 与编号冲突会抛 INVALID_DATA。list() 默认返回三种，可按 kind/chatKey 严格过滤；get/remove/计数与六分类备份继续适用。

无 kind 的旧记录在读取副本与导入时根据 swipeIndex 推断 floor/swipe；不改 ID，不改创建时间，读取/列表/previewImport 不为迁移写库。export/import 仍用 version=1 与原六分类，导出的记录带 kind；重复 ID 合并仍跳过已有记录。新聊天收藏不能导入不支持 T41 的旧版客户端。

T43 抽屉仅取 `list({kind:'chat'})`；批注面板应明确筛选 floor/swipe，不能把 chat 当成楼号 0。T41 不改 src/ui，也不添加聊天收藏按钮。

#### 验证入口

Node 纯逻辑纳入 `node dev/selftest.mjs`；浏览器完整 `await window.stcrSelfTest()` 默认包含 T41。只验 T41 可用 `await window.stcrSelfTest({core:false,coreFixes:true})`，无需切角色或导入字体。网址入口：`http://localhost:8100/?stcrSelfTest=1&core=0&coreFixes=1`，按 F12 在控制台查看结果。

T41 验收返修（I027）：网址自动触发和手动调用经过同一个串行队列；每次调用保留自己的选项和结果，前一轮失败不妨碍后一轮。T41 临时 DOM 审计按测试前的节点身份集合核对新增残留，既有节点不算成本轮泄漏，也不删除它们；真正新增的残留仍使测试失败，报出数量和标记类型，不输出聊天内容。专项包含“保留既有节点”和“刻意新增残留仍能检出”的反例验证。

### 5.13 HTML 渲染与当前画面合同（T44a / I032；D15/D22/D23）

从 `../core/htmlRenderer.js` 导入。本模块不读取聊天、不读写 store、不改变宿主选中角色或候选。T44b 负责楼内按钮、独立截图窗口和裁剪框。按 D22，UI 默认允许 HTTPS 外链，Aa 可整体关闭、每块可断网，不再逐次确认；UI 必须每次显式传 allowNetwork。交互 core 缺省 allowNetwork:false 不变；D23 将 renderStatic/exportRenderedHtml 的默认值改为 true，先内嵌用户 HTML 的展示资源，再在禁网、禁脚本的静态 iframe 中排版与截图。

| 签名 | 返回与约定 |
|---|---|
| `detectHtmlBlocks(rawText)` | 同步 `Array<{start,end,html,kind:'fenced'|'raw'}>`；start/end 是原字符串 UTF-16 偏移，end 不含。围栏区间含开闭围栏行及其行末换行，html 只有内部代码；T51/D26 裸 HTML 只含标签区间，`html === rawText.slice(start,end)`，可返回多段，前后及段间散文不包含在内 |
| `buildSrcdoc(html,{allowNetwork=false,width=390}={})` | 同步 srcdoc 字符串；每次生成新随机 token，包含 CSP、隔离外壳及 ResizeObserver 高度上报脚本。仅生成字符串，不挂载或请求网络 |
| `createSandbox(html,{width=390,allowNetwork=false,onHeight?}={})` | 同步 `{iframe,ready,update,destroy,snapshot}`；iframe 尚未挂载，sandbox 仅 `allow-scripts`。UI 应立即 append，再 await ready；ready 为 `Promise<handle>`，收到首次有效高度消息才完成 |
| `handle.update(html?,{width?,allowNetwork=false,onHeight?}={})` | 返回本次 ready Promise，替换 srcdoc、轮换 token，旧加载 Promise 拒绝。省略 html 保留原文，省略 width 保留宽度；**allowNetwork 每次默认 false**，需要继续允许时必须显式传 true |
| `handle.snapshot({timeoutMs=10000,signal?}={})` | `Promise<string>`；等待 ready 后取当前 DOM，只读活文档。800 万字符 / 5 万元素上限，同时最多 8 个请求；timeoutMs 取 1–30000 毫秒，包含等待 ready。超时、取消、重建、销毁均拒绝并清理 |
| `handle.destroy()` | 幂等；移除 iframe、消息监听和超时，拒绝未完成的 ready 与 snapshot；销毁后 update/snapshot 拒绝 |
| `renderStatic(html,{width=390,allowNetwork=true,baseUrl=document.baseURI,onWarning?,signal?,fetchFn?}={})` | `Promise<{iframe,document,element,width,height,warnings,destroy}>`；先安全清洗并内嵌展示资源，之后挂载同源静态 iframe，sandbox 仅 allow-same-origin、无脚本且 CSP 禁网。warnings 为资源降级提示数组；调用者必须 finally destroy |
| `exportRenderedHtml(html,{width=390,scale=2,allowNetwork=true,alreadyMasked=false,maskWords=[],rules=[],assets=[],crop?,baseUrl?,onWarning?,signal?,fetchFn?,...maskOptions}={})` | `Promise<Blob>`，image/png；先 await maskHtmlString → renderStatic（默认含外链展示资源）→ 离线栅格化 → 裁剪。scale 只接受整数 1/2/3，默认 2；crop 是 `{x,y,w,h}` 的 CSS 文档整数像素坐标，省略则全文。PNG 尺寸为选区宽高各乘 scale，不自动下载 |

识别：支持反引号/波浪号围栏（≥3 个、闭合符同种且不短于开头）、多个围栏、CRLF、未闭合围栏延续到末尾；只有内部含真实 `<body>` 起始标签才返回。存在任何围栏时不再把整篇当裸 HTML。裸 HTML 需含 html/body/style 起始标签且至少两个标签，标签字符占去空白结构文本至少 12%；忽略注释与行内代码，CSS/脚本正文不参与密度计算。普通 Markdown 代码、仅有 b 标签或长正文里偶然提到标签不识别；启发式不能取代 HTML 语义分析，UI 始终保留原文入口。

**T51 / D26 边界细则**：上述裸 HTML 识别门槛不变。通过门槛后，从第一个块级起始标签（style/div/section/html/body 等）开始，保留到该段最后一个已闭合的顶层标签，区间不含尾随换行；DOCTYPE、前置注释和散文留在原文。嵌套块里的文字属于 HTML；顶层兄弟标签之间只有空白/注释时合成一段（典型为 style + section），有散文时分成两段。已闭合的 html/body 文档后再开始一份 html/body，即使只隔空白也拆开。返回按原文排序且不重叠。按标签配对计算，属性引号内的 `>`、style/script/textarea/title/xmp 正文里的伪标签不改变边界；没有闭合的片段保留原文，不以吞掉整楼来猜测修复。它不是浏览器的完整容错树构造器，省略闭合标签的畸形 HTML 不保证识别。

**T72 / D35 增补（修订上段“块级起始标签”的范围，签名与返回字段不变）**：
- 能在顶层**起始**一段裸 HTML 的只有 `html body style div section article main header footer aside nav table figure dl`。
- `details summary p blockquote h1–h6 ul ol li pre hr br span font q img` 和自定义标签（如 `<selection>`）在顶层既不起始也不延伸一段，留在正文交给格式化器（ST 原生就把 `<details>` 渲染成折叠）；它们出现在一段**内部**时照常算这段的内容。
- 一段在标签栈归零处结束；归零后到下一个起始标签之间只有空白 / 注释才并入同一段（style + div 仍是一段），有散文或非起始标签就此截断。
- 顶层打开着 `details / blockquote / ul / ol` 时，其中的 div 等不起始新段（不能把一个 details 切成两半，UI 也对不上顶层元素）；`p / li` 常省略闭合，不参与这条，漏写 `</p>` 不影响后面识别。
- 识别门槛（D15）与围栏 HTML 不变。用例见 `htmlRenderer.test.js` 的两条 T72 测试与 `dev/fixtures/html.mjs` 的 `COMMUNITY_HTML`。

**T75 增补（I057–I059，2026-10-21，Opus 按 D32 交付；只增不改）**：
- `renderMessage` 的返回多一个字段 `displayText`：显示正则跑完、Markdown 之前的正文（`html` 就是从它格式化来的）。旧字段不变。
- UI 在 `displayText` 上调 `detectHtmlBlocks`，因为排好版的正文是它变来的，标签序列才对得上。只用原文判断"模型自己写没写裸 HTML"：写了，就框正则之后的那几段（I057）；没写，只框正则产出的整页（含 `<html>`/`<body>`，I058），普通正则美化（`<style>` + 盒子）照旧在正文里，与 ST 一致。`detectHtmlBlocks` 本身没改。
- `formatter.js` 新导出 `cleanStyleText(text, allowExternal, {scope}?)`：正文里的 `<style>` 不再因 `@keyframes`、`@font-face`、`url(`、反斜杠整段删除（I059），改为用浏览器 CSS 解析（未挂载的 `CSSStyleSheet`，不加载资源）后逐条重建：
  - 保留普通规则、CSS 嵌套、`@media` / `@supports` / `@container` / `@layer`；
  - `@keyframes` 保留并改名为 `stcr-kf-<原名>`（经 `CSS.escape`），同一段里 `animation*` 的引用一起改，不覆盖 ST 或阅读器自己的动画；
  - 丢弃 `@font-face`、`@import`、`@namespace`、`@page`、`@scope` 等其余 @ 规则；
  - 单条声明：含 `image-set(` 的丢弃；自定义属性（`--*`）带反斜杠的丢弃（它们保留原样转义，代入后可能拼出 url）；其余值是浏览器规范化后的结果，`url()` 交给 `filterCssUrls`；
  - 给了 `scope`（正文用 `#stcr_chat .mes_text `）时，顶层和 @ 分组里每条规则的每个选择器都必须以它开头，否则整条丢弃。ST 自己的 CSS 解析器和浏览器对畸形文本理解不同，ST 加过前缀的文本到了浏览器里仍可能读出不带前缀的规则；
  - 行内 `style=""` 的策略不变（T73）。
- 新模块 `cssDeclarations.js`：`cssDeclarations(style)` → `{name,value,important}[]`，分项为空（含 `var()` 的简写）时换成所属简写。卡片快照（T73）与 `cleanStyleText` 共用。

**给 UI（I038）**：签名与四个字段均未改，但 raw 的“永远整楼/只有一段”假设已失效。按 start/end 切出前后及段间原文，交给原有正文格式化/脱敏与锚点管线；逐块把 block.html 交给 createSandbox。不能在改写后的 HTML 字符串上套用原文偏移，也不能继续整体隐藏 `.mes_text`。人类明确指定本次 UI 接线留给 Opus，因此 T51 未改 `src/ui/`；正式阅读器尚待接线，开发演示只证明 core 合同。

交互文档的 CSP 默认包含 `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:`，并禁止 object、base、表单提交和网络连接。允许外链时只在 style/script/img/font/connect/media 指令追加 `https:`，不开放明文 HTTP，也不赋予同源、弹窗、表单或顶层导航能力。外部资源的地址来自输入 HTML，core 没有固定第三方服务，也不保存允许状态。

默认断网还在可信外壳的离线 DOMParser 文档中先移除声明式 link/src/srcset、外部 script、资源 CSS（保留内联脚本/事件用于游戏交互）；用户原字符串不变。这样带外链字体/CSS 的合成样本在**内容文档**的 performance 资源列表中没有外链条目。没有清空 performance 或伪造条目：单靠 CSP 时 Chrome 会记录已被拒绝的资源，因此预处理与 CSP 两者都保留。脚本运行后主动创建的外链仍由 CSP 阻断，浏览器可能记录这些被拒绝的尝试。显式允许交互网络时不做这一步资源移除。D23 的静态导出先将外链 CSS/图片/字体转为 data 资源，再去掉尚未内嵌的 URL；显式 allowNetwork:false 时直接去除外链，绝不调用资源读取器。

交互 iframe 内还有一层可信外壳：只加载 about:srcdoc 子文档，外壳与用户内容都不给 allow-same-origin；用户脚本无法更改外壳的 frame-src。这使内容脚本通过 location 或链接发起的整页外链导航也受约束。高度消息由外壳核对内层 source/token 后转发，宿主再次核对 iframe.contentWindow/token/有限高度；旧 token、其他窗口与越界值不生效。width 限 1–8192 整数，动态高度限 1–16384；首次高度等待 15 秒，未挂载或加载失败会拒绝并销毁。UI 关闭/翻页/重建时必须 destroy，onHeight 用于展示或布局，不能把消息当宿主命令。

T51 透明默认值：内外两层 iframe 都设 `allowtransparency="true"` 与 `background:transparent`，外壳 html/body 透明；内容前置 `@layer{:where(html,body){background:transparent}}`，使用首个匿名层与零特异性，不使用行内样式或 important 压住内容。内容自己的 body/html 样式、行内背景、通配选择器与后续 @layer 均照常覆盖默认值；断网/联网模式相同。UI 外框样式及宽度属于 T52，不由 core 移除。`await stcrSelfTest({core:false,htmlRenderer:true})` 包含两层 computed style、散文不进实际快照、多段独立性与清理验证；`await stcrHtmlBoundaryDemo()` 展示完全虚构的 T51 混排样本（仅开发实例）。

首次高度及变更上报使用微任务，不能依赖 requestAnimationFrame：Chrome 会暂停视口外跨源 iframe 的动画帧，阅读器预加载或自动测试时仍必须完成 ready。ResizeObserver、MutationObserver、字体就绪、load/resize 共同触发测量；同一高度不重复发送。宽度保持指定像素，较窄父容器由 UI 提供横向滚动，不能通过 max-width 悄悄改变排版宽度。

I041（2026-10-02）：高度统一取根盒与 body 的实际文档坐标边界，向上取整；根盒包含折叠后的外边距。不能因 `html.scrollHeight > html.clientHeight` 是否成立就在两套量高算法间切换，也不能用当前视口高度做下限。额外滚动范围仅作为检查脱离文档流元素的提示；补测其实际边界时跳过固定定位和内部裁切/滚动区的后代，避免撑开网页自己限高的滚动区。交互展开、收起都可调整高度，update 重建不沿用旧高度。未添加 overflow:hidden 掩盖溢出，内容样式、透明背景与两层沙箱权限不变。接口和消息字段均不变，Opus 的 onHeight 布局回调无需改签名。

静态副本去 script（包括模板和 SVG 内脚本）、事件属性、iframe/object/embed、meta/link/base、导航/表单目标、SVG 动画；去远端图片与含远端 URL 的 CSS 声明，保留无网络展示 CSS、data/blob 图片和 data 字体。CSS 动画/过渡停止。D23 默认只读拉取 HTML 的 link stylesheet、CSS @import/url、img 与 SVG image 等引用，解析 CSS 相对地址并内嵌为 data；跨站按 CORS 且 credentials:omit，同源资源使用 same-origin 会话。没有固定服务域名、代理或上传。重复 URL 在单次准备内缓存；单资源 5 MB、累计 20 MB、最多 128 项、单请求 12 秒、样式嵌套 8 层。CORS/网络/限额失败通过 onWarning 与 warnings 提示并去除该资源，保留其余内容；解码错误仍拒绝，不生成损坏图片。静态文档与最终截图器始终禁网，截图器不会再自行补资源。静态文档最高 16384 CSS px；实际高清整图最多 3200 万像素、每边不超过 32768 像素，在分配截图画布前校验。超限明确拒绝并建议降低倍数或减少内容，不能静默缩小。先截整图再裁剪，小裁剪不能绕过原图上限。所有失败路径释放自己的 iframe/计时器/位图。

I029 验收返修：原来硬编码 scale=1，在高像素密度屏幕或放大查看时容易模糊。现直接让截图器以 scale 重新栅格化文字和矢量内容，不把已生成的 1 倍 PNG 拉大；裁剪源坐标、目标宽高同时乘 scale，不再降回 1 倍。原文排版 width 与 crop 的 CSS 坐标含义不变；需要旧尺寸时显式传 scale:1。例如 width=768 的完整 PNG 默认宽 1536；crop={x:100,y:50,w:300,h:180} 默认输出 600×360。输入中的低分辨率位图不会凭空获得更多细节。

开发演示已移除固定左上角入口。在**脱敏的静态 PNG** 上任意拖出选区、拖动内部移动、拖四角改大小、清除后重画，支持反向拖动和方向键微调（Shift 为 10 CSS px，Escape 清除）。预览按 CSS 排版宽显示、较窄时等比例缩小；换算使用图片实际 getBoundingClientRect 与 CSS 文档尺寸，不能用屏幕像素直接裁剪。样本/排版宽度/清晰度变化会清除过期预览，关闭或切换后到达的旧异步结果被丢弃，Blob URL 随替换/关闭释放。T44b 可参考内部 htmlCrop.js / htmlCropPreview.js；正式 UI 的接线仍由 Opus 完成。

导出取传入的 HTML 字符串；可传初始 HTML，也可传 await handle.snapshot() 的当前画面。快照通道经过内容 → 可信外壳 → 宿主，逐跳核对 source/token/requestId，回包仍是不可信 HTML，绝不直接写入宿主。序列化在脱离页面的克隆中进行，不重跑游戏、不写活 DOM；保留动态文本/类名/样式、details、勾选状态、可读 canvas/视频像素、CSSOM/采用的样式表及动画当前值。表单可见值转换为惰性文本后才脱敏；密码仅保留占位符，文件输入不带值。滚动提示存在 data-stcr-shot-scroll，renderStatic 完成字体/图片/布局后还原，PNG 开启 restoreScrollPosition。开放 Shadow DOM 或受 CORS 污染的画布明确拒绝；关闭的 Shadow DOM、仅 JS 内存状态、跨域不可读像素与图片中的文字不是通用可还原/OCR 范围。脱敏边界沿用 §5.12：只替换文本节点，不跨标签；不修改属性、CSS 文本或图片像素，故 CSS 生成内容/表单 value/图片中的名字不在文本脱敏范围内。assets 不触发图片读取，字符串替换为 `[图片]`；文字背景色仍不插入新 span。不能把这个出口说成对任意 HTML 全部可见内容进行 OCR 脱敏。

```js
const view = createSandbox(block.html, { width: 390, allowNetwork: true, onHeight: height => updateHeightLabel(height) });
container.append(view.iframe);
await view.ready;
// D22：UI 按 Aa 默认值或本次逐块选择显式传入；core 省略此项仍为 false。
await view.update(block.html, { width: 768, allowNetwork: true });
// 当前画面快照；默认带上 HTML 引用的展示资源，不重跑游戏。
const currentHtml = await view.snapshot();
const png = await exportRenderedHtml(currentHtml, { width: 768, scale: 2, maskWords: ['虚构秘密'], rules: [], crop: { x: 100, y: 50, w: 300, h: 180 } }); // 600×360 PNG
view.destroy();
```

**已脱敏快照**：UI 若在创建交互沙箱前已应用阅读脱敏，导出须传 alreadyMasked:true；这会关闭自动名字与我的规则的再次替换（避免 A→B 又变 C），但追加 maskWords 仍有效。界面须说明取自当前显示，不能承诺关闭替换开关能恢复原词。此模式不对脚本后来新增的文本或表单值重跑替换规则；这些内容仍可用屏蔽词遮盖。它不是按新规则重新计算全部当前画面的原始文本映射。未脱敏沙箱传 false，截图规则正常应用。长图与当前可视滚动是不同选择；展开长图后滚动区自然回到顶部，保留当前画面时不要先展开。

**UI 接入通知（I032）**：entryFor 增加由 view.snapshot 提供的调用入口；截图窗口打开时捕获一次当前 HTML，之后宽度/清晰度/裁剪都复用这份快照，避免用户继续点击游戏后裁剪另一个结局。onWarning 显示在窗口内；保留显式断网时向 renderStatic/exportRenderedHtml 都传 false。关闭/切换可用 AbortController 取消。默认资源读取遵守浏览器 CORS；不调用后端代理。

`transformHtmlOffline` 为 T41/T44a/I032 共用的内部解析适配器（现可等待异步变换），不改变 maskHtmlString 的异步签名；`offlineCaptureGuard` 为 T14/HTML 共用的拒绝 fetchFn 和资源错误检查。未改 src/ui。I032 专项为 `await stcrSelfTest({core:false,htmlSnapshot:true})`，含实际 PNG、外链资源替身与已有 Ny 本地字体的外链模拟。开发自测入口为 `await stcrSelfTest({core:false,htmlRenderer:true})`；交互演示为 `await stcrHtmlDemo()`，仅在 localhost:8100 安装。

策略依据：[CSP frame-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-src) 与 [CSP 规范](https://www.w3.org/TR/CSP/)。除了检查 CSP 字符串，本卡还在浏览器中检查内容窗口的 performance 资源记录及子框架请求，避免仅凭属性字符串判定断网。

### 5.14 内存缓存与后台变化通知（T53 / T57 / T71；D24 / D28 / D34）

缓存只在当前页面内存，默认 3 个聊天、150,000,000 字节估算上限。原始数组、深度索引、冻结角色与 header 快照、已建模型和页均计费。close 只释放本句柄；LRU 淘汰不破坏其他活动句柄。刷新页面清空，不写 store / IndexedDB / localStorage。

| 签名 / 字段 | 约定 |
|---|---|
| `openChat(chatKey,{pageSize=30,signal,reload=false}={})` | 仍返回 Promise<ChatHandle>。命中不等待任何网络，直接复用快照；冷读保持只读角色/群组、search 与正文 get 顺序。reload:true 仅丢弃目标键的缓存及其校验结果，然后强制冷读；其他聊天保留，旧活动句柄继续可读。失败抛错，不把空聊天冒充成功 |
| `handle.cacheHit` | boolean，是否从内存直接返回；可用于诊断，不能当作“文件最新”的保证 |
| `handle.stale` | boolean，当前快照是否已确认发生变化；关闭后抛 CLOSED。一旦变化便保留标记，直到显式读取新快照 |
| `handle.onStale(callback)` | callback 为同步函数，收到冻结 `{chatKey,reason:'changed'\|'missing',checkedAt:number}`，时间为毫秒时间戳。返回幂等退订函数；每个订阅至多通知一次。晚于校验订阅也会在微任务补发；关闭/退订可以取消尚未发出的通知。单个回调抛错记录后继续其他回调，不破坏校验 |
| `handle.validation` | 本次打开对应的 Promise，结果为冻结 `{state:'loaded'\|'fresh'\|'stale'\|'error'\|'discarded',checkedAt:number\|null,durationMs:number,code?:string}`；只用于诊断或额外状态，**首屏不能 await**。冷读返回 loaded、null、0；命中共享同一个在途校验。fresh 是摘要一致；stale 是已确认变化；error 表示未能校验；discarded 表示清空/淘汰/重载后旧校验作废 |
| `handle.close()` | 幂等，自动退掉本句柄全部通知；不取消其他句柄或该缓存项的后台校验，不自动重取正文 |

**T71 / D34 改写校验时机（取代下句原文“结果保留 60 秒”）**：
- **宿主当前聊天**（`getCurrentChatKey()` 等于该键且 `getContext().chat` 是数组）：命中时用纯函数 `matchesHostChat(快照楼, 宿主 chat)` 同步比对楼数、末楼 `send_date`、各楼候选数与 `swipe_id`（单候选有无 `swipes` 数组等价），零网络。一致 → 直接复用，`validation` 立即为 `{state:'fresh', source:'host'}`；不一致 → 当作 `reload:true` 冷读，不发变化通知（不弹横幅）。ST 是**先发事件、后存盘**（`MESSAGE_SENT` 在 `saveChatConditional()` 之前），所以当前聊天冷读后若文件仍落后于宿主内存，等 250 / 500 / 1000 ms 各重读一次，仍不一致就返回读到的文件内容（下次打开再比）。
- **非当前聊天**：每次命中都后台 search 一次，不复用结果（含错误结果）；同时在途的校验共享一个。search 等浏览器空闲（`requestIdleCallback`，至多 500 ms；Node 为 setTimeout 0）再发，不与首屏渲染抢时间。横幅只在这条路径发现变化时出现。
- `invalidateChat(chatKey)`：同步去掉该键的缓存项与在途冷读、中止其后台校验，不预取、不读文件；返回是否有东西被作废；坏键 / 空值返回 false。已打开的旧句柄照常可读。
- `watchHostChatEvents()`：只读订阅 `INVALIDATING_EVENTS`（`MESSAGE_SENT / MESSAGE_RECEIVED / MESSAGE_EDITED / MESSAGE_DELETED / MESSAGE_SWIPED / MESSAGE_UPDATED / CHAT_CHANGED / CHAT_DELETED / GROUP_CHAT_DELETED`），回调只调 `invalidateChat(getCurrentChatKey())`；两个删除事件另按载荷文件名 / 群 ID 作废已缓存的其他键。回调里不碰 chat / chatMetadata、不调任何保存。返回幂等退订函数；index.js 在 APP_READY 订阅、pagehide 退订。
- `getChatCacheStats()` 新增计数：`liveChecks / liveReloads / eventInvalidations / hostSaveWaits`。`createChatSource` 新增可选注入 `wait(ms, signal)` 仅供测试。
- UI：顶栏“重新读取”（`fa-rotate-right`）调 `openChat(key, {reload:true})`，读成功才换正文，失败保留旧正文。

以下为 T57 原文，“60 秒”部分已被上面取代：第一次缓存命中时后台调一次 search；校验完成后的结果保留 60 秒（包括错误结果，以免连续开关反复打请求），到期后再次打开才重新校验，没有定时轮询。文件大小、末消息日期或楼数变化为 changed，摘要中找不到文件为 missing。缺字段/断网不报“最新”，也不凭空报变化；有旧正文仍可读。后台请求 20 秒超时，错误结果 code 为 TIMEOUT / INCOMPLETE_SUMMARY / HTTP_<状态> / VALIDATION_FAILED。已确认的 stale 不因后续失败或摘要变回而撤销。

clearChatCache、LRU 淘汰和 reload 会中止被移除项的后台请求；即使传输忽略取消，迟到响应也不能通知、重填缓存或污染新快照。冷读共享请求仍由独立 signal 管理，全部等待者取消才中止；显式重载与清缓存隔离在途旧冷读。signal 只负责取得句柄之前的取消，取得后由 close 管理订阅生命周期。

**I042 合同变化通知给 Opus**：命中时角色卡/群 header 也使用已缓存快照，不再每次刷新它们，否则首屏仍依赖网络。显式 reload 或刷新页面会更新；当前扩展设置与正文格式化仍走原管线。修改聊天摘要无法覆盖任意原地改字或只改角色卡的情况，这个限制不能对用户省略。

T59 接线示例（T57 只交付 core，不实现横幅）：

```js
const handle = await openChat(chatKey, { signal });
// 立即渲染 handle.page(0)，不要 await handle.validation。
const unsubscribe = handle.onStale(({ reason }) => {
    // UI 顶部显示“此聊天有新内容，点击重新加载”；missing 可提示文件已移除。
    showReloadBanner(reason);
});
// 人类点击后：新句柄加载成功再换 UI；失败保留旧正文并提示错误。
const next = await openChat(chatKey, { reload: true, signal });
unsubscribe();
handle.close();
// 将 next 交给显示管线，并为新句柄重新订阅。
```

Node 覆盖三种变更、失联/缺字段/删除、每次命中都校验（T71 前为 60 秒边界）、当前聊天实时比对与存盘延迟重试、事件作废与九个事件的订阅 / 退订、并发、晚订阅/退订、抛错、关闭、清空/淘汰/重载竞态；浏览器以实际只读 API 与正式阅读器计时，变化通知使用响应副本模拟，不修改聊天文件。`dev/test-release.cmd` 依次运行 Node、UI、缓存性能与完整浏览器、五主题 × 三显示模式及只读审计。

### 5.15 版本与更新合同（T54a / D25）

```js
import { getVersion, checkUpdate, runUpdate, getChangelog,
    getLastSeenVersion, markVersionSeen } from './src/core/updateService.js';
const version = await getVersion();                    // '0.2.0'，来自自身 manifest
const result = await checkUpdate();                    // 下表；不改已读标记
const sections = await getChangelog();                 // [{ version, markdown }]，文件顺序
const lastSeen = await getLastSeenVersion();            // string | null
// UI 确实展示过该版本日志后才标记；获取失败 / 还未展示不能提前标记。
if (lastSeen !== version) {
    const section = sections.find(item => item.version === version);
    // UI 展示 section.markdown；经 ST 的 Showdown + DOMPurify 转换，不能直接 innerHTML。
    // await markVersionSeen(version); // 展示成功或关闭“本次更新”面板后调用
}
// 人类点击“立即更新”后 await runUpdate()；绝不自动调用。
```

`getVersion()` 与 `getChangelog()` 每次 GET 自身同源文件（禁重定向、no-store），读取失败抛 `StcrUpdateError {code,message,status}`。不写死界面版本，也不把 Git commit 当语义版本。日志仅按 `## x.y.z` 切段，可带预发布 / build 与空格分隔的日期；忽略 BOM、统一 CRLF，围栏内的假标题不切段，三级标题留在正文。返回 Markdown 字符串而非可执行 HTML，不请求日志内的链接。T54a 交付时为 0.1.0；T57 已升为 0.2.0。

`checkUpdate()` / `runUpdate()` 均返回结果对象，错误也返回 `state:'error'`；所有结果有 `state, message, version`（manifest 未读到时 version 为 null）。状态及附加字段：

| state | 含义与附加字段 | UI 行为 |
|---|---|---|
| `dev` | `message:'开发目录，不可更新'`；`global:boolean|null`、`reason:'development-instance'|'no-git-remote'` | 正常提示；禁用立即更新 |
| `latest` | 已最新；`global`、`currentBranchName`、`currentCommitHash`、`remoteUrl` | 提示已最新 |
| `available` | ST 的 isUpToDate 为 false；同上 | 显示立即更新；尚不知道远端 manifest 版本，不伪造“新版版本号” |
| `updated` | update 成功；继承检查字段，新增 `shortCommitHash`、`alreadyUpToDate`、`requiresReload:true` | 提示刷新；version 为操作前读到的版本，不当成更新后版本 |
| `error` | `code`、`httpStatus:number|null`，中文 message | 显示可重试错误；不得当成 dev 或最新 |

调用顺序与边界：
- manifest 的开发标记优先；否则 POST version，用户目录 `global:false` 优先，只有 404 才尝试 `true`。用户目录存在但非 Git / 无远端时返回 dev，不悄悄更新另一份全局副本。两处均 404 为 NOT_FOUND。ST 1.14.0 无 Git 时返回空 remote/hash；500 只识别明确的非 Git / 缺 origin 错误；普通断网、鉴权失败仍为 error。
- `runUpdate()` 每次先检查；只有 available 才 POST update，且只更新确认的位置。失败不跨目录重试。即使另一个窗口抢先完成、update 返回 isUpToDate:true，本页仍提示刷新，因为脚本可能还是旧版。连接中断提示“可能已生效，请刷新并重新检查”，不自动重试更新。
- 同一单例的同时检查 / 同时更新各合并为一个 Promise，防止双击重复 Git 操作。没有定时检查、无自动 Git 更新、没有第三方浏览器请求。读取超时 20 秒、检查 60 秒、更新 120 秒；服务端 Git 操作不因浏览器超时自动撤销。
- body 固定自身目录名 st-reader；GET 只接受当前 origin 下自身目录，POST 仅上述两个接口，带 ST getRequestHeaders() / CSRF 与同源凭据。只读 guard 禁用清单完全不变。
- 已读值用 `store.settings` 键 `lastSeenVersion`，未记录/旧值不合法返回 null；`markVersionSeen(version)` 校验后单独写此键，不覆盖其他设置，不修改聊天。首次安装的 null 是否弹日志及“更新提醒”开关由 T54b UI 决定；关闭提醒时如何推进标记也由 UI 显式调用，core 不暗中标记。

**开发联接保护**：固定 `.dev` 启动器的预载模块仅在本进程对阅读器 manifest 响应加 `X-STCR-Dev-Directory: 1`。check/run 看见标记立即返回 dev，零 Git 请求。本仓库现已有 origin，不能再以“联接一定没有远端”作为前提；此标记不改 manifest、不写宿主源码、正式 ST 没有此标记。未打标记的普通非 Git/无远端安装仍通过 ST version 响应判定。浏览器不能通用地识别服务端 NTFS 联接；正式实例人工联接到已有远端的 Git 工作目录会遵循 ST 的更新行为。

Node 的 `testUpdateServiceLogic` 用响应替身覆盖两安装位置、dev / 失败区分、双击去重、更新失败不重试、日志解析、已读持久化。浏览器 `stcrSelfTest({core:false,updateService:true})` 读真实 manifest / CHANGELOG，验证开发提示、零 Git、独立 settings 与宿主不变；`stcrUpdateDemo()` 显示开发验收面板。均只挂本机 8100；未修改正式 src/ui，Opus T54b 按本合同接线。`createUpdateService` 工厂仅用于注入测试传输 / settings，UI 应使用上述单例方法。

**T70 增补（D33，见 §5.16）**：默认单例的已读值改为先读写 ST 的 `extension_settings['st-reader'].lastSeenVersion`，同时仍写 `store.settings` 同名键；ST 设置里没有时回落读 store（0.2.x 升级上来的人）。函数签名与返回不变；`createUpdateService({settings})` 注入方式不变。

### 5.16 自动备份到 ST 服务器（T70 / D33，2026-10-21，Opus 按 D32 交付）

IndexedDB 仍是主存与读取路径；本节只**增加**接口，§5.5 已有签名与行为不变（唯一可见差异：`importAll` 无新增时不再推进修订号）。

**store 增补**（`import { store, mergeNewer } from '../core/store.js'`）

| 签名 | 约定 |
|---|---|
| `store.onChange(listener)` | 每次**数据**提交后同步回调 `{rev}`；返回退订函数。只改元信息（`exportAll` 记导出时间、`markSynced`）不通知。回调抛错只记日志 |
| `store.revision()` | `{rev, syncedId, syncedRev, empty}`。rev：本地修订号（每次数据变更 +1，旧快照按 0）；syncedId / syncedRev：上次与服务器一致时那份的 mirrorId 与本地 rev；empty：六类全空 |
| `store.snapshot()` | 只读：`{json, rev, bytes}`；json 与 `exportAll()` 同格式，另带顶层 `rev`，**不**记“上次导出”、不改修订号；超 24 MiB 抛 `BACKUP_TOO_LARGE` |
| `store.markSynced({id, rev})` | 记同步标记；不 bump、不通知 |
| `store.mergeBackup(json)` | D33 合并，返回 `{report:{分类:{added,updated,kept}}, changed, localNewer}`；与 `importAll` 同样完整校验。修订号先取 `max(本地, 文件 rev)`，有改动再 +1 |
| `mergeNewer(target, incoming)` | 纯函数（就地改 target）：记录同 id 以 `updatedAt` 新者胜，本地独有 / 较新保留；屏蔽词并集；设置只补本地没有的键（本地已有的键保留本地值）；最后校验图片引用 |

**`src/core/hostSettings.js`**：`hostSettings.available()`、`hostSettings.read()`（冻结副本）、`hostSettings.patch(patch)`（写 `getContext().extensionSettings['st-reader']` 后调 ST 的 `saveSettingsDebounced()`；只接受 `rev / mirrorId / mirroredAt / bytes / lastDaily / dailies / lastSeenVersion / updateNotice`，其他字段抛 TypeError）；`hostBackedSettings(storeSettings)` 给 updateService 用；`foreignExtensionSettings(settings)` 仅供测试快照去掉本扩展那一格。只碰这一格，不碰 chat / chatMetadata，不调聊天保存。

**`src/core/backupService.js`**（单例导出；`createBackupService` 工厂仅测试注入）

| 签名 | 约定 |
|---|---|
| `startBackup()` | 扩展加载后（index.js，`store.ready()` 之后）调一次：订阅 `store.onChange` → `scheduleMirror()`；`pagehide` → `flushMirror({keepalive:true})`；按 `planSync` 做启动合并。返回 Promise `{restored: report\|null, error?}`，不抛错 |
| `whenStarted()` | 上面那个 Promise；未启动为 null。UI 打开阅读器前最多等 5 秒，以便读到恢复回来的阅读设置 |
| `scheduleMirror()` | 3 秒防抖；状态变 `pending` |
| `mirrorNow({force=false}={})` | 立刻写；无改动且已同步时跳过（force 例外）。永不抛错，返回最新状态。并发调用合并成一次，期间的新改动写完后再补一次 |
| `flushMirror()` | 有排队才写（关阅读器、pagehide） |
| `restoreFromServer()` | 手动合并：`{ok:true, report}` 或 `{ok:false, code, message}`；服务器没有文件为 `NO_BACKUP` |
| `getMirrorStatus()` / `onMirrorStatus(fn)` | 冻结 `{state:'never'\|'pending'\|'saving'\|'ok'\|'error'\|'unavailable', mirroredAt, bytes, rev, code, message, restoredAt}`；mirroredAt / bytes 启动时取自 ST 设置 |
| 纯函数 | `planSync({local, host})` → `'restore'\|'mirror'\|'none'`；`planRotation(names, keep=7)`；`dailyCandidates(today, known)`；`dailyName(date)`；`toBase64(text)` |

写入顺序：`store.snapshot()` → UTF-8 → base64 → `POST /api/files/upload {name:'st-reader-backup.json', data}`（ST 用 write-file-atomic 覆盖写到当前用户 `user/files/`；文件名须匹配 `^[a-zA-Z0-9_\-.]+$`，已在 ST 1.14.0 `src/endpoints/files.js` 核对）→ 当天第一次另传 `st-reader-backup-YYYYMMDD.json`（本地日期）→ 轮替 → `hostSettings.patch({rev, mirrorId:新 UUID, mirroredAt, bytes, lastDaily, dailies})` → `store.markSynced`。读回走静态 `GET /user/files/st-reader-backup.json`（`cache:'no-store'`），404 视为“没有备份”。

轮替：ST 没有列目录接口，用 `POST /api/files/verify {urls}` 探测“记录过的日备份 + 最近 40 天”的文件名是否存在，按日期留最新 7 份，其余 `POST /api/files/delete {path:'user/files/<名>'}`；只处理匹配 `^st-reader-backup-\d{8}\.json$` 的名字，删失败下次再试。轮替失败不影响主文件。

启动合并（`planSync`）：ST 设置里没有 mirrorId → 先探文件（防 settings.json 被重置）；本地空 → 合并；`syncedId ≠ mirrorId`（别的浏览器写过 / 本浏览器从没同步过）→ 合并；ST 记的 rev 大于本地 → 合并；本地 rev 大于 syncedRev → 备份；否则不动。合并后本地有服务器那份没有的内容才回写。**启动合并没成功（读服务器失败、非 404）之前绝不写服务器**，避免清空过的浏览器用空数据覆盖备份。mirrorId 用随机 UUID 而不是只比 rev：两个浏览器各自计数会撞号。

错误码：`HOST_UNAVAILABLE`（ST 设置接口不可用 → 状态 unavailable）、`HOST_NOT_READY`、`FILES_UNAVAILABLE`（上传 404，例如精简后端）、`FORBIDDEN`、`HTTP_<状态>`、`TIMEOUT`、`NETWORK`、`NO_BACKUP`、`BACKUP_TOO_LARGE`。超时 60 秒。`pagehide` 时请求体小于 60000 字符才用 `keepalive`，且不写日备份。

D02：以上接口不写 chats 目录、不碰聊天；`readonlyGuard.js` 名单不变。`dev/audit-readonly.mjs` 新增 `userFiles` 类：`/api/files/`、`/user/files/` 只许出现在 `backupService.js` 与其两个测试文件，出现在别处即失败。

测试：Node `testBackupServiceLogic`（11 项，内存替身的 user/files 与 extension_settings）覆盖 rev 比对、合并规则、7 份轮替只删自己、空浏览器不覆盖、两浏览器并集、接口不可用的提示、已读版本回落。浏览器 `dev/test-performance.mjs --backup`（已进 `test-release.cmd`）在 8100 真写 `.dev/data/default-user/user/files/`，断言服务器文件与磁盘文件的数据 = `exportAll()`，再只删 `st-reader` 这个 IndexedDB 库（不清整站，免得清掉 Ny 字体等宿主数据）、刷新，断言自动恢复，最后删掉标记批注并再备份一次。

UI 接线（Opus）：Aa → ⋯ “备份”两行：`mirrorStatusText(getMirrorStatus())`，按钮“立即备份”=`mirrorNow({force:true})`、“从服务器恢复”=`restoreFromServer()`，旁边保留导出 / 导入 JSON；第一次打开阅读器时若启动合并恢复了内容，toast `restoreSummary(report)`；关阅读器 `flushProgress().finally(flushMirror)`；“更新后提醒”开关同步写 `hostSettings.updateNotice`，加载时以 ST 设置为准。
