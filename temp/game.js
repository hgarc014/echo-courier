const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const uiTitleScreen = document.getElementById('title-screen');
const uiAppLayout = document.getElementById('app-layout');
const uiLevelComplete = document.getElementById('level-complete');
const uiGameOver = document.getElementById('game-over');
const loopCountUI = document.getElementById('loop-count');
const levelDisplayUI = document.getElementById('level-display');
const objectiveTextUI = document.getElementById('objective-text');
const uiLevelGrid = document.getElementById('level-select-grid');
const devModeCheckbox = document.getElementById('dev-mode-checkbox');
document.getElementById('reset-save-btn').addEventListener('click', () => {
    if (confirm("Are you sure you want to permanently erase all Phase unlocks, Credits, and Ranks?")) {
        localStorage.clear(); location.reload();
    }
});

let maxUnlockedLevel = parseInt(localStorage.getItem('echoCourier_maxLevel') || '0');
let playerColor = localStorage.getItem('echoCourier_suit') || '#ff7b00';
let challengesCompleted = JSON.parse(localStorage.getItem('echoCourier_challenges') || '{}');
let abilitiesPurchased = JSON.parse(localStorage.getItem('echoCourier_abilities') || '{}');
let runStats = { tosses: 0, dashes: 0, cloaks: 0, alarms: 0 };

function getCredits() {
    let earned = (maxUnlockedLevel * 100) + (Object.keys(challengesCompleted).length * 200);
    let spent = (abilitiesPurchased['dash'] ? 300 : 0) + (abilitiesPurchased['toss'] ? 300 : 0) + (abilitiesPurchased['cloak'] ? 400 : 0);
    return earned - spent;
}

function getPlayerRank() {
    if (devModeCheckbox.checked) return 4;
    if (maxUnlockedLevel >= 11) return 4;
    if (maxUnlockedLevel >= 9) return 3;
    if (maxUnlockedLevel >= 6) return 2;
    if (maxUnlockedLevel >= 3) return 1;
    return 0;
}

const FPS = 60;
const TICK_RATE = 1000 / FPS;

const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();
const masterGain = audioCtx.createGain(); masterGain.gain.value = 0.3; masterGain.connect(audioCtx.destination);
function playTone(freq, type, duration, vol=0.5, slideFreq=null) {
    if (audioCtx.state === 'suspended') return;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (slideFreq) osc.frequency.exponentialRampToValueAtTime(slideFreq, audioCtx.currentTime + duration);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain); gain.connect(masterGain); osc.start(); osc.stop(audioCtx.currentTime + duration);
}
const SFX = {
    interact: () => playTone(600, 'sine', 0.1, 0.3, 800),
    toss: () => playTone(300, 'triangle', 0.2, 0.4, 100),
    dash: () => playTone(800, 'square', 0.15, 0.3, 200),
    cloak: () => playTone(200, 'sine', 0.5, 0.4, 100),
    laserHit: () => playTone(150, 'sawtooth', 0.4, 0.5, 50),
    alarm: () => { playTone(800, 'square', 0.3, 0.2); setTimeout(()=>playTone(600, 'square', 0.3, 0.2), 300); },
    robotShoot: () => playTone(900, 'sawtooth', 0.2, 0.3, 400),
    fail: () => playTone(200, 'sawtooth', 1.0, 0.4, 50),
    win: () => { playTone(400, 'sine', 0.2, 0.3); setTimeout(()=>playTone(500, 'sine', 0.2, 0.3), 200); setTimeout(()=>playTone(600, 'sine', 0.4, 0.3), 400); },
    door: () => playTone(100, 'square', 0.1, 0.2, 50)
};
let nextNoteTime = 0; let musicBeat = 0; let isMusicPlaying = false;
function scheduleMusic() {
    if (!isMusicPlaying) return;
    while (nextNoteTime < audioCtx.currentTime + 0.1) {
        let song = 0;
        if (currentLevelIndex <= 3) song = 0;
        else if (currentLevelIndex <= 6) song = 1;
        else if (currentLevelIndex <= 8) song = 2;
        else if (currentLevelIndex <= 11) song = 3;
        else song = 4;

        if (alarmState) {
            if (musicBeat % 2 === 0) playTone(130, 'sawtooth', 0.2, 0.2);
            playTone([523.25, 622.25, 783.99, 932.33][musicBeat % 4], 'square', 0.1, 0.08);
            nextNoteTime += 0.15; musicBeat++;
            continue;
        }

        if (song === 0) {
            if (musicBeat % 8 === 0) playTone(65.41, 'sawtooth', 0.3, 0.15);
            else if (musicBeat % 4 === 0) playTone(130.81, 'square', 0.1, 0.05);
            let arp = [261.63, 311.13, 392.00, 466.16]; 
            if (musicBeat % 2 !== 0) playTone(arp[Math.floor(musicBeat/2) % 4] * 1.5, 'sine', 0.1, 0.05);
            nextNoteTime += 0.25;
        } 
        else if (song === 1) {
            if (musicBeat % 16 === 0) playTone(41.20, 'sawtooth', 0.6, 0.2); 
            if (musicBeat % 8 === 4) playTone(82.41, 'square', 0.2, 0.1); 
            let arp = [164.81, 196.00, 246.94, 293.66]; 
            if (musicBeat % 3 === 0) playTone(arp[musicBeat % 4], 'triangle', 0.2, 0.08);
            nextNoteTime += 0.3;
        }
        else if (song === 2) {
            if (musicBeat % 4 === 0 || musicBeat % 4 === 3) playTone(55.00, 'sawtooth', 0.15, 0.15); 
            let arp = [220.00, 261.63, 329.63, 440.00]; 
            playTone(arp[musicBeat % 4], 'square', 0.1, 0.05);
            nextNoteTime += 0.2;
        }
        else if (song === 3) {
            if (musicBeat % 32 === 0) playTone(49.00, 'sine', 2.0, 0.3); 
            let arp = [196.00, 293.66, 349.23, 440.00]; 
            if (musicBeat % 8 === 0) playTone(arp[Math.floor(musicBeat/8) % 4], 'sine', 1.0, 0.1);
            if (musicBeat % 4 === 0) playTone(arp[Math.floor(musicBeat/4) % 4]*2, 'triangle', 0.2, 0.05);
            nextNoteTime += 0.25;
        }
        else if (song === 4) {
            if (musicBeat % 8 === 0) playTone(36.71, 'sawtooth', 0.5, 0.25); 
            if (musicBeat % 8 === 4) playTone(38.89, 'sawtooth', 0.5, 0.25); 
            if (musicBeat % 2 === 0) playTone([146.83, 155.56][Math.floor(musicBeat/2)%2], 'square', 0.1, 0.1);
            nextNoteTime += 0.2;
        }
        musicBeat++;
    }
}
function startMusic() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!isMusicPlaying) { isMusicPlaying = true; nextNoteTime = audioCtx.currentTime + 0.1; }
}

const assets = {};
const assetNames = ['player', 'package', 'plate', 'door', 'wall', 'zone', 'guard', 'laser', 'camera'];
let assetsLoaded = 0;

