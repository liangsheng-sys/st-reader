// ST Reader — AGPL-3.0
// T91 / D41 抽屉列表缓存的浏览器回归（只在开发实例跑，stcrSelfTest() 全量里带上；也可单跑 stcrSelfTest({core:false,listCache:true})）。
// ① core：真实 ST 的事件名 + 真实只读请求。事件发在一个**新建的** ST EventEmitter 上（同一个类，只有我们在听）——
//    在 ST 全局 eventSource 上发 MESSAGE_RECEIVED 会让别的扩展（生图、TTS 等）当真去干活。
// ② 界面：第二次打开抽屉不出骨架、停在上次的页签和展开；后台有变化就地更新、不跳；↻ 强制重拉。
// 不写任何聊天；只读宿主 getContext()。

import { isDevInstance } from './readonlyGuard.js';
import { createChatSource, clearChatCache, listRecent } from './chatSource.js';
import { closeReader, isReaderOpen, openReader } from '../ui/reader.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const paint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
const snapshot = () => {
    const c = SillyTavern.getContext();
    return JSON.stringify({ chat: c.chat, metadata: c.chatMetadata, character: c.characterId, group: c.groupId, id: c.getCurrentChatId() });
};

export async function testDrawerCacheBrowser({ force = false } = {}) {
    if (!isDevInstance(location) && !force) throw new Error('只在开发实例运行');
    if (isReaderOpen()) closeReader();
    const results = [], before = snapshot();
    const check = (name, passed, detail = '') => results.push({ name: `T91 ${name}`, passed: !!passed, detail: String(detail) });
    const until = async (test, ms = 8000) => { const end = Date.now() + ms; while (!test() && Date.now() < end) await wait(20); return test(); };
    const ctx = SillyTavern.getContext();

    // ① core：独立实例，真实请求计数
    const calls = [];
    const read = async (url, body, { signal } = {}) => {
        calls.push(url);
        const response = await fetch(url, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body), signal });
        if (!response.ok) throw new Error(`只读请求失败：${url} (${response.status})`);
        return response.json();
    };
    const Emitter = ctx.eventSource.constructor;
    const privateEvents = new Emitter();
    const source = createChatSource({ read, prefetchOnList: false, listRefreshDelayMs: 50,
        getContext: () => Object.assign(Object.create(ctx), { eventSource: privateEvents, event_types: ctx.event_types }) });
    const recent = () => calls.filter(url => url === '/api/chats/recent').length;
    const stopEvents = source.watchHostChatEvents();
    try {
        const first = await source.listRecent(50);
        const started = performance.now(); const hit = await source.listRecent(50); const hitMs = performance.now() - started;
        check('命中立刻给缓存（同一份内容）', JSON.stringify(hit) === JSON.stringify(first) && hitMs < 30, `${Math.round(hitMs)} ms`);
        await until(() => recent() === 2, 3000);
        check('命中后后台重拉一次', recent() === 2, recent());
        const seen = []; const stopLists = source.watchLists(event => seen.push(event.listKey));
        const n = recent();
        await privateEvents.emit(ctx.event_types.MESSAGE_RECEIVED, 0, 'normal');
        await until(() => recent() > n, 3000);
        check('发 MESSAGE_RECEIVED（真实事件名）后"最近"被重拉', recent() === n + 1, `${n} → ${recent()}`);
        await wait(300);
        check('结果没变就不通知', seen.length === 0, seen.join(','));
        stopLists();
        const m = recent(); await privateEvents.emit(ctx.event_types.MESSAGE_RECEIVED, 0, 'normal'); await wait(300);
        check('没人订阅时事件不发请求', recent() === m, `${m} → ${recent()}`);
        const names = ['MESSAGE_RECEIVED', 'CHAT_CHANGED', 'CHAT_DELETED', 'GROUP_CHAT_DELETED', 'CHARACTER_EDITED', 'CHARACTER_DELETED', 'GROUP_UPDATED'];
        check('订阅的事件名在这个 ST 里都存在', names.every(name => typeof ctx.event_types[name] === 'string'), names.filter(name => !ctx.event_types[name]).join(','));
    } finally { stopEvents(); source.clearChatCache(); }

    // ② 界面：用正式的 core 单例
    const root = () => document.getElementById('stcr_root');
    const list = () => root()?.querySelector('.stcr-drawer-list');
    let skeletons = 0, characterLists = 0;
    const originalFetch = window.fetch;
    let reverseRecent = false;
    window.fetch = async (...args) => {
        const url = String(args[0] instanceof Request ? args[0].url : args[0]);
        if (url.includes('/api/characters/all')) characterLists++;
        const response = await originalFetch(...args);
        if (!reverseRecent || !url.includes('/api/chats/recent')) return response;
        const data = await response.json();
        return new Response(JSON.stringify(Array.isArray(data) ? [...data].reverse() : data), { status: response.status, headers: response.headers });
    };
    const observer = new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1 && node.matches?.('.stcr-skeleton')) skeletons++;
    });
    // 开发实例只有几个角色，列表不够长：测试期间把抽屉列表压矮，才测得出滚动位置
    const short = document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '#stcr_root .stcr-drawer-list { max-height: 160px; }' }));
    try {
        clearChatCache();
        await openReader({ tab: 'recent' });
        await until(() => list()?.querySelector('.stcr-row-wrap'));
        if (await until(() => root().querySelector('.stcr-doc'), 800)) root().querySelector('.stcr-doc-close')?.click();
        check('第一次打开（缓存空）能列出最近', !!list()?.querySelector('.stcr-row-wrap'));
        // 去"按角色"，展开第一个角色
        root().querySelector('.stcr-drawer-tab[data-tab="owners"]').click();
        await until(() => list().querySelector('[data-owner]'));
        const ownerKey = list().querySelector('[data-owner]').dataset.owner;
        list().querySelector('[data-owner]').click();
        await until(() => list().querySelector('.stcr-vrow--chat'));
        // 再展开几个，让列表长到能滚
        for (const other of [...list().querySelectorAll('[data-owner][aria-expanded="false"]')].slice(0, 4)) {
            other.click(); await until(() => !list().querySelector('.stcr-vrow--status'), 4000);
        }
        const scrolled = Math.min(120, list().scrollHeight - list().clientHeight);
        list().scrollTop = scrolled; list().dispatchEvent(new Event('scroll')); await paint();
        closeReader(); await paint();

        observer.observe(document.body, { childList: true, subtree: true });
        const t0 = performance.now();
        await openReader();
        root().querySelector('[data-act="drawer"]')?.click();
        await paint();
        const reopenMs = performance.now() - t0;
        await wait(200); // 骨架延迟 150 ms：缓存命中不该等到它
        observer.disconnect();
        const tabNow = root().querySelector('.stcr-drawer-tab[aria-selected="true"]')?.dataset.tab;
        check('再开抽屉不出骨架', skeletons === 0, `骨架 ${skeletons} 个`);
        check('停在上次的页签（按角色）', tabNow === 'owners', tabNow);
        check('上次展开的角色仍展开', list().querySelector(`[data-owner="${CSS.escape(ownerKey)}"]`)?.getAttribute('aria-expanded') === 'true' && !!list().querySelector('.stcr-vrow--chat'));
        check('滚动位置保留', scrolled > 0 && Math.abs(list().scrollTop - scrolled) <= 1, `${list().scrollTop} / ${scrolled}`);
        check('第二次打开到抽屉有内容', !!list().querySelector('.stcr-vrow'), `${Math.round(reopenMs)} ms`);
        // ↻：强制重拉，不清空列表
        const n = characterLists;
        root().querySelector('.stcr-drawer-refresh').click();
        check('↻ 期间列表不清空', !!list().querySelector('.stcr-vrow'));
        await until(() => !root().querySelector('.stcr-drawer-refresh').disabled, 8000);
        check('↻ 重拉了角色表', characterLists > n, `${n} → ${characterLists}`);
        // "最近"页：再开就地显示
        root().querySelector('.stcr-drawer-tab[data-tab="recent"]').click();
        await paint();
        check('切回"最近"命中缓存立刻有行', !!list().querySelector('.stcr-row-wrap'));
        // 就地更新不跳：滚到第 2 行，让 ↻ 拿到顺序倒过来的"最近"（只改这次响应的副本，不动文件），第 2 行应留在原处
        const wraps = () => [...list().querySelectorAll(':scope > .stcr-row-wrap')];
        if (wraps().length >= 3) {
            list().scrollTop = wraps()[1].offsetTop - list().offsetTop; await paint();
            const anchorKey = wraps()[1].querySelector('[data-key]').dataset.key;
            const topOf = () => list().querySelector(`[data-key="${CSS.escape(anchorKey)}"]`).closest('.stcr-row-wrap').getBoundingClientRect().top;
            const was = topOf(), firstBefore = wraps()[0].querySelector('[data-key]').dataset.key;
            reverseRecent = true;
            root().querySelector('.stcr-drawer-refresh').click();
            await until(() => !root().querySelector('.stcr-drawer-refresh').disabled, 8000);
            reverseRecent = false;
            const firstAfter = wraps()[0].querySelector('[data-key]').dataset.key;
            check('后台有变化就地换、看着的那行不跳', firstAfter !== firstBefore && Math.abs(topOf() - was) <= 2, `位移 ${Math.round(topOf() - was)} px`);
        } else check('就地更新不跳（最近不足 3 行，跳过）', true);
        const rows = await listRecent(50);
        check('列表接口返回副本（改它不影响缓存）', (rows.length = 0, (await listRecent(50)).length > 0));
    } finally {
        observer.disconnect();
        window.fetch = originalFetch;
        short.remove();
        if (isReaderOpen()) closeReader();
    }
    check('宿主聊天、候选、选择与元信息未改变', before === snapshot());
    console.table(results);
    return results;
}
