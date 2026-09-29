// 分享卡片的"选段"（T23a、F2、03 §5.9 选段合同）。
// 阅读器里的选区 / 整楼 / 一条划线 → 每楼要摘的范围（用划线同一套"锚点文字"位置）→
// 在 createCardMessage 的已脱敏副本上按位置裁剪，得到不再绑定原文的片段，交给模板。
// 片段一律是克隆出来的新节点：绝不把绑定过原文的楼层放进卡片，导出时用 replaceNames:false 不会还原真名。
// 只读（D02）：只读 handle，不写聊天、不改候选。

import { getAnchorText, locateAnchorText } from '../core/anchor.js';
import { automaticNameRules, createCardMessage } from '../core/cardExport.js';
import { renderMessage } from '../core/formatter.js';
import { replaceLiteralNames } from '../core/textTransforms.js';
import { alignTexts, mapOffset } from './logic.js';

/** 思维链在前、正文在后，与楼层里的顺序一致。 */
const PARTS = Object.freeze([['reasoning', '.mes_reasoning'], ['body', '.mes_text']]);
export const MAX_CARD_FLOORS = 40;

const isShown = el => el.getClientRects().length > 0;

/** 容器开头到某个边界点之间的锚点文字长度（与 core createAnchor 的算法相同）。 */
function offsetIn(container, node, offset) {
    const prefix = container.ownerDocument.createRange();
    prefix.selectNodeContents(container);
    prefix.setEnd(node, offset);
    return getAnchorText(prefix.cloneContents()).length;
}

/**
 * 阅读器里的选区 → 每楼 {index, swipe, body, reasoning}；body/reasoning 为 {start,end}（锚点文字位置）或 null。
 * 看不见的楼（隐藏的用户楼）和收起的思维链不算进去：卡片只放用户看得见、选得到的字。
 */
export function selectionToFloors(range, floorEls) {
    const floors = [];
    for (const el of floorEls) {
        if (el.matches('.stcr-mes--broken') || !isShown(el) || !range.intersectsNode(el)) continue;
        const entry = { index: Number(el.getAttribute('mesid')), swipe: Number(el.dataset.swipe), body: null, reasoning: null };
        for (const [part, selector] of PARTS) {
            const container = el.querySelector(`:scope > .mes_block ${selector}`);
            // 收起的思维链：Chrome 对关着的 <details> 内容也报尺寸，得另外判断
            if (!container || !isShown(container) || container.closest('details:not([open])') || !range.intersectsNode(container)) continue;
            const length = getAnchorText(container).length;
            const start = container.contains(range.startContainer) ? offsetIn(container, range.startContainer, range.startOffset) : 0;
            const end = container.contains(range.endContainer) ? offsetIn(container, range.endContainer, range.endOffset) : length;
            if (end > start) entry[part] = { start, end };
        }
        if (entry.body || entry.reasoning) floors.push(entry);
    }
    return floors;
}

/** 整楼：正文与思维链全部（思维链显示与否由工作台开关决定）。 */
export const wholeFloor = (index, swipe) => ({ index, swipe, body: 'all', reasoning: 'all' });

/**
 * 缓存：同一张卡里重复用到的渲染结果。
 * texts：阅读器那样渲染出来的锚点文字；cards：createCardMessage 的结果（按名字开关分开）。
 */
export const createPieceCache = () => ({ texts: new Map(), cards: new Map() });

/** 这楼这候选在阅读器里显示出来的锚点文字。放在不加载图片的空文档里，不会发出任何请求。 */
function readerText(cache, handle, index, swipe, part) {
    const key = `${index}:${swipe}:${part}`;
    if (!cache.texts.has(key)) {
        const rendered = renderMessage(handle, index, swipe);
        const box = document.implementation.createHTMLDocument('').createElement('div');
        box.innerHTML = part === 'reasoning' ? rendered.reasoningHtml : rendered.html; // core 已清洗
        cache.texts.set(key, getAnchorText(box));
    }
    return cache.texts.get(key);
}

/** 一条划线 → 它所在那楼的选段；原文变了找不到时返回 null。 */
export async function annotationToFloor(handle, record, cache) {
    const { mesIndex, swipeIndex, part = 'body' } = record.anchor;
    const model = handle.getMessage(mesIndex);
    const swipe = model.swipes[swipeIndex];
    if (!swipe) return null;
    const text = readerText(cache, handle, mesIndex, swipeIndex, part);
    const found = await locateAnchorText(text, record.anchor, {
        chatKey: handle.chatKey, mesIndex, swipeIndex, part, rawText: part === 'reasoning' ? swipe.reasoning : swipe.text,
    });
    if (found.status !== 'attached') return null;
    return { index: mesIndex, swipe: swipeIndex, body: null, reasoning: null, [part]: { start: found.start, end: found.end } };
}

