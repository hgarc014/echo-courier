// Subfloor mini-boss. Deterministic: tick counters only, no Math.random.
// Times on the entity are seconds (60 Hz). Home is startX/startY; between strikes
// it waits there (on or under the den) and slides to the victim's crack during the
// dust telegraph so replays stay stable.
//
// A telegraphed tile is always an intact crack: not broken, not collapsing, and not
// overlapping a plate. If the locked tile later breaks, the next tick retargets.
// Cracks heal when the loop reloads (rewind). If none are left mid-loop, spent tiles
// that no body is standing on are knitted back; if every spent tile is occupied, the
// burrower surfaces at its den on the same timer instead of idling. Dormant (the
// per-loop stun cap) is a countdown to that rewind, not a freeze.
import { state } from '../../core/state.js';
import { Entity } from '../base.js';
import { AABB } from '../../core/physics.js';
import { SFX } from '../../core/audio.js';
import { actorPressesPlate, killZone } from '../../core/hitZones.js';
import { drawKillRing } from '../hazards.js';

const TICKS_PER_SECOND = 60;
// "Loudest wins": the boss hunts whoever most recently stepped onto a crack or a
// plate. Standing still is silent, and noise fades, so a parked echo is ignored and
// the hunt falls back to the live courier.
export const NOISE_TTL_TICKS = 90;      // 1.5 s: older noise no longer counts
// A stun needs an echo to stamp the struck crack (step onto it in the last
// STAMP_WINDOW_TICKS before the strike: 0..29 ticks = exactly 0.5 s) and still be
// on it, while the live courier holds the core plate beside it. The locked crack
// is held intact until the strike, so an early stamp only reads TOO EARLY.
export const STAMP_WINDOW_TICKS = 30;
export const FEEDBACK_TICKS = 75;
export const STRIKE_FAIL = 'Struck by the Burrower!';
const GRID = 40;
export const RIPPLE_TICKS = 36;

export function burrowerTicks(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const tps = state.TICK_RATE > 0 ? (1000 / state.TICK_RATE) : TICKS_PER_SECOND;
    return Math.max(1, Math.round(n * tps));
}

function ticksPerSecond() {
    return state.TICK_RATE > 0 ? (1000 / state.TICK_RATE) : TICKS_PER_SECOND;
}

// null = unlimited. Non-positive / blank values are unlimited so an empty inspector field
// does not freeze the boss. A positive integer is how many stuns end the surfacing cycle
// until the next rewind (a fresh instance starts the count over).
export function normalizeMaxStunsPerLoop(value) {
    if (value == null || value === '') return null;
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 1) return null;
    return n;
}

function center(a) {
    return {
        x: a.x + (a.w || 30) / 2,
        y: a.y + (a.h || 30) / 2
    };
}

// Ghosts carry a numeric id (and runData). The live courier does not.
export function whoName(kind, id) {
    if (kind === 'echo') return `ECHO ${typeof id === 'number' ? id + 1 : id}`;
    if (kind === 'player') return 'YOU';
    return null;
}

export function actorKey(actor) {
    const info = actorTargetInfo(actor);
    return info.kind + ':' + info.id;
}

export function actorTargetInfo(actor) {
    if (!actor) return { kind: null, id: null };
    if (typeof actor.id === 'number' || Array.isArray(actor.runData)) {
        return { kind: 'echo', id: actor.id ?? null };
    }
    return { kind: 'player', id: actor.id != null ? actor.id : 'player' };
}

export function orthoAdjacent(a, b, eps = 2) {
    if (!a || !b) return false;
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    const touchX = Math.abs((a.x + a.w) - b.x) <= eps || Math.abs((b.x + b.w) - a.x) <= eps;
    const touchY = Math.abs((a.y + a.h) - b.y) <= eps || Math.abs((b.y + b.h) - a.y) <= eps;
    return (touchX && overlapY > eps) || (touchY && overlapX > eps);
}

function tileOf(crack) {
    return { x: crack.x, y: crack.y, w: crack.w, h: crack.h };
}

function sameTile(a, b) {
    return a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function paintLabel(ctx, text, x, y, opts = {}) {
    ctx.save();
    ctx.font = opts.font || 'bold 12px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width;
    const padX = 5;
    const h = opts.h || 16;
    ctx.fillStyle = opts.bg || 'rgba(4, 8, 12, 0.82)';
    ctx.fillRect(x - w / 2 - padX, y - h / 2, w + padX * 2, h);
    ctx.fillStyle = opts.color || '#fff';
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
}

function drawStar(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
        const b = a + Math.PI / 5;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.lineTo(x + Math.cos(b) * r * 0.4, y + Math.sin(b) * r * 0.4);
    }
    ctx.closePath();
    ctx.fill();
}

