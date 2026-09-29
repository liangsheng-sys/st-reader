// 图片只来自本地 Blob 或备份 data URL，不访问网络。
export const MAX_ASSET_BYTES = 200 * 1024;
export const MAX_ASSETS = 30;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

function encode(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
}

/** SVG 在浏览器内用宿主 DOMPurify 清洗，再去掉可请求资源/改变链接的属性。 */
export function sanitizeSvg(text) {
    const purifier = globalThis.SillyTavern?.libs?.DOMPurify;
    if (!purifier || !globalThis.DOMParser) throw new Error('SVG 导入需要 ST 浏览器的 DOMPurify');
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new TypeError('SVG 不能包含文档类型或实体声明');
    const clean = purifier.sanitize(text, { USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['script', 'style', 'foreignObject', 'image', 'feImage', 'animate', 'animateMotion', 'animateTransform', 'set', 'a'],
        FORBID_ATTR: ['style'], ALLOW_DATA_ATTR: false, RETURN_TRUSTED_TYPE: false });
    const xml = new DOMParser().parseFromString(clean, 'image/svg+xml');
    if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'svg') throw new TypeError('不是有效 SVG');
    for (const node of [xml.documentElement, ...xml.querySelectorAll('*')]) {
        for (const attribute of [...node.attributes]) {
            const name = attribute.name.toLowerCase(), value = attribute.value;
            if (name.startsWith('on') || ['src', 'srcset', 'xml:base'].includes(name)
                || (name.endsWith('href') && !/^#[\w.-]+$/.test(value))
                || (/url\s*\(/i.test(value) && !/^url\(\s*["']?#[\w.-]+["']?\s*\)$/i.test(value)) || value.includes('\\')) node.removeAttributeNode(attribute);
        }
    }
    xml.documentElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(xml.documentElement);
}

/** 规范化可备份图片；MIME 与文件签名必须相符，SVG 始终重新清洗。 */
export async function normalizeAssetImage({ blob, dataUrl }, cleanSvg = sanitizeSvg) {
    let type, bytes;
    if (blob !== undefined) {
        if (!(blob instanceof Blob) || !TYPES.has(blob.type)) throw new TypeError('仅支持 PNG / JPG / WebP / SVG');
        if (blob.size > MAX_ASSET_BYTES) throw new RangeError('图片太大，请换一张不超过 200 KB 的图片');
        type = blob.type; bytes = new Uint8Array(await blob.arrayBuffer());
    } else {
        if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4 + 64) throw new RangeError('图片 data URL 无效或超过 200 KB');
        const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/]*={0,2})$/);
        if (!match) throw new TypeError('图片必须是受支持的 base64 data URL');
        type = match[1];
        const binary = atob(match[2]); bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    }
    if (!bytes.length || bytes.length > MAX_ASSET_BYTES) throw new RangeError('图片为空或超过 200 KB');
    const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
    if (type === 'image/png' && (bytes.length < 24 || bytes.slice(0, 8).join(',') !== '137,80,78,71,13,10,26,10' || ascii(12, 16) !== 'IHDR')) throw new TypeError('PNG 文件签名不符');
    if (type === 'image/jpeg' && (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)) throw new TypeError('JPG 文件签名不符');
    if (type === 'image/webp' && (bytes.length < 16 || ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP')) throw new TypeError('WebP 文件签名不符');
    if (type === 'image/svg+xml') bytes = new TextEncoder().encode(await cleanSvg(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    else if (globalThis.createImageBitmap) {
        // 浏览器交付路径再实际解码，不能把只有文件头的损坏图片存成可用素材。
        const bitmap = await createImageBitmap(new Blob([bytes], { type }));
        bitmap.close();
    }
    if (bytes.length > MAX_ASSET_BYTES) throw new RangeError('清洗后的 SVG 超过 200 KB');
    return { mime: type, size: bytes.length, dataUrl: `data:${type};base64,${encode(bytes)}` };
}
