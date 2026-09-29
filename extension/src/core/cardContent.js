import { initFormatter, formatWithStrategy } from './formatter.js';
import { loadHostRuntime } from './hostRuntime.js';
import { collectScripts, runDisplayRegex, PLACEMENT } from './regexPipeline.js';
import { replaceNamesInRaw, maskText, CARD_ICONS } from './cardTransforms.js';
import { normalizeAssetImage, sanitizeSvg } from './assetCodec.js';

const sources = new WeakMap();
const skipped = 'style,script,template,button,textarea,[data-stcr-protected],[data-stcr-mask]';

/** 仅记在 WeakMap；不把原文、聊天标识、规则或名字写进 DOM 属性。 */
export function bindCardSource(element, handle, index, swipeIndex) {
    if (!element?.querySelector) throw new TypeError('卡片楼层须为 Element');
    const model = handle.getMessage(index), selected = swipeIndex ?? model.swipeId;
    if (!Number.isInteger(selected) || !model.swipes[selected]) throw new RangeError('候选编号越界');
    sources.set(element, { handle, index, swipeIndex: selected });
    return element;
}
export const getCardSource = element => sources.get(element);

/** 对传入素材重新校验；不信任调用方绕过 store 传入的任意 src。 */
export async function prepareCardAssets(assets = []) {
    const result = new Map();
    for (const item of assets) {
        if (!item?.id || result.has(item.id)) throw new TypeError('卡片素材 ID 无效或重复');
        result.set(item.id, await normalizeAssetImage(item));
    }
    return result;
}

function picture(doc, id, assets) {
    const asset = assets.get(id);
    if (!asset) throw new Error(`找不到替换图片：${id}`);
    if (typeof asset.dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.dataUrl)) throw new TypeError('卡片图片必须是本地 data URL');
    let url = asset.dataUrl;
    if (url.startsWith('data:image/svg+xml')) {
        // DOM 纯适配器也不允许任意 SVG 偷渡资源；处理的是内存副本。
        const xml = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(url.split(',')[1]), char => char.charCodeAt(0)));
        const bytes = new TextEncoder().encode(sanitizeSvg(xml)); let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        url = `data:image/svg+xml;base64,${btoa(binary)}`;
    }
    const image = doc.createElement('img'); image.src = url; image.alt = '';
    image.style.cssText = 'height:1em!important;width:1em!important;object-fit:contain!important;vertical-align:-.12em!important;display:inline-block!important;';
    return image;
}
function icon(doc, value) {
    const element = doc.createElement('span'); element.className = `fa-solid ${value}`;
    element.dataset.stcrIcon = value;
    element.setAttribute('aria-hidden', 'true');
    return element;
}
function replacement(doc, to, assets) {
    const span = doc.createElement('span'); span.dataset.stcrProtected = '1'; span.className = 'stcr-replacement';
    if (to.kind === 'text') span.textContent = to.value;
    else span.append(to.kind === 'asset' ? picture(doc, to.value, assets) : icon(doc, to.value));
    return span;
}

function fragments(doc, segments, assets) {
    const result = doc.createDocumentFragment();
    for (const segment of segments) result.append(segment.kind === 'text' ? doc.createTextNode(segment.text) : replacement(doc, segment.to, assets));
    return result;
}

/** 用不透明占位符把替换片段从原文中取走；只在格式化后的文本节点恢复，不拼成 HTML。 */
function protectSegments(segments) {
    const prefix = `STCR${crypto.randomUUID().replaceAll('-', '')}TOKEN`;
    const tokens = [];
    const text = segments.map(segment => {
        if (segment.kind === 'text') return segment.text;
        const token = `${prefix}${tokens.length}END`;
        tokens.push({ token, to: segment.to }); return token;
    }).join('');
    return { text, tokens };
}
function restoreTokens(container, tokens, assets) {
    const doc = container.ownerDocument;
    for (const { token, to } of tokens) {
        const walker = doc.createTreeWalker(container, 4), matches = [];
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.parentElement?.closest('style,script')) continue;
            if (node.data.includes(token)) matches.push(node);
        }
        if (!matches.length) throw new Error('显示正则移除或拆散了替换占位符；请调整该规则后重试，导出已停止');
        for (const node of matches) {
            const parts = node.data.split(token), fragment = doc.createDocumentFragment();
            parts.forEach((text, index) => { if (index) fragment.append(replacement(doc, to, assets)); fragment.append(doc.createTextNode(text)); });
            node.replaceWith(fragment);
        }
        // 不允许通过正则把占位符藏在 HTML 属性或 style 里。
        if (container.innerHTML.includes(token)) throw new Error('显示正则将名字放进非文本位置；请调整规则后重试');
    }
}

