// World 3 "Panopticon" layouts. Plain data: levels.js deserializes them.
// Appended after World 2 so existing campaign indices stay put.
import { state } from '../core/state.js';
import { finishedWithinLoops } from '../core/loopDisplay.js';

const W = 800;
const H = 600;

function borders() {
    return [
        { x: 0, y: 0, w: W, h: 20 },
        { x: 0, y: H - 20, w: W, h: 20 },
        { x: 0, y: 0, w: 20, h: H },
        { x: W - 20, y: 0, w: 20, h: H }
    ];
}

const EMPTY = { lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], robots: [], hints: [], burrowers: [], wardens: [] };

function base(extra) {
    return {
        width: W, height: H, mapWidth: W, mapHeight: H,
        ...EMPTY,
        ...extra
    };
}

function parChallenge(loops) {
    const n = loops;
    return {
        desc: `Finish in ${n} loop${n === 1 ? '' : 's'} or fewer`,
        check: () => finishedWithinLoops(state.loopNumber, n)
    };
}

const story = (speaker, text) => ({ speaker, text });

// One camera over the only corridor. The alarm door sits in the swept band.
const W3_L1_LAYOUT = base({
    player: { x: 80, y: 200 },
    deliveryZone: { x: 660, y: 175, w: 100, h: 90 },
    walls: [
        ...borders(),
        { x: 20, y: 160, w: 760, h: 20 },
        { x: 20, y: 270, w: 760, h: 20 }
    ],
    doors: [{ x: 400, y: 180, w: 40, h: 90, id: 'alarm1', type: 'alarm' }],
    plates: [],
    packages: [{ x: 620, y: 200, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }],
    cameras: [{ x: 400, y: 40, baseAngle: Math.PI / 2, sweepRange: Math.PI / 2 }],
    cracks: []
});

// Plate is past the sweep, in a pocket the cone never reaches. Alarm door is the exit.
// The standard door behind it stays shut until an echo holds that plate.
const W3_L2_LAYOUT = base({
    player: { x: 80, y: 200 },
    deliveryZone: { x: 730, y: 180, w: 40, h: 80 },
    walls: [
        ...borders(),
        { x: 20, y: 160, w: 760, h: 20 },
        { x: 20, y: 270, w: 480, h: 20 },
        { x: 620, y: 270, w: 160, h: 20 },
        { x: 620, y: 290, w: 20, h: 290 }
    ],
    doors: [
        { x: 340, y: 180, w: 40, h: 90, id: 'alarm1', type: 'alarm' },
        { x: 660, y: 180, w: 40, h: 90, id: 'd1', type: 'standard' }
    ],
    plates: [{ x: 520, y: 500, linkedIds: ['d1'], id: 'p1', type: 'standard' }],
    packages: [{ x: 690, y: 200, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }],
    cameras: [{ x: 400, y: 40, baseAngle: Math.PI / 2, sweepRange: Math.PI / 2 }],
    cracks: []
});

// Posted guard faces the plate (default south). A decoy landing is the only thing
// that turns the cone off it. Toss room is outside vision range, to the west.
const W3_L3_LAYOUT = base({
    player: { x: 40, y: 520 },
    deliveryZone: { x: 700, y: 480, w: 70, h: 80 },
    walls: [
        ...borders(),
        { x: 520, y: 360, w: 40, h: 40 },
        { x: 520, y: 470, w: 40, h: 110 }
    ],
    doors: [{ x: 520, y: 400, w: 40, h: 70, id: 'd1', type: 'standard' }],
    plates: [{ x: 440, y: 400, linkedIds: ['d1'], id: 'p1', type: 'standard' }],
    packages: [
        { x: 60, y: 180, id: 'decoy1', packageType: 'decoy', requiredForDelivery: false },
        { x: 640, y: 500, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }
    ],
    guards: [{ path: [{ x: 460, y: 280 }, { x: 460, y: 280 }] }],
    cracks: []
});

// Guard walks the haul lane. Decoy landing is north of a fast crack, so the
// lure crosses the tile and the second echo can collapse it behind them.
// The camera faces east and sweeps north-south, so it only rakes the east end of
// the haul lane for part of each sweep: a readable ~3 s gap to take the crate
// through (it used to sweep the whole lane, which left a ~15-tick window).
const W3_L4_LAYOUT = base({
    player: { x: 40, y: 500 },
    deliveryZone: { x: 680, y: 470, w: 90, h: 90 },
    walls: [
        ...borders(),
        { x: 140, y: 260, w: 60, h: 20 },
        // Thick north wall east of the gap: no hidden strip to wait in above the post.
        { x: 320, y: 260, w: 460, h: 60 },
        // The gate column runs the full height under the north wall, so the only
        // way east is the timed door (no north-strip bypass).
        { x: 560, y: 280, w: 40, h: 200 },
        { x: 560, y: 540, w: 40, h: 40 }
    ],
    doors: [{ x: 560, y: 480, w: 40, h: 60, id: 'td1', type: 'timer', openT: 100, closedT: 180 }],
    plates: [],
    packages: [
        { x: 70, y: 140, id: 'decoy1', packageType: 'decoy', requiredForDelivery: false },
        { x: 160, y: 500, id: 'pkg1', packageType: 'heavy', requiredForDelivery: true }
    ],
    cameras: [{ x: 400, y: 360, baseAngle: 0, sweepRange: Math.PI / 2 }],
    guards: [{ path: [{ x: 240, y: 500 }, { x: 420, y: 500 }] }],
    cracks: [{ x: 200, y: 320, w: 80, h: 80 }]
});

