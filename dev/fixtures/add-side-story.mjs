// ST Reader — AGPL-3.0
// 已有 8100 样本库：只添加新聊天，不重建角色或设置；与 gen.mjs 使用同一数据源。
// 用排他创建防止覆写有人改过的样本。已存在时必须逐字节相同。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { makeSideChat, makeHeader } from './data.mjs';
import { assertDevPath, USER_ROOT, DEV_ROOT, writeDevFile } from './paths.mjs';

const { character, file, messages } = makeSideChat();
const relative = 'chats/' + path.parse(character.avatar).name + '/' + file + '.jsonl';
const content = Buffer.from([makeHeader(character), ...messages].map(row => JSON.stringify(row) + '\n').join(''));
const target = assertDevPath(path.join(USER_ROOT, relative));
const manifestFile = assertDevPath(path.join(DEV_ROOT, 'fixtures/manifest.json'));
const manifest = JSON.parse(fs.readFileSync(manifestFile));
const entry = { path: relative, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') };
const old = manifest.files.find(r => r.path === relative);
if (old && (old.bytes !== entry.bytes || old.sha256 !== entry.sha256)) throw Error('原清单不是已知合成样本');
try { fs.writeFileSync(target, content, { flag:'wx' }); }
catch (e) { if (e.code !== 'EEXIST' || !content.equals(fs.readFileSync(target))) throw e; }
if (!old) { manifest.files.push(entry); writeDevFile(manifestFile, JSON.stringify(manifest,null,2) + '\n'); }
console.log('番外样本已就绪：', relative);
