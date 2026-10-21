// Subfloor mini-boss. Deterministic: tick counters only, no Math.random.
// Times on the entity are seconds (60 Hz). Home is startX/startY; between strikes
// it waits there (on or under the den) and slides to the victim's crack during the
// dust telegraph so replays stay stable.
import { state } from '../../core/state.js';
import { Entity } from '../base.js';
import { AABB } from '../../core/physics.js';
import { SFX } from '../../core/audio.js';

const TICKS_PER_SECOND = 60;

export function burrowerTicks(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const tps = state.TICK_RATE > 0 ? (1000 / state.TICK_RATE) : TICKS_PER_SECOND;
    return Math.max(1, Math.round(n * tps));
}

// null = unlimited. Non-positive / blank values are unlimited so an empty inspector field
// does not freeze the boss. A positive integer is how many stuns end the surfacing cycle
// until the next rewind (a fresh instance starts the count over).
export function normalizeMaxStunsPerLoop(value) {
    if (value == null || value === '') return null;
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 1) return null;
    return n;
}

function center(a) {
    return {
        x: a.x + (a.w || 30) / 2,
        y: a.y + (a.h || 30) / 2
    };
}

export function orthoAdjacent(a, b, eps = 2) {
    if (!a || !b) return false;
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    const touchX = Math.abs((a.x + a.w) - b.x) <= eps || Math.abs((b.x + b.w) - a.x) <= eps;
    const touchY = Math.abs((a.y + a.h) - b.y) <= eps || Math.abs((b.y + b.h) - a.y) <= eps;
    return (touchX && overlapY > eps) || (touchY && overlapX > eps);
}

function tileOf(crack) {
    return { x: crack.x, y: crack.y, w: crack.w, h: crack.h };
}

