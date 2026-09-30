# 交接信模板

文件名：`YYYY-MM-DD_<from>_to_<to>_<任务ID>.md`，例如 `2026-10-02_astra_to_human_T12.md`。

```
# <任务ID> 交接：<一句话>

## 做了什么
- 

## 改动文件
- 

## 人类验收步骤（必填，小白可操作）
1. 双击 …
2. 点 …
3. 应看到 …

## 只读自查（必填）
- rg --no-ignore -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src vendor style.css → 结果为空：是/否（防护名单命中须逐条说明）
- node dev/audit-readonly.mjs → 分类审计结果；T40 后使用仓库根扩展路径。
- 本任务是否读写过 F:\Claude\xinllm\SillyTavern\data：否

## 已知问题 / 没做的
- 

## 给下一个人的话
- 
```
