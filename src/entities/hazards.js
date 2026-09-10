import { state } from '../core/state.js';
import { Entity } from './base.js';
import { AABB, checkWallCollision, lineOfSightBlocked } from '../core/physics.js';
import { SFX } from '../core/audio.js';
import { drawSprite, drawTiled } from '../core/sprites.js';
import { resolveSprite } from '../core/atlas.js';

function isPresentPlayer(actor) {
    return actor && actor.id === undefined && actor.assetName === 'player';
}

export class Laser extends Entity {
    constructor(id, x, y, w, h) { super(x, y, w, h, 'laser'); this.id=id; this.isOpen=false; }
    render(ctx) {
        if (!this.isOpen) {
            const pulse = 0.78 + 0.22 * Math.abs(Math.sin(state.currentTick * 0.18));
            const img = resolveSprite(state, 'laser');
            if (img) {
                ctx.save(); ctx.beginPath(); ctx.rect(this.x, this.y, this.w, this.h); ctx.clip();
                ctx.globalAlpha = pulse;
                const tile = 40;
                for(let i=0; i<this.h; i+=tile) ctx.drawImage(img, this.x+(this.w/2 - 20), this.y+i, tile, tile);
                for(let i=0; i<this.w; i+=tile) ctx.drawImage(img, this.x+i, this.y+(this.h/2 - 20), tile, tile);
                ctx.restore();
            } else { ctx.fillStyle=`rgba(255,0,0,${0.35 * pulse})`; ctx.fillRect(this.x, this.y, this.w, this.h); }
        }
    }
}

export class SweepCamera extends Entity {
    constructor(x, y, startAngle, sweepRange) {
        super(x, y, 30, 30, 'camera');
        this.baseAngle=startAngle; this.sweepRange=sweepRange; this.currentAngle=startAngle; this.sweepProgress=0; this.sweepDir=0.01;
    }
    update(player, pkgs) {
        this.sweepProgress+=this.sweepDir; if (this.sweepProgress>=1 || this.sweepProgress<=-1) this.sweepDir*=-1;
        this.currentAngle = this.baseAngle + (this.sweepProgress * this.sweepRange);
        
        let triggerAlarm = false;
        const checkCone = (tx, ty) => {
            let dx=(tx+15)-(this.x+15); let dy=(ty+15)-(this.y+15);
            if (Math.hypot(dx, dy) > 250) return false;
            let diff=Math.atan2(dy, dx)-this.currentAngle;
            while(diff>Math.PI) diff-=Math.PI*2; while(diff<-Math.PI) diff+=Math.PI*2;
            return Math.abs(diff)<0.35;
        };

        if (player.cloakTimer <= 0 && checkCone(player.x, player.y)) triggerAlarm=true;
        for(let g of state.activeGhosts) if (!g.cloakActive && checkCone(g.x, g.y)) triggerAlarm=true;
        for(let p of pkgs) if (p.type==='contraband' && checkCone(p.x, p.y)) triggerAlarm=true;
        
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
