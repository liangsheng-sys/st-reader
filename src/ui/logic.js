// ST Reader — AGPL-3.0
// 阅读器界面的纯逻辑：不碰 DOM、不碰宿主，Node 与浏览器共用（ui.test.js）。

/** 设置项的取值范围。null 表示"跟随主题 / 跟随排版方向的默认值"。 */
export const PREF_LIMITS = Object.freeze({
    fontDelta: { min: -6, max: 14 },
    lineHeight: { min: 1.2, max: 2.4 },
    width: { min: 480, max: 1200 },
});

export const DEFAULT_PREFS = Object.freeze({
    direction: 'b',        // 'b' 原样（人类选定为主）/ 'a' 书页
    mode: null,            // 'scroll' / 'paged'；null = 跟随方向默认
    fontDelta: 0,          // 在主题字号上加减的像素
    lineHeight: null,      // null = 跟随主题
    width: null,           // 正文栏最大宽度 px；null = 跟随方向默认
    hideUser: false,
    expandAllReasoning: false,
    hideReasoning: false,  // T42：整行不显示"思考了 x 秒"，工具条的 🧠 也藏起来
    redact: false,         // T45：脱敏显示（屏蔽词与我的替换规则套到正文显示上）
    aaLayout: 'bar',       // T45 验收后：Aa 设置的样子，'bar' 底部长条（一行横排）/ 'panel' 两列面板
    htmlMode: 'render',    // T44b：楼里的 HTML 默认"渲染"还是"原文"
    htmlNetwork: true,     // T44b：HTML 默认允许加载外链（人类 2026-09-30 定，修订 D16）；可在 Aa 关掉
    htmlWidth: 390,        // T44b：HTML 渲染宽度，390 / 768 / 1200 / 'fit'；最近一次选的记成默认
    drawerPinned: false,
    panelPinned: false,
    updateNotice: true,    // T54b：更新后第一次打开弹"本次更新了什么"；面板里勾"不再提醒"就关
});

/** 各排版方向在用户没手动改过时的默认值（02 §7 差异表）。width null = 跟随 ST 聊天宽度。 */
const DIRECTION_DEFAULTS = Object.freeze({
    a: Object.freeze({ mode: 'paged', width: 680 }),
    b: Object.freeze({ mode: 'scroll', width: null }),
});

const clamp = (value, { min, max }) => Math.min(max, Math.max(min, value));

/** 把存储里读出的任意值收拾成合法设置；坏值回到默认，不抛错。 */
export function normalizePrefs(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const out = { ...DEFAULT_PREFS };
    if (input.direction === 'a' || input.direction === 'b') out.direction = input.direction;
    if (input.mode === 'scroll' || input.mode === 'paged') out.mode = input.mode;
    if (input.aaLayout === 'bar' || input.aaLayout === 'panel') out.aaLayout = input.aaLayout;
    if (input.htmlMode === 'render' || input.htmlMode === 'source') out.htmlMode = input.htmlMode;
    if ([390, 768, 1200, 'fit'].includes(input.htmlWidth)) out.htmlWidth = input.htmlWidth;
    if (Number.isFinite(input.fontDelta)) out.fontDelta = Math.round(clamp(input.fontDelta, PREF_LIMITS.fontDelta));
    if (Number.isFinite(input.lineHeight)) out.lineHeight = Math.round(clamp(input.lineHeight, PREF_LIMITS.lineHeight) * 10) / 10;
    if (Number.isFinite(input.width)) out.width = Math.round(clamp(input.width, PREF_LIMITS.width) / 10) * 10;
    for (const key of ['hideUser', 'expandAllReasoning', 'hideReasoning', 'redact', 'htmlNetwork', 'drawerPinned', 'panelPinned', 'updateNotice']) {
        if (typeof input[key] === 'boolean') out[key] = input[key];
    }
    return out;
}

/** 实际生效的阅读模式与宽度：用户改过的优先，否则取方向默认。 */
export function effectivePrefs(prefs) {
    const defaults = DIRECTION_DEFAULTS[prefs.direction] ?? DIRECTION_DEFAULTS.b;
    return { ...prefs, mode: prefs.mode ?? defaults.mode, width: prefs.width ?? defaults.width };
}

