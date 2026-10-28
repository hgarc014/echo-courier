// Procedural short floor: 3-5 rooms in one horizontal row, one wide layout.
// Plain data in the deserializeLevel schema, so it loads like an editor layout.
// Everything is readable from the screen: plain doors and plates, no timers.
//
// Each room is ROOM_W x H. Rooms are split by walls with a gap at y=240..360.
// - Plain gap: one door with its plate under the doorway. Walking up opens it.
// - Airlock gap (exactly one per floor): two doors back to back (W5-L1 pattern),
//   each held by a plate in an opposite corner of the room before it. One
//   courier cannot hold both, so that room needs an echo.

export const ROOM_W = 600;
export const H = 600;
export const GAP_Y = 240;
export const GAP_H = 120;
export const LANE_Y = 285;

// mulberry32: tiny seeded PRNG, deterministic across platforms.
export function makeRng(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return function rng() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const pick = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/**
 * generateFloor(seed, roomCount?) -> { layout, meta, info }
 * layout: deserializeLevel-compatible data. info: where the echo room is (for tests/harness).
 */
export function generateFloor(seed, roomCount) {
    const rng = makeRng(seed);
    const n = roomCount == null ? pick(rng, 3, 5) : Math.max(3, Math.min(5, Math.floor(roomCount)));
    const W = n * ROOM_W;
    const echoRoom = pick(rng, 0, n - 2); // the gap after this room is the airlock
    const walls = [
        { x: 0, y: 0, w: W, h: 20 },
        { x: 0, y: H - 20, w: W, h: 20 },
        { x: 0, y: 0, w: 20, h: H },
        { x: W - 20, y: 0, w: 20, h: H }
    ];
    const doors = [];
    const plates = [];
    let airlock = null;
    for (let i = 0; i < n - 1; i++) {
        const gx = (i + 1) * ROOM_W - 20;
        const thick = i === echoRoom ? 40 : 20;
        walls.push({ x: gx, y: 20, w: thick, h: GAP_Y - 20 });
        walls.push({ x: gx, y: GAP_Y + GAP_H, w: thick, h: H - 20 - GAP_Y - GAP_H });
        if (i === echoRoom) {
            const left = i * ROOM_W;
            // Opposite corners; which door the top plate holds is seeded.
            const topX = left + pick(rng, 2, 6) * 20;
            const botX = left + pick(rng, 2, 6) * 20;
            const flip = rng() < 0.5;
            const dA = `d${i}a`, dB = `d${i}b`;
            doors.push({ x: gx, y: GAP_Y, w: 20, h: GAP_H, id: dA, type: 'standard' });
            doors.push({ x: gx + 20, y: GAP_Y, w: 20, h: GAP_H, id: dB, type: 'standard' });
            const top = { x: topX, y: 60, linkedIds: [flip ? dB : dA], id: `p${i}top`, type: 'standard' };
            const bot = { x: botX, y: 500, linkedIds: [flip ? dA : dB], id: `p${i}bot`, type: 'standard' };
            plates.push(top, bot);
            airlock = { room: i, doors: [dA, dB], top: { id: top.id, x: topX, y: 60 }, bottom: { id: bot.id, x: botX, y: 500 }, gapX: gx };
        } else {
            const id = `d${i}`;
            doors.push({ x: gx, y: GAP_Y, w: 20, h: GAP_H, id, type: 'standard' });
            // Plate under the doorway: whoever walks up holds it open while passing.
            plates.push({ x: gx - 10, y: 280, linkedIds: [id], id: `p${i}`, type: 'standard' });
        }
    }
    const pkgY = pick(rng, 5, 23) * 20;
    const zoneY = pick(rng, 3, 17) * 20;
    const layout = {
        width: W, height: H, mapWidth: W, mapHeight: H,
        player: { x: 100, y: LANE_Y },
        deliveryZone: { x: W - 180, y: zoneY, w: 120, h: 120 },
        walls, doors, plates,
        packages: [{ x: 300, y: pkgY, id: 'pkg1', packageType: 'standard', requiredForDelivery: true }],
        lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: [], hints: []
    };
    const meta = floorMeta(seed, n);
    return { layout, meta, info: { seed, roomCount: n, echoRoom, airlock } };
}

export function floorMeta(seed, roomCount) {
    return {
        name: `Floor ${seed}`,
        obj: `Cross ${roomCount} rooms. One airlock needs an echo on a plate.`,
        maxGhosts: 2,
        par: 3,
        loopTime: null
    };
}
