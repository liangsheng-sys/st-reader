// ST Reader — AGPL-3.0
import { checkOpenInHost, findCharacterIndex, hostBusy, hostFileName, openInHost, planOpen, swipeDifferences } from './hostNavigation.js';

const assert = (value, message = '断言失败') => { if (!value) throw new Error(message); };
const equal = (a, b, label = '') => assert(JSON.stringify(a) === JSON.stringify(b), `${label}结果不一致：${JSON.stringify(a)} / ${JSON.stringify(b)}`);
async function rejectsWith(code, run) {
    try { await run(); } catch (error) { equal(error.code, code, '错误码'); return; }
    throw new Error(`没有抛出 ${code}`);
}

/** 假 document：只模拟 body.dataset、#mes_stop 的显示、#chat 里的楼。 */
function fakeDocument({ generating = false, stopShown = false, floors = [] } = {}) {
    const scrolled = [];
    const chat = { addEventListener() {}, removeEventListener() {} };
    return {
        scrolled,
        body: { dataset: generating ? { generating: 'true' } : {} },
        defaultView: { getComputedStyle: () => ({ display: stopShown ? 'flex' : 'none', visibility: 'visible' }) },
        getElementById: id => (id === 'mes_stop' ? {} : id === 'chat' ? chat : null),
        querySelector: selector => {
            const index = Number(/mesid="(\d+)"/.exec(selector)?.[1]);
            return floors.includes(index) ? { scrollIntoView: () => scrolled.push(index) } : null;
        },
    };
}

/** 假 ST：角色表 + 当前选择 + 事件；导航函数照 ST 的顺序改"当前"并发 CHAT_CHANGED，记录调用。 */
function fakeHost({ characterId = '0', groupId = null, chats = { 'A.png': 'a1', 'B.png': 'b1' }, saving = false, silent = false } = {}) {
    const listeners = new Set(), calls = [];
    const state = { characterId, groupId, chats: { ...chats }, chat: [{ swipe_id: 1 }, { swipe_id: 0 }, {}] };
    const characters = [{ avatar: 'A.png' }, { avatar: 'B.png' }];
    const groups = [{ id: 'g1', chats: ['g1-a', 'g1-b'] }, { id: 'g2', chats: ['g2-a'] }];
    const groupChat = { g1: 'g1-a', g2: 'g2-a' };
    const emit = async () => { if (!silent) for (const listener of [...listeners]) listener(); };
    const ctx = () => ({
        characters, groups, characterId: state.characterId, groupId: state.groupId, chat: state.chat,
        getCurrentChatId: () => (state.groupId ? groupChat[state.groupId] : state.chats[characters[state.characterId]?.avatar]),
        eventSource: { on: (_, fn) => listeners.add(fn), removeListener: (_, fn) => listeners.delete(fn) },
        event_types: { CHAT_CHANGED: 'chat_id_changed' },
        selectCharacterById: async id => { calls.push(['select', id]); if (saving) return; state.groupId = null; state.characterId = String(id); await emit(); },
        openCharacterChat: async file => { calls.push(['open', file]); state.chats[characters[state.characterId].avatar] = file; await emit(); },
        openGroupChat: async (id, file) => { calls.push(['group', id, file]); groupChat[id] = file; await emit(); },
    });
    return { ctx, calls, listeners, state };
}

