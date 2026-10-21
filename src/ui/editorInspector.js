// Inspector helpers (no DOM) so path/camera/gatekeeper/prism edits are testable in Node.
import { normalizeFreshTicks } from '../entities/bosses/gatekeeper.js';
import { normalizePrismParams } from '../entities/bosses/Prism.js';

export const ABILITY_IDS = ['dash', 'toss', 'cloak', 'ghostShield'];

export const MIN_WAYPOINTS = 2;

/** The live waypoint array for guards/drones (points) or robots (path), else null. */
export function getWaypoints(ent) {
    if (!ent) return null;
    if (ent.isWarden) return null;
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
    // 0 is a fixed beam. Only non-finite and negative sweeps are ignored.
    if (Number.isFinite(sweepRange) && sweepRange >= 0) cam.sweepRange = sweepRange;
    cam.currentAngle = cam.baseAngle;
    cam.sweepProgress = 0;
}

/**
 * Apply an inspector edit set. Waypoints first, then x/y (only if given) so a
 * position change translates the (possibly just-edited) route.
 * edits: { x?, y?, waypoints?: [{x,y}], baseAngle?, sweepRange? }  (angles in radians)
 */
function cleanAudits(list) {
    const clean = [];
    for (const a of (Array.isArray(list) ? list : [])) {
        if (!a || typeof a !== 'object') continue;
        const tick = Number(a.tick);
        if (!Number.isFinite(tick)) continue;
        clean.push({ plateId: a.plateId == null ? '' : String(a.plateId), tick });
    }
    return clean;
}

/** Replace a gatekeeper's audit schedule. Drops rows whose tick is not a finite number. */
export function setAudits(ent, list) {
    if (!ent) return false;
    ent.audits = cleanAudits(list);
    return true;
}

export function addAudit(ent, audit = {}) {
    if (!ent) return false;
    const tick = Number(audit.tick);
    return setAudits(ent, [...(ent.audits || []), {
        plateId: audit.plateId == null ? '' : String(audit.plateId),
        tick: Number.isFinite(tick) ? tick : 0
    }]);
}

export function removeAudit(ent, index) {
    if (!ent || !Array.isArray(ent.audits)) return false;
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= ent.audits.length) return false;
    return setAudits(ent, ent.audits.filter((_, n) => n !== i));
}

/** edits: { id?, vaultDoorId?, shields?, freshTicks?, audits?: [{plateId, tick}] } */
export function applyGatekeeperEdits(ent, edits = {}) {
    if (!ent || !edits) return;
    if (edits.id !== undefined) ent.id = edits.id == null ? '' : String(edits.id);
    if (edits.vaultDoorId !== undefined) ent.vaultDoorId = edits.vaultDoorId == null ? '' : String(edits.vaultDoorId);
    if (edits.audits) setAudits(ent, edits.audits);
    if (edits.shields !== undefined && edits.shields !== '' && Number.isFinite(Number(edits.shields))) {
        const n = Math.max(0, Math.floor(Number(edits.shields)));
        ent.maxShields = n;
        ent.shields = n;
    }
    if (Object.prototype.hasOwnProperty.call(edits, 'freshTicks')) {
        ent.freshTicks = normalizeFreshTicks(edits.freshTicks);
    }
}

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
    if (Object.prototype.hasOwnProperty.call(cfg, 'maxStunsPerLoop')) {
        const raw = cfg.maxStunsPerLoop;
        if (raw == null || raw === '') ent.maxStunsPerLoop = null;
        else {
            const n = Math.round(Number(raw));
            ent.maxStunsPerLoop = Number.isFinite(n) && n >= 1 ? n : null;
        }
    }
    if (cfg.corePlateIds != null) {
        const raw = Array.isArray(cfg.corePlateIds) ? cfg.corePlateIds : String(cfg.corePlateIds).split(',');
        ent.corePlateIds = raw.map(s => String(s).trim()).filter(Boolean);
    }
    if (cfg.defeatDoorId != null && String(cfg.defeatDoorId).trim()) {
        ent.defeatDoorId = String(cfg.defeatDoorId).trim();
    }
    return ent;
}

/** Laser id / size. isOpen stays simulation state and is not an inspector field. */
export function applyLaserConfig(ent, cfg = {}) {
    if (!ent || !cfg) return ent;
    if (cfg.id != null && String(cfg.id).trim()) ent.id = String(cfg.id).trim();
    if (cfg.w != null && cfg.w !== '' && Number(cfg.w) > 0) ent.w = Number(cfg.w);
    if (cfg.h != null && cfg.h !== '' && Number(cfg.h) > 0) ent.h = Number(cfg.h);
    return ent;
}

