// ST Reader — AGPL-3.0
import { CARD_ICONS } from './cardTransforms.js';
import { rasterizeCardIcon } from './cardFonts.js';

const forbiddenTags = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'BASE', 'META', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'AUDIO', 'VIDEO', 'SOURCE']);
const resourceValue = /url\s*\(|image-set\s*\(|@import|\\/i;

function safeDeclaration(style) {
    return [...style].filter(name => !resourceValue.test(style.getPropertyValue(name)) && !name.startsWith('animation') && !name.startsWith('transition'))
        .map(name => `${name}:${style.getPropertyValue(name)}${style.getPropertyPriority(name) ? '!important' : ''};`).join('');
}
/** 原样式表只读扫描；不复制字体下载、远端图片或 @import。 */
function safeRules(rules) {
    return [...rules].map(rule => {
        if (rule.type === 5 || rule.type === 3) return '';
        if (rule.selectorText) return `${rule.selectorText}{${safeDeclaration(rule.style)}${rule.cssRules ? safeRules(rule.cssRules) : ''}}`;
        if (rule.constructor.name === 'CSSNestedDeclarations') return safeDeclaration(rule.style);
        if (rule.cssRules && /^@(media|supports|layer|container|scope)\b/.test(rule.cssText)) return `${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${safeRules(rule.cssRules)}}`;
        if (/^@layer\s+[^{}]+;$/.test(rule.cssText)) return rule.cssText;
        return '';
    }).join('\n');
}

function loadedImage(source) {
    if (source.tagName === 'CANVAS') return source.toDataURL('image/png');
    if (!source.complete || !source.naturalWidth) throw new Error('卡片图片尚未加载，导出不会联网补取');
    const canvas = source.ownerDocument.createElement('canvas');
    canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
    canvas.getContext('2d').drawImage(source, 0, 0);
    try { return canvas.toDataURL('image/png'); } catch { throw new Error('卡片图片不允许本地读取；请先导入阅读器素材库'); }
}

function copyAttributes(source, target) {
    for (const attribute of source.attributes) {
        const name = attribute.name;
        if (/^(on|data-)/i.test(name) || /^(src|srcset|href|poster|background|action|formaction|xlink:href|title|alt|aria-label|aria-description|value|contenteditable)$/i.test(name)) continue;
        if (name === 'style') { target.style.cssText = safeDeclaration(source.style); continue; }
        target.setAttribute(name, attribute.value);
    }
    // 这些标志只含布尔值或经过白名单验证的图标标识，不含原词。
    for (const key of ['stcrProtected', 'stcrMask', 'stcrIcon']) if (source.dataset?.[key]) target.dataset[key] = source.dataset[key];
}

/** 在禁网、禁脚本的 srcdoc 中排版副本。宿主 DOM 不插入任何聊天/名字/样式副本。 */
export async function createCardSnapshot(root, fontCss, { width } = {}) {
    if (!root?.isConnected || root.ownerDocument !== document) throw new TypeError('请先把卡片预览放到当前页面，再导出');
    const rect = root.getBoundingClientRect();
    width ??= rect.width;
    if (!Number.isFinite(width) || width <= 0 || width > 8192) throw new RangeError('卡片宽度须大于 0 且不超过 8192 像素');
    const frame = document.createElement('iframe');
    frame.dataset.stcrExportFrame = '1'; frame.setAttribute('aria-hidden', 'true'); frame.setAttribute('sandbox', 'allow-same-origin');
    frame.style.cssText = `position:fixed;left:-30000px;top:0;width:${Math.ceil(width)}px;height:2000px;border:0;pointer-events:none;`;
    let loadTimer;
    const loaded = new Promise((resolve, reject) => {
        loadTimer = setTimeout(() => reject(new Error('隔离导出文档加载超时')), 10000);
        frame.onload = resolve; frame.onerror = () => reject(new Error('无法建立隔离导出文档'));
    });
    frame.srcdoc = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; frame-src \'self\';"><body></body>';
    document.body.append(frame);
    try {
        await loaded; clearTimeout(loadTimer);
        const doc = frame.contentDocument, nodeMap = new Map();
        doc.documentElement.className = document.documentElement.className; doc.body.className = document.body.className;
        const style = doc.createElement('style');
        style.textContent = [...document.styleSheets, ...document.adoptedStyleSheets].map(sheet => {
            if (sheet.disabled) return '';
            try { const rules = safeRules(sheet.cssRules); return sheet.media?.mediaText ? `@media ${sheet.media.mediaText}{${rules}}` : rules; }
            catch { return ''; }
        }).join('\n') + '\n' + fontCss;
        doc.head.append(style);
        const bodyStyle = getComputedStyle(document.body);
        for (const key of bodyStyle) if (key.startsWith('--') || /^(font|line-height|letter-spacing|color|text-)/.test(key)) {
            const value = bodyStyle.getPropertyValue(key); if (!resourceValue.test(value)) doc.body.style.setProperty(key, value);
        }
        doc.body.style.cssText += `;position:static!important;margin:0!important;padding:0!important;width:${width}px!important;height:auto!important;min-height:0!important;overflow:visible!important;`;
        const ancestors = []; for (let parent = root.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) ancestors.unshift(parent);
        let container = doc.body;
        for (const ancestor of ancestors) {
            const shell = doc.createElement('div'); copyAttributes(ancestor, shell);
            shell.style.cssText += `;position:static!important;transform:none!important;display:block!important;margin:0!important;padding:0!important;width:${width}px!important;height:auto!important;max-height:none!important;overflow:visible!important;`;
            container.append(shell); container = shell;
        }
        function clone(source) {
            if (source.nodeType === 3) return doc.createTextNode(source.data);
            if (source.nodeType !== 1 || forbiddenTags.has(source.tagName) || source.hasAttribute('data-stcr-export-ignore')) return null;
            if (source.tagName === 'STYLE') {
                const target = doc.createElement('style');
                // 消息的清洗样式只含纯展示规则；禁掉可能请求资源的文本。
                if (!resourceValue.test(source.textContent)) target.textContent = source.textContent;
                return target;
            }
            if (source.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new Error('请先把内联 SVG 作为已清洗素材导入，再放入卡片');
            const target = doc.createElement(source.tagName === 'CANVAS' ? 'img' : source.localName);
            copyAttributes(source, target); nodeMap.set(source, target);
            if (source.tagName === 'IMG' || source.tagName === 'CANVAS') { target.src = loadedImage(source); target.alt = ''; }
            else for (const child of source.childNodes) { const copy = clone(child); if (copy) target.append(copy); }
            return target;
        }
        const copy = clone(root);
        copy.style.cssText += `;position:relative!important;inset:auto!important;transform:none!important;margin:0!important;box-sizing:border-box!important;width:${width}px!important;max-height:none!important;overflow:visible!important;`;
        container.append(copy);
        return { frame, doc, copy, nodeMap, width, destroy: () => frame.remove() };
    } catch (error) { clearTimeout(loadTimer); frame.remove(); throw error; }
}

/** 在副本内去掉源属性，避免 attr() 伪元素显示原名字；图标用宿主已加载字体离线栅格化。 */
export async function finishCardSnapshot(snapshot) {
    const { copy, doc } = snapshot;
    for (const element of [copy, ...copy.querySelectorAll('*')]) {
        for (const name of element.getAttributeNames()) if (/^(title|aria-|data-|alt|value)/.test(name) && !['data-stcr-icon', 'data-stcr-mask', 'data-stcr-protected'].includes(name)) element.removeAttribute(name);
    }
    for (const icon of copy.querySelectorAll('[data-stcr-icon]')) {
        const glyph = CARD_ICONS[icon.dataset.stcrIcon]; if (!glyph) throw new TypeError('未知的图标');
        const style = doc.defaultView.getComputedStyle(icon), image = doc.createElement('img');
        image.src = rasterizeCardIcon(glyph, style.color); image.alt = '';
        image.style.cssText = 'width:1em!important;height:1em!important;display:inline-block!important;vertical-align:-.1em!important;';
        icon.replaceWith(image);
    }
    copy.getBoundingClientRect();
    let fontTimer;
    try {
        await Promise.race([
            Promise.all([...doc.fonts].map(face => face.load())).then(() => doc.fonts.ready),
            new Promise((_, reject) => { fontTimer = setTimeout(() => reject(new Error('本地字体解码超时')), 15000); }),
        ]);
    } finally { clearTimeout(fontTimer); }
    await Promise.all([...copy.querySelectorAll('img')].map(image => image.decode()));
    // 图片解码与字体就绪后再次布局，避免截断最后一行。
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = copy.getBoundingClientRect();
    snapshot.height = Math.ceil(Math.max(rect.height, copy.scrollHeight));
    if (!snapshot.height || snapshot.height > 16384) throw new RangeError('卡片高度须在 1–16384 像素内，请减少选段');
}
