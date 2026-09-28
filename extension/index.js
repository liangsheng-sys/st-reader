// ST Reader 入口。占位：由 T12（core）与 T21（ui）填充。
// 只读铁律：本扩展任何代码不得调用 /api/chats/save|rename|delete|import、saveChat、deleteMessage，
// 不得修改 getContext().chat / chatMetadata。见 docs/05_DECISIONS.md D02。

export function stReaderActivate() {
    // activate 钩子：同步初始化。真正挂载放到 APP_READY。
}

const { eventSource, event_types } = SillyTavern.getContext();
eventSource.on(event_types.APP_READY, () => {
    console.log('[st-reader] 占位入口已加载，等待 T12/T21 实现。');
});
