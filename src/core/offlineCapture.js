// ST Reader — AGPL-3.0
/** T14 与 HTML 导出共用的截图资源闸门；没有任何 fetch 回退。 */
export function offlineCaptureGuard() {
    let attempted = false;
    return {
        fetchFn: async () => { attempted = true; throw new Error('导出禁止请求外部资源'); },
        onCreateForeignObjectSvg: () => { if (attempted) throw new Error('卡片存在无法离线读取的资源'); },
    };
}
