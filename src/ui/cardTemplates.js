// ST Reader — AGPL-3.0
// 分享卡片的模板系统（T104、D49、F22）：纯逻辑，Node 可测，不碰 DOM。
// 一套"模板" = 版式底子 base（继承主题 / 纸张 / 深色 / 书摘）+ 一组选项值 options + 可选的附加 CSS。
// 内置四套 = base 不同、选项全是默认值（"默认"= 沿用该底子自带的版式，所以外观与改造前一致）。
// 自制模板与模板文件（JSON）都用同一套校验；任何不认识的键、越界的值一律拒绝并说明是哪一项。

export const TEMPLATE_FORMAT = 'stcr-card-template';
export const TEMPLATE_VERSION = 1;
export const TEMPLATE_BASES = Object.freeze(['theme', 'paper', 'dark', 'digest']);
export const MAX_TEMPLATES = 30;
export const MAX_TEMPLATE_BYTES = 20 * 1024;
export const MAX_TEMPLATE_CSS_BYTES = 8 * 1024;
export const MAX_TEMPLATE_NAME = 20;

const byteLength = text => new TextEncoder().encode(text).length;
const hex6 = value => {
    const raw = String(value ?? '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(raw)) return `#${[...raw].map(c => c + c).join('')}`.toLowerCase();
    return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toLowerCase()}` : null;
};

// ───────────── 选项 ─────────────

/** 页眉图标：ST 已加载的 Font Awesome（6.x 免费实心）里挑的 12 枚，适合"故事"。 */
export const HEADER_ICONS = Object.freeze([
    { id: 'fa-feather-pointed', label: '羽毛笔' }, { id: 'fa-pen-nib', label: '钢笔尖' }, { id: 'fa-book', label: '书' }, { id: 'fa-book-open', label: '翻开的书' },
    { id: 'fa-scroll', label: '卷轴' }, { id: 'fa-moon', label: '月亮' }, { id: 'fa-star', label: '星星' }, { id: 'fa-mug-hot', label: '茶杯' },
    { id: 'fa-masks-theater', label: '剧场面具' }, { id: 'fa-leaf', label: '叶子' }, { id: 'fa-heart', label: '心' }, { id: 'fa-wand-magic-sparkles', label: '魔杖' },
]);
export const FONT_SIZES = Object.freeze([{ id: 's', label: '小', scale: 1 }, { id: 'm', label: '中', scale: 1.12 }, { id: 'l', label: '大', scale: 1.25 }]);
/** null = 默认（沿用该底子自带的行距）。 */
export const LINE_HEIGHTS = Object.freeze([{ id: null, label: '默认' }, { id: 1.6, label: '紧' }, { id: 1.8, label: '适中' }, { id: 2, label: '宽' }]);
export const LETTER_SPACINGS = Object.freeze([{ id: 0, label: '默认' }, { id: 0.02, label: '微' }, { id: 0.05, label: '宽' }]);
export const ALIGNS = Object.freeze([{ id: 'left', label: '左对齐' }, { id: 'justify', label: '两端对齐' }]);
/** "标准"= 该底子自带的内边距；紧 / 宽是它的 0.7 / 1.3 倍。 */
export const PADDINGS = Object.freeze([{ id: 'tight', label: '紧', scale: 0.7 }, { id: 'normal', label: '标准', scale: 1 }, { id: 'wide', label: '宽', scale: 1.3 }]);
export const RADII = Object.freeze([{ id: 0, label: '直角' }, { id: 12, label: '小圆角' }, { id: 24, label: '大圆角' }]);
export const ANGLES = Object.freeze([0, 45, 90, 135, 180, 225, 270, 315]);
export const TEXTURES = Object.freeze([{ id: 'none', label: '无' }, { id: 'grid', label: '格纹' }, { id: 'dots', label: '点阵' }, { id: 'lines', label: '横线' }]);
/** 只写族名，本机没装就回退到后面的，不下载任何字体。 */
export const FONT_FAMILIES = Object.freeze([
    { id: 'follow', label: '跟随正文', css: null },
    { id: 'serif', label: '系统衬线', css: '"Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", SimSun, serif' },
    { id: 'sans', label: '系统无衬线', css: '"Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif' },
    { id: 'kai', label: '系统楷体', css: 'KaiTi, "Kaiti SC", STKaiti, serif' },
]);

export const MAX_HEADER_TITLE = 30;
export const MAX_LEAD_TEXT = 80;

/** 选项的默认值；每一项的说明用于出错提示。 */
export const DEFAULT_OPTIONS = Object.freeze({
    headerOn: false, headerIcon: 'fa-feather-pointed', headerTitle: '', headerDate: false,
    leadOn: false, leadText: '',
    footDate: false, footCount: false,
    fontSize: 's', lineHeight: null, letterSpacing: 0, align: 'left', padding: 'normal', radius: 0,
    palette: null, customA: '#f3e9dc', customB: null, customAngle: 135,
    texture: 'none', fontFamily: 'follow',
});

const ids = list => list.map(item => item.id);
/** 每个键：{ label, ok(value) → 规范值或 undefined, allowed: 出错时告诉用户能填什么 } */
const SPEC = {
    headerOn: { label: '页眉开关', kind: 'bool' },
    headerIcon: { label: '页眉图标', kind: 'enum', values: ids(HEADER_ICONS) },
    headerTitle: { label: '页眉标题', kind: 'text', max: MAX_HEADER_TITLE },
    headerDate: { label: '页眉日期', kind: 'bool' },
    leadOn: { label: '按语开关', kind: 'bool' },
    leadText: { label: '按语', kind: 'text', max: MAX_LEAD_TEXT },
    footDate: { label: '页脚日期', kind: 'bool' },
    footCount: { label: '页脚字数', kind: 'bool' },
    fontSize: { label: '字号', kind: 'enum', values: ids(FONT_SIZES) },
    lineHeight: { label: '行距', kind: 'enum', values: ids(LINE_HEIGHTS) },
    letterSpacing: { label: '字距', kind: 'enum', values: ids(LETTER_SPACINGS) },
    align: { label: '对齐', kind: 'enum', values: ids(ALIGNS) },
    padding: { label: '内边距', kind: 'enum', values: ids(PADDINGS) },
    radius: { label: '圆角', kind: 'enum', values: ids(RADII) },
    palette: { label: '配色', kind: 'palette' },
    customA: { label: '自定义配色·颜色一', kind: 'hex' },
    customB: { label: '自定义配色·颜色二', kind: 'hex-or-null' },
    customAngle: { label: '自定义配色·角度', kind: 'enum', values: [...ANGLES] },
    texture: { label: '纹理', kind: 'enum', values: ids(TEXTURES) },
    fontFamily: { label: '字体', kind: 'enum', values: ids(FONT_FAMILIES) },
};
export const OPTION_KEYS = Object.freeze(Object.keys(SPEC));

/** 一项值是否合法 → { value } 或 { error }。 */
function checkOne(key, value) {
    const spec = SPEC[key];
    const name = `options.${key}（${spec.label}）`;
    switch (spec.kind) {
        case 'bool':
            return typeof value === 'boolean' ? { value } : { error: `${name} 应为 true 或 false` };
        case 'text':
            if (typeof value !== 'string') return { error: `${name} 应为文字` };
            return [...value].length <= spec.max ? { value } : { error: `${name} 最多 ${spec.max} 个字` };
        case 'hex': {
            const color = hex6(value);
            return typeof value === 'string' && color ? { value: color } : { error: `${name} 应为 #RRGGBB 色号` };
        }
        case 'hex-or-null': {
            if (value === null) return { value: null };
            const color = hex6(value);
            return typeof value === 'string' && color ? { value: color } : { error: `${name} 应为 #RRGGBB 色号或 null` };
        }
        case 'palette':
            return value === null || value === 'custom' || PALETTES.some(p => p.id === value) ? { value } : { error: `${name} 只能是 null、"custom" 或内置配色的名字，收到 ${JSON.stringify(value)}` };
        default:
            return spec.values.includes(value) ? { value } : { error: `${name} 的值 ${JSON.stringify(value)} 不在允许范围：${spec.values.map(v => JSON.stringify(v)).join('、')}` };
    }
}

