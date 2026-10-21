// ST Reader — AGPL-3.0
// T70 / D33 自动备份的纯逻辑与服务流程。网络全部是内存替身（假的 user/files 目录），不发任何真实请求。
import { createBackupService, dailyCandidates, dailyName, MAIN_FILE, planRotation, planSync, toBase64 } from './backupService.js';
import { createHostSettings, hostBackedSettings } from './hostSettings.js';
import { createStore, mergeNewer } from './store.js';
import { memoryStorage, seedStore, TEST_CONTEXT } from './persistence.test.js';
import { createTextAnchor } from './anchor.js';

const assert = (value, message = 'T70 断言失败') => { if (!value) throw new Error(message); };
const equal = (a, b, label = '') => assert(JSON.stringify(a) === JSON.stringify(b), `${label}${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const fromBase64 = text => new TextDecoder().decode(Uint8Array.from(atob(text), c => c.charCodeAt(0)));

/** 假的 ST：一个用户的 user/files 目录 + extension_settings；可让某类请求失败。 */
function fakeServer(files = new Map()) {
    const server = { files, calls: [], fail: {}, saves: 0, extensionSettings: {} };
    server.fetchImpl = async (url, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : null;
        server.calls.push({ url, method: init.method, body });
        const kind = url.startsWith('/user/files/') ? 'read' : url.replace('/api/files/', '');
        if (server.fail[kind]) return new Response('fail', { status: server.fail[kind] });
        if (kind === 'read') {
            const name = decodeURIComponent(url.slice('/user/files/'.length));
            return files.has(name) ? new Response(files.get(name)) : new Response('Not Found', { status: 404 });
        }
        if (kind === 'upload') {
            assert(/^[a-zA-Z0-9_\-.]+$/.test(body.name), `文件名不合 ST 规则：${body.name}`);
            files.set(body.name, fromBase64(body.data));
            return Response.json({ path: `user/files/${body.name}` });
        }
        if (kind === 'verify') return Response.json(Object.fromEntries(body.urls.map(u => [u, files.has(u.replace('user/files/', ''))])));
        if (kind === 'delete') {
            const name = body.path.replace('user/files/', '');
            if (!files.has(name)) return new Response('File not found', { status: 404 });
            files.delete(name); return new Response('OK');
        }
        throw new Error(`测试未声明此请求：${url}`);
    };
    server.context = () => ({ extensionSettings: server.extensionSettings, saveSettingsDebounced: () => { server.saves++; }, getRequestHeaders: () => ({ 'X-CSRF-Token': 'synthetic' }) });
    return server;
}
function fakeTimers() {
    const timers = { queue: new Map(), next: 1 };
    timers.setTimeout = (fn, ms) => { const id = timers.next++; timers.queue.set(id, { fn, ms }); return id; };
    timers.clearTimeout = id => timers.queue.delete(id);
    timers.run = () => { const all = [...timers.queue.values()]; timers.queue.clear(); all.forEach(item => item.fn()); return all.length; };
    return timers;
}
function clock(start = '2026-10-21T09:30:00') {
    let time = new Date(start).getTime();
    return { now: () => new Date(time), iso: () => new Date(time).toISOString(), tick: (ms = 1000) => { time += ms; }, set: value => { time = new Date(value).getTime(); } };
}
/** 一个"浏览器"：自己的 IndexedDB（内存）+ 共享的服务器。 */
function browser(server, time, { storage = memoryStorage() } = {}) {
    const store = createStore({ storage, lock: false, now: time.iso });
    const host = createHostSettings({ getContext: server.context });
    const timers = fakeTimers();
    let n = 0;
    const service = createBackupService({ store, host, fetchImpl: server.fetchImpl, getContext: server.context, now: time.now, timers, uuid: () => `id-${++n}-${Math.random().toString(36).slice(2, 6)}` });
    return { store, host, timers, service, storage };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

export async function testBackupServiceLogic() {
    // 失败路径会按设计打 console.warn；测试期间收起来，结束恢复
    const warn = console.warn;
    console.warn = () => {};
    try { return await run(); } finally { console.warn = warn; }
}

async function run() {
    const results = [], test = async (name, body) => { await body(); results.push({ name: `备份：${name}`, passed: true }); };

    await test('rev 比对：本地空 / 换浏览器 / 别处写过 → 合并；本地有新改动 → 备份；一致 → 不动', () => {
        const host = { mirrorId: 'A', rev: 5 };
        equal(planSync({ local: { empty: true, rev: 0, syncedId: null, syncedRev: 0 }, host }), 'restore');
        equal(planSync({ local: { empty: false, rev: 9, syncedId: 'B', syncedRev: 9 }, host }), 'restore', '指针不同：');
        equal(planSync({ local: { empty: false, rev: 3, syncedId: 'A', syncedRev: 3 }, host }), 'restore', '本地落后：');
        equal(planSync({ local: { empty: false, rev: 7, syncedId: 'A', syncedRev: 5 }, host }), 'mirror');
        equal(planSync({ local: { empty: false, rev: 5, syncedId: 'A', syncedRev: 5 }, host }), 'none');
        equal(planSync({ local: { empty: false, rev: 5, syncedId: null, syncedRev: 0 }, host: {} }), 'restore', '没有指针也先探文件：');
    });
    await test('日备份文件名与轮替：只认自己的前缀，按日期留最近 7 份', () => {
        equal(dailyName(new Date(2026, 9, 1)), 'st-reader-backup-20261001.json');
        const names = ['other.json', 'st-reader-backup.json', 'st-reader-backup-notes.json', 'my-st-reader-backup-20261001.json',
            ...Array.from({ length: 9 }, (_, i) => dailyName(new Date(2026, 9, 21 - i)))];
        const plan = planRotation(names);
        equal(plan.keep.length, 7); equal(plan.keep[0], 'st-reader-backup-20261021.json'); equal(plan.keep[6], 'st-reader-backup-20261015.json');
        equal(plan.remove, ['st-reader-backup-20261014.json', 'st-reader-backup-20261013.json']);
        const candidates = dailyCandidates(new Date(2026, 9, 21), ['st-reader-backup-20250101.json', 'evil.json']);
        assert(candidates.includes('st-reader-backup-20250101.json') && !candidates.includes('evil.json') && candidates.includes('st-reader-backup-20260912.json'));
    });
    await test('base64：中文与 emoji 往返一致', () => {
        const text = '雾岚（虚构）的批注 ✨ — 第 12 楼'.repeat(5000);
        equal(fromBase64(toBase64(text)), text);
    });
    await test('合并规则：同 id 以 updatedAt 新者胜，屏蔽词并集，设置只补缺', () => {
        const record = (id, updatedAt, note) => ({ id, updatedAt, createdAt: '2026-10-01T00:00:00.000Z', note });
        const target = { annotations: { a: record('a', '2026-10-02T00:00:00Z', '本地旧'), b: record('b', '2026-10-05T00:00:00Z', '本地新'), c: record('c', '2026-10-01T00:00:00Z', '只本地') },
            bookmarks: {}, maskWords: ['星灯'], settings: { font: 18 }, replaceRules: {}, assets: {} };
        const incoming = { annotations: { a: record('a', '2026-10-03T00:00:00Z', '服务器新'), b: record('b', '2026-10-04T00:00:00Z', '服务器旧'), d: record('d', '2026-10-01T00:00:00Z', '只服务器') },
            bookmarks: {}, maskWords: ['雾岛', '星灯'], settings: { font: 20, width: 700 }, replaceRules: {}, assets: {} };
        const result = mergeNewer(target, incoming);
        equal(target.annotations.a.note, '服务器新'); equal(target.annotations.b.note, '本地新');
        equal(target.annotations.c.note, '只本地'); equal(target.annotations.d.note, '只服务器');
        equal(target.maskWords, ['星灯', '雾岛']); equal(target.settings, { font: 18, width: 700 });
        equal(result.report.annotations, { added: 1, updated: 1, kept: 1 });
        assert(result.changed && result.localNewer);
        const same = structuredClone(incoming), copy = structuredClone(incoming);
        const noop = mergeNewer(same, copy);
        assert(!noop.changed && !noop.localNewer, '完全一致时不算改动');
    });

    await test('改一条批注 → 3 秒防抖 → 写 st-reader-backup.json（内容 = 快照）、日备份、ST 设置指针', async () => {
        const server = fakeServer(), time = clock(), a = browser(server, time);
        await a.service.start();
        equal(server.files.size, 0, '空库启动不该写：');
        await seedStore(a.store); await settle();
        equal(a.service.getMirrorStatus().state, 'pending');
        equal([...a.timers.queue.values()].map(item => item.ms), [3000]);
        a.timers.run(); await a.service.flushMirror(); await settle();
        const written = server.files.get(MAIN_FILE);
        const snap = JSON.parse((await a.store.snapshot()).json), file = JSON.parse(written);
        equal(file.data, snap.data); equal(file.rev, snap.rev); equal(file.format, 'st-reader');
        equal(file.data, JSON.parse(await a.store.exportAll()).data, '与 exportAll 数据一致：');
        assert(server.files.get('st-reader-backup-20261021.json') === written, '缺当天日备份');
        const pointer = server.extensionSettings['st-reader'];
        equal(pointer.rev, snap.rev); assert(pointer.mirrorId && pointer.bytes === new TextEncoder().encode(written).length && pointer.mirroredAt);
        assert(server.saves >= 1, '没调 saveSettingsDebounced');
        equal(a.service.getMirrorStatus().state, 'ok');
        // 同一天再改：只写主文件，不再写日备份
        const uploads = () => server.calls.filter(call => call.url === '/api/files/upload').length, before = uploads();
        await a.store.settings.set('x', 1); a.timers.run(); await a.service.flushMirror();
        equal(uploads() - before, 1);
        // 没改动时"立即备份"以外的 flush 不写
        await a.service.mirrorNow(); equal(uploads() - before, 1, '无改动不该再写：');
        await a.service.mirrorNow({ force: true }); equal(uploads() - before, 2, '立即备份应强制写：');
    });
    await test('清空浏览器数据 → 启动自动合并回来，且不立刻回写', async () => {
        const server = fakeServer(), time = clock(), a = browser(server, time);
        await a.service.start(); await seedStore(a.store); a.timers.run(); await a.service.flushMirror();
        const uploads = server.calls.filter(call => call.url === '/api/files/upload').length;
        const b = browser(server, time); // 同一个 ST、全新的 IndexedDB
        const { restored } = await b.service.start();
        equal(restored.annotations.added, 1); equal(restored.bookmarks.added, 1); equal(restored.maskWords.added, 2);
        equal((await b.store.annotations.list()).map(r => r.note), ['虚构批注']);
        equal(await b.store.settings.get('reader'), { fontSize: 18, lineHeight: 1.8 });
        await settle(); equal(b.timers.queue.size, 0, '恢复本身不该排备份：');
        equal(server.calls.filter(call => call.url === '/api/files/upload').length, uploads);
        const rev = await b.store.revision();
        equal(rev.syncedId, server.extensionSettings['st-reader'].mirrorId);
        equal(planSync({ local: rev, host: server.extensionSettings['st-reader'] }), 'none', '恢复后应一致：');
    });
    await test('读不到服务器备份时，空浏览器绝不用空数据覆盖服务器', async () => {
        const server = fakeServer(), time = clock(), a = browser(server, time);
        await a.service.start(); await seedStore(a.store); a.timers.run(); await a.service.flushMirror();
        const original = server.files.get(MAIN_FILE);
        server.fail.read = 500;
        const b = browser(server, time);
        const started = await b.service.start();
        equal(started.error.code, 'HTTP_500');
        await b.store.settings.set('only-here', true); b.timers.run(); await b.service.flushMirror();
        equal(server.files.get(MAIN_FILE), original, '服务器文件被覆盖了：');
        equal(b.service.getMirrorStatus().state, 'error');
        server.fail.read = 0; // 恢复后：先合并，再把并集写上去
        await b.service.mirrorNow();
        const file = JSON.parse(server.files.get(MAIN_FILE));
        assert(Object.keys(file.data.annotations).length === 1 && file.data.settings['only-here'] === true, '应写入并集');
    });
    await test('两个浏览器：别处写过就先合并，再写并集', async () => {
        const server = fakeServer(), time = clock(), a = browser(server, time);
        await a.service.start(); await seedStore(a.store); a.timers.run(); await a.service.flushMirror();
        const b = browser(server, time);
        await b.service.start();
        time.tick(60000);
        const anchor = await createTextAnchor('前文目标后文', 0, 2, { ...TEST_CONTEXT, mesIndex: 3 });
        await b.store.annotations.put({ anchor, title: '虚构测试', preview: '前文', note: 'B 写的' }); b.timers.run(); await b.service.flushMirror();
        // A 不知道 B 写过（同一份 extension_settings 已被 B 改了指针）：A 再改时先合并
        time.tick(60000);
        await a.store.maskWords.add('只在 A'); a.timers.run(); await a.service.flushMirror();
        const file = JSON.parse(server.files.get(MAIN_FILE));
        equal(Object.values(file.data.annotations).map(r => r.note).sort(), ['B 写的', '虚构批注']);
        assert(file.data.maskWords.includes('只在 A'));
        equal((await a.store.annotations.list()).length, 2, 'A 本地也应拿到 B 的批注');
    });
    await test('跨天：每天第一次写另存日备份，只留 7 份，只删自己的文件', async () => {
        const files = new Map([['other.json', '别的扩展'], ['st-reader-backup-notes.json', '用户自己的']]);
        for (let i = 1; i <= 8; i++) files.set(dailyName(new Date(2026, 9, 21 - i)), '旧');
        const server = fakeServer(files), time = clock(), a = browser(server, time);
        await a.service.start(); await a.store.settings.set('k', 1); a.timers.run(); await a.service.flushMirror();
        const dailies = [...server.files.keys()].filter(name => /^st-reader-backup-\d{8}\.json$/.test(name)).sort();
        equal(dailies.length, 7); equal(dailies.at(-1), 'st-reader-backup-20261021.json'); equal(dailies[0], 'st-reader-backup-20261015.json');
        assert(server.files.get('other.json') === '别的扩展' && server.files.has('st-reader-backup-notes.json'), '删了别人的文件');
        assert(server.calls.filter(call => call.url === '/api/files/delete').every(call => /^user\/files\/st-reader-backup-\d{8}\.json$/.test(call.body.path)));
        equal(server.extensionSettings['st-reader'].dailies.length, 7);
        time.set('2026-10-22T08:00:00'); await a.store.settings.set('k', 2); a.timers.run(); await a.service.flushMirror();
        const next = [...server.files.keys()].filter(name => /^st-reader-backup-\d{8}\.json$/.test(name)).sort();
        equal(next.length, 7); equal(next.at(-1), 'st-reader-backup-20261022.json');
    });
    await test('ST 文件接口不可用 / 没有 ST 设置：给出原因，不抛错', async () => {
        const server = fakeServer(), time = clock(), a = browser(server, time);
        await a.service.start(); server.fail.upload = 404;
        await a.store.settings.set('k', 1); a.timers.run();
        const status = await a.service.flushMirror();
        equal(status.state, 'error'); equal(status.code, 'FILES_UNAVAILABLE'); equal(status.message, 'ST 文件接口不可用');
        const lonely = createBackupService({ store: createStore({ storage: memoryStorage(), lock: false }), host: createHostSettings({ getContext: () => ({}) }), fetchImpl: server.fetchImpl, timers: fakeTimers() });
        await lonely.start(); equal(lonely.getMirrorStatus().state, 'unavailable');
        const manual = await a.service.restoreFromServer();
        assert(!manual.ok && manual.code === 'NO_BACKUP', '没有备份文件时手动恢复应说明');
    });
    await test('已读版本与更新提醒走 ST 设置；旧版存在 IndexedDB 的值仍可读', async () => {
        const server = fakeServer(), store = createStore({ storage: memoryStorage(), lock: false });
        const host = createHostSettings({ getContext: server.context }), settings = hostBackedSettings(store.settings, host);
        await store.settings.set('lastSeenVersion', '0.2.1');
        equal(await settings.get('lastSeenVersion'), '0.2.1', '旧值回落：');
        equal(server.extensionSettings['st-reader'].lastSeenVersion, '0.2.1', '旧值应补写进 ST 设置：');
        await settings.set('lastSeenVersion', '0.3.0');
        equal(server.extensionSettings['st-reader'].lastSeenVersion, '0.3.0'); equal(await store.settings.get('lastSeenVersion'), '0.3.0');
        const cleared = hostBackedSettings(createStore({ storage: memoryStorage(), lock: false }).settings, host);
        equal(await cleared.get('lastSeenVersion'), '0.3.0', '清了浏览器也该记得看过：');
        let threw = false; try { host.patch({ chat: [] }); } catch { threw = true; }
        assert(threw, 'extension_settings 只接受登记过的字段');
    });
    return results;
}
