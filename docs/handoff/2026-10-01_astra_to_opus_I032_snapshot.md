# I032 实施交接：截当前画面与默认外链素材

## 做了什么

分支 `task/I032-html-snapshot`，基于 Opus 的 `6e49465`（包含 I033/I034 修复）。本卡交付 core 接口、开发演示和验证，没有修改 `src/ui/`，T46 未开始，main 未移动，未推送。

人类本次要求已登记为 **D23**：截图默认带上用户 HTML 引用的外链素材。更新了 AGENTS / 00 / 01 / 03 的过期网络边界，不能再用历史 D22“截图始终断网”阻止接入。业务无自有第三方服务/遥测、D02 聊天只读、宿主隔离仍有效。

## Opus 可直接接的接口

```js
// handle 是 createSandbox 返回的那一个实例；捕获时不会重跑游戏。
const html = await handle.snapshot({ signal: controller.signal });
const blob = await exportRenderedHtml(html, {
    width: 390,
    scale: 2,
    maskWords,
    rules,
    // 阅读时已用规则脱敏：保留当前显示的替换，不再串换一遍。
    alreadyMasked: readerWasRedacted,
    onWarning: message => showScreenshotWarning(message),
    signal: controller.signal,
    // allowNetwork 缺省 true；仅主动关闭时传 false。
});
```

最终合同见 [03 §5.13](../03_TECH_SPEC.md)。可选 `timeoutMs` 缺省 10000，范围 1–30000；`snapshot()` 返回 **HTML 字符串**，不是 iframe、PNG 或可执行脚本对象。

- 内容文档 → 可信外壳 → 宿主逐跳核对 `source/token/requestId`，不增加 `allow-same-origin`；重建、销毁、超时、取消均拒绝待决请求并清理。上限 800 万字符、5 万元素，同时 8 个请求。
- 快照只读活文档，在脱离页面的克隆里保留当前结局、表单显示值、checked / details 状态、滚动位置、可读取 canvas / 视频画面、CSSOM 动态样式和动画当前值。表单文本再进入脱敏；密码/文件输入不带真实值。返回值仍须经过静态清洗，绝不直接挂到宿主。
- `renderStatic` / `exportRenderedHtml` **缺省 allowNetwork:true**。先在禁网解析环境清除脚本/事件，再用只读 GET 内嵌图片、CSS、字体；跨站按 CORS 且不带凭据，同源 ST 资源保留当前会话。最终 iframe 与截图器只用内嵌资源，不重新执行用户脚本或让截图器任意补请求。
- `renderStatic` 额外返回 `warnings:string[]`；`onWarning(message)` 在资源失败时逐项通知。单资源 5 MB、累计 20 MB、128 项、12 秒/请求；CSS 相对路径、普通 @import / 媒体条件与重复 URL 缓存已覆盖。CORS/网络/限额失败会提示并去掉对应资源，正文和其余素材继续导出。
- `allowNetwork:false` 仍可显式断网；这是主动选择，**不是默认值或必须确认的步骤**。旧 T14 文字卡导出管线没有被改成联网。

### 接线时必须同步的四处

1. `htmlBlocks.entryFor()` 给截图窗口传入当前 view 的 `snapshot` 调用入口。尚未渲染、已销毁或捕获失败时提示重试，不静默改截初始画面。
2. 截图窗口打开时取一次当前 HTML；同一张预览的清晰度、宽度与裁剪复用这份快照，避免游戏后续变化导致“选的是甲、导出却是乙”。切“初始画面”才换回原 HTML。
3. “截当前画面”默认先保留当前滚动位置；长图仍可作为另外的选择。**不要在捕获当前可视区域前默认展开滚动区**。现有 `unfoldScrollAreas` 若使用断网选项，要与最终 export 一起传递；默认可内嵌外链。
4. 更新截图窗口“外部素材不会出现 / 只截刚打开”的旧文案，并接 `onWarning`。若 `readerWasRedacted`，说明取自当前显示，替换设置不能承诺还原原词；追加屏蔽词仍可用。已脱敏模式不会重跑任何替换规则，也不会自动替换脚本后来新添的文本；需要遮住这些新文本时使用屏蔽词。普通未脱敏快照仍正常执行完整截图规则。

