// ST Reader — AGPL-3.0
// 收藏整个聊天（T43、F13、D19）：存 store.bookmarks 的 kind:'chat'（03 §5.12）。抽屉"收藏"页、聊天列表的 ☆、阅读器顶栏的 ☆ 共用。
// 楼 / 候选的收藏（kind floor/swipe）只在右侧批注面板里，这里不碰。只读（D02）：只写扩展自己的存储。
// T92 / D44：聊天收藏可带一句备注（note，≤ 500 字），抽屉"收藏"页显示、可改，过滤框也搜它。

import { store, bookmarkId, FAVORITE_NOTE_MAX } from '../core/store.js';

let keys = null; // 已收藏的 chatKey 集合；null = 还没读
const notes = new Map(); // chatKey → 备注（只有写了备注的）
const listeners = new Set();

/** 收藏的聊天记录（最近收藏的在前）。 */
export async function listFavoriteChats() {
    const list = await store.bookmarks.list({ kind: 'chat' });
    keys = new Set(list.map(r => r.chatKey));
    notes.clear();
    for (const record of list) if (record.note) notes.set(record.chatKey, record.note);
    return list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** 同步查询备注（先 await loadFavoriteChats 一次）；没有为空串。 */
export const favoriteNote = chatKey => notes.get(chatKey) ?? '';

/** 备注的样子：换行变空格、去首尾空白、截到上限（store 也会校验）。 */
export const cleanNote = note => String(note ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, FAVORITE_NOTE_MAX);

/**
 * 写 / 改 / 删（空串）一个聊天收藏的备注。还没收藏的顺手收藏（title 同 toggleFavoriteChat）。
 * @returns {Promise<string>} 存下的备注（空串 = 没有）
 */
export async function setFavoriteNote(chatKey, note, title) {
    await loadFavoriteChats();
    const clean = cleanNote(note);
    const record = await store.bookmarks.get(bookmarkId({ kind: 'chat', chatKey }));
    if (record && (record.note ?? '') === clean) return clean; // 没改，不写库、不通知
    const next = record ? { ...record } : { kind: 'chat', chatKey, title: String(title || chatKey).slice(0, 2000), preview: '' };
    if (clean) next.note = clean; else delete next.note;
    await store.bookmarks.put(next);
    keys.add(chatKey);
    if (clean) notes.set(chatKey, clean); else notes.delete(chatKey);
    for (const listener of listeners) listener(chatKey, true, { note: clean });
    return clean;
}

/** 同步查询（先 await loadFavoriteChats 一次）。 */
export const isFavoriteChat = chatKey => !!keys?.has(chatKey);

export async function loadFavoriteChats() {
    if (!keys) await listFavoriteChats();
    return keys;
}

/**
 * 收藏 / 取消收藏一个聊天。title 用"角色名 · 聊天名"，只给列表看。
 * @returns {Promise<boolean>} 操作后是否处于已收藏
 */
export async function toggleFavoriteChat(chatKey, title) {
    await loadFavoriteChats();
    const id = bookmarkId({ kind: 'chat', chatKey });
    let on;
    if (keys.has(chatKey)) {
        await store.bookmarks.remove(id);
        keys.delete(chatKey);
        notes.delete(chatKey);
        on = false;
    } else {
        await store.bookmarks.put({ kind: 'chat', chatKey, title: String(title || chatKey).slice(0, 2000), preview: '' });
        keys.add(chatKey);
        on = true;
    }
    for (const listener of listeners) listener(chatKey, on);
    return on;
}

/** 收藏变化（抽屉与顶栏互相同步）：listener(chatKey, on, {note}?)，改备注时第三个参数带新备注。返回取消订阅函数。 */
export function onFavoriteChatsChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** 导入备份后重读。 */
export function resetFavoriteChats() { keys = null; }
