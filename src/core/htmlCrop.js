// ST Reader — AGPL-3.0
// 预览框与截图共用 CSS 文档坐标；这些纯函数不访问 DOM 或宿主状态。
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function captureScale(scale = 2) {
    if (!Number.isInteger(scale) || scale < 1 || scale > 3) throw new RangeError('PNG 清晰度须为 1、2 或 3 倍');
    return scale;
}

export function captureGeometry(width, height, scale = 2, crop) {
    captureScale(scale);
    if (width * scale > 32768 || height * scale > 32768 || width * height * scale * scale > 32_000_000) {
        throw new RangeError('高清整图超过 3200 万像素或单边 32768 像素，请降低倍数或减少内容');
    }
    const rect = crop ?? { x: 0, y: 0, w: width, h: height };
    if (!['x', 'y', 'w', 'h'].every(key => Number.isInteger(rect[key])) || rect.x < 0 || rect.y < 0 || rect.w < 1 || rect.h < 1
        || rect.x + rect.w > width || rect.y + rect.h > height) throw new RangeError('裁剪框须为静态文档范围内的整数像素矩形');
    return { rect: { ...rect }, pixels: { x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale } };
}

export function previewPoint(clientX, clientY, bounds, width, height) {
    return { x: clamp(Math.round((clientX - bounds.left) * width / bounds.width), 0, width),
        y: clamp(Math.round((clientY - bounds.top) * height / bounds.height), 0, height) };
}

export function dragCrop(mode, initial, start, point, width, height) {
    const dx = point.x - start.x, dy = point.y - start.y;
    if (mode === 'move') return { ...initial, x: clamp(initial.x + dx, 0, width - initial.w), y: clamp(initial.y + dy, 0, height - initial.h) };
    const anchor = mode === 'draw' ? start : { x: mode.includes('w') ? initial.x + initial.w : initial.x,
        y: mode.includes('n') ? initial.y + initial.h : initial.y };
    // 边角移动保持对角点；越过对角点时允许反向框选。
    const edge = mode === 'draw' ? point : { x: (mode.includes('w') ? initial.x : initial.x + initial.w) + dx,
        y: (mode.includes('n') ? initial.y : initial.y + initial.h) + dy };
    const x1 = clamp(anchor.x, 0, width), y1 = clamp(anchor.y, 0, height), x2 = clamp(edge.x, 0, width), y2 = clamp(edge.y, 0, height);
    const x = Math.min(x1, x2, width - 1), y = Math.min(y1, y2, height - 1);
    return { x, y, w: Math.max(1, Math.max(x1, x2) - x), h: Math.max(1, Math.max(y1, y2) - y) };
}
