// World 2 "Subfloor" layouts. Plain data: levels.js deserializes them.
// Appended after the sandbox so existing campaign indices stay put.
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

const EMPTY = { lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], robots: [], hints: [] };

function base(extra) {
    return {
        width: W, height: H, mapWidth: W, mapHeight: H,
        ...EMPTY,
        ...extra
    };
}

function crackRow(x, y, n, w, h) {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ x: x + i * w, y, w, h });
    return out;
}

function ring(px, py, sides) {
    const s = 40;
    const map = {
        l: { x: px - s, y: py, w: s, h: s },
        r: { x: px + s, y: py, w: s, h: s },
        u: { x: px, y: py - s, w: s, h: s },
        d: { x: px, y: py + s, w: s, h: s }
    };
    return sides.map(k => map[k]);
}

function parChallenge(loops) {
    const n = loops;
    return {
        desc: `Finish in ${n} loop${n === 1 ? '' : 's'} or fewer`,
        check: () => finishedWithinLoops(state.loopNumber, n)
    };
}

const story = (speaker, text) => ({ speaker, text });

const W2_L1_LAYOUT = base({
    player: { x: 40, y: 90 },
    deliveryZone: { x: 40, y: 420, w: 130, h: 120 },
    walls: [
        ...borders(),
        // Upper deck floor. Gap on the right is the only way down to the return lane.
        { x: 20, y: 200, w: 600, h: 20 }
    ],
    doors: [],
    plates: [],
    packages: [{ x: 640, y: 90, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }],
    // Single-file bridge: full height of the upper deck, so the deck is one crossing.
    cracks: crackRow(280, 20, 6, 40, 180)
});

const W2_L2_LAYOUT = base({
    player: { x: 50, y: 470 },
    deliveryZone: { x: 640, y: 440, w: 120, h: 120 },
    walls: [
        ...borders(),
        // Bottom-room ceiling, open on the left into the detour.
        { x: 150, y: 360, w: 630, h: 20 },
        // Cap over the entrance so the plate is not a straight walk up.
        { x: 20, y: 200, w: 620, h: 20 },
        // Plate alcove: the top gap is tall enough for a courier to walk in.
        { x: 160, y: 90, w: 20, h: 110 },
        // Door column in the bottom room.
        { x: 420, y: 380, w: 40, h: 50 },
        { x: 420, y: 530, w: 40, h: 50 }
    ],
    doors: [{ x: 420, y: 430, w: 40, h: 100, id: 'd1', type: 'standard' }],
    plates: [{ x: 60, y: 80, linkedIds: ['d1'], id: 'p1', type: 'standard' }],
    packages: [{ x: 520, y: 470, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }],
    cracks: crackRow(200, 380, 4, 40, 200)
});

const W2_L3_LAYOUT = base({
    player: { x: 50, y: 450 },
    deliveryZone: { x: 520, y: 420, w: 160, h: 130 },
    walls: [
        ...borders(),
        // Left stair is the only link between the haul lane and the dash ledge.
        { x: 180, y: 280, w: 600, h: 40 },
        { x: 360, y: 320, w: 40, h: 80 },
        { x: 360, y: 500, w: 40, h: 80 }
    ],
    doors: [{ x: 360, y: 400, w: 40, h: 100, id: 'd1', type: 'standard' }],
    plates: [{ x: 560, y: 100, linkedIds: ['d1'], id: 'p1', type: 'standard' }],
    packages: [{ x: 140, y: 450, id: 'pkg1', packageType: 'heavy', requiredForDelivery: true }],
    // One wide fast crack. A walk collapses it; a dash clears the far side.
    cracks: [{ x: 280, y: 20, w: 160, h: 260 }]
});

const W2_L4_LAYOUT = base({
    player: { x: 40, y: 480 },
    deliveryZone: { x: 670, y: 450, w: 100, h: 110 },
    walls: [
        ...borders(),
        // Freight ceiling, open on the left into the plate routes.
        { x: 140, y: 400, w: 640, h: 20 },
        // Upper hall floor. Left gap climbs to plate B; right gap is the crack shortcut up.
        { x: 150, y: 140, w: 430, h: 20 },
        { x: 230, y: 420, w: 40, h: 30 },
        { x: 230, y: 540, w: 40, h: 40 },
        { x: 400, y: 420, w: 40, h: 30 },
        { x: 400, y: 540, w: 40, h: 40 },
        { x: 560, y: 420, w: 40, h: 30 },
        { x: 560, y: 540, w: 40, h: 40 }
    ],
    doors: [
        { x: 230, y: 450, w: 40, h: 90, id: 'da', type: 'standard' },
        { x: 400, y: 450, w: 40, h: 90, id: 'db', type: 'standard' },
        { x: 560, y: 450, w: 40, h: 90, id: 'td', type: 'timer', openT: 900, closedT: 240 }
    ],
    plates: [
        { x: 560, y: 250, linkedIds: ['da'], id: 'pa', type: 'standard' },
        { x: 640, y: 50, linkedIds: ['db'], id: 'pb', type: 'standard' }
    ],
    packages: [{ x: 100, y: 470, id: 'pkg1', packageType: 'heavy', requiredForDelivery: true }],
    // Crack field fills the mid band. Echo 1 crosses it to plate A. The upper hall is the safe way to plate B.
    cracks: crackRow(180, 160, 8, 40, 240)
});

