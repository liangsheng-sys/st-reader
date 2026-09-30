// ST Reader — AGPL-3.0
import { detectHtmlBlocks, buildSrcdoc } from './htmlRenderer.js';
import { PHONE_HTML, GAME_HTML, HTML_MESSAGES } from '../../dev/fixtures/html.mjs';
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
    return results;
}
