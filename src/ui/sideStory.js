// ST Reader — AGPL-3.0
// 番外视图的界面部分（T105 / D48 / F21）：规则与"这个聊天不分番外"的读写、把番外片段标进正文 DOM、设置对话框。
// 识别和定位在 core/sideStory.js（03 §5.23）；这里不识别、不改聊天，只改阅读器里这一楼的显示。

import { normalizeSideStoryRules } from '../core/sideStory.js';
import { store } from '../core/store.js';
import { h } from './dom.js';
import { sideBarText } from './logic.js';

export const SIDE_RULES_KEY = 'stcr:ui:sidestory:rules:v1';
export const SIDE_CHAT_KEY = 'stcr:ui:sidestory:chat:v1';

/** 内置的五个关键词候选（与 core 默认一致），设置里一开始就填着。 */
export const SIDE_KEYWORD_CANDIDATES = Object.freeze(normalizeSideStoryRules(null).keyword.words);

const ruleData = rules => ({ tag: { ...rules.tag }, keyword: { ...rules.keyword, words: [...rules.keyword.words] }, hidden: { ...rules.hidden } });

/** 读规则（没存过 = 全关）。 */
export async function loadSideRules() {
    return normalizeSideStoryRules(await store.settings.get(SIDE_RULES_KEY, null));
}
export function saveSideRules(rules) {
    return store.settings.set(SIDE_RULES_KEY, ruleData(rules));
}
/** 每个聊天一个"不分番外"开关：{ [chatKey]: true }。 */
export async function loadSideOff(chatKey) {
    const map = await store.settings.get(SIDE_CHAT_KEY, null);
    return !!chatKey && map?.[chatKey] === true;
}
export async function saveSideOff(chatKey, off) {
    if (!chatKey) return;
    const map = { ...((await store.settings.get(SIDE_CHAT_KEY, null)) ?? {}) };
    if (off) map[chatKey] = true; else delete map[chatKey];
    await store.settings.set(SIDE_CHAT_KEY, map);
}
/** 三种规则有没有一条开着。 */
export const rulesActive = rules => !!rules && (rules.tag.on || rules.keyword.on || rules.hidden.on);

// ───────────────────────── 把番外片段标进正文 ─────────────────────────

const nonSpace = text => text.replace(/\s/g, '').length;
const inside = (range, node) => range.comparePoint(node, 0) === 0 && range.comparePoint(node, node.nodeType === 3 ? node.length : node.childNodes.length) === 0;
const SKIP = 'style,script,template';

/**
 * 把一楼里的番外片段标出来（不删任何节点）：整个落在片段里的元素加 .stcr-side-part；半截的文字节点拆开，把片段那一截包进 <span class="stcr-side-part">。
 * 正文视图靠 CSS 隐藏 .stcr-side-part，番外视图隐藏其余；每个片段前插一个"番外 · 约 N 字 · 去番外看"小条（只在正文视图显示）。
 * 文字内容、顺序都不变，所以划线的锚点偏移不受影响（小条是 button + data-stcr-ignore-anchor）。
 * 任何一个片段定位不到（locate 返回 null）→ 整楼当番外处理，不做部分标记：返回 { missed: true }。
 * @param {HTMLElement} text 这一楼的 .mes_text（沙箱替换、脱敏之前）
 * @param {Array<Range|null>} located core.locateSegments 的结果
 * @returns {{missed:boolean, count:number, chars:number}}
 */