/** 内部渲染：所有变换仅作用于 getMessage 返回的候选副本。 */
export async function renderCardParts(source, options, doc = document) {
    await initFormatter();
    const runtime = await loadHostRuntime();
    const { handle, index, swipeIndex } = source;
    const model = handle.getMessage(index), swipe = model.swipes[swipeIndex], names = handle.getRegexContext(index);
    const settings = runtime.getContext().extensionSettings;
    const preset = runtime.regex.getScriptsByType(runtime.regex.SCRIPT_TYPES.PRESET, { allowedOnly: true });
    const scripts = collectScripts(settings, names.character, preset);
    const transform = { ...options, ...names, isGroup: handle.isGroup, avatarUrl: names.character?.avatar };
    const assets = options.assetMap ?? await prepareCardAssets(options.assets);
    const mappings = [];
    const raw = (text, record = true) => {
        const result = replaceNamesInRaw(text, transform); if (record) mappings.push(...result.mappings); return result.segments;
    };
    const render = (text, reasoning) => {
        const protectedText = protectSegments(raw(text));
        // replacement 中的名字宏也走同一保护协议，防止脚本重新写入真实名字。
        const macroResults = [];
        const safeMacro = value => {
            const result = replaceNamesInRaw(value, transform);
            const extra = protectSegments(result.segments);
            macroResults.push({ ...extra, mappings: result.mappings });
            protectedText.tokens.push(...extra.tokens); return extra.text;
        };
        const macroUser = safeMacro(names.userName), macroChar = safeMacro(names.characterName);
        const usedScripts = scripts.map(script => ({ ...script,
            replaceString: String(script.replaceString ?? '').replace(/{{\s*user\s*}}/gi, macroUser).replace(/{{\s*char\s*}}/gi, macroChar),
        }));
        const filtered = runDisplayRegex(protectedText.text, { ...names, scripts: usedScripts,
            placement: reasoning ? PLACEMENT.REASONING : model.isUser ? PLACEMENT.USER : model.isNarrator ? PLACEMENT.NARRATOR : PLACEMENT.AI }, runtime.regex.runRegexScript);
        const container = doc.createElement('div');
        container.innerHTML = formatWithStrategy(filtered, model, names, { reasoning });
        for (const macro of macroResults) {
            const count = macro.tokens.reduce((sum, item) => sum + container.innerHTML.split(item.token).length - 1, 0);
            if (count) mappings.push(...macro.mappings.map(item => ({ ...item, count: item.count * count,
                ...(item.skippedRules ? { skippedRules: item.skippedRules.map(rule => ({ ...rule, count: rule.count * count })) } : {}) })));
        }
        // 脚本宏未命中时，其占位符不会出现；原文中的占位符必须完整保留。
        const tokens = protectedText.tokens.filter(item => protectedText.text.includes(item.token) || container.innerHTML.includes(item.token));
        restoreTokens(container, tokens, assets);
        return container;
    };
    const body = render(swipe.text, false), reasoning = swipe.reasoning ? render(swipe.reasoning, true) : doc.createElement('div');
    const name = doc.createElement('span'); name.append(fragments(doc, raw(model.name), assets));
    const actualMappings = [];
    for (const item of mappings) {
        const found = actualMappings.find(other => other.from === item.from && other.source === item.source && other.to.kind === item.to.kind && other.to.value === item.to.value);
        if (found) {
            found.count += item.count;
            if (item.skippedOverlap) {
                found.skippedOverlap = true; found.skippedRules ??= [];
                for (const skipped of item.skippedRules) {
                    const prior = found.skippedRules.find(rule => rule.from === skipped.from && rule.to.kind === skipped.to.kind && rule.to.value === skipped.to.value);
                    if (prior) prior.count += skipped.count; else found.skippedRules.push({ ...skipped });
                }
            }
        } else actualMappings.push({ ...item, ...(item.skippedRules ? { skippedRules: item.skippedRules.map(rule => ({ ...rule })) } : {}) });
    }
    return { body, reasoning, name, mappings: actualMappings, model, swipeIndex };
}

