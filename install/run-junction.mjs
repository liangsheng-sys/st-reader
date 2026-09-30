// ST Reader — AGPL-3.0
import fs from 'node:fs';
import { changeJunction, LINK_PATH, SOURCE_PATH } from './junction.mjs';

// 唯一真实文件系统入口：只由人类双击 cmd 调用，AI 不运行。
console.log('[ST Reader] 安装程序已启动（2026-09-30）。');
console.log('联接位置：' + LINK_PATH);
console.log('扩展位置：' + SOURCE_PATH);
try { console.log(changeJunction(process.argv[2], fs)); }
catch (error) {
    console.error('未完成：' + error.message);
    const cause = error.cause ?? error;
    if (cause.code) console.error('系统错误：' + cause.code + ' / ' + cause.message);
    process.exitCode = 1;
}
