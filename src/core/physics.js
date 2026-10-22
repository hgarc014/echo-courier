import { state } from './state.js';

export const PLAYER_MOVE_SPEED = 4;
export const HEAVY_SPEED_MULT = 0.5;

export function AABB(x1,y1,w1,h1,x2,y2,w2,h2) { return x1<x2+w2 && x1+w1>x2 && y1<y2+h2 && y1+h1>y2; }

export function checkWallCollision(newX, newY, w, h) {
    for (let wall of state.walls) if (AABB(newX, newY, w, h, wall.x, wall.y, wall.w, wall.h)) return true;
    for (let door of state.doors) if (!door.isOpen && AABB(newX, newY, w, h, door.x, door.y, door.w, door.h)) return true;
    return false;
}

/** XR-9's armored body is solid to couriers (player and echoes): no dashing through it. */
export function robotBodyBlocks(newX, newY, w, h) {
    for (const r of (state.robots || [])) {
        if (r && r.backTouch && r.hp > 0 && AABB(newX, newY, w, h, r.x, r.y, r.w, r.h)) return true;
    }
    return false;
}

/** Courier movement collision: walls, closed doors, and solid robot bodies. */
export function checkCourierCollision(newX, newY, w, h) {
    return checkWallCollision(newX, newY, w, h) || robotBodyBlocks(newX, newY, w, h);
}

export function lineOfSightBlocked(x1, y1, x2, y2) {
    let dx = x2 - x1; let dy = y2 - y1; let dist = Math.hypot(dx, dy);
    let steps = Math.ceil(dist / 5);
    for (let i=0; i<=steps; i++) {
        let px = x1 + (dx/steps)*i; let py = y1 + (dy/steps)*i;
        if (checkWallCollision(px, py, 1, 1)) return true;
    }
    return false;
}

export function resolveDashFacing(facingX, facingY) {
    const fx = facingX ?? 0;
    const fy = facingY ?? 0;
    if (fx === 0 && fy === 0) return { x: 1, y: 0 };
    return { x: fx, y: fy };
}

export function getDashDestination(startX, startY, dx, dy, maxDist, w, h) {
    let currentX = startX;
    let currentY = startY;
    for (let i = 5; i <= maxDist; i += 5) {
        let testX = startX + dx * i;
        let testY = startY + dy * i;
        if (checkCourierCollision(testX, testY, w, h)) {
            return { x: currentX, y: currentY };
        }
        currentX = testX;
        currentY = testY;
    }
    return { x: currentX, y: currentY };
}
