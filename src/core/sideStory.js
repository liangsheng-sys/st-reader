// ST Reader — AGPL-3.0
import { renderMessage } from './formatter.js';
import { isStHiddenFloor } from './messageModel.js';
import { findHtmlBlocks } from './htmlBlockLocate.js';

const words = ['小剧场', '番外', 'if线', '平行世界', '暂停正文'];
const bounded = (v, n, fallback) => typeof v === 'string' && v.trim() && [...v].length <= n ? v : fallback;
export function normalizeSideStoryRules(raw) {
    const t = raw?.tag, k = raw?.keyword, errors = [];
    const tag = { on: t?.on === true, mode: t?.mode === 'regex' ? 'regex' : 'pair',
        start: bounded(t?.start, 200, '<小剧场>'), end: bounded(t?.end, 200, '</小剧场>'),
        pattern: typeof t?.pattern === 'string' ? t.pattern : '', flags: typeof t?.flags === 'string' ? t.flags : 'gs',
        scanRendered: t?.scanRendered === true };
    if (tag.mode === 'regex') {
        try {
            if (!tag.flags.includes('g')) throw Error('番外正则需要全局标志 g');
            if (!tag.pattern) throw Error('番外正则不能为空');
            new RegExp(tag.pattern, tag.flags);
        } catch (e) { tag.on = false; errors.push(e.message); }
    }
    const unique = new Map();
    for (const v of Array.isArray(k?.words) ? k.words : words) {
        const word = bounded(typeof v === 'string' ? v.trim() : '', 30, '');
        if (word && !unique.has(word.toLowerCase())) unique.set(word.toLowerCase(), word);
        if (unique.size === 50) break;
    }
    return { tag, keyword: { on: k?.on === true, words: [...unique.values()] }, hidden: { on: raw?.hidden?.on === true }, errors };
}

const literal = s => s.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
// matchAll 自行推进零宽命中；无内容的区间不参加升级和折叠。
export function tagMatcher(tag) {
    const re = !tag.on ? null : tag.mode === 'regex' ? new RegExp(tag.pattern, tag.flags)
        : new RegExp(literal(tag.start) + '[\\s\\S]*?(?:' + literal(tag.end) + '|(?![\\s\\S]))', 'gi');
    return (text, swipe) => {
        const ranges = [];
        let cursor = 0, other = false;
        if (re) for (const m of text.matchAll(re)) {
            if (!m[0]) continue;
            other ||= !!text.slice(cursor, m.index).trim();
            cursor = m.index + m[0].length;
            ranges.push({ start: m.index, end: cursor, swipe, source: tag.scanRendered ? 'rendered' : 'raw',
                ...(tag.scanRendered ? {} : { rawText: text }) });
        }
        return { whole: !!ranges.length && !other && !text.slice(cursor).trim(), ranges };
    };
}

export function classifySideStory(handle, rawRules, { swipeOf, texts, onProgress, signal } = {}) {
    const { tag, keyword, hidden } = normalizeSideStoryRules(rawRules);
    const floors = new Set(), segments = new Map(), stats = { keyword: 0, hidden: 0, tag: 0 };
    const result = { floors, segments, stats }, needles = keyword.words.map(w => w.toLowerCase());
    const pick = m => { const s = swipeOf?.(m.index); return Number.isInteger(s) && m.swipes[s] ? s : m.swipeId; };
    let following = false;
    if (keyword.on || hidden.on) for (let i = 0; i < handle.total; i++) {
        const m = handle.getMessage(i);
        if (keyword.on && m.isUser) {
            const text = m.swipes[pick(m)].text.toLowerCase();
            following = needles.some(w => text.includes(w));
        }
        if (following) { floors.add(i); stats.keyword++; }
        if (hidden.on && isStHiddenFloor(m)) { floors.add(i); stats.hidden++; }
    }
    if (!tag.on) return result;
    const match = tagMatcher(tag);
    function scan(i) {
        if (floors.has(i)) return;
        const m = handle.getMessage(i), s = pick(m);
        const text = tag.scanRendered ? (texts?.(i, s) ?? renderMessage(handle, i, s).displayText) : m.swipes[s].text;
        const { whole, ranges } = match(text, s);
        if (whole) floors.add(i);
        else if (ranges.length) segments.set(i, ranges);
        if (ranges.length) stats.tag++;
    }
    if (!tag.scanRendered) { for (let i = 0; i < handle.total; i++) scan(i); return result; }
    return (async () => {
        let start = performance.now();
        for (let i = 0; i < handle.total; i++) {
            signal?.throwIfAborted(); scan(i);
            if (performance.now() - start >= 8) {
                onProgress?.(i + 1, handle.total);
                await new Promise(resolve => setTimeout(resolve, 0)); start = performance.now();
            }
        }
        onProgress?.(handle.total, handle.total); return result;
    })();
}

