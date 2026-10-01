# T53 交接：内存缓存可验收，300 ms 速度指标仍受宿主摘要接口阻塞

## 做了什么
- 人类验收 T51 后，将其快进到 main（731c7d2），从 main 创建 `task/T53-memory-cache`。本卡未合并回 main，未推送远端，未开始 T54a。
- `chatSource` 增加纯内存 LRU：最近 3 个聊天、总计不超过 150,000,000 估算字节；保留原始数组、深度索引、按需构建的冻结楼层模型和页。切换与关闭阅读器保留缓存；刷新清空；正文不写 IndexedDB。
- 每次打开先读取最新角色/群信息，再用 search 返回的 file_size / last_mes / 楼数校验。命中不再请求 chats/get；摘要变化丢弃旧缓存后重拉；文件消失、读取失败不冒充成功。
- 单聊与群聊、不同 pageSize、同文件多个句柄、并发请求、独立取消、超限淘汰、清空期间的迟到响应均有测试。角色正则和群元信息不缓存，避免原始正文未变而作用域设置过期。
- 五个列表 API 自动预取当前聊天第一页，并行列表请求合并一次预取；不预取整个列表。ST 没有分页取正文接口，所以首次预取仍需下载这一个聊天全文，只构建第一页。
- `src/ui/` 保持原样。首次打开抽屉已有列表调用，因此会预取；已画好的抽屉再次展开没有 core 调用，接线留 Opus（I041）。新增显式预取、清空与统计接口，合同在 03 §5。
- 新增一键浏览器测试，真实测量到正式阅读器正文首帧，记录请求次数与耗时，并跨页面刷新验证空缓存。保留 300 ms 的失败断言；没有用跳过校验、迁走其他大样本或修改宿主来制造达标。

## 改动文件
- `src/core/chatCache.js`（新增）、`chatSource.js`：内存限额、LRU、校验与预取。
- `src/core/chatCache.test.js`、`chatCacheBrowser.test.js`（新增），`core.test.js`、`dev/selftest.mjs`、`index.js`：逻辑、真实 API、阅读器与刷新验证。
- `src/core/performanceBrowser.test.js`：D24 改为主动保留缓存，旧 T30 的内存释放断言相应改为“切小聊天并显式清空缓存后”。
- `dev/test-performance.mjs`、新增 `dev/test-chat-cache.cmd`：共用现有浏览器驱动，增加 T53 模式；不安装依赖。
- `README.md`、`dev/README.md`、`docs/03_TECH_SPEC.md`、`04_TASKS.md`、`06_ISSUES.md`、本信：隐私说明、合同与限制、I040/I041。

## 人类验收步骤（必填，小白可操作）
1. 用资源管理器打开 **E:\st-reader\dev**，双击 **test-core.cmd**。应看到两次“全部通过”：**142 项**与 **30 项**。按任意键关闭这个检查窗口。
2. 同一文件夹双击 **start-dev-st.cmd**，保持黑窗口打开，等出现 8100 网址。用浏览器打开 **http://localhost:8100**，按 **Ctrl+Shift+R** 强制刷新。不要到真实酒馆操作。
3. 关闭阅读器（若已打开），按 **F12**，点 **Console / 控制台**，在底部输入下面一行并回车：

   ```js
   await window.stcrSelfTest({core:false,chatCache:true})
   ```

   应显示 **全部通过（34 项）**。其中会检查缓存命中、模拟文件摘要变化后的重拉、数量/容量淘汰和真实 API 读取。模拟变化只在内存替身中进行，不编辑聊天文件。
