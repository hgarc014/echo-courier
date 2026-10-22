// Where the loop-countdown ring sits: the first corner whose footprint covers
// no key entity (spawn, plates, robots, packages, drop zone, doors, guards, lasers).
export const LOOP_RING_R = 26;
const PAD = 8;

/** Screen footprint of the ring centred at (cx, cy), including the SEC label. */
export function loopRingBox(cx, cy) {
    const r = LOOP_RING_R + 4;
    return { x: cx - r - PAD, y: cy - r - PAD, w: 2 * (r + PAD), h: 2 * r + 2 * PAD + 18 };
}

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Key-entity rects from a level layout (serialized data) or live state. */
export function loopRingKeyRects(src) {
    const out = [];
    const add = (e, w = 30, h = 30) => {
        if (!e) return;
        const x = e.startX ?? e.x; const y = e.startY ?? e.y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        out.push({ x, y, w: e.w ?? w, h: e.h ?? h });
    };
    add(src.player);
    if (src.deliveryZone) add(src.deliveryZone, 70, 70);
    for (const k of ['plates', 'packages', 'doors', 'guards', 'lasers', 'cameras', 'drones', 'prisms', 'gatekeepers']) {
        for (const e of (src[k] || [])) add(e, k === 'plates' ? 40 : 30, k === 'plates' ? 40 : 30);
    }
    for (const r of (src.robots || [])) add(r.path?.[0] ? { ...r.path[0], w: r.w ?? 34, h: r.h ?? 34 } : r, 34, 34);
    return out;
}

export function loopRingCandidates(mapW = 800, mapH = 600) {
    const m = 58;
    return [
        { x: m, y: m }, { x: mapW - m, y: m }, { x: m, y: mapH - m - 14 }, { x: mapW - m, y: mapH - m - 14 },
        { x: mapW / 2, y: m },
    ];
}

/** First candidate centre whose box overlaps no key rect (falls back to top-left). */
export function pickLoopRingCenter(rects, mapW = 800, mapH = 600) {
    const cands = loopRingCandidates(mapW, mapH);
    for (const c of cands) {
        const box = loopRingBox(c.x, c.y);
        if (!rects.some(r => overlap(box, r))) return c;
    }
    return cands[0];
}

export function ringOverlaps(center, rects) {
    const box = loopRingBox(center.x, center.y);
    return rects.filter(r => overlap(box, r));
}
