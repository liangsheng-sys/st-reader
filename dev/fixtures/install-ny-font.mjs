// ST Reader — AGPL-3.0
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertDevPath, writeDevFile, requireServerStopped, DEV_ROOT } from './paths.mjs';

// 固定上游提交及 Git blob 校验值；只安装开发兼容性扩展，不把第三方代码打包进阅读器。
const lock = JSON.parse(fs.readFileSync(new URL('./dependencies.lock.json', import.meta.url), 'utf8'));
const MAX_BYTES = 5_000_000;
function verify(bytes, file) {
    const gitBlob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (bytes.length !== file.size || gitBlob !== file.gitBlob) throw new Error(`文件大小或校验值不匹配：${file.target}`);
}

try {
    if (process.argv.length > 2) throw new Error('安装器不接受替代路径或其他参数。');
    await requireServerStopped();
    let downloaded = 0;
    for (const file of lock.files) {
        if (file.size > MAX_BYTES || new URL(file.url).hostname !== 'raw.githubusercontent.com') throw new Error('下载源或体积不符合开发规则。');
        const target = assertDevPath(path.join(DEV_ROOT, file.target));
        if (fs.existsSync(target)) {
            verify(fs.readFileSync(target), file);
            continue;
        }
        const response = await fetch(file.url, { signal: AbortSignal.timeout(45_000), redirect: 'error' });
        if (!response.ok) throw new Error(`下载失败 ${response.status}：${file.target}`);
        if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('响应超过 5 MB，已停止。');
        const chunks = [];
        let length = 0;
        for await (const chunk of response.body) {
            length += chunk.length;
            if (length > MAX_BYTES || length > file.size) throw new Error('实际下载超过声明大小，已停止。');
            chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        verify(bytes, file);
        writeDevFile(target, bytes);
        downloaded += length;
    }
    console.log(`[st-reader] Ny-font-manager ${lock.nyVersion} 与本地测试字体安装/校验完成。本次下载 ${downloaded} 字节。`);
    console.log('[st-reader] 字体位置：E:\\st-reader\\.dev\\fixtures\\fonts\\JetBrainsMono.ttf；需在浏览器 Ny 字体管理器中导入。');
} catch (error) {
    console.error(`[st-reader] 安装失败：${error.message}`);
    process.exitCode = 1;
}
