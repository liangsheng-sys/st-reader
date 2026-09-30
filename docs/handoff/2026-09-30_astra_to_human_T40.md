# T40 交接：仓库根可直接作为 ST 扩展，旧联接可安全重建

## 做了什么

- 在 `task/T40-root-layout` 用 `git mv` 将 `extension/` 全部受版本控制内容迁到仓库根：`manifest.json / index.js / style.css / src/ / vendor/`；空的旧目录已移除。完成后将本地 `main` 快进到本卡提交，不推送 GitHub。
- manifest 改为 `version: 0.1.0`、`homePage: https://github.com/liangsheng-sys/st-reader`、`auto_update: true`，保留最低 ST 版本与激活钩子。
- 根目录加入 GNU 官方 AGPL-3.0 全文（34,523 字节），SHA-256：`0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0`。60 个自有 JS/MJS/CSS 文件首行均带项目许可注释。CSS 使用合法的 `/* ST Reader — AGPL-3.0 */`，避免 `//` 使首条 CSS 规则失效。
- vendor 原始字节与迁移前完全相同，MIT 全文保留。43 个扩展 JS/CSS 文件逐个去掉新增首行后与原路径内容核对，仅 UI 自测说明中的命令路径另有更新，业务逻辑无变化。
- 开发启动器的扩展目标改为 `E:\st-reader`；只自动迁移已知旧开发联接。真实安装的新 link 同样指向根目录，unlink 同时认可根目录和旧 `E:\st-reader\extension`，旧目标悬空时也能卸下。普通文件夹及未知目标均拒绝操作，不递归删除。
- Node 自测导入、只读审计范围、工程师规则里的路径、03 §3、Windows 手册与各 README 已同步；历史交接与 D04/D08/D09 原始决定保留，由 03 说明 D18 对旧布局的替代。§5 合同未改。
- `dev/test-core.cmd` 现在依次运行 core 与 UI 两套检查，失败返回非零。源码、HTML 模板及 LICENSE 固定 LF，cmd 保留 CRLF，避免迁移后 Git 重新检出使 UI 换行检查失败。
- `.gitignore` 原本已有 `docs/*.png`，本卡确认两张截图均被忽略，当前索引与全部分支历史均未跟踪；未打开截图内容。反馈 txt 已在 `docs/feedback/`，无需重复搬动。I023 标记本卡处理完毕，T47 仍需发布前复查。

## 改动文件

- 整个旧 `extension/` → 仓库根对应文件与目录；`LICENSE`、`.gitattributes`。
- `dev/start-dev-st.mjs`、新增 `dev/junction.mjs`、`dev/install.test.mjs`、`dev/selftest.mjs`、`dev/test-core.cmd`、`dev/audit-readonly.mjs`；其余开发源文件只加版权头。
- `install/junction.mjs`、`install/run-junction.mjs` 和安装 README；安装/卸载 cmd 的调用协议不变。
- `AGENTS.md`、`CLAUDE.md`、根及各模块 README、`docs/00_README_FOR_AI.md`、`03_TECH_SPEC.md`、`04_TASKS.md`、`06_ISSUES.md`、`LICENSES.md`、`SETUP_WINDOWS.md`、`M3_验收清单.md`、交接模板、旧开工提示中的可执行路径。

## 自动验证

| 检查 | 结果 |
|---|---|
| `node dev/selftest.mjs` | 91/91；含旧/新安装联接、开发联接迁移与拒绝未知目标的内存替身回归；无测试网络请求 |
| `node src/ui/ui.test.js` | 27/27；含所有 UI 模块解析、D02、换行检查 |
| `dev\test-core.cmd --no-pause` | 实际运行两套检查，均通过，退出码 0 |
| `node dev/start-dev-st.mjs --prepare-only` | 仅 `.dev` 旧联接成功迁到仓库根；再次启动复用新联接 |
| 开发服务实际启动 + HTTP 静态资源核对 | 服务固定 `.dev/data`、8100；46/46 个 manifest、JS、CSS、模板与 vendor 资源均 HTTP 200，字节与仓库一致 |
| 版权与第三方内容检查 | 60/60 首行正确；vendor 字节不变；完整 LICENSE 34,523 字节 |
| `git diff --check` | 无空白错误 |
| 切换分支后复核 | 首次发现 Windows 自动将 HTML 模板改为 CRLF，补齐 HTML/LICENSE 的 LF 规则后重验；不放宽 UI 检查 |

本卡没有重跑整套浏览器交互/PNG/性能测试；上述 HTTP 检查证明新联接路径能提供全部扩展资源，不冒充浏览器交互验收。开发服务已停止，本次创建的 `.tmp/stcr-runtime-EL2bc3` 已清理，其他任务原有临时目录未动。

## 人类验收步骤（完全不需要读代码）

### 先看自动检查

