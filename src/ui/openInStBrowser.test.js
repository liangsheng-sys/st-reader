// ST Reader — AGPL-3.0
// T95 / D40 浏览器回归（只在开发实例跑；会让 ST 真的切换聊天，所以**不在** stcrSelfTest() 全量里，
// 单跑 stcrSelfTest({core:false, openInSt:true})）。ST 切换时会按它自己的逻辑改写样本角色卡里的"当前聊天"指针，
// 跑之前把 .dev/data/default-user/characters/ 复制一份，跑完还原（或重跑 dev/generate-fixtures.cmd），fixture 哈希自测才能过。
// 8100 的只读保护会拦 ST 给空聊天补存的请求，所以只用有内容的样本。

import { isDevInstance } from '../core/readonlyGuard.js';
import { makeChatKey } from '../core/chatSource.js';
import { closeReader, isReaderOpen, openReader } from './reader.js';
import { getPrefs, rememberSwipe, setPrefs, setReadPosition } from './prefs.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const MIST = 'STCR_T11_Mist.png', ASTER = 'STCR_T11_Aster.png';
const HEAVY = makeChatKey({ avatarUrl: MIST, fileName: 'STCR-96-重楼-240楼' }); // 240 楼，ST 只渲染最后 100 楼（第 141–240 楼）
const LARGE = makeChatKey({ avatarUrl: MIST, fileName: 'STCR-90-大文件-1600楼' });
const SWIPES = makeChatKey({ avatarUrl: ASTER, fileName: 'STCR-01-正则与多候选' }); // 第 2 楼有多个候选，ST 当前是第 1 个
const ctx = () => SillyTavern.getContext();
const press = key => document.querySelector('#stcr_root .stcr-scroll')?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const swipeIds = () => ctx().chat.map(message => (Number.isInteger(message.swipe_id) ? message.swipe_id : null));
const toasts = () => [...document.querySelectorAll('#toast-container .toast-message')].map(el => el.textContent).join(' / ');
const offsetInHost = index => {
    const mes = document.querySelector(`#chat .mes[mesid="${index}"]`), host = document.getElementById('chat');
    return mes && host ? Math.round(mes.getBoundingClientRect().top - host.getBoundingClientRect().top) : null;
};

