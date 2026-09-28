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

## 2. 启动开发实例（T10 交付后可用）
双击 `E:\st-reader\dev\start-dev-st.cmd`。它用你现有的 ST 程序代码，但数据目录是 `E:\st-reader\.dev\data`，端口 8100。**里面只有 AI 生成的假聊天，与你的真实聊天完全无关。**
浏览器打开 `http://localhost:8100`。关掉那个黑窗口就是停止。

## 3. 安装到你自己的 ST（T30 交付后）
1. 关闭 ST。
2. 双击 `E:\st-reader\install\link-to-my-st.cmd`。它只在 `F:\...\data\default-user\extensions\` 下建一个"目录联接"指向 `E:\st-reader\extension`，不复制、不读、不写你的聊天。
3. 启动 ST，扩展面板里启用"阅读器 (ST Reader)"。
4. 卸载：删除那个联接目录即可（`rmdir F:\Claude\xinllm\SillyTavern\data\default-user\extensions\st-reader`，只删联接不删 E 盘文件）。

## 4. 备份你的批注与收藏
阅读器设置里"导出 JSON"，文件保存到 E 盘。它们不在聊天文件里，重装浏览器会丢。
