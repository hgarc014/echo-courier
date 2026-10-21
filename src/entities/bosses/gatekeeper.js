// Stationary auditor turret. Not a wall and not a collider — physics only
// sees walls and closed doors. Passed audit indices live in
// state.gatekeeperCheckpoint so broken shields survive R; a new attempt clears it.
// Constructor skips that restore while the editor is open so palette/undo stay configured.
import { state } from '../../core/state.js';
import { Entity } from '../base.js';
import { SFX } from '../../core/audio.js';

const WINDUP_TICKS = 60;
const FLASH_TICKS = 12;

function normalizeAudits(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const a of list) {
        if (!a || typeof a !== 'object') continue;
        const tick = Number(a.tick);
        if (!Number.isFinite(tick)) continue;
        out.push({ plateId: a.plateId == null ? '' : String(a.plateId), tick });
    }
    return out;
}

function linkedDoorIds(plate) {
    const raw = plate && plate.linkedIds;
    if (Array.isArray(raw)) return raw.filter(id => id != null && id !== '');
    if (raw == null || raw === '') return [];
    return [raw];
}

export class Gatekeeper extends Entity {
    constructor(id, x, y, opts = {}) {
        const nx = Number(x);
        const ny = Number(y);
        super(Number.isFinite(nx) ? nx : 0, Number.isFinite(ny) ? ny : 0, 60, 60, 'gatekeeper');
        this.id = id == null ? '' : String(id);
        const o = opts || {};
        this.audits = normalizeAudits(o.audits);
        this.vaultDoorId = o.vaultDoorId == null ? '' : String(o.vaultDoorId);
        const fallback = this.audits.length;
        let shields = (o.shields == null || o.shields === '') ? fallback : Number(o.shields);
        if (!Number.isFinite(shields)) shields = fallback;
        this.maxShields = Math.max(0, Math.floor(shields));
        this.shields = this.maxShields;
        this.passed = [];
        this.flashTicks = 0;
        if (state.gameState !== 'EDITOR') this._restoreCheckpoint();
    }

    _restoreCheckpoint() {
        const bag = state.gatekeeperCheckpoint;
        if (!bag || !this.id) return;
        const saved = bag[this.id];
        if (!Array.isArray(saved)) return;
        const passed = [];
        for (const raw of saved) {
            const i = Number(raw);
            if (!Number.isInteger(i) || i < 0 || i >= this.audits.length || passed.includes(i)) continue;
            passed.push(i);
        }
        this.passed = passed;
        this.shields = Math.max(0, this.maxShields - passed.length);
    }

    _storeCheckpoint() {
        if (!this.id) return;
        if (!state.gatekeeperCheckpoint || typeof state.gatekeeperCheckpoint !== 'object') {
            state.gatekeeperCheckpoint = {};
        }
        state.gatekeeperCheckpoint[this.id] = this.passed.slice();
    }

    _upcoming(now) {
        let best = null;
        for (let i = 0; i < this.audits.length; i++) {
            if (this.passed.includes(i)) continue;
            const tick = this.audits[i].tick;
            if (tick < now) continue;
            if (!best || tick < best.tick || (tick === best.tick && i < best.index)) {
                best = { index: i, tick, plateId: this.audits[i].plateId };
            }
        }
        return best;
    }

    _prevAuditTick(next) {
        let prev = 0;
        for (const a of this.audits) {
            if (a.tick < next.tick && a.tick > prev) prev = a.tick;
        }
        return prev;
    }

    // tick is the current loop tick (state.currentTick). Already-passed audits are skipped.
    update(tick, plates, doors) {
        if (this.flashTicks > 0) this.flashTicks--;
        const now = Number.isFinite(Number(tick)) ? Number(tick) : (Number(state.currentTick) || 0);
        const plateList = plates || [];
        const doorList = doors || [];
        let audited = false;
        let broke = false;
        for (let i = 0; i < this.audits.length; i++) {
            if (this.passed.includes(i)) continue;
            const audit = this.audits[i];
            if (Number(audit.tick) !== now) continue;
            audited = true;
            const plate = plateList.find(p => p && p.id === audit.plateId);
            if (plate && plate.isPressed) {
                this.passed.push(i);
                this.shields = Math.max(0, this.shields - 1);
                broke = true;
            } else if (plate) {
                for (const id of linkedDoorIds(plate)) {
                    for (const door of doorList) {
                        if (door && door.id === id) door.gateLocked = true;
                    }
                }
            }
        }
        if (broke) {
            this._storeCheckpoint();
            try { SFX.bossPhase(); } catch { /* audio optional in headless tests */ }
        }
        if (audited) this.flashTicks = FLASH_TICKS;
        const cleared = this.passed.length === this.audits.length || this.shields <= 0;
        if (cleared && this.vaultDoorId) {
            for (const door of doorList) {
                if (door && door.id === this.vaultDoorId) door.isOpen = true;
            }
        }
    }