export async function testOpenInStBrowser({ force = false } = {}) {
    if (!isDevInstance(location) && !force) throw new Error('只在开发实例运行');
    if (isReaderOpen()) closeReader();
    const results = [];
    const check = (name, passed, detail = '') => results.push({ name: `T95 ${name}`, passed: !!passed, detail: String(detail) });
    const until = async (test, ms = 8000) => { const end = Date.now() + ms; while (!test() && Date.now() < end) await wait(50); return test(); };
    const confirmBefore = getPrefs().openInStConfirm;
    const openAt = async (chatKey, index) => {
        setReadPosition(chatKey, index);
        await openReader({ chatKey });
        await until(() => document.querySelector(`#stcr_root #stcr_chat > .mes[mesid="${index}"]`), 30000);
        if (await until(() => document.querySelector('#stcr_root .stcr-doc'), 800)) document.querySelector('#stcr_root .stcr-doc-close')?.click();
        await wait(600);
    };
    const popup = () => document.querySelector('dialog.popup[open]');
    try {
        // ① ST 正在生成：只提示，阅读器不关、ST 不动
        await openAt(HEAVY, 180);
        const idBefore = ctx().getCurrentChatId?.() ?? null;
        document.body.dataset.generating = 'true';
        press('o');
        await wait(400);
        const toastText = document.querySelector('#stcr_root .stcr-toast')?.textContent ?? '';
        delete document.body.dataset.generating;
        check('ST 正在生成时按 O：阅读器不关、只提示', isReaderOpen() && /酒馆正忙/.test(toastText) && !popup() && (ctx().getCurrentChatId?.() ?? null) === idBefore, `提示"${toastText}"`);

        // ② 首次确认：取消 = 什么都不做
        setPrefs({ openInStConfirm: true });
        press('o');
        check('首次按 O 弹确认框（带"不再提示"）', await until(() => popup()?.querySelector('.stcr-confirm-check input'), 3000));
        popup()?.querySelector('.popup-button-cancel')?.click();
        await until(() => !popup(), 3000);
        check('确认框点取消：阅读器还开着、ST 没切', isReaderOpen() && (ctx().getCurrentChatId?.() ?? null) === idBefore);

        // ③ 确认 + 不再提示：ST 先选雾岚（会先读它当前那个聊天）再开目标聊天，落点要撑过 ST 自己的两次滚到底
        press('O');
        await until(() => popup(), 3000);
        popup().querySelector('.stcr-confirm-check input').checked = true;
        popup().querySelector('.popup-button-ok').click();
        const t0 = performance.now();
        const switched = await until(() => !isReaderOpen() && ctx().getCurrentChatId?.() === 'STCR-96-重楼-240楼' && ctx().chat.length === 240, 60000);
        await wait(1600); // ST 打开后自己滚到底两次，落点要撑过去
        check('确认后：阅读器关了，ST 切到这个聊天、楼数对', switched, `用时 ${Math.round(performance.now() - t0)} ms，当前 ${ctx().getCurrentChatId?.()}，${ctx().chat.length} 楼`);
        check('勾了"不再提示"就记住', getPrefs().openInStConfirm === false);
        check('ST 停在第 181 楼（没被 ST 自己滚到底冲掉）', Math.abs(offsetInHost(180) ?? 9999) <= 4, `第 181 楼离聊天区顶 ${offsetInHost(180)}px`);
        results.push({ name: 'T95 资料：重楼切过去后 ST 的 swipe_id', passed: true, detail: JSON.stringify(swipeIds().slice(0, 5)), swipeIds: swipeIds() });

        // ④ 同一个角色的另一个聊天，正在读的第 21 楼 ST 没渲染（只渲染最后 100 楼）：直接开、提示
        await openAt(LARGE, 20);
        document.querySelectorAll('#toast-container .toast').forEach(el => el.remove());
        press('o');
        const heavy = await until(() => !isReaderOpen() && ctx().getCurrentChatId?.() === 'STCR-90-大文件-1600楼' && ctx().chat.length === 1600, 30000);
        await until(() => /最后一部分/.test(toasts()), 3000);
        check('不再弹确认，直接切到 1600 楼的聊天', heavy && !popup(), `${ctx().getCurrentChatId?.()} ${ctx().chat.length} 楼`);
        check('第 21 楼 ST 没渲染：提示"只加载了最后一部分楼层"', /最后一部分/.test(toasts()), toasts());

        // ⑤ 就是 ST 当前聊天：只关阅读器、滚到那一楼
        await openAt(LARGE, 1550);
        const idHeavy = ctx().getCurrentChatId?.();
        press('o');
        await until(() => !isReaderOpen(), 3000);
        await wait(300);
        check('就是 ST 当前聊天：只关阅读器，ST 停在第 1551 楼', !isReaderOpen() && ctx().getCurrentChatId?.() === idHeavy && Math.abs(offsetInHost(1550) ?? 9999) <= 4, `离顶 ${offsetInHost(1550)}px`);

        // ⑥ 换角色（星灯当前聊天就是目标）+ 阅读器里换过候选：ST 不改 swipe_id、提示候选不同
        rememberSwipe(SWIPES, 1, 1, false);
        await openAt(SWIPES, 1);
        document.querySelectorAll('#toast-container .toast').forEach(el => el.remove());
        press('o');
        const aster = await until(() => !isReaderOpen() && ctx().characters[ctx().characterId]?.avatar === ASTER && ctx().getCurrentChatId?.() === 'STCR-01-正则与多候选', 30000);
        await until(() => /它自己当前的候选/.test(toasts()), 3000);
        check('换角色：ST 选了星灯、开着这个聊天', aster, `${ctx().characters[ctx().characterId]?.avatar} ${ctx().getCurrentChatId?.()}`);
        check('阅读器里选了第 2 个候选，ST 仍是第 1 个，并提示', ctx().chat[1]?.swipe_id === 0 && /它自己当前的候选/.test(toasts()), `ST 第 2 楼候选序号 ${ctx().chat[1]?.swipe_id}；${toasts()}`);
        results.push({ name: 'T95 资料：星灯切过去后 ST 的 swipe_id', passed: true, detail: JSON.stringify(swipeIds()), swipeIds: swipeIds() });
    } catch (error) {
        check('流程没有抛错', false, error?.stack ?? error);
    } finally {
        delete document.body.dataset.generating;
        popup()?.querySelector('.popup-button-cancel')?.click();
        if (isReaderOpen()) closeReader();
        rememberSwipe(SWIPES, 1, 0, true);
        setPrefs({ openInStConfirm: confirmBefore });
    }
    return results;
}
