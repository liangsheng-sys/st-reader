# 03 · 技术规格

维护者：astra。§1–§4 由规划者起草并已核实；§5 接口由 astra 在 T12 补全并保持最新，Opus 只依赖 §5。

## §1 宿主环境（2026-09-28 已核实）
- 目标 ST 版本 **1.14.0**（用户真实实例 `F:\Claude\xinllm\SillyTavern`）。`minimum_client_version` 设 1.13.0。
- 扩展加载位置：`data/<user>/extensions/<name>/`（酒馆助手就装在这里）或 `public/scripts/extensions/third-party/`。`manifest.json` 支持 `hooks.activate`。
- `SillyTavern.getContext()` 可用项（节选）：`chat, characters, groups, name1, name2, characterId, groupId, chatId, chatMetadata, extensionSettings, powerUserSettings, eventSource, event_types, messageFormatting, substituteParams, getThumbnailUrl, openCharacterChat, openGroupChat, getCurrentChatId, getRequestHeaders, renderExtensionTemplateAsync, Popup, callGenericPopup, isMobile, saveSettingsDebounced, parseReasoningFromString, t`。
- `SillyTavern.libs`：`lodash, Fuse, DOMPurify, hljs, localforage, Handlebars, moment, showdown, yaml` 等。
- 只读 API（均 POST，带 `getRequestHeaders()`）：
  - `/api/chats/recent` `{pinned:[], max, metadata}` → `ChatInfo[]`（含 `avatar` 或 `group`）
  - `/api/characters/chats` `{avatar_url, simple?}` → 该角色的聊天列表
  - `/api/chats/get` `{avatar_url, file_name}` → `[header, ...messages]`
  - `/api/chats/group/get` `{id: group.chat_id}` → `messages[]`（没有独立 header）
  - `/api/chats/search` `{query, avatar_url, group_id}` → `[{file_name, file_size, message_count, last_mes, preview_message}]`
  - `/api/characters/all` → 角色列表（ChatVault 用的就是它）
  - `/api/characters/get` `{avatar_url}` → 完整角色卡（含该角色的作用域正则）
  - `/api/groups/all` `{}` → 群组定义（成员、聊天 ID、元信息）
  - 注意：`/api/chats/get` 在角色 chat 目录不存在时会 `mkdirSync`，属于宿主行为，可接受。
- **禁用**（D02）：`/api/chats/save|rename|delete|import|group/save|group/delete|group/import`，以及 context 上的 `saveChat, deleteMessage, deleteLastMessage, renameChat, clearChat, addOneMessage, updateChatMetadata, saveMetadata`。
- 服务端 CLI：`--dataRoot`、`--configPath`、`--port`、`--listen`。开发实例见 D03。
- T10 启动器：`dev/start-dev-st.cmd` → 原生 Node `start-dev-st.mjs`，首次从 `dev/config.dev.yaml` 创建被忽略的 `.dev/config.yaml`；固定 D03 数据路径，创建扩展目录联接，临时目录固定在 `.tmp/`。`--import dev/isolate-dev-st.mjs` 只在开发进程内将 `PUBLIC_DIRECTORIES.globalExtensions/backups` 指向 `.dev/`，防止管理扩展时宿主对 F 盘全局扩展执行 Git 检查（I007），不修改宿主文件。
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
```
extension/
  manifest.json / index.js / style.css
  src/core/   (astra)
    chatSource.js     只读 API 封装；chatKey 规范；header 解析；大文件按楼分页（每页 N 楼，默认 30）
    messageModel.js   楼层→视图模型 {index, name, isUser, isSystem, date, swipes:[{text, reasoning, reasoningDuration}], swipeId}
    regexPipeline.js  为目标角色/群成员收集 GLOBAL/SCOPED/PRESET 显示类脚本；按该聊天算 depth；runRegexScript 逐条
    formatter.js      正则后文本 → 安全 HTML（markdown、hljs、DOMPurify）；思维链同样处理
    hostRuntime.js    缓存宿主模块加载；仅供 core 内部
    textTransforms.js 纯文本引用与字面量脱敏变换；Node/浏览器共用
    cssScope.js       克隆 #chat → #stcr_chat 规则；监听新增 style/link；主题切换重跑
    store.js          localforage 实例 'st-reader'：annotations / bookmarks / maskWords / settings / replaceRules / assets
    assetCodec.js     store 内部：本地小图片验证、SVG 清洗与 data URL 备份
    anchor.js         文本引用锚点 {exact, prefix, suffix} 的生成与重定位
    cardExport.js     DOM 节点 → 脱敏变换 → PNG Blob
    readonlyGuard.js  开发期：包装 fetch，命中禁用接口即 throw 并 console.error
  src/ui/     (Opus)
    reader.js drawer.js floorToolbar.js selectionPopover.js cardStudio.js settingsBar.js annotationsPanel.js
    templates/*.html  Handlebars（renderExtensionTemplateAsync('third-party/st-reader/src/ui/templates', name)）
  vendor/modern-screenshot.mjs
dev/   start-dev-st.cmd  fixtures/gen.mjs  selftest.mjs
install/ link-to-my-st.cmd
```
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

