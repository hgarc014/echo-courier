import { state } from '../core/state.js';
import { PlayerEntity } from '../entities/actors.js';
import { Package, PressurePlate, TemporalPlate, Door, AlarmDoor, TimerDoor, Wall, HintPlate } from '../entities/interactables.js';
import { Laser, SweepCamera, Drone, Guard, WindTunnel, StaticZone, CrackedFloor, ShooterRobot, LaserProjectile, Pit } from '../entities/hazards.js';
import { Burrower, normalizeMaxStunsPerLoop } from '../entities/bosses/Burrower.js';
import { finishedWithinLoops } from '../core/loopDisplay.js';
import { Gatekeeper } from '../entities/bosses/gatekeeper.js';
import { DeliveryZone } from '../entities/zones.js';
import { DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT } from '../core/camera.js';
import { W2_LEVELS } from './world2Levels.js';

// W1 Dispatch is 0–4. W2 Subfloor (#47) is 5–9. Older campaign levels follow, shifted
// past both. Provisional Subfloor slots (originally indices 2–4) sit at the front of Panopticon.
export const WORLDS = [
  { id: 1, name: 'Dispatch',   unlocks: [],                 levels: [0, 1, 2, 3, 4] },
  { id: 2, name: 'Subfloor',   unlocks: ['dash'],           levels: [5, 6, 7, 8, 9] },
  { id: 3, name: 'Panopticon', unlocks: ['toss', 'cloak'],  levels: [10, 11, 12, 13, 14, 15] },
  { id: 4, name: 'Beamworks',  unlocks: ['ghostShield'],    levels: [16, 17] },
  { id: 5, name: 'Overclock',  unlocks: [],                 levels: [18, 19] },
];

let player, deliveryZone, walls, doors, plates, hints, packages, lasers, guards, cameras, drones, winds, statics, cracks, robots, burrowers, gatekeepers, projectiles;

export function createBoundWalls(w, h, t = 20) {
    return [
        new Wall(0, 0, w, t),
        new Wall(0, h - t, w, t),
        new Wall(0, 0, t, h),
        new Wall(w - t, 0, t, h)
    ];
}

export function isBoundWall(wall, w, h, t = 20) {
    if (!wall) return false;
    if (wall.x === 0 && wall.y === 0 && wall.h === t && wall.w === w) return true;
    if (wall.x === 0 && wall.y === h - t && wall.h === t && wall.w === w) return true;
    if (wall.x === 0 && wall.y === 0 && wall.w === t && wall.h === h) return true;
    if (wall.x === w - t && wall.y === 0 && wall.w === t && wall.h === h) return true;
    return false;
}

function layoutMapSize(data, fallback) {
    const w = data?.width || data?.mapWidth || fallback?.mapWidth || DEFAULT_MAP_WIDTH;
    const h = data?.height || data?.mapHeight || fallback?.mapHeight || DEFAULT_MAP_HEIGHT;
    return { mapWidth: w, mapHeight: h };
}

// Blank, non-numeric, and non-positive values mean "no per-loop limit".
export function normalizeLoopTime(value) {
    if (value == null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

// Positive integer loop counts only. Blank, zero, and non-integers mean "no par".
export function normalizePar(value) {
    if (value == null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}

// Level-select tooltip. Challenge text that already starts with "Par" is not prefixed again.
export function formatParTooltip(desc) {
    const text = String(desc ?? '').trim();
    if (!text) return '';
    if (/^par\b/i.test(text)) return text;
    return `Par: ${text}`;
}

// Optional par challenge. Skips levels that already define their own challenge.
// Desc has no "Par:" prefix — the level button adds it once via formatParTooltip.
export function installParChallenge(level) {
    if (!level || level.par == null || level.challenge) return;
    const par = normalizePar(level.par);
    if (par == null) return;
    const noun = par === 1 ? 'loop' : 'loops';
    level.challenge = {
        desc: `Finish in ${par} ${noun} or fewer`,
        check: () => finishedWithinLoops(state.loopNumber, par)
    };
}

function setupDevSandbox() {
    const W = 1600;
    const H = 1200;
    player = new PlayerEntity(80, 80, 30, 30, 'player');
    deliveryZone = new DeliveryZone(1420, 1000, 120, 120);
    walls = [
        ...createBoundWalls(W, H),
        new Wall(400, 20, 20, 480),
        new Wall(800, 20, 20, 480),
        new Wall(1200, 20, 20, 480),
        new Wall(400, 700, 20, 480),
        new Wall(800, 700, 20, 480),
        new Wall(1200, 700, 20, 480),
        new Wall(180, 180, 20, 200),
        new Wall(980, 180, 160, 20)
    ];
    doors = [
        new Door('sb_door', 180, 240, 20, 80),
        new TimerDoor('sb_timer', 400, 500, 80, 20, 90, 90),
        new AlarmDoor('sb_alarm', 980, 180, 80, 20)
    ];
    plates = [
        new PressurePlate('sb_plate', 80, 300, 'sb_door'),
        new PressurePlate('sb_laser_plate', 460, 80, 'sb_laser'),
        new TemporalPlate('sb_temporal', 250, 80, 'sb_door', 'present')
    ];
    packages = [
        new Package('sb_std', 140, 80, 'standard'),
        new Package('sb_heavy', 80, 820, 'heavy'),
        new Package('sb_fragile', 620, 200, 'fragile'),
        new Package('sb_timed', 860, 820, 'timed'),
        new Package('sb_contra', 920, 280, 'contraband'),
        new Package('sb_decoy', 1280, 820, 'decoy')
    ];
    lasers = [new Laser('sb_laser', 560, 40, 20, 440)];
    guards = [new Guard([{ x: 1280, y: 80 }, { x: 1480, y: 80 }, { x: 1480, y: 400 }, { x: 1280, y: 400 }])];
    cameras = [new SweepCamera(900, 40, Math.PI / 2, Math.PI / 4)];
    drones = [new Drone([{ x: 1280, y: 760 }, { x: 1480, y: 760 }, { x: 1480, y: 960 }, { x: 1280, y: 960 }])];
    winds = [new WindTunnel(450, 740, 80, 400, 0, 5)];
    statics = [new StaticZone(620, 760, 140, 200)];
    cracks = [];
    for (let i = 0; i < 6; i++) cracks.push(new CrackedFloor(80 + i * 40, 940, 40, 80, 'fast'));
    robots = [new ShooterRobot([{ x: 1320, y: 1040 }, { x: 1480, y: 1040 }])];
    robots[0].engaged = true;
    robots[0].fireCooldown = 90;
    projectiles = [];
    gatekeepers = [];
}

function emptyActors() {
    return { lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: [], burrowers: [], gatekeepers: [] };
}

// W1-L1. Plate sits on the LEVEL1_DEMO move target so the intro hint still lines up.
const W1_L1_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 80, y: 250 },
    deliveryZone: { x: 620, y: 420, w: 120, h: 120 },
    walls: [
        { x: 0, y: 0, w: 800, h: 20 },
        { x: 0, y: 580, w: 800, h: 20 },
        { x: 0, y: 0, w: 20, h: 600 },
        { x: 780, y: 0, w: 20, h: 600 },
        { x: 400, y: 20, w: 20, h: 190 },
        { x: 400, y: 370, w: 20, h: 210 }
    ],
    doors: [{ x: 400, y: 210, w: 20, h: 160, id: 'd1', type: 'standard' }],
    plates: [{ x: 275, y: 235, linkedIds: ['d1'], id: 'p1', type: 'standard' }],
    packages: [{ x: 575, y: 250, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }],
    hints: [{ id: 'hint_intro', x: 140, y: 170, demoId: 'intro', autoOpen: true, title: 'Ghost Hold' }],
    ...emptyActors()
};

// Package room, then a second corridor down to a dead-end plate. Zone is beside the package, behind d1.
const W1_L2_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 60, y: 140 },
    deliveryZone: { x: 650, y: 55, w: 110, h: 120 },
    walls: [
        { x: 0, y: 0, w: 800, h: 20 },
        { x: 0, y: 580, w: 800, h: 20 },
        { x: 0, y: 0, w: 20, h: 600 },
        { x: 780, y: 0, w: 20, h: 600 },
        { x: 200, y: 20, w: 20, h: 70 },
        { x: 200, y: 190, w: 20, h: 390 },
        { x: 220, y: 230, w: 90, h: 20 },
        { x: 430, y: 230, w: 350, h: 20 },
        { x: 600, y: 20, w: 20, h: 50 },
        { x: 600, y: 190, w: 20, h: 40 },
        { x: 240, y: 250, w: 20, h: 330 },
        { x: 500, y: 250, w: 20, h: 330 }
    ],
    doors: [{ x: 600, y: 70, w: 20, h: 120, id: 'd1', type: 'standard' }],
    plates: [{ x: 340, y: 480, linkedIds: ['d1'], id: 'p1', type: 'standard' }],
    packages: [{ x: 400, y: 60, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }],
    hints: [],
    ...emptyActors()
};

