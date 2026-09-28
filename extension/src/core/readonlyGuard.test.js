import {
    FORBIDDEN_CHAT_PATHS, getForbiddenChatPath, installReadonlyGuard,
    isDevInstance, isReadonlyGuardInstalled,
} from './readonlyGuard.js';

/**
 * Node 与浏览器共用的自测；全部请求只交给内存替身，不访问服务器。
 * @returns {Promise<Array<{name: string, passed: boolean}>>}
 */
export async function testReadonlyGuard() {
    const results = [];
    function assert(condition, message) {
        if (!condition) throw new Error(message);
    }
    async function test(name, run) {
        await run();
        results.push({ name, passed: true });
    }

    const calls = [];
    const errors = [];
    const response = Promise.resolve({ ok: true });
    const target = {
        location: new URL('http://localhost:8100/'),
        console: { error: message => errors.push(message) },
        fetch: function (...args) { calls.push({ receiver: this, args }); return response; },
    };
    installReadonlyGuard(target);

    for (const path of FORBIDDEN_CHAT_PATHS) {
        await test(`禁用路径：${path}`, () => {
            const inputs = [
                path, `${path}/?audit=1`, path.toUpperCase(),
                new URL(path, target.location),
                new Request(new URL(path, target.location), { method: 'POST', body: '{}' }),
                path.replace('/chats/', '/chats//'),
                path.replace('/chats/', '/ch%61ts/'),
                `http://127.0.0.1:8100${path}`,
            ];
            for (const input of inputs) {
                const before = errors.length;
                let caught;
                try { target.fetch(input, { method: 'POST' }); } catch (error) { caught = error; }
                assert(caught?.name === 'StcrReadonlyError', '禁用请求没有同步抛错');
                assert(errors.length === before + 1, '禁用请求没有记录 console.error');
                assert(calls.length === 0, '禁用请求到达了原 fetch');
            }
        });
    }

    await test('任何 HTTP 方法均拦截；日志不含请求体', () => {
        for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
            try { target.fetch(FORBIDDEN_CHAT_PATHS[0], { method, body: '私密测试文本' }); } catch { /* 预期拦截 */ }
        }
        assert(calls.length === 0, '有请求穿透拦截');
        assert(errors.every(message => !message.includes('私密测试文本')), '日志泄露请求体');
    });

    await test('只读 POST 原样转发并保留 Promise、参数与接收者', async () => {
        for (const path of ['/api/chats/get', '/api/chats/group/get', '/api/chats/recent', '/api/chats/search', '/api/characters/chats']) {
            const init = { method: 'POST', headers: { 'x-test': 'ok' }, body: '{}' };
            assert(target.fetch(path, init) === response, 'fetch 的返回对象被改写');
            const call = calls.at(-1);
            assert(call.receiver === target && call.args[0] === path && call.args[1] === init, '请求参数被改写');
        }
        assert((await response).ok, '响应无法正常读取');
    });

    await test('允许的 Request 不读取或消耗 body', () => {
        const request = new Request('http://localhost:8100/api/chats/get', { method: 'POST', body: '{}' });
        target.fetch(request);
        assert(calls.at(-1).args[0] === request && !request.bodyUsed, 'Request 被复制或消耗');
    });

    await test('重复安装幂等', () => {
        const first = target.fetch;
        assert(installReadonlyGuard(target) === first && isReadonlyGuardInstalled(target), '重复叠加包装');
    });

    await test('识别回环地址 8100；其他端口默认关闭', () => {
        for (const host of ['localhost', '127.0.0.1', '[::1]']) {
            assert(isDevInstance(new URL(`http://${host}:8100/`)), '未识别开发实例');
        }
        for (const address of ['http://localhost:8000/', 'http://example.test:8100/', 'https://localhost:8100/']) {
            assert(!isDevInstance(new URL(address)), '误识别正式实例');
        }
    });

    await test('相对路径、点段、查询串与近似路径', () => {
        const path = FORBIDDEN_CHAT_PATHS[0];
        assert(getForbiddenChatPath(`.${path}`, target.location.href) === path, '相对路径漏拦');
        assert(getForbiddenChatPath(`/ignored/..${path}`, target.location.href) === path, '点段漏拦');
        assert(getForbiddenChatPath(`/api/chats/get?next=${path}`, target.location.href) === null, '误拦查询参数');
        assert(getForbiddenChatPath(`${path}-preview`, target.location.href) === null, '误拦近似路径');
    });
    return results;
}
