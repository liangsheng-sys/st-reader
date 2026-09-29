// 阅读器主控（T21）：全屏覆盖层 #stcr_root、正文 #stcr_chat（D12）。
// 只读（D02）：只调 03 §5 的读取接口；候选/思维链/进度都是阅读器自己的状态，绝不写回 ST。

import { getCurrentChatKey, openChat, parseChatKey } from '../core/chatSource.js';
import { initFormatter } from '../core/formatter.js';
import { copyText, h, isTypingTarget, toast } from './dom.js';
import { createDrawer } from './drawer.js';
import { buildFloor, fillFloor, floorPlainText } from './floorToolbar.js';
import { effectivePrefs, formatStamp, hiddenUserRuns, parseJumpInput, pickSwipe, progressText, swipePreviews } from './logic.js';
import { flushProgress, getPrefs, getProgress, lastRead, onPrefsChange, rememberSwipe, setPrefs, setReadPosition } from './prefs.js';
import { createSettingsBar } from './settingsBar.js';

const PAGE_SIZE = 30;      // 每批楼数，与 core 默认一致（03 §4.5）
const MAX_PAGES = 4;       // DOM 里同时最多保留几批，其余释放（NF2）
const EDGE_SCREENS = 1.5;  // 距离边缘不到 1.5 屏就接上前/后一批

// 阅读器里的这些事件不许冒泡到 document：ST 在 document 上挂了 .mes/.mes_text/.avatar/思维链的委托点击，
// 以及 ←/→ 切换真实聊天候选（最后一个候选上会触发生成 = 写聊天）的全局按键。见 06 I012。
const CONTAINED_EVENTS = ['click', 'dblclick', 'auxclick', 'contextmenu', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'touchstart', 'touchend', 'input', 'change', 'paste', 'focusin', 'focusout',
    'swiped', 'swiped-left', 'swiped-right', 'swiped-up', 'swiped-down'];
const KEY_EVENTS = ['keydown', 'keyup', 'keypress'];

