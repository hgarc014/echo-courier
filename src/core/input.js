export const keys = { w: false, a: false, s: false, d: false, space: false, r: false, q: false, shift: false, f: false, c: false, esc: false };
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
};

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

export function initTouchControls() {
    let joystickEnabled = false;

    window.addEventListener('touchstart', () => {
        if (!joystickEnabled && document.getElementById('mobile-controls')) {
            document.getElementById('mobile-controls').classList.remove('hidden');
            joystickEnabled = true;
        }
    }, { once: true });

    document.querySelectorAll('.touch-btn').forEach(btn => {
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            let key = btn.getAttribute('data-key');
            pressKey(key);
            btn.style.opacity = '1.0'; btn.style.transform = 'scale(0.85)';
        }, { passive: false });

        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            let key = btn.getAttribute('data-key');
            queueRelease(key);
            btn.style.opacity = '0.5'; btn.style.transform = 'scale(1.0)';
        }, { passive: false });

        btn.addEventListener('touchcancel', () => {
            let key = btn.getAttribute('data-key');
            queueRelease(key);
            btn.style.opacity = '0.5'; btn.style.transform = 'scale(1.0)';
        });
    });
}
