// Second-hand Halls: one seeded chamber at a time, deserializeLevel-shaped.
// Clear is kill (guard wave), rift (stand in deliveryZone), or timer (clearSeconds).
// Never packages and never a plate. Non-rift chambers park deliveryZone off the map
// so a zone overlap is not a win. Pressure (guards / cameras / lasers) is always on.
import { makeRng } from './floorGen.js';

export const HALL_NAME = 'Second-hand Halls';
export const CHAMBER_W = 800;
export const CHAMBER_H = 600;
export const CLEAR_KINDS = ['kill', 'rift', 'timer'];

export const CHAMBER_TYPES = [
    { id: 'sweep-yard', name: 'Sweep Yard', clear: 'rift', pressure: ['cameras'] },
    { id: 'patrol-corridor', name: 'Patrol Corridor', clear: 'kill', pressure: ['guards'] },
    { id: 'beam-cross', name: 'Beam Cross', clear: 'rift', pressure: ['lasers', 'cameras'] },
    { id: 'rift-dash', name: 'Rift Dash', clear: 'rift', pressure: ['guards', 'lasers'] },
    { id: 'timed-hold', name: 'Timed Hold', clear: 'timer', pressure: ['guards', 'cameras'] }
];

const CLOSED_RIFT = { x: -200, y: -200, w: 80, h: 80 };
const BUILDERS = {
    'sweep-yard': sweepYard,
    'patrol-corridor': patrolCorridor,
    'beam-cross': beamCross,
    'rift-dash': riftDash,
    'timed-hold': timedHold
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

// Open yard. Cameras sit on the north lip; cover blocks stay off the rift.
function sweepYard(rng) {
    const camCount = rng() < 0.5 ? 3 : 2;
    const cameras = [];
    const xs = [160, 380, 600];
    for (let i = 0; i < camCount; i++) {
        cameras.push({
            x: xs[i] + pick(rng, -20, 20),
            y: 28,
            baseAngle: Math.PI / 2,
            sweepRange: rng() < 0.5 ? Math.PI / 4 : Math.PI / 3
        });
    }
    const shift = pick(rng, 0, 2) * 20;
    return {
        layout: shell({
            player: { x: 48, y: 270 },
            deliveryZone: { x: 650, y: 230, w: 110, h: 120 },
            walls: [
                ...borders(),
                { x: 220 + shift, y: 140, w: 40, h: 100 },
                { x: 460 - shift, y: 360, w: 40, h: 100 }
            ],
            cameras
        }),
        obj: 'Reach the rift. Cameras keep sweeping.'
    };
}

// Open arena. Six guards hold the east half so a rogue hunt stays under pressure
// for about half a minute. Every waypoint stays >=200px from spawn.
function patrolCorridor(rng) {
    const nudge = pick(rng, 0, 2) * 16;
    const guards = [
        { path: [{ x: 320 + nudge, y: 80 }, { x: 560, y: 80 }] },
        { path: [{ x: 360, y: 180 }, { x: 680, y: 180 }] },
        { path: [{ x: 320, y: 280 }, { x: 520, y: 300 }] },
        { path: [{ x: 560, y: 300 }, { x: 720, y: 320 }] },
        { path: [{ x: 340, y: 400 }, { x: 560, y: 460 }] },
        { path: [{ x: 640, y: 420 }, { x: 700, y: 200 }] }
    ];
    return {
        layout: shell({
            player: { x: 48, y: 270 },
            deliveryZone: CLOSED_RIFT,
            walls: [
                ...borders(),
                { x: 200, y: 120, w: 24, h: 110 },
                { x: 200, y: 370, w: 24, h: 110 }
            ],
            guards
        }),
        obj: 'Defeat every Tick Hound, then enter the rift.'
    };
}

// Crossing beams, always hot. A north camera watches the left lane. Rift is top-right.
function beamCross(rng) {
    const vx = 360 + pick(rng, 0, 4) * 20;
    const hy = 260 + pick(rng, 0, 3) * 20;
    return {
        layout: shell({
            player: { x: 48, y: 480 },
            deliveryZone: { x: 640, y: 48, w: 100, h: 100 },
            walls: borders(),
            lasers: [
                { id: 'vx', x: vx, y: 40, w: 24, h: 520 },
                { id: 'hx', x: 40, y: hy, w: 720, h: 24 }
            ],
            cameras: [{
                x: 80 + pick(rng, 0, 2) * 20,
                y: 36,
                baseAngle: Math.PI / 2,
                sweepRange: Math.PI / 5
            }]
        }),
        obj: 'Reach the rift across the beams.'
    };
}

// Vertical gate in front of the rift. One guard paces the approach. Every
// waypoint stays >=200px from spawn (player ~48,200) so the wave does not
// open on a catch. x0 is 240 or 260: 220 is still ~199px when gy is 300,
// and 280 walks the 30px body into the nearest gate (x >= 460).
function riftDash(rng) {
    const gateX = 460 + pick(rng, 0, 3) * 20;
    const gy = 300 + pick(rng, 0, 2) * 20;
    const x0 = 240 + pick(rng, 0, 1) * 20;
    return {
        layout: shell({
            player: { x: 48, y: 200 },
            deliveryZone: { x: 660, y: 240, w: 100, h: 120 },
            walls: borders(),
            lasers: [{ id: 'gate', x: gateX, y: 60, w: 24, h: 480 }],
            guards: [{ path: [{ x: x0, y: gy }, { x: x0 + 160, y: gy }] }]
        }),
        obj: 'Reach the rift past the gate.'
    };
}

// West alcove. Survive clearSeconds. Guard and camera sit on the mouth, not the spawn.
function timedHold(rng) {
    const clearSeconds = [8, 10, 12][pick(rng, 0, 2)];
    return {
        clearSeconds,
        layout: shell({
            player: { x: 80, y: 270 },
            deliveryZone: CLOSED_RIFT,
            walls: [
                ...borders(),
                { x: 20, y: 160, w: 240, h: 20 },
                { x: 20, y: 420, w: 240, h: 20 },
                { x: 20, y: 160, w: 20, h: 280 }
            ],
            guards: [{ path: [{ x: 320, y: 280 }, { x: 560, y: 280 }] }],
            cameras: [{
                x: 200 + pick(rng, 0, 2) * 20,
                y: 188,
                baseAngle: Math.PI / 2,
                sweepRange: Math.PI / 3
            }]
        }),
        obj: `Survive ${clearSeconds} seconds.`
    };
}

/**
 * pickChamberTypes(seed, count?) -> string[]
 * Seeded order of chamber ids. A full draw is a permutation; longer draws
 * reshuffle without repeating the id just used.
 */
export function pickChamberTypes(seed, count = CHAMBER_TYPES.length) {
    const n = Math.max(0, Math.floor(Number(count)) || 0);
    const rng = makeRng(((Number(seed) >>> 0) ^ 0xC0A1) || 1);
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
 */
export function generateChamber(seed, typeId) {
    const id = typeId == null || typeId === '' ? pickChamberTypes(seed, 1)[0] : String(typeId);
    const spec = CHAMBER_TYPES.find(t => t.id === id);
    if (!spec) throw new Error(`Unknown chamber type: ${id}`);
    const built = BUILDERS[id](makeRng(mixSeed(seed, id)));
    const clearSeconds = spec.clear === 'timer' ? built.clearSeconds : null;
    const waveCount = spec.clear === 'kill' ? built.layout.guards.length : 0;
    const meta = {
        hall: HALL_NAME,
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
        hall: HALL_NAME
    };
    return { layout: built.layout, meta, info };
}