/**
 * 创建可放入任意模板的卡片楼层；导出时仍从绑定的原始候选重新执行一遍管线。
 * @returns {Promise<{element:HTMLElement,mappings:object[]}>}
 */
export async function createCardMessage(handle, index, { swipeIndex, ...options } = {}) {
    const element = document.createElement('div'); element.className = 'mes stcr-card-message';
    bindCardSource(element, handle, index, swipeIndex);
    const result = await renderCardParts(getCardSource(element), options);
    element.innerHTML = '<div class="mes_block"><div class="ch_name"><span class="name_text"></span></div><div class="mes_text"></div><div class="mes_reasoning"></div></div>';
    applyCardParts(element, result);
    return { element, mappings: result.mappings };
}

export function applyCardParts(element, result) {
    const body = element.querySelector('.mes_text');
    if (!body) throw new Error('已绑定楼层缺少 .mes_text');
    body.replaceChildren(...result.body.childNodes);
    element.querySelector('.name_text')?.replaceChildren(...result.name.childNodes);
    element.querySelector('.mes_reasoning')?.replaceChildren(...result.reasoning.childNodes);
}

function maskElement(doc, segment, assets) {
    const span = doc.createElement('span'), style = segment.style;
    span.className = `stcr-mask stcr-mask--${style.kind}`; span.dataset.stcrMask = '1';
    span.setAttribute('aria-label', '已屏蔽');
    span.style.cssText = `display:inline-block!important;width:${segment.width}em!important;height:.8em!important;vertical-align:-.05em!important;overflow:hidden!important;opacity:1!important;filter:none!important;text-shadow:none!important;box-shadow:none!important;border:0!important;`;
    if (style.kind === 'sticker') {
        span.style.setProperty('height', '1em', 'important');
        span.style.setProperty('color', style.color, 'important');
        for (let i = 0; i < 3; i++) span.append(style.assetId ? picture(doc, style.assetId, assets) : icon(doc, style.icon));
    } else {
        span.style.setProperty('background', style.color, 'important');
        if (style.kind === 'block') span.style.setProperty('border-radius', '.3em', 'important');
    }
    return span;
}

/** 文本节点适配器：复制输入树；跨 em/strong 等内联节点命中，绝不改属性或 style 文本。 */
export function wrapMaskSpans(root, words = [], style = 'bar', assets = new Map()) {
    const copy = root.cloneNode(true);
    maskTextNodesInPlace(copy, words, style, assets);
    return copy;
}

export function maskTextNodesInPlace(root, words, style, assets) {
    const doc = root.ownerDocument, runs = []; let current = [];
    const flush = () => { if (current.length) runs.push(current); current = []; };
    const block = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DIV|DL|DT|FIGCAPTION|FIGURE|FOOTER|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TD|TH|TR|UL)$/;
    function visit(node) {
        if (node.nodeType === 3) { current.push(node); return; }
        if (node.nodeType !== 1) return;
        if (node.matches(skipped)) { flush(); return; }
        if (block.test(node.tagName)) flush();
        for (const child of node.childNodes) visit(child);
        if (block.test(node.tagName)) flush();
    }
    visit(root); flush();
    for (const nodes of runs) {
        const offsets = []; let text = '';
        for (const node of nodes) { offsets.push({ node, start: text.length, end: text.length + node.length }); text += node.data; }
        const matches = maskText(text, words, style).filter(segment => segment.kind === 'mask');
        for (const segment of matches.reverse()) {
            const start = offsets.find(item => item.start <= segment.start && item.end > segment.start);
            const end = offsets.find(item => item.start < segment.end && item.end >= segment.end);
            const range = doc.createRange();
            range.setStart(start.node, segment.start - start.start); range.setEnd(end.node, segment.end - end.start);
            range.deleteContents(); range.insertNode(maskElement(doc, segment, assets));
        }
    }
}

export { CARD_ICONS };
