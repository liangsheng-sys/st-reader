# T100 交接：跟随酒馆时保留对白的字幕条底色

## 做了什么

阅读器现在会保留 `background: var(--xy-sub-bg)` 这样的主题声明。它先看该变量在各套选择器和条件里的所有定义，也检查间接引用和回退值。只要有一种取值可能访问外站或同源 API，就跳过整条资源声明。通过时保留变量名，主题当场改色，字幕条就跟着变。

Chrome 会把带变量的 `background` 简写拆成读出来为空的分项。本次复用 T73 在 `cssDeclarations.js` 里的简写查找函数取回资源简写，再做上述检查。测试的对白规则和两个色值均为合成样例。

## 改动文件

- `src/core/cssScope.js` 收集定义，校验变量和地址，按原优先级克隆。
- `src/core/cssDeclarations.js` 导出现有的简写查找函数 `shorthandOf`，供克隆器复用。
- `src/core/persistence.test.js` 增加六组 Node 回归，已接入原有 `dev/selftest.mjs`。包括定义在后面的样式表、安全和恶意定义并存、两层引用、四层与五层边界、循环、缺定义、外链回退、行内变量与计算值。
- `src/core/coreBrowser.test.js` 在现有 `window.stcrSelfTest()` 内打开真实阅读器。把规则临时插到 8100 的 `#custom-style`，对比两处对白的计算底色，再改色比一次。结束时删除测试节点和规则、还原主题并关闭阅读器。
- `docs/03_TECH_SPEC.md` §5.7 增补放行条件，`docs/06_ISSUES.md` I063 记录实测，`docs/04_TASKS.md` 的 T100 转待验收。

## 人类验收步骤

1. 在加载了 T100 的真实 ST 按 **Ctrl+F5**。打开酒馆的外观设置，选 **絮语**，打开一段带对白的聊天。在酒馆里先认准一句有反色字幕条的对白。
2. 点书本图标打开阅读器，读同一个聊天，点 **Aa → 显示 → 主题 → 跟随酒馆**。
3. 找到刚才那句对白。字后面应有和酒馆同色的圆角底条。也可以各看一句用户和角色的对白，对照两边各自的配色。

**如果真实 ST 仍用已发布的 0.4.0**，刷新只会加载旧文件。可用 Chrome 或 Edge 的本地替换预览两个引擎文件，适用于 URL 安装和目录联接安装：

1. 在文件资源管理器地址栏粘贴 `E:\st-reader\.tmp\wt-astra\src\core`。右键 `cssDeclarations.js` → **打开方式 → 记事本**，按 **Ctrl+A、Ctrl+C** 复制全文。
2. 在真实 ST 页面按 **F12**，选 **网络 / Network**，刷新一次，在过滤框键入 `cssDeclarations.js`。右键阅读器那一行 → **替换内容 / Override content**。首次使用时按提示在 **E 盘**选一个专供本次验收的空文件夹并点**允许**。
3. 点一下打开的代码区域，按 **Ctrl+A、Ctrl+V、Ctrl+S**。回到第一步，对另一个文件 `cssScope.js` 重复同样的复制、替换和保存。两个文件都保存后，保持 F12 面板打开，刷新并按上面三步验收。
4. 验收后在 **源代码 / Sources → 替换 / Overrides** 里移除刚才的文件夹，再刷新。此方法只在这个浏览器临时载入 T100。

## 实测

- `node dev/selftest.mjs` 224 项、`node src/ui/ui.test.js` 46 项通过。
- 最终 `dev/test-release.cmd` 退出码 0，输出 `T57 OK`。完整浏览器自测 330 项、界面主题回归 101 项通过，禁用或外网请求 0 次，宿主快照一致。21 MB 聊天三次缓存首屏分别为 198.5、100.1、101.1 ms。该轮仅将独立测试 Chrome 的进程优先级临时调到 Above normal。发布脚本和 300 ms 门槛均为仓库原版，该轮 Chrome 目录一次删除成功。
- 8100 的宿主对白与阅读器对白底色均为 `rgb(34, 34, 34)`；只把变量改成 `rgb(56, 78, 90)`，两处都随即显示新色。
- 在同一张 8100 页面交替测六次样式收集，初版中位数约 52 ms。改用按下标遍历 CSS 声明、跳过无目标 ID 且无转义的选择器、只还原资源简写后，复测 main 中位数 20.6 ms、T100 中位数 23.4 ms。含转义的选择器继续走原解析。
- 发布回归期间，8100 的开发联接临时指向本卡工作树，并通过 HTTP 比对了实际提供的 `cssScope.js` 与工作树源码。每次运行前都复制 `settings.json`、3 份阅读器备份和已有的设置轮替备份；浏览器退出、开发实例停止后复制还原并比对 SHA-256。

## 只读自查

- `rg --no-ignore -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src vendor style.css` 命中 8 行。`readonlyGuard.js` 第 4–10 行是 7 条禁用路径，`htmlSnapshot.test.js` 第 12 行是拒绝地址的测试输入。
- `node dev/audit-readonly.mjs` 通过，扩展禁用方法调用 0 行、宿主赋值 0 行。`readonlyGuard.js` 和 `dev/audit-readonly.mjs` 与 main 相同。
- 本任务是否读写过 `F:\Claude\xinllm\SillyTavern\data`：否。

## 已知问题 / 没做的

真实絮语主题的外观留给人类验收。本卡的浏览器证据来自 8100 的合成规则。早期发布回归出现过临时 Chrome 目录删除失败（EPERM）、21 MB 缓存首屏超过 300 ms、I032 截图没有取到下半部颜色，以及一次楼层胶囊上下楼的 100 ms 定时检查失配。缓存与截图的抖动在 T81 交接中也有记录。重跑保留原断言和门槛，临时启动环境对 Windows 仍锁定的本轮浏览器目录增加删除重试。

## 给下一个人的话

T100 分支为 `task/T100-css-var`。原工作区有未跟踪的反馈文件，本卡在独立工作树完成。等人类说「继续」后接 T101。
