// ST Reader — AGPL-3.0
// 脱敏阅读模式（T45、F11、D21）：把屏蔽词与"我的替换规则"套用到阅读器正文的显示上。只改阅读器里这一份显示 DOM，不碰聊天（D02）。
//
// 划线锚点怎么办（03 §5.6）：core 的锚点文字 = 容器里所有文本节点按顺序拼起来，跳过 [data-stcr-ignore-anchor]。
// 所以每一处脱敏都写成两段：
//   <span class="stcr-rd-orig" hidden>原词</span><span class="stcr-rd" data-stcr-ignore-anchor>替换后</span>
// 原词文本节点留在原位但不显示（display:none，也不会被复制、被页面查找命中、被读屏读出），替换后的显示段被锚点忽略。
// 这样锚点文字与未脱敏时逐字相同：已有划线照常定位、新划线按原文生成；开关切换不需要任何偏移换算。
// 代价：划线跨过脱敏处时，那一小段落在隐藏的原词上，不上色。
//
// 替换规则走 core 的 replaceNamesInRaw（只开"我的规则"，不做 char/user 自动名字）；屏蔽词走 core 的 maskText。
// 替换出来的字不再被屏蔽（与卡片相同：替换优先于屏蔽，03 §5.10）。匹配限于单个文本节点内，不跨标签。

import { maskCodeText, maskText, replaceNamesInRaw } from '../core/cardExport.js';
import { parseChatKey } from '../core/chatSource.js';
import { readableOn } from './colorPicker.js';
import { h } from './dom.js';

const SKIP = 'style, script, button, [data-stcr-ignore-anchor], .stcr-rd-orig';
const MACRO = /{{\s*(user|char)\s*}}/i; // replaceNamesInRaw 会展开这两个宏、改变长度；带宏的文本节点只做屏蔽

/**
 * @typedef {object} RedactOptions
 * @property {string[]} words 屏蔽词
 * @property {object[]} rules 我的替换规则（store.replaceRules）
 * @property {Map<string,{dataUrl:string}>} assets 图片规则用
 * @property {string|null} avatarUrl 这一楼对应的角色（规则作用范围）
 */

/** 这一楼要不要做（没有词也没有规则就什么都不改）。 */
export const hasRedaction = opts => !!opts && (opts.words.length > 0 || opts.rules.length > 0);

/** 把 root 里的文本节点按屏蔽词 / 规则换成显示段。可重复调用：已处理过的段会被跳过。 */
export function redactElement(root, opts) {
    if (!root || !hasRedaction(opts)) return 0;
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: node => (node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.data.trim()) nodes.push(node);
    let count = 0;
    for (const node of nodes) count += redactTextNode(node, opts);
    return count;
}

function redactTextNode(node, opts) {
    const text = node.data;
    const pieces = replacePieces(text, opts); // [{text, orig?, to?}]
    const out = [];
    let changed = 0;
    for (const piece of pieces) {
        if (piece.to) { out.push(...pair(piece.orig, replacementEl(piece.to, opts.assets))); changed++; continue; }
        const segments = opts.words.length ? maskText(piece.text, opts.words, 'bar') : [{ kind: 'text', text: piece.text }];
        for (const segment of segments) {
            if (segment.kind === 'text') { if (segment.text) out.push(document.createTextNode(segment.text)); continue; }
            const orig = piece.text.slice(segment.start, segment.end);
            out.push(...pair(orig, maskEl(orig)));
            changed++;
        }
    }
    if (changed) node.replaceWith(...out);
    return changed;
}

/** 原词（隐藏，锚点用）+ 显示段（锚点忽略）。 */
function pair(orig, display) {
    const hidden = h('span', { class: 'stcr-rd-orig', hidden: true, 'aria-hidden': 'true', style: 'display:none !important' }, orig);
    return [hidden, display];
}

function maskEl(orig) {
    // 一个字一个方块：宽度大致随原词，复制出来是 ███，看不出原字
    const blocks = '█'.repeat(Math.max(1, Math.min(12, [...orig].length)));
    return h('span', { class: 'stcr-rd stcr-rd--mask', 'data-stcr-ignore-anchor': '', title: '此处已脱敏' }, blocks);
}