/** Package type plus whether delivery requires this crate. Fragile is a type, not a flag. */
export function applyPackageConfig(ent, cfg = {}) {
    if (!ent || !cfg) return ent;
    const type = cfg.packageType || cfg.type;
    if (type) ent.type = String(type);
    if (Object.prototype.hasOwnProperty.call(cfg, 'requiredForDelivery')) {
        ent.requiredForDelivery = cfg.requiredForDelivery !== false && cfg.requiredForDelivery !== 'false';
    }
    return ent;
}

/** Toggle one ability on a grants or unlocks list. Unknown ids are ignored. */
export function applyAbilityList(list, id, on) {
    if (!ABILITY_IDS.includes(id)) return Array.isArray(list) ? [...list] : [];
    const next = Array.isArray(list) ? list.filter(x => x !== id) : [];
    if (on) next.push(id);
    return next;
}

/** Prism params. hp sets both hp and maxHp. Angles are radians, telegraph is seconds. */
export function applyPrismConfig(ent, cfg = {}) {
    if (!ent || !cfg) return ent;
    const merged = {
        sweepSpeed: cfg.sweepSpeed != null && cfg.sweepSpeed !== '' ? cfg.sweepSpeed : ent.sweepSpeed,
        arc: cfg.arc != null && cfg.arc !== '' ? cfg.arc : ent.arc,
        range: cfg.range != null && cfg.range !== '' ? cfg.range : ent.range,
        hp: cfg.hp != null && cfg.hp !== '' ? cfg.hp : (ent.maxHp ?? ent.hp),
        receiverArc: cfg.receiverArc != null && cfg.receiverArc !== '' ? cfg.receiverArc : ent.receiverArc,
        telegraphTime: cfg.telegraphTime != null && cfg.telegraphTime !== '' ? cfg.telegraphTime : ent.telegraphTime,
        receiverRange: cfg.receiverRange != null && cfg.receiverRange !== '' ? cfg.receiverRange : ent.receiverRange,
        startAngle: cfg.startAngle != null && cfg.startAngle !== '' ? cfg.startAngle : ent.startAngle,
        spin: cfg.spin != null && cfg.spin !== '' ? cfg.spin : ent.spin,
        defeatDoorId: cfg.defeatDoorId != null && String(cfg.defeatDoorId).trim() ? cfg.defeatDoorId : ent.defeatDoorId,
        w: cfg.w != null && cfg.w !== '' ? cfg.w : ent.w,
        h: cfg.h != null && cfg.h !== '' ? cfg.h : ent.h
    };
    const params = normalizePrismParams(merged);
    ent.sweepSpeed = params.sweepSpeed;
    ent.arc = params.arc;
    ent.range = params.range;
    ent.hp = params.hp;
    ent.maxHp = params.hp;
    ent.receiverArc = params.receiverArc;
    ent.telegraphTime = params.telegraphTime;
    ent.receiverRange = params.receiverRange;
    ent.startAngle = params.startAngle;
    ent.spin = params.spin;
    ent.defeatDoorId = params.defeatDoorId;
    if (cfg.w != null && cfg.w !== '') ent.w = params.w;
    if (cfg.h != null && cfg.h !== '') ent.h = params.h;
    if (cfg.id != null && String(cfg.id).trim()) ent.id = String(cfg.id).trim();
    return ent;
}

function applyPositive(ent, key, raw, min) {
    if (raw == null || raw === '') return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    ent[key] = Math.max(min, n);
}

/** Inspector fields for a Warden. Angles and turn speed are degrees. */
export function applyWardenConfig(ent, cfg = {}) {
    if (!ent || !cfg) return ent;
    applyPositive(ent, 'coneLength', cfg.coneLength, 1);
    applyPositive(ent, 'coneAngle', cfg.coneAngle, 1);
    applyPositive(ent, 'turnSpeed', cfg.turnSpeed, 0);
    applyPositive(ent, 'hearRange', cfg.hearRange, 0);
    if (cfg.homeAngle != null && cfg.homeAngle !== '') {
        const n = Number(cfg.homeAngle);
        if (Number.isFinite(n)) {
            ent.homeAngle = n;
            ent.facingAngle = n * Math.PI / 180;
            ent.targetAngle = ent.facingAngle;
        }
    }
    if (cfg.relayIds != null) {
        const raw = Array.isArray(cfg.relayIds) ? cfg.relayIds : String(cfg.relayIds).split(',');
        ent.relayIds = raw.map(s => String(s).trim()).filter(Boolean);
    }
    if (cfg.defeatDoorId != null && String(cfg.defeatDoorId).trim()) {
        ent.defeatDoorId = String(cfg.defeatDoorId).trim();
    }
    if (typeof ent.setPost === 'function' && ent.startX !== undefined) ent.setPost(ent.x, ent.y);
    return ent;
}
