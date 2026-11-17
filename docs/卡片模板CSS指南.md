# 卡片模板 CSS 指南

给会写 CSS 的人，或者整段贴给 AI。目标：写出一份"模板文件"（JSON），在阅读器的分享卡片工作台里 **导入模板…** 就能用。

## 一、先说清你要什么

对 AI 说一句话就行，例如："我想要一个类似推特（X）推文截图的分享卡片：白底、圆角、顶上一个圆形头像位 + 账号名、正文大一点、底部灰色小字日期。"
请 AI 按下面的规则输出 **一个 JSON 代码块**（格式见第六节），不要输出别的文件。

## 二、卡片的结构（类名是稳定的，可以放心写）

卡片会被导出成图片：先在页面里按 1:1 排好版，再缩放进预览；导出时在隔离副本里重画。卡片排版时宽 540px（竖版 / 方形）或 800px（宽版），导出的图片是它的 2 倍大（1080 / 1600 像素宽）；所以写 CSS 时字号、间距按 540 宽来想，用 px 或 em 都行（正文默认约 17px）。

```
.stcr-card                      卡片根（背景、圆角、外边距都在它身上）
  .stcr-card-page               内容区（纸张、深色等有上下细线就在它身上）
    .stcr-card-head             页眉（用户打开了页眉才有）
      .stcr-card-head-icon      页眉图标（是一张 <img>：字形颜色 = 强调色，由配色决定，CSS 改不了；要圆底用 background-color + padding + border-radius。不要对它用 filter，会连底色一起变）
      .stcr-card-head-title     页眉标题
      .stcr-card-head-date      页眉日期（"2026年11月16日"）
    .stcr-card-mark             书摘专用的大引号
    .stcr-card-lead             按语（正文前面的一句话，用户打开了才有）
    .stcr-card-chat             正文容器
      .mes                      每一楼（还带 .stcr-card-mes--user 或 .stcr-card-mes--char；系统楼多一个 .stcr-card-mes--system）
        .mes_block
          .ch_name > .name_text 名字行（用户可以关掉）
          .stcr-card-reasoning  思维链（用户打开了才有）
          .mes_text             正文；里面是 <p>，对白是 <q>，斜体 <em> / <i>，粗体 <strong> / <b>，代码 <pre> / <code>
    .stcr-card-thoughts         书摘专用："我的想法"
    .stcr-card-foot             页脚
      .stcr-card-sign           署名（默认"ST Reader"，用户可以改、可以关）
      .stcr-card-meta           日期 · 字数
```

- 被遮盖的词是卡片里的遮盖元素（不是文字），不要给它们写样式；也不要去"揭开"它们。
- 卡片没有头像、没有聊天文件名，也不要加：这是为了脱敏。想要"头像位"，用 `.stcr-card-head-icon`（圆底 + 图标）。
- 选择器里写 `.stcr-card` 就是卡片根本身（`.stcr-card:hover`、`.stcr-card::before` 也行）；其他选择器都被当作卡片里面的东西，比如 `.mes_text q`、`.stcr-card-foot`。不要写 `html`、`body`、`#id`，会整份被拒绝。

## 三、底板、选项类和变量

底板 `base`："theme" / "paper" / "dark" / "digest"。卡片根上有 `.stcr-card--<base>`、`.stcr-card--portrait|square|wide`（尺寸）。想从零开始写，选 `"paper"`：它最朴素（暖白底、墨色字、上下细线、首行缩进），你的 CSS 去覆盖这些即可。

选项会给卡片根加类，写 CSS 时可以跟着用：`.stcr-card--pal`（选了配色）、`.stcr-card--bubble`（气泡版式）、`.stcr-card--q-plain|q-underline|q-highlight`（对白样式）、`.stcr-card--n-chip|n-rule`（名字样式）、`.stcr-card--frame-thin|frame-bold|frame-dashed`（边框）、`.stcr-card--lh|ls|justify|ff`（行距 / 字距 / 两端对齐 / 字体族）。

可以直接使用或改写的 CSS 变量（写在 `.stcr-card { … }` 里）：
- `--stcr-card-accent`：强调色（对白下划线、名字标签等取它）。
- `--stcr-card-font`：字体族（卡片会用它）。
- `--stcr-fs`（字号倍数）、`--stcr-pad`（内边距倍数）、`--stcr-lh`（行距）、`--stcr-ls`（字距）、`--stcr-ff`（字体族）：由选项设置，写了会覆盖选项。
- 选了配色（`.stcr-card--pal`）时，名字、对白、斜体、署名的颜色规则比你写的选择器更强（直接写 `.name_text { color: … }` 会输），所以请改这几个变量（写在 `.stcr-card { … }` 里）：`--stcr-c-text`（正文）、`--stcr-c-name`（名字）、`--stcr-c-quote`（对白）、`--stcr-c-em`（斜体）、`--stcr-c-sign`（署名）、`--stcr-c-line`（线）、`--stcr-c-soft`（浅底）、`--stcr-c-page`（书摘卡面）。**配色的底色写在卡片根的行内样式里**，想盖掉它要写 `background-color: … !important`；更简单的是不选配色（`"palette": null`），直接用 `background-color` 自己定底色。

## 四、写 CSS 的硬规则（违反的整份会被拒绝，并说出哪一条）

