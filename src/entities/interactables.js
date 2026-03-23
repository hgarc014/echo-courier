import { state } from '../core/state.js';
import { Entity } from './base.js';
import { AABB } from '../core/physics.js';
import { SFX } from '../core/audio.js';

export class Wall extends Entity {
    constructor(x, y, w, h) { super(x, y, w, h, 'wall'); }
    render(ctx) {
        if (state.assets.wall) {
            ctx.save(); ctx.beginPath(); ctx.rect(this.x, this.y, this.w, this.h); ctx.clip();
            for(let i=0; i<this.w; i+=40) for(let j=0; j<this.h; j+=40) ctx.drawImage(state.assets.wall, this.x+i, this.y+j, 40, 40);
            ctx.restore();
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
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(this.x+2, this.y+4, this.w, this.h);
        if (this.type === 'contraband') { ctx.fillStyle='purple'; ctx.fillRect(this.x, this.y, this.w, this.h); ctx.strokeStyle='red'; ctx.lineWidth=3; ctx.strokeRect(this.x, this.y, this.w, this.h); }
        else if (this.type === 'decoy') { ctx.globalAlpha=0.5; ctx.fillStyle='#00f3ff'; ctx.fillRect(this.x, this.y, this.w, this.h); ctx.globalAlpha=1.0; }
        else if (this.type === 'heavy') {
            ctx.fillStyle='#a26a2d'; ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.strokeStyle='#ffd27a'; ctx.lineWidth=2; ctx.strokeRect(this.x, this.y, this.w, this.h);
            ctx.fillStyle='#3a2410'; ctx.fillRect(this.x+6, this.y+6, this.w-12, this.h-12);
        }
        else if (this.type === 'timed') { ctx.fillStyle='#ff0000'; ctx.fillRect(this.x, this.y, this.w, this.h); ctx.fillStyle='#fff'; ctx.font='10px Arial'; ctx.fillText(Math.ceil(this.countdown/60), this.x+8, this.y+20); }
        else super.render(ctx);
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
        ctx.globalAlpha = this.isPressed ? 1.0 : 0.5; super.render(ctx); ctx.globalAlpha = 1.0;
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
        
        ctx.globalAlpha = this.isPressed ? 1.0 : 0.3;
        if (state.assets.plate) ctx.drawImage(state.assets.plate, this.x, this.y, this.w, this.h);
        ctx.globalAlpha = 1.0;
        if (this.isPressed) { ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.strokeRect(this.x, this.y, this.w, this.h); }
    }
}

export class Door extends Entity {
    constructor(id, x, y, w, h) { super(x, y, w, h, 'door'); this.id=id; this.isOpen=false; }
    render(ctx) { if (!this.isOpen) super.render(ctx); else { ctx.fillStyle='rgba(255,60,0,0.1)'; ctx.fillRect(this.x, this.y, this.w, this.h); } }
}

export class AlarmDoor extends Entity {
    constructor(id, x, y, w, h) { super(x, y, w, h, 'door'); this.id=id; this.isOpen=true; }
    render(ctx) {
        this.isOpen = !state.alarmState;
        if (!this.isOpen) { super.render(ctx); ctx.fillStyle='rgba(255,0,0,0.4)'; ctx.fillRect(this.x, this.y, this.w, this.h); }
        else { ctx.fillStyle='rgba(255,60,0,0.1)'; ctx.fillRect(this.x, this.y, this.w, this.h); }
    }
}

export class TimerDoor extends Entity {
    constructor(id, x, y, w, h, openT, closedT) { super(x, y, w, h, 'door'); this.id=id; this.openT=openT; this.closedT=closedT; this.isOpen=false; }
    render(ctx) {
        let cycle = state.currentTick % (this.openT + this.closedT);
        if (cycle === this.openT) SFX.door();
        this.isOpen = cycle < this.openT;
        if (!this.isOpen) { super.render(ctx); ctx.fillStyle='rgba(255,100,0,0.4)'; ctx.fillRect(this.x,this.y,this.w,this.h); }
        else { ctx.fillStyle='rgba(255,100,0,0.1)'; ctx.fillRect(this.x,this.y,this.w,this.h); }
    }
}
