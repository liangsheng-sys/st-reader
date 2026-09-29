// 选中文字浮层（02 §1.5、F7/F2a）、点已有划线的浮层、批注输入框、批注气泡。
// 全部挂在 #stcr_root 里（事件已在根节点截断，不会冒泡到 ST）。
// "卡片"按钮（T23a）：可跨楼，跨楼时只有它能用。"设为替换词…"随 T23b 的替换规则一起做。

import { store } from '../core/store.js';
import { h, iconButton } from './dom.js';
import { COLORS } from './marks.js';

const MASK_MAX = 30;

/**
 * @param {{root:HTMLElement, marks:object, toast:(msg:string)=>void, onCard:(range:Range)=>void,
 *   setPopover:(el:HTMLElement, opts?:{onDismiss?:()=>void})=>void, closePopover:(opts?:{cancel?:boolean})=>void}} deps
 *   onDismiss：浮层被"点外面/换别的浮层"关掉时调用；closePopover({cancel:true})（Esc、取消）不调用。
 */
export function createSelectionUi({ root, marks, toast, onCard, setPopover, closePopover }) {
    let bubble = null;

    /** 把浮层放在一个屏幕矩形的上方（放不下就放下方）；手机贴底。 */
    function place(el, rect, { below = false } = {}) {
        root.append(el);
        const box = root.getBoundingClientRect();
        if (innerWidth < 600) {
            el.classList.add('stcr-popover--dock');
            return;
        }
        const width = el.offsetWidth, height = el.offsetHeight;
        const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2 - box.left), box.width - width - 8);
        let top = rect.top - box.top - height - 8;
        if (below || top < 52) top = rect.bottom - box.top + 8;
        el.style.left = `${left}px`;
        el.style.top = `${Math.min(top, box.height - height - 8)}px`;
    }

    function colorDots(current, onPick, disabled = false) {
        return h('div', { class: 'stcr-dots', role: 'group', 'aria-label': '划线颜色' },
            ...COLORS.map(color => h('button', { type: 'button', class: `stcr-btn stcr-dot stcr-dot--${color.id}${color.id === current ? ' stcr-on' : ''}`,
                title: disabled ? '划线请在同一段正文里选' : `${color.label}色划线`, 'aria-label': `${color.label}色划线`, disabled,
                onclick: () => onPick(color.id) })));
    }

    /**
     * 选区浮层放哪（T23a 验收意见②：选长段要滚动，浮层不能一滚就没）：
     * 选区开头在屏幕里 → 放开头上方；开头滚出去了、结尾在屏幕里 → 放结尾下方；
     * 两头都在屏幕外（选区比一屏还长、正在中间）→ 贴在正文区顶端。手机一直贴底，不用管。
     */
    function placeForRange(el, range) {
        if (innerWidth < 600) { place(el, range.getBoundingClientRect()); return; }
        const view = (root.querySelector('.stcr-scroll') ?? root).getBoundingClientRect();
        const rects = [...range.getClientRects()].filter(r => r.width || r.height);
        const inView = r => r.bottom > view.top + 4 && r.top < view.bottom - 4;
        const first = rects[0], last = rects.at(-1);
        if (first && inView(first)) { place(el, first); return; }
        if (last && inView(last)) { place(el, last, { below: true }); return; }
        const box = root.getBoundingClientRect();
        const x = first ? (Math.min(...rects.map(r => r.left)) + Math.max(...rects.map(r => r.right))) / 2 : view.left + view.width / 2;
        place(el, { left: x, right: x, width: 0, top: view.top + 8, bottom: view.top + 8, height: 0 }, { below: true });
        el.style.top = `${view.top - box.top + 8}px`;
    }

    /**
     * 选中文字后调用。info: {range, el(楼), container(.mes_text/.mes_reasoning)|null, text}
     * container 为 null = 跨楼或跨正文/思维链，只能做卡片。
     */
    function showForSelection({ range, el, container, text }) {
        const canMark = !!container;
        const canMask = canMark && text.length > 0 && text.length <= MASK_MAX && !/\n/.test(text);
        const saved = range.cloneRange();
        const pop = h('div', { class: 'stcr-popover stcr-sel-pop', role: 'toolbar', 'aria-label': '对选中的文字' },
            colorDots(null, color => mark(color), !canMark),
            h('span', { class: 'stcr-sep', 'aria-hidden': 'true' }),
            h('button', { type: 'button', class: 'stcr-btn stcr-pop-btn', disabled: !canMark, title: canMark ? '划线并写批注' : '划线请在同一段正文里选', onclick: () => mark('yellow', true) },
                h('i', { class: 'fa-solid fa-pen', 'aria-hidden': 'true' }), '批注'),
            h('button', { type: 'button', class: 'stcr-btn stcr-pop-btn', title: '用选中的文字做分享卡片（可以跨楼选）', onclick: () => card() },
                h('i', { class: 'fa-solid fa-image', 'aria-hidden': 'true' }), '卡片'),
            h('button', { type: 'button', class: 'stcr-btn stcr-pop-btn', disabled: !canMask,
                title: canMask ? '加入屏蔽词（只作用于分享卡片）' : '请选一个词（30 字以内）', onclick: () => mask() },
            h('i', { class: 'fa-solid fa-eye-slash', 'aria-hidden': 'true' }), '屏蔽'));
        // 点浮层按钮时别把选区点没了
        pop.addEventListener('mousedown', event => event.preventDefault());
        placeForRange(pop, saved);
        setPopover(pop);
        // 滚动时由阅读器调用：跟着选区走；选中的楼被翻页释放了就返回 false，让阅读器收起浮层
        pop._stcrFollow = () => {
            if (saved.collapsed || !saved.startContainer.isConnected || !saved.endContainer.isConnected) return false;
            placeForRange(pop, saved);
            return true;
        };

        async function mark(color, withNote = false) {
            closePopover();
            try {
                const record = await marks.create(el, container, saved, { color });
                getSelection()?.removeAllRanges();
                if (withNote) editNote(record.id);
            } catch (error) {
                console.error('[st-reader] 划线失败：', error);
                toast(error instanceof RangeError ? '这里不能划线（请选正文里的文字）' : `划线没保存上：${error.message ?? error}`);
            }
        }
        function card() {
            closePopover();
            onCard(saved);
        }
        async function mask() {
            closePopover();
            try {
                await store.maskWords.add(text);
                getSelection()?.removeAllRanges();
                toast(`已加入屏蔽词：${text}（只作用于分享卡片）`);
            } catch (error) {
                toast(`屏蔽词没保存上：${error.message ?? error}`);
            }
        }
    }

    /** 点在已有划线上：换色 / 编辑批注 / 取消划线。 */
    function showForMark(id, rect) {
        const record = marks.get(id);
        if (!record) return;
        const pop = h('div', { class: 'stcr-popover stcr-sel-pop', role: 'toolbar', 'aria-label': '这条划线' },
            colorDots(record.color, async color => {
                closePopover();
                if (color === record.color) return;
                try { await marks.update(id, { color }); } catch (error) { toast(`换色没保存上：${error.message ?? error}`); }
            }),
            h('span', { class: 'stcr-sep', 'aria-hidden': 'true' }),
            h('button', { type: 'button', class: 'stcr-btn stcr-pop-btn', onclick: () => { closePopover(); editNote(id); } },
                h('i', { class: 'fa-solid fa-pen', 'aria-hidden': 'true' }), record.note ? '编辑批注' : '写批注'),
            h('button', { type: 'button', class: 'stcr-btn stcr-pop-btn', title: '只删除阅读器里的这条划线，不影响聊天', onclick: async () => {
                closePopover();
                try { await marks.remove(id); toast('已取消划线'); } catch (error) { toast(`没取消成功：${error.message ?? error}`); }
            } }, h('i', { class: 'fa-solid fa-eraser', 'aria-hidden': 'true' }), '取消划线'));
        place(pop, rect);
        setPopover(pop);
    }

    /** 批注输入框：Ctrl+Enter 或点外面 = 保存；Esc = 不保存。保存失败保留输入。 */
    function editNote(id) {
        const record = marks.get(id);
        const entry = marks.painted(id);
        if (!record) return;
        const area = h('textarea', { class: 'text_pole stcr-note-input', rows: '3', placeholder: '写点什么…（Ctrl+Enter 保存）', 'aria-label': '批注' });
        area.value = record.note ?? '';
        const status = h('span', { class: 'stcr-note-status' });
        const pop = h('div', { class: 'stcr-popover stcr-note-pop', role: 'dialog', 'aria-label': '批注' },
            h('div', { class: 'stcr-note-quote', text: `“${record.anchor.quote.exact.slice(0, 80)}${record.anchor.quote.exact.length > 80 ? '…' : ''}”` }),
            area,
            h('div', { class: 'stcr-note-foot' }, status,
                h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', onclick: () => closePopover({ cancel: true }), text: '取消' }),
                h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-primary', onclick: () => save(true), text: '保存' })));
        let saving = false, done = false;
        const autosize = () => { area.style.height = 'auto'; area.style.height = `${Math.min(area.scrollHeight + 2, innerHeight * 0.4)}px`; };
        area.addEventListener('input', autosize);
        area.addEventListener('keydown', event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); save(true); }
        });
        async function save(close) {
            if (saving || done) return;
            const note = area.value.replace(/\s+$/, '');
            if (note === (record.note ?? '')) { done = true; if (close) closePopover(); return; }
            saving = true;
            status.textContent = '保存中…';
            try {
                await marks.update(id, { note });
                done = true;
                if (close) closePopover();
                toast(note ? '批注已保存' : '批注已清空');
            } catch (error) {
                saving = false;
                status.textContent = '没保存上，请重试';
                toast(`批注没保存上：${error.message ?? error}`);
                // 点外面触发的保存失败时，把输入框重新放回去，别把用户写的字弄丢
                if (!pop.isConnected) { root.append(pop); setPopover(pop, { onDismiss: () => save(false) }); }
            }
        }
        const rect = entry ? [...entry.range.getClientRects()].pop() ?? entry.range.getBoundingClientRect() : root.getBoundingClientRect();
        place(pop, rect, { below: true });
        setPopover(pop, { onDismiss: () => save(false) });
        autosize();
        area.focus();
        area.setSelectionRange(area.value.length, area.value.length);
    }

    /** 鼠标停在批注角标上：显示批注全文。 */
    function showBubble(markEl) {
        const record = marks.get(markEl.dataset.ann);
        if (!record?.note) return;
        hideBubble();
        bubble = h('div', { class: 'stcr-note-bubble', role: 'tooltip', text: record.note });
        place(bubble, markEl.getBoundingClientRect());
    }
    function hideBubble() { bubble?.remove(); bubble = null; }

    return { showForSelection, showForMark, editNote, showBubble, hideBubble };
}
