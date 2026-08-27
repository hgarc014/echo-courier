import { state, getPlayerRank } from '../core/state.js';
import { Entity } from './base.js';
import { AABB, getDashDestination } from '../core/physics.js';
import { drawSprite } from '../core/sprites.js';

function walkPose(moving, carrying, dashing, tick) {
    const walk = moving ? Math.sin(tick * 0.55) : 0;
    return {
        bob: moving ? Math.abs(walk) * (carrying ? 1.4 : 2.6) : Math.sin(tick * 0.1) * 0.5,
        scaleY: dashing ? 0.84 : (moving ? 1 + walk * 0.06 : 1),
        scaleX: dashing ? 1.16 : (moving ? 1 - walk * 0.05 : (carrying ? 1.05 : 1))
    };
}

export class PlayerEntity extends Entity {
    constructor(x, y, w, h) {
        super(x, y, w, h, 'player');
        this.moving = false;
        this.carrying = false;
        this.facingX = 1;
        this.facingY = 0;
        this.cloakTimer = 0;
        this.dashCooldown = 0;
    }
    render(ctx) {
        const t = state.currentTick;
        const cloaking = this.cloakTimer > 0;
        const dashing = this.dashCooldown > 48;
        const pose = walkPose(this.moving, this.carrying, dashing, t);
        const img = state.assets[this.assetName];
        const fx = this.facingX || 0;

        if (dashing && img) {
            const dirX = this.facingX || 1;
            const dirY = this.facingY || 0;
            for (let i = 2; i >= 1; i--) {
                drawSprite(ctx, img, this.x - dirX * i * 8, this.y - dirY * i * 8, this.w, this.h, {
                    tint: state.playerColor,
                    tintAlpha: 0.12,
                    alpha: 0.28 / i,
                    flipX: fx < 0,
                    valign: 'bottom'
                });
            }
        }

        if (img && drawSprite(ctx, img, this.x, this.y, this.w, this.h, {
            tint: state.playerColor,
            tintAlpha: 0.2,
            flipX: fx < 0,
            bob: pose.bob,
            scaleX: pose.scaleX,
            scaleY: pose.scaleY,
            alpha: cloaking ? 0.85 : 1,
            scanlines: cloaking,
            valign: 'bottom'
        })) {
            return;
        }
        ctx.fillStyle = state.playerColor;
        ctx.fillRect(this.x, this.y, this.w, this.h);
    }
}

export class Ghost extends Entity {
    constructor(id, runData) {
        const firstStep = runData?.[0] || {};
        super(firstStep.x ?? -100, firstStep.y ?? -100, 30, 30, 'player'); this.id=id; this.runData=runData; this.isActive=true;
        this.localTick=0; this.lastStateIndex=0; this.cloakTimer=0; this.facingX=firstStep.facingX || 1; this.facingY=firstStep.facingY || 0;
        this.cloakActive = false;
        this.intendedDx = 0;
        this.intendedDy = 0;
        this.trail = [];
        this.spawnTtl = 24;
    }
    update(pkgs, staticZones, winds) {
        this.isActive = true;
        if (this.spawnTtl > 0) this.spawnTtl--;
        let speed = 1.0;
        for(let z of staticZones) if (AABB(this.x, this.y, this.w, this.h, z.x, z.y, z.w, z.h)) speed = 0.5;
        this.localTick += speed;
        
        let stateIndex = Math.floor(this.localTick); let isPastEnd = false;
        if (stateIndex >= this.runData.length) { stateIndex = this.runData.length - 1; isPastEnd = true; }
        const step = this.runData[stateIndex];
        if (!step) { this.intendedDx = 0; this.intendedDy = 0; return; }
        
        this.cloakTimer = step.cloakTimer || 0;
        this.cloakActive = this.cloakTimer > 0;
        this.facingX = step.facingX || 0; this.facingY = step.facingY || 0;
        
        let interactJustPressed = !isPastEnd && step.interact && this.lastStateIndex !== stateIndex;
        let tossJustPressed = !isPastEnd && step.toss && this.lastStateIndex !== stateIndex;
        let dashJustPressed = !isPastEnd && step.dash && this.lastStateIndex !== stateIndex;
        this.lastStateIndex = stateIndex;

        if (dashJustPressed) {
            let dest = getDashDestination(this.x, this.y, this.facingX || 1, this.facingY || 0, 120, this.w, this.h);
            this.x = dest.x;
            this.y = dest.y;
        }

        let envVx = 0, envVy = 0;
        for (let w of winds) if (AABB(this.x, this.y, this.w, this.h, w.x, w.y, w.w, w.h)) { envVx += w.vx; envVy += w.vy; }

        let carried = pkgs.find(p => p.carriedBy === 'ghost_' + this.id);
        let currentSpeed = (carried && carried.type === 'heavy') ? 2 : 4;
        let inputX = isPastEnd ? 0 : (step.moveX || 0);
        let inputY = isPastEnd ? 0 : (step.moveY || 0);
        let moveMagnitude = Math.hypot(inputX, inputY);
        if (moveMagnitude > 1) { inputX /= moveMagnitude; inputY /= moveMagnitude; }

        this.intendedDx = (envVx + inputX * currentSpeed) * speed;
        this.intendedDy = (envVy + inputY * currentSpeed) * speed;
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 24) this.trail.shift();

