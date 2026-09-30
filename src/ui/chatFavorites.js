// ST Reader — AGPL-3.0
// 收藏整个聊天（T43、F13、D19）：存 store.bookmarks 的 kind:'chat'（03 §5.12）。抽屉"收藏"页、聊天列表的 ☆、阅读器顶栏的 ☆ 共用。
// 楼 / 候选的收藏（kind floor/swipe）只在右侧批注面板里，这里不碰。只读（D02）：只写扩展自己的存储。

import { store, bookmarkId } from '../core/store.js';

let keys = null; // 已收藏的 chatKey 集合；null = 还没读
const listeners = new Set();

/** 收藏的聊天记录（最近收藏的在前）。 */
export async function listFavoriteChats() {
    const list = await store.bookmarks.list({ kind: 'chat' });
    keys = new Set(list.map(r => r.chatKey));
    return list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
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
        on = false;
    } else {
        await store.bookmarks.put({ kind: 'chat', chatKey, title: String(title || chatKey).slice(0, 2000), preview: '' });
        keys.add(chatKey);
        on = true;
    }
    for (const listener of listeners) listener(chatKey, on);
    return on;
}

/** 收藏变化（抽屉与顶栏互相同步）。返回取消订阅函数。 */
export function onFavoriteChatsChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** 导入备份后重读。 */
export function resetFavoriteChats() { keys = null; }
