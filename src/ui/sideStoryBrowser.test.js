// ST Reader — AGPL-3.0
// T105 / D48 浏览器回归（只在开发实例跑；stcrSelfTest() 全量里带，单跑 stcrSelfTest({core:false,sideStory:true})）：
// 用 T103 的雾岚样本（STCR-97-番外-48楼）和 astra 给的测试规则（标签正则 + 关键词 + 隐藏楼，识别出整楼 11、混合 3）：
// 三段切换与 V 键、正文视图的折叠小条与"— 番外 · N 楼 —"、番外视图的楼号标签与跳回、三个视图下楼内文字一个字不少、
// 阅读位置各视图各记、导出"只正文 / 只番外"的数量、"不分番外"开关、设置窗。跑完恢复偏好与规则。不读写任何聊天。

import { makeChatKey } from '../core/chatSource.js';
import { initFormatter } from '../core/formatter.js';
import { isDevInstance } from '../core/readonlyGuard.js';
import { store } from '../core/store.js';
import { closeReader, isReaderOpen, openReader } from './reader.js';
import { SIDE_CHAT_KEY, SIDE_RULES_KEY } from './sideStory.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const MIST = makeChatKey({ avatarUrl: 'STCR_T11_Mist.png', fileName: 'STCR-97-番外-48楼' });
const PLAIN = makeChatKey({ avatarUrl: 'STCR_T11_Paper.png', fileName: 'STCR-02-代码与长文' });
const RULES = { tag: { on: true, mode: 'regex', pattern: '<小剧场>.*?</小剧场>|<details>.*?</details>', scanRendered: false }, keyword: { on: true }, hidden: { on: true } };

