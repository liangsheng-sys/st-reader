// ST Reader — AGPL-3.0
import { calculateDepths, freezeJson, normalizeDate, parseChatRows, toMessageModel } from './messageModel.js';

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
export function createChatSource({ read = request, getContext = context } = {}) {
    /** @param {{signal?:AbortSignal}} [options] @returns {Promise<Array<{avatarUrl:string,name:string,thumbnailUrl:string}>>} */
    async function listCharacters(options = {}) {
        return listResult(await read('/api/characters/all', {}, options)).map(card => Object.freeze({ avatarUrl: card.avatar, name: card.name, thumbnailUrl: thumbnail(card.avatar) }));
    }
    /** @param {{signal?:AbortSignal}} [options] @returns {Promise<Array<{id:string,name:string,members:readonly string[],thumbnailUrl:string|null}>>} */
    async function listGroups(options = {}) {
        return listResult(await read('/api/groups/all', {}, options)).map(group => Object.freeze({ id: String(group.id), name: String(group.name),
            members: Object.freeze([...(group.members ?? [])]), thumbnailUrl: group.members?.[0] ? thumbnail(group.members[0]) : null }));
    }
    /** @param {number} [max=30] 1–200 @param {{signal?:AbortSignal}} [options] @returns {Promise<ChatSummary[]>} */
    async function listRecent(max = 30, options = {}) {
        if (!Number.isInteger(max) || max < 1 || max > 200) throw new RangeError('最近列表数量需为 1–200');
        return listResult(await read('/api/chats/recent', { pinned: [], max, metadata: false }, options))
            .filter(row => row.avatar || row.group != null)
            .map(row => summary(row, row.group != null ? { groupId: String(row.group) } : { avatarUrl: row.avatar }));
    }
    /** @param {string} avatarUrl 角色头像文件名 @param {{signal?:AbortSignal}} [options] @returns {Promise<ChatSummary[]>} */
    async function listByCharacter(avatarUrl, options = {}) {
        component(avatarUrl);
        const rows = await read('/api/characters/chats', { avatar_url: avatarUrl, simple: false, metadata: false }, options);
        // 宿主用 {error:true} 表示该角色尚无聊天目录。
        return (rows?.error === true ? [] : listResult(rows)).map(row => summary(row, { avatarUrl }));
    }
    /** @param {string} groupId 群组 ID，与聊天文件 ID 不同 @param {{signal?:AbortSignal}} [options] @returns {Promise<ChatSummary[]>} */
    async function listByGroup(groupId, options = {}) {
        component(String(groupId));
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
    /** @param {string} chatKey 稳定聊天键 @param {{pageSize?:number,signal?:AbortSignal}} [options] @returns {Promise<ChatHandle>} */
    async function openChat(chatKey, { pageSize = 30, signal } = {}) {
        if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new RangeError('每页楼数需为 1–100');
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
        cards = cards.map(card => freezeJson(structuredClone(card)));
        let rows = await read(key.isGroup ? '/api/chats/group/get' : '/api/chats/get', key.isGroup ? { id: key.fileName } : { avatar_url: key.avatarUrl, file_name: key.fileName }, { signal });
        if (!Array.isArray(rows)) throw new StcrDataError('INVALID_RESPONSE', '聊天 API 返回格式错误');
        const parsed = parseChatRows(rows, { isGroup: key.isGroup, userName: key.isGroup ? rows.find(message => message?.is_user)?.name ?? getContext().name1 : getContext().name1,
            characterName: key.isGroup ? group.name : cards[0]?.name, metadata: group?.chat_metadata });
        let messages = parsed.messages;
        rows = null;
        parsed.messages = null;
        let depths = calculateDepths(messages);
        const total = messages.length;
        const header = parsed.header;
        let closed = false;
        function ensureOpen() { if (closed) throw new StcrDataError('CLOSED', '聊天已关闭，请重新打开'); }
        function checkIndex(index) { ensureOpen(); if (!Number.isInteger(index) || index < 0 || index >= total) throw new RangeError('楼层编号越界'); }
        const handle = {
            chatKey: makeChatKey(key.isGroup ? { groupId: key.groupId, fileName: key.fileName } : { avatarUrl: key.avatarUrl, fileName: key.fileName }),
            title: key.fileName, isGroup: key.isGroup, header, total, pageSize, pageCount: Math.ceil(total / pageSize),
            get closed() { return closed; },
            getMessage(index) { checkIndex(index); return toMessageModel(messages[index], index); },
            getRegexContext(index) {
                checkIndex(index);
                const message = messages[index];
                const matches = cards.filter(card => card.name === message.name);
                const card = key.isGroup ? message.is_user ? null : cards.find(card => card.avatar === message.original_avatar) ?? (matches.length === 1 ? matches[0] : null) : cards[0];
                return Object.freeze({ userName: header.userName, characterName: key.isGroup ? card?.name ?? message.name : header.characterName,
                    character: card, groupNames: Object.freeze(cards.map(item => item.name)), depth: depths[index] });
            },
            page(pageIndex = 0) {
                ensureOpen();
                if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= Math.max(1, this.pageCount)) throw new RangeError('页码越界');
                const start = pageIndex * pageSize, end = Math.min(total, start + pageSize);
                return Object.freeze({ pageIndex, start, end, total, pageCount: this.pageCount,
                    messages: Object.freeze(Array.from({ length: end - start }, (_, offset) => this.getMessage(start + offset))) });
            },
            close() { closed = true; messages = null; depths = null; cards = null; },
        };
        return Object.freeze(handle);
    }
    return { listCharacters, listGroups, listRecent, listByCharacter, listByGroup, getCurrentChatKey, openChat };
}

/** 默认公开接口；options 支持 AbortSignal。具体类型与示例见 03 §5。 */
export const { listCharacters, listGroups, listRecent, listByCharacter, listByGroup, getCurrentChatKey, openChat } = createChatSource();

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
 * @property {(index:number)=>object} getMessage 返回新的冻结模型
 * @property {(index:number)=>object} getRegexContext 目标发言者与深度；供 core 内部使用
 * @property {(pageIndex?:number)=>{pageIndex:number,start:number,end:number,total:number,pageCount:number,messages:readonly object[]}} page 零基页码，end 不包含
 * @property {()=>void} close 幂等释放；之后读取抛 CLOSED
 */
