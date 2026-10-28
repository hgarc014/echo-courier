// Locked rogue-run biome order. Campaign LEVELS are not part of this list.
// startRogueRun begins at index 0. Clearing a chamber advances one step.
import { generateChamber as generateHalls, HALL_NAME, CHAMBER_TYPES as HALL_TYPES } from '../data/secondHandHalls.js';
import { generateChamber as generateWarrens, WARREN_NAME, CHAMBER_TYPES as WARREN_TYPES } from '../data/hourglassWarrens.js';

export const BIOME_ORDER = Object.freeze([
    Object.freeze({
        id: 'second-hand-halls',
        name: HALL_NAME,
        generateChamber: generateHalls,
        chamberTypes: HALL_TYPES
    }),
    Object.freeze({
        id: 'hourglass-warrens',
        name: WARREN_NAME,
        generateChamber: generateWarrens,
        chamberTypes: WARREN_TYPES
    })
]);

export function biomeById(id) {
    return BIOME_ORDER.find(b => b.id === id) || null;
}

/** Index of the biome after `index`, or null when `index` is the last one. */
export function nextBiomeIndex(index) {
    const n = (index | 0) + 1;
    return n > 0 && n < BIOME_ORDER.length ? n : null;
}

/**
 * generateForBiome(biomeId, seed, typeId?) -> chamber
 * Omitted biomeId is the first biome (Second-hand Halls).
 */
export function generateForBiome(biomeId, seed, typeId) {
    const biome = biomeId == null || biomeId === '' ? BIOME_ORDER[0] : biomeById(biomeId);
    if (!biome) throw new Error(`Unknown biome: ${biomeId}`);
    return biome.generateChamber(seed, typeId);
}

/** Editor loader rows: one entry per chamber type, in BIOME_ORDER. */
export function editorChamberOptions() {
    const out = [];
    for (const biome of BIOME_ORDER) {
        for (const t of biome.chamberTypes) {
            out.push({
                biomeId: biome.id,
                biomeName: biome.name,
                typeId: t.id,
                typeName: t.name,
                clear: t.clear,
                label: `${biome.name}: ${t.name}`
            });
        }
    }
    return out;
}

/**
 * deserializeLevel-shaped layout plus editor meta for one generated chamber.
 * Seed defaults to 1 so the editor load is deterministic.
 */
export function rogueChamberEditorLayout(biomeId, typeId, seed = 1) {
    const biome = biomeById(biomeId);
    if (!biome) throw new Error(`Unknown biome: ${biomeId}`);
    const chamber = biome.generateChamber(seed, typeId);
    const meta = {
        name: chamber.meta.name,
        story: { speaker: '', text: '' },
        obj: chamber.meta.obj,
        grants: ['dash', 'toss', 'cloak', 'ghostShield'],
        maxGhosts: chamber.meta.maxGhosts ?? 2,
        crackSpeed: 'normal',
        par: chamber.meta.par,
        hall: chamber.meta.hall,
        biome: biome.id,
        chamberType: chamber.info.type,
        clear: chamber.info.clear
    };
    return { ...chamber.layout, meta };
}
