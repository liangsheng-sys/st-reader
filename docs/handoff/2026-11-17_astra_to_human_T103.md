# T103 交接：从一份聊天分别导出正文和番外

## 做了什么

三种全局规则可单独使用，也可以同时使用。按标签分段时保留楼里其余正文，关键词指令覆盖到下一条用户楼前，隐藏规则只识别酒馆隐藏过的普通楼。TXT 和 HTML 共用识别结果。雾岚的 48 楼合成聊天同时覆盖多段落、候选、连续隐藏楼和旁白。

## 改动文件

- `src/core/sideStory.js` 提供规则校验、判定和定位，`documentExport.js` 负责按视图生成文档。`sideStoryBrowser.test.js` 由完整自测和 fixture 专项共用。`documentText.test.js` 覆盖无格式化器时的导出回退。
- `dev/fixtures/` 包含生成器、定值回归、SHA-256 与 4000 楼性能脚本。新装环境照常运行 generate-fixtures，已有合成库也可运行 `node dev/fixtures/add-side-story.mjs` 单独新增样本。
- §5.23 是 T105 的接口合同。I066 在同分支先行提交，调整了 `cssScope.js`、相应回归及 §5.22 的说明。

## 人类验收步骤

1. 等当前的 8100 开发窗口关闭，双击 `E:\st-reader\.tmp\T103-8100.cmd`。看到 listening 后打开 http://localhost:8100 。这个入口只给该开发进程提供本工作树的扩展文件。合入 main 后用常规 `dev/start-dev-st.cmd` 即可。
2. 点书本打开阅读器，点左上角 ≡，在“按角色”里选“雾岚（虚构）”，打开“STCR-97-番外-48楼”。点右上角 ⋮ → 导出为文档。“只正文／只番外”选项由 T105 添加，本卡从控制台验收引擎。
3. 按 F12，点“控制台 / Console”，粘贴下面一行并回车。应看到 **番外引擎 9/9 通过**。

   ```js
   await window.stcrSelfTest({fixtures:true,sideStory:true})
   ```

4. 双击 `E:\st-reader\.tmp\T103-main.txt`，搜索“船已靠岸”能找到，搜索“小剧场”和“幕外”都找不到。双击同目录的 `T103-side.txt`，第 4 楼的片段标有“第 4 楼 · 候选 1”，能读到“云上再会”，搜索“船已靠岸”找不到。正文有 36 楼，番外有 14 楼，三条混合楼在两份文档里各保留自己的部分，旁白默认不导出。
5. 关闭验收页，在启动窗口按 Ctrl+C 停止本次服务。

## 实测

- 原版 `dev/test-release.cmd` 返回 0，输出 T57 OK。Node 229 项，UI 静态 49 项，完整浏览器 344 项，界面主题 114 项，禁用及外网请求 0。旧的 21 MB 缓存命中首屏在前一轮一次为 347.1 ms，超过 300 ms。复测按 T101 做法，仅临时提高独立测试 Chrome 的调度优先级，三次为 244.2、288.0、280.8 ms。
- 单独执行验收命令，番外引擎 9/9 通过。两份 TXT 为 8100 实际格式化及导出得到的文件。48 楼样本 SHA-256 为 `153ff064122cc4b28691f27503cdeb59a09c70b36809b2e10a9fe3c4bfd3739b`。
- 发布回归开始前复制 settings.json、4 份阅读器备份和 50 份轮替设置。测试结束、服务关闭后还原，55 份 SHA-256 与回归前一致。4000 楼三种方法的测量范围及数字见 §5.23。

## 只读自查

- `rg --no-ignore -n "chats/save|chats/rename|chats/delete|chats/import|group/save|group/delete|group/import|saveChat\(|deleteMessage\(" index.js src vendor style.css` 命中 8 行。7 行是 readonlyGuard 第 4–10 行的禁用路径，1 行是 htmlSnapshot.test.js 第 12 行的拒绝样例。
- `node dev/audit-readonly.mjs` 通过，扩展禁用调用 0 行，宿主赋值 0 行。readonlyGuard.js 与 audit-readonly.mjs 无差异。
- 本任务是否读写过 F:\Claude\xinllm\SillyTavern\data：否。

## 已知问题 / 没做的

原文经正则重写后，若连首尾都不能唯一对齐，定位结果为 null。阅读器用整楼折叠条，过滤导出提示具体楼号并停止。I066 第③项的采集边界记录在 06。

## 给下一个人的话

Opus 在 T103 验收、合入 main 后按 §5.23 接 T105。用当前候选的完整 DOM 定位，视图仅隐藏另一部分并保留整楼锚点。批注、收藏和楼号继续使用原楼索引。
