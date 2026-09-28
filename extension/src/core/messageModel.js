/** 冻结 API 的独立 JSON 快照；不对 getContext() 的对象调用。 */
export function freezeJson(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value)) freezeJson(child);
    }
    return value;
}

/** 将宿主 ISO、毫秒时间戳及旧版 @hh 格式转成 ISO；无时区的旧日期按宿主本地时区。 */
export function normalizeDate(value) {
    if (value === null || value === undefined || value === '') return null;
    const legacy = typeof value === 'string' && value.match(/^(\d{4})-(\d{1,2})-(\d{1,2}) @(\d{1,2})h (\d{1,2})m (\d{1,2})s(?: (\d{1,3})ms)?$/);
    let date;
    if (legacy) {
        const [, year, month, day, hour, minute, second, milli = '0'] = legacy;
        date = new Date(+year, +month - 1, +day, +hour, +minute, +second, +milli);
        if (date.getFullYear() !== +year || date.getMonth() !== +month - 1 || date.getDate() !== +day || +hour > 23 || +minute > 59 || +second > 59) return null;
    } else if (typeof value === 'number' || /^\d+$/.test(value)) date = new Date(Number(value));
    else date = new Date(String(value).replace(/(\d)(am|pm)\b/i, '$1 $2'));
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** @param {object} raw 原始楼层（只读） @param {number} index 原始零基楼层号 @returns {object} 冻结的楼层视图模型 */
export function toMessageModel(raw, index) {
    if (!raw || typeof raw.mes !== 'string') throw new TypeError(`第 ${index} 楼不是有效消息`);
    const alternatives = Array.isArray(raw.swipes) && raw.swipes.length ? raw.swipes : [raw.mes];
    const swipeId = Number.isInteger(raw.swipe_id) && raw.swipe_id >= 0 && raw.swipe_id < alternatives.length ? raw.swipe_id : 0;
    const swipes = alternatives.map((text, i) => {
        const info = raw.swipe_info?.[i];
        const current = i === swipeId;
        const reasoning = info?.extra?.reasoning ?? (current ? raw.extra?.reasoning : undefined);
        const duration = info?.extra?.reasoning_duration ?? (current ? raw.extra?.reasoning_duration : undefined);
        return Object.freeze({
            index: i, text: current ? raw.mes : String(text ?? ''),
            reasoning: typeof reasoning === 'string' ? reasoning : '',
            reasoningDuration: typeof duration === 'number' && Number.isFinite(duration) && duration >= 0 ? duration : null,
            sendDate: normalizeDate(info?.send_date ?? raw.send_date),
        });
    });
    return Object.freeze({ index, name: String(raw.name ?? ''), isUser: !!raw.is_user, isSystem: !!raw.is_system,
        isNarrator: raw.extra?.type === 'narrator', date: normalizeDate(raw.send_date),
        originalAvatar: typeof raw.original_avatar === 'string' ? raw.original_avatar : null,
        swipeId, swipes: Object.freeze(swipes) });
}

/** 深度只计算非 system 消息；system 楼返回 -1。不构造全文视图模型。 */
export function calculateDepths(messages) {
    const depths = new Int32Array(messages.length);
    let depth = 0;
    for (let i = messages.length - 1; i >= 0; i--) depths[i] = messages[i].is_system ? -1 : depth++;
    return depths;
}

/** 单聊拆 header；群聊保留第一楼。缺失单聊 header 时仍保留所有消息。 */
export function parseChatRows(rows, { isGroup = false, userName = '', characterName = '', metadata = {} } = {}) {
    if (!Array.isArray(rows)) throw new TypeError('聊天 API 未返回数组');
    const hasHeader = !isGroup && rows[0] && typeof rows[0].mes !== 'string' && ('user_name' in rows[0] || 'chat_metadata' in rows[0]);
    const header = hasHeader ? rows[0] : {};
    const messages = hasHeader ? rows.slice(1) : rows;
    if (messages.some(row => !row || typeof row.mes !== 'string')) throw new TypeError('聊天含无效消息；拒绝静默跳过并改变楼层编号');
    return { header: Object.freeze({ userName: String(header.user_name ?? userName), characterName: String(header.character_name ?? characterName),
        createDate: normalizeDate(header.create_date), metadata: freezeJson(structuredClone(header.chat_metadata ?? metadata)) }), messages };
}
