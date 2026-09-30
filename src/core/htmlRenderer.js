// ST Reader — AGPL-3.0
// D15/D16：交互文档永远不与宿主同源；不导入 ST 上下文或存储。
import { removeNetworkResources } from './htmlResources.js';
const MAX_HEIGHT = 16384;
export function htmlWidth(width = 390) {
    if (!Number.isInteger(width) || width < 1 || width > 8192) throw new RangeError('HTML 宽度须为 1–8192 的整数');
    return width;
}
const requireHtml = html => { if (typeof html !== 'string') throw new TypeError('HTML 必须为字符串'); return html; };

/** 返回 UTF-16 原文区间；围栏区间含围栏行，html 只含内部代码；裸 HTML 区间为全文。 */
export function detectHtmlBlocks(rawText) {
    requireHtml(rawText);
    const blocks = []; let open = null, sawFence = false;
    const hasBody = html => /<body(?:\s[^<>]*|\s*)>/i.test(html.replace(/<!--[\s\S]*?-->/g, ''));
    for (const line of rawText.matchAll(/[^\n]*(?:\n|$)/g)) {
        if (!line[0]) continue;
        const text = line[0].replace(/\r?\n$/, ''), fence = text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (!open && fence) { open = { start: line.index, content: line.index + line[0].length, char: fence[1][0], length: fence[1].length }; sawFence = true; }
        else if (open && fence && fence[1][0] === open.char && fence[1].length >= open.length && !fence[2].trim()) {
            const html = rawText.slice(open.content, line.index);
            if (hasBody(html)) blocks.push({ start: open.start, end: line.index + line[0].length, html, kind: 'fenced' });
            open = null;
        }
    }
    if (open) { const html = rawText.slice(open.content); if (hasBody(html)) blocks.push({ start: open.start, end: rawText.length, html, kind: 'fenced' }); }
    if (sawFence) return blocks;
    // 不把注释、行内代码或脚本字符串里的标记当成正文结构；CSS/脚本长度不稀释标签密度。
    const structural = rawText.replace(/<!--[\s\S]*?-->/g, '').replace(/`+[^`]*`+/g, '')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '<$1></$1>');
    if (!/<(?:html|body|style)(?:\s[^<>]*|\s*)>/i.test(structural)) return [];
    const tags = structural.match(/<\/?[a-z][\w:-]*(?:\s[^<>]*?)?\s*\/?>/gi) ?? [];
    const density = tags.join('').length / Math.max(1, structural.replace(/\s/g, '').length);
    return tags.length >= 2 && density >= .12 ? [{ start: 0, end: rawText.length, html: rawText, kind: 'raw' }] : [];
}

function policy(allowNetwork, shell = false) {
    if (typeof allowNetwork !== 'boolean') throw new TypeError('allowNetwork 必须为布尔值');
    const network = allowNetwork ? ' https:' : '';
    return `default-src 'none'; style-src 'unsafe-inline'${network}; script-src 'unsafe-inline'${network}; img-src data: blob:${network}; font-src data:${network}; connect-src ${allowNetwork ? 'https:' : "'none'"}; media-src data: blob:${network}; frame-src ${shell ? 'about:' : "'none'"}; object-src 'none'; base-uri 'none'; form-action 'none';`;
}
const jsonScript = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const meta = csp => `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer">`;

// 此函数会序列化进不透明源文档；只能使用函数内部的变量。
function reportHeight(token) {
    let scheduled = false, previous = 0;
    const report = () => {
        scheduled = false;
        const body = document.body, html = document.documentElement; if (!body) return;
        const style = getComputedStyle(body);
        const height = Math.min(16384, Math.max(1, Math.ceil(body.getBoundingClientRect().height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0)), body.scrollHeight, html.scrollHeight > html.clientHeight ? html.scrollHeight : 0));
        if (height !== previous) { previous = height; parent.postMessage({ type: 'stcr:html-height', token, height }, '*'); }
    };
    // 跨源且暂在视口外的 iframe 会暂停 rAF；首报不能依赖它，否则预加载会永久等不到高度。
    const schedule = () => { if (!scheduled) { scheduled = true; queueMicrotask(report); } };
    addEventListener('DOMContentLoaded', () => {
        const observer = new ResizeObserver(schedule); observer.observe(document.documentElement); observer.observe(document.body);
        new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
        document.fonts.ready.then(schedule); schedule();
    }, { once: true });
    addEventListener('resize', schedule); addEventListener('load', schedule);
}
function shellBootstrap(source, token, neutralize) {
    const child = document.createElement('iframe');
    child.setAttribute('sandbox', 'allow-scripts'); child.setAttribute('title', 'HTML 内容'); child.referrerPolicy = 'no-referrer';
    child.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;';
    addEventListener('message', event => {
        const data = event.data;
        if (event.source === child.contentWindow && data?.type === 'stcr:html-height' && data.token === token
            && Number.isFinite(data.height) && data.height > 0 && data.height <= 16384) parent.postMessage(data, '*');
    });
    if (neutralize) {
        const doc = new DOMParser().parseFromString(source, 'text/html'); neutralize(doc);
        source = '<!doctype html>' + doc.documentElement.outerHTML;
    }
    child.srcdoc = source; document.body.append(child);
}
function assemble(html, { allowNetwork = false, width = 390 } = {}, token = crypto.randomUUID()) {
    requireHtml(html); htmlWidth(width);
    const content = `<!doctype html>${meta(policy(allowNetwork))}<meta name="viewport" content="width=${width},initial-scale=1"><script>(${reportHeight})(${jsonScript(token)})</script>${html}`;
    // 可信外壳的 frame-src 只允许 srcdoc：也阻止内容脚本通过 location/链接导航绕过资源 CSP。
    return `<!doctype html><html><head>${meta(policy(allowNetwork, true))}<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}</style></head><body><script>(${shellBootstrap})(${jsonScript(content)},${jsonScript(token)},${allowNetwork ? 'null' : `(${removeNetworkResources})`})</script></body></html>`;
}

