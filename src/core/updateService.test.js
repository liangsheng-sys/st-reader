// ST Reader — AGPL-3.0
import { createUpdateService, parseChangelog } from './updateService.js';
import { createStore } from './store.js';

const assert = (value, message = 'T54a 断言失败') => { if (!value) throw new Error(message); };
const equal = (a, b) => assert(JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const json = (value, headers) => new Response(JSON.stringify(value), { headers });
const info = (isUpToDate = false) => ({ currentBranchName: 'main', currentCommitHash: 'abc1234', isUpToDate, remoteUrl: 'https://github.com/liangsheng-sys/st-reader.git' });
async function rejects(run, code) { let caught; try { await run(); } catch (error) { caught = error; } equal(caught?.code, code); }
function harness({ handler, manifest = () => json({ version: '0.1.0' }), ...options } = {}) {
    const calls = [];
    const service = createUpdateService({ rootUrl: 'http://localhost:8100/scripts/extensions/third-party/st-reader/', origin: 'http://localhost:8100',
        getContext: () => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': 'synthetic-token' }) }),
        fetchImpl: async (url, init) => {
            calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
            if (url.endsWith('/manifest.json')) return manifest();
            if (handler) return handler(url, init);
            throw new Error('测试未声明此请求');
        }, ...options });
    return { service, calls, posts: () => calls.filter(call => call.method === 'POST') };
}

/** 全部网络为响应替身；不会对任何目录执行真实 Git 操作。 */
export async function testUpdateServiceLogic() {
    const results = [], test = async (name, run) => { await run(); results.push({ name: `更新：${name}`, passed: true }); };
    await test('CHANGELOG 按版本切段，保留三级标题、中文与文件顺序', () => {
        equal(parseChangelog('\uFEFF# 日志\r\n说明\r\n## 0.2.0\r\n新内容\r\n### 修复\r\n- 一\r\n## 0.1.0\r\n旧内容'), [
            { version: '0.2.0', markdown: '新内容\n### 修复\n- 一' }, { version: '0.1.0', markdown: '旧内容' },
        ]);
    });
    await test('日志忽略代码围栏里的假标题，支持预发布与日期后缀', () => {
        const source = '```md\n## 9.9.9\n```\n## 1.2.3-beta.1+build (2026-10-02)\n~~~md\n## 8.8.8\n~~~\n````md\n```\n## 7.7.7\n````\n## 1.2.2\n结束';
        const sections = parseChangelog(source);
        equal(sections.map(item => item.version), ['1.2.3-beta.1+build', '1.2.2']); assert(sections[0].markdown.includes('## 7.7.7'));
        equal(parseChangelog('没有版本\n## v1.2.3\n## 1.2'), []);
        equal(parseChangelog('## 1.0.0\n## 0.9.0'), [{ version: '1.0.0', markdown: '' }, { version: '0.9.0', markdown: '' }]);
    });
    await test('版本与日志仅 GET 自身同源文件，禁重定向、禁缓存', async () => {
        const h = harness({ handler: () => new Response('## 0.1.0\n虚构记录') });
        equal(await h.service.getVersion(), '0.1.0'); equal(await h.service.getChangelog(), [{ version: '0.1.0', markdown: '虚构记录' }]);
        equal(h.calls.map(call => new URL(call.url).pathname.split('/').pop()), ['manifest.json', 'CHANGELOG.md']);
        assert(h.calls.every(call => call.method === 'GET' && call.credentials === 'same-origin' && call.redirect === 'error' && call.cache === 'no-store'));
    });
    await test('跨站、其他扩展与路径混淆在发请求前拒绝', async () => {
        for (const rootUrl of ['https://example.invalid/scripts/extensions/third-party/st-reader/', 'http://localhost:8100/scripts/extensions/third-party/other/', 'http://localhost:8100/scripts/extensions/third-party/st-reader/?x=1']) {
            const h = harness({ rootUrl }); await rejects(() => h.service.getVersion(), 'UNSAFE_ROOT'); equal(h.calls.length, 0);
        }
    });
    await test('坏 manifest 不触发 Git 接口；资源 404 与解析失败有明确信息', async () => {
        for (const manifest of [() => json({ version: '<script>' }), () => new Response('{')]) {
            const h = harness({ manifest }); equal((await h.service.checkUpdate()).code, 'INVALID_MANIFEST'); equal(h.posts().length, 0);
        }
        await rejects(() => harness({ manifest: () => new Response('', { status: 404 }) }).service.getVersion(), 'RESOURCE');
    });
    await test('开发联接标记正常返回 dev，检查和立即更新均不发 Git 请求', async () => {
        const h = harness({ manifest: () => json({ version: '0.1.0' }, { 'X-STCR-Dev-Directory': '1' }) });
        for (const result of [await h.service.checkUpdate(), await h.service.runUpdate()]) {
            equal(result.state, 'dev'); equal(result.message, '开发目录，不可更新'); equal(result.reason, 'development-instance');
        }
        equal(h.posts().length, 0);
    });
    await test('用户安装优先，POST 名称固定并携带 CSRF 与布尔 global', async () => {
        const h = harness({ handler: () => json(info(true)) });
        const result = await h.service.checkUpdate(); equal(result.state, 'latest'); equal(result.global, false);
        equal(h.posts().length, 1); const request = h.posts()[0];
        equal(request.url, '/api/extensions/version'); equal(request.body, { extensionName: 'st-reader', global: false });
        equal(request.headers['X-CSRF-Token'], 'synthetic-token'); equal(request.credentials, 'same-origin'); equal(request.redirect, 'error');
    });
    await test('用户目录不存在时查全局，并只更新全局自身目录', async () => {
        const h = harness({ handler: (url, init) => {
            const { global } = JSON.parse(init.body);
            if (!global) return new Response('', { status: 404 });
            return json(url.endsWith('/version') ? info() : { isUpToDate: false, shortCommitHash: 'def5678' });
        } });
        const result = await h.service.runUpdate(); equal(result.state, 'updated'); equal(result.global, true); assert(result.requiresReload);
        equal(result.version, '0.1.0');
        equal(h.posts().map(call => [call.url, call.body]), [
            ['/api/extensions/version', { extensionName: 'st-reader', global: false }],
            ['/api/extensions/version', { extensionName: 'st-reader', global: true }],
            ['/api/extensions/update', { extensionName: 'st-reader', global: true }],
        ]);
    });
    await test('两个位置均不存在返回错误，不误报开发目录', async () => {
        const h = harness({ handler: () => new Response('', { status: 404 }) });
        equal((await h.service.checkUpdate()).code, 'NOT_FOUND'); equal(h.posts().map(call => call.body.global), [false, true]);
    });
    await test('ST 非 Git 空响应与无远端响应均为 dev，不误选另一份安装', async () => {
        for (const data of [{ ...info(true), currentBranchName: '', currentCommitHash: '', remoteUrl: '' }, { ...info(), remoteUrl: '' }]) {
            const h = harness({ handler: () => json(data) }); equal((await h.service.runUpdate()).state, 'dev'); equal(h.posts().length, 1);
        }
    });
    await test('缺少 origin 的 500 识别为 dev', async () => {
        for (const detail of ["fatal: 'origin' does not appear to be a git repository", 'fatal: not a git repository', "No such remote: 'origin'"]) {
            const h = harness({ handler: () => new Response(detail, { status: 500 }) });
            equal((await h.service.runUpdate()).state, 'dev'); equal(h.posts().length, 1);
        }
    });
    await test('权限、网络与一般服务器故障不冒充 dev，也不切到其他安装', async () => {
        for (const [status, detail] of [[403, 'Forbidden'], [500, 'Could not resolve host: github.com'], [500, 'Permission denied. Could not read from remote repository.']]) {
            const h = harness({ handler: () => new Response(detail, { status }) });
            const result = await h.service.runUpdate(); equal(result.state, 'error'); equal(result.httpStatus, status); equal(h.posts().length, 1);
        }
    });
    await test('不完整、非 JSON 的版本响应不误报已最新', async () => {
        for (const handler of [() => json({}), () => new Response('<html>登录</html>')]) {
            const h = harness({ handler }); equal((await h.service.checkUpdate()).code, 'INVALID_RESPONSE');
        }
    });
    await test('宿主尚未就绪时返回错误且无 POST', async () => {
        const h = harness({ getContext: () => null }); equal((await h.service.runUpdate()).code, 'HOST_NOT_READY'); equal(h.posts().length, 0);
    });
    await test('网络失败后可再次检查，失败状态不会永久缓存', async () => {
        let first = true;
        const h = harness({ handler: () => { if (first) { first = false; throw new Error('虚构断网'); } return json(info(true)); } });
        equal((await h.service.checkUpdate()).state, 'error'); equal((await h.service.checkUpdate()).state, 'latest');
    });
    await test('连续点击检查合并同一请求，连续点击更新只执行一次', async () => {
        const h = harness({ handler: url => json(url.endsWith('/version') ? info() : { isUpToDate: false, shortCommitHash: 'def5678' }) });
        const checked = await Promise.all([h.service.checkUpdate(), h.service.checkUpdate()]); equal(checked[0].state, 'available'); equal(h.posts().length, 1);
        const updated = await Promise.all([h.service.runUpdate(), h.service.runUpdate()]); equal(updated[0].state, 'updated'); equal(updated[1], updated[0]);
        equal(h.posts().filter(call => call.url.endsWith('/update')).length, 1);
    });
    await test('立即更新重新检查；已最新或检查后被其他窗口更新均正确返回', async () => {
        const latest = harness({ handler: () => json(info(true)) }); equal((await latest.service.runUpdate()).state, 'latest'); equal(latest.posts().length, 1);
        const race = harness({ handler: url => json(url.endsWith('/version') ? info() : { isUpToDate: true, shortCommitHash: 'def5678' }) });
        const result = await race.service.runUpdate(); equal(result.state, 'updated'); equal(result.requiresReload, true); equal(result.alreadyUpToDate, true);
    });
    await test('更新失败或结果损坏不跨目录重试，连接中断提示重新核验', async () => {
        for (const fail of [() => new Response('', { status: 403 }), () => new Response('', { status: 500 }), () => json({}), () => { throw new Error('虚构断网'); }, () => { throw new DOMException('虚构超时', 'TimeoutError'); }]) {
            const h = harness({ handler: url => url.endsWith('/version') ? json(info()) : fail() });
            const result = await h.service.runUpdate(); equal(result.state, 'error'); equal(h.posts().length, 2);
            assert(h.posts().every(call => call.body.global === false));
            if (result.code === 'NETWORK') assert(result.message.includes('可能已生效'));
        }
    });
    await test('lastSeenVersion 只在明确标记时存入自身 settings，重建 store 后保留', async () => {
        let state = null, writes = 0;
        const storage = { async getItem() { return structuredClone(state); }, async setItem(_key, value) { state = structuredClone(value); writes++; } };
        const local = createStore({ storage, lock: false }); await local.settings.set('reader', { fontSize: 18 });
        const h = harness({ settings: local.settings, handler: () => json(info(true)) });
        equal(await h.service.getLastSeenVersion(), null); await h.service.getVersion(); await h.service.checkUpdate(); equal(writes, 1);
        await h.service.markVersionSeen('0.1.0'); equal(await h.service.getLastSeenVersion(), '0.1.0');
        equal(await createStore({ storage, lock: false }).settings.get('lastSeenVersion'), '0.1.0');
        equal(await local.settings.get('reader'), { fontSize: 18 }); equal(Object.keys(state.data.annotations).length, 0);
        await rejects(() => h.service.markVersionSeen('<bad>'), 'INVALID_VERSION'); equal(writes, 2);
    });
    return results;
}
