// ST Reader — AGPL-3.0
import { parseChatKey } from './chatSource.js';
import { MAX_ASSETS, normalizeAssetImage } from './assetCodec.js';
import { validReplacementBackground } from './cardTransforms.js';

const STATE_KEY = 'stcr:state:v1';
const CATEGORIES = ['annotations', 'bookmarks', 'maskWords', 'settings', 'replaceRules', 'assets'];
const RECORDS = ['annotations', 'bookmarks', 'replaceRules', 'assets'];
const clone = value => structuredClone(value);
const empty = () => ({ version: 1, lastExportAt: null, rev: 0, syncedId: null, syncedRev: 0, data: { annotations: {}, bookmarks: {}, maskWords: [], settings: {}, replaceRules: {}, assets: {} } });

export class StcrStoreError extends Error {
    constructor(code, message) { super(message); this.name = 'StcrStoreError'; this.code = code; }
}
function fail(code, message) { throw new StcrStoreError(code, message); }
function object(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INVALID_DATA', '需要普通 JSON 对象');
    return value;
}
function jsonValue(value, depth = 0) {
    if (depth > 50) fail('INVALID_DATA', 'JSON 嵌套过深');
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
    if (Array.isArray(value)) { for (const item of value) jsonValue(item, depth + 1); return; }
    object(value);
    for (const [key, child] of Object.entries(value)) {
        safeKey(key); jsonValue(child, depth + 1);
    }
}
function safeKey(key) {
    if (typeof key !== 'string' || !key || ['__proto__', 'prototype', 'constructor'].includes(key)) fail('INVALID_DATA', '对象键无效');
    return key;
}
function string(value, label, max = 100000) {
    if (typeof value !== 'string' || value.length > max) fail('INVALID_DATA', `${label}需为不超过 ${max} 字的字符串`);
    return value;
}
function index(value) { if (!Number.isInteger(value) || value < 0) fail('INVALID_DATA', '楼层/候选编号需为非负整数'); return value; }
function chatKey(value) { parseChatKey(value); return value; }
function date(value) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('INVALID_DATA', '日期格式无效');
    return value;
}
function validateAnchor(anchor) {
    object(anchor); chatKey(anchor.chatKey); index(anchor.mesIndex); index(anchor.swipeIndex);
    if (!['body', 'reasoning'].includes(anchor.part)) fail('INVALID_DATA', '锚点区域需为 body 或 reasoning');
    object(anchor.quote);
    if (!string(anchor.quote.exact, '引用原文', 200000)) fail('INVALID_DATA', '引用原文不能为空');
    string(anchor.quote.prefix, '前文', 200000); string(anchor.quote.suffix, '后文', 200000);
    if (!/^sha256:[a-f0-9]{64}$/.test(anchor.rawHash)) fail('INVALID_DATA', '锚点原文哈希无效');
}
/** 旧记录按候选编号推断类型；聊天收藏不携带楼层或候选编号。 */
function bookmarkKind(record) {
    const kind = record.kind ?? (record.swipeIndex == null ? 'floor' : 'swipe');
    if (!['chat', 'floor', 'swipe'].includes(kind)) fail('INVALID_DATA', '收藏类型需为 chat / floor / swipe');
    if (kind === 'chat') {
        if (Object.hasOwn(record, 'mesIndex') || Object.hasOwn(record, 'swipeIndex')) fail('INVALID_DATA', '聊天收藏不能携带楼层或候选编号');
    } else if ((record.swipeIndex != null) !== (kind === 'swipe')) fail('INVALID_DATA', '收藏类型与候选编号不一致');
    return kind;
}
function normalizeBookmark(record) {
    record.kind = bookmarkKind(record);
    if (record.kind !== 'chat') record.swipeIndex ??= null;
    return record;
}
/** 聊天、整楼与候选使用不同的稳定键；旧楼层/候选 ID 保持不变。 */
export function bookmarkId(record) {
    const { chatKey: key, mesIndex, swipeIndex = null } = record;
    chatKey(key);
    if (bookmarkKind(record) === 'chat') return `stcr:bookmark:${encodeURIComponent(key)}:chat`;
    index(mesIndex); if (swipeIndex !== null) index(swipeIndex);
    return `stcr:bookmark:${encodeURIComponent(key)}:${mesIndex}:${swipeIndex === null ? 'floor' : swipeIndex}`;
}
function validateRecord(category, record) {
    object(record); jsonValue(record); safeKey(record.id);
    if (!record.id.startsWith('stcr:')) fail('INVALID_DATA', '记录 ID 需要 stcr: 前缀');
    date(record.createdAt); date(record.updatedAt);
    if (category === 'annotations') {
        validateAnchor(record.anchor); string(record.title, '聊天标题', 2000); string(record.preview, '摘要', 1000); string(record.note, '批注');
        if (!['yellow', 'green', 'blue', 'pink'].includes(record.color) || typeof record.orphan !== 'boolean') fail('INVALID_DATA', '批注颜色或孤立状态无效');
        if (record.orphanReason !== null && !['text-missing', 'ambiguous'].includes(record.orphanReason)) fail('INVALID_DATA', '孤立原因无效');
    } else if (category === 'bookmarks') {
        if (record.id !== bookmarkId(record)) fail('INVALID_DATA', '收藏键与目标不一致');
        string(record.title, '聊天标题', 2000); string(record.preview, '摘要', 1000);
    } else if (category === 'replaceRules') {
        if (!string(record.from, '原词', 1000)) fail('INVALID_DATA', '原词不能为空');
        if (record.aliases !== undefined) {
            if (!Array.isArray(record.aliases)) fail('INVALID_DATA', '更多原词需为数组');
            for (const word of record.aliases) if (!string(word, '更多原词', 1000)) fail('INVALID_DATA', '更多原词不能为空');
            if (new Set(record.aliases).size !== record.aliases.length || record.aliases.includes(record.from)) fail('INVALID_DATA', '更多原词不能重复，也不能和原词相同');
        }
        object(record.to); string(record.to.value, '替换内容');
        if (!['text', 'icon', 'asset'].includes(record.to.kind)) fail('INVALID_DATA', '替换类型无效');
        if (!validReplacementBackground(record.to)) fail('INVALID_DATA', '仅文字替换可设置 #RRGGBB 背景色');
        if (record.to.kind === 'icon' && !/^fa-[a-z0-9-]+$/.test(record.to.value)) fail('INVALID_DATA', '图标需为单个 Font Awesome 名称');
        if (typeof record.caseSensitive !== 'boolean' || typeof record.wholeWord !== 'boolean') fail('INVALID_DATA', '匹配选项需为布尔值');
        if (!string(record.scope, '作用范围', 1000) || record.scope !== 'all' && /[\\/\u0000-\u001f]/u.test(record.scope)) fail('INVALID_DATA', '作用范围需为 all 或角色头像文件名');
    } else {
        if (!string(record.name, '素材名称', 200)) fail('INVALID_DATA', '素材名称不能为空');
    }
}
function validateLinks(data) {
    if (Object.keys(data.assets).length > MAX_ASSETS) fail('ASSET_LIMIT', '最多保存 30 张图片');
    for (const rule of Object.values(data.replaceRules)) {
        if (rule.to.kind === 'asset' && !Object.hasOwn(data.assets, rule.to.value)) fail('MISSING_ASSET', `替换规则找不到图片：${rule.to.value}`);
    }
}
function normalizeWords(words) {
    if (!Array.isArray(words)) fail('INVALID_DATA', '屏蔽词需为数组');
    return [...new Set(words.map(word => {
        if (!string(word, '屏蔽词', 1000).trim()) fail('INVALID_DATA', '屏蔽词不能为空');
        return word;
    }))];
}