assetNames.forEach(name => {
    const img = new Image(); img.src = `assets/${name}.png`;
    img.onload = () => { assetsLoaded++; }; assets[name] = img;
});

const keys = { w: false, a: false, s: false, d: false, space: false, r: false, shift: false, f: false, c: false, esc: false };
const prevKeys = { ...keys };

window.addEventListener('keydown', e => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': keys.w = true; break;
        case 'KeyA': case 'ArrowLeft': keys.a = true; break;
        case 'KeyS': case 'ArrowDown': keys.s = true; break;
        case 'KeyD': case 'ArrowRight': keys.d = true; break;
        case 'Space': keys.space = true; break;
        case 'KeyR': keys.r = true; break;
        case 'ShiftLeft': case 'ShiftRight': keys.shift = true; break;
        case 'KeyF': keys.f = true; break;
        case 'KeyC': keys.c = true; break;
        case 'Escape': keys.esc = true; break;
    }
});
window.addEventListener('keyup', e => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': keys.w = false; break;
        case 'KeyA': case 'ArrowLeft': keys.a = false; break;
        case 'KeyS': case 'ArrowDown': keys.s = false; break;
        case 'KeyD': case 'ArrowRight': keys.d = false; break;
        case 'Space': keys.space = false; break;
        case 'KeyR': keys.r = false; break;
        case 'ShiftLeft': case 'ShiftRight': keys.shift = false; break;
        case 'KeyF': keys.f = false; break;
        case 'KeyC': keys.c = false; break;
        case 'Escape': keys.esc = false; break;
    }
});
function isKeyJustPressed(key) { return keys[key] && !prevKeys[key]; }

let pastRuns = [];
let currentRun = [];
let currentTick = 0;
let activeGhosts = [];
let gameState = 'MENU';
let currentLevelIndex = 0;
let failTimer = 0; let failMessage = ""; let alarmState = false;

let walls=[], doors=[], plates=[], packages=[], lasers=[], guards=[], cameras=[], drones=[], winds=[], statics=[], cracks=[], deliveryZone=null, player=null;

function AABB(x1,y1,w1,h1,x2,y2,w2,h2) { return x1<x2+w2 && x1+w1>x2 && y1<y2+h2 && y1+h1>y2; }

class Entity {
    constructor(x, y, w, h, assetName) { this.x=x; this.y=y; this.w=w; this.h=h; this.assetName=assetName; }
    render(ctx) {
        if (assets[this.assetName]) ctx.drawImage(assets[this.assetName], this.x, this.y, this.w, this.h);
        else { ctx.fillStyle = '#ff00ea'; ctx.fillRect(this.x, this.y, this.w, this.h); }
    }
}

class PlayerEntity extends Entity {
    constructor(x, y, w, h) { super(x, y, w, h, 'player'); }
    render(ctx) {
        ctx.save();
        if (assets[this.assetName]) {
            ctx.drawImage(assets[this.assetName], this.x, this.y, this.w, this.h);
            ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = playerColor; ctx.globalAlpha = 0.5; ctx.fillRect(this.x, this.y, this.w, this.h);
        } else { ctx.fillStyle = playerColor; ctx.fillRect(this.x, this.y, this.w, this.h); }
        ctx.restore();
    }
}

class Wall extends Entity {
    constructor(x, y, w, h) { super(x, y, w, h, 'wall'); }
    render(ctx) {
        if (assets.wall) {
            ctx.save(); ctx.beginPath(); ctx.rect(this.x, this.y, this.w, this.h); ctx.clip();
            for(let i=0; i<this.w; i+=40) for(let j=0; j<this.h; j+=40) ctx.drawImage(assets.wall, this.x+i, this.y+j, 40, 40);
            ctx.restore();
            ctx.strokeStyle = '#00f3ff'; ctx.lineWidth=1; ctx.strokeRect(this.x, this.y, this.w, this.h);
        }
    }
}

class Package extends Entity {
    constructor(id, x, y, type = 'standard') {
        super(x, y, 30, 30, 'package');
        this.id=id; this.type=type; this.startX=x; this.startY=y; this.carriedBy=null; this.isDestroyed=false;
        this.wasPickedUp=false; this.countdown=300; this.tossTicks=0; this.vx=0; this.vy=0;
    }
    reset() { this.x=this.startX; this.y=this.startY; this.carriedBy=null; this.isDestroyed=false; this.wasPickedUp=false; this.countdown=300; this.tossTicks=0; }
    update() {
        if (this.isDestroyed) return null;
        if (this.carriedBy) this.wasPickedUp = true;
        if (this.tossTicks > 0 && !this.carriedBy) {
            this.x += this.vx; this.y += this.vy; this.tossTicks--;
            for(let wall of walls) if (AABB(this.x, this.y, this.w, this.h, wall.x, wall.y, wall.w, wall.h)) { this.x-=this.vx; this.y-=this.vy; this.tossTicks=0; break; }
            for(let door of doors) if (!door.isOpen && AABB(this.x, this.y, this.w, this.h, door.x, door.y, door.w, door.h)) { this.x-=this.vx; this.y-=this.vy; this.tossTicks=0; break; }
        }
        if (this.type === 'timed' && this.wasPickedUp && !AABB(deliveryZone.x, deliveryZone.y, deliveryZone.w, deliveryZone.h, this.x, this.y, this.w, this.h)) {
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
        else if (this.type === 'timed') { ctx.fillStyle='#ff0000'; ctx.fillRect(this.x, this.y, this.w, this.h); ctx.fillStyle='#fff'; ctx.font='10px Arial'; ctx.fillText(Math.ceil(this.countdown/60), this.x+8, this.y+20); }
        else super.render(ctx);
    }
}

class PressurePlate extends Entity {
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

class Door extends Entity {
    constructor(id, x, y, w, h) { super(x, y, w, h, 'door'); this.id=id; this.isOpen=false; }
    render(ctx) { if (!this.isOpen) super.render(ctx); else { ctx.fillStyle='rgba(255,60,0,0.1)'; ctx.fillRect(this.x, this.y, this.w, this.h); } }
}

class AlarmDoor extends Entity {
    constructor(id, x, y, w, h) { super(x, y, w, h, 'door'); this.id=id; this.isOpen=true; }
    render(ctx) {
        this.isOpen = !alarmState;
        if (!this.isOpen) { super.render(ctx); ctx.fillStyle='rgba(255,0,0,0.4)'; ctx.fillRect(this.x, this.y, this.w, this.h); }
        else { ctx.fillStyle='rgba(255,60,0,0.1)'; ctx.fillRect(this.x, this.y, this.w, this.h); }
    }
}

class TimerDoor extends Entity {
    constructor(id, x, y, w, h, openT, closedT) { super(x, y, w, h, 'door'); this.id=id; this.openT=openT; this.closedT=closedT; this.isOpen=false; }
    render(ctx) {
        let cycle = currentTick % (this.openT + this.closedT);
        if (cycle === this.openT) SFX.door();
        this.isOpen = cycle < this.openT;
        if (!this.isOpen) { super.render(ctx); ctx.fillStyle='rgba(255,100,0,0.4)'; ctx.fillRect(this.x,this.y,this.w,this.h); }
        else { ctx.fillStyle='rgba(255,100,0,0.1)'; ctx.fillRect(this.x,this.y,this.w,this.h); }
    }
}

class Laser extends Entity {
    constructor(id, x, y, w, h) { super(x, y, w, h, 'laser'); this.id=id; this.isOpen=false; }
    render(ctx) {
        if (!this.isOpen) {
            if (assets.laser) {
                ctx.save(); ctx.beginPath(); ctx.rect(this.x, this.y, this.w, this.h); ctx.clip();
                for(let i=0; i<this.h; i+=40) ctx.drawImage(assets.laser, this.x+(this.w/2 - 20), this.y+i, 40, 40);
                for(let i=0; i<this.w; i+=40) ctx.drawImage(assets.laser, this.x+i, this.y+(this.h/2 - 20), 40, 40);
                ctx.restore();
            } else { ctx.fillStyle='rgba(255,0,0,0.5)'; ctx.fillRect(this.x, this.y, this.w, this.h); }
        }
    }
}

class SweepCamera extends Entity {
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
        for(let g of activeGhosts) if (!g.cloakActive && checkCone(g.x, g.y)) triggerAlarm=true;
        for(let p of pkgs) if (p.type==='contraband' && checkCone(p.x, p.y)) triggerAlarm=true;
        
