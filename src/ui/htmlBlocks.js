// ST Reader — AGPL-3.0
// 楼内 HTML 渲染（T44b、F10、D15/D16）：把模型写的 HTML 放进 core 的沙箱 iframe 里跑，可以点、可以调宽度。
//
// 两类（03 §5.13 识别规则，UI 不自己猜）：
//   围栏：```html … <body> … ``` —— 对应正文里的某个 <pre>；
//   裸 HTML（T51/D26）：一楼里的一段或几段标签区间 —— 对应 .mes_text 里一串相连的顶层元素；
//   前后和段间的散文留在正文里照常排版（I038）。对不上时退回老办法：整楼收进"原文"。
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
const EDGE = 16; // 伸出正文时左右各留的空
/** 只在值真的变了时写样式：同值重写也会让浏览器重排。value 为 null = 去掉。 */
function setStyle(el, name, value) {
    if ((el.style.getPropertyValue(name) || null) === value) return;
    if (value === null) el.style.removeProperty(name);
    else el.style.setProperty(name, value);
}
// 正文清洗会删掉的标签（core safeHtml 的 FORBID_TAGS 等）：数顶层元素时不算它们
const DROPPED = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'BASE', 'META', 'FORM', 'INPUT', 'BUTTON', 'AUDIO', 'VIDEO', 'SOURCE', 'TITLE', 'NOSCRIPT', 'TEMPLATE']);

/** 一段 HTML 的顶层元素标签序列（html/head/body 外壳展开，和正文清洗后的样子一致）。template 是惰性的，不加载任何资源。 */
function topTags(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return [...t.content.children].map(el => el.tagName).filter(tag => !DROPPED.has(tag));
}

/**
 * 裸 HTML 的每一段在已经排好版的正文里对应哪几个顶层元素。
 * 不拿原文偏移去切排好版的 HTML（正则 / Markdown 会改变长度，I038），而是按顶层标签序列依次对上。
 * @returns {{kind:'raw', html:string, pre:null, nodes:[Element, Element]}[]|null} 有一段对不上就返回 null
 */
function locateRaw(textEl, raws) {
    const kids = [...textEl.children];
    // Markdown 会把单独一行的 <html><head><style> 包进 <p>（html/head 被清洗掉）：只装着 style 的 p 当作那个 style（T75）
    const tagOf = el => el.tagName === 'P' && el.children.length === 1 && el.firstElementChild.tagName === 'STYLE'
        && !el.textContent.replace(el.firstElementChild.textContent, '').trim() ? 'STYLE' : el.tagName;
    const out = [];
    let from = 0;
    for (const block of raws) {
        const want = topTags(block.html);
        let hit = -1;
        for (let i = from; want.length && i + want.length <= kids.length; i++) {
            if (want.every((tag, j) => tagOf(kids[i + j]) === tag)) { hit = i; break; }
        }
        if (hit < 0) return null;
        out.push({ kind: 'raw', html: block.html, pre: null, nodes: [kids[hit], kids[hit + want.length - 1]] });
        from = hit + want.length;
    }
    return out;
}

/**
 * 找出这一楼正文里的 HTML 块。raw = 这一候选的原文，display = 显示正则之后的正文（renderMessage().displayText）。
 * 必须在脱敏显示改动正文之前调用：沙箱、截图、复制脱敏版都从未脱敏的 display 出发。
 * @returns {{kind:'fenced'|'raw', html:string, pre:HTMLElement|null, nodes?:[Element, Element]|null}[]}
 */
