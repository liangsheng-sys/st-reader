// ST Reader — AGPL-3.0
// T92 / D44 浏览器回归（只在开发实例跑；stcrSelfTest() 全量里带，单跑 stcrSelfTest({core:false,favNote:true})）：
// 收藏备注（抽屉铅笔：回车存、Esc 不存；过滤框搜备注；顶栏 ☆ 已收藏时两项小菜单、菜单里改备注）；
// 顶栏图标开关（Aa 与 ST 扩展面板同步、摘 / 挂图标、/reader 照常）。跑完把收藏和开关恢复原样。不读写任何聊天。

import { isDevInstance } from '../core/readonlyGuard.js';
import { foreignExtensionSettings, hostSettings } from '../core/hostSettings.js';
import { favoriteNote, isFavoriteChat, listFavoriteChats, setFavoriteNote, toggleFavoriteChat } from './chatFavorites.js';
import { closeReader, isReaderOpen, openReader } from './reader.js';
import { setTopbarIcon, topbarIconOn } from './topbarIcon.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const paint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
const CHAT = 'STCR_T11_Paper.png/STCR-02-%E4%BB%A3%E7%A0%81%E4%B8%8E%E9%95%BF%E6%96%87';
const snapshot = () => {
    const c = SillyTavern.getContext();
    return JSON.stringify({ chat: c.chat, metadata: c.chatMetadata, character: c.characterId, group: c.groupId, id: c.getCurrentChatId(), ext: foreignExtensionSettings(c.extensionSettings) });
};
const key = (target, key) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

