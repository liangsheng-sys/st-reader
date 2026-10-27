// ST Reader — AGPL-3.0
// 替换规则与自己的小图片（T23b、02 §6.4 第二层 + §6.5、F2a）。
// 规则存 store.replaceRules，图片存 store.assets（03 §5.5），都随备份导出/导入；只作用于分享卡片，不碰聊天（D02）。
// 这里是共用的零件：规则编辑框（工作台、预览点词、阅读器选中浮层三处用同一个）、图案选择条、导入图片、管理页。
// 文字一律 textContent；图片只用 store 校验过的本地 data URL，不联网（NF3）。

import { listCharacters, listGroups, parseChatKey } from '../core/chatSource.js';
import { ruleWords } from '../core/cardExport.js';
import { store } from '../core/store.js';
import { colorPicker } from './colorPicker.js';
import { h, iconButton } from './dom.js';
import { CARD_ICON_CHOICES, cleanMaskWord } from './logic.js';

export const ICON_NAMES = Object.freeze({ 'fa-star': '星星', 'fa-heart': '爱心', 'fa-cat': '小猫', 'fa-cloud': '云朵', 'fa-moon': '月亮', 'fa-shield': '盾牌' });
const MAX_BYTES = 200 * 1024;
const MAX_ASSETS = 30;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg';

/** 存储错误 → 给人看的话。 */
export function describeRuleError(error) {
    if (error?.code === 'ASSET_LIMIT') return `最多只能存 ${MAX_ASSETS} 张图片，先删掉几张不用的吧。`;
    if (error?.code === 'ASSET_IN_USE') return '有替换规则正在用这张图片。';
    if (error?.code === 'MISSING_ASSET') return '这条规则用的图片已经不在了，请重新选一个图案。';
    if (error?.code === 'UNAVAILABLE') return '浏览器存储用不了（可能是无痕模式或空间已满）。';
    if (error instanceof RangeError) return '图片太大，请换一张小一点的（不超过 200 KB）。';
    if (error instanceof TypeError && /PNG|JPG|WebP|SVG|签名|图片/.test(String(error.message))) return '这张图片用不了：只支持 PNG / JPG / WebP / SVG。';
    return String(error?.message ?? error);
}

// ───────────── 作用范围：全部聊天 / 仅某角色 ─────────────

let characterCache = null;
/** 头像文件名 → 角色名（只读卡片列表，不读聊天正文）。 */
async function characterNames() {
    characterCache ??= listCharacters().then(list => new Map(list.map(c => [c.avatarUrl, c.name]))).catch(error => { characterCache = null; throw error; });
    return characterCache;
}

/**
 * 当前聊天可选的作用范围与默认值：单聊默认"仅这个角色"（02 §6.4：在哪个角色的聊天里添加就默认仅该角色）；群聊默认全部，可选任一成员。
 * @returns {Promise<{options:{value:string,label:string}[], defaultScope:string, names:Map<string,string>}>}
 */
export async function ruleScopes(chatKey) {
    let names = new Map();
    try { names = await characterNames(); } catch (error) { console.warn('[st-reader] 角色列表读取失败：', error); }
    const options = [{ value: 'all', label: '全部聊天' }];
    let defaultScope = 'all';
    let key = null;
    try { key = chatKey ? parseChatKey(chatKey) : null; } catch { key = null; }
    if (key?.isGroup) {
        try {
            const group = (await listGroups()).find(g => g.id === key.groupId);
            for (const avatar of group?.members ?? []) options.push({ value: avatar, label: `仅 ${names.get(avatar) ?? avatar}` });
        } catch (error) { console.warn('[st-reader] 群组列表读取失败：', error); }
    } else if (key?.avatarUrl) {
        options.push({ value: key.avatarUrl, label: `仅 ${names.get(key.avatarUrl) ?? key.avatarUrl}` });
        defaultScope = key.avatarUrl;
    }
    return { options, defaultScope, names };
}

export const scopeLabel = (scope, names) => (scope === 'all' ? '全部聊天' : `仅 ${names?.get(scope) ?? scope}`);

// ───────────── 导入图片 ─────────────

/**
 * 让用户从自己电脑选一张图片存进 store.assets。返回存好的素材；取消或失败返回 null（失败会提示）。
 * @param {HTMLElement} host 放隐藏文件框的地方（阅读器里，点击不冒泡到 ST）
 */
