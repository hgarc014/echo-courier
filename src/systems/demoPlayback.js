import { state } from '../core/state.js';
import { stick, tapKey, consumeKey, setGameplayInputLocked, clearStick } from '../core/input.js';
import { AABB } from '../core/physics.js';

const GAMEPLAY_KEYS = ['w', 'a', 's', 'd', 'space', 'r', 'q', 'shift', 'f', 'c'];

let active = false;
let steps = [];
let stepIndex = 0;
let waitLeft = 0;
let untilLeft = 0;
let skippable = true;
let persistKey = null;
let pendingSkip = false;
let uiBound = false;
let captionText = '';
let presentationMode = 'overlay'; // 'overlay' | 'popup'
let demoTitle = '';
let onPopupDismiss = null;
let popupWorld = null;
let stopping = false;

export function isDemoActive() {
    return active;
}

export function isPopupDemo() {
    return active && presentationMode === 'popup';
}

export function getActiveDemoSteps() {
    return active ? steps : [];
}

export function setPopupDemoWorld(world) {
    popupWorld = world || null;
}

export function clearPopupDemoWorld() {
    popupWorld = null;
}

export function getPopupDemoWorld() {
    return popupWorld;
}

export function canSkipDemo() {
    return active && skippable;
}

export function demoStorageKey(levelIndex, name) {
    if (levelIndex === 0 || levelIndex) return `echoCourier_demoSeen_${levelIndex}`;
    if (name) return `echoCourier_demoSeen_${String(name).replace(/\s+/g, '_')}`;
    return null;
}

export function hasSeenDemo(key) {
    if (!key) return false;
    try { return localStorage.getItem(key) === '1'; }
    catch { return false; }
}

export function markDemoSeen(key) {
    if (!key) return;
    try { localStorage.setItem(key, '1'); }
    catch { /* ignore quota / private mode */ }
}

export function initDemoPlayback() {
    if (uiBound) return;
    uiBound = true;
    const bind = (id, handler) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handler();
        });
    };
    bind('demo-skip-btn', () => {
        if (!active || !skippable) return;
        pendingSkip = true;
    });
    bind('demo-close-btn', () => {
        if (!active) return;
        // Close always dismisses popup demos even when not skippable
        if (presentationMode === 'popup') {
            stopDemo({ markSeen: false, skipped: true });
            return;
        }
        pendingSkip = true;
    });
    const overlay = document.getElementById('demo-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (!active || presentationMode !== 'popup' || e.target !== overlay) return;
            e.preventDefault();
            e.stopPropagation();
            stopDemo({ markSeen: false, skipped: true });
        });
    }
}

export function startDemo(demo, opts = {}) {
    initDemoPlayback();
    const cfg = demo && typeof demo === 'object' ? demo : null;
    const nextSteps = Array.isArray(cfg?.steps) ? cfg.steps.filter(s => s && typeof s === 'object') : [];
    if (!nextSteps.length) {
        stopDemo({ markSeen: false });
        return false;
    }
    active = true;
    steps = nextSteps;
    stepIndex = 0;
    waitLeft = 0;
    untilLeft = 0;
    skippable = cfg.skippable !== false;
    persistKey = opts.persistKey || null;
    pendingSkip = false;
    captionText = '';
    presentationMode = opts.mode === 'popup' ? 'popup' : 'overlay';
    demoTitle = opts.title || cfg.title || (presentationMode === 'popup' ? 'Hint Demo' : '');
    onPopupDismiss = typeof opts.onDismiss === 'function' ? opts.onDismiss : null;
    if (presentationMode !== 'popup') {
        clearPopupDemoWorld();
        setGameplayInputLocked(true);
        consumeGameplayKeys();
        holdStick(0, 0);
    }
    setHighlight(null);
    setCaption('');
    showOverlay(true);
    document.body.classList.add('demo-playing');
    beginStep(steps[0]);
    return true;
}

