# T61 交接：0.2.0 发布前复查——通过，main 已整合，可以推送

复查对象：`main` = `335d494`（含 T57 整合的 T53 与 0.2.0 材料、T59 收尾）。这就是发布提交。

## 结论一句话
只读、网络边界、许可、隐私、自测全部通过；D28 / D29 / D30 三条新决定都已落实到代码和文档。可以发布 0.2.0。

## 复查项与结果
| 项 | 结果 |
|---|---|
| D02 写聊天接口 / 禁用方法 / 对 chat、swipe_id、元信息的赋值 | 全空（只在拦截名单与测试拒绝样本出现） |
| 实际用到的 `/api` | 只读聊天接口 + D25 批准的 `extensions/version`、`extensions/update`（仅在 `updateService.js`） |
| 自有出站请求 | 无固定第三方域名；fetch 只有同源聊天读取、同源使用说明文件、更新服务 |
| D28 | `chatSource` 缓存命中立即返回，`onStale` 通知；UI 横幅"此聊天有新内容，点击重新加载"，同聊天同会话只提示一次；astra 实测缓存重开首屏 160–205 ms |
| D29 | 选择器 `#chat` 内 `.mes style`，只切 disabled；恢复路径含 try/finally、pagehide、根节点移除，浏览器回归 12 项；README 已加说明句 |
| D30 | README 安装节、使用说明常见问题、SETUP §3 三处都写了"先 unlink 再 URL 安装" |
| D25 披露 | README 第三方域名表有"检查更新 / 更新：ST 访问 github.com" |
| 自测 | Node 167/167、UI 30/30、语法 0 错；astra 的发布脚本另报浏览器 239/239 |
| 许可 | 全部源文件带 AGPL 头；LICENSE、LICENSES.md 无变化 |
| 隐私 | `.dev/ .tmp/` 与截图在当前文件和全部历史中无记录；用户名、代理端口等字样为空；`docs/feedback/` 只跟踪三个 txt |
| 版本 | manifest 0.2.0；CHANGELOG 0.2.0 一节完整，含重开提速与静音两行；SETUP 已改 0.2.0 |
| 体积 | 1.3 MB 运行文件 < 3 MB |
| 开发入口 | 仍只在 localhost:8100 生效 |

## 不阻塞的小事（记入 06）
- Opus 的 T50 交接信引用了你截图里那张卡片的标题"可以摸尾巴吗？"作为例子（I049）。只是五个字的标题，不含对话内容；合成样本与代码里没有。想抹掉可让 Opus 改成虚构标题，不改也可以发。
- `docs/发布指南.md` 的示例版本号仍是 0.1.0，它是"首次发布"教程，第 9 节有后续版本的做法。本次照第 9 节做，标签打 **v0.2.0**。
- I048：两份安装并存的提示没做（core 分不出），你的真实 ST 已是单份，不影响。
- I020、I035 保持原状。

## 人类现在做的（照 `docs/发布指南.md` 第 9 节）
1. 在 `E:\st-reader` 打开 PowerShell，逐行：
   ```powershell
   git status --short
   git switch main
   git log -1 --oneline
   git push origin main
   ```
   第 3 行应显示 `335d494`（或本信提交之后的编号，见下方），工作区干净。
2. 打标签并推送：
   ```powershell
   git tag v0.2.0
   git push --tags
   ```
3. GitHub 网页按第 6 节发 Release：标签选 **v0.2.0**，标题 `ST Reader 0.2.0`，说明贴 CHANGELOG 的 0.2.0 一节。
4. 在你的真实 ST：扩展 → 管理扩展 → 阅读器那一行点更新箭头，刷新页面；打开阅读器应弹"ST Reader v0.2.0 更新了什么"，Aa → ⋯ 显示 0.2.0、检查更新显示"已经是最新版本"。
5. Discord 帖子回一条更新说明（可直接用 CHANGELOG 的 0.2.0 一节），链接记到 `07_FEEDBACK.md`。
