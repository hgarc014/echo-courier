import { Gatekeeper, wallRayDistance } from '../entities/bosses/gatekeeper.js';
import { Burrower } from '../entities/bosses/Burrower.js';
import { state } from '../core/state.js';

export const GATEKEEPER_COMBAT_HP = 12;
export const GATEKEEPER_BEAM_WINDUP = 60;
export const GATEKEEPER_BEAM_DAMAGE = 2;
export const BURROWER_COMBAT_HP = 14;
export const BURROWER_EMERGE_WINDUP = 45;

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

function overlapsWall(x, y, w, h) {
    return (state.walls || []).some(wall =>
        x < wall.x + wall.w && x + w > wall.x && y < wall.y + wall.h && y + h > wall.y);
}

export class CombatBurrower extends Burrower {
    constructor(x, y) {
        super(x, y, { id: 'rogue-burrower', hp: BURROWER_COMBAT_HP, corePlateIds: [] });
        this.hp = BURROWER_COMBAT_HP;
        this.maxHp = BURROWER_COMBAT_HP;
        this.dead = false;
        this.defeated = false;
        this.combatPhase = 'exposed';
        this.exposedTicks = 90;
        this.emergeWindupTicks = 0;
        this.emergeTarget = null;
        this.lastHitAttackId = null;
        this.hurtTicks = 0;
        this.stunTicks = 0;
    }

    hitByAttack(attackId, damage = 1) {
        if (this.dead || this.combatPhase !== 'exposed' || this.lastHitAttackId === attackId) return false;
        this.lastHitAttackId = attackId;
        this.hp = Math.max(0, this.hp - Math.max(0, Number(damage) || 0));
        this.hurtTicks = 8;
        if (this.hp <= 0) {
            this.dead = true;
            this.defeated = true;
            this.combatPhase = 'defeated';
        }
        return true;
    }

    stun(ticks = 8) {
        if (!this.dead && this.combatPhase === 'exposed') this.stunTicks = Math.max(this.stunTicks, Math.min(15, ticks | 0));
    }

    touchByEcho() {
        this.stun(8);
    }

    update(player, ghosts = []) {
        if (this.dead) return null;
        if (this.hurtTicks > 0) this.hurtTicks--;
        if (this.stunTicks > 0) {
            this.stunTicks--;
            return null;
        }
        if (this.combatPhase === 'exposed') {
            this.exposedTicks--;
            if (this.exposedTicks <= 0) {
                const actors = [player, ...ghosts.filter(ghost => ghost?.isActive)];
                const target = this.pickTarget(actors) || player;
                this.emergeTarget = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
                this.emergeWindupTicks = BURROWER_EMERGE_WINDUP;
                this.combatPhase = 'telegraph';
            }
            return null;
        }
        if (this.combatPhase === 'telegraph') {
            this.emergeWindupTicks--;
            if (this.emergeWindupTicks > 0) return null;
            const nx = this.emergeTarget.x - this.w / 2;
            const ny = this.emergeTarget.y - this.h / 2;
            if (!overlapsWall(nx, ny, this.w, this.h)) {
                this.x = nx;
                this.y = ny;
            }
            this.combatPhase = 'exposed';
            this.exposedTicks = this.hp <= this.maxHp / 2 ? 70 : 90;
            const pcx = player.x + player.w / 2;
            const pcy = player.y + player.h / 2;
            if (Math.hypot(pcx - (this.x + this.w / 2), pcy - (this.y + this.h / 2)) <= 58) {
                return { combatDamage: 2, reason: 'Caught in the Burrower eruption!' };
            }
        }
        return null;
    }

    render(ctx) {
        if (this.dead) return;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        if (this.combatPhase === 'telegraph' && this.emergeTarget) {
            const pulse = 1 - this.emergeWindupTicks / BURROWER_EMERGE_WINDUP;
            ctx.save();
            ctx.strokeStyle = `rgba(255, 159, 67, ${0.55 + pulse * 0.4})`;
            ctx.lineWidth = 3 + pulse * 4;
            ctx.beginPath();
            ctx.arc(this.emergeTarget.x, this.emergeTarget.y, 32 + pulse * 22, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            return;
        }
        ctx.save();
        ctx.globalAlpha = this.hurtTicks > 0 ? 0.65 : 1;
        ctx.fillStyle = '#241b35';
        ctx.strokeStyle = '#ff9f43';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, 23, Math.PI, 0);
        ctx.lineTo(cx + 23, cy + 16);
        ctx.lineTo(cx - 23, cy + 16);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#00f3ff';
        ctx.fillRect(cx - 10, cy - 5, 20, 7);
        ctx.restore();
    }
}

export function combatBossHud(boss) {
    if (!boss || boss.dead) return null;
    const max = Math.max(1, Number(boss.maxHp) || 1);
    const hp = Math.max(0, Math.min(max, Number(boss.hp) || 0));
    return {
        name: boss instanceof CombatBurrower ? 'BURROWER' : 'GATEKEEPER',
        hp,
        max,
        progress: `${boss instanceof CombatBurrower ? 'BURROWER' : 'GATEKEEPER'} · ${hp}/${max}`,
        phase: hp <= max / 2 ? 2 : 1
    };
}
