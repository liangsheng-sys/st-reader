// ST Reader — AGPL-3.0
// 导出为文档（T97 / D43）：顶栏 ⋯ →"导出为文档…"打开的对话框。选项记住上次的（脱敏除外：每次跟随 Aa"脱敏显示"），
// 范围每次从"整个聊天"起。导出在 core 的 exportDocument 里做（分批、可取消），这里只管选项、进度和下载。
// 导出用自己打开的句柄（命中内存缓存，很快）：阅读器换聊天或关闭都不影响正在导出的这一份。

import { openChat } from '../core/chatSource.js';
import { exportDocument } from '../core/documentExport.js';
import { normalizeDocOptions } from '../core/documentText.js';
import { store } from '../core/store.js';
import { h } from './dom.js';

const INCLUDE = [
    ['floorNumbers', '楼号', '每楼前面一行"第 N 楼"'], ['time', '时间', '和楼号写在同一行'], ['user', '我说的话', '用户楼；不勾就只导出角色说的'],
    ['reasoning', '思维链', 'TXT 里用"（思考）…（思考结束）"包住；网页里是能点开的"思考过程"'],
    ['html', 'HTML 块 / 小剧场', '状态栏、小剧场这类 HTML。TXT 只留文字；网页里是静态的样子（不跑脚本）'],
    ['details', '折叠块', '正文里的折叠内容；网页里能点开'], ['tables', '表格', 'TXT 里每行单元格用空格隔开'], ['code', '代码块', ''],
    ['hidden', '系统楼和隐藏楼', 'ST 的系统提示、旁白，和在 ST 里点过小眼睛隐藏的楼'],
];