/** 严格校验（模板文件用）：未知键、越界值 → { ok:false, error }；缺的键补默认。 */
export function validateOptions(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'options 应为一个对象' };
    const options = { ...DEFAULT_OPTIONS };
    for (const [key, value] of Object.entries(raw)) {
        if (!Object.hasOwn(SPEC, key)) return { ok: false, error: `options.${key}：不认识的选项` };
        const checked = checkOne(key, value);
        if (checked.error) return { ok: false, error: checked.error };
        options[key] = checked.value;
    }
    return { ok: true, options };
}

/** 宽松规范化（存储里读出的值）：坏值回默认、未知键丢掉。 */
export function normalizeOptions(raw) {
    const out = { ...DEFAULT_OPTIONS };
    if (!raw || typeof raw !== 'object') return out;
    for (const key of OPTION_KEYS) {
        if (!Object.hasOwn(raw, key)) continue;
        const checked = checkOne(key, raw[key]);
        if (!checked.error) out[key] = checked.value;
    }
    return out;
}

export const optionsEqual = (a, b) => OPTION_KEYS.every(key => a?.[key] === b?.[key]);
export const isDefaultOptions = options => optionsEqual(options, DEFAULT_OPTIONS);

// ───────────── 颜色 ─────────────

export const rgbOf = color => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
export const toHex = ([r, g, b]) => `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export function luminance(color) {
    const [r, g, b] = rgbOf(color).map(v => v / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}
export const minContrast = (fg, stops) => Math.min(...stops.map(stop => contrastRatio(fg, stop)));
/** a 与 b 按 t（0–1，越大越靠 b）混合。 */
export function mixHex(a, b, t) {
    const [x, y] = [rgbOf(a), rgbOf(b)];
    return toHex(x.map((v, i) => v + (y[i] - v) * t));
}
export const rgbaOf = (color, alpha) => `rgba(${rgbOf(color).join(', ')}, ${alpha})`;

/**
 * 让 fg 在 stops 上的对比度 ≥ min：不够就一点点推向纯黑或纯白，最后保底纯黑 / 纯白。
 * prefer（比如这组配色的字色）给了就往它那一侧推，名字色、引号色才和字色是同一个"深 / 浅"方向；没给就取对比度更高的一侧。
 */
export function ensureContrast(fg, stops, min = 4.5, prefer = null) {
    if (minContrast(fg, stops) >= min) return fg;
    const target = prefer ? (luminance(prefer) > 0.18 ? '#ffffff' : '#000000') : minContrast('#000000', stops) >= minContrast('#ffffff', stops) ? '#000000' : '#ffffff';
    for (let t = 0.1; t <= 1.0001; t += 0.1) {
        const next = mixHex(fg, target, t);
        if (minContrast(next, stops) >= min) return next;
    }
    return target;
}

/** 底色上该用的字色：深 / 浅两套里挑对比度高的，仍不够 4.5:1 就退到纯黑 / 纯白（总能做到 ≥ 4.58）。 */
export function pickInk(stops) {
    const dark = '#1f2329', light = '#f4f1ea';
    const best = minContrast(dark, stops) >= minContrast(light, stops) ? dark : light;
    return minContrast(best, stops) >= 4.5 ? best : ensureContrast(best, stops, 4.5);
}

// ───────────── 配色 ─────────────

const palette = (id, label, tone, stops, angle, text, name, quote) => Object.freeze({ id, label, tone, stops: Object.freeze(stops), angle, text, name, quote, accent: quote });
/** 18 组：浅 9 / 深 9，含纯色与双色渐变。每组的字色、名字色、引号色在底色（两端）上都 ≥ 4.5:1（ui.test.js 逐组验证）。 */
export const PALETTES = Object.freeze([
    palette('milk', '奶白', 'light', ['#faf7f2'], 0, '#2b2622', '#6f6355', '#a8442f'),
    palette('peach', '蜜桃', 'light', ['#ffeae0', '#ffd2cc'], 135, '#3a2623', '#7d4a43', '#a3302a'),
    palette('sky', '天青', 'light', ['#e4f2fc', '#cde2f7'], 160, '#1f3447', '#4a6580', '#1b64a0'),
    palette('mint', '薄荷', 'light', ['#e6f7ef', '#cfeee0'], 135, '#1d3a30', '#4a6e60', '#17724f'),
    palette('lilac', '丁香', 'light', ['#f1eafc', '#ddd2f5'], 135, '#2e2547', '#5a4e7a', '#6a3cb0'),
    palette('butter', '奶油', 'light', ['#fff7d9', '#fde6ad'], 160, '#3b3016', '#74622f', '#9c520a'),
    palette('rose', '玫瑰', 'light', ['#f8eaec', '#eed0d7'], 135, '#3a2328', '#72495a', '#a3304a'),
    palette('sand', '沙色', 'light', ['#efe6d6'], 0, '#2a2521', '#6f6354', '#8a3a2e'),
    palette('cloud', '云灰', 'light', ['#f3f5f7', '#dde3ea'], 180, '#1f2933', '#52606d', '#2f5f9e'),
    palette('ink', '墨黑', 'dark', ['#15171c'], 0, '#e6e2da', '#a09b92', '#e0a96d'),
    palette('midnight', '午夜', 'dark', ['#1d2646', '#0e1325'], 160, '#e4e8f5', '#97a3cc', '#f2c879'),
    palette('forest', '深林', 'dark', ['#18322b', '#0d1c18'], 135, '#e0efe8', '#8db0a2', '#f0c987'),
    palette('wine', '酒红', 'dark', ['#3c1621', '#1d0b12'], 135, '#f3e4e6', '#bf949d', '#f4b183'),
    palette('dusk', '暮紫', 'dark', ['#3d2b58', '#1e1730'], 160, '#ece4f8', '#aea0cc', '#ffb4a2'),
    palette('ocean', '深海', 'dark', ['#0f3b4c', '#071f2a'], 180, '#def0f5', '#86b6c6', '#ffd08a'),
    palette('cocoa', '可可', 'dark', ['#302520', '#19120f'], 135, '#efe4d9', '#b09f91', '#e9a46a'),
    palette('slate', '石板', 'dark', ['#262b33'], 0, '#e3e7ed', '#9aa4b2', '#8fc1f2'),
    palette('aurora', '极光', 'dark', ['#12313b', '#2b2050'], 135, '#e6f3f0', '#93b9b4', '#9ee6c8'),
]);

/** 自定义两色：字色按底色自动取深 / 浅并保证 4.5:1，名字色、引号色由字色与底色推出。 */
export function derivePalette({ a, b = null, angle = 135 }) {
    let stops = b ? [a, b] : [a];
    let text = pickInk(stops), adjusted = false;
    // 两端亮度差太大（比如红到蓝）时没有一种字色能在两端都清楚：把底色整体压深或提亮一点，直到 ≥ 4.5:1
    if (minContrast(text, stops) < 4.5) {
        for (let t = 0.05; t <= 1.0001 && !adjusted; t += 0.05) {
            for (const [ink, toward] of [['#ffffff', '#000000'], ['#000000', '#ffffff']]) {
                const moved = stops.map(stop => mixHex(stop, toward, t));
                if (minContrast(ink, moved) >= 4.5) { stops = moved; text = ink; adjusted = true; break; }
            }
        }
    }
    const mid = mixHex(stops[0], stops.at(-1), 0.5);
    const dark = luminance(mid) < 0.18;
    return Object.freeze({ id: 'custom', label: '自定义', tone: dark ? 'dark' : 'light', stops, angle, text, adjusted,
        name: ensureContrast(mixHex(text, mid, 0.35), stops, 4.5, text),
        quote: ensureContrast(dark ? '#e8a96b' : '#a5432f', stops, 4.5, text),
        accent: ensureContrast(dark ? '#e8a96b' : '#a5432f', stops, 4.5, text) });
}

/** 选项里的配色 → 完整的一组颜色；没选配色（null）返回 null = 用模板自带的。 */
export function resolvePalette(options) {
    const id = options?.palette ?? null;
    if (id === null) return null;
    const base = id === 'custom' ? derivePalette({ a: options.customA, b: options.customB, angle: options.customAngle }) : PALETTES.find(p => p.id === id);
    if (!base) return null;
    const stops = base.stops, mid = mixHex(stops[0], stops.at(-1), 0.5), dark = base.tone === 'dark';
    return Object.freeze({
        ...base, dark, mid,
        background: stops.length > 1 ? `linear-gradient(${base.angle}deg, ${stops[0]}, ${stops[1]})` : null,
        em: mixHex(base.text, mid, 0.18),
        sign: ensureContrast(mixHex(base.text, mid, 0.4), stops, 4.5, base.text),
        line: rgbaOf(base.text, 0.2), soft: rgbaOf(base.text, 0.07),
        page: dark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.72)',
    });
}

/**
 * 纹理的几层背景（纯 CSS）。颜色 = 正文色的 8–10% 透明度。返回 [{image, size}]，由调用方放在配色渐变之上。
 */
export function textureLayers(kind, textColor) {
    const c = rgbaOf(textColor, kind === 'dots' ? 0.1 : 0.08);
    if (kind === 'grid') return [{ image: `repeating-linear-gradient(0deg, ${c} 0, ${c} 1px, transparent 1px, transparent 26px)`, size: 'auto' },
        { image: `repeating-linear-gradient(90deg, ${c} 0, ${c} 1px, transparent 1px, transparent 26px)`, size: 'auto' }];
    if (kind === 'dots') return [{ image: `radial-gradient(circle at 1px 1px, ${c} 1.3px, transparent 1.7px)`, size: '16px 16px' }];
    if (kind === 'lines') return [{ image: `repeating-linear-gradient(0deg, transparent 0, transparent 31px, ${c} 31px, ${c} 32px)`, size: 'auto' }];
    return [];
}

// ───────────── 日期与字数 ─────────────

/** ISO 日期（messageModel 规范化过的）→ "2026年11月16日"（本地时区）；认不出返回 null。 */
export function formatCardDate(value) {
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日` : null;
}
/** 正文字数：不算空白。传入的文字应已去掉遮盖（遮盖里没有原字）。 */
export const countCardChars = text => [...String(text ?? '').replace(/\s+/g, '')].length;
export const formatCardCount = n => `${n.toLocaleString('en-US')} 字`;

