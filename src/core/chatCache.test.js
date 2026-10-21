// ST Reader — AGPL-3.0
import { createChatSource, INVALIDATING_EVENTS, matchesHostChat } from './chatSource.js';
const assert = (value, message = '断言失败') => { if (!value) throw new Error(message); };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function rejects(run, code) { try { await run(); } catch (error) { if (code) assert(error.code === code || error.name === code, `错误类型应为 ${code}`); return; } throw new Error('应拒绝本次操作'); }

function fixture(options = {}) {
    const files = new Map(['a', 'b', 'c', 'd'].map(file => [file, { size: 100, date: 1000,
        rows: [{ user_name: '虚构旅人', character_name: '虚构角色' }, ...Array.from({ length: 4 }, (_, index) => ({ name: '虚构角色', mes: `${file}虚构楼${index}`, send_date: 1000 + index }))] }]));
    const calls = [], card = { avatar: 'fixture.png', name: '虚构角色', data: { extensions: { regex_scripts: [] } } };
    const group = { id: 'g', name: '虚构群', chats: ['a', 'b'], members: ['fixture.png'], chat_metadata: { note: '最初' } };
    const ctx = { name1: '虚构旅人', characters: [card], characterId: 0, getCurrentChatId: () => 'a' };
    const info = (name, value, isGroup = false) => ({ file_name: name + (isGroup ? '' : '.jsonl'), file_size: value.size, last_mes: value.date, message_count: value.rows.length - 1 });
    const read = async (url, body, opts) => {
        calls.push({ url, body, signal: opts.signal }); await options.beforeRead?.(url, body, opts);
        if (url === '/api/characters/get') return structuredClone(card);
        if (url === '/api/characters/all') return [structuredClone(card)];
        if (url === '/api/groups/all') return [structuredClone(group)];
        if (url === '/api/chats/search') return [...files].map(([name, value]) => info(name, value, !!body.group_id));
        if (url === '/api/chats/recent') return [...files].map(([name, value]) => ({ ...info(name, value), avatar: card.avatar }));
        if (url === '/api/characters/chats') return [...files].map(([name, value]) => info(name, value));
        const rows = structuredClone(files.get(body.file_name ?? body.id).rows);
        if (url === '/api/chats/group/get') return rows.slice(1).map(row => ({ ...row, original_avatar: card.avatar }));
        return rows;
    };
    const source = createChatSource({ read, getContext: () => ctx, prefetchOnList: false, ...options });
    const gets = () => calls.filter(call => ['/api/chats/get', '/api/chats/group/get'].includes(call.url)).length;
    const open = (name = 'a', opts) => source.openChat(`fixture.png/${name}`, opts);
    return { source, files, calls, gets, open, card, group, ctx };
}

