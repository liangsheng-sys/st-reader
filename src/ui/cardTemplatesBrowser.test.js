// ST Reader — AGPL-3.0
// T104 / D49 浏览器回归（只在开发实例跑；stcrSelfTest() 全量里带，单跑 stcrSelfTest({core:false,cardTemplates:true})）：
// 工作台里调一套配色 + 页眉 → 另存为模板 → 关掉再开还在 → 导出 PNG 与预览一致（尺寸、底色、再套用一次导出像素相同）→
// 导出 JSON（下载被截住，不落盘）→ 删除 → 粘贴导入又回来 → 含外链 url( 的 CSS 整份被拒 → 合法 CSS 导入后真的生效 → 设为默认。
// 不读写任何聊天；跑完恢复 stcr:ui:card:v1 与 stcr:ui:card:templates:v1。

import { store } from '../core/store.js';
import { isDevInstance } from '../core/readonlyGuard.js';
import { closeReader, isReaderOpen, openReader } from './reader.js';
import { BUNDLED_LINKS, BUNDLED_TEMPLATES, SEEDED_KEY } from './cardBundled.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const PREFS_KEY = 'stcr:ui:card:v1';
const TEMPLATES_KEY = 'stcr:ui:card:templates:v1';
const ASTER = 'STCR_T11_Aster.png/STCR-01-正则与多候选';

async function until(fn, label, ms = 8000) {
    const end = Date.now() + ms;
    for (;;) {
        const value = fn();
        if (value) return value;
        if (Date.now() > end) throw new Error(`等不到：${label}`);
        await wait(80);
    }
}

async function pixelsOf(blob) {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
}
const pixelAt = ({ width, data }, x, y) => [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 3)];
const near = (a, b, tolerance) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
function diffRatio(a, b) {
    if (a.width !== b.width || a.height !== b.height) return 1;
    let bad = 0;
    for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - b.data[i]) > 8 || Math.abs(a.data[i + 1] - b.data[i + 1]) > 8 || Math.abs(a.data[i + 2] - b.data[i + 2]) > 8) bad++;
    return bad / (a.width * a.height);
}

