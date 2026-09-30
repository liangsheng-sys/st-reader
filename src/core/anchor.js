// ST Reader — AGPL-3.0
import { parseChatKey } from './chatSource.js';
import { locateTextQuote, makeTextQuote } from './textTransforms.js';
import { store } from './store.js';

const EXCLUDED = 'style,script,button,[data-stcr-ignore-anchor]';
function validateContext({ chatKey, mesIndex, swipeIndex, part = 'body', rawText }) {
    parseChatKey(chatKey);
    if (!Number.isInteger(mesIndex) || mesIndex < 0 || !Number.isInteger(swipeIndex) || swipeIndex < 0) throw new RangeError('锚点楼层/候选需为非负整数');
    if (!['body', 'reasoning'].includes(part) || typeof rawText !== 'string') throw new TypeError('锚点需要 body/reasoning 区域及对应候选原文');
}
/** 哈希仅检测原文变化，不把原始完整楼层写入批注存储。 */
export async function hashRawText(text) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return `sha256:${Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Node 可用的引用锚点生成。偏移单位为 UTF-16，与 DOM Range 一致。
 * @param {string} text 渲染后文本（不含控件和 style）
 * @param {number} start 选区起点
 * @param {number} end 不包含的终点
 * @param {{chatKey:string,mesIndex:number,swipeIndex:number,part?:'body'|'reasoning',rawText:string}} context
 * @returns {Promise<object>} 可 JSON 持久化的锚点
 */
export async function createTextAnchor(text, start, end, context) {
    validateContext(context);
    return Object.freeze({ chatKey: context.chatKey, mesIndex: context.mesIndex, swipeIndex: context.swipeIndex, part: context.part ?? 'body',
        quote: makeTextQuote(text, start, end), rawHash: await hashRawText(context.rawText) });
}

/** 不同聊天/楼/候选/区域返回 unrelated；只对当前已渲染的对应内容判断孤立。 */
export async function locateAnchorText(text, anchor, context) {
    validateContext(context);
    if (['chatKey', 'mesIndex', 'swipeIndex', 'part'].some(key => (context[key] ?? (key === 'part' ? 'body' : undefined)) !== anchor[key])) {
        return { status: 'unrelated', reason: null, rawChanged: false, start: null, end: null };
    }
    const rawChanged = anchor.rawHash !== await hashRawText(context.rawText);
    const location = locateTextQuote(text, anchor.quote);
    if (!location) return { status: 'orphan', reason: text.includes(anchor.quote.exact) ? 'ambiguous' : 'text-missing', rawChanged, start: null, end: null };
    return { status: 'attached', reason: null, rawChanged, ...location };
}

function textNodes(root) {
    const document = root.ownerDocument;
    const walker = document.createTreeWalker(root, 4, { acceptNode(node) {
        return node.parentElement?.closest(EXCLUDED) ? 2 : 1;
    } });
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    return nodes;
}
/** UI 自有装饰节点须标记 data-stcr-ignore-anchor，避免控件文字进入选区引用。 */
export function getAnchorText(rootEl) { return textNodes(rootEl).map(node => node.data).join(''); }

/** 从同一个正文/思维链容器里的 Range 或 Selection 生成引用，不改 DOM 或选区。 */
export async function createAnchor(rootEl, selectionOrRange, context) {
    const range = typeof selectionOrRange?.getRangeAt === 'function'
        ? selectionOrRange.rangeCount === 1 ? selectionOrRange.getRangeAt(0) : null : selectionOrRange;
    if (!range || range.collapsed || !rootEl.contains(range.startContainer) || !rootEl.contains(range.endContainer)) throw new RangeError('划线必须在同一正文或思维链容器内');
    for (const node of [range.startContainer, range.endContainer]) {
        const element = node.nodeType === 1 ? node : node.parentElement;
        if (element?.closest(EXCLUDED)) throw new RangeError('不能在操作控件或样式代码上创建划线');
    }
    const prefix = rootEl.ownerDocument.createRange();
    prefix.selectNodeContents(rootEl); prefix.setEnd(range.startContainer, range.startOffset);
    const start = getAnchorText(prefix.cloneContents()).length;
    prefix.setEnd(range.endContainer, range.endOffset);
    const end = getAnchorText(prefix.cloneContents()).length;
    return createTextAnchor(getAnchorText(rootEl), start, end, context);
}

/** 将 UTF-16 区间还原为跨文本节点 Range；不会插入 span 或更改宿主 DOM。 */
function rangeAt(rootEl, start, end) {
    const nodes = textNodes(rootEl), range = rootEl.ownerDocument.createRange();
    let offset = 0, began = false;
    for (const node of nodes) {
        const next = offset + node.data.length;
        if (!began && start < next) { range.setStart(node, start - offset); began = true; }
        if (began && end <= next) { range.setEnd(node, end - offset); return range; }
        offset = next;
    }
    throw new RangeError('引用偏移超出当前文本');
}
/** @returns {Promise<{status:string,reason:string|null,rawChanged:boolean,start:number|null,end:number|null,range:Range|null}>} */
export async function resolveAnchor(rootEl, anchor, context) {
    const result = await locateAnchorText(getAnchorText(rootEl), anchor, context);
    return { ...result, range: result.status === 'attached' ? rangeAt(rootEl, result.start, result.end) : null };
}

/**
 * 只重定位本次已渲染的一个楼/候选/区域，并持久化 orphan 状态；未加载页不判失配。
 * 原引用、批注文字与原文哈希始终保留；文本恢复后可自动从孤立区恢复。
 * @param {Element} rootEl .mes_text 或 .mes_reasoning
 * @param {object} context 与 createAnchor 相同
 * @param {{repository?:object}} options 默认 store.annotations，测试可注入
 * @returns {Promise<Array<{annotation:object,status:string,range:Range|null}>>}
 */
export async function relocateAnnotations(rootEl, context, { repository = store.annotations } = {}) {
    validateContext(context);
    const query = { chatKey: context.chatKey, mesIndex: context.mesIndex, swipeIndex: context.swipeIndex, part: context.part ?? 'body' };
    const annotations = await repository.list(query), results = [];
    for (let annotation of annotations) {
        const result = await resolveAnchor(rootEl, annotation.anchor, context);
        const orphan = result.status === 'orphan';
        if (annotation.orphan !== orphan || annotation.orphanReason !== result.reason) annotation = await repository.put({ ...annotation, orphan, orphanReason: result.reason });
        results.push({ annotation, ...result });
    }
    return results;
}
