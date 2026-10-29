// The Still: the fourth Rogue Run biome. Sparse geometry and mirrored lanes
// create deliberate, high-pressure rooms without restoring delivery puzzles.
import { makeRng } from './floorGen.js';

export const STILL_NAME = 'The Still';
export const CHAMBER_W = 800;
export const CHAMBER_H = 600;
export const CLEAR_KINDS = ['kill', 'rift', 'timer'];

export const CHAMBER_TYPES = [
    { id: 'frozen-minute', name: 'Frozen Minute', clear: 'kill', pressure: ['guards'] },
    { id: 'dead-clock', name: 'Dead Clock', clear: 'timer', pressure: ['guards'] },
    { id: 'last-route', name: 'Last Route', clear: 'rift', pressure: ['guards'] }
];

const CLOSED_RIFT = { x: -200, y: -200, w: 80, h: 80 };
const pick = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

function mixSeed(seed, typeId) {
    let h = 2166136261;
    for (const char of String(typeId)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
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

function shell({ player, deliveryZone, walls, guards }) {
    return {
        width: CHAMBER_W, height: CHAMBER_H, mapWidth: CHAMBER_W, mapHeight: CHAMBER_H,
        player, deliveryZone, walls, guards,
        doors: [], plates: [], packages: [], pickups: [], lasers: [], cameras: [], drones: [],
        winds: [], statics: [], cracks: [], robots: [], hints: [], burrowers: [], gatekeepers: [], prisms: []
    };
}

function frozenMinute(rng) {
    const inset = 210 + pick(rng, 0, 2) * 20;
    return {
        layout: shell({
            player: { x: 55, y: 285 }, deliveryZone: CLOSED_RIFT,
            walls: [...borders(), { x: inset, y: 80, w: 24, h: 150 }, { x: inset, y: 370, w: 24, h: 150 },
                { x: 540, y: 180, w: 24, h: 240 }],
            guards: [
                { path: [{ x: 340, y: 135 }, { x: 700, y: 135 }] },
                { path: [{ x: 360, y: 285 }, { x: 680, y: 285 }] },
                { path: [{ x: 340, y: 445 }, { x: 700, y: 445 }] }
            ]
        }),
        obj: 'Break every perfect repetition, then enter the rift.'
    };
}

function deadClock(rng) {
    const clearSeconds = [10, 12, 14][pick(rng, 0, 2)];
    const shift = pick(rng, -1, 1) * 20;
    return {
        clearSeconds,
        layout: shell({
            player: { x: 385, y: 285 }, deliveryZone: CLOSED_RIFT,
            walls: [...borders(),
                { x: 180 + shift, y: 160, w: 120, h: 24 }, { x: 500 - shift, y: 160, w: 120, h: 24 },
                { x: 180 + shift, y: 416, w: 120, h: 24 }, { x: 500 - shift, y: 416, w: 120, h: 24 }],
            guards: [
                { path: [{ x: 80, y: 80 }, { x: 690, y: 80 }] },
                { path: [{ x: 80, y: 490 }, { x: 690, y: 490 }] }
            ]
        }),
        obj: `Survive ${clearSeconds} seconds while the clock refuses to move.`
    };
}

function lastRoute(rng) {
    const y = 70 + pick(rng, 0, 2) * 20;
    return {
        layout: shell({
            player: { x: 55, y: 490 }, deliveryZone: { x: 675, y, w: 86, h: 86 },
            walls: [...borders(), { x: 185, y: 120, w: 24, h: 360 }, { x: 385, y: 20, w: 24, h: 250 },
                { x: 385, y: 350, w: 24, h: 230 }, { x: 585, y: 120, w: 24, h: 360 }],
            guards: [
                { path: [{ x: 270, y: 90 }, { x: 270, y: 490 }] },
                { path: [{ x: 450, y: 90 }, { x: 450, y: 490 }] },
                { path: [{ x: 650, y: 180 }, { x: 650, y: 500 }] }
            ]
        }),
        obj: 'Cross the last route and reach the silent rift.'
    };
}

const BUILDERS = { 'frozen-minute': frozenMinute, 'dead-clock': deadClock, 'last-route': lastRoute };

export function pickChamberTypes(seed, count = CHAMBER_TYPES.length) {
    const wanted = Math.max(0, Math.floor(Number(count)) || 0);
    const rng = makeRng(((Number(seed) >>> 0) ^ 0x57111) || 1);
    const out = [];
    let bag = [];
    while (out.length < wanted) {
        if (!bag.length) {
            bag = CHAMBER_TYPES.map(type => type.id);
            for (let i = bag.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [bag[i], bag[j]] = [bag[j], bag[i]];
            }
            if (out.length && bag.at(-1) === out.at(-1) && bag.length > 1) {
                [bag[bag.length - 1], bag[bag.length - 2]] = [bag[bag.length - 2], bag[bag.length - 1]];
            }
        }
        out.push(bag.pop());
    }
    return out;
}

export function generateChamber(seed, typeId) {
    const id = typeId == null || typeId === '' ? pickChamberTypes(seed, 1)[0] : String(typeId);
    const spec = CHAMBER_TYPES.find(type => type.id === id);
    if (!spec) throw new Error(`Unknown chamber type: ${id}`);
    const built = BUILDERS[id](makeRng(mixSeed(seed, id)));
    const clearSeconds = spec.clear === 'timer' ? built.clearSeconds : null;
    const waveCount = spec.clear === 'kill' ? built.layout.guards.length : 0;
    const meta = { hall: STILL_NAME, name: spec.name, type: id, obj: built.obj, clear: spec.clear,
        clearSeconds, waveCount, maxGhosts: 3, par: 1, loopTime: null };
    const info = { seed: Number(seed) >>> 0, type: id, name: spec.name, clear: spec.clear,
        clearSeconds, waveCount, pressure: spec.pressure.slice(), hall: STILL_NAME };
    return { layout: built.layout, meta, info };
}
