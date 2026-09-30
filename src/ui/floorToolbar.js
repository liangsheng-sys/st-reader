// ST Reader — AGPL-3.0
// 一楼的 DOM：复用 ST 楼层类名（D10/D12），让主题、美化 CSS、Ny 字体原样命中；
// 所有按钮只用 stcr- 自有类名，不用 .mes_button/.mes_edit/.swipe_right 等（避免触发 ST 委托事件）。
// 切换候选只改阅读器视图，不写 ST（D02、02 §5）。

import { renderMessage } from '../core/formatter.js';
import { h, iconButton } from './dom.js';
import { formatStamp, reasoningTitle } from './logic.js';

/**
 * @typedef {object} FloorContext
 * @property {object} handle openChat 返回的 ChatHandle
 * @property {(model:object)=>string|null} avatarFor 头像地址；null 不显示
 * @property {(index:number)=>boolean} isReasoningOpen 这一楼的思维链此刻是否展开
 * @property {(index:number, swipe:number|null)=>boolean} isBookmarked 整楼（swipe=null）或某候选是否已收藏
 */

/** 建一楼。swipeIndex 是阅读器要显示的候选（可能与 ST 当前候选不同）。 */
export function buildFloor(ctx, model, swipeIndex) {
    const isLast = model.index === ctx.handle.total - 1;
    const el = h('div', {
        class: `mes stcr-mes${isLast ? ' last_mes' : ''}${model.isSystem ? ' stcr-mes--system' : ''}`,
        mesid: model.index, ch_name: model.name, is_user: String(model.isUser), is_system: String(model.isSystem),
    });
    const avatar = model.isSystem ? null : ctx.avatarFor(model);
    if (avatar) el.append(h('div', { class: 'mesAvatarWrapper' }, h('div', { class: 'avatar' }, h('img', { src: avatar, alt: '', loading: 'lazy', decoding: 'async' }))));
    const block = h('div', { class: 'mes_block' });
    el.append(block);
    fillFloor(ctx, el, model, swipeIndex);
    return el;
}

/** （重新）填充一楼内容。切换候选时原地调用，楼层元素本身不换，滚动位置由调用方保持。 */
export function fillFloor(ctx, el, model, swipeIndex) {
    const rendered = renderMessage(ctx.handle, model.index, swipeIndex);
    const swipe = model.swipes[rendered.swipeIndex];
    const block = el.querySelector(':scope > .mes_block');
    block.replaceChildren();
    el.dataset.swipe = String(rendered.swipeIndex);
    el.classList.toggle('reasoning', !!rendered.reasoningHtml);

    // 名字行：[书签角标 名字 时间] …… [悬浮工具] [◂ 2/5 ▸] [⋯]。工具收在名字行里，不再浮到上方压住候选切换。
    const title = h('div', { class: 'flex-container alignItemsBaseline stcr-mes-title' },
        h('i', { class: 'fa-solid fa-bookmark stcr-floor-flag', title: '已收藏这一楼', 'aria-hidden': 'true', 'data-stcr-ignore-anchor': '' }),
        h('span', { class: 'name_text', text: model.name }),
        h('small', { class: 'timestamp', text: formatStamp(swipe.sendDate ?? model.date) }));
    const row = h('div', { class: 'ch_name flex-container justifySpaceBetween' },
        h('div', { class: 'flex-container flex1 alignitemscenter' }, title));
    if (!model.isSystem) row.append(buildToolbar(model, !!rendered.reasoningHtml));
    if (model.swipes.length > 1 && !model.isSystem) row.append(buildSwipeControl(model, rendered.swipeIndex));
    if (!model.isSystem) row.append(iconButton('fa-ellipsis', '这一楼的工具', { class: 'stcr-mes-more', 'data-act': 'more' }));
    block.append(row);

    if (rendered.reasoningHtml) {
        const body = h('div', { class: 'mes_reasoning' });
        body.innerHTML = rendered.reasoningHtml; // core 已清洗（DOMPurify）
        const details = h('details', { class: 'mes_reasoning_details', open: ctx.isReasoningOpen(model.index) },
            h('summary', { class: 'mes_reasoning_summary flex-container' },
                h('div', { class: 'mes_reasoning_header_block flex-container' },
                    h('div', { class: 'mes_reasoning_header flex-container' },
                        h('span', { class: 'mes_reasoning_header_title', text: reasoningTitle(swipe.reasoningDuration) }),
                        h('div', { class: 'mes_reasoning_arrow fa-solid fa-chevron-up' })))),
            body,
            h('button', { type: 'button', class: 'stcr-btn stcr-reasoning-fold', 'data-act': 'reasoning', text: '收起' }));
        block.append(details);
    }

    const text = h('div', { class: 'mes_text' });
    text.innerHTML = rendered.html; // core 已清洗（DOMPurify）
    addCodeCopyButtons(text);
    block.append(text);
    syncBookmarkMarks(ctx, el);
    return rendered;
}