// ───────────── 模板列表 ─────────────

export const BUILTIN_TEMPLATES = Object.freeze([
    Object.freeze({ id: 'theme', label: '继承主题', base: 'theme', options: DEFAULT_OPTIONS }),
    Object.freeze({ id: 'paper', label: '纸张', base: 'paper', options: DEFAULT_OPTIONS }),
    Object.freeze({ id: 'dark', label: '深色', base: 'dark', options: DEFAULT_OPTIONS }),
    Object.freeze({ id: 'digest', label: '书摘', base: 'digest', options: DEFAULT_OPTIONS }),
]);

export const newTemplateId = (random = Math.random) => `t${Date.now().toString(36)}${Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0')}`;
const cleanName = name => [...String(name ?? '').replace(/[\r\n\t]+/g, ' ').trim()].slice(0, MAX_TEMPLATE_NAME).join('');
export const templateName = cleanName;

/** 存储里读出的数组 → 合法模板（坏的丢掉、超出 30 个截断、超过 20 KB 的丢掉）。 */
export function normalizeTemplates(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [], seen = new Set();
    for (const item of raw) {
        if (out.length >= MAX_TEMPLATES) break;
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[\w-]{1,40}$/.test(item.id) || seen.has(item.id)) continue;
        const name = cleanName(item.name);
        if (!name || !TEMPLATE_BASES.includes(item.base)) continue;
        const css = typeof item.css === 'string' && byteLength(item.css) <= MAX_TEMPLATE_CSS_BYTES && checkTemplateCss(item.css).ok ? item.css : '';
        const template = { id: item.id, name, base: item.base, options: normalizeOptions(item.options), css };
        if (byteLength(JSON.stringify(template)) > MAX_TEMPLATE_BYTES) continue;
        seen.add(item.id);
        out.push(template);
    }
    return out;
}