function uniqueAt(text, needle) {
    const at = text.indexOf(needle);
    return needle && at >= 0 && text.indexOf(needle, at + 1) < 0 ? at : -1;
}
export function displayInterval(display, r) {
    const { start, end, rawText } = r;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end) return null;
    if (r.source !== 'raw' || rawText === display) return end <= display.length ? [start, end] : null;
    if (typeof rawText !== 'string' || end > rawText.length) return null;
    const part = rawText.slice(start, end), exact = uniqueAt(display, part);
    if (exact >= 0) return [exact, exact + part.length];
    const a = uniqueAt(display, part.slice(0, 20)), tail = part.slice(-20), b = uniqueAt(display, tail);
    return a >= 0 && b >= a ? [a, b + tail.length] : null;
}

// 用可见文本逐段对齐，保存每个 UTF-16 码元对应的原 DOM 端点；不改动正文。
// 先试字面文本（酒馆可能转义自定义标签），再试去掉 Markdown 标记、HTML 外壳的文本。
export function locateSegments(root, displayText, ranges) {
    const doc = root.ownerDocument, chars = [], nodes = [], offsets = [];
    const walker = doc.createTreeWalker(root, 4);
    for (let n; (n = walker.nextNode());) {
        if (n.parentElement?.closest('style,script,template')) continue;
        for (let j = 0; j < n.length; j++) if (!/\s/.test(n.data[j])) {
            chars.push(n.data[j]); nodes.push(n); offsets.push(j);
        }
    }
    const visible = chars.join(''), compact = s => s.replace(/\s/g, '');
    const markdown = s => compact(s.replace(/(\*\*|__|~~|[*_\x60])/g, ''));
    const parsed = s => {
        const t = doc.createElement('template');
        t.innerHTML = s;
        for (const el of t.content.querySelectorAll('style,script,template')) el.remove();
        return markdown(t.content.textContent);
    };
    const plain = s => {
        const t = doc.createElement('template');
        t.innerHTML = s.replace(/<\/?[^<>\s]+(?:\s[^<>]*)?>/g, '');
        return markdown(t.content.textContent);
    };
    let blocks;
    const located = ranges.map(r => {
        const bounds = displayInterval(displayText, r);
        if (!bounds) return null;
        const [a,b] = bounds, piece = displayText.slice(a,b), range = doc.createRange();
        // 完整裸 HTML 复用 T75 的顶层序列定位（包括没有可见文字的块）。
        if (/^\s*</.test(piece)) {
            blocks ??= findHtmlBlocks(root, r.rawText ?? displayText, displayText);
            const hit = blocks.filter(v => v.nodes && v.html.trim() === piece.trim());
            if (hit.length === 1 && uniqueAt(displayText, piece) === a) {
                range.setStartBefore(hit[0].nodes[0]); range.setEndAfter(hit[0].nodes[1]); return range;
            }
        }
        // 优先整楼对齐。若先接受字面局部命中，重复文字里的 Markdown 可能指向错误段落。
        let fallback = null, aligned = null, ambiguous = false;
        for (const project of [compact, markdown, parsed, plain]) {
            const needle = project(piece);
            if (!needle) continue;
            const prefix = project(displayText.slice(0, a)), suffix = project(displayText.slice(b));
            const projected = prefix + needle + suffix;
            if (projected === visible) { aligned = { at: prefix.length, needle }; break; }
            const at = uniqueAt(visible, needle);
            if (at < 0 || uniqueAt(projected, needle) !== prefix.length) continue;
            if (fallback && (fallback.at !== at || fallback.needle !== needle)) ambiguous = true;
            fallback = { at, needle };
        }
        const position = aligned ?? (ambiguous ? null : fallback);
        if (position) {
            const { at, needle } = position;
            const last = at + needle.length - 1;
            range.setStart(nodes[at], offsets[at]); range.setEnd(nodes[last], offsets[last] + 1);
            // 若区间包含完整元素的所有文字且源中含该外壳，把图片、summary 等也保留。
            for (let el = nodes[at].parentElement; el && el !== root; el = el.parentElement) {
                if (el.contains(nodes[last]) && compact(el.textContent) === needle && piece.trimStart().toLowerCase().startsWith('<' + el.localName + '>')) range.selectNode(el);
            }
            return range;
        }
        return null;
    });
    located.missed = located.filter(r => !r).length;
    return located;
}
