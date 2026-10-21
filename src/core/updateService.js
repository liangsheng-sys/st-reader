// ST Reader — AGPL-3.0
import { store } from './store.js';
import { hostBackedSettings } from './hostSettings.js';

const EXTENSION_NAME = 'st-reader';
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const DEFAULT_ROOT = new URL('../../', import.meta.url);

export class StcrUpdateError extends Error {
    constructor(code, message, status = null) {
        super(message); this.name = 'StcrUpdateError'; this.code = code; this.status = status;
    }
}

/** 只解析二级版本标题；保留 Markdown 正文，不把围栏内的示例当成新版本。 */
export function parseChangelog(text) {
    if (typeof text !== 'string') throw new StcrUpdateError('INVALID_CHANGELOG', '更新日志必须是文本');
    const sections = [];
    let current = null, fence = null;
    const flush = () => { if (current) sections.push({ version: current.version, markdown: current.lines.join('\n').trim() }); };
    for (const line of text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')) {
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (fence) {
            if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
        } else if (marker) {
            fence = { char: marker[1][0], length: marker[1].length };
        } else {
            const heading = line.match(/^ {0,3}##[ \t]+([^\s]+)(?:[ \t]+.*)?$/);
            if (heading && VERSION.test(heading[1])) { flush(); current = { version: heading[1], lines: [] }; continue; }
        }
        if (current) current.lines.push(line);
    }
    flush();
    return sections;
}

function devResult(version, global, reason) {
    return { state: 'dev', message: '开发目录，不可更新', version, global, reason };
}
function errorResult(error, version) {
    return { state: 'error', version, code: error instanceof StcrUpdateError ? error.code : 'NETWORK', httpStatus: error instanceof StcrUpdateError ? error.status : null,
        message: error instanceof StcrUpdateError ? error.message : '连接 ST 失败或请求超时，请稍后重试' };
}
function httpError(status, updating) {
    if (status === 403) return new StcrUpdateError('FORBIDDEN', '没有更新权限或会话已失效，请检查 ST 登录与管理员权限', status);
    if (status === 404) return new StcrUpdateError('NOT_FOUND', 'ST 中未找到阅读器扩展目录', status);
    return new StcrUpdateError('HTTP', updating ? '更新未确认完成，请刷新页面并重新检查版本' : 'ST 检查更新失败，请查看 ST 控制台后重试', status);
}

/** 工厂仅用于隔离测试；正式 UI 使用下方单例导出。目录名与 API 均不可由调用者指定。 */
export function createUpdateService({ fetchImpl = (...args) => globalThis.fetch(...args),
    getContext = () => globalThis.SillyTavern?.getContext(), settings = hostBackedSettings(store.settings),
    rootUrl = DEFAULT_ROOT, origin = globalThis.location?.origin } = {}) {
    let checking = null, updating = null;
    function resource(name) {
        const root = new URL(rootUrl);
        if (!/^https?:$/.test(root.protocol) || root.origin !== origin
            || root.pathname !== `/scripts/extensions/third-party/${EXTENSION_NAME}/` || root.search || root.hash || root.username || root.password) {
            throw new StcrUpdateError('UNSAFE_ROOT', '扩展资源必须来自当前 ST 的阅读器目录');
        }
        return new URL(name, root).href;
    }
    async function readFile(name) {
        const response = await fetchImpl(resource(name), { method: 'GET', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new StcrUpdateError('RESOURCE', `无法读取阅读器的 ${name}`, response.status);
        return response;
    }
    async function manifest() {
        const response = await readFile('manifest.json');
        let data;
        try { data = await response.json(); } catch { throw new StcrUpdateError('INVALID_MANIFEST', '阅读器版本文件格式不正确'); }
        if (typeof data?.version !== 'string' || !VERSION.test(data.version)) throw new StcrUpdateError('INVALID_MANIFEST', '阅读器版本号格式不正确');
        // 开发预载模块仅在固定 .dev 进程给联接资源加标记，避免对工作分支做 Git 操作。
        return { version: data.version, dev: response.headers.get('X-STCR-Dev-Directory') === '1' };
    }
    async function post(action, global) {
        resource('manifest.json');
        const headers = getContext()?.getRequestHeaders?.();
        if (!headers) throw new StcrUpdateError('HOST_NOT_READY', 'ST 尚未准备好，请稍后重试');
        return fetchImpl(`/api/extensions/${action}`, { method: 'POST', credentials: 'same-origin', redirect: 'error',
            headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ extensionName: EXTENSION_NAME, global }),
            signal: AbortSignal.timeout(action === 'update' ? 120000 : 60000) });
    }
    async function check() {
        let version = null;
        try {
            const installed = await manifest(); version = installed.version;
            if (installed.dev) return devResult(version, null, 'development-instance');
            // ST 的 discover / 扩展资源路由优先用户安装；只有不存在时才探测全局。
            for (const global of [false, true]) {
                const response = await post('version', global);
                if (response.status === 404) continue;
                if (!response.ok) {
                    const detail = await response.text();
                    // 不能用笼统的 “Could not read from remote repository” 判断无远端：权限/断网也会如此。
                    if (response.status === 500 && /not a git repository|['"]origin['"] does not appear to be a git repository|no such remote:?\s*['"]?origin|no remote repository specified/i.test(detail)) {
                        return devResult(version, global, 'no-git-remote');
                    }
                    throw httpError(response.status, false);
                }
                let data;
                try { data = await response.json(); } catch { throw new StcrUpdateError('INVALID_RESPONSE', 'ST 返回的版本信息格式不正确'); }
                if (typeof data?.remoteUrl !== 'string' || typeof data.currentBranchName !== 'string'
                    || typeof data.currentCommitHash !== 'string' || typeof data.isUpToDate !== 'boolean') {
                    throw new StcrUpdateError('INVALID_RESPONSE', 'ST 返回的版本信息不完整');
                }
                if (!data.remoteUrl.trim() || !data.currentCommitHash.trim()) return devResult(version, global, 'no-git-remote');
                return { state: data.isUpToDate ? 'latest' : 'available', message: data.isUpToDate ? '已是最新版本' : '发现更新，可立即更新',
                    version, global, currentBranchName: data.currentBranchName, currentCommitHash: data.currentCommitHash, remoteUrl: data.remoteUrl };
            }
            throw httpError(404, false);
        } catch (error) { return errorResult(error, version); }
    }
    function checkUpdate() {
        checking ??= check().finally(() => { checking = null; });
        return checking;
    }
    async function update() {
        const before = await checkUpdate();
        if (before.state !== 'available') return before;
        try {
            // 再检查后只更新已确认的位置；失败绝不改到另一份安装重试。
            const response = await post('update', before.global);
            if (!response.ok) throw httpError(response.status, true);
            let data;
            try { data = await response.json(); } catch { throw new StcrUpdateError('INVALID_RESPONSE', '更新结果无法读取，请刷新页面并重新检查版本'); }
            if (typeof data?.isUpToDate !== 'boolean' || typeof data.shortCommitHash !== 'string' || !data.shortCommitHash) {
                throw new StcrUpdateError('INVALID_RESPONSE', '更新结果不完整，请刷新页面并重新检查版本');
            }
            // 即使刚被另一窗口更新，本页仍可能运行旧脚本；确认更新响应后都要求刷新。
            return { ...before, state: 'updated', message: '更新完成，请刷新页面', shortCommitHash: data.shortCommitHash,
                alreadyUpToDate: data.isUpToDate, requiresReload: true };
        } catch (error) {
            const result = errorResult(error, before.version);
            if (result.code === 'NETWORK') result.message = '更新连接中断或超时，操作可能已生效，请刷新页面并重新检查版本';
            return result;
        }
    }
    function runUpdate() {
        updating ??= update().finally(() => { updating = null; });
        return updating;
    }
    return {
        async getVersion() { return (await manifest()).version; }, checkUpdate, runUpdate,
        async getChangelog() { return parseChangelog(await (await readFile('CHANGELOG.md')).text()); },
        async getLastSeenVersion() { const value = await settings.get('lastSeenVersion', null); return typeof value === 'string' && VERSION.test(value) ? value : null; },
        async markVersionSeen(version) {
            if (typeof version !== 'string' || !VERSION.test(version)) throw new StcrUpdateError('INVALID_VERSION', '已读版本号格式不正确');
            await settings.set('lastSeenVersion', version);
        },
    };
}

export const updateService = createUpdateService();
export const { getVersion, checkUpdate, runUpdate, getChangelog, getLastSeenVersion, markVersionSeen } = updateService;
