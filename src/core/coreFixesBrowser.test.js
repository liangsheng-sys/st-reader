// ST Reader — AGPL-3.0
import { foreignExtensionSettings } from './hostSettings.js';
import { wrapMaskSpans, exportCard, createCardMessage } from './cardExport.js';
import { maskHtmlString } from './codeTransforms.js';
import { createStore } from './store.js';

const assert = (value, message) => { if (!value) throw new Error(message); };
const cleanOptions = { rules: [], assets: [], maskWords: [], replaceNames: false, scale: 1 };
const temporarySelector = '[data-stcr-export-frame],[data-stcr-parse-frame],[data-stcr-t41-test]';
const temporaryNodes = () => new Set(document.querySelectorAll(temporarySelector));
const addedTemporaryNodes = baseline => [...temporaryNodes()].filter(node => !baseline.has(node));
function assertTemporaryCleanup(baseline) {
    const leaked = addedTemporaryNodes(baseline);
    // 仅记录节点种类，不把聊天文字、HTML 内容或已有页面节点放进日志。
    const labels = leaked.map(node => `${node.localName}[${node.getAttributeNames().filter(name => /^data-stcr-(export-frame|parse-frame|t41-test)$/.test(name)).join(',')}]`);
    assert(!leaked.length, `本轮临时 DOM 泄漏 ${leaked.length} 个：${labels.join('、')}`);
}
const hostState = () => {
    const context = SillyTavern.getContext();
    return JSON.stringify({ chat: context.chat, metadata: context.chatMetadata, settings: foreignExtensionSettings(context.extensionSettings),
        character: context.characterId, group: context.groupId });
};
async function pixels(blob) {
    const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
    return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
}
const fakeHandle = {
    isGroup: false,
    getMessage: () => ({ index: 0, name: '虚构乙', isUser: false, isSystem: false, isNarrator: false, swipeId: 0,
        swipes: [{ text: '灯塔与星图。', reasoning: '灯塔也是虚构的。' }] }),
    getRegexContext: () => ({ userName: '虚构甲', characterName: '虚构乙', character: null, depth: 0, groupNames: [] }),
};

