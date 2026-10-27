// ST Reader — AGPL-3.0
// 阅读器界面的浏览器回归（只在开发实例跑）。控制台：
//   await (await import('/scripts/extensions/third-party/st-reader/src/ui/uiBrowser.test.js')).testTextAlignBrowser()
// T50：楼里自带 <style>（如卡片 CSS 写了 p { text-align: center; background: … }）不能让整页正文居中、上底色；
// 逐套切 ST 自带主题 × 聊天风格（默认 / 气泡 / 文档），每种组合下普通楼 .mes_text 和段落都应左对齐。
// 会临时切换 ST 的主题和聊天风格（这是 ST 自己的外观设置，ST 会照常保存），跑完切回原来的。不读写任何聊天。
// T59：跑完主题再接 testHostStylesBrowser（D29 ③）——阅读器打开期间暂停 #chat .mes 里的 <style>，
// 正常关闭、打开/关闭中途抛错、pagehide、根节点被移走后，宿主这些 <style> 的 disabled 必须全部回到 false。

import { isDevInstance } from '../core/readonlyGuard.js';
import { formatWithStrategy, initFormatter } from '../core/formatter.js';
import { findHtmlBlocks } from './htmlBlocks.js';
import { buildFloor, fillFloor, floorFault } from './floorToolbar.js';
import { h } from './dom.js';
import { RENDER_FAULT_MARK } from './logic.js';
import { COMMUNITY_HTML } from '../../dev/fixtures/html.mjs';
import { closeReader, injectReaderFault, isReaderOpen, openReader } from './reader.js';

