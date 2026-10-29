// Echo Courts: one seeded chamber at a time, deserializeLevel-shaped.
// Clear is kill (guard wave), rift (stand in deliveryZone), or timer (clearSeconds).
// Never packages and never a plate. Non-rift chambers park deliveryZone off the map
// so a zone overlap is not a win. Pressure is guards, always patrolling.
// still-court is a timer room in this biome. The Still biome is not generated here.
import { makeRng } from './floorGen.js';

export const COURT_NAME = 'Echo Courts';
export const CHAMBER_W = 800;
export const CHAMBER_H = 600;
export const CLEAR_KINDS = ['kill', 'rift', 'timer'];

export const CHAMBER_TYPES = [
    { id: 'echo-gallery', name: 'Echo Gallery', clear: 'kill', pressure: ['guards'] },
    { id: 'still-court', name: 'Still Court', clear: 'timer', pressure: ['guards'] },
    { id: 'mirror-rift', name: 'Mirror Rift', clear: 'rift', pressure: ['guards'] }
];

const CLOSED_RIFT = { x: -200, y: -200, w: 80, h: 80 };
const BUILDERS = {
    'echo-gallery': echoGallery,
    'still-court': stillCourt,
    'mirror-rift': mirrorRift
};

const pick = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

function mixSeed(seed, typeId) {
    let h = 2166136261;
    const s = String(typeId);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (((Number(seed) >>> 0) ^ (h >>> 0)) >>> 0) || 1;
}

function borders() {
    return [
        { x: 0, y: 0, w: CHAMBER_W, h: 20 },
        { x: 0, y: CHAMBER_H - 20, w: CHAMBER_W, h: 20 },
        { x: 0, y: 0, w: 20, h: CHAMBER_H },
        { x: CHAMBER_W - 20, y: 0, w: 20, h: CHAMBER_H }
    ];
}

function shell(partial) {
    return {
        width: CHAMBER_W, height: CHAMBER_H, mapWidth: CHAMBER_W, mapHeight: CHAMBER_H,
        player: partial.player,
        deliveryZone: partial.deliveryZone,
        walls: partial.walls,
        doors: [],
        plates: [],
        packages: [],
        pickups: [],
        lasers: partial.lasers || [],
        guards: partial.guards || [],
        cameras: partial.cameras || [],
        drones: [], winds: [], statics: [], cracks: [], robots: [], hints: [],
        burrowers: [], gatekeepers: [], prisms: []
    };
}

// West approach, gallery lanes to the east. Every guard waypoint stays >=200px
// from the courier. Clear is the whole guard wave. The lanes keep pacing.
function echoGallery(rng) {
    const yA = 140 + pick(rng, 0, 2) * 20;
    const yB = 280 + pick(rng, 0, 2) * 20;
    const yC = 440 + pick(rng, 0, 2) * 20;
    const x0 = 320 + pick(rng, 0, 2) * 20;
    const x1 = 700 - pick(rng, 0, 2) * 20;
    const gap = pick(rng, 0, 1) * 20;
    const guards = [
        { path: [{ x: x0, y: yA }, { x: x1, y: yA }] },
        { path: [{ x: x0 + 20, y: yB }, { x: x1 - 20, y: yB }] }
    ];
    if (rng() < 0.5) guards.push({ path: [{ x: x0, y: yC }, { x: x1 - 40, y: yC }] });
    return {
        layout: shell({
            player: { x: 40, y: 280 },
            deliveryZone: CLOSED_RIFT,
            walls: [
                ...borders(),
                { x: 180, y: 20, w: 24, h: 120 + gap },
                { x: 180, y: 460 - gap, w: 24, h: 120 + gap }
            ],
            guards
        }),
        obj: 'Defeat every Tick Hound, then enter the rift.'
    };
}