/** 可单独通过 stcrSelfTest({core:false,coreFixes:true}) 运行，不需要选择角色或安装字体。 */
export async function testCoreFixesBrowser() {
    const before = hostState(), baseline = temporaryNodes(), results = [], root = document.createElement('div');
    root.dataset.stcrT41Test = '1';
    root.style.cssText = 'position:fixed;left:-20000px;top:0;width:700px;pointer-events:none;';
    document.body.append(root);
    const test = async (name, run) => {
        try { await run(); results.push({ name: `T41 ${name}`, passed: true }); }
        catch (error) { results.push({ name: `T41 ${name}`, passed: false, error: error.message }); console.error(`[st-reader] T41 ${name}`, error); }
    };
    const sample = html => {
        const element = document.createElement('div'); element.innerHTML = html;
        element.style.cssText = 'font:32px/40px serif!important;letter-spacing:0!important;white-space:pre!important;width:640px;color:#000!important;background-color:#fff!important;';
        root.append(element); return element;
    };
    try {
        await test('清理检查保留已有节点，仍能识别本轮新增残留', () => {
            const existing = document.createElement('div'), leaked = document.createElement('div');
            existing.dataset.stcrExportFrame = '1'; leaked.dataset.stcrParseFrame = '1';
            try {
                root.append(existing); const initial = temporaryNodes(); root.append(leaked);
                const added = addedTemporaryNodes(initial);
                assert(added.length === 1 && added[0] === leaked, '新增节点判定错误');
                let detected = false;
                try { assertTemporaryCleanup(initial); } catch (error) { detected = error.message.includes('data-stcr-parse-frame'); }
                assert(detected, '检查漏掉真正新增的残留');
                leaked.remove(); assertTemporaryCleanup(initial);
                assert(existing.isConnected, '误删已有节点');
            } finally { existing.remove(); leaked.remove(); }
        });
        await test('英文、中文、emoji 与跨内联节点按 Range 像素测量，输入不变', () => {
            for (const html of ['Wi', '中文', 'Wi😀界', 'W<em style="font-size:22px">i</em>界']) {
                const original = sample(html), range = document.createRange(); range.selectNodeContents(original);
                const width = range.getBoundingClientRect().width, raw = original.outerHTML;
                const copy = wrapMaskSpans(original, [original.textContent], { kind: 'bar', uniform: false }); root.append(copy);
                const mask = copy.querySelector('.stcr-mask');
                assert(mask.style.width.endsWith('px'), '有布局时没有使用 px');
                assert(Math.abs(mask.getBoundingClientRect().width - width) < .05, '遮盖宽度与原词不一致');
                assert(!copy.textContent, '遮盖保留了原词'); assert(original.outerHTML === raw, '改变了原文');
                original.remove(); copy.remove();
            }
        });
        await test('所有命中在修改前测量，统一宽度和脱离 DOM 回退不变', () => {
            const original = sample('Wi Wi Wi'), text = original.firstChild, expected = [];
            for (const start of [0, 3, 6]) {
                const range = document.createRange(); range.setStart(text, start); range.setEnd(text, start + 2);
                expected.push(range.getBoundingClientRect().width);
            }
            const copy = wrapMaskSpans(original, ['Wi'], { kind: 'block', uniform: false });
            [...copy.querySelectorAll('.stcr-mask')].forEach((mask, i) => assert(Math.abs(parseFloat(mask.style.width) - expected[i]) < .01, '后续命中宽度受前次插入影响'));
            assert(wrapMaskSpans(original, ['Wi']).querySelector('.stcr-mask').style.width === '3em', '统一长度改变');
            original.remove();
            assert(wrapMaskSpans(original, ['Wi'], { kind: 'bar', uniform: false }).querySelector('.stcr-mask').style.width === '2em', '无布局回退不正确');
        });
        await test('PNG 中非统一遮盖实际像素宽度等于原词', async () => {
            const original = sample('Wi'), range = document.createRange(); range.selectNodeContents(original);
            original.style.height = '60px';
            const width = range.getBoundingClientRect().width, raw = original.outerHTML;
            const image = await pixels(await exportCard(original, { ...cleanOptions, maskWords: ['Wi'], maskStyle: { kind: 'bar', uniform: false, color: '#123456' } }));
            let min = Infinity, max = -1;
            for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
                const i = (y * image.width + x) * 4;
                if (image.data[i] === 18 && image.data[i + 1] === 52 && image.data[i + 2] === 86 && image.data[i + 3] === 255) { min = Math.min(min, x); max = Math.max(max, x); }
            }
            assert(max >= min && Math.abs(max - min + 1 - width) < 2, `PNG 宽度错误：${max - min + 1} / ${width}`);
            assert(original.outerHTML === raw, '导出修改预览'); original.remove();
        });
        await test('替换文字背景进入正文、思维链及实际 PNG，替换文字仍优先于屏蔽', async () => {
            const rules = [{ from: '灯塔', to: { kind: 'text', value: '某地', background: '#12abcd' } }];
            const { element, mappings } = await createCardMessage(fakeHandle, 0, { rules, assets: [] });
            element.style.cssText = 'width:640px;background-color:#fff!important;font:24px/32px serif!important;color:#000!important;'; root.append(element);
            const raw = element.outerHTML;
            const spans = [...element.querySelectorAll('.stcr-replacement')].filter(span => span.textContent === '某地');
            assert(spans.length === 2 && spans.every(span => span.style.backgroundColor === 'rgb(18, 171, 205)'), '正文或思维链背景缺失');
            assert(mappings.find(item => item.from === '灯塔').to.background === '#12abcd', '映射丢背景');
            const masked = wrapMaskSpans(element, ['某地']); assert(masked.textContent.includes('某地'), '替换被再次屏蔽');
            const image = await pixels(await exportCard(element, { ...cleanOptions, replaceNames: true, rules, maskWords: ['某地'] }));
            let colored = 0;
            for (let i = 0; i < image.data.length; i += 4) if (image.data[i] === 18 && image.data[i + 1] === 171 && image.data[i + 2] === 205 && image.data[i + 3] === 255) colored++;
            assert(colored > 150, `PNG 背景色像素不足：${colored}`); assert(element.outerHTML === raw, '导出修改原节点'); element.remove();
        });
        await test('HTML 只改文本，标签/属性/script/style/注释保持原意，替换文字不执行', async () => {
            const html = '<!doctype html><!--秘密--><html lang="秘密"><head data-note="秘密"><title>秘密</title><style>.秘密{color:red}/*秘密*/</style></head><body data-name="秘密"><b title="灯塔" style="color:red">灯塔与秘密</b><script>const x="秘密";</script><template><i>秘密</i></template></body></html>';
            const output = await maskHtmlString(html, { maskWords: ['秘密'], rules: [{ from: '灯塔', to: { kind: 'text', value: '<img src=x onerror=bad()>' } }] });
            const doc = new DOMParser().parseFromString(output, 'text/html');
            assert(doc.documentElement.lang === '秘密' && doc.head.dataset.note === '秘密' && doc.body.dataset.name === '秘密', '修改了属性');
            assert(doc.querySelector('b').title === '灯塔' && doc.querySelector('b').textContent === '<img src=x onerror=bad()>与███', '文字替换或转义错误');
            assert(doc.querySelector('b').getAttribute('style') === 'color:red', '内联样式被改');
            assert(!doc.querySelector('img'), '替换内容变成 HTML');
            assert(doc.querySelector('script').textContent === 'const x="秘密";' && doc.querySelector('style').textContent === '.秘密{color:red}/*秘密*/', '脚本或样式被改');
            assert(doc.title === '███' && doc.querySelector('template').content.textContent === '███', '标题或模板文本漏处理');
            assert(output.includes('<!--秘密-->') && /^<!DOCTYPE html>/i.test(output), '注释或 doctype 丢失');
        });
        await test('HTML 片段、实体、SVG 文本、空串及重复调用可用', async () => {
            const output = await maskHtmlString('<p>A&amp;B 秘密</p><svg><text>秘密</text><style>/*秘密*/</style></svg>', { maskWords: ['秘密'], rules: [{ from: 'A&B', to: { kind: 'text', value: '某处' } }] });
            const doc = new DOMParser().parseFromString(output, 'text/html');
            assert(doc.querySelector('p').textContent === '某处 ███' && doc.querySelector('text').textContent === '███', '片段或实体错误');
            assert(doc.querySelector('svg style').textContent === '/*秘密*/', 'SVG style 被更改');
            assert((await maskHtmlString('')).includes('<body></body>'), '空文档不正确');
            assert((await maskHtmlString('秘密', { maskWords: ['秘密'] })).includes('███'), '重复调用失败');
        });
        await test('HTML 带外链 img/iframe/CSS 时解析零外链条目、不执行脚本并清理', async () => {
            const start = performance.now(), marker = crypto.randomUUID(), initial = temporaryNodes();
            const url = `https://stcr-t41.invalid/${marker}`;
            const source = `<html><head><link rel="stylesheet" href="${url}.css"><style>@import "${url}-import.css";</style></head><body><img src="${url}.png"><iframe src="${url}.html"></iframe><script>globalThis.STCR_T41_UNEXPECTED = 1;</script><p>秘密</p></body></html>`;
            const output = await maskHtmlString(source, { maskWords: ['秘密'] });
            assert(output.includes(`${url}.png`) && output.includes('███'), '属性被清洗或文本未改');
            await new Promise(resolve => setTimeout(resolve, 120));
            assert(!performance.getEntriesByType('resource').some(entry => entry.startTime >= start && entry.name.includes(marker)), '解析触发外链资源');
            assert(!Object.hasOwn(globalThis, 'STCR_T41_UNEXPECTED'), '执行了用户脚本');
            assertTemporaryCleanup(initial);
        });
        await test('聊天收藏与背景色使用真实 IndexedDB 往返，不碰使用者存储', async () => {
            const name = `stcr-t41-test-${crypto.randomUUID()}`, adapter = SillyTavern.libs.localforage.createInstance({ name, storeName: 'test' });
            try {
                const first = createStore({ storage: adapter });
                const chat = await first.bookmarks.put({ kind: 'chat', chatKey: 't41.png/synthetic', title: '虚构聊天', preview: '' });
                const colored = await first.replaceRules.put({ from: '灯塔', to: { kind: 'text', value: '某地', background: '#12abcd' } });
                const reopened = createStore({ storage: adapter });
                assert((await reopened.bookmarks.list({ kind: 'chat' }))[0].id === chat.id, '聊天收藏未落盘');
                assert((await reopened.replaceRules.get(colored.id)).to.background === '#12abcd', '背景未落盘');
                assert((await reopened.previewImport(await first.exportAll())).bookmarks.skipped === 1, '往返重复记录');
            } finally { await adapter.dropInstance(); }
        });
    } finally {
        root.remove();
        await test('宿主聊天/候选/设置不变，导出与解析临时节点清理', () => {
            assert(before === hostState(), '宿主快照发生变化');
            assertTemporaryCleanup(baseline);
        });
    }
    console.table(results);
    const failed = results.filter(result => !result.passed);
    if (failed.length) throw new Error(`T41 浏览器自测 ${failed.length} 项失败：${failed.map(result => result.name).join('、')}`);
    return results;
}
