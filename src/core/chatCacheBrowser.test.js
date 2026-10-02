// ST Reader — AGPL-3.0
// 只在开发实例加载；以真实同源请求与阅读器首帧计时，不绕过摘要校验。
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
    const before = snapshot(), results = [], requests = [], coreMs = [], readerMs = [], uiRequests = [];
    const check = (name, passed) => { results.push({ name: `T53 ${name}`, passed }); };
    const key = makeChatKey({ avatarUrl: 'STCR_T11_Mist.png', fileName: performanceCheck ? 'STCR-90-大文件-1600楼' : 'STCR-03-普通阅读' });
    const ctx = () => SillyTavern.getContext();
    const read = async (url, body, { signal } = {}) => {
        const started = performance.now();
        const response = await fetch(url, { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify(body), signal });
        const data = await response.json();
        requests.push({ path: url, ms: round(performance.now() - started) });
        assert(response.ok, `只读请求失败：${url} (${response.status})`); return data;
    };
    const source = createChatSource({ read, getContext: ctx, prefetchOnList: false });
    let handle, firstPage;
    try {
        for (let i = 0; i < (performanceCheck ? 4 : 2); i++) {
            const started = performance.now(); handle = await source.openChat(key);
            const page = handle.page(0); coreMs.push(round(performance.now() - started));
            if (!i) firstPage = page; else assert(page === firstPage, '真实请求命中后没有复用第一页');
            if (performanceCheck) assert(handle.total === 1600, '未找到 21 MB / 1600 楼合成样本，请先生成 T11 样本');
            handle.close(); handle = null;
        }
        check('真实 API 命中复用冻结页，正文只下载一次', requests.filter(x => x.path === '/api/chats/get').length === 1 && Object.isFrozen(firstPage));
        check('每次重开均查询摘要，没有省略校验', requests.filter(x => x.path === '/api/chats/search').length === coreMs.length);
        check('缓存条数与估算字节均不超限', source.getChatCacheStats().entries === 1 && source.getChatCacheStats().bytes <= 150_000_000);
        source.clearChatCache();
        check('主动清空与新实例均为空（真实刷新另由开发脚本验证）', source.getChatCacheStats().entries === 0 && createChatSource().getChatCacheStats().entries === 0);

        if (performanceCheck) {
            const { openReader, closeReader, isReaderOpen } = await import('../ui/reader.js');
            const { getPrefs, setPrefs, loadPrefs } = await import('../ui/prefs.js');
            assert(!isReaderOpen(), '请先关闭阅读器再计时'); await loadPrefs();
            const prefs = { ...getPrefs() }, originalFetch = window.fetch;
            // 保留只读保护的底层 fetch；记录完整阅读器路径中的真实正文/摘要请求。
            window.fetch = async (...args) => {
                const path = new URL(args[0] instanceof Request ? args[0].url : String(args[0]), location.href).pathname;
                const started = performance.now(), response = await originalFetch(...args);
                if (path.startsWith('/api/')) uiRequests.push({ path, ms: round(performance.now() - started) });
                return response;
            };
            try {
                clearChatCache();
                setPrefs({ mode: 'scroll', direction: 'b', drawerPinned: false, panelPinned: false, hideUser: false });
                for (let i = 0; i < 4; i++) {
                    const started = performance.now(); await openReader({ chatKey: key });
                    while (!document.querySelector('#stcr_chat > .mes[mesid]') || document.querySelector('#stcr_root.stcr-has-state')) {
                        assert(performance.now() - started < 30000, '阅读器加载超时'); await delay(10);
                    }
                    await paint(); readerMs.push(round(performance.now() - started)); closeReader(); await paint();
                }
                check('正式阅读器四次打开也只下载一次正文', uiRequests.filter(x => x.path === '/api/chats/get').length === 1 && getChatCacheStats().hits >= 3);
                check('21 MB 第二次及随后两次首帧均小于 300 ms（含摘要校验）', readerMs.slice(1).every(ms => ms < 300));
            } finally { closeReader(); setPrefs(prefs); window.fetch = originalFetch; clearChatCache(); }
        }
        check('宿主聊天、候选、选择与元信息未改变', before === snapshot());
        const report = { browser: navigator.userAgent, fixture: decodeURIComponent(key.split('/')[1]), coreMs, readerMs, requests, uiRequests, results, hostUnchanged: before === snapshot() };
        window.stcrChatCacheReport = report;
        console.log('[st-reader] T53 缓存与首帧实测', JSON.stringify(report)); console.table(results);
        assert(results.every(x => x.passed), 'T53 未全部达标，详见 window.stcrChatCacheReport；不要把缓存命中视为 300 ms 已通过');
        return results;
    } finally { handle?.close(); source.clearChatCache(); }
}
