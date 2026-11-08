// ST Reader — AGPL-3.0
// T92 / D44：收藏备注的小输入框（抽屉"收藏"页的铅笔、顶栏 ☆ 菜单"编辑备注…"共用）。
// 单行：回车保存、Esc 取消、点别处（失焦）保存；粘贴进来的换行变空格。只交出文字，存不存由调用方定。

import { FAVORITE_NOTE_MAX } from '../core/store.js';
import { h } from './dom.js';

/**
 * @param {{value?:string, onSave:(text:string)=>void, onCancel?:()=>void}} options
 * @returns {{el:HTMLTextAreaElement, focus:()=>void, commit:()=>void, cancel:()=>void}}
 */
export function createNoteEditor({ value = '', onSave, onCancel = () => {} }) {
    const el = h('textarea', { class: 'text_pole stcr-fav-note-input', rows: 1, maxlength: String(FAVORITE_NOTE_MAX), spellcheck: 'false',
        'aria-label': '收藏备注', placeholder: '写一句备注：回车保存，Esc 取消' });
    el.value = value;
    let done = false;
    const finish = save => {
        if (done) return;
        done = true;
        if (save) onSave(el.value); else onCancel();
    };
    const fit = () => {
        el.style.height = 'auto';
        const full = el.scrollHeight + el.offsetHeight - el.clientHeight; // 加上边框，免得差一两像素出滚动条
        el.style.height = `${Math.min(full, 120)}px`;
        el.style.overflowY = full > 120 ? 'auto' : 'hidden';
    };
    el.addEventListener('keydown', event => {
        if (event.isComposing) return;
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); finish(true); }
        else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
    });
    el.addEventListener('input', () => {
        if (/[\r\n]/.test(el.value)) el.value = el.value.replace(/[\r\n]+/g, ' ');
        fit();
    });
    el.addEventListener('blur', () => finish(true));
    return {
        el,
        focus() { el.focus({ preventScroll: true }); el.setSelectionRange(el.value.length, el.value.length); fit(); },
        commit: () => finish(true),
        cancel: () => finish(false),
    };
}
