// ST Reader — AGPL-3.0
import { foreignExtensionSettings } from './hostSettings.js';
import { createSandbox } from './htmlRenderer.js';
import { SCENE_HTML } from '../../dev/fixtures/html.mjs';
const assert = (value, message) => { if (!value) throw new Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const hostState = () => { const c = SillyTavern.getContext(); return JSON.stringify({ chat: c.chat, metadata: c.chatMetadata, settings: foreignExtensionSettings(c.extensionSettings), character: c.characterId, group: c.groupId }); };

// 合成内容自行回报几何量；不加 allow-same-origin、不从宿主跨源读取 DOM。
function observe(root, html, options = {}) {
    const marker = crypto.randomUUID(), samples = [], heights = [];
    const listener = event => { if (event.origin === 'null' && event.data?.marker === marker) samples.push(event.data); };
    window.addEventListener('message', listener);
    const probe = `<script>addEventListener('message',event=>{if(event.source===parent.parent&&event.data?.marker===${JSON.stringify(marker)}&&event.data.action==='height')document.querySelector('.box').style.height=event.data.value+'px'});setInterval(()=>{const h=document.documentElement,b=document.body,r=b.getBoundingClientRect();parent.parent.postMessage({marker:${JSON.stringify(marker)},time:performance.now(),height:innerHeight,scroll:h.scrollHeight,rootBottom:h.getBoundingClientRect().bottom+scrollY,bodyBottom:r.bottom+scrollY,tail:document.querySelector('[data-height-tail],footer')?.getBoundingClientRect().bottom+scrollY,scroller:document.querySelector('[data-inner-scroll]')?.clientHeight,scrollerContent:document.querySelector('[data-inner-scroll]')?.scrollHeight},'*')},60)</script>`;
    const handle = createSandbox(html + probe, { ...options, onHeight: height => heights.push(height) });
    root.append(handle.iframe);
    return { handle, samples, heights,
        // 跨源 WindowProxy 只用于 postMessage；不读取内容 DOM，且仅此合成探针接受命令。
        setHeight(value) { handle.iframe.contentWindow[0].postMessage({ marker, action: 'height', value }, '*'); },
        destroy() { window.removeEventListener('message', listener); handle.destroy(); } };
}
async function stable(observed, label) {
    await observed.handle.ready; await delay(400);
    const offset = observed.samples.length, updates = observed.heights.length;
    const started = performance.now();
    // 窗口调整后 Chrome 会短暂节流跨源 iframe 定时器；仍需完整观察窗口和至少三个真实样本。
    while (performance.now() - started < 1300 || observed.samples.length - offset < 3) {
        assert(performance.now() - started < 6500, `${label} 没有足够的沙箱观测样本`); await delay(100);
    }
    const samples = observed.samples.slice(offset);
    assert(samples.length >= 3, `${label} 没有足够的沙箱观测样本`);
    assert(new Set(samples.map(sample => sample.height)).size === 1 && observed.heights.length === updates, `${label} 高度仍在跳动：${observed.heights.slice(-12)}`);
    assert(samples.every(sample => sample.scroll <= sample.height && sample.rootBottom <= sample.height + 1 && (!Number.isFinite(sample.tail) || sample.tail <= sample.height + 1)), `${label} 正文尾部超出视口或仍有根滚动溢出`);
    return { height: samples.at(-1).height, updates: observed.heights.length, samples: samples.length };
}

export async function testHtmlHeightBrowser() {
    const root = document.createElement('div'), before = hostState(), baseline = new Set(document.querySelectorAll('[data-stcr-html-frame]'));
    const results = [], measurements = [];
    root.style.cssText = 'position:fixed;left:0;top:30px;z-index:2147483646;width:1200px;pointer-events:none'; document.body.append(root);
    const test = async (name, run) => { try { await run(); results.push({ name: `I041 ${name}`, passed: true }); } catch (error) { results.push({ name: `I041 ${name}`, passed: false, error: error.message }); } };
    try {
        await test('纸月样本三种宽度、断网与允许外链均稳定，无竖向溢出', async () => {
            for (const allowNetwork of [false, true]) for (const width of [390, 768, 1200]) {
                const item = observe(root, SCENE_HTML, { width, allowNetwork });
                try { measurements.push({ width, allowNetwork, ...await stable(item, `纸月 ${width}`) }); }
                finally { item.destroy(); }
            }
        });
        await test('收起后重新展开能缩短再增高，外边距与边框均保留', async () => {
            // 先验证一个状态稳定，再命令合成文档改变高度，避免定时器节流造成测试阶段交叠。
            const html = '<style>body{margin:8px;border:3px solid transparent}.box{height:700px;margin:19px 0 27px}footer{height:17px}</style><div class="box"></div><footer data-height-tail>虚构尾声</footer>';
            const item = observe(root, html);
            try {
                const large = await stable(item, '初始展开'); item.setHeight(120);
                const small = await stable(item, '收起'); item.setHeight(850);
                const grown = await stable(item, '再次展开');
                assert(large.height - small.height > 500 && grown.height - small.height > 650, '高度被锁定，不能按交互内容伸缩');
                measurements.push({ dynamic: [large.height, small.height, grown.height] });
            } finally { item.destroy(); }
        });
        await test('绝对定位溢出可完整显示，内容自己的内部滚动区保持限高', async () => {
            for (const html of [
                '<style>body{margin:8px;height:20px;border:2px solid transparent}aside{position:absolute;top:380px;height:95px}</style><aside data-height-tail>虚构悬浮尾声</aside>',
                '<style>body{margin:8px}[data-inner-scroll]{height:120px;overflow:auto}article{height:900px}</style><div data-inner-scroll><article>虚构滚动内容</article></div><footer data-height-tail>虚构尾声</footer>',
            ]) {
                const item = observe(root, html);
                try {
                    const result = await stable(item, '溢出/内滚动');
                    if (html.includes('data-inner-scroll')) {
                        const sample = item.samples.at(-1); assert(sample.scroller === 120 && sample.scrollerContent >= 900 && result.height < 300, '内滚动被错误展开');
                    } else assert(result.height >= 475, '绝对定位内容被裁掉');
                } finally { item.destroy(); }
            }
        });
        await test('update 切宽与父层等比缩放后稳定，重建不沿用旧高度', async () => {
            const item = observe(root, SCENE_HTML, { width: 390 });
            try {
                await stable(item, '窄版'); const oldHeight = parseInt(item.handle.iframe.style.height);
                // update 重建为短页并改变排版宽；模拟 T52 外层等比缩放，不修改 UI。
                root.style.transformOrigin = 'top left'; root.style.transform = 'scale(.81)';
                const content = '<style>body{margin:0}</style><main style="height:210px">虚构短页</main>';
                await item.handle.update(content, { width: 1200 }); await delay(450);
                assert(parseInt(item.handle.iframe.style.height) === 210 && oldHeight > 210, '重建仍保留旧高度或把缩放计入文档高度');
                await delay(900); assert(parseInt(item.handle.iframe.style.height) === 210, '重建后高度不稳定');
            } finally { root.style.transform = ''; item.destroy(); }
        });
    } finally {
        root.remove();
        results.push({ name: 'I041 宿主状态不变，沙箱与观测监听随测试清理', passed: before === hostState() && [...document.querySelectorAll('[data-stcr-html-frame]')].every(frame => baseline.has(frame)) });
    }
    window.stcrHtmlHeightReport = { viewport: { width: innerWidth, height: innerHeight }, measurements, results };
    console.table(results);
    assert(results.every(result => result.passed), `I041 高度自测失败：${results.filter(result => !result.passed).map(result => result.error ?? result.name).join('；')}`);
    return results;
}
