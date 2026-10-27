// ST Reader — AGPL-3.0
// 一楼的 DOM：复用 ST 楼层类名（D10/D12），让主题、美化 CSS、Ny 字体原样命中；
// 所有按钮只用 stcr- 自有类名，不用 .mes_button/.mes_edit/.swipe_right 等（避免触发 ST 委托事件）。
// 切换候选只改阅读器视图，不写 ST（D02、02 §5）。

import { renderMessage } from '../core/formatter.js';
import { isDevInstance } from '../core/readonlyGuard.js';
import { h, iconButton } from './dom.js';
import { formatStamp, isSystemLike, reasoningTitle, RENDER_FAULT_MARK } from './logic.js';
import { findHtmlBlocks } from './htmlBlocks.js';
import { redactElement, visibleText } from './redact.js';

/**
 * @typedef {object} FloorContext
 * @property {object} handle openChat 返回的 ChatHandle
 * @property {(model:object)=>string|null} avatarFor 头像地址；null 不显示
 * @property {(index:number)=>boolean} isReasoningOpen 这一楼的思维链此刻是否展开
 * @property {(index:number, swipe:number|null)=>boolean} isBookmarked 整楼（swipe=null）或某候选是否已收藏
 * @property {(model:object)=>import('./redact.js').RedactOptions|null} [redactFor] 脱敏显示开着时给这一楼的屏蔽词 / 规则（T45）
 * @property {(textEl:HTMLElement, blocks:object[], where:object)=>void} [attachHtml] 楼里有 HTML 时接上沙箱渲染（T44b）
 */

/** 建一楼。swipeIndex 是阅读器要显示的候选（可能与 ST 当前候选不同）。 */
export function buildFloor(ctx, model, swipeIndex) {
    const isLast = model.index === ctx.handle.total - 1;
    const systemLike = isSystemLike(model);
    const el = h('div', {
        class: `mes stcr-mes${isLast ? ' last_mes' : ''}${systemLike ? ' stcr-mes--system' : ''}`,
        mesid: model.index, ch_name: model.name, is_user: String(model.isUser), is_system: String(model.isSystem),
    });
    const avatar = systemLike ? null : ctx.avatarFor(model);
    if (avatar) el.append(h('div', { class: 'mesAvatarWrapper' }, h('div', { class: 'avatar' }, h('img', { src: avatar, alt: '', loading: 'lazy', decoding: 'async' }))));
    const block = h('div', { class: 'mes_block' });
    el.append(block);
    fillFloor(ctx, el, model, swipeIndex);
    return el;
}

/** 原样显示的楼 → 出错信息（"复制错误信息"用；不存正文）。 */
const faults = new WeakMap();
/** 这一楼若是原样显示的，返回 {index, swipe, total, error}；否则 null。 */
export function floorFault(el) { return faults.get(el) ?? null; }

/**
 * （重新）填充一楼内容。切换候选时原地调用，楼层元素本身不换，滚动位置由调用方保持。
 * 格式化 / 正则 / HTML 接线任何一步抛错（I051、T72）：这一候选改为原样显示转义原文，候选切换照常可用。
 */
export function fillFloor(ctx, el, model, swipeIndex) {
    try {
        const rendered = fillRendered(ctx, el, model, swipeIndex);
        el.classList.remove('stcr-mes--broken');
        faults.delete(el);
        return rendered;
    } catch (error) {
        return fillRaw(ctx, el, model, swipeIndex, error);
    }
}

