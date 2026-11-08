// ST Reader — AGPL-3.0
// T92 / D44：ST 顶栏的阅读器书本图标可以关。开关存 ST 设置 extension_settings['st-reader'].topbarIcon（换浏览器也记得），
// 缺省视为开。Aa → ⋯ → 显示、ST "扩展"面板里的阅读器小块各一个开关，经这里互相同步；mount.js 订阅它挂 / 摘图标。
// 关掉后魔杖菜单「阅读器」与 /reader 照常可用。

import { hostSettings } from '../core/hostSettings.js';

const listeners = new Set();

/** 现在是否显示顶栏图标。读不到 ST 设置时按默认（显示）。 */
export function topbarIconOn() {
    try { return hostSettings.read().topbarIcon !== false; } catch { return true; }
}

/** 改开关：写 ST 设置（ST 自己去抖保存），再通知各处。返回是否写进了 ST 设置（写不进也照样在本页生效）。 */
export function setTopbarIcon(on) {
    const value = Boolean(on);
    let saved = false;
    try { saved = hostSettings.patch({ topbarIcon: value }); } catch (error) { console.warn('[st-reader] 顶栏图标开关没存上：', error); }
    for (const listener of [...listeners]) { try { listener(value); } catch (error) { console.warn('[st-reader] 顶栏图标开关回调出错：', error); } }
    return saved;
}

/** 订阅开关变化：listener(on)。返回取消订阅函数。 */
export function onTopbarIconChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
