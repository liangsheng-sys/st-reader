# T93 交接：0.3.2 发布前复查——通过；发布提交在 `task/T93-release-0.3.2`

复查对象：main（ed326cb，T90–T92 三张你已逐卡验收并合入）。发布准备提交只改版本号与文档，在 `task/T93-release-0.3.2`。

## 结论一句话

三张卡的只读、隐私、许可、合同、自测全部过关，可以发 0.3.2。发布后请你第一时间在那个"几分钟"的聊天上复测一次并把诊断信息贴给我（见文末）。

## 复查项与结果

| 项 | 结果 |
|---|---|
| D02 写聊天接口 / 禁用方法 / 对 chat、chatMetadata、swipe_id 赋值 | 运行文件 0 处（我用两组正则重扫 `index.js`、`src/`、`style.css`）。`readonlyGuard.js` 名单与 `audit-readonly.mjs` 自 0.3.0 起**一字未动** |
| 新增出站请求 | T90 新用 `POST /api/characters/chats`，两种参数：`simple:true` 只列目录（我对照 ST 源码 `src/endpoints/characters.js` 第 1379 行确认：只 `readdir`，不读文件），`simple:false` 替换原来的 `/api/chats/search`。两者都在 §1 只读白名单里。`chats/get` 改为确认文件存在后才调，避免 ST 对空角色建目录。T91、T92 无新接口 |
| ST 设置写入 | `hostSettings` 白名单新增 `topbarIcon` 一个布尔字段，正是 D44 授权的那一个；其余不变 |
| 宿主事件订阅 | T91 多订阅 7 个角色 / 群组 / 新建聊天事件，回调只改阅读器自己的缓存标记，有 try/catch，退订干净；事件名对照 ST `events.js` |
| 界面层不直接 fetch | `src/ui/` 里唯一的 fetch 仍是文档面板读自己的使用说明（旧有）；抽屉与列表缓存不碰 localStorage / IndexedDB，刷新即空（D41） |
| 03 §5 合同 | 新增 §5.17–5.19；唯一被改写的旧句是 §5.16 的 `hostSettings` 字段名单，加了 `topbarIcon`（D44 要求），没有删任何签名。§5.14"冷读先 search 后 get"的顺序由 §5.17 取代，接口签名未变，Opus 在交接信里写明了 |
| 05 决定 | 未动；D39（瞬时状态不触发镜像）、D41（列表只在内存）、D44（备注 ≤ 500 字、导出版本仍 1、图标开关存 ST 设置）均按原文落实 |
| 自测（我本机复跑） | `node dev/selftest.mjs` 200/200，零网络；`node src/ui/ui.test.js` 42/42；`node dev/audit-readonly.mjs` 通过（network 命中仍只有备份服务的 ST 文件接口，旧有） |
| 发布脚本（Opus 报告） | T92 后 `dev/test-release.cmd` 首次即过：浏览器完整自测 302 项、界面 78 项、备份回归通过、审计通过 |
| 性能 | 重楼 240 楼样本：main 冷开 1087 / 4889 / 2111 ms → 404 / 357 / 460 ms；命中重开 ≤ 293 ms；`--heavy` 三轮全过。原"21 MB 缓存命中首屏 < 300 ms"从时过时不过变成 82–89 ms，这是 T90 顺带解决了 T84 复查意见里那条抖动 |
| 诊断隐私 | `diagnostics.js` 只收数字 / 布尔 / 三个固定枚举，文件大小只收"数字 + 单位"格式；`ui.test.js` 有专门断言。我读了全文，没有任何能放进正文、名字或文件名的入口 |
| 许可 / 隐私文档 | 新增源文件 7 个，全部带 AGPL 头注释；无 vendored 库；`.dev / .tmp / *.png` 无一入库。README 隐私段补了列表缓存一句；使用说明三处更新 |
| 版本与文档 | manifest 0.3.2；CHANGELOG 0.3.2（大白话，把"为什么以前慢"讲清楚）；SETUP 两处版本号。README 版本无需改 |
| 体积 | 1.37 MB < 3 MB |
| `.cmd` 换行 | `dev/test-performance.cmd` 改过参数透传，仍是 CRLF |

## 复查意见（不阻塞）

- **I061 还不能关**。T90 找到的原因（ST 为了给一个聊天出摘要要扫该角色全部聊天文件）与"200 楼几分钟"吻合，但只有你在真实 ST 上复测才算数。
- **"首屏后补查"留下不到 2 秒的空档**：那段时间里别处只改字不加楼的编辑，以后不会提示"有新内容"。加楼删楼都能发现，ST 正开着的聊天另有兜底。我写进 CHANGELOG"说明"了，可以接受。
- T91 验收时 8101 端口曾被 Clash Verge 的一条连接占着，Opus 留了 `.tmp/t91/start-8102.cmd` 备用。不是阅读器问题。
- 8101 的数据副本里两个样本聊天末尾多了 `/send` 的测试消息，不影响开发数据与仓库。

## 你现在做的

1. 推送（PowerShell）：
   ```powershell
   git switch main
   git merge --ff-only task/T93-release-0.3.2
   git log -1 --oneline
   git push origin main
   git tag v0.3.2
   git push --tags
   ```
2. GitHub 发 Release：标签 v0.3.2，标题 `ST Reader 0.3.2`，说明贴 CHANGELOG 的 0.3.2 一节。真实 ST 里点扩展更新并刷新，打开阅读器应弹一次"v0.3.2 更新了什么"。
3. **复测那个慢聊天**：更新后在真实 ST 里打开它，然后 Aa → ⋯ → 诊断 → 复制诊断信息，连同"这个角色名下大概有几个聊天""第二次打开还慢吗"一起贴给我。快了我就关 I061；还慢的话，诊断信息里"查聊天摘要 / 等 ST 返回聊天文件 / 建首批楼层"三行能直接告诉我下一步改哪。
4. 社区回帖：社区 1（顶栏图标）已做；社区 2（导出可读文档）在下一版 0.4.0。

## 接下来

M10（0.4.0）三张卡已在 04，提示词 `docs/prompts/opus_T95-T97.md`，等 0.3.2 合入 main 后把它整段粘给 Opus。顺序 T95 在酒馆里打开 → T96 阅读器主题与铺满 → T97 导出为文档。
