import { automaticNameRules, replaceNamesInRaw, maskText, normalizeMaskStyle } from './cardTransforms.js';
import { rasterizeCardIcon } from './cardFonts.js';
const assert = (value, message = '脱敏断言失败') => { if (!value) throw new Error(message); };
const text = result => result.segments.map(item => item.kind === 'text' ? item.text : item.to.kind === 'text' ? item.to.value : `[${item.to.kind}]`).join('');
const rule = (from, value, extra = {}) => ({ from, to: { kind: 'text', value }, scope: 'all', ...extra });
const rejects = run => { let failed = false; try { run(); } catch { failed = true; } assert(failed, '应拒绝无效输入'); };

/** Node 与浏览器共用；覆盖原文变换、优先级、Unicode 边界与不含原词的遮盖描述。 */
export async function testCardExportLogic() {
    const results = [];
    const test = (name, run) => { run(); results.push({ name: `T14 ${name}`, passed: true }); };
    test('单聊自动名字与宏在原文层替换', () => {
        assert(text(replaceNamesInRaw('小舟向星灯说：{{user}} / {{char}}', { userName: '小舟', characterName: '星灯' })) === 'user向char说：user / char');
    });
    test('大小写/空白名字宏受我的规则覆盖，未知群成员不误编号', () => {
        assert(text(replaceNamesInRaw('{{ CHAR }} {{ User }}', { userName: '小舟', characterName: '星灯', rules: [rule('星灯', '访客')] })) === '访客 user');
        assert(text(replaceNamesInRaw('{{char}}', { isGroup: true, groupNames: ['星灯'], characterName: '缺席者' })) === 'char');
    });
    test('群成员按定义顺序编号，不按发言先后', () => {
        assert(text(replaceNamesInRaw('纸鸢 星灯 雾岚 {{char}}', { isGroup: true, groupNames: ['星灯', '雾岚', '纸鸢'], characterName: '雾岚' })) === 'char3 char1 char2 char2');
    });
    test('我的规则覆盖自动名字，同级长词优先', () => {
        assert(text(replaceNamesInRaw('爱丽丝小姐 爱丽丝', { characterName: '爱丽丝', rules: [rule('爱丽丝', '阿丽'), rule('爱丽丝小姐', '贵客')] })) === '阿丽小姐 阿丽');
        assert(text(replaceNamesInRaw('今晚的星图 星图', { rules: [rule('星图', '图'), rule('今晚的星图', '夜景')] })) === '夜景 图');
    });
    test('自动名字完整保护，部分重叠记录 skippedOverlap', () => {
        const result = replaceNamesInRaw('甲乙丙 乙 甲乙丙', { characterName: '甲乙丙', rules: [rule('乙', '客')] });
        assert(text(result) === 'char 客 char');
        const mapping = result.mappings.find(item => item.source === 'automatic');
        assert(mapping.skippedOverlap && mapping.count === 2 && mapping.skippedRules[0].from === '乙' && mapping.skippedRules[0].count === 2);
        const crossing = replaceNamesInRaw('前甲乙丙', { characterName: '甲乙丙', rules: [rule('前甲乙', '错误'), rule('前', '先')] });
        assert(text(crossing) === '先char' && !crossing.mappings[0].skippedOverlap && crossing.mappings[1].skippedOverlap);
        assert(maskText('甲乙丙', ['甲乙', '乙丙']).filter(item => item.kind === 'mask').length === 1);
    });
    test('用户/群成员、跨边界和包含整个名字的长规则均不能拆名字', () => {
        const result = replaceNamesInRaw('测试旅人（虚构） 星灯 雾岚 来到星灯塔', { userName: '测试旅人（虚构）', isGroup: true, groupNames: ['星灯', '雾岚'],
            rules: [rule('虚构', '假想'), rule('星', '月'), rule('雾岚', '同伴'), rule('来到星灯塔', '地点')] });
        assert(text(result) === 'user char1 同伴 来到char1塔');
        assert(result.mappings.filter(item => item.skippedOverlap).length === 2);
    });
    test('原词严格同名才可覆盖，大小写不敏感/整词/作用域仍独立生效', () => {
        assert(text(replaceNamesInRaw('Alice ALICE Alice', { characterName: 'Alice', rules: [rule('alice', '客')] })) === 'char 客 char');
        assert(text(replaceNamesInRaw('(Alice) AliceZ', { characterName: 'Alice', rules: [rule('Alice', '客', { wholeWord: true })] })) === '(客) charZ');
        assert(text(replaceNamesInRaw('星灯', { characterName: '星灯', avatarUrl: 'A', rules: [rule('星灯', '客', { scope: 'B' })] })) === 'char');
        assert(text(replaceNamesInRaw('小星灯', { characterName: '小星灯', userName: '星灯', rules: [rule('星灯', '客')] })) === 'char');
        assert(text(replaceNamesInRaw('小星灯', { characterName: '小星灯', userName: '星灯', rules: [rule('小星灯', '客')] })) === '客');
    });
    test('图标 Canvas 字体含空格/引号时仍是 100px 完整字体名', () => {
        for (const family of ['Font Awesome 6 Free', '"Font Awesome 6 Free"']) {
            const context = { fillText() {} };
            const doc = { fonts: [{ family, status: 'loaded', weight: '900' }], createElement: () => ({ getContext: () => context, toDataURL: () => 'png' }) };
            rasterizeCardIcon('\uf005', '#000', doc);
            assert(context.font === '900 100px "Font Awesome 6 Free"');
        }
    });
    test('替换目标不被下一条规则递归处理', () => {
        assert(text(replaceNamesInRaw('A B', { rules: [rule('A', 'B'), rule('B', 'C')] })) === 'B C');
    });
    test('作用范围按目标角色头像，而非宿主当前角色', () => {
        assert(text(replaceNamesInRaw('小咪', { avatarUrl: 'A.png', rules: [rule('小咪', '猫', { scope: 'B.png' })] })) === '小咪');
        assert(text(replaceNamesInRaw('小咪', { avatarUrl: 'B.png', rules: [rule('小咪', '猫', { scope: 'B.png' })] })) === '猫');
    });
    test('字面匹配不解释正则特殊字符', () => {
        assert(text(replaceNamesInRaw('A.* [B] $1', { rules: [rule('A.*', '$2'), rule('[B]', 'OK')] })) === '$2 OK $1');
    });
    test('大小写选项与不敏感 Unicode 匹配保持原偏移', () => {
        assert(text(replaceNamesInRaw('Alice ALICE alice', { rules: [rule('Alice', '客', { caseSensitive: true })] })) === '客 ALICE alice');
        assert(text(replaceNamesInRaw('Alice ALICE alice', { rules: [rule('Alice', '客')] })) === '客 客 客');
    });
    test('整词边界不误中词内片段，中文按 Unicode 字符边界', () => {
        assert(text(replaceNamesInRaw('Ann Anna (Ann) 前Ann后', { rules: [rule('Ann', '客', { wholeWord: true })] })) === '客 Anna (客) 前Ann后');
    });
    test('图标和图片为结构化目标，不能注入 HTML', () => {
        const result = replaceNamesInRaw('星灯 雾岛', { rules: [{ from: '星灯', to: { kind: 'icon', value: 'fa-cat' } }, { from: '雾岛', to: { kind: 'asset', value: 'asset-1' } }] });
        assert(text(result) === '[icon] [asset]');
        rejects(() => replaceNamesInRaw('A', { rules: [{ from: 'A', to: { kind: 'icon', value: 'fa-cat onclick=bad' } }] }));
    });
    test('关闭总开关时保留全部原文，不执行我的规则', () => {
        assert(text(replaceNamesInRaw('星灯', { replaceNames: false, characterName: '星灯', rules: [rule('星灯', '访客')] })) === '星灯');
    });
    test('输入与规则不变，映射只记录实际命中', () => {
        const options = { rules: [rule('星灯', '客'), rule('未出现', 'X')] }, before = JSON.stringify(options);
        const result = replaceNamesInRaw('星灯 星灯', options);
        assert(JSON.stringify(options) === before && result.mappings.length === 1 && result.mappings[0].count === 2);
    });
    test('三种遮盖描述不保存被屏蔽文字，默认统一长度', () => {
        for (const kind of ['bar', 'block', 'sticker']) {
            const masked = maskText('秘密 短 八个字以上的长长秘密', ['秘密', '短', '八个字以上的长长秘密'], kind).filter(item => item.kind === 'mask');
            assert(masked.length === 3 && masked.every(item => item.width === 3));
            assert(!JSON.stringify(masked).includes('秘密'));
        }
    });
    test('非统一长度按 Unicode 码点计数，不拆 emoji', () => {
        assert(maskText('前😀😀后', ['😀😀'], { kind: 'bar', uniform: false })[1].width === 2);
    });
    test('屏蔽为字面长词优先，不处理不匹配文字', () => {
        const result = maskText('前爱丽丝小姐后.*', ['爱丽丝', '爱丽丝小姐', '.*']);
        assert(result.filter(item => item.kind === 'mask').length === 2 && result.filter(item => item.kind === 'text').map(item => item.text).join('') === '前后');
    });
    test('拒绝透明遮盖、空词与无效目标', () => {
        rejects(() => normalizeMaskStyle({ kind: 'bar', color: 'transparent' }));
        rejects(() => maskText('A', ['']));
        rejects(() => replaceNamesInRaw('A', { rules: [rule('', 'B')] }));
    });
    test('没有名字时不产生空字符串替换', () => {
        assert(text(replaceNamesInRaw('原文')) === '原文');
        assert(automaticNameRules().every(item => item.from));
    });
    return results;
}
