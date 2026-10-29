export const CHAMBERS_PER_BIOME = 3;
export const ROUTE_NODE_TYPES = Object.freeze([
    Object.freeze({ id: 'combat', label: 'Combat', reward: 'Aspect', risk: 1 }),
    Object.freeze({ id: 'cache', label: 'Recovery Cache', reward: 'Sand + Integrity', risk: 0 }),
    Object.freeze({ id: 'elite', label: 'Elite Signal', reward: 'Rare Aspect + Dust', risk: 3 }),
    Object.freeze({ id: 'anomaly', label: 'Temporal Anomaly', reward: 'Unstable boon', risk: 2 }),
    Object.freeze({ id: 'rush', label: 'Rush Contract', reward: 'Bonus Dust', risk: 2 })
]);

function mix(seed, biomeIndex) {
    let value = ((Number(seed) >>> 0) ^ Math.imul(biomeIndex + 1, 0x9e3779b1)) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x85ebca6b) >>> 0;
    return (value ^ (value >>> 13)) >>> 0;
}

function rotate(values, offset) {
    if (!values.length) return [];
    const at = offset % values.length;
    return [...values.slice(at), ...values.slice(0, at)];
}

/** Deterministic run plan: three authored chambers followed by each biome boss. */
export function createRunRoute(biomes, seed, chambersPerBiome = CHAMBERS_PER_BIOME) {
    const stages = [];
    for (let biomeIndex = 0; biomeIndex < biomes.length; biomeIndex++) {
        const biome = biomes[biomeIndex];
        const ids = (biome.chamberTypes || []).map(type => type.id);
        const ordered = rotate(ids, mix(seed, biomeIndex));
        const count = Math.max(1, Math.min(ids.length, chambersPerBiome | 0));
        for (let chamberIndex = 0; chamberIndex < count; chamberIndex++) {
            stages.push({ kind: 'chamber', biomeIndex, biomeId: biome.id, chamberIndex, typeId: ordered[chamberIndex] });
        }
        stages.push({ kind: 'boss', biomeIndex, biomeId: biome.id, chamberIndex: count });
    }
    return Object.freeze(stages.map(stage => Object.freeze(stage)));
}

export function routeStage(route, index) {
    return route?.[Math.max(0, index | 0)] || null;
}

export function nextRouteIndex(route, index) {
    const next = (index | 0) + 1;
    return next < (route?.length || 0) ? next : null;
}

/** Two deterministic future choices at each depth, followed by a biome boss gate. */
export function createRouteLedger(biomes, seed, depths = CHAMBERS_PER_BIOME) {
    return Object.freeze(biomes.map((biome, biomeIndex) => {
        const types = (biome.chamberTypes || []).map(type => type.id);
        const nodes = [];
        for (let depth = 0; depth < depths; depth++) {
            const base = mix((Number(seed) >>> 0) + depth * 313, biomeIndex);
            const firstType = ROUTE_NODE_TYPES[base % ROUTE_NODE_TYPES.length];
            const secondType = ROUTE_NODE_TYPES[(base + 1 + depth) % ROUTE_NODE_TYPES.length];
            nodes.push(Object.freeze([
                Object.freeze({ id: `${biome.id}-${depth}-a`, biomeId: biome.id, biomeIndex, depth, branch: 0,
                    type: firstType.id, label: firstType.label, reward: firstType.reward, risk: firstType.risk,
                    chamberType: types[(base + depth) % types.length] }),
                Object.freeze({ id: `${biome.id}-${depth}-b`, biomeId: biome.id, biomeIndex, depth, branch: 1,
                    type: secondType.id, label: secondType.label, reward: secondType.reward, risk: secondType.risk,
                    chamberType: types[(base + depth + 1) % types.length] })
            ]));
        }
        return Object.freeze({
            biomeId: biome.id,
            biomeIndex,
            layers: Object.freeze(nodes),
            boss: Object.freeze({ id: `${biome.id}-boss`, biomeId: biome.id, biomeIndex, depth: depths, type: 'boss', label: 'Boss Gate', reward: 'Biome clear', risk: 4 })
        });
    }));
}

export function ledgerChoices(ledger, biomeIndex, depth) {
    return ledger?.[biomeIndex | 0]?.layers?.[depth | 0] || [];
}
