// Death ends a Rogue Run at Run Over. Restart and the hub both come back, with Chrono Dust.
// Run: node tests/rogueRunOver.test.mjs
import assert from 'node:assert/strict';
import { main, state, keys } from './harness/replay.mjs';
import { ROGUE_META_KEY, loadRogueMeta } from '../src/rogue/rogueMeta.js';
import { chooseAspect } from '../src/ui/aspectPick.js';

localStorage.removeItem(ROGUE_META_KEY);

const dustLabels = [];
function shopBox() {
    const pts = { innerText: '' };
    dustLabels.push(pts);
    const list = { innerHTML: '', appendChild() {} };
    return {
        querySelector(sel) {
            if (sel === '.rogue-shop-points') return pts;
            if (sel === '.rogue-shop-list') return list;
            return null;
        }
    };
}
const shops = [shopBox(), shopBox()];
document.querySelectorAll = (sel) => (sel === '.rogue-shop' ? shops : []);
window.onload();

function release() {
    for (const k of Object.keys(keys)) keys[k] = false;
}

function pumpToRunOver() {
    for (let i = 0; i < 200 && state.gameState !== 'RUN_OVER'; i++) main.stepSimulation();
    assert.equal(state.gameState, 'RUN_OVER');
}

release();
main.startRogueRun(1);
state.guards = [];
assert.equal(state.gameState, 'PLAYING');
assert.equal(state.rogueRun.active, true);
assert.equal(state.sand.history.length, 0);
main.levelFailed('Fell into pit!');
assert.ok(state.failTimer > 0, 'death starts the fail hold');
assert.equal(state.rogueRun.active, true);
pumpToRunOver();
assert.equal(state.rogueRun.outcome, 'failed');
assert.equal(state.rogueRun.active, false);
assert.equal(loadRogueMeta().shopPoints, 1);
assert.deepEqual(dustLabels.map(el => el.innerText), ['CHRONO DUST: 1', 'CHRONO DUST: 1']);

window.restartRogueRun();
assert.equal(state.gameState, 'PLAYING');
assert.equal(state.rogueRun.active, true);
assert.equal(state.rogueRun.outcome, null);
state.guards = [];
state.lasers = [];
state.cameras = [];
state.drones = [];
state.rogueChamber.type = 'timer';
state.rogueChamber.ticksLeft = 0;
state.rogueChamber.aspectPending = false;
release();
main.stepSimulation();
assert.equal(state.rogueChamber.aspectPending, true);
assert.equal(state.gameState, 'PLAYING');
chooseAspect('echo-slot');
assert.equal(state.gameState, 'RUN_OVER');
assert.equal(state.rogueRun.outcome, 'cleared');
assert.equal(loadRogueMeta().shopPoints, 3, 'clear grants +2 Chrono Dust');
assert.deepEqual(dustLabels.map(el => el.innerText), ['CHRONO DUST: 3', 'CHRONO DUST: 3']);

main.returnToMenu();
assert.equal(state.gameState, 'MENU');
assert.equal(state.rogueRun, null);
window.openRogueHub();
assert.equal(state.gameState, 'MENU');
assert.deepEqual(dustLabels.map(el => el.innerText), ['CHRONO DUST: 3', 'CHRONO DUST: 3']);

window.startRogueRun();
assert.equal(state.gameState, 'PLAYING');
assert.equal(state.rogueRun.active, true);
assert.equal(typeof window.buyRogueShop, 'function');
assert.equal(window.buyRogueShop('bogus'), null);

console.log('rogueRunOver ok');
