# 人类操作手册（Windows）

## 0. 先决条件
- 你的 SillyTavern 在 `F:\Claude\xinllm\SillyTavern`（1.14.0）。**F 盘只剩 145 MB**，先清出 ≥ 5 GB，否则 ST 自己都可能保存失败（T01）。
- 本仓库在 `E:\st-reader`。所有开发文件、临时文件都只在这里。
- 已装：Node 24、git、Codex CLI、Claude Code。

## 1. 给 AI 开工
1. 打开终端，进入 `E:\st-reader`。
2. astra：运行 `codex`；Opus：运行 `claude` 后用 `/model` 切到 Opus 5.5。
3. 把 `docs/prompts/` 里对应文件的全文粘贴为第一条消息。
4. AI 做完会告诉你怎么验收。你只回答"是 / 接近 / 不是 + 一句话"，记到 `docs/07_FEEDBACK.md`（可让 Claude Code 帮记）。

## 2. 启动开发实例（T10）

### 第一次打开
1. 打开资源管理器，在上面的地址栏粘贴 `E:\st-reader\dev`，按回车。
2. 双击 **start-dev-st.cmd**。不需要管理员权限，也不需要安装依赖。
3. 保持弹出的黑窗口打开。第一次 ST 会初始化默认资源并编译自己的前端，可能需要几分钟。看到 **SillyTavern is listening on IPv4: 127.0.0.1:8100** 就准备好了。
4. 打开浏览器，在地址栏输入 **http://localhost:8100**。如果出现欢迎页，在用户名框填一个虚构名字（例如“测试读者”），点“保存”。不需要连接 AI 服务。
5. 点页面顶部的 **积木图标（扩展）**，再点 **管理扩展**。在 **Installed Extensions** 中应看到 **阅读器 (ST Reader) 0.0.1**，左侧复选框已勾选。
6. T10 只交付开发环境和保护措施，现在还没有阅读器按钮、合成聊天或完整界面。ST 自带的示例角色、背景和预设属于程序默认资源；我们的测试角色与聊天由 T11 生成。

### 检查只读保护
1. 在开发实例页面按 **F12**（笔记本可能需要 **Fn+F12**），选择 **Console / 控制台**。
2. 应看到两行日志：`[st-reader] 开发实例只读保护已开启。` 和 `[st-reader] 占位入口已加载，等待 T12/T21 实现。`。如果看不到，刷新一次页面。
3. 输入 `await window.stcrSelfTest()`，按回车。应看到 13 项 `passed: true`，最后显示“全部通过（13 项）”。测试使用内存中的替身，不会向服务器发送测试请求。
4. 也可以直接打开 **http://localhost:8100/?stcrSelfTest=1**，它会在页面初始化完成后运行同一套测试；仍在控制台看结果。

保护只在本机 **8100** 端口默认开启；`localhost`、`127.0.0.1`、`[::1]` 地址均可识别（当前服务配置只监听 IPv4）。它会拦截整个开发页面通过 `fetch` 发出的禁用聊天写入请求，包括 ST 自己的保存或删除动作，报错名为 `StcrReadonlyError`。不要在开发实例中发送、编辑或删除聊天；后续使用生成器准备合成数据。这个保护不是所有网络通道的安全沙箱，扩展仍须遵守 D02，逐次做只读审计。

### 重复启动与停止
- 以后仍双击同一个 cmd。已有正确配置和目录联接会复用，不覆盖开发聊天与设置。
- 停止时切到黑窗口，按 **Ctrl+C**；如果询问“终止批处理操作吗”，输入 **Y** 再回车。正常退出会清理本次 `.tmp` 临时目录。直接关闭黑窗口也会停止服务，但可能留下临时目录。
- 若提示 **8100 端口不可用**，先关闭上次启动的开发实例窗口，再双击；脚本不会替你关闭其他程序。
- 若提示配置中的 `dataRoot`、`port`、`listen` 或 `whitelistMode` 不符合要求：停止开发实例，用记事本打开 `E:\st-reader\.dev\config.yaml`，对照 `E:\st-reader\dev\config.dev.yaml` 恢复这四项，保存后重试。不要改成真实 ST 的数据目录。
- 若提示已有扩展目录不是正确联接，脚本会停止并保留原目录。把完整提示发给工程师，不要删除里面的文件。

### 文件在哪里（给接手工程师）
- `.dev/config.yaml` 首次从受版本管理的 `dev/config.dev.yaml` 创建，四项固定值是 `dataRoot: E:\st-reader\.dev\data`、`port: 8100`、`listen: false`、`whitelistMode: true`。ST 会自动补全自己的其他默认配置，后续启动不覆盖它。
- `.dev/data/default-user/extensions/st-reader` 是指向 `E:\st-reader\extension` 的 **目录联接**。没有复制扩展，也没有在真实 ST 数据目录中建立联接。
- 启动器仍运行现有 `F:\Claude\xinllm\SillyTavern\server.js`，始终显式传入固定的 `--dataRoot` 与 `--configPath`，不接受用户传入替代路径。Node 临时目录位于 `.tmp/stcr-runtime-*`，编译缓存位于 `.dev/data`。
- `dev/isolate-dev-st.mjs` 通过 Node 的 `--import` 仅调整开发进程内的全局扩展目录到 `.dev/global-extensions`、程序备份目录到 `.dev/program-backups`。因此“管理扩展”不会枚举或更新 F 盘的全局第三方扩展；F 盘源码没有修改。内置正则等系统扩展照常加载。
- 开发设置首次从 ST 程序自带的默认设置创建，初始 AI 后端选本地、未连接；关闭模型和分词器下载、第三方扩展自动更新、服务端插件。不会读取或复制真实用户设置。
- `.dev/` 与 `.tmp/` 均被 Git 忽略。Node 24 自测命令：在仓库终端运行 `node dev/selftest.mjs`；仅初始化不启动：`dev\start-dev-st.cmd --prepare-only`。

## 3. 安装到你自己的 ST（T30 交付后）
1. 关闭 ST。
2. 双击 `E:\st-reader\install\link-to-my-st.cmd`。它只在 `F:\...\data\default-user\extensions\` 下建一个"目录联接"指向 `E:\st-reader\extension`，不复制、不读、不写你的聊天。
3. 启动 ST，扩展面板里启用"阅读器 (ST Reader)"。
4. 卸载：删除那个联接目录即可（`rmdir F:\Claude\xinllm\SillyTavern\data\default-user\extensions\st-reader`，只删联接不删 E 盘文件）。

## 4. 备份你的批注与收藏
阅读器设置里"导出 JSON"，文件保存到 E 盘。它们不在聊天文件里，重装浏览器会丢。
