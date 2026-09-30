// ST Reader — AGPL-3.0
import { previewPoint, dragCrop } from './htmlCrop.js';

/** 开发演示的自由裁剪预览。只接收已经脱敏的图片，不访问交互沙箱 DOM。 */
export function createCropPreview(image, width, height, onChange) {
    const surface = document.createElement('div'); surface.dataset.stcrCropSurface = '1';
    surface.style.cssText = `position:relative;width:${width}px;max-width:100%;overflow:hidden;touch-action:none;user-select:none;line-height:0;cursor:crosshair;`;
    image.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;'; image.draggable = false;
    const box = document.createElement('div'); box.dataset.stcrCropBox = '1'; box.tabIndex = 0;
    box.setAttribute('role', 'group'); box.setAttribute('aria-label', '裁剪选区；方向键移动，Shift 加速，Escape 取消');
    box.style.cssText = 'display:none;position:absolute;box-sizing:border-box;border:2px solid #fff;outline:1px solid #203a32;box-shadow:0 0 0 99999px #0007;cursor:move;';
    for (const corner of ['nw', 'ne', 'sw', 'se']) {
        const handle = document.createElement('span'); handle.dataset.corner = corner;
        handle.style.cssText = `position:absolute;width:16px;height:16px;border:2px solid white;border-radius:50%;background:#203a32;box-sizing:border-box;${corner.includes('n') ? 'top:-2px' : 'bottom:-2px'};${corner.includes('w') ? 'left:-2px' : 'right:-2px'};cursor:${corner}-resize;`;
        box.append(handle);
    }
    surface.append(image, box);
    let selection = null, active = null, disabled = false;
    const copy = value => value ? { ...value } : null;
    const paint = () => {
        box.style.display = selection ? 'block' : 'none';
        if (selection) Object.assign(box.style, { left: `${100 * selection.x / width}%`, top: `${100 * selection.y / height}%`, width: `${100 * selection.w / width}%`, height: `${100 * selection.h / height}%` });
        onChange(copy(selection));
    };
    const point = event => previewPoint(event.clientX, event.clientY, surface.getBoundingClientRect(), width, height);
    surface.onpointerdown = event => {
        if (disabled || event.button !== 0 || active) return;
        event.preventDefault();
        const corner = event.target.closest('[data-corner]')?.dataset.corner;
        active = { id: event.pointerId, mode: corner ?? (box.contains(event.target) ? 'move' : 'draw'), initial: copy(selection), start: point(event) };
        // 仅在拖动期间监听文档：拖出图片边界仍能完成，不依赖宿主页中的指针捕获状态。
        document.addEventListener('pointermove', move, true);
        document.addEventListener('pointerup', finish, true);
        document.addEventListener('pointercancel', finish, true);
        window.addEventListener('blur', cancel);
        if (active.mode === 'draw') { selection = dragCrop('draw', null, active.start, active.start, width, height); paint(); }
    };
    const detach = () => {
        document.removeEventListener('pointermove', move, true);
        document.removeEventListener('pointerup', finish, true);
        document.removeEventListener('pointercancel', finish, true);
        window.removeEventListener('blur', cancel);
    };
    const move = event => {
        if (disabled || !active || event.pointerId !== active.id) return;
        selection = dragCrop(active.mode, active.initial, active.start, point(event), width, height); paint();
    };
    const finish = event => {
        if (!active || event.pointerId !== active.id) return;
        if (disabled || event.type === 'pointercancel') selection = active.initial;
        else selection = dragCrop(active.mode, active.initial, active.start, point(event), width, height);
        active = null; detach();
        paint(); if (selection) box.focus({ preventScroll: true });
    };
    const cancel = () => { if (active) finish({ pointerId: active.id, type: 'pointercancel' }); };
    box.onkeydown = event => {
        if (disabled) return;
        if (event.key === 'Escape') { event.preventDefault(); clear(); return; }
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta || !selection) return;
        event.preventDefault(); const step = event.shiftKey ? 10 : 1;
        selection = dragCrop('move', selection, { x: 0, y: 0 }, { x: delta[0] * step, y: delta[1] * step }, width, height); paint();
    };
    function clear() {
        active = null; detach();
        selection = null; paint();
    }
    paint();
    return { element: surface, get selection() { return copy(selection); }, clear, setDisabled(value) { disabled = Boolean(value); },
        destroy() { clear(); surface.remove(); surface.onpointerdown = box.onkeydown = null; } };
}
