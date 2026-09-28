import { PUBLIC_DIRECTORIES } from 'file:///F:/Claude/xinllm/SillyTavern/src/constants.js';

// 仅调整当前开发进程的内存常量，不改写宿主源码。
// ST 的“管理扩展”会对全局扩展检查 Git 更新，必须隔离整个目录，不能只禁用前端脚本。
const args = process.argv;
if (args[args.indexOf('--dataRoot') + 1] !== 'E:\\st-reader\\.dev\\data'
    || args[args.indexOf('--configPath') + 1] !== 'E:\\st-reader\\.dev\\config.yaml') {
    throw new Error('开发隔离模块只能配合固定的 .dev 数据与配置路径使用。');
}
PUBLIC_DIRECTORIES.globalExtensions = 'E:\\st-reader\\.dev\\global-extensions';
PUBLIC_DIRECTORIES.backups = 'E:\\st-reader\\.dev\\program-backups';
