// Shared geometry for pits, broken cracks, and plates.
// The kill hole and its warning ring both come from killZone() so the drawn
// area and the lethal area cannot drift apart.

export const PIT_KILL_FRACTION = 0.65;
export const PLATE_PRESS_FRACTION = 0.25;
// 0.5s at 60 Hz. A tile must show this warning ring before it may crumble,
// and the crumble frame itself stays up at least this long.
export const WARNING_RING_TICKS = 30;
export const CRUMBLE_MIN_TICKS = 30;

export function clampKillFraction(value) {
    if (value == null || value === '') return PIT_KILL_FRACTION;
    const n = Number(value);
    if (!Number.isFinite(n)) return PIT_KILL_FRACTION;
    return Math.min(0.7, Math.max(0.6, n));
}

/** Centered rect covering `fraction` of the tile on each axis. */
export function killZone(tile, fraction = PIT_KILL_FRACTION) {
    const f = clampKillFraction(fraction);
    const w = (tile.w || 0) * f;
    const h = (tile.h || 0) * f;
    return {
        x: tile.x + ((tile.w || 0) - w) / 2,
        y: tile.y + ((tile.h || 0) - h) / 2,
        w,
        h
    };
}

export function pointInRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

export function actorCenter(actor) {
    const w = actor.w || 30;
    const h = actor.h || 30;
    return { x: actor.x + w / 2, y: actor.y + h / 2 };
}

export function centerInKillZone(actor, tile, fraction = PIT_KILL_FRACTION) {
    if (!actor || !tile) return false;
    const c = actorCenter(actor);
    return pointInRect(c.x, c.y, killZone(tile, fraction));
}

export function overlapArea(a, b) {
    if (!a || !b) return 0;
    const aw = a.w || 0;
    const ah = a.h || 0;
    const bw = b.w || 0;
    const bh = b.h || 0;
    const x = Math.min(a.x + aw, b.x + bw) - Math.max(a.x, b.x);
    const y = Math.min(a.y + ah, b.y + bh) - Math.max(a.y, b.y);
    if (x <= 0 || y <= 0) return 0;
    return x * y;
}

export function actorArea(actor) {
    return Math.max(0, (actor?.w || 30) * (actor?.h || 30));
}

/** True when the overlap is at least `fraction` of the actor's own area. */
export function actorPressesPlate(actor, plate, fraction = PLATE_PRESS_FRACTION) {
    if (!actor || !plate || actor.isActive === false) return false;
    const area = actorArea(actor);
    if (area <= 0) return false;
    return overlapArea(actor, plate) / area >= fraction - 1e-9;
}
