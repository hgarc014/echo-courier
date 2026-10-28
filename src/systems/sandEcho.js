// Past-self echoes on rewind (Super Time Force style).
// Campaign loops: every finished loop becomes an echo replayed from loop start.
// Sand rewind: the abandoned segment becomes an echo too, replayed FORWARD from
// its own start with the normal Ghost playback. Both paths go through
// pushEchoRun so the cap (drop oldest) is enforced in one place.
// Hook for E-hold / sand meter: call pushEchoRun(state.pastRuns, segment, cap)
// at rewind start, then rebuild activeGhosts (see resetRun / sand tick in main.js).

/** Ignore shorter segments on sand rewind start (junk from a 1-frame E tap). */
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
// opts.minLength: if set, refuse buffers shorter than this (sand E-tap filter).
export function pushEchoRun(pastRuns, buffer, cap = null, recordCap = null, opts = null) {
    const min = opts?.minLength;
    if (min != null && (!Array.isArray(buffer) || buffer.length < min)) return false;
    const run = spawnEchoFromBuffer(buffer, recordCap);
    if (run) pastRuns.push(run);
    if (cap != null) while (pastRuns.length > cap) pastRuns.shift();
    return !!run;
}

// Rogue slice: empty-package floor clears when the player stands in the zone.
export function rogueZoneClear(requiredPackages, player, zone) {
    if ((requiredPackages || []).length > 0 || !player || !zone) return false;
    return player.x < zone.x + zone.w && player.x + player.w > zone.x && player.y < zone.y + zone.h && player.y + player.h > zone.y;
}
