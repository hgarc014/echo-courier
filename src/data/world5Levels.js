// World 5 "Overclock" layouts. Plain data: levels.js deserializes them.
// Appended after World 4 so existing campaign indices stay put.
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

const EMPTY = { lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], robots: [], hints: [], cracks: [] };

function base(extra) {
    return { width: W, height: H, mapWidth: W, mapHeight: H, ...EMPTY, ...extra };
}

function parChallenge(loops) {
    return {
        desc: `Finish in ${loops} loop${loops === 1 ? '' : 's'} or fewer`,
        check: () => finishedWithinLoops(state.loopNumber, loops)
    };
}

const story = (speaker, text) => ({ speaker, text });

// Two doors back to back in one gap (x=400 and x=420). Nobody fits between
// them, so both must be open at the same moment. The plates sit in opposite
// corners, too far apart for one echo to hold both.
function airlockWalls(extra = []) {
    return [
        ...borders(),
        { x: 400, y: 20, w: 40, h: 220 },
        { x: 400, y: 360, w: 40, h: 220 },
        ...extra
    ];
}

// Magenta (first-only) holds the outer door, a plain plate holds the inner one.
const W5_L1_LAYOUT = base({
    player: { x: 200, y: 285 },
    deliveryZone: { x: 620, y: 240, w: 120, h: 120 },
    walls: airlockWalls(),
    doors: [
        { x: 400, y: 240, w: 20, h: 120, id: 'd_first', type: 'standard' },
        { x: 420, y: 240, w: 20, h: 120, id: 'd_plain', type: 'standard' }
    ],
    plates: [
        { x: 60, y: 60, linkedIds: ['d_first'], id: 'p_first', type: 'temporal', requiredTimeline: 'first' },
        { x: 60, y: 500, linkedIds: ['d_plain'], id: 'p_plain', type: 'standard' }
    ],
    packages: [{ x: 300, y: 285, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }]
});

// Magenta A (first) and blue D (last) hold the airlock. The exit door has its
// green (present) plate under it: only the live courier opens it, by walking up.
const W5_L2_LAYOUT = base({
    player: { x: 200, y: 285 },
    deliveryZone: { x: 660, y: 240, w: 100, h: 120 },
    walls: airlockWalls([
        { x: 600, y: 20, w: 20, h: 220 },
        { x: 600, y: 360, w: 20, h: 220 }
    ]),
    doors: [
        { x: 400, y: 240, w: 20, h: 120, id: 'd_first', type: 'standard' },
        { x: 420, y: 240, w: 20, h: 120, id: 'd_last', type: 'standard' },
        { x: 600, y: 240, w: 20, h: 120, id: 'd_exit', type: 'standard' }
    ],
    plates: [
        { x: 60, y: 60, linkedIds: ['d_first'], id: 'p_first', type: 'temporal', requiredTimeline: 'first' },
        { x: 60, y: 500, linkedIds: ['d_last'], id: 'p_last', type: 'temporal', requiredTimeline: 'last' },
        { x: 590, y: 280, linkedIds: ['d_exit'], id: 'p_exit', type: 'temporal', requiredTimeline: 'present' }
    ],
    packages: [{ x: 300, y: 285, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }]
});

// Gate G (x=400..520) is a timer door open for the first 4 s of each loop, and
// anyone standing in it holds it. The haul (bottom-left closet) cannot reach G
// in 4 s. Two plain plates past G feed an airlock, so both echoes must end on
// plates, not parked in G. The static band (y<200) is the slow road to G.
const W5_L3_LAYOUT = base({
    player: { x: 40, y: 285 },
    deliveryZone: { x: 680, y: 240, w: 80, h: 120 },
    walls: [
        ...borders(),
        { x: 400, y: 20, w: 120, h: 220 },
        { x: 400, y: 360, w: 120, h: 220 },
        // Closet: entered at its right end, parcel tucked behind a fin wall.
        { x: 20, y: 330, w: 340, h: 20 },
        { x: 200, y: 350, w: 20, h: 120 },
        { x: 620, y: 20, w: 40, h: 220 },
        { x: 620, y: 360, w: 40, h: 220 }
    ],
    doors: [
        { x: 400, y: 240, w: 120, h: 120, id: 'gate', type: 'timer', openT: 240, closedT: 1560 },
        { x: 620, y: 240, w: 20, h: 120, id: 'd_top', type: 'standard' },
        { x: 640, y: 240, w: 20, h: 120, id: 'd_bottom', type: 'standard' }
    ],
    plates: [
        { x: 555, y: 60, linkedIds: ['d_top'], id: 'p_top', type: 'standard' },
        { x: 555, y: 500, linkedIds: ['d_bottom'], id: 'p_bottom', type: 'standard' }
    ],
    // The gate is static too, so a slow echo lingers in it.
    statics: [{ x: 20, y: 20, w: 380, h: 180 }, { x: 400, y: 240, w: 120, h: 120 }],
    packages: [{ x: 60, y: 370, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }]
});

