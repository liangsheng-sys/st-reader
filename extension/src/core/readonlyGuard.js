// D02 的拦截名单；这些地址只用于比对，绝不向它们发送请求。
export const FORBIDDEN_CHAT_PATHS = Object.freeze([
    '/api/chats/save',
    '/api/chats/rename',
    '/api/chats/delete',
    '/api/chats/import',
    '/api/chats/group/save',
    '/api/chats/group/delete',
    '/api/chats/group/import',
]);

const forbiddenPaths = new Set(FORBIDDEN_CHAT_PATHS);
const installedGuards = new WeakMap();

/**
 * 判断当前地址是否为约定的本机开发实例；正式实例不自动安装全局拦截。
 * @param {{protocol: string, hostname: string, port: string}} location
 * @returns {boolean}
 */
export function isDevInstance(location) {
    return location?.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
        && location.port === '8100';
}

/**
 * 支持 fetch 的字符串、URL、Request 入参；查询串不影响判定。
 * @param {RequestInfo | URL} input
 * @param {string} baseUrl
 * @returns {string | null} 命中的禁用路径，否则为 null。
 */
export function getForbiddenChatPath(input, baseUrl) {
    const address = typeof input === 'string' || input instanceof URL ? input : input.url;
    const url = new URL(address, baseUrl);
    let pathname = url.pathname;
    try {
        pathname = decodeURIComponent(pathname);
    } catch {
        // 无效转义仍交由原 fetch 处理；不读取请求体。
    }
    pathname = pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '').toLowerCase();
    return forbiddenPaths.has(pathname) ? pathname : null;
}

/**
 * 包装目标窗口的 fetch。命中 D02 时同步抛错、记录错误，原 fetch 不会被调用。
 * 开发实例的全部调用方（包括宿主）都会受此保护，因此不能在其中编辑聊天。
 * 这只是开发期断言，不能替代代码审计，也不拦截 XHR 或直接函数调用。
 * @param {Window | typeof globalThis} [target=globalThis]
 * @returns {Function} 已安装的包装函数；重复安装不叠加包装。
 */
export function installReadonlyGuard(target = globalThis) {
    if (isReadonlyGuardInstalled(target)) return target.fetch;
    if (typeof target.fetch !== 'function') throw new TypeError('只读保护需要 fetch。');

    const originalFetch = target.fetch;
    function guardedFetch(input, init) {
        const blockedPath = getForbiddenChatPath(input, target.location.href);
        if (blockedPath) {
            const error = new Error(`[st-reader] 只读保护已拦截聊天写入：${blockedPath}`);
            error.name = 'StcrReadonlyError';
            // 仅记录路径，不记录请求体、聊天内容或查询参数。
            target.console.error(error.message);
            throw error;
        }
        return Reflect.apply(originalFetch, target, [input, init]);
    }

    installedGuards.set(target, guardedFetch);
    target.fetch = guardedFetch;
    return guardedFetch;
}

/** @param {Window | typeof globalThis} [target=globalThis] @returns {boolean} */
export function isReadonlyGuardInstalled(target = globalThis) {
    return installedGuards.has(target) && installedGuards.get(target) === target.fetch;
}