/** 重名时加 " 2"、" 3"……（长度仍 ≤ 20）。 */
export function uniqueName(list, name) {
    const base = cleanName(name) || '我的模板';
    const taken = new Set(list.map(t => t.name));
    if (!taken.has(base)) return base;
    for (let n = 2; n < 100; n++) {
        const suffix = ` ${n}`;
        const candidate = `${[...base].slice(0, MAX_TEMPLATE_NAME - suffix.length).join('')}${suffix}`;
        if (!taken.has(candidate)) return candidate;
    }
    return base;
}

/** 加一套：返回 { ok, list, template } 或 { ok:false, error }。 */
export function addTemplate(list, { name, base, options, css = '' }, { rename = true, id = newTemplateId() } = {}) {
    if (list.length >= MAX_TEMPLATES) return { ok: false, error: `最多存 ${MAX_TEMPLATES} 套自制模板，请先删掉不用的` };
    const clean = cleanName(name);
    if (!clean) return { ok: false, error: '请给模板起个名字（最多 20 个字）' };
    const template = { id, name: rename ? uniqueName(list, clean) : clean, base, options: normalizeOptions(options), css: css || '' };
    if (byteLength(JSON.stringify(template)) > MAX_TEMPLATE_BYTES) return { ok: false, error: '这套模板太大了（超过 20 KB）' };
    return { ok: true, list: [...list, template], template };
}
export const renameTemplate = (list, id, name) => {
    const clean = cleanName(name);
    if (!clean) return null;
    return list.map(t => (t.id === id ? { ...t, name: uniqueName(list.filter(o => o.id !== id), clean) } : t));
};
export const removeTemplate = (list, id) => list.filter(t => t.id !== id);

