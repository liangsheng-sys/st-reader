// ST Reader — AGPL-3.0
// T70 / D33：把阅读器自己的数据（批注、收藏、规则、设置）自动镜像到当前 ST 用户的 user/files/。
// IndexedDB 仍是主存；每次变更后 3 秒（关阅读器、pagehide 立即）把 store.snapshot() 整份写上去。
// 只用 ST 自带的 /api/files/upload、/verify、/delete 与静态 /user/files/：不在 chats 目录，不碰聊天（D02）。
// 删除只针对本扩展自己命名的日备份 st-reader-backup-YYYYMMDD.json。

import { store as defaultStore } from './store.js';
import { hostSettings as defaultHost } from './hostSettings.js';

export const MAIN_FILE = 'st-reader-backup.json';
const DAILY = /^st-reader-backup-(\d{8})\.json$/;
const KEEP_DAILIES = 7;
const PROBE_DAYS = 40;
const KEEPALIVE_LIMIT = 60000;

export class StcrBackupError extends Error {
    constructor(code, message, status = null) { super(message); this.name = 'StcrBackupError'; this.code = code; this.status = status; }
}

const pad = n => String(n).padStart(2, '0');
/** 本地日期的日备份文件名。 */
export function dailyName(date) {
    return `st-reader-backup-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.json`;
}

/**
 * 启动时该做什么（纯函数）。local = store.revision()；host = extension_settings['st-reader']。
 * restore：先读服务器那份合并（本地空、换过浏览器、别处写过、ST 里没有指针都算）；
 * mirror：本地有服务器还没有的改动；none：已一致。
 */
export function planSync({ local, host }) {
    if (!host?.mirrorId) return 'restore'; // 没有指针也先探一下文件：可能是 settings.json 被重置
    if (local.empty) return 'restore';
    if (local.syncedId !== host.mirrorId) return 'restore';
    if (Number.isInteger(host.rev) && host.rev > local.rev) return 'restore';
    if (local.rev > local.syncedRev) return 'mirror';
    return 'none';
}

/** 日备份轮替（纯函数）：只认本扩展的文件名，按日期新到旧留 keep 份，其余删除。 */
export function planRotation(names, keep = KEEP_DAILIES) {
    const own = [...new Set(names.filter(name => DAILY.test(name)))].sort().reverse();
    return { keep: own.slice(0, keep), remove: own.slice(keep) };
}

/** 要探测是否存在的日备份：记录过的 + 最近 PROBE_DAYS 天。 */
export function dailyCandidates(today, known = []) {
    const names = new Set(known.filter(name => DAILY.test(name)));
    for (let i = 0; i < PROBE_DAYS; i++) names.add(dailyName(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)));
    return [...names];
}

/** UTF-8 字符串 → base64（分块，MB 级不爆栈）。 */
export function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}

function describe(error) {
    if (error instanceof StcrBackupError) return { code: error.code, message: error.message };
    if (error?.name === 'StcrStoreError') return { code: error.code, message: error.code === 'BACKUP_TOO_LARGE' ? '数据超过 24 MB，自动备份暂停；请手动导出' : '浏览器存储读不出来' };
    if (error?.name === 'TimeoutError') return { code: 'TIMEOUT', message: '连接 ST 超时' };
    return { code: 'NETWORK', message: '连不上 ST 服务器' };
}