        if (interactJustPressed) {
            let carrying = null;
            for (let p of pkgs) if (p.carriedBy === 'ghost_'+this.id) carrying=p;
            if (carrying) carrying.carriedBy=null;
            else { 
                for (let p of pkgs) {
                    if (!p.isDestroyed && (!p.carriedBy || p.carriedBy.startsWith('ghost_')) && AABB(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) { 
                        p.carriedBy='ghost_'+this.id; break; 
                    }
                } 
            }
        }
        
        if (tossJustPressed) {
            let carrying = pkgs.find(p => p.carriedBy === 'ghost_'+this.id);
            if (carrying) { carrying.carriedBy = null; carrying.vx = this.facingX*12; carrying.vy = this.facingY*12; carrying.tossTicks = 10; }
        }
    }
    render(ctx) {
        if (!this.isActive) return;
        if (getPlayerRank() >= 2) {
            const pts = this.trail.concat([{ x: this.x, y: this.y }]);
            if (pts.length > 1) {
                ctx.save(); ctx.strokeStyle = state.playerColor; ctx.lineWidth = 3; ctx.globalAlpha = 0.4;
                ctx.beginPath();
                ctx.moveTo(pts[0].x + this.w / 2, pts[0].y + this.h / 2);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + this.w / 2, pts[i].y + this.h / 2);
                ctx.stroke();
                ctx.restore();
            }
        }

        const t = state.currentTick;
        const spawn = this.spawnTtl / 24;
        const moving = Math.abs(this.intendedDx) + Math.abs(this.intendedDy) > 0.2;
        const carrying = !!(state.packages && state.packages.find(p => p.carriedBy === 'ghost_' + this.id));
        const dashing = false;
        const pose = walkPose(moving, carrying, dashing, t);
        const cloaking = this.cloakTimer > 0;
        const img = state.assets[this.assetName];
        const spawnScale = spawn > 0 ? 0.55 + (1 - spawn) * 0.45 : 1;

        if (spawn > 0) {
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h / 2;
            ctx.save();
            ctx.strokeStyle = `rgba(0,243,255,${spawn})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, 8 + (1 - spawn) * 22, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        if (img) {
            drawSprite(ctx, img, this.x, this.y, this.w, this.h, {
                tint: '#00f3ff',
                tintAlpha: 0.22,
                flipX: (this.facingX || 0) < 0,
                bob: pose.bob,
                scaleX: pose.scaleX * spawnScale,
                scaleY: pose.scaleY * spawnScale,
                alpha: cloaking ? 0.72 : 0.92,
                scanlines: cloaking,
                valign: 'bottom'
            });
        } else {
            ctx.fillStyle = '#00f3ff'; ctx.fillRect(this.x, this.y, this.w, this.h);
        }

        if (state.abilitiesPurchased.ghostShield || state.levelAbilityOverrides.includes('ghostShield')) {
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h / 2;
            const facingX = this.facingX || 1;
            const facingY = this.facingY || 0;
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 221, 0, 0.9)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + facingX * 18, cy + facingY * 18);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 221, 0, 0.25)';
            if (Math.abs(facingX) > 0) {
                const shieldX = facingX > 0 ? this.x + this.w - 4 : this.x - 8;
                ctx.fillRect(shieldX, this.y - 2, 8, this.h + 4);
            } else if (Math.abs(facingY) > 0) {
                const shieldY = facingY > 0 ? this.y + this.h - 4 : this.y - 8;
                ctx.fillRect(this.x - 2, shieldY, this.w + 4, 8);
            }
            ctx.restore();
        }
    }
}
