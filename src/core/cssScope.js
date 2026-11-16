// ST Reader — AGPL-3.0
// 只克隆宿主已有样式，不改原规则、不请求样式文件。
import { shorthandOf } from './cssDeclarations.js';

const ownedStyles = new WeakSet();
const resourceProperty = /^(?:-webkit-)?(?:background(?:-image)?|border-image(?:-source)?|mask(?:-image|-box-image(?:-source)?)?|list-style(?:-image)?|cursor|content|filter|backdrop-filter|clip-path|shape-outside|offset-path)$/i;

/** CSS 标识符解码；用于识别 #chat 与 #\63 hat 等等价写法。 */
function decodeIdentifier(value) {
    return value.replace(/\\([0-9a-f]{1,6})\s?|\\([^\r\n])/gi, (_, hex, char) => hex ? String.fromCodePoint(Math.min(parseInt(hex, 16) || 65533, 0x10ffff)) : char);
}

/**
 * 只改真正的 ID token，保留字符串、属性值、#chatty；丢掉不含目标 ID 的并列分支。
 * :where 限定克隆规则的作用对象，避免 :is(#chat,.x) 的 .x 分支反过来影响宿主。
 * @param {string} selector CSSOM selectorText
 * @returns {string} 没有可克隆分支时返回空串
 */
function rewriteSelector(selector, { constrain = true, keepUnmatched = false } = {}) {
    // 多数宿主规则没有目标 ID。含转义的选择器仍逐个 token 判断。
    if (!keepUnmatched && !selector.includes('#chat') && !selector.includes('\\')) return '';
    const branches = [];
    let buffer = '', changed = false, quote = '', square = 0, round = 0, pseudo = -1;
    const flush = () => {
        if (changed || keepUnmatched) {
            const at = pseudo < 0 ? buffer.length : pseudo;
            branches.push(constrain ? `${buffer.slice(0, at).trimEnd()}:where(#stcr_root, #stcr_root *)${buffer.slice(at)}`.trim() : buffer.trim());
        }
        buffer = ''; changed = false; pseudo = -1;
    };
    for (let i = 0; i < selector.length;) {
        const char = selector[i];
        if (quote) {
            buffer += char; i++;
            if (char === '\\' && i < selector.length) buffer += selector[i++];
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") { quote = char; buffer += char; i++; continue; }
        if (selector.startsWith('/*', i)) {
            const end = selector.indexOf('*/', i + 2);
            const next = end < 0 ? selector.length : end + 2;
            buffer += selector.slice(i, next); i = next; continue;
        }
        if (char === '\\') {
            const escaped = selector.slice(i).match(/^\\(?:[0-9a-f]{1,6}\s?|[^\r\n])/i)?.[0] ?? char;
            buffer += escaped; i += escaped.length; continue;
        }
        if (char === '[') square++;
        if (char === ']') square--;
        if (!square && char === '(') round++;
        if (!square && char === ')') round--;
        if (char === ',' && !square && !round) { flush(); i++; continue; }
        if (char === ':' && !square && !round && pseudo < 0 && /^::|^:(?:before|after|first-line|first-letter)\b/i.test(selector.slice(i))) pseudo = buffer.length;
        if (char === '#' && !square) {
            const token = selector.slice(i + 1).match(/^(?:[\w\u0080-\uFFFF-]|\\(?:[0-9a-f]{1,6}\s?|[^\r\n]))+/i)?.[0];
            if (token) {
                const match = decodeIdentifier(token) === 'chat';
                buffer += match ? '#stcr_chat' : `#${token}`; changed ||= match; i += token.length + 1; continue;
            }
        }
        buffer += char; i++;
    }
    flush();
    return branches.join(', ');
}
export function rewriteChatSelector(selector) { return rewriteSelector(selector); }

/** 克隆后的 url 相对原样式表解析；外部地址不带入新规则，避免触发出站请求。 */
function scopeUrls(value, baseUrl, origin) {
    if (/\\|(?:-webkit-)?image-set\s*\(/i.test(value)) return null;
    if (!/url\(/i.test(value)) return value;
    let denied = false;
    const result = value.replace(/"[^"]*"|'[^']*'|\/\*[\s\S]*?\*\/|url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi, (token, double, single, bare) => {
        if (bare === undefined && double === undefined && single === undefined) return token;
        const url = (double ?? single ?? bare).trim();
        if (url.startsWith('#')) return `url("${url}")`;
        try {
            const parsed = new URL(url, baseUrl);
            if (parsed.protocol === 'blob:' && parsed.origin !== origin) denied = true;
            if (!['data:', 'blob:'].includes(parsed.protocol) && (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol))) denied = true;
            // 不克隆同源 API URL；样式不能意外触发应用操作。
            if (parsed.pathname.startsWith('/api/')) denied = true;
            return `url("${parsed.href.replaceAll('"', '%22')}")`;
        } catch { denied = true; return ''; }
    });
    return denied ? null : result;
}

