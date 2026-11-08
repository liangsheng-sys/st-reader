// ST Reader — AGPL-3.0
// T90（I061）：模仿社区卡结构的"重楼"样本。每楼 = 两三段散文 + 带 <style>（@keyframes、渐变）和三个 <details> 的状态栏盒
// + 一张 2–4 KB 的 data: PNG + 一处【称呼】（GLOBAL_REGEX 显示正则会命中）。第 240 楼更长。全部虚构文本。
// 单独运行（停服后）：node dev/fixtures/heavy.mjs —— 只写这一个聊天并更新 .dev/fixtures/manifest.json 里它那一条。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { assertDevPath, ensureDevDirectory, writeDevFile, requireServerStopped, DEV_ROOT, USER_ROOT } from './paths.mjs';
import { crc32 } from './png.mjs';
import { CHARACTERS, makeHeader, makeMessage } from './data.mjs';

export const HEAVY_CHAT = 'STCR-96-重楼-240楼';
export const HEAVY_COUNT = 240;
export const HEAVY_RELATIVE = `chats/${path.parse(CHARACTERS[2].avatar).name}/${HEAVY_CHAT}.jsonl`;

function chunk(type, data) {
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length);
    result.write(type, 4, 'ascii');
    data.copy(result, 8);
    result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
    return result;
}
/** 32×32 RGB 噪点小图（压不小，约 3 KB），按楼号换种子，每楼不同。 */
export function noisePng(seed) {
    const size = 32, row = size * 3 + 1, pixels = Buffer.alloc(row * size);
    let state = (seed * 2654435761) >>> 0 || 1;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size * 3; x++) {
            state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0;
            pixels[y * row + 1 + x] = 90 + (state & 0x7f);
        }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

const PLACES = ['雾岛东岸', '纸港口', '灯塔下层', '星河渡口', '钟塔背面', '蓝邮局', '无名河湾', '观测站屋顶'];
const WEATHER = ['东风二级', '薄雾', '细雨', '晴，云很高', '潮位偏低', '星光很亮'];
// 社区状态栏常见写法：每楼同一段 <style>（动画 + 渐变），盒里三个折叠块。
const STATUS_STYLE = `<style>
@keyframes stcr-heavy-glow { 0% { box-shadow: 0 0 0 rgba(255, 214, 140, 0); } 50% { box-shadow: 0 0 12px rgba(255, 214, 140, .55); } 100% { box-shadow: 0 0 0 rgba(255, 214, 140, 0); } }
@keyframes stcr-heavy-drift { from { background-position: 0 0; } to { background-position: 120px 0; } }
.stcr-heavy-box { margin: 10px 0; padding: 12px 16px; border-radius: 14px; color: #f3ead8; border: 1px solid rgba(255, 214, 140, .4);
  background: linear-gradient(135deg, #24343c 0%, #3a4f57 45%, #5b4a3a 100%); animation: stcr-heavy-glow 3s ease-in-out infinite; }
.stcr-heavy-box .bar { height: 6px; border-radius: 3px; margin: 6px 0 10px; background: repeating-linear-gradient(90deg, #ffd68c 0 10px, #e8a95b 10px 20px); animation: stcr-heavy-drift 4s linear infinite; }
.stcr-heavy-box summary { cursor: pointer; font-weight: bold; color: #ffd68c; }
.stcr-heavy-box details { margin: 4px 0; padding: 4px 8px; border-radius: 8px; background: rgba(0, 0, 0, .18); }
.stcr-heavy-box img { float: right; width: 48px; height: 48px; border-radius: 8px; image-rendering: pixelated; }
</style>`;

function prose(index) {
    const place = PLACES[index % PLACES.length], weather = WEATHER[index % WEATHER.length];
    const paragraphs = [
        `第 ${index + 1} 楼。雾岚沿着${place}慢慢走，手里的灯笼照出一小圈暖黄。“今天的记录还没写完。”她说着，把被风吹乱的纸页按回本子里。河面上漂着几只纸船，船头都插着一根细细的芦苇。`,
        `测试旅人跟在后面，数着脚下的石阶。远处钟塔敲了${(index % 12) + 1}下，声音被雾吞掉一半。他们在一块平整的石头上坐下，雾岚翻开本子，用铅笔在页边画了一颗小星星。这一段只是虚构的散文，用来模拟社区长楼的正文。`,
        `【称呼】 ${index % 3 === 0 ? '“明天还来吗？”“来。”' : '风小了一点，灯笼的影子安静下来。'}`,
    ];
    return paragraphs.join('\n\n');
}
function statusBox(index) {
    const png = noisePng(index + 1).toString('base64');
    return `${STATUS_STYLE}
<div class="stcr-heavy-box"><img src="data:image/png;base64,${png}" alt="">
<strong>雾岛观测 · 第 ${index + 1} 天（虚构）</strong>
<div class="bar"></div>
<details><summary>天气</summary>${WEATHER[index % WEATHER.length]}，能见度 ${200 + (index * 37) % 800} 米。</details>
<details><summary>地点</summary>${PLACES[index % PLACES.length]}，灯塔 ${index % 2 ? '运转中' : '待检修'}。</details>
<details><summary>心情</summary>雾岚：平静 ${(index * 7) % 100}%；测试旅人：好奇 ${(index * 13) % 100}%。</details>
</div>`;
}

export function* makeHeavyMessages() {
    for (let index = 0; index < HEAVY_COUNT; index++) {
        let text = `${prose(index)}\n\n${statusBox(index)}`;
        if (index === HEAVY_COUNT - 1) text += `\n\n${Array.from({ length: 12 }, (_, n) => `尾声第 ${n + 1} 段。雾散的那天早上，灯塔第一次在白天亮了一下，像是在和谁打招呼。雾岚把最后一页撕下来折成纸船，放进河里，看它慢慢漂远。这是完全虚构的结局。`).join('\n\n')}`;
        yield makeMessage(CHARACTERS[2].name, text, index);
    }
}

/** 写聊天文件，返回清单条目 {path, bytes, sha256}。 */
export function writeHeavyChat() {
    const target = assertDevPath(path.join(USER_ROOT, HEAVY_RELATIVE));
    ensureDevDirectory(path.dirname(target));
    const hash = createHash('sha256'), fd = fs.openSync(target, 'w');
    let bytes = 0;
    try {
        for (const row of [makeHeader(CHARACTERS[2], HEAVY_CHAT), ...makeHeavyMessages()]) {
            const line = Buffer.from(`${JSON.stringify(row)}\n`);
            fs.writeFileSync(fd, line); hash.update(line); bytes += line.length;
        }
    } finally { fs.closeSync(fd); }
    return { path: HEAVY_RELATIVE.replaceAll('\\', '/'), bytes, sha256: hash.digest('hex') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        if (process.argv.length > 2) throw new Error('不接受替代路径或参数');
        await requireServerStopped();
        const entry = writeHeavyChat();
        const manifestPath = assertDevPath(path.join(DEV_ROOT, 'fixtures', 'manifest.json'));
        if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            manifest.files = [...manifest.files.filter(file => file.path !== entry.path), entry];
            writeDevFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        }
        console.log(`已生成 ${HEAVY_COUNT} 楼重楼样本 ${(entry.bytes / 1024).toFixed(0)} KB：${HEAVY_RELATIVE}`);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
