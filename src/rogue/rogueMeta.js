// Roguelike meta progression. Persists across runs in localStorage; NOT in PROGRESS_KEYS,
// so "Wipe progress" / Dev Mode / Unlock All leave it alone.
// Unlock rule: first unlock = +1 echo slot. Every later unlock = "longer record" (+30s loopTime),
// capped at MAX_RECORD_BONUS_S. Base echo slots (2) match floorGen floorMeta.maxGhosts.
import { buyRelic, normalizeRelicState, toggleRelic } from './relics.js';
export const ROGUE_META_KEY = 'echoCourier_rogueMeta';
export const BASE_ECHO_SLOTS = 2;
export const BASE_LOOP_TIME_S = 60;
export const RECORD_BONUS_STEP_S = 30;
export const MAX_RECORD_BONUS_S = 120;

export const SHOP_MAX_LEVEL = 3;
export const BASE_SAND_S = 3;
export const START_SAND_STEP_S = 0.5;
const WEAPON_IDS = ['chrono-baton', 'parcel-driver', 'route-cutter'];

export function defaultRogueMeta() {
    return { echoSlotBonus: 0, recordBonusS: 0, runs: 0, clears: 0, shopPoints: 0, sandTankLevel: 0, startSandLevel: 0,
        selectedWeapon: 'chrono-baton', relicsOwned: [], relicsEquipped: [], lastRunSummary: null, lastReaction: null, recentDialogueIds: [], auditorTrust: 0, relationshipUnlocked: false };
}

function storage() { return typeof localStorage === 'undefined' ? null : localStorage; }

export function loadRogueMeta() {
    const d = defaultRogueMeta();
    try {
        const raw = storage()?.getItem(ROGUE_META_KEY);
        if (!raw) return d;
        const p = JSON.parse(raw) || {};
        const relicState = normalizeRelicState(p);
        return {
            echoSlotBonus: Math.max(0, Math.min(1, p.echoSlotBonus | 0)),
            recordBonusS: Math.max(0, Math.min(MAX_RECORD_BONUS_S, p.recordBonusS | 0)),
            runs: Math.max(0, p.runs | 0),
            clears: Math.max(0, p.clears | 0),
            shopPoints: Math.max(0, p.shopPoints | 0),
            sandTankLevel: Math.max(0, Math.min(SHOP_MAX_LEVEL, p.sandTankLevel | 0)),
            startSandLevel: Math.max(0, Math.min(SHOP_MAX_LEVEL, p.startSandLevel | 0)),
            selectedWeapon: WEAPON_IDS.includes(p.selectedWeapon) ? p.selectedWeapon : 'chrono-baton',
            ...relicState,
            lastRunSummary: p.lastRunSummary && typeof p.lastRunSummary === 'object' ? p.lastRunSummary : null,
            lastReaction: p.lastReaction && typeof p.lastReaction === 'object' ? p.lastReaction : null,
            recentDialogueIds: Array.isArray(p.recentDialogueIds) ? p.recentDialogueIds.filter(id => typeof id === 'string').slice(-5) : [],
            auditorTrust: Math.max(0, p.auditorTrust | 0),
            relationshipUnlocked: !!p.relationshipUnlocked
        };
    } catch { return d; }
}

export function saveRogueMeta(meta) {
    try { storage()?.setItem(ROGUE_META_KEY, JSON.stringify(meta)); } catch {}
}

export function selectRogueWeapon(id, meta = loadRogueMeta()) {
    if (!WEAPON_IDS.includes(id)) return null;
    const next = { ...meta, selectedWeapon: id };
    saveRogueMeta(next);
    return next;
}

export function buyRogueRelic(id, meta = loadRogueMeta()) {
    const next = buyRelic(id, meta);
    if (!next) return null;
    saveRogueMeta(next);
    return next;
}

