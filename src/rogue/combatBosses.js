import { Gatekeeper, wallRayDistance } from '../entities/bosses/gatekeeper.js';
import { state } from '../core/state.js';

export const GATEKEEPER_COMBAT_HP = 12;
export const GATEKEEPER_BEAM_WINDUP = 60;
export const GATEKEEPER_BEAM_DAMAGE = 2;

function distanceToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq <= 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export class CombatGatekeeper extends Gatekeeper {
    constructor(x, y) {
        super('rogue-gatekeeper', x, y, { audits: [], shields: 0 });
        this.hp = GATEKEEPER_COMBAT_HP;
        this.maxHp = GATEKEEPER_COMBAT_HP;
        this.dead = false;
        this.lastHitAttackId = null;
        this.hurtTicks = 0;
        this.stunTicks = 0;
        this.beamCooldownTicks = 45;
        this.beamWindupTicks = 0;
        this.beamTarget = null;
    }

    hitByAttack(attackId, damage = 1) {
        if (this.dead || this.lastHitAttackId === attackId) return false;
        this.lastHitAttackId = attackId;
        this.hp = Math.max(0, this.hp - Math.max(0, Number(damage) || 0));
        this.hurtTicks = 8;
        if (this.hp <= 0) this.dead = true;
        return true;
    }

    stun(ticks = 8) {
        if (!this.dead) this.stunTicks = Math.max(this.stunTicks, Math.min(15, ticks | 0));
    }

    touchByEcho() {
        this.stun(8);
    }

    update(player) {
        if (this.dead) return null;
        if (this.hurtTicks > 0) this.hurtTicks--;
        if (this.stunTicks > 0) {
            this.stunTicks--;
            return null;
        }
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        if (this.beamWindupTicks > 0) {
            this.beamWindupTicks--;
            if (this.beamWindupTicks > 0 || !this.beamTarget) return null;
            const angle = Math.atan2(this.beamTarget.y - cy, this.beamTarget.x - cx);
            const intended = Math.hypot(this.beamTarget.x - cx, this.beamTarget.y - cy);
            const reach = wallRayDistance(cx, cy, angle, intended, state.walls || []);
            const bx = cx + Math.cos(angle) * reach;
            const by = cy + Math.sin(angle) * reach;
            const pcx = player.x + player.w / 2;
            const pcy = player.y + player.h / 2;
            this.beamCooldownTicks = this.hp <= this.maxHp / 2 ? 90 : 120;
            if (distanceToSegment(pcx, pcy, cx, cy, bx, by) <= Math.max(player.w, player.h) / 2 + 8) {
                return { combatDamage: GATEKEEPER_BEAM_DAMAGE, reason: 'Audited by the Gatekeeper beam!' };
            }
            return null;
        }
        if (this.beamCooldownTicks > 0) this.beamCooldownTicks--;
        if (this.beamCooldownTicks <= 0) {
            this.beamTarget = { x: player.x + player.w / 2, y: player.y + player.h / 2 };
            this.beamWindupTicks = GATEKEEPER_BEAM_WINDUP;
        }
        return null;
    }

    render(ctx) {
        if (this.dead) return;
        super.render(ctx);
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        if (this.beamWindupTicks > 0 && this.beamTarget) {
            const pulse = 1 - this.beamWindupTicks / GATEKEEPER_BEAM_WINDUP;
            ctx.save();
            ctx.strokeStyle = `rgba(255, 82, 54, ${0.45 + pulse * 0.5})`;
            ctx.lineWidth = 3 + pulse * 5;
            ctx.setLineDash([10, 7]);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(this.beamTarget.x, this.beamTarget.y);
            ctx.stroke();
            ctx.restore();
        }
    }
}

export function combatBossHud(boss) {
    if (!boss || boss.dead) return null;
    const max = Math.max(1, Number(boss.maxHp) || 1);
    const hp = Math.max(0, Math.min(max, Number(boss.hp) || 0));
    return {
        name: 'GATEKEEPER',
        hp,
        max,
        progress: `GATEKEEPER · ${hp}/${max}`,
        phase: hp <= max / 2 ? 2 : 1
    };
}
