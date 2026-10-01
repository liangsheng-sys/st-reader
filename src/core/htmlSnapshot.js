// ST Reader — AGPL-3.0
// 整个函数序列化进不透明源内容文档；只读活 DOM，所有写入均在脱离页面的克隆上。
export function installSnapshotChannel(token) {
    const maxLength = 8_000_000;
    function capture() {
        const source = document.documentElement, copy = source.cloneNode(true);
        const originals = [source, ...source.querySelectorAll('*')], clones = [copy, ...copy.querySelectorAll('*')];
        if (originals.length > 50000) throw new Error('当前画面节点过多，请减少内容后截图');
        for (let i = 0; i < originals.length; i++) {
            const node = originals[i], clone = clones[i], tag = node.localName;
            if (node.shadowRoot) throw new Error('当前画面含 Shadow DOM，暂不能完整截图');
            // 清掉输入自带的保留属性，防止把伪造数据误当成本次测量。
            for (const attr of [...clone.attributes]) if (attr.name.startsWith('data-stcr-shot-')) clone.removeAttribute(attr.name);
            if (node.scrollTop || node.scrollLeft) clone.setAttribute('data-stcr-shot-scroll', JSON.stringify([node.scrollLeft, node.scrollTop]));
            if (tag === 'details') clone.toggleAttribute('open', node.open);
            if (tag === 'img' && node.currentSrc) { clone.setAttribute('src', node.currentSrc); clone.removeAttribute('srcset'); }
            // 动画暂停到截取时刻的视觉值，不因静态副本禁动画而跳回初始关键帧。
            for (const animation of node.getAnimations?.() ?? []) {
                if (animation.effect?.target !== node) continue;
                const style = getComputedStyle(node);
                for (const frame of animation.effect.getKeyframes()) for (const key of Object.keys(frame)) {
                    if (['offset', 'computedOffset', 'easing', 'composite'].includes(key)) continue;
                    const property = key.replace(/[A-Z]/g, char => '-' + char.toLowerCase());
                    clone.style?.setProperty(property, style.getPropertyValue(property));
                }
            }
            if (tag === 'style' && node.sheet) {
                try { clone.textContent = [...node.sheet.cssRules].map(rule => rule.cssText).join('\n'); } catch { /* 保留原文本；跨域 link 由资源内嵌器处理。 */ }
            }
            if (['input', 'textarea', 'select'].includes(tag)) {
                if (tag === 'input' && ['checkbox', 'radio'].includes(node.type)) {
                    clone.toggleAttribute('checked', node.checked); clone.setAttribute('disabled', ''); clone.removeAttribute('value'); continue;
                }
                if (tag === 'input' && node.type === 'hidden') { clone.removeAttribute('value'); continue; }
                const text = tag === 'select' ? [...node.selectedOptions].map(option => option.textContent).join('\n')
                    : node.type === 'password' ? '••••' : node.type === 'file' ? '' : node.value;
                const shown = document.createElement('span'), style = getComputedStyle(node), rect = node.getBoundingClientRect();
                for (const attr of [...clone.attributes]) if (!/^(?:value|type|name|form|on)/i.test(attr.name)) shown.setAttribute(attr.name, attr.value);
                for (const prop of ['font', 'color', 'background-color', 'border', 'border-radius', 'padding', 'margin', 'text-align', 'letter-spacing', 'line-height', 'vertical-align']) shown.style.setProperty(prop, style.getPropertyValue(prop));
                Object.assign(shown.style, { display: style.display === 'none' ? 'none' : 'inline-block', boxSizing: 'border-box', width: `${rect.width}px`, height: `${rect.height}px`, overflow: 'hidden', whiteSpace: tag === 'textarea' ? 'pre-wrap' : 'pre' });
                shown.textContent = text; clone.replaceWith(shown);
            }
            if (tag === 'canvas' || (tag === 'video' && node.readyState >= 2) || (tag === 'img' && node.currentSrc?.startsWith('blob:'))) {
                let canvas = node;
                if (tag !== 'canvas') { canvas = document.createElement('canvas'); canvas.width = node.videoWidth || node.naturalWidth; canvas.height = node.videoHeight || node.naturalHeight; canvas.getContext('2d').drawImage(node, 0, 0); }
                let pixels;
                try { pixels = canvas.toDataURL('image/png'); } catch { throw new Error('画布或视频含网站不允许读取的跨域像素，无法截取当前画面'); }
                if (pixels.length > maxLength) throw new Error('画布图片过大，请减少内容后截图');
                const image = document.createElement('img'), rect = node.getBoundingClientRect();
                for (const attr of [...clone.attributes]) image.setAttribute(attr.name, attr.value);
                image.setAttribute('src', pixels); image.style.width = `${rect.width}px`; image.style.height = `${rect.height}px`; clone.replaceWith(image);
            }
        }
        const head = copy.querySelector('head');
        for (const sheet of document.adoptedStyleSheets ?? []) {
            const style = document.createElement('style'); style.textContent = [...sheet.cssRules].map(rule => rule.cssText).join('\n'); head?.append(style);
        }
        // 注入的运行脚本也移除；返回值只表达当前画面，永不用于重新执行游戏。
        for (const node of copy.querySelectorAll('script,meta[http-equiv],base')) node.remove();
        copy.setAttribute('data-stcr-shot-snapshot', '1');
        const html = '<!doctype html>' + copy.outerHTML;
        if (html.length > maxLength) throw new Error('当前画面快照超过 800 万字符，请减少内容');
        return html;
    }
    addEventListener('message', event => {
        const data = event.data;
        if (event.source !== parent || data?.type !== 'stcr:html-snapshot-request' || data.token !== token || typeof data.requestId !== 'string' || data.requestId.length > 80) return;
        try { parent.postMessage({ type: 'stcr:html-snapshot-result', token, requestId: data.requestId, html: capture() }, '*'); }
        catch (error) { parent.postMessage({ type: 'stcr:html-snapshot-result', token, requestId: data.requestId, error: String(error.message).slice(0, 240) }, '*'); }
    });
}

/** 静态副本完成布局后还原可视区；modern-screenshot 会按 scrollLeft/Top 克隆内容。 */
export function restoreSnapshotScroll(doc) {
    for (const node of doc.querySelectorAll('[data-stcr-shot-scroll]')) {
        try {
            const pair = JSON.parse(node.getAttribute('data-stcr-shot-scroll'));
            if (Array.isArray(pair) && pair.length === 2 && pair.every(value => Number.isFinite(value) && Math.abs(value) <= 10_000_000)) { node.scrollLeft = pair[0]; node.scrollTop = pair[1]; }
        } catch { /* 不可信输入的无效提示不参与布局。 */ }
    }
}