export function equipRogueRelic(id, meta = loadRogueMeta()) {
    const next = toggleRelic(id, meta);
    if (!next) return null;
    saveRogueMeta(next);
    return next;
}

/** The single unlock currently on offer, or null if everything is maxed. */
export function nextUnlock(meta = loadRogueMeta()) {
    if (meta.echoSlotBonus < 1) return { id: 'echoSlot', label: '+1 ECHO SLOT' };
    if (meta.recordBonusS < MAX_RECORD_BONUS_S) return { id: 'longerRecord', label: `LONGER RECORD (+${RECORD_BONUS_STEP_S}s)` };
    return null;
}

/** Grant the currently offered unlock and persist. Returns the updated meta. */
export function grantUnlock(meta = loadRogueMeta()) {
    const u = nextUnlock(meta);
    const next = { ...meta };
    if (u?.id === 'echoSlot') next.echoSlotBonus = 1;
    else if (u?.id === 'longerRecord') next.recordBonusS = Math.min(MAX_RECORD_BONUS_S, meta.recordBonusS + RECORD_BONUS_STEP_S);
    saveRogueMeta(next);
    return next;
}

export function chronoDustReward({ cleared = false, bossDepth = 0 } = {}) {
    const depth = Math.max(0, Math.min(4, Number(bossDepth) | 0));
    return 1 + Math.floor(depth / 2) + (cleared ? 1 : 0);
}

/** Record a finished run (called at Run Over). shopPoints == Chrono Dust. */
export function recordRunEnd(cleared, meta = loadRogueMeta(), narrative = null) {
    const dust = chronoDustReward({ cleared, bossDepth: narrative?.lastRunSummary?.bossDepth });
    const next = { ...meta, runs: meta.runs + 1, clears: meta.clears + (cleared ? 1 : 0), shopPoints: (meta.shopPoints | 0) + dust };
    if (narrative) Object.assign(next, narrative);
    saveRogueMeta(next);
    return next;
}

export function rogueMaxGhosts(meta = loadRogueMeta()) { return BASE_ECHO_SLOTS + meta.echoSlotBonus; }
export function rogueLoopTime(meta = loadRogueMeta()) { return BASE_LOOP_TIME_S + meta.recordBonusS; }

const SHOP_DEFS = [
    { id: 'sandTank', field: 'sandTankLevel', label: 'SAND TANK (+1s max)' },
    { id: 'startSand', field: 'startSandLevel', label: `START SAND (+${START_SAND_STEP_S}s)` }
];

/** Shop items with current level, next cost (level+1), and whether affordable. Maxed items have cost null. */
export function shopItems(meta = loadRogueMeta()) {
    return SHOP_DEFS.map(d => {
        const level = meta[d.field] | 0;
        const maxed = level >= SHOP_MAX_LEVEL;
        const cost = maxed ? null : level + 1;
        return { id: d.id, label: d.label, level, maxLevel: SHOP_MAX_LEVEL, cost, maxed, affordable: !maxed && (meta.shopPoints | 0) >= cost };
    });
}

/** Buy one level of a shop item. Returns updated (persisted) meta, or null if unknown/maxed/unaffordable. */
export function buyRogueShop(id, meta = loadRogueMeta()) {
    const d = SHOP_DEFS.find(x => x.id === id);
    const item = d && shopItems(meta).find(x => x.id === id);
    if (!item || !item.affordable) return null;
    const next = { ...meta, shopPoints: (meta.shopPoints | 0) - item.cost, [d.field]: item.level + 1 };
    saveRogueMeta(next);
    return next;
}

export function rogueMaxSand(meta = loadRogueMeta()) { return BASE_SAND_S + (meta.sandTankLevel | 0); }
/** Starting fill: base 3s + 0.5s per start level, capped at max sand. */
export function rogueStartSand(meta = loadRogueMeta()) {
    return Math.min(rogueMaxSand(meta), BASE_SAND_S + START_SAND_STEP_S * (meta.startSandLevel | 0));
}
