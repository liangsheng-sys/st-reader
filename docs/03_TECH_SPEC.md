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
- T13 后 `node dev/selftest.mjs` 共 **50 项**（13 保护 + 8 样本 + 15 T12 + 14 T13）；`await window.stcrSelfTest()` 共 **70 项**（13 保护 + 15 T12 纯逻辑 + 17 T12 浏览器 + 14 T13 纯逻辑 + 11 T13 浏览器）。先在宿主打开雾岚，使星灯未选中，关闭阅读器，并按手册导入 Ny 测试字体。网址 `?stcrSelfTest=1&coreWhenChat=1` 运行同一套检查；仅重跑 T12 时加 `{persistence:false}`（45 项）。跨页面存储实证为 `stcrStorageProbe('write')`，刷新后 `stcrStorageProbe('read')`。所有写入仅在扩展自有 IndexedDB 测试表，成功后清理。

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
在卡片用的**文本副本**上操作，不动阅读器 DOM：名字替换在**正则前**的原文层做（user_name → user，单聊角色 → char，群成员按成员顺序 → char1 / char2…）；屏蔽词在**正则后**的文本节点层包 `<span class="stcr-mask stcr-mask--bar|block|sticker">`；再交 `modern-screenshot`。永久替换规则、图标/图片与“我的规则 > 自动 > 屏蔽词”的优先级按最新 02 §6 和 I010 在 T13/T14 接入。

### 4.5 大文件（I005、NF2）
`/api/chats/get` 一次返回整个文件；不能整篇渲染。`chatSource` 只取被打开的聊天，保留原始消息和紧凑深度索引，按页构造视图模型，close 释放正文；UI 翻页时释放上一页 DOM。T12 已实测 21.35 MiB / 1600 楼；50 MB 与真机整合耗时留待 T30，不能由此样本推断已通过。

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

T13 接口见下列 5.5–5.8，T12 已交付签名不变。T14 的 PNG/DOM 脱敏尚未交付；届时须支持最新 02 §6 的单聊 char / 群聊 char1..N、永久规则与素材优先级，不能把纯存储的 replaceRules 当作已接入导出渲染。

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
