// Past-self echoes on rewind (Super Time Force style).
// Campaign loops: every finished loop becomes an echo replayed from loop start.
// Sand rewind: frames undone while E is held are collected, then on RELEASE
// (or sand empty) pushEchoRun commits them as a forward-playing Ghost — only if
// the hold lasted ≥ MIN_ECHO_SEGMENT frames. Short taps never create ghosts.
// Cap (drop oldest) is enforced in pushEchoRun.

/** Minimum E-hold rewind frames before a sand echo is committed. */
export const MIN_ECHO_SEGMENT = 15;

export function recordSandSample(buffer, frame) {
    buffer.push(frame && typeof frame === 'object' ? { ...frame } : frame);
    return buffer;
}

export function spawnEchoFromBuffer(buffer, recordCap = null) {
    if (!Array.isArray(buffer) || buffer.length === 0) return null;
    return (recordCap != null && buffer.length > recordCap) ? buffer.slice(0, recordCap) : [...buffer];
}

export function maxSandGhosts(meta) {
    const n = meta?.maxGhosts;
    return n == null ? null : Number(n) + (Number(meta?.echoSlotBonus) || 0);
}

// Appends run, trims oldest past cap. Returns true if added.
export function pushEchoRun(pastRuns, buffer, cap = null, recordCap = null) {
    const run = spawnEchoFromBuffer(buffer, recordCap);
    if (run) pastRuns.push(run);
    if (cap != null) while (pastRuns.length > cap) pastRuns.shift();
    return !!run;
}

/**
 * Commit a sand-rewind echo after the hold ends.
 * Only pushes when holdTicks >= MIN_ECHO_SEGMENT (short taps → no ghost).
 * pending frames must be in chronological order (oldest first).
 */
export function commitSandEcho(pastRuns, pending, holdTicks, cap = null) {
    if ((holdTicks | 0) < MIN_ECHO_SEGMENT) return false;
    return pushEchoRun(pastRuns, pending, cap);
}

// Rogue slice: empty-package floor clears when the player stands in the zone.
export function rogueZoneClear(requiredPackages, player, zone) {
    if ((requiredPackages || []).length > 0 || !player || !zone) return false;
    return player.x < zone.x + zone.w && player.x + player.w > zone.x && player.y < zone.y + zone.h && player.y + player.h > zone.y;
}
