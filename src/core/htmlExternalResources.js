// ST Reader — AGPL-3.0
// D23：只取聊天 HTML 已引用的展示资源；不使用代理、遥测域名，不向跨站资源携带凭据。
const MAX_FILE = 5_000_000, MAX_TOTAL = 20_000_000, MAX_RESOURCES = 128;
const forbidden = /^\/api\/chats\/(?:save|rename|delete|import|group\/(?:save|delete|import))(?:\/|$)/i;

export function htmlResourceUrl(value, base) {
    const url = new URL(value, base);
    if (url.username || url.password || forbidden.test(decodeURIComponent(url.pathname))) throw new Error('资源地址不是允许的只读展示资源');
    if (!['https:', 'http:', 'blob:', 'data:'].includes(url.protocol)) throw new Error('不支持的资源协议');
    return url.href;
}
function cssUnescape(value) {
    return value.replace(/\\([0-9a-f]{1,6})\s?|\\([^\r\n])/gi, (_, hex, char) => hex ? String.fromCodePoint(Math.min(0x10ffff, parseInt(hex, 16)) || 0xfffd) : char);
}
function base64(bytes) {
    let text = '';
    for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(text);
}
// 只识别 CSS 语法中的 token，注释和 content 字符串里写着 url()/@import 不代表资源请求。
function cssTokens(text, pattern) {
    const matches = [], token = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'y'); let i = 0;
    while (i < text.length) {
        if (text.startsWith('/*', i)) { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 2; continue; }
        if (text[i] === '"' || text[i] === "'") { const quote = text[i++]; while (i < text.length) { if (text[i] === '\\') i += 2; else if (text[i++] === quote) break; } continue; }
        token.lastIndex = i; const match = token.exec(text);
        if (match) { matches.push(match); i = token.lastIndex; } else i++;
    }
    return matches;
}

