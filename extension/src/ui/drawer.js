// 左侧聊天抽屉：最近 / 按角色 / 收藏 / 当前（F1、02 §1.2）。数据只经 core/chatSource（03 §5）。

import { getCurrentChatKey, listByCharacter, listByGroup, listCharacters, listGroups, listRecent, parseChatKey } from '../core/chatSource.js';
import { h, iconButton } from './dom.js';
import { formatListDate, matchesFilter } from './logic.js';

const TABS = [
    { id: 'recent', icon: 'fa-clock', label: '最近' },
    { id: 'owners', icon: 'fa-user', label: '按角色' },
    { id: 'favorites', icon: 'fa-star', label: '收藏' },
    { id: 'current', icon: 'fa-circle-dot', label: '当前' },
];
const isAbort = error => error?.name === 'AbortError';

/**
 * @param {{onPick:(chatKey:string)=>void, getActiveKey:()=>string|null, onPinChange:(pinned:boolean)=>void, isPinned:()=>boolean}} options
 */
export function createDrawer({ onPick, getActiveKey, onPinChange, isPinned }) {
    let tab = 'recent';
    let ownerKind = 'characters';
    let controller = null;
    let lookups = null; // {characters: Map, groups: Map}
    const expanded = new Map(); // 展开的角色/群组 → 其聊天列表（本次打开阅读器内缓存）

    const tabButtons = TABS.map(item => h('button', { type: 'button', class: 'stcr-btn stcr-drawer-tab', role: 'tab', 'data-tab': item.id, title: item.label, 'aria-label': item.label },
        h('i', { class: `fa-solid ${item.icon}`, 'aria-hidden': 'true' }), h('span', { class: 'stcr-drawer-tab-label', text: item.label })));
    const filter = h('input', { type: 'search', class: 'stcr-drawer-filter text_pole', placeholder: '过滤名字或标题…', 'aria-label': '过滤列表' });
    const pin = iconButton('fa-thumbtack', '钉住抽屉', { class: 'stcr-drawer-pin' });
    const list = h('div', { class: 'stcr-drawer-list', role: 'list' });
    const el = h('aside', { class: 'stcr-drawer', 'aria-label': '选择聊天' },
        h('div', { class: 'stcr-drawer-head' },
            h('div', { class: 'stcr-drawer-tabs', role: 'tablist' }, tabButtons),
            pin, iconButton('fa-xmark', '关闭抽屉', { class: 'stcr-drawer-close', 'data-act': 'close-drawer' })),
        h('div', { class: 'stcr-drawer-filter-row' }, filter),
        list,
        h('div', { class: 'stcr-drawer-foot', text: '只读 · 不会修改你的聊天' }));

    for (const button of tabButtons) button.addEventListener('click', () => showTab(button.dataset.tab));
    filter.addEventListener('input', () => applyFilter());
    pin.addEventListener('click', () => { onPinChange(!isPinned()); syncPin(); });
    list.addEventListener('click', event => {
        const row = event.target.closest('[data-key]');
        if (row) { onPick(row.dataset.key); return; }
        const owner = event.target.closest('[data-owner]');
        if (owner) { toggleOwner(owner); return; }
        const kind = event.target.closest('[data-kind]');
        if (kind) { ownerKind = kind.dataset.kind; showTab('owners'); return; }
        if (event.target.closest('[data-act="retry"]')) showTab(tab);
    });

    function syncPin() {
        pin.classList.toggle('stcr-on', isPinned());
        pin.title = isPinned() ? '取消钉住' : '钉住抽屉';
    }

    async function ensureLookups(signal) {
        if (lookups) return lookups;
        const [characters, groups] = await Promise.all([listCharacters({ signal }), listGroups({ signal })]);
        lookups = { characters: new Map(characters.map(item => [item.avatarUrl, item])), groups: new Map(groups.map(item => [item.id, item])) };
        return lookups;
    }
    function ownerOf(summary) {
        if (summary.isGroup) {
            const group = lookups?.groups.get(summary.groupId);
            return { name: group?.name ?? '群聊', thumb: group?.thumbnailUrl ?? null };
        }
        const card = lookups?.characters.get(summary.avatarUrl);
        return { name: card?.name ?? String(summary.avatarUrl ?? '').replace(/\.png$/i, ''), thumb: card?.thumbnailUrl ?? null };
    }

    function chatRow(summary, { showOwner = true } = {}) {
        const owner = ownerOf(summary);
        const meta = [formatListDate(summary.lastDate), summary.messageCount !== null ? `${summary.messageCount} 楼` : ''].filter(Boolean).join(' · ');
        return h('button', { type: 'button', class: 'stcr-btn stcr-row', role: 'listitem', 'data-key': summary.chatKey,
            'data-filter': [owner.name, summary.title].join('\n') }, // 只过滤名字和标题；全文搜索是 v2
        h('span', { class: 'stcr-row-title' },
            h('span', { text: showOwner ? owner.name : summary.title }),
            summary.isGroup && showOwner ? h('small', { class: 'stcr-row-tag', text: '群' }) : null),
        h('span', { class: 'stcr-row-meta', text: showOwner ? [summary.title, meta].filter(Boolean).join(' · ') : meta }),
        summary.preview ? h('span', { class: 'stcr-row-preview', text: summary.preview.replace(/\s+/g, ' ') }) : null);
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
        controller?.abort();
        controller = new AbortController();
        const { signal } = controller;
        try {
            if (tab === 'favorites') { message('收藏楼层与收藏候选在下一步（T22）开放。'); return; }
            loading();
            await ensureLookups(signal);
            if (signal.aborted) return;
            if (tab === 'recent') {
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
            } else renderOwners();
            markActive();
            applyFilter();
        } catch (error) {
            if (isAbort(error)) return;
            console.error('[st-reader] 抽屉列表读取失败：', error);
            message(`列表读取失败：${error.message ?? error}`, true);
        }
    }

    function renderOwners() {
        const kinds = h('div', { class: 'stcr-seg', role: 'group' },
            h('button', { type: 'button', class: `stcr-btn stcr-seg-btn${ownerKind === 'characters' ? ' stcr-on' : ''}`, 'data-kind': 'characters', text: '角色' }),
            h('button', { type: 'button', class: `stcr-btn stcr-seg-btn${ownerKind === 'groups' ? ' stcr-on' : ''}`, 'data-kind': 'groups', text: '群组' }));
        const owners = ownerKind === 'characters'
            ? [...lookups.characters.values()].map(item => ({ id: item.avatarUrl, name: item.name, thumb: item.thumbnailUrl, isGroup: false }))
            : [...lookups.groups.values()].map(item => ({ id: item.id, name: item.name, thumb: item.thumbnailUrl, isGroup: true }));
        owners.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
        const rows = owners.map(owner => {
            const ownerKey = `${owner.isGroup ? 'g' : 'c'}:${owner.id}`;
            const wrap = h('div', { class: 'stcr-owner', 'data-filter': owner.name },
                h('button', { type: 'button', class: 'stcr-btn stcr-owner-row', 'data-owner': ownerKey, 'aria-expanded': String(expanded.has(ownerKey)) },
                    owner.thumb ? h('img', { class: 'stcr-owner-thumb', src: owner.thumb, alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'stcr-owner-thumb stcr-owner-thumb--blank' }),
                    h('span', { class: 'stcr-owner-name', text: owner.name }),
                    h('i', { class: 'fa-solid fa-chevron-right stcr-owner-arrow', 'aria-hidden': 'true' })),
                h('div', { class: 'stcr-owner-chats' }));
            if (expanded.get(ownerKey)) fillOwnerChats(wrap, expanded.get(ownerKey));
            return wrap;
        });
        list.replaceChildren(kinds, ...(rows.length ? rows : [h('div', { class: 'stcr-drawer-empty', text: ownerKind === 'characters' ? '没有角色。' : '没有群组。' })]));
    }

    function fillOwnerChats(wrap, chats) {
        const box = wrap.querySelector('.stcr-owner-chats');
        box.replaceChildren(...(chats.length ? chats.map(summary => chatRow(summary, { showOwner: false })) : [h('div', { class: 'stcr-drawer-empty stcr-drawer-empty--small', text: '没有聊天记录。' })]));
        markActive();
        applyFilter();
    }

    async function toggleOwner(button) {
        const ownerKey = button.dataset.owner;
        const wrap = button.closest('.stcr-owner');
        if (expanded.has(ownerKey)) {
            expanded.delete(ownerKey);
            button.setAttribute('aria-expanded', 'false');
            wrap.querySelector('.stcr-owner-chats').replaceChildren();
            return;
        }
        button.setAttribute('aria-expanded', 'true');
        const box = wrap.querySelector('.stcr-owner-chats');
        box.replaceChildren(h('div', { class: 'stcr-skeleton stcr-skeleton--row' }));
        const id = ownerKey.slice(2);
        try {
            const chats = ownerKey.startsWith('g:') ? await listByGroup(id, { signal: controller?.signal }) : await listByCharacter(id, { signal: controller?.signal });
            chats.sort((a, b) => String(b.lastDate ?? '').localeCompare(String(a.lastDate ?? '')));
            expanded.set(ownerKey, chats);
            fillOwnerChats(wrap, chats);
        } catch (error) {
            if (isAbort(error)) return;
            box.replaceChildren(h('div', { class: 'stcr-drawer-empty stcr-drawer-empty--small', text: `读取失败：${error.message ?? error}` }));
        }
    }

    function applyFilter() {
        const query = filter.value;
        for (const item of list.querySelectorAll(':scope > [data-filter]')) {
            const own = matchesFilter(query, item.dataset.filter);
            if (!item.classList.contains('stcr-owner')) { item.hidden = !own; continue; }
            // 角色名匹配：显示它全部聊天；否则只留标题匹配的聊天，有一条就保留这个角色。
            let anyChild = false;
            for (const row of item.querySelectorAll('.stcr-row[data-filter]')) {
                row.hidden = !own && !matchesFilter(query, row.dataset.filter);
                anyChild ||= !row.hidden;
            }
            item.hidden = !own && !anyChild;
        }
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
        isOpen() { return el.classList.contains('stcr-drawer--open'); },
        focusFilter() { filter.focus(); },
        markActive,
        destroy() { controller?.abort(); expanded.clear(); lookups = null; },
    };
}