4. 保持开发服务运行，回到资源管理器，双击新增的 **test-chat-cache.cmd**。它会自动启动本机已有浏览器的独立测试环境，不需要你点选大聊天；结束后自动关闭、清理临时配置。约一分钟后，窗口输出四个 `readerMs` 数字（首次和三次重开）、`refreshEmpty: true`、`hostUnchanged: true`、`blocked: []`，并显示完整浏览器自测 **203 项通过**。
5. **当前已知结果是最后出现 T53 FAILED / “未全部达标”**：因为重开超过 300 ms。这不是让你忽略错误或勾整卡通过。缓存功能可单独确认，速度指标仍未过线。完整报告可在资源管理器打开 **E:\st-reader\.dev\fixtures\t53-performance-result.json**，用记事本查看；无需读懂代码，把测试窗口的结果告诉我即可，不要发含真实聊天的截图。
6. 如想看实际操作：在开发酒馆点书本图标 → 左侧聊天列表 → **按角色 → 雾岚（虚构）→ STCR-90-大文件-1600楼**。正文出现后关闭阅读器，再从同一列表打开。可正常阅读、翻页，但仍有摘要校验等待。计时以第 4 步为准。
7. 结束后，在开发服务黑窗口按 **Ctrl+C** 停止。只停本次 8100 开发窗口。本卡停在这里等你的验收/指示，未领取 T54a。

## 可执行验证与结果

| 检查 | 实测结果 |
|---|---|
| `node dev/selftest.mjs` | 142/142；其中 T53 16 项，含 hit / invalidate / LRU / 字节淘汰 / 取消与预取 |
| `node src/ui/ui.test.js` | 30/30；未改 UI |
| 默认完整 `stcrSelfTest()` | 203/203；含 T53 逻辑和 5 项真实 API 检查、既有 HTML/PNG/字体/存储回归 |
| 21.35 MiB（22,387,914 字节）、1600 楼 core 打开+第一页 | 最终复测首次 1215.7 ms；重开 698.8 / 773.8 / 822 ms |
| 正式阅读器首帧（1440×1000、Chrome 154、合成 Ny 字体） | 最终复测首次 1696.8 ms；重开 **986.2 / 948.5 / 1069.8 ms**；**未达 300 ms** |
| 阅读器三次重开的 search 请求 | 最终复测 821.6 / 798.8 / 900.2 ms；其余角色读取与渲染也计入首帧，没有扣掉 |
| 正文请求次数 | core 独立缓存四次打开 1 次；正式阅读器独立缓存四次打开也仅 1 次 |
| 跨页面刷新 | 刷新前真实建立小聊天缓存；页面重载后 entries 为 0，refreshEmpty 为 true |
| 宿主只读、网络 | 测试前后聊天、元信息、选择、候选快照相同；D02 / 外网请求 0 |
| D24 下旧 T30 内存回归 | 切小聊天并清空 LRU 后，三轮回收增量约 97.5%–97.8%；峰值 68,046,439 → 30,317,325 / 30,407,077 / 30,434,077 字节 |
| 旧 T30 性能 | 三次打开 2263 / 1982 / 1920 ms；翻屏 P95 69 ms、最慢 103 ms；单批最慢 **319 ms > 300 ms**，仍失败，不关闭 I020 |

原始报告只保存在开发目录：最终 `t53-performance-2026-10-01T15-07-06-855Z.json` 与 `t53-performance-result.json`；首轮 `t53-performance-2026-10-01T14-57-01-094Z.json` 也保留，首轮重开 1022.6 / 856.6 / 764.2 ms 同样失败，不能挑最快值覆盖最终结果。最终复测包含“清空缓存隔离前后在途请求”的补充回归。旧 T30 复测为 `t30-performance-2026-10-01T15-01-46-945Z.json`。报告不入库、没有聊天正文。T53 报告记录性能失败，完整 203 项回归结果在同次脚本标准输出。运行结束已清理本次浏览器临时配置；既有其他任务的 `.tmp` 文件不动。

## 只读自查（必填）

执行：

```text
rg --no-ignore -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src vendor style.css
node dev/audit-readonly.mjs
```

