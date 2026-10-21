// Fresh profile must boot. A missing binding (WORLDS in the shop) throws while the
// menu is built and the sim never leaves tick 0.
// Run: node tests/freshProfileBoot.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const mem = new Map();
globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(String(k), String(v)); },
    removeItem: (k) => { mem.delete(String(k)); },
    clear: () => { mem.clear(); },
    key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; }
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const entry = html.match(/<script\s+type="module"\s+src="([^"]+)"/);
assert.ok(entry, 'index.html should load a module entry');

const main = await import(pathToFileURL(join(root, entry[1])).href);
const { state } = await import('../src/core/state.js');
const { refreshLevelSelectGrid, refreshShopButtons, initMenu } = await import('../src/ui/menu.js');
const { keys } = await import('../src/core/input.js');

assert.equal(entry[1], 'src/main.js');
assert.equal(mem.size, 0, 'fresh profile starts with empty localStorage');
assert.equal(state.maxUnlockedLevel, 0);
assert.equal(state.currentTick, 0);
assert.equal(typeof window.onload, 'function');

window.onload();
initMenu();
refreshLevelSelectGrid();
refreshShopButtons();
assert.equal(state.gameState, 'MENU');
assert.equal(state.currentTick, 0);

window.startNextAvailableLevel();
assert.equal(state.gameState, 'DIALOG', 'fresh shift opens on the briefing');
keys.enter = true;
main.stepSimulation();
keys.enter = false;
assert.equal(state.gameState, 'PLAYING');
assert.equal(state.currentTick, 0, 'briefing dismiss must not burn a tick');

const steps = 6;
for (let i = 0; i < steps; i++) main.stepSimulation();
assert.equal(state.currentTick, steps, `tick did not advance (0 -> ${state.currentTick})`);
console.log(`fresh-profile boot: no throw, tick 0 -> ${state.currentTick}`);