/** 同步生成 srcdoc；每次调用独立随机 token。可信外壳与内容两层均为 allow-scripts 沙箱。 */
export function buildSrcdoc(html, options = {}) { return assemble(html, options); }

/** 返回未挂载的 iframe；UI append 后 await ready。update 重建文档且重新生成 token。 */
export function createSandbox(html, options = {}) {
    const iframe = document.createElement('iframe'); iframe.dataset.stcrHtmlFrame = '1';
    iframe.setAttribute('sandbox', 'allow-scripts'); iframe.setAttribute('title', '阅读器 HTML 沙箱'); iframe.referrerPolicy = 'no-referrer';
    iframe.style.cssText = 'display:block;border:0;max-width:none;flex-shrink:0;height:150px;';
    let token, timer, resolveReady, rejectReady, destroyed = false, currentOptions, currentHtml;
    const handle = { iframe, ready: null, update, destroy };
    function receive(event) {
        const data = event.data;
        if (destroyed || event.source !== iframe.contentWindow || data?.type !== 'stcr:html-height' || data.token !== token
            || !Number.isFinite(data.height) || data.height <= 0 || data.height > MAX_HEIGHT) return;
        iframe.style.height = `${Math.ceil(data.height)}px`; clearTimeout(timer); resolveReady(handle);
        currentOptions.onHeight?.(Math.ceil(data.height));
    }
    function update(nextHtml = currentHtml, nextOptions = {}) {
        if (destroyed) throw new Error('HTML 沙箱已销毁');
        const width = htmlWidth(nextOptions.width ?? currentOptions?.width), allowNetwork = nextOptions.allowNetwork ?? false;
        if (nextOptions.onHeight !== undefined && typeof nextOptions.onHeight !== 'function') throw new TypeError('onHeight 必须为函数');
        const nextToken = crypto.randomUUID(), source = assemble(nextHtml, { width, allowNetwork }, nextToken);
        clearTimeout(timer); rejectReady?.(new Error('HTML 沙箱已重建'));
        currentHtml = nextHtml; currentOptions = { ...nextOptions, width, allowNetwork }; token = nextToken;
        iframe.style.width = `${width}px`; iframe.style.height = '150px';
        handle.ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
        // 返回者可以稍后才 await；仍保留拒绝结果，但不产生未处理 Promise 提示。
        handle.ready.catch(() => {});
        timer = setTimeout(() => { rejectReady(new Error('HTML 沙箱加载超时，请检查是否已挂载')); destroy(); }, 15000);
        iframe.srcdoc = source; return handle.ready;
    }
    function destroy() {
        if (destroyed) return; destroyed = true; clearTimeout(timer);
        window.removeEventListener('message', receive); iframe.remove(); rejectReady?.(new Error('HTML 沙箱已销毁'));
    }
    update(html, options); window.addEventListener('message', receive);
    return handle;
}

export { renderStatic, exportRenderedHtml } from './htmlStatic.js';
