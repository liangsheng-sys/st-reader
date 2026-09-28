import { listCharacters, listGroups, listRecent, listByCharacter, listByGroup, getCurrentChatKey, makeChatKey, openChat } from './chatSource.js';
import { initFormatter, formatWithStrategy, renderMessage } from './formatter.js';
import { loadHostRuntime } from './hostRuntime.js';
import { collectScripts, runDisplayRegex, PLACEMENT } from './regexPipeline.js';

function assert(value, message) { if (!value) throw new Error(message); }
function asElement(html) { const template = document.createElement('template'); template.innerHTML = html; return template.content; }
function snapshot() {
    const context = SillyTavern.getContext();
    return JSON.stringify({ chat: context.chat, metadata: context.chatMetadata, characterId: context.characterId,
        groupId: context.groupId, currentKey: getCurrentChatKey(), regex: context.extensionSettings.regex,
        allowed: context.extensionSettings.character_allowed_regex, disabled: context.extensionSettings.disabledExtensions });
}

/** 仅 T10 的回环开发实例入口调用；只读 API + 合成数据，两种策略都实际执行。 */
export async function testCoreBrowser() {
    await initFormatter();
    const runtime = await loadHostRuntime();
    const context = runtime.getContext();
    assert(context.characters[context.characterId]?.avatar !== 'STCR_T11_Aster.png', '请先在 ST 打开雾岚（虚构），让星灯处于未选中状态，再运行 T12 自测');
    const before = snapshot();
    const disabledReference = context.extensionSettings.disabledExtensions;
    const handles = [], results = [];
    async function test(name, run) {
        try { await run(); results.push({ name, passed: true }); }
        catch (error) { results.push({ name, passed: false, error: error.message }); console.error(`[st-reader] ${name}：${error.message}`); }
    }
    async function open(avatarUrl, fileName) { const handle = await openChat(makeChatKey({ avatarUrl, fileName })); handles.push(handle); return handle; }
    try {
        await test('只读目录：角色、群组、最近、角色历史、群聊历史摘要', async () => {
            const [characters, groups, recent, single, group] = await Promise.all([listCharacters(), listGroups(), listRecent(10), listByCharacter('STCR_T11_Aster.png'), listByGroup('stcr-t11-island')]);
            assert(characters.some(item => item.avatarUrl === 'STCR_T11_Aster.png' && item.thumbnailUrl), '角色摘要缺失');
            assert(groups.some(item => item.id === 'stcr-t11-island' && item.members.length === 3), '群组摘要缺失');
            assert(recent.length >= 4 && single[0].messageCount === 12 && group[0].messageCount === 4, '聊天摘要计数错误');
            assert(group[0].chatKey === 'group:stcr-t11-island/stcr-t11-island-chat', '群组/聊天 ID 混用');
        });
        const aster = await open('STCR_T11_Aster.png', 'STCR-01-正则与多候选');
        const paper = await open('STCR_T11_Paper.png', 'STCR-02-代码与长文');
        const plain = (index, reasoning = false) => {
            const model = aster.getMessage(index), names = aster.getRegexContext(index), swipe = model.swipes[model.swipeId];
            const scripts = collectScripts(runtime.getContext().extensionSettings, names.character, []);
            return { model, names, text: runDisplayRegex(reasoning ? swipe.reasoning : swipe.text,
                { ...names, scripts, placement: reasoning ? PLACEMENT.REASONING : PLACEMENT.AI }, runtime.regex.runRegexScript) };
        };
        for (const strategy of ['a', 'b']) {
            await test(`策略 ${strategy}：未选中星灯时，作用域与聊天 header 名字宏命中`, () => {
                const { model, names, text } = plain(11);
                const html = formatWithStrategy(text, model, names, { strategy });
                const rendered = asElement(html).textContent;
                assert(rendered.includes('星灯作用域命中'), '目标角色作用域未命中');
                assert(rendered.includes('来自 星灯（虚构），写给 测试旅人（虚构）'), '宏串用了当前宿主名字');
            });
            await test(`策略 ${strategy}：深度按目标聊天，早楼保留标记、近楼命中`, () => {
                const early = plain(1), late = plain(11);
                assert(asElement(formatWithStrategy(early.text, early.model, early.names, { strategy })).textContent.includes('【近景】'), '早楼错误命中');
                assert(asElement(formatWithStrategy(late.text, late.model, late.names, { strategy })).textContent.includes('近景命中'), '末楼未命中');
            });
            await test(`策略 ${strategy}：非幂等全局正则只跑一次，禁用脚本不运行`, () => {
                const { text, model, names } = plain(11);
                const rendered = asElement(formatWithStrategy(text, model, names, { strategy })).textContent;
                assert(rendered.includes('【一次】✓') && !rendered.includes('✓✓') && rendered.includes('【禁止命中】'), '重复执行或禁用脚本运行');
            });
            await test(`策略 ${strategy}：候选独立思维链走 REASONING 显示正则`, () => {
                const { text, model, names } = plain(11, true);
                const rendered = asElement(formatWithStrategy(text, model, names, { strategy, reasoning: true })).textContent;
                assert(rendered.includes('【思考命中】') && rendered.includes('候选 3'), '思维链正则或候选错误');
            });
        }
        await test('策略 a：宿主格式化抛错时也原位恢复禁用列表', () => {
            const originalContext = runtime.getContext;
            let observedDisable = false;
            runtime.getContext = () => ({ ...originalContext(), messageFormatting() {
                observedDisable = originalContext().extensionSettings.disabledExtensions.includes('regex'); throw new Error('预期的实验异常');
            } });
            try {
                try { formatWithStrategy('实验', aster.getMessage(1), aster.getRegexContext(1), { strategy: 'a' }); } catch (error) { assert(error.message === '预期的实验异常', error.message); }
            } finally { runtime.getContext = originalContext; }
            assert(observedDisable && disabledReference === context.extensionSettings.disabledExtensions, '未按预期进入/恢复临时状态');
            assert(snapshot() === before, '策略 a 留下宿主状态变化');
        });
        await test('策略 b：三种代码高亮、HTML/q/表格、超长楼', () => {
            const code = asElement(renderMessage(paper, 1).html);
            for (const language of ['javascript', 'python', 'css']) assert(code.querySelector(`code.hljs.language-${language}`), `${language} 未高亮`);
            const html = asElement(renderMessage(paper, 2).html);
            assert(html.querySelector('q') && html.querySelector('table'), 'HTML 或表格丢失');
            assert(asElement(renderMessage(paper, 3).html).textContent.length >= 20000, '长楼截断');
        });
        await test('策略 b：正则样式限定阅读器，移除脚本、外部资源与宿主操作属性', () => {
            const input = '<style>.badge{color:red!important}</style><span class="badge">安全文本</span>'
                + '<img src="https://example.invalid/image.png" onerror="alert(1)"><script>alert(1)</script>'
                + '<div id="chat" mesid="0" class="mes_edit" data-action="delete" style="background:url(https://example.invalid/x)">展示</div>';
            const html = formatWithStrategy(input, aster.getMessage(1), aster.getRegexContext(1));
            const fragment = asElement(html);
            assert(!fragment.querySelector('script,[src],[onerror],[id],[mesid],[data-action],.mes_edit'), '残留危险节点/宿主交互选择器');
            assert(!html.includes('example.invalid'), '残留资源 URL');
            assert(fragment.querySelector('style')?.textContent.includes('#stcr_chat .mes_text .custom-badge'), '自定义 CSS 未限定阅读器');
        });
        await test('候选切换只改返回结果，不改 ST 当前候选；缺失思维链正确回退', () => {
            const first = renderMessage(aster, 11, 0), last = renderMessage(aster, 11, 4);
            assert(first.reasoningHtml.includes('候选 1') && last.reasoningHtml.includes('候选 5'), '候选串用思维链');
            assert(aster.getMessage(11).swipeId === 2, '原始当前候选变化');
            assert(renderMessage(paper, 5, 0).reasoningHtml === '' && renderMessage(paper, 5, 1).reasoningHtml, '当前/非当前缺失回退错误');
        });
        await test('群聊：不同 chat_id、每位发言者的宏、仅星灯命中作用域', async () => {
            const group = await openChat('group:stcr-t11-island/stcr-t11-island-chat'); handles.push(group);
            assert(group.total === 4 && group.getMessage(0).isUser, '群聊第一楼丢失');
            for (let index = 1; index < 4; index++) {
                const html = renderMessage(group, index).html;
                assert(html.includes(`来自 ${group.getMessage(index).name}`), '群成员宏错误');
                assert(html.includes('星灯作用域命中') === (index === 1), '群成员作用域错误');
            }
        });
        await test('大文件：1600 楼按 30 楼分页，只渲染请求楼层并可释放', async () => {
            const started = performance.now();
            const large = await open('STCR_T11_Mist.png', 'STCR-90-大文件-1600楼');
            assert(large.total === 1600 && large.page(0).messages.length === 30 && large.page(53).messages.length === 10, '分页数量错误');
            assert(renderMessage(large, 1599).html.includes('1600/1600'), '末楼定位错误');
            console.log(`[st-reader] 21.35 MiB 打开、取两页并渲染末楼：${Math.round(performance.now() - started)} ms`);
            large.close(); assert(large.closed, '未释放');
        });
        await test('已取消的打开请求不会继续加载', async () => {
            const abort = new AbortController(); abort.abort();
            let cancelled = false;
            try { await openChat('STCR_T11_Aster.png/STCR-01-正则与多候选', { signal: abort.signal }); }
            catch (error) { cancelled = error.name === 'AbortError'; }
            assert(cancelled, '未保留取消信号');
        });
    } finally { for (const handle of handles) handle.close(); }
    await test('只读终检：当前角色/聊天/元信息/候选/正则设置完全不变', () => {
        assert(snapshot() === before, '宿主状态被改变');
        assert(context.extensionSettings.disabledExtensions === disabledReference, '设置数组引用被替换');
    });
    console.table(results);
    if (results.some(result => !result.passed)) throw new Error('T12 浏览器自测有失败项，见上表');
    return results;
}
