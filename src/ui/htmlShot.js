// ST Reader — AGPL-3.0
// HTML 渲染截图（T44b、F10a）：把一段 HTML 的**脱敏静态图**做成 PNG，可以在预览上框选一部分只导出那一块。
// 截图全由 core 完成（exportRenderedHtml：先 maskHtmlString 换词、再离线静态渲染、再截图，始终断网，03 §5.13）；
// 这里只管：选宽度 / 清晰度 / 名字开关，显示预览，框选，保存。框选坐标用 core 的 CSS 文档坐标（htmlCrop / htmlCropPreview）。
// 预览是"这段 HTML 刚打开时的样子"：游戏里点出来的结局、脚本画的图、网上的字体图片都不会出现（core 边界）。

import { exportRenderedHtml } from '../core/htmlRenderer.js';
import { createCropPreview } from '../core/htmlCropPreview.js';
import { h, iconButton } from './dom.js';
import { HTML_WIDTHS } from './htmlBlocks.js';
import { cardFileName } from './logic.js';

const SCALES = [{ id: 1, label: '1 倍' }, { id: 2, label: '2 倍' }, { id: 3, label: '3 倍' }];

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root #stcr_root
 * @param {(message:string)=>void} opts.toast
 * @param {(where:object, names:{autoNames:boolean, myRules:boolean})=>Promise<object>} opts.maskOptions 屏蔽词 / 规则 / 名字 → core 的脱敏参数
 * @param {()=>void} [opts.onClose]
 */
