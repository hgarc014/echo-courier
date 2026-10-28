// Sand meter + limited player rewind (Rogue Run only). Pure logic; no DOM.
export const SAND_HZ = 60;
export const SAND_MAX = 3.0;            // seconds of rewind fuel
export const SAND_REFILL_RATE = 0.25;   // seconds refilled per real second when not rewinding
export const HISTORY_CAP = 180;         // ~3s at 60Hz

export function createSandState(opts = {}) {
    const maxSand = opts.maxSand ?? SAND_MAX;
    const sand = Math.min(maxSand, opts.sand ?? maxSand);
    return { sand, maxSand, history: [], rewinding: false };
}

export function snapshotPlayer(player, packages, tick) {
    const carried = (packages || []).find(p => p.carriedBy === 'player');
    return {
        x: player.x, y: player.y,
        facingX: player.facingX, facingY: player.facingY,
        vx: player.vx, vy: player.vy,
        cloakTimer: player.cloakTimer, dashCooldown: player.dashCooldown, tossCooldown: player.tossCooldown,
        carriedPackageId: carried ? (carried.id ?? (packages.indexOf(carried))) : null,
        tick,
    };
}

export function pushSnapshot(sand, snap) {
    sand.history.push(snap);
    if (sand.history.length > HISTORY_CAP) sand.history.splice(0, sand.history.length - HISTORY_CAP);
}

export function canRewind(sand) {
    return sand.sand > 0 && sand.history.length > 0;
}

function findPkg(packages, id) {
    if (id == null) return null;
    return packages.find(p => p.id === id) ?? (typeof id === 'number' ? packages[id] : null) ?? null;
}

export function applySnapshot(player, packages, snap) {
    for (const k of ['x', 'y', 'facingX', 'facingY', 'vx', 'vy', 'cloakTimer', 'dashCooldown', 'tossCooldown']) {
        if (snap[k] !== undefined) player[k] = snap[k];
    }
    if (!packages) return;
    const want = findPkg(packages, snap.carriedPackageId);
    for (const p of packages) {
        if (p.carriedBy === 'player' && p !== want) p.carriedBy = null;
    }
    if (want && !want.isDestroyed && (!want.carriedBy || want.carriedBy === 'player')) {
        want.carriedBy = 'player';
        want.tossTicks = 0;
        want.x = player.x + ((player.w || 0) - (want.w || 0)) / 2;
        want.y = player.y + ((player.h || 0) - (want.h || 0)) / 2;
    }
    player.carrying = !!want;
}

/**
 * Advance one tick. Returns true if this tick was a rewind tick (caller should skip normal play).
 */
export function tickSand(sand, { holding, player, packages, tick }) {
    const dt = 1 / SAND_HZ;
    if (holding && canRewind(sand)) {
        sand.rewinding = true;
        const snap = sand.history.pop();
        applySnapshot(player, packages, snap);
        sand.sand = Math.max(0, sand.sand - dt);
        return true;
    }
    sand.rewinding = false;
    sand.sand = Math.min(sand.maxSand, sand.sand + dt * SAND_REFILL_RATE);
    pushSnapshot(sand, snapshotPlayer(player, packages, tick));
    return false;
}

export function refillSand(sand, amount = sand.maxSand) {
    sand.sand = Math.min(sand.maxSand, sand.sand + amount);
}

// Run-only bonus: raise the cap and top up current sand by the same amount.
export function bumpMaxSand(sand, extra) {
    sand.maxSand += extra;
    sand.sand = Math.min(sand.maxSand, sand.sand + extra);
}

export const PICKUP_REFILL = 1.5;   // sand_refill: +1.5s, capped at maxSand
export const PICKUP_MAX_BONUS = 1.0; // sand_max: +1.0s cap and +1.0s current

export function applyPickup(sand, type) {
    if (type === 'sand_refill') refillSand(sand, PICKUP_REFILL);
    else if (type === 'sand_max') bumpMaxSand(sand, PICKUP_MAX_BONUS);
    else return false;
    return true;
}

export function resetHistory(sand) { sand.history.length = 0; sand.rewinding = false; }

// Death-undo (Rogue Run): on a would-be death, auto-rewind ~1s for a sand premium.
export const DEATH_UNDO_FRAMES = 60;  // ~1s at 60Hz
export const DEATH_UNDO_COST = 1.5;   // sand seconds (more than the 1s rewound)

export function canDeathUndo(sand) {
    return !!sand && sand.sand >= DEATH_UNDO_COST && sand.history.length > 0;
}

export function applyDeathUndo(sand, player, packages) {
    if (!canDeathUndo(sand)) return { ok: false, frames: 0 };
    const n = Math.min(DEATH_UNDO_FRAMES, sand.history.length);
    const popped = sand.history.splice(sand.history.length - n, n);
    applySnapshot(player, packages, popped[0]);
    sand.sand = Math.max(0, sand.sand - DEATH_UNDO_COST);
    sand.rewinding = false;
    return { ok: true, frames: n };
}
