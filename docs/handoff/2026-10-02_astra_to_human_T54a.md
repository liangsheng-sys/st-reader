# T54a 交接：自身版本、更新服务、日志与已读标记

分支：`task/T54a-update-core`，从 main `35ec7dc` 开始。I041 已按人类“已通过，请继续T54a”记录通过并快进 main；本卡完成后停下等验收。未合并 T53，也未领取 T54b / T57。

## 做了什么

- 新增 `updateService.js`：getVersion / checkUpdate / runUpdate / getChangelog，以及 getLastSeenVersion / markVersionSeen。版本从自身 manifest 读，日志从同源 CHANGELOG 分段，已读版本只存阅读器自己的 settings。
- ST 1.14.0 源码核对：两个 Git 接口均为 POST `{extensionName:'st-reader', global}`。用户目录优先；不存在才尝试全局；更新仅针对确认的位置。双击合并请求，失败不跨目录重试；完成后提示刷新。
- 开发目录正常返回 `{state:'dev', message:'开发目录，不可更新'}`。无 Git 的空响应、明确缺 origin 的 500 均识别；权限/断网/异常响应仍报可重试错误，不误说已最新或开发目录。
- **当前 E 盘工作仓库实际已有 GitHub origin**。因此给固定 `.dev` 进程的自身 manifest 加开发响应标记，check/run 看见标记直接返回 dev，不执行 Git。此标记不写 manifest、不改宿主文件；正式 ST 不加载该预载模块。
- 提供开发验收面板、自动浏览器脚本、Node/浏览器验证。README 补“检查更新 / 更新：ST 访问 github.com”；03 §1 登记允许接口，§5.15 交付 UI 合同，06 I043 通知 Opus。

## 改动文件

- `src/core/updateService.js`、`updateService.test.js`、`updateServiceBrowser.test.js`：服务、19 项共享逻辑测试、4 项真实浏览器验证与开发演示。
- `index.js`：仅增加开发自测与演示入口。
- `dev/isolate-dev-st.mjs`：开发 manifest 响应标记。
- `dev/selftest.mjs`、`dev/test-performance.mjs`、`dev/test-update-service.cmd`、`dev/README.md`：可执行验证与说明。
- `README.md`、`docs/03_TECH_SPEC.md`、`04_TASKS.md`、`06_ISSUES.md`、本信：披露、合同、任务与交接。
- 未改 `src/ui/`、`readonlyGuard.js`、`manifest.json`、`CHANGELOG.md`；版本仍为 0.1.0。

## 人类验收步骤（必填，小白可操作）

1. 在文件资源管理器打开 `E:\st-reader\dev`。如果旧的开发黑窗口还开着，先在那个窗口按 Ctrl+C 停止；然后双击 `start-dev-st.cmd`，等出现 `SillyTavern is listening`。**本次需要重启开发服务**，只有刷新网页不能加载新的开发响应标记。不用重装，不用生成数据。
2. 在浏览器地址栏粘贴 `http://localhost:8100/?stcrUpdateDemo=1` 并回车；若页面旧了按 Ctrl+F5。网址端口必须是 8100。
3. 应弹出面板，标题 **ST Reader v0.1.0**，下面显示 **开发目录，不可更新**，再下面是本地 0.1.0 更新日志。v0.1.0 正确，升到 0.2.0 是后面的 T57。
4. 点击“检查更新”，应仍显示开发目录提示，无报错；“立即更新”按钮不能点击。点“关闭”回到 ST，原聊天仍在。本面板供 core 验收，正式 Aa 设置页由 Opus T54b 接入。
5. 保持开发服务运行，回到文件资源管理器，双击 `test-update-service.cmd`。脚本自动使用本机已有浏览器独立测试，不需要操作那个浏览器。等黑窗口出现 **浏览器完整自测通过：210 项**、**全部通过**、**T54a OK.**；若出现 FAILED，保留窗口内容给我。
6. 双击 `test-core.cmd`，Node 应显示 **全部通过（145 项）**，UI 应显示 **全部通过（30 项）**。不需要安装任何依赖。
7. 想自己看专项列表：在开发网页按 F12，点 Console / 控制台，粘贴 `await stcrSelfTest({core:false,updateService:true})` 回车，应有 **36 项全绿**。这一步可选，步骤 5 已自动执行同样的专项与全量回归。

结果报告在 `E:\st-reader\.dev\fixtures\t54a-performance-result.json`，开发演示截图在同目录 `t54a-update-demo.png`，均不入 Git。浏览器验收会暂存当前版本到阅读器的 lastSeenVersion，然后恢复原值；不改变你的“是否看过更新”状态。