最后在正则后的 DOM 文本节点查找屏蔽词，支持跨 em/strong/高亮 span，隔离段落/楼层边界，跳过 style/script/按钮和替换片段。删除原词后放入 `<span class="stcr-mask stcr-mask--bar|block|sticker">`；不是盖在仍存在的字上。bar 为实色直角条、block 为主题色圆角块、sticker 为3个 FA 图标或本地图片。默认统一3em宽；可关闭统一长度，按 Unicode 码点数设置宽度。遮盖元素不含原词，源属性/注释不进入截图副本。

`modern-screenshot` 固定4.7.0单文件与完整MIT许可（见 LICENSES）。副本在禁脚本、禁外网的 srcdoc 中排版，保留可读主题CSS、important、媒体/嵌套规则和伪元素，不改变宿主。仅本地 data 图片与已有可读图片的 Canvas 副本进入导出；不克隆 CSS 资源 URL、@import，禁止依赖补取资源。字体在最终副本构造后收集：用 readonly 事务读取实际使用的 Ny 本地 Blob，内嵌 data URL @font-face；字体解码失败就拒绝。FA 实心图标以宿主已加载字形离线绘制成小PNG。不加载worker，不走CDN。

I009 实证：187208字节的 Ny JetBrainsMono（兼容重复导入别名）实际嵌入PNG；把PNG的拉丁字形与同一已加载FontFace的Canvas参考比较，在允许≤1px行盒取整对齐后像素差为0，serif参考差为513267；另逐像素检查主题薄荷色边线与实心遮盖。没有把“字体名字出现在CSS里”当作完成。

导出边界：没有可读字节的普通URL字体（如ST默认Noto Sans）使用系统回退并通过console.warn / onWarning通知；需要精确字形时在Ny导入本地字体。中文是否覆盖由所导入字体决定，T11 JetBrainsMono只证明拉丁字母/数字。跨域不可读CSS、URL背景图与交互媒体不导出；不为它们发请求。宽≤8192 CSS px，高≤16384 CSS px，倍率1–3，最终≤3200万像素，本卡字体合计≤32 MiB。超限抛错，不静默裁切。

### 4.5 大文件（I005、NF2）
`/api/chats/get` 一次返回整个文件；不能整篇渲染。`chatSource` 只取被打开的聊天，保留原始消息和紧凑深度索引，按页构造视图模型，close 释放正文；UI 翻页时释放上一页 DOM。T12 已实测 21.35 MiB / 1600 楼；T30 新增独立 **55987114 字节 / 53.39 MiB / 4000 楼** fixture，生成器为 `dev/fixtures/performance.mjs`，不修改原 T11 卡片与聊天，数据与报告只在 `.dev/`。

`stcrSelfTest({performance:true})` 驱动真实阅读器（30楼一批、最多120楼），计时到 rAF 后绘制完成的下一任务；测3次打开、8次跨批次、20次分页翻屏、切回小聊天与关闭。`dev/test-performance.cmd` 使用已有 Chrome/Edge、独立 `.tmp` 配置、同源网络拦截和精确 JS 堆读数，主动 GC 后比较，结束清理。普通浏览器缺少主动 GC 时明确输出“内存未验证”，不能据此全勾。验收指标：打开每次 <3000ms；翻屏 P95<100ms、最慢<150ms；预取30楼一批<300ms；切小聊天释放≥70%增量。实测与硬件/窗口/字体/宿主负载相关；T30 多轮有超限，**性能暂不能宣告稳定通过**，见 I020 与 T30 交接。不得挑最快一轮覆盖失败样本。

