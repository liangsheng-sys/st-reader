// ST Reader — AGPL-3.0
// T97 / D43：导出文档的纯逻辑（Node 自测可跑）。选项、从显示 DOM 取文字 / 干净 HTML、拼 TXT 与单文件 HTML。
// DOM 只用最小接口：nodeType（1 元素 / 3 文本）、localName、childNodes、getAttribute、hasAttribute、data。
// 浏览器那一半（渲染每一楼、HTML 块静态快照、图片内嵌、分批与取消）在 documentExport.js。

import { READER_PALETTES } from './readerPalettes.js';

export const DOC_FORMATS = Object.freeze(['txt', 'html']);
export const DOC_SWIPES = Object.freeze(['host', 'reader', 'all']);
export const DOC_SPEAKERS = Object.freeze(['name', 'role', 'none']);
/** 包含项（D43）：默认只开楼号与用户楼。 */
export const DOC_INCLUDE_DEFAULTS = Object.freeze({
    floorNumbers: true, time: false, user: true, reasoning: false, html: false, details: false, tables: false, code: false, hidden: false,
});
export const DOC_EXPORT_DEFAULTS = Object.freeze({ format: 'txt', swipes: 'host', speaker: 'name', include: DOC_INCLUDE_DEFAULTS });

/** 任意输入 → 合法选项（坏值回默认，不抛错）。范围与脱敏不在这里：它们每次现给。 */
export function normalizeDocOptions(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const include = { ...DOC_INCLUDE_DEFAULTS };
    const given = input.include && typeof input.include === 'object' ? input.include : {};
    for (const key of Object.keys(include)) if (typeof given[key] === 'boolean') include[key] = given[key];
    return {
        format: DOC_FORMATS.includes(input.format) ? input.format : DOC_EXPORT_DEFAULTS.format,
        swipes: DOC_SWIPES.includes(input.swipes) ? input.swipes : DOC_EXPORT_DEFAULTS.swipes,
        speaker: DOC_SPEAKERS.includes(input.speaker) ? input.speaker : DOC_EXPORT_DEFAULTS.speaker,
        include,
    };
}

// 整个丢掉的元素（脚本、样式、控件、媒体、内联 SVG 与公式：读小说用不着，也避免把装饰字当正文）
const DROP = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'frame', 'frameset', 'object', 'embed', 'link', 'meta', 'base', 'title', 'head',
    'button', 'input', 'select', 'textarea', 'option', 'optgroup', 'datalist', 'form', 'audio', 'video', 'source', 'track', 'picture', 'canvas', 'svg', 'math', 'map', 'area', 'dialog', 'slot']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'main', 'nav', 'center', 'figure', 'figcaption', 'address', 'blockquote',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'pre', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'caption', 'details', 'summary',
    'hr', 'fieldset', 'legend', 'hgroup', 'menu']);
