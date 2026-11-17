// ST Reader — AGPL-3.0
import assert from 'node:assert/strict';
import { makeSideChat } from './data.mjs';
import { toMessageModel } from '../../src/core/messageModel.js';
import { classifySideStory, normalizeSideStoryRules } from '../../src/core/sideStory.js';

export async function testSideStory() {
    const models = makeSideChat().messages.map(toMessageModel);
    const handle = { total: models.length, getMessage: i => models[i] };
    const tag = { on:true }, keyword = { on:true }, hidden = { on:true };
    const scan = rules => classifySideStory(handle, rules);
    const floors = r => [...r.floors].sort((a,b) => a-b);
    assert.deepEqual(floors(scan({ tag })), [7]);
    assert.deepEqual([...scan({ tag }).segments.keys()], [3,5]);
    assert.deepEqual(floors(scan({ keyword })), [12,13,14,22,23]);
    assert.deepEqual(floors(scan({ hidden })), [30,31,32,33,34]);
    assert.deepEqual(floors(scan({ tag,keyword,hidden })), [7,12,13,14,22,23,30,31,32,33,34]);
    for (const [pattern,flags] of [['.', 's'], ['[', 'g']]) {
        const r = normalizeSideStoryRules({tag:{on:true, mode:'regex', pattern, flags}});
        assert.ok(!r.tag.on && r.errors.length);
    }
    assert.deepEqual(normalizeSideStoryRules({ keyword:{ words:[' IF线 ','if线','','a'.repeat(31)] } }).keyword.words,['IF线']);
    const flags = { tag:{ on:true, start:'[X]', end:'[E]', scanRendered:true } };
    let progress = 0;
    const result = await classifySideStory(handle, flags, { swipeOf:i => i === 13 ? 1 : 0,
        texts:(i,s) => i === 13 && s === 1 ? '𠮷[x]一[e] [X]尾' : '', onProgress:n => { progress = n; } });
    assert.deepEqual(result.segments.get(13).map(r => [r.start,r.end,r.swipe,r.source]), [[2,9,1,'rendered'],[10,14,1,'rendered']]);
    assert.equal(progress,48);
    return [{ name:'T103 fixture：三法独立与并集、校验、UTF-16 多段未闭合与候选', passed:true }];
}
