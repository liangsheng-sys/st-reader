// ST Reader — AGPL-3.0
// 左侧聊天抽屉：最近 / 按角色 / 收藏的聊天 / 当前（F1、F12、F13、02 §1.2）。数据只经 core/chatSource（03 §5）。
// T43：按角色页默认跟随 ST 自己的角色排序，顶上小下拉可临时换（只在这次打开阅读器期间有效）；ST 标签筛选；名字搜索；
// 几百个角色时只画看得见的几十行（虚拟滚动，行高固定）。收藏页只列"收藏的整个聊天"（D19），楼 / 候选收藏在右侧面板。

import { getCurrentChatKey, listByCharacter, listByGroup, listRecent, parseChatKey } from '../core/chatSource.js';
import { isFavoriteChat, listFavoriteChats, loadFavoriteChats, onFavoriteChatsChange, toggleFavoriteChat } from './chatFavorites.js';
import { h, iconButton } from './dom.js';
import { filterOwners, formatListDate, matchesFilter, OWNER_SORTS, sortOwners } from './logic.js';
import { loadOwners } from './ownerMeta.js';
import { redactString } from './redact.js';

const TABS = [
    { id: 'recent', icon: 'fa-clock', label: '最近' },
    { id: 'owners', icon: 'fa-user', label: '按角色' },
    { id: 'favorites', icon: 'fa-star', label: '收藏' },
    { id: 'current', icon: 'fa-circle-dot', label: '当前' },
];
const isAbort = error => error?.name === 'AbortError';
/** 虚拟列表的固定行高（与 style.css 的 .stcr-vrow 对应）。 */
const ROW = Object.freeze({ owner: 46, chat: 62, status: 38 });
const OVERSCAN = 8;

/**
 * @param {{onPick:(chatKey:string, target?:{index:number,swipe:number|null})=>void, getActiveKey:()=>string|null,
 *   onPinChange:(pinned:boolean)=>void, isPinned:()=>boolean, toast?:(msg:string)=>void}} options
 */
