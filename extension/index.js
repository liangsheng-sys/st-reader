import { installReadonlyGuard, isDevInstance, isReadonlyGuardInstalled } from './src/core/readonlyGuard.js';

// ST Reader 入口。遵循 D02；阅读器主体由 T12（core）与 T21（ui）接入。
// 在模块加载时立即启用保护，不等 APP_READY，避免留下初始化空窗。
if (isDevInstance(window.location)) {
    installReadonlyGuard(window);
    console.log('[st-reader] 开发实例只读保护已开启。');
    window.stcrSelfTest = async () => {
        if (!isReadonlyGuardInstalled(window)) throw new Error('开发实例的 fetch 只读保护已失效。');
        const { testReadonlyGuard } = await import('./src/core/readonlyGuard.test.js');
        const results = await testReadonlyGuard();
        console.table(results);
        console.log(`[st-reader] 全部通过（${results.length} 项），未发送任何测试请求。`);
        return results;
    };
}

export function stReaderActivate() {
    // activate 钩子：同步初始化。真正挂载放到 APP_READY。
}

const { eventSource, event_types } = SillyTavern.getContext();
eventSource.on(event_types.APP_READY, () => {
    console.log('[st-reader] 占位入口已加载，等待 T12/T21 实现。');
    // 开发验收也可用网址参数触发；与控制台的一行命令运行同一套测试。
    if (isDevInstance(window.location) && new URLSearchParams(window.location.search).get('stcrSelfTest') === '1') {
        window.stcrSelfTest().catch(error => console.error('[st-reader] 自测失败：', error));
    }
});
