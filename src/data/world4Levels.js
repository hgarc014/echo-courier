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

// Full-height beam. Plate on the left shuts it; fragile waits on the right.
const W4_L1_LAYOUT = base({
    player: { x: 50, y: 280 },
    deliveryZone: { x: 640, y: 230, w: 120, h: 140 },
    walls: borders(),
    doors: [],
    plates: [{ x: 120, y: 270, linkedIds: ['l1'], id: 'p1', type: 'standard' }],
    packages: [{ x: 500, y: 280, id: 'pkg1', packageType: 'fragile', requiredForDelivery: true }],
    lasers: [{ x: 390, y: 20, w: 24, h: 560, id: 'l1' }]
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
        // Top-hall dividers. The open lane is y=110–150; the camera watches east of it.
        { x: 250, y: 20, w: 20, h: 90 },
        { x: 250, y: 150, w: 20, h: 50 }
    ],
    doors: [
        { x: 250, y: 110, w: 20, h: 40, id: 'ad', type: 'alarm' },
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
        sweepSpeed: Math.PI / 2 / 3,
        arc: Math.PI / 12,
        range: 240,
        receiverArc: Math.PI / 2,
        telegraphTime: 1.5,
        receiverRange: 78,
        startAngle: 0,
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
        'Hold the laser plate with an echo, then carry the fragile package through.',
        'Fragile cargo on this manifest. The grid vaporizes it, and you with it. An echo on the plate kills the beam.',
        2, 1, 22, W4_L1_LAYOUT
    ),
    level(
        'W4-L2: Two Beams, One Ghost',
        'One echo shuts both lasers in sequence. Deliver the fragile package.',
        'One timeline, two beams. Stand the echo on the first plate while you cross, then send it to the second.',
        2, 1, 26, W4_L2_LAYOUT
    ),
    level(
        'W4-L3: Shieldwall',
        'Park a shielded echo in the beam, facing the emitter. Carry the fragile package through.',
        'No plate on this emitter. Walk into the beam, face it, and stop. Your echo\'s shield is the wall.',
        2, 1, 24, W4_L3_LAYOUT,
        SHIELD
    ),
    level(
        'W4-L4: Prism Freight',
        'Shield the beam from solid ground, hold the hall laser, then haul fragile cargo past the camera and the timer.',
        'The shield has to stand on solid floor. Cracks will not hold it, so route the long way around and accept the slower arrival.',
        3, 2, 36, W4_L4_LAYOUT,
        { ...SHIELD, flags: { crackSpeed: 'fast' } }
    ),
    level(
        'W4-MB: Prism',
        'Block the gate with a shield echo. Shatter fragile ammo on Prism\'s back, then deliver.',
        'Prism sweeps a beam and keeps a mirror on its back. Fragile ammo into that mirror is the only thing that hurts it. One heartbeat, one phase.',
        3, 2, 30, W4_MB_LAYOUT,
        {
            ...SHIELD,
            flags: {
                isBoss: true,
                bossIntro: {
                    speaker: 'PRISM',
                    text: 'The turret never stops. A yellow arc marks where the beam is about to be. The mirror is on the back — feed it glass.'
                }
            }
        }
    )
];
