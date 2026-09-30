// ST Reader — AGPL-3.0
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { assertDevPath, DEV_ROOT, PROJECT_ROOT, writeDevFile } from './fixtures/paths.mjs';

// 使用本机已有 Chrome/Edge 和 Node 内置 CDP WebSocket；不装依赖，不访问真实 ST。
const origin = 'http://localhost:8100';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => fs.existsSync(file));
let browser, socket, profile;
const calls = new Map(), listeners = new Map(); let sequence = 0;
function send(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = ++sequence, timer = setTimeout(() => { calls.delete(id); reject(new Error(`${method} 超时`)); }, 120000);
        calls.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
}
async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
}
try {
    if (!chromePath) throw new Error('请使用本机已安装的 Chrome 或 Edge；此脚本不会下载浏览器。');
    const fixture = JSON.parse(fs.readFileSync(assertDevPath(path.join(DEV_ROOT, 'fixtures/performance.json'))));
    if (fixture.bytes < 50 * 1048576) throw new Error('先双击 generate-performance.cmd 生成大文件');
    const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(5000) }); if (!response.ok) throw new Error('先启动开发实例');
    const tempRoot = path.join(PROJECT_ROOT, '.tmp');
    if (fs.lstatSync(tempRoot).isSymbolicLink()) throw new Error('.tmp 不能是联接');
    profile = fs.mkdtempSync(path.join(tempRoot, 't30-browser-'));
    browser = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-crash-reporter', '--disable-breakpad', '--disable-features=OptimizationHints,MediaRouter', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--enable-precise-memory-info', '--js-flags=--expose-gc', '--window-size=1440,1000', `--user-data-dir=${profile}`, `--disk-cache-dir=${path.join(profile, 'cache')}`, 'about:blank'],
        { cwd: PROJECT_ROOT, windowsHide: true, stdio: 'ignore', env: { ...process.env, TEMP: profile, TMP: profile, TMPDIR: profile, LOCALAPPDATA: profile, APPDATA: profile } });
    browser.on('error', error => console.error(error.message));
    const active = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; !fs.existsSync(active); i++) { if (i > 100) throw new Error('浏览器未启动'); await delay(100); }
    const port = fs.readFileSync(active, 'utf8').split('\n')[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
    socket = new WebSocket(targets.find(item => item.type === 'page').webSocketDebuggerUrl);
    await once(socket, 'open', { signal: AbortSignal.timeout(10000) });
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id) { const call = calls.get(message.id); if (!call) return; clearTimeout(call.timer); calls.delete(message.id); message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result); }
        else listeners.get(message.method)?.(message.params);
    });
    const blocked = [], requests = [];
    listeners.set('Fetch.requestPaused', async event => {
        const url = new URL(event.request.url);
        const remote = /^https?:$/.test(url.protocol) && url.origin !== origin;
        const forbidden = /^\/api\/chats\/(?:save|rename|delete|import|group\/(?:save|delete|import))(?:\/|$)/i.test(url.pathname);
        if (remote || forbidden) { blocked.push({ url: url.origin + url.pathname, reason: forbidden ? 'D02' : '外网' }); await send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' }); }
        else { requests.push(url.pathname); await send('Fetch.continueRequest', { requestId: event.requestId }); }
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url: origin });
    for (let i = 0; ; i++) {
        if (await evaluate('Boolean(window.stcrSelfTest && document.querySelector("#stcr_topbar_button"))')) break;
        if (i > 120) throw new Error('阅读器初始化超时'); await delay(250);
    }
    await evaluate('document.fonts.ready.then(()=>true)');
    // 新建浏览器没有人类浏览器的 IndexedDB；从 .dev 的合成字体恢复相同 Ny 配置后再计时。
    const fontPath = assertDevPath(path.join(DEV_ROOT, 'fixtures/fonts/JetBrainsMono.ttf'));
    if (fs.existsSync(fontPath)) {
        const font = fs.readFileSync(fontPath).toString('base64');
        await evaluate(`(async()=>{
            const entries=SillyTavern.getContext().extensionSettings['Ny-font-manager']?.importedFonts.filter(x=>x.kind==='file' && x.family.startsWith('JetBrainsMono')) ?? [];
            if(!entries.length) return;
            const blob=new Blob([Uint8Array.from(atob(${JSON.stringify(font)}),x=>x.charCodeAt(0))]);
            await new Promise((resolve,reject)=>{const r=indexedDB.open('nytw-fonts',1);r.onupgradeneeded=()=>r.result.createObjectStore('fonts',{keyPath:'id'});r.onerror=()=>reject(r.error);r.onsuccess=()=>{const d=r.result,t=d.transaction('fonts','readwrite');entries.forEach(e=>t.objectStore('fonts').put({id:e.id,blob}));t.oncomplete=()=>{d.close();resolve()};t.onerror=()=>reject(t.error)}});
        })()`);
        await send('Page.navigate', { url: `${origin}/?t30Ready=1` });
        await delay(1000);
        for (let i = 0; ; i++) { if (await evaluate('Boolean(window.stcrSelfTest && document.querySelector("#stcr_topbar_button"))')) break; if (i > 120) throw new Error('刷新超时'); await delay(250); }
        await evaluate('document.fonts.ready.then(()=>true)');
    }
    await delay(3000);
    console.log('开发页面已就绪，开始大文件阅读器实测（约 20 秒）…');
    if (process.argv.includes('--profile')) { await send('Profiler.enable'); await send('Profiler.start'); }
    let failure;
    try { await evaluate('window.stcrSelfTest({performance:true})'); } catch (error) { failure = error; }
    const report = await evaluate('window.stcrPerformanceReport');
    if (process.argv.includes('--profile')) {
        const { profile: trace } = await send('Profiler.stop');
        const costs = new Map(), nodes = new Map(trace.nodes.map(node => [node.id, node]));
        trace.samples.forEach((id, index) => { const f = nodes.get(id).callFrame; const key = `${f.functionName || '(anonymous)'} ${f.url}`; costs.set(key, (costs.get(key) ?? 0) + trace.timeDeltas[index]); });
        console.log('采样 CPU（ms）', [...costs].sort((a, b) => b[1] - a[1]).slice(0, 22).map(([name, cost]) => [name, Math.round(cost / 1000)]));
    }
    const output = { date: new Date().toISOString(), fixture, ...report, blocked, requestPaths: [...new Set(requests)], passed: !failure };
    const reportText = JSON.stringify(output, null, 2) + '\n';
    writeDevFile(path.join(DEV_ROOT, 'fixtures/t30-performance-result.json'), reportText);
    writeDevFile(path.join(DEV_ROOT, `fixtures/t30-performance-${output.date.replace(/[:.]/g, '-')}.json`), reportText);
    console.log(JSON.stringify({ ...output, requestPaths: output.requestPaths.filter(item => item.startsWith('/api/')) }, null, 2));
    if (blocked.some(item => item.reason === 'D02')) throw new Error('检测到 D02 请求');
    if (!failure) console.log('全部通过。详细报告：E:\\st-reader\\.dev\\fixtures\\t30-performance-result.json');
    // 可选完整回归只在此独立浏览器进行。
    if (process.argv.includes('--core-browser')) {
        await evaluate(`document.querySelector('.character_select[ch_name="STCR_T11_Mist.png"]')?.click()`);
        await delay(1500);
        const full = await evaluate('window.stcrSelfTest()');
        console.log(`浏览器完整自测通过：${full.length} 项`);
    }
    if (blocked.length) throw new Error(`浏览器发现 ${blocked.length} 次禁用/外网请求，详见报告`);
    if (failure) throw failure;
} catch (error) { console.error(`性能/浏览器测试失败：${error.stack}`); process.exitCode = 1; }
finally {
    if (socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} socket.close(); }
    for (const call of calls.values()) clearTimeout(call.timer);
    if (browser && browser.exitCode === null) { browser.kill(); await Promise.race([once(browser, 'exit'), delay(3000)]); }
    await delay(2000);
    if (profile) {
        const absolute = path.resolve(profile), intended = path.join(PROJECT_ROOT, '.tmp');
        if (path.dirname(absolute) !== intended || !path.basename(absolute).startsWith('t30-browser-') || fs.lstatSync(absolute).isSymbolicLink()) throw new Error('临时目录越界，拒绝清理');
        fs.rmSync(absolute, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    }
}
