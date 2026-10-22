import { state, getUnlockedAbilities } from '../core/state.js';
import { Entity } from './base.js';
import { AABB, checkWallCollision, lineOfSightBlocked } from '../core/physics.js';
import { SFX } from '../core/audio.js';
import { drawSprite, drawTiled } from '../core/sprites.js';
import { resolveSprite } from '../core/atlas.js';
import {
    CRUMBLE_MIN_TICKS,
    WARNING_RING_TICKS,
    actorCenter,
    centerInKillZone,
    clampKillFraction,
    killZone,
    overlapArea,
    pointInRect
} from '../core/hitZones.js';
import { collectShieldSlabs, laserHotRects } from '../systems/laserShield.js';

function isPresentPlayer(actor) {
    return actor && actor.id === undefined && actor.assetName === 'player';
}

export class Laser extends Entity {
    constructor(id, x, y, w, h) { super(x, y, w, h, 'laser'); this.id=id; this.isOpen=false; }
    hotRects() {
        if (this.isOpen) return [];
        const enabled = getUnlockedAbilities().includes('ghostShield');
        const slabs = collectShieldSlabs(state.player, state.activeGhosts, enabled);
        return laserHotRects(this, slabs);
    }
    render(ctx) {
        if (this.isOpen) return;
        const rects = this.hotRects();
        if (!rects.length) return;
        const pulse = 0.78 + 0.22 * Math.abs(Math.sin(state.currentTick * 0.18));
        const img = resolveSprite(state, 'laser');
        for (const r of rects) {
            if (img) {
                ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
                ctx.globalAlpha = pulse;
                const tile = 40;
                for (let i = 0; i < r.h; i += tile) ctx.drawImage(img, r.x + (r.w / 2 - 20), r.y + i, tile, tile);
                for (let i = 0; i < r.w; i += tile) ctx.drawImage(img, r.x + i, r.y + (r.h / 2 - 20), tile, tile);
                ctx.restore();
            } else {
                ctx.fillStyle = `rgba(255,0,0,${0.35 * pulse})`;
                ctx.fillRect(r.x, r.y, r.w, r.h);
            }
        }
    }
}

const CHASE_DRONE_LINGER = 75;
const CHASE_DRONE_SPEED = 4.5;
const CAMERA_TRACK_TURN = 0.08;
const GUARD_LOST_SIGHT = 60;
const GUARD_CHASE_SPEED = 2.6;
const GUARD_CATCH_PAD = 4;
const GUARD_VISION_RANGE = 220;
const GUARD_VISION_FOV = 90; // degrees, full wedge
const GUARD_TURN_TICKS = 18; // ~0.3s at 60tps

function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d <= -Math.PI) d += Math.PI * 2;
    return d;
}

function getVisionCone(guard) {
    return {
        cx: guard.x + guard.w / 2,
        cy: guard.y + guard.h / 2,
        angle: guard.facingAngle,
        halfAngle: (GUARD_VISION_FOV * Math.PI / 180) / 2,
        range: GUARD_VISION_RANGE,
    };
}

function pointInVisionCone(cone, tx, ty, tw, th) {
    const px = tx + tw / 2, py = ty + th / 2;
    const dx = px - cone.cx, dy = py - cone.cy;
    if (Math.hypot(dx, dy) > cone.range) return false;
    const ang = Math.atan2(dy, dx);
    return Math.abs(angleDiff(ang, cone.angle)) <= cone.halfAngle;
}

export class SweepCamera extends Entity {
    constructor(x, y, startAngle, sweepRange) {
        super(x, y, 30, 30, 'camera');
        this.baseAngle=startAngle; this.sweepRange=sweepRange; this.currentAngle=startAngle; this.sweepProgress=0; this.sweepDir=0.01;
        this.seesPlayer = false;
        this.trackingPlayer = false;
        this.chaseDrone = null;
    }
    _inCone(tx, ty) {
        let dx=(tx+15)-(this.x+15); let dy=(ty+15)-(this.y+15);
        if (Math.hypot(dx, dy) > 250) return false;
        let diff=Math.atan2(dy, dx)-this.currentAngle;
        while(diff>Math.PI) diff-=Math.PI*2; while(diff<-Math.PI) diff+=Math.PI*2;
        return Math.abs(diff)<0.35;
    }
    _steerToward(tx, ty) {
        const dx = (tx + 15) - (this.x + 15);
        const dy = (ty + 15) - (this.y + 15);
        let diff = Math.atan2(dy, dx) - this.currentAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (diff > CAMERA_TRACK_TURN) diff = CAMERA_TRACK_TURN;
        else if (diff < -CAMERA_TRACK_TURN) diff = -CAMERA_TRACK_TURN;
        this.currentAngle += diff;
    }
    _resumeSweepFromCurrent() {
        if (!this.sweepRange) {
            this.sweepProgress = 0;
            this.baseAngle = this.currentAngle;
            return;
        }
        let p = (this.currentAngle - this.baseAngle) / this.sweepRange;
        if (p > 1) p = 1;
        else if (p < -1) p = -1;
        this.sweepProgress = p;
        this.baseAngle = this.currentAngle - p * this.sweepRange;
    }
    _ensureChaseDrone() {
        if (this.chaseDrone && this.chaseDrone.alive) return;
        this.chaseDrone = new Drone([{ x: this.x, y: this.y }], { role: 'chase', ownerCamera: this });
        state.drones.push(this.chaseDrone);
        SFX.droneAlert();
    }
    update(player) {
        // Body + cloak only. Packages (including grounded contraband) do not trip the cone.
        this.seesPlayer = player.cloakTimer <= 0 && this._inCone(player.x, player.y);
        if (this.seesPlayer) {
            this._steerToward(player.x, player.y);
            this.trackingPlayer = true;
        } else {
            if (this.trackingPlayer) {
                this._resumeSweepFromCurrent();
                this.trackingPlayer = false;
            }
            this.sweepProgress+=this.sweepDir; if (this.sweepProgress>=1 || this.sweepProgress<=-1) this.sweepDir*=-1;
            this.currentAngle = this.baseAngle + (this.sweepProgress * this.sweepRange);
        }
        let triggerAlarm = this.seesPlayer;
        for (let g of state.activeGhosts) {
            if (g.isActive && !g.cloakActive && this._inCone(g.x, g.y)) triggerAlarm = true;
        }

        if (this.seesPlayer) this._ensureChaseDrone();
        if (triggerAlarm) { state.alarmState = true; state.runStats.alarms++; }
    }
    render(ctx) {
        const bob = Math.sin(state.currentTick * 0.2) * 0.8;
        const img = resolveSprite(state, 'camera');
        if (img) {
            drawSprite(ctx, img, this.x, this.y, this.w, this.h, { valign: 'bottom', bob });
        } else super.render(ctx);
        const blink = 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(state.currentTick * 0.25));
        ctx.fillStyle = state.alarmState ? `rgba(255,40,40,${blink})` : `rgba(0,243,255,${blink})`;
        ctx.beginPath(); ctx.arc(this.x + 15, this.y + 6, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = state.alarmState?'rgba(255, 0, 0, 0.3)':'rgba(0, 243, 255, 0.2)';
        ctx.beginPath(); ctx.moveTo(this.x+15, this.y+15); ctx.arc(this.x+15, this.y+15, 250, this.currentAngle-0.35, this.currentAngle+0.35); ctx.closePath(); ctx.fill();
    }
}