## 验证结果

- Node **145/145**；UI **30/30**；T54a 浏览器专项 **36/36**；完整浏览器 **210/210**。
- 日志测试包含 BOM/CRLF、多个版本、三级标题、围栏中的假版本、预发布与空日志；用户/全局位置、双击、更新竞态、500 无远端、权限/网络/浏览器 TimeoutError、异常响应、settings 往返均覆盖。
- 浏览器读到 version `0.1.0`、state `dev`、hostUnchanged `true`。T54a 实际请求只有自身 manifest 与 CHANGELOG 的 GET；**零 version/update 请求**。自动浏览器另加 Git API 拦截作为测试闸门，最终 `blocked:[]`，没有触发它。
- 成功更新、全局安装、无远端服务器响应使用替身验证并与宿主源码对照；未对任何真实仓库执行 Git fetch/pull，不把替身测试说成真实在线更新成功。
- 完整 ST 初始化会出现自身 `/api/settings/save`、`/api/quick-replies/save`，均在 `.dev`；它们是宿主初始化行为，T54a 服务只发送上面的 GET。无禁用聊天写接口，既有聊天 fixture 大小与 SHA-256 校验通过。

## 只读自查（必填）

执行：

```text
rg --no-ignore -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src vendor style.css
```

结果不为空，共 8 行，均为已有保护 / 拒绝测试：

```text
src/core/readonlyGuard.js:4  '/api/chats/save'
src/core/readonlyGuard.js:5  '/api/chats/rename'
src/core/readonlyGuard.js:6  '/api/chats/delete'
src/core/readonlyGuard.js:7  '/api/chats/import'
src/core/readonlyGuard.js:8  '/api/chats/group/save'
src/core/readonlyGuard.js:9  '/api/chats/group/delete'
src/core/readonlyGuard.js:10 '/api/chats/group/import'
src/core/htmlSnapshot.test.js:12 拒绝 javascript/file/凭据 URL 及禁写路径的输入样本
```

前七行逐条是对应路径的拒绝名单；最后一行是纯解析测试输入，不发送请求。无新增命中，禁用清单保持原样。

- `node dev/audit-readonly.mjs`：扩展 forbiddenCalls **0**、hostWrites **0**；禁写路径仅以上 **8** 行；隐私文件跟踪 **0**，静态边界检查通过。新增网络命中为同源服务传输与虚构响应替身，未增加浏览器第三方业务请求。
- `git diff --check` 通过；`git diff -- src/ui src/core/readonlyGuard.js manifest.json` 为空。
- 本任务是否读、列、复制或写过 `F:\Claude\xinllm\SillyTavern\data`：**否**。仅只读核对宿主 public/src 代码；所有实例访问固定 `.dev/data`。
- 未写 C/F 盘、未安装依赖、未创建 node_modules、未下载大文件。Chrome 配置、缓存、临时文件均在 E 盘 `.tmp`；本次自己的临时浏览器目录已自动清理。没有读或复制反馈截图里的聊天文字。

## 已知问题 / 没做的

- T54b 正式设置页、更新提醒开关和首次打开弹日志由 Opus 做，本卡未修改 UI。
- 正式 ST 的人工联接若指向已有 Git 远端的目录，浏览器无法通用识别 NTFS 联接；它按 ST 自身更新机制处理。固定开发实例通过进程标记保护。服务端 Git 超时后是否仍在运行由 ST 决定，core 不自动重试。
- T53 仍在独立 `task/T53-memory-cache`，I040 的 <300 ms 未达标，未因这次“继续 T54a”而记为通过；T53 合同编号 I042 保留。

## 给下一个人的话

Opus：从 `src/core/updateService.js` 导入六个单例方法，详见 **03 §5.15 / 06 I043**。`checkUpdate` / `runUpdate` 返回状态对象；读取版本/日志可能抛错，要显示友好提示。dev 文案直接显示，禁用更新；updated 始终提示刷新。不要把 API 的 commit hash 当新版语义版本。将当前日志显示成功后再 `markVersionSeen(version)`，首次安装 null 与提醒开关策略由 T54b 明确处理。日志 Markdown 经 ST Showdown + DOMPurify 渲染。

需要复用本卡时连同 `dev/isolate-dev-st.mjs` 一起整合并重启 8100。当前分支已含人类通过的 I041 高度修复；§5.14 留给 T53，避免合并时重编号。不要覆盖 Opus 已在独立工作树完成的 UI 文件或把本开发演示当成正式入口。此次交付停在 T54a 待验收。
