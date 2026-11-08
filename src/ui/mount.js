// ST Reader — AGPL-3.0
// 三个入口（F1、02 §1.1）：魔杖菜单「阅读器」、顶栏书本按钮、斜杠命令 /reader。
// 按钮不用 .drawer-toggle / .mes_button 等 ST 绑了点击逻辑的类名，只借 .drawer / .drawer-icon 的外观。
// T92 / D44：顶栏图标可关（topbarIcon.js），运行时挂 / 摘；ST "扩展"面板里放一个阅读器小块，只有这一个开关。

import { closeReader, isReaderOpen, openReader } from './reader.js';
import { onTopbarIconChange, setTopbarIcon, topbarIconOn } from './topbarIcon.js';

const EXTENSION_ID = new URL('../..', import.meta.url).pathname.replace(/^\/scripts\/extensions\//, '').replace(/\/$/, '');

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

/** 挂顶栏书本图标（已挂则不动）。 */
export function mountTopbarButton() {
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
    if (isReaderOpen()) { icon.classList.add('openIcon'); icon.classList.remove('closedIcon'); }
}

/** 摘掉顶栏书本图标。 */
export function unmountTopbarButton() {
    document.getElementById('stcr_topbar_button')?.remove();
}

/** ST "扩展"面板里的阅读器小块（模板 src/ui/templates/settings.html）：一个开关 + 一句提示，和 Aa 里那个同步。 */
async function mountSettingsBlock() {
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host || document.getElementById('stcr_settings_block')) return;
    const html = await SillyTavern.getContext().renderExtensionTemplateAsync(`${EXTENSION_ID}/src/ui/templates`, 'settings');
    if (document.getElementById('stcr_settings_block')) return;
    host.insertAdjacentHTML('beforeend', html);
    const toggle = document.getElementById('stcr_topbar_icon_toggle');
    if (!toggle) return;
    toggle.checked = topbarIconOn();
    toggle.addEventListener('change', () => setTopbarIcon(toggle.checked));
    onTopbarIconChange(on => { toggle.checked = on; });
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
            description: '可选：recent（最近）/ owners（按角色）/ favorites（收藏的聊天）/ current（当前）',
            typeList: [ARGUMENT_TYPE.STRING], isRequired: false, enumList: ['recent', 'owners', 'favorites', 'current'],
        })],
        helpString: '打开阅读器（只读，不会修改聊天）。例：<code>/reader</code>、<code>/reader recent</code>',
    }));
}

export function mountEntries() {
    mountWandItem();
    if (topbarIconOn()) mountTopbarButton();
    onTopbarIconChange(on => (on ? mountTopbarButton() : unmountTopbarButton()));
    mountSettingsBlock().catch(error => console.error('[st-reader] 扩展面板设置块挂载失败：', error));
    try { registerSlashCommand(); } catch (error) { console.error('[st-reader] /reader 命令注册失败：', error); }
}