- 总共不超过 8 KB。
- 不许：`@import`、`@font-face`、外链 `url(…)`（图片、字体都不行）、`position: fixed`、`expression(…)`；`@media` / `@supports` 可以用，不许嵌套；不许选择器嵌套（CSS nesting）。
- 想要背景图案：用渐变（`linear-gradient` / `radial-gradient` / `repeating-linear-gradient`）。想要小图标：用页眉图标（选项 `headerIcon`，12 枚可选），CSS 里不要自己引入别的图标。
- 字体：只能写本机字体的名字（`font-family: "Songti SC", serif`），不能下载。没装的会回退。
- **值里用了 `var(…)` 时，请用单项写法**：`background-color`、`border-top-color`，不要用 `background:`、`border:` 简写（导出的隔离副本会丢掉简写）。
- 不要用动画（导出只留静止一帧）、不要依赖 `:hover`。
- 要保证文字和背景的对比度 ≥ 4.5:1。

## 五、选项（options）

没写的项用默认值。取值：

- `layout`（版式）："flow" / "bubble"，默认 "flow"。
- `quoteStyle`（对白）："color" / "plain" / "underline" / "highlight"，默认 "color"。
- `nameStyle`（名字）："plain" / "chip" / "rule"，默认 "plain"。
- `frame`（边框）："none" / "thin" / "bold" / "dashed"，默认 "none"。
- `palette`（配色）：null（沿用底板）或 milk / peach / sky / mint / lilac / butter / rose / sand / cloud / ink / midnight / forest / wine / dusk / ocean / cocoa / slate / aurora。自定义配色：`customA`、`customB`（`#rrggbb`，customB 可为 null）、`customAngle`（0 / 45 / 90 / 135 / 180 / 225 / 270 / 315），并把 palette 设为 "custom"。
- `texture`（纹理）："none" / "grid" / "dots" / "lines"，默认 "none"。
- `fontFamily`："follow" / "serif" / "sans" / "kai"，默认 "follow"。
- `fontSize`："s" / "m" / "l"，默认 "s"。`lineHeight`：null（沿用底板）或 1.6 / 1.8 / 2。`letterSpacing`：0 / 0.02 / 0.05。`align`："left" / "justify"。`padding`："tight" / "normal" / "wide"，默认 "normal"。`radius`：0 / 12 / 24。
- 页眉：`headerOn`（true/false）、`headerIcon`（fa-feather-pointed / fa-pen-nib / fa-book / fa-book-open / fa-scroll / fa-moon / fa-star / fa-mug-hot / fa-masks-theater / fa-leaf / fa-heart / fa-wand-magic-sparkles）、`headerTitle`（≤ 30 字，空 = "一段故事"）、`headerDate`。
- 按语：`leadOn`、`leadText`（≤ 80 字）。页脚：`footDate`、`footCount`。

写错的选项名或取值会整份拒绝，并告诉你是哪一项。

## 六、输出格式

```json
{
  "format": "stcr-card-template",
  "version": 1,
  "name": "推文版式",
  "base": "paper",
  "options": {
    "palette": "cloud",
    "fontFamily": "sans",
    "fontSize": "m",
    "padding": "wide",
    "radius": 24,
    "headerOn": true,
    "headerIcon": "fa-feather-pointed",
    "headerTitle": "一段故事",
    "headerDate": true,
    "footDate": true,
    "nameStyle": "plain"
  },
  "css": ".stcr-card { background-color: #ffffff !important; background-image: none !important; color: #0f1419; --stcr-c-text: #0f1419; --stcr-c-name: #0f1419; --stcr-c-quote: #1d9bf0; --stcr-c-sign: #536471; outline: 1px solid #cfd9de; outline-offset: -1px; }\n.stcr-card-page { border-top-width: 0; border-bottom-width: 0; padding-top: 0; padding-bottom: 0; }\n.stcr-card-head { border-bottom-width: 0; }\n.stcr-card-head-icon { box-sizing: content-box; width: 1.1em; height: 1.1em; padding: .5em; border-radius: 50%; background-color: #e8f5fd; }\n.stcr-card-head-title { font-weight: 800; color: #0f1419; }\n.stcr-card-head-date { color: #536471; }\n.name_text { color: #0f1419; font-size: .9em; font-weight: 800; letter-spacing: 0; }\n.mes_text p { text-indent: 0; line-height: 1.6; }\n.mes_text q, .mes_text q * { color: #1d9bf0; }\n.stcr-card-foot { border-top-width: 0; }\n.stcr-card-meta, .stcr-card-sign { color: #536471; font-style: normal; }"
}
```

- `format` 和 `version` 照抄。`name` ≤ 20 字。`base` 见上。`options` 只写要改的。`css` 是一个字符串（换行写 \n）。
- 整个 JSON 不超过 20 KB。
- 导入：工作台"模板"组 → **导入模板…** → 粘贴 → 导入。导入后可以在"自定义样式"框里继续改。

## 七、给 AI 的提示

- 先想清楚这个版式里有哪几块（头像位、名字、正文、日期、署名……），再把它们对应到第二节的类名。
- 先用选项把大方向定下来（底板、配色、字体、圆角、版式），CSS 只补选项做不到的细节，这样更短、更不容易被拒绝。
- 优先覆盖：`.stcr-card`（底色、描边）、`.stcr-card-page`（去掉纸张的上下线）、`.name_text`、`.mes_text`、`.mes_text q`、`.stcr-card-foot`。
- 不确定的写法宁可不用。
