// 脱敏匹配全部是字面量；没有正则代码、HTML 拼接或宿主状态写入。
export const CARD_ICONS = Object.freeze({ 'fa-star': '\uf005', 'fa-heart': '\uf004', 'fa-cat': '\uf6be', 'fa-cloud': '\uf0c2', 'fa-moon': '\uf186', 'fa-shield': '\uf132' });
const wordChar = char => !!char && /[\p{L}\p{N}\p{M}_]/u.test(char);
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 按群成员给定顺序编号；重名不猜身份，按首次出现的成员编号匹配。 */
export function automaticNameRules({ userName = '', characterName = '', isGroup = false, groupNames = [] } = {}) {
    const result = [];
    const add = (from, value) => { if (from) result.push({ from, to: { kind: 'text', value }, scope: 'all', caseSensitive: true, source: 'automatic' }); };
    add(userName, 'user'); add('{{user}}', 'user');
    if (isGroup) {
        groupNames.forEach((name, index) => add(name, `char${index + 1}`));
        if (characterName && !groupNames.includes(characterName)) add(characterName, 'char');
    }
    else add(characterName, 'char');
    const memberIndex = groupNames.indexOf(characterName);
    add('{{char}}', isGroup && memberIndex >= 0 ? `char${memberIndex + 1}` : 'char');
    return result;
}

function validateRule(rule) {
    if (typeof rule?.from !== 'string' || !rule.from) throw new TypeError('替换原词不能为空');
    if (!['text', 'icon', 'asset'].includes(rule.to?.kind) || typeof rule.to.value !== 'string') throw new TypeError('替换目标无效');
    if (rule.to.kind === 'icon' && !Object.hasOwn(CARD_ICONS, rule.to.value)) throw new TypeError('不支持的内置图标');
    if (rule.to.kind === 'asset' && !rule.to.value) throw new TypeError('图片素材 ID 不能为空');
}

function occurrences(text, rule) {
    const expression = new RegExp(escapeRegex(rule.from), rule.caseSensitive ? 'gu' : 'giu');
    return [...text.matchAll(expression)].filter(match => {
        if (!rule.wholeWord) return true;
        const before = [...text.slice(0, match.index)].at(-1), after = [...text.slice(match.index + match[0].length)][0];
        return !wordChar(before) && !wordChar(after);
    }).map(match => ({ start: match.index, end: match.index + match[0].length, rule }));
}

/** 按优先级再按长词选取不重叠范围；输出不再参与后续规则，避免 A→B→C 连锁。 */
function selectMatches(text, groups, accept = () => true) {
    const selected = [];
    for (const group of groups) {
        const candidates = group.flatMap((rule, order) => occurrences(text, rule).map(match => ({ ...match, order })));
        candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.order - b.order || a.start - b.start);
        for (const candidate of candidates) if (accept(candidate) && !selected.some(item => overlaps(candidate, item))) selected.push(candidate);
    }
    return selected.sort((a, b) => a.start - b.start);
}
const overlaps = (a, b) => a.start < b.end && a.end > b.start;

/**
 * 纯函数：正则前的原文 → 文本/受保护替换片段。输入永不修改。
 * 自动名字整体保护；我的规则只有完整同名或不相交时优先。同级长词优先，不递归替换目标文本。
 * @param {string} text 正则前原文
 * @param {{replaceNames?:boolean,autoReplaceNames?:boolean,applyReplaceRules?:boolean,rules?:object[],avatarUrl?:string,userName?:string,characterName?:string,isGroup?:boolean,groupNames?:string[]}} options
 * @returns {{segments:object[],mappings:object[]}}
 */