// Corridor: plate P, then a long walk to plate-door D1, then TimerDoor T (open 2s / shut 3s).
const W1_L3_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 40, y: 280 },
    deliveryZone: { x: 690, y: 245, w: 80, h: 130 },
    walls: [
        { x: 0, y: 0, w: 800, h: 20 },
        { x: 0, y: 580, w: 800, h: 20 },
        { x: 0, y: 0, w: 20, h: 600 },
        { x: 780, y: 0, w: 20, h: 600 },
        { x: 20, y: 210, w: 760, h: 20 },
        { x: 20, y: 400, w: 760, h: 20 }
    ],
    doors: [
        { x: 500, y: 230, w: 20, h: 170, id: 'd1', type: 'standard' },
        { x: 640, y: 230, w: 20, h: 170, id: 't', type: 'timer', openT: 120, closedT: 180 }
    ],
    plates: [{ x: 200, y: 280, linkedIds: ['d1'], id: 'p', type: 'standard' }],
    packages: [{ x: 110, y: 285, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }],
    hints: [],
    ...emptyActors()
};

// Plate A sits in chamber 1, far from door A. The door shuts the tick the plate is empty, so the tape that reaches plate B is a second loop.
function w1L4Walls() {
    const walls = [
        { x: 0, y: 0, w: 800, h: 20 },
        { x: 0, y: 580, w: 800, h: 20 },
        { x: 0, y: 0, w: 20, h: 600 },
        { x: 780, y: 0, w: 20, h: 600 }
    ];
    const left = 20;
    const right = 470;
    const openW = 90;
    const pitch = 90;
    const clear = 70;
    for (let i = 0; i < 4; i++) {
        const y = 20 + i * pitch + clear;
        const span = right - left - openW;
        if (i % 2 === 0) walls.push({ x: left, y, w: span, h: 20 });
        else walls.push({ x: left + openW, y, w: span, h: 20 });
    }
    walls.push({ x: left, y: 450, w: right - left, h: 130 });
    walls.push({ x: right, y: 20, w: 20, h: 360 });
    walls.push({ x: right, y: 450, w: 20, h: 130 });
    walls.push({ x: 490, y: 20, w: 290, h: 360 });
    walls.push({ x: 490, y: 450, w: 290, h: 130 });
    return walls;
}

const W1_L4_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 40, y: 40 },
    deliveryZone: { x: 715, y: 385, w: 60, h: 60 },
    walls: w1L4Walls(),
    doors: [
        { x: 470, y: 380, w: 20, h: 70, id: 'doorA', type: 'standard' },
        { x: 610, y: 380, w: 20, h: 70, id: 'doorB', type: 'standard' },
        { x: 690, y: 380, w: 20, h: 70, id: 't', type: 'timer', openT: 240, closedT: 780 }
    ],
    plates: [
        { x: 180, y: 40, linkedIds: ['doorA'], id: 'a', type: 'standard' },
        { x: 510, y: 395, linkedIds: ['doorB'], id: 'b', type: 'standard' }
    ],
    packages: [{ x: 78, y: 40, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }],
    hints: [],
    ...emptyActors()
};

// g1 opens the door to g2, g2 opens the door to g3. Vault opens only after all three audits.
const W1_MB_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 60, y: 250 },
    deliveryZone: { x: 690, y: 420, w: 80, h: 120 },
    walls: [
        { x: 0, y: 0, w: 800, h: 20 },
        { x: 0, y: 580, w: 800, h: 20 },
        { x: 0, y: 0, w: 20, h: 600 },
        { x: 780, y: 0, w: 20, h: 600 },
        { x: 230, y: 20, w: 20, h: 210 },
        { x: 230, y: 350, w: 20, h: 230 },
        { x: 460, y: 20, w: 20, h: 210 },
        { x: 460, y: 350, w: 20, h: 230 },
        { x: 650, y: 20, w: 20, h: 210 },
        { x: 650, y: 350, w: 20, h: 230 }
    ],
    doors: [
        { x: 230, y: 230, w: 20, h: 120, id: 'd1', type: 'standard' },
        { x: 460, y: 230, w: 20, h: 120, id: 'd2', type: 'standard' },
        { x: 650, y: 230, w: 20, h: 120, id: 'vault', type: 'standard' }
    ],
    plates: [
        { x: 70, y: 460, linkedIds: ['d1'], id: 'g1', type: 'standard' },
        { x: 300, y: 460, linkedIds: ['d2'], id: 'g2', type: 'standard' },
        { x: 520, y: 460, linkedIds: [], id: 'g3', type: 'standard' }
    ],
    packages: [{ x: 700, y: 180, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }],
    hints: [],
    lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: [], burrowers: [],
    gatekeepers: [{
        id: 'gk',
        x: 340,
        y: 70,
        vaultDoorId: 'vault',
        audits: [
            { plateId: 'g1', tick: 360 },
            { plateId: 'g2', tick: 720 },
            { plateId: 'g3', tick: 1080 }
        ]
    }]
};

const LEVEL3_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 70, y: 280 },
    deliveryZone: { x: 640, y: 420, w: 100, h: 100 },
    walls: [
        { x: 0, y: 0, w: 800, h: 20 },
        { x: 0, y: 580, w: 800, h: 20 },
        { x: 0, y: 0, w: 20, h: 600 },
        { x: 780, y: 0, w: 20, h: 600 },
        { x: 300, y: 20, w: 40, h: 180 },
        { x: 300, y: 320, w: 40, h: 260 },
        { x: 480, y: 180, w: 80, h: 20 },
        { x: 480, y: 320, w: 80, h: 20 }
    ],
    doors: [{ x: 300, y: 200, w: 40, h: 120, id: "d1", type: "standard" }],
    plates: [{ x: 120, y: 260, linkedIds: ["d1"], id: "p1", type: "standard" }],
    packages: [{ x: 160, y: 400, id: "pkg1", packageType: "standard", requiredForDelivery: true }],
    lasers: [], guards: [],
    cameras: [{ x: 520, y: 40, baseAngle: Math.PI / 2, sweepRange: Math.PI / 3 }],
    drones: [], winds: [], statics: [], cracks: [], robots: []
};

