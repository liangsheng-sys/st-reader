// ST Reader — AGPL-3.0
// 楼内 HTML 渲染（T44b、F10、D15/D16）：把模型写的 HTML 放进 core 的沙箱 iframe 里跑，可以点、可以调宽度。
//
// 两类（03 §5.13 识别规则，UI 不自己猜）：
//   围栏：```html … <body> … ``` —— 对应正文里的某个 <pre>；
//   裸 HTML：整楼就是一份 HTML 文档 —— 对应整个 .mes_text。
// 做法与脱敏显示同理（不破坏划线）：原来的代码块 / 正文**留在原位**，渲染时只是隐藏；渲染区整块标 data-stcr-ignore-anchor。
// 所以"渲染 / 原文"来回切、换宽度，锚点文字一个字都不变，已有划线照常在原文视图里。
//
// 沙箱是贵的（每个一个 iframe）：离视口还有一屏远时才建，楼层被换掉 / 阅读器关掉就 destroy（core 要求）。
// 外链（D16，2026-09-30 人类修订）：默认允许，Aa 里能整体关掉；每一块还能单独断网。截图始终断网（core 保证）。

import { createSandbox, detectHtmlBlocks } from '../core/htmlRenderer.js';
import { h, iconButton } from './dom.js';

export const HTML_WIDTHS = Object.freeze([
    { id: 390, label: '手机', title: '手机宽度 390px' },
    { id: 768, label: '平板', title: '平板宽度 768px' },
    { id: 1200, label: '桌面', title: '桌面宽度 1200px' },
    { id: 'fit', label: '跟随正文', title: '和正文一样宽' },
]);
const DEFAULT_HEIGHT = 240;
const SHELL = '.stcr-html';

/**
 * 找出这一楼正文里的 HTML 块。raw = 这一候选的原文（识别裸 HTML 用）。必须在脱敏显示改动正文之前调用：
 * 这里读到的代码是原文，沙箱、截图、复制脱敏版都从原文出发。
 * @returns {{kind:'fenced'|'raw', html:string, pre:HTMLElement|null}[]}
 */
export function findHtmlBlocks(textEl, raw) {
    let found;
    try { found = detectHtmlBlocks(typeof raw === 'string' ? raw : ''); } catch { found = []; }
    if (found.length === 1 && found[0].kind === 'raw') return [{ kind: 'raw', html: found[0].html, pre: null }];
    const blocks = [];
    for (const pre of textEl.querySelectorAll('pre')) {
        const code = pre.querySelector('code');
        if (!code || pre.closest(SHELL)) continue;
        const html = code.textContent ?? '';
        // 与 core 用同一条规则：放回一对围栏里让 core 判断（内部必须有真正的 <body>）
        let hit = [];
        try { hit = detectHtmlBlocks(`\`\`\`\n${html}\n\`\`\``); } catch { hit = []; }
        if (hit.length) blocks.push({ kind: 'fenced', html, pre });
    }
    return blocks;
}

/**
 * 每个阅读器会话一个。
 * @param {object} opts
 * @param {HTMLElement} opts.scroller 正文滚动容器（懒加载的视口）
 * @param {HTMLElement} opts.chat #stcr_chat（楼层被换掉时回收沙箱）
 * @param {()=>{mode:'render'|'source', network:boolean, width:number|'fit'}} opts.defaults Aa 里的默认值
 * @param {(width:number|'fit')=>void} opts.rememberWidth 最近选的宽度记成默认
 * @param {(html:string, where:object)=>Promise<string>|string} opts.prepare 显示前处理（脱敏显示开着时换词）
 * @param {()=>boolean} opts.isPaged 分页模式不做加宽
 * @param {(message:string)=>void} opts.toast
 */
