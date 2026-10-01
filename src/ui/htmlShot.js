// ST Reader — AGPL-3.0
// HTML 渲染截图（T44b、F10a）：把一段 HTML 的**脱敏静态图**做成 PNG，可以在预览上框选一部分只导出那一块。
// 截图全由 core 完成（exportRenderedHtml：先 maskHtmlString 换词、再离线静态渲染、再截图，始终断网，03 §5.13）；
// 这里只管：选宽度 / 清晰度 / 长图、屏蔽词与替换规则（和分享卡片同一张表）、显示预览、框选、保存。
// 框选坐标用 core 的 CSS 文档坐标（htmlCrop / htmlCropPreview）。
// T44b 验收后：①屏蔽词、临时词、名字开关、管理替换规则都搬进这里，不用再去卡片工作台；②"长图"：把 HTML 里
// 固定高度的滚动区（例如手机聊天界面的消息列表）展开，所有内容出现在一张图里。
// I032（astra 交付 snapshot）：默认"当前画面"——打开窗口时从沙箱取一次当前 DOM（游戏结局、滚动位置、表单），之后宽度 / 清晰度 / 框选
// 都用这一份，不会选的是甲、导出却是乙；也可以切回"初始画面"。D23：截图默认带上 HTML 引用的外链图片、字体、样式，失败逐项提示。

import { exportRenderedHtml, renderStatic } from '../core/htmlRenderer.js';
import { createCropPreview } from '../core/htmlCropPreview.js';
import { store } from '../core/store.js';
import { h, iconButton } from './dom.js';
import { HTML_WIDTHS } from './htmlBlocks.js';
import { cardFileName, cleanMaskWord } from './logic.js';
import { createRulesManager } from './rulesUi.js';

const SCALES = [{ id: 1, label: '1 倍' }, { id: 2, label: '2 倍' }, { id: 3, label: '3 倍' }];

/**
 * 长图：在离线静态副本上找出"装不下、被裁掉或要滚动"的区域，把它们放开（高度自动、取消最大高度、不被压缩），
 * 一层层往外直到不再有被裁的内容，然后把放开后的文档交回去截图。只改样式，不碰文字。
 * 静态副本已经去掉脚本和外链（core renderStatic），这里读写的是同源、无脚本的那一份。
 * @returns {Promise<{html:string, count:number}>} count = 展开了几处；0 表示原样
 */