const LEVEL4_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 60, y: 480 },
    deliveryZone: { x: 640, y: 440, w: 100, h: 100 },
    walls: [
        { x: 0, y: 0, w: 800, h: 20 },
        { x: 0, y: 580, w: 800, h: 20 },
        { x: 0, y: 0, w: 20, h: 600 },
        { x: 780, y: 0, w: 20, h: 600 },
        { x: 280, y: 20, w: 40, h: 220 },
        { x: 280, y: 340, w: 40, h: 240 },
        { x: 520, y: 20, w: 40, h: 180 },
        { x: 520, y: 300, w: 40, h: 280 }
    ],
    doors: [{ x: 280, y: 240, w: 40, h: 100, id: "d1", type: "standard" }],
    plates: [{ x: 100, y: 260, linkedIds: ["d1"], id: "p1", type: "standard" }],
    packages: [{ x: 120, y: 420, id: "pkg1", packageType: "standard", requiredForDelivery: true }],
    lasers: [],
    guards: [{ path: [{ x: 380, y: 140 }, { x: 380, y: 420 }] }],
    cameras: [{ x: 620, y: 40, baseAngle: Math.PI / 2, sweepRange: Math.PI / 4 }],
    drones: [], winds: [], statics: [], cracks: [], robots: []
};

const LEVEL5_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 60, y: 280 },
    deliveryZone: { x: 640, y: 240, w: 100, h: 100 },
    walls: [
        { x: 0, y: 0, w: 800, h: 20 },
        { x: 0, y: 580, w: 800, h: 20 },
        { x: 0, y: 0, w: 20, h: 600 },
        { x: 780, y: 0, w: 20, h: 600 },
        { x: 360, y: 20, w: 40, h: 200 },
        { x: 360, y: 360, w: 40, h: 220 }
    ],
    doors: [{ x: 360, y: 220, w: 40, h: 140, id: "d1", type: "standard" }],
    plates: [{ x: 120, y: 200, linkedIds: ["d1"], id: "p1", type: "standard" }],
    packages: [{ x: 140, y: 380, id: "pkg1", packageType: "standard", requiredForDelivery: true }],
    lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [],
    cracks: [
        { x: 280, y: 220, w: 40, h: 40 },
        { x: 280, y: 260, w: 40, h: 40 },
        { x: 280, y: 300, w: 40, h: 40 },
        { x: 280, y: 340, w: 40, h: 40 },
        { x: 320, y: 220, w: 40, h: 40 },
        { x: 320, y: 260, w: 40, h: 40 },
        { x: 320, y: 300, w: 40, h: 40 },
        { x: 320, y: 340, w: 40, h: 40 },
        { x: 420, y: 220, w: 40, h: 40 },
        { x: 420, y: 260, w: 40, h: 40 },
        { x: 420, y: 300, w: 40, h: 40 },
        { x: 420, y: 340, w: 40, h: 40 },
        { x: 460, y: 220, w: 40, h: 40 },
        { x: 460, y: 260, w: 40, h: 40 },
        { x: 460, y: 300, w: 40, h: 40 },
        { x: 460, y: 340, w: 40, h: 40 }
    ],
    robots: []
};

const LEVEL1_DEMO = {
    autoPlayOnFirstEnter: false,
    skippable: true,
    steps: [
        { type: 'caption', text: 'Stand on the pressure plate' },
        { type: 'move-to', x: 305, y: 255, tolerance: 10 },
        { type: 'wait', ticks: 20 },
        { type: 'caption', text: 'Press LOOP to rewind — your echo will hold the plate' },
        { type: 'highlight-ui', target: 'r' },
        { type: 'wait', ticks: 40 },
        { type: 'press-key', key: 'r' },
        { type: 'highlight-ui', target: null },
        { type: 'wait-until', condition: 'door-open', doorId: 'd1', timeout: 240 },
        { type: 'caption', text: 'Walk through while your echo holds the door' },
        { type: 'move-to', x: 520, y: 250, tolerance: 16 },
        { type: 'caption', text: 'Pick up the package' },
        { type: 'highlight-ui', target: 'space' },
        { type: 'move-to', x: 585, y: 265, tolerance: 14 },
        { type: 'press-key', key: 'space' },
        { type: 'wait-until', condition: 'carrying', timeout: 90 },
        { type: 'highlight-ui', target: null },
        { type: 'caption', text: 'Deliver to the green zone' },
        { type: 'move-to', x: 200, y: 240, tolerance: 20 },
        { type: 'caption', text: 'Your turn' },
        { type: 'wait', ticks: 50 },
        { type: 'end' }
    ]
};

const LEVEL3_DEMO = {
    autoPlayOnFirstEnter: false,
    skippable: true,
    steps: [
        { type: 'caption', text: 'Cameras sweep a detection cone' },
        { type: 'wait', ticks: 30 },
        { type: 'move-to', x: 125, y: 265, tolerance: 8 },
        { type: 'wait', ticks: 20 },
        { type: 'caption', text: 'Time your crossing. Cover blocks the cone' },
        { type: 'highlight-ui', target: 'r' },
        { type: 'wait', ticks: 36 },
        { type: 'press-key', key: 'r' },
        { type: 'highlight-ui', target: null },
        { type: 'wait-until', condition: 'door-open', doorId: 'd1', timeout: 240 },
        { type: 'move-to', x: 240, y: 280, tolerance: 8 },
        { type: 'wait', ticks: 42 },
        { type: 'move-to', x: 400, y: 280, tolerance: 10 },
        { type: 'wait', ticks: 48 },
        { type: 'caption', text: 'Echoes trip cameras too — park them out of sight' },
        { type: 'move-to', x: 400, y: 450, tolerance: 10 },
        { type: 'caption', text: 'Your turn' },
        { type: 'wait', ticks: 36 },
        { type: 'end' }
    ]
};

const LEVEL4_DEMO = {
    autoPlayOnFirstEnter: false,
    skippable: true,
    steps: [
        { type: 'caption', text: 'Guard and camera share this yard' },
        { type: 'move-to', x: 130, y: 448, tolerance: 10 },
        { type: 'move-to', x: 105, y: 265, tolerance: 8 },
        { type: 'wait', ticks: 20 },
        { type: 'caption', text: 'Stack echoes: hold the door, then distract or wait' },
        { type: 'highlight-ui', target: 'r' },
        { type: 'wait', ticks: 36 },
        { type: 'press-key', key: 'r' },
        { type: 'highlight-ui', target: null },
        { type: 'wait-until', condition: 'door-open', doorId: 'd1', timeout: 300 },
        { type: 'move-to', x: 186, y: 280, tolerance: 8 },
        { type: 'wait', ticks: 158 },
        { type: 'move-to', x: 330, y: 280, tolerance: 8 },
        { type: 'move-to', x: 330, y: 480, tolerance: 10 },
        { type: 'caption', text: 'Your turn' },
        { type: 'wait', ticks: 28 },
        { type: 'end' }
    ]
};

const LEVEL5_DEMO = {
    autoPlayOnFirstEnter: false,
    skippable: true,
    steps: [
        { type: 'caption', text: 'Cracked floors collapse under weight. Cross them quickly' },
        { type: 'wait', ticks: 24 },
        { type: 'move-to', x: 80, y: 420, tolerance: 10 },
        { type: 'caption', text: 'Cracks cover both sides of the door. Cross before they give way' },
        { type: 'move-to', x: 250, y: 450, tolerance: 10 },
        { type: 'move-to', x: 90, y: 450, tolerance: 10 },
        { type: 'caption', text: 'Echoes fall too. Hold the door, then cross the cracks quickly' },
        { type: 'move-to', x: 125, y: 205, tolerance: 8 },
        { type: 'wait', ticks: 20 },
        { type: 'highlight-ui', target: 'r' },
        { type: 'wait', ticks: 28 },
        { type: 'press-key', key: 'r' },
        { type: 'highlight-ui', target: null },
        { type: 'wait', ticks: 150 },
        { type: 'caption', text: 'Your turn' },
        { type: 'wait', ticks: 30 },
        { type: 'end' }
    ]
};

