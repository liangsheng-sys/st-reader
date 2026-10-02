// ST Reader — AGPL-3.0
import { calculateDepths, freezeJson, normalizeDate, parseChatRows, toMessageModel } from './messageModel.js';
import { createMemoryChatCache, estimateJsonBytes } from './chatCache.js';

export class StcrDataError extends Error {
    constructor(code, message) { super(message); this.name = 'StcrDataError'; this.code = code; }
}
const READ_ENDPOINTS = new Set(['/api/chats/recent', '/api/characters/all', '/api/characters/get', '/api/characters/chats', '/api/groups/all', '/api/chats/search', '/api/chats/get', '/api/chats/group/get']);
const context = () => globalThis.SillyTavern.getContext();

function component(value) {
    if (typeof value !== 'string' || !value || /[\\/\u0000-\u001f]/u.test(value) || value === '.' || value === '..') throw new StcrDataError('INVALID_KEY', '聊天键包含无效文件名');
    return value;
}
const fileBase = value => component(value).replace(/\.jsonl$/i, '');

/** @param {{avatarUrl?:string, groupId?:string, fileName:string}} value @returns {string} 稳定、可逆的聊天键 */
export function makeChatKey({ avatarUrl, groupId, fileName }) {
    const owner = groupId !== undefined ? `group:${encodeURIComponent(component(String(groupId)))}` : encodeURIComponent(component(avatarUrl));
    return `${owner}/${encodeURIComponent(component(fileName))}`;
}
/** @param {string} key @returns {{isGroup:boolean,avatarUrl:string|null,groupId:string|null,fileName:string}} */
export function parseChatKey(key) {
    try {
        if (typeof key !== 'string' || key.split('/').length !== 2) throw new Error();
        const [owner, file] = key.split('/');
        const isGroup = owner.startsWith('group:');
        const id = component(decodeURIComponent(isGroup ? owner.slice(6) : owner));
        const fileName = component(decodeURIComponent(file));
        return Object.freeze({ isGroup, avatarUrl: isGroup ? null : id, groupId: isGroup ? id : null, fileName });
    } catch { throw new StcrDataError('INVALID_KEY', '聊天键格式无效'); }
}