export function markSideParts(text, located) {
    const doc = text.ownerDocument;
    const ranges = located.filter(r => r && !r.collapsed);
    if (located.some(r => r === null) || !ranges.length) return { missed: located.some(r => r === null) || !ranges.length, count: 0, chars: 0 };
    // 1) 先全部算好（不动 DOM，活的 Range 才不会被拆文字弄乱）
    const plans = ranges.map(range => {
        const elements = [], pieces = [];
        const ancestor = range.commonAncestorContainer;
        const visit = node => {
            for (let child = node.firstChild; child; child = child.nextSibling) {
                if (!range.intersectsNode(child)) continue;
                if (child.nodeType === 1) { if (inside(range, child)) elements.push(child); else visit(child); }
                else if (child.nodeType === 3 && !child.parentElement?.closest(SKIP)) {
                    const a = child === range.startContainer ? range.startOffset : 0, b = child === range.endContainer ? range.endOffset : child.length;
                    if (b > a && nonSpace(child.data.slice(a, b))) pieces.push({ node: child, a, b });
                }
            }
        };
        if (ancestor.nodeType === 3) {
            const a = ancestor === range.startContainer ? range.startOffset : 0, b = ancestor === range.endContainer ? range.endOffset : ancestor.length;
            if (b > a && nonSpace(ancestor.data.slice(a, b))) pieces.push({ node: ancestor, a, b });
        } else visit(ancestor);
        return { elements, pieces, chars: nonSpace(range.toString()), range };
    });
    // 2) 再动 DOM。同一个文字节点上的片段从后往前拆。
    const parts = new Set();
    for (const plan of plans) {
        plan.parts = [];
        for (const el of plan.elements) { el.classList.add('stcr-side-part'); plan.parts.push(el); parts.add(el); }
    }
    const byNode = new Map();
    for (const plan of plans) for (const piece of plan.pieces) {
        if (piece.node.parentElement?.closest('.stcr-side-part')) continue; // 已经在整块被标的元素里
        if (!byNode.has(piece.node)) byNode.set(piece.node, []);
        byNode.get(piece.node).push({ ...piece, plan });
    }
    for (const [node, list] of byNode) {
        list.sort((x, y) => y.a - x.a);
        for (const { a, b, plan } of list) {
            if (b < node.length) node.splitText(b);
            const mid = a > 0 ? node.splitText(a) : node;
            const span = doc.createElement('span');
            span.className = 'stcr-side-part';
            mid.replaceWith(span);
            span.append(mid);
            plan.parts.push(span); parts.add(span);
        }
    }
    // 3) 含番外的"外层"元素里剩下的正文文字也包成元素，番外视图才藏得掉（文字节点没法单独用 CSS 隐藏）
    const holders = new Set([text]);
    for (const part of parts) for (let el = part.parentElement; el && el !== text.parentElement; el = el.parentElement) { if (el.classList.contains('stcr-side-part')) break; holders.add(el); if (el === text) break; }
    for (const holder of holders) {
        for (const child of [...holder.childNodes]) {
            if (child.nodeType !== 3 || !nonSpace(child.data) || child.parentElement?.closest(SKIP)) continue;
            const span = doc.createElement('span');
            span.className = 'stcr-main-text';
            child.replaceWith(span);
            span.append(child);
        }
    }
    // 4) 每个片段前一个小条
    for (const plan of plans) {
        const first = plan.parts.sort((x, y) => (x.compareDocumentPosition(y) & 4 ? -1 : 1))[0];
        if (!first) continue;
        first.before(sideBar(plan.chars));
    }
    return { missed: false, count: plans.length, chars: plans.reduce((sum, plan) => sum + plan.chars, 0) };
}

/** 正文视图里替代番外片段的小条（只在正文视图显示）。 */
export function sideBar(chars) {
    return h('button', { type: 'button', class: 'stcr-btn stcr-side-bar', 'data-act': 'side-go', 'data-stcr-ignore-anchor': '', title: '这一段是番外，点这里切到"番外"视图看', text: sideBarText(chars) });
}

/**
 * 有的片段定位不到（原文被正则改得面目全非）：不猜，整楼当番外。把这一楼正文里的东西逐个标上 .stcr-side-part，最前面放一个小条。
 * 不重组 DOM（HTML 块的定位还要靠原来的结构）。
 */
export function markSideWhole(text) {
    const doc = text.ownerDocument;
    const chars = nonSpace(text.textContent ?? '');
    for (const child of [...text.childNodes]) {
        if (child.nodeType === 1) child.classList.add('stcr-side-part');
        else if (child.nodeType === 3 && nonSpace(child.data)) {
            const span = doc.createElement('span');
            span.className = 'stcr-side-part';
            child.replaceWith(span);
            span.append(child);
        }
    }
    text.prepend(sideBar(chars));
}