// Three relays behind a north-facing post. Shallow noise uncovers one wing;
// a deeper noise uncovers the center without uncovering the far wing.
const W3_MB_LAYOUT = base({
    player: { x: 80, y: 500 },
    deliveryZone: { x: 700, y: 460, w: 70, h: 80 },
    walls: [
        ...borders(),
        { x: 500, y: 420, w: 280, h: 20 },
        { x: 500, y: 440, w: 20, h: 10 },
        { x: 500, y: 520, w: 40, h: 60 }
    ],
    doors: [{ x: 500, y: 450, w: 40, h: 70, id: 'boss_door', type: 'standard' }],
    plates: [
        { x: 460, y: 128, linkedIds: [], id: 'r1', type: 'standard' },
        { x: 300, y: 128, linkedIds: [], id: 'r2', type: 'standard' },
        { x: 380, y: 100, linkedIds: [], id: 'r3', type: 'standard' }
    ],
    packages: [
        { x: 468, y: 80, id: 'decoyW', packageType: 'decoy', requiredForDelivery: false },
        { x: 332, y: 80, id: 'decoyE', packageType: 'decoy', requiredForDelivery: false },
        { x: 384, y: 200, id: 'decoyD', packageType: 'decoy', requiredForDelivery: false },
        { x: 640, y: 480, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }
    ],
    wardens: [{
        x: 385, y: 305, w: 30, h: 30, id: 'warden',
        coneLength: 340, coneAngle: 80, turnSpeed: 160, hearRange: 1000,
        homeAngle: -90,
        relayIds: ['r1', 'r2', 'r3'],
        defeatDoorId: 'boss_door'
    }],
    cracks: []
});

function level(name, obj, text, loops, ghosts, loopTime, layout, extra = {}) {
    return {
        name,
        story: story('Panopticon Dispatch', text),
        obj,
        challenge: parChallenge(loops),
        par: loops,
        maxGhosts: ghosts,
        loopTime,
        world: 3,
        unlocks: extra.unlocks || ['dash'],
        grants: extra.grants || ['dash'],
        mapWidth: W,
        mapHeight: H,
        layout,
        isPendingCampaign: true,
        ...(extra.crackSpeed ? { crackSpeed: extra.crackSpeed } : {}),
        ...extra.flags
    };
}

const TOSS = { unlocks: ['dash', 'toss'], grants: ['dash', 'toss'] };

export const W3_LEVELS = [
    level(
        'W3-L1: Sweep',
        'Cross while the cone is on the far side. The alarm door shuts on anyone it sees.',
        'One camera owns this corridor. It has a rhythm. Walk when the light is somewhere else.',
        1, 1, 20, W3_L1_LAYOUT
    ),
    level(
        'W3-L2: Ghost in the Cone',
        'Your echo trips the camera too. Park it on the plate without riding the sweep, then cross again.',
        'The plate that holds the inner door is across the sweep. An echo standing in the cone keeps the alarm door shut. Both of you take the gap.',
        2, 1, 24, W3_L2_LAYOUT
    ),
    level(
        'W3-L3: Distraction',
        'Toss a decoy on a timer. The echo pulls the guard off the plate so you can take the door.',
        'Toss implants are live. The guard does not leave that plate for a patrol gap. A decoy landing does. Throw it, then take the door while the cone is turned.',
        2, 1, 26, W3_L3_LAYOUT,
        TOSS
    ),
    level(
        'W3-L4: Heavy Contraband',
        'Toss the decoy north of the crack so the guard crosses it. Step on the crack behind them, then haul the crate along the bottom while the camera looks north.',
        'The heavy crate is too slow to pass the patrol. Loop 1: from the top of the gap, toss the decoy so it lands north of the crack. Next loop: once the guard has crossed, step on the crack so it breaks behind them. Then haul the crate along the bottom wall when the camera swings north, and take the clock door.',
        3, 2, 35, W3_L4_LAYOUT,
        { ...TOSS, crackSpeed: 'fast' }
    ),
    level(
        'W3-MB: Warden',
        'Turn the Warden with three noises. Hit each relay only while its cone is looking elsewhere.',
        'The captain watches the last sound. Three relays sit behind the post. Script the landings so the cone is off each switch when you reach it.',
        4, 3, 30, W3_MB_LAYOUT,
        {
            ...TOSS,
            flags: {
                isBoss: true,
                bossIntro: {
                    speaker: 'WARDEN',
                    text: 'The post does not blink. It turns toward whatever just made a sound. The relays behind it only take a hand the cone is not covering.'
                }
            }
        }
    )
];
