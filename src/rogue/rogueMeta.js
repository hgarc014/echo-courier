// Roguelike meta progression. Persists across runs in localStorage; NOT in PROGRESS_KEYS,
// so "Wipe progress" / Dev Mode / Unlock All leave it alone.
// Unlock rule: first unlock = +1 echo slot. Every later unlock = "longer record" (+30s loopTime),
// capped at MAX_RECORD_BONUS_S. Base echo slots (2) match floorGen floorMeta.maxGhosts.
export const ROGUE_META_KEY = 'echoCourier_rogueMeta';
export const BASE_ECHO_SLOTS = 2;
export const BASE_LOOP_TIME_S = 60;
export const RECORD_BONUS_STEP_S = 30;
export const MAX_RECORD_BONUS_S = 120;
// Permanent sand unlocks (offered AFTER echoSlot + longerRecord are maxed):
// order = echoSlot -> longerRecord x4 -> sandTank / startSand alternating (tank first) until both capped.
export const SAND_BASE_S = 3.0;            // mirrors sandRewind SAND_MAX
export const SAND_MAX_STEP_S = 1;
export const MAX_SAND_MAX_BONUS_S = 3;
export const SAND_START_STEP_S = 1;
export const MAX_SAND_START_BONUS_S = 3;

export function defaultRogueMeta() {
    return { echoSlotBonus: 0, recordBonusS: 0, sandMaxBonus: 0, sandStartBonus: 0, runs: 0, clears: 0 };
}

function storage() { return typeof localStorage === 'undefined' ? null : localStorage; }

function clampNum(v, max) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0; }

export function loadRogueMeta() {
    const d = defaultRogueMeta();
    try {
        const raw = storage()?.getItem(ROGUE_META_KEY);
        if (!raw) return d;
        const p = JSON.parse(raw) || {};
        return {
            echoSlotBonus: Math.max(0, Math.min(1, p.echoSlotBonus | 0)),
            recordBonusS: Math.max(0, Math.min(MAX_RECORD_BONUS_S, p.recordBonusS | 0)),
            sandMaxBonus: clampNum(p.sandMaxBonus, MAX_SAND_MAX_BONUS_S),
            sandStartBonus: clampNum(p.sandStartBonus, MAX_SAND_START_BONUS_S),
            runs: Math.max(0, p.runs | 0),
            clears: Math.max(0, p.clears | 0)
        };
    } catch { return d; }
}

export function saveRogueMeta(meta) {
    try { storage()?.setItem(ROGUE_META_KEY, JSON.stringify(meta)); } catch {}
}

/** The single unlock currently on offer, or null if everything is maxed. */
export function nextUnlock(meta = loadRogueMeta()) {
    if (meta.echoSlotBonus < 1) return { id: 'echoSlot', label: '+1 ECHO SLOT' };
    if (meta.recordBonusS < MAX_RECORD_BONUS_S) return { id: 'longerRecord', label: `LONGER RECORD (+${RECORD_BONUS_STEP_S}s)` };
    const tankOpen = (meta.sandMaxBonus || 0) < MAX_SAND_MAX_BONUS_S;
    const startOpen = (meta.sandStartBonus || 0) < MAX_SAND_START_BONUS_S;
    if (tankOpen && (!startOpen || (meta.sandMaxBonus || 0) <= (meta.sandStartBonus || 0))) return { id: 'sandTank', label: `+${SAND_MAX_STEP_S}s SAND TANK` };
    if (startOpen) return { id: 'startSand', label: `+${SAND_START_STEP_S}s START SAND` };
    return null;
}

/** Grant the currently offered unlock and persist. Returns the updated meta. */
export function grantUnlock(meta = loadRogueMeta()) {
    const u = nextUnlock(meta);
    const next = { ...meta };
    if (u?.id === 'echoSlot') next.echoSlotBonus = 1;
    else if (u?.id === 'longerRecord') next.recordBonusS = Math.min(MAX_RECORD_BONUS_S, meta.recordBonusS + RECORD_BONUS_STEP_S);
    else if (u?.id === 'sandTank') next.sandMaxBonus = Math.min(MAX_SAND_MAX_BONUS_S, (meta.sandMaxBonus || 0) + SAND_MAX_STEP_S);
    else if (u?.id === 'startSand') next.sandStartBonus = Math.min(MAX_SAND_START_BONUS_S, (meta.sandStartBonus || 0) + SAND_START_STEP_S);
    saveRogueMeta(next);
    return next;
}

/** Record a finished run (count only; called at Run Over). */
export function recordRunEnd(cleared, meta = loadRogueMeta()) {
    const next = { ...meta, runs: meta.runs + 1, clears: meta.clears + (cleared ? 1 : 0) };
    saveRogueMeta(next);
    return next;
}

export function rogueMaxGhosts(meta = loadRogueMeta()) { return BASE_ECHO_SLOTS + meta.echoSlotBonus; }
export function rogueLoopTime(meta = loadRogueMeta()) { return BASE_LOOP_TIME_S + meta.recordBonusS; }
/** Permanent max sand tank (seconds). */
export function rogueMaxSand(meta = loadRogueMeta()) { return SAND_BASE_S + (meta.sandMaxBonus || 0); }
/** Starting sand: base start is SAND_BASE_S (old behavior = full base tank), plus bonus, capped by max. */
export function rogueStartSand(meta = loadRogueMeta()) { return Math.min(rogueMaxSand(meta), SAND_BASE_S + (meta.sandStartBonus || 0)); }
