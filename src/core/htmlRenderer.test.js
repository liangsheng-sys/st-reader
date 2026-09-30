// ST Reader — AGPL-3.0
import { detectHtmlBlocks, buildSrcdoc } from './htmlRenderer.js';
import { PHONE_HTML, GAME_HTML, HTML_MESSAGES } from '../../dev/fixtures/html.mjs';
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
