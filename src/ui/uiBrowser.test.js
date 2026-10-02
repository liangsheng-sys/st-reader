// ST Reader — AGPL-3.0
// 阅读器界面的浏览器回归（只在开发实例跑）。控制台：
//   await (await import('/scripts/extensions/third-party/st-reader/src/ui/uiBrowser.test.js')).testTextAlignBrowser()
// T50：楼里自带 <style>（如卡片 CSS 写了 p { text-align: center; background: … }）不能让整页正文居中、上底色；
// 逐套切 ST 自带主题 × 聊天风格（默认 / 气泡 / 文档），每种组合下普通楼 .mes_text 和段落都应左对齐。
// 会临时切换 ST 的主题和聊天风格（这是 ST 自己的外观设置，ST 会照常保存），跑完切回原来的。不读写任何聊天。
// T59：跑完主题再接 testHostStylesBrowser（D29 ③）——阅读器打开期间暂停 #chat .mes 里的 <style>，
// 正常关闭、打开/关闭中途抛错、pagehide、根节点被移走后，宿主这些 <style> 的 disabled 必须全部回到 false。

import { isDevInstance } from '../core/readonlyGuard.js';
import { buildFloor } from './floorToolbar.js';
import { h } from './dom.js';
import { closeReader, injectReaderFault, isReaderOpen, openReader } from './reader.js';

export const BUILTIN_THEMES = Object.freeze(['Azure', 'Cappuccino', 'Celestial Macaron', 'Dark Lite', 'Dark V 1.0']);
const DISPLAYS = Object.freeze([['0', '默认'], ['1', '气泡'], ['2', '文档']]);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// 合成样本：普通楼 + 一楼带卡片 CSS（散文 + <style> + <div>，模型常写的样子）+ 普通楼
const CARD = '虚构的一行开场白。\n<style>\np { text-align: center; font-weight: bold; background: rgb(255, 243, 224); }\nh2 { text-align: center; }\n.card { padding: 12px; }\n</style>\n<div class="card"><h2>虚构标题</h2><p>虚构问卷第一题。</p></div>';
const ROWS = Object.freeze([
    { isUser: true, text: '第 0 楼，一段普通的话。\n\n第二段，也很普通。' },
    { isUser: false, text: '第 1 楼，一段比较长的普通正文，应该左对齐。它有好几句话，足够换行，方便看出来是不是被居中了。' },
    { isUser: false, text: CARD },
    { isUser: true, text: '第 3 楼，又一段普通文字，应该左对齐。' },
]);

function mockHandle() {
    const models = ROWS.map((row, index) => Object.freeze({ index, name: row.isUser ? '测试旅人（虚构）' : '星灯（虚构）', isUser: row.isUser, isSystem: false, isNarrator: false,
        date: null, originalAvatar: null, swipeId: 0, swipes: Object.freeze([Object.freeze({ index: 0, text: row.text, reasoning: '', reasoningDuration: null, sendDate: null })]) }));
    return { chatKey: 'stcr-ui-test', total: models.length, getMessage: i => models[i],
        getRegexContext: i => Object.freeze({ userName: '测试旅人（虚构）', characterName: '星灯（虚构）', character: null, groupNames: Object.freeze([]), depth: models.length - 1 - i }) };
}

/** 搭一个和阅读器同结构的临时正文（#stcr_root > .stcr-scroll > #stcr_chat），放进四楼。 */
function mountSample() {
    const handle = mockHandle();
    const ctx = { handle, avatarFor: () => null, isReasoningOpen: () => false, isBookmarked: () => false };
    const chat = h('div', { id: 'stcr_chat' }, ...ROWS.map((_, i) => buildFloor(ctx, handle.getMessage(i), 0)));
    const root = h('div', { id: 'stcr_root', class: 'stcr-dir-b', style: 'opacity:0;pointer-events:none' }, h('div', { class: 'stcr-body' },
        h('div', { class: 'stcr-main' }, h('div', { class: 'stcr-scroll' }, chat))));
    document.body.append(root);
    return { root, chat };
}

function plainAligns(chat) {
    const bad = [];
    for (const mes of chat.querySelectorAll(':scope > .mes')) {
        const text = mes.querySelector('.mes_text');
        // 带 <style> 的那一楼由它自己的 CSS 决定（ST 里也一样），只看 .mes_text 本身；其余楼连段落一起看
        const own = !!text.querySelector('style');
        const nodes = own ? [text] : [text, ...text.querySelectorAll('p')];
        for (const node of nodes) {
            const align = getComputedStyle(node).textAlign;
            if (!['start', 'left', 'justify'].includes(align)) bad.push(`第 ${mes.getAttribute('mesid')} 楼 ${node.tagName.toLowerCase()}=${align}`);
            // T52 验收补充：卡片 CSS 给段落上的底色也不能漏到别的楼
            const background = getComputedStyle(node).backgroundColor;
            if (!own && node.tagName === 'P' && background === 'rgb(255, 243, 224)') bad.push(`第 ${mes.getAttribute('mesid')} 楼 p 底色=${background}`);
        }
    }
    return bad;
}

