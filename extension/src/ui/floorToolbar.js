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

    const title = h('div', { class: 'flex-container alignItemsBaseline' },
        h('span', { class: 'name_text', text: model.name }),
        h('small', { class: 'timestamp', text: formatStamp(swipe.sendDate ?? model.date) }));
    const tools = h('div', { class: 'stcr-mes-tools' });
    if (model.swipes.length > 1 && !model.isSystem) tools.append(buildSwipeControl(model, rendered.swipeIndex));
    if (!model.isSystem) tools.append(iconButton('fa-ellipsis', '这一楼的工具', { class: 'stcr-mes-more', 'data-act': 'more' }));
    block.append(h('div', { class: 'ch_name flex-container justifySpaceBetween' },
        h('div', { class: 'flex-container flex1 alignitemscenter' }, title), tools));

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

    el.querySelector(':scope > .stcr-floor-toolbar')?.remove();
    if (!model.isSystem) el.append(buildToolbar(!!rendered.reasoningHtml));
    return rendered;
}

/** ◂ 2 / 5 ▸；数字下的小圆点 = ST 此刻采用的就是这个候选（02 §5.1）。 */
function buildSwipeControl(model, shown) {
    const count = model.swipes.length;
    const isStCurrent = shown === model.swipeId;
    return h('div', { class: 'stcr-swipes', role: 'group', 'aria-label': '切换候选' },
        iconButton('fa-chevron-left', '上一个候选', { class: 'stcr-swipe-prev', 'data-act': 'swipe-prev', disabled: shown === 0 }),
        h('button', { type: 'button', class: 'stcr-btn stcr-swipe-count', 'data-act': 'swipe-list', title: '选择候选',
            'aria-label': `第 ${shown + 1} 个候选，共 ${count} 个${isStCurrent ? '，ST 当前采用' : ''}` },
        h('span', { class: 'stcr-swipe-num', text: `${shown + 1} / ${count}` }),
        isStCurrent ? h('span', { class: 'stcr-swipe-dot', title: 'ST 里现在采用的是这个候选' }) : null),
        iconButton('fa-chevron-right', '下一个候选', { class: 'stcr-swipe-next', 'data-act': 'swipe-next', disabled: shown === count - 1 }));
}

/** 悬浮楼层工具条。T21 先有思维链与复制；收藏（T22）与生成卡片（T23）接在这里。 */
function buildToolbar(hasReasoning) {
    return h('div', { class: 'stcr-floor-toolbar', role: 'toolbar', 'aria-label': '楼层工具' },
        hasReasoning ? iconButton('fa-brain', '展开 / 收起思维链', { 'data-act': 'reasoning' }) : null,
        iconButton('fa-copy', '复制本楼文字', { 'data-act': 'copy' }));
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
    for (const button of clone.querySelectorAll('.stcr-code-copy')) button.remove();
    return (clone.innerText ?? clone.textContent ?? '').trim();
}
