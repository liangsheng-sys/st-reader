// ST Reader — AGPL-3.0
// 只在开发实例加载；以真实同源请求计时；首屏绘制与 D28 后台校验分开记录。
import { createChatSource, makeChatKey, clearChatCache, getChatCacheStats } from './chatSource.js';

const assert = (value, message) => { if (!value) throw new Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const paint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
const snapshot = () => {
    const c = SillyTavern.getContext();
    return JSON.stringify({ chat: c.chat, metadata: c.chatMetadata, character: c.characterId, group: c.groupId, id: c.getCurrentChatId() });
};
const round = value => Math.round(value * 10) / 10;

export async function testChatCacheBrowser({ performanceCheck = false } = {}) {
    const before = snapshot(), results = [], requests = [], coreMs = [], readerMs = [], uiRequests = [], validations = [];
    const check = (name, passed) => { results.push({ name: `T53 ${name}`, passed }); };
    const key = makeChatKey({ avatarUrl: 'STCR_T11_Mist.png', fileName: performanceCheck ? 'STCR-90-大文件-1600楼' : 'STCR-03-普通阅读' });
    const ctx = () => SillyTavern.getContext();
    let changeSummary = false, clockOffset = 0;
    const read = async (url, body, { signal } = {}) => {
        const started = performance.now();
        const response = await fetch(url, { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify(body), signal });
        const data = await response.json();
        requests.push({ path: url, ms: round(performance.now() - started) });
        assert(response.ok, `只读请求失败：${url} (${response.status})`);
        // 仅改这次测试的响应副本来模拟变更，不改合成聊天文件或宿主。
        if (changeSummary && url === '/api/chats/search') return data.map(item => ({ ...item, file_size: String(item.file_size) + '-模拟变化' }));
        return data;
    };
    const source = createChatSource({ read, getContext: ctx, prefetchOnList: false, now: () => Date.now() + clockOffset });
    let handle, firstPage;
    try {
        for (let i = 0; i < (performanceCheck ? 4 : 2); i++) {
            const started = performance.now(); handle = await source.openChat(key);
            const page = handle.page(0); coreMs.push(round(performance.now() - started));
            if (!i) firstPage = page; else assert(page === firstPage, '真实请求命中后没有复用第一页');
            if (performanceCheck) assert(handle.total === 1600, '未找到 21 MB / 1600 楼合成样本，请先生成 T11 样本');
            validations.push(await handle.validation);
            handle.close(); handle = null;
        }
        check('真实 API 命中复用冻结页，正文只下载一次', requests.filter(x => x.path === '/api/chats/get').length === 1 && Object.isFrozen(firstPage));
        check('首次命中后台校验一次，60 秒内再次打开复用结果', requests.filter(x => x.path === '/api/chats/search').length === 2 && validations.slice(1).every(item => item.state === 'fresh'));
        const backgroundValidationMs = validations.slice(1, 2).map(item => round(item.durationMs));
        check('缓存条数与估算字节均不超限', source.getChatCacheStats().entries === 1 && source.getChatCacheStats().bytes <= 150_000_000);
        clockOffset += 60_000; changeSummary = true;
        handle = await source.openChat(key); let notifications = 0;
        handle.onStale(event => { if (event.chatKey === key && event.reason === 'changed') notifications++; });
        const changed = await handle.validation;
        check('摘要响应副本模拟变化，只通知一次且正文与页保持不变', changed.state === 'stale' && notifications === 1 && handle.page(0) === firstPage && requests.filter(x => x.path === '/api/chats/get').length === 1);
        let late = 0, closed = 0; handle.onStale(() => late++); await paint();
        handle.onStale(() => closed++); handle.close(); handle = null; await paint();
        check('浏览器晚订阅补发，关闭句柄取消尚未发出的通知', late === 1 && closed === 0);
        source.clearChatCache();
        check('主动清空与新实例均为空（真实刷新另由开发脚本验证）', source.getChatCacheStats().entries === 0 && createChatSource().getChatCacheStats().entries === 0);

        if (performanceCheck) {
            const { openReader, closeReader, isReaderOpen } = await import('../ui/reader.js');
            const { getPrefs, setPrefs, loadPrefs } = await import('../ui/prefs.js');
            assert(!isReaderOpen(), '请先关闭阅读器再计时'); await loadPrefs();
            const prefs = { ...getPrefs() }, originalFetch = window.fetch, validationWork = [];
            let iteration = 0;
            // 保留只读保护的底层 fetch；记录完整阅读器路径中的真实正文/摘要请求。
            window.fetch = async (...args) => {
                const path = new URL(args[0] instanceof Request ? args[0].url : String(args[0]), location.href).pathname;
                const started = performance.now(), opening = iteration, response = await originalFetch(...args);
                if (path === '/api/chats/search') {
                    const work = response.clone().json().then(() => uiRequests.push({ path, ms: round(performance.now() - started), opening }));
                    validationWork.push(work);
                } else if (path.startsWith('/api/')) uiRequests.push({ path, ms: round(performance.now() - started), opening });
                return response;
            };
            try {
                clearChatCache();
                setPrefs({ mode: 'scroll', direction: 'b', drawerPinned: false, panelPinned: false, hideUser: false });
                for (let i = 0; i < 4; i++) {
                    iteration = i;
                    const started = performance.now(); await openReader({ chatKey: key });
                    while (!document.querySelector('#stcr_chat > .mes[mesid]') || document.querySelector('#stcr_root.stcr-has-state')) {
                        assert(performance.now() - started < 30000, '阅读器加载超时'); await delay(10);
                    }
                    await paint(); readerMs.push(round(performance.now() - started));
                    // 计时已结束。后台响应另记，下一轮前等完以核对 60 秒结果复用。
                    while (uiRequests.filter(x => x.path === '/api/chats/search').length < (i ? 2 : 1)) {
                        assert(performance.now() - started < 30000, '后台摘要校验超时'); await delay(10);
                    }
                    await Promise.all(validationWork); closeReader(); await paint();
                }
                check('正式阅读器四次打开也只下载一次正文', uiRequests.filter(x => x.path === '/api/chats/get').length === 1 && getChatCacheStats().hits >= 3);
                check('21 MB 缓存命中时首屏渲染完成 < 300 ms（后台校验单独记录）', readerMs.slice(1).every(ms => ms < 300));
                check('正式阅读器后台只校验一次，结果在 60 秒内复用', uiRequests.filter(x => x.path === '/api/chats/search').length === 2);
            } finally { closeReader(); setPrefs(prefs); window.fetch = originalFetch; clearChatCache(); }
        }
        check('宿主聊天、候选、选择与元信息未改变', before === snapshot());
        const report = { browser: navigator.userAgent, fixture: decodeURIComponent(key.split('/')[1]), coreMs, readerMs, backgroundValidationMs, uiBackgroundValidationMs: uiRequests.filter(x => x.path === '/api/chats/search' && x.opening > 0).map(x => x.ms), requests, uiRequests, results, hostUnchanged: before === snapshot() };
        window.stcrChatCacheReport = report;
        console.log('[st-reader] T53 缓存与首帧实测', JSON.stringify(report)); console.table(results);
        assert(results.every(x => x.passed), 'T53 未全部达标，详见 window.stcrChatCacheReport；不要把缓存命中视为 300 ms 已通过');
        return results;
    } finally { handle?.close(); source.clearChatCache(); }
}
