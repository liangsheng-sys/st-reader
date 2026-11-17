# T101 交接：整本导出保留酒馆隐藏过的普通楼

## 做了什么

在酒馆里点过小眼睛的用户楼和角色楼，现在随整本聊天一起导出到 TXT 或 HTML。旧设置也直接生效。系统提示和旁白仍由原来的勾选项控制，默认跳过。

## 改动文件

- `src/core/messageModel.js` 增加与阅读器 T62 相同的两条判定。`src/core/documentText.js` 增加默认开启的 `include.stHidden`。`src/core/documentExport.js` 分别过滤并统计两类楼。
- `src/core/documentText.test.js` 新增两个 Node 回归。覆盖两个开关的四种组合、旧选项、隐藏用户楼、多候选系统名、旁白、无名提示和空正文；用星灯原始样本跑整本 TXT。Node 使用正式导出器的原文回退，8100 在 `src/core/coreBrowser.test.js` 另验真实排版，要求回退次数为零。
- `src/ui/ui.test.js` 经人类授权，仅同步一条硬编码默认对象的期望值及测试名。界面业务代码留给 T99。`docs/03_TECH_SPEC.md` §5.22、任务板及 I064 已同步。

## 人类验收步骤

1. 关闭原有 8100 页面。双击 `E:\st-reader\dev\start-dev-st.cmd`，黑窗口显示 `127.0.0.1:8100` 后，在浏览器打开 **http://localhost:8100**。main 合入后，常规开发入口即可复验。
2. 点书本图标打开阅读器，点左上角 **≡ → 按角色 → 星灯（虚构）→ STCR-01-正则与多候选**。
3. 点顶栏 **⋮ → 导出为文档…**，选 **纯文本 .txt** 和 **整个聊天**，勾上 **楼号** 和 **我说的话**。把 **系统楼和隐藏楼** 留空，点 **导出**。这个复选框的旧文案由 T99 更新。
4. 在浏览器下载列表里点开刚下载的 TXT。应看到 **第 1 楼** 至 **第 12 楼** 的连续标题。被隐藏的三条正文里依次有「第 1 楼，星灯在虚构灯塔记录天气」「第 2 楼，测试旅人把一张虚构船票放在桌上」「第 3 楼，星灯在虚构灯塔记录天气」。样本正文从 0 数，TXT 标题从 1 数，所以这三条的标题分别是 **第 2、3、4 楼**。
5. 验收完先关 8100 浏览器页，再到黑窗口按 **Ctrl+C** 停服。

## 实测

- Node 自测 226 项、UI 自测 46 项、静态只读审计通过。原版 `dev/test-release.cmd` 首轮退出码 0，输出 `T57 OK`。完整浏览器自测 331 项、界面主题自测 101 项通过；与 T100 最终一轮一样，仅给本轮独立 Chrome 临时提高调度优先级。
- 8100 星灯默认整本导出 12 楼，无排版回退；关掉 `stHidden` 后导出 9 楼，`skippedHidden=3`、`skippedSystem=0`。另在独立浏览器点击旧对话框的导出按钮，确认「系统楼和隐藏楼」未勾，从磁盘读回实际下载的 TXT，核对了全部 12 个标题及三段隐藏正文。
- 浏览器报告宿主快照一致，禁用或外网请求 0 次。运行前已复制 8100 的 `settings.json`、3 份阅读器备份和已有设置轮替备份，测试页面与服务退出后还原，逐份 SHA-256 一致。开发联接指向原主工作区；专用验收入口仅在 8100 进程中提供本卡静态文件。

## 只读自查

- `rg --no-ignore -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src vendor style.css` 命中 8 行。`readonlyGuard.js` 第 4–10 行是 7 条禁用路径，`htmlSnapshot.test.js` 第 12 行是须拒绝的测试输入。
- `node dev/audit-readonly.mjs` 通过，扩展禁用调用与宿主赋值均为 0 行。守卫与审计脚本均与 main 相同。
- 本任务是否读写过 `F:\Claude\xinllm\SillyTavern\data`：否。

## 已知问题 / 没做的

T101 的核心接口已能分别选两类楼。对话框上的两个独立勾选项和实时楼数由 Opus 的 T99 ⑤ 接入。

## 给下一个人的话

- T99 可直接从 `messageModel.js` 导入 `isSystemLikeFloor`、`isStHiddenFloor`，两个包含项分别是 `include.hidden` 和 `include.stHidden`。
- `stats.skipped` 按这张卡的约定等于 `skippedSystem + skippedHidden`。若完成提示要统计范围内所有未写出的楼（如取消用户楼、过滤后为空），用所选范围楼数减 `stats.floors`。
- 分支 `task/T101-export-hidden` 包含已验收的 T100。2026-11-17 人类确认 T101 通过。交付本地 main，待 Fable 做 T102 复查。
