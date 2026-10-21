// World 4 "Beamworks" layouts. Plain data: levels.js deserializes them.
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

const EMPTY = { lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], robots: [], hints: [], cracks: [] };

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

// Lower hall is the haul. The plate is upstairs, and the only stair is the left shaft.
// Grabbing the glass and walking right walks it into the beam.
const W4_L1_LAYOUT = base({
    player: { x: 48, y: 460 },
    deliveryZone: { x: 640, y: 420, w: 120, h: 120 },
    walls: [
        ...borders(),
        { x: 130, y: 250, w: 650, h: 20 }
    ],
    doors: [],
    plates: [{ x: 220, y: 80, linkedIds: ['l1'], id: 'p1', type: 'standard' }],
    packages: [{ x: 200, y: 460, id: 'pkg1', packageType: 'fragile', requiredForDelivery: true }],
    lasers: [{ x: 430, y: 270, w: 24, h: 310, id: 'l1' }]
});

// One echo, two plates. Upper hall is the switch path; lower hall is the haul.
// The divider starts at x=200 so the left shaft is the only link between halls.
const W4_L2_LAYOUT = base({
    player: { x: 50, y: 250 },
    deliveryZone: { x: 640, y: 420, w: 120, h: 120 },
    walls: [
        ...borders(),
        { x: 200, y: 290, w: 580, h: 20 }
    ],
    doors: [],
    plates: [
        { x: 240, y: 80, linkedIds: ['l1'], id: 'p1', type: 'standard' },
        { x: 620, y: 80, linkedIds: ['l2'], id: 'p2', type: 'standard' }
    ],
    packages: [{ x: 220, y: 450, id: 'pkg1', packageType: 'fragile', requiredForDelivery: true }],
    lasers: [
        { x: 340, y: 310, w: 24, h: 270, id: 'l1' },
        { x: 520, y: 310, w: 24, h: 270, id: 'l2' }
    ]
});

// Plateless vertical beam. The only way into it facing the emitter (up) is the
// bottom alcove, which is walled off from the right room. Crossing is perpendicular.
const W4_L3_LAYOUT = base({
    player: { x: 50, y: 500 },
    deliveryZone: { x: 620, y: 360, w: 140, h: 120 },
    walls: [
        ...borders(),
        { x: 300, y: 20, w: 90, h: 70 },
        { x: 418, y: 20, w: 90, h: 70 },
        { x: 418, y: 480, w: 40, h: 100 }
    ],
    doors: [],
    plates: [],
    packages: [{ x: 70, y: 390, id: 'pkg1', packageType: 'fragile', requiredForDelivery: true }],
    lasers: [{ x: 390, y: 20, w: 28, h: 460, id: 'beam' }]
});

// Horizontal plateless beam. Enter from the east shaft facing the west emitter.
// Cracks sit on the short park; the solid stop is further west. North slot is the haul.
const W4_L4_LAYOUT = base({
    player: { x: 40, y: 430 },
    deliveryZone: { x: 40, y: 50, w: 110, h: 110 },
    walls: [
        ...borders(),
        // Tunnel ceiling. Slot x=560–620 is the only north exit through the beam.
        { x: 20, y: 200, w: 540, h: 20 },
        { x: 620, y: 200, w: 160, h: 20 },
        // Tunnel floor. East gap x=660+ is the shaft into the beam, capped above.
        { x: 20, y: 340, w: 540, h: 20 },
        { x: 620, y: 340, w: 40, h: 20 },
        // Top-hall dividers. Open lane is y=90–160 so a courier at y=110
        // clears the wall and the closed door by more than one movement frame.
        { x: 250, y: 20, w: 20, h: 70 },
        { x: 250, y: 160, w: 20, h: 40 }
    ],
    doors: [
        { x: 250, y: 90, w: 20, h: 70, id: 'ad', type: 'alarm' },
        { x: 160, y: 40, w: 20, h: 140, id: 'td', type: 'timer', openT: 120, closedT: 150 }
    ],
    plates: [{ x: 80, y: 470, linkedIds: ['l2'], id: 'p2', type: 'standard' }],
    packages: [{ x: 140, y: 490, id: 'pkg1', packageType: 'fragile', requiredForDelivery: true }],
    lasers: [
        { x: 200, y: 220, w: 440, h: 120, id: 'beam' },
        { x: 360, y: 40, w: 24, h: 160, id: 'l2' }
    ],
    // Two tiles. A moving courier clears them; a parked echo does not.
    cracks: [
        { x: 480, y: 220, w: 40, h: 120 },
        { x: 520, y: 220, w: 40, h: 120 }
    ],
    // East-facing. The haul stays west of the lens; cutting into the northeast corner is seen.
    cameras: [{ x: 640, y: 40, baseAngle: 0, sweepRange: Math.PI / 5 }]
});