export function importAsset(host, toast) {
    return new Promise(resolve => {
        const input = h('input', { type: 'file', accept: ACCEPT, class: 'stcr-offscreen' });
        host.append(input);
        input.addEventListener('cancel', () => { input.remove(); resolve(null); });
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            input.remove();
            if (!file) { resolve(null); return; }
            if (file.size > MAX_BYTES) { toast('图片太大，请换一张小一点的（不超过 200 KB）'); resolve(null); return; }
            try {
                const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || '我的图片';
                const saved = await store.assets.put({ name, blob: file });
                toast(`已导入图片：${saved.name}`);
                resolve(saved);
            } catch (error) {
                console.warn('[st-reader] 图片导入失败：', error);
                toast(`导入失败：${describeRuleError(error)}`);
                resolve(null);
            }
        });
        input.click();
    });
}

/** 一个图案的小样子：内置图标或自己的图片。 */
export function patternGlyph(target, assets) {
    if (target?.kind === 'asset') {
        const asset = assets.find(a => a.id === target.value);
        return asset ? h('img', { class: 'stcr-pattern-img', src: asset.dataUrl, alt: '' }) : h('i', { class: 'fa-solid fa-image stcr-pattern-missing', 'aria-hidden': 'true' });
    }
    return h('i', { class: `fa-solid ${target?.value ?? 'fa-star'}`, 'aria-hidden': 'true' });
}

/**
 * 图案选择条（02 §6.5）：六个内置图标 + 我导入的图片 + 最后一格"导入图片"。
 * @param {{value:{kind:'icon'|'asset',value:string}|null, assets:object[], onPick:(v:{kind,value})=>void, onImport:()=>void}} opts
 */
export function patternPicker({ value, assets, onPick, onImport }) {
    const same = (kind, id) => value?.kind === kind && value.value === id;
    const el = h('div', { class: 'stcr-studio-icons stcr-pattern-picker', role: 'group', 'aria-label': '选图案' },
        ...CARD_ICON_CHOICES.map(icon => h('button', { type: 'button', class: `stcr-btn stcr-icon-pick${same('icon', icon) ? ' stcr-on' : ''}`,
            'data-pick-kind': 'icon', 'data-pick': icon, title: ICON_NAMES[icon], 'aria-label': ICON_NAMES[icon] }, h('i', { class: `fa-solid ${icon}`, 'aria-hidden': 'true' }))),
        ...assets.map(asset => h('button', { type: 'button', class: `stcr-btn stcr-icon-pick${same('asset', asset.id) ? ' stcr-on' : ''}`,
            'data-pick-kind': 'asset', 'data-pick': asset.id, title: asset.name, 'aria-label': asset.name }, h('img', { class: 'stcr-pattern-img', src: asset.dataUrl, alt: '' }))),
        h('button', { type: 'button', class: 'stcr-btn stcr-icon-pick stcr-pattern-import', 'data-pick-import': '', disabled: assets.length >= MAX_ASSETS,
            title: assets.length >= MAX_ASSETS ? `最多 ${MAX_ASSETS} 张图片` : '导入自己的图片（PNG / JPG / WebP / SVG，不超过 200 KB）', 'aria-label': '导入图片' },
        h('i', { class: 'fa-solid fa-plus', 'aria-hidden': 'true' })));
    el.addEventListener('click', event => {
        if (event.target.closest('[data-pick-import]')) { onImport(); return; }
        const pick = event.target.closest('[data-pick]');
        if (pick) onPick({ kind: pick.dataset.pickKind, value: pick.dataset.pick });
    });
    return el;
}

/** 替换成的文字（带底色时照卡片上的样子画出底色）。 */
export function textTarget(to) {
    return h('span', { class: `stcr-map-to${to.background ? ' stcr-map-to--bg' : ''}`, style: to.background ? `background-color:${to.background}` : null,
        title: to.background ? `底色 ${to.background}` : null, text: to.value });
}

// ───────────── 规则编辑框 ─────────────

/**
 * 一条替换规则的编辑框。新建传 {from}；编辑传完整记录。保存走 store.replaceRules.put（带 id = 完整替换，先取旧字段）。
 * @param {{rule:object, scopes:{options:object[],defaultScope:string}, assets:object[], host:HTMLElement, toast:(m:string)=>void,
 *   onSaved:(rule:object)=>void, onCancel:()=>void, onAssetsChange?:(assets:object[])=>void, compact?:boolean, autoNames?:string[]}} opts
 *   autoNames：这个聊天里会被自动换成 char/user 的名字。原词是其中一部分时先提醒一次（06 I019）。
 */
