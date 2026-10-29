export const CHAMBERS_PER_BIOME = 3;

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
