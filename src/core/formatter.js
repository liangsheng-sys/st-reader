// ST Reader — AGPL-3.0
import { loadHostRuntime } from './hostRuntime.js';
import { collectScripts, PLACEMENT, runDisplayRegex, substituteNames } from './regexPipeline.js';
import { isDevInstance } from './readonlyGuard.js';
import { cssDeclarations } from './cssDeclarations.js';

let runtime;
let markdown;
let optionKey;
/** 必须先 await 一次；失败可重试。后续 renderMessage 同步且不访问网络。 */
export async function initFormatter() { runtime = await loadHostRuntime(); }
const escapeHtml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function convertMarkdown(text, names) {
    const settings = runtime.getContext().powerUserSettings;
    if (settings.auto_fix_generated_markdown) text = runtime.power.fixMarkdown(text, true);
    const { extensions: _extensions, ...options } = runtime.script.converter.getOptions();
    const key = JSON.stringify(options);
    if (!markdown || optionKey !== key) {
        markdown = new runtime.libs.showdown.Converter({ ...options, extensions: [runtime.underscore.markdownUnderscoreExt()] });
        optionKey = key;
    }
    // 宿主的 exclusion 扩展会执行宏命令；这里只按目标聊天名字展开并逐行转义。
    const exclusions = substituteNames(settings.markdown_escape_strings ?? '', names).split(',').filter(Boolean);
    text = text.split('\n').map(line => exclusions.includes(line) ? line.replace(/([\\`*_{}\[\]()#+.!|>~-])/g, '\\$1') : line).join('\n');
    if (settings.encode_tags) text = text.replaceAll('<', '&lt;').replace(/(^|[^\n])>/g, '$1&gt;');
    for (const marker of [settings.reasoning?.prefix, settings.reasoning?.suffix]) {
        if (typeof marker === 'string' && marker.trim()) text = text.replace(marker, escapeHtml(marker));
    }
    // 保留代码、HTML 标签和 style 原文；对普通引号生成宿主主题可命中的 q。
    // T83：内联 <svg> 整块先换成占位符，Markdown 转完再放回——否则多行 SVG 里会被插进 <br>/<p>，HTML 解析器遇到它们会跳出 SVG，子元素全丢。
    const svgs = [];
    text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>|```[\s\S]*?```|~~~[\s\S]*?~~~|``[\s\S]*?``|`[^`]*`|<svg\b[\s\S]*?<\/svg\s*>|<[^>]*>|"[^"\n]*"|“[^”\n]*”|«[^»\n]*»|「[^」\n]*」|『[^』\n]*』|＂[^＂\n]*＂/gi,
        match => /^<svg\b/i.test(match) ? `${SVG_HOLE}${svgs.push(match) - 1}${SVG_HOLE}` : /^["“«「『＂]/u.test(match) ? `<q>${match}</q>` : match);
    const html = markdown.makeHtml(text.replaceAll('\\begin{align*}', '$$').replaceAll('\\end{align*}', '$$')).trim();
    return svgs.length ? html.replace(SVG_HOLES, (hole, index) => svgs[Number(index)] ?? hole) : html;
}
const SVG_HOLE = '\uE01F'; // 私用区字符：正文里几乎不会出现，Markdown 也不会动它
const SVG_HOLES = /\uE01F(\d+)\uE01F/g;

const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/gi;
/**
 * T73：样式里的 url() 逐个判断，不再整段删除。本地 data:image 一律保留；https 外链只在 ST 对这个角色允许"外部媒体"时保留
 * （与 ST 自己的显示一致）。其余（相对路径、http、javascript: 等）换成 none——不会请求同源路径。
 */
export function filterCssUrls(text, allowExternal) {
    return text.replace(CSS_URL, (match, double, single, bare) => {
        const value = (double ?? single ?? bare ?? '').trim();
        // #stcr-svg-*：同楼内联 SVG 里的渐变 / 裁剪 / 蒙版引用（T83，由 scopeInlineSvg 改名），只指向文档内元素，不请求任何东西
        return /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(value) || (allowExternal && /^https:\/\//i.test(value)) || SVG_REF.test(value) ? match : 'none';
    });
}
const SVG_REF = /^#stcr-svg-[\w.-]+$/;
const KEYFRAMES_PREFIX = 'stcr-kf-';
/** 浏览器规范化后的选择器列表按顶层逗号拆开（括号、方括号、引号里的逗号不算）。 */
function splitSelectors(text) {
    const parts = [];
    let depth = 0, quote = '', start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (c === ',' && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
    }
    parts.push(text.slice(start).trim());
    return parts;
}
/**
 * T75（I059）：楼内 <style> 逐条清洗，不再因一处可疑整段删除。用浏览器自己的 CSS 解析（未挂载的样式表不加载任何资源）后按规则重建：
 * 普通规则与 @media/@supports/@container/@layer 保留；@keyframes 保留并改名为 stcr-kf-*（同楼 animation 一起改，不覆盖 ST 自己的动画）；
 * @font-face、@import、@namespace、@page 等丢弃。每条声明：image-set() 丢弃；自定义属性（--*）里带反斜杠的丢弃
 * （它们原样保留转义，代入后可能拼出 url）；其余值已被浏览器规范化，url() 按 filterCssUrls 处理。
 * 给了 scope 时，顶层（含 @media 等里面）每条规则的每个选择器都必须以它开头，否则整条丢弃：ST 的 CSS 解析器与浏览器对畸形文本
 * 理解不同，ST 加过前缀的文本到了浏览器里仍可能读出一条不带前缀的规则。
 * @param {string} text
 * @param {boolean} allowExternal
 * @param {{scope?:string}} [options]
 * @returns {string} 清洗后的样式表文本；什么都不剩时为空串
 */
export function cleanStyleText(text, allowExternal, { scope = '' } = {}) {
    const sheet = new CSSStyleSheet();
    try { sheet.replaceSync(text); } catch { return ''; }
    const names = new Map();
    (function collect(rules) {
        for (const rule of rules) {
            if (rule instanceof CSSKeyframesRule) names.set(rule.name, CSS.escape(`${KEYFRAMES_PREFIX}${rule.name}`)); // 名字可能是带 } 的字符串，必须转义
            else if (rule.cssRules) collect(rule.cssRules);
        }
    })(sheet.cssRules);
    const rename = value => value.replace(/[\w-]+/g, word => names.get(word) ?? word);
    const body = style => {
        const all = cssDeclarations(style);
        const kept = all.filter(({ name, value }) => !/image-set\s*\(/i.test(value) && !(name.startsWith('--') && value.includes('\\')));
        // 一条没丢、也没有要改名的动画：用浏览器的规范化文本（保留简写，短得多）
        if (kept.length === all.length && !(names.size && all.some(({ name }) => name.startsWith('animation')))) return filterCssUrls(style.cssText, allowExternal);
        return kept.map(({ name, value, important }) => `${name}:${name.startsWith('animation') ? rename(filterCssUrls(value, allowExternal)) : filterCssUrls(value, allowExternal)}${important ? ' !important' : ''};`).join('');
    };
    const scoped = selector => !scope || splitSelectors(selector).every(part => part.startsWith(scope));
    const rebuild = (rules, nested = false) => [...rules].map(rule => {
        if (rule instanceof CSSStyleRule) {
            if (!nested && !scoped(rule.selectorText)) return '';
            return `${rule.selectorText}{${body(rule.style)}${rule.cssRules?.length ? rebuild(rule.cssRules, true) : ''}}`;
        }
        if (rule instanceof CSSKeyframesRule) return `@keyframes ${names.get(rule.name)}{${[...rule.cssRules].map(frame => `${frame.keyText}{${body(frame.style)}}`).join('')}}`;
        if (rule.constructor.name === 'CSSNestedDeclarations') return body(rule.style);
        if (rule instanceof CSSGroupingRule && /^@(media|supports|container|layer)\b/.test(rule.cssText)) return `${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${rebuild(rule.cssRules, nested)}}`;
        if (/^@layer\s+[\w\s,.-]+;$/.test(rule.cssText)) return rule.cssText;
        return '';
    }).join('\n');
    return rebuild(sheet.cssRules).trim();
}

/** 目标角色（不是宿主当前角色）是否允许外部媒体：沿用 ST 的全局开关与逐角色覆盖。 */
function externalMediaAllowed(names) {
    const power = runtime.getContext().powerUserSettings ?? {};
    const id = names?.character?.avatar ?? names?.groupId;
    if (id && power.external_media_allowed_overrides?.includes(id)) return true;
    if (id && power.external_media_forbidden_overrides?.includes(id)) return false;
    return !power.forbid_external_media;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 内容的短哈希（FNV-1a）：同一段 SVG 在几楼里出现，改出来的 id 也相同；内容一样，撞了也无妨。 */
function shortHash(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
    return (hash >>> 0).toString(36);
}
/**
 * T83：楼内联 SVG 的 id 与引用。id 一律改成 stcr-svg-<内容哈希>-<原 id>（不撞宿主 / 别楼的 id，也拦住按 id 绑定的宿主交互），
 * 属性和行内样式里的 url(#原 id) 跟着改；指向本块以外或外链的 url() 换成 none。<use> 只认本块里的 #id（清洗前已暂存为 data-stcr-use），
 * 其余 <use> 删掉——外部 use、其他 href / xlink:href 仍然不放行。<image> 的 href 永远被清掉、显示不出来，也删掉
 * （留着空壳，卡片截图库会拿空地址去取图，导出被离线闸门拦下）。
 */
function scopeInlineSvg(root) {
    for (const svg of root.querySelectorAll('svg')) {
        if (svg.namespaceURI !== SVG_NS || svg.parentElement?.closest('svg')) continue;
        for (const image of svg.querySelectorAll('image, feImage')) image.remove();
        const prefix = `stcr-svg-${shortHash(svg.outerHTML)}-`, ids = new Map(), all = [svg, ...svg.querySelectorAll('*')];
        for (const el of all) {
            const id = el.getAttribute('id');
            if (id === null) continue;
            if (/^[A-Za-z_][\w.-]*$/.test(id) && !ids.has(id)) { ids.set(id, prefix + id); el.setAttribute('id', prefix + id); } else el.removeAttribute('id');
        }
        const point = value => value.replace(CSS_URL, (match, double, single, bare) => {
            const target = (double ?? single ?? bare ?? '').trim();
            return target.startsWith('#') && ids.has(target.slice(1)) ? `url(#${ids.get(target.slice(1))})` : 'none';
        });
        for (const el of all) {
            for (const attribute of [...el.attributes]) if (/url\(/i.test(attribute.value)) el.setAttribute(attribute.name, point(attribute.value));
            if (el.localName !== 'use') continue;
            const ref = el.getAttribute('data-stcr-use');
            if (ref && ids.has(ref)) { el.setAttribute('href', `#${ids.get(ref)}`); el.removeAttribute('data-stcr-use'); } else el.remove();
        }
    }
}

const STYLE_SCOPE = '#stcr_chat .mes_text ';
/** 清洗并隔离文本内样式；只保留 data:image 与（ST 允许时的）https 图片，不请求同源路径。 */
function safeHtml(html, alreadySanitized = false, allowExternal = false) {
    const { DOMPurify, hljs } = runtime.libs;
    html = runtime.chats.encodeStyleTags(html);
    // T83：<use> 指向本块 #id 的 href 先暂存成 data-stcr-use（DOMPurify 按 FORBID_ATTR 会删掉 href），清洗后由 scopeInlineSvg 核对再放回
    html = html.replace(/<use\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi, tag => tag.replace(/\s(?:xlink:)?href\s*=\s*(["'])#([A-Za-z_][\w.-]*)\1/gi, ' data-stcr-use="$2"'));
    html = DOMPurify.sanitize(html, { MESSAGE_SANITIZE: !alreadySanitized, ADD_TAGS: ['custom-style', 'use'],
        FORBID_TAGS: ['iframe', 'object', 'embed', 'script', 'link', 'base', 'meta', 'form', 'input', 'button', 'audio', 'video', 'source'],
        FORBID_ATTR: ['src', 'srcset', 'href', 'poster', 'background', 'action', 'formaction', 'xlink:href'], RETURN_TRUSTED_TYPE: false });
    html = runtime.chats.decodeStyleTags(html, { prefix: STYLE_SCOPE });
    const template = document.createElement('template');
    template.innerHTML = html;
    scopeInlineSvg(template.content);
    for (const el of template.content.querySelectorAll('*')) {
        // image-set()/转义可能绕过 url 判断，@import 等会加载样式表：仍整段删除。url() 逐个判断（T73）。
        if (el.hasAttribute('style')) {
            if (/image-set\s*\(|@import|\\/i.test(el.getAttribute('style'))) el.removeAttribute('style');
            else el.setAttribute('style', filterCssUrls(el.getAttribute('style'), allowExternal));
        }
        if (el.tagName === 'STYLE') {
            const css = cleanStyleText(el.textContent, allowExternal, { scope: STYLE_SCOPE }); // T75：逐条清洗，不再整段删除
            if (css) el.textContent = css; else el.remove();
        }
        if (el.tagName === 'A') {
            const href = el.getAttribute('href');
            if (href && !href.startsWith('#')) el.removeAttribute('href');
        }
        // 拦住宿主按 id/mesid/data-* 绑定的交互；原始 HTML 只负责展示。
        // 内联 SVG 里的 id 已由 scopeInlineSvg 改成 stcr-svg-* 前缀（渐变等靠它），其余一律删
        if (el.namespaceURI !== SVG_NS) el.removeAttribute('id');
        el.removeAttribute('mesid'); el.removeAttribute('contenteditable');
        for (const attribute of [...el.attributes]) if (attribute.name.startsWith('data-')) el.removeAttribute(attribute.name);
    }
    for (const block of template.content.querySelectorAll('pre code')) {
        const language = [...block.classList].map(name => name.replace(/^custom-/, '')).find(name => name.startsWith('language-'))?.slice(9);
        if (language && hljs.getLanguage(language)) {
            block.innerHTML = hljs.highlight(block.textContent, { language, ignoreIllegals: true }).value;
            block.classList.add('hljs', `language-${language}`);
        } else block.classList.add('hljs');
    }
    return template.innerHTML;
}

/** 仅供策略实证：A 临时禁用宿主正则，finally 原位恢复；-1 避免首楼写回。 */
export function formatWithStrategy(text, model, names, { strategy = 'b', reasoning = false } = {}) {
    if (!runtime) throw new Error('请先 await initFormatter()');
    if (strategy !== 'a' && strategy !== 'b') throw new RangeError('未知格式化策略');
    if (strategy === 'a') {
        if (!isDevInstance(globalThis.location)) throw new Error('策略 a 仅供隔离开发实例实证');
        const power = runtime.getContext().powerUserSettings;
        if ([power.user_prompt_bias, power.markdown_escape_strings].some(value => typeof value === 'string' && value.includes('{{'))) {
            throw new Error('策略 a 不执行可能带副作用的宿主设置宏；请使用生产策略 b');
        }
        const settings = runtime.getContext().extensionSettings;
        const previous = settings.disabledExtensions;
        const backup = previous ? [...previous] : null;
        try {
            if (!previous) settings.disabledExtensions = ['regex'];
            else if (!previous.includes('regex')) previous.push('regex');
            // 仅合成测试调用 A；生产 renderMessage 固定使用 B。
            return safeHtml(runtime.getContext().messageFormatting(text, names.characterName, model.isSystem, model.isUser, -1, {}, reasoning), true);
        } finally {
            if (backup) previous.splice(0, previous.length, ...backup);
            else delete settings.disabledExtensions;
        }
    }
    // B 不运行宿主宏解释器，不更改任何宿主设置或当前聊天。
    const settings = runtime.getContext().powerUserSettings;
    const bias = substituteNames(settings.user_prompt_bias ?? '', names);
    if (!model.isUser && !model.isSystem && !settings.show_user_prompt_bias && bias && text.startsWith(bias)) text = text.slice(bias.length);
    if (!settings.allow_name2_display && !model.isUser && names.characterName) {
        text = text.split('\n').map(line => line.startsWith(`${names.characterName}:`) ? line.slice(names.characterName.length + 1) : line).join('\n');
    }
    return safeHtml(convertMarkdown(text, names), false, externalMediaAllowed(names));
}

/**
 * 渲染一个指定候选；不改变 ST 的当前候选，也不缓存处理后的正文供下次重复执行。
 * @param {object} handle openChat 返回值
 * @param {number} index 零基楼层号
 * @param {number} [swipeIndex] 默认楼层的 ST 当前候选
 * @returns {{html:string,displayText:string,reasoningHtml:string,model:object,swipeIndex:number}}
 */
export function renderMessage(handle, index, swipeIndex) {
    if (!runtime) throw new Error('请先 await initFormatter()');
    const model = handle.getMessage(index);
    const selected = swipeIndex ?? model.swipeId;
    if (!Number.isInteger(selected) || !model.swipes[selected]) throw new RangeError('候选编号越界');
    const names = handle.getRegexContext(index);
    const settings = runtime.getContext().extensionSettings;
    const preset = runtime.regex.getScriptsByType(runtime.regex.SCRIPT_TYPES.PRESET, { allowedOnly: true });
    const scripts = collectScripts(settings, names.character, preset);
    const run = (text, reasoning) => runDisplayRegex(text, { ...names, scripts,
        placement: reasoning ? PLACEMENT.REASONING : model.isUser ? PLACEMENT.USER : model.isNarrator ? PLACEMENT.NARRATOR : PLACEMENT.AI }, runtime.regex.runRegexScript);
    const swipe = model.swipes[selected];
    // T75：displayText = 显示正则之后、Markdown 之前的正文；裸 HTML 要在它上面识别（正则会改写 / 产出 HTML，I057/I058）
    const displayText = run(swipe.text, false);
    return Object.freeze({ html: formatWithStrategy(displayText, model, names), displayText,
        reasoningHtml: swipe.reasoning ? formatWithStrategy(run(swipe.reasoning, true), model, names, { reasoning: true }) : '', model, swipeIndex: selected });
}
