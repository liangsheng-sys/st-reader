// 底部设置条（F1、F1a、02 §1.8）。平时只是右下角的 Aa 圆钮。
// 导出/导入 JSON 依赖 T13 store，T22 接入；现在不放按不动的按钮。

import { h, iconButton } from './dom.js';
import { effectivePrefs, PREF_LIMITS } from './logic.js';
import { getPrefs, setPrefs } from './prefs.js';

/** 主题当前正文字号（px），用于显示"18"这样的绝对数。 */
export function themeFontSize() {
    const size = parseFloat(getComputedStyle(document.body).fontSize);
    return Number.isFinite(size) ? size : 15;
}

export function createSettingsBar() {
    const fab = h('button', { type: 'button', class: 'stcr-btn stcr-fab', title: '阅读设置', 'aria-label': '阅读设置', 'aria-expanded': 'false', text: 'Aa' });
    const modeSeg = h('div', { class: 'stcr-seg', role: 'group', 'aria-label': '阅读模式' },
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-mode': 'scroll', text: '滚动' }),
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-mode': 'paged', text: '分页' }));
    const fontValue = h('button', { type: 'button', class: 'stcr-btn stcr-num', title: '点这里恢复主题字号' });
    const font = h('div', { class: 'stcr-set-item' }, h('span', { class: 'stcr-set-label', text: '字号' }),
        iconButton('fa-minus', '字号减小', { 'data-font': '-1' }), fontValue, iconButton('fa-plus', '字号增大', { 'data-font': '1' }));
    const lineRange = h('input', { type: 'range', min: PREF_LIMITS.lineHeight.min, max: PREF_LIMITS.lineHeight.max, step: '0.1', 'aria-label': '行距' });
    const lineValue = h('button', { type: 'button', class: 'stcr-btn stcr-num', title: '点这里恢复主题行距' });
    const widthRange = h('input', { type: 'range', min: PREF_LIMITS.width.min, max: PREF_LIMITS.width.max, step: '10', 'aria-label': '正文宽度' });
    const widthValue = h('button', { type: 'button', class: 'stcr-btn stcr-num', title: '点这里恢复默认宽度' });
    const hideUser = switchInput('隐藏用户楼');
    const expandAll = switchInput('思维链全部展开');
    const dirSeg = h('div', { class: 'stcr-seg', role: 'group', 'aria-label': '排版' },
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-dir': 'b', text: '原样' }),
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-dir': 'a', text: '书页' }));
    const more = h('div', { class: 'stcr-set-more', hidden: true },
        h('div', { class: 'stcr-set-item' }, h('span', { class: 'stcr-set-label', text: '排版' }), dirSeg,
            h('span', { class: 'stcr-set-hint', text: '原样 = 和 ST 一样；书页 = 压平聊天框、像读小说' })));
    const moreBtn = iconButton('fa-ellipsis', '更多设置', { class: 'stcr-set-more-btn', 'aria-expanded': 'false' });
    const panel = h('div', { class: 'stcr-settings', role: 'dialog', 'aria-label': '阅读设置', hidden: true },
        h('div', { class: 'stcr-settings-row' },
            modeSeg, font,
            h('label', { class: 'stcr-set-item' }, h('span', { class: 'stcr-set-label', text: '行距' }), lineRange, lineValue),
            h('label', { class: 'stcr-set-item' }, h('span', { class: 'stcr-set-label', text: '宽度' }), widthRange, widthValue),
            hideUser.el, expandAll.el, moreBtn),
        more,
        h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-set-done', text: '完成' }));

    modeSeg.addEventListener('click', event => {
        const mode = event.target.closest('[data-mode]')?.dataset.mode;
        if (mode) setPrefs({ mode });
    });
    dirSeg.addEventListener('click', event => {
        const direction = event.target.closest('[data-dir]')?.dataset.dir;
        if (direction) setPrefs({ direction });
    });
    font.addEventListener('click', event => {
        const step = event.target.closest('[data-font]')?.dataset.font;
        if (step) setPrefs({ fontDelta: getPrefs().fontDelta + Number(step) });
    });
    fontValue.addEventListener('click', () => setPrefs({ fontDelta: 0 }));
    lineRange.addEventListener('input', () => setPrefs({ lineHeight: Number(lineRange.value) }));
    lineValue.addEventListener('click', event => { event.preventDefault(); setPrefs({ lineHeight: null }); });
    widthRange.addEventListener('input', () => setPrefs({ width: Number(widthRange.value) }));
    widthValue.addEventListener('click', event => { event.preventDefault(); setPrefs({ width: null }); });
    hideUser.input.addEventListener('change', () => setPrefs({ hideUser: hideUser.input.checked }));
    expandAll.input.addEventListener('change', () => setPrefs({ expandAllReasoning: expandAll.input.checked }));
    moreBtn.addEventListener('click', () => {
        more.hidden = !more.hidden;
        moreBtn.setAttribute('aria-expanded', String(!more.hidden));
    });
    fab.addEventListener('click', () => (panel.hidden ? open() : close()));
    panel.querySelector('.stcr-set-done').addEventListener('click', () => close());

    function sync() {
        const prefs = getPrefs();
        const shown = effectivePrefs(prefs);
        for (const button of modeSeg.children) button.classList.toggle('stcr-on', button.dataset.mode === shown.mode);
        for (const button of dirSeg.children) button.classList.toggle('stcr-on', button.dataset.dir === prefs.direction);
        fontValue.textContent = String(Math.round(themeFontSize() + prefs.fontDelta));
        lineRange.value = String(prefs.lineHeight ?? 1.6);
        lineValue.textContent = prefs.lineHeight === null ? '主题' : prefs.lineHeight.toFixed(1);
        widthRange.value = String(shown.width ?? 800);
        widthValue.textContent = shown.width === null ? '跟随 ST' : String(shown.width);
        hideUser.input.checked = prefs.hideUser;
        expandAll.input.checked = prefs.expandAllReasoning;
    }
    function open() {
        sync();
        panel.hidden = false;
        fab.setAttribute('aria-expanded', 'true');
    }
    function close() {
        panel.hidden = true;
        more.hidden = true;
        moreBtn.setAttribute('aria-expanded', 'false');
        fab.setAttribute('aria-expanded', 'false');
    }
    return { fab, panel, sync, open, close, isOpen: () => !panel.hidden };
}

function switchInput(label) {
    const input = h('input', { type: 'checkbox', role: 'switch', class: 'stcr-switch-input' });
    const el = h('label', { class: 'stcr-set-item stcr-switch' }, input, h('span', { class: 'stcr-switch-track', 'aria-hidden': 'true' }), h('span', { class: 'stcr-set-label', text: label }));
    return { el, input };
}
