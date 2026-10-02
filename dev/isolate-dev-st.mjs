// ST Reader — AGPL-3.0
import { PUBLIC_DIRECTORIES } from 'file:///F:/Claude/xinllm/SillyTavern/src/constants.js';
import express from 'file:///F:/Claude/xinllm/SillyTavern/node_modules/express/index.js';

// 仅调整当前开发进程的内存常量，不改写宿主源码。
// ST 的“管理扩展”会对全局扩展检查 Git 更新，必须隔离整个目录，不能只禁用前端脚本。
const args = process.argv;
if (args[args.indexOf('--dataRoot') + 1] !== 'E:\\st-reader\\.dev\\data'
    || args[args.indexOf('--configPath') + 1] !== 'E:\\st-reader\\.dev\\config.yaml') {
    throw new Error('开发隔离模块只能配合固定的 .dev 数据与配置路径使用。');
}
PUBLIC_DIRECTORIES.globalExtensions = 'E:\\st-reader\\.dev\\global-extensions';
PUBLIC_DIRECTORIES.backups = 'E:\\st-reader\\.dev\\program-backups';

// ST 先挂 public 静态路由，再挂用户扩展路由。宿主 public 下若有同名旧副本，
// 会越过上面的 globalExtensions 隔离并遮蔽开发联接。仅在本开发进程跳过该前缀，
// 让 ST 自己的后续扩展路由从 .dev 用户/全局目录读取；不改宿主文件，不复制其数据。
const serveStatic = express.static;
express.static = function (root, options) {
    const middleware = serveStatic(root, options);
    return (req, res, next) => {
        // T54a：此进程里的阅读器是工作目录联接，禁止更新服务对它做 Git fetch/pull。
        // 只标记自身 manifest；正式 ST 不载入这个预载模块，不受影响。
        if (req.path === '/scripts/extensions/third-party/st-reader/manifest.json') res.setHeader('X-STCR-Dev-Directory', '1');
        return /^\/scripts\/extensions\/third-party(?:\/|$)/i.test(req.path) ? next() : middleware(req, res, next);
    };
};
