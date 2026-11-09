// ST Reader — AGPL-3.0
// T97：导出文档纯逻辑的 Node 自测（无 DOM：用最小的假节点）。node src/core/documentText.test.js
import { cleanHtml, docDate, docFileName, DOC_EXPORT_DEFAULTS, floorHeading, htmlDocumentHead, htmlFloor, HTML_DOCUMENT_TAIL, normalizeDocOptions, speakerLabel, textLines, txtFloor } from './documentText.js';
import { READER_PALETTES } from './readerPalettes.js';

const assert = (value, message = '断言失败') => { if (!value) throw new Error(message); };
const equal = (a, b, label = '') => assert(JSON.stringify(a) === JSON.stringify(b), `${label}结果不一致：${JSON.stringify(a)} / ${JSON.stringify(b)}`);

/** 假元素：el('p', {style:'…'}, '文字', el('em', {}, '斜体'))。 */
function el(name, attrs = {}, ...children) {
    return {
        nodeType: 1, localName: name, attrs,
        childNodes: children.map(child => (typeof child === 'string' ? { nodeType: 3, data: child } : child)),
        getAttribute: key => (Object.hasOwn(attrs, key) ? attrs[key] : null),
        hasAttribute: key => Object.hasOwn(attrs, key),
    };
}
const root = (...children) => el('div', {}, ...children);
const all = { ...DOC_EXPORT_DEFAULTS.include, html: true, details: true, tables: true, code: true, reasoning: true };
const none = DOC_EXPORT_DEFAULTS.include;

/** 一楼"什么都有"的显示 DOM：正文、引号、斜体、列表、图片、隐藏段、样式、折叠块、表格、代码块、HTML 块。 */
function sample() {
    const status = el('div', { class: 'status' }, el('span', {}, '状态栏：晴'));
    const tree = root(
        el('style', {}, '.x{color:red}'),
        el('p', { class: 'fancy', style: 'color:red' }, '雾岚说：', el('q', {}, '“今天的记录还没写完。”'), el('em', {}, '轻声'), '。'),
        el('p', {}, '第一行', el('br'), '第二行'),
        el('ul', {}, el('li', {}, '灯笼'), el('li', {}, el('p', {}, '纸船'))),
        el('p', {}, '看见 ', el('img', { src: 'https://example.invalid/a.png', alt: '图' }), ' 了'),
        el('p', { hidden: '' }, '不该出现'),
        el('p', { style: 'margin:0; display: none' }, '也不该出现'),
        el('details', {}, el('summary', {}, '记忆'), el('p', {}, '折叠里的话')),
        el('table', {}, el('tbody', {}, el('tr', {}, el('th', {}, '天气'), el('td', {}, '晴')), el('tr', {}, el('td', {}, '风'), el('td', { colspan: '2' }, '小')))),
        el('pre', {}, el('code', {}, '# 标题\n  缩进一行\n')),
        el('script', {}, 'alert(1)'),
        el('a', { href: 'https://example.invalid/' }, '一个链接'),
        status,
    );
    const blocks = new Map([[status, { first: status, lines: ['状态栏文字'], html: '<iframe sandbox="" srcdoc="x"></iframe>' }]]);
    return { tree, blocks };
}

