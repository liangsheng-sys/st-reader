// ST Reader — AGPL-3.0
// 底部设置条（F1、F1a、F7/F8、F15、02 §1.8）。平时只是右下角的 Aa 圆钮。
// T42：两列栅格（左标签右控件），每行控件从同一条竖线起步；思维链"折叠 / 展开 / 隐藏"一组三选一。
// T45 验收后：两种样子可切换——"长条"（底部一条，各项横排、同一条中线对齐，不挡正文，默认）/ "面板"（T42 的两列栅格）。
// 同一套控件，只换 CSS（.stcr-settings--bar）。手机上两种都是底部半屏抽屉。
// ⋯ 里：排版、备份。T70 起自动备份到 ST 服务器；第一行是上次自动备份的时间与大小，第二行手动按钮。
// 自动备份用不了、且有数据 14 天没导出时，Aa 上亮一个小点（只提醒，不弹窗）。

import { h, iconButton } from './dom.js';
import { effectivePrefs, PREF_LIMITS } from './logic.js';
import { getPrefs, setPrefs } from './prefs.js';

/** 主题当前正文字号（px），用于显示"18"这样的绝对数。 */
export function themeFontSize() {
    const size = parseFloat(getComputedStyle(document.body).fontSize);
    return Number.isFinite(size) ? size : 15;
}

/**
 * @param {{onExport:()=>void, onImport:()=>void, onMirror:()=>void, onRestore:()=>void, onManageRules?:()=>void, versionRow?:{el:HTMLElement, sync:()=>void}}} actions
 * versionRow：⋯ 顶部的版本与更新（T54b）；onMirror / onRestore：立即备份 / 从服务器恢复（T70）；onManageRules：打开屏蔽词与替换规则（T81）
 */
