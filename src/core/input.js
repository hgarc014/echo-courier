export const keys = { w: false, a: false, s: false, d: false, space: false, r: false, q: false, shift: false, f: false, c: false, esc: false };
export const prevKeys = { ...keys };

window.addEventListener('keydown', e => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': keys.w = true; break;
        case 'KeyA': case 'ArrowLeft': keys.a = true; break;
        case 'KeyS': case 'ArrowDown': keys.s = true; break;
        case 'KeyD': case 'ArrowRight': keys.d = true; break;
        case 'Space': keys.space = true; break;
        case 'KeyR': keys.r = true; break;
        case 'KeyQ': keys.q = true; break;
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
        case 'KeyQ': keys.q = false; break;
        case 'ShiftLeft': case 'ShiftRight': keys.shift = false; break;
        case 'KeyF': keys.f = false; break;
        case 'KeyC': keys.c = false; break;
        case 'Escape': keys.esc = false; break;
    }
});

export function isKeyJustPressed(key) { return keys[key] && !prevKeys[key]; }
export function updatePrevKeys() { Object.assign(prevKeys, keys); }

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
            if (keys.hasOwnProperty(key)) keys[key] = true;
            btn.style.opacity = '1.0'; btn.style.transform = 'scale(0.85)';
        }, { passive: false });
        
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            let key = btn.getAttribute('data-key');
            if (keys.hasOwnProperty(key)) keys[key] = false;
            btn.style.opacity = '0.5'; btn.style.transform = 'scale(1.0)';
        }, { passive: false });

        btn.addEventListener('touchcancel', () => {
            let key = btn.getAttribute('data-key');
            if (keys.hasOwnProperty(key)) keys[key] = false;
            btn.style.opacity = '0.5'; btn.style.transform = 'scale(1.0)';
        });
    });
}
