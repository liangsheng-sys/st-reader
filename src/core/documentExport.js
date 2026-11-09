// ST Reader — AGPL-3.0
// T97 / D43：把一个聊天导出成可以直接读的文档（纯文本 .txt / 单文件 .html），03 §5.22。
// 文字从显示结果取：renderMessage 排出来的 HTML（显示正则 + Markdown + 清洗之后，和阅读器看到的一致）放进惰性文档里遍历，
// 不从原文剥符号。只读：不写聊天、不改候选、不碰 ST 状态；文件由调用方交给浏览器下载。
// 图片只内嵌 data: 与同源读得到的（D23 读取器，外站一律不取）；HTML 块勾上时做成禁脚本的静态快照（htmlStatic）。

import { parseChatKey } from './chatSource.js';
import { maskCodeText, maskHtmlString } from './codeTransforms.js';
import { cleanHtml, docDate, docFileName, escapeHtml, HTML_DOCUMENT_TAIL, htmlDocumentHead, htmlFloor, normalizeDocOptions, speakerLabel, textLines, txtFloor } from './documentText.js';
import { renderMessage } from './formatter.js';
import { findHtmlBlocks } from './htmlBlockLocate.js';
import { createResourceLoader } from './htmlExternalResources.js';
import { renderStatic } from './htmlStatic.js';

const STATIC_WIDTH = 640; // HTML 块静态快照的排版宽度（文档正文列约 40em）
const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml)[;,]/i;
const sameOrigin = url => { try { return new URL(url, document.baseURI).origin === location.origin; } catch { return false; } };
/** 只读同源（ST 自己的 /user/images、角色图等）；外站一律不请求。 */
const sameOriginFetch = (url, init) => (sameOrigin(url) ? fetch(url, init) : Promise.reject(new Error('导出文档不读取外站资源')));
const idle = () => new Promise(resolve => (globalThis.requestIdleCallback ? requestIdleCallback(() => resolve(), { timeout: 60 }) : setTimeout(resolve, 0)));

/**
 * @param {object} handle openChat 返回值；导出完成前不要 close
 * @param {object} options 见 03 §5.22：format / swipes / speaker / include（normalizeDocOptions）+ from / to / swipeOf / redact / owner
 * @param {{onProgress?:(done:number,total:number)=>void, signal?:AbortSignal}} [control]
 * @returns {Promise<{filename:string, mimeType:string, blob:Blob, stats:object}>}
 */
