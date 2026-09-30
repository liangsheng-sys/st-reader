// ST Reader — AGPL-3.0
// 阅读器主控（T21/T22/T23a）：全屏覆盖层 #stcr_root、正文 #stcr_chat（D12）。
// 只读（D02）：只调 03 §5 的读取接口；候选/思维链/进度/划线/收藏都是阅读器自己的状态，绝不写回 ST。

import { getCurrentChatKey, openChat, parseChatKey } from '../core/chatSource.js';
import { initFormatter } from '../core/formatter.js';
import { store } from '../core/store.js';
import { createPanel } from './annotationsPanel.js';
import { backupStatus, describeStoreError, exportBackup, pickAndImport } from './backup.js';
import { annotationToFloor, createPieceCache, MAX_CARD_FLOORS, selectionToFloors, wholeFloor } from './cardPieces.js';
import { createCardStudio } from './cardStudio.js';
import { copyText, h, iconButton, isTypingTarget, toast } from './dom.js';
import { createDrawer } from './drawer.js';
import { buildFloor, buildSwipeControl, fillFloor, floorPlainText, syncBookmarkMarks } from './floorToolbar.js';
import { effectivePrefs, formatStamp, hiddenUserRuns, parseJumpInput, pickSwipe, progressText, swipePreviews } from './logic.js';
import { createMarks, highlightSupported } from './marks.js';
import { flushProgress, getPrefs, getProgress, lastRead, loadPrefs, onPrefsChange, reloadPrefs, rememberSwipe, setPrefs, setReadPosition } from './prefs.js';
import { createSelectionUi } from './selectionPopover.js';
import { createSettingsBar } from './settingsBar.js';

const PAGE_SIZE = 30;      // 每批楼数，与 core 默认一致（03 §4.5）
const MAX_PAGES = 4;       // DOM 里同时最多保留几批，其余释放（NF2）
const EDGE_SCREENS = 1.5;  // 距离边缘不到 1.5 屏就接上前/后一批
const WIDE = 1000;         // ≥1000px 抽屉/面板可以钉住（D13）

// 阅读器里的这些事件不许冒泡到 document：ST 在 document 上挂了 .mes/.mes_text/.avatar/思维链的委托点击，
// 以及 ←/→ 切换真实聊天候选（最后一个候选上会触发生成 = 写聊天）的全局按键。见 02 §9.1。
const CONTAINED_EVENTS = ['click', 'dblclick', 'auxclick', 'contextmenu', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'touchstart', 'touchend', 'input', 'change', 'paste', 'focusin', 'focusout',
    'swiped', 'swiped-left', 'swiped-right', 'swiped-up', 'swiped-down'];
const KEY_EVENTS = ['keydown', 'keyup', 'keypress'];