function sameTile(a, b) {
    return a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export class Burrower extends Entity {
    constructor(x, y, opts = {}) {
        const w = opts.w || 36;
        const h = opts.h || 36;
        super(x, y, w, h, 'burrower');
        this.id = opts.id || 'burrower';
        this.maxHp = Math.max(1, Math.round(opts.hp ?? 3));
        this.hp = this.maxHp;
        this.surfaceInterval = opts.surfaceInterval ?? 3;
        this.telegraphTime = opts.telegraphTime ?? 1;
        this.stunTime = opts.stunTime ?? 2;
        this.maxStunsPerLoop = normalizeMaxStunsPerLoop(opts.maxStunsPerLoop);
        this.stunsThisLoop = 0;
        this.corePlateIds = Array.isArray(opts.corePlateIds) ? [...opts.corePlateIds] : [];
        this.defeatDoorId = opts.defeatDoorId || 'boss_door';
        this.startX = x;
        this.startY = y;
        this.phase = 'burrow'; // burrow | telegraph | stun | dormant | defeated
        this.phaseTicks = 0;
        this.cycleTicks = 0;
        this.lockedTile = null;
        this.teleOriginX = x;
        this.teleOriginY = y;
        this.defeated = false;
        this.stunFlash = 0;
        const saved = state.bossCheckpointLive && state.bossCheckpoint ? state.bossCheckpoint[this.id] : null;
        if (saved && Number.isFinite(saved.hp)) this.hp = saved.hp;
        if (this.hp <= 0) {
            this.hp = 0;
            this.defeated = true;
            this.phase = 'defeated';
        }
    }

    intervalTicks() { return Math.max(1, burrowerTicks(this.surfaceInterval)); }
    telegraphTicks() { return Math.max(1, burrowerTicks(this.telegraphTime)); }
    stunTicks() { return burrowerTicks(this.stunTime); }

    rememberCheckpoint() {
        if (!state.bossCheckpoint || typeof state.bossCheckpoint !== 'object') state.bossCheckpoint = {};
        state.bossCheckpoint[this.id] = { hp: this.hp };
    }

    // Nearest living actor to the burrower's current position. Ties keep the earlier actor
    // (player is listed before echoes). Inactive echoes are ignored.
    pickTarget(actors) {
        const origin = center(this);
        let best = null;
        let bestD = Infinity;
        for (const actor of actors || []) {
            if (!actor || actor.isActive === false || actor.isDestroyed) continue;
            const c = center(actor);
            const d = Math.hypot(c.x - origin.x, c.y - origin.y);
            if (d < bestD) {
                bestD = d;
                best = actor;
            }
        }
        return best;
    }

    nearestCrack(actor) {
        if (!actor) return null;
        const aim = center(actor);
        let best = null;
        let bestD = Infinity;
        let bestX = Infinity;
        let bestY = Infinity;
        for (const crack of state.cracks || []) {
            if (!crack || crack.broken) continue;
            const c = center(crack);
            const d = Math.hypot(c.x - aim.x, c.y - aim.y);
            const tie = Math.abs(d - bestD) <= 1e-6;
            const better = d < bestD - 1e-6 || (tie && (crack.x < bestX || (crack.x === bestX && crack.y < bestY)));
            if (better) {
                best = crack;
                bestD = d;
                bestX = crack.x;
                bestY = crack.y;
            }
        }
        return best ? tileOf(best) : null;
    }

    findCrack(tile) {
        if (!tile) return null;
        return (state.cracks || []).find(c => sameTile(c, tile)) || null;
    }

    plateIsHot(plate, actors) {
        if (!plate) return false;
        if (plate.isPressed) return true;
        for (const actor of actors || []) {
            if (!actor || actor.isActive === false) continue;
            if (AABB(plate.x, plate.y, plate.w, plate.h, actor.x, actor.y, actor.w || 30, actor.h || 30)) return true;
        }
        for (const pkg of state.packages || []) {
            if (!pkg || pkg.isDestroyed || pkg.carriedBy) continue;
            if (AABB(plate.x, plate.y, plate.w, plate.h, pkg.x, pkg.y, pkg.w, pkg.h)) return true;
        }
        return false;
    }

    // Surfacing on a crack that shares an edge with a pressed core plate.
    tileStuns(tile, actors) {
        if (!tile) return false;
        const ids = this.corePlateIds || [];
        for (const plate of state.plates || []) {
            if (!ids.includes(plate.id)) continue;
            if (!orthoAdjacent(tile, plate)) continue;
            if (this.plateIsHot(plate, actors)) return true;
        }
        return false;
    }

    openDefeatDoor() {
        const door = (state.doors || []).find(d => d.id === this.defeatDoorId);
        if (door) door.isOpen = true;
    }

    goHome() {
        this.x = this.startX;
        this.y = this.startY;
    }

    beginTelegraph(actor) {
        this.phase = 'telegraph';
        this.phaseTicks = 0;
        this.lockedTile = this.nearestCrack(actor);
        this.teleOriginX = this.x;
        this.teleOriginY = this.y;
        this.stunFlash = 0;
    }

    slideToTile() {
        const tile = this.lockedTile;
        if (!tile) return;
        const total = this.telegraphTicks();
        const t = Math.min(1, this.phaseTicks / total);
        const destX = tile.x + tile.w / 2 - this.w / 2;
        const destY = tile.y + tile.h / 2 - this.h / 2;
        this.x = this.teleOriginX + (destX - this.teleOriginX) * t;
        this.y = this.teleOriginY + (destY - this.teleOriginY) * t;
    }

    strike(actors) {
        const tile = this.lockedTile;
        const crack = this.findCrack(tile);
        if (crack && typeof crack.startCollapse === 'function') crack.startCollapse();
        if (this.tileStuns(tile, actors)) {
            this.hp -= 1;
            this.rememberCheckpoint();
            this.stunFlash = 20;
            if (this.hp <= 0) {
                this.hp = 0;
                this.defeated = true;
                this.phase = 'defeated';
                this.phaseTicks = 0;
                this.openDefeatDoor();
                SFX.bossPhase();
            } else {
                this.phase = 'stun';
                this.phaseTicks = 0;
                SFX.bossPhase();
            }
            return;
        }
        this.phase = 'burrow';
        this.phaseTicks = 0;
        this.cycleTicks = 0;
        this.lockedTile = null;
        this.goHome();
    }

    // Stun is a pause, then the surface cycle starts over from home.
    // A positive maxStunsPerLoop leaves the boss dormant until rewind instead.
    recoverFromStun() {
        this.stunsThisLoop += 1;
        this.phaseTicks = 0;
        this.lockedTile = null;
        this.goHome();
        const cap = this.maxStunsPerLoop;
        if (cap != null && this.stunsThisLoop >= cap) {
            this.phase = 'dormant';
            return;
        }
        this.phase = 'burrow';
        this.cycleTicks = 0;
    }

    update(actors) {
        if (this.stunFlash > 0) this.stunFlash--;
        if (this.defeated || this.hp <= 0) {
            this.defeated = true;
            this.phase = 'defeated';
            this.openDefeatDoor();
            return;
        }
        if (this.phase === 'stun') {
            this.phaseTicks++;
            if (this.phaseTicks >= this.stunTicks()) this.recoverFromStun();
            return;
        }
        if (this.phase === 'dormant') return;
        if (this.phase === 'telegraph') {
            this.phaseTicks++;
            this.slideToTile();
            if (this.phaseTicks >= this.telegraphTicks()) this.strike(actors);
            return;
        }
        this.cycleTicks++;
        if (this.cycleTicks >= this.intervalTicks()) {
            this.cycleTicks = 0;
            const target = this.pickTarget(actors);
            if (target) this.beginTelegraph(target);
        }
    }

    render(ctx) {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const tick = state.currentTick || 0;
        ctx.save();
        if (this.phase === 'telegraph' && this.lockedTile) {
            const tcx = this.lockedTile.x + this.lockedTile.w / 2;
            const tcy = this.lockedTile.y + this.lockedTile.h / 2;
            const u = this.phaseTicks / Math.max(1, this.telegraphTicks());
            for (let i = 0; i < 3; i++) {
                const radius = 8 + u * (18 + i * 10);
                ctx.beginPath();
                ctx.lineWidth = 2;
                ctx.strokeStyle = `rgba(210, 180, 120, ${0.85 - i * 0.22})`;
                ctx.arc(tcx, tcy, radius, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.fillStyle = `rgba(90, 60, 30, ${0.25 + 0.2 * Math.sin(tick * 0.4)})`;
            ctx.beginPath();
            ctx.arc(tcx, tcy, 10 + u * 6, 0, Math.PI * 2);
            ctx.fill();
        }
        const bob = this.phase === 'burrow' ? Math.sin(tick * 0.15) * 2 : 0;
        ctx.fillStyle = this.defeated ? 'rgba(80, 70, 60, 0.7)' : 'rgba(40, 28, 18, 0.92)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + bob, this.w * 0.46, this.h * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = this.phase === 'stun' ? '#ffdd00' : '#e6c27a';
        ctx.lineWidth = this.phase === 'stun' ? 3 : 1.5;
        ctx.stroke();
        if (this.phase === 'stun' || this.stunFlash > 0) {
            ctx.strokeStyle = `rgba(255, 220, 80, ${0.4 + 0.4 * Math.sin(tick * 0.6)})`;
            ctx.beginPath();
            ctx.arc(cx, cy, this.w * 0.7, 0, Math.PI * 2);
            ctx.stroke();
        }
        const pips = Math.max(this.maxHp, this.hp);
        const pipW = 8;
        const gap = 3;
        const total = pips * pipW + (pips - 1) * gap;
        let px = cx - total / 2;
        const py = this.y - 10;
        for (let i = 0; i < pips; i++) {
            ctx.fillStyle = i < this.hp ? '#ff8844' : 'rgba(255,255,255,0.2)';
            ctx.fillRect(px, py, pipW, 4);
            px += pipW + gap;
        }
        ctx.restore();
    }
}
