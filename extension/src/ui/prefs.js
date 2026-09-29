// 阅读器设置与阅读进度的临时存储（mock）。
// T13 的 core/store.js 尚未交付（06 I012），先用 localStorage 顶上；键前缀 stcr:（D12）。
// 只存阅读器自己的状态，绝不写聊天、chatMetadata、swipe_id（D02）。T13 交付后换成 store.settings，
// 并一次性把这里的旧键迁过去。

import { normalizePrefs, pruneProgress } from './logic.js';

const PREFS_KEY = 'stcr:ui:prefs:v1';
const PROGRESS_KEY = 'stcr:ui:progress:v1';

function readJson(key) {
    try { return JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null'); } catch { return null; }
}
function writeJson(key, value) {
    try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch (error) {
        console.warn('[st-reader] 阅读器设置保存失败（浏览器存储已满或被禁用）：', error);
    }
}

let prefs = normalizePrefs(readJson(PREFS_KEY));
const listeners = new Set();

export function getPrefs() { return prefs; }

/** 合并修改并保存；返回新设置。监听者拿到 (新, 旧)。 */
export function setPrefs(patch) {
    const previous = prefs;
    prefs = normalizePrefs({ ...prefs, ...patch });
    writeJson(PREFS_KEY, prefs);
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
let progress = pruneProgress(readJson(PROGRESS_KEY) ?? {});
let saveTimer = null;
function saveProgressSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => writeJson(PROGRESS_KEY, pruneProgress(progress)), 400);
}

export function getProgress(chatKey) { return progress[chatKey] ?? null; }

export function setReadPosition(chatKey, index, { title, owner } = {}) {
    const entry = progress[chatKey] ?? { sw: {} };
    progress[chatKey] = { ...entry, t: Date.now(), i: index, title: title ?? entry.title, owner: owner ?? entry.owner };
    saveProgressSoon();
}

export function rememberSwipe(chatKey, index, swipe, isStCurrent) {
    const entry = progress[chatKey] ?? { t: Date.now(), i: index, sw: {} };
    const sw = { ...entry.sw };
    // 切回 ST 当前候选时删掉记录，表里只留"与 ST 不同"的楼，体积小。
    if (isStCurrent) delete sw[index]; else sw[index] = swipe;
    progress[chatKey] = { ...entry, sw };
    saveProgressSoon();
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
    clearTimeout(saveTimer);
    writeJson(PROGRESS_KEY, pruneProgress(progress));
}
