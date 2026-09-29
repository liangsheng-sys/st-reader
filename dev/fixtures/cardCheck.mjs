import assert from 'node:assert/strict';
import { crc32 } from './png.mjs';

/** 宿主会重编码 PNG、补默认字段和当前 chat；只核对影响样本身份/正则的关键 JSON。 */
export function assertCharacterFixture(png, expected) {
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], '不是 PNG');
    const cards = [];
    for (let offset = 8; offset < png.length;) {
        assert.ok(offset + 12 <= png.length, 'PNG 块不完整');
        const length = png.readUInt32BE(offset), end = offset + 8 + length;
        assert.ok(end + 4 <= png.length, 'PNG 块越界');
        const type = png.toString('ascii', offset + 4, offset + 8);
        assert.equal(crc32(png.subarray(offset + 4, end)), png.readUInt32BE(end), 'PNG CRC 错误');
        if (type === 'tEXt') {
            const text = png.toString('ascii', offset + 8, end), split = text.indexOf('\0');
            if (['chara', 'ccv3'].includes(text.slice(0, split))) cards.push(JSON.parse(Buffer.from(text.slice(split + 1), 'base64')));
        }
        offset = end + 4;
    }
    assert.ok(cards.length, 'PNG 缺少角色 JSON');
    for (const card of cards) {
        for (const key of ['name', 'description', 'creator', 'character_version']) assert.equal(card.data?.[key], expected.data[key], `角色关键字段 data.${key}`);
        assert.equal(card.data?.extensions?.stcr_fixture, expected.data.extensions.stcr_fixture, '合成数据身份');
        assert.deepEqual(card.data?.extensions?.regex_scripts, expected.data.extensions.regex_scripts, '角色作用域正则');
    }
}
