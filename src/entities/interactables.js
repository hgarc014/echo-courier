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
        this.wasPickedUp=false; this.countdown=300; this.tossTicks=0; this.tossMax=0; this.vx=0; this.vy=0;
        this.requiredForDelivery = requiredForDelivery;
        this.feelTtl = 0;
        this.feelKind = null;
        this.breakFx = null;
    }
    reset() {
        this.x=this.startX; this.y=this.startY; this.carriedBy=null; this.isDestroyed=false;
        this.wasPickedUp=false; this.countdown=300; this.tossTicks=0; this.tossMax=0; this.vx=0; this.vy=0;
        this.feelTtl = 0; this.feelKind = null; this.breakFx = null;
    }
    onPickup() {
        this.feelTtl = 14;
        this.feelKind = 'pickup';
        this.tossTicks = 0;
        this.tossMax = 0;
    }
    onDrop() {
        this.feelTtl = 12;
        this.feelKind = 'drop';
        this.vx = 0;
        this.vy = 0;
        this.tossTicks = 0;
        this.tossMax = 0;
    }
    onToss(dirX, dirY) {
        const dx = dirX || 0;
        const dy = dirY || 0;
        const mag = Math.hypot(dx, dy) || 1;
        this.vx = (dx / mag) * 11;
        this.vy = (dy / mag) * 11;
        this.tossTicks = 18;
        this.tossMax = 18;
        this.feelTtl = 0;
        this.feelKind = null;
    }
    breakApart(kind = 'shatter') {
        if (this.breakFx) {
            this.isDestroyed = true;
            return;
        }
        this.isDestroyed = true;
        this.carriedBy = null;
        this.tossTicks = 0;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const shards = [];
        const n = kind === 'vapor' ? 10 : 8;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.35;
            const speed = kind === 'boom' ? (3.2 + Math.random() * 3.5) : (1.8 + Math.random() * 2.8);
            shards.push({
                x: cx, y: cy,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed - (kind === 'vapor' ? 1.2 : 0.4),
                life: kind === 'vapor' ? 22 + Math.random() * 10 : 18 + Math.random() * 14,
                size: kind === 'vapor' ? 2 + Math.random() * 2.5 : 2.5 + Math.random() * 3.5,
                rot: Math.random() * Math.PI
            });
        }
        this.breakFx = { ttl: kind === 'boom' ? 36 : 28, max: kind === 'boom' ? 36 : 28, kind, shards, cx, cy };
    }
    update() {
        if (this.breakFx) {
            this.breakFx.ttl--;
            for (const s of this.breakFx.shards) {
                if (s.life <= 0) continue;
                s.x += s.vx;
                s.y += s.vy;
                if (this.breakFx.kind === 'vapor') {
                    s.vx *= 0.92;
                    s.vy *= 0.92;
                } else {
                    s.vy += 0.18;
                    s.vx *= 0.99;
                }
                s.life--;
                s.rot += 0.22;
            }
            if (this.breakFx.ttl <= 0) this.breakFx = null;
        }
        if (this.isDestroyed) return null;
        if (this.feelTtl > 0) this.feelTtl--;
        if (this.carriedBy) this.wasPickedUp = true;
        const wasTossing = this.tossTicks > 0 && !this.carriedBy;
        if (wasTossing) {
            this.x += this.vx; this.y += this.vy; this.tossTicks--;
            for(let wall of state.walls) if (AABB(this.x, this.y, this.w, this.h, wall.x, wall.y, wall.w, wall.h)) { this.x-=this.vx; this.y-=this.vy; this.tossTicks=0; break; }
            for(let door of state.doors) if (!door.isOpen && AABB(this.x, this.y, this.w, this.h, door.x, door.y, door.w, door.h)) { this.x-=this.vx; this.y-=this.vy; this.tossTicks=0; break; }
            if (this.tossTicks <= 0) {
                this.feelTtl = 12;
                this.feelKind = 'land';
                this.vx = 0;
                this.vy = 0;
            }
        }
        if (this.type === 'timed' && this.wasPickedUp && !AABB(state.deliveryZone.x, state.deliveryZone.y, state.deliveryZone.w, state.deliveryZone.h, this.x, this.y, this.w, this.h)) {
            this.countdown--;
            if (this.countdown <= 0) {
                this.breakApart('boom');
                return "Timed Package Exploded!";
            }
        }
        return null;
    }
    _drawBreakFx(ctx) {
        const fx = this.breakFx;
        if (!fx || fx.ttl <= 0) return;
        const life = fx.ttl / fx.max;
        if (fx.kind === 'vapor') {
            ctx.save();
            ctx.globalAlpha = 0.55 * life;
            const grd = ctx.createRadialGradient(fx.cx, fx.cy, 2, fx.cx, fx.cy, 18 + (1 - life) * 28);
            grd.addColorStop(0, 'rgba(180,255,255,0.95)');
            grd.addColorStop(0.45, 'rgba(0,243,255,0.55)');
            grd.addColorStop(1, 'rgba(0,80,120,0)');
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(fx.cx, fx.cy, 18 + (1 - life) * 28, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (fx.kind === 'boom') {
            ctx.save();
            ctx.globalAlpha = 0.7 * life;
            ctx.strokeStyle = `rgba(255,${Math.floor(80 + 100 * life)},40,${0.85 * life})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(fx.cx, fx.cy, 10 + (1 - life) * 36, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        for (const s of fx.shards) {
            if (s.life <= 0) continue;
            const a = Math.max(0, Math.min(1, s.life / 24));
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(s.rot);
            ctx.globalAlpha = a;
            if (fx.kind === 'vapor') {
                ctx.fillStyle = `rgba(120,255,255,${0.85 * a})`;
                ctx.fillRect(-s.size * 0.4, -s.size * 1.4, s.size * 0.8, s.size * 2.8);
            } else {
                ctx.fillStyle = fx.kind === 'boom' ? `rgba(255,140,40,${0.9 * a})` : `rgba(255,120,120,${0.95 * a})`;
                ctx.fillRect(-s.size / 2, -s.size / 2, s.size, s.size * 0.7);
            }
            ctx.restore();
        }
    }
    render(ctx) {
        this._drawBreakFx(ctx);
        if (this.isDestroyed) return;
        const t = state.currentTick;
        const carried = !!this.carriedBy;
        const tossing = this.tossTicks > 0 && !carried;
        const idSeed = typeof this.id === 'number' ? this.id : [...String(this.id)].reduce((n, ch) => n + ch.charCodeAt(0), 0);
        let bob = carried ? 0 : Math.sin(t * 0.15 + idSeed * 0.17) * 1.6;
        let rotation = 0;
        let scaleX = carried ? 0.86 : 1;
        let scaleY = carried ? 0.86 : 1;
        let drawY = carried ? this.y - 12 : this.y;
        let alpha = this.type === 'decoy' ? 0.85 : 1;

        if (tossing && this.tossMax > 0) {
            const progress = 1 - this.tossTicks / this.tossMax;
            const arc = Math.sin(progress * Math.PI) * 28;
            drawY -= arc;
            bob = 0;
            rotation = progress * Math.PI * 2.4;
            scaleX = 1.12;
            scaleY = 0.92;
            // motion streak under the crate
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = '#ffe08a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.x + this.w / 2 - this.vx * 1.4, this.y + this.h / 2 - this.vy * 1.4 + 4);
            ctx.lineTo(this.x + this.w / 2, drawY + this.h / 2);
            ctx.stroke();
            ctx.restore();
        }

        if (this.feelTtl > 0 && this.feelKind) {
            if (this.feelKind === 'pickup') {
                const u = 1 - this.feelTtl / 14;
                const wave = Math.sin(u * Math.PI);
                scaleX *= 1 + wave * 0.14;
                scaleY *= 1 - wave * 0.2;
                drawY -= Math.min(14, u * 18);
                bob = 0;
            } else if (this.feelKind === 'drop' || this.feelKind === 'land') {
                const u = 1 - this.feelTtl / 12;
                const wave = Math.sin(Math.min(1, u * 1.4) * Math.PI);
                scaleX *= 1 + wave * 0.22;
                scaleY *= 1 - wave * 0.28;
                bob = 0;
            }
        }

        let img = state.assets.package;
        let tint = null;
        let tintAlpha = 0;
        if (this.type === 'heavy') { img = state.assets.heavy || img; tint = '#ffd27a'; tintAlpha = 0.16; }
        else if (this.type === 'fragile') { img = state.assets.fragile || img; tint = '#ff6b6b'; tintAlpha = 0.14; }
        else if (this.type === 'contraband') { tint = '#b14bff'; tintAlpha = 0.28; }
        else if (this.type === 'decoy') { tint = '#00f3ff'; tintAlpha = 0.22; }
        else if (this.type === 'timed') { tint = '#ff3333'; tintAlpha = 0.2; }

        if (this.type === 'timed' && this.wasPickedUp) {
            const urgency = Math.max(0, Math.min(1, 1 - this.countdown / 300));
            const pulseRate = 0.18 + urgency * 0.85;
            const pulse = 0.82 + 0.18 * Math.abs(Math.sin(t * pulseRate));
            scaleX *= pulse;
            scaleY *= pulse;
            tint = urgency > 0.55 ? '#ff2200' : '#ff5533';
            tintAlpha = 0.22 + urgency * 0.5;
            alpha = 0.88 + 0.12 * pulse;
            if (this.countdown < 90) {
                ctx.save();
                ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(t * 0.55));
                ctx.strokeStyle = '#ff3333';
                ctx.lineWidth = 2;
                const r = 16 + (90 - this.countdown) * 0.15 + Math.sin(t * 0.4) * 2;
                ctx.beginPath();
                ctx.arc(this.x + this.w / 2, drawY + this.h / 2, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }

        if (this.type === 'heavy' && !tossing) {
            tint = '#c9893a';
            tintAlpha = Math.max(tintAlpha, 0.22);
        }

        // boss ammo (not required) gets a distinct copper rim so L13 can't confuse it with the artifact
        if (this.requiredForDelivery === false) {
            tint = tint || '#d4a017';
            tintAlpha = Math.max(tintAlpha, 0.32);
        }

        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(this.x + 4, this.y + this.h - 6, this.w - 8, 5);

        const drawn = img && drawSprite(ctx, img, this.x, drawY, this.w, this.h, {
            valign: 'bottom', bob, rotation, scaleX, scaleY, tint, tintAlpha, alpha
        });
        if (!drawn) {
            ctx.fillStyle = tint || '#c9a227';
            ctx.fillRect(this.x, drawY, this.w, this.h);
        }
        if (this.type === 'contraband') { ctx.strokeStyle='red'; ctx.lineWidth=2; ctx.strokeRect(this.x, drawY, this.w, this.h); }
        if (this.requiredForDelivery === false) {
            ctx.strokeStyle = 'rgba(212,160,23,0.9)';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x + 1, drawY + 1, this.w - 2, this.h - 2);
        }
        if (this.type === 'timed') {
            const urgent = this.wasPickedUp && this.countdown < 90;
            ctx.fillStyle = urgent ? '#ffeeee' : '#fff';
            ctx.font = urgent ? 'bold 11px Space Grotesk, sans-serif' : '10px Space Grotesk, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(String(Math.ceil(this.countdown / 60)), this.x + this.w / 2, drawY + 18);
            ctx.textAlign = 'start';
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