/** 扩展目录名随用户怎么装而变：从本文件地址推出 third-party/<目录>。 */
const EXTENSION_ID = new URL('../..', import.meta.url).pathname.replace(/^\/scripts\/extensions\//, '').replace(/\/$/, '');
const thumb = file => `/thumbnail?type=avatar&file=${encodeURIComponent(file)}`;

let S = null; // 打开期间的会话状态；关闭即整体丢弃

export const isReaderOpen = () => S !== null;
const wide = () => innerWidth >= WIDE;
const say = message => { if (S) toast(S.root, message); };

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
    await loadPrefs();
    const html = await SillyTavern.getContext().renderExtensionTemplateAsync(`${EXTENSION_ID}/src/ui/templates`, 'reader');
    if (S) return; // 等模板期间又被打开过一次
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const root = holder.querySelector('#stcr_root');
    if (!root) throw new Error('阅读器模板缺少 #stcr_root');

    const session = {
        root, scroller: root.querySelector('.stcr-scroll'), chat: root.querySelector('#stcr_chat'), main: root.querySelector('.stcr-main'),
        stateBox: root.querySelector('.stcr-state'), progressBtn: root.querySelector('.stcr-progress'),
        progressLine: root.querySelector('.stcr-progress-line > span'), topPercent: root.querySelector('.stcr-top-percent'),
        titleOwner: root.querySelector('.stcr-title-owner'), titleFile: root.querySelector('.stcr-title-file'),
        panelBtn: root.querySelector('.stcr-panel-btn'),
        handle: null, chatKey: null, owner: '', token: 0, controller: null,
        firstPage: -1, lastPage: -1, swipeView: new Map(), reasoning: new Map(), hoverIndex: null,
        userAvatar: '', restoreFocus: document.activeElement, cleanup: [], popover: null, popoverDismiss: null,
        chromeTimer: null, wheelAt: 0, wheelSum: 0, statusTimer: null,
    };
    S = session;
    session.marks = createMarks({
        getHandle: () => (S === session ? session.handle : null),
        getChatKey: () => (S === session && session.handle ? session.chatKey : null),
        getTitle: () => [session.owner, session.handle?.title].filter(Boolean).join(' · '),
        onChange: () => onMarksChange(session),
    });
    session.drawer = createDrawer({
        onPick: (key, target) => {
            if (target && key === session.chatKey && session.handle) jumpTo(target.index, { swipe: target.swipe });
            else loadChat(key, target ?? {});
            if (!getPrefs().drawerPinned || !wide()) session.drawer.close();
        },
        getActiveKey: () => S?.chatKey ?? null,
        isPinned: () => getPrefs().drawerPinned,
        onPinChange: pinned => setPrefs({ drawerPinned: pinned }),
    });
    session.panel = createPanel({
        marks: session.marks,
        getHandle: () => session.handle,
        getChatKey: () => (session.handle ? session.chatKey : null),
        onJump: target => jumpToMark(target),
        onCard: record => openCardFromNote(record),
        isPinned: () => getPrefs().panelPinned,
        onPinChange: pinned => setPrefs({ panelPinned: pinned }),
        onBackupHint: () => { if (!getPrefs().panelPinned || !wide()) session.panel.close(); session.settings.openMore(); },
        toast: say,
        confirm: (message, ok) => confirmDialog(message, ok),
    });
    session.settings = createSettingsBar({ onExport: () => doExport(), onImport: () => doImport() });
    session.selUi = createSelectionUi({
        root, marks: session.marks, toast: say,
        onCard: range => openCardFromSelection(range),
        getChatKey: () => (session.handle ? session.chatKey : null),
        getAutoNames: () => (session.handle ? [session.handle.header.userName, session.handle.header.characterName].filter(Boolean) : []),
        setPopover: (el, options) => setPopover(el, options),
        closePopover: options => closePopover(session, options),
    });
    session.studio = createCardStudio({
        root, toast: say, getDirection: () => getPrefs().direction, confirm: (message, ok) => confirmDialog(message, ok),
        onClose: () => { if (S === session) session.scroller.focus({ preventScroll: true }); },
    });
    session.follow = h('div', { class: 'stcr-follow', hidden: true, role: 'toolbar', 'aria-label': '当前这一楼' });
    root.querySelector('.stcr-body').prepend(session.drawer.el);
    root.querySelector('.stcr-body').append(session.panel.el);
    session.main.append(session.follow);
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
    refreshBackupStatus();
    if (!highlightSupported()) setTimeout(() => say('这个浏览器太旧，划线能保存但看不到颜色；请升级浏览器。'), 800);

    const current = getCurrentChatKey();
    if (chatKey) loadChat(chatKey);
    else if (current && tab !== 'recent') loadChat(current, { index: stVisibleIndex() });
    else showEmpty();
    if (tab) session.drawer.open(tab);
    else if (!chatKey && !current) session.drawer.open('recent');
    else if (getPrefs().drawerPinned && wide()) session.drawer.open();
    if (getPrefs().panelPinned && wide()) session.panel.open();
}

