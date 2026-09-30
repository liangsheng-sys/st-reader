// ST Reader — AGPL-3.0
// 三个入口（F1、02 §1.1）：魔杖菜单「阅读器」、顶栏书本按钮、斜杠命令 /reader。
// 按钮不用 .drawer-toggle / .mes_button 等 ST 绑了点击逻辑的类名，只借 .drawer / .drawer-icon 的外观。

import { closeReader, isReaderOpen, openReader } from './reader.js';

const TABS = { recent: 'recent', owners: 'owners', characters: 'owners', favorites: 'favorites', current: 'current' };

function open(options) {
    openReader(options).catch(error => {
        console.error('[st-reader] 阅读器打开失败：', error);
        globalThis.toastr?.error?.(String(error?.message ?? error), '阅读器打开失败');
    });
}

function mountWandItem() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById('stcr_wand_item')) return;
    const item = document.createElement('div');
    item.id = 'stcr_wand_item';
    item.className = 'list-group-item flex-container flexGap5';
    item.title = '像读小说一样读聊天记录（只读）';
    item.innerHTML = '<div class="fa-solid fa-book-open extensionsMenuExtensionButton"></div><span>阅读器</span>';
    item.addEventListener('click', () => open());
    menu.append(item);
}

function mountTopbarButton() {
    const holder = document.getElementById('top-settings-holder');
    if (!holder || document.getElementById('stcr_topbar_button')) return;
    const wrap = document.createElement('div');
    wrap.id = 'stcr_topbar_button';
    wrap.className = 'drawer';
    const icon = document.createElement('div');
    icon.className = 'drawer-icon fa-solid fa-book-open fa-fw closedIcon';
    icon.title = '阅读器';
    icon.setAttribute('aria-label', '打开阅读器');
    // 键盘：ST 的 a11y/keyboard 模块会给 .drawer-icon 补 role/tabindex，并把回车转成 click，这里不重复处理。
    icon.addEventListener('click', () => (isReaderOpen() ? closeReader() : open()));
    wrap.append(icon);
    holder.append(wrap);
}

function registerSlashCommand() {
    const { SlashCommandParser, SlashCommand, SlashCommandArgument, ARGUMENT_TYPE } = SillyTavern.getContext();
    if (!SlashCommandParser?.addCommandObject || !SlashCommand?.fromProps) return;
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'reader',
        callback: (_args, value) => {
            const tab = TABS[String(value ?? '').trim().toLowerCase()];
            open(tab ? { tab } : {});
            return '';
        },
        unnamedArgumentList: [SlashCommandArgument.fromProps({
            description: '可选：recent（最近）/ owners（按角色）/ favorites（收藏）/ current（当前）',
            typeList: [ARGUMENT_TYPE.STRING], isRequired: false, enumList: ['recent', 'owners', 'favorites', 'current'],
        })],
        helpString: '打开阅读器（只读，不会修改聊天）。例：<code>/reader</code>、<code>/reader recent</code>',
    }));
}

export function mountEntries() {
    mountWandItem();
    mountTopbarButton();
    try { registerSlashCommand(); } catch (error) { console.error('[st-reader] /reader 命令注册失败：', error); }
}
