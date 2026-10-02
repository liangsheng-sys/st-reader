# T50 交接：正文居中 bug 找到原因并修好

## 根因（一句话）

**和主题、聊天风格、头像样式都无关**，是某一楼里自带的样式"漏"到了整页。

模型写的卡片（比如那张"可以摸尾巴吗？"）常常带一段 `<style>`，里面写着"段落居中"。ST 的规矩是把这种样式限制在"消息正文"里——在 ST 主界面这通常没事，因为这类楼被酒馆助手换成了独立的小窗口。但阅读器一页里同时放着几十楼正文，"消息正文"这个范围对它们**全都成立**，于是一楼卡片的"段落居中"把整页所有楼都变成了居中。

所以开发实例之前一直没复现：合成样本里没有"带样式的卡片 + 普通楼"放在同一页。你换 Dark Lite 扁平也居中，正是因为原因不在主题。

修法：每楼自带的样式只管它自己那一楼（如果样式在 HTML 块里，就只管那个 HTML 块）。卡片自己的居中排版照样保留。另外给正文加了一条"默认左对齐"的兜底，优先级为零，你的主题或美化 CSS 里明确写的对齐仍然说了算。分享卡片的"继承主题"模板也做了同样处理。

## 做了什么

- 复现：五套 ST 自带主题 × 默认 / 气泡 / 文档 三种聊天风格，共 15 种组合，用"普通楼 + 带卡片样式的楼 + 普通楼"的合成聊天，**15 种全部复现**；只用普通聊天则 15 种全部正常。
- 修复后 15 种全部左对齐，卡片自己的段落仍居中。
- 新增浏览器回归检查：去掉修复时它报错（15 种全红），加上修复后全绿。
- 06 记了 I044（根因说明 + 给 astra 的可选建议，不阻塞）。

## 改动文件

- `src/ui/floorToolbar.js`：新增 `scopeFloorStyles`，每楼建好时把楼内样式的作用范围收窄到本楼
- `src/ui/cardStudio.js`：分享卡片里的楼也同样收窄
- `style.css`：正文默认左对齐（零优先级兜底）
- `src/ui/uiBrowser.test.js`（新）：五套主题 × 三种风格的对齐回归
- `docs/06_ISSUES.md`（I044）、`docs/04_TASKS.md`（T50 → 待验收）

## 人类验收步骤

**A. 在 Opus 验收实例看修复（约 3 分钟）**

1. 双击 **E:\st-reader\.tmp\opus-dev\start.cmd**，出现 listening 后打开 **http://localhost:8101**，按 **Ctrl+F5**。
2. 左上选角色 **星灯（虚构）**，打开聊天 **STCR-T50-居中复现**（这是我为这张卡做的合成聊天，4 楼）。
3. 打开阅读器（顶栏书本按钮）。应看到：第 0、1、3 楼的字**靠左**；第 2 楼是一张粉色卡片，卡片里的"可以摸尾巴吗？"和两道题**居中**（这是卡片自己的排版，正常）。
4. 想多试几种：关掉阅读器 → ST 用户设置（人像图标）里把主题换成 **Cappuccino**、聊天风格换成 **气泡**、头像换成 **圆形** → 再打开阅读器，字仍然靠左。换 **Dark Lite + 扁平** 也一样。

**B. 在你自己的 ST 复查（等这张卡合并、你更新扩展之后）**

5. 打开之前出问题的那个聊天的阅读器，翻到截图那一段：正文应该靠左，HTML 卡片本身的样子不变。
6. 如果仍然居中：在阅读器里**按 F12 → Console**，粘贴下面一行回车，把输出截图给我（只是读样式，不改任何东西）：
   `[...document.querySelectorAll('#stcr_root style, head style')].filter(s=>/text-align\s*:\s*center/.test(s.textContent)).map(s=>s.textContent.match(/[^{}]*\{[^}]*text-align\s*:\s*center[^}]*\}/g)).flat().slice(0,10)`

**结束**：8101 黑窗口按 **Ctrl+C**，输入 **Y** 回车。

## 自动检查

| 检查 | 结果 |
|---|---|
| `node src/ui/ui.test.js` | 全部通过（30 项） |
| `node dev/audit-readonly.mjs` | 静态边界检查通过 |
| 浏览器回归 `uiBrowser.test.js` → `testTextAlignBrowser()`（8101 无头 Chrome） | 卡片自己的段落仍居中；5 主题 × 3 风格 = 15 项正文全部 start。对照：临时去掉修复后 15 项全部报"p=center" |

开发实例（8100）控制台里跑这项检查：先关掉阅读器，再粘贴
`await (await import('/scripts/extensions/third-party/st-reader/src/ui/uiBrowser.test.js')).testTextAlignBrowser()`
它会依次切换 ST 的主题和聊天风格（这些是 ST 自己的外观设置，ST 会照常保存），跑完切回原来的。

## 只读自查

- rg -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src style.css → 只命中 `src/core/readonlyGuard.js` 的防护名单（本来就有），本次改动零命中：是
- node dev/audit-readonly.mjs → 静态边界检查通过
- 本任务是否读写过 F:\Claude\xinllm\SillyTavern\data：否（只读了 F 盘 ST 程序自带的 `public/` 样式文件来查规则，没有写 F 盘）

## 已知问题 / 没做的

- 宿主 ST 自己渲染的楼内样式（在 ST 主聊天里）理论上也能命中阅读器；但那样 ST 主界面会先一起变样，你说 ST 正常，所以不是这次的原因。真遇到时第 6 步的输出能直接看出来。
- 带样式的那一楼，卡片前后的散文（比如那行"『2024年…』"）仍跟着卡片的样式走——ST 里也是如此；astra 的 T51 把散文移出 HTML 块后会自然好转。

## 给下一个人的话

- **8101 隔离实例的坑（已修）**：你今天把 ST Reader 装进了真实 ST 的全局扩展目录（`public/scripts/extensions/third-party/st-reader`）。8101 实例共用 ST 程序目录，同名 `st-reader` 网址会先拿到全局那份旧代码。另外 `isolate.mjs` 里原来用反斜杠写路径，JS 把反斜杠吃掉了，"全局扩展目录改到 .tmp" 从来没生效。现已改为正斜杠，8101 里的扩展联接改名为 `st-reader-opus`（指向 `.tmp/wt-opus`），所以 8101 里只加载工作区这一份。
- `scopeFloorStyles` 依赖 core 给的前缀字面量 `#stcr_chat .mes_text `；core 若改前缀，这里要一起改（I044 已写）。
