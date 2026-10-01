# T46 交接：发布材料与 Windows 小白发布指南

## 做了什么

分支 **task/T46-release-docs**，从 Opus 已验收的 I032 界面提交 **5cf89c9** 开始，包含当前画面截图、默认外链素材及 I033/I034 修复。本卡只改文档，没有改运行代码、manifest 或任何安装脚本。

- [README](../../README.md)：中文功能与安装说明、英文一段；只读与无信息收集声明；D22/D23 默认外链和实际关闭位置；六个参考项目以“思路参考，未复制代码”致谢；AGPL-3.0 与 MIT 依赖区分。
- [CHANGELOG](../../CHANGELOG.md)：0.1.0 功能、修补、发布变化及已知边界；不伪造已发布日期。
- [发布指南](../发布指南.md)：网页建 Public 空仓 → E 盘 PowerShell → origin → 首次浏览器认证 → main 推送 → v0.1.0 标签 → 网页 Release → URL 安装 → 社区帖子模板 → 后续更新；兼容旧 PowerShell，tag 与 push 分成两行。
- 文案按当前 UI 与合同核对：HTML 默认允许外链；截图继承该块的网络选择，正常默认带上素材；资源读取失败有提示。没有使用早期“默认断网 / 截图永远断网”的过期要求。
- 指南明确 **main 仍停在 T40，必须先完成验收、T47 与发布分支整合**，不能直接照推旧 main。实际推送、标签、Release、帖子和真实 ST 安装仍由人类完成。

## 改动文件

- `README.md`、`CHANGELOG.md`、`docs/发布指南.md`
- `docs/00_README_FOR_AI.md`、`docs/04_TASKS.md`、`docs/06_ISSUES.md`、`docs/07_FEEDBACK.md`
- 本交接信

## 人类验收步骤（现在验文档，不需要先发布）

1. 在 Codex 里点上面的 **README** 链接；也可在资源管理器进入 **E:\st-reader**，右键 `README.md`，用记事本打开。应能找到功能、仓库 URL 安装、只读与隐私、第三方域名披露、致谢、AGPL 和英文简介。
2. 看“第三方域名披露”：应写默认允许用户 HTML 外链、截图带素材，有 Aa 与截图窗口的关闭方法；同时写明作者不收集信息、安装更新经 GitHub。不能出现默认每次确认才能联网的旧要求。
3. 打开 **E:\st-reader\CHANGELOG.md**，应看到 **0.1.0**、当前画面截图、自由框选、默认 2 倍、外链素材及已知限制。
4. 打开 **E:\st-reader\docs\发布指南.md**，从第 0 节顺着读到第 10 节。应能看懂：在哪里建仓、勾 Public、不勾 README/LICENSE、怎样打开 E 盘终端、浏览器登录、怎样判断 push 成功、在哪发 Release、以后怎么更新。
5. 查看第 8 节帖子模板：源码地址、AGPL-3.0、无信息收集、第三方请求来源与关闭方式都在首楼文字里。模板无需修改代码；此时还不必发帖。
6. 双击 **E:\st-reader\dev\test-core.cmd**，应先看到 **119 项全部通过**，再看到 **30 项全部通过**。这是现有检查；本卡没有增加只测文案实现的测试。
7. 按下方“只读自查”执行只读命令。确认通过后回复验收意见；T47 的发布前复查和 T48 的真实发布后续再做。

## 验证结果

- `node dev/selftest.mjs`：**119/119**，没有网络请求。
- `node src/ui/ui.test.js`：**30/30**。
- `node dev/audit-readonly.mjs`：静态边界检查通过，运行文件共 **923861 字节**；本卡没有改变该体积。
- README/指南中的按钮对照当前 `src/ui/mount.js`、`settingsBar.js`、`htmlBlocks.js`、`htmlShot.js` 和 ST 1.14.0 的 `public/scripts/extensions.js`；仅阅读允许访问的宿主源码。
- Git Credential Manager 本机只读核对：**2.6.1**，`credential.helper=manager`。查版本不触发登录；没有配置全局凭据或写 C 盘。
- GitHub 建仓、浏览器认证、导入已有仓库、网页 Release 的步骤依据官方文档复核，原链接在指南相应步骤；ST 安装/更新以本机源码及官方扩展说明核对。
- 当前跟踪和 Git 全部分支历史中，`.dev/`、`.tmp/`、`docs/*.png` 均无记录。没有打开含真实聊天的两张截图，也没有把它们放进演示或发布材料。
- 文档静态核对：5 份入口/交接文档的 **17 个本地链接、1 个锚点**有效，代码块闭合，0.1.0 / 仓库 URL / auto_update 与 manifest 一致；**9 个 PowerShell 命令块**仅解析语法，通过。未执行指南中的建远端、推送、打标签、登录或安装命令，也不把它们报告为端到端发布成功。
- 本卡没有运行浏览器功能回归；运行代码与 `5cf89c9` 完全相同，既有 I032 浏览器实证见其交接。没有启动 ST 开发服务。

## 只读自查（grep）

资源管理器打开 **E:\st-reader**，在地址栏输入 **powershell** 回车；下列命令逐行粘贴并回车：

```powershell
rg --no-ignore -n 'chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(' index.js src vendor style.css
node dev/audit-readonly.mjs
git ls-files .dev .tmp 'docs/*.png'
git log --all --format= --name-only -- .dev .tmp 'docs/*.png'
```

- grep **8 行**：`src/core/readonlyGuard.js:4–10` 共 7 行拒绝名单，`src/core/htmlSnapshot.test.js:12` 共 1 行纯函数拒绝样本；不是写入调用。
- 分类审计：扩展运行文件的禁写函数调用 **0**，宿主 chat / metadata / swipe 赋值 **0**。截图资源 GET 属 D23 已授权范围；本卡没有新增请求代码。
- 最后两条命令无输出：无开发数据、临时文件或两张截图进入当前跟踪/历史。
- **未读、列、复制、写 F:\Claude\xinllm\SillyTavern\data；未写 C/F；未安装依赖、下载大文件、执行安装脚本或推送。**

## 已知问题 / 没做的

- T46 是发布材料交付；还没有公开仓库/Release 的实际安装与更新验收，留给人类 T48。
- T47 未开始；I020 的超长聊天打开时间波动仍未关闭，README/CHANGELOG 如实披露，未写“50 MB 稳定秒开”。
- I030 的 core 元数据接口归位仍是后续工程事项，UI 已有临时只读适配，本卡不更改接口。
- UI 源码个别注释仍有“截图始终断网”等历史文字，实际实现已按 D23 联网内嵌；在 I031 记录，留给 Opus 清理，不在本卡改别人的源码。
- 不补可选 GIF，不使用真实聊天截图。不移动 main、不改 Opus 工作区、不创建 tag/remote，不启动下一张任务。

## 给下一个人的话

Fable 做 T47 时以 **D22/D23** 和当前实现核对披露：HTML 阅读与截图允许用户资源；无固定自有服务/遥测；安装更新由 ST/Git 访问 GitHub。请保留“站点会收到正常资源请求”与“扩展不收集信息”两层说明，不改回绝对零出站。

人类验收本卡后，由后续负责整合的工程师把已验收代码、材料及 T47 结果整合到 main，给人类确切的发布提交编号，再按指南推送。`manifest.json` 仍为 **0.1.0**、homePage 为目标仓库、auto_update 为 true；这三个字段本卡只核对，没有改动。§5 合同没有变化。