1. 打开资源管理器，在顶部地址栏粘贴 **E:\st-reader\dev**，按回车。
2. 双击 **test-core.cmd**。不必先启动 ST。最后应看到两次“全部通过”：**91 项**和 **27 项**，再看到“检查完成，请继续浏览器验收”。按任意键关闭。
3. 双击 **start-dev-st.cmd**，等黑窗口显示 **listening**。浏览器打开 **http://localhost:8100**，按 **Ctrl+F5**。
4. 点顶栏**积木图标 → 管理扩展**，找到 **阅读器 (ST Reader) 0.1.0**。打开 **雾岚（虚构）**，点顶栏**书本图标**；应有正常样式，聊天抽屉和阅读设置仍可打开。按 **Esc** 退出。
5. 开发验收结束后，到该开发黑窗口按 **Ctrl+C**；若询问终止批处理，输入 **Y** 回车。

### 真实 ST 必须先 unlink，再 link（由你操作）

1. 关闭你平常使用的真实 ST 网页和启动黑窗口。
2. 资源管理器地址栏粘贴 **E:\st-reader\install**，回车。
3. **先双击 `unlink-from-my-st.cmd`**。应显示“已移除联接”或“联接不存在，无需卸载”，且 **Exit code: 0**。按任意键关闭。
4. **再双击 `link-to-my-st.cmd`**。检查“扩展位置”为 **E:\st-reader**（末尾没有 extension），随后应显示“目录联接已建立”和 **Exit code: 0**。按任意键关闭。
5. 按平常方法启动真实 ST，打开你平常的网址（本步骤不是开发实例的 8100）。按 **Ctrl+F5**，在扩展面板确认 **阅读器 (ST Reader) 0.1.0**。
6. 先记下 ST 当前角色、聊天和候选编号。点书本打开阅读器，检查正文样式、打开聊天抽屉、在阅读器内查看其他候选；按 **Esc** 退出。ST 当前角色、聊天和原候选应不变，刷新后仍一致。

任何安装步骤看到 **FAILED** 或非零退出码，停止后复制完整提示，不要手工删除真实 ST 文件夹。更详细图标与错误说明见 `docs/SETUP_WINDOWS.md` §3.1。卸载脚本只移除联接，不删除 E 盘项目、聊天或浏览器批注。

## 只读自查（grep 原始结果）

以下在仓库根执行，范围为迁移后的扩展运行文件；`--no-ignore` 避免个人 rg 忽略规则漏扫。

```powershell
rg --no-ignore -n '/api/chats/(save|rename|delete|import|group/(save|delete|import))\b' index.js src style.css vendor
```

结果**不是空**：仅 `src/core/readonlyGuard.js:4–10` 的七条禁用路径字符串，分别为 save、rename、delete、import、group/save、group/delete、group/import；它们是原有拦截名单，不是请求调用。

```powershell
rg --no-ignore -n '\b(saveChat|deleteMessage|deleteLastMessage|renameChat|clearChat|addOneMessage|updateChatMetadata|saveMetadata)\s*\(' index.js src style.css vendor
rg --no-ignore -n '(swipe_id|chatMetadata|chat_metadata)\s*(=(?!=)|\+=|\?\?=)|getContext\(\)\.chat.*(=(?!=)|\.push\(|\.splice\()' --pcre2 index.js src style.css vendor
```

以上两项均 **0 命中**（rg 无匹配退出码 1 是正常结果）。`node dev/audit-readonly.mjs` 通过：禁用路径 7 行（仅防护名单）、禁用调用 0、宿主状态赋值 0；运行文件含 LICENSE **不到 0.7 MiB**，小于 3 MiB。网络字符串 34 行为现有只读取数、命名空间、拒绝/测试用例、vendor 通用能力及新增 manifest 的 homePage 元数据；本卡没有新增运行时请求。

```powershell
git ls-files -- 'docs/*.png' .dev .tmp
git log --all --oneline -- 'docs/*.png'
git check-ignore -v -- 'docs/渲染效果1.png' 'docs/渲染效果2.png'
```

前两项为空；第三项两张都命中 `.gitignore:7:docs/*.png`。只核对名称和 Git 状态，未读取图片内容。

- 本任务是否读、列、复制、写 `F:\Claude\xinllm\SillyTavern\data`：**否**。
- 是否运行 `install/` 安装/卸载入口：**否**，只做内存替身测试。
- 开发数据根始终为 **E:\st-reader\.dev\data**。无 npm install、node_modules、全局工具安装或大文件下载；唯一下载为 34,523 字节的官方许可，写入 E 盘。未推送 GitHub。

## 已知问题 / 没做的

- T41、T44a、T46 尚未开工，等待人类回复“继续”。发布 README/CHANGELOG/推送指南属于 T46。
- I020 性能定量遗留、I021 待接线保持原状态，不在本卡修改。
- 真实 ST 旧联接需要由人类按以上顺序重建，AI 未代执行。

## 给下一个人的话

- Opus 可从已快进的本地 `main` 新建自己的任务分支。源码位于 `src/ui/`，样式位于 `style.css`，入口位于 `index.js`；不要继续在旧 `extension/` 下写文件。未推远程，无需为了本机拿到 T40 去 GitHub pull。
- `../core/*.js` 相对导入、ST 模板路径、§5 签名均未变；T41 合同仍需等下一封交接后接入。
- 请保留首行版权注释，第三方 vendor 不加本项目头。不要把 `docs/*.png` 强行加入 Git。
