import { state, getPlayerRank } from '../core/state.js';
import { Entity } from './base.js';
import { AABB } from '../core/physics.js';

export class PlayerEntity extends Entity {
    constructor(x, y, w, h) { super(x, y, w, h, 'player'); }
    render(ctx) {
        ctx.save();
        if (state.assets[this.assetName]) {
            ctx.drawImage(state.assets[this.assetName], this.x, this.y, this.w, this.h);
            ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = state.playerColor; ctx.globalAlpha = 0.5; ctx.fillRect(this.x, this.y, this.w, this.h);
        } else { ctx.fillStyle = state.playerColor; ctx.fillRect(this.x, this.y, this.w, this.h); }
        ctx.restore();
    }
}

export class Ghost extends Entity {
    constructor(id, runData) {
        super(-100, -100, 30, 30, 'player'); this.id=id; this.runData=runData; this.isActive=true;
        this.localTick=0; this.lastStateIndex=0; this.cloakTimer=0; this.facingX=0; this.facingY=0;
        this.cloakActive = false;
    }
    update(pkgs, staticZones) {
        this.isActive = true;
        let speed = 1.0;
        for(let z of staticZones) if (AABB(this.x, this.y, this.w, this.h, z.x, z.y, z.w, z.h)) speed = 0.5;
        this.localTick += speed;
        
        let stateIndex = Math.floor(this.localTick); let isPastEnd = false;
        if (stateIndex >= this.runData.length) { stateIndex = this.runData.length - 1; isPastEnd = true; }
        const step = this.runData[stateIndex]; 
        let targetX = step.x; let targetY = step.y;
        if (this.lastStateIndex !== stateIndex) {
            if (Math.random() < 0.05) { targetX += (Math.random() - 0.5) * 4; targetY += (Math.random() - 0.5) * 4; }
        }
        
        let dx = targetX - this.x; let dy = targetY - this.y;
        if (Math.hypot(dx, dy) > 20) { this.x = targetX; this.y = targetY; this.intendedDx = 0; this.intendedDy = 0; } 
        else { this.intendedDx = dx; this.intendedDy = dy; }
        
        this.cloakTimer = step.cloakTimer || 0;
        this.cloakActive = this.cloakTimer > 0;
        this.facingX = step.facingX || 0; this.facingY = step.facingY || 0;
        
        let interactJustPressed = !isPastEnd && step.interact && this.lastStateIndex !== stateIndex;
        let tossJustPressed = !isPastEnd && step.toss && this.lastStateIndex !== stateIndex;
        this.lastStateIndex = stateIndex;

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
            ctx.save(); ctx.strokeStyle = state.playerColor; ctx.lineWidth = 3; ctx.globalAlpha = 0.4;
            ctx.beginPath(); let startT = Math.max(0, Math.floor(this.localTick) - 15);
            if (startT < this.runData.length) {
                ctx.moveTo(this.runData[startT].x + 15, this.runData[startT].y + 15);
                for (let i = startT + 1; i <= Math.floor(this.localTick) && i < this.runData.length; i++) ctx.lineTo(this.runData[i].x + 15, this.runData[i].y + 15);
                ctx.stroke();
            }
            ctx.restore();
        }
        ctx.save(); ctx.globalAlpha = this.cloakTimer > 0 ? 0.2 : 0.5;
        if (state.assets[this.assetName]) {
            ctx.drawImage(state.assets[this.assetName], this.x, this.y, this.w, this.h);
            ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = '#00f3ff'; ctx.globalAlpha = 0.5; ctx.fillRect(this.x, this.y, this.w, this.h);
        } else { ctx.fillStyle = '#00f3ff'; ctx.fillRect(this.x, this.y, this.w, this.h); }
        ctx.restore();

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
