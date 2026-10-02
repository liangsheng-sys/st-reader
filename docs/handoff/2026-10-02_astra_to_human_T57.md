# T57 交接：整合 T53、后台校验与 0.2.0

## 做了什么

- 从 `main` 的 `5539251` 创建 `task/T57-release-0.2.0`，合并 `task/T53-memory-cache` 的 `c70eb1d`。合并提交 **`361c326`**；合并后先通过 Node 161、完整浏览器 231、UI 30 项，再实施 D28。
- 实现与发布材料提交 **`2d35f27bc3324d205523a2d3e04a99a4953e82e1`**。本交接信单独提交，最终 main 快进到承载本信的提交；最终编号同时在交付回复中给出。
- 04/06/07 以开工 main 为准，只恢复 T53 自己的任务行、I040 原实测与 I042 合同。T50/T52/T54b/T55/T60 的通过状态保留，07 与开工 main 完全一致。
- 缓存命中立即返回句柄，后台 search 对比大小、末消息日期和楼数，校验结果保留 60 秒。发现变化只通过 `handle.onStale(callback)` 通知，不替换正文；显式 `openChat(key,{reload:true})` 才重读。
- 通知支持退订、晚订阅补发和 close 自动清理；冷读并发共享，取消相互独立；清空、淘汰、重载不接纳迟到校验或旧冷读。角色与群组快照计入内存限额，命中不再为了读取它们等待网络。
- manifest 升到 0.2.0，SETUP 中显示版本同步；CHANGELOG 补重开提速与样式静音两行；README 补 D29，README/使用说明/SETUP 三处补 D30。
- 新增双击入口 `dev/test-release.cmd`，可一次跑完本卡全部验证。没有修改 `src/ui/`，没有打 tag、没有推送。

## 改动文件

- `src/core/chatSource.js`、`chatCache.js`、缓存 Node/浏览器测试；合并带入 T53 的 core 与旧性能内存检查。
- `index.js`、`dev/selftest.mjs`、`dev/test-performance.mjs`、两个缓存/发布测试 cmd、`dev/README.md`：合并并保留所有自测入口，首屏和后台分别计时，增加主题界面检查入口。
- `manifest.json`、`README.md`、`CHANGELOG.md`、`docs/SETUP_WINDOWS.md`、`docs/使用说明.md`、03/04/06 与本交接信。

## 实测结果

Windows、Chrome 154、1440×1000、既有 Ny 合成字体；使用原有 21.35 MiB / 1600 楼聊天，同角色原 53.39 MiB / 4000 楼样本也保留。没有通过移走大文件缩短 search 扫描。

| 检查 | 结果 |
|---|---|
| `node dev/selftest.mjs` | 167/167 |
| `node src/ui/ui.test.js` | 30/30 |
| `await stcrSelfTest()` | 239/239 |
| 五套主题 × 三种显示模式及样本自身样式 | 16/16 |
| 缓存性能专项 | 45/45（13 保护 + 22 逻辑 + 10 浏览器） |
| `node dev/audit-readonly.mjs` | 通过 |
| 宿主快照 / 真正刷新 / 请求审计 | hostUnchanged=true；refreshEmpty=true；blocked=[] |

正式阅读器从调用 openReader 到首屏就绪并完成绘制，**首次 1463.8 ms，三次缓存重开 205.2 / 178.8 / 160.6 ms**。后台 search **677 ms** 单独记录，不计入首屏；四次打开只有一次正文 get，后台校验只做一次，之后使用 60 秒结果。独立 core 三次命中为 0.4 / 0.1 / 0 ms，后台 678.1 ms。

保留此前一轮结果：首次 1569.2 ms，重开 231.4 / 204.1 / 178.9 ms，后台 752.4 ms；该轮完整浏览器 237 项。追加两项浏览器通知验证后得到上面的最终 239 项，未丢弃失败样本。最初浏览器在沙箱内退出，报 Page.enable 超时；改用相同项目脚本、现有 Chrome 与项目内临时配置后通过，这次环境失败没有算作通过。

最终报告与带时间戳的历史报告在 `.dev/fixtures/t57-performance*.json`（不入库）；Node/UI/审计日志归档为 `.dev/fixtures/t57-*-result.txt`。本次启动的 8100 已停止，本次浏览器配置和临时日志已清理；其他任务已有的 `.tmp` 内容未动。

## 人类验收步骤（不用写代码）

