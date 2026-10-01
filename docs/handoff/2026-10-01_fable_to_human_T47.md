# T47 交接：发布前复查——通过，main 已整合，可以按发布指南推送

复查对象：分支 `task/T46-release-docs` 提交 `f791895`（含 T40–T46 与 I032–I034 全部交付）。复查后由规划者把 `main` 快进到本信所在提交；**发布提交编号见 `git log -1 --oneline`，发布指南第 2 节要核对的就是它。**

## 结论一句话
只读铁律、网络边界、许可、隐私、自测全部通过；README 的披露与代码实际行为一致。可以发布 0.1.0。

## 复查项与结果
| 项 | 方法 | 结果 |
|---|---|---|
| D02 写聊天接口 | grep `/api/chats/(save|rename|delete|import|group/…)` 于 `index.js src style.css` | 只在 `readonlyGuard.js` 拒绝名单与 `htmlSnapshot.test.js` 拒绝样本出现，**无调用** |
| D02 禁用方法与赋值 | grep `saveChat / deleteMessage / … / writeExtensionField(`，`swipe_id / chatMetadata` 赋值，`chat.push/splice` | **全空** |
| 实际用到的 `/api` | 枚举字符串 | `characters/get·chats·all`、`groups/all`、`chats/get·group/get·search·recent`，全只读 |
| 自有出站请求 | grep `fetch/XMLHttpRequest/sendBeacon/WebSocket`，硬编码 `http(s)://` | 只有 `chatSource.js` 同源 fetch 与开发自测；无固定第三方域名。`dev/audit-readonly.mjs` 静态边界通过 |
| HTML 沙箱 | 读 `htmlRenderer.js` | 交互 iframe 两层均 `sandbox="allow-scripts"`（无 `allow-same-origin`，不透明源）；CSP `default-src 'none'`，联网时只放 `https:`；`frame-src/object-src/base-uri/form-action` 全封；`referrer no-referrer`；高度与快照走带随机 token 的 postMessage。静态导出帧 `allow-same-origin` 但先剥 `script/iframe/object/meta/on*/srcdoc/action…` 再渲染，且拒绝 `javascript:`、带凭据 URL、编码后的禁写接口 |
| 残余风险（可接受，已在 README 披露） | 分析 | 允许外链时用户 HTML 内脚本可向任意 HTTPS 域发请求；因不透明源无 ST cookie / CSRF 头，无法写宿主。关闭外链后 `connect-src 'none'` |
| README 披露 vs 实现 | grep UI 文案 | "允许外链 / 更多设置 / 复制脱敏版 / 脱敏显示 / 带上外链素材 / /reader" 均存在于 `src/ui` |
| 自测 | `node dev/selftest.mjs`、`node src/ui/ui.test.js`、`node --check` 全部 js/mjs | **119/119、30/30、0 语法错误** |
| 许可 | LICENSE 为 AGPL-3.0 全文；所有 `index.js src/** style.css` 文件头含 AGPL 行；vendor 保留 MIT；`LICENSES.md` 登记齐全 | 通过 |
| manifest | `version 0.1.0`、`homePage` 指向 `liangsheng-sys/st-reader`、`auto_update true`、`minimum_client_version 1.13.0` | 通过 |
| 隐私 | `git ls-files` 与全历史：`.dev/ .tmp/ docs/*.png` **无记录**；全库 grep Windows 用户名、代理端口、账号被封等字样 **为空**；截图里的真实聊天句子 grep 为空 | 通过 |
| 体积 | 运行文件 924 KB（含 124 KB 测试文件） | < 3 MB |
| 复制代码 | grep 四个参考项目的类名 / 标识 | 为空；README"思路参考，未复制代码"属实 |
| 分支 | `main` 是 HEAD 祖先，可快进 | 已快进 |

## 不阻塞发布的小事（记入 06）
- 文档与 `dev/`、`install/` 脚本里写死了你本机路径 `F:/Claude/xinllm/SillyTavern`。只是文件夹名，不含用户名；公开后别人能看到你把 ST 装在哪个盘。接受即可，想隐去让 astra 改成读环境变量（I035）。
- `src/ui/htmlShot.js` 第 3 行注释仍写"截图始终断网"，实现已按 D23 允许素材（I031）。Opus 下次顺手改。
- I020（50 MB 首开偶尔超 3 秒）如实写在 README"当前边界"，不隐瞒。

## 人类现在做的
1. 打开 `docs\发布指南.md`，从第 0 节开始照做。第 2 节核对提交编号时，用 `git log -1 --oneline` 看到的就是发布提交。
2. 推送成功后按第 6、7 节发 Release、用 URL 在 ST 里重新安装验证，再按第 8 节模板发帖。
3. 帖子链接记到 `07_FEEDBACK.md`（T48）。