function fillRendered(ctx, el, model, swipeIndex) {
    const rendered = renderMessage(ctx.handle, model.index, swipeIndex);
    const swipe = model.swipes[rendered.swipeIndex];
    if (swipe.text.includes(RENDER_FAULT_MARK) && isDevInstance(globalThis.location)) throw new Error('T72 测试注入：格式化抛错（只在开发实例生效）');
    const block = el.querySelector(':scope > .mes_block');
    block.replaceChildren();
    const redact = ctx.redactFor?.(model) ?? null;
    const systemLike = isSystemLike(model);
    const hidden = model.isSystem && !systemLike; // 在 ST 里被隐藏、但其实是普通楼（I050 / T62）
    el.dataset.swipe = String(rendered.swipeIndex);
    el.classList.toggle('reasoning', !!rendered.reasoningHtml);

    // 名字行：[书签角标 名字 时间] …… [悬浮工具] [◂ 2/5 ▸] [⋯]。工具收在名字行里，不再浮到上方压住候选切换。
    const title = h('div', { class: 'flex-container alignItemsBaseline stcr-mes-title' },
        h('i', { class: 'fa-solid fa-bookmark stcr-floor-flag', title: '已收藏这一楼', 'aria-hidden': 'true', 'data-stcr-ignore-anchor': '' }),
        h('span', { class: 'name_text', text: model.name }),
        hidden ? h('span', { class: 'stcr-hidden-tag', 'data-stcr-ignore-anchor': '', title: '在 ST 里被隐藏、不发给模型，阅读器照常显示', text: '已隐藏' }) : null,
        h('small', { class: 'timestamp', text: formatStamp(swipe.sendDate ?? model.date) }));
    const row = h('div', { class: 'ch_name flex-container justifySpaceBetween' },
        h('div', { class: 'flex-container flex1 alignitemscenter' }, title));
    if (!systemLike) row.append(buildToolbar(model, !!rendered.reasoningHtml));
    if (model.swipes.length > 1 && !systemLike) row.append(buildSwipeControl(model, rendered.swipeIndex));
    if (!systemLike) row.append(iconButton('fa-ellipsis', '这一楼的工具', { class: 'stcr-mes-more', 'data-act': 'more' }));
    if (redact) redactElement(row.querySelector('.name_text'), redact); // 名字行也按规则显示（它不参与锚点）
    block.append(row);

    if (rendered.reasoningHtml) {
        const body = h('div', { class: 'mes_reasoning' });
        body.innerHTML = rendered.reasoningHtml; // core 已清洗（DOMPurify）
        if (redact) redactElement(body, redact);
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
    // HTML 块要在脱敏显示改动正文之前认出来：沙箱 / 截图 / 复制脱敏版都从原文出发（T44b）
    const htmlBlocks = ctx.attachHtml ? findHtmlBlocks(text, swipe.text, rendered.displayText ?? swipe.text) : [];
    if (redact) redactElement(text, redact); // 在加复制按钮之前：按钮文字不参与
    addCodeCopyButtons(text);
    if (htmlBlocks.length) ctx.attachHtml(text, htmlBlocks, { index: model.index, swipe: rendered.swipeIndex, model });
    scopeFloorStyles(text);
    block.append(text);
    syncBookmarkMarks(ctx, el);
    return rendered;
}

/**
 * 原样显示：名字行（名字旁小标签"原样显示"）+ 转义后的原文（保留换行）。不跑正则、Markdown、HTML。
 * 脱敏显示开着时照常遮词；遮词本身失败就不显示原文（与 I033 一致：宁可不显示也不露出原词）。
 */
function fillRaw(ctx, el, model, swipeIndex, error) {
    const swipes = Array.isArray(model.swipes) ? model.swipes : [];
    const shown = swipes[swipeIndex] ? swipeIndex : swipes[model.swipeId] ? model.swipeId : 0;
    const swipe = swipes[shown] ?? {};
    console.error(`[st-reader] 第 ${model.index + 1} 楼（候选 ${shown + 1}）显示失败，改为原样显示：`, error);
    faults.set(el, { index: model.index, swipe: shown, total: swipes.length, error });
    el.classList.add('stcr-mes--broken');
    el.classList.remove('reasoning');
    el.dataset.swipe = String(shown);
    const block = el.querySelector(':scope > .mes_block');
    block.replaceChildren();
    const name = h('span', { class: 'name_text', text: model.name ?? '' });
    const title = h('div', { class: 'flex-container alignItemsBaseline stcr-mes-title' }, name,
        h('span', { class: 'stcr-raw-tag', 'data-stcr-ignore-anchor': '', title: '这一楼没能按正常方式显示，下面是没经过任何处理的原文。⋯ 里可以复制错误信息', text: '原样显示' }),
        h('small', { class: 'timestamp', text: formatStamp(swipe.sendDate ?? model.date) }));
    const row = h('div', { class: 'ch_name flex-container justifySpaceBetween' }, h('div', { class: 'flex-container flex1 alignitemscenter' }, title),
        h('div', { class: 'stcr-floor-toolbar', role: 'toolbar', 'aria-label': '楼层工具' },
            iconButton('fa-bug', '复制错误信息（版本、楼号、出错位置；不含正文）', { 'data-act': 'copy-error' })));
    if (swipes.length > 1) row.append(buildSwipeControl(model, shown));
    row.append(iconButton('fa-ellipsis', '这一楼的工具', { class: 'stcr-mes-more', 'data-act': 'more' }));
    const text = h('div', { class: 'mes_text stcr-raw-text', text: typeof swipe.text === 'string' ? swipe.text : '' });
    try {
        const redact = ctx.redactFor?.(model) ?? null;
        if (redact) { redactElement(name, redact); redactElement(text, redact); }
    } catch (redactError) {
        console.warn('[st-reader] 原样显示时脱敏失败，这一楼先不显示原文', redactError);
        text.textContent = '（脱敏没做成，为了不露出原词，这一楼先不显示原文）';
    }
    block.append(row, text);
    return { swipeIndex: shown, html: '', reasoningHtml: '' };
}

let styleScopes = 0;
/**
 * 楼里自带的 <style>（模型写的卡片 CSS）只管它自己那一块（T50）。
 * core 按 ST 的做法给选择器加了 `#stcr_chat .mes_text ` 前缀，但阅读器一页里同时放着几十楼，
 * 这样一楼的 `p { text-align: center }` 会让整页正文居中。ST 主界面里这类楼通常被酒馆助手换成了 iframe，所以 ST 看不出来。
 * 这里把前缀换成只命中这一块的属性：在 HTML 块"原文"容器里的样式只管那个容器，其余只管本楼正文。
 */
export function scopeFloorStyles(text) {
    for (const style of text.querySelectorAll('style')) {
        if (!style.textContent.includes('#stcr_chat .mes_text ')) continue;
        const box = style.closest('.stcr-html-src') ?? text;
        if (!box.dataset.stcrCss) box.dataset.stcrCss = String(++styleScopes);
        style.textContent = style.textContent.replaceAll('#stcr_chat .mes_text ', `#stcr_chat [data-stcr-css="${box.dataset.stcrCss}"] `);
    }
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
        iconButton('fa-chevron-left', '上一个候选（, 键）', { class: 'stcr-swipe-prev', 'data-act': 'swipe-prev', 'data-index': model.index, disabled: shown === 0 }),
        h('button', { type: 'button', class: 'stcr-btn stcr-swipe-count', 'data-act': 'swipe-list', 'data-index': model.index, title: '选择候选',
            'aria-label': `第 ${shown + 1} 个候选，共 ${count} 个${isStCurrent ? '，ST 当前采用' : ''}` },
        h('span', { class: 'stcr-swipe-num', text: `${shown + 1} / ${count}` }),
        h('i', { class: 'fa-solid fa-star stcr-swipe-star', 'aria-hidden': 'true' }),
        isStCurrent ? h('span', { class: 'stcr-swipe-dot', title: 'ST 里现在采用的是这个候选' }) : null),
        iconButton('fa-chevron-right', '下一个候选（. 键）', { class: 'stcr-swipe-next', 'data-act': 'swipe-next', 'data-index': model.index, disabled: shown === count - 1 }));
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

/**
 * 代码块右上角的复制钮（F3）。自有 stcr- 类，复制 code.textContent（03 §5.3）。
 * 旁边一个"复制脱敏版"（F10b）：屏蔽词、替换规则、名字换好再复制；HTML 只换文字，不碰标签和属性。
 */
function addCodeCopyButtons(container) {
    for (const pre of container.querySelectorAll('pre')) {
        if (!pre.querySelector('code')) continue;
        pre.classList.add('stcr-pre');
        pre.append(h('div', { class: 'stcr-code-tools', 'data-stcr-ignore-anchor': '' },
            iconButton('fa-user-secret', '复制脱敏版（屏蔽词、替换规则、名字换好）', { class: 'stcr-code-copy stcr-code-copy-masked', 'data-act': 'copy-code-masked' }),
            iconButton('fa-copy', '复制代码', { class: 'stcr-code-copy', 'data-act': 'copy-code' })));
    }
}

/** 本楼当前显示候选的纯文本（正则后、去 HTML），给"复制本楼"用。脱敏显示开着时复制的是脱敏后的样子（所见即所得）。 */
export function floorPlainText(el) {
    const text = el.querySelector(':scope > .mes_block > .mes_text');
    return text ? visibleText(text).trim() : '';
}