export async function exportDocument(handle, options = {}, { onProgress, signal } = {}) {
    if (!handle || typeof handle.getMessage !== 'function') throw new TypeError('需要 openChat 返回的聊天句柄');
    const o = normalizeDocOptions(options);
    const total = handle.total;
    const from = options.from ?? 0, to = options.to ?? total - 1;
    if (!total) throw new RangeError('这个聊天是空的');
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to >= total || from > to) throw new RangeError('楼层范围不对');
    const redact = options.redact ?? null;
    if (redact && (!Array.isArray(redact.maskWords) || !Array.isArray(redact.rules))) throw new TypeError('脱敏需要屏蔽词与替换规则列表');
    signal?.throwIfAborted();

    const header = handle.header ?? {};
    const key = parseChatKey(handle.chatKey);
    const group = !!handle.isGroup;
    /** 这一楼（或整个聊天，model 为空）的脱敏选项；与阅读器"复制脱敏版"同一套（名字与规则作用范围按发言者）。 */
    const maskOptions = model => ({
        userName: header.userName ?? '',
        characterName: group ? (model && !model.isUser ? model.name : '') : header.characterName ?? '',
        isGroup: group,
        avatarUrl: group ? (model && !model.isUser ? model.originalAvatar ?? undefined : undefined) : key.avatarUrl ?? undefined,
        maskWords: redact.maskWords, rules: redact.rules, autoReplaceNames: redact.autoNames !== false, applyReplaceRules: true,
        maskStyle: { kind: 'bar', uniform: false },
    });
    const optionsFor = model => {
        if (!redact) return null;
        const opts = model ? maskOptions(model) : { ...maskOptions(null), characterName: header.characterName ?? '' };
        maskCodeText('', opts); // 规则或词表有问题现在就抛：不产出"可能没脱敏"的文件
        return opts;
    };
    const maskWith = opts => (opts ? text => maskCodeText(text, opts) : null);
    const chatMask = maskWith(optionsFor(null));
    const owner = String(options.owner ?? header.characterName ?? '');
    const shownOwner = chatMask ? chatMask(owner) : owner;
    const shownTitle = chatMask ? chatMask(String(handle.title ?? '')) : String(handle.title ?? '');

    const warnings = [];
    const warn = message => { if (!warnings.includes(message)) warnings.push(message); };
    const stats = { floors: 0, skipped: 0, htmlBlocks: 0, images: 0, imagePlaceholders: 0, fallbacks: 0 };
    const html = o.format === 'html';
    const loader = html ? createResourceLoader({ fetchFn: sameOriginFetch, signal, onWarning: warn }) : null;
    const scratch = document.implementation.createHTMLDocument(''); // 惰性文档：图片不加载、脚本不跑

    const chunks = [];
    let last = performance.now();
    for (let index = from; index <= to; index++) {
        signal?.throwIfAborted();
        const model = handle.getMessage(index);
        if ((model.isUser && !o.include.user) || ((model.isSystem || model.isNarrator) && !o.include.hidden)) { stats.skipped++; continue; }
        const maskOpts = optionsFor(model), mask = maskWith(maskOpts);
        const chosen = pickSwipes(model, o.swipes, options.swipeOf);
        const parts = [];
        for (const swipeIndex of chosen) {
            const label = chosen.length > 1 ? `候选 ${swipeIndex + 1}/${model.swipes.length}` : null;
            parts.push({ label, ...await renderPart(handle, model, swipeIndex, { o, html, mask, maskOpts, scratch, loader, signal, stats, warn }) });
        }
        const speakerName = mask ? mask(String(model.name ?? '')) : model.name;
        const floor = { number: index + 1, date: model.swipes[chosen[0]]?.sendDate ?? model.date, speaker: speakerLabel(o.speaker, { name: speakerName, isUser: model.isUser }), isUser: model.isUser, parts };
        const out = html ? htmlFloor(floor, o.include) : txtFloor(floor, o.include);
        if (out === null) stats.skipped++;
        else { chunks.push(out); stats.floors++; }
        if (performance.now() - last > 12) {
            onProgress?.(index - from + 1, to - from + 1);
            await idle();
            last = performance.now();
        }
    }
    signal?.throwIfAborted();
    onProgress?.(to - from + 1, to - from + 1);

    const filename = docFileName(shownOwner, shownTitle, o.format);
    const range = from === 0 && to === total - 1 ? `共 ${total} 楼` : `第 ${from + 1}–${to + 1} 楼`;
    let blob, mimeType;
    if (html) {
        mimeType = 'text/html';
        const subtitle = [shownOwner, range, `导出于 ${docDate(Date.now())}`].filter(Boolean).join(' · ');
        blob = new Blob([htmlDocumentHead({ title: shownTitle || shownOwner || '聊天', subtitle }), chunks.join('\n'), '\n', HTML_DOCUMENT_TAIL], { type: 'text/html;charset=utf-8' });
    } else {
        mimeType = 'text/plain';
        const head = [shownTitle || shownOwner || '聊天', [shownOwner, range].filter(Boolean).join(' · ')].join('\r\n');
        blob = new Blob(['\uFEFF', head, '\r\n\r\n', chunks.join('\r\n\r\n'), '\r\n'], { type: 'text/plain;charset=utf-8' });
    }
    return { filename, mimeType, blob, stats: { ...stats, warnings } };
}

/** 要导出的候选下标：酒馆当前 / 阅读器里选的 / 全部。 */
function pickSwipes(model, mode, swipeOf) {
    const count = model.swipes.length;
    if (mode === 'all') return [...Array(count).keys()];
    if (mode === 'reader' && typeof swipeOf === 'function') {
        const picked = swipeOf(model.index);
        if (Number.isInteger(picked) && picked >= 0 && picked < count) return [picked];
    }
    return [model.swipeId];
}