export async function testCardTemplatesBrowser({ force = false } = {}) {
    if (!isDevInstance(location) && !force) throw new Error('只在开发实例运行');
    if (isReaderOpen()) closeReader();
    const results = [];
    const check = (name, passed, detail = '') => results.push({ name, passed: !!passed, detail: String(detail) });
    const savedPrefs = await store.settings.get(PREFS_KEY, null);
    const savedTemplates = await store.settings.get(TEMPLATES_KEY, null);
    const savedSeeded = await store.settings.get(SEEDED_KEY, null);
    // 下载被截住：导出 PNG / 模板文件都不落盘
    const downloads = [];
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = blob => { const url = realCreate.call(URL, blob); downloads.push({ url, blob }); return url; };
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute('download')) { this.dataset.captured = '1'; return undefined; } return realClick.call(this); };
    const studio = () => document.querySelector('.stcr-studio');
    const card = () => studio()?.querySelector('.stcr-card');
    const toastText = () => document.querySelector('#stcr_root .stcr-toast')?.textContent ?? '';
    const openStudio = async () => {
        const floor = document.querySelector('#stcr_chat .mes[mesid="3"]');
        floor.scrollIntoView();
        floor.querySelector('[data-act="card"]').click();
        await until(() => studio() && card()?.querySelector('.mes_text'), '工作台与预览');
        await wait(300);
        for (const details of studio().querySelectorAll('.stcr-studio-grp')) details.open = true;
    };
    const closeStudio = async () => { studio()?.querySelector('[data-studio="close"]').click(); await until(() => !studio(), '工作台关闭'); await wait(150); };
    const click = async (selector, pause = 250) => { const el = studio().querySelector(selector); if (!el) throw new Error(`没有 ${selector}`); el.click(); await wait(pause); };
    const typeInto = async (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); await wait(200); };
    const switchOf = text => [...studio().querySelectorAll('.stcr-studio-switch')].find(label => label.textContent.trim().startsWith(text))?.querySelector('input');
    const tplButton = name => [...studio().querySelectorAll('.stcr-tpl-btn')].find(btn => btn.textContent.trim() === name);
    const exportPng = async () => {
        const before = downloads.length;
        studio().querySelector('[data-studio="export"]').click();
        await until(() => downloads.length > before, '导出的 PNG', 30000);
        await wait(300);
        const { blob } = downloads.at(-1);
        return { blob, pixels: await pixelsOf(blob) };
    };
    const confirmPopup = async () => {
        const ok = await until(() => document.querySelector('dialog[open] .popup-button-ok, .popup .popup-button-ok'), 'ST 确认弹窗');
        ok.click();
        await wait(400);
    };
    const savedList = async () => { await wait(350); return (await store.settings.get(TEMPLATES_KEY, [])) ?? []; }; // 界面写存储不等结果，稍等一下再读
    let popupFailure = null;
    try {
        await store.settings.remove(TEMPLATES_KEY);
        await store.settings.remove(PREFS_KEY);
        await store.settings.remove(SEEDED_KEY);
        await openReader({ chatKey: ASTER });
        await until(() => document.querySelector('#stcr_chat .mes[mesid="3"]'), '阅读器');
        [...document.querySelectorAll('#stcr_root .stcr-doc button')].find(b => /知道了/.test(b.textContent))?.click();

        // ── 0. 附带的七套主题：第一次打开装进自制模板；选中时预览下有留言链接；删掉的再开不回来
        await openStudio();
        check('附带主题：第一次打开工作台，七套都出现在模板行', BUNDLED_TEMPLATES.every(t => tplButton(t.name)), [...studio().querySelectorAll('.stcr-tpl-btn')].map(b => b.textContent.trim()).join('、'));
        const credit = () => studio().querySelector('.stcr-studio-credit');
        check('选内置模板时没有留言链接', credit().hidden);
        tplButton('粗野指北').click();
        await wait(500);
        const links = [...credit().querySelectorAll('a')];
        check('选"粗野指北"：预览下一行小字 + 类脑 / 旅程 / 棱镜三个链接（新窗口打开），且不在卡片里', !credit().hidden && links.map(a => a.href).join() === BUNDLED_LINKS.brutal.map(([, url]) => url).join()
            && links.every(a => a.target === '_blank') && !card().contains(credit()), credit().textContent);
        check('粗野指北：卡片显示原楼号 4', getComputedStyle(card().querySelector('.stcr-card-mes-no')).display !== 'none' && card().querySelector('.stcr-card-mes-no').textContent === '4');
        await click(`[data-tpl-more="b-brutal"]`, 250);
        await click('.stcr-tpl-menu [data-tpl-act="delete"]', 100);
        await confirmPopup();
        await until(() => !tplButton('粗野指北'), '"粗野指北"删掉');
        await closeStudio();
        await openStudio();
        check('删掉的附带主题，关掉再开不会装回来；其余六套还在', !tplButton('粗野指北') && (await savedList()).length === 6);
        await closeStudio();
        await store.settings.remove(TEMPLATES_KEY);
        await store.settings.remove(PREFS_KEY);
        await store.settings.set(SEEDED_KEY, BUNDLED_TEMPLATES.map(t => t.id)); // 下面的用例从"没有自制模板"开始
        await openStudio();

        // ── 1. 内置四套：默认选项下没有任何"新选项"的类名 / 变量，外观沿用旧规则
        const plain = [];
        for (const [name, id] of [['继承主题', 'theme'], ['纸张', 'paper'], ['深色', 'dark'], ['书摘', 'digest']]) {
            await click(`.stcr-tpl-btn[data-tpl="${id}"]`, 400);
            const c = card();
            const odd = ['stcr-card--pal', 'stcr-card--lh', 'stcr-card--ls', 'stcr-card--justify', 'stcr-card--ff'].filter(cls => c.classList.contains(cls));
            const vars = ['--stcr-fs', '--stcr-pad', '--stcr-lh', '--stcr-c-text'].filter(v => c.style.getPropertyValue(v));
            if (!c.classList.contains(`stcr-card--${id}`) || c.dataset.tpl !== id || odd.length || vars.length || c.querySelector('.stcr-card-head, .stcr-card-lead, .stcr-card-meta')
                || c.style.backgroundImage || c.style.borderRadius) plain.push(`${name}：${c.className} ${odd} ${vars}`);
        }
        check('内置四套模板默认选项下：没有配色 / 排版类名与变量，没有页眉、按语、页脚日期字数', plain.length === 0, plain.join('；'));
        check('右栏六组：模板 / 配色 / 排版 / 页眉页脚 / 自定义样式 / 遮盖与名字', [...studio().querySelectorAll('.stcr-studio-grp > summary')].map(s => s.textContent.trim()).join('/') === '模板/配色/排版/页眉页脚/自定义样式（写 CSS）/遮盖与名字');
        check('配色格子 ≥ 16 组预设 + 模板自带 + 自定义', studio().querySelectorAll('.stcr-pal-btn').length >= 18, studio().querySelectorAll('.stcr-pal-btn').length);

        // ── 2. 调一套：纸张底子 + 天青渐变 + 页眉（图标 + 标题）+ 格纹 + 圆角
        await click('.stcr-tpl-btn[data-tpl="paper"]', 400);
        await click('[data-pal="sky"]', 400);
        switchOf('页眉').click(); await wait(300);
        await click('[data-opt="headerIcon"][data-val="\\"fa-moon\\""]', 300);
        await typeInto(studio().querySelector('input[aria-label="页眉标题"]'), '星灯夜话');
        await click('[data-opt="texture"][data-val="\\"grid\\""]', 300);
        await click('[data-opt="radius"][data-val="24"]', 400);
        const c1 = card();
        const sky = ['#e4f2fc', '#cde2f7'];
        check('选天青配色后卡片带 --pal 类、渐变底色、字色变量', c1.classList.contains('stcr-card--pal') && /linear-gradient\(160deg/.test(c1.style.backgroundImage) && c1.style.backgroundImage.includes('repeating-linear-gradient')
            && !!c1.style.getPropertyValue('--stcr-c-text'), c1.getAttribute('style')?.slice(0, 200));
        check('页眉：小图标（图片）+ 标题"星灯夜话"', !!c1.querySelector('.stcr-card-head img.stcr-card-head-icon[src^="data:image/png"]') && c1.querySelector('.stcr-card-head-title')?.textContent === '星灯夜话');
        check('字色按底色自动取深色且 ≥ 4.5:1', (() => {
            const [r, g, b] = getComputedStyle(c1.querySelector('.mes_text')).color.match(/\d+/g).map(Number);
            return r + g + b < 300;
        })());

        // ── 3. 另存为模板"我的"
        await click('[data-studio="save-as"]', 300);
        const nameInput = studio().querySelector('.stcr-tpl-pop input');
        await typeInto(nameInput, '我的');
        nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await until(() => tplButton('我的'), '模板行里出现"我的"');
        let list = await savedList();
        check('另存为模板：模板行出现"我的"，存进 stcr:ui:card:templates:v1', list.length === 1 && list[0].name === '我的' && list[0].base === 'paper' && list[0].options.palette === 'sky' && list[0].options.headerTitle === '星灯夜话', JSON.stringify(list[0]).slice(0, 200));
        check('模板缩略色块按它的底色画', tplButton('我的').querySelector('.stcr-tpl-swatch')?.style.backgroundImage.includes('linear-gradient'));
        check('选中的是"我的"，"和模板不一样"的提示消失', tplButton('我的').classList.contains('stcr-on') && studio().querySelector('.stcr-tpl-state')?.hidden !== false);
        const idMine = list[0].id;
        check('卡片根带 data-tpl = 模板 id', card().dataset.tpl === idMine);
        const first = await exportPng();
        const previewH = card().offsetHeight;

        // ── 4. 关掉再开：模板行里有"我的"，上次的样子还在
        await closeStudio();
        await openStudio();
        check('关掉再开：模板行里有"我的"且仍选中，卡片还是天青渐变', !!tplButton('我的')?.classList.contains('stcr-on') && card().classList.contains('stcr-card--pal') && card().dataset.tpl === idMine);

        // ── 5. 导出 PNG 与预览一致
        check('导出 PNG：宽 1080、高 = 预览卡片高 × 2', first.pixels.width === 1080 && first.pixels.height === previewH * 2, `${first.pixels.width}×${first.pixels.height} vs 预览高 ${previewH}`);
        // 圆角 24px（×2 = 48px）：四角透明；正中间靠上的底色是渐变起点附近（天青浅蓝）
        const { pixels } = first;
        const corner = pixelAt({ width: pixels.width, data: pixels.data }, 2, 2);
        const alphaCorner = pixels.data[(2 * pixels.width + 2) * 4 + 3];
        check('导出图四角是透明圆角（预览里的圆角带进了 PNG）', alphaCorner < 60, `角上 alpha ${alphaCorner}`);
        const top = pixelAt(pixels, 540, 24), bottom = pixelAt(pixels, 540, pixels.height - 24);
        const hex = rgb => `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`;
        check('导出图底色是这组渐变（上浅下略深，都在天青两端色附近）', near(top, [0xe4, 0xf2, 0xfc], 40) && near(bottom, [0xcd, 0xe2, 0xf7], 40) && top.join() !== bottom.join(), `${hex(top)} → ${hex(bottom)}，期望 ${sky.join(' → ')}`);
        // 先换成别的模板再套回"我的"，导出的像素与第一次相同（模板能原样复现）
        await click('.stcr-tpl-btn[data-tpl="dark"]', 400);
        await click(`.stcr-tpl-btn[data-tpl="${idMine}"]`, 500);
        const second = await exportPng();
        check('换走再套回"我的"，导出像素与第一次一致（差异 < 0.1%）', diffRatio(first.pixels, second.pixels) < 0.001, `差异 ${(diffRatio(first.pixels, second.pixels) * 100).toFixed(3)}%`);

        // ── 6. 导出 JSON 文件
        const downloadsBefore = downloads.length;
        studio().querySelector(`.stcr-tpl-cell[data-tpl-custom="${idMine}"]`).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        await wait(250);
        check('右键点自制模板：弹出管理菜单（长按在手机上走同一个入口）', !!studio().querySelector('.stcr-tpl-menu'));
        await click(`[data-tpl-more="${idMine}"]`, 250);
        check('⋯ 菜单有：重命名 / 设为默认 / 导出为文件 / 复制为文本 / 删除', ['重命名', '设为默认', '导出为文件', '复制为文本', '删除'].every(t => [...studio().querySelectorAll('.stcr-tpl-menu button')].some(b => b.textContent.includes(t))));
        await click('.stcr-tpl-menu [data-tpl-act="file"]', 300);
        check('导出为文件：下载一份 .json', downloads.length === downloadsBefore + 1 && /\.json$/.test(studio().querySelector('a[download]')?.getAttribute('download') ?? 'x.json'));
        const fileText = await downloads.at(-1).blob.text();
        const file = JSON.parse(fileText);
        check('模板文件内容：format / version / name / base / options / css', file.format === 'stcr-card-template' && file.version === 1 && file.name === '我的' && file.base === 'paper' && file.options.palette === 'sky' && file.css === '' && !('id' in file), fileText.slice(0, 120));

        // ── 7. 删除 → 粘贴导入又回来
        await click(`[data-tpl-more="${idMine}"]`, 250);
        await click('.stcr-tpl-menu [data-tpl-act="delete"]', 100);
        await confirmPopup();
        await until(() => !tplButton('我的'), '"我的"从模板行消失');
        check('删除模板：模板行没了，存储里没了，当前不再指向它', (await savedList()).length === 0 && card().dataset.tpl === 'paper');
        await click('[data-studio="import-tpl"]', 300);
        await typeInto(studio().querySelector('.stcr-tpl-pop textarea'), fileText);
        await click('.stcr-tpl-pop .stcr-tpl-pop-row button', 500); // 第一个按钮 = 导入
        await until(() => tplButton('我的'), '粘贴导入后"我的"回来');
        list = await savedList();
        check('粘贴导入：模板回来了，选项与导出前一致，换了新 id', list.length === 1 && list[0].id !== idMine && JSON.stringify(list[0].options) === JSON.stringify(file.options), JSON.stringify(list[0]).slice(0, 160));
        check('导入后自动选中并套用：卡片又是天青渐变', card().classList.contains('stcr-card--pal') && tplButton('我的').classList.contains('stcr-on'));

        // ── 8. 导入被拒：含外链 url( 的 css；格式 / 版本不对；未知选项
        const bad = async (text, word, label) => {
            await click('[data-studio="import-tpl"]', 300);
            await typeInto(studio().querySelector('.stcr-tpl-pop textarea'), text);
            await click('.stcr-tpl-pop .stcr-tpl-pop-row button', 300);
            const message = studio().querySelector('.stcr-tpl-pop-err')?.textContent ?? '';
            const ok = !studio().querySelector('.stcr-tpl-pop-err')?.hidden && message.includes(word);
            check(`导入被拒：${label}`, ok && (await savedList()).length === list.length, message.slice(0, 90));
            await click('.stcr-tpl-pop .stcr-tpl-pop-row button:nth-child(3)', 150); // 取消
        };
        const mk = patch => JSON.stringify({ ...file, ...patch });
        await bad(mk({ css: '.mes_text { background: url(https://example.invalid/a.png) }' }), '外链', '含外链 url( 的 CSS');
        await bad(mk({ css: '@import url("https://example.invalid/a.css");' }), '@import', '@import');
        await bad(mk({ css: '.a { position: fixed }' }), 'fixed', 'position:fixed');
        await bad(mk({ css: 'body { background: red }' }), '卡片以外', '写到卡片以外的选择器');
        await bad(mk({ version: 2 }), 'version', '版本不对');
        await bad(mk({ options: { ...file.options, sparkle: true } }), 'options.sparkle', '未知选项');
        await bad(mk({ options: { ...file.options, fontSize: 'xxl' } }), 'options.fontSize', '越界的值');
        check('被拒的模板没有任何外网请求残留：卡片里没有外链资源', ![...card().querySelectorAll('[src], [style]')].some(el => /https?:\/\/example\.invalid/.test(`${el.getAttribute('src') ?? ''}${el.getAttribute('style') ?? ''}`)));

        // ── 9. 合法的附加 CSS：导入后真的生效，且只在这张卡里
        const cssFile = mk({ name: '带样式', css: '.mes_text { color: #cc0033 !important; }\n.stcr-card { box-shadow: none; }' });
        await click('[data-studio="import-tpl"]', 300);
        await typeInto(studio().querySelector('.stcr-tpl-pop textarea'), cssFile);
        await click('.stcr-tpl-pop .stcr-tpl-pop-row button', 600);
        await until(() => tplButton('带样式'), '带样式模板');
        const styleEl = card().querySelector('style[data-stcr-tplcss]');
        const scope = `#stcr_root .stcr-card[data-tpl="${card().dataset.tpl}"]`;
        check('附加 CSS：作为 <style> 放进卡片，每条选择器都带该模板的前缀', !!styleEl && styleEl.textContent.split('}').flatMap(r => r.split('{')[0].split(',').map(x => x.trim())).filter(Boolean).every(s => s.startsWith(scope) || s.startsWith(`#stcr_root .stcr-card.stcr-tpl-${card().dataset.tpl}`)), styleEl?.textContent.slice(0, 120));
        check('附加 CSS 生效：卡片里正文变成 rgb(204, 0, 51)；阅读器正文没被影响', getComputedStyle(card().querySelector('.mes_text')).color === 'rgb(204, 0, 51)'
            && getComputedStyle(document.querySelector('#stcr_chat .mes_text')).color !== 'rgb(204, 0, 51)');
        const withCss = await exportPng();
        let red = 0;
        for (let i = 0; i < withCss.pixels.data.length; i += 4) if (withCss.pixels.data[i] > 170 && withCss.pixels.data[i + 1] < 60 && withCss.pixels.data[i + 2] < 100) red++;
        check('附加 CSS 带进了导出的 PNG（图里有 #cc0033 的字）', red > 200, `红色像素 ${red}`);
        // 9b. 原楼号默认藏着；纸张署名前的"— "是 CSS 加的
        const no = card().querySelector('.stcr-card-mes-no');
        const sign = card().querySelector('.stcr-card-sign');
        check('每楼带原楼号（第 4 楼写 "4"），默认不显示', no?.textContent === '4' && getComputedStyle(no).display === 'none', no?.textContent);
        check('纸张署名：文字里没有"— "，破折号来自 ::before', !sign || (!sign.textContent.startsWith('—') && getComputedStyle(sign, '::before').content.includes('—')), sign?.textContent);
        // 9c. 模板定强调色 + 显示楼号 + 去掉破折号
        const accentFile = mk({ name: '强调色', options: { ...file.options, accent: '#1d6fb8', headerOn: true },
            css: '.stcr-card-mes-no { display: inline; }\n.stcr-card-sign::before { content: none; }' });
        await click('[data-studio="import-tpl"]', 300);
        await typeInto(studio().querySelector('.stcr-tpl-pop textarea'), accentFile);
        await click('.stcr-tpl-pop .stcr-tpl-pop-row button', 600);
        await until(() => tplButton('强调色'), '强调色模板');
        const no2 = card().querySelector('.stcr-card-mes-no'), sign2 = card().querySelector('.stcr-card-sign');
        check('options.accent：卡片强调色变量 = #1d6fb8（页眉图标、色块、小图案同源）', card().style.getPropertyValue('--stcr-card-accent') === '#1d6fb8', card().style.getPropertyValue('--stcr-card-accent'));
        check('模板 CSS 能打开楼号、能去掉署名前的破折号', getComputedStyle(no2).display === 'inline' && (!sign2 || getComputedStyle(sign2, '::before').content === 'none'));
        const idAccent = (await savedList()).find(t => t.name === '强调色').id;
        await click(`[data-tpl-more="${idAccent}"]`, 250);
        await click('.stcr-tpl-menu [data-tpl-act="delete"]', 100);
        await confirmPopup();
        await until(() => !tplButton('强调色'), '"强调色"删掉');
        await click(`.stcr-tpl-btn[data-tpl="${(await savedList()).find(t => t.name === '带样式').id}"]`, 400);

        // ── 10. 设为默认：下次打开直接用它；取消默认
        const idCss = (await savedList()).find(t => t.name === '带样式').id;
        await click(`[data-tpl-more="${idCss}"]`, 250);
        await click('.stcr-tpl-menu [data-tpl-act="default"]', 300);
        await click('.stcr-tpl-btn[data-tpl="digest"]', 400); // 这次改用书摘，但默认仍是"带样式"
        await closeStudio();
        await openStudio();
        check('设为默认：关掉再开，直接用"带样式"，模板行里它带星标', card().dataset.tpl === idCss && !!studio().querySelector('.stcr-tpl-default'));
        await click(`[data-tpl-more="${idCss}"]`, 250);
        await click('.stcr-tpl-menu [data-tpl-act="default"]', 300);
        check('再点一次取消默认，星标消失', !studio().querySelector('.stcr-tpl-default'));

        // ── 11. 重命名
        await click(`[data-tpl-more="${idCss}"]`, 250);
        await click('.stcr-tpl-menu [data-tpl-act="rename"]', 200);
        const renameInput = studio().querySelector('.stcr-tpl-pop input');
        await typeInto(renameInput, '改过名');
        renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await until(() => tplButton('改过名'), '重命名');
        check('重命名：模板行与存储都改了', (await savedList()).some(t => t.id === idCss && t.name === '改过名'));

        // ── 12. 自定义样式框（写 CSS）：输入马上生效、坏的不生效并说原因、能覆盖已存模板、示例能一键填入
        const cssArea = () => studio().querySelector('.stcr-studio-css');
        await typeInto(cssArea(), '.mes_text { color: #0a7a3c; }');
        await wait(700);
        check('自定义样式：输入后预览里正文变成 rgb(10, 122, 60)，状态写"样式已生效"，阅读器正文不受影响', getComputedStyle(card().querySelector('.mes_text')).color === 'rgb(10, 122, 60)'
            && /样式已生效/.test(studio().querySelector('.stcr-studio-css-state').textContent) && getComputedStyle(document.querySelector('#stcr_chat .mes_text')).color !== 'rgb(10, 122, 60)');
        check('自定义样式：卡片带 stcr-tpl-<id> 类（导出副本靠它命中）', [...card().classList].some(name => name.startsWith('stcr-tpl-')));
        const green = await exportPng();
        let greenPx = 0;
        for (let i = 0; i < green.pixels.data.length; i += 4) if (green.pixels.data[i] < 60 && green.pixels.data[i + 1] > 90 && green.pixels.data[i + 2] < 90) greenPx++;
        check('自定义样式带进了导出的 PNG（图里有 #0a7a3c 的字）', greenPx > 200, `绿色像素 ${greenPx}`);
        await typeInto(cssArea(), '@import url(https://example.invalid/a.css); .mes_text { color: #0a7a3c; }');
        await wait(700);
        check('坏样式（@import）：状态点名原因，预览里不套这份样式', /没有生效/.test(studio().querySelector('.stcr-studio-css-state').textContent) && /@import/.test(studio().querySelector('.stcr-studio-css-state').textContent)
            && !card().querySelector('style[data-stcr-tplcss]'));
        await typeInto(cssArea(), '.mes_text { color: #0a7a3c; }');
        await wait(700);
        await click(`[data-tpl-more="${idCss}"]`, 250);
        await click('.stcr-tpl-menu [data-tpl-act="update"]', 400);
        check('"用现在的设置覆盖它"：存储里该模板的 css 换成新的', (await savedList()).find(t => t.id === idCss)?.css === '.mes_text { color: #0a7a3c; }');
        await click('.stcr-tpl-btn[data-tpl="paper"]', 400);
        check('换成内置模板：自定义样式清空，预览不带这份样式', cssArea().value === '' && !card().querySelector('style[data-stcr-tplcss]'));

        // ── 13. 新选项：气泡 / 对白 / 名字 / 边框；默认不加类
        const classes = () => [...card().classList];
        check('默认状态卡片不带任何新选项类（内置外观不变的保证）', !classes().some(name => /--(bubble|q-|n-|frame-)/.test(name)), classes().join(' '));
        const choose = (key, value) => click(`[data-opt="${key}"][data-val='${JSON.stringify(value)}']`);
        await choose('layout', 'bubble'); await choose('quoteStyle', 'highlight');
        await choose('nameStyle', 'chip'); await choose('frame', 'thin');
        check('选了气泡 / 荧光笔 / 标签 / 细框：卡片根带对应的类', ['stcr-card--bubble', 'stcr-card--q-highlight', 'stcr-card--n-chip', 'stcr-card--frame-thin'].every(name => classes().includes(name)), classes().join(' '));
        check('气泡：正文有圆角底色；每楼带 --user / --char 类', parseFloat(getComputedStyle(card().querySelector('.mes_text')).borderTopLeftRadius) > 4
            && !!card().querySelector('.stcr-card-mes--user, .stcr-card-mes--char'));
        await click('[data-studio="revert-tpl"]', 400);
        check('点"还原"：新选项回到默认，类都没了', !classes().some(name => /--(bubble|q-|n-|frame-)/.test(name)), classes().join(' '));

        // ── 14. 示例与 AI 说明
        await click('[data-studio="css-example"]', 900);
        check('填入示例（推文版式）：页眉标题加粗到 800，状态"样式已生效"', getComputedStyle(card().querySelector('.stcr-card-head-title')).fontWeight === '800'
            && /样式已生效/.test(studio().querySelector('.stcr-studio-css-state').textContent), studio().querySelector('.stcr-studio-css-state').textContent);
        await click('[data-studio="copy-guide"]', 500);
        check('"复制给 AI 的说明"有反馈（成功或提示失败）', toastText().length > 0, toastText());
    } catch (error) {
        popupFailure = error;
        check('卡片模板浏览器回归没有中途出错', false, error?.stack ?? error);
    } finally {
        URL.createObjectURL = realCreate;
        HTMLAnchorElement.prototype.click = realClick;
        for (const { url } of downloads) URL.revokeObjectURL(url);
        if (studio()) await closeStudio().catch(() => {});
        if (isReaderOpen()) closeReader();
        if (savedPrefs === null) await store.settings.remove(PREFS_KEY); else await store.settings.set(PREFS_KEY, savedPrefs);
        if (savedTemplates === null) await store.settings.remove(TEMPLATES_KEY); else await store.settings.set(TEMPLATES_KEY, savedTemplates);
        if (savedSeeded === null) await store.settings.remove(SEEDED_KEY); else await store.settings.set(SEEDED_KEY, savedSeeded);
    }
    if (!popupFailure) check('测试后恢复了 stcr:ui:card:v1 与 stcr:ui:card:templates:v1', JSON.stringify(await store.settings.get(TEMPLATES_KEY, null)) === JSON.stringify(savedTemplates));
    return results;
}
