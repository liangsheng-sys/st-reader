// ST Reader — AGPL-3.0
// 仅由 localhost:8100 的 stcrSelfTest({performance:true}) 动态加载。
import { openReader, closeReader, isReaderOpen } from '../ui/reader.js';
import { getPrefs, setPrefs, loadPrefs, setReadPosition } from '../ui/prefs.js';
import { makeChatKey, clearChatCache } from './chatSource.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
// rAF 后的任务排在本帧绘制之后；双 rAF 会额外计入一个无关刷新周期。
const paint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pageErrors = [];
async function until(predicate, label, timeout = 15000) {
    const end = performance.now() + timeout;
    while (!predicate()) {
        if (performance.now() > end) {
            const ids = floors().map(node => Number(node.getAttribute('mesid'))), scroller = document.querySelector('.stcr-scroll');
            const where = scroller ? `第 ${ids[0]}–${ids.at(-1)} 楼共 ${ids.length} 楼，scrollTop ${Math.round(scroller.scrollTop)} / ${scroller.scrollHeight - scroller.clientHeight}` : '阅读器未打开';
            throw new Error(`${label}超时，请先生成 T30 大文件（${where}${pageErrors.length ? `；页面错误：${pageErrors.slice(0, 3).join(' | ')}` : ''}）`);
        }
        await delay(10);
    }
    await paint();
}
function hostSnapshot() {
    const c = SillyTavern.getContext();
    return JSON.stringify({ chat: c.chat, metadata: c.chatMetadata, character: c.characterId, group: c.groupId, id: c.getCurrentChatId() });
}
const floors = () => [...document.querySelectorAll('#stcr_chat > .mes[mesid]')];

/**
 * T82（I020）：连续滚动 seconds 秒（按时间推进，掉帧也走够路程），数超过 50ms 的长帧。
 * 从离窗口底部 2.5 屏处开始（接批线是 1.5 屏），保证途中至少接上一批；先等 1 秒让浏览器空闲（阅读器会在空闲时预建下一批）。
 * 长帧优先用 long-animation-frame（含脚本、样式、排版、绘制）；不支持时退回相邻两帧的间隔。
 */
async function continuousScroll(scroller, { seconds = 10, speed = 4000 } = {}) {
    scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight * 3.5);
    await delay(1000); await paint();
    const lastBefore = Math.max(...floors().map(node => Number(node.getAttribute('mesid'))));
    const frames = [], longFrames = [], sources = [];
    const loaf = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame');
    const observer = loaf ? new PerformanceObserver(list => { for (const entry of list.getEntries()) if (entry.duration > 50) { longFrames.push(Math.round(entry.duration)); sources.push(`${Math.round(entry.duration)}ms（样式排版 ${Math.round(entry.renderStart && entry.styleAndLayoutStart ? entry.startTime + entry.duration - entry.styleAndLayoutStart : 0)}ms）：${entry.scripts.map(script => `${script.invoker || script.invokerType} ${(script.sourceURL || '').split('/').pop()} ${Math.round(script.duration)}ms`).join('；') || '无脚本（样式 / 排版 / 绘制 / GC）'}`); } }) : null;
    observer?.observe({ type: 'long-animation-frame' });
    const start = performance.now();
    let previous = start, position = scroller.scrollTop;
    await new Promise(resolve => {
        const step = now => {
            frames.push(now - previous);
            position += speed * (now - previous) / 1000; previous = now;
            scroller.scrollTop = position;
            if (now - start < seconds * 1000) requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
    });
    await delay(200); observer?.disconnect();
    const gaps = frames.slice(1).filter(ms => ms > 50).map(Math.round);
    return { method: loaf ? 'long-animation-frame' : 'rAF 间隔', speed, frames: frames.length, longFrames: loaf ? longFrames : gaps, longFrameSources: sources,
        maxFrameGap: Math.round(Math.max(...frames.slice(1))), batchesAdded: Math.max(...floors().map(node => Number(node.getAttribute('mesid')))) > lastBefore };
}