export function stopDemo(opts = {}) {
    if (stopping) return;
    if (!active) {
        clearPopupDemoWorld();
        return;
    }
    stopping = true;
    try {
        const mark = opts.markSeen !== false;
        if (mark) markDemoSeen(persistKey);
        const dismiss = onPopupDismiss;
        const wasPopup = presentationMode === 'popup';
        active = false;
        steps = [];
        stepIndex = 0;
        waitLeft = 0;
        untilLeft = 0;
        pendingSkip = false;
        persistKey = null;
        captionText = '';
        presentationMode = 'overlay';
        demoTitle = '';
        onPopupDismiss = null;
        clearPopupDemoWorld();
        setGameplayInputLocked(false);
        if (!wasPopup) {
            consumeGameplayKeys();
            clearStick();
        }
        setHighlight(null);
        setCaption('');
        showOverlay(false);
        document.body.classList.remove('demo-playing');
        document.body.classList.remove('demo-popup');
        if (wasPopup && dismiss && opts.invokeDismiss !== false) {
            try { dismiss({ skipped: !!opts.skipped, marked: mark }); } catch (err) { console.warn(err); }
        }
    } finally {
        stopping = false;
    }
}

export function skipDemo() {
    if (!active) return false;
    if (!skippable) return false;
    pendingSkip = true;
    return true;
}

/**
 * Drive one demo tick. Call at the start of PLAYING gameplay, before reading
 * movement / ability keys. Injects stick + tapKey; returns { done, skipped }
 * when the script finished so the caller can restartLevel().
 */
export function tickDemo() {
    if (!active) return null;
    if (pendingSkip) {
        pendingSkip = false;
        if (skippable || presentationMode === 'popup') {
            stopDemo({ markSeen: skippable, skipped: true });
            return { done: true, skipped: true };
        }
    }

    if (presentationMode === 'popup') return tickPopupDemo();

    consumeGameplayKeys();
    holdStick(0, 0);

    // Chain instant steps in one tick so press-key is still just-pressed
    // when the game loop reads it. Consume keys only once, before inject.
    let guard = 0;
    while (active && guard++ < 32) {
        const step = steps[stepIndex];
        if (!step) {
            stopDemo({ markSeen: true });
            return { done: true, skipped: false };
        }
        if (!runStep(step)) return null;
        stepIndex++;
        if (stepIndex >= steps.length) {
            stopDemo({ markSeen: true });
            return { done: true, skipped: false };
        }
        beginStep(steps[stepIndex]);
    }
    return null;
}

function tickPopupDemo() {
    if (popupWorld) popupWorld.currentTick = (popupWorld.currentTick || 0) + 1;
    let guard = 0;
    let finished = null;
    while (active && guard++ < 32) {
        const step = steps[stepIndex];
        if (!step) {
            stopDemo({ markSeen: true });
            finished = { done: true, skipped: false };
            break;
        }
        if (!runStep(step)) break;
        stepIndex++;
        if (stepIndex >= steps.length) {
            stopDemo({ markSeen: true });
            finished = { done: true, skipped: false };
            break;
        }
        beginStep(steps[stepIndex]);
    }
    if (popupWorld) {
        syncPopupCarry(popupWorld);
        syncPopupPlates(popupWorld);
    }
    return finished;
}

function beginStep(step) {
    if (!step) return;
    const type = step.type;
    if (type === 'wait') {
        waitLeft = Math.max(0, Number(step.ticks) || 0);
    } else if (type === 'wait-until') {
        untilLeft = step.timeout == null ? Infinity : Math.max(0, Number(step.timeout) || 0);
    } else {
        waitLeft = 0;
        untilLeft = 0;
    }
    if (type === 'caption') setCaption(step.text || '');
    if (type === 'clear-caption') setCaption('');
    if (type === 'highlight-ui') setHighlight(step.target == null ? null : step.target);
}

