# T63 交接：0.2.1 发布前复查——通过，main 已指向 T62，可以推送

复查对象：`main` = T62 分支最终提交（含人类验收后补充的"隐藏 ST 已隐藏的楼"开关）。发布提交编号以 `git log -1 --oneline` 为准（本信提交之后）。

## 结论一句话
I050 根因修复正确、范围最小、只动界面层；只读与隐私检查全部通过。可以发布 0.2.1。

## 复查项与结果
| 项 | 结果 |
|---|---|
| D02 写聊天接口 / 禁用方法 / 对 chat、swipe_id、is_system、元信息的赋值 | 全空。本卡只读 `is_system`，不写 |
| 实际用到的 `/api` | 与 0.2.0 相同，无新增 |
| 自有出站请求 | 无新增；fetch 仍只有同源聊天读取、使用说明文件、更新服务 |
| 修复本体 | `logic.js` 的 `isSystemLike`：旁白（`extra.type==='narrator'`）或（`is_system` 且名字空 / System 且无多候选）才算系统楼；其余 `is_system` 楼按普通楼渲染。判定只有一处，floorToolbar / cardPieces / reader 全部复用 |
| 新开关 | `hideStHidden` 默认关，与"隐藏用户楼"独立可组合；真正的系统楼不受影响 |
| 自测 | Node 168/168、UI 32/32、语法 0 错；Opus 报浏览器回归 38/38，含隐藏楼 10 项 |
| 合成数据 | 星灯聊天第 1–3 楼加 `is_system:true`，其中一楼保留 3 个候选；清单同步；这是补上导致两轮漏判的测试盲区 |
| 许可 / 隐私 | 全部源文件带 AGPL 头；`.dev/ .tmp/` 与截图在当前文件和全部历史中无记录；用户名、代理端口等字样为空 |
| 版本 | manifest 0.2.1；CHANGELOG 0.2.1 一节含修复与新开关；SETUP 已改 0.2.1 |
| 体积 | 1.3 MB < 3 MB |

## 复查意见（不阻塞）
- Opus 在"已知问题"里写明：名字恰好叫 System 且无多候选的普通隐藏楼仍会被当系统行。这是我在任务卡里给的规则，可接受；真实聊天几乎不会这样命名。
- 这个 bug 两轮才抓到，教训是合成数据没覆盖 ST 的"隐藏消息"用法。已在 I050 记一句：以后新增 ST 功能兼容时，先问"真实用户常用但样本里没有的 ST 操作有哪些"。

## 人类现在做的（照 `docs/发布指南.md` 第 9 节）
```powershell
git status --short
git switch main
git log -1 --oneline
git push origin main
git tag v0.2.1
git push --tags
```
然后 GitHub 发 Release（标签 v0.2.1，标题 `ST Reader 0.2.1`，说明贴 CHANGELOG 的 0.2.1 一节），在真实 ST 里点扩展更新并刷新，打开阅读器应弹"v0.2.1 更新了什么"。Discord 帖子回一条更新说明，链接记到 `07_FEEDBACK.md`。
