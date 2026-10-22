// Ghost-shield vs laser geometry. Pure: no DOM and no state imports.
// A shielded actor blocks a beam from the direction it faces. Diagonal facing
// (both axes set) does not block — wall-slide would otherwise cheese a beam.
// The whole beam cross-section downstream of the shield face is safe, including
// the bearer. Upstream of the face stays lethal.

export const SHIELD_DEPTH = 16;

export function dominantFacing(facingX, facingY) {
    const fx = Number(facingX) || 0;
    const fy = Number(facingY) || 0;
    if (fx !== 0 && fy !== 0) return null;
    if (fx === 0 && fy === 0) return null;
    if (fx !== 0) return { x: fx > 0 ? 1 : -1, y: 0 };
    return { x: 0, y: fy > 0 ? 1 : -1 };
}

/** Slab sitting just in front of the actor, along a single facing axis. */
export function shieldSlab(actor, facing) {
    if (!actor) return null;
    const f = facing || dominantFacing(actor.facingX, actor.facingY);
    if (!f) return null;
    const depth = SHIELD_DEPTH;
    const x = actor.x;
    const y = actor.y;
    const w = actor.w || 30;
    const h = actor.h || 30;
    let slab;
    if (f.x > 0) slab = { x: x + w, y: y - 2, w: depth, h: h + 4 };
    else if (f.x < 0) slab = { x: x - depth, y: y - 2, w: depth, h: h + 4 };
    else if (f.y > 0) slab = { x: x - 2, y: y + h, w: w + 4, h: depth };
    else slab = { x: x - 2, y: y - depth, w: w + 4, h: depth };
    slab.nx = f.x;
    slab.ny = f.y;
    return slab;
}

function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Long axis of a laser rect. A square beam is treated as vertical. */
export function laserAxis(laser) {
    if (!laser) return 'y';
    return (laser.h || 0) >= (laser.w || 0) ? 'y' : 'x';
}

function facesAlong(slab, axis) {
    if (!slab) return false;
    if (axis === 'y') return slab.nx === 0 && slab.ny !== 0;
    return slab.ny === 0 && slab.nx !== 0;
}

/**
 * Front plane of a slab. downstream > 0 means the safe half is the greater coordinate
 * (face-up and face-left). downstream < 0 means the safe half is the lesser coordinate.
 */
export function shieldFront(slab) {
    if (!slab) return null;
    if (slab.ny < 0) return { axis: 'y', front: slab.y, downstream: 1 };
    if (slab.ny > 0) return { axis: 'y', front: slab.y + slab.h, downstream: -1 };
    if (slab.nx < 0) return { axis: 'x', front: slab.x, downstream: 1 };
    if (slab.nx > 0) return { axis: 'x', front: slab.x + slab.w, downstream: -1 };
    return null;
}

/** Remove [c0, c1) from a list of [start, end) spans. */
export function subtractInterval(intervals, cut) {
    if (!cut) return intervals || [];
    const c0 = cut[0];
    const c1 = cut[1];
    if (!(c1 > c0)) return intervals || [];
    const out = [];
    for (const span of intervals || []) {
        const a = span[0];
        const b = span[1];
        if (c1 <= a || c0 >= b) {
            out.push([a, b]);
            continue;
        }
        if (c0 > a) out.push([a, Math.min(b, c0)]);
        if (c1 < b) out.push([Math.max(a, c1), b]);
    }
    return out.filter(([a, b]) => b - a > 0.01);
}

function safeSpan(laser, slab) {
    const axis = laserAxis(laser);
    if (!facesAlong(slab, axis)) return null;
    if (!aabb(slab, laser)) return null;
    const front = shieldFront(slab);
    if (!front || front.axis !== axis) return null;
    const start = axis === 'y' ? laser.y : laser.x;
    const end = axis === 'y' ? laser.y + laser.h : laser.x + laser.w;
    if (front.downstream > 0) return [Math.max(start, front.front), end];
    return [start, Math.min(end, front.front)];
}

export function laserHotIntervals(laser, slabs) {
    if (!laser || laser.isOpen) return [];
    const axis = laserAxis(laser);
    const start = axis === 'y' ? laser.y : laser.x;
    const end = axis === 'y' ? laser.y + laser.h : laser.x + laser.w;
    let intervals = [[start, end]];
    for (const slab of slabs || []) {
        const span = safeSpan(laser, slab);
        if (span) intervals = subtractInterval(intervals, span);
    }
    return intervals;
}

export function laserHotRects(laser, slabs) {
    const axis = laserAxis(laser);
    return laserHotIntervals(laser, slabs).map(([a, b]) => {
        if (axis === 'y') return { x: laser.x, y: a, w: laser.w, h: b - a };
        return { x: a, y: laser.y, w: b - a, h: laser.h };
    });
}

/** True when an active laser's hot (unshielded) segment overlaps the box. */
export function laserThreatens(laser, box, slabs) {
    if (!laser || laser.isOpen || !box) return false;
    return laserHotRects(laser, slabs).some(r => aabb(box, r));
}

export function collectShieldSlabs(player, ghosts, enabled) {
    if (!enabled) return [];
    const out = [];
    const add = (actor) => {
        if (!actor || actor.isActive === false) return;
        const slab = shieldSlab(actor);
        if (slab) out.push(slab);
    };
    add(player);
    for (const g of ghosts || []) add(g);
    return out;
}

/** Sampled segment test. step is px. Used by wedge beams (Prism), not grid lasers. */
export function segmentHitsBox(x1, y1, x2, y2, box, step = 4) {
    if (!box) return false;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const inside = (px, py) => px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
    if (dist < 1e-6) return inside(x1, y1);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        if (inside(x1 + dx * t, y1 + dy * t)) return true;
    }
    return false;
}

/** The lit "safe shadow" a shield casts in each beam it cuts (empty if it faces across the beam). */
export function shieldShadowRects(lasers, slab) {
    const out = [];
    for (const laser of lasers || []) {
        if (!laser || laser.isOpen) continue;
        const span = safeSpan(laser, slab);
        if (!span || !(span[1] - span[0] > 0.01)) continue;
        if (laserAxis(laser) === 'y') out.push({ x: laser.x, y: span[0], w: laser.w, h: span[1] - span[0], laserId: laser.id });
        else out.push({ x: span[0], y: laser.y, w: span[1] - span[0], h: laser.h, laserId: laser.id });
    }
    return out;
}

/** Emitter housing at a beam's source end (top for vertical beams, left for horizontal). */
export function laserEmitterRect(laser) {
    if (!laser) return null;
    const s = 10;
    if (laserAxis(laser) === 'y') return { x: laser.x - 6, y: laser.y, w: laser.w + 12, h: s };
    return { x: laser.x, y: laser.y - 6, w: s, h: laser.h + 12 };
}

/** Plates a live beam runs through: the beam-side edges a courier cannot step across. */
export function plateBeamEdges(plates, lasers) {
    const out = [];
    for (const p of plates || []) for (const l of lasers || []) {
        if (!aabb(p, l)) continue;
        if (laserAxis(l) === 'y') out.push({ plate: p, x1: l.x, x2: l.x + l.w, y: p.y, h: p.h, axis: 'y' });
        else out.push({ plate: p, y1: l.y, y2: l.y + l.h, x: p.x, w: p.w, axis: 'x' });
    }
    return out;
}