/** "思考了 12 秒" / "思考了 1 分 5 秒" / 无时长时"思考过程"。0 秒有效（03 §5.2）。 */
export function reasoningTitle(duration) {
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) return '思考过程';
    const seconds = Math.round(duration);
    if (seconds < 60) return `思考了 ${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `思考了 ${minutes} 分 ${rest} 秒` : `思考了 ${minutes} 分钟`;
}

const pad = n => String(n).padStart(2, '0');

/** 楼层时间："9月27日 21:04"；跨年补年份；无效返回空串。now 只供测试注入。 */
export function formatStamp(iso, now = new Date()) {
    if (!iso) return '';
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return '';
    const day = `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return date.getFullYear() === now.getFullYear() ? day : `${date.getFullYear()}年${day}`;
}

/** 列表里的短日期："今天 21:04" / "昨天" / "9月27日" / "2025-03-02"。 */
export function formatListDate(iso, now = new Date()) {
    if (!iso) return '';
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return '';
    const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
    if (days === 0) return `今天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    if (days === 1) return '昨天';
    if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 候选小列表里每行的开头一句：去掉 markdown/HTML 记号，压成一行，截断。 */
export function previewLine(text, max = 36) {
    const plain = String(text ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[`*_~#>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

/**
 * 候选小列表的每行预览。候选开头常常一模一样（续写、重新生成），
 * 这时跳过共同开头，从"开始不一样"的那句显示，前面加"…"。
 * @param {readonly string[]} texts 各候选原文
 * @returns {string[]}
 */
export function swipePreviews(texts, max = 36) {
    // 保留换行，用来找"一句/一行"的边界；其余空白压成一个空格。
    const plain = texts.map(text => String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/[`*_~#>|]/g, '')
        .replace(/[ \t\r\f\v]+/g, ' ').replace(/ ?\n[\s]*/g, '\n').trim());
    const fallback = () => plain.map(text => previewLine(text, max));
    if (plain.length < 2) return fallback();
    let common = 0;
    const shortest = Math.min(...plain.map(text => text.length));
    while (common < shortest && plain.every(text => text[common] === plain[0][common])) common++;
    if (common < 12) return fallback();
    // 退到共同部分里最后一个句末标点或换行之后，别从半句、半个词中间开始。
    const head = plain[0].slice(0, common);
    const cut = Math.max(...['\n', '。', '！', '？', '!', '?', '；', '”', '」', '】', '…'].map(mark => head.lastIndexOf(mark)));
    if (cut < 0) return fallback();
    return plain.map(text => {
        const rest = previewLine(text.slice(cut + 1), max);
        return rest ? `…${rest}` : previewLine(text, max);
    });
}

/**
 * 隐藏用户楼时，把连续的用户楼合成一段（02 §1.3："— 你 · 3 条 —"）。
 * @param {readonly {index:number,isUser:boolean,isSystem:boolean}[]} models
 * @returns {Map<number, number>} 每段第一楼的楼号 → 这段的楼数
 */
export function hiddenUserRuns(models) {
    const runs = new Map();
    let start = null;
    for (const model of models) {
        if (model.isUser && !model.isSystem) {
            if (start === null) { start = model.index; runs.set(start, 0); }
            runs.set(start, runs.get(start) + 1);
        } else start = null;
    }
    return runs;
}

/** 进度文字（楼号给人看，从 1 开始）。first/last 为零基楼号，total 为总楼数。 */
export function progressText(first, last, total) {
    if (!total) return '空聊天';
    const percent = Math.min(100, Math.round(((last + 1) / total) * 100));
    const range = first === last ? `第 ${first + 1} 楼` : `第 ${first + 1}–${last + 1} 楼`;
    return `${range} · 共 ${total} 楼 · ${percent}%`;
}

/** "跳到第 N 楼"输入 → 零基楼号；无效返回 null。 */
export function parseJumpInput(value, total) {
    const n = Number(String(value ?? '').trim());
    if (!Number.isInteger(n) || n < 1 || n > total) return null;
    return n - 1;
}

/** 从存储读出的候选记忆里取一个仍然有效的候选号；无效回到 ST 当前候选。 */
export function pickSwipe(remembered, model) {
    return Number.isInteger(remembered) && remembered >= 0 && remembered < model.swipes.length ? remembered : model.swipeId;
}

/** 列表过滤：名字、标题、预览里任一处包含关键词（不区分大小写）。 */
export function matchesFilter(query, ...fields) {
    const q = String(query ?? '').trim().toLowerCase();
    if (!q) return true;
    return fields.some(field => String(field ?? '').toLowerCase().includes(q));
}

/**
 * 进度记录表只保留最近 max 个聊天，按时间淘汰最旧的。
 * @param {Record<string,{t:number}>} table
 */
export function pruneProgress(table, max = 300) {
    const entries = Object.entries(table ?? {}).filter(([, value]) => value && Number.isFinite(value.t));
    if (entries.length <= max) return Object.fromEntries(entries);
    entries.sort((a, b) => b[1].t - a[1].t);
    return Object.fromEntries(entries.slice(0, max));
}

// ───────────────────────── 分享卡片（T23a）的纯逻辑 ─────────────────────────

/** 三档尺寸（02 §6.2）。width/minHeight 是 CSS 像素，导出时 ×2，得到 1080×1350 / 1080×1080 / 1600×900 起。 */
export const CARD_SIZES = Object.freeze({
    portrait: Object.freeze({ width: 540, minHeight: 675, label: '竖版' }),
    square: Object.freeze({ width: 540, minHeight: 540, label: '方形' }),
    wide: Object.freeze({ width: 800, minHeight: 450, label: '宽版' }),
});
export const CARD_TEMPLATES = Object.freeze(['theme', 'paper', 'dark', 'digest']);
export const CARD_MASKS = Object.freeze(['bar', 'block', 'sticker']);
/** 小图案只用 core 允许的六个内置图标（03 §5.9 MaskStyle.icon）。 */
export const CARD_ICON_CHOICES = Object.freeze(['fa-star', 'fa-heart', 'fa-cat', 'fa-cloud', 'fa-moon', 'fa-shield']);

export const DEFAULT_CARD_PREFS = Object.freeze({
    template: null,        // null = 跟随排版方向：原样→继承主题，书页→纸张（02 §7）
    size: 'portrait',
    mask: 'bar',
    icon: 'fa-star',
    uniform: true,         // 统一长度：遮盖一律约 3 字宽，长度也不泄密（02 §6.3）
    showNames: true,
    signatureOn: true,
    signature: 'ST Reader',
    digestTitle: '一段故事',
    digestSourceOn: true,
    digestAccent: 'blue',  // 'blue' / 'theme'
    maskAsset: null,       // 小图案默认用我导入的图片（store.assets 的 id）；null = 用 icon
    digestCover: null,     // 书摘封面用我导入的图片；null = 强调色方块写标题
    maskColor: null,       // 色块 / 小图案的颜色（T42）；null = 跟随模板强调色
});

/**
 * 颜色选择器的 8 个预设（T42：替换文字背景色与色块遮盖共用一套）。
 * 都是中等明度的柔和色：做文字底色时深色字仍看得清，做色块遮盖时也够实。
 */
export const COLOR_PRESETS = Object.freeze([
    { value: '#f5b8c8', label: '樱粉' }, { value: '#f7b381', label: '杏橙' }, { value: '#f3dd7a', label: '柠黄' },
    { value: '#9bd8bf', label: '薄荷' }, { value: '#93c8ec', label: '天青' }, { value: '#c3b1e6', label: '丁香' },
    { value: '#8f969e', label: '灰岩' }, { value: '#34466b', label: '夜蓝' },
]);

/** 用户输入的色号 → 小写 #rrggbb（core 只收六位实色，03 §5.12）；"#abc"、"abc123" 也认；不合法返回 null。 */
export function cleanHexColor(value) {
    const raw = String(value ?? '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(raw)) return `#${[...raw].map(c => c + c).join('')}`.toLowerCase();
    return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toLowerCase()}` : null;
}

/** 存储里读出的卡片偏好 → 合法值。名字替换的两个开关故意不记：每次打开都从"开"开始（先保护再说）。 */
export function normalizeCardPrefs(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const out = { ...DEFAULT_CARD_PREFS };
    if (CARD_TEMPLATES.includes(input.template)) out.template = input.template;
    if (Object.hasOwn(CARD_SIZES, input.size)) out.size = input.size;
    if (CARD_MASKS.includes(input.mask)) out.mask = input.mask;
    if (CARD_ICON_CHOICES.includes(input.icon)) out.icon = input.icon;
    for (const key of ['uniform', 'showNames', 'signatureOn', 'digestSourceOn']) if (typeof input[key] === 'boolean') out[key] = input[key];
    if (typeof input.signature === 'string') out.signature = input.signature.slice(0, 40);
    if (typeof input.digestTitle === 'string') out.digestTitle = input.digestTitle.slice(0, 40);
    if (input.digestAccent === 'blue' || input.digestAccent === 'theme') out.digestAccent = input.digestAccent;
    // 图片 id 是否还在由工作台对照 store.assets 再查一遍
    for (const key of ['maskAsset', 'digestCover']) if (typeof input[key] === 'string' && input[key] && input[key].length <= 300) out[key] = input[key];
    if (typeof input.maskColor === 'string') out.maskColor = cleanHexColor(input.maskColor);
    return out;
}

/** 导出文件名：st-reader-card-20260928-2104.png（不带聊天名、角色名）。 */
export function cardFileName(date = new Date()) {
    return `st-reader-card-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.png`;
}

/**
 * 对齐两段文字：b 是 a 把一些词（名字）换掉之后的样子。返回相等段与不同段，用来把阅读器里的选区位置
 * 换算到"已替换名字"的卡片副本上。逐字前进，遇到不同就在前方找一处连续 window 个字都相同的地方重新对上。
 * @returns {{a0:number,a1:number,b0:number,b1:number,equal:boolean}[]}
 */
export function alignTexts(a, b, { window = 8, reach = 96 } = {}) {
    const segments = [];
    let i = 0, j = 0;
    const synced = (ai, bj) => {
        if (ai > a.length || bj > b.length) return false;
        if (ai < a.length && bj < b.length && a[ai] !== b[bj]) return false;
        const ta = a.slice(ai, ai + window), tb = b.slice(bj, bj + window);
        return ta === tb && (ta.length === window || (ai + ta.length === a.length && bj + tb.length === b.length));
    };
    while (i < a.length || j < b.length) {
        const si = i, sj = j;
        while (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; }
        if (i > si) segments.push({ a0: si, a1: i, b0: sj, b1: j, equal: true });
        if (i >= a.length && j >= b.length) break;
        let next = null;
        for (let d = 1; d <= reach * 2 && !next; d++) {
            for (let da = Math.max(0, d - reach); da <= Math.min(d, reach); da++) {
                if (synced(i + da, j + d - da)) { next = [i + da, j + d - da]; break; }
            }
        }
        next ??= [a.length, b.length];
        segments.push(...refineDiff(a, b, i, next[0], j, next[1]));
        [i, j] = next;
    }
    return segments;
}

/** 名字挨得很近时（"爱丽丝看着小明"），粗对齐会把两处连成一段；用小范围的最长公共子序列再切开。单个字的巧合不算。 */
function refineDiff(a, b, a0, a1, b0, b1) {
    const n = a1 - a0, m = b1 - b0;
    const whole = [{ a0, a1, b0, b1, equal: false }];
    if (!n || !m || n * m > 250000) return whole;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let x = n - 1; x >= 0; x--) for (let y = m - 1; y >= 0; y--) {
        dp[x][y] = a[a0 + x] === b[b0 + y] ? dp[x + 1][y + 1] + 1 : Math.max(dp[x + 1][y], dp[x][y + 1]);
    }
    const runs = [];
    for (let x = 0, y = 0; x < n && y < m;) {
        if (a[a0 + x] === b[b0 + y] && dp[x][y] === dp[x + 1][y + 1] + 1) {
            const last = runs.at(-1);
            if (last && last.x1 === x && last.y1 === y) { last.x1++; last.y1++; } else runs.push({ x0: x, x1: x + 1, y0: y, y1: y + 1 });
            x++; y++;
        } else if (dp[x + 1][y] >= dp[x][y + 1]) x++;
        else y++;
    }
    const out = [];
    let x = 0, y = 0;
    for (const run of runs.filter(r => r.x1 - r.x0 >= 2)) {
        if (run.x0 > x || run.y0 > y) out.push({ a0: a0 + x, a1: a0 + run.x0, b0: b0 + y, b1: b0 + run.y0, equal: false });
        out.push({ a0: a0 + run.x0, a1: a0 + run.x1, b0: b0 + run.y0, b1: b0 + run.y1, equal: true });
        x = run.x1; y = run.y1;
    }
    if (x < n || y < m) out.push({ a0: a0 + x, a1: a1, b0: b0 + y, b1: b1, equal: false });
    return out.length ? out : whole;
}

/**
 * 把 a 里的位置换算到 b。落在"不同段"（被替换的名字）中间时：起点往前靠、终点往后靠，
 * 名字只选了半个也会整个带上（换成 char 之类的替换词）。
 */
export function mapOffset(segments, x, edge = 'start') {
    if (!segments.length) return 0;
    for (const s of segments) {
        const inside = edge === 'start' ? x >= s.a0 && x < s.a1 : x > s.a0 && x <= s.a1;
        if (!inside) continue;
        if (s.equal) return s.b0 + (x - s.a0);
        return edge === 'start' ? s.b0 : s.b1;
    }
    return x <= 0 ? 0 : segments.at(-1).b1;
}

/**
 * 预览里点到的那个"词"：用浏览器自带的分词（中文按词典分词），标点和空白不算词。
 * @returns {{start:number,end:number}|null}
 */
export function wordAt(text, offset, segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('zh', { granularity: 'word' }) : null) {
    if (!text || offset < 0 || offset > text.length) return null;
    if (segmenter) {
        for (const part of segmenter.segment(text)) {
            const end = part.index + part.segment.length;
            if (offset >= part.index && offset < end) return part.isWordLike ? { start: part.index, end } : null;
        }
        return null;
    }
    const word = /[\p{L}\p{N}_]/u;
    if (!word.test(text[offset] ?? '')) return null;
    let start = offset, end = offset + 1;
    while (start > 0 && word.test(text[start - 1])) start--;
    while (end < text.length && word.test(text[end])) end++;
    return { start, end };
}

/** 屏蔽词输入：去首尾空白、压掉换行；空、超过 40 字返回 null。 */
export function cleanMaskWord(value, max = 40) {
    const word = String(value ?? '').replace(/\s*\n\s*/g, ' ').trim();
    return word && word.length <= max ? word : null;
}

// ───────────────────────── 抽屉"按角色"（T43、F12、D20） ─────────────────────────

/**
 * 与 ST 角色面板排序下拉一一对应（public/index.html #character_sort_order），"跟随 ST"时按 ST 当前那一项排。
 * data_size（内容多少）ST 也有，一起支持；ST 选"随机"或"搜索"时跟随失败，退回 A-Z。
 */
export const OWNER_SORTS = Object.freeze([
    { id: 'name:asc', field: 'name', order: 'asc', label: 'A-Z' },
    { id: 'name:desc', field: 'name', order: 'desc', label: 'Z-A' },
    { id: 'create_date:desc', field: 'create_date', order: 'desc', label: '最新创建' },
    { id: 'create_date:asc', field: 'create_date', order: 'asc', label: '最早创建' },
    { id: 'fav:desc', field: 'fav', order: 'desc', label: '收藏的在前' },
    { id: 'date_last_chat:desc', field: 'date_last_chat', order: 'desc', label: '最近聊过' },
    { id: 'chat_size:desc', field: 'chat_size', order: 'desc', label: '聊天最多' },
    { id: 'chat_size:asc', field: 'chat_size', order: 'asc', label: '聊天最少' },
    { id: 'data_size:desc', field: 'data_size', order: 'desc', label: '内容最多' },
    { id: 'data_size:asc', field: 'data_size', order: 'asc', label: '内容最少' },
]);

/** ST 的 power_user.sort_field / sort_order → 上表的一项；认不出（随机、搜索、缺失）时返回 A-Z。 */
export function stOwnerSort(field, order) {
    return OWNER_SORTS.find(s => s.field === field && s.order === order) ?? OWNER_SORTS[0];
}

/** ST 的 create_date 可能是毫秒数、ISO 字符串，或 "2024-5-3 @13h 20m 11s 123ms" 这种旧格式。认不出返回 0。 */
export function parseStDate(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value ?? '').trim();
    if (!text) return 0;
    if (/^\d+$/.test(text)) return Number(text);
    const old = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s*@(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s(?:\s*(\d{1,3})ms)?/);
    if (old) return new Date(+old[1], +old[2] - 1, +old[3], +old[4], +old[5], +old[6], +(old[7] ?? 0)).getTime();
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * 按角色列表排序（不改入参）。字段名与 ST 一致：name / create_date / fav / date_last_chat / chat_size / data_size。
 * 与 ST 相同：收藏排序时收藏的在前；同值按名字，保证每次顺序一样。
 * @param {readonly {name:string, [key:string]:any}[]} owners
 */
export function sortOwners(owners, sort) {
    const { field, order } = sort ?? OWNER_SORTS[0];
    // 和 ST 一样用浏览器默认语言比较名字（ST 的 compareFunc 是 a.localeCompare(b)），顺序才和 ST 角色列表一致
    const byName = (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''));
    const value = owner => {
        const raw = owner[field];
        if (field === 'create_date') return parseStDate(raw);
        if (field === 'fav') return raw === true || raw === 'true' ? 1 : 0;
        return Number.isFinite(Number(raw)) ? Number(raw) : 0;
    };
    const compare = field === 'name' ? byName : (a, b) => value(a) - value(b) || 0;
    const sign = order === 'desc' ? -1 : 1;
    return [...owners].sort((a, b) => sign * compare(a, b) || byName(a, b));
}

/** 名字搜索 + 标签筛选（选了多个标签 = 都要有，和 ST 的标签筛选一样）。 */
export function filterOwners(owners, { query = '', tags = [] } = {}) {
    const wanted = [...tags];
    return owners.filter(owner => matchesFilter(query, owner.name) && wanted.every(tag => owner.tags?.includes(tag)));
}
