// ST Reader — AGPL-3.0
// T95 / D40："在酒馆里打开"。NF5 的显式例外：只在用户点按钮或按 O 时，调用 ST 自己公开在 getContext() 上的导航函数，
// 效果与用户在 ST 聊天列表里点开那个聊天相同（ST 按它自己的逻辑清屏、记"当前聊天"、存角色卡 / 群组的指针）。
// 本模块自己不写任何聊天、角色、群组数据，不改 swipe_id；滚动只读 ST 的 DOM。
import { makeChatKey, parseChatKey, StcrDataError } from './chatSource.js';

const context = () => globalThis.SillyTavern.getContext();

/** ST 聊天列表点开时传的文件名不带 .jsonl（bookmarks.js 的 select_chat_block 处理）。 */
export function hostFileName(fileName) {
    return String(fileName ?? '').replace(/\.jsonl$/i, '');
}

/** 按头像文件名在 ST 角色表里找下标（selectCharacterById 要的就是这个下标）；找不到 -1。 */
export function findCharacterIndex(characters, avatarUrl) {
    if (!Array.isArray(characters) || !avatarUrl) return -1;
    return characters.findIndex(card => card?.avatar === avatarUrl);
}

/**
 * ST 是否正在生成：ST 生成时给 body 打 data-generating="true"（deactivateSendButtons），并显示停止按钮 #mes_stop。
 * 存盘中（isChatSaving）ST 没有公开字段；ST 的切换函数自己会拒绝或等待，openInHost 事后核对是否真切过去了。
 */
export function hostBusy(doc = globalThis.document) {
    if (!doc?.body) return false;
    if (doc.body.dataset?.generating === 'true') return true;
    const stop = doc.getElementById?.('mes_stop');
    if (!stop) return false;
    const view = doc.defaultView;
    const style = view?.getComputedStyle ? view.getComputedStyle(stop) : null;
    return Boolean(style && style.display !== 'none' && style.visibility !== 'hidden');
}

/** 宿主此刻的聊天键（与 chatSource.getCurrentChatKey 同一算法，但吃传进来的 context 快照，便于测试）。 */
function currentKey(ctx) {
    const fileName = ctx.getCurrentChatId?.();
    if (!fileName) return null;
    if (ctx.groupId !== null && ctx.groupId !== undefined && String(ctx.groupId) !== '') return makeChatKey({ groupId: String(ctx.groupId), fileName });
    const avatarUrl = ctx.characters?.[ctx.characterId]?.avatar;
    return avatarUrl ? makeChatKey({ avatarUrl, fileName }) : null;
}

/**
 * 切过去要做什么（纯函数）。
 * @returns {{kind:'current'}|{kind:'character', index:number, fileName:string, select:boolean}|{kind:'group', groupId:string, fileName:string}}
 * 抛 StcrDataError：NOT_FOUND（ST 里没有这个角色 / 群组 / 群聊文件）、GROUP_UNSUPPORTED（群聊不是 ST 当前选中的群组）
 */
export function planOpen(ctx, chatKey) {
    const key = parseChatKey(chatKey), fileName = hostFileName(key.fileName);
    const normalized = makeChatKey(key.isGroup ? { groupId: key.groupId, fileName } : { avatarUrl: key.avatarUrl, fileName });
    if (currentKey(ctx) === normalized) return { kind: 'current' };
    if (key.isGroup) {
        const group = (ctx.groups ?? []).find(item => String(item?.id) === key.groupId);
        if (!group || !(group.chats ?? []).map(String).includes(fileName)) throw new StcrDataError('NOT_FOUND', '酒馆里找不到这个群聊');
        // getContext() 只公开 openGroupChat（换同一群组里的聊天）；选中别的群组的 openGroupById 没有公开（I062）
        if (String(ctx.groupId ?? '') !== key.groupId) throw new StcrDataError('GROUP_UNSUPPORTED', '群聊暂不支持在酒馆里打开（请先在酒馆里选中这个群组）');
        if (typeof ctx.openGroupChat !== 'function') throw new StcrDataError('UNSUPPORTED', '这个版本的酒馆没有公开打开群聊的函数');
        return { kind: 'group', groupId: group.id, fileName };
    }
    const index = findCharacterIndex(ctx.characters, key.avatarUrl);
    if (index < 0) throw new StcrDataError('NOT_FOUND', '酒馆里找不到这个角色');
    if (typeof ctx.selectCharacterById !== 'function' || typeof ctx.openCharacterChat !== 'function') throw new StcrDataError('UNSUPPORTED', '这个版本的酒馆没有公开打开聊天的函数');
    return { kind: 'character', index, fileName, select: (ctx.groupId != null && String(ctx.groupId) !== '') || String(ctx.characterId) !== String(index) };
}

/** 动手前的检查（不切换、不关阅读器）：忙或做不到就抛 StcrDataError，能做返回 planOpen 的结果。 */
export function checkOpenInHost(chatKey, { getContext = context, document: doc = globalThis.document } = {}) {
    if (hostBusy(doc)) throw new StcrDataError('BUSY', '酒馆正忙，稍后再试');
    return planOpen(getContext(), chatKey);
}

