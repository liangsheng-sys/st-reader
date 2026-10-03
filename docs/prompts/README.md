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
| `astra_T40-T46.md` | Codex / astra | M4 先做，T40 完成后再给 Opus |
| `opus_T42-T45.md` | Claude Code / Opus | T40 已合到 main；T44b 等 T44a |
| `astra_T51-T54a.md` | Codex / astra | M5，可与 Opus 并行 |
| `opus_T50-T55.md` | Claude Code / Opus | M5；T54b 等 T54a |
| `astra_T57.md` | Codex / astra | M5 收尾：合 T53（按 D28 改）、0.2.0、文档 |
| `opus_T59.md` | Claude Code / Opus | T57 合入 main 后 |
| `opus_T62.md` | Claude Code / Opus | 0.2.1 单卡修补（隐藏楼误判） |
| `fable_resume.md` | Claude Code / Fable（新会话） | 任何时候要继续分配任务，粘它 + 你的反馈 |
| `explorer_free.md` | 任何新模型 | 自由探索（D31），先交计划 |

