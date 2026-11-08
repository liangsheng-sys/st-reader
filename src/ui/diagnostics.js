// ST Reader — AGPL-3.0
// T90（I061）：最近一次打开聊天的分段耗时。只在内存，只有数字：楼数、字节、毫秒、次数。
// 不记任何正文、名字、文件名（复制出去发给作者也不泄露聊天）。Aa → ⋯ → 诊断 显示并复制；首屏后 console.info 一行。

let last = null;

/** 记下一次打开。fields 只收数字 / 布尔 / 固定枚举（summary）；别的一概丢掉。 */
export function recordOpen(fields) {
    const clean = {};
    for (const [key, value] of Object.entries(fields)) {
        if (typeof value === 'number' && Number.isFinite(value)) clean[key] = Math.round(value);
        else if (typeof value === 'boolean') clean[key] = value;
        else if (key === 'summary' && ['listed', 'deferred', 'request'].includes(value)) clean[key] = value;
        else if (key === 'fileSize' && typeof value === 'string' && /^[\d.,]+\s*[a-zA-Z]{0,3}$/.test(value.trim())) clean[key] = value.trim();
    }
    last = { at: new Date(), ...clean };
    return last;
}
/** 补摘要等后来的数字（同样只收数字）。 */
export function patchOpen(fields) {
    if (!last) return;
    for (const [key, value] of Object.entries(fields)) {
        if (typeof value === 'number' && Number.isFinite(value)) last[key] = Math.round(value);
        else if (key === 'fileSize' && typeof value === 'string' && /^[\d.,]+\s*[a-zA-Z]{0,3}$/.test(value.trim())) last[key] = value.trim();
    }
}
export const lastOpen = () => last;

const ms = value => (Number.isFinite(value) ? `${value} ms` : '—');
const pad = n => String(n).padStart(2, '0');
const SUMMARY = { listed: '跳过（抽屉刚列过）', deferred: '首屏后补查', request: '打开前查' };

/** 一行短的：Aa 里"诊断"那一行显示。 */
export function diagnosticsLine(open = last) {
    if (!open) return '还没打开过聊天';
    return `上次打开 ${open.totalMs !== undefined ? `${(open.totalMs / 1000).toFixed(open.totalMs < 10000 ? 2 : 1)} 秒` : '—'} · ${open.floors ?? '?'} 楼${open.cacheHit ? ' · 缓存' : ''}`;
}

/** 复制给作者的纯文本。env：{version, ua, width, height, dpr, backupBytes, mirrorMs, mirrorState}。 */
export function diagnosticsText(open = last, env = {}) {
    const lines = ['ST Reader 诊断信息（只有数字，不含聊天正文、名字和文件名）',
        `阅读器版本：${env.version ?? '未知'}`, `浏览器：${env.ua ?? '未知'}`,
        `窗口：${env.width ?? '?'}×${env.height ?? '?'}（缩放 ${env.dpr ?? 1}）`];
    if (!open) lines.push('最近一次打开：本页还没打开过聊天');
    else {
        const t = open.at;
        lines.push(`最近一次打开（${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}）`,
            `  从点击到能滚动：${ms(open.totalMs)}`,
            `  阅读器外壳：${ms(open.shellMs)}`,
            `  命中缓存：${open.cacheHit ? '是' : '否'}`);
        if (!open.cacheHit) {
            lines.push(`  读角色卡：${ms(open.cardsMs)}`,
                `  查聊天摘要（ST 扫这个角色的全部聊天）：${SUMMARY[open.summary] ?? '—'}${Number.isFinite(open.summaryMs) ? ` ${open.summaryMs} ms` : ''}`,
                `  等 ST 返回聊天文件：${ms(open.fileMs)}`,
                `  解析与建模型：${ms(open.parseMs)}`);
        }
        lines.push(`  读批注与收藏：${ms(open.marksMs)}`,
            `  建首批楼层（正则、格式化、样式清洗）：${ms(open.buildMs)}（${open.builtFloors ?? '?'} 楼）`,
            `  首屏排版到能滚动：${ms(open.layoutMs)}`,
            `  首屏时的沙箱：${open.sandboxes ?? 0} 个`,
            `  聊天：${open.floors ?? '?'} 楼${open.fileSize ? ` · ${open.fileSize}` : ''}`);
    }
    lines.push(`备份：${Number.isFinite(env.backupBytes) ? `JSON ${formatSize(env.backupBytes)}` : '还没备份过'}${Number.isFinite(env.mirrorMs) ? ` · 上次镜像 ${env.mirrorMs} ms` : ''}${env.mirrorState ? ` · ${env.mirrorState}` : ''}`);
    return lines.join('\n');
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
}