## §5 core ↔ ui 接口（astra 在 T12 填写，Opus 只依赖这里）
**T12 合同版本 1，2026-09-28。下列已交付接口均有真实实现与可执行测试。** 后续改签名、字段语义或错误行为须登记 06 并在交接信通知 Opus。内部实证接口 `formatWithStrategy`、`loadHostRuntime`、`createChatSource` 不供 UI 依赖。

### 5.1 导入与调用签名

UI 文件位于 `src/ui/` 时从 `../core/chatSource.js`、`../core/formatter.js` 导入。列表函数与 openChat 均返回 Promise；模型、分页、渲染为同步函数。所有下标（页、楼、候选）均从 **0** 开始。

| 模块 | 已实现签名 | 返回与行为 |
|---|---|---|
| chatSource | `listCharacters(options = {})` | `Promise<CharacterSummary[]>`；只有卡片信息，不请求聊天正文 |
| chatSource | `listGroups(options = {})` | `Promise<GroupSummary[]>`；thumbnailUrl 使用第一个成员头像，空群为 null |
| chatSource | `listRecent(max = 30, options = {})` | `Promise<ChatSummary[]>`；max 1–200；忽略无角色/群组的临时聊天 |
| chatSource | `listByCharacter(avatarUrl, options = {})` | `Promise<ChatSummary[]>`；avatarUrl 是 PNG 文件名；无聊天目录返回 [] |
| chatSource | `listByGroup(groupId, options = {})` | `Promise<ChatSummary[]>`；groupId 是群组 ID；通过只读 search 的空查询取摘要 |
| chatSource | `getCurrentChatKey()` | `string \| null`；只读取当前角色/群组及 getCurrentChatId；欢迎页/临时聊天返回 null |
| chatSource | `makeChatKey({avatarUrl?, groupId?, fileName})` | 稳定字符串；单聊提供 avatarUrl，群聊提供 groupId；fileName 是文件 ID，不额外带存储扩展名 |
| chatSource | `parseChatKey(chatKey)` | `{isGroup, avatarUrl, groupId, fileName}`；不可直接用斜线随意拆解转义后的名字 |
| chatSource | `openChat(chatKey, {pageSize = 30, signal} = {})` | `Promise<ChatHandle>`；pageSize 1–100，一次只取指定聊天，不切换 ST |
| formatter | `initFormatter()` | `Promise<void>`；先 await，重复调用可复用；APP_READY 也会初始化 |
| formatter | `renderMessage(handle, index, swipeIndex?)` | `RenderedMessage`；省略 swipeIndex 用模型的 swipeId；从原文重跑一次完整管线 |

所有列表的 `options` 为 `{signal?: AbortSignal}`。`signal` 原样传递给 fetch；取消时抛 `AbortError`，UI 不应弹成失败提示。网络错误保留原错误；HTTP/键/关闭状态使用 `StcrDataError`，`code` 为 `HTTP_<状态码>`、`INVALID_KEY`、`INVALID_RESPONSE`、`NOT_FOUND`、`CLOSED`；越界参数抛 RangeError，聊天坏行抛 TypeError。不要把错误当成空聊天。

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
 * @property {(index:number)=>MessageModel} getMessage 只构建此楼的模型，不返回原始消息
 * @property {(pageIndex?:number)=>{pageIndex:number,start:number,end:number,total:number,pageCount:number,messages:readonly MessageModel[]}} page end 不包含；空聊天 page(0) 返回空页
 * @property {()=>void} close 幂等释放原始正文、深度索引与角色快照；之后 page/getMessage/renderMessage 抛 CLOSED
 */
/** @typedef {{html:string,reasoningHtml:string,model:MessageModel,swipeIndex:number}} RenderedMessage */
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
| `bookmarkId({chatKey,mesIndex,swipeIndex = null})` | 稳定 ID；省略/null 表示整楼，与具体候选收藏可并存 |
| `store.assets.references(id)` | 使用该素材的替换规则数组 |
| `store.assets.remove(id,{removeRules = false} = {})` | 有引用默认抛 ASSET_IN_USE；明确 true 时连同引用规则原子删除 |

备份结构 `{format:'st-reader',version:1,exportedAt,data:{annotations:{[id]:record},bookmarks:{},maskWords:[],settings:{},replaceRules:{},assets:{}}`。导入/导出上限 24 MiB（UTF-8），拒绝未来版本、未知/缺失分类、危险原型键、坏引用；同 ID 素材字节不同则取消导入，避免悄悄更换已有规则的图片。preview 与 import 之间若其他页面有写入，以 import 的最新计数为准。

