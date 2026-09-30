// ST Reader — AGPL-3.0
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

export const PROJECT_ROOT = 'E:\\st-reader';
export const DEV_ROOT = path.join(PROJECT_ROOT, '.dev');
export const DATA_ROOT = path.join(DEV_ROOT, 'data');
export const USER_ROOT = path.join(DATA_ROOT, 'default-user');

/** 核对固定开发路径及每一级目录，不跟随未知联接，不触碰真实实例。 */
export function assertDevPath(target) {
    const absolute = path.resolve(target);
    const relative = path.relative(DEV_ROOT, absolute);
    if (process.platform !== 'win32' || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`只允许使用 ${DEV_ROOT} 内的开发文件。`);
    }
    let current = PROJECT_ROOT;
    for (const part of ['', ...path.relative(PROJECT_ROOT, absolute).split(path.sep)].filter((part, index) => part || !index)) {
        if (part) current = path.join(current, part);
        let stat;
        try { stat = fs.lstatSync(current); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) throw new Error(`拒绝联接或硬链接路径：${current}`);
    }
    return absolute;
}

export function ensureDevDirectory(target) {
    fs.mkdirSync(assertDevPath(target), { recursive: true });
}

export function writeDevFile(target, content) {
    const absolute = assertDevPath(target);
    ensureDevDirectory(path.dirname(absolute));
    fs.writeFileSync(absolute, content);
}

/** 避免离线生成器与正在运行的 ST 同时改开发设置。 */
export async function requireServerStopped() {
    await new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', () => reject(new Error('请先在开发实例黑窗口按 Ctrl+C 停止服务，再生成数据或安装字体扩展。')));
        probe.listen({ host: '127.0.0.1', port: 8100, exclusive: true }, () => probe.close(resolve));
    });
}