const LEVEL6_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 50, y: 300 },
    deliveryZone: { x: 50, y: 240, w: 100, h: 100 },
    walls: [
        { x: 0, y: 170, w: 800, h: 20 },
        { x: 0, y: 360, w: 800, h: 20 },
        { x: 0, y: 0, w: 20, h: 600 },
        { x: 780, y: 0, w: 20, h: 600 },
        { x: 250, y: 170, w: 40, h: 80 },
        { x: 250, y: 330, w: 40, h: 50 },
        { x: 550, y: 170, w: 40, h: 80 },
        { x: 550, y: 330, w: 40, h: 50 }
    ],
    doors: [
        { x: 250, y: 250, w: 40, h: 80, id: "d1", type: "standard" },
        { x: 550, y: 250, w: 40, h: 80, id: "d2", type: "standard" }
    ],
    plates: [
        { x: 190, y: 200, linkedIds: ["d1"], id: "p1", type: "standard" },
        { x: 500, y: 200, linkedIds: ["d2"], id: "p2", type: "standard" }
    ],
    packages: [{ x: 650, y: 300, id: "pkg1", packageType: "standard", requiredForDelivery: true }],
    lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: []
};

const LEVEL7_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 80, y: 300 },
    deliveryZone: { x: 640, y: 250, w: 100, h: 100 },
    walls: [
        { x: 0, y: 0, w: 800, h: 20 },
        { x: 0, y: 580, w: 800, h: 20 },
        { x: 0, y: 0, w: 20, h: 600 },
        { x: 780, y: 0, w: 20, h: 600 },
        { x: 380, y: 20, w: 40, h: 200 },
        { x: 380, y: 380, w: 40, h: 200 }
    ],
    doors: [{ x: 380, y: 220, w: 40, h: 160, id: "d1", type: "standard" }],
    plates: [{ x: 140, y: 280, linkedIds: ["d1"], id: "p1", type: "standard" }],
    packages: [{ x: 200, y: 300, id: "pkg1", packageType: "heavy", requiredForDelivery: true }],
    lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: []
};

const LEVEL8_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 70, y: 280 },
    deliveryZone: { x: 640, y: 250, w: 100, h: 100 },
    walls: [
        { x: 0, y: 0, w: 800, h: 20 },
        { x: 0, y: 580, w: 800, h: 20 },
        { x: 0, y: 0, w: 20, h: 600 },
        { x: 780, y: 0, w: 20, h: 600 },
        { x: 380, y: 20, w: 40, h: 180 },
        { x: 380, y: 400, w: 40, h: 180 }
    ],
    doors: [{ x: 380, y: 200, w: 40, h: 200, id: "td1", type: "timer", openT: 90, closedT: 90 }],
    plates: [],
    packages: [{ x: 120, y: 300, id: "pkg1", packageType: "standard", requiredForDelivery: true }],
    lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: []
};

const LEVEL9_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 50, y: 300 },
    deliveryZone: { x: 50, y: 50, w: 100, h: 100 },
    walls: [
        { x: 0, y: 0, w: 800, h: 20 },
        { x: 0, y: 580, w: 800, h: 20 },
        { x: 0, y: 0, w: 20, h: 600 },
        { x: 780, y: 0, w: 20, h: 600 }
    ],
    doors: [],
    plates: [
        { x: 150, y: 300, linkedIds: ["ls1"], id: "p1", type: "standard" },
        { x: 400, y: 300, linkedIds: ["ls2"], id: "p2", type: "standard" }
    ],
    packages: [{ x: 700, y: 300, id: "pkg1", packageType: "fragile", requiredForDelivery: true }],
    lasers: [
        { x: 300, y: 20, w: 20, h: 560, id: "ls1" },
        { x: 550, y: 20, w: 20, h: 560, id: "ls2" }
    ],
    guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: []
};

const LEVEL6_DEMO = {
    autoPlayOnFirstEnter: false,
    skippable: true,
    steps: [
        { type: 'caption', text: 'Two doors. One echo cannot hold both' },
        { type: 'wait', ticks: 50 },
        { type: 'caption', text: 'Stand on the first plate' },
        { type: 'move-to', x: 195, y: 205, tolerance: 14 },
        { type: 'wait', ticks: 30 },
        { type: 'caption', text: 'Loop, then park a second echo on the far plate' },
        { type: 'wait', ticks: 55 },
        { type: 'caption', text: 'Both doors stay open. Walk the package back' },
        { type: 'wait', ticks: 50 },
        { type: 'caption', text: 'Your turn' },
        { type: 'wait', ticks: 40 },
        { type: 'end' }
    ]
};

const LEVEL7_DEMO = {
    autoPlayOnFirstEnter: false,
    skippable: true,
    steps: [
        { type: 'caption', text: 'Heavy cargo slows you down' },
        { type: 'wait', ticks: 40 },
        { type: 'caption', text: 'Stand on the plate before you drag' },
        { type: 'move-to', x: 145, y: 285, tolerance: 14 },
        { type: 'wait', ticks: 25 },
        { type: 'caption', text: 'Loop — your echo will hold the door' },
        { type: 'highlight-ui', target: 'r' },
        { type: 'wait', ticks: 35 },
        { type: 'press-key', key: 'r' },
        { type: 'highlight-ui', target: null },
        { type: 'wait-until', condition: 'door-open', doorId: 'd1', timeout: 240 },
        { type: 'caption', text: 'Grab the heavy package' },
        { type: 'highlight-ui', target: 'space' },
        { type: 'move-to', x: 196, y: 300, tolerance: 12 },
        { type: 'press-key', key: 'space' },
        { type: 'wait-until', condition: 'carrying', timeout: 90 },
        { type: 'highlight-ui', target: null },
        { type: 'caption', text: 'Drag through while the echo holds' },
        { type: 'move-to', x: 340, y: 280, tolerance: 18 },
        { type: 'caption', text: 'Your turn' },
        { type: 'wait', ticks: 40 },
        { type: 'end' }
    ]
};

const LEVEL8_DEMO = {
    autoPlayOnFirstEnter: false,
    skippable: true,
    steps: [
        { type: 'caption', text: 'This door cycles on a timer' },
        { type: 'wait', ticks: 40 },
        { type: 'caption', text: 'Grab the package' },
        { type: 'highlight-ui', target: 'space' },
        { type: 'move-to', x: 115, y: 295, tolerance: 14 },
        { type: 'press-key', key: 'space' },
        { type: 'wait-until', condition: 'carrying', timeout: 90 },
        { type: 'highlight-ui', target: null },
        { type: 'caption', text: 'Wait for the gate to open' },
        { type: 'move-to', x: 330, y: 280, tolerance: 16 },
        { type: 'wait-until', condition: 'door-open', doorId: 'td1', timeout: 240 },
        { type: 'caption', text: 'Cross while it is open' },
        { type: 'move-to', x: 480, y: 280, tolerance: 18 },
        { type: 'caption', text: 'Your turn' },
        { type: 'wait', ticks: 40 },
        { type: 'end' }
    ]
};