async function request(url, body, { signal } = {}) {
    if (!READ_ENDPOINTS.has(url)) throw new StcrDataError('ENDPOINT_DENIED', '仅允许已登记的只读接口');
    const response = await fetch(url, { method: 'POST', headers: context().getRequestHeaders(), body: JSON.stringify(body), signal });
    if (!response.ok) throw new StcrDataError(`HTTP_${response.status}`, `读取失败（HTTP ${response.status}）`);
    return response.json();
}
const thumbnail = avatar => `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;
function listResult(rows) {
    if (!Array.isArray(rows)) throw new StcrDataError('INVALID_RESPONSE', '列表 API 返回格式错误');
    return rows;
}
function summary(row, owner) {
    const fileName = component(String(row.file_id ?? (owner.groupId !== undefined ? row.file_name : fileBase(row.file_name))));
    return Object.freeze({ chatKey: makeChatKey({ ...owner, fileName }), fileName, title: fileName,
        isGroup: owner.groupId !== undefined, avatarUrl: owner.avatarUrl ?? null, groupId: owner.groupId ?? null,
        lastDate: normalizeDate(row.last_mes), messageCount: Number.isFinite(Number(row.message_count ?? row.chat_items)) ? Number(row.message_count ?? row.chat_items) : null,
        preview: String(row.preview_message ?? row.mes ?? '').slice(0, 240) });
}

/** 注入读取器仅供纯逻辑测试；默认实例只使用上述同源白名单。 */
export function createChatSource({ read = request, getContext = context, cacheEntries = 3, cacheBytes = 150_000_000, prefetchOnList = true, now = Date.now } = {}) {
    const cache = createMemoryChatCache({ maxEntries: cacheEntries, maxBytes: cacheBytes }), pending = new Map();
    const counts = { hits: 0, misses: 0, invalidations: 0, prefetches: 0, validations: 0 };
    let generation = 0, automaticPrefetch = null;
    const abortCheck = signal => { if (signal?.aborted) throw signal.reason ?? new DOMException('已取消', 'AbortError'); };
    function fingerprint(row) {
        const size = row.file_size, date = row.last_mes;
        if (!(typeof size === 'string' && size.trim() || typeof size === 'number' && Number.isFinite(size) && size >= 0)
            || !['string', 'number'].includes(typeof date) || date === '') return null;
        return JSON.stringify([size, normalizeDate(date) ?? String(date), row.message_count ?? row.chat_items ?? null]);
    }
    async function readSummary(key, signal) {
        const rows = listResult(await read('/api/chats/search', key.isGroup ? { query: '', group_id: key.groupId } : { query: '', avatar_url: key.avatarUrl }, { signal }));
        abortCheck(signal);
        return rows.find(row => String(row.file_id ?? (key.isGroup ? row.file_name : String(row.file_name).replace(/\.jsonl$/i, ''))) === key.fileName);
    }
    async function readEntry(chatKey, signal, isCurrent) {
        const key = parseChatKey(chatKey);
        let group = null;
        let cards;
        if (key.isGroup) {
            group = listResult(await read('/api/groups/all', {}, { signal })).find(item => String(item.id) === key.groupId);
            if (!group || !group.chats?.includes(key.fileName)) throw new StcrDataError('NOT_FOUND', '群聊或聊天文件不存在');
            cards = await Promise.all((group.members ?? []).map(avatar => read('/api/characters/get', { avatar_url: component(avatar) }, { signal }).catch(error => {
                if (error.code === 'HTTP_404') return { avatar, name: avatar, data: {} };
                throw error;
            })));
        } else cards = [await read('/api/characters/get', { avatar_url: key.avatarUrl }, { signal })];
        abortCheck(signal);
        cards = cards.map(card => freezeJson(structuredClone(card)));
        const info = await readSummary(key, signal), version = info ? fingerprint(info) : null;
        if (!info) throw new StcrDataError('NOT_FOUND', '聊天文件不存在或已被移除');
        counts.misses++;
        const raw = await read(key.isGroup ? '/api/chats/group/get' : '/api/chats/get', key.isGroup ? { id: key.fileName } : { avatar_url: key.avatarUrl, file_name: key.fileName }, { signal });
        abortCheck(signal);
        if (!Array.isArray(raw)) throw new StcrDataError('INVALID_RESPONSE', '聊天 API 返回格式错误');
        const { messages, header } = parseChatRows(raw, { isGroup: key.isGroup,
            userName: key.isGroup ? raw.find(message => message?.is_user)?.name ?? getContext().name1 : getContext().name1,
            characterName: key.isGroup ? group.name : cards[0]?.name, metadata: group?.chat_metadata });
        const depths = calculateDepths(messages);
        const entry = { key: chatKey, version, rows: raw, messages, depths, cards, header, models: new Map(), pages: new Map(),
            listeners: new Set(), staleEvent: null, validation: null, validationJob: null, validationController: null,
            bytes: estimateJsonBytes(raw) + estimateJsonBytes(cards) + estimateJsonBytes(header) + depths.byteLength + messages.length * 8 + 512 };
        // 先取摘要再取正文；期间发生变化会在下次后台校验发现，不用新摘要替旧正文背书。
        if (version !== null && isCurrent()) cache.put(entry);
        return entry;
    }
    function validateEntry(entry) {
        if (entry.validationJob) return entry.validationJob;
        const age = entry.validation ? now() - entry.validation.checkedAt : -1;
        if (age >= 0 && age < 60_000) return Promise.resolve(entry.validation);
        const epoch = generation, controller = new AbortController(), started = performance.now();
        entry.validationController = controller;
        const timeout = setTimeout(() => controller.abort(), 20_000);
        const current = () => epoch === generation && cache.has(entry) && !controller.signal.aborted;
        const result = (state, extra = {}) => Object.freeze({ state, checkedAt: now(), durationMs: performance.now() - started, ...extra });
        counts.validations++;
        // 返回句柄不等待这里。所有错误转换成结果；失败不是“已确认最新”。
        const job = Promise.resolve().then(async () => {
            try {
                const info = await readSummary(parseChatKey(entry.key), controller.signal);
                if (!current()) return result('discarded');
                const version = info ? fingerprint(info) : null;
                if (info && version === null) throw new StcrDataError('INCOMPLETE_SUMMARY', '摘要字段不完整，未能校验');
                if (!info || version !== entry.version) {
                    if (!entry.staleEvent) {
                        counts.invalidations++;
                        entry.staleEvent = Object.freeze({ chatKey: entry.key, reason: info ? 'changed' : 'missing', checkedAt: now() });
                        for (const listener of [...entry.listeners]) listener(entry.staleEvent);
                    }
                }
                return entry.validation = result(entry.staleEvent ? 'stale' : 'fresh');
            } catch (error) {
                // 清缓存、淘汰或显式重载后的迟到响应不通知新旧 UI，也不填回缓存。
                if (epoch !== generation || !cache.has(entry)) return result('discarded');
                return entry.validation = result('error', { code: controller.signal.aborted ? 'TIMEOUT' : error.code ?? 'VALIDATION_FAILED' });
            } finally {
                clearTimeout(timeout);
                if (entry.validationJob === job) { entry.validationJob = null; entry.validationController = null; }
            }
        });
        entry.validationJob = job;
        return job;
    }
    function acquireEntry(chatKey, signal) {
        abortCheck(signal);
        let job = pending.get(chatKey);
        if (!job || job.controller.signal.aborted) {
            const controller = new AbortController(), epoch = generation;
            job = { controller, users: 0, done: false };
            const current = job;
            job.promise = Promise.resolve().then(() => readEntry(chatKey, controller.signal, () => epoch === generation && pending.get(chatKey) === current)).finally(() => {
                current.done = true; if (pending.get(chatKey) === current) pending.delete(chatKey);
            });
            job.promise.catch(() => {}); pending.set(chatKey, job);
        }
        const current = job; current.users++;
        return new Promise((resolve, reject) => {
            let finished = false;
            const finish = (error, value) => {
                if (finished) return; finished = true;
                signal?.removeEventListener('abort', cancel); current.users--;
                if (!current.done && !current.users) current.controller.abort();
                error ? reject(error) : resolve(value);
            };
            const cancel = () => finish(signal.reason ?? new DOMException('已取消', 'AbortError'));
            signal?.addEventListener('abort', cancel, { once: true });
            current.promise.then(value => finish(null, value), error => finish(error));
            if (signal?.aborted) cancel();
        });
    }
    function schedulePrefetch(options) {
        if (!prefetchOnList || options.signal?.aborted) return;
        let key; try { key = getCurrentChatKey(); } catch { return; }
        if (!key || automaticPrefetch?.key === key) return;
        const task = { key }; automaticPrefetch = task;
        task.promise = prefetchChat(key, { signal: options.signal }).catch(() => false).finally(() => {
            if (automaticPrefetch === task) automaticPrefetch = null;
        });
    }
    /** @param {{signal?:AbortSignal}} [options] @returns {Promise<Array<{avatarUrl:string,name:string,thumbnailUrl:string}>>} */
    async function listCharacters(options = {}) {
        schedulePrefetch(options);
        return listResult(await read('/api/characters/all', {}, options)).map(card => Object.freeze({ avatarUrl: card.avatar, name: card.name, thumbnailUrl: thumbnail(card.avatar) }));
    }
    /** @param {{signal?:AbortSignal}} [options] @returns {Promise<Array<{id:string,name:string,members:readonly string[],thumbnailUrl:string|null}>>} */
    async function listGroups(options = {}) {
        schedulePrefetch(options);
        return listResult(await read('/api/groups/all', {}, options)).map(group => Object.freeze({ id: String(group.id), name: String(group.name),
            members: Object.freeze([...(group.members ?? [])]), thumbnailUrl: group.members?.[0] ? thumbnail(group.members[0]) : null }));
    }
    /** @param {number} [max=30] 1–200 @param {{signal?:AbortSignal}} [options] @returns {Promise<ChatSummary[]>} */
    async function listRecent(max = 30, options = {}) {
        if (!Number.isInteger(max) || max < 1 || max > 200) throw new RangeError('最近列表数量需为 1–200');
        schedulePrefetch(options);
        return listResult(await read('/api/chats/recent', { pinned: [], max, metadata: false }, options))
            .filter(row => row.avatar || row.group != null)
            .map(row => summary(row, row.group != null ? { groupId: String(row.group) } : { avatarUrl: row.avatar }));
    }
    /** @param {string} avatarUrl 角色头像文件名 @param {{signal?:AbortSignal}} [options] @returns {Promise<ChatSummary[]>} */
    async function listByCharacter(avatarUrl, options = {}) {
        component(avatarUrl);
        schedulePrefetch(options);
        const rows = await read('/api/characters/chats', { avatar_url: avatarUrl, simple: false, metadata: false }, options);
        // 宿主用 {error:true} 表示该角色尚无聊天目录。
        return (rows?.error === true ? [] : listResult(rows)).map(row => summary(row, { avatarUrl }));
    }
    /** @param {string} groupId 群组 ID，与聊天文件 ID 不同 @param {{signal?:AbortSignal}} [options] @returns {Promise<ChatSummary[]>} */
    async function listByGroup(groupId, options = {}) {
        component(String(groupId));
        schedulePrefetch(options);
        return listResult(await read('/api/chats/search', { query: '', group_id: String(groupId) }, options)).map(row => summary(row, { groupId: String(groupId) }));
    }
    /** 只读取宿主当前选择；欢迎页/临时聊天返回 null。@returns {string|null} */
    function getCurrentChatKey() {
        const current = getContext();
        const fileName = current.getCurrentChatId?.();
        if (!fileName) return null;
        if (current.groupId !== null && current.groupId !== undefined && String(current.groupId) !== '') return makeChatKey({ groupId: String(current.groupId), fileName });
        const avatarUrl = current.characters?.[current.characterId]?.avatar;
        return avatarUrl ? makeChatKey({ avatarUrl, fileName }) : null;
    }
    /** @param {string} chatKey 稳定聊天键 @param {{pageSize?:number,signal?:AbortSignal,reload?:boolean}} [options] @returns {Promise<ChatHandle>} */
    async function openChat(chatKey, { pageSize = 30, signal, reload = false } = {}) {
        if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new RangeError('每页楼数需为 1–100');
        const key = parseChatKey(chatKey);
        chatKey = makeChatKey(key.isGroup ? { groupId: key.groupId, fileName: key.fileName } : { avatarUrl: key.avatarUrl, fileName: key.fileName });
        abortCheck(signal);
        if (typeof reload !== 'boolean') throw new TypeError('reload 必须为布尔值');
        if (reload) { cache.remove(chatKey); pending.delete(chatKey); }
        let entry = cache.peek(chatKey);
        const cacheHit = Boolean(entry);
        if (entry) { counts.hits++; cache.touch(entry); }
        else entry = await acquireEntry(chatKey, signal);
        abortCheck(signal);
        const total = entry.messages.length, header = entry.header;
        const validation = cacheHit ? validateEntry(entry) : Promise.resolve(Object.freeze({ state: 'loaded', checkedAt: null, durationMs: 0 }));
        const subscriptions = new Set();
        let closed = false;
        function ensureOpen() { if (closed) throw new StcrDataError('CLOSED', '聊天已关闭，请重新打开'); }
        function checkIndex(index) { ensureOpen(); if (!Number.isInteger(index) || index < 0 || index >= total) throw new RangeError('楼层编号越界'); }
        const handle = {
            chatKey: makeChatKey(key.isGroup ? { groupId: key.groupId, fileName: key.fileName } : { avatarUrl: key.avatarUrl, fileName: key.fileName }),
            title: key.fileName, isGroup: key.isGroup, header, total, pageSize, pageCount: Math.ceil(total / pageSize),
            cacheHit, validation,
            get closed() { return closed; },
            get stale() { ensureOpen(); return Boolean(entry.staleEvent); },
            onStale(callback) {
                ensureOpen();
                if (typeof callback !== 'function') throw new TypeError('变化通知必须为函数');
                const target = entry; let active = true, delivered = false;
                const listener = event => {
                    if (!active || closed || delivered) return;
                    delivered = true;
                    try { callback(event); } catch (error) { console.error('[st-reader] 聊天变化通知失败：', error); }
                };
                const unsubscribe = () => { active = false; target.listeners.delete(listener); subscriptions.delete(unsubscribe); };
                target.listeners.add(listener); subscriptions.add(unsubscribe);
                // 校验可能早于 UI 订阅完成；晚订阅补发一次，close/退订可取消。
                if (target.staleEvent) queueMicrotask(() => listener(target.staleEvent));
                return unsubscribe;
            },
            getMessage(index) {
                checkIndex(index);
                const cached = entry.models.get(index); if (cached) return cached;
                const model = toMessageModel(entry.messages[index], index);
                if (cache.has(entry)) { entry.models.set(index, model); cache.grow(entry, estimateJsonBytes(model) + 32); }
                return model;
            },
            getRegexContext(index) {
                checkIndex(index);
                const message = entry.messages[index];
                const cards = entry.cards;
                const matches = cards.filter(card => card.name === message.name);
                const card = key.isGroup ? message.is_user ? null : cards.find(card => card.avatar === message.original_avatar) ?? (matches.length === 1 ? matches[0] : null) : cards[0];
                return Object.freeze({ userName: header.userName, characterName: key.isGroup ? card?.name ?? message.name : header.characterName,
                    character: card, groupNames: Object.freeze(cards.map(item => item.name)), depth: entry.depths[index] });
            },
            page(pageIndex = 0) {
                ensureOpen();
                if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= Math.max(1, this.pageCount)) throw new RangeError('页码越界');
                const pageKey = `${pageSize}:${pageIndex}`, cached = entry.pages.get(pageKey); if (cached) return cached;
                const start = pageIndex * pageSize, end = Math.min(total, start + pageSize);
                const page = Object.freeze({ pageIndex, start, end, total, pageCount: this.pageCount,
                    messages: Object.freeze(Array.from({ length: end - start }, (_, offset) => this.getMessage(start + offset))) });
                if (cache.has(entry)) { entry.pages.set(pageKey, page); cache.grow(entry, 256 + page.messages.length * 8); }
                return page;
            },
            close() { if (closed) return; closed = true; for (const unsubscribe of [...subscriptions]) unsubscribe(); entry = null; },
        };
        return Object.freeze(handle);
    }
    /** 预取只构建第一页；ST 没有按页取正文 API，所以首次仍只下载这一个聊天的原始数组。 */
    async function prefetchChat(chatKey, options = {}) {
        const handle = await openChat(chatKey, options);
        try { handle.page(0); counts.prefetches++; return true; } finally { handle.close(); }
    }
    async function prefetchCurrentChat(options = {}) {
        const key = getCurrentChatKey(); return key ? prefetchChat(key, options) : false;
    }
    function clearChatCache() {
        generation++; cache.clear();
        // 已有等待者仍可完成，但清空后的打开不能加入旧请求；旧响应也不能淘汰新缓存。
        pending.clear(); automaticPrefetch = null;
    }
    function getChatCacheStats() { return Object.freeze({ ...cache.info(), ...counts, pending: pending.size }); }
    return { listCharacters, listGroups, listRecent, listByCharacter, listByGroup, getCurrentChatKey, openChat, prefetchCurrentChat, clearChatCache, getChatCacheStats };
}

/** 默认公开接口；options 支持 AbortSignal。具体类型与示例见 03 §5。 */
export const { listCharacters, listGroups, listRecent, listByCharacter, listByGroup, getCurrentChatKey, openChat, prefetchCurrentChat, clearChatCache, getChatCacheStats } = createChatSource();

/**
 * @typedef {object} ChatSummary
 * @property {string} chatKey 稳定聊天键
 * @property {string} fileName 不含文件存储后缀的聊天 ID
 * @property {string} title 聊天标题
 * @property {boolean} isGroup 是否群聊
 * @property {string|null} avatarUrl 单聊头像文件名
 * @property {string|null} groupId 群组 ID
 * @property {string|null} lastDate ISO 时间或 null
 * @property {number|null} messageCount 楼层数
 * @property {string} preview 最多 240 UTF-16 码元的原文片段；UI 必须用 textContent
 */
/**
 * @typedef {object} ChatHandle
 * @property {string} chatKey
 * @property {string} title
 * @property {boolean} isGroup
 * @property {{userName:string,characterName:string,createDate:string|null,metadata:object}} header
 * @property {number} total
 * @property {number} pageSize
 * @property {number} pageCount
 * @property {boolean} closed
 * @property {boolean} cacheHit 本次是否直接命中内存
 * @property {boolean} stale 此快照是否已发现变化；关闭后不可读取
 * @property {Promise<{state:string,checkedAt:number|null,durationMs:number,code?:string}>} validation 本次后台校验结果；不阻塞首屏
 * @property {(callback:(event:{chatKey:string,reason:string,checkedAt:number})=>void)=>()=>void} onStale 订阅变化，返回退订函数；close 自动退订
 * @property {(index:number)=>object} getMessage 返回冻结模型；缓存命中可复用同一对象
 * @property {(index:number)=>object} getRegexContext 目标发言者与深度；供 core 内部使用
 * @property {(pageIndex?:number)=>{pageIndex:number,start:number,end:number,total:number,pageCount:number,messages:readonly object[]}} page 零基页码，end 不包含
 * @property {()=>void} close 幂等释放此句柄；之后读取抛 CLOSED，原始数据与页模型由内存 LRU 保留
 */
