import { state } from '../core/state.js';
import { PlayerEntity } from '../entities/actors.js';
import { Package, PressurePlate, TemporalPlate, Door, AlarmDoor, TimerDoor, Wall, HintPlate } from '../entities/interactables.js';
import { Laser, SweepCamera, Drone, Guard, WindTunnel, StaticZone, CrackedFloor, ShooterRobot, LaserProjectile, Pit } from '../entities/hazards.js';
import { DeliveryZone } from '../entities/zones.js';
import { DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT } from '../core/camera.js';

let player, deliveryZone, walls, doors, plates, hints, packages, lasers, guards, cameras, drones, winds, statics, cracks, robots, projectiles;

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
    for (let i = 0; i < 6; i++) cracks.push(new CrackedFloor(80 + i * 40, 940, 40, 80));
    robots = [new ShooterRobot([{ x: 1320, y: 1040 }, { x: 1480, y: 1040 }])];
    robots[0].engaged = true;
    robots[0].fireCooldown = 90;
    projectiles = [];
}

const LEVEL1_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 170, y: 240 },
    deliveryZone: { x: 50, y: 220, w: 100, h: 100 },
    walls: [
        { x: 40, y: 180, w: 700, h: 20 },
        { x: 40, y: 340, w: 700, h: 20 },
        { x: 0, y: 170, w: 40, h: 200 },
        { x: 740, y: 170, w: 40, h: 200 }
    ],
    doors: [{ x: 380, y: 200, w: 40, h: 150, id: "d1", type: "standard" }],
    plates: [{ x: 300, y: 250, linkedIds: ["d1"], id: "p1", type: "standard" }],
    packages: [{ x: 600, y: 280, id: "pkg1", packageType: "standard", requiredForDelivery: true }],
    lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: [],
    hints: [{ id: "hint_intro", x: 220, y: 290, demoId: "intro", autoOpen: false, title: "Ghost Hold" }]
};

const LEVEL2_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 70, y: 280 },
    deliveryZone: { x: 640, y: 240, w: 100, h: 100 },
    walls: [
        { x: 0, y: 0, w: 800, h: 20 },
        { x: 0, y: 580, w: 800, h: 20 },
        { x: 0, y: 0, w: 20, h: 600 },
        { x: 780, y: 0, w: 20, h: 600 },
        { x: 340, y: 20, w: 40, h: 220 },
        { x: 340, y: 340, w: 40, h: 240 }
    ],
    doors: [{ x: 340, y: 240, w: 40, h: 100, id: "d1", type: "standard" }],
    plates: [{ x: 120, y: 260, linkedIds: ["d1"], id: "p1", type: "standard" }],
    packages: [{ x: 200, y: 360, id: "pkg1", packageType: "standard", requiredForDelivery: true }],
    lasers: [],
    guards: [{ path: [{ x: 520, y: 120 }, { x: 520, y: 420 }] }],
    cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: [],
    hints: [{ id: "hint_intro", x: 70, y: 360, demoId: "intro", autoOpen: false, title: "Security Guard" }]
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
    drones: [], winds: [], statics: [], cracks: [], robots: [],
    hints: [{ id: "hint_intro", x: 70, y: 360, demoId: "intro", autoOpen: false, title: "Sweep Camera" }]
};

