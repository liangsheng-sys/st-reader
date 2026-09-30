// ST Reader — AGPL-3.0
// 导出 / 导入 JSON 备份（02 §1.8、F7/F8）。数据来自 T13 store.exportAll / previewImport / importAll（03 §5.5）。
// 导出是浏览器本地生成文件（blob:），不发任何网络请求（NF3）。

import { store } from '../core/store.js';
import { h } from './dom.js';

const LABELS = { annotations: '划线与批注', bookmarks: '收藏', maskWords: '屏蔽词', settings: '阅读设置与进度', replaceRules: '替换规则', assets: '图片' };
const REMIND_DAYS = 14;

const pad = n => String(n).padStart(2, '0');

/** 生成备份文件并交给浏览器下载。 */
export async function exportBackup(root) {
    const json = await store.exportAll();
    const now = new Date();
    const name = `st-reader-备份-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = h('a', { href: url, download: name, class: 'stcr-offscreen' });
    root.append(link); // 放在阅读器里：点击事件不冒泡到 ST
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return name;
}

/** "上次导出：3 天前" 与是否该提醒（有数据且 14 天没导出）。 */
export async function backupStatus(now = Date.now()) {
    const info = await store.info();
    const { counts } = info;
    const hasData = counts.annotations + counts.bookmarks + counts.maskWords + counts.replaceRules + counts.assets > 0;
    const last = info.lastExportAt ? Date.parse(info.lastExportAt) : null;
    const days = last === null ? null : Math.floor((now - last) / 86400000);
    const text = last === null ? '还没导出过' : days <= 0 ? '上次导出：今天' : `上次导出：${days} 天前`;
    return { text, remind: hasData && (days === null || days >= REMIND_DAYS), counts };
}

export function describeStoreError(error) {
    switch (error?.code) {
        case 'INVALID_BACKUP': return '这不是阅读器的备份文件，或者文件已损坏。';
        case 'BACKUP_TOO_LARGE': return '备份文件太大（超过 24 MB）。';
        case 'ASSET_CONFLICT': return '备份里有和现有图片同名但内容不同的图片。为免替换掉你现在的图片，这次没有导入。';
        case 'MISSING_ASSET': return '备份里的替换规则引用了不存在的图片，文件可能不完整。';
        case 'ASSET_LIMIT': return '合并后图片会超过 30 张的上限。';
        case 'UNAVAILABLE': return '浏览器存储用不了（可能是无痕模式或空间已满）。';
        default: return String(error?.message ?? error);
    }
}

/**
 * 选文件 → 预览数量 → 确认后合并。重复的跳过，现有内容不覆盖。
 * @param {{root:HTMLElement, confirm:(content:HTMLElement, ok:string)=>Promise<boolean>, toast:(m:string)=>void, onImported:()=>void}} deps
 */
export function pickAndImport({ root, confirm, toast, onImported }) {
    const input = h('input', { type: 'file', accept: '.json,application/json', class: 'stcr-offscreen' });
    root.append(input);
    input.addEventListener('cancel', () => input.remove());
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;
        try {
            const text = await file.text();
            const report = await store.previewImport(text);
            const rows = Object.entries(LABELS).map(([key, label]) => ({ label, added: report[key]?.added ?? 0, skipped: report[key]?.skipped ?? 0 }));
            const total = rows.reduce((sum, row) => sum + row.added, 0);
            if (!total) { toast('这份备份里的内容你都已经有了，没有需要导入的。'); return; }
            const content = h('div', { class: 'stcr-import-preview' },
                h('h3', { text: '导入备份' }),
                h('p', { text: `文件：${file.name}` }),
                h('ul', {}, ...rows.filter(row => row.added || row.skipped).map(row =>
                    h('li', { text: `${row.label}：新增 ${row.added} 条${row.skipped ? `，重复跳过 ${row.skipped} 条` : ''}` }))),
                h('p', { class: 'stcr-import-hint', text: '只会合并进来，你现有的划线、批注、收藏不会被覆盖或删除。不会动任何聊天。' }));
            if (!await confirm(content, '合并导入')) return;
            const result = await store.importAll(text);
            const added = Object.values(result).reduce((sum, item) => sum + (item?.added ?? 0), 0);
            toast(`导入完成，新增 ${added} 条`);
            onImported();
        } catch (error) {
            console.error('[st-reader] 导入失败：', error);
            toast(`导入失败：${describeStoreError(error)}`);
        }
    });
    input.click();
}