grep 结果非空，仅 **8 行既有防护/拒绝样本**，逐条核对未调用：
- `src/core/readonlyGuard.js:4`：`/api/chats/save` 禁用名单。
- `src/core/readonlyGuard.js:5`：`/api/chats/rename` 禁用名单。
- `src/core/readonlyGuard.js:6`：`/api/chats/delete` 禁用名单。
- `src/core/readonlyGuard.js:7`：`/api/chats/import` 禁用名单。
- `src/core/readonlyGuard.js:8`：`/api/chats/group/save` 禁用名单。
- `src/core/readonlyGuard.js:9`：`/api/chats/group/delete` 禁用名单。
- `src/core/readonlyGuard.js:10`：`/api/chats/group/import` 禁用名单。
- `src/core/htmlSnapshot.test.js:12`：恶意 URL 拒绝样本，未请求。

分类审计通过：扩展运行文件 forbiddenPaths 8 行（如上），forbiddenCalls 0、hostWrites 0；`.dev/.tmp/docs` 隐私截图被跟踪数 0。readonlyGuard 清单未修改。新增运行时网络仍只走 chatSource 原白名单；新浏览器自测通过同源只读 POST 读取合成聊天，fetch 包装保留底层只读保护、finally 恢复。

独立浏览器全程拦截并记录外网与 D02 请求，最终 `blocked: []`。ST 启动时仍会对 `.dev` 发自己的设置/快捷回复请求，这些不是聊天写入，也不是新缓存模块的请求；报告保留其路径，不伪称整个宿主完全没有写设置。

本任务未读、列、复制或写 `F:\Claude\xinllm\SillyTavern\data`。仅核对允许读取的宿主 `src/endpoints/chats.js`。数据根固定为 `.dev/data`；未写 C/F、未安装依赖、未下载文件、未修改合成聊天正文；Node 自测仍验证聊天 SHA-256。缓存未导入 store，也没有 IndexedDB/localStorage 调用。反馈截图未读取、未复制、未入库。

## 已知问题 / 没做的
- **I040：300 ms 未达标，不能标记整张 T53 通过。** 宿主 search 的空查询仍读取、解析该角色所有聊天；雾岚同时有既有的 21 MB 和 53 MB 样本。recent 也不是按文件 stat 的廉价接口。仅在前端缓存不能消除每次必等的服务端扫描；若必须达到 300 ms，需要重新决定校验时机，或由宿主提供按文件的轻量版本摘要。本次不擅自改动这些边界。
- **I041：抽屉重复展开接线留 Opus。** 首次列表读取已自动预取，缓存后的抽屉再次展开还没有 core 事件；不能声称每次展开都已接好。
- 摘要的 file_size 是格式化大小，last_mes 是末消息日期，楼数也不是内容 hash。三个字段都相同的原地修改无法检测；刷新页面可重读。测试证明的是“摘要变化则失效”，不是任意文件改动都能被发现。
- 150 MB 是缓存保留数据的保守估算限额，不是整个浏览器进程内存上限。仍在阅读的独立句柄、DOM、格式化结果有自己的活动内存；单个超限聊天可打开但不缓存。
- T30 原有 I020 本次仍有批次加载超时；未改 UI 解决它。未做 T54a、版本号或更新服务。

## 给下一个人的话
- **Opus 请看 03 §5 与 I041。** openChat 的参数、ChatSummary 和 MessageModel 字段都没变；close 之后该句柄仍不可用，但原文和页可由 LRU 留存。模型/页共享且冻结，不要往里写 UI 状态。
- 五个列表函数现在会后台预取当前宿主聊天；不要理解成预取正在悬停的其他聊天。已缓存的抽屉每次 `open()` 可调用 `prefetchCurrentChat().catch(() => {})` 补完整打开事件，避免预取失败变成用户错误弹窗；仍只读，不切换 ST。
- `clearChatCache()` 只清缓存，不关闭现有句柄；在途旧读取不重新填回。`getChatCacheStats()` 供诊断，计数累计；不要将其 keys 当作新的聊天列表。
- 不要把 300 ms 改成更宽阈值来通过测试，不要在未经人类重新决定时改成先显示旧缓存、后台才校验。需要轻量版本接口/调整校验时机时先在 I040 明确提案。
- T51 的 I038 UI 接线仍独立待办；本分支包含已验收 T51 core。合并 T53 前仍需人类处理上述未达标项。