/** 收藏状态变化后只刷新这一楼的图标，不重渲染正文（划线高亮不受影响）。 */
export function syncBookmarkMarks(ctx, el) {
    const index = Number(el.getAttribute('mesid'));
    const swipe = Number(el.dataset.swipe);
    const floor = ctx.isBookmarked(index, null);
    const thisSwipe = ctx.isBookmarked(index, swipe);
    el.classList.toggle('stcr-floor-bookmarked', floor);
    el.classList.toggle('stcr-swipe-bookmarked', thisSwipe);
    const floorBtn = el.querySelector('[data-act="bookmark-floor"]');
    if (floorBtn) setToggle(floorBtn, floor, floor ? '取消收藏这一楼' : '收藏这一楼（B）');
    const swipeBtn = el.querySelector('[data-act="bookmark-swipe"]');
    if (swipeBtn) setToggle(swipeBtn, thisSwipe, thisSwipe ? `取消收藏第 ${swipe + 1} 个候选` : `收藏这个候选（第 ${swipe + 1} 个）`);
}

function setToggle(button, on, label) {
    button.setAttribute('aria-pressed', String(on));
    button.title = label;
    button.setAttribute('aria-label', label);
    const icon = button.querySelector('i');
    icon?.classList.toggle('fa-solid', on);
    icon?.classList.toggle('fa-regular', !on);
    button.classList.toggle('stcr-on', on);
}

/** ◂ 2 / 5 ▸；数字下的小圆点 = ST 此刻采用的就是这个候选（02 §5.1）；右上小星 = 这个候选已收藏。 */
export function buildSwipeControl(model, shown, { compact = false } = {}) {
    const count = model.swipes.length;
    const isStCurrent = shown === model.swipeId;
    return h('div', { class: `stcr-swipes${compact ? ' stcr-swipes--compact' : ''}`, role: 'group', 'aria-label': '切换候选', 'data-index': model.index },
        iconButton('fa-chevron-left', '上一个候选（[）', { class: 'stcr-swipe-prev', 'data-act': 'swipe-prev', 'data-index': model.index, disabled: shown === 0 }),
        h('button', { type: 'button', class: 'stcr-btn stcr-swipe-count', 'data-act': 'swipe-list', 'data-index': model.index, title: '选择候选',
            'aria-label': `第 ${shown + 1} 个候选，共 ${count} 个${isStCurrent ? '，ST 当前采用' : ''}` },
        h('span', { class: 'stcr-swipe-num', text: `${shown + 1} / ${count}` }),
        h('i', { class: 'fa-solid fa-star stcr-swipe-star', 'aria-hidden': 'true' }),
        isStCurrent ? h('span', { class: 'stcr-swipe-dot', title: 'ST 里现在采用的是这个候选' }) : null),
        iconButton('fa-chevron-right', '下一个候选（]）', { class: 'stcr-swipe-next', 'data-act': 'swipe-next', 'data-index': model.index, disabled: shown === count - 1 }));
}

/** 楼层工具：收藏楼 / 收藏此候选 / 思维链 / 复制 / 生成卡片（T23a）。 */
function buildToolbar(model, hasReasoning) {
    const toggle = (icon, act, label) => {
        const button = iconButton(icon, label, { 'data-act': act, 'aria-pressed': 'false' });
        button.querySelector('i').classList.replace('fa-solid', 'fa-regular');
        return button;
    };
    return h('div', { class: 'stcr-floor-toolbar', role: 'toolbar', 'aria-label': '楼层工具' },
        toggle('fa-bookmark', 'bookmark-floor', '收藏这一楼（B）'),
        model.swipes.length > 1 ? toggle('fa-star', 'bookmark-swipe', '收藏这个候选') : null,
        hasReasoning ? iconButton('fa-brain', '展开 / 收起思维链（R）', { 'data-act': 'reasoning' }) : null,
        iconButton('fa-copy', '复制本楼文字', { 'data-act': 'copy' }),
        iconButton('fa-image', '用这一楼生成分享卡片', { 'data-act': 'card' }));
}

/** 代码块右上角的复制钮（F3）。自有 stcr- 类，复制 code.textContent（03 §5.3）。 */
function addCodeCopyButtons(container) {
    for (const pre of container.querySelectorAll('pre')) {
        if (!pre.querySelector('code')) continue;
        pre.classList.add('stcr-pre');
        pre.append(iconButton('fa-copy', '复制代码', { class: 'stcr-code-copy', 'data-act': 'copy-code' }));
    }
}

/** 本楼当前显示候选的纯文本（正则后、去 HTML），给"复制本楼"用。 */
export function floorPlainText(el) {
    const text = el.querySelector(':scope > .mes_block > .mes_text');
    if (!text) return '';
    const clone = text.cloneNode(true);
    for (const node of clone.querySelectorAll('.stcr-code-copy, [data-stcr-ignore-anchor]')) node.remove();
    return (clone.innerText ?? clone.textContent ?? '').trim();
}
