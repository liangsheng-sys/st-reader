let runtimePromise;
/** 只在浏览器请求时读取宿主公开模块；Node 纯逻辑测试不载入 ST。 */
export function loadHostRuntime() {
    runtimePromise ??= Promise.all([
        import('/scripts/extensions/regex/engine.js'), import('/script.js'), import('/scripts/chats.js'),
        import('/scripts/showdown-underscore.js'), import('/scripts/power-user.js'),
    ]).then(([regex, script, chats, underscore, power]) => ({ regex, script, chats, underscore, power,
        libs: globalThis.SillyTavern.libs, getContext: () => globalThis.SillyTavern.getContext() }))
        .catch(error => { runtimePromise = undefined; throw error; });
    return runtimePromise;
}
