// 全部角色、故事、日期、对白和“思维链”均为人工构造的虚构测试样本。
// 思维链字段只放测试说明，不含任何模型的真实内部推理。
export const FIXTURE_ID = 'stcr-t11-v1';
export const USER_NAME = '测试旅人（虚构）';
export const THEME_NAME = 'STCR T11 · 雾岛纸页';
export const GROUP_ID = 'stcr-t11-island';
export const GROUP_CHAT = 'stcr-t11-island-chat';
export const BIG_CHAT = 'STCR-90-大文件-1600楼';
export const CHARACTERS = Object.freeze([
    { id: 'Aster', name: '星灯（虚构）', chat: 'STCR-01-正则与多候选', color: [240, 185, 72] },
    { id: 'Paper', name: '纸舟（虚构）', chat: 'STCR-02-代码与长文', color: [64, 177, 175] },
    { id: 'Mist', name: '雾岚（虚构）', chat: 'STCR-03-普通阅读', color: [166, 131, 221] },
].map(character => Object.freeze({ ...character, avatar: `STCR_T11_${character.id}.png` })));

function regex(id, scriptName, findRegex, replaceString, options = {}) {
    return {
        id: `stcr-t11-${id}`, scriptName: `STCR T11 · ${scriptName}`, findRegex, replaceString,
        trimStrings: [], placement: [2], disabled: false, markdownOnly: true, promptOnly: false,
        runOnEdit: false, substituteRegex: 0, minDepth: null, maxDepth: null, ...options,
    };
}

export const GLOBAL_REGEX = [
    regex('once', '只跑一次', '/【一次】/g', '【一次】✓'),
    regex('names', '角色与用户宏', '/【称呼】/g', '<strong class="stcr-fixture-names">来自 {{char}}，写给 {{user}}</strong>'),
    regex('depth', '最近三楼', '/【近景】/g', '<em class="stcr-fixture-depth">近景命中</em>', { minDepth: 0, maxDepth: 2 }),
    regex('reasoning', '思维链显示', '/【思考标记】/g', '【思考命中】', { placement: [6] }),
    regex('disabled', '禁用对照', '/【禁止命中】/g', '错误：禁用脚本被执行', { disabled: true }),
];
export const SCOPED_REGEX = [regex('scope', '星灯专属', '/【星灯暗号】/g', '<span class="stcr-fixture-scope">星灯作用域命中</span>')];

export const THEME = {
    name: THEME_NAME, main_text_color: 'rgba(235, 226, 205, 1)', italics_text_color: 'rgba(142, 215, 195, 1)',
    quote_text_color: 'rgba(255, 205, 117, 1)', blur_tint_color: 'rgba(24, 36, 42, 0.97)',
    chat_tint_color: 'rgba(24, 36, 42, 0.95)', user_mes_blur_tint_color: 'rgba(35, 49, 57, 0.9)',
    bot_mes_blur_tint_color: 'rgba(28, 43, 47, 0.9)', shadow_color: 'rgba(0, 0, 0, 0.3)',
    // 宿主把 chat_width 拼为 vw（百分比），不是像素。
    border_color: 'rgba(166, 194, 183, 0.55)', blur_strength: 0, font_scale: 1, chat_width: 75,
    custom_css: `/* STCR T11 合成主题：供 T13 验证选择器克隆与 important。 */
#chat .mes_text { border-left: 3px solid #72b8a5 !important; padding-left: 14px; line-height: 1.8; }
#chat .mes_text q { color: #ffcd75 !important; background: rgba(255,205,117,.08); }
#chat .mes_text .stcr-fixture-scope { color: #8ed7c3 !important; border-bottom: 1px dotted currentColor; }
#chat .mes_text .stcr-fixture-html { padding: 8px; border: 1px dashed #72b8a5; }
`,
};

const baseTime = Date.parse('2026-09-28T08:00:00Z');
export const dateAt = index => new Date(baseTime + index * 60000).toISOString();
export function makeHeader(character, chat = character.chat) {
    return {
        user_name: USER_NAME, character_name: character.name, create_date: dateAt(0),
        chat_metadata: { integrity: `stcr-t11-${character.id}-${chat}`, stcr_fixture: FIXTURE_ID },
    };
}

export function makeMessage(name, text, index, { isUser = false, swipeCount = 0, swipeId = 0, extra = {} } = {}) {
    const message = { name, is_user: isUser, is_system: false, send_date: dateAt(index), mes: text, extra: { stcr_fixture: FIXTURE_ID, ...extra } };
    if (swipeCount) {
        const swipes = Array.from({ length: swipeCount }, (_, swipe) => `${text}\n\n候选 ${swipe + 1}/${swipeCount}：${['朝港口走去', '留在灯塔记下星图', '乘纸舟沿河而行', '为雾中的钟塔命名', '把故事写在蓝色信封上'][swipe]}。`);
        const infos = swipes.map((_, swipe) => ({
            send_date: dateAt(index + swipe / 10), gen_started: dateAt(index), gen_finished: dateAt(index + 0.05),
            extra: { reasoning: `【思考标记】第 ${index} 楼候选 ${swipe + 1} 的虚构测试说明：这只是思维链字段占位。`, reasoning_duration: swipe + 1, reasoning_type: 'manual' },
        }));
        return { ...message, mes: swipes[swipeId], swipes, swipe_id: swipeId, swipe_info: infos, extra: { ...message.extra, ...infos[swipeId].extra } };
    }
    return message;
}