// 读到同层右括号为止。回退值可含函数、逗号和带括号的字符串。
function readVariable(value, start) {
    const tokens = /"[^"]*"|'[^']*'|\/\*[\s\S]*?\*\/|[(),]/g;
    tokens.lastIndex = start;
    let depth = 0, comma = -1, token;
    while ((token = tokens.exec(value))) {
        if (token[0] === '(') depth++;
        if (token[0] === ')' && depth-- === 0) {
            const name = value.slice(start, comma < 0 ? token.index : comma).replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
            if (!/^--[\w\u0080-\uFFFF-]+$/u.test(name)) return null;
            return { name, fallback: comma < 0 ? null : value.slice(comma + 1, token.index), end: tokens.lastIndex };
        }
        if (token[0] === ',' && !depth && comma < 0) comma = token.index;
    }
    return null;
}

function safeResourceValue(value, href, context, path, stringUrls = false) {
    const { origin, definitions, cloneBase } = context;
    // 原 var 声明会进入页内样式表；相对 URL 在原表和副本的基址下都不能落到 API。
    if (scopeUrls(value, href, origin) === null || (cloneBase !== href && scopeUrls(value, cloneBase, origin) === null)) return false;
    if (/attr\s*\(/i.test(value)) return false;
    // src()/image() 也能以字符串取地址，变量里单独出现的引号不能绕开 url 检查。
    stringUrls ||= /\b(?:src|image)\s*\(/i.test(value);
    const tokens = /"[^"]*"|'[^']*'|\/\*[\s\S]*?\*\/|\bvar\s*\(/gi;
    let token;
    while ((token = tokens.exec(value))) {
        if (!/^var/i.test(token[0])) {
            if (stringUrls && /^["']/.test(token[0])) {
                const url = 'url(' + token[0] + ')';
                if (scopeUrls(url, href, origin) === null || scopeUrls(url, cloneBase, origin) === null) return false;
            }
            continue;
        }
        const variable = readVariable(value, tokens.lastIndex);
        if (!variable || path.length >= 4 || path.includes(variable.name)) return false;
        const values = definitions?.(variable.name);
        if (!values?.length) return false;
        const next = [...path, variable.name];
        if (!values.every(def => safeResourceValue(def.value, def.href, context, next, stringUrls))) return false;
        if (variable.fallback !== null && !safeResourceValue(variable.fallback, href, context, next, stringUrls)) return false;
        tokens.lastIndex = variable.end;
    }
    return true;
}

export function scopeDeclarationValue(value, baseUrl, origin, property = '', definitions, cloneBase = baseUrl) {
    if (resourceProperty.test(property)) {
        if (/attr\s*\(/i.test(value)) return null;
        if (/var\s*\(/i.test(value)) {
            return safeResourceValue(value, baseUrl, { origin, definitions, cloneBase }, []) ? value : null;
        }
    }
    return scopeUrls(value, baseUrl, origin);
}

/** 遍历 CSSOM，递归保留媒体/支持条件与层；全局字体、动画和变量沿用宿主已有定义。 */
export function collectScopedCss(sheets, { baseUrl, origin, document } = {}) {
    const stats = { rules: 0, skippedSheets: 0, skippedDeclarations: 0 };
    const roots = Array.from(sheets);
    const definitions = new Map(), sheetRules = new Map();
    function record(style, href) {
        if (!style) return;
        for (let i = 0, count = style.length; i < count; i++) {
            const name = style[i];
            if (!name.startsWith('--')) continue;
            if (!definitions.has(name)) definitions.set(name, []);
            definitions.get(name).push({ value: style.getPropertyValue(name), href });
        }
    }
    function scanRules(rules, href) {
        for (const rule of rules) {
            record(rule.style, href);
            if (rule.type === 3 && rule.styleSheet) scanSheet(rule.styleSheet);
            if (rule.cssRules?.length) scanRules(rule.cssRules, href);
        }
    }
    function scanSheet(sheet) {
        if (sheetRules.has(sheet) || ownedStyles.has(sheet.ownerNode)) return;
        let rules;
        try { rules = sheet.cssRules; }
        catch (error) {
            if (error.name !== 'SecurityError') throw error;
            stats.skippedSheets++;
        }
        sheetRules.set(sheet, rules);
        if (rules) scanRules(rules, sheet.href || baseUrl);
    }
    roots.forEach(scanSheet);
    const chat = document?.getElementById('chat');
    record(chat?.style, baseUrl);
    // 计算值只按被引用的名字读取一次，同时保留所有选择器/条件下的原始定义。
    const computed = [document?.documentElement, chat].filter(Boolean).map(node => document.defaultView.getComputedStyle(node));
    const resolved = new Map();
    function lookup(name) {
        if (!resolved.has(name)) {
            const values = [...(definitions.get(name) ?? [])];
            for (const style of computed) {
                const value = style.getPropertyValue(name).trim();
                if (value) values.push({ value, href: baseUrl });
            }
            resolved.set(name, values);
        }
        return resolved.get(name);
    }
    const active = new Set();
    function declarations(style, href) {
        const result = [], shorthands = new Set();
        for (let i = 0; i < style.length; i++) {
            let name = style[i], raw = style.getPropertyValue(name);
            // Chrome 将含 var 的资源简写展开为空分项；同一条简写只检查和输出一次。
            if (!raw && /^(?:-webkit-)?(?:background|border-image|mask|list-style)-/.test(name)) {
                const shorthand = shorthandOf(style, name);
                if (shorthand && resourceProperty.test(shorthand)) {
                    if (shorthands.has(shorthand)) continue;
                    shorthands.add(shorthand);
                    name = shorthand;
                    raw = style.getPropertyValue(name);
                }
            }
            const value = scopeDeclarationValue(raw, href, origin, name, lookup, baseUrl);
            if (value === null) { stats.skippedDeclarations++; continue; }
            result.push(`${name}:${value}${style.getPropertyPriority(name) ? ' !important' : ''};`);
        }
        return result.join('');
    }
    function rulesText(rules, href, inside = false) {
        let text = '';
        for (const rule of rules) {
            if (rule.type === 1) {
                const selector = rewriteSelector(rule.selectorText, { keepUnmatched: inside });
                const nested = rule.cssRules?.length ? rulesText(rule.cssRules, href, inside || !!selector) : '';
                if (selector) { text += `${selector}{${declarations(rule.style, href)}${nested}}\n`; stats.rules++; }
                else if (nested) text += `${rule.selectorText}{${nested}}\n`;
            } else if (rule.type === 3 && rule.styleSheet) {
                let nested = sheetText(rule.styleSheet);
                if (rule.supportsText && nested) nested = `@supports (${rule.supportsText}){${nested}}`;
                if (rule.layerName != null && nested) nested = `@layer ${rule.layerName}{${nested}}`;
                text += nested;
            } else if (inside && rule.style && !rule.selectorText) {
                // CSSNestedDeclarations：嵌套 @media 内或嵌套选择器后的声明块。
                text += declarations(rule.style, href);
            } else if (rule.cssRules && /^@(media|supports|layer|container|scope)\b/.test(rule.cssText)) {
                const header = rule.cssText.slice(0, rule.cssText.indexOf('{')).trim();
                const scopedHeader = header.startsWith('@scope') ? rewriteSelector(header, { constrain: false }) : '';
                const nested = rulesText(rule.cssRules, href, inside || !!scopedHeader);
                if (nested) text += `${scopedHeader || header}{${nested}}\n`;
            }
        }
        return text;
    }
    function sheetText(sheet) {
        if (active.has(sheet) || sheet.disabled || ownedStyles.has(sheet.ownerNode)) return '';
        active.add(sheet);
        try {
            const text = rulesText(sheetRules.get(sheet) ?? [], sheet.href || baseUrl);
            const media = sheet.media?.mediaText;
            return text && media && media !== 'all' ? `@media ${media}{${text}}\n` : text;
        } finally { active.delete(sheet); }
    }
    return { cssText: roots.map(sheetText).join(''), ...stats };
}

/**
 * 创建可停止的观察器。start/stop 幂等；refresh 可用于 CSSOM insertRule 等不产生 DOM 变更的操作。
 * @param {{document?:Document,eventSource?:object,settingsEvent?:string,debounceMs?:number,styleId?:string}} options
 */
export function createCssScope({ document = globalThis.document, eventSource, settingsEvent, debounceMs = 50, styleId = 'stcr-scoped-css' } = {}) {
    let style, observer, timer, started = false;
    let stats = { rules: 0, skippedSheets: 0, skippedDeclarations: 0, inlineVariables: 0, revision: 0 };
    const refresh = () => {
        if (!started) return { ...stats };
        clearTimeout(timer); timer = undefined;
        const collected = collectScopedCss([...document.styleSheets, ...(document.adoptedStyleSheets ?? [])], { baseUrl: document.baseURI, origin: document.location.origin, document });
        // Ny 的字号/颜色变量直接写在 #chat 的 style 上，兄弟容器不会继承它们。
        // 读取已计算值放入自有规则；不写 #chat，也不覆盖 UI 的 style 属性。
        const chat = document.getElementById('chat'), variables = [];
        if (chat) {
            const computed = document.defaultView.getComputedStyle(chat);
            for (let i = 0; i < chat.style.length; i++) {
                const name = chat.style[i];
                if (!name.startsWith('--')) continue;
                const value = scopeDeclarationValue(computed.getPropertyValue(name), document.baseURI, document.location.origin);
                if (value !== null && value.trim()) variables.push(`${name}:${value} !important;`);
            }
        }
        if (variables.length) collected.cssText += `#stcr_chat:where(#stcr_root *){${variables.join('')}}\n`;
        // D12 的正文放在 UI 自己的翻页/滚动容器里，不能再套宿主的视口高度与滚动框。
        // 只解除这两项普通容器布局，正文、边框、字体等主题规则继续沿用。
        collected.cssText += '#stcr_root #stcr_chat{max-height:none;overflow:visible;}\n';
        const changed = style.textContent !== collected.cssText;
        if (changed) style.textContent = collected.cssText;
        if (!style.isConnected || style !== document.head.lastElementChild) document.head.append(style);
        const { cssText: _text, ...counts } = collected;
        stats = { ...counts, inlineVariables: variables.length, revision: stats.revision + (changed ? 1 : 0) };
        return { ...stats };
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, debounceMs); };
    const relevant = node => node.nodeType === 1 && !ownedStyles.has(node) && (node.matches('style,link[rel~="stylesheet"]') || node.querySelector('style,link[rel~="stylesheet"]'));
    const onLoad = event => { if (event.target.matches?.('link[rel~="stylesheet"]')) schedule(); };
    return {
        start() {
            if (started) return this;
            if (document.getElementById(styleId)) throw new Error(`已有 ${styleId}，不能覆盖其他样式`);
            started = true; style = document.createElement('style'); style.id = styleId; ownedStyles.add(style);
            document.head.append(style);
            observer = new document.defaultView.MutationObserver(records => {
                if (records.some(record => {
                    if (ownedStyles.has(record.target) || ownedStyles.has(record.target.parentNode)) return false;
                    if (record.type === 'attributes') return relevant(record.target) || record.target.id === 'chat';
                    if (record.type === 'characterData') return relevant(record.target.parentNode);
                    return record.target.matches?.('style') || [...record.addedNodes, ...record.removedNodes].some(relevant);
                })) schedule();
            });
            observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'rel', 'media', 'disabled', 'style'] });
            document.addEventListener('load', onLoad, true);
            if (eventSource && settingsEvent) eventSource.on(settingsEvent, schedule);
            refresh(); return this;
        },
        refresh,
        stop() {
            if (!started) return;
            started = false; clearTimeout(timer); observer.disconnect(); document.removeEventListener('load', onLoad, true);
            if (eventSource && settingsEvent) eventSource.removeListener(settingsEvent, schedule);
            style.remove();
        },
        get stats() { return { ...stats }; },
    };
}

let singleton;
/** 幂等启动默认 #stcr-scoped-css，并监听宿主主题设置事件。 */
export function startCssScope() {
    const context = globalThis.SillyTavern.getContext();
    singleton ??= createCssScope({ eventSource: context.eventSource, settingsEvent: context.event_types.SETTINGS_UPDATED });
    return singleton.start();
}
/** @returns {{rules:number,skippedSheets:number,skippedDeclarations:number,inlineVariables:number,revision:number}} */
export function refreshCssScope() { return startCssScope().refresh(); }
export function stopCssScope() { singleton?.stop(); }
