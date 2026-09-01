export const keys = { w: false, a: false, s: false, d: false, space: false, r: false, q: false, shift: false, f: false, c: false, esc: false, enter: false };
export const prevKeys = { ...keys };
const justPressed = { ...keys };
const pendingRelease = { ...keys };

const CODE_TO_KEY = {
    KeyW: 'w', ArrowUp: 'w',
    KeyA: 'a', ArrowLeft: 'a',
    KeyS: 's', ArrowDown: 's',
    KeyD: 'd', ArrowRight: 'd',
    Space: 'space',
    KeyR: 'r',
    KeyQ: 'q',
    ShiftLeft: 'shift', ShiftRight: 'shift',
    KeyF: 'f',
    KeyC: 'c',
    Escape: 'esc',
    Enter: 'enter', NumpadEnter: 'enter',
};

const STICK_DEADZONE = 0.14;

export const stick = { x: 0, y: 0, active: false };

let touchUiLocked = false;
let lastAdvanceAt = 0;

function pressKey(key) {
    if (!Object.prototype.hasOwnProperty.call(keys, key)) return;
    if (!keys[key]) justPressed[key] = true;
    keys[key] = true;
    pendingRelease[key] = false;
}

function queueRelease(key) {
    if (!Object.prototype.hasOwnProperty.call(keys, key)) return;
    pendingRelease[key] = true;
}

function tapKey(key) {
    pressKey(key);
    queueRelease(key);
}

function shouldPreventDefault(e, key) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
    return key === 'space' || key === 'w' || key === 'a' || key === 's' || key === 'd';
}

window.addEventListener('keydown', e => {
    const key = CODE_TO_KEY[e.code];
    if (!key) return;
    if (shouldPreventDefault(e, key)) e.preventDefault();
    if (e.repeat) {
        keys[key] = true;
        pendingRelease[key] = false;
        return;
    }
    pressKey(key);
});

window.addEventListener('keyup', e => {
    const key = CODE_TO_KEY[e.code];
    if (!key) return;
    queueRelease(key);
});

export function isKeyJustPressed(key) {
    return !!(justPressed[key] || (keys[key] && !prevKeys[key]));
}

export function updatePrevKeys() {
    Object.assign(prevKeys, keys);
    for (const key of Object.keys(keys)) {
        justPressed[key] = false;
        if (pendingRelease[key]) {
            keys[key] = false;
            pendingRelease[key] = false;
        }
    }
}

/** Swallow a key so the current keydown cannot edge-trigger gameplay (e.g. SPACE grab after dialog). */
export function consumeKey(key) {
    if (!Object.prototype.hasOwnProperty.call(keys, key)) return;
    keys[key] = false;
    justPressed[key] = false;
    pendingRelease[key] = false;
    prevKeys[key] = true;
}

export function getMoveVector() {
    if (stick.active) return { x: stick.x, y: stick.y };
    return {
        x: (keys.d ? 1 : 0) - (keys.a ? 1 : 0),
        y: (keys.s ? 1 : 0) - (keys.w ? 1 : 0)
    };
}

export function requestAdvance() {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now - lastAdvanceAt < 280) return false;
    lastAdvanceAt = now;
    tapKey('enter');
    return true;
}

export function prefersTouchUi() {
    const maxTouch = navigator.maxTouchPoints || 0;
    const coarse = window.matchMedia('(any-pointer: coarse)').matches;
    const noHover = window.matchMedia('(hover: none)').matches;
    const phoneWidth = window.matchMedia('(max-width: 700px)').matches;
    const phoneHeight = window.matchMedia('(max-height: 500px)').matches;
    return coarse || (noHover && maxTouch > 0) || (maxTouch > 0 && (phoneWidth || phoneHeight));
}

export function syncTouchUi() {
    const on = touchUiLocked || prefersTouchUi();
    document.body.classList.toggle('touch-ui', on);
    const controls = document.getElementById('mobile-controls');
    if (controls) controls.setAttribute('aria-hidden', on ? 'false' : 'true');
    return on;
}