// ───────────── 模板文件 ─────────────

export const templateToFile = template => ({ format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, name: template.name, base: template.base, options: { ...template.options }, css: template.css || '' });
export const templateToText = template => `${JSON.stringify(templateToFile(template), null, 2)}\n`;

/** 文本 → { ok:true, template:{name, base, options, css} } 或 { ok:false, error }（error 是给人看的一句话）。 */
export function parseTemplateText(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: '内容是空的' };
    if (byteLength(text) > MAX_TEMPLATE_BYTES * 2) return { ok: false, error: '内容太大了：模板文件一般只有几 KB' };
    let data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (error) { return { ok: false, error: `不是有效的 JSON（${String(error.message ?? error).slice(0, 60)}）` }; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: '不是模板文件：最外层应为一个对象' };
    if (data.format !== TEMPLATE_FORMAT) return { ok: false, error: `不是分享卡片模板：format 应为 "${TEMPLATE_FORMAT}"，收到 ${JSON.stringify(data.format)}` };
    if (data.version !== TEMPLATE_VERSION) return { ok: false, error: `版本不对：这个版本只认 version ${TEMPLATE_VERSION}，收到 ${JSON.stringify(data.version)}` };
    if (typeof data.name !== 'string' || !data.name.trim()) return { ok: false, error: 'name 应为模板的名字（1–20 个字）' };
    if ([...data.name.trim()].length > MAX_TEMPLATE_NAME) return { ok: false, error: `name 太长：最多 ${MAX_TEMPLATE_NAME} 个字` };
    if (!TEMPLATE_BASES.includes(data.base)) return { ok: false, error: `base 只能是 ${TEMPLATE_BASES.join('、')}，收到 ${JSON.stringify(data.base)}` };
    const options = validateOptions(data.options ?? {});
    if (!options.ok) return options;
    let css = '';
    if (data.css !== undefined && data.css !== null && data.css !== '') {
        const checked = checkTemplateCss(data.css);
        if (!checked.ok) return { ok: false, error: `css：${checked.error}` };
        css = data.css;
    }
    const template = { name: cleanName(data.name), base: data.base, options: options.options, css };
    if (byteLength(JSON.stringify(template)) > MAX_TEMPLATE_BYTES) return { ok: false, error: '这套模板太大了（超过 20 KB）' };
    return { ok: true, template };
}

