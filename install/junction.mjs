import { win32 } from 'node:path';

// 路径固定；本模块不打开文件系统，只有人类启动入口才传入真实 fs。
export const LINK_PATH = 'F:\\Claude\\xinllm\\SillyTavern\\data\\default-user\\extensions\\st-reader';
export const SOURCE_PATH = 'E:\\st-reader\\extension';

/** 仅操作指定目录项；注入 fs 让自测可用内存替身，不访问真实数据。 */
export function changeJunction(action, fs) {
    if (!['link', 'unlink'].includes(action)) throw new Error('操作必须是 link 或 unlink。');
    let item;
    try { item = fs.lstatSync(LINK_PATH); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (action === 'link') {
        if (item) throw new Error('目标已存在，未覆盖、未删除：' + LINK_PATH);
        try { fs.symlinkSync(SOURCE_PATH, LINK_PATH, 'junction'); }
        catch (error) {
            if (error.code === 'ENOENT') throw new Error('建立联接失败：Windows 找不到指定路径。请确认真实 ST 位于约定路径，且 data\\default-user\\extensions 父目录已存在。脚本不会创建父目录。', { cause: error });
            if (error.code === 'EEXIST') throw new Error('目标已存在，未覆盖、未删除：' + LINK_PATH, { cause: error });
            throw error;
        }
        return '目录联接已建立。请启动真实 ST，在扩展面板查看 阅读器 (ST Reader)。';
    }
    if (!item) return '联接不存在，无需卸载。';
    if (!item.isSymbolicLink()) throw new Error('目标不是联接，已停止；不会删除普通文件夹。');
    if (win32.resolve(fs.readlinkSync(LINK_PATH)).toLowerCase() !== win32.resolve(SOURCE_PATH).toLowerCase()) {
        throw new Error('联接指向其他位置，已停止。');
    }
    fs.unlinkSync(LINK_PATH);
    return '已移除联接。E 盘扩展文件及聊天均保留，请重新启动 ST。';
}
