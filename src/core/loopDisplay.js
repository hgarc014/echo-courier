// Live loop index is 1-based: the Nth loop shows N, matching "Finish in N loops".
// pastRuns.length is the kept-echo buffer (capped by maxGhosts), so it is not this number.

export function displayedLoopNumber(loopNumber) {
    const n = Math.floor(Number(loopNumber));
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
}

// Planned budget for the HUD "Loop N of B". One more than the echo cap: the live
// run plus the echoes you meant to keep. Extra rewinds still happen; this is not a cap.
// Non-finite maxGhosts (unlimited echoes) has no planned total.
export function plannedLoopBudget(maxGhosts) {
    if (maxGhosts == null || maxGhosts === '') return null;
    const n = Number(maxGhosts);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n) + 1;
}

/** True when the live loop is within a 1-based par ("finish in maxLoops loops"). */
export function finishedWithinLoops(loopNumber, maxLoops) {
    const max = Math.floor(Number(maxLoops));
    if (!Number.isFinite(max) || max < 1) return false;
    return displayedLoopNumber(loopNumber) <= max;
}

/** Results copy. `par` is the level's 1-based par when the level defines one. */
export function finishLoopLine(loopNumber, par) {
    const n = displayedLoopNumber(loopNumber);
    const noun = n === 1 ? 'loop' : 'loops';
    const p = Math.floor(Number(par));
    if (Number.isFinite(p) && p >= 1) return `Finished in ${n} ${noun} (par ${p}).`;
    return `Finished in ${n} ${noun}.`;
}