## 验证

| 检查 | 结果 |
|---|---|
| Node `dev/selftest.mjs` | **119/119**；包含资源地址解析、禁写/危险协议拒绝、两层快照注入边界 |
| UI `src/ui/ui.test.js` | **30/30**；本卡没有改 UI |
| 完整浏览器 `stcrSelfTest()` | **172/172** |
| 当前画面专项 | **29/29**（13 只读保护 + 3 纯逻辑 + 13 浏览器）；实际 PNG 包含不同游戏结局、表单屏蔽、滚动区蓝色下半段、canvas 像素；已脱敏内容不串换 |
| 生命周期与只读 | 错 source/token 无效；重建/销毁/超时/取消正确拒绝；超量和 Shadow DOM 明确拒绝；活 DOM MutationObserver 观察到 **0 次写入**；宿主 chat / metadata / extensionSettings 前后相同；无新增临时 iframe 残留 |
| 资源替身 | 外链 CSS 的相对图片 / @import、注释不发请求、字体实际 PNG 与相同 data 字体逐像素一致；CORS/限额失败降级、显式断网 0 次资源读取 |
| 原生 fetch / 浏览器 CORS | 通过 CDP 给虚构 HTTPS 域名提供本地合成 CSS、4×4 PNG 和已有 JetBrains Mono 字节，**没有真的连外网**。允许跨域时字体 loaded、图片 data 内嵌、PNG 像素 `[18,171,205,255]`；无 CORS 响应时警告 1 条并去除图片 |
| 交互演示 | 浏览器点击纸灯，结局为“纸影变成了飞鸟：星灯与你沿着晨光回家。”；默认当前画面、外链勾选，预览生成 **780×1398px、2 倍 PNG** |

开发 Chrome 152 的配置、缓存、临时驱动都在 E 盘 `.tmp`；只使用端口 8100 与 `.dev/data` 合成实例。未做 I020 性能优化，也不把本轮功能回归当作它已关闭。

滚动验证中先发现截图器未开启 `restoreScrollPosition`，已开启并用实际像素验证。另将合成用户滚动安排在 iframe 加载完成后，避免把解析阶段临时高度变化误当成用户最终滚动位置。

## 人类验收步骤（不用读代码）

1. 在资源管理器双击 **`E:\st-reader\dev\test-core.cmd`**，看到 **119 项**与 **30 项**全部通过，再按提示关闭窗口。
2. 双击 **`E:\st-reader\dev\start-dev-st.cmd`**；浏览器打开 **http://localhost:8100**，按 **Ctrl+F5**。只用合成开发实例；不运行 install 下的任何脚本。
3. 按 **F12**，点“控制台 / Console”，粘贴并回车：

   ```js
   await window.stcrHtmlDemo()
   ```

4. 会打开独立的合成游戏演示。截图来源默认 **“截当前画面”**，“带上外链素材”默认勾选。点击游戏里的第一件物品，让结局出现 **“飞鸟”**，再点 **“生成脱敏预览”**。下方 PNG 应保留这个结局；宽度 390、2 倍时 PNG 宽 **780 像素**。
5. 回到游戏点另一件物品，重新生成预览，应得到另一种结局。把截图来源改成 **“截初始画面”** 再生成，应回到初始文字。任意拖框仍可生成选区 PNG；它使用当前预览同一份快照，不重新取另一个结局。
6. 需要保存才点图片上方的保存链接，**选择 E 盘**。不要使用默认 C/F 下载目录。点 **“关闭演示”** 后页面恢复。
7. 自动专项检查（已有先前 T14 的 Ny 字体准备时），控制台粘贴：

   ```js
   await window.stcrSelfTest({core:false, htmlSnapshot:true})
   ```

   应看到 **29 项全部通过**。若提示开发字体缺失，在 Ny-font-manager 中导入已有的 **`E:\st-reader\.dev\fixtures\fonts\JetBrainsMono.ttf`** 后 Ctrl+F5 重试；无需下载或安装字体。该专项用合成资源替身验证外链，不请求真实网站。