const LEVEL9_DEMO = {
    autoPlayOnFirstEnter: false,
    skippable: true,
    steps: [
        { type: 'caption', text: 'Lasers vaporize fragile cargo' },
        { type: 'wait', ticks: 40 },
        { type: 'caption', text: 'Stand on the first plate to clear a beam' },
        { type: 'move-to', x: 155, y: 305, tolerance: 14 },
        { type: 'wait', ticks: 25 },
        { type: 'caption', text: 'Loop — your echo holds the plate' },
        { type: 'highlight-ui', target: 'r' },
        { type: 'wait', ticks: 35 },
        { type: 'press-key', key: 'r' },
        { type: 'highlight-ui', target: null },
        { type: 'wait-until', condition: 'ghost-on-plate', plateId: 'p1', timeout: 240 },
        { type: 'caption', text: 'Walk to the second plate while the laser is clear' },
        { type: 'move-to', x: 405, y: 305, tolerance: 14 },
        { type: 'wait', ticks: 30 },
        { type: 'caption', text: 'Echo-hold both plates before carrying fragile cargo' },
        { type: 'wait', ticks: 45 },
        { type: 'caption', text: 'Your turn' },
        { type: 'wait', ticks: 40 },
        { type: 'end' }
    ]
};

export function cloneDemo(demo) {
    if (!demo || typeof demo !== 'object') return undefined;
    let steps = [];
    if (Array.isArray(demo.steps)) {
        try { steps = JSON.parse(JSON.stringify(demo.steps)); }
        catch { steps = []; }
    }
    return {
        autoPlayOnFirstEnter: demo.autoPlayOnFirstEnter !== false,
        skippable: demo.skippable !== false,
        steps
    };
}

export const LEVELS = [
    { name: "First Shift", story: { speaker: "ChronoHaul Dispatch", text: "Courier 83-A, first shift on the floor. That plate holds the door, but you cannot stand on it and walk through. Leave an echo on the plate. The echo is company property. Move the parcel." }, obj: "Stand on the plate and loop. Your echo holds the door while you deliver the package.", maxGhosts: 1, loopTime: 20, par: 2, mapWidth: 800, mapHeight: 600, layout: W1_L1_LAYOUT, demo: LEVEL1_DEMO, demos: { intro: LEVEL1_DEMO } },
    { name: "Return Trip", story: { speaker: "ChronoHaul Dispatch", text: "Parcel and drop zone share this bay. The plate sits down a dead-end you only reach after the package corridor. Record the plate first. Fetch the box first and nobody is left holding the door." }, obj: "Loop on the alcove plate first, then carry the package through. Fetching first leaves the door unheld.", maxGhosts: 1, loopTime: 20, par: 2, mapWidth: 800, mapHeight: 600, layout: W1_L2_LAYOUT },
    { name: "Shift Change", story: { speaker: "ChronoHaul Dispatch", text: "Gate T cycles open two seconds, shut three, on the depot clock. Your echo has to still be on the plate when that window opens. Walk off early and the plate door is shut when the timer lets you through." }, obj: "Keep the echo on the plate through the loop. Cross the timer door in its second open window.", maxGhosts: 1, loopTime: 18, par: 2, mapWidth: 800, mapHeight: 600, layout: W1_L3_LAYOUT },
    { name: "Airlock Relay", story: { speaker: "ChronoHaul Dispatch", text: "Two airlocks, one timer, two echoes. Door A shuts the moment its plate is empty, so one recording cannot hold A and reach plate B. Park an echo on A, park the next on B, and carry the parcel through on the timer's window. Three loops. No spare timeline." }, obj: "Park an echo on plate A, then one on plate B. Carry the package through both doors and the timer.", maxGhosts: 2, loopTime: 25, par: 3, mapWidth: 800, mapHeight: 600, layout: W1_L4_LAYOUT },
    { name: "Gatekeeper", isBoss: true, bossIntro: { speaker: "GATEKEEPER", text: "Audit sequence armed. Three plates. Three beats. An empty plate locks its door. Fill them in order or the vault stays shut." }, story: { speaker: "ChronoHaul Dispatch", text: "The Gatekeeper audits three plates on a fixed beat. Be on the right plate at the right beat or that door locks for the loop. Break all three shields and the vault opens." }, obj: "Echo on g1 by the first audit, echo on g2 by the second, you on g3 at the third. Deliver from the vault.", maxGhosts: 2, loopTime: 24, par: 3, mapWidth: 800, mapHeight: 600, layout: W1_MB_LAYOUT },
    ...W2_LEVELS,
    { name: "Level 3: Sweep Coverage", voiceKey: "level-2-story", story: { speaker: "Sector Surveillance", text: "Camera grid online in Transit Spur C. Cloak is still locked behind procurement. Time the cone, use cover, and remember: discarded timelines trip the same sensors you do." }, obj: "One camera. Cross on the gap in the sweep. Echoes trigger cameras too.", challenge: { desc: "Finish in 3 loops or fewer", check: () => finishedWithinLoops(state.loopNumber, 3) }, maxGhosts: 2, mapWidth: 800, mapHeight: 600, layout: LEVEL3_LAYOUT, demos: { intro: LEVEL3_DEMO } },
    { name: "Level 4: Overlapping Watch", voiceKey: "level-3-story", story: { speaker: "Local Hub Manager", text: "They stacked a patrol and a camera on the same corridor. Budget says that is your problem. Coordinate echoes and keep the parcel moving." }, obj: "Guard and camera together. Hold the door, avoid both sensors, deliver.", challenge: { desc: "Finish in 3 loops or fewer", check: () => finishedWithinLoops(state.loopNumber, 3) }, maxGhosts: 2, mapWidth: 800, mapHeight: 600, layout: LEVEL4_LAYOUT, demos: { intro: LEVEL4_DEMO } },
    { name: "Level 5: Unstable Deck", voiceKey: "level-4-story", story: { speaker: "ChronoHaul Dispatch", text: "Maintenance skipped the subfloor again. Cracked plating covers both sides of the door and collapses under courier mass. Dash implants are paywalled. Hold the door with an echo and cross the cracks quickly." }, obj: "Cracks cover both sides of the door. Echo-hold the door and cross the cracks quickly.", challenge: { desc: "Finish in 2 loops or fewer", check: () => finishedWithinLoops(state.loopNumber, 2) }, maxGhosts: 2, mapWidth: 800, mapHeight: 600, layout: LEVEL5_LAYOUT, demos: { intro: LEVEL5_DEMO } },
    { name: "Level 6: Dual Airlock", voiceKey: "level-5-story", story: { speaker: "ChronoHaul Dispatch", text: "Courier 83-A, double-echo clearance is live on this airlock. Two doors, two timelines. One logistics artifact cannot hold both gates. Park an echo on each plate and walk the parcel back." }, obj: "Two doors. Park an echo on each plate, then bring the package back.", challenge: { desc: "Finish in 3 loops or fewer", check: () => finishedWithinLoops(state.loopNumber, 3) }, maxGhosts: 2, mapWidth: 800, mapHeight: 600, layout: LEVEL6_LAYOUT, demos: { intro: LEVEL6_DEMO } },
    { name: "Level 7: Heavy Lifting", voiceKey: "level-6-story", story: { speaker: "Local Hub Manager", text: "High-density cargo on your lane. Pick it up and your pace is cut in half. Loop an echo onto the plate before you start dragging, then haul the parcel through the door." }, obj: "Heavy package slows you. Echo holds the door; you drag the cargo through.", challenge: { desc: "Finish in 3 loops or fewer", check: () => finishedWithinLoops(state.loopNumber, 3) }, maxGhosts: 2, mapWidth: 800, mapHeight: 600, layout: LEVEL7_LAYOUT, demos: { intro: LEVEL7_DEMO } },
    { name: "Level 8: Timed Gate", voiceKey: "level-7-story", story: { speaker: "Sector Surveillance", text: "Gate TD-1 is locked to a maintenance cycle. Plates are offline in this spur. The door opens and shuts on its own clock. Cross with the parcel while the gate is open." }, obj: "Timer door cycles open and shut. Carry the package through while it is open.", challenge: { desc: "Finish in 2 loops or fewer", check: () => finishedWithinLoops(state.loopNumber, 2) }, maxGhosts: 2, mapWidth: 800, mapHeight: 600, layout: LEVEL8_LAYOUT, demos: { intro: LEVEL8_DEMO } },
    { name: "Level 9: Fragile Grid", voiceKey: "level-8-story", story: { speaker: "Local Hub Manager", text: "Class-4 fragile tech on this manifest. The laser grid vaporizes it on contact, and a live beam will burn you too. Hold both plates with echoes, then walk the cargo to the zone." }, obj: "Lasers vaporize fragile cargo. Echo-hold both plates, then deliver.", challenge: { desc: "Finish in 3 loops or fewer", check: () => finishedWithinLoops(state.loopNumber, 3) }, maxGhosts: 3, mapWidth: 800, mapHeight: 600, layout: LEVEL9_LAYOUT, demos: { intro: LEVEL9_DEMO } },

    { name: "Level 10: Fast Shipping", voiceKey: "level-9-story", grants: ['toss'], story: { speaker: "ChronoHaul Dispatch", text: "Critical: Package is highly unstable. Detonation sequence activates upon handling. The company expects immediate delivery. Do not fail." }, obj: "Timed packages explode! Toss them over the gap instantly.", challenge: { desc: "Do NOT use Dash", check: () => state.runStats.dashes === 0 }, maxGhosts: 2, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600)]; cracks=[]; for(let i=20;i<580;i+=40) cracks.push(new CrackedFloor(380,i,40,40)); packages=[new Package('pkg1',100,300,'timed')]; doors=[]; plates=[]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; robots=[]; projectiles=[]; gatekeepers=[]; } },
    { name: "Level 11: Time Dilation", voiceKey: "level-10-story", story: { speaker: "Unknown Hacker [Encrypted]", text: "They're trapping your discarded timelines in these Static Zones. The purple fields literally harvest temporal energy by slowing your echoes down. They're farming you." }, obj: "Static Zones slow ghost playback. Squeeze your execution.", challenge: { desc: "No Alarms Triggered", check: () => state.runStats.alarms === 0 }, maxGhosts: 3, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600), new Wall(450,20,40,180), new Wall(450,400,40,180), new Wall(550,20,40,180), new Wall(550,400,40,180)]; statics=[new StaticZone(200,20,200,560)]; doors=[new TimerDoor('td1',450,200,40,200,60,60)]; doors.push(new Door('d1', 550, 200, 40, 200)); plates=[new PressurePlate('p1', 300, 450, 'd1')]; packages=[new Package('pkg1',100,100)]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; cracks=[]; robots=[]; projectiles=[]; gatekeepers=[]; } },

    { name: "Level 12: Danger Courier", voiceKey: "level-11-story", bossVoiceKey: "level-11-boss-intro", isBoss: true, grants: ['toss'], bossIntro: { speaker: "EXTERMINATOR UNIT XR-9", text: "Unauthorized courier detected. Temporal theft in progress. Arena lockdown lifted. Commencing extermination sweep." }, bossIntroDoorId: 'boss_intro_door', story: { speaker: "Unknown Hacker [Encrypted]", text: "ChronoHaul deployed an Exterminator robot to stop you. It has kill authorization. Throw Heavy Packages to breach its armor (3 hits). Then deliver the final Fragile Artifact!" }, obj: "Defeat the Security Robot! Toss packages to damage it (3 Hits).", challenge: { desc: "Finish in 1 loop (No Ghosts!)", check: () => finishedWithinLoops(state.loopNumber, 1) }, maxGhosts: 2, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(550,0,40,250),new Wall(550,350,40,250),new Wall(320,20,40,120),new Wall(440,20,40,120),new Wall(320,20,160,40)]; doors=[new Door('boss_door',550,250,40,100),new Door('boss_intro_door',360,100,80,40)]; robots=[new ShooterRobot([{x:390,y:60},{x:390,y:220},{x:250,y:220},{x:250,y:450},{x:450,y:450},{x:450,y:220}])]; robots[0].engaged = false; robots[0].isEmerging = false; robots[0].emergeUntilPathIndex = 2; lasers=[]; plates=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[]; packages=[new Package('ammo1',150,100,'heavy',false),new Package('ammo2',150,500,'heavy',false),new Package('ammo3',350,500,'heavy',false),new Package('pkg1',50,100,'fragile')]; projectiles=[]; gatekeepers=[]; } },
    { name: "Dev Sandbox", voiceKey: "level-12-story", isSandbox: true, crackSpeed: 'fast', mapWidth: 1600, mapHeight: 1200, grants: ['dash', 'toss', 'cloak', 'ghostShield'], story: { speaker: "CHRONOHAUL LAB", text: "Sandbox range online. Map is oversized — the camera follows you. Every tool is granted. Walk the hall to exercise doors, plates, packages, lasers, cameras, guards, drones, winds, static, cracks, and the robot." }, obj: "Dev sandbox: oversized map with a sample of every entity. Camera follows the courier.", challenge: { desc: "Sandbox", check: () => false }, maxGhosts: 3, loopTime: 20, setup: setupDevSandbox }
];

