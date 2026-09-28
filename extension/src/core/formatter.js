import { loadHostRuntime } from './hostRuntime.js';
import { collectScripts, PLACEMENT, runDisplayRegex, substituteNames } from './regexPipeline.js';
import { isDevInstance } from './readonlyGuard.js';

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
    text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>|```[\s\S]*?```|~~~[\s\S]*?~~~|``[\s\S]*?``|`[^`]*`|<[^>]*>|"[^"\n]*"|“[^”\n]*”|«[^»\n]*»|「[^」\n]*」|『[^』\n]*』|＂[^＂\n]*＂/g,
        match => /^["“«「『＂]/u.test(match) ? `<q>${match}</q>` : match);
    return markdown.makeHtml(text.replaceAll('\\begin{align*}', '$$').replaceAll('\\end{align*}', '$$')).trim();
}

/** 清洗并隔离文本内样式；任何资源 URL 都不触发额外网络请求。 */
function safeHtml(html, alreadySanitized = false) {
    const { DOMPurify, hljs } = runtime.libs;
    html = runtime.chats.encodeStyleTags(html);
    html = DOMPurify.sanitize(html, { MESSAGE_SANITIZE: !alreadySanitized, ADD_TAGS: ['custom-style'],
        FORBID_TAGS: ['iframe', 'object', 'embed', 'script', 'link', 'base', 'meta', 'form', 'input', 'button', 'audio', 'video', 'source'],
        FORBID_ATTR: ['src', 'srcset', 'href', 'poster', 'background', 'action', 'formaction', 'xlink:href'], RETURN_TRUSTED_TYPE: false });
    html = runtime.chats.decodeStyleTags(html, { prefix: '#stcr_chat .mes_text ' });
    const template = document.createElement('template');
    template.innerHTML = html;
    for (const el of template.content.querySelectorAll('*')) {
        // style 中的 url()/image-set()/转义可能加载远端或调用同源写路径；保守删除该声明/样式。
        if (el.hasAttribute('style') && /url\s*\(|image-set\s*\(|@import|\\/i.test(el.getAttribute('style'))) el.removeAttribute('style');
        if (el.tagName === 'STYLE' && /url\s*\(|image-set\s*\(|@(?!media\b|supports\b)[a-z-]+|\\/i.test(el.textContent)) el.remove();
        if (el.tagName === 'A') {
            const href = el.getAttribute('href');
            if (href && !href.startsWith('#')) el.removeAttribute('href');
        }
        // 拦住宿主按 id/mesid/data-* 绑定的交互；原始 HTML 只负责展示。
        el.removeAttribute('id'); el.removeAttribute('mesid'); el.removeAttribute('contenteditable');
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
    return safeHtml(convertMarkdown(text, names));
}

/**
 * 渲染一个指定候选；不改变 ST 的当前候选，也不缓存处理后的正文供下次重复执行。
 * @param {object} handle openChat 返回值
 * @param {number} index 零基楼层号
 * @param {number} [swipeIndex] 默认楼层的 ST 当前候选
 * @returns {{html:string,reasoningHtml:string,model:object,swipeIndex:number}}
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
    return Object.freeze({ html: formatWithStrategy(run(swipe.text, false), model, names),
        reasoningHtml: swipe.reasoning ? formatWithStrategy(run(swipe.reasoning, true), model, names, { reasoning: true }) : '', model, swipeIndex: selected });
}
