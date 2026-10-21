// Subfloor mini-boss. Deterministic: tick counters only, no Math.random.
// Times on the entity are seconds (60 Hz). Home is startX/startY; between strikes
// it waits there (on or under the den) and slides to the victim's crack during the
// dust telegraph so replays stay stable.
import { state } from '../../core/state.js';
import { Entity } from '../base.js';
import { AABB } from '../../core/physics.js';
import { SFX } from '../../core/audio.js';
import { actorPressesPlate, killZone } from '../../core/hitZones.js';
import { drawKillRing } from '../hazards.js';

const TICKS_PER_SECOND = 60;

export function burrowerTicks(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const tps = state.TICK_RATE > 0 ? (1000 / state.TICK_RATE) : TICKS_PER_SECOND;
    return Math.max(1, Math.round(n * tps));
}

function ticksPerSecond() {
    return state.TICK_RATE > 0 ? (1000 / state.TICK_RATE) : TICKS_PER_SECOND;
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

// Ghosts carry a numeric id (and runData). The live courier does not.
export function actorTargetInfo(actor) {
    if (!actor) return { kind: null, id: null };
    if (typeof actor.id === 'number' || Array.isArray(actor.runData)) {
        return { kind: 'echo', id: actor.id ?? null };
    }
    return { kind: 'player', id: actor.id != null ? actor.id : 'player' };
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

function paintLabel(ctx, text, x, y, opts = {}) {
    ctx.save();
    ctx.font = opts.font || 'bold 12px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width;
    const padX = 5;
    const h = opts.h || 16;
    ctx.fillStyle = opts.bg || 'rgba(4, 8, 12, 0.82)';
    ctx.fillRect(x - w / 2 - padX, y - h / 2, w + padX * 2, h);
    ctx.fillStyle = opts.color || '#fff';
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
}

function drawStar(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
        const b = a + Math.PI / 5;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.lineTo(x + Math.cos(b) * r * 0.4, y + Math.sin(b) * r * 0.4);
    }
    ctx.closePath();
    ctx.fill();
}

function drawArrow(ctx, x1, y1, x2, y2, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const ah = 11;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ah * Math.cos(ang - 0.45), y2 - ah * Math.sin(ang - 0.45));
    ctx.lineTo(x2 - ah * Math.cos(ang + 0.45), y2 - ah * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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
        this.cycleLocked = false;
        this.lockedTile = null;
        this.teleOriginX = x;
        this.teleOriginY = y;
        this.defeated = false;
        this.stunFlash = 0;
        this.aimKind = null;
        this.aimId = null;
        this.aimX = null;
        this.aimY = null;
        this.previewTile = null;
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

    surfaceInTicks() {
        if (this.phase === 'burrow') {
            return Math.max(0, this.intervalTicks() - this.cycleTicks) + this.telegraphTicks();
        }
        if (this.phase === 'telegraph') {
            return Math.max(0, this.telegraphTicks() - this.phaseTicks);
        }
        return 0;
    }

    getUiState() {
        const tps = ticksPerSecond();
        const stunTicksLeft = this.phase === 'stun' ? Math.max(0, this.stunTicks() - this.phaseTicks) : 0;
        return {
            phase: this.phase,
            dormant: this.phase === 'dormant',
            stunTicksLeft,
            stunSeconds: stunTicksLeft / tps,
            targetKind: this.aimKind,
            targetId: this.aimId,
            surfaceInTicks: this.surfaceInTicks()
        };
    }

    clearAim() {
        this.aimKind = null;
        this.aimId = null;
        this.aimX = null;
        this.aimY = null;
        this.previewTile = null;
    }

    noteAim(actor) {
        const info = actorTargetInfo(actor);
        this.aimKind = info.kind;
        this.aimId = info.id;
        if (!actor) {
            this.aimX = null;
            this.aimY = null;
            this.previewTile = null;
            return;
        }
        const c = center(actor);
        this.aimX = c.x;
        this.aimY = c.y;
        this.previewTile = this.nearestCrack(actor);
    }

    refreshAimPosition(actors) {
        if (this.aimKind == null) return;
        for (const actor of actors || []) {
            const info = actorTargetInfo(actor);
            if (info.kind === this.aimKind && info.id === this.aimId) {
                const c = center(actor);
                this.aimX = c.x;
                this.aimY = c.y;
                return;
            }
        }
    }

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
            if (!crack || crack.broken || crack.overlapsPlate?.()) continue;
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
            if (actorPressesPlate(actor, plate)) return true;
        }
        for (const pkg of state.packages || []) {
            if (!pkg || pkg.isDestroyed || pkg.carriedBy) continue;
            if (actorPressesPlate(pkg, plate)) return true;
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

    markLockedWarning() {
        const crack = this.findCrack(this.lockedTile);
        if (crack && typeof crack.showWarningRing === 'function') crack.showWarningRing();
    }

    // The tile (and actor) chosen when the countdown starts. Later movement does not re-aim.
    lockCycle(actor) {
        this.noteAim(actor);
        this.lockedTile = this.previewTile;
        this.cycleLocked = true;
        this.cycleTicks = 0;
    }

    beginTelegraph() {
        this.phase = 'telegraph';
        this.phaseTicks = 0;
        this.previewTile = this.lockedTile;
        this.teleOriginX = this.x;
        this.teleOriginY = this.y;
        this.stunFlash = 0;
        this.cycleLocked = false;
        this.markLockedWarning();
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
                this.clearAim();
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
        this.cycleLocked = false;
        this.lockedTile = null;
        this.goHome();
    }

    // Stun is a pause, then the surface cycle starts over from home.
    // A positive maxStunsPerLoop leaves the boss dormant until rewind instead.
    recoverFromStun() {
        this.stunsThisLoop += 1;
        this.phaseTicks = 0;
        this.cycleTicks = 0;
        this.cycleLocked = false;
        this.lockedTile = null;
        this.goHome();
        const cap = this.maxStunsPerLoop;
        if (cap != null && this.stunsThisLoop >= cap) {
            this.phase = 'dormant';
            this.clearAim();
            SFX.burrowerDormant();
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
            this.clearAim();
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
            this.refreshAimPosition(actors);
            this.slideToTile();
            this.markLockedWarning();
            if (this.phaseTicks >= this.telegraphTicks()) this.strike(actors);
            return;
        }
        // Lock the next strike once, when a target exists. Re-picking every tick
        // moved the marker (and never let the watched tile reach 0).
        if (!this.cycleLocked) {
            const target = this.pickTarget(actors);
            if (!target) {
                this.clearAim();
                this.lockedTile = null;
                this.cycleTicks = 0;
                return;
            }
            this.lockCycle(target);
        } else {
            this.refreshAimPosition(actors);
            this.previewTile = this.lockedTile;
        }
        this.cycleTicks++;
        if (this.cycleTicks >= this.intervalTicks()) {
            this.cycleTicks = 0;
            this.beginTelegraph();
        }
    }

    aimedTile() {
        if (this.phase === 'telegraph' || this.phase === 'stun') return this.lockedTile;
        if (this.phase === 'burrow') return this.previewTile;
        return null;
    }

    drawHpPips(ctx, cx) {
        const dormant = this.phase === 'dormant';
        const pips = Math.max(this.maxHp, 1);
        const pipW = 8;
        const gap = 3;
        const total = pips * pipW + (pips - 1) * gap;
        let px = cx - total / 2;
        const py = this.y - 10;
        ctx.save();
        ctx.font = '9px "Space Grotesk", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = dormant ? '#9a958c' : '#ffb080';
        ctx.fillText('HP', px - 3, py + 2);
        for (let i = 0; i < pips; i++) {
            const filled = i < this.hp;
            ctx.fillStyle = !filled ? 'rgba(255,255,255,0.18)' : (dormant ? '#8a847c' : '#ff8844');
            ctx.fillRect(px, py, pipW, 4);
            px += pipW + gap;
        }
        ctx.restore();
    }

    drawTargetMark(ctx) {
        if (this.aimX == null || this.aimKind == null) return;
        if (this.phase !== 'burrow' && this.phase !== 'telegraph') return;
        const color = this.aimKind === 'echo' ? '#e070ff' : '#3ee0ff';
        const label = this.aimKind === 'echo'
            ? `ECHO ${typeof this.aimId === 'number' ? this.aimId + 1 : this.aimId}`
            : 'PLAYER';
        drawArrow(ctx, this.x + this.w / 2, this.y + this.h / 2, this.aimX, this.aimY, color);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.aimX, this.aimY, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(this.aimX - 8, this.aimY);
        ctx.lineTo(this.aimX + 8, this.aimY);
        ctx.moveTo(this.aimX, this.aimY - 8);
        ctx.lineTo(this.aimX, this.aimY + 8);
        ctx.stroke();
        ctx.restore();
        // The echo end-badge sits above the actor (filled disc, r=11). Keep the
        // words to the side of that disc so "ECHO 1" is not drawn underneath it.
        paintLabel(ctx, label, this.aimX + 54, this.aimY - 6, { color, h: 15 });
    }

    drawSurfaceMark(ctx) {
        const tile = this.aimedTile();
        if (!tile || (this.phase !== 'burrow' && this.phase !== 'telegraph')) return;
        const ui = this.getUiState();
        const total = this.intervalTicks() + this.telegraphTicks();
        const frac = total > 0 ? 1 - ui.surfaceInTicks / total : 0;
        drawKillRing(ctx, tile, undefined, 'rgba(255, 196, 90, 0.95)');
        const z = killZone(tile);
        const cx = z.x + z.w / 2;
        const cy = z.y + z.h / 2;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 244, 210, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(4, Math.min(z.w, z.h) / 2 - 2), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, frac)));
        ctx.stroke();
        ctx.restore();
        const secs = (ui.surfaceInTicks / ticksPerSecond());
        paintLabel(ctx, secs.toFixed(1) + 's', cx, cy, { color: '#fff6d8', h: 14, font: 'bold 11px "Space Grotesk", sans-serif' });
    }

    render(ctx) {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const tick = state.currentTick || 0;
        const dormant = this.phase === 'dormant';
        ctx.save();
        this.drawSurfaceMark(ctx);
        this.drawTargetMark(ctx);

        if (this.phase === 'stun' || this.stunFlash > 0) {
            const flash = 0.35 + 0.45 * Math.abs(Math.sin(tick * 0.7));
            ctx.fillStyle = `rgba(255, 230, 90, ${this.phase === 'stun' ? flash : 0.35})`;
            ctx.beginPath();
            ctx.arc(cx, cy, this.w * 0.62, 0, Math.PI * 2);
            ctx.fill();
        }

        const bob = this.phase === 'burrow' ? Math.sin(tick * 0.15) * 3 : 0;
        const sink = dormant ? 10 : 0;
        ctx.fillStyle = this.defeated ? 'rgba(80, 70, 60, 0.7)' : dormant ? 'rgba(72, 70, 66, 0.95)' : 'rgba(40, 28, 18, 0.92)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + bob + sink, this.w * (dormant ? 0.52 : 0.46), this.h * (dormant ? 0.16 : 0.32), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = dormant ? '#6e6a64' : this.phase === 'stun' ? '#ffdd00' : '#e6c27a';
        ctx.lineWidth = this.phase === 'stun' ? 3 : 1.5;
        ctx.stroke();

        if (this.phase === 'burrow') {
            for (let i = 0; i < 3; i++) {
                const rise = (tick * 0.65 + i * 14) % 26;
                const alpha = Math.max(0, 1 - rise / 26);
                const bx = cx + Math.sin(tick * 0.11 + i * 2.1) * 9;
                const by = cy + 6 - rise;
                ctx.beginPath();
                ctx.fillStyle = `rgba(150, 110, 60, ${0.45 * alpha})`;
                ctx.arc(bx, by, 2.2 + (i % 2), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        if (this.phase === 'stun') {
            const ui = this.getUiState();
            const total = Math.max(1, this.stunTicks());
            const frac = ui.stunTicksLeft / total;
            ctx.save();
            ctx.strokeStyle = '#ffe14a';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(cx, cy, this.w * 0.78, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
            ctx.stroke();
            ctx.fillStyle = '#ffe14a';
            for (let i = 0; i < 3; i++) {
                const a = tick * 0.18 + i * (Math.PI * 2 / 3);
                drawStar(ctx, cx + Math.cos(a) * (this.w * 0.85), cy - 18 + Math.sin(a) * 7, 5);
            }
            ctx.restore();
            const barW = 36;
            const barX = cx - barW / 2;
            const barY = this.y - 28;
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(barX, barY, barW, 5);
            ctx.fillStyle = '#ffe14a';
            ctx.fillRect(barX, barY, barW * frac, 5);
            paintLabel(ctx, `STUN ${ui.stunSeconds.toFixed(1)}s`, cx, this.y - 40, { color: '#fff3a8', h: 15 });
        }

        if (dormant) {
            const zBob = Math.sin(tick * 0.08) * 1.5;
            paintLabel(ctx, 'Zzz', cx + 16, this.y - 36 + zBob, { color: '#d9d4cc', h: 14, font: 'bold 13px "Space Grotesk", sans-serif' });
            paintLabel(ctx, 'dormant until rewind', cx, this.y - 22, { color: '#c8c2b8', h: 15, font: 'bold 11px "Space Grotesk", sans-serif' });
        }

        this.drawHpPips(ctx, cx);
        ctx.restore();
    }
}
