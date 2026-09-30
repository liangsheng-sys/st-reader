// ST Reader — AGPL-3.0
// 颜色选择条（T42、F14①②）：8 个预设 + 自己输入色号。替换文字的背景色和色块遮盖共用。
// 只产出小写 #rrggbb（core 只收六位实色，03 §5.12）；"无 / 跟随模板"由调用方用 null 表示。

import { h } from './dom.js';
import { cleanHexColor, COLOR_PRESETS } from './logic.js';

/** 底色上该用深字还是浅字（WCAG 相对亮度），替换文字加了底色时保证看得清。 */
export function readableOn(hex) {
    const color = cleanHexColor(hex);
    if (!color) return null;
    const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? '#1f2329' : '#ffffff';
}

/**
 * @param {{value:string|null, onPick:(color:string|null)=>void, noneLabel?:string, noneSwatch?:string, label?:string}} opts
 *   noneLabel：第一格"无 / 跟随"的说明文字；不给就没有这一格。noneSwatch：这一格显示的颜色（跟随模板时给模板色）。
 */
export function colorPicker({ value, onPick, noneLabel, noneSwatch, label = '颜色' }) {
    const current = cleanHexColor(value);
    const isPreset = COLOR_PRESETS.some(p => p.value === current);
    const swatch = (color, title, attrs = {}) => h('button', { type: 'button', class: `stcr-btn stcr-color-pick${color === current ? ' stcr-on' : ''}`,
        'data-color': color ?? '', title, 'aria-label': title, 'aria-pressed': String(color === current), ...attrs },
    h('span', { class: 'stcr-color-dot', style: color ? `background-color:${color}` : noneSwatch ? `background-color:${noneSwatch}` : null }));
    const hex = h('input', { type: 'text', class: 'text_pole stcr-color-hex', maxlength: '7', spellcheck: 'false', placeholder: '#色号', 'aria-label': '输入色号，比如 #f5b8c8',
        value: current && !isPreset ? current : '' });
    const native = h('input', { type: 'color', class: 'stcr-color-native', 'aria-label': '用调色盘选颜色', title: '调色盘', value: current ?? '#93c8ec' });
    const el = h('div', { class: 'stcr-color-picker', role: 'group', 'aria-label': label },
        noneLabel ? swatch(null, noneLabel, { class: `stcr-btn stcr-color-pick stcr-color-pick--none${current === null ? ' stcr-on' : ''}` }) : null,
        ...COLOR_PRESETS.map(p => swatch(p.value, `${p.label} ${p.value}`)),
        h('label', { class: `stcr-color-custom${current && !isPreset ? ' stcr-on' : ''}`, title: '自己输入色号或用调色盘' },
            h('span', { class: 'stcr-color-dot stcr-color-dot--custom', style: current && !isPreset ? `background-color:${current}` : null }, native),
            h('span', { class: 'stcr-color-custom-label', text: '自定义' }), hex));
    el.addEventListener('click', event => {
        const pick = event.target.closest('[data-color]');
        if (pick) onPick(pick.dataset.color || null);
    });
    let last = current; // 回车后失焦还会再来一次 change，同一个色号只报一次
    const commit = () => {
        if (!hex.value.trim()) return;
        const color = cleanHexColor(hex.value);
        hex.classList.toggle('stcr-color-hex--bad', !color);
        if (color && color !== last) { last = color; onPick(color); }
    };
    hex.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } });
    hex.addEventListener('change', commit);
    hex.addEventListener('input', () => hex.classList.remove('stcr-color-hex--bad'));
    native.addEventListener('change', () => { const color = cleanHexColor(native.value); if (color) onPick(color); });
    return el;
}
