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

const EXTENSION_ROOT = new URL('../../', import.meta.url);
const GUIDE_URL = new URL('docs/使用说明.md', EXTENSION_ROOT);

/** 使用说明（T55）：读扩展目录里的 docs/使用说明.md（同源，只是本扩展自己的文件），在面板里显示。 */
export async function showGuide(docPanel) {
    let text;
    try {
        const response = await fetch(GUIDE_URL, { credentials: 'same-origin', cache: 'no-cache', redirect: 'error' });
        if (!response.ok) throw new Error(String(response.status));
        text = await response.text();
    } catch {
        docPanel.open({ title: '使用说明', body: h('p', { text: '使用说明没读出来。可以在扩展目录的 docs 文件夹里直接打开"使用说明.md"。' }) });
        return;
    }
    // 第一行大标题和面板标题重复，去掉
    docPanel.open({ title: '使用说明', body: renderMarkdown(text.replace(/^﻿?#\s[^\n]*\n/, '')) });
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
        for (const a of content.querySelectorAll('a[href]')) {
            a.rel = 'noopener noreferrer';
            // 文档里的相对链接（如 docs/使用说明.md）按扩展目录解析，不然会指到 ST 网站根目录下不存在的地方
            const href = a.getAttribute('href');
            if (!/^[a-z][a-z0-9+.-]*:|^#|^\//i.test(href)) a.href = new URL(href, EXTENSION_ROOT).href;
        }
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
