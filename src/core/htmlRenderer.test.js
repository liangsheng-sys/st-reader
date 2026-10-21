// ST Reader — AGPL-3.0
import { detectHtmlBlocks, buildSrcdoc } from './htmlRenderer.js';
import { PHONE_HTML, GAME_HTML, HTML_MESSAGES, SCENE_HTML, MIXED_HTML, MULTI_HTML, SECOND_SCENE_HTML, COMMUNITY_HTML, COMMUNITY_BOX_HTML } from '../../dev/fixtures/html.mjs';
import { captureGeometry, previewPoint, dragCrop } from './htmlCrop.js';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
export function testHtmlRendererLogic() {
    const results = [], test = (name, run) => { run(); results.push({ name: `T44a ${name}`, passed: true }); };
    test('两楼合成手机/游戏分别识别为裸 HTML 与围栏 HTML', () => {
        assert(detectHtmlBlocks(HTML_MESSAGES[0])[0]?.kind === 'raw', '手机样本未识别');
        assert(detectHtmlBlocks(HTML_MESSAGES[1])[0]?.kind === 'fenced', '游戏样本未识别');
        assert(PHONE_HTML.includes('https://') && GAME_HTML.includes('onclick'), '样本缺少外链或交互');
    });
    test('围栏区间支持中文、CRLF、多块、波浪号与较长围栏', () => {
        const text = '前言😀\r\n````html\r\n<body>甲</body>\r\n````\r\n间隔\n~~~\n<BODY class="x">乙</BODY>\n~~~\n尾声';
        const blocks = detectHtmlBlocks(text);
        assert(blocks.length === 2 && blocks[0].html === '<body>甲</body>\r\n', '围栏数量或正文错误');
        assert(text.slice(blocks[0].start, blocks[0].end).startsWith('````') && text.slice(blocks[1].start, blocks[1].end).endsWith('~~~\n'), 'UTF-16 区间错误');
    });
    test('普通 Markdown 代码块、b 标签、行内代码和稀疏标签不识别', () => {
        for (const input of ['```js\nconst x=1;\n```', '正文 <b>粗体</b>', '`<body></body>`', '<!--<html></html>-->', '长篇普通正文'.repeat(60) + '<style></style>', '```html\n<b>普通</b>\n```\n<body>仍属含围栏文本</body>']) {
            assert(!detectHtmlBlocks(input).length, `反例被识别：${input.slice(0, 40)}`);
        }
    });
    test('裸 HTML 支持 body/html/style 且 CSS 长度不稀释结构', () => {
        for (const text of ['<body>短文</body>', '<html><p>短文</p></html>', `<style>${'/*虚构*/'.repeat(100)}</style><div>短文</div>`]) assert(detectHtmlBlocks(text).length === 1, '裸 HTML 漏识别');
    });
    test('T51 标题与尾声留正文，裸区间严格等于第一个块级标签到末闭合标签', () => {
        const [block] = detectHtmlBlocks(MIXED_HTML);
        assert(block?.html === SCENE_HTML && block.start === MIXED_HTML.indexOf('<style>'), '前言进入了 HTML');
        assert(block.end === block.start + SCENE_HTML.length && MIXED_HTML.slice(block.start, block.end) === block.html, '末尾散文进入了 HTML');
        assert(Object.keys(block).sort().join(',') === 'end,html,kind,start', '返回字段发生变化');
    });
    test('T51 同楼两段按原文顺序独立返回，段间散文不进入任何 iframe', () => {
        const blocks = detectHtmlBlocks(MULTI_HTML);
        assert(blocks.length === 2 && blocks[0].html === SCENE_HTML && blocks[1].html === SECOND_SCENE_HTML, '多段没有拆开');
        assert(blocks[0].end < blocks[1].start && MULTI_HTML.slice(blocks[0].end, blocks[1].start).includes('旅人走过一段散文'), '散文边界错误');
        for (const block of blocks) assert(MULTI_HTML.slice(block.start, block.end) === block.html, '切片不等于 HTML');
    });
    test('T51 两份独立 html/body 文档即使仅隔空白也各自返回', () => {
        for (const tag of ['html', 'body']) {
            const a = `<${tag}><div>虚构甲</div></${tag}>`, b = `<${tag}><div>虚构乙</div></${tag}>`;
            const blocks = detectHtmlBlocks(`${a}\n\n${b}`);
            assert(blocks.length === 2 && blocks[0].html === a && blocks[1].html === b, '独立文档合并到同一个 iframe');
        }
    });
    test('T51 中文 emoji、CRLF、DOCTYPE、注释与行内代码不改变 UTF-16 偏移', () => {
        const html = '<HTML><BODY><div>虚构😀</div></BODY></HTML>';
        const text = `标题😀\r\n<!--<body>假的</body>-->\r\n\`<style>假的</style>\`\r\n<!doctype html>${html}\r\n尾声`;
        const blocks = detectHtmlBlocks(text);
        assert(blocks.length === 1 && blocks[0].html === html && blocks[0].start === text.indexOf('<HTML>'), '偏移或排除标记错误');
        assert(blocks[0].end === text.indexOf('\r\n尾声'), '吞掉末尾换行');
    });
    test('T51 CSS/脚本伪标签、引号内大于号、嵌套和 void 标签不截断边界', () => {
        const html = '<div data-note=" > <body> "><style>.x:after{content:"</div><body>"}</style><section><img alt=虚构><br><p>内文</p></section><script>const s="</div><style>";</script></div>';
        const [block] = detectHtmlBlocks(`前言\n${html}\n尾声`);
        assert(block?.html === html, '伪标签或嵌套截断了正文');
        assert(!detectHtmlBlocks('<script>const s="<body></body>";</script>').length, '脚本字符串误判为文档');
    });
    test('T51 空白与注释连接 style 和内容，无闭合块不吞全文', () => {
        const html = '<style>p{color:red}</style>\n<!--段内注释-->\n<section><p>虚构</p></section>';
        assert(detectHtmlBlocks(`前言\n${html}\n尾声`)[0]?.html === html, '相邻兄弟标签被拆开');
        assert(!detectHtmlBlocks('前言\n<body><div>未闭合\n尾声').length, '未闭合片段吞掉散文');
        assert(detectHtmlBlocks('<style></style><div>完成</div>\n尾声\n<section>未完成')[0]?.html === '<style></style><div>完成</div>', '未闭合下一段污染已完成区间');
    });
    test('T72 D35 散文 + details + div 盒 + <selection>：只有样式盒与状态栏进沙箱', () => {
        const blocks = detectHtmlBlocks(COMMUNITY_HTML);
        assert(blocks.length === 1 && blocks[0].html === COMMUNITY_BOX_HTML, `区间错误：${blocks.map(b => b.html.slice(0, 30)).join(' | ')}`);
        assert(COMMUNITY_HTML.slice(blocks[0].start, blocks[0].end) === blocks[0].html, '切片不等于 HTML');
        const outside = COMMUNITY_HTML.slice(0, blocks[0].start) + COMMUNITY_HTML.slice(blocks[0].end);
        for (const part of ['<summary>摘要</summary>', '<summary>主线记录</summary>', '<selection>', '<summary>小剧场</summary>', '这一段是普通散文']) assert(outside.includes(part), `${part} 被收进了沙箱`);
    });
    test('T72 D35 非起始标签不起始也不延伸；栈归零后只有空白才并入', () => {
        const box = '<style>.x{color:red}</style><div class="x">盒</div>';
        const cases = [
            [`${box}<details><summary>摘要</summary>正文</details>`, [box]],
            [`${box}\n<selection>选项</selection>`, [box]],
            [`${box}<p>段落</p><div>第二盒</div>`, [box, '<div>第二盒</div>']],
            [`<style>a{}</style>\n\n<div>甲</div>\n<section>乙</section>`, ['<style>a{}</style>\n\n<div>甲</div>\n<section>乙</section>']],
            [`<details><summary>折叠</summary><style>a{}</style><div>里面</div></details>${box}`, [box]],
            [`<h2>标题</h2><span>行内</span>${box}<h3>尾</h3>`, [box]],
            [`<blockquote><div><style>a{}</style>引文</div></blockquote>`, []],
            [`<div><details><summary>盒内折叠</summary>保留在盒里</details></div><style>a{}</style>`, ['<div><details><summary>盒内折叠</summary>保留在盒里</details></div><style>a{}</style>']],
            [`<p>没闭合的段落<style>a{}</style><div>仍能认出</div>`, ['<style>a{}</style><div>仍能认出</div>']],
        ];
        for (const [text, want] of cases) {
            const got = detectHtmlBlocks(text).map(block => block.html);
            assert(JSON.stringify(got) === JSON.stringify(want), `${text.slice(0, 50)} → ${JSON.stringify(got)}`);
        }
    });
    test('默认 CSP、可信外壳导航限制、随机 token 与高度脚本俱全', () => {
        const a = buildSrcdoc('<body>虚构</body>'), b = buildSrcdoc('<body>虚构</body>');
        for (const part of ["default-src 'none'", "style-src 'unsafe-inline'", "script-src 'unsafe-inline'", 'img-src data: blob:', 'font-src data:', 'frame-src about:', 'ResizeObserver', 'postMessage']) assert(a.includes(part), `缺少 ${part}`);
        assert(a !== b && !a.includes('allow-same-origin'), '随机 token 或沙箱边界错误');
        assert(!a.includes('https:'), '默认策略放开网络');
    });
    test('显式允许网络只放开 https，重建字符串仍保留脚本/宿主隔离', () => {
        const source = buildSrcdoc('<body></body>', { allowNetwork: true, width: 768 });
        assert(source.includes("style-src 'unsafe-inline' https:") && source.includes('font-src data: https:') && source.includes('connect-src https:'), 'https 开关不完整');
        assert(source.includes('frame-src about:') && !source.includes('http:'), '导航或明文外链未限制');
    });
    test('恶意闭合 script 标签只能进入内层 HTML，不能逃出可信外壳', () => {
        const source = buildSrcdoc('</script><script>parent.bad=1</script><body>恶意样本</body>');
        assert((source.match(/<script>/g) ?? []).length === 1 && (source.match(/<\/script>/g) ?? []).length === 1, '用户 HTML 逃出外层字符串');
    });
    test('错误类型、宽度和网络选项在创建文档之前拒绝', () => {
        for (const run of [() => detectHtmlBlocks(null), () => buildSrcdoc(null), ...[0, -1, 8193, 2.5, NaN].map(width => () => buildSrcdoc('', { width })), () => buildSrcdoc('', { allowNetwork: 'true' })]) {
            let rejected = false; try { run(); } catch { rejected = true; } assert(rejected, '坏参数未拒绝');
        }
    });
    test('高清裁剪沿用 CSS 坐标，默认双倍，显式三倍不改变排版', () => {
        const crop = { x: 17, y: 31, w: 123, h: 47 };
        for (const scale of [undefined, 1, 2, 3]) {
            const geometry = captureGeometry(768, 556, scale, crop), factor = scale ?? 2;
            assert(JSON.stringify(geometry.rect) === JSON.stringify(crop), '改写了 CSS 坐标');
            assert(['x', 'y', 'w', 'h'].every(key => geometry.pixels[key] === crop[key] * factor), 'PNG 坐标未同倍转换');
        }
    });
    test('高清内存上限先验整图，不能用小裁剪绕过或静默降清晰度', () => {
        for (const run of [() => captureGeometry(8192, 1000, 2, { x: 0, y: 0, w: 1, h: 1 }), () => captureGeometry(1, 16384, 3),
            ...[0, 1.5, 4, NaN, '2'].map(scale => () => captureGeometry(300, 150, scale)), () => captureGeometry(300, 150, 2, { x: 250, y: 0, w: 100, h: 20 })]) {
            let rejected = false; try { run(); } catch { rejected = true; } assert(rejected, '越界参数未拒绝');
        }
    });
    test('自由框选支持缩小预览、滚动偏移、反向拖动和边界', () => {
        const bounds = { left: 20, top: -30, width: 384, height: 278 };
        const start = previewPoint(170, 70, bounds, 768, 556), end = previewPoint(70, -5, bounds, 768, 556);
        const crop = dragCrop('draw', null, start, end, 768, 556);
        assert(JSON.stringify(crop) === JSON.stringify({ x: 100, y: 50, w: 200, h: 150 }), '屏幕坐标或反向拖动错误');
        assert(previewPoint(1000, -100, bounds, 768, 556).x === 768 && previewPoint(1000, -100, bounds, 768, 556).y === 0, '未约束范围');
    });
    test('选区可移动、四角调整和跨对角点，始终保留范围内整数矩形', () => {
        const rect = { x: 100, y: 80, w: 200, h: 150 }, start = { x: 0, y: 0 };
        assert(JSON.stringify(dragCrop('move', rect, start, { x: 999, y: -999 }, 768, 556)) === JSON.stringify({ x: 568, y: 0, w: 200, h: 150 }), '移动破坏尺寸或越界');
        for (const corner of ['nw', 'ne', 'sw', 'se']) {
            const result = dragCrop(corner, rect, start, { x: 30, y: 20 }, 768, 556);
            assert(result.w === (corner.includes('w') ? 170 : 230) && result.h === (corner.includes('n') ? 130 : 170), '边角调整错误');
        }
        const reversed = dragCrop('nw', rect, start, { x: 300, y: 300 }, 768, 556);
        assert(JSON.stringify(reversed) === JSON.stringify({ x: 300, y: 230, w: 100, h: 150 }), '越过对角点失效');
        captureGeometry(768, 556, 2, dragCrop('draw', null, { x: 768, y: 556 }, { x: 768, y: 556 }, 768, 556));
    });
    return results;
}
