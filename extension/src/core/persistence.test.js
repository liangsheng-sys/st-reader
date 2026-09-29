import { collectScopedCss, rewriteChatSelector, scopeDeclarationValue } from './cssScope.js';
import { createStore, bookmarkId } from './store.js';
import { createTextAnchor, locateAnchorText } from './anchor.js';
import { MAX_ASSET_BYTES } from './assetCodec.js';

// 用项目自己的 PNG/CRC 与 Node zlib 从零生成的两个 1×1 色块，不含外部素材。
export const TEST_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==';
const OTHER_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGj4DwAFhAKAjM1mJgAAAABJRU5ErkJggg==';
export const TEST_CONTEXT = Object.freeze({ chatKey: 'STCR_T11_Aster.png/STCR-01-正则与多候选', mesIndex: 11, swipeIndex: 2, part: 'body', rawText: '前文目标后文' });
const assert = (value, message = '断言失败') => { if (!value) throw new Error(message); };
const equal = (a, b) => assert(JSON.stringify(a) === JSON.stringify(b), `结果不一致：${JSON.stringify(a)} / ${JSON.stringify(b)}`);
async function rejects(run, code) {
    let error; try { await run(); } catch (caught) { error = caught; }
    assert(error && (!code || error.code === code), `应拒绝此操作${code ? ` (${code})` : ''}`);
}
export function memoryStorage() {
    let state = null;
    return { fail: false, writes: 0,
        async getItem() { return structuredClone(state); },
        async setItem(_key, value) { if (this.fail) { this.fail = false; throw new Error('模拟配额不足'); } state = structuredClone(value); this.writes++; },
    };
}
export async function seedStore(store) {
    const anchor = await createTextAnchor('前文目标后文', 2, 4, TEST_CONTEXT);
    const annotation = await store.annotations.put({ anchor, title: '虚构测试', preview: '目标', note: '虚构批注', color: 'blue' });
    await store.bookmarks.put({ chatKey: TEST_CONTEXT.chatKey, mesIndex: TEST_CONTEXT.mesIndex, swipeIndex: TEST_CONTEXT.swipeIndex, title: '虚构测试', preview: '候选摘要' });
    await store.maskWords.set(['星灯', '雾岛']); await store.settings.set('reader', { fontSize: 18, lineHeight: 1.8 });
    const asset = await store.assets.put({ name: '测试白点', dataUrl: TEST_PNG });
    await store.replaceRules.put({ from: '旅人', to: { kind: 'asset', value: asset.id }, scope: 'all', caseSensitive: true, wholeWord: false });
    return { annotation, asset };
}
function cssStyle(values) {
    const keys = Object.keys(values);
    return Object.assign([...keys], { getPropertyValue: key => values[key][0], getPropertyPriority: key => values[key][1] ?? '' });
}
const styleRule = (selectorText, values) => ({ type: 1, selectorText, style: cssStyle(values), cssRules: [] });