const LEVEL4_LAYOUT = {
    width: 800, height: 600, mapWidth: 800, mapHeight: 600,
    player: { x: 60, y: 480 },
    deliveryZone: { x: 640, y: 60, w: 100, h: 100 },
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
    drones: [], winds: [], statics: [], cracks: [], robots: [],
    hints: [{ id: "hint_intro", x: 60, y: 360, demoId: "intro", autoOpen: false, title: "Combined Security" }]
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
    robots: [],
    hints: [{ id: "hint_intro", x: 60, y: 360, demoId: "intro", autoOpen: false, title: "Unstable Floor" }]
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

const LEVEL2_DEMO = {
    autoPlayOnFirstEnter: false,
    skippable: true,
    steps: [
        { type: 'caption', text: 'Guards spot anything in their vision cone' },
        { type: 'wait', ticks: 55 },
        { type: 'caption', text: 'Wait for a gap — or send an echo to distract them' },
        { type: 'wait', ticks: 60 },
        { type: 'caption', text: 'Echo holds the door while you slip past' },
        { type: 'wait', ticks: 50 },
        { type: 'end' }
    ]
};

const LEVEL3_DEMO = {
    autoPlayOnFirstEnter: false,
    skippable: true,
    steps: [
        { type: 'caption', text: 'Cameras sweep a detection cone' },
        { type: 'wait', ticks: 50 },
        { type: 'caption', text: 'Time your crossing. Cover blocks the cone' },
        { type: 'wait', ticks: 55 },
        { type: 'caption', text: 'Echoes trip cameras too — park them out of sight' },
        { type: 'wait', ticks: 55 },
        { type: 'end' }
    ]
};

const LEVEL4_DEMO = {
    autoPlayOnFirstEnter: false,
    skippable: true,
    steps: [
        { type: 'caption', text: 'Guard and camera share this yard' },
        { type: 'wait', ticks: 50 },
        { type: 'caption', text: 'Stack echoes: hold the door, then distract or wait' },
        { type: 'wait', ticks: 55 },
        { type: 'end' }
    ]
};

const LEVEL5_DEMO = {
    autoPlayOnFirstEnter: false,
    skippable: true,
    steps: [
        { type: 'caption', text: 'Cracked floors collapse under weight' },
        { type: 'wait', ticks: 50 },
        { type: 'caption', text: 'No dash on this route — path around the pit' },
        { type: 'wait', ticks: 55 },
        { type: 'caption', text: 'Echoes fall too. Plan the long walk' },
        { type: 'wait', ticks: 50 },
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
    lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: [],
    hints: [{ id: "hint_intro", x: 70, y: 280, demoId: "intro", autoOpen: false, title: "Second Echo" }]
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
    lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: [],
    hints: [{ id: "hint_intro", x: 80, y: 420, demoId: "intro", autoOpen: false, title: "Heavy Cargo" }]
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
    lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: [],
    hints: [{ id: "hint_intro", x: 70, y: 420, demoId: "intro", autoOpen: false, title: "Timer Door" }]
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
    guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: [],
    hints: [{ id: "hint_intro", x: 50, y: 420, demoId: "intro", autoOpen: false, title: "Fragile Cargo" }]
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
    { name: "Level 1: The Basics", story: { speaker: "ChronoHaul Dispatch", text: "Courier 83-A, welcome to your shift. Route efficiency is down 4%. Deploy your Temporal Payload to generate a logistics artifact (Echo). Echoes are non-sentient and property of ChronoHaul." }, obj: "Deliver the package using an echo to hold the door.", challenge: { desc: "Finish in 2 loops or fewer", check: () => state.pastRuns.length <= 1 }, maxGhosts: 1, mapWidth: 800, mapHeight: 600, layout: LEVEL1_LAYOUT, demo: LEVEL1_DEMO, demos: { intro: LEVEL1_DEMO } },
    { name: "Level 2: Floor Security", story: { speaker: "Local Hub Manager", text: "Yard security walked a patrol into your lane. Corporate will not authorize cloak hardware for a junior route. Wait them out, or let an echo pull their attention." }, obj: "One guard. Hold the door with an echo, then deliver without getting caught.", challenge: { desc: "Finish in 3 loops or fewer", check: () => state.pastRuns.length <= 2 }, maxGhosts: 2, mapWidth: 800, mapHeight: 600, layout: LEVEL2_LAYOUT, demos: { intro: LEVEL2_DEMO } },
    { name: "Level 3: Sweep Coverage", story: { speaker: "Sector Surveillance", text: "Camera grid online in Transit Spur C. Cloak is still locked behind procurement. Time the cone, use cover, and remember: discarded timelines trip the same sensors you do." }, obj: "One camera. Cross on the gap in the sweep. Echoes trigger cameras too.", challenge: { desc: "Finish in 3 loops or fewer", check: () => state.pastRuns.length <= 2 }, maxGhosts: 2, mapWidth: 800, mapHeight: 600, layout: LEVEL3_LAYOUT, demos: { intro: LEVEL3_DEMO } },
    { name: "Level 4: Overlapping Watch", story: { speaker: "Local Hub Manager", text: "They stacked a patrol and a camera on the same corridor. Budget says that is your problem. Coordinate echoes and keep the parcel moving." }, obj: "Guard and camera together. Hold the door, avoid both sensors, deliver.", challenge: { desc: "Finish in 3 loops or fewer", check: () => state.pastRuns.length <= 2 }, maxGhosts: 2, mapWidth: 800, mapHeight: 600, layout: LEVEL4_LAYOUT, demos: { intro: LEVEL4_DEMO } },
    { name: "Level 5: Unstable Deck", story: { speaker: "ChronoHaul Dispatch", text: "Maintenance skipped the subfloor again. Cracked plating collapses under courier mass. Dash implants are paywalled. Take the long walk and keep your echoes off the pit." }, obj: "Cracked floors collapse. No dash — path around and deliver with an echo on the door.", challenge: { desc: "Finish in 2 loops or fewer", check: () => state.pastRuns.length <= 1 }, maxGhosts: 2, mapWidth: 800, mapHeight: 600, layout: LEVEL5_LAYOUT, demos: { intro: LEVEL5_DEMO } },
    { name: "Level 6: Dual Airlock", story: { speaker: "ChronoHaul Dispatch", text: "Courier 83-A, double-echo clearance is live on this airlock. Two doors, two timelines. One logistics artifact cannot hold both gates. Park an echo on each plate and walk the parcel back." }, obj: "Two doors. Park an echo on each plate, then bring the package back.", challenge: { desc: "Finish in 3 loops or fewer", check: () => state.pastRuns.length <= 2 }, maxGhosts: 2, mapWidth: 800, mapHeight: 600, layout: LEVEL6_LAYOUT, demos: { intro: LEVEL6_DEMO } },
    { name: "Level 7: Heavy Lifting", story: { speaker: "Local Hub Manager", text: "High-density cargo on your lane. Pick it up and your pace is cut in half. Loop an echo onto the plate before you start dragging, then haul the parcel through the door." }, obj: "Heavy package slows you. Echo holds the door; you drag the cargo through.", challenge: { desc: "Finish in 3 loops or fewer", check: () => state.pastRuns.length <= 2 }, maxGhosts: 2, mapWidth: 800, mapHeight: 600, layout: LEVEL7_LAYOUT, demos: { intro: LEVEL7_DEMO } },
    { name: "Level 8: Timed Gate", story: { speaker: "Sector Surveillance", text: "Gate TD-1 is locked to a maintenance cycle. Plates are offline in this spur. The door opens and shuts on its own clock. Cross with the parcel while the gate is open." }, obj: "Timer door cycles open and shut. Carry the package through while it is open.", challenge: { desc: "Finish in 2 loops or fewer", check: () => state.pastRuns.length <= 1 }, maxGhosts: 2, mapWidth: 800, mapHeight: 600, layout: LEVEL8_LAYOUT, demos: { intro: LEVEL8_DEMO } },
    { name: "Level 9: Fragile Grid", story: { speaker: "Local Hub Manager", text: "Class-4 fragile tech on this manifest. The laser grid vaporizes it on contact, and a live beam will burn you too. Hold both plates with echoes, then walk the cargo to the zone." }, obj: "Lasers vaporize fragile cargo. Echo-hold both plates, then deliver.", challenge: { desc: "Finish in 3 loops or fewer", check: () => state.pastRuns.length <= 2 }, maxGhosts: 3, mapWidth: 800, mapHeight: 600, layout: LEVEL9_LAYOUT, demos: { intro: LEVEL9_DEMO } },

    { name: "Level 10: Fast Shipping", grants: ['toss'], story: { speaker: "ChronoHaul Dispatch", text: "Critical: Package is highly unstable. Detonation sequence activates upon handling. The company expects immediate delivery. Do not fail." }, obj: "Timed packages explode! Toss them over the gap instantly.", challenge: { desc: "Do NOT use Dash", check: () => state.runStats.dashes === 0 }, maxGhosts: 2, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600)]; cracks=[]; for(let i=20;i<580;i+=40) cracks.push(new CrackedFloor(380,i,40,40)); packages=[new Package('pkg1',100,300,'timed')]; doors=[]; plates=[]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; robots=[]; projectiles=[]; } },
    { name: "Level 11: Time Dilation", story: { speaker: "Unknown Hacker [Encrypted]", text: "They're trapping your discarded timelines in these Static Zones. The purple fields literally harvest temporal energy by slowing your echoes down. They're farming you." }, obj: "Static Zones slow ghost playback. Squeeze your execution.", challenge: { desc: "No Alarms Triggered", check: () => state.runStats.alarms === 0 }, maxGhosts: 3, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600), new Wall(450,20,40,180), new Wall(450,400,40,180), new Wall(550,20,40,180), new Wall(550,400,40,180)]; statics=[new StaticZone(200,20,200,560)]; doors=[new TimerDoor('td1',450,200,40,200,60,60)]; doors.push(new Door('d1', 550, 200, 40, 200)); plates=[new PressurePlate('p1', 300, 450, 'd1')]; packages=[new Package('pkg1',100,100)]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Level 12: Echo Crunch", story: { speaker: "Local Hub Manager", text: "Temporal budget exhausted. You are restricted to ONE echo. Corporate says zero margin for error. Get it done or your contract is terminated." }, obj: "Maximum 1 Echo Limit. Present Timeline must hold the gate.", challenge: { desc: "No Dash and No Cloak", check: () => state.runStats.dashes === 0 && state.runStats.cloaks === 0 }, maxGhosts: 1, setup: () => { player=new PlayerEntity(100,450,30,30,'player'); deliveryZone=new DeliveryZone(50,450,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(380,0,40,250),new Wall(380,330,40,270)]; doors=[new Door('d1',380,250,40,80)]; plates=[new TemporalPlate('p1',150,150,'d1', 'present')]; statics=[new StaticZone(100, 100, 100, 100)]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; cracks=[]; packages=[new Package('pkg1',650,200,'fragile')]; robots=[]; projectiles=[]; } },
    { name: "Level 13: Danger Courier", isBoss: true, grants: ['toss'], bossIntro: { speaker: "EXTERMINATOR UNIT XR-9", text: "Unauthorized courier detected. Temporal theft in progress. Arena lockdown lifted. Commencing extermination sweep." }, bossIntroDoorId: 'boss_intro_door', story: { speaker: "Unknown Hacker [Encrypted]", text: "ChronoHaul deployed an Exterminator robot to stop you. It has kill authorization. Throw Heavy Packages to breach its armor (3 hits). Then deliver the final Fragile Artifact!" }, obj: "Defeat the Security Robot! Toss packages to damage it (3 Hits).", challenge: { desc: "Finish in 1 loop (No Ghosts!)", check: () => state.pastRuns.length === 0 }, maxGhosts: 2, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(550,0,40,250),new Wall(550,350,40,250),new Wall(320,20,40,120),new Wall(440,20,40,120),new Wall(320,20,160,40)]; doors=[new Door('boss_door',550,250,40,100),new Door('boss_intro_door',360,100,80,40)]; robots=[new ShooterRobot([{x:390,y:60},{x:390,y:220},{x:250,y:220},{x:250,y:450},{x:450,y:450},{x:450,y:220}])]; robots[0].engaged = false; robots[0].isEmerging = false; robots[0].emergeUntilPathIndex = 2; lasers=[]; plates=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[]; packages=[new Package('ammo1',150,100,'heavy',false),new Package('ammo2',150,500,'heavy',false),new Package('ammo3',350,500,'heavy',false),new Package('pkg1',50,100,'fragile')]; projectiles=[]; } },
    { name: "Dev Sandbox", isSandbox: true, mapWidth: 1600, mapHeight: 1200, grants: ['dash', 'toss', 'cloak', 'ghostShield'], story: { speaker: "CHRONOHAUL LAB", text: "Sandbox range online. Map is oversized — the camera follows you. Every tool is granted. Walk the hall to exercise doors, plates, packages, lasers, cameras, guards, drones, winds, static, cracks, and the robot." }, obj: "Dev sandbox: oversized map with a sample of every entity. Camera follows the courier.", challenge: { desc: "Sandbox", check: () => false }, maxGhosts: 3, setup: setupDevSandbox }
];