export function createHtmlManager({ scroller, chat, defaults, rememberWidth, prepare, isPaged, toast }) {
    /** key → {mode, width, network}：本次打开阅读器期间逐块记住（不存盘） */
    const state = new Map();
    /** key → 最近一次高度，重建 / 翻回来时先占好位置，不跳 */
    const heights = new Map();
    /** 活着的块：shell → entry */
    const live = new Map();
    let destroyed = false;

    const io = new IntersectionObserver(entries => {
        for (const item of entries) {
            if (!item.isIntersecting) continue;
            const entry = live.get(item.target);
            if (entry && !entry.view && entry.mode() === 'render') start(entry);
        }
    }, { root: scroller, rootMargin: '900px 0px' });

    // 楼层被换掉（换候选、翻页裁窗、重排）：它里面的沙箱一起销毁
    let sweepQueued = false;
    const mo = new MutationObserver(records => {
        if (sweepQueued || !records.some(r => r.removedNodes.length)) return;
        sweepQueued = true;
        queueMicrotask(() => { sweepQueued = false; sweep(); });
    });
    mo.observe(chat, { childList: true, subtree: true });

    const ro = new ResizeObserver(() => { for (const entry of live.values()) layout(entry); });
    ro.observe(scroller);

    function sweep() {
        for (const [shell, entry] of live) if (!shell.isConnected) drop(shell, entry);
    }
    function drop(shell, entry) {
        io.unobserve(shell);
        clearTimeout(entry.fitTimer);
        entry.view?.destroy();
        entry.view = null;
        entry.build++;
        live.delete(shell);
    }

    /**
     * 给一楼接上 HTML 块。floorEl 可能还没挂到页面上（建好再插入），懒加载会在它进入视口附近时开始。
     * @param {HTMLElement} textEl 这一楼的 .mes_text
     * @param {ReturnType<typeof findHtmlBlocks>} blocks
     * @param {{index:number, swipe:number, floorName:string}} where
     */
    function attach(textEl, blocks, where) {
        blocks.forEach((block, i) => {
            const key = `${where.index}:${where.swipe}:${i}`;
            let source = block.pre;
            if (block.kind === 'raw') {
                // 整楼裸 HTML：把 ST 式的显示整体收进"原文"容器
                source = h('div', { class: 'stcr-html-src' });
                source.append(...textEl.childNodes);
                textEl.append(source);
            }
            source.classList.add('stcr-html-src');
            // 宽度在接上时定下来：之后在别的块上换宽度（会记成新默认）不影响已经显示着的这一块
            if (state.get(key)?.width === undefined) set(key, { width: defaults().width });
            const entry = { key, block, source, where, view: null, build: 0, height: heights.get(key) ?? DEFAULT_HEIGHT };
            entry.mode = () => get(key).mode;
            entry.shell = buildShell(entry);
            source.before(entry.shell);
            live.set(entry.shell, entry);
            paint(entry);
            io.observe(entry.shell);
        });
    }

    function get(key) {
        const d = defaults();
        const own = state.get(key) ?? {};
        return { mode: own.mode ?? d.mode, width: own.width ?? d.width, network: own.network ?? d.network };
    }
    function set(key, patch) { state.set(key, { ...(state.get(key) ?? {}), ...patch }); }

    function buildShell(entry) {
        const modeSeg = h('div', { class: 'stcr-seg stcr-html-mode', role: 'group', 'aria-label': '渲染或原文' },
            h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-html': 'render', text: '渲染', title: '在安全的沙箱里运行这段 HTML' }),
            h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-html': 'source', text: '原文', title: '看代码 / 原来的样子（划线在这里）' }));
        const widthSeg = h('div', { class: 'stcr-seg stcr-html-widths', role: 'group', 'aria-label': '渲染宽度' },
            ...HTML_WIDTHS.map(w => h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-html-width': String(w.id), text: w.label, title: w.title })));
        const net = iconButton('fa-globe', '', { class: 'stcr-html-net', 'data-html-act': 'net' });
        const bar = h('div', { class: 'stcr-html-bar' },
            h('span', { class: 'stcr-html-tag', 'aria-hidden': 'true' }, h('i', { class: 'fa-solid fa-code' }), ' HTML'),
            modeSeg, widthSeg,
            h('span', { class: 'stcr-html-gap' }),
            h('span', { class: 'stcr-html-status', role: 'status' }),
            net,
            iconButton('fa-user-secret', '复制脱敏版代码（屏蔽词、替换规则、名字都换好）', { 'data-act': 'copy-html-masked' }),
            iconButton('fa-camera', '截图分享（脱敏，可框选一部分）', { 'data-act': 'html-shot' }));
        const frame = h('div', { class: 'stcr-html-frame' });
        const stage = h('div', { class: 'stcr-html-stage' }, frame);
        const shell = h('div', { class: 'stcr-html', 'data-stcr-ignore-anchor': '', 'data-html-key': entry.key }, bar, stage);
        bar.addEventListener('click', event => {
            const mode = event.target.closest('[data-html]')?.dataset.html;
            if (mode) { setMode(entry, mode); return; }
            const width = event.target.closest('[data-html-width]')?.dataset.htmlWidth;
            if (width) { setWidth(entry, width === 'fit' ? 'fit' : Number(width)); return; }
            if (event.target.closest('[data-html-act="net"]')) toggleNetwork(entry);
        });
        entry.els = { modeSeg, widthSeg, net, frame, stage, status: bar.querySelector('.stcr-html-status') };
        return shell;
    }

    function paint(entry) {
        const s = get(entry.key);
        const render = s.mode === 'render';
        entry.shell.classList.toggle('stcr-html--source', !render);
        entry.source.classList.toggle('stcr-html-src--hidden', render);
        for (const b of entry.els.modeSeg.children) b.classList.toggle('stcr-on', b.dataset.html === s.mode);
        for (const b of entry.els.widthSeg.children) b.classList.toggle('stcr-on', b.dataset.htmlWidth === String(s.width));
        const net = entry.els.net;
        net.classList.toggle('stcr-on', s.network);
        const netTitle = s.network
            ? '外链已允许：这段 HTML 可以加载网上的字体、图片等（地址来自模型写的代码）。点这里只对这一块断网'
            : '已断网：这段 HTML 不能加载任何网上的资源。点这里允许（只对这一块）';
        net.title = netTitle;
        net.setAttribute('aria-label', netTitle);
        net.setAttribute('aria-pressed', String(s.network));
        net.querySelector('i').className = `fa-solid ${s.network ? 'fa-globe' : 'fa-plug-circle-xmark'}`;
        entry.els.frame.style.minHeight = render ? `${entry.height}px` : '';
        layout(entry);
    }

    /** 实际像素宽：跟随正文 = 渲染区可用宽度。 */
    function pixelWidth(entry) {
        const s = get(entry.key);
        if (s.width !== 'fit') return s.width;
        const w = Math.floor(entry.shell.parentElement?.clientWidth || entry.shell.clientWidth || 600);
        return Math.max(240, Math.min(8192, w));
    }

    /**
     * 比正文宽的预设（例如桌面 1200）：渲染区向两边伸出去，占到阅读区的可用宽度，仍放不下就横向滚动。
     * 分页模式按列排版，不伸出去，只在列内横向滚动。
     */
    function layout(entry) {
        const { stage } = entry.els;
        stage.style.removeProperty('width');
        stage.style.removeProperty('margin-left');
        if (entry.mode() !== 'render' || !entry.shell.isConnected || isPaged()) return;
        const want = pixelWidth(entry);
        const col = entry.shell.getBoundingClientRect();
        if (want <= col.width + 1) return;
        const area = scroller.getBoundingClientRect();
        const room = Math.max(col.width, area.width - 48);
        const width = Math.min(want, room);
        const left = area.left + (area.width - width) / 2 - col.left;
        stage.style.setProperty('width', `${Math.round(width)}px`);
        stage.style.setProperty('margin-left', `${Math.round(left)}px`);
        // 跟随正文的宽度会随窗口变：变了就重建一次（去抖）
        if (get(entry.key).width === 'fit') refit(entry);
    }
    function refit(entry) {
        const w = pixelWidth(entry);
        if (!entry.view || entry.builtWidth === w) return;
        clearTimeout(entry.fitTimer);
        entry.fitTimer = setTimeout(() => { if (live.has(entry.shell) && entry.mode() === 'render') start(entry); }, 250);
    }

    function setMode(entry, mode) {
        set(entry.key, { mode });
        paint(entry);
        if (mode === 'render') { if (!entry.view) start(entry); }
        else stop(entry); // 看原文时不留一个在后台跑脚本的沙箱
    }
    function stop(entry) {
        entry.build++;
        clearTimeout(entry.fitTimer);
        entry.view?.destroy();
        entry.view = null;
        entry.builtWidth = null;
        entry.els.frame.replaceChildren();
        entry.els.status.textContent = '';
    }
    function setWidth(entry, width) {
        set(entry.key, { width });
        rememberWidth(width);
        paint(entry);
        if (entry.mode() === 'render') start(entry);
    }
    function toggleNetwork(entry) {
        const on = !get(entry.key).network;
        set(entry.key, { network: on });
        paint(entry);
        toast(on ? '这一块已允许加载外链资源' : '这一块已断网');
        if (entry.mode() === 'render') start(entry);
    }

    /** 建（或按新宽度 / 外链状态重建）沙箱。每次都显式传 allowNetwork（core 省略即断网）。 */
    async function start(entry) {
        if (destroyed || !live.has(entry.shell)) return;
        const build = ++entry.build;
        const s = get(entry.key);
        const width = pixelWidth(entry);
        const status = entry.els.status;
        status.textContent = '正在渲染…';
        let html;
        try { html = await prepare(entry.block.html, entry.where); }
        catch (error) { console.warn('[st-reader] HTML 显示前处理失败，按原样渲染', error); html = entry.block.html; }
        if (build !== entry.build || !live.has(entry.shell)) return;
        const onHeight = height => {
            entry.height = height;
            heights.set(entry.key, height);
            entry.els.frame.style.minHeight = '';
        };
        try {
            if (entry.view) {
                await entry.view.update(html, { width, allowNetwork: s.network, onHeight });
            } else {
                entry.view = createSandbox(html, { width, allowNetwork: s.network, onHeight });
                entry.els.frame.replaceChildren(entry.view.iframe);
                await entry.view.ready;
            }
            if (build !== entry.build) return;
            entry.builtWidth = width;
            status.textContent = s.network ? '' : '已断网';
        } catch (error) {
            if (build !== entry.build || destroyed) return; // 被更新的一次顶替了
            console.warn('[st-reader] HTML 渲染失败', error);
            entry.view?.destroy();
            entry.view = null;
            status.textContent = '';
            entry.els.frame.replaceChildren(h('div', { class: 'stcr-html-fail' },
                h('span', { text: '这段 HTML 没能渲染出来。' }),
                h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', text: '看原文', onclick: () => setMode(entry, 'source') }),
                h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', text: '再试一次', onclick: () => start(entry) })));
        }
        layout(entry);
    }

    /** 这一块此刻的信息（截图 / 复制用）。 */
    function entryFor(el) {
        const shell = el.closest(SHELL);
        const entry = shell && live.get(shell);
        if (!entry) return null;
        return { html: entry.block.html, where: entry.where, width: pixelWidth(entry), widthChoice: get(entry.key).width };
    }

    /** Aa 里改了默认（渲染 / 原文、外链）：清掉逐块的这一项，全部按新默认重来。 */
    function resetAll(fields) {
        for (const [key, value] of state) {
            const next = { ...value };
            for (const f of fields) delete next[f];
            state.set(key, next);
        }
        for (const entry of live.values()) {
            paint(entry);
            if (entry.mode() === 'render') { if (entry.view || isNear(entry)) start(entry); }
            else stop(entry);
        }
    }
    function isNear(entry) {
        const r = entry.shell.getBoundingClientRect(), a = scroller.getBoundingClientRect();
        return r.bottom > a.top - 900 && r.top < a.bottom + 900;
    }

    function destroy() {
        destroyed = true;
        io.disconnect();
        mo.disconnect();
        ro.disconnect();
        for (const [shell, entry] of live) drop(shell, entry);
        state.clear();
    }

    return { attach, entryFor, resetAll, destroy, liveCount: () => live.size };
}