/** HTML 块被收进沙箱的"原文"容器后：整块都在番外里的，连同外面的沙箱外壳一起标上。 */
export function markSideHtml(text) {
    for (const source of text.querySelectorAll('.stcr-html-src')) {
        const children = [...source.children];
        if (!children.length || !children.every(el => el.classList.contains('stcr-side-part'))) continue;
        source.classList.add('stcr-side-part');
        const shell = source.previousElementSibling;
        if (shell?.classList.contains('stcr-html')) shell.classList.add('stcr-side-part');
    }
}

// ───────────────────────── 设置对话框 ─────────────────────────

const switchRow = (label, hint = '') => {
    const input = h('input', { type: 'checkbox' });
    return { input, el: h('label', { class: 'stcr-dx-check stcr-side-switch-row', title: hint || null }, input, h('span', { text: label })) };
};

/**
 * Aa →"番外设置…"：三种规则各一行（开关 + 设置）、"这个聊天不分番外"。改动存下来，并通知阅读器重新识别。
 * @param {object} opts
 * @param {{open:Function, close:Function}} opts.docPanel
 * @param {object} opts.rules 当前规则（normalizeSideStoryRules 的结果）
 * @param {boolean} opts.chatOff 这个聊天是否不分番外
 * @param {boolean} opts.hasChat 现在有没有打开的聊天（没有就不显示"这个聊天"开关）
 * @param {()=>string} opts.statusText 识别结果的一句话（命中几楼几处）
 * @param {(rules:object)=>void} opts.onRules 规则改了（已经过 normalizeSideStoryRules，errors 里是问题）
 * @param {(off:boolean)=>void} opts.onChatOff
 */
