// ST Reader — AGPL-3.0
import { maskHtmlString, transformHtmlOffline } from './codeTransforms.js';
import { htmlWidth } from './htmlRenderer.js';
import { domToBlob } from '../../vendor/modern-screenshot.mjs';
import { offlineCaptureGuard } from './offlineCapture.js';
import { removeNetworkResources } from './htmlResources.js';
import { captureScale, captureGeometry } from './htmlCrop.js';

const staticPolicy = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; base-uri 'none'; form-action 'none';";
function sanitizeStatic(doc) {
    function visit(root) {
        for (const node of [...root.querySelectorAll('*')]) {
            if (['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'base', 'link', 'meta', 'portal', 'animate', 'animatetransform', 'animatemotion', 'set'].includes(node.localName.toLowerCase())) { node.remove(); continue; }
            for (const attribute of [...node.attributes]) {
                const name = attribute.name.toLowerCase(), value = attribute.value.trim();
                if (name.startsWith('on') || ['srcdoc', 'srcset', 'action', 'formaction', 'target', 'ping', 'autofocus', 'autoplay'].includes(name)) node.removeAttributeNode(attribute);
                else if (['src', 'href', 'xlink:href', 'poster', 'background'].includes(name) && !/^(data:|blob:|#)/i.test(value)) node.removeAttributeNode(attribute);
            }
            if (node.localName === 'img' && !node.hasAttribute('src')) node.remove();
            if (node.localName === 'template') visit(node.content);
        }
    }
    visit(doc);
}
const limit = (promise, ms, message) => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
};

/** 建立已挂载的、同源但禁脚本的静态 iframe；调用者必须 finally destroy。始终禁网。 */
export async function renderStatic(html, options = {}) {
    const width = htmlWidth(options.width);
    const clean = await transformHtmlOffline(html, doc => { removeNetworkResources(doc); sanitizeStatic(doc); });
    const iframe = document.createElement('iframe'); iframe.dataset.stcrHtmlStatic = '1';
    iframe.setAttribute('sandbox', 'allow-same-origin'); iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = `position:fixed;left:-30000px;top:0;width:${width}px;height:150px;border:0;pointer-events:none;`;
    const loaded = new Promise((resolve, reject) => { iframe.onload = resolve; iframe.onerror = () => reject(new Error('静态 HTML 加载失败')); });
    iframe.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${staticPolicy}">${clean}`;
    try {
        document.body.append(iframe); await limit(loaded, 10000, '静态 HTML 加载超时');
        const doc = iframe.contentDocument;
        const freeze = doc.createElement('style'); freeze.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; doc.head.append(freeze);
        await limit(Promise.all([...doc.fonts].map(face => face.load())).then(() => doc.fonts.ready), 15000, '静态 HTML 字体解码超时');
        await limit(Promise.all([...doc.images].map(image => image.decode())), 15000, '静态 HTML 图片解码失败或超时');
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const height = Math.ceil(Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, doc.body.getBoundingClientRect().bottom));
        if (height < 1 || height > 16384 || width * height > 32_000_000) throw new RangeError('HTML 静态图超过 16384 像素高度或 3200 万像素，请减少内容');
        iframe.style.height = `${height}px`;
        return { iframe, document: doc, element: doc.documentElement, width, height, destroy: () => iframe.remove() };
    } catch (error) { iframe.remove(); throw error; }
}

/** crop 使用 CSS 文档像素，PNG 默认按 2 倍重新栅格化；不读取交互 iframe 或执行原脚本。 */
export async function exportRenderedHtml(html, options = {}) {
    const width = htmlWidth(options.width), scale = captureScale(options.scale);
    const clean = await maskHtmlString(html, options);
    const snapshot = await renderStatic(clean, { width });
    try {
        const { rect: crop, pixels } = captureGeometry(width, snapshot.height, scale, options.crop);
        const fontCss = [...snapshot.document.querySelectorAll('style')].map(style => style.textContent).join('\n');
        const blob = await domToBlob(snapshot.element, { type: 'image/png', width, height: snapshot.height, scale,
            timeout: 15000, maximumCanvasSize: 32768, workerNumber: 0, font: { cssText: fontCss }, features: { copyScrollbar: false }, ...offlineCaptureGuard() });
        if (!blob || blob.type !== 'image/png' || !blob.size) throw new Error('未生成 HTML PNG');
        if (crop.x === 0 && crop.y === 0 && crop.w === width && crop.h === snapshot.height) return blob;
        const bitmap = await createImageBitmap(blob);
        try {
            const canvas = document.createElement('canvas'); canvas.width = pixels.w; canvas.height = pixels.h;
            canvas.getContext('2d').drawImage(bitmap, pixels.x, pixels.y, pixels.w, pixels.h, 0, 0, pixels.w, pixels.h);
            const cropped = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!cropped) throw new Error('HTML 裁剪未生成 PNG'); return cropped;
        } finally { bitmap.close(); }
    } finally { snapshot.destroy(); }
}
