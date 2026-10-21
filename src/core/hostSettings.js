// ST Reader — AGPL-3.0
// D33：轻量项（备份指针、已读版本、更新提醒开关）放在 ST 自己的 extension_settings['st-reader']，
// 由 ST 的 saveSettingsDebounced 写进当前用户的 settings.json（ST 自带轮替备份、换浏览器也在）。
// 只读写本扩展自己的这一格；不碰 chat / chatMetadata，也不调任何聊天保存方法（D02）。

const KEY = 'st-reader';
const FIELDS = new Set(['rev', 'mirrorId', 'mirroredAt', 'bytes', 'lastDaily', 'dailies', 'lastSeenVersion', 'updateNotice']);

function context(getContext) {
    try { return getContext?.() ?? null; } catch { return null; }
}

/** 工厂仅用于测试注入；正式代码用下方单例。 */
export function createHostSettings({ getContext = () => globalThis.SillyTavern?.getContext?.() } = {}) {
    function bag(create) {
        const settings = context(getContext)?.extensionSettings;
        if (!settings || typeof settings !== 'object') return null;
        if (create && (!settings[KEY] || typeof settings[KEY] !== 'object' || Array.isArray(settings[KEY]))) settings[KEY] = {};
        return settings[KEY] ?? null;
    }
    return {
        /** ST 的 extension_settings 与 saveSettingsDebounced 都在时才算可用。 */
        available() {
            const ctx = context(getContext);
            return !!ctx?.extensionSettings && typeof ctx.saveSettingsDebounced === 'function';
        },
        /** 冻结副本；没有时为空对象。 */
        read() {
            const value = bag(false);
            return Object.freeze(value ? structuredClone(value) : {});
        },
        /** 只接受已登记的字段，值须为 JSON；写完交给 ST 去抖保存。返回是否写成。 */
        patch(patch) {
            const ctx = context(getContext), target = bag(true);
            if (!target || typeof ctx?.saveSettingsDebounced !== 'function') return false;
            for (const [key, value] of Object.entries(patch)) {
                if (!FIELDS.has(key)) throw new TypeError(`extension_settings 不接受字段 ${key}`);
                if (value === undefined) delete target[key]; else target[key] = structuredClone(value);
            }
            ctx.saveSettingsDebounced();
            return true;
        },
    };
}

export const hostSettings = createHostSettings();

/**
 * 给 updateService 用的 get/set：先读 ST 设置，没有再读旧版存在 IndexedDB 的值（0.2.x 升级上来的人）；
 * 写入时两边都写，ST 设置不可用也不丢。
 */
export function hostBackedSettings(storeSettings, host = hostSettings) {
    return {
        async get(key, fallback = null) {
            const value = host.read()[key];
            if (value !== undefined && value !== null) return structuredClone(value);
            const legacy = await storeSettings.get(key, null);
            if (legacy === null) return structuredClone(fallback);
            // 旧版只存在浏览器里：补写一份到 ST 设置，之后清浏览器数据也记得
            try { host.patch({ [key]: legacy }); } catch { /* 不认识的字段就只读不补 */ }
            return legacy;
        },
        async set(key, value) {
            host.patch({ [key]: value });
            return storeSettings.set(key, value);
        },
    };
}

/** 测试用"宿主不变"快照：去掉阅读器自己那一格（D33 允许写），其他扩展的设置必须一字不变。 */
export function foreignExtensionSettings(settings) {
    if (!settings || typeof settings !== 'object') return settings;
    const { [KEY]: _own, ...rest } = settings;
    return rest;
}
