// After-chamber Aspect picker. Three hardcoded boons. Selection is a callback
// only — this module does not write rogue meta. Call showAspectPick(onPick)
// with onPick(id) for 'sand-tank' | 'start-sand' | 'echo-slot'.

export const ASPECTS = Object.freeze([
    Object.freeze({ id: 'sand-tank', label: '+Sand Tank', detail: '+1s max sand' }),
    Object.freeze({ id: 'start-sand', label: '+Start Sand', detail: '+0.5s sand at the door' }),
    Object.freeze({ id: 'echo-slot', label: '+Echo Slot', detail: 'One more echo' })
]);

let pending = null;

function rootEl() {
    return typeof document === 'undefined' ? null : document.getElementById('aspect-pick');
}

export function showAspectPick(onPick) {
    pending = typeof onPick === 'function' ? onPick : null;
    const root = rootEl();
    if (root) root.classList.remove('hidden');
}

export function hideAspectPick() {
    pending = null;
    const root = rootEl();
    if (root) root.classList.add('hidden');
}

export function chooseAspect(id) {
    const cb = pending;
    pending = null;
    const root = rootEl();
    if (root) root.classList.add('hidden');
    if (cb) cb(id);
}

function aspectIdFromEvent(ev) {
    const node = ev && ev.target;
    if (!node || typeof node.closest !== 'function') return null;
    const hit = node.closest('[data-aspect]');
    return hit ? hit.getAttribute('data-aspect') : null;
}

function onClick(ev) {
    const id = aspectIdFromEvent(ev);
    if (!id) return;
    chooseAspect(id);
}

function bind() {
    const root = rootEl();
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';
    root.addEventListener('click', onClick);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
}

globalThis.showAspectPick = showAspectPick;
globalThis.hideAspectPick = hideAspectPick;
