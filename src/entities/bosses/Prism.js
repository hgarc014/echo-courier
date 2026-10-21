// Beamworks mini-boss. A turret whose beam angle is a function of the loop tick
// (calling update twice in one tick does not spin it twice). Checkpoint stores hp.
import { state, getUnlockedAbilities } from '../../core/state.js';
import { Entity } from '../base.js';
import { SFX } from '../../core/audio.js';
import { collectShieldSlabs, segmentHitsBox } from '../../systems/laserShield.js';

const TICKS_PER_SECOND = 60;

export const PRISM_DEFAULTS = {
    sweepSpeed: Math.PI / 2 / 3,
    arc: Math.PI / 12,
    range: 240,
    hp: 3,
    receiverArc: Math.PI / 2,
    telegraphTime: 0.75,
    receiverRange: 78,
    startAngle: 0,
    spin: 1,
    defeatDoorId: 'boss_door',
    w: 48,
    h: 48
};

function finiteOr(value, fallback) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function positiveOr(value, fallback) {
    const n = finiteOr(value, fallback);
    return n > 0 ? n : fallback;
}

/** Clamp inspector / layout fields. Non-positive rates and arcs fall back to defaults. */
export function normalizePrismParams(opts = {}) {
    const o = opts || {};
    const spinRaw = finiteOr(o.spin, PRISM_DEFAULTS.spin);
    const spin = spinRaw === 0 ? PRISM_DEFAULTS.spin : (spinRaw > 0 ? 1 : -1);
    return {
        sweepSpeed: positiveOr(o.sweepSpeed, PRISM_DEFAULTS.sweepSpeed),
        arc: positiveOr(o.arc, PRISM_DEFAULTS.arc),
        range: positiveOr(o.range, PRISM_DEFAULTS.range),
        hp: Math.max(1, Math.round(finiteOr(o.hp, PRISM_DEFAULTS.hp))),
        receiverArc: positiveOr(o.receiverArc, PRISM_DEFAULTS.receiverArc),
        telegraphTime: positiveOr(o.telegraphTime, PRISM_DEFAULTS.telegraphTime),
        receiverRange: positiveOr(o.receiverRange, PRISM_DEFAULTS.receiverRange),
        startAngle: finiteOr(o.startAngle, PRISM_DEFAULTS.startAngle),
        spin,
        defeatDoorId: (o.defeatDoorId && String(o.defeatDoorId).trim()) || PRISM_DEFAULTS.defeatDoorId,
        w: positiveOr(o.w, PRISM_DEFAULTS.w),
        h: positiveOr(o.h, PRISM_DEFAULTS.h)
    };
}

export function prismTicksPerSecond() {
    return state.TICK_RATE > 0 ? (1000 / state.TICK_RATE) : TICKS_PER_SECOND;
}

export function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d <= -Math.PI) d += Math.PI * 2;
    return d;
}

function centerOf(box) {
    return {
        x: box.x + (box.w || 30) / 2,
        y: box.y + (box.h || 30) / 2
    };
}

function rayRectDistance(ox, oy, dx, dy, rx, ry, rw, rh) {
    const minX = rx;
    const maxX = rx + rw;
    const minY = ry;
    const maxY = ry + rh;
    let tmin = 0;
    let tmax = Infinity;
    const axes = [[dx, ox, minX, maxX], [dy, oy, minY, maxY]];
    for (const [d, o, mn, mx] of axes) {
        if (Math.abs(d) < 1e-12) {
            if (o < mn || o > mx) return null;
            continue;
        }
        let t1 = (mn - o) / d;
        let t2 = (mx - o) / d;
        if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
    }
    if (tmax < 0) return null;
    return tmin < 0 ? 0 : tmin;
}

/** Distance along a ray until the first wall or shield slab. Doors are not blockers. */
export function blockerRayDistance(x, y, angle, maxDist, blockers) {
    const max = Number(maxDist);
    if (!Number.isFinite(max) || max <= 0) return 0;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = max;
    for (const w of blockers || []) {
        if (!w) continue;
        const rw = Number(w.w);
        const rh = Number(w.h);
        if (!Number.isFinite(rw) || !Number.isFinite(rh) || rw <= 0 || rh <= 0) continue;
        const hit = rayRectDistance(x, y, dx, dy, w.x || 0, w.y || 0, rw, rh);
        if (hit != null && hit < best) best = hit;
    }
    return best;
}

function traceSector(ctx, ox, oy, a0, a1, range, blockers) {
    const start = Math.min(a0, a1);
    const end = Math.max(a0, a1);
    const span = end - start;
    const samples = Math.max(8, Math.ceil(span / (Math.PI / 48)));
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    for (let i = 0; i <= samples; i++) {
        const a = start + (span * i) / samples;
        const dist = blockerRayDistance(ox, oy, a, range, blockers);
        ctx.lineTo(ox + Math.cos(a) * dist, oy + Math.sin(a) * dist);
    }
    ctx.closePath();
}

