// ST Reader — AGPL-3.0
import { createSandbox, renderStatic, exportRenderedHtml } from './htmlRenderer.js';
import { transformHtmlOffline } from './codeTransforms.js';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function rejects(run, pattern) { try { await run(); } catch (error) { if (!pattern || pattern.test(error.message)) return; throw error; } throw new Error('预期拒绝但成功'); }
async function pixels(blob) {
    const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}
export async function testHtmlSnapshotBrowser() {
    const results = [], test = async (name, run) => { try { await run(); results.push({ name: `I032 ${name}`, passed: true }); } catch (error) { results.push({ name: `I032 ${name}`, passed: false, error: error.message }); console.error(name, error); } };
    const selector = '[data-stcr-html-frame],[data-stcr-html-static],[data-stcr-parse-frame]';
    const baseline = new Set(document.querySelectorAll(selector)), ctx = SillyTavern.getContext();
    const hostBefore = JSON.stringify([ctx.chat, ctx.chatMetadata, ctx.extensionSettings]);
    const root = document.createElement('div'); root.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:400px;overflow:auto;z-index:2147483646'; document.body.append(root);
    const localImage = document.createElement('canvas'); localImage.width = localImage.height = 4;
    localImage.getContext('2d').fillStyle = '#12abcd'; localImage.getContext('2d').fillRect(0, 0, 4, 4);
    const imageBlob = await new Promise(resolve => localImage.toBlob(resolve));
    async function interactive(html) {
        const marker = crypto.randomUUID(); let source, listener, expiry;
        const loaded = new Promise((resolve, reject) => {
            expiry = setTimeout(() => reject(new Error('合成交互样本超时')), 10000);
            listener = event => { if (event.data?.snapshotFixture === marker) { source = event.source; clearTimeout(expiry); window.removeEventListener('message', listener); resolve(); } };
            window.addEventListener('message', listener);
        });
        const probe = `<script>addEventListener('message',e=>{if(e.source!==parent.parent)return;if(e.data==='ending-b')document.getElementById('ending').textContent='结局乙';});addEventListener('load',()=>setTimeout(()=>{parent.parent.postMessage({snapshotFixture:${JSON.stringify(marker)}},'*')},50));</script>`;
        const handle = createSandbox(html + probe, { width: 300 }); root.append(handle.iframe);
        try { await handle.ready; await loaded; return { handle, source }; }
        catch (error) { handle.destroy(); throw error; }
        finally { clearTimeout(expiry); window.removeEventListener('message', listener); }
    }
    try {
        await test('两个游戏结局分别进入快照和真实 PNG，活页面不被静态导出替换', async () => {
            const { handle, source } = await interactive('<body style="margin:0;background:white;font:20px serif"><p id="ending">结局甲</p></body>');
            try {
                const a = await handle.snapshot(); source.postMessage('ending-b', '*'); await delay(60); const b = await handle.snapshot();
                assert(a.includes('结局甲') && !a.includes('结局乙') && b.includes('结局乙'), '没有取当前 DOM');
                const pa = await pixels(await exportRenderedHtml(a, { width: 300 })), pb = await pixels(await exportRenderedHtml(b, { width: 300 }));
                assert(pa.width === 600 && pb.width === 600 && pa.data.some((v, i) => v !== pb.data[i]), '两种结局 PNG 没有变化');
                assert((await handle.snapshot()).includes('结局乙') && handle.iframe.contentDocument === null, '导出重置进度或破坏隔离');
            } finally { handle.destroy(); }
        });
        await test('表单当前值先变成文本再脱敏，密码不带出，checked/details 状态保留', async () => {
            const { handle } = await interactive('<body><input id="name" value="旧值"><textarea id="note">旧值</textarea><input type="password" value="绝不能带出"><input id="check" type="checkbox"><details id="more"><summary>展开</summary>正文</details><script>document.getElementById("name").value="虚构秘密";document.getElementById("note").value="虚构秘密";document.getElementById("check").checked=true;document.getElementById("more").open=true;</script></body>');
            try {
                const html = await handle.snapshot();
                assert(!html.includes('绝不能带出'), '密码被带出');
                const { maskHtmlString } = await import('./codeTransforms.js');
                await transformHtmlOffline(await maskHtmlString(html, { maskWords: ['虚构秘密'] }), doc => {
                    assert(!doc.querySelector('#name').textContent.includes('秘密') && !doc.querySelector('#note').textContent.includes('秘密'), '当前表单值绕过脱敏');
                    assert(doc.querySelector('#check').checked && doc.querySelector('#more').open, '表单状态丢失');
                });
            } finally { handle.destroy(); }
        });
        await test('滚动区还原到当前可视位置，实际 PNG 显示下半部颜色', async () => {
            const { handle, source } = await interactive('<body style="margin:0"><div id="scroll" style="width:100px;height:100px;overflow:auto"><div style="height:100px;background:red"></div><div style="height:100px;background:blue"></div></div><script>addEventListener("message",e=>{if(e.source===parent.parent&&e.data==="scroll-down")document.getElementById("scroll").scrollTop=100;});</script></body>');
            try {
                // 模拟用户在页面加载完成后滚动，不依赖解析期间尚会变化的 iframe 高度。
                source.postMessage('scroll-down', '*'); await delay(60);
                const html = await handle.snapshot(), snapshot = await renderStatic(html, { width: 300 });
                try { const node = snapshot.document.getElementById('scroll'); assert(node.scrollTop === 100, `滚动位置未还原：${JSON.stringify({ top: node.scrollTop, hint: node.getAttribute('data-stcr-shot-scroll'), height: node.clientHeight, content: node.scrollHeight })}`); } finally { snapshot.destroy(); }
                const image = await pixels(await exportRenderedHtml(html, { width: 300, scale: 1 }));
                const i = (40 * image.width + 40) * 4;
                assert(image.data[i] === 0 && image.data[i + 2] === 255, `PNG 截回顶部或滚动裁剪失效：${[...image.data.slice(i, i + 4)]}`);
            } finally { handle.destroy(); }
        });
        await test('canvas 像素与 CSSOM 动态样式进入静态截图', async () => {
            const { handle } = await interactive('<head><style id="css">p{color:red}</style></head><body style="margin:0"><canvas id="drawing" width="40" height="40"></canvas><p>动态样式</p><script>const c=document.getElementById("drawing").getContext("2d");c.fillStyle="#12abcd";c.fillRect(0,0,40,40);document.getElementById("css").sheet.insertRule("p{color:blue}",1);</script></body>');
            try {
                const html = await handle.snapshot(); assert(html.includes('data:image/png') && html.includes('blue'), '画布或动态 CSS 丢失');
                const image = await pixels(await exportRenderedHtml(html, { width: 300, scale: 1 })), i = (20 * image.width + 20) * 4;
                assert(image.data[i] === 18 && image.data[i + 1] === 171 && image.data[i + 2] === 205, '画布像素丢失');
            } finally { handle.destroy(); }
        });
        await test('快照不改活文档属性/表单/滚动，无法支持的 Shadow DOM 明确拒绝', async () => {
            const marker = crypto.randomUUID();
            const { handle, source } = await interactive(`<body><input value="合成值"><script>let changes=0;addEventListener('load',()=>new MutationObserver(()=>changes++).observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true}));addEventListener('message',e=>{if(e.source===parent.parent&&e.data==='audit')parent.parent.postMessage({auditMarker:${JSON.stringify(marker)},changes},'*')});</script></body>`);
            let timer, listener;
            try {
                await handle.snapshot();
                const result = new Promise((resolve, reject) => {
                    timer = setTimeout(() => reject(new Error('活 DOM 核对超时')), 2000);
                    listener = e => { if (e.source === source && e.data?.auditMarker === marker) resolve(e.data.changes); };
                    window.addEventListener('message', listener);
                });
                source.postMessage('audit', '*'); assert(await result === 0, '快照序列化改了活 DOM');
            } finally { clearTimeout(timer); window.removeEventListener('message', listener); handle.destroy(); }
            const shadow = await interactive('<body><div id="shadow"></div><script>document.getElementById("shadow").attachShadow({mode:"open"}).innerHTML="<b>合成阴影内容</b>";</script></body>');
            try { await rejects(() => shadow.handle.snapshot(), /Shadow DOM/); } finally { shadow.handle.destroy(); }
        });
        await test('已脱敏快照不发生 B→C 二次串换，仍允许追加屏蔽', async () => {
            const html = '<body style="margin:0;background:white">B 秘密</body>';
            const actual = await pixels(await exportRenderedHtml(html, { width: 300, alreadyMasked: true, maskWords: ['秘密'], rules: [{ from: 'B', to: { kind: 'text', value: 'C' } }] }));
            const expected = await pixels(await exportRenderedHtml('<body style="margin:0;background:white">B ███</body>', { width: 300 }));
            assert(actual.data.length === expected.data.length && actual.data.every((v, i) => v === expected.data[i]), '已替换文本又变了或屏蔽未执行');
        });
        await test('超量快照拒绝；update/destroy/取消期间请求结束且不泄漏', async () => {
            const { handle } = await interactive('<body>合成生命周期</body>');
            const task = handle.snapshot(); handle.update('<body>已重建</body>'); await rejects(() => task, /重建/); await handle.ready;
            const abort = new AbortController(); abort.abort(); await rejects(() => handle.snapshot({ signal: abort.signal }));
            const pending = handle.snapshot(); handle.destroy(); await rejects(() => pending, /销毁/);
            await rejects(() => handle.snapshot(), /销毁/);
            const big = createSandbox('<body><!--' + '甲'.repeat(8_000_001) + '--></body>'); root.append(big.iframe);
            try { await big.ready; await rejects(() => big.snapshot(), /800 万/); } finally { big.destroy(); }
        });
        await test('错来源/错 token 不抢占快照；未挂载超时与主动取消可以立即结束', async () => {
            const { handle } = await interactive('<body>应返回的当前画面</body>');
            const uuid = crypto.randomUUID, requestId = 'stcr-test-request', token = handle.iframe.srcdoc.match(/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}/gi).at(-1);
            try {
                crypto.randomUUID = () => requestId;
                const task = handle.snapshot(); crypto.randomUUID = uuid;
                const response = { type: 'stcr:html-snapshot-result', token, requestId, html: 'BAD' };
                window.dispatchEvent(new MessageEvent('message', { source: window, data: response }));
                window.dispatchEvent(new MessageEvent('message', { source: handle.iframe.contentWindow, data: { ...response, token: 'wrong' } }));
                assert((await task).includes('应返回的当前画面'), '伪造消息抢占了响应');
            } finally { crypto.randomUUID = uuid; handle.destroy(); }
            const detached = createSandbox('<body>未挂载</body>');
            try {
                await rejects(() => detached.snapshot({ timeoutMs: 20 }), /超时/);
                const controller = new AbortController(), pending = detached.snapshot({ signal: controller.signal });
                controller.abort(new Error('合成取消')); await rejects(() => pending, /取消/);
            } finally { detached.destroy(); }
        });
        await test('默认内嵌外链 CSS/相对图片，重复资源只读一次并进入 PNG', async () => {
            const calls = [], warnings = [];
            const fetchFn = async (url, opts) => {
                calls.push(url); assert(opts.method === 'GET' && opts.credentials === 'omit' && opts.mode === 'cors', '不是无凭据 CORS 只读请求');
                if (url.endsWith('/main.css')) return new Response('/* @import "never.css"; url(never.png) */ @import "nested.css"; body{margin:0} .picture{width:40px;height:40px;background:url(../tile.png)}', { headers: { 'content-type': 'text/css' } });
                if (url.endsWith('/nested.css')) return new Response('.label{color:rgb(18,52,86)}', { headers: { 'content-type': 'text/css' } });
                if (url.endsWith('/tile.png')) return new Response(imageBlob, { headers: { 'content-type': 'image/png' } });
                throw new Error('未知合成资源');
            };
            const html = '<link rel="stylesheet" href="https://stcr-assets.invalid/css/main.css"><body><div class="picture"></div><img width="40" height="40" src="https://stcr-assets.invalid/tile.png"><p class="label">外链样式</p></body>';
            const view = await renderStatic(html, { width: 300, fetchFn, onWarning: x => warnings.push(x) });
            try {
                assert(calls.length === 3 && !warnings.length, '相对地址、缓存或 CSS 递归失败');
                assert(view.iframe.contentWindow.getComputedStyle(view.document.querySelector('.label')).color === 'rgb(18, 52, 86)', '外链 CSS 未生效');
                assert(view.document.images[0].src.startsWith('data:'), '图片未内嵌');
                assert(!view.iframe.contentWindow.performance.getEntriesByType('resource').some(x => /^https?:/.test(x.name)), '最终静态副本还在联网');
            } finally { view.destroy(); }
            const png = await pixels(await exportRenderedHtml(html, { width: 300, scale: 1, fetchFn })), i = (20 * png.width + 20) * 4;
            assert(png.data[i] === 18 && png.data[i + 1] === 171 && png.data[i + 2] === 205, '外链背景未进入实际 PNG');
        });
        await test('CORS/资源错误给出警告并降级；显式断网不调用读取器', async () => {
            let calls = 0; const warnings = [], fetchFn = async () => { calls++; throw new TypeError('模拟 CORS 拒绝'); };
            const html = '<link rel="stylesheet" href="https://stcr-assets.invalid/denied.css"><body><img src="https://stcr-assets.invalid/denied.png"><p>保留正文</p></body>';
            const view = await renderStatic(html, { fetchFn, onWarning: x => warnings.push(x) });
            try { assert(calls === 2 && warnings.length === 2 && view.document.body.textContent.includes('保留正文'), '失败处理不完整'); } finally { view.destroy(); }
            calls = 0; const offline = await renderStatic(html, { allowNetwork: false, fetchFn });
            try { assert(calls === 0 && !offline.document.querySelector('img,link'), '断网仍读取资源'); } finally { offline.destroy(); }
        });
        await test('外链字体内嵌并进入真实 PNG，与相同字体 data 版本像素一致', async () => {
            const { readNyFontBlobs, toDataUrl } = await import('./cardFonts.js');
            const entries = ctx.extensionSettings['Ny-font-manager']?.importedFonts?.filter(x => x.kind === 'file') ?? [];
            assert(entries.length, '先按 T14 在开发浏览器导入已有 Ny 合成字体');
            const [font] = await readNyFontBlobs(entries.slice(0, 1)); assert(font.blob instanceof Blob, '开发字体缺失');
            let calls = 0;
            const wrap = url => `<style>@font-face{font-family:I032Fixture;src:url("${url}")}body{margin:0;background:white;font:26px I032Fixture}</style><body>WWiii0123456789</body>`;
            const fetchFn = async () => { calls++; return new Response(font.blob, { headers: { 'content-type': 'font/ttf' } }); };
            const image = await pixels(await exportRenderedHtml(wrap('https://stcr-assets.invalid/font.ttf'), { width: 300, fetchFn }));
            const expected = await pixels(await exportRenderedHtml(wrap(await toDataUrl(font.blob)), { width: 300 }));
            assert(calls === 1 && image.data.length === expected.data.length && image.data.every((v, i) => v === expected.data[i]), '外链字体没有按原字体进入 PNG');
        });
        await test('资源大小上限、脚本/事件属性清除、取消均清理临时文档', async () => {
            const warnings = [], fetchFn = async () => new Response('', { headers: { 'content-length': '5000001', 'content-type': 'image/png' } });
            const view = await renderStatic('<body onload="bad()"><script>bad()</script><img src="https://stcr-assets.invalid/large.png" onerror="bad()"></body>', { fetchFn, onWarning: x => warnings.push(x) });
            try { assert(warnings.some(x => x.includes('5 MB')) && !view.document.querySelector('script,[onload],[onerror],img'), '大小限制或静态清洗失效'); } finally { view.destroy(); }
            const controller = new AbortController(); controller.abort();
            await rejects(() => renderStatic('<img src="https://stcr-assets.invalid/a.png">', { signal: controller.signal, fetchFn }));
        });
    } finally {
        root.remove();
        await test('宿主聊天/候选/设置未改，新增 iframe 均已释放', () => {
            assert(hostBefore === JSON.stringify([ctx.chat, ctx.chatMetadata, ctx.extensionSettings]), '宿主状态被改变');
            assert(![...document.querySelectorAll(selector)].some(node => !baseline.has(node)), '临时 DOM 泄漏');
        });
    }
    console.table(results);
    if (results.some(result => !result.passed)) throw new Error('I032 当前画面/资源截图自测失败：' + results.filter(result => !result.passed).map(result => result.name).join('；'));
    return results;
}