export const BUILTIN_THEMES = Object.freeze(['Azure', 'Cappuccino', 'Celestial Macaron', 'Dark Lite', 'Dark V 1.0']);
const DISPLAYS = Object.freeze([['0', '默认'], ['1', '气泡'], ['2', '文档']]);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// 合成样本：普通楼 + 一楼带卡片 CSS（散文 + <style> + <div>，模型常写的样子）+ 普通楼
const CARD = '虚构的一行开场白。\n<style>\np { text-align: center; font-weight: bold; background: rgb(255, 243, 224); }\nh2 { text-align: center; }\n.card { padding: 12px; }\n</style>\n<div class="card"><h2>虚构标题</h2><p>虚构问卷第一题。</p></div>';
const ROWS = Object.freeze([
    { isUser: true, text: '第 0 楼，一段普通的话。\n\n第二段，也很普通。' },
    { isUser: false, text: '第 1 楼，一段比较长的普通正文，应该左对齐。它有好几句话，足够换行，方便看出来是不是被居中了。' },
    { isUser: false, text: CARD, own: true },
    { isUser: true, text: '第 3 楼，又一段普通文字，应该左对齐。' },
    // T72（I051）：社区卡结构——散文、details、样式盒、带 <style> 的状态栏（只管自己的类）、<selection>。散文段落仍应左对齐
    { isUser: false, text: COMMUNITY_HTML },
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
        // 卡片 CSS 改了 p 的那一楼由它自己的 CSS 决定（ST 里也一样），只看 .mes_text 本身；其余楼连段落一起看
        const own = !!ROWS[Number(mes.getAttribute('mesid'))]?.own;
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

/**
 * T62（I050）：被 ST 隐藏过的普通楼（is_system=true，名字与候选不变）必须按普通楼排版——
 * 正文左对齐、有头像位、有工具条、有候选切换控件、名字旁有"已隐藏"标签；
 * 真正的旁白楼（isNarrator，或无名/System 且无多候选）仍然居中小字、无工具条。
 * 只挂临时 DOM，不打开阅读器、不读写聊天。
 */
export async function testHiddenFloorsBrowser({ force = false, quiet = false } = {}) {
    if (!isDevInstance(location) && !force) throw new Error('只在开发实例运行');
    const results = [];
    const check = (name, passed, detail = '') => results.push({ name: `隐藏楼：${name}`, passed: !!passed, detail });
    const swipe = text => Object.freeze({ index: 0, text, reasoning: '', reasoningDuration: null, sendDate: null });
    const floor = (index, { name, isUser = false, isSystem = false, isNarrator = false, swipes = ['x'] }) => Object.freeze({
        index, name, isUser, isSystem, isNarrator, date: null, originalAvatar: null, swipeId: 0,
        swipes: Object.freeze(swipes.map(swipe)),
    });
    const models = [
        floor(0, { name: '星灯（虚构）', swipes: ['第 0 楼，普通正文。'] }),
        floor(1, { name: '星灯（虚构）', isSystem: true, swipes: ['第 1 楼，被隐藏过但其实是普通楼，应当左对齐。', '候选二：同样左对齐。'] }), // 隐藏 + 多候选
        floor(2, { name: '测试旅人（虚构）', isUser: true, isSystem: true, swipes: ['第 2 楼，隐藏的用户楼。'] }), // 隐藏的用户楼
        floor(3, { name: 'System', isNarrator: true, swipes: ['第 3 楼，真正的旁白，应当居中小字。'] }), // 旁白
        floor(4, { name: '', isSystem: true, swipes: ['第 4 楼，无名提示行，应当居中小字。'] }), // 无名系统行
    ];
    const handle = { chatKey: 'stcr-ui-test', total: models.length, getMessage: i => models[i],
        getRegexContext: i => Object.freeze({ userName: '测试旅人（虚构）', characterName: '星灯（虚构）', character: null, groupNames: Object.freeze([]), depth: models.length - 1 - i }) };
    const ctx = { handle, avatarFor: () => 'about:blank', isReasoningOpen: () => false, isBookmarked: () => false };
    const root = h('div', { id: 'stcr_root', class: 'stcr-dir-b', style: 'opacity:0;pointer-events:none' }, h('div', { class: 'stcr-scroll' },
        h('div', { id: 'stcr_chat' }, ...models.map((_, i) => buildFloor(ctx, handle.getMessage(i), 0)))));
    document.body.append(root);
    try {
        const chat = root.querySelector('#stcr_chat');
        const mes = index => chat.querySelector(`.mes[mesid="${index}"]`);
        const align = el => getComputedStyle(el.querySelector('.mes_text')).textAlign;

        const hidden = mes(1);
        check('隐藏的多候选楼：正文左对齐', ['start', 'left', 'justify'].includes(align(hidden)), align(hidden));
        check('隐藏的多候选楼：有工具条', !!hidden.querySelector('.stcr-floor-toolbar'));
        check('隐藏的多候选楼：有候选切换控件', !!hidden.querySelector('.stcr-swipes'));
        check('隐藏的多候选楼：显示头像', !!hidden.querySelector('.avatar img'));
        check('隐藏的多候选楼：名字旁有"已隐藏"标签', hidden.querySelector('.stcr-hidden-tag')?.textContent === '已隐藏' && !hidden.classList.contains('stcr-mes--system'));

        const hiddenUser = mes(2);
        check('隐藏的用户楼：也算普通楼（左对齐、无系统样式）', !hiddenUser.classList.contains('stcr-mes--system') && ['start', 'left', 'justify'].includes(align(hiddenUser)));
        check('隐藏的用户楼：有"已隐藏"标签', hiddenUser.querySelector('.stcr-hidden-tag')?.textContent === '已隐藏');

        const narrator = mes(3);
        check('旁白楼：仍是系统样式（居中小字）', narrator.classList.contains('stcr-mes--system') && align(narrator) === 'center' && !narrator.querySelector('.stcr-floor-toolbar'));
        check('旁白楼：没有"已隐藏"标签', !narrator.querySelector('.stcr-hidden-tag'));

        const named = mes(4);
        check('无名系统楼：仍是系统样式', named.classList.contains('stcr-mes--system') && align(named) === 'center' && !named.querySelector('.stcr-hidden-tag'));
    } finally {
        root.remove();
    }
    if (!quiet) console.table(results);
    return results;
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
        const community = chat.querySelector(`.mes[mesid="${ROWS.length - 1}"] .mes_text`);
        const tops = community ? [...community.children].map(el => el.tagName) : [];
        results.push({ name: 'T72 社区卡样本：正常渲染不失败，details 可折叠、样式盒与状态栏在、<selection> 文字按正文显示',
            passed: !!community && !community.closest('.stcr-mes--broken') && tops.filter(t => t === 'DETAILS').length === 4 && !!community.querySelector('details > summary')
                && !!community.querySelector('.custom-harbor-status') && community.textContent.includes('选项：一、送别'),
            detail: tops.join(' ') });
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
    results.push(...await testHiddenFloorsBrowser({ force, quiet: true }));
    results.push(...await testRawFallbackBrowser({ force, quiet: true }));
    results.push(...await testHtmlAfterRegexBrowser({ force, quiet: true }));
    results.push(...await testNavBrowser({ force, quiet: true }));
    console.table(results);
    return results;
}

/**
 * T80：楼层胶囊与上下楼。打开纸舟合成聊天（只读），在当前视口下检查：
 * 胶囊停在正文列外不压字（视口 ≥1000 时）、展开不变宽；↓ / ] 到下一楼开头，[ 回上一楼，输入框里按键不抢；
 * "隐藏 HTML 工具条"时工具条不占位、平时看不见，叫出来才显示（只切根节点的类，不改用户设置）；顶栏按钮不被压缩。
 */
export async function testNavBrowser({ force = false, quiet = false, chatKey = 'STCR_T11_Paper.png/STCR-02-代码与长文' } = {}) {
    if (!isDevInstance(location) && !force) throw new Error('只在开发实例运行');
    if (isReaderOpen()) closeReader();
    const results = [];
    const check = (name, passed, detail = '') => results.push({ name: `楼层胶囊：${name}`, passed: !!passed, detail: String(detail) });
    const until = async (test, ms = 8000) => { const end = Date.now() + ms; while (!test() && Date.now() < end) await wait(50); return test(); };
    try {
        await openReader({ chatKey });
        const root = document.getElementById('stcr_root');
        await until(() => root.querySelectorAll('#stcr_chat .mes').length > 4 && getComputedStyle(root).position === 'fixed'); // 刚刷新时扩展样式表可能还没到
        // 新浏览器第一次打开会弹"更新了什么"，开着时快捷键不响应
        if (await until(() => root.querySelector('.stcr-doc'), 1500)) root.querySelector('.stcr-doc-close')?.click();
        const scroller = root.querySelector('.stcr-scroll'), chat = root.querySelector('#stcr_chat'), follow = root.querySelector('.stcr-follow');
        const view = () => scroller.getBoundingClientRect();
        const topOf = index => Math.round(root.querySelector(`#stcr_chat .mes[mesid="${index}"]`).getBoundingClientRect().top - view().top);
        const current = () => Number(follow.querySelector('[data-act="floor-next"]')?.dataset.index);
        const floor = root.querySelector('#stcr_chat .mes[mesid="3"]');
        scroller.scrollTop += floor.getBoundingClientRect().top - view().top + 40;
        await until(() => !follow.hidden && current() === 3, 2000);
        check('胶囊显示视口顶端这一楼', !follow.hidden && current() === 3, `当前 ${current()}`);
        const f = follow.getBoundingClientRect(), c = chat.getBoundingClientRect();
        if (innerWidth >= 1000) check('≥1000px：停在正文列外，不和正文重叠', f.left >= c.right || f.right <= c.left, `胶囊 ${Math.round(f.left)}–${Math.round(f.right)}，正文 ${Math.round(c.left)}–${Math.round(c.right)}`);
        const tools = follow.querySelector('.stcr-follow-tools');
        check('平时收成胶囊（按钮列藏着）', getComputedStyle(tools).display === 'none');
        follow.querySelector('[data-act="follow-toggle"]').click();
        check('点按展开，宽度不变', getComputedStyle(tools).display === 'flex' && Math.round(follow.getBoundingClientRect().width) === Math.round(f.width), follow.getBoundingClientRect().width);
        follow.querySelector('[data-act="floor-next"]').click();
        await wait(100);
        check('↓ 到下一楼开头', current() === 4 && Math.abs(topOf(4) - 8) <= 2, `当前 ${current()}，楼顶 ${topOf(4)}`);
        check('跳楼后仍展开（触屏可以连点）', follow.classList.contains('stcr-follow--open'));
        scroller.click();
        check('点别处收起', !follow.classList.contains('stcr-follow--open'));
        const key = (k, target = scroller) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
        scroller.focus();
        key(']'); await wait(100);
        check('] 下一楼', current() === 5 && Math.abs(topOf(5) - 8) <= 2, `当前 ${current()}`);
        key('['); await wait(100);
        check('[ 上一楼', current() === 4 && Math.abs(topOf(4) - 8) <= 2, `当前 ${current()}`);
        const input = h('input', { type: 'text' });
        root.append(input);
        input.focus();
        key(']', input); await wait(100);
        input.remove();
        check('输入框聚焦时 ] 不抢', current() === 4, `当前 ${current()}`);
        const shell = root.querySelector('.stcr-html:not(.stcr-html--source)');
        if (shell) {
            const bar = shell.querySelector('.stcr-html-bar');
            const had = root.classList.contains('stcr-html-bar-hidden');
            root.classList.add('stcr-html-bar-hidden');
            await wait(300); // 淡出过渡走完
            const hidden = getComputedStyle(bar);
            check('隐藏 HTML 工具条：不占位、平时看不见', hidden.position === 'absolute' && hidden.visibility === 'hidden', `${hidden.position} / ${hidden.visibility}`);
            shell.classList.add('stcr-html--bar-on');
            check('叫出来（触屏点 ⋯）就显示', getComputedStyle(bar).visibility === 'visible');
            shell.classList.remove('stcr-html--bar-on');
            root.classList.toggle('stcr-html-bar-hidden', had);
            if (!had) check('关掉开关：工具条回到块上方占位', getComputedStyle(bar).position === 'static');
        } else check('样本里有渲染中的 HTML 块', false, '没找到');
        const top = [...root.querySelector('.stcr-topbar').children].filter(el => !el.matches('.stcr-title'));
        check('顶栏按钮不被压缩（I054）', top.every(el => getComputedStyle(el).flexShrink === '0'));
        const x = root.querySelector('[data-act="exit"]').getBoundingClientRect();
        check('✕ 完整在视口内', x.left >= 0 && x.top >= 0 && x.right <= innerWidth && x.bottom <= innerHeight, `${Math.round(x.left)},${Math.round(x.top)}–${Math.round(x.right)},${Math.round(x.bottom)}`);
    } finally {
        if (isReaderOpen()) closeReader();
    }
    if (!quiet) console.table(results);
    return results;
}

/**
 * T75（I057/I058）：裸 HTML 在显示正则之后的正文上识别。模型写的盒子被正则改了标签也只框盒子；正则产出的整页进框；
 * 原文没有 HTML 时，正则美化（style + div）照旧留在正文里。只用合成文本与临时 DOM。
 */
export async function testHtmlAfterRegexBrowser({ force = false, quiet = false } = {}) {
    if (!isDevInstance(location) && !force) throw new Error('只在开发实例运行');
    await initFormatter();
    const results = [];
    const check = (name, passed, detail = '') => results.push({ name: `正则后识别：${name}`, passed: !!passed, detail });
    const model = Object.freeze({ index: 0, name: '星灯（虚构）', isUser: false, isSystem: false, isNarrator: false });
    const names = Object.freeze({ userName: '测试旅人（虚构）', characterName: '星灯（虚构）', character: null, groupNames: Object.freeze([]), depth: 0 });
    const shown = display => { const el = h('div', { class: 'mes_text' }); el.innerHTML = formatWithStrategy(display, model, names); return el; };
    const raw = '雾散了一点。（虚构散文）\n\n<style>.log{padding:8px}</style>\n<div class="log">虚构记录</div>\n\n后来他们回去了。\n\n【页面】';
    const display = raw.replace('<div class="log">虚构记录</div>', '<section class="log">虚构记录</section>')
        .replace('【页面】', '<html><head><style>body{margin:0}</style></head><body><main>虚构页面</main></body></html>');
    const blocks = findHtmlBlocks(shown(display), raw, display);
    check('正则改了模型的盒子：两段各自对上，散文不进框', blocks.length === 2 && blocks.every(block => block.nodes), JSON.stringify(blocks.map(block => !!block.nodes)));
    check('框里是正则之后的样子', blocks[0]?.html.includes('<section') && blocks[1]?.html.startsWith('<html>'));
    const oldWay = findHtmlBlocks(shown(display), raw, raw);
    check('对照：按原文识别会退回"整楼一块"', oldWay.length === 1 && oldWay[0].nodes === null);
    const beauty = '虚构的信。<style>.paper{padding:8px}</style><div class="paper">信纸</div>';
    check('原文没有 HTML：正则美化留在正文', findHtmlBlocks(shown(beauty), '虚构的信。【信纸】', beauty).length === 0);
    const page = '虚构开场。\n\n<html><head><style>body{margin:0}</style></head><body><main>虚构页面</main></body></html>';
    const pageBlocks = findHtmlBlocks(shown(page), '虚构开场。\n\n【页面】', page);
    check('原文没有 HTML：正则产出的整页进框', pageBlocks.length === 1 && !!pageBlocks[0].nodes && pageBlocks[0].html.startsWith('<html>'));
    if (!quiet) console.table(results);
    return results;
}

/**
 * T72（I051）：格式化抛错（开发实例里用测试注入记号触发）时，这一候选原样显示转义原文：
 * 名字旁"原样显示"、⋯ 里有"复制错误信息"、HTML 不执行、换行保留；换回正常候选即恢复。只挂临时 DOM，不读写聊天。
 */
export async function testRawFallbackBrowser({ force = false, quiet = false } = {}) {
    if (!isDevInstance(location) && !force) throw new Error('只在开发实例运行');
    const results = [];
    const check = (name, passed, detail = '') => results.push({ name: `原样显示：${name}`, passed: !!passed, detail });
    const raw = `${RENDER_FAULT_MARK}\n\n${COMMUNITY_HTML}\n<img src=x onerror="window.stcrRawFallbackRan=1">`;
    const swipe = text => Object.freeze({ index: 0, text, reasoning: '', reasoningDuration: null, sendDate: null });
    const model = Object.freeze({ index: 0, name: '星灯（虚构）', isUser: false, isSystem: false, isNarrator: false, date: null, originalAvatar: null, swipeId: 0,
        swipes: Object.freeze([swipe(COMMUNITY_HTML), swipe(raw)]) });
    const handle = { chatKey: 'stcr-ui-test', total: 1, getMessage: () => model,
        getRegexContext: () => Object.freeze({ userName: '测试旅人（虚构）', characterName: '星灯（虚构）', character: null, groupNames: Object.freeze([]), depth: 0 }) };
    const ctx = { handle, avatarFor: () => null, isReasoningOpen: () => false, isBookmarked: () => false };
    const errors = console.error; console.error = () => {}; // 预期的失败日志不刷屏
    const el = buildFloor(ctx, model, 1);
    const root = h('div', { id: 'stcr_root', class: 'stcr-dir-b', style: 'opacity:0;pointer-events:none' }, h('div', { class: 'stcr-scroll' }, h('div', { id: 'stcr_chat' }, el)));
    document.body.append(root);
    try {
        const text = el.querySelector('.mes_text');
        check('楼层标为原样显示，名字旁有小标签', el.classList.contains('stcr-mes--broken') && el.querySelector('.stcr-raw-tag')?.textContent === '原样显示');
        check('正文是转义后的原文，一个字不少', text?.textContent === raw && !text.querySelector('*'), text?.children.length);
        check('换行保留', getComputedStyle(text).whiteSpace === 'pre-wrap');
        await new Promise(resolve => setTimeout(resolve, 50));
        check('原文里的 HTML 没有执行', !window.stcrRawFallbackRan && !text.querySelector('img, details, style'));
        check('⋯ 里有"复制错误信息"，有候选切换', !!el.querySelector('[data-act="copy-error"]') && !!el.querySelector('[data-act="more"]') && !!el.querySelector('.stcr-swipes'));
        const fault = floorFault(el);
        check('错误信息只记楼号、候选和错误，不含正文', fault?.index === 0 && fault.swipe === 1 && fault.total === 2 && fault.error instanceof Error && !JSON.stringify(Object.keys(fault)).includes('text'));
        fillFloor(ctx, el, model, 0);
        check('换回正常候选：恢复正常排版', !el.classList.contains('stcr-mes--broken') && !floorFault(el) && !!el.querySelector('.mes_text details'));
        fillFloor(ctx, el, model, 1);
        check('再切到坏候选：又原样显示', el.classList.contains('stcr-mes--broken') && el.dataset.swipe === '1');
    } finally {
        console.error = errors;
        root.remove();
        delete window.stcrRawFallbackRan;
    }
    if (!quiet) console.table(results);
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