export function closeReader() {
    if (!S) return;
    const session = S;
    closePopover(session); // 批注输入框点外面=保存，这里同理：先保存再关
    session.studio.close(); // 先关卡片工作台：它可能借用着这个聊天的句柄
    S = null;
    session.token++;
    session.controller?.abort();
    flushProgress();
    session.selUi.hideBubble();
    session.marks.destroy();
    session.chat.replaceChildren();
    session.handle?.close();
    session.handle = null;
    session.drawer.destroy();
    for (const undo of session.cleanup) undo();
    clearTimeout(session.chromeTimer);
    clearTimeout(session.statusTimer);
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

/** ST 自己的确认弹窗（<dialog> 顶层显示，盖在阅读器之上）。message 可以是文字或元素。 */
async function confirmDialog(message, okLabel = '确定') {
    const { callGenericPopup, POPUP_TYPE, POPUP_RESULT } = SillyTavern.getContext();
    const content = typeof message === 'string' ? h('p', { class: 'stcr-confirm-text', text: message }) : message;
    const result = await callGenericPopup(content, POPUP_TYPE.CONFIRM, '', { okButton: okLabel, cancelButton: '取消' });
    return result === POPUP_RESULT.AFFIRMATIVE;
}

// ───────────────────────── 事件 ─────────────────────────

function wireEvents(session) {
    const { root, scroller, chat } = session;
    // 键盘防火墙：焦点不在阅读器里时（比如落在 body），在 window 捕获阶段就截住，ST 的 document 监听收不到。
    const guard = event => {
        if (S !== session) return;
        const target = event.target;
        if (target instanceof Node && root.contains(target)) return; // 阅读器内部的由 root 冒泡监听处理
        // ST 自己的弹窗（确认导入等）照常可用。
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
        if (type === 'keyup' && event.shiftKey) setTimeout(checkSelection, 0); // Shift+方向键选字
        event.stopPropagation();
    });
    // 自己的点击逻辑先跑（注册在前），再统一截断冒泡。
    root.addEventListener('click', onClick);
    // 选中文字：松开鼠标/手指后看一眼选区（放到 click 之后，免得刚弹出的浮层被这次点击关掉）
    root.addEventListener('mouseup', event => { if (chat.contains(event.target)) setTimeout(checkSelection, 0); });
    root.addEventListener('touchend', event => { if (chat.contains(event.target)) setTimeout(checkSelection, 350); });
    for (const type of CONTAINED_EVENTS) root.addEventListener(type, event => event.stopPropagation());
    // 手机上拖动选区把手不会触发 touchend，靠 selectionchange 补一次
    let selTimer = 0;
    const onSelChange = () => {
        if (S !== session || !matchMedia('(pointer: coarse)').matches) return;
        clearTimeout(selTimer);
        selTimer = setTimeout(checkSelection, 500);
    };
    document.addEventListener('selectionchange', onSelChange);
    session.cleanup.push(() => { document.removeEventListener('selectionchange', onSelChange); clearTimeout(selTimer); });

    let frame = 0;
    scroller.addEventListener('scroll', () => {
        // 选中文字的浮层跟着选区走（选长段要滚动，T23a 验收意见②）；其余贴着按钮的小浮层收起；批注输入框留着
        const pop = session.popover;
        if (pop?._stcrFollow) { if (!pop._stcrFollow()) closePopover(session, { cancel: true }); }
        else if (pop?.matches('.stcr-sel-pop, .stcr-sel-menu, .stcr-swipe-list')) closePopover(session, { cancel: true });
        session.selUi.hideBubble();
        if (frame) return;
        frame = requestAnimationFrame(() => { frame = 0; if (S === session) { ensureWindow(); updateProgress(); } });
    }, { passive: true });
    scroller.addEventListener('wheel', onWheel, { passive: false });
    chat.addEventListener('mouseover', event => {
        const mes = event.target.closest?.('.mes[mesid]');
        if (mes) session.hoverIndex = Number(mes.getAttribute('mesid'));
        const mark = event.target.closest?.('.stcr-note-mark');
        if (mark) session.selUi.showBubble(mark);
    });
    chat.addEventListener('mouseout', event => { if (event.target.closest?.('.stcr-note-mark')) session.selUi.hideBubble(); });
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

/** 松手后：正文里有选区就弹选中浮层（02 §1.5）。 */
function checkSelection() {
    const session = S;
    if (!session?.handle) return;
    const selection = getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!session.chat.contains(range.commonAncestorContainer)) return;
    const text = selection.toString().trim();
    if (!text) return;
    const area = node => (node.nodeType === 1 ? node : node.parentElement)?.closest('.mes_text, .mes_reasoning') ?? null;
    const start = area(range.startContainer), end = area(range.endContainer);
    const container = start && start === end ? start : null;
    const el = (start ?? end ?? (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement))?.closest('.mes[mesid]');
    session.selUi.showForSelection({ range, el, container, text });
}

/** 某楼的元素：按钮在楼里就是它所在的楼；跟随条、候选列表里的按钮带 data-index。 */
function mesFor(target, actEl) {
    const inFloor = target.closest('#stcr_chat .mes[mesid]');
    if (inFloor) return inFloor;
    const index = actEl?.dataset.index;
    return index !== undefined && index !== '' ? floorEl(Number(index)) : null;
}