/** force：在别的隔离实例（如 Opus 的 8101）上跑；它会切 ST 的外观设置，别在自己日常用的 ST 上跑。 */
export async function testTextAlignBrowser({ themes = BUILTIN_THEMES, force = false } = {}) {
    if (!isDevInstance(location) && !force) throw new Error('只在开发实例运行');
    if (isReaderOpen()) throw new Error('请先关闭阅读器再跑（避免两个 #stcr_chat）');
    const results = [];
    const $theme = $('#themes'), $display = $('#chat_display');
    const before = { theme: $theme.val(), display: $display.val() };
    const { root, chat } = mountSample();
    try {
        const card = chat.querySelector('.custom-card p');
        results.push({ name: '样本：卡片自己的段落仍按卡片 CSS 居中（样式没被丢掉）', passed: !!card && getComputedStyle(card).textAlign === 'center', detail: card ? getComputedStyle(card).textAlign : '没找到卡片' });
        for (const theme of themes) {
            if (![...$theme[0].options].some(o => o.value === theme)) { results.push({ name: `主题 ${theme}`, passed: false, detail: '开发实例里没有这套主题' }); continue; }
            $theme.val(theme).trigger('change');
            for (const [value, label] of DISPLAYS) {
                $display.val(value).trigger('change');
                await wait(350); // cssScope 去抖 50ms + 主题样式生效
                const bad = plainAligns(chat);
                results.push({ name: `${theme} × ${label}：正文左对齐`, passed: !bad.length, detail: bad.join('；') || '全部 start/left' });
            }
        }
    } finally {
        root.remove();
        $theme.val(before.theme).trigger('change');
        $display.val(before.display).trigger('change');
    }
    results.push(...await testHostStylesBrowser({ force, quiet: true }));
    console.table(results);
    return results;
}

/**
 * D29 ③ 回归：宿主 #chat .mes 里的 <style> 只在阅读器开着时 disabled，任何关闭路径后全部恢复；
 * #chat 里 .mes 外的 <style> 和 <head> 里的样式从头到尾不碰。
 * 临时往 #chat 末尾放一个不带 mesid 的假楼（只有一个空 <style>），跑完移除；不读写聊天数据。会真的打开/关闭几次阅读器。
 */
export async function testHostStylesBrowser({ force = false, quiet = false } = {}) {
    if (!isDevInstance(location) && !force) throw new Error('只在开发实例运行');
    if (isReaderOpen()) throw new Error('请先关闭阅读器再跑');
    const chat = document.getElementById('chat');
    if (!chat) throw new Error('页面上没有 #chat');
    const results = [];
    const check = (name, passed, detail = '') => results.push({ name: `宿主样式：${name}`, passed: !!passed, detail });
    const style = text => Object.assign(document.createElement('style'), { textContent: `/* stcr 测试：${text} */` });
    const fakeMes = h('div', { class: 'mes stcr-test-hostmes' }, h('div', { class: 'mes_text' }, style('楼内')));
    const outside = style('#chat 里 .mes 外');
    const head = style('head');
    chat.append(fakeMes, outside);
    document.head.append(head);
    const hostStyles = () => [...chat.querySelectorAll('.mes style')];
    const allBack = () => { const bad = hostStyles().filter(el => el.disabled); return { ok: !bad.length, detail: `${hostStyles().length} 个楼内样式，仍禁用 ${bad.length} 个` }; };
    const allMuted = () => hostStyles().every(el => el.disabled);
    const untouched = () => !outside.disabled && !head.disabled;
    const blockers = [];
    // 合成的 pagehide/pageshow 只给阅读器自己的监听（它先注册），别的脚本收不到
    const shield = type => { const stop = event => event.stopImmediatePropagation(); window.addEventListener(type, stop, true); blockers.push([type, stop]); };
    try {
        const before = hostStyles().filter(el => el.disabled).length;
        check('开始前全部启用', before === 0, `禁用 ${before} 个`);

        await openReader();
        check('打开后楼内样式暂停', allMuted(), `${hostStyles().length} 个`);
        check('打开后 .mes 外与 head 不碰', untouched());
        const late = style('打开后新出现的楼内');
        fakeMes.querySelector('.mes_text').append(late);
        await wait(30);
        check('打开期间新出现的楼内样式也暂停', late.disabled);
        closeReader();
        let r = allBack();
        check('正常关闭后全部恢复', r.ok && !isReaderOpen(), r.detail);

        injectReaderFault('open');
        let threw = false;
        try { await openReader(); } catch { threw = true; }
        r = allBack();
        check('打开中途抛错后全部恢复、阅读器不残留', threw && r.ok && !isReaderOpen() && !document.getElementById('stcr_root'), `抛错=${threw}；${r.detail}`);

        await openReader();
        injectReaderFault('close');
        threw = false;
        try { closeReader(); } catch { threw = true; }
        r = allBack();
        check('关闭中途抛错后全部恢复、阅读器不残留', threw && r.ok && !isReaderOpen() && !document.getElementById('stcr_root'), `抛错=${threw}；${r.detail}`);

        await openReader();
        shield('pagehide'); shield('pageshow');
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        r = allBack();
        check('pagehide 后全部恢复', r.ok, r.detail);
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        check('从往返缓存回来、阅读器还开着：重新暂停', allMuted());
        closeReader();
        r = allBack();
        check('之后关闭仍全部恢复', r.ok, r.detail);

        await openReader();
        document.getElementById('stcr_root')?.remove();
        await wait(30);
        r = allBack();
        check('根节点被移走后全部恢复、阅读器收尾', r.ok && !isReaderOpen(), r.detail);
        check('全程 .mes 外与 head 未被禁用', untouched());
    } finally {
        for (const [type, stop] of blockers) window.removeEventListener(type, stop, true);
        if (isReaderOpen()) try { closeReader(); } catch { /* 已在上面记录 */ }
        injectReaderFault(null);
        fakeMes.remove();
        outside.remove();
        head.remove();
    }
    if (!quiet) console.table(results);
    return results;
}
