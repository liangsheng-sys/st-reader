// ST Reader — AGPL-3.0
// T70 浏览器回归（只在 8100 开发实例）：真写 .dev 的 user/files/，清 IndexedDB 后刷新自动恢复。
// 由 dev/test-performance.mjs --backup 分两段调用：write（刷新前）→ 清站点数据并刷新 → restored（刷新后）。
import { isDevInstance } from './readonlyGuard.js';
import { store } from './store.js';
import { createTextAnchor } from './anchor.js';
import { flushMirror, getMirrorStatus, MAIN_FILE, whenStarted } from './backupService.js';

const assert = (value, message) => { if (!value) throw new Error(message); };
const MARK = 'T70 自动备份回归（虚构，测完即删）';
const CONTEXT = { chatKey: 'STCR_T11_Mist.png/STCR-03-普通阅读', mesIndex: 0, swipeIndex: 0, part: 'body', rawText: '虚构回归文本' };
const readServer = async () => JSON.parse(await (await fetch(`/user/files/${MAIN_FILE}`, { cache: 'no-store', credentials: 'same-origin' })).text());
const settle = async () => { for (let i = 0; i < 40 && getMirrorStatus().state === 'pending'; i++) await new Promise(r => setTimeout(r, 100)); return flushMirror(); };

/** 刷新前：写一条标记批注，3 秒防抖后服务器文件 = exportAll 的数据。返回标记 id。 */
export async function testBackupBrowserWrite() {
    assert(isDevInstance(location), '备份回归只允许 8100 开发实例');
    await whenStarted();
    const anchor = await createTextAnchor(CONTEXT.rawText, 0, 2, CONTEXT);
    const record = await store.annotations.put({ anchor, title: '雾岚（虚构）', preview: '虚构', note: `${MARK} ${new Date().toISOString()}` });
    assert(getMirrorStatus().state === 'pending', '改动后没有排队备份');
    const started = performance.now();
    while (getMirrorStatus().state !== 'ok' && performance.now() - started < 8000) await new Promise(r => setTimeout(r, 100));
    const waited = Math.round(performance.now() - started);
    assert(getMirrorStatus().state === 'ok', `8 秒内没备份成功：${getMirrorStatus().message}`);
    const file = await readServer(), exported = JSON.parse(await store.exportAll());
    assert(JSON.stringify(file.data) === JSON.stringify(exported.data), '服务器文件与 exportAll() 数据不一致');
    assert(file.data.annotations[record.id]?.note === record.note, '服务器文件里没有刚写的批注');
    const pointer = SillyTavern.getContext().extensionSettings['st-reader'];
    assert(pointer?.rev === file.rev && pointer.mirrorId && pointer.bytes > 0, 'extension_settings 指针不对');
    return { id: record.id, note: record.note, waitedMs: waited, bytes: pointer.bytes, rev: file.rev };
}

/** 刷新后（IndexedDB 已清）：启动合并应把标记批注恢复回来；然后删掉它并备份一次收尾。 */
export async function testBackupBrowserRestored(id) {
    assert(isDevInstance(location), '备份回归只允许 8100 开发实例');
    const started = await whenStarted();
    assert(started?.restored?.annotations?.added >= 1, `刷新后没有自动恢复：${JSON.stringify(started)}`);
    const record = await store.annotations.get(id);
    assert(record?.note?.startsWith(MARK), '恢复后找不到标记批注');
    await store.annotations.remove(id);
    await settle();
    const file = await readServer();
    assert(!file.data.annotations[id], '收尾删除后服务器文件仍有标记批注');
    return { restored: started.restored.annotations.added, cleaned: true };
}
