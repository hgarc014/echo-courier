import { state } from './state.js';

export function AABB(x1,y1,w1,h1,x2,y2,w2,h2) { return x1<x2+w2 && x1+w1>x2 && y1<y2+h2 && y1+h1>y2; }

export function checkWallCollision(newX, newY, w, h) {
    for (let wall of state.walls) if (AABB(newX, newY, w, h, wall.x, wall.y, wall.w, wall.h)) return true;
    for (let door of state.doors) if (!door.isOpen && AABB(newX, newY, w, h, door.x, door.y, door.w, door.h)) return true;
    return false;
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

export function getDashDestination(startX, startY, dx, dy, maxDist, w, h) {
    let currentX = startX;
    let currentY = startY;
    for (let i = 5; i <= maxDist; i += 5) {
        let testX = startX + dx * i;
        let testY = startY + dy * i;
        if (checkWallCollision(testX, testY, w, h)) {
            return { x: currentX, y: currentY };
        }
        currentX = testX;
        currentY = testY;
    }
    return { x: currentX, y: currentY };
}
