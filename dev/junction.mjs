// ST Reader — AGPL-3.0
import { win32 } from 'node:path';

const projectRoot = 'E:\\st-reader';
const junctionPath = 'E:\\st-reader\\.dev\\data\\default-user\\extensions\\st-reader';
const legacyRoot = win32.join(projectRoot, 'extension');
const normalize = value => win32.resolve(value).toLowerCase();

/** 启动器先检查父目录；这里只操作固定的开发联接，不跟随目标读取文件。 */
export function prepareDevJunction(fs) {
    let item;
    try { item = fs.lstatSync(junctionPath); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (item) {
        if (!item.isSymbolicLink()) throw new Error(`开发扩展目录不是联接，未覆盖：${junctionPath}`);
        const target = normalize(fs.readlinkSync(junctionPath));
        if (target === normalize(projectRoot)) return '开发扩展联接已指向仓库根。';
        if (target !== normalize(legacyRoot)) throw new Error(`开发扩展联接指向其他位置，未覆盖：${junctionPath}`);
        // 精确核对旧目标后仅 unlink 目录项；不递归删除，即使旧目标已不存在也可迁移。
        fs.unlinkSync(junctionPath);
    }
    fs.symlinkSync(projectRoot, junctionPath, 'junction');
    return item ? '开发扩展旧联接已迁移到仓库根。' : '开发扩展联接已建立，指向仓库根。';
}
