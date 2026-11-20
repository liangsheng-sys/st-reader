// ST Reader — AGPL-3.0
// 阅读器界面自测（T21）。纯 Node 运行，无依赖：node src/ui/ui.test.js
// 1) logic.js 的纯逻辑；2) 静态铁律：src/ui 不直接 fetch、不碰 /api、不写 chat/元信息/swipe_id、不用 ST 按钮类名。

import { alignTexts, cardFileName, filterOwners, OWNER_SORTS, parseStDate, sortOwners, stOwnerSort, cleanHexColor, cleanMaskWord, COLOR_PRESETS, DEFAULT_CARD_PREFS, DEFAULT_PREFS, effectivePrefs, followPlacement, foldRuns, formatListDate, formatStamp, hiddenUserRuns, isFolded, isStHidden,
    isSystemLike, mapOffset, matchesFilter, normalizeCardPrefs, normalizePrefs, parseJumpInput, pickSwipe, previewLine, progressText, pruneProgress,
    reasoningTitle, swipePreviews, wordAt, formatBytes, mirrorStatusText, restoreSummary, faultReport, cardExportReport,
    navCommand, navKeys, FLOOR_KIND, floorKinds, exportCount, exportCountText, exportDoneText } from './logic.js';
import { BUILTIN_TEMPLATES, DEFAULT_OPTIONS, FONT_SIZES, MAX_TEMPLATES, OPTION_KEYS, PADDINGS, PALETTES, addTemplate, checkTemplateCss, countCardChars, derivePalette, formatCardCount, formatCardDate,
    isDefaultOptions, luminance, minContrast, mixHex, normalizeOptions, normalizeTemplates, parseTemplateText, removeTemplate, renameTemplate, resolvePalette, scopeTemplateCss, templateClassScope, templateProblem, templateScope, templateToText, textureLayers, toHex } from './cardTemplates.js';
import { CARD_TEMPLATES } from './logic.js';
import { buildCssGuide, EXAMPLE_TWEET } from './cardCssGuide.js';
import { BUNDLED_LINKS, BUNDLED_TEMPLATES, bundledLinks, seedBundled } from './cardBundled.js';
import { hasRedaction, redactString, replacePieces, setRedactState } from './redact.js';
import { diagnosticsLine, diagnosticsText, hostLine, lastOpen, recordOpen } from './diagnostics.js';

const results = [];
function check(name, fn) {
    try {
        const detail = fn();
        results.push({ name, passed: true, detail: detail ?? '' });
    } catch (error) {
        results.push({ name, passed: false, detail: error?.message ?? String(error) });
    }
}
function equal(actual, expected, label = '') {
    const a = JSON.stringify(actual), b = JSON.stringify(expected);
    if (a !== b) throw new Error(`${label}期望 ${b}，实际 ${a}`);
}

