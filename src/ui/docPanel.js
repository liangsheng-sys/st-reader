// ST Reader — AGPL-3.0
// 阅读器里的"文档面板"（T54b 本次更新了什么、T55 使用说明共用）：叠在正文上的一张纸，标题 + 正文 + 底栏。
// Markdown 用 ST 自带的 showdown 转 HTML、DOMPurify 清洗；不加载图片、不嵌入任何外部内容。

import { h, iconButton } from './dom.js';

/** Markdown → 清洗过的 HTML。链接一律新窗口打开，图片 / 媒体 / 脚本不留（文档里本来就不该有）。 */
export function renderMarkdown(markdown) {
    const { showdown, DOMPurify } = SillyTavern.libs;
    const converter = new showdown.Converter({ tables: true, strikethrough: true, simpleLineBreaks: false, openLinksInNewWindow: true, noHeaderId: true });
    return DOMPurify.sanitize(converter.makeHtml(String(markdown ?? '')), {
        FORBID_TAGS: ['img', 'picture', 'source', 'video', 'audio', 'iframe', 'object', 'embed', 'style', 'script', 'form', 'input', 'link', 'meta'],
        FORBID_ATTR: ['style', 'src', 'srcset'], ADD_ATTR: ['target'], RETURN_TRUSTED_TYPE: false,
    });
}

/**
 * @param {{root:HTMLElement}} opts
 * @returns {{open:(o:{title:string, body:string|Node, foot?:Node|null, onClose?:()=>void})=>void, close:()=>void, isOpen:()=>boolean}}
 */
export function createDocPanel({ root }) {
    let el = null, onClose = null, restore = null;

    function open({ title, body, foot = null, onClose: closed = null }) {
        close();
        onClose = closed;
        restore = document.activeElement;
        const content = h('div', { class: 'stcr-doc-body' });
        if (typeof body === 'string') content.innerHTML = body; // 调用方已用 renderMarkdown 清洗
        else content.append(body);
        for (const a of content.querySelectorAll('a[href]')) a.rel = 'noopener noreferrer';
        const sheet = h('div', { class: 'stcr-doc', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
            h('div', { class: 'stcr-doc-head' },
                h('h2', { class: 'stcr-doc-title', text: title }),
                iconButton('fa-xmark', '关闭（Esc）', { class: 'stcr-doc-close', onclick: () => close() })),
            content,
            foot ? h('div', { class: 'stcr-doc-foot' }, foot) : null);
        el = h('div', { class: 'stcr-doc-backdrop', onclick: event => { if (event.target === el) close(); } }, sheet);
        root.append(el);
        sheet.focus({ preventScroll: true });
    }
    function close() {
        if (!el) return;
        el.remove();
        el = null;
        const done = onClose;
        onClose = null;
        if (restore instanceof HTMLElement && restore.isConnected) restore.focus({ preventScroll: true });
        restore = null;
        done?.();
    }
    return { open, close, isOpen: () => !!el };
}
