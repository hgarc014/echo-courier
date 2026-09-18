import { state } from './state.js';

export const VIEW_WIDTH = 800;
export const VIEW_HEIGHT = 600;
export const DEFAULT_MAP_WIDTH = 800;
export const DEFAULT_MAP_HEIGHT = 600;

export function getMapSize() {
    return {
        w: state.mapWidth || DEFAULT_MAP_WIDTH,
        h: state.mapHeight || DEFAULT_MAP_HEIGHT
    };
}

export function getCamera() {
    return { x: state.camX || 0, y: state.camY || 0 };
}

export function setMapSize(w, h) {
    const width = Math.max(VIEW_WIDTH, Math.round(Number(w) || DEFAULT_MAP_WIDTH));
    const height = Math.max(VIEW_HEIGHT, Math.round(Number(h) || DEFAULT_MAP_HEIGHT));
    state.mapWidth = width;
    state.mapHeight = height;
    clampCamera();
    return { w: width, h: height };
}

export function clampCamera(viewW = VIEW_WIDTH, viewH = VIEW_HEIGHT) {
    const { w, h } = getMapSize();
    const maxX = Math.max(0, w - viewW);
    const maxY = Math.max(0, h - viewH);
    state.camX = Math.max(0, Math.min(maxX, state.camX || 0));
    state.camY = Math.max(0, Math.min(maxY, state.camY || 0));
}

export function panCamera(dx, dy) {
    state.camX = (state.camX || 0) + dx;
    state.camY = (state.camY || 0) + dy;
    clampCamera();
}

export function setCamera(x, y) {
    state.camX = x;
    state.camY = y;
    clampCamera();
}

export function followWorldPoint(wx, wy, viewW = VIEW_WIDTH, viewH = VIEW_HEIGHT) {
    setCamera(wx - viewW / 2, wy - viewH / 2);
}

export function screenToWorld(sx, sy) {
    const { x, y } = getCamera();
    return { x: sx + x, y: sy + y };
}

export function worldToScreen(wx, wy) {
    const { x, y } = getCamera();
    return { x: wx - x, y: wy - y };
}

export function applyCamera(ctx, shakeX = 0, shakeY = 0) {
    const { x, y } = getCamera();
    ctx.translate(-x + shakeX, -y + shakeY);
}
