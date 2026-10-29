export const RELICS = Object.freeze([
    Object.freeze({ id: 'cracked-pocketwatch', name: 'Cracked Pocketwatch', detail: '+1 maximum Integrity', cost: 2 }),
    Object.freeze({ id: 'sand-funnel', name: 'Sand Funnel', detail: '+0.5s maximum sand', cost: 3 }),
    Object.freeze({ id: 'echo-locket', name: 'Echo Locket', detail: 'Start each run with one Echo charge', cost: 4 }),
    Object.freeze({ id: 'rift-key', name: 'Rift Key', detail: 'Cleared rifts open 1s faster', cost: 4 }),
    Object.freeze({ id: 'hound-tooth', name: 'Hound Tooth', detail: '+10% weapon reach', cost: 3 })
]);

const IDS = new Set(RELICS.map(relic => relic.id));

export function relicSlots(meta) {
    return (meta?.runs | 0) >= 10 ? 2 : 1;
}

export function normalizeRelicState(meta = {}) {
    const owned = Array.isArray(meta.relicsOwned) ? [...new Set(meta.relicsOwned.filter(id => IDS.has(id)))] : [];
    const slots = relicSlots(meta);
    const equipped = Array.isArray(meta.relicsEquipped)
        ? [...new Set(meta.relicsEquipped.filter(id => owned.includes(id)))].slice(0, slots)
        : [];
    return { relicsOwned: owned, relicsEquipped: equipped };
}

export function buyRelic(id, meta) {
    const relic = RELICS.find(entry => entry.id === id);
    const normalized = normalizeRelicState(meta);
    if (!relic || normalized.relicsOwned.includes(id) || (meta.shopPoints | 0) < relic.cost) return null;
    return {
        ...meta,
        ...normalized,
        shopPoints: (meta.shopPoints | 0) - relic.cost,
        relicsOwned: [...normalized.relicsOwned, id]
    };
}

export function toggleRelic(id, meta) {
    const normalized = normalizeRelicState(meta);
    if (!normalized.relicsOwned.includes(id)) return null;
    if (normalized.relicsEquipped.includes(id)) {
        return { ...meta, ...normalized, relicsEquipped: normalized.relicsEquipped.filter(entry => entry !== id) };
    }
    if (normalized.relicsEquipped.length >= relicSlots(meta)) return null;
    return { ...meta, ...normalized, relicsEquipped: [...normalized.relicsEquipped, id] };
}

export function hasRelic(meta, id) {
    return normalizeRelicState(meta).relicsEquipped.includes(id);
}

export function relicModifiers(meta) {
    return Object.freeze({
        maxHpBonus: hasRelic(meta, 'cracked-pocketwatch') ? 1 : 0,
        maxSandBonus: hasRelic(meta, 'sand-funnel') ? 0.5 : 0,
        echoCharges: hasRelic(meta, 'echo-locket') ? 1 : 0,
        riftOpenTicks: hasRelic(meta, 'rift-key') ? 0 : 60,
        reachMultiplier: hasRelic(meta, 'hound-tooth') ? 1.1 : 1
    });
}
