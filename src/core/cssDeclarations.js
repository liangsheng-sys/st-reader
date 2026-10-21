// ST Reader — AGPL-3.0
// 只读遍历 CSSOM 声明；卡片快照（T73）与正文样式清洗（T75）共用。

const SHORTHAND_OF = { top: 'inset', right: 'inset', bottom: 'inset', left: 'inset', 'row-gap': 'gap', 'column-gap': 'gap' };
/** 含 var() 的简写（如宿主气泡的 border: 1px solid var(--…)）展开后各分项读出来是空串，只能整条取简写。 */
function shorthandOf(style, name) {
    if (SHORTHAND_OF[name]) return style.getPropertyValue(SHORTHAND_OF[name]) ? SHORTHAND_OF[name] : null;
    if (name.endsWith('-radius')) return style.getPropertyValue('border-radius') ? 'border-radius' : null;
    for (let cut = name.lastIndexOf('-'); cut > 0; cut = name.lastIndexOf('-', cut - 1)) {
        const candidate = name.slice(0, cut);
        if (candidate !== '-webkit' && style.getPropertyValue(candidate)) return candidate;
    }
    return null;
}

/**
 * 一条 CSSStyleDeclaration 里实际写了的声明，按出现顺序；分项为空时换成所属简写，同名只出一次。
 * 值是浏览器规范化后的序列化结果（url 统一成 url("…")，普通属性里的转义已解开）。
 * @param {CSSStyleDeclaration} style
 * @returns {{name:string, value:string, important:boolean}[]}
 */
export function cssDeclarations(style) {
    const seen = new Set(), out = [];
    for (const longhand of style) {
        const name = style.getPropertyValue(longhand) ? longhand : shorthandOf(style, longhand);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        out.push({ name, value: style.getPropertyValue(name), important: !!style.getPropertyPriority(name) });
    }
    return out;
}