// Open west mouth. Survive clearSeconds while both lanes keep pacing.
function stillCourt(rng) {
    const clearSeconds = [8, 10, 12][pick(rng, 0, 2)];
    const gy = 180 + pick(rng, 0, 3) * 20;
    const gy2 = 360 + pick(rng, 0, 2) * 20;
    const x0 = 360 + pick(rng, 0, 2) * 20;
    const x1 = 700 - pick(rng, 0, 2) * 20;
    return {
        clearSeconds,
        layout: shell({
            player: { x: 80, y: 270 },
            deliveryZone: CLOSED_RIFT,
            walls: [
                ...borders(),
                { x: 200, y: 140, w: 20, h: 90 },
                { x: 200, y: 390, w: 20, h: 90 }
            ],
            guards: [
                { path: [{ x: x0, y: gy }, { x: x1, y: gy }] },
                { path: [{ x: x0, y: gy2 }, { x: x1, y: gy2 }] }
            ]
        }),
        obj: `Survive ${clearSeconds} seconds.`
    };
}

// Rift sits in the north-east. Guards own the lanes between the courier and it.
function mirrorRift(rng) {
    const gy = 200 + pick(rng, 0, 3) * 20;
    const gy2 = 360 + pick(rng, 0, 2) * 20;
    const x0 = 300 + pick(rng, 0, 2) * 20;
    const x1 = 600 - pick(rng, 0, 2) * 20;
    const shift = pick(rng, 0, 2) * 16;
    const riftX = 640 + pick(rng, 0, 2) * 20;
    return {
        layout: shell({
            player: { x: 48, y: 500 },
            deliveryZone: { x: riftX, y: 36, w: 100, h: 88 },
            walls: [
                ...borders(),
                { x: 200 + shift, y: 300, w: 24, h: 70 }
            ],
            guards: [
                { path: [{ x: x0, y: gy }, { x: x1, y: gy }] },
                { path: [{ x: x0 + 40, y: gy2 }, { x: x1, y: gy2 }] }
            ]
        }),
        obj: 'Reach the rift past the guards.'
    };
}

/**
 * pickChamberTypes(seed, count?) -> string[]
 * Seeded order of chamber ids. A full draw is a permutation; longer draws
 * reshuffle without repeating the id just used.
 */
export function pickChamberTypes(seed, count = CHAMBER_TYPES.length) {
    const n = Math.max(0, Math.floor(Number(count)) || 0);
    const rng = makeRng(((Number(seed) >>> 0) ^ 0xE0C0) || 1);
    const ids = CHAMBER_TYPES.map(t => t.id);
    const out = [];
    let bag = [];
    while (out.length < n) {
        if (!bag.length) {
            bag = ids.slice();
            for (let i = bag.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                const tmp = bag[i];
                bag[i] = bag[j];
                bag[j] = tmp;
            }
            if (out.length && bag[bag.length - 1] === out[out.length - 1] && bag.length > 1) {
                const last = bag.length - 1;
                const tmp = bag[last];
                bag[last] = bag[last - 1];
                bag[last - 1] = tmp;
            }
        }
        out.push(bag.pop());
    }
    return out;
}

/**
 * generateChamber(seed, typeId?) -> { layout, meta, info }
 * layout matches deserializeLevel. meta.clear is 'kill' | 'rift' | 'timer'.
 * meta.hall is the aspect-picker kicker source (COURT_NAME).
 */
export function generateChamber(seed, typeId) {
    const id = typeId == null || typeId === '' ? pickChamberTypes(seed, 1)[0] : String(typeId);
    const spec = CHAMBER_TYPES.find(t => t.id === id);
    if (!spec) throw new Error(`Unknown chamber type: ${id}`);
    const built = BUILDERS[id](makeRng(mixSeed(seed, id)));
    const clearSeconds = spec.clear === 'timer' ? built.clearSeconds : null;
    const waveCount = spec.clear === 'kill' ? built.layout.guards.length : 0;
    const meta = {
        hall: COURT_NAME,
        name: spec.name,
        type: spec.id,
        obj: built.obj,
        clear: spec.clear,
        clearSeconds,
        waveCount,
        maxGhosts: 2,
        par: 1,
        loopTime: null
    };
    const info = {
        seed: Number(seed) >>> 0,
        type: spec.id,
        name: spec.name,
        clear: spec.clear,
        clearSeconds,
        waveCount,
        pressure: spec.pressure.slice(),
        hall: COURT_NAME
    };
    return { layout: built.layout, meta, info };
}
