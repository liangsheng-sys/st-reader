// ST Reader — AGPL-3.0
import { createSandbox, exportRenderedHtml } from './htmlRenderer.js';
import { createCropPreview } from './htmlCropPreview.js';
import { PHONE_HTML, GAME_HTML } from '../../dev/fixtures/html.mjs';

// 仅由 localhost:8100 的开发入口加载；T44b 正式阅读器 UI 仍由 Opus 接线。
export function showHtmlRendererDemo() {
    if (document.getElementById('stcr_html_demo')) throw new Error('请先关闭已有 HTML 演示');
    const panel = document.createElement('section'); panel.id = 'stcr_html_demo';
    panel.style.cssText = 'position:fixed;inset:20px;z-index:2147483000;overflow:auto;background:#f5f4ef;color:#203a32;padding:20px;border:3px solid #507668;font:16px/1.6 sans-serif;';
    const title = document.createElement('h2'); title.textContent = 'T44a · 完全虚构 HTML 验收（默认断网）'; panel.append(title);
    const note = document.createElement('p'); note.textContent = '选样本、调宽度；游戏可点击两件物品。PNG 导出初始 HTML：秘密会遮盖，灯塔替换为某地。'; panel.append(note);
    let current = PHONE_HTML, width = 390, scale = 2, handle, preview, closed = false, revision = 0, busy = false;
    const urls = new Set(), controls = document.createElement('div'), liveStatus = document.createElement('p'), stage = document.createElement('div');
    const exportControls = document.createElement('div'), status = document.createElement('p'), output = document.createElement('div'), croppedOutput = document.createElement('div');
    stage.style.cssText = 'overflow:auto;padding:10px;background:#cfd9d2;';
    status.setAttribute('role', 'status'); status.dataset.stcrExportStatus = '1';
    panel.append(controls, liveStatus, stage, exportControls, status, output, croppedOutput);
    const button = (parent, label, action) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
        b.style.cssText = 'padding:8px 12px;margin:4px;background:#203a32;color:white;border:0;cursor:pointer;'; b.onclick = action; parent.append(b); return b;
    };
    const release = () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
    const clearPreview = () => { preview?.destroy(); preview = null; release(); output.replaceChildren(); croppedOutput.replaceChildren(); };
    const clearCropped = () => {
        const oldUrl = croppedOutput.querySelector('a')?.href;
        if (oldUrl) { URL.revokeObjectURL(oldUrl); urls.delete(oldUrl); }
        croppedOutput.replaceChildren();
    };
    const refreshActions = () => {
        generate.disabled = busy;
        cropButton.disabled = footerCrop.disabled = clearButton.disabled = footerClear.disabled = busy || !preview?.selection;
        // 用输入状态锁定导出操作，不在拖动期间反复改命中样式。
        preview?.setDisabled(busy);
    };
    const invalidate = () => { revision++; clearPreview(); status.textContent = `请生成脱敏预览，再自由框选；当前 ${scale} 倍清晰度。`; refreshActions(); };
    const render = async () => {
        invalidate(); const request = revision; handle?.destroy();
        handle = createSandbox(current, { width, onHeight: height => { liveStatus.textContent = `排版宽度 ${width}px · 自动高度 ${height}px · 外链关闭`; } }); stage.replaceChildren(handle.iframe);
        try { await handle.ready; } catch (error) { if (!closed && request === revision) liveStatus.textContent = error.message; }
    };
    button(controls, '手机聊天', () => { current = PHONE_HTML; render(); }); button(controls, '网页游戏', () => { current = GAME_HTML; render(); });
    for (const value of [390, 768, 1200]) button(controls, `${value}px`, () => { width = value; render(); });
    const scaleLabel = document.createElement('label'), scaleSelect = document.createElement('select'); scaleSelect.setAttribute('aria-label', 'PNG 清晰度');
    scaleSelect.style.cssText = 'width:auto;background:white;color:#203a32;margin:4px;padding:6px;';
    for (const [value, label] of [[2, '2 倍（推荐）'], [3, '3 倍'], [1, '1 倍（小文件）']]) {
        const option = document.createElement('option'); option.value = value; option.textContent = label; scaleSelect.append(option);
    }
    scaleLabel.append('PNG 清晰度 ', scaleSelect); exportControls.append(scaleLabel);
    scaleSelect.onchange = () => { scale = Number(scaleSelect.value); invalidate(); };
    const maskOptions = { maskWords: ['秘密'], rules: [{ from: '灯塔', to: { kind: 'text', value: '某地' } }] };
    const imageAndLink = async (blob, logicalWidth, filename, label) => {
        const url = URL.createObjectURL(blob); urls.add(url);
        const image = document.createElement('img'); image.alt = '完全虚构的脱敏 PNG'; image.src = url;
        image.style.cssText = `display:block;width:${logicalWidth}px;max-width:100%;height:auto;`;
        try { await image.decode(); } catch (error) { URL.revokeObjectURL(url); urls.delete(url); throw error; }
        const save = document.createElement('a'); save.href = url; save.download = filename; save.textContent = `${label}（${image.naturalWidth}×${image.naturalHeight}px，请选 E 盘）`;
        save.style.cssText = 'display:block;color:#12584b;margin:8px 0;'; return { image, save, url };
    };
    const runExport = async crop => {
        if (busy || closed) return;
        const request = revision, source = current, requestWidth = width, requestScale = scale;
        busy = true; refreshActions(); status.textContent = `正在生成 ${requestScale} 倍脱敏 PNG…`;
        try {
            const blob = await exportRenderedHtml(source, { width: requestWidth, scale: requestScale, ...maskOptions, crop });
            if (closed || request !== revision) return;
            const result = await imageAndLink(blob, crop?.w ?? requestWidth, crop ? 'st-reader-html-crop.png' : 'st-reader-html-full.png', crop ? '保存选区 PNG' : '保存完整 PNG');
            if (closed || request !== revision) { URL.revokeObjectURL(result.url); urls.delete(result.url); return; }
            if (crop) {
                clearCropped();
                croppedOutput.replaceChildren(result.save, result.image);
                status.textContent = `选区已生成：${result.image.naturalWidth}×${result.image.naturalHeight}px，保留 ${requestScale} 倍清晰度。`;
                croppedOutput.scrollIntoView({ block: 'nearest' });
            } else {
                // 新图解码成功后再替换，失败时保留旧预览。
                preview?.destroy();
                for (const url of urls) if (url !== result.url) { URL.revokeObjectURL(url); urls.delete(url); }
                croppedOutput.replaceChildren();
                const help = document.createElement('p'); help.textContent = '在下图任意位置拖出选区；拖选区内部移动，拖四个圆点改大小。点击“清除选区”可重画。预览按排版大小显示，保存的 PNG 有更多像素。';
                const selectionStatus = document.createElement('p'); selectionStatus.dataset.stcrCropStatus = '1';
                preview = createCropPreview(result.image, requestWidth, result.image.naturalHeight / requestScale, selection => {
                    clearCropped();
                    selectionStatus.textContent = selection ? `选区：x=${selection.x}，y=${selection.y}，${selection.w}×${selection.h}；PNG ${selection.w * requestScale}×${selection.h * requestScale}px` : '未框选：可以直接保存完整 PNG，也可以拖出任意选区。';
                    refreshActions();
                });
                output.replaceChildren(result.save, help, selectionStatus, preview.element);
                status.textContent = `完整 PNG 已生成：${result.image.naturalWidth}×${result.image.naturalHeight}px（${requestScale} 倍）。`;
                output.scrollIntoView({ block: 'start' });
            }
        } catch (error) { if (!closed && request === revision) status.textContent = error.message; }
        finally { busy = false; refreshActions(); }
    };
    const generate = button(exportControls, '生成脱敏预览', () => runExport());
    const cropButton = button(exportControls, '生成选区 PNG', () => runExport(preview?.selection));
    const clearButton = button(exportControls, '清除选区', () => preview?.clear());
    // 预览较长时，底部保留相同操作，避免选好后向上翻找。
    const footer = document.createElement('div'); panel.append(footer);
    const footerCrop = button(footer, '生成选区 PNG', () => { if (preview?.selection) runExport(preview.selection); });
    const footerClear = button(footer, '清除选区', () => clearButton.click());
    const close = () => { closed = true; revision++; handle?.destroy(); clearPreview(); panel.remove(); };
    button(controls, '关闭演示', close); document.body.append(panel); render(); return { close };
}
