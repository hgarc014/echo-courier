export const MAX_RENDER_WIDTH = 2560;
export const MAX_RENDER_HEIGHT = 1920;
export const MAX_DEVICE_SCALE = 2;

export function backingStoreSize(cssWidth, cssHeight, deviceScale = 1) {
    const width = Math.max(1, Number(cssWidth) || 1);
    const height = Math.max(1, Number(cssHeight) || 1);
    const scale = Math.max(0.5, Math.min(
        MAX_DEVICE_SCALE,
        Number(deviceScale) || 1,
        MAX_RENDER_WIDTH / width,
        MAX_RENDER_HEIGHT / height
    ));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        scale
    };
}

export function syncCanvasResolution(canvas, ctx, logicalWidth = 800, logicalHeight = 600) {
    const rect = canvas.getBoundingClientRect?.() || {};
    const cssWidth = rect.width || canvas.clientWidth || logicalWidth;
    const cssHeight = rect.height || canvas.clientHeight || logicalHeight;
    const target = backingStoreSize(cssWidth, cssHeight, globalThis.devicePixelRatio || 1);
    if (canvas.width !== target.width || canvas.height !== target.height) {
        canvas.width = target.width;
        canvas.height = target.height;
    }
    const scaleX = canvas.width / logicalWidth;
    const scaleY = canvas.height / logicalHeight;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.imageSmoothingEnabled = true;
    try { ctx.imageSmoothingQuality = 'high'; } catch { /* older canvas implementations */ }
    return { ...target, scaleX, scaleY, cssWidth, cssHeight };
}
