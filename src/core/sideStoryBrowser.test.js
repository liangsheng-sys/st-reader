// ST Reader — AGPL-3.0
import { openChat, makeChatKey } from './chatSource.js';
import { initFormatter, renderMessage } from './formatter.js';
import { classifySideStory, locateSegments } from './sideStory.js';
import { exportDocument } from './documentExport.js';

export async function testSideStoryBrowser({ samples = false } = {}) {
    const results = [];
    const check = (ok, name) => { if (!ok) throw Error(name); results.push({ name, passed: true }); };
    await initFormatter();
    const h = await openChat(makeChatKey({ avatarUrl: 'STCR_T11_Mist.png', fileName: 'STCR-97-番外-48楼' }));
    try {
        const rules = { tag: { on: true, mode: 'regex', pattern: '<小剧场>.*?</小剧场>|<details>.*?</details>' }, keyword: { on: true }, hidden: { on: true } };
        const raw = classifySideStory(h, rules);
        check(h.total === 48 && raw.floors.size === 11 && raw.segments.size === 3, '三法合并：11 整楼、3 混合楼');
        const shown = await classifySideStory(h, { tag: { ...rules.tag, scanRendered: true } });
        check(shown.segments.has(3) && shown.segments.get(3)[0].source === 'rendered', '显示正则后识别');
        const r = renderMessage(h, 3), box = document.createElement('div');
        box.innerHTML = r.html;
        const [range] = locateSegments(box, r.displayText, raw.segments.get(3));
        check(range?.toString().includes('纸鸟') && range.toString().includes('云上再会') && !range.toString().includes('正文'), 'Markdown 加粗与跨段软换行定位');
        const mist = await openChat(makeChatKey({ avatarUrl:'STCR_T11_Mist.png', fileName:'STCR-03-普通阅读' }));
        try {
            const tag = { on:true, start:'【一次】✓', end:'【一次】✓' };
            check(!classifySideStory(mist, {tag}).segments.has(1) &&
                (await classifySideStory(mist, {tag:{...tag, scanRendered:true}})).segments.has(1), '命中只能由宿主显示正则产生的标记');
        } finally { mist.close(); }
        const anchor = '首部'.repeat(10), tail = '尾部'.repeat(10), body = anchor + '文字' + tail;
        const rawText = '前' + body, display = '长前言' + anchor + '改写后的文字' + tail;
        box.textContent = display;
        const info = { source:'raw', rawText, start:1, end:rawText.length };
        check(locateSegments(box, display, [info])[0]?.toString() === display.slice(3)
            && locateSegments(box, '两端都消失', [info]).missed === 1, '原文首尾重定位、不能定位时计数');
        const files = {};
        for (const format of ['txt','html']) for (const view of ['side','main']) {
            const { blob, stats } = await exportDocument(h, { format, view, sideStory: rules, include: { details: true } });
            const text = await blob.text();
            check(stats.fallbacks === 0 && stats.floors === (view === 'side' ? 14 : 36)
                && (view === 'side' ? !text.includes('正文：') && text.includes('第 4 楼 · 候选 1') && text.includes('海写回信') && text.includes('月下灯会')
                    : !/幕外：|请暂停正文|小剧场|月下灯会/.test(text) && text.includes('船已靠岸')), format + ' ' + view + ' 实际导出（' + stats.floors + ' 楼，回退 ' + stats.fallbacks + '，残留 ' + (view === 'main' ? text.match(/.{0,12}(幕外：|请暂停正文|小剧场|月下灯会).{0,18}/)?.[0] : text.match(/正文：.{0,15}/)?.[0]) + '）');
            if (format === 'txt') files[view] = text;
        }
        console.log('番外引擎 ' + results.length + '/' + results.length + ' 通过');
        return samples ? files : results;
    } finally { h.close(); }
}
