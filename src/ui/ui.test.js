// ST Reader — AGPL-3.0
// 阅读器界面自测（T21）。纯 Node 运行，无依赖：node src/ui/ui.test.js
// 1) logic.js 的纯逻辑；2) 静态铁律：src/ui 不直接 fetch、不碰 /api、不写 chat/元信息/swipe_id、不用 ST 按钮类名。

import { alignTexts, cardFileName, filterOwners, OWNER_SORTS, parseStDate, sortOwners, stOwnerSort, cleanHexColor, cleanMaskWord, COLOR_PRESETS, DEFAULT_CARD_PREFS, DEFAULT_PREFS, effectivePrefs, followPlacement, foldRuns, formatListDate, formatStamp, hiddenUserRuns, isFolded, isStHidden,
    isSystemLike, mapOffset, matchesFilter, normalizeCardPrefs, normalizePrefs, parseJumpInput, pickSwipe, previewLine, progressText, pruneProgress,
    reasoningTitle, swipePreviews, wordAt, formatBytes, mirrorStatusText, restoreSummary, faultReport, cardExportReport } from './logic.js';

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
        equal([normalizePrefs({ htmlBarHidden: 1, followSide: 'top' }).htmlBarHidden, normalizePrefs({ followSide: 'top' }).followSide], [false, 'right']);
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