export function makeCard(character) {
    return {
        spec: 'chara_card_v2', spec_version: '2.0', name: character.name, chat: character.chat, create_date: dateAt(0),
        data: {
            name: character.name, description: `${character.name}是雾岛观测站的虚构记录员。角色、故事与身份全部用于 ST Reader 测试。`,
            personality: '耐心、友善，喜欢记录虚构星图。', scenario: '完全虚构的雾岛观测站。',
            first_mes: '这是一份虚构样本，请打开已有的 STCR 测试聊天。', mes_example: '',
            creator_notes: '由 dev/fixtures/gen.mjs 从零生成，未复制真实聊天。', system_prompt: '', post_history_instructions: '',
            alternate_greetings: [], tags: ['STCR-T11', '虚构测试'], creator: 'ST Reader fixtures', character_version: '1.0',
            extensions: { stcr_fixture: FIXTURE_ID, talkativeness: 0.5, fav: false, world: '', regex_scripts: character.id === 'Aster' ? structuredClone(SCOPED_REGEX) : [] },
        },
    };
}

export function makeSmallChats() {
    const [aster, paper, mist] = CHARACTERS;
    const first = Array.from({ length: 12 }, (_, index) => makeMessage(
        index % 2 ? aster.name : USER_NAME,
        index % 2
            ? `第 ${index} 楼，星灯在虚构灯塔记录天气。“今晚的星图很清楚。”\n\n【一次】 【称呼】 【近景】 【星灯暗号】 【禁止命中】\n\nSTCR FONT PROBE: iii WWW 0123456789`
            : `第 ${index} 楼，测试旅人把一张虚构船票放在桌上。请继续这个完全虚构的故事。`,
        index, { isUser: index % 2 === 0, swipeCount: index === 5 ? 3 : index === 9 ? 4 : index === 11 ? 5 : 0, swipeId: index === 11 ? 2 : 0 },
    ));
    const longText = '这是一段完全虚构的海岛日记。纸舟在无名的河流上绕过彩色灯塔，故事没有真实人物或地址。'.repeat(600);
    const second = [
        makeMessage(USER_NAME, '请展示虚构代码、HTML、超长楼和没有思维链的候选。', 0, { isUser: true }),
        makeMessage(paper.name, '代码样本：\n\n```javascript\nconst island = "fiction";\nconsole.log(island);\n```\n\n```python\nisland = "fiction"\nprint(island)\n```\n\n```css\n.paper-boat { color: teal; }\n```', 1),
        makeMessage(paper.name, '<div class="stcr-fixture-html"><strong>原始 HTML 样本</strong><p><q>这段引号应为金色。</q></p></div>\n\n| 虚构地点 | 天气 |\n| --- | --- |\n| 雾岛 | 晴 |\n\n【星灯暗号】在纸舟的聊天里应保留原样。', 2),
        makeMessage(paper.name, `超长楼开始\n\n${longText}\n\n超长楼结束`, 3),
        makeMessage(paper.name, '这一楼刻意没有 swipes 与 reasoning 字段。', 4),
        makeMessage(paper.name, '这一楼提供思维链缺失的候选边界用例。', 5, { swipeCount: 3, swipeId: 1 }),
    ];
    delete second[5].swipe_info[0].extra.reasoning;
    // 当前候选允许使用楼层 extra 的思维链；其他候选缺失时不应串用。
    delete second[5].swipe_info[1].extra.reasoning;
    const third = [
        makeMessage(USER_NAME, '雾岚，请记下三行虚构观测日志。', 0, { isUser: true }),
        makeMessage(mist.name, '河面漂过蓝色纸船。\n\n【一次】 【称呼】 【近景】\n\n【星灯暗号】在这里也不应该命中。', 1),
        makeMessage(mist.name, '同一角色另有 STCR-90 大文件聊天，用于后续分页测试。', 2),
    ];
    return CHARACTERS.map((character, index) => ({ character, file: character.chat, messages: [first, second, third][index] }));
}

export function makeGroup() {
    return {
        id: GROUP_ID, name: 'STCR · 雾岛观测队（虚构）', members: CHARACTERS.map(character => character.avatar), avatar_url: '',
        allow_self_responses: false, activation_strategy: 0, generation_mode: 0, disabled_members: [], fav: false,
        chat_id: GROUP_CHAT, chats: [GROUP_CHAT], chat_metadata: { stcr_fixture: FIXTURE_ID, tainted: true, integrity: 'stcr-t11-group-integrity' },
        auto_mode_delay: 5, generation_mode_join_prefix: '', generation_mode_join_suffix: '',
    };
}

export function makeGroupMessages() {
    return [
        makeMessage(USER_NAME, '三位虚构记录员，请依次报告星图、纸船与雾色。', 0, { isUser: true }),
        ...CHARACTERS.map((character, index) => ({
            ...makeMessage(character.name, `${character.name}的虚构报告：“雾岛今天一切平静。”\n\n【一次】 【称呼】 【星灯暗号】`, index + 1, { swipeCount: 3, swipeId: index }),
            original_avatar: character.avatar,
        })),
    ];
}

export const BIG_COUNT = 1600;
export function* makeLargeMessages() {
    const phrase = '虚构档案中的雾岛没有真实地址，纸舟沿星河记录彩色灯塔，每一页都只是合成测试文本。';
    const body = phrase.repeat(Math.ceil(4600 / phrase.length)).slice(0, 4600);
    for (let index = 0; index < BIG_COUNT; index++) {
        yield makeMessage(CHARACTERS[2].name, `大文件第 ${index + 1}/${BIG_COUNT} 楼\n${body}\n【一次】`, index);
    }
}
