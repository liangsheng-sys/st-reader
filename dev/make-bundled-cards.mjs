// 重新生成 src/ui/cardBundled.js 里的七套附带卡片模板（数据段）。
// 来源是作者的主题文件夹（只读）：node dev/make-bundled-cards.mjs "F:/sillytavern美化/分享卡片"
// 每个文件先用阅读器自己的 parseTemplateText 校验，不合格就停下并说出是哪一个。
// 加新主题：在下面 LIST 里加一行（id 一经发布不要改：用户删掉后靠它记住"别再装回来"），并在 cardBundled.js 的 BUNDLED_LINKS 里补链接。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2];
if (!dir) { console.error('用法：node dev/make-bundled-cards.mjs <主题文件夹>'); process.exit(1); }
const { parseTemplateText } = await import(pathToFileURL(join(root, 'src/ui/cardTemplates.js')).href);
const LIST = [
    ['b-zhishang-day', 'zhishang', '纸上访谈 · 昼'],
    ['b-zhishang-night', 'zhishang', '纸上访谈 · 夜'],
    ['b-brutal', 'brutal', '粗野指北'],
    ['b-wps-pc', 'wps', 'WPS文档 · 电脑'],
    ['b-wps-m', 'wps', 'WPS文档 · 手机'],
    ['b-xp', 'xp', 'XP Messenger'],
    ['b-xuyu', 'xuyu', '絮语 · 深绿夜'],
];
const items = LIST.map(([id, theme, file]) => {
    const text = readFileSync(join(dir, `${file}.json`), 'utf8');
    const parsed = parseTemplateText(text);
    if (!parsed.ok) throw new Error(`${file}：${parsed.error}`);
    const raw = JSON.parse(text);
    return `    { id: ${JSON.stringify(id)}, theme: ${JSON.stringify(theme)}, name: ${JSON.stringify(raw.name)}, base: ${JSON.stringify(raw.base)},\n        options: ${JSON.stringify(raw.options)},\n        css: ${JSON.stringify(raw.css)} },`;
});
const out = join(root, 'src/ui/cardBundled.js');
const src = readFileSync(out, 'utf8');
const start = src.indexOf('// ── 数据开始');
const end = src.indexOf('// ── 数据结束');
if (start < 0 || end < 0) throw new Error('cardBundled.js 里找不到数据段标记');
writeFileSync(out, `${src.slice(0, start)}// ── 数据开始（node dev/make-bundled-cards.mjs 生成，别手改）\nconst RAW = [\n${items.join('\n')}\n];\n${src.slice(end)}`);
console.log(`已生成 ${items.length} 套 → src/ui/cardBundled.js`);
