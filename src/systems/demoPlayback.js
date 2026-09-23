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

export function isDemoActive() {
    return active;
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
    const btn = document.getElementById('demo-skip-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!active || !skippable) return;
        pendingSkip = true;
    });
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
    setGameplayInputLocked(true);
    consumeGameplayKeys();
    holdStick(0, 0);
    setHighlight(null);
    setCaption('');
    showOverlay(true);
    document.body.classList.add('demo-playing');
    beginStep(steps[0]);
    return true;
}

export function stopDemo(opts = {}) {
    const mark = opts.markSeen !== false;
    if (mark) markDemoSeen(persistKey);
    active = false;
    steps = [];
    stepIndex = 0;
    waitLeft = 0;
    untilLeft = 0;
    pendingSkip = false;
    persistKey = null;
    captionText = '';
    setGameplayInputLocked(false);
    consumeGameplayKeys();
    clearStick();
    setHighlight(null);
    setCaption('');
    showOverlay(false);
    document.body.classList.remove('demo-playing');
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
        if (skippable) {
            stopDemo({ markSeen: true });
            return { done: true, skipped: true };
        }
    }

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
            if (key) tapKey(key);
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

function conditionMet(step) {
    const condition = step.condition;
    if (condition === 'door-open') {
        const doors = state.doors || [];
        if (step.doorId) {
            const door = doors.find(d => d.id === step.doorId);
            return !!(door && door.isOpen);
        }
        return doors.some(d => d.isOpen);
    }
    if (condition === 'ghost-on-plate') {
        const plate = (state.plates || []).find(p => !step.plateId || p.id === step.plateId) || (state.plates || [])[0];
        if (!plate) return false;
        return (state.activeGhosts || []).some(g =>
            g.isActive && AABB(plate.x, plate.y, plate.w, plate.h, g.x, g.y, g.w, g.h)
        );
    }
    if (condition === 'carrying') {
        return (state.packages || []).some(p => p.carriedBy === 'player');
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
    if (overlay) overlay.classList.toggle('hidden', !on);
    const btn = document.getElementById('demo-skip-btn');
    if (btn) {
        btn.classList.toggle('hidden', !on || !skippable);
        btn.disabled = !on || !skippable;
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
