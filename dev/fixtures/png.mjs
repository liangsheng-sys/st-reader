// ST Reader — AGPL-3.0
import { deflateSync } from 'node:zlib';

export function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length);
    result.write(type, 4, 'ascii');
    data.copy(result, 8);
    result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
    return result;
}

/** 从零绘制简单几何头像，内嵌 ST 可识别的 chara 元数据，无素材与图片依赖。 */
export function makeCharacterPng(card, color) {
    const size = 128;
    const pixels = Buffer.alloc((size * 4 + 1) * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const inCircle = (x - 64) ** 2 + (y - 53) ** 2 < 24 ** 2;
            const inBase = y > 85 && y < 103 && Math.abs(x - 64) < 37;
            const offset = y * (size * 4 + 1) + 1 + x * 4;
            const rgb = inCircle || inBase ? color : [26, 40, 49];
            pixels.set([...rgb, 255], offset);
        }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
        chunk('tEXt', Buffer.from(`chara\0${Buffer.from(JSON.stringify(card)).toString('base64')}`, 'ascii')),
        chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
    ]);
}