function visualBlockers() {
    const walls = state.walls || [];
    if (!getUnlockedAbilities().includes('ghostShield')) return walls;
    const slabs = collectShieldSlabs(state.player, state.activeGhosts, true);
    return slabs.length ? walls.concat(slabs) : walls;
}

export class Prism extends Entity {
    constructor(x, y, opts = {}) {
        const params = normalizePrismParams(opts);
        super(x, y, params.w, params.h, 'prism');
        this.id = opts.id || 'prism';
        this.sweepSpeed = params.sweepSpeed;
        this.arc = params.arc;
        this.range = params.range;
        this.maxHp = params.hp;
        this.hp = params.hp;
        this.receiverArc = params.receiverArc;
        this.telegraphTime = params.telegraphTime;
        this.receiverRange = params.receiverRange;
        this.startAngle = params.startAngle;
        this.spin = params.spin;
        this.defeatDoorId = params.defeatDoorId;
        this.defeated = false;
        const saved = state.bossCheckpointLive && state.bossCheckpoint ? state.bossCheckpoint[this.id] : null;
        if (saved && Number.isFinite(saved.hp)) this.hp = saved.hp;
        if (this.hp <= 0) {
            this.hp = 0;
            this.defeated = true;
        }
    }

    beamAngle(tick = state.currentTick || 0) {
        const seconds = (tick || 0) / prismTicksPerSecond();
        return this.startAngle + this.spin * this.sweepSpeed * seconds;
    }

    beamCoversAngle(angle, tick = state.currentTick || 0) {
        return Math.abs(angleDiff(angle, this.beamAngle(tick))) <= this.arc / 2 + 1e-9;
    }

    /** Signed angle ahead of the beam center, in the spin direction. */
    signedAhead(angle, tick = state.currentTick || 0) {
        return angleDiff(angle, this.beamAngle(tick)) * this.spin;
    }

    /** Sector the beam will enter during telegraphTime, not including the beam itself. */
    telegraphCoversAngle(angle, tick = state.currentTick || 0) {
        const ahead = this.signedAhead(angle, tick);
        const lead = this.arc / 2;
        const reach = lead + this.sweepSpeed * this.telegraphTime;
        return ahead > lead + 1e-9 && ahead <= reach + 1e-9;
    }

    origin() {
        return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
    }

    rememberCheckpoint() {
        if (!state.bossCheckpoint || typeof state.bossCheckpoint !== 'object') state.bossCheckpoint = {};
        state.bossCheckpoint[this.id] = { hp: this.hp };
    }

    openDefeatDoor() {
        const door = (state.doors || []).find(d => d.id === this.defeatDoorId);
        if (door) door.isOpen = true;
    }

