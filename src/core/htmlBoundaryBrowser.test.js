// ST Reader — AGPL-3.0
import { createSandbox } from './htmlRenderer.js';
import { mountBoundaryExample } from './htmlBoundaryDemo.js';
import { MIXED_HTML, MULTI_HTML } from '../../dev/fixtures/html.mjs';
const assert = (value, message) => { if (!value) throw new Error(message); };

// 只向自有合成沙箱注入观测脚本；不加同源权限，从两层文档各自读取 computed style。
async function inspectBackground(root, html, allowNetwork) {
    const marker = crypto.randomUUID(), values = {};
    let listener, timer;
    const reported = new Promise((resolve, reject) => {
        listener = event => {
            if (event.origin !== 'null' || event.data?.marker !== marker) return;
            values[event.data.layer] = event.data;
            if (values.shell && values.content) resolve(values);
        };
        window.addEventListener('message', listener);
        timer = setTimeout(() => reject(new Error('透明背景观测超时')), 8000);
    });
    reported.catch(() => {});
    const probe = parent => `<script>addEventListener('load',()=>{const frame=document.querySelector('iframe');${parent}.postMessage({marker:${JSON.stringify(marker)},layer:${parent === 'parent' ? "'shell'" : "'content'"},html:getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor,frame:frame?getComputedStyle(frame).backgroundColor:null,allow:frame?.getAttribute('allowtransparency')},'*')})</script>`;
    const handle = createSandbox(html + probe('parent.parent'), { allowNetwork });
    handle.iframe.srcdoc = handle.iframe.srcdoc.replace('</body></html>', `${probe('parent')}</body></html>`);
    root.append(handle.iframe);
    try {
        await handle.ready; await reported;
        assert(handle.iframe.getAttribute('sandbox') === 'allow-scripts' && handle.iframe.contentDocument === null, '沙箱获得宿主同源权限');
        assert(handle.iframe.getAttribute('allowtransparency') === 'true' && getComputedStyle(handle.iframe).backgroundColor === 'rgba(0, 0, 0, 0)', '外层 iframe 不透明');
        for (const key of ['html', 'body', 'frame']) assert(values.shell[key] === 'rgba(0, 0, 0, 0)', `外壳 ${key} 不透明`);
        assert(values.shell.allow === 'true', '内容 iframe 缺少 allowtransparency');
        return values.content;
    } finally { clearTimeout(timer); window.removeEventListener('message', listener); handle.destroy(); }
}

export async function testHtmlBoundaryBrowser() {
    const results = [], root = document.createElement('div');
    const context = SillyTavern.getContext();
    const hostState = () => JSON.stringify({ chat: context.chat, metadata: context.chatMetadata, settings: context.extensionSettings, character: context.characterId, group: context.groupId });
    const before = hostState(), baseline = new Set(document.querySelectorAll('[data-stcr-html-frame]'));
    root.style.cssText = 'position:fixed;left:-20000px;top:0;width:700px'; document.body.append(root);
    const test = async (name, run) => { await run(); results.push({ name: `T51 ${name}`, passed: true }); };
    try {
        await test('散文按格式化器留在 iframe 外，一段与多段均逐块独立渲染', async () => {
            for (const [raw, expected] of [[MIXED_HTML, 1], [MULTI_HTML, 2]]) {
                const mounted = await mountBoundaryExample(root, raw);
                try {
                    const prose = [...root.querySelectorAll('[data-stcr-boundary-prose]')];
                    assert(mounted.handles.length === expected && prose.length === expected + 1, 'HTML/散文分段数错误');
                    assert(prose[0].querySelector('q') && prose.every(el => !el.querySelector('iframe')), '场景标题未按 ST 引号排版或散文进入 iframe');
                    const snapshots = await Promise.all(mounted.handles.map(handle => handle.snapshot()));
                    for (const el of prose) for (const snapshot of snapshots) assert(!snapshot.includes(el.textContent.trim()), '散文泄漏到沙箱内容');
                    if (expected === 2) assert(snapshots[0].includes('纸月观测站') && !snapshots[0].includes('蓝邮局') && snapshots[1].includes('蓝邮局') && !snapshots[1].includes('纸月观测站'), '两段网页互相混入');
                } finally { mounted.destroy(); }
            }
        });
        await test('默认断网与允许外链模式下，两层 html/body 与 iframe 都透明', async () => {
            for (const allowNetwork of [false, true]) {
                const content = await inspectBackground(root, '<body><p>虚构透明页面</p></body>', allowNetwork);
                assert(content.html === 'rgba(0, 0, 0, 0)' && content.body === 'rgba(0, 0, 0, 0)', '内容默认底色不透明');
            }
        });
        await test('内容的 body 样式、行内底色与低特异性样式都能覆盖默认透明', async () => {
            for (const html of ['<style>body{background:#123456}</style><body>虚构底色</body>', '<body style="background:#123456">虚构底色</body>', '<style>*{background:#123456}</style><body>虚构底色</body>', '<style>@layer content{body{background:#123456}}</style><body>虚构分层底色</body>']) {
                for (const allowNetwork of [false, true]) {
                    const content = await inspectBackground(root, html, allowNetwork);
                    assert(content.body === 'rgb(18, 52, 86)', '内容自己的 body 底色被覆盖');
                }
            }
        });
    } finally {
        root.remove();
        assert(hostState() === before, 'T51 改变了宿主状态');
        assert([...document.querySelectorAll('[data-stcr-html-frame]')].every(node => baseline.has(node)), 'T51 遗留了沙箱节点');
    }
    results.push({ name: 'T51 宿主聊天/候选/设置不变，新增沙箱全部清理', passed: true });
    return results;
}