function runStep(step) {
    switch (step.type) {
        case 'caption':
            setCaption(step.text || '');
            return true;
        case 'clear-caption':
            setCaption('');
            return true;
        case 'highlight-ui':
            setHighlight(step.target == null ? null : step.target);
            return true;
        case 'press-key':
        case 'press-ability': {
            const key = normalizeKey(step.key || step.ability);
            if (presentationMode === 'popup') {
                applyPopupPress(key);
            } else if (key) {
                tapKey(key);
            }
            return true;
        }
        case 'wait':
            if (waitLeft <= 0) return true;
            waitLeft--;
            return waitLeft <= 0;
        case 'wait-until':
            if (conditionMet(step)) return true;
            if (untilLeft !== Infinity) {
                if (untilLeft <= 0) return true;
                untilLeft--;
            }
            return false;
        case 'move-to':
            return seekTo(step);
        case 'end':
            return true;
        default:
            return true;
    }
}

function seekTo(step) {
    if (presentationMode === 'popup') return seekPopupTo(step);
    const player = state.player;
    if (!player) return true;
    const tx = Number(step.x);
    const ty = Number(step.y);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return true;
    // x,y are player top-left destinations (player is 30×30).
    const dx = tx - player.x;
    const dy = ty - player.y;
    const dist = Math.hypot(dx, dy);
    const tolerance = step.tolerance == null ? 12 : Number(step.tolerance);
    if (dist <= Math.max(0, tolerance)) {
        holdStick(0, 0);
        return true;
    }
    holdStick(dx / dist, dy / dist);
    return false;
}

function seekPopupTo(step) {
    const world = popupWorld;
    const player = world?.player;
    if (!player) return true;
    const tx = Number(step.x);
    const ty = Number(step.y);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return true;
    const dx = tx - player.x;
    const dy = ty - player.y;
    const dist = Math.hypot(dx, dy);
    const tolerance = step.tolerance == null ? 12 : Number(step.tolerance);
    if (dist <= Math.max(0, tolerance)) {
        player.moving = false;
        return true;
    }
    const speed = 4; // PLAYER_MOVE_SPEED
    const nx = dx / dist;
    const ny = dy / dist;
    const stepDist = Math.min(speed, dist);
    player.x += nx * stepDist;
    player.y += ny * stepDist;
    player.facingX = Math.abs(nx) >= Math.abs(ny) ? (nx > 0 ? 1 : -1) : 0;
    player.facingY = Math.abs(ny) > Math.abs(nx) ? (ny > 0 ? 1 : -1) : 0;
    if (player.facingX === 0 && player.facingY === 0) player.facingX = 1;
    player.moving = true;
    return false;
}

function applyPopupPress(key) {
    const world = popupWorld;
    if (!world || !key) return;
    if (key === 'r') {
        // Spawn a stationary ghost holding the plate under the demo player; open linked doors.
        const p = world.player;
        if (!p) return;
        const ghost = {
            x: p.x, y: p.y, w: p.w || 30, h: p.h || 30,
            isActive: true,
            facingX: p.facingX || 1,
            facingY: p.facingY || 0,
            render(ctx) {
                ctx.save();
                ctx.globalAlpha = 0.55;
                ctx.fillStyle = '#7df9ff';
                ctx.fillRect(this.x, this.y, this.w, this.h);
                ctx.restore();
            }
        };
        if (!Array.isArray(world.activeGhosts)) world.activeGhosts = [];
        world.activeGhosts.push(ghost);
        syncPopupPlates(world);
        return;
    }
    if (key === 'space') {
        const p = world.player;
        if (!p) return;
        for (const pkg of world.packages || []) {
            if (pkg.isDestroyed) continue;
            if (pkg.carriedBy && pkg.carriedBy !== 'player') continue;
            if (!AABB(p.x, p.y, p.w, p.h, pkg.x, pkg.y, pkg.w, pkg.h)) continue;
            pkg.carriedBy = 'player';
            p.carrying = true;
            if (typeof pkg.onPickup === 'function') pkg.onPickup();
            break;
        }
    }
}

function syncPopupCarry(world) {
    if (!world?.player) return;
    const carried = (world.packages || []).find(p => p.carriedBy === 'player');
    world.player.carrying = !!carried;
    if (carried) {
        carried.x = world.player.x + (world.player.w - carried.w) / 2;
        carried.y = world.player.y + (world.player.h - carried.h) / 2;
    }
}

