// After-chamber Aspect picker. Selection is a callback only — this module does
// not write rogue meta. The run supplies its seeded, unowned draft choices.
import { COMBAT_ASPECTS } from '../rogue/aspects.js';

export const ASPECTS = COMBAT_ASPECTS;

let pending = null;

function rootEl() {
    return typeof document === 'undefined' ? null : document.getElementById('aspect-pick');
}

function applyKicker(root, kicker) {
    if (!root || typeof kicker !== 'string') return;
    const label = kicker.trim();
    if (!label || typeof root.querySelector !== 'function') return;
    const kick = root.querySelector('.aspect-pick-kicker');
    if (kick) kick.textContent = label;
}

function renderChoices(root, choices) {
    if (!root || typeof root.querySelector !== 'function') return;
    const row = root.querySelector('.aspect-pick-row');
    if (!row) return;
    row.innerHTML = choices.map(aspect => `
        <button type="button" class="aspect-card" data-aspect="${aspect.id}">
            <span class="aspect-card-name">${aspect.label}</span>
            <span class="aspect-card-detail">${aspect.detail}</span>
        </button>`).join('');
}

export function showAspectPick(onPick, kicker, choices = ASPECTS.slice(0, 3)) {
    pending = typeof onPick === 'function' ? onPick : null;
    const root = rootEl();
    if (!root) return;
    applyKicker(root, kicker);
    renderChoices(root, choices);
    root.classList.remove('hidden');
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