export function createSettingsBar({ onExport, onImport, onMirror = () => {}, onRestore = () => {}, onManageRules = () => {}, versionRow = null }) {
    const fab = h('button', { type: 'button', class: 'stcr-btn stcr-fab', title: '阅读设置', 'aria-label': '阅读设置', 'aria-expanded': 'false', text: 'Aa' });
    const modeSeg = h('div', { class: 'stcr-seg', role: 'group', 'aria-label': '阅读模式' },
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-mode': 'scroll', text: '滚动' }),
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-mode': 'paged', text: '分页' }));
    const fontValue = h('button', { type: 'button', class: 'stcr-btn stcr-num', title: '点这里恢复主题字号' });
    const font = h('div', { class: 'stcr-set-item' }, h('span', { class: 'stcr-set-label', text: '字号' }),
        h('div', { class: 'stcr-set-ctl stcr-set-stepper' },
            iconButton('fa-minus', '字号减小', { 'data-font': '-1' }), fontValue, iconButton('fa-plus', '字号增大', { 'data-font': '1' })));
    const lineRange = h('input', { type: 'range', min: PREF_LIMITS.lineHeight.min, max: PREF_LIMITS.lineHeight.max, step: '0.1', 'aria-label': '行距' });
    const lineValue = h('button', { type: 'button', class: 'stcr-btn stcr-num', title: '点这里恢复主题行距' });
    const widthRange = h('input', { type: 'range', min: PREF_LIMITS.width.min, max: PREF_LIMITS.width.max, step: '10', 'aria-label': '正文宽度' });
    const widthValue = h('button', { type: 'button', class: 'stcr-btn stcr-num', title: '点这里恢复默认宽度' });
    const hideUser = switchInput('隐藏用户楼');
    const hideStHidden = switchInput('隐藏 ST 已隐藏的楼');
    hideStHidden.el.title = '在 ST 里点过小眼睛（不发给模型）的楼，用户楼和角色楼都收成一行，点开能看';
    const redact = switchInput('脱敏显示');
    redact.el.title = '正文按屏蔽词与替换规则显示（只改阅读器里看到的，不改聊天）；划线照常可用';
    // T81/D38：全局的自动名字。脱敏显示、复制脱敏版代码跟它走；分享卡片和 HTML 截图打开时从它起步，窗口里还能临时关
    const autoNames = switchInput('自动名字');
    autoNames.el.title = '自动名字（角色名、你的名字换成 char / user）：脱敏显示、复制脱敏版代码、分享卡片、HTML 截图都按这个起步';
    autoNames.el.append(h('span', { class: 'stcr-set-hint stcr-set-switch-hint', text: '角色名、你的名字换成 char / user' }));
    const rulesBtn = h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-set-rules', onclick: () => onManageRules(),
        title: '屏蔽词和"某个词总是换成什么"的规则；脱敏显示、分享卡片、HTML 截图共用这一张表' },
        h('i', { class: 'fa-solid fa-list-check', 'aria-hidden': 'true' }), ' 管理屏蔽词与替换规则…');
    // 思维链三选一（F15②）：全部折叠 / 全部展开 / 整行隐藏（连"思考了 x 秒"和楼层工具条的 🧠 一起藏）
    const reasoningSeg = h('div', { class: 'stcr-seg', role: 'group', 'aria-label': '思维链' },
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-reasoning': 'fold', text: '折叠', title: '只显示"思考了 x 秒"一行，点开看' }),
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-reasoning': 'open', text: '展开', title: '全部展开' }),
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-reasoning': 'hide', text: '隐藏', title: '整行不显示，读得更沉浸' }));
    // HTML 楼层（T44b）：默认渲染还是看原文；外链默认允许（人类定），这里整体关掉
    const htmlSeg = h('div', { class: 'stcr-seg', role: 'group', 'aria-label': 'HTML 楼层' },
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-html-mode': 'render', text: '渲染', title: '模型写的网页 / 小游戏直接显示出来' }),
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-html-mode': 'source', text: '原文', title: '默认只看代码' }));
    const htmlNet = switchInput('允许外链');
    htmlNet.el.title = '让 HTML 能加载网上的字体、图片等。地址来自模型写的代码，阅读器自己不访问任何网站。关掉后所有 HTML 都断网';
    const dirSeg = h('div', { class: 'stcr-seg', role: 'group', 'aria-label': '排版' },
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-dir': 'b', text: '原样' }),
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-dir': 'a', text: '书页' }));
    const lastExport = h('span', { class: 'stcr-set-hint stcr-last-export' });
    const mirrorLine = h('span', { class: 'stcr-set-hint stcr-mirror-status', role: 'status' });
    const mirrorBtn = h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-mirror-now', onclick: () => onMirror(),
        title: '马上把批注、收藏、规则和设置写到你 ST 的 data/<用户>/user/files/（平时改完 3 秒会自动写）' },
        h('i', { class: 'fa-solid fa-cloud-arrow-up', 'aria-hidden': 'true' }), ' 立即备份');
    const restoreBtn = h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-mirror-restore', onclick: () => onRestore(),
        title: '把 ST 服务器上那份合并回来：缺的补上，同一条以较新的为准，不删你现有的' },
        h('i', { class: 'fa-solid fa-clock-rotate-left', 'aria-hidden': 'true' }), ' 从服务器恢复');
    const more = h('div', { class: 'stcr-set-more', hidden: true },
        versionRow?.el ?? null,
        h('div', { class: 'stcr-set-item' }, h('span', { class: 'stcr-set-label', text: 'HTML' }),
            h('div', { class: 'stcr-set-ctl' }, htmlSeg, htmlNet.el)),
        h('div', { class: 'stcr-set-item' }, h('span', { class: 'stcr-set-label', text: '排版' }),
            h('div', { class: 'stcr-set-ctl' }, dirSeg, h('span', { class: 'stcr-set-hint', text: '原样 = 和 ST 一样；书页 = 压平聊天框、像读小说' }))),
        h('div', { class: 'stcr-set-item stcr-set-backup' }, h('span', { class: 'stcr-set-label', text: '备份' }),
            h('div', { class: 'stcr-set-ctl stcr-backup-ctl' },
                h('div', { class: 'stcr-backup-line' }, mirrorLine),
                h('div', { class: 'stcr-backup-line' },
                    mirrorBtn, restoreBtn,
                    h('span', { class: 'stcr-backup-sep', 'aria-hidden': 'true' }),
                    h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', onclick: () => onExport(), title: '另存一份 JSON 文件到浏览器的下载文件夹' },
                        h('i', { class: 'fa-solid fa-file-export', 'aria-hidden': 'true' }), ' 导出 JSON'),
                    h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', onclick: () => onImport(), title: '从导出过的 JSON 文件合并回来' },
                        h('i', { class: 'fa-solid fa-file-import', 'aria-hidden': 'true' }), ' 导入 JSON'),
                    lastExport))));
    const moreBtn = iconButton('fa-ellipsis', '更多设置', { class: 'stcr-set-more-btn', 'aria-expanded': 'false' });
    const layoutBtn = iconButton('fa-table-cells-large', '换成面板样式', { class: 'stcr-set-layout-btn' });
    const row = (label, ...controls) => h('div', { class: 'stcr-set-item' }, h('span', { class: 'stcr-set-label', text: label }), h('div', { class: 'stcr-set-ctl' }, ...controls));
    const redactRow = row('脱敏', redact.el, autoNames.el, rulesBtn);
    redactRow.classList.add('stcr-set-redact');
    const panel = h('div', { class: 'stcr-settings', role: 'dialog', 'aria-label': '阅读设置', hidden: true },
        h('div', { class: 'stcr-settings-grid' },
            row('翻页', modeSeg),
            font,
            row('行距', lineRange, lineValue),
            row('宽度', widthRange, widthValue),
            row('思维链', reasoningSeg),
            row('显示', hideUser.el, hideStHidden.el),
            redactRow),
        more,
        h('div', { class: 'stcr-set-foot' }, layoutBtn, moreBtn,
            h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-set-done', text: '完成' })));

    modeSeg.addEventListener('click', event => {
        const mode = event.target.closest('[data-mode]')?.dataset.mode;
        if (mode) setPrefs({ mode });
    });
    dirSeg.addEventListener('click', event => {
        const direction = event.target.closest('[data-dir]')?.dataset.dir;
        if (direction) setPrefs({ direction });
    });
    font.addEventListener('click', event => {
        const step = event.target.closest('[data-font]')?.dataset.font;
        if (step) setPrefs({ fontDelta: getPrefs().fontDelta + Number(step) });
    });
    fontValue.addEventListener('click', () => setPrefs({ fontDelta: 0 }));
    lineRange.addEventListener('input', () => setPrefs({ lineHeight: Number(lineRange.value) }));
    lineValue.addEventListener('click', event => { event.preventDefault(); setPrefs({ lineHeight: null }); });
    widthRange.addEventListener('input', () => setPrefs({ width: Number(widthRange.value) }));
    widthValue.addEventListener('click', event => { event.preventDefault(); setPrefs({ width: null }); });
    hideUser.input.addEventListener('change', () => setPrefs({ hideUser: hideUser.input.checked }));
    hideStHidden.input.addEventListener('change', () => setPrefs({ hideStHidden: hideStHidden.input.checked }));
    htmlSeg.addEventListener('click', event => {
        const mode = event.target.closest('[data-html-mode]')?.dataset.htmlMode;
        if (mode) setPrefs({ htmlMode: mode });
    });
    htmlNet.input.addEventListener('change', () => setPrefs({ htmlNetwork: htmlNet.input.checked }));
    redact.input.addEventListener('change', () => setPrefs({ redact: redact.input.checked }));
    autoNames.input.addEventListener('change', () => setPrefs({ autoNames: autoNames.input.checked }));
    reasoningSeg.addEventListener('click', event => {
        const mode = event.target.closest('[data-reasoning]')?.dataset.reasoning;
        if (mode === 'hide') setPrefs({ hideReasoning: true });
        else if (mode) setPrefs({ hideReasoning: false, expandAllReasoning: mode === 'open' });
    });
    moreBtn.addEventListener('click', () => {
        more.hidden = !more.hidden;
        moreBtn.setAttribute('aria-expanded', String(!more.hidden));
    });
    layoutBtn.addEventListener('click', () => { setPrefs({ aaLayout: getPrefs().aaLayout === 'bar' ? 'panel' : 'bar' }); sync(); });
    fab.addEventListener('click', () => (panel.hidden ? open() : close()));
    panel.querySelector('.stcr-set-done').addEventListener('click', () => close());

    function sync() {
        const prefs = getPrefs();
        const shown = effectivePrefs(prefs);
        const bar = prefs.aaLayout === 'bar';
        panel.classList.toggle('stcr-settings--bar', bar);
        const layoutTitle = bar ? '换成面板样式（两列）' : '换成长条样式（底部一行）';
        layoutBtn.title = layoutTitle;
        layoutBtn.setAttribute('aria-label', layoutTitle);
        layoutBtn.firstElementChild.className = `fa-solid ${bar ? 'fa-table-cells-large' : 'fa-grip-lines'}`;
        for (const button of modeSeg.children) button.classList.toggle('stcr-on', button.dataset.mode === shown.mode);
        for (const button of dirSeg.children) button.classList.toggle('stcr-on', button.dataset.dir === prefs.direction);
        fontValue.textContent = String(Math.round(themeFontSize() + prefs.fontDelta));
        lineRange.value = String(prefs.lineHeight ?? 1.6);
        lineValue.textContent = prefs.lineHeight === null ? '主题' : prefs.lineHeight.toFixed(1);
        widthRange.value = String(shown.width ?? 800);
        widthValue.textContent = shown.width === null ? '跟随 ST' : String(shown.width);
        hideUser.input.checked = prefs.hideUser;
        hideStHidden.input.checked = prefs.hideStHidden;
        for (const button of htmlSeg.children) button.classList.toggle('stcr-on', button.dataset.htmlMode === prefs.htmlMode);
        htmlNet.input.checked = prefs.htmlNetwork;
        redact.input.checked = prefs.redact;
        autoNames.input.checked = prefs.autoNames;
        const reasoning = prefs.hideReasoning ? 'hide' : prefs.expandAllReasoning ? 'open' : 'fold';
        for (const button of reasoningSeg.children) button.classList.toggle('stcr-on', button.dataset.reasoning === reasoning);
        versionRow?.sync();
    }
    /** 手动导出状态：{text:'上次导出：3 天前', remind:boolean}；remind 由调用方结合自动备份算好 */
    function setBackupStatus({ text, remind }) {
        lastExport.textContent = text;
        lastExport.classList.toggle('stcr-warn', remind);
        fab.classList.toggle('stcr-fab--remind', remind);
        fab.title = remind ? '阅读设置（自动备份没成功，也有一阵子没导出了）' : '阅读设置';
    }
    /** 自动备份那一行：{text, warn}（logic.mirrorStatusText）；busy 时两个按钮先禁用 */
    function setMirrorStatus({ text, warn }, busy = false) {
        mirrorLine.textContent = text;
        mirrorLine.classList.toggle('stcr-warn', warn);
        mirrorBtn.disabled = restoreBtn.disabled = busy;
    }
    function openMore() {
        open();
        more.hidden = false;
        moreBtn.setAttribute('aria-expanded', 'true');
    }
    function open() {
        sync();
        panel.hidden = false;
        fab.setAttribute('aria-expanded', 'true');
    }
    function close() {
        panel.hidden = true;
        more.hidden = true;
        moreBtn.setAttribute('aria-expanded', 'false');
        fab.setAttribute('aria-expanded', 'false');
    }
    return { fab, panel, sync, open, openMore, close, setBackupStatus, setMirrorStatus, isOpen: () => !panel.hidden };
}

function switchInput(label) {
    const input = h('input', { type: 'checkbox', role: 'switch', class: 'stcr-switch-input' });
    const el = h('label', { class: 'stcr-switch stcr-set-switch' }, input, h('span', { class: 'stcr-switch-track', 'aria-hidden': 'true' }), h('span', { class: 'stcr-set-switch-label', text: label }));
    return { el, input };
}
