# I041 交接：纸月网页高度不再反复跳动，展开和收起仍可改变高度

## 做了什么
- 核对 Opus 的 `task/T52-width`，本次 I041 是交互 HTML 高度抖动，不是聊天缓存。两分支曾撞号：T53 的缓存合同条目已统一改为 I042，连同人类 10 月 2 日自测结果提交到 T53 分支 `c70eb1d`；其 300 ms 阻塞 I040 仍 open。
- 从 main `731c7d2` 创建独立 `task/I041-sandbox-height`。不合并未验收的 T53/T52，不修改 `src/ui/`，不开始 T54a。
- 在原代码复现：768/1200 排版宽度下，高度反复在 1077 / 1069 px 间切换；390 下为 1493 / 1486 px。根盒实际高 1076.96875 px，折叠后的首末外边距各 12 px，body 的计算 margin 却各为 8 px。旧代码一轮取整个滚动范围，下一轮不溢出时切回 body 高度加计算 margin，形成循环。
- 现在统一使用根盒与 body 的实际文档边界，向上取整；额外滚动范围只用于发现需补测的脱离文档流内容，不把当前 iframe 高度当内容下限。固定定位与内部滚动/裁切区的后代不撑大页面。内容收起后仍可缩短，不靠“只增不减”掩盖循环。
- 没有追加 `overflow:hidden` 隐藏问题，没有改用户 HTML 样式、透明背景、CSP、source/token 校验或沙箱权限；`createSandbox`、`onHeight`、高度消息字段保持不变。

## 改动文件
- `src/core/htmlRenderer.js`：修复量高。
- 新增 `src/core/htmlHeightBrowser.test.js`，接入 `htmlRendererBrowser.test.js` 与 `index.js`：真实沙箱回归与控制台入口。
- `dev/test-performance.mjs`、新增 `dev/test-html-height.cmd`：沿用本机浏览器驱动，增加 I041 双视口自测；保留 T30 默认模式，不安装依赖。
- `dev/README.md`、`docs/03_TECH_SPEC.md` §5.13、`04_TASKS.md`、`06_ISSUES.md`、`07_FEEDBACK.md` 与本信：合同、状态、分支编号协调、人类步骤。

## 人类验收步骤（不会代码也可操作）
1. 在资源管理器打开 **E:\st-reader\dev**，双击 **test-core.cmd**。应看到 Node **126 项通过**、UI **30 项通过**。这里是从 main 开出的 I041 分支，尚未合入 T53，所以不是 T53 的 142 项。
2. 双击同目录 **start-dev-st.cmd**，保持黑窗口打开，等出现 8100 网址。若提示端口占用，先停止之前的 8100 开发窗口再启动；不用动真实酒馆或 Opus 的 8101。
3. 双击 **test-html-height.cmd**。它自动用已有浏览器验证 1366 / 1024 两种窗口宽度，以及手机/平板/桌面三种网页排版宽度。等测试结束，应显示 **浏览器完整自测通过：187 项**、`passed: true`、`blocked: []` 和 **I041 OK**。不要在自动测试期间操作它的页面。
4. 想亲眼看效果：打开 **http://localhost:8100**，按 **Ctrl+Shift+R** 刷新。按 **F12** → **Console / 控制台**，粘贴一行并回车：

   ```js
   await stcrSelfTest({core:false,htmlHeight:true}); await stcrHtmlBoundaryDemo();
   ```

   先显示 **18 项全部通过**，然后出现“裸 HTML 边界验收”窗口。等待几秒，滚到纸月网页底部：尾声的位置应稳定，不应被网页高度来回推移或反复闪出细边；点“同楼两段 HTML”可再看两张独立网页。
5. 点“关闭验收窗口”。最后在本次 8100 黑窗口按 **Ctrl+C** 停服。把结果告诉我即可；本轮停在 I041，不领取 T54a。