function replacementEl(to, assets) {
    const span = h('span', { class: 'stcr-rd stcr-rd--rep', 'data-stcr-ignore-anchor': '', title: '此处已脱敏' });
    if (to.kind === 'text') {
        span.textContent = to.value;
        if (to.background) {
            span.classList.add('stcr-rd--bg');
            span.style.setProperty('background-color', to.background);
            span.style.setProperty('color', readableOn(to.background));
        }
    } else if (to.kind === 'icon') span.append(h('i', { class: `fa-solid ${to.value}`, 'aria-hidden': 'true' }));
    else {
        const asset = assets.get(to.value);
        span.append(asset ? h('img', { class: 'stcr-rd-img', src: asset.dataUrl, alt: '' }) : h('i', { class: 'fa-solid fa-image', 'aria-hidden': 'true' }));
    }
    return span;
}

/**
 * 我的规则 → 片段。core 的 segments 不带原词（不外泄），这里按顺序在原文里找回每处替换对应的原文长度：
 * 该处必须有一条"原词在此处匹配、替换目标相同"的规则，取最长的（与 core 的长词优先一致）。
 */
function replacePieces(text, { rules, avatarUrl }) {
    if (!rules.length || MACRO.test(text)) return [{ text }];
    let result;
    try { result = replaceNamesInRaw(text, { autoReplaceNames: false, applyReplaceRules: true, rules, avatarUrl: avatarUrl ?? undefined }); }
    catch (error) { console.warn('[st-reader] 脱敏显示：规则无效，跳过', error); return [{ text }]; }
    const pieces = [];
    let at = 0;
    const same = (a, b) => a.kind === b.kind && a.value === b.value && (a.background ?? null) === (b.background ?? null);
    for (const [i, segment] of result.segments.entries()) {
        if (segment.kind === 'text') {
            if (text.startsWith(segment.text, at)) { pieces.push({ text: segment.text }); at += segment.text.length; continue; }
            return [{ text }]; // 对不上就不改这一段（宁可不脱敏也不错位）
        }
        const next = result.segments[i + 1];
        const length = rules.filter(rule => same(rule.to, segment.to))
            .map(rule => rule.from.length)
            .filter(len => {
                const piece = text.slice(at, at + len);
                const rule = rules.find(r => same(r.to, segment.to) && r.from.length === len && (r.caseSensitive ? r.from === piece : r.from.toLowerCase() === piece.toLowerCase()));
                return rule && (!next || next.kind !== 'text' || text.startsWith(next.text, at + len));
            })
            .sort((a, b) => b - a)[0];
        if (!length) return [{ text }];
        pieces.push({ text: '', orig: text.slice(at, at + length), to: segment.to });
        at += length;
    }
    return at === text.length ? pieces : [{ text }];
}

/**
 * 看得见的文字（复制本楼 / 复制代码用）：去掉隐藏的原词和按钮，保留脱敏后的显示段。所见即所得。
 * 没开脱敏时等同于原来的纯文本。
 */
export function visibleText(el) {
    const clone = el.cloneNode(true);
    for (const node of clone.querySelectorAll('.stcr-rd-orig, .stcr-code-copy, [data-stcr-ignore-anchor]:not(.stcr-rd)')) node.remove();
    return clone.textContent ?? '';
}

// ───────────── 旁边的小字（面板摘录、批注气泡、候选列表、抽屉预览、标题） ─────────────
// 这些是一行字符串，不参与锚点，直接用 core 的 maskCodeText 换成脱敏后的字符串：规则替换成文字（图标用 ★ 这类字符），屏蔽词逐字变 █。

let active = null; // 脱敏显示开着时 = {words, rules}；关着为 null

/** 阅读器在开关变化、词表或规则变化时调用。 */
export function setRedactState(data) { active = hasRedaction(data) ? data : null; }
export const redactActive = () => active !== null;

/**
 * 一行小字的脱敏样子；没开脱敏原样返回。where：chatKey（单聊按那个角色的作用范围）或头像文件名。
 * 出错时返回原文之前的保守做法：整行打码，宁可看不清也不漏。
 */
export function redactString(text, where = null) {
    if (!active || !text) return text;
    let avatarUrl;
    if (typeof where === 'string' && where) {
        if (where.includes('/')) { try { avatarUrl = parseChatKey(where).avatarUrl ?? undefined; } catch { avatarUrl = undefined; } }
        else avatarUrl = where;
    }
    try {
        return maskCodeText(String(text), { rules: active.rules, maskWords: active.words, autoReplaceNames: false, applyReplaceRules: true,
            avatarUrl, maskStyle: { kind: 'bar', uniform: false } });
    } catch (error) {
        console.warn('[st-reader] 脱敏显示：小字处理失败，整行遮住', error);
        return '█'.repeat(Math.min(12, [...String(text)].length));
    }
}
