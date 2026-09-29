// 阅读器界面的小型 DOM 工具。文字一律走 textContent（03 §5.3：名字/标题/摘要未经清洗）。

/**
 * h('div', {class: 'stcr-x', title: '…', onclick}, child, '文字', …)
 * 属性值为 false/null/undefined 时不设置；on* 函数绑定为事件。
 */
export function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs ?? {})) {
        if (value === false || value === null || value === undefined) continue;
        if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
        else if (key === 'class') el.className = value;
        else if (key === 'text') el.textContent = value;
        else el.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
}

/** Font Awesome 图标按钮（ST 已加载 FA；不引入任何图片素材）。 */
export function iconButton(icon, title, attrs = {}) {
    const { class: extra = '', ...rest } = attrs;
    return h('button', { type: 'button', title, 'aria-label': title, ...rest, class: `stcr-btn stcr-icon-btn ${extra}`.trim() },
        h('i', { class: `fa-solid ${icon}`, 'aria-hidden': 'true' }));
}

/** 复制纯文本。localhost 以外的 http 页面没有 clipboard API，退回到隐藏文本框。 */
export async function copyText(text) {
    try {
        if (navigator.clipboard && globalThis.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* 走后备 */ }
    const area = h('textarea', { class: 'stcr-offscreen', readonly: true });
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
}

/** 阅读器自己的提示条：底部正中，2 秒消失（02 §2）。 */
export function toast(root, message) {
    let box = root.querySelector('.stcr-toast');
    if (!box) {
        box = h('div', { class: 'stcr-toast', role: 'status', 'aria-live': 'polite' });
        root.append(box);
    }
    box.textContent = message;
    box.classList.add('stcr-toast--show');
    clearTimeout(box._stcrTimer);
    box._stcrTimer = setTimeout(() => box.classList.remove('stcr-toast--show'), 2000);
}

/** 是否是可以打字的地方（快捷键在这里一律失效，§4）。 */
export function isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    return !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}