function syncPopupPlates(world) {
    if (!world) return;
    const actors = [];
    if (world.player) actors.push(world.player);
    for (const g of world.activeGhosts || []) if (g && g.isActive !== false) actors.push(g);
    for (const plate of world.plates || []) {
        let pressed = false;
        for (const a of actors) {
            if (AABB(plate.x, plate.y, plate.w, plate.h, a.x, a.y, a.w, a.h)) { pressed = true; break; }
        }
        plate.isPressed = pressed;
        const ids = plate.linkedIds || (plate.linkedId ? [plate.linkedId] : []);
        for (const id of ids) {
            for (const d of world.doors || []) if (d.id === id) d.isOpen = pressed;
            for (const l of world.lasers || []) if (l.id === id) l.isOpen = pressed;
        }
    }
}

function conditionMet(step) {
    const popup = presentationMode === 'popup';
    const doors = popup ? (popupWorld?.doors || []) : (state.doors || []);
    const plates = popup ? (popupWorld?.plates || []) : (state.plates || []);
    const ghosts = popup ? (popupWorld?.activeGhosts || []) : (state.activeGhosts || []);
    const packages = popup ? (popupWorld?.packages || []) : (state.packages || []);
    const condition = step.condition;
    if (condition === 'door-open') {
        if (step.doorId) {
            const door = doors.find(d => d.id === step.doorId);
            return !!(door && door.isOpen);
        }
        return doors.some(d => d.isOpen);
    }
    if (condition === 'ghost-on-plate') {
        const plate = plates.find(p => !step.plateId || p.id === step.plateId) || plates[0];
        if (!plate) return false;
        return ghosts.some(g =>
            g.isActive && AABB(plate.x, plate.y, plate.w, plate.h, g.x, g.y, g.w, g.h)
        );
    }
    if (condition === 'carrying') {
        return packages.some(p => p.carriedBy === 'player');
    }
    return true;
}

function normalizeKey(key) {
    if (!key) return null;
    const k = String(key).toLowerCase();
    if (k === 'loop' || k === 'reset' || k === 'resetrun') return 'r';
    if (k === 'grab' || k === 'pickup' || k === 'interact') return 'space';
    return k;
}

function consumeGameplayKeys() {
    for (const key of GAMEPLAY_KEYS) consumeKey(key);
}

function holdStick(x, y) {
    stick.active = true;
    stick.x = x;
    stick.y = y;
}

function showOverlay(on) {
    const overlay = document.getElementById('demo-overlay');
    if (overlay) {
        overlay.classList.toggle('hidden', !on);
        overlay.classList.toggle('demo-overlay-popup', on && presentationMode === 'popup');
        overlay.classList.toggle('demo-overlay-full', on && presentationMode !== 'popup');
    }
    document.body.classList.toggle('demo-popup', on && presentationMode === 'popup');
    document.body.classList.toggle('demo-playing', on);
    const panel = document.getElementById('demo-popup-panel');
    if (panel) panel.classList.toggle('hidden', !on);
    const titleEl = document.getElementById('demo-title');
    if (titleEl) {
        titleEl.textContent = demoTitle || 'Demo';
        titleEl.classList.toggle('hidden', !on || !demoTitle);
    }
    const btn = document.getElementById('demo-skip-btn');
    if (btn) {
        btn.classList.toggle('hidden', !on || !skippable);
        btn.disabled = !on || !skippable;
    }
    const closeBtn = document.getElementById('demo-close-btn');
    if (closeBtn) {
        closeBtn.classList.toggle('hidden', !on || presentationMode !== 'popup');
    }
}

function setCaption(text) {
    captionText = text || '';
    const el = document.getElementById('demo-caption');
    if (!el) return;
    el.textContent = captionText;
    el.classList.toggle('hidden', !captionText);
}

function setHighlight(target) {
    document.querySelectorAll('.touch-btn.demo-highlight').forEach(el => {
        el.classList.remove('demo-highlight');
    });
    if (target == null || target === '' || target === 'none') return;
    const key = normalizeKey(target);
    if (!key) return;
    document.querySelectorAll(`.touch-btn[data-key="${key}"]`).forEach(el => {
        el.classList.add('demo-highlight');
    });
}
