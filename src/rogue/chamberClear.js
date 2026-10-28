// Pure chamber-clear predicates. No generation and no UI — callers decide when a
// Rogue Run chamber of type rift / timer / wave is finished.

/** Player overlaps the rift (exit) zone. */
export function chamberClearedByRift(player, zone) {
    if (!player || !zone) return false;
    return player.x < zone.x + zone.w && player.x + player.w > zone.x
        && player.y < zone.y + zone.h && player.y + player.h > zone.y;
}

/** Survive-timer chamber ends when the clock has run out. */
export function chamberClearedByTimer(ticksLeft) {
    return typeof ticksLeft === 'number' && ticksLeft <= 0;
}

/** Wave chamber ends when no enemies remain. */
export function chamberClearedByWave(enemiesLeft) {
    return typeof enemiesLeft === 'number' && enemiesLeft <= 0;
}