export function replaceNamesInRaw(text, options = {}) {
    if (typeof text !== 'string') throw new TypeError('原文必须为字符串');
    // replaceNames 是已交付的整段处理开关，选段导出用 false 防止再次替换。
    if (options.replaceNames === false || (options.autoReplaceNames === false && options.applyReplaceRules === false)) {
        return { segments: [{ kind: 'text', text }], mappings: [] };
    }
    // 先展开已知名字宏的大小写/空白变体，使“我的名字规则”同样覆盖宏；未知宏不执行。
    text = text.replace(/{{\s*(user|char)\s*}}/gi, (_, name) => name.toLowerCase() === 'user'
        ? options.userName || '{{user}}' : options.characterName || '{{char}}');
    const mine = options.applyReplaceRules === false ? []
        : (options.rules ?? []).filter(rule => !rule.scope || rule.scope === 'all' || rule.scope === options.avatarUrl);
    mine.forEach(validateRule);
    const automatic = options.autoReplaceNames === false ? [] : automaticNameRules(options);
    // 保护所有自动名字范围，包括嵌套短名字，不能让长的用户规则跨边界吞掉名字。
    const protectedMatches = automatic.flatMap(rule => occurrences(text, rule));
    const skipped = [];
    const matches = selectMatches(text, [mine.map(rule => ({ ...rule, source: 'mine' })), automatic], candidate => {
        if (candidate.rule.source !== 'mine') return true;
        const completeName = protectedMatches.some(item => candidate.start === item.start && candidate.end === item.end && candidate.rule.from === item.rule.from);
        const blocked = protectedMatches.some(item => overlaps(candidate, item)
            && !(completeName && candidate.start <= item.start && candidate.end >= item.end));
        if (blocked) skipped.push(candidate);
        return !blocked;
    });
    const segments = [], mappings = [];
    let offset = 0;
    for (const { start, end, rule } of matches) {
        if (start > offset) segments.push({ kind: 'text', text: text.slice(offset, start) });
        segments.push({ kind: 'replacement', to: { ...rule.to } });
        const existing = mappings.find(item => item.from === rule.from && item.source === rule.source && item.to.kind === rule.to.kind && item.to.value === rule.to.value);
        const mapping = existing ?? { from: rule.from, to: { ...rule.to }, source: rule.source, count: 0 };
        if (!existing) mappings.push(mapping);
        mapping.count++;
        // 跳过诊断附在真正保护了完整名字的映射上，旧 UI 不会误把未执行规则用于批注文案。
        const protectsName = protectedMatches.some(item => start <= item.start && end >= item.end);
        for (const candidate of skipped.filter(item => protectsName && overlaps(item, { start, end }))) {
            mapping.skippedOverlap = true;
            mapping.skippedRules ??= [];
            const found = mapping.skippedRules.find(item => item.from === candidate.rule.from && item.to.kind === candidate.rule.to.kind && item.to.value === candidate.rule.to.value);
            if (found) found.count++;
            else mapping.skippedRules.push({ from: candidate.rule.from, to: { ...candidate.rule.to }, count: 1 });
        }
        offset = end;
    }
    if (offset < text.length || !segments.length) segments.push({ kind: 'text', text: text.slice(offset) });
    return { segments, mappings };
}

export function normalizeMaskStyle(style = 'bar') {
    const result = typeof style === 'string' ? { kind: style } : { ...style };
    if (!['bar', 'block', 'sticker'].includes(result.kind)) throw new TypeError('遮盖样式须为 bar / block / sticker');
    result.uniform = result.uniform !== false;
    result.color ??= result.kind === 'bar' ? '#000000' : '#72b8a5';
    // 强制实色，不能通过透明色/渐变让原文重新显现。
    if (!/^#[\da-f]{6}$/i.test(result.color)) throw new TypeError('遮盖颜色须为六位不透明十六进制颜色');
    result.icon ??= 'fa-star';
    if (!Object.hasOwn(CARD_ICONS, result.icon)) throw new TypeError('不支持的遮盖图标');
    if (result.assetId !== undefined && (typeof result.assetId !== 'string' || !result.assetId)) throw new TypeError('遮盖图片 ID 无效');
    return result;
}

/**
 * 纯函数：正则后的一段连续文本 → 普通文本/遮盖描述。遮盖描述绝不保存原词。
 * 浏览器适配器把 mask 片段物化成 span，跨内联文本节点也复用此匹配逻辑。
 * @returns {Array<{kind:string,text?:string,width?:number,style?:object,start?:number,end?:number}>}
 */
export function maskText(text, words = [], maskStyle = 'bar') {
    if (typeof text !== 'string' || !Array.isArray(words) || words.some(word => typeof word !== 'string' || !word)) throw new TypeError('屏蔽词必须为非空字符串数组');
    const style = normalizeMaskStyle(maskStyle), segments = [];
    const matches = selectMatches(text, [[...new Set(words)].map(from => ({ from, caseSensitive: true }))]);
    let offset = 0;
    for (const { start, end } of matches) {
        if (start > offset) segments.push({ kind: 'text', text: text.slice(offset, start), start: offset, end: start });
        segments.push({ kind: 'mask', width: style.uniform ? 3 : Math.max(1, [...text.slice(start, end)].length), style: { ...style }, start, end });
        offset = end;
    }
    if (offset < text.length || !segments.length) segments.push({ kind: 'text', text: text.slice(offset), start: offset, end: text.length });
    return segments;
}
