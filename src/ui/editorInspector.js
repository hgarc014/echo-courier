// Pure inspector helpers (no DOM, no imports) so path/camera edits are testable in Node.

export const MIN_WAYPOINTS = 2;

/** The live waypoint array for guards/drones (points) or robots (path), else null. */
export function getWaypoints(ent) {
    if (!ent) return null;
    if (Array.isArray(ent.points)) return ent.points;
    if (Array.isArray(ent.path)) return ent.path;
    return null;
}

function resetPatrol(ent) {
    if (ent.startX !== undefined) { ent.startX = ent.x; ent.startY = ent.y; }
    if (ent.targetIndex !== undefined) ent.targetIndex = 1;
    if (ent.pathIndex !== undefined) ent.pathIndex = 0;
}

/** Move an entity; any waypoint path translates with it so spawn and route stay together. */
export function moveEntityTo(ent, x, y) {
    if (!ent || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const pts = getWaypoints(ent);
    const originX = pts && pts.length ? pts[0].x : ent.x;
    const originY = pts && pts.length ? pts[0].y : ent.y;
    const dx = x - originX; const dy = y - originY;
    if (pts) for (const p of pts) { p.x += dx; p.y += dy; }
    ent.x = x; ent.y = y;
    resetPatrol(ent);
}

/** Replace waypoints in place (keeps array identity); entity snaps to waypoint 0. */
export function setWaypoints(ent, list) {
    const pts = getWaypoints(ent);
    if (!pts) return false;
    const clean = (list || [])
        .map(p => ({ x: Number(p.x), y: Number(p.y) }))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (clean.length < MIN_WAYPOINTS) return false;
    pts.length = 0;
    pts.push(...clean);
    ent.x = pts[0].x; ent.y = pts[0].y;
    resetPatrol(ent);
    return true;
}

export function addWaypoint(ent) {
    const pts = getWaypoints(ent);
    if (!pts || !pts.length) return false;
    const last = pts[pts.length - 1];
    return setWaypoints(ent, [...pts, { x: last.x + 40, y: last.y }]);
}

export function removeWaypoint(ent, index) {
    const pts = getWaypoints(ent);
    if (!pts || pts.length <= MIN_WAYPOINTS || index < 0 || index >= pts.length) return false;
    return setWaypoints(ent, pts.filter((_, i) => i !== index));
}

export const degToRad = d => (Number(d) * Math.PI) / 180;
export const radToDeg = r => Math.round(((Number(r) || 0) * 180 / Math.PI) * 100) / 100;

/** Camera config (radians). Restarts the sweep so the change is visible immediately. */
export function applyCameraConfig(cam, { baseAngle, sweepRange } = {}) {
    if (!cam) return;
    if (Number.isFinite(baseAngle)) cam.baseAngle = baseAngle;
    if (Number.isFinite(sweepRange) && sweepRange > 0) cam.sweepRange = sweepRange;
    cam.currentAngle = cam.baseAngle;
    cam.sweepProgress = 0;
}

/**
 * Apply an inspector edit set. Waypoints first, then x/y (only if given) so a
 * position change translates the (possibly just-edited) route.
 * edits: { x?, y?, waypoints?: [{x,y}], baseAngle?, sweepRange? }  (angles in radians)
 */
export function applyInspectorEdits(ent, edits = {}) {
    if (!ent) return;
    if (edits.waypoints) setWaypoints(ent, edits.waypoints);
    const hasX = Number.isFinite(edits.x); const hasY = Number.isFinite(edits.y);
    if (hasX || hasY) moveEntityTo(ent, hasX ? edits.x : ent.x, hasY ? edits.y : ent.y);
    if (edits.baseAngle !== undefined || edits.sweepRange !== undefined) applyCameraConfig(ent, edits);
}

/** Inspector fields for a Burrower. Times are seconds. hp sets both hp and maxHp. */
export function applyBurrowerConfig(ent, cfg = {}) {
    if (!ent || !cfg) return ent;
    if (cfg.hp != null && cfg.hp !== '') {
        const hp = Math.max(1, Math.round(Number(cfg.hp)) || 1);
        ent.hp = hp;
        ent.maxHp = hp;
    }
    const applySeconds = (key, min) => {
        if (cfg[key] == null || cfg[key] === '') return;
        const n = Number(cfg[key]);
        if (!Number.isFinite(n)) return;
        ent[key] = Math.max(min, n);
    };
    applySeconds('surfaceInterval', 0.05);
    applySeconds('telegraphTime', 0.05);
    applySeconds('stunTime', 0);
    if (cfg.corePlateIds != null) {
        const raw = Array.isArray(cfg.corePlateIds) ? cfg.corePlateIds : String(cfg.corePlateIds).split(',');
        ent.corePlateIds = raw.map(s => String(s).trim()).filter(Boolean);
    }
    if (cfg.defeatDoorId != null && String(cfg.defeatDoorId).trim()) {
        ent.defeatDoorId = String(cfg.defeatDoorId).trim();
    }
    return ent;
}