export async function testDocumentTextLogic() {
    const results = [];
    const test = async (name, run) => { await run(); results.push({ name: `T97 ${name}`, passed: true }); };
    await test('选项：默认 TXT / 酒馆当前 / 名字 / 只含楼号与用户楼；坏值回默认', () => {
        equal(normalizeDocOptions(null), { format: 'txt', swipes: 'host', speaker: 'name', include: { ...DOC_EXPORT_DEFAULTS.include } });
        equal(Object.entries(DOC_EXPORT_DEFAULTS.include).filter(([, on]) => on).map(([key]) => key), ['floorNumbers', 'user']);
        const o = normalizeDocOptions({ format: 'pdf', swipes: 'all', speaker: 'role', include: { reasoning: true, tables: 'yes', bogus: true } });
        equal([o.format, o.swipes, o.speaker, o.include.reasoning, o.include.tables, 'bogus' in o.include], ['txt', 'all', 'role', true, false, false]);
    });
    await test('纯文本：块级与 <br> 断行、列表"· "、图片"[图片]"、去样式 / 脚本 / 隐藏段 / 链接只留字', () => {
        const { tree, blocks } = sample();
        const lines = textLines(tree, { include: none, blocks });
        equal(lines, ['雾岚说：“今天的记录还没写完。”轻声。', '第一行', '第二行', '· 灯笼', '· 纸船', '看见 [图片] 了', '一个链接']);
    });
    await test('纯文本：四类剔除默认都去掉，勾上后折叠块 / 表格 / 代码块 / HTML 块各自成行', () => {
        const { tree, blocks } = sample();
        const lines = textLines(tree, { include: all, blocks });
        for (const want of ['记忆', '折叠里的话', '天气　晴', '风　小', '# 标题', '  缩进一行', '状态栏文字']) assert(lines.includes(want), `缺少：${want}（${JSON.stringify(lines)}）`);
        assert(!lines.some(line => /不该出现|alert|color:red/.test(line)), '隐藏段、脚本或样式漏出来了');
    });
    await test('纯文本：脱敏函数套在每个文本节点上（代码块也套）', () => {
        const { tree, blocks } = sample();
        const lines = textLines(tree, { include: all, blocks, mask: text => text.replace(/雾岚/g, 'char').replace(/标题/g, '██') });
        assert(lines[0].startsWith('char说：') && lines.includes('# ██'), JSON.stringify(lines));
    });
    await test('说话人三种、小标题、时间格式、文件名', () => {
        equal([speakerLabel('name', { name: ' 雾岚 ', isUser: false }), speakerLabel('role', { name: '雾岚', isUser: false }), speakerLabel('role', { name: '旅人', isUser: true }), speakerLabel('none', { name: '雾岚' }), speakerLabel('name', { name: '' })],
            ['雾岚', 'char', 'user', null, null]);
        const date = new Date(2026, 9, 31, 21, 5).toISOString();
        equal([floorHeading({ floorNumbers: true, time: true }, { number: 3, date }), floorHeading({ floorNumbers: false, time: true }, { number: 3, date }), floorHeading({ floorNumbers: false, time: false }, { number: 3, date })],
            ['第 3 楼 · 2026-10-31 21:05', '2026-10-31 21:05', '']);
        equal([docDate('坏日期'), docDate(null)], ['', '']);
        equal([docFileName('雾岚（虚构）', 'STCR-96/重楼:240?', 'txt'), docFileName('', '', 'html'), docFileName('a', 'b. ', 'html')], ['雾岚（虚构） - STCR-96_重楼_240_.txt', '聊天.html', 'a - b.html']);
    });
    await test('一楼 TXT：小标题、"名字："一行、候选标签、思考包裹；空楼不写；没有 Markdown 开头的行', () => {
        const floor = { number: 5, date: null, speaker: '雾岚', isUser: false, parts: [
            { label: '候选 1/2', reasoning: ['先想一想'], body: ['第一段', '第二段'] },
            { label: '候选 2/2', reasoning: null, body: ['另一个说法'] },
        ] };
        equal(txtFloor(floor, none).split('\r\n'), ['第 5 楼', '雾岚：', '候选 1/2', '（思考）', '先想一想', '（思考结束）', '第一段', '第二段', '候选 2/2', '另一个说法']);
        equal(txtFloor({ ...floor, speaker: null, parts: [{ label: null, reasoning: null, body: ['只有正文'] }] }, { ...none, floorNumbers: false }), '只有正文');
        equal(txtFloor({ ...floor, parts: [{ label: null, reasoning: [], body: [] }] }, none), null);
        const { tree, blocks } = sample();
        const text = txtFloor({ ...floor, parts: [{ label: null, reasoning: null, body: textLines(tree, { include: none, blocks }) }] }, none);
        assert(!text.split('\r\n').some(line => /^\s*([*#|>]|[-+] |\d+\. )/.test(line)), `有 Markdown 样子的行：${text}`);
    });
    await test('HTML 片段：只留语义标签，去属性 / 类名 / 链接 / 脚本；四类剔除；图片交给回调；转义', () => {
        const { tree, blocks } = sample();
        const html = cleanHtml(tree, { include: none, blocks });
        assert(html.startsWith('<p>雾岚说：<q>“今天的记录还没写完。”</q><em>轻声</em>。</p>'), html);
        for (const bad of ['fancy', 'status', 'style=', 'href', '<script', '<style', '<a', '<table', '<pre', '<details', '<iframe', '不该出现', 'example.invalid']) assert(!html.includes(bad), `不该有 ${bad}：${html}`);
        assert(html.includes('<span class="img">[图片]</span>') && html.includes('<li><p>纸船</p></li>'), html);
        const full = cleanHtml(tree, { include: all, blocks, image: () => '<img src="data:image/png;base64,AA" alt="">' });
        for (const want of ['<details><summary>记忆</summary>', '<td colspan="2">小</td>', '<pre># 标题\n  缩进一行\n</pre>', '<iframe sandbox="" srcdoc="x"></iframe>', '<img src="data:image/png;base64,AA" alt="">']) assert(full.includes(want), `缺少 ${want}：${full}`);
        equal(cleanHtml(root(el('p', {}, '<b>&"')), { include: none }), '<p>&lt;b&gt;&amp;&quot;</p>');
    });
    await test('HTML 文件：纸张配色同源、CSP 禁外部请求与脚本、无外链；一楼的结构', () => {
        const head = htmlDocumentHead({ title: '聊<天>', subtitle: '雾岚 · 共 3 楼' });
        const doc = head + htmlFloor({ number: 1, date: null, speaker: 'user', isUser: true, parts: [{ label: null, reasoning: '<p>想</p>', body: '<p>话</p>' }] }, none) + HTML_DOCUMENT_TAIL;
        assert(doc.includes('<meta charset="utf-8">') && doc.includes("default-src 'none'") && doc.includes('<title>聊&lt;天&gt;</title>'), '头部不对');
        assert(doc.includes(`--page:${READER_PALETTES.paper.page}`) && doc.includes(`--page:${READER_PALETTES.night.page}`), '配色不是 readerPalettes');
        assert(!/<script|\bsrc\s*=\s*["']?https?:|@import|url\(/i.test(doc), '有脚本或外链');
        assert(doc.includes('<article class="user"><header><b>user</b><span>第 1 楼</span></header><details class="think"><summary>思考过程</summary><p>想</p></details><div class="text"><p>话</p></div></article>'), doc);
    });
    return results;
}

if (typeof process !== 'undefined' && process.argv?.[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
    for (const result of await testDocumentTextLogic()) console.log(`通过：${result.name}`);
}