// Gate laser across the south. Prism sits north of it. Ammo is already in the arena
// so a shielded crossing never has to carry glass through the gate.
const W4_MB_LAYOUT = base({
    player: { x: 480, y: 530 },
    deliveryZone: { x: 732, y: 515, w: 46, h: 60 },
    walls: [
        ...borders(),
        // North lip of the gate tunnel. Slot x=360–430 is the arena entrance.
        { x: 20, y: 380, w: 340, h: 20 },
        { x: 430, y: 380, w: 350, h: 20 },
        // South lip ends at the beam's east edge. The gap x=640–710 is the shaft.
        { x: 20, y: 500, w: 620, h: 20 },
        // Delivery closet, east of the shaft. Door fills the south room.
        { x: 710, y: 500, w: 70, h: 20 }
    ],
    doors: [{ x: 710, y: 520, w: 20, h: 60, id: 'boss_door', type: 'standard' }],
    plates: [],
    packages: [
        // South of the gate, outside Prism's range. Carried in through the shielded span.
        { x: 420, y: 530, id: 'ammo1', packageType: 'fragile', requiredForDelivery: false },
        { x: 180, y: 530, id: 'ammo2', packageType: 'fragile', requiredForDelivery: false },
        { x: 560, y: 530, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }
    ],
    lasers: [{ x: 180, y: 400, w: 460, h: 100, id: 'gate' }],
    prisms: [{
        x: 376, y: 176, w: 48, h: 48, id: 'prism',
        hp: 3,
        // Full turn in 8.5s (default is 12s). The quiet face points south at 5s,
        // which is when a courier who shielded the gate can actually be there.
        sweepSpeed: (2 * Math.PI) / 8.5,
        arc: Math.PI / 12,
        range: 240,
        receiverArc: Math.PI / 2,
        telegraphTime: 1.5,
        receiverRange: 78,
        startAngle: -Math.PI / 2 - ((2 * Math.PI) / 8.5) * 5 + 2 * Math.PI,
        spin: 1,
        defeatDoorId: 'boss_door'
    }]
});

function level(name, obj, text, loops, ghosts, loopTime, layout, extra = {}) {
    return {
        name,
        story: story(extra.speaker || 'Beamworks Dispatch', text),
        obj,
        challenge: parChallenge(loops),
        par: loops,
        maxGhosts: ghosts,
        loopTime,
        world: 4,
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

const SHIELD = { unlocks: ['ghostShield'], grants: ['ghostShield'] };

export const W4_LEVELS = [
    level(
        'W4-L1: Glass',
        'Glass does not survive a live beam. The switch for this one is not on the floor with the cargo.',
        'The box is downstairs. So is the beam. Whatever kills that beam is not standing next to the box.',
        2, 1, 22, W4_L1_LAYOUT
    ),
    level(
        'W4-L2: Two Beams, One Ghost',
        'Two live beams bar the haul. Glass dies in either, and a plate holds only while someone stands on it.',
        'Both beams cut the lower hall. The plates that quiet them are not down there with the box. One recording is all this route allows, and an empty plate lets its beam return.',
        2, 1, 26, W4_L2_LAYOUT
    ),
    level(
        'W4-L3: Shieldwall',
        'No plate on this emitter. A shield covers one side of an echo — the side it was facing when the loop closed.',
        'Nothing in this hall switches the beam off. Walking through is not the same as standing in it. The loop remembers which way you were looking.',
        2, 1, 24, W4_L3_LAYOUT,
        SHIELD
    ),
    level(
        'W4-L4: Prism Freight',
        'The wide beam has no plate. Cracked floor collapses under anyone who stays. Glass, a camera, and a timed gate are all live.',
        'Nothing switches the wide beam off. Standing in it is not the same as passing through, and the cracked span gives way if anyone stays. A lens covers the northeast, the north gate keeps its own clock, and the glass still dies in a live beam. Another beam in the hall still listens for a plate.',
        3, 2, 36, W4_L4_LAYOUT,
        { ...SHIELD, flags: { crackSpeed: 'fast' } }
    ),
    level(
        'W4-MB: Prism',
        'The south gate is an unswitched beam. Glass hurts the machine, but not from the side that is firing.',
        'The sweep warns before it burns. The gate stays up until something stands in it the right way. What you carry only matters on the quiet face.',
        3, 2, 20, W4_MB_LAYOUT,
        {
            ...SHIELD,
            flags: {
                isBoss: true,
                bossIntro: {
                    speaker: 'PRISM',
                    text: 'The turret never stops. A warning marks where the beam is about to be. The face that fires is not the weak side.'
                }
            }
        }
    )
];