export async function testFavNoteBrowser({ force = false } = {}) {
    if (!isDevInstance(location) && !force) throw new Error('只在开发实例运行');
    if (isReaderOpen()) closeReader();
    const results = [], before = snapshot();
    const check = (name, passed, detail = '') => results.push({ name: `T92 ${name}`, passed: !!passed, detail: String(detail) });
    const until = async (test, ms = 8000) => { const end = Date.now() + ms; while (!test() && Date.now() < end) await wait(25); return test(); };
    await listFavoriteChats();
    const wasFav = isFavoriteChat(CHAT), oldNote = favoriteNote(CHAT), iconBefore = hostSettings.read().topbarIcon;
    const root = () => document.getElementById('stcr_root');
    const list = () => root()?.querySelector('.stcr-drawer-list');
    const rowOf = () => list()?.querySelector(`.stcr-row-wrap [data-key="${CSS.escape(CHAT)}"]`)?.closest('.stcr-row-wrap');
    try {
        if (wasFav) await toggleFavoriteChat(CHAT);
        await toggleFavoriteChat(CHAT, '纸舟（虚构） · STCR-02-代码与长文');

        // ① 抽屉"收藏"页：铅笔 → 回车保存
        await openReader({ tab: 'favorites' });
        if (await until(() => root().querySelector('.stcr-doc'), 800)) root().querySelector('.stcr-doc-close')?.click();
        await until(() => rowOf());
        check('收藏页每行有铅笔', !!rowOf()?.querySelector('[data-note-key]'));
        rowOf().querySelector('[data-note-key]').click();
        let input = rowOf().querySelector('.stcr-fav-note-input');
        check('点铅笔就地出现输入框并聚焦', !!input && document.activeElement === input);
        input.value = '  结局是灯塔亮了  ';
        key(input, 'Enter');
        await until(() => rowOf()?.querySelector('.stcr-row-note'));
        const line = rowOf()?.querySelector('.stcr-row-note');
        check('回车保存：标题下灰字显示备注（去首尾空白）', line?.textContent === '结局是灯塔亮了' && line.title === '结局是灯塔亮了', line?.textContent);
        check('备注写进存储', favoriteNote(CHAT) === '结局是灯塔亮了');
        // Esc 不保存
        rowOf().querySelector('[data-note-key]').click();
        input = rowOf().querySelector('.stcr-fav-note-input');
        input.value = '不该存下的字';
        key(input, 'Escape');
        await paint();
        check('Esc 取消：不保存、输入框消失', favoriteNote(CHAT) === '结局是灯塔亮了' && !rowOf().querySelector('.stcr-fav-note-input') && !rowOf().querySelector('.stcr-row-note').hidden);
        // 过滤框搜备注
        const filter = root().querySelector('.stcr-drawer-filter');
        filter.value = '灯塔'; filter.dispatchEvent(new Event('input'));
        const shown = [...list().querySelectorAll(':scope > .stcr-row-wrap')].filter(row => !row.hidden);
        check('过滤"灯塔"只剩写了这句备注的聊天', shown.length === 1 && shown[0] === rowOf(), `剩 ${shown.length} 行`);
        filter.value = ''; filter.dispatchEvent(new Event('input'));
        closeReader(); await paint();

        // ② 顶栏 ☆：已收藏 → 两项小菜单；菜单里改备注；点外面保存
        await openReader({ chatKey: CHAT });
        await until(() => root().querySelector('.stcr-chat-fav:not([hidden])') && root().querySelector('#stcr_chat .mes'));
        const star = root().querySelector('.stcr-chat-fav');
        star.click(); await paint();
        const menu = root().querySelector('.stcr-fav-menu');
        const items = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].map(item => item.textContent.trim());
        check('已收藏时点 ☆ 弹两项小菜单，不直接取消', items.length === 2 && /编辑备注/.test(items[0]) && /取消收藏/.test(items[1]) && isFavoriteChat(CHAT), items.join(' / '));
        check('菜单顶上显示现有备注', menu?.querySelector('.stcr-fav-menu-note')?.textContent === '结局是灯塔亮了');
        menu.querySelector('[data-act="fav-note"]').click(); await paint();
        input = root().querySelector('.stcr-fav-menu .stcr-fav-note-input');
        check('"编辑备注…"换成输入框，带着原备注', input?.value === '结局是灯塔亮了');
        input.value = '结局是灯塔亮了，船回来了';
        root().querySelector('#stcr_chat').click(); // 点外面 = 保存
        await until(() => favoriteNote(CHAT) === '结局是灯塔亮了，船回来了', 3000);
        check('点浮层外面保存', favoriteNote(CHAT) === '结局是灯塔亮了，船回来了' && !root().querySelector('.stcr-fav-menu'));
        star.click(); await paint();
        root().querySelector('.stcr-fav-menu [data-act="fav-remove"]').click();
        await until(() => !isFavoriteChat(CHAT), 3000);
        check('菜单里"取消收藏"才取消，☆ 变空心', !isFavoriteChat(CHAT) && star.querySelector('i').classList.contains('fa-regular'));
        star.click(); await until(() => isFavoriteChat(CHAT), 3000);
        check('没收藏时点 ☆ 直接收藏（不弹菜单）', isFavoriteChat(CHAT) && !root().querySelector('.stcr-fav-menu'));
        closeReader(); await paint();

        // ③ 顶栏图标开关
        setTopbarIcon(true); await paint();
        check('开：顶栏有书本图标', !!document.getElementById('stcr_topbar_button'));
        const extToggle = document.getElementById('stcr_topbar_icon_toggle');
        check('ST 扩展面板里有阅读器小块和开关', !!extToggle && /魔杖菜单「阅读器」或 \/reader/.test(document.getElementById('stcr_settings_block')?.textContent ?? ''));
        await openReader();
        root().querySelector('.stcr-set-fab, .stcr-fab')?.click?.();
        const aaToggle = [...root().querySelectorAll('.stcr-set-topbar input[type="checkbox"]')][0];
        check('Aa → ⋯ 里有同名开关且是开的', !!aaToggle && aaToggle.checked);
        aaToggle.checked = false; aaToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await paint();
        check('Aa 里关掉：顶栏图标摘掉、存进 ST 设置、扩展面板开关同步', !document.getElementById('stcr_topbar_button') && hostSettings.read().topbarIcon === false && extToggle?.checked === false && !topbarIconOn());
        closeReader(); await paint();
        await SillyTavern.getContext().executeSlashCommandsWithOptions('/reader');
        await until(() => isReaderOpen(), 3000);
        check('图标关着 /reader 照常打开', isReaderOpen());
        closeReader(); await paint();
        extToggle.checked = true; extToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await paint();
        check('扩展面板里打开：图标回来', !!document.getElementById('stcr_topbar_button') && hostSettings.read().topbarIcon === true);
    } finally {
        if (isReaderOpen()) closeReader();
        try {
            if (isFavoriteChat(CHAT) !== wasFav) await toggleFavoriteChat(CHAT, '纸舟（虚构） · STCR-02-代码与长文');
            if (wasFav) await setFavoriteNote(CHAT, oldNote);
        } catch (error) { console.warn('[st-reader] T92 测试恢复收藏失败：', error); }
        setTopbarIcon(iconBefore !== false);
        if (iconBefore === undefined) hostSettings.patch({ topbarIcon: undefined });
    }
    check('宿主聊天、候选、选择与元信息、别的扩展设置未改变', before === snapshot());
    console.table(results);
    return results;
}