/** 工厂仅用于测试注入；正式代码用下方单例。 */
export function createBackupService({ store = defaultStore, host = defaultHost, fetchImpl = (...args) => globalThis.fetch(...args),
    getContext = () => globalThis.SillyTavern?.getContext?.(), now = () => new Date(), uuid = () => crypto.randomUUID(),
    delay = 3000, timers = globalThis } = {}) {
    let timer = null, running = null, again = false, againForce = false, synced = false, syncing = null, suppress = false, started = null;
    const listeners = new Set();
    const saved = host.read();
    let status = Object.freeze({ state: saved.mirroredAt ? 'ok' : 'never', mirroredAt: saved.mirroredAt ?? null, bytes: saved.bytes ?? null,
        rev: saved.rev ?? null, code: null, message: '', restoredAt: null });

    function setStatus(patch) {
        status = Object.freeze({ ...status, ...patch });
        for (const listener of listeners) { try { listener(status); } catch (error) { console.error('[st-reader] 备份状态回调出错：', error); } }
    }
    function headers() {
        const base = getContext()?.getRequestHeaders?.();
        if (!base) throw new StcrBackupError('HOST_NOT_READY', 'ST 还没准备好');
        return { ...base, 'Content-Type': 'application/json' };
    }
    async function post(path, body, { keepalive = false } = {}) {
        const text = JSON.stringify(body);
        return fetchImpl(path, { method: 'POST', credentials: 'same-origin', redirect: 'error', headers: headers(), body: text,
            keepalive: keepalive && text.length < KEEPALIVE_LIMIT, signal: AbortSignal.timeout(60000) });
    }
    function httpError(response, what) {
        if (response.status === 404) return new StcrBackupError('FILES_UNAVAILABLE', 'ST 文件接口不可用', 404);
        if (response.status === 403 || response.status === 401) return new StcrBackupError('FORBIDDEN', 'ST 拒绝了写文件（登录可能已失效）', response.status);
        return new StcrBackupError(`HTTP_${response.status}`, `${what}失败（ST 返回 ${response.status}）`, response.status);
    }
    async function upload(name, base64, options) {
        const response = await post('/api/files/upload', { name, data: base64 }, options);
        if (!response.ok) throw httpError(response, '写备份文件');
    }
    /** 服务器那份的文本；不存在为 null。 */
    async function readServer() {
        const response = await fetchImpl(`/user/files/${MAIN_FILE}`, { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(60000) });
        if (response.status === 404) return null;
        if (!response.ok) throw httpError(response, '读服务器备份');
        return response.text();
    }
    async function rotate(today, known) {
        const candidates = dailyCandidates(today, known);
        const response = await post('/api/files/verify', { urls: candidates.map(name => `user/files/${name}`) });
        if (!response.ok) throw httpError(response, '查看日备份');
        const found = await response.json();
        const existing = candidates.filter(name => found?.[`user/files/${name}`] === true);
        const plan = planRotation(existing);
        for (const name of plan.remove) {
            // 只删自己命名的文件（planRotation 已按 DAILY 过滤）；删不掉下次再来
            const removed = await post('/api/files/delete', { path: `user/files/${name}` });
            if (!removed.ok && removed.status !== 404) plan.keep.push(name);
        }
        return plan.keep.sort().reverse();
    }

    /** 合并服务器那份。force：手动"从服务器恢复"，不看指针。返回 {report, localNewer, missing}。 */
    async function pullServer({ force = false } = {}) {
        const local = await store.revision(), pointer = host.read();
        const plan = force ? 'restore' : planSync({ local, host: pointer });
        if (plan !== 'restore') return { plan, report: null, localNewer: plan === 'mirror', missing: false };
        const text = await readServer();
        if (text === null) {
            if (force) throw new StcrBackupError('NO_BACKUP', 'ST 服务器上还没有备份文件');
            return { plan, report: null, localNewer: !local.empty, missing: true };
        }
        suppress = true; // 合并本身不触发"再备份"；需要时下面显式安排
        let merged;
        try { merged = await store.mergeBackup(text); } finally { suppress = false; }
        const after = await store.revision();
        const needMirror = merged.localNewer || !pointer.mirrorId;
        if (pointer.mirrorId) await store.markSynced({ id: pointer.mirrorId, rev: needMirror ? local.syncedRev : after.rev });
        if (merged.changed) setStatus({ restoredAt: now().toISOString() });
        return { plan, report: merged.report, localNewer: needMirror, missing: false };
    }
    function ensureSynced() {
        if (synced) return Promise.resolve(null);
        syncing ??= pullServer().then(result => { synced = true; return result; }).finally(() => { syncing = null; });
        return syncing;
    }

    async function mirrorOnce({ force = false, keepalive = false } = {}) {
        if (!host.available()) throw new StcrBackupError('HOST_UNAVAILABLE', 'ST 设置接口不可用');
        // 启动合并没成功之前绝不写：否则清空过的浏览器会用空文件盖掉服务器上的备份
        await ensureSynced();
        let pointer = host.read(), local = await store.revision();
        if (pointer.mirrorId && local.syncedId !== pointer.mirrorId) {
            await pullServer({ force: true }).catch(error => { if (error.code !== 'NO_BACKUP') throw error; });
            pointer = host.read(); local = await store.revision();
        }
        if (!force && pointer.mirrorId && local.syncedId === pointer.mirrorId && local.rev === local.syncedRev) {
            setStatus({ state: 'ok', code: null, message: '' });
            return;
        }
        setStatus({ state: 'saving' });
        const snap = await store.snapshot(), base64 = toBase64(snap.json);
        await upload(MAIN_FILE, base64, { keepalive });
        const today = now(), daily = dailyName(today);
        let dailies = Array.isArray(pointer.dailies) ? pointer.dailies : [], lastDaily = pointer.lastDaily ?? null;
        if (lastDaily !== daily && !keepalive) {
            await upload(daily, base64);
            lastDaily = daily;
            try { dailies = await rotate(today, [...dailies, daily]); }
            catch (error) { console.warn('[st-reader] 日备份轮替没完成，下次再试：', error); dailies = [...new Set([daily, ...dailies])]; }
        }
        const id = uuid(), mirroredAt = today.toISOString();
        host.patch({ rev: snap.rev, mirrorId: id, mirroredAt, bytes: snap.bytes, lastDaily, dailies });
        await store.markSynced({ id, rev: snap.rev });
        setStatus({ state: 'ok', mirroredAt, bytes: snap.bytes, rev: snap.rev, code: null, message: '' });
    }

    /** 立即备份。永不抛错，返回最新状态（state:'ok'|'error'|'unavailable'）。 */
    function mirrorNow(options = {}) {
        timers.clearTimeout(timer); timer = null;
        if (running) { again = true; againForce ||= !!options.force; return running; }
        running = (async () => {
            let next = options;
            try {
                do {
                    again = false;
                    try { await mirrorOnce(next); }
                    catch (error) {
                        const { code, message } = describe(error);
                        setStatus({ state: code === 'HOST_UNAVAILABLE' ? 'unavailable' : 'error', code, message });
                        console.warn('[st-reader] 自动备份没成功：', error);
                    }
                    next = { force: againForce }; againForce = false;
                } while (again);
            } finally { running = null; }
            return status;
        })();
        return running;
    }
    function scheduleMirror() {
        if (suppress) return;
        timers.clearTimeout(timer);
        if (status.state !== 'saving') setStatus({ state: 'pending' });
        timer = timers.setTimeout(() => { timer = null; mirrorNow(); }, delay);
    }
    /** 有排队的就立刻写（关阅读器 / pagehide）。 */
    function flushMirror(options = {}) {
        if (timer === null) return running ?? Promise.resolve(status);
        return mirrorNow(options);
    }

    /** 手动"从服务器恢复"：合并（不覆盖本地更新的内容）。返回 {ok, report?, code?, message?}。 */
    async function restoreFromServer() {
        try {
            const result = await pullServer({ force: true });
            synced = true;
            if (result.localNewer) scheduleMirror();
            return { ok: true, report: result.report };
        } catch (error) {
            return { ok: false, ...describe(error) };
        }
    }

    /** 扩展加载后调用一次：订阅变更、pagehide 兜底、启动合并。返回 {restored: report|null}，不抛错。 */
    function start({ target = globalThis } = {}) {
        if (started) return started;
        store.onChange(() => scheduleMirror());
        target.addEventListener?.('pagehide', () => { flushMirror({ keepalive: true }); });
        started = (async () => {
            if (!host.available()) { setStatus({ state: 'unavailable', code: 'HOST_UNAVAILABLE', message: 'ST 设置接口不可用' }); return { restored: null }; }
            try {
                const result = await ensureSynced();
                if (result?.localNewer) mirrorNow();
                const restored = result?.report && Object.values(result.report).some(item => item.added || item.updated) ? result.report : null;
                return { restored };
            } catch (error) {
                const { code, message } = describe(error);
                setStatus({ state: 'error', code, message });
                console.warn('[st-reader] 启动时读服务器备份没成功：', error);
                return { restored: null, error: { code, message } };
            }
        })();
        return started;
    }

    return {
        start, scheduleMirror, mirrorNow, flushMirror, restoreFromServer,
        /** 启动合并的结果；没 start 过为 null。 */
        whenStarted: () => started,
        getMirrorStatus: () => status,
        onMirrorStatus(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    };
}

export const backupService = createBackupService();
export const { start: startBackup, scheduleMirror, mirrorNow, flushMirror, restoreFromServer, getMirrorStatus, onMirrorStatus, whenStarted } = backupService;