export function createRuleEditor({ rule, scopes, assets: initialAssets, host, toast, onSaved, onCancel, onAssetsChange, compact = false, autoNames = [] }) {
    let warnedFor = null;
    let assets = [...initialAssets];
    const editing = !!rule.id;
    const state = {
        from: rule.from ?? '',
        aliases: Array.isArray(rule.aliases) ? [...rule.aliases] : [], // T81/D36：更多原词，一行一个
        kind: rule.to?.kind === 'icon' || rule.to?.kind === 'asset' ? 'pattern' : 'text',
        text: rule.to?.kind === 'text' ? rule.to.value : '',
        // 文字的背景色（T42、F14①）；null = 没有背景。换成图案时不带，改回文字时还在
        background: rule.to?.kind === 'text' ? rule.to.background ?? null : null,
        pattern: rule.to?.kind === 'icon' || rule.to?.kind === 'asset' ? { ...rule.to } : { kind: 'icon', value: 'fa-star' },
        scope: rule.scope ?? scopes.defaultScope,
        caseSensitive: rule.caseSensitive ?? false,
        // 中文没有空格分词，"整词"会让"爱丽丝说"里的"爱丽丝"不命中；默认关，拉丁字母的名字自己打开
        wholeWord: rule.wholeWord ?? false,
    };
    const scopeOptions = [...scopes.options];
    if (!scopeOptions.some(o => o.value === state.scope)) scopeOptions.push({ value: state.scope, label: scopeLabel(state.scope, scopes.names) });

    const fromInput = h('input', { type: 'text', class: 'text_pole stcr-studio-input', maxlength: '200', placeholder: '比如：鲍勃', 'aria-label': '原词' });
    fromInput.value = state.from;
    const aliasInput = h('textarea', { class: 'text_pole stcr-studio-input stcr-rule-aliases', rows: '2', placeholder: '同一个人 / 地方的别的叫法，一行一个（可不填）', 'aria-label': '更多原词' });
    aliasInput.value = state.aliases.join('\n');
    const textInput = h('input', { type: 'text', class: 'text_pole stcr-studio-input', maxlength: '60', placeholder: '比如：路人甲（留空 = 直接删掉这个词）', 'aria-label': '替换成的文字' });
    textInput.value = state.text;
    textInput.addEventListener('input', () => { const sample = backgroundBox.querySelector('.stcr-rule-bg-sample'); if (sample) sample.textContent = textInput.value.trim() || '示例'; });
    const kindSeg = h('div', { class: 'stcr-seg stcr-rule-kind', role: 'group', 'aria-label': '替换成' },
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-kind': 'text', text: '文字' }),
        h('button', { type: 'button', class: 'stcr-btn stcr-seg-btn', 'data-kind': 'pattern', text: '图案' }));
    const pickerBox = h('div', { class: 'stcr-rule-picker' });
    const backgroundBox = h('div', { class: 'stcr-rule-bg' });
    const scopeSelect = h('select', { class: 'text_pole stcr-studio-input stcr-rule-scope', 'aria-label': '作用范围' },
        ...scopeOptions.map(o => h('option', { value: o.value, text: o.label })));
    scopeSelect.value = state.scope;
    const check = (label, key, hint) => {
        const input = h('input', { type: 'checkbox' });
        input.checked = state[key];
        input.addEventListener('change', () => { state[key] = input.checked; });
        return h('label', { class: 'stcr-panel-check stcr-rule-check', title: hint }, input, label);
    };
    const error = h('p', { class: 'stcr-rule-error', role: 'alert' });
    const saveBtn = h('button', { type: 'submit', class: 'stcr-btn stcr-text-btn stcr-primary', text: editing ? '保存' : '添加规则' });
    const form = h('form', { class: `stcr-rule-editor${compact ? ' stcr-rule-editor--compact' : ''}` },
        h('label', { class: 'stcr-studio-field stcr-rule-row' }, h('span', { text: '原词' }), fromInput),
        h('label', { class: 'stcr-studio-field stcr-rule-row', title: '这些词也换成同样的东西，比如"灯塔"再加一行"灯台"' }, h('span', { text: '更多原词' }), aliasInput),
        h('div', { class: 'stcr-studio-field stcr-rule-row' }, h('span', { text: '换成' }), kindSeg),
        h('div', { class: 'stcr-rule-target' }, textInput, backgroundBox, pickerBox),
        h('label', { class: 'stcr-studio-field stcr-rule-row' }, h('span', { text: '范围' }), scopeSelect),
        h('div', { class: 'stcr-rule-checks' },
            check('区分大小写', 'caseSensitive', '打开后 Bob 和 bob 算两个词'),
            check('整词匹配', 'wholeWord', '打开后只换完整的词：Ann 不会换掉 Anna 里的 Ann。中文一般不用开')),
        error,
        h('div', { class: 'stcr-rule-actions' },
            h('button', { type: 'button', class: 'stcr-btn stcr-text-btn', 'data-rule-cancel': '', text: '取消' }), saveBtn));

    function sync() {
        for (const b of kindSeg.children) b.classList.toggle('stcr-on', b.dataset.kind === state.kind);
        textInput.hidden = state.kind !== 'text';
        backgroundBox.hidden = state.kind !== 'text';
        backgroundBox.replaceChildren(h('span', { class: 'stcr-rule-bg-label', text: '文字底色' }),
            colorPicker({ value: state.background, noneLabel: '不加底色', label: '文字底色', onPick: color => { state.background = color; sync(); } }),
            state.background ? h('span', { class: 'stcr-rule-bg-sample', style: `background-color:${state.background}`, text: textInput.value.trim() || '示例' }) : '');  // replaceChildren 会把 null 写成文字"null"
        pickerBox.hidden = state.kind !== 'pattern';
        pickerBox.replaceChildren(patternPicker({ value: state.pattern, assets, onPick: v => { state.pattern = v; sync(); }, onImport: () => doImport() }));
    }
    async function doImport() {
        const saved = await importAsset(host, toast);
        if (!saved) return;
        assets = [...assets, saved];
        state.pattern = { kind: 'asset', value: saved.id };
        onAssetsChange?.(assets);
        sync();
    }
    kindSeg.addEventListener('click', event => {
        const kind = event.target.closest('[data-kind]')?.dataset.kind;
        if (kind) { state.kind = kind; sync(); if (kind === 'text') textInput.focus(); }
    });
    scopeSelect.addEventListener('change', () => { state.scope = scopeSelect.value; });
    form.querySelector('[data-rule-cancel]').addEventListener('click', () => onCancel());
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const from = fromInput.value.trim();
        if (!from) { error.textContent = '请填原词'; fromInput.focus(); return; }
        const aliases = [...new Set(aliasInput.value.split('\n').map(word => word.trim()).filter(word => word && word !== from))];
        const tooLong = aliases.find(word => word.length > 200);
        if (tooLong) { error.textContent = `"${tooLong.slice(0, 20)}…"太长了，一个原词最多 200 字`; aliasInput.focus(); return; }
        const words = [from, ...aliases];
        // 背景色只在文字上有；不要背景就不带这个字段（03 §5.12：空值不合法）
        const to = state.kind === 'text' ? { kind: 'text', value: textInput.value.trim(), ...(state.background ? { background: state.background } : {}) } : { ...state.pattern };
        if (to.kind === 'asset' && !assets.some(a => a.id === to.value)) { error.textContent = '这张图片已经不在了，请换一个图案'; return; }
        // 我的规则优先于自动名字：原词若只是某个名字的一部分，那个名字会只换掉这一段，其余真名露在卡片上
        const norm = text => (state.caseSensitive ? text : text.toLowerCase());
        const part = words.find(word => autoNames.some(name => name && name !== word && norm(name).includes(norm(word))));
        const host_ = part && autoNames.find(name => name && name !== part && norm(name).includes(norm(part)));
        if (host_ && warnedFor !== part) {
            warnedFor = part;
            error.textContent = `注意："${part}"是名字"${host_}"的一部分。为了不把名字拆开露出一半，卡片上"${host_}"会整体按自动规则替换，这条规则只在名字以外的地方生效。确定就再点一次保存。`;
            return;
        }
        saveBtn.disabled = true;
        error.textContent = '';
        try {
            const all = await store.replaceRules.list();
            const twin = all.find(r => r.id !== rule.id && r.scope === state.scope && ruleWords(r).some(word => words.includes(word)));
            if (twin) {
                const word = ruleWords(twin).find(w => words.includes(w));
                error.textContent = `已经有"${word}"的规则（${scopeLabel(twin.scope, scopes.names)}），请直接改那一条。`; return;
            }
            const latest = editing ? await store.replaceRules.get(rule.id) : null;
            const record = { ...(latest ?? {}), ...(editing ? { id: rule.id } : {}), from, aliases, to, scope: state.scope,
                caseSensitive: state.caseSensitive, wholeWord: state.wholeWord };
            if (!aliases.length) delete record.aliases;
            const saved = await store.replaceRules.put(record);
            onSaved(saved);
        } catch (err) {
            console.warn('[st-reader] 替换规则保存失败：', err);
            error.textContent = `没保存上：${describeRuleError(err)}`;
        } finally { saveBtn.disabled = false; }
    });
    sync();
    return { el: form, focus: () => (state.from ? (state.kind === 'text' ? textInput : fromInput) : fromInput).focus() };
}

