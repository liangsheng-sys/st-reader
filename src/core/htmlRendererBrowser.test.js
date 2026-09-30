// ST Reader — AGPL-3.0
import { createSandbox, renderStatic, exportRenderedHtml } from './htmlRenderer.js';
import { maskHtmlString, transformHtmlOffline } from './codeTransforms.js';
import { PHONE_HTML, GAME_HTML } from '../../dev/fixtures/html.mjs';
const assert = (value, message) => { if (!value) throw new Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const selector = '[data-stcr-html-frame],[data-stcr-html-static],[data-stcr-parse-frame]';
const hostState = () => { const c = SillyTavern.getContext(); return JSON.stringify({ chat: c.chat, metadata: c.chatMetadata, settings: c.extensionSettings, character: c.characterId, group: c.groupId }); };
function waitReport(marker) {
    let timer, listener;
    const promise = new Promise((resolve, reject) => {
        listener = event => { if (event.origin === 'null' && event.data?.stcrTest === marker) { clearTimeout(timer); window.removeEventListener('message', listener); resolve(event.data); } };
        window.addEventListener('message', listener);
        timer = setTimeout(() => { window.removeEventListener('message', listener); reject(new Error('合成沙箱回报超时')); }, 8000);
    });
    promise.catch(() => {});
    return { promise, cancel: () => { clearTimeout(timer); window.removeEventListener('message', listener); } };
}
async function pixels(blob) {
    const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
    return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
}
async function rejects(run) { let failed = false; try { await run(); } catch { failed = true; } assert(failed, '无效操作未拒绝'); }

export async function testHtmlRendererBrowser() {
    const baseline = new Set(document.querySelectorAll(selector)), before = hostState(), results = [], root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:-20000px;top:0;width:1400px'; document.body.append(root);
    const test = async (name, run) => { try { await run(); results.push({ name: `T44a ${name}`, passed: true }); } catch (error) { results.push({ name: `T44a ${name}`, passed: false, error: error.message }); console.error(`[st-reader] T44a ${name}`, error); } };
    try {
        await test('手机样本渲染、父页面隔离、外链字体/CSS 的 performance 资源条目为零', async () => {
            const marker = crypto.randomUUID(), report = waitReport(marker);
            const probe = `<script>addEventListener('load',()=>setTimeout(()=>{let isolated=false;try{parent.parent.document.body}catch{isolated=true}parent.parent.postMessage({stcrTest:${JSON.stringify(marker)},isolated,resources:performance.getEntriesByType('resource').map(x=>x.name),text:document.querySelector('header').textContent},'*')},200))</script>`;
            const handle = createSandbox(PHONE_HTML + probe); root.append(handle.iframe);
            try {
                await handle.ready; const value = await report.promise;
                assert(handle.iframe.getAttribute('sandbox') === 'allow-scripts' && handle.iframe.contentDocument === null && value.isolated, '可访问宿主');
                assert(value.text.includes('雾岛信箱') && parseInt(handle.iframe.style.height) > 200, '手机渲染或高度错误');
                assert(!value.resources.some(url => /^https?:/i.test(url)), `外链条目不为空：${value.resources.length}`);
            } finally { report.cancel(); handle.destroy(); }
        });
        await test('网页游戏脚本可点击选择结局，ResizeObserver 响应高度变化', async () => {
            const marker = crypto.randomUUID(), report = waitReport(marker);
            const probe = `<script>addEventListener('load',()=>setTimeout(()=>{document.getElementById('lantern').click();document.getElementById('ending').style.height='750px';parent.parent.postMessage({stcrTest:${JSON.stringify(marker)},text:document.getElementById('ending').textContent},'*')},100))</script>`;
            const handle = createSandbox(GAME_HTML + probe, { width: 768 }); root.append(handle.iframe);
            try { await handle.ready; assert((await report.promise).text.includes('飞鸟'), '交互未执行'); for (let i = 0; i < 30 && parseInt(handle.iframe.style.height) < 750; i++) await delay(50); assert(parseInt(handle.iframe.style.height) >= 750, '高度没有更新'); }
            finally { report.cancel(); handle.destroy(); }
        });
        await test('token/source 校验阻止串扰，重建默认重新断网，destroy 可重复', async () => {
            const handle = createSandbox('<body style="height:220px;margin:0">虚构</body>', { allowNetwork: true }); root.append(handle.iframe);
            try {
                await handle.ready; const old = handle.iframe.srcdoc, token = old.match(/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}/gi).at(-1), height = handle.iframe.style.height;
                window.dispatchEvent(new MessageEvent('message', { source: handle.iframe.contentWindow, data: { type: 'stcr:html-height', token: 'wrong', height: 999 } }));
                window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'stcr:html-height', token, height: 999 } }));
                assert(handle.iframe.style.height === height, '伪造消息改变了高度');
                await handle.update('<body style="height:240px;margin:0">重建</body>', { width: 390 });
                assert(!handle.iframe.srcdoc.includes('https:') && handle.iframe.srcdoc !== old, '重建保留联网权限或旧 token');
                window.dispatchEvent(new MessageEvent('message', { source: handle.iframe.contentWindow, data: { type: 'stcr:html-height', token, height: 999 } }));
                assert(parseInt(handle.iframe.style.height) !== 999, '旧 token 仍有效');
            } finally { handle.destroy(); handle.destroy(); }
            await rejects(() => handle.update('<body>已销毁</body>'));
        });
        await test('内容脚本的 location 导航也不能绕过默认断网', async () => {
            const marker = crypto.randomUUID(), report = waitReport(marker);
            const html = `<body>导航反例<script>addEventListener('DOMContentLoaded',()=>{parent.parent.postMessage({stcrTest:${JSON.stringify(marker)},alive:true},'*');setTimeout(()=>{try{location.href='https://st-reader-fixture.invalid/blocked-navigation'}catch{}},100)})</script></body>`;
            const handle = createSandbox(html); root.append(handle.iframe);
            try { const value = await report.promise; await delay(350); assert(value.alive, '内容文档未运行'); assert(!performance.getEntriesByType('resource').some(entry => entry.name.includes('blocked-navigation')), '外链导航产生资源条目'); }
            finally { report.cancel(); handle.destroy(); }
        });
        await test('静态副本去脚本、事件、跳转与远端资源，保留样式及 data 图片', async () => {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
            const source = '<body onload="parent.bad=1"><meta http-equiv="refresh" content="0;url=https://st-reader-fixture.invalid/"><style>p{color:rgb(18,52,86);background-image:url(https://st-reader-fixture.invalid/bg.png)}</style><p onclick="bad()">虚构</p><script>parent.bad=1</script><iframe srcdoc="bad"></iframe><template><script>bad()</script><b onclick="bad()">模板</b></template><img src="' + canvas.toDataURL() + '"></body>';
            const snapshot = await renderStatic(source, { width: 390 });
            try {
                assert(snapshot.iframe.getAttribute('sandbox') === 'allow-same-origin' && !snapshot.document.querySelector('script,iframe,[onclick],[onload]'), '静态执行入口未清理');
                assert(!snapshot.document.querySelector('template').content.querySelector('script,[onclick]'), '模板执行入口漏清理');
                assert(snapshot.document.images.length === 1 && snapshot.document.images[0].naturalWidth === 1, '本地 data 图片丢失');
                assert(snapshot.iframe.contentWindow.getComputedStyle(snapshot.document.querySelector('p')).color === 'rgb(18, 52, 86)', '展示样式丢失');
                assert(!snapshot.iframe.contentWindow.performance.getEntriesByType('resource').some(entry => /^https?:/i.test(entry.name)), '静态副本联网');
            } finally { snapshot.destroy(); }
        });
        await test('HTML 脱敏仍只改文本节点，不改属性与 style 内容', async () => {
            const output = await maskHtmlString('<body data-name="秘密"><style>.秘密{color:red}</style><b title="秘密">秘密 灯塔</b></body>', { maskWords: ['秘密'], rules: [{ from: '灯塔', to: { kind: 'text', value: '某地' } }] });
            await transformHtmlOffline(output, doc => { assert(doc.body.dataset.name === '秘密' && doc.querySelector('b').title === '秘密', '属性被改'); assert(doc.querySelector('b').textContent === '███ 某地' && doc.querySelector('style').textContent.includes('.秘密'), '文本或样式处理错误'); });
        });
        await test('真实 PNG 脱敏像素等于预期文字，裁剪尺寸与颜色精确', async () => {
            const wrap = text => `<html><body style="margin:0;background:white;color:black;font:24px/40px serif"><div style="height:40px">${text}</div><div style="height:80px;background:#12abcd"></div></body></html>`;
            const image = await pixels(await exportRenderedHtml(wrap('灯塔 秘密'), { width: 300, maskWords: ['秘密'], rules: [{ from: '灯塔', to: { kind: 'text', value: '某地' } }] }));
            const expected = await pixels(await exportRenderedHtml(wrap('某地 ███'), { width: 300 }));
            assert(image.width === expected.width && image.height === expected.height && image.data.every((value, i) => value === expected.data[i]), 'PNG 中仍有原词或替换不一致');
            const cropped = await pixels(await exportRenderedHtml(wrap('灯塔 秘密'), { width: 300, maskWords: ['秘密'], crop: { x: 10, y: 45, w: 90, h: 30 } }));
            assert(cropped.width === 90 && cropped.height === 30, '裁剪尺寸错误');
            assert(cropped.data.every((value, i) => value === [18, 171, 205, 255][i % 4]), '裁剪坐标或像素错误');
        });
        await test('错误裁剪/图片/超大文档拒绝，失败与并行静态副本均清理', async () => {
            await rejects(() => exportRenderedHtml('<body>虚构</body>', { width: 300, crop: { x: -1, y: 0, w: 10, h: 10 } }));
            await rejects(() => renderStatic('<body style="height:17000px">过长</body>'));
            await rejects(() => renderStatic('<body><img src="data:image/png;base64,YmFk"></body>'));
            const snapshots = await Promise.all([renderStatic('<body>甲</body>'), renderStatic('<body>乙</body>')]);
            assert(snapshots[0].iframe !== snapshots[1].iframe, '复用了同一静态 iframe'); snapshots.forEach(snapshot => snapshot.destroy());
        });
        await test('手机与游戏样本都能导出初始静态 PNG，导出不接受联网权限', async () => {
            for (const [html, width] of [[PHONE_HTML, 390], [GAME_HTML, 768]]) {
                const result = await pixels(await exportRenderedHtml(html, { width, maskWords: ['秘密'], allowNetwork: true }));
                assert(result.width === width && result.height > 200, '合成样本 PNG 尺寸错误');
                let visible = 0; for (let i = 3; i < result.data.length; i += 4) if (result.data[i]) visible++;
                assert(visible > 10000, '合成样本截图为空');
            }
        });
    } finally {
        root.remove();
        await test('宿主聊天/候选/设置不变，全部新增解析/渲染节点已清理', () => {
            assert(before === hostState(), '宿主状态改变');
            const leaked = [...document.querySelectorAll(selector)].filter(node => !baseline.has(node));
            assert(!leaked.length, `T44a 临时节点残留 ${leaked.length} 个`);
        });
    }
    console.table(results); const failed = results.filter(result => !result.passed);
    if (failed.length) throw new Error(`T44a 浏览器自测 ${failed.length} 项失败：${failed.map(item => item.name).join('、')}`);
    return results;
}
