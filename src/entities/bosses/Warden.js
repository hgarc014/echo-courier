// Panopticon captain. A stationary guard whose cone tweens toward the latest
// noise event (interact, toss, decoy landing, alarm). Relay plates behind the
// post latch only while their center is outside that cone. Deterministic:
// degrees per second, no Math.random. Checkpoint is the set of solved relay ids.
import { state } from '../../core/state.js';
import { Guard } from '../hazards.js';
import { SFX } from '../../core/audio.js';
import { drawSprite } from '../../core/sprites.js';
import { resolveSprite } from '../../core/atlas.js';
import { latestNoise } from '../../systems/noiseEvents.js';

export const WARDEN_DEFAULTS = {
    coneLength: 340,
    coneAngle: 80,
    turnSpeed: 160,
    hearRange: 1000,
    homeAngle: -90,
    // Relays that may latch in one loop (0 = no cap). Stops a solo courier
    // from clearing every relay in a single loop with no echoes.
    relaysPerLoop: 1,
    defeatDoorId: 'boss_door'
};

function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d <= -Math.PI) d += Math.PI * 2;
    return d;
}

function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function ticksPerSecond() {
    return state.TICK_RATE > 0 ? (1000 / state.TICK_RATE) : 60;
}

export class Warden extends Guard {
    constructor(x, y, opts = {}) {
        const w = opts.w || 30;
        const h = opts.h || 30;
        super([{ x, y }, { x, y }]);
        this.w = w;
        this.h = h;
        this.isWarden = true;
        this.id = opts.id || 'warden';
        this.coneLength = num(opts.coneLength, WARDEN_DEFAULTS.coneLength);
        this.coneAngle = num(opts.coneAngle, WARDEN_DEFAULTS.coneAngle);
        this.turnSpeed = num(opts.turnSpeed, WARDEN_DEFAULTS.turnSpeed);
        this.hearRange = num(opts.hearRange, WARDEN_DEFAULTS.hearRange);
        this.homeAngle = num(opts.homeAngle, WARDEN_DEFAULTS.homeAngle);
        this.relayIds = Array.isArray(opts.relayIds) ? opts.relayIds.map(id => String(id)) : ['r1', 'r2', 'r3'];
        this.defeatDoorId = opts.defeatDoorId || WARDEN_DEFAULTS.defeatDoorId;
        this.relaysPerLoop = Math.max(0, Math.floor(num(opts.relaysPerLoop, WARDEN_DEFAULTS.relaysPerLoop)));
        this.latchedThisLoop = 0;
        this.setPost(x, y);
        this.facingAngle = this.homeAngle * Math.PI / 180;
        this.targetAngle = this.facingAngle;
        this.turnTicksLeft = 0;
        this.solved = new Set();
        const saved = state.bossCheckpointLive && state.bossCheckpoint ? state.bossCheckpoint[this.id] : null;
        if (saved && Array.isArray(saved.relays)) {
            for (const id of saved.relays) {
                if (this.relayIds.includes(id)) this.solved.add(id);
            }
        }
    }

    setPost(x, y) {
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        if (Array.isArray(this.points)) {
            for (const p of this.points) { p.x = x; p.y = y; }
        }
    }

    center() {
        return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
    }

    pointInCone(px, py) {
        const c = this.center();
        const dx = px - c.x;
        const dy = py - c.y;
        if (Math.hypot(dx, dy) > this.coneLength) return false;
        const half = (this.coneAngle * Math.PI / 180) / 2;
        return Math.abs(angleDiff(Math.atan2(dy, dx), this.facingAngle)) <= half;
    }

    rememberCheckpoint() {
        if (!state.bossCheckpoint || typeof state.bossCheckpoint !== 'object') state.bossCheckpoint = {};
        state.bossCheckpoint[this.id] = { relays: this.relayIds.filter(id => this.solved.has(id)) };
    }

    openDefeatDoor() {
        const door = (state.doors || []).find(d => d.id === this.defeatDoorId);
        if (door) door.isOpen = true;
    }

    allRelaysSolved() {
        return this.relayIds.length > 0 && this.solved.size >= this.relayIds.length;
    }

    _turnTowardLatestNoise() {
        const noise = latestNoise(state.noiseEvents);
        if (!noise) return;
        const c = this.center();
        const dx = noise.x - c.x;
        const dy = noise.y - c.y;
        if (Math.hypot(dx, dy) > this.hearRange) return;
        const desired = Math.atan2(dy, dx);
        const step = (this.turnSpeed * Math.PI / 180) / ticksPerSecond();
        const diff = angleDiff(desired, this.facingAngle);
        if (Math.abs(diff) <= step || step <= 0) this.facingAngle = desired;
        else this.facingAngle += Math.sign(diff) * step;
    }

    _latchRelays() {
        let added = false;
        for (const id of this.relayIds) {
            if (this.solved.has(id)) continue;
            if (this.relaysPerLoop > 0 && this.latchedThisLoop >= this.relaysPerLoop) break;
            const plate = (state.plates || []).find(p => p && p.id === id);
            if (!plate || !plate.isPressed) continue;
            const px = plate.x + (plate.w || 40) / 2;
            const py = plate.y + (plate.h || 40) / 2;
            if (this.pointInCone(px, py)) continue;
            this.solved.add(id);
            this.latchedThisLoop++;
            added = true;
        }
        if (added) {
            this.rememberCheckpoint();
            SFX.bossPhase();
        }
    }

    update() {
        this._turnTowardLatestNoise();
        this._latchRelays();
        if (this.allRelaysSolved()) this.openDefeatDoor();
    }

    render(ctx) {
        const c = this.center();
        const half = (this.coneAngle * Math.PI / 180) / 2;
        ctx.fillStyle = 'rgba(255, 196, 40, 0.20)';
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.arc(c.x, c.y, Math.max(0, this.coneLength), this.facingAngle - half, this.facingAngle + half);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 220, 120, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const img = resolveSprite(state, 'guard');
        if (img) {
            drawSprite(ctx, img, this.x, this.y, this.w, this.h, {
                flipX: Math.cos(this.facingAngle) < 0,
                valign: 'bottom'
            });
        } else {
            ctx.fillStyle = '#c8a24a';
            ctx.fillRect(this.x, this.y, this.w, this.h);
        }

        const n = this.relayIds.length;
        if (n > 0) {
            const pip = 8;
            const gap = 3;
            let px = c.x - (n * pip + (n - 1) * gap) / 2;
            const py = this.y - 10;
            for (let i = 0; i < n; i++) {
                ctx.fillStyle = this.solved.has(this.relayIds[i]) ? '#ffdd00' : 'rgba(255,255,255,0.25)';
                ctx.fillRect(px, py, pip, 4);
                px += pip + gap;
            }
        }
    }
}