/** 与浏览器共用：真实数据校验、原子失败、合并语义、锚点和 CSS 选择器边界。 */
export async function testPersistenceLogic() {
    const results = [];
    const test = async (name, run) => { await run(); results.push({ name, passed: true }); };
    await test('CSS 选择器：精确 ID、转义 ID、属性字符串、并列分支与伪元素', () => {
        const result = rewriteChatSelector('#chat .x::before, body, #chatty, [title="#chat"] #chat q');
        assert(result.includes('#stcr_chat .x:where(#stcr_root, #stcr_root *)::before'));
        assert(!result.includes('body') && !result.includes('#chatty'));
        assert(result.includes('[title="#chat"] #stcr_chat q'));
        assert(rewriteChatSelector('#\\63 hat .x').includes('#stcr_chat'));
        equal(rewriteChatSelector('[title="#chat"], .chat'), '');
        assert(rewriteChatSelector(':is(#chat, .x) q').includes(':where(#stcr_root, #stcr_root *)'));
    });
    await test('CSS 值：相对图片按原文件解析，远端/API URL 不克隆', () => {
        equal(scopeDeclarationValue('url(../img/a.png)', 'http://localhost:8100/css/main.css', 'http://localhost:8100'), 'url("http://localhost:8100/img/a.png")');
        equal(scopeDeclarationValue('url(https://example.invalid/a)', 'http://localhost:8100/', 'http://localhost:8100'), null);
        equal(scopeDeclarationValue('url(/api/chats/get)', 'http://localhost:8100/', 'http://localhost:8100'), null);
        equal(scopeDeclarationValue('image-set("https://example.invalid/a" 1x)', 'http://localhost:8100/', 'http://localhost:8100'), null);
        equal(scopeDeclarationValue('"JetBrainsMono"', 'http://localhost:8100/', 'http://localhost:8100'), '"JetBrainsMono"');
        equal(scopeDeclarationValue('var(--remote-image)', 'http://localhost:8100/', 'http://localhost:8100', 'background-image'), null);
        equal(scopeDeclarationValue('var(--color)', 'http://localhost:8100/', 'http://localhost:8100', 'color'), 'var(--color)');
    });
    await test('CSSOM：保留 important/媒体条件，跳过全局字体、禁用和跨域表', () => {
        const sheet = { cssRules: [{ type: 4, cssText: '@media (min-width: 1px) {}', cssRules: [styleRule('#chat q', { color: ['red', 'important'] })] }, { type: 5, cssText: '@font-face{}' }] };
        const foreign = { get cssRules() { throw new DOMException('跨域', 'SecurityError'); } };
        const out = collectScopedCss([sheet, foreign, { disabled: true, cssRules: [styleRule('#chat', {})] }], { baseUrl: 'http://localhost:8100/', origin: 'http://localhost:8100' });
        equal(out.rules, 1); equal(out.skippedSheets, 1); assert(out.cssText.includes('@media (min-width: 1px)')); assert(out.cssText.includes('red !important')); assert(!out.cssText.includes('font-face'));
    });
    await test('锚点：UTF-16 引用、SHA-256、原文变化后仍能唯一重定位', async () => {
        const anchor = await createTextAnchor('甲😀目标乙', 3, 5, TEST_CONTEXT);
        equal(anchor.quote.exact, '目标'); assert(/^sha256:[a-f0-9]{64}$/.test(anchor.rawHash));
        const found = await locateAnchorText('增加甲😀目标乙', anchor, { ...TEST_CONTEXT, rawText: '新的原文' });
        equal(found.status, 'attached'); equal(found.start, 5); equal(found.rawChanged, true);
    });
    await test('锚点：丢失/歧义进 orphan，其他聊天/候选/思维链不误判', async () => {
        const anchor = await createTextAnchor('前文目标后文', 2, 4, TEST_CONTEXT);
        equal((await locateAnchorText('没有引用', anchor, TEST_CONTEXT)).reason, 'text-missing');
        equal((await locateAnchorText('目标和目标', anchor, TEST_CONTEXT)).reason, 'ambiguous');
        for (const patch of [{ chatKey: 'x.png/y' }, { mesIndex: 12 }, { swipeIndex: 0 }, { part: 'reasoning' }]) equal((await locateAnchorText('没有引用', anchor, { ...TEST_CONTEXT, ...patch })).status, 'unrelated');
        await rejects(() => createTextAnchor('目标', 0, 2, { ...TEST_CONTEXT, rawText: undefined }));
    });
    await test('存储：六类数据完整导出/导入，包括素材与引用、跨聊天收藏摘要', async () => {
        const first = createStore({ storage: memoryStorage() }), second = createStore({ storage: memoryStorage() });
        await seedStore(first);
        const backup = await first.exportAll(), preview = await second.previewImport(backup);
        equal(preview.annotations.added, 1); equal(preview.assets.added, 1); equal((await second.info()).counts.annotations, 0);
        equal(await second.importAll(backup), preview);
        equal(JSON.parse(await second.exportAll()).data, JSON.parse(backup).data);
        equal((await second.bookmarks.list())[0].preview, '候选摘要');
        assert((await first.info()).lastExportAt);
    });
    await test('存储：重复合并跳过原 ID/设置键/词条，保留已有批注编辑', async () => {
        const store = createStore({ storage: memoryStorage() }); const { annotation } = await seedStore(store);
        const backup = await store.exportAll();
        await store.annotations.put({ ...annotation, note: '更新批注' }); await store.settings.set('reader', { fontSize: 22 });
        const report = await store.importAll(backup);
        equal(report.annotations.skipped, 1); equal(report.assets.skipped, 1); equal(report.maskWords.skipped, 2);
        equal((await store.annotations.get(annotation.id)).note, '更新批注'); equal((await store.settings.get('reader')).fontSize, 22);
    });
    await test('存储：坏 JSON/未来版本/危险键/缺失素材均拒绝且无部分写入', async () => {
        const storage = memoryStorage(), store = createStore({ storage }); await seedStore(store);
        const backup = await store.exportAll(), before = await storage.getItem();
        const broken = JSON.parse(backup); broken.data.assets = {};
        for (const invalid of ['{', backup.replace('"version": 1', '"version": 99'), backup.replace('"reader":', '"__proto__":'), JSON.stringify(broken)]) await rejects(() => store.importAll(invalid));
        equal(await storage.getItem(), before);
    });
    await test('存储：写入失败不改变已保存快照，后续操作可以恢复', async () => {
        const storage = memoryStorage(), store = createStore({ storage }); await store.settings.set('saved', 1);
        const before = await storage.getItem(); storage.fail = true;
        await rejects(() => store.settings.set('saved', 2)); equal(await storage.getItem(), before);
        await store.settings.set('saved', 3); equal(await store.settings.get('saved'), 3);
    });
    await test('存储：并发写入不丢项，输入与读取返回值不会别名修改数据库', async () => {
        const storage = memoryStorage(), store = createStore({ storage });
        await Promise.all(Array.from({ length: 20 }, (_, i) => store.maskWords.add(`词${i}`))); equal((await store.maskWords.list()).length, 20);
        const value = { nested: [1, 2] }; await store.settings.set('object', value); value.nested.push(3);
        const returned = await store.settings.get('object'); returned.nested.push(4); equal(await store.settings.get('object'), { nested: [1, 2] });
        equal(await createStore({ storage }).settings.get('object'), { nested: [1, 2] });
    });
    await test('收藏：同楼与特定候选可并存，稳定键防重复，跨聊天可过滤', async () => {
        const store = createStore({ storage: memoryStorage() });
        const target = { chatKey: TEST_CONTEXT.chatKey, mesIndex: 11, title: '星灯', preview: '片段' };
        const floor = await store.bookmarks.put(target), swipe = await store.bookmarks.put({ ...target, swipeIndex: 2 });
        assert(floor.id !== swipe.id); equal(bookmarkId(target), floor.id);
        await store.bookmarks.put({ ...target, preview: '新片段' }); equal((await store.bookmarks.list({ chatKey: target.chatKey })).length, 2);
        await store.bookmarks.put({ ...target, chatKey: 'b.png/c' }); equal((await store.bookmarks.list()).length, 3);
        equal(await store.bookmarks.remove(swipe.id), true); equal(await store.bookmarks.remove(swipe.id), false);
    });
    await test('素材：类型/大小/30 张限制，引用计数与拒绝悬空删除', async () => {
        const store = createStore({ storage: memoryStorage() });
        const { asset } = await seedStore(store); equal((await store.assets.references(asset.id)).length, 1);
        await rejects(() => store.assets.remove(asset.id), 'ASSET_IN_USE');
        await rejects(() => store.assets.put({ name: '过大', blob: new Blob([new Uint8Array(MAX_ASSET_BYTES + 1)], { type: 'image/png' }) }));
        await rejects(() => store.assets.put({ name: '伪装图片', dataUrl: 'data:image/png;base64,PHNjcmlwdD4=' }));
        for (let i = 1; i < 30; i++) await store.assets.put({ name: `样本${i}`, dataUrl: TEST_PNG });
        await rejects(() => store.assets.put({ name: '第31张', dataUrl: TEST_PNG }), 'ASSET_LIMIT');
        equal((await store.assets.list()).length, 30);
        await store.assets.remove(asset.id, { removeRules: true }); equal((await store.replaceRules.list()).length, 0); equal((await store.assets.list()).length, 29);
    });
    await test('素材备份：同 ID 不同内容拒绝合并，名称可改且保持规则引用', async () => {
        const store = createStore({ storage: memoryStorage() }); const { asset } = await seedStore(store);
        await store.assets.put({ ...asset, name: '新名字' }); equal((await store.assets.references(asset.id)).length, 1);
        const backup = JSON.parse(await store.exportAll());
        backup.data.assets[asset.id].dataUrl = OTHER_PNG;
        await rejects(() => store.importAll(JSON.stringify(backup)), 'ASSET_CONFLICT');
        equal((await store.assets.get(asset.id)).name, '新名字');
    });
    await test('存储校验：批注颜色、候选、规则类型和设置非 JSON 值拒绝', async () => {
        const store = createStore({ storage: memoryStorage() }); const { annotation } = await seedStore(store);
        await rejects(() => store.annotations.put({ ...annotation, color: 'red' }), 'INVALID_DATA');
        await rejects(() => store.bookmarks.put({ chatKey: 'a.png/b', mesIndex: -1, title: '', preview: '' }), 'INVALID_DATA');
        await rejects(() => store.replaceRules.put({ from: 'x', to: { kind: 'html', value: '<script>' } }), 'INVALID_DATA');
        await rejects(() => store.settings.set('bad', NaN), 'INVALID_DATA');
        await rejects(() => store.settings.set('bad', { unsupported: undefined }), 'INVALID_DATA');
        await rejects(() => store.settings.set('__proto__', {}), 'INVALID_DATA');
    });
    return results;
}
