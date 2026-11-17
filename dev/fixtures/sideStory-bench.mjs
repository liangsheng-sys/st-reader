// ST Reader — AGPL-3.0
// 独立测量分类本身；不把文件 I/O、JSON 解析或建模时间混进结果。
import fs from 'node:fs';
import { assertDevPath, DEV_ROOT, USER_ROOT } from './paths.mjs';
import { classifySideStory } from '../../src/core/sideStory.js';
import { toMessageModel } from '../../src/core/messageModel.js';
const { path, count } = JSON.parse(fs.readFileSync(assertDevPath(DEV_ROOT + '/fixtures/performance.json')));
const rows = fs.readFileSync(assertDevPath(USER_ROOT + '/' + path), 'utf8').trimEnd().split('\n').slice(1);
if (count !== 4000 || rows.length !== count) throw Error('需要 T30 的 4000 楼合成样本');
const models = rows.map((row, i) => toMessageModel(JSON.parse(row), i));
const handle = { total: count, getMessage: i => models[i] };
for (const method of ['keyword','hidden','tag']) {
    const times = [];
    for (let i = 0; i < 7; i++) {
        const start = performance.now(); classifySideStory(handle, { [method]: { on: true } });
        times.push(performance.now() - start);
    }
    console.log(method, times.sort((a,b) => a-b)[3].toFixed(2), 'ms');
}
