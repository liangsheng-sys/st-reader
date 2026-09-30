// ST Reader — AGPL-3.0
// "按角色"页要的排序字段、标签和 ST 当前排序（T43、F12、D20）。
// 03 §5 的 listCharacters / listGroups 只给名字和头像；排序字段（create_date、fav、date_last_chat、chat_size、data_size）、
// 标签（tags / tagMap）和 power_user.sort_field / sort_order 暂时没有 core 接口（06 I028）。
// 在 core 补上之前，这里**只读**宿主页面内存里 getContext() 已有的这几份数组（不发请求、不改任何值），
// 名单本身仍以 core 的列表为准；读不到时排序字段为空、标签为空、排序退回 A-Z，页面照常能用。

import { listCharacters, listGroups } from '../core/chatSource.js';
import { stOwnerSort } from './logic.js';

function hostContext() {
    try { return globalThis.SillyTavern?.getContext?.() ?? null; } catch { return null; }
}

/** 宿主里的一条角色 / 群组 → 排序用的几个字段（只取值，不留引用）。 */
function sortFields(item) {
    return {
        create_date: item?.create_date ?? null,
        fav: item?.fav === true || item?.fav === 'true',
        date_last_chat: Number(item?.date_last_chat) || 0,
        chat_size: Number(item?.chat_size) || 0,
        data_size: Number(item?.data_size) || 0,
    };
}

/**
 * @returns {Promise<{characters:object[], groups:object[], tags:{id:string,name:string,color:string|null}[], stSort:object}>}
 *   characters / groups：{id, avatarUrl|groupId, name, thumbnailUrl, isGroup, tags:string[], ...排序字段}
 */
export async function loadOwners({ signal } = {}) {
    const [characters, groups] = await Promise.all([listCharacters({ signal }), listGroups({ signal })]);
    const ctx = hostContext();
    const hostChars = new Map((Array.isArray(ctx?.characters) ? ctx.characters : []).map(c => [c?.avatar, c]));
    const hostGroups = new Map((Array.isArray(ctx?.groups) ? ctx.groups : []).map(g => [String(g?.id), g]));
    const tagMap = ctx?.tagMap && typeof ctx.tagMap === 'object' ? ctx.tagMap : {};
    const tagsOf = key => (Array.isArray(tagMap[key]) ? tagMap[key].map(String) : []);
    const used = new Set();
    const chars = characters.map(c => {
        const tags = tagsOf(c.avatarUrl);
        tags.forEach(t => used.add(t));
        return { id: c.avatarUrl, avatarUrl: c.avatarUrl, name: c.name, thumbnailUrl: c.thumbnailUrl, isGroup: false, tags, ...sortFields(hostChars.get(c.avatarUrl)) };
    });
    const grps = groups.map(g => ({ id: g.id, groupId: g.id, name: g.name, thumbnailUrl: g.thumbnailUrl, isGroup: true, tags: tagsOf(g.id), ...sortFields(hostGroups.get(String(g.id))) }));
    const hostTags = Array.isArray(ctx?.tags) ? ctx.tags : [];
    const tags = hostTags.filter(t => used.has(String(t?.id)))
        .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'))
        .map(t => ({ id: String(t.id), name: String(t.name ?? ''), color: typeof t.color === 'string' && t.color ? t.color : null }));
    const power = ctx?.powerUserSettings ?? {};
    return { characters: chars, groups: grps, tags, stSort: stOwnerSort(power.sort_field, power.sort_order) };
}
