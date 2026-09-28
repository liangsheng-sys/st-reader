/** 从纯文本选区创建引用，不绑定 DOM；T13 在其上实现 Range 与 orphan 持久化。 */
export function makeTextQuote(text, start, end, contextLength = 32) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) throw new RangeError('选区无效');
    if (!Number.isInteger(contextLength) || contextLength < 0) throw new RangeError('上下文长度需为非负整数');
    return Object.freeze({ exact: text.slice(start, end), prefix: text.slice(Math.max(0, start - contextLength), start), suffix: text.slice(end, end + contextLength) });
}
/** 优先完整上下文；退化为唯一 exact；重复且无法消歧或完全失配返回 null。 */
export function locateTextQuote(text, quote) {
    if (!quote?.exact) return null;
    const matches = [];
    for (let at = text.indexOf(quote.exact); at !== -1; at = text.indexOf(quote.exact, at + 1)) matches.push(at);
    const contextual = matches.filter(at => text.slice(0, at).endsWith(quote.prefix ?? '') && text.slice(at + quote.exact.length).startsWith(quote.suffix ?? ''));
    const at = contextual.length === 1 ? contextual[0] : matches.length === 1 ? matches[0] : null;
    return at === null ? null : { start: at, end: at + quote.exact.length };
}
/** 字面量、长词优先、不二次替换；自动名字规则在正则前作用于原文副本。 */
export function replaceLiteralNames(text, pairs) {
    const sorted = pairs.filter(pair => pair.from).map((pair, order) => ({ ...pair, order })).sort((a, b) => b.from.length - a.from.length || a.order - b.order);
    let result = '';
    for (let i = 0; i < text.length;) {
        const match = sorted.find(pair => text.startsWith(pair.from, i));
        if (match) { result += match.to; i += match.from.length; }
        else result += text[i++];
    }
    return result;
}
/** 正则后的文本节点拆为 text/mask 段；mask 段不保存原词，供 T14 创建遮盖 span。 */
export function splitMaskedText(text, words) {
    const sorted = [...new Set(words.filter(word => typeof word === 'string' && word))].sort((a, b) => b.length - a.length);
    const result = [];
    let pending = '';
    for (let i = 0; i < text.length;) {
        const match = sorted.find(word => text.startsWith(word, i));
        if (!match) { pending += text[i++]; continue; }
        if (pending) { result.push({ type: 'text', text: pending }); pending = ''; }
        result.push({ type: 'mask', length: [...match].length }); i += match.length;
    }
    if (pending) result.push({ type: 'text', text: pending });
    return result;
}