export const CAMPAIGN_LEVEL_COUNT = LEVELS.filter(level => !level.isSandbox && !level.isPlaytest).length;
export const SANDBOX_LEVEL_INDEX = LEVELS.findIndex(level => level.isSandbox);

function withMapSize(entities, size) {
    return { ...entities, mapWidth: size.mapWidth, mapHeight: size.mapHeight };
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
        robots: (src.robots || []).map(r => ({ path: r.path || [{ x: r.x, y: r.y }] }))
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
            maxGhosts: m.maxGhosts ?? 3
        };
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
        if (d.type === 'timer') return new TimerDoor(d.id, d.x, d.y, d.w, d.h, d.openT || 60, d.closedT || 60);
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
    cameras = (data.cameras||[]).map(c => new SweepCamera(c.x, c.y, c.baseAngle || 0, c.sweepRange || Math.PI/2));
    drones = (data.drones||[]).map(d => {
        const path = d.path || d.points || [{ x: d.x, y: d.y }];
        return new Drone(path.length ? path : [{ x: 50, y: 50 }]);
    });
    winds = (data.winds||[]).map(w => new WindTunnel(w.x, w.y, w.w, w.h, w.vx, w.vy));
    statics = (data.statics||[]).map(s => new StaticZone(s.x, s.y, s.w, s.h));
    cracks = (data.cracks||[]).map(c => new CrackedFloor(c.x, c.y, c.w, c.h));
    robots = (data.robots||[]).map(r => {
        const path = r.path || [{ x: r.x, y: r.y }];
        return new ShooterRobot(path.length ? path : [{ x: 50, y: 50 }]);
    });
    projectiles = [];

    const demo = cloneDemo(data.demo || data.meta?.demo);
    if (data.meta && typeof state !== 'undefined') {
        state.editorLevelMeta = {
            name: data.meta.name || 'Editor Level',
            story: { speaker: data.meta.story?.speaker || '', text: data.meta.story?.text || '' },
            obj: data.meta.obj || '',
            grants: [...(data.meta.grants || [])],
            maxGhosts: data.meta.maxGhosts ?? 3,
            demo
        };
    } else if (demo && typeof state !== 'undefined') {
        if (!state.editorLevelMeta) {
            state.editorLevelMeta = {
                name: 'Editor Level',
                story: { speaker: '', text: '' },
                obj: '',
                grants: [],
                maxGhosts: 3
            };
        }
        state.editorLevelMeta.demo = demo;
    }
    
    return withMapSize({ player, deliveryZone, walls, doors, plates, hints, packages, lasers, guards, cameras, drones, winds, statics, cracks, robots, projectiles }, size);
}

export function getLevelSetup(index) {
    if (!LEVELS[index]) return null;
    const level = LEVELS[index];
    const size = { mapWidth: level.mapWidth || DEFAULT_MAP_WIDTH, mapHeight: level.mapHeight || DEFAULT_MAP_HEIGHT };
    
    if (level.setup) {
        level.setup();
        hints = [];
        return withMapSize({
            player, deliveryZone, walls, doors, plates, hints, packages,
            lasers, guards, cameras, drones, winds, statics, cracks,
            robots, projectiles
        }, size);
    } else if (level.layout) {
        const data = deserializeLevel({ ...level.layout, ...size, demos: level.demos, demo: level.demo });
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