/** 阅读器里选的候选与 ST 当前候选不同的楼（只读比较）。swipes：[[楼下标, 候选下标], …] */
export function swipeDifferences(hostChat, swipes) {
    if (!Array.isArray(hostChat)) return [];
    const out = [];
    for (const [index, swipe] of swipes ?? []) {
        const message = hostChat[index];
        if (!message || !Number.isInteger(swipe)) continue;
        const shown = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
        if (shown !== swipe) out.push(index);
    }
    return out;
}

/**
 * 等 CHAT_CHANGED 且宿主当前聊天就是目标（ST 先选角色时会先发一次别的聊天的 CHAT_CHANGED）。
 * restart()：每走完一步重新计时——先选角色时 ST 会先把那个角色当前的聊天整个读一遍，大文件可能就要好几秒。
 */
function waitForChat(getContext, matches, timeoutMs) {
    const { eventSource, event_types: types } = getContext();
    let off = () => {}, timer = 0, fail = () => {};
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => fail(new StcrDataError('TIMEOUT', '酒馆没有切过去，请手动打开')), timeoutMs); };
    const promise = new Promise((resolve, reject) => {
        fail = reject;
        const check = () => { try { if (matches()) resolve(); } catch { /* 还没切完 */ } };
        if (eventSource?.on && types?.CHAT_CHANGED) {
            eventSource.on(types.CHAT_CHANGED, check);
            off = () => (eventSource.removeListener ?? eventSource.off)?.call(eventSource, types.CHAT_CHANGED, check);
        }
        arm();
    });
    return { promise, restart: arm, stop: () => { off(); clearTimeout(timer); } };
}

/** 把 ST 主界面滚到第 index 楼（只读 DOM）。ST 只渲染最后一批楼，没渲染出来返回 false。 */
export function scrollHostTo(index, doc = globalThis.document) {
    if (!Number.isInteger(index) || index < 0) return false;
    const mes = doc.querySelector(`#chat .mes[mesid="${index}"]`);
    if (!mes) return false;
    mes.scrollIntoView({ block: 'start' });
    return true;
}

/**
 * ST 打开聊天后自己会滚到底（printMessages 立刻滚一次，图片加载完的 1 秒内再滚一次）。
 * 所以落点之后再补两次，人一动滚轮 / 触屏 / 键盘就放手。
 */
function holdHostScroll(index, doc, delays) {
    const chat = doc.getElementById('chat');
    if (!chat || !delays.length) return;
    let left = true;
    const letGo = () => { left = false; };
    const types = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    for (const type of types) chat.addEventListener(type, letGo, { passive: true, once: true });
    delays.forEach((delay, i) => setTimeout(() => {
        if (left) scrollHostTo(index, doc);
        if (i === delays.length - 1) for (const type of types) chat.removeEventListener(type, letGo);
    }, delay));
}

/**
 * 让 ST 打开这个聊天并滚到第 index 楼。
 * @param {string} chatKey
 * @param {{index?:number|null, swipes?:Array<[number,number]>, timeoutMs?:number, scrollDelays?:number[], getContext?:Function, document?:Document}} [options]
 * @returns {Promise<{status:'current'|'opened', floorLoaded:boolean, swipeDiffers:number[]}>}
 * 抛 StcrDataError：BUSY / NOT_FOUND / GROUP_UNSUPPORTED / UNSUPPORTED / TIMEOUT；ST 自己的函数抛的错原样抛出。
 */
export async function openInHost(chatKey, { index = null, swipes = [], timeoutMs = 10_000, scrollDelays = [300, 1300], getContext = context, document: doc = globalThis.document } = {}) {
    const plan = checkOpenInHost(chatKey, { getContext, document: doc });
    if (plan.kind !== 'current') {
        const target = plan.kind === 'group' ? makeChatKey({ groupId: String(plan.groupId), fileName: plan.fileName }) : null;
        const arrived = () => {
            const ctx = getContext();
            if (plan.kind === 'group') return currentKey(ctx) === target;
            return String(ctx.characterId) === String(plan.index) && hostFileName(ctx.getCurrentChatId?.()) === plan.fileName && Array.isArray(ctx.chat);
        };
        const wait = waitForChat(getContext, arrived, timeoutMs);
        try {
            const navigate = async () => {
                if (plan.kind === 'group') { await getContext().openGroupChat(plan.groupId, plan.fileName); return; }
                if (plan.select) {
                    await getContext().selectCharacterById(plan.index);
                    // ST 存盘中 / 正在发送时 selectCharacterById 什么都不做就返回（它自己弹一句"请等存完"）
                    if (String(getContext().characterId) !== String(plan.index)) throw new StcrDataError('BUSY', '酒馆正忙，稍后再试');
                    wait.restart();
                }
                if (!arrived()) await getContext().openCharacterChat(plan.fileName);
            };
            // ST 的函数可能一直等下去（存盘等待、请求挂住），所以和超时（每步 10 秒）赛跑；CHAT_CHANGED 先到也算切好了
            const run = navigate().then(() => (arrived() ? undefined : wait.promise));
            run.catch(() => {});
            await Promise.race([run, wait.promise]);
        } finally { wait.stop(); }
    }
    const floorLoaded = Number.isInteger(index) ? scrollHostTo(index, doc) : true;
    if (floorLoaded && Number.isInteger(index)) holdHostScroll(index, doc, scrollDelays);
    return { status: plan.kind === 'current' ? 'current' : 'opened', floorLoaded, swipeDiffers: swipeDifferences(getContext().chat, swipes) };
}
