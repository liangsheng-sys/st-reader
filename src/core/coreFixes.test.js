// ST Reader — AGPL-3.0
import { replaceNamesInRaw, maskText } from './cardTransforms.js';
import { maskCodeText, maskHtmlString } from './codeTransforms.js';
import { replaceLiteralNames } from './textTransforms.js';
import { createStore, bookmarkId } from './store.js';
import { memoryStorage } from './persistence.test.js';
import { createSelfTestRunner } from './selfTestRunner.js';

const assert = (value, message = '断言失败') => { if (!value) throw new Error(message); };
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const equal = (a, b) => assert(JSON.stringify(sorted(a)) === JSON.stringify(sorted(b)), `结果不一致：${JSON.stringify(a)} / ${JSON.stringify(b)}`);
async function rejects(run) { let failed = false; try { await run(); } catch { failed = true; } assert(failed, '未拒绝无效输入'); }
const target = { chatKey: 'STCR_T11_Aster.png/STCR-01-正则与多候选', title: '合成聊天', preview: '虚构摘要' };
const rule = { from: '灯塔', to: { kind: 'text', value: '某地', background: '#12aBcD' } };

/** T41 纯逻辑与存储验证；在 Node 和浏览器中共用，不访问真实数据。 */
export async function testCoreFixesLogic() {
    const results = [];
    const test = async (name, run) => { await run(); results.push({ name: `T41 ${name}`, passed: true }); };
    await test('重复自测按顺序执行，保留各次选项，失败后仍可重跑', async () => {
        let release, active = 0, maxActive = 0;
        const gate = new Promise(resolve => { release = resolve; }), seen = [];
        const run = createSelfTestRunner(async options => {
            maxActive = Math.max(maxActive, ++active); seen.push(options.id);
            try {
                if (options.id === 1) { await gate; throw new Error('合成的自测失败'); }
                return options.id;
            } finally { active--; }
        });
        const first = rejects(() => run({ id: 1 })), options = { id: 2 }, second = run(options);
        options.id = 99;
        await Promise.resolve(); equal(seen, [1]); release();
        await first; equal(await second, 2); equal(await run({ id: 3 }), 3);
        equal(seen, [1, 2, 3]); equal(maxActive, 1);
    });
    await test('无 DOM 遮盖仍按码点回退，emoji 不按 UTF-16 拆分', () => {
        const parts = maskText('Wi😀界', ['Wi😀界'], { kind: 'bar', uniform: false });
        equal(parts[0].width, 4); assert(!Object.hasOwn(parts[0], 'text'));
        equal(maskText('Wi😀界', ['Wi😀界'])[0].width, 3);
    });
    await test('替换背景色贯穿片段、映射和跳过诊断，输入不变', () => {
        const input = JSON.stringify(rule), result = replaceNamesInRaw('灯塔灯塔', { rules: [rule] });
        equal(result.segments[0].to, rule.to); equal(result.mappings[0].to, rule.to); equal(result.mappings[0].count, 2);
        equal(JSON.stringify(rule), input);
        const skipped = replaceNamesInRaw('灯塔', { characterName: '灯塔', rules: [{ ...rule, from: '灯' }] });
        equal(skipped.mappings[0].skippedRules[0].to.background, '#12aBcD');
    });
    await test('背景只接受文字的六位实色，执行和存储均拒绝非法值', async () => {
        const store = createStore({ storage: memoryStorage() });
        for (const background of ['', '#123', '#12345678', 'red', 'url(x)', null, 123456, '#abcdef;display:none']) {
            const invalid = { ...rule, to: { ...rule.to, background } };
            await rejects(() => replaceNamesInRaw('灯塔', { rules: [invalid] }));
            await rejects(() => store.replaceRules.put(invalid));
        }
        for (const kind of ['icon', 'asset']) {
            const invalid = { ...rule, to: { kind, value: kind === 'icon' ? 'fa-star' : 'asset', background: '#abcdef' } };
            await rejects(() => replaceNamesInRaw('灯塔', { rules: [invalid] }));
            await rejects(() => store.replaceRules.put(invalid));
        }
        equal((await store.replaceRules.list()).length, 0);
    });
    await test('背景可选，存储和备份往返保留颜色及旧版无背景规则', async () => {
        const first = createStore({ storage: memoryStorage() }), second = createStore({ storage: memoryStorage() });
        const colored = await first.replaceRules.put(rule);
        const plain = await first.replaceRules.put({ ...rule, from: '雾岛', to: { kind: 'text', value: '' } });
        const backup = await first.exportAll();
        equal((await second.previewImport(backup)).replaceRules.added, 2);
        await second.importAll(backup);
        equal(await second.replaceRules.get(colored.id), colored); equal(await second.replaceRules.get(plain.id), plain);
        const broken = JSON.parse(backup); broken.data.replaceRules[colored.id].to.background = '#0000';
        await rejects(() => second.importAll(JSON.stringify(broken)));
        equal(await second.replaceRules.get(colored.id), colored);
    });
    await test('纯代码替换、长词屏蔽、优先级与三个开关均生效', () => {
        const options = { rules: [rule], maskWords: ['某地', '秘密', '长长秘密'], userName: '旅人', characterName: '星灯' };
        equal(maskCodeText('旅人 星灯 灯塔 秘密 长长秘密', options), 'user char 某地 ███ ███');
        equal(maskCodeText('星灯 灯塔 秘密', { ...options, autoReplaceNames: false }), '星灯 某地 ███');
        equal(maskCodeText('星灯 灯塔 秘密', { ...options, applyReplaceRules: false }), 'char 灯塔 ███');
        equal(maskCodeText('星灯 灯塔 秘密', { ...options, replaceNames: false }), '星灯 灯塔 ███');
        equal(maskCodeText('Wi😀界', { maskWords: ['Wi😀界'], maskStyle: { kind: 'bar', uniform: false } }), '████');
    });
    await test('纯代码按作用域与整词匹配，不串换，图案有纯文字回退', () => {
        equal(maskCodeText('A AA a', { autoReplaceNames: false, avatarUrl: 'a.png', rules: [
            { from: 'A', to: { kind: 'text', value: 'B' }, wholeWord: true, caseSensitive: true, scope: 'a.png' },
            { from: 'B', to: { kind: 'text', value: 'C' } },
            { from: 'AA', to: { kind: 'text', value: 'D' }, scope: 'b.png' },
        ] }), 'B AA a');
        equal(maskCodeText('星图 图片', { rules: [
            { from: '星图', to: { kind: 'icon', value: 'fa-star' } }, { from: '图片', to: { kind: 'asset', value: 'local-id' } },
        ] }), '★ [图片]');
        equal(maskCodeText('灯塔', { rules: [{ ...rule, to: { kind: 'text', value: '<b>保留</b>' } }] }), '<b>保留</b>');
    });
    await test('纯代码拒绝坏输入，空文本与不命中保持一致', async () => {
        equal(maskCodeText('', {}), ''); equal(maskCodeText('原文', { maskWords: ['别的'] }), '原文');
        await rejects(() => maskCodeText(null)); await rejects(() => maskCodeText('原文', { maskWords: [''] }));
        if (!globalThis.document) await rejects(() => maskHtmlString('<b>原文</b>'));
    });
    await test('聊天、整楼、候选收藏共存，聊天键只依赖 chatKey', async () => {
        const store = createStore({ storage: memoryStorage() });
        const chat = await store.bookmarks.put({ ...target, kind: 'chat' });
        const floor = await store.bookmarks.put({ ...target, mesIndex: 3 });
        const swipe = await store.bookmarks.put({ ...target, mesIndex: 3, swipeIndex: 2 });
        equal(chat.id, `stcr:bookmark:${encodeURIComponent(target.chatKey)}:chat`);
        equal(floor.id, `stcr:bookmark:${encodeURIComponent(target.chatKey)}:3:floor`);
        equal(swipe.id, `stcr:bookmark:${encodeURIComponent(target.chatKey)}:3:2`);
        assert(!Object.hasOwn(chat, 'mesIndex') && !Object.hasOwn(chat, 'swipeIndex'));
        equal(floor.kind, 'floor'); equal(swipe.kind, 'swipe');
        await store.bookmarks.put({ ...target, kind: 'chat', title: '改显示名' });
        equal((await store.bookmarks.list()).length, 3);
        equal((await store.bookmarks.list({ kind: 'chat', chatKey: target.chatKey }))[0].title, '改显示名');
        equal((await store.bookmarks.list({ kind: 'floor' })).length, 1);
        equal((await store.bookmarks.list({ kind: 'swipe' })).length, 1);
        await store.bookmarks.remove(chat.id); equal((await store.bookmarks.list()).length, 2);
    });
    await test('旧版无 kind 记录读取与备份迁移保持 ID，读取不写库', async () => {
        const storage = memoryStorage(), first = createStore({ storage });
        const old = await first.bookmarks.put({ ...target, mesIndex: 3, swipeIndex: 0 });
        const legacy = await storage.getItem(); delete legacy.data.bookmarks[old.id].kind;
        await storage.setItem('stcr:state:v1', legacy); const writes = storage.writes;
        const reopened = createStore({ storage });
        equal((await reopened.bookmarks.get(old.id)).kind, 'swipe');
        equal((await reopened.bookmarks.list({ kind: 'swipe' }))[0].id, old.id);
        equal(storage.writes, writes);
        const oldBackup = { format: 'st-reader', version: 1, data: legacy.data };
        const next = createStore({ storage: memoryStorage() });
        equal((await next.previewImport(JSON.stringify(oldBackup))).bookmarks.added, 1);
        await next.importAll(JSON.stringify(oldBackup)); equal(await next.bookmarks.get(old.id), old);
        equal((await next.importAll(JSON.stringify(oldBackup))).bookmarks.skipped, 1);
    });
    await test('新版三类收藏备份往返，重复导入保留已有改动', async () => {
        const first = createStore({ storage: memoryStorage() }), second = createStore({ storage: memoryStorage() });
        for (const location of [{ kind: 'chat' }, { mesIndex: 0 }, { mesIndex: 0, swipeIndex: 0 }]) await first.bookmarks.put({ ...target, ...location });
        const backup = await first.exportAll();
        equal((await second.previewImport(backup)).bookmarks.added, 3); await second.importAll(backup);
        equal(await second.bookmarks.list(), await first.bookmarks.list());
        const chat = (await second.bookmarks.list({ kind: 'chat' }))[0];
        await second.bookmarks.put({ ...chat, title: '保留此改动' });
        equal((await second.importAll(backup)).bookmarks.skipped, 3);
        equal((await second.bookmarks.get(chat.id)).title, '保留此改动');
    });
    await test('收藏拒绝混合目标、类型不符与伪造 ID，失败无部分写入', async () => {
        const store = createStore({ storage: memoryStorage() });
        for (const location of [{ kind: 'chat', mesIndex: 0 }, { kind: 'chat', swipeIndex: null }, { kind: 'other' },
            { kind: 'floor', mesIndex: 0, swipeIndex: 1 }, { kind: 'swipe', mesIndex: 0 },
            { kind: 'chat', id: bookmarkId({ ...target, mesIndex: 0 }) }]) {
            await rejects(() => store.bookmarks.put({ ...target, ...location }));
        }
        equal((await store.bookmarks.list()).length, 0);
        const valid = await store.bookmarks.put({ ...target, kind: 'chat' }), backup = JSON.parse(await store.exportAll());
        backup.data.bookmarks[valid.id].mesIndex = 4;
        await rejects(() => store.importAll(JSON.stringify(backup)));
        equal(await store.bookmarks.get(valid.id), valid);
    });
    await test('T81 规则的更多原词：都当原词替换，长词优先，映射记实际命中的词', async () => {
        const alias = { ...rule, aliases: ['灯台', '灯塔下'] };
        const text = result => result.segments.map(item => item.kind === 'text' ? item.text : item.to.value).join('');
        const result = replaceNamesInRaw('灯塔 灯台 灯塔下', { autoReplaceNames: false, rules: [alias, { from: '灯塔下', to: { kind: 'text', value: '别处' } }] });
        equal(text(result), '某地 某地 某地');
        equal(result.mappings.map(item => [item.from, item.count]), [['灯塔', 1], ['灯台', 1], ['灯塔下', 1]]);
        equal(text(replaceNamesInRaw('灯塔下的灯塔', { autoReplaceNames: false, rules: [rule, { from: '灯塔下', to: { kind: 'text', value: '别处' } }] })), '别处的某地');
        equal(maskCodeText('<b>灯台</b>', { autoReplaceNames: false, rules: [alias] }), '<b>某地</b>');
        // 批注走 textTransforms 的字面替换：映射里的每个实际原词都是一对，长词优先照旧
        equal(replaceLiteralNames('灯塔下的灯台', result.mappings.map(item => ({ from: item.from, to: item.to.value }))), '某地的某地');
        let failed = false; try { replaceNamesInRaw('x', { rules: [{ ...rule, aliases: [''] }] }); } catch { failed = true; }
        assert(failed, '空的更多原词应被拒绝');
    });
    await test('T81 store 校验 aliases，导出仍是版本 1，旧备份照常导入', async () => {
        const store = createStore({ storage: memoryStorage() });
        const saved = await store.replaceRules.put({ ...rule, aliases: ['灯台', '灯台', '灯塔'] });
        equal(saved.aliases, ['灯台']);
        equal((await store.replaceRules.put({ ...rule, from: '海', aliases: ['海'] })).aliases, undefined);
        for (const aliases of ['灯台', [''], [3], ['x'.repeat(1001)]]) await rejects(() => store.replaceRules.put({ ...rule, from: '山', aliases }));
        const backup = JSON.parse(await store.exportAll());
        equal(backup.version, 1);
        const other = createStore({ storage: memoryStorage() });
        await other.importAll(JSON.stringify(backup));
        equal((await other.replaceRules.get(saved.id)).aliases, ['灯台']);
        const forged = structuredClone(backup); forged.data.replaceRules[saved.id].aliases = ['灯台', '灯台'];
        await rejects(() => createStore({ storage: memoryStorage() }).importAll(JSON.stringify(forged)));
        const old = structuredClone(backup); for (const item of Object.values(old.data.replaceRules)) delete item.aliases;
        const third = createStore({ storage: memoryStorage() });
        await third.importAll(JSON.stringify(old));
        equal((await third.replaceRules.list()).length, 2);
    });
    return results;
}
