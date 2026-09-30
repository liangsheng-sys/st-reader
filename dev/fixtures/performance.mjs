// ST Reader — AGPL-3.0
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertDevPath, ensureDevDirectory, writeDevFile, requireServerStopped, DEV_ROOT, USER_ROOT } from './paths.mjs';
import { CHARACTERS, makeHeader, makeMessage } from './data.mjs';

export const PERFORMANCE_CHAT = 'STCR-95-T30-50MiB-4000楼';
export const PERFORMANCE_COUNT = 4000;

/** 单独生成大文件，不重建已有聊天、角色卡或设置。数据与校验清单均留在 .dev。 */
export async function generatePerformanceFixture() {
    await requireServerStopped();
    const relative = `chats/STCR_T11_Mist/${PERFORMANCE_CHAT}.jsonl`;
    const target = assertDevPath(path.join(USER_ROOT, relative));
    ensureDevDirectory(path.dirname(target));
    const hash = createHash('sha256'), fd = fs.openSync(target, 'w');
    let bytes = 0;
    const write = value => { const line = Buffer.from(`${JSON.stringify(value)}\n`); fs.writeFileSync(fd, line); hash.update(line); bytes += line.length; };
    try {
        write(makeHeader(CHARACTERS[2], PERFORMANCE_CHAT));
        const phrase = '虚构档案中的雾岛没有真实地址，纸舟沿星河记录彩色灯塔，每一页都只是合成测试文本。';
        const body = phrase.repeat(Math.ceil(4600 / phrase.length)).slice(0, 4600);
        for (let index = 0; index < PERFORMANCE_COUNT; index++) write(makeMessage(CHARACTERS[2].name, `T30 大文件第 ${index + 1}/${PERFORMANCE_COUNT} 楼\n${body}\n【一次】`, index));
    } finally { fs.closeSync(fd); }
    if (bytes < 50 * 1024 * 1024) throw new Error('性能样本不足 50 MiB');
    const report = { synthetic: true, path: relative, fileName: PERFORMANCE_CHAT, count: PERFORMANCE_COUNT, bytes, sha256: hash.digest('hex') };
    writeDevFile(path.join(DEV_ROOT, 'fixtures', 'performance.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`已生成 ${(bytes / 1048576).toFixed(2)} MiB / ${PERFORMANCE_COUNT} 楼：${target}`);
    return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { if (process.argv.length > 2) throw new Error('不接受替代路径或参数'); await generatePerformanceFixture(); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
