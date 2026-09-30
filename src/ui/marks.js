// ST Reader — AGPL-3.0
// 划线、批注、收藏（T22、F7/F8）。数据存 T13 store（03 §5.5），定位用 T13 anchor（03 §5.6）。
// 高亮用 CSS Custom Highlight API 上色：不插 <span>、不改正文结构，用户主题与锚点文本都不受影响。
// 只有"有批注"的小角标是插进正文的元素，带 data-stcr-ignore-anchor，锚点文本会自动忽略它。
// 只读（D02）：一切都存扩展自己的存储，不写聊天。

import { createAnchor, resolveAnchor } from '../core/anchor.js';
import { bookmarkId, store } from '../core/store.js';
import { h } from './dom.js';
import { previewLine } from './logic.js';

export const COLORS = Object.freeze([
    { id: 'yellow', label: '黄' }, { id: 'green', label: '绿' }, { id: 'blue', label: '蓝' }, { id: 'pink', label: '粉' },
]);
const PARTS = Object.freeze([['body', '.mes_text'], ['reasoning', '.mes_reasoning']]);
const HL = color => `stcr-hl-${color}`;

export const highlightSupported = () => typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight === 'function';

/**
 * @param {{getHandle:()=>object|null, getChatKey:()=>string|null, getTitle:()=>string, onChange:()=>void}} hooks
 */
