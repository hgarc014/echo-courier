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

function finishBossIfNeeded() {
    if (!state.rogueChamber?.isBoss || state.rogueChamber.aspectPending) return;
    state.guards.forEach(enemy => { enemy.dead = true; });
    main.stepSimulation();
    state.rogueChamber.zone = { x: state.player.x, y: state.player.y, w: 48, h: 48 };
    main.stepSimulation();
}

function pumpToRunOver() {
    for (let i = 0; i < 200 && state.gameState !== 'RUN_OVER'; i++) main.stepSimulation();
    assert.equal(state.gameState, 'RUN_OVER');
}

release();
main.startRogueRun(1);
state.guards = [];
state.rogueChamber.director = null;
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
state.rogueChamber.director = null;
state.lasers = [];
state.cameras = [];
state.drones = [];
state.rogueChamber.type = 'timer';
state.rogueChamber.ticksLeft = 0;
state.rogueChamber.aspectPending = false;
release();
main.stepSimulation();
if (state.rogueChamber.type === 'rift' && !state.rogueChamber.aspectPending) {
    state.rogueChamber.zone = { x: state.player.x, y: state.player.y, w: 48, h: 48 };
    main.stepSimulation();
}
finishBossIfNeeded();
assert.equal(state.rogueChamber.aspectPending, true);
assert.equal(state.gameState, 'PLAYING');
chooseAspect('echo-slot');
assert.equal(state.gameState, 'PLAYING', 'Halls clear advances into Hourglass Warrens');
assert.equal(state.rogueRun.outcome, null);
assert.equal(state.rogueRun.biomeIndex, 1);
assert.equal(state.rogueRun.active, true);
state.guards = [];
state.rogueChamber.director = null;
state.lasers = [];
state.cameras = [];
state.drones = [];
state.rogueChamber.aspectPending = false;
if (state.rogueChamber.type === 'timer') state.rogueChamber.ticksLeft = 0;
else if (state.rogueChamber.type === 'wave') state.rogueChamber.enemiesLeft = 0;
else state.rogueChamber.zone = { x: state.player.x, y: state.player.y, w: 48, h: 48 };
release();
main.stepSimulation();
if (state.rogueChamber.type === 'rift' && !state.rogueChamber.aspectPending) {
    state.rogueChamber.zone = { x: state.player.x, y: state.player.y, w: 48, h: 48 };
    main.stepSimulation();
}
finishBossIfNeeded();
assert.equal(state.rogueChamber.aspectPending, true);
chooseAspect('sand-tank');
assert.equal(state.gameState, 'PLAYING', 'Warrens clear advances into Echo Courts');
assert.equal(state.rogueRun.outcome, null);
assert.equal(state.rogueRun.biomeIndex, 2);
assert.equal(state.rogueRun.active, true);
assert.equal(state.currentLevelMeta.hall, 'Echo Courts');
state.guards = [];
state.rogueChamber.director = null;
state.lasers = [];
state.cameras = [];
state.drones = [];
state.rogueChamber.aspectPending = false;
if (state.rogueChamber.type === 'timer') state.rogueChamber.ticksLeft = 0;
else if (state.rogueChamber.type === 'wave') state.rogueChamber.enemiesLeft = 0;
else state.rogueChamber.zone = { x: state.player.x, y: state.player.y, w: 48, h: 48 };
release();
main.stepSimulation();
if (state.rogueChamber.type === 'rift' && !state.rogueChamber.aspectPending) {
    state.rogueChamber.zone = { x: state.player.x, y: state.player.y, w: 48, h: 48 };
    main.stepSimulation();
}
assert.equal(state.rogueChamber.aspectPending, true);
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
