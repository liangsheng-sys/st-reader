import { domToBlob } from '../../vendor/modern-screenshot.mjs';
import { store } from './store.js';
import { normalizeMaskStyle } from './cardTransforms.js';
import { getCardSource, applyCardParts, renderCardParts, prepareCardAssets, maskTextNodesInPlace } from './cardContent.js';
import { buildCardFontCss } from './cardFonts.js';
import { createCardSnapshot, finishCardSnapshot } from './cardSnapshot.js';

export { createCardMessage, bindCardSource, wrapMaskSpans } from './cardContent.js';
export { replaceNamesInRaw, maskText, automaticNameRules } from './cardTransforms.js';

/**
 * 从已连接的预览节点生成 PNG。只在隔离副本重渲染、脱敏，不改输入 DOM。
 * createCardMessage / bindCardSource 提供原始候选；开启名字替换时必须具备此绑定。
 * @param {HTMLElement} rootEl 卡片或单楼预览，可含多楼
 * @param {{maskWords?:string[],replaceNames?:boolean,autoReplaceNames?:boolean,applyReplaceRules?:boolean,maskStyle?:string|object,rules?:object[],assets?:object[],width?:number,scale?:number,onWarning?:(message:string)=>void}} opts
 * @returns {Promise<Blob>} image/png；不会自动下载
 */
export async function exportCard(rootEl, opts = {}) {
    const options = { ...opts, replaceNames: opts.replaceNames !== false, maskStyle: normalizeMaskStyle(opts.maskStyle) };
    options.rules ??= await store.replaceRules.list();
    options.assets ??= await store.assets.list();
    options.maskWords ??= await store.maskWords.list();
    options.assetMap = await prepareCardAssets(options.assets);
    const scale = opts.scale ?? 2;
    if (!Number.isFinite(scale) || scale < 1 || scale > 3) throw new RangeError('导出倍率须为 1–3');
    if (!rootEl?.querySelectorAll) throw new TypeError('卡片须为 Element');
    const sourceElements = [rootEl, ...rootEl.querySelectorAll('*')].filter(element => getCardSource(element));
    if (options.replaceNames && !sourceElements.length) throw new Error('名字替换需要正则前原文；请用 createCardMessage 或 bindCardSource 绑定楼层');
    const snapshot = await createCardSnapshot(rootEl, '', options);
    try {
        for (const original of sourceElements) {
            const target = snapshot.nodeMap.get(original);
            if (!target) continue;
            const result = await renderCardParts(getCardSource(original), options, snapshot.doc);
            applyCardParts(target, result);
        }
        maskTextNodesInPlace(snapshot.copy, options.maskWords, options.maskStyle, options.assetMap);
        // 在最终副本上收集字体，覆盖正则新建的 q/code 等节点，不只看旧预览。
        const font = await buildCardFontCss(snapshot.copy);
        if (font.fallbacks.length) {
            const message = `以下非 Ny 本地字体没有可嵌入字节，将使用系统回退：${font.fallbacks.join('、')}。需精确字形时请在 Ny 导入并应用本地字体。`;
            console.warn(`[st-reader] ${message}`); opts.onWarning?.(message);
        }
        const fontStyle = snapshot.doc.createElement('style'); fontStyle.textContent = font.cssText; snapshot.doc.head.append(fontStyle);
        await finishCardSnapshot(snapshot);
        if (snapshot.width * snapshot.height * scale * scale > 32_000_000) throw new RangeError('导出超过 3200 万像素，请减少选段或倍率');
        let networkAttempt = false;
        const blob = await domToBlob(snapshot.copy, {
            type: 'image/png', width: Math.ceil(snapshot.width), height: snapshot.height, scale,
            timeout: 15000, maximumCanvasSize: 32768, workerNumber: 0,
            font: { cssText: font.cssText }, features: { copyScrollbar: false },
            // 只提供内嵌资源；即使依赖尝试补取图片，也绝不回退到 fetch。
            fetchFn: async () => { networkAttempt = true; throw new Error('导出禁止请求外部资源'); },
            onCreateForeignObjectSvg: () => { if (networkAttempt) throw new Error('卡片存在无法离线读取的资源'); },
        });
        if (!blob || blob.type !== 'image/png' || !blob.size) throw new Error('浏览器未生成 PNG，请减少选段后重试');
        return blob;
    } finally { snapshot.destroy(); }
}