// #47 shipped these after the sandbox as pending. They are World 2 now, so they
// count in the campaign. voiceKey misses the manifest and will not play another level's clip.
W2_LEVELS.forEach((level, i) => {
    level.isPendingCampaign = false;
    if (!level.voiceKey) level.voiceKey = `w2-${i}-story`;
    if (level.isBoss && !level.bossVoiceKey) level.bossVoiceKey = `w2-${i}-boss-intro`;
});

for (const level of LEVELS) installParChallenge(level);

for (const world of WORLDS) {
    for (const idx of world.levels) {
        const level = LEVELS[idx];
        if (!level) continue;
        // Keep per-level world/unlocks already set by world content (W2). Fill the rest from WORLDS.
        if (level.world == null) level.world = world.id;
        if (!Array.isArray(level.unlocks)) level.unlocks = [...world.unlocks];
    }
}

export function getWorldForLevel(idx) {
    return WORLDS.find(world => world.levels.includes(idx)) || null;
}

export function getWorldUnlockedAbilities(idx) {
    const world = getWorldForLevel(idx);
    if (!world) return null;
    return getWorldUnlockedAbilitiesForWorld(world.id);
}

// Abilities unlocked by world `worldId` and every earlier world, plus optional extra unlocks.
export function getWorldUnlockedAbilitiesForWorld(worldId, extraUnlocks = []) {
    const world = WORLDS.find(w => w.id === worldId);
    if (!world) return null;
    const unlocked = [];
    for (const entry of WORLDS) {
        if (entry.id > world.id) continue;
        for (const ability of entry.unlocks) {
            if (!unlocked.includes(ability)) unlocked.push(ability);
        }
    }
    for (const ability of extraUnlocks || []) {
        if (!unlocked.includes(ability)) unlocked.push(ability);
    }
    return unlocked;
}

export function normalizeWorldId(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}

export function getShopUnlockedAbilities(maxUnlockedLevel) {
    const unlocked = [];
    for (const entry of WORLDS) {
        const first = entry.levels[0];
        if (first === undefined || first > maxUnlockedLevel) continue;
        for (const ability of entry.unlocks) {
            if (!unlocked.includes(ability)) unlocked.push(ability);
        }
    }
    return unlocked;
}

export const CAMPAIGN_LEVEL_COUNT = LEVELS.filter(level => !level.isSandbox && !level.isPlaytest && !level.isPendingCampaign).length;
export const SANDBOX_LEVEL_INDEX = LEVELS.findIndex(level => level.isSandbox);

