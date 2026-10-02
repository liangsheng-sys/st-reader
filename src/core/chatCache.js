// ST Reader — AGPL-3.0
// 仅内存；估算 UTF-16 字符串、对象与引用开销，不序列化正文，不访问浏览器存储。
export function estimateJsonBytes(value) {
    const pending = [value], seen = new Set(); let bytes = 0;
    while (pending.length) {
        const item = pending.pop();
        if (typeof item === 'string') bytes += 16 + item.length * 2;
        else if (item && typeof item === 'object') {
            if (seen.has(item)) continue;
            seen.add(item); bytes += 64;
            for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
                // 默认读取器返回 JSON。测试替身的 getter 不属于 JSON，不能为了计量提前求值。
                bytes += 16 + key.length * 2;
                if ('value' in descriptor) pending.push(descriptor.value);
            }
        } else bytes += 8;
    }
    return bytes;
}

export function createMemoryChatCache({ maxEntries = 3, maxBytes = 150_000_000 } = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('聊天缓存容量必须为正整数');
    const entries = new Map(); let bytes = 0, evictions = 0;
    function remove(key, evicted = false) {
        const entry = entries.get(key); if (!entry) return;
        entries.delete(key); bytes -= entry.bytes;
        entry.models.clear(); entry.pages.clear();
        if (evicted) evictions++;
    }
    function trim() {
        while (entries.size > maxEntries || bytes > maxBytes) remove(entries.keys().next().value, true);
    }
    return {
        peek: key => entries.get(key),
        has: entry => entries.get(entry.key) === entry,
        touch(entry) { if (entries.get(entry.key) === entry) { entries.delete(entry.key); entries.set(entry.key, entry); } },
        put(entry) {
            remove(entry.key);
            if (entry.bytes > maxBytes) return false;
            entries.set(entry.key, entry); bytes += entry.bytes; trim(); return true;
        },
        grow(entry, extra) { if (entries.get(entry.key) === entry) { entry.bytes += extra; bytes += extra; trim(); } },
        remove,
        clear() { for (const key of entries.keys()) remove(key); },
        info: () => Object.freeze({ entries: entries.size, bytes, maxEntries, maxBytes, evictions, keys: Object.freeze([...entries.keys()]) }),
    };
}
