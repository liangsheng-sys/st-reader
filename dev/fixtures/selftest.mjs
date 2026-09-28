import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { inflateSync } from 'node:zlib';
import { assertDevPath, DEV_ROOT, USER_ROOT } from './paths.mjs';
import { crc32, makeCharacterPng } from './png.mjs';
import { CHARACTERS, GLOBAL_REGEX, SCOPED_REGEX, THEME, BIG_COUNT, makeCard, makeSmallChats, makeGroup, makeGroupMessages } from './data.mjs';

/** 既验证 PNG 文件格式，也验证数据覆盖范围；已生成样本时流式复核所有文件。 */
export async function testFixtures() {
    const results = [];
    async function test(name, run) { await run(); results.push({ name, passed: true }); }
    const chats = makeSmallChats();
    await test('三个独立虚构角色与有效 PNG 卡片（CRC、像素、chara 元数据）', () => {
        assert.equal(new Set(CHARACTERS.map(character => character.avatar)).size, 3);
        for (const character of CHARACTERS) {
            const card = makeCard(character);
            const png = makeCharacterPng(card, character.color);
            assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
            const chunks = [];
            for (let offset = 8; offset < png.length;) {
                const length = png.readUInt32BE(offset);
                const type = png.toString('ascii', offset + 4, offset + 8);
                const data = png.subarray(offset + 8, offset + 8 + length);
                assert.equal(crc32(png.subarray(offset + 4, offset + 8 + length)), png.readUInt32BE(offset + 8 + length));
                chunks.push({ type, data }); offset += length + 12;
            }
            assert.equal(inflateSync(chunks.find(chunk => chunk.type === 'IDAT').data).length, 128 * (128 * 4 + 1));
            const text = chunks.find(chunk => chunk.type === 'tEXt').data.toString('ascii');
            assert.equal(text.split('\0')[0], 'chara');
            assert.deepEqual(JSON.parse(Buffer.from(text.split('\0')[1], 'base64')), card);
            assert.equal(chunks.at(-1).type, 'IEND');
        }
    });
    await test('3 / 4 / 5 个 swipe 各有独立思维链、日期、时长，mes 对应当前候选', () => {
        const messages = chats[0].messages.filter(message => message.swipes);
        assert.deepEqual(messages.map(message => message.swipes.length), [3, 4, 5]);
        for (const message of messages) {
            assert.equal(message.mes, message.swipes[message.swipe_id]);
            assert.equal(new Set(message.swipe_info.map(info => info.extra.reasoning)).size, message.swipes.length);
            assert.ok(message.swipe_info.every(info => info.send_date && info.extra.reasoning_duration > 0));
        }
    });
    await test('三种代码、HTML、至少两万字长楼与思维链缺失边界', () => {
        const text = chats[1].messages.map(message => message.mes).join('\n');
        for (const language of ['javascript', 'python', 'css']) assert.ok(text.includes(`\`\`\`${language}`));
        assert.match(text, /<q>.*<\/q>/);
        assert.ok(chats[1].messages[3].mes.length >= 20000);
        const edge = chats[1].messages[5];
        assert.equal(edge.swipe_info[0].extra.reasoning, undefined);
        assert.equal(edge.swipe_info[1].extra.reasoning, undefined);
        assert.ok(edge.extra.reasoning);
        assert.equal(chats[1].messages[4].swipes, undefined);
    });
    await test('群聊三成员、独立 chat_id 与无 header 的有效消息行', () => {
        const group = makeGroup();
        assert.deepEqual(group.members, CHARACTERS.map(character => character.avatar));
        assert.notEqual(group.id, group.chat_id);
        assert.equal(group.chats[0], group.chat_id);
        const messages = makeGroupMessages();
        assert.ok(messages.every(message => typeof message.mes === 'string'));
        assert.ok(messages.slice(1).every(message => group.members.includes(message.original_avatar)));
    });
    await test('显示正则涵盖宏、深度、只跑一次、思维链和角色作用域', () => {
        // 词法检查先于文件访问；仅传入字符串验证拒绝，不访问这些路径。
        for (const outside of ['C:\\stcr-test', 'F:\\stcr-test', 'E:\\st-reader\\.dev\\..\\outside']) {
            assert.throws(() => assertDevPath(outside), /只允许使用/);
        }
        assert.ok(GLOBAL_REGEX.filter(script => !script.disabled).length >= 3);
        assert.ok(GLOBAL_REGEX.every(script => script.markdownOnly && !script.promptOnly));
        assert.ok(GLOBAL_REGEX.some(script => script.replaceString.includes('{{char}}')));
        assert.ok(GLOBAL_REGEX.some(script => script.minDepth === 0 && script.maxDepth === 2));
        const once = GLOBAL_REGEX.find(script => script.id.endsWith('once'));
        const expression = new RegExp(once.findRegex.slice(1, -2), 'g');
        const first = '【一次】'.replace(expression, once.replaceString);
        assert.notEqual(first.replace(expression, once.replaceString), first);
        assert.equal(makeCard(CHARACTERS[0]).data.extensions.regex_scripts.length, SCOPED_REGEX.length);
        assert.equal(makeCard(CHARACTERS[1]).data.extensions.regex_scripts.length, 0);
        assert.match(THEME.custom_css, /#chat \.mes_text q/);
        assert.match(THEME.custom_css, /!important/);
        assert.ok(THEME.chat_width > 0 && THEME.chat_width <= 100, '宿主聊天宽度单位是 vw');
    });
    const manifestPath = assertDevPath(path.join(DEV_ROOT, 'fixtures', 'manifest.json'));
    if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath));
        await test('所有落盘 fixture 大小与 SHA-256 一致（流式检查）', async () => {
            for (const file of manifest.files) {
                const target = assertDevPath(path.join(USER_ROOT, file.path));
                const hash = createHash('sha256');
                for await (const piece of fs.createReadStream(target)) hash.update(piece);
                assert.equal(fs.statSync(target).size, file.bytes, file.path);
                assert.equal(hash.digest('hex'), file.sha256, file.path);
            }
        });
        await test('大文件至少 20 MiB、1600 楼，逐行 JSON 完整可解析', async () => {
            const big = manifest.files.find(file => file.path.includes('STCR-90-'));
            assert.ok(big.bytes >= 20 * 1024 * 1024);
            let rows = 0;
            const stream = fs.createReadStream(assertDevPath(path.join(USER_ROOT, big.path)));
            for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
                const record = JSON.parse(line);
                assert.ok(rows === 0 ? record.chat_metadata?.stcr_fixture : record.mes);
                rows++;
            }
            assert.equal(rows, BIG_COUNT + 1);
        });
        await test('开发设置已合并全局脚本、角色允许名单和主题', () => {
            const settings = JSON.parse(fs.readFileSync(assertDevPath(path.join(USER_ROOT, 'settings.json'))));
            const ext = settings.extension_settings;
            for (const regex of GLOBAL_REGEX) assert.equal(ext.regex.filter(script => script.id === regex.id).length, 1);
            assert.ok(ext.character_allowed_regex.includes(CHARACTERS[0].avatar));
            assert.equal(settings.power_user.theme, THEME.name);
        });
    }
    return results;
}
