// ST Reader — AGPL-3.0
import { createUpdateService, updateService } from './updateService.js';
import { isDevInstance } from './readonlyGuard.js';
import { store } from './store.js';
import { hostSettings } from './hostSettings.js';

const assert = (value, message) => { if (!value) throw new Error(message); };
function requireDev() { if (!isDevInstance(location)) throw new Error('版本自测只允许 .dev 开发实例'); }
function hostSnapshot() {
    const context = SillyTavern.getContext();
    return JSON.stringify({ chat: context.chat, metadata: context.chatMetadata, characterId: context.characterId, groupId: context.groupId });
}

/** 开发专用面板，不挂正式阅读器入口；供 T54a 验收，T54b 仍由 Opus 实现。 */
export async function showUpdateServiceDemo() {
    requireDev(); document.querySelector('#stcr_update_demo')?.remove();
    const dialog = document.createElement('dialog'); dialog.id = 'stcr_update_demo';
    dialog.style.cssText = 'background:#20242b;color:#eee;border:1px solid #888;border-radius:12px;padding:24px;width:min(680px,90vw);max-height:85vh;overflow:auto;text-align:left';
    const title = document.createElement('h2'); title.textContent = `ST Reader v${await updateService.getVersion()}`;
    const note = document.createElement('p'); note.textContent = '版本与更新 core 开发验收';
    const status = document.createElement('p'); status.id = 'stcr_update_demo_status'; status.setAttribute('role', 'status');
    const check = document.createElement('button'); check.textContent = '检查更新';
    const update = document.createElement('button'); update.textContent = '立即更新'; update.disabled = true;
    const close = document.createElement('button'); close.textContent = '关闭';
    for (const button of [check, update, close]) button.style.cssText = 'padding:8px;margin:4px;color:inherit;background:#454b55;border:1px solid #aaa;border-radius:4px';
    const log = document.createElement('pre'); log.style.cssText = 'white-space:pre-wrap;font:inherit;text-align:left';
    const sections = await updateService.getChangelog();
    log.textContent = sections.map(section => `版本 ${section.version}\n${section.markdown}`).join('\n\n');
    async function run(action) {
        check.disabled = update.disabled = true; status.textContent = '正在检查…';
        try { const result = await action(); status.textContent = result.message; status.dataset.state = result.state; update.disabled = result.state !== 'available'; }
        catch (error) { status.textContent = error.message; status.dataset.state = 'error'; }
        finally { check.disabled = false; }
    }
    check.onclick = () => run(updateService.checkUpdate); update.onclick = () => run(updateService.runUpdate);
    close.onclick = () => dialog.close(); dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.append(title, note, status, check, update, close, log); document.body.append(dialog); dialog.showModal();
    await run(updateService.checkUpdate);
    return { version: title.textContent, state: status.dataset.state, message: status.textContent };
}

export async function testUpdateServiceBrowser() {
    requireDev();
    const results = [], requests = [], before = hostSnapshot();
    const test = async (name, run) => { await run(); results.push({ name: `更新浏览器：${name}`, passed: true }); };
    const service = createUpdateService({ fetchImpl: (url, init) => { requests.push({ path: new URL(url, location.href).pathname, method: init.method }); return fetch(url, init); } });
    let version;
    await test('真实 manifest 与 CHANGELOG 同源可读，版本匹配', async () => {
        version = await service.getVersion();
        const log = await service.getChangelog(); assert(log.some(item => item.version === version && item.markdown.length), '当前版本没有日志段落');
    });
    await test('开发联接检查与更新都返回 dev，零 Git 请求', async () => {
        for (const result of [await service.checkUpdate(), await service.runUpdate()]) {
            assert(result.state === 'dev' && result.reason === 'development-instance', '未识别开发预载标记，请重启开发实例');
            assert(result.message === '开发目录，不可更新', '开发状态文案不符');
        }
        assert(requests.every(request => request.method === 'GET' && /\/(manifest\.json|CHANGELOG\.md)$/.test(request.path)), '开发检查触发了其他请求');
    });
    await test('lastSeenVersion 写进 ST 的 extension_settings 与扩展 settings，并恢复原值', async () => {
        const previous = await store.settings.all(), previousHost = hostSettings.read().lastSeenVersion;
        try {
            await service.markVersionSeen(version);
            assert(await store.settings.get('lastSeenVersion') === version && await createUpdateService().getLastSeenVersion() === version, '已读版本未持久化');
            assert(hostSettings.read().lastSeenVersion === version, '已读版本没进 extension_settings（T70 / I053）');
        } finally {
            if (Object.hasOwn(previous, 'lastSeenVersion')) await store.settings.set('lastSeenVersion', previous.lastSeenVersion);
            else await store.settings.remove('lastSeenVersion');
            hostSettings.patch({ lastSeenVersion: previousHost });
        }
        assert(JSON.stringify(await store.settings.all()) === JSON.stringify(previous), '验收后设置未恢复');
        assert(hostSettings.read().lastSeenVersion === previousHost, '验收后 extension_settings 未恢复');
    });
    await test('可见面板显示版本与开发提示，更新按钮禁用，宿主聊天不变', async () => {
        try {
            const shown = await showUpdateServiceDemo();
            assert(shown.state === 'dev' && shown.message === '开发目录，不可更新', '面板未显示开发状态');
            const dialog = document.querySelector('#stcr_update_demo');
            assert(dialog.open && dialog.querySelectorAll('button')[1].disabled, '开发目录不应允许点击更新');
        } finally { document.querySelector('#stcr_update_demo')?.close(); }
        assert(hostSnapshot() === before, '宿主聊天或选择被改变');
    });
    window.stcrUpdateReport = { version, state: 'dev', message: '开发目录，不可更新', requests, hostUnchanged: before === hostSnapshot(), passed: true };
    return results;
}