/**
 * D33 自动恢复的合并规则（纯函数，就地修改 target）：
 * 记录同 id 取 updatedAt 新者，本地独有 / 本地更新的保留；屏蔽词并集；设置只补本地没有的键。
 * changed：target 被改过；localNewer：本地有服务器那份没有的内容（合并后应再备份一次）。
 */
export function mergeNewer(target, incoming) {
    const report = {};
    let changed = false, localNewer = false;
    for (const category of CATEGORIES) {
        let added = 0, updated = 0, kept = 0;
        if (category === 'maskWords') {
            for (const word of incoming.maskWords) {
                if (target.maskWords.includes(word)) kept++; else { target.maskWords.push(word); added++; }
            }
            if (target.maskWords.some(word => !incoming.maskWords.includes(word))) localNewer = true;
        } else if (category === 'settings') {
            for (const [key, value] of Object.entries(incoming.settings)) {
                if (!Object.hasOwn(target.settings, key)) { target.settings[key] = value; added++; }
                else { kept++; if (JSON.stringify(target.settings[key]) !== JSON.stringify(value)) localNewer = true; }
            }
            if (Object.keys(target.settings).some(key => !Object.hasOwn(incoming.settings, key))) localNewer = true;
        } else {
            for (const [id, value] of Object.entries(incoming[category])) {
                const mine = target[category][id];
                if (!mine) { target[category][id] = value; added++; continue; }
                const order = Date.parse(value.updatedAt) - Date.parse(mine.updatedAt);
                if (order > 0) { target[category][id] = value; updated++; }
                else { kept++; if (order < 0) localNewer = true; }
            }
            if (Object.keys(target[category]).some(id => !Object.hasOwn(incoming[category], id))) localNewer = true;
        }
        if (added || updated) changed = true;
        report[category] = { added, updated, kept };
    }
    validateLinks(target);
    return { report, changed, localNewer };
}