function drawArrow(ctx, x1, y1, x2, y2, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const ah = 11;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ah * Math.cos(ang - 0.45), y2 - ah * Math.sin(ang - 0.45));
    ctx.lineTo(x2 - ah * Math.cos(ang + 0.45), y2 - ah * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

export class Burrower extends Entity {
    constructor(x, y, opts = {}) {
        const w = opts.w || 36;
        const h = opts.h || 36;
        super(x, y, w, h, 'burrower');
        this.id = opts.id || 'burrower';
        this.maxHp = Math.max(1, Math.round(opts.hp ?? 3));
        this.hp = this.maxHp;
        this.surfaceInterval = opts.surfaceInterval ?? 3;
        this.telegraphTime = opts.telegraphTime ?? 1;
        this.stunTime = opts.stunTime ?? 2;
        this.maxStunsPerLoop = normalizeMaxStunsPerLoop(opts.maxStunsPerLoop);
        this.stunsThisLoop = 0;
        this.corePlateIds = Array.isArray(opts.corePlateIds) ? [...opts.corePlateIds] : [];
        this.defeatDoorId = opts.defeatDoorId || 'boss_door';
        this.startX = x;
        this.startY = y;
        this.phase = 'burrow'; // burrow | telegraph | stun | dormant | defeated
        this.phaseTicks = 0;
        this.cycleTicks = 0;
        this.cycleLocked = false;
        this.clock = 0;
        this.footing = new Map();   // actor key -> surface key it stands on
        this.noise = new Map();     // actor key -> { tick, surface, kind, id }
        this.ripples = [];
        this.lockStart = null;
        this.lockedTile = null;
        this.teleOriginX = x;
        this.teleOriginY = y;
        this.defeated = false;
        this.stunFlash = 0;
        this.aimKind = null;
        this.aimId = null;
        this.aimX = null;
        this.aimY = null;
        this.previewTile = null;
        this.homeFallback = false;
        // Player mode: the courier drew the hunt, so the strike tile is the grid
        // tile under them (any floor), tracked until the telegraph starts.
        this.playerMode = false;
        this.lockClock = 0;
        this.strikeFail = null;
        this.feedback = null;
        const saved = state.bossCheckpointLive && state.bossCheckpoint ? state.bossCheckpoint[this.id] : null;
        if (saved && Number.isFinite(saved.hp)) this.hp = saved.hp;
        if (this.hp <= 0) {
            this.hp = 0;
            this.defeated = true;
            this.phase = 'defeated';
        }
    }

    intervalTicks() { return Math.max(1, burrowerTicks(this.surfaceInterval)); }
    telegraphTicks() { return Math.max(1, burrowerTicks(this.telegraphTime)); }
    stunTicks() { return burrowerTicks(this.stunTime); }

    surfaceInTicks() {
        if (this.phase === 'burrow') {
            return Math.max(0, this.intervalTicks() - this.cycleTicks) + this.telegraphTicks();
        }
        if (this.phase === 'telegraph') {
            return Math.max(0, this.telegraphTicks() - this.phaseTicks);
        }
        return 0;
    }

    loopClock() {
        const seconds = Number(state.currentLevelMeta?.loopTime);
        if (!Number.isFinite(seconds) || seconds <= 0) return null;
        // Round to the sim rate. 1000 / (1000/60) is not always exactly 60, and a
        // fractional tick would make Math.ceil jump the visible clock up a second.
        const tps = Math.max(1, Math.round(ticksPerSecond()));
        const cap = Math.round(seconds * tps);
        if (cap <= 0) return null;
        const ticks = Math.max(0, cap - (Number(state.currentTick) || 0));
        return { ticks, seconds: ticks / tps, cap };
    }

    getUiState() {
        const tps = ticksPerSecond();
        const stunTicksLeft = this.phase === 'stun' ? Math.max(0, this.stunTicks() - this.phaseTicks) : 0;
        const clock = this.loopClock();
        const dormant = this.phase === 'dormant';
        return {
            phase: this.phase,
            dormant,
            stunTicksLeft,
            stunSeconds: stunTicksLeft / tps,
            targetKind: this.aimKind,
            targetId: this.aimId,
            targetLabel: this.targetLabel(),
            huntKind: this.hunt ? this.hunt.kind : null,
            huntId: this.hunt ? this.hunt.id : null,
            huntByNoise: this.hunt ? this.hunt.byNoise : false,
            huntLabel: this.huntLabel(),
            surfaceInTicks: this.surfaceInTicks(),
            homeFallback: !!this.homeFallback,
            ...this.targetPointers(),
            loopTicksLeft: clock ? clock.ticks : null,
            loopSecondsLeft: clock ? clock.seconds : null,
            statusText: dormant
                ? ('DORMANT — wakes on rewind · ' + (clock ? `loop clock ${Math.ceil(clock.seconds)}s` : 'rewind to wake'))
                : null
        };
    }

    // One target, four pointers. The arrow, the dust ring, the countdown and the
    // highlighted core plate are all derived from the same aimed tile, so they
    // cannot point at different places.
    targetPointers() {
        const tile = (this.phase === 'burrow' || this.phase === 'telegraph') && !this.homeFallback ? this.aimedTile() : null;
        if (!tile) return { targetTile: null, ringTile: null, countdownTile: null, arrowTo: null, highlightPlateId: null };
        const t = tileOf(tile);
        return {
            targetTile: t,
            ringTile: t,
            countdownTile: t,
            arrowTo: { x: t.x + t.w / 2, y: t.y + t.h / 2 },
            highlightPlateId: this.corePlateBeside(t)
        };
    }

    corePlateBeside(tile) {
        if (!tile) return null;
        const ids = this.corePlateIds || [];
        for (const plate of state.plates || []) {
            if (ids.includes(plate.id) && orthoAdjacent(tile, plate)) return plate.id;
        }
        return null;
    }

    clearAim() {
        this.aimKind = null;
        this.aimId = null;
        this.aimX = null;
        this.aimY = null;
        this.previewTile = null;
        this.homeFallback = false;
    }

    noteAim(actor) {
        const info = actorTargetInfo(actor);
        this.aimKind = info.kind;
        this.aimId = info.id;
        if (!actor) {
            this.aimX = null;
            this.aimY = null;
            this.previewTile = null;
            return;
        }
        const c = center(actor);
        this.aimX = c.x;
        this.aimY = c.y;
        this.previewTile = this.nearestCrack(actor);
    }

    refreshAimPosition(actors) {
        if (this.aimKind == null) return;
        for (const actor of actors || []) {
            const info = actorTargetInfo(actor);
            if (info.kind === this.aimKind && info.id === this.aimId) {
                const c = center(actor);
                this.aimX = c.x;
                this.aimY = c.y;
                return;
            }
        }
    }

    rememberCheckpoint() {
        if (!state.bossCheckpoint || typeof state.bossCheckpoint !== 'object') state.bossCheckpoint = {};
        state.bossCheckpoint[this.id] = { hp: this.hp };
    }

    // Loudest wins: the live actor whose last step onto a crack or plate is the most
    // recent, if that step is under NOISE_TTL_TICKS old. Otherwise the live courier.
    pickTarget(actors) {
        return this.huntInfo(actors).actor;
    }

    noteHunt(actors) {
        const { actor, byNoise } = this.huntInfo(actors);
        if (!actor) { this.hunt = null; return; }
        const info = actorTargetInfo(actor);
        this.hunt = { x: actor.x, y: actor.y, w: actor.w || 30, h: actor.h || 30, kind: info.kind, id: info.id, byNoise };
    }

    huntLabel() {
        const h = this.hunt;
        if (!h || this.defeated || this.phase === 'dormant') return null;
        return `hunting ${whoName(h.kind, h.id)} ${h.byNoise ? '(noise)' : '(no noise yet)'}`;
    }

    huntInfo(actors) {
        let best = null;
        let bestTick = -Infinity;
        let player = null;
        for (const actor of actors || []) {
            if (!actor || actor.isActive === false || actor.isDestroyed) continue;
            const info = actorTargetInfo(actor);
            if (info.kind === 'player' && !player) player = actor;
            const n = this.noise.get(actorKey(actor));
            if (!n || this.clock - n.tick > NOISE_TTL_TICKS) continue;
            // Later actors win a same-tick tie, so an echo beats the courier only on
            // a genuinely simultaneous step (deterministic either way).
            if (n.tick >= bestTick) { best = actor; bestTick = n.tick; }
        }
        if (best) return { actor: best, byNoise: true };
        return { actor: player, byNoise: false };
    }

    // Cracks use the same AABB overlap the crack uses for weight, so any entry
    // that loads a tile (diagonal corners included) is also a noise. The tile
    // with the most overlap wins; ties go to the lowest x, then y.
    surfaceUnder(actor) {
        const c = center(actor);
        const inside = r => c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h;
        const ax = actor.x, ay = actor.y, aw = actor.w || 30, ah = actor.h || 30;
        let bestCrack = null;
        let bestArea = 0;
        for (const crack of state.cracks || []) {
            if (!crack || crack.broken) continue;
            const ox = Math.min(ax + aw, crack.x + crack.w) - Math.max(ax, crack.x);
            const oy = Math.min(ay + ah, crack.y + crack.h) - Math.max(ay, crack.y);
            if (ox <= 0 || oy <= 0) continue;
            const area = ox * oy;
            if (area > bestArea) { bestArea = area; bestCrack = crack; }
        }
        if (bestCrack) return { key: 'k' + bestCrack.x + ',' + bestCrack.y, kind: 'crack', tile: tileOf(bestCrack) };
        for (const plate of state.plates || []) {
            if (plate && inside(plate)) return { key: 'p' + (plate.id ?? plate.x + ',' + plate.y), kind: 'plate', tile: tileOf(plate) };
        }
        return null;
    }

    // A step = the actor's centre arriving on a crack or plate it was not on last tick.
    listen(actors) {
        this.clock++;
        const seen = new Set();
        for (const actor of actors || []) {
            if (!actor || actor.isActive === false || actor.isDestroyed) continue;
            const key = actorKey(actor);
            seen.add(key);
            const surf = this.surfaceUnder(actor);
            const prev = this.footing.get(key) || null;
            if (surf && surf.key !== prev) {
                const info = actorTargetInfo(actor);
                this.noise.set(key, { tick: this.clock, surface: surf.key, surfaceKind: surf.kind, kind: info.kind, id: info.id });
                const c = center(actor);
                this.ripples.push({ x: c.x, y: c.y, age: 0, kind: info.kind });
            }
            this.footing.set(key, surf ? surf.key : null);
        }
        for (const key of [...this.footing.keys()]) if (!seen.has(key)) this.footing.delete(key);
        for (const r of this.ripples) r.age++;
        this.ripples = this.ripples.filter(r => r.age < RIPPLE_TICKS);
    }

    crackIsTargetable(crack) {
        if (!crack || crack.broken || crack.collapsing) return false;
        if (typeof crack.overlapsPlate === 'function' && crack.overlapsPlate()) return false;
        return true;
    }

    nearestCrack(actor) {
        const aim = actor ? center(actor) : { x: this.startX + this.w / 2, y: this.startY + this.h / 2 };
        let best = null;
        let bestD = Infinity;
        let bestX = Infinity;
        let bestY = Infinity;
        for (const crack of state.cracks || []) {
            if (!this.crackIsTargetable(crack)) continue;
            const c = center(crack);
            const d = Math.hypot(c.x - aim.x, c.y - aim.y);
            const tie = Math.abs(d - bestD) <= 1e-6;
            const better = d < bestD - 1e-6 || (tie && (crack.x < bestX || (crack.x === bestX && crack.y < bestY)));
            if (better) {
                best = crack;
                bestD = d;
                bestX = crack.x;
                bestY = crack.y;
            }
        }
        return best ? tileOf(best) : null;
    }

    bodyCoversCrack(crack, actors) {
        // Inactive too: a body that just fell is still on the tile. Knitting that
        // hole would erase it under them. Targeting ignores inactive actors elsewhere.
        for (const actor of actors || []) {
            if (!actor) continue;
            const c = center(actor);
            if (c.x >= crack.x && c.x < crack.x + crack.w && c.y >= crack.y && c.y < crack.y + crack.h) return true;
        }
        return false;
    }

    // Knit spent cracks nobody is standing on, so a later telegraph has a real tile.
    // Occupied tiles stay spent: restoring a hole under a body would drop them in.
    restoreClearCracks(actors) {
        let restored = 0;
        for (const crack of state.cracks || []) {
            if (!crack || crack.overlapsPlate?.()) continue;
            if (!crack.broken && !crack.collapsing) continue;
            if (this.bodyCoversCrack(crack, actors)) continue;
            if (typeof crack.restoreIntact === 'function') crack.restoreIntact();
            else {
                crack.broken = false;
                crack.collapsing = false;
            }
            restored++;
        }
        return restored;
    }

    // Once a tile is locked it never moves. If that tile stops being a legal crack
    // (it broke or started collapsing) the cycle is called off: the mark clears,
    // the boss goes home and the next update locks a fresh tile with a full countdown.
    validateLock() {
        if (this.phase !== 'burrow' && this.phase !== 'telegraph') return true;
        if (!this.lockedTile || this.homeFallback || this.playerMode) return true;
        if (this.crackIsTargetable(this.findCrack(this.lockedTile))) return true;
        this.phase = 'burrow';
        this.phaseTicks = 0;
        this.cycleTicks = 0;
        this.cycleLocked = false;
        this.lockedTile = null;
        this.previewTile = null;
        this.lockStart = null;
        this.goHome();
        return false;
    }

    // Keep the locked tile when it is still a legal crack. Otherwise pick another,
    // knit clear tiles, or fall back to the den. Does not reset the countdown.
    ensureTarget(actors) {
        if (this.playerMode) return;
        const current = this.findCrack(this.lockedTile);
        if (this.crackIsTargetable(current)) {
            this.homeFallback = false;
            this.lockedTile = tileOf(current);
            return;
        }
        const aimActor = this.aimKind != null ? this.actorMatchingAim(actors) : null;
        const aim = aimActor || this.pickTarget(actors);
        let tile = this.nearestCrack(aim || null);
        if (!tile) {
            this.restoreClearCracks(actors);
            tile = this.nearestCrack(aim || null);
        }
        if (tile) {
            const moved = !sameTile(tile, this.lockedTile);
            this.lockedTile = tile;
            this.previewTile = tile;
            this.homeFallback = false;
            if (moved && this.phase === 'telegraph') {
                this.teleOriginX = this.x;
                this.teleOriginY = this.y;
            }
            return;
        }
        this.lockedTile = null;
        this.previewTile = null;
        this.homeFallback = true;
    }

    actorMatchingAim(actors) {
        if (this.aimKind == null) return null;
        for (const actor of actors || []) {
            const info = actorTargetInfo(actor);
            if (info.kind === this.aimKind && info.id === this.aimId) return actor;
        }
        return null;
    }

    findCrack(tile) {
        if (!tile) return null;
        return (state.cracks || []).find(c => sameTile(c, tile)) || null;
    }

    plateIsHot(plate, actors) {
        if (!plate) return false;
        if (plate.isPressed) return true;
        for (const actor of actors || []) {
            if (!actor || actor.isActive === false) continue;
            if (actorPressesPlate(actor, plate)) return true;
        }
        for (const pkg of state.packages || []) {
            if (!pkg || pkg.isDestroyed || pkg.carriedBy) continue;
            if (actorPressesPlate(pkg, plate)) return true;
        }
        return false;
    }

    // Stun: the strike lands on a crack beside a core plate while the live courier
    // holds that plate AND an echo stamped this crack within STAMP_WINDOW_TICKS.
    tileStuns(tile, actors) {
        if (!tile) return false;
        if (!this.echoStamped(tile, actors)) return false;
        const ids = this.corePlateIds || [];
        const player = (actors || []).find(a => a && a.isActive !== false && actorTargetInfo(a).kind === 'player');
        if (!player) return false;
        for (const plate of state.plates || []) {
            if (!ids.includes(plate.id)) continue;
            if (!orthoAdjacent(tile, plate)) continue;
            if (actorPressesPlate(player, plate)) return true;
        }
        return false;
    }

    echoStamped(tile, actors) {
        const key = 'k' + tile.x + ',' + tile.y;
        for (const actor of actors || []) {
            if (!actor || actor.isActive === false || actorTargetInfo(actor).kind !== 'echo') continue;
            const n = this.noise.get(actorKey(actor));
            if (!n || n.surface !== key) continue;
            if (this.footing.get(actorKey(actor)) !== key) continue;
            if (this.clock - n.tick < STAMP_WINDOW_TICKS) return true;
        }
        return false;
    }

    // An echo that stepped onto the locked crack this cycle but outside the window.
    echoEarly(tile, actors) {
        const key = 'k' + tile.x + ',' + tile.y;
        for (const actor of actors || []) {
            if (!actor || actorTargetInfo(actor).kind !== 'echo') continue;
            const n = this.noise.get(actorKey(actor));
            if (!n || n.surface !== key) continue;
            if (n.tick >= this.lockClock && this.clock - n.tick >= STAMP_WINDOW_TICKS) return true;
        }
        return false;
    }

    playerTile(actor) {
        const c = center(actor);
        return { x: Math.floor(c.x / GRID) * GRID, y: Math.floor(c.y / GRID) * GRID, w: GRID, h: GRID };
    }

    say(text, tile, color) {
        this.feedback = { text, x: tile.x + tile.w / 2, y: tile.y + tile.h + 14, ttl: FEEDBACK_TICKS, color };
    }

    // Keep the locked crack intact (no weight crumble) until the strike lands.
    holdLockedCrack() {
        for (const c of state.cracks || []) if (c) c.burrowerHold = false;
        if (this.playerMode || this.homeFallback) return;
        if (this.phase !== 'burrow' && this.phase !== 'telegraph') return;
        const crack = this.findCrack(this.lockedTile);
        if (crack && !crack.broken && !crack.collapsing) crack.burrowerHold = true;
    }

    openDefeatDoor() {
        const door = (state.doors || []).find(d => d.id === this.defeatDoorId);
        if (door) door.isOpen = true;
    }

    goHome() {
        this.x = this.startX;
        this.y = this.startY;
    }

    markLockedWarning() {
        const crack = this.findCrack(this.lockedTile);
        if (crack && typeof crack.showWarningRing === 'function') crack.showWarningRing();
    }

    // The tile (and actor) chosen when the countdown starts. Later movement does not re-aim.
    lockCycle(actor) {
        this.noteAim(actor);
        this.lockedTile = this.previewTile;
        this.cycleLocked = true;
        this.cycleTicks = 0;
    }

    beginTelegraph() {
        this.phase = 'telegraph';
        this.phaseTicks = 0;
        this.previewTile = this.homeFallback ? null : this.lockedTile;
        this.teleOriginX = this.x;
        this.teleOriginY = this.y;
        this.stunFlash = 0;
        this.cycleLocked = false;
        if (!this.homeFallback) this.markLockedWarning();
    }

    slideToTile() {
        const total = this.telegraphTicks();
        const t = Math.min(1, this.phaseTicks / total);
        let destX = this.startX;
        let destY = this.startY;
        const tile = this.lockedTile;
        if (tile && !this.homeFallback) {
            destX = tile.x + tile.w / 2 - this.w / 2;
            destY = tile.y + tile.h / 2 - this.h / 2;
        }
        this.x = this.teleOriginX + (destX - this.teleOriginX) * t;
        this.y = this.teleOriginY + (destY - this.teleOriginY) * t;
    }

    strike(actors) {
        if (this.homeFallback) {
            this.phase = 'burrow';
            this.phaseTicks = 0;
            this.cycleTicks = 0;
            this.cycleLocked = false;
            this.lockedTile = null;
            this.homeFallback = false;
            this.goHome();
            return;
        }
        const tile = this.lockedTile;
        const crack = this.findCrack(tile);
        if (crack) crack.burrowerHold = false;
        if (this.playerMode) {
            const player = (actors || []).find(a => a && a.isActive !== false && actorTargetInfo(a).kind === 'player');
            if (crack && this.crackIsTargetable(crack) && typeof crack.startCollapse === 'function') {
                crack.showWarningRing?.();
                crack.startCollapse();
            }
            if (player && tile) {
                const c = center(player);
                if (c.x >= tile.x && c.x < tile.x + tile.w && c.y >= tile.y && c.y < tile.y + tile.h) this.strikeFail = STRIKE_FAIL;
            }
            this.endCycle();
            return;
        }
        if (crack && this.crackIsTargetable(crack)) {
            if (typeof crack.showWarningRing === 'function') crack.showWarningRing();
            if (typeof crack.startCollapse === 'function') crack.startCollapse();
        }
        const stamped = tile ? this.echoStamped(tile, actors) : false;
        if (tile && stamped) this.say(this.tileStuns(tile, actors) ? 'STAMP OK' : 'STAMP OK · hold the CORE plate', tile, '#9dffb0');
        else if (tile && this.echoEarly(tile, actors)) this.say('TOO EARLY', tile, '#ff9a6a');
        if (this.tileStuns(tile, actors)) {
            this.hp -= 1;
            this.rememberCheckpoint();
            this.stunFlash = 20;
            if (this.hp <= 0) {
                this.hp = 0;
                this.defeated = true;
                this.phase = 'defeated';
                this.phaseTicks = 0;
                this.clearAim();
                this.openDefeatDoor();
                SFX.bossPhase();
            } else {
                this.phase = 'stun';
                this.phaseTicks = 0;
                SFX.bossPhase();
            }
            return;
        }
        this.endCycle();
    }

    endCycle() {
        this.phase = 'burrow';
        this.phaseTicks = 0;
        this.cycleTicks = 0;
        this.cycleLocked = false;
        this.lockedTile = null;
        this.previewTile = null;
        this.homeFallback = false;
        this.playerMode = false;
        this.goHome();
    }

    // Stun is a pause, then the surface cycle starts over from home.
    // A positive maxStunsPerLoop leaves the boss dormant until rewind instead.
    recoverFromStun() {
        this.stunsThisLoop += 1;
        this.phaseTicks = 0;
        this.cycleTicks = 0;
        this.cycleLocked = false;
        this.lockedTile = null;
        this.previewTile = null;
        this.goHome();
        const cap = this.maxStunsPerLoop;
        if (cap != null && this.stunsThisLoop >= cap) {
            this.phase = 'dormant';
            this.clearAim();
            SFX.burrowerDormant();
            return;
        }
        this.phase = 'burrow';
        this.cycleTicks = 0;
    }

    update(actors) {
        if (this.stunFlash > 0) this.stunFlash--;
        if (this.feedback && --this.feedback.ttl <= 0) this.feedback = null;
        this.strikeFail = null;
        try { this._update(actors); } finally { this.holdLockedCrack(); }
        return this.strikeFail;
    }

    _update(actors) {
        this.listen(actors);
        this.noteHunt(actors);
        if (this.defeated || this.hp <= 0) {
            this.defeated = true;
            this.phase = 'defeated';
            this.clearAim();
            this.openDefeatDoor();
            return;
        }
        if (this.phase === 'stun') {
            this.phaseTicks++;
            if (this.phaseTicks >= this.stunTicks()) this.recoverFromStun();
            return;
        }
        if (this.phase === 'dormant') return;
        if (this.phase === 'telegraph') {
            this.phaseTicks++;
            this.refreshAimPosition(actors);
            if (!this.validateLock()) return;
            if (!this.homeFallback) this.markLockedWarning();
            this.slideToTile();
            if (this.phaseTicks >= this.telegraphTicks()) this.strike(actors);
            return;
        }
        // Lock the strike tile once. Later movement never re-aims it. A locked tile
        // that breaks calls the cycle off (validateLock) instead of moving the mark.
        if (!this.cycleLocked) {
            // Loudest wins at lock time; the tile then never moves.
            const target = this.pickTarget(actors);
            if (target) this.noteAim(target);
            else this.clearAim();
            this.lockClock = this.clock;
            this.playerMode = !!target && actorTargetInfo(target).kind === 'player';
            if (this.playerMode) {
                this.lockedTile = this.playerTile(target);
                this.homeFallback = false;
            } else {
                this.ensureTarget(actors);
            }
            this.cycleLocked = true;
            this.lockStart = target ? center(target) : null;
            if (!this.homeFallback) this.previewTile = this.lockedTile;
        } else {
            if (this.aimKind == null) {
                const target = this.pickTarget(actors);
                if (target) this.noteAim(target);
            } else {
                this.refreshAimPosition(actors);
            }
            if (this.playerMode) {
                const p = this.actorMatchingAim(actors);
                if (p && p.isActive !== false) this.lockedTile = this.playerTile(p);
            }
            if (!this.validateLock()) return;
            this.previewTile = this.homeFallback ? null : this.lockedTile;
        }
        this.cycleTicks++;
        if (this.cycleTicks >= this.intervalTicks()) {
            this.cycleTicks = 0;
            this.beginTelegraph();
        }
    }

    aimedTile() {
        if (this.phase === 'telegraph' || this.phase === 'stun') return this.lockedTile;
        if (this.phase === 'burrow') return this.previewTile;
        return null;
    }

    drawHpPips(ctx, cx) {
        const dormant = this.phase === 'dormant';
        const pips = Math.max(this.maxHp, 1);
        const pipW = 8;
        const gap = 3;
        const total = pips * pipW + (pips - 1) * gap;
        let px = cx - total / 2;
        const py = this.y - 10;
        ctx.save();
        ctx.font = '9px "Space Grotesk", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = dormant ? '#9a958c' : '#ffb080';
        ctx.fillText('HP', px - 3, py + 2);
        for (let i = 0; i < pips; i++) {
            const filled = i < this.hp;
            ctx.fillStyle = !filled ? 'rgba(255,255,255,0.18)' : (dormant ? '#8a847c' : '#ff8844');
            ctx.fillRect(px, py, pipW, 4);
            px += pipW + gap;
        }
        ctx.restore();
    }

    // The arrow ends on the locked crack (the same tile as the dust ring and the
    // countdown), never on the lure's live position. The label names who drew it.
    drawTargetMark(ctx) {
        const ptr = this.targetPointers();
        if (!ptr.arrowTo) return;
        const color = this.aimKind === 'echo' ? '#e070ff' : '#3ee0ff';
        drawArrow(ctx, this.x + this.w / 2, this.y + this.h / 2, ptr.arrowTo.x, ptr.arrowTo.y, color);
        const text = this.targetLabel();
        if (text) {
            // Below the tile when there is no room above it, so it clears the HP pips.
            // Player mode: below the tile, so it clears the '!' over the courier.
            const above = ptr.targetTile.y - 10;
            const below = ptr.targetTile.y + ptr.targetTile.h + 10;
            const y = this.playerMode || above < 24 ? below : above;
            paintLabel(ctx, text, ptr.arrowTo.x, y, { color, h: 15 });
        }
    }

    // The locked strike tile, and whose noise it was locked on. The live hunt (who
    // the next lock goes to) is drawn separately by drawHunt.
    targetLabel() {
        const ptr = this.targetPointers();
        if (!ptr.targetTile) return null;
        if (this.playerMode) return this.phase === 'telegraph' ? 'STRIKES HERE · MOVE!' : 'STRIKES YOUR TILE';
        const who = whoName(this.aimKind, this.aimId);
        return who ? `STRIKES HERE · locked on ${who}` : 'STRIKES HERE';
    }

    // Dashed hunt line to the noisiest actor (it jumps the moment someone else makes
    // noise), a "!" over them, and "hunting ECHO 1 (noise)".
    drawHunt(ctx) {
        const h = this.hunt;
        let label = this.huntLabel();
        if (!h || !label) return;
        // In player mode the strike tile sits under the hunted courier and already
        // says so; one label there, not two stacked ones.
        const ptr = this.targetPointers();
        const near = ptr.targetTile && Math.abs((h.x + h.w / 2) - ptr.arrowTo.x) < 90 && Math.abs((h.y + h.h / 2) - ptr.arrowTo.y) < 70;
        if (near) label = null;
        const color = h.kind === 'echo' ? '#ff6ad5' : '#7af0ff';
        const hx = h.x + h.w / 2;
        const hy = h.y + h.h / 2;
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x + this.w / 2, this.y + this.h / 2);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.font = 'bold 20px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.beginPath();
        ctx.arc(hx, h.y - 14, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillText('!', hx, h.y - 13);
        ctx.restore();
        if (label) paintLabel(ctx, label, hx, h.y - 34, { color, h: 15 });
    }

    drawFeedback(ctx) {
        const f = this.feedback;
        if (!f) return;
        ctx.save();
        ctx.globalAlpha = Math.min(1, f.ttl / 20);
        paintLabel(ctx, f.text, f.x, f.y - (FEEDBACK_TICKS - f.ttl) * 0.3, { color: f.color, h: 18, font: 'bold 14px "Space Grotesk", sans-serif' });
        ctx.restore();
    }

    // Loop 1 (no echoes yet): a small REC badge on each crack beside a core
    // plate says what to record, instead of a paragraph of text.
    drawRecordCue(ctx) {
        if ((state.pastRuns || []).length > 0 || this.defeated) return;
        const ids = this.corePlateIds || [];
        for (const plate of state.plates || []) {
            if (!plate || !ids.includes(plate.id)) continue;
            const cx = plate.x + (plate.w || 40) / 2;
            // Above the ring's north crack, one badge per core plate.
            const y = plate.y - (plate.h || 40) - 10;
            ctx.save();
            ctx.fillStyle = '#ff4060';
            ctx.beginPath();
            ctx.arc(cx - 34, Math.max(12, y), 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            paintLabel(ctx, 'REC stamp', cx + 2, Math.max(12, y), { color: '#ffd0d8', h: 13, font: 'bold 10px "Space Grotesk", sans-serif' });
        }
    }

    // Noise ripples: an expanding ring under anyone who steps onto a crack or plate.
    drawRipples(ctx) {
        if (!this.ripples || !this.ripples.length) return;
        ctx.save();
        for (const r of this.ripples) {
            const t = r.age / RIPPLE_TICKS;
            ctx.globalAlpha = Math.max(0, 0.9 * (1 - t));
            ctx.strokeStyle = r.kind === 'echo' ? '#ff6ad5' : '#7af0ff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(r.x, r.y + 10, 8 + t * 30, 4 + t * 14, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawSurfaceMark(ctx) {
        if (this.phase !== 'burrow' && this.phase !== 'telegraph') return;
        const ui = this.getUiState();
        const total = this.intervalTicks() + this.telegraphTicks();
        const frac = total > 0 ? 1 - ui.surfaceInTicks / total : 0;
        if (this.homeFallback) {
            const den = { x: this.startX + this.w / 2 - 20, y: this.startY + this.h / 2 - 20, w: 40, h: 40 };
            drawKillRing(ctx, den, undefined, 'rgba(180, 180, 170, 0.9)');
            const cx = den.x + den.w / 2;
            const cy = den.y + den.h / 2;
            const secs = (ui.surfaceInTicks / ticksPerSecond());
            paintLabel(ctx, 'DEN ' + secs.toFixed(1) + 's', cx, cy, { color: '#f2f2ea', h: 14, font: 'bold 11px "Space Grotesk", sans-serif' });
            return;
        }
        const tile = this.aimedTile();
        if (!tile) return;
        drawKillRing(ctx, tile, undefined, 'rgba(255, 196, 90, 0.95)');
        const z = killZone(tile);
        const cx = z.x + z.w / 2;
        const cy = z.y + z.h / 2;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 244, 210, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(4, Math.min(z.w, z.h) / 2 - 2), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, frac)));
        ctx.stroke();
        ctx.restore();
        const secs = (ui.surfaceInTicks / ticksPerSecond());
        paintLabel(ctx, secs.toFixed(1) + 's', cx, cy, { color: '#fff6d8', h: 14, font: 'bold 11px "Space Grotesk", sans-serif' });
    }

    render(ctx) {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const tick = state.currentTick || 0;
        const dormant = this.phase === 'dormant';
        ctx.save();
        this.drawSurfaceMark(ctx);

        if (this.phase === 'stun' || this.stunFlash > 0) {
            const flash = 0.35 + 0.45 * Math.abs(Math.sin(tick * 0.7));
            ctx.fillStyle = `rgba(255, 230, 90, ${this.phase === 'stun' ? flash : 0.35})`;
            ctx.beginPath();
            ctx.arc(cx, cy, this.w * 0.62, 0, Math.PI * 2);
            ctx.fill();
        }

        const bob = this.phase === 'burrow' ? Math.sin(tick * 0.15) * 3 : 0;
        const sink = dormant ? 10 : 0;
        ctx.fillStyle = this.defeated ? 'rgba(80, 70, 60, 0.7)' : dormant ? 'rgba(72, 70, 66, 0.95)' : 'rgba(40, 28, 18, 0.92)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + bob + sink, this.w * (dormant ? 0.52 : 0.46), this.h * (dormant ? 0.16 : 0.32), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = dormant ? '#6e6a64' : this.phase === 'stun' ? '#ffdd00' : '#e6c27a';
        ctx.lineWidth = this.phase === 'stun' ? 3 : 1.5;
        ctx.stroke();

        if (this.phase === 'burrow') {
            for (let i = 0; i < 3; i++) {
                const rise = (tick * 0.65 + i * 14) % 26;
                const alpha = Math.max(0, 1 - rise / 26);
                const bx = cx + Math.sin(tick * 0.11 + i * 2.1) * 9;
                const by = cy + 6 - rise;
                ctx.beginPath();
                ctx.fillStyle = `rgba(150, 110, 60, ${0.45 * alpha})`;
                ctx.arc(bx, by, 2.2 + (i % 2), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        if (this.phase === 'stun') {
            const ui = this.getUiState();
            const total = Math.max(1, this.stunTicks());
            const frac = ui.stunTicksLeft / total;
            ctx.save();
            ctx.strokeStyle = '#ffe14a';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(cx, cy, this.w * 0.78, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
            ctx.stroke();
            ctx.fillStyle = '#ffe14a';
            for (let i = 0; i < 3; i++) {
                const a = tick * 0.18 + i * (Math.PI * 2 / 3);
                drawStar(ctx, cx + Math.cos(a) * (this.w * 0.85), cy - 18 + Math.sin(a) * 7, 5);
            }
            ctx.restore();
            const barW = 36;
            const barX = cx - barW / 2;
            const barY = this.y - 28;
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(barX, barY, barW, 5);
            ctx.fillStyle = '#ffe14a';
            ctx.fillRect(barX, barY, barW * frac, 5);
            paintLabel(ctx, `STUN ${ui.stunSeconds.toFixed(1)}s`, cx, this.y - 40, { color: '#fff3a8', h: 15 });
        }

        if (dormant) {
            const ui = this.getUiState();
            const clock = ui.loopSecondsLeft;
            const frac = ui.loopTicksLeft == null ? 1 : (this.loopClock().cap > 0 ? ui.loopTicksLeft / this.loopClock().cap : 0);
            ctx.save();
            ctx.strokeStyle = '#c8c2b8';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, this.w * 0.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, frac)));
            ctx.stroke();
            ctx.restore();
            const clockText = clock == null ? 'rewind to wake' : `loop clock ${Math.ceil(clock)}s`;
            paintLabel(ctx, 'DORMANT — wakes on rewind', cx, this.y - 40, { color: '#f3efe6', h: 16, font: 'bold 11px "Space Grotesk", sans-serif' });
            paintLabel(ctx, clockText, cx, this.y - 22, { color: '#ffe7a3', h: 15, font: 'bold 12px "Space Grotesk", sans-serif' });
        }

        this.drawHpPips(ctx, cx);
        // Last, so the boss body and HP pips never cover the labels.
        this.drawRipples(ctx);
        this.drawRecordCue(ctx);
        this.drawTargetMark(ctx);
        this.drawHunt(ctx);
        this.drawFeedback(ctx);
        ctx.restore();
    }
}
