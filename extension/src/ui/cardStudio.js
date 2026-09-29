// 卡片工作台（T23a、02 §6.1–6.3 + §6.4 第一层、F2/F2a）。叠在阅读器之上，关掉回到原位置。
// 预览所见即所得：片段来自 core 的已脱敏副本（cardPieces.js），遮盖用 core 的 wrapMaskSpans，
// 导出把同一个预览节点交给 exportCard（replaceNames:false：片段已替换过名字、不再绑定原文）。
// 只读（D02）：不写聊天；屏蔽词写扩展自己的 store.maskWords；PNG 交给浏览器下载目录。
// 本卡不做：自定义替换规则面板、图片导入（T23b）。

import { exportCard, wrapMaskSpans } from '../core/cardExport.js';
import { store } from '../core/store.js';
import { buildPieces, createPieceCache, findThoughts, scrubNote } from './cardPieces.js';
import { h, iconButton } from './dom.js';
import { CARD_ICON_CHOICES, CARD_SIZES, cardFileName, cleanMaskWord, normalizeCardPrefs, wordAt } from './logic.js';

const PREFS_KEY = 'stcr:ui:card:v1';
/** 永久屏蔽词各自的遮盖样式（T23a 验收意见①）：{词: {mask, icon}}；没有的词跟随默认。随备份导出。 */
const WORD_STYLES_KEY = 'stcr:ui:card:wordStyles:v1';
const CONTAINED = ['click', 'dblclick', 'auxclick', 'contextmenu', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'touchstart', 'touchend', 'input', 'change', 'paste', 'focusin', 'focusout', 'keydown', 'keyup', 'keypress', 'wheel'];
const TEMPLATES = [
    { id: 'theme', label: '继承主题' }, { id: 'paper', label: '纸张' }, { id: 'dark', label: '深色' }, { id: 'digest', label: '书摘' },
];
const MASKS = [{ id: 'bar', label: '涂黑' }, { id: 'block', label: '主题色块' }, { id: 'sticker', label: '小图案' }];
const ICON_NAMES = { 'fa-star': '星星', 'fa-heart': '爱心', 'fa-cat': '小猫', 'fa-cloud': '云朵', 'fa-moon': '月亮', 'fa-shield': '盾牌' };
const PAPER_RED = '#8a3a2e';
const DIGEST_BLUE = '#1b88ee';

/**
 * @param {{root:HTMLElement, toast:(msg:string)=>void, getDirection:()=>string, onClose?:()=>void}} deps
 */
/** 存储里的 {词: {mask, icon}} → 只留合法项。 */
function cleanWordStyles(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [word, value] of Object.entries(raw)) {
        if (!word || !MASKS.some(m => m.id === value?.mask)) continue;
        out[word] = value.mask === 'sticker' && CARD_ICON_CHOICES.includes(value.icon) ? { mask: 'sticker', icon: value.icon } : { mask: value.mask };
    }
    return out;
}

