// ST Reader — AGPL-3.0
// 一楼排好版的正文里哪些是 HTML 块（03 §5.13 的识别规则落到 DOM 上）。T44b / T75 写在 src/ui/htmlBlocks.js，
// T97 搬到这里：阅读器的沙箱渲染与导出文档（documentExport.js）共用同一套判断。代码与搬家前逐字相同。

import { detectHtmlBlocks } from './htmlRenderer.js';

// 正文清洗会删掉的标签（core safeHtml 的 FORBID_TAGS 等）：数顶层元素时不算它们
const DROPPED = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'BASE', 'META', 'FORM', 'INPUT', 'BUTTON', 'AUDIO', 'VIDEO', 'SOURCE', 'TITLE', 'NOSCRIPT', 'TEMPLATE']);

/** 一段 HTML 的顶层元素标签序列（html/head/body 外壳展开，和正文清洗后的样子一致）。template 是惰性的，不加载任何资源。 */
function topTags(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return [...t.content.children].map(el => el.tagName).filter(tag => !DROPPED.has(tag));
}

/**
 * 裸 HTML 的每一段在已经排好版的正文里对应哪几个顶层元素。
 * 不拿原文偏移去切排好版的 HTML（正则 / Markdown 会改变长度，I038），而是按顶层标签序列依次对上。
 * @returns {{kind:'raw', html:string, pre:null, nodes:[Element, Element]}[]|null} 有一段对不上就返回 null
 */
function locateRaw(textEl, raws) {
    const kids = [...textEl.children];
    // Markdown 会把单独一行的 <html><head><style> 包进 <p>（html/head 被清洗掉）：只装着 style 的 p 当作那个 style（T75）
    const tagOf = el => el.tagName === 'P' && el.children.length === 1 && el.firstElementChild.tagName === 'STYLE'
        && !el.textContent.replace(el.firstElementChild.textContent, '').trim() ? 'STYLE' : el.tagName;
    const out = [];
    let from = 0;
    for (const block of raws) {
        const want = topTags(block.html);
        let hit = -1;
        for (let i = from; want.length && i + want.length <= kids.length; i++) {
            if (want.every((tag, j) => tagOf(kids[i + j]) === tag)) { hit = i; break; }
        }
        if (hit < 0) return null;
        out.push({ kind: 'raw', html: block.html, pre: null, nodes: [kids[hit], kids[hit + want.length - 1]] });
        from = hit + want.length;
    }
    return out;
}

/**
 * 找出这一楼正文里的 HTML 块。raw = 这一候选的原文，display = 显示正则之后的正文（renderMessage().displayText）。
 * 必须在脱敏显示改动正文之前调用：沙箱、截图、复制脱敏版都从未脱敏的 display 出发。
 * @returns {{kind:'fenced'|'raw', html:string, pre:HTMLElement|null, nodes?:[Element, Element]|null}[]}
 */
export function findHtmlBlocks(textEl, raw, display = raw) {
    const detect = value => { try { return detectHtmlBlocks(typeof value === 'string' ? value : '').filter(block => block.kind === 'raw'); } catch { return []; } };
    // T75（I057/I058）：在显示正则之后的正文上找（排好版的正文就是它变来的，才对得上）。
    // 原文里模型自己写了裸 HTML：按正则后的样子框；原文没有：只框正则产出的整页（html/body），普通美化照旧留在正文里
    const text = typeof display === 'string' ? display : '';
    const modelHtml = detect(raw).length > 0;
    const raws = detect(text).filter(block => modelHtml || /<(?:html|body)\b/i.test(block.html));
    if (raws.length) {
        return locateRaw(textEl, raws)
            // 对不上（清洗或 Markdown 改了结构）：整楼当一块，和以前一样，至少能看
            ?? [{ kind: 'raw', html: text.slice(raws[0].start, raws.at(-1).end), pre: null, nodes: null }];
    }
    const blocks = [];
    for (const pre of textEl.querySelectorAll('pre')) {
        const code = pre.querySelector('code');
        if (!code || pre.closest('.stcr-html')) continue;
        const html = code.textContent ?? '';
        // 与 core 用同一条规则：放回一对围栏里让 core 判断（内部必须有真正的 <body>）
        let hit = [];
        try { hit = detectHtmlBlocks(`\`\`\`\n${html}\n\`\`\``); } catch { hit = []; }
        if (hit.length) blocks.push({ kind: 'fenced', html, pre });
    }
    return blocks;
}