// Robot config that differs from ShooterRobot defaults (only written when non-default).
const ROBOT_DEFAULTS = { engaged: true, isEmerging: false, emergeUntilPathIndex: 0, fireCooldown: 0, hp: 3 };
function serializeRobot(r) {
    const out = { path: r.path || [{ x: r.x, y: r.y }] };
    for (const [k, def] of Object.entries(ROBOT_DEFAULTS)) {
        if (r[k] !== undefined && r[k] !== def) out[k] = r[k];
    }
    return out;
}
function deserializeRobot(r) {
    const path = r.path || [{ x: r.x, y: r.y }];
    const robot = new ShooterRobot(path.length ? path : [{ x: 50, y: 50 }]);
    for (const k of Object.keys(ROBOT_DEFAULTS)) {
        if (r[k] !== undefined) robot[k] = r[k];
    }
    return robot;
}

function serializeBurrower(b) {
    const out = {
        x: b.startX ?? b.x,
        y: b.startY ?? b.y,
        w: b.w,
        h: b.h,
        id: b.id,
        hp: b.maxHp ?? b.hp ?? 3,
        surfaceInterval: b.surfaceInterval,
        telegraphTime: b.telegraphTime,
        stunTime: b.stunTime,
        corePlateIds: [...(b.corePlateIds || [])],
        defeatDoorId: b.defeatDoorId || 'boss_door'
    };
    const cap = normalizeMaxStunsPerLoop(b.maxStunsPerLoop);
    if (cap != null) out.maxStunsPerLoop = cap;
    return out;
}
function deserializeBurrower(b) {
    return new Burrower(b.x || 0, b.y || 0, {
        w: b.w, h: b.h, id: b.id, hp: b.hp,
        surfaceInterval: b.surfaceInterval,
        telegraphTime: b.telegraphTime,
        stunTime: b.stunTime,
        maxStunsPerLoop: b.maxStunsPerLoop,
        corePlateIds: b.corePlateIds,
        defeatDoorId: b.defeatDoorId
    });
}

function serializeGatekeeper(g) {
    const audits = (g.audits || []).map(a => ({
        plateId: a.plateId == null ? '' : String(a.plateId),
        tick: Number(a.tick)
    })).filter(a => Number.isFinite(a.tick));
    const out = {
        id: g.id,
        x: g.x,
        y: g.y,
        audits,
        vaultDoorId: g.vaultDoorId == null ? '' : String(g.vaultDoorId)
    };
    const shields = Number.isFinite(Number(g.maxShields)) ? Math.max(0, Math.floor(Number(g.maxShields))) : g.shields;
    if (shields !== audits.length) out.shields = shields;
    return out;
}

function deserializeGatekeeper(raw) {
    const g = raw || {};
    const opts = { audits: g.audits || [], vaultDoorId: g.vaultDoorId || '' };
    if (Object.prototype.hasOwnProperty.call(g, 'shields')) opts.shields = g.shields;
    return new Gatekeeper(g.id, g.x, g.y, opts);
}

// Boss/challenge level config shared by serialize, deserialize and the editor.
// challengeRef names the campaign level whose code-defined challenge applies (challenges are functions).
export const BOSS_META_KEYS = ['isBoss', 'bossIntro', 'bossIntroDoorId', 'challengeRef'];
export function copyBossMeta(from, to) {
    if (from?.isBoss) to.isBoss = true;
    if (from?.bossIntro && (from.bossIntro.speaker || from.bossIntro.text)) {
        to.bossIntro = { speaker: from.bossIntro.speaker || '', text: from.bossIntro.text || '' };
    }
    if (from?.bossIntroDoorId) to.bossIntroDoorId = String(from.bossIntroDoorId);
    if (from?.challengeRef) to.challengeRef = String(from.challengeRef);
    return to;
}
export function getChallengeByRef(ref) {
    return LEVELS.find(l => l.name === ref && l.challenge)?.challenge || null;
}

function withMapSize(entities, size) {
    return { ...entities, mapWidth: size.mapWidth, mapHeight: size.mapHeight };
}

function specifiedCrackSpeed(data) {
    if (!data || typeof data !== 'object') return null;
    const metaHas = !!(data.meta && Object.prototype.hasOwnProperty.call(data.meta, 'crackSpeed'));
    const topHas = Object.prototype.hasOwnProperty.call(data, 'crackSpeed');
    if (!metaHas && !topHas) return null;
    const raw = metaHas ? data.meta.crackSpeed : data.crackSpeed;
    return raw === 'fast' ? 'fast' : 'normal';
}

function crackSpeedFromMeta(meta, fallback) {
    const raw = meta && Object.prototype.hasOwnProperty.call(meta, 'crackSpeed') ? meta.crackSpeed : fallback;
    return raw === 'fast' ? 'fast' : 'normal';
}

export function serializeLevel(src = state) {
    const size = layoutMapSize(src, src);
    const m = src.meta || src.editorLevelMeta || (typeof state !== 'undefined' ? state.editorLevelMeta : null);
    const demo = cloneDemo(src.demo || m?.demo);
    const payload = {
        width: size.mapWidth,
        height: size.mapHeight,
        mapWidth: size.mapWidth,
        mapHeight: size.mapHeight,
        player: src.player ? { x: src.player.x, y: src.player.y } : { x: 50, y: 50 },
        deliveryZone: src.deliveryZone
            ? { x: src.deliveryZone.x, y: src.deliveryZone.y, w: src.deliveryZone.w, h: src.deliveryZone.h }
            : { x: 650, y: 300, w: 100, h: 100 },
        walls: (src.walls || []).map(w => ({ x: w.x, y: w.y, w: w.w, h: w.h })),
        doors: (src.doors || []).map(d => ({
            x: d.x, y: d.y, w: d.w, h: d.h, id: d.id,
            type: (d instanceof AlarmDoor) ? 'alarm' : (d instanceof TimerDoor) ? 'timer' : 'standard',
            openT: d.openT, closedT: d.closedT
        })),
        plates: (src.plates || []).map(p => ({
            x: p.x, y: p.y, linkedIds: p.linkedIds, id: p.id,
            type: (p instanceof TemporalPlate) ? 'temporal' : 'standard',
            requiredTimeline: p.requiredTimeline
        })),
        hints: (src.hints || []).map(h => {
            const out = { id: h.id, x: h.x, y: h.y, autoOpen: !!h.autoOpen, title: h.title || '' };
            if (h.demoId) out.demoId = h.demoId;
            if (h.demo && h.demo.steps) out.demo = cloneDemo(h.demo);
            return out;
        }),
        packages: (src.packages || []).map(p => ({
            x: p.startX ?? p.x, y: p.startY ?? p.y, id: p.id,
            packageType: p.type, requiredForDelivery: p.requiredForDelivery !== false
        })),
        lasers: (src.lasers || []).map(l => ({ x: l.x, y: l.y, w: l.w, h: l.h, id: l.id })),
        guards: (src.guards || []).map(g => ({ path: g.points || g.path || [{ x: g.x, y: g.y }] })),
        cameras: (src.cameras || []).map(c => ({ x: c.x, y: c.y, baseAngle: c.baseAngle, sweepRange: c.sweepRange })),
        drones: (src.drones || []).map(d => ({ path: d.points || d.path || [{ x: d.x, y: d.y }] })),
        winds: (src.winds || []).map(w => ({ x: w.x, y: w.y, w: w.w, h: w.h, vx: w.vx, vy: w.vy })),
        statics: (src.statics || []).map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
        cracks: (src.cracks || []).map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h })),
        robots: (src.robots || []).map(serializeRobot),
        burrowers: (src.burrowers || []).map(serializeBurrower),
        gatekeepers: (src.gatekeepers || []).map(serializeGatekeeper),
        crackSpeed: crackSpeedFromMeta(m, src.crackSpeed)
    };
    if (demo) payload.demo = demo;
    const demosSrc = src.demos || m?.demos;
    if (demosSrc && typeof demosSrc === 'object') {
        const demos = {};
        for (const [k, v] of Object.entries(demosSrc)) {
            const c = cloneDemo(v);
            if (c) demos[k] = c;
        }
        if (Object.keys(demos).length) payload.demos = demos;
    }
    if (m) {
        payload.meta = {
            name: m.name || 'Editor Level',
            story: { speaker: m.story?.speaker || '', text: m.story?.text || '' },
            obj: m.obj || '',
            grants: [...(m.grants || [])],
            maxGhosts: m.maxGhosts ?? 3,
            crackSpeed: payload.crackSpeed
        };
        const loopTime = normalizeLoopTime(m.loopTime);
        if (loopTime != null) payload.meta.loopTime = loopTime;
        const par = normalizePar(m.par);
        if (par != null) payload.meta.par = par;
        const worldId = normalizeWorldId(m.world);
        if (worldId != null) payload.meta.world = worldId;
        if (Array.isArray(m.unlocks)) payload.meta.unlocks = [...m.unlocks];
        copyBossMeta(m, payload.meta);
        if (demo) payload.meta.demo = demo;
    }
    return payload;
}