/** 卡片副本里的文字节点（替换成的 char/user 也是文字；样式代码不算）。 */
function cardTextNodes(root) {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: node => (node.parentElement?.closest('style, script') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    return nodes;
}

/** 按文字位置在副本上取一段（起点落在下一个字、终点落在上一个字，边界上的图标不带进来）。 */
function cloneByOffsets(root, start, end) {
    if (end <= start) return null;
    const nodes = cardTextNodes(root);
    const range = root.ownerDocument.createRange();
    let offset = 0, began = false, ended = false;
    for (const node of nodes) {
        const next = offset + node.data.length;
        if (!began && start < next) { range.setStart(node, start - offset); began = true; }
        if (began && end <= next) { range.setEnd(node, end - offset); ended = true; break; }
        offset = next;
    }
    if (!began) return null;
    if (!ended) range.setEnd(root, root.childNodes.length);
    return range.cloneContents();
}

function cloneChildren(root) {
    const fragment = root.ownerDocument.createDocumentFragment();
    for (const child of root.childNodes) fragment.append(child.cloneNode(true));
    return fragment;
}

const hasContent = fragment => !!fragment && (fragment.textContent.trim() !== '' || !!fragment.querySelector?.('img, .stcr-replacement, [data-stcr-icon], hr, table'));

/**
 * 选段 → 卡片片段。每个片段：{index, swipe, isUser, isSystem, name, body, reasoning}（后三者是 DocumentFragment 或 null）。
 * mappings 是这些楼实际命中的名字替换（只给工作台私有列表用，不进卡片）。
 * @param {object} handle 阅读器的聊天句柄，导出完成前不能关闭
 * @param {{index:number,swipe:number,body:object|'all'|null,reasoning:object|'all'|null}[]} floors
 * @param {{replaceNames:boolean, rules?:object[], assets?:object[]}} options
 */
export async function buildPieces(handle, floors, options, cache) {
    const pieces = [], mappings = [];
    for (const floor of floors) {
        const key = `${floor.index}:${floor.swipe}:${options.replaceNames ? 1 : 0}`;
        if (!cache.cards.has(key)) {
            cache.cards.set(key, await createCardMessage(handle, floor.index, {
                swipeIndex: floor.swipe, replaceNames: options.replaceNames, rules: options.rules ?? [], assets: options.assets ?? [],
            }));
        }
        const made = cache.cards.get(key);
        const model = handle.getMessage(floor.index);
        const piece = { index: floor.index, swipe: floor.swipe, isUser: model.isUser, isSystem: model.isSystem,
            name: cloneChildren(made.element.querySelector('.name_text')), body: null, reasoning: null };
        for (const [part, selector] of PARTS) {
            const pick = floor[part];
            const source = made.element.querySelector(selector);
            if (!pick || !source) continue;
            let fragment;
            if (pick === 'all') fragment = cloneChildren(source);
            else {
                const segments = alignTexts(readerText(cache, handle, floor.index, floor.swipe, part), cardTextNodes(source).map(node => node.data).join(''));
                fragment = cloneByOffsets(source, mapOffset(segments, pick.start, 'start'), mapOffset(segments, pick.end, 'end'));
            }
            if (hasContent(fragment)) piece[part] = fragment;
        }
        if (piece.body || piece.reasoning) pieces.push(piece);
        mappings.push(...made.mappings);
    }
    return { pieces, mappings };
}

/**
 * 书摘模板的"我的想法"：选段覆盖到的、写了批注的划线，按楼层与位置排序。
 * @param {object[]} annotations 这个聊天的批注记录
 */
export async function findThoughts(handle, floors, annotations, cache) {
    const found = [];
    for (const [order, floor] of floors.entries()) {
        const model = handle.getMessage(floor.index);
        const swipe = model.swipes[floor.swipe];
        for (const [partOrder, [part]] of PARTS.entries()) {
            const pick = floor[part];
            if (!pick || !swipe) continue;
            const mine = annotations.filter(r => !r.orphan && r.note?.trim() && r.anchor.chatKey === handle.chatKey && r.anchor.mesIndex === floor.index
                && r.anchor.swipeIndex === floor.swipe && (r.anchor.part ?? 'body') === part);
            if (!mine.length) continue;
            const text = readerText(cache, handle, floor.index, floor.swipe, part);
            const context = { chatKey: handle.chatKey, mesIndex: floor.index, swipeIndex: floor.swipe, part, rawText: part === 'reasoning' ? swipe.reasoning : swipe.text };
            for (const record of mine) {
                const at = await locateAnchorText(text, record.anchor, context);
                if (at.status !== 'attached') continue;
                if (pick !== 'all' && !(at.start < pick.end && at.end > pick.start)) continue;
                found.push({ key: [order, partOrder, at.start], note: record.note.trim(), id: record.id });
            }
        }
    }
    found.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);
    return found;
}

/**
 * 批注是用户自己写的字，可能带着真名：名字替换开着时，按本卡命中的替换和自动规则（{{user}}→user、角色→char）换掉。
 * 批注不经过正则前原文，所以只做字面替换；屏蔽词之后会在整张卡上统一遮盖。
 */
export function scrubNote(note, handle, mappings, replaceNames) {
    if (!replaceNames) return note;
    const pairs = [];
    const add = (from, to) => { if (from && !pairs.some(pair => pair.from === from)) pairs.push({ from, to }); };
    for (const item of mappings) if (item.to?.kind === 'text') add(item.from, item.to.value);
    for (const rule of automaticNameRules({ userName: handle.header.userName, characterName: handle.header.characterName, isGroup: handle.isGroup })) add(rule.from, rule.to.value);
    return replaceLiteralNames(note, pairs);
}
