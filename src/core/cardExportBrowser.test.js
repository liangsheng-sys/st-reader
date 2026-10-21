// ST Reader — AGPL-3.0
import { foreignExtensionSettings } from './hostSettings.js';
import { exportCard, createCardMessage, bindCardSource, wrapMaskSpans } from './cardExport.js';
import { maskTextNodesInPlace, prepareCardAssets } from './cardContent.js';
import { buildCardFontCss, rasterizeCardIcon } from './cardFonts.js';
import { CARD_ICONS } from './cardTransforms.js';
import { makeChatKey, openChat } from './chatSource.js';
import { refreshCssScope } from './cssScope.js';
import { TEST_PNG } from './persistence.test.js';

const assert = (value, message) => { if (!value) throw new Error(message); };
const cleanOptions = { rules: [], assets: [], maskWords: [], scale: 1 };
function snapshot() {
    const context = SillyTavern.getContext();
    return JSON.stringify({ chat: context.chat, metadata: context.chatMetadata, settings: foreignExtensionSettings(context.extensionSettings),
        character: context.characterId, group: context.groupId, theme: context.powerUserSettings.theme, style: document.getElementById('chat')?.getAttribute('style') });
}
async function pixels(blob) {
    const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}
function mountRoot() {
    assert(!document.getElementById('stcr_root'), '请先关闭阅读器，再运行 T14 验证');
    const root = document.createElement('div'); root.id = 'stcr_root';
    root.style.cssText = 'position:fixed;left:-20000px;top:0;width:640px;pointer-events:none;height:auto;';
    root.innerHTML = '<div id="stcr_chat"></div>'; document.body.append(root); refreshCssScope();
    return { root, chat: root.firstElementChild };
}

