import { state } from '../core/state.js';
import { Entity } from './base.js';
import { AABB, checkWallCollision, lineOfSightBlocked } from '../core/physics.js';
import { SFX } from '../core/audio.js';

function isPresentPlayer(actor) {
    return actor && actor.id === undefined && actor.assetName === 'player';
}

export class Laser extends Entity {
    constructor(id, x, y, w, h) { super(x, y, w, h, 'laser'); this.id=id; this.isOpen=false; }
    render(ctx) {
        if (!this.isOpen) {
            if (state.assets.laser) {
                ctx.save(); ctx.beginPath(); ctx.rect(this.x, this.y, this.w, this.h); ctx.clip();
                for(let i=0; i<this.h; i+=40) ctx.drawImage(state.assets.laser, this.x+(this.w/2 - 20), this.y+i, 40, 40);
                for(let i=0; i<this.w; i+=40) ctx.drawImage(state.assets.laser, this.x+i, this.y+(this.h/2 - 20), 40, 40);
                ctx.restore();
            } else { ctx.fillStyle='rgba(255,0,0,0.5)'; ctx.fillRect(this.x, this.y, this.w, this.h); }
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
        super.render(ctx); ctx.fillStyle = state.alarmState?'rgba(255, 0, 0, 0.3)':'rgba(0, 243, 255, 0.2)';
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

export class ShooterRobot extends Entity {
    constructor(path) {
        super(path[0].x, path[0].y, 35, 35, 'robot');
        this.path = path; this.pathIndex = 0; this.speed = 1.5;
        this.fireCooldown = 0; this.facingAngle = 0;
        this.hp = 3; this.hitFlicker = 0;
        this.engaged = true;
        this.isEmerging = false;
        this.emergeUntilPathIndex = 0;
    }
    update(player, activeGhosts, walls) {
        if (this.hp <= 0) return;
        if (!this.engaged && !this.isEmerging) return;
        if (this.hitFlicker > 0) { this.hitFlicker--; return; } // Stun

        const moveAlongPath = () => {
            if (this.path.length <= 1) return;
            let curSpeed = this.hp === 2 ? 3.0 : 2.0;
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
                this.fireCooldown = Math.max(this.fireCooldown, 45);
            }
            return;
        }
        
        let targets = [];
        if (player.cloakTimer <= 0) targets.push(player);
        activeGhosts.filter(g=>g.isActive && !g.cloakActive).forEach(g=>targets.push(g));
        let bestTarget = null; let bestDist = Infinity;
        for (let t of targets) {
            let dx = t.x - this.x; let dy = t.y - this.y; let dist = Math.hypot(dx, dy);
            if (dist < 400 && !lineOfSightBlocked(this.x+17, this.y+17, t.x+15, t.y+15)) {
                if (dist < bestDist) { bestDist = dist; bestTarget = t; }
            }
        }
        
        if (this.hp === 1 && bestTarget) {
            // Unhinged Chase Mode
            let dx = bestTarget.x - this.x; let dy = bestTarget.y - this.y; let dist = Math.hypot(dx, dy);
            if (dist > 50) { this.x += (dx/dist)*2.0; this.y += (dy/dist)*2.0; }
            this.facingAngle = Math.atan2(dy, dx);
        } else if (this.path.length > 1) {
            // Speed up slightly in Phase 2
            moveAlongPath();
            if (bestTarget) { this.facingAngle = Math.atan2(bestTarget.y + 15 - (this.y+17), bestTarget.x + 15 - (this.x+17)); }
        }

        if (this.fireCooldown > 0) this.fireCooldown--;
        
        if (bestTarget && this.fireCooldown <= 0) {
            let a = this.facingAngle;
            SFX.robotShoot();
            state.projectiles.push(new LaserProjectile(this.x+17, this.y+17, Math.cos(a)*8, Math.sin(a)*8));
            
            // Phase 2 or Phase 3 Multishot
            if (this.hp <= 2) {
                let spread = 0.4;
                state.projectiles.push(new LaserProjectile(this.x+17, this.y+17, Math.cos(a+spread)*8, Math.sin(a+spread)*8));
                state.projectiles.push(new LaserProjectile(this.x+17, this.y+17, Math.cos(a-spread)*8, Math.sin(a-spread)*8));
            }
            this.fireCooldown = this.hp === 3 ? 60 : (this.hp === 2 ? 45 : 30); 
        }
    }
    render(ctx) {
        if (this.hp <= 0) return;
        if (this.hitFlicker > 0 && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.fillStyle = 'red'; ctx.fillRect(this.x-5, this.y-5, this.w+10, this.h+10); return;
        }
        ctx.save(); ctx.translate(this.x + this.w/2, this.y + this.h/2); ctx.rotate(this.facingAngle);
        ctx.fillStyle = '#222'; ctx.fillRect(-15, -18, 30, 8); ctx.fillRect(-15, 10, 30, 8);
        ctx.strokeStyle = '#444'; ctx.strokeRect(-15, -18, 30, 8); ctx.strokeRect(-15, 10, 30, 8);
        ctx.fillStyle = '#555'; ctx.fillRect(-10, -10, 20, 20);
        ctx.fillStyle = this.hp === 1 ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 243, 255, 0.4)'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = this.hp === 1 ? '#ff0000' : '#00f3ff'; ctx.lineWidth=2; ctx.stroke();
        ctx.strokeStyle = '#888'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(15, -20); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(15, 20); ctx.stroke();
        ctx.fillStyle = '#ff0044'; ctx.beginPath(); ctx.arc(15, -20, 4, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(15, 20, 4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = (this.fireCooldown < 20 && this.fireCooldown > 0) ? '#fff' : '#ff0044';
        ctx.beginPath(); ctx.arc(8, 0, 3, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        
        ctx.fillStyle = '#f00'; ctx.fillRect(this.x, this.y - 12, this.w, 5);
        ctx.fillStyle = '#0f0'; ctx.fillRect(this.x, this.y - 12, (this.hp/3)*this.w, 5);
    }
}

export class Drone extends Entity {
    constructor(points) {
        super(points[0].x, points[0].y, 30, 30, 'drone');
        this.points=points; this.targetIndex=1; this.speed=2.5; this.state='patrol'; this.investTarget=null; this.investTimer=0; this.startX=this.x; this.startY=this.y;
    }
    reset() { this.x=this.startX; this.y=this.startY; this.targetIndex=1; this.state='patrol'; this.investTimer=0; }
    update(player, noiseSources) {
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
        ctx.fillStyle = this.state==='investigate'?'#ff00aa':'#ffffff';
        ctx.beginPath(); ctx.arc(this.x+15, this.y+15, 15, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle='#00f3ff'; ctx.beginPath(); ctx.arc(this.x+15, this.y+15, 5, 0, Math.PI*2); ctx.fill();
    }
}

export class Guard extends Entity {
    constructor(points) {
        super(points[0].x, points[0].y, 30, 30, 'guard');
        this.points=points; this.targetIndex=1; this.speed=1.5; this.state='patrol'; this.facingX=0; this.facingY=1; this.startX=this.x; this.startY=this.y;
    }
    reset() { this.x=this.startX; this.y=this.startY; this.targetIndex=1; this.state='patrol'; this.facingX=0; this.facingY=1; }
    update(player, ghosts) {
        let vx=this.x,vy=this.y,vw=30,vh=30;
        if(this.facingX===1){vx+=30;vw=150;} else if(this.facingX===-1){vx-=150;vw=150;}
        if(this.facingY===1){vy+=30;vh=150;} else if(this.facingY===-1){vy-=150;vh=150;}
        
        this.state = 'patrol';
        for (let g of ghosts) {
            if (AABB(vx, vy, vw, vh, g.x, g.y, g.w, g.h)) {
                this.state='distracted';
                if (Math.abs(g.x-this.x)>Math.abs(g.y-this.y)){this.facingX=g.x>this.x?1:-1;this.facingY=0;}else{this.facingY=g.y>this.y?1:-1;this.facingX=0;}
                break;
            }
        }
        if (AABB(vx, vy, vw, vh, player.x, player.y, player.w, player.h)) return "Spotted by Guard!";
        if (this.state==='patrol') {
            let target=this.points[this.targetIndex]; let dx=target.x-this.x, dy=target.y-this.y; let dist=Math.hypot(dx,dy);
            if (dist<this.speed) { this.x=target.x; this.y=target.y; this.targetIndex=(this.targetIndex+1)%this.points.length; }
            else { this.x+=(dx/dist)*this.speed; this.y+=(dy/dist)*this.speed;
                   if (Math.abs(dx)>Math.abs(dy)){this.facingX=dx>0?1:-1;this.facingY=0;}else{this.facingY=dy>0?1:-1;this.facingX=0;} }
        }
        return null;
    }
    render(ctx) {
        super.render(ctx); ctx.fillStyle = this.state==='distracted'?'rgba(255,255,0,0.2)':'rgba(255,0,0,0.2)';
        let vx=this.x,vy=this.y,vw=30,vh=30;
        if(this.facingX===1){vx+=30;vw=150;}else if(this.facingX===-1){vx-=150;vw=150;}
        if(this.facingY===1){vy+=30;vh=150;}else if(this.facingY===-1){vy-=150;vh=150;}
        ctx.fillRect(vx,vy,vw,vh);
    }
}

export class WindTunnel extends Entity {
    constructor(x, y, w, h, dx, dy) { super(x, y, w, h, 'wind'); this.vx = dx; this.vy = dy; }
    render(ctx) { 
        ctx.fillStyle='rgba(200,200,255,0.15)'; ctx.fillRect(this.x,this.y,this.w,this.h); 
        
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
    render(ctx) { ctx.fillStyle='rgba(150,0,255,0.2)'; ctx.fillRect(this.x,this.y,this.w,this.h); }
}

export class Pit extends Entity {
    constructor(x, y, w, h) { super(x, y, w, h, 'pit'); }
    update(actors) {
        for(let a of actors) {
            if (!AABB(a.x,a.y,a.w,a.h, this.x,this.y,this.w,this.h)) continue;
            if (isPresentPlayer(a)) return "Fell into pit!";
            if (a.id !== undefined) a.isActive = false;
        }
        return null;
    }
    render(ctx) {
        ctx.fillStyle='#000'; ctx.fillRect(this.x,this.y,this.w,this.h);
        ctx.strokeStyle='#111'; ctx.strokeRect(this.x,this.y,this.w,this.h);
    }
}

export class CrackedFloor extends Entity {
    constructor(x, y, w, h) { super(x, y, w, h, 'crack'); this.ticks=0; this.broken=false; }
    update(actors) {
        if (this.broken) {
            for(let a of actors) {
                if (!AABB(a.x,a.y,a.w,a.h, this.x,this.y,this.w,this.h)) continue;
                if (isPresentPlayer(a)) return "Fell into pit!";
                if (a.id !== undefined) a.isActive = false;
            }
            return null;
        }
        let touched=false;
        for(let a of actors) if (AABB(a.x,a.y,a.w,a.h, this.x,this.y,this.w,this.h)) touched=true;
        if (touched) this.ticks++;
        if (this.ticks>60) this.broken=true;
        return null;
    }
    render(ctx) {
        if (this.broken) { ctx.fillStyle='#000'; ctx.fillRect(this.x,this.y,this.w,this.h); }
        else { ctx.fillStyle=`rgba(150,100,50,${1 - this.ticks/100})`; ctx.fillRect(this.x,this.y,this.w,this.h); }
    }
}
