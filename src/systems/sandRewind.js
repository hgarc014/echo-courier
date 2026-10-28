// Sand meter + limited player rewind (Rogue Run only). Pure logic; no DOM.
export const SAND_HZ = 60;
export const SAND_MAX = 3.0;            // seconds of rewind fuel
export const SAND_REFILL_RATE = 0.25;   // seconds refilled per real second when not rewinding
export const HISTORY_CAP = 180;         // ~3s at 60Hz

export function createSandState() {
    return { sand: SAND_MAX, history: [], rewinding: false };
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
    sand.sand = Math.min(SAND_MAX, sand.sand + dt * SAND_REFILL_RATE);
    pushSnapshot(sand, snapshotPlayer(player, packages, tick));
    return false;
}

export function refillSand(sand, amount = SAND_MAX) {
    sand.sand = Math.min(SAND_MAX, sand.sand + amount);
}

export function resetHistory(sand) { sand.history.length = 0; sand.rewinding = false; }