// ───────────── 模板自带的附加 CSS ─────────────
// 给高手写的附加样式。导入时先在这里"能拒就拒"（说清楚是哪一条），留下的再逐条交给 core 的 cleanStyleText 清洗（T75）。
// 每条选择器强制前缀到该模板的卡片根，所以只能影响这张卡片里面。

const IDENT = /[\w-]/;

/** 去掉注释，保留字符串。 */
function stripComments(text) {
    let out = '', quote = '';
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quote) { out += c; if (c === '\\' && i + 1 < text.length) out += text[++i]; else if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") { quote = c; out += c; continue; }
        if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); if (end < 0) return null; i = end + 1; out += ' '; continue; }
        out += c;
    }
    return out;
}

/** 顶层拆成 [{prelude, body|null}]；body 为 null 表示以分号结尾的 @ 规则。括号不配对返回 null。 */
function splitBlocks(text) {
    const nodes = [];
    let depthParen = 0, quote = '', start = 0, i = 0;
    while (i < text.length) {
        const c = text[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; i++; continue; }
        if (c === '"' || c === "'") { quote = c; i++; continue; }
        if (c === '(') depthParen++;
        else if (c === ')') depthParen--;
        else if (c === ';' && !depthParen) { if (text.slice(start, i).trim()) nodes.push({ prelude: text.slice(start, i).trim(), body: null }); start = i + 1; }
        else if (c === '{' && !depthParen) {
            let depth = 1, j = i + 1, q = '';
            for (; j < text.length && depth; j++) {
                const d = text[j];
                if (q) { if (d === '\\') j++; else if (d === q) q = ''; continue; }
                if (d === '"' || d === "'") q = d;
                else if (d === '{') depth++;
                else if (d === '}') depth--;
            }
            if (depth) return null;
            nodes.push({ prelude: text.slice(start, i).trim(), body: text.slice(i + 1, j - 1) });
            start = j; i = j; continue;
        }
        i++;
    }
    if (quote || depthParen || text.slice(start).trim()) return null;
    return nodes;
}