        if (triggerAlarm) { alarmState = true; runStats.alarms++; }
    }
    render(ctx) {
        super.render(ctx); ctx.fillStyle = alarmState?'rgba(255, 0, 0, 0.3)':'rgba(0, 243, 255, 0.2)';
        ctx.beginPath(); ctx.moveTo(this.x+15, this.y+15); ctx.arc(this.x+15, this.y+15, 250, this.currentAngle-0.35, this.currentAngle+0.35); ctx.closePath(); ctx.fill();
    }
}

class LaserProjectile {
    constructor(x, y, vx, vy) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.w = 4; this.h = 4; this.active = true;
    }
    update(walls, activeGhosts, player, pkgs) {
        if (!this.active) return;
        this.x += this.vx; this.y += this.vy;
        if (checkWallCollision(this.x, this.y, this.w, this.h)) { this.active = false;}
        if (!this.active) return;
        if (AABB(this.x, this.y, this.w, this.h, player.x, player.y, player.w, player.h)) {
            gameState = 'GAME_OVER'; uiGameOver.classList.remove('hidden'); let ed = document.getElementById('ending-title'); if(ed) ed.innerText = "VAPORIZED";
        }
        for (let g of activeGhosts) {
            if (g.isActive && AABB(this.x, this.y, this.w, this.h, g.x, g.y, g.w, g.h)) {
                g.isActive = false; this.active = false; break;
            }
        }
        for (let p of pkgs) {
            if (p.type === 'fragile' && AABB(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) {
                p.isDestroyed = true; this.active = false;
            }
        }
    }
    render(ctx) {
        if (!this.active) return;
        ctx.fillStyle = '#ff0044'; ctx.shadowColor = '#ff0044'; ctx.shadowBlur = 10;
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.shadowBlur = 0;
    }
}

function lineOfSightBlocked(x1, y1, x2, y2, walls) {
    let dx = x2 - x1; let dy = y2 - y1; let dist = Math.hypot(dx, dy);
    let steps = Math.ceil(dist / 5);
    for (let i=0; i<=steps; i++) {
        let px = x1 + (dx/steps)*i; let py = y1 + (dy/steps)*i;
        if (checkWallCollision(px, py, 1, 1)) return true;
    }
    return false;
}

class ShooterRobot extends Entity {
    constructor(path) {
        super(path[0].x, path[0].y, 35, 35, 'robot');
        this.path = path; this.pathIndex = 0; this.speed = 1.5;
        this.fireCooldown = 0; this.facingAngle = 0;
    }
    update(player, activeGhosts, walls) {
        if (this.path.length > 1) {
            let target = this.path[this.pathIndex];
            let dx = target.x - this.x; let dy = target.y - this.y;
            let dist = Math.hypot(dx, dy);
            if (dist < 2) { this.pathIndex = (this.pathIndex + 1) % this.path.length; }
            else { this.x += (dx/dist)*this.speed; this.y += (dy/dist)*this.speed; this.facingAngle = Math.atan2(dy, dx); }
        }
        if (this.fireCooldown > 0) this.fireCooldown--;
        let targets = [];
        if (player.cloakTimer <= 0) targets.push(player);
        activeGhosts.filter(g=>g.isActive && !g.cloakActive).forEach(g=>targets.push(g));
        let bestTarget = null; let bestDist = Infinity;
        for (let t of targets) {
            let dx = t.x - this.x; let dy = t.y - this.y; let dist = Math.hypot(dx, dy);
            if (dist < 300 && !lineOfSightBlocked(this.x+17, this.y+17, t.x+15, t.y+15, walls)) {
                if (dist < bestDist) { bestDist = dist; bestTarget = t; }
            }
        }
        if (bestTarget) {
            let dx =  bestTarget.x + 15 - (this.x+17); let dy = bestTarget.y + 15 - (this.y+17);
            this.facingAngle = Math.atan2(dy, dx);
            if (this.fireCooldown <= 0) {
                let a = this.facingAngle;
                SFX.robotShoot();
                projectiles.push(new LaserProjectile(this.x+17, this.y+17, Math.cos(a)*8, Math.sin(a)*8));
                this.fireCooldown = 60; 
            }
        }
    }
    render(ctx) {
        ctx.save(); ctx.translate(this.x + this.w/2, this.y + this.h/2); ctx.rotate(this.facingAngle);
        ctx.fillStyle = '#222'; ctx.fillRect(-15, -18, 30, 8); ctx.fillRect(-15, 10, 30, 8);
        ctx.strokeStyle = '#444'; ctx.strokeRect(-15, -18, 30, 8); ctx.strokeRect(-15, 10, 30, 8);
        ctx.fillStyle = '#555'; ctx.fillRect(-10, -10, 20, 20);
        ctx.fillStyle = 'rgba(0, 243, 255, 0.4)'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#00f3ff'; ctx.lineWidth=2; ctx.stroke();
        ctx.strokeStyle = '#888'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(15, -20); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(15, 20); ctx.stroke();
        ctx.fillStyle = '#ff0044'; ctx.beginPath(); ctx.arc(15, -20, 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(15, 20, 4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = (this.fireCooldown < 20 && this.fireCooldown > 0) ? '#fff' : '#ff0044';
        ctx.beginPath(); ctx.arc(8, 0, 3, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    }
}

class Drone extends Entity {
    constructor(points) {
        super(points[0].x, points[0].y, 30, 30, 'drone');
        this.points=points; this.targetIndex=1; this.speed=2.5; this.state='patrol'; this.investTarget=null; this.investTimer=0; this.startX=this.x; this.startY=this.y;
    }
    reset() { this.x=this.startX; this.y=this.startY; this.targetIndex=1; this.state='patrol'; this.investTimer=0; }
    update(player, noiseSources) {
        for(let n of noiseSources) {
            if (Math.hypot(n.x - this.x, n.y - this.y) < 350) { this.state='investigate'; this.investTarget={x:n.x, y:n.y}; this.investTimer=180; break; }
        }
        let tgt = this.state==='patrol' ? this.points[this.targetIndex] : this.investTarget;
        if (tgt) {
            let dx=tgt.x-this.x; let dy=tgt.y-this.y; let dist=Math.hypot(dx,dy);
            if (dist<this.speed) {
                this.x=tgt.x; this.y=tgt.y;
                if (this.state==='patrol') this.targetIndex=(this.targetIndex+1)%this.points.length;
                else { this.investTimer--; if(this.investTimer<=0) this.state='patrol'; }
            } else { this.x+=(dx/dist)*this.speed; this.y+=(dy/dist)*this.speed; }
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

class Guard extends Entity {
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

class WindTunnel extends Entity {
    constructor(x, y, w, h, dx, dy) { super(x, y, w, h, 'wind'); this.vx = dx; this.vy = dy; }
    render(ctx) { ctx.fillStyle='rgba(200,200,255,0.15)'; ctx.fillRect(this.x,this.y,this.w,this.h); }
}

class StaticZone extends Entity {
    constructor(x, y, w, h) { super(x, y, w, h, 'static'); }
    render(ctx) { ctx.fillStyle='rgba(150,0,255,0.2)'; ctx.fillRect(this.x,this.y,this.w,this.h); }
}

class CrackedFloor extends Entity {
    constructor(x, y, w, h) { super(x, y, w, h, 'crack'); this.ticks=0; this.broken=false; }
    update(actors) {
        if (this.broken) {
            for(let a of actors) if (AABB(a.x,a.y,a.w,a.h, this.x,this.y,this.w,this.h)) return "Fell into pit!";
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

class DeliveryZone extends Entity {
    constructor(x, y, w, h) { super(x, y, w, h, 'zone'); }
    render(ctx) { super.render(ctx); ctx.strokeStyle='#39ff14'; ctx.lineWidth=2; ctx.strokeRect(this.x, this.y, this.w, this.h); }
}

class Ghost extends Entity {
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
        const state = this.runData[stateIndex]; 
        
        this.x = state.x; this.y = state.y;
        this.cloakTimer = state.cloakTimer || 0;
        this.cloakActive = this.cloakTimer > 0;
        this.facingX = state.facingX || 0; this.facingY = state.facingY || 0;
        
        let interactJustPressed = !isPastEnd && state.interact && this.lastStateIndex !== stateIndex;
        let tossJustPressed = !isPastEnd && state.toss && this.lastStateIndex !== stateIndex;
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
            ctx.save(); ctx.strokeStyle = playerColor; ctx.lineWidth = 3; ctx.globalAlpha = 0.4;
            ctx.beginPath(); let startT = Math.max(0, Math.floor(this.localTick) - 15);
            if (startT < this.runData.length) {
                ctx.moveTo(this.runData[startT].x + 15, this.runData[startT].y + 15);
                for (let i = startT + 1; i <= Math.floor(this.localTick) && i < this.runData.length; i++) ctx.lineTo(this.runData[i].x + 15, this.runData[i].y + 15);
                ctx.stroke();
            }
            ctx.restore();
        }
        ctx.save(); ctx.globalAlpha = this.cloakTimer > 0 ? 0.2 : 0.5;
        if (assets[this.assetName]) {
            ctx.drawImage(assets[this.assetName], this.x, this.y, this.w, this.h);
            ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = '#00f3ff'; ctx.globalAlpha = 0.5; ctx.fillRect(this.x, this.y, this.w, this.h);
        } else { ctx.fillStyle = '#00f3ff'; ctx.fillRect(this.x, this.y, this.w, this.h); }
        ctx.restore();
    }
}

let challengesCompletedLocal = JSON.parse(localStorage.getItem('echoCourier_challenges') || '{}'); // Just redefining as dummy since moved up

const LEVELS = [
    { name: "Level 1: The Basics", story: { speaker: "ChronoHaul Dispatch", text: "Courier 83-A, welcome to your shift. Route efficiency is down 4%. Deploy your Temporal Payload to generate a logistics artifact (Echo). Echoes are non-sentient and property of ChronoHaul." }, obj: "Deliver the package using an echo to hold the door.", challenge: { desc: "Finish in 2 loops or fewer", check: () => pastRuns.length <= 1 }, maxGhosts: 1, setup: () => { player=new PlayerEntity(100,450,30,30,'player'); deliveryZone=new DeliveryZone(50,50,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(400,0,40,250),new Wall(400,330,40,270)]; doors=[new Door('d1',400,250,40,80)]; plates=[new PressurePlate('p1',250,450,'d1')]; packages=[new Package('pkg1',650,150)]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Level 2: The Airlock", story: { speaker: "Local Hub Manager", text: "We’ve authorized a double-echo payload for this route. Remember, overlapping timelines are unstable. Don't think about it too much, just deliver the box." }, obj: "Two ghosts unlocked! Coordinate them to hold both doors.", challenge: { desc: "Finish in 3 loops or fewer", check: () => pastRuns.length <= 2 }, maxGhosts: 2, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(50,450,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(250,0,40,250),new Wall(250,330,40,270),new Wall(550,0,40,250),new Wall(550,330,40,270)]; doors=[new Door('d1',250,250,40,80),new Door('d2',550,250,40,80)]; plates=[new PressurePlate('p1',150,150,'d1'),new PressurePlate('p2',400,150,'d2')]; packages=[new Package('pkg1',650,300)]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Level 3: Heavy Lifting", story: { speaker: "Local Hub Manager", text: "High-density cargo pending. It will severely slow your physical traversal. Build an echo timeline to handle the door systems so you can focus entirely on dragging the payload." }, obj: "Heavy packages cut your speed in half. Plan accordingly.", challenge: { desc: "Finish final loop in under 600 ticks", check: () => currentTick < 600 }, maxGhosts: 2, setup: () => { player=new PlayerEntity(100,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(380,0,40,200),new Wall(380,400,40,200)]; doors=[new TimerDoor('td1',380,200,40,200,60,60)]; plates=[]; packages=[new Package('pkg1',200,300,'heavy')]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Level 4: The Gap", story: { speaker: "ChronoHaul Dispatch", text: "Courier, the infrastructure in this sector is compromised. If you have accrued enough credits, purchase the DASH module from the terminal. Spatial translation is strictly prohibited for civilian use." }, obj: "DASH UPGRADE (Shift). Teleport instantly across the gap!", unlocks: ['dash'], challenge: { desc: "Do NOT use Dash", check: () => runStats.dashes === 0 }, maxGhosts: 2, setup: () => { player=new PlayerEntity(100,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600)]; cracks=[]; for(let i=20;i<580;i+=40) cracks.push(new CrackedFloor(380,i,40,40)); packages=[new Package('pkg1',200,300)]; doors=[]; plates=[]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; robots=[]; projectiles=[]; } },
    
    { name: "Level 5: Fragile Handling", story: { speaker: "Local Hub Manager", text: "You’re handling Class-4 fragile tech. The security lasers in Transit Yard B will vaporize it instantly. Ensure the grid is disabled before you expose the cargo." }, obj: "Fragile packages break in lasers. Escort them with care.", challenge: { desc: "Finish in 4 loops or fewer", check: () => pastRuns.length <= 3 }, maxGhosts: 3, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,150,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600)]; lasers=[new Laser('ls1',400,20,20,560)]; plates=[new PressurePlate('p1',250,300,'ls1')]; packages=[new Package('pkg1',500,450,'fragile')]; doors=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Level 6: The Toss", story: { speaker: "Local Hub Manager", text: "Look, the bridge is out and corporate won't pay for repairs. Purchase the TOSS module and use it to fling the cargo. Just don't let it fall into the fissure." }, obj: "Throw packages over the gap! (Requires Toss purchase)", challenge: { desc: "Do NOT use Toss", check: () => runStats.tosses === 0 }, maxGhosts: 3, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(350,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600)]; cracks=[]; for(let i=20;i<580;i+=40) cracks.push(new CrackedFloor(250,i,80,40)); lasers=[]; plates=[]; packages=[new Package('pkg1',100,300)]; doors=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; robots=[]; projectiles=[]; } },
    { name: "Level 7: Wind Tunnel", story: { speaker: "Sector Surveillance", text: "Warning: Atmospheric ventilation active. Trajectories will be severely altered. ChronoHaul is not liable for packages lost in the wind tunnels." }, obj: "Winds push you. Toss your package right through the storm.", challenge: { desc: "Do NOT use Dash", check: () => runStats.dashes === 0 }, maxGhosts: 3, setup: () => { player=new PlayerEntity(50,500,30,30,'player'); deliveryZone=new DeliveryZone(650,50,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600)]; winds=[new WindTunnel(300,20,200,560,0,3)]; plates=[]; packages=[new Package('pkg1',100,100,'heavy')]; doors=[]; lasers=[]; guards=[]; cameras=[]; drones=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    
    { name: "Level 8: The Panopticon", story: { speaker: "Unknown Hacker [Encrypted]", text: "Hey. You're moving Contraband now. ChronoHaul is using you to traffic illegal temporal drives. The cameras here will trigger alarms even if you use a Cloak. Be careful." }, obj: "CLOAK UPGRADE (C). Contraband triggers Alarms if seen!", unlocks: ['cloak'], challenge: { desc: "Do NOT use Cloak", check: () => runStats.cloaks === 0 }, maxGhosts: 3, setup: () => { player=new PlayerEntity(50,500,30,30,'player'); deliveryZone=new DeliveryZone(650,50,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(400,0,40,250),new Wall(400,330,40,270)]; doors=[new AlarmDoor('d1',400,250,40,80)]; cameras=[new SweepCamera(150,20,Math.PI/2,Math.PI/4)]; packages=[new Package('pkg1',100,100,'contraband')]; lasers=[]; guards=[]; drones=[]; plates=[]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Level 9: Noise Complaint", story: { speaker: "Local Hub Manager", text: "We've got security drones patrolling the Anomaly sector. They investigate loud noises. Use Decoy boxes to ping their audio sensors. Keep the real cargo hidden." }, obj: "Drones investigate drops. Toss Decoys (blue) to lure them.", challenge: { desc: "Finish in 2 loops or fewer", check: () => pastRuns.length <= 1 }, maxGhosts: 3, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600)]; drones=[new Drone([{x:400,y:100},{x:400,y:500}])]; packages=[new Package('pkg1',200,100,'decoy'),new Package('pkg2',50,500,'standard')]; doors=[]; plates=[]; lasers=[]; guards=[]; cameras=[]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    
    { name: "Level 10: Fast Shipping", story: { speaker: "ChronoHaul Dispatch", text: "Critical: Package is highly unstable. Detonation sequence activates upon handling. The company expects immediate delivery. Do not fail." }, obj: "Timed packages explode! Toss them over the gap instantly.", challenge: { desc: "Do NOT use Dash", check: () => runStats.dashes === 0 }, maxGhosts: 2, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600)]; cracks=[]; for(let i=20;i<580;i+=40) cracks.push(new CrackedFloor(380,i,40,40)); packages=[new Package('pkg1',100,300,'timed')]; doors=[]; plates=[]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; robots=[]; projectiles=[]; } },
    { name: "Level 11: Time Dilation", story: { speaker: "Unknown Hacker [Encrypted]", text: "They're trapping your discarded timelines in these Static Zones. The purple fields literally harvest temporal energy by slowing your echoes down. They're farming you." }, obj: "Static Zones slow ghost playback. Squeeze your execution.", challenge: { desc: "No Alarms Triggered", check: () => runStats.alarms === 0 }, maxGhosts: 3, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600)]; statics=[new StaticZone(200,20,200,560)]; doors=[new TimerDoor('td1',450,200,40,200,60,60)]; doors.push(new Door('d1', 550, 200, 40, 200)); plates=[new PressurePlate('p1', 300, 450, 'd1')]; packages=[new Package('pkg1',100,100)]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Level 12: Echo Crunch", story: { speaker: "Local Hub Manager", text: "Temporal budget exhausted. You are restricted to ONE echo. Corporate says zero margin for error. Get it done or your contract is terminated." }, obj: "Maximum 1 Echo Limit. Puzzles with no margin for error.", challenge: { desc: "No Dash and No Cloak", check: () => runStats.dashes === 0 && runStats.cloaks === 0 }, maxGhosts: 1, setup: () => { player=new PlayerEntity(100,450,30,30,'player'); deliveryZone=new DeliveryZone(650,450,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(380,0,40,250),new Wall(380,330,40,270)]; doors=[new Door('d1',380,250,40,80)]; plates=[new PressurePlate('p1',150,150,'d1')]; statics=[new StaticZone(100, 100, 100, 100)]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; cracks=[]; packages=[new Package('pkg1',650,200,'fragile')]; robots=[]; projectiles=[]; } },
    { name: "Level 13: Danger Courier", story: { speaker: "Unknown Hacker [Encrypted]", text: "ChronoHaul deployed an Exterminator robot to stop you. It has kill authorization. You're going to have to force your echo to draw its fire and sacrifice itself so you can escape." }, obj: "Bait the Security Robot's lasers using an Echo to safely escort the Fragile package.", challenge: { desc: "Finish in 2 loops", check: () => pastRuns.length <= 1 }, maxGhosts: 2, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(380,0,40,200),new Wall(380,400,40,200)]; robots=[new ShooterRobot([{x:385,y:200},{x:385,y:350}])]; lasers=[]; doors=[]; plates=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[]; packages=[new Package('pkg1',100,100,'fragile')]; projectiles=[]; } }
];

function getUnlockedAbilities() {
    if (devModeCheckbox.checked) return ['dash', 'toss', 'cloak'];
    let unlocks = new Set();
    if (abilitiesPurchased['dash']) unlocks.add('dash');
    if (abilitiesPurchased['toss']) unlocks.add('toss');
    if (abilitiesPurchased['cloak']) unlocks.add('cloak');
    return Array.from(unlocks);
}

function showSubMenu(menuId) {
    document.getElementById('main-menu-nav').classList.add('hidden');
    document.getElementById('sub-levels').classList.add('hidden');
    document.getElementById('sub-shop').classList.add('hidden');
    document.getElementById('sub-settings').classList.add('hidden');
    if (menuId === 'main') document.getElementById('main-menu-nav').classList.remove('hidden');
    else document.getElementById('sub-' + menuId).classList.remove('hidden');
}

function startNextAvailableLevel() {
    startMusic();
    let lvl = devModeCheckbox.checked ? 0 : Math.min(maxUnlockedLevel, LEVELS.length - 1);
    startGame(lvl);
}

function updateHUD() {
    let hud = document.querySelector('.bottom-hud');
    if (!hud) return;
    let html = `<div class="controls-hint" style="margin-bottom: 10px;">
                    <kbd>WASD</kbd> Move &nbsp;|&nbsp; <kbd>SPACE</kbd> Pick/Drop &nbsp;|&nbsp; 
                    <kbd>R</kbd> Reset Loop &nbsp;|&nbsp; <kbd>ESC</kbd> Menu
                </div>`;
    let unlocked = getUnlockedAbilities();
    let abilities = [];
    if (unlocked.includes('dash')) abilities.push(`<kbd>SHIFT</kbd> Dash`);
    if (unlocked.includes('toss')) abilities.push(`<kbd>F</kbd> Toss Package`);
    if (unlocked.includes('cloak')) abilities.push(`<kbd>C</kbd> Camera Cloak`);
    if (abilities.length > 0) {
        html += `<div class="controls-hint" style="color: #ffdd00;">` + abilities.join(' &nbsp;|&nbsp; ') + `</div>`;
    }
    hud.innerHTML = html;
}

function initMenu() {
    uiTitleScreen.classList.remove('hidden'); uiAppLayout.classList.add('hidden'); uiLevelComplete.classList.add('hidden'); uiGameOver.classList.add('hidden');
    showSubMenu('main');
    uiLevelGrid.innerHTML = '';
    
    let rankData = ["Junior Courier", "Route Courier", "Security Courier", "Temporal Courier", "Loopmaster"];
    const RANK_COLORS = ['#ff7b00', '#39ff14', '#b200ff', '#e6edf3', '#ffdd00'];
    let currentRank = getPlayerRank();
    let rankUI = document.getElementById('player-rank-display');
    if (rankUI) { rankUI.innerText = "Rank: " + rankData[currentRank]; rankUI.style.color = RANK_COLORS[currentRank]; }
    
    let credits = getCredits();
    let credUI = document.getElementById('credits-display');
    if (credUI) credUI.innerText = credits;

    const storeConfig = { 'dash': 300, 'toss': 300, 'cloak': 400 };
    Object.keys(storeConfig).forEach(ab => {
        let btn = document.getElementById('shop-' + ab);
        if (!btn) return;
        if (abilitiesPurchased[ab] || devModeCheckbox.checked) {
            btn.innerText = ab.toUpperCase() + " (OWNED)"; btn.style.background = '#39ff14'; btn.style.color = '#000'; btn.disabled = true; btn.style.borderColor = '#39ff14';
        } else if (credits >= storeConfig[ab]) {
            btn.innerText = "BUY " + ab.toUpperCase() + " ($" + storeConfig[ab] + ")"; btn.style.background = '#0d1117'; btn.style.color = '#39ff14';
            btn.disabled = false; btn.style.border = '1px solid #39ff14'; btn.style.cursor = 'pointer';
            btn.onclick = () => { abilitiesPurchased[ab] = true; localStorage.setItem('echoCourier_abilities', JSON.stringify(abilitiesPurchased)); initMenu(); };
        } else {
            btn.innerText = "LOCKED ($" + storeConfig[ab] + ")"; btn.style.background = '#05070a'; btn.style.color = '#555';
            btn.disabled = true; btn.style.border = '1px solid #333'; btn.style.cursor = 'not-allowed';
        }
    });

    let btns = document.querySelectorAll('.suit-btn');
    btns.forEach((btn, i) => {
        if (currentRank >= i || devModeCheckbox.checked) { btn.disabled = false; btn.style.borderColor = btn.dataset.color === playerColor ? 'white' : '#555'; btn.style.cursor = 'pointer'; } 
        else { btn.disabled = true; btn.style.borderColor = '#111'; btn.style.cursor = 'not-allowed'; }
        btn.onclick = () => { if(!btn.disabled) { playerColor = RANK_COLORS[i]; localStorage.setItem('echoCourier_suit', playerColor); initMenu(); } };
    });

    const worlds = [
        { name: "World 1: Training District", levels: [0, 1, 2, 3] },
        { name: "World 2: Transit Yards", levels: [4, 5, 6] },
        { name: "World 3: Security Sector", levels: [7, 8] },
        { name: "World 4: The Anomaly", levels: [9, 10, 11] },
        { name: "World 5: Restricted Zone", levels: [12] }
    ];
    
    worlds.forEach(world => {
        let header = document.createElement('div');
        header.style.width = '100%'; header.style.color = '#00f3ff'; header.style.marginTop = '15px'; header.style.marginBottom = '5px'; 
        header.style.borderBottom = '1px solid rgba(0, 243, 255, 0.3)'; header.style.paddingBottom = '5px';
        header.style.fontFamily = '"Space Grotesk"'; header.style.fontSize = '1.2rem'; header.innerText = world.name;
        uiLevelGrid.appendChild(header);
        
        world.levels.forEach(index => {
            let lv = LEVELS[index];
            if (!lv) return;
            let btn = document.createElement('button'); btn.className = 'level-btn';
            let isUnlocked = (index <= maxUnlockedLevel) || devModeCheckbox.checked;
            let shortName = lv.name.split(':'); shortName = shortName.length > 1 ? shortName[1].trim() : lv.name;
            btn.innerHTML = `${index + 1}<span>${shortName}</span>`;
            if (isUnlocked) btn.addEventListener('click', () => startGame(index)); else btn.disabled = true;
            uiLevelGrid.appendChild(btn);
        });
    });
}
devModeCheckbox.addEventListener('change', initMenu);
function returnToMenu() { gameState = 'MENU'; initMenu(); }
document.getElementById('next-level-btn').addEventListener('click', () => startGame(currentLevelIndex + 1));

function startGame(levelIndex) {
    startMusic();
    if (levelIndex >= LEVELS.length) { 
        gameState = 'GAME_COMPLETE'; 
        uiAppLayout.classList.remove('hidden'); uiLevelComplete.classList.add('hidden'); uiGameOver.classList.remove('hidden'); 
        let ed = document.getElementById('ending-title'); if(ed) { ed.innerText = "CHRONOHAUL EXPOSED"; ed.style.color = '#39ff14'; ed.style.textShadow = '0 0 20px #39ff14'; }
        let eb = document.getElementById('retry-btn'); if(eb) { eb.innerText = "RETURN TO CITY"; eb.style.borderColor = '#39ff14'; eb.style.color = '#39ff14'; }
        document.getElementById('credits-display').parentElement.classList.add('hidden');
        return; 
    }
    let maxLoops = LEVELS[levelIndex].maxGhosts + 1;
    document.getElementById('max-loops').innerText = maxLoops;
    currentLevelIndex = levelIndex; let lv = LEVELS[levelIndex];
    robots = []; projectiles = [];
    levelDisplayUI.innerText = levelIndex + 1; objectiveTextUI.innerText = lv.obj; lv.setup();
    player.facingX=1; player.facingY=0; player.cloakTimer=0; player.dashCooldown=0;
    updateHUD(); runStats = { tosses: 0, dashes: 0, cloaks: 0, alarms: 0 };
    document.getElementById('challenge-text').innerText = "⭐ Challenge: " + lv.challenge.desc;
    document.getElementById('challenge-text').style.color = challengesCompleted[levelIndex] ? "gold" : "#fff";
    pastRuns = []; currentRun = []; currentTick = 0; activeGhosts = []; failTimer=0; alarmState = false;
    uiTitleScreen.classList.add('hidden'); uiLevelComplete.classList.add('hidden'); uiGameOver.classList.add('hidden');
    uiAppLayout.classList.remove('hidden'); loopCountUI.innerText = pastRuns.length; Object.assign(prevKeys, keys);
    
    if (lv.story) {
        gameState = 'DIALOG';
        let speakerUI = document.getElementById('dialog-speaker'); if (speakerUI) speakerUI.innerText = lv.story.speaker;
        let textUI = document.getElementById('dialog-text'); if (textUI) textUI.innerText = `"${lv.story.text}"`;
        let ov = document.getElementById('dialog-overlay'); if (ov) ov.classList.remove('hidden');
    } else {
        gameState = 'PLAYING';
        let ov = document.getElementById('dialog-overlay'); if (ov) ov.classList.add('hidden');
    }
}

function resetRun() {
    if (currentTick > 0) pastRuns.push([...currentRun]);
    currentRun = []; currentTick = 0; failTimer=0; alarmState = false;
    if (LEVELS[currentLevelIndex].maxGhosts && pastRuns.length > LEVELS[currentLevelIndex].maxGhosts) pastRuns.shift();
    LEVELS[currentLevelIndex].setup(); player.facingX=1; player.facingY=0; player.cloakTimer=0; player.dashCooldown=0;
    activeGhosts = pastRuns.map((r, i) => new Ghost(i, r));
    loopCountUI.innerText = pastRuns.length;
}

function levelFailed(reason) { if (failTimer > 0) return; SFX.fail(); failMessage = reason; failTimer = 120; }

function checkWallCollision(newX, newY, w, h) {
    for (let wall of walls) if (AABB(newX, newY, w, h, wall.x, wall.y, wall.w, wall.h)) return true;
    for (let door of doors) if (!door.isOpen && AABB(newX, newY, w, h, door.x, door.y, door.w, door.h)) return true;
    return false;
}

function update() {
    if (gameState === 'DIALOG') {
        if (isKeyJustPressed('space')) {
            startMusic();
            gameState = 'PLAYING';
            let ov = document.getElementById('dialog-overlay'); if (ov) ov.classList.add('hidden');
            let ds = document.getElementById('dialog-speaker'); if (ds) ds.innerText = '';
            let dt = document.getElementById('dialog-text'); if (dt) dt.innerText = '';
        }
        Object.assign(prevKeys, keys);
        return;
    }
    if (gameState !== 'PLAYING') { Object.assign(prevKeys, keys); return; }
    
    if (failTimer > 0) { failTimer--; if (failTimer === 0) resetRun(); return; }
    if (isKeyJustPressed('esc')) { returnToMenu(); return; }
    if (isKeyJustPressed('r')) { resetRun(); Object.assign(prevKeys, keys); return; }

    let allActors = [{x: player.x, y: player.y, w: player.w, h: player.h}];
    for (let ghost of activeGhosts) {
        ghost.update(packages, statics);
        if (ghost.isActive) allActors.push({x: ghost.x, y: ghost.y, w: ghost.w, h: ghost.h});
    }

    let oldAlarm = alarmState;
    alarmState = false; cameras.forEach(c => c.update(player, packages));
    
    robots.forEach(r => r.update(player, activeGhosts, walls));
    projectiles.forEach(p => p.update(walls, activeGhosts, player, packages));
    projectiles = projectiles.filter(p => p.active);

    let unlocked = getUnlockedAbilities();
    let hasDash = unlocked.includes('dash');
    let hasToss = unlocked.includes('toss');
    let hasCloak = unlocked.includes('cloak');

    let interactJustPressed = isKeyJustPressed('space');
    let tossJustPressed = hasToss && isKeyJustPressed('f');
    let dashJustPressed = hasDash && isKeyJustPressed('shift');
    let cloakJustPressed = hasCloak && isKeyJustPressed('c');

    if (player.cloakTimer > 0) player.cloakTimer--;
    if (cloakJustPressed && player.cloakTimer <= 0) { SFX.cloak(); player.cloakTimer = 120; runStats.cloaks++; } // 2 seconds cloak
    if (dashJustPressed && player.dashCooldown <= 0) {
        let destX = player.x + player.facingX * 60; let destY = player.y + player.facingY * 60;
        if (!checkWallCollision(destX, destY, player.w, player.h)) { SFX.dash(); player.x = destX; player.y = destY; player.dashCooldown = 60; runStats.dashes++; }
    }
    if (player.dashCooldown > 0) player.dashCooldown--;

    let noiseSources = [];
    if (interactJustPressed || tossJustPressed) noiseSources.push({x: player.x, y: player.y});
    for(let g of activeGhosts) {
        let stateIndex = Math.floor(g.localTick); 
        if (stateIndex < g.runData.length && (g.runData[stateIndex].interact || g.runData[stateIndex].toss)) noiseSources.push({x: g.x, y: g.y});
    }

    for(let d of drones) { let fail = d.update(player, noiseSources); if (fail) { levelFailed(fail); return; } }

    plates.forEach(plate => {
        plate.update(allActors, packages);
        doors.filter(d => d.id === plate.linkedIds[0]).forEach(d => d.isOpen = plate.isPressed);
        lasers.filter(l => plate.linkedIds[0] === l.id).forEach(l => l.isOpen = plate.isPressed);
    });

    for(let g of guards) { let fail = g.update(player, activeGhosts); if (fail) { levelFailed(fail); return; } }
    for(let c of cracks) { let fail = c.update(allActors); if (fail) { levelFailed(fail); return; } }
    
    // Wind Push
    let envVx = 0, envVy = 0;
    for(let w of winds) if (AABB(player.x, player.y, player.w, player.h, w.x, w.y, w.w, w.h)) { envVx += w.vx; envVy += w.vy; }

    const baseSpeed = 4;
    let carried = packages.find(p => p.carriedBy === 'player');
    let currentSpeed = (carried && carried.type === 'heavy') ? baseSpeed * 0.5 : baseSpeed;

    let dx = envVx, dy = envVy;
    if (keys.w) dy -= currentSpeed; if (keys.s) dy += currentSpeed;
    if (keys.a) dx -= currentSpeed; if (keys.d) dx += currentSpeed;
    let md = Math.hypot(dx - envVx, dy - envVy); if (md > currentSpeed) { dx = envVx + (dx-envVx)/md*currentSpeed; dy = envVy + (dy-envVy)/md*currentSpeed; }

    if (dx !== envVx || dy !== envVy) {
        player.facingX = dx-envVx===0 ? 0 : (dx-envVx>0 ? 1 : -1);
        player.facingY = dy-envVy===0 ? 0 : (dy-envVy>0 ? 1 : -1);
    }

    if (!checkWallCollision(player.x + dx, player.y, player.w, player.h)) player.x += dx;
    if (!checkWallCollision(player.x, player.y + dy, player.w, player.h)) player.y += dy;

    for(let l of lasers) {
        if (!l.isOpen && player.cloakTimer <= 0) {
            if (AABB(player.x, player.y, player.w, player.h, l.x, l.y, l.w, l.h)) { levelFailed("Burned by Laser Grid!"); return; }
            for(let p of packages) {
                if (!p.isDestroyed && AABB(p.x, p.y, p.w, p.h, l.x, l.y, l.w, l.h)) {
                    if (p.type === 'fragile') { p.isDestroyed = true; levelFailed("Fragile Package Destroyed!"); return; }
                }
            }
        }
    }

    if (interactJustPressed) {
        SFX.interact();
        if (carried) { carried.carriedBy = null; }
        else { 
            for (let p of packages) {
                if (!p.isDestroyed && (!p.carriedBy || p.carriedBy.startsWith('ghost_')) && AABB(player.x, player.y, player.w, player.h, p.x, p.y, p.w, p.h)) { 
                    p.carriedBy = 'player'; break; 
                }
            } 
        }
    }
    
    if (tossJustPressed && carried) {
        SFX.toss();
        carried.carriedBy = null; carried.vx = player.facingX * 12; carried.vy = player.facingY * 12; carried.tossTicks = 10;
        noiseSources.push({x: player.x, y: player.y}); runStats.tosses++;
    }

    for (let p of packages) {
        let fail = p.update(); if (fail) { levelFailed(fail); return; }
        if (p.isDestroyed) continue;
        
        let pEnvVx = 0, pEnvVy = 0;
        if (!p.carriedBy && p.tossTicks <= 0) {
            for(let w of winds) if (AABB(p.x, p.y, p.w, p.h, w.x, w.y, w.w, w.h)) { pEnvVx += w.vx; pEnvVy += w.vy; }
            p.x += pEnvVx; p.y += pEnvVy;
        }

        if (p.carriedBy === 'player') { p.x = player.x + (player.w - p.w)/2; p.y = player.y + (player.h - p.h)/2; }
        else if (p.carriedBy && p.carriedBy.startsWith('ghost_')) {
            let ghostId = parseInt(p.carriedBy.split('_')[1]);
            let ghost = activeGhosts.find(ag => ag.id === ghostId);
            if (ghost) { p.x = ghost.x + (ghost.w - p.w)/2; p.y = ghost.y + (ghost.h - p.h)/2; }
            else p.carriedBy = null;
        }
    }

    let allDelivered = true;
    for (let p of packages) {
        if (p.type === 'decoy') continue;
        if (p.isDestroyed || p.carriedBy || !AABB(deliveryZone.x, deliveryZone.y, deliveryZone.w, deliveryZone.h, p.x, p.y, p.w, p.h)) { allDelivered = false; break; }
    }
    if (allDelivered && packages.filter(p=>p.type !== 'decoy').length > 0 && gameState === 'PLAYING') { 
        SFX.win(); gameState = 'LEVEL_COMPLETE'; uiLevelComplete.classList.remove('hidden'); 
        let isFirstTimeLevel = (currentLevelIndex == parseInt(localStorage.getItem('echoCourier_maxLevel') || '0'));
        if (currentLevelIndex >= maxUnlockedLevel && currentLevelIndex < LEVELS.length - 1) {
            maxUnlockedLevel = currentLevelIndex + 1; localStorage.setItem('echoCourier_maxLevel', maxUnlockedLevel);
        }
        let earnedMsg = isFirstTimeLevel ? "Level Clear: +$100<br><br>" : "Level Clear: +$0<br><br>";
        
        let chalSuccess = !challengesCompleted[currentLevelIndex] && LEVELS[currentLevelIndex].challenge.check();
        let chalMsg = document.getElementById('challenge-result');
        if (chalSuccess) {
            challengesCompleted[currentLevelIndex] = true;
            localStorage.setItem('echoCourier_challenges', JSON.stringify(challengesCompleted));
            if (chalMsg) { chalMsg.innerHTML = earnedMsg + "⭐ Challenge Passed! (+$200) ⭐"; chalMsg.style.color = 'gold'; }
        } else {
            let previouslyDone = challengesCompleted[currentLevelIndex];
            if (chalMsg) { chalMsg.innerHTML = earnedMsg + (previouslyDone ? "⭐ Challenge Already Claimed ⭐" : "Challenge Failed (Try again!)"); chalMsg.style.color = previouslyDone ? 'gold' : '#888'; }
        }
    }
    currentRun.push({ x: player.x, y: player.y, facingX: player.facingX, facingY: player.facingY, cloakTimer: player.cloakTimer, interact: interactJustPressed, toss: tossJustPressed }); 
    currentTick++; Object.assign(prevKeys, keys);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (gameState !== 'PLAYING' && gameState !== 'LEVEL_COMPLETE') return;
    if (assetsLoaded < assetNames.length) { ctx.fillStyle = '#fff'; ctx.fillText("Loading Assets...", 400, 300); return; }

    statics.forEach(s => s.render(ctx)); winds.forEach(w => w.render(ctx)); cracks.forEach(c => c.render(ctx));
    deliveryZone.render(ctx); plates.forEach(p => p.render(ctx)); walls.forEach(w => w.render(ctx));
    lasers.forEach(l => l.render(ctx)); doors.forEach(d => { if (d.render.length > 1) d.render(ctx, currentTick); else d.render(ctx); });
    packages.forEach(p => p.render(ctx)); activeGhosts.forEach(g => g.render(ctx)); 
    
    ctx.save(); if (player.cloakTimer > 0) ctx.globalAlpha = 0.2; player.render(ctx); ctx.restore();
    
    guards.forEach(g => g.render(ctx));
    robots.forEach(r => r.render(ctx));
    projectiles.forEach(p => p.render(ctx));
    cameras.forEach(c => c.render(ctx)); drones.forEach(d => d.render(ctx));
    
    if (alarmState && currentTick % 60 === 0) SFX.alarm();
    if (alarmState) { ctx.fillStyle = 'rgba(255, 0, 0, 0.15)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    if (failTimer > 0) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.4)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 36px "Space Grotesk"'; ctx.textAlign = 'center'; ctx.fillText("LOOP FAILED", 400, 250);
        ctx.fillStyle = '#ff7b00'; ctx.font = '20px "Space Grotesk"'; ctx.fillText(failMessage, 400, 300); ctx.textAlign = 'left';
    }
}

let lastTime = performance.now(); let accumulator = 0;
function loop(time) {
    let deltaTime = time - lastTime; lastTime = time;
    if (deltaTime > 250) deltaTime = 250; accumulator += deltaTime;
    while (accumulator >= TICK_RATE) { update(); accumulator -= TICK_RATE; }
    scheduleMusic();
    draw(); requestAnimationFrame(loop);
}
initMenu(); requestAnimationFrame(loop);
