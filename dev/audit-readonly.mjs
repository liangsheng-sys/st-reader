// ST Reader — AGPL-3.0
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 全仓库逐行扫描，包含文档/开发工具/测试；分类展示命中，不能把防护清单误报成写调用。
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const isExtensionFile = file => /^(?:manifest\.json|index\.js|style\.css|LICENSE)$/.test(file) || /^(?:src|vendor)\//.test(file);
const patterns = {
    forbiddenPaths: /\/api\/chats\/(?:save|rename|delete|import|group\/(?:save|delete|import))\b/,
    forbiddenCalls: /\b(?:saveChat|deleteMessage|deleteLastMessage|renameChat|clearChat|addOneMessage|updateChatMetadata|saveMetadata)\s*\(/,
    hostWrites: /(?:swipe_id|chatMetadata|chat_metadata)\s*(?:=(?!=)|\+=|\?\?=)|getContext\(\)\.chat.*(?:=(?!=)|\.push\(|\.splice\()/,
    network: /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|https?:\/\/|@import/,
};
const report = Object.fromEntries(Object.keys(patterns).map(key => [key, []]));
let bytes = 0;
for (const file of files) {
    if (isExtensionFile(file)) bytes += fs.statSync(path.join(root, file)).size;
    if (!/\.(?:js|mjs|json|css|html|md|cmd|yaml)$/.test(file)) continue;
    const lines = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => { for (const [kind, expression] of Object.entries(patterns)) if (expression.test(line)) report[kind].push(`${file}:${index + 1}`); });
}
let failed = false;
for (const [kind, hits] of Object.entries(report)) {
    console.log(`${kind}：全仓库 ${hits.length} 行`);
    const extension = hits.filter(line => isExtensionFile(line.split(':')[0]));
    console.log(`  扩展运行文件：${extension.length} 行${extension.length ? '\n  ' + extension.join('\n  ') : ''}`);
    if (kind === 'forbiddenPaths') failed ||= extension.some(line => !line.startsWith('src/core/readonlyGuard.js:'));
    if (kind === 'forbiddenCalls' || kind === 'hostWrites') failed ||= extension.length > 0;
}
const trackedData = execFileSync('git', ['ls-files', '.dev', '.tmp', 'docs/*.png'], { cwd: root, encoding: 'utf8' }).trim();
console.log(`扩展运行文件总体积（含 LICENSE）：${bytes} 字节；.dev/.tmp/docs/*.png 已跟踪文件：${trackedData || '0'}`);
failed ||= Boolean(trackedData) || bytes >= 3 * 1024 * 1024;
console.log('network 命中须人工复核：命名空间、拒绝示例、自测与 vendor 通用 fetch 不是实际出站请求。');
console.log(failed ? '静态边界检查失败。' : '静态边界检查通过；配合浏览器请求审计与导出零 fetch 测试。');
process.exitCode = failed ? 1 : 0;