/** 一个候选 → {reasoning, body}（TXT 为行数组，HTML 为片段）。排版抛错时按原文导出这一候选并记一条提示。 */
async function renderPart(handle, model, swipeIndex, ctx) {
    const { o, html, mask, scratch } = ctx;
    let rendered;
    try { rendered = renderMessage(handle, model.index, swipeIndex); } catch (error) {
        ctx.stats.fallbacks++;
        ctx.warn('有楼层排版失败，按原文导出');
        console.warn('[st-reader] 导出文档：排版失败，按原文', model.index, error);
        const lines = String(model.swipes[swipeIndex]?.text ?? '').split(/\r?\n/).map(line => (mask ? mask(line) : line).trim()).filter(Boolean);
        return { reasoning: null, body: html ? lines.map(line => `<p>${escapeHtml(line)}</p>`).join('') : lines };
    }
    const box = scratch.createElement('div');
    box.innerHTML = rendered.html; // core 已清洗；惰性文档里不加载任何资源
    const blocks = new Map();
    const swipe = model.swipes[swipeIndex];
    for (const found of findHtmlBlocks(box, swipe.text, rendered.displayText ?? swipe.text)) {
        // 对不上位置（nodes 为 null）的整楼 HTML：当普通正文导出，至少文字还在
        if (found.kind === 'fenced' && found.pre) blocks.set(found.pre, { first: found.pre, source: found.html });
        else if (found.nodes) {
            const info = { first: found.nodes[0], source: found.html };
            for (let el = found.nodes[0]; el; el = el.nextElementSibling) { blocks.set(el, info); if (el === found.nodes[1]) break; }
        }
    }
    if (o.include.html) {
        for (const info of new Set(blocks.values())) {
            ctx.stats.htmlBlocks++;
            if (html) info.html = await staticBlock(info.source, ctx);
            else info.lines = blockLines(info.source, mask, o.include);
        }
    }
    let reasoning = null;
    if (o.include.reasoning && rendered.reasoningHtml) {
        const think = scratch.createElement('div');
        think.innerHTML = rendered.reasoningHtml;
        reasoning = html ? cleanHtml(think, { include: o.include, mask, image: await imagesFor(think, ctx, new Map()) }) : textLines(think, { include: o.include, mask });
    }
    const body = html
        ? cleanHtml(box, { include: o.include, blocks, mask, image: await imagesFor(box, ctx, blocks) })
        : textLines(box, { include: o.include, blocks, mask });
    return { reasoning, body };
}

/** TXT：HTML 块只留文字（DOMParser 文档是惰性的）。 */
function blockLines(source, mask, include) {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    return textLines(doc.body, { include: { ...include, tables: true, details: true }, mask });
}

/** HTML：HTML 块做成禁脚本的静态快照，作为 srcdoc 放进文档；做不出来就写一行说明。 */
async function staticBlock(source, ctx) {
    let snapshot = null;
    try {
        const masked = ctx.maskOpts ? await maskHtmlString(source, ctx.maskOpts) : source;
        snapshot = await renderStatic(masked, { width: STATIC_WIDTH, allowNetwork: true, fetchFn: sameOriginFetch, signal: ctx.signal, onWarning: ctx.warn });
        const doc = `<!doctype html>${snapshot.document.documentElement.outerHTML}`;
        return `<iframe sandbox="" title="HTML 块" loading="lazy" style="height:${snapshot.height}px" srcdoc="${escapeHtml(doc)}"></iframe>`;
    } catch (error) {
        if (error?.name === 'AbortError' || ctx.signal?.aborted) throw error;
        ctx.warn('有 HTML 块没能做成静态样子，写成了说明文字');
        console.warn('[st-reader] 导出文档：HTML 块静态化失败', error);
        return '<p class="img">[HTML 块]</p>';
    } finally { snapshot?.destroy(); }
}

/**
 * HTML：正文里每张图换成什么（HTML 块里的不算）。data: 图片原样；同源的读出来转 data:；其余（外站、读不到的）写"[图片]"。
 * 先异步全部读好，再交给同步的 cleanHtml。
 */
async function imagesFor(root, ctx, blocks) {
    const found = new Map();
    const inBlock = img => { for (let el = img; el && el !== root; el = el.parentElement) if (blocks.has(el)) return true; return false; };
    for (const img of root.querySelectorAll('img')) {
        if (inBlock(img)) continue; // HTML 块里的图跟着静态快照走（或整块不导出），这里不读
        const src = (img.getAttribute('src') ?? '').trim();
        let data = null;
        if (DATA_IMAGE.test(src)) data = src;
        else if (src && sameOrigin(src)) {
            try {
                const result = await ctx.loader.resource(src);
                if (DATA_IMAGE.test(result.data)) data = result.data;
            } catch (error) {
                if (error?.name === 'AbortError' || ctx.signal?.aborted) throw error;
                ctx.warn('有图片读不到，写成了"[图片]"');
            }
        } else if (src) ctx.warn('外站图片不放进文档，写成了"[图片]"');
        found.set(img, data);
        if (data) ctx.stats.images++; else ctx.stats.imagePlaceholders++;
    }
    return node => {
        const data = found.get(node);
        return data ? `<img src="${escapeHtml(data)}" alt="">` : '<span class="img">[图片]</span>';
    };
}