export class LaserProjectile {
    constructor(x, y, vx, vy) { this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.w = 4; this.h = 4; this.active = true; }
    update(walls, activeGhosts, player, pkgs) {
        if (!this.active) return null;
        this.x += this.vx; this.y += this.vy;
        if (checkWallCollision(this.x, this.y, this.w, this.h)) { this.active = false;}
        if (!this.active) return null;
        if (AABB(this.x, this.y, this.w, this.h, player.x, player.y, player.w, player.h)) {
            this.active = false;
            return "Vaporized by Security Laser!";
        }
        for (let g of activeGhosts) {
            if (g.isActive && AABB(this.x, this.y, this.w, this.h, g.x, g.y, g.w, g.h)) {
                g.isActive = false; this.active = false; break;
            }
        }
        return null;
    }
    render(ctx) {
        if (!this.active) return;
        ctx.fillStyle = '#ff0044'; ctx.shadowColor = '#ff0044'; ctx.shadowBlur = 10;
        ctx.fillRect(this.x, this.y, this.w, this.h); ctx.shadowBlur = 0;
    }
}

const BOSS_HIT_STUN = 30;
const BOSS_PHASE_FLASH = 36;
const BOSS_SPREAD = 0.4;
const BOSS_SHOT_SPEED = 8;
const BOSS_LANE_LEN = 320;
const BOSS_RANGE = 400;
const BOSS_LOCK_TICKS = 90;
const BOSS_COOLDOWN = { 3: 96, 2: 48, 1: 36 };
const BOSS_TELEGRAPH = { 3: 18, 2: 15, 1: 12 };
const BOSS_TEMPO = 0.75;

function bossTelegraphTicks(hp) {
    return BOSS_TELEGRAPH[hp] || BOSS_TELEGRAPH[3];
}

function bossFireCooldown(hp) {
    const base = BOSS_COOLDOWN[hp] || BOSS_COOLDOWN[3];
    return Math.round(base / BOSS_TEMPO);
}

function bossPhaseStyle(hp) {
    if (hp === 1) {
        return {
            core: 'rgba(255, 16, 16, 0.9)',
            stroke: '#ff1a1a',
            aura: 'rgba(255, 36, 36, 0.42)',
            bar: '#ff3344',
            banner: 'PHASE 3'
        };
    }
    if (hp === 2) {
        return {
            core: 'rgba(255, 152, 18, 0.82)',
            stroke: '#ffaa22',
            aura: 'rgba(255, 168, 36, 0.36)',
            bar: '#ffaa22',
            banner: 'PHASE 2'
        };
    }
    return {
        core: 'rgba(0, 243, 255, 0.4)',
        stroke: '#00f3ff',
        aura: 'rgba(0, 220, 255, 0.22)',
        bar: '#33ee88',
        banner: 'PHASE 1'
    };
}

