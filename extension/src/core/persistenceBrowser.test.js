import { createCssScope, refreshCssScope, startCssScope } from './cssScope.js';
import { createStore } from './store.js';
import { createAnchor, getAnchorText, relocateAnnotations, resolveAnchor } from './anchor.js';
import { seedStore, TEST_CONTEXT, TEST_PNG } from './persistence.test.js';
import { runDisplayRegex, runLiteralRegex } from './regexPipeline.js';

const assert = (value, message) => { if (!value) throw new Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
    const deadline = performance.now() + 2500;
    while (!predicate()) {
        if (performance.now() > deadline) throw new Error('样式观察器未在 2.5 秒内更新');
        await delay(30);
    }
}
function testDatabase(storeName) {
    const library = SillyTavern.libs.localforage;
    return library.createInstance({ name: 'st-reader', storeName, driver: library.INDEXEDDB });
}
function hostSnapshot() {
    const context = SillyTavern.getContext();
    return JSON.stringify({ chat: context.chat, metadata: context.chatMetadata, characterId: context.characterId, groupId: context.groupId,
        extensionSettings: context.extensionSettings, theme: context.powerUserSettings.theme });
}

/** 真实 DOM、CSSOM、IndexedDB 与宿主字体；所有测试数据写独立测试表，finally 删除。 */
export async function testPersistenceBrowser() {
    assert(!document.getElementById('stcr_root'), '请先关闭阅读器窗口，再运行 T13 自测');
    const before = hostSnapshot(), results = [];
    const test = async (name, run) => {
        try { await run(); results.push({ name, passed: true }); }
        catch (error) { results.push({ name, passed: false, error: error.message }); console.error(`[st-reader] ${name}：${error.message}`); }
    };
    const root = document.createElement('div'); root.id = 'stcr_root';
    root.style.cssText = 'position:fixed;left:-20000px;top:0;width:800px;pointer-events:none;';
    root.innerHTML = '<div id="stcr_chat"><div class="mes"><div class="mes_block"><div class="mes_text stcr-t13-probe">STCR FONT PROBE: iii WWW 0123456789 <q>测试引号</q></div></div></div></div>';
    const body = root.querySelector('.mes_text'), chat = document.getElementById('chat');
    const originalChatStyle = chat.getAttribute('style');
    const styles = [], database = testDatabase(`stcr_test_${crypto.randomUUID().replaceAll('-', '')}`), dbName = database.config().storeName;
    const createStyle = text => { const style = document.createElement('style'); style.textContent = text; styles.push(style); document.head.append(style); return style; };
    document.body.append(root); const scope = startCssScope();
    let dbStore;
    try {
        await test('T13 样式：现有主题正文边框、引号颜色与宿主一致', async () => {
            refreshCssScope();
            const native = document.querySelector('#chat .mes_text'); assert(native, '请先打开雾岚');
            const expected = getComputedStyle(native), actual = getComputedStyle(body);
            assert(actual.borderLeftColor === expected.borderLeftColor && actual.borderLeftWidth === expected.borderLeftWidth, '主题边框未克隆');
            const sourceQuote = document.querySelector('#chat .mes_text q');
            if (sourceQuote) assert(getComputedStyle(body.querySelector('q')).color === getComputedStyle(sourceQuote).color, '主题引号色未克隆');
            assert(scope.stats.rules > 0, '没有生成克隆规则');
            const container = getComputedStyle(root.querySelector('#stcr_chat'));
            assert(container.maxHeight === 'none' && container.overflowY === 'visible', '宿主滚动框导致阅读器出现双滚动条');
        });
        await test('T13 字体：真实 Ny 已加载字体及 important 在阅读器生效', async () => {
            await document.fonts.ready;
            const native = document.querySelector('#chat .mes_text');
            const family = getComputedStyle(native).fontFamily;
            assert(family.includes('JetBrainsMono'), '请先按 T11 手册把 JetBrainsMono 设为 Ny 正文');
            const loaded = [...document.fonts].find(face => {
                const name = face.family.replaceAll('"', '');
                return name.includes('JetBrainsMono') && family.includes(name) && face.status === 'loaded';
            });
            assert(loaded && document.fonts.check(`16px ${JSON.stringify(loaded.family.replaceAll('"', ''))}`), 'Ny 的 FontFace 尚未加载');
            assert(getComputedStyle(body).fontFamily === family, 'Ny 字体选择器未克隆');
            assert(/font-family:[^;]*JetBrainsMono[^;]*!important/.test(document.getElementById('stcr-scoped-css').textContent), 'Ny important 丢失');
        });
        await test('T13 样式：替换主题规则后自动更新，important、媒体与嵌套保留', async () => {
            const theme = createStyle('@media (min-width:1px){#chat .stcr-t13-probe{outline:3px solid rgb(11,22,33)!important; & q{letter-spacing:3px!important} @media (min-width:1px){text-indent:2px!important}}}');
            await until(() => getComputedStyle(body).outlineColor === 'rgb(11, 22, 33)');
            assert(getComputedStyle(body.querySelector('q')).letterSpacing === '3px', '嵌套规则未保留');
            assert(getComputedStyle(body).textIndent === '2px', '嵌套条件内声明块未保留');
            theme.textContent = '#chat .stcr-t13-probe{outline:4px solid rgb(44,55,66)!important}';
            await until(() => getComputedStyle(body).outlineColor === 'rgb(44, 55, 66)');
            assert(getComputedStyle(body).outlineWidth === '4px', 'important 声明未生效');
        });
        await test('T13 样式：新增/删除 style 自动重跑，并列全局分支不外溢', async () => {
            const added = createStyle('#chat .stcr-t13-probe, .stcr-t13-global{outline-color:rgb(77,88,99)!important}');
            await until(() => getComputedStyle(body).outlineColor === 'rgb(77, 88, 99)');
            assert(!document.getElementById('stcr-scoped-css').textContent.includes('.stcr-t13-global'), '克隆了无关全局分支');
            added.remove(); await until(() => getComputedStyle(body).outlineColor === 'rgb(44, 55, 66)');
            const revision = scope.stats.revision; await delay(160); assert(scope.stats.revision === revision, '观察器因自有 style 进入循环');
        });
        await test('T13 样式：Ny 类内联变量变化同步到阅读器且删除后不残留', async () => {
            // 在独立空白文档模拟 #chat，避免激活 Ny 对原生容器的观察器。
            const frame = document.createElement('iframe'); root.append(frame);
            const doc = frame.contentDocument;
            doc.body.innerHTML = '<div id="chat"></div><div id="stcr_root"><div id="stcr_chat"><p>测试</p></div></div>';
            const rule = doc.createElement('style'); rule.textContent = '#chat p{word-spacing:var(--stcr-t13-space,0px)!important}'; doc.head.append(rule);
            const native = doc.getElementById('chat'), target = doc.querySelector('p');
            const isolated = createCssScope({ document: doc });
            try {
                isolated.start(); native.style.setProperty('--stcr-t13-space', '7px');
                await until(() => doc.defaultView.getComputedStyle(target).wordSpacing === '7px');
                native.style.setProperty('--stcr-t13-space', '9px'); await until(() => doc.defaultView.getComputedStyle(target).wordSpacing === '9px');
                native.style.removeProperty('--stcr-t13-space'); await until(() => doc.defaultView.getComputedStyle(target).wordSpacing === '0px');
            } finally { isolated.stop(); frame.remove(); }
        });
        await test('T13 样式：设置事件、CSSOM 手动刷新与停止清理', async () => {
            const listeners = new Set();
            const eventSource = { on: (_event, fn) => listeners.add(fn), removeListener: (_event, fn) => listeners.delete(fn) };
            const isolated = createCssScope({ eventSource, settingsEvent: 'test', styleId: 'stcr-t13-event-style', debounceMs: 0 });
            try {
                isolated.start(); isolated.start(); assert(listeners.size === 1, '重复监听');
                const dynamic = createStyle('');
                dynamic.sheet.insertRule('#chat .stcr-t13-probe{--stcr-t13-event:yes}');
                for (const listener of listeners) listener();
                await until(() => document.getElementById('stcr-t13-event-style').textContent.includes('--stcr-t13-event:yes'));
                dynamic.sheet.deleteRule(0); isolated.refresh();
                assert(!document.getElementById('stcr-t13-event-style').textContent.includes('--stcr-t13-event:yes'), 'CSSOM 手动刷新无效');
            } finally { isolated.stop(); isolated.stop(); }
            assert(listeners.size === 0 && !document.getElementById('stcr-t13-event-style'), '停止未清理');
        });
        await test('T13 IndexedDB：六类真实数据重开实例可读、JSON 合并往返一致', async () => {
            await database.ready(); assert(database.driver() === SillyTavern.libs.localforage.INDEXEDDB, '未使用 IndexedDB');
            dbStore = createStore({ storage: database }); await seedStore(dbStore);
            const backup = await dbStore.exportAll();
            const reopened = createStore({ storage: testDatabase(dbName) });
            assert(JSON.stringify(JSON.parse(await reopened.exportAll()).data) === JSON.stringify(JSON.parse(backup).data), '重开实例数据不一致');
            const plan = await reopened.previewImport(backup), report = await reopened.importAll(backup);
            assert(plan.assets.skipped === 1 && report.annotations.skipped === 1, '导入没有保留重复记录');
            const encoded = TEST_PNG.split(',')[1], image = await createImageBitmap(new Blob([Uint8Array.from(atob(encoded), char => char.charCodeAt(0))], { type: 'image/png' }));
            assert(image.width === 1 && image.height === 1, '图片备份内容不可解码'); image.close();
        });
        await test('T13 SVG：脚本/事件/远端资源清洗，导出再导入仍安全', async () => {
            const input = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" onload="alert(1)"><script>alert(1)</script><style>@import "https://example.invalid/a.css";</style><image href="https://example.invalid/x.png"/><rect width="20" height="20" fill="red"/><circle r="2" fill="url(https://example.invalid/x)"/></svg>';
            const asset = await dbStore.assets.put({ name: '安全小图', blob: new Blob([input], { type: 'image/svg+xml' }) });
            const svg = new TextDecoder().decode(Uint8Array.from(atob(asset.dataUrl.split(',')[1]), char => char.charCodeAt(0)));
            assert(!/script|onload|example\.invalid|<style|<image/i.test(svg) && svg.includes('<rect'), 'SVG 未清洗或形状丢失');
            const backup = await dbStore.exportAll(); await dbStore.importAll(backup);
            assert((await dbStore.assets.get(asset.id)).dataUrl === asset.dataUrl, 'SVG 清洗不稳定');
        });
        await test('T13 DOM 锚点：跨节点选区、控件排除、候选/正文思维链隔离', async () => {
            body.innerHTML = '<style>.stcr-unused{color:red}</style>前文<b>目</b><em>标</em>后文<button>复制</button><span data-stcr-ignore-anchor>装饰</span>';
            assert(getAnchorText(body) === '前文目标后文', '控件或 CSS 混入引用');
            const range = document.createRange(); range.setStart(body.querySelector('b').firstChild, 0); range.setEnd(body.querySelector('em').firstChild, 1);
            const anchor = await createAnchor(body, range, TEST_CONTEXT);
            const result = await resolveAnchor(body, anchor, TEST_CONTEXT);
            assert(anchor.quote.exact === '目标' && result.range.toString() === '目标', '跨节点 Range 不一致');
            assert((await resolveAnchor(body, anchor, { ...TEST_CONTEXT, part: 'reasoning' })).status === 'unrelated', '区域串用');
            const crossing = document.createRange(); crossing.selectNodeContents(root);
            let refused = false; try { await createAnchor(body, crossing, TEST_CONTEXT); } catch { refused = true; }
            assert(refused, '跨容器选区未拒绝');
        });
        await test('T13 孤立：正则后文本改变可重定位/进入孤立；重开存储保留并可恢复', async () => {
            // 只修改测试脚本副本，经真实正则管线重渲染，宿主脚本和原文均不变。
            const renderWith = scripts => runDisplayRegex(TEST_CONTEXT.rawText, { scripts, placement: 2, depth: 0, userName: '虚构旅人', characterName: '虚构星灯' }, runLiteralRegex);
            const script = (findRegex, replaceString) => ({ id: 'stcr-t13-anchor-regex', findRegex, replaceString, placement: [2], markdownOnly: true });
            body.textContent = renderWith([script('/前文|后文/g', '')]);
            let results = await relocateAnnotations(body, TEST_CONTEXT, { repository: dbStore.annotations });
            assert(results.length === 1 && results[0].status === 'attached', '唯一原文回退未定位');
            body.textContent = renderWith([script('/目标/g', '引用已被替换')]);
            results = await relocateAnnotations(body, TEST_CONTEXT, { repository: dbStore.annotations });
            assert(results[0].annotation.orphan && results[0].annotation.note === '虚构批注', '失配丢失批注');
            const reopened = createStore({ storage: testDatabase(dbName) });
            assert((await reopened.annotations.list({ orphan: true })).length === 1, '孤立未持久化');
            body.textContent = renderWith([]);
            results = await relocateAnnotations(body, TEST_CONTEXT, { repository: reopened.annotations });
            assert(!results[0].annotation.orphan && results[0].range.toString() === '目标', '引用恢复后未脱离孤立区');
        });
    } finally {
        root.remove(); for (const style of styles) style.remove();
        refreshCssScope(); await database.dropInstance({ name: 'st-reader', storeName: dbName });
    }
    await test('T13 只读终检：宿主聊天/元信息/候选/设置与原样式不变', () => {
        const after = hostSnapshot(), previous = JSON.parse(before), current = JSON.parse(after);
        const changed = Object.keys(previous).filter(key => JSON.stringify(previous[key]) !== JSON.stringify(current[key]));
        assert(after === before && chat.getAttribute('style') === originalChatStyle, `测试后宿主状态变化：${changed.join(',') || '无数据差异'}；style 一致：${chat.getAttribute('style') === originalChatStyle}`);
        assert(!document.getElementById('stcr_root'), '测试容器残留');
    });
    console.table(results);
    if (results.some(result => !result.passed)) throw new Error('T13 浏览器自测有失败项，见上表');
    return results;
}

