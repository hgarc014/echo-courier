// Pure echo-end check for dev/editor playtests. No DOM or game-engine imports.
// Positions are world pixels, top-left hitbox (courier default 30×30). A crack
// tile is offending when that hitbox overlaps it — same strict AABB as gameplay.

const ECHO_SIZE = 30;
const CRACK_SIZE = 40;

function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function crackRects(level) {
    if (!level || typeof level !== 'object') return [];
    const src = Array.isArray(level.cracks)
        ? level.cracks
        : (Array.isArray(level.layout?.cracks) ? level.layout.cracks : []);
    const rects = [];
    for (const crack of src) {
        if (!crack || typeof crack !== 'object') continue;
        if (!Number.isFinite(Number(crack.x)) || !Number.isFinite(Number(crack.y))) continue;
        rects.push({
            x: Number(crack.x),
            y: Number(crack.y),
            w: num(crack.w, CRACK_SIZE),
            h: num(crack.h, CRACK_SIZE)
        });
    }
    return rects;
}

function echoBox(echo) {
    return {
        x: num(echo.x, 0),
        y: num(echo.y, 0),
        w: num(echo.w, ECHO_SIZE),
        h: num(echo.h, ECHO_SIZE)
    };
}

function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function findEchoesEndingOnCracks(level, echoEndPositions) {
    const cracks = crackRects(level);
    if (!cracks.length || !Array.isArray(echoEndPositions)) return [];
    const offenders = [];
    for (let i = 0; i < echoEndPositions.length; i++) {
        const echo = echoEndPositions[i];
        if (!echo || typeof echo !== 'object') continue;
        const box = echoBox(echo);
        if (cracks.some(crack => overlaps(box, crack))) offenders.push(echo);
    }
    return offenders;
}

export function validateEchoEndTiles(level, echoEndPositions) {
    return findEchoesEndingOnCracks(level, echoEndPositions);
}
