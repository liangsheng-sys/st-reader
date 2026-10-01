// ST Reader — AGPL-3.0
import { createChatSource, makeChatKey, parseChatKey } from './chatSource.js';
import { calculateDepths, normalizeDate, parseChatRows, toMessageModel } from './messageModel.js';
import { collectScripts, isDisplayScript, runDisplayRegex, runLiteralRegex } from './regexPipeline.js';
import { locateTextQuote, makeTextQuote, replaceLiteralNames, splitMaskedText } from './textTransforms.js';

function assert(condition, message = '断言失败') { if (!condition) throw new Error(message); }
function equal(actual, expected) { assert(JSON.stringify(actual) === JSON.stringify(expected), `不相等：${JSON.stringify(actual)} / ${JSON.stringify(expected)}`); }
function throws(run) { let threw = false; try { run(); } catch { threw = true; } assert(threw, '应拒绝无效输入'); }
async function rejects(run) { let threw = false; try { await run(); } catch { threw = true; } assert(threw, '异步操作应失败'); }
const script = (id, findRegex, replaceString, extra = {}) => ({ id, findRegex, replaceString, placement: [2], markdownOnly: true, promptOnly: false, trimStrings: [], substituteRegex: 0, minDepth: null, maxDepth: null, ...extra });

/** Node 与浏览器共享的纯逻辑测试，无 ST、DOM 或网络依赖。 */
export async function testCoreLogic() {
    const results = [];
    async function test(name, run) { await run(); results.push({ name, passed: true }); }
    await test('聊天键：中文、空格、百分号、群聊与文件名中的 jsonl 可逆', () => {
        const key = makeChatKey({ avatarUrl: '甲 %.png', fileName: '河边 %.jsonl' });
        equal(parseChatKey(key), { isGroup: false, avatarUrl: '甲 %.png', groupId: null, fileName: '河边 %.jsonl' });
        equal(parseChatKey(makeChatKey({ groupId: 'g1', fileName: 'c2' })).fileName, 'c2');
        for (const bad of ['', '../x', 'a/%2e%2e', 'a/%2fetc', 'a/%5cetc', 'a/%00', 'a/%', 'a/b/c']) throws(() => parseChatKey(bad));
    });
    await test('header：单聊剥离、无 header 不丢楼、群聊保留第一楼、坏行拒绝', () => {
        const message = { mes: '第一楼', name: '甲' };
        const rows = [{ user_name: '旅人', character_name: '甲', chat_metadata: { custom: 1 } }, message];
        equal(parseChatRows(rows).messages, [message]); equal(rows.length, 2);
        equal(parseChatRows([message]).messages.length, 1);
        equal(parseChatRows([message], { isGroup: true }).messages[0], message);
        const metadata = { custom: { note: '原值' } }, parsed = parseChatRows([{ user_name: '旅人', chat_metadata: metadata }, message]);
        assert(Object.isFrozen(parsed.header.metadata.custom)); assert(!Object.isFrozen(metadata.custom));
        throws(() => parseChatRows({})); throws(() => parseChatRows([message, {}]));
    });
    await test('候选：当前正文权威、思维链仅当前回退，空字符串不回退', () => {
        const raw = { mes: '当前编辑稿', swipe_id: 1, swipes: ['旧一', '旧二', '旧三'], extra: { reasoning: '当前思考', reasoning_duration: 9 },
            swipe_info: [{ send_date: '2026-09-28T00:00:00Z', extra: {} }, { extra: {} }, { extra: { reasoning: '', reasoning_duration: 0 } }] };
        const before = JSON.stringify(raw), model = toMessageModel(raw, 7);
        equal(model.swipes.map(swipe => swipe.text), ['旧一', '当前编辑稿', '旧三']);
        equal(model.swipes.map(swipe => swipe.reasoning), ['', '当前思考', '']);
        equal(model.swipes.map(swipe => swipe.reasoningDuration), [null, 9, 0]);
        equal(model.swipes[0].sendDate, '2026-09-28T00:00:00.000Z');
        equal(model.swipeId, 1); equal(JSON.stringify(raw), before); assert(Object.isFrozen(model.swipes));
    });
    await test('单候选与坏索引日期：稳定退化且不修改原始记录', () => {
        const raw = { mes: '单楼', swipe_id: 99, send_date: '坏日期', extra: { reasoning: '解释', reasoning_duration: -1 } };
        const model = toMessageModel(raw, 0); equal(model.swipeId, 0); equal(model.swipes.length, 1); equal(model.date, null); equal(model.swipes[0].reasoningDuration, null);
        equal(raw.swipe_id, 99);
        equal(normalizeDate('1720000000000'), new Date(1720000000000).toISOString());
        equal(normalizeDate('2026-9-28 @16h 05m 03s 01ms'), new Date(2026, 8, 28, 16, 5, 3, 1).toISOString());
        equal(normalizeDate('2026-13-28 @16h 05m 03s'), null); equal(normalizeDate(1e20), null);
    });
    await test('深度忽略 system，按目标聊天而非宿主聊天计算', () => {
        equal([...calculateDepths([{ mes: 'a' }, { mes: 'b', is_system: true }, { mes: 'c', is_user: true }, { mes: 'd' }])], [2, -1, 1, 0]);
    });
    await test('正则顺序与作用域允许名单、全局禁用', () => {
        const global = script('global', 'x', 'y'), preset = script('preset', 'y', 'z'), scoped = script('scope', 'z', 'ok');
        const card = { avatar: 'a.png', data: { extensions: { regex_scripts: [scoped] } } };
        const settings = { regex: [global], character_allowed_regex: ['a.png'] };
        equal(collectScripts(settings, card, [preset]).map(item => item.id), ['global', 'preset', 'scope']);
        equal(collectScripts({ ...settings, character_allowed_regex: [] }, card, [preset]).length, 2);
        equal(collectScripts({ ...settings, disabledExtensions: ['regex'] }, card, [preset]), []);
    });
    await test('显示策略：markdown、两项未选、prompt 排除、placement 与深度上下界', () => {
        const base = script('x', 'x', 'y', { minDepth: 1, maxDepth: 2 });
        assert(isDisplayScript(base, 2, 1)); assert(isDisplayScript(base, 2, 2)); assert(!isDisplayScript(base, 2, 0)); assert(!isDisplayScript(base, 2, 3));
        assert(isDisplayScript({ ...base, markdownOnly: false, promptOnly: false }, 2, 1));
        assert(!isDisplayScript({ ...base, markdownOnly: false, promptOnly: true }, 2, 1));
        assert(!isDisplayScript({ ...base, disabled: true }, 2, 1)); assert(!isDisplayScript(base, 6, 1));
        assert(!isDisplayScript({ ...base, placement: '2' }, 2, 1)); assert(!isDisplayScript({ ...base, findRegex: {} }, 2, 1));
    });
    await test('正则只跑一次、名字宏使用目标上下文、同 ID 去重', () => {
        const once = script('once', '/x/g', 'x✓');
        const names = script('names', '/N/g', '{{char}} / {{user}}');
        const result = runDisplayRegex('x N', { scripts: [once, names, once], placement: 2, depth: 0, characterName: '目标角色', userName: '目标旅人' }, runLiteralRegex);
        equal(result, 'x✓ 目标角色 / 目标旅人');
    });
    await test('正则捕获组、命名捕获、trim、查找宏转义与无效模式', () => {
        const named = script('a', '/(?<word>abc)/g', '[$<word>][$0][{{match}}]', { trimStrings: ['b'] });
        equal(runDisplayRegex('abc', { scripts: [named], placement: 2, depth: 0 }, runLiteralRegex), '[ac][ac][ac]');
        const escaped = script('b', '/{{char}}/g', 'hit', { substituteRegex: 2 });
        equal(runDisplayRegex('A+B AAB', { scripts: [escaped], placement: 2, depth: 0, characterName: 'A+B' }, runLiteralRegex), 'hit AAB');
        equal(runLiteralRegex(script('c', '/[/g', 'bad'), 'safe'), 'safe');
    });
    await test('只读宏：原文、替换串、trim 和捕获拼接均不进入宿主宏解释器', () => {
        const forbiddenExecutor = () => { throw new Error('不应调用可能执行宏的宿主'); };
        const options = { placement: 2, depth: 0, userName: '旅人', characterName: '甲' };
        equal(runDisplayRegex('{{setvar::x::1}}', { ...options, scripts: [script('x', '/(.*)/', '$1')] }, forbiddenExecutor), '{{setvar::x::1}}');
        equal(runDisplayRegex('x', { ...options, scripts: [script('x', '/x/', '{{setvar::x::1}}')] }, forbiddenExecutor), '{{setvar::x::1}}');
        equal(runDisplayRegex('x', { ...options, scripts: [script('x', '/x/', '$0', { trimStrings: ['{{setvar::x::1}}'] })] }, forbiddenExecutor), 'x');
        equal(runDisplayRegex('{x{y}}', { ...options, scripts: [script('x', '/({)x({)y(}})/', '$1$2setvar::x::1$3')] }, forbiddenExecutor), '{{setvar::x::1}}');
    });
    await test('分页仅构建当前页模型、绝对楼号不变、关闭后拒绝读取', async () => {
        const messages = Array.from({ length: 65 }, (_, i) => ({ name: '甲', mes: `楼${i}` }));
        Object.defineProperty(messages[64], 'swipes', { get() { throw new Error('不应提前构造未请求楼层'); } });
        const calls = [];
        const source = createChatSource({ getContext: () => ({ name1: '旅人' }), read: async (url, body) => {
            calls.push({ url, body });
            if (url === '/api/chats/search') return [{ file_name: 'test.jsonl', file_size: 100, last_mes: 1 }];
            return url === '/api/characters/get' ? { avatar: 'a.png', name: '甲' } : [{ user_name: '旅人' }, ...messages];
        } });
        const handle = await source.openChat(makeChatKey({ avatarUrl: 'a.png', fileName: 'test' }));
        equal(handle.total, 65); equal(handle.pageCount, 3); equal(handle.page(1).messages[0].index, 30); equal(handle.page(0).messages.length, 30);
        equal(calls.map(call => call.url), ['/api/characters/get', '/api/chats/search', '/api/chats/get']);
        throws(() => handle.page(3)); handle.close(); handle.close(); throws(() => handle.getMessage(0)); throws(() => handle.page(0));
        const emptySource = createChatSource({ getContext: () => ({}), read: async url => url === '/api/characters/get' ? { avatar: 'a.png', name: '甲' }
            : url === '/api/chats/search' ? [{ file_name: 'empty.jsonl', file_size: 100, last_mes: 1 }] : [{ user_name: '旅人' }] });
        const empty = await emptySource.openChat('a.png/empty');
        equal(empty.total, 0); equal(empty.pageCount, 0); equal(empty.page(0).messages, []); empty.close();
    });
    await test('群聊按文件 ID 请求、不吞第一楼、按发言成员取得作用域', async () => {
        const calls = [];
        const source = createChatSource({ getContext: () => ({}), read: async (url, body) => {
            calls.push({ url, body });
            if (url === '/api/groups/all') return [{ id: 'g1', name: '群', chat_id: 'c2', chats: ['c2'], members: ['a.png', 'b.png'] }];
            if (url === '/api/characters/get') return { avatar: body.avatar_url, name: body.avatar_url === 'a.png' ? '甲' : '乙' };
            if (url === '/api/chats/search') return [{ file_name: 'c2', file_size: 100, last_mes: 1 }];
            return [{ mes: '开始', name: '甲', is_user: true, original_avatar: 'a.png' }, { mes: '回应', name: '乙', original_avatar: 'b.png' }];
        } });
        const handle = await source.openChat('group:g1/c2'); equal(handle.total, 2); equal(handle.header.userName, '甲');
        equal(handle.getRegexContext(0).character, null);
        equal(handle.getRegexContext(1).character.avatar, 'b.png'); equal(calls.at(-1), { url: '/api/chats/group/get', body: { id: 'c2' } });
        handle.close(); await rejects(() => source.openChat('group:g1/missing'));
    });
    await test('目录摘要字段、无聊天目录、当前聊天键与取消信号', async () => {
        const abort = new AbortController();
        const ctx = { characters: [{ avatar: 'a.png' }], characterId: 0, getCurrentChatId: () => 't' };
        const source = createChatSource({ getContext: () => ctx, prefetchOnList: false, read: async (url, _body, options) => {
            assert(options.signal === abort.signal);
            if (url === '/api/characters/chats') return { error: true };
            if (url === '/api/chats/search') return [{ file_name: 'c', message_count: 4, preview_message: '片段' }];
            return [{ avatar: 'a.png', group: null, file_name: 't.jsonl', chat_items: 3, mes: 'x'.repeat(300), last_mes: 0 }, { group: null, file_name: '临时.jsonl' }];
        } });
        const rows = await source.listRecent(10, { signal: abort.signal }); equal(rows.length, 1); equal(rows[0].chatKey, 'a.png/t'); equal(rows[0].messageCount, 3); equal(rows[0].preview.length, 240);
        equal(await source.listByCharacter('empty.png', { signal: abort.signal }), []);
        equal((await source.listByGroup('g', { signal: abort.signal }))[0].chatKey, 'group:g/c');
        equal(source.getCurrentChatKey(), 'a.png/t'); ctx.groupId = 'g'; equal(source.getCurrentChatKey(), 'group:g/t');
        await rejects(() => source.listRecent(0));
        const failed = createChatSource({ read: async () => { throw new DOMException('已取消', 'AbortError'); } });
        await rejects(() => failed.openChat('a.png/t', { signal: abort.signal }));
    });
    await test('纯文本锚点：前后文消歧、唯一原文回退、失配/歧义返回 null', () => {
        const quote = makeTextQuote('前文甲目标乙后文', 3, 5); equal(quote.exact, '目标');
        equal(locateTextQuote('插入前文甲目标乙后文', quote), { start: 5, end: 7 });
        equal(locateTextQuote('变化目标新的', quote), { start: 2, end: 4 });
        equal(locateTextQuote('目标和目标', quote), null); equal(locateTextQuote('消失', quote), null); throws(() => makeTextQuote('x', 1, 1));
        throws(() => makeTextQuote('xyz', 0, 1, -1));
    });
    await test('脱敏纯函数：长词优先、字面量、不串换；mask 段不保留秘密', () => {
        equal(replaceLiteralNames('甲小姐与甲及A+B', [{ from: '甲', to: '乙' }, { from: '乙', to: '丙' }, { from: '甲小姐', to: 'char' }, { from: 'A+B', to: 'user' }]), 'char与乙及user');
        const runs = splitMaskedText('甲小姐和甲', ['甲', '甲小姐']); equal(runs, [{ type: 'mask', length: 3 }, { type: 'text', text: '和' }, { type: 'mask', length: 1 }]);
        assert(!JSON.stringify(runs).includes('甲'));
    });
    return results;
}
