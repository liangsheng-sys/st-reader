// ST Reader — AGPL-3.0
// 阅读器设置与阅读进度。存 T13 的 store.settings（随 JSON 备份导出），键前缀 stcr:（D12）。
// 只存阅读器自己的状态，绝不写聊天、chatMetadata、swipe_id（D02）。
// I012 迁移：T21 曾暂存在 localStorage；首次加载时若 store 里还没有，就搬过去，落盘成功后才删旧键。
// store 不可用（极少见）时退回 localStorage，保证能读能记。
// T70 / D33："更新后提醒"开关另存一份到 ST 的 extension_settings（换浏览器、清站点数据也在），以那边为准。

import { hostSettings } from '../core/hostSettings.js';
import { store } from '../core/store.js';
import { normalizePrefs, pruneProgress } from './logic.js';

const PREFS_KEY = 'stcr:ui:prefs:v1';
const PROGRESS_KEY = 'stcr:ui:progress:v1';

function readLocal(key) {
    try { return JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null'); } catch { return null; }
}
function writeLocal(key, value) {
    try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* 存储满或被禁用 */ }
}

let prefs = normalizePrefs(null);
let progress = {};
let useStore = false;
let loading = null;
const listeners = new Set();

/** 打开阅读器前 await 一次；之后同步读取。 */
export function loadPrefs() {
    loading ??= (async () => {
        try {
            await store.ready();
            prefs = normalizePrefs(await migrate(PREFS_KEY));
            progress = pruneProgress(await migrate(PROGRESS_KEY) ?? {});
            useStore = true;
        } catch (error) {
            console.warn('[st-reader] 扩展存储不可用，阅读设置暂存在浏览器本地：', error);
            prefs = normalizePrefs(readLocal(PREFS_KEY));
            progress = pruneProgress(readLocal(PROGRESS_KEY) ?? {});
            useStore = false;
        }
        const notice = hostSettings.read().updateNotice;
        if (typeof notice === 'boolean' && notice !== prefs.updateNotice) prefs = normalizePrefs({ ...prefs, updateNotice: notice });
    })();
    return loading;
}

async function migrate(key) {
    const current = await store.settings.get(key, null);
    const legacy = globalThis.localStorage?.getItem(key);
    if (current !== null) {
        if (legacy !== null && legacy !== undefined) globalThis.localStorage.removeItem(key); // store 已有，旧键多余
        return current;
    }
    if (legacy === null || legacy === undefined) return null;
    let value;
    try { value = JSON.parse(legacy); } catch { return null; } // 坏旧值：不迁，也不删
    await store.settings.set(key, value);
    globalThis.localStorage.removeItem(key);
    return value;
}

const timers = new Map();
/** 去抖写入：设置 300ms、进度 1.5s（滚动时不要每帧落盘整份快照）。 */
function saveSoon(key, getValue, delay) {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { timers.delete(key); save(key, getValue()); }, delay));
}
function save(key, value) {
    if (!useStore) { writeLocal(key, value); return Promise.resolve(); }
    return store.settings.set(key, value).catch(error => {
        console.warn('[st-reader] 阅读设置保存失败，已暂存到浏览器本地：', error);
        writeLocal(key, value); // 下次 loadPrefs 会再迁回 store
    });
}

export function getPrefs() { return prefs; }

/** 合并修改并保存；返回新设置。监听者拿到 (新, 旧)。 */
export function setPrefs(patch) {
    const previous = prefs;
    prefs = normalizePrefs({ ...prefs, ...patch });
    saveSoon(PREFS_KEY, () => prefs, 300);
    if (prefs.updateNotice !== previous.updateNotice) {
        try { hostSettings.patch({ updateNotice: prefs.updateNotice }); } catch (error) { console.warn('[st-reader] 更新提醒开关没写进 ST 设置：', error); }
    }
    for (const listener of listeners) listener(prefs, previous);
    return prefs;
}

export function onPrefsChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * 每个聊天一条：{t 最后阅读时间, i 最后阅读的零基楼号, title, owner 显示名, sw {楼号: 候选号}}。
 * 候选记忆只是"阅读器上次看的是第几个"，永不写回 ST。
 */
export function getProgress(chatKey) { return progress[chatKey] ?? null; }

export function setReadPosition(chatKey, index, { title, owner } = {}) {
    const entry = progress[chatKey] ?? { sw: {} };
    progress[chatKey] = { ...entry, t: Date.now(), i: index, title: title ?? entry.title, owner: owner ?? entry.owner };
    saveSoon(PROGRESS_KEY, () => pruneProgress(progress), 1500);
}

export function rememberSwipe(chatKey, index, swipe, isStCurrent) {
    const entry = progress[chatKey] ?? { t: Date.now(), i: index, sw: {} };
    const sw = { ...entry.sw };
    // 切回 ST 当前候选时删掉记录，表里只留"与 ST 不同"的楼，体积小。
    if (isStCurrent) delete sw[index]; else sw[index] = swipe;
    progress[chatKey] = { ...entry, sw };
    saveSoon(PROGRESS_KEY, () => pruneProgress(progress), 1500);
}

/** 最近读过的一个聊天（空状态里的"继续阅读"）。 */
export function lastRead() {
    let best = null;
    for (const [chatKey, entry] of Object.entries(progress)) {
        if (!best || entry.t > best.t) best = { chatKey, ...entry };
    }
    return best;
}

/** 关闭阅读器时立刻落盘，不等去抖。 */
export function flushProgress() {
    const pending = [];
    for (const [key, timer] of timers) {
        clearTimeout(timer);
        pending.push(save(key, key === PREFS_KEY ? prefs : pruneProgress(progress)));
    }
    timers.clear();
    return Promise.all(pending);
}

/** JSON 导入后重新读一遍（导入可能带进别处的阅读进度）。 */
export async function reloadPrefs() {
    loading = null;
    await loadPrefs();
    for (const listener of listeners) listener(prefs, prefs);
}