export function createDrawer({ onPick, getActiveKey, onPinChange, isPinned, toast = () => {} }) {
    let tab = 'recent';
    let ownerKind = 'characters';
    let sortId = 'st';                 // 'st' = 跟随 ST；否则 OWNER_SORTS 的 id（只在这次打开期间有效）
    const pickedTags = new Set();
    let controller = null;
    let owners = null;                 // loadOwners() 的结果，本次打开阅读器内缓存
    const expanded = new Map();        // ownerKey → 'loading' | {error} | ChatSummary[]
    let items = [], offsets = [], total = 0;
    const rendered = new Map();        // 虚拟列表里此刻画着的行：key → 元素
    let frame = 0;

    const tabButtons = TABS.map(item => h('button', { type: 'button', class: 'stcr-btn stcr-drawer-tab', role: 'tab', 'data-tab': item.id, title: item.id === 'favorites' ? '收藏的聊天' : item.label, 'aria-label': item.label },
        h('i', { class: `fa-solid ${item.icon}`, 'aria-hidden': 'true' }), h('span', { class: 'stcr-drawer-tab-label', text: item.label })));
    const filter = h('input', { type: 'search', class: 'stcr-drawer-filter text_pole', placeholder: '过滤名字或标题…', 'aria-label': '过滤列表' });
    const pin = iconButton('fa-thumbtack', '钉住抽屉', { class: 'stcr-drawer-pin' });
    const kinds = h('div', { class: 'stcr-seg stcr-owner-kinds', role: 'group', 'aria-label': '角色或群组' },
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-kind': 'characters', text: '角色' }),
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-kind': 'groups', text: '群组' }));
    const sortSelect = h('select', { class: 'text_pole stcr-owner-sort', 'aria-label': '排序', title: '默认跟随 ST 角色列表的排序；在这里改只影响这次阅读' });
    const tagRow = h('div', { class: 'stcr-owner-tags', role: 'group', 'aria-label': '按标签筛选' });
    const tagMore = h('button', { type: 'button', class: 'stcr-btn stcr-tag-more', 'aria-expanded': 'false', hidden: true });
    const ownerBar = h('div', { class: 'stcr-owner-bar', hidden: true },
        h('div', { class: 'stcr-owner-bar-row' }, kinds, sortSelect), tagRow, tagMore);
    let tagsOpen = false;
    const list = h('div', { class: 'stcr-drawer-list', role: 'list' });
    const vbox = h('div', { class: 'stcr-vlist' });
    const el = h('aside', { class: 'stcr-drawer', 'aria-label': '选择聊天' },
        h('div', { class: 'stcr-drawer-head' },
            h('div', { class: 'stcr-drawer-tabs', role: 'tablist' }, tabButtons),
            pin, iconButton('fa-xmark', '关闭抽屉', { class: 'stcr-drawer-close', 'data-act': 'close-drawer' })),
        h('div', { class: 'stcr-drawer-filter-row' }, filter),
        ownerBar,
        list,
        h('div', { class: 'stcr-drawer-foot', text: '只读 · 不会修改你的聊天' }));

    for (const button of tabButtons) button.addEventListener('click', () => showTab(button.dataset.tab));
    filter.addEventListener('input', () => applyFilter());
    pin.addEventListener('click', () => { onPinChange(!isPinned()); syncPin(); });
    kinds.addEventListener('click', event => {
        const kind = event.target.closest('[data-kind]')?.dataset.kind;
        if (kind && kind !== ownerKind) { ownerKind = kind; list.scrollTop = 0; renderOwners(); }
    });
    sortSelect.addEventListener('change', () => { sortId = sortSelect.value; list.scrollTop = 0; renderOwners(); });
    tagRow.addEventListener('click', event => {
        const chip = event.target.closest('[data-tag]');
        if (!chip) return;
        if (chip.dataset.tag === '') pickedTags.clear();
        else if (pickedTags.has(chip.dataset.tag)) pickedTags.delete(chip.dataset.tag);
        else pickedTags.add(chip.dataset.tag);
        list.scrollTop = 0;
        renderOwners();
    });
    tagMore.addEventListener('click', () => { tagsOpen = !tagsOpen; syncTagMore(); });
    list.addEventListener('scroll', () => { if (tab === 'owners' && !frame) frame = requestAnimationFrame(() => { frame = 0; paintWindow(); }); }, { passive: true });
    list.addEventListener('click', event => {
        const star = event.target.closest('[data-fav-key]');
        if (star) { toggleFavorite(star); return; }
        const row = event.target.closest('[data-key]');
        if (row) { onPick(row.dataset.key); return; }
        const owner = event.target.closest('[data-owner]');
        if (owner) { toggleOwner(owner.dataset.owner); return; }
        if (event.target.closest('[data-act="retry"]')) { owners = null; showTab(tab); }
    });
    const stopFav = onFavoriteChatsChange((chatKey, on) => {
        for (const star of list.querySelectorAll(`[data-fav-key="${CSS.escape(chatKey)}"]`)) setStar(star, on);
        if (tab === 'favorites' && el.classList.contains('stcr-drawer--open')) showTab('favorites');
    });

    function syncPin() {
        pin.classList.toggle('stcr-on', isPinned());
        pin.title = isPinned() ? '取消钉住' : '钉住抽屉';
    }

    async function ensureOwners(signal) {
        owners ??= await loadOwners({ signal }).catch(error => { owners = null; throw error; });
        return owners;
    }
    function ownerOf(summary) {
        if (summary.isGroup) {
            const group = owners?.groups.find(g => g.groupId === summary.groupId);
            return { name: group?.name ?? '群聊', thumb: group?.thumbnailUrl ?? null };
        }
        const card = owners?.characters.find(c => c.avatarUrl === summary.avatarUrl);
        return { name: card?.name ?? String(summary.avatarUrl ?? '').replace(/\.png$/i, ''), thumb: card?.thumbnailUrl ?? null };
    }

    // ───────────── 一行聊天（带 ☆） ─────────────

    function setStar(star, on) {
        star.classList.toggle('stcr-on', on);
        star.setAttribute('aria-pressed', String(on));
        const label = on ? '取消收藏这个聊天' : '收藏这个聊天';
        star.title = label;
        star.setAttribute('aria-label', label);
        const icon = star.querySelector('i');
        icon.classList.toggle('fa-solid', on);
        icon.classList.toggle('fa-regular', !on);
    }

    function chatRow(summary, { showOwner = true, meta: extraMeta = null } = {}) {
        const owner = ownerOf(summary);
        const meta = extraMeta ?? [formatListDate(summary.lastDate), summary.messageCount !== null ? `${summary.messageCount} 楼` : ''].filter(Boolean).join(' · ');
        const star = iconButton('fa-star', '收藏这个聊天', { class: 'stcr-row-fav', 'data-fav-key': summary.chatKey, 'data-fav-title': [owner.name, summary.title].filter(Boolean).join(' · ') });
        setStar(star, isFavoriteChat(summary.chatKey));
        return h('div', { class: 'stcr-row-wrap', role: 'listitem', 'data-filter': [owner.name, summary.title].join('\n') }, // 只过滤名字和标题；全文搜索是 v2
            h('button', { type: 'button', class: `stcr-btn stcr-row${summary.chatKey === getActiveKey() ? ' stcr-row--active' : ''}`, 'data-key': summary.chatKey },
                h('span', { class: 'stcr-row-title' },
                    h('span', { text: redactString(showOwner ? owner.name : summary.title, summary.avatarUrl) }),
                    summary.isGroup && showOwner ? h('small', { class: 'stcr-row-tag', text: '群' }) : null),
                h('span', { class: 'stcr-row-meta', text: showOwner ? [redactString(summary.title, summary.avatarUrl), meta].filter(Boolean).join(' · ') : meta }),
                summary.preview ? h('span', { class: 'stcr-row-preview', text: redactString(summary.preview.replace(/\s+/g, ' '), summary.avatarUrl) }) : null),
            star);
    }

    async function toggleFavorite(star) {
        star.disabled = true;
        try {
            const on = await toggleFavoriteChat(star.dataset.favKey, star.dataset.favTitle);
            toast(on ? '已收藏这个聊天（在"收藏"页里）' : '已取消收藏这个聊天');
        } catch (error) {
            console.error('[st-reader] 收藏聊天失败：', error);
            toast(`没收藏上：${error.message ?? error}`);
        } finally { star.disabled = false; }
    }

    function message(text, retry = false) {
        list.replaceChildren(h('div', { class: 'stcr-drawer-empty' }, h('span', { text }),
            retry ? h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', 'data-act': 'retry', text: '重试' }) : null));
    }
    function loading() {
        list.replaceChildren(...Array.from({ length: 5 }, () => h('div', { class: 'stcr-skeleton stcr-skeleton--row' })));
    }

    async function showTab(next) {
        tab = next;
        for (const button of tabButtons) button.setAttribute('aria-selected', String(button.dataset.tab === tab));
        ownerBar.hidden = tab !== 'owners';
        if (tab !== 'owners') filter.placeholder = '过滤名字或标题…';
        controller?.abort();
        controller = new AbortController();
        const { signal } = controller;
        try {
            loading();
            await Promise.all([ensureOwners(signal), loadFavoriteChats()]);
            if (signal.aborted) return;
            if (tab === 'favorites') {
                const marks = await listFavoriteChats();
                if (signal.aborted) return;
                if (!marks.length) {
                    message('还没有收藏的聊天。把鼠标移到任意一个聊天上点 ☆，或在阅读器顶栏点 ☆ 收藏正在读的聊天。收藏的楼和候选在右侧"划线、批注与收藏"面板里。');
                    return;
                }
                list.replaceChildren(...marks.map(mark => {
                    const parsed = parseChatKey(mark.chatKey);
                    const summary = { chatKey: mark.chatKey, title: parsed.fileName, isGroup: parsed.isGroup, avatarUrl: parsed.avatarUrl, groupId: parsed.groupId, lastDate: null, messageCount: null, preview: '' };
                    return chatRow(summary, { meta: `收藏于 ${formatListDate(mark.createdAt)}` });
                }));
            } else if (tab === 'recent') {
                const rows = await listRecent(50, { signal });
                if (signal.aborted) return;
                if (!rows.length) { message('还没有最近的聊天。'); return; }
                list.replaceChildren(...rows.map(summary => chatRow(summary)));
            } else if (tab === 'current') {
                const key = getCurrentChatKey();
                if (!key) { message('ST 里没有打开的聊天。'); return; }
                const parsed = parseChatKey(key);
                const summary = { chatKey: key, title: parsed.fileName, isGroup: parsed.isGroup, avatarUrl: parsed.avatarUrl, groupId: parsed.groupId, lastDate: null, messageCount: null, preview: '' };
                list.replaceChildren(chatRow(summary));
            } else { renderOwners(); return; }
            applyFilter();
        } catch (error) {
            if (isAbort(error)) return;
            console.error('[st-reader] 抽屉列表读取失败：', error);
            message(`列表读取失败：${error.message ?? error}`, true);
        }
    }

    // ───────────── 按角色（虚拟列表） ─────────────

    function currentSort() {
        return sortId === 'st' ? owners.stSort : OWNER_SORTS.find(s => s.id === sortId) ?? owners.stSort;
    }

    function syncOwnerBar() {
        for (const b of kinds.children) b.classList.toggle('stcr-on', b.dataset.kind === ownerKind);
        sortSelect.replaceChildren(
            h('option', { value: 'st', text: `跟随 ST（${owners.stSort.label}）` }),
            ...OWNER_SORTS.map(s => h('option', { value: s.id, text: s.label })));
        sortSelect.value = sortId;
        const showTags = ownerKind === 'characters' && owners.tags.length > 0;
        tagRow.hidden = !showTags;
        if (showTags) {
            tagRow.replaceChildren(...[ // replaceChildren 会把 null 写成文字"null"，先滤掉
                ...[...owners.tags].sort((a, b) => Number(pickedTags.has(b.id)) - Number(pickedTags.has(a.id))).map(tag => h('button', { type: 'button', class: `stcr-btn stcr-tag-chip${pickedTags.has(tag.id) ? ' stcr-on' : ''}`, 'data-tag': tag.id,
                    'aria-pressed': String(pickedTags.has(tag.id)), style: tag.color ? `--stcr-tag-color:${tag.color}` : null }, tag.name)),
                pickedTags.size ? h('button', { type: 'button', class: 'stcr-btn stcr-tag-clear', 'data-tag': '', title: '清除标签筛选' }, h('i', { class: 'fa-solid fa-xmark', 'aria-hidden': 'true' }), ' 清除') : null].filter(Boolean));
        }
        const total = (ownerKind === 'characters' ? owners.characters : owners.groups).length;
        filter.placeholder = ownerKind === 'groups' ? `搜索 ${total} 个群组…` : `搜索 ${total} 个角色…`;
        syncTagMore();
    }

    /** 标签多时只露两行，"全部标签"展开；选中的标签始终排在前面看得见。 */
    function syncTagMore() {
        tagRow.classList.toggle('stcr-owner-tags--open', tagsOpen);
        if (tagRow.hidden) { tagMore.hidden = true; return; }
        const overflow = tagRow.scrollHeight > tagRow.clientHeight + 2;
        tagMore.hidden = !overflow && !tagsOpen;
        tagMore.setAttribute('aria-expanded', String(tagsOpen));
        tagMore.textContent = tagsOpen ? '收起标签 ▴' : `全部标签（${owners.tags.length}）▾`;
    }

    /** 按当前种类 / 排序 / 标签 / 搜索算出要显示的行（角色行 + 展开的聊天行），记下每行的位置。 */
    function buildItems() {
        const source = ownerKind === 'characters' ? owners.characters : owners.groups;
        const query = filter.value;
        const tags = ownerKind === 'characters' ? [...pickedTags] : [];
        const sorted = sortOwners(filterOwners(source, { tags }), currentSort());
        const next = [];
        for (const owner of sorted) {
            const ownerKey = `${owner.isGroup ? 'g' : 'c'}:${owner.id}`;
            const state = expanded.get(ownerKey);
            const nameHit = matchesFilter(query, owner.name);
            // 角色名匹配：显示它全部聊天；否则只留标题匹配的聊天，有一条就保留这个角色
            const chats = Array.isArray(state) ? (nameHit ? state : state.filter(c => matchesFilter(query, c.title))) : [];
            if (!nameHit && !chats.length) continue;
            next.push({ type: 'owner', key: `o:${ownerKey}`, ownerKey, owner, open: !!state, height: ROW.owner });
            if (!state) continue;
            if (state === 'loading') next.push({ type: 'status', key: `s:${ownerKey}`, text: '正在读取…', height: ROW.status });
            else if (state.error) next.push({ type: 'status', key: `s:${ownerKey}`, text: `读取失败：${state.error}`, height: ROW.status });
            else if (!state.length) next.push({ type: 'status', key: `s:${ownerKey}`, text: '没有聊天记录。', height: ROW.status });
            else for (const summary of chats) next.push({ type: 'chat', key: `k:${summary.chatKey}`, summary, height: ROW.chat });
        }
        items = next;
        offsets = [];
        total = 0;
        for (const item of items) { offsets.push(total); total += item.height; }
    }

    function renderOwners() {
        if (!owners) return;
        syncOwnerBar();
        buildItems();
        rendered.clear();
        if (!items.length) {
            const source = ownerKind === 'characters' ? owners.characters : owners.groups;
            message(!source.length ? (ownerKind === 'characters' ? '没有角色。' : '没有群组。') : '没有符合条件的。换个关键词或少选几个标签试试。');
            return;
        }
        vbox.replaceChildren();
        vbox.style.height = `${total}px`;
        if (vbox.parentNode !== list || list.childElementCount !== 1) list.replaceChildren(vbox);
        paintWindow();
    }

    /** 只画视口上下各多几行；滚动时增删，已有的行原样保留（不打断悬停和焦点）。 */
    function paintWindow() {
        if (tab !== 'owners' || !items.length || vbox.parentNode !== list) return;
        const top = list.scrollTop, bottom = top + list.clientHeight;
        let lo = 0, hi = items.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (offsets[mid] <= top) lo = mid; else hi = mid - 1; }
        const first = Math.max(0, lo - OVERSCAN);
        let last = lo;
        while (last < items.length - 1 && offsets[last + 1] < bottom) last++;
        last = Math.min(items.length - 1, last + OVERSCAN);
        const keep = new Set();
        for (let i = first; i <= last; i++) {
            const item = items[i];
            keep.add(item.key);
            let row = rendered.get(item.key);
            if (!row) {
                row = rowFor(item);
                rendered.set(item.key, row);
                vbox.append(row);
            }
            row.style.transform = `translateY(${offsets[i]}px)`;
        }
        for (const [key, row] of rendered) if (!keep.has(key)) { row.remove(); rendered.delete(key); }
    }

    function rowFor(item) {
        const wrap = h('div', { class: `stcr-vrow stcr-vrow--${item.type}`, style: `height:${item.height}px` });
        if (item.type === 'owner') {
            const { owner } = item;
            wrap.append(h('button', { type: 'button', class: 'stcr-btn stcr-owner-row', 'data-owner': item.ownerKey, 'aria-expanded': String(item.open) },
                owner.thumbnailUrl ? h('img', { class: 'stcr-owner-thumb', src: owner.thumbnailUrl, alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'stcr-owner-thumb stcr-owner-thumb--blank' }),
                h('span', { class: 'stcr-owner-name', text: redactString(owner.name, owner.avatarUrl) }),
                owner.fav ? h('i', { class: 'fa-solid fa-star stcr-owner-fav', title: '在 ST 里收藏过的角色', 'aria-label': 'ST 收藏' }) : null,
                h('i', { class: 'fa-solid fa-chevron-right stcr-owner-arrow', 'aria-hidden': 'true' })));
        } else if (item.type === 'chat') {
            wrap.append(chatRow(item.summary, { showOwner: false }));
        } else wrap.append(h('div', { class: 'stcr-drawer-empty stcr-drawer-empty--small', text: item.text }));
        return wrap;
    }

    async function toggleOwner(ownerKey) {
        if (expanded.has(ownerKey)) { expanded.delete(ownerKey); renderOwners(); return; }
        expanded.set(ownerKey, 'loading');
        renderOwners();
        const id = ownerKey.slice(2);
        const signal = controller?.signal;
        try {
            const chats = ownerKey.startsWith('g:') ? await listByGroup(id, { signal }) : await listByCharacter(id, { signal });
            chats.sort((a, b) => String(b.lastDate ?? '').localeCompare(String(a.lastDate ?? '')));
            if (expanded.get(ownerKey) !== 'loading') return; // 等待期间又收起了
            expanded.set(ownerKey, chats);
        } catch (error) {
            if (isAbort(error)) { expanded.delete(ownerKey); return; }
            expanded.set(ownerKey, { error: error.message ?? String(error) });
        }
        if (tab === 'owners') renderOwners();
    }

    function applyFilter() {
        if (tab === 'owners') { list.scrollTop = 0; renderOwners(); return; }
        const query = filter.value;
        for (const item of list.querySelectorAll(':scope > [data-filter]')) item.hidden = !matchesFilter(query, item.dataset.filter);
    }

    function markActive() {
        const active = getActiveKey();
        for (const row of list.querySelectorAll('[data-key]')) row.classList.toggle('stcr-row--active', row.dataset.key === active);
    }

    return {
        el,
        open(next) {
            el.classList.add('stcr-drawer--open');
            syncPin();
            if (next || !list.childElementCount) showTab(next ?? tab);
            else markActive();
        },
        close() { el.classList.remove('stcr-drawer--open'); },
        /** 脱敏显示变了：列表开着就按当前页签重画（名字、标题、预览跟着换）。 */
        refreshList() { if (el.classList.contains('stcr-drawer--open')) { if (tab === 'owners' && owners) renderOwners(); else showTab(tab); } },
        /** 收藏变了（备份导入等）：收藏页开着就重读。 */
        refreshFavorites() { if (tab === 'favorites' && el.classList.contains('stcr-drawer--open')) showTab('favorites'); },
        isOpen() { return el.classList.contains('stcr-drawer--open'); },
        focusFilter() { filter.focus(); },
        markActive,
        destroy() { controller?.abort(); cancelAnimationFrame(frame); stopFav(); expanded.clear(); rendered.clear(); owners = null; },
    };
}
