# I032 交接：快照方案回复与全项目遗留复核

## 做了什么

已在 [06 I032](../06_ISSUES.md#i032--astra-回复-opus2026-10-01) 回复 Opus。只读当前 DOM 快照可做，但不能把 `outerHTML` 原样塞回截图就算完成：消息请求生命周期、克隆表单状态的脱敏、滚动还原、已脱敏文本避免二次串换、canvas 等不支持项都要一起明确。`createSandbox.snapshot()` **尚未实现，也未加入 §5 合同**。外链素材内嵌需另作决定，现行 D22 的静态导出断网规则不变。

复核以 Opus 已整合全部功能的 `task/T44b-html-ui` / `94c799b` 为基线，在根目录新建 `task/I032-status-review`。未改 Opus 工作树、产品代码、main、安装脚本或发布材料，未推送 GitHub。旧根分支的任务板没有最新 UI 状态，不能据它误判 T42/T43/T45/T44b 未完成。

这次是审查与文档校正，不是新功能卡，也不代替 Fable 的 T47。T46 继续等待人类明确指令。

## 还剩什么（除 T46）

| 优先级 / 类别 | 事项 | 当前结论与下一步 |
|---|---|---|
| 发布前优先修 | **I033：脱敏失败回退原文** | 已动态复现。`htmlBlocks.start` 的 prepare 抛错后仍把原 HTML 送入沙箱；实际可见合成秘密文字。由 Opus 改为失败时停止渲染原文，并处理开启脱敏失败时旧原文沙箱的去留；补 UI 集成回归。不是只有日志文案错误 |
| 发布前补强 | **I034：复制 HTML 片段的二次解析** | `maskedCodeText` 在安全解析后又使用宿主 DOMParser，没有禁网隔离保证。本轮 Chrome 152 的 img/iframe 探针外链请求与资源条目均为 0，**未复现外传**；按 §5.12 应把片段序列化也放在隔离环境，astra 与 Opus 协作补齐 |
| 原验收定量遗留 | **I020 / T30：大文件性能波动** | 本轮 50 MB 打开 1894 / 3427 / 1342 ms，第二次超过 3 s；预取、翻屏、内存与宿主快照通过。不能把人类“肉眼流畅”或单轮预取达标当成全部定量通过 |
| 接口归位 | **I030：角色元数据 / 标签 / 排序 core 接口** | 仍未实现提议的新接口。T43 的只读 `src/ui/ownerMeta.js` 已满足当前功能并经人类验收；属于架构遗留，不重复要求人类验收整张 T43。后续接到 core 时更新 §5，再让 Opus 替换适配层 |
| 后续增强 / 待决定 | **I032：当前游戏进度快照、外链素材** | 本次完成评估。现有 T44b 已按人类提供的替代选项做长图；不能把未做 snapshot 直接等同于整卡失败。主动下载并内嵌外链素材不在当前 D22 内 |
| 补充人工回看 | **T44b 的 94c799b 补丁** | T44b 已记人类通过；“设置搬进截图窗口 + 长图”是在该意见后补交，07 中没有补丁后的独立人工确认记录。建议按本信下方第 5 步回看，不撤销原验收结论 |
| 发布收尾 | **main 汇总、T47、T48** | main 仍在 T40 的 `6d42a01`；本次基线比 main 多 14 个提交。功能已在整合分支，发布前需把最终认可的提交汇入 main，Fable 做含新 HTML 沙箱的 T47；T48 的首次 GitHub 推送、URL 重装、Release / 社区发布仍由人类做。现在没有替人类执行任何一步 |
| 历史管理记录 | **T02 仍显示待开始** | 团队已实际协作，不是缺一个产品功能；本次未替人类重新启动两套 CLI 检查输入框，因此未擅自勾通过 |

I034 的依据是 [MDN DOMParser 文档](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString) 对惰性解析仍可能加载 img/iframe 的说明，以及项目已采用的隔离解析合同；本次浏览器无请求的事实不能推广为所有环境都受强制禁网保护。

## 已完成但旧文档没跟上的项

- I019 的整名保护提示、I021 的独立开关、I026 的 1:1 像素测量接线已由 T42 完成并经人类验收；本次核对代码和 T42 实测记录，补齐问题表、技术说明和旧验收清单的状态。
- T01 / I001：只读取卷容量，F 约 37.17 GiB、E 约 6.84 GiB，满足门槛。C 约 11.95 GiB。**容量改善不解除禁止写 C/F 的规则**；没有进入 F 盘真实数据目录。
- 01 / 03 的旧“默认断网、每次确认”已按 D22 校正：UI 阅读默认允许 HTTPS，Aa 与逐块按钮可关，core 缺省仍为 false，截图仍断网。没有改决定或放宽沙箱。
- 01 的独立截图入口与遮盖字高描述按人类已接受的 T44b/T42 行为同步。历史交接中的当时数据保持原样，不能把历史数量当作最新测试数量。
- I003、I004、I005 等早期核心事项已对照现有实现与测试；其中 I005 的定量遗留归 I020。未找到另一张尚未交付的 T40–T45 功能卡。

## 验证结果与范围

| 检查 | 本轮结果 |
|---|---|
| `node dev/selftest.mjs` | **116/116** |
| `node src/ui/ui.test.js` | **30/30** |
| 开发实例完整 `window.stcrSelfTest()` | **156/156**；独立 Chrome 152 配置、已有合成 Ny 字体，只用 8100 / `.dev/data` |
| 53.39 MiB / 4000 楼性能 | **未全绿**：打开 1894/3427/1342 ms；翻屏 P95 78 ms、最慢 85 ms；预取最慢 245 ms；最多 120 楼；关闭后约回收 97.7% 增量堆；宿主快照不变 |
| I033 故障探针 | prepare 主动抛错 1 次；运行中的合成沙箱仍回报可见文本 `合成秘密I033`；宿主 chat / metadata / extensionSettings 不变；临时界面最终清理 |
| I034 双阶段探针 | 安全解析保留资源属性；再用宿主 DOMParser 取片段；两个阶段外链请求拦截数和资源条目均为 0。没有模拟真实用户剪贴板操作，因此不是“实际复制按钮全链路已覆盖”的证明 |
| 浏览器请求防护 | 主页面与跨进程子框架递归拦截；非本地 HTTP(S) 与 D02 禁写聊天接口一律在发送前阻止。正常测试及两项探针均 **0 次命中**。宿主启动会在隔离 `.dev` 保存自身设置，不是扩展调用聊天写接口 |
| 静态审计 | `node dev/audit-readonly.mjs` 通过；80 个自有 JS/MJS 语法检查通过；81 个自有 JS/MJS/CSS 许可头齐全 |
| 私密材料与体积 | 跟踪的 `.dev`、`.tmp`、`docs/*.png` 为 **0**；未打开截图。扩展运行文件含 LICENSE 合计 873,262 字节。不是对仓库所有文本无隐私内容的正式发布证明，T47 仍需复查 |

性能报告：`.dev/fixtures/i032-performance-result.json` 与同前缀时间戳报告；探针报告：`.dev/fixtures/i032-review-probes.json`。均为本地忽略的合成数据报告，关键数据已在本信保留。测试驱动和浏览器配置只在 `.tmp`，结束后清理本次自建文件；未删除 Opus 的工作树、8101 实例或前人临时文件。本次启动的 8100 已停止。

## 人类验收步骤（不用读代码）

1. 打开 `E:\st-reader\docs\06_ISSUES.md`，找到 **I032 · astra 回复 Opus**：应能看到“可以做、尚未实现”的结论；本信“还剩什么”表是本次交付的遗留清单。
2. 在资源管理器双击 `E:\st-reader\dev\test-core.cmd`。应看到 Node **116**、UI **30** 项通过；按提示关闭黑窗口。这一步不会安装依赖。
3. 双击 `E:\st-reader\dev\start-dev-st.cmd`，浏览器打开 **http://localhost:8100**，按 **Ctrl+F5**。只用这个合成开发实例，不打开真实 ST，不运行 install 里的脚本。
4. 可选复核 I033：在上述页面按 **F12**，切到“控制台 / Console”，整段复制下面代码后回车。会短暂出现一块合成界面，随后消失。**当前预期是表格显示 `rawTextRendered: 合成秘密I033`、`hostUnchanged: true`**，表示问题被复现，而不是已经修好。红色“合成故障”日志是故意注入的。修好后原文不得出现，且临时节点、消息监听仍应清理。此探针不修改屏蔽词或替换规则，不依赖 Ny 字体。

```js
await (async () => {
    const { createHtmlManager } = await import('/scripts/extensions/third-party/st-reader/src/ui/htmlBlocks.js');
    const host = SillyTavern.getContext();
    const before = JSON.stringify([host.chat, host.chatMetadata, host.extensionSettings]);
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;left:0;top:0;width:500px;height:600px;overflow:auto;z-index:2147483647;background:white';
    const chat = document.createElement('div'), textEl = document.createElement('div');
    wrapper.append(chat); chat.append(textEl); document.body.append(wrapper);
    const marker = `i032-privacy-${Date.now()}`;
    let received = null, calls = 0;
    const onMessage = e => { if (e.data?.reviewProbe === marker) received = e.data.text; };
    window.addEventListener('message', onMessage);
    const manager = createHtmlManager({ scroller: wrapper, chat,
        defaults: () => ({ mode: 'render', width: 390, network: false }),
        rememberWidth: () => {}, isPaged: () => false, toast: () => {},
        prepare: async () => { calls++; throw new Error('合成故障：脱敏失败'); } });
    try {
        const html = `<body><p id="probe">合成秘密I033</p><script>parent.parent.postMessage({reviewProbe:${JSON.stringify(marker)},text:document.getElementById('probe').textContent},'*')</script></body>`;
        manager.attach(textEl, [{ kind: 'raw', html, pre: null }], { index: 0, swipe: 0, floorName: '合成探针' });
        for (let i = 0; i < 100 && received === null; i++) await new Promise(r => setTimeout(r, 50));
        console.table({ prepareFailures: calls, rawTextRendered: received,
            hostUnchanged: before === JSON.stringify([host.chat, host.chatMetadata, host.extensionSettings]) });
    } finally { manager.destroy(); wrapper.remove(); window.removeEventListener('message', onMessage); }
})();
```

5. 若要补看 Opus 的 T44b 最新意见补丁：在 8100 选 **纸舟（虚构）**，打开 **STCR-02** 聊天的阅读器，找到手机聊天 HTML，点它旁边的 **📷**。应能在截图窗口管理规则和屏蔽词；“长图”开启时六条消息都在，关闭时恢复固定高度。关掉窗口后临时遮住的词不保存。这里沿用当前开发实例，不需要启动旧 8101 副本。
6. 做完关闭本次界面，在 8100 黑窗口按 **Ctrl+C**，若询问是否终止，输入 **Y** 回车。无需推送、安装或发布。

## 只读自查（grep 与审计）

在资源管理器打开 `E:\st-reader`，地址栏输入 `powershell` 后回车，逐行粘贴：

```powershell
rg --no-ignore -n 'chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(' index.js src vendor style.css
node dev/audit-readonly.mjs
git ls-files .dev .tmp 'docs/*.png'
```

- grep **不是空结果**：仅 7 条，在 `src/core/readonlyGuard.js:4–10`，依次为 save、rename、delete、import、group/save、group/delete、group/import 的拒绝名单；没有执行这些接口。
- 分类审计：运行文件禁写路径 7 条（上述拒绝名单），禁写函数调用 **0**，宿主 chat / metadata / swipe 赋值 **0**；网络文本命中 40 行，包含命名空间、自测、只读请求和 vendor 通用实现，不能把字符串数直接当实际请求数。运行浏览器审计与静态导出禁网测试一起通过。
- `git ls-files` 上述私密/临时目录应无输出。两张含真实聊天的截图未被跟踪，也没有读取图片内容。
- 本次改动仅文档；没有调用禁写聊天 API/方法或赋值宿主聊天。没有读、列、复制或写 `F:\Claude\xinllm\SillyTavern\data`。没有运行安装脚本、安装依赖、下载大文件、写 C/F 盘或推送 GitHub。

## 改动文件

- `docs/06_ISSUES.md`：回复 I032；新增 I033/I034；补 I020 复测；校正已关闭事项。
- `docs/04_TASKS.md`：T01 容量实证、T30/I021、T41/I026 状态。
- `docs/01_REQUIREMENTS.md`、`docs/03_TECH_SPEC.md`：同步已拍板 D22 及已交付 UI 行为；未新增合同签名。
- `docs/M3_验收清单.md`、`dev/README.md`：旧状态与当前测试数量。
- 本交接信。

## 给下一个人的话

Opus 先看 I033：故障时原文回退会让已打开的脱敏开关失去意义；修复时覆盖首次打开、切换开关、重新排版三条路径。I034 由 core 提供禁网片段输出更合适，协作前登记最终签名。I032 的回复是方案评估，切勿先调用不存在的 snapshot。

接任务继续逐卡分支、逐卡交接。此次没有启动 T46，也没有代替人类批准快照/外链内嵌。T47 请在最后实现与披露确定后复查；main 汇总时确认包含 Opus 的 `94c799b` 和后续修复，不能只合旧 T44a 分支。Opus 工作树如不切分支，可先用 `git show task/I032-status-review:docs/06_ISSUES.md` 阅读本次答复。