// ───────────── 管理页（工作台右侧的子页） ─────────────

/**
 * 管理替换规则 + 我的图片。规则是全局的（不分聊天），作用范围写在每条上。
 * @param {{host:HTMLElement, chatKey:string|null, toast:(m:string)=>void, confirm:(msg:string, ok:string)=>Promise<boolean>,
 *   onChange:()=>void, onBack:()=>void, words?:boolean, backLabel?:string}} deps  onChange：规则、屏蔽词或图片有变（工作台据此重建预览）
 *   words：顶上多一节"屏蔽词"（从 Aa 打开时，T81；工作台和截图窗口有自己的屏蔽词区）；backLabel 为 null 时不要返回按钮（外面的面板自己有关闭）
 */
export function createRulesManager({ host, chatKey, toast, confirm, onChange, onBack, autoNames = () => [], words: withWords = false, backLabel = '返回卡片设置' }) {
    let rules = [], assets = [], maskWords = [], scopes = { options: [{ value: 'all', label: '全部聊天' }], defaultScope: 'all', names: new Map() };
    let editingId = null; // 正在编辑的规则 id；'new' = 新建
    let renaming = null;
    const list = h('div', { class: 'stcr-rules-list', role: 'list' });
    const gallery = h('div', { class: 'stcr-assets' });
    const wordChips = h('div', { class: 'stcr-studio-chips' });
    const wordsSec = withWords ? h('section', { class: 'stcr-studio-sec stcr-rules-words' },
        h('h3', { class: 'stcr-studio-sec-title', text: '屏蔽词' }),
        h('p', { class: 'stcr-studio-hint', text: '遮住的词在脱敏显示里是涂黑条，在卡片和截图上变成 █。和分享卡片、HTML 截图是同一张表。' }),
        wordChips,
        h('form', { class: 'stcr-studio-add', 'data-words-add': '' },
            h('input', { type: 'text', class: 'text_pole stcr-studio-input', maxlength: '40', placeholder: '输入要遮住的词，回车添加', 'aria-label': '添加屏蔽词' }),
            h('button', { type: 'submit', class: 'stcr-btn stcr-text-btn', text: '添加' }))) : null;
    const el = h('div', { class: 'stcr-rules-page' },
        backLabel ? h('div', { class: 'stcr-rules-head' },
            h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-rules-back', 'data-rules-back': '' },
                h('i', { class: 'fa-solid fa-arrow-left', 'aria-hidden': 'true' }), ` ${backLabel}`)) : null,
        wordsSec,
        h('div', { class: 'stcr-rules-head' },
            h('h3', { class: 'stcr-studio-sec-title', text: '我的替换规则' }),
            h('p', { class: 'stcr-studio-hint', text: '这个词在分享卡片、HTML 截图和脱敏显示里总是换成你定的文字或小图案；一条规则可以有好几个原词。永久保存，随备份导出。不改聊天。' }),
            h('p', { class: 'stcr-studio-hint', text: '优先级：我的规则 > 自动（char / user） > 屏蔽词；长词先换（"爱丽丝小姐"先于"爱丽丝"）。' })),
        list,
        h('section', { class: 'stcr-studio-sec' },
            h('h3', { class: 'stcr-studio-sec-title', text: '我的图片' }),
            h('p', { class: 'stcr-studio-hint', text: 'PNG / JPG / WebP / SVG，每张不超过 200 KB，最多 30 张；建议方形、透明底。可以当替换图案、遮盖小图案、书摘封面。' }),
            gallery));
    el.addEventListener('click', onClick);
    wordsSec?.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault();
        const input = event.target.querySelector('input');
        const word = cleanMaskWord(input.value);
        if (!word) { if (input.value.trim()) toast('一个词最多 40 个字'); return; }
        if (maskWords.includes(word)) { toast(`"${word}"已经遮住了`); input.value = ''; return; }
        try { maskWords = await store.maskWords.add(word); }
        catch (error) { toast(`屏蔽词没保存上：${describeRuleError(error)}`); return; }
        input.value = '';
        toast(`已加入屏蔽词：${word}`);
        renderWords(); onChange();
    });

    async function load() {
        [rules, assets, scopes, maskWords] = await Promise.all([store.replaceRules.list(), store.assets.list(), ruleScopes(chatKey),
            withWords ? store.maskWords.list() : []]);
        render();
    }

    function renderWords() {
        if (!withWords) return;
        wordChips.replaceChildren(...(maskWords.length ? maskWords.map(word => h('span', { class: 'stcr-word-chip' }, h('span', { text: word }),
            iconButton('fa-xmark', `从屏蔽词里移除：${word}`, { class: 'stcr-word-x', 'data-word-drop': word })))
            : [h('span', { class: 'stcr-studio-hint', text: '还没有屏蔽词。' })]));
    }

    function targetLabel(rule) {
        if (rule.to.kind === 'text') return rule.to.value ? textTarget(rule.to) : h('span', { class: 'stcr-studio-hint', text: '（删掉，不显示）' });
        const name = rule.to.kind === 'asset' ? assets.find(a => a.id === rule.to.value)?.name ?? '（图片不在了）' : ICON_NAMES[rule.to.value] ?? rule.to.value;
        return h('span', { class: 'stcr-rule-pattern', title: name }, patternGlyph(rule.to, assets));
    }

    function render() {
        renderWords();
        const rows = rules.map(rule => (editingId === rule.id ? editorRow(rule) : h('div', { class: 'stcr-rule-item', role: 'listitem' },
            h('div', { class: 'stcr-rule-main' },
                h('div', { class: 'stcr-studio-map' }, h('span', { class: 'stcr-map-from', text: ruleWords(rule).join('、'), title: ruleWords(rule).join('、') }),
                    h('i', { class: 'fa-solid fa-arrow-right', 'aria-hidden': 'true' }), targetLabel(rule)),
                h('div', { class: 'stcr-item-meta', text: [scopeLabel(rule.scope, scopes.names), rule.caseSensitive ? '区分大小写' : '', rule.wholeWord ? '整词' : ''].filter(Boolean).join(' · ') })),
            iconButton('fa-pen', `改这条：${rule.from}`, { class: 'stcr-rule-btn', 'data-rule-edit': rule.id }),
            iconButton('fa-trash', `删除这条：${rule.from}`, { class: 'stcr-rule-btn', 'data-rule-drop': rule.id }))));
        if (editingId === 'new') rows.push(editorRow({}));
        else rows.push(h('button', { type: 'button', class: 'stcr-btn stcr-text-btn stcr-rules-add', 'data-rule-add': '' },
            h('i', { class: 'fa-solid fa-plus', 'aria-hidden': 'true' }), ' 添加规则'));
        if (!rules.length && editingId !== 'new') rows.unshift(h('p', { class: 'stcr-studio-hint', text: '还没有规则。卡片上认不出来的人名、昵称、地名，都可以在这里定。' }));
        list.replaceChildren(...rows);

        gallery.replaceChildren(...assets.map(asset => h('div', { class: 'stcr-asset' },
            h('img', { class: 'stcr-asset-img', src: asset.dataUrl, alt: '' }),
            renaming === asset.id
                ? h('form', { class: 'stcr-asset-rename', 'data-asset-rename': asset.id },
                    h('input', { type: 'text', class: 'text_pole stcr-studio-input', maxlength: '40', value: asset.name, 'aria-label': '图片名字' }))
                : h('button', { type: 'button', class: 'stcr-btn stcr-asset-name', 'data-asset-name': asset.id, title: '点这里改名', text: asset.name }),
            iconButton('fa-xmark', `删除图片：${asset.name}`, { class: 'stcr-asset-x', 'data-asset-drop': asset.id }))),
        h('button', { type: 'button', class: 'stcr-btn stcr-asset stcr-asset-add', 'data-asset-add': '', disabled: assets.length >= MAX_ASSETS,
            title: assets.length >= MAX_ASSETS ? `最多 ${MAX_ASSETS} 张` : '从电脑里选一张图片' },
        h('i', { class: 'fa-solid fa-plus', 'aria-hidden': 'true' }), h('span', { text: `导入图片（${assets.length}/${MAX_ASSETS}）` })));
        const input = gallery.querySelector('.stcr-asset-rename input');
        if (input) {
            input.focus(); input.select();
            input.form.addEventListener('submit', event => { event.preventDefault(); rename(input.form.dataset.assetRename, input.value); });
            input.addEventListener('blur', () => rename(input.form.dataset.assetRename, input.value));
            input.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); renaming = null; render(); } });
        }
    }

    function editorRow(rule) {
        const editor = createRuleEditor({ rule, scopes, assets, host, toast, autoNames: autoNames(),
            onAssetsChange: next => { assets = next; onChange(); },
            onCancel: () => { editingId = null; render(); },
            onSaved: saved => {
                editingId = null;
                toast(rule.id ? `已保存：${saved.from}` : `已添加规则：${saved.from}`);
                load().then(onChange);
            } });
        queueMicrotask(() => editor.focus());
        return h('div', { class: 'stcr-rule-item stcr-rule-item--edit', role: 'listitem' }, editor.el);
    }

    async function rename(id, value) {
        if (renaming !== id) return;
        renaming = null;
        const name = value.trim().slice(0, 40);
        const asset = assets.find(a => a.id === id);
        if (!asset || !name || name === asset.name) { render(); return; }
        try {
            await store.assets.put({ id, name, dataUrl: asset.dataUrl });
            toast(`已改名：${name}`);
            await load();
            onChange();
        } catch (error) { toast(`没改成：${describeRuleError(error)}`); render(); }
    }

    async function onClick(event) {
        const t = event.target;
        if (t.closest('[data-rules-back]')) { onBack(); return; }
        const wordDrop = t.closest('[data-word-drop]');
        if (wordDrop) {
            const word = wordDrop.dataset.wordDrop;
            try { maskWords = await store.maskWords.remove(word); toast(`已移除屏蔽词：${word}`); renderWords(); onChange(); }
            catch (error) { toast(`没移除成：${describeRuleError(error)}`); }
            return;
        }
        if (t.closest('[data-rule-add]')) { editingId = 'new'; render(); return; }
        const edit = t.closest('[data-rule-edit]');
        if (edit) { editingId = edit.dataset.ruleEdit; render(); return; }
        const drop = t.closest('[data-rule-drop]');
        if (drop) {
            const rule = rules.find(r => r.id === drop.dataset.ruleDrop);
            if (!rule || !await confirm(`删除替换规则"${rule.from}"？以后的卡片上这个词会回到自动替换或原样。`, '删除')) return;
            try { await store.replaceRules.remove(rule.id); toast(`已删除规则：${rule.from}`); await load(); onChange(); }
            catch (error) { toast(`没删成：${describeRuleError(error)}`); }
            return;
        }
        if (t.closest('[data-asset-add]')) {
            if (await importAsset(host, toast)) { await load(); onChange(); }
            return;
        }
        const nameBtn = t.closest('[data-asset-name]');
        if (nameBtn) { renaming = nameBtn.dataset.assetName; render(); return; }
        const assetDrop = t.closest('[data-asset-drop]');
        if (assetDrop) {
            const asset = assets.find(a => a.id === assetDrop.dataset.assetDrop);
            if (!asset) return;
            try {
                const users = await store.assets.references(asset.id);
                const message = users.length
                    ? `有 ${users.length} 条替换规则在用"${asset.name}"（${users.map(r => r.from).slice(0, 5).join('、')}${users.length > 5 ? '…' : ''}）。删除图片会连这些规则一起删掉。`
                    : `删除图片"${asset.name}"？`;
                if (!await confirm(message, users.length ? '连同规则一起删除' : '删除')) return;
                await store.assets.remove(asset.id, { removeRules: users.length > 0 });
                toast(users.length ? `已删除图片和 ${users.length} 条规则` : '已删除图片');
                await load();
                onChange();
            } catch (error) { toast(`没删成：${describeRuleError(error)}`); }
        }
    }

    return { el, load, isEditing: () => editingId !== null || renaming !== null };
}