export function deserializeLevel(data) {
    data = data || {};
    const size = layoutMapSize(data);
    player = new PlayerEntity(data.player?.x || 50, data.player?.y || 50, 30, 30, 'player');
    deliveryZone = new DeliveryZone(data.deliveryZone?.x || 650, data.deliveryZone?.y || 300, data.deliveryZone?.w || 100, data.deliveryZone?.h || 100);
    
    walls = (data.walls||[]).map(w => new Wall(w.x, w.y, w.w, w.h));
    doors = (data.doors||[]).map(d => {
        if (d.type === 'alarm') return new AlarmDoor(d.id, d.x, d.y, d.w, d.h);
        if (d.type === 'timer') return new TimerDoor(d.id, d.x, d.y, d.w, d.h, d.openT ?? 60, d.closedT ?? 60);
        return new Door(d.id, d.x, d.y, d.w, d.h);
    });
    plates = (data.plates||[]).map(p => {
        if (p.type === 'temporal') return new TemporalPlate(p.id, p.x, p.y, p.linkedIds, p.requiredTimeline);
        return new PressurePlate(p.id, p.x, p.y, p.linkedIds);
    });
    hints = (data.hints||[]).map(h => new HintPlate(h.id || ('hint_'+Math.random().toString(36).slice(2,7)), h.x||0, h.y||0, {
        demoId: h.demoId || null,
        demo: h.demo ? cloneDemo(h.demo) : null,
        autoOpen: !!h.autoOpen,
        title: h.title || 'Demo Hint'
    }));
    packages = (data.packages||[]).map(p => new Package(p.id, p.x, p.y, p.packageType || 'standard', p.requiredForDelivery !== false));
    lasers = (data.lasers||[]).map(l => new Laser(l.id, l.x, l.y, l.w, l.h));
    guards = (data.guards||[]).map(g => {
        const path = g.path || g.points || [{ x: g.x, y: g.y }];
        return new Guard(path.length ? path : [{ x: 50, y: 50 }]);
    });
    cameras = (data.cameras||[]).map(c => new SweepCamera(c.x, c.y, c.baseAngle ?? 0, c.sweepRange ?? Math.PI/2));
    drones = (data.drones||[]).map(d => {
        const path = d.path || d.points || [{ x: d.x, y: d.y }];
        return new Drone(path.length ? path : [{ x: 50, y: 50 }]);
    });
    winds = (data.winds||[]).map(w => new WindTunnel(w.x, w.y, w.w, w.h, w.vx, w.vy));
    statics = (data.statics||[]).map(s => new StaticZone(s.x, s.y, s.w, s.h));
    const crackSpeed = specifiedCrackSpeed(data);
    cracks = (data.cracks||[]).map(c => new CrackedFloor(c.x, c.y, c.w, c.h, crackSpeed || undefined));
    robots = (data.robots||[]).map(deserializeRobot);
    burrowers = (data.burrowers||[]).map(deserializeBurrower);
    gatekeepers = (data.gatekeepers||[]).map(deserializeGatekeeper);
    projectiles = [];

    const demo = cloneDemo(data.demo || data.meta?.demo);
    if (typeof state !== 'undefined') {
        if (data.meta) {
            state.editorLevelMeta = {
                name: data.meta.name || 'Editor Level',
                story: { speaker: data.meta.story?.speaker || '', text: data.meta.story?.text || '' },
                obj: data.meta.obj || '',
                grants: [...(data.meta.grants || [])],
                maxGhosts: data.meta.maxGhosts ?? 3,
                crackSpeed: crackSpeed || 'normal',
                demo
            };
            const loopTime = normalizeLoopTime(data.meta.loopTime);
            if (loopTime != null) state.editorLevelMeta.loopTime = loopTime;
            const par = normalizePar(data.meta.par);
            if (par != null) state.editorLevelMeta.par = par;
            const worldId = normalizeWorldId(data.meta.world);
            if (worldId != null) state.editorLevelMeta.world = worldId;
            if (Array.isArray(data.meta.unlocks)) state.editorLevelMeta.unlocks = [...data.meta.unlocks];
            copyBossMeta(data.meta, state.editorLevelMeta);
        } else if (demo || crackSpeed) {
            if (!state.editorLevelMeta) {
                state.editorLevelMeta = {
                    name: 'Editor Level',
                    story: { speaker: '', text: '' },
                    obj: '',
                    grants: [],
                    maxGhosts: 3,
                    crackSpeed: 'normal'
                };
            }
            if (demo) state.editorLevelMeta.demo = demo;
            if (crackSpeed) state.editorLevelMeta.crackSpeed = crackSpeed;
        }
    }
    
    return withMapSize({ player, deliveryZone, walls, doors, plates, hints, packages, lasers, guards, cameras, drones, winds, statics, cracks, robots, burrowers, gatekeepers, projectiles }, size);
}

export function getLevelSetup(index) {
    if (!LEVELS[index]) return null;
    const level = LEVELS[index];
    const size = { mapWidth: level.mapWidth || DEFAULT_MAP_WIDTH, mapHeight: level.mapHeight || DEFAULT_MAP_HEIGHT };
    
    if (level.setup) {
        gatekeepers = [];
        level.setup();
        hints = [];
        burrowers = [];
        if (level.crackSpeed === 'fast' || level.crackSpeed === 'normal') {
            for (const c of cracks) if (c && typeof c.setCrackSpeed === 'function') c.setCrackSpeed(level.crackSpeed);
        }
        return withMapSize({
            player, deliveryZone, walls, doors, plates, hints, packages,
            lasers, guards, cameras, drones, winds, statics, cracks,
            robots, burrowers, gatekeepers, projectiles
        }, size);
    } else if (level.layout) {
        const payload = { ...level.layout, ...size, demos: level.demos, demo: level.demo };
        if (level.crackSpeed === 'fast' || level.crackSpeed === 'normal') payload.crackSpeed = level.crackSpeed;
        const data = deserializeLevel(payload);
        if (level.demos && typeof state !== 'undefined') {
            state.levelDemos = Object.fromEntries(Object.entries(level.demos).map(([k,v]) => [k, cloneDemo(v)]).filter(([,v]) => v));
        }
        return data;
    }
}


export function loadCustomLevel(jsonString) {
    try {
        let layout = JSON.parse(jsonString);
        return deserializeLevel(layout);
    } catch(e) { console.error("Could not parse JSON map."); return null; }
}
