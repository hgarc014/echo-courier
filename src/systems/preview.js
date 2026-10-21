// Timeline preview: scrubber sampling + future hazard prediction for echoes.
// Pure helpers (no DOM/state imports) so they are Node-testable.

export function sampleRun(run, t) {
    if (!run || !run.length) return null;
    const i = Math.max(0, Math.min(run.length - 1, Math.floor(t)));
    return run[i];
}

function aabb(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}

/** Camera sweep angle `ahead` ticks from now, mirroring SweepCamera's non-tracking update. */
export function cameraAngleAhead(cam, ahead) {
    let p = cam.sweepProgress || 0, dir = cam.sweepDir || 0.01;
    for (let i = 0; i < ahead; i++) {
        p += dir;
        if (p >= 1 || p <= -1) dir *= -1;
    }
    return cam.baseAngle + p * cam.sweepRange;
}

function inCone(cam, angle, x, y) {
    const dx = (x + 15) - (cam.x + 15), dy = (y + 15) - (cam.y + 15);
    if (Math.hypot(dx, dy) > 250) return false;
    let d = Math.atan2(dy, dx) - angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) < 0.35;
}

/**
 * First future hazard hit per echo: a closed laser overlap or a camera-cone sighting.
 * Lasers use their current open state (plate-driven, not predictable ahead); cameras
 * replay their deterministic sweep. Returns [{ ghostId, tick, x, y, kind }].
 */
export function predictEchoHazards(ghosts, cameras, lasers, opts = {}) {
    const step = opts.step || 2;
    const out = [];
    const cams = (cameras || []).filter(c => !c.trackingPlayer);
    const closed = (lasers || []).filter(l => !l.isOpen);
    for (const g of ghosts || []) {
        if (!g || g.isActive === false || !g.runData || !g.runData.length) continue;
        const start = Math.floor(g.localTick || 0) + 1;
        const w = g.w || 30, h = g.h || 30;
        const sweep = cams.map(c => ({ c, p: c.sweepProgress || 0, dir: c.sweepDir || 0.01 }));
        for (let t = start; t < g.runData.length; t++) {
            for (const k of sweep) { k.p += k.dir; if (k.p >= 1 || k.p <= -1) k.dir *= -1; }
            if ((t - start) % step) continue;
            const s = g.runData[t];
            if (!s || !Number.isFinite(s.x)) continue;
            let kind = null;
            if (closed.some(l => aabb(s.x, s.y, w, h, l.x, l.y, l.w, l.h))) kind = 'laser';
            else if (sweep.some(k => inCone(k.c, k.c.baseAngle + k.p * k.c.sweepRange, s.x, s.y))) kind = 'camera';
            if (kind) { out.push({ ghostId: g.id, tick: t, x: s.x, y: s.y, kind }); break; }
        }
    }
    return out;
}