/** 单个 IndexedDB 值原子提交完整快照，防止导入半途留下部分数据。 */
export function createStore({ storage, lock, cleanSvg, now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() } = {}) {
    let adapterPromise, queue = Promise.resolve();
    const adapter = () => adapterPromise ??= Promise.resolve().then(async () => {
        if (storage) return storage;
        const library = globalThis.SillyTavern?.libs?.localforage;
        if (!library) fail('UNAVAILABLE', '宿主 localforage 尚未就绪');
        const instance = library.createInstance({ name: 'st-reader', storeName: 'stcr_data', driver: library.INDEXEDDB });
        await instance.ready(); return instance;
    }).catch(error => { adapterPromise = undefined; throw error; });
    async function read() {
        const state = await (await adapter()).getItem(STATE_KEY);
        if (state === null) return empty();
        if (state?.version !== 1 || !state.data || CATEGORIES.some(key => !Object.hasOwn(state.data, key))) fail('INVALID_STATE', '阅读器存储格式不兼容，未覆盖原数据');
        const copy = clone(state);
        // 只升级读取副本；首次读取、列表和导出预览不会为了迁移写入数据库。
        Object.values(copy.data.bookmarks).forEach(normalizeBookmark);
        // T70：旧快照没有修订号，按 0 / 未同步读取。
        copy.rev = Number.isInteger(copy.rev) && copy.rev >= 0 ? copy.rev : 0;
        copy.syncedId = typeof copy.syncedId === 'string' ? copy.syncedId : null;
        copy.syncedRev = Number.isInteger(copy.syncedRev) && copy.syncedRev >= 0 ? copy.syncedRev : 0;
        return copy;
    }
    const listeners = new Set();
    function notify(rev) {
        for (const listener of listeners) {
            try { listener({ rev }); } catch (error) { console.error('[st-reader] 存储变更回调出错：', error); }
        }
    }
    function exclusive(run) {
        const perform = () => lock ? lock(run) : globalThis.navigator?.locks ? navigator.locks.request('stcr:store:v1', run) : run();
        const pending = queue.then(perform, perform); queue = pending.catch(() => {}); return pending;
    }
    /** bump：数据变更时修订号 +1 并通知（自动备份据此触发）；只改元信息（导出时间、同步标记）时不 bump。 */
    async function mutate(change, { bump = true } = {}) {
        let rev = null;
        const result = await exclusive(async () => {
            const state = await read(), value = await change(state);
            validateLinks(state.data);
            const changed = typeof bump === 'function' ? bump(value) : bump;
            if (changed) rev = state.rev = state.rev + 1;
            await (await adapter()).setItem(STATE_KEY, state);
            return clone(value);
        });
        if (rev !== null) notify(rev);
        return result;
    }
    const isEmpty = state => CATEGORIES.every(key => !Object.keys(state.data[key]).length);
    function collection(category) {
        return {
            async list(query = {}) {
                const { data } = await read();
                return Object.values(data[category]).filter(record => Object.entries(query).every(([key, value]) => {
                    const target = category === 'annotations' && ['chatKey', 'mesIndex', 'swipeIndex', 'part'].includes(key) ? record.anchor : record;
                    return target[key] === value;
                })).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
            },
            async get(id) { safeKey(id); return (await read()).data[category][id] ?? null; },
            async put(input) {
                const record = clone(object(input));
                if (category === 'assets') {
                    Object.assign(record, await normalizeAssetImage(input, cleanSvg)); delete record.blob;
                }
                return mutate(state => {
                    const time = now();
                    if (category === 'bookmarks') { normalizeBookmark(record); record.id ??= bookmarkId(record); }
                    if (!record.id) {
                        const target = category === 'annotations' ? `${encodeURIComponent(record.anchor?.chatKey)}:${record.anchor?.mesIndex}:${record.anchor?.swipeIndex}:${record.anchor?.part}:` : '';
                        record.id = `stcr:${category}:${target}${uuid()}`;
                    }
                    safeKey(record.id);
                    const previous = state.data[category][record.id];
                    record.createdAt = previous?.createdAt ?? time; record.updatedAt = time;
                    if (category === 'annotations') Object.assign(record, { note: record.note ?? '', color: record.color ?? 'yellow', orphan: record.orphan ?? false, orphanReason: record.orphanReason ?? null });
                    if (category === 'replaceRules') Object.assign(record, { scope: record.scope ?? 'all', caseSensitive: record.caseSensitive ?? false, wholeWord: record.wholeWord ?? false });
                    if (category === 'replaceRules' && Array.isArray(record.aliases)) { record.aliases = [...new Set(record.aliases)].filter(word => word !== record.from); if (!record.aliases.length) delete record.aliases; }
                    validateRecord(category, record); state.data[category][record.id] = record; return record;
                });
            },
            async remove(id, { removeRules = false } = {}) {
                safeKey(id);
                return mutate(state => {
                    if (category === 'assets') {
                        const references = Object.values(state.data.replaceRules).filter(rule => rule.to.kind === 'asset' && rule.to.value === id);
                        if (references.length && !removeRules) fail('ASSET_IN_USE', `有 ${references.length} 条替换规则正在使用这张图片`);
                        for (const rule of references) delete state.data.replaceRules[rule.id];
                    }
                    const existed = Object.hasOwn(state.data[category], id); delete state.data[category][id]; return existed;
                });
            },
        };
    }
    async function parseBackup(json, meta = {}) {
        if (typeof json !== 'string' || new TextEncoder().encode(json).length > 24 * 1024 * 1024) fail('INVALID_BACKUP', '备份需为不超过 24 MiB 的 JSON 字符串');
        let backup;
        try { backup = JSON.parse(json); } catch { fail('INVALID_BACKUP', 'JSON 无法解析'); }
        jsonValue(backup);
        if (backup.format !== 'st-reader' || backup.version !== 1) fail('INVALID_BACKUP', '不是支持的 ST Reader 版本 1 备份');
        meta.rev = Number.isInteger(backup.rev) && backup.rev >= 0 ? backup.rev : 0;
        const data = object(backup.data);
        if (Object.keys(data).length !== CATEGORIES.length || CATEGORIES.some(key => !Object.hasOwn(data, key))) fail('INVALID_BACKUP', '备份分类不完整或含未知分类');
        for (const category of RECORDS) {
            object(data[category]);
            for (const [id, record] of Object.entries(data[category])) {
                if (id !== record.id) fail('INVALID_BACKUP', '备份记录键与 ID 不一致');
                validateRecord(category, record);
                if (category === 'bookmarks') normalizeBookmark(record);
                if (category === 'assets') Object.assign(record, await normalizeAssetImage(record, cleanSvg));
            }
        }
        object(data.settings); data.maskWords = normalizeWords(data.maskWords); validateLinks(data); return data;
    }
    function merge(target, incoming) {
        const report = {};
        for (const category of CATEGORIES) {
            let added = 0, skipped = 0;
            if (category === 'maskWords') {
                for (const word of incoming.maskWords) {
                    if (target.maskWords.includes(word)) skipped++; else { target.maskWords.push(word); added++; }
                }
            } else for (const [id, value] of Object.entries(incoming[category])) {
                if (Object.hasOwn(target[category], id)) {
                    if (category === 'assets' && target.assets[id].dataUrl !== value.dataUrl) fail('ASSET_CONFLICT', '同 ID 图片内容不同，导入已取消');
                    skipped++;
                } else { target[category][id] = value; added++; }
            }
            report[category] = { added, skipped };
        }
        validateLinks(target); return report;
    }
    const store = {
        annotations: collection('annotations'), bookmarks: collection('bookmarks'), replaceRules: collection('replaceRules'), assets: collection('assets'),
        maskWords: {
            async list() { return (await read()).data.maskWords; },
            async set(words) { const value = normalizeWords(words); return mutate(state => state.data.maskWords = value); },
            async add(word) { normalizeWords([word]); return mutate(state => state.data.maskWords = [...new Set([...state.data.maskWords, word])]); },
            async remove(word) { return mutate(state => state.data.maskWords = state.data.maskWords.filter(item => item !== word)); },
        },
        settings: {
            async all() { return (await read()).data.settings; },
            async get(key, fallback = null) { safeKey(key); const data = (await read()).data.settings; return Object.hasOwn(data, key) ? data[key] : clone(fallback); },
            async set(key, value) { safeKey(key); jsonValue(value); const copy = clone(value); return mutate(state => state.data.settings[key] = copy); },
            async remove(key) { safeKey(key); return mutate(state => { const existed = Object.hasOwn(state.data.settings, key); delete state.data.settings[key]; return existed; }); },
        },
        async ready() { await adapter(); await read(); },
        async info() { const state = await read(); return { lastExportAt: state.lastExportAt, counts: Object.fromEntries(CATEGORIES.map(key => [key, Object.keys(state.data[key]).length])) }; },
        async exportAll() {
            return mutate(state => {
                state.lastExportAt = now();
                const json = JSON.stringify({ format: 'st-reader', version: 1, exportedAt: state.lastExportAt, data: state.data }, null, 2);
                if (new TextEncoder().encode(json).length > 24 * 1024 * 1024) fail('BACKUP_TOO_LARGE', '备份超过当前 24 MiB 上限');
                return json;
            }, { bump: false });
        },
        async previewImport(json) { const incoming = await parseBackup(json); return merge((await read()).data, incoming); },
        async importAll(json) {
            const incoming = await parseBackup(json);
            return mutate(state => merge(state.data, incoming), { bump: report => Object.values(report).some(item => item.added > 0) });
        },
        // ── T70 / D33 自动备份用（03 §5.16）──
        /** 订阅数据变更（每次提交后同步回调 {rev}）；返回退订函数。 */
        onChange(listener) {
            if (typeof listener !== 'function') throw new TypeError('onChange 需要函数');
            listeners.add(listener); return () => listeners.delete(listener);
        },
        /** {rev, syncedId, syncedRev, empty}：本地修订号、上次与服务器同步的标记、是否完全没有数据。 */
        async revision() {
            const state = await read();
            return { rev: state.rev, syncedId: state.syncedId, syncedRev: state.syncedRev, empty: isEmpty(state) };
        },
        /** 与 exportAll 同格式（另带 rev），但只读：不记"上次导出"、不改修订号。{json, rev, bytes}。 */
        async snapshot() {
            return exclusive(async () => {
                const state = await read();
                const json = JSON.stringify({ format: 'st-reader', version: 1, exportedAt: now(), rev: state.rev, data: state.data }, null, 2);
                const bytes = new TextEncoder().encode(json).length;
                if (bytes > 24 * 1024 * 1024) fail('BACKUP_TOO_LARGE', '备份超过当前 24 MiB 上限');
                return { json, rev: state.rev, bytes };
            });
        },
        /** 记下"本地 rev 版已与服务器那份 id 一致"；不 bump、不通知。 */
        async markSynced({ id, rev }) {
            if (typeof id !== 'string' || !id) fail('INVALID_DATA', '同步标记需为非空字符串');
            return mutate(state => {
                state.syncedId = id; state.syncedRev = Number.isInteger(rev) && rev >= 0 ? Math.min(rev, state.rev) : state.rev;
                return null;
            }, { bump: false });
        },
        /** D33 合并：同 id 以 updatedAt 新者胜，屏蔽词并集，设置只补缺。{report, localNewer, changed}。 */
        async mergeBackup(json) {
            const meta = {}, incoming = await parseBackup(json, meta);
            return mutate(state => {
                // 修订号接上服务器那份，换浏览器后计数不倒退（planSync 的"本地落后"才有意义）
                state.rev = Math.max(state.rev, meta.rev);
                return mergeNewer(state.data, incoming);
            }, { bump: result => result.changed });
        },
    };
    store.assets.references = async id => (await store.replaceRules.list()).filter(rule => rule.to.kind === 'asset' && rule.to.value === id);
    return store;
}

/** 默认单例：localforage 实例 st-reader，只使用 IndexedDB，不回退宿主设置。 */
export const store = createStore();