/** 在离线解析 DOM 上内嵌资源，完成后静态 iframe 与 PNG 栅格化都不需要联网。 */
export async function embedHtmlResources(doc, { baseUrl = document.baseURI, fetchFn = globalThis.fetch.bind(globalThis), signal, onWarning = message => console.warn('[st-reader] HTML 截图资源：', message) } = {}) {
    const cache = new Map(), warnings = []; let total = 0;
    const warn = (message, url) => {
        // 不把带查询参数的资源地址或聊天内容写入日志；调用者可展示温和降级提示。
        let origin = ''; try { origin = new URL(url, baseUrl).origin; } catch { /* 无效地址 */ }
        const text = `${message}${origin && origin !== 'null' ? `（${origin}）` : ''}`;
        if (!warnings.includes(text)) { warnings.push(text); onWarning(text); }
    };
    async function resource(raw, base, kind) {
        signal?.throwIfAborted();
        const url = htmlResourceUrl(cssUnescape(raw), base);
        if (cache.has(url)) return cache.get(url);
        if (cache.size >= MAX_RESOURCES) throw new Error('图片与字体等资源超过 128 项');
        const promise = (async () => {
            const controller = new AbortController(), abort = () => controller.abort(signal.reason);
            signal?.addEventListener('abort', abort, { once: true });
            const timer = setTimeout(() => controller.abort(new Error('资源读取超时')), 12000);
            try {
                const credentials = new URL(url).origin === globalThis.location?.origin ? 'same-origin' : 'omit';
                const response = await fetchFn(url, { method: 'GET', mode: 'cors', credentials, referrerPolicy: 'no-referrer', signal: controller.signal });
                if (!response.ok || response.type === 'opaque') throw new Error('网站未允许读取资源或响应失败');
                if (Number(response.headers.get('content-length')) > MAX_FILE) throw new Error('资源超过 5 MB');
                const chunks = []; let length = 0;
                if (!response.body) throw new Error('资源响应没有内容');
                const reader = response.body.getReader();
                try {
                    while (true) {
                        const { value, done } = await reader.read(); if (done) break;
                        length += value.byteLength; total += value.byteLength;
                        if (length > MAX_FILE || total > MAX_TOTAL) { await reader.cancel(); throw new Error('单资源超过 5 MB 或总资源超过 20 MB'); }
                        chunks.push(value);
                    }
                } finally { reader.releaseLock(); }
                const bytes = new Uint8Array(length); let offset = 0;
                for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
                const mime = (response.headers.get('content-type') || (kind === 'css' ? 'text/css' : 'application/octet-stream')).split(';')[0].trim();
                return { text: () => new TextDecoder().decode(bytes), data: `data:${mime};base64,${base64(bytes)}`, url: response.url || url };
            } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
        })();
        cache.set(url, promise); return promise;
    }
    async function urls(value, base) {
        const pattern = /url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^)\\])*))\s*\)/gi;
        let out = '', last = 0;
        for (const match of cssTokens(value, pattern)) {
            out += value.slice(last, match.index); last = match.index + match[0].length;
            const raw = (match[1] ?? match[2] ?? match[3]).trim();
            if (/^(?:data:|#)/i.test(raw)) { out += match[0]; continue; }
            try { out += `url("${(await resource(raw, base, 'binary')).data}")`; }
            catch (error) { if (signal?.aborted) throw error; warn(`部分图片或字体无法内嵌：${error.message}`, raw); out += 'url("")'; }
        }
        return out + value.slice(last);
    }
    async function stylesheet(text, base, parents = new Set()) {
        // 常见 @import（含媒体条件）；循环引用不重复加载。CSSOM 最终再去除所有未内嵌 URL。
        const pattern = /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)|"([^"]*)"|'([^']*)')\s*([^;]*);/gi;
        let out = '', last = 0;
        for (const match of cssTokens(text, pattern)) {
            out += await urls(text.slice(last, match.index), base); last = match.index + match[0].length;
            const raw = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5]).trim();
            try {
                const url = htmlResourceUrl(cssUnescape(raw), base);
                if (parents.has(url) || parents.size >= 8) throw new Error('样式循环引用或嵌套过深');
                const loaded = await resource(raw, base, 'css');
                const nested = await stylesheet(loaded.text(), loaded.url, new Set([...parents, url]));
                const media = match[6].trim();
                out += media ? `@media ${media}{${nested}}` : nested;
            } catch (error) { if (signal?.aborted) throw error; warn(`部分外链样式无法内嵌：${error.message}`, raw); }
        }
        return out + await urls(text.slice(last), base);
    }
    for (const link of [...doc.querySelectorAll('link')]) {
        if (!link.relList.contains('stylesheet') || link.disabled || !link.getAttribute('href')) { link.remove(); continue; }
        const raw = link.getAttribute('href');
        try {
            const url = htmlResourceUrl(raw, baseUrl), loaded = await resource(raw, baseUrl, 'css');
            const style = doc.createElement('style');
            if (link.media) style.media = link.media;
            style.textContent = await stylesheet(loaded.text(), loaded.url, new Set([url])); link.replaceWith(style);
        } catch (error) { if (signal?.aborted) throw error; warn(`部分外链样式无法内嵌：${error.message}`, raw); link.remove(); }
    }
    for (const style of doc.querySelectorAll('style')) style.textContent = await stylesheet(style.textContent, baseUrl);
    for (const node of doc.querySelectorAll('[style]')) node.setAttribute('style', await urls(node.getAttribute('style'), baseUrl));
    for (const node of doc.querySelectorAll('img, image, feImage, video[poster]')) {
        const attr = node.localName === 'video' ? 'poster' : node.localName === 'img' ? 'src' : node.hasAttribute('href') ? 'href' : 'xlink:href';
        const raw = node.getAttribute(attr); if (!raw || /^(?:data:|#)/i.test(raw)) continue;
        try { node.setAttribute(attr, (await resource(raw, baseUrl, 'image')).data); }
        catch (error) { if (signal?.aborted) throw error; warn(`部分图片无法内嵌：${error.message}`, raw); node.removeAttribute(attr); }
    }
    return warnings;
}
