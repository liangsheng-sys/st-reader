# 开工提示词使用方法

1. 打开终端，进入 `E:\st-reader`。
   - astra：运行 `codex`（已配置 gpt-6-astra）。
   - Opus：运行 `claude`，用 `/model` 切到 Opus 5.5。
2. 把对应 `.md` 的全文粘贴为第一条消息。
3. AI 完成一张卡会停下告诉你怎么验收。你只回答"是 / 接近 / 不是 + 一句话"。
4. 把结论记到 `docs/07_FEEDBACK.md`（可让 Claude Code 帮你记）。
5. 顺序：先 `astra_T10-T14.md`（可与 `opus_T20.md` 同时进行）；astra 交付 T12 后再给 Opus `opus_T21-T23.md`。

| 文件 | 给谁 | 前置 |
|---|---|---|
| `astra_T10-T14.md` | Codex / astra | T01（F 盘清空间）建议先做，但 M1 只用 E 盘，可先开工 |
| `opus_T20.md` | Claude Code / Opus | 无 |
| `opus_T21-T23.md` | Claude Code / Opus | 已用完（T21、T22 已交付）；T23 已拆卡，改用下一行 |
| `opus_T23a-T23b.md` | Claude Code / Opus | T22 验收通过后，粘给同一个 Opus 会话或新会话均可 |
| `astra_T30.md` | Codex / astra | T23b 已通过、T31 复查已出；**先做 T01 清 F 盘** |
