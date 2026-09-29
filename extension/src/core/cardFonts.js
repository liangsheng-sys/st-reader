// Ny 1.1.9 兼容层：只读现有 IndexedDB，不导入插件源码，不创建字体数据库。
export const splitFontFamilies = value => (String(value).match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,]+/g) ?? [])
    .map(value => value.trim().replace(/^["']|["']$/g, '').toLowerCase());

export function toDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
    });
}

export async function readNyFontBlobs(entries) {
    if (!entries.length) return [];
    if (indexedDB.databases && !(await indexedDB.databases()).some(item => item.name === 'nytw-fonts')) throw new Error('Ny 本地字体不存在，请在当前浏览器重新导入');
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('nytw-fonts');
        request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('Ny 字体数据库不存在；导出不会创建它')); };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('fonts')) { db.close(); reject(new Error('Ny 字体数据库格式不兼容')); return; }
            const transaction = db.transaction('fonts', 'readonly'), result = [];
            for (const entry of entries) {
                const get = transaction.objectStore('fonts').get(entry.id);
                get.onsuccess = () => result.push({ ...entry, blob: get.result?.blob });
            }
            transaction.oncomplete = () => { db.close(); resolve(result); };
            transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error); };
        };
    });
}

/** 返回完全内嵌的字体 CSS；不把任何网络 URL 交给截图库。 */
export async function buildCardFontCss(root) {
    const doc = root.ownerDocument, view = doc.defaultView, families = new Set();
    for (const node of [root, ...root.querySelectorAll('*')]) {
        for (const pseudo of [null, '::before', '::after']) {
            const style = view.getComputedStyle(node, pseudo);
            if (pseudo && ['none', 'normal'].includes(style.content)) continue;
            for (const family of splitFontFamilies(style.fontFamily)) families.add(family);
        }
    }
    const metadata = globalThis.SillyTavern?.getContext().extensionSettings['Ny-font-manager']?.importedFonts ?? [];
    const entries = metadata.filter(item => item.kind === 'file' && families.has(item.family.toLowerCase()));
    const records = await readNyFontBlobs(entries), embedded = new Set(), css = [];
    let size = 0;
    for (const entry of records) {
        if (!(entry.blob instanceof Blob) || !entry.blob.size) throw new Error(`Ny 字体 ${entry.family} 的文件缺失，请重新导入`);
        size += entry.blob.size;
        if (size > 32 * 1024 * 1024) throw new RangeError('本卡字体总量超过 32 MiB，请减少使用的字体');
        const dataUrl = await toDataUrl(new Blob([entry.blob], { type: 'application/octet-stream' }));
        // Ny 加载本地文件时使用默认 descriptors；此处同样声明 normal/400，粗斜体由浏览器合成。
        css.push(`@font-face{font-family:${JSON.stringify(entry.family)};src:url("${dataUrl}");font-style:normal;font-weight:400;font-display:block;}`);
        embedded.add(entry.family.toLowerCase());
    }
    const scan = rules => {
        for (const rule of rules) {
            if (rule.type === 5) {
                const family = splitFontFamilies(rule.style.fontFamily)[0];
                const src = rule.style.getPropertyValue('src');
                if (families.has(family) && !embedded.has(family) && /^url\(["']?data:[^)]*\)(?:\s*format\([^)]*\))?$/.test(src)) {
                    css.push(rule.cssText); embedded.add(family);
                }
            } else if (rule.cssRules) scan(rule.cssRules);
        }
    };
    for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) { try { scan(sheet.cssRules); } catch { /* 跨域样式表不可读，不联网补取。 */ } }
    const fallbacks = new Set();
    for (const face of document.fonts) {
        const family = splitFontFamilies(face.family)[0];
        if (families.has(family) && !embedded.has(family) && !/font awesome/i.test(family)) {
            fallbacks.add(face.family);
        }
    }
    return { cssText: css.join('\n') || '/* 本卡只用系统字体，不扫描或下载字体。 */', families: [...embedded], bytes: size, fallbacks: [...fallbacks] };
}

/** 将已加载的 FA 字形画成小 PNG；不重新请求其 woff 文件。 */
export function rasterizeCardIcon(glyph, color, doc = document) {
    const face = [...doc.fonts].find(face => /font awesome.*free/i.test(face.family) && face.status === 'loaded' && Number(face.weight) >= 900);
    if (!face) throw new Error('ST 的 Font Awesome 实心图标字体尚未加载，请等待界面完成加载');
    const canvas = doc.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const context = canvas.getContext('2d');
    context.font = `900 100px ${face.family}`;
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = color;
    context.fillText(glyph, 64, 66);
    return canvas.toDataURL('image/png');
}
