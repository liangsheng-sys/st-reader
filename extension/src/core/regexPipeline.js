export const PLACEMENT = Object.freeze({ USER: 1, AI: 2, NARRATOR: 3, REASONING: 6 });

/** 仅展开目标聊天的两个名字宏，不调用可能写入宿主变量的宏解释器。 */
export function substituteNames(text, { userName = '', characterName = '' } = {}, transform = value => value) {
    return String(text ?? '').replace(/{{\s*(user|char)\s*}}/gi, (_, name) => transform(name.toLowerCase() === 'user' ? userName : characterName));
}
export const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replaceAll('\n', '\\n').replaceAll('\r', '\\r').replaceAll('\t', '\\t');

/** 安全后备执行器：复用 JS 正则能力，只解释捕获组，不执行宿主宏命令。 */
export function runLiteralRegex(script, text) {
    let expression;
    try {
        const delimiter = script.findRegex.lastIndexOf('/');
        expression = script.findRegex.startsWith('/') && delimiter > 0
            ? new RegExp(script.findRegex.slice(1, delimiter), script.findRegex.slice(delimiter + 1))
            : new RegExp(script.findRegex);
    } catch { return text; }
    return text.replace(expression, (...args) => {
        const named = typeof args.at(-1) === 'object' ? args.at(-1) : null;
        const captureCount = args.length - (named ? 3 : 2);
        return script.replaceString.replace(/\$(\d+)|\$<([^>]+)>/g, (_, index, name) => {
            let captured = name ? named?.[name] : Number(index) < captureCount ? args[Number(index)] : '';
            captured = String(captured ?? '');
            for (const trim of script.trimStrings ?? []) if (trim) captured = captured.replaceAll(trim, '');
            return captured;
        });
    });
}

/** GLOBAL → PRESET → SCOPED；选目标角色而不是宿主当前角色，允许名单不可绕过。 */
export function collectScripts(settings, character, presetScripts = []) {
    if (settings.disabledExtensions?.includes('regex')) return [];
    const scoped = settings.character_allowed_regex?.includes(character?.avatar) ? character?.data?.extensions?.regex_scripts : [];
    return [settings.regex, presetScripts, scoped].flatMap(list => Array.isArray(list) ? list : []);
}

/** F6：markdownOnly 或两项都未勾选；promptOnly 单独勾选的脚本不执行。 */
export function isDisplayScript(script, placement, depth) {
    if (!script || script.disabled || typeof script.findRegex !== 'string' || !script.findRegex || !(script.markdownOnly || !script.promptOnly)
        || !Array.isArray(script.placement) || !script.placement.includes(placement)) return false;
    if (Number.isFinite(depth)) {
        if (script.minDepth !== null && script.minDepth !== undefined && Number(script.minDepth) >= -1 && depth < Number(script.minDepth)) return false;
        if (script.maxDepth !== null && script.maxDepth !== undefined && Number(script.maxDepth) >= 0 && depth > Number(script.maxDepth)) return false;
    }
    return true;
}

/**
 * 每条显示脚本只执行一次；输入和脚本都不修改。执行器注入宿主 runRegexScript。
 * @param {string} text 原文
 * @param {{scripts:object[],placement:number,depth:number,userName:string,characterName:string}} options
 * @param {(script:object,text:string,options:object)=>string} runScript 同步执行器
 * @returns {string} 正则完成的文本（尚未 markdown）
 */
export function runDisplayRegex(text, options, runScript) {
    let value = substituteNames(text, options);
    const seen = new Set();
    for (const original of options.scripts) {
        if (!isDisplayScript(original, options.placement, options.depth)) continue;
        const identity = original.id || original;
        if (seen.has(identity)) continue;
        seen.add(identity);
        const script = structuredClone(original);
        const mode = Number(script.substituteRegex);
        if (mode === 1 || mode === 2) script.findRegex = substituteNames(script.findRegex, options, mode === 2 ? escapeRegex : value => value);
        script.substituteRegex = 0;
        script.replaceString = substituteNames(script.replaceString, options).replace(/{{match}}/gi, '$0');
        script.trimStrings = (Array.isArray(script.trimStrings) ? script.trimStrings : []).map(text => substituteNames(text, options));

        // 宿主还会解释替换结果、trimStrings 中的宏，捕获组也可能拼出宏。
        // 任何潜在左花括号都改走无宏执行器，不能靠事后恢复宿主状态保证只读。
        const macroRisk = [value, script.replaceString, ...script.trimStrings].some(text => text.includes('{'));
        value = macroRisk ? runLiteralRegex(script, value) : runScript(script, value, { characterOverride: options.characterName });
    }
    return value;
}
