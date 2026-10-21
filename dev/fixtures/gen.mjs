// ST Reader — AGPL-3.0
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertDevPath, ensureDevDirectory, writeDevFile, requireServerStopped, DEV_ROOT, USER_ROOT, PROJECT_ROOT } from './paths.mjs';
import { makeCharacterPng } from './png.mjs';
import {
    FIXTURE_ID, CHARACTERS, GLOBAL_REGEX, BEAUTY_REGEX, THEME, THEME_NAME, GROUP_ID, GROUP_CHAT, BIG_CHAT,
    makeCard, makeHeader, makeSmallChats, makeGroup, makeGroupMessages, makeLargeMessages,
} from './data.mjs';

/** 在固定开发实例中生成本任务命名空间的数据；不下载、不调用任何 ST 写接口。 */
export async function generateFixtures() {
    await requireServerStopped();
    const settingsPath = assertDevPath(path.join(USER_ROOT, 'settings.json'));
    if (!fs.existsSync(settingsPath)) throw new Error('请先双击 dev/start-dev-st.cmd 完成初始化，再停止开发实例。');
    const files = [];

    function record(relative, rowsOrBuffer) {
        const target = assertDevPath(path.join(USER_ROOT, relative));
        ensureDevDirectory(path.dirname(target));
        const hash = createHash('sha256');
        let bytes = 0;
        const fd = fs.openSync(target, 'w');
        try {
            const pieces = Buffer.isBuffer(rowsOrBuffer) ? [rowsOrBuffer] : rowsOrBuffer;
            for (const piece of pieces) {
                const buffer = Buffer.isBuffer(piece) ? piece : Buffer.from(`${JSON.stringify(piece)}\n`);
                fs.writeFileSync(fd, buffer);
                hash.update(buffer); bytes += buffer.length;
            }
        } finally { fs.closeSync(fd); }
        files.push({ path: relative.replaceAll('\\', '/'), bytes, sha256: hash.digest('hex') });
    }

    for (const character of CHARACTERS) record(`characters/${character.avatar}`, makeCharacterPng(makeCard(character), character.color));
    for (const chat of makeSmallChats()) {
        record(`chats/${path.parse(chat.character.avatar).name}/${chat.file}.jsonl`, [makeHeader(chat.character), ...chat.messages]);
    }
    record(`groups/${GROUP_ID}.json`, [makeGroup()]);
    // 宿主群聊 API 不剥离 header；元信息存 groups/<id>.json，文件必须直接从消息开始。
    record(`group chats/${GROUP_CHAT}.jsonl`, makeGroupMessages());
    record(`themes/${THEME_NAME.replaceAll(' · ', '-')}.json`, [THEME]);
    const largeRelative = `chats/${path.parse(CHARACTERS[2].avatar).name}/${BIG_CHAT}.jsonl`;
    record(largeRelative, (function* () { yield makeHeader(CHARACTERS[2], BIG_CHAT); yield* makeLargeMessages(); })());
    const large = files.at(-1);
    if (large.bytes < 20 * 1024 * 1024) throw new Error('大文件不足 20 MiB。');

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    settings.extension_settings ??= {};
    const ext = settings.extension_settings;
    ext.regex = [...(ext.regex ?? []).filter(script => !/^stcr-t(11|73)-/.test(String(script.id))), ...GLOBAL_REGEX, ...BEAUTY_REGEX];
    ext.character_allowed_regex = [...new Set([...(ext.character_allowed_regex ?? []), CHARACTERS[0].avatar])];
    ext.disabledExtensions = (ext.disabledExtensions ?? []).filter(name => !['regex', 'third-party/st-reader', 'third-party/Ny-font-manager'].includes(name));
    // 禁止自动加入远程字体预设；本任务只导入开发目录中的小型 OFL 字体。
    ext['Ny-font-manager'] ??= { presetsVersion: 3, importedFonts: [], chatFontImportEnabled: false };
    settings.power_user ??= {};
    const { name: themeName, ...themeSettings } = THEME;
    Object.assign(settings.power_user, themeSettings, { theme: themeName });
    writeDevFile(settingsPath, `${JSON.stringify(settings, null, 4)}\n`);

    const manifest = { fixtureId: FIXTURE_ID, synthetic: true, generatedAt: '2026-09-28', characters: CHARACTERS, groupId: GROUP_ID, groupChat: GROUP_CHAT, bigChat: BIG_CHAT, files };
    writeDevFile(path.join(DEV_ROOT, 'fixtures', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`[st-reader] 已生成 ${CHARACTERS.length} 位虚构角色、1 个群聊、4 份单聊、主题及正则。`);
    console.log(`[st-reader] 大文件：${(large.bytes / 1024 / 1024).toFixed(2)} MiB，位置 ${path.join(USER_ROOT, largeRelative)}`);
    console.log('[st-reader] 仅替换 STCR_T11 / STCR T11 命名空间的测试样本；其他开发文件保留。');
    return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        if (process.argv.length > 2 || path.resolve(fileURLToPath(new URL('../..', import.meta.url))) !== PROJECT_ROOT) {
            throw new Error('生成器必须位于 E:\\st-reader\\dev\\fixtures，不接受替代数据目录或其他参数。');
        }
        await generateFixtures();
    } catch (error) {
        console.error(`[st-reader] 生成失败：${error.message}`);
        process.exitCode = 1;
    }
}