/** 选择器列表按顶层逗号拆开（括号、方括号、引号里的不算）。 */
function splitSelectorList(text) {
    const parts = [];
    let depth = 0, quote = '', start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (c === ',' && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
    }
    parts.push(text.slice(start).trim());
    return parts;
}

const BAD_SELECTOR = /(^|[\s>+~,(])(?:body|html|head)(?![\w-])|#stcr_root|:root|:host|::?backdrop/i;
const ALLOWED_AT = /^@(media|supports)\b/i;

function checkDeclarations(body) {
    if (/\\/.test(body)) return '不允许反斜杠转义写法';
    if (/expression\s*\(|-moz-binding|behavior\s*:|javascript:/i.test(body)) return '不允许 expression、behavior、javascript: 这类写法';
    if (/image-set\s*\(/i.test(body)) return '不允许 image-set()';
    if (/position\s*:\s*fixed/i.test(body)) return '不允许 position: fixed（会飘到卡片外面）';
    for (const match of body.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/gi)) {
        const target = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        if (!/^data:/i.test(target)) return `不允许外链 url(${target.slice(0, 40)}${target.length > 40 ? '…' : ''})：图片只能内嵌成 data: 开头的`;
    }
    if (/url\s*\(\s*$/i.test(body) || /url\((?![^)]*\))/i.test(body)) return 'url( 没有写完整';
    return null;
}

/**
 * 能拒就拒：返回 { ok:true, rules } 或 { ok:false, error }。rules = 找到的规则条数（清洗后为空就拒绝整份）。
 * 允许：普通规则、@media、@supports。不允许：@import、@font-face、其他 @ 规则、嵌套写法、卡片以外的选择器、外链 url(、position:fixed、expression。
 */
export function checkTemplateCss(css) {
    if (typeof css !== 'string') return { ok: false, error: '应为文字' };
    if (byteLength(css) > MAX_TEMPLATE_CSS_BYTES) return { ok: false, error: `太长了：最多 ${MAX_TEMPLATE_CSS_BYTES / 1024} KB（现在约 ${(byteLength(css) / 1024).toFixed(1)} KB）` };
    if (/@import/i.test(css)) return { ok: false, error: '不允许 @import（不能引入外部样式）' };
    if (/@font-face/i.test(css)) return { ok: false, error: '不允许 @font-face（不下载字体；想用某个字体，请装在本机，在"排版 → 字体"或这里的 font-family 里写它的名字）' };
    const text = stripComments(css);
    if (text === null) return { ok: false, error: '注释没有结束（/* 缺 */）' };
    if (!text.trim()) return { ok: false, error: '清洗后是空的，没有可用的规则' };
    const walk = (source, depth) => {
        const nodes = splitBlocks(source);
        if (!nodes) return { error: '花括号或括号没有配对' };
        let count = 0;
        for (const node of nodes) {
            if (node.body === null) return { error: `不认识的写法：${node.prelude.slice(0, 40)}` };
            if (node.prelude.startsWith('@')) {
                if (!ALLOWED_AT.test(node.prelude)) return { error: `不支持 ${node.prelude.split(/[\s({]/)[0]}（只认 @media、@supports）` };
                if (depth) return { error: '@media / @supports 不要再套一层' };
                const inner = walk(node.body, depth + 1);
                if (inner.error) return inner;
                count += inner.count;
                continue;
            }
            if (!node.prelude) return { error: '有一条规则没写选择器' };
            if (node.body.includes('{')) return { error: `不支持嵌套写法（${node.prelude.slice(0, 30)} 里面又套了花括号）` };
            for (const part of splitSelectorList(node.prelude)) {
                if (!part) return { error: `选择器里有空项：${node.prelude.slice(0, 40)}` };
                const bad = part.match(BAD_SELECTOR);
                if (bad) return { error: `选择器 "${part.slice(0, 40)}" 指向了卡片以外（${bad[0].trim()}）：只能写卡片里面的，比如 .mes_text、.name_text、q` };
            }
            const problem = checkDeclarations(node.body);
            if (problem) return { error: problem };
            count++;
        }
        return { count };
    };
    const result = walk(text, 0);
    if (result.error) return { ok: false, error: result.error };
    if (!result.count) return { ok: false, error: '清洗后是空的，没有可用的规则' };
    return { ok: true, rules: result.count };
}

const safeId = id => String(id).replace(/[^\w-]/g, '');
/** 所有模板 CSS 的共同前缀：交给 core 清洗器的 scope 参数用（每条选择器必须以它开头）。 */
export const TEMPLATE_SCOPE_ROOT = '#stcr_root .stcr-card';
/** 卡片根的选择器前缀（#stcr_root 与现有卡片规则同一层，优先级才压得过内置规则）。 */
export const templateScope = id => `${TEMPLATE_SCOPE_ROOT}[data-tpl="${safeId(id)}"]`;
/**
 * 同一个根的 class 写法。导出时卡片在隔离副本里重画，副本不抄 data-* 属性（core 的隐私白名单），只抄 class，
 * 所以每条选择器同时带两种写法：预览用 [data-tpl]，导出副本靠 .stcr-tpl-<id> 命中，两边样式一致。
 */
export const templateClassScope = id => `${TEMPLATE_SCOPE_ROOT}.${templateClassName(id)}`;
export const templateClassName = id => `stcr-tpl-${safeId(id)}`;

/**
 * 给每条选择器加前缀。用户写 `.stcr-card`（或 `.stcr-card:hover`）指卡片根本身；其他选择器 = 根的后代。
 * 前提：已通过 checkTemplateCss。不合法的整份不出样式，不报错。
 */
export function scopeTemplateCss(css, id) {
    const scopes = [templateScope(id), templateClassScope(id)];
    const text = stripComments(css ?? '');
    if (text === null || !checkTemplateCss(css).ok) return '';
    const prefix = part => scopes.map(scope => (/^\.stcr-card(?![\w-])/.test(part) ? `${scope}${part.slice('.stcr-card'.length)}` : `${scope} ${part}`));
    const build = source => (splitBlocks(source) ?? []).map(node => {
        if (node.body === null) return '';
        if (node.prelude.startsWith('@')) return `${node.prelude}{${build(node.body)}}`;
        return `${splitSelectorList(node.prelude).flatMap(prefix).join(', ')}{${node.body.trim()}}`;
    }).filter(Boolean).join('\n');
    return build(text);
}
