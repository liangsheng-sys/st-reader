// ST Reader — AGPL-3.0
import { installReadonlyGuard, isDevInstance, isReadonlyGuardInstalled } from './src/core/readonlyGuard.js';

// ST Reader 入口。遵循 D02；数据与格式化已交付，阅读器界面由 T21 接入。
// 在模块加载时立即启用保护，不等 APP_READY，避免留下初始化空窗。
if (isDevInstance(window.location)) {
    installReadonlyGuard(window);
    console.log('[st-reader] 开发实例只读保护已开启。');
    window.stcrSelfTest = async (options = {}) => {
        const runCore = options.core ?? (!options.fixtures && !options.performance);
        if (!isReadonlyGuardInstalled(window)) throw new Error('开发实例的 fetch 只读保护已失效。');
        const { testReadonlyGuard } = await import('./src/core/readonlyGuard.test.js');
        const results = await testReadonlyGuard();
        if (runCore) {
            const { testCoreLogic } = await import('./src/core/core.test.js');
            const { testCoreBrowser } = await import('./src/core/coreBrowser.test.js');
            results.push(...await testCoreLogic(), ...await testCoreBrowser());
        }
        if (options.persistence ?? runCore) {
            const { testPersistenceLogic } = await import('./src/core/persistence.test.js');
            const { testPersistenceBrowser } = await import('./src/core/persistenceBrowser.test.js');
            results.push(...await testPersistenceLogic(), ...await testPersistenceBrowser());
        }
        if (options.cardExport ?? runCore) {
            const { testCardExportLogic } = await import('./src/core/cardExport.test.js');
            const { testCardExportBrowser } = await import('./src/core/cardExportBrowser.test.js');
            results.push(...await testCardExportLogic(), ...await testCardExportBrowser());
        }
        if (options.fixtures) {
            const { testBrowserFixtures } = await import('./src/core/fixtureSelfTest.js');
            results.push(...await testBrowserFixtures(options));
        }
        if (options.performance) {
            const { testPerformanceBrowser } = await import('./src/core/performanceBrowser.test.js');
            results.push(...await testPerformanceBrowser());
        }
        console.table(results);
        console.log(`[st-reader] 全部通过（${results.length} 项）。${options.fixtures || runCore ? '检查仅调用同源只读 API。' : '未发送任何测试请求。'}`);
        return results;
    };
    window.stcrStorageProbe = async phase => {
        const { testStorageProbe } = await import('./src/core/persistenceBrowser.test.js');
        return testStorageProbe(phase);
    };
    window.stcrExportDemo = async () => {
        const { showCardExportDemo } = await import('./src/core/cardExportBrowser.test.js');
        return showCardExportDemo();
    };
}

export function stReaderActivate() {
    // activate 钩子：同步初始化。真正挂载放到 APP_READY。
}

const { eventSource, event_types } = SillyTavern.getContext();
eventSource.on(event_types.APP_READY, async () => {
    try {
        const { initFormatter } = await import('./src/core/formatter.js');
        await initFormatter();
    } catch (error) { console.error('[st-reader] 格式化模块初始化失败：', error); }
    try {
        const { startCssScope } = await import('./src/core/cssScope.js');
        const { store } = await import('./src/core/store.js');
        startCssScope(); await store.ready();
        console.log('[st-reader] T13 样式、存储与锚点模块已就绪。');
    } catch (error) { console.error('[st-reader] 样式与存储初始化失败：', error); }
    // 界面入口（T21）：魔杖菜单、顶栏按钮、/reader。格式化失败也挂入口，打开时会再试一次并提示。
    try {
        const { mountEntries } = await import('./src/ui/mount.js');
        mountEntries();
        console.log('[st-reader] 阅读器入口已挂载：魔杖菜单「阅读器」、顶栏书本按钮、/reader。');
    } catch (error) { console.error('[st-reader] 阅读器入口挂载失败：', error); }
    const probe = new URLSearchParams(window.location.search).get('stcrStorageProbe');
    if (isDevInstance(window.location) && probe) window.stcrStorageProbe(probe).catch(error => console.error('[st-reader] 刷新验证失败：', error));
    if (isDevInstance(window.location) && new URLSearchParams(window.location.search).get('stcrExportDemo') === '1') window.stcrExportDemo().catch(error => console.error('[st-reader] PNG 演示失败：', error));
    // 开发验收也可用网址参数触发；与控制台的一行命令运行同一套测试。
    if (isDevInstance(window.location) && new URLSearchParams(window.location.search).get('stcrSelfTest') === '1') {
        const params = new URLSearchParams(window.location.search);
        const options = { core: params.has('core') ? params.get('core') !== '0' : params.get('fixtures') !== '1', fixtures: params.get('fixtures') === '1', font: params.get('font') === '1', rendered: params.get('rendered') === '1' };
        if (params.has('persistence')) options.persistence = params.get('persistence') !== '0';
        if (params.has('cardExport')) options.cardExport = params.get('cardExport') !== '0';
        const run = () => window.stcrSelfTest(options).catch(error => console.error('[st-reader] 自测失败：', error));
        const waitAvatar = options.rendered ? 'STCR_T11_Aster.png' : params.get('coreWhenChat') === '1' ? 'STCR_T11_Mist.png' : null;
        if (waitAvatar) {
            // 完整验收需要可见消息；等人类打开指定样本，不替人类切换宿主聊天。
            const whenReady = () => {
                const context = SillyTavern.getContext();
                if (context.characters[context.characterId]?.avatar !== waitAvatar) return;
                eventSource.removeListener(event_types.CHAT_CHANGED, whenReady);
                run();
            };
            eventSource.on(event_types.CHAT_CHANGED, whenReady);
            whenReady();
            console.log(`[st-reader] 请打开${options.rendered ? '星灯' : '雾岚'}（虚构）的默认聊天开始验收。`);
        } else run();
    }
});
