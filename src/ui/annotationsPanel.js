// ST Reader — AGPL-3.0
// 右侧批注面板（02 §1.6、F7/F8）：划线与批注 / 收藏 / 孤立。
// 顶部"本聊天 / 全部聊天"切换（T22 验收意见）：全部聊天时按聊天分组，点一条直接打开那个聊天跳过去。
// 没打开聊天时默认"全部聊天"。文字一律 textContent。

import { parseChatKey } from '../core/chatSource.js';
import { store } from '../core/store.js';
import { copyText, h, iconButton } from './dom.js';
import { COLORS } from './marks.js';
import { redactString } from './redact.js';

const TABS = [
    { id: 'notes', label: '划线与批注' },
    { id: 'bookmarks', label: '收藏' },
    { id: 'orphans', label: '孤立' },
];

/**
 * @param {{marks:object, getHandle:()=>object|null, getChatKey:()=>string|null, onCard:(record:object)=>void,
 *   onJump:(target:{chatKey:string,index:number,swipe:number|null,annotationId?:string,part?:string})=>void,
 *   onPinChange:(pinned:boolean)=>void, isPinned:()=>boolean, onBackupHint:()=>void, toast:(msg:string)=>void,
 *   confirm:(message:string, ok:string)=>Promise<boolean>}} deps
 */
