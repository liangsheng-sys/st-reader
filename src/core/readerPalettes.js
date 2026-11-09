// ST Reader — AGPL-3.0
// T96 / D42：阅读器主题"纸张 / 夜读"的配色，与分享卡片"纸张 / 深色"模板同源（T97 导出 HTML 也用它）。
// style.css 里 #stcr_root[data-theme] 的 --stcr-th-* 与卡片模板的颜色写的是同一组字面值；
// ui.test.js 逐项核对两边一致，改颜色要两处一起改。

/** 每项都是 CSS 颜色字面值。quote 为 null 时用 ST 主题强调色与 quoteMix 六四混合（同卡片"深色"模板）。 */
export const READER_PALETTES = Object.freeze({
    paper: Object.freeze({
        page: '#f5f0e6',            // 纸面（卡片 .stcr-card--paper 底色）
        panel: '#ede6d8',           // 抽屉、面板、浮层
        text: '#2a2521',            // 正文
        faint: '#8b7f72',           // 名字行、小字（卡片名字色）
        quote: '#8a3a2e',           // 引号里的话、强调色（卡片 PAPER_RED）
        quoteMix: null,
        em: '#5b4f44',              // 斜体（卡片 em）
        strong: '#1f1b18',          // 粗体（卡片 strong）
        code: 'rgba(42, 37, 33, .06)',
        codeText: '#3b332d',
        border: 'rgba(42, 37, 33, .16)',
        shadow: 'rgba(60, 45, 30, .16)',
        underline: '#6b5d50',
    }),
    night: Object.freeze({
        page: '#141518',            // 卡片 .stcr-card--dark 底色
        panel: '#1c1d21',
        text: '#e4e0d8',
        faint: '#a9a39a',
        quote: null,
        quoteMix: '#a39d93',        // 卡片"深色"：color-mix(ST 强调色 60%, #a39d93)
        em: '#bdb7ad',
        strong: '#f3efe8',
        code: 'rgba(255, 255, 255, .06)',
        codeText: '#d8d3ca',
        border: 'rgba(255, 255, 255, .11)',
        shadow: 'rgba(0, 0, 0, .55)',
        underline: '#9fb7a8',
    }),
});

export const READER_THEMES = Object.freeze(['host', 'paper', 'night']);