export function createMarks({ getHandle, getChatKey, getTitle, onChange }) {
    let token = 0;
    /** @type {Map<string, object>} 本聊天的批注记录 */
    let records = new Map();
    /** @type {Map<string, object>} 本聊天的收藏记录 */
    let bookmarks = new Map();
    /** @type {Map<string, {range:Range, el:Element, color:string}>} 当前画在屏幕上的划线 */
    const painted = new Map();
    const highlights = new Map();
    let flashTimer = null;
    /** 等待画出来再闪的那条：{id, scroll} */
    let pendingFlash = null;

    if (highlightSupported()) {
        for (const { id } of COLORS) {
            const hl = new Highlight();
            hl.priority = 1;
            highlights.set(id, hl);
            CSS.highlights.set(HL(id), hl);
        }
        const flash = new Highlight();
        flash.priority = 2;
        highlights.set('flash', flash);
        CSS.highlights.set('stcr-hl-flash', flash);
    }

    const changed = () => { try { onChange(); } catch (error) { console.error(error); } };
    const contextFor = (el, part) => {
        const handle = getHandle();
        const index = Number(el.getAttribute('mesid'));
        const swipe = Number(el.dataset.swipe);
        const model = handle.getMessage(index);
        return { chatKey: handle.chatKey, mesIndex: index, swipeIndex: swipe, part,
            rawText: part === 'reasoning' ? model.swipes[swipe].reasoning : model.swipes[swipe].text };
    };
    const containerOf = (el, part) => el.querySelector(`:scope > .mes_block ${PARTS.find(([p]) => p === part)[1]}`);

    function addRange(id, range, el, color) {
        removeRange(id);
        painted.set(id, { range, el, color });
        highlights.get(color)?.add(range);
    }
    function removeRange(id) {
        const entry = painted.get(id);
        if (!entry) return;
        highlights.get(entry.color)?.delete(entry.range);
        highlights.get('flash')?.delete(entry.range);
        painted.delete(id);
    }

    /** 把这一楼（当前显示的候选）上的划线画出来；过程中楼被重渲染/换聊天就丢弃结果。 */
    async function paintFloor(el) {
        const chatKey = getChatKey();
        if (!chatKey || !getHandle() || !el?.isConnected && !el?.parentNode) return;
        const index = Number(el.getAttribute('mesid'));
        const swipe = Number(el.dataset.swipe);
        const generation = (el._stcrPaint = (el._stcrPaint ?? 0) + 1);
        const current = token;
        unpaintFloor(el, { keepGeneration: true });
        const mine = [...records.values()].filter(r => r.anchor.mesIndex === index && r.anchor.swipeIndex === swipe);
        if (!mine.length) return;
        for (const [part] of PARTS) {
            const container = containerOf(el, part);
            const list = mine.filter(r => r.anchor.part === part);
            if (!container || !list.length) continue;
            const context = contextFor(el, part);
            const results = [];
            for (const record of list) {
                const result = await resolveAnchor(container, record.anchor, context);
                if (current !== token || generation !== el._stcrPaint || Number(el.dataset.swipe) !== swipe) return;
                results.push({ record, result });
            }
            const markers = [];
            for (const { record, result } of results) {
                const orphan = result.status === 'orphan';
                if (record.orphan !== orphan || record.orphanReason !== (orphan ? result.reason : null)) {
                    // 只在"这楼这候选真的渲染出来了"时才判孤立（03 §5.6）；未加载的页不动。
                    persistOrphan(record, orphan, orphan ? result.reason : null);
                }
                if (result.status !== 'attached' || !result.range) continue;
                addRange(record.id, result.range, el, record.color);
                if (record.note) markers.push({ record, range: result.range });
            }
            // 角标插在划线末尾；从后往前插，不影响前面的 Range（活 Range 会随文本拆分自动更新）。
            markers.sort((a, b) => a.range.compareBoundaryPoints(Range.END_TO_END, b.range));
            for (const { record, range } of markers.reverse()) {
                const end = range.cloneRange();
                end.collapse(false);
                end.insertNode(h('span', { class: 'stcr-note-mark', 'data-stcr-ignore-anchor': '', 'data-ann': record.id, contenteditable: 'false', title: '' },
                    h('i', { class: 'fa-solid fa-comment', 'aria-hidden': 'true' })));
            }
        }
        if (pendingFlash && painted.has(pendingFlash.id)) flash(pendingFlash.id, pendingFlash);
    }

    async function persistOrphan(record, orphan, reason) {
        try {
            const saved = await store.annotations.put({ ...record, orphan, orphanReason: reason });
            if (records.has(saved.id)) records.set(saved.id, saved);
            changed();
        } catch (error) { console.warn('[st-reader] 孤立状态保存失败：', error); }
    }

    /** 楼层要重填（切候选）或移走前调用：擦掉它的划线与角标。 */
    function unpaintFloor(el, { keepGeneration = false } = {}) {
        if (!keepGeneration) el._stcrPaint = (el._stcrPaint ?? 0) + 1;
        for (const [id, entry] of painted) if (entry.el === el) removeRange(id);
        const marks = el.querySelectorAll('.stcr-note-mark');
        if (!marks.length) return;
        for (const mark of marks) mark.remove();
        for (const [, selector] of PARTS) el.querySelector(`:scope > .mes_block ${selector}`)?.normalize();
    }

    /** 清掉已经不在页面上的楼的划线（翻页释放、换聊天后）。 */
    function sweep() {
        for (const [id, entry] of painted) if (!entry.el.isConnected) removeRange(id);
    }

    /** 点在哪条划线上（用字形矩形判断，比光标位置准）。 */
    function hitTest(x, y, el) {
        for (const [id, entry] of painted) {
            if (el && entry.el !== el) continue;
            for (const rect of entry.range.getClientRects()) {
                if (x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1) return id;
            }
        }
        return null;
    }

    /** 划线闪两下（从列表跳转过来时）。未画出来就先记着，画出来再滚过去、再闪。 */
    function flash(id, { scrollIntoView = null } = {}) {
        const entry = painted.get(id);
        if (!entry) { pendingFlash = { id, scrollIntoView }; return false; }
        pendingFlash = null;
        const flashHl = highlights.get('flash');
        clearTimeout(flashTimer);
        flashHl?.clear();
        scrollIntoView?.(entry.range);
        let n = 0;
        const blink = () => {
            if (n++ >= 4) { flashHl?.clear(); return; }
            if (n % 2) flashHl?.add(entry.range); else flashHl?.clear();
            flashTimer = setTimeout(blink, 260);
        };
        blink();
        return true;
    }

    return {
        COLORS,
        records: () => [...records.values()],
        bookmarks: () => [...bookmarks.values()],
        get: id => records.get(id) ?? null,
        painted: id => painted.get(id) ?? null,

        /** 换聊天：读本聊天的批注与收藏。返回 false = 已过期。 */
        async loadChat(chatKey) {
            const current = ++token;
            for (const id of [...painted.keys()]) removeRange(id);
            records = new Map();
            bookmarks = new Map();
            pendingFlash = null;
            if (!chatKey) return true;
            const [annotations, marks] = await Promise.all([store.annotations.list({ chatKey }), store.bookmarks.list({ chatKey })]);
            if (current !== token) return false;
            records = new Map(annotations.map(r => [r.id, r]));
            bookmarks = new Map(marks.map(r => [r.id, r]));
            changed();
            return true;
        },
        reset() { token++; for (const id of [...painted.keys()]) removeRange(id); records = new Map(); bookmarks = new Map(); pendingFlash = null; },
        paintFloor, unpaintFloor, sweep, hitTest, flash,

        /** 在一楼的正文或思维链里划线。container 是 .mes_text / .mes_reasoning。 */
        async create(el, container, range, { color = 'yellow', note = '' } = {}) {
            const part = container.classList.contains('mes_reasoning') ? 'reasoning' : 'body';
            const context = contextFor(el, part);
            const anchor = await createAnchor(container, range, context);
            const record = await store.annotations.put({ anchor, title: getTitle(), preview: anchor.quote.exact.slice(0, 240), note, color });
            records.set(record.id, record);
            await paintFloor(el);
            changed();
            return record;
        },
        /** 改颜色或批注：先取最新记录再整体替换（03 §5.5：put 是完整替换）。 */
        async update(id, patch) {
            const latest = await store.annotations.get(id);
            if (!latest) throw new Error('这条划线已经不存在了');
            const saved = await store.annotations.put({ ...latest, ...patch });
            records.set(saved.id, saved);
            const entry = painted.get(id);
            if (entry) await paintFloor(entry.el);
            changed();
            return saved;
        },
        async remove(id) {
            const entry = painted.get(id);
            await store.annotations.remove(id);
            records.delete(id);
            removeRange(id);
            if (entry) await paintFloor(entry.el);
            changed();
        },

        /** 按 ID 取消收藏（面板"全部聊天"里也能删别的聊天的收藏）。 */
        async removeBookmark(id) {
            await store.bookmarks.remove(id);
            bookmarks.delete(id);
            changed();
        },

        isBookmarked(index, swipe) {
            const chatKey = getChatKey();
            return !!chatKey && bookmarks.has(bookmarkId({ chatKey, mesIndex: index, swipeIndex: swipe }));
        },
        /** 切换整楼（swipe=null）或某候选的收藏。返回切换后是否已收藏。 */
        async toggleBookmark(index, swipe, { preview = null } = {}) {
            const handle = getHandle();
            const target = { chatKey: handle.chatKey, mesIndex: index, swipeIndex: swipe };
            const id = bookmarkId(target);
            if (bookmarks.has(id)) {
                await store.bookmarks.remove(id);
                bookmarks.delete(id);
                changed();
                return false;
            }
            const model = handle.getMessage(index);
            const text = preview ?? model.swipes[swipe ?? model.swipeId]?.text ?? '';
            const saved = await store.bookmarks.put({ ...target, title: getTitle(), preview: previewLine(text, 200) });
            bookmarks.set(saved.id, saved);
            changed();
            return true;
        },
        destroy() {
            token++;
            clearTimeout(flashTimer);
            for (const id of [...painted.keys()]) removeRange(id);
            if (highlightSupported()) {
                for (const { id } of COLORS) CSS.highlights.delete(HL(id));
                CSS.highlights.delete('stcr-hl-flash');
            }
        },
    };
}