export function openSideSettings({ docPanel, rules, chatOff, hasChat, statusText, onRules, onChatOff }) {
    let draft = ruleData(rules);
    const tagOn = switchRow('标签包起来的片段', '模型常把番外写在 <小剧场>…</小剧场> 这样的标签里；这一种只藏标签里的那一段');
    const modePair = h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', text: '开始 / 结束' });
    const modeRegex = h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', text: '正则（进阶）' });
    const startInput = h('input', { type: 'text', class: 'text_pole stcr-dx-text', maxlength: '200', placeholder: '<小剧场>', 'aria-label': '开始标记' });
    const endInput = h('input', { type: 'text', class: 'text_pole stcr-dx-text', maxlength: '200', placeholder: '</小剧场>', 'aria-label': '结束标记' });
    const patternInput = h('input', { type: 'text', class: 'text_pole stcr-dx-text', placeholder: '<小剧场>.*?</小剧场>', 'aria-label': '正则表达式', spellcheck: 'false' });
    const scanRendered = switchRow('按"酒馆显示出来的样子"找', '标记是酒馆的正则脚本改写出来的才要打开；默认找聊天文件里的原文，快得多');
    const tagError = h('p', { class: 'stcr-dx-hint stcr-bad', role: 'alert', hidden: true });
    const pairBox = h('div', { class: 'stcr-dx-row-inline' }, '开始 ', startInput, ' 结束 ', endInput);
    const regexBox = h('div', { class: 'stcr-dx-row-inline' }, '表达式 ', patternInput, h('span', { class: 'stcr-dx-hint', text: '标志默认 gs；必须是全局匹配' }));
    const keywordOn = switchRow('我说了这些词，之后的回复当番外', '你（用户楼）的话里出现这些词，这一楼和它后面的回复到下一条你的话之前，都算番外。例如"请暂停正文，写个番外"');
    const chips = h('div', { class: 'stcr-dx-chips' });
    const wordInput = h('input', { type: 'text', class: 'text_pole stcr-dx-text', maxlength: '30', placeholder: '再加一个词，回车', 'aria-label': '添加关键词' });
    const hiddenOn = switchRow('酒馆里点过小眼睛隐藏的楼', '隐藏的楼本来就不发给模型，很多人用它存放番外');
    const chatSwitch = switchRow('这个聊天不分番外', '只对现在打开的聊天：规则照旧存着，这个聊天按"全部"显示');
    const status = h('p', { class: 'stcr-dx-hint', role: 'status', 'aria-live': 'polite' });

    const renderChips = () => {
        chips.replaceChildren(...draft.keyword.words.map(word => h('span', { class: 'stcr-dx-chip' }, word,
            h('button', { type: 'button', class: 'stcr-btn stcr-chip-x', 'data-word': word, 'aria-label': `删除 ${word}`, text: '×' }))));
    };
    const sync = () => {
        tagOn.input.checked = draft.tag.on;
        modePair.classList.toggle('stcr-on', draft.tag.mode === 'pair');
        modeRegex.classList.toggle('stcr-on', draft.tag.mode === 'regex');
        pairBox.hidden = draft.tag.mode !== 'pair';
        regexBox.hidden = draft.tag.mode !== 'regex';
        if (document.activeElement !== startInput) startInput.value = draft.tag.start;
        if (document.activeElement !== endInput) endInput.value = draft.tag.end;
        if (document.activeElement !== patternInput) patternInput.value = draft.tag.pattern;
        scanRendered.input.checked = draft.tag.scanRendered;
        keywordOn.input.checked = draft.keyword.on;
        hiddenOn.input.checked = draft.hidden.on;
        renderChips();
        chatSwitch.input.checked = chatOff;
        status.textContent = statusText();
    };
    const commit = () => {
        const normalized = normalizeSideStoryRules(draft);
        tagError.hidden = !normalized.errors.length;
        tagError.textContent = normalized.errors.length ? `标签规则没有生效：${normalized.errors.join('；')}` : '';
        draft = ruleData(normalized.errors.length ? { ...normalized, tag: { ...normalized.tag, on: draft.tag.on } } : normalized);
        onRules(normalized);
        setTimeout(() => { status.textContent = statusText(); }, 60);
    };
    const patch = (key, value) => { draft[key] = { ...draft[key], ...value }; sync(); commit(); };
    tagOn.input.addEventListener('change', () => patch('tag', { on: tagOn.input.checked }));
    modePair.addEventListener('click', () => patch('tag', { mode: 'pair' }));
    modeRegex.addEventListener('click', () => patch('tag', { mode: 'regex' }));
    startInput.addEventListener('change', () => patch('tag', { start: startInput.value }));
    endInput.addEventListener('change', () => patch('tag', { end: endInput.value }));
    patternInput.addEventListener('change', () => patch('tag', { pattern: patternInput.value }));
    scanRendered.input.addEventListener('change', () => patch('tag', { scanRendered: scanRendered.input.checked }));
    keywordOn.input.addEventListener('change', () => patch('keyword', { on: keywordOn.input.checked }));
    hiddenOn.input.addEventListener('change', () => patch('hidden', { on: hiddenOn.input.checked }));
    chips.addEventListener('click', event => {
        const word = event.target.closest('[data-word]')?.dataset.word;
        if (word) patch('keyword', { words: draft.keyword.words.filter(w => w !== word) });
    });
    wordInput.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        const word = wordInput.value.trim();
        if (!word) return;
        wordInput.value = '';
        patch('keyword', { words: [...draft.keyword.words, word] });
    });
    chatSwitch.input.addEventListener('change', () => { chatOff = chatSwitch.input.checked; onChatOff(chatOff); sync(); });

    const block = (...children) => h('div', { class: 'stcr-dx-block' }, ...children);
    const body = h('div', { class: 'stcr-dx stcr-side-settings' },
        h('p', { class: 'stcr-dx-hint', text: '有些聊天里夹着小剧场、番外、if 线。这里告诉阅读器怎么认出它们：认出来以后，顶栏会出现"正文 / 番外 / 全部"三个按钮，主线和番外分开读。只改阅读器里的显示，不改聊天，楼号不变，划线和收藏照常。三种办法可以一起开。' }),
        block(tagOn.el, h('span', { class: 'stcr-seg stcr-dx-seg', role: 'group', 'aria-label': '标签写法' }, modePair, modeRegex), pairBox, regexBox, scanRendered.el, tagError),
        block(keywordOn.el, chips, wordInput),
        block(hiddenOn.el),
        hasChat ? block(chatSwitch.el) : null);
    const doneBtn = h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', text: '完成', onclick: () => docPanel.close() });
    const foot = h('div', { class: 'stcr-doc-foot-row' }, status, h('span', { class: 'stcr-doc-gap' }), doneBtn);
    sync();
    docPanel.open({ title: '番外设置', body, foot });
    return { refresh: sync };
}
