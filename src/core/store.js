// ST Reader — AGPL-3.0
import { parseChatKey } from './chatSource.js';
import { MAX_ASSETS, normalizeAssetImage } from './assetCodec.js';

const STATE_KEY = 'stcr:state:v1';
const CATEGORIES = ['annotations', 'bookmarks', 'maskWords', 'settings', 'replaceRules', 'assets'];
const RECORDS = ['annotations', 'bookmarks', 'replaceRules', 'assets'];
const clone = value => structuredClone(value);
const empty = () => ({ version: 1, lastExportAt: null, data: { annotations: {}, bookmarks: {}, maskWords: [], settings: {}, replaceRules: {}, assets: {} } });

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
/** 收藏一楼与收藏某候选使用不同的稳定键。 */
export function bookmarkId({ chatKey: key, mesIndex, swipeIndex = null }) {
    chatKey(key); index(mesIndex); if (swipeIndex !== null) index(swipeIndex);
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
        object(record.to); string(record.to.value, '替换内容');
        if (!['text', 'icon', 'asset'].includes(record.to.kind)) fail('INVALID_DATA', '替换类型无效');
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
        return clone(state);
    }
    function exclusive(run) {
        const perform = () => lock ? lock(run) : globalThis.navigator?.locks ? navigator.locks.request('stcr:store:v1', run) : run();
        const pending = queue.then(perform, perform); queue = pending.catch(() => {}); return pending;
    }
    async function mutate(change) {
        return exclusive(async () => {
            const state = await read(), result = await change(state);
            validateLinks(state.data);
            await (await adapter()).setItem(STATE_KEY, state);
            return clone(result);
        });
    }
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
                    if (category === 'bookmarks') { record.swipeIndex ??= null; record.id ??= bookmarkId(record); }
                    if (!record.id) {
                        const target = category === 'annotations' ? `${encodeURIComponent(record.anchor?.chatKey)}:${record.anchor?.mesIndex}:${record.anchor?.swipeIndex}:${record.anchor?.part}:` : '';
                        record.id = `stcr:${category}:${target}${uuid()}`;
                    }
                    safeKey(record.id);
                    const previous = state.data[category][record.id];
                    record.createdAt = previous?.createdAt ?? time; record.updatedAt = time;
                    if (category === 'annotations') Object.assign(record, { note: record.note ?? '', color: record.color ?? 'yellow', orphan: record.orphan ?? false, orphanReason: record.orphanReason ?? null });
                    if (category === 'replaceRules') Object.assign(record, { scope: record.scope ?? 'all', caseSensitive: record.caseSensitive ?? false, wholeWord: record.wholeWord ?? false });
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
    async function parseBackup(json) {
        if (typeof json !== 'string' || new TextEncoder().encode(json).length > 24 * 1024 * 1024) fail('INVALID_BACKUP', '备份需为不超过 24 MiB 的 JSON 字符串');
        let backup;
        try { backup = JSON.parse(json); } catch { fail('INVALID_BACKUP', 'JSON 无法解析'); }
        jsonValue(backup);
        if (backup.format !== 'st-reader' || backup.version !== 1) fail('INVALID_BACKUP', '不是支持的 ST Reader 版本 1 备份');
        const data = object(backup.data);
        if (Object.keys(data).length !== CATEGORIES.length || CATEGORIES.some(key => !Object.hasOwn(data, key))) fail('INVALID_BACKUP', '备份分类不完整或含未知分类');
        for (const category of RECORDS) {
            object(data[category]);
            for (const [id, record] of Object.entries(data[category])) {
                if (id !== record.id) fail('INVALID_BACKUP', '备份记录键与 ID 不一致');
                validateRecord(category, record);
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
            });
        },
        async previewImport(json) { const incoming = await parseBackup(json); return merge((await read()).data, incoming); },
        async importAll(json) { const incoming = await parseBackup(json); return mutate(state => merge(state.data, incoming)); },
    };
    store.assets.references = async id => (await store.replaceRules.list()).filter(rule => rule.to.kind === 'asset' && rule.to.value === id);
    return store;
}

/** 默认单例：localforage 实例 st-reader，只使用 IndexedDB，不回退宿主设置。 */
export const store = createStore();