function drawBossShotLanes(ctx, cx, cy, angle, charge, multi) {
    const len = 36 + charge * (BOSS_LANE_LEN - 36);
    const spread = BOSS_SPREAD;
    ctx.save();
    ctx.lineCap = 'round';
    const alpha = 0.2 + 0.62 * charge;

    if (multi) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, len, angle - spread, angle + spread);
        ctx.closePath();
        ctx.fillStyle = `rgba(255, 48, 64, ${0.07 + 0.18 * charge})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 190, 90, ${0.3 + 0.45 * charge})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, len, angle - 0.07, angle + 0.07);
        ctx.closePath();
        ctx.fillStyle = `rgba(255, 50, 70, ${0.06 + 0.14 * charge})`;
        ctx.fill();
    }

    const angles = multi ? [angle - spread, angle, angle + spread] : [angle];
    ctx.setLineDash([10, 7]);
    ctx.lineDashOffset = -state.currentTick * (1.4 + charge * 2.2);
    for (let i = 0; i < angles.length; i++) {
        const a = angles[i];
        const isCenter = !multi || i === 1;
        ctx.strokeStyle = isCenter
            ? `rgba(255, 255, 255, ${alpha})`
            : `rgba(255, 90, 40, ${alpha * 0.88})`;
        ctx.lineWidth = isCenter ? 2.6 : 1.9;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
}

export class ShooterRobot extends Entity {
    constructor(path) {
        super(path[0].x, path[0].y, 35, 35, 'robot');
        this.path = path; this.pathIndex = 0; this.speed = 1.5 * BOSS_TEMPO;
        this.fireCooldown = 0; this.facingAngle = 0;
        this.hp = 3; this.hitFlicker = 0;
        this.engaged = true;
        this.isEmerging = false;
        this.emergeUntilPathIndex = 0;
        this.windingUp = false;
        this.telegraphArmed = false;
        this.phaseChangeTimer = 0;
        this.muzzleFlash = 0;
        this.lockTarget = null;
        this.lockTimer = 0;
    }
    _targetVisible(t) {
        if (!t) return false;
        const dist = Math.hypot(t.x - this.x, t.y - this.y);
        if (dist >= BOSS_RANGE) return false;
        return !lineOfSightBlocked(this.x + 17, this.y + 17, t.x + 15, t.y + 15);
    }
    _pickTarget(player, activeGhosts) {
        const playerVisible = player.cloakTimer <= 0 && this._targetVisible(player);
        const ghosts = activeGhosts.filter(g => g.isActive && !g.cloakActive && this._targetVisible(g));
        if (this.lockTimer > 0) this.lockTimer--;

        // Prefer the uncloaked player whenever they are in range with LOS.
        if (playerVisible) {
            this.lockTarget = player;
            this.lockTimer = BOSS_LOCK_TICKS;
            return player;
        }

        const stillLocked = this.lockTarget && this.lockTarget !== player
            && this.lockTimer > 0 && ghosts.includes(this.lockTarget);
        if (stillLocked) return this.lockTarget;

        // Reacquire: do not stay glued to the previous nearest ghost.
        const pool = ghosts.filter(g => g !== this.lockTarget);
        const choices = pool.length ? pool : ghosts;
        let best = null; let bestDist = Infinity;
        for (let t of choices) {
            const dist = Math.hypot(t.x - this.x, t.y - this.y);
            if (dist < bestDist) { bestDist = dist; best = t; }
        }
        this.lockTarget = best;
        this.lockTimer = best ? BOSS_LOCK_TICKS : 0;
        return best;
    }
    takeHit() {
        if (this.hp <= 0) return;
        this.hp--;
        this.hitFlicker = BOSS_HIT_STUN;
        this.windingUp = false;
        this.telegraphArmed = false;
        if (this.hp === 2 || this.hp === 1) {
            this.phaseChangeTimer = BOSS_PHASE_FLASH;
            this.fireCooldown = Math.max(this.fireCooldown, bossTelegraphTicks(this.hp));
            SFX.bossPhase();
        } else {
            SFX.laserHit();
        }
    }
    update(player, activeGhosts, walls) {
        if (this.hp <= 0) return;
        if (this.muzzleFlash > 0) this.muzzleFlash--;
        if (this.phaseChangeTimer > 0) this.phaseChangeTimer--;
        if (!this.engaged && !this.isEmerging) return;
        if (this.hitFlicker > 0) {
            this.hitFlicker--;
            this.windingUp = false;
            return;
        }

        const moveAlongPath = () => {
            if (this.path.length <= 1) return;
            let curSpeed = (this.hp === 2 ? 3.0 : 2.0) * BOSS_TEMPO;
            let target = this.path[this.pathIndex];
            let dx = target.x - this.x;
            let dy = target.y - this.y;
            let dist = Math.hypot(dx, dy);
            if (dist < curSpeed) {
                this.x = target.x;
                this.y = target.y;
                this.pathIndex = (this.pathIndex + 1) % this.path.length;
            } else {
                this.x += (dx / dist) * curSpeed;
                this.y += (dy / dist) * curSpeed;
                this.facingAngle = Math.atan2(dy, dx);
            }
        };

        if (this.isEmerging) {
            moveAlongPath();
            if (this.pathIndex >= this.emergeUntilPathIndex) {
                this.isEmerging = false;
                this.engaged = true;
                this.fireCooldown = Math.max(this.fireCooldown, Math.round(45 / BOSS_TEMPO));
            }
            return;
        }
        
        let bestTarget = this._pickTarget(player, activeGhosts);
        
        if (this.hp === 1 && bestTarget) {
            // Unhinged Chase Mode
            let dx = bestTarget.x - this.x; let dy = bestTarget.y - this.y; let dist = Math.hypot(dx, dy);
            if (dist > 50) { this.x += (dx/dist)*(2.0 * BOSS_TEMPO); this.y += (dy/dist)*(2.0 * BOSS_TEMPO); }
            this.facingAngle = Math.atan2(dy, dx);
        } else if (this.path.length > 1) {
            // Speed up slightly in Phase 2
            moveAlongPath();
            if (bestTarget) { this.facingAngle = Math.atan2(bestTarget.y + 15 - (this.y+17), bestTarget.x + 15 - (this.x+17)); }
        }

        if (this.fireCooldown > 0) this.fireCooldown--;

        const tele = bossTelegraphTicks(this.hp);
        if (bestTarget && this.fireCooldown > 0 && this.fireCooldown <= tele) {
            this.windingUp = true;
            this.telegraphArmed = true;
        } else {
            this.windingUp = false;
        }
        
        if (bestTarget && this.fireCooldown <= 0) {
            if (!this.telegraphArmed) {
                // Instant-fire path (cooldown already 0): insert a readable wind-up.
                this.fireCooldown = tele;
                this.telegraphArmed = true;
                this.windingUp = true;
            } else {
                let a = this.facingAngle;
                SFX.robotShoot();
                this.muzzleFlash = 6;
                state.projectiles.push(new LaserProjectile(this.x+17, this.y+17, Math.cos(a)*BOSS_SHOT_SPEED, Math.sin(a)*BOSS_SHOT_SPEED));
                this.fireCooldown = bossFireCooldown(this.hp);
                this.telegraphArmed = false;
                this.windingUp = false;
            }
        } else if (!bestTarget) {
            this.telegraphArmed = false;
            this.windingUp = false;
        }
    }
    render(ctx) {
        if (this.hp <= 0) return;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const style = bossPhaseStyle(this.hp);
        const tele = bossTelegraphTicks(this.hp);
        const charge = this.windingUp
            ? Math.max(0, Math.min(1, 1 - (this.fireCooldown - 1) / tele))
            : 0;
        const stunned = this.hitFlicker > 0;
        const phasing = this.phaseChangeTimer > 0;

        if (this.hp <= 2) {
            const pulseSpeed = this.hp === 1 ? 0.28 : 0.15;
            const pulse = 0.55 + 0.45 * Math.abs(Math.sin(state.currentTick * pulseSpeed));
            ctx.save();
            ctx.strokeStyle = style.aura;
            ctx.globalAlpha = 0.45 + 0.4 * pulse;
            ctx.lineWidth = this.hp === 1 ? 3.2 : 2.2;
            ctx.beginPath();
            ctx.arc(cx, cy, 22 + pulse * (this.hp === 1 ? 7 : 4), 0, Math.PI * 2);
            ctx.stroke();
            if (this.hp === 1) {
                ctx.globalAlpha = 0.22 + 0.18 * pulse;
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.arc(cx, cy, 14 + pulse * 3, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }

        if (this.windingUp) {
            drawBossShotLanes(ctx, cx, cy, this.facingAngle, charge, false);
        }

        if (stunned) {
            const t = 1 - this.hitFlicker / BOSS_HIT_STUN;
            ctx.save();
            ctx.strokeStyle = this.hitFlicker > 22
                ? `rgba(255, 255, 255, ${1 - t * 0.4})`
                : `rgba(255, 60, 50, ${1 - t})`;
            ctx.lineWidth = 3.2;
            ctx.beginPath();
            ctx.arc(cx, cy, 18 + t * 36, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        if (phasing) {
            const u = 1 - this.phaseChangeTimer / BOSS_PHASE_FLASH;
            for (let i = 0; i < 3; i++) {
                const r = 16 + u * 78 + i * 16;
                ctx.save();
                ctx.strokeStyle = i === 0 ? `rgba(255,255,255,${(1 - u) * 0.9})` : `rgba(255, 200, 120, ${(1 - u) * (0.7 - i * 0.18)})`;
                ctx.lineWidth = 4.2 - i;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }

        let scale = 1;
        if (stunned) {
            if (this.hitFlicker > 22) scale = 1.1 + 0.16 * ((this.hitFlicker - 22) / 8);
            else scale = 1 + 0.07 * Math.sin((this.hitFlicker / 22) * Math.PI);
        }
        if (this.phaseChangeTimer > 24) scale = Math.max(scale, 1.3);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.facingAngle);
        ctx.scale(scale, scale);
        ctx.fillStyle = '#222'; ctx.fillRect(-15, -18, 30, 8); ctx.fillRect(-15, 10, 30, 8);
        ctx.strokeStyle = '#444'; ctx.strokeRect(-15, -18, 30, 8); ctx.strokeRect(-15, 10, 30, 8);
        ctx.fillStyle = '#555'; ctx.fillRect(-10, -10, 20, 20);
        ctx.fillStyle = style.core; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = style.stroke; ctx.lineWidth=2; ctx.stroke();
        ctx.strokeStyle = '#888'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(15, -20); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(15, 20); ctx.stroke();
        ctx.fillStyle = '#ff0044'; ctx.beginPath(); ctx.arc(15, -20, 4, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(15, 20, 4, 0, Math.PI*2); ctx.fill();

        const muzzleR = 3.2 + charge * 7.5 + (this.muzzleFlash > 0 ? 4 : 0);
        ctx.shadowColor = (charge > 0 || this.muzzleFlash > 0) ? '#ffffff' : '#ff0044';
        ctx.shadowBlur = 5 + charge * 18 + (this.muzzleFlash > 0 ? 14 : 0);
        ctx.fillStyle = (charge > 0.28 || this.muzzleFlash > 0) ? '#fff' : '#ff0044';
        ctx.beginPath(); ctx.arc(10, 0, muzzleR, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (charge > 0) {
            ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.6 * charge})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(10, 0, 6 + charge * 9, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = `rgba(255, 90, 80, ${0.4 + 0.6 * charge})`;
            ctx.lineWidth = 2 + charge * 3.2;
            ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(20 + charge * 16, 0); ctx.stroke();
        }

        if (stunned) {
            const white = this.hitFlicker > 22;
            const blink = Math.floor(this.hitFlicker / 3) % 2 === 0;
            if (white) {
                ctx.fillStyle = `rgba(255,255,255,${0.42 + 0.38 * ((this.hitFlicker - 22) / 8)})`;
                ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
            } else if (blink) {
                ctx.fillStyle = 'rgba(255, 36, 36, 0.28)';
                ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
            }
            ctx.strokeStyle = white ? '#fff' : '#ff3311';
            ctx.lineWidth = white ? 3.4 : 2.6;
            ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();

        const barW = this.w + 6;
        const barX = cx - barW / 2;
        const barY = this.y - 15;
        const barPulse = this.hp === 1
            ? 0.72 + 0.28 * Math.abs(Math.sin(state.currentTick * 0.28))
            : (this.hp === 2 ? 0.84 + 0.16 * Math.abs(Math.sin(state.currentTick * 0.14)) : 1);
        ctx.fillStyle = '#2a0000';
        ctx.fillRect(barX, barY, barW, 6);
        ctx.globalAlpha = phasing ? 0.7 + 0.3 * Math.abs(Math.sin(this.phaseChangeTimer * 0.55)) : barPulse;
        ctx.fillStyle = style.bar;
        ctx.fillRect(barX, barY, (this.hp / 3) * barW, 6);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = phasing ? '#fff' : style.stroke;
        ctx.lineWidth = phasing ? 2 : 1;
        ctx.strokeRect(barX, barY, barW, 6);

        if (phasing) {
            const fade = this.phaseChangeTimer / BOSS_PHASE_FLASH;
            ctx.save();
            ctx.globalAlpha = fade;
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px "Space Grotesk", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.shadowColor = style.stroke;
            ctx.shadowBlur = 8;
            ctx.fillText(style.banner, cx, barY - 4);
            ctx.restore();
        }
    }
}

export class Drone extends Entity {
    constructor(points, opts = {}) {
        super(points[0].x, points[0].y, 30, 30, 'drone');
        this.points=points; this.targetIndex=1; this.speed=2.5; this.state='patrol'; this.investTarget=null; this.investTimer=0; this.startX=this.x; this.startY=this.y;
        this.role = opts.role || 'patrol';
        this.ownerCamera = opts.ownerCamera || null;
        this.alive = true;
        this.lingerTimer = 0;
        this.chaseSpeed = CHASE_DRONE_SPEED;
        if (this.role === 'chase') {
            this.state = 'chase';
            this.lingerTimer = CHASE_DRONE_LINGER;
        }
    }
    reset() { this.x=this.startX; this.y=this.startY; this.targetIndex=1; this.state=this.role==='chase'?'chase':'patrol'; this.investTimer=0; this.lingerTimer=0; }
    _moveToward(tx, ty, spd) {
        let dx=tx-this.x; let dy=ty-this.y; let dist=Math.hypot(dx,dy);
        if (dist < spd) { this.x=tx; this.y=ty; return dist; }
        this.x+=(dx/dist)*spd; this.y+=(dy/dist)*spd;
        return dist;
    }
    _updateChase(player) {
        if (!this.alive) return null;
        const cameraSees = !!(this.ownerCamera && this.ownerCamera.seesPlayer);
        if (cameraSees) {
            this.state = 'chase';
            this.lingerTimer = CHASE_DRONE_LINGER;
            this._moveToward(player.x, player.y, this.chaseSpeed);
            if (state.currentTick % 10 === 0) SFX.dronePursuit();
        } else {
            this.state = 'return';
            this.lingerTimer--;
            const distHome = this._moveToward(this.startX, this.startY, this.speed);
            if (this.lingerTimer <= 0 || distHome < this.speed) {
                this.alive = false;
                return null;
            }
        }
        if (player.cloakTimer <= 0 && AABB(this.x, this.y, this.w, this.h, player.x, player.y, player.w, player.h)) return "Caught by Drone!";
        return null;
    }
    update(player, noiseSources) {
        if (!this.alive) return null;
        if (this.role === 'chase') return this._updateChase(player);
        for(let n of noiseSources) {
            if (Math.hypot(n.x - this.x, n.y - this.y) < 350) { 
                if (this.state !== 'investigate') SFX.droneAlert();
                this.state='investigate'; this.investTarget={x:n.x, y:n.y}; this.investTimer=180; break; 
            }
        }
        let tgt = this.state==='patrol' ? this.points[this.targetIndex] : this.investTarget;
        if (tgt) {
            let dx=tgt.x-this.x; let dy=tgt.y-this.y; let dist=Math.hypot(dx,dy);
            if (dist<this.speed) {
                this.x=tgt.x; this.y=tgt.y;
                if (this.state==='patrol') {
                    this.targetIndex=(this.targetIndex+1)%this.points.length;
                } else { 
                    if (state.currentTick % 30 === 0) SFX.droneScan();
                    this.investTimer--; 
                    if(this.investTimer<=0) this.state='patrol'; 
                }
            } else { 
                this.x+=(dx/dist)*this.speed; this.y+=(dy/dist)*this.speed; 
                if (this.state === 'investigate') { if (state.currentTick % 10 === 0) SFX.dronePursuit(); }
                else { if (state.currentTick % 60 === 0) SFX.dronePatrol(); }
            }
        }
        if (player.cloakTimer <= 0 && AABB(this.x, this.y, this.w, this.h, player.x, player.y, player.w, player.h)) return "Caught by Drone!";
        return null;
    }
    render(ctx) {
        if (!this.alive) return;
        const hover = Math.sin(state.currentTick * 0.22) * 3;
        const chasing = this.role === 'chase' && this.state === 'chase';
        ctx.fillStyle = chasing || this.state==='investigate' ? '#ff00aa' : (this.state==='return' ? '#ff6688' : '#ffffff');
        ctx.beginPath(); ctx.arc(this.x+15, this.y+15 + hover, 15, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle='#00f3ff'; ctx.beginPath(); ctx.arc(this.x+15, this.y+15 + hover, 5, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,243,255,0.35)';
        ctx.beginPath(); ctx.ellipse(this.x+15, this.y+28, 10, 3, 0, 0, Math.PI*2); ctx.stroke();
    }
}

export class Guard extends Entity {
    constructor(points) {
        super(points[0].x, points[0].y, 30, 30, 'guard');
        this.points=points; this.targetIndex=1; this.speed=1.5; this.state='patrol'; this.startX=this.x; this.startY=this.y;
        this.lostSightTimer=0; this.lastSeenX=this.x; this.lastSeenY=this.y; this.chaseSpeed=GUARD_CHASE_SPEED;
        this._resetFacing();
    }
    _resetFacing() {
        this.facingX = 0;
        this.facingY = 1;
        this.facingAngle = Math.PI / 2;
        this.targetAngle = Math.PI / 2;
        this.turnStartAngle = Math.PI / 2;
        this.turnTicksLeft = 0;
    }
    reset() {
        this.x=this.startX; this.y=this.startY; this.targetIndex=1; this.state='patrol'; this.lostSightTimer=0;
        this._resetFacing();
    }
    _setFacing(fx, fy) {
        if (this.facingX === fx && this.facingY === fy) return;
        this.facingX = fx;
        this.facingY = fy;
        this.targetAngle = Math.atan2(fy, fx);
        this.turnStartAngle = this.facingAngle;
        this.turnTicksLeft = GUARD_TURN_TICKS;
    }
    _faceToward(tx, ty) {
        if (Math.abs(tx-this.x)>Math.abs(ty-this.y)) this._setFacing(tx>this.x?1:-1, 0);
        else this._setFacing(0, ty>this.y?1:-1);
    }
    _advanceTurn() {
        if (this.turnTicksLeft <= 0) {
            this.facingAngle = this.targetAngle;
            return;
        }
        this.turnTicksLeft--;
        const t = 1 - this.turnTicksLeft / GUARD_TURN_TICKS;
        this.facingAngle = this.turnStartAngle + angleDiff(this.targetAngle, this.turnStartAngle) * t;
        if (this.turnTicksLeft <= 0) this.facingAngle = this.targetAngle;
    }
    update(player, ghosts) {
        // Interpolate facing before vision so this frame's cone matches render().
        // _faceToward / _setFacing only queue the next turn.
        this._advanceTurn();
        const cone = getVisionCone(this);

        // Echoes still swing the guard's facing, which can pull vision off the player.
        for (let g of ghosts) {
            if (!g.isActive) continue;
            if (pointInVisionCone(cone, g.x, g.y, g.w, g.h)) {
                this.state='distracted';
                this.lostSightTimer=0;
                this._faceToward(g.x, g.y);
                return null;
            }
        }

        const playerInVision = player.cloakTimer <= 0 && pointInVisionCone(cone, player.x, player.y, player.w, player.h);
        if (playerInVision) {
            this.state = 'chase';
            this.lostSightTimer = GUARD_LOST_SIGHT;
            this.lastSeenX = player.x;
            this.lastSeenY = player.y;
            this._faceToward(player.x, player.y);
        } else if (this.state === 'chase') {
            this.lostSightTimer--;
            if (this.lostSightTimer <= 0) this.state = 'patrol';
        }

        if (this.state === 'chase') {
            const pad = GUARD_CATCH_PAD;
            if (AABB(this.x-pad, this.y-pad, this.w+pad*2, this.h+pad*2, player.x, player.y, player.w, player.h)) {
                return "Caught by Guard!";
            }
            let dx=this.lastSeenX-this.x, dy=this.lastSeenY-this.y;
            let dist=Math.hypot(dx,dy);
            if (dist > this.chaseSpeed) {
                const nx=(dx/dist)*this.chaseSpeed, ny=(dy/dist)*this.chaseSpeed;
                if (!checkWallCollision(this.x+nx, this.y, this.w, this.h)) this.x += nx;
                if (!checkWallCollision(this.x, this.y+ny, this.w, this.h)) this.y += ny;
            }
            return null;
        }

        if (this.state==='patrol') {
            let target=this.points[this.targetIndex]; let dx=target.x-this.x, dy=target.y-this.y; let dist=Math.hypot(dx,dy);
            if (dist<this.speed) { this.x=target.x; this.y=target.y; this.targetIndex=(this.targetIndex+1)%this.points.length; }
            else {
                this.x+=(dx/dist)*this.speed; this.y+=(dy/dist)*this.speed;
                if (Math.abs(dx)>Math.abs(dy)) this._setFacing(dx>0?1:-1, 0);
                else this._setFacing(0, dy>0?1:-1);
            }
        }
        return null;
    }
    render(ctx) {
        const moving = this.state === 'patrol' || this.state === 'chase';
        const t = state.currentTick;
        const walk = moving ? Math.sin(t * 0.4) : 0;
        const img = resolveSprite(state, 'guard');
        if (img) {
            drawSprite(ctx, img, this.x, this.y, this.w, this.h, {
                flipX: Math.cos(this.facingAngle) < 0,
                bob: moving ? Math.abs(walk) * 2.2 : Math.sin(t * 0.12) * 0.6,
                scaleY: moving ? 1 + walk * 0.05 : 1,
                valign: 'bottom'
            });
        } else super.render(ctx);
        const cone = getVisionCone(this);
        if (this.state === 'chase') ctx.fillStyle = 'rgba(255,40,40,0.34)';
        else if (this.state === 'distracted') ctx.fillStyle = 'rgba(255,255,0,0.14)';
        else ctx.fillStyle = 'rgba(255,0,0,0.06)';
        ctx.beginPath();
        ctx.moveTo(cone.cx, cone.cy);
        ctx.arc(cone.cx, cone.cy, cone.range, cone.angle - cone.halfAngle, cone.angle + cone.halfAngle);
        ctx.closePath();
        ctx.fill();
    }
}

export class WindTunnel extends Entity {
    constructor(x, y, w, h, dx, dy) { super(x, y, w, h, 'wind'); this.vx = dx; this.vy = dy; }
    render(ctx) { 
        const img = resolveSprite(state, 'wind');
        if (img) drawTiled(ctx, img, this.x, this.y, this.w, this.h, 40, 0.72);
        else { ctx.fillStyle='rgba(200,200,255,0.15)'; ctx.fillRect(this.x,this.y,this.w,this.h); }
        
        ctx.save(); ctx.beginPath(); ctx.rect(this.x, this.y, this.w, this.h); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        let t = Date.now() / 15;
        let numLines = Math.floor((this.w * this.h) / 3000);
        for (let i = 0; i < numLines; i++) {
            let speedMod = 1 + (i % 3) * 0.5;
            let offset = (t * speedMod);
            let px = (((i * 83 + offset * this.vx) % this.w) + this.w) % this.w;
            let py = (((i * 113 + offset * this.vy) % this.h) + this.h) % this.h;
            let lenX = this.vx === 0 ? 2 : 20;
            let lenY = this.vy === 0 ? 2 : 20;
            ctx.fillRect(this.x + px, this.y + py, lenX, lenY);
        }
        ctx.restore();
    }
}

export class StaticZone extends Entity {
    constructor(x, y, w, h) { super(x, y, w, h, 'static'); }
    render(ctx) {
        const img = resolveSprite(state, 'static');
        if (img) drawTiled(ctx, img, this.x, this.y, this.w, this.h, 40, 0.72);
        else { ctx.fillStyle='rgba(150,0,255,0.2)'; ctx.fillRect(this.x,this.y,this.w,this.h); }
    }
}

function currentKillFraction() {
    const raw = state.currentLevelMeta?.pitKillFraction ?? state.editorLevelMeta?.pitKillFraction;
    return clampKillFraction(raw);
}

function centerOnPlate(actor) {
    const c = actorCenter(actor);
    for (const plate of state.plates || []) {
        if (plate && pointInRect(c.x, c.y, plate)) return true;
    }
    return false;
}

function holeKills(actor, tile) {
    if (!actor || centerOnPlate(actor)) return false;
    return centerInKillZone(actor, tile, currentKillFraction());
}

/** Stroke the exact kill rect (and the circle inscribed in it) so the warning matches the hole. */
export function drawKillRing(ctx, tile, fraction = currentKillFraction(), color = 'rgba(255, 186, 70, 0.95)') {
    const z = killZone(tile, fraction);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(z.x + 1.5, z.y + 1.5, Math.max(0, z.w - 3), Math.max(0, z.h - 3));
    const cx = z.x + z.w / 2;
    const cy = z.y + z.h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, Math.min(z.w, z.h) / 2 - 1), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return z;
}

function drawKillHole(ctx, tile, fraction = currentKillFraction()) {
    const z = killZone(tile, fraction);
    ctx.save();
    ctx.fillStyle = '#07080c';
    ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.strokeStyle = '#f2e2c4';
    ctx.lineWidth = 3;
    ctx.strokeRect(z.x + 1.5, z.y + 1.5, Math.max(0, z.w - 3), Math.max(0, z.h - 3));
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(z.x + 4, z.y + 4, Math.max(0, z.w - 8), Math.max(0, z.h - 8));
    ctx.restore();
    return z;
}

function rectsForPackage(pkg) {
    if (!pkg || pkg.isDestroyed) return [];
    const rects = [pkg];
    if (pkg.carriedBy === 'player' && state.player) rects.push(state.player);
    else if (typeof pkg.carriedBy === 'string' && pkg.carriedBy.startsWith('ghost_')) {
        const id = Number(pkg.carriedBy.slice(6));
        const ghost = (state.activeGhosts || []).find(g => g && g.id === id);
        if (ghost) rects.push(ghost);
    }
    return rects;
}

// Same forgiving hole as a courier: center inside the kill zone, and a center
// standing on a plate is floor. Edge overlap with the tile does not count.
function packageTouches(pkg, hazard) {
    return rectsForPackage(pkg).some(r => holeKills(r, hazard));
}

// Fragile cargo shatters. Anything else is lost and the run fails like a pit fall.
function swallowPackages(hazard) {
    let fail = null;
    for (const pkg of state.packages || []) {
        if (!packageTouches(pkg, hazard)) continue;
        if (pkg.type === 'fragile') {
            if (typeof pkg.breakApart === 'function') pkg.breakApart('shatter');
            else pkg.isDestroyed = true;
            SFX.break();
            if (!fail) fail = 'Fragile Package Destroyed!';
        } else {
            pkg.isDestroyed = true;
            pkg.carriedBy = null;
            if (!fail) fail = 'Package lost!';
        }
    }
    return fail;
}

function playerCarriedFragileInto(hazard, actors) {
    const player = (actors || []).find(isPresentPlayer);
    if (!player || player !== state.player) return false;
    if (!holeKills(player, hazard)) return false;
    for (const pkg of state.packages || []) {
        if (!pkg || pkg.isDestroyed || pkg.type !== 'fragile' || pkg.carriedBy !== 'player') continue;
        if (packageTouches(pkg, hazard)) return true;
    }
    return false;
}

export class Pit extends Entity {
    constructor(x, y, w, h) { super(x, y, w, h, 'pit'); }
    update(actors) {
        let playerFell = false;
        for (let a of actors || []) {
            if (!holeKills(a, this)) continue;
            if (isPresentPlayer(a)) { playerFell = true; continue; }
            if (a.id !== undefined) a.isActive = false;
        }
        const carriedFragile = playerFell && playerCarriedFragileInto(this, actors);
        const cargoFail = swallowPackages(this);
        if (carriedFragile) return 'Fragile Package Destroyed!';
        if (playerFell) return 'Fell into pit!';
        return cargoFail;
    }
    render(ctx) {
        ctx.fillStyle = '#3a2a1c';
        ctx.fillRect(this.x, this.y, this.w, this.h);
        drawKillHole(ctx, this);
    }
}

export const CRACK_STAGE_TICKS = 60;
export const CRACK_FAST_STAGE_TICKS = 12; // later stages; stage 1 lasts at least CRUMBLE_MIN_TICKS (0.5s)
export const CRACK_STAGES = 3;

export function crackStageTicksFor(speed) {
    return speed === 'fast' ? CRACK_FAST_STAGE_TICKS : CRACK_STAGE_TICKS;
}

function spawnEchoFellPuff(actor) {
    if (!actor || actor._crackFell) return;
    actor._crackFell = true;
    if (!Array.isArray(state.ghostFellFx)) state.ghostFellFx = [];
    const w = actor.w || 30;
    const h = actor.h || 30;
    const bits = [];
    for (let i = 0; i < 7; i++) {
        bits.push({
            a: (i / 7) * Math.PI * 2 + 0.35,
            speed: 0.65 + (i % 3) * 0.3,
            size: 2 + (i % 2)
        });
    }
    state.ghostFellFx.push({
        x: actor.x + w / 2,
        y: actor.y + h / 2,
        ttl: 30,
        max: 30,
        bits
    });
}

export function tickEchoFellFx() {
    const list = state.ghostFellFx;
    if (!list || !list.length) return;
    for (let i = list.length - 1; i >= 0; i--) {
        list[i].ttl--;
        if (list[i].ttl <= 0) list.splice(i, 1);
    }
}

export function renderEchoFellFx(ctx) {
    const list = state.ghostFellFx;
    if (!ctx || !list || !list.length) return;
    for (const fx of list) {
        const life = Math.max(0, fx.ttl / fx.max);
        const age = 1 - life;
        ctx.save();
        for (let i = 0; i < 3; i++) {
            const radius = 5 + age * (18 + i * 14);
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = `rgba(0, 243, 255, ${life * (0.7 - i * 0.16)})`;
            ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = `rgba(125, 249, 255, ${life * 0.14})`;
            ctx.fill();
        }
        for (const bit of fx.bits) {
            const dist = age * bit.speed * 28;
            ctx.beginPath();
            ctx.fillStyle = `rgba(190, 252, 255, ${life * 0.85})`;
            ctx.arc(
                fx.x + Math.cos(bit.a) * dist,
                fx.y + Math.sin(bit.a) * dist + age * 8,
                Math.max(0.6, bit.size * life),
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
        ctx.restore();
    }
}

function isOrthoCrackNeighbor(a, b) {
    const eps = 1;
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    const touchX = Math.abs((a.x + a.w) - b.x) <= eps || Math.abs((b.x + b.w) - a.x) <= eps;
    const touchY = Math.abs((a.y + a.h) - b.y) <= eps || Math.abs((b.y + b.h) - a.y) <= eps;
    return (touchX && overlapY > eps) || (touchY && overlapX > eps);
}

export class CrackedFloor extends Entity {
    constructor(x, y, w, h, crackSpeed) {
        super(x, y, w, h, 'crack');
        this.ticks = 0;
        this.stage = 0;
        this.collapsing = false;
        this.broken = false;
        this.warningTicks = 0;
        this.showingWarning = false;
        this.warningCommitted = false;
        this.ringShown = false;
        this.setCrackSpeed(crackSpeed);
    }
    setCrackSpeed(speed) {
        this.crackSpeed = speed === 'fast' ? 'fast' : 'normal';
        this.stageTicks = crackStageTicksFor(this.crackSpeed);
    }
    killFraction() { return currentKillFraction(); }
    killZoneRect() { return killZone(this, this.killFraction()); }
    // A crack that shares area with a plate is floor, not a pit. Edge contact (area 0) does not count.
    overlapsPlate() {
        for (const plate of state.plates || []) {
            if (plate && overlapArea(this, plate) > 0) return true;
        }
        return false;
    }
    // Knit a spent tile back to intact floor. Used when the burrower has no legal target.
    restoreIntact() {
        this.ticks = 0;
        this.stage = 0;
        this.collapsing = false;
        this.broken = false;
        this.warningTicks = 0;
        this.showingWarning = false;
        this.warningCommitted = false;
        this.ringShown = false;
    }
    // Telegraph / dust ring. Does not by itself start the crumble timer.
    showWarningRing() {
        if (this.broken || this.collapsing || this.overlapsPlate()) return;
        this.showingWarning = true;
        this.ringShown = true;
    }
    // Weight or ortho cascade: the ring must play out before crumble.
    commitWarning() {
        if (this.broken || this.collapsing || this.overlapsPlate()) return;
        this.showingWarning = true;
        this.ringShown = true;
        this.warningCommitted = true;
    }
    stage1Ticks() {
        const step = this.stageTicks || CRACK_STAGE_TICKS;
        return Math.max(step, CRUMBLE_MIN_TICKS);
    }
    startCollapse() {
        if (this.broken || this.collapsing || this.overlapsPlate()) return;
        // No ring yet: queue the warning instead of opening a hole.
        if (!this.ringShown && (this.warningTicks || 0) < 1) {
            this.commitWarning();
            return;
        }
        this.collapsing = true;
        this.warningCommitted = false;
        this.ticks = 0;
        this.stage = 1;
        this.showingWarning = true;
        SFX.crack();
    }
    cascadeNeighbors() {
        for (const other of state.cracks || []) {
            if (other === this || other.broken || other.collapsing) continue;
            if (!isOrthoCrackNeighbor(this, other)) continue;
            other.commitWarning();
        }
    }
    update(actors) {
        if (this.overlapsPlate()) {
            this.collapsing = false;
            this.broken = false;
            this.warningTicks = 0;
            this.showingWarning = false;
            this.warningCommitted = false;
            this.stage = 0;
            return null;
        }
        if (this.broken) {
            let playerFell = false;
            for (let a of actors || []) {
                if (!holeKills(a, this)) continue;
                if (isPresentPlayer(a)) { playerFell = true; continue; }
                if (a.id !== undefined && a.isActive) {
                    spawnEchoFellPuff(a);
                    a.isActive = false;
                }
            }
            const carriedFragile = playerFell && playerCarriedFragileInto(this, actors);
            const cargoFail = swallowPackages(this);
            if (carriedFragile) return 'Fragile Package Destroyed!';
            if (playerFell) return 'Fell into pit!';
            return cargoFail;
        }
        // A crack the burrower has locked holds until its strike (no weight crumble).
        if (!this.collapsing && !this.burrowerHold) {
            for (let a of actors || []) {
                if (!a || a.isActive === false) continue;
                if (AABB(a.x, a.y, a.w || 30, a.h || 30, this.x, this.y, this.w, this.h)) {
                    this.commitWarning();
                    break;
                }
            }
        }
        if (this.warningCommitted && !this.collapsing && !this.burrowerHold) {
            this.warningTicks++;
            this.showingWarning = true;
            this.ringShown = true;
            if (this.warningTicks >= WARNING_RING_TICKS) this.startCollapse();
        }
        if (this.collapsing && !this.broken) {
            this.ticks++;
            const step = this.stageTicks || CRACK_STAGE_TICKS;
            const stage1 = this.stage1Ticks();
            const breakAt = stage1 + step * (CRACK_STAGES - 1);
            if (this.ticks >= breakAt) {
                this.broken = true;
                this.stage = CRACK_STAGES + 1;
                this.showingWarning = false;
                SFX.break();
                this.cascadeNeighbors();
            } else {
                let next = 1;
                if (this.ticks > stage1) next = Math.min(CRACK_STAGES, 1 + Math.ceil((this.ticks - stage1) / step));
                if (next !== this.stage) {
                    this.stage = next;
                    SFX.crack();
                }
            }
        }
        return null;
    }
    drawFractures(ctx, count, color, width) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(this.x, this.y, this.w, this.h);
        ctx.clip();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'square';
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        for (let i = 0; i < count; i++) {
            const ang = (i / count) * Math.PI + 0.35;
            const len = Math.max(this.w, this.h) * (0.45 + (i % 2) * 0.25);
            ctx.beginPath();
            ctx.moveTo(cx - Math.cos(ang) * len, cy - Math.sin(ang) * len);
            ctx.lineTo(cx + Math.cos(ang) * len * 0.7, cy + Math.sin(ang) * len * 0.7);
            ctx.stroke();
        }
        ctx.restore();
    }
    renderPit(ctx) {
        this.renderFloor(ctx, 0, '#5a3d28');
        drawKillHole(ctx, this, this.killFraction());
        if (this.broken) {
            // HOLE: dark red rim so it never reads as a crack or safe floor.
            ctx.save();
            ctx.strokeStyle = '#d0302a';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x + 1, this.y + 1, this.w - 2, this.h - 2);
            ctx.restore();
        }
    }
    // CRACK: fracture lines and a dashed sand border. Safe floor has neither.
    drawIntactCrackLook(ctx) {
        this.drawFractures(ctx, 2, 'rgba(45, 22, 6, 0.85)', 1.5);
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(240, 200, 120, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(this.x + 1, this.y + 1, this.w - 2, this.h - 2);
        ctx.restore();
    }
    renderFloor(ctx, inset, fallback) {
        const img = resolveSprite(state, 'crack');
        const x = this.x + inset, y = this.y + inset;
        const w = Math.max(2, this.w - inset * 2), h = Math.max(2, this.h - inset * 2);
        if (img) drawTiled(ctx, img, x, y, w, h, 40, 1);
        else { ctx.fillStyle = fallback; ctx.fillRect(x, y, w, h); }
    }
    render(ctx) {
        if (this.broken) {
            this.renderPit(ctx);
            return;
        }
        // Only a real, running warning draws a ring here (weight or cascade, or the
        // first crumble stage). The burrower draws its own single strike mark, so a
        // ring left over from an earlier telegraph never shows as a second marker.
        if (this.warningCommitted || (this.collapsing && this.stage === 1)) {
            drawKillRing(ctx, this, this.killFraction());
        }
        const stage = this.collapsing ? this.stage : 0;
        if (stage === 0) {
            this.renderFloor(ctx, 0, '#966432');
            this.drawIntactCrackLook(ctx);
            return;
        }
        if (stage >= 2) this.renderPit(ctx);
        if (stage === 1) {
            this.renderFloor(ctx, 0, '#c9893a');
            this.drawFractures(ctx, 3, '#3a2010', 2);
            this.drawCrumbleOutline(ctx);
        } else if (stage === 2) {
            this.renderFloor(ctx, 8, '#6a4020');
            this.drawFractures(ctx, 5, '#1a0800', 3);
        } else {
            this.renderFloor(ctx, 14, '#3a2010');
            this.drawFractures(ctx, 7, '#000', 4);
        }
    }
    drawCrumbleOutline(ctx) {
        const x = this.x, y = this.y, w = this.w, h = this.h;
        const pts = [];
        const pushEdge = (x0, y0, x1, y1, nx, ny) => {
            const len = Math.hypot(x1 - x0, y1 - y0) || 1;
            const n = Math.max(1, Math.round(len / 8));
            for (let i = 0; i < n; i++) {
                const t = i / n;
                const px = x0 + (x1 - x0) * t;
                const py = y0 + (y1 - y0) * t;
                const o = (i % 2) ? 4 : -2;
                pts.push([px + nx * o, py + ny * o]);
            }
        };
        pushEdge(x, y, x + w, y, 0, -1);
        pushEdge(x + w, y, x + w, y + h, 1, 0);
        pushEdge(x + w, y + h, x, y + h, 0, 1);
        pushEdge(x, y + h, x, y, -1, 0);
        if (!pts.length) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.setLineDash([5, 3]);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255, 228, 170, 0.95)';
        ctx.stroke();
        ctx.restore();
    }
}
