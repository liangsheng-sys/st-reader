# T71 交接：在 ST 里发完消息，立刻打开阅读器就能看到新楼

## 做了什么

- **当前聊天不再"等 60 秒"**：阅读器打开的若正是 ST 当前打开的那个聊天，就直接拿 ST 内存里的聊天比一比（楼数、最后一楼时间、每楼候选数和当前候选），一样就秒开缓存，不一样就悄悄重新读文件——不弹横幅、不额外发请求。
- **ST 先发事件、后存盘**：刚发完消息那一瞬间文件可能还没写完，阅读器会等 0.25 / 0.5 / 1 秒各再读一次，最多约 2 秒，读到就显示；实在没存上就先显示文件里的内容，下次打开再比。
- **只读监听 ST 的 9 个事件**（发出 / 收到 / 编辑 / 删除 / 换候选 / 更新消息、切换聊天、删聊天、删群聊）：一有动静就把对应聊天的内存缓存扔掉。回调里只扔缓存，不碰聊天、不调任何保存。
- **非当前聊天**：每次从缓存打开都在后台核对一次文件摘要（原来是 60 秒内只核对一次），变了就出"此聊天有新内容"横幅，横幅逻辑不变。核对放到浏览器空闲时再发，不拖慢首屏。
- **顶栏新增"重新读取"按钮**（进度百分比右边的 ⟳）：打开了聊天才出现；点一下图标转圈，读好了才换正文并回到原来那一楼，读失败旧正文不动。

## core 改动（D32）

| 文件 | 改了什么 | 为什么 |
|---|---|---|
| `src/core/chatSource.js` | 删掉 60 秒结果复用；新增纯函数 `matchesHostChat(快照楼, 宿主 chat)`、常量 `INVALIDATING_EVENTS`（9 个事件名）；`openChat` 命中且是宿主当前聊天时零网络比对，不一致按 reload 冷读；冷读后文件落后于宿主内存时按 250/500/1000 ms 重读；新增 `invalidateChat(chatKey)`、`watchHostChatEvents()`（返回退订函数）；后台 search 推迟到 `requestIdleCallback`（至多 500 ms）；统计新增 `liveChecks / liveReloads / eventInvalidations / hostSaveWaits`；`createChatSource` 新增可选注入 `wait` 仅供测试 | D34 ①–③、I055 |
| `src/core/chatCache.test.js` | 两条 60 秒断言改成"每次命中都校验""失败结果不保留"；新增 5 条：纯函数比对、当前聊天实时比对与冷读、存盘延迟重试（成功 / 放弃）、`invalidateChat`、9 个事件订阅与退订 | D34 ⑤ |
| `src/core/chatCacheBrowser.test.js` | 横幅那段改用"非当前聊天"上下文；去掉 60 秒时钟偏移；新增"真实当前聊天与宿主内存比对一致"一条；正式阅读器性能段按是否当前聊天算预期请求数 | 同上 |
| `index.js`（挂载） | 启动时 `watchHostChatEvents()`，`pagehide` 退订；单独 try，失败只记日志不影响入口 | D34 ② |

合同只增不改：03 §5.14 标题加 T71 / D34，正文在原 T57 段前插入"T71 改写校验时机"一节，原"结果保留 60 秒"一句保留原文并标明已被取代；§5.1 两处 60 秒说明加括注指向 §5.14。`openChat` 的参数和返回形状不变，`validation` 只多了一个可选字段 `source:'host'`。`readonlyGuard.js` 名单和 `audit-readonly.mjs` 都没动。

## 改动文件

`src/core/chatSource.js`、`src/core/chatCache.test.js`、`src/core/chatCacheBrowser.test.js`、`index.js`、`src/ui/reader.js`、`src/ui/templates/reader.html`、`style.css`、`README.md`（隐私段删掉"60 秒"一句、改写为新行为）、`docs/02_UI_SPEC.md`（顶栏加"重新读取"）、`docs/03_TECH_SPEC.md`、`docs/04_TASKS.md`（T71 → 待验收）、`docs/06_ISSUES.md`（I055）。

## 人类验收步骤

> 说明：8100 开发实例装了只读护栏，它会连 ST 自己的"保存聊天"也一起拦住，所以**发消息这一步要在 8101 隔离实例里做**（8101 现在加载的就是这个分支的代码，数据是合成的）。

