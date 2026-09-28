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
  - 注意：`/api/chats/get` 在角色 chat 目录不存在时会 `mkdirSync`，属于宿主行为，可接受。
- **禁用**（D02）：`/api/chats/save|rename|delete|import|group/save|group/delete|group/import`，以及 context 上的 `saveChat, deleteMessage, deleteLastMessage, renameChat, clearChat, addOneMessage, updateChatMetadata, saveMetadata`。
- 服务端 CLI：`--dataRoot`、`--configPath`、`--port`、`--listen`。开发实例见 D03。
- T10 启动器：`dev/start-dev-st.cmd` → 原生 Node `start-dev-st.mjs`，首次从 `dev/config.dev.yaml` 创建被忽略的 `.dev/config.yaml`；固定 D03 数据路径，创建扩展目录联接，临时目录固定在 `.tmp/`。`--import dev/isolate-dev-st.mjs` 只在开发进程内将 `PUBLIC_DIRECTORIES.globalExtensions/backups` 指向 `.dev/`，防止管理扩展时宿主对 F 盘全局扩展执行 Git 检查（I007），不修改宿主文件。
- T10 只读保护在扩展模块载入时安装（早于 `APP_READY`），仅对本机 HTTP 8100 默认启用；D02 七个路径不分 HTTP 方法拦截，抛 `StcrReadonlyError` 并记录 `console.error`。此为整个开发窗口的 fetch 断言，不替代静态审计，不覆盖 XHR 或宿主直接函数调用。纯逻辑自测 `node dev/selftest.mjs` 与浏览器 `await window.stcrSelfTest()` 共用 13 项；开发网址 `?stcrSelfTest=1` 可在 `APP_READY` 后自动运行。
- T11 的 Node 自检追加 8 项样本/落盘验证（已生成时共 21 项）。浏览器 `stcrSelfTest({fixtures:true})` 共 18 项，只请求同源只读 API；打开星灯后附加 `{font:true, rendered:true}` 共 21 项，检查原生显示及 Ny 字体数据库/FontFace。未实现 T12 阅读器管线，这些显示检查仅证明样本在宿主有效。

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
    cssScope.js       克隆 #chat → #stcr_chat 规则；监听新增 style/link；主题切换重跑
    store.js          localforage 实例 'st-reader'：annotations / bookmarks / maskWords / settings；export/import JSON
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
不能直接用 `messageFormatting` 跑正则。T12 二选一并写明理由：
- **策略 a**：自己收集脚本 + `runRegexScript`，然后调用 `messageFormatting(text, name, isSystem, isUser, -1)` 做 markdown。调用前把 `'regex'` 临时 push 进 `extensionSettings.disabledExtensions`（同步调用，调用后立刻恢复），使其内部跳过正则。需验证 `messageId = -1` 时不会碰 `chat[]`。
- **策略 b**：不用 `messageFormatting`，用 `SillyTavern.libs.showdown`（复用 ST 的 converter 选项）+ `hljs` + `DOMPurify` 复刻 markdown 阶段。

两种都要通过 fixture 断言：作用域正则在角色未选中时命中；全局正则只跑一次；深度按该聊天计算；`{{user}}`/`{{char}}` 用该聊天 header 的 `user_name`/`character_name` 代入。

### 4.2 美化命中（D10、I004）
遍历 `document.styleSheets`（跨域的跳过）与所有 `<style>`；对 `selectorText` 含 `#chat` 的规则，生成一条把 `#chat` 替换为 `#stcr_chat` 的副本，写入 `<style id="stcr-scoped-css">`。`@font-face`、`:root` 变量不需克隆。用 `MutationObserver` 监听 `<head>` 新增样式并去抖重跑；监听 ST 的 `SETTINGS_UPDATED` 事件重跑。

T11 锁定 Ny-font-manager 1.1.9（版本与许可证见 LICENSES）：本地文件存在 IndexedDB `nytw-fonts` / `fonts`，记录为 `{id, blob}`，由 `new FontFace(family, ArrayBuffer)` 加入 `document.fonts`，**不生成可供扫描的 `@font-face` 或 blob URL**。T14 不能仅扫描 CSS 找字体，必须验证导出包含此字体（I009）；T11 使用本地 187208 字节的 JetBrains Mono 测试拉丁字母与数字，中文由后备字体显示。

### 4.3 锚点（F7）
`{chatKey, mesIndex, swipeIndex, quote:{exact, prefix, suffix}, rawHash}`。生成：从 `Selection` 取该楼 `.mes_text` 的 `textContent` 偏移。重定位：楼渲染后在 `textContent` 里找 `prefix+exact+suffix`，退化为只找 `exact`；找不到则标记 orphan。

### 4.4 卡片脱敏（F2a）
在卡片用的**文本副本**上操作，不动阅读器 DOM：名字替换在**正则前**的原文层做（替换 header 的 user_name、角色名、群成员名 → user / char1 / char2…，顺序稳定）；屏蔽词在**正则后**的文本节点层包 `<span class="stcr-mask stcr-mask--bar|block|sticker">`；再交 `modern-screenshot`。

### 4.5 大文件（I005、NF2）
`/api/chats/get` 一次返回整个文件，50 MB 可接受但不能整篇渲染。`chatSource` 拿到数组后只保留原始数组，按页构造视图模型；翻页时释放上一页 DOM。切换聊天时置空引用。

## §5 core ↔ ui 接口（astra 在 T12 填写，Opus 只依赖这里）
```js
// 占位。T12 交付时替换为真实签名 + JSDoc + 示例。
export async function listRecent(max)                     // → ChatSummary[]
export async function listByCharacter(avatarUrl)          // → ChatSummary[]
export async function openChat(chatKey)                   // → ChatHandle {header, total, page(n), close()}
export function renderMessage(handle, index, swipeIndex)  // → {html, reasoningHtml, model}
export const store = { annotations, bookmarks, maskWords, settings, exportAll(), importAll(json) }
export function makeAnchor(range, mesEl)                  // → Anchor
export function locateAnchor(anchor, mesEl)               // → Range | null
export async function exportCard(rootEl, {maskWords, replaceNames, maskStyle}) // → Blob(png)
export function applyCssScope()                           // 幂等
```