    render(ctx) {
        const now = Number(state.currentTick) || 0;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const next = this._upcoming(now);
        ctx.save();

        if (this.vaultDoorId) {
            const door = (state.doors || []).find(d => d && d.id === this.vaultDoorId);
            if (door) {
                ctx.beginPath();
                ctx.setLineDash([5, 7]);
                ctx.strokeStyle = 'rgba(80, 255, 180, 0.45)';
                ctx.lineWidth = 1.5;
                ctx.moveTo(cx, cy);
                ctx.lineTo(door.x + (door.w || 0) / 2, door.y + (door.h || 0) / 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        if (next) {
            const delta = next.tick - now;
            if (delta > 0 && delta <= WINDUP_TICKS) {
                const plate = (state.plates || []).find(p => p && p.id === next.plateId);
                if (plate) {
                    const tx = plate.x + (plate.w || 40) / 2;
                    const ty = plate.y + (plate.h || 40) / 2;
                    const ang = Math.atan2(ty - cy, tx - cx);
                    const dist = Math.hypot(tx - cx, ty - cy);
                    const charge = 1 - delta / WINDUP_TICKS;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.arc(cx, cy, Math.max(1, dist), ang - 0.22, ang + 0.22);
                    ctx.closePath();
                    ctx.fillStyle = `rgba(255, 60, 40, ${0.08 + 0.22 * charge})`;
                    ctx.fill();
                    ctx.beginPath();
                    ctx.setLineDash([8, 6]);
                    ctx.lineDashOffset = -now;
                    ctx.strokeStyle = `rgba(255, 220, 160, ${0.35 + 0.6 * charge})`;
                    ctx.lineWidth = 2;
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(tx, ty);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }
        }

        ctx.fillStyle = '#141820';
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 2;
        ctx.fillRect(this.x + 10, this.y + 10, this.w - 20, this.h - 20);
        ctx.strokeRect(this.x + 10, this.y + 10, this.w - 20, this.h - 20);
        ctx.beginPath();
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.fillStyle = this.flashTicks > 0 ? '#ffffff' : '#ff3355';
        ctx.fill();

        if (next) {
            const prev = this._prevAuditTick(next);
            const span = Math.max(1, next.tick - prev);
            const frac = Math.max(0, Math.min(1, (now - prev) / span));
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(125, 249, 255, 0.95)';
            ctx.lineWidth = 3;
            ctx.arc(cx, cy, 22, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
            ctx.stroke();
        }

        const n = this.audits.length;
        for (let i = 0; i < n; i++) {
            const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
            const lx = cx + Math.cos(ang) * 28;
            const ly = cy + Math.sin(ang) * 28;
            const passed = this.passed.includes(i);
            const isNext = !!(next && next.index === i);
            ctx.beginPath();
            ctx.arc(lx, ly, isNext ? 5 : 3.5, 0, Math.PI * 2);
            if (passed) ctx.fillStyle = 'rgba(57, 255, 20, 0.45)';
            else if (isNext) ctx.fillStyle = '#ffe14a';
            else ctx.fillStyle = 'rgba(180, 190, 200, 0.35)';
            ctx.fill();
            if (isNext) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }

        if (this.flashTicks > 0) {
            const u = this.flashTicks / FLASH_TICKS;
            ctx.beginPath();
            ctx.arc(cx, cy, 18 + (1 - u) * 26, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,255,255,${0.15 + 0.75 * u})`;
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        const max = this.maxShields || 0;
        const remain = Math.max(0, this.shields || 0);
        const pipW = 8;
        const pipGap = 3;
        const totalW = max * pipW + Math.max(0, max - 1) * pipGap;
        let px = cx - totalW / 2;
        const py = this.y - 8;
        for (let i = 0; i < max; i++) {
            ctx.fillStyle = i < remain ? '#39ff14' : 'rgba(80, 80, 80, 0.85)';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.lineWidth = 1;
            ctx.fillRect(px, py, pipW, 5);
            ctx.strokeRect(px, py, pipW, 5);
            px += pipW + pipGap;
        }

        ctx.restore();
    }
}