const W2_MB_LAYOUT = base({
    player: { x: 240, y: 450 },
    deliveryZone: { x: 690, y: 450, w: 80, h: 110 },
    walls: [
        ...borders(),
        // Separator with a left shaft (plate 1) and a center shaft (plates 3 then 2).
        { x: 160, y: 400, w: 200, h: 20 },
        { x: 560, y: 400, w: 220, h: 20 },
        // Door column so the exit stays shut until the burrower drops.
        { x: 620, y: 420, w: 40, h: 40 },
        { x: 620, y: 540, w: 40, h: 40 }
    ],
    doors: [{ x: 620, y: 460, w: 40, h: 80, id: 'boss_door', type: 'standard' }],
    plates: [
        { x: 80, y: 80, linkedIds: [], id: 'c1', type: 'standard' },
        { x: 480, y: 60, linkedIds: [], id: 'c2', type: 'standard' },
        { x: 480, y: 280, linkedIds: [], id: 'c3', type: 'standard' }
    ],
    packages: [{ x: 340, y: 470, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }],
    cracks: [
        // Each core plate's ring leaves its east side as plain floor: a guaranteed
        // way off the plate after a missed stun breaks the other three cracks.
        ...ring(80, 80, ['l', 'u', 'd']),
        ...ring(480, 60, ['l', 'u', 'd']),
        ...ring(480, 280, ['l', 'u', 'd'])
    ],
    burrowers: [{
        x: 470, y: 200, w: 36, h: 36, id: 'burrower',
        hp: 3, surfaceInterval: 2.5, telegraphTime: 1.5, stunTime: 2,
        // One stun per loop, so camping a single core plate cannot drain every phase.
        maxStunsPerLoop: 1,
        // Lit in this order; each stun spends the lit plate and lights the next.
        corePlateIds: ['c3', 'c2', 'c1'],
        defeatDoorId: 'boss_door'
    }]
});

function level(name, obj, text, loops, ghosts, loopTime, layout, extra = {}) {
    return {
        name,
        story: story('Subfloor Dispatch', text),
        obj,
        challenge: parChallenge(loops),
        par: loops,
        maxGhosts: ghosts,
        loopTime,
        crackSpeed: 'fast',
        world: 2,
        unlocks: extra.unlocks || [],
        grants: extra.grants || [],
        mapWidth: W,
        mapHeight: H,
        layout,
        isPendingCampaign: true,
        ...extra.flags
    };
}

export const W2_LEVELS = [
    level(
        'W2-L1: Thin Ice',
        'Cracked plating holds for one crossing. Cross for the package, then take the solid way back.',
        'Subfloor plating ahead. It carries one courier and then it is gone. There is a solid lane home if you do not try to recross.',
        1, 0, 20, W2_L1_LAYOUT
    ),
    level(
        'W2-L2: Footprints',
        'Echoes break the floor too. Park one on the plate by the long hall, then cross the intact bridge.',
        'The bridge collapses under a timeline, not just under you. The plate that holds the door is down the long hall. Your echo can stand there.',
        2, 1, 22, W2_L2_LAYOUT
    ),
    level(
        'W2-L3: Heavy Going',
        'Heavy cargo cannot beat the crack. Dash to the plate; your echo holds the door while you haul.',
        'Dash implants are live on this route. The crack is too wide to walk, and the heavy crate will not survive it. Put an echo on the plate and drag the crate through the door.',
        2, 1, 30, W2_L3_LAYOUT,
        { unlocks: ['dash'], grants: ['dash'], flags: { dashFrom: true } }
    ),
    level(
        'W2-L4: Sinking Freight',
        'Use echo footsteps to kill the crack shortcut. Hold both plates, then haul through the timer door.',
        'Two plates, one heavy crate, and a gate on a clock. The crack field is the short way and it will not be there for a second timeline. Wall-follow the upper hall.',
        3, 2, 32, W2_L4_LAYOUT,
        { unlocks: ['dash'] }
    ),
    level(
        'W2-MB: Sinkhole',
        'Loudest wins: it strikes whoever last stepped on a crack or plate, or YOUR tile. Stun it 3 times: hold the LIT core plate and have an echo standing on a crack beside the lit plate when the strike lands. Each stun lights the next plate. Then deliver.',
        'Something under the subfloor hunts by sound. Whoever last stepped onto a crack or a plate is the one it hunts and it surfaces on a crack by them. With no noise it comes up under YOU, on any floor, so keep moving. Hold the lit core plate while an echo stamps any crack beside it right as it surfaces, and it is stunned. Each stun spends that plate and lights the next one, so every stun needs a fresh stamp. One stun per loop, then it sleeps until the loop clock rewinds. Three stuns open the door.',
        4, 3, 30, W2_MB_LAYOUT,
        {
            unlocks: ['dash'],
            flags: {
                isBoss: true,
                hintLine: 'It hunts the last step on a crack or plate, else YOU: keep moving. Stun: hold the LIT core plate. Have an echo standing on a crack beside the lit plate when the strike lands. Each stun lights the next plate. 1 stun per loop.',
                bossIntro: {
                    speaker: 'BURROWER',
                    text: 'I hear every step on cracks and plates, and I hunt the loudest. Stand still and I rise under you. Hold the lit plate and have your echo stamp a crack beside it as I rise. Each plate works once. One stun, then I sleep until your loop clock rewinds.'
                }
            }
        }
    )
];
