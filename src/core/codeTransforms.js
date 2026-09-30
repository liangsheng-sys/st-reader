// ST Reader — AGPL-3.0
import { maskText, replaceNamesInRaw } from './cardTransforms.js';

const textIcons = Object.freeze({ 'fa-star': '★', 'fa-heart': '♥', 'fa-cat': '🐈', 'fa-cloud': '☁', 'fa-moon': '☾', 'fa-shield': '🛡' });

/** 纯文本出口：替换优先且不串换；遮盖删除原词，返回方块，不把 HTML 写进字符串。 */
export function maskCodeText(text, options = {}) {
    // 即使没有普通片段，也要验证词表，避免无效选项被替换命中掩盖。
    maskText('', options.maskWords ?? [], options.maskStyle);
    return replaceNamesInRaw(text, options).segments.map(segment => {
        if (segment.kind === 'replacement') {
            const { kind, value } = segment.to;
            return kind === 'text' ? value : kind === 'icon' ? textIcons[value] : '[图片]';
        }
        return maskText(segment.text, options.maskWords ?? [], options.maskStyle)
            .map(part => part.kind === 'text' ? part.text : '█'.repeat(part.width)).join('');
    }).join('');
}

/**
 * 在禁脚本、禁网的解析环境中使用 DOMParser；用户 HTML 从不挂进任何活动文档。
 * 只写 Text.data，跳过 script/style（包括 SVG），保留标签、属性与模板结构。
 * 返回规范化的完整 HTML 文档字符串；这不是清洗器，渲染方仍须使用沙箱。
 * @returns {Promise<string>}
 */
export async function maskHtmlString(html, options = {}) {
    if (typeof html !== 'string') throw new TypeError('HTML 必须为字符串');
    maskCodeText('', options);
    if (!globalThis.document?.body) throw new Error('HTML 脱敏需要浏览器 DOMParser 环境');
    const frame = document.createElement('iframe');
    frame.dataset.stcrParseFrame = '1'; frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('aria-hidden', 'true'); frame.style.display = 'none';
    let timer;
    const loaded = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('HTML 脱敏解析环境加载超时')), 10000);
        frame.onload = resolve; frame.onerror = () => reject(new Error('HTML 脱敏解析环境加载失败'));
    });
    // DOMParser 也会检查内联样式。允许保留它们，不开放 CSS 外链、图片、字体或脚本。
    frame.srcdoc = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\';"><body></body>';
    try {
        document.body.append(frame);
        await loaded;
        // 解析文档继承这个 realm 的 CSP；不用宿主页的 DOMParser，以免资源在解析时请求外链。
        const realm = frame.contentWindow, doc = new realm.DOMParser().parseFromString(html, 'text/html');
        function visit(node) {
            if (node.nodeType === 3) { node.data = maskCodeText(node.data, options); return; }
            if (['script', 'style'].includes(node.localName?.toLowerCase())) return;
            for (const child of node.childNodes) visit(child);
            if (node.localName === 'template' && node.content) visit(node.content);
        }
        visit(doc);
        const serializer = new realm.XMLSerializer();
        return [...doc.childNodes].map(node => node.nodeType === 1 ? node.outerHTML : serializer.serializeToString(node)).join('');
    } finally { clearTimeout(timer); frame.remove(); }
}
