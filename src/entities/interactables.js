import { state } from '../core/state.js';
import { Entity } from './base.js';
import { AABB } from '../core/physics.js';
import { SFX } from '../core/audio.js';
import { drawSprite, drawTiled } from '../core/sprites.js';

export class Wall extends Entity {
    constructor(x, y, w, h) { super(x, y, w, h, 'wall'); }
    render(ctx) {
        if (state.assets.wall) {
            const pulse = 0.92 + 0.08 * Math.sin(state.currentTick * 0.06);
            drawTiled(ctx, state.assets.wall, this.x, this.y, this.w, this.h, 40, pulse);
            ctx.strokeStyle = '#00f3ff'; ctx.lineWidth=1; ctx.strokeRect(this.x, this.y, this.w, this.h);
        }
    }
}

export class Package extends Entity {
    constructor(id, x, y, type = 'standard', requiredForDelivery = true) {
        super(x, y, 30, 30, 'package');
        this.id=id; this.type=type; this.startX=x; this.startY=y; this.carriedBy=null; this.isDestroyed=false;
        this.wasPickedUp=false; this.countdown=300; this.tossTicks=0; this.vx=0; this.vy=0;
        this.requiredForDelivery = requiredForDelivery;
    }
    reset() { this.x=this.startX; this.y=this.startY; this.carriedBy=null; this.isDestroyed=false; this.wasPickedUp=false; this.countdown=300; this.tossTicks=0; this.vx=0; this.vy=0; }
    update() {
        if (this.isDestroyed) return null;
        if (this.carriedBy) this.wasPickedUp = true;
        if (this.tossTicks > 0 && !this.carriedBy) {
            this.x += this.vx; this.y += this.vy; this.tossTicks--;
            for(let wall of state.walls) if (AABB(this.x, this.y, this.w, this.h, wall.x, wall.y, wall.w, wall.h)) { this.x-=this.vx; this.y-=this.vy; this.tossTicks=0; break; }
            for(let door of state.doors) if (!door.isOpen && AABB(this.x, this.y, this.w, this.h, door.x, door.y, door.w, door.h)) { this.x-=this.vx; this.y-=this.vy; this.tossTicks=0; break; }
        }
        if (this.type === 'timed' && this.wasPickedUp && !AABB(state.deliveryZone.x, state.deliveryZone.y, state.deliveryZone.w, state.deliveryZone.h, this.x, this.y, this.w, this.h)) {
            this.countdown--;
            if (this.countdown <= 0) { this.isDestroyed = true; return "Timed Package Exploded!"; }
        }
        return null;
    }
    render(ctx) {
        if (this.isDestroyed) return;
        const t = state.currentTick;
        const carried = !!this.carriedBy;
        const idSeed = typeof this.id === 'number' ? this.id : [...String(this.id)].reduce((n, ch) => n + ch.charCodeAt(0), 0);
        const bob = carried ? 0 : Math.sin(t * 0.15 + idSeed * 0.17) * 1.6;
        const rotation = this.tossTicks > 0 ? (10 - this.tossTicks) * 0.45 : 0;
        const scale = carried ? 0.86 : (this.tossTicks > 0 ? 1.08 : 1);
        const drawY = carried ? this.y - 12 : this.y;
        let img = state.assets.package;
        let tint = null;
        let tintAlpha = 0;
        if (this.type === 'heavy') { img = state.assets.heavy || img; tint = '#ffd27a'; tintAlpha = 0.16; }
        else if (this.type === 'fragile') { img = state.assets.fragile || img; tint = '#ff6b6b'; tintAlpha = 0.14; }
        else if (this.type === 'contraband') { tint = '#b14bff'; tintAlpha = 0.28; }
        else if (this.type === 'decoy') { tint = '#00f3ff'; tintAlpha = 0.22; }
        else if (this.type === 'timed') { tint = '#ff3333'; tintAlpha = 0.2; }

        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(this.x + 4, this.y + this.h - 6, this.w - 8, 5);

        const drawn = img && drawSprite(ctx, img, this.x, drawY, this.w, this.h, {
            valign: 'bottom', bob, rotation, scaleX: scale, scaleY: scale, tint, tintAlpha,
            alpha: this.type === 'decoy' ? 0.85 : 1
        });
        if (!drawn) {
            ctx.fillStyle = tint || '#c9a227';
            ctx.fillRect(this.x, drawY, this.w, this.h);
        }
        if (this.type === 'contraband') { ctx.strokeStyle='red'; ctx.lineWidth=2; ctx.strokeRect(this.x, drawY, this.w, this.h); }
        if (this.type === 'timed') {
            ctx.fillStyle='#fff'; ctx.font='10px Space Grotesk, sans-serif'; ctx.textAlign='center';
            ctx.fillText(String(Math.ceil(this.countdown/60)), this.x + this.w/2, drawY + 18);
            ctx.textAlign='start';
        }
    }
}