**A. 发消息后立刻看到新楼（8101）**
1. 双击 `E:\st-reader\.tmp\opus-dev\start.cmd`，等窗口出现 `http://127.0.0.1:8101`，浏览器打开这个地址。
2. 左边角色列表点 **STCR_T11_Mist**，打开聊天 **STCR-03-普通阅读**。
3. 点阅读器入口打开阅读器，看一眼最后一楼，然后点右上角 ✕ 关掉。
4. 在 ST 输入框输入 `/sys 测试新楼` 回车。
5. **立刻**再打开阅读器，拉到最底下：应看到刚发的"测试新楼"那一楼，顶上**没有**"此聊天有新内容"横幅。

**B. 非当前聊天改了文件出横幅（8100 或 8101 都行）**
1. 在阅读器左边抽屉里打开 **STCR_T11_Aster** 的 **STCR-01-正则与多候选**，看一眼，关掉阅读器（此时 ST 里当前聊天仍是别的，不要在 ST 里切到它）。
2. 用记事本打开 `.tmp\opus-dev\data\default-user\chats\STCR_T11_Aster\STCR-01-正则与多候选.jsonl`（8100 则是 `.dev\data\default-user\chats\...` 下同名文件），把最后一行复制一份粘到末尾，保存。
3. 再打开阅读器、从抽屉打开同一个聊天：顶上出现"此聊天有新内容，点击重新加载"。

**C. 顶栏"重新读取"**
1. 接着 B，看顶栏进度百分比右边有个 ⟳ 图标。点它：图标转一下，正文换成新内容（多一楼），横幅消失，底部提示"已重新加载"。
2. 把窗口拉窄到手机宽度，⟳ 和 ✕ 都还在屏幕里。

验收完可以把 B 里改过的文件撤回（记事本删掉粘的那行），或告诉我来恢复。

## 只读自查

- `rg --no-ignore -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src vendor style.css` → 只有 `readonlyGuard.js` 第 4–10 行（禁用名单本身）和 `htmlSnapshot.test.js:12`（"必须拒绝"的测试输入），与上次相同。
- `node dev/audit-readonly.mjs` → 静态边界检查通过。forbiddenCalls / hostWrites 扩展运行文件 0 行；userFiles 仍只在 `backupService.js` 与其测试里。
- 第一次跑时 hostWrites 抓到测试里给替身对象写 `swipe_id = …` 两处，已改成 `Object.assign(…)` 写法；那是假的上下文，不是宿主，但审计规则不放宽，所以改测试。

## 自测

- `node dev/selftest.mjs` → 全部通过（184 项），零网络。
- `node src/ui/ui.test.js` → 全部通过（33 项）。
- `dev/test-release.cmd`（8100）→ T57 OK：自动备份回归通过、浏览器完整自测 246 项、界面主题 38 项、性能全部达标、静态边界通过。
- 8101 真机：`/sys` 发一条后立刻开阅读器显示新楼、无横幅，`eventInvalidations` 1；之后再开与宿主内存比对一致（`liveReloads` 0）。Aster 文件改动后横幅出现，⟳ 读回 13 楼并提示"已重新加载"；390 px 宽 ✕ 仍在屏内。
- 测试后已把 8100 的你的两份 T70 备份文件、`settings.json` 备份指针、测试多出的 ST 设置备份，以及 8101 的两个被改动的 fixture 和多出的聊天备份全部恢复原样。

## 已知问题 / 没做的

- 如果 ST 存盘超过约 2 秒还没写完（极慢的磁盘），第一次打开会先显示旧文件内容；再打开一次或点 ⟳ 即可。
- 只在 ST 实际发出事件时作废缓存；直接在硬盘上改**当前**聊天文件（不经过 ST）时，比对的是 ST 内存，ST 内存没变就不会重读——这和 ST 自己的行为一致。

## 给下一个人的话

- 8100 的只读护栏包住了整页 `fetch`，ST 自己保存聊天也会被拦；要测"发消息"这类真实流程用 `.tmp/opus-dev`（8101，联接已指向 `E:\st-reader`）。
- `matchesHostChat` 只比结构（楼数 / 末楼时间 / 候选数 / swipe_id），不比正文；只改了某楼正文的编辑靠 `MESSAGE_EDITED` 事件作废。