1. 在资源管理器地址栏粘贴 `E:\st-reader\dev`，回车。双击 **start-dev-st.cmd**；看到 **listening** 后保留黑窗口。如果说端口被占用，先关闭之前的开发服务窗口再双击。
2. 双击同一文件夹里的 **test-release.cmd**，等它自动跑完。最后应看到 **T57 OK.**，上方各套检查显示“全部通过”。不要关闭启动服务的那个窗口。若出现 FAILED，把完整报错与 `.dev\fixtures\t57-performance-result.json` 给工程师，不需要重建聊天或重新安装依赖。
3. 浏览器打开 **http://localhost:8100/**，按 **Ctrl+F5**。点顶栏书本图标打开阅读器，再点右下角 **Aa → ⋯**：顶部版本应为 **0.2.0**；“检查更新”显示 **开发目录，不可更新**；“更新日志”里应看到重开提速和临时静音样式两条。
4. 在同一个更多设置面板点 **使用说明**，滚到“常见问题”：应能看到“明明更新了，怎么还是旧版？是不是装了两份？”及先 unlink 再 URL 安装的说明。T60 已记录你的联接清理完成，**这次只核对文案，不要求再执行卸载脚本**。
5. 关闭说明，点左上角 **≡ → 按角色 → 雾岚（虚构）**，选择 **STCR-90-大文件-1600楼**。首次稍等，读到正文后关阅读器；再打开并从抽屉选择同一聊天，正文应明显更快出现。精确的 <300 ms 已由第 2 步自动测量，不需要自己掐秒表。
6. 可打开纸舟的合成 HTML 聊天看看网页前后散文、宽度按钮和交互高度；这些是合并保留的现有功能。退出阅读器，ST 当前聊天、候选仍应不变。
7. 本卡暂时**不会出现“此聊天有新内容，点击重新加载”横幅**，它属于 Opus 的 T59；后台通知已通过自动测试。完成本轮验收后等待 Fable 的 T61，不推送、不发 Release。

可选控制台单测：F12 → Console 粘贴 `await stcrSelfTest({cachePerformance:true})`，应 45 项全绿；完整 `await stcrSelfTest()` 为 239 项，需要先在 ST 打开雾岚、关闭阅读器并按开发手册准备 Ny 字体。推荐直接使用第 2 步自动入口，它会准备隔离浏览器。

## 只读自查

```text
rg --no-ignore -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src vendor style.css
```

结果不为空，共 **8 行**，逐项解释如下：

- `src/core/readonlyGuard.js:4–10`：七个禁用 API 的防护名单，仅用来拦截，不发请求。
- `src/core/htmlSnapshot.test.js:12`：将禁用路径作为 URL 校验器“必须拒绝”的输入，没有调用这些地址。
- 对 `saveChat / deleteMessage / deleteLastMessage / renameChat / clearChat / addOneMessage / updateChatMetadata / saveMetadata` 的调用形式补充 rg：**0 命中**。
- `node dev/audit-readonly.mjs`：禁用调用 **0**，宿主写赋值 **0**；运行文件约 **1,056,016 字节**；`.dev/.tmp/docs/*.png` 跟踪文件 **0**。网络字面量人工复核仍是既有同源读取、允许的 D25 自身更新、D22/D23 用户 HTML 展示资源、测试拒绝示例与 vendor 通用代码；本卡未新增外部域名或服务。
- 浏览器真实请求审计 blocked=[]，D02/外网/开发目录 Git 请求 **0**。Node 不联网，通知变化用响应副本模拟，不编辑合成聊天；宿主聊天、候选、选择与元信息前后快照一致。
- 本任务是否读写、列出、复制过 `F:\Claude\xinllm\SillyTavern\data`：**否**。只用 `.dev` 数据；未运行真实安装/卸载脚本，未写 C/F、未装依赖、未下载大文件。
- `git diff 5539251 -- src/ui docs/07_FEEDBACK.md`：**空**。合并后的 Opus HTML/updateUi 接线及原验收记录均保留。

## 已知问题 / 没做的

- T59 的横幅、抽屉每次展开预取、D29 异常/pagehide/根移除恢复兜底与严格 `#chat .mes style` 选择范围仍归 Opus。本次按卡只补 D29 文档，没有把现有正常关闭实现说成异常路径全部完成；Fable 的 T61 应继续核对这些剩余项。
- I020 的冷开 50 MB 大文件与分页性能历史波动保持原状态，本卡没有宣称它已修复；本次 <300 ms 指 21 MB 缓存命中的首屏，不是任何聊天的首次下载，也不是 search 完成。
- ST 摘要无法识别大小、末消息日期、楼数都没变的原地改字；只改角色卡也不由聊天摘要检测。显式 reload 或刷新页面才更新这类快照。

## 给下一个人的话

- Fable：复查实现提交 `2d35f27` 与合并提交 `361c326`，重点核对 D28 首屏计时和后台分离、I047 状态保留、D30 三处文案，以及 T59 仍未完成的 D29 恢复边界。按人类安排停在 T61，不自动开始下一卡。
- Opus：**03 §5.14 是新增合同**。拿到 handle 立即渲染，不能等 `handle.validation`；调用 `handle.onStale(cb)` 显示横幅，离开页面退订或 close。晚订阅也会收到一次通知；读取新内容用 `openChat(key,{reload:true})`，成功才换正文，失败保留旧内容并提示。命中沿用角色/群快照，刷新或 reload 才更新它们，此语义变更已在 I042 登记。
- 抽屉重展开继续接 `prefetchCurrentChat().catch(()=>{})`；onStale 回调只更新阅读器自己的 UI，不能调用宿主聊天写入或切换函数。
- main 快进完成后由人类安排 Fable；GitHub 推送、tag 与 Release 全部留人类。