export async function testSideStoryBrowser({ force = false } = {}) {
    if (!isDevInstance(location) && !force) throw new Error('只在开发实例运行');
    if (isReaderOpen()) closeReader();
    await initFormatter();
    const results = [];
    const check = (name, passed, detail = '') => results.push({ name: `T105 ${name}`, passed: !!passed, detail: String(detail).slice(0, 300) });
    const until = async (test, ms = 8000) => { const end = Date.now() + ms; while (!test() && Date.now() < end) await wait(25); return test(); };
    const snapshot = () => { const c = SillyTavern.getContext(); return JSON.stringify({ chat: c.chat, metadata: c.chatMetadata, id: c.getCurrentChatId() }); };
    await wait(1500); // 刚载入页面时酒馆自己还在打开聊天，先等它稳定
    const chatBefore = snapshot();
    const keepRules = await store.settings.get(SIDE_RULES_KEY, null), keepChat = await store.settings.get(SIDE_CHAT_KEY, null);
    const root = () => document.querySelector('#stcr_root');
    const view = () => ['main', 'side', 'all'].find(name => root().classList.contains(`stcr-view-${name}`));
    const pickView = async name => { root().querySelector(`.stcr-side-switch [data-view="${name}"]`).click(); await wait(900); };
    const visible = () => [...root().querySelectorAll('#stcr_chat .mes[mesid]:not(.stcr-mes--gone)')].filter(el => el.offsetParent !== null);
    const textOf = el => { const copy = el.cloneNode(true); copy.querySelectorAll('.stcr-side-bar').forEach(node => node.remove()); return copy.textContent.replace(/\s+/g, ''); };
    try {
        await store.settings.set(SIDE_RULES_KEY, RULES);
        await store.settings.set(SIDE_CHAT_KEY, {});
        await openReader({ chatKey: MIST });
        await until(() => root()?.querySelector('#stcr_chat .mes'));
        [...root().querySelectorAll('.stcr-doc button')].find(button => /知道了/.test(button.textContent))?.click();
        const sw = root().querySelector('.stcr-side-switch');
        await until(() => sw && !sw.hidden);

        // ① 三段切换：有番外才显示，默认正文
        check('有番外的聊天顶栏出现"正文 / 番外 / 全部"，默认在正文', !sw.hidden && view() === 'main' && [...sw.querySelectorAll('button')].map(b => b.textContent).join('/') === '正文/番外/全部', view());
        check('提示写清识别结果（整楼 11、片段 3）', /整楼 11 楼/.test(sw.title) && /片段 3 楼/.test(sw.title), sw.title);

        // ② 正文视图：折叠小条与整楼折叠条，番外片段看不见
        const bars = [...root().querySelectorAll('.stcr-side-bar')];
        check('正文视图：每处片段一条"番外 · 约 N 字 · 去番外看"，片段本身看不见', bars.length === 3 && bars.every(bar => /^番外 · (约 \d+ 字|不足 10 字) · 去番外看$/.test(bar.textContent) && bar.offsetParent !== null) && [...root().querySelectorAll('.stcr-side-part')].every(part => part.offsetParent === null), bars.map(b => b.textContent).join(' | '));
        check('正文视图：整楼番外折成"— 番外 · N 楼 —"', [...root().querySelectorAll('.stcr-fold')].some(fold => /^— 番外 · \d+ 楼 —$/.test(fold.textContent.trim())), [...root().querySelectorAll('.stcr-fold')].map(f => f.textContent.trim()).join(' | '));
        const mixed = root().querySelector('#stcr_chat .mes[data-side="mixed"]');
        const mixedIndex = mixed ? Number(mixed.getAttribute('mesid')) : -1;
        const mainText = mixed ? textOf(mixed.querySelector('.mes_text')) : '';

        // ③ 番外视图：只有番外（整楼 + 混合楼的片段），每楼带"第 N 楼"标签，混合楼里的正文看不见
        await pickView('side');
        const shown = visible();
        const tags = shown.map(el => el.querySelector('.stcr-side-tag')?.textContent ?? '');
        check('番外视图：只剩番外楼，每楼都有"第 N 楼"标签', view() === 'side' && shown.length > 0 && shown.length < 30 && tags.every(text => /^第 \d+ 楼/.test(text)), `${shown.length} 楼 ${tags.slice(0, 3).join(',')}`);
        const sideMixed = root().querySelector(`#stcr_chat .mes[mesid="${mixedIndex}"]`);
        check('番外视图：混合楼只剩番外片段（正文那几句看不见）', !!sideMixed && sideMixed.querySelector('.mes_text').innerText.includes('幕外') && !sideMixed.querySelector('.mes_text').innerText.includes('潮汐初涨'), sideMixed?.querySelector('.mes_text').innerText.slice(0, 40));
        check('番外视图：多候选的楼标签带"候选 k/n"', tags.some(text => /候选 \d+\/\d+/.test(text)), tags.join(','));
        const allText = (await pickView('all'), root().querySelector(`#stcr_chat .mes[mesid="${mixedIndex}"]`));
        check('三个视图里楼内文字一个字不少（只换显示，不删节点；锚点不变）', textOf(allText.querySelector('.mes_text')) === mainText && !!mainText, '');
        check('"全部"视图：没有折叠小条、没有楼号标签，和原来一样', !visible().some(el => el.querySelector('.stcr-side-tag')?.offsetParent) && ![...root().querySelectorAll('.stcr-side-bar')].some(bar => bar.offsetParent), '');

        // ④ 键盘与跳转
        await pickView('main');
        const scroller = root().querySelector('#stcr_chat');
        scroller.focus?.();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
        await wait(900);
        check('V 键轮换视图（正文→番外）', view() === 'side', view());
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'V', bubbles: true }));
        await wait(900);
        check('V 键再按一次（番外→全部）', view() === 'all', view());
        await pickView('side');
        const tag = root().querySelector('#stcr_chat .mes:not(.stcr-mes--gone) .stcr-side-tag');
        const tagIndex = Number(tag.closest('.mes').getAttribute('mesid'));
        tag.click();
        await wait(1200);
        const back = root().querySelector(`#stcr_chat .mes[mesid="${tagIndex}"]`);
        check('点楼号标签跳回正文视图的同一楼', view() === 'main' && !!back && back.offsetParent !== null, `${view()} #${tagIndex}`);
        const goBar = root().querySelector('.stcr-side-bar');
        goBar.click();
        await wait(1200);
        check('点折叠小条"去番外看"进番外视图', view() === 'side', view());

        // ⑤ 阅读位置各视图各记：番外里往下翻再回正文，正文回到原处；再进番外回到翻到的那楼
        await pickView('main');
        const keyOf = () => visible()[0]?.getAttribute('mesid');
        const mainBefore = keyOf();
        await pickView('side');
        const sideEls = visible();
        sideEls[Math.min(sideEls.length - 1, 4)].scrollIntoView();
        await wait(600);
        await pickView('main');
        check('阅读位置：番外里翻过之后回到正文，仍在原来读到的地方附近', Math.abs(Number(keyOf()) - Number(mainBefore)) <= 3, `${mainBefore} → ${keyOf()}`);

        // ⑥ 导出：范围里有"只正文 / 只番外"，数量实时变
        root().querySelector('[data-act="top-more"]').click();
        await wait(200);
        root().querySelector('[data-act="doc-export"]').click();
        await until(() => document.querySelector('.stcr-doc-view, .stcr-doc [data-view]') || [...document.querySelectorAll('.stcr-doc button')].some(b => b.textContent === '只正文'));
        const dialog = [...document.querySelectorAll('.stcr-doc')].pop();
        const viewBtn = text => [...dialog.querySelectorAll('button')].find(button => button.textContent === text);
        const statusText = () => dialog.querySelector('.stcr-dx-status')?.textContent ?? '';
        viewBtn('只正文')?.click(); await wait(200);
        const mainCount = statusText();
        viewBtn('只番外')?.click(); await wait(200);
        const sideCount = statusText();
        check('导出：选"只正文"数出 36 楼，"只番外"数出 14 楼', /36 楼/.test(mainCount) && /14 楼/.test(sideCount), `${mainCount} | ${sideCount}`);
        [...dialog.querySelectorAll('button')].find(button => button.textContent === '取消')?.click();
        await wait(300);

        // ⑦ 设置窗与"不分番外"
        root().querySelector('.stcr-fab')?.click();
        await wait(300);
        const sideSettingsBtn = [...document.querySelectorAll('#stcr_root button')].find(button => /番外设置/.test(button.textContent));
        check('Aa 设置里有"番外设置…"', !!sideSettingsBtn, '');
        sideSettingsBtn?.click();
        await wait(400);
        const settings = document.querySelector('.stcr-side-settings');
        check('番外设置窗：三条规则、五个关键词候选、隐藏楼、"不分番外"开关', !!settings && settings.querySelectorAll('.stcr-dx-chip').length === 5 && /不分番外/.test(settings.textContent) && /标签|正则/.test(settings.textContent), settings?.querySelectorAll('.stcr-dx-chip').length);
        const off = [...(settings?.querySelectorAll('input[type="checkbox"]') ?? [])].find(box => /不分番外/.test(box.closest('label')?.textContent ?? ''));
        if (off) { off.checked = true; off.dispatchEvent(new Event('change', { bubbles: true })); }
        await wait(1500);
        check('勾上"不分番外"：这个聊天没有切换、没有折叠，和原来一样', root().querySelector('.stcr-side-switch').hidden && !root().querySelector('.stcr-side-bar') && ![...root().querySelectorAll('.stcr-side-part')].length, '');
        closeReader();

        // ⑧ 没有番外的聊天：不出现切换
        await store.settings.set(SIDE_CHAT_KEY, {});
        await store.settings.set(SIDE_RULES_KEY, { tag: { on: true, mode: 'regex', pattern: '<小剧场>.*?</小剧场>', scanRendered: false }, keyword: { on: false }, hidden: { on: false } });
        await openReader({ chatKey: PLAIN });
        await until(() => root()?.querySelector('#stcr_chat .mes'));
        await wait(600);
        check('规则没命中任何楼的聊天：顶栏不出现切换，V 键不抢', root().querySelector('.stcr-side-switch').hidden && !root().querySelector('.stcr-side-bar'), `${root().querySelector('.stcr-side-switch').hidden} ${root().querySelector('.stcr-side-switch').title}`);
        closeReader();
    } catch (error) {
        check('测试流程没有出错', false, error?.stack || error);
    } finally {
        if (isReaderOpen()) closeReader();
        await store.settings.set(SIDE_RULES_KEY, keepRules ?? {});
        await store.settings.set(SIDE_CHAT_KEY, keepChat ?? {});
    }
    const chatAfter = snapshot();
    check('没有碰宿主聊天（chat / 元数据 / 当前聊天都没变）', chatBefore === chatAfter, chatBefore.length + ' vs ' + chatAfter.length);
    return results;
}