// HTML 版原样保留的标签（不带任何属性）；其余块级变 <div>、行内去壳只留内容
const KEEP_BLOCK = new Set(['p', 'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const KEEP_INLINE = new Set(['em', 'i', 'strong', 'b', 'u', 's', 'del', 'ins', 'sub', 'sup', 'small', 'mark', 'q', 'cite', 'abbr', 'code', 'kbd', 'var', 'samp', 'ruby', 'rt', 'rp']);
const TABLE = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col']);

const nameOf = node => String(node.localName ?? node.nodeName ?? '').toLowerCase();
const isHidden = node => node.hasAttribute?.('hidden') || /(?:^|;)\s*display\s*:\s*none\b/i.test(node.getAttribute?.('style') ?? '');

/**
 * 这个元素按选项要不要整个跳过。HTML 块（ctx.blocks）另外处理，不走这里。
 * @param {{include:object}} ctx
 */
function skipped(node, ctx) {
    const name = nameOf(node);
    if (DROP.has(name) || isHidden(node)) return true;
    if ((name === 'table') && !ctx.include.tables) return true;
    if (name === 'pre' && !ctx.include.code) return true;
    if (name === 'details' && !ctx.include.details) return true;
    return false;
}

const mask = (ctx, text) => (ctx.mask ? ctx.mask(text) : text);

/**
 * 显示 DOM → 一行一段的纯文字。块级元素与 <br> 断行，列表项前加"· "，表格每行单元格用全角空格隔开，
 * 代码块保留换行，图片写"[图片]"，空行全部去掉（段与段之间不空行，楼与楼之间由调用方空一行）。
 * @param {object} root 容器（只遍历它的子节点）
 * @param {{include:object, blocks?:Map<object,{first:object, lines?:string[]}>, mask?:(text:string)=>string}} ctx
 * @returns {string[]}
 */
export function textLines(root, ctx) {
    const lines = [];
    let current = '';
    const flush = () => {
        const text = current.replace(/[ \t\u00a0\r\n]+/g, ' ').trim();
        if (text === '·') return; // 列表项里紧接着块级元素：圆点留给下一行
        if (text) lines.push(text);
        current = '';
    };
    const walk = node => {
        if (node.nodeType === 3) { current += mask(ctx, node.data); return; }
        if (node.nodeType !== 1) return;
        const block = ctx.blocks?.get(node);
        if (block) {
            if (block.first !== node) return;
            flush();
            if (ctx.include.html) lines.push(...(block.lines ?? []));
            return;
        }
        if (skipped(node, ctx)) return;
        const name = nameOf(node);
        if (name === 'br') { flush(); return; }
        if (name === 'img') { current += '[图片]'; return; }
        if (name === 'hr') { flush(); lines.push('——'); return; }
        if (name === 'pre') {
            flush();
            for (const line of mask(ctx, plainText(node)).split(/\r?\n/)) if (line.trim()) lines.push(line.replace(/\s+$/, ''));
            return;
        }
        if (name === 'tr') {
            flush();
            const cells = [...node.childNodes].filter(cell => ['td', 'th'].includes(nameOf(cell)))
                .map(cell => textLines({ childNodes: [cell] }, ctx).join(' ')).filter(Boolean);
            if (cells.length) lines.push(cells.join('　'));
            return;
        }
        const isBlock = BLOCK.has(name);
        if (isBlock) flush();
        if (name === 'li') current += '· ';
        for (const child of node.childNodes) walk(child);
        if (isBlock) { if (current.trim() === '·') current = ''; flush(); }
    };
    for (const child of root.childNodes) walk(child);
    flush();
    return lines;
}

/** 元素里的全部文字（不管显示）；代码块用。 */
function plainText(node) {
    if (node.nodeType === 3) return node.data;
    if (node.nodeType !== 1 || DROP.has(nameOf(node))) return '';
    let out = '';
    for (const child of node.childNodes) out += plainText(child);
    return out;
}

export const escapeHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 显示 DOM → 干净的 HTML 片段：只留排版语义（段落、强调、引号、列表、标题，勾选时的表格 / 代码 / 折叠块），
 * 不留任何属性、样式、类名、链接与脚本；图片交给 ctx.image（返回已转好的 HTML，例如 data: 图片或"[图片]"说明）。
 * @param {object} root
 * @param {{include:object, blocks?:Map<object,{first:object, html?:string}>, mask?:(text:string)=>string, image?:(node:object)=>string}} ctx
 * @returns {string}
 */
export function cleanHtml(root, ctx) {
    let out = '';
    const walk = node => {
        if (node.nodeType === 3) { out += escapeHtml(mask(ctx, node.data)); return; }
        if (node.nodeType !== 1) return;
        const block = ctx.blocks?.get(node);
        if (block) {
            if (block.first === node && ctx.include.html) out += block.html ?? '';
            return;
        }
        if (skipped(node, ctx)) return;
        const name = nameOf(node);
        if (name === 'br') { out += '<br>'; return; }
        if (name === 'hr') { out += '<hr>'; return; }
        if (name === 'img') { out += ctx.image ? ctx.image(node) : '<span class="img">[图片]</span>'; return; }
        if (name === 'pre') { out += `<pre>${escapeHtml(mask(ctx, plainText(node)))}</pre>`; return; }
        let open = '', close = '';
        if (KEEP_BLOCK.has(name) || KEEP_INLINE.has(name) || (name === 'details' || name === 'summary')) { open = `<${name}>`; close = `</${name}>`; }
        else if (TABLE.has(name)) {
            if (name === 'col' || name === 'colgroup') return;
            const span = ['colspan', 'rowspan'].map(key => {
                const value = Number(node.getAttribute?.(key));
                return Number.isInteger(value) && value > 1 && value < 100 ? ` ${key}="${value}"` : '';
            }).join('');
            open = `<${name}${span}>`; close = `</${name}>`;
        } else if (BLOCK.has(name)) { open = '<div>'; close = '</div>'; }
        out += open;
        for (const child of node.childNodes) walk(child);
        out += close;
    };
    for (const child of root.childNodes) walk(child);
    return out;
}

const pad = n => String(n).padStart(2, '0');

/** 楼层时间：本地时区 YYYY-MM-DD HH:mm；无效为空串。 */
export function docDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 说话人怎么写：名字 / user·char / 不标（null）。 */
export function speakerLabel(speaker, { name, isUser }) {
    if (speaker === 'none') return null;
    if (speaker === 'role') return isUser ? 'user' : 'char';
    return String(name ?? '').trim() || null;
}

/** "第 3 楼 · 2026-10-31 21:05"；两项都不要就是空串。 */
export function floorHeading(include, { number, date }) {
    return [include.floorNumbers ? `第 ${number} 楼` : '', include.time ? docDate(date) : ''].filter(Boolean).join(' · ');
}

/** 文件名：角色名 - 聊天名.txt；去掉系统不允许的字符，过长截断。 */
export function docFileName(owner, title, format) {
    const clean = text => String(text ?? '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/\s+/g, ' ').trim();
    const base = [clean(owner), clean(title)].filter(Boolean).join(' - ').slice(0, 120).replace(/[. ]+$/, '') || '聊天';
    return `${base}.${format === 'html' ? 'html' : 'txt'}`;
}

/**
 * @typedef {object} DocPart 一个候选
 * @property {string|null} label 只导出"全部候选"且这一楼有多个候选时为"候选 2/3"
 * @property {string[]|string|null} reasoning TXT 为行数组，HTML 为片段；没有或没勾为 null
 * @property {string[]|string} body
 */
/** @typedef {{number:number, date:string|null, speaker:string|null, isUser:boolean, parts:DocPart[]}} DocFloor */

const hasContent = part => (Array.isArray(part.body) ? part.body.length > 0 : !!part.body.trim()) || (Array.isArray(part.reasoning) ? part.reasoning.length > 0 : !!part.reasoning?.trim());

/** 一楼的纯文本。全部候选都空就返回 null（这一楼不写）。 */
export function txtFloor(floor, include) {
    const parts = floor.parts.filter(hasContent);
    if (!parts.length) return null;
    const lines = [];
    const heading = floorHeading(include, floor);
    if (heading) lines.push(heading);
    if (floor.speaker) lines.push(`${floor.speaker}：`);
    for (const part of parts) {
        if (part.label) lines.push(part.label);
        if (part.reasoning?.length) lines.push('（思考）', ...part.reasoning, '（思考结束）');
        lines.push(...part.body);
    }
    return lines.join('\r\n');
}

/** 一楼的 HTML（<article>）。全部候选都空就返回 null。 */
export function htmlFloor(floor, include) {
    const parts = floor.parts.filter(hasContent);
    if (!parts.length) return null;
    const heading = floorHeading(include, floor);
    const head = floor.speaker || heading
        ? `<header>${floor.speaker ? `<b>${escapeHtml(floor.speaker)}</b>` : ''}${heading ? `<span>${escapeHtml(heading)}</span>` : ''}</header>` : '';
    const body = parts.map(part => `${part.label ? `<p class="swipe">${escapeHtml(part.label)}</p>` : ''}`
        + `${part.reasoning ? `<details class="think"><summary>思考过程</summary>${part.reasoning}</details>` : ''}`
        + `<div class="text">${part.body}</div>`).join('');
    return `<article class="${floor.isUser ? 'user' : 'char'}">${head}${body}</article>`;
}

const { paper, night } = READER_PALETTES;
const NIGHT_QUOTE = `color-mix(in srgb, #e18a24 60%, ${night.quoteMix})`; // 文件里没有 ST 主题色：用 ST 默认强调色，与卡片"深色"同一混法

/** 单文件 HTML 的样式：阅读器"纸张"配色（系统深色模式下换"夜读"），不嵌字体。 */
export const DOC_STYLE = `
:root{color-scheme:light dark;--page:${paper.page};--text:${paper.text};--faint:${paper.faint};--quote:${paper.quote};--em:${paper.em};--strong:${paper.strong};--code:${paper.code};--code-text:${paper.codeText};--border:${paper.border}}
@media (prefers-color-scheme:dark){:root{--page:${night.page};--text:${night.text};--faint:${night.faint};--quote:${NIGHT_QUOTE};--em:${night.em};--strong:${night.strong};--code:${night.code};--code-text:${night.codeText};--border:${night.border}}}
html{background:var(--page)}
body{margin:0;color:var(--text);font:18px/1.85 "Songti SC","Noto Serif SC","Source Han Serif SC","Microsoft YaHei",serif;-webkit-text-size-adjust:100%;text-size-adjust:100%}
main{max-width:40em;margin:0 auto;padding:56px 24px 96px}
h1{font-size:1.45em;line-height:1.4;margin:0 0 .3em}
.sub{margin:0 0 2.6em;color:var(--faint);font-size:.82em}
article{padding:1.3em 0 1.1em;border-top:1px solid var(--border)}
article:first-of-type{border-top:0}
article>header{display:flex;flex-wrap:wrap;gap:0 .9em;align-items:baseline;margin:0 0 .45em;color:var(--faint);font-size:.84em;letter-spacing:.03em}
article>header b{font-weight:600}
.user .text{color:color-mix(in srgb,var(--text) 82%,var(--page))}
.text p,.text blockquote,.text ul,.text ol,.text dl,.text table,.text pre{margin:0 0 .85em}
.text>:last-child{margin-bottom:0}
.text h1,.text h2,.text h3,.text h4,.text h5,.text h6{font-size:1.05em;margin:1em 0 .5em}
q{color:var(--quote)}q::before,q::after{content:none}
em,i{color:var(--em)}strong,b{color:var(--strong)}
blockquote{padding:0 0 0 1em;border-left:3px solid var(--border);color:var(--em)}
ul,ol{padding-left:1.4em}
code,pre{background:var(--code);color:var(--code-text);border-radius:4px;font-family:ui-monospace,Consolas,"Courier New",monospace;font-size:.86em}
code{padding:.1em .3em}pre{padding:.8em 1em;white-space:pre-wrap;word-break:break-word;line-height:1.55}
table{display:block;max-width:100%;overflow-x:auto;border-collapse:collapse;font-size:.92em}
td,th{border:1px solid var(--border);padding:.3em .6em;vertical-align:top}
details{margin:.6em 0 .85em;padding:.25em .9em;border:1px solid var(--border);border-radius:6px}
details[open]{padding-bottom:.6em}
summary{cursor:pointer;color:var(--faint);font-size:.9em}
details.think{border-style:dashed;color:var(--em);font-size:.94em}
.swipe{margin:1em 0 .3em;color:var(--faint);font-size:.82em}
img{max-width:100%;height:auto;border-radius:4px;vertical-align:middle}
.img{color:var(--faint);font-size:.88em}
iframe{display:block;width:100%;margin:.6em 0 .85em;border:1px solid var(--border);border-radius:6px;background:transparent}
hr{border:0;border-top:1px solid var(--border);margin:1.2em 0}
@media (max-width:600px){body{font-size:17px}main{padding:32px 16px 72px}}
`.trim();

/** 文档里不许任何外部请求、不许脚本：图片只认 data:，HTML 块是禁脚本的 srcdoc。 */
export const DOC_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-src 'self'; base-uri 'none'; form-action 'none'";

/** 整个 HTML 文件的头尾。floors 是 htmlFloor 的结果。 */
export function htmlDocumentHead({ title, subtitle }) {
    return `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n`
        + `<meta http-equiv="Content-Security-Policy" content="${DOC_CSP}">\n<meta name="referrer" content="no-referrer">\n`
        + `<title>${escapeHtml(title)}</title>\n<style>\n${DOC_STYLE}\n</style>\n</head>\n<body>\n<main>\n`
        + `<h1>${escapeHtml(title)}</h1>\n${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>\n` : ''}`;
}
export const HTML_DOCUMENT_TAIL = '</main>\n</body>\n</html>\n';
