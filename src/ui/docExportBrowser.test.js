// ST Reader — AGPL-3.0
// T97 / D43 浏览器回归（只在开发实例跑；stcrSelfTest() 全量里带，单跑 stcrSelfTest({core:false,docExport:true})）：
// core 导出：纸舟 / 重楼 / 星灯样本的 TXT 与 HTML（没有 Markdown 符号、默认去掉状态栏、没有脚本和外链、思维链可展开、
// 脱敏后没有角色名、候选三种、取消）；界面：顶栏 ⋮ →"导出为文档…"→ 选网页 + 思维链 → 导出（下载被截住，不落盘），
// 选项记住。跑完恢复 docExport 设置。不读写任何聊天。

import { makeChatKey, openChat } from '../core/chatSource.js';
import { exportDocument } from '../core/documentExport.js';
import { initFormatter } from '../core/formatter.js';
import { isDevInstance } from '../core/readonlyGuard.js';
import { getPrefs, setPrefs } from './prefs.js';
import { closeReader, isReaderOpen, openReader } from './reader.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const PAPER = makeChatKey({ avatarUrl: 'STCR_T11_Paper.png', fileName: 'STCR-02-代码与长文' });
const ASTER = makeChatKey({ avatarUrl: 'STCR_T11_Aster.png', fileName: 'STCR-01-正则与多候选' });
const HEAVY = makeChatKey({ avatarUrl: 'STCR_T11_Mist.png', fileName: 'STCR-96-重楼-240楼' });
const BIG = makeChatKey({ avatarUrl: 'STCR_T11_Mist.png', fileName: 'STCR-90-大文件-1600楼' });
const EVERYTHING = { floorNumbers: true, time: true, user: true, reasoning: true, html: true, details: true, tables: true, code: true, hidden: true };
const MARKDOWN_LINE = /^\s*([*#|>]|[-+] |\d+\. |```)/;
const snapshot = () => {
    const c = SillyTavern.getContext();
    return JSON.stringify({ chat: c.chat, metadata: c.chatMetadata, character: c.characterId, group: c.groupId, id: c.getCurrentChatId() });
};

async function exportOf(chatKey, options, control) {
    const handle = await openChat(chatKey);
    try {
        const result = await exportDocument(handle, options, control);
        const head = new Uint8Array(await result.blob.slice(0, 3).arrayBuffer());
        return { ...result, bom: head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf, text: await result.blob.text() }; // text() 会吃掉 BOM
    } finally { handle.close(); }
}

export async function testDocExportBrowser({ force = false } = {}) {
    if (!isDevInstance(location) && !force) throw new Error('只在开发实例运行');
    if (isReaderOpen()) closeReader();
    await initFormatter();
    const results = [], before = snapshot();
    const check = (name, passed, detail = '') => results.push({ name: `T97 ${name}`, passed: !!passed, detail: String(detail).slice(0, 300) });
    const until = async (test, ms = 8000) => { const end = Date.now() + ms; while (!test() && Date.now() < end) await wait(25); return test(); };
    const keep = getPrefs().docExport;
    const click = HTMLAnchorElement.prototype.click, createUrl = URL.createObjectURL;
    try {
        // ① 纸舟 TXT（默认选项）
        const paper = await exportOf(PAPER, { format: 'txt' });
        const lines = paper.text.split('\r\n');
        check('纸舟 TXT：文件名"角色名 - 聊天名.txt"、带 BOM、CRLF', paper.filename === '纸舟（虚构） - STCR-02-代码与长文.txt' && paper.bom && !/[^\r]\n/.test(paper.text), paper.filename);
        check('纸舟 TXT：每楼"名字："起头、楼之间空一行', lines.filter(line => /^(纸舟（虚构）|测试旅人（虚构）)：$/.test(line)).length === paper.stats.floors && paper.text.includes('\r\n\r\n第 2 楼\r\n纸舟（虚构）：'), `${paper.stats.floors} 楼`);
        const bad = lines.filter(line => MARKDOWN_LINE.test(line));
        check('纸舟 TXT：没有 Markdown 样子的行、没有 <script、代码块默认去掉', !bad.length && !paper.text.includes('<script') && !paper.text.includes('console.log'), bad.slice(0, 3).join(' / '));

        // ② 重楼：状态栏默认去掉；勾上 HTML 块，TXT 里是状态栏的文字
        const heavy = await exportOf(HEAVY, { format: 'txt', to: 9 });
        const heavyHtml = await exportOf(HEAVY, { format: 'txt', to: 9, include: { html: true } });
        check('重楼 TXT：状态栏默认没了，勾上 HTML 块才有它的文字', !heavy.text.includes('雾岛观测') && heavyHtml.text.includes('雾岛观测') && heavyHtml.stats.htmlBlocks === 10, `${heavyHtml.stats.htmlBlocks} 块`);

        // ③ HTML：无脚本、无外链、CSP；思维链与折叠块可展开；HTML 块是禁脚本的静态快照
        const page = await exportOf(HEAVY, { format: 'html', to: 4, include: EVERYTHING });
        const doc = new DOMParser().parseFromString(page.text, 'text/html');
        const frames = [...doc.querySelectorAll('iframe')];
        const external = [...doc.querySelectorAll('[src]'), ...frames.flatMap(frame => [...new DOMParser().parseFromString(frame.getAttribute('srcdoc') ?? '', 'text/html').querySelectorAll('[src], link[href]')])]
            .map(el => el.getAttribute('src') ?? el.getAttribute('href')).filter(src => !/^data:/i.test(src));
        check('重楼 HTML：单文件、meta charset、CSP 禁外部请求', page.filename.endsWith('.html') && !!doc.querySelector('meta[charset="utf-8"]') && /default-src 'none'/.test(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? ''));
        check('重楼 HTML：没有脚本，图片和资源只有 data:', !doc.querySelector('script') && !/<script/i.test(page.text.replace(/srcdoc="[^"]*"/g, '')) && frames.every(frame => !/<script/i.test(frame.getAttribute('srcdoc'))) && !external.length, external.slice(0, 3).join(' '));
        check('重楼 HTML：状态栏是禁脚本的静态快照（sandbox 不带 allow-scripts）', frames.length === 5 && frames.every(frame => frame.getAttribute('sandbox') === '' && /雾岛观测/.test(frame.getAttribute('srcdoc'))), `${frames.length} 个`);
        const aster = await exportOf(ASTER, { format: 'html', include: { reasoning: true } });
        const asterDoc = new DOMParser().parseFromString(aster.text, 'text/html');
        check('星灯 HTML：思维链放在 <details>"思考过程"里', asterDoc.querySelectorAll('details.think > summary').length >= 3 && asterDoc.querySelector('details.think summary').textContent === '思考过程');

        // ④ 候选三种
        const host = await exportOf(ASTER, { format: 'txt', from: 5, to: 5 });
        const mine = await exportOf(ASTER, { format: 'txt', from: 5, to: 5, swipes: 'reader', swipeOf: index => (index === 5 ? 2 : null) });
        const every = await exportOf(ASTER, { format: 'txt', from: 5, to: 5, swipes: 'all' });
        check('候选：酒馆当前 / 阅读器里选的 / 全部（"候选 2/3"标签）', host.text.includes('候选 1/3：朝港口走去') && mine.text.includes('候选 3/3：乘纸舟沿河而行') && !mine.text.includes('朝港口走去')
            && ['候选 1/3', '候选 2/3', '候选 3/3'].every(label => every.text.includes(`\r\n${label}\r\n`)));
        // ⑤ 说话人与脱敏
        const role = await exportOf(ASTER, { format: 'txt', speaker: 'role' });
        const none = await exportOf(ASTER, { format: 'txt', speaker: 'none' });
        check('说话人：user / char、不标', role.text.includes('\r\nuser：\r\n') && role.text.includes('\r\nchar：\r\n') && !/^(user|char|星灯（虚构）|测试旅人（虚构）)：$/m.test(none.text.replace(/\r/g, '')));
        const masked = await exportOf(ASTER, { format: 'html', include: { reasoning: true }, redact: { maskWords: ['星图'], rules: [], autoNames: true } });
        check('脱敏：名字变 user / char、屏蔽词变方块，文件名也换', !masked.text.includes('星灯（虚构）') && !masked.text.includes('测试旅人（虚构）') && !masked.text.includes('星图') && masked.text.includes('██') && masked.filename.startsWith('char - '), masked.filename);
        // ⑥ 系统楼与隐藏楼、范围
        const all = await exportOf(ASTER, { format: 'txt', include: { hidden: true } });
        check('系统楼与隐藏楼默认不导出，勾上才有；范围外的楼不出现', all.stats.floors > host.stats.floors && all.stats.floors === 12 && !host.text.includes('第 7 楼'), `${all.stats.floors} / 默认 ${(await exportOf(ASTER, { format: 'txt' })).stats.floors}`);
        // ⑦ 取消
        const controller = new AbortController();
        let progressed = 0, aborted = null;
        try { await exportOf(BIG, { format: 'txt' }, { signal: controller.signal, onProgress: done => { progressed = done; if (done > 50) controller.abort(); } }); } catch (error) { aborted = error; }
        check('1600 楼：有进度、中途能取消（AbortError，不出文件）', aborted?.name === 'AbortError' && progressed > 50 && progressed < 1600, `${progressed} 楼时取消：${aborted?.name}`);

        // ⑧ 界面：⋮ → 导出为文档… → 网页 + 思维链 → 导出；下载截住
        let captured = null, lastBlob = null;
        URL.createObjectURL = blob => { lastBlob = blob; return createUrl.call(URL, blob); };
        HTMLAnchorElement.prototype.click = function () {
            if (this.hasAttribute('download') && this.closest('#stcr_root')) { captured = { name: this.download, blob: lastBlob }; return; }
            return click.call(this);
        };
        setPrefs({ docExport: undefined });
        await openReader({ chatKey: ASTER });
        const root = document.getElementById('stcr_root');
        await until(() => root.querySelector('#stcr_chat > .mes[mesid]') && !root.querySelector('.stcr-top-more').hidden, 30000);
        if (await until(() => root.querySelector('.stcr-doc'), 800)) root.querySelector('.stcr-doc-close')?.click();
        const more = root.querySelector('.stcr-top-more');
        check('顶栏有 ⋮，打开聊天后才出现', !!more && !more.hidden);
        more.click();
        const item = await until(() => root.querySelector('.stcr-top-menu [data-act="doc-export"]'), 2000) && root.querySelector('.stcr-top-menu [data-act="doc-export"]');
        check('⋮ 菜单里有"导出为文档…"', item?.textContent.includes('导出为文档'));
        item?.click();
        const dialog = await until(() => root.querySelector('.stcr-doc .stcr-dx'), 2000) && root.querySelector('.stcr-doc .stcr-dx');
        const checked = dialog ? [...dialog.querySelectorAll('.stcr-dx-checks input')].map(input => input.checked) : [];
        check('对话框：默认 TXT、整个聊天、酒馆当前、名字；包含只勾楼号与用户楼；脱敏跟随 Aa',
            dialog?.querySelector('[data-format="txt"]').classList.contains('stcr-on') && dialog.querySelector('[data-range="all"]').classList.contains('stcr-on')
            && dialog.querySelector('[data-swipes="host"]').classList.contains('stcr-on') && dialog.querySelector('[data-speaker="name"]').classList.contains('stcr-on')
            && JSON.stringify(checked) === JSON.stringify([true, false, true, false, false, false, false, false, false])
            && dialog.querySelector('.stcr-dx-row:last-child input').checked === !!getPrefs().redact, JSON.stringify(checked));
        dialog?.querySelector('[data-format="html"]').click();
        dialog?.querySelectorAll('.stcr-dx-checks input')[3].click(); // 思维链
        root.querySelector('.stcr-dx-go')?.click();
        await until(() => captured && !root.querySelector('.stcr-doc .stcr-dx'), 20000);
        const blob = captured?.blob ? await captured.blob.text() : '';
        check('导出：下载"星灯（虚构） - STCR-01-正则与多候选.html"，里面有思考过程，对话框关上', captured?.name === '星灯（虚构） - STCR-01-正则与多候选.html' && blob.includes('<details class="think">') && !root.querySelector('.stcr-dx'), captured?.name);
        const saved = getPrefs().docExport;
        check('记住上次的选择（格式、包含项）', saved.format === 'html' && saved.include.reasoning === true, JSON.stringify(saved));
        more.click();
        root.querySelector('.stcr-top-menu [data-act="doc-export"]')?.click();
        await until(() => root.querySelector('.stcr-dx'), 2000);
        check('再打开：停在上次选的"网页 .html"', root.querySelector('.stcr-dx [data-format="html"]')?.classList.contains('stcr-on'));
        root.querySelector('.stcr-doc-close')?.click();
        // ⑨ 验收后补充：⋮ → 导出原始聊天（酒馆原生 jsonl，原样）
        captured = null;
        more.click();
        root.querySelector('.stcr-top-menu [data-act="raw-export"]')?.click();
        await until(() => captured, 8000);
        const raw = captured?.blob ? await captured.blob.text() : '';
        const rows = raw.split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } });
        check('导出原始聊天：下载"STCR-01-正则与多候选.jsonl"，每行一条 JSON，头一行是聊天信息、其余 12 楼', captured?.name === 'STCR-01-正则与多候选.jsonl'
            && rows.length === 13 && rows.every(Boolean) && 'user_name' in rows[0] && rows.slice(1).every(row => typeof row.mes === 'string'), `${captured?.name} ${rows.length} 行`);
        check('导出全程没有改动 ST 的聊天、元信息与当前选择', snapshot() === before);
    } catch (error) {
        check('流程没有抛错', false, error?.stack ?? error);
    } finally {
        HTMLAnchorElement.prototype.click = click;
        URL.createObjectURL = createUrl;
        if (isReaderOpen()) closeReader();
        setPrefs({ docExport: keep });
    }
    return results;
}