`StcrStoreError.code`：`UNAVAILABLE / INVALID_STATE / INVALID_DATA / INVALID_BACKUP / BACKUP_TOO_LARGE / ASSET_LIMIT / MISSING_ASSET / ASSET_IN_USE / ASSET_CONFLICT`。聊天键沿用 StcrDataError；图片类型/大小使用 TypeError/RangeError，浏览器解码、配额和存储错误保留原错误。失败时 UI 提示并保留用户输入，不能显示“已保存”。不提供清库接口。

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
/** @typedef {{id:string,chatKey:string,mesIndex:number,swipeIndex:number|null,title:string,preview:string,createdAt:string,updatedAt:string}} Bookmark */
/** @typedef {{id:string,from:string,to:{kind:'text'|'icon'|'asset',value:string},scope:string,caseSensitive:boolean,wholeWord:boolean,createdAt:string,updatedAt:string}} ReplaceRule */
/** @typedef {{id:string,name:string,mime:string,size:number,dataUrl:string,createdAt:string,updatedAt:string}} Asset */
/** @typedef {Object<string,{added:number,skipped:number}>} ImportReport 六个固定分类 */
```

Bookmark 创建时 id、时间由 core 生成，title/preview 必填，swipeIndex 默认 null；id 必须与 bookmarkId 一致，不能让同一收藏产生重复行。Annotation、ReplaceRule、Asset 也允许创建时省略 id/时间；记录均使用 `stcr:` 前缀。楼号/候选号从 0 开始。

ReplaceRule：from 为非空字面量（≤1000 码元）；scope 默认为 all，或角色 avatar 文件名；caseSensitive/wholeWord 默认 false。`to.kind:'icon'` 的 value 为单个 `fa-star` 形式名称；asset 的 value 为已存在的 Asset.id；text 可为空串。仅持久化这些选项，T14 才执行替换。

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
 * @property {boolean} [uniform=true] 固定3em宽；false按被遮词的Unicode码点数
 * @property {string} [color] 必须#RRGGBB实色；bar默认#000000，其余默认#72b8a5
 * @property {'fa-star'|'fa-heart'|'fa-cat'|'fa-cloud'|'fa-moon'|'fa-shield'} [icon='fa-star']
 * @property {string} [assetId] sticker可用已导入图片；给出时优先于icon
 */
/** @typedef {{from:string,to:{kind:'text'|'icon'|'asset',value:string},count:number}} SkippedNameRule */
/** @typedef {{from:string,to:{kind:'text'|'icon'|'asset',value:string},source:'mine'|'automatic',count:number,skippedOverlap?:true,skippedRules?:SkippedNameRule[]}} CardMapping */
```

导出开启名字替换时必须有绑定的原文；传普通已格式化楼层而不绑定会报错，因为不能在正则后的HTML上假装完成“正则前名字替换”。每次导出对绑定楼层从原始候选重渲染一次，保持模板的外壳/样式，在副本内更新三个展示区域；不会把预览已经处理过的正文再跑一次正则。没有绑定、且 `replaceNames:false` 时可直接导出任何安全DOM，此时仅做屏蔽。

**选段合同**：若只要部分楼层，先用 createCardMessage 得到已脱敏、已格式化的节点，在这个副本上提取选段（例如Range.cloneContents），放入模板；然后用 `exportCard(template,{...options,replaceNames:false})` 导出已经处理好的片段。这里的false是“导出时不再做名字阶段”，不会还原已替换的名字。规则/名字开关变化时，从原始handle重建预览和选段。不要把只剩部分正文的元素再次bind，否则导出会按绑定重建整楼。原阅读器上的选区映射与工作台重选/确认由T23处理，不能直接把阅读器原始HTML当作已脱敏HTML。

**T30 退回 / I021**：新增两个可选子开关，默认均为 true，旧调用行为不变。`autoReplaceNames:false, applyReplaceRules:true` 保留角色/用户/群成员名字，同时执行“灯塔→某地”等我的规则；已知名字宏仍按目标聊天展开。自动名字关闭时不再建立 I019 的保护范围，此时我的规则可照字面匹配名字的部分；重新开启则恢复整名保护。关闭 applyReplaceRules 不执行或验证我的规则。两个子开关都关闭时不处理原文；无论它们是什么，`replaceNames:false` 始终跳过整个阶段，避免选段导出重复替换。屏蔽词独立，仍由最后的遮盖阶段执行。UI 尚未接线，见 I021；接入时必须同步预览、缓存键、选段重建、名字行、批注与映射列表，不能只新增按钮。