export function findHtmlBlocks(textEl, raw, display = raw) {
    const detect = value => { try { return detectHtmlBlocks(typeof value === 'string' ? value : '').filter(block => block.kind === 'raw'); } catch { return []; } };
    // T75（I057/I058）：在显示正则之后的正文上找（排好版的正文就是它变来的，才对得上）。
    // 原文里模型自己写了裸 HTML：按正则后的样子框；原文没有：只框正则产出的整页（html/body），普通美化照旧留在正文里
    const text = typeof display === 'string' ? display : '';
    const modelHtml = detect(raw).length > 0;
    const raws = detect(text).filter(block => modelHtml || /<(?:html|body)\b/i.test(block.html));
    if (raws.length) {
        return locateRaw(textEl, raws)
            // 对不上（清洗或 Markdown 改了结构）：整楼当一块，和以前一样，至少能看
            ?? [{ kind: 'raw', html: text.slice(raws[0].start, raws.at(-1).end), pre: null, nodes: null }];
    }
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
 * @param {()=>boolean} [opts.isPaged] 分页模式（伸出与缩放和滚动模式相同，D27；留着给以后区分）
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

    // 窗口变了、正文栏变宽变窄（跟随 ST 的宽度会变）：重新算伸出与缩放。只看宽度——高度变化（翻页加楼、沙箱长高）不用重算
    let lastWidths = '';
    const ro = new ResizeObserver(() => {
        const widths = `${scroller.clientWidth}:${chat.clientWidth}`;
        if (widths === lastWidths) return;
        lastWidths = widths;
        for (const entry of live.values()) layout(entry);
    });
    ro.observe(scroller);
    ro.observe(chat);

    // T82：阅读器空闲时先建好的楼还没插进页面，里面的块先"挂着"，清扫时不当成被换掉的楼
    const held = new Set();
    let holding = false;
    function sweep() {
        for (const [shell, entry] of live) if (!shell.isConnected && !held.has(shell)) drop(shell, entry);
    }
    /** 在 run 里接上的块都先挂着（预建）。 */
    function prebuild(run) {
        holding = true;
        try { return run(); } finally { holding = false; }
    }
    /** 预建的楼：keep = 马上插进页面（不再挂着）；否则作废，块一并注销。 */
    function settle(nodes, keep) {
        for (const node of nodes) {
            const shells = node.matches?.('.stcr-html') ? [node] : node.querySelectorAll?.('.stcr-html') ?? [];
            for (const shell of shells) {
                held.delete(shell);
                const entry = live.get(shell);
                if (!keep && entry) drop(shell, entry);
            }
        }
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
                source = h('div', { class: 'stcr-html-src' });
                if (block.nodes?.[0].parentNode === textEl) {
                    // 只把这一段标签收进"原文"容器，前后的散文留在正文里
                    const [first, last] = block.nodes;
                    first.before(source);
                    for (let node = first; node;) {
                        const next = node.nextSibling;
                        source.append(node);
                        if (node === last) break;
                        node = next;
                    }
                } else {
                    // 对不上时的退路：整楼收进"原文"容器
                    source.append(...textEl.childNodes);
                    textEl.append(source);
                }
            }
            source.classList.add('stcr-html-src');
            // 宽度在接上时定下来：之后在别的块上换宽度（会记成新默认）不影响已经显示着的这一块
            if (state.get(key)?.width === undefined) set(key, { width: defaults().width });
            const entry = { key, block, source, where, view: null, build: 0, height: heights.get(key) ?? DEFAULT_HEIGHT };
            entry.mode = () => get(key).mode;
            entry.shell = buildShell(entry);
            source.before(entry.shell);
            live.set(entry.shell, entry);
            if (holding) held.add(entry.shell);
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
        // T80"隐藏 HTML 工具条"开着时，触屏没有悬停：点块右上角这个小钮把工具条叫出来（点别处收起）
        const handle = iconButton('fa-ellipsis', 'HTML 工具条（渲染 / 原文、宽度、截图）', { class: 'stcr-html-handle', 'aria-expanded': 'false' });
        const shell = h('div', { class: 'stcr-html', 'data-stcr-ignore-anchor': '', 'data-html-key': entry.key }, bar, stage, handle);
        handle.addEventListener('click', () => showBar(shell, !shell.classList.contains('stcr-html--bar-on')));
        bar.addEventListener('click', event => {
            const mode = event.target.closest('[data-html]')?.dataset.html;
            if (mode) { setMode(entry, mode); return; }
            const width = event.target.closest('[data-html-width]')?.dataset.htmlWidth;
            if (width) { setWidth(entry, width === 'fit' ? 'fit' : Number(width)); return; }
            if (event.target.closest('[data-html-act="net"]')) toggleNetwork(entry);
        });
        entry.els = { modeSeg, widthSeg, net, frame, stage, status: bar.querySelector('.stcr-html-status') };
        entry.scale = 1;
        return shell;
    }

    function showBar(shell, on) {
        shell.classList.toggle('stcr-html--bar-on', on);
        shell.querySelector(':scope > .stcr-html-handle')?.setAttribute('aria-expanded', String(on));
    }
    // 叫出来的工具条：点到这一块以外就收起
    scroller.addEventListener('click', event => {
        for (const shell of chat.querySelectorAll('.stcr-html--bar-on')) if (!shell.contains(event.target)) showBar(shell, false);
    });

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
     * 比正文宽的预设（例如桌面 1200，D27）：先向两边伸出去，占到阅读区的可用宽度（左右各留 16px）；
     * 还放不下就整块等比缩小到可用宽度，高度按缩小后的实际高度收紧——不裁切、不横向滚动。滚动 / 分页一样。
     */
    function layout(entry) {
        const { stage, frame } = entry.els;
        // 先算后写、只写变了的值：先清样式再量会让浏览器按"没缩放"的高度排一次版，滚动锚定跟着跳（阅读位置被推走）
        let width = null, left = null, want = 0, scale = 1;
        if (entry.mode() === 'render' && entry.shell.isConnected) {
            want = pixelWidth(entry);
            const col = entry.shell.getBoundingClientRect();
            if (col.width > 0 && want > col.width + 1) {
                // 滚动区两侧都留了滚动条的位置（scrollbar-gutter: both-edges），可用区是去掉两边之后的中间
                const gutter = (scroller.offsetWidth - scroller.clientWidth) / 2;
                const left0 = scroller.getBoundingClientRect().left + gutter + EDGE;
                const room = Math.max(col.width, Math.floor(scroller.clientWidth - 2 * EDGE));
                width = Math.min(want, room);
                left = Math.round(left0 + (room - width) / 2 - col.left);
                if (want > width) scale = Math.floor(width / want * 10000) / 10000; // 四位小数：和样式里读回来的值一致
            }
            // 跟随正文的宽度会随窗口变：变了就重建一次（去抖）
            if (get(entry.key).width === 'fit') refit(entry);
        }
        entry.scale = scale;
        setStyle(stage, 'width', width === null ? null : `${width}px`);
        setStyle(stage, 'margin-left', left === null ? null : `${left}px`);
        setStyle(frame, 'width', scale < 1 ? `${want}px` : null);
        setStyle(frame, 'transform', scale < 1 ? `scale(${scale})` : null);
        if (scale < 1) fitHeight(entry);
        else setStyle(stage, 'height', null);
        showStatus(entry);
    }
    /** transform 不改变占位：缩小时外框高度按缩小后的实际高度收紧，不留空白。 */
    function fitHeight(entry) {
        if (entry.scale < 1) setStyle(entry.els.stage, 'height', `${Math.ceil(entry.els.frame.offsetHeight * entry.scale)}px`);
    }
    /** 状态小字：正在渲染… / 已缩放 83% · 已断网 */
    function showStatus(entry) {
        if (entry.rendering) { entry.els.status.textContent = '正在渲染…'; return; }
        const parts = [];
        if (entry.view && entry.scale < 1) parts.push(`已缩放 ${Math.round(entry.scale * 100)}%`);
        if (entry.view && !get(entry.key).network) parts.push('已断网');
        entry.els.status.textContent = parts.join(' · ');
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
        entry.rendering = false;
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
        entry.rendering = true;
        status.textContent = '正在渲染…';
        let html;
        try { html = await prepare(entry.block.html, entry.where); }
        catch (error) {
            // I033：脱敏没做成时绝不退回原文渲染——连同已经在跑的旧沙箱（可能是脱敏前的原文）一起拆掉，只留提示和重试
            if (build !== entry.build || destroyed) return;
            entry.rendering = false;
            console.warn('[st-reader] HTML 脱敏失败，这一块先不显示', error);
            entry.view?.destroy();
            entry.view = null;
            entry.builtWidth = null;
            status.textContent = '';
            entry.els.frame.replaceChildren(h('div', { class: 'stcr-html-fail' },
                h('span', { text: '脱敏没做成，为了不露出原词，这段 HTML 先不显示。' }),
                h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', text: '再试一次', onclick: () => start(entry) })));
            return;
        }
        if (build !== entry.build || !live.has(entry.shell)) return;
        entry.shownMasked = html !== entry.block.html; // 沙箱里跑的是脱敏过的（截当前画面时不再串换，I032）
        const onHeight = height => {
            entry.height = height;
            heights.set(entry.key, height);
            entry.els.frame.style.minHeight = '';
            fitHeight(entry);
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
            entry.rendering = false;
        } catch (error) {
            if (build !== entry.build || destroyed) return; // 被更新的一次顶替了
            entry.rendering = false;
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
        const view = entry.view && entry.builtWidth ? entry.view : null; // 已经渲染好的那一个
        return { html: entry.block.html, where: entry.where, width: pixelWidth(entry), widthChoice: get(entry.key).width,
            network: get(entry.key).network, masked: !!view && !!entry.shownMasked,
            // 截当前画面（I032）：只读取沙箱此刻的 DOM，返回不可信 HTML 字符串；没渲染时为 null
            snapshot: view ? options => view.snapshot(options) : null };
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

    return { attach, entryFor, resetAll, destroy, prebuild, settle, liveCount: () => live.size };
}
