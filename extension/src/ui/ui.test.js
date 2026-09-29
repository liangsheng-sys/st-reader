// 阅读器界面自测（T21）。纯 Node 运行，无依赖：node extension/src/ui/ui.test.js
// 1) logic.js 的纯逻辑；2) 静态铁律：src/ui 不直接 fetch、不碰 /api、不写 chat/元信息/swipe_id、不用 ST 按钮类名。

import { DEFAULT_PREFS, effectivePrefs, formatListDate, formatStamp, hiddenUserRuns, matchesFilter, normalizePrefs, parseJumpInput,
    pickSwipe, previewLine, progressText, pruneProgress, reasoningTitle, swipePreviews } from './logic.js';

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
    check('方向默认：B 滚动+跟随 ST 宽度，A 分页+680；用户改过的优先', () => {
        equal(effectivePrefs(normalizePrefs({})).mode, 'scroll');
        equal(effectivePrefs(normalizePrefs({})).width, null);
        equal(effectivePrefs(normalizePrefs({ direction: 'a' })).mode, 'paged');
        equal(effectivePrefs(normalizePrefs({ direction: 'a' })).width, 680);
        equal(effectivePrefs(normalizePrefs({ direction: 'a', mode: 'scroll', width: 900 })).mode, 'scroll');
        equal(effectivePrefs(normalizePrefs({ direction: 'a', mode: 'scroll', width: 900 })).width, 900);
    });
    check('隐藏用户楼：连续用户楼合成一段，system 与角色楼打断', () => {
        const m = (index, isUser, isSystem = false) => ({ index, isUser, isSystem });
        const runs = hiddenUserRuns([m(10, true), m(11, true), m(12, false), m(13, true), m(14, true, true), m(15, true), m(16, true), m(17, true)]);
        equal([...runs.entries()], [[10, 2], [13, 1], [15, 3]]);
        equal([...hiddenUserRuns([m(0, false)]).entries()], []);
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
    const rule = (name, pattern, why) => {
        const hits = sources.flatMap(({ file, text }) => text.split('\n').map((line, i) => ({ file, line: i + 1, text: line }))
            .filter(({ text }) => pattern.test(text) && !/^\s*(\/\/|\*|\/\*)/.test(text)));
        out.push({ name, passed: hits.length === 0, detail: hits.length ? hits.map(h => `${h.file}:${h.line}`).join(', ') : why });
    };
    rule('界面不直接发请求（只走 03 §5）', /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket/, '无 fetch/XHR/beacon/socket');
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

// 直接运行：node extension/src/ui/ui.test.js
if (typeof process !== 'undefined' && process.argv?.[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
    const all = [...await testUiLogic(), ...await testUiStatic()];
    for (const item of all) console.log(`${item.passed ? '通过' : '失败'}  ${item.name}${item.detail ? `（${item.detail}）` : ''}`);
    const failed = all.filter(item => !item.passed).length;
    console.log(failed ? `\n失败 ${failed} 项 / 共 ${all.length} 项` : `\n全部通过（${all.length} 项）`);
    process.exitCode = failed ? 1 : 0;
}