export function createCardStudio({ root, toast, getDirection, onClose }) {
    let st = null; // 打开期间的状态；关掉整体丢弃
    const iconCache = new Map();

    function switchRow(label, { hint } = {}) {
        const input = h('input', { type: 'checkbox', role: 'switch', class: 'stcr-switch-input' });
        const el = h('label', { class: 'stcr-switch stcr-studio-switch' }, input, h('span', { class: 'stcr-switch-track', 'aria-hidden': 'true' }),
            h('span', { class: 'stcr-studio-switch-label', text: label }), hint ? h('small', { class: 'stcr-studio-hint', text: hint }) : null);
        return { el, input };
    }
    const seg = (items, key, extra = '') => h('div', { class: `stcr-seg stcr-studio-seg ${extra}`.trim(), role: 'group' },
        ...items.map(item => h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', [`data-${key}`]: item.id, text: item.label })));
    const section = (title, ...children) => h('section', { class: 'stcr-studio-sec' }, h('h3', { class: 'stcr-studio-sec-title', text: title }), ...children);

    /** 打开工作台。source: {handle, ownsHandle, floors, kind:'floor'|'selection'|'note', annotations, includeReasoning} */
    async function open(source) {
        if (st) close();
        const els = buildDom();
        const mine = {
            source, els, prefs: normalizeCardPrefs(null), replaceNames: true, includeReasoning: !!source.includeReasoning,
            permanent: [], temp: [], cache: createPieceCache(), pieces: [], mappings: [], thoughts: [], card: null,
            token: 0, exporting: false, urls: [], words: [], suppressClick: false, saveTimer: 0, resize: null,
            wordStyles: {}, tempStyles: {}, menu: null,
        };
        st = mine;
        root.append(els.studio);
        els.studio.focus({ preventScroll: true });
        wire(mine);
        els.sub.textContent = subtitle(source);
        try {
            const [prefs, words, styles] = await Promise.all([store.settings.get(PREFS_KEY, null), store.maskWords.list(), store.settings.get(WORD_STYLES_KEY, {})]);
            if (st !== mine) return;
            mine.prefs = normalizeCardPrefs(prefs);
            mine.permanent = words;
            mine.wordStyles = cleanWordStyles(styles);
        } catch (error) {
            console.warn('[st-reader] 卡片设置或屏蔽词读取失败：', error);
            showNote(mine, `屏蔽词读取失败：${error.message ?? error}。请先别导出。`, 'error');
        }
        if (st !== mine) return;
        syncControls(mine);
        await rebuild(mine);
    }

    function subtitle({ floors, kind }) {
        const first = floors[0].index + 1, last = floors.at(-1).index + 1;
        const where = first === last ? `第 ${first} 楼` : `第 ${first}–${last} 楼`;
        return kind === 'floor' ? `${where} · 整楼` : kind === 'note' ? `${where} · 划线` : `${where} · 选段`;
    }

    function buildDom() {
        const exportBtn = h('button', { type: 'button', class: 'stcr-btn stcr-studio-export', 'data-studio': 'export' },
            h('i', { class: 'fa-solid fa-download', 'aria-hidden': 'true' }), h('span', { class: 'stcr-studio-export-label', text: '导出 PNG' }));
        const sub = h('span', { class: 'stcr-studio-sub' });
        const head = h('header', { class: 'stcr-studio-head' },
            iconButton('fa-xmark', '关闭（Esc）', { 'data-studio': 'close' }),
            h('h2', { class: 'stcr-studio-title', text: '分享卡片' }), sub, exportBtn);

        const scaler = h('div', { class: 'stcr-card-scaler' });
        const slot = h('div', { class: 'stcr-card-slot' }, scaler);
        const hover = h('div', { class: 'stcr-card-hover', hidden: true, 'aria-hidden': 'true' });
        const status = h('div', { class: 'stcr-studio-status', role: 'status', 'aria-live': 'polite' });
        const stage = h('div', { class: 'stcr-studio-stage' },
            slot, hover, status,
            h('p', { class: 'stcr-studio-tip', text: '点预览里的词 = 临时遮住（只对这张卡有效）；拖选一串字也能一次遮住。点已遮住的地方，可以单独换它的样子、取消或加入永久。' }));

        const tpl = h('div', { class: 'stcr-studio-tpls', role: 'group', 'aria-label': '模板' },
            ...TEMPLATES.map(item => h('button', { type: 'button', class: 'stcr-btn stcr-tpl-btn', 'data-tpl': item.id },
                h('span', { class: `stcr-tpl-swatch stcr-tpl-swatch--${item.id}`, 'aria-hidden': 'true' }, h('i'), h('i')), h('span', { text: item.label }))));
        const sizes = seg(Object.entries(CARD_SIZES).map(([id, size]) => ({ id, label: size.label })), 'size');
        const masks = seg(MASKS, 'mask');
        const icons = h('div', { class: 'stcr-studio-icons', role: 'group', 'aria-label': '小图案' },
            ...CARD_ICON_CHOICES.map(icon => h('button', { type: 'button', class: 'stcr-btn stcr-icon-pick', 'data-icon': icon, title: ICON_NAMES[icon], 'aria-label': ICON_NAMES[icon] },
                h('i', { class: `fa-solid ${icon}`, 'aria-hidden': 'true' }))));
        const uniform = switchRow('统一长度', { hint: '无论遮几个字都一样长，长度也不泄密' });
        const names = switchRow('名字替换');
        const mapList = h('ul', { class: 'stcr-studio-maps', 'aria-label': '这张卡上的名字替换' });
        const rulesBtn = h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-studio-rules', disabled: true, title: '下一版提供：自己定"某个词总是换成什么"' },
            h('i', { class: 'fa-solid fa-list-check', 'aria-hidden': 'true' }), ' 管理替换规则…', h('small', { text: '下一版' }));
        const showNames = switchRow('显示名字行');
        const reasoning = switchRow('包含思维链');
        const signOn = switchRow('底部署名');
        const signText = h('input', { type: 'text', class: 'text_pole stcr-studio-input', maxlength: '40', 'aria-label': '署名文字', placeholder: 'ST Reader' });
        const digestSource = switchRow('显示出处');
        const digestTitle = h('input', { type: 'text', class: 'text_pole stcr-studio-input', maxlength: '40', 'aria-label': '书摘标题', placeholder: '一段故事' });
        const accent = seg([{ id: 'blue', label: '蓝' }, { id: 'theme', label: '跟随主题' }], 'accent');
        const digest = section('书摘', digestSource.el,
            h('label', { class: 'stcr-studio-field' }, h('span', { text: '标题' }), digestTitle),
            h('div', { class: 'stcr-studio-field' }, h('span', { text: '强调色' }), accent),
            h('p', { class: 'stcr-studio-hint', text: '书摘不显示名字行；这段文字上若有你写的批注，会放在下方"我的想法"里。' }));
        const wordCount = h('span', { class: 'stcr-studio-count' });
        const wordToggle = h('button', { type: 'button', class: 'stcr-btn stcr-studio-fold', 'aria-expanded': 'true', 'data-studio': 'fold-words' },
            h('span', { text: '屏蔽词（永久）' }), wordCount, h('i', { class: 'fa-solid fa-chevron-down', 'aria-hidden': 'true' }));
        const wordChips = h('div', { class: 'stcr-studio-chips' });
        const wordInput = h('input', { type: 'text', class: 'text_pole stcr-studio-input', maxlength: '40', placeholder: '输入要遮住的词，回车添加', 'aria-label': '添加屏蔽词' });
        const wordBox = h('div', { class: 'stcr-studio-words' }, wordChips,
            h('form', { class: 'stcr-studio-add', 'data-studio': 'add-word' }, wordInput,
                h('button', { type: 'submit', class: 'stcr-btn stcr-text-btn', text: '添加' })),
            h('p', { class: 'stcr-studio-hint', text: '只作用于分享卡片，不影响阅读器正文和聊天。和阅读器里"屏蔽"是同一张表。' }));
        const tempChips = h('div', { class: 'stcr-studio-chips' });
        const tempSec = section('临时遮住（只这张卡）', tempChips);
        const note = h('div', { class: 'stcr-studio-note', role: 'status', 'aria-live': 'polite' });

        const side = h('aside', { class: 'stcr-studio-side', 'aria-label': '卡片设置' },
            section('模板', tpl),
            section('尺寸', sizes),
            section('遮盖样式', masks, icons, uniform.el, h('p', { class: 'stcr-studio-hint', text: '这是默认样式。想让某个词不一样：点预览里它的遮盖，或点下面词条左边的小方块。' })),
            section('名字替换', names.el, mapList, rulesBtn),
            section('显示', showNames.el, reasoning.el, signOn.el, signText),
            digest,
            h('section', { class: 'stcr-studio-sec' }, wordToggle, wordBox),
            tempSec,
            note);
        const studio = h('div', { class: 'stcr-studio', role: 'dialog', 'aria-modal': 'true', 'aria-label': '分享卡片', tabindex: '-1' },
            head, h('div', { class: 'stcr-studio-body' }, stage, side));
        return { studio, head, exportBtn, sub, stage, slot, scaler, hover, status, side, tpl, sizes, masks, icons, uniform, names, mapList,
            showNames, reasoning, signOn, signText, digest, digestSource, digestTitle, accent, wordCount, wordToggle, wordBox, wordChips, wordInput,
            tempSec, tempChips, note };
    }

    // ───────────── 事件 ─────────────

    function wire(mine) {
        const { els } = mine;
        const alive = () => st === mine;
        els.studio.addEventListener('click', event => onClick(mine, event));
        els.studio.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || event.isComposing) return;
            event.preventDefault();
            if (mine.menu) closeMenu(mine); else close();
        });
        // 工作台里的点击、按键不交给阅读器（翻页、快捷键）和 ST（委托事件、←/→ 切真实候选）。
        for (const type of CONTAINED) els.studio.addEventListener(type, event => event.stopPropagation());

        const prefChange = patch => { if (!alive() || mine.exporting) return; Object.assign(mine.prefs, patch); savePrefs(mine); syncControls(mine); compose(mine); };
        els.tpl.addEventListener('click', event => { const id = event.target.closest('[data-tpl]')?.dataset.tpl; if (id) prefChange({ template: id }); });
        els.sizes.addEventListener('click', event => { const id = event.target.closest('[data-size]')?.dataset.size; if (id) prefChange({ size: id }); });
        els.masks.addEventListener('click', event => { const id = event.target.closest('[data-mask]')?.dataset.mask; if (id) prefChange({ mask: id }); });
        els.icons.addEventListener('click', event => { const id = event.target.closest('[data-icon]')?.dataset.icon; if (id) prefChange({ icon: id }); });
        els.accent.addEventListener('click', event => { const id = event.target.closest('[data-accent]')?.dataset.accent; if (id) prefChange({ digestAccent: id }); });
        els.uniform.input.addEventListener('change', () => prefChange({ uniform: els.uniform.input.checked }));
        els.showNames.input.addEventListener('change', () => prefChange({ showNames: els.showNames.input.checked }));
        els.signOn.input.addEventListener('change', () => prefChange({ signatureOn: els.signOn.input.checked }));
        els.digestSource.input.addEventListener('change', () => prefChange({ digestSourceOn: els.digestSource.input.checked }));
        els.signText.addEventListener('input', () => prefChange({ signature: els.signText.value }));
        els.digestTitle.addEventListener('input', () => prefChange({ digestTitle: els.digestTitle.value }));
        els.reasoning.input.addEventListener('change', () => {
            if (!alive() || mine.exporting) return;
            mine.includeReasoning = els.reasoning.input.checked;
            compose(mine);
        });
        els.names.input.addEventListener('change', () => {
            if (!alive() || mine.exporting) return;
            mine.replaceNames = els.names.input.checked;
            rebuild(mine); // 名字开关变了：从原文重建副本（03 §5.9）
        });
        els.studio.querySelector('[data-studio="add-word"]').addEventListener('submit', event => {
            event.preventDefault();
            const word = cleanMaskWord(els.wordInput.value);
            if (!word) { toast('请输入 1–40 个字的词'); return; }
            addPermanent(mine, word).then(ok => { if (ok) els.wordInput.value = ''; });
        });

        // 预览里悬停一个词 = 虚线框；点一下 = 临时遮住；拖选一串 = 一次遮住。
        let frame = 0, lastMove = null;
        els.stage.addEventListener('mousemove', event => {
            lastMove = event;
            if (frame) return;
            frame = requestAnimationFrame(() => { frame = 0; if (alive()) onHover(mine, lastMove); });
        });
        els.stage.addEventListener('mouseleave', () => { els.hover.hidden = true; });
        els.stage.addEventListener('mouseup', () => setTimeout(() => { if (alive()) onDragSelect(mine); }, 0));
        els.stage.addEventListener('scroll', () => { els.hover.hidden = true; closeMenu(mine); }, { passive: true });
        els.side.addEventListener('scroll', () => closeMenu(mine), { passive: true });
        mine.resize = new ResizeObserver(() => { if (alive()) fit(mine); });
        mine.resize.observe(els.stage);
    }

    function onClick(mine, event) {
        const target = event.target;
        if (!target.isConnected) return; // 菜单里点了样式，菜单已经换成新的，这次点击处理完了
        if (mine.menu) {
            if (mine.menu.contains(target)) return; // 菜单自己的按钮各自处理
            closeMenu(mine);
            if (target.closest('.stcr-mask, [data-word-style]')) return; // 点另一个遮盖：这一下只关旧菜单
        }
        const styleBtn = target.closest('[data-word-style]');
        if (styleBtn) { openMenu(mine, styleBtn.dataset.wordStyle, styleBtn); return; }
        const act = target.closest('[data-studio]')?.dataset.studio;
        if (act === 'close') { close(); return; }
        if (act === 'export') { doExport(mine); return; }
        if (act === 'fold-words') {
            const open = mine.els.wordBox.hidden;
            mine.els.wordBox.hidden = !open;
            mine.els.wordToggle.setAttribute('aria-expanded', String(open));
            return;
        }
        const chip = target.closest('[data-word-remove]');
        if (chip) { removePermanent(mine, mine.permanent[Number(chip.dataset.wordRemove)]); return; }
        const tempRemove = target.closest('[data-temp-remove]');
        if (tempRemove) { setTemp(mine, mine.temp.filter((_, i) => i !== Number(tempRemove.dataset.tempRemove))); return; }
        const tempKeep = target.closest('[data-temp-keep]');
        if (tempKeep) { addPermanent(mine, mine.temp[Number(tempKeep.dataset.tempKeep)]); return; }
        if (mine.card && mine.card.contains(target)) onCardClick(mine, event);
    }

    // ───────────── 构建与排版 ─────────────

    /** 从原文重建片段（打开时、名字开关变化时）。过程中又变了就丢弃旧结果。 */
    async function rebuild(mine) {
        const current = ++mine.token;
        const { source } = mine;
        setStatus(mine, mine.card ? '' : '正在生成预览…');
        try {
            const built = await buildPieces(source.handle, source.floors, { replaceNames: mine.replaceNames }, mine.cache);
            const thoughts = await findThoughts(source.handle, source.floors, source.annotations ?? [], mine.cache);
            if (st !== mine || current !== mine.token) return;
            mine.pieces = built.pieces;
            mine.mappings = built.mappings;
            mine.thoughts = thoughts;
            setStatus(mine, '');
            syncControls(mine);
            compose(mine);
        } catch (error) {
            if (st !== mine || current !== mine.token) return;
            console.error('[st-reader] 卡片预览生成失败：', error);
            setStatus(mine, `预览生成失败：${error.message ?? error}`, true);
            mine.els.exportBtn.disabled = true;
        }
    }

    const template = mine => mine.prefs.template ?? (getDirection() === 'a' ? 'paper' : 'theme');

    /** 按当前选项拼卡片、上遮盖、放进预览。同步完成，切模板/开关时立刻看到。 */
    function compose(mine) {
        const { els, prefs } = mine;
        const tpl = template(mine);
        const size = CARD_SIZES[prefs.size];
        const colors = templateColors(mine, tpl);
        const card = h('div', { class: `stcr-card stcr-card--${tpl} stcr-card--${prefs.size}` });
        card.style.setProperty('--stcr-card-w', `${size.width}px`);
        card.style.setProperty('--stcr-card-h', `${size.minHeight}px`);
        card.style.setProperty('--stcr-card-accent', colors.accent);
        if (tpl !== 'theme') card.style.setProperty('--stcr-card-font', readerFont());

        const page = h('div', { class: 'stcr-card-page' });
        if (tpl === 'digest') page.append(h('div', { class: 'stcr-card-mark', 'aria-hidden': 'true', text: '“' }));
        // 继承主题：用正文容器的 id，让 ST 主题 / 美化 CSS / Ny 字体规则（#chat → #stcr_chat 的克隆）原样命中。
        const chat = h('div', { class: 'stcr-card-chat', id: tpl === 'theme' ? 'stcr_chat' : null });
        const names = tpl !== 'digest' && prefs.showNames;
        for (const piece of mine.pieces) {
            const reasoning = mine.includeReasoning && piece.reasoning;
            if (!piece.body && !reasoning) continue;
            chat.append(h('div', { class: `mes stcr-card-mes${piece.isSystem ? ' stcr-card-mes--system' : ''}`, is_user: String(piece.isUser), is_system: String(piece.isSystem) },
                h('div', { class: 'mes_block' },
                    names ? h('div', { class: 'ch_name' }, h('span', { class: 'name_text' }, piece.name.cloneNode(true))) : null,
                    reasoning ? h('div', { class: 'stcr-card-reasoning' }, h('div', { class: 'stcr-card-reasoning-title', text: '思考过程' }),
                        h('div', { class: 'mes_reasoning' }, piece.reasoning.cloneNode(true))) : null,
                    piece.body ? h('div', { class: 'mes_text' }, piece.body.cloneNode(true)) : null)));
        }
        page.append(chat);
        if (tpl === 'digest' && mine.thoughts.length) {
            page.append(h('div', { class: 'stcr-card-thoughts' },
                h('div', { class: 'stcr-card-thoughts-label', text: '我的想法' }),
                ...mine.thoughts.map(item => h('p', { class: 'stcr-card-thought', text: scrubNote(item.note, mine.source.handle, mine.mappings, mine.replaceNames) }))));
        }
        const foot = footer(mine, tpl);
        if (foot) page.append(foot);
        card.append(page);

        const empty = !chat.childElementCount;
        mine.card = applyMasks(mine, card, colors);
        els.scaler.replaceChildren(mine.card);
        els.hover.hidden = true;
        closeMenu(mine);
        els.exportBtn.disabled = empty || mine.exporting;
        if (empty) setStatus(mine, mine.pieces.some(p => p.reasoning) ? '选中的文字在思维链里：打开右边"包含思维链"就能看到。' : '这段选区里没有可以放进卡片的文字。');
        else if (!els.status.classList.contains('stcr-studio-status--error')) setStatus(mine, '');
        syncMappings(mine);
        syncTemp(mine);
        fit(mine);
    }

    function footer(mine, tpl) {
        const { prefs } = mine;
        const signature = prefs.signature.trim() || 'ST Reader';
        if (tpl === 'digest') {
            const title = prefs.digestTitle.trim() || '一段故事';
            const speaker = mine.pieces.find(p => !p.isUser && !p.isSystem)?.name.textContent.trim() ?? '';
            if (!prefs.digestSourceOn && !prefs.signatureOn) return null;
            return h('div', { class: 'stcr-card-foot stcr-card-foot--digest' },
                prefs.digestSourceOn ? h('span', { class: 'stcr-card-cover', 'aria-hidden': 'true', text: [...title].slice(0, 2).join('') }) : null,
                prefs.digestSourceOn ? h('span', { class: 'stcr-card-source', text: `摘自《${title}》${speaker ? ` · ${speaker}` : ''}` }) : null,
                prefs.signatureOn ? h('span', { class: 'stcr-card-sign', text: `${signature} 书摘` }) : null);
        }
        if (!prefs.signatureOn) return null;
        return h('div', { class: 'stcr-card-foot' }, h('span', { class: 'stcr-card-sign', text: tpl === 'paper' ? `— ${signature}` : signature }));
    }

    /** 每个模板的强调色（遮盖的色块/图案也用它）。必须是不透明的 #RRGGBB（03 §5.9）。 */
    function templateColors(mine, tpl) {
        const quote = solidColor('var(--SmartThemeQuoteColor, #e18a24)');
        const accent = tpl === 'paper' ? PAPER_RED
            : tpl === 'dark' ? solidColor('color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 60%, #a39d93)')
                : tpl === 'digest' ? (mine.prefs.digestAccent === 'theme' ? quote : DIGEST_BLUE) : quote;
        return { accent, bar: tpl === 'dark' ? '#ffffff' : '#000000' };
    }

    /** 一个词实际用的遮盖：它自己的设置优先（临时词看本卡、永久词看记住的），否则默认。 */
    const ownStyle = (mine, word) => mine.tempStyles[word] ?? mine.wordStyles[word] ?? null;
    function styleFor(mine, word, colors) {
        const own = ownStyle(mine, word);
        return maskStyle(mine, colors, own ? { mask: own.mask, icon: own.icon ?? mine.prefs.icon } : null);
    }

    function maskStyle(mine, colors, own = null) {
        const { uniform } = mine.prefs;
        const { mask, icon } = own ?? mine.prefs;
        if (mask === 'bar') return { kind: 'bar', color: colors.bar, uniform };
        if (mask === 'block') return { kind: 'block', color: colors.accent, uniform };
        return { kind: 'sticker', color: colors.accent, uniform, icon };
    }

    /**
     * 屏蔽词（永久 + 临时）在卡片上换成遮盖元素：原字从副本里删掉，不是盖在上面（02 §6.3）。
     * 长词先遮；每个遮盖记下是第几个词（只记编号，不写原词），用来"点一下取消"。
     */
    function applyMasks(mine, card, colors) {
        const style = maskStyle(mine, colors);
        const words = [...new Set([...mine.permanent, ...mine.temp])].sort((a, b) => b.length - a.length);
        mine.words = words;
        mine.style = style;
        let out = card;
        words.forEach((word, i) => {
            const own = styleFor(mine, word, colors);
            out = wrapMaskSpans(out, [word], own);
            for (const span of out.querySelectorAll('.stcr-mask:not([data-stcr-tw])')) {
                span.dataset.stcrTw = String(i);
                // 小图案：core 画图标时字体名没加引号会画成小点（06 I018），这里自己画好换成图片；导出原样复制图片。
                for (const icon of span.querySelectorAll('[data-stcr-icon]')) {
                    const src = iconImage(icon.dataset.stcrIcon, own.color);
                    if (src) icon.replaceWith(h('img', { src, alt: '', class: 'stcr-mask-icon' }));
                }
            }
        });
        return out;
    }

    /** 用 ST 已加载的 Font Awesome 实心字形画一张 128px 小图（不下载任何东西）。 */
    function iconImage(icon, color) {
        const key = `${icon}:${color}`;
        if (iconCache.has(key)) return iconCache.get(key);
        const face = [...document.fonts].find(f => /font awesome.*free/i.test(f.family) && f.status === 'loaded' && Number(f.weight) >= 900);
        const probe = h('i', { class: `fa-solid ${icon}`, style: 'position:fixed;left:-9999px' });
        root.append(probe);
        const glyph = getComputedStyle(probe, '::before').content.replace(/^["']|["']$/g, '');
        probe.remove();
        if (!face || !glyph || glyph === 'none') return null;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = `900 100px "${face.family}"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(glyph, 64, 66);
        const url = canvas.toDataURL('image/png');
        iconCache.set(key, url);
        return url;
    }

    /** 缩放预览放进舞台（导出按原尺寸，不受缩放影响）。 */
    function fit(mine) {
        const { els, card } = mine;
        if (!card) return;
        const size = CARD_SIZES[mine.prefs.size];
        const room = Math.max(160, els.stage.clientWidth - 48);
        const scale = Math.min(1, room / size.width);
        els.scaler.style.transform = `scale(${scale})`;
        els.slot.style.width = `${Math.round(size.width * scale)}px`;
        els.slot.style.height = `${Math.round(card.offsetHeight * scale)}px`;
        mine.scale = scale;
    }

    /** 字体：阅读器正文此刻用的字体（含 Ny 字体管理器的规则）；三套固定配色模板也用它。 */
    function readerFont() {
        const text = root.querySelector('#stcr_chat .mes_text');
        return (text ? getComputedStyle(text) : getComputedStyle(document.body)).fontFamily || 'inherit';
    }

    /** 任何 CSS 颜色（含主题变量、color-mix）→ 不透明 #RRGGBB。 */
    function solidColor(css) {
        const probe = h('span', { class: 'stcr-offscreen', style: `color:${css}` });
        root.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#000';
        ctx.fillStyle = resolved;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
    }

    // ───────────── 右侧控件 ─────────────

    function syncControls(mine) {
        const { els, prefs } = mine;
        const tpl = template(mine);
        for (const b of els.tpl.children) b.classList.toggle('stcr-on', b.dataset.tpl === tpl);
        for (const b of els.sizes.children) b.classList.toggle('stcr-on', b.dataset.size === prefs.size);
        for (const b of els.masks.children) b.classList.toggle('stcr-on', b.dataset.mask === prefs.mask);
        for (const b of els.icons.children) b.classList.toggle('stcr-on', b.dataset.icon === prefs.icon);
        for (const b of els.accent.children) b.classList.toggle('stcr-on', b.dataset.accent === prefs.digestAccent);
        els.icons.hidden = prefs.mask !== 'sticker';
        els.uniform.input.checked = prefs.uniform;
        els.names.input.checked = mine.replaceNames;
        els.showNames.input.checked = prefs.showNames;
        els.showNames.input.disabled = tpl === 'digest';
        els.showNames.el.title = tpl === 'digest' ? '书摘模板不显示名字行' : '';
        const hasReasoning = mine.pieces.some(p => p.reasoning);
        els.reasoning.input.checked = mine.includeReasoning && hasReasoning;
        els.reasoning.input.disabled = !hasReasoning;
        els.reasoning.el.title = hasReasoning ? '' : '这段选区里没有思维链';
        els.signOn.input.checked = prefs.signatureOn;
        if (document.activeElement !== els.signText) els.signText.value = prefs.signature;
        els.signText.hidden = !prefs.signatureOn;
        els.digest.hidden = tpl !== 'digest';
        els.digestSource.input.checked = prefs.digestSourceOn;
        if (document.activeElement !== els.digestTitle) els.digestTitle.value = prefs.digestTitle;
        els.wordCount.textContent = `${mine.permanent.length} 个`;
        els.wordChips.replaceChildren(...(mine.permanent.length ? mine.permanent.map((word, i) => h('span', { class: 'stcr-word-chip' },
            styleSwatch(mine, word), h('span', { text: word }), iconButton('fa-xmark', `从屏蔽词里移除：${word}`, { class: 'stcr-word-x', 'data-word-remove': i })))
            : [h('span', { class: 'stcr-studio-hint', text: '还没有屏蔽词。' })]));
    }

    /** "名字替换"下实时列出本卡实际命中的映射（原词只出现在这里，不进卡片）。 */
    function syncMappings(mine) {
        const { els } = mine;
        if (!mine.replaceNames) {
            els.mapList.replaceChildren(h('li', { class: 'stcr-studio-warn-line', text: '已关闭：卡片上会显示真名，请自己确认。' }));
            return;
        }
        const shown = new Set([...mine.card.querySelectorAll('.stcr-replacement')].map(el => el.textContent));
        const rows = [];
        for (const item of mine.mappings) {
            if (item.to.kind !== 'text' || !shown.has(item.to.value)) continue;
            if (rows.some(row => row.from === item.from && row.to === item.to.value)) continue;
            rows.push({ from: item.from, to: item.to.value, source: item.source });
        }
        els.mapList.replaceChildren(...(rows.length ? rows.map(row => h('li', { class: 'stcr-studio-map' },
            h('span', { class: 'stcr-map-from', text: row.from }), h('i', { class: 'fa-solid fa-arrow-right', 'aria-hidden': 'true' }),
            h('span', { class: 'stcr-map-to', text: row.to }), h('small', { class: 'stcr-row-tag', text: row.source === 'mine' ? '我的规则' : '自动' })))
            : [h('li', { class: 'stcr-studio-hint', text: '这张卡上没有需要替换的名字。' })]));
    }

    function syncTemp(mine) {
        const { els } = mine;
        els.tempSec.hidden = !mine.temp.length;
        els.tempChips.replaceChildren(...mine.temp.map((word, i) => h('span', { class: 'stcr-word-chip stcr-word-chip--temp' },
            styleSwatch(mine, word), h('span', { text: word }),
            iconButton('fa-plus', `加入永久屏蔽词：${word}`, { class: 'stcr-word-x', 'data-temp-keep': i }),
            iconButton('fa-xmark', `不遮了：${word}`, { class: 'stcr-word-x', 'data-temp-remove': i }))));
    }

    /** 词条左边的小方块：显示这个词现在的遮盖样子，点它单独改。 */
    function styleSwatch(mine, word) {
        const own = ownStyle(mine, word);
        const kind = (own ?? mine.prefs).mask;
        const icon = (own?.icon ?? mine.prefs.icon);
        const label = own ? `${MASKS.find(m => m.id === kind).label}（单独设置）` : '跟随默认';
        return h('button', { type: 'button', class: `stcr-btn stcr-mask-swatch stcr-mask-swatch--${kind}${own ? ' stcr-mask-swatch--own' : ''}`,
            'data-word-style': word, title: `这个词的遮盖：${label}。点这里单独改`, 'aria-label': `${word} 的遮盖样式：${label}` },
        kind === 'sticker' ? h('i', { class: `fa-solid ${icon}`, 'aria-hidden': 'true' }) : null);
    }

    // ───────────── 单个词的遮盖菜单（T23a 验收意见①） ─────────────

    /** 点预览里的遮盖或词条小方块：换这个词自己的样式 / 跟随默认；临时词还能取消或加入永久，永久词能移出。 */
    function openMenu(mine, word, anchor) {
        if (mine.exporting || word === undefined) return;
        closeMenu(mine);
        const own = ownStyle(mine, word);
        const isTemp = mine.temp.includes(word);
        const current = own?.mask ?? null;
        const menu = h('div', { class: 'stcr-popover stcr-mask-menu', role: 'dialog', 'aria-label': `“${word}”的遮盖` },
            h('div', { class: 'stcr-mask-menu-title' }, h('span', { text: '这个词：' }), h('b', { text: word })),
            h('div', { class: 'stcr-seg stcr-mask-menu-seg', role: 'group' },
                h('button', { type: 'button', class: `stcr-btn stcr-seg-btn${current === null ? ' stcr-on' : ''}`, 'data-menu-mask': '', text: '跟随默认' }),
                ...MASKS.map(m => h('button', { type: 'button', class: `stcr-btn stcr-seg-btn${current === m.id ? ' stcr-on' : ''}`, 'data-menu-mask': m.id, text: m.label }))),
            current === 'sticker' ? h('div', { class: 'stcr-studio-icons' },
                ...CARD_ICON_CHOICES.map(icon => h('button', { type: 'button', class: `stcr-btn stcr-icon-pick${(own.icon ?? mine.prefs.icon) === icon ? ' stcr-on' : ''}`,
                    'data-menu-icon': icon, title: ICON_NAMES[icon], 'aria-label': ICON_NAMES[icon] }, h('i', { class: `fa-solid ${icon}`, 'aria-hidden': 'true' })))) : null,
            h('div', { class: 'stcr-mask-menu-actions' },
                isTemp ? h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', 'data-menu-act': 'keep' },
                    h('i', { class: 'fa-solid fa-plus', 'aria-hidden': 'true' }), ' 加入永久屏蔽词') : null,
                h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', 'data-menu-act': isTemp ? 'unmask' : 'remove' },
                    h('i', { class: 'fa-solid fa-eye', 'aria-hidden': 'true' }), isTemp ? ' 取消遮住' : ' 移出屏蔽词')));
        menu.addEventListener('click', event => {
            const maskBtn = event.target.closest('[data-menu-mask]');
            if (maskBtn) { setWordStyle(mine, word, maskBtn.dataset.menuMask || null, own?.icon); reopen(); return; }
            const iconBtn = event.target.closest('[data-menu-icon]');
            if (iconBtn) { setWordStyle(mine, word, 'sticker', iconBtn.dataset.menuIcon); reopen(); return; }
            const act = event.target.closest('[data-menu-act]')?.dataset.menuAct;
            if (!act) return;
            closeMenu(mine);
            if (act === 'keep') addPermanent(mine, word);
            else if (act === 'unmask') setTemp(mine, mine.temp.filter(w => w !== word));
            else removePermanent(mine, word);
        });
        // 改完样式卡片会重排：按词重新找到它的遮盖（或词条）再把菜单放回去
        const reopen = () => {
            const i = mine.words.indexOf(word);
            const again = anchor.closest('.stcr-studio-side')
                ? mine.els.side.querySelector(`[data-word-style="${CSS.escape(word)}"]`)
                : mine.card?.querySelector(`.stcr-mask[data-stcr-tw="${i}"]`);
            if (again) openMenu(mine, word, again);
        };
        mine.els.studio.append(menu);
        const box = mine.els.studio.getBoundingClientRect(), rect = anchor.getBoundingClientRect();
        const width = menu.offsetWidth, height = menu.offsetHeight;
        const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2 - box.left), box.width - width - 8);
        let top = rect.bottom - box.top + 8;
        if (top + height > box.height - 8) top = rect.top - box.top - height - 8;
        menu.style.left = `${left}px`;
        menu.style.top = `${Math.max(8, top)}px`;
        mine.menu = menu;
    }

    function closeMenu(mine) {
        mine.menu?.remove();
        mine.menu = null;
    }

    /** 记下一个词自己的样式（mask=null = 跟随默认）。临时词只记在这张卡；永久词存起来，下次也这样。 */
    function setWordStyle(mine, word, mask, icon) {
        if (mine.exporting) return;
        const value = mask ? { mask, ...(mask === 'sticker' ? { icon: icon ?? mine.prefs.icon } : {}) } : null;
        if (mine.temp.includes(word)) {
            if (value) mine.tempStyles[word] = value; else delete mine.tempStyles[word];
        } else {
            if (value) mine.wordStyles[word] = value; else delete mine.wordStyles[word];
            saveWordStyles(mine);
        }
        syncControls(mine);
        compose(mine);
    }

    function saveWordStyles(mine) {
        // 只留还在屏蔽词表里的词
        const kept = Object.fromEntries(Object.entries(mine.wordStyles).filter(([word]) => mine.permanent.includes(word)));
        mine.wordStyles = kept;
        store.settings.set(WORD_STYLES_KEY, kept).catch(error => toast(`遮盖样式没保存上：${error.message ?? error}`));
    }

    function setStatus(mine, text, error = false) {
        mine.els.status.textContent = text;
        mine.els.status.hidden = !text;
        mine.els.status.classList.toggle('stcr-studio-status--error', !!text && error);
    }

    function showNote(mine, text, kind = 'warn') {
        if (!text) { mine.els.note.replaceChildren(); return; }
        mine.els.note.replaceChildren(h('p', { class: `stcr-studio-note-line stcr-studio-note-line--${kind}` },
            h('i', { class: `fa-solid ${kind === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info'}`, 'aria-hidden': 'true' }), ' ', text));
    }

    function savePrefs(mine) {
        clearTimeout(mine.saveTimer);
        mine.saveTimer = setTimeout(() => {
            store.settings.set(PREFS_KEY, { ...mine.prefs }).catch(error => console.warn('[st-reader] 卡片设置保存失败：', error));
        }, 500);
    }

    // ───────────── 屏蔽词 ─────────────

    async function addPermanent(mine, word) {
        if (st !== mine || mine.exporting || !word) return false;
        try {
            mine.permanent = await store.maskWords.add(word);
            if (st !== mine) return false;
            mine.temp = mine.temp.filter(w => w !== word);
            if (mine.tempStyles[word]) { mine.wordStyles[word] = mine.tempStyles[word]; delete mine.tempStyles[word]; saveWordStyles(mine); }
            toast(`已加入屏蔽词：${word}（只作用于分享卡片）`);
            syncControls(mine);
            compose(mine);
            return true;
        } catch (error) {
            toast(`屏蔽词没保存上：${error.message ?? error}`);
            return false;
        }
    }

    async function removePermanent(mine, word) {
        if (st !== mine || mine.exporting || word === undefined) return;
        try {
            mine.permanent = await store.maskWords.remove(word);
            if (st !== mine) return;
            if (mine.wordStyles[word]) saveWordStyles(mine);
            toast(`已移除屏蔽词：${word}`);
            syncControls(mine);
            compose(mine);
        } catch (error) { toast(`没移除成功：${error.message ?? error}`); }
    }

    function setTemp(mine, words) {
        if (mine.exporting) return;
        mine.temp = [...new Set(words)];
        for (const word of Object.keys(mine.tempStyles)) if (!mine.temp.includes(word)) delete mine.tempStyles[word];
        compose(mine);
    }

    // ───────────── 预览里点词 ─────────────

    /** 光标下的那个词（只看普通文字：替换成的名字、已有遮盖不算）。 */
    function wordUnder(mine, x, y) {
        let node = null, offset = 0;
        if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(x, y);
            node = pos?.offsetNode; offset = pos?.offset ?? 0;
        } else if (document.caretRangeFromPoint) {
            const range = document.caretRangeFromPoint(x, y);
            node = range?.startContainer; offset = range?.startOffset ?? 0;
        }
        if (!node || node.nodeType !== Node.TEXT_NODE || !mine.card.contains(node)) return null;
        if (node.parentElement.closest('[data-stcr-protected], .stcr-mask, .stcr-card-mark, .stcr-card-cover')) return null;
        for (const at of [offset, offset - 1]) {
            const word = wordAt(node.data, at);
            if (!word) continue;
            const range = document.createRange();
            range.setStart(node, word.start);
            range.setEnd(node, word.end);
            const hit = [...range.getClientRects()].some(r => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1);
            if (hit) return { text: node.data.slice(word.start, word.end), range };
        }
        return null;
    }

    function onHover(mine, event) {
        const { els } = mine;
        if (!mine.card || mine.exporting || !event) return;
        const mask = event.target.closest?.('.stcr-mask');
        if (mask && mine.card.contains(mask)) { els.hover.hidden = true; return; }
        const found = !getSelection()?.toString() && mine.card.contains(event.target) ? wordUnder(mine, event.clientX, event.clientY) : null;
        if (!found) { els.hover.hidden = true; mine.card.classList.remove('stcr-card--pick'); return; }
        const box = els.stage.getBoundingClientRect();
        const rects = [...found.range.getClientRects()];
        const left = Math.min(...rects.map(r => r.left)), right = Math.max(...rects.map(r => r.right));
        const top = Math.min(...rects.map(r => r.top)), bottom = Math.max(...rects.map(r => r.bottom));
        Object.assign(els.hover.style, {
            left: `${left - box.left + els.stage.scrollLeft - 2}px`, top: `${top - box.top + els.stage.scrollTop - 1}px`,
            width: `${right - left + 4}px`, height: `${bottom - top + 2}px`,
        });
        els.hover.hidden = false;
        mine.card.classList.add('stcr-card--pick');
    }

    function onCardClick(mine, event) {
        if (mine.exporting) return;
        if (mine.suppressClick) { mine.suppressClick = false; return; }
        const mask = event.target.closest('.stcr-mask');
        if (mask) {
            openMenu(mine, mine.words[Number(mask.dataset.stcrTw)], mask);
            return;
        }
        const found = wordUnder(mine, event.clientX, event.clientY);
        if (found && !mine.permanent.includes(found.text)) setTemp(mine, [...mine.temp, found.text]);
    }

    /** 在预览里拖选了一串字：整串临时遮住。 */
    function onDragSelect(mine) {
        const selection = getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount || !mine.card) return;
        const range = selection.getRangeAt(0);
        if (!mine.card.contains(range.startContainer) || !mine.card.contains(range.endContainer)) return;
        const word = cleanMaskWord(selection.toString());
        selection.removeAllRanges();
        mine.suppressClick = true;
        setTimeout(() => { if (st === mine) mine.suppressClick = false; }, 0);
        if (!word) { toast('一次最多遮 40 个字，请少选一些'); return; }
        if (!mine.permanent.includes(word)) setTemp(mine, [...mine.temp, word]);
    }

    // ───────────── 导出 ─────────────

    async function doExport(mine) {
        const { els } = mine;
        if (mine.exporting || !mine.card || els.exportBtn.disabled) return;
        mine.exporting = true;
        els.studio.classList.add('stcr-studio--busy');
        els.exportBtn.disabled = true;
        els.exportBtn.querySelector('i').className = 'fa-solid fa-spinner fa-spin';
        els.exportBtn.querySelector('.stcr-studio-export-label').textContent = '正在生成…';
        els.hover.hidden = true;
        closeMenu(mine);
        showNote(mine, '');
        const warnings = [];
        try {
            const size = CARD_SIZES[mine.prefs.size];
            await Promise.all([...mine.card.querySelectorAll('img')].map(img => img.decode().catch(() => {})));
            if (st !== mine) return;
            // 片段已在 createCardMessage 副本上替换过名字，且不再绑定原文：replaceNames:false 只是"导出时不再做名字阶段"（03 §5.9）。
            const blob = await exportCard(mine.card, {
                replaceNames: false, rules: [], assets: [], maskWords: mine.words, maskStyle: mine.style,
                width: size.width, scale: 2, onWarning: message => warnings.push(message),
            });
            if (st !== mine) return;
            const url = URL.createObjectURL(blob);
            mine.urls.push(url);
            const name = cardFileName();
            const link = h('a', { href: url, download: name, class: 'stcr-offscreen' });
            els.studio.append(link);
            link.click();
            link.remove();
            toast(`已导出：${name}（在浏览器的下载文件夹里）`);
            if (warnings.length) showNote(mine, `字体提示：${warnings.join(' ')}`);
        } catch (error) {
            if (st !== mine) return;
            console.error('[st-reader] 卡片导出失败：', error);
            showNote(mine, `导出失败：${error.message ?? error}。预览保留着，可以改一改再试。`, 'error');
        } finally {
            if (st === mine) {
                mine.exporting = false;
                els.studio.classList.remove('stcr-studio--busy');
                els.exportBtn.disabled = !mine.card?.querySelector('.stcr-card-chat')?.childElementCount;
                els.exportBtn.querySelector('i').className = 'fa-solid fa-download';
                els.exportBtn.querySelector('.stcr-studio-export-label').textContent = '导出 PNG';
            }
        }
    }

    // ───────────── 关闭 ─────────────

    /** 关掉：释放自己打开的聊天句柄、预览 DOM、Blob 地址（03 §5.9）。 */
    function close() {
        const mine = st;
        if (!mine) return;
        st = null;
        mine.token++;
        clearTimeout(mine.saveTimer);
        if (mine.saveTimer) store.settings.set(PREFS_KEY, { ...mine.prefs }).catch(() => {});
        mine.resize?.disconnect();
        mine.els.studio.remove();
        mine.els.scaler.replaceChildren();
        mine.card = null;
        mine.pieces = [];
        mine.cache.cards.clear();
        mine.cache.texts.clear();
        // 下载已经交给浏览器；稍等再收回地址，免得个别浏览器还没开始读。
        const urls = mine.urls;
        setTimeout(() => urls.forEach(url => URL.revokeObjectURL(url)), 1000);
        if (mine.source.ownsHandle) mine.source.handle.close();
        try { onClose?.(); } catch (error) { console.error(error); }
    }

    return {
        open,
        close,
        isOpen: () => st !== null,
        /** 阅读器换聊天 / 关闭时：借用的正是这个句柄就先关掉工作台。 */
        usesHandle: handle => !!st && st.source.handle === handle,
    };
}