/** 扩展目录名随用户怎么装而变：从本文件地址推出 third-party/<目录>。 */
const EXTENSION_ID = new URL('../..', import.meta.url).pathname.replace(/^\/scripts\/extensions\//, '').replace(/\/$/, '');
const thumb = file => `/thumbnail?type=avatar&file=${encodeURIComponent(file)}`;

let S = null; // 打开期间的会话状态；关闭即整体丢弃

export const isReaderOpen = () => S !== null;

/**
 * 打开阅读器（入口：魔杖菜单、顶栏按钮、/reader）。已打开时只切换到要求的页签/聊天。
 * @param {{tab?:'recent'|'owners'|'favorites'|'current', chatKey?:string}} [options]
 */
export async function openReader({ tab, chatKey } = {}) {
    if (S) {
        if (chatKey) loadChat(chatKey);
        if (tab) S.drawer.open(tab);
        return;
    }
    await initFormatter();
    const html = await SillyTavern.getContext().renderExtensionTemplateAsync(`${EXTENSION_ID}/src/ui/templates`, 'reader');
    if (S) return; // 等模板期间又被打开过一次
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const root = holder.querySelector('#stcr_root');
    if (!root) throw new Error('阅读器模板缺少 #stcr_root');

    const session = {
        root, scroller: root.querySelector('.stcr-scroll'), chat: root.querySelector('#stcr_chat'),
        stateBox: root.querySelector('.stcr-state'), progressBtn: root.querySelector('.stcr-progress'),
        progressLine: root.querySelector('.stcr-progress-line > span'), topPercent: root.querySelector('.stcr-top-percent'),
        titleOwner: root.querySelector('.stcr-title-owner'), titleFile: root.querySelector('.stcr-title-file'),
        handle: null, chatKey: null, owner: '', token: 0, controller: null,
        firstPage: -1, lastPage: -1, swipeView: new Map(), reasoning: new Map(), hoverIndex: null,
        userAvatar: '', restoreFocus: document.activeElement, cleanup: [], popover: null, chromeTimer: null, wheelAt: 0, wheelSum: 0,
    };
    S = session;
    session.drawer = createDrawer({
        onPick: key => { loadChat(key); if (!getPrefs().drawerPinned || innerWidth < 1000) S.drawer.close(); },
        getActiveKey: () => S?.chatKey ?? null,
        isPinned: () => getPrefs().drawerPinned,
        onPinChange: pinned => setPrefs({ drawerPinned: pinned }),
    });
    session.settings = createSettingsBar();
    root.querySelector('.stcr-body').prepend(session.drawer.el);
    root.append(session.settings.panel, session.settings.fab);

    try { session.userAvatar = (await import('/scripts/personas.js')).user_avatar ?? ''; } catch { /* 没有头像也能读 */ }
    if (S !== session) return;

    wireEvents(session);
    applyPrefs(getPrefs());
    session.cleanup.push(onPrefsChange(onPrefs));
    document.body.append(root);
    document.body.classList.add('stcr-reader-open');
    session.scroller.focus({ preventScroll: true });
    setTopbarState(true);

    const current = getCurrentChatKey();
    if (chatKey) loadChat(chatKey);
    else if (current && tab !== 'recent') loadChat(current, { index: stVisibleIndex() });
    else showEmpty();
    if (tab) session.drawer.open(tab);
    else if (!chatKey && !current) session.drawer.open('recent');
    else if (getPrefs().drawerPinned && innerWidth >= 1000) session.drawer.open();
}

export function closeReader() {
    if (!S) return;
    const session = S;
    S = null;
    session.token++;
    session.controller?.abort();
    flushProgress();
    closePopover(session);
    session.chat.replaceChildren();
    session.handle?.close();
    session.handle = null;
    session.drawer.destroy();
    for (const undo of session.cleanup) undo();
    clearTimeout(session.chromeTimer);
    session.root.remove();
    document.body.classList.remove('stcr-reader-open');
    setTopbarState(false);
    if (session.restoreFocus instanceof HTMLElement && document.contains(session.restoreFocus)) session.restoreFocus.focus({ preventScroll: true });
}

/** 顶栏书本按钮的亮/灭。按钮由 mount.js 创建。 */
function setTopbarState(open) {
    const icon = document.querySelector('#stcr_topbar_button .drawer-icon');
    icon?.classList.toggle('openIcon', open);
    icon?.classList.toggle('closedIcon', !open);
}

/** ST 主界面此刻看到的第一楼（只读 DOM），"当前"入口据此落点（02 §1.1）。 */
function stVisibleIndex() {
    const host = document.getElementById('chat');
    if (!host) return null;
    const top = host.getBoundingClientRect().top;
    for (const mes of host.querySelectorAll(':scope > .mes[mesid]')) {
        if (mes.getBoundingClientRect().bottom > top + 4) return Number(mes.getAttribute('mesid'));
    }
    return null;
}

// ───────────────────────── 事件 ─────────────────────────

function wireEvents(session) {
    const { root, scroller, chat } = session;
    // 键盘防火墙：焦点不在阅读器里时（比如落在 body），在 window 捕获阶段就截住，ST 的 document 监听收不到。
    const guard = event => {
        if (S !== session) return;
        const target = event.target;
        if (target instanceof Node && root.contains(target)) return; // 阅读器内部的由 root 冒泡监听处理
        // ST 自己的弹窗（其他扩展可能弹出）照常可用。
        if (target instanceof Element && target.closest('dialog, .popup, #toast-container')) return;
        event.stopImmediatePropagation();
        if (event.type === 'keydown') handleKey(event);
    };
    for (const type of KEY_EVENTS) {
        window.addEventListener(type, guard, true);
        session.cleanup.push(() => window.removeEventListener(type, guard, true));
    }
    for (const type of KEY_EVENTS) root.addEventListener(type, event => {
        if (type === 'keydown') handleKey(event);
        event.stopPropagation();
    });
    // 自己的点击逻辑先跑（注册在前），再统一截断冒泡。
    root.addEventListener('click', onClick);
    for (const type of CONTAINED_EVENTS) root.addEventListener(type, event => event.stopPropagation());

    let frame = 0;
    scroller.addEventListener('scroll', () => {
        if (frame) return;
        frame = requestAnimationFrame(() => { frame = 0; if (S === session) { ensureWindow(); updateProgress(); } });
    }, { passive: true });
    scroller.addEventListener('wheel', onWheel, { passive: false });
    chat.addEventListener('mouseover', event => {
        const mes = event.target.closest?.('.mes[mesid]');
        if (mes) session.hoverIndex = Number(mes.getAttribute('mesid'));
    });
    // 分页模式下手机左右滑动翻页（不用来切候选，避免与翻页冲突，02 §3.3）。
    let touch = null;
    scroller.addEventListener('touchstart', event => { touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }, { passive: true });
    scroller.addEventListener('touchend', event => {
        if (!touch || !isPaged() || getSelection()?.toString()) return;
        const dx = event.changedTouches[0].clientX - touch.x, dy = event.changedTouches[0].clientY - touch.y;
        touch = null;
        if (Math.abs(dx) > 50 && Math.abs(dy) < 40) flip(dx < 0 ? 1 : -1);
    }, { passive: true });
    root.addEventListener('mousemove', () => wakeChrome());
    const onResize = () => { if (S === session) { ensureWindow(); updateProgress(); } };
    window.addEventListener('resize', onResize);
    session.cleanup.push(() => window.removeEventListener('resize', onResize));
}

function onClick(event) {
    const session = S;
    if (!session) return;
    const target = /** @type {Element} */ (event.target);
    if (session.popover && !session.popover.contains(target) && !target.closest('[data-act="swipe-list"], [data-act="jump"]')) closePopover(session);
    if (session.settings.isOpen() && !session.settings.panel.contains(target) && target !== session.settings.fab) session.settings.close();
    // 抽屉没钉住时浮在正文上，点它外面就收起（02 §3.1）。
    if (session.drawer.isOpen() && !session.drawer.el.contains(target) && !target.closest('[data-act="drawer"], [data-act="open-drawer"]')
        && !(getPrefs().drawerPinned && innerWidth >= 1000)) {
        session.drawer.close();
        if (session.scroller.contains(target)) return; // 这一下只用来收抽屉，不顺带翻页
    }

    const summary = target.closest('.mes_reasoning_summary');
    if (summary) {
        event.preventDefault(); // 展开状态由阅读器管理，不交给 <details> 自己切
        toggleReasoning(summary.closest('.mes'));
        return;
    }
    const actEl = target.closest('[data-act]');
    const mes = target.closest('.mes[mesid]');
    const act = actEl?.dataset.act;
    if (act) {
        switch (act) {
            case 'exit': closeReader(); return;
            case 'drawer': toggleDrawer(); return;
            case 'close-drawer': session.drawer.close(); return;
            case 'jump': openJump(); return;
            case 'retry': if (session.chatKey) loadChat(session.chatKey, { index: session.retryIndex }); return;
            case 'continue': loadChat(actEl.dataset.key, { index: Number(actEl.dataset.index) }); return;
            case 'open-drawer': session.drawer.open('recent'); return;
            case 'swipe-prev': if (mes) stepSwipe(mes, -1); return;
            case 'swipe-next': if (mes) stepSwipe(mes, 1); return;
            case 'swipe-list': if (mes) openSwipeList(mes, actEl); return;
            case 'swipe-pick': setSwipe(session.chat.querySelector(`.mes[mesid="${actEl.dataset.index}"]`), Number(actEl.dataset.swipe)); closePopover(session); return;
            case 'more': mes?.classList.toggle('stcr-toolbar-pinned'); return;
            case 'reasoning': if (mes) toggleReasoning(mes); return;
            case 'copy': if (mes) copyFloor(mes); return;
            case 'copy-code': copyCode(actEl); return;
            case 'fold': toggleFold(actEl); return;
            default: break;
        }
    }
    // 分页模式：点正文左 1/3 上一页、右 1/3 下一页、中间呼出/收起顶栏（02 §1.3）。
    if (isPaged() && session.scroller.contains(target) && !target.closest('button, a, input, textarea, select, summary, pre, .stcr-floor-toolbar, .stcr-popover')
        && !getSelection()?.toString()) {
        const rect = session.scroller.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        if (x < 1 / 3) flip(-1);
        else if (x > 2 / 3) flip(1);
        else session.root.classList.toggle('stcr-chrome-hidden');
    }
}

function handleKey(event) {
    const session = S;
    if (!session || event.type !== 'keydown' || event.isComposing) return;
    if (isTypingTarget(event.target)) {
        if (event.key === 'Escape') { event.target.blur?.(); session.scroller.focus({ preventScroll: true }); event.preventDefault(); }
        return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return; // 浏览器自己的组合键（复制、查找）照常
    const paged = isPaged();
    const screen = () => session.scroller.clientHeight * 0.9;
    let handled = true;
    switch (event.key) {
        case 'Escape': closeTopLayer(); break;
        case 'ArrowRight': case 'PageDown': case ' ':
            if (event.key === ' ' && event.shiftKey) { paged ? flip(-1) : session.scroller.scrollBy({ top: -screen() }); break; }
            paged ? flip(1) : session.scroller.scrollBy({ top: screen() }); break;
        case 'ArrowLeft': case 'PageUp': paged ? flip(-1) : session.scroller.scrollBy({ top: -screen() }); break;
        case 'ArrowDown': paged ? flip(1) : session.scroller.scrollBy({ top: 60 }); break;
        case 'ArrowUp': paged ? flip(-1) : session.scroller.scrollBy({ top: -60 }); break;
        case 'Home': if (session.handle?.total) jumpTo(0); break;
        case 'End': if (session.handle?.total) jumpTo(session.handle.total - 1); break;
        case '[': { const mes = keyTarget(); if (mes) stepSwipe(mes, -1); break; }
        case ']': { const mes = keyTarget(); if (mes) stepSwipe(mes, 1); break; }
        case 'r': case 'R': { const mes = keyTarget(); if (mes) toggleReasoning(mes); break; }
        case 'g': case 'G': openJump(); break;
        case '\\': toggleDrawer(); break;
        default: handled = false;
    }
    if (handled) event.preventDefault();
}

/** Esc 逐层关闭：小浮层 → 设置条 → 抽屉 → 阅读器本身（02 §1.1）。 */
function closeTopLayer() {
    if (S.popover) { closePopover(S); return; }
    if (S.settings.isOpen()) { S.settings.close(); return; }
    if (S.drawer.isOpen() && !(getPrefs().drawerPinned && innerWidth >= 1000)) { S.drawer.close(); return; }
    closeReader();
}

function toggleDrawer() {
    if (S.drawer.isOpen()) S.drawer.close();
    else S.drawer.open();
}

function onWheel(event) {
    if (!isPaged()) return;
    event.preventDefault();
    const now = performance.now();
    if (now - S.wheelAt > 400) S.wheelSum = 0;
    S.wheelSum += event.deltaY;
    if (Math.abs(S.wheelSum) < 40 || now - S.wheelAt < 350) return;
    S.wheelAt = now;
    flip(S.wheelSum > 0 ? 1 : -1);
    S.wheelSum = 0;
}

/** A 方向：鼠标静止 2 秒后顶栏与底栏淡出（02 §7）；B 方向常驻。 */
function wakeChrome() {
    if (!S || getPrefs().direction !== 'a') return;
    S.root.classList.remove('stcr-chrome-hidden');
    clearTimeout(S.chromeTimer);
    S.chromeTimer = setTimeout(() => {
        if (S && getPrefs().direction === 'a' && !S.settings.isOpen() && !S.drawer.isOpen() && !S.popover) S.root.classList.add('stcr-chrome-hidden');
    }, 2000);
}

// ───────────────────────── 设置 ─────────────────────────

function isPaged() { return effectivePrefs(getPrefs()).mode === 'paged'; }

function applyPrefs(prefs) {
    const { root } = S;
    const shown = effectivePrefs(prefs);
    root.classList.toggle('stcr-dir-a', prefs.direction === 'a');
    root.classList.toggle('stcr-dir-b', prefs.direction !== 'a');
    root.classList.toggle('stcr-mode-paged', shown.mode === 'paged');
    root.classList.toggle('stcr-mode-scroll', shown.mode !== 'paged');
    root.classList.toggle('stcr-hide-user', prefs.hideUser);
    root.classList.toggle('stcr-drawer-pinned', prefs.drawerPinned);
    root.classList.toggle('stcr-lh-custom', prefs.lineHeight !== null);
    root.style.setProperty('--stcr-font-delta', `${prefs.fontDelta}px`);
    if (prefs.lineHeight !== null) root.style.setProperty('--stcr-line-height', String(prefs.lineHeight));
    else root.style.removeProperty('--stcr-line-height');
    if (shown.width !== null) root.style.setProperty('--stcr-width', `${shown.width}px`);
    else root.style.removeProperty('--stcr-width');
    if (prefs.direction !== 'a') root.classList.remove('stcr-chrome-hidden');
    S.settings.sync();
}

function onPrefs(next, previous) {
    if (!S) return;
    const anchor = captureAnchor();
    applyPrefs(next);
    if (next.hideUser !== previous.hideUser) { rerender(anchor); return; }
    if (next.expandAllReasoning !== previous.expandAllReasoning) {
        S.reasoning.clear(); // "全部展开/折叠"清掉逐楼记忆（02 §5.2）
        for (const details of S.chat.querySelectorAll('.mes_reasoning_details')) details.open = next.expandAllReasoning;
    }
    restoreAnchor(anchor);
    updateProgress();
}

// ───────────────────────── 聊天加载 ─────────────────────────

/** 打开一个聊天。连续快速点击时只有最后一次生效，过期结果立即关闭（03 §5.3）。 */
async function loadChat(chatKey, { index = null, swipe = null } = {}) {
    const session = S;
    if (!session) return;
    const token = ++session.token;
    session.controller?.abort();
    const controller = new AbortController();
    session.controller = controller;
    closePopover(session);
    releaseChat(session);
    session.chatKey = chatKey;
    session.retryIndex = index;
    session.drawer.markActive();
    showState('loading');
    try {
        const handle = await openChat(chatKey, { pageSize: PAGE_SIZE, signal: controller.signal });
        if (S !== session || token !== session.token) { handle.close(); return; }
        session.handle = handle;
        session.owner = handle.header.characterName || (handle.isGroup ? '群聊' : '');
        session.titleOwner.textContent = session.owner || '阅读器';
        session.titleFile.textContent = handle.title;
        session.root.setAttribute('aria-label', `阅读器：${session.owner} · ${handle.title}`);
        const saved = getProgress(chatKey);
        session.swipeView = new Map(Object.entries(saved?.sw ?? {}).map(([key, value]) => [Number(key), value]));
        session.reasoning = new Map();
        if (!handle.total) { showState('empty-chat'); updateProgress(); return; }
        let start = index ?? saved?.i ?? 0;
        start = Math.min(handle.total - 1, Math.max(0, Number.isInteger(start) ? start : 0));
        if (Number.isInteger(swipe)) session.swipeView.set(start, swipe);
        showState(null);
        jumpTo(start);
    } catch (error) {
        if (error?.name === 'AbortError' || S !== session || token !== session.token) return;
        console.error('[st-reader] 打开聊天失败：', error);
        showState('error', error);
    }
}

/** 离开聊天：先清 DOM 与模型引用，再 close 旧 handle（03 §5.3）。 */
function releaseChat(session) {
    session.chat.replaceChildren();
    session.firstPage = session.lastPage = -1;
    session.hoverIndex = null;
    session.handle?.close();
    session.handle = null;
    session.titleOwner.textContent = '阅读器';
    session.titleFile.textContent = '';
}

function showState(kind, error) {
    const box = S.stateBox;
    S.root.classList.toggle('stcr-has-state', !!kind);
    if (!kind) { box.hidden = true; box.replaceChildren(); return; }
    box.hidden = false;
    if (kind === 'loading') {
        box.replaceChildren(h('div', { class: 'stcr-skeleton-wrap', 'aria-label': '正在读取' },
            ...[92, 76, 84].map(width => h('div', { class: 'stcr-skeleton', style: `width:${width}%` }))));
    } else if (kind === 'empty-chat') {
        box.replaceChildren(h('div', { class: 'stcr-empty' }, h('i', { class: 'fa-regular fa-comments stcr-empty-icon', 'aria-hidden': 'true' }), h('p', { text: '这个聊天还没有内容。' })));
    } else if (kind === 'error') {
        box.replaceChildren(h('div', { class: 'stcr-empty' },
            h('i', { class: 'fa-solid fa-triangle-exclamation stcr-empty-icon', 'aria-hidden': 'true' }),
            h('p', { text: describeError(error) }),
            h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', 'data-act': 'retry', text: '重试' })));
    }
}

function describeError(error) {
    switch (error?.code) {
        case 'NOT_FOUND': return '找不到这个聊天，可能已经在 ST 里被删除或改名。';
        case 'INVALID_KEY': return '这个聊天的地址无效。';
        case 'INVALID_RESPONSE': return 'ST 返回的数据格式不对，读不出来。';
        default:
            if (/^HTTP_/.test(error?.code ?? '')) return `读取失败（${error.code.replace('HTTP_', 'HTTP ')}）。确认 ST 还开着，再点重试。`;
            if (error instanceof TypeError) return '聊天文件里有损坏的楼层，阅读器不跳过它以免楼号错位。';
            return '读取失败，请确认 ST 还开着，再点重试。';
    }
}

/** 空状态：没打开聊天时。有上次读到一半的就给"继续阅读"卡片（02 §1.1）。 */
function showEmpty() {
    const last = lastRead();
    S.stateBox.hidden = false;
    S.root.classList.add('stcr-has-state');
    S.stateBox.replaceChildren(h('div', { class: 'stcr-empty' },
        h('i', { class: 'fa-solid fa-book-open stcr-empty-icon', 'aria-hidden': 'true' }),
        h('p', { text: '从左边选一个聊天开始读。' }),
        h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-empty-open', 'data-act': 'open-drawer', text: '打开聊天列表' }),
        last ? h('button', { type: 'button', class: 'stcr-btn stcr-continue', 'data-act': 'continue', 'data-key': last.chatKey, 'data-index': last.i ?? 0 },
            h('span', { class: 'stcr-continue-label', text: '继续阅读' }),
            h('span', { class: 'stcr-continue-title', text: `《${[last.owner, last.title].filter(Boolean).join(' · ') || '上次的聊天'}》第 ${(last.i ?? 0) + 1} 楼` })) : null));
}

// ───────────────────────── 正文窗口 ─────────────────────────

function floorContext() {
    const session = S;
    const key = session.chatKey ? parseChatKey(session.chatKey) : null;
    return {
        handle: session.handle,
        avatarFor(model) {
            if (model.isUser) return session.userAvatar ? `/thumbnail?type=persona&file=${encodeURIComponent(session.userAvatar)}` : null;
            if (session.handle.isGroup) return model.originalAvatar ? thumb(model.originalAvatar) : null;
            return key?.avatarUrl ? thumb(key.avatarUrl) : null;
        },
        isReasoningOpen: index => session.reasoning.has(index) ? session.reasoning.get(index) : getPrefs().expandAllReasoning,
    };
}

/** 一批楼层的节点（隐藏用户楼时在每段连续用户楼前插一条"— 你 · N 条 —"）。 */
function pageNodes(pageIndex) {
    const { messages } = S.handle.page(pageIndex);
    const ctx = floorContext();
    const hide = getPrefs().hideUser;
    const runs = hide ? hiddenUserRuns(messages) : new Map();
    const nodes = [];
    let run = null;
    for (const model of messages) {
        if (runs.has(model.index)) {
            run = model.index;
            nodes.push(h('button', { type: 'button', class: 'stcr-btn stcr-fold', 'data-act': 'fold', 'data-run': run, 'data-page': pageIndex, 'aria-expanded': 'false',
                text: `— 你 · ${runs.get(run)} 条 —`, title: '点开看这几条' }));
        } else if (!(model.isUser && !model.isSystem)) run = null;
        let el;
        try {
            el = buildFloor(ctx, model, pickSwipe(S.swipeView.get(model.index), model));
        } catch (error) {
            // 单楼渲染失败不拖垮整页：显示一行说明，楼号不变。
            console.error(`[st-reader] 第 ${model.index + 1} 楼渲染失败：`, error);
            el = h('div', { class: 'mes stcr-mes stcr-mes--broken', mesid: model.index, is_user: String(model.isUser), is_system: 'false' },
                h('div', { class: 'mes_block' }, h('div', { class: 'mes_text', text: `（第 ${model.index + 1} 楼显示失败）` })));
        }
        el.dataset.page = String(pageIndex);
        if (hide && model.isUser && !model.isSystem && run !== null) { el.classList.add('stcr-user-hidden'); el.dataset.run = String(run); }
        nodes.push(el);
    }
    return nodes;
}

function renderedFloors() { return S.chat.querySelectorAll(':scope > .mes[mesid]'); }
function floorEl(index) { return S.chat.querySelector(`:scope > .mes[mesid="${index}"]`); }
const isShown = el => el.offsetParent !== null || el.getClientRects().length > 0;

/** 视口顶端附近的第一楼 + 它相对视口的位置；改设置、增删批次后据此把阅读位置放回原处。 */
function captureAnchor() {
    if (!S?.handle) return null;
    const top = S.scroller.getBoundingClientRect().top;
    for (const el of renderedFloors()) {
        if (!isShown(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.bottom > top + 1) return { index: Number(el.getAttribute('mesid')), offset: rect.top - top };
    }
    return null;
}
function restoreAnchor(anchor) {
    if (!anchor) return;
    const el = floorEl(anchor.index);
    if (!el || !isShown(el)) return;
    const now = el.getBoundingClientRect().top - S.scroller.getBoundingClientRect().top;
    S.scroller.scrollTop += now - anchor.offset;
}

function rerender(anchor) {
    if (!S.handle?.total) return;
    const index = anchor?.index ?? 0;
    jumpTo(index);
    if (anchor) restoreAnchor(anchor);
}

/** 跳到某楼（零基）：只渲染它所在的一批，再按需接上前后批。 */
function jumpTo(index, { swipe = null } = {}) {
    const session = S;
    if (!session?.handle?.total) return;
    closePopover(session);
    index = Math.min(session.handle.total - 1, Math.max(0, index));
    if (Number.isInteger(swipe)) session.swipeView.set(index, swipe);
    const pageIndex = Math.floor(index / PAGE_SIZE);
    session.chat.replaceChildren(...pageNodes(pageIndex));
    session.firstPage = session.lastPage = pageIndex;
    let target = floorEl(index);
    if (target && !isShown(target)) {
        // 目标是被隐藏的用户楼：落到它那段的折叠条上。
        target = session.chat.querySelector(`.stcr-fold[data-run="${target.dataset.run}"]`) ?? target;
    }
    session.scroller.scrollTop = 0;
    if (target) session.scroller.scrollTop = target.getBoundingClientRect().top - session.scroller.getBoundingClientRect().top - 8;
    ensureWindow();
    updateProgress();
}

/** 保持"视口上下各有 1.5 屏内容"，DOM 至多 MAX_PAGES 批，多的释放（NF2）。 */
function ensureWindow() {
    const session = S;
    if (!session?.handle || session.firstPage < 0) return;
    const { scroller, handle } = session;
    for (let guard = 0; guard < 6; guard++) {
        const { scrollTop, scrollHeight, clientHeight } = scroller;
        const nearBottom = scrollHeight - scrollTop - clientHeight < clientHeight * EDGE_SCREENS;
        const nearTop = scrollTop < clientHeight * EDGE_SCREENS;
        if (nearBottom && session.lastPage < handle.pageCount - 1) {
            session.chat.append(...pageNodes(++session.lastPage));
        } else if (nearTop && session.firstPage > 0) {
            const anchor = captureAnchor();
            session.chat.prepend(...pageNodes(--session.firstPage));
            restoreAnchor(anchor);
        } else break;
        trimWindow();
    }
}

function trimWindow() {
    const session = S;
    while (session.lastPage - session.firstPage + 1 > MAX_PAGES) {
        const anchor = captureAnchor();
        const anchorPage = anchor ? Math.floor(anchor.index / PAGE_SIZE) : session.firstPage;
        const dropFirst = anchorPage - session.firstPage > session.lastPage - anchorPage;
        const page = dropFirst ? session.firstPage++ : session.lastPage--;
        for (const node of session.chat.querySelectorAll(`:scope > [data-page="${page}"]`)) node.remove();
        if (dropFirst) restoreAnchor(anchor);
    }
}

/** 分页模式翻一屏；上下各留一行重叠，避免被切断的那行两页都看不全。 */
function flip(direction) {
    const session = S;
    if (!session?.handle?.total) return;
    const { scroller } = session;
    const overlap = Math.min(48, Math.max(24, parseFloat(getComputedStyle(session.chat).fontSize) * 1.8));
    const step = Math.max(80, scroller.clientHeight - overlap);
    const before = scroller.scrollTop;
    scroller.scrollTop = before + direction * step;
    if (scroller.scrollTop === before) {
        ensureWindow();
        scroller.scrollTop = scroller.scrollTop + direction * step;
        if (Math.abs(scroller.scrollTop - before) < 1) { toast(session.root, direction > 0 ? '已经是最后一页' : '已经是第一页'); return; }
    }
    session.chat.classList.remove('stcr-flip');
    void session.chat.offsetWidth;
    session.chat.classList.add('stcr-flip');
    ensureWindow();
    updateProgress();
}

/** 底部进度："第 128–131 楼 · 共 312 楼 · 41%"；顺手记住阅读位置。 */
function updateProgress() {
    const session = S;
    if (!session) return;
    const total = session.handle?.total ?? 0;
    let first = null, last = null;
    if (total) {
        const rect = session.scroller.getBoundingClientRect();
        for (const el of renderedFloors()) {
            if (!isShown(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.bottom <= rect.top + 16) continue; // 只露出一条缝的楼不算
            if (r.top >= rect.bottom - 16) break;
            const index = Number(el.getAttribute('mesid'));
            first ??= index;
            last = index;
        }
    }
    if (first === null) {
        session.progressBtn.textContent = '';
        session.progressLine.style.width = '0';
        session.topPercent.textContent = '';
        return;
    }
    session.progressBtn.textContent = progressText(first, last, total);
    const percent = Math.min(100, Math.round(((last + 1) / total) * 100));
    session.progressLine.style.width = `${percent}%`;
    session.topPercent.textContent = `${percent}%`;
    setReadPosition(session.chatKey, first, { title: session.handle.title, owner: session.owner });
}

// ───────────────────────── 楼层操作 ─────────────────────────

/** 键盘命令作用的楼：鼠标所在楼（还在视口里），否则视口顶端第一楼。 */
function keyTarget() {
    const hovered = S.hoverIndex !== null ? floorEl(S.hoverIndex) : null;
    if (hovered && isShown(hovered)) {
        const rect = hovered.getBoundingClientRect(), view = S.scroller.getBoundingClientRect();
        if (rect.bottom > view.top && rect.top < view.bottom) return hovered;
    }
    const anchor = captureAnchor();
    return anchor ? floorEl(anchor.index) : null;
}

function stepSwipe(mes, delta) {
    const current = Number(mes.dataset.swipe);
    setSwipe(mes, current + delta);
}

/** 切候选：只改阅读器视图；名字行在屏幕上的位置保持不动（02 §5.1）。 */
function setSwipe(mes, next) {
    const session = S;
    if (!mes || !session?.handle) return;
    const index = Number(mes.getAttribute('mesid'));
    const model = session.handle.getMessage(index);
    if (!Number.isInteger(next) || next < 0 || next >= model.swipes.length || next === Number(mes.dataset.swipe)) return;
    const before = mes.getBoundingClientRect().top;
    const pinned = mes.classList.contains('stcr-toolbar-pinned');
    fillFloor(floorContext(), mes, model, next);
    mes.classList.toggle('stcr-toolbar-pinned', pinned);
    session.scroller.scrollTop += mes.getBoundingClientRect().top - before;
    mes.classList.remove('stcr-swipe-fade');
    void mes.offsetWidth;
    mes.classList.add('stcr-swipe-fade');
    session.swipeView.set(index, next);
    rememberSwipe(session.chatKey, index, next, next === model.swipeId);
    ensureWindow();
    updateProgress();
}

function toggleReasoning(mes) {
    const details = mes?.querySelector(':scope > .mes_block > .mes_reasoning_details');
    if (!details) return;
    const open = !details.open;
    details.open = open;
    S.reasoning.set(Number(mes.getAttribute('mesid')), open);
    if (!open) {
        // 从长思维链底部"收起"时，别让人找不到自己在哪：思考行滚回视口顶端。
        const view = S.scroller.getBoundingClientRect();
        const top = details.getBoundingClientRect().top;
        if (top < view.top) S.scroller.scrollTop += top - view.top - 8;
    }
    updateProgress();
}

async function copyFloor(mes) {
    const ok = await copyText(floorPlainText(mes));
    if (S) toast(S.root, ok ? '已复制本楼文字' : '复制失败，请手动选中复制');
}

async function copyCode(button) {
    const code = button.closest('pre')?.querySelector('code');
    if (!code) return;
    const ok = await copyText(code.textContent ?? '');
    const icon = button.querySelector('i');
    if (ok && icon) {
        icon.className = 'fa-solid fa-check';
        setTimeout(() => { icon.className = 'fa-solid fa-copy'; }, 1500);
    } else if (!ok && S) toast(S.root, '复制失败，请手动选中复制');
}

function toggleFold(button) {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    for (const el of S.chat.querySelectorAll(`:scope > .mes[data-run="${button.dataset.run}"]`)) el.classList.toggle('stcr-user-shown', open);
    updateProgress();
}

// ───────────────────────── 小浮层 ─────────────────────────

function closePopover(session) {
    session?.popover?.remove();
    if (session) session.popover = null;
}

function placePopover(popover, anchorEl, { above = false } = {}) {
    const root = S.root.getBoundingClientRect();
    const rect = anchorEl.getBoundingClientRect();
    S.root.append(popover);
    const width = popover.offsetWidth;
    const left = Math.min(Math.max(8, rect.right - root.left - width), root.width - width - 8);
    popover.style.left = `${left}px`;
    if (above) popover.style.bottom = `${root.bottom - rect.top + 6}px`;
    else popover.style.top = `${rect.bottom - root.top + 6}px`;
    S.popover = popover;
}

/** 点候选数字：列出每个候选的时间与开头一句，点即跳（02 §5.1）。 */
function openSwipeList(mes, button) {
    if (S.popover?.dataset.for === mes.getAttribute('mesid')) { closePopover(S); return; }
    closePopover(S);
    const index = Number(mes.getAttribute('mesid'));
    const model = S.handle.getMessage(index);
    const shown = Number(mes.dataset.swipe);
    const previews = swipePreviews(model.swipes.map(swipe => swipe.text));
    const popover = h('div', { class: 'stcr-popover stcr-swipe-list', role: 'listbox', 'aria-label': '选择候选', 'data-for': index },
        ...model.swipes.map(swipe => h('button', { type: 'button', role: 'option', class: `stcr-btn stcr-swipe-item${swipe.index === shown ? ' stcr-on' : ''}`,
            'aria-selected': String(swipe.index === shown), 'data-act': 'swipe-pick', 'data-index': index, 'data-swipe': swipe.index },
        h('span', { class: 'stcr-swipe-item-num', text: String(swipe.index + 1) }),
        h('span', { class: 'stcr-swipe-item-time', text: formatStamp(swipe.sendDate).replace(/^.*日 /, '') }),
        h('span', { class: 'stcr-swipe-item-text', text: previews[swipe.index] || '（空）' }),
        swipe.index === model.swipeId ? h('span', { class: 'stcr-swipe-dot', title: 'ST 里现在采用的是这个候选' }) : null)));
    placePopover(popover, button);
    popover.querySelector('.stcr-on')?.focus({ preventScroll: true });
}

/** 跳到第 N 楼的小输入框。 */
function openJump() {
    const session = S;
    if (!session?.handle?.total) return;
    if (session.popover?.classList.contains('stcr-jump')) { closePopover(session); return; }
    closePopover(session);
    const input = h('input', { type: 'number', min: 1, max: session.handle.total, class: 'text_pole stcr-jump-input', 'aria-label': '楼号', placeholder: `1–${session.handle.total}` });
    const form = h('form', { class: 'stcr-popover stcr-jump' },
        h('label', {}, '跳到第 ', input, ' 楼'),
        h('button', { type: 'submit', class: 'stcr-btn stcr-text-btn', text: '跳转' }));
    form.addEventListener('submit', event => {
        event.preventDefault();
        const index = parseJumpInput(input.value, session.handle.total);
        if (index === null) { toast(session.root, `请输入 1 到 ${session.handle.total} 之间的楼号`); input.select(); return; }
        closePopover(session);
        jumpTo(index);
        session.scroller.focus({ preventScroll: true });
    });
    placePopover(form, session.progressBtn, { above: true });
    input.focus();
}