/** 额外的跨页面持久化实证；只写专用测试表，read 成功后清理。 */
export async function testStorageProbe(phase) {
    const name = 'stcr_reload_probe', database = testDatabase(name), isolated = createStore({ storage: database });
    await database.ready();
    if (phase === 'write') {
        if ((await isolated.annotations.list()).length) await database.dropInstance({ name: 'st-reader', storeName: name });
        const fresh = createStore({ storage: testDatabase(name) });
        const { annotation } = await seedStore(fresh);
        await fresh.annotations.put({ ...annotation, orphan: true, orphanReason: 'text-missing' });
        console.log('[st-reader] 刷新验证已写入：请重新打开网址并把 stcrStorageProbe=write 改成 stcrStorageProbe=read。');
        return true;
    }
    if (phase !== 'read') throw new TypeError('刷新验证只接受 write 或 read');
    assert((await isolated.annotations.list({ orphan: true })).length === 1, '未找到刷新前保存的孤立批注');
    assert((await isolated.bookmarks.list()).length === 1 && (await isolated.assets.list()).length === 1 && (await isolated.replaceRules.list()).length === 1, '刷新后记录不完整');
    assert((await isolated.settings.get('reader')).fontSize === 18 && (await isolated.maskWords.list()).length === 2, '刷新后设置或词表丢失');
    await database.dropInstance({ name: 'st-reader', storeName: name });
    console.log('[st-reader] 跨页面持久化验证通过：六类数据与 orphan 均保留；专用测试表已清理。');
    return true;
}