// Combine. Plateless beam (x=200) with its emitter at the top: a shielded echo
// parked near the top (its shield needs beam in front of it) blocks the rest. That spot is a magenta plate, so the
// shield must be the first echo. The guard (x=420) sees through walls; an echo
// in the walled pocket pins it facing up. Blue plate in the hall's south end.
// Glass, cracks on the beam exit, airlock, then a timer door before the zone.
const W5_L4_LAYOUT = base({
    player: { x: 40, y: 40 },
    deliveryZone: { x: 660, y: 240, w: 100, h: 120 },
    walls: [
        ...borders(),
        // Alcove under the beam: entered from the left room, walled off from the hall.
        { x: 228, y: 480, w: 60, h: 100 },
        // Distraction pocket, entered from the top of the beam column.
        { x: 228, y: 20, w: 102, h: 50 },
        { x: 228, y: 110, w: 122, h: 20 },
        { x: 330, y: 20, w: 20, h: 90 },
        // Airlock column and timer-door column.
        { x: 560, y: 20, w: 40, h: 220 },
        { x: 560, y: 360, w: 40, h: 220 },
        { x: 620, y: 20, w: 20, h: 220 },
        { x: 620, y: 360, w: 20, h: 220 }
    ],
    doors: [
        { x: 560, y: 240, w: 20, h: 120, id: 'd_first', type: 'standard' },
        { x: 580, y: 240, w: 20, h: 120, id: 'd_last', type: 'standard' },
        { x: 620, y: 240, w: 20, h: 120, id: 'td', type: 'timer', openT: 90, closedT: 150 }
    ],
    plates: [
        { x: 194, y: 20, linkedIds: ['d_first'], id: 'p_first', type: 'temporal', requiredTimeline: 'first' },
        { x: 480, y: 520, linkedIds: ['d_last'], id: 'p_last', type: 'temporal', requiredTimeline: 'last' }
    ],
    packages: [{ x: 60, y: 300, id: 'pkg1', packageType: 'fragile', requiredForDelivery: true }],
    lasers: [{ x: 200, y: 20, w: 28, h: 460, id: 'beam' }],
    guards: [{ path: [{ x: 420, y: 500 }, { x: 420, y: 60 }] }],
    cracks: [
        { x: 228, y: 260, w: 40, h: 40 },
        { x: 268, y: 260, w: 40, h: 40 },
        { x: 228, y: 300, w: 40, h: 40 },
        { x: 268, y: 300, w: 40, h: 40 }
    ],
    statics: [{ x: 20, y: 380, w: 180, h: 100 }]
});