export class PressurePlate extends Entity {
    constructor(id, x, y, linkedIds) { super(x, y, 40, 40, 'plate'); this.id=id; this.linkedIds=Array.isArray(linkedIds)?linkedIds:[linkedIds]; this.isPressed=false; }
    update(actors, pkgs) {
        this.isPressed = false;
        for (let a of actors) if (AABB(this.x, this.y, this.w, this.h, a.x, a.y, a.w, a.h)) { this.isPressed=true; break; }
        if (!this.isPressed) for (let p of pkgs) if (!p.isDestroyed && !p.carriedBy && AABB(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) { this.isPressed=true; break; }
    }
    render(ctx) {
        const pulse = this.isPressed ? 1 : 0.88 + 0.08 * Math.sin(state.currentTick * 0.12);
        if (state.assets.plate) drawSprite(ctx, state.assets.plate, this.x, this.y, this.w, this.h, { valign: 'center', alpha: pulse });
        else super.render(ctx);
        if (this.isPressed) { ctx.strokeStyle='#ffdd00'; ctx.lineWidth=2; ctx.strokeRect(this.x, this.y, this.w, this.h); }
    }
}

export class TemporalPlate extends PressurePlate {
    constructor(id, x, y, linkedIds, requiredTimeline) { 
        super(id, x, y, linkedIds); 
        this.requiredTimeline = requiredTimeline; 
    }
    update(actors) { 
        this.isPressed = false;
        let validActor = null;
        if (this.requiredTimeline === 'present') validActor = actors.find(a => a.id === undefined && a.assetName === 'player');
        else if (this.requiredTimeline === 'first') validActor = actors.find(a => a.id === 0);
        else if (this.requiredTimeline === 'last') validActor = actors.find(a => a.id === state.activeGhosts.length - 1);
        
        if (validActor && AABB(this.x, this.y, this.w, this.h, validActor.x, validActor.y, validActor.w, validActor.h)) this.isPressed = true;
    }
    render(ctx) {
        if (this.requiredTimeline === 'present') ctx.fillStyle = 'rgba(0, 255, 0, 0.4)';
        else if (this.requiredTimeline === 'first') ctx.fillStyle = 'rgba(255, 0, 255, 0.4)';
        else if (this.requiredTimeline === 'last') ctx.fillStyle = 'rgba(0, 150, 255, 0.4)';
        ctx.fillRect(this.x, this.y, this.w, this.h);
        
        const pulse = this.isPressed ? 1 : 0.75;
        if (state.assets.plate) drawSprite(ctx, state.assets.plate, this.x, this.y, this.w, this.h, { valign: 'center', alpha: pulse });
        if (this.isPressed) { ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.strokeRect(this.x, this.y, this.w, this.h); }
    }
}

export class Door extends Entity {
    constructor(id, x, y, w, h) { super(x, y, w, h, 'door'); this.id=id; this.isOpen=false; }
    render(ctx) {
        if (!this.isOpen) {
            if (state.assets.door) drawTiled(ctx, state.assets.door, this.x, this.y, this.w, this.h, 40);
            else super.render(ctx);
            const pulse = 0.25 + 0.2 * Math.abs(Math.sin(state.currentTick * 0.14));
            ctx.fillStyle = `rgba(255,40,40,${pulse})`;
            ctx.fillRect(this.x, this.y, this.w, 3);
        } else { ctx.fillStyle='rgba(255,60,0,0.1)'; ctx.fillRect(this.x, this.y, this.w, this.h); }
    }
}

export class AlarmDoor extends Entity {
    constructor(id, x, y, w, h) { super(x, y, w, h, 'door'); this.id=id; this.isOpen=true; }
    render(ctx) {
        this.isOpen = !state.alarmState;
        if (!this.isOpen) {
            if (state.assets.door) drawTiled(ctx, state.assets.door, this.x, this.y, this.w, this.h, 40);
            else super.render(ctx);
            ctx.fillStyle='rgba(255,0,0,0.28)'; ctx.fillRect(this.x, this.y, this.w, this.h);
        }
        else { ctx.fillStyle='rgba(255,60,0,0.1)'; ctx.fillRect(this.x, this.y, this.w, this.h); }
    }
}

export class TimerDoor extends Entity {
    constructor(id, x, y, w, h, openT, closedT) { super(x, y, w, h, 'door'); this.id=id; this.openT=openT; this.closedT=closedT; this.isOpen=false; }
    render(ctx) {
        let cycle = state.currentTick % (this.openT + this.closedT);
        if (cycle === this.openT) SFX.door();
        this.isOpen = cycle < this.openT;
        if (!this.isOpen) {
            if (state.assets.door) drawTiled(ctx, state.assets.door, this.x, this.y, this.w, this.h, 40);
            else super.render(ctx);
            ctx.fillStyle='rgba(255,100,0,0.28)'; ctx.fillRect(this.x,this.y,this.w,this.h);
        }
        else { ctx.fillStyle='rgba(255,100,0,0.1)'; ctx.fillRect(this.x,this.y,this.w,this.h); }
    }
}
