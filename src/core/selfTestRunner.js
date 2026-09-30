// ST Reader — AGPL-3.0

/** 开发自测串行执行：网址自动触发和控制台重跑不互相污染，失败不阻塞下一轮。 */
export function createSelfTestRunner(run) {
    let pending = Promise.resolve();
    return (options = {}) => {
        const requested = { ...options };
        const result = pending.then(() => run(requested));
        pending = result.catch(() => {});
        return result;
    };
}