export async function unfoldScrollAreas(html, width, { allowNetwork = true, onWarning, signal } = {}) {
    const snap = await renderStatic(html, { width, allowNetwork, onWarning, signal });
    try {
        const doc = snap.document;
        const win = doc.defaultView;
        const clips = new Set(['auto', 'scroll', 'hidden', 'clip', 'overlay']);
        let count = 0;
        for (let pass = 0; pass < 6; pass++) {
            let changed = 0;
            for (const el of [doc.documentElement, doc.body, ...doc.body.querySelectorAll('*')]) {
                if (el.dataset?.stcrUnfold) continue;
                const cs = win.getComputedStyle(el);
                if (!clips.has(cs.overflowY) || el.scrollHeight <= el.clientHeight + 2) continue;
                // 刻意截断的文字（省略号、行数限制）不展开
                if (cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none')) continue;
                el.style.setProperty('height', 'auto', 'important');
                el.style.setProperty('max-height', 'none', 'important');
                el.style.setProperty('flex-shrink', '0', 'important');
                if (cs.overflowY !== 'hidden' && cs.overflowY !== 'clip') el.style.setProperty('overflow-y', 'visible', 'important');
                el.dataset.stcrUnfold = '1';
                changed++;
            }
            count += changed;
            if (!changed) break;
            void doc.body.offsetHeight; // 让下一轮量到放开后的尺寸
        }
        for (const el of doc.querySelectorAll('[data-stcr-unfold]')) delete el.dataset.stcrUnfold;
        return count ? { html: `<!doctype html>${doc.documentElement.outerHTML}`, count } : { html, count: 0 };
    } finally { snap.destroy(); }
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root #stcr_root
 * @param {(message:string)=>void} opts.toast
 * @param {(message:string, ok:string)=>Promise<boolean>} opts.confirm
 * @param {(where:object, flags:{autoNames:boolean, myRules:boolean})=>Promise<object>} opts.maskOptions 屏蔽词 / 规则 / 名字 → core 的脱敏参数
 * @param {()=>string|null} opts.getChatKey 管理规则时的默认作用范围
 * @param {()=>string[]} opts.autoNames 当前聊天的角色名、你的名字（规则编辑里提示）
 * @param {()=>void} [opts.onClose] 关掉时（屏蔽词 / 规则可能改过）
 */
export function createHtmlShot({ root, toast, confirm, maskOptions, getChatKey, autoNames, onClose }) {
    let st = null; // 打开着的一次

    function open({ html, where, width, widthChoice, network = true, masked = false, snapshot = null }) {
        close();
        const fit = typeof width === 'number' ? width : 600;
        const mine = { html, where, fitWidth: fit, width: widthChoice === 'fit' ? 'fit' : widthChoice ?? 390, scale: 2,
            // 长图：截初始画面时默认开（展开滚动区）；截当前画面时默认关（保留你滚到的位置）。点过就按你选的
            unfold: null, network, masked, source: snapshot ? 'current' : 'initial', current: null, currentError: null,
            autoNames: true, myRules: true, permanent: [], temp: [], run: 0, busy: false, blob: null, url: null, preview: null, cssHeight: 0,
            exportHtml: html, unfolded: 0, changed: false, rulesPage: null, abort: null, warnings: [] };
        st = mine;
        mine.els = buildDom(mine);
        root.append(mine.els.dialog);
        mine.els.dialog.focus({ preventScroll: true });
        store.maskWords.list().then(words => { if (st === mine) { mine.permanent = words; syncWords(mine); } }).catch(() => {});
        sync(mine);
        if (snapshot) {
            // 只取这一次：之后游戏里再点什么都不影响这张图
            setBusy(mine, true, '正在取当前画面…');
            snapshot({ timeoutMs: 10000 }).then(current => { if (st === mine) { mine.current = current; refresh(mine); } },
                error => {
                    if (st !== mine) return;
                    console.warn('[st-reader] 取当前画面失败', error);
                    mine.currentError = String(error?.message ?? error);
                    setBusy(mine, false, `当前画面没取到：${mine.currentError}。可以关掉窗口再点一次 📷，或在左边换成"初始画面"。`, true);
                    sync(mine);
                });
        } else refresh(mine);
    }

    const unfoldOn = mine => mine.unfold ?? mine.source === 'initial';
    /** 截当前画面且阅读器里已脱敏：取到的就是换过词的样子，不再串换（core alreadyMasked）。 */
    const alreadyMasked = mine => mine.source === 'current' && mine.masked;

    function buildDom(mine) {
        const seg = (items, key) => h('div', { class: 'stcr-seg stcr-studio-seg', role: 'group' },
            ...items.map(item => h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', [`data-${key}`]: String(item.id), text: item.label, title: item.title ?? '' })));
        const sw = (label, key, hint) => {
            const input = h('input', { type: 'checkbox', role: 'switch', class: 'stcr-switch-input', 'data-shot-flag': key });
            const hintEl = hint ? h('small', { class: 'stcr-studio-hint', text: hint }) : null;
            return { el: h('label', { class: 'stcr-switch stcr-studio-switch' }, input, h('span', { class: 'stcr-switch-track', 'aria-hidden': 'true' }),
                h('span', { class: 'stcr-studio-switch-label', text: label }), hintEl), hint: hintEl };
        };
        const section = (title, ...children) => h('section', { class: 'stcr-studio-sec' }, h('h3', { class: 'stcr-studio-sec-title', text: title }), ...children);
        const addForm = (key, placeholder, label) => h('form', { class: 'stcr-studio-add', 'data-shot-add': key },
            h('input', { type: 'text', class: 'text_pole stcr-studio-input', maxlength: '40', placeholder, 'aria-label': label }),
            h('button', { type: 'submit', class: 'stcr-btn stcr-text-btn', text: '添加' }));

        const sources = seg([{ id: 'current', label: '当前画面', title: '你在阅读器里点到、滚到的样子' }, { id: 'initial', label: '初始画面', title: '这段 HTML 刚打开时的样子' }], 'shot-source');
        const network = sw('带上外链素材', 'network', 'HTML 里引用的网上图片、字体、样式一起放进图里；有的网站不允许，会提示');
        const widths = seg(HTML_WIDTHS, 'shot-width');
        const scales = seg(SCALES, 'shot-scale');
        const unfold = sw('长图', 'unfold', '把里面的滚动区（比如聊天记录列表）展开，所有内容出现在一张图里');
        const saveAll = h('button', { type: 'button', class: 'stcr-btn stcr-studio-export', 'data-shot': 'save-all' },
            h('i', { class: 'fa-solid fa-download', 'aria-hidden': 'true' }), h('span', { text: '保存整张' }));
        const saveCrop = h('button', { type: 'button', class: 'stcr-btn stcr-studio-export', 'data-shot': 'save-crop', disabled: true },
            h('i', { class: 'fa-solid fa-crop-simple', 'aria-hidden': 'true' }), h('span', { text: '保存选区' }));
        const clearBtn = h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', 'data-shot': 'clear', text: '清除选区', disabled: true });
        const cropInfo = h('span', { class: 'stcr-shot-crop-info' });
        const status = h('div', { class: 'stcr-shot-status', role: 'status', 'aria-live': 'polite' });
        const warn = h('div', { class: 'stcr-shot-warn', hidden: true });
        const slot = h('div', { class: 'stcr-shot-slot' });
        const wordChips = h('div', { class: 'stcr-studio-chips' });
        const tempChips = h('div', { class: 'stcr-studio-chips' });
        const head = h('header', { class: 'stcr-studio-head' },
            iconButton('fa-xmark', '关闭（Esc）', { 'data-shot': 'close' }),
            h('h2', { class: 'stcr-studio-title', text: '截图分享' }),
            h('span', { class: 'stcr-studio-sub', text: `第 ${mine.where.index + 1} 楼 · HTML` }),
            saveCrop, saveAll);
        const maskedNote = h('p', { class: 'stcr-studio-hint stcr-shot-masked-note', hidden: true,
            text: '取自阅读器里已经脱敏的当前画面：名字和替换规则已经换过了，这里的开关不会把原词换回来。还可以在下面追加屏蔽词。' });
        const sideMain = h('div', { class: 'stcr-studio-side-main' },
            section('画面', sources),
            section('宽度', widths),
            section('清晰度', scales),
            section('长度', unfold.el),
            section('外链', network.el),
            section('名字替换', maskedNote, sw('自动名字', 'autoNames', '角色名、你的名字换成 char / user').el, sw('我的规则', 'myRules', '比如"灯塔 → 某地"').el,
                h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-studio-rules', 'data-shot': 'rules', title: '自己定"某个词总是换成什么"' },
                    h('i', { class: 'fa-solid fa-list-check', 'aria-hidden': 'true' }), ' 管理替换规则…')),
            section('屏蔽词（永久）', wordChips, addForm('permanent', '输入要遮住的词，回车添加', '添加屏蔽词'),
                h('p', { class: 'stcr-studio-hint', text: '和分享卡片、脱敏显示是同一张表。遮住的词在图上变成 █。' })),
            section('临时遮住（只这张图）', tempChips, addForm('temp', '只在这张图上遮住的词', '添加临时遮住的词')));
        const rulesHost = h('div', { class: 'stcr-studio-side-rules', hidden: true });
        const side = h('aside', { class: 'stcr-studio-side', 'aria-label': '截图设置' }, sideMain, rulesHost);
        const foot = h('div', { class: 'stcr-shot-foot' }, cropInfo, clearBtn);
        const stage = h('div', { class: 'stcr-shot-stage' },
            h('p', { class: 'stcr-shot-tip', text: '在图上按住拖一下，可以只框一部分；框里拖动能移动，四个角能调大小。"当前画面"是你点开截图那一刻的样子，之后再在游戏里点什么，这张图都不变。' }),
            status, warn, slot, foot);
        const dialog = h('div', { class: 'stcr-studio stcr-shot', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'HTML 截图分享', tabindex: '-1' },
            head, h('div', { class: 'stcr-studio-body' }, stage, side));

        dialog.addEventListener('click', event => {
            const t = event.target;
            const width = t.closest('[data-shot-width]')?.dataset.shotWidth;
            if (width) { mine.width = width === 'fit' ? 'fit' : Number(width); sync(mine); refresh(mine); return; }
            const source = t.closest('[data-shot-source]')?.dataset.shotSource;
            if (source) {
                if (source === 'current' && mine.current === null) return; // 没取到当前画面
                mine.source = source; sync(mine); refresh(mine); return;
            }
            const scale = t.closest('[data-shot-scale]')?.dataset.shotScale;
            if (scale) { mine.scale = Number(scale); sync(mine); refresh(mine); return; }
            const drop = t.closest('[data-word-drop]');
            if (drop) { dropWord(mine, drop.dataset.wordKind, drop.dataset.wordDrop); return; }
            switch (t.closest('[data-shot]')?.dataset.shot) {
                case 'close': close(); return;
                case 'save-all': save(mine, false); return;
                case 'save-crop': save(mine, true); return;
                case 'clear': mine.preview?.clear(); return;
                case 'rules': showRules(mine); return;
                default:
            }
        });
        dialog.addEventListener('submit', event => {
            const form = event.target.closest('[data-shot-add]');
            if (!form) return;
            event.preventDefault();
            const input = form.querySelector('input');
            addWord(mine, form.dataset.shotAdd, input.value).then(ok => { if (ok) input.value = ''; });
        });
        dialog.addEventListener('change', event => {
            const key = event.target.dataset?.shotFlag;
            if (!key) return;
            mine[key] = event.target.checked;
            sync(mine);
            refresh(mine);
        });
        dialog.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || event.target.closest('[data-stcr-crop-box]')) return;
            event.preventDefault();
            event.stopPropagation();
            if (!mine.els.rulesHost.hidden) { if (!mine.rulesPage?.isEditing()) hideRules(mine); return; }
            close();
        });
        return { dialog, sources, maskedNote, warn, widths, scales, unfoldHint: unfold.hint, saveAll, saveCrop, clearBtn, cropInfo, status, slot, stage, side, sideMain, rulesHost, wordChips, tempChips };
    }

    function sync(mine) {
        for (const b of mine.els.sources.children) {
            b.classList.toggle('stcr-on', b.dataset.shotSource === mine.source);
            if (b.dataset.shotSource === 'current') {
                b.disabled = mine.current === null && !mine.busy;
                b.title = mine.currentError ? `当前画面没取到：${mine.currentError}` : b.disabled ? '这段 HTML 还没渲染出来，只能截初始画面' : '你在阅读器里点到、滚到的样子';
            }
        }
        const masked = alreadyMasked(mine);
        mine.els.maskedNote.hidden = !masked;
        for (const key of ['autoNames', 'myRules']) {
            const input = mine.els.dialog.querySelector(`[data-shot-flag="${key}"]`);
            input.disabled = masked;
            input.closest('label').classList.toggle('stcr-studio-switch--off', masked);
        }
        for (const b of mine.els.widths.children) b.classList.toggle('stcr-on', b.dataset.shotWidth === String(mine.width));
        for (const b of mine.els.scales.children) b.classList.toggle('stcr-on', Number(b.dataset.shotScale) === mine.scale);
        for (const input of mine.els.dialog.querySelectorAll('[data-shot-flag]')) {
            const key = input.dataset.shotFlag;
            input.checked = key === 'unfold' ? unfoldOn(mine) : mine[key];
        }
    }

    function chips(list, kind) {
        if (!list.length) return [h('span', { class: 'stcr-studio-hint', text: kind === 'temp' ? '没有。' : '还没有屏蔽词。' })];
        return list.map(word => h('span', { class: `stcr-word-chip${kind === 'temp' ? ' stcr-word-chip--temp' : ''}` }, h('span', { text: word }),
            iconButton('fa-xmark', kind === 'temp' ? `不再遮住：${word}` : `从屏蔽词里移除：${word}`, { class: 'stcr-word-x', 'data-word-drop': word, 'data-word-kind': kind })));
    }
    function syncWords(mine) {
        mine.els.wordChips.replaceChildren(...chips(mine.permanent, 'permanent'));
        mine.els.tempChips.replaceChildren(...chips(mine.temp, 'temp'));
    }

    async function addWord(mine, kind, value) {
        const word = cleanMaskWord(value);
        if (!word) { if (String(value ?? '').trim()) toast('一个词最多 40 个字'); return false; }
        if (mine.permanent.includes(word) || (kind === 'temp' && mine.temp.includes(word))) { toast(`"${word}"已经遮住了`); return true; }
        if (kind === 'temp') mine.temp = [...mine.temp, word];
        else {
            try { mine.permanent = await store.maskWords.add(word); }
            catch (error) { toast(`屏蔽词没保存上：${error.message ?? error}`); return false; }
            if (st !== mine) return false;
            mine.temp = mine.temp.filter(w => w !== word);
            mine.changed = true;
            toast(`已加入屏蔽词：${word}`);
        }
        syncWords(mine);
        refresh(mine);
        return true;
    }
    async function dropWord(mine, kind, word) {
        if (kind === 'temp') mine.temp = mine.temp.filter(w => w !== word);
        else {
            try { mine.permanent = await store.maskWords.remove(word); }
            catch (error) { toast(`没移除成：${error.message ?? error}`); return; }
            if (st !== mine) return;
            mine.changed = true;
            toast(`已移除屏蔽词：${word}`);
        }
        syncWords(mine);
        refresh(mine);
    }

    /** 右侧切到"管理替换规则"（和卡片工作台同一个管理页）；规则一改就重做预览。 */
    function showRules(mine) {
        const { els } = mine;
        mine.rulesPage ??= createRulesManager({ host: els.dialog, chatKey: getChatKey(), toast, autoNames,
            confirm: (message, ok) => confirm(message, ok),
            onChange: () => { mine.changed = true; refresh(mine); },
            onBack: () => hideRules(mine) });
        mine.rulesPage.el.querySelector('.stcr-rules-back')?.lastChild?.replaceWith(' 返回截图设置');
        els.rulesHost.replaceChildren(mine.rulesPage.el);
        els.sideMain.hidden = true;
        els.rulesHost.hidden = false;
        els.side.scrollTop = 0;
        mine.rulesPage.load().catch(error => toast(`规则读取失败：${error.message ?? error}`));
    }
    function hideRules(mine) {
        mine.els.rulesHost.hidden = true;
        mine.els.sideMain.hidden = false;
        mine.els.side.scrollTop = 0;
    }

    const cssWidth = mine => (mine.width === 'fit' ? mine.fitWidth : mine.width);

    /** 本次截图的脱敏参数：存着的屏蔽词 + 临时词。 */
    async function options(mine) {
        const base = await maskOptions(mine.where, { autoNames: mine.autoNames, myRules: mine.myRules });
        return { ...base, maskWords: [...new Set([...base.maskWords, ...mine.temp])], alreadyMasked: alreadyMasked(mine),
            allowNetwork: mine.network, signal: mine.abort?.signal, onWarning: message => addWarning(mine, message) };
    }
    function addWarning(mine, message) {
        if (st !== mine || mine.warnings.includes(message)) return;
        mine.warnings.push(message);
        const { warn } = mine.els;
        warn.hidden = false;
        const lines = mine.warnings.slice(0, 4).map(m => h('div', { text: m }));
        if (mine.warnings.length > 4) lines.push(h('div', { text: `……还有 ${mine.warnings.length - 4} 条` }));
        // 有的网站不允许别处读取它的图片和字体（浏览器的跨域规则），这些就只能不带
        warn.replaceChildren(h('b', { text: '有些外链素材没带进图里（对方网站不允许或连不上），其余照常：' }), ...lines);
    }
    const sourceHtml = mine => (mine.source === 'current' && mine.current !== null ? mine.current : mine.html);

    /** 任何设置变了：重新生成预览（旧图与选区作废）。 */
    async function refresh(mine) {
        const run = ++mine.run;
        dropPreview(mine);
        mine.abort?.abort();
        mine.abort = new AbortController();
        mine.warnings = [];
        mine.els.warn.hidden = true;
        mine.els.warn.replaceChildren();
        setBusy(mine, true, mine.network ? '正在生成脱敏截图（带上外链素材）…' : '正在生成脱敏截图…');
        try {
            const width = cssWidth(mine);
            const opts = await options(mine);
            const html = sourceHtml(mine);
            const unfold = unfoldOn(mine);
            const unfolded = unfold
                ? await unfoldScrollAreas(html, width, { allowNetwork: opts.allowNetwork, onWarning: opts.onWarning, signal: opts.signal })
                : { html, count: 0 };
            if (st !== mine || run !== mine.run) return;
            mine.exportHtml = unfolded.html;
            mine.unfolded = unfolded.count;
            if (mine.els.unfoldHint) mine.els.unfoldHint.textContent = !unfold ? '把里面的滚动区（比如聊天记录列表）展开，所有内容出现在一张图里'
                : unfolded.count ? `已展开 ${unfolded.count} 处滚动区，所有内容都在这张图里` : '这段 HTML 里没有要展开的滚动区';
            const blob = await exportRenderedHtml(mine.exportHtml, { ...opts, width, scale: mine.scale });
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
            const tooBig = error instanceof RangeError && unfoldOn(mine) ? '（展开后太长了：试试关掉"长图"、降低清晰度，或框一部分）' : '';
            setBusy(mine, false, `截图没做出来：${error?.message ?? error}${tooBig}`, true);
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
        for (const b of els.sources.children) if (b.dataset.shotSource === 'current') b.disabled = mine.current === null;
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
                blob = await exportRenderedHtml(mine.exportHtml, { ...await options(mine), width: mine.previewWidth, scale: mine.scale, crop: selection });
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
        mine.abort?.abort();
        dropPreview(mine);
        mine.els.dialog.remove();
        onClose?.({ changed: mine.changed });
    }

    return { open, close, isOpen: () => st !== null };
}