const seg = (label, name, items) => h('div', { class: 'stcr-seg', role: 'group', 'aria-label': label },
    ...items.map(([value, text, title]) => h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', [`data-${name}`]: value, text, title: title ?? text })));
const row = (label, ...controls) => h('div', { class: 'stcr-dx-row' }, h('span', { class: 'stcr-dx-label', text: label }), h('div', { class: 'stcr-dx-ctl' }, ...controls));
const check = (text, on, title = '') => {
    const input = h('input', { type: 'checkbox', checked: !!on });
    return { input, el: h('label', { class: 'stcr-dx-check', title: title || null }, input, h('span', { text })) };
};

/**
 * @param {object} opts
 * @param {{open:Function, close:Function}} opts.docPanel
 * @param {string} opts.chatKey
 * @param {string} opts.owner 角色名 / 群名（文件名用）
 * @param {number} opts.total 楼数
 * @param {[number,number]} opts.visible 正在看的楼（"部分楼层"的起点）
 * @param {(index:number)=>number|null} opts.swipeOf 阅读器里选的候选
 * @param {object} opts.saved prefs.docExport
 * @param {(value:object)=>void} opts.remember 写回 prefs.docExport
 * @param {boolean} opts.redactOn Aa"脱敏显示"
 * @param {boolean} opts.autoNames Aa"自动名字"
 * @param {HTMLElement} opts.root 下载链接挂这里（点击不冒泡到 ST）
 * @param {(message:string)=>void} opts.toast
 */
export function openDocExport({ docPanel, chatKey, owner, total, visible, swipeOf, saved, remember, redactOn, autoNames, root, toast }) {
    const state = normalizeDocOptions(saved);
    let controller = null;

    const format = seg('格式', 'format', [['txt', '纯文本 .txt', '像小说：名字一行、正文一段一段，记事本就能看'], ['html', '网页 .html', '单个网页文件，纸张排版，思维链和折叠块能点开，断网也能看']]);
    const rangeSeg = seg('范围', 'range', [['all', '整个聊天'], ['part', '部分楼层']]);
    const fromInput = h('input', { type: 'number', class: 'stcr-dx-num', min: 1, max: total, value: String(visible[0] + 1), 'aria-label': '从第几楼' });
    const toInput = h('input', { type: 'number', class: 'stcr-dx-num', min: 1, max: total, value: String(total), 'aria-label': '到第几楼' });
    const rangeBox = h('span', { class: 'stcr-dx-range', hidden: true }, '第 ', fromInput, ' – ', toInput, ` 楼（共 ${total} 楼）`);
    const swipes = seg('候选', 'swipes', [['host', '酒馆当前', '每楼导出 ST 里现在选着的那个候选'], ['reader', '阅读器里选的', '你在阅读器里切到哪个就导出哪个'], ['all', '全部候选', '每个候选都导出，前面写"候选 2/3"']]);
    const speaker = seg('说话人', 'speaker', [['name', '名字'], ['role', 'user / char'], ['none', '不标']]);
    const checks = INCLUDE.map(([key, text, title]) => ({ key, ...check(text, state.include[key], title) }));
    const redact = check(autoNames ? '套用屏蔽词、替换规则和自动名字（名字变 user / char）' : '套用屏蔽词和替换规则', redactOn);
    const formatHint = h('p', { class: 'stcr-dx-hint' });
    const status = h('span', { class: 'stcr-dx-status', 'aria-live': 'polite' });
    const bar = h('span', { class: 'stcr-dx-bar', hidden: true }, h('span'));
    const cancelBtn = h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', text: '取消' });
    const goBtn = h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-dx-go', text: '导出' });

    const body = h('div', { class: 'stcr-dx' },
        row('格式', format), formatHint,
        row('范围', rangeSeg, rangeBox),
        row('候选', swipes),
        row('说话人', speaker),
        row('包含', h('div', { class: 'stcr-dx-checks' }, ...checks.map(item => item.el))),
        row('脱敏', redact.el));
    const foot = h('div', { class: 'stcr-doc-foot-row' }, bar, status, h('span', { class: 'stcr-doc-gap' }), cancelBtn, goBtn);

    const sync = () => {
        for (const button of format.children) button.classList.toggle('stcr-on', button.dataset.format === state.format);
        for (const button of swipes.children) button.classList.toggle('stcr-on', button.dataset.swipes === state.swipes);
        for (const button of speaker.children) button.classList.toggle('stcr-on', button.dataset.speaker === state.speaker);
        const part = !rangeBox.hidden;
        for (const button of rangeSeg.children) button.classList.toggle('stcr-on', (button.dataset.range === 'part') === part);
        formatHint.textContent = state.format === 'html'
            ? '单个网页文件：纸张排版（系统深色模式下自动变夜读），思维链和折叠块能点开，没有脚本，断网也能看。'
            : '像小说：每楼先写名字，正文一段一段，楼与楼之间空一行，没有 Markdown 符号。';
    };
    const pick = (group, key) => group.addEventListener('click', event => {
        const value = event.target.closest('button')?.dataset[key];
        if (value) { state[key] = value; sync(); }
    });
    pick(format, 'format'); pick(swipes, 'swipes'); pick(speaker, 'speaker');
    rangeSeg.addEventListener('click', event => {
        const value = event.target.closest('button')?.dataset.range;
        if (!value) return;
        rangeBox.hidden = value !== 'part';
        sync();
        if (!rangeBox.hidden) fromInput.focus();
    });
    for (const item of checks) item.input.addEventListener('change', () => { state.include[item.key] = item.input.checked; });
    // 输入框里的按键不给阅读器快捷键（数字、G 等）
    body.addEventListener('keydown', event => { if (event.target.matches('input')) event.stopPropagation(); });

    const busy = on => {
        goBtn.disabled = on;
        for (const el of body.querySelectorAll('button, input')) el.disabled = on;
        bar.hidden = !on;
        cancelBtn.textContent = on ? '停止' : '取消';
    };
    const range = () => {
        if (rangeBox.hidden) return { from: 0, to: total - 1 };
        const a = Math.round(Number(fromInput.value)), b = Math.round(Number(toInput.value));
        if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b > total || a > b) return null;
        return { from: a - 1, to: b - 1 };
    };

    async function run() {
        const span = range();
        if (!span) { status.textContent = `楼层范围要在 1–${total} 之间，前一个不大于后一个`; return; }
        remember({ format: state.format, swipes: state.swipes, speaker: state.speaker, include: { ...state.include } });
        controller = new AbortController();
        const mine = controller;
        busy(true);
        status.textContent = '准备中…';
        let handle = null;
        try {
            let redaction = null;
            if (redact.input.checked) {
                const [maskWords, rules] = await Promise.all([store.maskWords.list(), store.replaceRules.list()]);
                redaction = { maskWords, rules, autoNames };
            }
            handle = await openChat(chatKey, { signal: mine.signal });
            const started = performance.now();
            const result = await exportDocument(handle, { ...state, ...span, swipeOf, redact: redaction, owner }, {
                signal: mine.signal,
                onProgress: (done, all) => {
                    bar.firstChild.style.width = `${Math.round((done / all) * 100)}%`;
                    status.textContent = `正在生成：${done} / ${all} 楼`;
                },
            });
            const url = URL.createObjectURL(result.blob);
            const link = h('a', { href: url, download: result.filename, class: 'stcr-offscreen' });
            root.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            const seconds = ((performance.now() - started) / 1000).toFixed(1);
            const note = result.stats.warnings.length ? `（${result.stats.warnings.join('；')}）` : '';
            console.info(`[st-reader] 导出文档：${result.stats.floors} 楼，${(result.blob.size / 1024).toFixed(0)} KB，${seconds} 秒`, result.stats);
            docPanel.close();
            toast(`已导出：${result.filename}（在浏览器的下载文件夹里）${note}`);
        } catch (error) {
            if (mine.signal.aborted) { status.textContent = '已停止，没有生成文件'; return; }
            console.error('[st-reader] 导出文档失败：', error);
            status.textContent = `导出失败：${error?.message ?? error}`;
        } finally {
            handle?.close();
            if (controller === mine) { controller = null; busy(false); }
        }
    }

    goBtn.addEventListener('click', () => run());
    cancelBtn.addEventListener('click', () => {
        if (controller) controller.abort();
        else docPanel.close();
    });
    sync();
    docPanel.open({ title: '导出为文档', body, foot, onClose: () => controller?.abort() });
    goBtn.focus({ preventScroll: true });
}