export async function testUiLogic() {
    results.length = 0;
    check('思维链标题：秒、分、0 秒有效、缺失', () => {
        equal(reasoningTitle(12.4), '思考了 12 秒');
        equal(reasoningTitle(0), '思考了 0 秒', '0 秒：');
        equal(reasoningTitle(65), '思考了 1 分 5 秒');
        equal(reasoningTitle(120), '思考了 2 分钟');
        equal(reasoningTitle(null), '思考过程');
        equal(reasoningTitle(-1), '思考过程');
    });
    check('诊断信息（T90）：只有数字；正文、名字、文件名一律进不去', () => {
        equal(diagnosticsLine(null), '还没打开过聊天');
        recordOpen({ totalMs: 1234.4, fileMs: 98.6, cacheHit: false, summary: 'deferred', floors: 240, fileSize: '1412.75kb',
            title: 'STCR-96-重楼-240楼', owner: '雾岚（虚构）', preview: '虚构正文', summaryWeird: '<b>x</b>', chatKey: 'a.png/秘密' });
        const open = lastOpen();
        equal(Object.keys(open).filter(key => key !== 'at').sort(), ['cacheHit', 'fileMs', 'fileSize', 'floors', 'summary', 'totalMs']);
        equal(open.totalMs, 1234); equal(diagnosticsLine(), '上次打开 1.23 秒 · 240 楼');
        const text = diagnosticsText(open, { version: '0.3.2', ua: 'TestBrowser/1', width: 1440, height: 1000, dpr: 1, backupBytes: 2048, mirrorMs: 35, mirrorState: '正常' });
        for (const secret of ['重楼', '雾岚', '虚构正文', '秘密', '<b>']) equal(text.includes(secret), false, `诊断里出现了 ${secret}：`);
        for (const piece of ['从点击到能滚动：1234 ms', '等 ST 返回聊天文件：99 ms', '首屏后补查', '240 楼 · 1412.75kb', '0.3.2', 'TestBrowser/1', '1440×1000', 'JSON 2.0 KB · 上次镜像 35 ms']) equal(text.includes(piece), true, `诊断里缺 ${piece}：`);
        recordOpen({ fileSize: '雾岚 1 KB' }); equal('fileSize' in lastOpen(), false, '文件大小只收数字加单位：');
    });
    check('自动备份状态行（T70）：时间 · 大小；没备份过、出错、不可用各有说法', () => {
        const now = new Date(2026, 9, 21, 12);
        equal(formatBytes(820), '820 B'); equal(formatBytes(36 * 1024), '36 KB'); equal(formatBytes(1.24 * 1024 * 1024), '1.2 MB'); equal(formatBytes(null), '');
        const at = new Date(2026, 9, 21, 9, 30).toISOString();
        equal(mirrorStatusText({ state: 'ok', mirroredAt: at, bytes: 1.2 * 1024 * 1024 }, now).text, '上次自动备份：10-21 09:30 · 1.2 MB');
        equal(mirrorStatusText({ state: 'ok', mirroredAt: new Date(2025, 0, 2, 8, 5).toISOString(), bytes: 900 }, now).text, '上次自动备份：2025-01-02 08:05 · 900 B');
        equal(mirrorStatusText({ state: 'never' }, now).warn, false);
        const failed = mirrorStatusText({ state: 'error', message: 'ST 文件接口不可用', mirroredAt: at, bytes: 2048 }, now);
        equal(failed.text, '上次自动备份：10-21 09:30 · 2 KB；这次没备份成功：ST 文件接口不可用'); equal(failed.warn, true);
        equal(mirrorStatusText({ state: 'error', message: 'ST 文件接口不可用' }, now).text, '这次没备份成功：ST 文件接口不可用');
        equal(mirrorStatusText({ state: 'unavailable', message: 'ST 设置接口不可用' }, now).text.includes('导出'), true);
        equal(restoreSummary({ annotations: { added: 2, updated: 1, kept: 0 }, bookmarks: { added: 1, updated: 0 }, settings: { added: 0, updated: 0 } }), '已从 ST 服务器恢复批注 3 条、收藏 1 条');
        equal(restoreSummary({ annotations: { added: 0, updated: 0 } }), '');
        equal(restoreSummary(null), '');
    });
    check('显示失败报告（T72）：版本、楼号、候选、堆栈；不含正文', () => {
        const error = new TypeError('虚构的格式化错误'); error.stack = 'TypeError: 虚构的格式化错误\n    at fillRendered (floorToolbar.js:60:5)';
        const text = faultReport({ index: 6, swipe: 1, total: 2, error }, '0.2.1', { now: new Date(Date.UTC(2026, 9, 21, 4)), userAgent: '虚构浏览器/1.0' });
        for (const part of ['版本：v0.2.1', '楼号：第 7 楼，候选 2 / 2', '时间：2026-10-21T04:00:00.000Z', '浏览器：虚构浏览器/1.0', '错误：TypeError: 虚构的格式化错误', 'at fillRendered']) equal(text.includes(part), true);
        equal(text.includes('不含聊天正文'), true);
        const bare = faultReport({ index: 0, swipe: 0, total: 0, error: '只是字符串' }, '', { now: new Date(0), userAgent: '' });
        equal(bare.includes('版本：v未知') && bare.includes('候选 1 / 1') && bare.includes('错误：Error: 只是字符串') && bare.includes('堆栈：（无）'), true);
        equal(faultReport({ index: 0, error: { message: 'x'.repeat(9000), stack: 'y'.repeat(9000) } }, '1').length < 5000, true);
    });
    check('卡片导出诊断（T73）：只有设置、计数与提示，不含正文', () => {
        const text = cardExportReport({ version: '0.2.2', template: '纸张', size: '竖版', mask: '涂黑', floors: 3, styled: 1, warnings: ['有背景图拿不到（bad.invalid），PNG 里用斜纹占位代替'] },
            { now: new Date(Date.UTC(2026, 9, 21, 4)), userAgent: '虚构浏览器/1.0' });
        for (const part of ['不含聊天正文', '版本：v0.2.2', '模板：纸张；尺寸：竖版；遮盖：涂黑', '楼层：3 段，其中 1 段带楼内样式', '- 有背景图拿不到', '浏览器：虚构浏览器/1.0']) equal(text.includes(part), true);
        const bare = cardExportReport({}, { now: new Date(0), userAgent: '' });
        equal(bare.includes('版本：v未知') && bare.includes('（无，或还没导出过）'), true);
    });
    check('楼层时间：同年省略年份，跨年补年份，坏值为空', () => {
        const now = new Date(2026, 8, 28, 12);
        equal(formatStamp(new Date(2026, 8, 27, 21, 4).toISOString(), now), '9月27日 21:04');
        equal(formatStamp(new Date(2025, 0, 2, 8, 0).toISOString(), now), '2025年1月2日 08:00');
        equal(formatStamp(null, now), '');
        equal(formatStamp('坏日期', now), '');
    });
    check('列表日期：今天 / 昨天 / 本年 / 往年', () => {
        const now = new Date(2026, 8, 28, 12);
        equal(formatListDate(new Date(2026, 8, 28, 9, 5).toISOString(), now), '今天 09:05');
        equal(formatListDate(new Date(2026, 8, 27, 23).toISOString(), now), '昨天');
        equal(formatListDate(new Date(2026, 2, 3).toISOString(), now), '3月3日');
        equal(formatListDate(new Date(2024, 11, 31).toISOString(), now), '2024-12-31');
    });
    check('设置：坏值回默认、越界夹紧、步进取整', () => {
        equal(normalizePrefs(null), { ...DEFAULT_PREFS });
        const p = normalizePrefs({ direction: 'x', mode: 'fly', fontDelta: 99, lineHeight: 9, width: 123, hideUser: 'yes', expandAllReasoning: true });
        equal([p.direction, p.mode, p.fontDelta, p.lineHeight, p.width, p.hideUser, p.expandAllReasoning], ['b', null, 14, 2.4, 480, false, true]);
        equal(normalizePrefs({ lineHeight: 1.66, width: 684 }).lineHeight, 1.7);
        equal(normalizePrefs({ width: 684 }).width, 680);
    });
    check('T80 设置：HTML 工具条默认显示，楼层胶囊默认在右；坏值回默认', () => {
        equal([DEFAULT_PREFS.htmlBarHidden, DEFAULT_PREFS.followSide, DEFAULT_PREFS.followOpen], [false, 'right', false]);
        equal([normalizePrefs({ followOpen: true }).followOpen, normalizePrefs({ followOpen: 'yes' }).followOpen], [true, false]);
        equal(normalizePrefs({ htmlBarHidden: true, followSide: 'left' }).followSide, 'left');
        equal(normalizePrefs({ htmlBarHidden: true }).htmlBarHidden, true);
        equal([normalizePrefs(null).openInStConfirm, normalizePrefs({ openInStConfirm: false }).openInStConfirm, normalizePrefs({ openInStConfirm: 0 }).openInStConfirm], [true, false, true]);
        equal([normalizePrefs({ htmlBarHidden: 1, followSide: 'top' }).htmlBarHidden, normalizePrefs({ followSide: 'top' }).followSide], [false, 'right']);
    });
    check('T99 "[ ] 换候选（旧习惯）"：键位对调，提示里的键名跟着换', () => {
        equal(DEFAULT_PREFS.legacyBrackets, false, '默认关：');
        equal([normalizePrefs({ legacyBrackets: true }).legacyBrackets, normalizePrefs({ legacyBrackets: 'yes' }).legacyBrackets], [true, false]);
        const keys = ['[', ']', ',', '.', '<', '>', '{', 'a'];
        equal(keys.map(key => navCommand(key, false)), ['floor-prev', 'floor-next', 'swipe-prev', 'swipe-next', 'swipe-prev', 'swipe-next', null, null], '默认（T80）：');
        equal(keys.map(key => navCommand(key, true)), ['swipe-prev', 'swipe-next', 'floor-prev', 'floor-next', 'floor-prev', 'floor-next', null, null], '旧习惯：');
        equal(navKeys(false), { floorPrev: '[', floorNext: ']', swipePrev: ',', swipeNext: '.' });
        equal(navKeys(true), { floorPrev: ',', floorNext: '.', swipePrev: '[', swipeNext: ']' });
        // 提示里写的键与按键真正做的事一致
        for (const legacy of [false, true]) {
            const k = navKeys(legacy);
            equal([navCommand(k.floorPrev, legacy), navCommand(k.floorNext, legacy), navCommand(k.swipePrev, legacy), navCommand(k.swipeNext, legacy)],
                ['floor-prev', 'floor-next', 'swipe-prev', 'swipe-next'], `legacy=${legacy}：`);
        }
        // T95 的"不再提示"与 T99 的开关是同一个键：关掉后能再打开
        equal(normalizePrefs({ ...normalizePrefs({ openInStConfirm: false }), openInStConfirm: true }).openInStConfirm, true);
    });
    check('T99 诊断里的宿主一行：TauriTavern / SillyTavern 版本 / 未知', () => {
        equal(hostLine({ versionText: "SillyTavern 1.14.0 'release' (abc1234)" }), '宿主：SillyTavern 1.14.0');
        equal(hostLine({ versionText: '' }), '宿主：SillyTavern 未知');
        equal(hostLine({}), '宿主：SillyTavern 未知');
        equal(hostLine({ tauri: true, versionText: 'SillyTavern 1.13.5' }), '宿主：TauriTavern（酒馆 1.13.5）');
        equal(hostLine({ ua: 'Mozilla/5.0 (Windows NT 10.0) Tauri/2.0', versionText: null }), '宿主：TauriTavern');
        equal(hostLine({ versionText: 'SillyTavern 1.15.0-beta.2' }), '宿主：SillyTavern 1.15.0-beta.2');
        const text = diagnosticsText(null, { version: '0.4.0', host: hostLine({ versionText: 'SillyTavern 1.14.0' }), ua: 'X' });
        equal(text.split('\n').slice(1, 4), ['阅读器版本：0.4.0', '宿主：SillyTavern 1.14.0', '浏览器：X']);
        equal(diagnosticsText(null, {}).split('\n')[2], '宿主：SillyTavern 未知', '没给 host：');
    });
    check('T99 导出楼数预览：隐藏楼默认导出、系统楼默认跳过、与 core 同序', () => {
        // 0 用户、1 角色、2 小眼睛隐藏的角色楼、3 小眼睛隐藏的用户楼、4 系统提示（/sys）、5 旁白、6 名叫 System 但有两个候选（算普通隐藏楼）
        const models = [
            { isUser: true, isSystem: false, name: 'U', swipes: ['a'] },
            { isUser: false, isSystem: false, name: 'C', swipes: ['a'] },
            { isUser: false, isSystem: true, name: 'C', swipes: ['a'] },
            { isUser: true, isSystem: true, name: 'U', swipes: ['a'] },
            { isUser: false, isSystem: true, name: 'System', swipes: ['a'] },
            { isUser: false, isSystem: true, isNarrator: true, name: 'C', swipes: ['a'] },
            { isUser: false, isSystem: true, name: 'System', swipes: ['a', 'b'] },
        ];
        const kinds = floorKinds(index => models[index], models.length);
        const { system: S, hidden: H, user: U } = FLOOR_KIND;
        equal([...kinds], [U, 0, H, H | U, S, S, H]);
        const all = { user: true, hidden: false, stHidden: true };
        equal(exportCount(kinds, 0, 6, all), { floors: 5, system: 2, hidden: 0, user: 0, skipped: 2 }, '默认：');
        equal(exportCount(kinds, 0, 6, { ...all, stHidden: false }), { floors: 2, system: 2, hidden: 3, user: 0, skipped: 5 }, '不要隐藏楼：');
        equal(exportCount(kinds, 0, 6, { ...all, hidden: true }), { floors: 7, system: 0, hidden: 0, user: 0, skipped: 0 }, '要系统楼：');
        equal(exportCount(kinds, 0, 6, { ...all, user: false }), { floors: 3, system: 2, hidden: 0, user: 2, skipped: 4 }, '不要用户楼：');
        equal(exportCount(kinds, 0, 6, { user: false, hidden: false, stHidden: false }), { floors: 1, system: 2, hidden: 3, user: 1, skipped: 6 }, '隐藏的用户楼先算隐藏：');
        equal(exportCount(kinds, 2, 3, all), { floors: 2, system: 0, hidden: 0, user: 0, skipped: 0 }, '部分范围：');
        equal(exportCount(kinds, -5, 99, all).floors, 5, '越界夹住：');
        equal(exportCountText(exportCount(kinds, 0, 6, all)), '将导出 5 楼（跳过 2 楼：系统 2）');
        equal(exportCountText(exportCount(kinds, 0, 6, { ...all, user: false, stHidden: false })), '将导出 1 楼（跳过 6 楼：隐藏 3、系统 2、用户 1）');
        equal(exportCountText(exportCount(kinds, 1, 2, all)), '将导出 2 楼');
        equal(exportDoneText({ floors: 120, skippedHidden: 2, skippedSystem: 1 }), '已导出 120 楼，跳过 3 楼（隐藏 2、系统 1）');
        equal(exportDoneText({ floors: 120, skippedHidden: 0, skippedSystem: 0 }), '已导出 120 楼');
        equal(exportDoneText({ floors: 60, skippedHidden: 0, skippedSystem: 1 }, 59), '已导出 60 楼，跳过 60 楼（系统 1、用户 59）');
        // 4000 楼：只扫数组，远低于一帧
        const big = new Uint8Array(4000).map((_, i) => (i % 7 === 0 ? H : i % 2 ? U : 0));
        const started = performance.now();
        for (let round = 0; round < 100; round++) exportCount(big, 0, 3999, all);
        const each = (performance.now() - started) / 100;
        if (each > 2) throw new Error(`4000 楼一次 ${each.toFixed(2)} ms，太慢`);
        return `4000 楼一次 ${each.toFixed(3)} ms`;
    });
    check('T80 楼层胶囊位置：列外空白够就停在列旁不压字，不够贴边', () => {
        // 1366 宽、正文列 683 居中：右侧空白 341，停在列右 16px 处
        const wide = { areaLeft: 0, areaRight: 1366, columnLeft: 341, columnRight: 1024, width: 34 };
        equal(followPlacement({ ...wide, side: 'right' }), { mode: 'margin', left: 1040 });
        equal(followPlacement({ ...wide, side: 'left' }), { mode: 'margin', left: 291 });
        // 正文区左边不在 0（抽屉钉住）：坐标相对正文区
        equal(followPlacement({ areaLeft: 300, areaRight: 1366, columnLeft: 500, columnRight: 1100, width: 34, side: 'right' }), { mode: 'margin', left: 816 });
        // 手机：列占满，贴边，胶囊整个在区域内
        const narrow = { areaLeft: 0, areaRight: 390, columnLeft: 0, columnRight: 390, width: 30 };
        equal(followPlacement({ ...narrow, side: 'right' }), { mode: 'edge', left: 354 });
        equal(followPlacement({ ...narrow, side: 'left' }), { mode: 'edge', left: 6 });
        // 空白刚好差一点也贴边
        equal(followPlacement({ areaLeft: 0, areaRight: 1000, columnLeft: 0, columnRight: 950, width: 34, side: 'right' }).mode, 'edge');
    });
    check('方向默认：B 滚动+跟随 ST 宽度，A 分页+680；用户改过的优先', () => {
        equal(effectivePrefs(normalizePrefs({})).mode, 'scroll');
        equal(effectivePrefs(normalizePrefs({})).width, null);
        equal(effectivePrefs(normalizePrefs({ direction: 'a' })).mode, 'paged');
        equal(effectivePrefs(normalizePrefs({ direction: 'a' })).width, 680);
        equal(effectivePrefs(normalizePrefs({ direction: 'a', mode: 'scroll', width: 900 })).mode, 'scroll');
        equal(effectivePrefs(normalizePrefs({ direction: 'a', mode: 'scroll', width: 900 })).width, 900);
    });
    check('系统楼判定：旁白与无名/System 提示行才算，隐藏的普通楼不算（I050 / T62）', () => {
        const m = (over = {}) => ({ index: 0, name: '星灯（虚构）', isUser: false, isSystem: true, isNarrator: false, swipes: [{}], ...over });
        equal(isSystemLike(m()), false, '有名字、单候选的隐藏楼：');
        equal(isSystemLike(m({ name: '测试旅人（虚构）', isUser: true })), false, '隐藏的用户楼：');
        equal(isSystemLike(m({ swipes: [{}, {}] })), false, '隐藏楼带多候选：');
        equal(isSystemLike(m({ name: '' })), true, '无名提示行：');
        equal(isSystemLike(m({ name: '  ' })), true, '名字只有空白：');
        equal(isSystemLike(m({ name: 'System' })), true, 'System 提示行：');
        equal(isSystemLike(m({ name: 'SillyTavern System' })), true, '宿主系统名：');
        equal(isSystemLike(m({ name: '', swipes: [{}, {}] })), false, '无名但有多候选：');
        equal(isSystemLike(m({ name: 'System', isNarrator: true, swipes: [{}, {}] })), true, '旁白永远算：');
        equal(isSystemLike(m({ isSystem: false, name: 'System（虚构）', isNarrator: false })), false, '普通角色楼：');
        equal(isSystemLike(m({ isSystem: false, name: 'System', isNarrator: false })), false, '没标 isSystem 就照普通楼：');
        equal(isSystemLike(m({ isSystem: false, name: 'System', isNarrator: true })), true, '旁白不受 isSystem 影响（/sys 常见 is_system=false）：');
        equal(isSystemLike(null), false, '空模型：');
    });
    check('隐藏用户楼：连续用户楼合成一段，真正的系统楼打断；隐藏过的用户楼照样折进去', () => {
        const m = (index, isUser, over = {}) => ({ index, isUser, isSystem: false, isNarrator: false, name: isUser ? '测试旅人（虚构）' : '星灯（虚构）', swipes: [{}], ...over });
        const runs = hiddenUserRuns([m(10, true), m(11, true), m(12, false), m(13, true), m(14, true, { isSystem: true }), m(15, true), m(16, true, { isSystem: true }), m(17, true)]);
        equal([...runs.entries()], [[10, 2], [13, 5]], '隐藏的用户楼不断开：');
        equal([...hiddenUserRuns([m(0, false)]).entries()], []);
        // 真正的系统楼（无名提示行）仍然打断
        equal([...hiddenUserRuns([m(0, true), m(1, true, { isSystem: true, name: '' }), m(2, true)]).entries()], [[0, 1], [2, 1]], '无名提示行打断：');
    });
    check('收起 ST 隐藏楼：两个开关有交集不重合，相邻合并、文字跟着变（T62 验收后）', () => {
        const m = (index, isUser, isSystem = false, name = isUser ? '旅人' : '星灯') => ({ index, isUser, isSystem, isNarrator: false, name, swipes: [{}] });
        // 0 普通角色 1 隐藏角色 2 隐藏用户 3 普通用户 4 无名系统行 5 隐藏角色
        const chat = [m(0, false), m(1, false, true), m(2, true, true), m(3, true), m(4, false, true, ''), m(5, false, true)];
        const runs = opts => [...foldRuns(chat, opts)].map(([start, run]) => [start, run.count, run.label]);
        equal(runs({ hideStHidden: true }), [[1, 2, '— 已隐藏 · 2 条 —'], [5, 1, '— 已隐藏 · 1 条 —']], '只开隐藏楼：');
        equal(runs({ hideUser: true }), [[2, 2, '— 你 · 2 条 —']], '只开用户楼：');
        equal(runs({ hideUser: true, hideStHidden: true }), [[1, 3, '— 收起 3 条 —'], [5, 1, '— 已隐藏 · 1 条 —']], '两个都开：');
        equal(runs({}), [], '都关：');
        equal([isFolded(chat[4], { hideStHidden: true }), isStHidden(chat[4]), isStHidden(chat[1])], [false, false, true], '真正的系统楼不收：');
        equal(normalizePrefs({ hideStHidden: true }).hideStHidden, true);
        equal(normalizePrefs({ hideStHidden: 'yes' }).hideStHidden, false);
    });
    check('进度文字：楼号从 1 开始、单楼、空聊天', () => {
        equal(progressText(127, 130, 312), '第 128–131 楼 · 共 312 楼 · 42%');
        equal(progressText(0, 0, 1), '第 1 楼 · 共 1 楼 · 100%');
        equal(progressText(0, 0, 0), '空聊天');
    });
    check('跳楼输入：1..总数有效，其余为 null', () => {
        equal(parseJumpInput('128', 312), 127);
        equal(parseJumpInput(' 1 ', 312), 0);
        equal([parseJumpInput('0', 312), parseJumpInput('313', 312), parseJumpInput('1.5', 312), parseJumpInput('', 312), parseJumpInput('abc', 312)], [null, null, null, null, null]);
    });
    check('候选记忆：越界或缺失回到 ST 当前候选', () => {
        const model = { swipeId: 2, swipes: [{}, {}, {}, {}] };
        equal([pickSwipe(0, model), pickSwipe(3, model), pickSwipe(4, model), pickSwipe(undefined, model), pickSwipe(-1, model)], [0, 3, 2, 2, 2]);
    });
    check('候选预览：去 HTML/markdown 记号、压成一行、截断', () => {
        equal(previewLine('<b>雨停了。</b>\n\n*她*把伞收了起来', 10), '雨停了。 她把伞收了…');
        equal(previewLine(''), '');
    });
    check('候选预览：跳过共同开头，从不同处显示；开头不同则原样', () => {
        const same = '第 11 楼，星灯在虚构灯塔记录天气。“今晚的星图很清楚。”';
        equal(swipePreviews([`${same}
候选 1/3：朝港口走去。`, `${same}
候选 2/3：留在灯塔。`, `${same}
候选 3/3：乘纸舟。`]),
            ['…候选 1/3：朝港口走去。', '…候选 2/3：留在灯塔。', '…候选 3/3：乘纸舟。']);
        equal(swipePreviews(['雨还在下。', '雨停了。']), ['雨还在下。', '雨停了。']);
        equal(swipePreviews(['只有一个']), ['只有一个']);
        equal(swipePreviews([same, same]), [previewLine(same), previewLine(same)], '完全相同：');
    });
    check('列表过滤：任一字段包含、忽略大小写、空关键词全保留', () => {
        equal(matchesFilter('ali', '爱丽丝', 'Alice-01'), true);
        equal(matchesFilter('旅店', '爱丽丝', 'STCR-01'), false);
        equal(matchesFilter('  ', '任何'), true);
    });
    check('进度记录：超出上限时淘汰最旧、丢弃坏记录', () => {
        const table = { a: { t: 1 }, b: { t: 3 }, c: { t: 2 }, bad: { t: 'x' } };
        equal(Object.keys(pruneProgress(table, 2)).sort(), ['b', 'c']);
        equal(Object.keys(pruneProgress(table, 10)).sort(), ['a', 'b', 'c']);
    });
    check('卡片选段：阅读器位置换算到"已替换名字"的副本（名字挨着、只选半个名字）', () => {
        const a = '爱丽丝看着小明说：“爱丽丝知道。”然后离开了房间很久很久';
        const b = 'char看着user说：“char知道。”然后离开了房间很久很久';
        const seg = alignTexts(a, b);
        const pick = (x, y) => b.slice(mapOffset(seg, x, 'start'), mapOffset(seg, y, 'end'));
        equal(pick(3, 5), '看着', '名字中间的字：');
        equal(pick(1, 5), 'char看着', '只选了半个名字：');
        equal(pick(13, 20), '知道。”然后离', '替换之后：');
        equal(pick(0, a.length), b, '全选：');
        equal(alignTexts('相同的文字', '相同的文字'), [{ a0: 0, a1: 5, b0: 0, b1: 5, equal: true }]);
    });
    check('卡片选段：长楼对齐不卡（2 万字 × 2）', () => {
        const long = '雨'.repeat(20000);
        const started = Date.now();
        const seg = alignTexts(`${long}爱丽丝${long}`, `${long}char${long}`);
        if (Date.now() - started > 2000) throw new Error('太慢');
        equal(mapOffset(seg, 20001, 'start'), 20000);
        equal(mapOffset(seg, 40003, 'end'), 40004);
    });
    check('卡片点词：按词取，标点和空白不算', () => {
        equal(wordAt('她把伞收了起来，抬头看你', 3) !== null, true);
        equal(wordAt('她把伞收了起来，抬头看你', 7), null, '逗号：');
        equal(wordAt('hello world', 2), { start: 0, end: 5 });
        equal(wordAt('hello world', 5), null, '空格：');
        equal(wordAt('', 0), null);
    });
    check('卡片设置：坏值回默认；名字开关不在里面（每次都从"开"开始）', () => {
        equal(normalizeCardPrefs(null), { ...DEFAULT_CARD_PREFS });
        const p = normalizeCardPrefs({ template: 'x', size: 'giant', mask: 'blur', icon: 'fa-skull', uniform: 'no', signature: 'S'.repeat(99), replaceNames: false });
        equal([p.template, p.size, p.mask, p.icon, p.uniform, p.signature.length, 'replaceNames' in p], [null, 'portrait', 'bar', 'fa-star', true, 40, false]);
        equal(normalizeCardPrefs({ template: 'digest', mask: 'sticker', icon: 'fa-cat', digestAccent: 'theme' }).digestAccent, 'theme');
        const img = normalizeCardPrefs({ maskAsset: 'stcr:assets:1', digestCover: 42 });
        equal([img.maskAsset, img.digestCover], ['stcr:assets:1', null], '图片设置：');
    });
    check('颜色（T42）：8 个预设都是六位色号；色号输入宽松读、严格出；卡片默认颜色跟随模板', () => {
        equal(COLOR_PRESETS.length, 8);
        equal(COLOR_PRESETS.every(p => /^#[0-9a-f]{6}$/.test(p.value)), true, '预设：');
        equal([cleanHexColor('#F5B8C8'), cleanHexColor('abc'), cleanHexColor(' #1a2b3c '), cleanHexColor('red'), cleanHexColor('#12345'), cleanHexColor('')],
            ['#f5b8c8', '#aabbcc', '#1a2b3c', null, null, null]);
        equal([normalizeCardPrefs(null).maskColor, normalizeCardPrefs({ maskColor: '#93C8EC' }).maskColor, normalizeCardPrefs({ maskColor: 'blue' }).maskColor], [null, '#93c8ec', null]);
    });
    check('按角色排序（T43）：跟随 ST 的字段与方向；收藏在前；同值按名字；认不出退回 A-Z', () => {
        const list = [
            { name: '乙', create_date: '2024-5-3 @13h 20m 11s 123ms', fav: false, date_last_chat: 30, chat_size: 5, tags: ['a'] },
            { name: 'Ann', create_date: 1714700000000, fav: 'true', date_last_chat: 10, chat_size: 50, tags: ['a', 'b'] },
            { name: '甲', create_date: '2025-01-01T00:00:00Z', fav: true, date_last_chat: 20, chat_size: 5, tags: [] },
        ];
        const names = sort => sortOwners(list, sort).map(o => o.name);
        equal(stOwnerSort('name', 'asc').id, 'name:asc');
        equal(stOwnerSort('name', 'random').id, 'name:asc', '随机：');
        equal(stOwnerSort('chat_size', 'desc').label, '聊天最多');
        equal(names(stOwnerSort('date_last_chat', 'desc')), ['乙', '甲', 'Ann']);
        equal(names(stOwnerSort('fav', 'desc')).at(-1), '乙', '收藏：');
        // 名字比较跟 ST 一样用运行环境的默认语言（中文环境 甲 < 乙，其他环境可能相反），期望值按同一规则算
        equal(names(stOwnerSort('chat_size', 'desc')), ['Ann', ...['甲', '乙'].sort((a, b) => a.localeCompare(b))], '同值按名字：');
        equal(names(stOwnerSort('create_date', 'desc')), ['甲', '乙', 'Ann'], '三种日期格式：');
        equal(parseStDate('胡说'), 0);
        equal(OWNER_SORTS.length, 10);
        equal(filterOwners(list, { query: 'an', tags: ['a'] }).map(o => o.name), ['Ann']);
        equal(filterOwners(list, { tags: ['a', 'b'] }).map(o => o.name), ['Ann'], '多标签 = 都要有：');
    });
    check('隐藏思维链（T42）：默认关，只收布尔值', () => {
        equal(normalizePrefs(null).hideReasoning, false);
        equal(normalizePrefs({ hideReasoning: true }).hideReasoning, true);
        equal(normalizePrefs({ hideReasoning: 'yes' }).hideReasoning, false);
        equal(normalizePrefs(null).aaLayout, 'bar');
        equal(normalizePrefs({ aaLayout: 'panel' }).aaLayout, 'panel');
        equal(normalizePrefs({ aaLayout: 'side' }).aaLayout, 'bar');
        equal(normalizePrefs(null).htmlMode, 'render');
        equal(normalizePrefs(null).htmlNetwork, true);
        equal(normalizePrefs({ htmlNetwork: false }).htmlNetwork, false);
        equal(normalizePrefs({ htmlMode: 'source', htmlWidth: 'fit' }).htmlWidth, 'fit');
        equal(normalizePrefs({ htmlMode: 'x', htmlWidth: 500 }).htmlMode, 'render');
        equal(normalizePrefs({ htmlWidth: 500 }).htmlWidth, 390);
        equal(normalizePrefs({}).updateNotice, true, '更新提醒默认开：');
        equal(normalizePrefs({ updateNotice: false }).updateNotice, false, '更新提醒可关：');
        equal(normalizePrefs({ updateNotice: 'no' }).updateNotice, true, '更新提醒坏值：');
    });
    check('卡片文件名：不含聊天名与角色名', () => {
        equal(cardFileName(new Date(2026, 8, 28, 21, 4)), 'st-reader-card-20260928-2104.png');
    });
    check('屏蔽词输入：去空白、压换行、空与超长拒绝', () => {
        equal([cleanMaskWord('  伦敦 '), cleanMaskWord('第一行\n第二行'), cleanMaskWord('   '), cleanMaskWord('字'.repeat(41))], ['伦敦', '第一行 第二行', null, null]);
    });
    check('T81 自动名字是全局设置：默认开，坏值回默认', () => {
        equal(DEFAULT_PREFS.autoNames, true);
        equal([normalizePrefs({ autoNames: false }).autoNames, normalizePrefs({ autoNames: 'no' }).autoNames, normalizePrefs({}).autoNames], [false, true, true]);
    });
    check('T81 脱敏显示：自动名字换成 char / user，原词长度找得回（锚点不错位）', () => {
        const names = { userName: '小舟', characterName: '星灯', isGroup: false };
        const pieces = replacePieces('小舟对星灯说：灯台亮了', { rules: [], avatarUrl: null, names });
        equal(pieces.map(p => p.to ? `[${p.orig}→${p.to.value}]` : p.text), ['', '[小舟→user]', '对', '[星灯→char]', '说：灯台亮了'].filter(Boolean));
        equal(replacePieces('小舟对星灯说', { rules: [], avatarUrl: null, names: null }), [{ text: '小舟对星灯说' }]);
        equal(hasRedaction({ words: [], rules: [], names }), true);
        equal(hasRedaction({ words: [], rules: [], names: null }), false);
    });
    check('T81 更多原词：两个原词都换，列表里每处原词长度对得上', () => {
        const rule = { from: '灯塔', aliases: ['灯台', '海边灯台'], to: { kind: 'text', value: '某地' }, scope: 'all' };
        const pieces = replacePieces('灯塔、灯台、海边灯台', { rules: [rule], avatarUrl: null });
        equal(pieces.filter(p => p.to).map(p => p.orig), ['灯塔', '灯台', '海边灯台']);
        equal(pieces.map(p => p.to ? p.to.value : p.text).join(''), '某地、某地、某地');
    });
    check('T81 小字：当前聊天的名字跟着换，别的聊天不猜名字', () => {
        const rule = { from: '灯塔', aliases: ['灯台'], to: { kind: 'text', value: '某地' }, scope: 'all' };
        setRedactState({ words: [], rules: [rule], names: { userName: '小舟', characterName: '星灯', isGroup: false }, chatKey: 'Star.png/聊天一', avatarUrl: 'Star.png' });
        try {
            equal(redactString('星灯在灯台等小舟', 'Star.png/聊天一'), 'char在某地等user');
            equal(redactString('星灯在灯台', 'Star.png/聊天二'), 'char在某地', '同一个角色的别的聊天：');
            equal(redactString('星灯在灯台', 'Other.png/聊天'), '星灯在某地', '别的角色：');
        } finally { setRedactState(null); }
    });
    check('T96 主题与宽度：默认跟随酒馆，坏值回默认，旧的自定义宽度迁成"自定义"', () => {
        equal([DEFAULT_PREFS.theme, DEFAULT_PREFS.widthMode], ['host', 'host']);
        equal([normalizePrefs({ theme: 'paper' }).theme, normalizePrefs({ theme: 'night' }).theme, normalizePrefs({ theme: 'sepia' }).theme], ['paper', 'night', 'host']);
        equal([normalizePrefs({ widthMode: 'full' }).widthMode, normalizePrefs({ widthMode: 'wide' }).widthMode], ['full', 'host']);
        equal(normalizePrefs({ width: 900 }).widthMode, 'custom', '只有旧 width：');
        equal(normalizePrefs({ width: 900, widthMode: 'host' }).widthMode, 'host', '两个都有：');
    });
    check('T96 生效宽度：跟随酒馆走方向默认，铺满不给宽度，自定义用滑块值', () => {
        const scroll = effectivePrefs(normalizePrefs({ widthMode: 'full', width: 900 }));
        equal([scroll.width, scroll.full, scroll.widthMode], [null, true, 'full']);
        equal(effectivePrefs(normalizePrefs({ direction: 'a', widthMode: 'host', width: 900 })).width, 680);
        equal(effectivePrefs(normalizePrefs({ widthMode: 'custom', width: 900 })).width, 900);
        equal(effectivePrefs(normalizePrefs({ widthMode: 'host' })).full, false);
    });
    check('T101 导出为文档的记忆：默认 TXT / 酒馆当前 / 名字 / 楼号、用户楼和酒馆隐藏楼；坏值回默认', () => {
        equal(normalizePrefs(null).docExport, { format: 'txt', swipes: 'host', speaker: 'name', include: { floorNumbers: true, time: false, user: true, reasoning: false, html: false, details: false, tables: false, code: false, hidden: false, stHidden: true } });
        const p = normalizePrefs({ docExport: { format: 'html', swipes: 'nope', speaker: 'role', include: { reasoning: true, html: 1 } } }).docExport;
        equal([p.format, p.swipes, p.speaker, p.include.reasoning, p.include.html], ['html', 'host', 'role', true, false]);
    });
    // ───────── 附带的七套主题模板（cardBundled.js） ─────────
    check('附带主题模板：七套都是合法模板；第一次全装上，删掉的不再装回，同名不重复，满了下次再补；按 id / 原名找得到留言链接', () => {
        const bad = BUNDLED_TEMPLATES.filter(t => !parseTemplateText(JSON.stringify({ format: 'stcr-card-template', version: 1, name: t.name, base: t.base, options: t.options, css: t.css })).ok
            || !normalizeTemplates([{ id: t.id, name: t.name, base: t.base, options: t.options, css: t.css }])[0]?.css || !BUNDLED_LINKS[t.theme]).map(t => t.id);
        equal(bad, [], '不合法的：');
        equal(BUNDLED_TEMPLATES.length, 7, '套数：');
        const first = seedBundled([], [], addTemplate);
        equal(first.list.map(t => t.id), BUNDLED_TEMPLATES.map(t => t.id), '第一次：');
        equal(first.seeded.length, 7, '记为装过：');
        const deleted = first.list.filter(t => t.id !== 'b-xp');
        const again = seedBundled(deleted, first.seeded, addTemplate);
        equal([again.changed, again.list.some(t => t.id === 'b-xp')], [false, false], '删掉后再开：');
        const mine = seedBundled([{ id: 'tmine', name: '粗野指北', base: 'paper', options: DEFAULT_OPTIONS, css: '' }], [], addTemplate);
        equal(mine.list.filter(t => t.name === '粗野指北').length, 1, '已有同名：');
        const full = Array.from({ length: MAX_TEMPLATES - 2 }, (_, i) => ({ id: `t${i}`, name: `我的${i}`, base: 'paper', options: DEFAULT_OPTIONS, css: '' }));
        const partial = seedBundled(full, [], addTemplate);
        equal([partial.list.length, partial.seeded.length], [MAX_TEMPLATES, 2], '只剩两个空位：');
        const later = seedBundled(partial.list.filter(t => t.id !== 't0'), partial.seeded, addTemplate);
        equal(later.seeded.length, 3, '空出一位后补上一套：');
        equal([bundledLinks({ id: 'b-xuyu', name: '改过名' }), bundledLinks({ id: 'tx', name: '纸上访谈 · 夜' }), bundledLinks({ id: 'tx', name: '我的' })],
            [BUNDLED_LINKS.xuyu, BUNDLED_LINKS.zhishang, null], '链接：');
    });

    // ───────── T104：卡片模板（cardTemplates.js） ─────────
    const GOOD_FILE = (patch = {}) => JSON.stringify({ format: 'stcr-card-template', version: 1, name: '我的', base: 'paper', options: { palette: 'sky', headerOn: true, headerTitle: '星灯夜话' }, css: '', ...patch });
    check('T104 模板文件：好样本都能读（最小 / 完整 / 四种底子 / 自定义配色 / 20 字名 / 带 css / 空 options）', () => {
        const good = [
            GOOD_FILE(),
            JSON.stringify({ format: 'stcr-card-template', version: 1, name: 'x', base: 'theme', options: {} }),
            JSON.stringify({ format: 'stcr-card-template', version: 1, name: '深', base: 'dark', options: { ...DEFAULT_OPTIONS, palette: 'ink', texture: 'grid', lineHeight: 1.8, fontFamily: 'kai', radius: 24, padding: 'wide', fontSize: 'l', align: 'justify', letterSpacing: 0.05 } }),
            GOOD_FILE({ base: 'digest', options: { palette: 'custom', customA: '#fce4ec', customB: '#e3f2fd', customAngle: 45 } }),
            GOOD_FILE({ name: '一二三四五六七八九十一二三四五六七八九十' }),
            GOOD_FILE({ css: '.mes_text q { color: #c00; }\n.stcr-card { box-shadow: 0 0 8px rgba(0,0,0,.3); }\n@media (max-width: 600px) { .name_text { display: none; } }' }),
            `\uFEFF${GOOD_FILE({ options: { headerOn: true, headerIcon: 'fa-moon', headerDate: true, leadOn: true, leadText: '题记', footDate: true, footCount: true } })}`,
        ];
        const bad = good.map(parseTemplateText).filter(r => !r.ok).map(r => r.error);
        equal(bad, []);
        equal(parseTemplateText(good[1]).template.options, DEFAULT_OPTIONS, '空 options = 全默认：');
    });
    check('T104 模板文件：坏样本一律拒绝并说清哪一项（≥ 10 例）', () => {
        const cases = [
            [GOOD_FILE({ format: 'other' }), 'format'],
            [GOOD_FILE({ version: 2 }), 'version'],
            [GOOD_FILE({ version: '1' }), 'version'],
            [GOOD_FILE({ options: { palete: 'sky' } }), 'options.palete'],
            [GOOD_FILE({ options: { fontSize: 'xl' } }), 'options.fontSize'],
            [GOOD_FILE({ options: { lineHeight: 2.5 } }), 'options.lineHeight'],
            [GOOD_FILE({ options: { radius: 13 } }), 'options.radius'],
            [GOOD_FILE({ options: { palette: 'nope' } }), 'options.palette'],
            [GOOD_FILE({ options: { customA: 'red' } }), 'options.customA'],
            [GOOD_FILE({ options: { headerOn: 'yes' } }), 'options.headerOn'],
            [GOOD_FILE({ options: { headerTitle: 'x'.repeat(31) } }), 'options.headerTitle'],
            [GOOD_FILE({ options: { headerIcon: 'fa-skull' } }), 'options.headerIcon'],
            [GOOD_FILE({ options: [] }), 'options'],
            [GOOD_FILE({ base: 'neon' }), 'base'],
            [GOOD_FILE({ name: '' }), 'name'],
            [GOOD_FILE({ name: '一二三四五六七八九十一二三四五六七八九十一' }), 'name'],
            ['这不是 JSON', 'JSON'],
            ['[1,2]', '对象'],
            ['', '空'],
        ];
        for (const [text, word] of cases) {
            const result = parseTemplateText(text);
            if (result.ok) throw new Error(`应拒绝：${text.slice(0, 80)}`);
            if (!result.error.includes(word)) throw new Error(`说明里应有「${word}」，实际：${result.error}`);
        }
    });
    check('T104 模板 CSS：好写法过；@import / @font-face / 外链 url( / position:fixed / expression / 卡片外选择器 / 超 8 KB / 空，逐条拒绝并说原因', () => {
        for (const css of ['.mes_text q { color: red; }', '.stcr-card:hover { opacity: .9; }', '.a, .b { color: red }', '@media (max-width: 500px) { .mes_text { font-size: 14px } }',
            '.stcr-card { background-image: url("data:image/png;base64,AAAA"); }', '/* 注释 */ .name_text { letter-spacing: .3em; }']) {
            const r = checkTemplateCss(css);
            if (!r.ok) throw new Error(`应通过：${css} → ${r.error}`);
        }
        const bads = [
            ['@import url("https://x.invalid/a.css"); .a { color: red }', '@import'],
            ['@font-face { font-family: X; src: url(data:font/woff2;base64,AA) }', '@font-face'],
            ['.a { background: url(https://x.invalid/a.png) }', '外链'],
            ['.a { background: url(//x.invalid/a.png) }', '外链'],
            ['.a { background-image: url(\'/img/a.png\') }', '外链'],
            ['.a { position: fixed; top: 0 }', 'fixed'],
            ['.a { position:FIXED }', 'fixed'],
            ['.a { width: expression(alert(1)) }', 'expression'],
            ['body { color: red }', '卡片以外'],
            ['html, .a { color: red }', '卡片以外'],
            ['#stcr_root .a { color: red }', '卡片以外'],
            [':root { --x: 1 }', '卡片以外'],
            ['.a { color: red', '配对'],
            ['.a { content: "\\22" }', '反斜杠'],
            ['@keyframes spin { to { opacity: 0 } }', '@keyframes'],
            ['.a { .b { color: red } }', '嵌套'],
            ['   /* 只有注释 */   ', '空'],
            [`.a { color: red }${' '.repeat(9000)}`, '8 KB'],
            ['.stcr-card { --p: fixed; position: var(--p) }', 'fixed'], // T104 复查：间接写法
            ['.a { position:fixed }', 'fixed'],
            ['.stcr-card ~ * { color: red }', '卡片旁边'],
            ['.stcr-card:hover + div { color: red }', '卡片旁边'],
        ];
        for (const [css, word] of bads) {
            const r = checkTemplateCss(css);
            if (r.ok) throw new Error(`应拒绝：${css.slice(0, 60)}`);
            if (!r.error.includes(word)) throw new Error(`原因里应有「${word}」，实际：${r.error}`);
        }
        equal(checkTemplateCss('.a { position: relative } .b { position: absolute !important; background-position: center }').ok, true, '普通 position 照常：');
        equal(checkTemplateCss('.mes_text ~ .x, .a + .b { color: red }').ok, true, '卡片里面的兄弟选择器照常：');
        // T104 复查：模板文件最外层多出来的项整份拒绝；另存不合法的样式不存
        const extra = parseTemplateText(JSON.stringify({ ...JSON.parse(GOOD_FILE({})), evil: 1 }));
        equal(extra.ok === false && extra.error.includes('evil'), true, '多出的项：');
        const badSave = addTemplate([], { name: '坏', base: 'paper', options: {}, css: '@import url(x.css);' });
        equal(badSave.ok === false && /自定义样式没有生效/.test(badSave.error), true, '另存坏样式：');
        equal(addTemplate([], { name: '空', base: 'paper', options: {}, css: '   ' }).template?.css, '', '只有空白的样式当空：');
        equal(templateProblem({ name: 'x', base: 'paper', options: {}, css: '.a { color: red }' }), null);
        const viaFile = parseTemplateText(GOOD_FILE({ css: '.a { background: url(https://x.invalid/a.png) }' }));
        equal(viaFile.ok, false); equal(viaFile.error.startsWith('css：'), true, '经模板文件导入时：');
    });
    check('T104 模板 CSS 前缀：每条选择器都落在该模板的卡片根里，卡片根本身可用 .stcr-card 指', () => {
        const scope = templateScope('tabc'), cls = templateClassScope('tabc');
        equal(scope, '#stcr_root .stcr-card[data-tpl="tabc"]');
        equal(cls, '#stcr_root .stcr-card.stcr-tpl-tabc', '导出副本不抄 data-*，另有 class 写法：');
        const out = scopeTemplateCss('.mes_text q, .name_text { color: red; }\n.stcr-card { opacity: .9 }\n.stcr-card:hover .x { opacity: 1 }\n@media (max-width: 500px) { .y { font-size: 12px } }', 'tabc');
        const selectors = out.replace(/@media[^{]*\{/g, '').split('}').flatMap(chunk => chunk.split('{')[0].split(',').map(s => s.trim())).filter(Boolean);
        equal(selectors.length, 10, '5 个选择器 × 两种根写法：');
        for (const s of selectors) if (!s.startsWith(scope) && !s.startsWith(cls)) throw new Error(`没加前缀：${s}`);
        equal(out.includes(`${scope} .mes_text q, ${cls} .mes_text q, ${scope} .name_text, ${cls} .name_text{color: red;}`), true, '逗号分隔都加：');
        equal(out.includes(`${scope}, ${cls}{opacity: .9}`), true, '.stcr-card = 根本身：');
        equal(out.includes(`${scope}:hover .x, ${cls}:hover .x{`), true, '.stcr-card:hover：');
        equal(out.startsWith('#stcr_root .stcr-card[data-tpl="tabc"] .mes_text q'), true);
        equal(out.includes('@media (max-width: 500px){'), true, '@media 保留：');
        equal(scopeTemplateCss('body { color: red }', 'tabc'), '', '不合法的整份不出样式：');
        equal(templateScope('a"]{x'), '#stcr_root .stcr-card[data-tpl="ax"]', 'id 里的怪字符被剔掉，跳不出属性选择器：');
    });
    check('T104 内置四套 = 预设（底子 + 全默认选项），与改造前等价；旧偏好读出来外观不变', () => {
        equal(BUILTIN_TEMPLATES.map(t => t.id), [...CARD_TEMPLATES]);
        for (const t of BUILTIN_TEMPLATES) { equal(t.options, DEFAULT_OPTIONS, `${t.id}：`); equal(t.base, t.id); }
        equal(isDefaultOptions(DEFAULT_OPTIONS), true);
        // 没有任何新选项的旧偏好：配色 / 纹理 / 页眉 / 按语 / 页脚日期字数都关，字号 1.0、行距内边距跟模板自带、直角
        const old = normalizeCardPrefs({ template: 'paper', size: 'wide', mask: 'block', signature: '我的署名' });
        equal(old.opts, DEFAULT_OPTIONS); equal(old.tplId, null); equal(old.defaultTpl, null); equal(old.template, 'paper');
        equal(DEFAULT_OPTIONS.palette, null); equal(DEFAULT_OPTIONS.headerOn, false); equal(DEFAULT_OPTIONS.leadOn, false);
        equal(DEFAULT_OPTIONS.fontSize, 's'); equal(FONT_SIZES.map(f => f.scale), [1, 1.12, 1.25]);
        equal(DEFAULT_OPTIONS.lineHeight, null); equal(PADDINGS.find(p => p.id === DEFAULT_OPTIONS.padding).scale, 1); equal(DEFAULT_OPTIONS.radius, 0);
        const messy = normalizeCardPrefs({ opts: { palette: 'sky', fontSize: 'huge', junk: 1 }, tplId: 't1', defaultTpl: 'bad id!' });
        equal(messy.opts.palette, 'sky'); equal(messy.opts.fontSize, 's', '坏值回默认：'); equal('junk' in messy.opts, false); equal(messy.tplId, 't1'); equal(messy.defaultTpl, null);
    });
    check('T104 配色：≥ 16 组、浅深各半；字色 / 名字色 / 引号色在底色两端都 ≥ 4.5:1', () => {
        equal(PALETTES.length >= 16, true, `共 ${PALETTES.length} 组：`);
        equal(PALETTES.filter(p => p.tone === 'light').length, PALETTES.filter(p => p.tone === 'dark').length, '浅深各半：');
        equal(PALETTES.some(p => p.stops.length === 2) && PALETTES.some(p => p.stops.length === 1), true, '纯色与渐变都有：');
        equal(new Set(PALETTES.map(p => p.id)).size, PALETTES.length, 'id 不重复：');
        const bad = [];
        for (const p of PALETTES) for (const key of ['text', 'name', 'quote', 'accent']) if (minContrast(p[key], p.stops) < 4.5) bad.push(`${p.id}.${key} ${minContrast(p[key], p.stops).toFixed(2)}`);
        for (const p of PALETTES) { const r = resolvePalette({ ...DEFAULT_OPTIONS, palette: p.id }); if (minContrast(r.sign, p.stops) < 4.5) bad.push(`${p.id}.sign`); if ((p.tone === 'dark') !== (luminance(r.mid) < 0.18)) bad.push(`${p.id} 深浅标注与亮度不符`); }
        equal(bad, []);
    });
    check('T104 复查：对比度沿整条渐变算（含中段），斜体色也 ≥ 4.5:1；预设与自定义都查', () => {
        // 不依赖 minContrast 的实现：自己沿渐变取 65 个点，每点单独算
        const worst = (fg, stops) => Math.min(...Array.from({ length: 65 }, (_, i) => minContrast(fg, [stops.length < 2 ? stops[0] : mixHex(stops[0], stops.at(-1), i / 64)])));
        const bad = [];
        const audit = (label, r) => { for (const key of ['text', 'name', 'quote', 'accent', 'em', 'sign']) { const v = worst(r[key], r.stops); if (v < 4.5) bad.push(`${label}.${key} ${v.toFixed(2)}`); } };
        for (const p of PALETTES) audit(p.id, resolvePalette({ ...DEFAULT_OPTIONS, palette: p.id }));
        const pairs = [['#ff0000', '#00ff00'], ['#00ffff', '#ff0000'], ['#ff00ff', '#00ff00'], ['#ff8800', '#0000ff'], ['#ffff00', '#0000ff'], ['#ff0000', '#0000ff'], ['#00ff00', '#ff00ff']];
        let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        for (let i = 0; i < 300; i++) pairs.push([toHex([rnd() * 255, rnd() * 255, rnd() * 255]), toHex([rnd() * 255, rnd() * 255, rnd() * 255])]);
        for (const [a, b] of pairs) audit(`${a}→${b}`, resolvePalette({ ...DEFAULT_OPTIONS, palette: 'custom', customA: a, customB: b, customAngle: 135 }));
        equal(bad.slice(0, 8), []);
    });
    check('T104 自定义配色：任意两色，字色都 ≥ 4.5:1（含红蓝两端这种没有一种字色能兼顾的）', () => {
        let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        const color = () => toHex([rnd() * 255, rnd() * 255, rnd() * 255]);
        const pairs = [['#7a7a7a', null], ['#ff0000', '#0000ff'], ['#ffffff', '#000000'], ['#808080', '#a0a0a0'], ['#000000', null], ['#00ff00', '#ff00ff']];
        for (let i = 0; i < 300; i++) pairs.push([color(), rnd() < 0.6 ? color() : null]);
        for (const [a, b] of pairs) {
            const d = derivePalette({ a, b, angle: 135 });
            if (minContrast(d.text, d.stops) < 4.5) throw new Error(`${a} ${b}：字色 ${d.text} 只有 ${minContrast(d.text, d.stops).toFixed(2)}`);
            if (minContrast(d.name, d.stops) < 4.5 || minContrast(d.quote, d.stops) < 4.5) throw new Error(`${a} ${b}：名字 / 引号色不够`);
        }
        equal(derivePalette({ a: '#ffffff' }).adjusted, false, '白底不需要调：');
        equal(derivePalette({ a: '#ff0000', b: '#0000ff' }).adjusted, true, '红蓝要压一压：');
        const solid = resolvePalette({ ...DEFAULT_OPTIONS, palette: 'custom', customA: '#fce4ec', customB: null });
        equal(solid.background, null, '只有一个颜色 = 纯色：');
        equal(resolvePalette({ ...DEFAULT_OPTIONS, palette: 'custom', customA: '#fce4ec', customB: '#e3f2fd', customAngle: 45 }).background, 'linear-gradient(45deg, #fce4ec, #e3f2fd)');
        equal(resolvePalette(DEFAULT_OPTIONS), null, '没选配色 = 用模板自带的：');
    });
    check('T104 纹理：纯 CSS（repeating-linear-gradient / radial-gradient），颜色是正文色的 8–10% 透明度，没有 url(', () => {
        equal(textureLayers('none', '#000000'), []);
        for (const [kind, word, alpha] of [['grid', 'repeating-linear-gradient', '0.08'], ['dots', 'radial-gradient', '0.1'], ['lines', 'repeating-linear-gradient', '0.08']]) {
            const layers = textureLayers(kind, '#336699');
            equal(layers.length >= 1, true);
            for (const l of layers) { equal(l.image.includes(word), true, `${kind}：`); equal(l.image.includes(`rgba(51, 102, 153, ${alpha})`), true, `${kind} 透明度：`); equal(/url\(/i.test(l.image), false); }
        }
    });
    check('T104 日期与字数：2026年11月16日；认不出不显示；字数不算空白', () => {
        equal(formatCardDate('2026-11-16T08:30:00.000Z') !== null, true);
        equal(formatCardDate(new Date(2026, 10, 16, 9, 30).toISOString()), '2026年11月16日');
        equal(formatCardDate(new Date(2026, 0, 5, 23, 59).toISOString()), '2026年1月5日');
        equal(formatCardDate(null), null); equal(formatCardDate(''), null); equal(formatCardDate('不是日期'), null);
        equal(countCardChars('今晚 的\n星图 abc'), 8); equal(countCardChars(''), 0); equal(formatCardCount(1234), '1,234 字');
    });
    check('T104 模板列表：≤ 30 个、每个 ≤ 20 KB、名字 ≤ 20 字且重名自动加序号；改名 / 删除；坏数据读出来被过滤', () => {
        let list = [];
        for (let i = 0; i < MAX_TEMPLATES; i++) { const r = addTemplate(list, { name: `模板${i}`, base: 'paper', options: { palette: 'sky' } }); equal(r.ok, true); list = r.list; }
        const over = addTemplate(list, { name: '第 31 个', base: 'paper', options: {} });
        equal(over.ok, false); equal(over.error.includes('30'), true);
        equal(addTemplate([], { name: '   ', base: 'paper', options: {} }).ok, false, '空名字：');
        const a = addTemplate([], { name: '一二三四五六七八九十一二三四五六七八九十甲乙', base: 'dark', options: {} });
        equal([...a.template.name].length, 20, '名字截到 20 字：');
        const dup = addTemplate(a.list, { name: a.template.name, base: 'dark', options: {} });
        equal(dup.template.name !== a.template.name && [...dup.template.name].length <= 20, true, '重名加序号：');
        const big = addTemplate([], { name: 'x', base: 'paper', options: {}, css: `.a { color: red; /* ${'z'.repeat(21000)} */ }` });
        equal(big.ok, false, '超 20 KB：');
        const renamed = renameTemplate(a.list, a.template.id, '新名字');
        equal(renamed[0].name, '新名字'); equal(renameTemplate(a.list, a.template.id, '  '), null);
        equal(removeTemplate(renamed, a.template.id), []);
        const dirty = normalizeTemplates([{ id: 't1', name: '好', base: 'paper', options: { palette: 'sky' } }, { id: 't1', name: '重复 id', base: 'paper' }, { id: 'bad id', name: 'x', base: 'paper' },
            { id: 't2', name: '', base: 'paper' }, { id: 't3', name: 'x', base: 'neon' }, null, 'x', { id: 't4', name: '带坏 css', base: 'dark', css: 'body { color: red }', options: { radius: 99 } }]);
        equal(dirty.map(t => t.id), ['t1', 't4']);
        equal(dirty[1].css, '', '读出来时坏 css 丢掉：'); equal(dirty[1].options.radius, 0, '读出来时坏值回默认：');
        equal(normalizeTemplates('nope'), []);
        equal(normalizeTemplates(Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, name: `n${i}`, base: 'paper' }))).length, 30, '读出来也最多 30 个：');
    });
    check('T104 模板文件往返：导出 → 导入得到同一套；文件里的字段齐全', () => {
        const t = { id: 'tx', name: '我的', base: 'dark', options: normalizeOptions({ palette: 'custom', customA: '#102030', customB: '#304050', customAngle: 225, headerOn: true, headerTitle: '夜', texture: 'dots', lineHeight: 1.6 }), css: '.mes_text q { color: #f90; }' };
        const text = templateToText(t);
        const file = JSON.parse(text);
        equal(Object.keys(file), ['format', 'version', 'name', 'base', 'options', 'css']);
        equal(file.format, 'stcr-card-template'); equal(file.version, 1);
        const back = parseTemplateText(text);
        equal(back.ok, true); equal(back.template, { name: '我的', base: 'dark', options: t.options, css: t.css });
        equal(JSON.stringify(Object.keys(file.options).sort()), JSON.stringify([...OPTION_KEYS].sort()), 'options 键齐全：');
    });
    // ───────── T104 追加：写 CSS 的便利（类名指南、示例、新选项、自定义样式偏好） ─────────
    check('T104 新选项：版式 / 对白 / 名字 / 边框 默认不加类（内置四套外观不变）、坏值回默认、旧模板文件照样能读', () => {
        equal([DEFAULT_OPTIONS.layout, DEFAULT_OPTIONS.quoteStyle, DEFAULT_OPTIONS.nameStyle, DEFAULT_OPTIONS.frame], ['flow', 'color', 'plain', 'none']);
        const messy = normalizeOptions({ layout: 'bubble', quoteStyle: 'neon', nameStyle: 'chip', frame: 'thin' });
        equal([messy.layout, messy.quoteStyle, messy.nameStyle, messy.frame], ['bubble', 'color', 'chip', 'thin']);
        // 不带新键的老文件（T104 第一版导出的）：读进来新选项取默认
        const old = JSON.stringify({ format: 'stcr-card-template', version: 1, name: '老的', base: 'paper', options: { palette: 'sky' } });
        const parsed = parseTemplateText(old);
        equal(parsed.ok, true); equal(parsed.template.options.layout, 'flow');
        const bad = parseTemplateText(JSON.stringify({ format: 'stcr-card-template', version: 1, name: 'x', base: 'paper', options: { layout: 'grid' } }));
        equal(bad.ok, false); equal(/layout/.test(bad.error), true, '错误里点名 layout：');
    });
    check('T104 自定义样式偏好：prefs.css 只收字符串，过长回空；没记过 = null', () => {
        equal(normalizeCardPrefs({}).css, null);
        equal(normalizeCardPrefs({ css: '.mes_text q { color: red; }' }).css, '.mes_text q { color: red; }');
        equal(normalizeCardPrefs({ css: 'x'.repeat(9001) }).css, '');
        equal(normalizeCardPrefs({ css: 5 }).css, null);
    });
    check('T104 CSS 指南：示例是一份合法模板（推文版式）；指南里的选项取值就是代码里的真实取值', () => {
        const text = templateToText({ id: 'x', name: EXAMPLE_TWEET.name, base: EXAMPLE_TWEET.base, options: normalizeOptions(EXAMPLE_TWEET.options), css: EXAMPLE_TWEET.css });
        const back = parseTemplateText(text);
        equal(back.ok, true, back.error);
        equal(checkTemplateCss(EXAMPLE_TWEET.css).ok, true);
        const guide = buildCssGuide();
        for (const palette of PALETTES) equal(guide.includes(palette.id), true, `指南里有配色 ${palette.id}：`);
        for (const word of ['stcr-card-template', 'bubble', 'highlight', 'frame', '4.5:1', '!important', '--stcr-c-name']) equal(guide.includes(word), true, `指南里有 ${word}：`);
        equal(guide.length < 12000, true, '指南不要长到贴给 AI 嫌多：');
    });
    return [...results];
}

/** 静态铁律（D02/D10/§5）：只在 Node 跑，读 src/ui 下的源码文本。 */
export async function testUiStatic() {
    const { readdir, readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const files = [];
    async function walk(current) {
        for (const entry of await readdir(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) await walk(full);
            else if (/\.(js|html)$/.test(entry.name) && entry.name !== 'ui.test.js') files.push(full);
        }
    }
    await walk(dir);
    const sources = await Promise.all(files.map(async file => ({ file: path.relative(dir, file), text: await readFile(file, 'utf8') })));
    const out = [];
    // 唯一例外（T55）：使用说明面板读扩展自己的 docs/使用说明.md（同源静态文件，不是 /api）。只放行这一行写法。
    const allowed = hit => hit.file === 'docPanel.js' && /^\s*const response = await fetch\(GUIDE_URL, \{/.test(hit.text);
    const rule = (name, pattern, why) => {
        const hits = sources.flatMap(({ file, text }) => text.split('\n').map((line, i) => ({ file, line: i + 1, text: line }))
            .filter(hit => pattern.test(hit.text) && !/^\s*(\/\/|\*|\/\*)/.test(hit.text) && !allowed(hit)));
        out.push({ name, passed: hits.length === 0, detail: hits.length ? hits.map(h => `${h.file}:${h.line}`).join(', ') : why });
    };
    rule('界面不直接发请求（只走 03 §5）', /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket/, '无 fetch/XHR/beacon/socket（例外：使用说明读自身 docs 文件）');
    rule('界面不出现 /api/ 地址', /['"`]\/api\//, '无 /api/ 字面量');
    rule('不调用写聊天的宿主方法（D02）', /\b(saveChat|saveChatConditional|saveChatDebounced|deleteMessage|deleteLastMessage|renameChat|clearChat|addOneMessage|updateChatMetadata|saveMetadata|openCharacterChat|openGroupChat|reloadCurrentChat)\s*\(/, '无写聊天/切聊天调用');
    rule('不改 chat / chatMetadata / swipe_id（D02）', /(\.chat\b|chatMetadata|chat_metadata|swipe_id)\s*(\[[^\]]*\])?\s*(=(?!=)|\+\+|--|\.push|\.splice|\.pop|\.shift)/, '无赋值或数组修改');
    rule('不用 ST 按钮类名（D10）', /['"`\s.](mes_button|mes_edit|swipe_right|swipe_left|swipes-counter|mes_copy|drawer-toggle|drawer-opener|interactable|menu_button)['"`\s.]/, '无 ST 委托事件类名');
    // 按 ES 模块语法解析每个 .js（`node --check file.js` 在没有 type:module 时不按模块检查，会漏掉语法错）。
    const { spawnSync } = await import('node:child_process');
    const broken = sources.filter(({ file }) => file.endsWith('.js')).flatMap(({ file, text }) => {
        const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: text, encoding: 'utf8' });
        return result.status === 0 ? [] : [`${file}：${(result.stderr.match(/SyntaxError[^\n]*/) ?? ['语法错误'])[0]}`];
    });
    out.push({ name: '每个界面文件都是合法的 ES 模块', passed: broken.length === 0, detail: broken.length ? broken.join('；') : '全部能按模块解析' });
    const mixed = sources.filter(({ text }) => text.includes('\r\n')).map(({ file }) => file);
    out.push({ name: '换行统一为 LF', passed: mixed.length === 0, detail: mixed.length ? mixed.join(', ') : '无 CRLF' });
    // T96：阅读器"纸张 / 夜读"与卡片"纸张 / 深色"模板同一套颜色（readerPalettes.js 是源头）
    {
        const { READER_PALETTES } = await import('../core/readerPalettes.js');
        const css = await readFile(path.join(dir, '..', '..', 'style.css'), 'utf8');
        const block = selector => css.match(new RegExp(`${selector.replace(/[[\]"]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
        const vars = text => Object.fromEntries([...text.matchAll(/--stcr-th-([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
        const { readFileSync } = await import('node:fs');
        const card = readFileSync(path.join(dir, 'cardStudio.js'), 'utf8');
        const keys = { page: 'page', panel: 'panel', text: 'text', faint: 'faint', em: 'em', strong: 'strong', code: 'code', codeText: 'code-text', border: 'border', shadow: 'shadow', underline: 'underline' };
        const wrong = [];
        for (const [theme, tpl] of [['paper', 'paper'], ['night', 'dark']]) {
            const p = READER_PALETTES[theme], v = vars(block(`#stcr_root[data-theme="${theme}"]`));
            for (const [key, name] of Object.entries(keys)) if (v[name] !== p[key]) wrong.push(`${theme}.${key}：style.css ${v[name]} ≠ ${p[key]}`);
            const quote = p.quote ?? `color-mix(in srgb, var(--stcr-host-quote) 60%, ${p.quoteMix})`;
            if (v.quote !== quote) wrong.push(`${theme}.quote：${v.quote}`);
            const has = (selector, decl) => css.includes(`#stcr_root .stcr-card--${tpl}${selector} {`) && css.split(`#stcr_root .stcr-card--${tpl}${selector} {`)[1].split('}')[0].includes(decl);
            if (!has('', `background: ${p.page};`) || !has('', `color: ${p.text};`)) wrong.push(`卡片 ${tpl} 底色/字色`);
            if (!has(' .name_text', `color: ${p.faint};`)) wrong.push(`卡片 ${tpl} 名字色`);
            if (!css.includes(`.stcr-card--${tpl} .mes_text i { color: ${p.em}; }`)) wrong.push(`卡片 ${tpl} 斜体`);
            if (!css.includes(`.stcr-card--${tpl} .mes_text b { color: ${p.strong}; }`)) wrong.push(`卡片 ${tpl} 粗体`);
            if (!css.includes(`.stcr-card--${tpl} .mes_text code { background: ${p.code}; color: ${p.codeText}; }`)) wrong.push(`卡片 ${tpl} 代码`);
            if (p.quote && !card.includes(`const PAPER_RED = '${p.quote}';`)) wrong.push('卡片 PAPER_RED');
            if (p.quoteMix && !card.includes(`60%, ${p.quoteMix})`)) wrong.push('卡片深色强调色');
        }
        out.push({ name: 'T96 阅读器主题与卡片模板同一套颜色（readerPalettes.js）', passed: wrong.length === 0, detail: wrong.length ? wrong.join('；') : '纸张、夜读各项与配色表一致' });
    }
    {
        const { readFileSync } = await import('node:fs');
        const docText = readFileSync(path.join(dir, '..', '..', 'docs', '卡片模板CSS指南.md'), 'utf8').replaceAll('\r\n', '\n');
        const guide = buildCssGuide();
        const source = readFileSync(path.join(dir, '..', '..', 'style.css'), 'utf8') + readFileSync(path.join(dir, 'cardStudio.js'), 'utf8');
        const missing = [...new Set([...guide.matchAll(/(stcr-card[\w-]*)/g)].map(m => m[1]))].filter(name => !name.endsWith('-') && name !== 'stcr-card-template' && !source.includes(name));
        out.push({ name: 'T104 CSS 指南：docs/卡片模板CSS指南.md 与代码生成的一字不差；指南点名的类名在 style.css / cardStudio.js 里都存在',
            passed: docText === guide && missing.length === 0,
            detail: docText !== guide ? '文档与生成的指南不一致（重新生成：node dev/make-css-guide.mjs）' : missing.length ? `不存在的类名：${missing.join('、')}` : '一致' });
    }
    out.push({ name: '界面文件数', passed: sources.length >= 8, detail: sources.map(s => s.file).join(', ') });
    return out;
}

// 直接运行：node src/ui/ui.test.js
if (typeof process !== 'undefined' && process.argv?.[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
    const all = [...await testUiLogic(), ...await testUiStatic()];
    for (const item of all) console.log(`${item.passed ? '通过' : '失败'}  ${item.name}${item.detail ? `（${item.detail}）` : ''}`);
    const failed = all.filter(item => !item.passed).length;
    console.log(failed ? `\n失败 ${failed} 项 / 共 ${all.length} 项` : `\n全部通过（${all.length} 项）`);
    process.exitCode = failed ? 1 : 0;
}
