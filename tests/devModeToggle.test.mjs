// Settings "Developer Mode" toggle: always visible, shows/hides the Level Editor and
// Dev Sandbox buttons, persists in localStorage, ?dev=1 forces it on, and it never
// turns on the dev-mode progress guards or disables the shop.
// Run: node tests/devModeToggle.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

// Static markup: toggle sits outside the ?dev=1-gated box; buttons live in #dev-tools-buttons.
const gated = html.slice(html.indexOf('<div id="dev-mode-controls"'));
const gatedBox = gated.slice(0, gated.indexOf('</div>'));
assert.ok(html.includes('id="dev-tools-toggle"'), 'toggle exists');
assert.equal(gatedBox.includes('dev-tools-toggle'), false, 'toggle is not inside the ?dev=1 box');
const tools = html.slice(html.indexOf('<div id="dev-tools-buttons"'));
const toolsBox = tools.slice(0, tools.indexOf('</div>'));
assert.ok(toolsBox.includes('open-editor-btn') && toolsBox.includes('open-sandbox-btn'));

// Fresh profile.
const mem = new Map();
globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(String(k), String(v)); },
    removeItem: (k) => { mem.delete(String(k)); },
    clear: () => { mem.clear(); },
    key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; }
};

const realGet = document.getElementById;
const els = {};
function fakeEl(id, init = {}) {
    const cls = new Set();
    return Object.assign({
        id, hidden: false, checked: false, disabled: false, onchange: null, onclick: null,
        classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c), toggle(c, on) { (on ?? !cls.has(c)) ? cls.add(c) : cls.delete(c); } },
        addEventListener(type, fn) { if (type === 'click') this.onclick = fn; if (type === 'change') this.onchange = fn; }
    }, init);
}
function freshSettingsDom() {
    els['dev-tools-toggle'] = fakeEl('dev-tools-toggle');
    els['dev-tools-buttons'] = fakeEl('dev-tools-buttons', { hidden: true });
    els['dev-mode-controls'] = fakeEl('dev-mode-controls', { hidden: true });
    els['dev-mode-checkbox'] = fakeEl('dev-mode-checkbox');
    els['open-editor-btn'] = fakeEl('open-editor-btn');
    els['open-sandbox-btn'] = fakeEl('open-sandbox-btn');
    els['editor-overlay'] = fakeEl('editor-overlay');
    els['editor-overlay'].classList.add('hidden');
}
freshSettingsDom();
document.getElementById = (id) => els[id] || realGet(id);

const main = await import('../src/main.js');
const st = await import('../src/core/state.js');
const { refreshShopButtons } = await import('../src/ui/menu.js');
const { state, isDevMode, applyDevModeUi, saveProgress, recordLevelClear, DEV_TOOLS_KEY } = st;
assert.equal(DEV_TOOLS_KEY, 'echoCourier_devMode');

window.onload();
const toggle = () => els['dev-tools-toggle'];
const buttonsHidden = () => els['dev-tools-buttons'].hidden;

// 1. Visible without ?dev, off by default; editor/sandbox hidden; ?dev box hidden.
assert.equal(location.search, '');
assert.equal(toggle().hidden, false);
assert.equal(toggle().disabled, false);
assert.equal(toggle().checked, false);
assert.equal(buttonsHidden(), true);
assert.equal(els['dev-mode-controls'].hidden, true);

// 2. On shows buttons, off hides them.
toggle().checked = true; toggle().onchange();
assert.equal(buttonsHidden(), false, 'on shows editor + sandbox');
assert.equal(mem.get(DEV_TOOLS_KEY), '1');

// 3. Toggle alone is not dev mode: progress writes and the shop stay normal.
assert.equal(isDevMode(), false);
state.maxUnlockedLevel = 3;
saveProgress();
assert.equal(mem.get('echoCourier_maxLevel'), '3', 'saveProgress still writes');
recordLevelClear(3, {});
assert.ok(Number(mem.get('echoCourier_maxLevel')) >= 3);
const shopEls = { 'shop-dash': fakeEl('shop-dash', { style: {} }), 'shop-dev-note': fakeEl('shop-dev-note', { hidden: true }) };
Object.assign(els, shopEls);
refreshShopButtons();
assert.equal(els['shop-dev-note'].hidden, true, 'no dev note in shop');
assert.notEqual(els['shop-dash'].title, 'Dev mode: progress not saved');

toggle().checked = false; toggle().onchange();
assert.equal(buttonsHidden(), true, 'off hides editor + sandbox');
assert.equal(mem.get(DEV_TOOLS_KEY), '0');

// 4. Persists across reload (fresh DOM, same storage).
toggle().checked = true; toggle().onchange();
freshSettingsDom();
applyDevModeUi();
assert.equal(toggle().checked, true, 'toggle restored from storage');
assert.equal(buttonsHidden(), false);

// 5. ?dev=1 forces it on even when stored off; Unlock All stays separate.
mem.set(DEV_TOOLS_KEY, '0');
freshSettingsDom();
location.search = '?dev=1';
applyDevModeUi();
assert.equal(toggle().checked, true, '?dev=1 forces toggle on');
assert.equal(toggle().disabled, true);
assert.equal(buttonsHidden(), false);
assert.equal(els['dev-mode-controls'].hidden, false, '?dev=1 still shows the dev checkbox');
assert.equal(isDevMode(), false, '?dev=1 without the dev checkbox is not dev mode');
location.search = '';
applyDevModeUi();
assert.equal(toggle().checked, false, 'stored off again once ?dev=1 goes away');
assert.equal(isDevMode(), false);
assert.equal(mem.get('echoCourier_unlockAll') ?? '0', '0', 'toggle never touches Unlock All');

// 6. Clicking Launch Level Editor from Settings opens the editor (headless).
mem.set(DEV_TOOLS_KEY, '1');
freshSettingsDom();
window.onload();
assert.equal(buttonsHidden(), false);
assert.equal(typeof els['open-editor-btn'].onclick, 'function');
els['open-editor-btn'].onclick();
assert.equal(state.gameState, 'EDITOR', 'Launch Level Editor enters the editor');
assert.equal(els['editor-overlay'].classList.contains('hidden'), false, 'editor overlay shown');
void main;
console.log('dev-mode toggle: visible, on/off, persists, ?dev=1 forces, no progress guard, editor opens');