/** 浏览器实际 PNG/像素、Ny 字节、跨节点遮盖与宿主快照验证。 */
export async function testCardExportBrowser() {
    const before = snapshot(), results = [], { root, chat } = mountRoot(), handles = [];
    const test = async (name, run) => {
        try { await run(); results.push({ name: `T14 ${name}`, passed: true }); }
        catch (error) { results.push({ name: `T14 ${name}`, passed: false, error: error.message }); console.error(`[st-reader] T14 ${name}：${error.stack}`); }
    };
    let floor, handle;
    try {
        handle = await openChat(makeChatKey({ avatarUrl: 'STCR_T11_Aster.png', fileName: 'STCR-01-正则与多候选' })); handles.push(handle);
        await test('I018 六个 core 图标实际 PNG 字形完整（不是 10px 小点）', async () => {
            for (const glyph of Object.values(CARD_ICONS)) {
                const source = rasterizeCardIcon(glyph, '#000000');
                const blob = new Blob([Uint8Array.from(atob(source.split(',')[1]), char => char.charCodeAt(0))], { type: 'image/png' });
                const { data } = await pixels(blob);
                let count = 0, minY = 128, maxY = 0;
                for (let i = 3; i < data.length; i += 4) if (data[i] > 128) { count++; minY = Math.min(minY, Math.floor(i / 4 / 128)); maxY = Math.max(maxY, Math.floor(i / 4 / 128)); }
                assert(count > 1000 && maxY - minY > 50, `图标退化为小点：${count}/${maxY - minY}`);
            }
        });
        await test('I019 正文/名字/正则宏合并仍完整脱敏并保留跳过诊断', async () => {
            const { element, mappings } = await createCardMessage(handle, 11, { ...cleanOptions, rules: [{ from: '虚构', to: { kind: 'text', value: '假想' }, scope: 'all' }] });
            assert(!element.textContent.includes('（假想）') && !element.textContent.includes(handle.header.characterName) && !element.textContent.includes(handle.header.userName), '部分名字泄漏');
            assert(mappings.some(item => item.skippedOverlap && item.skippedRules[0].from === '虚构' && item.skippedRules[0].count > 0), '诊断在合并时丢失');
        });
        await test('原文先替换再正则，只执行一次，源候选不变', async () => {
            const raw = JSON.stringify(handle.getMessage(11));
            const result = await createCardMessage(handle, 11, cleanOptions); floor = result.element; chat.append(floor);
            assert(floor.textContent.includes('【一次】✓') && !floor.textContent.includes('【一次】✓✓'), '显示正则次数错误');
            assert(floor.textContent.includes('星灯作用域命中') && floor.textContent.includes('char'), '作用域或名字未命中');
            assert(!floor.textContent.includes(handle.header.characterName) && !floor.textContent.includes(handle.header.userName), '真实名字仍存在');
            assert(JSON.stringify(handle.getMessage(11)) === raw, '源候选变化');
        });
        await test('两个独立开关覆盖预览/PNG，屏蔽词始终独立', async () => {
            const rules = [{ from: '灯塔', to: { kind: 'text', value: '某地' }, scope: 'all' }];
            for (const autoReplaceNames of [false, true]) for (const applyReplaceRules of [false, true]) {
                const options = { ...cleanOptions, rules, autoReplaceNames, applyReplaceRules, maskWords: ['星图'] };
                const { element } = await createCardMessage(handle, 11, options);
                assert(element.querySelector('.name_text').textContent.includes(handle.header.characterName) === !autoReplaceNames, '自动名字开关失效');
                assert(element.textContent.includes('某地') === applyReplaceRules, '我的规则开关失效');
                const expected = wrapMaskSpans(element, options.maskWords, 'bar');
                assert(!expected.textContent.includes('星图') && expected.querySelector('.stcr-mask'), '屏蔽词被名字开关关闭');
                chat.append(element, expected);
                try {
                    const actualPng = await pixels(await exportCard(element, options));
                    const expectedPng = await pixels(await exportCard(expected, { ...cleanOptions, replaceNames: false }));
                    assert(actualPng.width === expectedPng.width && actualPng.height === expectedPng.height
                        && actualPng.data.every((value, index) => value === expectedPng.data[index]), '独立开关导出与预览像素不符');
                } finally { element.remove(); expected.remove(); }
            }
        });
        await test('文字替换安全，图标/图片命中，替换结果优先于屏蔽词', async () => {
            const custom = { ...cleanOptions, assets: [{ id: 'dot', dataUrl: TEST_PNG }], rules: [
                { from: '星图', to: { kind: 'text', value: '<img src=x>保留' }, scope: 'all' },
                { from: '灯塔', to: { kind: 'icon', value: 'fa-cat' }, scope: 'all' },
                { from: '天气', to: { kind: 'asset', value: 'dot' }, scope: 'all' },
            ] };
            const result = await createCardMessage(handle, 11, custom);
            assert(result.element.textContent.includes('<img src=x>保留') && !result.element.querySelector('img[src="x"]'), '文字被解释成 HTML');
            assert(result.element.querySelector('[data-stcr-icon="fa-cat"]') && result.element.querySelector('img[src^="data:"]'), '图案缺失');
            const masked = wrapMaskSpans(result.element, ['保留', 'char', '今晚'], 'bar');
            assert(masked.textContent.includes('保留') && masked.textContent.includes('char') && !masked.textContent.includes('今晚'), '替换优先级错误');
            chat.append(result.element);
            try { const png = await exportCard(result.element, custom); assert(png.size > 1000, '图标素材 PNG 为空'); }
            finally { result.element.remove(); }
        });
        await test('跨内联节点屏蔽与三种 span，副本无原词且输入不变', () => {
            const el = document.createElement('div'); el.innerHTML = '<p>前秘<em>密</em>后<strong>长长秘密</strong></p>';
            const beforeHtml = el.innerHTML;
            for (const style of ['bar', 'block', 'sticker']) {
                const copy = wrapMaskSpans(el, ['秘密', '长长秘密'], style);
                assert(copy.querySelectorAll('.stcr-mask').length === 2 && !copy.textContent.includes('秘'), '跨节点或长词漏遮');
                assert([...copy.querySelectorAll('.stcr-mask')].every(span => span.style.width === '3em'), '没有统一遮盖长度');
                assert(!copy.innerHTML.includes('秘密'), '遮盖仍保留原词');
            }
            assert(el.innerHTML === beforeHtml, '输入 DOM 被更改');
        });
        await test('屏蔽图片样式经过素材校验，缺失素材拒绝', async () => {
            const assets = await prepareCardAssets([{ id: 'dot', dataUrl: TEST_PNG }]);
            const el = document.createElement('p'); el.textContent = '秘密';
            const copy = wrapMaskSpans(el, ['秘密'], { kind: 'sticker', assetId: 'dot' }, assets);
            assert(copy.querySelectorAll('img').length === 3 && !copy.textContent, '图片遮盖错误');
            let failed = false; try { wrapMaskSpans(el, ['秘密'], { kind: 'sticker', assetId: 'absent' }, assets); } catch { failed = true; }
            assert(failed, '悬空素材未拒绝');
            failed = false;
            try { wrapMaskSpans(el, ['秘密'], { kind: 'sticker', assetId: 'remote' }, new Map([['remote', { dataUrl: 'https://invalid.example/image.png' }]])); } catch { failed = true; }
            assert(failed, 'DOM 适配器允许了非本地素材');
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><script>bad()</script><image href="https://invalid.example/x"/><rect width="12" height="12" fill="#2468ac"/></svg>';
            const svgAssets = await prepareCardAssets([{ id: 'svg', dataUrl: `data:image/svg+xml;base64,${btoa(svg)}` }]);
            const sanitized = atob(svgAssets.get('svg').dataUrl.split(',')[1]);
            assert(!sanitized.includes('script') && !sanitized.includes('invalid.example'), 'SVG 未去掉可执行内容和外部资源');
            const svgCopy = wrapMaskSpans(el, ['秘密'], { kind: 'sticker', assetId: 'svg' }, svgAssets); chat.append(svgCopy);
            try {
                await Promise.all([...svgCopy.querySelectorAll('img')].map(image => image.decode()));
                const png = await exportCard(svgCopy, { ...cleanOptions, replaceNames: false });
                assert(png.type === 'image/png' && png.size > 100, 'SVG 图案未进入 PNG');
            } finally { svgCopy.remove(); }
        });
        await test('Ny 字体从只读 IndexedDB 嵌入，PNG 可解码且含主题边线', async () => {
            assert(floor, '前置楼层渲染失败');
            const font = await buildCardFontCss(floor);
            assert(font.bytes === 187208 && font.families.some(name => name.startsWith('jetbrainsmono')), '未嵌入实际 Ny 测试字体');
            const beforeHtml = floor.outerHTML;
            const blob = await exportCard(floor, { ...cleanOptions, maskWords: ['星图', '今晚'], maskStyle: 'bar' });
            const image = await pixels(blob);
            let mint = 0, black = 0;
            for (let i = 0; i < image.data.length; i += 4) {
                if (image.data[i] === 114 && image.data[i + 1] === 184 && image.data[i + 2] === 165 && image.data[i + 3] === 255) mint++;
                if (image.data[i] === 0 && image.data[i + 1] === 0 && image.data[i + 2] === 0 && image.data[i + 3] === 255) black++;
            }
            assert(mint > 50 && black > 80, `主题边线或实心遮盖像素不足：${mint}/${black}`);
            assert(floor.outerHTML === beforeHtml, '导出改动输入 DOM');
        });
        await test('Ny 实际 PNG 字形与已加载 FontFace 的 Canvas 参考一致，区别于回退字体', async () => {
            const family = getComputedStyle(floor.querySelector('.mes_text')).fontFamily;
            const sample = document.createElement('div');
            sample.style.cssText = `position:relative;width:480px;height:100px;background:#fff;color:#000;font:40px/100px ${family};border:0;padding:0;margin:0;letter-spacing:0;text-shadow:none;`;
            sample.textContent = 'Wiii 0123'; chat.append(sample);
            try {
                const font = await buildCardFontCss(sample); assert(font.bytes > 0, '未取得字体');
                const image = await pixels(await exportCard(sample, { ...cleanOptions, replaceNames: false }));
                const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
                const context = canvas.getContext('2d'); context.font = `40px ${family}`;
                const metrics = context.measureText(sample.textContent);
                const draw = (font, shift) => {
                    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#000'; context.font = font;
                    context.fillText(sample.textContent, 0, (100 - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 + metrics.fontBoundingBoxAscent + shift);
                    return context.getImageData(0, 0, canvas.width, canvas.height).data;
                };
                const difference = reference => { let sum = 0; for (let i = 0; i < reference.length; i += 4) sum += Math.abs(reference[i] - image.data[i]); return sum; };
                // SVG 行盒与 Canvas 的基线可能有至多一像素的子像素取整差；两者用相同搜索范围。
                const compare = font => Math.min(...Array.from({ length: 9 }, (_, i) => difference(draw(font, (i - 4) / 4))));
                const actual = compare(`40px ${family}`), fallback = compare('40px serif');
                console.log(`[st-reader] T14 字形像素差：Ny=${actual}，serif=${fallback}`);
                assert(actual < fallback * .2, `PNG 字形未匹配 Ny：${actual}/${fallback}`);
            } finally { sample.remove(); }
        });
        await test('群聊成员自动编号与多楼导出', async () => {
            const group = await openChat(makeChatKey({ groupId: 'stcr-t11-island', fileName: 'stcr-t11-island-chat' })); handles.push(group);
            const wrapper = document.createElement('div'); chat.append(wrapper);
            try {
                for (const index of [1, 2, 3]) wrapper.append((await createCardMessage(group, index, cleanOptions)).element);
                assert(['char1', 'char2', 'char3'].every(name => wrapper.textContent.includes(name)), '群成员编号错误');
                const blob = await exportCard(wrapper, cleanOptions); assert(blob.size > 1000, '多楼 PNG 为空');
            } finally { wrapper.remove(); }
        });
        await test('开关重新取原始候选；不是对已处理 HTML 重跑正则', async () => {
            const element = (await createCardMessage(handle, 11, { ...cleanOptions, replaceNames: false })).element; chat.append(element);
            const beforeHtml = element.outerHTML;
            try {
                const hidden = await pixels(await exportCard(element, { ...cleanOptions, replaceNames: true }));
                const visible = await pixels(await exportCard(element, { ...cleanOptions, replaceNames: false }));
                assert(hidden.width !== visible.width || hidden.height !== visible.height || hidden.data.some((value, i) => value !== visible.data[i]), '名字开关未作用于输出');
                assert(element.outerHTML === beforeHtml, '开关更改了预览');
            } finally { element.remove(); }
        });
        const at = (image, x, y) => { const i = (y * image.width + x) * 4; return [image.data[i], image.data[i + 1], image.data[i + 2]]; };
        await test('T73 楼内 <style> 的作用域编号进快照：卡片美化在 PNG 里与预览一致（I052）', async () => {
            const element = document.createElement('div');
            element.innerHTML = '<div class="mes_text" data-stcr-css="9073"><style>#stcr_chat [data-stcr-css="9073"] .custom-paper{height:60px;background:linear-gradient(#f6e7c8,#f6e7c8);border-radius:8px}</style><div class="custom-paper">虚构信笺</div></div>';
            element.style.cssText = 'width:200px;';
            chat.append(element);
            try {
                const box = element.querySelector('.custom-paper').getBoundingClientRect(), origin = element.getBoundingClientRect();
                const png = await pixels(await exportCard(element, { ...cleanOptions, replaceNames: false, width: 200 }));
                const [r, g, b] = at(png, Math.round(box.left - origin.left + box.width - 10), Math.round(box.top - origin.top + box.height / 2));
                assert(r > 235 && g > 220 && b > 185 && b < 215, `信笺底色丢失：rgb(${r},${g},${b})`);
            } finally { element.remove(); }
        });
        await test('T73 含 var() 的简写（宿主气泡 border）整条复制，PNG 里边框不丢', async () => {
            const sheet = document.createElement('style');
            sheet.textContent = '.stcr-t73-var{--stcr-t73-c:rgb(20,180,60);height:40px;border:6px solid var(--stcr-t73-c);border-radius:calc(var(--stcr-t73-r,0px) + 2px)}';
            document.head.append(sheet);
            const element = document.createElement('div');
            element.innerHTML = '<div class="stcr-t73-var">虚构气泡</div>';
            element.style.cssText = 'width:200px;';
            chat.append(element);
            try {
                const png = await pixels(await exportCard(element, { ...cleanOptions, replaceNames: false, width: 200 }));
                const [r, g, b] = at(png, 100, 2);
                assert(r < 60 && g > 150 && b < 100, `简写边框丢失：rgb(${r},${g},${b})`);
            } finally { element.remove(); sheet.remove(); }
        });
        await test('T73 外链背景按 D23 内嵌；拿不到的用斜纹占位并逐项提示，其余照常导出', async () => {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4;
            const paint = canvas.getContext('2d'); paint.fillStyle = 'rgb(220,30,30)'; paint.fillRect(0, 0, 4, 4);
            const red = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const calls = [], warnings = [];
            const fetchFn = async (url, init) => {
                calls.push({ url, credentials: init.credentials });
                if (url.startsWith('https://ok.invalid/')) return new Response(red, { headers: { 'content-type': 'image/png' } });
                throw new TypeError('虚构的跨域拒绝');
            };
            const element = document.createElement('div'); element.style.cssText = 'width:200px;';
            element.innerHTML = '<style>#stcr_chat .t73-pseudo::before{content:"";display:block;height:20px;background-image:url(https://ok.invalid/red.png)}</style>'
                + '<div style="height:40px;background-image:url(https://ok.invalid/red.png);background-size:cover"></div>'
                + '<div style="height:40px;background-image:url(https://bad.invalid/paper.png)"></div><div class="t73-pseudo"></div><p>其余文字照常</p>';
            // 外层在页面里 display:none，页面自己不去加载这些外链（发布测试拦一切外网）；快照外壳强制 display:block，副本照常排版
            const hidden = document.createElement('div'); hidden.style.display = 'none'; hidden.append(element);
            chat.append(hidden);
            try {
                const png = await pixels(await exportCard(element, { ...cleanOptions, replaceNames: false, width: 200, fetchFn, onWarning: message => warnings.push(message) }));
                const ok = at(png, 100, 20), bad = at(png, 100, 60), pseudo = at(png, 100, 90);
                assert(ok[0] > 200 && ok[1] < 60, `可读外链没内嵌：rgb(${ok})`);
                assert(pseudo[0] > 200 && pseudo[1] < 60, `::before 的外链没内嵌：rgb(${pseudo})`);
                assert(bad[0] > 180 && Math.abs(bad[0] - bad[2]) < 50 && bad[1] > 170, `拿不到的外链没有占位：rgb(${bad})`);
                assert(warnings.some(message => message.includes('斜纹占位') && message.includes('bad.invalid')), `没有逐项提示：${warnings.join(' | ')}`);
                assert(calls.length === 2 && calls.every(call => call.credentials === 'omit'), `请求次数或凭据不对：${JSON.stringify(calls)}`);
            } finally { hidden.remove(); }
        });
        await test('导出没有 fetch，失败路径与成功路径都清理隔离文档', async () => {
            const originalFetch = window.fetch; let calls = 0;
            window.fetch = (...args) => { calls++; return originalFetch(...args); };
            try {
                await exportCard(floor, cleanOptions);
                let failed = false;
                try { await exportCard(floor, { ...cleanOptions, maskWords: [''] }); } catch { failed = true; }
                assert(failed && calls === 0, `导出请求了 ${calls} 次网络或无效词未拒绝`);
            } finally { window.fetch = originalFetch; }
            assert(!document.querySelector('[data-stcr-export-frame]'), '隔离文档泄漏');
        });
        await test('拒绝没有原文的名字替换、过大尺寸与未知图标', async () => {
            const el = document.createElement('div'); el.textContent = 'plain'; chat.append(el);
            try {
                for (const options of [cleanOptions, { ...cleanOptions, replaceNames: false, scale: 4 }, { ...cleanOptions, replaceNames: false, width: 9000 }, { ...cleanOptions, replaceNames: false, maskStyle: { kind: 'sticker', icon: 'bad' } }]) {
                    let failed = false; try { await exportCard(el, options); } catch { failed = true; } assert(failed, '未拒绝无效参数');
                }
            } finally { el.remove(); }
        });
    } finally {
        root.remove(); handles.forEach(handle => handle.close());
        await test('宿主聊天/候选/设置/主题不变，测试节点清理', () => {
            assert(before === snapshot(), '宿主快照不一致');
            assert(!document.querySelector('[data-stcr-export-frame]') && !document.getElementById('stcr_root'), '测试节点未清理');
        });
    }
    const failed = results.filter(item => !item.passed);
    console.table(results);
    if (failed.length) throw new Error(`T14 浏览器自测 ${failed.length} 项失败：${failed.map(item => item.name).join('、')}`);
    return results;
}

/** 开发验收演示：对真实合成楼调用 exportCard，PNG 在窗口内预览，保存位置由人类选择。 */
export async function showCardExportDemo() {
    assert(!document.getElementById('stcr_root'), '请先关闭阅读器');
    const handle = await openChat(makeChatKey({ avatarUrl: 'STCR_T11_Aster.png', fileName: 'STCR-01-正则与多候选' }));
    const { root, chat } = mountRoot(); let url;
    try {
        const { element } = await createCardMessage(handle, 11, cleanOptions); chat.append(element);
        const blob = await exportCard(element, { ...cleanOptions, maskWords: ['星图', '今晚'], maskStyle: 'bar', scale: 2 });
        url = URL.createObjectURL(blob);
        const dialog = document.createElement('dialog'); dialog.style.cssText = 'max-width:90vw;max-height:90vh;overflow:auto;background:#20252b;color:white;padding:20px;border:1px solid #72b8a5;';
        const title = document.createElement('p'); title.textContent = 'T14 实际 PNG · 名字为 char/user，星图/今晚已遮盖。字体应与 Ny 一致。';
        const image = document.createElement('img'); image.alt = 'T14 实际导出的 PNG'; image.src = url; image.style.cssText = 'max-width:100%;display:block;';
        const save = document.createElement('button'); save.textContent = '保存 PNG（请选 E 盘）';
        save.onclick = async () => {
            if (!window.showSaveFilePicker) { title.textContent = '请右键图片 → 图片另存为，保存到 E:\\st-reader\\.tmp\\T14-card.png。'; return; }
            try {
                const file = await window.showSaveFilePicker({ suggestedName: 'ST-Reader-T14.png', types: [{ description: 'PNG 图片', accept: { 'image/png': ['.png'] } }] });
                const stream = await file.createWritable(); await stream.write(blob); await stream.close(); title.textContent = 'PNG 已保存。';
            } catch (error) { if (error.name !== 'AbortError') title.textContent = error.message; }
        };
        const close = document.createElement('button'); close.textContent = '关闭验收图'; close.onclick = () => dialog.close();
        for (const button of [save, close]) button.style.cssText = 'color:#fff;background:#31564d;border:1px solid #72b8a5;border-radius:4px;padding:8px;margin:0 8px 12px 0;cursor:pointer;';
        dialog.append(title, save, close, image); document.body.append(dialog);
        dialog.addEventListener('close', () => { URL.revokeObjectURL(url); dialog.remove(); }, { once: true }); dialog.showModal();
        return blob;
    } catch (error) { if (url) URL.revokeObjectURL(url); throw error; }
    finally { root.remove(); handle.close(); }
}
