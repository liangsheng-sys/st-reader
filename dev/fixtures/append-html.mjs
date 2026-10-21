// ST Reader — AGPL-3.0
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertDevPath, requireServerStopped, USER_ROOT, DEV_ROOT, writeDevFile } from './paths.mjs';
import { makeSmallChats, makeHeader, BEAUTY_REGEX, DISPLAY_REGEX } from './data.mjs';

// 只升级既有纸舟合成聊天与该条校验清单；不重建角色、设置或其他聊天。
try {
    await requireServerStopped();
    const chat = makeSmallChats()[1], relative = `chats/${path.parse(chat.character.avatar).name}/${chat.file}.jsonl`;
    const file = assertDevPath(path.join(USER_ROOT, relative)), manifestPath = assertDevPath(path.join(DEV_ROOT, 'fixtures/manifest.json'));
    const lines = [makeHeader(chat.character), ...chat.messages].map(row => `${JSON.stringify(row)}\n`);
    const known = [lines.slice(0, 7).join(''), lines.slice(0, 9).join(''), lines.slice(0, 11).join(''), lines.slice(0, 12).join(''), lines.slice(0, 13).join(''), lines.join('')];
    const next = known.at(-1), actual = fs.readFileSync(file, 'utf8');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')), record = manifest.files.find(item => item.path === relative);
    if (!record || !known.includes(actual)) throw new Error('纸舟样本不等于已知合成版本，停止追加，不覆盖现有改动');
    const hash = text => createHash('sha256').update(text).digest('hex');
    // 允许上次写完聊天、尚未更新清单时安全重跑；旧清单必须仍是已知版本。
    if (!known.map(hash).includes(record.sha256)) throw new Error('纸舟清单不是已知合成版本');
    if (actual !== next) writeDevFile(file, next);
    Object.assign(record, { bytes: Buffer.byteLength(next), sha256: hash(next) });
    writeDevFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    // T73 / T75：第 12–14 楼靠 BEAUTY_REGEX / DISPLAY_REGEX；只替换 stcr-t73- / stcr-t75- 命名空间的全局正则，其余设置原样保留。
    const settingsPath = assertDevPath(path.join(USER_ROOT, 'settings.json')), settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const ext = settings.extension_settings ??= {};
    const regex = [...(ext.regex ?? []).filter(script => !/^stcr-t7[35]-/.test(String(script.id))), ...BEAUTY_REGEX, ...DISPLAY_REGEX];
    if (JSON.stringify(regex) !== JSON.stringify(ext.regex)) { ext.regex = regex; writeDevFile(settingsPath, `${JSON.stringify(settings, null, 4)}\n`); }
    console.log('纸舟第 7–14 楼已就绪：手机、游戏、T51 散文混排、同楼两段 HTML、T72 社区卡结构、T73 正则美化信纸、T75 正则改写 HTML / 整页 / 动画状态条；其余样本与设置不变。');
} catch (error) { console.error(error.message); process.exitCode = 1; }