    _rayBlocked(x, y, blockers) {
        const origin = this.origin();
        const dx = x - origin.x;
        const dy = y - origin.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-6) return false;
        const pad = Math.hypot(this.w, this.h) / 2 + 1;
        if (dist <= pad) return false;
        const x1 = origin.x + (dx / dist) * pad;
        const y1 = origin.y + (dy / dist) * pad;
        const walls = blockers?.walls || [];
        for (const wall of walls) {
            if (segmentHitsBox(x1, y1, x, y, wall)) return true;
        }
        for (const slab of blockers?.slabs || []) {
            if (segmentHitsBox(x1, y1, x, y, slab)) return true;
        }
        return false;
    }

    /**
     * Beam covers the point this tick and nothing (wall or shield slab) stops the ray.
     * A bearer facing the turret blocks their own ray, so standing in the beam is safe
     * only while they face the emitter.
     */
    coversPoint(x, y, tick = state.currentTick || 0, blockers = null) {
        if (this.defeated || this.hp <= 0) return false;
        const origin = this.origin();
        const dx = x - origin.x;
        const dy = y - origin.y;
        const dist = Math.hypot(dx, dy);
        if (dist > this.range || dist < 1) return false;
        const angle = Math.atan2(dy, dx);
        if (!this.beamCoversAngle(angle, tick)) return false;
        if (this._rayBlocked(x, y, blockers)) return false;
        return true;
    }

    coversBox(box, tick, blockers) {
        if (!box) return false;
        const c = centerOf(box);
        return this.coversPoint(c.x, c.y, tick, blockers);
    }

    actorBox(pkg, world) {
        if (!pkg) return null;
        const carried = pkg.carriedBy;
        if (carried === 'player' && world?.player) return world.player;
        if (typeof carried === 'string' && carried.startsWith('ghost_')) {
            const id = Number(carried.slice(6));
            const ghost = (world?.ghosts || []).find(g => g.id === id);
            if (ghost) return ghost;
        }
        return pkg;
    }

    receiverHit(pkg, tick = state.currentTick || 0, world = null) {
        if (!pkg || pkg.isDestroyed || pkg.type !== 'fragile') return false;
        if (this.defeated || this.hp <= 0) return false;
        const box = this.actorBox(pkg, world);
        if (!box) return false;
        const origin = this.origin();
        const c = centerOf(box);
        const dx = c.x - origin.x;
        const dy = c.y - origin.y;
        const dist = Math.hypot(dx, dy);
        if (dist > this.receiverRange || dist < 1) return false;
        const back = this.beamAngle(tick) + Math.PI;
        return Math.abs(angleDiff(Math.atan2(dy, dx), back)) <= this.receiverArc / 2 + 1e-9;
    }

    /**
     * Receiver hits first (fragile shatter on the back = 1 HP, no level fail).
     * Then the beam burns the player and breaks any fragile still in it.
     * Returns a fail string, or null.
     */
    update(world = {}) {
        if (this.defeated || this.hp <= 0) {
            this.hp = 0;
            this.defeated = true;
            this.openDefeatDoor();
            return null;
        }
        const tick = state.currentTick || 0;
        const packages = world.packages || state.packages || [];
        const walls = world.walls || state.walls || [];
        const slabs = world.slabs || [];
        const player = world.player !== undefined ? world.player : state.player;
        const ghosts = world.ghosts || state.activeGhosts || [];
        const actors = { player, ghosts };
        const blockers = { walls, slabs };

        for (const pkg of packages) {
            if (!this.receiverHit(pkg, tick, actors)) continue;
            pkg.breakApart('shatter');
            SFX.break();
            SFX.bossPhase();
            this.hp -= 1;
            if (this.hp <= 0) {
                this.hp = 0;
                this.defeated = true;
                this.rememberCheckpoint();
                this.openDefeatDoor();
                return null;
            }
            this.rememberCheckpoint();
        }
        if (this.defeated || this.hp <= 0) {
            this.openDefeatDoor();
            return null;
        }

        for (const pkg of packages) {
            if (!pkg || pkg.isDestroyed || pkg.type !== 'fragile') continue;
            const box = this.actorBox(pkg, actors);
            if (!this.coversBox(box, tick, blockers)) continue;
            pkg.breakApart('vapor');
            SFX.break();
            SFX.laserHit();
            return 'Fragile Package Destroyed!';
        }
        if (player && (player.cloakTimer || 0) <= 0 && this.coversBox(player, tick, blockers)) {
            SFX.laserHit();
            return 'Burned by Prism Beam!';
        }
        return null;
    }

    render(ctx) {
        if (!ctx || typeof ctx.save !== 'function') return;
        const tick = state.currentTick || 0;
        const origin = this.origin();
        const angle = this.beamAngle(tick);
        ctx.save();
        if (!this.defeated && this.hp > 0) {
            const blockers = visualBlockers();
            const lead = this.arc / 2;
            const reach = lead + this.sweepSpeed * this.telegraphTime;
            const a0 = angle + this.spin * lead;
            const a1 = angle + this.spin * reach;
            ctx.fillStyle = 'rgba(255, 220, 40, 0.18)';
            traceSector(ctx, origin.x, origin.y, a0, a1, this.range, blockers);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 40, 40, 0.28)';
            traceSector(ctx, origin.x, origin.y, angle - this.arc / 2, angle + this.arc / 2, this.range, blockers);
            ctx.fill();
            const beamReach = blockerRayDistance(origin.x, origin.y, angle, this.range, blockers);
            ctx.strokeStyle = 'rgba(255, 60, 60, 0.9)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(origin.x, origin.y);
            ctx.lineTo(origin.x + Math.cos(angle) * beamReach, origin.y + Math.sin(angle) * beamReach);
            ctx.stroke();
            const back = angle + Math.PI;
            ctx.strokeStyle = 'rgba(255, 180, 40, 0.95)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(origin.x, origin.y, this.receiverRange, back - this.receiverArc / 2, back + this.receiverArc / 2);
            ctx.stroke();
        }
        ctx.fillStyle = this.defeated ? 'rgba(80, 90, 110, 0.85)' : 'rgba(20, 24, 36, 0.95)';
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.strokeStyle = this.defeated ? '#667' : '#9cf';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.w, this.h);
        const pips = Math.max(this.maxHp, this.hp);
        const pipW = 8;
        const gap = 3;
        const total = pips * pipW + (pips - 1) * gap;
        let px = origin.x - total / 2;
        const py = this.y - 10;
        for (let i = 0; i < pips; i++) {
            ctx.fillStyle = i < this.hp ? '#ff4466' : 'rgba(255,255,255,0.2)';
            ctx.fillRect(px, py, pipW, 4);
            px += pipW + gap;
        }
        ctx.restore();
    }
}

export function serializePrism(prism) {
    const params = normalizePrismParams(prism || {});
    return {
        x: prism.x,
        y: prism.y,
        w: prism.w,
        h: prism.h,
        id: prism.id,
        hp: prism.maxHp ?? params.hp,
        sweepSpeed: prism.sweepSpeed,
        arc: prism.arc,
        range: prism.range,
        receiverArc: prism.receiverArc,
        telegraphTime: prism.telegraphTime,
        receiverRange: prism.receiverRange,
        startAngle: prism.startAngle,
        spin: prism.spin,
        defeatDoorId: prism.defeatDoorId || params.defeatDoorId
    };
}
