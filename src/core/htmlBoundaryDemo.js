// ST Reader — AGPL-3.0
import { detectHtmlBlocks, createSandbox } from './htmlRenderer.js';
import { initFormatter, formatWithStrategy } from './formatter.js';
import { MIXED_HTML, MULTI_HTML } from '../../dev/fixtures/html.mjs';

// 仅开发演示与浏览器自测使用；正式阅读器的区间接线交给 Opus，不修改其 DOM 或锚点。
export async function mountBoundaryExample(root, raw, width = 600) {
    await initFormatter();
    const handles = [], blocks = detectHtmlBlocks(raw); let cursor = 0;
    const prose = text => {
        if (!text.trim()) return;
        const el = document.createElement('div'); el.className = 'mes_text'; el.dataset.stcrBoundaryProse = '1';
        el.innerHTML = formatWithStrategy(text, { isUser: false, isSystem: false }, {});
        root.append(el);
    };
    const destroy = () => { handles.forEach(handle => handle.destroy()); root.replaceChildren(); };
    try {
        for (const block of blocks) {
            prose(raw.slice(cursor, block.start));
            const handle = createSandbox(block.html, { width, allowNetwork: false });
            handles.push(handle); root.append(handle.iframe); cursor = block.end;
        }
        prose(raw.slice(cursor)); await Promise.all(handles.map(handle => handle.ready));
        return { handles, blocks, destroy };
    } catch (error) { destroy(); throw error; }
}

export async function showHtmlBoundaryDemo() {
    if (document.getElementById('stcr_html_boundary_demo')) throw new Error('请先关闭已有的 T51 验收窗口');
    const panel = document.createElement('section'); panel.id = 'stcr_html_boundary_demo';
    panel.style.cssText = 'position:fixed;inset:20px;z-index:2147483000;overflow:auto;padding:24px;background:linear-gradient(var(--SmartThemeBlurTintColor,#f5f4ef),var(--SmartThemeBlurTintColor,#f5f4ef)),#f5f4ef;color:var(--SmartThemeBodyColor,#203a32);font:inherit;';
    const title = document.createElement('h2'); title.textContent = 'T51 · 裸 HTML 边界验收（完全虚构）';
    const note = document.createElement('p'); note.textContent = '标题、段间文字和尾声留在网页外。第一张网页默认透出纸面，第二张网页保留自己的蓝色底。此处是 core 验收演示，正式阅读器接线由 Opus 完成。';
    const controls = document.createElement('div'), status = document.createElement('p'), stage = document.createElement('div');
    stage.style.cssText = 'max-width:680px;padding:20px;margin:auto;background:rgba(120,155,135,.22);overflow:auto;';
    panel.append(title, note, controls, status, stage); document.body.append(panel);
    let current, revision = 0, closed = false;
    const show = async raw => {
        const request = ++revision; current?.destroy();
        const container = document.createElement('div'); stage.replaceChildren(container);
        status.textContent = '正在检查边界与沙箱…';
        try {
            const next = await mountBoundaryExample(container, raw, Math.max(240, Math.min(600, stage.clientWidth - 40)));
            if (closed || request !== revision) { next.destroy(); return; }
            current = next; status.textContent = `已显示 ${next.blocks.length} 段 HTML；散文在 iframe 外。`;
        } catch (error) { if (!closed && request === revision) status.textContent = error.message; }
    };
    const button = (label, run) => {
        const el = document.createElement('button'); el.type = 'button'; el.textContent = label;
        el.style.cssText = 'margin:4px;padding:8px 12px;background:#203a32;color:#f8f4e7;border:1px solid #829a90;cursor:pointer;'; el.onclick = run; controls.append(el);
    };
    button('一段 HTML + 前后散文', () => show(MIXED_HTML));
    button('同楼两段 HTML', () => show(MULTI_HTML));
    button('切换纸面颜色', () => { stage.style.backgroundColor = stage.style.backgroundColor === 'rgb(63, 80, 103)' ? 'rgb(224, 214, 188)' : 'rgb(63, 80, 103)'; });
    button('关闭验收窗口', () => { closed = true; revision++; current?.destroy(); panel.remove(); });
    await show(MIXED_HTML);
}
