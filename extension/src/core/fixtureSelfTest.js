// T11 开发样本验收。只读请求与只读 IndexedDB 事务，不依赖后续阅读器模块。
export async function testBrowserFixtures({ font = false, rendered = false } = {}) {
    const results = [];
    const context = SillyTavern.getContext();
    function assert(value, message) { if (!value) throw new Error(message); }
    async function test(name, run) { await run(); results.push({ name, passed: true }); }
    async function read(url, body) {
        const response = await fetch(url, { method: 'POST', headers: context.getRequestHeaders(), body: JSON.stringify(body) });
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        return response.json();
    }
    await test('宿主识别三个合成角色、全局正则及星灯允许名单', () => {
        for (const name of ['Aster', 'Paper', 'Mist']) assert(context.characters.some(character => character.avatar === `STCR_T11_${name}.png`), `缺少 ${name}`);
        const aster = context.characters.find(character => character.avatar === 'STCR_T11_Aster.png');
        assert(aster.data.extensions.regex_scripts.length === 1, '角色卡作用域正则未解析');
        assert(context.extensionSettings.character_allowed_regex.includes(aster.avatar), '角色允许名单缺失');
        assert(context.extensionSettings.regex.filter(script => script.id.startsWith('stcr-t11-')).length === 5, '全局脚本数量不符');
    });
    await test('单聊 API 返回 header 与 3、4、5 个独立候选及思维链', async () => {
        const rows = await read('/api/chats/get', { avatar_url: 'STCR_T11_Aster.png', file_name: 'STCR-01-正则与多候选' });
        assert(rows[0].chat_metadata?.stcr_fixture && rows.length === 13, '单聊 header 或楼层数不符');
        const candidates = rows.slice(1).filter(message => message.swipes);
        assert(candidates.map(message => message.swipes.length).join(',') === '3,4,5', '候选数不符');
        assert(candidates.every(message => message.swipe_info.every(info => info.extra.reasoning && info.extra.reasoning_duration)), '候选思维链缺失');
    });
    await test('单聊 API 保留三种代码、原始 HTML、两万字长楼', async () => {
        const rows = await read('/api/chats/get', { avatar_url: 'STCR_T11_Paper.png', file_name: 'STCR-02-代码与长文' });
        const text = rows.slice(1).map(message => message.mes).join('\n');
        assert(['javascript', 'python', 'css'].every(language => text.includes('```' + language)), '代码语言缺失');
        assert(text.includes('<q>') && rows[4].mes.length >= 20000, 'HTML 或长楼缺失');
    });
    await test('群聊 API 按 chat_id 读取四楼，第一楼即消息', async () => {
        const group = context.groups.find(item => item.id === 'stcr-t11-island');
        assert(group && group.members.length === 3 && group.id !== group.chat_id, '群聊定义不符');
        const rows = await read('/api/chats/group/get', { id: group.chat_id });
        assert(rows.length === 4 && rows[0].is_user && typeof rows[0].mes === 'string', '群聊误加 header');
        assert(rows.slice(1).every(message => group.members.includes(message.original_avatar)), '群成员不符');
    });
    await test('主题 custom_css 与 Ny 字体管理器已载入', () => {
        const css = document.getElementById('custom-style')?.textContent ?? '';
        assert(css.includes('#chat .mes_text q') && css.includes('!important'), '未应用测试主题');
        assert(document.getElementById('nytw_settings_root'), 'Ny 字体管理器未载入');
    });
    if (rendered) await test('星灯原生聊天：正则只跑一次、作用域与深度命中、主题边线', () => {
        assert(context.characters[context.characterId]?.avatar === 'STCR_T11_Aster.png', '请先打开星灯的默认聊天');
        const text = document.querySelector('#chat')?.textContent ?? '';
        assert(text.includes('【一次】✓') && !text.includes('【一次】✓✓'), '全局正则执行次数不符');
        assert(text.includes('星灯作用域命中') && text.includes('近景命中') && text.includes('【近景】'), '作用域或深度不符');
        const message = document.querySelector('#chat .mes_text');
        // 浏览器缩放会让计算后的像素值变化；颜色与实线同时校验。
        const style = message && getComputedStyle(message);
        assert(style && parseFloat(style.borderLeftWidth) > 0 && style.borderLeftStyle === 'solid' && style.borderLeftColor === 'rgb(114, 184, 165)', '主题边线未应用');
    });
    if (font) {
        const ny = context.extensionSettings['Ny-font-manager'];
        const entry = ny?.importedFonts?.find(item => item.kind === 'file' && item.family === 'JetBrainsMono');
        await test('Ny 本地字体已存入 IndexedDB，字节完整', async () => {
            assert(entry, '请在 Ny 字体管理器中导入 JetBrainsMono.ttf');
            // 先查数据库是否存在；避免 open 在未安装时意外创建空数据库。
            assert((await indexedDB.databases()).some(database => database.name === 'nytw-fonts'), '字体数据库不存在');
            const blob = await new Promise((resolve, reject) => {
                const request = indexedDB.open('nytw-fonts');
                request.onerror = () => reject(request.error);
                request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('字体数据库版本不符')); };
                request.onsuccess = () => {
                    const db = request.result;
                    const transaction = db.transaction('fonts', 'readonly');
                    const get = transaction.objectStore('fonts').get(entry.id);
                    get.onsuccess = () => resolve(get.result?.blob);
                    get.onerror = () => reject(get.error);
                    transaction.oncomplete = transaction.onabort = () => db.close();
                };
            });
            assert(blob instanceof Blob && blob.size === 187208, '字体 Blob 大小不符');
            const gitBlob = await new Blob([`blob ${blob.size}\0`, blob]).arrayBuffer();
            const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', gitBlob))].map(byte => byte.toString(16).padStart(2, '0')).join('');
            assert(hash === 'aa310be8b717fe3774f9444dd89d5f4101cc6d10', '字体内容校验失败');
        });
        await test('Ny FontFace 已加载且正文使用本地字体', async () => {
            await document.fonts.ready;
            assert(ny.bodyFont === 'JetBrainsMono', '请将 JetBrainsMono 设为正文字体');
            assert([...document.fonts].some(face => face.family.replaceAll('"', '') === 'JetBrainsMono' && face.status === 'loaded'), 'FontFace 未加载');
            const message = document.querySelector('#chat .mes_text');
            assert(message && getComputedStyle(message).fontFamily.includes('JetBrainsMono'), '聊天正文未应用本地字体');
        });
    }
    return results;
}
