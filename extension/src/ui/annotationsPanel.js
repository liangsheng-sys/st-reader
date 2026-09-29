// 右侧批注面板（02 §1.6、F7/F8）：本聊天的划线与批注 / 收藏 / 孤立。
// 跨聊天的收藏汇总在左侧抽屉"收藏"页签。文字一律 textContent。

import { copyText, h, iconButton } from './dom.js';
import { COLORS } from './marks.js';

const TABS = [
    { id: 'notes', label: '划线与批注' },
    { id: 'bookmarks', label: '收藏' },
    { id: 'orphans', label: '孤立' },
];

/**
 * @param {{marks:object, getHandle:()=>object|null, onJump:(target:{index:number,swipe:number|null,annotationId?:string})=>void,
 *   onPinChange:(pinned:boolean)=>void, isPinned:()=>boolean, onBackupHint:()=>void, toast:(msg:string)=>void,
 *   confirm:(message:string, ok:string)=>Promise<boolean>}} deps
 */
export function createPanel({ marks, getHandle, onJump, onPinChange, isPinned, onBackupHint, toast, confirm }) {
    let tab = 'notes';
    let colorFilter = null;
    let notesOnly = false;

    const tabButtons = TABS.map(item => h('button', { type: 'button', role: 'tab', class: 'stcr-btn stcr-panel-tab', 'data-tab': item.id },
        h('span', { text: item.label }), h('span', { class: 'stcr-panel-count' })));
    const pin = iconButton('fa-thumbtack', '钉住面板', { class: 'stcr-panel-pin' });
    const filters = h('div', { class: 'stcr-panel-filters' },
        h('div', { class: 'stcr-dots', role: 'group', 'aria-label': '按颜色看' },
            h('button', { type: 'button', class: 'stcr-btn stcr-chip', 'data-color': '', text: '全部' }),
            ...COLORS.map(color => h('button', { type: 'button', class: `stcr-btn stcr-dot stcr-dot--${color.id}`, 'data-color': color.id, title: `只看${color.label}色`, 'aria-label': `只看${color.label}色` }))),
        h('label', { class: 'stcr-panel-check' }, h('input', { type: 'checkbox', class: 'stcr-notes-only' }), '只看有批注的'));
    const list = h('div', { class: 'stcr-panel-list', role: 'list' });
    const el = h('aside', { class: 'stcr-panel', 'aria-label': '划线、批注与收藏' },
        h('div', { class: 'stcr-panel-head' }, h('div', { class: 'stcr-panel-tabs', role: 'tablist' }, tabButtons), pin,
            iconButton('fa-xmark', '关闭面板', { class: 'stcr-panel-close', 'data-act': 'close-panel' })),
        filters, list,
        h('button', { type: 'button', class: 'stcr-btn stcr-panel-foot', text: '这些数据存在浏览器里，记得定期导出备份 ›', onclick: () => onBackupHint() }));

    for (const button of tabButtons) button.addEventListener('click', () => { tab = button.dataset.tab; render(); });
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

    function swipeLabel(index, swipe) {
        if (swipe === null || swipe === undefined) return '';
        try {
            const count = getHandle()?.getMessage(index).swipes.length ?? 0;
            return count > 1 ? ` · 候选 ${swipe + 1}/${count}` : '';
        } catch { return ` · 候选 ${swipe + 1}`; }
    }
    const byPlace = (a, b) => a.mesIndex - b.mesIndex || (a.swipeIndex ?? -1) - (b.swipeIndex ?? -1) || String(a.createdAt).localeCompare(String(b.createdAt));

    function noteRows(records) {
        return records.map(r => ({ ...r, mesIndex: r.anchor.mesIndex, swipeIndex: r.anchor.swipeIndex })).sort(byPlace).map(r =>
            h('div', { class: `stcr-item stcr-item--${r.color}`, role: 'listitem' },
                h('button', { type: 'button', class: 'stcr-btn stcr-item-main', 'data-jump': r.id, title: '跳到这条划线' },
                    h('span', { class: 'stcr-item-quote', text: `“${r.anchor.quote.exact}”` }),
                    r.note ? h('span', { class: 'stcr-item-note', text: r.note }) : null,
                    h('span', { class: 'stcr-item-meta', text: `第 ${r.mesIndex + 1} 楼${swipeLabel(r.mesIndex, r.swipeIndex)}${r.anchor.part === 'reasoning' ? ' · 思维链' : ''}` }))));
    }
    function bookmarkRows(records) {
        return [...records].sort(byPlace).map(r =>
            h('div', { class: 'stcr-item stcr-item--bookmark', role: 'listitem' },
                h('button', { type: 'button', class: 'stcr-btn stcr-item-main', 'data-index': r.mesIndex, 'data-swipe': r.swipeIndex ?? '', title: '跳到这里' },
                    h('span', { class: 'stcr-item-meta stcr-item-meta--top' },
                        h('i', { class: `fa-solid ${r.swipeIndex === null ? 'fa-bookmark' : 'fa-star'}`, 'aria-hidden': 'true' }),
                        ` 第 ${r.mesIndex + 1} 楼${r.swipeIndex === null ? '' : swipeLabel(r.mesIndex, r.swipeIndex)}`),
                    r.preview ? h('span', { class: 'stcr-item-quote', text: r.preview }) : null),
                iconButton('fa-xmark', '取消收藏', { class: 'stcr-item-x', 'data-unbookmark': r.id, 'data-index': r.mesIndex, 'data-swipe': r.swipeIndex ?? '' })));
    }
    function orphanRows(records) {
        return records.map(r => ({ ...r, mesIndex: r.anchor.mesIndex, swipeIndex: r.anchor.swipeIndex })).sort(byPlace).map(r =>
            h('div', { class: `stcr-item stcr-item--${r.color} stcr-item--orphan`, role: 'listitem' },
                h('div', { class: 'stcr-item-main' },
                    h('span', { class: 'stcr-item-quote', text: `“${r.anchor.quote.exact}”` }),
                    r.note ? h('span', { class: 'stcr-item-note', text: r.note }) : null,
                    h('span', { class: 'stcr-item-meta', text: `原第 ${r.mesIndex + 1} 楼${swipeLabel(r.mesIndex, r.swipeIndex)} · ${r.orphanReason === 'ambiguous' ? '这段文字现在出现了好几次，认不出是哪一处' : '原文已变，找不到这段了'}` })),
                h('div', { class: 'stcr-item-actions' },
                    iconButton('fa-copy', '复制原文', { 'data-copy': r.id }),
                    iconButton('fa-trash', '移除这条', { 'data-drop': r.id }))));
    }

    function render() {
        syncPin();
        const all = marks.records();
        const orphans = all.filter(r => r.orphan);
        const notes = all.filter(r => !r.orphan);
        const bookmarks = marks.bookmarks();
        const counts = { notes: notes.length, bookmarks: bookmarks.length, orphans: orphans.length };
        for (const button of tabButtons) {
            button.setAttribute('aria-selected', String(button.dataset.tab === tab));
            button.querySelector('.stcr-panel-count').textContent = counts[button.dataset.tab] ? String(counts[button.dataset.tab]) : '';
            button.classList.toggle('stcr-panel-tab--warn', button.dataset.tab === 'orphans' && counts.orphans > 0);
        }
        filters.hidden = tab !== 'notes';
        for (const chip of filters.querySelectorAll('[data-color]')) chip.classList.toggle('stcr-on', (chip.dataset.color || null) === colorFilter);
        let rows;
        if (tab === 'notes') {
            const shown = notes.filter(r => (!colorFilter || r.color === colorFilter) && (!notesOnly || r.note));
            rows = shown.length ? noteRows(shown) : [empty(notes.length ? '没有符合条件的划线。' : '还没有划线。选中正文里的文字，点一个颜色就能划线。')];
        } else if (tab === 'bookmarks') {
            rows = bookmarks.length ? bookmarkRows(bookmarks) : [empty('这个聊天还没有收藏。鼠标移到楼上，点书签图标收藏整楼，点星星收藏当前候选。')];
        } else {
            rows = orphans.length ? orphanRows(orphans) : [empty('没有孤立的划线。正则或原文变了、找不到原位置的划线会放到这里，不会丢。')];
        }
        list.replaceChildren(...rows);
    }
    const empty = text => h('div', { class: 'stcr-panel-empty', text });

    async function onListClick(event) {
        const jump = event.target.closest('[data-jump]');
        if (jump) {
            const record = marks.get(jump.dataset.jump);
            if (record) onJump({ index: record.anchor.mesIndex, swipe: record.anchor.swipeIndex, annotationId: record.id, part: record.anchor.part });
            return;
        }
        const unbookmark = event.target.closest('[data-unbookmark]');
        if (unbookmark) {
            const swipe = unbookmark.dataset.swipe === '' ? null : Number(unbookmark.dataset.swipe);
            try { await marks.toggleBookmark(Number(unbookmark.dataset.index), swipe); toast('已取消收藏'); } catch (error) { toast(`没取消成功：${error.message ?? error}`); }
            return;
        }
        const target = event.target.closest('.stcr-item--bookmark [data-index]');
        if (target) { onJump({ index: Number(target.dataset.index), swipe: target.dataset.swipe === '' ? null : Number(target.dataset.swipe) }); return; }
        const copy = event.target.closest('[data-copy]');
        if (copy) {
            const record = marks.get(copy.dataset.copy);
            const ok = record && await copyText(record.anchor.quote.exact + (record.note ? `\n\n批注：${record.note}` : ''));
            toast(ok ? '已复制原文与批注' : '复制失败');
            return;
        }
        const drop = event.target.closest('[data-drop]');
        if (drop) {
            if (!await confirm('移除这条孤立的划线？它的批注也会一起删除。（只删阅读器里的记录，不影响聊天）', '移除')) return;
            try { await marks.remove(drop.dataset.drop); toast('已移除'); } catch (error) { toast(`没移除成功：${error.message ?? error}`); }
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