/** 在真正阅读器中测首次可见正文、滚动窗口/翻屏与释放，不用 core 加载耗时冒充 UI 耗时。 */
export async function testPerformanceBrowser() {
    assert(!isReaderOpen(), '请先关闭阅读器');
    const onError = event => pageErrors.push(String(event.error?.stack ?? event.message ?? event.reason).slice(0, 300));
    addEventListener('error', onError); addEventListener('unhandledrejection', onError);
    await loadPrefs();
    const prefs = { ...getPrefs() }, before = hostSnapshot(), results = [], loads = [], turns = [], batches = [], memory = [];
    let scroll = null;
    const large = makeChatKey({ avatarUrl: 'STCR_T11_Mist.png', fileName: 'STCR-95-T30-50MiB-4000楼' });
    const small = makeChatKey({ avatarUrl: 'STCR_T11_Mist.png', fileName: 'STCR-03-普通阅读' });
    const open = async key => {
        // 阅读器会回到上次读到的楼；大样本从第 1 楼开始，后面才有批可接（上次停在末尾时曾误报"加载下一批超时"）
        if (key === large) setReadPosition(large, 0);
        await openReader({ chatKey: key });
        await until(() => document.querySelector('.stcr-title-file')?.textContent === decodeURIComponent(key.split('/')[1]) && floors().length > 0 && !document.querySelector('#stcr_root.stcr-has-state'), '加载');
    };
    const heap = async () => {
        // 自动报告用带 --expose-gc / --enable-precise-memory-info 的独立测试浏览器。
        await delay(100); globalThis.gc?.(); await paint(); globalThis.gc?.();
        return performance.memory?.usedJSHeapSize ?? null;
    };
    let maxFloors = 0;
    try {
        setPrefs({ mode: 'scroll', direction: 'b', drawerPinned: false, panelPinned: false, hideUser: false });
        await open(small); memory.push({ phase: '小聊天基线', bytes: await heap() }); closeReader();
        for (let round = 0; round < 3; round++) {
            const start = performance.now(); await open(large); loads.push(Math.round(performance.now() - start));
            if (round === 0) {
                memory.push({ phase: '大聊天已打开', bytes: await heap() });
                const scroller = document.querySelector('.stcr-scroll');
                scroll = await continuousScroll(scroller);
                for (let page = 0; page < 8; page++) {
                    const prior = Math.max(...floors().map(node => Number(node.getAttribute('mesid'))));
                    const started = performance.now(); scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
                    await until(() => Math.max(...floors().map(node => Number(node.getAttribute('mesid')))) > prior, '加载下一批');
                    batches.push(Math.round(performance.now() - started)); maxFloors = Math.max(maxFloors, floors().length);
                }
                setPrefs({ mode: 'paged' }); await paint();
                for (let page = 0; page < 20; page++) {
                    const top = scroller.scrollTop, started = performance.now();
                    scroller.dispatchEvent(new KeyboardEvent('keydown', { key: page < 10 ? 'PageDown' : 'PageUp', bubbles: true }));
                    await paint(); turns.push(Math.round(performance.now() - started));
                    assert(scroller.scrollTop !== top, '分页按键没有移动正文');
                }
                memory.push({ phase: '翻页后', bytes: await heap() });
            }
            await open(small);
            // D24 主动保留最近聊天；释放测试必须显式清空 LRU，不能把正常缓存误报为泄漏。
            clearChatCache(); memory.push({ phase: `第${round + 1}次切回小聊天并清空缓存`, bytes: await heap() }); closeReader();
        }
        memory.push({ phase: '关闭阅读器', bytes: await heap() });
        const p95 = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
        const report = { browser: navigator.userAgent, loadsMs: loads, batchMs: batches, pageMs: turns, pageP95: p95(turns), batchP95: p95(batches), maxFloors, memory, scroll,
            forcedGc: typeof globalThis.gc === 'function', hostUnchanged: before === hostSnapshot() };
        window.stcrPerformanceReport = report;
        console.log('[st-reader] T30 性能实测', JSON.stringify(report));
        const check = (name, condition) => { results.push({ name: `T30 ${name}`, passed: condition }); };
        check('53.39 MiB 阅读器打开三次均小于 3 秒', loads.every(ms => ms < 3000));
        // 翻屏是可见交互，按 P95 100ms / 最慢 150ms；批次为提前 1.5 屏的预取，单独报告。
        check('翻屏 P95 小于 100ms、最慢小于 150ms；预取一批小于 300ms', p95(turns) < 100 && Math.max(...turns) < 150 && Math.max(...batches) < 300);
        check('滚动只保留至多 120 楼，旧批次已释放', maxFloors <= 120 && maxFloors >= 90);
        // T82：滚轮阅读要顺（I020、反馈 1）
        check('连续滚动 10 秒（途中接上新的一批）长帧（>50ms）不超过 2 个', !!scroll && scroll.batchesAdded && scroll.longFrames.length <= 2);
        check('翻屏 P95 小于 60ms', p95(turns) < 60);
        const peak = Math.max(...memory.filter(item => ['大聊天已打开', '翻页后'].includes(item.phase)).map(item => item.bytes ?? 0));
        if (report.forcedGc && memory.every(item => item.bytes !== null)) check('切小聊天并清空缓存后回收至少 70% 增量，三轮没有持续增长',
            memory.filter(item => item.phase.includes('切回')).every(item => item.bytes - memory[0].bytes < (peak - memory[0].bytes) * .3));
        else console.warn('[st-reader] 本浏览器不能主动 GC；内存结论请双击 dev/test-performance.cmd 获取，不能把此项视为通过。');
        check('宿主聊天/候选/选择/元信息不变', report.hostUnchanged);
        console.table(results);
        assert(results.every(item => item.passed), 'T30 性能未达标，见 stcrPerformanceReport');
        return results;
    } finally { closeReader(); setPrefs(prefs); clearChatCache(); removeEventListener('error', onError); removeEventListener('unhandledrejection', onError); }
}
