// ST Reader — AGPL-3.0
import { createSandbox, exportRenderedHtml } from './htmlRenderer.js';
import { PHONE_HTML, GAME_HTML } from '../../dev/fixtures/html.mjs';

// 仅由 localhost:8100 的开发入口加载；T44b 正式阅读器 UI 仍由 Opus 接线。
export function showHtmlRendererDemo() {
    if (document.getElementById('stcr_html_demo')) throw new Error('请先关闭已有 HTML 演示');
    const panel = document.createElement('section'); panel.id = 'stcr_html_demo';
    panel.style.cssText = 'position:fixed;inset:20px;z-index:2147483000;overflow:auto;background:#f5f4ef;color:#203a32;padding:20px;border:3px solid #507668;font:16px/1.6 sans-serif;';
    const title = document.createElement('h2'); title.textContent = 'T44a · 完全虚构 HTML 验收（默认断网）'; panel.append(title);
    const note = document.createElement('p'); note.textContent = '选样本、调宽度；游戏可点击两件物品。导出的是初始 HTML 的静态副本，秘密会遮盖，灯塔替换为某地。'; panel.append(note);
    let current = PHONE_HTML, width = 390, handle, url, closed = false, revision = 0;
    const controls = document.createElement('div'), status = document.createElement('p'), stage = document.createElement('div'), output = document.createElement('div');
    stage.style.cssText = 'overflow:auto;padding:10px;background:#cfd9d2;'; panel.append(controls, status, stage, output);
    const button = (label, action) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'padding:8px 12px;margin:4px;background:#203a32;color:white;border:0;'; b.onclick = action; controls.append(b); return b; };
    const render = async () => {
        const request = ++revision; handle?.destroy();
        handle = createSandbox(current, { width, onHeight: height => { status.textContent = `宽度 ${width}px · 自动高度 ${height}px · 外链关闭`; } }); stage.replaceChildren(handle.iframe);
        try { await handle.ready; } catch (error) { if (!closed && request === revision) status.textContent = error.message; }
    };
    button('手机聊天', () => { current = PHONE_HTML; render(); }); button('网页游戏', () => { current = GAME_HTML; render(); });
    for (const value of [390, 768, 1200]) button(`${value}px`, () => { width = value; render(); });
    const crop = document.createElement('input'); crop.type = 'checkbox'; crop.style.cssText = 'width:auto;margin:0 6px 0 0;';
    const label = document.createElement('label'); label.style.cssText = 'display:inline-flex;align-items:center;margin:4px;'; label.append(crop, '只截左上角 300×180'); controls.append(label);
    const exportButton = button('生成脱敏 PNG', async () => {
        exportButton.disabled = true; status.textContent = '正在生成静态 PNG…';
        try {
            const blob = await exportRenderedHtml(current, { width, maskWords: ['秘密'], rules: [{ from: '灯塔', to: { kind: 'text', value: '某地' } }], crop: crop.checked ? { x: 0, y: 0, w: 300, h: 180 } : undefined });
            if (closed) return; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(blob);
            const image = document.createElement('img'); image.src = url; image.style.maxWidth = '100%'; image.alt = '完全虚构的脱敏 PNG';
            image.onload = () => { if (!closed) status.textContent = `PNG 实际尺寸 ${image.naturalWidth}×${image.naturalHeight}px；不会自动下载。`; };
            const save = document.createElement('a'); save.href = url; save.download = 'st-reader-html-synthetic.png'; save.textContent = '保存 PNG（请选择 E 盘）'; save.style.cssText = 'display:block;color:#12584b';
            output.replaceChildren(save, image); status.textContent = `PNG 已生成，${crop.checked ? '300×180 裁剪' : '完整静态文档'}；不会自动下载。`;
        } catch (error) { if (!closed) status.textContent = error.message; }
        finally { exportButton.disabled = false; }
    });
    const close = () => { closed = true; revision++; handle?.destroy(); if (url) URL.revokeObjectURL(url); panel.remove(); };
    button('关闭演示', close); document.body.append(panel); render(); return { close };
}