export async function testHostNavigationLogic() {
    const results = [];
    const test = async (name, run) => { await run(); results.push({ name: `T95 ${name}`, passed: true }); };
    await test('文件名去 .jsonl、按头像找下标', () => {
        equal([hostFileName('聊天 一.jsonl'), hostFileName('聊天 一'), hostFileName('a.JSONL')], ['聊天 一', '聊天 一', 'a']);
        const characters = [{ avatar: 'A.png' }, null, { avatar: 'B.png' }];
        equal([findCharacterIndex(characters, 'B.png'), findCharacterIndex(characters, 'C.png'), findCharacterIndex(null, 'A.png'), findCharacterIndex(characters, '')], [2, -1, -1, -1]);
    });
    await test('忙碌判断：body data-generating 或停止按钮可见', () => {
        equal([hostBusy(fakeDocument()), hostBusy(fakeDocument({ generating: true })), hostBusy(fakeDocument({ stopShown: true })), hostBusy(null)], [false, true, true, false]);
    });
    await test('计划：就是当前 / 换角色 / 同角色换聊天 / 群聊只支持当前群组', () => {
        const host = fakeHost();
        equal(planOpen(host.ctx(), 'A.png/a1').kind, 'current');
        equal(planOpen(host.ctx(), 'A.png/a1.jsonl').kind, 'current', '带 .jsonl 也认：');
        equal(planOpen(host.ctx(), 'A.png/a2'), { kind: 'character', index: 0, fileName: 'a2', select: false });
        equal(planOpen(host.ctx(), 'B.png/b2'), { kind: 'character', index: 1, fileName: 'b2', select: true });
        let code = null; try { planOpen(host.ctx(), 'C.png/x'); } catch (error) { code = error.code; } equal(code, 'NOT_FOUND');
        const inGroup = fakeHost({ groupId: 'g1' });
        equal(planOpen(inGroup.ctx(), 'group:g1/g1-a').kind, 'current');
        equal(planOpen(inGroup.ctx(), 'group:g1/g1-b'), { kind: 'group', groupId: 'g1', fileName: 'g1-b' });
        equal(planOpen(inGroup.ctx(), 'A.png/a1'), { kind: 'character', index: 0, fileName: 'a1', select: true }, '群组里选单聊要先选角色：');
        code = null; try { planOpen(inGroup.ctx(), 'group:g2/g2-a'); } catch (error) { code = error.code; } equal(code, 'GROUP_UNSUPPORTED');
        code = null; try { planOpen(inGroup.ctx(), 'group:g1/没有'); } catch (error) { code = error.code; } equal(code, 'NOT_FOUND');
    });
    await test('候选比较：只报阅读器选的与 ST 当前不同的楼，缺省 swipe_id 当 0', () => {
        equal(swipeDifferences([{ swipe_id: 1 }, { swipe_id: 0 }, {}], [[0, 1], [1, 2], [2, 0], [9, 1]]), [1]);
        equal(swipeDifferences(null, [[0, 1]]), []);
    });
    await test('流程：忙 → BUSY 且不调用任何 ST 函数', async () => {
        const host = fakeHost();
        await rejectsWith('BUSY', () => openInHost('B.png/b2', { getContext: host.ctx, document: fakeDocument({ generating: true }) }));
        await rejectsWith('BUSY', () => Promise.resolve().then(() => checkOpenInHost('B.png/b2', { getContext: host.ctx, document: fakeDocument({ stopShown: true }) })));
        equal(host.calls, []);
    });
    await test('流程：换角色 → 先选角色再开文件（不带 .jsonl），滚到那一楼，报候选不同', async () => {
        const host = fakeHost(), doc = fakeDocument({ floors: [1] });
        const result = await openInHost('B.png/b2.jsonl', { index: 1, swipes: [[0, 0], [1, 0]], getContext: host.ctx, document: doc, scrollDelays: [] });
        equal(host.calls, [['select', 1], ['open', 'b2']]);
        equal(result, { status: 'opened', floorLoaded: true, swipeDiffers: [0] });
        equal(doc.scrolled, [1]); equal(host.listeners.size, 0, '监听要退订：');
    });
    await test('流程：角色当前聊天就是目标 → 选完角色就停；同角色只开文件；就是当前 → 不调用', async () => {
        const host = fakeHost({ chats: { 'A.png': 'a1', 'B.png': 'b2' } });
        await openInHost('B.png/b2', { getContext: host.ctx, document: fakeDocument(), scrollDelays: [] });
        equal(host.calls, [['select', 1]]);
        const same = fakeHost();
        await openInHost('A.png/a3', { getContext: same.ctx, document: fakeDocument(), scrollDelays: [] });
        equal(same.calls, [['open', 'a3']]);
        const current = fakeHost(), doc = fakeDocument({ floors: [] });
        const result = await openInHost('A.png/a1', { index: 5, getContext: current.ctx, document: doc, scrollDelays: [] });
        equal([current.calls, result.status, result.floorLoaded], [[], 'current', false], '楼没渲染出来：');
    });
    await test('流程：群聊换同组聊天；ST 存盘中拒绝选角色 → BUSY；不发事件 → 超时', async () => {
        const group = fakeHost({ groupId: 'g1' });
        equal((await openInHost('group:g1/g1-b', { getContext: group.ctx, document: fakeDocument(), scrollDelays: [] })).status, 'opened');
        equal(group.calls, [['group', 'g1', 'g1-b']]);
        const saving = fakeHost({ saving: true });
        await rejectsWith('BUSY', () => openInHost('B.png/b2', { getContext: saving.ctx, document: fakeDocument(), scrollDelays: [] }));
        equal(saving.calls, [['select', 1]]);
        const silent = fakeHost({ silent: true });
        // 不发 CHAT_CHANGED 但状态已经切过去：导航函数返回后核对到了，也算成功
        equal((await openInHost('A.png/a2', { getContext: silent.ctx, document: fakeDocument(), scrollDelays: [] })).status, 'opened');
        const stuck = fakeHost();
        const ctx = () => ({ ...stuck.ctx(), openCharacterChat: () => new Promise(() => {}) });
        await rejectsWith('TIMEOUT', () => openInHost('A.png/a2', { getContext: ctx, document: fakeDocument(), timeoutMs: 30, scrollDelays: [] }));
        equal(stuck.listeners.size, 0, '超时后监听退订：');
    });
    await test('D40 边界：整个扩展只有 hostNavigation.js 调用 ST 的切换聊天函数', async () => {
        const { readdir, readFile } = await import('node:fs/promises');
        const path = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
        const files = ['index.js'];
        const walk = async dir => { for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
            const rel = `${dir}/${entry.name}`;
            if (entry.isDirectory()) await walk(rel); else if (/\.js$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) files.push(rel);
        } };
        await walk('src');
        const hits = [];
        for (const file of files) {
            (await readFile(path.join(root, file), 'utf8')).split('\n').forEach((line, i) => {
                if (/\b(?:openCharacterChat|openGroupChat|openGroupById|selectCharacterById|reloadCurrentChat)\s*\(/.test(line) && !/^\s*(\/\/|\*)/.test(line)) hits.push(`${file}:${i + 1}`);
            });
        }
        assert(hits.length > 0 && hits.every(hit => hit.startsWith('src/core/hostNavigation.js:')), `切换聊天调用出现在别处：${hits.join(', ')}`);
    });
    return results;
}

if (typeof process !== 'undefined' && process.argv?.[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
    for (const result of await testHostNavigationLogic()) console.log(`通过：${result.name}`);
}
