// ST Reader — AGPL-3.0
// 版本与更新（T54b、D25）：Aa → ⋯ 顶部一行"ST Reader v0.1.0 · 检查更新 · 更新日志"；
// 更新后第一次打开阅读器弹"本次更新了什么"。数据全走 core 的 updateService（03 §5.15）。
// 检查 / 更新只在人类点按钮时发生（ST 会去 github.com 拉取本扩展的目录，不碰聊天）；绝不自动更新。

import { checkUpdate, getChangelog, getLastSeenVersion, getVersion, markVersionSeen, runUpdate } from '../core/updateService.js';
import { renderMarkdown } from './docPanel.js';
import { h } from './dom.js';
import { getPrefs, setPrefs } from './prefs.js';

/**
 * 设置里的版本一行。
 * @param {{docPanel:ReturnType<import('./docPanel.js').createDocPanel>}} opts
 */
export function createVersionRow({ docPanel }) {
    const name = h('span', { class: 'stcr-ver-name', text: 'ST Reader' });
    const status = h('span', { class: 'stcr-ver-status', role: 'status' });
    const checkBtn = h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-ver-check', text: '检查更新',
        title: '让 ST 去 GitHub 看看阅读器有没有新版本（只看本扩展，不碰聊天）' });
    const updateBtn = h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-ver-update stcr-on', text: '立即更新', hidden: true,
        title: '让 ST 下载新版本的阅读器；完成后刷新页面生效' });
    const reloadBtn = h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-ver-reload stcr-on', text: '刷新页面', hidden: true,
        title: '刷新整个页面，让新版本生效（阅读位置、批注都已保存）' });
    const logBtn = h('button', { type: 'button', class: 'stcr-btn stcr-link-btn stcr-ver-log', text: '更新日志', title: '看看每个版本改了什么' });
    const notice = h('input', { type: 'checkbox', role: 'switch', class: 'stcr-switch-input' });
    const noticeEl = h('label', { class: 'stcr-switch stcr-set-switch stcr-ver-notice', title: '更新后第一次打开阅读器时，告诉你这次改了什么' },
        notice, h('span', { class: 'stcr-switch-track', 'aria-hidden': 'true' }), h('span', { class: 'stcr-set-switch-label', text: '更新后提醒' }));
    const el = h('div', { class: 'stcr-set-item stcr-set-version' }, h('span', { class: 'stcr-set-label', text: '版本' }),
        h('div', { class: 'stcr-set-ctl' }, name, checkBtn, updateBtn, reloadBtn, status, logBtn, noticeEl));

    let busy = false;
    const say = (text, tone = '') => { status.textContent = text; status.dataset.tone = tone; };

    getVersion().then(version => { name.textContent = `ST Reader v${version}`; })
        .catch(() => { name.textContent = 'ST Reader'; say('版本号没读出来', 'warn'); });

    /** core 的结果对象 → 这一行的样子（03 §5.15 状态表）。 */
    function show(result) {
        updateBtn.hidden = result.state !== 'available';
        reloadBtn.hidden = result.state !== 'updated';
        checkBtn.hidden = result.state === 'updated';
        if (result.state === 'dev') say(result.message || '开发目录，不可更新');
        else if (result.state === 'latest') say('已经是最新版本', 'ok');
        else if (result.state === 'available') say('有新版本', 'accent');
        else if (result.state === 'updated') say('更新完成，刷新页面后生效', 'ok');
        else say(result.message || '没查成，请稍后再试', 'warn');
        checkBtn.textContent = result.state === 'error' ? '再试一次' : '检查更新';
    }
    async function act(run, pending) {
        if (busy) return;
        busy = true;
        checkBtn.disabled = updateBtn.disabled = true;
        say(pending);
        try { show(await run()); }
        catch { show({ state: 'error', message: '没查成，请稍后再试' }); }
        finally { busy = false; checkBtn.disabled = updateBtn.disabled = false; }
    }
    checkBtn.addEventListener('click', () => act(checkUpdate, '正在检查…'));
    updateBtn.addEventListener('click', () => act(runUpdate, '正在更新…（ST 在下载，可能要一会儿）'));
    reloadBtn.addEventListener('click', () => location.reload());
    logBtn.addEventListener('click', () => showChangelog(docPanel));
    notice.addEventListener('change', () => setPrefs({ updateNotice: notice.checked }));

    return { el, sync: () => { notice.checked = getPrefs().updateNotice; } };
}

/** 完整更新日志（所有版本）。 */
async function showChangelog(docPanel) {
    let sections;
    try { sections = await getChangelog(); }
    catch { docPanel.open({ title: '更新日志', body: h('p', { text: '更新日志没读出来，请稍后再试。' }) }); return; }
    const markdown = sections.length ? sections.map(s => `## ${s.version}\n\n${s.markdown}`).join('\n\n') : '还没有更新日志。';
    docPanel.open({ title: '更新日志', body: renderMarkdown(markdown) });
}

/**
 * 打开阅读器时调用：这个版本还没给人类看过 → 弹"本次更新了什么"。
 * 读不到版本 / 日志就安静地不弹（下次再试），不标记已读。
 * 已读记录为空（从没记过，例如从还没有这个功能的 0.1.0 升上来）也弹：更新的人正需要看到。
 * @param {ReturnType<import('./docPanel.js').createDocPanel>} docPanel
 * @param {()=>boolean} stillOpen 阅读器还开着（异步读取期间可能被关掉）
 */
export async function maybeShowWhatsNew(docPanel, stillOpen) {
    let version, seen, sections;
    try { [version, seen] = await Promise.all([getVersion(), getLastSeenVersion()]); }
    catch { return; }
    if (seen === version) return;
    if (!getPrefs().updateNotice) { await markVersionSeen(version).catch(() => {}); return; } // 关了提醒：静静记成看过
    try { sections = await getChangelog(); } catch { return; }
    const section = sections.find(s => s.version === version);
    if (!section) { await markVersionSeen(version).catch(() => {}); return; } // 这个版本没写日志：没什么可说
    if (!stillOpen() || docPanel.isOpen()) return;
    const mute = h('input', { type: 'checkbox', class: 'stcr-doc-check' });
    mute.addEventListener('change', () => setPrefs({ updateNotice: !mute.checked }));
    const foot = h('div', { class: 'stcr-doc-foot-row' },
        h('label', { class: 'stcr-doc-mute' }, mute, h('span', { text: '以后更新不再提醒' })),
        h('span', { class: 'stcr-doc-gap' }),
        h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-on', text: '知道了', onclick: () => docPanel.close() }));
    docPanel.open({
        title: `ST Reader v${version} 更新了什么`,
        body: renderMarkdown(section.markdown || '这个版本是一些小修小补。'),
        foot,
    });
    // 已经展示出来才算看过（合同要求）；不等关闭——直接关掉整个阅读器也算看过，下次不再弹
    await markVersionSeen(version).catch(() => {});
}