这份分支验的是 core。Opus 的 T52 界面在另一分支：合并本修复后，他的正式阅读器会使用同一个修好的量高函数，无需另加同源权限或修改回调签名。

## 可执行验证与结果
- Node `node dev/selftest.mjs`：126/126，合成聊天 SHA-256 校验仍通过。
- UI `node src/ui/ui.test.js`：30/30；没有改 UI。
- I041 专项：13 项保护 + 5 项浏览器回归；检查三种宽度、断网/允许外链、折叠外边距、动态增减高度、绝对定位溢出、内部滚动区、重建与 0.81 倍外层缩放、宿主不变与节点清理。
- 修复后的纸月高度：390 → 1494 px，768 / 1200 → 1077 px；每个稳定案例只有一次高度上报，观测期间没有根滚动溢出。
- 动态交互：792 → 212 → 942 px；重建短页并改变排版宽后稳定为 210 px。限高 120 px 的内部滚动区仍是 120 px，不被其 900 px 内容撑开。
- 初轮发现绝对定位内容不撑开根盒，已补其实际边界回归；另一次 1024 视口调整后定时器节流，观测样本不足。测试现等待至少 1.3 秒且至少 3 个真实样本，最多等待 6.5 秒；动态变化由测试逐步通知合成内容，不与节流定时器竞速。失败报告保留，不计为通过。
- 最终两种视口专项均 18/18，完整浏览器 187/187；12 个纸月场景每个观测 21–23 个稳定样本、均只上报 1 次高度。报告时间 2026-10-02T01:00:03.472Z，passed:true、blocked:[]。最终双视口与完整回归结果保存在 `.dev/fixtures/i041-performance-result.json` 及带时间戳副本（不入库）；输出仅含合成几何量、计数、请求路径，无聊天正文。

## 只读自查

```text
rg --no-ignore -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src vendor style.css
node dev/audit-readonly.mjs
```

grep 非空，仍只有 8 行既有防护/反例，无实际调用：
- `readonlyGuard.js:4` chats/save；`:5` chats/rename；`:6` chats/delete；`:7` chats/import。
- `readonlyGuard.js:8` chats/group/save；`:9` chats/group/delete；`:10` chats/group/import。上述七行都是禁用名单，未改。
- `htmlSnapshot.test.js:12` 是恶意 URL 拒绝样本，没有发送请求。

分类审计：扩展 forbiddenPaths 8、forbiddenCalls 0、hostWrites 0；`.dev/.tmp` 和反馈截图跟踪数 0。新增运行代码只读取沙箱自己的布局，测试命令仅由新建的合成内容响应；不读写宿主聊天、候选或元信息。浏览器驱动保留外网和 D02 拦截；ST 启动时对 `.dev` 的设置/快捷回复请求仍会出现在报告里，不是本修复写聊天。

未读、列、复制或写真实 ST 的 data；只运行固定 `.dev/data`、8100 的开发实例。未写 C/F、未安装依赖、未下载文件、未复制反馈截图内容。读取了用户明确提供的 C 盘文本附件，但没有写回附件目录。浏览器配置与探针只写本项目 `.tmp`，本轮结束清理；不动 Opus 工作树、8101 或其他已有临时文件。

## 给下一个人的话
- Opus：保留 T52 的 `onHeight` 与等比缩放接线即可。不要把 iframe 设置成只增不减，也不要加 `allow-same-origin`。本次 core 修复可以合并到 T52；I038 的混排和宽度工作仍以你的分支为准。
- I041 保留为这条高度问题；T53 缓存合同改名 I042，I040 保留性能阻塞。合并各分支时请保留三个独立条目。
- `dev/test-performance.mjs` 在 T53 和本分支均有新模式，合并时要同时保留 `--chat-cache` 与 `--html-height`；各自的报告前缀和临时目录不能混用。
- 本分支未包含 T53 缓存实现。人类提供的 T53 重开 1021.8 / 871.3 / 921.9 ms 仍未过 300 ms，不因 I041 修好就改记通过。
