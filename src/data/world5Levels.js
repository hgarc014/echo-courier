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
    )
];
