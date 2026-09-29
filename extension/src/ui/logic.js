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
    drawerPinned: false,
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
    if (Number.isFinite(input.fontDelta)) out.fontDelta = Math.round(clamp(input.fontDelta, PREF_LIMITS.fontDelta));
    if (Number.isFinite(input.lineHeight)) out.lineHeight = Math.round(clamp(input.lineHeight, PREF_LIMITS.lineHeight) * 10) / 10;
    if (Number.isFinite(input.width)) out.width = Math.round(clamp(input.width, PREF_LIMITS.width) / 10) * 10;
    for (const key of ['hideUser', 'expandAllReasoning', 'drawerPinned']) {
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