我的规则 scope=all 或匹配**当前目标发言角色的avatar**；群聊按实际成员，用户楼没有任意成员作用域。整词判断按Unicode字母/数字/组合符/下划线边界；中文连续字串需要精确边界或关闭wholeWord。规则不是正则表达式；同级重叠先长词，相同长度用传入顺序，store.list的顺序稳定。目标图标只允许上述六种；素材引用必须存在，重新校验图片签名/限额，SVG再次清洗。mappings只包含实际命中，含原词，供工作台私有映射预览，不能放到分享图或日志。

**T30 / I019 合同增补**：先收集原文中全部自动名字的 UTF-16 范围（单聊 char/user、群成员、已展开的名字宏），每次“我的规则”匹配若碰到任何自动名字，必须与其中某个名字同时满足**原词逐字完全相等（区分大小写）且范围完全相同**，并且不截断其他相交的自动名字，才可覆盖；前缀、后缀、内部片段、跨边界及包含整名的更长原词均跳过该处。规则在其他不与名字相交的位置仍能执行，scope/wholeWord/caseSensitive 仍按原合同过滤。嵌套名字中，完整短名不能拆开另一个长名。

`skippedOverlap:true` 标在**真正保护了完整名字的实际映射**上（自动映射或完整同名的我的映射）；同一映射的 `skippedRules` 为 `{from,to,count}` 列表，count 为与该映射相交而跳过的次数。顶层 count 仍只统计实际替换次数。不要将诊断子项再作为替换规则；这避免旧 UI 的批注脱敏遍历 mappings 时误用一个根本没执行的规则。正文、思维链、名字行及命中的显示正则名字宏合并时保留并累加诊断。UI 可显示“为保护完整名字，已跳过部分重叠规则”，真实原词只留私有侧栏。函数签名与旧字段不变；当前 UI 的新增提示由 Opus 后续接入（见 I019）。

I018① 已修：Canvas 字体名去外层引号后重新引用，六个 FA 实心图标均作真实 PNG 像素验证。I018② 本轮不在 core 解析带 var() 的简写：安全样式拷贝会先过滤资源声明，直接复制 cssText 会绕开边界；通用简写展开又需处理层叠、!important、变量与回退。目前模板继续使用 background-color/border-color 等单项属性，外来自定义 CSS 的这类简写仍可能丢失，保留该限制。

参数错误抛TypeError/RangeError；源handle关闭时沿用CLOSED；字体文件缺失/解码失败、图案缺失、占位符损坏、不可读图片、截图失败抛带中文原因的Error。任何错误都不产出“可能未脱敏”的替代图。UI await导出期间禁用重复按钮，catch后保留预览；关闭工作台时自行释放handle、DOM及自己创建的Blob URL。core只生成Blob，不控制用户的保存位置。

### 5.10 T14 纯变换与 DOM 适配合同

从 `cardExport.js` 可重导入 `replaceNamesInRaw/maskText/automaticNameRules/wrapMaskSpans`；纯函数的原文件为 `cardTransforms.js`。T12 textTransforms.js 的旧函数继续可用，签名未改。

| 签名 | 返回 |
|---|---|
| `automaticNameRules({userName='',characterName='',isGroup=false,groupNames=[]}={})` | 自动规则数组；不读宿主 |
| `replaceNamesInRaw(text,options={})` | `{segments,mappings}`；segments为`{kind:'text',text}`或`{kind:'replacement',to:{kind,value}}`；不存匹配原文，只在mappings里供私有预览。options含名字上下文、avatarUrl、rules、replaceNames、autoReplaceNames、applyReplaceRules；独立开关、自动名字整体保护及 skippedOverlap/skippedRules 见5.9 |
| `maskText(text,words=[],maskStyle='bar')` | 数组；普通段`{kind:'text',text,start,end}`，遮盖段`{kind:'mask',width,style,start,end}`；位置是原输入UTF-16偏移，遮盖段无原词。Node自测覆盖这两个变换内核 |
| `wrapMaskSpans(root,words=[],maskStyle='bar',assets=new Map())` | 返回root的DOM副本；输入不变，无网络或存储。assets是`Map<id,{dataUrl}>`，必须是经过store/prepareCardAssets校验的数据；一般工作台使用exportCard接管校验即可 |

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