export function createPanel({ marks, getHandle, getChatKey, onJump, onCard, onPinChange, isPinned, onBackupHint, toast, confirm }) {
    let tab = 'notes';
    let scope = null; // 'chat' | 'all'；null = 按有没有打开聊天自动决定
    let colorFilter = null;
    let notesOnly = false;
    let token = 0;
    /** 当前列表里展示的记录（全部聊天时来自 store，用于复制原文等） */
    let shown = new Map();

    const tabButtons = TABS.map(item => h('button', { type: 'button', role: 'tab', class: 'stcr-btn stcr-panel-tab', 'data-tab': item.id },
        h('span', { text: item.label }), h('span', { class: 'stcr-panel-count' })));
    const pin = iconButton('fa-thumbtack', '钉住面板', { class: 'stcr-panel-pin' });
    const scopeSeg = h('div', { class: 'stcr-seg stcr-panel-scope', role: 'group', 'aria-label': '范围' },
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-scope': 'chat', text: '本聊天' }),
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-scope': 'all', text: '全部聊天' }));
    const filters = h('div', { class: 'stcr-panel-filters' },
        h('div', { class: 'stcr-dots', role: 'group', 'aria-label': '按颜色看' },
            h('button', { type: 'button', class: 'stcr-btn stcr-chip', 'data-color': '', text: '全部' }),
            ...COLORS.map(color => h('button', { type: 'button', class: `stcr-btn stcr-dot stcr-dot--${color.id}`, 'data-color': color.id, title: `只看${color.label}色`, 'aria-label': `只看${color.label}色` }))),
        h('label', { class: 'stcr-panel-check' }, h('input', { type: 'checkbox', class: 'stcr-notes-only' }), '只看有批注的'));
    const list = h('div', { class: 'stcr-panel-list', role: 'list' });
    const el = h('aside', { class: 'stcr-panel', 'aria-label': '划线、批注与收藏' },
        h('div', { class: 'stcr-panel-head' }, h('div', { class: 'stcr-panel-tabs', role: 'tablist' }, tabButtons), pin,
            iconButton('fa-xmark', '关闭面板', { class: 'stcr-panel-close', 'data-act': 'close-panel' })),
        h('div', { class: 'stcr-panel-scope-row' }, scopeSeg),
        filters, list,
        h('button', { type: 'button', class: 'stcr-btn stcr-panel-foot', text: '这些会自动备份到你的 ST 服务器 · 备份设置 ›', onclick: () => onBackupHint() }));

    for (const button of tabButtons) button.addEventListener('click', () => { tab = button.dataset.tab; render(); });
    scopeSeg.addEventListener('click', event => {
        const next = event.target.closest('[data-scope]')?.dataset.scope;
        if (!next) return;
        if (next === 'chat' && !getChatKey()) { toast('还没打开聊天，先看全部聊天的吧'); return; }
        scope = next;
        render();
    });
    pin.addEventListener('click', () => { onPinChange(!isPinned()); syncPin(); });
    filters.addEventListener('click', event => {
        const chip = event.target.closest('[data-color]');
        if (!chip) return;
        colorFilter = chip.dataset.color || null;
        render();
    });
    filters.querySelector('.stcr-notes-only').addEventListener('change', event => { notesOnly = event.target.checked; render(); });
    list.addEventListener('click', event => onListClick(event));

    function syncPin() { pin.classList.toggle('stcr-on', isPinned()); pin.title = isPinned() ? '取消钉住' : '钉住面板'; }
    const currentScope = () => (getChatKey() ? scope ?? 'chat' : 'all');

    function swipeLabel(chatKey, index, swipe) {
        if (swipe === null || swipe === undefined) return '';
        const handle = getHandle();
        if (handle && chatKey === getChatKey()) {
            try {
                const count = handle.getMessage(index).swipes.length;
                return count > 1 ? ` · 候选 ${swipe + 1}/${count}` : '';
            } catch { /* 楼号超出当前聊天：退回不带总数 */ }
        }
        // 别的聊天没打开，不知道这楼有几个候选：第 1 个就不写（多数楼只有一个），其余写"候选 N"
        return swipe > 0 ? ` · 候选 ${swipe + 1}` : '';
    }
    const where = r => ({ chatKey: r.anchor?.chatKey ?? r.chatKey, mesIndex: r.anchor?.mesIndex ?? r.mesIndex, swipeIndex: r.anchor ? r.anchor.swipeIndex : r.swipeIndex });
    const byPlace = (a, b) => where(a).mesIndex - where(b).mesIndex || (where(a).swipeIndex ?? -1) - (where(b).swipeIndex ?? -1)
        || String(a.createdAt).localeCompare(String(b.createdAt));

    function noteRow(r) {
        const w = where(r);
        return h('div', { class: `stcr-item stcr-item--${r.color}`, role: 'listitem' },
            h('button', { type: 'button', class: 'stcr-btn stcr-item-main', 'data-jump': r.id, title: '跳到这条划线' },
                h('span', { class: 'stcr-item-quote', text: `“${redactString(r.anchor.quote.exact, r.anchor.chatKey)}”` }),
                r.note ? h('span', { class: 'stcr-item-note', text: redactString(r.note, r.anchor.chatKey) }) : null,
                h('span', { class: 'stcr-item-meta', text: `第 ${w.mesIndex + 1} 楼${swipeLabel(w.chatKey, w.mesIndex, w.swipeIndex)}${r.anchor.part === 'reasoning' ? ' · 思维链' : ''}` })),
            iconButton('fa-image', '用这段做分享卡片', { class: 'stcr-item-x stcr-item-card', 'data-card': r.id }));
    }
    function bookmarkRow(r) {
        return h('div', { class: 'stcr-item stcr-item--bookmark', role: 'listitem' },
            h('button', { type: 'button', class: 'stcr-btn stcr-item-main', 'data-bm': r.id, title: '跳到这里' },
                h('span', { class: 'stcr-item-meta stcr-item-meta--top' },
                    h('i', { class: `fa-solid ${r.swipeIndex === null ? 'fa-bookmark' : 'fa-star'}`, 'aria-hidden': 'true' }),
                    ` 第 ${r.mesIndex + 1} 楼${r.swipeIndex === null ? '' : swipeLabel(r.chatKey, r.mesIndex, r.swipeIndex)}`),
                r.preview ? h('span', { class: 'stcr-item-quote', text: redactString(r.preview, r.chatKey) }) : null),
            iconButton('fa-xmark', '取消收藏', { class: 'stcr-item-x', 'data-unbookmark': r.id }));
    }
    function orphanRow(r) {
        const w = where(r);
        return h('div', { class: `stcr-item stcr-item--${r.color} stcr-item--orphan`, role: 'listitem' },
            h('div', { class: 'stcr-item-main' },
                h('span', { class: 'stcr-item-quote', text: `“${redactString(r.anchor.quote.exact, r.anchor.chatKey)}”` }),
                r.note ? h('span', { class: 'stcr-item-note', text: redactString(r.note, r.anchor.chatKey) }) : null,
                h('span', { class: 'stcr-item-meta', text: `原第 ${w.mesIndex + 1} 楼${swipeLabel(w.chatKey, w.mesIndex, w.swipeIndex)} · ${r.orphanReason === 'ambiguous' ? '这段文字现在出现了好几次，认不出是哪一处' : '原文已变，找不到这段了'}` })),
            h('div', { class: 'stcr-item-actions' },
                iconButton('fa-copy', '复制原文', { 'data-copy': r.id }),
                iconButton('fa-trash', '移除这条', { 'data-drop': r.id })));
    }

    /** 全部聊天：按聊天分组，本聊天排最前，其余按最近更新排。 */
    function grouped(records, rowFn) {
        const groups = new Map();
        for (const r of records) {
            const key = where(r).chatKey;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(r);
        }
        const active = getChatKey();
        const latest = items => items.reduce((max, r) => (String(r.updatedAt) > max ? String(r.updatedAt) : max), '');
        const order = [...groups.entries()].sort(([ka, a], [kb, b]) => (ka === active ? -1 : kb === active ? 1 : latest(b).localeCompare(latest(a))));
        return order.map(([chatKey, items]) => {
            let title = items.find(r => r.title)?.title;
            if (!title) { try { title = parseChatKey(chatKey).fileName; } catch { title = '（未知聊天）'; } }
            return h('div', { class: 'stcr-panel-group' },
                h('div', { class: 'stcr-panel-group-title' }, h('span', { text: redactString(title, chatKey) }),
                    chatKey === active ? h('small', { class: 'stcr-row-tag', text: '正在读' }) : null,
                    h('small', { class: 'stcr-panel-group-count', text: String(items.length) })),
                ...items.sort(byPlace).map(rowFn));
        });
    }

    async function collect(all) {
        if (!all) return { annotations: marks.records(), bookmarks: marks.bookmarks() };
        const [annotations, bookmarks] = await Promise.all([store.annotations.list(), store.bookmarks.list()]);
        return { annotations, bookmarks: bookmarks.filter(r => r.kind !== 'chat') }; // 收藏整个聊天在左侧抽屉（D19）
    }

    async function render() {
        const current = ++token;
        syncPin();
        const sc = currentScope();
        for (const button of scopeSeg.children) {
            button.classList.toggle('stcr-on', button.dataset.scope === sc);
            button.disabled = button.dataset.scope === 'chat' && !getChatKey();
        }
        let data;
        try { data = await collect(sc === 'all'); } catch (error) {
            if (current === token) list.replaceChildren(empty(`读取失败：${error.message ?? error}`));
            return;
        }
        if (current !== token) return;
        const orphans = data.annotations.filter(r => r.orphan);
        const notes = data.annotations.filter(r => !r.orphan);
        shown = new Map([...data.annotations, ...data.bookmarks].map(r => [r.id, r]));
        const counts = { notes: notes.length, bookmarks: data.bookmarks.length, orphans: orphans.length };
        for (const button of tabButtons) {
            button.setAttribute('aria-selected', String(button.dataset.tab === tab));
            button.querySelector('.stcr-panel-count').textContent = counts[button.dataset.tab] ? String(counts[button.dataset.tab]) : '';
            button.classList.toggle('stcr-panel-tab--warn', button.dataset.tab === 'orphans' && counts.orphans > 0);
        }
        filters.hidden = tab !== 'notes';
        for (const chip of filters.querySelectorAll('[data-color]')) chip.classList.toggle('stcr-on', (chip.dataset.color || null) === colorFilter);
        const all = sc === 'all';
        const view = (records, rowFn) => (all ? grouped(records, rowFn) : [...records].sort(byPlace).map(rowFn));
        const where_ = all ? '' : '这个聊天';
        let rows;
        if (tab === 'notes') {
            const visible = notes.filter(r => (!colorFilter || r.color === colorFilter) && (!notesOnly || r.note));
            rows = visible.length ? view(visible, noteRow)
                : [empty(notes.length ? '没有符合条件的划线。' : `${where_}还没有划线。选中正文里的文字，点一个颜色就能划线。`)];
        } else if (tab === 'bookmarks') {
            rows = data.bookmarks.length ? view(data.bookmarks, bookmarkRow)
                : [empty(`${where_}还没有收藏。鼠标移到楼上，点书签图标收藏整楼，点星星收藏当前候选。`)];
        } else {
            rows = orphans.length ? view(orphans, orphanRow)
                : [empty('没有孤立的划线。正则或原文变了、找不到原位置的划线会放到这里，不会丢。')];
        }
        list.replaceChildren(...rows);
    }
    const empty = text => h('div', { class: 'stcr-panel-empty', text });

    async function onListClick(event) {
        const jump = event.target.closest('[data-jump]');
        if (jump) {
            const r = shown.get(jump.dataset.jump);
            if (r) onJump({ chatKey: r.anchor.chatKey, index: r.anchor.mesIndex, swipe: r.anchor.swipeIndex, annotationId: r.id, part: r.anchor.part });
            return;
        }
        const card = event.target.closest('[data-card]');
        if (card) {
            const r = shown.get(card.dataset.card);
            if (r) onCard(r);
            return;
        }
        const unbookmark = event.target.closest('[data-unbookmark]');
        if (unbookmark) {
            try { await marks.removeBookmark(unbookmark.dataset.unbookmark); toast('已取消收藏'); render(); } catch (error) { toast(`没取消成功：${error.message ?? error}`); }
            return;
        }
        const bm = event.target.closest('[data-bm]');
        if (bm) {
            const r = shown.get(bm.dataset.bm);
            if (r) onJump({ chatKey: r.chatKey, index: r.mesIndex, swipe: r.swipeIndex });
            return;
        }
        const copy = event.target.closest('[data-copy]');
        if (copy) {
            const r = shown.get(copy.dataset.copy);
            const ok = r && await copyText(r.anchor.quote.exact + (r.note ? `\n\n批注：${r.note}` : ''));
            toast(ok ? '已复制原文与批注' : '复制失败');
            return;
        }
        const drop = event.target.closest('[data-drop]');
        if (drop) {
            if (!await confirm('移除这条孤立的划线？它的批注也会一起删除。（只删阅读器里的记录，不影响聊天）', '移除')) return;
            try { await marks.remove(drop.dataset.drop); toast('已移除'); render(); } catch (error) { toast(`没移除成功：${error.message ?? error}`); }
        }
    }

    return {
        el,
        open(next) { if (next) tab = next; el.classList.add('stcr-panel--open'); render(); },
        close() { el.classList.remove('stcr-panel--open'); },
        isOpen: () => el.classList.contains('stcr-panel--open'),
        refresh() { if (el.classList.contains('stcr-panel--open')) render(); },
    };
}