export async function testChatCacheLogic() {
    const results = [], test = async (name, run) => { await run(); results.push({ name: `T53 ${name}`, passed: true }); };
    await test('D34 命中立即复用冻结页；非当前聊天每次命中都后台校验，不再有 60 秒窗口', async () => {
        const f = fixture(), first = await f.open('b'), page = first.page(0); first.close();
        const searches = () => f.calls.filter(call => call.url === '/api/chats/search').length;
        const second = await f.open('b');
        assert(second.cacheHit && second.page(0) === page && second.getMessage(0) === page.messages[0]);
        assert((await second.validation).state === 'fresh'); second.close();
        const third = await f.open('b'); await third.validation; third.close();
        assert(f.gets() === 1 && searches() === 3, '紧接着再开也应重新校验');
        assert(Object.isFrozen(page) && Object.isFrozen(page.messages[0].swipes));
    });
    await test('D28 大小、日期、楼数变化只通知；显式 reload 才读取新正文', async () => {
        for (const field of ['size', 'date', 'count']) {
            const f = fixture(), old = await f.open(), oldPage = old.page(0), events = [];
            old.onStale(event => events.push(event));
            if (field === 'count') f.files.get('a').rows.push({ mes: '新增虚构楼' }); else f.files.get('a')[field]++;
            f.files.get('a').rows[1].mes = '虚构更新';
            const cached = await f.open(); assert(cached.page(0) === oldPage && f.gets() === 1);
            assert((await cached.validation).state === 'stale' && old.stale && events.length === 1 && events[0].reason === 'changed');
            assert(old.getMessage(0).swipes[0].text === 'a虚构楼0', '后台替换了正文');
            const next = await f.open('a', { reload: true });
            assert(!next.cacheHit && !next.stale && f.gets() === 2 && next.page(0) !== oldPage && next.getMessage(0).swipes[0].text === '虚构更新');
            assert(f.source.getChatCacheStats().invalidations === 1); old.close(); cached.close(); next.close();
        }
    });
    await test('D28 文件消失通知 missing，保留正文；显式重读拒绝且不创建空聊天', async () => {
        const f = fixture(), old = await f.open(); f.files.delete('a');
        const cached = await f.open(); let event; cached.onStale(value => { event = value; });
        assert((await cached.validation).state === 'stale' && event.reason === 'missing' && cached.page(0).messages.length === 4);
        await rejects(() => f.open('a', { reload: true }), 'NOT_FOUND');
        assert(f.gets() === 1 && f.source.getChatCacheStats().entries === 0); old.close(); cached.close();
    });
    await test('D34 校验失败仍可读，失败结果不保留、下次打开立即重试；冷读缺字段不保留', async () => {
        let fail = false;
        const f = fixture({ beforeRead: url => { if (fail && url === '/api/chats/search') throw new Error('虚构断网'); } });
        (await f.open()).close(); fail = true;
        const cached = await f.open(); assert((await cached.validation).state === 'error' && !cached.stale && cached.page(0).messages.length === 4); cached.close();
        fail = false;
        const recovered = await f.open(); assert((await recovered.validation).state === 'fresh', '失败后应立即重新校验'); recovered.close();
        assert(f.gets() === 1 && f.calls.filter(x => x.url === '/api/chats/search').length === 3);
        delete f.files.get('a').size;
        const incomplete = await f.open(); assert((await incomplete.validation).code === 'INCOMPLETE_SUMMARY' && !incomplete.stale); incomplete.close();
        (await f.open('a', { reload: true })).close(); (await f.open()).close();
        assert(f.gets() === 3 && f.source.getChatCacheStats().entries === 0);
    });
    await test('D34 实时比对（纯函数）：楼数、末楼时间、候选数与 swipe_id；单候选有无 swipes 数组等价', async () => {
        const rows = [{ mes: '一', send_date: '2026-10-21 09:00' }, { mes: '二', swipes: ['二', '二b'], swipe_id: 1, send_date: '2026-10-21 09:01' }];
        const host = structuredClone(rows); Object.assign(host[0], { swipes: ['一'], swipe_id: 0, extra: { 宿主额外字段: true } });
        assert(matchesHostChat(rows, host), '等价的宿主内存应算一致');
        assert(!matchesHostChat(rows, [...host, { mes: '三', send_date: '2026-10-21 09:02' }]), '多一楼');
        assert(!matchesHostChat(rows, host.map((m, i) => i === 1 ? { ...m, send_date: '2026-10-21 09:05' } : m)), '末楼时间');
        assert(!matchesHostChat(rows, host.map((m, i) => i === 1 ? { ...m, swipe_id: 0 } : m)), 'swipe_id');
        assert(!matchesHostChat(rows, host.map((m, i) => i === 1 ? { ...m, swipes: ['二', '二b', '二c'] } : m)), '候选数');
        assert(matchesHostChat([], []) && !matchesHostChat(rows, null) && !matchesHostChat(null, host));
    });
    await test('D34 宿主当前聊天：命中时零网络比对；一致直接用缓存，不一致当 reload 冷读且不发变化通知', async () => {
        const f = fixture(); f.ctx.chat = structuredClone(f.files.get('a').rows.slice(1));
        const first = await f.open('a'), events = []; first.onStale(event => events.push(event));
        const searches = () => f.calls.filter(call => call.url === '/api/chats/search').length, before = searches();
        const hit = await f.open('a'); const v = await hit.validation;
        assert(hit.cacheHit && v.state === 'fresh' && v.source === 'host' && searches() === before && f.gets() === 1, '一致时应零网络'); hit.close();
        // ST 里发了一条（宿主内存与文件都已有）：再开直接冷读到新楼，不弹横幅
        const row = { name: '虚构旅人', is_user: true, mes: '新的虚构消息', send_date: 2000 };
        f.files.get('a').rows.push(row); f.files.get('a').size++; f.ctx.chat.push(structuredClone(row));
        const fresh = await f.open('a');
        assert(!fresh.cacheHit && fresh.total === 5 && fresh.getMessage(4).swipes[0].text === '新的虚构消息' && f.gets() === 2);
        await tick(); assert(events.length === 0 && !first.stale, '当前聊天的变化不该走横幅');
        const stats = f.source.getChatCacheStats(); assert(stats.liveChecks === 2 && stats.liveReloads === 1);
        // 换 swipe（只改宿主内存的 swipe_id 也要冷读——阅读器显示 ST 当前候选）
        Object.assign(f.ctx.chat[0], { swipes: [f.ctx.chat[0].mes, '另一个虚构候选'], swipe_id: 1 }); // 只改测试替身，不是宿主
        f.files.get('a').rows[1] = { ...f.files.get('a').rows[1], swipes: f.ctx.chat[0].swipes, swipe_id: 1 };
        const swiped = await f.open('a'); assert(!swiped.cacheHit && swiped.getMessage(0).swipeId === 1);
        first.close(); fresh.close(); swiped.close();
    });
    await test('D34 ST 先发事件后存盘：文件落后于宿主内存时稍等重读，最多约 2 秒，不会无限等', async () => {
        const waits = [];
        const f = fixture({ wait: async ms => { waits.push(ms); if (waits.length === 2) { f.files.get('a').rows.push(pendingRow); f.files.get('a').size++; } } });
        const pendingRow = { name: '虚构角色', mes: '刚生成完、还没存盘', send_date: 3000 };
        f.ctx.chat = [...structuredClone(f.files.get('a').rows.slice(1)), structuredClone(pendingRow)];
        const handle = await f.open('a');
        assert(handle.total === 5 && waits.join() === '250,500' && f.gets() === 3, `等了 ${waits}`); handle.close();
        const g = fixture({ wait: async ms => { waits.push(ms); } }); waits.length = 0;
        g.ctx.chat = [...structuredClone(g.files.get('a').rows.slice(1)), { mes: '永远存不进来', send_date: 9 }];
        const stuck = await g.open('a'); assert(stuck.total === 4 && waits.join() === '250,500,1000' && g.gets() === 4, '应在 3 次后放弃并显示文件内容'); stuck.close();
        assert(g.source.getChatCacheStats().hostSaveWaits === 3);
    });
    await test('D34 事件作废：invalidateChat 去掉缓存项与在途冷读，不读文件；下次打开冷读', async () => {
        const f = fixture(); (await f.open('b')).close(); const calls = f.calls.length;
        assert(f.source.invalidateChat('fixture.png/b') && f.calls.length === calls, '作废不应发请求');
        assert(!f.source.invalidateChat('fixture.png/b') && !f.source.invalidateChat(null) && !f.source.invalidateChat('坏键'));
        assert(f.source.getChatCacheStats().entries === 0 && f.source.getChatCacheStats().eventInvalidations === 1);
        const again = await f.open('b'); assert(!again.cacheHit && f.gets() === 2); again.close();
    });
    await test('D34 只读订阅九个 ST 事件：作废当前聊天；删除事件按文件名作废；退订干净；回调不碰宿主', async () => {
        const listeners = new Map(), eventSource = { on: (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]), removeListener: (type, fn) => listeners.set(type, (listeners.get(type) ?? []).filter(x => x !== fn)) };
        const event_types = Object.fromEntries([...INVALIDATING_EVENTS, 'GENERATION_STARTED'].map(name => [name, name.toLowerCase()]));
        const f = fixture(); Object.assign(f.ctx, { eventSource, event_types });
        const chatBefore = JSON.stringify(f.ctx.chat ?? null);
        const stop = f.source.watchHostChatEvents();
        assert(INVALIDATING_EVENTS.length === 9 && INVALIDATING_EVENTS.every(name => listeners.get(name.toLowerCase())?.length === 1) && !listeners.has('generation_started'));
        for (const name of INVALIDATING_EVENTS.filter(n => !n.endsWith('DELETED'))) {
            (await f.open('a')).close();
            listeners.get(name.toLowerCase())[0](0);
            assert(!f.source.getChatCacheStats().keys.includes('fixture.png/a'), `${name} 未作废当前聊天`);
        }
        (await f.open('b')).close(); (await f.open('c')).close();
        listeners.get('chat_deleted')[0]('b.jsonl');
        assert(f.source.getChatCacheStats().keys.join() === 'fixture.png/c', '删除事件应按文件名作废非当前聊天');
        assert(JSON.stringify(f.ctx.chat ?? null) === chatBefore);
        stop(); assert([...listeners.values()].every(list => list.length === 0), '退订后仍有监听');
        stop();
    });
    await test('默认只留最近 3 个，命中更新 LRU；淘汰不损坏仍打开的句柄', async () => {
        const f = fixture(); (await f.open('a')).close(); const b = await f.open('b'); b.page(0);
        (await f.open('c')).close(); (await f.open('a')).close(); (await f.open('d')).close();
        const stats = f.source.getChatCacheStats(); assert(stats.maxEntries === 3 && stats.maxBytes === 150_000_000 && stats.entries === 3);
        assert(stats.keys.join(',') === 'fixture.png/c,fixture.png/a,fixture.png/d', 'LRU 次序错误');
        assert(b.getMessage(0).swipes[0].text === 'b虚构楼0'); b.close();
        (await f.open('b')).close(); assert(f.gets() === 5);
    });
    await test('总字节先于数量上限淘汰；超大单聊仍能读但不保留', async () => {
        const probe = fixture(); (await probe.open()).close(); const one = probe.source.getChatCacheStats().bytes;
        const f = fixture({ cacheBytes: one * 2 - 1 }); (await f.open('a')).close(); (await f.open('b')).close();
        assert(f.source.getChatCacheStats().entries === 1 && f.source.getChatCacheStats().bytes < one * 2);
        const tiny = fixture({ cacheBytes: one - 1 }); const handle = await tiny.open(); assert(handle.page(0).messages.length === 4); handle.close();
        (await tiny.open()).close(); assert(tiny.gets() === 2 && tiny.source.getChatCacheStats().bytes === 0);
    });
    await test('已构建模型和页的开销也计入限额；增长越界立即淘汰', async () => {
        const probe = fixture(); (await probe.open()).close(); const base = probe.source.getChatCacheStats().bytes;
        const f = fixture({ cacheBytes: base + 100 }), handle = await f.open();
        assert(handle.page(0).messages.length === 4 && handle.getMessage(3).index === 3);
        assert(f.source.getChatCacheStats().entries === 0 && f.source.getChatCacheStats().bytes === 0); handle.close();
    });
    await test('不同 pageSize 的页互不串用，模型可共享，空聊天保留旧接口', async () => {
        const f = fixture(), two = await f.open('a', { pageSize: 2 }), three = await f.open('a', { pageSize: 3 });
        assert(two.page(1).start === 2 && three.page(1).start === 3 && two.page(0) !== three.page(0));
        assert(two.getMessage(0) === three.getMessage(0)); two.close(); three.close();
        f.files.get('b').rows.length = 1; const empty = await f.open('b'); assert(empty.total === 0 && empty.pageCount === 0 && empty.page(0).messages.length === 0); empty.close();
    });
    await test('每个打开动作拥有独立句柄，close 不影响别的句柄且不能复活旧句柄', async () => {
        const f = fixture(), a = await f.open(), b = await f.open(); a.close(); a.close();
        await rejects(() => a.page(0), 'CLOSED'); await rejects(() => a.getRegexContext(0), 'CLOSED'); assert(!b.closed && b.page(0).messages.length === 4); b.close();
    });
    await test('D28 命中沿用角色与群快照不等网络；reload 更新作用域和群元信息', async () => {
        const f = fixture(); (await f.open()).close(); f.card.data.extensions.regex_scripts = [{ id: '新版虚构正则' }];
        const cached = await f.open(); assert(cached.getRegexContext(0).character.data.extensions.regex_scripts.length === 0); await cached.validation; cached.close();
        const a = await f.open('a', { reload: true }); assert(a.getRegexContext(0).character.data.extensions.regex_scripts[0].id === '新版虚构正则'); a.close();
        (await f.source.openChat('group:g/a')).close(); f.group.chat_metadata.note = '更新';
        const g2 = await f.source.openChat('group:g/a'); assert(g2.header.metadata.note === '最初'); await g2.validation; g2.close();
        const g3 = await f.source.openChat('group:g/a', { reload: true });
        assert(g3.header.metadata.note === '更新' && g3.total === 4 && g3.getRegexContext(0).character.avatar === 'fixture.png'); g3.close();
        assert(f.gets() === 4);
    });
    await test('同聊天并发只共享一份读取，取消一个等待者不会取消另一个', async () => {
        const gate = deferred(), reached = deferred();
        const f = fixture({ beforeRead: async url => { if (url === '/api/chats/get') { reached.resolve(); await gate.promise; } } });
        const controller = new AbortController(), first = f.open('a', { signal: controller.signal }); const cancelled = first.catch(error => error);
        const second = f.open(); await reached.promise; await tick(); controller.abort(); gate.resolve();
        assert((await cancelled).name === 'AbortError'); const handle = await second; assert(f.gets() === 1 && handle.page(0).messages.length === 4); handle.close();
    });
    await test('所有等待者取消后不缓存迟到响应，下次能重新读取', async () => {
        const gate = deferred(), reached = deferred();
        const f = fixture({ beforeRead: async url => { if (url === '/api/chats/get') { reached.resolve(); await gate.promise; } } });
        const controller = new AbortController(), pending = f.open('a', { signal: controller.signal }).catch(error => error);
        await reached.promise; controller.abort(); gate.resolve(); assert((await pending).name === 'AbortError'); await tick();
        assert(f.source.getChatCacheStats().entries === 0); (await f.open()).close(); assert(f.gets() === 2);
    });
    await test('显式清缓存与新页面实例都不继承正文；旧活动句柄仍可读', async () => {
        const f = fixture(), handle = await f.open(); handle.page(0); f.source.clearChatCache();
        assert(f.source.getChatCacheStats().entries === 0 && handle.getMessage(0).index === 0); handle.close();
        (await f.open()).close(); assert(f.gets() === 2 && fixture().source.getChatCacheStats().entries === 0);
    });
    await test('清缓存隔离在途旧请求：不重填、不加入、不淘汰新缓存', async () => {
        const gate = deferred(), reached = deferred();
        const f = fixture({ beforeRead: async url => { if (url === '/api/chats/get') { reached.resolve(); await gate.promise; } } });
        const work = f.open(); await reached.promise; f.source.clearChatCache(); gate.resolve();
        const handle = await work; assert(handle.page(0).messages.length === 4 && f.source.getChatCacheStats().entries === 0); handle.close();
        const oldSummary = deferred(), readingSummary = deferred(); let searches = 0, gets = 0;
        const source = createChatSource({ getContext: () => ({}), read: async url => {
            if (url === '/api/characters/get') return { name: '虚构角色', data: {} };
            if (url === '/api/chats/search') {
                const version = ++searches === 1 ? 1 : 2;
                if (version === 1) { readingSummary.resolve(); await oldSummary.promise; }
                return [{ file_name: 'a.jsonl', file_size: version, last_mes: version }];
            }
            return [{ user_name: '虚构旅人' }, { mes: ++gets === 1 ? '清空后的新正文' : '清空前的迟到正文' }];
        } });
        const oldWork = source.openChat('fixture.png/a'); await readingSummary.promise; source.clearChatCache();
        const newWork = source.openChat('fixture.png/a'); await tick();
        try {
            assert(searches === 2, '清空后的打开加入了旧请求');
            const fresh = await newWork, page = fresh.page(0); fresh.close(); oldSummary.resolve(); (await oldWork).close();
            assert(source.getChatCacheStats().entries === 1 && source.getChatCacheStats().invalidations === 0, '迟到旧摘要淘汰了新缓存');
            const next = await source.openChat('fixture.png/a'); await next.validation;
            assert(next.page(0) === page && gets === 2 && next.getMessage(0).swipes[0].text === '清空后的新正文', '迟到响应覆盖了新数据'); next.close();
        } finally { oldSummary.resolve(); }
    });
    await test('预取只准备当前聊天第一页；列表并行读取不重复预取', async () => {
        const f = fixture({ prefetchOnList: true });
        await Promise.all([f.source.listCharacters(), f.source.listGroups(), f.source.listRecent()]);
        for (let i = 0; !f.source.getChatCacheStats().prefetches && i < 50; i++) await tick();
        assert(f.gets() === 1 && f.source.getChatCacheStats().prefetches === 1 && f.source.getChatCacheStats().keys.join() === 'fixture.png/a');
        const handle = await f.open(); const page = handle.page(0); handle.close();
        await f.source.prefetchCurrentChat(); const next = await f.open(); assert(next.page(0) === page && f.gets() === 1); next.close();
    });
    await test('预取失败不阻断列表；未选聊天不取正文，已取消信号不发请求', async () => {
        const f = fixture({ prefetchOnList: true, beforeRead: url => { if (url === '/api/chats/get') throw new Error('虚构读取失败'); } });
        assert((await f.source.listRecent()).length === 4); await tick();
        f.ctx.getCurrentChatId = () => null; assert(await f.source.prefetchCurrentChat() === false);
        const controller = new AbortController(); controller.abort(); const before = f.calls.length;
        await rejects(() => f.open('a', { signal: controller.signal }), 'AbortError'); assert(f.calls.length === before);
    });
    await test('D28 慢 search 不阻塞句柄；同时重开共享校验，取消后续调用不影响已打开者', async () => {
        const gate = deferred(), reached = deferred(); let slow = false;
        const f = fixture({ beforeRead: async url => { if (slow && url === '/api/chats/search') { reached.resolve(); await gate.promise; } } });
        (await f.open()).close(); slow = true;
        const a = await Promise.race([f.open(), tick().then(() => { throw new Error('缓存句柄仍在等网络'); })]);
        await reached.promise;
        const b = await f.open(); assert(a.validation === b.validation && a.page(0) === b.page(0));
        const controller = new AbortController(); controller.abort(); await rejects(() => f.open('a', { signal: controller.signal }), 'AbortError');
        assert(f.calls.filter(x => x.url === '/api/characters/get').length === 1 && f.calls.filter(x => x.url === '/api/chats/search').length === 2);
        gate.resolve(); assert((await a.validation).state === 'fresh'); a.close(); b.close();
    });
    await test('D28 通知可退订、close 自动退订、晚订阅补发且每个订阅只发一次', async () => {
        const f = fixture(), old = await f.open(); let removed = 0, closed = 0, late = 0;
        const off = old.onStale(() => removed++); off(); off(); old.onStale(() => closed++); old.close();
        f.files.get('a').size++;
        const a = await f.open(); await a.validation;
        a.onStale(() => late++); await tick();
        const b = await f.open(); await b.validation; await tick();
        assert(removed === 0 && closed === 0 && late === 1 && a.stale && b.stale);
        b.onStale(() => closed++); b.close(); await tick(); assert(closed === 0);
        await rejects(() => old.onStale(() => {}), 'CLOSED'); a.close();
    });
    await test('D28 一个通知抛错不阻断其他订阅或误报校验失败', async () => {
        const f = fixture(), a = await f.open(); let delivered = 0;
        const original = console.error; console.error = () => {};
        try {
            a.onStale(() => { throw new Error('虚构 UI 错误'); }); a.onStale(() => delivered++);
            f.files.get('a').size++; const b = await f.open();
            assert((await b.validation).state === 'stale' && delivered === 1); b.close();
        } finally { console.error = original; a.close(); }
    });
    await test('D28 群聊同样后台通知，使用群 ID 查摘要和文件 ID 读正文', async () => {
        const f = fixture(), a = await f.source.openChat('group:g/a'); f.files.get('a').date++;
        const b = await f.source.openChat('group:g/a'); assert((await b.validation).state === 'stale' && b.page(0) === a.page(0));
        assert(f.calls.filter(x => x.url === '/api/chats/search').every(x => x.body.group_id === 'g'));
        assert(f.calls.find(x => x.url === '/api/chats/group/get').body.id === 'a'); a.close(); b.close();
    });
    await test('D28 清空、淘汰、重载隔离迟到校验；不通知、不重填、不污染新快照', async () => {
        for (const action of ['clear', 'evict', 'reload']) {
            const gate = deferred(), reached = deferred(); let searches = 0;
            const f = fixture({ cacheEntries: 1, beforeRead: async url => {
                if (url === '/api/chats/search' && ++searches === 2) { reached.resolve(); await gate.promise; }
            } });
            const old = await f.open(); let events = 0; old.onStale(() => events++);
            f.files.get('a').size++; const cached = await f.open(); await reached.promise;
            if (action === 'clear') f.source.clearChatCache();
            else if (action === 'evict') (await f.open('b')).close();
            else (await f.open('a', { reload: true })).close();
            gate.resolve(); assert((await cached.validation).state === 'discarded' && events === 0);
            assert(f.source.getChatCacheStats().entries === (action === 'clear' ? 0 : 1)); old.close(); cached.close();
        }
    });
    await test('D28 显式重载隔离在途冷读，旧响应不能覆盖新快照', async () => {
        const gate = deferred(), reached = deferred(); let gets = 0;
        const f = fixture({ beforeRead: async url => { if (url === '/api/chats/get' && ++gets === 1) { reached.resolve(); await gate.promise; } } });
        const pending = f.open(); await reached.promise;
        const fresh = await f.open('a', { reload: true }), page = fresh.page(0); fresh.close();
        gate.resolve(); (await pending).close(); const cached = await f.open(); await cached.validation;
        assert(cached.page(0) === page && f.gets() === 2); cached.close();
    });
    return results;
}
