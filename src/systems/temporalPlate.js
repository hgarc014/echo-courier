// Pure TemporalPlate helpers (no DOM / state imports) so Node tests can load them.
export const TEMPORAL_MODES = ['present', 'first', 'last'];
// Legend glyphs drawn on the plate and above the matching actor's head.
export const TEMPORAL_GLYPH = { present: '\u25B6', first: '1', last: 'L' };
export const TEMPORAL_COLOR = { present: '#00ff66', first: '#ff44ff', last: '#3fa9ff' };

export function normalizeTimeline(mode) {
    return TEMPORAL_MODES.includes(mode) ? mode : 'present';
}

function ghostIdExtreme(ghosts, pickMax) {
    let best;
    for (const g of ghosts || []) {
        if (!g || !Number.isFinite(g.id)) continue;
        if (best === undefined || (pickMax ? g.id > best : g.id < best)) best = g.id;
    }
    return best;
}

/** Oldest surviving echo id (after maxGhosts pruning). */
export function firstGhostId(ghosts) { return ghostIdExtreme(ghosts, false); }
/** Newest echo id after maxGhosts pruning: the highest id among the live ghost list. */
export function lastGhostId(ghosts) { return ghostIdExtreme(ghosts, true); }

export function isPresentActor(a) { return !!a && a.id === undefined && a.assetName === 'player'; }

/**
 * Which actor may press a TemporalPlate in `mode`.
 * actors: the actors currently able to press plates (player + active echoes).
 * ghosts: the full echo list for this loop (state.activeGhosts), used to resolve first/last.
 */
export function pickTemporalActor(mode, actors, ghosts) {
    const m = normalizeTimeline(mode);
    const list = actors || [];
    if (m === 'present') return list.find(isPresentActor) || null;
    const id = m === 'first' ? firstGhostId(ghosts) : lastGhostId(ghosts);
    if (id === undefined) return null;
    return list.find(a => a && a.id === id) || null;
}

/** Glyphs (first/last) that apply to a given echo id, for head legends. */
export function glyphsForGhost(id, ghosts, modesInLevel) {
    const out = [];
    if (modesInLevel.has('first') && id === firstGhostId(ghosts)) out.push('first');
    if (modesInLevel.has('last') && id === lastGhostId(ghosts)) out.push('last');
    return out;
}