function bindHoldButton(el) {
    if (!el) return;
    const heldPointers = new Set();

    const down = (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const key = el.getAttribute('data-key');
        if (!key) return;
        e.preventDefault();
        e.stopPropagation();
        try { el.setPointerCapture?.(e.pointerId); } catch (_) {}
        heldPointers.add(e.pointerId);
        pressKey(key);
        el.classList.add('is-pressed');
    };

    const up = (e) => {
        if (!heldPointers.has(e.pointerId)) return;
        heldPointers.delete(e.pointerId);
        const key = el.getAttribute('data-key');
        if (key && heldPointers.size === 0) queueRelease(key);
        if (heldPointers.size === 0) el.classList.remove('is-pressed');
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
}

function bindStick(zone) {
    if (!zone) return;
    const base = zone.querySelector('.touch-stick-base');
    const knob = zone.querySelector('.touch-stick-knob');
    let activeId = null;
    let originX = 0;
    let originY = 0;
    let maxR = 40;

    const resetStick = () => {
        activeId = null;
        stick.active = false;
        stick.x = 0;
        stick.y = 0;
        zone.classList.remove('is-pressed');
        if (base) {
            base.style.left = '50%';
            base.style.top = '50%';
            base.style.transform = 'translate(-50%, -50%)';
        }
        if (knob) knob.style.transform = 'translate(-50%, -50%)';
    };

    const placeOrigin = (clientX, clientY) => {
        const zoneRect = zone.getBoundingClientRect();
        const size = base ? base.offsetWidth : Math.min(zoneRect.width, zoneRect.height) * 0.72;
        let x = clientX - zoneRect.left - size / 2;
        let y = clientY - zoneRect.top - size / 2;
        x = Math.max(0, Math.min(zoneRect.width - size, x));
        y = Math.max(0, Math.min(zoneRect.height - size, y));
        if (base) {
            base.style.transform = 'none';
            base.style.left = `${x}px`;
            base.style.top = `${y}px`;
        }
        originX = zoneRect.left + x + size / 2;
        originY = zoneRect.top + y + size / 2;
        maxR = Math.max(28, size * 0.34);
    };

    const applyPointer = (clientX, clientY) => {
        let dx = clientX - originX;
        let dy = clientY - originY;
        const len = Math.hypot(dx, dy) || 1;
        if (len > maxR) {
            dx = (dx / len) * maxR;
            dy = (dy / len) * maxR;
        }
        if (knob) knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        let nx = dx / maxR;
        let ny = dy / maxR;
        const mag = Math.hypot(nx, ny);
        if (mag < STICK_DEADZONE) {
            stick.x = 0;
            stick.y = 0;
        } else {
            const usable = Math.min(1, (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE));
            stick.x = (nx / mag) * usable;
            stick.y = (ny / mag) * usable;
        }
        stick.active = true;
    };

    zone.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        activeId = e.pointerId;
        try { zone.setPointerCapture?.(e.pointerId); } catch (_) {}
        zone.classList.add('is-pressed');
        placeOrigin(e.clientX, e.clientY);
        applyPointer(e.clientX, e.clientY);
    });

    zone.addEventListener('pointermove', (e) => {
        if (e.pointerId !== activeId) return;
        e.preventDefault();
        applyPointer(e.clientX, e.clientY);
    });

    const end = (e) => {
        if (e.pointerId !== activeId) return;
        resetStick();
    };

    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', (e) => {
        if (e.pointerId === activeId) resetStick();
    });
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function initTouchControls() {
    syncTouchUi();

    const lockFromPointer = (e) => {
        if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
        if (touchUiLocked) return;
        touchUiLocked = true;
        syncTouchUi();
    };
    window.addEventListener('pointerdown', lockFromPointer, { passive: true });

    window.addEventListener('resize', () => syncTouchUi());
    window.addEventListener('orientationchange', () => {
        window.setTimeout(syncTouchUi, 80);
    });
    window.matchMedia('(any-pointer: coarse)').addEventListener?.('change', () => syncTouchUi());
    window.matchMedia('(max-width: 700px)').addEventListener?.('change', () => syncTouchUi());

    bindStick(document.getElementById('touch-stick'));

    document.querySelectorAll('.touch-btn').forEach(bindHoldButton);
    bindHoldButton(document.getElementById('hud-menu-btn'));

    const dialogOverlay = document.getElementById('dialog-overlay');
    const continueBtn = document.getElementById('dialog-continue-btn');
    const dismissDialog = (e) => {
        if (!dialogOverlay || dialogOverlay.classList.contains('hidden')) return;
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        requestAdvance();
    };
    if (dialogOverlay) {
        dialogOverlay.addEventListener('pointerup', dismissDialog);
        dialogOverlay.addEventListener('click', dismissDialog);
    }
    if (continueBtn) {
        continueBtn.addEventListener('pointerup', dismissDialog);
        continueBtn.addEventListener('click', dismissDialog);
    }
}