export function createHtmlShot({ root, toast, maskOptions, onClose }) {
    let st = null; // 打开着的一次

    function open({ html, where, width, widthChoice }) {
        close();
        const fit = typeof width === 'number' ? width : 600;
        const mine = { html, where, fitWidth: fit, width: widthChoice === 'fit' ? 'fit' : widthChoice ?? 390, scale: 2,
            autoNames: true, myRules: true, run: 0, busy: false, blob: null, url: null, preview: null, cssHeight: 0 };
        st = mine;
        mine.els = buildDom(mine);
        root.append(mine.els.dialog);
        mine.els.dialog.focus({ preventScroll: true });
        sync(mine);
        refresh(mine);
    }

    function buildDom(mine) {
        const seg = (items, key) => h('div', { class: 'stcr-seg', role: 'group' },
            ...items.map(item => h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', [`data-${key}`]: String(item.id), text: item.label, title: item.title ?? '' })));
        const widths = seg(HTML_WIDTHS, 'shot-width');
        const scales = seg(SCALES, 'shot-scale');
        const sw = (label, key, hint) => {
            const input = h('input', { type: 'checkbox', role: 'switch', class: 'stcr-switch-input', 'data-shot-flag': key });
            return h('label', { class: 'stcr-switch stcr-set-switch', title: hint }, input, h('span', { class: 'stcr-switch-track', 'aria-hidden': 'true' }), h('span', { class: 'stcr-set-switch-label', text: label }));
        };
        const saveAll = h('button', { type: 'button', class: 'stcr-btn stcr-studio-export', 'data-shot': 'save-all' },
            h('i', { class: 'fa-solid fa-download', 'aria-hidden': 'true' }), h('span', { text: '保存整张' }));
        const saveCrop = h('button', { type: 'button', class: 'stcr-btn stcr-studio-export', 'data-shot': 'save-crop', disabled: true },
            h('i', { class: 'fa-solid fa-crop-simple', 'aria-hidden': 'true' }), h('span', { text: '保存选区' }));
        const clearBtn = h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', 'data-shot': 'clear', text: '清除选区', disabled: true });
        const cropInfo = h('span', { class: 'stcr-shot-crop-info' });
        const status = h('div', { class: 'stcr-shot-status', role: 'status', 'aria-live': 'polite' });
        const slot = h('div', { class: 'stcr-shot-slot' });
        const head = h('header', { class: 'stcr-studio-head' },
            iconButton('fa-xmark', '关闭（Esc）', { 'data-shot': 'close' }),
            h('h2', { class: 'stcr-studio-title', text: '截图分享' }),
            h('span', { class: 'stcr-studio-sub', text: `第 ${mine.where.index + 1} 楼 · HTML` }),
            saveCrop, saveAll);
        const tools = h('div', { class: 'stcr-shot-tools' },
            h('span', { class: 'stcr-set-label', text: '宽度' }), widths,
            h('span', { class: 'stcr-set-label', text: '清晰度' }), scales,
            sw('自动名字', 'autoNames', '角色名、你的名字换成 char / user'),
            sw('我的规则', 'myRules', '按"管理替换规则"里的规则替换'));
        const foot = h('div', { class: 'stcr-shot-foot' }, cropInfo, clearBtn);
        const stage = h('div', { class: 'stcr-shot-stage' },
            h('p', { class: 'stcr-shot-tip', text: '在图上按住拖一下，可以只框一部分；框里拖动能移动，四个角能调大小。屏蔽词已遮住、名字按开关替换。截的是这段 HTML 刚打开时的样子（游戏里点出来的结局、网上的字体和图片不会出现）。' }),
            status, slot, foot);
        const dialog = h('div', { class: 'stcr-studio stcr-shot', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'HTML 截图分享', tabindex: '-1' },
            head, h('div', { class: 'stcr-shot-body' }, tools, stage));

        dialog.addEventListener('click', event => {
            const t = event.target;
            const width = t.closest('[data-shot-width]')?.dataset.shotWidth;
            if (width) { mine.width = width === 'fit' ? 'fit' : Number(width); sync(mine); refresh(mine); return; }
            const scale = t.closest('[data-shot-scale]')?.dataset.shotScale;
            if (scale) { mine.scale = Number(scale); sync(mine); refresh(mine); return; }
            switch (t.closest('[data-shot]')?.dataset.shot) {
                case 'close': close(); return;
                case 'save-all': save(mine, false); return;
                case 'save-crop': save(mine, true); return;
                case 'clear': mine.preview?.clear(); return;
                default:
            }
        });
        dialog.addEventListener('change', event => {
            const key = event.target.dataset?.shotFlag;
            if (!key) return;
            mine[key] = event.target.checked;
            refresh(mine);
        });
        dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !event.target.closest('[data-stcr-crop-box]')) { event.preventDefault(); event.stopPropagation(); close(); }
        });
        return { dialog, widths, scales, saveAll, saveCrop, clearBtn, cropInfo, status, slot, stage };
    }

    function sync(mine) {
        for (const b of mine.els.widths.children) b.classList.toggle('stcr-on', b.dataset.shotWidth === String(mine.width));
        for (const b of mine.els.scales.children) b.classList.toggle('stcr-on', Number(b.dataset.shotScale) === mine.scale);
        for (const input of mine.els.dialog.querySelectorAll('[data-shot-flag]')) input.checked = mine[input.dataset.shotFlag];
    }

    const cssWidth = mine => (mine.width === 'fit' ? mine.fitWidth : mine.width);

    /** 宽度 / 清晰度 / 名字开关变了：重新生成预览（旧图与选区作废）。 */
    async function refresh(mine) {
        const run = ++mine.run;
        dropPreview(mine);
        setBusy(mine, true, '正在生成脱敏截图…');
        try {
            const options = await maskOptions(mine.where, { autoNames: mine.autoNames, myRules: mine.myRules });
            const width = cssWidth(mine);
            const blob = await exportRenderedHtml(mine.html, { ...options, width, scale: mine.scale });
            if (st !== mine || run !== mine.run) return;
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.alt = '脱敏后的 HTML 截图预览';
            img.src = url;
            await img.decode();
            if (st !== mine || run !== mine.run) { URL.revokeObjectURL(url); return; }
            mine.blob = blob;
            mine.url = url;
            mine.cssHeight = Math.round(img.naturalHeight / mine.scale);
            mine.previewWidth = width;
            mine.preview = createCropPreview(img, width, mine.cssHeight, selection => onSelect(mine, selection));
            mine.preview.element.classList.add('stcr-shot-surface');
            mine.els.slot.replaceChildren(mine.preview.element);
            setBusy(mine, false, '');
        } catch (error) {
            if (st !== mine || run !== mine.run) return;
            console.error('[st-reader] HTML 截图失败', error);
            setBusy(mine, false, `截图没做出来：${error?.message ?? error}`, true);
        }
    }

    function onSelect(mine, selection) {
        const els = mine.els;
        els.saveCrop.disabled = !selection || mine.busy;
        els.clearBtn.disabled = !selection || mine.busy;
        els.cropInfo.textContent = selection
            ? `选区 ${selection.w} × ${selection.h}（导出 ${selection.w * mine.scale} × ${selection.h * mine.scale} 像素）`
            : mine.blob ? `整张 ${mine.previewWidth} × ${mine.cssHeight}（导出 ${mine.previewWidth * mine.scale} × ${mine.cssHeight * mine.scale} 像素）。想只要一部分就在图上拖一下。` : '';
    }

    function setBusy(mine, busy, message, error = false) {
        mine.busy = busy;
        mine.preview?.setDisabled(busy);
        const els = mine.els;
        els.saveAll.disabled = busy || !mine.blob;
        els.status.textContent = message;
        els.status.classList.toggle('stcr-shot-status--error', error);
        els.dialog.classList.toggle('stcr-studio--busy', busy);
        onSelect(mine, mine.preview?.selection ?? null);
    }

    function dropPreview(mine) {
        mine.preview?.destroy();
        mine.preview = null;
        if (mine.url) URL.revokeObjectURL(mine.url);
        mine.url = null;
        mine.blob = null;
        mine.els.slot.replaceChildren();
    }

    async function save(mine, cropped) {
        if (mine.busy || !mine.blob) return;
        const selection = cropped ? mine.preview?.selection : null;
        if (cropped && !selection) return;
        const run = mine.run;
        let blob = mine.blob;
        if (selection) {
            setBusy(mine, true, '正在导出选区…');
            try {
                const options = await maskOptions(mine.where, { autoNames: mine.autoNames, myRules: mine.myRules });
                blob = await exportRenderedHtml(mine.html, { ...options, width: mine.previewWidth, scale: mine.scale, crop: selection });
            } catch (error) {
                if (st !== mine || run !== mine.run) return;
                console.error('[st-reader] HTML 选区导出失败', error);
                setBusy(mine, false, `导出失败：${error?.message ?? error}。预览还在，可以换个选区再试。`, true);
                return;
            }
            if (st !== mine || run !== mine.run) return;
            setBusy(mine, false, '');
        }
        const url = URL.createObjectURL(blob);
        const name = cardFileName().replace('-card-', '-html-').replace(/\.png$/i, selection ? '-part.png' : '.png');
        const link = h('a', { href: url, download: name, class: 'stcr-offscreen' });
        mine.els.dialog.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        toast(`已导出：${name}（在浏览器的下载文件夹里）`);
    }

    function close() {
        const mine = st;
        if (!mine) return;
        st = null;
        mine.run++;
        dropPreview(mine);
        mine.els.dialog.remove();
        onClose?.();
    }

    return { open, close, isOpen: () => st !== null };
}