// XR-9 arena. The robot sits in a sealed ring with two openings: a slit to the
// west bait booth (too narrow to walk through) and the east back door. Only the
// newest echo can open the door, from the blue plate straight down the robot's
// east line. Whoever stands on blue is therefore in XR-9's sight, so a camper
// gets shot and the door shuts again.
const W5_BOSS_LAYOUT = base({
    player: { x: 40, y: 40 },
    deliveryZone: { x: 700, y: 500, w: 70, h: 70 },
    walls: [
        ...borders(),
        // Ring around XR-9.
        { x: 340, y: 240, w: 120, h: 20 },
        { x: 340, y: 340, w: 120, h: 20 },
        { x: 340, y: 260, w: 20, h: 28 },
        { x: 340, y: 312, w: 20, h: 28 },
        { x: 440, y: 260, w: 20, h: 10 },
        { x: 440, y: 330, w: 20, h: 10 },
        // Bait booth west of the slit, entered from the top.
        { x: 220, y: 260, w: 20, h: 20 },
        { x: 280, y: 260, w: 60, h: 20 },
        { x: 220, y: 320, w: 120, h: 20 },
        { x: 220, y: 280, w: 20, h: 40 },
        // Vault for the cargo, behind the boss door.
        { x: 600, y: 460, w: 180, h: 20 },
        { x: 600, y: 480, w: 20, h: 40 }
    ],
    doors: [
        { x: 440, y: 270, w: 20, h: 60, id: 'd_back', type: 'standard' },
        { x: 600, y: 520, w: 20, h: 60, id: 'boss_door', type: 'standard' }
    ],
    plates: [
        { x: 700, y: 280, linkedIds: ['d_back'], id: 'p_last', type: 'temporal', requiredTimeline: 'last' }
    ],
    packages: [{ x: 640, y: 500, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }],
    // The slit half of the booth floor gives way under anyone who lingers.
    cracks: [{ x: 300, y: 280, w: 40, h: 40 }],
    robots: [{
        path: [{ x: 382, y: 282 }, { x: 382, y: 284 }],
        hp: 3,
        id: 'xr9',
        label: 'XR-9',
        targetEchoes: true,
        backArc: Math.PI / 3,
        backTouch: true,
        telegraphTime: 1.5,
        checkpoint: true,
        defeatDoorId: 'boss_door'
    }]
});

function level(name, obj, text, loops, ghosts, loopTime, layout, extra = {}) {
    return {
        name,
        story: story(extra.speaker || 'Overclock Dispatch', text),
        obj,
        challenge: parChallenge(loops),
        par: loops,
        maxGhosts: ghosts,
        loopTime,
        world: 5,
        unlocks: extra.unlocks || [],
        grants: extra.grants || [],
        hints: [],
        mapWidth: W,
        mapHeight: H,
        layout,
        isPendingCampaign: true,
        ...extra.flags
    };
}

export const W5_LEVELS = [
    level(
        'W5-L1: First Light',
        'Two doors share one gap. The magenta plate answers to one recording only, and it is not the newest.',
        'Both doors have to be open at once, and their plates are in opposite corners. Magenta remembers who came first. Plan your opening loop around it.',
        3, 2, 25, W5_L1_LAYOUT
    ),
    level(
        'W5-L2: Last Word',
        'Magenta answers the oldest echo. Blue answers the newest. Green answers only you, right now.',
        'Blue looks satisfied the moment you loop. Ask who will be newest when you finally walk through, not who is newest now.',
        3, 2, 28, W5_L2_LAYOUT
    ),
    level(
        'W5-L3: Slow Motion',
        'The gate only opens at the start of a loop, and anyone standing in it keeps it open. Static drags echoes. It does not drag you.',
        'You cannot reach the gate with the parcel before it shuts. An echo walking through it holds it, but only while it is there. The purple field is the long way round, and it is longer for an echo than it was for you.',
        3, 2, 30, W5_L3_LAYOUT
    ),
    level(
        'W5-L4: Courier Overclock',
        'Glass, a plateless beam, a guard who sees through walls, two colored plates, cracked floor, and a timed door. Three echoes.',
        'Every job here belongs to a loop number. Work out which job only the oldest echo can do, which only the newest can, and what is left for the one in between. Then record them in that order.',
        4, 3, 45, W5_L4_LAYOUT,
        { unlocks: ['ghostShield'], grants: ['ghostShield'] }
    ),
    level(
        'W5-BOSS: XR-9',
        'XR-9 fires at the nearest echo it can see, and only its back panel is soft. Its back door answers to the blue plate.',
        'It always turns toward an echo before it turns toward you. Blue only listens to the newest recording, and each hit is checkpointed. Each loop has one job: stand guard for the next loop, or be the decoy for a later one.',
        5, 4, 40, W5_BOSS_LAYOUT,
        {
            speaker: 'Overclock Dispatch',
            flags: {
                isBoss: true,
                crackSpeed: 'fast',
                bossIntro: {
                    speaker: 'EXTERMINATOR UNIT XR-9',
                    text: 'Echo signatures detected. Targeting the nearest copy. My armor faces whatever I am aiming at.'
                }
            }
        }
    )
];