8. 可选点“手机聊天”再生成图：该 fixture 的外链 CSS 使用故意不存在的 `.invalid` 域名，出现“部分素材未带入”提示属于失败降级演示，不是测试真实网站。自己的 HTML 素材能否带入还受资源网站的浏览器跨域许可影响。
9. 做完在开发实例黑窗口按 **Ctrl+C**，若询问是否终止，输入 **Y** 回车。正式阅读器的“截当前画面”按钮仍由 Opus 按上面接口接入，开发演示可先验收 core。

## 只读自查（grep）

在资源管理器进入 `E:\st-reader`，地址栏输入 `powershell` 后回车，逐行粘贴：

```powershell
rg --no-ignore -n 'chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(' index.js src vendor style.css
node dev/audit-readonly.mjs
git ls-files .dev .tmp 'docs/*.png'
```

- grep 共 **8 行**：`readonlyGuard.js:4–10` 的 7 个拒绝路径；`htmlSnapshot.test.js:12` 的 1 行纯函数拒绝样本（没有请求）。不是 8 次写入。审计脚本登记了这个明确的测试例外，**禁写函数调用、宿主赋值检查没有豁免**。
- 分类审计：运行文件禁写函数调用 **0**，宿主 chat / metadata / swipe 赋值 **0**；`.dev/.tmp/docs/*.png` 跟踪 **0**。网络命中人工复核：新增的是 D23 授权的资源 GET 和虚构测试 URL，没有新服务域名、遥测或上传。截图最终栅格化仍通过拒绝 fetch 的闸门。
- 没有读、列、复制、写 `F:\Claude\xinllm\SillyTavern\data`；没有写 C/F、安装依赖、运行安装脚本或推送 GitHub。测试仅使用本地已有浏览器和字体。

## 已知边界

- 外链网站拒绝 CORS、需要第三方登录凭据或返回无效素材时，不能承诺完整带入；会提示。未实现后端代理，也没有放宽交互 iframe 的同源权限。[MDN 跨域图片与 canvas](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image)
- 快照序列化当前可见 DOM，不恢复 JS 内存或重新启动游戏。开放 Shadow DOM 明确拒绝；关闭 Shadow DOM 无法可靠检测。画布/视频若含不可读取的跨域像素也拒绝；无 OCR，不替换图片里的名字。
- CSS 的复杂 `@import layer()/supports()`、image-set 等并非通用网页截图引擎；当前覆盖普通引用和媒体条件。静态清洗、禁动画以及现有尺寸上限仍可能让极复杂网页与交互态略有不同。
- 对已脱敏画面保留当前显示；没有“原词与每个动态 DOM 节点”的可逆映射。`alreadyMasked:true` 的边界已写入合同，UI 不能把关开关说成恢复原词。

## 改动文件与下一步

- `htmlSnapshot.js` / `htmlRenderer.js`：快照与双层消息协议；`htmlExternalResources.js` / `htmlStatic.js`：资源内嵌、滚动还原、默认外链与导出。
- `codeTransforms.js`：内部禁网解析器支持异步变换，既有 maskHtmlString 签名与默认文本节点规则不变。
- `htmlSnapshot*.test.js`、原 HTML 浏览器自测、`index.js` / `dev/selftest.mjs`：回归接线；`htmlRendererDemo.js`：当前/初始画面开发演示。
- AGENTS / 00 / 01 / 03 / 04 / 05 / 06 / 07、开发 README、审计脚本和本信：D23、合同、任务状态、测试记录。

Opus 可把此分支合入自己的 UI 分支，再按接口接线；本分支已经包含他的 `6e49465`，不要再从旧 T44a 单独拼接。请同步 02 的旧截图边界与截图窗口文案。T46/T47 将来按 D23 披露用户 HTML 资源请求，不能再写“截图不可能加载外链素材”。本卡等人类验收，不继续领取其他任务。