function onClick(event) {
    const session = S;
    if (!session) return;
    const target = /** @type {Element} */ (event.target);
    // 浮层按钮自己的处理已经把自己移走了（比如"写批注"关掉小浮层、打开输入框）：这次点击已处理完，
    // 不能再被当成"点了浮层外面"，否则会把刚打开的输入框立刻关掉。
    if (!target.isConnected) return;
    if (session.popover && !session.popover.contains(target) && !target.closest('[data-act="swipe-list"], [data-act="jump"]')) closePopover(session);
    if (session.settings.isOpen() && !session.settings.panel.contains(target) && target !== session.settings.fab) session.settings.close();
    // 抽屉/面板没钉住时浮在正文上，点它外面就收起（02 §3.1）。
    let dismissedOverlay = false;
    if (session.drawer.isOpen() && !session.drawer.el.contains(target) && !target.closest('[data-act="drawer"], [data-act="open-drawer"]')
        && !(getPrefs().drawerPinned && wide())) { session.drawer.close(); dismissedOverlay = true; }
    if (session.panel.isOpen() && !session.panel.el.contains(target) && !target.closest('[data-act="panel"]')
        && !(getPrefs().panelPinned && wide())) { session.panel.close(); dismissedOverlay = true; }
    if (dismissedOverlay && session.scroller.contains(target)) return; // 这一下只用来收抽屉/面板，不顺带翻页

    const summary = target.closest('.mes_reasoning_summary');
    if (summary) {
        event.preventDefault(); // 展开状态由阅读器管理，不交给 <details> 自己切
        toggleReasoning(summary.closest('.mes'));
        return;
    }
    const actEl = target.closest('[data-act]');
    const mes = mesFor(target, actEl);
    const act = actEl?.dataset.act;
    const fromFollow = !!target.closest('.stcr-follow');
    if (act) {
        switch (act) {
            case 'exit': closeReader(); return;
            case 'drawer': toggleDrawer(); return;
            case 'close-drawer': session.drawer.close(); return;
            case 'panel': togglePanel(); return;
            case 'close-panel': session.panel.close(); return;
            case 'jump': openJump(); return;
            case 'retry': if (session.chatKey) loadChat(session.chatKey, { index: session.retryIndex }); return;
            case 'continue': loadChat(actEl.dataset.key, { index: Number(actEl.dataset.index) }); return;
            case 'open-drawer': session.drawer.open('recent'); return;
            case 'swipe-prev': if (mes) { stepSwipe(mes, -1); if (fromFollow) scrollFloorTop(mes); } return;
            case 'swipe-next': if (mes) { stepSwipe(mes, 1); if (fromFollow) scrollFloorTop(mes); } return;
            case 'swipe-list': if (mes) openSwipeList(mes, actEl, { fromFollow }); return;
            case 'swipe-pick': {
                const follow = session.popover?.dataset.follow === '1';
                const floor = floorEl(Number(actEl.dataset.index));
                closePopover(session);
                setSwipe(floor, Number(actEl.dataset.swipe));
                if (follow && floor) scrollFloorTop(floor);
                return;
            }
            case 'follow-top': if (mes) scrollFloorTop(mes); return;
            case 'more': mes?.classList.toggle('stcr-toolbar-pinned'); return;
            case 'reasoning': if (mes) toggleReasoning(mes); return;
            case 'copy': if (mes) copyFloor(mes); return;
            case 'copy-code': copyCode(actEl); return;
            case 'fold': toggleFold(actEl); return;
            case 'bookmark-floor': if (mes) toggleBookmark(mes, false); return;
            case 'bookmark-swipe': if (mes) toggleBookmark(mes, true); return;
            case 'card': if (mes) openCardForFloor(mes); return;
            default: break;
        }
    }
    // 点在划线上（或批注角标上）：换色 / 编辑批注 / 取消划线（02 §1.5）
    const noteMark = target.closest('.stcr-note-mark');
    if (noteMark) { openMarkAt(noteMark.dataset.ann, noteMark.getBoundingClientRect()); return; }
    if (mes && target.closest('.mes_text, .mes_reasoning') && !target.closest('a, button, pre') && !getSelection()?.toString()) {
        const id = session.marks.hitTest(event.clientX, event.clientY, mes);
        if (id) { openMarkAt(id, { left: event.clientX, right: event.clientX, width: 0, top: event.clientY - 10, bottom: event.clientY + 10, height: 20 }); return; }
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

function openMarkAt(id, rect) {
    if (!S.marks.get(id)) return;
    S.selUi.hideBubble();
    S.selUi.showForMark(id, rect);
}

function handleKey(event) {
    const session = S;
    if (!session || event.type !== 'keydown' || event.isComposing) return;
    if (session.studio.isOpen()) {
        // 卡片工作台开着：阅读器快捷键一律不响应，Esc 关工作台（工作台里的按键它自己处理）
        if (event.key === 'Escape') { session.studio.close(); event.preventDefault(); }
        return;
    }
    if (isTypingTarget(event.target)) {
        if (event.key === 'Escape') {
            // 在批注框里按 Esc = 不保存关掉；在别的输入框里 = 离开输入框
            if (session.popover?.contains(event.target)) closePopover(session, { cancel: true });
            else event.target.blur?.();
            session.scroller.focus({ preventScroll: true });
            event.preventDefault();
        }
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
        case 'r': case 'R': { const mes = getPrefs().hideReasoning ? null : keyTarget(); if (mes) toggleReasoning(mes); break; }
        case 'b': case 'B': { const mes = keyTarget(); if (mes && !mes.classList.contains('stcr-mes--system')) toggleBookmark(mes, false); break; }
        case 'g': case 'G': openJump(); break;
        case '\\': toggleDrawer(); break;
        case '/': togglePanel(); break;
        default: handled = false;
    }
    if (handled) event.preventDefault();
}

/** Esc 逐层关闭：小浮层 → 设置条 → 面板 → 抽屉 → 阅读器本身（02 §1.1）。钉住的抽屉/面板不算一层。 */
function closeTopLayer() {
    if (S.studio.isOpen()) { S.studio.close(); return; }
    if (S.popover) { closePopover(S, { cancel: true }); return; }
    if (S.settings.isOpen()) { S.settings.close(); return; }
    if (S.panel.isOpen() && !(getPrefs().panelPinned && wide())) { S.panel.close(); return; }
    if (S.drawer.isOpen() && !(getPrefs().drawerPinned && wide())) { S.drawer.close(); return; }
    closeReader();
}

function toggleDrawer() {
    if (S.drawer.isOpen()) S.drawer.close();
    else S.drawer.open();
}
function togglePanel() {
    if (S.panel.isOpen()) S.panel.close();
    else S.panel.open();
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
        if (S && getPrefs().direction === 'a' && !S.settings.isOpen() && !S.drawer.isOpen() && !S.panel.isOpen() && !S.popover) S.root.classList.add('stcr-chrome-hidden');
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
    root.classList.toggle('stcr-hide-reasoning', prefs.hideReasoning);
    root.classList.toggle('stcr-drawer-pinned', prefs.drawerPinned);
    root.classList.toggle('stcr-panel-pinned', prefs.panelPinned);
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

// ───────────────────────── 划线、收藏、备份 ─────────────────────────

/** 划线/收藏有变：刷新顶栏角标、面板、楼层图标、跟随条；备份提醒去抖刷新。 */
function onMarksChange(session) {
    if (S !== session) return;
    const records = session.marks.records();
    const orphans = records.filter(r => r.orphan).length;
    const badge = session.panelBtn.querySelector('.stcr-badge');
    const count = records.length + session.marks.bookmarks().length;
    badge.textContent = count ? String(count > 99 ? '99+' : count) : '';
    session.panelBtn.classList.toggle('stcr-panel-btn--warn', orphans > 0);
    session.panelBtn.title = orphans ? `划线、批注与收藏（有 ${orphans} 条孤立的划线）` : '划线、批注与收藏（/）';
    session.panel.refresh();
    session.drawer.refreshFavorites();
    if (session.handle) {
        const ctx = floorContext();
        for (const el of renderedFloors()) if (!el.classList.contains('stcr-mes--broken')) syncBookmarkMarks(ctx, el);
    }
    session.follow.dataset.key = ''; // 跟随条里的星标跟着变
    updateFollower();
    clearTimeout(session.statusTimer);
    session.statusTimer = setTimeout(() => refreshBackupStatus(), 1200);
}

async function toggleBookmark(mes, forSwipe) {
    const index = Number(mes.getAttribute('mesid'));
    const swipe = forSwipe ? Number(mes.dataset.swipe) : null;
    try {
        // 摘要用屏幕上看到的文字（正则处理后），不用带标记的原文
        const on = await S.marks.toggleBookmark(index, swipe, { preview: floorPlainText(mes) });
        say(on ? (swipe === null ? `已收藏第 ${index + 1} 楼` : `已收藏第 ${index + 1} 楼的第 ${swipe + 1} 个候选`) : '已取消收藏');
    } catch (error) {
        console.error('[st-reader] 收藏失败：', error);
        say(`收藏没保存上：${describeStoreError(error)}`);
    }
}

/** 从面板/抽屉跳到某楼某候选；是划线就滚到那段并闪两下。别的聊天：先打开它再跳。 */
async function jumpToMark({ chatKey, index, swipe, annotationId, part }) {
    const session = S;
    if (!session) return;
    if (!getPrefs().panelPinned || !wide()) session.panel.close();
    if (chatKey && (chatKey !== session.chatKey || !session.handle)) {
        await loadChat(chatKey, { index, swipe: swipe ?? null });
        if (S !== session || session.chatKey !== chatKey || !session.handle) return; // 打开失败或又换了聊天
        session.panel.refresh();
    }
    if (!session.handle) return;
    if (part === 'reasoning') {
        session.reasoning.set(index, true);
        if (getPrefs().hideReasoning) say('这条划线在思维链里；思维链现在是"隐藏"，到 Aa 里改成"折叠"或"展开"就能看到');
    }
    const el = floorEl(index);
    const sameView = el && isShown(el) && (swipe === null || swipe === undefined || Number(el.dataset.swipe) === swipe)
        && (part !== 'reasoning' || el.querySelector('.mes_reasoning_details')?.open);
    if (sameView) {
        if (!annotationId) scrollFloorTop(el);
    } else jumpTo(index, { swipe: swipe ?? null });
    if (annotationId) session.marks.flash(annotationId, { scrollIntoView: range => scrollToRange(range) });
}

function scrollToRange(range) {
    const view = S.scroller.getBoundingClientRect();
    const rect = range.getBoundingClientRect();
    if (rect.top >= view.top + 40 && rect.bottom <= view.bottom - 40) return;
    S.scroller.scrollTop += rect.top - view.top - view.height / 3;
    updateProgress();
}

// ───────────────────────── 分享卡片（T23a） ─────────────────────────

function openStudio(source) {
    const session = S;
    closePopover(session, { cancel: true });
    session.selUi.hideBubble();
    session.studio.open(source).catch(error => {
        console.error('[st-reader] 卡片工作台打开失败：', error);
        say(`卡片工作台打不开：${error.message ?? error}`);
    });
}

/** 楼层工具条 🖼：整楼（当前显示的候选）。 */
function openCardForFloor(mes) {
    if (!S?.handle || mes.classList.contains('stcr-mes--broken')) return;
    openStudio({ handle: S.handle, ownsHandle: false, kind: 'floor', annotations: S.marks.records(), includeReasoning: false,
        floors: [wholeFloor(Number(mes.getAttribute('mesid')), Number(mes.dataset.swipe))] });
}

/** 选中浮层"卡片"：可跨楼；只摘看得见的楼和展开着的思维链。 */
function openCardFromSelection(range) {
    const session = S;
    if (!session?.handle) return;
    const floors = selectionToFloors(range, renderedFloors());
    if (!floors.length) { say('这段选区里没有正文文字'); return; }
    if (floors.length > MAX_CARD_FLOORS) { say(`一张卡最多 ${MAX_CARD_FLOORS} 楼，请少选一些`); return; }
    getSelection()?.removeAllRanges();
    openStudio({ handle: session.handle, ownsHandle: false, kind: 'selection', floors, annotations: session.marks.records(),
        includeReasoning: floors.some(floor => floor.reasoning) });
}

/** 批注面板划线条目上的 🖼：别的聊天的划线就自己只读打开那个聊天，工作台关掉时释放。 */
async function openCardFromNote(record) {
    const session = S;
    if (!session) return;
    if (!getPrefs().panelPinned || !wide()) session.panel.close();
    const chatKey = record.anchor.chatKey;
    const borrowed = !!session.handle && chatKey === session.chatKey;
    let handle = borrowed ? session.handle : null;
    try {
        if (!handle) handle = await openChat(chatKey, { pageSize: PAGE_SIZE });
        if (S !== session) { if (!borrowed) handle.close(); return; }
        const floor = await annotationToFloor(handle, record, createPieceCache());
        if (!floor) { say('这条划线找不到原文位置了（原文可能变了）'); if (!borrowed) handle.close(); return; }
        const annotations = borrowed ? session.marks.records() : await store.annotations.list({ chatKey });
        if (S !== session) { if (!borrowed) handle.close(); return; }
        openStudio({ handle, ownsHandle: !borrowed, kind: 'note', floors: [floor], annotations, includeReasoning: record.anchor.part === 'reasoning' });
    } catch (error) {
        if (handle && !borrowed) handle.close();
        console.error('[st-reader] 用划线做卡片失败：', error);
        say(error instanceof RangeError ? '这条划线所在的楼已经不存在了' : `卡片打不开：${describeError(error)}`);
    }
}

async function doExport() {
    try {
        const name = await exportBackup(S.root);
        say(`已导出：${name}（在浏览器的下载文件夹里）`);
        refreshBackupStatus();
    } catch (error) {
        console.error('[st-reader] 导出失败：', error);
        say(`导出失败：${describeStoreError(error)}`);
    }
}

function doImport() {
    const session = S;
    pickAndImport({ root: session.root, toast: say, confirm: (content, ok) => confirmDialog(content, ok), onImported: async () => {
        if (S !== session) return;
        await reloadPrefs();
        if (session.handle && await session.marks.loadChat(session.chatKey)) {
            for (const el of renderedFloors()) session.marks.paintFloor(el);
        }
        session.drawer.refreshFavorites();
        refreshBackupStatus();
    } });
}

async function refreshBackupStatus() {
    const session = S;
    if (!session) return;
    try {
        const status = await backupStatus();
        if (S === session) session.settings.setBackupStatus(status);
    } catch { /* 存储不可用时不提醒 */ }
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
        try {
            if (!await session.marks.loadChat(chatKey)) return;
        } catch (error) {
            // 批注读不出来不耽误读聊天
            console.error('[st-reader] 划线与收藏读取失败：', error);
            say(`划线与收藏读取失败：${describeStoreError(error)}`);
        }
        if (S !== session || token !== session.token) return;
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
    if (session.handle && session.studio.usesHandle(session.handle)) session.studio.close();
    session.marks.reset();
    session.chat.replaceChildren();
    session.firstPage = session.lastPage = -1;
    session.hoverIndex = null;
    session.handle?.close();
    session.handle = null;
    session.titleOwner.textContent = '阅读器';
    session.titleFile.textContent = '';
    session.follow.hidden = true;
    session.follow.dataset.key = '';
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
        isBookmarked: (index, swipe) => session.marks.isBookmarked(index, swipe),
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

/** 新放进页面的楼：把它们的划线画上（异步，不挡翻页）。 */
function paintNodes(nodes) {
    for (const node of nodes) {
        if (node.matches?.('.mes[mesid]:not(.stcr-mes--broken)')) S.marks.paintFloor(node);
    }
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

/** 跳到某楼（零基）：只渲染它所在的一批，再按需接上前后批。swipe 给了就切到那个候选。 */
function jumpTo(index, { swipe = null } = {}) {
    const session = S;
    if (!session?.handle?.total) return;
    closePopover(session);
    index = Math.min(session.handle.total - 1, Math.max(0, index));
    if (Number.isInteger(swipe)) {
        session.swipeView.set(index, swipe);
        const model = session.handle.getMessage(index);
        if (swipe >= 0 && swipe < model.swipes.length) rememberSwipe(session.chatKey, index, swipe, swipe === model.swipeId);
    }
    const pageIndex = Math.floor(index / PAGE_SIZE);
    const nodes = pageNodes(pageIndex);
    session.chat.replaceChildren(...nodes);
    session.marks.sweep();
    session.firstPage = session.lastPage = pageIndex;
    let target = floorEl(index);
    if (target && !isShown(target)) {
        // 目标是被隐藏的用户楼：落到它那段的折叠条上。
        target = session.chat.querySelector(`.stcr-fold[data-run="${target.dataset.run}"]`) ?? target;
    }
    session.scroller.scrollTop = 0;
    if (target) session.scroller.scrollTop = target.getBoundingClientRect().top - session.scroller.getBoundingClientRect().top - 8;
    paintNodes(nodes);
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
        let nodes;
        if (nearBottom && session.lastPage < handle.pageCount - 1) {
            nodes = pageNodes(++session.lastPage);
            session.chat.append(...nodes);
        } else if (nearTop && session.firstPage > 0) {
            const anchor = captureAnchor();
            nodes = pageNodes(--session.firstPage);
            session.chat.prepend(...nodes);
            restoreAnchor(anchor);
        } else break;
        paintNodes(nodes);
        trimWindow();
    }
}

function trimWindow() {
    const session = S;
    let trimmed = false;
    while (session.lastPage - session.firstPage + 1 > MAX_PAGES) {
        const anchor = captureAnchor();
        const anchorPage = anchor ? Math.floor(anchor.index / PAGE_SIZE) : session.firstPage;
        const dropFirst = anchorPage - session.firstPage > session.lastPage - anchorPage;
        const page = dropFirst ? session.firstPage++ : session.lastPage--;
        for (const node of session.chat.querySelectorAll(`:scope > [data-page="${page}"]`)) node.remove();
        if (dropFirst) restoreAnchor(anchor);
        trimmed = true;
    }
    if (trimmed) session.marks.sweep();
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
        if (Math.abs(scroller.scrollTop - before) < 1) { say(direction > 0 ? '已经是最后一页' : '已经是第一页'); return; }
    }
    session.chat.classList.remove('stcr-flip');
    void session.chat.offsetWidth;
    session.chat.classList.add('stcr-flip');
    ensureWindow();
    updateProgress();
}

/** 底部进度："第 128–131 楼 · 共 312 楼 · 41%"；顺手记住阅读位置、更新跟随条。 */
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
    updateFollower();
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

/**
 * 跟随条（T21 反馈）：长楼（比大半屏还高）的名字行滚出屏幕、还在读这一楼时，正文右上角浮出
 * 「名字 · ◂ 2/5 ▸ · ⤒」。这一楼读完（楼底滚过顶端）就消失。普通长度的楼不出现，免得滚动时一闪一闪。
 */
function updateFollower() {
    const session = S;
    const follow = session?.follow;
    if (!follow) return;
    let target = null;
    if (session.handle?.total) {
        const view = session.scroller.getBoundingClientRect();
        for (const el of renderedFloors()) {
            if (!isShown(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.bottom <= view.top + 16) continue;
            const head = el.querySelector(':scope > .mes_block > .ch_name');
            if (head && !el.matches('.stcr-mes--system, .stcr-mes--broken') && r.height > view.height * 0.8
                && head.getBoundingClientRect().bottom < view.top && r.bottom > view.top + 160) target = el;
            break;
        }
    }
    if (!target) { follow.hidden = true; return; }
    const index = Number(target.getAttribute('mesid'));
    const swipe = Number(target.dataset.swipe);
    const key = `${session.chatKey}:${index}:${swipe}`;
    if (follow.dataset.key !== key) {
        const model = session.handle.getMessage(index);
        // replaceChildren 会把 null 写成文字"null"，先滤掉
        follow.replaceChildren(...[
            h('span', { class: 'stcr-follow-name', text: model.name }),
            model.swipes.length > 1 ? buildSwipeControl(model, swipe) : null,
            iconButton('fa-arrow-up', '回到这一楼开头', { 'data-act': 'follow-top', 'data-index': index }),
        ].filter(Boolean));
        follow.dataset.key = key;
    }
    follow.classList.toggle('stcr-swipe-bookmarked', target.classList.contains('stcr-swipe-bookmarked'));
    const main = session.main.getBoundingClientRect(), chat = session.chat.getBoundingClientRect();
    follow.style.right = `${Math.max(8, main.right - chat.right + 8)}px`;
    follow.hidden = false;
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

/** 把这一楼的名字行放到视口顶端（从跟随条切候选后，从头读新候选）。 */
function scrollFloorTop(mes) {
    const view = S.scroller.getBoundingClientRect();
    S.scroller.scrollTop += mes.getBoundingClientRect().top - view.top - 8;
    ensureWindow();
    updateProgress();
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
    session.marks.unpaintFloor(mes);
    fillFloor(floorContext(), mes, model, next);
    mes.classList.toggle('stcr-toolbar-pinned', pinned);
    session.scroller.scrollTop += mes.getBoundingClientRect().top - before;
    mes.classList.remove('stcr-swipe-fade');
    void mes.offsetWidth;
    mes.classList.add('stcr-swipe-fade');
    session.swipeView.set(index, next);
    rememberSwipe(session.chatKey, index, next, next === model.swipeId);
    session.marks.paintFloor(mes);
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
    say(ok ? '已复制本楼文字' : '复制失败，请手动选中复制');
}

async function copyCode(button) {
    const code = button.closest('pre')?.querySelector('code');
    if (!code) return;
    const ok = await copyText(code.textContent ?? '');
    const icon = button.querySelector('i');
    if (ok && icon) {
        icon.className = 'fa-solid fa-check';
        setTimeout(() => { icon.className = 'fa-solid fa-copy'; }, 1500);
    } else if (!ok) say('复制失败，请手动选中复制');
}

function toggleFold(button) {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    for (const el of S.chat.querySelectorAll(`:scope > .mes[data-run="${button.dataset.run}"]`)) el.classList.toggle('stcr-user-shown', open);
    updateProgress();
}

// ───────────────────────── 小浮层 ─────────────────────────

/** 同一时间只开一个小浮层。onDismiss：被点外面/换浮层关掉时调用（批注框借此"点外面即保存"）。 */
function setPopover(el, { onDismiss } = {}) {
    const session = S;
    if (!session) return;
    if (session.popover && session.popover !== el) closePopover(session);
    if (!el.isConnected) session.root.append(el);
    session.popover = el;
    session.popoverDismiss = onDismiss ?? null;
}

/** cancel=true：Esc / 取消 / 滚动收起，不触发 onDismiss。 */
function closePopover(session, { cancel = false } = {}) {
    if (!session?.popover) return;
    const dismiss = session.popoverDismiss;
    session.popover.remove();
    session.popover = null;
    session.popoverDismiss = null;
    if (dismiss && !cancel) dismiss();
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
    setPopover(popover);
}

/** 点候选数字：列出每个候选的时间与开头一句，点即跳（02 §5.1）。收藏过的候选有星，有划线的写 ✎N。 */
function openSwipeList(mes, button, { fromFollow = false } = {}) {
    if (S.popover?.dataset.for === mes.getAttribute('mesid')) { closePopover(S); return; }
    closePopover(S);
    const index = Number(mes.getAttribute('mesid'));
    const model = S.handle.getMessage(index);
    const shown = Number(mes.dataset.swipe);
    const previews = swipePreviews(model.swipes.map(swipe => swipe.text));
    const notes = new Map();
    for (const record of S.marks.records()) {
        if (record.anchor.mesIndex === index && !record.orphan) notes.set(record.anchor.swipeIndex, (notes.get(record.anchor.swipeIndex) ?? 0) + 1);
    }
    const popover = h('div', { class: 'stcr-popover stcr-swipe-list', role: 'listbox', 'aria-label': '选择候选', 'data-for': index, 'data-follow': fromFollow ? '1' : '0' },
        ...model.swipes.map(swipe => h('button', { type: 'button', role: 'option', class: `stcr-btn stcr-swipe-item${swipe.index === shown ? ' stcr-on' : ''}`,
            'aria-selected': String(swipe.index === shown), 'data-act': 'swipe-pick', 'data-index': index, 'data-swipe': swipe.index },
        h('span', { class: 'stcr-swipe-item-num', text: String(swipe.index + 1) }),
        h('span', { class: 'stcr-swipe-item-time', text: formatStamp(swipe.sendDate).replace(/^.*日 /, '') }),
        h('span', { class: 'stcr-swipe-item-text', text: previews[swipe.index] || '（空）' }),
        notes.get(swipe.index) ? h('span', { class: 'stcr-swipe-item-notes', title: `这个候选上有 ${notes.get(swipe.index)} 条划线`, text: `✎${notes.get(swipe.index)}` }) : null,
        S.marks.isBookmarked(index, swipe.index) ? h('i', { class: 'fa-solid fa-star stcr-swipe-item-star', title: '已收藏这个候选', 'aria-label': '已收藏' }) : null,
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
        if (index === null) { say(`请输入 1 到 ${session.handle.total} 之间的楼号`); input.select(); return; }
        closePopover(session);
        jumpTo(index);
        session.scroller.focus({ preventScroll: true });
    });
    placePopover(form, session.progressBtn, { above: true });
    input.focus();
}
